VERSION = "26.2.53"
from fastapi import FastAPI, Depends, BackgroundTasks, HTTPException, Header, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.orm import Session
import asyncio
import os
import json
import logging
import httpx
import re
from typing import List
from datetime import datetime, timedelta, time
from sqlalchemy import func
from pydantic import BaseModel
from pywebpush import webpush, WebPushException
from py_vapid import Vapid
import base64

from database import SessionLocal, init_db, TrafficEvent, TrafficEventVersion, Settings, Camera, RoadCondition, PushSubscription, ClientInterest
from mqtt_client import mqtt_client
from trafikverket import TrafikverketStream, parse_situation, get_cameras, find_nearby_cameras, parse_road_condition

# Setup logging
debug_mode = os.getenv("DEBUG_MODE", "false").lower() == "true"
logging.basicConfig(
    level=logging.DEBUG if debug_mode else logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Silence noisy libraries unless in debug mode
if not debug_mode:
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)

# Filter out frequent /api/status logs
class EndpointFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        return record.getMessage().find("/api/status") == -1

logging.getLogger("uvicorn.access").addFilter(EndpointFilter())

# Ensure data directories exist
SNAPSHOTS_DIR = os.path.join(os.getcwd(), "data", "snapshots")
ICONS_DIR = os.path.join(os.getcwd(), "data", "icons")
os.makedirs(SNAPSHOTS_DIR, exist_ok=True)
os.makedirs(ICONS_DIR, exist_ok=True)

# Defaults for fresh install
DEFAULTS = {
    "camera_radius_km": "8.0",
    "selected_counties": "1",  # Stockholm
    "mqtt_enabled": "false",
    "mqtt_host": "localhost",
    "mqtt_port": "1883",
    "mqtt_topic": "trafikinfo/traffic",
    "mqtt_rc_topic": "trafikinfo/road_conditions",
    "retention_days": "30",
    "push_notifications_enabled": "false",
    "sound_notifications_enabled": "false"
}

MDI_ICON_MAP = {
    "roadwork": "mdi:cone",
    "trafficMessage": "mdi:alert",
    "accident": "mdi:car-emergency",
    "ferry": "mdi:ferry",
    "obstacle": "mdi:sign-caution",
    "weather": "mdi:weather-partly-cloudy",
    "bridge": "mdi:bridge",
    "tunnel": "mdi:tunnel",
    "fire": "mdi:fire",
    "animal": "mdi:animal",
    "roadwork_ongoing": "mdi:cone",
    "road_closed": "mdi:road-variant-off",
    "wind": "mdi:wind-power",
    "ice": "mdi:snowflake"
}

COUNTY_MAP = {
    1: "Stockholm",
    3: "Uppsala",
    4: "Södermanland",
    5: "Östergötland",
    6: "Jönköping",
    7: "Kronoberg",
    8: "Kalmar",
    9: "Gotland",
    10: "Blekinge",
    12: "Skåne",
    13: "Halland",
    14: "Västra Götaland",
    17: "Värmland",
    18: "Örebro",
    19: "Västmanland",
    20: "Dalarna",
    21: "Gävleborg",
    22: "Västernorrland",
    23: "Jämtland",
    24: "Västerbotten",
    25: "Norrbotten"
}

# Auth Config
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin123")

class PushSubscriptionSchema(BaseModel):
    endpoint: str
    keys: dict # contains p256dh and auth
    counties: str = ""
    min_severity: int = 1
    topic_realtid: int = 1
    topic_road_condition: int = 1

app = FastAPI(title="Trafikinfo API", version="26.2.53")

class LoginRequest(BaseModel):
    password: str

def get_current_admin(x_admin_token: str = Header(None)):
    if not x_admin_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Saknar admin-token"
        )
    
    if x_admin_token != ADMIN_PASSWORD:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Ogiltigt lösenord"
        )
    
    return {"role": "admin"}

@app.post("/api/auth/login")
async def login(request: LoginRequest):
    if request.password == ADMIN_PASSWORD:
        return {"token": ADMIN_PASSWORD}
    else:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Felaktigt lösenord"
        )

@app.get("/api/auth/check")
async def check_auth(admin=Depends(get_current_admin)):
    return {"status": "ok", "user": admin}

# Serve localized media
app.mount("/api/snapshots", StaticFiles(directory=SNAPSHOTS_DIR), name="snapshots")
app.mount("/api/icons-local", StaticFiles(directory=ICONS_DIR), name="icons")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Background task tracking
stream_task = None
processor_task = None
refresh_task = None
camera_sync_task = None
camera_sync_task = None
init_cameras_task = None
tv_stream = None
rc_stream = None
rc_stream_task = None
rc_processor_task = None
icon_sync_task = None
weather_sync_task = None
cameras = []
weather_stations = []

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@app.on_event("shutdown")
async def shutdown_event():
    logger.info("Shutdown requested, stopping background tasks...")
    global stream_task, processor_task, refresh_task, init_cameras_task, tv_stream
    global rc_stream_task, rc_processor_task, rc_stream
    
    tasks = [t for t in [stream_task, processor_task, refresh_task, init_cameras_task, rc_stream_task, rc_processor_task] if t]
    if tasks:
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
    
    if tv_stream:
        tv_stream.stop_streaming()
    if rc_stream:
        rc_stream.stop_streaming()
    logger.info("Shutdown complete")

async def sync_icons():
    """Fetches and saves all available icons from Trafikverket"""
    global tv_stream
    # We need a stream instance simply to call fetch_icons, or we can just use the method if it was static, 
    # but it's an instance method using api_key. tv_stream should be initialized by start_worker.
    # We'll wait a bit to ensure tv_stream is ready
    await asyncio.sleep(2)
    
    if not tv_stream:
        logger.warning("Cannot sync icons: component not initialized")
        return

    logger.info("Syncing icons from Trafikverket...")
    try:
        icons = await tv_stream.fetch_icons()
        count = 0
        for icon in icons:
            icon_id = icon.get('Id')
            icon_url = icon.get('Url')
            
            if not icon_id or not icon_url:
                continue
                
            local_path = os.path.join(ICONS_DIR, f"{icon_id}.png")
            
            # Skip if already exists
            if os.path.exists(local_path):
                continue
                
            # Force png32x32 if possible
            if "type=" not in icon_url:
                icon_url += "?type=png32x32"
                
            try:
                async with httpx.AsyncClient() as client:
                    r = await client.get(icon_url)
                    if r.status_code == 200:
                        with open(local_path, "wb") as f:
                            f.write(r.content)
                        count += 1
            except Exception as e:
                logger.error(f"Failed to download icon {icon_id}: {e}")
                
        if count > 0:
            logger.info(f"Icon sync complete. Downloaded {count} new icons.")
        
    except Exception as e:
        logger.error(f"Error during icon sync: {e}")

async def periodic_icon_sync():
    """Background task to sync icons once per day."""
    while True:
        try:
            await sync_icons()
        except Exception as e:
            logger.error(f"Error in periodic_icon_sync: {e}")
        await asyncio.sleep(86400) # Once a day

def start_worker(api_key: str, county_ids: list = None):
    global stream_task, processor_task, refresh_task, init_cameras_task, tv_stream, cameras
    global rc_stream, rc_stream_task, rc_processor_task, weather_sync_task
    
    # Cancel all existing tasks cleanly
    tasks_to_cancel = [t for t in [stream_task, processor_task, refresh_task, init_cameras_task, rc_stream_task, rc_processor_task] if t]
    for t in tasks_to_cancel:
        t.cancel()
    
    if tv_stream:
        tv_stream.stop_streaming()
    if rc_stream:
        rc_stream.stop_streaming()
    
    # If no counties are selected (Family Model), do not start streams.
    if not county_ids:
        logger.info("No active counties selected by any client. Background workers idle.")
        return

    tv_stream = TrafikverketStream(api_key)
    
    # Start two streams: one for Situation (default) and one for RoadCondition
    rc_stream = TrafikverketStream(api_key)
    rc_stream_task = asyncio.create_task(rc_stream.start_streaming(county_ids=county_ids, object_type="RoadCondition"))
    rc_processor_task = asyncio.create_task(road_condition_processor())

    stream_task = asyncio.create_task(tv_stream.start_streaming(county_ids=county_ids))
    
    # Initialize cameras and start background refresh
    async def init_cameras():
        global cameras, refresh_task
        cameras = await get_cameras(api_key)
        logger.info(f"Loaded {len(cameras)} traffic cameras")
        refresh_task = asyncio.create_task(refresh_cameras(api_key))

    init_cameras_task = asyncio.create_task(init_cameras())
    processor_task = asyncio.create_task(event_processor())

    # Start camera sync
    global camera_sync_task, icon_sync_task
    if not camera_sync_task or camera_sync_task.done():
        camera_sync_task = asyncio.create_task(periodic_camera_sync())
    
    # Start icon sync
    if not icon_sync_task or icon_sync_task.done():
        icon_sync_task = asyncio.create_task(periodic_icon_sync())
    
    # Start weather sync
    global weather_sync_task
    if not weather_sync_task or weather_sync_task.done():
        weather_sync_task = asyncio.create_task(periodic_weather_sync())
    
    # Start dynamic county manager
    global dynamic_worker_task
    if not dynamic_worker_task or dynamic_worker_task.done():
        dynamic_worker_task = asyncio.create_task(dynamic_worker_manager(api_key))
    
    logger.info(f"Trafikinfo Flux v{VERSION} started with counties: {county_ids if county_ids else 'ALL'}")

dynamic_worker_task = None

async def dynamic_worker_manager(api_key: str):
    """Periodically check if we need to restart workers due to new subscribers or client interests."""
    current_counties = set()
    while True:
        try:
            db = SessionLocal()
            try:
                # 1. Get subscriber counties
                subs = db.query(PushSubscription).all()
                subscriber_counties = set()
                for sub in subs:
                    if sub.counties:
                        subscriber_counties.update(sub.counties.split(","))
                
                # 2. Get active client interests (Family Model)
                clients = db.query(ClientInterest).all()
                client_counties = set()
                for client in clients:
                    if client.counties:
                        client_counties.update(client.counties.split(","))

                # 3. Combine
                needed_counties = subscriber_counties.union(client_counties)
                
                # 4. If changed, restart
                if needed_counties != current_counties:
                    logger.info(f"Detected change in required counties: {current_counties} -> {needed_counties}. Restarting workers...")
                    current_counties = needed_counties
                    start_worker(api_key, list(needed_counties) if needed_counties else [])
            finally:
                db.close()
            
            await asyncio.sleep(60) # Check every minute for responsiveness
        except Exception as e:
            logger.error(f"Error in dynamic_worker_manager: {e}")
            await asyncio.sleep(60)

async def periodic_camera_sync():
    """Background task to sync cameras with DB every 5 minutes."""
    while True:
        try:
            db = SessionLocal()
            try:
                # 1. Get API Key and Selected Counties
                api_key_setting = db.query(Settings).filter(Settings.key == "api_key").first()
                if not api_key_setting or not api_key_setting.value:
                    await asyncio.sleep(30)
                    continue
                
                api_key = api_key_setting.value
                county_setting = db.query(Settings).filter(Settings.key == "selected_counties").first()
                selected_counties = [int(c.strip()) for c in county_setting.value.split(",")] if county_setting and county_setting.value else []

                # 2. Fetch from API
                new_cameras = await get_cameras(api_key)
                if not new_cameras:
                    await asyncio.sleep(60)
                    continue

                # 3. Update DB
                for cam_data in new_cameras:
                    # Only sync if in selected counties (or if no counties selected)
                    if not selected_counties or cam_data["county_no"] in selected_counties:
                        existing = db.query(Camera).filter(Camera.id == cam_data["id"]).first()
                        if existing:
                            # Update fields but preserve is_favorite
                            existing.name = cam_data["name"]
                            existing.description = cam_data["description"]
                            existing.location = cam_data["location"]
                            existing.type = cam_data["type"]
                            existing.photo_url = cam_data["url"]
                            existing.fullsize_url = cam_data["fullsize_url"]
                            existing.photo_time = datetime.fromisoformat(cam_data["photo_time"].replace('Z', '+00:00')) if cam_data["photo_time"] else None
                            existing.latitude = cam_data["latitude"]
                            existing.longitude = cam_data["longitude"]
                            existing.county_no = cam_data["county_no"]
                        else:
                            # New camera
                            new_cam = Camera(
                                id=cam_data["id"],
                                name=cam_data["name"],
                                description=cam_data["description"],
                                location=cam_data["location"],
                                type=cam_data["type"],
                                photo_url=cam_data["url"],
                                fullsize_url=cam_data["fullsize_url"],
                                photo_time=datetime.fromisoformat(cam_data["photo_time"].replace('Z', '+00:00')) if cam_data["photo_time"] else None,
                                latitude=cam_data["latitude"],
                                longitude=cam_data["longitude"],
                                county_no=cam_data["county_no"]
                            )
                            db.add(new_cam)
                
                db.commit()
                
                # Update global list for event mapping (nearest camera lookup)
                global cameras
                current_cameras = db.query(Camera).all()
                cameras = [{
                    "id": c.id,
                    "name": c.name,
                    "latitude": c.latitude,
                    "longitude": c.longitude,
                    "url": c.photo_url,
                    "fullsize_url": c.fullsize_url
                } for c in current_cameras]
                
                logger.debug(f"Synced {len(current_cameras)} cameras to DB and global cache")

            finally:
                db.close()
        except Exception as e:
            logger.error(f"Error in periodic_camera_sync: {e}")
        
        await asyncio.sleep(86400) # Every 24 hours (86400 seconds)

def deg_to_compass(num):
    val = int((num / 22.5) + .5)
    arr = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
    return arr[(val % 8)]

async def periodic_weather_sync():
    """Background task to sync weather data."""
    while True:
        try:
            db = SessionLocal()
            try:
                api_key_setting = db.query(Settings).filter(Settings.key == "api_key").first()
                if not api_key_setting or not api_key_setting.value:
                    await asyncio.sleep(30)
                    continue
                
                api_key = api_key_setting.value
                
                # Get selected counties for filtering
                counties_setting = db.query(Settings).filter(Settings.key == "selected_counties").first()
                county_ids = []
                if counties_setting and counties_setting.value:
                    county_ids = [c.strip() for c in counties_setting.value.split(",") if c.strip()]

                # 1. Sync Stations (Metadata) - only if we have few or none, or once a day
                from database import WeatherMeasurepoint
                from trafikverket import calculate_distance
                
                stations = await tv_stream.fetch_weather_stations(county_ids=county_ids)
                logger.debug(f"Fetched {len(stations) if stations else 0} weather stations.")
                if stations:
                    for s in stations:
                        sid = s.get('Id')
                        wgs84 = s.get('Geometry', {}).get('WGS84')
                        if not sid or not wgs84: continue
                        
                        match = re.search(r"\(([\d\.]+)\s+([\d\.]+)", wgs84)
                        if not match: continue
                        
                        lon = float(match.group(1))
                        lat = float(match.group(2))
                        
                        existing = db.query(WeatherMeasurepoint).filter(WeatherMeasurepoint.id == sid).first()
                        if not existing:
                            existing = WeatherMeasurepoint(id=sid)
                            db.add(existing)

                        existing.name = s.get('Name')
                        existing.latitude = lat
                        existing.longitude = lon
                        
                        # Handle CountyNo
                        c_no = s.get('CountyNo')
                        if isinstance(c_no, list) and c_no:
                            existing.county_no = c_no[0]
                        elif isinstance(c_no, int):
                            existing.county_no = c_no
                        else:
                            existing.county_no = 0

                        # Parse nested Observation
                        obs = s.get('Observation')
                        if obs:
                            # Handle Air (Temperature) robustly
                            air = obs.get('Air')
                            if isinstance(air, list) and air: air = air[0]
                            elif not isinstance(air, dict): air = {}

                            # Handle Wind robustly
                            wind = obs.get('Wind')
                            if isinstance(wind, list) and wind: wind = wind[-1]
                            elif not isinstance(wind, dict): wind = {}
                            
                            temp = air.get('Temperature', {}).get('Value')
                            w_speed = wind.get('Speed', {}).get('Value')
                            w_dir = wind.get('Direction', {}).get('Value')

                            if temp is not None: existing.air_temperature = float(temp)
                            if w_speed is not None: existing.wind_speed = float(w_speed)
                            if w_dir is not None: existing.wind_direction = deg_to_compass(float(w_dir))
                            existing.last_updated = datetime.now()
                            
                    db.commit()

                # 3. Update global cache
                global weather_stations
                current_ws = db.query(WeatherMeasurepoint).all()
                logger.debug(f"Stations in DB: {len(current_ws)}")
                weather_stations = [{
                    "id": w.id,
                    "latitude": w.latitude,
                    "longitude": w.longitude,
                    "temp": w.air_temperature,
                    "wind_speed": w.wind_speed,
                    "wind_dir": w.wind_direction
                } for w in current_ws if w.air_temperature is not None]
                
                logger.info(f"Weather sync complete: {len(weather_stations)} stations updated.")

            finally:
                db.close()
        except Exception as e:
            logger.error(f"Error in periodic_weather_sync: {e}")
        
        await asyncio.sleep(900) # Every 15 minutes

def get_nearest_weather(lat, lon, max_dist_km=20.0):
    global weather_stations
    if not lat or not lon or not weather_stations:
        return None
    
    from trafikverket import calculate_distance
    
    nearest = None
    min_dist = max_dist_km
    
    for ws in weather_stations:
        dist = calculate_distance(lat, lon, ws['latitude'], ws['longitude'])
        if dist < min_dist:
            min_dist = dist
            nearest = ws
            
    return nearest

async def refresh_cameras(api_key: str):
    # Keep legacy for stability during transition if needed
    pass

async def download_camera_snapshot(url: str, event_id: str, county_no: int, explicit_fullsize_url: str = None):
    """Download camera image and save it to the snapshots directory, organized by county."""
    if not url:
        return None
    
    # Organize snapshots by county
    target_county = str(county_no) if county_no else "0"
    county_dir = os.path.join(SNAPSHOTS_DIR, target_county)
    
    if not os.path.exists(county_dir):
        try:
            os.makedirs(county_dir, exist_ok=True)
            logger.info(f"Created snapshot directory for county {target_county}: {county_dir}")
        except Exception as e:
            logger.error(f"Failed to create snapshot directory {county_dir}: {e}")
            return None

    # Prioritize explicit fullsize URL from API
    fullsize_url = explicit_fullsize_url or url
    filename = f"{event_id}_{int(datetime.now().timestamp())}.jpg"
    relative_path = f"{county_no}/{filename}"
    filepath = os.path.join(SNAPSHOTS_DIR, relative_path)
    
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            # Try fullsize first
            logger.debug(f"Attempting to download fullsize image from {fullsize_url}")
            response = await client.get(fullsize_url)
            
            # Check if fullsize is valid (200 OK AND sufficiently large)
            is_valid_fullsize = False
            if response.status_code == 200:
                # 5KB is a very safe floor for "real" image
                if len(response.content) >= 5000:
                    is_valid_fullsize = True
                
                # Warn if suspiciously small for a fullsize image, but don't reject it if >5KB
                if len(response.content) < 15000:
                    logger.info(f"Snapshot from {fullsize_url} is small ({len(response.content)} bytes), but accepted as fullsize.")
            else:
                logger.error(f"Failed to download from {fullsize_url}: Status {response.status_code}")
            
            # Fallback to original URL if fullsize failed or was too small
            if not is_valid_fullsize and fullsize_url != url:
                logger.info(f"Fullsize image too small ({len(response.content)} bytes) or failed, falling back to base URL: {url}")
                response = await client.get(url)
            
            if response.status_code == 200:
                content_size = len(response.content)
                if content_size < 1500:
                    logger.error(f"Downloaded image for {event_id} is way too small ({content_size} bytes). Likely an error message or corrupt file. Skipping.")
                    return None
                
                if content_size < 5000:
                    logger.warning(f"Downloaded snapshot for {event_id} is fairly small ({content_size} bytes). Might be a thumbnail.")
                
                with open(filepath, "wb") as f:
                    f.write(response.content)
                
                logger.debug(f"Saved snapshot to {filepath} ({content_size} bytes)")
                return relative_path
            else:
                logger.warning(f"Failed to download snapshot from {url}: {response.status_code}")
    except Exception as e:
        logger.error(f"Error downloading snapshot for event {event_id}: {e}")
    
    return None

async def event_processor():
    global tv_stream, cameras
    try:
        async for raw_data in tv_stream.get_events():
            events = parse_situation(raw_data)
            
            # Create a new session for this batch
            db = SessionLocal()
            try:
                # Get camera radius setting
                radius_setting = db.query(Settings).filter(Settings.key == "camera_radius_km").first()
                max_dist = float(radius_setting.value) if radius_setting else 5.0
                for ev in events:
                    # Check if event already exists to decide if we need to fetch cameras
                    existing = db.query(TrafficEvent).filter(TrafficEvent.external_id == ev['external_id']).first()
                    
                    primary_cam = None
                    camera_url = None
                    camera_name = None
                    fullsize_url = None
                    extra_cameras_json = None
                    
                    # Logic to determine if we should fetch/download cameras
                    # 1. New event
                    # 2. Existing event but no extra_cameras yet
                    # 3. Location changed significantly?
                    needs_camera_sync = False
                    if not existing:
                        needs_camera_sync = True
                    else:
                        loc_changed = False
                        if ev.get('latitude') is not None and existing.latitude != ev.get('latitude'):
                            loc_changed = True
                        if ev.get('longitude') is not None and existing.longitude != ev.get('longitude'):
                            loc_changed = True
                        
                        # Check if we have missing snapshots in extra cameras
                        has_missing_extra = False
                        if existing.extra_cameras:
                            try:
                                extra_c_list = json.loads(existing.extra_cameras)
                                if any(not c.get('snapshot') for c in extra_c_list):
                                    has_missing_extra = True
                            except:
                                has_missing_extra = True

                    if needs_camera_sync:
                        # Find nearby cameras
                        nearby_cams = find_nearby_cameras(ev.get('latitude'), ev.get('longitude'), cameras, target_road=ev.get('road_number'), max_dist_km=max_dist)
                        
                        primary_cam = nearby_cams[0] if nearby_cams else None
                        camera_url = primary_cam.get('url') if primary_cam else None
                        camera_name = primary_cam.get('name') if primary_cam else None
                        fullsize_url = primary_cam.get('fullsize_url') if primary_cam else None
                        
                        # Process extra cameras
                        extra_cams_data = []
                        if len(nearby_cams) > 1:
                            for idx, c in enumerate(nearby_cams[1:]):
                                cam_url = c.get('url')
                                if not cam_url:
                                    continue
                                    
                                # Ensure we have a safe ID for the filename
                                cam_id_safe = str(c.get('id', idx)).replace(":", "_")
                                c_snap = await download_camera_snapshot(cam_url, f"{ev['external_id']}_{cam_id_safe}", ev.get('county_no', 0), c.get('fullsize_url'))
                                extra_cams_data.append({
                                    "id": c.get('id'),
                                    "name": c.get('name'),
                                    "snapshot": c_snap
                                })

                        extra_cameras_json = json.dumps(extra_cams_data) if extra_cams_data else None
                    else:
                        # Use existing camera data
                        camera_url = existing.camera_url
                        camera_name = existing.camera_name
                        extra_cameras_json = existing.extra_cameras
                        # We still need fullsize_url if we want to update the primary snapshot later
                        # but if we have existing.camera_snapshot, it won't be called.
                    
                    if existing:
                        # Check if anything significant changed before updating
                        # We compare: title, description, location, severity_code, message_type, times
                        has_changed = (
                            existing.title != ev['title'] or
                            existing.description != ev['description'] or
                            existing.location != ev['location'] or
                            existing.severity_code != ev.get('severity_code') or
                            existing.message_type != ev.get('message_type') or
                            existing.temporary_limit != ev.get('temporary_limit') or
                            existing.traffic_restriction_type != ev.get('traffic_restriction_type') or
                            (ev.get('start_time') and existing.start_time != datetime.fromisoformat(ev['start_time'])) or
                            (ev.get('end_time') and existing.end_time != datetime.fromisoformat(ev['end_time']))
                        )

                        if has_changed:
                            # Save history before updating
                            logger.debug(f"Event {ev['external_id']} changed, saving history version")
                            history_version = TrafficEventVersion(
                                event_id=existing.id,
                                external_id=existing.external_id,
                                version_timestamp=datetime.now(),
                                title=existing.title,
                                description=existing.description,
                                location=existing.location,
                                icon_id=existing.icon_id,
                                message_type=existing.message_type,
                                severity_code=existing.severity_code,
                                severity_text=existing.severity_text,
                                road_number=existing.road_number,
                                start_time=existing.start_time,
                                end_time=existing.end_time,
                                temporary_limit=existing.temporary_limit,
                                traffic_restriction_type=existing.traffic_restriction_type,
                                latitude=existing.latitude,
                                longitude=existing.longitude,
                                camera_url=existing.camera_url,
                                camera_name=existing.camera_name,
                                camera_snapshot=existing.camera_snapshot,
                                extra_cameras=existing.extra_cameras
                            )
                            db.add(history_version)

                        # Update existing event
                        existing.title = ev['title']
                        existing.description = ev['description']
                        existing.location = ev['location']
                        existing.icon_id = ev['icon_id']
                        existing.message_type = ev.get('message_type')
                        existing.severity_code = ev.get('severity_code')
                        existing.severity_text = ev.get('severity_text')
                        existing.road_number = ev.get('road_number')
                        existing.start_time = datetime.fromisoformat(ev['start_time']) if ev.get('start_time') else None
                        existing.end_time = datetime.fromisoformat(ev['end_time']) if ev.get('end_time') else None
                        existing.temporary_limit = ev.get('temporary_limit')
                        existing.traffic_restriction_type = ev.get('traffic_restriction_type')
                        
                        # Prevent wiping out coordinates if they are missing in specific update
                        if ev.get('latitude') is not None:
                            existing.latitude = ev.get('latitude')
                        if ev.get('longitude') is not None:
                            existing.longitude = ev.get('longitude')
                        
                        if has_changed:
                            existing.updated_at = datetime.now()

                        # Sync camera metadata for existing events (Only if we found a new ones)
                        if camera_url:
                            existing.camera_url = camera_url
                            existing.camera_name = camera_name
                            
                        # Sync camera metadata for existing events
                        # Sync camera metadata for existing events
                        if needs_camera_sync or (has_changed and existing.camera_url):
                            if primary_cam or existing.camera_url:
                                # Download fresh snapshot if we have a camera
                                target_url = camera_url or existing.camera_url
                                target_fullsize = fullsize_url # might be None, but download_camera_snapshot handles it
                                
                                logger.debug(f"Downloading fresh snapshot for updated event {ev['external_id']}")
                                snapshot_file = await download_camera_snapshot(target_url, ev['external_id'], ev.get('county_no', 0), target_fullsize)
                                
                                if snapshot_file:
                                    existing.camera_url = target_url
                                    existing.camera_name = camera_name or existing.camera_name
                                    existing.camera_snapshot = snapshot_file
                                    existing.extra_cameras = extra_cameras_json or existing.extra_cameras
                            else:
                                # No camera found this time and none existed
                                pass
                        else:
                            # No significant change and no sync needed
                            if camera_url and not existing.camera_snapshot:
                                existing.camera_snapshot = await download_camera_snapshot(camera_url, ev['external_id'], ev.get('county_no', 0), fullsize_url)
                        
                        existing.extra_cameras = extra_cameras_json

                        db.commit()
                        new_event = existing
                    else:
                        new_event = TrafficEvent(
                            external_id=ev['external_id'],
                            event_type=ev['event_type'],
                            title=ev['title'],
                            description=ev['description'],
                            location=ev['location'],
                            icon_id=ev['icon_id'],
                            message_type=ev.get('message_type'),
                            severity_code=ev.get('severity_code'),
                            severity_text=ev.get('severity_text'),
                            road_number=ev.get('road_number'),
                            start_time=datetime.fromisoformat(ev['start_time']) if ev.get('start_time') else None,
                            end_time=datetime.fromisoformat(ev['end_time']) if ev.get('end_time') else None,
                            temporary_limit=ev.get('temporary_limit'),
                            traffic_restriction_type=ev.get('traffic_restriction_type'),
                            latitude=ev.get('latitude'),
                            longitude=ev.get('longitude'),
                            county_no=ev.get('county_no', 0),
                            camera_url=camera_url,
                            camera_name=camera_name,
                            extra_cameras=extra_cameras_json
                        )
                        db.add(new_event)
                        db.commit()                        # Save primary snapshot
                        snapshot = None
                        if camera_url:
                            snapshot = await download_camera_snapshot(camera_url, ev['external_id'], ev.get('county_no', 0), fullsize_url)
                        
                        new_event.camera_snapshot = snapshot
                        db.commit()
                        db.refresh(new_event)

                    # MQTT & Broadcast (Unified for New & Updated)
                    mqtt_data = ev.copy()
                    
                    # Attach weather info
                    weather = get_nearest_weather(ev.get('latitude'), ev.get('longitude'))
                    if weather:
                        mqtt_data['weather'] = {
                            "temp": weather['temp'],
                            "wind_speed": weather['wind_speed'],
                            "wind_dir": weather['wind_dir']
                        }
                    else:
                        mqtt_data['weather'] = None
                    
                    # Fetch base_url for absolute links
                    base_url_setting = db.query(Settings).filter(Settings.key == "base_url").first()
                    base_url = base_url_setting.value if base_url_setting else ""

                    # 1. Sanitize Icon: Use local proxy instead of Trafikverket URL
                    # Append .png for Home Assistant compatibility
                    if ev.get('icon_id'):
                        icon_id_with_ext = f"{ev['icon_id']}.png"
                        local_icon_url = f"{base_url}/api/icons/{icon_id_with_ext}" if base_url else f"/api/icons/{icon_id_with_ext}"
                        mqtt_data['icon_url'] = local_icon_url
                        # Public fallback for users behind Basic Auth
                        mqtt_data['external_icon_url'] = f"https://api.trafikinfo.trafikverket.se/v1/icons/{ev['icon_id']}?type=png32x32"
                        # MDI Icon mapping for Home Assistant
                        mqtt_data['mdi_icon'] = MDI_ICON_MAP.get(ev['icon_id'], "mdi:alert-circle")
                    
                    # 2. Sanitize Cameras: Use local snapshots/proxies
                    # Use data from the DB to ensure consistency
                    mqtt_data['camera_name'] = new_event.camera_name
                    mqtt_data['camera_snapshot'] = new_event.camera_snapshot
                    
                    # Provide absolute snapshot URL for Home Assistant
                    if new_event.camera_snapshot and base_url:
                        mqtt_data['snapshot_url'] = f"{base_url}/api/snapshots/{new_event.camera_snapshot}"
                    else:
                        mqtt_data['snapshot_url'] = None
                        
                    # Provide Deep link to the PWA app
                    if base_url:
                        mqtt_data['event_url'] = f"{base_url}/?event_id={new_event.external_id}"
                    else:
                        mqtt_data['event_url'] = None

                    # Sanitize/Rename Trafikverket camera URL to avoid external leaks
                    mqtt_data['external_camera_url'] = new_event.camera_url
                    if 'camera_url' in mqtt_data:
                        del mqtt_data['camera_url']
                    
                    # Sanitize extra cameras
                    if new_event.extra_cameras:
                        try:
                            extra_list = json.loads(new_event.extra_cameras)
                            sanitized_extra = []
                            for c in extra_list:
                                c_data = {
                                    "id": c.get("id"),
                                    "name": c.get("name"),
                                    "snapshot": c.get("snapshot")
                                }
                                if c.get("snapshot") and base_url:
                                    c_data["snapshot_url"] = f"{base_url}/api/snapshots/{c.get('snapshot')}"
                                sanitized_extra.append(c_data)
                            mqtt_data['extra_cameras'] = json.dumps(sanitized_extra)
                        except:
                            mqtt_data['extra_cameras'] = None

                    # 4. Region & Timeout
                    mqtt_data['region'] = COUNTY_MAP.get(new_event.county_no, "Okänd region")
                    
                    if new_event.end_time:
                        now = datetime.now()
                        # Use naive comparison since both are naive (likely) or ensure both are same
                        # TrafficEvent.end_time is stored as naive in SQLite
                        diff = (new_event.end_time - now).total_seconds()
                        mqtt_data['timeout'] = int(max(0, diff))
                    else:
                        mqtt_data['timeout'] = 0

                    if mqtt_client.publish_event(mqtt_data):
                        new_event.pushed_to_mqtt = 1
                    else:
                        new_event.pushed_to_mqtt = 0
                    db.commit()

                    # Notify subscribers for NEW events only
                    if not existing:
                        await notify_subscribers(mqtt_data, db, type="event")

                    # Fetch history count
                    history_count = db.query(TrafficEventVersion).filter(TrafficEventVersion.external_id == new_event.external_id).count()
                    
                    # Broadcast to connected frontend clients
                    event_data = {
                        "id": new_event.id,
                        "external_id": new_event.external_id,
                        "title": new_event.title,
                        "description": new_event.description,
                        "location": new_event.location,
                        "icon_url": mqtt_data.get('icon_url'),
                        "created_at": new_event.created_at.isoformat(),
                        "updated_at": new_event.updated_at.isoformat() if new_event.updated_at else new_event.created_at.isoformat(),
                        "pushed_to_mqtt": bool(new_event.pushed_to_mqtt),
                        "message_type": new_event.message_type,
                        "severity_code": new_event.severity_code,
                        "severity_text": new_event.severity_text,
                        "road_number": new_event.road_number,
                        "start_time": new_event.start_time.isoformat() if new_event.start_time else None,
                        "end_time": new_event.end_time.isoformat() if new_event.end_time else None,
                        "temporary_limit": new_event.temporary_limit,
                        "traffic_restriction_type": new_event.traffic_restriction_type,
                        "latitude": new_event.latitude,
                        "longitude": new_event.longitude,
                        "camera_url": new_event.camera_url,
                        "camera_name": new_event.camera_name,
                        "camera_snapshot": new_event.camera_snapshot,
                        "extra_cameras": json.loads(new_event.extra_cameras) if new_event.extra_cameras else [],
                        "history_count": history_count,
                        "weather": mqtt_data.get('weather')
                    }
                    for queue in connected_clients:
                        await queue.put(event_data)

                    db.commit()
            except Exception as e:
                logger.error(f"Error processing events: {e}")
            finally:
                db.close()
    except asyncio.CancelledError:
        logger.debug("Event processor cancelled")
    except Exception as e:
    	logger.error(f"Event processor error: {e}")

async def road_condition_processor():
    global rc_stream, cameras
    try:
        async for raw_data in rc_stream.get_events():
            conditions = parse_road_condition(raw_data)
            
            db = SessionLocal()
            try:
                # Get camera radius setting
                radius_setting = db.query(Settings).filter(Settings.key == "camera_radius_km").first()
                max_dist = float(radius_setting.value) if radius_setting else 5.0

                for rc in conditions:
                    # Sync with DB
                    existing = db.query(RoadCondition).filter(RoadCondition.id == rc['id']).first()
                    
                    # DEDUPLICATION: Check for semantic match (Same Road + Condition + County + StartTime)
                    # This prevents duplicates when Trafikverket rotates IDs
                    if not existing:
                        query = db.query(RoadCondition).filter(
                            RoadCondition.road_number == rc.get('road_number'),
                            RoadCondition.condition_code == rc['condition_code'],
                            RoadCondition.county_no == rc.get('county_no')
                        )
                        if rc.get('start_time'):
                            st = datetime.fromisoformat(rc['start_time'])
                            query = query.filter(RoadCondition.start_time == st)
                        
                        semantic_match = query.first()
                        if semantic_match:
                            logger.info(f"deduplication: Matched incoming RC {rc['id']} to existing {semantic_match.id}")
                            existing = semantic_match

                    camera_url = None
                    camera_name = None
                    camera_snapshot = None
                    
                    # Camera matching logic (same as events)
                    needs_camera_sync = False
                    if not existing:
                        needs_camera_sync = True
                    else:
                        # Re-check if location changed
                        if (rc.get('latitude') and existing.latitude != rc.get('latitude')) or \
                           (rc.get('longitude') and existing.longitude != rc.get('longitude')):
                            needs_camera_sync = True
                            
                    if needs_camera_sync:
                         nearby_cams = find_nearby_cameras(rc.get('latitude'), rc.get('longitude'), cameras, target_road=rc.get('road_number'), max_dist_km=max_dist)
                         if nearby_cams:
                             primary = nearby_cams[0]
                             camera_url = primary.get('url')
                             camera_name = primary.get('name')
                             
                             # Download snapshot
                             if camera_url:
                                 target_id = existing.id if existing else rc['id']
                                 fullsize_url = primary.get('fullsize_url')
                                 camera_snapshot = await download_camera_snapshot(camera_url, f"rc_{target_id}", rc.get('county_no', 0), fullsize_url)

                    final_rc = None
                    if existing:
                        existing.condition_code = rc['condition_code']
                        existing.condition_text = rc['condition_text']
                        existing.measure = rc['measure']
                        existing.warning = rc['warning']
                        existing.cause = rc.get('cause') 
                        existing.location_text = rc.get('location_text')
                        existing.icon_id = rc.get('icon_id') 
                        existing.road_number = rc.get('road_number')
                        existing.start_time = datetime.fromisoformat(rc['start_time']) if rc.get('start_time') else None
                        existing.end_time = datetime.fromisoformat(rc['end_time']) if rc.get('end_time') else None
                        existing.timestamp = datetime.fromisoformat(rc['timestamp']) if rc.get('timestamp') else datetime.now()
                        
                        if needs_camera_sync and camera_url:
                            existing.camera_url = camera_url
                            existing.camera_name = camera_name
                            existing.camera_snapshot = camera_snapshot

                        db.commit()
                        final_rc = existing
                    else:
                        new_rc = RoadCondition(
                            id=rc['id'],
                            condition_code=rc['condition_code'],
                            condition_text=rc['condition_text'],
                            measure=rc['measure'],
                            warning=rc['warning'],
                            cause=rc.get('cause'), 
                            location_text=rc.get('location_text'),
                            icon_id=rc.get('icon_id'), 
                            road_number=rc.get('road_number'),
                            start_time=datetime.fromisoformat(rc['start_time']) if rc.get('start_time') else None,
                            end_time=datetime.fromisoformat(rc['end_time']) if rc.get('end_time') else None,
                            latitude=rc.get('latitude'),
                            longitude=rc.get('longitude'),
                            county_no=rc.get('county_no'),
                            timestamp=datetime.fromisoformat(rc['timestamp']) if rc.get('timestamp') else datetime.now(),
                            camera_url=camera_url,
                            camera_name=camera_name,
                            camera_snapshot=camera_snapshot
                        )
                        db.add(new_rc)
                        db.commit()
                        final_rc = new_rc
                    
                    # Prepare data for broadcast
                    icon_url = None
                    base_url_setting = db.query(Settings).filter(Settings.key == "base_url").first()
                    base_url = base_url_setting.value if base_url_setting else ""
                    
                    if rc.get('icon_id'):
                        icon_id_with_ext = f"{rc['icon_id']}.png"
                        icon_url = f"{base_url}/api/icons/{icon_id_with_ext}" if base_url else f"/api/icons/{icon_id_with_ext}"

                    # Attach weather info
                    weather = get_nearest_weather(final_rc.latitude, final_rc.longitude)
                    weather_data = None
                    if weather:
                        weather_data = {
                            "temp": weather['temp'],
                            "wind_speed": weather['wind_speed'],
                            "wind_dir": weather['wind_dir']
                        }

                    # Normalize camera URL for output (Frontend & MQTT)
                    out_camera_url = None
                    if final_rc.camera_snapshot:
                         out_camera_url = f"{base_url}/api/snapshots/{final_rc.camera_snapshot}" if base_url else f"/api/snapshots/{final_rc.camera_snapshot}"
                    
                    condition_data = {
                        "event_type": "RoadCondition",
                        "id": final_rc.id,
                        "condition_code": final_rc.condition_code,
                        "condition_text": final_rc.condition_text,
                        "measure": final_rc.measure,
                        "warning": final_rc.warning,
                        "cause": final_rc.cause,
                        "location_text": final_rc.location_text,
                        "icon_id": final_rc.icon_id,
                        "icon_url": icon_url,
                        "road_number": final_rc.road_number,
                        "start_time": final_rc.start_time.isoformat() if final_rc.start_time else None,
                        "end_time": final_rc.end_time.isoformat() if final_rc.end_time else None,
                        "latitude": final_rc.latitude,
                        "longitude": final_rc.longitude,
                        "county_no": final_rc.county_no,
                        "camera_url": out_camera_url, # Points to local snapshot
                        "camera_name": final_rc.camera_name,
                        "camera_snapshot": final_rc.camera_snapshot,
                        "timestamp": final_rc.timestamp.isoformat() if final_rc.timestamp else None,
                        "weather": weather_data
                    }
                    
                    # Notify subscribers for NEW/UPDATED road conditions with warnings
                    if final_rc.warning:
                        # Fetch base_url for consistency
                        await notify_subscribers(condition_data, db, type="road_condition")

                    # Broadcast to connected clients 
                    for queue in connected_clients:
                         await queue.put(condition_data)
                    
                    # Publish to MQTT if enabled
                    mqtt_rc_enabled_setting = db.query(Settings).filter(Settings.key == "mqtt_rc_enabled").first()
                    mqtt_rc_enabled = mqtt_rc_enabled_setting.value == "true" if mqtt_rc_enabled_setting else False
                    
                    if mqtt_rc_enabled:
                         mqtt_rc_topic_setting = db.query(Settings).filter(Settings.key == "mqtt_rc_topic").first()
                         mqtt_rc_topic = mqtt_rc_topic_setting.value if mqtt_rc_topic_setting else "trafikinfo/road_conditions"
                         
                         try:
                             mqtt_payload = condition_data.copy()
                             # Add requested fields
                             mqtt_payload['county_no'] = final_rc.county_no
                             import json
                             mqtt_client.publish(mqtt_rc_topic, json.dumps(mqtt_payload, default=str))
                         except Exception as e:
                             logger.error(f"Failed to publish road condition to MQTT: {e}")

            except Exception as e:
                logger.error(f"Error processing road condition batch: {e}")
            finally:
                db.close()

    except asyncio.CancelledError:
        logger.debug("RoadCondition processor cancelled")
    except Exception as e:
        logger.error(f"RoadCondition processor error: {e}")

# Global list of connected SSE clients
connected_clients = []

@app.get("/api/stream")
async def stream_events():
    queue = asyncio.Queue()
    connected_clients.append(queue)
    
    async def event_generator():
        try:
            while True:
                data = await queue.get()
                yield json.dumps(data)
        except asyncio.CancelledError:
            connected_clients.remove(queue)

    from sse_starlette.sse import EventSourceResponse
    return EventSourceResponse(event_generator())


@app.get("/api/events/{external_id}/history")
async def get_event_history(external_id: str, db: Session = Depends(get_db)):
    versions = db.query(TrafficEventVersion).filter(TrafficEventVersion.external_id == external_id).order_by(TrafficEventVersion.version_timestamp.desc()).all()
    
    result = []
    for v in versions:
        # Sanitize extra cameras: remove external URLs
        extra_cams = []
        if v.extra_cameras:
            try:
                raw_extra = json.loads(v.extra_cameras)
                for c in raw_extra:
                    extra_cams.append({
                        "id": c.get("id"),
                        "name": c.get("name"),
                        "snapshot": c.get("snapshot")
                    })
            except:
                pass

        result.append({
            "id": v.id,
            "external_id": v.external_id,
            "version_timestamp": v.version_timestamp,
            "title": v.title,
            "description": v.description,
            "location": v.location,
            "icon_url": f"/api/icons/{v.icon_id}" if v.icon_id else None,
            "message_type": v.message_type,
            "severity_code": v.severity_code,
            "severity_text": v.severity_text,
            "road_number": v.road_number,
            "start_time": v.start_time,
            "end_time": v.end_time,
            "temporary_limit": v.temporary_limit,
            "traffic_restriction_type": v.traffic_restriction_type,
            "latitude": v.latitude,
            "longitude": v.longitude,
            "camera_snapshot": v.camera_snapshot,
            "extra_cameras": extra_cams
        })
    return result

@app.get("/api/cameras")
@app.get("/api/cameras")
def get_cameras_api(
    only_favorites: bool = False, 
    limit: int = 24, 
    offset: int = 0, 
    search: str = None,
    is_favorite: bool = None,
    db: Session = Depends(get_db)
):
    # Get selected counties from settings
    county_setting = db.query(Settings).filter(Settings.key == "selected_counties").first()
    selected_counties = [int(c.strip()) for c in county_setting.value.split(",")] if county_setting and county_setting.value else []
    
    # Base query for all relevant cameras in selected counties
    base_query = db.query(Camera)
    if selected_counties:
        base_query = base_query.filter(Camera.county_no.in_(selected_counties))
        
    # Apply search filter across all records if provided
    if search:
        search_filter = f"%{search}%"
        base_query = base_query.filter(
            (Camera.name.ilike(search_filter)) | 
            (Camera.location.ilike(search_filter)) |
            (Camera.description.ilike(search_filter))
        )

    # Calculate metadata before pagination
    total_count = base_query.count()
    fav_count = base_query.filter(Camera.is_favorite == 1).count()

    # If only_favorites is requested, legacy-style return but with counts
    if only_favorites:
        favorites = base_query.filter(Camera.is_favorite == 1).order_by(Camera.name.asc()).all()
        fav_list = []
        for c in favorites:
            weather = get_nearest_weather(c.latitude, c.longitude)
            fav_list.append({
                "id": c.id, "name": c.name, "description": c.description, "location": c.location,
                "type": c.type, 
                "proxy_url": f"/api/cameras/{c.id}/image",
                "photo_time": c.photo_time, "latitude": c.latitude, "longitude": c.longitude,
                "county_no": c.county_no, "is_favorite": True,
                "weather": {
                    "temp": weather['temp'],
                    "wind_speed": weather['wind_speed'],
                    "wind_dir": weather['wind_dir']
                } if weather else None
            })
        return {
            "favorites": fav_list,
            "favorites_count": fav_count,
            "total_count": total_count,
            "other_count": total_count - fav_count
        }

    # Applied specific favorite filter if provided (for targeted fetches)
    if is_favorite is not None:
        base_query = base_query.filter(Camera.is_favorite == (1 if is_favorite else 0))

    # Order and Paginate
    # Default order: favorites first, then name
    query = base_query.order_by(Camera.is_favorite.desc(), Camera.name.asc())
    cameras_list = query.offset(offset).limit(limit).all()

    result = []
    for cam in cameras_list:
        # Get weather for each camera
        weather = get_nearest_weather(cam.latitude, cam.longitude)
        
        result.append({
            "id": cam.id,
            "name": cam.name,
            "description": cam.description,
            "location": cam.location,
            "type": cam.type,
            "proxy_url": f"/api/cameras/{cam.id}/image",
            "photo_time": cam.photo_time.isoformat() if cam.photo_time else None,
            "latitude": cam.latitude,
            "longitude": cam.longitude,
            "county_no": cam.county_no,
            "is_favorite": bool(cam.is_favorite),
            "weather": {
                "temp": weather['temp'],
                "wind_speed": weather['wind_speed'],
                "wind_dir": weather['wind_dir']
            } if weather else None
        })
    
    return {
        "total_count": total_count,
        "limit": limit,
        "offset": offset,
        "cameras": result,
        "has_more": (offset + limit) < total_count
    }

@app.post("/api/cameras/{camera_id}/toggle-favorite")
def toggle_camera_favorite(camera_id: str, db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    cam = db.query(Camera).filter(Camera.id == camera_id).first()
    if not cam:
        raise HTTPException(status_code=404, detail="Camera not found")
    
    cam.is_favorite = 0 if cam.is_favorite else 1
    db.commit()
    return {"id": cam.id, "is_favorite": bool(cam.is_favorite)}

@app.get("/api/icons/{icon_id}")
async def proxy_icon(icon_id: str):
    # Handle requests with .png extension (Home Assistant requirement)
    if icon_id.endswith(".png"):
        icon_id = icon_id[:-4]
        
    icon_filename = f"{icon_id}.png"
    icon_path = os.path.join(ICONS_DIR, icon_filename)
    
    # Return local if exists
    if os.path.exists(icon_path):
        return FileResponse(icon_path, media_type="image/png")
        
    # Otherwise fetch and save
    url = f"https://api.trafikinfo.trafikverket.se/v1/icons/{icon_id}?type=png32x32"
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(url)
            if response.status_code == 200:
                with open(icon_path, "wb") as f:
                    f.write(response.content)
                return FileResponse(icon_path, media_type="image/png")
    except Exception as e:
        logger.error(f"Error proxying icon {icon_id}: {e}")
        
    raise HTTPException(status_code=404, detail="Icon not found")

@app.get("/api/cameras/{camera_id}/image")
async def proxy_camera_image(camera_id: str, fullsize: bool = False):
    # Manually manage DB session to avoid holding connection during stream
    db = SessionLocal()
    try:
        camera = db.query(Camera).filter(Camera.id == camera_id).first()
        if not camera:
            raise HTTPException(status_code=404, detail="Camera not found")
        
        url = camera.fullsize_url if (fullsize and camera.fullsize_url) else camera.photo_url
        if not url:
            raise HTTPException(status_code=404, detail="No image URL available")
    finally:
        db.close()
        
    async def stream_image():
        async with httpx.AsyncClient(timeout=10.0) as client:
            try:
                async with client.stream("GET", url) as response:
                    if response.status_code != 200:
                        yield b""
                        return
                    async for chunk in response.aiter_bytes():
                        yield chunk
            except Exception as e:
                logger.error(f"Error proxying camera {camera_id}: {e}")
                yield b""

    return StreamingResponse(stream_image(), media_type="image/jpeg")

@app.get("/api/events", response_model=List[dict])
def get_events(limit: int = 50, offset: int = 0, hours: int = None, date: str = None, counties: str = None, type: str = "realtid", db: Session = Depends(get_db)):
    query = db.query(TrafficEvent)
    
    # Filter by counties if provided (comma separated)
    if counties:
        try:
            county_list = [int(c.strip()) for c in counties.split(",") if c.strip().isdigit()]
            if county_list:
                query = query.filter(TrafficEvent.county_no.in_(county_list))
        except Exception as e:
            logger.error(f"Error parsing counties filter: {e}")
    
    # Check if we should filter for "active" events only
    # Main feed (no params) -> Active only
    # History view (hours provided) -> All events in window
    # Search view (date provided) -> All events on date
    
    if date:
        try:
            target_date = datetime.strptime(date, "%Y-%m-%d")
            day_start = datetime.combine(target_date.date(), time.min)
            day_end = datetime.combine(target_date.date(), time.max)
            logger.info(f"Day range for filter: {day_start} to {day_end}")
            # Find events created on this day
            query = query.filter(TrafficEvent.created_at >= day_start).filter(TrafficEvent.created_at <= day_end)
        except ValueError as e:
            logger.error(f"Invalid date format: {date}. Error: {e}")
    else:
        # If 'hours' is NOT provided, it's the main feed (Realtid or Planerat)
        # If 'hours' IS provided (even 0 for all history), we show everything (including expired)
        if hours is None:
            now = datetime.now()
            # Common filter: Not expired
            query = query.filter((TrafficEvent.end_time == None) | (TrafficEvent.end_time > now))
            
            # Type-specific filters
            if type == "planned":
                # Upcoming (start in future) OR Long-term (duration >= 5 days)
                query = query.filter(
                    (TrafficEvent.start_time > now) | 
                    ((TrafficEvent.end_time != None) & (func.julianday(TrafficEvent.end_time) - func.julianday(TrafficEvent.start_time) >= 5))
                )
            else: # realtid (default)
                # Started AND (End is NULL OR Duration < 5 days)
                query = query.filter(TrafficEvent.start_time <= now)
                query = query.filter(
                    (TrafficEvent.end_time == None) | 
                    (func.julianday(TrafficEvent.end_time) - func.julianday(TrafficEvent.start_time) < 5)
                )
        
        # Apply time window if specified (hours > 0)
        # If hours=0 (All History), no cutoff is applied
        if hours and hours > 0:
            cutoff = datetime.now() - timedelta(hours=hours)
            query = query.filter(TrafficEvent.created_at >= cutoff)
        
    events = query.order_by(TrafficEvent.updated_at.desc(), TrafficEvent.created_at.desc()).offset(offset).limit(limit).all()
    
    # Batch fetch history counts to avoid N+1 queries
    external_ids = [e.external_id for e in events]
    history_counts = {}
    if external_ids:
        h_counts = db.query(TrafficEventVersion.external_id, func.count(TrafficEventVersion.id))\
                    .filter(TrafficEventVersion.external_id.in_(external_ids))\
                    .group_by(TrafficEventVersion.external_id).all()
        history_counts = {ext_id: count for ext_id, count in h_counts}

    result = []
    for e in events:
        # Sanitize extra cameras: remove external URLs
        extra_cams = []
        if e.extra_cameras:
            try:
                raw_extra = json.loads(e.extra_cameras)
                for c in raw_extra:
                    extra_cams.append({
                        "id": c.get("id"),
                        "name": c.get("name"),
                        "snapshot": c.get("snapshot")
                    })
            except:
                pass

        result.append({
            "id": e.id,
            "external_id": e.external_id,
            "title": e.title,
            "description": e.description,
            "location": e.location,
            "icon_url": f"/api/icons/{e.icon_id}" if e.icon_id else None,
            "created_at": e.created_at,
            "updated_at": e.updated_at,
            "pushed_to_mqtt": bool(e.pushed_to_mqtt),
            "message_type": e.message_type,
            "severity_code": e.severity_code,
            "severity_text": e.severity_text,
            "road_number": e.road_number,
            "start_time": e.start_time,
            "end_time": e.end_time,
            "temporary_limit": e.temporary_limit,
            "traffic_restriction_type": e.traffic_restriction_type,
            "latitude": e.latitude,
            "longitude": e.longitude,
            "county_no": e.county_no,
            "camera_snapshot": e.camera_snapshot,
            "extra_cameras": extra_cams,
            "history_count": history_counts.get(e.external_id, 0)
        })
    return result


@app.get("/api/road-conditions")
def get_road_conditions(county_no: str = None, limit: int = 100, offset: int = 0, db: Session = Depends(get_db)):
    query = db.query(RoadCondition)
    
    # Filter by configured counties by default for consistency
    county_setting = db.query(Settings).filter(Settings.key == "selected_counties").first()
    selected_counties = [int(c.strip()) for c in county_setting.value.split(",")] if county_setting and county_setting.value else []
    
    if county_no:
        # Support comma-separated list of counties
        try:
            req_counties = [int(c.strip()) for c in str(county_no).split(",") if c.strip().isdigit()]
            if req_counties:
                query = query.filter(RoadCondition.county_no.in_(req_counties))
        except:
            pass
    elif selected_counties:
        query = query.filter(RoadCondition.county_no.in_(selected_counties))
        
    conditions = query.order_by(RoadCondition.timestamp.desc()).offset(offset).limit(limit).all()
    
    # Need base_url for timestamps
    base_url_setting = db.query(Settings).filter(Settings.key == "base_url").first()
    base_url = base_url_setting.value if base_url_setting else ""
    
    return [{
        "id": c.id,
        "condition_code": c.condition_code,
        "condition_text": c.condition_text,
        "measure": c.measure,
        "warning": c.warning,
        "cause": c.cause,
        "location_text": c.location_text,
        "road_number": c.road_number,
        "start_time": c.start_time,
        "end_time": c.end_time,
        "latitude": c.latitude,
        "longitude": c.longitude,
        "county_no": c.county_no,
        "timestamp": c.timestamp,
        "camera_snapshot": c.camera_snapshot,
        "camera_name": c.camera_name,
        "snapshot_url": f"/api/snapshots/{c.camera_snapshot}" if c.camera_snapshot else None,
        "camera_url": f"{base_url}/api/snapshots/{c.camera_snapshot}" if base_url and c.camera_snapshot else (f"/api/snapshots/{c.camera_snapshot}" if c.camera_snapshot else None),
        "icon_id": c.icon_id,
        "icon_url": f"/api/icons/{c.icon_id}.png" if c.icon_id else None
    } for c in conditions]

@app.get("/api/stats")
def get_stats(hours: int = None, date: str = None, db: Session = Depends(get_db)):
    from datetime import datetime, timedelta, time
    
    if date:
        try:
            target_date = datetime.strptime(date, "%Y-%m-%d").date()
            start_time = datetime.combine(target_date, time.min)
            end_time = datetime.combine(target_date, time.max)
        except ValueError:
            return JSONResponse(status_code=400, content={"message": "Invalid date format. Use YYYY-MM-DD"})
    elif hours:
        start_time = datetime.now() - timedelta(hours=hours)
        end_time = datetime.now()
    else:
        # Default to Today from midnight
        start_time = datetime.combine(datetime.now().date(), time.min)
        end_time = datetime.now()
    
    # Base query for time range
    base_query = db.query(TrafficEvent).filter(
        TrafficEvent.created_at >= start_time,
        TrafficEvent.created_at <= end_time
    )
    
    # Total count
    total_events = base_query.count()
    
    # Count by Message Type
    type_counts = db.query(TrafficEvent.message_type, func.count(TrafficEvent.id))\
        .filter(TrafficEvent.created_at >= start_time, TrafficEvent.created_at <= end_time)\
        .group_by(TrafficEvent.message_type).all()
        
    # Count by Severity
    severity_counts = db.query(TrafficEvent.severity_text, func.count(TrafficEvent.id))\
        .filter(TrafficEvent.created_at >= start_time, TrafficEvent.created_at <= end_time)\
        .group_by(TrafficEvent.severity_text).all()
        
    # Events over time (grouped by hour)
    events = base_query.with_entities(TrafficEvent.created_at).all()
    
    timeline = {}
    for e in events:
        key = e.created_at.strftime("%Y-%m-%d %H:00")
        timeline[key] = timeline.get(key, 0) + 1
        
    sorted_timeline = [{"time": k, "count": v} for k, v in sorted(timeline.items())]

    return {
        "total": total_events,
        "by_type": [{"name": t[0] or "Okänd", "value": t[1]} for t in type_counts],
        "by_severity": [{"name": s[0] or "Okänd", "value": s[1]} for s in severity_counts],
        "timeline": sorted_timeline,
        "date": date or datetime.now().strftime("%Y-%m-%d")
    }

@app.post("/api/settings")
async def update_settings(settings: dict, db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    try:
        for k, v in settings.items():
            # Convert value to string to ensure compatibility with Settings model
            str_value = str(v) if v is not None else ""
            
            s = db.query(Settings).filter(Settings.key == k).first()
            if s:
                s.value = str_value
            else:
                s = Settings(key=k, value=str_value)
                db.add(s)
        db.commit()
        
        if "api_key" in settings or "selected_counties" in settings:
            # Re-fetch both to restart properly
            curr_key = db.query(Settings).filter(Settings.key == "api_key").first()
            
            api_key = curr_key.value if curr_key else ""
            
            # Start dynamic county manager (Family Model)
            global dynamic_worker_task
            if not dynamic_worker_task or dynamic_worker_task.done():
                dynamic_worker_task = asyncio.create_task(dynamic_worker_manager(api_key))
            
            if not api_key:
                logger.warning("No API key found in settings. Workers will not start until configured.")
            else:
                # The dynamic_worker_manager will call start_worker with the correct counties
                # We need to call it once here to initialize everything
                curr_counties = db.query(Settings).filter(Settings.key == "selected_counties").first()
                county_ids = ["1", "4"]
                if curr_counties and curr_counties.value:
                    county_ids = curr_counties.value.split(",")
                start_worker(api_key, county_ids)
        
        # Update MQTT config if any related setting changed
        mqtt_updates = {}
        if "mqtt_enabled" in settings: mqtt_updates["enabled"] = str(settings["mqtt_enabled"]).lower() == "true"
        if "mqtt_host" in settings: mqtt_updates["host"] = str(settings["mqtt_host"])
        if "mqtt_port" in settings: mqtt_updates["port"] = int(settings["mqtt_port"])
        if "mqtt_username" in settings: mqtt_updates["username"] = str(settings["mqtt_username"])
        if "mqtt_password" in settings: mqtt_updates["password"] = str(settings["mqtt_password"])
        if "mqtt_topic" in settings: mqtt_updates["topic"] = str(settings["mqtt_topic"])
        
        if mqtt_updates:
            mqtt_client.update_config(mqtt_updates)
            
        return {"status": "ok"}
    except Exception as e:
        logger.error(f"Error updating settings: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/report-base-url")
async def report_base_url(payload: dict, db: Session = Depends(get_db)):
    """Automatically update the base_url from frontend origin."""
    base_url = payload.get("base_url")
    if not base_url:
        raise HTTPException(status_code=400, detail="Missing base_url")
        
    # Store in Settings
    existing = db.query(Settings).filter(Settings.key == "base_url").first()
    if existing:
        if existing.value != base_url:
            logger.info(f"Updating base_url: {existing.value} -> {base_url}")
            existing.value = base_url
            db.commit()
    else:
        logger.info(f"Setting initial base_url: {base_url}")
        db.add(Settings(key="base_url", value=base_url))
        db.commit()
        
    return {"status": "ok", "base_url": base_url}

# Mount snapshots directory
app.mount("/api/snapshots", StaticFiles(directory=SNAPSHOTS_DIR), name="snapshots")

def get_vapid_keys(db: Session):
    private_key_setting = db.query(Settings).filter(Settings.key == "vapid_private_key").first()
    public_key_setting = db.query(Settings).filter(Settings.key == "vapid_public_key").first()
    
    # Check if keys exist and are valid (PEM format)
    needs_generation = False
    
    clean_private_pem = None
    clean_public_b64 = None

    if not private_key_setting or not public_key_setting or not private_key_setting.value:
        needs_generation = True
    else:
        # Validate that the private key is actually parseable
        try:
            from cryptography.hazmat.primitives import serialization
            
            # CRITICAL FIX: Strip ANY whitespace/newlines/CR that could mangle ASN.1
            raw_val = private_key_setting.value
            pem_data = raw_val.strip().replace("\r", "")
            if isinstance(pem_data, str):
                pem_data = pem_data.encode('utf-8')
                
            private_key = serialization.load_pem_private_key(
                pem_data,
                password=None
            )
            
            # RE-SERIALIZE to standard PKCS8 (consistent format)
            clean_private_pem = private_key.private_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PrivateFormat.PKCS8,
                encryption_algorithm=serialization.NoEncryption()
            ).decode('utf-8')
            
            # If the re-serialized version is drastically different from what's in DB (e.g. was SEC1), save it back!
            if clean_private_pem.strip() != raw_val.strip():
                logger.info("Updating VAPID private key in DB with normalized PKCS8 format.")
                private_key_setting.value = clean_private_pem
                db.commit()
            
            clean_public_b64 = public_key_setting.value.strip()
            
        except Exception as e:
            logger.warning(f"Detected invalid/corrupt VAPID private key: {e}. Regenerating...")
            needs_generation = True
        
    if needs_generation:
        from cryptography.hazmat.primitives import serialization
        from cryptography.hazmat.primitives.asymmetric import ec
        import base64
        
        logger.info("Generating new VAPID keys...")
        pk = ec.generate_private_key(ec.SECP256R1())
        
        # VAPID private key in standard PKCS8 format
        clean_private_pem = pk.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption()
        ).decode('utf-8')
        
        # Public key for VAPID is the 65-byte uncompressed point (0x04 + X + Y)
        public_key_bytes = pk.public_key().public_bytes(
            encoding=serialization.Encoding.X962,
            format=serialization.PublicFormat.UncompressedPoint
        )
        
        # Use URL-safe Base64 without padding for the public key string (client-side requirement)
        clean_public_b64 = base64.urlsafe_b64encode(public_key_bytes).decode('utf-8').rstrip('=')
        
        if not private_key_setting:
            private_key_setting = Settings(key="vapid_private_key", value=clean_private_pem)
            db.add(private_key_setting)
        else:
            private_key_setting.value = clean_private_pem
            
        if not public_key_setting:
            public_key_setting = Settings(key="vapid_public_key", value=clean_public_b64)
            db.add(public_key_setting)
        else:
            public_key_setting.value = clean_public_b64
            
        db.commit()
        logger.info("VAPID keys generated/updated successfully.")
        
    return clean_private_pem, clean_public_b64

@app.get("/api/push/vapid-public-key")
def get_vapid_public_key(db: Session = Depends(get_db)):
    _, public_key = get_vapid_keys(db)
    return {"public_key": public_key}

@app.post("/api/push/subscribe")
def subscribe(subscription: PushSubscriptionSchema, db: Session = Depends(get_db)):
    existing = db.query(PushSubscription).filter(PushSubscription.endpoint == subscription.endpoint).first()
    if existing:
        existing.p256dh = subscription.keys.get('p256dh')
        existing.auth = subscription.keys.get('auth')
        existing.counties = subscription.counties
        existing.min_severity = subscription.min_severity
        existing.topic_realtid = subscription.topic_realtid
        existing.topic_road_condition = subscription.topic_road_condition
    else:
        new_sub = PushSubscription(
            endpoint=subscription.endpoint,
            p256dh=subscription.keys.get("p256dh"),
            auth=subscription.keys.get("auth"),
            counties=subscription.counties,
            min_severity=subscription.min_severity,
            topic_realtid=subscription.topic_realtid,
            topic_road_condition=subscription.topic_road_condition
        )
        db.add(new_sub)
    db.commit()
    return {"status": "ok", "count": db.query(PushSubscription).count()}

class ClientInterestRequest(BaseModel):
    client_id: str
    counties: str

@app.post("/api/client/interest")
async def register_client_interest(payload: ClientInterestRequest, db: Session = Depends(get_db)):
    """Register user's current county interest (Family Model)"""
    try:
        interest = db.query(ClientInterest).filter(ClientInterest.client_id == payload.client_id).first()
        if interest:
            interest.counties = payload.counties
            interest.last_active = datetime.utcnow()
        else:
            interest = ClientInterest(client_id=payload.client_id, counties=payload.counties)
            db.add(interest)
        
        db.commit()
        logger.info(f"Client {payload.client_id} interested in: {payload.counties}")
        
        # Trigger worker check immediately (optional but nice for responsiveness)
        # We can't easily trigger the loop but it runs every 5 min. 
        # For immediate response, we could check here.
        # But let's rely on the loop or a manual trigger if critical.
        
        return {"status": "ok"}
    except Exception as e:
        logger.error(f"Error registering client interest: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/push/unsubscribe")
def unsubscribe(payload: dict, db: Session = Depends(get_db)):
    endpoint = payload.get("endpoint")
    if endpoint:
        db.query(PushSubscription).filter(PushSubscription.endpoint == endpoint).delete()
        db.commit()
    return {"status": "ok"}

async def send_push_notification(subscription: PushSubscription, title: str, message: str, url: str, db: Session, icon: str = None):
    private_key_pem, _ = get_vapid_keys(db)
    
    try:
        # EXPLICIT VAPID OBJECT: Bypass pywebpush string parsing which is causing ASN.1 errors
        vapid_obj = Vapid.from_pem(private_key_pem.encode('utf-8'))
        
        webpush(
            subscription_info={
                "endpoint": subscription.endpoint,
                "keys": {
                    "p256dh": subscription.p256dh,
                    "auth": subscription.auth
                }
            },
            data=json.dumps({
                "title": title,
                "message": message,
                "url": url,
                "icon": icon
            }),
            vapid_private_key=vapid_obj,
            vapid_claims={
                "sub": "mailto:dev@trafikinfo-flux.local"
            }
        )
    except WebPushException as ex:
        # Check if it's a 404/410 first
        if ex.response is not None and ex.response.status_code in [404, 410]:
            logger.info(f"Removing invalid subscription (404/410): {subscription.endpoint}")
            db.delete(subscription)
            db.commit()
        else:
            logger.error(f"Push failed: {ex}")
    except (ValueError, TypeError) as e:
        # Catch errors related to invalid key data (crypto/base64)
        logger.error(f"Invalid key data for subscription {subscription.id}: {e}")
        logger.info(f"Removing corrupt subscription: {subscription.endpoint}")
        db.delete(subscription)
        db.commit()
    except Exception as e:
        # Catch generic errors but check string for "deserialize"
        err_str = str(e)
        if "deserialize" in err_str or "ASN.1" in err_str:
             logger.error(f"Crypto error for subscription {subscription.id}: {e}")
             logger.info(f"Removing incompatible subscription: {subscription.endpoint}")
             db.delete(subscription)
             db.commit()
        else:
             logger.error(f"Unexpected push error: {e}")

async def notify_subscribers(data: dict, db: Session, type: str = "event"):
    subs = db.query(PushSubscription).all()
    if not subs:
        return

    for sub in subs:
        # Check filters
        allowed_counties = sub.counties.split(",") if sub.counties else []
        item_county = str(data.get('county_no'))
        
        if allowed_counties and item_county not in allowed_counties:
            continue
            
        if type == "event":
            if not sub.topic_realtid:
                continue
            # Handle None in severity_code
            severity = data.get('severity_code')
            if (severity or 0) < sub.min_severity:
                continue
            title = f"⚠️ {data.get('title', 'Trafikhändelse')}"
            message = data.get('location', '')
            url = data.get('event_url', '/')
            icon = data.get('icon_url')
        else: # road_condition
            if not sub.topic_road_condition:
                continue
            title = f"❄️ Väglag: {data.get('condition_text', 'Varning')}"
            message = f"{data.get('location_text', '')}: {data.get('warning', '')}. {data.get('measure', '')}"
            url = "/?tab=road-conditions" # Default to road conditions tab
            icon = data.get('icon_url')

        await send_push_notification(sub, title, message, url, db, icon=icon)

@app.get("/api/settings")
def get_settings(db: Session = Depends(get_db)):
    settings = db.query(Settings).all()
    res = {s.key: s.value for s in settings}
    if "api_key" not in res:
        res["api_key"] = "" # Secret removed for GitHub safety
    return res

@app.get("/api/status/counts")
def get_status_counts(
    since_feed: str = None, 
    since_planned: str = None, 
    since_road_conditions: str = None,
    db: Session = Depends(get_db)
):
    from datetime import datetime
    now = datetime.now()
    
    def parse_since(since_str):
        if not since_str: return None
        try:
            # Convert ISO string (UTC) to naive local datetime
            dt = datetime.fromisoformat(since_str.replace('Z', '+00:00'))
            return dt.astimezone().replace(tzinfo=None)
        except:
            return None

    s_feed = parse_since(since_feed)
    s_planned = parse_since(since_planned)
    s_rc = parse_since(since_road_conditions)

    # Base query for non-expired events
    active_events_query = db.query(TrafficEvent).filter((TrafficEvent.end_time == None) | (TrafficEvent.end_time > now))
    
    # Realtid
    realtid_q = active_events_query.filter(
        (TrafficEvent.start_time <= now) & 
        ((TrafficEvent.end_time == None) | (func.julianday(TrafficEvent.end_time) - func.julianday(TrafficEvent.start_time) < 5))
    )
    if s_feed:
        realtid_q = realtid_q.filter(TrafficEvent.created_at > s_feed)
    realtid_count = realtid_q.count()
    
    # Planned
    planned_q = active_events_query.filter(
        (TrafficEvent.start_time > now) | 
        ((TrafficEvent.end_time != None) & (func.julianday(TrafficEvent.end_time) - func.julianday(TrafficEvent.start_time) >= 5))
    )
    if s_planned:
        # For planned, we care about when they were added to the system
        planned_q = planned_q.filter(TrafficEvent.created_at > s_planned)
    planned_count = planned_q.count()
    
    # Road Conditions
    rc_q = db.query(RoadCondition).filter((RoadCondition.end_time == None) | (RoadCondition.end_time > now))
    if s_rc:
        rc_q = rc_q.filter(RoadCondition.timestamp > s_rc)
    rc_count = rc_q.count()
    
    return {
        "feed": realtid_count,
        "planned": planned_count,
        "road-conditions": rc_count,
        "cameras": 0 # Removed per user request
    }

@app.get("/api/status")
def get_status(db: Session = Depends(get_db)):
    global tv_stream
    api_key = db.query(Settings).filter(Settings.key == "api_key").first()
    
    return {
        "setup_required": not (api_key and api_key.value),
        "trafikverket": {
            "connected": tv_stream.connected if tv_stream else False,
            "api_key_set": bool(api_key and api_key.value),
            "last_error": tv_stream.last_error if tv_stream else None
        },
        "mqtt": {
            "connected": mqtt_client.connected,
            "enabled": mqtt_client.config.get("enabled", False),
            "broker": mqtt_client.config.get("host")
        },
        "version": VERSION,
        "cleanup": "running"
    }

@app.get("/api/version")
def get_version():
    return {"version": VERSION}

@app.get("/api/debug/push-test")
async def debug_push_test(db: Session = Depends(get_db)):
    """Triggers a manual push notification test using the last event in DB."""
    last_event = db.query(TrafficEvent).order_by(TrafficEvent.id.desc()).first()
    if not last_event:
        return {"error": "No events in DB"}
    
    # Fake mqtt_data for testing logic in notify_subscribers
    test_data = {
        "title": f"🧪 TEST: {last_event.title}",
        "location": last_event.location or "Ingen plats",
        "event_url": f"/?event_id={last_event.external_id}",
        "icon_url": f"/api/icons/{last_event.icon_id}.png" if last_event.icon_id else None,
        "severity_code": last_event.severity_code,
        "county_no": last_event.county_no
    }
    
    await notify_subscribers(test_data, db, type="event")
    return {"status": "sent", "event": last_event.title}

class ResetRequest(BaseModel):
    confirm: bool

@app.post("/api/reset")
async def reset_system(request: ResetRequest, db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    """Refined Factory Reset: Wipes dynamic data, preserves MQTT/API keys, sets defaults."""
    if not request.confirm:
        raise HTTPException(status_code=400, detail="Bekräftelse krävs.")
    
    try:
        # 1. Clear dynamic tables
        db.query(TrafficEvent).delete()
        db.query(TrafficEventVersion).delete()
        db.query(Camera).delete()
        db.query(RoadCondition).delete()
        db.query(ClientInterest).delete()
        db.query(PushSubscription).delete()
        
        # 2. Reset specific settings to required defaults 
        # (while preserving api_key, mqtt_*, admin_password)
        resets = {
            "push_notifications_enabled": "false",
            "sound_notifications_enabled": "false",
            "selected_counties": "1", # Stockholms Län
            "camera_radius_km": "8.0",
            "retention_days": "30"
        }
        
        for key, value in resets.items():
            setting = db.query(Settings).filter(Settings.key == key).first()
            if setting:
                setting.value = value
            else:
                db.add(Settings(key=key, value=value))
        
        db.commit()
        
        # 3. Clear Snapshots directory
        if os.path.exists(SNAPSHOTS_DIR):
            import shutil
            for filename in os.listdir(SNAPSHOTS_DIR):
                file_path = os.path.join(SNAPSHOTS_DIR, filename)
                try:
                    if os.path.isfile(file_path) or os.path.islink(file_path):
                        os.unlink(file_path)
                    elif os.path.isdir(file_path):
                        shutil.rmtree(file_path)
                except Exception as e:
                    logger.error(f"Failed to delete {file_path}: {e}")
                    
        logger.info("System Refined Reset performed by admin.")
        return {"status": "ok", "message": "Systemet har återställts (Inställningar för API/MQTT behölls)."}
    except Exception as e:
        logger.error(f"Reset failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Static files and SPA fallback
if os.path.exists("static"):
    app.mount("/assets", StaticFiles(directory="static/assets"), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        if full_path.startswith("api"):
            raise HTTPException(status_code=404)
        
        file_path = os.path.join("static", full_path)
        if os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse("static/index.html")

@app.on_event("startup")
async def startup_event():
    # 1. Initialize Database
    init_db()
    
    db = SessionLocal()
    try:
        # 2. Seed default settings
        for key, val in DEFAULTS.items():
            existing = db.query(Settings).filter(Settings.key == key).first()
            if not existing:
                logger.info(f"Seeding default setting '{key}' = '{val}'")
                db.add(Settings(key=key, value=val))
        db.commit()

        # 3. Handle VAPID legacy cleanup
        vapid_priv = db.query(Settings).filter(Settings.key == "vapid_private_key").first()
        if vapid_priv and not vapid_priv.value.startswith("-----BEGIN"):
            logger.info("Outdated VAPID key format detected. Clearing for regeneration...")
            db.query(Settings).filter(Settings.key.in_(["vapid_private_key", "vapid_public_key"])).delete(synchronize_session=False)
            db.commit()

        # 4. Configure MQTT
        mqtt_enabled = db.query(Settings).filter(Settings.key == "mqtt_enabled").first()
        mqtt_host = db.query(Settings).filter(Settings.key == "mqtt_host").first()
        mqtt_port = db.query(Settings).filter(Settings.key == "mqtt_port").first()
        mqtt_user = db.query(Settings).filter(Settings.key == "mqtt_username").first()
        mqtt_pass = db.query(Settings).filter(Settings.key == "mqtt_password").first()
        mqtt_topic = db.query(Settings).filter(Settings.key == "mqtt_topic").first()

        mqtt_config = {
            "enabled": mqtt_enabled.value.lower() == "true" if mqtt_enabled else False
        }
        if mqtt_host: mqtt_config["host"] = mqtt_host.value
        if mqtt_port: mqtt_config["port"] = int(mqtt_port.value)
        if mqtt_user: mqtt_config["username"] = mqtt_user.value
        if mqtt_pass: mqtt_config["password"] = mqtt_pass.value
        if mqtt_topic: mqtt_config["topic"] = mqtt_topic.value
        mqtt_client.update_config(mqtt_config)

        # 5. Start Workers (Family Model)
        api_key_set = db.query(Settings).filter(Settings.key == "api_key").first()
        if api_key_set and api_key_set.value:
             global dynamic_worker_task
             if not dynamic_worker_task or dynamic_worker_task.done():
                logger.info("Starting Dynamic Worker Manager (Family Model)...")
                dynamic_worker_task = asyncio.create_task(dynamic_worker_manager(api_key_set.value))
        else:
             logger.warning("No API key configured. Workers waiting for configuration.")

    finally:
        db.close()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

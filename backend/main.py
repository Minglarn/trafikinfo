VERSION = "26.2.30"
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
from typing import List
from datetime import datetime, timedelta, time
from sqlalchemy import func
from pydantic import BaseModel

from database import SessionLocal, init_db, TrafficEvent, TrafficEventVersion, Settings, Camera, RoadCondition
from mqtt_client import mqtt_client
from trafikverket import TrafikverketStream, parse_situation, get_cameras, find_nearby_cameras, parse_road_condition

# Setup logging
debug_mode = os.getenv("DEBUG_MODE", "false").lower() == "true"
logging.basicConfig(level=logging.DEBUG if debug_mode else logging.INFO)
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
    "camera_radius_km": "5.0",
    "selected_counties": "1,4",  # Stockholm & Södermanland
    "mqtt_enabled": "false",
    "mqtt_host": "localhost",
    "mqtt_port": "1883",
    "mqtt_topic": "trafikinfo/events",
    "retention_days": "30"
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

app = FastAPI(title="Trafikinfo API", version="26.2.20")

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
cameras = []

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@app.on_event("startup")
async def startup_event():
    init_db()
    
    # Load settings & seed from environment if database is empty
    db = SessionLocal()
    
    # Seed defaults if database keys are missing
    for key, val in DEFAULTS.items():
        existing = db.query(Settings).filter(Settings.key == key).first()
        if not existing:
            logger.info(f"Seeding default setting '{key}' = '{val}'")
            db.add(Settings(key=key, value=val))

    db.commit()

    # Re-fetch all settings after seeding
    api_key_set = db.query(Settings).filter(Settings.key == "api_key").first()
    mqtt_host = db.query(Settings).filter(Settings.key == "mqtt_host").first()
    mqtt_port = db.query(Settings).filter(Settings.key == "mqtt_port").first()
    mqtt_user = db.query(Settings).filter(Settings.key == "mqtt_username").first()
    mqtt_pass = db.query(Settings).filter(Settings.key == "mqtt_password").first()
    mqtt_topic = db.query(Settings).filter(Settings.key == "mqtt_topic").first()
    selected_counties = db.query(Settings).filter(Settings.key == "selected_counties").first()
    
    mqtt_enabled = db.query(Settings).filter(Settings.key == "mqtt_enabled").first()
    
    mqtt_config = {
        "enabled": mqtt_enabled.value.lower() == "true" if mqtt_enabled else False
    }
    if mqtt_host: mqtt_config["host"] = mqtt_host.value
    if mqtt_port: mqtt_config["port"] = int(mqtt_port.value)
    if mqtt_user: mqtt_config["username"] = mqtt_user.value
    if mqtt_pass: mqtt_config["password"] = mqtt_pass.value
    if mqtt_topic: mqtt_config["topic"] = mqtt_topic.value

    # Parse selected counties (stored as comma-separated string)
    county_ids = ["1", "4"] # Default Stockholm/Södermanland
    if selected_counties and selected_counties.value:
        try:
            county_ids = selected_counties.value.split(",")
        except:
            pass

    if mqtt_config:
        mqtt_client.update_config(mqtt_config)
    
    if api_key_set and api_key_set.value:
        start_worker(api_key_set.value, county_ids)
    
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

def start_worker(api_key: str, county_ids: list = None):
    global stream_task, processor_task, refresh_task, init_cameras_task, tv_stream, cameras
    global rc_stream, rc_stream_task, rc_processor_task
    
    # Cancel all existing tasks cleanly
    tasks_to_cancel = [t for t in [stream_task, processor_task, refresh_task, init_cameras_task, rc_stream_task, rc_processor_task] if t]
    for t in tasks_to_cancel:
        t.cancel()
    
    if tv_stream:
        tv_stream.stop_streaming()
    if rc_stream:
        rc_stream.stop_streaming()
    
    tv_stream = TrafikverketStream(api_key)
    
    # Start two streams: one for Situation (default) and one for RoadCondition
    # Note: TrafikverketStream as written supports one connection. We might need two instances or update it.
    # For now, let's instantiate two streams if we want both.
    # But wait, the `event_processor` consumes one stream.
    # Let's modify `start_worker` to start a separate task for road conditions if we want them live.
    # Or, we can just have one stream if the API supported multiple object types in one query (it usually doesn't for SSE filter).
    
    # Actually, simpler: Let's run a second stream for RoadConditions.
    
    # Actually, simpler: Let's run a second stream for RoadConditions.
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
    global camera_sync_task
    camera_sync_task = asyncio.create_task(periodic_camera_sync())
    
    logger.info(f"Trafikinfo Flux v{VERSION} started")

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
        
        await asyncio.sleep(300) # Every 5 minutes

async def refresh_cameras(api_key: str):
    # Keep legacy for stability during transition if needed
    pass

async def download_camera_snapshot(url: str, event_id: str, explicit_fullsize_url: str = None):
    """Download camera image and save it to the snapshots directory."""
    if not url:
        return None
    
    # Prioritize explicit fullsize URL from API, otherwise try to guess it
    fullsize_url = explicit_fullsize_url or url
    filename = f"{event_id}_{int(datetime.now().timestamp())}"
    if explicit_fullsize_url and "api.trafikinfo.trafikverket.se" in url:
        # Just to differentiate in logs and potentially filename if we wanted
        pass
    
    # Ensure filename is unique if called multiple times for same event
    # We'll use the camera URL hash or just allow the caller to provide a more specific event_id
    filename = f"{filename}.jpg"
    filepath = os.path.join(SNAPSHOTS_DIR, filename)
    
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            # Try fullsize first
            logger.debug(f"Attempting to download fullsize image from {fullsize_url}")
            response = await client.get(fullsize_url)
            
            # Check if fullsize is valid (200 OK AND sufficiently large)
            is_valid_fullsize = False
            if response.status_code == 200:
                # 3KB is a very safe floor for "any" image, 
                # but thumbnails are usually 2-5KB and fullsize are 30KB+.
                # We'll stick to 5KB as a "is this really fullsize" indicator.
                if len(response.content) >= 5000:
                    is_valid_fullsize = True
                is_valid_fullsize = len(response.content) >= 30000  # High-res should be 30KB+ (usually 100KB+)
                if not is_valid_fullsize:
                    logger.warning(f"Snapshot from {fullsize_url} is unexpectedly small ({len(response.content)} bytes), below 30KB threshold for fullsize.")
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
                return filename
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

                        if not existing.extra_cameras or has_missing_extra or loc_changed:
                            needs_camera_sync = True

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
                                c_snap = await download_camera_snapshot(cam_url, f"{ev['external_id']}_{cam_id_safe}", c.get('fullsize_url'))
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
                                snapshot_file = await download_camera_snapshot(target_url, ev['external_id'], target_fullsize)
                                
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
                            if existing.camera_url and not existing.camera_snapshot:
                                existing.camera_snapshot = await download_camera_snapshot(existing.camera_url, ev['external_id'], None)
                            if extra_cameras_json:
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
                        db.commit() 
                        
                        # Download snapshot
                        if camera_url:
                            new_event.camera_snapshot = await download_camera_snapshot(camera_url, ev['external_id'], fullsize_url)
                            db.commit()
                        
                        db.refresh(new_event)
                    
                    # MQTT & Broadcast (Unified for New & Updated)
                    mqtt_data = ev.copy()
                    
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
                        "history_count": history_count
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
                                 # Unique filename for road conditions to avoid collision/overwrites if needed, 
                                 # but actually we want fresh ones.
                                 # We can reuse the download_camera_snapshot logic
                                 fullsize_url = primary.get('fullsize_url')
                                 # Suffix with timestamp in logic, so just pass a stable ID base
                                 # For RoadConditions, maybe we update snapshot every time?
                                 # Let's clean up old ones or just keep latest.
                                 # For now, download new:
                                 camera_snapshot = await download_camera_snapshot(camera_url, f"rc_{rc['id']}", fullsize_url)

                    if existing:
                        existing.condition_code = rc['condition_code']
                        existing.condition_text = rc['condition_text']
                        existing.measure = rc['measure']
                        existing.warning = rc['warning']
                        existing.cause = rc.get('cause') # New field
                        existing.icon_id = rc.get('icon_id') # New field
                        existing.road_number = rc.get('road_number')
                        existing.start_time = datetime.fromisoformat(rc['start_time']) if rc.get('start_time') else None
                        existing.end_time = datetime.fromisoformat(rc['end_time']) if rc.get('end_time') else None
                        existing.timestamp = datetime.fromisoformat(rc['timestamp']) if rc.get('timestamp') else datetime.now()
                        
                        if needs_camera_sync and camera_url:
                            existing.camera_url = camera_url
                            existing.camera_name = camera_name
                            existing.camera_snapshot = camera_snapshot

                        db.commit()

                    else:
                        new_rc = RoadCondition(
                            id=rc['id'],
                            condition_code=rc['condition_code'],
                            condition_text=rc['condition_text'],
                            measure=rc['measure'],
                            warning=rc['warning'],
                            cause=rc.get('cause'), # New field
                            icon_id=rc.get('icon_id'), # New field
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
                    
                    # Prepare data for broadcast
                    icon_url = None
                    if rc.get('icon_id'):
                        base_url_setting = db.query(Settings).filter(Settings.key == "base_url").first()
                        base_url = base_url_setting.value if base_url_setting else ""
                        icon_id_with_ext = f"{rc['icon_id']}.png"
                        icon_url = f"{base_url}/api/icons/{icon_id_with_ext}" if base_url else f"/api/icons/{icon_id_with_ext}"

                    condition_data = {
                        "id": rc['id'],
                        "condition_code": rc['condition_code'],
                        "condition_text": rc['condition_text'],
                        "measure": rc['measure'],
                        "warning": rc['warning'],
                        "cause": rc.get('cause'),
                        "icon_id": rc.get('icon_id'),
                        "icon_url": icon_url,
                        "road_number": rc.get('road_number'),
                        "start_time": rc.get('start_time'),
                        "end_time": rc.get('end_time'),
                        "latitude": rc.get('latitude'),
                        "longitude": rc.get('longitude'),
                        "camera_url": camera_url,
                        "camera_name": camera_name,
                        "camera_snapshot": camera_snapshot,
                        "timestamp": rc.get('timestamp')
                    }
                    
                    # Broadcast to connected clients (reuse existing connection list if possible, or create new)
                    # For now, let's just push to same connected_clients as traffic events
                    for queue in connected_clients:
                         await queue.put(condition_data)
                    
                    # Publish to MQTT if enabled
                    mqtt_rc_enabled_setting = db.query(Settings).filter(Settings.key == "mqtt_rc_enabled").first()
                    mqtt_rc_enabled = mqtt_rc_enabled_setting.value == "true" if mqtt_rc_enabled_setting else False
                    
                    if mqtt_rc_enabled:
                         mqtt_rc_topic_setting = db.query(Settings).filter(Settings.key == "mqtt_rc_topic").first()
                         mqtt_rc_topic = mqtt_rc_topic_setting.value if mqtt_rc_topic_setting else "trafikinfo/road_conditions"
                         
                         try:
                             # Convert datetime objects to string for JSON serialization
                             mqtt_payload = condition_data.copy()
                             # condition_data already has strings for most things, but let's be safe with json.dumps default=str
                             import json
                             await mqtt_client.publish(mqtt_rc_topic, json.dumps(mqtt_payload, default=str))
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
        return {
            "favorites": [{
                "id": c.id, "name": c.name, "description": c.description, "location": c.location,
                "type": c.type, 
                "proxy_url": f"/api/cameras/{c.id}/image",
                "photo_time": c.photo_time, "latitude": c.latitude, "longitude": c.longitude,
                "county_no": c.county_no, "is_favorite": True
            } for c in favorites],
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
    cams = query.offset(offset).limit(limit).all()

    return {
        "cameras": [{
            "id": c.id,
            "name": c.name,
            "description": c.description,
            "location": c.location,
            "type": c.type,
            "proxy_url": f"/api/cameras/{c.id}/image",
            "photo_time": c.photo_time,
            "latitude": c.latitude,
            "longitude": c.longitude,
            "county_no": c.county_no,
            "is_favorite": bool(c.is_favorite)
        } for c in cams],
        "total": total_count,
        "favorites_count": fav_count,
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
def get_events(limit: int = 50, offset: int = 0, hours: int = None, date: str = None, counties: str = None, db: Session = Depends(get_db)):
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
        # If 'hours' is NOT provided, it's the main feed -> Filter out expired events
        # If 'hours' IS provided (even 0 for all history), we show everything (including expired)
        if hours is None:
            now = datetime.now()
            query = query.filter((TrafficEvent.end_time == None) | (TrafficEvent.end_time > now))
        
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
def get_road_conditions(county_no: int = None, db: Session = Depends(get_db)):
    query = db.query(RoadCondition)
    
    # Filter by configured counties by default for consistency
    county_setting = db.query(Settings).filter(Settings.key == "selected_counties").first()
    selected_counties = [int(c.strip()) for c in county_setting.value.split(",")] if county_setting and county_setting.value else []
    
    if county_no:
        query = query.filter(RoadCondition.county_no == county_no)
    elif selected_counties:
        query = query.filter(RoadCondition.county_no.in_(selected_counties))
        
    conditions = query.all()
    
    return [{
        "id": c.id,
        "condition_code": c.condition_code,
        "condition_text": c.condition_text,
        "measure": c.measure,
        "warning": c.warning,
        "road_number": c.road_number,
        "start_time": c.start_time,
        "end_time": c.end_time,
        "latitude": c.latitude,
        "longitude": c.longitude,
        "county_no": c.county_no,
        "timestamp": c.timestamp,
        "camera_snapshot": c.camera_snapshot,
        "camera_name": c.camera_name,
        "snapshot_url": f"/api/snapshots/{c.camera_snapshot}" if c.camera_snapshot else None
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
            curr_counties = db.query(Settings).filter(Settings.key == "selected_counties").first()
            
            key_val = curr_key.value if curr_key else ""
            county_ids = ["1", "4"]
            if curr_counties and curr_counties.value:
                county_ids = curr_counties.value.split(",")
            
            if key_val:
                start_worker(key_val, county_ids)
        
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

@app.get("/api/settings")
def get_settings(db: Session = Depends(get_db)):
    settings = db.query(Settings).all()
    res = {s.key: s.value for s in settings}
    if "api_key" not in res:
        res["api_key"] = "" # Secret removed for GitHub safety
    return res

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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

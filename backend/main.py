VERSION = "26.2.16"
from fastapi import FastAPI, Depends, BackgroundTasks, HTTPException, Header, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
import asyncio
import os
import json
import logging
import httpx
from typing import List
from datetime import datetime, timedelta
from sqlalchemy import func
from pydantic import BaseModel

from database import SessionLocal, init_db, TrafficEvent, TrafficEventVersion, Settings, Camera
from mqtt_client import mqtt_client
from trafikverket import TrafikverketStream, parse_situation, get_cameras, find_nearest_camera

# Setup logging
debug_mode = os.getenv("DEBUG_MODE", "false").lower() == "true"
logging.basicConfig(level=logging.DEBUG if debug_mode else logging.INFO)
logger = logging.getLogger(__name__)

# Ensure snapshots directory exists
SNAPSHOTS_DIR = os.path.join(os.getcwd(), "data", "snapshots")
os.makedirs(SNAPSHOTS_DIR, exist_ok=True)

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

# Auth Config
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin123")

app = FastAPI(title="Trafikinfo API")

class LoginRequest(BaseModel):
    password: str

def get_current_admin(authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid authentication header"
        )
    
    token = authorization.split(" ")[1]
    
    if token != ADMIN_PASSWORD:
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

# Serve snapshots
app.mount("/api/snapshots", StaticFiles(directory=SNAPSHOTS_DIR), name="snapshots")

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
init_cameras_task = None
tv_stream = None
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
    
    tasks = [t for t in [stream_task, processor_task, refresh_task, init_cameras_task] if t]
    if tasks:
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
    
    if tv_stream:
        tv_stream.stop_streaming()
    logger.info("Shutdown complete")

def start_worker(api_key: str, county_ids: list = None):
    global stream_task, processor_task, refresh_task, init_cameras_task, tv_stream, cameras
    
    # Cancel all existing tasks cleanly
    tasks_to_cancel = [t for t in [stream_task, processor_task, refresh_task, init_cameras_task] if t]
    for t in tasks_to_cancel:
        t.cancel()
    
    if tv_stream:
        tv_stream.stop_streaming()
    
    tv_stream = TrafikverketStream(api_key)
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
                    "url": c.photo_url
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
    fullsize_url = explicit_fullsize_url
    if not fullsize_url:
        fullsize_url = url
        if "api.trafikinfo.trafikverket.se" in url and not url.endswith("_fullsize.jpg"):
            fullsize_url = url.replace(".jpg", "_fullsize.jpg")

    filename = f"{event_id}_{int(datetime.now().timestamp())}.jpg"
    filepath = os.path.join(SNAPSHOTS_DIR, filename)
    
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            # Try fullsize first
            response = await client.get(fullsize_url)
            
            # Check if fullsize is valid (200 OK AND sufficiently large)
            is_valid_fullsize = False
            if response.status_code == 200:
                if len(response.content) >= 5000:
                    is_valid_fullsize = True
                else:
                    logger.warning(f"Fullsize snapshot {fullsize_url} is too small ({len(response.content)} bytes).")
            
            # Fallback to original URL if fullsize failed or was too small
            if not is_valid_fullsize and fullsize_url != url:
                logger.info(f"Falling back to original URL: {url}")
                response = await client.get(url)

            if response.status_code == 200:
                # Minimum size check to avoid corrupted/partial downloads (e.g. 5KB)
                if len(response.content) < 5000:
                    logger.warning(f"Downloaded snapshot for {event_id} is too small ({len(response.content)} bytes), rejecting.")
                    return None
                    
                with open(filepath, "wb") as f:
                    f.write(response.content)
                logger.info(f"Saved snapshot for event {event_id} to {filename} (Size: {len(response.content)} bytes)")
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
                    # Find nearest camera if event has coordinates
                    nearest_cam = find_nearest_camera(ev.get('latitude'), ev.get('longitude'), cameras, target_road=ev.get('road_number'), max_dist_km=max_dist)
                    camera_url = nearest_cam.get('url') if nearest_cam else None
                    camera_name = nearest_cam.get('name') if nearest_cam else None
                    fullsize_url = nearest_cam.get('fullsize_url') if nearest_cam else None

                    # Check if event already exists
                    existing = db.query(TrafficEvent).filter(TrafficEvent.external_id == ev['external_id']).first()
                    
                    if existing:
                        # Check if anything significant changed before updating
                        # We compare: title, description, location, severity_code, message_type
                        has_changed = (
                            existing.title != ev['title'] or
                            existing.description != ev['description'] or
                            existing.location != ev['location'] or
                            existing.severity_code != ev.get('severity_code') or
                            existing.message_type != ev.get('message_type') or
                            existing.temporary_limit != ev.get('temporary_limit')
                        )

                        if has_changed:
                            # Save history before updating
                            logger.info(f"Event {ev['external_id']} changed, saving history version")
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
                                camera_snapshot=existing.camera_snapshot
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
                        
                        # Sync camera metadata for existing events (Only if we found a new one or don't have one)
                        if camera_url:
                            existing.camera_url = camera_url
                            existing.camera_name = camera_name
                            # Update snapshot if missing or if we have a new camera URL
                            existing.camera_snapshot = existing.camera_snapshot or await download_camera_snapshot(camera_url, ev['external_id'], fullsize_url)
                        
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
                            camera_url=camera_url,
                            camera_name=camera_name
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
                    if ev.get('icon_id'):
                        mqtt_data['icon_url'] = f"https://api.trafikinfo.trafikverket.se/v1/icons/{ev['icon_id']}?type=png32x32"
                    
                    # Use data from the DB to ensure consistency (especially camera/snapshot)
                    mqtt_data['camera_url'] = new_event.camera_url
                    mqtt_data['camera_name'] = new_event.camera_name
                    mqtt_data['camera_snapshot'] = new_event.camera_snapshot

                    if mqtt_client.publish_event(mqtt_data):
                        new_event.pushed_to_mqtt = 1
                    else:
                        new_event.pushed_to_mqtt = 0
                    db.commit()
                    
                    # Broadcast to connected frontend clients
                    event_data = {
                        "id": new_event.id,
                        "external_id": new_event.external_id,
                        "title": new_event.title,
                        "description": new_event.description,
                        "location": new_event.location,
                        "icon_url": mqtt_data.get('icon_url'),
                        "created_at": new_event.created_at.isoformat(),
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
                        "camera_snapshot": new_event.camera_snapshot
                    }
                    for queue in connected_clients:
                        await queue.put(event_data)

                    db.commit()
            except Exception as e:
                logger.error(f"Error processing events: {e}")
            finally:
                db.close()
    except asyncio.CancelledError:
        logger.info("Event processor cancelled")
    except Exception as e:
    	logger.error(f"Event processor error: {e}")

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
    # Format versions similarly to events for the frontend
    return [
        {
            "id": v.id,
            "external_id": v.external_id,
            "version_timestamp": v.version_timestamp,
            "title": v.title,
            "description": v.description,
            "location": v.location,
            "icon_url": f"https://api.trafikinfo.trafikverket.se/v1/icons/{v.icon_id}?type=png32x32" if v.icon_id else None,
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
            "camera_snapshot": v.camera_snapshot
        } for v in versions
    ]

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
                "type": c.type, "url": c.photo_url, "fullsize_url": c.fullsize_url,
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
            "url": c.photo_url,
            "fullsize_url": c.fullsize_url,
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

@app.get("/api/events", response_model=List[dict])
def get_events(limit: int = 50, offset: int = 0, hours: int = None, db: Session = Depends(get_db)):
    query = db.query(TrafficEvent)
    
    if hours:
        from datetime import datetime, timedelta
        cutoff = datetime.now() - timedelta(hours=hours)
        query = query.filter(TrafficEvent.created_at >= cutoff)
        
    events = query.order_by(TrafficEvent.created_at.desc()).offset(offset).limit(limit).all()
    return [
        {
            "id": e.id,
            "external_id": e.external_id,
            "title": e.title,
            "description": e.description,
            "location": e.location,
            "icon_url": f"https://api.trafikinfo.trafikverket.se/v1/icons/{e.icon_id}?type=png32x32" if e.icon_id else None,
            "created_at": e.created_at,
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
            "camera_url": e.camera_url,
            "camera_name": e.camera_name,
            "camera_snapshot": e.camera_snapshot,
            "history_count": db.query(TrafficEventVersion).filter(TrafficEventVersion.external_id == e.external_id).count()
        } for e in events
    ]

@app.get("/api/stats")
def get_stats(hours: int = 24, db: Session = Depends(get_db)):
    from datetime import datetime, timedelta
    cutoff = datetime.now() - timedelta(hours=hours)
    
    # Base query for time range
    base_query = db.query(TrafficEvent).filter(TrafficEvent.created_at >= cutoff)
    
    # Total count
    total_events = base_query.count()
    
    # Count by Message Type
    type_counts = db.query(TrafficEvent.message_type, func.count(TrafficEvent.id))\
        .filter(TrafficEvent.created_at >= cutoff)\
        .group_by(TrafficEvent.message_type).all()
        
    # Count by Severity
    severity_counts = db.query(TrafficEvent.severity_text, func.count(TrafficEvent.id))\
        .filter(TrafficEvent.created_at >= cutoff)\
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
        "timeline": sorted_timeline
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

@app.get("/api/settings")
def get_settings(db: Session = Depends(get_db)):
    settings = db.query(Settings).all()
    res = {s.key: s.value for s in settings}
    if "api_key" not in res:
        res["api_key"] = "" # Secret removed for GitHub safety
    return res

@app.delete("/api/reset")
async def reset_system(db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    """Factory Reset: Clears all events and snapshots."""
    try:
        # Clear database
        db.query(TrafficEvent).delete()
        db.commit()
        
        # Clear snapshots
        for filename in os.listdir(SNAPSHOTS_DIR):
            file_path = os.path.join(SNAPSHOTS_DIR, filename)
            try:
                if os.path.isfile(file_path):
                    os.unlink(file_path)
            except Exception as e:
                logger.error(f"Error deleting file {file_path}: {e}")
                
        logger.warning("Factory reset performed. All data cleared.")
        return {"message": "Systemet har återställts."}
    except Exception as e:
        logger.error(f"Error during factory reset: {e}")
        raise HTTPException(status_code=500, detail=str(e))

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

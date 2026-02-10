VERSION = "26.2.16"
from fastapi import FastAPI, Depends, BackgroundTasks, HTTPException
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

from database import SessionLocal, init_db, TrafficEvent, Settings
from mqtt_client import mqtt_client
from trafikverket import TrafikverketStream, parse_situation, get_cameras, find_nearest_camera

# Setup logging
debug_mode = os.getenv("DEBUG_MODE", "false").lower() == "true"
logging.basicConfig(level=logging.DEBUG if debug_mode else logging.INFO)
logger = logging.getLogger(__name__)

# Ensure snapshots directory exists
SNAPSHOTS_DIR = os.path.join(os.getcwd(), "data", "snapshots")
os.makedirs(SNAPSHOTS_DIR, exist_ok=True)

# Map environment variables to database setting keys
ENV_TO_DB = {
    "TRAFIKVERKET_API_KEY": "api_key",
    "MQTT_HOST": "mqtt_host",
    "MQTT_PORT": "mqtt_port",
    "MQTT_USER": "mqtt_username",
    "MQTT_PASSWORD": "mqtt_password",
    "CAMERA_RADIUS_KM": "camera_radius_km",
    "MQTT_TOPIC": "mqtt_topic"
}

# Defaults if not in DB or ENV
DEFAULTS = {
    "camera_radius_km": "5.0"
}

app = FastAPI(title="Trafikinfo API")

# Serve snapshots
app.mount("/api/snapshots", StaticFiles(directory=SNAPSHOTS_DIR), name="snapshots")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global stream object
stream_task = None
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
    
    # Seeding & Sync logic: if a key exists in ENV, ensure it matches DB (ENV takes precedence)
    for env_key, db_key in ENV_TO_DB.items():
        env_val = os.getenv(env_key)
        if env_val is not None: # Check for None explicitly, allow empty strings if set
            existing = db.query(Settings).filter(Settings.key == db_key).first()
            if not existing:
                logger.info(f"Seeding settings key '{db_key}' from environment variable '{env_key}'")
                new_setting = Settings(key=db_key, value=env_val)
                db.add(new_setting)
            elif existing.value != env_val:
                logger.info(f"Syncing settings key '{db_key}' from environment variable '{env_key}' (Overwriting DB)")
                existing.value = env_val
    
    # Seed defaults for keys that might not be in ENV
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
    
    mqtt_config = {}
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

def start_worker(api_key: str, county_ids: list = None):
    global stream_task, tv_stream, cameras
    if stream_task:
        tv_stream.stop_streaming()
        stream_task.cancel()
    
    tv_stream = TrafikverketStream(api_key)
    stream_task = asyncio.create_task(tv_stream.start_streaming(county_ids=county_ids))
    
    # Initialize cameras and start background refresh
    async def init_cameras():
        global cameras
        cameras = await get_cameras(api_key)
        logger.info(f"Loaded {len(cameras)} traffic cameras")
        asyncio.create_task(refresh_cameras(api_key))

    asyncio.create_task(init_cameras())
    asyncio.create_task(event_processor())

async def refresh_cameras(api_key: str):
    global cameras
    while True:
        try:
            # 1. Refresh Cameras
            new_cameras = await get_cameras(api_key)
            if new_cameras:
                cameras = new_cameras
                logger.info(f"Refreshed {len(cameras)} traffic cameras")
            
            # 2. Cleanup Old Events (Retention Policy)
            db = SessionLocal()
            try:
                # Get retention days from settings
                retention_setting = db.query(Settings).filter(Settings.key == "retention_days").first()
                days = int(retention_setting.value) if retention_setting and retention_setting.value else 30
                
                if days > 0:
                    cutoff_date = datetime.now() - timedelta(days=days)
                    
                    # Find old events
                    old_events = db.query(TrafficEvent).filter(TrafficEvent.created_at < cutoff_date).all()
                    
                    if old_events:
                        logger.info(f"Cleaning up {len(old_events)} events older than {days} days")
                        
                        # Delete snapshots for these events
                        for event in old_events:
                            if event.camera_snapshot:
                                snapshot_path = os.path.join(SNAPSHOTS_DIR, event.camera_snapshot)
                                try:
                                    if os.path.exists(snapshot_path):
                                        os.unlink(snapshot_path)
                                except Exception as e:
                                    logger.error(f"Failed to delete snapshot {snapshot_path}: {e}")
                        
                        # Delete from DB
                        db.query(TrafficEvent).filter(TrafficEvent.created_at < cutoff_date).delete()
                        db.commit()
                        logger.info("Cleanup complete")
            except Exception as e:
                logger.error(f"Error during cleanup: {e}")
            finally:
                db.close()
                
        except Exception as e:
            logger.error(f"Error in background task: {e}")
            
        await asyncio.sleep(3600) # Run every hour

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
            "camera_snapshot": e.camera_snapshot
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
async def update_settings(settings: dict, db: Session = Depends(get_db)):
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
async def reset_system(db: Session = Depends(get_db)):
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
        "trafikverket": {
            "connected": tv_stream.connected if tv_stream else False,
            "last_error": tv_stream.last_error if tv_stream else None
        },
        "mqtt": {
            "connected": mqtt_client.connected,
            "broker": mqtt_client.config.get("host")
        },
        "version": VERSION,
        "setup_required": not (api_key and api_key.value)
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

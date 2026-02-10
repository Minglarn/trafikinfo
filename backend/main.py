from fastapi import FastAPI, Depends, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
import asyncio
import os
import json
import logging
from typing import List
from datetime import datetime

from database import SessionLocal, init_db, TrafficEvent, Settings
from mqtt_client import mqtt_client
from trafikverket import TrafikverketStream, parse_situation

# Setup logging
debug_mode = os.getenv("DEBUG_MODE", "false").lower() == "true"
logging.basicConfig(level=logging.DEBUG if debug_mode else logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Trafikinfo API")

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

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@app.on_event("startup")
async def startup_event():
    init_db()
    # Load settings
    db = SessionLocal()
    api_key = db.query(Settings).filter(Settings.key == "api_key").first()
    mqtt_host = db.query(Settings).filter(Settings.key == "mqtt_host").first()
    mqtt_port = db.query(Settings).filter(Settings.key == "mqtt_port").first()
    mqtt_user = db.query(Settings).filter(Settings.key == "mqtt_username").first()
    mqtt_pass = db.query(Settings).filter(Settings.key == "mqtt_password").first()
    mqtt_topic = db.query(Settings).filter(Settings.key == "mqtt_topic").first()
    
    mqtt_config = {}
    if mqtt_host: mqtt_config["host"] = mqtt_host.value
    if mqtt_port: mqtt_config["port"] = int(mqtt_port.value)
    if mqtt_user: mqtt_config["username"] = mqtt_user.value
    if mqtt_pass: mqtt_config["password"] = mqtt_pass.value
    if mqtt_topic: mqtt_config["topic"] = mqtt_topic.value

    if mqtt_config:
        mqtt_client.update_config(mqtt_config)
    
    if api_key:
        start_worker(api_key.value)
    db.close()

def start_worker(api_key: str):
    global stream_task, tv_stream
    if stream_task:
        tv_stream.stop_streaming()
        stream_task.cancel()
    
    tv_stream = TrafikverketStream(api_key)
    stream_task = asyncio.create_task(tv_stream.start_streaming())
    asyncio.create_task(event_processor())

async def event_processor():
    global tv_stream
    async for raw_data in tv_stream.get_events():
        events = parse_situation(raw_data)
        db = SessionLocal()
        for ev in events:
            # Check if event already exists
            existing = db.query(TrafficEvent).filter(TrafficEvent.external_id == ev['external_id']).first()
            if not existing:
                # Parse parsed times to datetime if necessary, or let SQLAlchemy handle ISO strings (usually works with SQLite)
                # But to be safe and consistent, let's keep them as is from parser (strings) and let SQLite adapter handle it,
                # or better, parse them here if we want strictly datetime objects. 
                # For now, we will pass them as is.
                
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
                    # For SQLite + SQLAlchemy, passing ISO strings to DateTime usually works fine.
                    # If strictly needed, we would parse: datetime.fromisoformat(ev['start_time'])
                    start_time=datetime.fromisoformat(ev['start_time']) if ev.get('start_time') else None,
                    end_time=datetime.fromisoformat(ev['end_time']) if ev.get('end_time') else None,
                    temporary_limit=ev.get('temporary_limit'),
                    traffic_restriction_type=ev.get('traffic_restriction_type')
                )
                db.add(new_event)
                db.commit()
                db.refresh(new_event)
                
                # Add icon_url to event data for MQTT
                mqtt_data = ev.copy()
                if ev.get('icon_id'):
                    mqtt_data['icon_url'] = f"https://api.trafikinfo.trafikverket.se/v1/icons/{ev['icon_id']}?type=png32x32"

                # Push to MQTT
                if mqtt_client.publish_event(mqtt_data):
                    new_event.pushed_to_mqtt = 1
                    logger.info(f"Event {ev['external_id']} pushed to MQTT")
                else:
                    new_event.pushed_to_mqtt = 0
                    logger.warning(f"Event {ev['external_id']} failed to push to MQTT")
                
                
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
                    "traffic_restriction_type": new_event.traffic_restriction_type
                }
                for queue in connected_clients:
                    await queue.put(event_data)

                db.commit()
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
def get_events(limit: int = 50, hours: int = None, db: Session = Depends(get_db)):
    query = db.query(TrafficEvent)
    
    if hours:
        from datetime import datetime, timedelta
        cutoff = datetime.utcnow() - timedelta(hours=hours)
        query = query.filter(TrafficEvent.created_at >= cutoff)
        
    events = query.order_by(TrafficEvent.created_at.desc()).limit(limit).all()
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
            "traffic_restriction_type": e.traffic_restriction_type
        } for e in events
    ]

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
        
        if "api_key" in settings:
            start_worker(str(settings["api_key"]))
        
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

@app.get("/api/status")
def get_status():
    global tv_stream
    return {
        "trafikverket": {
            "connected": tv_stream.connected if tv_stream else False,
            "last_error": tv_stream.last_error if tv_stream else None
        },
        "mqtt": {
            "connected": mqtt_client.connected,
            "broker": mqtt_client.config.get("host")
        }
    }

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

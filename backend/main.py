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

from database import SessionLocal, init_db, TrafficEvent, Settings
from mqtt_client import mqtt_client
from trafikverket import TrafikverketStream, parse_situation

# Setup logging
logging.basicConfig(level=logging.INFO)
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
    
    if mqtt_host:
        mqtt_client.update_config({"host": mqtt_host.value})
    
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
                new_event = TrafficEvent(
                    external_id=ev['external_id'],
                    event_type=ev['event_type'],
                    title=ev['title'],
                    description=ev['description'],
                    location=ev['location']
                )
                db.add(new_event)
                db.commit()
                db.refresh(new_event)
                
                # Push to MQTT
                mqtt_client.publish_event(ev)
                new_event.pushed_to_mqtt = 1
                db.commit()
        db.close()

@app.get("/api/events", response_model=List[dict])
def get_events(limit: int = 50, db: Session = Depends(get_db)):
    events = db.query(TrafficEvent).order_by(TrafficEvent.created_at.desc()).limit(limit).all()
    return [
        {
            "id": e.id,
            "external_id": e.external_id,
            "title": e.title,
            "description": e.description,
            "location": e.location,
            "created_at": e.created_at,
            "pushed_to_mqtt": bool(e.pushed_to_mqtt)
        } for e in events
    ]

@app.post("/api/settings")
def update_settings(settings: dict, db: Session = Depends(get_db)):
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
        
        if "mqtt_host" in settings:
            mqtt_client.update_config({"host": str(settings["mqtt_host"])})
            
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

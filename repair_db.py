from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import os
import sys

# Add backend to path to import models
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from database import TrafficEvent, Settings, SessionLocal
from trafikverket import get_cameras, find_nearest_camera
import asyncio

async def repair():
    db = SessionLocal()
    api_key_setting = db.query(Settings).filter(Settings.key == "api_key").first()
    if not api_key_setting or not api_key_setting.value:
        print("No API key found in DB.")
        return

    print("Fetching cameras...")
    cameras = await get_cameras(api_key_setting.value)
    print(f"Loaded {len(cameras)} cameras.")

    # Find events with coordinates but no camera data
    troubled_events = db.query(TrafficEvent).filter(
        TrafficEvent.latitude.is_not(None),
        TrafficEvent.camera_url.is_(None)
    ).all()

    print(f"Found {len(troubled_events)} events with missing camera data.")

    radius_setting = db.query(Settings).filter(Settings.key == "camera_radius_km").first()
    max_dist = float(radius_setting.value) if radius_setting else 5.0

    count = 0
    for ev in troubled_events:
        nearest = find_nearest_camera(ev.latitude, ev.longitude, cameras, target_road=ev.road_number, max_dist_km=max_dist)
        if nearest:
            ev.camera_url = nearest.get('url')
            ev.camera_name = nearest.get('name')
            print(f"Matched event {ev.external_id} to camera {ev.camera_name}")
            count += 1
    
    db.commit()
    print(f"Successfully repaired {count} events.")
    db.close()

if __name__ == "__main__":
    asyncio.run(repair())

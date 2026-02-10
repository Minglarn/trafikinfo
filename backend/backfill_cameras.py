import sqlite3
import asyncio
import httpx
import re
import os
import sys

# Add backend to path to import utilities
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from trafikverket import get_cameras, find_nearest_camera, calculate_distance
from database import SessionLocal, TrafficEvent, Settings

async def backfill_cameras():
    db = SessionLocal()
    api_key_setting = db.query(Settings).filter(Settings.key == "api_key").first()
    if not api_key_setting:
        print("API Key not found in settings.")
        return

    api_key = api_key_setting.value
    print("Fetching cameras from Trafikverket...")
    cameras = await get_cameras(api_key)
    print(f"Loaded {len(cameras)} cameras.")

    # Find ALL events with coordinates
    events = db.query(TrafficEvent).filter(TrafficEvent.latitude != None, TrafficEvent.longitude != None).all()

    print(f"Found {len(events)} events with coordinates to process.")

    async def download_snapshot(url, event_id):
        if not url: return None
        
        # Upgrade to fullsize
        fullsize_url = url
        if "api.trafikinfo.trafikverket.se" in url and not url.endswith("_fullsize.jpg"):
            fullsize_url = url.replace(".jpg", "_fullsize.jpg")

        filename = f"{event_id}_backfill.jpg"
        filepath = os.path.join(os.getcwd(), 'data', 'snapshots', filename)
        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(fullsize_url)
                if resp.status_code != 200 and fullsize_url != url:
                    resp = await client.get(url)
                
                if resp.status_code == 200:
                    if len(resp.content) < 5000:
                        print(f"Skipping small/corrupted image for {event_id}")
                        return None
                        
                    with open(filepath, "wb") as f:
                        f.write(resp.content)
                    return filename
        except Exception as e:
            print(f"Error downloading for {event_id}: {e}")
        return None

    updated_count = 0
    assigned_count = 0
    
    for i, ev in enumerate(events):
        # 1. Assign camera if missing
        if not ev.camera_url:
            nearest = find_nearest_camera(ev.latitude, ev.longitude, cameras)
            if nearest:
                ev.camera_url = nearest['url']
                ev.camera_name = nearest['name']
                assigned_count += 1
        
        # 2. Download snapshot if we have a camera URL
        if ev.camera_url:
             # Only download if we don't have one, or if we want to force refresh (optional)
            if not ev.camera_snapshot or "backfill" not in str(ev.camera_snapshot):
                new_snapshot = await download_snapshot(ev.camera_url, ev.external_id)
                if new_snapshot:
                    ev.camera_snapshot = new_snapshot
                    updated_count += 1
        
        if i % 10 == 0:
             print(f"Processed {i+1}/{len(events)} events...", end='\r')
             db.commit()

    db.commit()
    db.close()
    print(f"\nDone! Assigned cameras to {assigned_count} events. Downloaded {updated_count} snapshots.")

if __name__ == "__main__":
    asyncio.run(backfill_cameras())

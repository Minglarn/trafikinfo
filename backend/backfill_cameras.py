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

    # Find events that have cameras (all of them, to upgrade to fullsize)
    events = db.query(TrafficEvent).filter(TrafficEvent.camera_url != None).all()

    print(f"Found {len(events)} events to process and upgrade to fullsize snapshots.")

    async def download_snapshot(url, event_id):
        if not url: return None
        
        # Upgrade to fullsize
        fullsize_url = url
        if "api.trafikinfo.trafikverket.se" in url and not url.endswith("_fullsize.jpg"):
            fullsize_url = url.replace(".jpg", "_fullsize.jpg")

        filename = f"{event_id}_{int(asyncio.get_event_loop().time())}.jpg"
        filepath = os.path.join(os.getcwd(), 'data', 'snapshots', filename)
        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(fullsize_url)
                if resp.status_code != 200 and fullsize_url != url:
                    resp = await client.get(url)
                
                if resp.status_code == 200:
                    with open(filepath, "wb") as f:
                        f.write(resp.content)
                    return filename
        except Exception as e:
            print(f"Error downloading for {event_id}: {e}")
        return None

    updated_count = 0
    for ev in events:
        # Re-capture snapshot with fullsize logic
        new_snapshot = await download_snapshot(ev.camera_url, ev.external_id)
        if new_snapshot:
            ev.camera_snapshot = new_snapshot
            updated_count += 1
            if updated_count % 5 == 0:
                print(f"Progress: {updated_count}/{len(events)} (Last size: {os.path.getsize(os.path.join('data', 'snapshots', new_snapshot))} bytes)")
                db.commit() # Commit periodically
        
        await asyncio.sleep(0.5) # Be kind to the API

    db.commit()
    db.close()
    print(f"Successfully backfilled {updated_count} events with cameras.")

if __name__ == "__main__":
    asyncio.run(backfill_cameras())

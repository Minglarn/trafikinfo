import sqlite3
import os
import json

db_path = r"d:\antigravity\trafikinfo\trafikinfo\data\trafikinfo.db"

if not os.path.exists(db_path):
    print(f"Error: DB not found at {db_path}")
    exit(1)

conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
cursor = conn.cursor()

guid_part = "GUID6C8082B1"
print(f"--- Searching for events like {guid_part} ---")
cursor.execute("SELECT * FROM traffic_events WHERE external_id LIKE ?", (f"%{guid_part}%",))
rows = cursor.fetchall()
for r in rows:
    print(f"ID: {r['id']}, GUID: {r['external_id']}, Title: {r['title']}, Snapshot: {r['camera_snapshot']}")

print(f"\n--- Searching for history versions like {guid_part} ---")
cursor.execute("SELECT * FROM traffic_event_versions WHERE external_id LIKE ?", (f"%{guid_part}%",))
rows = cursor.fetchall()
for r in rows:
    print(f"ID: {r['id']}, GUID: {r['external_id']}, Title: {r['title']}, Snapshot: {r['camera_snapshot']}, AT: {r['version_timestamp']}")

conn.close()

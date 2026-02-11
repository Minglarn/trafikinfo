
import os
import sqlite3
import json

def check_db():
    db_path = "d:\\antigravity\\trafikinfo\\trafikinfo\\data\\trafikinfo.db"
    if not os.path.exists(db_path):
        db_path = "data/trafikinfo.db"
    
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    print(f"--- Recent Events (from {db_path}) ---")
    cursor.execute("SELECT id, title, camera_snapshot, extra_cameras FROM traffic_events ORDER BY created_at DESC LIMIT 5")
    rows = cursor.fetchall()
    for row in rows:
        print(f"ID: {row['id']}")
        print(f"  Title: {row['title']}")
        print(f"  Snapshot: {row['camera_snapshot']}")
        try:
            extras = json.loads(row['extra_cameras'] or "[]")
            for i, ex in enumerate(extras):
                print(f"  Extra {i}: {ex.get('snapshot')}")
        except:
            print(f"  Extras: {row['extra_cameras']}")
    
    conn.close()

if __name__ == "__main__":
    check_db()

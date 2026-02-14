import sqlite3
import os

db_path = "d:/antigravity/trafikinfo/trafikinfo/data/trafikinfo.db"
conn = sqlite3.connect(db_path)
c = conn.cursor()

print("ID | Road | County | StartTime | UpdatedAt | Condition")
print("-" * 80)
c.execute("SELECT id, road_number, county_no, start_time, updated_at, condition_text FROM road_conditions WHERE road_number LIKE '%360%'")
rows = c.fetchall()
for r in rows:
    print(" | ".join(map(str, r)))

print("\nRecent RoadConditionVersion entries for 360000:")
print("-" * 80)
c.execute("SELECT road_condition_id, start_time, timestamp FROM road_condition_versions WHERE road_condition_id='360000' ORDER BY timestamp DESC LIMIT 5")
rows = c.fetchall()
for r in rows:
    print(" | ".join(map(str, r)))

conn.close()

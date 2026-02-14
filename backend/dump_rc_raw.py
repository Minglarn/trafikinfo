import sqlite3
import os

db_path = "d:/antigravity/trafikinfo/trafikinfo/data/trafikinfo.db"
if not os.path.exists(db_path):
    print(f"DB not found at {db_path}")
    exit(1)

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

print("ID | Road | County | Code | Text | UpdatedAt")
print("-" * 70)
cursor.execute("SELECT id, road_number, county_no, condition_code, condition_text, updated_at FROM road_conditions ORDER BY updated_at DESC LIMIT 20")
rows = cursor.fetchall()
for row in rows:
    print(" | ".join(map(str, row)))
conn.close()

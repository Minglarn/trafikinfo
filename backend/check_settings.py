import sqlite3
db_path = "d:/antigravity/trafikinfo/trafikinfo/data/trafikinfo.db"
conn = sqlite3.connect(db_path)
c = conn.cursor()
c.execute("SELECT value FROM settings WHERE key='selected_counties'")
row = c.fetchone()
print(f"Selected Counties: {row[0] if row else 'None'}")
conn.close()

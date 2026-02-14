import sqlite3
import datetime

DB_PATH = 'd:/antigravity/trafikinfo/trafikinfo/data/trafikinfo.db'

def dump_tables():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    print("\n=== SETTINGS ===")
    try:
        c.execute("SELECT key, value FROM settings WHERE key IN ('selected_counties', 'camera_radius_km')")
        for row in c.fetchall():
            print(f"{row[0]}: {row[1]}")
    except Exception as e:
        print(f"Error reading settings: {e}")

    print("\n=== CLIENT INTERESTS ===")
    try:
        c.execute("SELECT client_id, counties, last_active FROM client_interests")
        for row in c.fetchall():
            print(f"Client {row[0]}: Counties={row[1]}, Last Active={row[2]}")
    except Exception as e:
        print(f"Error reading client_interests: {e}")

    print("\n=== PUSH SUBSCRIPTIONS ===")
    try:
        c.execute("SELECT id, endpoint, counties FROM push_subscriptions")
        for row in c.fetchall():
            print(f"Sub {row[0]}: Counties={row[2]}, Endpoint={row[1][:30]}...")
    except Exception as e:
        print(f"Error reading push_subscriptions: {e}")

    conn.close()

if __name__ == "__main__":
    dump_tables()

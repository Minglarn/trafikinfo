import sqlite3
import json

DB_PATH = "data/trafikinfo.db"

def list_interests():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM client_interests")
    rows = cursor.fetchall()
    
    for row in rows:
        print(dict(row))
        
    conn.close()

if __name__ == "__main__":
    list_interests()

import sqlite3
import re
import os
from datetime import datetime

DB_PATH = "data/trafikinfo.db"

def merge_historical():
    if not os.path.exists(DB_PATH):
        print(f"Database not found at {DB_PATH}")
        return

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    # Find all events
    cursor.execute("SELECT * FROM traffic_events ORDER BY created_at DESC")
    rows = cursor.fetchall()

    # Group by base Situation ID
    # Pattern: SE_STA_TRISSID_N_SITID -> SITID
    situations = {}

    for row in rows:
        ext_id = row['external_id']
        match = re.search(r"TRISSID_\d+_(\d+)", ext_id)
        if match:
            sit_base = match.group(1)
            # Use the full TRISSID_SITID as the situation key
            sit_key = f"SE_STA_TRISSID_{sit_base}"
        else:
            sit_key = ext_id # Fallback

        if sit_key not in situations:
            situations[sit_key] = []
        situations[sit_key].append(row)

    merged_count = 0
    deleted_count = 0

    for sit_key, devi_rows in situations.items():
        if len(devi_rows) <= 1:
            continue
        
        # Merge logic
        first = devi_rows[0]
        merged_desc = []
        merged_restrictions = []
        merged_message_types = []
        
        start_time = first['start_time']
        end_time = first['end_time']
        
        for r in devi_rows:
            # Description
            if r['description'] and r['description'] not in merged_desc:
                merged_desc.append(r['description'])
            
            # Restrictions
            if r['traffic_restriction_type'] and r['traffic_restriction_type'] not in merged_restrictions:
                # Handle comma separated lists from previous partial runs
                parts = r['traffic_restriction_type'].split(', ')
                for p in parts:
                    if p not in merged_restrictions:
                        merged_restrictions.append(p)
            
            # Message Types
            if r['message_type'] and r['message_type'] not in merged_message_types:
                parts = r['message_type'].split(', ')
                for p in parts:
                    if p not in merged_message_types:
                        merged_message_types.append(p)
            
            # Times
            if r['start_time']:
                if not start_time or r['start_time'] < start_time:
                    start_time = r['start_time']
            if r['end_time']:
                if not end_time or r['end_time'] > end_time:
                    end_time = r['end_time']

        # Update the first record (we reuse the primary ID)
        new_desc = " | ".join(merged_desc)
        new_restr = ", ".join(merged_restrictions)
        new_mtype = ", ".join(merged_message_types)
        
        # Also clean up the external_id to match the new situation-based format
        # If the situation ID is just numbers, we might want SE_STA_TRISSID_NUMBERS
        # Based on my previous change, Situations have an 'Id' which we now use.
        
        cursor.execute("""
            UPDATE traffic_events 
            SET external_id = ?, 
                description = ?, 
                traffic_restriction_type = ?, 
                message_type = ?, 
                start_time = ?, 
                end_time = ?
            WHERE id = ?
        """, (sit_key, new_desc, new_restr, new_mtype, start_time, end_time, first['id']))
        
        # Delete redundant records
        other_ids = [str(r['id']) for r in devi_rows[1:]]
        cursor.execute(f"DELETE FROM traffic_events WHERE id IN ({','.join(other_ids)})")
        
        merged_count += 1
        deleted_count += len(other_ids)

    conn.commit()
    conn.close()
    print(f"Successfully merged {merged_count} historical situations (removed {deleted_count} duplicate deviations).")

if __name__ == "__main__":
    merge_historical()

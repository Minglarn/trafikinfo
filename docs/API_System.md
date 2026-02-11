# System API

The System API covers statistics, settings, and health monitoring.

## Statistics
`GET /api/stats`

Returns event distribution and counts.

**Parameters:**
- `hours` (int, optional): Rolling window statistics.
- `date` (string, optional): Fetch statistics for a specific calendar day (Format: `YYYY-MM-DD`).

---

## Settings 🔒
`GET /api/settings`: Fetch current configuration.
`POST /api/settings`: Update configuration.

**Keys:** `api_key`, `county_ids`, `mqtt_host`, `mqtt_port`, `mqtt_topic`, `retention_days`.

---

## Health & Status
`GET /api/status`

Returns the current health of the instance.

**Fields:**
- `setup_required`: True if no API key is configured.
- `stream_active`: Status of the connection to Trafikverket.
- `mqtt_connected`: Status of the MQTT broker connection.
- `event_count`: Total events in database.

---

## Database Management 🔒
`POST /api/reset`

**WARNING**: Permanently deletes all events, versions, and local camera snapshots. Use with caution.

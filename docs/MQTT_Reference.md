# MQTT Reference

Trafikinfo Flux publishes real-time traffic updates to an MQTT broker.

## Topic Structure
Default topic: `trafikinfo/events`

## Payload Schema
The payload is a JSON object.

### Core Fields
- `external_id`: Unique GUID from Trafikverket.
- `title`: Short title of the event.
- `location`: Human-readable location string.
- `severity_code`: Numerical severity (1-5, where 5 is critical).
- `severity_text`: "Ingen påverkan", "Stor påverkan", etc.
- `event_type`: "Situation" or "MeasuredData".
- `timestamp`: Generation time.

### Integration Fields
- `snapshot_url`: **Full absolute URL** to the locally saved camera image.
- `event_url`: **Full absolute URL** to open the specific event in the PWA app.
- `icon_url`: **Full absolute URL** to the locally proxied icon (includes `.png` for compatibility).
- `external_icon_url`: **Original Trafikverket URL** (public, no auth required).
- `mdi_icon`: **Material Design Icon** slug (e.g. `mdi:worker`) for native Home Assistant support.

### Camera Data
- `camera_name`: Name of the primary camera.
- `camera_snapshot`: Filename of the primary snapshot.
- `extra_cameras`: JSON string containing a list of nearby cameras and their snapshots.

## Usage in Home Assistant
See the `README.md` in the root for a YAML automation example using these fields.

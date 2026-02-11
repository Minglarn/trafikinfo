# Media API

The Media API handles snapshots, icons, and live camera proxies. All media is cached or stored locally for performance and offline availability in notifications.

## Local Snapshots
`GET /api/snapshots/{filename}`

Accesses a raw image file stored in the system. These filenames are provided in the `camera_snapshot` fields of the Events API and MQTT.

---

## Icon Proxy
`GET /api/icons/{icon_id}`

Proxies and caches Trafikverket's icons. 
- **Icons directory**: `/data/icons/`
- **Cache behavior**: If the icon exists locally, it's served immediately. Otherwise, it's fetched from Trafikverket, saved, and then served.

---

## Camera Proxy (Live)
`GET /api/cameras/{camera_id}/image`

Fetches a live, up-to-date image from a specific road camera.

**Parameters:**
- `fullsize` (bool, default=false): If true, attempts to fetch the high-resolution version (road.infrastructure namespace) if available.

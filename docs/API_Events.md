# Events API

The Events API handles all traffic information streamed from Trafikverket.

## Get Current Events
`GET /api/events`

Returns a list of currently active traffic events. Expired events are automatically excluded.

**Parameters:**
- `limit` (int, default=50): Number of events to return.
- `offset` (int, default=0): For pagination.
- `hours` (int, optional): Only return events created within the last N hours.

**Example Response:**
```json
[
  {
    "id": 123,
    "external_id": "GUID...",
    "title": "Vägarbete på E4",
    "description": "Asfalteringsarbete...",
    "location": "Södertälje",
    "severity_text": "Liten påverkan",
    "camera_snapshot": "GUID_123.jpg",
    "extra_cameras": [...],
    "history_count": 2
  }
]
```

## Get Event History
`GET /api/events/{external_id}/history`

Returns all saved versions of a specific event, allowing you to track how the information (or images) changed over time.

---

## Real-time Stream (SSE)
`GET /api/stream`

A Server-Sent Events (SSE) endpoint that pushes updates instantly.

**Events:**
- `message`: Contains the JSON payload of a new or updated event.

# API Overview

Welcome to the Trafikinfo Flux API. This API provides real-time access to Swedish traffic events, camera images, and system statistics.

## Base URL
The API is served from the root of your installation, typically:
`http://[YOUR_IP]:7081/api`

## Authentication
Most "Read" endpoints are public. However, administrative endpoints require a custom header for authentication.

- **Header Name**: `X-Admin-Token`
- **Value**: Your plain-text `ADMIN_PASSWORD` (as defined in `docker-compose.yml` or `.env`).

Endpoints requiring authentication are marked with 🔒 in this documentation.

## Common Response Formats
The API primarily returns JSON. Errors are returned with appropriate HTTP status codes and a detail message:

```json
{
  "detail": "Error message description"
}
```

## Versioning
The current version of the API can be checked at:
`GET /api/version`

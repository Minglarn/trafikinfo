# Changelog

All notable changes to this project will be documented in this file.

## [1.1.0] - 2026-02-10

### Added
- **Map Integration**: Integrated interactive Leaflet maps for event location visualization.
- **Statistics View**: Added comprehensive dashboard for event distribution and trends.
- **Audio Notifications**: Implemented chime alerts for new events with customizable settings.
- **Infinite Scroll**: Dynamic loading for real-time feed and historical data boards.
- **Icon Support**: Added support for official Trafikverket event icons.
- **Enhanced UI**: Refined card layouts with expanded map previews and removed redundant metadata.
- **Timezone Support**: Configured container to respect `TZ=Europe/Stockholm` for accurate logging.
- **MQTT Authentication**: Added support for authenticated MQTT brokers.
- **Debug Mode**: Toggleable backend debug logging via environment variables.

### Fixed
- Resolved audio playback errors (`NotSupportedError`) in production builds.
- Fixed React scope errors in `HistoryBoard.jsx`.
- Cleared Chrome DOM warnings regarding complex form structures in Settings.
- Optimized Docker build context using `.dockerignore`.
- Suppressed false-positive ESLint build blockers in the Docker environment.

## [1.0.0] - 2026-02-09

### Added
- Initial release of Trafikinfo Flux.
- Swedish Trafikverket API integration via SSE.
- Real-time road event streaming (Situation).
- County-based filtering.
- MQTT publisher for traffic events.
- SQLite database for event history.
- React-based Web GUI with real-time feed.
- Docker Compose orchestration.

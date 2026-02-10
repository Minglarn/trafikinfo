# Changelog

All notable changes to this project will be documented in this file.

## [26.2.10] - 2026-02-10

### Added
- **County Filtering**: Added full support for selecting and filtering traffic events by Swedish counties (Län).
- **High-Resolution Snapshots**: Implemented capture of full-size (100-300KB) camera images for improved detail.
- **Geographic Settings UI**: New settings section for geographic monitoring with interactive county selector.
- **MQTT Credentials**: Support for `MQTT_USER` and `MQTT_PASSWORD` in `.env`.
- **CalVer Support**: Switched to Calendar Versioning (YY.MM.DD) for better release tracking.

### Fixed
- Resolved `ReferenceError` in Settings UI due to missing icon imports.
- Fixed `TypeError` in background worker when starting stream with county filters.
- Corrected camera snapshot download logic to prioritize `_fullsize.jpg` variants.

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

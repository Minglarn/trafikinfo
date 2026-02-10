# Changelog

All notable changes to this project will be documented in this file.

## [26.2.13] - 2026-02-10

### Added
- **Infinite Scroll**: Truly dynamic loading for the camera grid with backend-supported pagination.
- **Visibility Toggles**: New user control to show/hide "Övriga kameror" (non-favorite cameras).
- **Server-side Search**: Optimized camera search that queries the database directly for performance.

### Changed
- **Paginated API**: Refactored `/api/cameras` to support `limit`, `offset`, and `search` filters.

## [26.2.12] - 2026-02-10

### Fixed
- **Database Migration**: Added startup check to automatically add missing columns (`icon_id`, `pushed_to_mqtt`, etc.) to existing databases, preventing crash on restart.

## [26.2.11] - 2026-02-10

### Added
- **Modal Image Scaling**: Implemented full-screen image viewing by removing CSS width constraints in `EventModal.jsx`.
- **Historical Backfill**: Added `backfill_cameras.py` to retrofit existing events with camera data.

### Fixed
- **API 400 Error**: Removed invalid `FullSizePhotoUrl` columns from Trafikverket API query.
- **Image Integrity**: Added 5KB minimum size check to prevent saving corrupted/partial snapshots.
- **Layout Stability**: Added `flex-shrink-0` to camera slots to prevent layout collapse.

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

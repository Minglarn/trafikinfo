# Changelog

All notable changes to this project will be documented in this file.

## [26.2.89] - 2026-02-16

### 🚀 New Features
- **Simplified Real-time Logic**: All events that are currently active (or starting within 30 minutes) are now shown in the "Realtid" feed, regardless of their total duration. This ensures long-term roadworks that are currently active are not hidden in the "Planerat" tab.

### 🐛 Bug Fixes
- **National Event Visibility**: Fixed a bug where National/Global events (County ID 0) were hidden when a specific county filter was active. They are now always included.
- **Improved Filter Sync**: Synced status counts and feed queries for perfect consistency between tabs.

## [26.2.87] - 2026-02-16

### 🎨 UI & UX
- **Pill & Tag System**: Redesigned event metadata badges into a two-tier layout (Primary vs Supplemental) for a cleaner, less cluttered look.
- **Robust Location Trimming**: Fixed issue with redundant county suffixes (e.g., "i Gävleborgs län (X)") using a case-insensitive regex that handles all county names correctly.
- **Mobile optimization**: Supplemental tags are now hidden on mobile to prioritize clarity.

## [26.2.84] - 2026-02-16

### 🚀 New Features
- **Admin Dashboard: Push Subscription Management**: Expanded admin view to monitor and delete push subscriptions with detailed topic information.
- **Mobile Header Status**: Replaced "LIVE STREAM" text with a compact green status dot on mobile.
- **Mobile Badge Reduction**: Hidden redundant 'Message Type' and 'County' badges on small screens.

## [26.2.82] - 2026-02-16

### 🚀 New Features
- **Road Condition Warning Filter**: Users can now choose which road condition warnings trigger push notifications (e.g., Halka, Snörök, Snödrev, Hård vind, Snöfall). New checkbox UI in Settings under "Väglagsvarningar att bevaka".
- **`SECURE_COOKIES` Environment Variable**: New `docker-compose.yml` setting to control session cookie security. Defaults to `false` for HTTP/LAN access. Set to `true` when behind an HTTPS reverse proxy.
- **Settings API (GET)**: Added `GET /api/settings` endpoint so the Settings page can read configuration.

### 🐛 Bug Fixes
- **Settings 401 Fix**: Resolved 401 Unauthorized error on the Settings page by adding a GET endpoint and relaxing POST auth from admin-only to app-level.
- **LAN Cookie Fix**: Fixed session cookies not being sent over HTTP when accessing via LAN IP (e.g., `http://192.168.1.x:7081`). Cookie `secure` flag is now configurable via `SECURE_COOKIES` environment variable.
- **crypto.randomUUID Fallback**: Added fallback UUID generation for non-secure contexts (HTTP) where `crypto.randomUUID()` is unavailable.
- **Mobile Padding**: Increased bottom padding to prevent content from being hidden behind mobile navigation bar.

### 📝 Documentation
- **README**: Expanded security documentation with detailed `SECURE_COOKIES` explanation, including HTTP vs HTTPS table and push notification clarification.

## [26.2.81] - 2026-02-15

### 🚀 New Features
- **No-Login Mode**: Added `NO_LOGIN_NEEDED` environment variable to bypass authentication for local/trusted deployments.
- **Password Usage Tracking**: System now tracks and displays which password (e.g., "family", "guest") was used for each session.
- **Device Fingerprinting**: Admin dashboard now shows friendly device names (e.g., "iPhone", "Windows") and icons for active clients.

### 📝 Documentation
- **Readme Update**: Added documentation for `NO_LOGIN_NEEDED` and updated `docker-compose` examples.
- **Startup Banner**: Added professional ASCII art banner and version print on startup.

### 🐛 Bug Fixes
- **Version Sync**: Fixed issue where Admin Dashboard displayed a hardcoded version number. Now fetches dynamically from backend.

## [26.2.80] - 2026-02-15

### 🚀 New Features
- **Consolidated Admin Dashboard**: Unified interface for monitoring, connectivity, and system settings.
- **Client Monitoring**: Real-time tracking of active clients, user agents, and push subscriptions.
- **New Admin Tab**: Dedicated "Admin" tab in Sidebar and BottomNav, replacing the legacy login button.

### 🛠 Improvements
- **Settings Refactor**: Moved system-wide settings (MQTT, API Keys) to the Admin Dashboard.
- **Client Interest Sync**: Improved backend endpoint for syncing client county preferences.
- **Navigation**: Smoother transitions and better mobile support for admin features.

### 🐛 Bug Fixes
- **Fixed Frontend Crash**: Resolved `ReferenceError` caused by missing `MobileHeader` import.
- **Fixed Backend Crash**: Resolved `NameError` in `main.py` related to dependency injection order.
- **Fixed Settings Sync**: Resolved `422 Unprocessable Entity` error when saving user preferences.
- **Fixed Navigation Icon**: Resolved `Illegal Constructor` error by correctly importing lock icon.

## [26.2.79] - 2026-02-15

### Added
- **Session Cookie Authentication**: Replaced Nginx Basic Auth with backend-managed sessions for better PWA compatibility (especially iOS).
- **Multi-Password Support**: Added support for comma-separated passwords in `APP_PASSWORD` environment variable.
- **SessionGate Component**: New premium full-screen entry point and login portal for the app.
- **Enhanced Security**: Secured all backend data endpoints (Events, Cameras, SSE Stream) with signed session verification.

## [26.2.78] - 2026-02-15

### Added
- **Unified SSE Stream**: Centralized `EventSource` management in `App.jsx` to ensure a stable connection across tab transitions.
- **Real-time Event Distribution**: Implemented custom window events for efficient cross-component communication.
- **Push Simulation Endpoint**: Added `/api/debug/simulate-event` for precise notification testing and verification.

### Changed
- **Live Tab Counters**: Replaced periodic 30-second polling with real-time SSE updates for all tab badges.

### Fixed
- **Push Notification Logic**: Resolved a critical bug where traffic event notifications were accidentally skipped in the backend.
- **SSE Stability**: Fixed the issue where switching tabs caused the "SSE Stream connected" cycle to restart.

## [26.2.77] - 2026-02-15

### Added
- **Road Camera Dashboard**: New unified view selector for Map and Grid (Favorites) modes.
- **Client-Side Favorites**: Local storage-based favorite system for cameras (no login required).
- **High-Resolution Modals**: Full-screen snapshots now request high-resolution (`fullsize=true`) images on desktop.
- **Map Clustering**: Re-implemented marker clustering with fixed CSS and optimized radius (80px).

### Changed
- **Refresh Optimization**: Implemented a 5-minute silent refresh in the camera grid to eliminate UI flickering.
- **Mobile Experience**: Disabled heavy full-screen expansion on small screens for better usability.
- **Resource Management**: Removed non-favorite camera loading in grid to significantly reduce Trafikverket API load.

### Fixed
- **API Filtering**: Added `ids` parameter support to the backend `/api/cameras` for efficient targeted fetching.
- **Import Errors**: Fixed a crash caused by a missing `Star` icon import in the map view.

## [26.2.57] - 2026-02-14

### Added
- **Surface Weather (Väglag)**: Integrated detailed road surface metrics (grip, road temperature, ice depth, snow depth) from Trafikverket.
- **Weather Enrichment**: Automated atmospheric data (air temp/wind) enrichment for traffic events, road conditions, and cameras.
- **Dynamic Tab Counters**: Sidebar badges now track *new* items since the last visit per tab, with automatic reset on click.
- **Security Hardening**: Converted factory reset to a secure POST endpoint with confirmation payload.

### Changed
- **UI Refinement**: Relocated weather indicators in `EventFeed` to be perfectly aligned with the timestamp in the header.
- **Sync Optimization**: Changed camera and icon synchronization to a 24-hour cycle to reduce API load.
- **MQTT Topics**: Split MQTT publishing into specific topics for `traffic` and `road_conditions`.
- **Deduplication**: Improved road condition merging logic to prevent duplicate notifications.

### Fixed
- **API Versioning**: Fixed 400 errors by switching to Trafikverket API v2.1 (WeatherMeasurepoint).
- **Stability**: Resolved `NameError` bugs (`math`, `time`) and handled schema variations in XML responses.
- **PWA Reliability**: Improved SSE connection handling and added background visibility sync.

## [26.2.17] - 2026-02-11

### Added
- **PWA Support**: Native app installability, manifest, and service worker for offline/standalone use.
- **Inline Preview Expansion**: Replaced camera modals with seamless inline expansion for both maps and cameras.
- **Smart Camera Matching**: Proximity-first logic that matches nearby cameras even without road labels (e.g. at Salem/E4).
- **Multi-Camera Support**: Events now display all nearby cameras (primary + extra vantage points) with a visual indicator and expanded list view.

### Changed
- **Direct Snapshots**: Unified camera/map expansion interactions for a cleaner feed UI.
- **Performance**: Optimized service worker strategy (Network First) for faster asset loading.

### Fixed
- **Layout Integrity**: Restored side-by-side desktop view for camera and map previews.
- **Stability**: Fixed a `ReferenceError` crash during event updates related to legacy modal state.
- **PWA Manifest**: Fixed 401 Unauthorized error when fetching manifest under certain proxy setups.

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

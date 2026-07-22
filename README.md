# Yard Tracker

Yard Tracker is a private-by-default, self-hosted household application for remembering how plants, landscaping, and outdoor structures are cared for over time.

Create a card for a group such as “Azaleas,” attach care plans such as applying fertilizer every 90 days, log completed work, and let Yard Tracker calculate what is due next. The same model handles seasonal treatments, one-time work, and long-interval jobs such as pressure-washing a fence.

Yard Tracker is intended for one household on a trusted LAN. Each household installs and owns its application, database, photos, SMTP configuration, and backups.

## Features

The clean foundation, corrected legacy importer, date-only schedule engine, authenticated API, and responsive household dashboard are implemented. The dashboard currently supports:

- card summaries for plants, landscaping, and outdoor wood;
- relative, fixed seasonal, and one-time due calculations;
- location, status, and text filters;
- expandable care plans and recent maintenance history;
- household-level attention counts and a five-day forecast;
- automatic SQLite migrations at application startup;
- shared-passphrase login with revocable 30-day household sessions;
- authenticated editing for household settings, locations, cards, maintenance plans, and completion records;
- private card-cover and dated maintenance photos, normalized to WebP with embedded metadata removed;
- a ZIP-code-based five-day forecast with three-hour caching and a stale-cache fallback for internet outages;
- configurable daily, weekly, or monthly household email digests; and
- nightly, atomic ZIP backups with configurable retention; and
- native macOS and Docker Compose installations.

This repository is preparing for its first public release. Interfaces and backup formats may change before version 1.0.

## Quick start with Docker Compose

Requirements: Docker Engine with the Compose plugin, or Docker Desktop.

```bash
cp .env.example .env
mkdir -p local-data local-backups
docker compose up --detach --build
```

Open `http://localhost:4173` and create the shared household passphrase. For another device on the LAN, use the host's `.local` name or LAN IP.

The container runs as an unprivileged user with a read-only root filesystem. Private state is stored in ignored host directories:

- `./local-data` for SQLite and photos; and
- `./local-backups` for retained backup archives.

In Yard Tracker settings, use `/backups` as the Docker backup destination. To place either directory elsewhere, set `YARD_TRACKER_HOST_DATA_DIR` or `YARD_TRACKER_HOST_BACKUP_DIR` in `.env` before starting Compose. On Linux, those host directories must be writable by UID 1000.

See the complete [Docker Compose installation and recovery guide](docs/docker-compose.md), including Raspberry Pi and SSD guidance.

```bash
docker compose ps
docker compose logs --follow yard-tracker
docker compose up --detach --build
```

## Safety boundaries

- Household exports, photos, credentials, and runtime databases never belong in this repository.
- Tests must use `:memory:` or a data directory inside `YARD_TRACKER_TEST_ROOT`.
- Tests must never inherit or use a production database URL.
- Never use a live household directory for development or tests.

## Development

```bash
pnpm install
pnpm check:public
pnpm check
pnpm test
pnpm dev
```

Copy `.env.example` to `.env` and choose a private data directory before running a persistent local instance.

## Native macOS installation

The native path is a per-user `launchd` service for an always-on Mac. It runs only the compiled Node server and SQLite—Docker, Vite, and the package manager are not resident processes.

Requirements:

- macOS with the household user logged in;
- Node.js 22 or newer; and
- pnpm 11.

From the project directory:

```bash
cp .env.example .env
chmod 600 .env
# Edit .env and set an absolute private YARD_TRACKER_DATA_DIR.
pnpm macos:install
```

The installer installs locked dependencies, runs the type-check and test suite, builds production assets, registers `com.yardtracker.household`, starts it, and checks `/api/health`. It can safely be rerun after an application update.

```bash
pnpm macos:status
pnpm macos:uninstall
```

Uninstalling only stops and removes the service registration. Household data, `.env`, backups, and logs are retained. See the [native Mac installation and recovery runbook](docs/macos-native-install.md) for paths, LAN access, updates, rollback, and restore steps.

## Email digests

Digest recipients, cadence, day, and local delivery time are configured under household settings. SMTP credentials stay in the host environment and are not stored in SQLite or included in backups. Configure `SMTP_HOST` and `SMTP_FROM`; add the port, TLS mode, username, and password required by the mail provider.

The scheduler checks once per minute while Yard Tracker is running. A temporary delivery failure can be retried, but the application records successful periods and will send at most one successful digest per configured daily, weekly, or monthly period. Monthly delivery days are limited to 1–28 so every month has the selected day.

## Nightly backups

Set an absolute path to an existing, writable, dedicated backup folder under household settings. This may be a local folder or a folder already synchronized by iCloud Drive, Dropbox, or Google Drive. Yard Tracker does not need credentials for the sync provider.

After 2:00 AM in the household timezone, the running scheduler creates at most one backup per day. Each `yard-tracker-backup-YYYY-MM-DD.zip` contains:

- a consistent SQLite snapshot;
- private uploaded photos; and
- a small backup-format manifest.

The archive is built and copied as a private `.partial` file, then renamed into place only after completion. Retention pruning only removes expired ZIP files with Yard Tracker's own backup filename prefix. The default retention is 30 days. A manual **Back up now** action is also available through the authenticated application API.

Backups should be periodically test-restored before relying on them. Cloud synchronization is an additional copy, not a substitute for checking that archives are valid and available.

## License

Licensed under the [Apache License 2.0](LICENSE).

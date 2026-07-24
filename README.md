# Home Maintenance Tracker

[![CI](https://github.com/mcornelia/home-maintenance-tracker/actions/workflows/ci.yml/badge.svg)](https://github.com/mcornelia/home-maintenance-tracker/actions/workflows/ci.yml)

Home Maintenance Tracker is a private-by-default, self-hosted application for remembering how an entire property is cared for over time—from plants and exterior structures to appliances, mechanical systems, and safety equipment.

Create an asset such as “Azaleas” or “Main HVAC,” attach maintenance plans, log completed work, and let the application calculate what is due next. The same model handles seasonal treatments, recurring appliance care, one-time work, and long-interval jobs.

Each installation is named by its household. “Ravenwood” is one example; yours might be “Smith House,” “Lake Cottage,” or simply “Home.” The selected name appears throughout the dashboard and email summaries.

The application is intended for one household on a trusted LAN. Each household installs and owns its application, database, photos, SMTP configuration, and backups.

## Features

- A whole-property overview of overdue, due-soon, and recently completed work
- Separate Grounds & Exterior and Household areas with search, category, location, and status filters
- Relative, seasonal, one-time, paused, and unscheduled maintenance plans
- Completion history that remains intact when a future maintenance plan is removed
- Private household masthead, asset covers, and dated maintenance photos
- ZIP-code weather and a five-day forecast for outdoor planning
- A shared household passphrase with revocable 30-day sessions
- Configurable daily, weekly, or monthly email digests
- Automatic SQLite migrations and atomic nightly ZIP backups
- Native macOS and Docker Compose installation paths

## How it works

1. Add an asset: a plant grouping, appliance, mechanical system, safety device, or exterior structure.
2. Attach one or more maintenance plans with instructions and a schedule.
3. Log work when it is completed; the next due date is calculated automatically.
4. Use the overview to see what needs attention across the entire property.

Everything stays on the host you control. Runtime databases, photos, credentials, and backups are excluded from the repository.

This repository is preparing for its first public release. Interfaces and backup formats may change before version 1.0.

## Quick start with Docker Compose

Requirements: Docker Engine with the Compose plugin, or Docker Desktop.

```bash
cp .env.example .env
mkdir -p local-data local-backups
docker compose up --detach --build
```

Open `http://localhost:4173` and create the shared household passphrase. For another device on the LAN, use the host's `.local` name or LAN IP.

Use **Settings → Household name** to choose the name shown in the browser title, navigation, masthead, summaries, and email digest.

The container runs as an unprivileged user with a read-only root filesystem. Private state is stored in ignored host directories:

- `./local-data` for SQLite and photos; and
- `./local-backups` for retained backup archives.

In household settings, use `/backups` as the Docker backup destination. To place either directory elsewhere, set `YARD_TRACKER_HOST_DATA_DIR` or `YARD_TRACKER_HOST_BACKUP_DIR` in `.env` before starting Compose. On Linux, those host directories must be writable by UID 1000.

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

The scheduler checks once per minute while Ravenwood is running. A temporary delivery failure can be retried, but the application records successful periods and will send at most one successful digest per configured daily, weekly, or monthly period. Monthly delivery days are limited to 1–28 so every month has the selected day.

## Nightly backups

Set an absolute path to an existing, writable, dedicated backup folder under household settings. This may be a local folder or a folder already synchronized by iCloud Drive, Dropbox, or Google Drive. Ravenwood does not need credentials for the sync provider.

After 2:00 AM in the household timezone, the running scheduler creates at most one backup per day. Each `yard-tracker-backup-YYYY-MM-DD.zip` contains:

- a consistent SQLite snapshot;
- private uploaded photos; and
- a small backup-format manifest.

The archive is built and copied as a private `.partial` file, then renamed into place only after completion. Retention pruning only removes expired ZIP files with the application's legacy-compatible backup filename prefix. The default retention is 30 days. A manual **Back up now** action is also available through the authenticated application API.

Backups should be periodically test-restored before relying on them. Cloud synchronization is an additional copy, not a substitute for checking that archives are valid and available.

## License

Licensed under the [Apache License 2.0](LICENSE).

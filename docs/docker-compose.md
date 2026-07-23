# Docker Compose installation

Docker Compose is the standard cross-platform installation for a household server, including a Raspberry Pi 5 with a 64-bit operating system and SSD storage.

## Requirements

- Docker Engine with the Compose plugin, or Docker Desktop
- a 64-bit host supported by the Node.js base image
- a trusted household LAN
- persistent local or SSD storage

Do not place the SQLite data directory on a network filesystem. Cloud-sync only completed backup archives, not the live database.

## Install

```bash
cp .env.example .env
mkdir -p local-data local-backups
chmod 700 local-data local-backups
docker compose up --detach --build
docker compose ps
```

On Linux and Raspberry Pi OS, the directories must be writable by UID 1000, which is the unprivileged user inside the image. Choose alternate host paths in `.env` when the SSD is mounted elsewhere:

```dotenv
YARD_TRACKER_HOST_DATA_DIR=/srv/yard-tracker/data
YARD_TRACKER_HOST_BACKUP_DIR=/srv/yard-tracker/backups
YARD_TRACKER_HOST_PORT=4173
```

The paths on the right side of the Compose mounts remain `/data` and `/backups`. Configure `/backups` as the backup destination in Ravenwood settings.

Open `http://SERVER-HOSTNAME.local:4173` from a device on the same LAN and create the shared household passphrase.

## SMTP

Set the SMTP host, port, TLS mode, username, password, and sender in `.env`. Set recipients and digest cadence in the application. Keep `.env` mode `600` and never commit it.

## Operate

```bash
docker compose ps
docker compose logs --follow yard-tracker
docker compose restart yard-tracker
docker compose down
```

`docker compose down` removes the container and network but leaves the bind-mounted data and backup directories intact. Do not add `--volumes` to household recovery instructions.

## Update

Confirm a recent backup, update the source checkout, then run:

```bash
docker compose build --pull
docker compose up --detach
docker compose ps
```

Verify login, dashboard data, one photo, weather, and a maintenance record after the update.

## Restore

1. Stop the container with `docker compose down`.
2. Copy the current host data directory to a dated holding directory.
3. Extract a chosen archive into a temporary directory.
4. Confirm `manifest.json`, `yard-tracker.sqlite`, and the expected `uploads/` files exist.
5. Replace the contents of the host data directory from the extracted archive.
6. Restore ownership for UID 1000 and owner-only permissions.
7. Start Compose and verify household data before removing the holding copy.

Never restore over a running database.

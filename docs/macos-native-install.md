# Native Mac installation and recovery

This is the low-overhead installation path for an always-on household Mac. Yard Tracker runs as a user LaunchAgent after that macOS user logs in. Its steady-state application processes are one Node process and SQLite; Docker is not involved.

## 1. Prepare the Mac

Install Node.js 22 or newer and pnpm 11, then place the Yard Tracker project in a stable directory that will not be renamed or moved while the service is installed.

Create the private configuration:

```bash
cp .env.example .env
chmod 600 .env
```

Set `YARD_TRACKER_DATA_DIR` to a dedicated absolute path outside the repository. A suitable example is:

```dotenv
YARD_TRACKER_DATA_DIR=/Users/your-mac-account/Library/Application Support/Yard Tracker/data
HOST=0.0.0.0
PORT=4173
TZ=America/New_York
```

Do not commit `.env`. SMTP credentials belong there; recipients and digest timing are configured in Yard Tracker itself.

## 2. Install and verify

```bash
pnpm macos:install
```

The installer performs the following checks before it registers the service:

1. verifies macOS, Node 22+, pnpm, `.env`, and a safe absolute data directory;
2. installs exactly the dependency versions in `pnpm-lock.yaml`;
3. runs the TypeScript check, all tests, and the production build;
4. writes a private LaunchAgent property list;
5. starts or replaces the existing service; and
6. waits for the local health endpoint to respond.

Check it later with:

```bash
pnpm macos:status
curl --fail http://127.0.0.1:4173/api/health
```

Service and log locations:

- LaunchAgent: `~/Library/LaunchAgents/com.yardtracker.household.plist`
- standard log: `~/Library/Logs/Yard Tracker/yard-tracker.log`
- error log: `~/Library/Logs/Yard Tracker/yard-tracker-error.log`

If macOS asks whether Node may accept incoming connections, allow it on private networks. With `HOST=0.0.0.0`, phones and laptops on the same LAN can use `http://MAC-HOSTNAME.local:4173`. Keep the shared passphrase enabled even on a trusted LAN.

## 3. Configure backups

In Yard Tracker settings, choose an existing, writable, dedicated folder. It can be local or inside an already-configured sync client:

- iCloud Drive: a folder beneath the Mac user's iCloud Drive;
- Dropbox: a folder beneath the local Dropbox directory; or
- Google Drive: a folder beneath the local Google Drive mount.

The sync client—not Yard Tracker—handles cloud credentials and transfer. Confirm that a completed `.zip` appears remotely after the first nightly run. Keep the default 30-day retention until a tested household policy replaces it.

## 4. Update the application

First confirm that a recent backup exists. Update the working tree through the chosen source-control workflow, then rerun:

```bash
pnpm macos:install
```

The installer rebuilds and replaces the service. Startup applies database migrations automatically. Verify login, dashboard loading, one card, weather, photo access, and `/api/health`.

## 5. Stop or remove the service

```bash
pnpm macos:uninstall
```

This removes only the LaunchAgent registration and its property list. It intentionally preserves the application checkout, `.env`, database, photos, backups, and logs.

## 6. Restore a backup

Treat restoration as a deliberate maintenance operation:

1. stop Yard Tracker with `pnpm macos:uninstall`;
2. make a dated copy of the current data directory rather than deleting it;
3. extract the chosen backup into a temporary directory;
4. confirm it contains `manifest.json`, `yard-tracker.sqlite`, and the expected `uploads/` files;
5. replace the data directory's SQLite database and uploads from the extracted archive;
6. set the data directory and uploads to owner-only access; and
7. rerun `pnpm macos:install`, then verify the key user flows.

Never restore directly over a running SQLite database. Retain the pre-restore copy until both household members confirm the restored data and photos.

## Rollback triggers

Stop and restore the prior application/data state if any of these occur after an update:

- automatic migration or startup fails repeatedly;
- login or dashboard access fails for both household devices;
- cards, maintenance history, or photos are unexpectedly missing;
- the service enters a restart loop; or
- a newly created maintenance record does not survive a controlled restart.

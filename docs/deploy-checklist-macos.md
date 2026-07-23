# Deploy checklist: native household Mac

**Deployment:** Ravenwood native Mac LaunchAgent
**Deployer:** Household administrator

## Before deployment

- [ ] Mac has Node.js 22+ and pnpm 11.
- [ ] Project is in a stable, private directory.
- [ ] `.env` exists, is mode `600`, and contains no example data path.
- [ ] `YARD_TRACKER_DATA_DIR` is an absolute, dedicated, owner-only directory outside the repository.
- [ ] `HOST=0.0.0.0` only if LAN access is intended.
- [ ] SMTP credentials, if configured, are not present in tracked files.
- [ ] A recent Ravenwood backup exists before an update.
- [ ] `pnpm check`, `pnpm test`, and `pnpm build` pass.
- [ ] Database migrations have passed against test databases.
- [ ] The restore procedure and rollback triggers have been reviewed.

## Deployment

- [ ] Run `pnpm macos:install` while logged in as the service owner.
- [ ] Confirm the installer reports a passing health check.
- [ ] Run `pnpm macos:status`.
- [ ] Open Ravenwood locally on the Mac.
- [ ] Open Ravenwood from an iPhone or MacBook on the household LAN.
- [ ] Verify login, overview, filtering, one asset, activity history, weather, and a private photo.
- [ ] Create a harmless test maintenance record, restart the service, and confirm it persists.
- [ ] Review both Ravenwood log files for a restart loop or recurring errors.

## After deployment

- [ ] Configure digest recipients and cadence.
- [ ] Configure the dedicated backup destination and 30-day retention.
- [ ] Confirm SMTP delivery without sending more than one digest for the period.
- [ ] Confirm the next completed backup appears in the local destination and remote sync provider.
- [ ] Test-extract a backup and inspect its manifest, SQLite snapshot, and uploads.
- [ ] Record the deployed application revision and deployment date.

## Roll back when

- The health endpoint remains unavailable after 60 seconds.
- The LaunchAgent repeatedly restarts.
- Login, card data, activity history, or photos are missing or inaccessible.
- A database migration fails.
- A maintenance record fails to persist across restart.

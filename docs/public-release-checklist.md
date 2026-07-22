# Public release checklist

## Repository boundary

- [x] Clean nested Git repository has no remote and no inherited history.
- [x] Runtime data, exports, databases, photos, backups, logs, and `.env` are ignored.
- [x] Automated public-boundary scan passes.
- [x] Test fixtures use fictional identities and neutral locations.
- [x] Apache License 2.0 selected and `LICENSE` added.
- [x] Final candidate committed from a clean index.

## Quality

- [x] TypeScript check passes.
- [x] Thirty application tests pass.
- [x] Production application build passes.
- [x] Native macOS service scripts and generated plist structure are validated.
- [x] Docker image builds and its live container health check passes in GitHub Actions.
- [x] CI passes from the public GitHub repository.

## Documentation and community

- [x] Docker Compose quick start and operations guide.
- [x] Native macOS install and recovery guide.
- [x] Contribution and private-data rules.
- [x] Security reporting policy.
- [x] Issue and pull-request templates.
- [x] Changelog initialized.
- [ ] First-release notes finalized.

## Publication

- [x] Create `mcornelia/yard-tracker` without starter files.
- [x] Add the new GitHub repository as `origin`.
- [x] Push `main` only after reviewing the exact first commit.
- [x] Enable private vulnerability reporting and secret scanning with push protection.
- [x] Confirm Actions permissions are read-only by default.
- [x] Confirm the issue-template security link resolves.
- [x] Confirm no household deployment URL appears in repository metadata.

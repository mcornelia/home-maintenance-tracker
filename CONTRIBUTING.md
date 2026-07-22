# Contributing

Thank you for helping make Yard Tracker useful to self-hosting households.

## Ground rules

- Never commit household exports, addresses, ZIP codes, photos, email addresses, credentials, databases, backups, or logs.
- Use fictional `example.com` identities and neutral locations in fixtures.
- Preserve the private-by-default, single-household deployment model.
- Include tests for behavior changes and migrations for schema changes.
- Keep native macOS and Docker installations working unless a change explicitly replaces them.

## Development

```bash
pnpm install
pnpm check:public
pnpm check
pnpm test
pnpm build
pnpm dev
```

Use only `:memory:` databases or test data roots created for the test suite. Do not point tests at a household data directory.

## Pull requests

Describe the user-facing change, privacy impact, migration behavior, and verification performed. Screenshots must contain fictional data and must not reveal a home address, device name, email address, ZIP code, or recognizable private landscaping photo.

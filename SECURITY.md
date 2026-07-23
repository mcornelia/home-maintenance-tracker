# Security policy

## Supported versions

Until the first stable release, security fixes are made on the latest `main` branch.

## Reporting a vulnerability

Please use the repository's private **Report a vulnerability** workflow under GitHub Security Advisories. Do not open a public issue containing exploit details, household data, deployment URLs, addresses, ZIP codes, photos, email addresses, credentials, databases, or backups.

Include the affected revision, impact, reproduction steps using fictional data, and any suggested mitigation. Maintainers will acknowledge a report as soon as practical and coordinate disclosure after a fix is available.

## Deployment boundary

Ravenwood is designed for a trusted household LAN behind a router/firewall. It is not hardened for direct exposure to the public internet. Operators are responsible for host updates, network access, SMTP credentials, backup-provider security, and testing restores.

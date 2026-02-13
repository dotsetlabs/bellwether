---
title: Compatibility Policy
sidebar_position: 8
---

# Compatibility Policy

Bellwether follows strict semantic versioning with explicit deprecation rules.

## Versioning Guarantees

## Patch Releases (`x.y.Z`)

- No intentional breaking CLI/config/report changes
- Bug fixes, docs corrections, and reliability improvements only

## Minor Releases (`x.Y.z`)

- Backward-compatible feature additions
- New optional config fields and commands may be added
- Existing behavior may be improved, but not broken by default

## Major Releases (`X.y.z`)

- Breaking changes are allowed only with migration guidance
- Changelog includes explicit migration notes and removed surface area

## Deprecation Policy

- Deprecated features are announced in `CHANGELOG.md` before removal.
- Deprecations remain available for at least one minor release before removal.
- Removals happen only in a major release unless required for critical security reasons.

## Baseline and Report Compatibility

- JSON report schemas are versioned and published.
- Same-major baseline compatibility is maintained whenever feasible.
- If baseline format changes require migration, migration guidance is included in release notes.

## Action and Docs Pinning

- GitHub Action examples pin explicit semver tags.
- Documentation should reference the current package version for copy-paste reliability.

## Support Window

- Current major version is supported for fixes and documentation updates.
- Security policy reflects the currently supported major line.

# Roadmap

Bellwether roadmap is intentionally focused on one core promise:

`Reliable MCP drift detection that is fast, deterministic, and CI-native.`

## Product Scope

### Core (default path)

- `init`
- `check`
- `baseline`

### Advanced (opt-in)

- `explore`
- `watch`
- `discover`
- `registry`
- `golden`
- `contract`
- `auth`
- `validate-config`

Core receives first priority for reliability, performance, and UX polish.
Advanced capabilities are maintained without expanding the core learning surface.

## 2026 Priorities

## Q1: Trust and Consistency

- Keep release docs, action examples, and policy docs version-accurate.
- Enforce consistency checks in CI for docs links and pinned action versions.
- Maintain an explicit compatibility/deprecation policy.

## Q2: Core Experience

- Reduce time-to-first-value for new users.
- Keep `check` deterministic and low-noise in local and CI environments.
- Improve baseline ergonomics and drift signal quality.

## Q3: Developer Velocity

- Reduce avoidable CI runtime cost while preserving coverage quality.
- Improve module boundaries in high-complexity areas.
- Keep contributor workflows reproducible across macOS, Linux, and Windows.

## Q4: Adoption Flywheel

- Expand copy-paste-ready integration templates.
- Publish more golden-path examples for common MCP server stacks.
- Maintain a stable migration path across minor/major releases.

## Non-Goals

- Enterprise platform features (org admin, SSO/SAML, hosted control plane).
- Feature expansion that dilutes the core `check + baseline` workflow.
- Cloud lock-in or proprietary baseline formats.

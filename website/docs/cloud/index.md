---
title: Cloud Overview
sidebar_position: 1
slug: /cloud
---

# Bellwether Cloud

Bellwether Cloud provides baseline version history, drift alerts, and embeddable verification badges for your MCP servers.

## What Cloud Offers

| Feature | Description |
|:--------|:------------|
| **Baseline History** | Track every baseline upload with version numbers and timestamps |
| **Drift Comparison** | Compare any two versions to see what changed |
| **Verification Badges** | Embeddable badges showing test status for your README |
| **Team Collaboration** | Share projects across your team |

## Quick Start

```bash
# 1. Authenticate with GitHub
bellwether login

# 2. Link your project to cloud
bellwether link

# 3. Run your test and save baseline
bellwether test
bellwether baseline save

# 4. Upload to cloud
bellwether upload

# 5. Get a badge for your README
bellwether badge --markdown
```

## Workflow

```
Local Development          Cloud
       │                    │
       ├── bellwether test ─┤
       │                    │
       ├── baseline save ───┤
       │                    │
       └── upload ──────────┼───> Version History
                            │     Drift Detection
                            │     Badges
                            │
       ├── history ─────────┤
       │                    │
       └── diff 1 2 ────────┘
```

## Authentication

Bellwether Cloud uses GitHub OAuth for authentication:

```bash
# Interactive login (opens browser)
bellwether login

# Check status
bellwether login --status

# Logout
bellwether login --logout
```

For CI/CD, use a session token:

```bash
# Get session token from bellwether login, then:
export BELLWETHER_SESSION=your-session-token
bellwether upload --ci
```

## Teams

If you belong to multiple teams, you can switch between them:

```bash
# List your teams
bellwether teams

# Switch active team
bellwether teams switch team_abc123

# Show current team
bellwether teams current
```

For CI/CD with multiple teams:

```bash
export BELLWETHER_TEAM_ID=team_abc123
bellwether upload --ci
```

## Projects

Projects organize your baselines. Each project tracks a single MCP server.

```bash
# Create a new project and link it
bellwether link

# Or link to an existing project
bellwether link my-project-id

# List all your projects
bellwether projects

# Check current link status
bellwether link --status

# Unlink
bellwether link --unlink
```

## Uploading Baselines

After running tests, upload your baseline to track history:

```bash
# Upload to linked project
bellwether upload

# Upload to specific project
bellwether upload --project my-project-id

# CI mode (minimal output, fail on breaking drift)
bellwether upload --ci
```

## Viewing History

See all uploaded baseline versions:

```bash
# Recent uploads
bellwether history

# More history
bellwether history --limit 20

# Compare two versions
bellwether diff 1 2
```

## Badges

Add a verification badge to your README:

```bash
# Get markdown for README
bellwether badge --markdown
```

Badges show:
- **passing** - No drift detected
- **drift** - Non-breaking changes detected
- **failing** - Breaking changes detected

## CI/CD Integration

Use cloud in your CI/CD pipeline:

```yaml
# GitHub Actions example
- name: Test and Upload
  env:
    BELLWETHER_SESSION: ${{ secrets.BELLWETHER_SESSION }}
  run: |
    bellwether test
    bellwether baseline save
    bellwether upload --ci --fail-on-drift
```

See [CI/CD Integration](/guides/ci-cd) for complete examples.

## Commands Reference

| Command | Description |
|:--------|:------------|
| [`login`](/cloud/login) | Authenticate with GitHub |
| [`teams`](/cloud/teams) | Manage team selection |
| [`link`](/cloud/link) | Link project to cloud |
| [`projects`](/cloud/projects) | List your projects |
| [`upload`](/cloud/upload) | Upload baseline |
| [`history`](/cloud/history) | View upload history |
| `diff` | Compare versions (see [history](/cloud/history)) |
| [`badge`](/cloud/badge) | Get embeddable badge |

## See Also

- [Cloud Integration Guide](/guides/cloud-integration) - Detailed setup guide
- [CI/CD Integration](/guides/ci-cd) - Automated pipelines
- [Baselines](/concepts/baselines) - What baselines contain

---
title: Cloud Integration
sidebar_position: 3
---

# Cloud Integration

Bellwether Cloud provides baseline history, webhooks, and documentation badges for your MCP servers.

:::info Private Beta
Bellwether Cloud is currently in **private beta**. All features are free during the beta period.

To request access, [join the waitlist at bellwether.sh](https://bellwether.sh). Once approved, you'll receive an invitation code via email. You can then invite team members directly from the dashboard.
:::

## Features

| Feature | Description |
|:--------|:------------|
| **Baseline History** | Track all baseline versions over time |
| **Drift Timeline** | See when and how behavior changed |
| **Webhook Notifications** | Get alerts when drift is detected |
| **Documentation Badges** | Display status in your README |
| **CI/CD Integration** | Automated uploads and drift checks |

## Getting Started

### 1. Create an Account

Visit [bellwether.sh](https://bellwether.sh) to create an account.

### 2. Login via CLI

```bash
bellwether login
```

This opens your browser for authentication. After logging in, credentials are stored locally.

### 3. Link Your Project

```bash
cd your-mcp-server
bellwether link
```

Follow the prompts to create or select a project.

### 4. Upload Your First Baseline

```bash
# Generate and upload
bellwether check npx your-server
bellwether baseline save
bellwether upload
```

## Documentation Badge

Display your server's documentation status in READMEs and documentation.

### Get Badge via CLI

```bash
# Get full badge information
bellwether badge

# Get just the markdown snippet
bellwether badge --markdown

# Get just the badge URL
bellwether badge --url

# Get badge for specific project
bellwether badge --project proj_abc123
```

### Add to README

Copy the markdown from the `badge` command:

```markdown
[![Verified by Bellwether](https://img.shields.io/badge/bellwether-verified-brightgreen)](https://bellwether.sh/projects/proj_abc123)
```

### Badge Status

| Status | Color | Meaning |
|:-------|:------|:--------|
| `passing` | Green | Server verified, no drift |
| `passing` (Stable) | Green | Multiple versions, no drift |
| `drift` | Yellow | Behavioral changes detected |
| `failing` | Red | Breaking changes detected |
| `unknown` | Gray | No baseline uploaded yet |

### Update Badge in CI

```bash
# After uploading baseline, get updated badge
bellwether check --preset ci npx your-server
bellwether upload
bellwether badge --markdown
```

## CI/CD Integration

### GitHub Actions

```yaml
name: Bellwether CI
on: [push]

jobs:
  bellwether:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run Bellwether
        env:
          BELLWETHER_SESSION: ${{ secrets.BELLWETHER_SESSION }}
        run: |
          npx @dotsetlabs/bellwether check npx your-server
          npx @dotsetlabs/bellwether baseline save
          npx @dotsetlabs/bellwether upload --ci --fail-on-drift
```

### Getting CI Token

```bash
# Get your session token
bellwether login --status
# Copy BELLWETHER_SESSION value

# Add to GitHub Secrets as BELLWETHER_SESSION
```

## Viewing History

### Via CLI

```bash
bellwether history
```

### Via Dashboard

Visit `https://bellwether.sh/projects/proj_xxx` to see:
- All baseline versions
- Diff between any two versions
- Drift timeline
- Upload metadata (branch, commit, CI run)

## Comparing Versions

### Via Dashboard

1. Go to project page
2. Click "Compare" tab
3. Select two versions
4. View semantic diff

### Via Direct URL

```
https://bellwether.sh/projects/proj_xxx/diff/10/12
```

## Project Settings

### Notifications

Configure alerts for:
- Breaking drift detected
- Security findings
- Upload failures

### Webhooks

Send events to external services:

```json
{
  "event": "drift.breaking",
  "project": "proj_abc123",
  "baseline": {
    "version": 12,
    "changes": [...]
  }
}
```

## Beta Access

During the private beta, all cloud features are **completely free**:

- Unlimited cloud projects
- Unlimited baseline uploads
- Full version history
- GitHub & GitLab integration
- Slack & Discord notifications
- Team collaboration
- API access

To request access, [join the waitlist at bellwether.sh](https://bellwether.sh). Once approved, you'll receive an invitation code via email.

:::note Email Verification
Your invitation code is tied to a specific email address. When logging in with `bellwether login`, you must use a GitHub account that has the same email address as your invitation. This ensures invitation codes can only be used by their intended recipients.
:::

After the beta period ends, we'll introduce paid plans. The CLI will always remain free and open source.

## Security

- All data encrypted in transit (TLS 1.3)
- Data encrypted at rest
- No baseline content shared between users

## Offline Usage

Bellwether works fully offline. Cloud is optional for:
- Local drift detection with `bellwether baseline compare`
- Local baseline management with `bellwether baseline save`
- Local documentation generation

Cloud adds:
- Historical tracking across versions
- Webhook notifications for drift
- Documentation badges for your README

## See Also

- [badge](/cloud/badge) - Documentation badges
- [login](/cloud/login) - Authentication
- [link](/cloud/link) - Project linking
- [upload](/cloud/upload) - Baseline uploads
- [history](/cloud/history) - View history
- [CI/CD Integration](/guides/ci-cd) - Pipeline setup

---
title: Cloud Integration
sidebar_position: 3
---

# Cloud Integration

Bellwether Cloud provides baseline history, webhooks, and documentation badges for your MCP servers.

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
bellwether interview --save-baseline npx your-server
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
bellwether interview --preset ci npx your-server
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
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          BELLWETHER_SESSION: ${{ secrets.BELLWETHER_SESSION }}
        run: |
          npx @dotsetlabs/bellwether interview --save-baseline npx your-server
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

## Pricing

| Tier | Price | Features |
|:-----|:------|:---------|
| Free | $0 | 1 project, 30 uploads/month, 14-day history |
| Solo | $12/mo | 5 projects, unlimited uploads, 90-day history, unlimited webhooks, GitHub OR GitLab integration, API access |
| Team | $29/mo | Unlimited projects, unlimited uploads, 365-day history, unlimited webhooks, GitHub & GitLab, Slack & Discord notifications, 3 team seats included (+$5/seat/month for additional) |

Visit [bellwether.sh/pricing](https://bellwether.sh/pricing) for details.

## Data Retention

| Tier | Baseline History |
|:-----|:-----------------|
| Free | 14 days |
| Solo | 90 days |
| Team | 365 days |

## Security

- All data encrypted in transit (TLS 1.3)
- Data encrypted at rest
- No baseline content shared between users

## Offline Usage

Bellwether works fully offline. Cloud is optional for:
- Local drift detection with `--compare-baseline`
- Local baseline management with `--save-baseline`
- Local documentation generation

Cloud adds:
- Historical tracking across versions
- Webhook notifications for drift
- Documentation badges for your README

## See Also

- [badge](/cli/badge) - Documentation badges
- [login](/cli/login) - Authentication
- [link](/cli/link) - Project linking
- [upload](/cli/upload) - Baseline uploads
- [history](/cli/history) - View history
- [CI/CD Integration](/guides/ci-cd) - Pipeline setup

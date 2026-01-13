---
title: Cloud Integration
sidebar_position: 3
---

# Cloud Integration

Inquest Cloud provides baseline history, team collaboration, and verification badges for your MCP servers.

## Features

| Feature | Description |
|:--------|:------------|
| **Baseline History** | Track all baseline versions over time |
| **Drift Timeline** | See when and how behavior changed |
| **Team Collaboration** | Share baselines across your organization |
| **Verification Badges** | Display status in your README |
| **CI/CD Integration** | Automated uploads and drift checks |

## Getting Started

### 1. Create an Account

Visit [inquest.cloud](https://inquest.cloud) to create an account.

### 2. Login via CLI

```bash
inquest login
```

This opens your browser for authentication. After logging in, credentials are stored locally.

### 3. Link Your Project

```bash
cd your-mcp-server
inquest link
```

Follow the prompts to create or select a project.

### 4. Upload Your First Baseline

```bash
# Generate and upload
inquest interview --save-baseline npx your-server
inquest upload
```

## Verification Badge

Add a badge to your README showing verification status:

```markdown
[![Inquest](https://inquest.cloud/badge/proj_abc123)](https://inquest.cloud/projects/proj_abc123)
```

Badge shows:
- **Green**: Baseline verified, no drift
- **Yellow**: Minor drift detected
- **Red**: Breaking changes detected
- **Gray**: No recent verification

## Team Collaboration

### Invite Team Members

Via dashboard: Projects → Settings → Team

### Shared Visibility

All team members can:
- View baseline history
- See drift between versions
- Access verification status
- Download baselines

### Permissions

| Role | Capabilities |
|:-----|:-------------|
| Viewer | View baselines, history |
| Member | Upload baselines |
| Admin | Manage team, settings |

## CI/CD Integration

### GitHub Actions

```yaml
name: Inquest CI
on: [push]

jobs:
  inquest:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run Inquest
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          INQUEST_SESSION: ${{ secrets.INQUEST_SESSION }}
        run: |
          npx @dotsetlabs/inquest interview --save-baseline npx your-server
          npx @dotsetlabs/inquest upload --ci --fail-on-drift
```

### Getting CI Token

```bash
# Get your session token
inquest login --status
# Copy INQUEST_SESSION value

# Add to GitHub Secrets as INQUEST_SESSION
```

## Viewing History

### Via CLI

```bash
inquest history
```

### Via Dashboard

Visit `https://inquest.cloud/projects/proj_xxx` to see:
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
https://inquest.cloud/projects/proj_xxx/diff/10/12
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
| Free | $0/mo | 3 projects, 30-day history |
| Pro | $19/mo | 10 projects, 1-year history |
| Team | $49/mo | Unlimited projects, team features |

Visit [inquest.cloud/pricing](https://inquest.cloud/pricing) for details.

## Data Retention

| Tier | Baseline History | Audit Logs |
|:-----|:-----------------|:-----------|
| Free | 30 days | 7 days |
| Pro | 1 year | 30 days |
| Team | Unlimited | 1 year |

## Security

- All data encrypted in transit (TLS 1.3)
- Data encrypted at rest
- SOC 2 Type II compliant
- GDPR compliant
- No baseline content shared between organizations

## Offline Usage

Inquest works fully offline. Cloud is optional for:
- Local drift detection
- Local baseline management
- Local documentation generation

Cloud adds:
- Historical tracking
- Team collaboration
- Verification badges

## See Also

- [login](/cli/login) - Authentication
- [link](/cli/link) - Project linking
- [upload](/cli/upload) - Baseline uploads
- [history](/cli/history) - View history

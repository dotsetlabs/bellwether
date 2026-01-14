---
title: badge
sidebar_position: 8
---

# bellwether badge

Get an embeddable verification badge for your project.

## Synopsis

```bash
bellwether badge [options]
```

## Description

The `badge` command retrieves a verification badge for your project from Bellwether Cloud. Badges display your MCP server's verification status and can be embedded in READMEs, documentation, or websites to show users that your server has been tested and documented with Bellwether.

Badge status reflects:
- **Verified**: Server has been tested with at least one baseline
- **Stable**: Multiple baselines with no behavioral drift
- **Drift detected**: Behavioral changes detected between baselines
- **Breaking changes**: Significant breaking changes detected (tools removed, etc.)

## Options

| Option | Description | Default |
|:-------|:------------|:--------|
| `-p, --project <id>` | Project ID | Uses linked project |
| `--json` | Output as JSON | `false` |
| `--markdown` | Output markdown snippet only | `false` |
| `--url` | Output badge URL only | `false` |

## Examples

### Get Badge Info

```bash
# Get badge for linked project
bellwether badge

# Get badge for specific project
bellwether badge --project proj_abc123
```

Output:
```
Badge Status: Verified

Project: my-mcp-server
Status: passing
Version: 3
Last Verified: 2024-01-15T10:30:00Z

Badge URL:
https://img.shields.io/badge/bellwether-verified-brightgreen

Markdown:
[![Bellwether](https://img.shields.io/badge/bellwether-verified-brightgreen)](https://bellwether.dev/p/proj_abc123)
```

### Get Markdown Only

```bash
# Copy markdown directly to clipboard (macOS)
bellwether badge --markdown | pbcopy

# Append to README
bellwether badge --markdown >> README.md
```

### Get URL Only

```bash
# Get just the badge URL
bellwether badge --url
```

### JSON Output

```bash
bellwether badge --json
```

Output:
```json
{
  "projectId": "proj_abc123",
  "projectName": "my-mcp-server",
  "status": "passing",
  "statusText": "Verified",
  "latestVersion": 3,
  "lastVerified": "2024-01-15T10:30:00Z",
  "badgeUrl": "https://img.shields.io/badge/bellwether-verified-brightgreen",
  "markdown": "[![Bellwether](https://img.shields.io/badge/bellwether-verified-brightgreen)](https://bellwether.dev/p/proj_abc123)"
}
```

## Badge Status Colors

| Status | Color | Meaning |
|:-------|:------|:--------|
| `passing` | Green | Server verified, no issues |
| `drift` | Yellow | Behavioral drift detected |
| `failing` | Red | Breaking changes detected |
| `unknown` | Gray | No baseline uploaded yet |

## Use Cases

### Add Badge to README

Include verification status in your project's README:

```bash
# Get the markdown and add to README
bellwether badge --markdown
```

Then add to your README.md:
```markdown
# My MCP Server

[![Bellwether](https://img.shields.io/badge/bellwether-verified-brightgreen)](https://bellwether.dev/p/proj_abc123)

A verified MCP server for...
```

### CI Badge Updates

Update badge status after CI interviews:

```bash
# Run interview and upload baseline
bellwether interview --preset ci npx your-server
bellwether upload

# Check badge status
bellwether badge --json | jq '.status'
```

### Monitor Multiple Projects

Check badge status for multiple projects:

```bash
for proj in proj_abc123 proj_def456; do
  echo "Project: $proj"
  bellwether badge --project $proj --json | jq '{status, lastVerified}'
done
```

## Prerequisites

- Must be logged in to Bellwether Cloud (`bellwether login`)
- Project must be linked (`bellwether link`) or specified with `--project`
- At least one baseline must be uploaded for meaningful badge status

## Exit Codes

| Code | Meaning |
|:-----|:--------|
| `0` | Success - badge info retrieved |
| `1` | Error - not logged in or project not found |

## See Also

- [upload](/cli/upload) - Upload baselines to cloud
- [link](/cli/link) - Link local project to cloud
- [login](/cli/login) - Authenticate with Bellwether Cloud
- [Cloud Integration](/guides/cloud-integration) - Full cloud workflow

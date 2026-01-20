---
title: verify
sidebar_position: 7
---

# bellwether verify

Generate a verification report for the Verified by Bellwether program.

## Synopsis

```bash
bellwether verify [options]
```

## Description

The `verify` command runs a comprehensive check and generates a verification report that earns your MCP server a coverage badge. Verified servers receive a badge indicating their tier level and test coverage.

:::info Config Required
A `bellwether.yaml` config file is required. Run `bellwether init` to create one.
:::

## Options

### Verification Options

| Option | Description | Default |
|:-------|:------------|:--------|
| `--tier <tier>` | Target tier: `bronze`, `silver`, `gold`, `platinum` | `silver` |
| `--server-id <id>` | Server identifier (namespace/name) | Auto-detect |
| `--version <version>` | Server version to verify | Auto-detect |

### Output Options

| Option | Description | Default |
|:-------|:------------|:--------|
| `-o, --output <dir>` | Output directory | `.` |
| `--json` | Output verification result as JSON | `false` |
| `--badge-only` | Only output badge URL | `false` |

### Config Options

| Option | Description | Default |
|:-------|:------------|:--------|
| `-c, --config <path>` | Path to config file | `bellwether.yaml` |

## Verification Tiers

| Tier | Icon | Requirements |
|:-----|:-----|:-------------|
| **Bronze** | 🥉 | Basic check passes |
| **Silver** | 🥈 | Check passes with good coverage |
| **Gold** | 🥇 | Check + explore with multiple personas |
| **Platinum** | 💎 | Comprehensive check + explore with all personas |

### Tier Details

**Bronze** - Entry level verification
- Schema validation passes
- Basic tool coverage

**Silver** - Standard verification
- All tools validated
- No breaking schema issues

**Gold** - Thorough verification
- Check + explore mode
- Multiple personas (3+)
- Pass rate: 85%+

**Platinum** - Comprehensive verification
- All 4 personas used
- Complete behavioral coverage
- Pass rate: 90%+

:::info LLM Required for Gold+
Gold and Platinum tiers require `bellwether explore`, which needs an LLM API key. Bronze and Silver use `bellwether check` only.
:::

## Examples

### Basic Verification

```bash
# Run verification with default settings (silver tier)
bellwether verify
```

### Target a Specific Tier

```bash
# Aim for gold certification (requires LLM)
bellwether verify --tier gold

# Aim for platinum (all personas)
bellwether verify --tier platinum
```

### Get Badge URL Only

```bash
# Just output the badge URL for your README
bellwether verify --badge-only
```

### JSON Output

```bash
# Get full report as JSON
bellwether verify --json > verification.json
```

## Output

### Console Output

```
🔒 Bellwether Verification

Connecting to npx your-server...
✓ Connected to your-server v1.0.0
  5 tools, 2 prompts, 0 resources

Target tier: silver

Running verification check...
✓ Check complete

────────────────────────────────────────────────────────────
Verification Result

  Server:     your-server v1.0.0
  Status:     VERIFIED
  Tier:       SILVER

  Tools:      5 verified

  Verified:   1/13/2026
  Expires:    4/13/2026

────────────────────────────────────────────────────────────

Report saved to: ./bellwether-verification.json

Badge:
https://img.shields.io/badge/bellwether-silver-C0C0C0

Markdown:
![Bellwether verified: silver](https://img.shields.io/badge/bellwether-silver-C0C0C0)
```

### Verification Report

The generated `bellwether-verification.json` contains:

```json
{
  "result": {
    "serverId": "your-server",
    "version": "1.0.0",
    "status": "verified",
    "tier": "silver",
    "verifiedAt": "2026-01-13T12:00:00.000Z",
    "expiresAt": "2026-04-13T12:00:00.000Z",
    "toolsVerified": 5,
    "reportHash": "a1b2c3d4e5f6g7h8",
    "bellwetherVersion": "0.14.0"
  },
  "serverInfo": {
    "name": "your-server",
    "version": "1.0.0",
    "description": "Your MCP server"
  },
  "tools": [
    {
      "name": "tool_name",
      "verified": true
    }
  ],
  "environment": {
    "os": "linux",
    "nodeVersion": "v20.0.0",
    "bellwetherVersion": "0.14.0"
  }
}
```

## Adding the Badge

Add the verification badge to your README:

```markdown
![Verified by Bellwether](https://img.shields.io/badge/bellwether-silver-C0C0C0)
```

Or with a link to your report:

```markdown
[![Verified by Bellwether](https://img.shields.io/badge/bellwether-silver-C0C0C0)](./bellwether-verification.json)
```

## Verification Validity

- Verification badges are valid for **90 days**
- Re-run verification after significant changes
- The `expiresAt` field indicates when re-verification is needed

## Exit Codes

| Code | Meaning |
|:-----|:--------|
| `0` | Success - verification passed |
| `1` | Failure - target tier not achieved |

## See Also

- [check](/cli/check) - Schema validation and drift detection
- [explore](/cli/explore) - LLM-powered behavioral exploration
- [badge](/cloud/badge) - Get embeddable badges
- [CI/CD Integration](/guides/ci-cd) - Automate verification

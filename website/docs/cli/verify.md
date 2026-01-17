---
title: verify
sidebar_position: 12
---

# bellwether verify

Generate a verification report for the Verified by Bellwether program.

## Synopsis

```bash
bellwether verify [options] <command> [args...]
```

## Description

The `verify` command runs a comprehensive interview and generates a verification report that earns your MCP server a coverage badge. Verified servers receive a badge indicating their tier level and test coverage.

## Arguments

| Argument | Description |
|:---------|:------------|
| `<command>` | The command to start the MCP server |
| `[args...]` | Arguments to pass to the server command |

## Options

### Verification Options

| Option | Description | Default |
|:-------|:------------|:--------|
| `--tier <tier>` | Target tier: `bronze`, `silver`, `gold`, `platinum` | `silver` |
| `--server-id <id>` | Server identifier (namespace/name) | Auto-detect |
| `--version <version>` | Server version to verify | Auto-detect |
| `--security` | Include security hygiene checks (required for gold+ tiers) | `false` |

### Output Options

| Option | Description | Default |
|:-------|:------------|:--------|
| `-o, --output <dir>` | Output directory | `.` |
| `--json` | Output verification result as JSON | `false` |
| `--badge-only` | Only output badge URL | `false` |

### LLM Options

| Option | Description | Default |
|:-------|:------------|:--------|
| `--provider <provider>` | LLM provider: `openai`, `anthropic`, `ollama` | `openai` |
| `--model <model>` | Specific model to use | Provider default |

## Verification Tiers

| Tier | Icon | Requirements |
|:-----|:-----|:-------------|
| **Bronze** | 🥉 | Basic testing (happy path) |
| **Silver** | 🥈 | Error handling tested (2+ personas) |
| **Gold** | 🥇 | Multiple personas + good coverage (85%+) |
| **Platinum** | 💎 | Comprehensive testing + all personas (90%+) |

### Tier Details

**Bronze** - Entry level verification
- Uses Technical Writer persona
- Basic happy path testing
- Pass rate: 50%+

**Silver** - Standard verification
- Uses Technical Writer + QA Engineer
- Error handling scenarios tested
- Pass rate: 75%+

**Gold** - Thorough verification
- Uses 3+ personas
- Tests prompts and resources if available
- Pass rate: 85%+

**Platinum** - Comprehensive verification
- All 4 personas used (including security hygiene checks)
- Complete behavioral coverage
- Pass rate: 90%+

## Examples

### Basic Verification

```bash
# Run verification with default settings (silver tier)
bellwether verify npx @modelcontextprotocol/server-filesystem /tmp
```

### Target a Specific Tier

```bash
# Aim for gold certification
bellwether verify --tier gold npx your-server

# Aim for platinum (includes security testing)
bellwether verify --tier platinum --security npx your-server
```

### Get Badge URL Only

```bash
# Just output the badge URL for your README
bellwether verify --badge-only npx your-server
```

### JSON Output

```bash
# Get full report as JSON
bellwether verify --json npx your-server > verification.json
```

## Output

### Console Output

```
🔒 Bellwether Verification

Connecting to npx your-server...
✓ Connected to your-server v1.0.0
  5 tools, 2 prompts, 0 resources

Target tier: gold
Using personas: Technical Writer, QA Engineer, Novice User

Running verification interview...
✓ Interview complete

────────────────────────────────────────────────────────────
Verification Result

  Server:     your-server v1.0.0
  Status:     VERIFIED
  Tier:       GOLD

  Pass Rate:  87% (26/30 tests)
  Tools:      5 verified

  Verified:   1/13/2026
  Expires:    4/13/2026

────────────────────────────────────────────────────────────

Report saved to: ./bellwether-verification.json

Badge:
https://img.shields.io/badge/bellwether-gold-FFD700

Markdown:
![Bellwether verified: gold](https://img.shields.io/badge/bellwether-gold-FFD700)
```

### Verification Report

The generated `bellwether-verification.json` contains:

```json
{
  "result": {
    "serverId": "your-server",
    "version": "1.0.0",
    "status": "verified",
    "tier": "gold",
    "verifiedAt": "2026-01-13T12:00:00.000Z",
    "expiresAt": "2026-04-13T12:00:00.000Z",
    "toolsVerified": 5,
    "testsPassed": 26,
    "testsTotal": 30,
    "passRate": 87,
    "reportHash": "a1b2c3d4e5f6g7h8",
    "bellwetherVersion": "0.2.0"
  },
  "serverInfo": {
    "name": "your-server",
    "version": "1.0.0",
    "description": "Your MCP server"
  },
  "tools": [
    {
      "name": "tool_name",
      "testsRun": 6,
      "testsPassed": 5,
      "errors": ["One edge case failed"]
    }
  ],
  "environment": {
    "os": "linux",
    "nodeVersion": "v20.0.0",
    "bellwetherVersion": "0.2.0"
  }
}
```

## Adding the Badge

Add the verification badge to your README:

```markdown
![Verified by Bellwether](https://img.shields.io/badge/bellwether-gold-FFD700)
```

Or with a link to your report:

```markdown
[![Verified by Bellwether](https://img.shields.io/badge/bellwether-gold-FFD700)](./bellwether-verification.json)
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
| `2` | Error - interview failed |

## See Also

- [interview](/cli/interview) - Standard behavioral interview
- [badge](/cli/badge) - Get embeddable badges
- [CI/CD Integration](/guides/ci-cd) - Automate verification

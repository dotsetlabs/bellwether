---
title: verify
sidebar_position: 7
---

# bellwether verify

Generate a verification report for the Verified by Bellwether program.

## Synopsis

```bash
bellwether verify [server-command] [args...] [options]
```

## Description

The `verify` command runs LLM-powered testing and generates a verification report that earns your MCP server a coverage badge. Verified servers receive a badge indicating their tier level and test coverage.

:::info LLM Required
All verification tiers require an LLM. The `verify` command uses LLM-powered interviews to evaluate your server. Set up your API key with `bellwether auth` or use Ollama for free local inference.
:::

:::tip Config-First Design
Like `bellwether check` and `bellwether explore`, the `verify` command reads configuration from `bellwether.yaml`. Simply run `bellwether verify` and it uses your config file for the server command, LLM settings, and output options. CLI arguments override config values when provided.
:::

## Arguments

| Argument | Description |
|:---------|:------------|
| `[server-command]` | Server command (overrides config) |
| `[args...]` | Server arguments (overrides config) |

## Options

### Configuration Options

| Option | Description | Default |
|:-------|:------------|:--------|
| `-c, --config <path>` | Path to config file | `bellwether.yaml` |

### Verification Options

| Option | Description | Default |
|:-------|:------------|:--------|
| `--tier <tier>` | Target tier: `bronze`, `silver`, `gold`, `platinum` | `silver` |
| `--server-id <id>` | Server identifier (namespace/name) | Auto-detect |
| `--version <version>` | Server version to verify | Auto-detect |
| `--security` | Include security testing (required for gold+ tiers) | `false` |

### LLM Options

| Option | Description | Default |
|:-------|:------------|:--------|
| `--provider <provider>` | LLM provider: `ollama`, `openai`, `anthropic` | `ollama` (or config) |
| `--model <model>` | LLM model to use | Provider default |

### Output Options

| Option | Description | Default |
|:-------|:------------|:--------|
| `-o, --output <dir>` | Output directory | `.` |
| `--json` | Output verification result as JSON | `false` |
| `--badge-only` | Only output badge URL | `false` |

### Cloud Options

| Option | Description | Default |
|:-------|:------------|:--------|
| `-p, --project <id>` | Project ID to submit verification to (requires login) | Uses linked project |

## Verification Tiers

| Tier | Icon | Personas Used | Requirements |
|:-----|:-----|:--------------|:-------------|
| **Bronze** | 🥉 | Technical Writer | Basic documentation check |
| **Silver** | 🥈 | Technical Writer, QA Engineer | Standard verification |
| **Gold** | 🥇 | Technical Writer, QA Engineer, +1 | Thorough testing |
| **Platinum** | 💎 | All 4 personas | Comprehensive coverage |

### Tier Details

**Bronze** - Entry level verification
- Technical Writer persona only
- 3 questions per tool
- Basic pass rate requirements

**Silver** - Standard verification (default)
- Technical Writer + QA Engineer personas
- 3 questions per tool
- Good coverage of edge cases

**Gold** - Thorough verification
- 3 personas (adds Security Tester with `--security`, or Novice User)
- 4 questions per tool
- Pass rate: 85%+

**Platinum** - Comprehensive verification
- All 4 personas (Technical Writer, Security Tester, QA Engineer, Novice User)
- 5 questions per tool
- Pass rate: 90%+

## Examples

### Basic Verification (Using Config)

```bash
# Run verification using bellwether.yaml config (recommended)
bellwether verify

# The config file specifies the server command, LLM provider, and output settings
```

### Override Server Command

```bash
# Override the server command from config
bellwether verify npx @modelcontextprotocol/server-filesystem /tmp
```

### Target a Specific Tier

```bash
# Aim for gold certification with security testing
bellwether verify --tier gold --security

# Aim for platinum (all personas)
bellwether verify --tier platinum
```

### Use Different LLM Providers

```bash
# Use local Ollama (default, free) - configured in bellwether.yaml
bellwether verify

# Override provider from command line
bellwether verify --provider openai

# Use Anthropic Claude
bellwether verify --provider anthropic

# Specify a particular model
bellwether verify --provider anthropic --model claude-sonnet-4-5
```

### Submit to Cloud

```bash
# Link your project once, then verify submissions are automatic
bellwether link proj_abc123
bellwether verify  # Auto-submits to linked project

# Or specify a project explicitly
bellwether verify --project proj_abc123
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

Connecting to node dist/index.js ...
✓ Connected to your-server v1.0.0
  5 tools, 2 prompts, 0 resources

Target tier: silver
Using personas: Technical Writer, QA Engineer

Running verification test...
  Testing: read_file...
✓ Test complete

────────────────────────────────────────────────────────────
Verification Result

  Server:     your-server v1.0.0
  Status:     VERIFIED
  Tier:       SILVER

  Pass Rate:  85% (17/20 tests)
  Tools:      5 verified

  Verified:   1/13/2026
  Expires:    4/13/2026

────────────────────────────────────────────────────────────

Report saved to: ./bellwether-verification.json

Badge:
https://img.shields.io/badge/bellwether-silver-C0C0C0

Markdown:
![Bellwether verified: silver](https://img.shields.io/badge/bellwether-silver-C0C0C0)

Submitting verification to platform...
✓ Verification submitted successfully
  View at: https://bellwether.sh/projects/proj_abc123/verification
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
    "testsPassed": 17,
    "testsTotal": 20,
    "passRate": 85,
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
| `1` | Failure - target tier not achieved or verification failed |

## See Also

- [check](/cli/check) - Schema validation and drift detection (free)
- [explore](/cli/explore) - LLM-powered behavioral exploration
- [badge](/cloud/badge) - Get embeddable badges from cloud
- [CI/CD Integration](/guides/ci-cd) - Automate verification

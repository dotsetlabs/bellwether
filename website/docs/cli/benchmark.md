---
title: benchmark
sidebar_position: 7
---

# bellwether benchmark

Generate a benchmark report for the Tested with Bellwether program.

## Synopsis

```bash
bellwether benchmark [server-command] [args...] [options]
```

## Description

The `benchmark` command runs LLM-powered testing and generates a benchmark report that earns your MCP server a coverage badge. Tested servers receive a badge indicating their tier level and test coverage.

:::info LLM Required
All benchmark tiers require an LLM. The `benchmark` command uses LLM-powered interviews to evaluate your server. Set up your API key with `bellwether auth` or use Ollama for free local inference.
:::

:::tip Config-First Design
Like `bellwether check` and `bellwether explore`, the `benchmark` command reads configuration from `bellwether.yaml`. Simply run `bellwether benchmark` and it uses your config file for the server command, LLM settings, and output options. CLI arguments override config values when provided.
:::

:::note Remote Servers
To benchmark a remote MCP server, set `server.transport` to `sse` or `streamable-http` and provide `server.url` in `bellwether.yaml`. When using remote transports, CLI `[server-command]` and `[args...]` are ignored.
:::

:::note Config Required
All CLI commands (except `init`) require a config file. Run `bellwether init` once before using `benchmark`.
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

### Benchmark Options

| Option | Description | Default |
|:-------|:------------|:--------|
| `--tier <tier>` | Target tier: `bronze`, `silver`, `gold`, `platinum` | `silver` |
| `--server-id <id>` | Server identifier (namespace/name) | Auto-detect |
| `--version <version>` | Server version to benchmark | Auto-detect |
| `--security` | Include security testing (optional for any tier) | `false` |

### Output Options

| Option | Description | Default |
|:-------|:------------|:--------|
| `-o, --output <dir>` | Output directory | `output.dir` |
| `--json` | Output benchmark result as JSON | `false` |
| `--badge-only` | Only output badge URL | `false` |

### Output Files

| File | Description |
|:-----|:------------|
| `bellwether-benchmark.json` | Benchmark report output (configurable via `output.files.benchmarkReport`) |

### Cloud Options

| Option | Description | Default |
|:-------|:------------|:--------|
| `-p, --project <id>` | Project ID to submit benchmark to (requires login) | Uses linked project |

## Benchmark Tiers

| Tier | Icon | Personas Used | Requirements |
|:-----|:-----|:--------------|:-------------|
| **Bronze** | 🥉 | Technical Writer | Basic documentation check |
| **Silver** | 🥈 | Technical Writer, QA Engineer | Standard benchmark |
| **Gold** | 🥇 | Technical Writer, QA Engineer, +1 | Thorough testing |
| **Platinum** | 💎 | All 4 personas | Comprehensive coverage |

### Tier Details

**Bronze** - Entry level benchmark
- Technical Writer persona only
- 3 questions per tool
- Basic pass rate requirements

**Silver** - Standard benchmark (default)
- Technical Writer + QA Engineer personas
- 3 questions per tool
- Good coverage of edge cases

**Gold** - Thorough benchmark
- 3 personas (Security Tester with `--security`, otherwise Novice User)
- 4 questions per tool
- Pass rate: 85%+

**Platinum** - Comprehensive benchmark
- All 4 personas (Technical Writer, Security Tester, QA Engineer, Novice User)
- 5 questions per tool
- Pass rate: 90%+

## Examples

### Basic Benchmark (Using Config)

```bash
# Run benchmark using bellwether.yaml config (recommended)
bellwether benchmark

# The config file specifies the server command, LLM provider, and output settings
```

### Override Server Command

```bash
# Override the server command from config
bellwether benchmark npx @modelcontextprotocol/server-filesystem /tmp
```

### Target a Specific Tier

```bash
# Aim for gold certification with security testing
bellwether benchmark --tier gold --security

# Aim for platinum (all personas)
bellwether benchmark --tier platinum
```

### Configure LLM Provider

Configure your LLM provider in `bellwether.yaml`:

```yaml
llm:
  provider: anthropic  # or openai, ollama
  model: claude-haiku-4-5
```

Then run:

```bash
bellwether benchmark
```

### Submit to Cloud

```bash
# Link your project once, then benchmark submissions are automatic
bellwether link proj_abc123
bellwether benchmark  # Auto-submits to linked project

# Or specify a project explicitly
bellwether benchmark --project proj_abc123
```

### Get Badge URL Only

```bash
# Just output the badge URL for your README
bellwether benchmark --badge-only
```

### JSON Output

```bash
# Get full report as JSON
bellwether benchmark --json > benchmark.json
```

## Output

### Console Output

```
🔒 Bellwether Benchmark

Connecting to node dist/index.js ...
✓ Connected to your-server v1.0.0
  5 tools, 2 prompts, 0 resources

Target tier: silver
Using personas: Technical Writer, QA Engineer

Running benchmark test...
  Testing: read_file...
✓ Test complete

────────────────────────────────────────────────────────────
Benchmark Result

  Server:     your-server v1.0.0
  Status:     PASSED
  Tier:       SILVER

  Pass Rate:  85% (17/20 tests)
  Tools:      5 tested

  Tested:     1/13/2026
  Expires:    4/13/2026

────────────────────────────────────────────────────────────

Report saved to: ./bellwether-benchmark.json

Badge:
https://img.shields.io/badge/bellwether-silver-C0C0C0

Markdown:
![Tested with Bellwether: silver](https://img.shields.io/badge/bellwether-silver-C0C0C0)

Submitting benchmark to platform...
✓ Benchmark submitted successfully
  View at: https://bellwether.sh/projects/proj_abc123/benchmark
```

### Benchmark Report

The generated `bellwether-benchmark.json` contains:

```json
{
  "result": {
    "serverId": "your-server",
    "version": "1.0.0",
    "status": "passed",
    "tier": "silver",
    "testedAt": "2026-01-13T12:00:00.000Z",
    "expiresAt": "2026-04-13T12:00:00.000Z",
    "toolsTested": 5,
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
      "tested": true
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

Add the benchmark badge to your README:

```markdown
![Tested with Bellwether](https://img.shields.io/badge/bellwether-silver-C0C0C0)
```

Or with a link to your report:

```markdown
[![Tested with Bellwether](https://img.shields.io/badge/bellwether-silver-C0C0C0)](./bellwether-benchmark.json)
```

## Benchmark Validity

- Benchmark badges are valid for **90 days**
- Re-run benchmark after significant changes
- The `expiresAt` field indicates when re-testing is needed

## Exit Codes

| Code | Meaning |
|:-----|:--------|
| `0` | Success - benchmark passed |
| `1` | Failure - target tier not achieved or benchmark failed |

## See Also

- [check](/cli/check) - Schema validation and drift detection (free)
- [explore](/cli/explore) - LLM-powered behavioral exploration
- [badge](/cloud/badge) - Get embeddable badges from cloud
- [CI/CD Integration](/guides/ci-cd) - Automate benchmarking

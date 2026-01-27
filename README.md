# Bellwether

[![Build Status](https://github.com/dotsetlabs/bellwether/actions/workflows/ci.yml/badge.svg)](https://github.com/dotsetlabs/bellwether/actions)
[![npm version](https://img.shields.io/npm/v/@dotsetlabs/bellwether)](https://www.npmjs.com/package/@dotsetlabs/bellwether)
[![Documentation](https://img.shields.io/badge/docs-docs.bellwether.sh-blue)](https://docs.bellwether.sh)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)

> **Catch MCP server drift before your users do. Zero LLM required.**

**What is MCP?** [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) is how AI assistants like Claude connect to external tools—read files, query databases, call APIs. When those tool schemas change, AI workflows break silently.

## Quick Start

```bash
npm install -g @dotsetlabs/bellwether
bellwether init npx @mcp/your-server
bellwether check
```

That's it. No API keys. No LLM costs. Runs in seconds.

## Two Modes

| Mode | Purpose | Cost | When to Use |
|:-----|:--------|:-----|:------------|
| `check` | Schema drift detection | **Free** | CI/CD, every PR |
| `explore` | LLM-powered behavioral testing | LLM API costs | Local dev, deep analysis |

**Most users only need `check`.** It's deterministic, fast, and catches the changes that break AI agents.

## Free CI/CD Workflow (No Cloud Required)

Store your baseline in git. Run checks in CI. No account needed.

```bash
# 1. Initialize and save baseline (one-time setup)
bellwether init npx @mcp/your-server
bellwether check
bellwether baseline save
git add bellwether.yaml bellwether-baseline.json
git commit -m "Add Bellwether baseline"
```

```yaml
# 2. Add to CI (.github/workflows/bellwether.yml)
name: MCP Drift Detection
on: [pull_request]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npx @dotsetlabs/bellwether check --fail-on-drift
```

That's the complete workflow. Baseline in git, check in CI, no secrets required.

## What It Detects

| Change | Example | Severity |
|:-------|:--------|:---------|
| Tool added/removed | `delete_file` appears or disappears | Breaking |
| Schema changed | Parameter `path` becomes required | Breaking |
| Parameter renamed | `path` → `file_path` | Breaking |
| Description changed | Tool help text updated | Warning |
| Performance regression | Latency increased >10% | Warning |
| Security issues | SQL injection accepted | Breaking |

## Why Bellwether?

| Tool | MCP-Native | Drift Detection | CI/CD Ready | Free |
|:-----|:----------:|:---------------:|:-----------:|:----:|
| **Bellwether** | Yes | Yes | Yes | Yes |
| MCP Inspector | Yes | No | No | Yes |
| Pact | No | Yes | Yes | Yes |
| OpenAPI validators | No | Partial | Yes | Yes |
| Manual testing | Yes | No | No | Yes |

**Why not Pact or OpenAPI tools?** MCP servers aren't REST APIs—they expose tools with JSON schemas, prompts, and resources. Bellwether understands this structure natively: semantic type inference, security testing, and performance tracking included.

**Why not MCP Inspector?** Inspector is for interactive debugging during development. Bellwether is for CI/CD—automated drift detection that catches changes before they ship.

---

## Documentation

**[docs.bellwether.sh](https://docs.bellwether.sh)** — Full reference for configuration, commands, and cloud features.

- [Quick Start](https://docs.bellwether.sh/quickstart)
- [CLI Reference](https://docs.bellwether.sh/cli/init)
- [CI/CD Integration](https://docs.bellwether.sh/guides/ci-cd)
- [Cloud Features](https://docs.bellwether.sh/cloud)

---

## Configuration

All settings live in `bellwether.yaml`. Create one with presets:

```bash
bellwether init npx @mcp/your-server           # Default (free, fast)
bellwether init --preset ci npx @mcp/server    # Optimized for CI/CD
bellwether init --preset security npx @mcp/server  # Security-focused
bellwether init --preset local npx @mcp/server # Local Ollama (free)
```

### Environment Variables in Config

```yaml
server:
  command: "npx @mcp/your-server"
  env:
    API_KEY: "${API_KEY}"
    DEBUG: "${DEBUG:-false}"  # With default
```

Commit config to git without exposing secrets.

## Commands

### Essential Commands

```bash
bellwether init <server-command>   # Create config
bellwether check                   # Detect drift (free, deterministic)
bellwether baseline save           # Save baseline to compare against
bellwether baseline compare        # Compare current vs saved baseline
```

### Explore Command (Optional)

```bash
bellwether init --preset local npx @mcp/server  # Uses Ollama (free)
bellwether explore                              # LLM-powered testing
```

Requires LLM (Ollama for free local, or OpenAI/Anthropic). Generates `AGENTS.md` with behavioral documentation.

### All Commands

| Command | Purpose |
|:--------|:--------|
| `init` | Create `bellwether.yaml` config |
| `check` | Schema drift detection (free) |
| `explore` | LLM behavioral testing |
| `baseline save` | Save test results as baseline |
| `baseline compare` | Compare against baseline |
| `baseline accept` | Accept drift as intentional |
| `baseline diff` | Compare two baselines |
| `discover` | Show server capabilities |
| `watch` | Continuous checking on file changes |

### Cloud Commands (Optional)

For teams who want centralized history and dashboards:

```bash
bellwether login                   # Authenticate
bellwether link                    # Link project to cloud
bellwether upload                  # Upload baseline
bellwether history                 # View version history
bellwether diff 1 2                # Compare cloud versions
```

## CI/CD Exit Codes

| Code | Meaning | Suggested Action |
|:-----|:--------|:-----------------|
| `0` | No changes | Pass |
| `1` | Info-level changes | Pass or warn |
| `2` | Warning-level changes | Warn |
| `3` | Breaking changes | Fail |
| `4` | Runtime error | Fail |
| `5` | Low confidence | Fail (if configured) |

## GitHub Action

```yaml
- uses: dotsetlabs/bellwether@v1
  with:
    server-command: 'npx @mcp/your-server'
    baseline-path: './bellwether-baseline.json'
    fail-on-severity: 'warning'
```

---

## Advanced Features

<details>
<summary><strong>Security Testing</strong></summary>

Enable deterministic security vulnerability testing:

```bash
bellwether init --preset security npx @mcp/your-server
bellwether check
```

Tests for: SQL injection, XSS, path traversal, command injection, SSRF, error disclosure.

| Risk Level | Score | Description |
|:-----------|:------|:------------|
| Critical | 80-100 | Immediate action required |
| High | 60-79 | Serious vulnerability |
| Medium | 40-59 | Moderate risk |
| Low | 20-39 | Minor concern |

</details>

<details>
<summary><strong>Semantic Validation</strong></summary>

Automatically infers types from parameter names and generates validation tests:

| Type | Example Parameters |
|:-----|:-------------------|
| `email` | `user_email`, `contact_email` |
| `url` | `website_url`, `api_endpoint` |
| `date` | `created_at`, `birth_date` |
| `file_path` | `file_path`, `directory` |

No configuration needed—runs automatically during `check`.

</details>

<details>
<summary><strong>Response Schema Tracking</strong></summary>

Tracks response consistency across test samples:

| Grade | Confidence | Meaning |
|:------|:-----------|:--------|
| A | 95%+ | Stable, consistent responses |
| B | 85%+ | Mostly stable |
| C | 70%+ | Some inconsistency |
| D/F | <70% | Unstable responses |

Detects breaking changes: fields removed, types changed, required fields changed.

</details>

<details>
<summary><strong>Performance Confidence</strong></summary>

Statistical confidence for performance metrics:

| Level | Requirements | Meaning |
|:------|:-------------|:--------|
| HIGH | 10+ samples, CV ≤ 30% | Reliable baseline |
| MEDIUM | 5+ samples, CV ≤ 50% | Use with caution |
| LOW | < 5 samples or CV > 50% | Collect more data |

Low confidence regressions are flagged so you don't chase noise.

</details>

<details>
<summary><strong>Custom Test Scenarios</strong></summary>

Define deterministic tests in `bellwether-tests.yaml`:

```yaml
version: "1"
scenarios:
  - tool: get_weather
    args:
      location: "San Francisco"
    assertions:
      - path: "content[0].text"
        condition: "contains"
        value: "temperature"
```

Reference in config:

```yaml
scenarios:
  path: "./bellwether-tests.yaml"
```

</details>

<details>
<summary><strong>Baseline Commands</strong></summary>

```bash
bellwether baseline save              # Save current results
bellwether baseline save ./path.json  # Save to specific file
bellwether baseline compare           # Compare against saved
bellwether baseline show              # Display contents
bellwether baseline diff v1.json v2.json  # Compare two files
bellwether baseline accept --reason "Intentional change"  # Accept drift
```

Baselines use semantic versioning. Same major version = compatible.

</details>

<details>
<summary><strong>Check Mode Configuration</strong></summary>

```yaml
check:
  statefulTesting:
    enabled: true
    maxChainLength: 5

  externalServices:
    mode: skip   # skip | mock | fail

  rateLimit:
    enabled: false
    requestsPerSecond: 10

  security:
    enabled: true
```

</details>

---

## Environment Variables

| Variable | Description |
|:---------|:------------|
| `OPENAI_API_KEY` | OpenAI API key (explore only) |
| `ANTHROPIC_API_KEY` | Anthropic API key (explore only) |
| `OLLAMA_BASE_URL` | Ollama URL (default: `http://localhost:11434`) |
| `BELLWETHER_SESSION` | Cloud session for CI/CD |

## Development

```bash
git clone https://github.com/dotsetlabs/bellwether
cd bellwether/cli
npm install
npm run build
npm test
```

## License

MIT License - see [LICENSE](./LICENSE) for details.

---

<p align="center">
  Built by <a href="https://dotsetlabs.com">Dotset Labs</a>
</p>

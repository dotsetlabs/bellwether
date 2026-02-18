# Bellwether

[![Build Status](https://github.com/dotsetlabs/bellwether/actions/workflows/ci.yml/badge.svg)](https://github.com/dotsetlabs/bellwether/actions)
[![npm version](https://img.shields.io/npm/v/@dotsetlabs/bellwether)](https://www.npmjs.com/package/@dotsetlabs/bellwether)
[![Documentation](https://img.shields.io/badge/docs-docs.bellwether.sh-blue)](https://docs.bellwether.sh)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](./CONTRIBUTING.md)

> **The open-source MCP testing tool. Catch drift before your users do.**

**What is MCP?** [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) is how AI assistants like Claude connect to external tools—read files, query databases, call APIs. When those tool schemas change, AI workflows break silently.

## Why Bellwether?

MCP servers expose tools with JSON schemas. When those schemas change—a parameter renamed, a type modified, a tool removed—AI agents break silently. Bellwether catches these changes before they reach production.

| Problem | Solution |
|:--------|:---------|
| Breaking changes slip into production | **Drift detection** catches schema changes in CI |
| No standard for MCP testing | **Native MCP support** understands tools, prompts, resources |
| Manual testing misses edge cases | **Automated exploration** covers what humans miss |
| Documentation gets stale | **CONTRACT.md** generated from actual behavior |

## Quick Start

```bash
npm install -g @dotsetlabs/bellwether
bellwether init npx @mcp/your-server
bellwether check
```

That's it. No API keys. No LLM costs. Runs in seconds.

## Product Focus

Bellwether is intentionally opinionated:

- **Core workflow (default)**: `init` -> `check` -> `baseline`
- **Advanced workflow (opt-in)**: `explore`, `watch`, `discover`, `golden`, `contract`, `registry`

If you only need CI-safe drift detection, you can stay entirely in the core workflow.

## Two Modes

| Mode | Purpose | Cost | When to Use |
|:-----|:--------|:-----|:------------|
| `check` | Schema drift detection | **Free** | CI/CD, every PR |
| `explore` | LLM-powered behavioral testing | LLM API costs | Local dev, deep analysis |

**Most users only need `check`.** It's deterministic, fast, and catches the changes that break AI agents.

## CI/CD Workflow

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

## What It Detects

| Change | Example | Severity |
|:-------|:--------|:---------|
| Tool added/removed | `delete_file` appears or disappears | Breaking |
| Schema changed | Parameter `path` becomes required | Breaking |
| Parameter renamed | `path` to `file_path` | Breaking |
| Description changed | Tool help text updated | Warning |
| Performance regression | Latency increased >10% | Warning |
| Tool annotations changed | `readOnlyHint` flipped to `false` | Warning |
| Output schema changed | Return type structure modified | Warning |
| Entity title changed | Tool/prompt/resource title updated | Info |
| Task support changed | Execution mode switched to `async` | Warning |
| Server instructions changed | Server-level instructions updated | Info |
| Prompt added/removed | Prompt template appears or disappears | Breaking |
| Resource changed | Resource URI or MIME type modified | Warning |

Comparisons are **protocol-version-aware** — version-specific fields (annotations, titles, output schemas, etc.) are only compared when both baselines support the relevant MCP protocol version.

## Command Tiers

### Core Commands (Recommended)

| Command | Purpose |
|:--------|:--------|
| `init` | Create `bellwether.yaml` |
| `check` | Deterministic schema drift detection |
| `baseline save` | Save snapshot for future comparisons |
| `baseline compare` | Compare latest check output to saved baseline |

### Advanced Commands (Optional)

| Command | Purpose |
|:--------|:--------|
| `explore` | LLM behavioral testing and `AGENTS.md` generation |
| `watch` | Continuous checking on file changes |
| `discover` | Capability inspection without tests |
| `registry` | Search MCP Registry |
| `golden` | Golden output regression testing |
| `contract` | Contract validation and generation |
| `auth` | Manage LLM provider API keys |
| `validate-config` | Validate `bellwether.yaml` without running tests |

## CI/CD Exit Codes

| Code | Meaning | Suggested Action |
|:-----|:--------|:-----------------|
| `0` | No changes | Pass |
| `1` | Info-level changes | Pass or warn |
| `2` | Warning-level changes | Warn |
| `3` | Breaking changes | Fail |
| `4` | Runtime error | Fail |
| `5` | Low confidence metrics | Warn or fail |

## GitHub Action

```yaml
- uses: dotsetlabs/bellwether@v2.1.3
  with:
    version: '2.1.3'
    server-command: 'npx @mcp/your-server'
    baseline-path: './bellwether-baseline.json'
    fail-on-severity: 'warning'
```

## Configuration

All settings live in `bellwether.yaml`. Create one with presets:

```bash
bellwether init npx @mcp/your-server           # Default (free, fast)
bellwether init --preset ci npx @mcp/server    # Optimized for CI/CD
bellwether init --preset local npx @mcp/server # Local Ollama (free)
```

For remote MCP servers that require auth headers, configure:

```yaml
server:
  transport: sse
  url: "https://api.example.com/mcp"
  headers:
    Authorization: "Bearer ${MCP_SERVER_TOKEN}"
```

Or use one-off CLI overrides:

```bash
bellwether check -H "Authorization: Bearer $MCP_SERVER_TOKEN"
```

## Environment Variables

| Variable | Description |
|:---------|:------------|
| `OPENAI_API_KEY` | OpenAI API key (explore only) |
| `ANTHROPIC_API_KEY` | Anthropic API key (explore only) |
| `OLLAMA_BASE_URL` | Ollama URL (default: `http://localhost:11434`) |

## Documentation

**[docs.bellwether.sh](https://docs.bellwether.sh)** — Full reference for configuration and commands.

- [Quick Start](https://docs.bellwether.sh/quickstart)
- [Core vs Advanced](https://docs.bellwether.sh/concepts/core-vs-advanced)
- [CLI Reference](https://docs.bellwether.sh/cli/init)
- [CI/CD Integration](https://docs.bellwether.sh/guides/ci-cd)
- [Golden Paths](https://docs.bellwether.sh/guides/golden-paths)
- [Compatibility Policy](https://docs.bellwether.sh/concepts/compatibility-policy)

## Project Governance

- [Changelog](./CHANGELOG.md)
- [Releases](https://github.com/dotsetlabs/bellwether/releases)

## Community

- [GitHub Discussions](https://github.com/dotsetlabs/bellwether/discussions) - Questions and ideas
- [GitHub Issues](https://github.com/dotsetlabs/bellwether/issues) - Bug reports
- [Contributing](./CONTRIBUTING.md) - How to contribute

## Development

```bash
git clone https://github.com/dotsetlabs/bellwether
cd bellwether
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

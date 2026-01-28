---
title: FAQ
sidebar_position: 100
---

# Frequently Asked Questions

## General

### What is Bellwether?

Bellwether is a CLI tool for structural drift detection and behavioral documentation of MCP (Model Context Protocol) servers. It has two main commands:

- **`bellwether check`** - Free, fast, deterministic schema validation and drift detection
- **`bellwether explore`** - LLM-powered multi-persona exploration for deeper behavioral documentation

### What is MCP?

[Model Context Protocol](https://modelcontextprotocol.io/) is an open standard created by Anthropic for connecting AI assistants (Claude, GPT, Cursor) to external tools and data sources.

When you build an MCP server, you're creating capabilities that AI agents can call—reading files, querying databases, calling APIs, or running custom business logic. MCP is supported by Claude Desktop, Zed, Cursor, Cline, and other AI-powered tools.

### What's the difference between check and explore?

| | `bellwether check` | `bellwether explore` |
|:--|:-------------------|:---------------------|
| **Cost** | Free | ~$0.01-0.15 per run (cloud) or Free (local) |
| **Speed** | Seconds | Minutes |
| **LLM Required** | No | Yes |
| **Output** | CONTRACT.md | AGENTS.md |
| **Best For** | CI/CD, drift detection | Deep analysis, documentation |
| **Deterministic** | Yes | No |

**check** compares tool schemas against a baseline—fast, free, and deterministic. Perfect for CI/CD.

**explore** uses LLMs to probe your server from 4 different personas (Technical Writer, Security Tester, QA Engineer, Novice User), generating rich behavioral documentation.

### Is Bellwether free?

Yes! Bellwether is completely free and open source (MIT license).

- `bellwether check` requires no LLM and has zero costs
- `bellwether explore` requires an LLM API key (OpenAI, Anthropic) or local Ollama (also free)

### What LLM providers are supported?

For `bellwether explore`:

- **Anthropic** (recommended) - Claude Haiku 4.5, Claude Sonnet 4.5, Claude Opus 4.5
- **OpenAI** - GPT-4.1-nano (default), GPT-4.1, GPT-4o
- **Ollama** - Local models (Qwen3, Llama, Mistral, etc.)

### How much does explore mode cost?

Typical costs per exploration (varies based on server complexity):

| Model | Cost | Notes |
|:------|:-----|:------|
| Ollama (qwen3:8b) | Free | Local, requires GPU |
| gpt-4.1-nano | ~$0.01-0.02 | Budget cloud option |
| claude-haiku-4-5 | ~$0.02-0.05 | Recommended for quality/cost balance |
| gpt-4.1 | ~$0.04-0.08 | Higher quality OpenAI |
| claude-sonnet-4-5 | ~$0.08-0.15 | Premium quality |

**Note:** Avoid GPT-5 series models for Bellwether—they use "reasoning tokens" that make costs unpredictable and significantly higher.

### Why not just write unit tests?

Unit tests verify YOUR expectations. Bellwether discovers UNEXPECTED behaviors.

Think of the difference:
- **Unit test**: "Does `get_weather('NYC')` return weather data?"
- **Bellwether**: "What happens when someone calls `get_weather` with a SQL injection string?"

They're complementary. Unit tests catch regressions in known behavior. Bellwether surfaces behaviors you haven't thought to test yet. Use both for complete coverage.

### How reliable is drift detection?

Drift detection in `bellwether check` is 100% deterministic—it compares tool schemas, parameters, and descriptions against a saved baseline. No LLM involved.

This detects:
- Tool additions and removals
- Parameter changes (added, removed, type changes)
- Schema modifications
- Description changes

For behavioral changes (how tools actually respond), use `bellwether explore` periodically for deeper analysis.

### Is this project sustainable?

Bellwether is fully open source (MIT license). The project is designed for long-term sustainability:

1. **Open Source**: If development ever stops, the code is yours to fork and maintain
2. **Community-Driven**: Contributions welcome from the community
3. **Simple Architecture**: Minimal dependencies, easy to understand and extend

## Installation

### What are the system requirements?

- Node.js 20 or later
- npm or npx
- For explore mode: One of OpenAI API key, Anthropic API key, or local Ollama

### Can I use Bellwether without an API key?

Yes! `bellwether check` works completely without any API key. It's free and deterministic.

For `bellwether explore`, you can use Ollama for free local LLM inference:

```bash
ollama serve
ollama pull qwen3:8b
bellwether explore npx your-server
```

### How do I update Bellwether?

```bash
npm update -g @dotsetlabs/bellwether
```

## Usage

### How do I check an MCP server?

```bash
bellwether check npx @modelcontextprotocol/server-filesystem /tmp
```

### How do I explore an MCP server with LLM?

```bash
bellwether explore npx @modelcontextprotocol/server-filesystem /tmp
```

### What output formats are supported?

- **CONTRACT.md** - Structural documentation (from check)
- **AGENTS.md** - Behavioral documentation (from explore)
- **JSON** - Machine-readable data for programmatic analysis

### How do I use different personas in explore mode?

Configure in `bellwether.yaml`:

```yaml
explore:
  personas:
    - technical_writer
    - security_tester
    - qa_engineer
    - novice_user
```

### How do I save a baseline?

```bash
bellwether check npx your-server
bellwether baseline save
# Creates: bellwether-baseline.json
```

### How do I compare against a baseline?

Run check first, then compare:

```bash
bellwether check npx your-server
bellwether baseline compare ./bellwether-baseline.json --fail-on-drift
```

Or configure baseline comparison in `bellwether.yaml`:

```yaml
baseline:
  comparePath: "./bellwether-baseline.json"
  failOnDrift: true
```

Then simply run:

```bash
bellwether check --fail-on-drift
```

## CI/CD

### How do I use Bellwether in CI?

```yaml
# GitHub Actions (check mode - free, no API key needed)
- name: Run Bellwether
  run: |
    npx @dotsetlabs/bellwether check
    npx @dotsetlabs/bellwether baseline compare ./bellwether-baseline.json --fail-on-drift
```

### What do exit codes mean?

| Code | Meaning |
|:-----|:--------|
| 0 | Clean (no changes) |
| 1 | Info-level changes |
| 2 | Warning-level changes |
| 3 | Breaking changes |
| 4 | Runtime error |
| 5 | Low confidence metrics (when `check.sampling.failOnLowConfidence` is true) |

### How do I minimize CI costs?

Use `bellwether check` which is completely free. Only use `bellwether explore` periodically for deeper analysis (not in every CI run).

## Security

### Is my API key safe?

API keys are:
- Never logged
- Never sent to Bellwether servers
- Only sent to your chosen LLM provider (for explore mode)

### What data does Bellwether send to LLMs?

In explore mode:
- Tool names and schemas
- Test scenarios and responses
- No source code unless included in tool responses

In check mode:
- Nothing—check mode doesn't use LLMs

### Can Bellwether damage my server?

Bellwether only calls tools that exist on your server. It generates test scenarios but doesn't execute arbitrary code. Use appropriate test environments.

## Troubleshooting

### "API key not found"

This only applies to explore mode. Set up your API key:

```bash
# Interactive setup (recommended)
bellwether auth

# Or set environment variable
export OPENAI_API_KEY=sk-xxx
```

### "Connection refused"

Check your server starts correctly:

```bash
bellwether discover npx your-server
```

### "Timeout errors"

Increase timeout in bellwether.yaml:

```yaml
server:
  timeout: 120000
```

## Contributing

### How do I report bugs?

Open an issue at [github.com/dotsetlabs/bellwether/issues](https://github.com/dotsetlabs/bellwether/issues).

### How do I contribute?

See [CONTRIBUTING.md](https://github.com/dotsetlabs/bellwether/blob/main/CONTRIBUTING.md).

### Is there a community?

- GitHub Discussions: [github.com/dotsetlabs/bellwether/discussions](https://github.com/dotsetlabs/bellwether/discussions)
- Issues: [github.com/dotsetlabs/bellwether/issues](https://github.com/dotsetlabs/bellwether/issues)

---
title: FAQ
sidebar_position: 100
---

# Frequently Asked Questions

## General

### What is Bellwether?

Bellwether is a CLI tool that generates behavioral documentation for MCP (Model Context Protocol) servers. It uses LLMs to intelligently interview your server, discovering how it actually behaves rather than relying on manually written documentation.

### What is MCP?

[Model Context Protocol](https://modelcontextprotocol.io/) is an open standard created by Anthropic for connecting AI assistants (Claude, GPT, Cursor) to external tools and data sources.

When you build an MCP server, you're creating capabilities that AI agents can call—reading files, querying databases, calling APIs, or running custom business logic. MCP is supported by Claude Desktop, Zed, Cursor, Cline, and other AI-powered tools.

### Is Bellwether free?

The CLI is free and open source (MIT license). Optional cloud features (baseline history, verification badges) have a free tier and paid plans.

### What LLM providers are supported?

- **OpenAI** - GPT-4o, GPT-4o-mini, GPT-4-turbo
- **Anthropic** - Claude Sonnet, Claude Opus, Claude Haiku
- **Ollama** - Local models (Llama, Mistral, etc.)

### How much does it cost to run?

Typical costs per interview:

| Model | Cost |
|:------|:-----|
| gpt-5-mini | ~$0.02 |
| claude-haiku-4-5 | ~$0.04 |
| gpt-5.2 | ~$0.12 |
| claude-sonnet-4-5 | ~$0.13 |
| Ollama | Free |

Quick mode (`--quick`) costs ~$0.01.

### Why not just write unit tests?

Unit tests verify YOUR expectations. Bellwether discovers UNEXPECTED behaviors.

Think of the difference:
- **Unit test**: "Does `get_weather('NYC')` return weather data?"
- **Bellwether**: "What happens when someone calls `get_weather` with a SQL injection string?"

They're complementary. Unit tests catch regressions in known behavior. Bellwether surfaces behaviors you haven't thought to test yet. Use both for complete coverage.

### How reliable is drift detection if it uses LLMs?

Drift detection has two modes:

1. **Structural comparison** (deterministic): Schema changes, parameter changes, tool additions/removals. No LLM involved—100% reliable.

2. **Semantic comparison** (LLM-assisted): Behavioral changes in responses. This flags *potential* changes for human review; it doesn't auto-fail pipelines unless you configure it to.

For maximum determinism, use `--scenarios-only` with your own YAML test files. This mode runs your predefined tests without any LLM involvement.

### Is this project sustainable as a solo developer effort?

Three things make Bellwether sustainable:

1. **MIT License**: The CLI is fully open source. If the project is ever abandoned, the code is yours to fork and maintain.

2. **Simple Business Model**: Free CLI for adoption, $29/mo team plan for ongoing cloud costs. No VC pressure, no growth-at-all-costs.

3. **Community Building**: Contributions welcome. The goal is community-maintained infrastructure, not a one-person dependency.

## Installation

### What are the system requirements?

- Node.js 20 or later
- npm or npx
- Internet connection (for LLM API calls)
- One of: OpenAI API key, Anthropic API key, or local Ollama

### Can I use Bellwether without an API key?

Yes, using Ollama for local LLM inference:

```bash
ollama serve
ollama pull llama3.2
bellwether interview npx your-server
```

### How do I update Bellwether?

```bash
npm update -g @dotsetlabs/bellwether
```

## Usage

### How do I interview an MCP server?

```bash
bellwether interview npx @modelcontextprotocol/server-filesystem /tmp
```

### What output formats are supported?

- **Markdown** (AGENTS.md) - Human-readable documentation
- **JSON** - Machine-readable data for programmatic analysis

### How do I use different personas?

```bash
# Single persona
bellwether interview --persona security_tester npx server

# Multiple personas
bellwether interview --persona technical_writer,security_tester npx server
```

### How do I save a baseline?

```bash
bellwether interview --save-baseline npx your-server
# Creates: bellwether-baseline.json
```

### How do I compare against a baseline?

```bash
bellwether interview \
  --compare-baseline ./bellwether-baseline.json \
  --fail-on-drift \
  npx your-server
```

## CI/CD

### How do I use Bellwether in CI?

```yaml
# GitHub Actions
- name: Run Bellwether
  env:
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
  run: |
    npx @dotsetlabs/bellwether interview \
      --ci \
      --compare-baseline ./baseline.json \
      --fail-on-drift \
      npx your-server
```

### What do exit codes mean?

| Code | Meaning |
|:-----|:--------|
| 0 | Success |
| 1 | Drift or security issues |
| 2 | Interview error |

### How do I minimize CI costs?

Use quick mode:

```bash
bellwether interview --quick npx your-server
```

This uses a cheaper model and fewer questions (~$0.01).

## Cloud

### Is cloud required?

No. Bellwether works fully offline. Cloud adds:
- Baseline history
- Verification badges

### How do I connect to cloud?

```bash
bellwether login
bellwether link
bellwether upload
```

### What data is stored in cloud?

- Baseline snapshots (tool schemas, behavior observations)
- Project metadata

No source code or credentials are uploaded.

## Security

### Is my API key safe?

API keys are:
- Never logged
- Never sent to Bellwether servers
- Only sent to your chosen LLM provider

### What data does Bellwether send to LLMs?

- Tool names and schemas
- Test scenarios and responses
- No source code unless included in tool responses

### Can Bellwether damage my server?

Bellwether only calls tools that exist on your server. It generates test scenarios but doesn't execute arbitrary code. Use appropriate test environments.

### Are "Documented by Bellwether" badges security certifications?

No. Documentation badges indicate testing coverage levels, not security certifications.

- **Bronze-Gold**: Documentation and testing coverage tiers
- **Platinum**: Comprehensive documentation with all testing personas

Badges show that a server has been systematically documented and tested with Bellwether. While security hygiene checks are included, this is a first line of defense, not a replacement for professional security audits.

For production systems handling sensitive data, you should still conduct professional security reviews.

## Troubleshooting

### "API key not found"

Set up your API key:

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

Increase timeout:

```bash
bellwether interview --timeout 120000 npx your-server
```

### "Interview taking too long"

Use quick mode:

```bash
bellwether interview --quick npx your-server
```

## Contributing

### How do I report bugs?

Open an issue at [github.com/dotsetlabs/bellwether/issues](https://github.com/dotsetlabs/bellwether/issues).

### How do I contribute?

See [CONTRIBUTING.md](https://github.com/dotsetlabs/bellwether/blob/main/CONTRIBUTING.md).

### Is there a community?

- GitHub Discussions: [github.com/dotsetlabs/bellwether/discussions](https://github.com/dotsetlabs/bellwether/discussions)
- Issues: [github.com/dotsetlabs/bellwether/issues](https://github.com/dotsetlabs/bellwether/issues)

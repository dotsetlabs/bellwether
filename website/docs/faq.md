---
title: FAQ
sidebar_position: 100
---

# Frequently Asked Questions

## General

### What is Bellwether?

Bellwether is a CLI tool that generates behavioral documentation for MCP (Model Context Protocol) servers. It uses LLMs to intelligently interview your server, discovering how it actually behaves rather than relying on manually written documentation.

### What is MCP?

[Model Context Protocol](https://modelcontextprotocol.io/) is a standard for AI agents to interact with external tools and data sources. MCP servers expose tools that AI assistants can call.

### Is Bellwether free?

The CLI is free and open source (MIT license). Optional cloud features (baseline history, team collaboration) have a free tier and paid plans.

### What LLM providers are supported?

- **OpenAI** - GPT-4o, GPT-4o-mini, GPT-4-turbo
- **Anthropic** - Claude Sonnet, Claude Opus, Claude Haiku
- **Ollama** - Local models (Llama, Mistral, etc.)

### How much does it cost to run?

Typical costs per interview:

| Model | Cost |
|:------|:-----|
| gpt-4o-mini | ~$0.02 |
| claude-3-5-haiku | ~$0.03 |
| gpt-4o | ~$0.13 |
| claude-sonnet | ~$0.13 |
| Ollama | Free |

Quick mode (`--quick`) costs ~$0.01.

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
- **JSON** - Machine-readable data
- **SARIF** - GitHub Code Scanning
- **JUnit** - CI test runners

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
- Team collaboration
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
- Team information

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

## Troubleshooting

### "API key not found"

Set your environment variable:

```bash
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

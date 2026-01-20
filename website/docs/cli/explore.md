---
title: explore
sidebar_position: 3
---

# bellwether explore

Explore an MCP server's behavior using LLM-powered multi-persona testing. Generates rich AGENTS.md documentation.

## Synopsis

```bash
bellwether explore [server-command] [args...]
bellwether explore --provider <provider>
bellwether explore --model <model>
```

## Description

The `explore` command uses LLMs to deeply probe your MCP server from multiple perspectives. Four personas test your server:

- **Technical Writer** - Documentation quality and completeness
- **Security Tester** - Vulnerabilities, injection, path traversal
- **QA Engineer** - Edge cases, error handling, boundaries
- **Novice User** - Usability, confusing behavior, missing guidance

This generates AGENTS.md—rich behavioral documentation that captures how your server actually works.

## Arguments

| Argument | Description |
|:---------|:------------|
| `[server-command]` | Command to start the MCP server (optional if set in config) |
| `[args...]` | Arguments to pass to the server command |

## Options

| Option | Description | Default |
|:-------|:------------|:--------|
| `-c, --config <path>` | Path to config file | `bellwether.yaml` |
| `--provider <provider>` | Override LLM provider (ollama, openai, anthropic) | From config |
| `--model <model>` | Override LLM model | From config |

## Examples

### Basic Exploration

```bash
# Explore with server command
bellwether explore npx @modelcontextprotocol/server-filesystem /tmp

# Or use server command from config
bellwether explore
```

### With Specific Provider

```bash
# Use OpenAI
bellwether explore --provider openai npx server

# Use Anthropic
bellwether explore --provider anthropic npx server

# Use local Ollama (free)
bellwether explore --provider ollama npx server
```

### With Specific Model

```bash
# GPT-4o for better quality
bellwether explore --model gpt-5.2 npx server

# Claude Sonnet
bellwether explore --provider anthropic --model claude-sonnet-4-5 npx server
```

## Output Files

| File | Description |
|:-----|:------------|
| `AGENTS.md` | Behavioral documentation from multi-persona exploration |
| `bellwether-explore.json` | Machine-readable exploration results |

### AGENTS.md Contents

The generated documentation includes:
- **Server Information**: Name, version, protocol version
- **Quick Reference**: Tool signatures and return types
- **Performance Metrics**: Response times and error rates
- **Tool Profiles**: Behavioral observations, edge cases, security notes
- **Prompt Profiles**: If server exposes prompts
- **Resource Profiles**: If server exposes resources
- **Security Findings**: Vulnerabilities discovered during testing
- **Workflow Results**: Multi-step workflow testing results

## Configuration

Explore mode uses settings from `bellwether.yaml`. Key sections:

```yaml
server:
  command: "npx @mcp/your-server"
  timeout: 30000

llm:
  provider: openai          # ollama, openai, anthropic
  model: gpt-5-mini        # Leave empty for provider default
  ollama:
    baseUrl: "http://localhost:11434"

explore:
  personas:
    - technical_writer
    - security_tester
    - qa_engineer
    - novice_user
  maxQuestionsPerTool: 3    # 1-10
  parallelPersonas: false   # Run personas in parallel
  skipErrorTests: false     # Skip error/edge case testing

workflows:
  discover: true            # LLM-based workflow discovery
  trackState: false         # State tracking between steps

output:
  dir: "."
```

## Personas

| Persona | Focus | Typical Findings |
|:--------|:------|:-----------------|
| `technical_writer` | Documentation | Missing descriptions, unclear parameters |
| `security_tester` | Security | Path traversal, injection, info disclosure |
| `qa_engineer` | Quality | Edge cases, error handling, boundaries |
| `novice_user` | Usability | Confusing behavior, missing guidance |

### Selecting Personas

```yaml
# bellwether.yaml
explore:
  personas:
    - security_tester    # Security focus only
```

Or use all personas for comprehensive exploration:

```yaml
explore:
  personas:
    - technical_writer
    - security_tester
    - qa_engineer
    - novice_user
```

## Cost Estimation

Bellwether shows cost estimates before running:

```
Estimated cost: $0.04 - $0.08
Estimated time: 2-4 minutes
```

Typical costs:

| Model | Cost per Exploration |
|:------|:--------------------|
| gpt-5-mini | ~$0.02 |
| claude-haiku-4-5 | ~$0.04 |
| gpt-5.2 | ~$0.12 |
| claude-sonnet-4-5 | ~$0.13 |
| Ollama (local) | Free |

## LLM Provider Setup

### OpenAI

```bash
bellwether auth add openai
# Enter your API key when prompted
```

### Anthropic

```bash
bellwether auth add anthropic
# Enter your API key when prompted
```

### Ollama (Free)

```bash
# Start Ollama
ollama serve

# Pull a model
ollama pull llama3.2

# Run explore (no API key needed)
bellwether explore npx server
```

## Exit Codes

| Code | Meaning |
|:-----|:--------|
| `0` | Success - exploration completed |
| `1` | Exploration failed |

## Environment Variables

| Variable | Description |
|:---------|:------------|
| `OPENAI_API_KEY` | OpenAI API key |
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `OLLAMA_BASE_URL` | Ollama server URL (default: `http://localhost:11434`) |

## Tips

### For Better Results

1. **Use a better model**: GPT-4o or Claude Sonnet produce more insightful observations
2. **Increase questions**: Set `explore.maxQuestionsPerTool: 5` for deeper exploration
3. **Enable all personas**: More perspectives = more comprehensive documentation

### For Lower Costs

1. **Use Ollama**: Free local inference
2. **Reduce personas**: Use only `technical_writer` for basic documentation
3. **Reduce questions**: Set `explore.maxQuestionsPerTool: 1`

### For CI/CD

Use `bellwether check` for CI/CD (free, fast, deterministic). Run `bellwether explore` periodically for deeper analysis, not in every pipeline run.

## See Also

- [check](/cli/check) - Free, fast schema validation
- [init](/cli/init) - Create configuration file
- [auth](/cli/auth) - Manage API keys
- [Custom Personas](/guides/custom-personas) - Creating custom personas
- [Workflow Authoring](/guides/workflow-authoring) - Multi-step workflow testing

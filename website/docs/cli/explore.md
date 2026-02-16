---
title: explore
sidebar_position: 3
---

# bellwether explore

Explore an MCP server's behavior using LLM-powered multi-persona testing. Generates rich AGENTS.md documentation.

## Synopsis

```bash
bellwether explore [server-command] [args...]
```

## Description

The `explore` command uses LLMs to deeply probe your MCP server from multiple perspectives. By default it runs the **Technical Writer** persona; you can add more in `bellwether.yaml`:

- **Technical Writer** - Documentation quality and completeness
- **Security Tester** - Vulnerabilities, injection, path traversal
- **QA Engineer** - Edge cases, error handling, boundaries
- **Novice User** - Usability, confusing behavior, missing guidance

This generates AGENTS.md—rich behavioral documentation that captures how your server actually works.

:::note Config Required
`explore` requires a config file. Run `bellwether init` once in your project.
:::

## Arguments

| Argument | Description |
|:---------|:------------|
| `[server-command]` | Command to start the MCP server (optional if set in config) |
| `[args...]` | Arguments to pass to the server command |

## Options

| Option | Description | Default |
|:-------|:------------|:--------|
| `-c, --config <path>` | Path to config file | `bellwether.yaml` |
| `-H, --header <header...>` | Custom header(s) for remote MCP requests (for example `Authorization: Bearer token`) | From `server.headers` |

:::tip Config-First Design
LLM provider and model are configured in `bellwether.yaml` under `llm.provider` and `llm.model`. This keeps your configuration in one place and avoids needing to remember CLI flags.
:::

## Examples

### Basic Exploration

```bash
# Explore with server command
bellwether explore npx @modelcontextprotocol/server-filesystem /tmp

# Or use server command from config
bellwether explore
```

### Remote Server with Auth Header

```bash
bellwether explore \
  --config bellwether.yaml \
  -H "Authorization: Bearer $MCP_SERVER_TOKEN"
```

### Configure LLM Provider

Configure your LLM provider in `bellwether.yaml`:

```yaml
# Use OpenAI
llm:
  provider: openai
  model: gpt-4.1-nano  # or gpt-4.1 for better quality

# Use Anthropic
llm:
  provider: anthropic
  model: claude-haiku-4-5  # or claude-sonnet-4-5 for better quality

# Use local Ollama (free)
llm:
  provider: ollama
  model: qwen3:8b
```

Then run:

```bash
bellwether explore
```

## Output Files

| File | Description |
|:-----|:------------|
| `AGENTS.md` | Behavioral documentation from multi-persona exploration (configurable via `output.files.agentsDoc`) |
| `bellwether-explore.json` | Machine-readable exploration results (configurable via `output.files.exploreReport`) |

Output locations are controlled by `output.dir` (JSON) and `output.docsDir` (docs).
Which files are written is controlled by `output.format` (`docs`, `json`, or `both`; legacy alias: `agents.md`).

The JSON report embeds a `$schema` pointer for validation against the published explore schema.

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
  # transport: sse
  # url: "https://api.example.com/mcp"
  # headers:
  #   Authorization: "Bearer ${MCP_SERVER_TOKEN}"
  timeout: 30000

llm:
  provider: anthropic       # ollama, openai, anthropic
  model: ""                 # Leave empty for provider default
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

| Model | Cost per Exploration | Notes |
|:------|:--------------------|:------|
| Ollama (qwen3:8b) | Free | Local, requires GPU |
| gpt-4.1-nano | ~$0.01-0.02 | Budget cloud option |
| claude-haiku-4-5 | ~$0.02-0.05 | Recommended |
| gpt-4.1 | ~$0.04-0.08 | Higher quality OpenAI |
| claude-sonnet-4-5 | ~$0.08-0.15 | Premium quality |

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
ollama pull qwen3:8b

# Run explore (no API key needed)
bellwether explore npx server
```

## Exit Codes

| Code | Meaning |
|:-----|:--------|
| `0` | Success - exploration completed |
| `4` | Error - connection, config, or LLM failure |

## Environment Variables

| Variable | Description |
|:---------|:------------|
| `OPENAI_API_KEY` | OpenAI API key |
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `OLLAMA_BASE_URL` | Ollama server URL (default: `http://localhost:11434`) |

## Tips

### For Better Results

1. **Use a better model**: Claude Sonnet or GPT-4.1 produce more insightful observations
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

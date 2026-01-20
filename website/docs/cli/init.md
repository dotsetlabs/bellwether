---
title: init
sidebar_position: 1
---

# bellwether init

Create a `bellwether.yaml` configuration file.

## Synopsis

```bash
bellwether init [server-command]
bellwether init --preset <preset> [server-command]
```

:::tip
If your server command includes arguments, wrap the entire command in quotes:
```bash
bellwether init "npx @mcp/server /data"
```
:::

## Description

The `init` command creates a `bellwether.yaml` configuration file in the current directory. This file controls all aspects of how Bellwether checks and explores your MCP server.

## Arguments

| Argument | Description |
|:---------|:------------|
| `[server-command]` | Command to start the MCP server (e.g., `"npx @mcp/server /data"`) |

If your server command includes arguments, wrap the entire string in quotes so they are parsed together.

## Options

| Option | Description | Default |
|:-------|:------------|:--------|
| `-f, --force` | Overwrite existing config file | `false` |
| `-p, --preset <name>` | Use a preset configuration | - |
| `-y, --yes` | Skip prompts, use defaults | `false` |

## Presets

Presets configure Bellwether for common use cases:

| Preset | Description |
|:-------|:------------|
| `ci` | Fast, free, deterministic - perfect for CI/CD with `failOnDrift: true` |
| `local` | Explore mode with local Ollama (free LLM) |
| `security` | Security-focused exploration with security persona |
| `thorough` | Comprehensive exploration with all personas |

## Examples

### Default Configuration

```bash
# Initialize with server command (quote if it includes arguments)
bellwether init "npx @modelcontextprotocol/server-filesystem /tmp"

# Or just initialize, add server later
bellwether init
```

### CI/CD Preset

```bash
bellwether init --preset ci "npx your-server"
```

Optimized for CI/CD pipelines with `failOnDrift: true`.

### Local LLM Exploration (Free)

```bash
bellwether init --preset local "npx your-server"
```

Uses local Ollama for free LLM-powered exploration. Requires Ollama running:

```bash
ollama serve
ollama pull llama3.2
```

### Security-Focused Exploration

```bash
bellwether init --preset security "npx your-server"
```

Enables security persona with comprehensive vulnerability testing.

### Comprehensive Exploration

```bash
bellwether init --preset thorough "npx your-server"
```

All personas, workflow discovery, and maximum coverage.

### Overwrite Existing Config

```bash
bellwether init --force "npx your-server"
```

## Generated Configuration

The generated `bellwether.yaml` includes:

```yaml
# Bellwether Configuration

# =============================================================================
# SERVER
# =============================================================================
server:
  command: "npx @modelcontextprotocol/server-filesystem"
  args:
    - "/tmp"
  timeout: 30000

# =============================================================================
# LLM SETTINGS (for explore command)
# =============================================================================
llm:
  provider: ollama
  model: ""
  ollama:
    baseUrl: "http://localhost:11434"

# =============================================================================
# EXPLORE SETTINGS
# =============================================================================
explore:
  personas:
    - technical_writer
  maxQuestionsPerTool: 3
  parallelPersonas: false
  skipErrorTests: false

# =============================================================================
# SCENARIOS (for check and explore)
# =============================================================================
scenarios:
  path: ""
  only: false

# =============================================================================
# WORKFLOWS (for explore)
# =============================================================================
workflows:
  path: ""
  discover: false
  trackState: false

# =============================================================================
# OUTPUT
# =============================================================================
output:
  dir: "."

# =============================================================================
# BASELINE (for check)
# =============================================================================
baseline:
  comparePath: ""
  failOnDrift: false

# =============================================================================
# CACHE
# =============================================================================
cache:
  enabled: true
  dir: ".bellwether/cache"

# =============================================================================
# LOGGING
# =============================================================================
logging:
  level: info
  verbose: false
```

## Two Commands

After initialization, you have two main commands:

### bellwether check (Free)

- **Cost**: Free
- **Speed**: Fast (seconds)
- **Determinism**: 100% reproducible
- **Output**: CONTRACT.md
- **Best for**: CI/CD pipelines, quick drift detection

### bellwether explore (Requires LLM)

- **Cost**: ~$0.01-0.15 per run
- **Speed**: Slower (minutes)
- **Output**: AGENTS.md
- **Best for**: Deep testing, documentation, security audits

## Environment Variables

If your MCP server requires environment variables (API keys, tokens, URLs), add them to the `server.env` section using interpolation syntax:

```yaml
server:
  command: "npx @your/mcp-server"
  env:
    # Reference environment variables from shell or .env file
    API_KEY: "${API_KEY}"
    SERVICE_URL: "${SERVICE_URL}"

    # With default values
    LOG_LEVEL: "${LOG_LEVEL:-info}"
    DEBUG: "${DEBUG:-false}"
```

The `${VAR}` syntax pulls values from your environment (shell exports or `.env` file loaded via dotenv). This allows you to commit `bellwether.yaml` to version control without exposing secrets.

:::tip
Use `${VAR:-default}` syntax to provide fallback values when an environment variable isn't set.
:::

## Next Steps After Init

```bash
# 1. Run check (free, fast)
bellwether check

# 2. Review generated documentation
cat CONTRACT.md

# 3. Save a baseline for drift detection
bellwether baseline save

# 4. (Optional) Run explore for deeper analysis
bellwether auth                    # Set up LLM API key
bellwether explore

# 5. Review behavioral documentation
cat AGENTS.md
```

## See Also

- [check](/cli/check) - Schema validation and drift detection
- [explore](/cli/explore) - LLM-powered behavioral exploration
- [baseline](/cli/baseline) - Manage baselines
- [Configuration Guide](/guides/configuration) - Full configuration reference

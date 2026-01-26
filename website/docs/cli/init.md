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

:::note Required First Step
Every CLI command (except `init`) requires this config file. Run `bellwether init` once per project.
:::

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
| `--provider <provider>` | LLM provider for explore command (`ollama`, `openai`, `anthropic`) | `ollama` |
| `-y, --yes` | Skip prompts, use defaults | `false` |

## Presets

Presets configure Bellwether for common use cases:

| Preset | Description |
|:-------|:------------|
| `ci` | Optimized for CI/CD: `failOnDrift: true`, parallel testing, higher sampling confidence |
| `local` | Explore mode with local Ollama (free LLM) |
| `security` | Security testing enabled with all categories, plus security persona for explore |
| `thorough` | Comprehensive testing: all personas, security enabled, high confidence sampling, workflow discovery |

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
ollama pull qwen3:8b
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

The generated `bellwether.yaml` includes all available options with sensible defaults. Key sections:

```yaml
# Bellwether Configuration

# =============================================================================
# SERVER
# =============================================================================
server:
  command: "npx @modelcontextprotocol/server-filesystem"
  args: ["/tmp"]
  transport: stdio
  # url: "https://example.com/mcp"
  # sessionId: "session-id"
  timeout: 30000
  env: {}

# =============================================================================
# OUTPUT
# =============================================================================
output:
  dir: ".bellwether"    # JSON output directory
  docsDir: "."          # Documentation (CONTRACT.md, AGENTS.md)
  format: both          # agents.md, json, or both

  # Example output settings
  examples:
    full: true          # Include full examples in documentation
    maxLength: 5000     # Maximum example length
    maxPerTool: 5       # Maximum examples per tool

# =============================================================================
# CHECK SETTINGS
# =============================================================================
check:
  incremental: false          # Only test changed tools
  incrementalCacheHours: 168  # Cache age (1 week)
  parallel: true              # Parallel tool testing (recommended)
  parallelWorkers: 4          # Concurrent workers (1-10)
  performanceThreshold: 10    # Regression threshold (%)

  # Security testing
  security:
    enabled: false
    categories:
      - sql_injection
      - xss
      - path_traversal
      - command_injection
      - ssrf
      - error_disclosure

  # Statistical sampling
  sampling:
    minSamples: 10             # Minimum samples per tool
    targetConfidence: low      # low, medium, or high
    failOnLowConfidence: false

# =============================================================================
# BASELINE
# =============================================================================
baseline:
  comparePath: ""
  savePath: ""
  failOnDrift: false

  severity:
    minimumSeverity: none
    failOnSeverity: breaking
    suppressWarnings: false

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
  personas: [technical_writer]
  maxQuestionsPerTool: 3
  parallelPersonas: false
  skipErrorTests: false

# =============================================================================
# WORKFLOWS
# =============================================================================
workflows:
  discover: false
  trackState: false
  autoGenerate: false     # Auto-generate from tool patterns
  stepTimeout: 5000

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

:::tip Config-First Design
All customization is done through this configuration file. CLI commands have minimal flags—only `--config`, `--format`, and operational flags like `--accept-drift`.
:::

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

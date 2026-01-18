---
title: test
sidebar_position: 2
---

# bellwether test

Test an MCP server using configuration from `bellwether.yaml`.

## Synopsis

```bash
bellwether test [server-command] [args...]
bellwether test --config <path>
```

## Description

The `test` command is the core of Bellwether. It connects to an MCP server, discovers its capabilities, and tests them based on your configuration.

All settings are defined in `bellwether.yaml`. Use `bellwether init` to create one:

```bash
bellwether init                    # Default structural mode (free, fast)
bellwether init --preset ci        # Optimized for CI/CD
bellwether init --preset security  # Security-focused testing
bellwether init --preset thorough  # Comprehensive testing
bellwether init --preset local     # Full mode with local Ollama
```

## Arguments

| Argument | Description |
|:---------|:------------|
| `[server-command]` | Command to start the MCP server (optional if set in config) |
| `[args...]` | Arguments to pass to the server command |

## Options

| Option | Description | Default |
|:-------|:------------|:--------|
| `-c, --config <path>` | Path to config file | `bellwether.yaml` |

:::info Config Required
A `bellwether.yaml` config file is required. Run `bellwether init` to create one.
:::

## Configuration Reference

All test settings are configured in `bellwether.yaml`. Here's a complete reference:

### Server Settings

```yaml
server:
  command: "npx @mcp/your-server"  # Server command
  args: ["/data"]                  # Server arguments
  timeout: 30000                   # Startup/call timeout (ms)
  env:                             # Environment variables
    NODE_ENV: production
```

### Test Mode

```yaml
# structural: Fast, free, deterministic - compares tool schemas only
# full: Uses LLM to generate intelligent test scenarios
mode: structural
```

### LLM Settings (full mode only)

```yaml
llm:
  provider: ollama         # ollama, openai, or anthropic
  model: ""                # Leave empty for provider default
  ollama:
    baseUrl: "http://localhost:11434"
```

### Test Settings (full mode only)

```yaml
test:
  personas:
    - technical_writer     # Documentation quality
    - security_tester      # Security vulnerabilities
    - qa_engineer          # Edge cases, error handling
    - novice_user          # Usability, confusing behavior
  maxQuestionsPerTool: 3   # 1-10
  parallelPersonas: false  # Run personas in parallel
  skipErrorTests: false    # Skip error/edge case testing
```

### Scenarios

```yaml
scenarios:
  path: "./bellwether-tests.yaml"  # Custom test scenarios
  only: false                      # Run only scenarios, no LLM tests
```

### Workflows

```yaml
workflows:
  path: "./bellwether-workflows.yaml"  # Workflow definitions
  discover: false                      # LLM-based workflow discovery
  trackState: false                    # State tracking between steps
```

### Output

```yaml
output:
  dir: "."                # Output directory
  format: agents.md       # agents.md, json, or both
  cloudFormat: false      # Cloud-compatible baseline format
```

### Baseline

```yaml
baseline:
  comparePath: "./bellwether-baseline.json"  # Compare against baseline
  failOnDrift: false                         # Exit with error if drift
  minConfidence: 0                           # Min confidence to report
  confidenceThreshold: 80                    # Threshold for CI failure
```

### Cache

```yaml
cache:
  enabled: true                # Enable response caching
  dir: ".bellwether/cache"     # Cache directory
```

### Logging

```yaml
logging:
  level: info      # debug, info, warn, error, silent
  verbose: false   # Show verbose output
```

## Examples

### Basic Test

```bash
# Create config first
bellwether init

# Run test with server command
bellwether test npx @modelcontextprotocol/server-filesystem /tmp

# Or use server command from config
bellwether test
```

### Using Presets

```bash
# CI-optimized (structural, fast, fails on drift)
bellwether init --preset ci
bellwether test npx your-server

# Security-focused (full mode, security persona)
bellwether init --preset security
bellwether test npx your-server

# Comprehensive testing (all personas, workflow discovery)
bellwether init --preset thorough
bellwether test npx your-server

# Local Ollama (full mode, free)
bellwether init --preset local
bellwether test npx your-server
```

### Drift Detection

```bash
# Run test and save baseline
bellwether test npx your-server
bellwether baseline save

# Later, compare against baseline
bellwether test npx your-server
bellwether baseline compare ./bellwether-baseline.json --fail-on-drift
```

### Custom Scenarios Only

```yaml
# bellwether.yaml
scenarios:
  path: "./bellwether-tests.yaml"
  only: true
```

```bash
bellwether test npx your-server
```

### Custom Config Path

```bash
bellwether test --config ./configs/production.yaml npx your-server
```

## Exit Codes

| Code | Meaning |
|:-----|:--------|
| `0` | Success - test completed, no issues |
| `1` | Failure - drift detected or test failed |
| `2` | Error - connection, configuration, or timeout error |

## Output Files

Depending on configuration, the following files may be generated:

| File | Description | When Generated |
|:-----|:------------|:---------------|
| `AGENTS.md` | Human-readable behavioral documentation | `format: agents.md` or `both` |
| `bellwether-report.json` | Machine-readable JSON report | `format: json` or `both` |

### AGENTS.md Contents

The generated documentation includes:
- **Server Information**: Name, version, protocol version
- **Quick Reference**: Tool signatures and return types
- **Performance Metrics**: Response times and error rates
- **Tool Profiles**: Description, parameters, expected behavior
- **Prompt Profiles**: If server exposes prompts
- **Resource Profiles**: If server exposes resources
- **Security Findings**: Security concerns discovered during testing
- **Scenario Results**: Pass/fail for custom test scenarios

## Environment Variables

| Variable | Description |
|:---------|:------------|
| `OPENAI_API_KEY` | OpenAI API key (for full mode with OpenAI) |
| `ANTHROPIC_API_KEY` | Anthropic API key (for full mode with Anthropic) |
| `OLLAMA_BASE_URL` | Ollama server URL (default: `http://localhost:11434`) |

## See Also

- [init](/cli/init) - Create configuration file
- [baseline](/cli/baseline) - Manage baselines for drift detection
- [discover](/cli/discover) - Quick capability discovery
- [watch](/cli/watch) - Watch mode for continuous testing
- [Configuration Guide](/guides/configuration) - Comprehensive config reference
- [CI/CD Integration](/guides/ci-cd) - Pipeline integration
- [Custom Scenarios](/guides/custom-scenarios) - YAML-defined test cases

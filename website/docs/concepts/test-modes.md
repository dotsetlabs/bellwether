---
title: Check vs Explore
sidebar_position: 1
---

# Check vs Explore

Bellwether offers two commands to fit different workflows and budgets.

## Quick Comparison

| | `bellwether check` | `bellwether explore` |
|:--|:-------------------|:---------------------|
| **Cost** | Free | ~$0.01-0.15 per run |
| **Speed** | Seconds | Minutes |
| **LLM Required** | No | Yes |
| **Deterministic** | 100% | No (LLM variation) |
| **What it does** | Schema validation, drift detection | Behavioral analysis, edge cases, security |
| **Output** | `CONTRACT.md`, `bellwether-check.json` | `AGENTS.md`, `bellwether-explore.json` |

## bellwether check (Free)

The check command validates tool schemas, parameter types, and descriptions without making any LLM calls. It's:

- **Free** - No API costs
- **Fast** - Completes in seconds
- **Deterministic** - Same input always produces same output
- **CI/CD friendly** - No API keys required
- **Output** - Generates `CONTRACT.md` and `bellwether-check.json`

```bash
# Initialize config and run check
bellwether init npx @mcp/server
bellwether check

# With baseline comparison (configure baseline.comparePath in bellwether.yaml)
bellwether check
bellwether check --fail-on-drift  # Override baseline.failOnDrift
```

### What Check Detects

- Tools added or removed
- Parameter changes (name, type, required status)
- Description changes
- Schema hash changes

### When to Use Check

- **CI/CD pipelines** - Fast, free, deterministic
- **PR checks** - Quick validation before merge
- **Schema validation** - Ensure API contracts are maintained
- **Cost-sensitive environments** - No API costs

## bellwether explore (Requires LLM)

The explore command uses an LLM to intelligently probe your server from multiple perspectives. It's:

- **Comprehensive** - Tests edge cases, error handling, security
- **Multi-persona** - Technical writer, security tester, QA engineer, novice user perspectives
- **Rich documentation** - Generates detailed `AGENTS.md` with observed behavior

```bash
# Initialize with local preset and run explore
bellwether init --preset local npx @mcp/server
bellwether explore

# Configure provider in bellwether.yaml
# llm:
#   provider: openai  # or anthropic
```

### What Explore Provides

- Behavioral observations (how tools actually behave)
- Edge case testing
- Error handling patterns
- Security analysis
- Performance metrics
- Limitations discovery
- Multi-persona perspectives

### When to Use Explore

- **Local development** - Deep understanding of server behavior
- **Security audits** - Comprehensive vulnerability testing
- **Documentation generation** - Rich `AGENTS.md` output
- **Pre-release testing** - Thorough validation before deployment

## Cost Comparison

Typical costs for exploring a server with 10 tools:

| Provider/Model | Cost | Notes |
|:---------------|:-----|:------|
| `bellwether check` | $0.00 | Free, deterministic |
| Ollama (qwen3:8b) | $0.00 | Free, requires local setup |
| gpt-4.1-nano | ~$0.01-0.02 | Budget cloud option |
| claude-haiku-4-5 | ~$0.02-0.05 | Recommended |
| gpt-4.1 | ~$0.04-0.08 | Higher quality OpenAI |
| claude-sonnet-4-5 | ~$0.08-0.15 | Premium quality |

## Combining Check and Explore

A common pattern is to use both commands:

1. **CI/CD**: `bellwether check` for fast, free drift detection
2. **Local dev**: `bellwether explore` for comprehensive testing and documentation

```bash
# CI/CD pipeline (baseline path configured in bellwether.yaml)
bellwether check --fail-on-drift

# Local development
bellwether explore  # Uses config from bellwether.yaml
```

## Configuration

Both commands use settings from `bellwether.yaml`:

```yaml
server:
  command: "npx @mcp/server"
  timeout: 30000

# LLM settings (for explore command)
llm:
  provider: anthropic  # or openai, ollama
  model: ""  # optional, uses provider default (claude-haiku-4-5)

# Explore settings
explore:
  personas:
    - technical_writer
    - security_tester
  maxQuestionsPerTool: 3

# Baseline settings (for check command)
baseline:
  comparePath: "./bellwether-baseline.json"
  failOnDrift: false
```

Or use presets when initializing:

```bash
bellwether init --preset ci        # Optimized for check in CI/CD
bellwether init --preset local     # Explore with Ollama
bellwether init --preset security  # Explore with security focus
bellwether init --preset thorough  # Explore with all personas
```

## See Also

- [check](/cli/check) - Check command reference
- [explore](/cli/explore) - Explore command reference
- [Configuration](/guides/configuration) - Full configuration reference
- [CI/CD Integration](/guides/ci-cd) - Using check in pipelines
- [Personas](/concepts/personas) - Multi-persona testing in explore
- [Drift Detection](/concepts/drift-detection) - How drift detection works

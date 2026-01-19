---
title: Test Modes
sidebar_position: 1
---

# Test Modes

Bellwether offers two testing modes to fit different workflows and budgets.

## Quick Comparison

| | Structural Mode | Full Mode |
|:--|:----------------|:----------|
| **Cost** | Free | ~$0.01-0.15 per test |
| **Speed** | Seconds | Minutes |
| **LLM Required** | No | Yes |
| **Deterministic** | 100% | No (LLM variation) |
| **What it tests** | Schema, types, descriptions | Behavior, edge cases, security |
| **Documentation** | Basic | Comprehensive |

## Structural Mode (Default)

Structural mode compares tool schemas, parameter types, and descriptions without making any LLM calls. It's:

- **Free** - No API costs
- **Fast** - Completes in seconds
- **Deterministic** - Same input always produces same output
- **CI/CD friendly** - No API keys required

```bash
# Initialize with structural mode (default)
bellwether init "npx @mcp/server"

# Or explicitly with CI preset
bellwether init --preset ci "npx @mcp/server"
```

### What Structural Mode Detects

- Tools added or removed
- Parameter changes (name, type, required status)
- Description changes
- Schema hash changes
- Response structure changes

### When to Use Structural Mode

- **CI/CD pipelines** - Fast, free, deterministic
- **PR checks** - Quick validation before merge
- **Schema validation** - Ensure API contracts are maintained
- **Cost-sensitive environments** - No API costs

## Full Mode

Full mode uses an LLM to generate intelligent test scenarios and analyze behavior. It's:

- **Comprehensive** - Tests edge cases, error handling, security
- **Multi-persona** - Technical writer, security tester, QA engineer, novice user perspectives
- **Rich documentation** - Generates detailed AGENTS.md with observed behavior

```bash
# Initialize with full mode using local Ollama (free)
bellwether init --preset local "npx @mcp/server"

# Or with OpenAI/Anthropic
bellwether init --full --provider openai "npx @mcp/server"
```

### What Full Mode Provides

- Behavioral observations (how tools actually behave)
- Edge case testing
- Error handling patterns
- Security analysis
- Performance metrics
- Limitations discovery
- Multi-persona perspectives

### When to Use Full Mode

- **Local development** - Deep understanding of server behavior
- **Security audits** - Comprehensive vulnerability testing
- **Documentation generation** - Rich AGENTS.md output
- **Pre-release testing** - Thorough validation before deployment

## Cost Comparison

Typical costs for testing a server with 10 tools:

| Provider/Model | Cost | Notes |
|:---------------|:-----|:------|
| Structural | $0.00 | Free, deterministic |
| Ollama (local) | $0.00 | Free, requires local setup |
| gpt-4o-mini | ~$0.02 | Good balance of cost/quality |
| claude-haiku-4-5 | ~$0.04 | Good balance of cost/quality |
| gpt-4o | ~$0.12 | Best quality |
| claude-sonnet-4-5 | ~$0.13 | Best quality |

## Combining Modes

A common pattern is to use both modes:

1. **CI/CD**: Structural mode for fast, free drift detection
2. **Local dev**: Full mode for comprehensive testing and documentation

```yaml
# bellwether.yaml for local development
mode: full
llm:
  provider: ollama  # Free local LLM

# Create a separate config for CI
# bellwether-ci.yaml
mode: structural
```

## Configuration

Set the mode in `bellwether.yaml`:

```yaml
# Structural mode (default)
mode: structural

# Full mode
mode: full
llm:
  provider: openai  # or anthropic, ollama
  model: gpt-4o-mini  # optional, uses provider default
```

Or use presets when initializing:

```bash
bellwether init --preset ci      # Structural mode
bellwether init --preset local   # Full mode with Ollama
bellwether init --preset security  # Full mode with security focus
bellwether init --preset thorough  # Full mode with all personas
```

## See Also

- [Configuration](/guides/configuration) - Full configuration reference
- [CI/CD Integration](/guides/ci-cd) - Using structural mode in pipelines
- [Personas](/concepts/personas) - Multi-persona testing in full mode
- [Drift Detection](/concepts/drift-detection) - How drift detection works in both modes

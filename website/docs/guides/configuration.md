---
title: Configuration
sidebar_position: 2
---

# Configuration

Configure Bellwether behavior using YAML configuration files.

## Configuration Files

Bellwether looks for configuration in this order:

1. `--config` flag (explicit path)
2. `./bellwether.yaml` (project root)
3. `~/.bellwether/bellwether.yaml` (global defaults)

## Basic Configuration

Create `bellwether.yaml` in your project:

```yaml
version: 1

llm:
  provider: openai
  model: gpt-4o

interview:
  maxQuestionsPerTool: 3
  timeout: 30000

output:
  format: agents.md
```

## Full Configuration Reference

```yaml
# Configuration version (required)
version: 1

# LLM Provider Settings
llm:
  # Provider: openai, anthropic, or ollama
  provider: openai

  # Specific model (optional, uses provider default)
  model: gpt-5-mini

  # Environment variable containing API key (recommended)
  # Note: apiKey directly in config is NOT allowed for security
  apiKeyEnvVar: OPENAI_API_KEY

  # Custom API endpoint (optional, for proxies/self-hosted)
  baseUrl: https://api.openai.com/v1

# Interview Settings
interview:
  # Questions per tool (1-20)
  maxQuestionsPerTool: 3

  # Tool call timeout in ms
  timeout: 30000

  # Skip error-generating tests
  skipErrorTests: false

  # Personas to use (comma-separated string or array)
  personas:
    - technical_writer
    - security_tester

# Output Settings
output:
  # Format: agents.md, json, or both
  format: agents.md

  # Output directory
  outputDir: .

# Drift Detection Settings
drift:
  # Strict mode: only report structural (deterministic) changes
  # Use this in CI for 100% reproducible results
  strict: false

  # Minimum confidence score (0-100) to report a change
  # Changes below this threshold are filtered out
  minConfidence: 0

  # Confidence threshold (0-100) for CI to fail on breaking changes
  # Breaking changes with confidence below this may be LLM noise
  confidenceThreshold: 80

  # Fail on drift in CI mode
  failOnDrift: false
```

## Provider-Specific Configuration

### OpenAI

```yaml
llm:
  provider: openai
  model: gpt-5-mini      # or gpt-5.2, gpt-5
  # baseUrl: https://...  # For Azure OpenAI or proxies
```

Environment: `OPENAI_API_KEY`

### Anthropic

```yaml
llm:
  provider: anthropic
  model: claude-haiku-4-5  # or claude-sonnet-4-5, claude-opus-4-5
```

Environment: `ANTHROPIC_API_KEY`

### Ollama

```yaml
llm:
  provider: ollama
  model: llama3.2
  baseUrl: http://localhost:11434  # Optional, default shown
```

No API key required.

## Interview Presets

Bellwether provides built-in presets for common use cases. Use the `--preset` flag to apply them:

```bash
bellwether interview --preset docs npx your-server
bellwether interview --preset security npx your-server
bellwether interview --preset thorough npx your-server
bellwether interview --preset ci npx your-server
```

| Preset | Personas | Questions | Description |
|:-------|:---------|:----------|:------------|
| `docs` | Technical Writer | 3 | Quick documentation generation |
| `security` | Technical Writer, Security Tester | 3 | Security-focused testing |
| `thorough` | All 4 personas | 5 | Comprehensive testing |
| `ci` | Technical Writer | 1 | Fast CI/CD checks |

### Override Preset Options

You can override specific preset values with CLI flags:

```bash
# Use security preset but with more questions
bellwether interview --preset security --max-questions 5 npx your-server
```

### Equivalent YAML Configurations

If you prefer YAML configuration, here are the equivalent settings:

#### docs Preset

```yaml
interview:
  maxQuestionsPerTool: 3
  personas:
    - technical_writer
```

#### security Preset

```yaml
interview:
  maxQuestionsPerTool: 3
  personas:
    - technical_writer
    - security_tester
```

#### thorough Preset

```yaml
interview:
  maxQuestionsPerTool: 5
  personas:
    - technical_writer
    - security_tester
    - qa_engineer
    - novice_user
```

#### ci Preset

```yaml
interview:
  maxQuestionsPerTool: 1
  personas:
    - technical_writer
```

## Drift Detection Configuration

Configure how drift detection behaves when comparing baselines:

```yaml
drift:
  strict: false           # Only structural changes (deterministic)
  minConfidence: 0        # Minimum confidence to report (0-100)
  confidenceThreshold: 80 # Threshold for CI failures (0-100)
  failOnDrift: false      # Exit with error on drift
```

### Confidence Scoring

Every detected change includes a confidence score indicating how certain Bellwether is about the change:

| Change Type | Confidence | Method |
|:------------|:-----------|:-------|
| Tool added/removed | 100% | Structural |
| Schema changed | 100% | Structural |
| Assertion changed | 60-95% | Semantic (LLM) |
| Security finding | 70-95% | Semantic (LLM) |

### Strict Mode

For CI/CD pipelines requiring **100% deterministic results**, enable strict mode:

```yaml
drift:
  strict: true
  failOnDrift: true
```

In strict mode:
- Only structural changes (tool presence, schema) are reported
- Semantic comparisons (LLM-based) are completely skipped
- Results are 100% reproducible across runs
- Zero additional API costs for comparison

### Confidence Thresholds

When not using strict mode, filter out low-confidence changes:

```yaml
drift:
  minConfidence: 60       # Don't report changes below 60% confidence
  confidenceThreshold: 80 # Only fail CI on high-confidence breaking changes
```

### Recommended Configurations

| Environment | Configuration |
|:------------|:--------------|
| CI deployment gates | `strict: true, failOnDrift: true` |
| PR review | `minConfidence: 60, failOnDrift: true` |
| Nightly tests | Default settings |
| Security compliance | `strict: true, failOnDrift: true` |

## Environment Variables

Override configuration with environment variables:

| Variable | Overrides |
|:---------|:----------|
| `OPENAI_API_KEY` | OpenAI authentication |
| `ANTHROPIC_API_KEY` | Anthropic authentication |
| `OLLAMA_BASE_URL` | Ollama server URL |
| `BELLWETHER_LOG_LEVEL` | Log verbosity |
| `BELLWETHER_SESSION` | Cloud authentication |

## Command Line Overrides

CLI flags override configuration file values:

```bash
# Override model
bellwether interview --model gpt-4o-mini npx server

# Override max questions
bellwether interview --max-questions 5 npx server

# Override personas
bellwether interview --persona security_tester npx server
```

## Project vs Global Config

### Project Config (`./bellwether.yaml`)

Project-specific settings that should be version controlled:

```yaml
version: 1

interview:
  maxQuestionsPerTool: 3
  personas:
    - technical_writer
    - security_tester

baseline:
  path: ./baselines/current.json
```

### Global Config (`~/.bellwether/bellwether.yaml`)

Personal defaults that apply across all projects:

```yaml
version: 1

llm:
  provider: openai
  model: gpt-4o

# Don't set project-specific values here
```

## Validation

Bellwether validates configuration on startup. Invalid config produces clear errors:

```
Configuration error in bellwether.yaml:
  interview.maxQuestionsPerTool: Must be between 1 and 20
  llm.provider: Must be one of: openai, anthropic, ollama
```

## Generate Default Config

```bash
bellwether init
```

Creates a documented `bellwether.yaml` with sensible defaults.

## See Also

- [Profiles](/cli/profile) - Save and switch configurations
- [Custom Personas](/guides/custom-personas) - Create personas
- [Drift Detection](/concepts/drift-detection) - Understanding confidence scores
- [CI/CD Integration](/guides/ci-cd) - Pipeline configurations
- [init](/cli/init) - Generate configuration

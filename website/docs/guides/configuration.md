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
  format: markdown
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
  model: gpt-4o

  # Custom API endpoint (optional)
  baseUrl: https://api.openai.com/v1

  # Request timeout in ms (optional)
  timeout: 60000

# Interview Settings
interview:
  # Questions per tool (1-20)
  maxQuestionsPerTool: 3

  # Tool call timeout in ms
  timeout: 30000

  # Personas to use
  personas:
    - technical_writer
    - security_tester

  # Custom persona files
  personaFiles:
    - ./personas/custom.persona.yaml

  # Workflow files
  workflowFiles:
    - ./workflows/*.workflow.yaml

# Output Settings
output:
  # Format: markdown, json, sarif, junit
  format: markdown

  # Output directory
  directory: .

  # Custom AGENTS.md filename
  agentsFileName: AGENTS.md

# Baseline Settings
baseline:
  # Default baseline path
  path: ./bellwether-baseline.json

  # Auto-save baseline after interview
  autoSave: false

# Cloud Settings (optional)
cloud:
  # Auto-upload after interview
  autoUpload: false

  # Project ID (usually set by `bellwether link`)
  projectId: proj_xxx
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
- [init](/cli/init) - Generate configuration

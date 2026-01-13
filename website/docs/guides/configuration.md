---
title: Configuration
sidebar_position: 2
---

# Configuration

Configure Inquest behavior using YAML configuration files.

## Configuration Files

Inquest looks for configuration in this order:

1. `--config` flag (explicit path)
2. `./inquest.yaml` (project root)
3. `~/.inquest/inquest.yaml` (global defaults)

## Basic Configuration

Create `inquest.yaml` in your project:

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
  path: ./inquest-baseline.json

  # Auto-save baseline after interview
  autoSave: false

# Cloud Settings (optional)
cloud:
  # Auto-upload after interview
  autoUpload: false

  # Project ID (usually set by `inquest link`)
  projectId: proj_xxx
```

## Provider-Specific Configuration

### OpenAI

```yaml
llm:
  provider: openai
  model: gpt-4o          # or gpt-4o-mini, gpt-4-turbo
  # baseUrl: https://...  # For Azure OpenAI or proxies
```

Environment: `OPENAI_API_KEY`

### Anthropic

```yaml
llm:
  provider: anthropic
  model: claude-sonnet-4-20250514  # or claude-3-opus, claude-3-haiku
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

### Quick (CI)

```yaml
interview:
  maxQuestionsPerTool: 1
  personas:
    - technical_writer

llm:
  model: gpt-4o-mini
```

### Thorough (Release)

```yaml
interview:
  maxQuestionsPerTool: 5
  personas:
    - technical_writer
    - security_tester
    - qa_engineer
    - novice_user

llm:
  model: gpt-4o
```

### Security Focus

```yaml
interview:
  maxQuestionsPerTool: 10
  personas:
    - security_tester

output:
  format: sarif
```

## Environment Variables

Override configuration with environment variables:

| Variable | Overrides |
|:---------|:----------|
| `OPENAI_API_KEY` | OpenAI authentication |
| `ANTHROPIC_API_KEY` | Anthropic authentication |
| `OLLAMA_BASE_URL` | Ollama server URL |
| `INQUEST_LOG_LEVEL` | Log verbosity |
| `INQUEST_SESSION` | Cloud authentication |

## Command Line Overrides

CLI flags override configuration file values:

```bash
# Override model
inquest interview --model gpt-4o-mini npx server

# Override max questions
inquest interview --max-questions 5 npx server

# Override personas
inquest interview --persona security_tester npx server
```

## Project vs Global Config

### Project Config (`./inquest.yaml`)

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

### Global Config (`~/.inquest/inquest.yaml`)

Personal defaults that apply across all projects:

```yaml
version: 1

llm:
  provider: openai
  model: gpt-4o

# Don't set project-specific values here
```

## Validation

Inquest validates configuration on startup. Invalid config produces clear errors:

```
Configuration error in inquest.yaml:
  interview.maxQuestionsPerTool: Must be between 1 and 20
  llm.provider: Must be one of: openai, anthropic, ollama
```

## Generate Default Config

```bash
inquest init
```

Creates a documented `inquest.yaml` with sensible defaults.

## See Also

- [Profiles](/cli/profile) - Save and switch configurations
- [Custom Personas](/guides/custom-personas) - Create personas
- [init](/cli/init) - Generate configuration

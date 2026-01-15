---
title: init
sidebar_position: 3
---

# bellwether init

Create a default configuration file.

## Synopsis

```bash
bellwether init [options]
```

## Description

The `init` command creates an `bellwether.yaml` configuration file in the current directory with sensible defaults. This file can be customized to configure LLM providers, interview settings, and output options.

## Options

| Option | Description | Default |
|:-------|:------------|:--------|
| `-f, --force` | Overwrite existing config file | `false` |

## Examples

### Create Default Config

```bash
bellwether init
```

Creates `bellwether.yaml`:

```yaml
version: 1

# LLM Provider Configuration
llm:
  provider: openai          # openai, anthropic, or ollama
  model: gpt-4o             # Optional: override default model

# Interview Settings
interview:
  maxQuestionsPerTool: 3    # Questions per tool (1-20)
  timeout: 30000            # Tool call timeout in ms
  personas:                 # Personas to use (optional)
    - technical_writer
    - security_tester

# Output Settings
output:
  format: markdown          # markdown, json, or both
  directory: .              # Output directory
```

### Overwrite Existing Config

```bash
bellwether init --force
```

## Configuration Options

### LLM Section

```yaml
llm:
  provider: openai      # Required: openai, anthropic, or ollama
  model: gpt-4o-mini    # Optional: specific model
  baseUrl: http://...   # Optional: custom API endpoint
```

### Interview Section

```yaml
interview:
  maxQuestionsPerTool: 5    # 1-20 questions per tool
  timeout: 60000            # Timeout per tool call (ms)
  personas:                 # Which personas to use
    - technical_writer
    - security_tester
    - qa_engineer
    - novice_user
  personaFiles:             # Custom persona files
    - ./personas/custom.persona.yaml
```

### Output Section

```yaml
output:
  format: markdown      # markdown, json, or both
  directory: ./docs     # Where to write output files
  agentsFileName: AGENTS.md
```

## See Also

- [Configuration Guide](/guides/configuration) - Full configuration reference
- [Custom Personas](/guides/custom-personas) - Creating custom personas
- [interview](/cli/interview) - Run interviews

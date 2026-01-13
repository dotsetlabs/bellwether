---
title: profile
sidebar_position: 4
---

# inquest profile

Manage interview profiles for different testing scenarios.

## Synopsis

```bash
inquest profile <subcommand> [options]
```

## Description

Profiles let you save and reuse interview configurations for different scenarios. For example, you might have a "quick" profile for CI and a "thorough" profile for release testing.

## Subcommands

### list

List all available profiles.

```bash
inquest profile list
```

Output:
```
Available profiles:
  default     Default interview settings
  quick       Fast CI checks (1 question, cheap model)
  security    Security-focused testing
  thorough    Comprehensive testing (5 questions, all personas)
```

### create

Create a new profile.

```bash
inquest profile create <name> [options]
```

Options:
| Option | Description |
|:-------|:------------|
| `--provider <provider>` | LLM provider |
| `--model <model>` | LLM model |
| `--max-questions <n>` | Questions per tool |
| `--personas <list>` | Comma-separated personas |

Example:
```bash
inquest profile create security-audit \
  --provider anthropic \
  --model claude-sonnet-4-20250514 \
  --max-questions 5 \
  --personas security_tester
```

### use

Set the active profile for subsequent commands.

```bash
inquest profile use <name>
```

Example:
```bash
inquest profile use security-audit
inquest interview npx your-server  # Uses security-audit profile
```

### show

Show details of a profile.

```bash
inquest profile show <name>
```

### delete

Delete a profile.

```bash
inquest profile delete <name>
```

## Examples

### Create a CI Profile

```bash
# Create a fast, cheap profile for CI
inquest profile create ci \
  --provider openai \
  --model gpt-4o-mini \
  --max-questions 1 \
  --personas technical_writer

# Use in CI
inquest profile use ci
inquest interview --ci npx your-server
```

### Create a Security Audit Profile

```bash
inquest profile create security \
  --provider anthropic \
  --model claude-sonnet-4-20250514 \
  --max-questions 10 \
  --personas security_tester,qa_engineer
```

### Create a Thorough Testing Profile

```bash
inquest profile create release \
  --provider openai \
  --model gpt-4o \
  --max-questions 5 \
  --personas technical_writer,security_tester,qa_engineer,novice_user
```

## Profile Storage

Profiles are stored in `~/.inquest/profiles/`:

```
~/.inquest/
  profiles/
    default.yaml
    ci.yaml
    security.yaml
    release.yaml
```

Each profile is a YAML file with interview settings:

```yaml
# ~/.inquest/profiles/security.yaml
llm:
  provider: anthropic
  model: claude-sonnet-4-20250514

interview:
  maxQuestionsPerTool: 10
  personas:
    - security_tester
    - qa_engineer
```

## See Also

- [Configuration Guide](/guides/configuration) - Full configuration options
- [Personas](/concepts/personas) - Understanding testing personas
- [interview](/cli/interview) - Run interviews

---
title: profile
sidebar_position: 4
---

# bellwether profile

Manage interview profiles for different testing scenarios.

## Synopsis

```bash
bellwether profile <subcommand> [options]
```

## Description

Profiles let you save and reuse interview configurations for different scenarios. For example, you might have a "quick" profile for CI and a "thorough" profile for release testing.

## Subcommands

### list

List all available profiles.

```bash
bellwether profile list
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
bellwether profile create <name> [options]
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
bellwether profile create security-audit \
  --provider anthropic \
  --model claude-sonnet-4-5 \
  --max-questions 5 \
  --personas security_tester
```

### use

Set the active profile for subsequent commands.

```bash
bellwether profile use <name>
```

Example:
```bash
bellwether profile use security-audit
bellwether interview npx your-server  # Uses security-audit profile
```

### show

Show details of a profile.

```bash
bellwether profile show <name>
```

### delete

Delete a profile.

```bash
bellwether profile delete <name>
```

### update

Update an existing profile's settings.

```bash
bellwether profile update <name> [options]
```

Options:
| Option | Description |
|:-------|:------------|
| `-p, --provider <provider>` | Update LLM provider |
| `-m, --model <model>` | Update LLM model |
| `-q, --max-questions <n>` | Update questions per tool |
| `--personas <list>` | Update comma-separated personas |
| `-f, --format <format>` | Update output format |

Example:
```bash
# Change model and increase questions
bellwether profile update ci --model gpt-4o --max-questions 2
```

### export

Export a profile as YAML to stdout.

```bash
bellwether profile export [name]
```

If no name is provided, exports the current active profile.

Example:
```bash
# Export to file
bellwether profile export security > security-profile.yaml

# View current profile
bellwether profile export
```

### import

Import a profile from a YAML file.

```bash
bellwether profile import <file> [options]
```

Options:
| Option | Description |
|:-------|:------------|
| `-n, --name <name>` | Override the profile name |

Example:
```bash
# Import profile
bellwether profile import ./security-profile.yaml

# Import with different name
bellwether profile import ./security-profile.yaml --name production-security
```

## Examples

### Create a CI Profile

```bash
# Create a fast, cheap profile for CI
bellwether profile create ci \
  --provider openai \
  --model gpt-4o-mini \
  --max-questions 1 \
  --personas technical_writer

# Use in CI
bellwether profile use ci
bellwether interview --ci npx your-server
```

### Create a Security Audit Profile

```bash
bellwether profile create security \
  --provider anthropic \
  --model claude-sonnet-4-5 \
  --max-questions 10 \
  --personas security_tester,qa_engineer
```

### Create a Thorough Testing Profile

```bash
bellwether profile create release \
  --provider openai \
  --model gpt-5.2 \
  --max-questions 5 \
  --personas technical_writer,security_tester,qa_engineer,novice_user
```

## Profile Storage

Profiles are stored in `~/.bellwether/profiles/`:

```
~/.bellwether/
  profiles/
    default.yaml
    ci.yaml
    security.yaml
    release.yaml
```

Each profile is a YAML file with interview settings:

```yaml
# ~/.bellwether/profiles/security.yaml
llm:
  provider: anthropic
  model: claude-sonnet-4-5

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

---
title: validate-config
---

# bellwether validate-config

Validate `bellwether.yaml` without connecting to an MCP server or running tests.

## Synopsis

```bash
bellwether validate-config
bellwether validate-config --config ./configs/ci.yaml
```

## Description

`validate-config` loads your config file, applies schema validation, and prints any warnings.

Use this command to quickly verify config changes in local development or CI before running `check` or `explore`.

## Options

| Option | Description | Default |
|:-------|:------------|:--------|
| `-c, --config <path>` | Path to config file | `bellwether.yaml` |

## Examples

### Validate Project Config

```bash
bellwether validate-config
```

### Validate an Environment-Specific Config

```bash
bellwether validate-config --config ./configs/ci.yaml
```

### Validate in CI

```yaml
- name: Validate Bellwether config
  run: npx @dotsetlabs/bellwether validate-config --config ./configs/ci.yaml
```

## Output

When valid:

```text
Configuration is valid.
```

If non-blocking warnings exist, they are printed after the success message.

When invalid:

```text
Invalid configuration:
  - check.parallelWorkers: Must be between 1 and 10
```

## Exit Codes

| Code | Meaning |
|:-----|:--------|
| `0` | Configuration is valid |
| `4` | Config file missing or invalid |

## See Also

- [init](/cli/init) - Generate `bellwether.yaml`
- [Configuration](/guides/configuration) - Full config reference
- [check](/cli/check) - Run deterministic validation and drift detection

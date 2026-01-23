---
title: golden
sidebar_position: 5
---

# bellwether golden

Manage golden outputs for deterministic tool regression tests.

## Synopsis

```bash
bellwether golden save --tool <name>
bellwether golden compare [options]
bellwether golden list [options]
bellwether golden delete --tool <name>
```

## Description

Golden outputs capture the exact response from a tool and let you compare future responses for drift. This is useful for deterministic regression testing when you want to validate output stability beyond schema changes.

:::note Config Required
All CLI commands (except `init`) require a config file. Run `bellwether init` once before using `golden`.
:::

## Subcommands

### save

Capture the current output of a tool as a golden reference.

```bash
bellwether golden save --tool <name>
```

| Option | Description | Default |
|:-------|:------------|:--------|
| `--tool <name>` | Tool name to capture output for | Required |
| `-c, --config <path>` | Path to config file | `bellwether.yaml` |
| `--args <json>` | JSON arguments to pass to the tool | `golden.defaultArgs` |
| `--mode <mode>` | Comparison mode: `exact`, `structural`, `semantic` | `golden.mode` |
| `--allowed-drift <paths>` | Comma-separated JSONPath patterns to ignore | - |
| `--no-normalize-timestamps` | Disable timestamp normalization | `golden.normalizeTimestamps` |
| `--no-normalize-uuids` | Disable UUID normalization | `golden.normalizeUuids` |
| `--description <text>` | Description of this golden output | - |

### compare

Compare current outputs against saved golden outputs.

```bash
bellwether golden compare
```

| Option | Description | Default |
|:-------|:------------|:--------|
| `-c, --config <path>` | Path to config file | `bellwether.yaml` |
| `--tool <name>` | Only compare a specific tool | - |
| `--fail-on-drift` | Exit with error if drift is detected | `false` |
| `--format <format>` | Output format: `text`, `json`, `markdown` | `golden.compareFormat` |

### list

List all saved golden outputs.

```bash
bellwether golden list
```

| Option | Description | Default |
|:-------|:------------|:--------|
| `-c, --config <path>` | Path to config file | `bellwether.yaml` |
| `--format <format>` | Output format: `text`, `json` | `golden.listFormat` |

### delete

Delete saved golden outputs for a tool.

```bash
bellwether golden delete --tool <name>
```

| Option | Description | Default |
|:-------|:------------|:--------|
| `--tool <name>` | Tool name to delete golden output for | Required |
| `-c, --config <path>` | Path to config file | `bellwether.yaml` |
| `--all` | Delete all golden outputs for this tool | `false` |

## Storage

Golden outputs are stored under `output.dir` as `bellwether-golden.json` by default.

## Examples

```bash
# Capture a golden output
bellwether golden save --tool read_file --args '{"path":"/tmp/test.txt"}'

# Compare current output against goldens
bellwether golden compare --fail-on-drift

# List saved goldens
bellwether golden list
```

## See Also

- [check](/cli/check) - Drift detection and schema validation
- [baselines](/concepts/baselines) - Baseline-based comparisons

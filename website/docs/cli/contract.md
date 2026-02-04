---
title: contract
sidebar_position: 6
---

# bellwether contract

Validate MCP servers against contract definitions.

## Synopsis

```bash
bellwether contract validate <server-command...>
bellwether contract generate <server-command...>
bellwether contract show [path]
```

## Description

The `contract` command lets you capture an explicit contract file and validate your server against it. This is useful when you want a strict, versioned spec beyond baseline drift detection.

:::note Config Required
`contract` requires a config file. Run `bellwether init` once in your project.
:::

## Subcommands

### validate

Validate an MCP server against a contract file.

```bash
bellwether contract validate <server-command...>
```

| Option | Description | Default |
|:-------|:------------|:--------|
| `-c, --config <path>` | Path to config file | `bellwether.yaml` |
| `--contract <path>` | Path to contract file | `contract.path` or default filenames |
| `--mode <mode>` | Validation mode: `strict`, `lenient`, `report` | `contract.mode` |
| `--fail-on-violation` | Exit with error if violations are found | `contract.failOnViolation` |
| `--format <format>` | Output format: `text`, `json`, `markdown` | `contract.format` |
| `--timeout <ms>` | Server startup timeout in milliseconds | `contract.timeout` |

### generate

Generate a contract file from the current server state.

```bash
bellwether contract generate <server-command...>
```

| Option | Description | Default |
|:-------|:------------|:--------|
| `-c, --config <path>` | Path to config file | `bellwether.yaml` |
| `-o, --output <path>` | Output path for contract file | `contract.path` or default filename |
| `--timeout <ms>` | Server startup timeout in milliseconds | `contract.timeout` |
| `-f, --force` | Overwrite existing contract file | `false` |

### show

Display contract file contents.

```bash
bellwether contract show [path]
```

| Option | Description | Default |
|:-------|:------------|:--------|
| `[path]` | Path to contract file | `contract.path` or default filenames |
| `-c, --config <path>` | Path to config file | `bellwether.yaml` |
| `--json` | Output as JSON instead of YAML | `false` |

## Default Contract Filenames

If no explicit contract path is provided, Bellwether looks for:

- `contract.bellwether.yaml`
- `contract.bellwether.yml`
- `.bellwether-contract.yaml`
- `.bellwether-contract.yml`

## Examples

```bash
# Generate a contract
bellwether contract generate npx @mcp/your-server

# Validate using that contract
bellwether contract validate npx @mcp/your-server

# Show contract contents
bellwether contract show
```

## See Also

- [check](/cli/check) - Drift detection and schema validation
- [baselines](/concepts/baselines) - Baseline-based comparisons

---
title: check
sidebar_position: 2
---

# bellwether check

Check an MCP server for schema validation and drift detection. Free, fast, and deterministic.

## Synopsis

```bash
bellwether check [server-command] [args...]
bellwether check --fail-on-drift
```

## Description

The `check` command is the core of Bellwether. It connects to an MCP server, discovers its tools, validates schemas, and generates CONTRACT.md documentation—all without requiring an LLM.

This is the recommended command for CI/CD pipelines because it's:
- **Free** - No API keys or LLM costs
- **Fast** - Runs in seconds
- **Deterministic** - Same input produces identical output

## Arguments

| Argument | Description |
|:---------|:------------|
| `[server-command]` | Command to start the MCP server (optional if set in config) |
| `[args...]` | Arguments to pass to the server command |

## Options

| Option | Description | Default |
|:-------|:------------|:--------|
| `-c, --config <path>` | Path to config file | `bellwether.yaml` |
| `--fail-on-drift` | Exit with error if drift detected (overrides config) | From config |
| `--accept-drift` | Accept detected drift as intentional and update baseline | `false` |
| `--accept-reason <reason>` | Reason for accepting drift (used with `--accept-drift`) | - |

:::tip Config-First Design
Baseline paths are configured in `bellwether.yaml` under `baseline.comparePath` and `baseline.savePath`. The `--fail-on-drift` flag is the only CLI override, useful for CI pipelines.
:::

## Examples

### Basic Check

```bash
# Check with server command
bellwether check npx @modelcontextprotocol/server-filesystem /tmp

# Or use server command from config
bellwether check
```

### Drift Detection with Config

Configure baseline comparison in `bellwether.yaml`:

```yaml
baseline:
  comparePath: "./bellwether-baseline.json"  # Compare against this baseline
  savePath: "./bellwether-baseline.json"     # Auto-save after check
  failOnDrift: true                          # Fail if drift detected
```

Then run:

```bash
bellwether check
```

### CI/CD Pipeline

```bash
# Quick drift check in CI (--fail-on-drift overrides config)
bellwether check --fail-on-drift
```

### Save Baseline Separately

Use the baseline command to save baselines:

```bash
bellwether check
bellwether baseline save
```

### Accept Drift During Check

When you intentionally change your server, you can accept drift as part of the check:

```bash
# Accept drift in one command
bellwether check --accept-drift --accept-reason "Added new delete_file tool"
```

This updates the baseline and records acceptance metadata (who, when, why) for audit trail.

:::note
The `--accepted-by` option is only available in `bellwether baseline accept`. When using `--accept-drift` with the check command, the acceptor is recorded automatically from your system username.
:::

## Output Files

| File | Description |
|:-----|:------------|
| `CONTRACT.md` | Structural documentation of tool schemas |
| `bellwether-check.json` | Machine-readable validation results |

### CONTRACT.md Contents

The generated documentation includes:
- **Server Information**: Name, version, protocol version
- **Tool Reference**: Names, descriptions, parameters
- **Schema Details**: Parameter types, required/optional
- **Custom Scenario Results**: If bellwether-tests.yaml exists

## Configuration

Check mode uses settings from `bellwether.yaml`. Key sections:

```yaml
server:
  command: "npx @mcp/your-server"
  args: ["/data"]
  timeout: 30000

output:
  dir: "."

baseline:
  comparePath: "./bellwether-baseline.json"  # Compare against this baseline
  savePath: "./bellwether-baseline.json"     # Auto-save after check
  failOnDrift: false

scenarios:
  path: "./bellwether-tests.yaml"  # Custom test scenarios
  only: false
```

## Custom Scenarios

Check mode supports custom YAML test scenarios for deterministic testing:

```yaml
# bellwether-tests.yaml
tools:
  - tool: read_file
    description: "File reading works"
    input:
      path: "/tmp/test.txt"
    assertions:
      - type: contains
        value: "expected content"
```

See [Custom Scenarios](/guides/custom-scenarios) for full documentation.

## Exit Codes

| Code | Meaning |
|:-----|:--------|
| `0` | Success - check completed, no drift |
| `1` | Drift detected or check failed |

## Environment Variables

| Variable | Description |
|:---------|:------------|
| `BELLWETHER_SESSION` | Cloud session token for CI/CD |
| `BELLWETHER_API_URL` | Cloud API URL |

## See Also

- [explore](/cli/explore) - LLM-powered behavioral exploration
- [init](/cli/init) - Create configuration file
- [baseline](/cli/baseline) - Manage baselines
- [watch](/cli/watch) - Watch mode for continuous checking
- [CI/CD Integration](/guides/ci-cd) - Pipeline integration
- [Custom Scenarios](/guides/custom-scenarios) - YAML-defined test cases

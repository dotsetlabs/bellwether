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
bellwether check --parallel --parallel-workers 4
bellwether check --format junit
bellwether check --incremental
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

### Core Options

| Option | Description | Default |
|:-------|:------------|:--------|
| `-c, --config <path>` | Path to config file | `bellwether.yaml` |
| `--fail-on-drift` | Exit with error if drift detected (overrides config) | From config |
| `--accept-drift` | Accept detected drift as intentional and update baseline | `false` |
| `--accept-reason <reason>` | Reason for accepting drift (used with `--accept-drift`) | - |

### Output Options

| Option | Description | Default |
|:-------|:------------|:--------|
| `--format <format>` | Output format: `text`, `json`, `compact`, `github`, `markdown`, `junit`, `sarif` | `text` |

### Performance Options

| Option | Description | Default |
|:-------|:------------|:--------|
| `--parallel` | Enable parallel tool testing (faster checks) | From config |
| `--parallel-workers <n>` | Number of concurrent tool workers (1-10) | `4` |
| `--incremental` | Only test tools with changed schemas (requires baseline) | From config |
| `--incremental-cache-hours <hours>` | Max age of cached results in hours | `168` |
| `--performance-threshold <n>` | Performance regression threshold percentage | `10` |

### Severity Options

| Option | Description | Default |
|:-------|:------------|:--------|
| `--min-severity <level>` | Minimum severity to report: `none`, `info`, `warning`, `breaking` | From config |
| `--fail-on-severity <level>` | Fail threshold: `none`, `info`, `warning`, `breaking` | `breaking` |

:::tip Config-First Design
All options can be configured in `bellwether.yaml` under the `check:` and `baseline.severity:` sections. CLI flags serve as overrides for CI/CD use cases.
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

# Fast parallel check with JUnit output
bellwether check --parallel --format junit > results.xml

# Incremental check (only test changed tools)
bellwether check --incremental --fail-on-drift

# Fail on any warning or breaking change
bellwether check --fail-on-severity warning
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
- **Quick Reference Table**: Tool names with parameters, success rates, descriptions
- **Performance Baseline**: P50/P95 latency metrics and success rates per tool
- **Tool Reference**: Names, descriptions, parameters with full schema
- **Example Usage**: Up to 2 successful interaction examples per tool
- **Error Patterns**: Categorized errors (Permission, NotFound, Validation, Timeout, Network)
- **Error Summary**: Aggregate error patterns across all tools
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

  # Severity thresholds for CI
  severity:
    minimumSeverity: none        # Filter: none, info, warning, breaking
    failOnSeverity: breaking     # CI fail threshold
    suppressWarnings: false      # Hide warning-level changes
    # aspectOverrides:           # Custom severity per aspect type
    #   description: none        # Ignore description-only changes

# Check command settings
check:
  incremental: false             # Only test changed tools
  incrementalCacheHours: 168     # Cache age (1 week)
  parallel: false                # Parallel tool testing
  parallelWorkers: 4             # Concurrent workers (1-10)
  performanceThreshold: 10       # Regression threshold (%)

scenarios:
  path: "./bellwether-tests.yaml"  # Custom test scenarios
  only: false
```

## Output Formats

The `--format` option supports multiple output formats for CI integration:

| Format | Description | Use Case |
|:-------|:------------|:---------|
| `text` | Human-readable colored output | Terminal, local dev |
| `json` | Machine-readable JSON | Scripting, automation |
| `compact` | Single-line summary | Log aggregation |
| `github` | GitHub Actions annotations | GitHub CI |
| `markdown` | Markdown-formatted report | PR comments |
| `junit` | JUnit XML format | Jenkins, GitLab CI, CircleCI |
| `sarif` | SARIF 2.1.0 format | GitHub Code Scanning |

### JUnit Output

```bash
bellwether check --format junit > bellwether-results.xml
```

Generates standard JUnit XML that CI systems can parse for test reporting.

### SARIF Output

```bash
bellwether check --format sarif > bellwether-results.sarif
```

Generates [SARIF](https://sarifweb.azurewebsites.net/) format for GitHub Code Scanning and other static analysis tools.

## Parallel Testing

Speed up checks by testing tools concurrently:

```bash
bellwether check --parallel --parallel-workers 4
```

Or configure in `bellwether.yaml`:

```yaml
check:
  parallel: true
  parallelWorkers: 4  # 1-10 concurrent workers
```

:::note
Parallel testing uses a mutex to serialize MCP client calls, ensuring stable results while maximizing throughput.
:::

## Incremental Checking

Only test tools with changed schemas, using cached results for unchanged tools:

```bash
bellwether check --incremental
```

Or configure in `bellwether.yaml`:

```yaml
check:
  incremental: true
  incrementalCacheHours: 168  # Cache valid for 1 week
```

Incremental checking:
- Compares current tool schemas against the baseline
- Only tests tools with changed schemas or new tools
- Reuses cached fingerprints for unchanged tools
- Significantly faster for large servers with many tools

:::tip
Incremental checking requires an existing baseline (`baseline.comparePath`). On first run, all tools are tested.
:::

## Performance Regression Detection

Bellwether tracks tool latency and flags performance regressions:

```bash
bellwether check --performance-threshold 15
```

Or configure in `bellwether.yaml`:

```yaml
check:
  performanceThreshold: 10  # Flag if P50 latency increases by >10%
```

When comparing baselines, performance regressions are reported:

```
--- Performance Regressions ---
  read_file: p50 45ms → 78ms (+73%)
  write_file: p50 120ms → 145ms (+21%)
```

Performance metrics captured:
- **P50 latency** - Median response time
- **P95 latency** - 95th percentile response time
- **Success rate** - Percentage of successful calls

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

Bellwether uses granular exit codes for CI/CD integration:

| Code | Meaning | CI Behavior |
|:-----|:--------|:------------|
| `0` | No changes detected | Pass |
| `1` | Info-level changes (non-breaking) | Pass by default |
| `2` | Warning-level changes | Fail with `--fail-on-drift` |
| `3` | Breaking changes detected | Always fail |
| `4` | Runtime error (connection, config) | Fail |

### Using Exit Codes in CI

```bash
bellwether check npx @mcp/server
case $? in
  0) echo "No drift detected" ;;
  1) echo "Info-level changes (non-breaking additions)" ;;
  2) echo "Warning-level changes (review recommended)" ;;
  3) echo "Breaking changes detected!" && exit 1 ;;
  4) echo "Error: check failed" && exit 1 ;;
esac
```

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

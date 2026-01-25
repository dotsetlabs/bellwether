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
bellwether check --format junit
bellwether check --accept-drift --accept-reason "Added new feature"
```

## Description

The `check` command is the core of Bellwether. It connects to an MCP server, discovers its tools, validates schemas, and generates CONTRACT.md documentation—all without requiring an LLM.

This is the recommended command for CI/CD pipelines because it's:
- **Free** - No API keys or LLM costs
- **Fast** - Runs in seconds
- **Deterministic** - Same input produces identical output

:::note Config Required
All CLI commands (except `init`) require a config file. Run `bellwether init` once before using `check`.
:::

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
| `--format <format>` | Output format: `text`, `json`, `compact`, `github`, `markdown`, `junit`, `sarif` | `check.diffFormat` |

### Severity Options

| Option | Description | Default |
|:-------|:------------|:--------|
| `--min-severity <level>` | Minimum severity to report (overrides config): `none`, `info`, `warning`, `breaking` | From config |
| `--fail-on-severity <level>` | Fail threshold (overrides config): `none`, `info`, `warning`, `breaking` | `breaking` |

:::tip Config-First Design
Bellwether uses a **config-first** approach. All settings—including parallel testing, security testing, sampling, and output options—are configured in `bellwether.yaml`. CLI flags are minimal and primarily used for one-time overrides in CI/CD pipelines.

Run `bellwether init` to generate a comprehensive, well-documented configuration file.
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

# JUnit output for CI reporting (parallel testing is config default)
bellwether check --format junit > results.xml

# Fail on any warning or breaking change
bellwether check --fail-on-severity warning
```

Configure parallel testing, incremental checking, and security testing in `bellwether.yaml`:

```yaml
# bellwether.yaml (CI preset example)
check:
  parallel: true
  parallelWorkers: 4
  incremental: true
  security:
    enabled: true
baseline:
  failOnDrift: true
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
The `--accepted-by` option is only available in `bellwether baseline accept`. The `--accept-drift` flag records the reason, but does not set an acceptor by default.
:::

## Output Files

| File | Description |
|:-----|:------------|
| `CONTRACT.md` | Structural documentation of tool schemas (configurable via `output.files.contractDoc`) |
| `bellwether-check.json` | Machine-readable validation results (configurable via `output.files.checkReport`) |

Output locations are controlled by `output.dir` (JSON) and `output.docsDir` (docs).

### CONTRACT.md Contents

The generated documentation includes:
- **Server Information**: Name, version, protocol version
- **Quick Reference Table**: Tool names with parameters, success rates, descriptions
- **Performance Baseline**: P50/P95 latency metrics, success rates, confidence levels
- **Tool Reference**: Names, descriptions, parameters with full schema
- **Example Usage**: Up to 2 successful interaction examples per tool
- **Error Patterns**: Categorized errors with root cause and remediation suggestions
- **Error Summary**: Aggregate error patterns across all tools
- **Security Baseline**: Security findings and risk scores (when `check.security.enabled` is true)
- **Documentation Quality**: Score breakdown and improvement suggestions
- **Custom Scenario Results**: If bellwether-tests.yaml exists

## Configuration

Check mode uses settings from `bellwether.yaml`. Run `bellwether init` to generate a comprehensive configuration file with all options documented.

### Key Configuration Sections

```yaml
server:
  command: "npx @mcp/your-server"
  args: ["/data"]
  timeout: 30000

output:
  dir: ".bellwether"      # JSON output directory
  docsDir: "."            # Documentation output (CONTRACT.md)
  format: both            # agents.md, json, or both

  # Example output settings for documentation
  examples:
    full: true            # Include full (non-truncated) examples
    maxLength: 5000       # Maximum example length (100-50000)
    maxPerTool: 5         # Maximum examples per tool (1-20)

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
  parallel: true                 # Parallel tool testing (recommended)
  parallelWorkers: 4             # Concurrent workers (1-10)
  performanceThreshold: 10       # Regression threshold (%)

  # Security testing settings
  security:
    enabled: false               # Enable security vulnerability testing
    categories:                  # Categories to test
      - sql_injection
      - xss
      - path_traversal
      - command_injection
      - ssrf
      - error_disclosure

  # Statistical sampling settings
  sampling:
    minSamples: 10               # Minimum samples per tool (1-50)
    targetConfidence: low        # low, medium, or high
    failOnLowConfidence: false   # Fail if confidence below target

# Workflow testing
workflows:
  autoGenerate: false            # Auto-generate from tool patterns
  stepTimeout: 5000              # Timeout per step in ms

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

Speed up checks by testing tools concurrently. Configure in `bellwether.yaml`:

```yaml
check:
  parallel: true          # Enabled by default
  parallelWorkers: 4      # 1-10 concurrent workers
```

:::note
Parallel testing uses a mutex to serialize MCP client calls, ensuring stable results while maximizing throughput.
:::

## Incremental Checking

Only test tools with changed schemas, using cached results for unchanged tools. Configure in `bellwether.yaml`:

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

Bellwether tracks tool latency and flags performance regressions. Configure the threshold in `bellwether.yaml`:

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

### Performance Confidence

Bellwether calculates statistical confidence for performance metrics:

```
─── Confidence Changes ───
  ↑ read_file: low → high (more samples collected)
  ↓ write_file: high → medium (increased variability)
```

Confidence levels:
- **High** - 10+ samples, low variability (CV < 0.3)
- **Medium** - 5+ samples or moderate variability
- **Low** - Few samples or high variability

Tools with low confidence are flagged in reports:

```
Note: Some tools have low confidence metrics.
Run with more samples for reliable baselines: write_file, delete_file
```

## Security Testing

Enable security testing to detect vulnerabilities. Configure in `bellwether.yaml`:

```yaml
check:
  security:
    enabled: true
    categories:
      - sql_injection
      - xss
      - path_traversal
      - command_injection
      - ssrf
      - error_disclosure
```

Security testing probes for:
- **SQL Injection** - `' OR 1=1 --`, `; DROP TABLE`
- **Path Traversal** - `../../../etc/passwd`
- **Command Injection** - `; rm -rf /`, `$(whoami)`
- **XSS** - `<script>alert(1)</script>`
- **SSRF** - `http://169.254.169.254/`

When security issues are found:

```
─── Security Findings ───
  Tool: execute_query
  Category: sql_injection
  Risk Level: critical
  Finding: Tool accepted SQL injection payload without sanitization
```

Security findings are stored in the baseline and compared across runs to detect security regressions.

## Documentation Quality

Bellwether scores documentation quality for all tools:

```
─── Documentation Quality ───
  📊 Score: 85/100 (B)
  Grade: B → A
  ✓ Issues fixed: 3
```

Documentation is scored on:
- **Description Coverage** (30%) - Tools with descriptions
- **Description Quality** (30%) - Length, clarity, examples
- **Parameter Documentation** (25%) - Parameters with descriptions
- **Example Coverage** (15%) - Tools with usage examples

Grades: A (90+), B (80+), C (70+), D (60+), F (below 60)

## Error Analysis

Bellwether performs enhanced error analysis with root cause inference:

```
─── Error Analysis ───
  Tool: read_file
  Category: NotFound (404)
  Root Cause: File does not exist at specified path
  Remediation: Verify the file path exists before calling read_file
  Related Parameters: path
```

Error patterns are tracked across runs to detect changes in error behavior.

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
| `1` | Info-level changes (non-breaking) | Exit code `1` (handle in CI as desired) |
| `2` | Warning-level changes | Exit code `2` (handle in CI as desired) |
| `3` | Breaking changes detected | Always fail |
| `4` | Runtime error (connection, config) | Fail |
| `5` | Low confidence metrics (when `check.sampling.failOnLowConfidence` is true) | Fail |

### Using Exit Codes in CI

```bash
bellwether check npx @mcp/server
case $? in
  0) echo "No drift detected" ;;
  1) echo "Info-level changes (non-breaking additions)" ;;
  2) echo "Warning-level changes (review recommended)" ;;
  3) echo "Breaking changes detected!" && exit 1 ;;
  4) echo "Error: check failed" && exit 1 ;;
  5) echo "Low confidence metrics" && exit 1 ;;
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

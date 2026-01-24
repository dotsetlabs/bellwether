# Bellwether GitHub Action

> **Catch MCP server drift before your users do. Zero LLM required.**

Structural drift detection for MCP servers in CI/CD. Free. Deterministic. Fast.

## Features

- **Structural Drift Detection** - Catch tool additions, removals, schema changes
- **Performance Regression Detection** - Flag tools with increased latency, with confidence scoring
- **Security Testing** - Detect SQL injection, path traversal, command injection, XSS, SSRF
- **Documentation Quality** - Score and grade tool documentation quality (A-F)
- **Error Pattern Analysis** - Track error trends with root cause analysis
- **Zero LLM Required** - No API keys, no token costs
- **Deterministic** - Same input = same output
- **CI/CD Gating** - Block deployments when behavior drifts unexpectedly
- **Granular Exit Codes** - Semantic exit codes (0-5) for precise CI control
- **JUnit/SARIF Output** - Integration with test reporters and code scanning
- **Parallel Testing** - Faster checks for servers with many tools
- **Incremental Checking** - Only test tools with changed schemas
- **Config-Driven** - Uses `bellwether.yaml` for all settings
- **Cloud Integration** - Optional upload to Bellwether Cloud for history tracking

## Breaking Changes

The action no longer accepts per-run tuning inputs like `fail-on-drift`, `parallel`, `parallel-workers`, `incremental`, `incremental-cache-hours`, `performance-threshold`, or `security`. Configure these in `bellwether.yaml` instead.

## Quick Start

```yaml
name: MCP Drift Detection
on: [pull_request]

jobs:
  bellwether:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Detect Drift
        uses: dotsetlabs/bellwether@v1
        with:
          server-command: 'npx @mcp/your-server'
```

No secrets needed. Free. Runs in seconds. The action will create `bellwether.yaml` with `--preset ci` if it does not exist.

## Usage

### Basic Drift Detection

```yaml
- name: Detect Drift
  uses: dotsetlabs/bellwether@v1
  with:
    server-command: 'npx @mcp/your-server'
    baseline-path: './bellwether-baseline.json'
    fail-on-severity: 'warning'
```

### Save Baseline

```yaml
- name: Save Baseline
  uses: dotsetlabs/bellwether@v1
  with:
    server-command: 'npx @mcp/your-server'
    save-baseline: 'true'

- name: Commit Baseline
  uses: stefanzweifel/git-auto-commit-action@v5
  with:
    commit_message: 'Update MCP baseline'
    file_pattern: 'bellwether-baseline.json'
```

### With Custom Config

```yaml
- name: Run with Custom Config
  uses: dotsetlabs/bellwether@v1
  with:
    server-command: 'npx @mcp/your-server'
    config-path: './configs/ci.yaml'
```

### With Cloud Upload

Upload baselines to Bellwether Cloud for history tracking and team visibility:

```yaml
- name: Test and Upload
  uses: dotsetlabs/bellwether@v1
  with:
    server-command: 'npx @mcp/your-server'
    save-baseline: 'true'
  env:
    BELLWETHER_SESSION: ${{ secrets.BELLWETHER_SESSION }}

- name: Upload to Cloud
  if: success()
  run: npx @dotsetlabs/bellwether upload --ci
  env:
    BELLWETHER_SESSION: ${{ secrets.BELLWETHER_SESSION }}
```


### With JUnit Output

Generate JUnit XML for test reporting:

```yaml
- name: Run Check with JUnit
  uses: dotsetlabs/bellwether@v1
  with:
    server-command: 'npx @mcp/your-server'
    format: 'junit'

- name: Publish Test Results
  uses: mikepenz/action-junit-report@v4
  with:
    report_paths: 'bellwether-junit.xml'
```

### With SARIF for Code Scanning

Generate SARIF for GitHub Code Scanning:

```yaml
- name: Run Check with SARIF
  uses: dotsetlabs/bellwether@v1
  with:
    server-command: 'npx @mcp/your-server'
    format: 'sarif'

- name: Upload SARIF
  uses: github/codeql-action/upload-sarif@v3
  with:
    sarif_file: bellwether.sarif
```

### Configure Check Behavior

Parallelism, incremental checking, performance thresholds, and security testing are configured in `bellwether.yaml` under the `check` section. The action reads your config directly.

### With Server Environment Variables

If your MCP server needs environment variables, use interpolation in your config:

```yaml
# bellwether.yaml
server:
  command: "npx @mcp/your-server"
  env:
    API_KEY: "${API_KEY}"
    DATABASE_URL: "${DATABASE_URL}"
```

```yaml
- name: Test with Secrets
  uses: dotsetlabs/bellwether@v1
  with:
    server-command: 'npx @mcp/your-server'
  env:
    API_KEY: ${{ secrets.API_KEY }}
    DATABASE_URL: ${{ secrets.DATABASE_URL }}
```

## Inputs

### Core Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `server-command` | Command to start the MCP server | Yes | - |
| `server-args` | Arguments to pass to the server | No | `''` |
| `config-path` | Path to bellwether.yaml config file | No | `bellwether.yaml` |
| `baseline-path` | Path to baseline file for drift comparison | No | `bellwether-baseline.json` |
| `save-baseline` | Save baseline after test | No | `false` |
| `output-dir` | Directory for output files (should match config output.dir/docsDir) | No | `.` |

### Advanced Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `format` | Output format: `text`, `json`, `compact`, `github`, `markdown`, `junit`, `sarif` | No | `github` |
| `fail-on-severity` | Failure threshold: `info`, `warning`, `breaking` | No | `breaking` |
| `min-severity` | Minimum severity to report | No | `info` |
| `upload-sarif` | Upload SARIF results to GitHub Code Scanning | No | `true` |
| `accept-drift` | Accept detected drift as intentional and update baseline | No | `false` |
| `accept-reason` | Reason for accepting drift (used with accept-drift) | No | `''` |

## Outputs

| Output | Description |
|--------|-------------|
| `result` | Check result: `passed` or `failed` |
| `exit-code` | Exit code (0=clean, 1=info, 2=warning, 3=breaking, 4=error, 5=low-confidence) |
| `severity` | Highest change severity: `none`, `info`, `warning`, `breaking`, `low_confidence` |
| `drift-detected` | Whether drift was detected (`true`/`false`) |
| `tool-count` | Number of tools discovered |
| `breaking-count` | Number of breaking changes |
| `warning-count` | Number of warning changes |
| `info-count` | Number of info changes |
| `doc-score` | Documentation quality score (0-100) |
| `doc-grade` | Documentation quality grade (A-F) |
| `security-findings` | Number of security findings (when security testing is enabled in config) |
| `contract-md` | Path to generated CONTRACT.md file |
| `baseline-file` | Path to baseline file |
| `sarif-file` | Path to SARIF file (when format includes sarif) |
| `junit-file` | Path to JUnit XML file (when format is junit) |

## Artifacts

The action automatically uploads:
- `bellwether-docs`: The generated CONTRACT.md file
- `bellwether-baseline`: The baseline file (if saved)
- `bellwether-report`: The JSON report (`bellwether-check.json`)

Artifact paths are resolved from your config (`output.dir`, `output.docsDir`, and `output.files.*`).

## Configuration

All settings are configured in `bellwether.yaml`. If no config file exists, the action automatically creates one with `--preset ci` (optimized for CI). If you set a custom `config-path`, the action will generate the config and move it to that path.

The action reads `output.dir`, `output.docsDir`, and `output.files.*` from your config to locate artifacts. Keep those in sync with your expectations.

Example output customization:

```yaml
output:
  dir: "out"
  docsDir: "docs"
  files:
    contractDoc: "MCP_CONTRACT.md"
    checkReport: "mcp-check.json"
```

If your server depends on external services (e.g., Plaid, Stripe), set the required environment variables in the workflow so those tools are tested instead of skipped.

### Create Config Locally

```bash
# CI-optimized (fast, free)
bellwether init --preset ci npx @mcp/your-server

# Commit the config
git add bellwether.yaml
git commit -m "Add Bellwether config"
```

### Example Config

```yaml
# bellwether.yaml
server:
  command: "npx @mcp/your-server"
  timeout: 30000
  env:
    # Use interpolation for secrets
    API_KEY: "${API_KEY}"

output:
  dir: "."

baseline:
  failOnDrift: true
  severity:
    failOnSeverity: breaking  # or "warning" for stricter checks

check:
  parallel: true              # Faster checks
  parallelWorkers: 4          # Concurrent tool tests
  performanceThreshold: 10    # Flag >10% latency regression
  security:
    enabled: true             # Enable security testing
```

## Complete Workflow Example

```yaml
name: MCP Server CI
on:
  push:
    branches: [main]
  pull_request:

jobs:
  bellwether:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Check MCP Server
        id: bellwether
        uses: dotsetlabs/bellwether@v1
        with:
          server-command: 'npx @mcp/your-server'
          fail-on-severity: 'warning'

      - name: Upload to Cloud (main only)
        if: github.ref == 'refs/heads/main' && success()
        run: |
          npx @dotsetlabs/bellwether upload --ci
        env:
          BELLWETHER_SESSION: ${{ secrets.BELLWETHER_SESSION }}

      - name: Comment on PR
        if: github.event_name == 'pull_request' && steps.bellwether.outputs.drift-detected == 'true'
        uses: actions/github-script@v7
        with:
          script: |
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: '⚠️ MCP schema drift detected. Review CONTRACT.md for details.'
            })
```

## Exit Codes

Bellwether uses granular exit codes for semantic CI control:

| Code | Meaning | CI Behavior |
|------|---------|-------------|
| `0` | Clean - no changes detected | Pass |
| `1` | Info - non-breaking changes (new tools, optional params) | Fail when `fail-on-severity` is `info` |
| `2` | Warning - behavioral changes to investigate | Fail when `fail-on-severity` is `warning` |
| `3` | Breaking - critical changes (tool removed, type changed) | Fail when `fail-on-severity` is `breaking` (default) |
| `4` | Error - runtime error (connection, config) | Fail |
| `5` | Low confidence metrics (when `check.sampling.failOnLowConfidence` is true) | Fail |

### Configurable Failure Threshold

Use the `fail-on-severity` input to control when the action fails:

```yaml
- uses: dotsetlabs/bellwether@v1
  with:
    server-command: 'npx @mcp/your-server'
    fail-on-severity: 'warning'  # Fail on warning or breaking
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `BELLWETHER_SESSION` | Cloud session token for uploads |
| `BELLWETHER_API_URL` | Cloud API URL override (for self-hosted or staging) |
| `BELLWETHER_TEAM_ID` | Override active team for cloud operations |

## Migration from v0.x

If you were using the old flag-based inputs:

**Before:**
```yaml
- uses: dotsetlabs/bellwether/action@v1
  with:
    server-command: 'npx @mcp/server'
    preset: 'ci'
    max-questions: '3'
    personas: 'technical_writer'
    contract-only: 'true'
```

**After:**
```yaml
- uses: dotsetlabs/bellwether@v1
  with:
    server-command: 'npx @mcp/server'
```

All settings now come from `bellwether.yaml`. The action auto-creates one if missing.

## Security

- Never commit API keys to your repository
- Use GitHub Secrets to store sensitive values
- No LLM API keys are needed for check (the default)
- Use environment variable interpolation in `bellwether.yaml` for server secrets

## Troubleshooting

### Config Not Found

If you see "Config not found, creating with --preset ci", ensure your `bellwether.yaml` is committed or the action will auto-generate one.

### Server Startup Timeout

Increase the timeout in your config:

```yaml
server:
  command: "npx @mcp/your-server"
  timeout: 60000  # 60 seconds
```

### Drift on Every Run

Ensure your server produces deterministic output. Non-deterministic tools (e.g., timestamps, random IDs) will cause constant drift.

## License

MIT License - see [LICENSE](../LICENSE) for details.

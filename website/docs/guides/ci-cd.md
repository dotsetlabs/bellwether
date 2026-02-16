---
title: CI/CD Integration
sidebar_position: 1
---

# CI/CD Integration

Integrate Bellwether into your CI/CD pipeline for automated behavioral testing of MCP servers.

## Quick Start

The simplest CI/CD setup uses check mode (free, fast, deterministic):

```yaml
# .github/workflows/bellwether.yml
name: MCP Drift Detection
on: [pull_request]

jobs:
  bellwether:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npx @dotsetlabs/bellwether init --preset ci npx @mcp/your-server
      - run: npx @dotsetlabs/bellwether check --fail-on-drift
```

Commit `bellwether.yaml` to your repo so CI always has your configuration. No API keys required. Free. Runs in seconds.

## Setup

### 1. Create Configuration

First, initialize a CI-optimized configuration:

```bash
bellwether init --preset ci
```

This creates `bellwether.yaml` with:
- Check mode (free, deterministic)
- JSON reports written to `output.dir`
- Fail on drift enabled

### 2. Create Initial Baseline

Run the test and save a baseline:

```bash
bellwether check npx @mcp/your-server
bellwether baseline save
```

### 3. Commit Both Files

```bash
git add bellwether.yaml bellwether-baseline.json
git commit -m "Add Bellwether configuration and baseline"
```

---

## GitHub Actions

### Basic Drift Detection

```yaml
name: MCP Drift Detection
on: [pull_request]

jobs:
  bellwether:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run Bellwether Check
        run: npx @dotsetlabs/bellwether check --fail-on-drift
```

Ensure `bellwether.yaml` is committed. Configure your server command and baseline paths in `bellwether.yaml`:

```yaml
server:
  command: "npx @mcp/your-server"

baseline:
  comparePath: "./bellwether-baseline.json"
  failOnDrift: true
```

### Using GitHub Action

For a streamlined experience, use the official GitHub Action:

```yaml
- name: Detect Behavioral Drift
  uses: dotsetlabs/bellwether@v2.1.2
  with:
    version: '2.1.2'
    server-command: 'npx @mcp/your-server'
    baseline-path: './bellwether-baseline.json'
    fail-on-severity: 'warning'
```

The action auto-creates `bellwether.yaml` with `--preset ci` if not found.

#### Action Inputs

| Input | Description | Default |
|:------|:------------|:--------|
| `version` | Bellwether npm version to install (pin for reproducibility) | action ref (semver only) |
| `server-command` | MCP server command (required) | - |
| `server-args` | Arguments to pass to the server | `''` |
| `config-path` | Path to bellwether.yaml | `bellwether.yaml` |
| `baseline-path` | Path to baseline file | `bellwether-baseline.json` |
| `save-baseline` | Save baseline after check | `false` |
| `output-dir` | Directory for output files | `.` |
| `format` | Output format: `text`, `json`, `compact`, `github`, `markdown`, `junit`, `sarif` | `github` |
| `min-severity` | Minimum severity to report: `none`, `info`, `warning`, `breaking` | `info` |
| `fail-on-severity` | Failure threshold: `none`, `info`, `warning`, `breaking` | `breaking` |
| `accept-drift` | Accept detected drift and update baseline | `false` |
| `accept-reason` | Reason for accepting drift | `''` |
| `upload-sarif` | Upload SARIF to GitHub Code Scanning | `true` |

#### Action Outputs

| Output | Description |
|:-------|:------------|
| `result` | `passed` or `failed` |
| `exit-code` | Semantic exit code (0-5) |
| `severity` | Highest severity: `none`, `info`, `warning`, `breaking`, `low_confidence` |
| `drift-detected` | `true` or `false` |
| `tool-count` | Number of tools discovered |
| `breaking-count` | Number of breaking changes |
| `warning-count` | Number of warning changes |
| `info-count` | Number of info changes |
| `doc-score` | Documentation quality score (0-100) |
| `doc-grade` | Documentation quality grade (A-F) |
| `security-findings` | Number of security findings |
| `contract-md` | Path to CONTRACT.md |
| `baseline-file` | Path to baseline file |
| `sarif-file` | Path to SARIF file |
| `junit-file` | Path to JUnit XML file |

#### Artifacts

The action automatically uploads:
- `bellwether-docs` - The generated CONTRACT.md
- `bellwether-baseline` - The baseline file (if saved)
- `bellwether-report` - The JSON report

#### Save Baseline with Action

```yaml
- name: Check and Save Baseline
  uses: dotsetlabs/bellwether@v2.1.2
  with:
    version: '2.1.2'
    server-command: 'npx @mcp/your-server'
    save-baseline: 'true'

- name: Commit Baseline
  uses: stefanzweifel/git-auto-commit-action@v5
  with:
    commit_message: 'Update MCP baseline'
    file_pattern: 'bellwether-baseline.json'
```

#### Action with Server Environment Variables

If your MCP server needs secrets, use interpolation in your config:

```yaml
# bellwether.yaml
server:
  command: "npx @mcp/your-server"
  env:
    API_KEY: "${API_KEY}"
```

```yaml
# workflow
- name: Test with Secrets
  uses: dotsetlabs/bellwether@v2.1.2
  with:
    version: '2.1.2'
    server-command: 'npx @mcp/your-server'
  env:
    API_KEY: ${{ secrets.API_KEY }}
```

### Explore Mode with LLM (Documentation Only)

For generating comprehensive documentation with LLM-powered analysis:

```yaml
jobs:
  bellwether:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run Explore Mode
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
        run: |
          npx @dotsetlabs/bellwether explore npx @mcp/your-server
```

:::note
Explore mode generates `AGENTS.md` documentation but **cannot be used for drift detection or baselines**. For CI/CD drift detection, use `bellwether check`.
:::

---

## GitLab CI

```yaml
bellwether:
  image: node:20
  script:
    - npx @dotsetlabs/bellwether check --fail-on-drift
```

---

## Workflow Patterns

### PR Checks (Check Mode)

Fast, free checks on every pull request:

```yaml
name: PR Check
on: pull_request

jobs:
  bellwether:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npx @dotsetlabs/bellwether check --fail-on-drift
```

### Nightly Explore Mode Documentation

Generate comprehensive documentation with LLM analysis:

```yaml
name: Nightly Documentation
on:
  schedule:
    - cron: '0 0 * * *'

jobs:
  bellwether:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      # Generate documentation with explore mode
      - run: npx @dotsetlabs/bellwether explore
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}

      # Drift detection still uses check mode
      - run: npx @dotsetlabs/bellwether check --fail-on-drift
```

### Update Baseline on Release

```yaml
name: Update Baseline
on:
  release:
    types: [published]

jobs:
  update:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Generate New Baseline
        run: |
          npx @dotsetlabs/bellwether check
          npx @dotsetlabs/bellwether baseline save --force

      - name: Commit Baseline
        run: |
          git config user.name "GitHub Actions"
          git config user.email "actions@github.com"
          git add bellwether-baseline.json
          git commit -m "Update baseline for ${{ github.event.release.tag_name }}"
          git push
```

---

## Configuration for CI

### Recommended `bellwether.yaml` for CI

```yaml
# bellwether.yaml
server:
  command: "npx @mcp/your-server"
  timeout: 30000

output:
  dir: "."

baseline:
  comparePath: "./bellwether-baseline.json"
  failOnDrift: true
  severity:
    failOnSeverity: breaking  # or "warning" for stricter checks

check:
  parallel: true              # Faster checks
  parallelWorkers: 4          # Concurrent tool tests
  performanceThreshold: 10    # Flag >10% latency regression
  security:
    enabled: false            # Enable security testing (optional)

logging:
  level: warn
```

### Multiple Configurations

Create different configs for different environments:

```bash
# CI config (committed)
bellwether init --preset ci
mv bellwether.yaml configs/ci.yaml

# Development config (local)
bellwether init --preset local
mv bellwether.yaml configs/dev.yaml
```

Use in CI:

```yaml
- run: npx @dotsetlabs/bellwether check --config ./configs/ci.yaml npx @mcp/your-server
```

---

## Exit Codes

Bellwether uses granular exit codes for semantic CI/CD integration:

| Code | Meaning | Action |
|:-----|:--------|:-------|
| `0` | No changes detected | Pipeline passes |
| `1` | Info-level changes (non-breaking) | Decide in CI (often treated as pass) |
| `2` | Warning-level changes | Decide in CI (often treated as failure) |
| `3` | Breaking changes detected | Pipeline always fails |
| `4` | Runtime error (connection, config) | Pipeline fails |
| `5` | Low confidence metrics (when `check.sampling.failOnLowConfidence` is true) | Pipeline fails |

### Handling Exit Codes

```bash
bellwether check npx @mcp/server
case $? in
  0) echo "Clean - no drift" ;;
  1) echo "Info changes only" ;;
  2) echo "Warnings detected" ;;
  3) echo "BREAKING CHANGES!" && exit 1 ;;
  4) echo "Error occurred" && exit 1 ;;
  5) echo "Low confidence metrics" && exit 1 ;;
esac
```

### Configurable Failure Threshold

```bash
# Fail on any drift (including info-level)
bellwether check --fail-on-severity info

# Fail only on breaking changes (ignore warnings)
bellwether check --fail-on-severity breaking
```

---

## Output Formats for CI

### JUnit XML (Jenkins, GitLab CI, CircleCI)

```yaml
- name: Run Check with JUnit Output
  run: npx @dotsetlabs/bellwether check --format junit > bellwether-results.xml

- name: Publish Test Results
  uses: mikepenz/action-junit-report@v4
  with:
    report_paths: 'bellwether-results.xml'
```

### SARIF (GitHub Code Scanning)

```yaml
- name: Run Check with SARIF Output
  run: npx @dotsetlabs/bellwether check --format sarif > bellwether.sarif

- name: Upload SARIF to GitHub
  uses: github/codeql-action/upload-sarif@v3
  with:
    sarif_file: bellwether.sarif
```

### Parallel Testing

Speed up checks for servers with many tools:

```yaml
- name: Fast Parallel Check
  run: npx @dotsetlabs/bellwether check --fail-on-drift
```

Configure parallelism in `bellwether.yaml`:

```yaml
check:
  parallel: true
  parallelWorkers: 4
```

### Incremental Checking

Only test tools with changed schemas (requires existing baseline):

```yaml
- name: Incremental Check
  run: npx @dotsetlabs/bellwether check --fail-on-drift
```

Configure incremental checking in `bellwether.yaml`:

```yaml
check:
  incremental: true
  incrementalCacheHours: 168
```

### Security Testing

Enable security vulnerability scanning:

```yaml
- name: Security Check
  run: npx @dotsetlabs/bellwether check --fail-on-drift
```

Configure security testing in `bellwether.yaml`:

```yaml
check:
  security:
    enabled: true
    categories: [sql_injection, xss, path_traversal, command_injection, ssrf, error_disclosure]
```

Security testing detects:
- SQL injection vulnerabilities
- Path traversal attacks
- Command injection
- XSS vulnerabilities
- SSRF attacks

Security findings are included in SARIF output for GitHub Code Scanning integration.

---

## Baseline Management

### Storing Baselines

Commit baselines to version control:

```bash
# Generate baseline
bellwether check
bellwether baseline save

# Commit
git add bellwether-baseline.json
git commit -m "Add behavioral baseline"
```

### Updating Baselines

When you intentionally change your server, you have three options:

#### Option 1: Accept Command (Recommended)

The `baseline accept` command records acceptance metadata for audit trail:

```bash
# Run check to detect drift
bellwether check

# Review the drift, then accept with a reason
bellwether baseline accept --reason "Added new delete_file tool"

# Commit
git add bellwether-baseline.json
git commit -m "Update baseline: added delete_file tool"
```

For breaking changes, use `--force`:

```bash
bellwether baseline accept --reason "Major API update" --force
```

#### Option 2: Accept During Check

Accept drift as part of the check command:

```bash
bellwether check --accept-drift --accept-reason "Improved error handling"
git add bellwether-baseline.json
git commit -m "Update baseline: improved error handling"
```

#### Option 3: Force Save (No Audit Trail)

For simple cases without acceptance metadata:

```bash
bellwether check
bellwether baseline save --force
git add bellwether-baseline.json
git commit -m "Update baseline for new feature X"
```

:::tip Audit Trail
`baseline accept` records when, why, and who accepted changes.  
`--accept-drift` records when and why only. Use `--accepted-by` with `baseline accept` if you need attribution.
:::

### Comparing Versions

```bash
# Compare two baselines
bellwether baseline diff ./baselines/v1.0.0.json ./baselines/v2.0.0.json
```

---

## Cost Comparison

| Mode | Cost | Speed | Use Case |
|:-----|:-----|:------|:---------|
| Check (default) | Free | Seconds | PR checks, CI gates |
| Explore with Ollama | Free | Minutes | Local dev |
| Explore with OpenAI | ~$0.01-0.10 | Minutes | Comprehensive documentation |

### Check Mode Benefits

- **Free** - No API costs
- **Fast** - Completes in seconds
- **Deterministic** - Same results every time
- **No secrets** - No API keys to manage

---

## Environment Variables

| Variable | Description | Required |
|:---------|:------------|:---------|
| `OPENAI_API_KEY` | OpenAI API key | For explore mode with OpenAI |
| `ANTHROPIC_API_KEY` | Anthropic API key | For explore mode with Anthropic |
| `OLLAMA_BASE_URL` | Ollama server URL | For explore mode with Ollama (default: http://localhost:11434) |

---

## Troubleshooting

### Exit Code 1 (Info Changes)

Non-breaking changes detected:
- New optional parameters added
- Description updates
- Usually safe to proceed

### Exit Code 2 (Warnings)

Warning-level changes detected:
- Check the diff output for what changed
- May indicate behavioral changes
- Review before deploying

### Exit Code 3 (Breaking Changes)

Breaking changes detected:
- Tool removed
- Required parameter added
- Type changed
- Update baseline only after careful review

### Exit Code 4 (Error)

Configuration or connection error:
- Verify `bellwether.yaml` exists
- Check server command is correct
- Verify network connectivity

### Timeout Errors

Increase timeout in config:

```yaml
server:
  timeout: 120000  # 2 minutes
```

### Debug Mode

Enable debug logging in `bellwether.yaml`:

```yaml
logging:
  level: debug
  verbose: true
```

Then capture output in CI:

```yaml
- run: npx @dotsetlabs/bellwether check 2>&1 | tee bellwether.log

- uses: actions/upload-artifact@v4
  if: failure()
  with:
    name: debug-logs
    path: bellwether.log
```

---

## See Also

- [check](/cli/check) - Test command reference
- [baseline](/cli/baseline) - Baseline management
- [Configuration](/guides/configuration) - Full config reference
- [Drift Detection](/concepts/drift-detection) - Understanding drift

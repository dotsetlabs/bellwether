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
      - run: npx @dotsetlabs/bellwether check --fail-on-drift
```

No API keys required. Free. Runs in seconds. Configure baseline paths in `bellwether.yaml`.

## Setup

### 1. Create Configuration

First, initialize a CI-optimized configuration:

```bash
bellwether init --preset ci
```

This creates `bellwether.yaml` with:
- Check mode (free, deterministic)
- JSON output enabled
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

Configure your server command and baseline paths in `bellwether.yaml`:

```yaml
server:
  command: "npx @mcp/your-server"

baseline:
  comparePath: "./bellwether-baseline.json"
  failOnDrift: true
```

### Using GitHub Action

```yaml
- name: Detect Behavioral Drift
  uses: dotsetlabs/bellwether/action@v1
  with:
    server-command: 'npx @mcp/your-server'
    baseline-path: './bellwether-baseline.json'
    fail-on-drift: 'true'
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

| Code | Meaning | Action |
|:-----|:--------|:-------|
| `0` | Success | Pipeline passes |
| `1` | Drift detected or test failed | Pipeline fails |
| `2` | Configuration or connection error | Pipeline fails |

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
Using `baseline accept` or `--accept-drift` creates an audit trail recording when, why, and who accepted the changes. This is valuable for compliance and team visibility.
:::

### Comparing Versions

```bash
# Compare two baselines
bellwether baseline diff ./baselines/v1.0.0.json ./baselines/v2.0.0.json
```

---

## Cloud Integration

Sync with Bellwether Cloud for history and team visibility:

```yaml
- name: Upload to Cloud
  env:
    BELLWETHER_SESSION: ${{ secrets.BELLWETHER_SESSION }}
  run: |
    npx @dotsetlabs/bellwether check
    npx @dotsetlabs/bellwether baseline save
    npx @dotsetlabs/bellwether upload --ci --fail-on-drift
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
| `BELLWETHER_SESSION` | Cloud session token | For cloud upload |
| `BELLWETHER_TEAM_ID` | Team ID for multi-team organizations | For cloud upload with specific team |

---

## Troubleshooting

### Exit Code 1

Drift or test failure detected:
- Check the diff output for what changed
- Update baseline if changes are intentional
- Fix server if changes are unintentional

### Exit Code 2

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

```yaml
- run: |
    npx @dotsetlabs/bellwether check 2>&1 | tee bellwether.log
  env:
    LOG_LEVEL: debug

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

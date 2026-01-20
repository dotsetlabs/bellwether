---
title: CI/CD Integration
sidebar_position: 1
---

# CI/CD Integration

Integrate Bellwether into your CI/CD pipeline for automated behavioral testing of MCP servers.

## Quick Start

The simplest CI/CD setup uses contract mode (free, fast, deterministic):

```yaml
# .github/workflows/bellwether.yml
name: MCP Drift Detection
on: [pull_request]

jobs:
  bellwether:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npx @dotsetlabs/bellwether check npx @mcp/your-server
      - run: npx @dotsetlabs/bellwether baseline compare ./bellwether-baseline.json --fail-on-drift
```

No API keys required. Free. Runs in seconds.

## Setup

### 1. Create Configuration

First, initialize a CI-optimized configuration:

```bash
bellwether init --preset ci
```

This creates `bellwether.yaml` with:
- Contract mode (free, deterministic)
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

      - name: Run Bellwether Test
        run: npx @dotsetlabs/bellwether check npx @mcp/your-server

      - name: Check for Drift
        run: npx @dotsetlabs/bellwether baseline compare ./bellwether-baseline.json --fail-on-drift
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

### Document Mode with LLM (Optional)

For comprehensive testing with LLM-generated scenarios:

```yaml
jobs:
  bellwether:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run Document Mode Test
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
        run: |
          npx @dotsetlabs/bellwether check npx @mcp/your-server
          npx @dotsetlabs/bellwether baseline compare ./bellwether-baseline.json --fail-on-drift
```

---

## GitLab CI

```yaml
bellwether:
  image: node:20
  script:
    - npx @dotsetlabs/bellwether check npx @mcp/your-server
    - npx @dotsetlabs/bellwether baseline compare ./bellwether-baseline.json --fail-on-drift
```

---

## Workflow Patterns

### PR Checks (Contract Mode)

Fast, free checks on every pull request:

```yaml
name: PR Check
on: pull_request

jobs:
  bellwether:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npx @dotsetlabs/bellwether check npx @mcp/your-server
      - run: npx @dotsetlabs/bellwether baseline compare ./bellwether-baseline.json --fail-on-drift
```

### Nightly Document Mode Tests

Comprehensive testing with LLM:

```yaml
name: Nightly Tests
on:
  schedule:
    - cron: '0 0 * * *'

jobs:
  bellwether:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      # Use thorough preset config
      - run: npx @dotsetlabs/bellwether check --config ./configs/thorough.yaml npx @mcp/your-server
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}

      - run: npx @dotsetlabs/bellwether baseline compare ./bellwether-baseline.json --fail-on-drift
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
          npx @dotsetlabs/bellwether check npx @mcp/your-server
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

mode: contract

output:
  dir: "."
  format: both  # Generate JSON for baseline comparison

baseline:
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
bellwether check npx @mcp/your-server
bellwether baseline save

# Commit
git add bellwether-baseline.json
git commit -m "Add behavioral baseline"
```

### Updating Baselines

When you intentionally change your server:

```bash
# Update baseline
bellwether check npx @mcp/your-server
bellwether baseline save --force

# Review and commit
bellwether baseline show
git add bellwether-baseline.json
git commit -m "Update baseline for new feature X"
```

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
    npx @dotsetlabs/bellwether check npx @mcp/your-server
    npx @dotsetlabs/bellwether baseline save
    npx @dotsetlabs/bellwether upload --ci --fail-on-drift
```

---

## Cost Comparison

| Mode | Cost | Speed | Use Case |
|:-----|:-----|:------|:---------|
| Contract (default) | Free | Seconds | PR checks, CI gates |
| Document with Ollama | Free | Minutes | Local dev |
| Document with OpenAI | ~$0.01-0.10 | Minutes | Comprehensive testing |

### Contract Mode Benefits

- **Free** - No API costs
- **Fast** - Completes in seconds
- **Deterministic** - Same results every time
- **No secrets** - No API keys to manage

---

## Environment Variables

| Variable | Description | Required |
|:---------|:------------|:---------|
| `OPENAI_API_KEY` | OpenAI API key | For document mode with OpenAI |
| `ANTHROPIC_API_KEY` | Anthropic API key | For document mode with Anthropic |
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
    npx @dotsetlabs/bellwether check npx @mcp/your-server 2>&1 | tee bellwether.log
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

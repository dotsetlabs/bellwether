---
title: CI/CD Integration
sidebar_position: 1
---

# CI/CD Integration

Integrate Inquest into your CI/CD pipeline for automated behavioral testing of MCP servers.

## Quick Start

### GitHub Actions

```yaml
name: MCP Behavioral Testing
on: [push, pull_request]

jobs:
  inquest:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Run Inquest
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
        run: |
          npx @dotsetlabs/inquest interview \
            --ci \
            --compare-baseline ./inquest-baseline.json \
            --fail-on-drift \
            npx your-mcp-server
```

### GitLab CI

```yaml
inquest:
  image: node:20
  script:
    - |
      npx @dotsetlabs/inquest interview \
        --ci \
        --compare-baseline ./inquest-baseline.json \
        --fail-on-drift \
        npx your-mcp-server
  variables:
    OPENAI_API_KEY: $OPENAI_API_KEY
```

## CI Mode

Enable CI mode with `--ci` for:
- **No colors** - Clean output for log parsing
- **No progress bars** - Streaming-friendly output
- **Machine-readable errors** - Structured error messages
- **Proper exit codes** - Pipeline gates

## Exit Codes

| Code | Meaning | Action |
|:-----|:--------|:-------|
| `0` | Success | Pipeline passes |
| `1` | Drift or security issues | Pipeline fails |
| `2` | Interview error | Pipeline fails |

## Workflow Patterns

### PR Checks

Fast checks on every pull request:

```yaml
name: PR Check
on: pull_request

jobs:
  inquest:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Quick Behavioral Check
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
        run: |
          npx @dotsetlabs/inquest interview \
            --ci \
            --quick \
            --compare-baseline ./inquest-baseline.json \
            --fail-on-drift \
            npx your-server
```

### Nightly Full Tests

Comprehensive testing on a schedule:

```yaml
name: Nightly Tests
on:
  schedule:
    - cron: '0 0 * * *'

jobs:
  inquest:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Full Interview
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
        run: |
          npx @dotsetlabs/inquest interview \
            --ci \
            --persona technical_writer,security_tester,qa_engineer \
            --max-questions 5 \
            --compare-baseline ./inquest-baseline.json \
            --fail-on-drift \
            npx your-server
```

### Security Scanning

Security-focused pipeline:

```yaml
name: Security Scan
on: pull_request

jobs:
  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Security Audit
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
        run: |
          npx @dotsetlabs/inquest interview \
            --ci \
            --persona security_tester \
            --fail-on-security \
            --output-format sarif \
            -o ./security \
            npx your-server

      - name: Upload SARIF
        uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: ./security/inquest.sarif
```

## Baseline Management

### Storing Baselines

Commit baselines to version control:

```bash
# Create baseline
inquest interview --save-baseline npx your-server

# Commit
git add inquest-baseline.json
git commit -m "Add behavioral baseline"
git push
```

### Updating Baselines

Update when intentional changes are made:

```yaml
name: Update Baseline
on:
  workflow_dispatch:

jobs:
  update:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Generate New Baseline
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
        run: |
          npx @dotsetlabs/inquest interview \
            --save-baseline \
            npx your-server

      - name: Commit Baseline
        run: |
          git config user.name "GitHub Actions"
          git config user.email "actions@github.com"
          git add inquest-baseline.json
          git commit -m "Update behavioral baseline"
          git push
```

## Cloud Integration

Sync with Inquest Cloud for history and team visibility:

```yaml
- name: Upload to Cloud
  env:
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
    INQUEST_SESSION: ${{ secrets.INQUEST_SESSION }}
  run: |
    npx @dotsetlabs/inquest interview --save-baseline npx your-server
    npx @dotsetlabs/inquest upload --ci --fail-on-drift
```

## Output Formats

### SARIF for GitHub

```yaml
- name: Generate SARIF
  run: |
    npx @dotsetlabs/inquest interview \
      --output-format sarif \
      -o ./results \
      npx your-server

- uses: github/codeql-action/upload-sarif@v3
  with:
    sarif_file: ./results/inquest.sarif
```

### JUnit for GitLab

```yaml
inquest:
  script:
    - npx @dotsetlabs/inquest interview --output-format junit -o ./results npx your-server
  artifacts:
    reports:
      junit: results/junit.xml
```

## Environment Variables

| Variable | Description | Required |
|:---------|:------------|:---------|
| `OPENAI_API_KEY` | OpenAI API key | Yes* |
| `ANTHROPIC_API_KEY` | Anthropic API key | Yes* |
| `INQUEST_SESSION` | Cloud session token | For cloud |
| `CI` | Auto-detected in CI | - |

*One LLM provider required

## Cost Optimization

### Use Cheaper Models in CI

```yaml
- run: |
    npx @dotsetlabs/inquest interview \
      --model gpt-4o-mini \
      --max-questions 1 \
      npx your-server
```

### Quick Mode

```yaml
- run: |
    npx @dotsetlabs/inquest interview \
      --quick \
      npx your-server
```

Cost comparison:
| Mode | Approx. Cost |
|:-----|:-------------|
| Quick | ~$0.01 |
| Normal | ~$0.05 |
| Thorough | ~$0.15 |

## Troubleshooting

### Exit Code 2

Interview failed (not drift):
- Check API key is set
- Verify server starts correctly
- Check network connectivity

### Timeout Errors

Increase timeout for slow servers:

```yaml
- run: |
    npx @dotsetlabs/inquest interview \
      --timeout 120000 \
      npx slow-server
```

### Debug Logging

```yaml
- run: |
    npx @dotsetlabs/inquest interview \
      --ci \
      --log-level debug \
      --log-file ./inquest-debug.log \
      npx your-server

- uses: actions/upload-artifact@v4
  if: failure()
  with:
    name: debug-logs
    path: ./inquest-debug.log
```

## See Also

- [Output Formats](/concepts/output-formats) - SARIF, JUnit details
- [Drift Detection](/concepts/drift-detection) - Understanding drift
- [interview](/cli/interview) - CLI options

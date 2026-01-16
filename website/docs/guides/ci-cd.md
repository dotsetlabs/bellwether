---
title: CI/CD Integration
sidebar_position: 1
---

# CI/CD Integration

Integrate Bellwether into your CI/CD pipeline for automated behavioral testing of MCP servers.

## GitHub Action (Recommended)

The easiest way to integrate Bellwether is with our official GitHub Action:

```yaml
name: MCP Behavioral Testing
on: [push, pull_request]

jobs:
  bellwether:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run Bellwether
        uses: dotsetlabs/bellwether/action@v1
        with:
          server-command: 'npx @modelcontextprotocol/server-filesystem'
          server-args: '/tmp'
          baseline-path: './bellwether-baseline.json'
          fail-on-drift: 'true'
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

### Action Features

- **Automatic setup** - Installs Node.js and Bellwether
- **Artifact upload** - AGENTS.md and baseline files saved
- **All presets supported** - `ci`, `docs`, `security`, `thorough`
- **Custom scenarios** - Pass your `bellwether-tests.yaml`

### Action Inputs

| Input | Description | Default |
|:------|:------------|:--------|
| `server-command` | Command to start the MCP server | Required |
| `server-args` | Arguments for the server | `''` |
| `preset` | Interview preset (`ci`, `docs`, `security`, `thorough`) | - |
| `quick` | Quick mode for PR checks | `false` |
| `baseline-path` | Baseline for drift detection | - |
| `fail-on-drift` | Fail if drift detected | `true` |
| `strict` | Strict mode: only structural changes (deterministic) | `false` |
| `min-confidence` | Minimum confidence (0-100) to report changes | `0` |
| `confidence-threshold` | Confidence threshold (0-100) for failures | `80` |
| `scenarios-path` | Custom test scenarios file | - |
| `scenarios-only` | Run only custom scenarios | `false` |

See the [full action documentation](https://github.com/dotsetlabs/bellwether/blob/main/action/README.md) for all options.

---

## Manual Setup

If you prefer not to use the action, you can run Bellwether directly:

### GitHub Actions (Manual)

```yaml
name: MCP Behavioral Testing
on: [push, pull_request]

jobs:
  bellwether:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Run Bellwether
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
        run: |
          npx @dotsetlabs/bellwether interview \
            --preset ci \
            --compare-baseline ./bellwether-baseline.json \
            --fail-on-drift \
            npx your-mcp-server
```

### GitLab CI

```yaml
bellwether:
  image: node:20
  script:
    - |
      npx @dotsetlabs/bellwether interview \
        --preset ci \
        --compare-baseline ./bellwether-baseline.json \
        --fail-on-drift \
        npx your-mcp-server
  variables:
    OPENAI_API_KEY: $OPENAI_API_KEY
```

## CI Preset

Use the `--preset ci` for optimized CI runs:
- **Single persona** - Technical Writer only for speed
- **One question per tool** - Minimal API calls
- **Proper exit codes** - Pipeline gates via `--fail-on-drift`

## Deterministic Mode

For CI/CD pipelines requiring **100% reproducible results**, use strict mode:

```yaml
- name: Deterministic Drift Check
  run: |
    npx @dotsetlabs/bellwether interview \
      --preset ci \
      --compare-baseline ./bellwether-baseline.json \
      --fail-on-drift \
      --strict \
      npx your-server
```

### Strict Mode Benefits

| Feature | Default Mode | Strict Mode |
|:--------|:-------------|:------------|
| Structural changes (schema, tools) | Reported (100% confidence) | Reported (100% confidence) |
| Semantic changes (assertions) | Reported (variable confidence) | **Skipped** |
| LLM calls for comparison | Yes | **No** |
| Determinism | Non-deterministic | **100% deterministic** |
| API costs | Per comparison | **Zero** |

### Confidence Thresholds

When not using strict mode, configure confidence thresholds:

```yaml
- name: High-Confidence Drift Check
  run: |
    npx @dotsetlabs/bellwether interview \
      --compare-baseline ./bellwether-baseline.json \
      --fail-on-drift \
      --min-confidence 80 \
      --confidence-threshold 90 \
      npx your-server
```

| Option | Description |
|:-------|:------------|
| `--strict` | Only report structural changes (no LLM comparison) |
| `--min-confidence <n>` | Filter out changes below this confidence (0-100) |
| `--confidence-threshold <n>` | Only fail if breaking changes exceed this confidence (default: 80) |

### Recommended Configurations

| Use Case | Configuration |
|:---------|:--------------|
| Deployment gates | `--strict --fail-on-drift` |
| PR review | `--min-confidence 60 --fail-on-drift` |
| Security compliance | `--strict --fail-on-drift` |
| Nightly exploratory | Default (no flags) |

## Exit Codes

| Code | Meaning | Action |
|:-----|:--------|:-------|
| `0` | Success | Pipeline passes |
| `1` | Drift or security issues | Pipeline fails |
| `2` | Interview error | Pipeline fails |

## Workflow Patterns

### PR Checks

Fast checks on every pull request using the `ci` preset (~$0.01/run):

```yaml
name: PR Check
on: pull_request

jobs:
  bellwether:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Quick Behavioral Check
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
        run: |
          npx @dotsetlabs/bellwether interview \
            --preset ci \
            --compare-baseline ./bellwether-baseline.json \
            --fail-on-drift \
            npx your-server
```

### Nightly Full Tests

Comprehensive testing on a schedule using the `thorough` preset:

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

      - name: Full Interview
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
        run: |
          npx @dotsetlabs/bellwether interview \
            --preset thorough \
            --compare-baseline ./bellwether-baseline.json \
            --fail-on-drift \
            npx your-server
```

### Security Scanning

Security-focused pipeline using the `security` preset:

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
          npx @dotsetlabs/bellwether interview \
            --preset security \
            --compare-baseline ./bellwether-baseline.json \
            --fail-on-drift \
            --json \
            -o ./security \
            npx your-server

      - name: Upload Results
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: security-results
          path: ./security/
```

## Baseline Management

### Storing Baselines

Commit baselines to version control:

```bash
# Create baseline
bellwether interview --save-baseline npx your-server

# Commit
git add bellwether-baseline.json
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
          npx @dotsetlabs/bellwether interview \
            --save-baseline \
            npx your-server

      - name: Commit Baseline
        run: |
          git config user.name "GitHub Actions"
          git config user.email "actions@github.com"
          git add bellwether-baseline.json
          git commit -m "Update behavioral baseline"
          git push
```

## Cloud Integration

Sync with Bellwether Cloud for history and drift tracking:

```yaml
- name: Upload to Cloud
  env:
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
    BELLWETHER_SESSION: ${{ secrets.BELLWETHER_SESSION }}
  run: |
    npx @dotsetlabs/bellwether interview --save-baseline npx your-server
    npx @dotsetlabs/bellwether upload --ci --fail-on-drift
```

## Output Formats

### JSON Report

Generate a JSON report for programmatic analysis:

```yaml
- name: Generate JSON Report
  run: |
    npx @dotsetlabs/bellwether interview \
      --json \
      -o ./results \
      npx your-server

- uses: actions/upload-artifact@v4
  with:
    name: bellwether-report
    path: ./results/bellwether-report.json
```

### Save Baseline for Tracking

```yaml
- name: Save Baseline
  run: |
    npx @dotsetlabs/bellwether interview \
      --save-baseline \
      -o ./results \
      npx your-server

- uses: actions/upload-artifact@v4
  with:
    name: baseline
    path: ./results/bellwether-baseline.json
```

## Environment Variables

| Variable | Description | Required |
|:---------|:------------|:---------|
| `OPENAI_API_KEY` | OpenAI API key | Yes* |
| `ANTHROPIC_API_KEY` | Anthropic API key | Yes* |
| `BELLWETHER_SESSION` | Cloud session token | For cloud |
| `CI` | Auto-detected in CI | - |

*One LLM provider required

## Cost Optimization

### Use the CI Preset

The `ci` preset is optimized for fast, cheap CI runs:

```yaml
- run: |
    npx @dotsetlabs/bellwether interview \
      --preset ci \
      npx your-server
```

### Cost by Preset

| Preset | Approx. Cost | Use Case |
|:-------|:-------------|:---------|
| `ci` | ~$0.01 | PR checks, fast validation |
| `docs` | ~$0.02 | Documentation generation |
| `security` | ~$0.05 | Security-focused testing |
| `thorough` | ~$0.10 | Comprehensive nightly tests |

## Documentation Badges

Display your server's documentation status in your README:

### Add Badge After CI Run

```yaml
- name: Get Badge
  env:
    BELLWETHER_SESSION: ${{ secrets.BELLWETHER_SESSION }}
  run: |
    npx @dotsetlabs/bellwether badge --markdown >> $GITHUB_STEP_SUMMARY
```

### Update README Automatically

```yaml
name: Update Badge
on:
  workflow_run:
    workflows: ["MCP Behavioral Testing"]
    types: [completed]

jobs:
  badge:
    runs-on: ubuntu-latest
    if: ${{ github.event.workflow_run.conclusion == 'success' }}
    steps:
      - uses: actions/checkout@v4

      - name: Update Badge Status
        env:
          BELLWETHER_SESSION: ${{ secrets.BELLWETHER_SESSION }}
        run: |
          BADGE_URL=$(npx @dotsetlabs/bellwether badge --url)
          echo "Badge URL: $BADGE_URL"
```

Badge status reflects:
- **Documented** (green): Server has been documented
- **Stable** (green): No behavioral drift between versions
- **Drift detected** (yellow): Behavioral changes found
- **Breaking changes** (red): Significant breaking changes

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
    npx @dotsetlabs/bellwether interview \
      --timeout 120000 \
      npx slow-server
```

### Debug Logging

```yaml
- run: |
    npx @dotsetlabs/bellwether interview \
      --verbose \
      --debug \
      npx your-server 2>&1 | tee ./bellwether-debug.log

- uses: actions/upload-artifact@v4
  if: failure()
  with:
    name: debug-logs
    path: ./bellwether-debug.log
```

## See Also

- [Output Formats](/concepts/output-formats) - Markdown and JSON output
- [Drift Detection](/concepts/drift-detection) - Understanding drift
- [interview](/cli/interview) - CLI options
- [badge](/cli/badge) - Documentation badges
- [Configuration](/guides/configuration) - Presets and options

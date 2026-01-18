# Bellwether GitHub Action

> **Catch MCP server drift before your users do. Zero LLM required.**

Structural drift detection for MCP servers in CI/CD. Free. Deterministic. Fast.

## Features

- **Structural Drift Detection** - Catch tool additions, removals, schema changes
- **Zero LLM Required** - No API keys, no token costs (in structural mode)
- **Deterministic** - Same input = same output
- **CI/CD Gating** - Block deployments when behavior drifts unexpectedly
- **Config-Driven** - Uses `bellwether.yaml` for all settings
- **Cloud Integration** - Optional upload to Bellwether Cloud for history tracking

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
        uses: dotsetlabs/bellwether/action@v1
        with:
          server-command: 'npx @mcp/your-server'
```

No secrets needed. Free. Runs in seconds.

## Usage

### Basic Drift Detection

```yaml
- name: Detect Drift
  uses: dotsetlabs/bellwether/action@v1
  with:
    server-command: 'npx @mcp/your-server'
    baseline-path: './bellwether-baseline.json'
    fail-on-drift: 'true'
```

### Save Baseline

```yaml
- name: Save Baseline
  uses: dotsetlabs/bellwether/action@v1
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
  uses: dotsetlabs/bellwether/action@v1
  with:
    server-command: 'npx @mcp/your-server'
    config-path: './configs/ci.yaml'
```

### With Cloud Upload

Upload baselines to Bellwether Cloud for history tracking and team visibility:

```yaml
- name: Test and Upload
  uses: dotsetlabs/bellwether/action@v1
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

### Full Mode with LLM (Optional)

For comprehensive testing with LLM-generated scenarios, create a config with full mode:

```yaml
# bellwether.yaml
mode: full
llm:
  provider: openai
```

```yaml
- name: Full Test
  uses: dotsetlabs/bellwether/action@v1
  with:
    server-command: 'npx @mcp/your-server'
  env:
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

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
  uses: dotsetlabs/bellwether/action@v1
  with:
    server-command: 'npx @mcp/your-server'
  env:
    API_KEY: ${{ secrets.API_KEY }}
    DATABASE_URL: ${{ secrets.DATABASE_URL }}
```

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `server-command` | Command to start the MCP server | Yes | - |
| `server-args` | Arguments to pass to the server | No | `''` |
| `config-path` | Path to bellwether.yaml config file | No | `bellwether.yaml` |
| `baseline-path` | Path to baseline file for drift comparison | No | `bellwether-baseline.json` |
| `fail-on-drift` | Fail if drift is detected | No | `true` |
| `save-baseline` | Save baseline after test | No | `false` |
| `output-dir` | Directory for output files | No | `.` |

## Outputs

| Output | Description |
|--------|-------------|
| `result` | Check result: `passed` or `failed` |
| `exit-code` | Exit code (0=pass, 1=fail, 2=error) |
| `drift-detected` | Whether drift was detected (`true`/`false`) |
| `tool-count` | Number of tools discovered |
| `agents-md` | Path to generated AGENTS.md file |
| `baseline-file` | Path to baseline file |

## Artifacts

The action automatically uploads:
- `bellwether-docs`: The generated AGENTS.md file
- `bellwether-baseline`: The baseline file (if saved)
- `bellwether-report`: The JSON report

## Configuration

All test settings are configured in `bellwether.yaml`. If no config file exists, the action automatically creates one with `--preset ci` (structural mode, optimized for CI).

### Create Config Locally

```bash
# CI-optimized (structural, fast, free)
bellwether init --preset ci npx @mcp/your-server

# Full mode with local Ollama
bellwether init --preset local npx @mcp/your-server

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

mode: structural  # Free, fast, deterministic

output:
  dir: "."
  format: both  # Generate JSON for baseline comparison

baseline:
  failOnDrift: true
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

      - name: Test MCP Server
        id: bellwether
        uses: dotsetlabs/bellwether/action@v1
        with:
          server-command: 'npx @mcp/your-server'
          fail-on-drift: 'true'

      - name: Upload to Cloud (main only)
        if: github.ref == 'refs/heads/main' && success()
        run: |
          npx @dotsetlabs/bellwether baseline save
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
              body: '⚠️ MCP behavioral drift detected. Review AGENTS.md for details.'
            })
```

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success - no drift detected |
| `1` | Drift detected or test failed |
| `2` | Configuration or connection error |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | OpenAI API key (full mode only) |
| `ANTHROPIC_API_KEY` | Anthropic API key (full mode only) |
| `BELLWETHER_SESSION` | Cloud session token for uploads |

## Migration from v0.x

If you were using the old flag-based inputs:

**Before:**
```yaml
- uses: dotsetlabs/bellwether/action@v0
  with:
    server-command: 'npx @mcp/server'
    preset: 'ci'
    max-questions: '3'
    personas: 'technical_writer'
    structural-only: 'true'
```

**After:**
```yaml
- uses: dotsetlabs/bellwether/action@v1
  with:
    server-command: 'npx @mcp/server'
```

All settings now come from `bellwether.yaml`. The action auto-creates one if missing.

## Security

- Never commit API keys to your repository
- Use GitHub Secrets to store sensitive values
- For structural mode (default), no API keys are needed
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

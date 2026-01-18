# Bellwether GitHub Action

> **Catch MCP server drift before your users do. Zero LLM required.**

Structural drift detection for MCP servers in CI/CD. Free. Deterministic. Fast.

## Features

- **Structural Drift Detection** - Catch tool additions, removals, schema changes
- **Zero LLM Required** - No API keys, no token costs (in structural mode)
- **Deterministic** - Same input = same output
- **CI/CD Gating** - Block deployments when behavior drifts unexpectedly
- **Config-Driven** - Uses `bellwether.yaml` for all settings

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
| `result` | Check result: passed or failed |
| `exit-code` | Exit code (0=pass, 1=fail, 2=error) |
| `drift-detected` | Whether drift was detected |
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
bellwether init --preset ci

# Full mode with local Ollama
bellwether init --preset local

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

mode: structural  # Free, fast, deterministic

output:
  dir: "."
  format: both  # Generate JSON for baseline comparison

baseline:
  failOnDrift: true
```

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success - no drift detected |
| `1` | Drift detected or test failed |
| `2` | Configuration or connection error |

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

## License

MIT License - see [LICENSE](../LICENSE) for details.

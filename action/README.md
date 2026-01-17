# Bellwether MCP Interview Action

Behavioral testing, documentation generation, and drift detection for MCP servers in your CI/CD pipeline.

## Features

- Interview MCP servers with LLM-guided behavioral testing
- Generate AGENTS.md documentation automatically
- Detect behavioral drift with baseline comparison
- Run custom test scenarios (with or without LLM)
- JSON report output for programmatic analysis
- Multiple LLM providers: OpenAI, Anthropic, Ollama

## Usage

### Basic Usage

```yaml
name: MCP Interview
on: [push, pull_request]

jobs:
  interview:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Interview MCP Server
        uses: dotsetlabs/bellwether/action@v1
        with:
          server-command: 'npx @modelcontextprotocol/server-filesystem'
          server-args: '/tmp'
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

### Quick Mode (Recommended for PRs)

```yaml
- name: Quick Interview
  uses: dotsetlabs/bellwether/action@v1
  with:
    server-command: 'npx @modelcontextprotocol/server-filesystem'
    server-args: '/tmp'
    quick: 'true'
  env:
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

### Using Presets

```yaml
- name: Security-focused Interview
  uses: dotsetlabs/bellwether/action@v1
  with:
    server-command: 'npx @modelcontextprotocol/server-filesystem'
    server-args: '/tmp'
    preset: 'security'  # Options: docs, security, thorough, ci
  env:
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

### Drift Detection

```yaml
- name: Interview with Drift Detection
  uses: dotsetlabs/bellwether/action@v1
  with:
    server-command: 'npx @modelcontextprotocol/server-filesystem'
    server-args: '/tmp'
    baseline-path: './bellwether-baseline.json'
    fail-on-drift: 'true'
  env:
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

### Deterministic Drift Detection (Strict Mode)

For CI/CD pipelines requiring 100% reproducible results, use strict mode:

```yaml
- name: Deterministic Drift Detection
  uses: dotsetlabs/bellwether/action@v1
  with:
    server-command: 'npx @modelcontextprotocol/server-filesystem'
    server-args: '/tmp'
    baseline-path: './bellwether-baseline.json'
    fail-on-drift: 'true'
    strict: 'true'  # Only structural changes (no LLM comparison)
  env:
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

### Confidence-Based Drift Detection

Filter changes by confidence score:

```yaml
- name: High-Confidence Drift Detection
  uses: dotsetlabs/bellwether/action@v1
  with:
    server-command: 'npx @modelcontextprotocol/server-filesystem'
    server-args: '/tmp'
    baseline-path: './bellwether-baseline.json'
    fail-on-drift: 'true'
    min-confidence: '80'  # Only report changes with 80%+ confidence
    confidence-threshold: '90'  # Only fail on breaking changes with 90%+ confidence
  env:
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

### Save Baseline

```yaml
- name: Interview and Save Baseline
  uses: dotsetlabs/bellwether/action@v1
  with:
    server-command: 'npx @modelcontextprotocol/server-filesystem'
    server-args: '/tmp'
    save-baseline: 'true'
  env:
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}

- name: Commit Baseline
  uses: stefanzweifel/git-auto-commit-action@v5
  with:
    commit_message: 'Update MCP baseline'
    file_pattern: 'bellwether-baseline.json'
```

### Custom Scenarios (No LLM Required)

```yaml
- name: Run Custom Scenarios
  uses: dotsetlabs/bellwether/action@v1
  with:
    server-command: 'npx @modelcontextprotocol/server-filesystem'
    server-args: '/tmp'
    scenarios-path: './bellwether-tests.yaml'
    scenarios-only: 'true'
```

### Security-Focused Interview

```yaml
- name: Security Interview
  uses: dotsetlabs/bellwether/action@v1
  with:
    server-command: 'npx @modelcontextprotocol/server-filesystem'
    server-args: '/tmp'
    preset: 'security'
    output-json: 'true'
  env:
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

The security preset includes the security testing persona for adversarial testing.

### Workflow Testing

```yaml
- name: Test with Workflows
  uses: dotsetlabs/bellwether/action@v1
  with:
    server-command: 'npx @modelcontextprotocol/server-filesystem'
    server-args: '/tmp'
    workflows-path: './bellwether-workflows.yaml'
  env:
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

Or auto-discover workflows:

```yaml
- name: Auto-Discover Workflows
  uses: dotsetlabs/bellwether/action@v1
  with:
    server-command: 'npx @modelcontextprotocol/server-filesystem'
    server-args: '/tmp'
    discover-workflows: 'true'
  env:
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

### Fast Parallel Execution

For faster CI with multiple personas:

```yaml
- name: Parallel Interview
  uses: dotsetlabs/bellwether/action@v1
  with:
    server-command: 'npx @modelcontextprotocol/server-filesystem'
    server-args: '/tmp'
    preset: 'thorough'
    parallel-personas: 'true'
  env:
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `server-command` | Command to start the MCP server | Yes | - |
| `server-args` | Arguments to pass to the server | No | `''` |
| `preset` | Interview preset (docs, security, thorough, ci) | No | - |
| `personas` | Comma-separated personas (if not using preset) | No | `technical_writer` |
| `max-questions` | Max questions per tool (if not using preset) | No | `3` |
| `quick` | Quick mode for fast CI runs | No | `false` |
| `security` | Include security testing persona | No | `false` |
| `baseline-path` | Path to baseline file for drift comparison | No | - |
| `fail-on-drift` | Fail if drift is detected | No | `true` |
| `strict` | Strict mode: only structural changes (deterministic) | No | `false` |
| `min-confidence` | Minimum confidence (0-100) to report changes | No | `0` |
| `confidence-threshold` | Confidence threshold (0-100) for failures | No | `80` |
| `save-baseline` | Save baseline after interview | No | `false` |
| `output-json` | Also generate JSON report | No | `false` |
| `output-dir` | Directory for output files | No | `.` |
| `scenarios-path` | Path to custom test scenarios YAML | No | - |
| `scenarios-only` | Run only custom scenarios (no LLM) | No | `false` |
| `workflows-path` | Path to workflow definitions YAML | No | - |
| `discover-workflows` | Enable LLM-based workflow discovery | No | `false` |
| `parallel-personas` | Run persona interviews in parallel | No | `false` |
| `no-cache` | Disable response caching | No | `false` |
| `timeout` | Timeout for tool calls in ms | No | `30000` |
| `llm-provider` | LLM provider (auto-detected from API key) | No | - |
| `llm-model` | LLM model to use | No | - |
| `openai-api-key` | OpenAI API key (or use env var) | No | - |
| `anthropic-api-key` | Anthropic API key (or use env var) | No | - |

## Outputs

| Output | Description |
|--------|-------------|
| `result` | Check result: passed or failed |
| `exit-code` | Exit code (0=pass, 1=fail, 2=error) |
| `drift-detected` | Whether drift was detected |
| `security-tested` | Whether security persona was included |
| `tool-count` | Number of tools discovered |
| `error-count` | Number of errors encountered |
| `agents-md` | Path to generated AGENTS.md file |
| `json-report` | Path to JSON report file |
| `baseline-file` | Path to saved baseline file |

## Artifacts

The action automatically uploads:
- `bellwether-docs`: The generated AGENTS.md file
- `bellwether-baseline`: The baseline file (if saved)
- `bellwether-report`: The JSON report (if `output-json: true`)

## Using with Different LLM Providers

### Anthropic

```yaml
- uses: dotsetlabs/bellwether/action@v1
  with:
    server-command: 'npx your-server'
    llm-provider: 'anthropic'
    llm-model: 'claude-3-5-sonnet-20241022'
  env:
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

### Self-hosted Ollama

```yaml
- uses: dotsetlabs/bellwether/action@v1
  with:
    server-command: 'npx your-server'
    llm-provider: 'ollama'
    llm-model: 'llama2'
```

## Security

- Never commit API keys to your repository
- Use GitHub Secrets to store sensitive values
- Use `preset: security` or `security: true` for adversarial testing
- The action filters out sensitive environment variables when spawning servers

## License

MIT License - see [LICENSE](../LICENSE) for details.

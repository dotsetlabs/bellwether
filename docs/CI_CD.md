# CI/CD Integration Guide

Inquest is designed for seamless integration into CI/CD pipelines, enabling automated behavioral testing of MCP servers on every commit.

## Quick Start

### GitHub Actions

```yaml
- name: Run Inquest
  env:
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
  run: |
    npx inquest interview \
      --ci \
      --fail-on-drift \
      --baseline-file ./baseline.json \
      npx your-mcp-server
```

### GitLab CI

```yaml
inquest:
  script:
    - npx inquest interview --ci --fail-on-drift npx your-mcp-server
```

## CI Mode Features

Enable CI mode with the `--ci` flag for:

- **No colors** - Clean output for log parsing
- **No progress bars** - Streaming-friendly output
- **Machine-readable errors** - Structured error messages
- **Exit codes** - Proper status for pipeline gates

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success - interview completed, no issues |
| 1 | Failure - behavioral drift or security issues detected |
| 2 | Error - interview failed (connection, LLM, etc.) |

## Behavioral Baselines

Baselines capture a snapshot of expected MCP server behavior, enabling drift detection over time.

### Creating a Baseline

```bash
inquest interview \
  --save-baseline ./baseline.json \
  npx your-mcp-server
```

The baseline includes:
- Server capabilities (tools, prompts, resources)
- Tool schemas
- Behavioral observations
- Security findings

### Comparing Against Baseline

```bash
inquest interview \
  --baseline-file ./baseline.json \
  --fail-on-drift \
  npx your-mcp-server
```

### Drift Severity Levels

| Level | Description | CI Behavior |
|-------|-------------|-------------|
| `none` | No changes detected | Pass |
| `info` | Documentation-only changes | Pass (unless `--strict`) |
| `warning` | Behavioral changes to investigate | Fail with `--fail-on-drift` |
| `breaking` | Critical schema/behavior changes | Always fail |

## Output Formats

### SARIF (GitHub Code Scanning)

Generate SARIF output for GitHub's security tab:

```bash
inquest interview \
  --output sarif \
  -o ./results \
  npx your-mcp-server
```

Upload in GitHub Actions:

```yaml
- name: Upload SARIF
  uses: github/codeql-action/upload-sarif@v3
  with:
    sarif_file: ./results/inquest.sarif
```

### JUnit XML (Test Runners)

Generate JUnit output for CI test reporting:

```bash
inquest interview \
  --output junit \
  -o ./results \
  npx your-mcp-server
```

Use in GitLab CI:

```yaml
artifacts:
  reports:
    junit: results/junit.xml
```

## Security Testing in CI

### Fail on Security Issues

```bash
inquest interview \
  --fail-on-security \
  --persona security_tester \
  npx your-mcp-server
```

### Security-Only Pipeline

```yaml
security-audit:
  script:
    - |
      inquest interview \
        --ci \
        --persona security_tester \
        --fail-on-security \
        --output sarif \
        npx your-mcp-server
  allow_failure: false
```

## Workflow Testing

Test tool chains in CI to verify integration patterns:

```bash
inquest interview \
  --workflows ./workflows.yaml \
  --fail-on-workflow-failure \
  npx your-mcp-server
```

## GitHub Actions Examples

### Basic CI Workflow

```yaml
name: MCP Server Tests
on: [push, pull_request]

jobs:
  inquest:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install Inquest
        run: npm install -g inquest

      - name: Run Interview
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
        run: |
          inquest interview \
            --ci \
            --baseline-file ./baseline.json \
            --fail-on-drift \
            npx your-mcp-server
```

### PR Checks with Security

```yaml
name: PR Security Check
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
          npx inquest interview \
            --ci \
            --persona security_tester \
            --fail-on-security \
            --output sarif \
            -o ./security \
            npx your-mcp-server

      - uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: ./security/inquest.sarif
```

### Scheduled Drift Detection

```yaml
name: Weekly Drift Check
on:
  schedule:
    - cron: '0 0 * * 0'

jobs:
  drift:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Check for Drift
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
        run: |
          npx inquest interview \
            --ci \
            --baseline-file ./baseline.json \
            --fail-on-drift \
            --persona technical_writer,security_tester \
            npx your-mcp-server

      - name: Create Issue on Drift
        if: failure()
        uses: actions/github-script@v7
        with:
          script: |
            github.rest.issues.create({
              owner: context.repo.owner,
              repo: context.repo.repo,
              title: 'MCP Server Behavioral Drift Detected',
              body: 'Weekly drift check detected changes. Review the workflow run.'
            })
```

## GitLab CI Examples

### Basic Configuration

```yaml
stages:
  - test

inquest:
  stage: test
  image: node:20
  script:
    - npm install -g inquest
    - |
      inquest interview \
        --ci \
        --baseline-file ./baseline.json \
        --fail-on-drift \
        npx your-mcp-server
  artifacts:
    paths:
      - AGENTS.md
    reports:
      junit: junit.xml
```

### Multi-Stage Pipeline

```yaml
stages:
  - test
  - security
  - report

variables:
  INQUEST_BASELINE: ./baseline.json

behavioral-test:
  stage: test
  script:
    - npx inquest interview --ci --baseline-file $INQUEST_BASELINE npx your-server

security-audit:
  stage: security
  script:
    - npx inquest interview --ci --persona security_tester --fail-on-security npx your-server
  allow_failure: false

generate-docs:
  stage: report
  script:
    - npx inquest interview -o ./docs npx your-server
  artifacts:
    paths:
      - docs/
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | OpenAI API key |
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `OLLAMA_BASE_URL` | Ollama server URL (default: http://localhost:11434) |
| `INQUEST_LOG_LEVEL` | Log level (debug, info, warn, error) |
| `CI` | Detected automatically in CI environments |

## Best Practices

### 1. Baseline Management

- Commit baselines to version control
- Update baselines only on main/master branch
- Review baseline diffs in PRs

### 2. Persona Selection

- Use `technical_writer` for documentation quality
- Use `security_tester` for security gates
- Use multiple personas for comprehensive coverage

### 3. Performance

- Cache npm dependencies
- Use `--max-questions 2` for faster CI runs
- Run full interviews nightly, quick checks on PRs

### 4. Secrets Management

- Store API keys in CI secrets
- Never commit API keys
- Use environment variable references in configs

### 5. Artifact Collection

- Always collect AGENTS.md as artifact
- Upload SARIF to security dashboards
- Archive JSON reports for debugging

## Troubleshooting

### Common Issues

**Exit Code 2 - Interview Failed**
- Check API key is set correctly
- Verify MCP server starts successfully
- Check network connectivity

**Exit Code 1 - Drift Detected**
- Review the diff output
- Update baseline if changes are expected
- Investigate unexpected behavioral changes

**Timeout Errors**
- Increase `--timeout` for slow tools
- Check MCP server responsiveness
- Consider tool-specific timeouts

### Debug Mode

Enable verbose logging for troubleshooting:

```bash
inquest interview \
  --ci \
  --log-level debug \
  --log-file ./inquest-debug.log \
  npx your-mcp-server
```

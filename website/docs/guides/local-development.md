---
title: Local Development
sidebar_position: 1
---

# Local Development Workflow

Bellwether is designed to integrate seamlessly into your local MCP server development workflow. Test your server during development, catch behavioral drift before deployment, and maintain documentation as your server evolves.

## Why Test Locally?

| Approach | Pros | Cons |
|:---------|:-----|:-----|
| **Test locally** | Catch drift before deployment, faster iteration, no deployment costs | Requires local setup |
| **Wait for production** | Always tests "real" environment | Drift reaches production first, slower feedback |

Testing locally allows you to:

- **Shift-left testing** - Catch behavioral regressions before they're deployed
- **Fast iteration** - No waiting for deployments between tests
- **CI/CD integration** - Gate deployments on drift detection
- **Free testing** - Use Ollama for completely free local LLM inference

## Running Against Local Servers

### Stdio Transport (Default)

The most common way to test locally is using stdio transport, where Bellwether spawns your server as a subprocess:

```bash
# Node.js server
bellwether interview node ./src/mcp-server.js

# Python server
bellwether interview python ./mcp_server.py

# TypeScript (via ts-node or tsx)
bellwether interview npx tsx ./src/server.ts

# Any executable
bellwether interview ./my-server-binary --config ./config.json
```

Bellwether communicates with your server via stdin/stdout using JSON-RPC 2.0.

### Localhost HTTP Servers

If your server runs as an HTTP service locally:

```bash
# SSE transport
bellwether interview --transport sse --url http://localhost:3000/mcp npx placeholder

# Streamable HTTP transport
bellwether interview --transport streamable-http --url http://localhost:8000/mcp npx placeholder
```

## Development Workflow

### 1. Create Initial Baseline

After your server is working, create a baseline to track future changes:

```bash
bellwether interview --save-baseline node ./src/mcp-server.js
```

This saves `bellwether-baseline.json` with:
- Tool signatures and schemas
- Observed behavior documentation
- Security findings
- Performance metrics

### 2. Develop with Watch Mode

Run watch mode in a terminal while developing:

```bash
bellwether watch node ./src/mcp-server.js --watch-path ./src
```

Watch mode:
- Runs an initial interview on startup
- Monitors `./src` for file changes
- Re-interviews when files change
- Shows diffs from previous interview

Example output:
```
[watch] Initial interview starting...
[watch] Interview complete. Watching ./src for changes...

[watch] File changed: src/tools/read.ts
[watch] Re-running interview...

Changes detected:
  + read_file now handles symlinks
  ~ error message format changed for ENOENT

[watch] Interview complete. Watching for changes...
```

### 3. Compare Against Baseline

Before committing, verify your changes against the baseline:

```bash
bellwether interview --compare-baseline ./bellwether-baseline.json node ./src/mcp-server.js
```

This shows:
- **Breaking changes** - Schema changes, removed tools
- **Warnings** - Behavioral changes to investigate
- **Info** - Documentation-only changes

### 4. Update Baseline for Intentional Changes

When changes are intentional (new features, bug fixes):

```bash
# Review the changes
bellwether interview --compare-baseline ./baseline.json node ./src/mcp-server.js

# Update baseline if changes are correct
bellwether interview --save-baseline node ./src/mcp-server.js

# Commit updated baseline
git add bellwether-baseline.json AGENTS.md
git commit -m "Update baseline: added symlink support"
```

## Using Ollama for Free Local Testing

For completely free testing during development, use Ollama:

```bash
# Install Ollama (macOS)
brew install ollama

# Start Ollama server
ollama serve

# Pull a model
ollama pull llama3.2

# Bellwether auto-detects Ollama when no API keys are set
bellwether interview node ./src/mcp-server.js
```

Or configure in `bellwether.yaml`:

```yaml
version: 1
llm:
  provider: ollama
  model: llama3.2
  baseUrl: http://localhost:11434
```

## Custom Test Scenarios

For deterministic testing without LLM costs, define custom scenarios:

```bash
# Generate sample scenarios file
bellwether interview --init-scenarios
```

Edit `bellwether-tests.yaml`:

```yaml
version: 1
tools:
  - name: read_file
    scenarios:
      - name: "Read existing file"
        input:
          path: "/tmp/test.txt"
        assertions:
          - path: "content[0].text"
            condition: "contains"
            expected: "file contents"

      - name: "Read missing file"
        input:
          path: "/nonexistent"
        assertions:
          - path: "isError"
            condition: "equals"
            expected: true
```

Run scenarios without LLM:

```bash
# Run only custom scenarios (fast, no API costs)
bellwether interview --scenarios-only node ./src/mcp-server.js
```

## CI/CD Integration

Add drift detection to your CI pipeline:

```bash
# In CI - fail if drift detected
bellwether interview \
  --preset ci \
  --compare-baseline ./bellwether-baseline.json \
  --fail-on-drift \
  node ./src/mcp-server.js
```

Example GitHub Actions workflow:

```yaml
name: MCP Server Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Install Bellwether
        run: npm install -g @dotsetlabs/bellwether

      - name: Check for drift
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
        run: |
          bellwether interview \
            --preset ci \
            --compare-baseline ./bellwether-baseline.json \
            --fail-on-drift \
            node ./src/mcp-server.js
```

## Quick Mode for Fast Feedback

During active development, use quick mode for faster feedback:

```bash
# Quick interview with minimal questions
bellwether interview --preset ci node ./src/mcp-server.js

# Or explicitly set low question count
bellwether interview --max-questions 2 node ./src/mcp-server.js
```

## Environment Variables

Bellwether filters sensitive environment variables before spawning your server to prevent credential leaks. Variables matching these patterns are removed:

- `*_API_KEY`, `*_SECRET`, `*_TOKEN`, `*_PASSWORD`
- `AWS_*`, `AZURE_*`, `GCP_*`
- `OPENAI_*`, `ANTHROPIC_*`

Your server receives a clean environment without these sensitive values.

## Troubleshooting

### Server Startup Issues

If your server takes time to start (common with `npx`):

```bash
# Increase startup timeout
bellwether interview --timeout 60000 npx your-server
```

### Server Crashes

Check the interview output for error details:

```bash
# Enable debug mode for verbose output
bellwether interview --debug node ./src/mcp-server.js
```

### Watch Mode Not Detecting Changes

Ensure you're watching the right directory:

```bash
# Watch a specific directory
bellwether watch node ./src/mcp-server.js --watch-path ./src

# Adjust polling interval if changes aren't detected
bellwether watch node ./src/mcp-server.js --interval 2000
```

## See Also

- [watch](/cli/watch) - Watch mode CLI reference
- [interview](/cli/interview) - Interview CLI reference
- [Drift Detection](/concepts/drift-detection) - Understanding drift detection
- [Custom Scenarios](/guides/custom-scenarios) - Deterministic testing
- [CI/CD Integration](/guides/ci-cd) - Pipeline setup

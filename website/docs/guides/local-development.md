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
- **Free testing** - Use check mode or Ollama for completely free testing

## Quick Start

```bash
# 1. Initialize configuration
bellwether init "node ./src/mcp-server.js"

# 2. Run test
bellwether check

# 3. Save baseline
bellwether baseline save

# 4. Watch for changes (uses watch settings from bellwether.yaml)
bellwether watch
```

## Running Against Local Servers

### Stdio Transport (Default)

The most common way to test locally is using stdio transport, where Bellwether spawns your server as a subprocess:

```bash
# Node.js server
bellwether init "node ./src/mcp-server.js"
bellwether check

# Python server
bellwether init "python ./mcp_server.py"
bellwether check

# TypeScript (via ts-node or tsx)
bellwether init "npx tsx ./src/server.ts"
bellwether check

# Any executable
bellwether init "./my-server-binary --config ./config.json"
bellwether check
```

Bellwether communicates with your server via stdin/stdout using JSON-RPC 2.0.

### Localhost HTTP Servers

If your server runs as an HTTP service locally, configure the server transport in `bellwether.yaml`:

```yaml
server:
  transport: sse
  url: http://localhost:3000/mcp
```

Or for streamable HTTP:

```yaml
server:
  transport: streamable-http
  url: http://localhost:8000/mcp
  # sessionId: "your-auth-token"
```

## Development Workflow

### 1. Initialize Configuration

First, create your configuration file:

```bash
# Default check mode (free, fast)
bellwether init "node ./src/mcp-server.js"

# Or explore mode with Ollama (free)
bellwether init --preset local "node ./src/mcp-server.js"
```

### 2. Create Initial Baseline

After your server is working, create a baseline to track future changes:

```bash
# Run test first
bellwether check

# Save baseline
bellwether baseline save
```

This saves `bellwether-baseline.json` with:
- Tool signatures and schemas
- Observed behavior documentation
- Security findings
- Performance metrics

### 3. Develop with Watch Mode

Run watch mode in a terminal while developing:

```bash
bellwether watch
```

Configure watch settings in `bellwether.yaml`:

```yaml
watch:
  path: "./src"
  interval: 5000
  extensions: [".ts", ".js", ".json"]
```

Watch mode:
- Runs an initial test on startup
- Monitors `./src` for file changes
- Re-tests when files change
- Shows diffs from previous test

Example output:
```
[watch] Initial test starting...
[watch] Test complete. Watching ./src for changes...

[watch] File changed: src/tools/read.ts
[watch] Re-running test...

Changes detected:
  + read_file now handles symlinks
  ~ error message format changed for ENOENT

[watch] Test complete. Watching for changes...
```

### 4. Compare Against Baseline

Before committing, verify your changes against the baseline:

```bash
bellwether check
bellwether baseline compare ./bellwether-baseline.json
```

This shows:
- **Breaking changes** - Schema changes, removed tools
- **Warnings** - Behavioral changes to investigate
- **Info** - Documentation-only changes

### 5. Update Baseline for Intentional Changes

When changes are intentional (new features, bug fixes):

```bash
# Review the changes
bellwether check
bellwether baseline compare ./bellwether-baseline.json

# Update baseline if changes are correct
bellwether baseline save --force

# Commit updated baseline
git add bellwether-baseline.json AGENTS.md
git commit -m "Update baseline: added symlink support"
```

## Using Ollama for Free Local Testing

For completely free LLM-powered testing during development, use Ollama:

```bash
# Install Ollama (macOS)
brew install ollama

# Start Ollama server
ollama serve

# Pull a model
ollama pull qwen3:8b

# Initialize with local preset
bellwether init --preset local "node ./src/mcp-server.js"

# Run test (free!)
bellwether check
```

The generated `bellwether.yaml` will be configured for Ollama:

```yaml
llm:
  provider: ollama
  model: ""  # Uses qwen3:8b by default
  ollama:
    baseUrl: "http://localhost:11434"
```

## Custom Test Scenarios

For deterministic testing without LLM costs, define custom scenarios in `bellwether-tests.yaml`:

```yaml
version: "1"
description: Custom test scenarios

scenarios:
  - tool: read_file
    description: "Read existing file"
    category: happy_path
    args:
      path: "/tmp/test.txt"
    assertions:
      - path: content
        condition: exists

  - tool: read_file
    description: "Read missing file"
    category: error_handling
    args:
      path: "/nonexistent"
    assertions:
      - path: error
        condition: exists
```

Configure in `bellwether.yaml` to use scenarios only:

```yaml
scenarios:
  path: "./bellwether-tests.yaml"
  only: true  # Skip LLM tests, run only scenarios
```

Then run:

```bash
bellwether check
```

## CI/CD Integration

Add drift detection to your CI pipeline:

```yaml
# .github/workflows/bellwether.yml
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

      - name: Run Bellwether Test
        run: npx @dotsetlabs/bellwether check

      - name: Check for Drift
        run: npx @dotsetlabs/bellwether baseline compare ./bellwether-baseline.json --fail-on-drift
```

## Two Commands

Choose the right command for your workflow:

### Check Command (Default)

- **Cost**: Free
- **Speed**: Fast (seconds)
- **Use case**: CI/CD, quick checks, schema verification, drift detection

```bash
bellwether check "node ./src/mcp-server.js"  # Free, deterministic
```

### Explore Command

- **Cost**: Free with Ollama, ~$0.01-0.15 with API
- **Speed**: Slower (minutes)
- **Use case**: Deep exploration, documentation generation, security audits

```bash
bellwether init --preset local "node ./src/mcp-server.js"   # Free with Ollama
bellwether explore  # Generates AGENTS.md documentation
```

## Environment Variables

Bellwether filters sensitive environment variables before spawning your server to prevent credential leaks. Variables matching these patterns are removed:

- `*_API_KEY`, `*_SECRET`, `*_TOKEN`, `*_PASSWORD`
- `AWS_*`, `AZURE_*`, `GCP_*`
- `OPENAI_*`, `ANTHROPIC_*`

Your server receives a clean environment without these sensitive values.

## Troubleshooting

### Server Startup Issues

If your server takes time to start (common with `npx`), increase timeout in config:

```yaml
server:
  command: "npx your-server"
  timeout: 60000  # 60 seconds
```

### Server Crashes

Check the test output for error details. Enable debug logging:

```yaml
logging:
  level: debug
  verbose: true
```

### Watch Mode Not Detecting Changes

Ensure you've configured the right directory in `bellwether.yaml`:

```yaml
watch:
  path: "./src"  # Directory to watch
  extensions:
    - ".ts"
    - ".js"
    - ".json"
```

## See Also

- [watch](/cli/watch) - Watch mode CLI reference
- [check](/cli/check) - Test CLI reference
- [baseline](/cli/baseline) - Baseline management
- [Drift Detection](/concepts/drift-detection) - Understanding drift detection
- [Custom Scenarios](/guides/custom-scenarios) - Deterministic testing
- [CI/CD Integration](/guides/ci-cd) - Pipeline setup

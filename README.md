# Bellwether

[![Build Status](https://github.com/dotsetlabs/bellwether/actions/workflows/ci.yml/badge.svg)](https://github.com/dotsetlabs/bellwether/actions)
[![npm version](https://img.shields.io/npm/v/@dotsetlabs/bellwether)](https://www.npmjs.com/package/@dotsetlabs/bellwether)
[![Documentation](https://img.shields.io/badge/docs-docs.bellwether.sh-blue)](https://docs.bellwether.sh)

> **Catch MCP server drift before your users do. Zero LLM required.**

Bellwether detects behavioral changes in your [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) server using **structural comparison**. No LLM needed. Free. Deterministic.

## Quick Start

```bash
# Install
npm install -g @dotsetlabs/bellwether

# Initialize configuration
bellwether init

# Run tests
bellwether test npx @mcp/your-server

# Save baseline for drift detection
bellwether baseline save
```

That's it. No API keys. No LLM costs. Deterministic results.

## CI/CD Integration

Add drift detection to every PR:

```yaml
# .github/workflows/bellwether.yml
name: MCP Drift Detection
on: [pull_request]

jobs:
  bellwether:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npx @dotsetlabs/bellwether test npx @mcp/your-server
      - run: npx @dotsetlabs/bellwether baseline compare ./bellwether-baseline.json --fail-on-drift
```

No secrets needed. Free. Runs in seconds.

## What Bellwether Detects

Structural mode detects when your MCP server changes:

| Change Type | Example | Detected |
|:------------|:--------|:---------|
| **Tool added** | New `delete_file` tool appears | Yes |
| **Tool removed** | `write_file` tool disappears | Yes |
| **Schema changed** | Parameter `path` becomes required | Yes |
| **Description changed** | Tool help text updated | Yes |
| **Tool renamed** | `read` becomes `read_file` | Yes |

This catches the changes that break AI agent workflows.

## Documentation

**[docs.bellwether.sh](https://docs.bellwether.sh)** - Full documentation including:

- [Quick Start](https://docs.bellwether.sh/quickstart)
- [CLI Reference](https://docs.bellwether.sh/cli/test)
- [CI/CD Integration](https://docs.bellwether.sh/guides/ci-cd)
- [Custom Scenarios](https://docs.bellwether.sh/guides/custom-scenarios)

## Configuration

All settings are configured in `bellwether.yaml`. Create one with:

```bash
bellwether init                    # Default structural mode (free, fast)
bellwether init --preset ci        # Optimized for CI/CD
bellwether init --preset security  # Security-focused testing
bellwether init --preset thorough  # Comprehensive testing
bellwether init --preset local     # Full mode with local Ollama
```

The generated config file is fully documented with all available options.

## Modes

### Structural Mode (Default, Recommended for CI)

```bash
bellwether init           # Creates bellwether.yaml with mode: structural
bellwether test npx @mcp/your-server
```

- **Zero LLM** - No API keys required
- **Free** - No token costs
- **Deterministic** - Same input = same output
- **Fast** - Runs in seconds

### Full Mode (Optional)

```bash
bellwether init --preset local     # Uses local Ollama (free)
# or
bellwether init --preset thorough  # Uses OpenAI (requires API key)

bellwether test npx @mcp/your-server
```

- Requires LLM (Ollama for free local, or OpenAI/Anthropic)
- Multi-persona testing (technical writer, security tester, QA, novice)
- Generates AGENTS.md documentation
- Better for local development and deep exploration

## Commands

### Core Commands

```bash
# Initialize configuration (creates bellwether.yaml)
bellwether init
bellwether init --preset ci

# Run tests using config settings
bellwether test npx @mcp/server
bellwether test                    # Uses server.command from config

# Discover server capabilities
bellwether discover npx @mcp/server
```

### Baseline Commands

```bash
# Save test results as baseline
bellwether baseline save
bellwether baseline save ./my-baseline.json

# Compare test results against baseline
bellwether baseline compare ./bellwether-baseline.json
bellwether baseline compare ./baseline.json --fail-on-drift

# Show baseline contents
bellwether baseline show
bellwether baseline show ./baseline.json --json

# Compare two baseline files
bellwether baseline diff v1.json v2.json
```

### Other Commands

```bash
# Watch mode (re-test on file changes)
bellwether watch npx @mcp/server

# Manage API keys securely
bellwether auth

# Upload baseline to Bellwether Cloud
bellwether upload
```

## Custom Test Scenarios

Define deterministic tests in `bellwether-tests.yaml`:

```yaml
version: "1"
scenarios:
  - tool: get_weather
    args:
      location: "San Francisco"
    assertions:
      - path: "content[0].text"
        condition: "contains"
        value: "temperature"
```

Reference in your config:

```yaml
# bellwether.yaml
scenarios:
  path: "./bellwether-tests.yaml"
  only: true  # Run only scenarios, no LLM tests
```

Then run:

```bash
bellwether test npx @mcp/server
```

## Presets

| Preset | Mode | Description |
|:-------|:-----|:------------|
| (default) | structural | Zero LLM, free, deterministic |
| `ci` | structural | Optimized for CI/CD, fails on drift |
| `security` | full | Security + technical personas, OpenAI |
| `thorough` | full | All 4 personas, workflow discovery |
| `local` | full | Local Ollama, free, private |

Use with: `bellwether init --preset <name>`

## GitHub Action

```yaml
- name: Detect Behavioral Drift
  uses: dotsetlabs/bellwether/action@v1
  with:
    server-command: 'npx @mcp/your-server'
    baseline-path: './bellwether-baseline.json'
    fail-on-drift: 'true'
```

See [action/README.md](./action/README.md) for full documentation.

## Development

```bash
git clone https://github.com/dotsetlabs/bellwether
cd bellwether/cli
npm install
npm run build
npm test

# Run locally
./dist/cli/index.js test npx @mcp/server
```

## License

MIT License - see [LICENSE](./LICENSE) for details.

---

<p align="center">
  Built by <a href="https://dotsetlabs.com">Dotset Labs LLC</a>
</p>

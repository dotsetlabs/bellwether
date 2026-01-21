# Bellwether

[![Build Status](https://github.com/dotsetlabs/bellwether/actions/workflows/ci.yml/badge.svg)](https://github.com/dotsetlabs/bellwether/actions)
[![npm version](https://img.shields.io/npm/v/@dotsetlabs/bellwether)](https://www.npmjs.com/package/@dotsetlabs/bellwether)
[![Documentation](https://img.shields.io/badge/docs-docs.bellwether.sh-blue)](https://docs.bellwether.sh)

> **Catch MCP server drift before your users do. Zero LLM required.**

Bellwether detects behavioral changes in your [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) server using **contract comparison**. No LLM needed. Free. Deterministic.

## Quick Start

```bash
# Install
npm install -g @dotsetlabs/bellwether

# Initialize configuration
bellwether init npx @mcp/your-server

# Check for drift (free, fast, deterministic)
bellwether check

# Save baseline for drift detection
bellwether baseline save

# Optional: Explore behavior with LLM
bellwether explore
```

That's it. No API keys needed for check. No LLM costs. Deterministic results.

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
      - run: npx @dotsetlabs/bellwether check --baseline ./bellwether-baseline.json --fail-on-drift
```

No secrets needed. Free. Runs in seconds.

## What Bellwether Detects

Contract mode detects when your MCP server changes:

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
- [CLI Reference](https://docs.bellwether.sh/cli/init)
- [Test Modes](https://docs.bellwether.sh/concepts/test-modes)
- [CI/CD Integration](https://docs.bellwether.sh/guides/ci-cd)
- [Cloud Features](https://docs.bellwether.sh/cloud)

## Configuration

All settings are configured in `bellwether.yaml`. Create one with:

```bash
bellwether init npx @mcp/your-server           # Default (free, fast)
bellwether init --preset ci npx @mcp/server    # Optimized for CI/CD
bellwether init --preset security npx @mcp/server  # Security-focused exploration
bellwether init --preset thorough npx @mcp/server  # Comprehensive exploration
bellwether init --preset local npx @mcp/server # Exploration with local Ollama
```

The generated config file is fully documented with all available options.

### Environment Variable Interpolation

Reference environment variables in your config:

```yaml
server:
  command: "npx @mcp/your-server"
  env:
    API_KEY: "${API_KEY}"
    DEBUG: "${DEBUG:-false}"  # With default value
```

This allows committing `bellwether.yaml` to version control without exposing secrets.

## Commands

### Check Command (Recommended for CI)

```bash
bellwether init npx @mcp/your-server
bellwether check
```

- **Zero LLM** - No API keys required
- **Free** - No token costs
- **Deterministic** - Same input = same output
- **Fast** - Runs in seconds
- **Output** - Generates `CONTRACT.md` and baselines

### Explore Command (Optional)

```bash
bellwether init --preset local npx @mcp/your-server  # Uses local Ollama (free)
# or
bellwether init --preset thorough npx @mcp/server    # Uses OpenAI (requires API key)

bellwether explore
```

- Requires LLM (Ollama for free local, or OpenAI/Anthropic)
- Multi-persona testing (technical writer, security tester, QA, novice)
- Generates `AGENTS.md` documentation
- Better for local development and deep exploration

### Core Commands

```bash
# Initialize configuration (creates bellwether.yaml)
bellwether init npx @mcp/server
bellwether init --preset ci npx @mcp/server

# Check for drift (free, fast, deterministic)
bellwether check                   # Uses server.command from config
bellwether check npx @mcp/server   # Override server command
bellwether check --save-baseline   # Save baseline after check

# Explore behavior (LLM-powered)
bellwether explore                 # Uses server.command from config
bellwether explore npx @mcp/server # Override server command

# Discover server capabilities
bellwether discover npx @mcp/server

# Watch mode (re-check on file changes)
bellwether watch --watch-path ./src

# Search MCP Registry
bellwether registry filesystem
bellwether registry database --limit 5

# Generate verification report
bellwether verify npx @mcp/server --tier gold
```

### Baseline Commands

```bash
# Save test results as baseline
bellwether baseline save
bellwether baseline save ./my-baseline.json

# Compare test results against baseline
bellwether baseline compare ./bellwether-baseline.json
bellwether baseline compare ./baseline.json --fail-on-drift
bellwether baseline compare ./baseline.json --ignore-version-mismatch  # Force compare incompatible versions

# Show baseline contents
bellwether baseline show
bellwether baseline show ./baseline.json --json

# Compare two baseline files
bellwether baseline diff v1.json v2.json
bellwether baseline diff v1.json v2.json --ignore-version-mismatch  # Force compare incompatible versions

# Migrate baseline to current format version
bellwether baseline migrate ./bellwether-baseline.json
bellwether baseline migrate ./baseline.json --dry-run
bellwether baseline migrate ./baseline.json --info
```

### Baseline Format Versioning

Baselines use semantic versioning (e.g., `1.0.0`) for the format version:

- **Major version** - Breaking contract changes (removed fields, type changes)
- **Minor version** - New optional fields (backwards compatible)
- **Patch version** - Bug fixes in baseline generation

**Compatibility rules:**
- Same major version = Compatible (can compare baselines)
- Different major version = Incompatible (requires migration)

When comparing baselines with incompatible versions, the CLI will show an error:

```
Cannot compare baselines with incompatible format versions: v1.0.0 vs v2.0.0.
Use 'bellwether baseline migrate' to upgrade the older baseline,
or use --ignore-version-mismatch to force comparison (results may be incorrect).
```

To upgrade older baselines:

```bash
# Check if migration is needed
bellwether baseline migrate ./baseline.json --info

# Preview changes without writing
bellwether baseline migrate ./baseline.json --dry-run

# Perform migration
bellwether baseline migrate ./baseline.json
```

### Cloud Commands

```bash
# Authenticate with Bellwether Cloud
bellwether login
bellwether login --status
bellwether login --logout

# Manage team selection (for multi-team users)
bellwether teams              # List your teams
bellwether teams switch       # Interactive team selection
bellwether teams switch <id>  # Switch to specific team
bellwether teams current      # Show current active team

# Link project to cloud
bellwether link
bellwether link --status
bellwether link --unlink

# List cloud projects
bellwether projects
bellwether projects --json

# Upload baseline to cloud
bellwether upload
bellwether upload --ci --fail-on-drift

# View baseline version history
bellwether history
bellwether history --limit 20

# Compare cloud baseline versions
bellwether diff 1 2

# Get verification badge
bellwether badge --markdown
```

### Auth Commands

```bash
# Manage LLM API keys (stored in system keychain)
bellwether auth
bellwether auth status
bellwether auth clear
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
bellwether check   # Run scenarios as part of check
bellwether explore # Run scenarios as part of explore
```

## Presets

| Preset | Optimized For | Description |
|:-------|:--------------|:------------|
| (default) | check | Zero LLM, free, deterministic |
| `ci` | check | Optimized for CI/CD, fails on drift |
| `security` | explore | Security + technical personas, OpenAI |
| `thorough` | explore | All 4 personas, workflow discovery |
| `local` | explore | Local Ollama, free, private |

Use with: `bellwether init --preset <name> npx @mcp/server`

## GitHub Action

```yaml
- name: Detect Behavioral Drift
  uses: dotsetlabs/bellwether@v1
  with:
    server-command: 'npx @mcp/your-server'
    baseline-path: './bellwether-baseline.json'
    fail-on-drift: 'true'
```

See [action/README.md](./action/README.md) for full documentation.

## Environment Variables

| Variable | Description |
|:---------|:------------|
| `OPENAI_API_KEY` | OpenAI API key (explore command) |
| `ANTHROPIC_API_KEY` | Anthropic API key (explore command) |
| `OLLAMA_BASE_URL` | Ollama server URL (default: `http://localhost:11434`) |
| `BELLWETHER_SESSION` | Cloud session token for CI/CD |
| `BELLWETHER_API_URL` | Cloud API URL (default: `https://api.bellwether.sh`) |
| `BELLWETHER_TEAM_ID` | Override active team for cloud operations (multi-team CI/CD) |

See [.env.example](./.env.example) for full documentation.

## Development

```bash
git clone https://github.com/dotsetlabs/bellwether
cd bellwether/cli
npm install
npm run build
npm test

# Run locally
./dist/cli/index.js check npx @mcp/server
./dist/cli/index.js explore npx @mcp/server
```

## License

MIT License - see [LICENSE](./LICENSE) for details.

---

<p align="center">
  Built by <a href="https://dotsetlabs.com">Dotset Labs LLC</a>
</p>

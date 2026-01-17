# Bellwether

[![Build Status](https://github.com/dotsetlabs/bellwether/actions/workflows/ci.yml/badge.svg)](https://github.com/dotsetlabs/bellwether/actions)
[![npm version](https://img.shields.io/npm/v/@dotsetlabs/bellwether)](https://www.npmjs.com/package/@dotsetlabs/bellwether)
[![Documentation](https://img.shields.io/badge/docs-docs.bellwether.sh-blue)](https://docs.bellwether.sh)

> **Test your MCP servers. Catch drift. Get documentation for free.**

<details>
<summary><strong>New to MCP?</strong> Click to learn what Model Context Protocol is.</summary>

[Model Context Protocol (MCP)](https://modelcontextprotocol.io) is an open standard for connecting AI assistants (Claude, GPT, Cursor) to external tools and data sources.

If you're building capabilities for AI agents—file access, database queries, API integrations—you're likely building an MCP server.

Bellwether detects behavioral drift in your MCP server before it breaks your users' workflows.

</details>

Bellwether is a CLI tool for **behavioral drift detection** in [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) servers. It **interviews** your server from 4 different personas, catches regressions before deployment, and generates AGENTS.md documentation as a byproduct:

1. **Discovering** available tools, prompts, and resources
2. **Testing from 4 personas** - Technical writer, security tester, QA engineer, novice user
3. **Detecting behavioral drift** between baseline and current behavior
4. **Generating documentation** - AGENTS.md reflects what your server actually does

## Documentation

**[docs.bellwether.sh](https://docs.bellwether.sh)** - Full documentation including:

- [Quick Start](https://docs.bellwether.sh/quickstart) - Get started in 5 minutes
- [Installation](https://docs.bellwether.sh/installation) - System requirements and setup
- [CLI Reference](https://docs.bellwether.sh/cli/interview) - Complete command documentation
- [CI/CD Integration](https://docs.bellwether.sh/guides/ci-cd) - GitHub Actions, GitLab CI
- [Custom Scenarios](https://docs.bellwether.sh/guides/custom-scenarios) - YAML test definitions
- [Remote Servers](https://docs.bellwether.sh/guides/remote-servers) - SSE and HTTP transports
- [Personas](https://docs.bellwether.sh/concepts/personas) - Understanding testing personas
- [Drift Detection](https://docs.bellwether.sh/concepts/drift-detection) - Catching behavioral changes
- [Cloud Integration](https://docs.bellwether.sh/guides/cloud-integration) - Team features and baseline history

## Quick Start

```bash
# Install
npm install -g @dotsetlabs/bellwether

# Set your API key (interactive setup - stores in system keychain)
bellwether auth
# Or: export OPENAI_API_KEY=sk-xxx

# Interview an MCP server
bellwether interview npx @modelcontextprotocol/server-filesystem /tmp

# Output: AGENTS.md with behavioral documentation
```

## Why Bellwether?

| Problem | Solution |
|:--------|:---------|
| Breaking changes slip into production unnoticed | **Behavioral drift detection** - Compare baselines to catch regressions before deployment |
| Manual testing misses edge cases | **4-persona testing** - The only tool that tests from technical writer, security tester, QA engineer, and novice user perspectives |
| Security vulnerabilities are hard to discover | **Security persona** - Dedicated adversarial testing catches path traversal, injection, and info disclosure |
| Documentation gets stale | **Free documentation** - AGENTS.md is generated automatically from test results |

### What Makes Bellwether Different

| Feature | Bellwether | Other MCP Tools |
|:--------|:-----------|:----------------|
| **Behavioral drift detection** | ✅ Semantic comparison | ❌ Schema-only or none |
| **Multi-persona testing** | ✅ 4 unique perspectives | ❌ Single perspective |
| **Documentation generation** | ✅ AGENTS.md included | ❌ Not available |
| **CI/CD integration** | ✅ GitHub Action | ⚠️ Limited |

Bellwether complements your existing tests—it doesn't replace them.

## Features

### Core Features
- **Behavioral Drift Detection** - Compare baselines to catch regressions before deployment (not just schema changes)
- **4-Persona Testing** - Technical writer, security tester, QA engineer, novice user—the only MCP tool with multi-perspective testing
- **Free Documentation** - AGENTS.md generated automatically from test results
- **Security Hygiene** - Dedicated security persona catches common vulnerabilities without replacing professional audits
- **Multi-Provider LLM** - OpenAI, Anthropic Claude, or Ollama (local/free)
- **Performance Metrics** - Response times (avg/p50/p95/max) and error rates
- **Secure Credential Storage** - System keychain integration for API keys

### Server Support
- **Local Servers** - Stdio transport for local MCP servers
- **Remote Servers** - SSE and Streamable HTTP transports
- **Resource Testing** - Discover and test MCP resources (data sources)

### Testing
- **Custom Test Scenarios** - Define YAML test cases with assertions
- **Scenarios-Only Mode** - Run tests without LLM (free, deterministic)
- **Workflow Testing** - Multi-step tool sequences with state tracking
- **Parallel Execution** - Run persona interviews concurrently (`--parallel-personas`)

### Performance & Cost Control
- **Response Caching** - Avoid redundant tool calls and LLM analysis (`--cache`)
- **Streaming Output** - Real-time LLM responses (`--stream`)
- **Token Budgets** - Prevent runaway costs (`--max-tokens`)
- **Automatic Fallback** - Falls back to Ollama if primary LLM fails (`--fallback`)

### Ecosystem
- **GitHub Action** - One-line CI/CD integration for automated regression testing
- **Cloud Sync** - Optional baseline history and team collaboration
- **MCP Registry Search** - Discover servers from the official registry
- **Verification Badges** - Earn Bronze to Platinum coverage badges

## Commands

### Core Commands

```bash
# Test server and generate documentation
bellwether interview npx @mcp/server-filesystem /tmp

# Save baseline for future drift detection
bellwether interview --save-baseline npx @mcp/server

# Detect behavioral drift (CI mode)
bellwether interview --compare-baseline ./baseline.json --fail-on-drift npx @mcp/server

# Quick test (fast, cheap - good for PRs)
bellwether interview --quick npx @mcp/server

# Watch for changes and auto-test
bellwether watch npx @mcp/server

# Discover tools/prompts/resources without full interview
bellwether discover npx @mcp/server

# Initialize configuration file (bellwether.yaml)
bellwether init

# Manage API keys (stores in system keychain)
bellwether auth

# Manage interview profiles
bellwether profile list
bellwether profile create my-profile
```

### Verification & Registry

```bash
# Generate verification report for certification
bellwether verify npx @mcp/server

# Get embeddable verification badge
bellwether badge my-project

# Search the MCP Registry for servers
bellwether registry filesystem
```

### Cloud Commands

```bash
# Authenticate with Bellwether Cloud
bellwether login

# Link local project to cloud project
bellwether link

# List your cloud projects
bellwether projects

# Upload baseline to cloud
bellwether upload

# View baseline version history
bellwether history

# Compare two baseline versions
bellwether diff v1 v2
```

## Cost

Bellwether uses LLMs for intelligent testing. Typical costs per interview:

| Mode | Model | Cost | Use Case |
|:-----|:------|:-----|:---------|
| `--quick` | gpt-5-mini | ~$0.01 | PR checks |
| Default | gpt-5-mini | ~$0.02 | CI/CD |
| `--preset thorough` | gpt-5.2 | ~$0.12 | Releases |
| Ollama | Local | Free | Development |

## GitHub Action

```yaml
# .github/workflows/bellwether.yml
name: MCP Drift Detection
on: [push, pull_request]

jobs:
  bellwether:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Detect Behavioral Drift
        uses: dotsetlabs/bellwether/action@v1
        with:
          server-command: 'npx @modelcontextprotocol/server-filesystem'
          server-args: '/tmp'
          baseline-path: './bellwether-baseline.json'
          fail-on-drift: 'true'
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

See [action/README.md](./action/README.md) for full documentation.

## Custom Test Scenarios

Define deterministic tests in `bellwether-tests.yaml`:

```yaml
version: "1"
description: Custom test scenarios for my MCP server

scenarios:
  - tool: get_weather
    description: Valid location returns weather
    args:
      location: "San Francisco"
    assertions:
      - path: "content[0].text"
        condition: "contains"
        value: "temperature"

  - tool: get_weather
    description: Invalid location returns error
    category: error_handling
    args:
      location: ""
    assertions:
      - path: "isError"
        condition: "equals"
        value: true
```

Run with:
```bash
bellwether interview --scenarios ./bellwether-tests.yaml npx @mcp/server
bellwether interview --scenarios-only npx @mcp/server  # No LLM needed, uses bellwether-tests.yaml
```

## Workflow Testing

Test multi-step tool sequences with `bellwether-workflows.yaml`:

```yaml
version: "1"
description: Multi-step workflow tests

workflows:
  - name: file-operations
    description: Create, read, and clean up a file
    steps:
      - tool: write_file
        args:
          path: "/tmp/test.txt"
          content: "Hello World"
        expect:
          success: true

      - tool: read_file
        args:
          path: "/tmp/test.txt"
        expect:
          contains: "Hello World"

      - tool: delete_file
        args:
          path: "/tmp/test.txt"
        expect:
          success: true
```

Run workflows:
```bash
# Run user-defined workflows
bellwether interview --workflows ./bellwether-workflows.yaml npx @mcp/server

# Auto-discover workflows using LLM
bellwether interview --discover-workflows npx @mcp/server

# Enable state tracking for debugging
bellwether interview --workflows ./workflows.yaml --workflow-state-tracking npx @mcp/server

# Generate a sample workflow file
bellwether interview --init-workflows
```

## Verified by Bellwether

Get your MCP server verified and earn coverage badges:

```bash
bellwether verify --tier gold npx @mcp/your-server
```

### Verification Tiers

| Tier | Requirements | What it signals |
|:-----|:-------------|:----------------|
| 🥉 Bronze | Basic testing (happy path) | "This server has been behaviorally tested" |
| 🥈 Silver | + Error handling coverage | "This server handles errors gracefully" |
| 🥇 Gold | + All personas, good coverage | "This server is thoroughly tested" |
| 💎 Platinum | + Comprehensive testing, all personas | "This server has comprehensive behavioral coverage" |

**Note:** Verification badges indicate behavioral test coverage, not security certification. Badges show that a server has been systematically tested with Bellwether—a first line of defense, not a replacement for professional security audits.

## Development

```bash
git clone https://github.com/dotsetlabs/bellwether
cd bellwether
npm install
npm run build
npm test

# Run CLI locally (after build)
./dist/cli/index.js interview npx @mcp/server
# Or link globally for development
npm link
bellwether interview npx @mcp/server

# Watch mode for development
npm run dev  # Runs tsc --watch

# Documentation site
cd website
npm install
npm start  # http://localhost:3000
```

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## License

MIT License - see [LICENSE](./LICENSE) for details.

## Related Projects

- [Model Context Protocol](https://modelcontextprotocol.io/) - The protocol Bellwether tests
- [MCP Registry](https://registry.modelcontextprotocol.io/) - Official server registry
- [Bellwether Cloud](https://bellwether.sh) - Baseline history and team features

---

<p align="center">
  Built by <a href="https://dotsetlabs.com">Dotset Labs LLC</a>
</p>

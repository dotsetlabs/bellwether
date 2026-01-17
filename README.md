# Bellwether

[![Build Status](https://github.com/dotsetlabs/bellwether/actions/workflows/ci.yml/badge.svg)](https://github.com/dotsetlabs/bellwether/actions)
[![npm version](https://img.shields.io/npm/v/@dotsetlabs/bellwether)](https://www.npmjs.com/package/@dotsetlabs/bellwether)
[![Documentation](https://img.shields.io/badge/docs-docs.bellwether.sh-blue)](https://docs.bellwether.sh)

> Automated behavioral documentation and testing for MCP servers

<details>
<summary><strong>New to MCP?</strong> Click to learn what Model Context Protocol is.</summary>

[Model Context Protocol (MCP)](https://modelcontextprotocol.io) is an open standard for connecting AI assistants (Claude, GPT, Cursor) to external tools and data sources.

If you're building capabilities for AI agents—file access, database queries, API integrations—you're likely building an MCP server.

Bellwether interviews your MCP server to document what it *actually does*, catching behaviors that manual testing and static documentation miss.

</details>

Bellwether is a CLI tool that generates comprehensive behavioral documentation for [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) servers. Instead of relying on manually written docs, Bellwether **interviews** your MCP server by:

1. **Discovering** available tools, prompts, and resources
2. **Generating** realistic test scenarios using an LLM
3. **Executing** tests and analyzing actual responses
4. **Synthesizing** findings into actionable documentation

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
| Documentation says one thing, but what does the server actually do? | **Trust but verify** - Interview the server to document real behavior |
| Breaking changes slip into production unnoticed | **Drift detection** - Catch behavioral changes before they hit production |
| Security vulnerabilities are hard to discover manually | **Security hygiene checks** - Persona-based testing for common issues |
| Manual testing is slow and expensive | **CI/CD integration** - Automated regression testing |

### Bellwether vs. Traditional Testing

| Approach | What it catches | What it misses |
|:---------|:----------------|:---------------|
| **Unit tests** | Regressions in expected behavior | Behaviors you didn't think to test |
| **Integration tests** | System-level failures | Edge cases in tool interactions |
| **Manual testing** | Issues you look for | Issues you don't know to look for |
| **Bellwether** | Unexpected behaviors across 4 personas | (Use with above for complete coverage) |

Bellwether complements your existing tests—it doesn't replace them.

## Features

### Core Features
- **AGENTS.md Generation** - Human-readable behavioral documentation
- **Performance Metrics** - Response times (avg/p50/p95/max) and error rates
- **Multi-Provider LLM** - OpenAI, Anthropic Claude, or Ollama (local/free)
- **Drift Detection** - Compare baselines to detect behavioral changes
- **Multiple Output Formats** - Markdown and JSON reports
- **Structured Logging** - Configurable log levels and file output (`--log-level`, `--log-file`)
- **Secure Credential Storage** - System keychain integration for API keys

### Server Support
- **Local Servers** - Stdio transport for local MCP servers
- **Remote Servers** - SSE and Streamable HTTP transports
- **Resource Testing** - Discover and test MCP resources (data sources)

### Testing
- **Custom Test Scenarios** - Define YAML test cases with assertions
- **Scenarios-Only Mode** - Run tests without LLM (free, deterministic)
- **Multiple Personas** - Technical writer, security tester, QA engineer, novice user
- **Workflow Testing** - Multi-step tool sequences with state tracking
- **Parallel Execution** - Run persona interviews concurrently (`--parallel-personas`)

### Performance & Cost Control
- **Response Caching** - Avoid redundant tool calls and LLM analysis (`--cache`)
- **Streaming Output** - Real-time LLM responses (`--stream`)
- **Token Budgets** - Prevent runaway costs (`--max-tokens`)
- **Automatic Fallback** - Falls back to Ollama if primary LLM fails (`--fallback`)

### Ecosystem
- **MCP Registry Search** - Discover servers from the official registry
- **Verification Program** - Get your server certified with badges
- **GitHub Action** - One-line CI/CD integration
- **Cloud Sync** - Optional baseline history and team features

## Commands

### Core Commands

```bash
# Interview a server and generate documentation
bellwether interview npx @mcp/server-filesystem /tmp

# Quick interview (fast, cheap - good for CI)
bellwether interview --quick npx @mcp/server

# Watch for changes and auto-interview
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

## Documented by Bellwether

Get your MCP server documented and earn coverage badges:

```bash
bellwether verify --tier gold npx @mcp/your-server
```

### Verification Tiers

| Tier | Requirements | What it signals |
|:-----|:-------------|:----------------|
| 🥉 Bronze | Basic documentation (happy path) | "This server has been tested" |
| 🥈 Silver | + Error handling coverage | "This server handles errors gracefully" |
| 🥇 Gold | + All personas, good coverage | "This server is thoroughly documented" |
| 💎 Platinum | + Comprehensive testing, all personas | "This server has thorough documentation" |

**Note:** Documentation badges indicate testing coverage, not security certification. Badges show that a server has been systematically documented with Bellwether—a first line of defense, not a replacement for professional security audits.

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

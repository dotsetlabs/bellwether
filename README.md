# Bellwether

[![Build Status](https://github.com/dotsetlabs/bellwether/actions/workflows/ci.yml/badge.svg)](https://github.com/dotsetlabs/bellwether/actions)
[![npm version](https://img.shields.io/npm/v/@dotsetlabs/bellwether)](https://www.npmjs.com/package/@dotsetlabs/bellwether)
[![Documentation](https://img.shields.io/badge/docs-bellwether.sh-blue)](https://bellwether.sh/docs)

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

**[bellwether.sh/docs](https://bellwether.sh/docs)** - Full documentation including:

- [Quick Start](https://bellwether.sh/docs/quickstart) - Get started in 5 minutes
- [CLI Reference](https://bellwether.sh/docs/cli/interview) - Complete command documentation
- [CI/CD Integration](https://bellwether.sh/docs/guides/ci-cd) - GitHub Actions, GitLab CI
- [Custom Scenarios](https://bellwether.sh/docs/guides/custom-scenarios) - YAML test definitions
- [Remote Servers](https://bellwether.sh/docs/guides/remote-servers) - SSE and HTTP transports

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

### Server Support
- **Local Servers** - Stdio transport for local MCP servers
- **Remote Servers** - SSE and Streamable HTTP transports
- **Resource Testing** - Discover and test MCP resources (data sources)

### Testing
- **Custom Test Scenarios** - Define YAML test cases with assertions
- **Scenarios-Only Mode** - Run tests without LLM (free, deterministic)
- **Multiple Personas** - Technical writer, security tester, QA engineer, novice user

### Ecosystem
- **MCP Registry Search** - Discover servers from the official registry
- **Verification Program** - Get your server certified with badges
- **GitHub Action** - One-line CI/CD integration
- **Cloud Sync** - Optional baseline history and team features

## Commands

```bash
# Interview a server
bellwether interview npx @mcp/server-filesystem /tmp

# Quick interview (fast, cheap - good for CI)
bellwether interview --quick npx @mcp/server

# Discover without full interview
bellwether discover npx @mcp/server

# Search the MCP Registry
bellwether registry filesystem

# Generate verification report
bellwether verify npx @mcp/server

# Initialize configuration
bellwether init
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

# Run CLI locally
npm run dev -- interview npx @mcp/server

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

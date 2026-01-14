# Bellwether

[![Build Status](https://github.com/dotsetlabs/bellwether/actions/workflows/ci.yml/badge.svg)](https://github.com/dotsetlabs/bellwether/actions)
[![npm version](https://img.shields.io/npm/v/@dotsetlabs/bellwether)](https://www.npmjs.com/package/@dotsetlabs/bellwether)
[![Documentation](https://img.shields.io/badge/docs-bellwether.sh-blue)](https://bellwether.sh/docs)

> Automated behavioral documentation and testing for MCP servers

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

# Set your API key
export OPENAI_API_KEY=sk-xxx

# Interview an MCP server
bellwether interview npx @modelcontextprotocol/server-filesystem /tmp

# Output: AGENTS.md with behavioral documentation
```

## Why Bellwether?

| Problem | Solution |
|:--------|:---------|
| Documentation says one thing, but what does the server actually do? | **Trust but verify** - Interview the server to document real behavior |
| Breaking changes slip into production unnoticed | **Drift detection** - Catch behavioral changes before they hit production |
| Security vulnerabilities are hard to discover manually | **Security testing** - Persona-based adversarial testing |
| Manual testing is slow and expensive | **CI/CD integration** - Automated regression testing |

## Features

### Core Features
- **AGENTS.md Generation** - Human-readable behavioral documentation
- **Performance Metrics** - Response times (avg/p50/p95/max) and error rates
- **Multi-Provider LLM** - OpenAI, Anthropic Claude, or Ollama (local/free)
- **Drift Detection** - Compare baselines to detect behavioral changes
- **Multiple Output Formats** - Markdown, JSON, JUnit, SARIF

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
version: 1
tools:
  - name: get_weather
    scenarios:
      - name: "Valid location returns weather"
        input:
          location: "San Francisco"
        assertions:
          - path: "content[0].text"
            condition: "contains"
            expected: "temperature"

      - name: "Invalid location returns error"
        input:
          location: ""
        assertions:
          - path: "isError"
            condition: "equals"
            expected: true
```

Run with:
```bash
bellwether interview --scenarios ./bellwether-tests.yaml npx @mcp/server
bellwether interview --scenarios-only ./bellwether-tests.yaml npx @mcp/server  # No LLM needed
```

## Verified by Bellwether

Get your MCP server certified:

```bash
bellwether verify --tier gold npx @mcp/your-server
```

Tiers based on test coverage:
- 🥉 **Bronze** - Basic documentation
- 🥈 **Silver** - Error handling tested
- 🥇 **Gold** - Multiple personas + good coverage
- 💎 **Platinum** - Security testing + comprehensive coverage

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

# Bellwether

[![Build Status](https://github.com/dotsetlabs/bellwether/actions/workflows/ci.yml/badge.svg)](https://github.com/dotsetlabs/bellwether/actions)
[![npm version](https://img.shields.io/npm/v/@dotsetlabs/bellwether)](https://www.npmjs.com/package/@dotsetlabs/bellwether)
[![Documentation](https://img.shields.io/badge/docs-docs.bellwether.sh-blue)](https://docs.bellwether.sh)

> Automated behavioral documentation for MCP servers through LLM-guided testing

Bellwether is a CLI tool that generates comprehensive behavioral documentation for [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) servers. Instead of relying on manually written docs, Bellwether **interviews** your MCP server by:

1. **Discovering** available tools, prompts, and resources
2. **Generating** realistic test scenarios using an LLM
3. **Executing** tests and analyzing actual responses
4. **Synthesizing** findings into actionable documentation

## Documentation

**[docs.bellwether.sh](https://docs.bellwether.sh)** - Full documentation including:

- [Quick Start](https://docs.bellwether.sh/quickstart) - Get started in 5 minutes
- [CLI Reference](https://docs.bellwether.sh/cli/interview) - Complete command documentation
- [CI/CD Integration](https://docs.bellwether.sh/guides/ci-cd) - GitHub Actions, GitLab CI, etc.
- [Personas](https://docs.bellwether.sh/concepts/personas) - Customize testing behavior
- [Drift Detection](https://docs.bellwether.sh/concepts/drift-detection) - Catch breaking changes

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
| Security vulnerabilities are hard to discover manually | **Security insights** - Persona-based adversarial testing |
| Manual testing is slow and expensive | **CI/CD integration** - Automated regression testing for MCP servers |

## Features

- **AGENTS.md Generation** - Human-readable behavioral documentation with performance metrics
- **Multi-Provider LLM** - OpenAI, Anthropic Claude, or Ollama (local/free)
- **Remote MCP Servers** - Connect via SSE or Streamable HTTP transports
- **Custom Test Scenarios** - Define YAML test cases alongside LLM-generated ones
- **Drift Detection** - Compare baselines to detect behavioral changes
- **Multiple Output Formats** - Markdown, JSON, JUnit, SARIF
- **CI/CD Integration** - GitHub Actions, GitLab CI, and more
- **Cloud Sync** - Optional baseline history and verification badges

## Cost

Bellwether uses LLMs for intelligent testing. Typical costs per interview:

| Model | Cost | Quality |
|:------|:-----|:--------|
| `gpt-4o-mini` | ~$0.02 | Good (recommended for CI) |
| `gpt-4o` | ~$0.13 | Best |
| Ollama | Free | Variable |

Use `--quick` flag for fastest, cheapest runs (~$0.01).

## CI/CD Example

```yaml
# .github/workflows/bellwether.yml
name: Behavioral Testing
on: [push, pull_request]

jobs:
  bellwether:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run Bellwether
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
        run: |
          npx @dotsetlabs/bellwether interview \
            --ci \
            --compare-baseline ./bellwether-baseline.json \
            --fail-on-drift \
            npx your-mcp-server
```

## Development

```bash
git clone https://github.com/dotsetlabs/bellwether
cd bellwether
npm install
npm run build
npm test

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

- [Model Context Protocol](https://modelcontextprotocol.io/) - The protocol Bellwether interviews
- [Bellwether Cloud](https://bellwether.sh) - Baseline history and drift detection
- [Overwatch](https://github.com/dotsetlabs/overwatch) - MCP security proxy (tool shadowing detection)
- [Hardpoint](https://github.com/dotsetlabs/hardpoint) - Rules File Backdoor detector

---

<p align="center">
  Built by <a href="https://dotsetlabs.com">Dotset Labs</a>
</p>

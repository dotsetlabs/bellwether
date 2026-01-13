# Inquest

[![Build Status](https://github.com/dotsetlabs/inquest/actions/workflows/ci.yml/badge.svg)](https://github.com/dotsetlabs/inquest/actions)
[![npm version](https://img.shields.io/npm/v/@dotsetlabs/inquest)](https://www.npmjs.com/package/@dotsetlabs/inquest)
[![Documentation](https://img.shields.io/badge/docs-docs.inquest.dev-blue)](https://docs.inquest.dev)

> Automated behavioral documentation for MCP servers through LLM-guided testing

Inquest is a CLI tool that generates comprehensive behavioral documentation for [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) servers. Instead of relying on manually written docs, Inquest **interviews** your MCP server by:

1. **Discovering** available tools, prompts, and resources
2. **Generating** realistic test scenarios using an LLM
3. **Executing** tests and analyzing actual responses
4. **Synthesizing** findings into actionable documentation

## Documentation

**[docs.inquest.dev](https://docs.inquest.dev)** - Full documentation including:

- [Quick Start](https://docs.inquest.dev/quickstart) - Get started in 5 minutes
- [CLI Reference](https://docs.inquest.dev/cli/interview) - Complete command documentation
- [CI/CD Integration](https://docs.inquest.dev/guides/ci-cd) - GitHub Actions, GitLab CI, etc.
- [Personas](https://docs.inquest.dev/concepts/personas) - Customize testing behavior
- [Drift Detection](https://docs.inquest.dev/concepts/drift-detection) - Catch breaking changes

## Quick Start

```bash
# Install
npm install -g @dotsetlabs/inquest

# Set your API key
export OPENAI_API_KEY=sk-xxx

# Interview an MCP server
inquest interview npx @modelcontextprotocol/server-filesystem /tmp

# Output: AGENTS.md with behavioral documentation
```

## Why Inquest?

| Problem | Solution |
|:--------|:---------|
| Documentation says one thing, but what does the server actually do? | **Trust but verify** - Interview the server to document real behavior |
| Breaking changes slip into production unnoticed | **Drift detection** - Catch behavioral changes before they hit production |
| Security vulnerabilities are hard to discover manually | **Security insights** - Persona-based adversarial testing |
| Manual testing is slow and expensive | **CI/CD integration** - Automated regression testing for MCP servers |

## Features

- **AGENTS.md Generation** - Human-readable behavioral documentation
- **Multi-Provider LLM** - OpenAI, Anthropic Claude, or Ollama (local/free)
- **Drift Detection** - Compare baselines to detect behavioral changes
- **Multiple Output Formats** - Markdown, JSON, JUnit, SARIF
- **CI/CD Integration** - GitHub Actions, GitLab CI, and more
- **Cloud Sync** - Optional baseline history and verification badges

## Cost

Inquest uses LLMs for intelligent testing. Typical costs per interview:

| Model | Cost | Quality |
|:------|:-----|:--------|
| `gpt-4o-mini` | ~$0.02 | Good (recommended for CI) |
| `gpt-4o` | ~$0.13 | Best |
| Ollama | Free | Variable |

Use `--quick` flag for fastest, cheapest runs (~$0.01).

## CI/CD Example

```yaml
# .github/workflows/inquest.yml
name: Behavioral Testing
on: [push, pull_request]

jobs:
  inquest:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run Inquest
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
        run: |
          npx @dotsetlabs/inquest interview \
            --ci \
            --compare-baseline ./inquest-baseline.json \
            --fail-on-drift \
            npx your-mcp-server
```

## Development

```bash
git clone https://github.com/dotsetlabs/inquest
cd inquest
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

- [Model Context Protocol](https://modelcontextprotocol.io/) - The protocol Inquest interviews
- [Inquest Cloud](https://inquest.cloud) - Baseline history and team collaboration
- [Overwatch](https://github.com/dotsetlabs/overwatch) - MCP security proxy (tool shadowing detection)
- [Hardpoint](https://github.com/dotsetlabs/hardpoint) - Rules File Backdoor detector

---

<p align="center">
  Built by <a href="https://dotsetlabs.com">Dotset Labs</a>
</p>

# Inquest

> Automated behavioral documentation for MCP servers through LLM-guided testing

Inquest is a CLI tool that generates comprehensive behavioral documentation for [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) servers. Instead of relying on manually written docs, Inquest **interviews** your MCP server by:

1. **Discovering** available tools, prompts, and resources
2. **Generating** realistic test scenarios using an LLM
3. **Executing** tests and analyzing actual responses
4. **Synthesizing** findings into actionable documentation

## Why Inquest?

- **Trust but verify** - Documentation says one thing, but what does the server actually do?
- **Behavioral drift detection** - Catch breaking changes before they hit production
- **Security insights** - Identify potential vulnerabilities through adversarial testing
- **CI/CD integration** - Automated regression testing for MCP servers

## Features

| Feature | Description |
|---------|-------------|
| Interview MCP servers | Automatically probe server capabilities |
| Generate AGENTS.md | Human-readable behavioral documentation |
| Multi-provider LLM | OpenAI, Anthropic Claude, or Ollama (local) |
| Drift detection | Compare baselines to detect behavioral changes |
| Multiple output formats | Markdown, JSON, HTML, JUnit, SARIF |
| GitHub Action | CI/CD integration for automated testing |
| Cloud sync | Optional cloud storage for baseline history |

---

## Installation

```bash
npm install -g @dotsetlabs/inquest
```

Or use directly with npx:

```bash
npx @dotsetlabs/inquest interview <server-command>
```

## Quick Start

```bash
# Set your LLM API key (choose one)
export OPENAI_API_KEY=sk-xxx        # OpenAI
export ANTHROPIC_API_KEY=sk-xxx    # Anthropic Claude
# Or use Ollama locally (no key needed)

# Interview an MCP server
inquest interview npx @modelcontextprotocol/server-filesystem /tmp

# Output: AGENTS.md with behavioral documentation
```

---

## CLI Commands

### Core Commands

#### `inquest interview <command> [args...]`

Conduct a full interview of an MCP server and generate documentation.

```bash
# Basic usage
inquest interview npx @modelcontextprotocol/server-filesystem /tmp

# With options
inquest interview npx @modelcontextprotocol/server-memory \
  --model gpt-4o \
  --max-questions 5 \
  --json \
  --save-baseline

# Options:
#   -o, --output <dir>        Output directory (default: .)
#   -c, --config <path>       Config file path
#   --model <model>           LLM model override
#   --max-questions <n>       Max questions per tool (default: 3)
#   --timeout <ms>            Tool call timeout (default: 60000)
#   --json                    Also output JSON report
#   --save-baseline [path]    Save baseline for drift detection
#   --compare-baseline <path> Compare against existing baseline
#   --fail-on-drift           Exit with error if drift detected
#   --verbose                 Verbose output
#   --debug                   Debug MCP protocol messages
```

#### `inquest discover <command> [args...]`

Quick discovery of MCP server capabilities without interviewing.

```bash
inquest discover npx @modelcontextprotocol/server-filesystem /tmp
inquest discover npx @modelcontextprotocol/server-memory --json

# Options:
#   --json                 Output as JSON
#   --timeout <ms>         Connection timeout (default: 30000)
```

#### `inquest init`

Create a default configuration file.

```bash
inquest init
# Creates: inquest.yaml
```

#### `inquest watch <command> [args...]`

Watch for file changes and re-run interviews automatically.

```bash
inquest watch npx my-server --watch src/
```

#### `inquest profile`

Manage interview profiles for different testing scenarios.

```bash
inquest profile list
inquest profile create security --personas security_tester,qa_engineer
inquest profile use security
```

### Cloud Commands

For baseline history and drift tracking, Inquest offers optional cloud sync.

#### `inquest login`

Authenticate with Inquest Cloud.

```bash
# Interactive login (opens browser)
inquest login

# Use a token directly
inquest login --token iqt_xxx

# Check authentication status
inquest login --status

# Logout
inquest login --logout
```

#### `inquest link`

Link current directory to an Inquest Cloud project.

```bash
# Create a new project and link
inquest link

# Link to existing project
inquest link proj_abc123
```

#### `inquest upload`

Upload a baseline to Inquest Cloud for drift tracking.

```bash
# Upload default baseline
inquest upload

# Options:
#   --ci                  CI mode - exit 1 on breaking drift
#   --fail-on-drift       Exit with error if any drift detected
```

#### `inquest history`

View baseline history for a project.

```bash
inquest history
inquest history --limit 20 --json
```

---

## LLM Providers

Inquest supports multiple LLM providers. Set the appropriate environment variable:

| Provider | Environment Variable | Default Model | Notes |
|----------|---------------------|---------------|-------|
| **OpenAI** | `OPENAI_API_KEY` | `gpt-4o` | Recommended for best results |
| **Anthropic** | `ANTHROPIC_API_KEY` | `claude-sonnet-4-20250514` | Excellent alternative |
| **Ollama** | None (local) | `llama3.2` | Free, runs locally |

Provider is auto-detected based on which API key is set. Priority: Anthropic > OpenAI > Ollama.

### Using Ollama (Local LLM)

```bash
# Start Ollama
ollama serve

# Pull a model
ollama pull llama3.2

# Run interview (no API key needed)
inquest interview npx @modelcontextprotocol/server-filesystem /tmp
```

---

## Configuration

Create `inquest.yaml` in your project root or `~/.inquest/`:

```yaml
version: 1

# LLM Provider Configuration
llm:
  provider: openai          # openai, anthropic, or ollama
  model: gpt-4o

# Interview Settings
interview:
  maxQuestionsPerTool: 3    # Questions per tool (1-20)
  timeout: 30000            # Tool call timeout in ms

# Output Settings
output:
  format: agents.md         # agents.md, json, or both
```

### Personas

Inquest uses specialized personas to probe different aspects of your MCP server:

| Persona | Focus |
|---------|-------|
| `technical_writer` | Documentation accuracy, edge cases |
| `security_tester` | Input validation, injection attacks |
| `qa_engineer` | Error handling, boundary conditions |
| `novice_user` | Usability, error messages |

Configure in `inquest.yaml`:
```yaml
interview:
  personas: technical_writer,security_tester
```

---

## Output Formats

### AGENTS.md (Default)

Human-readable markdown documentation:

```markdown
# my-mcp-server

> Generated by Inquest on 2026-01-12

## Overview
A file management server providing tools for reading, writing, and searching files.

## Tools

### read_file
Read contents of a file.

**Observed Behavior:**
- Returns file contents as UTF-8 text
- Handles binary files with base64 encoding

**Limitations:**
- Maximum file size: 10MB

**Security Considerations:**
- No path sanitization (potential directory traversal)
```

### JSON Report

Machine-readable format for CI/CD integration:

```bash
inquest interview ... --json
# Output: inquest-report.json
```

### Additional Formats

- **JUnit XML** - For test runners
- **SARIF** - For GitHub Code Scanning
- **HTML** - Interactive report

---

## Behavioral Drift Detection

Inquest can detect when MCP server behavior changes between versions.

### Local Drift Detection

```bash
# Save initial baseline
inquest interview npx my-server --save-baseline

# Later, compare against baseline
inquest interview npx my-server --compare-baseline inquest-baseline.json --fail-on-drift
```

### CI/CD Integration

Use the included GitHub Action:

```yaml
# .github/workflows/inquest.yml
name: Inquest Behavioral Testing

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run Inquest
        uses: dotsetlabs/inquest@v1
        with:
          server-command: 'npx my-mcp-server'
          baseline-file: 'baseline.json'
          fail-on-drift: true
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

---

## Architecture

```
┌─────────────────┐
│  MCP Server     │
│ (your server)   │
└────────┬────────┘
         │ stdio
         ▼
┌─────────────────┐     ┌─────────────────┐
│   MCPClient     │────▶│   Discovery     │
│  (transport)    │     │  (tools/list)   │
└────────┬────────┘     └─────────────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│  Orchestrator   │────▶│   LLM Client    │
│  (questions)    │     │ (OpenAI/Claude) │
└────────┬────────┘     └─────────────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│  Interviewer    │────▶│  Persona Engine │
│  (execute)      │     │ (sec/qa/tech)   │
└────────┬────────┘     └─────────────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│   Baseline      │────▶│   Generator     │
│  (diff/save)    │     │  (AGENTS.md)    │
└─────────────────┘     └─────────────────┘
```

---

## Development

```bash
# Clone the repo
git clone https://github.com/dotsetlabs/inquest
cd inquest

# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Run specific test
npx vitest run test/interview/orchestrator.test.ts

# Watch mode
npm run dev
```

---

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `OPENAI_API_KEY` | OpenAI API key | One of these |
| `ANTHROPIC_API_KEY` | Anthropic API key | required |
| `INQUEST_TOKEN` | Cloud API token (alternative to `inquest login`) | For cloud |

---

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Write tests for new functionality
4. Submit a pull request

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

---

## License

MIT License - see [LICENSE](./LICENSE) for details.

---

## Related Projects

- [Model Context Protocol](https://modelcontextprotocol.io/) - The protocol Inquest interviews
- [Overwatch](https://github.com/dotsetlabs/overwatch) - MCP security proxy (tool shadowing detection)
- [Hardpoint](https://github.com/dotsetlabs/hardpoint) - Rules File Backdoor detector

---

<p align="center">
  Built by <a href="https://dotsetlabs.com">Dotset Labs</a>
</p>

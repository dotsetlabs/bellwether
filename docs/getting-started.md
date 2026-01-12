# Getting Started with Inquest

Inquest is a behavioral documentation and drift detection tool for MCP (Model Context Protocol) servers. This guide will help you get up and running quickly.

## Prerequisites

- Node.js 20 or later
- An OpenAI API key (or Anthropic/Ollama)
- An MCP server to interview

## Installation

```bash
npm install -g @dotsetlabs/inquest
```

Or use directly with npx:

```bash
npx @dotsetlabs/inquest interview <server-command>
```

## Quick Start

### 1. Run Your First Interview

Interview an MCP server and generate documentation:

```bash
# Set your API key
export OPENAI_API_KEY=your-key-here

# Interview a server
inquest interview npx @modelcontextprotocol/server-filesystem /tmp
```

This will:
- Connect to the MCP server
- Discover available tools
- Interview each tool with multiple personas
- Generate `AGENTS.md` documentation

### 2. Configure Your LLM Provider

Create `inquest.yaml` in your project:

```yaml
llm:
  provider: openai  # or 'anthropic', 'ollama'
  model: gpt-4o     # optional, uses defaults

interview:
  maxQuestionsPerTool: 5
  personas:
    - user
    - developer
    - security

output:
  format: markdown  # or 'json', 'both'
```

### 3. Create a Baseline

Save a baseline for future comparison:

```bash
inquest interview npx your-server --save-baseline
```

### 4. Detect Behavioral Drift

Compare against a previous baseline:

```bash
inquest interview npx your-server \
  --compare-baseline ./inquest-baseline.json \
  --fail-on-drift
```

The `--fail-on-drift` flag exits with code 1 if breaking changes are detected, making it CI-friendly.

## Using Profiles

Profiles let you save and reuse interview configurations:

```bash
# Create a profile
inquest profile create production \
  --provider anthropic \
  --model claude-sonnet-4-20250514 \
  --max-questions 10

# Use the profile
inquest profile use production

# List profiles
inquest profile list
```

## Watch Mode

Automatically re-interview when files change:

```bash
inquest watch npx your-server --watch-path ./src
```

Watch mode will:
- Run an initial interview
- Monitor the specified directory for changes
- Re-interview and show diffs on any changes

## Cloud Integration

Connect to Inquest Cloud for team collaboration and dashboards:

```bash
# Login to Inquest Cloud
inquest login

# Link to a project
inquest link my-project

# Upload baselines automatically
inquest interview npx your-server --upload
```

### Viewing History

```bash
# View baseline history
inquest history my-project

# View specific diff
inquest diff my-project 1 2
```

## Cost Tracking

Estimate costs before running an interview:

```bash
inquest interview npx your-server --estimate-cost
```

Show actual cost after interview:

```bash
inquest interview npx your-server --show-cost
```

## Output Formats

### Markdown (Default)

Generates `AGENTS.md` with:
- Server capabilities
- Tool documentation
- Behavioral assertions
- Security notes

### JSON Report

```bash
inquest interview npx your-server --json
```

Generates `inquest-report.json` with full structured data.

### Cloud Format

```bash
inquest interview npx your-server --save-baseline --cloud-format
```

Saves baseline in cloud-ready format for upload.

## CI/CD Integration

### GitHub Actions

```yaml
name: MCP Baseline Check
on: [push, pull_request]

jobs:
  baseline:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Check baseline
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
        run: |
          npx @dotsetlabs/inquest interview npm run server \
            --compare-baseline ./baseline.json \
            --fail-on-drift
```

### GitLab CI

```yaml
baseline-check:
  image: node:20
  script:
    - npm ci
    - npx @dotsetlabs/inquest interview npm run server --compare-baseline ./baseline.json --fail-on-drift
  variables:
    OPENAI_API_KEY: $OPENAI_API_KEY
```

## Next Steps

- Learn about [writing custom personas](./personas.md)
- Set up [webhooks](./webhooks.md) for notifications
- Explore the [API reference](./api-reference.md)
- Connect [GitHub integration](./github-integration.md)

## Troubleshooting

### Common Issues

**API Key not found**
```
Failed to initialize LLM client
```
Ensure your API key environment variable is set correctly.

**Server connection failed**
```
Failed to connect to MCP server
```
Check that your server command is correct and the server starts successfully.

**Timeout errors**
```
Tool call timed out
```
Increase the timeout with `--timeout 120000` (2 minutes).

### Getting Help

- GitHub Issues: https://github.com/dotsetlabs/inquest/issues
- Documentation: https://docs.inquest.dev

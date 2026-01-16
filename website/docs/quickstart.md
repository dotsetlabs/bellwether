---
title: Quick Start
sidebar_position: 3
---

# Quick Start

Get up and running with Bellwether in 5 minutes.

## 1. Install Bellwether

```bash
npm install -g @dotsetlabs/bellwether
```

## 2. Set Your API Key

```bash
# Interactive setup (recommended - stores securely in keychain)
bellwether auth

# Or set environment variable
export OPENAI_API_KEY=sk-xxx
# or
export ANTHROPIC_API_KEY=sk-ant-xxx

# Or use Ollama for free (ollama serve must be running)
```

## 3. Interview Your First MCP Server

You can interview any MCP server—local scripts, npm packages, or remote endpoints:

```bash
# Local Node.js server (most common during development)
bellwether interview node ./src/mcp-server.js

# npm package via npx
bellwether interview npx @modelcontextprotocol/server-filesystem /tmp

# Python server
bellwether interview python ./mcp_server.py
```

This will:
1. Connect to the MCP server
2. Discover available tools, prompts, and resources
3. Generate intelligent test scenarios using the LLM
4. Execute tests against each capability
5. Generate `AGENTS.md` documentation with performance metrics

### Available Presets

| Preset | Use Case | Cost |
|:-------|:---------|:-----|
| `--preset docs` | Quick documentation generation | ~$0.02 |
| `--preset security` | Security-focused testing | ~$0.05 |
| `--preset thorough` | Comprehensive testing with all personas | ~$0.10 |
| `--preset ci` | Fast CI/CD checks | ~$0.01 |

## 4. View the Results

Open the generated `AGENTS.md` file:

```bash
cat AGENTS.md
```

You'll see comprehensive documentation of what the server actually does, including:
- Tool descriptions with observed behavior
- Parameter documentation
- Error handling patterns
- Limitations and edge cases
- Security considerations
- Quick reference with tool signatures
- Performance metrics (response times, error rates)

## Deterministic Testing (No LLM Required)

For CI/CD pipelines and situations where you need 100% deterministic results, Bellwether offers scenarios-only mode:

```bash
# Generate a sample scenarios file
bellwether interview --init-scenarios

# Run only your custom scenarios (no LLM, no API costs, fully deterministic)
bellwether interview --scenarios-only npx your-server
```

This is ideal for:
- **CI/CD pipelines** where you need consistent pass/fail results
- **Cost-sensitive environments** where you want to avoid LLM API costs
- **Compliance requirements** where non-deterministic testing is not acceptable

See [Custom Scenarios](/guides/custom-scenarios) for details on writing YAML test scenarios.

:::tip When to use each mode
- **LLM-guided testing**: Discovery, initial documentation, exploratory testing
- **Scenarios-only mode**: CI/CD gates, regression testing, deterministic verification
:::

## What's Next?

### Discover MCP Servers

Find servers to test from the official MCP Registry:

```bash
bellwether registry filesystem
bellwether registry database
```

### Get Documented

Run the documentation process to earn coverage badges:

```bash
bellwether verify --tier gold npx your-server
```

### Save a Baseline for Drift Detection

```bash
bellwether interview npx your-server --save-baseline
```

### Compare Against a Baseline

```bash
bellwether interview npx your-server \
  --compare-baseline ./bellwether-baseline.json \
  --fail-on-drift
```

### Quick Mode for CI

For fast, cheap CI runs (~$0.01):

```bash
bellwether interview --preset ci npx your-server
```

### Security Testing

Test with a security focus:

```bash
bellwether interview --preset security npx your-server
```

### Thorough Testing

Test with all personas for comprehensive coverage:

```bash
bellwether interview --preset thorough npx your-server
```

### Custom Test Scenarios (No LLM Required)

Run deterministic tests without LLM costs:

```bash
# Generate a sample scenarios file
bellwether interview --init-scenarios

# Run only custom scenarios (fast, no API costs)
bellwether interview --scenarios-only npx your-server
```

### Remote MCP Servers

Test remote MCP servers over HTTP:

```bash
# Via SSE transport
bellwether interview --transport sse --url https://api.example.com/mcp npx placeholder

# Via Streamable HTTP
bellwether interview --transport streamable-http --url https://api.example.com/mcp npx placeholder
```

### Customize Configuration

Create `bellwether.yaml`:

```yaml
version: 1

llm:
  provider: openai
  model: gpt-5-mini  # Cheaper, faster

interview:
  maxQuestionsPerTool: 5
  personas:
    - technical_writer
    - security_tester
```

Then run:

```bash
bellwether interview npx your-server
```

## Common Workflows

### Local Development: Test While You Build

```bash
# Run against your local server during development
bellwether interview node ./src/mcp-server.js

# Save a baseline after initial development
bellwether interview --save-baseline node ./src/mcp-server.js

# Use watch mode for continuous testing (re-interviews on file changes)
bellwether watch node ./src/mcp-server.js --watch-path ./src

# Before committing, check for unintended drift
bellwether interview --compare-baseline ./bellwether-baseline.json node ./src/mcp-server.js
```

### Documentation: Generate AGENTS.md

```bash
# Quick documentation with preset
bellwether interview --preset docs node ./src/mcp-server.js

# View generated docs
cat AGENTS.md
```

### CI/CD: Check for Behavioral Drift

```bash
# In CI pipeline - fast and cheap
bellwether interview \
  --preset ci \
  --compare-baseline ./baseline.json \
  --fail-on-drift \
  npx your-server
```

### Security: Audit an MCP Server

```bash
# Security-focused interview with JSON output for analysis
bellwether interview \
  --preset security \
  --json \
  npx your-server
```

### Watch Mode: Continuous Testing

```bash
# Re-interview when source files change
bellwether watch npx your-server --watch-path ./src
```

## Example Output

After running an interview, your `AGENTS.md` will look like this:

```markdown
# @modelcontextprotocol/server-filesystem

> Generated by Bellwether on 2026-01-12 using gpt-4o

## Overview

A file management server providing read/write access to the local filesystem.

## Tools

### read_file

Reads the contents of a file from the specified path.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| path | string | yes | Absolute or relative path to the file |

**Observed Behavior:**
- Returns file contents as UTF-8 text for text files
- Returns base64-encoded content for binary files
- Follows symlinks (does not resolve them)
- Maximum file size: 10MB

**Error Handling:**
- `ENOENT`: File not found - returns clear error message
- `EACCES`: Permission denied - returns error without path
- `EISDIR`: Path is a directory - returns appropriate error

**Limitations:**
- Cannot read files outside configured root directory
- Large files (>10MB) are rejected entirely

**Security Considerations:**
- Path traversal attempts (../) are normalized within root
- Does not expose absolute paths in error messages

## Quick Reference

| Tool | Signature |
|------|-----------|
| read_file | `read_file(path)` |

## Performance

| Tool | Calls | Avg | P95 | Max | Errors |
|------|-------|-----|-----|-----|--------|
| read_file | 5 | 45ms | 120ms | 150ms | 0% |
```

## Next Steps

- [Local Development](/guides/local-development) - Test during development with watch mode and drift detection
- [CLI Reference](/cli/interview) - Full command options
- [MCP Registry](/cli/registry) - Discover servers to test
- [Verification](/cli/verify) - Get your server certified
- [Personas](/concepts/personas) - Understanding testing personas
- [Drift Detection](/concepts/drift-detection) - Set up behavioral regression testing
- [CI/CD Integration](/guides/ci-cd) - Automate with GitHub Actions, GitLab CI, etc.
- [Custom Scenarios](/guides/custom-scenarios) - Define deterministic YAML test scenarios
- [Remote Servers](/guides/remote-servers) - Test MCP servers over HTTP

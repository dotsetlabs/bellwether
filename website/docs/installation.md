---
title: Installation
sidebar_position: 2
---

# Installation

## Prerequisites

- **Node.js 20 or later** - Required for running Bellwether
- **An MCP server to test** - Any server implementing the Model Context Protocol
- **An LLM API key** (optional) - Only required for `bellwether explore`; `bellwether check` is free and requires no API keys

## Install via npm

The recommended way to install Bellwether:

```bash
npm install -g @dotsetlabs/bellwether
```

Verify the installation:

```bash
bellwether --version
```

## Use with npx (No Installation)

Run Bellwether directly without global installation:

```bash
# Initialize and run check
npx @dotsetlabs/bellwether init npx @mcp/your-server
npx @dotsetlabs/bellwether check
```

This is useful for CI/CD pipelines or one-off usage. All commands (except `init`) require a config file, so `init` is always the first step.

## LLM Provider Setup (Optional)

:::tip Check Mode is Free
By default, `bellwether check` requires no LLM and no API keys. It's free, fast, and deterministic. Only set up an LLM provider if you want `bellwether explore` with multi-persona testing and AGENTS.md documentation generation.
:::

For explore mode, choose one of the following providers:

### Anthropic Claude (Recommended)

Get your API key from [console.anthropic.com](https://console.anthropic.com/).

Default model: `claude-haiku-4-5` (best quality/cost balance)

### OpenAI

Get your API key from [platform.openai.com](https://platform.openai.com/api-keys).

Default model: `gpt-4.1-nano` (budget option)

### Setting Your API Key

Choose one of these methods (in order of recommendation):

**Option A: Interactive setup (recommended)**

The easiest way to configure your API key:

```bash
bellwether auth
```

This interactive wizard will:
1. Ask which provider you want to use
2. Prompt for your API key (input is hidden)
3. Store it securely in your system keychain

**Option B: System keychain (manual)**

Store your API key in the system keychain directly:

```bash
bellwether auth add openai
# or
bellwether auth add anthropic
```

**Option C: Global `.env` file**

Set once, use everywhere:

```bash
mkdir -p ~/.bellwether
echo "OPENAI_API_KEY=sk-your-key-here" >> ~/.bellwether/.env
```

**Option D: Project `.env` file**

Per-project configuration (overrides global):

```bash
echo "OPENAI_API_KEY=sk-your-key-here" >> .env
```

**Option E: Shell environment**

Temporary, for current session only:

```bash
export OPENAI_API_KEY=sk-your-key-here
```

:::tip
Use `bellwether auth` for the best experience. It stores your API key securely in the system keychain (macOS Keychain, Windows Credential Manager, or Linux Secret Service) and works across all your projects.
:::

:::note Config Required
The CLI requires `bellwether.yaml` to exist before running commands like `bellwether auth`. Run `bellwether init` once in your project root.
:::

### Checking Auth Status

See which providers are configured:

```bash
bellwether auth status
```

### Ollama (Free, Local)

For completely free, local LLM usage with explore mode:

```bash
# Install Ollama (macOS/Linux)
curl -fsSL https://ollama.com/install.sh | sh

# Start Ollama
ollama serve

# Pull a model
ollama pull qwen3:8b

# Initialize config for local Ollama
bellwether init --preset local npx @modelcontextprotocol/server-filesystem /tmp

# Run explore (no API key needed)
bellwether explore
```

Default model: `qwen3:8b`

:::tip
Ollama is great for development and testing. For production CI/CD, OpenAI or Anthropic provide more consistent results.
:::

## Provider Auto-Detection

Bellwether automatically detects which provider to use based on environment variables:

| Priority | Environment Variable | Provider |
|:---------|:--------------------|:---------|
| 1 | `ANTHROPIC_API_KEY` | Anthropic Claude |
| 2 | `OPENAI_API_KEY` | OpenAI |
| 3 | (none) | Ollama |

Override in `bellwether.yaml`:

```yaml
llm:
  provider: openai
```

## Configuration File

For persistent configuration, create `bellwether.yaml` in your project root:

```yaml
server:
  command: npx @mcp/your-server
  timeout: 30000

llm:
  provider: anthropic
  model: claude-sonnet-4-5

explore:
  personas:
    - technical_writer
    - security_tester
  maxQuestionsPerTool: 3

output:
  dir: "."
```

Or in your home directory at `~/.bellwether/bellwether.yaml` for global defaults.

## Verify Setup

Test your installation:

```bash
# Initialize with a test server
bellwether init npx @modelcontextprotocol/server-memory

# Check mode (free, no API key needed)
bellwether check

# Explore mode with Ollama (free)
ollama serve &
bellwether explore
```

For check mode, you should see:
1. Connection to the MCP server
2. Tool discovery
3. Schema validation
4. CONTRACT.md file generated

For explore mode, you should also see:
1. Multi-persona testing
2. AGENTS.md file generated

## Troubleshooting

### "API key not found"

This only applies to explore mode. Set up your API key:

```bash
bellwether auth
```

Or check your current authentication status:

```bash
bellwether auth status
```

### "Connection refused" with Ollama

Make sure Ollama is running:

```bash
ollama serve
```

### Node.js version issues

Bellwether requires Node.js 20+:

```bash
node --version  # Should be v20.x.x or higher

# Use nvm to install correct version
nvm install 20
nvm use 20
```

## Next Steps

- [Quick Start](/quickstart) - Run your first check
- [Local Development](/guides/local-development) - Test your MCP server during development
- [Configuration Guide](/guides/configuration) - Advanced configuration options
- [CLI Reference](/cli/check) - Full command documentation

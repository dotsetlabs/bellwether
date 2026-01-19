---
title: Installation
sidebar_position: 2
---

# Installation

## Prerequisites

- **Node.js 20 or later** - Required for running Bellwether
- **An MCP server to test** - Any server implementing the Model Context Protocol
- **An LLM API key** (optional) - Only required for full mode; structural mode (default) is free and requires no API keys

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
npx @dotsetlabs/bellwether test <server-command>
```

This is useful for CI/CD pipelines or one-off usage.

## LLM Provider Setup (Optional)

:::tip Structural Mode is Free
By default, Bellwether runs in **structural mode** which requires no LLM and no API keys. It's free, fast, and deterministic. Only set up an LLM provider if you want **full mode** with multi-persona testing and AGENTS.md documentation generation.
:::

For full mode testing, choose one of the following providers:

### OpenAI (Recommended)

Get your API key from [platform.openai.com](https://platform.openai.com/api-keys).

Default model: `gpt-5-mini`

### Anthropic Claude

Get your API key from [console.anthropic.com](https://console.anthropic.com/).

Default model: `claude-haiku-4-5`

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

### Checking Auth Status

See which providers are configured:

```bash
bellwether auth status
```

### Ollama (Free, Local)

For completely free, local LLM usage:

```bash
# Install Ollama (macOS/Linux)
curl -fsSL https://ollama.com/install.sh | sh

# Start Ollama
ollama serve

# Pull a model
ollama pull llama3.2

# Run Bellwether (no API key needed)
bellwether test npx @modelcontextprotocol/server-filesystem /tmp
```

Default model: `llama3.2`

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

Override with the `--provider` flag:

```bash
bellwether test --provider openai npx server
```

## Configuration File

For persistent configuration, create `bellwether.yaml` in your project root:

```yaml
version: 1

llm:
  provider: openai
  model: gpt-4o

interview:
  maxQuestionsPerTool: 3
  timeout: 30000

output:
  format: markdown
```

Or in your home directory at `~/.bellwether/bellwether.yaml` for global defaults.

## Verify Setup

Test your installation:

```bash
# With OpenAI
export OPENAI_API_KEY=sk-xxx
bellwether test npx @modelcontextprotocol/server-memory

# With Ollama (free)
ollama serve &
bellwether test npx @modelcontextprotocol/server-memory
```

You should see:
1. Connection to the MCP server
2. Tool discovery
3. Test scenarios being run
4. AGENTS.md file generated

## Troubleshooting

### "API key not found"

Set up your API key using the interactive wizard:

```bash
bellwether auth
```

Or check your current authentication status:

```bash
bellwether auth status
```

Alternative methods:

```bash
# Store in system keychain
bellwether auth add openai

# Or: Global .env file (set once, use everywhere)
mkdir -p ~/.bellwether
echo "OPENAI_API_KEY=sk-xxx" >> ~/.bellwether/.env

# Or: Project .env file
echo "OPENAI_API_KEY=sk-xxx" >> .env

# Or: Current session only
export OPENAI_API_KEY=sk-xxx
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

- [Quick Start](/quickstart) - Run your first test
- [Local Development](/guides/local-development) - Test your MCP server during development
- [Configuration Guide](/guides/configuration) - Advanced configuration options
- [CLI Reference](/cli/test) - Full command documentation

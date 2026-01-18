---
title: auth
sidebar_position: 7
---

# bellwether auth

Manage LLM provider API keys with secure storage.

## Synopsis

```bash
bellwether auth [subcommand] [options]
```

## Description

The `auth` command manages API keys for LLM providers (OpenAI, Anthropic). It provides secure storage via the system keychain (macOS Keychain, Windows Credential Manager, or Linux Secret Service) with automatic fallback to encrypted file storage.

This is separate from `bellwether login` which handles Bellwether Cloud authentication.

## Subcommands

### (default) - Interactive Setup

Running `bellwether auth` without a subcommand starts an interactive wizard:

```bash
bellwether auth
```

The wizard will:
1. Show currently configured providers
2. Ask which provider to configure
3. Prompt for your API key (input is hidden)
4. Ask where to store it (keychain or file)
5. Validate and save the key

### status

Show authentication status for all providers.

```bash
bellwether auth status
```

Output:
```
Bellwether Authentication Status
=================================

OpenAI:
  Status: ✓ Configured
  Source: System keychain
  Model:  gpt-5-mini

Anthropic:
  Status: ✗ Not configured
  Setup:  Run 'bellwether auth' or set ANTHROPIC_API_KEY

Ollama:
  Status: No API key required (local)
  Model:  llama3.2

Credential resolution order:
  1. Environment variables (highest priority)
  2. System keychain
  3. ~/.bellwether/.env file
  4. Project .env file
```

### add

Add or update an API key.

```bash
bellwether auth add [provider]
```

| Argument | Description |
|:---------|:------------|
| `[provider]` | Provider name: `openai` or `anthropic` (prompts if not provided) |

Example:
```bash
bellwether auth add openai
# Prompts for API key with hidden input
```

### remove

Remove an API key from the keychain.

```bash
bellwether auth remove [provider]
```

| Argument | Description |
|:---------|:------------|
| `[provider]` | Provider name: `openai` or `anthropic` (prompts if not provided) |

### clear

Remove all stored API keys.

```bash
bellwether auth clear
```

## Examples

### First-Time Setup

```bash
# Interactive setup (recommended)
bellwether auth
```

### Check What's Configured

```bash
bellwether auth status
```

### Add OpenAI Key

```bash
bellwether auth add openai
# Enter your OpenAI API key: ********
# ✓ OpenAI API key stored in keychain
```

### Add Anthropic Key

```bash
bellwether auth add anthropic
# Enter your Anthropic API key: ********
# ✓ Anthropic API key stored in keychain
```

### Remove a Key

```bash
bellwether auth remove openai
# ✓ OpenAI API key removed from keychain
```

### Clear All Keys

```bash
bellwether auth clear
# All API keys removed from keychain.
```

## Credential Resolution Order

Bellwether checks for API keys in this order:

1. **Environment variables** (highest priority)
   - `OPENAI_API_KEY`
   - `ANTHROPIC_API_KEY`

2. **System keychain**
   - macOS: Keychain Access
   - Windows: Credential Manager
   - Linux: Secret Service (libsecret)

3. **Global config file**
   - `~/.bellwether/.env`

4. **Project config file**
   - `./.env`

## Storage Options

### System Keychain (Recommended)

The most secure option. Uses your operating system's native credential storage:

- **macOS**: Keychain Access
- **Windows**: Credential Manager
- **Linux**: Secret Service API (requires libsecret)

```bash
bellwether auth add openai
# Choose: System keychain (recommended - most secure)
```

### File-Based Storage

Falls back to encrypted file storage at `~/.bellwether/.env`:

```bash
bellwether auth add openai
# Choose: Environment file (~/.bellwether/.env)
```

The file is created with restricted permissions (600).

## CI/CD Usage

In CI/CD environments, use environment variables instead of the keychain:

```yaml
# GitHub Actions
env:
  OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

The keychain is typically not available in CI environments, but Bellwether will gracefully fall back to environment variables.

## Troubleshooting

### "Keychain not available"

If the system keychain isn't available, `bellwether auth` will offer file-based storage instead. This is normal in:
- CI/CD environments
- Docker containers
- Headless servers

### "API key appears invalid"

Bellwether validates key formats:
- OpenAI keys should start with `sk-`
- Anthropic keys should start with `sk-ant-`

If you're sure your key is correct, you can set it via environment variable instead.

### Multiple Keys Configured

If you have keys in multiple locations (e.g., both keychain and environment), the environment variable takes priority. Use `bellwether auth status` to see which source is being used.

## See Also

- [Installation](/installation) - Full setup guide
- [Configuration](/guides/configuration) - Config file options
- [login](/cloud/login) - Bellwether Cloud authentication (different from LLM auth)

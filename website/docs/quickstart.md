---
title: Quick Start
sidebar_position: 3
---

# Quick Start

Get up and running with Bellwether in 5 minutes.

## 1. Install

```bash
npm install -g @dotsetlabs/bellwether
```

## 2. Initialize

Create a config file for your MCP server:

```bash
# Default: structural mode (free, fast, deterministic)
bellwether init "npx @modelcontextprotocol/server-filesystem /tmp"
```

This creates `bellwether.yaml` with your server command and settings.

### Presets

| Preset | Mode | Description |
|:-------|:-----|:------------|
| *(default)* | Structural | Free, fast, deterministic |
| `--preset ci` | Structural | Optimized for CI/CD pipelines |
| `--preset local` | Full | LLM testing with local Ollama (free) |
| `--preset security` | Full | Security-focused testing |
| `--preset thorough` | Full | Comprehensive multi-persona testing |

## 3. Set API Key (Full Mode Only)

If using full mode with OpenAI or Anthropic:

```bash
# Interactive (stores securely in keychain)
bellwether auth

# Or environment variable
export OPENAI_API_KEY=sk-xxx
```

Structural mode and Ollama require no API keys.

## 4. Run Test

```bash
bellwether test
```

This discovers tools, runs tests, and generates:
- `AGENTS.md` - behavioral documentation
- `bellwether-report.json` - test results

## 5. Save Baseline

```bash
bellwether baseline save
```

Creates `bellwether-baseline.json` for drift detection.

## 6. Detect Drift

After making changes, compare against baseline:

```bash
bellwether test
bellwether baseline compare ./bellwether-baseline.json
```

For CI/CD, fail on drift:

```bash
bellwether baseline compare ./bellwether-baseline.json --fail-on-drift
```

---

## Common Workflows

### Local Development

```bash
bellwether init "node ./src/server.js"
bellwether test
bellwether baseline save
bellwether watch --watch-path ./src    # Re-test on file changes
```

### CI/CD Pipeline

```bash
bellwether test
bellwether baseline compare ./bellwether-baseline.json --fail-on-drift
```

### Security Audit

```bash
bellwether init --preset security "npx your-server"
bellwether test
```

---

## Next Steps

- [Test Modes](/concepts/test-modes) - Structural vs full mode
- [Local Development](/guides/local-development) - Watch mode and continuous testing
- [CI/CD Integration](/guides/ci-cd) - GitHub Actions, GitLab CI
- [Cloud](/cloud) - Baseline history and verification badges
- [Configuration](/guides/configuration) - Customize bellwether.yaml

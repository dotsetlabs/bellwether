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
# Default configuration for both check and explore commands
bellwether init npx @mcp/your-server
```

This creates `bellwether.yaml` with your server command and settings.

### Presets

| Preset | Optimized For | Description |
|:-------|:--------------|:------------|
| *(default)* | `check` | Free, fast, deterministic |
| `--preset ci` | `check` | Optimized for CI/CD pipelines |
| `--preset local` | `explore` | LLM exploration with local Ollama (free) |
| `--preset security` | `explore` | Security-focused exploration |
| `--preset thorough` | `explore` | Comprehensive multi-persona exploration |

## 3. Run Check (Free, Fast, Deterministic)

```bash
bellwether check
```

This discovers tools, validates schemas, and generates:
- `CONTRACT.md` - structural documentation
- `bellwether-check.json` - validation results

No API keys needed. No LLM costs. Deterministic output.

## 4. Save Baseline

```bash
bellwether baseline save
```

Creates `bellwether-baseline.json` for drift detection.

## 5. Detect Drift

Configure baseline comparison in `bellwether.yaml`:

```yaml
baseline:
  comparePath: "./bellwether-baseline.json"
  failOnDrift: true  # For CI/CD
```

Then run:

```bash
bellwether check
```

Or override in CI/CD:

```bash
bellwether check --fail-on-drift
```

## 6. Explore with LLM (Optional)

For deeper behavioral exploration using AI:

```bash
# Set API key (or use local Ollama)
bellwether auth

# Run LLM-powered exploration
bellwether explore
```

This generates:
- `AGENTS.md` - behavioral documentation
- `bellwether-explore.json` - exploration results

---

## Common Workflows

### Local Development

```bash
bellwether init "node ./src/server.js"
bellwether check                         # Validate schemas
bellwether baseline save                 # Save baseline
bellwether watch                         # Re-check on file changes (uses config)
```

### CI/CD Pipeline

```bash
bellwether check --fail-on-drift
```

### Security Audit

```bash
bellwether init --preset security "npx your-server"
bellwether explore                       # Deep exploration with security focus
```

### Comprehensive Documentation

```bash
bellwether init --preset thorough "npx your-server"
bellwether check                         # Generate CONTRACT.md
bellwether explore                       # Generate AGENTS.md
```

---

## Next Steps

- [CLI Reference](/cli/check) - Check and explore commands
- [Local Development](/guides/local-development) - Watch mode and continuous testing
- [CI/CD Integration](/guides/ci-cd) - GitHub Actions, GitLab CI
- [Cloud](/cloud) - Baseline history and verification badges
- [Configuration](/guides/configuration) - Customize bellwether.yaml

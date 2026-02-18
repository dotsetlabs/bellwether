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

This creates `bellwether.yaml` with your server command and settings. Most commands use this config file (`auth`, `discover`, and `registry` can run without one; `validate-config` can validate an explicit path via `--config`).

### Presets

| Preset | Optimized For | Description |
|:-------|:--------------|:------------|
| *(default)* | `check` | Free, fast, deterministic |
| `--preset ci` | `check` | CI-oriented defaults (`baseline.failOnDrift: true`) |
| `--preset local` | `explore` | LLM exploration with local Ollama (free) |
| `--preset security` | `explore` | Enables `check.security.enabled` and sets `llm.provider: anthropic` |
| `--preset thorough` | `explore` | Currently generates the same preset values as `security` |

## 3. Run Check (Free, Fast, Deterministic)

```bash
bellwether check
```

This discovers capabilities (tools, prompts, resources), validates schemas, and by default generates both docs and JSON (controlled by `output.format`):
- `CONTRACT.md` - structural documentation (configurable via `output.files.contractDoc`)
- `bellwether-check.json` - validation results (configurable via `output.files.checkReport`)

No API keys needed. No LLM costs. Deterministic output.

## 4. Save Baseline

```bash
bellwether baseline save
```

Creates a baseline for drift detection. With default config this is `.bellwether/bellwether-baseline.json` (configurable via `baseline.path` / `baseline.savePath`).

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

This generates docs and/or JSON based on `output.format` (default is both):
- `AGENTS.md` - behavioral documentation (configurable via `output.files.agentsDoc`)
- `bellwether-explore.json` - exploration results (configurable via `output.files.exploreReport`)

---

## Common Workflows

Bellwether has a focused default path: `init` -> `check` -> `baseline`.
Use advanced commands only when you explicitly need deeper analysis.

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
bellwether check                         # Generate CONTRACT.md (if output.format includes docs)
bellwether explore                       # Generate AGENTS.md (if output.format includes docs)
```

`thorough` is currently a naming preset only; set `explore.personas` yourself if you want all personas enabled.

---

## Next Steps

- [CLI Reference](/cli/check) - Check and explore commands
- [Golden Paths](/guides/golden-paths) - Production-ready templates
- [Local Development](/guides/local-development) - Watch mode and continuous testing
- [CI/CD Integration](/guides/ci-cd) - GitHub Actions, GitLab CI
- [Configuration](/guides/configuration) - Customize bellwether.yaml

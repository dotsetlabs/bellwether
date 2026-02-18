---
slug: /
title: Introduction
sidebar_position: 1
---

# Bellwether

> **Catch drift in your MCP servers. Generate documentation for free.**

Bellwether is a CLI tool for **structural drift detection** in MCP servers. It catches breaking changes before deployment and can generate CONTRACT.md documentation as a byproduct (controlled by `output.format`)—all without requiring an LLM.

## What is MCP?

[Model Context Protocol (MCP)](https://modelcontextprotocol.io) is an open standard created by Anthropic for connecting AI assistants to external tools. When you hear "MCP server," think "a service that gives AI agents capabilities"—like reading files, querying databases, or calling APIs.

```
Your AI Assistant (Claude, GPT, Cursor, etc.)
        ↓
    MCP Protocol
        ↓
Your MCP Server (tools, data, capabilities)
```

---

## Why Bellwether?

| Problem | Solution |
|:--------|:---------|
| Breaking changes slip into production | **Drift detection** catches schema changes before deployment |
| Manual testing misses edge cases | **LLM-powered exploration** covers technical, security, QA, and novice perspectives |
| Security vulnerabilities go unnoticed | **Security persona** tests for path traversal, injection, info disclosure |
| Documentation gets stale | **CONTRACT.md / AGENTS.md** generated from actual behavior |

## Two Commands

| Command | Cost | Best For |
|:--------|:-----|:---------|
| **`bellwether check`** | Free | CI/CD, fast checks, schema validation, drift detection |
| **`bellwether explore`** | ~$0.01-0.15 | Deep testing, documentation, security audits (requires LLM) |

See [Test Modes](/concepts/test-modes) for details.

## Product Positioning

Bellwether has a tight two-tier model:

- **Core workflow (default)**: `init`, `check`, `baseline`
- **Advanced workflow (opt-in)**: `explore`, `watch`, `discover`, `golden`, `contract`, `registry`, `validate-config`

Most teams should start and stay in the core workflow for CI/CD drift prevention.

## Quick Example

```bash
# Install
npm install -g @dotsetlabs/bellwether

# Initialize configuration with your server command (required before most commands)
bellwether init npx @mcp/your-server

# Run check (free, fast, deterministic)
bellwether check

# Save baseline for drift detection
bellwether baseline save

# Detect drift in CI (configure baseline path in bellwether.yaml)
bellwether check --fail-on-drift
```

## What You Get

### From `bellwether check` (free, no LLM):
- **CONTRACT.md** - Structural documentation of tool schemas and parameters (generated when `output.format` includes docs; configurable via `output.files.contractDoc`)
- **bellwether-check.json** - Machine-readable validation results (generated when `output.format` includes `json`; configurable via `output.files.checkReport`)
- **`.bellwether/bellwether-baseline.json`** - Default baseline location for drift comparison (configurable via `baseline.path` / `baseline.savePath`)

### From `bellwether explore` (requires LLM):
- **AGENTS.md** - Behavioral documentation from multi-persona exploration (generated when `output.format` includes docs; configurable via `output.files.agentsDoc`)
- **bellwether-explore.json** - Detailed exploration results (generated when `output.format` includes `json`; configurable via `output.files.exploreReport`)

Both JSON reports include a `$schema` pointer for validation against the published report schemas.

## Next Steps

- [Installation](/installation) - Install and configure Bellwether
- [Quick Start](/quickstart) - Run your first check
- [Core vs Advanced](/concepts/core-vs-advanced) - Keep your workflow focused
- [Test Modes](/concepts/test-modes) - Understand check vs explore
- [CLI Reference](/cli/check) - Full command documentation
- [CI/CD Integration](/guides/ci-cd) - Integrate with GitHub Actions, GitLab CI
- [Golden Paths](/guides/golden-paths) - Copy-paste adoption templates
- [Compatibility Policy](/concepts/compatibility-policy) - Versioning and deprecations

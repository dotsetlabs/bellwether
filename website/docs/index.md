---
slug: /
title: Introduction
sidebar_position: 1
---

# Bellwether

> **Test your MCP servers. Catch drift. Get documentation for free.**

Bellwether is a CLI tool for **behavioral drift detection** in MCP servers. It catches regressions before deployment and generates AGENTS.md documentation as a byproduct.

## What is MCP?

[Model Context Protocol (MCP)](https://modelcontextprotocol.io) is an open standard created by Anthropic for connecting AI assistants to external tools. When you hear "MCP server," think "a service that gives AI agents capabilities"—like reading files, querying databases, or calling APIs.

```
Your AI Assistant (Claude, GPT, Cursor, etc.)
        ↓
    MCP Protocol
        ↓
Your MCP Server (tools, data, capabilities)
```

**Already familiar with MCP?** Skip to [Quick Start](/quickstart).

---

## Why Bellwether?

| Problem | Solution |
|:--------|:---------|
| Breaking changes slip into production | **Drift detection** catches regressions before deployment |
| Manual testing misses edge cases | **Multi-persona testing** covers technical, security, QA, and novice perspectives |
| Security vulnerabilities go unnoticed | **Security persona** tests for path traversal, injection, info disclosure |
| Documentation gets stale | **AGENTS.md** is generated from actual behavior |

## Two Testing Modes

| Mode | Cost | Best For |
|:-----|:-----|:---------|
| **Structural** (default) | Free | CI/CD, fast checks, schema validation |
| **Full** | ~$0.01-0.15 | Deep testing, documentation, security audits |

See [Test Modes](/concepts/test-modes) for details.

## Quick Example

```bash
# Install
npm install -g @dotsetlabs/bellwether

# Initialize (structural mode is free)
bellwether init "npx @modelcontextprotocol/server-filesystem /tmp"

# Run test
bellwether test

# Save baseline for drift detection
bellwether baseline save
```

## What You Get

After running a test, Bellwether generates:

- **AGENTS.md** - Documentation of tool behavior, parameters, error handling
- **bellwether-report.json** - Machine-readable test results
- **bellwether-baseline.json** - Baseline for future drift comparison

## Next Steps

- [Installation](/installation) - Install and configure Bellwether
- [Quick Start](/quickstart) - Run your first test
- [Test Modes](/concepts/test-modes) - Choose between structural and full modes
- [CLI Reference](/cli/init) - Full command documentation
- [Cloud](/cloud) - Baseline history and verification badges

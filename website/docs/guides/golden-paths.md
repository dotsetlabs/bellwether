---
title: Golden Paths
sidebar_position: 3
---

# Golden Paths

Use these copy-paste workflows to adopt Bellwether quickly without over-configuring.

## 1) Core CI Drift Detection (Recommended)

Best for most teams. Deterministic, fast, and no LLM required.

```bash
bellwether init --preset ci npx @mcp/your-server
bellwether check
bellwether baseline save
```

Then run in CI:

```bash
bellwether check --fail-on-drift
```

Reference template:

- `examples/ci/github-actions/bellwether-core.yml`

## 2) Local Development Loop

Use core checks continuously while building your MCP server.

```bash
bellwether init npx @mcp/your-server
bellwether check
bellwether watch
```

Reference template:

- `examples/config/bellwether.core.yaml`

## 3) Optional Deep Exploration

Opt in only when you need deeper behavior analysis.

```bash
bellwether init --preset local npx @mcp/your-server
bellwether explore
```

Reference template:

- `examples/config/bellwether.local-ollama.yaml`

## 4) GitLab Core Pipeline

Reference template:

- `examples/ci/gitlab-ci/bellwether-core.yml`

## Selection Rule

Start with the core workflow.

Only add advanced commands (`explore`, `golden`, `contract`) when there is a specific need that core drift detection does not cover.

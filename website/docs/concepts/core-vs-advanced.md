---
title: Core vs Advanced
sidebar_position: 1
---

# Core vs Advanced

Bellwether is designed to stay focused. Most users should use the core workflow only.

## Core Workflow (Default)

Use this for day-to-day reliability and CI gating:

1. `bellwether init`
2. `bellwether check`
3. `bellwether baseline save`
4. `bellwether check --fail-on-drift` (in CI)

Core workflow characteristics:

- Deterministic
- Fast
- No LLM required
- Low operational complexity

## Advanced Workflow (Opt-in)

Use advanced commands when you need deeper analysis beyond structural drift:

- `explore` for LLM behavioral probing
- `watch` for local continuous checks
- `discover` for quick capability inspection
- `golden` for output-level regression tests
- `contract` for explicit contract validation
- `registry` for MCP server discovery

Advanced workflow characteristics:

- More configuration options
- Potential model/runtime cost
- Higher surface area

## Scope Rule

Default to core unless there is a clear reason to opt in.

This keeps Bellwether deployments stable, understandable, and cheap to run.

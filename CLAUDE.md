# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
npm run build          # Compile TypeScript to dist/
npm run dev            # Watch mode compilation
npm test               # Run all tests (vitest)
npm run test:watch     # Run tests in watch mode
npm run lint           # ESLint check
npm run lint:fix       # ESLint with auto-fix
npm run format         # Prettier format
npm run format:check   # Prettier check
```

### Running a Single Test
```bash
npx vitest run test/baseline/comparator.test.ts        # Run one file
npx vitest run -t "should detect schema changes"       # Run by test name
```

### Testing the CLI Locally
```bash
npm run build && node dist/cli/index.js check          # Build then run
```

## Architecture Overview

Bellwether is an MCP (Model Context Protocol) server testing tool with two main modes:
- **check** - Deterministic schema drift detection (free, no LLM)
- **explore** - LLM-powered behavioral testing and documentation generation

### Core Layers

**Transport Layer** (`src/transport/`)
- `MCPClient` - Main client connecting to MCP servers
- Supports stdio (local subprocess), SSE, and HTTP transports
- Handles JSON-RPC protocol for MCP communication

**Discovery** (`src/discovery/`)
- Probes MCP servers to enumerate tools, prompts, and resources
- Returns `DiscoveryResult` with server capabilities

**Interview System** (`src/interview/`)
- `Orchestrator` - Uses LLM to generate test questions and analyze responses
- `Interviewer` - Executes tool calls and collects results
- Supports personas for customizing interview style (edge cases, security focus, etc.)

**Baseline System** (`src/baseline/`)
- `saver.ts` - Creates `BehavioralBaseline` from interview results
- `comparator.ts` - Compares baselines to detect drift (100% deterministic)
- Detects: tool additions/removals, schema changes, description changes, workflow failures
- Response fingerprinting for structural change detection

**CLI Commands** (`src/cli/commands/`)
- `check.ts` - Schema validation and drift detection
- `explore.ts` - LLM behavioral exploration
- `baseline.ts` - Save/compare/accept baselines
- `init.ts` - Generate bellwether.yaml config

**LLM Abstraction** (`src/llm/`)
- `LLMClient` interface with OpenAI, Anthropic, Ollama implementations
- Factory pattern in `factory.ts` for provider selection
- Supports streaming responses

### Key Data Types

- `InterviewResult` - Complete results from interviewing an MCP server
- `BehavioralBaseline` - Serializable snapshot for comparison
- `BehavioralDiff` - Result of comparing two baselines (tools added/removed/modified, severity)
- `ToolFingerprint` - Per-tool snapshot including schema hash, response patterns, errors

### Testing Patterns

Tests are in `test/` mirroring `src/` structure. The test framework uses Vitest with:
- `pool: 'forks'` in vitest.config.ts (supports process.chdir())
- `testTimeout: 10000` for longer integration tests
- Mock MCP servers for transport testing

## Configuration

Config file: `bellwether.yaml` (generated via `bellwether init`)
- Server command and args
- LLM provider settings
- Test scenarios and workflows
- Severity thresholds

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | No changes |
| 1 | Info-level changes |
| 2 | Warning-level changes |
| 3 | Breaking changes |
| 4 | Runtime error |

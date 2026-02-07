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
- Supports stdio (local subprocess), SSE, and HTTP (streamable) transports
- Handles JSON-RPC protocol for MCP communication
- Stores negotiated protocol version after `initialize()`

**Discovery** (`src/discovery/`)
- Probes MCP servers to enumerate tools, prompts, resources, and resource templates
- Returns `DiscoveryResult` with server capabilities

**Interview System** (`src/interview/`)
- `Orchestrator` - Uses LLM to generate test questions and analyze responses (explore mode)
- `Interviewer` - Executes tool calls and collects results
- `schema-test-generator.ts` - Generates deterministic schema-based tests (check mode)
- `prompt-test-generator.ts` - Generates deterministic prompt tests (check mode)
- `resource-test-generator.ts` - Generates deterministic resource tests (check mode)
- Supports personas for customizing interview style (edge cases, security focus, etc.)

**Baseline System** (`src/baseline/`)
- `saver.ts` - Creates `BehavioralBaseline` from interview results
- `comparator.ts` - Compares baselines to detect drift (100% deterministic)
- `accessors.ts` - Converts between `ToolFingerprint` and `ToolCapability`
- `converter.ts` - Creates baselines from interview results with protocol version gating
- Detects: tool additions/removals, schema changes, description changes, annotation changes, output schema changes, execution/task support changes, server instruction changes, prompt/resource title changes, workflow failures
- Response fingerprinting for structural change detection

**Protocol Version Gating** (`src/protocol/`)
- `version-registry.ts` - Single source of truth for MCP version-to-feature-flag mapping
- Supported versions: `2024-11-05`, `2025-03-26`, `2025-06-18`, `2025-11-25`
- `MCPFeatureFlags` interface with 9 boolean flags: `toolAnnotations`, `entityTitles`, `completions`, `resourceAnnotations`, `structuredOutput`, `serverInstructions`, `httpVersionHeader`, `tasks`, `icons`
- `getSharedFeatureFlags(v1, v2)` returns AND-intersection for cross-version baseline comparison
- All downstream code uses `MCPFeatureFlags` (never version strings) to gate behavior

**CLI Commands** (`src/cli/commands/`)
- `check.ts` - Schema validation and drift detection (free, deterministic)
- `explore.ts` - LLM behavioral exploration and AGENTS.md generation
- `baseline.ts` - Save/compare/accept/diff/show baselines
- `init.ts` - Generate bellwether.yaml config
- `discover.ts` - Quick capability enumeration
- `watch.ts` - Continuous checking on file changes
- `auth.ts` - Manage LLM provider API keys
- `golden.ts` - Golden output regression testing
- `contract.ts` - Contract validation (generate/validate/show)
- `registry.ts` - Search MCP Registry for servers
- `validate-config.ts` - Validate bellwether.yaml without running tests

**LLM Abstraction** (`src/llm/`)
- `LLMClient` interface with OpenAI, Anthropic, Ollama implementations
- `FallbackLLMClient` for provider failover
- Factory pattern in `factory.ts` with auto-detection of available providers
- `token-budget.ts` - Token budget tracking and enforcement
- Supports streaming responses

**Documentation Generation** (`src/docs/`)
- `agents.ts` - Generates `AGENTS.md` (LLM-powered behavioral documentation)
- `contract.ts` - Generates `CONTRACT.md` (structural issues, bugs, validation results)
- `report.ts` - JSON report generation

**Security Testing** (`src/security/`)
- `security-tester.ts` - Runs security payload tests (SQL injection, XSS, path traversal, command injection, SSRF, error disclosure)
- `payloads.ts` - Security test payload definitions

**Workflow System** (`src/workflow/`)
- `executor.ts` - Workflow execution with state tracking
- `discovery.ts` - Automatic workflow discovery from tool dependencies
- `loader.ts` - Loads workflow definitions from config
- `auto-generator.ts` - Auto-generates workflows from tool metadata

**Other Modules**
- `src/auth/` - Credential storage with keychain integration
- `src/cache/` - Response caching with TTL
- `src/config/` - Config loading, validation, templates, and presets
- `src/constants/` - All constants grouped by feature (core, testing, registry)
- `src/contract/` - Contract-as-code validation
- `src/cost/` - LLM cost tracking
- `src/errors/` - Error types (LLMAuthError, LLMRateLimitError, etc.) and retry logic
- `src/logging/` - Pino-based structured logging
- `src/metrics/` - Metrics collection
- `src/persona/` - Built-in test personas (edge-case, security, QA, novice)
- `src/prompts/` - LLM prompt templates
- `src/registry/` - MCP Registry client
- `src/scenarios/` - YAML test scenario loading and evaluation
- `src/validation/` - Semantic type validation and testing

### Key Data Types

- `InterviewResult` - Complete results from interviewing an MCP server
- `BehavioralBaseline` - Serializable snapshot for comparison
- `BehavioralDiff` - Result of comparing two baselines (tools added/removed/modified, severity)
- `ToolFingerprint` - Per-tool snapshot used by comparator (schema hash, assertions, annotations, execution, performance metrics)
- `ToolCapability` - Per-tool data stored in baseline file (schema, description, performance, security)
- `MCPFeatureFlags` - Protocol version feature flags controlling version-gated comparisons
- `DiscoveryResult` - Server capabilities from discovery (tools, prompts, resources, resourceTemplates)

### Testing Patterns

Tests are in `test/` mirroring `src/` structure. The test framework uses Vitest with:
- `pool: 'forks'` in vitest.config.ts (supports process.chdir())
- `testTimeout: 10000` for longer integration tests
- Mock MCP servers in `test/fixtures/` for transport testing (supports `MOCK_PROTOCOL_VERSION` env var)

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
| 5 | Low confidence metrics |

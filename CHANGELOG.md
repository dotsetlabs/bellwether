# Changelog

All notable changes to this project will be documented in this file.

## [0.7.1] - 2026-01-22

### Improvements

- **Reduced npm package size**: Excluded source maps from published package (682 kB → 445 kB, 35% smaller)
- **Added CHANGELOG.md to package**: Now included in npm package for version history visibility

### Fixes

- Replaced `console.warn()` with structured logger in baseline loading for consistent log level filtering
- Removed unused function parameters in `cloud/client.ts` and `baseline/deprecation-tracker.ts`

## [0.7.0] - 2026-01-21

### Features

- **Drift acceptance workflow**: New `baseline accept` command to accept detected drift as intentional with full audit trail
  - Records who, when, why, and what changes were accepted
  - `--reason` option to document why drift was accepted
  - `--accepted-by` option to record who accepted (for CI/CD bots)
  - `--dry-run` option to preview acceptance without writing
  - `--force` flag required for accepting breaking changes
- **Accept drift during check**: New `--accept-drift` and `--accept-reason` flags for the check command to accept drift in one step
- **Acceptance metadata in baselines**: Baselines now include optional `acceptance` field with full audit trail for compliance and team visibility

### Fixes

- Fixed Date deserialization for `acceptance.acceptedAt` when loading baselines from JSON

### Documentation

- Added `baseline accept` subcommand documentation
- Updated `check` command docs with `--accept-drift` and `--accept-reason` options
- Added acceptance workflow options to CI/CD integration guide

## [0.6.1] - 2026-01-21

### Features

- **Verify command cloud submission**: Added `--project` option to submit verification results directly to Bellwether Cloud
- **Progress display**: Added progress bar for verification runs showing interview progress

### Changes

- **Default LLM models updated**: Changed OpenAI default to `gpt-4.1-nano` (budget-friendly, non-reasoning) and Ollama default to `qwen3:8b`
- **Preset providers updated**: Security and thorough presets now use Anthropic provider by default
- **Verify command**: Now requires config file; added `--config` option for explicit config path

### Documentation

- Added `cloud/diff.md` documentation for comparing baseline versions
- Updated documentation across all CLI commands with improved examples
- Enhanced verify command documentation with cloud submission examples

### Fixes

- Fixed test mocks to match updated default models and configurations

## [0.6.0] - 2026-01-20

Initial public beta release of Bellwether CLI.

### Features

- **Two testing modes**: `bellwether check` for free, deterministic schema validation and `bellwether explore` for LLM-powered behavioral exploration
- **Check mode**: Zero-cost structural drift detection without LLM dependencies, generates `CONTRACT.md`
- **Explore mode**: Multi-persona exploration with OpenAI, Anthropic, or Ollama, generates `AGENTS.md`
- **Four built-in personas**: Technical Writer, Security Tester, QA Engineer, and Novice User for comprehensive coverage
- **Baseline management**: Save, compare, and track schema changes over time with `bellwether baseline` commands
- **Drift detection**: Catch breaking changes before production with configurable severity levels
- **Workflow testing**: Define multi-step tool sequences with assertions and argument mapping
- **Custom scenarios**: YAML-based test definitions for repeatable validation
- **Watch mode**: Continuous testing during development with `bellwether watch`
- **MCP Registry integration**: Search and discover MCP servers with `bellwether registry`
- **Cloud integration**: Team collaboration, history tracking, and CI/CD support via Bellwether Cloud
- **Secure credential storage**: System keychain integration for API keys with `bellwether auth`
- **Multiple transports**: Support for stdio, SSE, and streamable-http MCP connections

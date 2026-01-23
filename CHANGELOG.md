# Changelog

All notable changes to this project will be documented in this file.

## [0.9.0] - 2026-01-23

### Documentation

- **Full documentation alignment**: Updated CLI docs, website guides, and README to match the config-first workflow and current command structure
- **New CLI references**: Added documentation for `bellwether golden` and `bellwether contract`
- **Cloud + registry updates**: Clarified config requirements, defaults, and registry overrides across cloud/registry pages

### GitHub Action

- **Action docs refresh**: Updated inputs, examples, and output filenames to match current action behavior
- **Config-first guidance**: Clarified config requirements and output directory expectations

### Developer Experience

- **Comprehensive .env example**: Added registry URL override and updated guidance for environment configuration

## [0.8.1] - 2026-01-22

### Features

- **Expanded credential resolution**: API keys can now be loaded from `.env` files
  - Project `.env` file (`./.env` in current working directory)
  - Global `.env` file (`~/.bellwether/.env`)
  - Resolution order: config → custom env var → standard env var → project .env → global .env → keychain
  - `bellwether auth status` now shows which `.env` file provided the key

### Fixes

- **Fixed check mode LLM dependency**: Check mode no longer creates an LLM orchestrator, removing unnecessary dependency on LLM configuration for schema-only validation
- **Fixed parallel tool testing config**: The `parallelTools` config flag is now properly respected; when disabled, uses sequential execution (concurrency=1)
- **Fixed `baselineExists()` for directories**: Now correctly returns `false` for directories instead of `true`
- **Fixed stdio transport error handling**: Invalid JSON in newline-delimited mode now emits an error event for consistent behavior with Content-Length mode
- **Fixed baseline-accept command tests**: Resolved 13 failing tests in `baseline-accept.test.ts`
  - Fixed schema hash mismatches by using computed `'empty'` hash for tools with empty interactions
  - Fixed integrity hash verification by computing valid hashes with `recalculateIntegrityHash()`
  - Fixed property order in test baselines to match Zod schema order (required for deterministic JSON serialization)
  - Fixed report path from `.bellwether/bellwether-check.json` to `bellwether-check.json`
  - Added missing `responseFingerprint` field to baseline fixtures to match `createBaseline()` output

## [0.8.0] - 2026-01-22

### Features

- **Granular exit codes**: Check command now returns semantic exit codes for CI/CD:
  - `0` = Clean (no changes)
  - `1` = Info-level changes (non-breaking)
  - `2` = Warning-level changes
  - `3` = Breaking changes
  - `4` = Runtime error
- **JUnit/SARIF output formats**: New `--format` option supports `junit` and `sarif` for CI integration
  - JUnit XML for Jenkins, GitLab CI, CircleCI test reporting
  - SARIF 2.1.0 for GitHub Code Scanning with rule IDs BWH001-BWH004
- **Configurable severity thresholds**: New `baseline.severity` config section
  - `minimumSeverity` - Filter changes below a severity level
  - `failOnSeverity` - CI failure threshold
  - `suppressWarnings` - Hide warning-level changes
  - `aspectOverrides` - Custom severity per change aspect
- **Parallel tool testing**: New `--parallel` and `--parallel-workers` options for faster checks
  - Tests tools concurrently with configurable worker count (1-10)
  - Uses mutex for MCP client serialization
- **Incremental checking**: New `--incremental` option to only test tools with changed schemas
  - Compares current schemas against baseline
  - Reuses cached fingerprints for unchanged tools
  - Significantly faster for large servers
- **Performance regression detection**: Track and compare tool latency
  - Captures P50/P95 latency and success rate per tool
  - New `--performance-threshold` option (default: 10%)
  - Flags tools with latency regression exceeding threshold
- **Enhanced CONTRACT.md**: Richer generated documentation
  - Quick reference table with success rates
  - Performance baseline section with latency metrics
  - Example usage from successful interactions (up to 2 per tool)
  - Categorized error patterns (Permission, NotFound, Validation, Timeout, Network)
  - Error summary section aggregating patterns across tools
- **Detailed schema diff**: Property-level schema change detection
  - Wired existing `compareSchemas()` into baseline comparison
  - Shows specific property additions, removals, and type changes
- **Edge case handling**: Improved robustness for enterprise workloads
  - Circular reference detection in schemas
  - Unicode normalization for property names
  - Binary content detection
  - Payload size limits (1MB schema, 10MB baseline, 5MB response)

### Configuration

- New `check:` section in `bellwether.yaml`:
  ```yaml
  check:
    incremental: false
    incrementalCacheHours: 168
    parallel: false
    parallelWorkers: 4
    performanceThreshold: 10
  ```
- New `baseline.severity:` section for configurable thresholds
- CI preset now enables parallel testing by default

### CLI Options

- `--format <fmt>` - Output format: text, json, compact, github, markdown, junit, sarif
- `--parallel` - Enable parallel tool testing
- `--parallel-workers <n>` - Number of concurrent workers (1-10)
- `--incremental` - Only test tools with changed schemas
- `--incremental-cache-hours <hours>` - Cache validity for incremental checking
- `--performance-threshold <n>` - Performance regression threshold (%)
- `--min-severity <level>` - Minimum severity to report
- `--fail-on-severity <level>` - CI failure threshold

### Documentation

- Updated all CLI documentation with new options
- Added output formats guide with JUnit/SARIF examples
- Added parallel and incremental checking documentation
- Updated CI/CD guide with new exit codes and severity thresholds
- Updated baselines documentation with performance metrics
- Updated GitHub Action documentation with new inputs/outputs

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

# Changelog

All notable changes to Bellwether will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.0] - 2026-01-17

### Breaking Changes

- **Removed `interview` command** - Replaced with the new `test` command
- **Removed `eval` command** - Baseline evaluation features have been simplified
- **Removed `feedback` command** - User feedback collection removed
- **Removed `profile` command** - Profile management removed
- **Removed interactive mode** - CLI is now fully non-interactive
- **Config file required** - `bellwether.yaml` is now required for running tests (use `bellwether init` to create one)
- **Simplified baseline system** - Removed semantic matching, embeddings, calibration, and telemetry

### Added

#### New `test` Command
- **Config-driven testing** - All settings read from `bellwether.yaml`
- Replaces the `interview` command with a simpler interface
- Optional server command argument (overrides config)
- Single `-c, --config` flag for custom config path

#### New `baseline` Command
- **Unified baseline management** - Replaces scattered baseline operations
- `bellwether baseline save [path]` - Save test results as baseline
- `bellwether baseline compare <path>` - Compare test results against baseline
- `bellwether baseline show [path]` - Display baseline contents
- `bellwether baseline diff <path1> <path2>` - Compare two baseline files
- Multiple output formats: text, json, markdown, compact
- Integrity verification for baseline files

#### Configuration Improvements
- **Config template generator** - `bellwether init` now generates fully documented YAML
- **Config validator** - Validates config before running tests
- **Preset support** - `bellwether init --preset ci|security|thorough|local`

### Changed

- **Simplified CLI structure** - Fewer commands, all settings in config file
- **Deterministic by default** - Structural mode (no LLM) is the default
- **Improved error messages** - Better diagnostics for common failures

### Removed

- `src/baseline/semantic.ts` - Semantic text matching
- `src/baseline/embeddings.ts` - Embedding-based comparison
- `src/baseline/calibration.ts` - Calibration system
- `src/baseline/telemetry.ts` - Telemetry collection
- `src/baseline/evaluation/` - Evaluation framework
- `src/cli/interactive.ts` - Interactive mode
- `src/utils/semantic.ts` - Semantic utilities

## [0.4.0] - 2026-01-17

### Added

#### Workflow Testing
- **Multi-step workflow testing** - Define sequences of tool calls that represent realistic usage patterns
  - New `--workflows <path>` flag to load workflow definitions from YAML
  - New `--discover-workflows` flag for LLM-based workflow discovery
  - New `--max-workflows <n>` flag to limit discovered workflows (default: 3)
  - New `--workflow-state-tracking` flag to monitor state changes during execution
  - New `--init-workflows` flag to generate sample `bellwether-workflows.yaml`
  - Workflow results included in AGENTS.md and JSON reports

#### Performance & Cost Control
- **Response caching** - Avoid redundant tool calls and LLM analysis
  - Caching enabled by default (`--cache`)
  - New `--no-cache` flag to disable caching for fresh results
- **Parallel persona execution** - Run persona interviews concurrently for faster execution
  - New `--parallel-personas` flag to enable parallel execution
  - New `--persona-concurrency <n>` flag to limit concurrency (default: 3)
- **Token budget management** - Prevent runaway costs
  - New `--max-tokens <n>` flag to set maximum total tokens
  - Token tracking per model with context window limits
- **Automatic fallback** - Graceful degradation when LLM providers fail
  - New `--fallback` flag to enable automatic Ollama fallback
- **Streaming output** - Real-time LLM response display
  - New `--stream` flag to enable streaming output
  - New `--quiet` flag to suppress streaming (log final results only)
- **Metrics display** - Detailed performance and cost information
  - New `--show-metrics` flag to display timing, tokens, and costs after interview

#### LLM Improvements
- **Fallback client** - Automatic provider switching on failures
  - Tries primary provider, falls back to Ollama on error
  - Configurable fallback model
- **Improved refusal handling** - Better handling of Anthropic Claude refusals
  - Detects content policy refusals
  - Provides clearer error messages
- **Better streaming** - Improved streaming support across all providers
  - Consistent callback signatures
  - Operation context in callbacks

#### Metrics Collection
- **Performance metrics** - Detailed timing information
  - Per-operation timing (question generation, analysis, synthesis)
  - Aggregated statistics (avg, p50, p95, max)
- **Token tracking** - Input/output token counts
  - Per-operation token usage
  - Total token consumption
  - Cost estimation

### Changed

- **Centralized version management** - All version references now use `src/version.ts`
- **Streaming callback interface** - Added operation context to all callbacks
  - `onStart(operation, context?)` - Operation name and optional context
  - `onChunk(chunk, operation)` - Chunk text and operation name
  - `onComplete(text, operation)` - Full text and operation name
  - `onError(error, operation)` - Error and operation name
- **Interactive mode personas** - Now uses actual built-in persona names
  - Changed from non-existent 'friendly', 'adversarial' to 'technical_writer', 'security_tester', etc.

### Fixed

- Replaced placeholder "in a real implementation" comment with actual logging in persona loader
- Fixed hard-coded version '0.1.0' in MCP client to use centralized VERSION constant
- Fixed streaming callback signature mismatches between `InterviewStreamingCallbacks` and `OrchestratorStreamingCallbacks`
- Fixed missing `--quiet` CLI option declaration in interview command
- Fixed interactive mode referencing non-existent personas ('friendly', 'adversarial', etc.)
- Fixed flaky timing test in metrics collector

## [0.3.0] - 2026-01-15

### Added

- **Structured Logging** - Production-ready logging with pino
  - New `--log-level` flag: debug, info, warn, error, silent (default: info)
  - New `--log-file <path>` flag to write logs to a file
  - JSON-structured log output for better observability
  - Comprehensive logging across all CLI commands

- **Secure API Key Storage** - System keychain integration
  - New `bellwether auth` command for managing API keys
  - `bellwether auth` (no subcommand) - Interactive setup wizard
  - `bellwether auth status` - Show authentication status for all providers
  - `bellwether auth add [provider]` - Add or update an API key
  - `bellwether auth remove [provider]` - Remove key from keychain
  - `bellwether auth clear` - Remove all stored API keys
  - Supports `openai` and `anthropic` providers
  - Keys stored securely using OS keychain (macOS Keychain, Windows Credential Vault, Linux libsecret)

- **Global Configuration** - User-wide API key support
  - Support for global `~/.bellwether/.env` file
  - API keys in global config apply to all projects
  - Project-level `.env` overrides global settings
  - Keychain credentials loaded if env vars not set

- **Configuration Initialization** - Easy project setup
  - New `bellwether init` command to create `bellwether.yaml` configuration file
  - `--force` flag to overwrite existing config
  - Generates documented config with sensible defaults

- **Resource Testing** - MCP resources are now discovered and tested
  - Resources discovered via `resources/list` are automatically interviewed
  - New `listResources()` and `readResource()` methods on MCPClient
  - Resource profiles with content previews in AGENTS.md output
  - Support for text and binary resource types

- **MCP Registry Integration** - Search and discover MCP servers
  - New `bellwether registry [query]` command to search MCP Registry
  - Browse official registry at https://registry.modelcontextprotocol.io
  - Shows package managers, run commands, and transport types
  - `--json` flag for machine-readable output
  - `--limit` flag to control number of results

- **GitHub Action** - Easy CI/CD integration
  - New `action/action.yml` composite action
  - Configurable presets: docs, security, thorough, ci
  - Supports baseline comparison with `--fail-on-drift`
  - Custom scenarios file support
  - Automatic Node.js setup and Bellwether installation

- **Verified by Bellwether Program** - Server certification system
  - New `bellwether verify` command for server certification
  - Four verification tiers: Bronze, Silver, Gold, Platinum
  - Tier determination based on test coverage and pass rate
  - Generates verification reports in JSON format
  - Shields.io-compatible badge URLs for README embedding
  - 90-day verification validity with expiration tracking

- **Remote MCP Server Support** - Connect to remote MCP servers via SSE or Streamable HTTP transports
  - New `--transport` flag: `stdio` (default), `sse`, `streamable-http`
  - New `--url` flag for remote server URL
  - New `--session-id` flag for authentication
  - Works with both `interview` and `discover` commands

- **Custom Test Scenarios (YAML)** - Define custom test scenarios alongside LLM-generated tests
  - New `bellwether-tests.yaml` file format for tool and prompt scenarios
  - New `--scenarios <path>` flag to specify custom scenarios file
  - New `--scenarios-only` flag to run only custom scenarios (no LLM required)
  - New `--init-scenarios` flag to generate sample YAML template
  - Auto-detection: loads `bellwether-tests.yaml` from output directory if present
  - Support for assertions: `exists`, `equals`, `contains`, `truthy`, `type`, `not_error`
  - Scenario results displayed in CLI output and included in reports

- **Performance Reporting** - Response time metrics in AGENTS.md output
  - New "Performance" section in generated documentation
  - Metrics per tool: call count, avg, p50, p95, max response times
  - Error rate per tool with highlighting for high rates (>50%)
  - "Performance Insights" subsection for slow tools (>1s avg) and unreliable tools (>30% errors)

### Changed

- AGENTS.md now includes Quick Reference section with tool signatures
- AGENTS.md now includes Resources section when resources are present
- Updated documentation website with comprehensive guides
- Updated LLM model references to latest versions (gpt-5-mini, claude-haiku-4-5)

### Fixed

- `--scenarios-only` mode now truly skips all LLM calls (free, deterministic testing)
- Various CLI enhancement fixes and improvements
- Security vulnerability fixes (critical, high, and medium severity)

## [0.2.0] - 2026-01-13

### Added

- **Prompt Testing** - MCP prompts are now interviewed alongside tools
  - Prompts discovered via `prompts/list` are automatically tested
  - Prompt profiles included in AGENTS.md output
  - Support for prompt arguments validation

- **Embeddable Verification Badge** - New `bellwether badge` command
  - Shields.io-compatible badge URLs
  - Shows verification status and last check date
  - Easy README integration

- **Preset Shortcuts** - Simplified CLI configurations
  - `--preset docs` - Technical Writer, 3 questions
  - `--preset security` - Technical + Security personas
  - `--preset thorough` - All 4 personas, 5 questions
  - `--preset ci` - Quick mode optimized for CI

- **Summary Command Enhancement** - Better `discover` output
  - `bellwether summary` alias for `discover`
  - Rich formatted output with capability overview
  - Quick start suggestions with presets

## [0.1.0] - 2026-01-01

### Added

- Initial release
- Core interview functionality with LLM-guided testing
- Multi-persona support (Technical Writer, Security Tester, QA Engineer, Novice User)
- AGENTS.md generation
- Drift detection with baseline comparison
- Multiple output formats (Markdown, JSON)
- CI/CD integration support
- Cloud sync for baseline history
- OpenAI, Anthropic, and Ollama LLM provider support

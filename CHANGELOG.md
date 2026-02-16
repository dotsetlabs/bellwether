# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.1.2] - 2026-02-16

### Added

- **Remote MCP header auth support** across config, transport, and CLI:
  - `server.headers` and `discovery.headers` configuration
  - `-H/--header` overrides on `check`, `explore`, and `discover`
  - `ServerAuthError` classification with auth-aware retry behavior
- **Header parsing utilities and tests** for validated, case-insensitive CLI/config header merging.

### Changed

- **Remote diagnostics and guidance**: improved auth/connection error hints in `check`, `explore`, `discover`, and `watch`.
- **Capability handling**: `check`/`explore` now continue when prompts/resources exist even if no tools are exposed.
- **Documentation refresh** across README + website guides/CLI references to align with current auth, config, and command behavior.
- **Release consistency tooling**: simplified consistency validation by removing checks tied to deleted policy files.

### Fixed

- **Remote preflight stream cleanup**: preflight now cancels response bodies to avoid leaving open remote streams before transport initialization.
- **Broken documentation links and stale examples**: removed/updated outdated references and invalid CLI examples.

### Removed

- **Man page generation and distribution** (`man/`, `scripts/generate-manpage.sh`, `man:generate` script).
- **Husky/lint-staged workflow** and related hook files.
- **Repository files no longer maintained** (`ROADMAP.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`).

## [2.1.1] - 2026-02-14

### Changed

- **Product focus tightening**: Clarified the core workflow (`init`, `check`, `baseline`) and repositioned advanced commands as opt-in in CLI/docs.
- **Release quality hardening**: Added stronger consistency checks and documentation alignment to reduce drift between code behavior and published guidance.

## [2.1.0] - 2026-02-11

### Changed

- **Remove all emoji from CLI and documentation output**: Replaced ~40 unique emoji characters across 35+ files with professional text-based alternatives. Terminal output now uses `[PASS]`/`[FAIL]`/`[WARN]`/`[INFO]` labels; markdown reports use plain-text severity badges (`CRITICAL`, `HIGH`, `MEDIUM`, `LOW`, `OK`); trend indicators use `Improved`/`Degraded`/`Stable`/`New`/`Resolved`. Improves accessibility, log-friendliness, and CI compatibility.
- **Annotation-aware tool ordering**: `getDependencyOrder()` now sorts readOnly tools first and destructive tools last within each dependency layer, producing safer execution sequences.

### Added

- **Test fixtures configuration**: New `testFixtures` option on `InterviewConfig` allows overriding default parameter values for schema-generated tests. Stateful test runner respects fixture keys and will not overwrite user-provided values.

## [2.0.1] - 2026-02-07

### Added

- **MCP protocol version gating**: New `src/protocol/` module with version-to-feature-flag mapping
  - Supports MCP protocol versions: `2024-11-05`, `2025-03-26`, `2025-06-18`, `2025-11-25`
  - `MCPFeatureFlags` interface with 9 feature flags (`toolAnnotations`, `entityTitles`, `completions`, `resourceAnnotations`, `structuredOutput`, `serverInstructions`, `httpVersionHeader`, `tasks`, `icons`)
  - `getSharedFeatureFlags(v1, v2)` computes AND-intersection for cross-version baseline comparison
  - All version-specific fields in baselines are now gated by protocol version during conversion and comparison
- **Version-gated drift detection**: Comparator now detects changes in version-specific fields
  - Tool annotations (readOnlyHint, destructiveHint, idempotentHint, openWorldHint)
  - Entity titles (tool, prompt, resource, and resource template titles)
  - Output schema and structured output changes
  - Execution/task support changes
  - Server instructions changes
- **MCPClient protocol version tracking**: Client stores negotiated protocol version after `initialize()`, exposes via getters
- **Mock server protocol version support**: Mock MCP server now supports `MOCK_PROTOCOL_VERSION` env var for testing

### Fixed

- **20 production-blocking bugs across all layers** (`4717ca1`):
  - Transport: HTTP transport URL construction, SSE error event handling, MCP client error propagation
  - Discovery: ResourceTemplate type handling, discovery error handling
  - Baseline: Converter version-gated field handling, saver hash calculation, comparator severity logic
  - CLI: Check command exit code handling, explore command cleanup, baseline command error paths
  - Config: Environment variable expansion edge cases
  - Docs: Contract and agents generator error handling
- **Protocol version gating gaps causing false negatives and data loss** (`dce73ed`):
  - Fixed tool title comparison using wrong feature flag (`toolAnnotations` instead of `entityTitles`)
  - Fixed tool title comparison condition (AND → OR) to detect added/removed titles
  - Added missing `execution` and `baselineP99Ms` fields to `ToolFingerprint` type
  - Added missing fields (`title`, `outputSchema`, `outputSchemaHash`, `annotations`, `execution`, `baselineP99Ms`) to `toToolCapability()` accessor — prevents data loss during incremental check merges
  - Added `execution` and `baselineP99Ms` mapping to `getToolFingerprints()` accessor
  - Added prompt title comparison gated by `entityTitles` flag
  - Added resource title comparison gated by `entityTitles` flag
  - Added resource template title comparison gated by `entityTitles` flag
  - Added execution/task support comparison gated by `tasks` flag
  - Added server instructions comparison gated by `serverInstructions` flag
  - Gated resource template `title` in converter by `entityTitles` flag
- **Clean JSON output from baseline commands** (`7aab450`):
  - `baseline compare --format json` no longer appends summary text after JSON object
  - `baseline diff --format json` no longer prepends header or appends summary text around JSON object
  - JSON output is now machine-parseable without text contamination

## [2.0.0] - 2026-02-04

### Breaking Changes

- **Removed cloud-related baseline modules**: The following exports have been removed from the public API:
  - `ai-compatibility-scorer.ts` - AI compatibility scoring
  - `change-impact-analyzer.ts` - Change impact analysis (`analyzeToolChangeImpact`, `analyzeDiffImpact`, `isBreakingChange`, etc.)
  - `deprecation-tracker.ts` - Deprecation tracking (`checkDeprecations`, `markAsDeprecated`, `getDeprecatedTools`, etc.)
  - `health-scorer.ts` - Health scoring (`calculateHealthScore`, `formatHealthScore`, `HEALTH_SCORING`, etc.)
  - `migration-generator.ts` - Migration guide generation (`generateMigrationGuide`, `formatMigrationGuideMarkdown`, etc.)
  - `pr-comment-generator.ts` - PR comment generation (`generatePRComment`, `generateCompactPRComment`, etc.)
  - `risk-scorer.ts` - Risk scoring (`calculateRiskScore`, `generateRiskScoreMarkdown`, etc.)
  - `scenario-generator.ts` - Auto scenario generation (`generateToolScenarios`, `generateBaselineScenarios`, etc.)
  - `schema-evolution.ts` - Schema evolution timeline (`buildServerTimeline`, `getSchemaChanges`, etc.)
  - `test-pruner.ts` - Test pruning (`calculatePruningDecisions`, `prioritizeTools`, etc.)
  - `cloud-types.ts` - Cloud type definitions
  - `constants/cloud.ts` - Cloud constants
- **Renamed baseline function**: `createCloudBaseline()` renamed to `createBaselineFromInterview()`
- **Removed `PERFORMANCE` constant export** from `performance-tracker.ts`

### Added

- **Deterministic prompt testing**: New `prompt-test-generator.ts` for generating deterministic tests for MCP prompts without requiring LLM calls
- **Deterministic resource testing**: New `resource-test-generator.ts` for generating deterministic tests for MCP resources
- **Interview insights module**: New `insights.ts` module with `buildInterviewInsights()` for deriving semantic inferences, schema evolution, and error analysis
- **Baseline format types**: New `baseline-format.ts` with enhanced types:
  - `PersonaInterview` and `PersonaFinding` for structured interview results
  - `ResourceCapability` and `PromptCapability` for resource/prompt discovery
  - Enhanced `ToolCapability` with observed schema tracking and security fingerprints
  - `ResponseSchemaEvolution` and `DocumentationScoreSummary` types
- **Registry constants**: New `constants/registry.ts` for MCP Registry integration
- **Man pages**: Added `man/bellwether.1` and `man/bellwether.1.md` for Unix manual pages
- **Explore report schema**: New `schemas/bellwether-explore.schema.json` for JSON report validation
- **JSON schema embedding**: JSON reports now include `$schema` pointer for IDE validation
- **Expanded behavior aspects**: `BehaviorAspect` type now includes `prompt`, `resource`, `server`, `capability`

### Changed

- **Simplified baseline system**: Removed cloud-specific baseline logic in favor of a single, self-contained format
- **Enhanced schema comparison**: Expanded `schema-compare.ts` with improved property-level diff detection
- **Improved comparator**: Enhanced `comparator.ts` with better change detection and categorization
- **SSE transport improvements**: Refactored `sse-transport.ts` for better reliability and error handling
- **Response cache enhancements**: Improved `response-cache.ts` with better TTL management
- **Interview system refinements**: Updated `interviewer.ts` and `schema-test-generator.ts` for deterministic test merging
- **Stateful test runner**: Enhanced `stateful-test-runner.ts` with improved state management

### Documentation

- Updated all CLI documentation for consistency
- Added JSON schema validation pointers to output format docs
- Updated GitHub Action examples to v2.0.0
- Improved baseline and CI/CD documentation
- Enhanced configuration guide with new options

### Internal

- Removed ~13,600 lines of cloud-related code
- Added ~2,600 lines of deterministic testing and baseline improvements
- Consolidated test files, removing 12 test files for deleted modules
- Added new tests for prompt/resource generators and enhanced schema comparison

### Migration Guide

If you were importing from the `@dotsetlabs/bellwether` library API:

1. **Baseline functions**: Replace `createCloudBaseline()` with `createBaselineFromInterview()`

2. **Removed exports**: The following modules are no longer available. If you depended on them, you'll need to implement alternatives:
   - Health scoring, deprecation tracking, migration generation
   - PR comment generation, risk scoring, scenario generation
   - AI compatibility scoring, test pruning, schema evolution timeline

3. **CLI users**: No changes required. The CLI interface remains fully compatible.

## [1.0.3] - 2026-02-02

### Added

- Added `version` input to GitHub Action for explicit npm version selection
  - Action now derives version from ref (e.g., `v1.0.3`) or accepts explicit `inputs.version`
  - Provides clear error message when version cannot be determined
- Added `signal` option to LLM completion requests for request cancellation via AbortSignal
- Added AbortController integration to timeout utilities for proper request cancellation
- Added JSON extraction from mixed LLM responses (handles prose around JSON blocks)

### Changed

- Improved timeout handling with AbortController propagation across LLM and transport layers
- Improved error handling and resource cleanup in interview, orchestrator, and transport modules
- Refactored response cache, workflow executor, and state tracker for better reliability
- Updated CI/CD and GitHub/GitLab integration documentation

### Fixed

- Fixed GitHub Action stderr handling in check command output capture
- Fixed various code formatting and linting issues across LLM clients and transport modules

## [1.0.2] - 2026-01-30

### Added

- Added SARIF and JUnit output format support for `bellwether check` without baseline comparison
  - Use `--format sarif` for GitHub Code Scanning integration
  - Use `--format junit` for CI/CD test reporting
- Added registry validation indicators showing environment variable requirements
  - Servers requiring setup now display ⚙ indicator
  - Environment variables show ✓/✗ status based on whether they're set
  - Automatic detection of common service patterns (postgres→DATABASE_URL, etc.)
  - Setup hints displayed for unconfigured servers

### Changed

- Security and thorough presets now enable security testing by default (`check.security.enabled: true`)

### Fixed

- Fixed baseline path resolution in `baseline compare` to be consistent with `baseline show`
  - Now checks both output directory and current working directory before failing
- Fixed `bellwether auth status` requiring a config file
  - Auth commands now work without bellwether.yaml present
- Fixed ANSI escape codes appearing in non-TTY output (e.g., when piping to files)
  - StreamingDisplay now checks for TTY before applying ANSI styling
  - Automatically respects `NO_COLOR` and `FORCE_COLOR=0` environment variables

## [1.0.1] - 2026-01-29

### Added

- Added `$VAR` syntax support for environment variable interpolation in config files
- Added rate limiting to registry client (5 req/s default)
- Added `AnthropicClient` and `OllamaClient` exports to public API
- Added `repository.directory` and `funding` fields to package.json
- Added required permissions documentation to GitHub Action
- Added debug logging for all credential operations
- Added warning when environment variables in config are not resolved

### Changed

- Optimized GitHub Action to run check once; SARIF and JUnit are now converted from JSON output
- Removed test coverage exclusion for CLI entry point
- Removed unnecessary type casts in check.ts and security-tester.ts
- Replaced magic number 100 with PERCENTAGE_CONVERSION.DIVISOR constant
- Removed dead code sections from constants
- Refactored string concatenation to template literals in CLI output modules

### Fixed

- Fixed version fallback inconsistency (0.13.0 → 1.0.1)
- Fixed missing pino-pretty dependency
- Fixed non-null assertion for remoteUrl in check.ts (added proper null check)
- Fixed non-null assertion for incrementalResult in check.ts
- Added debug logging to catch blocks in keychain.ts (graceful degradation with visibility)
- Fixed flaky test in workflow executor (timing assertion)
- Fixed test failures in baseline-accept tests (process.exit mock)

## [1.0.0] - 2026-01-27

### Breaking Changes

- **Removed cloud commands**: The following commands have been removed: `login`, `upload`, `projects`, `history`, `diff`, `link`, `teams`, `badge`
- **Removed benchmark command**: The `benchmark` command and "Tested with Bellwether" certification program have been removed
- **Removed cloud module**: All cloud integration code has been removed from the CLI

### Changed

- **Fully open source**: Bellwether is now a completely free, open-source tool with no cloud dependencies
- **Simplified configuration**: Removed cloud-related settings from `bellwether.yaml` template
- **Updated documentation**: Removed all cloud-related documentation

### Migration Guide

If you were using cloud features:

1. **Baselines**: Store baselines in git instead of uploading to cloud
   ```bash
   bellwether baseline save
   git add bellwether-baseline.json
   git commit -m "Add baseline"
   ```

2. **CI/CD**: Use local baseline comparison instead of cloud upload
   ```bash
   # Old
   bellwether upload --ci --fail-on-drift

   # New
   bellwether check --fail-on-drift
   bellwether baseline compare ./bellwether-baseline.json
   ```

3. **Environment variables**: Remove `BELLWETHER_SESSION`, `BELLWETHER_API_URL`, `BELLWETHER_TEAM_ID` from your CI/CD configuration

## [0.13.0] - 2026-01-27

### Breaking Changes

- **Renamed `bellwether verify` to `bellwether benchmark`**: The verification command has been renamed to better reflect its purpose
  - Old: `bellwether verify <server-command>`
  - New: `bellwether benchmark <server-command>`
- **Renamed "Verified by Bellwether" to "Tested with Bellwether"**: Updated branding throughout the CLI and documentation
  - Badge text now shows "Tested with Bellwether"
  - Status values changed: `verified` → `passed`, `not_verified` → `not_tested`
- **Config section renamed**: The `verify:` section in `bellwether.yaml` is now `benchmark:`
  - Old: `verify: { timeout: 30000 }`
  - New: `benchmark: { timeout: 30000 }`
- **Output file renamed**: Default benchmark report file changed from `bellwether-verification.json` to `bellwether-benchmark.json`
- **Cloud API changes**: Benchmark-related API endpoints have been renamed
  - `/verifications` → `/benchmarks`
  - Activity events: `verification.completed` → `benchmark.completed`, `verification.failed` → `benchmark.failed`

### Changed

- All CLI output messages updated to use "benchmark" terminology
- Documentation updated throughout to reflect new naming
- Badge command description updated to reference "benchmark badge"
- Constants renamed: `VERIFICATION_TIERS` → `BENCHMARK_TIERS`, `DEFAULT_VERIFICATION_REPORT_FILE` → `DEFAULT_BENCHMARK_REPORT_FILE`

### Migration Guide

1. Update your `bellwether.yaml` config file:
   ```yaml
   # Old
   verify:
     timeout: 30000

   # New
   benchmark:
     timeout: 30000
   ```

2. Update any CI/CD scripts:
   ```bash
   # Old
   bellwether verify npx @mcp/server

   # New
   bellwether benchmark npx @mcp/server
   ```

3. Update any references to the output file:
   - `bellwether-verification.json` → `bellwether-benchmark.json`

## [0.12.0] - 2026-01-26

### Features

- **Streamable HTTP transport improvements**: Full compliance with [MCP Streamable HTTP specification](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports)
  - Fixed Accept header to include both `application/json` and `text/event-stream` as required by spec
  - Added automatic session ID capture from `Mcp-Session-Id` response header
  - Session ID is automatically included in all subsequent requests after initialization
  - Changed header name from `X-Session-Id` to `Mcp-Session-Id` per MCP specification
- **False positive reduction**: Intelligent pattern detection to reduce false positives in automated testing
  - **Operation-based tool detection**: Tools with `operation` enum + `args` object patterns now use flexible `either` outcome
  - **Self-stateful tool detection**: Tools requiring prior state (session/chain/context) are handled appropriately
  - **Complex array schema detection**: Arrays with nested objects containing required properties use flexible validation
  - **Flexible semantic validation**: Semantic type tests now use `either` outcome by default, allowing tools to accept varied formats (e.g., dayjs, date-fns)
- **Pattern detection metadata**: Test metadata now includes detection flags for transparency
  - `operationBased`, `operationParam`, `argsParam` for operation-based tools
  - `selfStateful`, `selfStatefulReason` for stateful tools
  - `hasComplexArrays`, `complexArrayParams` for complex schema tools

### Configuration

- **New semantic validation option**: `check.flexibleSemanticTests` (default: `true`)
  - When `true`, semantic validation tests use `either` outcome
  - Set to `false` for strict format enforcement

### Documentation

- Updated remote-servers guide with correct streamable-http protocol details
- Added MCP specification link for transport documentation
- Clarified session ID behavior and Accept header requirements

### Fixes

- **Streamable HTTP session management**: Fixed session ID header to use MCP-compliant `Mcp-Session-Id`
- **False positive tests**: Tests for operation-based, self-stateful, and complex array patterns no longer fail incorrectly

### Tests

- Added 17 HTTP transport tests including session ID capture verification
- Added 11 new pattern detection tests for false positive reduction

## [0.11.0] - 2026-01-26

### Breaking Changes

- **Removed `baseline migrate` command**: Baseline migration is no longer needed with the unified format
  - Old baselines from incompatible versions should be recreated with the current CLI
  - The `--info` and `--dry-run` flags for migration are also removed
- **Removed `--cloud` flag from `baseline save`**: All baselines now use a single unified format
  - Previously: `baseline save --cloud` for cloud-compatible format
  - Now: `baseline save` always saves in the unified format compatible with both local and cloud
- **Credential file format changed**: The file-based credential backend now uses `~/.bellwether/.env` format
  - Previously: `~/.bellwether/credentials.json` (plain text JSON)
  - Now: `~/.bellwether/.env` (encrypted at rest with AES-256-GCM)
  - Encryption key auto-generated and stored in `~/.bellwether/.env.key`
  - Existing credentials will need to be re-added via `bellwether auth add <provider>`

### Features

- **Unified baseline format**: Single canonical baseline schema for both local and cloud use
  - Eliminates the need for format conversion when uploading to cloud
  - Simplified baseline structure with consistent field naming
  - New `hash` field replaces `integrityHash` for consistency with cloud API
  - Metadata now grouped under `metadata` object (mode, generatedAt, cliVersion, etc.)
  - Tool data now split into `capabilities.tools` and `toolProfiles` for better separation
- **Baseline accessor functions**: New utility functions for safe baseline field access
  - `getBaselineGeneratedAt()`, `getBaselineMode()`, `getBaselineServerCommand()`
  - `getToolFingerprints()` - Converts unified format to legacy ToolFingerprint array
  - `verifyBaselineHash()` - Replaces `verifyIntegrity()` for hash validation
- **Improved baseline validation**: Enhanced Zod schemas for stricter baseline validation
  - Tool capabilities now validated against cloud schema
  - Performance metrics include min/max bounds
  - Security fingerprints validated as structured objects
- **Config-optional commands**: `registry` and `discover` commands now work without a `bellwether.yaml` config file
  - Uses sensible defaults (30s timeout, stdio transport)
  - Enables quick ad-hoc server exploration without project setup
  - Config settings still apply when present
- **Coordinate value generation**: Smart detection of lat/lng fields with realistic defaults
  - Detects `lat`, `latitude`, `lng`, `longitude` field names
  - Generates San Francisco coordinates (37.7749, -122.4194) as default
  - Improves test reliability for geo-aware tools
- **Pagination value generation**: Smart detection of pagination parameters
  - Detects `limit`, `offset`, `page`, `page_size`, `per_page` field names
  - Uses sensible defaults: `limit=10`, `offset=0`, `page=1`
  - Handles both offset-based and page-based pagination
- **Test fixtures configuration**: New `check.testFixtures` config option for custom test values
  - `parameterValues`: Exact match overrides (e.g., `latitude: 40.7128`)
  - `patterns`: Regex-based overrides (e.g., `.*_id$: "fixture_id_123"`)
  - Exact matches take precedence over patterns
  - Enables production-like testing with realistic fixture values
- **Discovery anomaly detection**: Warnings for server capability mismatches
  - Warns when server advertises capabilities but returns no items
  - Collects and displays transport-level errors
  - Helps identify misconfigured or partially initialized servers
- **Issue classification**: CONTRACT.md now categorizes issues by source
  - **Server Bug**: Actual bugs in MCP server code
  - **External Dependency**: Issues from unconfigured services (Plaid, Stripe, etc.)
  - **Environment**: Missing environment variables or configuration
  - **Validation**: Expected rejections of invalid input
  - Helps users focus on real bugs vs configuration issues
- **Transport error collection**: MCP client now tracks transport-level errors
  - Errors categorized by type (initialization, transport, protocol, timeout)
  - Included in discovery results for debugging
- **Remote MCP server support**: All core commands now support remote servers via SSE and streamable-http transports
  - `check`, `explore`, `verify`, and `watch` commands can connect to remote MCP servers
  - Configure in `server:` section with `transport`, `url`, and `sessionId` fields
  - Example: `transport: sse`, `url: https://your-server.example.com/mcp`
  - Validation updated to require URL for remote transports, command for stdio
- **Encrypted credential storage**: File-based credential backend now encrypts API keys at rest
  - Uses AES-256-GCM authenticated encryption
  - Encryption key auto-generated per installation (`~/.bellwether/.env.key`)
  - Credentials stored in `~/.bellwether/.env` with `enc:` prefix
  - Transparent decryption at CLI startup

### Enhanced CONTRACT.md Output

- **Issues Detected section**: New table showing classified issues by category
- **Transport errors section**: Shows transport-level errors encountered during discovery
- **Improved skip reasons**: Better explanations for skipped tools (missing env vars, external services)

### Configuration Changes

- **New config option**: `check.testFixtures` for custom test value overrides
  ```yaml
  check:
    testFixtures:
      parameterValues:
        latitude: 40.7128
        longitude: -74.0060
        limit: 25
      patterns:
        - match: ".*_id$"
          value: "fixture_id_12345"
  ```
- **New server config options**: Transport settings for remote MCP servers
  ```yaml
  server:
    transport: sse  # stdio (default), sse, or streamable-http
    url: "https://your-server.example.com/mcp"
    sessionId: "optional-session-id"  # For authenticated remote servers
  ```

### Internal Changes

- Removed `src/baseline/migrations.ts` - No longer needed with unified format
- Removed `src/cli/commands/baseline-migrate.ts` - Migration command removed
- Added `src/baseline/accessors.ts` - Safe field accessor utilities
- Added `src/baseline/baseline-hash.ts` - Hash calculation for baselines
- Simplified `src/baseline/saver.ts` by removing dual-format logic (~450 lines removed)
- Simplified `src/baseline/converter.ts` - Now only converts from interview results to baseline
- Updated all tests to use unified baseline format
- Added encryption utilities to `src/auth/keychain.ts` for secure credential storage
- Added `validateConfigForVerify()` for verify command config validation
- **Comprehensive test coverage**: Added ~4,500 lines of new integration tests
  - `test/baseline/comparator.test.ts` - 47 tests for baseline comparison
  - `test/baseline/converter.test.ts` - 43 tests for interview-to-baseline conversion
  - `test/baseline/saver.test.ts` - 32 tests for baseline save/load operations
  - `test/baseline/accessors.test.ts` - 23 tests for baseline accessor functions
  - `test/interview/schema-inferrer.test.ts` - 30 tests for response schema inference
  - `test/cli/commands/check.test.ts` - 41 integration tests for check command
  - `test/workflow/executor.test.ts` - 37 integration tests for workflow execution
  - Tests use mock MCP servers for reliable, deterministic execution

### Documentation

- Updated README to remove migration command examples
- Updated baseline versioning documentation to recommend recreating incompatible baselines
- Removed migration workflow from troubleshooting guide
- Updated website documentation for remote server configuration
- Updated CLI command documentation with transport options

### Fixes

- **Config validation**: Added validation for `testFixtures` configuration schema
- **Verify command**: Changed `--security` flag description to "optional for any tier" (was incorrectly marked as required for gold+)
- **Credentials test**: Fixed keychain source detection in tests (now correctly identifies `global-env` vs `keychain`)

## [0.10.2] - 2026-01-25

### Features

- **Device ID tracking**: CLI now generates a stable device ID per install for better session management
  - Stored in `~/.bellwether/device-id`
  - Sent during device auth flow for session tracking
- **Improved beta login flow**: Clearer 3-option menu for beta access
  - Option 1: Enter a new invitation code
  - Option 2: Sign in directly (for users with existing beta access)
  - Option 3: Join the waitlist

### Fixes

- **Fixed check mode baseline uploads**: Check mode baselines now upload correctly to cloud
  - Personas array is now empty for check mode (no personas used)
  - Model is set to 'none' for check mode
  - Interviews array is now empty for check mode
  - Previously these fields contained incorrect default values
- **Unified baseline format**: CLI now writes and uploads a single canonical baseline schema
  - Removed local/cloud split and baseline migration command

## [0.10.1] - 2026-01-24

### Fixes

- **Fixed missing cloud upload fields**: Added missing performance and security fields to cloud baseline uploads
  - `baselineP50Ms`, `baselineP95Ms`, `baselineSuccessRate` for latency baselines
  - `performanceConfidence` object with sample counts and confidence levels
  - `securityFingerprint` for security testing results
  - Previously these fields were collected during check but not included in cloud uploads

## [0.10.0] - 2026-01-24

### Features

- **Smart test value generation**: New intelligent value generator that produces semantically valid test inputs by:
  - Recognizing patterns in field names (dates, emails, URLs, phone numbers, IDs, etc.)
  - Respecting JSON Schema `format` fields
  - Generating syntactically correct values more likely to be accepted by real tools
- **Stateful testing**: Tests can now share outputs between tool calls
  - Tool responses are parsed and stored in a shared state map
  - Subsequent tool calls can inject values from prior outputs (e.g., IDs created by one tool used by another)
  - Configurable via `check.statefulTesting.enabled` and `check.statefulTesting.shareOutputsBetweenTools`
  - Maximum chain length configurable via `check.statefulTesting.maxChainLength`
- **Rate limiting**: Token bucket rate limiter for tool calls
  - Configurable requests per second and burst limits
  - Exponential or linear backoff strategies
  - Automatic retry on rate limit errors
  - Enabled via `check.rateLimit.enabled` in config
- **Response assertions**: Semantic validation of tool responses
  - Automatic schema inference from successful responses
  - Configurable strict mode for assertion failures
  - Assertion results tracked per interaction and aggregated per tool
  - Enabled via `check.assertions.enabled` in config
- **External service detection enhancements**: Improved detection with confidence levels
  - `confirmed`: Error messages from the service were observed
  - `likely`: Strong evidence from tool name/description patterns
  - `possible`: Weak evidence, partial matches
  - Evidence breakdown for transparency (fromErrorMessage, fromToolName, fromDescription)
  - Service configuration status tracking (configured, sandboxAvailable, mockAvailable)
- **Warmup runs**: Skip initial runs before timing samples to account for cold starts
  - Configurable 0-5 warmup runs via `check.warmupRuns`
- **Config validation warnings**: Non-blocking warnings for configuration issues
  - Displayed before check runs without failing
  - Helps catch common misconfigurations early
- **Tool-by-tool progress reporting**: Live progress shows reliability and timing per tool as they complete

### Enhanced CONTRACT.md Output

- **Quick Reference table enhancements**: Now includes P50 latency, confidence indicators
- **Metrics legend section**: Explains confidence levels and reliability calculations
- **Validation testing section**: Separate metrics for validation tests vs happy-path tests
- **Issues detected section**: Aggregated summary of detected issues across tools
- **Stateful testing section**: Shows state sharing relationships between tools
- **External service configuration section**: Documents detected external services and their status
- **Response assertions section**: Documents inferred schemas and assertion rules
- **Skipped tool handling**: Tools skipped due to missing external service config are documented

### Configuration Changes

- **New config options**:
  - `check.warmupRuns` - Number of warmup runs before timing (default: 0)
  - `check.smartTestValues` - Enable smart value generation (default: true)
  - `check.statefulTesting.*` - Stateful testing configuration
  - `check.externalServices.*` - External service handling (skip/mock/test modes)
  - `check.assertions.*` - Response assertion configuration
  - `check.rateLimit.*` - Rate limiting configuration
  - `check.metrics.countValidationAsSuccess` - Count validation rejections as success (default: true)
  - `check.metrics.separateValidationMetrics` - Separate validation from happy-path metrics (default: true)
  - `baseline.savePath` - Separate path for saving baselines (default: `.bellwether/bellwether-baseline.json`)
- **Changed defaults**:
  - `check.sampling.minSamples`: 3 → 10 (more samples for statistical confidence)
  - `check.sampling.targetConfidence`: 'medium' → 'low' (match the lower sample count)
  - `workflows.autoGenerate`: true → false (explicit opt-in for workflow discovery)
  - `workflows.requireSuccessfulDependencies`: new option (default: true)
- **Parallel testing + stateful testing**: Parallel mode automatically disabled when stateful testing is enabled (state sharing requires sequential execution)

### GitHub Action

- **Simplified inputs**: Removed CLI-flag-style inputs that are now config-only:
  - Removed: `fail-on-drift`, `parallel`, `parallel-workers`, `incremental`, `incremental-cache-hours`, `performance-threshold`, `security`
  - These are now configured in `bellwether.yaml` only
- **Improved config path handling**: Action now properly resolves config paths and copies existing configs when needed
- **New exit code**: Added exit code 5 for low-confidence results
- **Updated output descriptions**: Clarified severity levels and exit codes

### Documentation

- **README updates**: Added documentation for previously undocumented commands:
  - `auth add <provider>` and `auth remove <provider>` for managing LLM API keys
  - `baseline accept` command for accepting drift as intentional
  - `contract show` command for displaying generated CONTRACT.md
  - `teams current` command for showing active team
- **Website documentation**: Updated guides for configuration, CI/CD, workflows, and output formats

### Fixes

- **Fixed `-p` flag conflict**: Removed `-p` short flag from `init --preset` to avoid conflict with `upload -p/--project`. Use `--preset` for init command
- **Fixed stdio transport write error handling**: Added error handling for `output.write()` in stdio transport to properly emit errors when subprocess pipe breaks (EPIPE)
- **Fixed watch command signal handler cleanup**: Signal handlers (SIGINT/SIGTERM) are now properly removed on cleanup to prevent handler accumulation
- **Added debug logging to silent catches**: Silent catch blocks in Ollama client now log debug messages for better troubleshooting
- **Fixed minSamples override**: User's `minSamples` config is now respected exactly instead of being overridden by `targetConfidence` minimum

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

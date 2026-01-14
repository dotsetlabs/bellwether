# Changelog

All notable changes to Bellwether will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Remote MCP Server Support** - Connect to remote MCP servers via SSE or Streamable HTTP transports
  - New `--transport` flag: `stdio` (default), `sse`, `streamable-http`
  - New `--url` flag for remote server URL
  - New `--session-id` flag for authentication
  - Works with both `interview` and `discover` commands

- **Custom Test Scenarios (YAML)** - Define custom test scenarios alongside LLM-generated tests
  - New `bellwether-tests.yaml` file format for tool and prompt scenarios
  - New `--scenarios <path>` flag to specify custom scenarios file
  - New `--scenarios-only` flag to run only custom scenarios (no LLM)
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
- Updated documentation with new features and guides

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
- Multiple output formats (Markdown, JSON, SARIF, JUnit)
- CI/CD integration support
- Cloud sync for baseline history
- OpenAI, Anthropic, and Ollama LLM provider support

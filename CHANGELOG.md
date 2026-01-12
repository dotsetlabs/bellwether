# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-01-12

### Added
- Multi-provider LLM support (OpenAI, Anthropic Claude, Ollama)
- Cloud CLI commands (`login`, `link`, `upload`, `history`, `diff`)
- Behavioral drift detection with baseline comparison
- Profile management for different testing scenarios
- Watch command for automatic re-runs on file changes
- Interactive mode for interview approvals
- Cost tracking for LLM API usage
- Multiple output formats (Markdown, JSON, HTML, JUnit, SARIF)
- GitHub Action for CI/CD integration
- Workflow/chained interview testing
- Persona-based testing (technical_writer, security_tester, qa_engineer, novice_user)

### Changed
- Improved AGENTS.md documentation quality
- Better error messages and handling
- Enhanced MCP protocol support

### Fixed
- Timeout handling for slow MCP servers
- Unicode handling in tool responses

## [0.1.0] - 2025-12-01

### Added
- Initial release
- Basic MCP server interviewing
- AGENTS.md generation
- OpenAI LLM support
- Local baseline storage
- JSON report output

[0.2.0]: https://github.com/dotsetlabs/inquest/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/dotsetlabs/inquest/releases/tag/v0.1.0

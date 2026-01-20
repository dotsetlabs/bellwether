# Changelog

All notable changes to this project will be documented in this file.

## [0.6.0] - 2026-01-20

Initial public beta release of Bellwether CLI.

### Features

- **Two testing modes**: `bellwether check` for free, deterministic schema validation and `bellwether explore` for LLM-powered behavioral exploration
- **Contract mode**: Zero-cost structural drift detection without LLM dependencies, generates `CONTRACT.md`
- **Document mode**: Multi-persona exploration with OpenAI, Anthropic, or Ollama, generates `AGENTS.md`
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

# Contributing to Bellwether

Thank you for your interest in contributing to Bellwether! This document provides guidelines for contributing to the project.

## Code of Conduct

By participating in this project, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md). Please read it before contributing.

## Getting Started

### Prerequisites

- Node.js 20 or later
- npm

### Development Setup

```bash
# Clone the repository
git clone https://github.com/dotsetlabs/bellwether
cd bellwether

# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Validate docs/version consistency
npm run check:consistency

# Watch mode for development
npm run dev
```

## How to Contribute

### Reporting Bugs

1. Check [existing issues](https://github.com/dotsetlabs/bellwether/issues) to see if the bug has already been reported
2. If not, [create a new issue](https://github.com/dotsetlabs/bellwether/issues/new?template=bug_report.md) with:
   - A clear, descriptive title
   - Steps to reproduce the bug
   - Expected vs actual behavior
   - Your environment (Node.js version, OS, Bellwether version)
   - Any relevant logs or error messages

### Suggesting Features

1. Check [existing issues](https://github.com/dotsetlabs/bellwether/issues) and [discussions](https://github.com/dotsetlabs/bellwether/discussions) for similar suggestions
2. [Create a new issue](https://github.com/dotsetlabs/bellwether/issues/new?template=feature_request.md) with:
   - A clear description of the feature
   - The problem it solves
   - Example use cases
   - Any implementation ideas (optional)

### Good First Issues

Looking for a place to start? Check out issues labeled [`good first issue`](https://github.com/dotsetlabs/bellwether/labels/good%20first%20issue).

### Pull Requests

1. **Fork the repository** and create your branch from `main`
2. **Install dependencies**: `npm install`
3. **Make your changes**
4. **Write or update tests** for your changes
5. **Run tests**: `npm test`
6. **Run linting**: `npm run lint`
7. **Run consistency checks**: `npm run check:consistency`
8. **Commit your changes** with a clear commit message
9. **Push to your fork** and submit a pull request

## Architecture Overview

```
src/
├── auth/           # Credential storage & keychain integration
├── baseline/       # Drift detection, baseline management, comparator
├── cache/          # Response caching with TTL
├── cli/            # CLI commands, output formatting, utilities
│   ├── commands/   # Individual CLI commands (12 total)
│   ├── output/     # Terminal reporter
│   └── utils/      # CLI utilities (env, progress, server-context)
├── config/         # Configuration loading, validation, templates
├── constants/      # Constants grouped by feature (core, testing, registry)
├── contract/       # Contract-as-code validation
├── cost/           # LLM cost tracking
├── discovery/      # MCP server capability discovery
├── docs/           # Documentation generators (AGENTS.md, CONTRACT.md, JSON reports)
├── errors/         # Error types & retry logic
├── interview/      # Tool testing orchestration & execution
├── llm/            # Multi-provider LLM abstraction (OpenAI, Anthropic, Ollama)
├── logging/        # Pino-based structured logging
├── metrics/        # Metrics collection
├── persona/        # Built-in test personas
├── prompts/        # LLM prompt templates
├── protocol/       # MCP protocol version feature flags
├── registry/       # MCP Registry client
├── scenarios/      # YAML test scenario loading & evaluation
├── security/       # Security testing payloads & execution
├── transport/      # MCP communication (stdio, SSE, HTTP)
├── utils/          # Shared utilities (concurrency, formatting, sanitization)
├── validation/     # Semantic type validation & testing
└── workflow/       # Workflow discovery, execution, & state tracking
```

Key concepts:
- **Check mode**: Deterministic schema validation (no LLM) — generates `CONTRACT.md`
- **Explore mode**: LLM-powered behavioral testing — generates `AGENTS.md`
- **Baselines**: Snapshots for drift detection stored in git
- **Personas**: Different testing perspectives (edge-case, security, QA, novice)
- **Protocol version gating**: `src/protocol/version-registry.ts` maps MCP versions to feature flags; the comparator uses shared feature flags to only compare fields both versions support
- **Security testing**: Payload-based testing for SQL injection, XSS, path traversal, command injection, SSRF, error disclosure
- **Workflows**: Multi-step tool sequences with state tracking and assertions

## Code Style

- Use TypeScript for all source code
- Follow existing code patterns and conventions
- Use meaningful variable and function names
- Add JSDoc comments for public APIs
- Keep functions focused and reasonably sized

## Testing

- Write tests for new functionality
- Ensure all existing tests pass
- Use Vitest for testing
- Place tests in the `test/` directory, mirroring the `src/` structure

```bash
# Run all tests
npm test

# Run specific test file
npx vitest run test/path/to/file.test.ts

# Run tests matching pattern
npx vitest run -t "pattern"

# Watch mode
npm run test:watch
```

## Commit Messages

Use clear, descriptive commit messages:

```
feat: add support for custom personas
fix: handle timeout errors in MCP client
docs: update README with new CLI options
test: add tests for baseline comparison
refactor: simplify transport error handling
chore: update dependencies
```

Prefixes:
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `test:` - Test changes
- `refactor:` - Code refactoring
- `chore:` - Build/tooling changes

## Questions?

If you have questions about contributing:
- Open a [discussion](https://github.com/dotsetlabs/bellwether/discussions)
- Ask in an issue

Thank you for contributing!

# Contributing to Bellwether

Thank you for your interest in contributing to Bellwether! This document provides guidelines for contributing to the project.

## Code of Conduct

By participating in this project, you agree to maintain a respectful and inclusive environment for everyone.

## How to Contribute

### Reporting Bugs

1. Check [existing issues](https://github.com/dotsetlabs/bellwether/issues) to see if the bug has already been reported
2. If not, create a new issue with:
   - A clear, descriptive title
   - Steps to reproduce the bug
   - Expected vs actual behavior
   - Your environment (Node.js version, OS, etc.)
   - Any relevant logs or error messages

### Suggesting Features

1. Check [existing issues](https://github.com/dotsetlabs/bellwether/issues) for similar suggestions
2. Create a new issue with:
   - A clear description of the feature
   - The problem it solves
   - Example use cases
   - Any implementation ideas (optional)

### Pull Requests

1. **Fork the repository** and create your branch from `main`
2. **Install dependencies**: `npm install`
3. **Make your changes**
4. **Write or update tests** for your changes
5. **Run tests**: `npm test`
6. **Run linting**: `npm run lint`
7. **Commit your changes** with a clear commit message
8. **Push to your fork** and submit a pull request

## Development Setup

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/bellwether
cd bellwether

# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Watch mode for development
npm run dev
```

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

## Commit Messages

Use clear, descriptive commit messages:

```
feat: add support for custom personas
fix: handle timeout errors in MCP client
docs: update README with new CLI options
test: add tests for baseline comparison
```

Prefixes:
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `test:` - Test changes
- `refactor:` - Code refactoring
- `chore:` - Build/tooling changes

## Questions?

If you have questions about contributing, feel free to:
- Open a [discussion](https://github.com/dotsetlabs/bellwether/discussions)
- Ask in an issue

Thank you for contributing!

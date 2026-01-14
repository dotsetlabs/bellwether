---
title: Custom Test Scenarios
sidebar_position: 5
---

# Custom Test Scenarios

Define your own test scenarios in YAML to complement LLM-generated tests. Custom scenarios are useful for:

- **Regression testing**: Verify specific behaviors don't change
- **Edge cases**: Test scenarios the LLM might not think of
- **Compliance**: Ensure specific requirements are always tested
- **CI/CD**: Run deterministic tests without LLM costs

## Quick Start

```bash
# Generate a sample scenarios file
bellwether interview --init-scenarios

# Edit bellwether-tests.yaml with your scenarios

# Run interview with custom scenarios
bellwether interview npx your-server
```

## File Format

Create a `bellwether-tests.yaml` file in your project root:

```yaml
# bellwether-tests.yaml
version: "1"
description: Custom test scenarios for my MCP server

# Global tags applied to all scenarios
tags:
  - custom

# Tool test scenarios
scenarios:
  - tool: read_file
    description: Read a valid file
    category: happy_path
    args:
      path: "/tmp/test.txt"
    assertions:
      - path: content
        condition: exists

# Prompt test scenarios
prompts:
  - prompt: summarize
    description: Test summarize prompt
    args:
      text: "Sample text to summarize"
    assertions:
      - path: messages
        condition: exists
```

## Tool Scenarios

Each tool scenario defines a test case for a specific tool:

```yaml
scenarios:
  - tool: read_file           # Required: tool name
    description: Read file    # Optional: test description
    category: happy_path      # Optional: test category (default: happy_path)
    args:                     # Required: arguments to pass to the tool
      path: "/tmp/test.txt"
    assertions:               # Optional: verify response
      - path: content
        condition: exists
    skip: false               # Optional: skip this test
    tags:                     # Optional: tags for filtering
      - regression
```

### Categories

- `happy_path` - Normal, expected usage
- `edge_case` - Boundary conditions and unusual inputs
- `error_handling` - Invalid inputs and error conditions
- `boundary` - Limits and extremes
- `security` - Security-related tests

## Prompt Scenarios

Test MCP prompts with specific inputs:

```yaml
prompts:
  - prompt: translate         # Required: prompt name
    description: Test translation
    args:                     # All args must be strings
      text: "Hello, world!"
      language: "Spanish"
    assertions:
      - path: messages[0].content
        condition: contains
        value: "Hola"
```

:::note
Prompt arguments must always be strings, as per the MCP protocol specification.
:::

## Assertions

Assertions verify that tool/prompt responses meet expectations.

### Assertion Conditions

| Condition | Description | Value Required |
|:----------|:------------|:---------------|
| `exists` | Path exists (not undefined) | No |
| `equals` | Value equals expected | Yes |
| `contains` | String/array contains value | Yes |
| `truthy` | Value is truthy | No |
| `type` | Value is of type | Yes (`string`, `number`, `boolean`, `object`, `array`) |
| `not_error` | Response is not an error | No |

### Examples

```yaml
assertions:
  # Check that a field exists
  - path: content
    condition: exists

  # Check exact value
  - path: status
    condition: equals
    value: "success"

  # Check string contains substring
  - path: message
    condition: contains
    value: "completed"

  # Check array contains item
  - path: items
    condition: contains
    value: "target-item"

  # Check value is truthy
  - path: data.valid
    condition: truthy

  # Check value type
  - path: count
    condition: type
    value: number

  # Check response is not an error
  - path: result
    condition: not_error
    message: "Tool call should succeed"  # Custom error message
```

### Path Syntax

Paths use JSONPath-like syntax:

```yaml
# Simple property
path: content

# Nested property
path: result.data.value

# Array element
path: items[0]

# Nested array property
path: messages[0].content.text
```

## Usage Options

### Alongside LLM-Generated Tests

By default, custom scenarios run alongside LLM-generated tests:

```bash
bellwether interview --scenarios ./bellwether-tests.yaml npx your-server
```

### Custom Scenarios Only

Skip LLM generation entirely (faster, no API costs):

```bash
bellwether interview --scenarios-only npx your-server
```

### Auto-Detection

If `bellwether-tests.yaml` exists in the output directory, it's automatically loaded:

```bash
# Automatically loads ./bellwether-tests.yaml if it exists
bellwether interview npx your-server
```

## Best Practices

### 1. Start with Happy Paths

Define basic scenarios that should always pass:

```yaml
scenarios:
  - tool: read_file
    description: Read existing file
    category: happy_path
    args:
      path: "/tmp/known-file.txt"
    assertions:
      - path: content
        condition: exists
```

### 2. Add Error Cases

Test that errors are handled correctly:

```yaml
scenarios:
  - tool: read_file
    description: Handle missing file
    category: error_handling
    args:
      path: "/nonexistent/file.txt"
    assertions:
      - path: error
        condition: exists
```

### 3. Security Tests

Verify security boundaries:

```yaml
scenarios:
  - tool: read_file
    description: Reject path traversal
    category: security
    args:
      path: "../../etc/passwd"
    tags:
      - security
      - critical
```

### 4. Use Tags for Filtering

Tags help organize and filter scenarios:

```yaml
tags:
  - regression  # Global tag

scenarios:
  - tool: important_tool
    tags:
      - critical
      - production
```

### 5. Skip Dangerous Tests

Use `skip: true` for tests that shouldn't run automatically:

```yaml
scenarios:
  - tool: delete_all
    description: Dangerous operation
    skip: true
    args:
      confirm: true
```

## CI/CD Integration

Custom scenarios are perfect for CI/CD pipelines:

```yaml
# .github/workflows/bellwether.yml
name: MCP Testing
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run custom scenarios
        run: |
          npx @dotsetlabs/bellwether interview \
            --scenarios ./bellwether-tests.yaml \
            --scenarios-only \
            --ci \
            npx your-server
```

This approach:
- Runs deterministic tests (no LLM variability)
- No API costs
- Fast execution
- Same tests on every run

## Output

When custom scenarios are run, results are displayed:

```
Custom scenarios: 5/6 passed

Failed scenarios:
  - read_file: Handle missing file
    Assertion failed: Expected path "error" to exist
```

Scenario results are also included in:
- `AGENTS.md` documentation
- JSON report (`bellwether-report.json`)

## See Also

- [interview](/cli/interview) - CLI reference
- [CI/CD Integration](/guides/ci-cd) - Pipeline setup
- [Personas](/concepts/personas) - LLM-based testing personas

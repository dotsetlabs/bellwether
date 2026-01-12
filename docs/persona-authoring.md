# Persona Authoring Guide

Personas in Inquest define the "personality" of the interviewer when testing MCP servers. Different personas ask different types of questions, focusing on various aspects like documentation, security, edge cases, or usability.

## Overview

A persona shapes how Inquest interviews your MCP server by:

1. **System Prompt**: Instructs the LLM how to behave and what to focus on
2. **Question Bias**: Weights different categories of questions
3. **Categories**: Defines which types of tests to run
4. **Additional Context**: Provides specific patterns or examples to try

## Built-in Personas

Inquest comes with four built-in personas:

### Technical Writer

```yaml
id: technical_writer
focus: Documentation and realistic examples
categories: happy_path, edge_case, error_handling
```

The default persona. Creates comprehensive API documentation with practical examples developers can use as templates.

### Security Tester

```yaml
id: security_tester
focus: Vulnerability testing
categories: security, boundary, error_handling
```

Probes for security vulnerabilities like path traversal, command injection, SQL injection, SSRF, and information disclosure.

### QA Engineer

```yaml
id: qa_engineer
focus: Edge cases and error conditions
categories: edge_case, error_handling, boundary
```

Tests boundary values, type coercion, empty values, Unicode handling, and stress conditions.

### Novice User

```yaml
id: novice_user
focus: Usability and error messages
categories: error_handling, happy_path, edge_case
```

Tests common mistakes new users make and evaluates error message quality.

## Using Personas

### Via Configuration File

```yaml
# inquest.yaml
interview:
  personas:
    - technical_writer
    - security_tester
```

### Via Command Line

```bash
# Use default personas
inquest interview npx @mcp/server-example

# Use interactive mode to select personas
inquest interview --interactive
```

### Via Profiles

```bash
# Create a security-focused profile
inquest profile create security-audit
# Then configure personas in ~/.inquest/profiles/security-audit.yaml
```

## Creating Custom Personas

Custom personas are defined in YAML files. Create a file with the `.persona.yaml` extension:

### Basic Structure

```yaml
# my-persona.persona.yaml
id: my_custom_persona
name: My Custom Persona
description: Description of what this persona focuses on
systemPrompt: |
  You are a [role] testing an API.
  Your goal is to [objective].
  Focus on:
  - [Focus area 1]
  - [Focus area 2]

  Generate test cases that [desired behavior].
questionBias:
  happyPath: 0.3
  edgeCase: 0.3
  errorHandling: 0.2
  boundary: 0.1
  security: 0.1
categories:
  - happy_path
  - edge_case
  - boundary
additionalContext: |
  Specific patterns to try:
  - Pattern 1
  - Pattern 2
```

### Field Reference

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Unique identifier (snake_case recommended) |
| `name` | Yes | Human-readable display name |
| `description` | Yes | Brief description of the persona's focus |
| `systemPrompt` | Yes | LLM instructions (most important field) |
| `questionBias` | Yes | Weight distribution for question types |
| `categories` | Yes | List of question categories to use |
| `additionalContext` | No | Extra patterns, examples, or guidance |

### Question Bias Weights

The `questionBias` field controls how often different types of questions are asked:

| Category | Description | Example |
|----------|-------------|---------|
| `happyPath` | Normal, expected usage | `read_file("/valid/path.txt")` |
| `edgeCase` | Unusual but valid inputs | `read_file("file with spaces.txt")` |
| `errorHandling` | Invalid inputs, error conditions | `read_file("/nonexistent")` |
| `boundary` | Limits, extremes, constraints | `read_file("/very/deep/.../path")` |
| `security` | Security-focused tests | `read_file("../../etc/passwd")` |

Weights are relative (0.0-1.0). Higher weight = more questions of that type.

### Question Categories

Available categories for the `categories` field:

- `happy_path` - Standard usage patterns
- `edge_case` - Boundary values and unusual inputs
- `error_handling` - Invalid inputs and error conditions
- `boundary` - Limits and extremes
- `security` - Security vulnerability testing

## Example Custom Personas

### API Documentation Persona

For generating comprehensive API docs:

```yaml
id: api_documenter
name: API Documenter
description: Creates detailed API documentation with code examples
systemPrompt: |
  You are an API documentation specialist creating reference documentation.
  For each tool, generate:
  1. A clear one-line description
  2. Parameter documentation with types and constraints
  3. 2-3 realistic usage examples
  4. Expected return value format
  5. Common error scenarios

  Focus on practical, copy-pasteable examples.
questionBias:
  happyPath: 0.6
  edgeCase: 0.2
  errorHandling: 0.15
  boundary: 0.05
categories:
  - happy_path
  - error_handling
additionalContext: |
  For each tool, ensure you test:
  - All required parameters
  - Common optional parameter combinations
  - At least one error case
```

### Performance Tester Persona

For load testing and performance concerns:

```yaml
id: performance_tester
name: Performance Tester
description: Tests performance characteristics and resource limits
systemPrompt: |
  You are a performance engineer testing API performance characteristics.
  Your goal is to identify:
  - Response time variations
  - Resource limits (file sizes, list lengths)
  - Memory/timeout behaviors
  - Concurrent operation handling

  Generate test cases that probe limits without causing harm.
  Note any unusually slow responses or resource consumption.
questionBias:
  happyPath: 0.2
  edgeCase: 0.2
  errorHandling: 0.1
  boundary: 0.5
categories:
  - boundary
  - edge_case
additionalContext: |
  Performance tests to try:
  - Large inputs (1MB+ strings, 10000+ array items)
  - Many small operations in sequence
  - Operations on large files/datasets
  - Timeout boundary testing
```

### Compliance Checker Persona

For regulatory and policy compliance:

```yaml
id: compliance_checker
name: Compliance Checker
description: Verifies compliance with policies and regulations
systemPrompt: |
  You are a compliance auditor verifying that tools follow policies.
  Check for:
  - Data handling practices (PII, sensitive data)
  - Access control enforcement
  - Audit logging capabilities
  - Error message information disclosure
  - Input validation and sanitization

  Document any policy violations or concerns.
questionBias:
  happyPath: 0.2
  edgeCase: 0.2
  errorHandling: 0.3
  boundary: 0.1
  security: 0.2
categories:
  - security
  - error_handling
  - boundary
additionalContext: |
  Compliance checks:
  - Does the tool log access attempts?
  - Are error messages safe (no stack traces)?
  - Is sensitive data handled appropriately?
  - Are there proper access controls?
```

### Domain-Specific Persona (Database)

For database-specific MCP servers:

```yaml
id: database_tester
name: Database Tester
description: Tests database operations and query behaviors
systemPrompt: |
  You are a database administrator testing a database API.
  Focus on:
  - Query syntax validation
  - SQL injection prevention
  - Transaction handling
  - NULL value handling
  - Type coercion behaviors

  Test both valid SQL patterns and potential attack vectors.
questionBias:
  happyPath: 0.2
  edgeCase: 0.2
  errorHandling: 0.2
  boundary: 0.2
  security: 0.2
categories:
  - happy_path
  - security
  - error_handling
additionalContext: |
  SQL patterns to test:
  - SELECT, INSERT, UPDATE, DELETE
  - JOINs and subqueries
  - Injection: ' OR 1=1 --, UNION SELECT
  - NULL handling: IS NULL, COALESCE
  - Type boundaries: MAX_INT, empty strings
```

## Using Custom Personas

### From File

Reference your persona file in the configuration:

```yaml
# inquest.yaml
interview:
  personaFiles:
    - ./personas/api_documenter.persona.yaml
    - ./personas/compliance_checker.persona.yaml
```

### From Directory

Place persona files in a `personas/` directory:

```
project/
  personas/
    api_documenter.persona.yaml
    compliance_checker.persona.yaml
  inquest.yaml
```

Then reference by ID:

```yaml
# inquest.yaml
interview:
  personas:
    - api_documenter
    - compliance_checker
```

## Best Practices

### Writing Effective System Prompts

1. **Be specific about the role**: "You are a security researcher" is better than "Test security"

2. **List concrete focus areas**: Enumerate specific things to look for

3. **Provide actionable instructions**: Tell the persona what to do with findings

4. **Set appropriate boundaries**: "without causing harm" for destructive tests

### Balancing Question Bias

- **Documentation focus**: High `happyPath` (0.5+)
- **Security focus**: High `security` (0.3+), low `happyPath`
- **QA focus**: Balance `edgeCase` and `errorHandling`
- **Stress testing**: High `boundary` (0.4+)

### Using Additional Context

The `additionalContext` field is powerful for:

- Specific test patterns to try
- Domain-specific knowledge
- Lists of edge cases relevant to the server type
- Compliance requirements or checklists

### Combining Multiple Personas

Run multiple personas for comprehensive coverage:

```yaml
interview:
  personas:
    - technical_writer  # Documentation
    - security_tester   # Security
    - qa_engineer       # Edge cases
```

Each persona runs independently, and results are combined in the final report.

## Troubleshooting

### Persona Not Found

```
Error: Unknown persona: my_persona
```

- Ensure the persona file has `.persona.yaml` extension
- Check the `id` field matches what you're referencing
- Verify the file path in `personaFiles` is correct

### Ineffective Testing

If a persona isn't finding expected issues:

1. Review the `systemPrompt` - is it specific enough?
2. Check `questionBias` - are weights appropriate?
3. Add `additionalContext` with specific patterns
4. Increase `maxQuestionsPerTool` for more thorough testing

### Too Many Irrelevant Questions

If a persona asks unrelated questions:

1. Narrow the `categories` list
2. Adjust `questionBias` to focus on relevant types
3. Make `systemPrompt` more specific about what to ignore

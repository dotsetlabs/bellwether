---
title: Custom Personas
sidebar_position: 4
---

# Custom Personas

Create specialized personas for domain-specific testing of your MCP servers.

## Why Custom Personas?

Built-in personas cover common scenarios, but custom personas let you:
- Test domain-specific behavior (databases, APIs, file systems)
- Enforce organization-specific policies
- Focus on particular compliance requirements
- Create specialized security audits

## Basic Structure

Create a file with `.persona.yaml` extension:

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

## Field Reference

| Field | Required | Description |
|:------|:---------|:------------|
| `id` | Yes | Unique identifier (snake_case) |
| `name` | Yes | Human-readable display name |
| `description` | Yes | Brief description of focus |
| `systemPrompt` | Yes | LLM instructions (most important) |
| `questionBias` | Yes | Weight distribution for question types |
| `categories` | Yes | Question categories to use |
| `additionalContext` | No | Extra patterns, examples, guidance |

## Question Bias Weights

Control how often different types of questions are asked:

```yaml
questionBias:
  happyPath: 0.3      # Normal usage
  edgeCase: 0.3       # Unusual but valid
  errorHandling: 0.2  # Invalid inputs
  boundary: 0.1       # Limits and extremes
  security: 0.1       # Security-focused
```

Weights are relative (0.0-1.0). Higher weight = more questions of that type.

## Example Personas

### API Documentation

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
  security: 0.0
categories:
  - happy_path
  - error_handling
additionalContext: |
  For each tool, ensure you test:
  - All required parameters
  - Common optional parameter combinations
  - At least one error case
```

### Database Security

```yaml
id: database_security
name: Database Security Tester
description: Tests database operations for SQL injection and data exposure
systemPrompt: |
  You are a database security specialist testing a database API.
  Focus on:
  - SQL injection vulnerabilities
  - Parameter escaping
  - Query result limits
  - Error message information disclosure
  - Access control bypass

  Test both valid SQL patterns and potential attack vectors.
questionBias:
  happyPath: 0.1
  edgeCase: 0.1
  errorHandling: 0.2
  boundary: 0.2
  security: 0.4
categories:
  - security
  - error_handling
  - boundary
additionalContext: |
  SQL injection patterns to test:
  - ' OR 1=1 --
  - UNION SELECT
  - ; DROP TABLE
  - Nested queries
  - Comment injection
```

### Compliance Checker

```yaml
id: compliance_checker
name: Compliance Checker
description: Verifies compliance with security policies
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

### Performance Tester

```yaml
id: performance_tester
name: Performance Tester
description: Tests performance characteristics and resource limits
systemPrompt: |
  You are a performance engineer testing API performance.
  Your goal is to identify:
  - Response time variations
  - Resource limits (file sizes, list lengths)
  - Memory/timeout behaviors
  - Concurrent operation handling

  Generate test cases that probe limits without causing harm.
questionBias:
  happyPath: 0.2
  edgeCase: 0.2
  errorHandling: 0.1
  boundary: 0.5
  security: 0.0
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

## Using Custom Personas

### From Configuration

```yaml
# bellwether.yaml
interview:
  personaFiles:
    - ./personas/api_documenter.persona.yaml
    - ./personas/database_security.persona.yaml
  personas:
    - api_documenter
    - database_security
```

### From Directory

Place persona files in `personas/` directory:

```
project/
  personas/
    api_documenter.persona.yaml
    database_security.persona.yaml
  bellwether.yaml
```

### Via Command Line

```bash
bellwether check \
  --persona-file ./my-persona.persona.yaml \
  npx your-server
```

## Writing Effective Prompts

### Be Specific About Role

```yaml
# Good
systemPrompt: |
  You are a security researcher specializing in API vulnerabilities.

# Bad
systemPrompt: |
  Test security.
```

### List Concrete Focus Areas

```yaml
# Good
systemPrompt: |
  Focus on:
  - Path traversal attacks (../)
  - Command injection (;, |, &&)
  - SSRF through URL parameters

# Bad
systemPrompt: |
  Test for security issues.
```

### Set Boundaries

```yaml
# Good
systemPrompt: |
  Generate test cases that probe limits without causing harm.
  Do not attempt destructive operations.

# Bad
systemPrompt: |
  Try everything.
```

## Troubleshooting

### Persona Not Found

```
Error: Unknown persona: my_persona
```

- Ensure file has `.persona.yaml` extension
- Check `id` field matches what you're referencing
- Verify path in `personaFiles` is correct

### Ineffective Testing

If persona isn't finding expected issues:
1. Review `systemPrompt` - is it specific enough?
2. Check `questionBias` - are weights appropriate?
3. Add `additionalContext` with specific patterns
4. Increase `maxQuestionsPerTool`

## See Also

- [Personas](/concepts/personas) - Built-in personas
- [Configuration](/guides/configuration) - Using personas in config
- [check](/cli/check) - CLI options

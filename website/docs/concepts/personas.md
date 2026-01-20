---
title: Personas
sidebar_position: 4
---

# Personas

Personas define the "personality" of the interviewer when exploring MCP servers with `bellwether explore`. Different personas ask different types of questions, focusing on various aspects like documentation, security, edge cases, or usability.

:::info Explore Only
Personas are used with `bellwether explore`, which requires an LLM. The `bellwether check` command doesn't use personas—it performs deterministic schema validation.
:::

## How Personas Work

A persona shapes how Bellwether explores your MCP server by:

1. **System Prompt** - Instructs the LLM how to behave and what to focus on
2. **Question Bias** - Weights different categories of questions
3. **Categories** - Defines which types of tests to run
4. **Additional Context** - Provides specific patterns or examples to try

## Built-in Personas

Bellwether comes with four built-in personas:

### Technical Writer

```yaml
id: technical_writer
focus: Documentation and realistic examples
categories: happy_path, edge_case, error_handling
```

The **default persona**. Creates comprehensive API documentation with practical examples developers can use as templates.

**Best for:** Generating documentation, understanding normal behavior

### Security Tester

```yaml
id: security_tester
focus: Vulnerability testing
categories: security, boundary, error_handling
```

Probes for security vulnerabilities like path traversal, command injection, SQL injection, SSRF, and information disclosure.

**Best for:** Security audits, finding vulnerabilities

### QA Engineer

```yaml
id: qa_engineer
focus: Edge cases and error conditions
categories: edge_case, error_handling, boundary
```

Tests boundary values, type coercion, empty values, Unicode handling, and stress conditions.

**Best for:** Finding edge cases, testing error handling

### Novice User

```yaml
id: novice_user
focus: Usability and error messages
categories: error_handling, happy_path, edge_case
```

Tests common mistakes new users make and evaluates error message quality.

**Best for:** Evaluating usability, error message clarity

## Question Categories

Each persona weights these categories differently:

| Category | Description | Example |
|:---------|:------------|:--------|
| `happy_path` | Normal, expected usage | `read_file("/valid/path.txt")` |
| `edge_case` | Unusual but valid inputs | `read_file("file with spaces.txt")` |
| `error_handling` | Invalid inputs, error conditions | `read_file("/nonexistent")` |
| `boundary` | Limits, extremes, constraints | `read_file("/very/deep/.../path")` |
| `security` | Security-focused tests | `read_file("../../etc/passwd")` |

## Using Personas

### Via Configuration File

```yaml
# bellwether.yaml
explore:
  personas:
    - technical_writer
    - security_tester
  maxQuestionsPerTool: 3
```

Then run:

```bash
bellwether explore npx your-server
```

### Via Preset

```bash
# Security-focused exploration
bellwether init --preset security "npx your-server"
bellwether explore

# Comprehensive exploration with all personas
bellwether init --preset thorough "npx your-server"
bellwether explore
```

## Combining Personas

Run multiple personas for comprehensive coverage:

```yaml
explore:
  personas:
    - technical_writer  # Documentation
    - security_tester   # Security
    - qa_engineer       # Edge cases
    - novice_user       # Usability
```

Each persona runs independently, and results are combined in the final AGENTS.md report. This provides:
- Complete documentation from technical_writer
- Security findings from security_tester
- Edge cases and error handling from qa_engineer
- Usability insights from novice_user

## Persona Output

Each persona contributes different sections to AGENTS.md:

**Technical Writer** generates:
- Clear tool descriptions
- Parameter documentation
- Usage examples
- Expected return values

**Security Tester** generates:
- Security considerations
- Vulnerability notes
- Attack surface analysis

**QA Engineer** generates:
- Edge case documentation
- Error handling patterns
- Boundary conditions
- Limitations

**Novice User** generates:
- Usability observations
- Error message quality assessments
- Common mistake scenarios

## Recommendations

| Use Case | Recommended Personas |
|:---------|:--------------------|
| Quick documentation | `technical_writer` |
| Security audit | `security_tester` |
| Release testing | All four personas |
| Documentation | `technical_writer`, `novice_user` |
| Vulnerability scan | `security_tester`, `qa_engineer` |

## Creating Custom Personas

For specialized testing needs, you can create custom personas. See the [Custom Personas Guide](/guides/custom-personas).

## See Also

- [Custom Personas Guide](/guides/custom-personas) - Create your own personas
- [explore](/cli/explore) - Using personas in exploration
- [Check vs Explore](/concepts/test-modes) - When to use each command
- [Workflows](/concepts/workflows) - Multi-step testing

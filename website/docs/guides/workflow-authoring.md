---
title: Workflow Authoring
sidebar_position: 5
---

# Workflow Authoring

Create multi-step workflows to test realistic usage patterns of your MCP servers.

## When to Use Workflows

Workflows are useful when:
- Testing multi-step operations (CRUD, transactions)
- Verifying data flows between tools
- Testing authentication flows
- Validating state changes

## Creating a Workflow

Create a file with `.workflow.yaml` extension:

```yaml
# create-read-delete.workflow.yaml
id: crud_flow
name: CRUD Operations
description: Test create, read, update, delete cycle
expectedOutcome: Resource lifecycle works correctly
steps:
  - tool: create_resource
    description: Create new resource
    args:
      name: "Test Resource"
    assertions:
      - path: "$.id"
        condition: exists

  - tool: read_resource
    description: Read created resource
    argMapping:
      id: "$steps[0].result.id"
    assertions:
      - path: "$.name"
        condition: equals
        value: "Test Resource"

  - tool: delete_resource
    description: Clean up
    argMapping:
      id: "$steps[0].result.id"
    optional: true
```

## Step Configuration

### Static Arguments

```yaml
- tool: create_file
  args:
    path: /tmp/test.txt
    content: "Hello, World!"
```

### Dynamic Arguments (Argument Mapping)

Pass data from previous steps:

```yaml
- tool: get_user
  argMapping:
    id: "$steps[0].result.user_id"
```

### Combined Arguments

```yaml
- tool: update_user
  args:
    status: "active"
  argMapping:
    id: "$steps[0].result.user_id"
```

## JSONPath Reference

| Expression | Description |
|:-----------|:------------|
| `$steps[0].result` | First step's result |
| `$steps[0].result.id` | `id` field from first step |
| `$steps[1].result.items[0]` | First item from second step's array |
| `$steps[0].result.users[*].id` | All user IDs |

## Assertions

Verify step results:

```yaml
assertions:
  # Check existence
  - path: "$.data"
    condition: exists
    message: Response should include data

  # Check value
  - path: "$.status"
    condition: equals
    value: "active"

  # Check type
  - path: "$.items"
    condition: type
    value: array

  # Check content
  - path: "$.message"
    condition: contains
    value: "success"

  # Check truthiness
  - path: "$.authenticated"
    condition: truthy
```

### Assertion Conditions

| Condition | Description |
|:----------|:------------|
| `exists` | Value is present |
| `truthy` | Value is truthy |
| `equals` | Exact match |
| `contains` | Contains substring |
| `type` | Type check |

## Workflow Patterns

### Authentication Flow

```yaml
id: auth_flow
name: Authentication Flow
steps:
  - tool: login
    args:
      username: testuser
      password: ${TEST_PASSWORD}
    assertions:
      - path: "$.token"
        condition: exists

  - tool: get_profile
    argMapping:
      auth_token: "$steps[0].result.token"
    assertions:
      - path: "$.email"
        condition: exists

  - tool: logout
    argMapping:
      auth_token: "$steps[0].result.token"
```

### Data Pipeline

```yaml
id: data_pipeline
name: Data Pipeline
steps:
  - tool: fetch_data
    args:
      source: "api"
    assertions:
      - path: "$.data"
        condition: type
        value: array

  - tool: transform_data
    argMapping:
      input: "$steps[0].result.data"
    args:
      format: "csv"

  - tool: store_data
    argMapping:
      data: "$steps[1].result.output"
    args:
      destination: "processed"
```

### Error Recovery

```yaml
id: error_recovery
name: Error Recovery Flow
steps:
  - tool: risky_operation
    assertions:
      - path: "$.success"
        condition: truthy

  - tool: verify_state
    optional: true  # Continue even if fails

  - tool: cleanup
    optional: true
```

## Environment Variables

Use environment variables in workflows:

```yaml
args:
  api_key: ${API_KEY}
  password: ${TEST_PASSWORD}
```

Set before running:

```bash
export TEST_PASSWORD=secret
bellwether test --scenarios ./bellwether-tests.yaml npx server
```

## Running Workflows

:::note Planned Feature
Multi-step workflows with argument mapping are a planned feature. The syntax described in this document shows the intended design, but is not yet implemented.

For deterministic testing today, use [custom test scenarios](/guides/custom-scenarios) which support single-step tool tests with assertions.
:::

### Currently Available

For basic testing today, use `bellwether-tests.yaml`:

```bash
# Generate sample scenarios file
bellwether test --init-scenarios

# Run custom scenarios
bellwether test --scenarios ./bellwether-tests.yaml npx server

# Run ONLY custom scenarios (no LLM costs)
bellwether test --scenarios-only npx server
```

## Best Practices

### 1. Descriptive Step Names

```yaml
# Good
- tool: create_user
  description: Create test user for order workflow

# Bad
- tool: create_user
  description: Step 1
```

### 2. Meaningful Assertions

```yaml
# Good
assertions:
  - path: "$.order.status"
    condition: equals
    value: "confirmed"
    message: Order should be confirmed after payment

# Bad
assertions:
  - path: "$.status"
    condition: exists
```

### 3. Clean Up Resources

```yaml
- tool: delete_test_data
  description: Clean up test resources
  optional: true
```

### 4. Keep Focused

One workflow = one user journey:
- `user_registration.workflow.yaml`
- `password_reset.workflow.yaml`
- `checkout.workflow.yaml`

## Troubleshooting

### "Tool not found"

- Verify tool name matches exactly (case-sensitive)
- Run `bellwether discover npx server` to see available tools

### "argMapping failed"

- Check JSONPath syntax
- Ensure referenced step has completed
- Verify path exists in step result

### "Assertion failed"

- Check JSONPath syntax
- Use `--debug` to see actual response
- Verify expected value matches response format

## See Also

- [Workflows](/concepts/workflows) - Workflow concepts
- [test](/cli/test) - Running workflows
- [Drift Detection](/concepts/drift-detection) - Track workflow changes

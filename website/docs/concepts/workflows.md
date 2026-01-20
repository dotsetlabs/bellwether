---
title: Workflows
sidebar_position: 2
---

# Workflows

Workflows define sequences of tool calls that represent realistic usage patterns. They help test multi-step interactions and verify that tools work together correctly.

## What Are Workflows?

A workflow is a YAML definition that describes:
- **Steps**: Sequential tool calls
- **Argument Mapping**: Data flow between steps using JSONPath
- **Assertions**: Verifications after each step
- **State Tracking**: Optional monitoring of state changes

## Basic Structure

```yaml
# my-workflow.workflow.yaml
id: file_lifecycle
name: File Lifecycle
description: Create, read, modify, and delete a file
expectedOutcome: File is created, modified, read, and deleted successfully
steps:
  - tool: write_file
    description: Create a new file
    args:
      path: /tmp/test-file.txt
      content: "Hello, World!"
    assertions:
      - path: "$.success"
        condition: truthy

  - tool: read_file
    description: Verify file contents
    args:
      path: /tmp/test-file.txt
    assertions:
      - path: "$.content"
        condition: equals
        value: "Hello, World!"

  - tool: delete_file
    description: Clean up
    args:
      path: /tmp/test-file.txt
    optional: true
```

## Running Workflows

Workflows can be run from a YAML file or discovered automatically using an LLM.

### From YAML File

```bash
# Generate a sample workflow file
bellwether check --init-workflows

# Run with user-defined workflows
bellwether check --workflows ./bellwether-workflows.yaml npx your-server
```

### Auto-Discovery

Let the LLM discover potential workflows based on available tools:

```bash
# Discover workflows automatically
bellwether check --discover-workflows npx your-server

# Limit the number of discovered workflows
bellwether check --discover-workflows --max-workflows 5 npx your-server
```

### State Tracking

Enable state tracking to monitor changes during workflow execution:

```bash
bellwether check \
  --workflows ./workflows.yaml \
  --workflow-state-tracking \
  npx your-server
```

## Argument Mapping

Pass data between steps using JSONPath:

```yaml
steps:
  - tool: create_user
    description: Create a new user
    args:
      name: "Test User"

  - tool: get_user
    description: Fetch the created user
    argMapping:
      id: "$steps[0].result.user_id"
```

### JSONPath Expressions

| Expression | Description |
|:-----------|:------------|
| `$steps[0].result` | Result of first step |
| `$steps[0].result.id` | `id` field from first step |
| `$steps[1].result.items[0]` | First item from second step |

## Assertions

Verify step results:

```yaml
assertions:
  - path: "$.status"
    condition: equals
    value: "active"
    message: "User should be active"

  - path: "$.items"
    condition: type
    value: array

  - path: "$.count"
    condition: truthy
```

### Assertion Conditions

| Condition | Description |
|:----------|:------------|
| `exists` | Value is present |
| `truthy` | Value is truthy |
| `equals` | Exact match |
| `contains` | Contains substring |
| `type` | Type check (string, array, object, number) |

## Example Workflows

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
      - path: "$.session_token"
        condition: exists

  - tool: get_profile
    argMapping:
      token: "$steps[0].result.session_token"
    assertions:
      - path: "$.email"
        condition: exists

  - tool: logout
    argMapping:
      token: "$steps[0].result.session_token"
```

### CRUD Operations

```yaml
id: resource_crud
name: Resource CRUD
steps:
  - tool: create_resource
    args:
      name: "Test Resource"
    assertions:
      - path: "$.id"
        condition: exists

  - tool: update_resource
    argMapping:
      id: "$steps[0].result.id"
    args:
      name: "Updated Resource"

  - tool: get_resource
    argMapping:
      id: "$steps[0].result.id"
    assertions:
      - path: "$.name"
        condition: equals
        value: "Updated Resource"

  - tool: delete_resource
    argMapping:
      id: "$steps[0].result.id"
    optional: true
```

## Optional Steps

Mark steps that can fail without failing the workflow:

```yaml
steps:
  - tool: required_operation
    description: Must succeed

  - tool: cleanup
    description: Nice to have
    optional: true  # Workflow continues if this fails
```

## Environment Variables

Use environment variables in workflow arguments:

```yaml
args:
  password: ${TEST_PASSWORD}
  api_key: ${API_KEY}
```

## Best Practices

1. **Name steps descriptively**
   ```yaml
   description: Create test user for order workflow
   ```

2. **Use meaningful assertions**
   ```yaml
   assertions:
     - path: "$.order.status"
       condition: equals
       value: "confirmed"
       message: Order should be confirmed after payment
   ```

3. **Clean up after workflows**
   ```yaml
   - tool: delete_test_data
     optional: true
   ```

4. **Keep workflows focused** - One workflow per user journey

## See Also

- [Workflow Authoring Guide](/guides/workflow-authoring) - Advanced workflow patterns
- [Drift Detection](/concepts/drift-detection) - Track workflow behavior changes
- [check](/cli/check) - Running workflows

# Workflow Definition Cookbook

Workflows in Inquest define sequences of tool calls that represent realistic usage patterns. They help test multi-step interactions and verify that tools work together correctly.

## Overview

A workflow consists of:
- **Steps**: Sequential tool calls
- **Argument Mapping**: Data flow between steps using JSONPath
- **Assertions**: Verifications after each step
- **State Tracking**: Optional monitoring of state changes

## Basic Structure

```yaml
# my-workflow.workflow.yaml
id: my_workflow
name: My Workflow
description: What this workflow does
expectedOutcome: Expected final state
steps:
  - tool: first_tool
    description: First step
    args:
      param: value
  - tool: second_tool
    description: Second step
    argMapping:
      input: "$steps[0].result.output"
```

## Field Reference

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Unique identifier |
| `name` | Yes | Human-readable name |
| `description` | No | What the workflow does |
| `expectedOutcome` | No | Expected final result |
| `steps` | Yes | Array of workflow steps |

### Step Fields

| Field | Required | Description |
|-------|----------|-------------|
| `tool` | Yes | Tool name to call |
| `description` | No | What this step does |
| `args` | No | Static arguments |
| `argMapping` | No | Dynamic arguments from previous steps |
| `assertions` | No | Verifications to run |
| `optional` | No | Continue if step fails (default: false) |

## Cookbook Recipes

### Recipe 1: File Operations Workflow

Test a complete file lifecycle:

```yaml
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
        message: File creation should succeed

  - tool: read_file
    description: Verify file contents
    args:
      path: /tmp/test-file.txt
    assertions:
      - path: "$.content"
        condition: equals
        value: "Hello, World!"
        message: File content should match

  - tool: write_file
    description: Update the file
    args:
      path: /tmp/test-file.txt
      content: "Updated content"

  - tool: read_file
    description: Verify updated contents
    args:
      path: /tmp/test-file.txt
    assertions:
      - path: "$.content"
        condition: contains
        value: "Updated"

  - tool: delete_file
    description: Clean up test file
    args:
      path: /tmp/test-file.txt
    optional: true  # Continue even if delete fails
```

### Recipe 2: Search and Process Workflow

Use search results in subsequent operations:

```yaml
id: search_and_process
name: Search and Process
description: Search for items and process results
steps:
  - tool: search
    description: Find matching items
    args:
      query: "important documents"
      limit: 10
    assertions:
      - path: "$.results"
        condition: exists
      - path: "$.results.length"
        condition: truthy
        message: Should find at least one result

  - tool: get_details
    description: Get details of first result
    argMapping:
      # Use JSONPath to extract first result's ID
      id: "$steps[0].result.results[0].id"
    assertions:
      - path: "$.title"
        condition: exists

  - tool: update_item
    description: Tag the item
    argMapping:
      id: "$steps[0].result.results[0].id"
    args:
      tags: ["processed", "reviewed"]
```

### Recipe 3: Authentication Flow

Test login/session workflows:

```yaml
id: auth_flow
name: Authentication Flow
description: Login, access protected resource, logout
expectedOutcome: User authenticates, accesses data, and logs out cleanly
steps:
  - tool: login
    description: Authenticate user
    args:
      username: testuser
      password: ${TEST_PASSWORD}  # Environment variable
    assertions:
      - path: "$.session_token"
        condition: exists
        message: Should receive session token
      - path: "$.user.id"
        condition: exists

  - tool: get_profile
    description: Access protected endpoint
    argMapping:
      token: "$steps[0].result.session_token"
    assertions:
      - path: "$.email"
        condition: exists
      - path: "$.permissions"
        condition: type
        value: array

  - tool: update_preferences
    description: Modify user settings
    argMapping:
      token: "$steps[0].result.session_token"
    args:
      theme: dark
      notifications: true

  - tool: logout
    description: End session
    argMapping:
      token: "$steps[0].result.session_token"
    assertions:
      - path: "$.success"
        condition: equals
        value: true
```

### Recipe 4: E-commerce Checkout

Complex multi-step workflow:

```yaml
id: checkout_flow
name: E-commerce Checkout
description: Complete shopping cart checkout
steps:
  - tool: create_cart
    description: Initialize shopping cart

  - tool: add_to_cart
    description: Add first item
    argMapping:
      cart_id: "$steps[0].result.cart_id"
    args:
      product_id: "PROD-001"
      quantity: 2
    assertions:
      - path: "$.items.length"
        condition: equals
        value: 1

  - tool: add_to_cart
    description: Add second item
    argMapping:
      cart_id: "$steps[0].result.cart_id"
    args:
      product_id: "PROD-002"
      quantity: 1
    assertions:
      - path: "$.items.length"
        condition: equals
        value: 2

  - tool: apply_coupon
    description: Apply discount code
    argMapping:
      cart_id: "$steps[0].result.cart_id"
    args:
      code: "SAVE10"
    optional: true  # Coupon might be invalid

  - tool: get_cart
    description: Review final cart
    argMapping:
      cart_id: "$steps[0].result.cart_id"
    assertions:
      - path: "$.total"
        condition: exists
      - path: "$.items"
        condition: type
        value: array

  - tool: checkout
    description: Complete purchase
    argMapping:
      cart_id: "$steps[0].result.cart_id"
    args:
      payment_method: "test_card"
      shipping_address:
        street: "123 Test St"
        city: "Test City"
        zip: "12345"
    assertions:
      - path: "$.order_id"
        condition: exists
        message: Order should be created
      - path: "$.status"
        condition: equals
        value: "confirmed"
```

### Recipe 5: CRUD Operations

Test complete resource lifecycle:

```yaml
id: resource_crud
name: Resource CRUD
description: Create, read, update, delete a resource
steps:
  - tool: create_resource
    description: Create new resource
    args:
      name: "Test Resource"
      type: "example"
      data:
        field1: "value1"
        field2: 42
    assertions:
      - path: "$.id"
        condition: exists
      - path: "$.created_at"
        condition: exists

  - tool: get_resource
    description: Read created resource
    argMapping:
      id: "$steps[0].result.id"
    assertions:
      - path: "$.name"
        condition: equals
        value: "Test Resource"
      - path: "$.data.field2"
        condition: equals
        value: 42

  - tool: update_resource
    description: Modify resource
    argMapping:
      id: "$steps[0].result.id"
    args:
      name: "Updated Resource"
      data:
        field1: "updated"
        field3: "new field"

  - tool: get_resource
    description: Verify update
    argMapping:
      id: "$steps[0].result.id"
    assertions:
      - path: "$.name"
        condition: equals
        value: "Updated Resource"
      - path: "$.data.field3"
        condition: equals
        value: "new field"

  - tool: delete_resource
    description: Remove resource
    argMapping:
      id: "$steps[0].result.id"
    assertions:
      - path: "$.deleted"
        condition: truthy

  - tool: get_resource
    description: Verify deletion
    argMapping:
      id: "$steps[0].result.id"
    assertions:
      - path: "$.error"
        condition: contains
        value: "not found"
```

### Recipe 6: Data Pipeline

Test data transformation flow:

```yaml
id: data_pipeline
name: Data Pipeline
description: Fetch, transform, and store data
steps:
  - tool: fetch_data
    description: Get raw data from source
    args:
      source: "api"
      endpoint: "/users"
    assertions:
      - path: "$.data"
        condition: type
        value: array

  - tool: transform_data
    description: Apply transformations
    argMapping:
      input: "$steps[0].result.data"
    args:
      operations:
        - type: filter
          field: active
          value: true
        - type: map
          template: "{name: $.name, email: $.email}"
    assertions:
      - path: "$.transformed"
        condition: exists

  - tool: validate_data
    description: Validate transformed data
    argMapping:
      data: "$steps[1].result.transformed"
    args:
      schema:
        type: array
        items:
          required: [name, email]
    assertions:
      - path: "$.valid"
        condition: truthy
        message: Data should pass validation

  - tool: store_data
    description: Persist results
    argMapping:
      data: "$steps[1].result.transformed"
    args:
      destination: "processed_users"
      mode: "upsert"
    assertions:
      - path: "$.stored_count"
        condition: truthy
```

## Argument Mapping

### JSONPath Syntax

Argument mapping uses JSONPath to reference previous step results:

| Expression | Description |
|------------|-------------|
| `$steps[0].result` | Result of first step |
| `$steps[0].result.id` | `id` field from first step |
| `$steps[1].result.items[0]` | First item from second step |
| `$steps[0].result.users[*].id` | All user IDs from first step |

### Examples

```yaml
# Single value
argMapping:
  userId: "$steps[0].result.user.id"

# Nested path
argMapping:
  address: "$steps[1].result.customer.shipping.address"

# Array element
argMapping:
  firstItem: "$steps[0].result.items[0]"
  lastItem: "$steps[0].result.items[-1]"

# Combined with static args
args:
  action: "process"
argMapping:
  target: "$steps[0].result.resource_id"
```

## Assertions

### Assertion Conditions

| Condition | Description | Example |
|-----------|-------------|---------|
| `exists` | Value is present | `{path: "$.id", condition: "exists"}` |
| `truthy` | Value is truthy | `{path: "$.success", condition: "truthy"}` |
| `equals` | Exact match | `{path: "$.status", condition: "equals", value: "active"}` |
| `contains` | Contains substring | `{path: "$.message", condition: "contains", value: "success"}` |
| `type` | Type check | `{path: "$.items", condition: "type", value: "array"}` |

### Assertion Examples

```yaml
assertions:
  # Check existence
  - path: "$.data"
    condition: exists
    message: Response should include data

  # Check value
  - path: "$.status_code"
    condition: equals
    value: 200

  # Check type
  - path: "$.results"
    condition: type
    value: array

  # Check content
  - path: "$.message"
    condition: contains
    value: "successfully"

  # Check truthiness
  - path: "$.authenticated"
    condition: truthy
    message: User should be authenticated
```

## State Tracking

Enable state tracking to monitor changes:

```yaml
id: stateful_workflow
name: Stateful Workflow
description: Track state changes throughout workflow
steps:
  - tool: list_files
    description: Initial state
    args:
      directory: /tmp/test
    stateHint:
      role: reader
      stateTypes: [files]

  - tool: create_file
    description: Create new file
    args:
      path: /tmp/test/new-file.txt
      content: "test"
    stateHint:
      role: writer
      stateTypes: [files]

  - tool: list_files
    description: Final state
    args:
      directory: /tmp/test
    stateHint:
      role: reader
      stateTypes: [files]
```

## Error Handling

### Optional Steps

```yaml
steps:
  - tool: required_step
    description: Must succeed

  - tool: optional_cleanup
    description: Nice to have but not critical
    optional: true  # Workflow continues if this fails

  - tool: final_step
    description: Runs regardless of optional step
```

### Conditional Flows

```yaml
steps:
  - tool: check_condition
    description: Check if action needed
    assertions:
      - path: "$.should_proceed"
        condition: truthy

  - tool: conditional_action
    description: Only meaningful if condition is true
    optional: true
```

## Best Practices

### 1. Name Steps Descriptively

```yaml
# Good
- tool: create_user
  description: Create test user for order workflow

# Bad
- tool: create_user
  description: Step 1
```

### 2. Use Meaningful Assertions

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

### 3. Clean Up After Workflows

```yaml
steps:
  # ... main workflow steps ...

  - tool: delete_test_data
    description: Clean up test resources
    optional: true  # Don't fail workflow if cleanup fails
```

### 4. Test Both Success and Failure Paths

Create separate workflows for:
- Happy path (everything works)
- Error handling (invalid inputs, failures)
- Edge cases (empty results, timeouts)

### 5. Keep Workflows Focused

One workflow should test one user journey:
- `user_registration_flow.workflow.yaml`
- `password_reset_flow.workflow.yaml`
- `checkout_flow.workflow.yaml`

Not one giant workflow testing everything.

## Running Workflows

```bash
# Run discovered workflows during interview
inquest interview --discover-workflows npx @mcp/server

# Run specific workflow file
inquest workflow run my-workflow.workflow.yaml npx @mcp/server

# Run with state tracking
inquest workflow run --track-state my-workflow.workflow.yaml npx @mcp/server
```

## Troubleshooting

### "Step N failed: Tool not found"

- Verify tool name matches exactly (case-sensitive)
- Run `inquest discover` to see available tools

### "argMapping failed: Invalid path"

- Check JSONPath syntax
- Ensure referenced step exists and has completed
- Verify the path exists in the step result

### "Assertion failed: path not found"

- Check JSONPath syntax in assertion
- Verify the response structure matches expectations
- Add debug logging to see actual response

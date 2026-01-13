---
title: Drift Detection
sidebar_position: 4
---

# Drift Detection

Drift detection identifies when MCP server behavior changes between versions, helping catch breaking changes before they reach production.

## What Is Drift?

Drift occurs when your MCP server's behavior differs from its documented baseline. This can be:

- **Intentional** - New features, bug fixes, refactoring
- **Unintentional** - Regressions, breaking changes, bugs

## How It Works

```
   Baseline (v1)              Current Behavior
        |                           |
        |                           |
   [read_file]                [read_file]
   - Returns UTF-8            - Returns UTF-8
   - Max 10MB                 - Max 50MB  <-- CHANGED
   - ENOENT on missing        - Different error message <-- CHANGED
        |                           |
        v                           v
              Drift Detection
                    |
                    v
            Changes Detected:
            - Max size: 10MB -> 50MB (warning)
            - Error message changed (info)
```

## Drift Severity Levels

| Level | Description | Examples | CI Behavior |
|:------|:------------|:---------|:------------|
| `breaking` | Schema or critical behavior changes | Tool removed, required param added | Always fails |
| `warning` | Behavioral changes to investigate | Error messages, limits, side effects | Fails with `--fail-on-drift` |
| `info` | Documentation-only changes | Wording improvements | Pass (unless `--strict`) |
| `none` | No changes detected | - | Pass |

## Using Drift Detection

### Local Development

```bash
# Save initial baseline
bellwether interview --save-baseline npx your-server

# Make changes to server...

# Compare against baseline
bellwether interview --compare-baseline ./bellwether-baseline.json npx your-server
```

### CI/CD Pipeline

```bash
bellwether interview \
  --ci \
  --compare-baseline ./bellwether-baseline.json \
  --fail-on-drift \
  npx your-server
```

### Strict Mode

Fail on any change, including documentation:

```bash
bellwether interview \
  --compare-baseline ./baseline.json \
  --fail-on-drift \
  --strict \
  npx your-server
```

## Understanding Drift Output

```
Drift Detection Results
=======================

BREAKING (1):
  - Tool "legacy_read" was removed

WARNING (2):
  - read_file: Maximum file size changed from 10MB to 50MB
  - write_file: Error message format changed

INFO (1):
  - read_file: Documentation clarified for binary files

Summary: 1 breaking, 2 warnings, 1 info
Exit code: 1 (drift detected)
```

## Drift Categories

### Schema Drift

Changes to tool definitions:

| Change | Severity | Example |
|:-------|:---------|:--------|
| Tool added | info | New `delete_file` tool |
| Tool removed | breaking | `legacy_read` removed |
| Required param added | breaking | `path` now required |
| Optional param added | info | New `encoding` option |
| Type changed | breaking | `limit` string -> number |

### Behavioral Drift

Changes to how tools behave:

| Change | Severity | Example |
|:-------|:---------|:--------|
| Return value format | warning | Date format changed |
| Error handling | warning | New error type |
| Performance | info | Faster response |
| Limits | warning | Max size changed |
| Side effects | warning | Now creates parent dirs |

### Security Drift

Changes affecting security:

| Change | Severity | Example |
|:-------|:---------|:--------|
| New vulnerability | breaking | Path traversal found |
| Vulnerability fixed | info | Injection prevented |
| Permission change | warning | More restrictive |

## Handling Drift

### Intentional Changes

When drift is expected (new features, fixes):

```bash
# Review the changes
bellwether interview --compare-baseline ./baseline.json npx your-server

# Update baseline if changes are correct
bellwether interview --save-baseline npx your-server

# Commit updated baseline
git add bellwether-baseline.json
git commit -m "Update baseline: improved error handling"
```

### Unintentional Changes

When drift is unexpected:

1. Review the diff output
2. Identify the root cause
3. Fix the regression
4. Re-run interview to verify

## Exit Codes

| Code | Condition |
|:-----|:----------|
| `0` | No drift, or info-only drift |
| `1` | Breaking or warning drift detected |
| `2` | Interview error (connection, LLM) |

## Cloud Integration

Track drift history with Bellwether Cloud:

```bash
# Upload baseline with drift info
bellwether upload --ci --fail-on-drift
```

Cloud provides:
- Historical drift timeline
- Version-to-version comparison
- Drift notifications
- Team visibility

## Best Practices

1. **Run drift detection in CI** - Catch changes early
2. **Review drift before merging** - Understand what changed
3. **Update baselines intentionally** - Don't auto-update
4. **Use appropriate severity** - `--fail-on-drift` for PRs
5. **Track drift over time** - Use cloud for history

## See Also

- [Baselines](/concepts/baselines) - Creating and managing baselines
- [CI/CD Integration](/guides/ci-cd) - Automated drift checking
- [interview](/cli/interview) - Running drift detection

---
title: Drift Detection
sidebar_position: 3
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

## Determinism and Reliability

Bellwether's drift detection operates in two distinct modes with different reliability characteristics:

### Structural Comparison (Deterministic)

Schema-level changes are detected **deterministically without any LLM involvement**:

- Tool added/removed
- Parameter added/removed/renamed
- Type changes
- Required status changes

These detections are 100% reliable and consistent across runs.

### Semantic Comparison (LLM-Assisted)

Behavioral changes in responses use LLM analysis:

- Return value format changes
- Error message wording changes
- Side effect differences

**Important**: Semantic comparison flags *potential* changes for human review. Because LLMs are non-deterministic, the same comparison might produce slightly different results across runs.

### Achieving 100% Determinism

For CI/CD pipelines requiring deterministic results:

```yaml
# bellwether.yaml - scenarios-only mode
mode: structural
scenarios:
  path: "./bellwether-tests.yaml"
  only: true
```

```bash
# Run tests then compare
bellwether test npx your-server
bellwether baseline compare ./bellwether-baseline.json --fail-on-drift
```

This mode:
- Runs only your predefined test scenarios
- No LLM calls = no non-determinism
- Consistent pass/fail results every time
- Zero API costs

### Recommendations by Use Case

| Use Case | Recommended Mode | Why |
|:---------|:-----------------|:----|
| CI/CD deployment gates | `--scenarios-only` | Deterministic, no false positives |
| PR review checks | Default (LLM-assisted) | Catches unexpected behaviors |
| Initial documentation | Default (LLM-assisted) | Discovers behaviors you didn't think to test |
| Compliance environments | `--scenarios-only` | Auditable, reproducible results |

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
# Run test and save initial baseline
bellwether test npx your-server
bellwether baseline save

# Make changes to server...

# Compare against baseline
bellwether test npx your-server
bellwether baseline compare ./bellwether-baseline.json
```

### CI/CD Pipeline

```bash
# Run test then compare with fail-on-drift
bellwether test npx your-server
bellwether baseline compare ./bellwether-baseline.json --fail-on-drift
```

### Structural Mode (100% Deterministic)

**Structural mode** provides 100% deterministic drift detection by only comparing tool schemas:

```yaml
# bellwether.yaml
mode: structural
```

```bash
bellwether test npx your-server
bellwether baseline compare ./bellwether-baseline.json --fail-on-drift
```

In structural mode:
- Only structural changes are reported (tool presence, schema changes)
- No LLM calls required
- Results are 100% reproducible across runs
- Free and fast

Use structural mode for:
- CI/CD deployment gates requiring determinism
- Compliance environments with audit requirements
- Detecting breaking API changes only

## Confidence Scores

Every detected change includes a confidence score (0-100%) indicating how certain we are about the change:

### Confidence Levels

| Confidence | Label | Meaning |
|:-----------|:------|:--------|
| 85-100% | High | Very confident this is a real change |
| 60-84% | Medium | Likely a real change, worth investigating |
| 40-59% | Low | May be LLM non-determinism |
| 0-39% | Very Low | Likely false positive from LLM variance |

### Structural vs Semantic Confidence

| Change Type | Method | Confidence | Examples |
|:------------|:-------|:-----------|:---------|
| Tool added/removed | Structural | 100% | Tool list differs |
| Schema changed | Structural | 100% | Hash differs |
| Description changed | Structural | 100% | Text differs exactly |
| Assertion changed | Semantic | 60-95% | LLM-generated text comparison |
| Security finding | Semantic | 70-95% | Category-based matching |
| Limitation changed | Semantic | 65-90% | Category + keyword matching |

### Using Confidence Thresholds

There are two threshold options with different purposes:

| Option | Purpose | Default |
|:-------|:--------|:--------|
| `--min-confidence <n>` | **Filter**: Only report changes above this confidence | `0` |
| `--confidence-threshold <n>` | **CI gate**: Only fail on breaking changes above this confidence | `80` |

**Filter example** - hide low-confidence changes from output:

```yaml
# bellwether.yaml
baseline:
  minConfidence: 80  # Only report changes with >80% confidence
```

```bash
bellwether test npx your-server
bellwether baseline compare ./bellwether-baseline.json
```

**CI gate example** - only fail when confident about breaking changes:

```yaml
# bellwether.yaml
baseline:
  confidenceThreshold: 90  # Only fail CI if breaking changes have 90%+ confidence
  failOnDrift: true
```

```bash
bellwether test npx your-server
bellwether baseline compare ./bellwether-baseline.json --fail-on-drift
```

### Confidence in Output

```
Drift Detection Results
=======================
Overall Confidence: 92% (high)
Structural changes: 3 (avg 100%)
Semantic changes: 2 (avg 78%)

BREAKING (1):
  - Tool "legacy_read" was removed [100% structural]

WARNING (2):
  - read_file: Maximum file size changed [85% semantic]
  - write_file: Error message format changed [72% semantic]
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
# Run test and review the changes
bellwether test npx your-server
bellwether baseline compare ./bellwether-baseline.json

# Update baseline if changes are correct
bellwether baseline save --force

# Commit updated baseline
git add bellwether-baseline.json
git commit -m "Update baseline: improved error handling"
```

### Unintentional Changes

When drift is unexpected:

1. Review the diff output
2. Identify the root cause
3. Fix the regression
4. Re-run test to verify

## Exit Codes

| Code | Condition |
|:-----|:----------|
| `0` | No drift, or info-only drift |
| `1` | Breaking or warning drift detected |
| `2` | Test error (connection, LLM) |

## Cloud Integration

Track drift history with Bellwether Cloud:

```bash
# Run test, save baseline, and upload
bellwether test npx your-server
bellwether baseline save
bellwether upload --ci --fail-on-drift
```

Cloud provides:
- Historical drift timeline
- Version-to-version comparison
- Drift notifications

## Best Practices

1. **Run drift detection in CI** - Catch changes early
2. **Review drift before merging** - Understand what changed
3. **Update baselines intentionally** - Don't auto-update
4. **Use appropriate severity** - `--fail-on-drift` for PRs
5. **Track drift over time** - Use cloud for history

## See Also

- [Baselines](/concepts/baselines) - Creating and managing baselines
- [CI/CD Integration](/guides/ci-cd) - Automated drift checking
- [Configuration](/guides/configuration) - Config file drift options
- [test](/cli/test) - Running drift detection

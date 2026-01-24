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

For CI/CD pipelines requiring deterministic results, use `bellwether check`:

```bash
# Initialize config (if not already done)
bellwether init npx your-server

# Run check (free, deterministic, no LLM)
bellwether check --fail-on-drift
```

Configure baseline path in `bellwether.yaml`:

```yaml
baseline:
  comparePath: "./bellwether-baseline.json"
  failOnDrift: true
```

Check mode:
- No LLM calls = no non-determinism
- Consistent pass/fail results every time
- Zero API costs
- Fast execution

Optionally add custom test scenarios for even more control:

```yaml
# bellwether.yaml - with custom scenarios
scenarios:
  path: "./bellwether-tests.yaml"
  only: true
```

### Recommendations by Use Case

| Use Case | Recommended Mode | Why |
|:---------|:-----------------|:----|
| CI/CD deployment gates | `scenarios.only: true` | Deterministic, no false positives |
| PR review checks | Default (LLM-assisted) | Catches unexpected behaviors |
| Initial documentation | Default (LLM-assisted) | Discovers behaviors you didn't think to test |
| Compliance environments | `scenarios.only: true` | Auditable, reproducible results |

## Drift Severity Levels

| Level | Description | Examples | CI Behavior |
|:------|:------------|:---------|:------------|
| `breaking` | Schema or critical behavior changes | Tool removed, required param added | Always fails |
| `warning` | Behavioral changes to investigate | Error messages, limits, side effects | Exit code `2` (handle in CI as desired) |
| `info` | Documentation-only changes | Wording improvements | Exit code `1` (handle in CI as desired) |
| `none` | No changes detected | - | Pass |

## Using Drift Detection

### Local Development

```bash
# Initialize config (first time only)
bellwether init npx your-server

# Run check and save initial baseline
bellwether check
bellwether baseline save

# Make changes to server...

# Re-run check (uses baseline from config)
bellwether check
```

### CI/CD Pipeline

Configure baseline comparison in `bellwether.yaml`:

```yaml
baseline:
  comparePath: "./bellwether-baseline.json"
  failOnDrift: true
```

```bash
# CI command
bellwether check --fail-on-drift
```

### Check Mode (100% Deterministic)

**Check mode** (`bellwether check`) provides 100% deterministic drift detection by comparing tool schemas without any LLM involvement:

```bash
bellwether check --fail-on-drift
```

In check mode:
- Only structural changes are reported (tool presence, schema changes)
- No LLM calls required
- Results are 100% reproducible across runs
- Free and fast

Use check mode for:
- CI/CD deployment gates requiring determinism
- Compliance environments with audit requirements
- Detecting breaking API changes only

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

### Performance Drift

Bellwether tracks tool latency and detects performance regressions:

| Change | Severity | Example |
|:-------|:---------|:--------|
| P50 latency increased | warning | 45ms → 78ms (+73%) |
| Success rate dropped | warning | 98% → 85% |
| Timeout frequency | warning | More frequent timeouts |
| Confidence degraded | info | high → medium (more variability) |

Configure the regression threshold:

```yaml
check:
  performanceThreshold: 10  # Flag if P50 latency increases by >10%
```

This setting is configuration-only and applies to all check runs.

#### Performance Confidence

Bellwether calculates statistical confidence for performance metrics based on sample count and variability:

| Confidence | Criteria | Meaning |
|:-----------|:---------|:--------|
| High | 10+ samples, CV < 0.3 | Reliable baseline |
| Medium | 5+ samples, CV < 0.5 | Somewhat reliable |
| Low | Few samples or high variability | Needs more data |

Tools with low confidence are flagged in reports, and regressions are marked as unreliable.

### Error Pattern Drift

Changes in error behavior across runs:

| Change | Severity | Example |
|:-------|:---------|:--------|
| New error category | warning | VALIDATION errors appearing |
| Error resolved | info | TIMEOUT errors no longer occur |
| Error rate increased | warning | NotFound errors up 50% |
| Root cause changed | info | Different error messages |

### Response Schema Drift

Changes to response structure:

| Change | Severity | Example |
|:-------|:---------|:--------|
| Fields added | info | New `metadata` field in response |
| Fields removed | warning | `timestamp` field removed |
| Type changed | breaking | `count` changed from number to string |
| Schema became unstable | warning | Response structure varies between calls |

### Documentation Drift

Changes to documentation quality:

| Change | Severity | Example |
|:-------|:---------|:--------|
| Score degraded | warning | 85 → 65 (B → D) |
| Score improved | info | 70 → 90 (C → A) |
| New issues | info | Missing parameter descriptions |
| Issues fixed | info | Descriptions added |

## Handling Drift

### Intentional Changes

When drift is expected (new features, bug fixes, refactoring), you can accept the changes and update the baseline:

#### Option 1: Accept command (recommended)

```bash
# Run check to detect drift
bellwether check

# Review and accept the drift with a reason
bellwether baseline accept --reason "Added new delete_file tool"

# Commit updated baseline
git add bellwether-baseline.json
git commit -m "Update baseline: added delete_file tool"
```

#### Option 2: Accept during check

```bash
# Accept drift in a single command
bellwether check --accept-drift --accept-reason "Improved error handling"

# Commit updated baseline
git add bellwether-baseline.json
git commit -m "Update baseline: improved error handling"
```

#### Option 3: Force save baseline

```bash
# Run check and review the changes
bellwether check

# Overwrite baseline without acceptance metadata
bellwether baseline save --force

# Commit updated baseline
git add bellwether-baseline.json
git commit -m "Update baseline: improved error handling"
```

### Acceptance Metadata

When you use `baseline accept` or `--accept-drift`, the baseline records:
- **When** the drift was accepted
- **Who** accepted it (if `--accepted-by` provided)
- **Why** it was accepted (the reason)
- **What** changes were accepted (snapshot of the diff)

This creates an audit trail for intentional changes.

### Unintentional Changes

When drift is unexpected (regressions, bugs):

1. Review the diff output
2. Identify the root cause
3. Fix the regression
4. Re-run check to verify the fix

## Exit Codes

Bellwether uses granular exit codes for semantic CI/CD integration:

| Code | Meaning | Description |
|:-----|:--------|:------------|
| `0` | Clean | No changes detected |
| `1` | Info | Non-breaking changes (new tools, optional params) |
| `2` | Warning | Behavioral changes to investigate |
| `3` | Breaking | Critical changes (tool removed, type changed) |
| `4` | Error | Runtime error (connection, config) |
| `5` | Low confidence | Metrics lack confidence (when `check.sampling.failOnLowConfidence` is true) |

Bellwether always returns the severity-specific exit code; use your CI to decide which severities should fail a build.

### Configurable Failure Threshold

You can configure which severity level you treat as a CI failure:

```yaml
baseline:
  severity:
    failOnSeverity: breaking  # Only fail on breaking changes
```

Or via CLI flag:

```bash
# Fail on any drift (including info-level)
bellwether check --fail-on-severity info

# Fail only on warnings or breaking (default)
bellwether check --fail-on-severity warning

# Fail only on breaking changes
bellwether check --fail-on-severity breaking
```

## Cloud Integration

Track drift history with Bellwether Cloud:

```bash
# Run check, save baseline, and upload
bellwether check
bellwether baseline save
bellwether upload
```

Cloud provides:
- Historical drift timeline
- Version-to-version comparison
- Drift notifications

## Best Practices

1. **Run drift detection in CI** - Catch changes early
2. **Review drift before merging** - Understand what changed
3. **Update baselines intentionally** - Don't auto-update
4. **Use appropriate severity** - Configure `baseline.severity.failOnSeverity` and handle exit codes in CI
5. **Track drift over time** - Use cloud for history

## See Also

- [Baselines](/concepts/baselines) - Creating and managing baselines
- [CI/CD Integration](/guides/ci-cd) - Automated drift checking
- [Configuration](/guides/configuration) - Config file drift options
- [check](/cli/check) - Running drift detection

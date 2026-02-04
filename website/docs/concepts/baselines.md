---
title: Baselines
sidebar_position: 2
---

# Baselines

Baselines capture a snapshot of your MCP server's expected behavior, enabling drift detection and regression testing.

## What Is a Baseline?

A baseline is a JSON file containing:
- **Server capabilities** - Tools, prompts, and resources
- **Tool schemas** - Parameter types and requirements
- **Behavioral observations** - How tools actually behave
- **Security findings** - Any identified vulnerabilities (when `check.security.enabled` is true)
- **Performance metrics** - P50/P95 latency, success rates, and confidence levels
- **Response fingerprints** - Content types, sizes, and structure hashes
- **Error patterns** - Categorized errors with root cause analysis
- **Schema evolution** - Response schema stability tracking
- **Documentation quality** - Score and grade for tool documentation

## Creating a Baseline

```bash
# Initialize config (first time only)
bellwether init npx your-server

# Run check
bellwether check

# Then save baseline
bellwether baseline save
```

This generates `bellwether-baseline.json`:

```json
{
  "version": "0.11.0",
  "metadata": {
    "mode": "check",
    "generatedAt": "2026-01-25T10:30:00Z",
    "cliVersion": "0.11.0",
    "serverCommand": "npx @modelcontextprotocol/server-filesystem /tmp",
    "serverName": "@modelcontextprotocol/server-filesystem",
    "durationMs": 2341,
    "personas": [],
    "model": "none"
  },
  "server": {
    "name": "@modelcontextprotocol/server-filesystem",
    "version": "0.10.1",
    "protocolVersion": "2024-11-05",
    "capabilities": ["tools"]
  },
  "capabilities": {
    "tools": [
      {
        "name": "read_file",
        "description": "Read contents of a file",
        "inputSchema": {
          "type": "object",
          "properties": {
            "path": { "type": "string", "description": "Path to file" }
          },
          "required": ["path"]
        },
        "schemaHash": "def456...",
        "baselineP50Ms": 45,
        "baselineP95Ms": 120,
        "baselineSuccessRate": 0.98,
        "lastTestedAt": "2026-01-25T10:30:00Z",
        "inputSchemaHashAtTest": "def456...",
        "performanceConfidence": {
          "sampleCount": 15,
          "successfulSamples": 15,
          "validationSamples": 0,
          "totalTests": 15,
          "standardDeviation": 12.5,
          "coefficientOfVariation": 0.28,
          "confidenceLevel": "high"
        },
        "responseFingerprint": {
          "contentType": "text",
          "sizeCategory": "small",
          "structureHash": "ghi789..."
        }
      }
    ]
  },
  "interviews": [],
  "toolProfiles": [
    {
      "name": "read_file",
      "description": "Read contents of a file",
      "schemaHash": "def456...",
      "assertions": [
        {
          "type": "expects",
          "condition": "Returns UTF-8 text for text files",
          "tool": "read_file"
        }
      ],
      "securityNotes": ["Path traversal normalized within root"],
      "limitations": ["Maximum file size: 10MB"],
      "behavioralNotes": []
    }
  ],
  "assertions": [],
  "summary": "Filesystem server with 1 tool",
  "hash": "abc123...",
  "documentationScore": {
    "overallScore": 85,
    "grade": "B",
    "toolCount": 3,
    "issueCount": 2
  }
}
```

## Custom Baseline Path

```bash
# Save to specific path
bellwether baseline save ./baselines/v1.json

# Compare against specific baseline
bellwether baseline compare ./baselines/v1.json
```

Or configure paths in `bellwether.yaml`:

```yaml
baseline:
  comparePath: "./baselines/v1.json"
  savePath: "./baselines/current.json"
```

## Baseline in CI/CD

### Commit to Version Control

```bash
# Create baseline
bellwether check
bellwether baseline save

# Commit both config and baseline
git add bellwether.yaml bellwether-baseline.json
git commit -m "Update behavioral baseline"
```

### Check in CI

Configure baseline path in `bellwether.yaml`:

```yaml
baseline:
  comparePath: "./bellwether-baseline.json"
  failOnDrift: true
```

```yaml
# GitHub Actions
- name: Check Behavioral Drift
  run: npx @dotsetlabs/bellwether check --fail-on-drift
```

## Accepting Intentional Changes

When you intentionally change your MCP server (adding features, modifying behavior), you need to update the baseline. Bellwether provides two ways to do this:

### Option 1: Accept Command (Recommended)

The `baseline accept` command marks drift as intentional and records metadata for audit trails:

```bash
# Run check to detect drift
bellwether check

# Review the drift, then accept it with a reason
bellwether baseline accept --reason "Added new delete_file tool"

# For breaking changes, use --force
bellwether baseline accept --reason "Major API update" --force

# Commit
git add bellwether-baseline.json
git commit -m "Update baseline: added delete_file tool"
```

#### Accept Command Options

| Option | Description |
|:-------|:------------|
| `--reason <text>` | Why the drift was accepted |
| `--accepted-by <name>` | Who accepted (for audit trail) |
| `--dry-run` | Preview what would be accepted |
| `--force` | Required for breaking changes |

### Option 2: Accept During Check

You can also accept drift as part of the check command:

```bash
# Check and accept in one command
bellwether check --accept-drift --accept-reason "Improved error handling"

# Commit
git add bellwether-baseline.json
git commit -m "Update baseline: improved error handling"
```

### Option 3: Force Save

For simple cases, you can overwrite the baseline directly:

```bash
# Run check and review changes
bellwether check

# Overwrite baseline (no acceptance metadata)
bellwether baseline save --force

# Commit
git add bellwether-baseline.json
git commit -m "Update baseline: added delete_file tool"
```

### Acceptance Metadata

When using `baseline accept`, the baseline records acceptance metadata (including `acceptedBy`).  
When using `--accept-drift`, Bellwether records `acceptedAt` and `reason` only.

```json
{
  "acceptance": {
    "acceptedAt": "2026-01-21T10:30:00Z",
    "acceptedBy": "dev-team",
    "reason": "Added new delete_file tool",
    "acceptedDiff": {
      "toolsAdded": ["delete_file"],
      "toolsRemoved": [],
      "toolsModified": [],
      "severity": "info",
      "breakingCount": 0,
      "warningCount": 0,
      "infoCount": 1
    }
  }
}
```

Use `baseline accept --accepted-by <name>` if you need a full audit trail of who approved the change.

## Baseline Format Versioning

Baselines use the CLI package version as the format version (e.g., `0.11.0`):

| Component | Description |
|:----------|:------------|
| **Major** | Breaking baseline format changes (recreate baseline) |
| **Minor** | Backwards-compatible format additions |
| **Patch** | Bug fixes in baseline generation |

### Compatibility Rules

- **Same major version** = Compatible (can compare baselines)
- **Different major version** = Incompatible (recreate baseline)

When comparing baselines with incompatible versions, recreate the older baseline with the latest CLI.

## What's Captured

| Category | Content |
|:---------|:--------|
| **Server Info** | Name, version, protocol version, capabilities |
| **Tools** | Name, description, schema hash, security notes, limitations |
| **Prompts** | Prompt names, descriptions, and argument metadata |
| **Resources** | Resource URIs, names, descriptions, and mime types |
| **Performance** | P50/P95 latency, success rate, confidence level per tool |
| **Response Fingerprint** | Content type, size category, structure hash |
| **Error Patterns** | Categorized errors with root cause and remediation |
| **Schema Evolution** | Response schema stability and field changes |
| **Security** | Vulnerability findings and risk scores (when `check.security.enabled` is true) |
| **Documentation** | Quality score, grade, and improvement suggestions |
| **Assertions** | Behavioral assertions |
| **Workflows** | Workflow signatures and results |
| **Hash** | SHA-256 hash for detecting file tampering |
| **Metadata** | Timestamp, mode, server command |
| **Acceptance** | Optional: when/why drift was accepted |
| **Incremental** | Schema hash and test timestamp for incremental checking |

## Baseline Comparison

When comparing baselines, Bellwether detects:

| Change Type | Example |
|:------------|:--------|
| Added | New tool `delete_file` |
| Removed | Tool `legacy_read` no longer exists |
| Schema change | Parameter `path` now required |
| Behavior change | Error message format changed |
| Prompt change | Prompt argument added/removed or required flag changed |
| Resource change | Resource added/removed or mime type changed |
| Server change | Server metadata or protocol version changed |
| Capability change | Server capabilities added/removed |
| Security change | New vulnerability detected |
| Performance regression | P50 latency increased by >10% |
| Confidence change | Metrics reliability improved/degraded |
| Response structure change | JSON schema fields added/removed |
| Error pattern change | New error types or resolved errors |
| Schema evolution | Response schema stability changes |
| Documentation degradation | Quality score decreased |

### Performance Comparison

When baselines include performance metrics, Bellwether compares:
- **P50 latency** - Median response time
- **P95 latency** - 95th percentile response time
- **Success rate** - Percentage of successful calls

Configure the regression threshold in `bellwether.yaml`:

```yaml
check:
  performanceThreshold: 10  # Flag if P50 latency increases by >10%
```

## Incremental Checking

Bellwether supports incremental checking to speed up CI runs. Only tools with changed schemas are re-tested. Configure in `bellwether.yaml`:

```yaml
check:
  incremental: true
  incrementalCacheHours: 168  # 1 week cache validity
```

Each tool fingerprint includes:
- `lastTestedAt` - When the tool was last tested
- `inputSchemaHashAtTest` - Schema hash at test time

When a tool's schema changes, it's automatically re-tested. Unchanged tools reuse cached fingerprints.

## See Also

- [Drift Detection](/concepts/drift-detection) - Understanding drift severity
- [CI/CD Integration](/guides/ci-cd) - Automated baseline checking
- [baseline](/cli/baseline) - Baseline commands

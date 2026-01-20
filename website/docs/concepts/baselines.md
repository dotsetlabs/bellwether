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
- **Security findings** - Any identified vulnerabilities

## Creating a Baseline

```bash
# Run test first
bellwether check npx your-server

# Then save baseline
bellwether baseline save
```

This generates `bellwether-baseline.json`:

```json
{
  "formatVersion": "1.0.0",
  "createdAt": "2026-01-12T10:30:00Z",
  "serverCommand": "npx @modelcontextprotocol/server-filesystem /tmp",
  "mode": "contract",
  "integrityHash": "abc123...",
  "server": {
    "name": "@modelcontextprotocol/server-filesystem",
    "version": "1.0.0",
    "protocolVersion": "2024-11-05",
    "capabilities": ["tools"]
  },
  "tools": [
    {
      "name": "read_file",
      "description": "Read contents of a file",
      "schemaHash": "def456...",
      "securityNotes": ["Path traversal normalized within root"],
      "limitations": ["Maximum file size: 10MB"]
    }
  ],
  "assertions": [
    {
      "tool": "read_file",
      "aspect": "behavior",
      "assertion": "Returns UTF-8 text for text files",
      "isPositive": true,
      "confidence": 90
    }
  ]
}
```

## Custom Baseline Path

```bash
# Save to specific path
bellwether check npx your-server
bellwether baseline save ./baselines/v1.json

# Compare against specific baseline
bellwether check npx your-server
bellwether baseline compare ./baselines/v1.json
```

## Baseline in CI/CD

### Commit to Version Control

```bash
# Create baseline
bellwether check npx your-server
bellwether baseline save

# Commit
git add bellwether-baseline.json
git commit -m "Update behavioral baseline"
```

### Check in CI

```yaml
# GitHub Actions
- name: Check Behavioral Drift
  run: |
    npx @dotsetlabs/bellwether check npx your-server
    npx @dotsetlabs/bellwether baseline compare ./bellwether-baseline.json --fail-on-drift
```

## Updating Baselines

When intentional changes are made:

```bash
# Run test and review changes
bellwether check npx your-server
bellwether baseline compare ./bellwether-baseline.json

# Update baseline if changes are intentional
bellwether baseline save --force

# Commit
git add bellwether-baseline.json
git commit -m "Update baseline: added delete_file tool"
```

## Baseline Cloud Sync

Upload baselines to Bellwether Cloud for:
- Historical tracking
- Version comparison
- Verification badges

```bash
bellwether login
bellwether link
bellwether upload
```

## Baseline Format Versioning

Baselines use semantic versioning for the format version (e.g., `1.0.0`):

| Component | Description |
|:----------|:------------|
| **Major** | Breaking structural changes (removed fields, type changes) |
| **Minor** | New optional fields (backwards compatible) |
| **Patch** | Bug fixes in baseline generation |

### Compatibility Rules

- **Same major version** = Compatible (can compare baselines)
- **Different major version** = Incompatible (requires migration)

When comparing baselines with incompatible versions, use `bellwether baseline migrate` to upgrade older baselines first.

## What's Captured

| Category | Content |
|:---------|:--------|
| **Server Info** | Name, version, protocol version, capabilities |
| **Tools** | Name, description, schema hash, security notes, limitations |
| **Assertions** | Behavioral assertions with confidence scores |
| **Workflows** | Workflow signatures and results |
| **Integrity** | Hash for detecting file tampering |
| **Metadata** | Timestamp, mode, server command |

## Baseline Comparison

When comparing baselines, Bellwether detects:

| Change Type | Example |
|:------------|:--------|
| Added | New tool `delete_file` |
| Removed | Tool `legacy_read` no longer exists |
| Schema change | Parameter `path` now required |
| Behavior change | Error message format changed |
| Security change | New vulnerability detected |

## See Also

- [Drift Detection](/concepts/drift-detection) - Understanding drift severity
- [CI/CD Integration](/guides/ci-cd) - Automated baseline checking
- [upload](/cloud/upload) - Cloud baseline sync

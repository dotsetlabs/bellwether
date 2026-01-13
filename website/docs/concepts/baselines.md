---
title: Baselines
sidebar_position: 3
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
inquest interview --save-baseline npx your-server
```

This generates `inquest-baseline.json`:

```json
{
  "version": 1,
  "timestamp": "2026-01-12T10:30:00Z",
  "server": {
    "name": "@modelcontextprotocol/server-filesystem",
    "version": "1.0.0"
  },
  "tools": [
    {
      "name": "read_file",
      "schema": {
        "type": "object",
        "properties": {
          "path": { "type": "string" }
        },
        "required": ["path"]
      },
      "behavior": {
        "observations": [
          "Returns UTF-8 text for text files",
          "Returns base64 for binary files",
          "Maximum file size: 10MB"
        ],
        "errors": [
          "ENOENT for missing files",
          "EACCES for permission denied"
        ],
        "security": [
          "Path traversal normalized within root"
        ]
      }
    }
  ]
}
```

## Custom Baseline Path

```bash
# Save to specific path
inquest interview --save-baseline ./baselines/v1.json npx your-server

# Compare against specific baseline
inquest interview --compare-baseline ./baselines/v1.json npx your-server
```

## Baseline in CI/CD

### Commit to Version Control

```bash
# Create baseline
inquest interview --save-baseline npx your-server

# Commit
git add inquest-baseline.json
git commit -m "Update behavioral baseline"
```

### Check in CI

```yaml
# GitHub Actions
- name: Check Behavioral Drift
  run: |
    inquest interview \
      --compare-baseline ./inquest-baseline.json \
      --fail-on-drift \
      npx your-server
```

## Updating Baselines

When intentional changes are made:

```bash
# Review changes
inquest interview --compare-baseline ./baseline.json npx your-server

# Update baseline
inquest interview --save-baseline npx your-server

# Commit
git add inquest-baseline.json
git commit -m "Update baseline: added delete_file tool"
```

## Baseline Cloud Sync

Upload baselines to Inquest Cloud for:
- Historical tracking
- Team collaboration
- Version comparison
- Verification badges

```bash
inquest login
inquest link
inquest upload
```

## What's Captured

| Category | Content |
|:---------|:--------|
| **Capabilities** | Tools, prompts, resources available |
| **Schemas** | Parameter types, required fields |
| **Behavior** | Observed responses, return values |
| **Errors** | Error types, messages, conditions |
| **Security** | Vulnerabilities, attack surface |
| **Metadata** | Timestamp, model used, personas |

## Baseline Comparison

When comparing baselines, Inquest detects:

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
- [upload](/cli/upload) - Cloud baseline sync

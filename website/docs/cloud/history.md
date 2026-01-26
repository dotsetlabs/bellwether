---
title: history
sidebar_position: 6
---

# bellwether history

View baseline history for a project.

## Synopsis

```bash
bellwether history [project-id] [options]
```

## Description

The `history` command shows the baseline upload history for a project, including version numbers, timestamps, and drift summaries.

:::note Config Required
All CLI commands (except `init`) require a config file. Run `bellwether init` once before using `history`.
:::

## Arguments

| Argument | Description |
|:---------|:------------|
| `[project-id]` | Project ID (uses linked project if not specified) |

## Options

| Option | Description | Default |
|:-------|:------------|:--------|
| `-c, --config <path>` | Path to config file | `bellwether.yaml` |
| `-n, --limit <n>` | Number of versions to show | `history.limit` |
| `--json` | Output as JSON | `false` |
| `--session <session>` | Session token (overrides stored/env session) | - |

## Examples

### View Recent History

```bash
bellwether history
```

Output:
```
Baseline History: my-mcp-server
Showing 4 version(s)

Ver  Uploaded                 CLI Version  Hash
───  ───────────────────────  ───────────  ────────────────
 12  1/12/2026, 10:30 AM      0.9.0       a1b2c3d4e5f6a7b8
 11  1/10/2026, 2:22 PM       0.9.0       b2c3d4e5f6a7b8c9
 10  1/08/2026, 9:15 AM       0.9.0       c3d4e5f6a7b8c9d0
  9  1/05/2026, 4:45 PM       0.9.0       d4e5f6a7b8c9d0e1
```

### JSON Output

```bash
bellwether history --json
```

```json
[
  {
    "version": 12,
    "uploadedAt": "2026-01-12T10:30:00Z",
    "branch": "main",
    "commit": "abc123",
    "summary": {
      "added": 1,
      "modified": 2,
      "removed": 0
    }
  }
]
```

### View More History

```bash
bellwether history --limit 50
```

## Comparing Versions

Use the `bellwether diff` command to compare any two cloud versions:

```bash
# Compare version 10 to version 12
bellwether diff 10 12

# Compare versions for a specific project
bellwether diff 10 12 --project proj_abc123
```

Output:
```
Comparing v10 → v12

Severity: ⚠ WARNING

Tools added:     +1
Tools modified:  ~2
Behavior changes: 3

⚠️  Breaking changes detected!
   Tools were removed or modified in incompatible ways.
```

### diff Options

| Option | Description | Default |
|:-------|:------------|:--------|
| `-p, --project <id>` | Project ID | Linked project |
| `--json` | Output as JSON | `false` |
| `--session <session>` | Session token (overrides stored/env session) | - |

### Local File Comparison

To compare two local baseline files (without cloud), use `bellwether baseline diff`:

```bash
bellwether baseline diff v1.0.0.json v1.1.0.json
```

See [baseline diff](/cli/baseline#diff) for local comparison options.

## See Also

- [upload](/cloud/upload) - Upload new baselines
- [link](/cloud/link) - Link a project
- [Cloud Integration](/guides/cloud-integration) - Full cloud features

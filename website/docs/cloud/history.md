---
title: history
sidebar_position: 6
---

# bellwether history

View baseline history for a project.

## Synopsis

```bash
bellwether history [options]
```

## Description

The `history` command shows the baseline upload history for the linked project, including version numbers, timestamps, and drift summaries.

## Options

| Option | Description | Default |
|:-------|:------------|:--------|
| `--limit <n>` | Maximum entries to show | `10` |
| `--json` | Output as JSON | `false` |

## Examples

### View Recent History

```bash
bellwether history
```

Output:
```
Baseline History for my-mcp-server

Version  Date                 Branch   Changes
-------  -------------------  -------  --------
v12      2026-01-12 10:30    main     +1 tool, ~2 behaviors
v11      2026-01-10 14:22    main     Security fix
v10      2026-01-08 09:15    feature  ~3 behaviors
v9       2026-01-05 16:45    main     Initial baseline

Showing 4 of 12 baselines. Use --limit to see more.
```

### JSON Output

```bash
bellwether history --json
```

```json
{
  "projectId": "proj_abc123",
  "baselines": [
    {
      "version": 12,
      "createdAt": "2026-01-12T10:30:00Z",
      "branch": "main",
      "commit": "abc123",
      "summary": {
        "added": 1,
        "modified": 2,
        "removed": 0
      }
    }
  ]
}
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

---
title: history
sidebar_position: 9
---

# inquest history

View baseline history for a project.

## Synopsis

```bash
inquest history [options]
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
inquest history
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
inquest history --json
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
inquest history --limit 50
```

## Comparing Versions

Use the cloud dashboard to compare any two versions:

```
https://inquest.cloud/projects/proj_abc123/diff/10/12
```

Or use the CLI:

```bash
# Download and compare locally
curl -o v10.json https://inquest.cloud/api/projects/proj_abc123/baselines/10
curl -o v12.json https://inquest.cloud/api/projects/proj_abc123/baselines/12

inquest interview --compare-baseline v10.json --save-baseline v12.json npx your-server
```

## See Also

- [upload](/cli/upload) - Upload new baselines
- [link](/cli/link) - Link a project
- [Cloud Integration](/guides/cloud-integration) - Full cloud features

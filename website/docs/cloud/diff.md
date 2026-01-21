---
title: diff
sidebar_position: 7
---

# bellwether diff

Compare two cloud baseline versions to see what changed.

## Synopsis

```bash
bellwether diff <from> <to> [options]
```

## Description

The `diff` command compares two baseline versions stored in Bellwether Cloud and shows the structural and behavioral differences between them. This is useful for understanding what changed between releases.

For comparing **local** baseline files, use [`bellwether baseline diff`](/cli/baseline#diff) instead.

## Arguments

| Argument | Description |
|:---------|:------------|
| `<from>` | Source version number (required) |
| `<to>` | Target version number (required) |

## Options

| Option | Description | Default |
|:-------|:------------|:--------|
| `-p, --project <id>` | Project ID | Linked project |
| `--json` | Output as JSON | `false` |
| `--session <session>` | Session token (overrides stored/env session) | - |

## Examples

### Compare Two Versions

```bash
bellwether diff 10 12
```

Output:
```
Comparing v10 → v12

Severity: ⚠ WARNING

Tools added:     +1
Tools removed:   -0
Tools modified:  ~2
Behavior changes: 3

⚠️  Breaking changes detected!
   Tools were removed or modified in incompatible ways.
```

### Compare Versions for a Specific Project

```bash
bellwether diff 1 5 --project proj_abc123
```

### JSON Output

```bash
bellwether diff 10 12 --json
```

```json
{
  "severity": "warning",
  "toolsAdded": 1,
  "toolsRemoved": 0,
  "toolsModified": 2,
  "behaviorChanges": 3,
  "details": {
    "added": ["new_tool"],
    "modified": ["existing_tool_1", "existing_tool_2"]
  }
}
```

## Severity Levels

| Severity | Icon | Description |
|:---------|:-----|:------------|
| `none` | ✓ | No changes detected |
| `info` | ℹ | Minor changes (additive) |
| `warning` | ⚠ | Potentially breaking changes |
| `breaking` | ✗ | Breaking changes (tools removed or incompatibly modified) |

## Authentication

This command requires authentication. You must either:

1. Run `bellwether login` first
2. Pass `--session <token>` directly
3. Set `BELLWETHER_SESSION` environment variable

## Project Selection

The project is determined in this order:

1. `--project <id>` flag (if provided)
2. Linked project (from `bellwether link`)

If no project is specified and no project is linked, the command will fail with an error.

## Environment Variables

| Variable | Description |
|:---------|:------------|
| `BELLWETHER_SESSION` | Session token for authentication |
| `BELLWETHER_API_URL` | Custom API URL (default: `https://api.bellwether.sh`) |
| `BELLWETHER_TEAM_ID` | Team ID for multi-team accounts |

## See Also

- [history](/cloud/history) - View baseline history
- [upload](/cloud/upload) - Upload new baselines
- [baseline diff](/cli/baseline#diff) - Compare local baseline files
- [Cloud Integration](/guides/cloud-integration) - Full cloud features

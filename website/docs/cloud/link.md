---
title: link
sidebar_position: 3
---

# bellwether link

Link current directory to a Bellwether Cloud project.

## Synopsis

```bash
bellwether link [project-id]
```

## Description

The `link` command connects your local directory to a Bellwether Cloud project. This enables automatic baseline uploads, history tracking, and verification badges.

:::note Config Required
All CLI commands (except `init`) require a config file. Run `bellwether init` once before using `link`.
:::

## Arguments

| Argument | Description |
|:---------|:------------|
| `[project-id]` | Optional: Link to existing project ID |

## Options

| Option | Description | Default |
|:-------|:------------|:--------|
| `-n, --name <name>` | Project name (for new projects) | Directory name |
| `-c, --command <cmd>` | Server command (for new projects) | `node dist/server.js` |
| `--unlink` | Remove the project link from current directory | - |
| `--status` | Show current link status | - |

## Examples

### Create and Link New Project

```bash
bellwether link
```

Interactive prompt:
```
? Project name: my-mcp-server
? Visibility: public

Created project: my-mcp-server (proj_abc123)
Linked to current directory.
```

### Link to Existing Project

```bash
bellwether link proj_abc123
```

### Check Link Status

```bash
bellwether link --status
```

Output:
```
Project Link Status
───────────────────
Project: my-mcp-server
ID:      proj_abc123
Linked:  1/13/2026, 10:30:00 AM
Config:  .bellwether/link.json
```

### Unlink Project

```bash
bellwether link --unlink
```

## Project Configuration

Linking creates `.bellwether/link.json` in your project root:

```json
{
  "projectId": "proj_abc123",
  "projectName": "my-mcp-server",
  "linkedAt": "2026-01-13T10:30:00.000Z"
}
```

This file can be committed to version control for team sharing.

## What Linking Enables

After linking, you can:

- **Upload baselines** with `bellwether upload`
- **View history** with `bellwether history`
- **Get verification badges** for your README
- **Track drift** over time

## Verification Badge

After linking, add a badge to your README:

```markdown
[![Bellwether](https://bellwether.sh/badge/proj_abc123)](https://bellwether.sh/projects/proj_abc123)
```

## See Also

- [login](/cloud/login) - Authenticate first
- [upload](/cloud/upload) - Upload baselines
- [history](/cloud/history) - View baseline history

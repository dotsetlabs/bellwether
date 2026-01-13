---
title: link
sidebar_position: 7
---

# inquest link

Link current directory to an Inquest Cloud project.

## Synopsis

```bash
inquest link [project-id]
```

## Description

The `link` command connects your local directory to an Inquest Cloud project. This enables automatic baseline uploads, history tracking, and verification badges.

## Arguments

| Argument | Description |
|:---------|:------------|
| `[project-id]` | Optional: Link to existing project ID |

## Examples

### Create and Link New Project

```bash
inquest link
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
inquest link proj_abc123
```

## Project Configuration

Linking creates `.inquest.json` in your project root:

```json
{
  "projectId": "proj_abc123",
  "name": "my-mcp-server"
}
```

This file should be committed to version control.

## What Linking Enables

After linking, you can:

- **Upload baselines** with `inquest upload`
- **View history** with `inquest history`
- **Get verification badges** for your README
- **Track drift** across your team

## Verification Badge

After linking, add a badge to your README:

```markdown
[![Inquest](https://inquest.cloud/badge/proj_abc123)](https://inquest.cloud/projects/proj_abc123)
```

## See Also

- [login](/cli/login) - Authenticate first
- [upload](/cli/upload) - Upload baselines
- [history](/cli/history) - View baseline history

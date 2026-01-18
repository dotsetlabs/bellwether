---
title: projects
sidebar_position: 4
---

# bellwether projects

List your Bellwether Cloud projects.

## Synopsis

```bash
bellwether projects [options]
```

## Description

The `projects` command lists all Bellwether Cloud projects associated with your account. It shows project IDs, names, baseline counts, and last upload dates. The currently linked project is marked with an asterisk.

## Options

| Option | Description | Default |
|:-------|:------------|:--------|
| `--json` | Output as JSON | `false` |

## Examples

### List All Projects

```bash
bellwether projects
```

Output:
```
Your Projects

ID                    Name                 Baselines  Last Upload
────────────────────  ───────────────────  ─────────  ───────────────────
* proj_abc123         my-mcp-server                5  1/13/2026
  proj_def456         another-server               2  1/10/2026
  proj_ghi789         test-server                  0  Never

* = Currently linked project
```

### JSON Output

```bash
bellwether projects --json
```

Output:
```json
[
  {
    "id": "proj_abc123",
    "name": "my-mcp-server",
    "baselineCount": 5,
    "lastUploadAt": "2026-01-13T10:30:00.000Z"
  },
  {
    "id": "proj_def456",
    "name": "another-server",
    "baselineCount": 2,
    "lastUploadAt": "2026-01-10T15:45:00.000Z"
  }
]
```

## Authentication Required

You must be logged in to use this command:

```bash
bellwether login
bellwether projects
```

If not authenticated, you'll see:
```
Not authenticated. Run `bellwether login` first.
```

## No Projects

If you haven't created any projects yet:

```
No projects found.

Run `bellwether link` to create a project.
```

## See Also

- [login](/cloud/login) - Authenticate with Bellwether Cloud
- [link](/cloud/link) - Link directory to a project
- [upload](/cloud/upload) - Upload baselines to a project
- [history](/cloud/history) - View baseline history

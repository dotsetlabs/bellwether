---
title: teams
sidebar_position: 3
---

# bellwether teams

Manage team selection for cloud operations.

## Synopsis

```bash
bellwether teams [options]
bellwether teams switch [team-id]
bellwether teams current [options]
```

## Description

The `teams` command allows users who belong to multiple teams to list their teams and switch between them. When you're a member of multiple teams (e.g., personal team and a work team), this command lets you control which team context is used for cloud operations like project creation and uploads.

:::note Config Required
All CLI commands (except `init`) require a config file. Run `bellwether init` once before using `teams`.
:::

## Subcommands

| Subcommand | Description |
|:-----------|:------------|
| (none) | List all teams you belong to |
| `switch [team-id]` | Switch to a different team |
| `current` | Show the currently active team |

## Options

### teams

| Option | Description |
|:-------|:------------|
| `--json` | Output as JSON |

### teams current

| Option | Description |
|:-------|:------------|
| `--json` | Output as JSON |

## Examples

### List Your Teams

```bash
bellwether teams
```

Output:
```
Your Teams
-----------
  > Personal [owner] - free
      ID: team_abc123
    Work Team [member] - team
      ID: team_def456
    Client Project [admin] - solo
      ID: team_ghi789

Use `bellwether teams switch <team-id>` to change active team.
```

The `>` marker indicates the currently active team.

### Switch Teams

```bash
# Interactive selection (shows team list)
bellwether teams switch

# Switch to specific team by ID
bellwether teams switch team_def456

# Switch by team name (case-insensitive)
bellwether teams switch "Work Team"
```

Output:
```
Switched to team: Work Team

All cloud commands will now use this team context.
```

### Show Current Team

```bash
bellwether teams current
```

Output:
```
Current team: Work Team
  ID:   team_def456
  Role: member
  Plan: team
```

### JSON Output

```bash
bellwether teams --json
```

```json
{
  "teams": [
    {"id": "team_abc123", "name": "Personal", "plan": "free", "role": "owner"},
    {"id": "team_def456", "name": "Work Team", "plan": "team", "role": "member"}
  ],
  "activeTeamId": "team_def456",
  "effectiveTeamId": "team_def456",
  "envOverride": null
}
```

## Team ID Priority

When determining which team to use for cloud operations, the CLI uses this priority:

1. **`BELLWETHER_TEAM_ID` environment variable** - Highest priority, useful for CI/CD
2. **Project link team ID** - Team stored in `.bellwether/link.json` when project was linked
3. **Session active team** - Team selected via `bellwether teams switch`

This allows you to:
- Override the team in CI/CD pipelines without changing local settings
- Have different projects linked to different teams
- Set a default team for new projects

## CI/CD Usage

For CI/CD pipelines where you need to specify which team to use:

```bash
export BELLWETHER_TEAM_ID=team_work123
bellwether upload --ci
```

Or in GitHub Actions:

```yaml
env:
  BELLWETHER_SESSION: ${{ secrets.BELLWETHER_SESSION }}
  BELLWETHER_TEAM_ID: ${{ secrets.BELLWETHER_TEAM_ID }}
```

## Notes

- If you only belong to one team, the teams command will indicate this
- Team selection persists in `~/.bellwether/session.json`
- Project links store the team context at the time of linking
- Switching teams doesn't affect existing project links

## See Also

- [login](/cloud/login) - Authenticate with Bellwether Cloud
- [link](/cloud/link) - Link a project (stores team context)
- [projects](/cloud/projects) - List projects (filtered by active team)

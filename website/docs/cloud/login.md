---
title: login
sidebar_position: 2
---

# bellwether login

Authenticate with Bellwether Cloud.

:::info Private Beta
Bellwether Cloud is in private beta. You'll need a beta invitation code to log in.

To request access, email [hello@dotsetlabs.com](mailto:hello@dotsetlabs.com).
:::

## Synopsis

```bash
bellwether login [options]
```

## Description

The `login` command authenticates you with Bellwether Cloud, enabling baseline syncing and history tracking.

During beta, you'll be prompted for an invitation code if you don't already have beta access. Enter your code when prompted, then complete the GitHub OAuth flow.

## Options

| Option | Description |
|:-------|:------------|
| `--status` | Check current authentication status |
| `--logout` | Log out and clear stored credentials |
| `--mock` | Generate a mock session for local development |
| `--no-browser` | Do not automatically open browser |

## Examples

### Interactive Login

```bash
bellwether login
```

This uses GitHub OAuth device flow. A code is displayed that you enter in your browser to authenticate:

```
Bellwether Cloud Authentication

Signing in with GitHub...

To authenticate, visit:

  https://bellwether.sh/device

Enter code: ABCD-1234

Waiting for authorization...

Logged in as octocat
Email: octocat@github.com
Plan: free

Session saved to ~/.bellwether/session.json
```

### Login without Auto-Opening Browser

```bash
bellwether login --no-browser
```

### Check Status

```bash
bellwether login --status
```

Output:
```
Authentication Status
---------------------
GitHub: octocat
Name:   The Octocat
Email:  octocat@github.com
Mode:   Cloud
Team:   Personal (free)

Available teams (2):
  - Personal [owner] (active)
  - Work Team [member]

Use `bellwether teams switch` to change active team.

Session expires in 30 days
```

### Logout

```bash
bellwether login --logout
```

### Mock Mode for Development

For local development without cloud connection:

```bash
bellwether login --mock
```

This creates a mock session with local storage in `~/.bellwether/mock-cloud/`.

## CI/CD Usage

For CI/CD pipelines, use the `BELLWETHER_SESSION` environment variable instead of interactive login:

```bash
# Get your session token
bellwether login --status
# Copy the BELLWETHER_SESSION value

# In CI
export BELLWETHER_SESSION=iqt_xxx
bellwether upload --ci
```

Or in GitHub Actions:

```yaml
env:
  BELLWETHER_SESSION: ${{ secrets.BELLWETHER_SESSION }}
```

## Credential Storage

Credentials are stored in `~/.bellwether/session.json`:

```json
{
  "sessionToken": "sess_xxx",
  "expiresAt": "2026-02-12T00:00:00Z",
  "user": {
    "githubLogin": "octocat",
    "githubName": "The Octocat",
    "email": "octocat@github.com",
    "plan": "free"
  },
  "activeTeamId": "team_abc123",
  "teams": [
    {"id": "team_abc123", "name": "Personal", "plan": "free", "role": "owner"},
    {"id": "team_def456", "name": "Work Team", "plan": "team", "role": "member"}
  ]
}
```

:::warning
Never commit session.json to version control.
:::

## See Also

- [teams](/cloud/teams) - Manage team selection
- [link](/cloud/link) - Link a project
- [upload](/cloud/upload) - Upload baselines
- [Cloud Integration Guide](/guides/cloud-integration) - Full cloud setup

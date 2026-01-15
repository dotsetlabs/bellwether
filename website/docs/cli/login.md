---
title: login
sidebar_position: 6
---

# bellwether login

Authenticate with Bellwether Cloud.

## Synopsis

```bash
bellwether login [options]
```

## Description

The `login` command authenticates you with Bellwether Cloud, enabling baseline syncing and history tracking.

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
Plan:   free
Mode:   Cloud
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
  }
}
```

:::warning
Never commit session.json to version control.
:::

## See Also

- [link](/cli/link) - Link a project
- [upload](/cli/upload) - Upload baselines
- [Cloud Integration Guide](/guides/cloud-integration) - Full cloud setup

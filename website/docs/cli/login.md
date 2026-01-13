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
| `--token <token>` | Use a token directly instead of browser login |
| `--status` | Check current authentication status |
| `--logout` | Log out and clear stored credentials |

## Examples

### Interactive Login

```bash
bellwether login
```

This opens your browser for authentication. After logging in, credentials are stored locally.

### Login with Token

For CI/CD or headless environments:

```bash
bellwether login --token iqt_xxx
```

### Check Status

```bash
bellwether login --status
```

Output:
```
Logged in as: user@example.com
Plan: pro
Token expires: 2026-02-12
```

### Logout

```bash
bellwether login --logout
```

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

Credentials are stored in `~/.bellwether/auth.json`:

```json
{
  "token": "iqt_xxx",
  "expiresAt": "2026-02-12T00:00:00Z",
  "user": {
    "email": "user@example.com"
  }
}
```

:::warning
Never commit auth.json to version control.
:::

## See Also

- [link](/cli/link) - Link a project
- [upload](/cli/upload) - Upload baselines
- [Cloud Integration Guide](/guides/cloud-integration) - Full cloud setup

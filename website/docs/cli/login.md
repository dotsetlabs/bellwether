---
title: login
sidebar_position: 6
---

# inquest login

Authenticate with Inquest Cloud.

## Synopsis

```bash
inquest login [options]
```

## Description

The `login` command authenticates you with Inquest Cloud, enabling baseline syncing, history tracking, and team collaboration features.

## Options

| Option | Description |
|:-------|:------------|
| `--token <token>` | Use a token directly instead of browser login |
| `--status` | Check current authentication status |
| `--logout` | Log out and clear stored credentials |

## Examples

### Interactive Login

```bash
inquest login
```

This opens your browser for authentication. After logging in, credentials are stored locally.

### Login with Token

For CI/CD or headless environments:

```bash
inquest login --token iqt_xxx
```

### Check Status

```bash
inquest login --status
```

Output:
```
Logged in as: user@example.com
Organization: My Team
Token expires: 2026-02-12
```

### Logout

```bash
inquest login --logout
```

## CI/CD Usage

For CI/CD pipelines, use the `INQUEST_SESSION` environment variable instead of interactive login:

```bash
# Get your session token
inquest login --status
# Copy the INQUEST_SESSION value

# In CI
export INQUEST_SESSION=iqt_xxx
inquest upload --ci
```

Or in GitHub Actions:

```yaml
env:
  INQUEST_SESSION: ${{ secrets.INQUEST_SESSION }}
```

## Credential Storage

Credentials are stored in `~/.inquest/auth.json`:

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

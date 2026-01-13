---
title: upload
sidebar_position: 8
---

# inquest upload

Upload a baseline to Inquest Cloud for drift tracking.

## Synopsis

```bash
inquest upload [options]
```

## Description

The `upload` command uploads your local baseline to Inquest Cloud, enabling historical tracking, team collaboration, and CI/CD drift detection.

## Options

| Option | Description | Default |
|:-------|:------------|:--------|
| `--baseline <path>` | Path to baseline file | `inquest-baseline.json` |
| `--ci` | CI mode: exit 1 on breaking drift | `false` |
| `--fail-on-drift` | Exit with error if any drift detected | `false` |
| `--branch <name>` | Branch name for this baseline | Current git branch |
| `--commit <sha>` | Commit SHA for this baseline | Current git commit |

## Examples

### Basic Upload

```bash
# First, generate a baseline
inquest interview --save-baseline npx your-server

# Upload to cloud
inquest upload
```

### CI/CD Upload

```bash
inquest upload --ci --fail-on-drift
```

### Upload with Git Info

```bash
inquest upload \
  --branch main \
  --commit abc123
```

## CI/CD Integration

### GitHub Actions

```yaml
- name: Interview and Upload
  env:
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
    INQUEST_SESSION: ${{ secrets.INQUEST_SESSION }}
  run: |
    inquest interview --save-baseline npx your-server
    inquest upload --ci --fail-on-drift
```

### GitLab CI

```yaml
inquest:
  script:
    - inquest interview --save-baseline npx your-server
    - inquest upload --ci --fail-on-drift
  variables:
    OPENAI_API_KEY: $OPENAI_API_KEY
    INQUEST_SESSION: $INQUEST_SESSION
```

## Upload Response

Successful upload:
```
Uploaded baseline v12 to my-mcp-server

Changes from v11:
  + New tool: delete_file
  ~ read_file: error handling improved

View at: https://inquest.cloud/projects/proj_abc123/baselines/12
```

## Exit Codes

| Code | Meaning |
|:-----|:--------|
| `0` | Success - baseline uploaded |
| `1` | Drift detected (with `--fail-on-drift`) |
| `2` | Error - upload failed |

## See Also

- [link](/cli/link) - Link project first
- [history](/cli/history) - View upload history
- [CI/CD Guide](/guides/ci-cd) - Pipeline integration

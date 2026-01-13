---
title: upload
sidebar_position: 8
---

# bellwether upload

Upload a baseline to Bellwether Cloud for drift tracking.

## Synopsis

```bash
bellwether upload [options]
```

## Description

The `upload` command uploads your local baseline to Bellwether Cloud, enabling historical tracking and CI/CD drift detection.

## Options

| Option | Description | Default |
|:-------|:------------|:--------|
| `--baseline <path>` | Path to baseline file | `bellwether-baseline.json` |
| `--ci` | CI mode: exit 1 on breaking drift | `false` |
| `--fail-on-drift` | Exit with error if any drift detected | `false` |
| `--branch <name>` | Branch name for this baseline | Current git branch |
| `--commit <sha>` | Commit SHA for this baseline | Current git commit |

## Examples

### Basic Upload

```bash
# First, generate a baseline
bellwether interview --save-baseline npx your-server

# Upload to cloud
bellwether upload
```

### CI/CD Upload

```bash
bellwether upload --ci --fail-on-drift
```

### Upload with Git Info

```bash
bellwether upload \
  --branch main \
  --commit abc123
```

## CI/CD Integration

### GitHub Actions

```yaml
- name: Interview and Upload
  env:
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
    BELLWETHER_SESSION: ${{ secrets.BELLWETHER_SESSION }}
  run: |
    bellwether interview --save-baseline npx your-server
    bellwether upload --ci --fail-on-drift
```

### GitLab CI

```yaml
bellwether:
  script:
    - bellwether interview --save-baseline npx your-server
    - bellwether upload --ci --fail-on-drift
  variables:
    OPENAI_API_KEY: $OPENAI_API_KEY
    BELLWETHER_SESSION: $BELLWETHER_SESSION
```

## Upload Response

Successful upload:
```
Uploaded baseline v12 to my-mcp-server

Changes from v11:
  + New tool: delete_file
  ~ read_file: error handling improved

View at: https://bellwether.sh/projects/proj_abc123/baselines/12
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

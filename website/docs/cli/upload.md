---
title: upload
sidebar_position: 8
---

# bellwether upload

Upload a baseline to Bellwether Cloud for drift tracking.

## Synopsis

```bash
bellwether upload [baseline] [options]
```

## Description

The `upload` command uploads your local baseline to Bellwether Cloud, enabling historical tracking and CI/CD drift detection.

## Arguments

| Argument | Description | Default |
|:---------|:------------|:--------|
| `[baseline]` | Path to baseline JSON file | `bellwether-baseline.json` |

## Options

| Option | Description | Default |
|:-------|:------------|:--------|
| `-p, --project <id>` | Project ID to upload to | Uses linked project |
| `--public` | Make baseline publicly viewable | `false` |
| `--ci` | CI mode: output URL only, exit 1 on breaking drift | `false` |
| `--session <session>` | Session token (overrides stored/env session) | - |
| `--fail-on-drift` | Exit with error if any behavioral drift detected | `false` |

## Examples

### Basic Upload

```bash
# First, generate a baseline
bellwether test --save-baseline npx your-server

# Upload to cloud (uses linked project)
bellwether upload
```

### Upload Specific Baseline

```bash
bellwether upload ./baselines/v1.json
```

### Upload to Specific Project

```bash
bellwether upload --project proj_abc123
```

### CI/CD Upload

```bash
bellwether upload --ci --fail-on-drift
```

## CI/CD Integration

### GitHub Actions

```yaml
- name: Interview and Upload
  env:
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
    BELLWETHER_SESSION: ${{ secrets.BELLWETHER_SESSION }}
  run: |
    bellwether test --save-baseline npx your-server
    bellwether upload --ci --fail-on-drift
```

### GitLab CI

```yaml
bellwether:
  script:
    - bellwether test --save-baseline npx your-server
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

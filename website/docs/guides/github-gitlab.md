---
title: GitHub & GitLab Integration
sidebar_position: 8
---

# GitHub & GitLab Integration

Integrate Bellwether with GitHub and GitLab for automated PR checks, status updates, and drift detection in your CI/CD pipeline.

## GitHub Integration

### GitHub App (Team Plan)

The Bellwether GitHub App provides native integration with automatic PR checks and status updates.

#### Installation

1. Go to your project in the Bellwether dashboard
2. Navigate to **Settings** > **Integrations**
3. Click **Connect GitHub**
4. Select the repositories you want to connect
5. Authorize the Bellwether GitHub App

#### Features

| Feature | Description |
|:--------|:------------|
| **PR Checks** | Automatic baseline comparison on pull requests |
| **Status Updates** | Check status posted to PR (pass/fail) |
| **PR Comments** | Detailed diff summary as PR comment |
| **Commit Status** | Status badges on commits |

#### How It Works

When a PR is opened or updated:

1. Bellwether compares the PR's baseline against the main branch baseline
2. Posts a check run with pass/fail status
3. Adds a comment with drift summary (if changes detected)
4. Updates commit status

#### Example PR Comment

```markdown
## Bellwether Drift Report

**Status:** Breaking changes detected

### Changes
- **Tool added:** `new_helper_tool`
- **Tool modified:** `execute_command`
  - Schema changed: added `timeout` parameter
  - Security: Potential command injection (high severity)

### Summary
- 1 breaking change
- 2 warnings
- 1 security finding

[View full diff](https://bellwether.sh/projects/proj_abc/diff/11/12)
```

### GitHub Actions (All Plans)

Use GitHub Actions for CI/CD integration without the GitHub App.

#### Basic Workflow

```yaml
# .github/workflows/bellwether.yml
name: Bellwether CI
on:
  push:
    branches: [main]
  pull_request:

jobs:
  bellwether:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install Bellwether
        run: npm install -g @dotsetlabs/bellwether

      - name: Run Test
        run: |
          bellwether check npx your-mcp-server
          bellwether baseline save

      - name: Upload to Cloud
        env:
          BELLWETHER_SESSION: ${{ secrets.BELLWETHER_SESSION }}
        run: |
          bellwether upload --ci --fail-on-drift
```

#### Using the Official Action

```yaml
- name: Run Bellwether
  uses: dotsetlabs/bellwether@v1
  with:
    server-command: 'npx @modelcontextprotocol/server-filesystem'
    server-args: '/tmp'
    baseline-path: './bellwether-baseline.json'
    fail-on-drift: 'true'
  env:
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

#### PR Comparison Workflow

Compare against the main branch baseline:

```yaml
name: Bellwether PR Check
on:
  pull_request:

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Download main branch baseline
        run: |
          git fetch origin main
          git checkout origin/main -- baseline.json || echo "{}" > baseline.json
          mv baseline.json main-baseline.json

      - name: Generate PR baseline
        run: |
          npx @dotsetlabs/bellwether check npx your-server
          npx @dotsetlabs/bellwether baseline save ./pr-baseline.json

      - name: Compare baselines
        run: |
          npx @dotsetlabs/bellwether baseline diff main-baseline.json pr-baseline.json
```

### Getting Your Session Token

For cloud upload in CI:

```bash
# Login locally
bellwether login

# Get session token
bellwether login --status
```

Add the `BELLWETHER_SESSION` value to your GitHub repository secrets.

---

## GitLab Integration

### GitLab CI/CD

#### Basic Pipeline

```yaml
# .gitlab-ci.yml
stages:
  - test

bellwether:
  stage: test
  image: node:20
  script:
    - npm install -g @dotsetlabs/bellwether
    - bellwether check npx your-mcp-server
    - bellwether baseline save
    - bellwether upload --ci --fail-on-drift
  variables:
    BELLWETHER_SESSION: $BELLWETHER_SESSION
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
```

#### Merge Request Comparison

```yaml
bellwether:mr:
  stage: test
  image: node:20
  script:
    # Fetch main branch baseline
    - git fetch origin $CI_DEFAULT_BRANCH
    - git checkout origin/$CI_DEFAULT_BRANCH -- bellwether-baseline.json || echo "{}" > bellwether-baseline.json
    - mv bellwether-baseline.json main-baseline.json

    # Generate MR baseline
    - npm install -g @dotsetlabs/bellwether
    - bellwether check npx your-server
    - bellwether baseline save ./mr-baseline.json

    # Compare
    - bellwether baseline diff main-baseline.json mr-baseline.json
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
```

#### Commit Baseline on Main

```yaml
bellwether:commit:
  stage: test
  image: node:20
  script:
    - npm install -g @dotsetlabs/bellwether
    - bellwether check npx your-server
    - bellwether baseline save
    - |
      if ! git diff --quiet bellwether-baseline.json; then
        git config user.email "ci@bellwether.sh"
        git config user.name "Bellwether CI"
        git add bellwether-baseline.json
        git commit -m "chore: update bellwether baseline [skip ci]"
        git push https://oauth2:${GITLAB_TOKEN}@gitlab.com/${CI_PROJECT_PATH}.git HEAD:$CI_COMMIT_BRANCH
      fi
  rules:
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
```

### GitLab Variables

Add these CI/CD variables in GitLab:

| Variable | Description |
|:---------|:------------|
| `BELLWETHER_SESSION` | Bellwether Cloud session token (masked) |
| `GITLAB_TOKEN` | GitLab personal access token (for committing baselines) |
| `OPENAI_API_KEY` | Your OpenAI API key (masked, only for explore mode) |

---

## Best Practices

### 1. Use Presets for CI

The `--preset ci` option is optimized for fast, low-cost CI runs:

```bash
bellwether check --preset ci npx your-server
```

### 2. Cache Dependencies

Speed up CI by caching npm packages:

```yaml
# GitHub Actions
- uses: actions/cache@v4
  with:
    path: ~/.npm
    key: npm-${{ hashFiles('package-lock.json') }}

# GitLab CI
cache:
  paths:
    - node_modules/
```

### 3. Fail on Breaking Changes

Use `--fail-on-drift` to fail the pipeline on breaking changes:

```bash
bellwether upload --ci --fail-on-drift
```

### 4. Store Baselines in Git

Commit baseline files to track history:

```bash
git add bellwether-baseline.json
git commit -m "Update bellwether baseline"
```

### 5. Use Branch Protection

Require Bellwether checks to pass before merging:

**GitHub:**
- Settings > Branches > Branch protection rules
- Require status checks: "Bellwether"

**GitLab:**
- Settings > Merge requests
- Require pipeline to succeed

---

## Troubleshooting

### Check Not Running

Ensure the webhook is configured:
- GitHub: Check repository settings > Webhooks
- GitLab: Check project settings > Webhooks

### Permission Errors

Verify the GitHub App has access to the repository:
- GitHub: Settings > Applications > Bellwether > Configure

### Session Token Expired

Refresh your session token:

```bash
bellwether login
bellwether login --status  # Copy new token
```

Update your CI secrets with the new token.

## See Also

- [CI/CD Integration](/guides/ci-cd) - Detailed CI/CD setup
- [Cloud Integration](/guides/cloud-integration) - Cloud features overview
- [Webhooks](/guides/webhooks) - Custom webhook integrations

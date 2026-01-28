---
title: GitHub & GitLab Integration
sidebar_position: 8
---

# GitHub & GitLab Integration

Integrate Bellwether with GitHub and GitLab for automated drift detection in your CI/CD pipeline.

## GitHub Integration

### GitHub Actions

Use GitHub Actions for CI/CD integration with drift detection.

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

      - name: Run Check
        run: |
          bellwether check
          bellwether baseline compare ./bellwether-baseline.json --fail-on-drift
```

#### Using the Official Action

```yaml
- name: Run Bellwether
  uses: dotsetlabs/bellwether@v1
  with:
    server-command: 'npx @modelcontextprotocol/server-filesystem'
    server-args: '/tmp'
    baseline-path: './bellwether-baseline.json'
    fail-on-severity: 'warning'
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
          git checkout origin/main -- bellwether-baseline.json || echo "{}" > bellwether-baseline.json
          mv bellwether-baseline.json main-baseline.json

      - name: Generate PR baseline
        run: |
          npx @dotsetlabs/bellwether check
          npx @dotsetlabs/bellwether baseline save ./pr-baseline.json

      - name: Compare baselines
        run: |
          npx @dotsetlabs/bellwether baseline diff main-baseline.json pr-baseline.json --fail-on-drift
```

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
    - bellwether check
    - bellwether baseline compare ./bellwether-baseline.json --fail-on-drift
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
    - bellwether check
    - bellwether baseline save ./mr-baseline.json

    # Compare
    - bellwether baseline diff main-baseline.json mr-baseline.json --fail-on-drift
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
    - bellwether check
    - bellwether baseline save
    - |
      if ! git diff --quiet bellwether-baseline.json; then
        git config user.email "ci@example.com"
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
| `GITLAB_TOKEN` | GitLab personal access token (for committing baselines) |
| `OPENAI_API_KEY` | Your OpenAI API key (masked, only for explore mode) |

---

## Best Practices

### 1. Use Presets for CI

The `--preset ci` option is optimized for fast CI runs:

```bash
bellwether init --preset ci npx your-server
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

Use `--fail-on-drift` to fail on any drift:

```bash
bellwether baseline compare ./bellwether-baseline.json --fail-on-drift
```

### 4. Store Baselines in Git

Commit baseline files to track history:

```bash
git add bellwether-baseline.json bellwether.yaml
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

Ensure the workflow file is in `.github/workflows/` (GitHub) or `.gitlab-ci.yml` exists (GitLab).

### Permission Errors

For GitLab, ensure `GITLAB_TOKEN` has write access to the repository.

## See Also

- [CI/CD Integration](/guides/ci-cd) - Detailed CI/CD setup
- [Configuration](/guides/configuration) - Customize bellwether.yaml

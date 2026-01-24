---
title: Configuration
sidebar_position: 2
---

# Configuration

Bellwether uses a config-first approach where all settings are defined in `bellwether.yaml`.

## Getting Started

Create a configuration file with `bellwether init`:

```bash
bellwether init                    # Default check mode (free, fast)
bellwether init --preset ci        # Optimized for CI/CD
bellwether init --preset security  # Security-focused testing
bellwether init --preset thorough  # Comprehensive testing
bellwether init --preset local     # Explore mode with local Ollama
```

The generated file includes all options with helpful comments.

## Configuration File Location

Bellwether looks for configuration in this order:

1. `--config` flag (explicit path)
2. `./bellwether.yaml` (project root)
3. `./bellwether.yml`
4. `./.bellwether.yaml`
5. `./.bellwether.yml`

:::info Config Required
All commands (except `bellwether init`) require a config file. Run `bellwether init` to create `bellwether.yaml` first.
:::

## Configuration Overview

The generated `bellwether.yaml` includes all available options with comments. Below is a concise, up-to-date overview of the main sections. For the full reference, run `bellwether init` and edit the generated file.

```yaml
server:
  command: "npx @mcp/your-server"
  args: []
  timeout: 30000
  # env:
  #   API_KEY: "${API_KEY}"

scenarios:
  # path: "./bellwether-tests.yaml"
  only: false

output:
  dir: ".bellwether"
  docsDir: "."
  format: both        # Currently informational; docs + JSON are always written
  examples:
    full: true
    maxLength: 5000
    maxPerTool: 5
  files:
    checkReport: "bellwether-check.json"
    exploreReport: "bellwether-explore.json"
    contractDoc: "CONTRACT.md"
    agentsDoc: "AGENTS.md"
    verificationReport: "bellwether-verification.json"

baseline:
  path: "bellwether-baseline.json"
  # savePath: ".bellwether/bellwether-baseline.json"
  # comparePath: "./bellwether-baseline.json"
  failOnDrift: false
  outputFormat: text
  severity:
    minimumSeverity: none
    failOnSeverity: breaking
    suppressWarnings: false
    # aspectOverrides:
    #   description: none

check:
  incremental: false
  incrementalCacheHours: 168
  parallel: true
  parallelWorkers: 4
  performanceThreshold: 10
  diffFormat: text
  warmupRuns: 0
  smartTestValues: true
  statefulTesting:
    enabled: true
    maxChainLength: 5
    shareOutputsBetweenTools: true
  externalServices:
    mode: skip   # skip | mock | fail
    services: {}
  assertions:
    enabled: true
    strict: false
    infer: true
  rateLimit:
    enabled: false
    requestsPerSecond: 10
    burstLimit: 20
    backoffStrategy: exponential
    maxRetries: 3
  security:
    enabled: false
    categories:
      - sql_injection
      - xss
      - path_traversal
      - command_injection
      - ssrf
      - error_disclosure
  sampling:
    minSamples: 10
    targetConfidence: low
    failOnLowConfidence: false
  metrics:
    countValidationAsSuccess: true
    separateValidationMetrics: true

llm:
  provider: ollama
  model: ""
  ollama:
    baseUrl: "http://localhost:11434"
  # openaiApiKeyEnvVar: OPENAI_API_KEY
  # anthropicApiKeyEnvVar: ANTHROPIC_API_KEY

explore:
  personas: [technical_writer]
  maxQuestionsPerTool: 3
  parallelPersonas: false
  personaConcurrency: 3
  skipErrorTests: false

workflows:
  # path: "./bellwether-workflows.yaml"
  discover: false        # LLM discovery (explore only)
  trackState: false
  autoGenerate: false    # Check-mode generation
  requireSuccessfulDependencies: true
  stepTimeout: 5000
  timeouts:
    toolCall: 5000
    stateSnapshot: 10000
    probeTool: 5000
    llmAnalysis: 30000
    llmSummary: 60000

watch:
  path: "."
  interval: 5000
  extensions: [".ts", ".js", ".json", ".py", ".go"]
  # onDrift: "npm test"

cache:
  enabled: true
  dir: ".bellwether/cache"

logging:
  level: info
  verbose: false

discovery:
  json: false
  timeout: 30000
  transport: stdio
  # url: "https://example.com/mcp"
  # sessionId: "session-id"

registry:
  limit: 10
  json: false

history:
  limit: 10
  json: false

link:
  defaultServerCommand: "node dist/server.js"

golden:
  defaultArgs: "{}"
  mode: structural       # exact | structural | semantic
  compareFormat: text
  listFormat: text
  normalizeTimestamps: true
  normalizeUuids: true

verify:
  tier: silver
  security: false
  json: false
  badgeOnly: false

contract:
  # path: "./contract.bellwether.yaml"
  mode: strict           # strict | lenient | report
  format: text
  timeout: 30000
  failOnViolation: false
```

## Environment Variable Interpolation

Bellwether supports environment variable interpolation in your configuration file, allowing you to reference secrets without committing them to version control.

### Syntax

```yaml
server:
  env:
    # Basic interpolation - pulls from shell or .env file
    API_KEY: "${API_KEY}"
    SERVICE_URL: "${SERVICE_URL}"

    # With default values - uses fallback if var is not set
    LOG_LEVEL: "${LOG_LEVEL:-info}"
    DEBUG: "${DEBUG:-false}"
    TIMEOUT: "${TIMEOUT:-30000}"
```

### How It Works

1. **At runtime**, Bellwether replaces `${VAR}` with the value of the environment variable `VAR`
2. **Default values** can be specified with `${VAR:-default}` syntax
3. **Unset variables** without defaults are left as-is (useful for catching missing config)

### Example Workflow

```bash
# Set environment variables
export PLEX_URL="http://192.168.1.100:32400"
export PLEX_TOKEN="your-token-here"

# Or use a .env file with dotenv
# PLEX_URL=http://192.168.1.100:32400
# PLEX_TOKEN=your-token-here

# Run bellwether - it will interpolate the values
bellwether check
```

:::tip Commit-Safe Configuration
This pattern allows you to commit `bellwether.yaml` to version control while keeping secrets in environment variables or `.env` files (which should be gitignored).
:::

### Common Patterns

**API Keys and Tokens:**
```yaml
server:
  env:
    API_KEY: "${API_KEY}"
    AUTH_TOKEN: "${AUTH_TOKEN}"
```

**URLs with Defaults:**
```yaml
server:
  env:
    BASE_URL: "${BASE_URL:-http://localhost:3000}"
    API_ENDPOINT: "${API_ENDPOINT:-/api/v1}"
```

**Feature Flags:**
```yaml
server:
  env:
    DEBUG: "${DEBUG:-false}"
    LOG_LEVEL: "${LOG_LEVEL:-info}"
```

## Multiple Configurations

Manage different configs for different environments:

```bash
# Development config
bellwether init --preset local
mv bellwether.yaml configs/dev.yaml

# CI config
bellwether init --preset ci
mv bellwether.yaml configs/ci.yaml

# Use specific config
bellwether check --config configs/ci.yaml npx your-server
```

## Configuration Validation

Bellwether validates your config on startup and shows helpful errors:

```
Invalid configuration:
  - llm.provider: Must be one of: ollama, openai, anthropic
  - explore.maxQuestionsPerTool: Must be between 1 and 10
```

## Best Practices

1. **Version control your config** - Commit `bellwether.yaml` to your repo
2. **Use `bellwether check` for CI** - Deterministic, free, fast
3. **Never commit API keys** - Use environment variables or `bellwether auth`
4. **Use presets as starting points** - Customize from there
5. **Keep JSON reports accessible** - `bellwether-check.json` and `bellwether-explore.json` are always written to `output.dir`

## See Also

- [init](/cli/init) - Generate configuration
- [check](/cli/check) - Run tests using configuration
- [baseline](/cli/baseline) - Manage baselines
- [Custom Scenarios](/guides/custom-scenarios) - YAML-defined test cases
- [CI/CD Integration](/guides/ci-cd) - Pipeline configurations

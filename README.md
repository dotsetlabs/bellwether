# Bellwether

[![Build Status](https://github.com/dotsetlabs/bellwether/actions/workflows/ci.yml/badge.svg)](https://github.com/dotsetlabs/bellwether/actions)
[![npm version](https://img.shields.io/npm/v/@dotsetlabs/bellwether)](https://www.npmjs.com/package/@dotsetlabs/bellwether)
[![Documentation](https://img.shields.io/badge/docs-docs.bellwether.sh-blue)](https://docs.bellwether.sh)

> **Catch MCP server drift before your users do. Zero LLM required.**

Bellwether detects structural changes in your [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) server using **schema comparison**. No LLM needed. Free. Deterministic.

## Quick Start

```bash
# Install
npm install -g @dotsetlabs/bellwether

# Initialize configuration (required before any other command)
bellwether init npx @mcp/your-server

# Check for drift (free, fast, deterministic)
bellwether check

# Save baseline for drift detection
bellwether baseline save

# Optional: Explore behavior with LLM
bellwether explore
```

That's it. No API keys needed for check. No LLM costs. Deterministic results.

## CI/CD Integration

Add drift detection to every PR:

```yaml
# .github/workflows/bellwether.yml
name: MCP Drift Detection
on: [pull_request]

jobs:
  bellwether:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npx @dotsetlabs/bellwether init --preset ci npx @mcp/your-server
      - run: npx @dotsetlabs/bellwether check --fail-on-drift
```

Commit `bellwether.yaml` to your repo so CI always has your config. No secrets needed for `check`. Runs in seconds.

### Exit Codes

Check command returns granular exit codes for CI/CD pipelines:

| Code | Meaning | CI Action |
|:-----|:--------|:----------|
| `0` | No changes detected | Pass |
| `1` | Info-level changes only | Exit code `1` (handle in CI as desired) |
| `2` | Warning-level changes | Exit code `2` (handle in CI as desired) |
| `3` | Breaking changes | Always fail |
| `4` | Runtime error | Fail |
| `5` | Low confidence (when `check.sampling.failOnLowConfidence` is true) | Fail |

## What Bellwether Detects

Check mode detects when your MCP server changes:

| Change Type | Example | Detected |
|:------------|:--------|:---------|
| **Tool added** | New `delete_file` tool appears | Yes |
| **Tool removed** | `write_file` tool disappears | Yes |
| **Schema changed** | Parameter `path` becomes required | Yes |
| **Description changed** | Tool help text updated | Yes |
| **Tool renamed** | `read` becomes `read_file` | Yes |
| **Performance regression** | Tool latency increased >10% | Yes |
| **Performance confidence** | Statistical reliability of metrics | Yes |
| **Security vulnerabilities** | SQL injection accepted (when `check.security.enabled` is on) | Yes |
| **Response schema changes** | Response fields added/removed | Yes |
| **Unstable schemas** | Inconsistent response structures | Yes |
| **Error trends** | New error types, increasing errors | Yes |

This catches the changes that break AI agent workflows.

## Documentation

**[docs.bellwether.sh](https://docs.bellwether.sh)** - Full documentation including:

- [Quick Start](https://docs.bellwether.sh/quickstart)
- [CLI Reference](https://docs.bellwether.sh/cli/init)
- [Test Modes](https://docs.bellwether.sh/concepts/test-modes)
- [CI/CD Integration](https://docs.bellwether.sh/guides/ci-cd)
- [Cloud Features](https://docs.bellwether.sh/cloud)

## Configuration

All settings are configured in `bellwether.yaml`. Create one with:

```bash
bellwether init npx @mcp/your-server           # Default (free, fast)
bellwether init --preset ci npx @mcp/server    # Optimized for CI/CD
bellwether init --preset security npx @mcp/server  # Security-focused exploration
bellwether init --preset thorough npx @mcp/server  # Comprehensive exploration
bellwether init --preset local npx @mcp/server # Exploration with local Ollama
```

The generated config file is fully documented with all available options.

### Environment Variable Interpolation

Reference environment variables in your config:

```yaml
server:
  command: "npx @mcp/your-server"
  env:
    API_KEY: "${API_KEY}"
    DEBUG: "${DEBUG:-false}"  # With default value
```

This allows committing `bellwether.yaml` to version control without exposing secrets.

## Commands

### Check Command (Recommended for CI)

```bash
bellwether init npx @mcp/your-server
bellwether check
```

- **Zero LLM** - No API keys required
- **Free** - No token costs
- **Deterministic** - Same input = same output
- **Fast** - Runs in seconds (use `check.parallel` in config for more speed)
- **Output** - Writes `CONTRACT.md` to `output.docsDir` and `bellwether-check.json` to `output.dir` (filenames configurable via `output.files.contractDoc` and `output.files.checkReport`)
- **CI-Optimized** - Granular exit codes (0-5), JUnit/SARIF output formats

#### Check Mode Enhancements

- **Stateful testing** for create → use → delete chains
- **External service handling** (skip, mock, or fail when credentials are missing)
- **Response assertions** for semantic validation of outputs
- **Rate limiting** to avoid 429s on production servers

Example configuration:

```yaml
check:
  statefulTesting:
    enabled: true
    maxChainLength: 5
    shareOutputsBetweenTools: true

  externalServices:
    mode: skip   # skip | mock | fail
    services:
      plaid:
        enabled: false
        sandboxCredentials:
          clientId: "${PLAID_CLIENT_ID}"
          secret: "${PLAID_SECRET}"

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
```

#### Check Report Schema

`bellwether-check.json` includes a `$schema` pointer and is validated before writing.
Schema URL:

```
https://unpkg.com/@dotsetlabs/bellwether/schemas/bellwether-check.schema.json
```

### Explore Command (Optional)

```bash
bellwether init --preset local npx @mcp/your-server  # Uses local Ollama (free)
# or
bellwether init --preset thorough npx @mcp/server    # Uses OpenAI (requires API key)

bellwether explore
```

- Requires LLM (Ollama for free local, or OpenAI/Anthropic)
- Multi-persona testing (technical writer, security tester, QA, novice)
- Generates `AGENTS.md` documentation (filename configurable via `output.files.agentsDoc`)
- Better for local development and deep exploration

### Core Commands

```bash
# Initialize configuration (creates bellwether.yaml)
bellwether init npx @mcp/server
bellwether init --preset ci npx @mcp/server

# Validate configuration (no tests)
bellwether validate-config

# Check for drift (free, fast, deterministic)
bellwether check                   # Uses server.command from config
bellwether check npx @mcp/server   # Override server command
bellwether check --fail-on-drift   # Override baseline.failOnDrift from config
bellwether check --format junit    # JUnit XML output for CI
bellwether check --format sarif    # SARIF output for GitHub Code Scanning

# Configure performance, parallelism, incremental, and security in bellwether.yaml
# (check.parallel, check.incremental, check.security, check.sampling)

# Explore behavior (LLM-powered)
bellwether explore                 # Uses server.command from config
bellwether explore npx @mcp/server # Override server command

# Discover server capabilities
bellwether discover npx @mcp/server

# Watch mode (re-check on file changes, uses config)
bellwether watch

# Search MCP Registry
bellwether registry filesystem
bellwether registry database --limit 5

# Generate verification report
bellwether verify --tier gold

# Validate against contracts
bellwether contract generate npx @mcp/server
bellwether contract validate npx @mcp/server
bellwether contract show     # Display current contract

# Manage golden outputs (deterministic regression tests)
bellwether golden save --tool my_tool --args '{"id":"123"}'
bellwether golden compare
```

### Baseline Commands

```bash
# Save test results as baseline
bellwether baseline save
bellwether baseline save ./my-baseline.json

# Compare test results against baseline
bellwether baseline compare --fail-on-drift  # Uses baseline.comparePath or baseline.path from config
bellwether baseline compare ./baseline.json --ignore-version-mismatch  # Force compare incompatible versions

# Show baseline contents
bellwether baseline show
bellwether baseline show ./baseline.json --json

# Compare two baseline files
bellwether baseline diff v1.json v2.json
bellwether baseline diff v1.json v2.json --ignore-version-mismatch  # Force compare incompatible versions

# Migrate baseline to current format version
bellwether baseline migrate ./bellwether-baseline.json
bellwether baseline migrate ./baseline.json --dry-run
bellwether baseline migrate ./baseline.json --info

# Accept drift as intentional (update baseline)
bellwether baseline accept --reason "Intentional API change"
bellwether baseline accept --dry-run  # Preview without saving
bellwether baseline accept --force    # Required for breaking changes
```

### Baseline Format Versioning

Baselines use semantic versioning (e.g., `1.0.0`) for the format version:

- **Major version** - Breaking contract changes (removed fields, type changes)
- **Minor version** - New optional fields (backwards compatible)
- **Patch version** - Bug fixes in baseline generation

**Compatibility rules:**
- Same major version = Compatible (can compare baselines)
- Different major version = Incompatible (requires migration)

When comparing baselines with incompatible versions, the CLI will show an error:

```
Cannot compare baselines with incompatible format versions: v1.0.0 vs v2.0.0.
Use 'bellwether baseline migrate' to upgrade the older baseline,
or use --ignore-version-mismatch to force comparison (results may be incorrect).
```

To upgrade older baselines:

```bash
# Check if migration is needed
bellwether baseline migrate ./baseline.json --info

# Preview changes without writing
bellwether baseline migrate ./baseline.json --dry-run

# Perform migration
bellwether baseline migrate ./baseline.json
```

### Cloud Commands

```bash
# Authenticate with Bellwether Cloud
bellwether login
bellwether login --status
bellwether login --logout

# Manage team selection (for multi-team users)
bellwether teams              # List your teams
bellwether teams switch       # Interactive team selection
bellwether teams switch <id>  # Switch to specific team
bellwether teams current      # Show current active team

# Link project to cloud
bellwether link
bellwether link --status
bellwether link --unlink

# List cloud projects
bellwether projects
bellwether projects --json

# Upload baseline to cloud
bellwether upload
bellwether upload --ci --fail-on-drift

# View baseline version history
bellwether history
bellwether history --limit 20

# Compare cloud baseline versions
bellwether diff 1 2

# Get verification badge
bellwether badge --markdown
```

### Auth Commands

```bash
# Manage LLM API keys (stored in system keychain)
bellwether auth              # Interactive API key setup
bellwether auth status       # Show configured providers
bellwether auth add openai   # Add a specific provider key
bellwether auth remove openai # Remove a specific provider key
bellwether auth clear        # Remove all stored keys
```

## Security Testing

Run deterministic security vulnerability testing on your MCP tools:

```bash
# Enable security testing in config
bellwether init --preset security npx @mcp/your-server
bellwether check
```

### Security Categories

| Category | Description | CWE |
|:---------|:------------|:----|
| `sql_injection` | SQL injection payloads | CWE-89 |
| `xss` | Cross-site scripting payloads | CWE-79 |
| `path_traversal` | Path traversal attempts | CWE-22 |
| `command_injection` | Command injection payloads | CWE-78 |
| `ssrf` | Server-side request forgery | CWE-918 |
| `error_disclosure` | Sensitive error disclosure | CWE-209 |

### Security Baseline

Security findings are stored in your baseline and compared across runs:

```bash
# Enable security testing in config, then run check
bellwether check
bellwether baseline save

# On next run, compare security posture
bellwether check
# Reports: new findings, resolved findings, risk score changes
```

### Output

Security findings appear in:
- **CONTRACT.md** - Security Baseline section with findings and risk scores
- **Drift reports** - New/resolved findings when comparing baselines
- **SARIF format** - Integrates with GitHub Code Scanning

### Risk Levels

| Level | Score Range | Description |
|:------|:------------|:------------|
| Critical | 80-100 | Immediate action required |
| High | 60-79 | Serious vulnerability |
| Medium | 40-59 | Moderate risk |
| Low | 20-39 | Minor concern |
| Info | 0-19 | Informational |

## Semantic Validation

The check command automatically infers semantic types from parameter names and descriptions, then generates targeted validation tests.

### Inferred Semantic Types

| Type | Example Parameters | Validation |
|:-----|:-------------------|:-----------|
| `date_iso8601` | `created_date`, `birth_day` | YYYY-MM-DD format |
| `datetime` | `created_at`, `updated_at` | ISO 8601 datetime |
| `timestamp` | `unix_epoch`, `time_ms` | Positive integer |
| `email` | `user_email`, `contact_email` | Valid email format |
| `url` | `website_url`, `api_endpoint` | Valid URL format |
| `identifier` | `user_id`, `order_uuid` | Non-empty string |
| `ip_address` | `server_ip`, `client_ip` | IPv4 or IPv6 |
| `phone` | `phone_number`, `mobile` | At least 7 digits |
| `percentage` | `tax_rate`, `progress` | Numeric value |
| `amount_currency` | `total_price`, `balance` | Numeric value |
| `file_path` | `file_path`, `directory` | Path string |
| `json` | `config_data`, `payload` | Valid JSON |
| `base64` | `encoded_data`, `b64_content` | Valid base64 |
| `regex` | `filter_pattern`, `regex` | Valid regex |

### How It Works

1. **Inference**: Parameters are analyzed based on name patterns and descriptions
2. **Test Generation**: Invalid values are generated for each inferred type
3. **Validation**: Tests verify that tools properly reject invalid semantic values
4. **Documentation**: Inferred types appear in CONTRACT.md

Semantic validation runs automatically as part of `bellwether check` - no additional flags needed.

## Response Schema Tracking

The check command tracks response schema consistency across multiple test samples, detecting when tools return inconsistent or evolving response structures.

### What It Tracks

| Aspect | Detection | Impact |
|:-------|:----------|:-------|
| **Field consistency** | Fields appearing inconsistently across samples | Schema instability |
| **Type changes** | Field types varying between responses | Breaking changes |
| **Required changes** | Fields becoming required/optional | Contract changes |
| **Schema evolution** | Structural changes between baselines | API drift |

### Stability Grades

| Grade | Confidence | Meaning |
|:------|:-----------|:--------|
| A | 95%+ | Fully stable, consistent responses |
| B | 85%+ | Mostly stable, minor variations |
| C | 70%+ | Moderately stable, some inconsistency |
| D | 50%+ | Unstable, significant variations |
| F | <50% | Very unstable, unreliable responses |
| N/A | - | Insufficient samples (< 3) |

### Breaking vs Non-Breaking Changes

**Breaking changes** (fail CI):
- Fields removed from responses
- Types changed to incompatible types (e.g., `string` → `number`)
- Previously optional fields becoming required

**Non-breaking changes** (warning):
- New fields added
- Required fields becoming optional
- Compatible type widening (e.g., `integer` → `number`)

### Output

Schema evolution findings appear in:
- **CONTRACT.md** - Schema Stability section with grades and consistency metrics
- **Drift reports** - Structure changes, breaking changes, stability changes
- **JUnit/SARIF** - Test cases for schema evolution issues

Response schema tracking runs automatically during `bellwether check` - no additional flags needed.

## Error Analysis

The check command provides enhanced error analysis with root cause detection and remediation suggestions.

### What It Analyzes

| Aspect | Detection | Impact |
|:-------|:----------|:-------|
| **HTTP status codes** | Parses 4xx/5xx codes from messages | Error categorization |
| **Root cause** | Infers cause from error patterns | Debugging guidance |
| **Remediation** | Generates fix suggestions | Actionable solutions |
| **Transient errors** | Identifies retryable errors | Retry strategies |
| **Error trends** | Tracks errors across baselines | Regression detection |

### Error Categories

| Category | HTTP Codes | Description |
|:---------|:-----------|:------------|
| Validation Error | 400 | Invalid input or missing parameters |
| Authentication Error | 401, 403 | Auth or permission failure |
| Not Found | 404 | Resource does not exist |
| Conflict | 409 | Resource state conflict |
| Rate Limited | 429 | Too many requests |
| Server Error | 5xx | Internal server error |

### Error Trend Detection

When comparing baselines, Bellwether tracks:
- **New error types** - Errors that didn't occur before
- **Resolved errors** - Errors that no longer occur
- **Increasing errors** - Error frequency growing >50%
- **Decreasing errors** - Error frequency reduced >50%

### Output

Error analysis findings appear in:
- **CONTRACT.md** - Error Analysis section with root causes and remediations
- **Drift reports** - Error trend changes between baselines
- **JUnit/SARIF** - Test cases for error trend issues

Error analysis runs automatically during `bellwether check` - no additional flags needed.

## Performance Confidence

The check command calculates statistical confidence for performance metrics, indicating how reliable your performance baselines are.

### What It Measures

| Metric | Description | Impact |
|:-------|:------------|:-------|
| **Sample count** | Number of latency measurements | More samples = higher confidence |
| **Standard deviation** | Variability in response times | Lower = more consistent |
| **Coefficient of variation** | Relative variability (stdDev / mean) | Lower = more predictable |

### Confidence Levels

| Level | Requirements | Meaning |
|:------|:-------------|:--------|
| HIGH | 10+ samples, CV ≤ 30% | Reliable baseline for regression detection |
| MEDIUM | 5+ samples, CV ≤ 50% | Moderately reliable, use with caution |
| LOW | < 5 samples or CV > 50% | Unreliable baseline, collect more data |

### Why It Matters

Performance regressions detected with low confidence may not be real:
- **Few samples**: Random variation can look like regression
- **High variability**: Tool may have inconsistent performance

When confidence is low, the CLI recommends:
```
Increase `check.sampling.minSamples` for reliable baselines
```

### Output

Confidence information appears in:
- **CONTRACT.md** - Performance Baseline section with confidence column
- **Drift reports** - Regression markers indicate reliability
- **JUnit/SARIF** - Test cases for low confidence tools
- **GitHub Actions** - Annotations for confidence warnings

### Example Output

```
─── Performance Regressions ───
  ! read_file: 100ms → 150ms (+50%) (low confidence)
  ! write_file: 200ms → 250ms (+25%)

  Note: Some tools have low confidence metrics.
  Run with more samples for reliable baselines: read_file
```

Performance confidence runs automatically during `bellwether check` - no additional flags needed.

## Documentation Quality Scoring

The check command calculates a documentation quality score for your MCP server, evaluating how well tools and parameters are documented.

### What It Measures

| Component | Weight | Description |
|:----------|:-------|:------------|
| **Description Coverage** | 30% | Percentage of tools with descriptions |
| **Description Quality** | 30% | Length, clarity, and actionable language |
| **Parameter Documentation** | 25% | Percentage of parameters with descriptions |
| **Example Coverage** | 15% | Percentage of tools with schema examples |

### Grade Thresholds

| Grade | Score Range | Meaning |
|:------|:------------|:--------|
| A | 90-100 | Excellent documentation |
| B | 80-89 | Good documentation |
| C | 70-79 | Acceptable documentation |
| D | 60-69 | Poor documentation |
| F | 0-59 | Failing documentation |

### Quality Criteria

Descriptions are scored based on:
- **Length**: At least 50 characters for "good", 20+ for "acceptable"
- **Imperative verbs**: Starting with action words (Creates, Gets, Deletes)
- **Behavior description**: Mentioning what the tool returns or provides
- **Examples/specifics**: Including "e.g.", "example", or "such as"

### Issue Types

| Issue | Severity | Description |
|:------|:---------|:------------|
| Missing Description | Error | Tool has no description |
| Short Description | Warning | Description under 20 characters |
| Missing Param Description | Warning | Parameter has no description |
| No Examples | Info | Schema has no examples |

### Output

Documentation scores appear in:
- **CONTRACT.md** - Documentation Quality section with breakdown
- **Drift reports** - Score changes between baselines
- **JUnit/SARIF** - Test cases for documentation issues
- **GitHub Actions** - Annotations for quality degradation

### Example Output

```
─── Documentation Quality ───
  ✓ Score: 60 → 85 (+25)
  Grade: D → B
  ✓ Issues fixed: 3

─── Statistics ───
  Documentation score: 85/100 (B)
  Documentation change: +25
```

Documentation quality scoring runs automatically during `bellwether check` - no additional flags needed.

## Custom Test Scenarios

Define deterministic tests in `bellwether-tests.yaml`:

```yaml
version: "1"
scenarios:
  - tool: get_weather
    args:
      location: "San Francisco"
    assertions:
      - path: "content[0].text"
        condition: "contains"
        value: "temperature"
```

Reference in your config:

```yaml
# bellwether.yaml
scenarios:
  path: "./bellwether-tests.yaml"
  only: true  # Run only scenarios, no LLM tests
```

Then run:

```bash
bellwether check   # Run scenarios as part of check
bellwether explore # Run scenarios as part of explore
```

## Presets

| Preset | Optimized For | Description |
|:-------|:--------------|:------------|
| (default) | check | Zero LLM, free, deterministic |
| `ci` | check | Optimized for CI/CD, fails on drift |
| `security` | explore | Security + technical personas, OpenAI |
| `thorough` | explore | All 4 personas, workflow discovery |
| `local` | explore | Local Ollama, free, private |

Use with: `bellwether init --preset <name> npx @mcp/server`

## GitHub Action

```yaml
- name: Detect Behavioral Drift
  uses: dotsetlabs/bellwether/action@v1
  with:
    server-command: 'npx @mcp/your-server'
    baseline-path: './bellwether-baseline.json'
    fail-on-severity: 'warning'
```

See [action/README.md](./action/README.md) for full documentation.

## Environment Variables

| Variable | Description |
|:---------|:------------|
| `OPENAI_API_KEY` | OpenAI API key (explore command) |
| `ANTHROPIC_API_KEY` | Anthropic API key (explore command) |
| `OLLAMA_BASE_URL` | Ollama server URL (default: `http://localhost:11434`) |
| `BELLWETHER_SESSION` | Cloud session token for CI/CD |
| `BELLWETHER_API_URL` | Cloud API URL (default: `https://api.bellwether.sh`) |
| `BELLWETHER_TEAM_ID` | Override active team for cloud operations (multi-team CI/CD) |
| `BELLWETHER_REGISTRY_URL` | Registry API URL override (for self-hosted registries) |

See [.env.example](./.env.example) for full documentation.

## Development

```bash
git clone https://github.com/dotsetlabs/bellwether
cd bellwether/cli
npm install
npm run build
npm test

# Run locally
./dist/cli/index.js check npx @mcp/server
./dist/cli/index.js explore npx @mcp/server
```

## License

MIT License - see [LICENSE](./LICENSE) for details.

---

<p align="center">
  Built by <a href="https://dotsetlabs.com">Dotset Labs LLC</a>
</p>

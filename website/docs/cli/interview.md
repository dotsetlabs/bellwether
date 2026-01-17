---
title: interview
sidebar_position: 1
---

# bellwether interview

Conduct a full interview of an MCP server and generate behavioral documentation.

## Synopsis

```bash
bellwether interview [options] <command> [args...]
```

## Description

The `interview` command is the core of Bellwether. It connects to an MCP server, discovers its capabilities, and uses an LLM to generate intelligent test scenarios. The results are synthesized into comprehensive behavioral documentation.

The interview process includes:
- **Tool Testing**: Each discovered tool is tested with multiple scenarios
- **Prompt Testing**: If the server exposes prompts, they are also tested and documented
- **Resource Testing**: If the server exposes resources (data sources), they are read and documented with content previews
- **Multi-Persona Analysis**: Different perspectives (documentation, security, QA) provide comprehensive coverage
- **Behavioral Profiling**: Results are synthesized into profiles describing expected behavior

## Arguments

| Argument | Description |
|:---------|:------------|
| `<command>` | The command to start the MCP server |
| `[args...]` | Arguments to pass to the server command |

## Options

### Output Options

| Option | Description | Default |
|:-------|:------------|:--------|
| `-o, --output <dir>` | Output directory for generated files | `.` |
| `--json` | Also output JSON report | `false` |
| `--cloud-format` | Save baseline in cloud-ready format (see [Cloud Format](#cloud-baseline-format)) | `false` |

### LLM Options

| Option | Description | Default |
|:-------|:------------|:--------|
| `--model <model>` | Specific model to use | Provider default |
| `-q, --quick` | Quick mode: 1 question per tool | `false` |
| `-Q, --quality` | Use premium LLM models for higher quality output | `false` |

The LLM provider is auto-detected based on which API key environment variable is set (`OPENAI_API_KEY` or `ANTHROPIC_API_KEY`), or falls back to Ollama if no key is set.

### Interview Options

| Option | Description | Default |
|:-------|:------------|:--------|
| `-p, --preset <preset>` | Use a preset configuration (see below) | - |
| `--max-questions <n>` | Maximum questions per tool | `3` |
| `--timeout <ms>` | Tool call timeout in milliseconds | `60000` |
| `--personas <list>` | Comma-separated persona list (see [Persona Names](#persona-names)) | `technical` |
| `--security` | Include security testing persona (shorthand for `--personas technical,security`) | `false` |
| `-c, --config <path>` | Config file path | `bellwether.yaml` |
| `-i, --interactive` | Run in interactive mode with prompts | `false` |

### Presets

Presets provide optimized configurations for common use cases:

| Preset | Description | Personas | Questions |
|:-------|:------------|:---------|:----------|
| `docs` | Quick documentation generation | Technical Writer | 3 |
| `security` | Security-focused testing | Technical Writer, Security Tester | 3 |
| `thorough` | Comprehensive testing | All 4 personas | 5 |
| `ci` | Fast CI/CD checks | Technical Writer | 1 |

Preset options can be overridden with explicit flags.

### Baseline Options

| Option | Description | Default |
|:-------|:------------|:--------|
| `--save-baseline [path]` | Save baseline for drift detection | - |
| `--compare-baseline <path>` | Compare against existing baseline | - |
| `--fail-on-drift` | Exit with error if drift detected | `false` |
| `--strict` | Strict mode: only report structural (deterministic) changes | `false` |
| `--min-confidence <n>` | Minimum confidence score (0-100) to report a change | `0` |
| `--confidence-threshold <n>` | Confidence threshold (0-100) for CI to fail on breaking changes | `80` |

### Cost Options

| Option | Description | Default |
|:-------|:------------|:--------|
| `--estimate-cost` | Estimate cost before running interview | `false` |
| `--show-cost` | Show cost summary after interview | `false` |

### Remote Server Options

| Option | Description | Default |
|:-------|:------------|:--------|
| `--transport <type>` | Transport type: `stdio`, `sse`, `streamable-http` | `stdio` |
| `--url <url>` | URL for remote MCP server (requires `--transport sse` or `streamable-http`) | - |
| `--session-id <id>` | Session ID for remote server authentication | - |

### Custom Scenario Options

| Option | Description | Default |
|:-------|:------------|:--------|
| `--scenarios <path>` | Path to custom test scenarios YAML file | - |
| `--scenarios-only` | Only run custom scenarios (skip LLM-generated questions) | `false` |
| `--init-scenarios` | Generate a sample `bellwether-tests.yaml` and exit | - |

:::tip Auto-detection
If a `bellwether-tests.yaml` file exists in the output directory, it will be automatically loaded.
:::

### Workflow Options

| Option | Description | Default |
|:-------|:------------|:--------|
| `--workflows <path>` | Path to workflow definitions YAML file | - |
| `--discover-workflows` | Enable LLM-based workflow discovery | `false` |
| `--max-workflows <n>` | Maximum workflows to discover | `3` |
| `--init-workflows` | Generate a sample `bellwether-workflows.yaml` and exit | - |
| `--workflow-state-tracking` | Enable state tracking during workflow execution | `false` |

### Performance Options

| Option | Description | Default |
|:-------|:------------|:--------|
| `--stream` | Enable streaming output to show LLM responses in real-time | `false` |
| `--quiet` | Suppress streaming output (use with `--stream` to only log final results) | `false` |
| `--parallel-personas` | Run persona interviews in parallel for faster execution | `false` |
| `--persona-concurrency <n>` | Maximum concurrent persona interviews (requires `--parallel-personas`) | `3` |
| `--cache` | Enable response caching to avoid redundant calls (default: enabled) | `true` |
| `--no-cache` | Disable response caching | - |
| `--resource-timeout <ms>` | Timeout for resource reads in milliseconds | `15000` |
| `--fallback` | Enable automatic Ollama fallback if primary LLM provider fails | `false` |
| `--max-tokens <n>` | Maximum total tokens to use (prevents runaway costs) | - |
| `--show-metrics` | Show detailed metrics after interview (token usage, timing, costs) | `false` |

### Debug Options

| Option | Description | Default |
|:-------|:------------|:--------|
| `--verbose` | Verbose output | `false` |
| `--debug` | Debug MCP protocol messages | `false` |

## Examples

### Basic Interview

```bash
# Interview a filesystem server
bellwether interview npx @modelcontextprotocol/server-filesystem /tmp

# Interview a memory server
bellwether interview npx @modelcontextprotocol/server-memory
```

### Using Presets

```bash
# Quick documentation generation (recommended for first use)
bellwether interview --preset docs npx your-server

# Security-focused testing
bellwether interview --preset security npx your-server

# Comprehensive testing with all personas
bellwether interview --preset thorough npx your-server

# Fast CI/CD checks
bellwether interview --preset ci npx your-server
```

### Custom Model and Options

```bash
bellwether interview \
  --model gpt-4o \
  --max-questions 5 \
  --json \
  npx @modelcontextprotocol/server-postgres
```

### Override Preset Options

```bash
# Use security preset but with more questions
bellwether interview --preset security --max-questions 5 npx your-server
```

### Quick Mode

```bash
bellwether interview --quick npx your-server
```

### Save and Compare Baselines

```bash
# Create initial baseline
bellwether interview --save-baseline npx your-server

# Later, compare against baseline
bellwether interview \
  --compare-baseline bellwether-baseline.json \
  --fail-on-drift \
  npx your-server
```

### Drift Detection with Confidence

```bash
# Use strict mode for 100% deterministic results (CI/CD recommended)
bellwether interview \
  --compare-baseline ./baseline.json \
  --strict \
  --fail-on-drift \
  npx your-server

# Only report changes with high confidence (>80%)
bellwether interview \
  --compare-baseline ./baseline.json \
  --min-confidence 80 \
  npx your-server

# Custom confidence threshold for breaking change failures
bellwether interview \
  --compare-baseline ./baseline.json \
  --fail-on-drift \
  --confidence-threshold 90 \
  npx your-server
```

### Security Testing

```bash
# Use the --security shorthand
bellwether interview --security npx your-server

# Or specify personas explicitly
bellwether interview --personas technical,security npx your-server
```

### Multiple Personas

```bash
# Use shorthand names: technical, security, qa, novice
bellwether interview \
  --personas technical,security,qa \
  --max-questions 5 \
  npx your-server

# Or use all personas
bellwether interview --personas all npx your-server
```

### Remote MCP Servers

```bash
# Connect to a remote server via SSE
bellwether interview \
  --transport sse \
  --url https://api.example.com/mcp \
  --session-id "auth-token-123"

# Connect via Streamable HTTP
bellwether interview \
  --transport streamable-http \
  --url https://api.example.com/mcp
```

### Custom Test Scenarios

```bash
# Generate a sample scenarios file
bellwether interview --init-scenarios

# Run with custom scenarios (alongside LLM-generated)
bellwether interview \
  --scenarios ./bellwether-tests.yaml \
  npx your-server

# Run ONLY custom scenarios (no LLM generation)
bellwether interview \
  --scenarios ./bellwether-tests.yaml \
  --scenarios-only \
  npx your-server
```

### Workflow Testing

```bash
# Generate a sample workflow file
bellwether interview --init-workflows

# Run with user-defined workflows
bellwether interview \
  --workflows ./bellwether-workflows.yaml \
  npx your-server

# Auto-discover workflows using LLM
bellwether interview \
  --discover-workflows \
  --max-workflows 5 \
  npx your-server

# Enable state tracking for debugging
bellwether interview \
  --workflows ./workflows.yaml \
  --workflow-state-tracking \
  npx your-server
```

### Performance Optimization

```bash
# Run with streaming output for real-time feedback
bellwether interview --stream npx your-server

# Parallel persona execution (faster for multiple personas)
bellwether interview \
  --personas all \
  --parallel-personas \
  --persona-concurrency 4 \
  npx your-server

# Set token budget to control costs
bellwether interview --max-tokens 50000 npx your-server

# Show detailed metrics after interview
bellwether interview --show-metrics npx your-server

# Enable automatic Ollama fallback
bellwether interview --fallback npx your-server
```

## Exit Codes

| Code | Meaning |
|:-----|:--------|
| `0` | Success - interview completed, no issues |
| `1` | Failure - behavioral drift or security issues detected |
| `2` | Error - interview failed (connection, LLM, timeout) |

## Output Files

Depending on options, the following files may be generated:

| File | Description |
|:-----|:------------|
| `AGENTS.md` | Human-readable behavioral documentation (includes tool profiles and prompt profiles) |
| `bellwether-report.json` | Machine-readable JSON report (with `--json` flag) |
| `bellwether-baseline.json` | Baseline for drift detection (with `--save-baseline` flag) |

### AGENTS.md Contents

The generated documentation includes:
- **Server Information**: Name, version, protocol version
- **Quick Reference**: Tool signatures and return types at a glance
- **Performance Metrics**: Response times (avg/p50/p95/max) and error rates per tool
- **Tool Profiles**: For each tool - description, parameters, expected behavior, edge cases
- **Prompt Profiles**: For each prompt (if any) - description, arguments, expected output
- **Resource Profiles**: For each resource (if any) - URI, MIME type, content preview, access patterns
- **Security Findings**: Any security concerns discovered during testing
- **Custom Scenario Results**: Pass/fail status for user-defined test scenarios (if provided)

## Persona Names

Personas can be specified using either short names (CLI) or full names (config files):

| Short Name | Full Name | Description |
|:-----------|:----------|:------------|
| `technical` | `technical_writer` | Documentation-focused testing |
| `security` | `security_tester` | Security vulnerability testing |
| `qa` | `qa_engineer` | Quality assurance testing |
| `novice` | `novice_user` | New user experience testing |
| `all` | - | All four personas |

**CLI usage** (short names):
```bash
bellwether interview --personas technical,security npx server
```

**Config file** (full names):
```yaml
interview:
  personas:
    - technical_writer
    - security_tester
```

Both formats are interchangeable - use whichever is more convenient.

## Cloud Baseline Format

The `--cloud-format` flag saves the baseline in a format optimized for Bellwether Cloud upload. This format includes additional metadata and structure that enables:

- **Richer visualization** in the cloud dashboard
- **Assertion categorization** (expects, requires, warns, notes)
- **Severity classification** for security findings
- **Persona-based interview organization**

### Format Differences

| Feature | Local Format | Cloud Format |
|:--------|:-------------|:-------------|
| Assertions | Raw behavioral assertions | Categorized (expects/requires/warns/notes) |
| Security | Findings in tool profiles | Severity-classified (critical/high/medium/low) |
| Structure | Flat tool list | Organized by persona interviews |
| Metadata | Basic | Extended (CLI version, model, duration) |

### When to Use

- **Local development**: Use default format (simpler, smaller)
- **Cloud upload**: Use `--cloud-format` for full dashboard features
- **CI/CD**: Cloud format if uploading to Bellwether Cloud

```bash
# For cloud upload
bellwether interview --save-baseline --cloud-format npx server
bellwether upload
```

## Environment Variables

| Variable | Description |
|:---------|:------------|
| `OPENAI_API_KEY` | OpenAI API key |
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `OLLAMA_BASE_URL` | Ollama server URL (default: `http://localhost:11434`) |

## See Also

- [discover](/cli/discover) - Quick capability discovery
- [verify](/cli/verify) - Server verification and badges
- [registry](/cli/registry) - Search MCP Registry
- [Personas](/concepts/personas) - Understanding testing personas
- [Workflows](/concepts/workflows) - Multi-step tool sequences
- [Drift Detection](/concepts/drift-detection) - Baseline comparison
- [Custom Test Scenarios](/guides/custom-scenarios) - YAML-defined test cases
- [Workflow Authoring](/guides/workflow-authoring) - Writing workflow YAML files
- [Remote MCP Servers](/guides/remote-servers) - SSE and HTTP transport options
- [CI/CD Integration](/guides/ci-cd) - Pipeline integration

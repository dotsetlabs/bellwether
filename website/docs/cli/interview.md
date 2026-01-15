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
| `--cloud-format` | Save baseline in cloud-ready format | `false` |

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
| `--personas <list>` | Comma-separated persona list: `technical`, `security`, `qa`, `novice`, `all` | `technical` |
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
- [Drift Detection](/concepts/drift-detection) - Baseline comparison
- [Custom Test Scenarios](/guides/custom-scenarios) - YAML-defined test cases
- [Remote MCP Servers](/guides/remote-servers) - SSE and HTTP transport options
- [CI/CD Integration](/guides/ci-cd) - Pipeline integration

---
title: interview
sidebar_position: 1
---

# inquest interview

Conduct a full interview of an MCP server and generate behavioral documentation.

## Synopsis

```bash
inquest interview [options] <command> [args...]
```

## Description

The `interview` command is the core of Inquest. It connects to an MCP server, discovers its capabilities, and uses an LLM to generate intelligent test scenarios. The results are synthesized into comprehensive behavioral documentation.

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
| `--output-format <format>` | Output format: `markdown`, `json`, `sarif`, `junit` | `markdown` |

### LLM Options

| Option | Description | Default |
|:-------|:------------|:--------|
| `--provider <provider>` | LLM provider: `openai`, `anthropic`, `ollama` | Auto-detect |
| `--model <model>` | Specific model to use | Provider default |
| `-q, --quick` | Quick mode: 1 question, cheap model | `false` |

### Interview Options

| Option | Description | Default |
|:-------|:------------|:--------|
| `--max-questions <n>` | Maximum questions per tool | `3` |
| `--timeout <ms>` | Tool call timeout in milliseconds | `60000` |
| `--persona <personas>` | Comma-separated list of personas | All |
| `-c, --config <path>` | Config file path | `inquest.yaml` |

### Baseline Options

| Option | Description | Default |
|:-------|:------------|:--------|
| `--save-baseline [path]` | Save baseline for drift detection | - |
| `--compare-baseline <path>` | Compare against existing baseline | - |
| `--fail-on-drift` | Exit with error if drift detected | `false` |

### CI/CD Options

| Option | Description | Default |
|:-------|:------------|:--------|
| `--ci` | CI mode: no colors, machine-readable output | `false` |
| `--fail-on-security` | Exit with error on security findings | `false` |
| `--show-cost` | Show LLM token usage and cost | `false` |

### Debug Options

| Option | Description | Default |
|:-------|:------------|:--------|
| `--verbose` | Verbose output | `false` |
| `--debug` | Debug MCP protocol messages | `false` |
| `--log-level <level>` | Log level: `debug`, `info`, `warn`, `error` | `info` |
| `--log-file <path>` | Write logs to file | - |

## Examples

### Basic Interview

```bash
# Interview a filesystem server
inquest interview npx @modelcontextprotocol/server-filesystem /tmp

# Interview a memory server
inquest interview npx @modelcontextprotocol/server-memory
```

### Custom Model and Options

```bash
inquest interview \
  --model gpt-4o \
  --max-questions 5 \
  --json \
  npx @modelcontextprotocol/server-postgres
```

### Quick Mode for CI

```bash
inquest interview --quick --ci npx your-server
```

### Save and Compare Baselines

```bash
# Create initial baseline
inquest interview --save-baseline npx your-server

# Later, compare against baseline
inquest interview \
  --compare-baseline inquest-baseline.json \
  --fail-on-drift \
  npx your-server
```

### Security Testing

```bash
inquest interview \
  --persona security_tester \
  --fail-on-security \
  --output-format sarif \
  -o ./security \
  npx your-server
```

### Multiple Personas

```bash
inquest interview \
  --persona technical_writer,security_tester,qa_engineer \
  --max-questions 5 \
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
| `AGENTS.md` | Human-readable behavioral documentation |
| `inquest-report.json` | Machine-readable JSON report |
| `inquest-baseline.json` | Baseline for drift detection |
| `inquest.sarif` | SARIF output for GitHub Code Scanning |
| `junit.xml` | JUnit XML for test runners |

## Environment Variables

| Variable | Description |
|:---------|:------------|
| `OPENAI_API_KEY` | OpenAI API key |
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `OLLAMA_BASE_URL` | Ollama server URL (default: `http://localhost:11434`) |
| `INQUEST_LOG_LEVEL` | Default log level |

## See Also

- [discover](/cli/discover) - Quick capability discovery
- [Personas](/concepts/personas) - Understanding testing personas
- [Drift Detection](/concepts/drift-detection) - Baseline comparison
- [CI/CD Integration](/guides/ci-cd) - Pipeline integration

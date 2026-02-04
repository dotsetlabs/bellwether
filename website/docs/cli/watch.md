---
title: watch
sidebar_position: 5
---

# bellwether watch

Automatically re-check when files change.

## Synopsis

```bash
bellwether watch [server-command] [args...] [options]
```

## Description

Watch mode monitors your source files and automatically re-runs checks when changes are detected. This is useful during development to continuously validate your MCP server's schema.

Watch mode uses `bellwether check` under the hood—it's free, fast, and deterministic. It only runs schema validation (no LLM exploration).

:::note Config Required
`watch` requires a config file. Run `bellwether init` once in your project.
:::

## Arguments

| Argument | Description |
|:---------|:------------|
| `[server-command]` | Server command (overrides config) |
| `[args...]` | Server arguments |

## Options

| Option | Description | Default |
|:-------|:------------|:--------|
| `-c, --config <path>` | Path to config file | `bellwether.yaml` |

:::tip Config-First Design
Watch settings are configured in `bellwether.yaml` under the `watch` section. This keeps all configuration in one place.
:::

## Examples

### Basic Watch Mode

```bash
# Watch using settings from bellwether.yaml
bellwether watch

# Override the server command
bellwether watch npx @mcp/your-server /data
```

## Configuration

Configure watch mode in `bellwether.yaml`:

```yaml
server:
  command: "npx @mcp/your-server"
  timeout: 30000

watch:
  # Directory to watch for changes
  path: "./src"

  # Polling interval in milliseconds (1000-60000)
  interval: 5000

  # File extensions to watch
  extensions:
    - ".ts"
    - ".js"
    - ".json"
    - ".py"
    - ".go"

  # Command to run when drift is detected (optional)
  onDrift: "notify-send 'Drift detected!'"

baseline:
  # Path to save/compare baselines
  savePath: "./bellwether-baseline.json"
```

## Behavior

1. **Initial check** - Runs a full check on startup
2. **File monitoring** - Watches the specified directory for changes
3. **Change detection** - Detects changes to source files
4. **Re-check** - Runs check and compares against previous baseline
5. **Repeat** - Continues monitoring

Output:
```
Bellwether Watch Mode

Server: npx your-server
Watching: /path/to/project

--- Running Test ---
[10:30:45] Starting test...
Found 5 tools
Checking schemas...
Check complete.

Watching for changes... (Press Ctrl+C to exit)

File changed: src/tools/read.ts

--- Running Check ---
[10:31:02] Starting check...
Found 5 tools
Check complete.

--- Drift Detected ---
  + new_tool added
  ~ read_file parameter changed

Watching for changes... (Press Ctrl+C to exit)
```

## Use Cases

### Development Workflow

Keep watch running in a terminal while developing:

```bash
# Terminal 1: Watch for changes
bellwether watch

# Terminal 2: Edit your server code
vim src/tools/read.ts
# Watch automatically re-checks when you save
```

### TDD for MCP Servers

Use watch mode for test-driven development:

1. Define expected tool schemas
2. Start watch mode
3. Implement tools until schemas match

## Exit

Press `Ctrl+C` to stop watch mode.

## See Also

- [check](/cli/check) - Run a single check
- [Drift Detection](/concepts/drift-detection) - Understanding changes

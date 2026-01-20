---
title: watch
sidebar_position: 5
---

# bellwether watch

Automatically re-check when files change.

## Synopsis

```bash
bellwether watch [options]
```

## Description

Watch mode monitors your source files and automatically re-runs checks when changes are detected. This is useful during development to continuously validate your MCP server's schema.

Watch mode uses `bellwether check` under the hood—it's free, fast, and deterministic.

## Options

| Option | Description | Default |
|:-------|:------------|:--------|
| `-w, --watch-path <path>` | Directory to watch for changes | From config |
| `-c, --config <path>` | Path to config file | `bellwether.yaml` |

## Examples

### Basic Watch Mode

```bash
# Watch using settings from bellwether.yaml
bellwether watch

# Watch a specific directory
bellwether watch --watch-path ./src
```

## Configuration

Configure watch mode in `bellwether.yaml`:

```yaml
server:
  command: "npx @mcp/your-server"
  timeout: 30000

# Watch settings are typically configured via CLI flags
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

--- Running Check ---
[10:30:45] Starting check...
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

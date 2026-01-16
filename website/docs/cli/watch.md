---
title: watch
sidebar_position: 5
---

# bellwether watch

Automatically re-interview when files change.

## Synopsis

```bash
bellwether watch [options] <command> [args...]
```

## Description

Watch mode monitors your source files and automatically re-runs interviews when changes are detected. This is useful during development to continuously validate your MCP server's behavior.

## Arguments

| Argument | Description |
|:---------|:------------|
| `<command>` | The command to start the MCP server |
| `[args...]` | Arguments to pass to the server command |

## Options

| Option | Description | Default |
|:-------|:------------|:--------|
| `-w, --watch-path <path>` | Directory to watch for changes | `.` |
| `-i, --interval <ms>` | Polling interval in milliseconds | `5000` |
| `--baseline <path>` | Baseline file to compare against | `bellwether-baseline.json` |
| `--on-change <command>` | Command to run after detecting drift | - |
| `--debug` | Show debug output for file scanning errors | `false` |
| `-c, --config <path>` | Path to config file | - |
| `--max-questions <n>` | Max questions per tool | Config value |

## Examples

### Basic Watch Mode

```bash
# Watch current directory (default)
bellwether watch npx your-server

# Watch a specific directory
bellwether watch npx your-server --watch-path ./src
```

### Custom Polling Interval

```bash
# Check for changes every 2 seconds
bellwether watch npx your-server --interval 2000
```

### Run Command on Drift

```bash
# Run tests when drift is detected
bellwether watch npx your-server --on-change "npm test"
```

## Behavior

1. **Initial interview** - Runs a full interview on startup and saves baseline
2. **File monitoring** - Polls the watch directory at the specified interval
3. **Change detection** - Detects changes to `.ts`, `.js`, `.json`, `.py`, `.go` files
4. **Re-interview** - Runs interview and compares against previous baseline
5. **Optional action** - Runs `--on-change` command if drift is detected
6. **Repeat** - Continues monitoring

Output:
```
Bellwether Watch Mode

Server: npx your-server
Watching: /path/to/project
Baseline: /path/to/project/bellwether-baseline.json
Poll interval: 5000ms

--- Running Interview ---
[10:30:45] Starting interview...
Found 5 tools
Interviewing: 5/5 tools
Interview complete.

Watching for changes... (Press Ctrl+C to exit)

File changed: src/tools/read.ts

--- Running Interview ---
[10:31:02] Starting interview...
Found 5 tools
Interview complete.

--- Behavioral Drift Detected ---
  + read_file now handles symlinks
  ~ error message format changed for ENOENT

Baseline updated: a1b2c3d4

Watching for changes... (Press Ctrl+C to exit)
```

## Use Cases

### Development Workflow

Keep watch running in a terminal while developing:

```bash
# Terminal 1: Watch for changes
bellwether watch npx your-server

# Terminal 2: Edit your server code
vim src/tools/read.ts
# Watch automatically re-interviews when you save
```

### CI Integration Trigger

Run tests automatically when behavior changes:

```bash
bellwether watch npx your-server --on-change "npm test"
```

### TDD for MCP Servers

Use watch mode for test-driven development:

1. Write expected behavior in AGENTS.md
2. Start watch mode
3. Implement tools until behavior matches

## Exit

Press `Ctrl+C` to stop watch mode.

## See Also

- [interview](/cli/interview) - Single interview command
- [Drift Detection](/concepts/drift-detection) - Understanding changes

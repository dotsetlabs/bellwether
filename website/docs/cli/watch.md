---
title: watch
sidebar_position: 5
---

# inquest watch

Automatically re-interview when files change.

## Synopsis

```bash
inquest watch [options] <command> [args...]
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
| `--watch-path <path>` | Directory to watch for changes | `./src` |
| `--debounce <ms>` | Debounce time before re-running | `1000` |
| `--show-diff` | Show diff from previous interview | `true` |

All options from [interview](/cli/interview) are also supported.

## Examples

### Basic Watch Mode

```bash
inquest watch npx your-server --watch-path ./src
```

### Watch Multiple Directories

```bash
inquest watch npx your-server \
  --watch-path ./src \
  --watch-path ./lib
```

### Quick Mode Watch

```bash
# Fast re-interviews during development
inquest watch --quick npx your-server --watch-path ./src
```

## Behavior

1. **Initial interview** - Runs a full interview on startup
2. **File monitoring** - Watches specified directories for changes
3. **Debouncing** - Waits for changes to settle before re-running
4. **Re-interview** - Runs interview and shows diff from previous
5. **Repeat** - Continues monitoring

Output:
```
[watch] Initial interview starting...
[watch] Interview complete. Watching ./src for changes...

[watch] File changed: src/tools/read.ts
[watch] Re-running interview...

Changes detected:
  + read_file now handles symlinks
  ~ error message format changed for ENOENT

[watch] Interview complete. Watching for changes...
```

## Use Cases

### Development Workflow

Keep watch running in a terminal while developing:

```bash
# Terminal 1: Watch for changes
inquest watch npx your-server --watch-path ./src

# Terminal 2: Edit your server code
vim src/tools/read.ts
# Watch automatically re-interviews
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

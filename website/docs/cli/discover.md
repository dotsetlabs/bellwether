---
title: discover
sidebar_position: 6
---

# bellwether discover

Quick discovery of MCP server capabilities without running checks.

## Synopsis

```bash
bellwether discover [command] [args...] [options]
```

## Description

The `discover` command connects to an MCP server and lists its capabilities (tools, prompts, and resources) without conducting a full check. This is useful for quick reconnaissance or verifying server connectivity.

:::note Config Required
All CLI commands (except `init`) require a config file. Run `bellwether init` once before using `discover`.
:::

For remote MCP servers, use `--transport sse` or `--transport streamable-http` with `--url` instead of providing a command.

## Arguments

| Argument | Description |
|:---------|:------------|
| `[command]` | Command to start the MCP server (not required for remote) |
| `[args...]` | Arguments to pass to the server command |

## Options

### Output Options

| Option | Description | Default |
|:-------|:------------|:--------|
| `-c, --config <path>` | Path to config file | `bellwether.yaml` |
| `--json` | Output as JSON | `discovery.json` |
| `--timeout <ms>` | Connection timeout in milliseconds | `discovery.timeout` |

### Remote Server Options

| Option | Description | Default |
|:-------|:------------|:--------|
| `--transport <type>` | Transport type: `stdio`, `sse`, `streamable-http` | `discovery.transport` |
| `--url <url>` | URL for remote MCP server (requires `--transport sse` or `streamable-http`) | - |
| `--session-id <id>` | Session ID for remote server authentication | - |

## Examples

### Basic Discovery

```bash
# Discover filesystem server capabilities
bellwether discover npx @modelcontextprotocol/server-filesystem /tmp
```

Output:
```
╔════════════════════════════════════════════════════════════════╗
║  @modelcontextprotocol/server-filesystem v1.0.0                ║
║  Protocol Version: 2024-11-05                                  ║
╚════════════════════════════════════════════════════════════════╝

CAPABILITIES
  4 Tools · Resources

──────────────────────────────────────────────────────────────────
TOOLS
──────────────────────────────────────────────────────────────────

  read_file(path)
    Read contents of a file

  write_file(path, content)
    Write content to a file

  list_directory(path)
    List directory contents

  search_files(pattern, path?)
    Search for files matching a pattern

──────────────────────────────────────────────────────────────────
QUICK START
──────────────────────────────────────────────────────────────────

  bellwether check npx @modelcontextprotocol/server-filesystem /tmp
    Schema validation (free, fast)

  bellwether explore npx @modelcontextprotocol/server-filesystem /tmp
    Deep behavioral exploration (requires LLM)
```

### JSON Output

```bash
bellwether discover --json npx @modelcontextprotocol/server-memory
```

Output:
```json
{
  "serverInfo": {
    "name": "@modelcontextprotocol/server-memory",
    "version": "1.0.0"
  },
  "tools": [
    {
      "name": "store",
      "description": "Store a value in memory",
      "inputSchema": {
        "type": "object",
        "properties": {
          "key": { "type": "string" },
          "value": { "type": "any" }
        },
        "required": ["key", "value"]
      }
    }
  ],
  "prompts": [],
  "resources": []
}
```

### With Custom Timeout

```bash
# Increase timeout for slow servers
bellwether discover --timeout 60000 npx slow-server
```

### Remote MCP Servers

```bash
# Discover capabilities of a remote server via SSE
bellwether discover \
  --transport sse \
  --url https://api.example.com/mcp

# With authentication
bellwether discover \
  --transport streamable-http \
  --url https://api.example.com/mcp \
  --session-id "auth-token-123"
```

## Use Cases

### Verify Server Connectivity

Before running a full check, verify the server starts and responds:

```bash
bellwether discover npx your-server && echo "Server OK"
```

### List Available Tools

Get a quick overview of what a server can do:

```bash
bellwether discover npx @modelcontextprotocol/server-postgres
```

### Generate Tool Inventory

Create a JSON inventory of server capabilities:

```bash
bellwether discover --json npx your-server > capabilities.json
```

### Debugging Server Issues

Use discover to isolate connection vs. check issues:

```bash
# If this fails, it's a connection issue
bellwether discover npx your-server

# If discover works but check fails, review the check output
bellwether check npx your-server
```

## Exit Codes

| Code | Meaning |
|:-----|:--------|
| `0` | Success - server capabilities discovered |
| `1` | Error - connection failed or server error |

## See Also

- [check](/cli/check) - Schema validation and drift detection
- [explore](/cli/explore) - LLM-powered behavioral exploration
- [init](/cli/init) - Create configuration file

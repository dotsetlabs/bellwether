---
title: discover
sidebar_position: 2
---

# bellwether discover

Quick discovery of MCP server capabilities without interviewing.

## Synopsis

```bash
bellwether discover [options] <command> [args...]
```

## Description

The `discover` command connects to an MCP server and lists its capabilities (tools, prompts, and resources) without conducting a full interview. This is useful for quick reconnaissance or verifying server connectivity.

## Arguments

| Argument | Description |
|:---------|:------------|
| `<command>` | The command to start the MCP server |
| `[args...]` | Arguments to pass to the server command |

## Options

| Option | Description | Default |
|:-------|:------------|:--------|
| `--json` | Output as JSON | `false` |
| `--timeout <ms>` | Connection timeout in milliseconds | `30000` |

## Examples

### Basic Discovery

```bash
# Discover filesystem server capabilities
bellwether discover npx @modelcontextprotocol/server-filesystem /tmp
```

Output:
```
Discovered capabilities for @modelcontextprotocol/server-filesystem

Tools (4):
  - read_file: Read contents of a file
  - write_file: Write content to a file
  - list_directory: List directory contents
  - search_files: Search for files matching a pattern

Prompts (0):
  (none)

Resources (1):
  - file://{path}: Access file contents as a resource
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

## Use Cases

### Verify Server Connectivity

Before running a full interview, verify the server starts and responds:

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

Use discover to isolate connection vs. interview issues:

```bash
# If this fails, it's a connection issue
bellwether discover npx your-server

# If discover works but interview fails, it's an LLM/interview issue
bellwether interview npx your-server
```

## Exit Codes

| Code | Meaning |
|:-----|:--------|
| `0` | Success - server capabilities discovered |
| `2` | Error - connection failed or server error |

## See Also

- [interview](/cli/interview) - Full behavioral interview
- [init](/cli/init) - Create configuration file

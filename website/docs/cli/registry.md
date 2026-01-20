---
title: registry
sidebar_position: 9
---

# bellwether registry

Search and discover MCP servers from the official MCP Registry.

## Synopsis

```bash
bellwether registry [options] [query]
```

## Aliases

- `bellwether lookup` - Alias for `bellwether registry`

## Description

The `registry` command searches the [MCP Registry](https://registry.modelcontextprotocol.io/) - the official directory of MCP servers. Use it to discover servers, find installation commands, and explore the MCP ecosystem.

## Arguments

| Argument | Description |
|:---------|:------------|
| `[query]` | Search query to filter servers (optional) |

## Options

| Option | Description | Default |
|:-------|:------------|:--------|
| `--limit <n>` | Maximum number of results | `10` |
| `--json` | Output as JSON | `false` |

## Examples

### Search for Servers

```bash
# Search for filesystem-related servers
bellwether registry filesystem

# Search for database servers
bellwether registry database

# Search for AI/LLM servers
bellwether registry ai
```

### Browse All Servers

```bash
# List servers (no query)
bellwether registry

# List more servers
bellwether registry --limit 50
```

### JSON Output

```bash
# Get JSON for scripting
bellwether registry --json filesystem
```

Output:
```json
[
  {
    "server": {
      "name": "io.github.modelcontextprotocol/server-filesystem",
      "description": "MCP server for filesystem operations",
      "version": "1.0.0",
      "packages": [
        {
          "registryType": "npm",
          "identifier": "@modelcontextprotocol/server-filesystem"
        }
      ]
    }
  }
]
```

## Output Format

The default output shows:

```
╔════════════════════════════════════════════════════════════════╗
║  MCP Registry - 3 servers found                                 ║
╚════════════════════════════════════════════════════════════════╝

  @modelcontextprotocol/server-filesystem
  ────────────────────────────────────────
  MCP server for filesystem operations

  Package: npm @modelcontextprotocol/server-filesystem
  Run:     npx @modelcontextprotocol/server-filesystem <path>

  @modelcontextprotocol/server-postgres
  ────────────────────────────────────────
  MCP server for PostgreSQL databases

  Package: npm @modelcontextprotocol/server-postgres
  Run:     npx @modelcontextprotocol/server-postgres <connection-string>
```

## Use Cases

### Find a Server to Test

```bash
# Search for servers
bellwether registry memory

# Test the found server
bellwether check npx @modelcontextprotocol/server-memory
```

### Explore the Ecosystem

```bash
# See what's available
bellwether registry --limit 100

# Filter by category
bellwether registry "file"
bellwether registry "database"
bellwether registry "api"
```

### Scripting and Automation

```bash
# Get server info programmatically
SERVER=$(bellwether registry --json --limit 1 filesystem | jq -r '.[0].server.packages[0].identifier')
bellwether check npx $SERVER /tmp
```

## Supported Package Types

The registry includes servers from various package managers:

| Type | Run Command |
|:-----|:------------|
| `npm` | `npx <package>` |
| `pip` | `python -m <package>` or `uvx <package>` |
| `cargo` | `cargo run --package <package>` |
| `docker` | `docker run <image>` |

## Exit Codes

| Code | Meaning |
|:-----|:--------|
| `0` | Success - results found or empty results |
| `2` | Error - network or API failure |

## See Also

- [check](/cli/check) - Check an MCP server
- [discover](/cli/discover) - Quick capability discovery
- [MCP Registry](https://registry.modelcontextprotocol.io/) - Official registry website

---
title: Remote MCP Servers
sidebar_position: 6
---

# Remote MCP Servers

Bellwether can connect to remote MCP servers over HTTP using SSE (Server-Sent Events) or Streamable HTTP transports.

## Transport Types

| Transport | Description | Use Case |
|:----------|:------------|:---------|
| `stdio` | Standard input/output (default) | Local servers, CLI tools |
| `sse` | Server-Sent Events | Real-time streaming, persistent connections |
| `streamable-http` | HTTP with streaming | REST-like APIs, stateless requests |

## SSE Transport

SSE (Server-Sent Events) is ideal for servers that need to push updates to clients in real-time.

### Basic Usage

```bash
bellwether interview \
  --transport sse \
  --url https://api.example.com/mcp \
  npx placeholder-not-used
```

:::note
When using remote transports, the command argument (`npx placeholder-not-used`) is required by the CLI but not used. You can pass any placeholder value.
:::

### With Authentication

```bash
bellwether interview \
  --transport sse \
  --url https://api.example.com/mcp \
  --session-id "your-auth-token"
```

### SSE Protocol Details

Bellwether expects the remote server to expose:
- `GET {baseUrl}/sse` - SSE endpoint for receiving messages
- `POST {baseUrl}/message` - Endpoint for sending messages

The server may also send an `endpoint` event to specify a custom message endpoint.

## Streamable HTTP Transport

Streamable HTTP is a simpler request-response model that supports streaming responses.

### Basic Usage

```bash
bellwether interview \
  --transport streamable-http \
  --url https://api.example.com/mcp \
  npx placeholder
```

### With Custom Headers

For servers requiring authentication or custom headers, use the session ID:

```bash
bellwether interview \
  --transport streamable-http \
  --url https://api.example.com/mcp \
  --session-id "Bearer your-jwt-token"
```

### HTTP Protocol Details

Messages are sent as JSON-RPC 2.0 over HTTP POST:

```http
POST /mcp HTTP/1.1
Content-Type: application/json
X-Session-Id: your-session-id

{"jsonrpc":"2.0","id":1,"method":"tools/list"}
```

Responses can be:
- JSON response body
- Streaming response with multiple JSON chunks

## Discovery with Remote Servers

You can also use `discover` with remote servers:

```bash
# Quick capability check via SSE
bellwether discover \
  --transport sse \
  --url https://api.example.com/mcp

# JSON output
bellwether discover \
  --transport streamable-http \
  --url https://api.example.com/mcp \
  --json
```

## Examples

### Public MCP Server

```bash
bellwether interview \
  --transport sse \
  --url https://mcp.example.com/public \
  --preset docs \
  npx placeholder
```

### Authenticated API

```bash
# Using bearer token
bellwether interview \
  --transport streamable-http \
  --url https://api.example.com/mcp \
  --session-id "Bearer eyJhbGciOiJIUzI1NiIs..." \
  npx placeholder
```

### Local Development Server

```bash
# Test a locally running remote-protocol server
bellwether interview \
  --transport sse \
  --url http://localhost:3000/mcp \
  npx placeholder
```

## Timeouts

Both transports respect the `--timeout` flag for request timeouts:

```bash
bellwether interview \
  --transport sse \
  --url https://slow-server.example.com/mcp \
  --timeout 120000 \
  npx placeholder
```

## Error Handling

### Connection Errors

If the remote server is unreachable:

```
Error: Failed to connect to SSE endpoint
```

Check:
- URL is correct and accessible
- Server is running and accepting connections
- Firewall/network allows the connection

### Authentication Errors

If authentication fails (HTTP 401/403):

```
Error: HTTP 401: Unauthorized
```

Check:
- Session ID is correct
- Token hasn't expired
- Server expects the token format you're using

### Reconnection (SSE)

The SSE transport automatically attempts to reconnect with exponential backoff:
- Default delay: 1 second
- Max attempts: 5
- Backoff multiplier: 2x

## Programmatic Usage

For advanced use cases, you can use the transport classes directly:

```typescript
import {
  MCPClient,
  SSETransport,
  HTTPTransport
} from '@dotsetlabs/bellwether';

// Using SSE transport
const client = new MCPClient({ debug: true });
await client.connectRemote('https://api.example.com/mcp', {
  transport: 'sse',
  sessionId: 'your-token'
});

// Discover capabilities
const discovery = await client.discover();
console.log(discovery.tools);

// Using HTTP transport
const httpClient = new MCPClient();
await httpClient.connectRemote('https://api.example.com/mcp', {
  transport: 'streamable-http'
});
```

## Security Considerations

When connecting to remote MCP servers:

1. **Always use HTTPS** in production
2. **Validate server certificates** - don't disable TLS verification
3. **Secure your session tokens** - treat them like passwords
4. **Be cautious with unknown servers** - they can execute arbitrary tool calls

## See Also

- [interview](/cli/interview) - CLI reference
- [discover](/cli/discover) - Quick discovery
- [CI/CD Integration](/guides/ci-cd) - Pipeline setup

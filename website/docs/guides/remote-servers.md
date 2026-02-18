---
title: Remote MCP Servers
sidebar_position: 6
---

# Remote MCP Servers

Bellwether can connect to remote MCP servers over HTTP using SSE (Server-Sent Events) or Streamable HTTP transports. `bellwether check`, `bellwether explore`, and `bellwether discover` support remote transports.

## Transport Types

| Transport | Description | Use Case |
|:----------|:------------|:---------|
| `stdio` | Standard input/output (default) | Local servers, CLI tools |
| `sse` | Server-Sent Events | Real-time streaming, persistent connections |
| `streamable-http` | HTTP with streaming | REST-like APIs, stateless requests |

## Using Remote Transports with check/explore

Configure the server transport in `bellwether.yaml`:

```yaml
server:
  transport: sse
  url: https://api.example.com/mcp
  # sessionId: "server-issued-session-id"
  # headers:
  #   Authorization: "Bearer ${MCP_SERVER_TOKEN}"
```

One-off CLI header overrides:

```bash
bellwether check -H "Authorization: Bearer $MCP_SERVER_TOKEN"
bellwether explore -H "Authorization: Bearer $MCP_SERVER_TOKEN"
bellwether discover --transport sse --url https://api.example.com/mcp -H "Authorization: Bearer $MCP_SERVER_TOKEN"
```

## SSE Transport

SSE (Server-Sent Events) is ideal for servers that need to push updates to clients in real-time.

### Basic Usage

```bash
bellwether discover \
  --transport sse \
  --url https://api.example.com/mcp
```

### With Authentication

```bash
bellwether discover \
  --transport sse \
  --url https://api.example.com/mcp \
  -H "Authorization: Bearer $MCP_SERVER_TOKEN"
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
bellwether discover \
  --transport streamable-http \
  --url https://api.example.com/mcp
```

### With Custom Headers

For servers requiring authentication or custom headers, use explicit headers:

```bash
bellwether discover \
  --transport streamable-http \
  --url https://api.example.com/mcp \
  -H "Authorization: Bearer $MCP_SERVER_TOKEN" \
  -H "X-API-Key: $MCP_API_KEY"
```

You can also set persistent headers in `bellwether.yaml`:

```yaml
server:
  transport: streamable-http
  url: https://api.example.com/mcp
  headers:
    Authorization: "Bearer ${MCP_SERVER_TOKEN}"
```

### HTTP Protocol Details

Messages are sent as JSON-RPC 2.0 over HTTP POST following the [MCP Streamable HTTP transport specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports):

```http
POST /mcp HTTP/1.1
Content-Type: application/json
Accept: application/json, text/event-stream
MCP-Protocol-Version: 2025-11-25
Mcp-Session-Id: server-assigned-session-id

{"jsonrpc":"2.0","id":1,"method":"tools/list"}
```

Key protocol details:
- **Accept header**: Clients must accept both `application/json` and `text/event-stream`
- **Session ID**: Servers may return an `Mcp-Session-Id` header during initialization. Bellwether automatically captures this and includes it in all subsequent requests.
- **Responses** can be either JSON or Server-Sent Events (SSE) format

Response content types:
- `application/json` - Standard JSON response body
- `text/event-stream` - SSE streaming response with `data:` prefixed JSON messages

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
bellwether discover \
  --transport sse \
  --url https://mcp.example.com/public
```

### Authenticated API

```bash
# Using bearer token
bellwether discover \
  --transport streamable-http \
  --url https://api.example.com/mcp \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
```

### Local Development Server

```bash
# Test a locally running remote-protocol server
bellwether discover \
  --transport sse \
  --url http://localhost:3000/mcp
```

## Timeouts

Both transports respect the `--timeout` flag for request timeouts:

```bash
bellwether discover \
  --transport sse \
  --url https://slow-server.example.com/mcp \
  --timeout 120000
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
- `Authorization` / API key header value is correct
- Token hasn't expired
- Server expects the header name and token format you're using

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
  discover
} from '@dotsetlabs/bellwether';

// Using SSE transport
const client = new MCPClient({ debug: true });
await client.connectRemote('https://api.example.com/mcp', {
  transport: 'sse',
  headers: { Authorization: 'Bearer your-token' }
});

// Discover capabilities
const result = await discover(client, 'https://api.example.com/mcp', []);
console.log(result.tools);

// Using HTTP transport
const httpClient = new MCPClient();
await httpClient.connectRemote('https://api.example.com/mcp', {
  transport: 'streamable-http',
  headers: { Authorization: 'Bearer your-token' }
});
```

## Security Considerations

When connecting to remote MCP servers:

1. **Always use HTTPS** in production
2. **Validate server certificates** - don't disable TLS verification
3. **Secure auth credentials** - protect API keys, bearer tokens, and session IDs
4. **Be cautious with unknown servers** - they can execute arbitrary tool calls

## See Also

- [check](/cli/check) - CLI reference
- [discover](/cli/discover) - Quick discovery
- [CI/CD Integration](/guides/ci-cd) - Pipeline setup

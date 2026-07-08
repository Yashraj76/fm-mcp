# MCP Endpoint Setup Guide

kilink exposes a live Model Context Protocol (MCP) endpoint for each server you create. AI agents (Claude Desktop, Cursor, custom clients) connect to this endpoint to discover and execute your FileMaker tools.

---

## Endpoint URL format

```
https://<your-kilink-host>/api/mcp/<server-id>/mcp
```

- **`<your-kilink-host>`** — your kilink deployment domain
- **`<server-id>`** — the ID shown on the server detail page in kilink
- **Transport** — always use `/mcp` (HTTP+SSE streaming). The `/sse` transport requires Redis and is not recommended for most deployments.

---

## Authentication

Every MCP request requires a Bearer token in the `Authorization` header:

```
Authorization: Bearer kilnk_<your-api-key>
```

Generate an API key from **Servers → [your server] → API Keys** inside kilink. Each key is scoped to a single server.

> **Security:** API keys are hashed with bcrypt before storage. The raw key is shown only once at creation. Rotate keys immediately if exposed.

---

## Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "my-filemaker-server": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://<your-kilink-host>/api/mcp/<server-id>/mcp"],
      "env": {
        "MCP_BEARER_TOKEN": "kilink_<your-api-key>"
      }
    }
  }
}
```

Restart Claude Desktop after saving. Your FileMaker tools appear in Claude's tool list automatically.

---

## Cursor

Open **Cursor Settings → MCP** and add a new server entry:

```json
{
  "name": "my-filemaker-server",
  "url": "https://<your-kilink-host>/api/mcp/<server-id>/mcp",
  "headers": {
    "Authorization": "Bearer kilink_<your-api-key>"
  }
}
```

---

## Custom MCP client (TypeScript example)

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

const transport = new StreamableHTTPClientTransport(
  new URL('https://<your-kilink-host>/api/mcp/<server-id>/mcp'),
  { requestInit: { headers: { Authorization: 'Bearer kilink_<your-api-key>' } } }
)

const client = new Client({ name: 'my-client', version: '1.0.0' }, { capabilities: {} })
await client.connect(transport)

const tools = await client.listTools()
console.log(tools.tools.map(t => t.name))
```

---

## Branch targeting

To pin a client to a specific feature branch rather than main:

```
https://<your-kilink-host>/api/mcp/<server-id>/mcp?branchId=<branch-id>
```

This lets you test branch tool changes in a real client before merging to main.

---

## Troubleshooting

| Symptom | Likely cause |
|---------|-------------|
| `401 Unauthorized` | Missing or invalid Bearer token |
| `404 Not Found` | Incorrect `server-id` |
| `503 Service Unavailable` | Redis not configured (SSE transport only) |
| Tools list is empty | All tools on main branch are disabled |

Enable `MCP_DEV_BYPASS=true` in your `.env` during local development to skip auth for faster iteration. **Never set this in production.**

# FileMaker MCP Platform - Backend Architecture

The FileMaker MCP Platform is a Next.js (App Router) application designed to bridge FileMaker databases with the Model Context Protocol (MCP). It acts as middleware, allowing AI assistants (like Claude) to securely execute queries, scripts, and updates on a FileMaker Server via its Data API.

## Core Technologies
*   **Framework**: Next.js 15
*   **ORM**: Prisma with SQLite
*   **Security**: AES-256-CBC encryption for FileMaker credentials
*   **FileMaker Integration**: Custom `FileMakerClient` using `undici` for robust HTTP requests to the FileMaker Data API v1.

## Architecture & Code Structure

The backend follows a service-oriented architecture, strictly separating routing, validation, and core business logic.

### 1. The FileMaker Client (`src/lib/filemaker/client.ts`)
The `FileMakerClient` is the foundational class that handles all direct communication with the FileMaker Data API.
*   **Authentication**: Manages session tokens (login/logout).
*   **Execution Methods**: Provides structured methods like `find`, `createRecord`, `updateRecord`, `deleteRecord`, and `runScript`.
*   **Error Handling**: Standardizes FileMaker errors (e.g., throwing specific exceptions for missing layouts or invalid credentials).

### 2. Session Management (`src/lib/filemaker/session.ts`)
The `withFMSession` wrapper ensures that any FileMaker Data API operation is wrapped in a secure session lifecycle. It handles:
1.  Logging into the FileMaker server.
2.  Executing the desired callback/operation.
3.  Guaranteeing the session is logged out in a `finally` block, preventing resource leaks or lockout issues on the FileMaker Server.

### 3. Security (`src/lib/crypto.ts`)
All passwords and client secrets are encrypted at rest using AES-256-CBC encryption. They are only decrypted in memory just before being passed to the `FileMakerClient`.

## API Routes

Every API route returns standard shapes:
*   **Success**: `{ success: true, data: <payload> }`
*   **Error**: `{ success: false, error: string, code: string }`

### Connections API (`/api/connections`)
Manages the FileMaker Server connection profiles.
*   `GET /api/connections`: Lists all connections.
*   `POST /api/connections`: Creates a new connection (encrypts password).
*   `PUT /api/connections/[id]`: Updates a connection profile.
*   `POST /api/connections/[id]/test`: Tests credentials against the live FileMaker server without caching a session.
*   `GET /api/connections/[id]/schema`: Fetches and caches the FileMaker layout and script metadata (to be mapped to MCP tools).

### Servers API (`/api/servers`)
Manages the virtual "MCP Servers" that group tools and connections.
*   `GET /api/servers`: Lists MCP servers.
*   `POST /api/servers`: Creates an MCP server, generating a default branch and snapshot.
*   `GET /api/servers/[id]/config`: Generates the `mcp_config.json` needed for Claude Desktop to connect to this server instance via SSE or Stdio proxy.

### Tools & Execution API (`/api/tools` & `/api/servers/[id]/tools/[toolId]/execute`)
Manages the tools exposed to the AI and the runtime engine that executes them.
*   `GET / POST /api/tools`: Manage tool configurations and JSON schemas.
*   `POST /api/servers/[id]/tools/[toolId]/execute`: The core Execution Engine. This endpoint reads the tool's configured FileMaker method (e.g., `find`, `script`), opens a FileMaker session, executes the action, logs the result to the `ToolExecution` table, and returns the data.

### Deployments & Branches (`/api/deployments` & `/api/branches`)
Handles the version control logic for MCP Servers.
*   `POST /api/deployments`: Deploys a branch snapshot.
*   `POST /api/deployments/[id]/rollback`: Rolls back a branch to match a specific deployment snapshot.
*   `POST /api/branches/[id]/merge`: Merges a branch's snapshot into the main branch.

### Playground API (`/api/playground`)
Used by the frontend to safely test tool execution.
*   `POST /api/playground/execute`: Ad-hoc tool execution without requiring a persisted tool configuration.
*   `GET /api/playground/history`: Retrieves the execution history log.

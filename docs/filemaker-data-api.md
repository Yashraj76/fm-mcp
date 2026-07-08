# FileMaker Data API Setup

kilink uses the FileMaker Data API (v1) to execute queries, create/update/delete records, and run scripts against your FileMaker databases.

---

## Prerequisites

1. **FileMaker Server 19+** — The Data API must be enabled. In FileMaker Server Admin Console: **Connectors → FileMaker Data API → Enable**.
2. **A hosted database** — The database must be open and accessible on the server.
3. **A FileMaker account** — The account must have the **fmrest** extended privilege enabled in its privilege set. In FileMaker Pro: **File → Manage → Security → [select privilege set] → Edit → Extended Privileges → Check `fmrest`**.

> **Cloud:** FileMaker Cloud (Claris) enables the Data API automatically. Use your Claris ID credentials.

---

## Connection settings

In kilink, go to **Connections → New Connection** and fill in:

| Field | Description |
|-------|-------------|
| **Host** | FileMaker Server hostname or IP — e.g. `fm.example.com` or `https://fm.example.com` |
| **Database** | Exact filename without `.fmp12` — e.g. `Customers` |
| **Username** | FileMaker account with `fmrest` privilege |
| **Password** | FileMaker account password (stored AES-256-CBC encrypted) |
| **Port** | Leave blank for default (443/HTTPS). Set `80` only if the server uses plain HTTP (not recommended). |
| **SSL verify** | Enable unless the server uses a self-signed certificate that you cannot install |

---

## Testing the connection

After saving, click **Test Connection** on the connection card. kilink attempts a login/logout cycle and reports the result. Common errors:

| Error | Fix |
|-------|-----|
| `Authentication failed` | Wrong username/password, or `fmrest` privilege not enabled |
| `Connection timed out` | Firewall blocking port 443, or wrong host |
| `SSL handshake failed` | Disable SSL verify for self-signed certs, or install the cert |
| `Not found (404)` | Wrong database name, or Data API not enabled on the server |

---

## Schema browsing

Once connected, use **Browse Schema** to discover layouts and scripts. kilink fetches:

- **Layouts** — via `GET /fmi/data/v1/databases/{db}/layouts`
- **Scripts** — via `GET /fmi/data/v1/databases/{db}/scripts`
- **Field metadata** — for each selected layout

Schema is cached per connection; click **Refresh Schema** to pick up FileMaker database changes.

---

## Multiple databases on one server

Create one connection per database file. You can link multiple connections to a single MCP server and assign different tools to different connections. Tools are routed to the correct database at execution time via `handlerConfig.connectionId`.

---

## FileMaker Admin API (optional)

If you also want to list hosted databases automatically, go to **FM Server Connections → New Server** and enter the Admin API credentials. This uses the FileMaker Admin API (`/fmi/admin/api/v2`) separately from the Data API.

---

## Rate limits and sessions

The Data API uses session tokens. kilink creates and discards a session per tool execution (`withFMSession`). For high-throughput workloads, consider:

- Enabling **connection pooling** on the FileMaker Server Admin Console
- Setting the `FileMaker Data API Calls` limit high enough in your FileMaker privilege set

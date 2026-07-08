# OData Setup Guide

kilink supports the FileMaker OData API (OData v4) for additional schema discovery and filtering. OData is optional — the core Data API features work without it.

---

## When to use OData

| Feature | Data API | OData |
|---------|----------|-------|
| Find / create / update / delete records | ✅ | ❌ |
| Run scripts | ✅ | ❌ |
| Discover field types and metadata | Layout metadata only | ✅ Full CSDL $metadata |
| Filter with `$filter` expressions | ❌ | ✅ |
| OData `$expand` (related portals) | ❌ | ✅ |

Use OData when you need richer field type information for schema generation, or when you want to expose OData-filter tools to AI agents.

---

## Prerequisites

1. **FileMaker Server 19.3+** — OData must be enabled in Admin Console: **Connectors → OData API → Enable**.
2. Same FileMaker account as the Data API. The account must also have the **fmodata** extended privilege:
   - In FileMaker Pro: **File → Manage → Security → [privilege set] → Edit → Extended Privileges → Check `fmodata`**

---

## OData endpoint structure

```
https://<fm-server>/fmi/odata/v4/<database-name>/
https://<fm-server>/fmi/odata/v4/<database-name>/$metadata
https://<fm-server>/fmi/odata/v4/<database-name>/<layout-name>
```

Authentication uses HTTP Basic auth (same credentials as Data API).

---

## Enabling OData in kilink

On the connection's **Browse Schema** page, kilink automatically fetches `$metadata` when OData is available. The result is shown in the **OData Tables** tab. If OData is not enabled on the server, kilink falls back gracefully to Data API layout metadata only — no error is surfaced to end users.

---

## OData filter tools

To expose OData filter queries as MCP tools:

1. Create a new tool and set **FileMaker Method** to `odata-filter`.
2. Set `handlerConfig.odataFilter` to a template string, e.g.:
   ```
   Name eq '{customerName}' and Status eq 'Active'
   ```
3. Parameters named in the template (e.g. `customerName`) become MCP tool input parameters automatically.

Filter expressions are sanitised via `interpolateODataFilter` before execution — single quotes are escaped, null bytes stripped.

---

## OData $metadata timeout

For large FileMaker databases, `$metadata` can be multi-megabyte. kilink sets a 20-second timeout by default. If `$metadata` times out:

- kilink falls back to Data API field discovery for affected tables
- The connection status shows `timeout` for the OData component
- Increase the timeout by setting `ODATA_METADATA_TIMEOUT_MS` in your environment (milliseconds)

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| OData tab empty after Browse Schema | OData API not enabled on server, or `fmodata` privilege missing |
| `401` on OData | `fmodata` extended privilege not enabled in the privilege set |
| `404` on OData | Wrong database name in URL, or OData not running |
| $metadata timeout | Large database — increase timeout or use Data API metadata only |

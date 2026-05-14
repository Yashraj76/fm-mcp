---
trigger: always_on
---

# Rules File 5: Server Connection, Schema Browser & Settings Rules

## RULE: Admin API ≠ Data API — Never Cross Credentials
| Credential Type | Used For | Auth Method |
|----------------|----------|-------------|
| Admin (ServerConnection) | List databases, server admin | Basic → JWT Bearer token |
| File (Connection) | CRUD on records, schema metadata | Basic → FM session Bearer token |
| OData (Connection) | OData queries | Basic (no session token) |

NEVER use an admin token to call the Data API. NEVER use a file token to call the Admin API. They are completely separate authentication systems.

---

## RULE: Admin API Base URL Format
```
https://{host}:{port}/fmi/admin/api/v2
```
Always `v2`. Never `v1`.

---

## RULE: Admin API Token Lifecycle
- Token obtained via: `POST /fmi/admin/api/v2/user/login` with Basic auth
- Token valid 15 minutes, resets on each use
- Always invalidate after use: `DELETE /fmi/admin/api/v2/user/logout`
- Never cache token across requests — always open/close per API call sequence
- Use `withAdminSession()` wrapper — never call login/logout manually

---

## RULE: Database Status Filter
Only show databases where `status === "Normal"` from the Admin API list response. Closed, paused, or error databases must be hidden from the picker. Never allow creating a Connection to a closed database.

---

## RULE: ServerConnection Can Be Reused
A single ServerConnection (admin credentials) can spawn multiple Connections (one per file). The relation is `ServerConnection → many Connections`. When deleting a ServerConnection, only delete it if it has zero child Connections, or cascade with a warning.

---

## RULE: Schema Browser — Layouts Limit
Layout metadata fetch is expensive (1 request per layout). Default cap: **30 layouts**. 
- Store the full layout name list in `rawLayouts`
- Fetch metadata for up to 30 by default
- Expose a `GET /api/connections/[id]/schema/layout/[name]` route for on-demand fetching of additional layouts
- Never block the entire browse-schema call waiting for all layouts

---

## RULE: OData Metadata is XML — Always Parse as XML
The `GET /fmi/odata/v4/{db}/$metadata` endpoint returns EDMX XML, not JSON. Always use `fast-xml-parser` or `xml2js`. Never attempt to `JSON.parse` this response.

```
import { XMLParser } from 'fast-xml-parser';
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
```

---

## RULE: OData is Optional — Non-Fatal Failure
OData may be disabled on the FM Server. If the OData `$metadata` fetch fails (any status code or network error), log it and return an empty `odataTables: []`. The schema browser must still succeed with Data API results only. Never fail the entire browse-schema call because OData is unavailable.

---

## RULE: compiledSchema is the Single Source of Truth for Tool Generator
The tool generator (WORKFLOW_08) must ONLY read from `BrowsedSchema.compiledSchema`. It must NOT use `Connection.schemaCache` (the old raw cache). Before generating tools:
```typescript
if (!conn.browsedSchema?.compiledSchema) {
  throw new Error('Schema not browsed. Go to Connection → Browse Schema and save selections first.');
}
```

---

## RULE: AI Provider — Never Hardcode API Keys
```typescript
// WRONG
headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY }

// CORRECT
const settings = await prisma.appSettings.findUnique({ where: { id: 'singleton' } });
const apiKey = settings?.aiApiKeyEncrypted ? decrypt(settings.aiApiKeyEncrypted) : '';
```
All AI calls must go through `callAI()` in `src/lib/ai/client.ts`.

---

## RULE: AppSettings Uses Singleton Row
The `AppSettings` table always has exactly one row with `id = "singleton"`. Use `upsert` everywhere:
```typescript
prisma.appSettings.upsert({
  where: { id: 'singleton' },
  create: { id: 'singleton', ...defaults },
  update: { ...changes },
});
```

---

## RULE: AI Relationship Suggestions Are Advisory
Suggested relationships from AI are saved as `suggestedRelationships` and shown to the user. They are NOT automatically added to `compiledSchema`. The user must review and the selection save step (`PUT /schema/selections`) determines which relationships make it into `compiledSchema`.

---

## RULE: Portals = Definite Relationships
Portal metadata from layout metadata (`portalMetaData` in the Data API response) indicates a real FileMaker relationship. These must always be included in the AI suggestion payload and should receive `confidence: "high"`. The AI prompt must treat portals as authoritative.

---

## RULE: Schema Browser Flow Order
Must follow this exact sequence — no skipping:
1. `POST /browse-schema` — fetches raw schema from FM
2. `POST /schema/ai-relationships` — AI suggests relationships (optional but recommended)
3. `PUT /schema/selections` — user saves selections + compiles
4. `GET /schema/compiled` — tool generator reads this

---

## RULE: Settings Page Must Show Connection Status
On the Settings page, after saving AI provider config, show a "Test AI" button that makes a simple test call (e.g., `callAI({ systemPrompt: "Respond with OK", userMessage: "ping" })`) and shows success/fail. This prevents silent misconfiguration.
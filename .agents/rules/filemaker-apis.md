---
trigger: always_on
---

# Rules File 2: FileMaker Data API Rules

## RULE: Base URL Format
```
https://{host}:{port}/fmi/data/v1/databases/{encodedDatabaseName}
```
- Always `v1` (not `vLatest` — unpredictable in production)
- Always encode the database name with `encodeURIComponent`

---

## RULE: Authentication Flow
```
POST /sessions           → { response: { token: "abc123" } }
Authorization: Basic base64(username:password)
Content-Type: application/json
Body: {}
```
Extract token with: `json.response.token`

---

## RULE: Authenticated Request Headers
```typescript
{
  'Authorization': `Bearer ${token}`,
  'Content-Type': 'application/json',
}
```
Note: It's `Bearer`, not `Basic`, for post-login requests.

---

## RULE: Session Logout
```
DELETE /sessions/{token}
```
- Always fire in a `finally` block
- Ignore errors on logout (best-effort, use `.catch(() => {})`)
- Sessions expire automatically after ~15 min but always close explicitly

---

## RULE: FM Find Request (POST `/_find`)
```json
{
  "query": [
    { "FieldName": "search value" },
    { "AnotherField": "=exact match" }
  ],
  "limit": 50,
  "offset": 1
}
```
- `query` is an array of criterion objects (OR between items, AND within one item)
- Wrap in `*value*` for contains search
- Use `=value` for exact match
- Use `>value` / `<value` for comparisons

---

## RULE: FM Create Record
```
POST /layouts/{layout}/records
Body: { "fieldData": { "FieldName": "value" } }
```
Response contains `recordId` in `response.recordId`

---

## RULE: FM Edit Record
```
PATCH /layouts/{layout}/records/{recordId}
Body: { "fieldData": { "FieldName": "newValue" } }
```

---

## RULE: FM Delete Record
```
DELETE /layouts/{layout}/records/{recordId}
```
No body needed.

---

## RULE: FM Run Script
```
GET /layouts/{layout}/_scripts/{scriptName}
```
With param:
```
GET /layouts/{layout}/_scripts/{scriptName}?script.param=value
```
- Script name must be URL encoded
- Script result returned in `response.scriptResult`
- Script error in `response.scriptError`

---

## RULE: FM List Records (Paginated)
```
GET /layouts/{layout}/records?_limit=20&_offset=1
```
- `_offset` starts at 1 (not 0)
- Default limit on FM side is 100 if not specified

---

## RULE: FM Response Validation
Always check: `json.messages[0].code === '0'` for success.
```typescript
function assertFMSuccess(json: any) {
  const code = json?.messages?.[0]?.code;
  if (code !== '0') {
    throw new Error(`FM Error ${code}: ${json?.messages?.[0]?.message}`);
  }
  return json.response;
}
```

---

## RULE: SSL Verification Toggle
- Production: `sslVerify: true` (always)
- Dev/self-signed: `sslVerify: false` allowed
- Implement via `https.Agent({ rejectUnauthorized: sslVerify })`
- Pass agent to `fetch` — in Node 18+ use undici or node-fetch for agent support

---

## RULE: FM Schema — Layouts vs Table Occurrences
- The Data API operates on **layouts**, not raw tables
- A layout is a view over a table occurrence
- `GET /layouts` returns layout names to use in API calls
- Field names in API calls must match **layout field names** exactly (case-sensitive)

---

## RULE: Container Fields
- Containers require `multipart/form-data` upload (not JSON)
- Read via a separate URL endpoint, not inline in record JSON
- Only implement if your tool explicitly supports containers

---

## RULE: Rate Limiting / Account Lockout
FileMaker locks accounts after repeated auth failures. Apply:
- Maximum 3 test-connection retries per connection per minute
- Exponential backoff on auth errors
- Surface lockout errors clearly to the user
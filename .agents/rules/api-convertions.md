---
trigger: always_on
---

# Rules File 1: API Conventions & Error Handling

## RULE: Standard Response Shape
Every API route MUST return one of these two shapes. No exceptions.

```typescript
// Success
{ success: true, data: <payload> }

// Error
{ success: false, error: string, code: string, details?: any }
```

---

## RULE: HTTP Status Codes
| Situation | Status |
|-----------|--------|
| Success GET / PUT / DELETE | 200 |
| Success POST (created) | 201 |
| Validation error (Zod) | 400 |
| Auth / credentials error | 401 |
| Resource not found | 404 |
| FM or internal server error | 500 |

---

## RULE: Zod Validation on Every POST/PUT
```typescript
// Always validate incoming body before touching DB or FM
try {
  const parsed = Schema.parse(await req.json());
} catch (err) {
  if (err instanceof ZodError) {
    return NextResponse.json({
      success: false,
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: err.errors,
    }, { status: 400 });
  }
}
```

---

## RULE: Error Code Naming Convention
Always use SCREAMING_SNAKE_CASE:
- `NOT_FOUND`
- `VALIDATION_ERROR`
- `CONNECTION_FAILED`
- `FM_AUTH_ERROR`
- `FM_EXECUTION_ERROR`
- `SERVER_ERROR`
- `TOOL_DISABLED`
- `SCHEMA_FETCH_ERROR`

---

## RULE: FileMaker Error Mapping
FileMaker returns error codes in `response.messages[0].code`. Map them:
```typescript
const FM_ERROR_MAP: Record<string, string> = {
  '401': 'FM_AUTH_ERROR',      // Bad credentials
  '500': 'FM_LAYOUT_MISSING',  // Layout not found
  '401': 'FM_INSUFFICIENT_PRIVILEGES',
  '952': 'FM_SESSION_EXPIRED',
};
```
Always check `messages[0].code !== '0'` for FM errors.

---

## RULE: Never Expose Internals in Errors
```typescript
// WRONG
return NextResponse.json({ error: err.stack });

// CORRECT
console.error('[API Error]', err);
return NextResponse.json({ success: false, error: 'Internal server error', code: 'SERVER_ERROR' }, { status: 500 });
```

---

## RULE: Always use try/catch/finally for FM calls
```typescript
async function doFMWork() {
  await client.login();
  try {
    // ... do work
  } finally {
    await client.logout(); // fires even if error is thrown
  }
}
```

---

## RULE: API Route File Structure
Every route file follows this order:
1. Imports (Next, Prisma, Zod, helpers)
2. Zod schema definitions
3. Export named functions (GET, POST, PUT, DELETE)
4. No default exports in API routes

---

## RULE: Prisma — Never Return Encrypted Passwords
Any query that returns a Connection must explicitly `select` fields and exclude `passwordEncrypted`.

```typescript
// ALWAYS use select or omit password field
prisma.connection.findMany({
  select: { id: true, name: true, host: true /*, NO passwordEncrypted */ }
})
```

---

## RULE: Input Sanitization for FM Layouts/Script Names
Always `encodeURIComponent` layout names and script names before putting them in FM API URLs:
```typescript
const layout = encodeURIComponent(handlerConfig.layout);
fetch(`${base}/layouts/${layout}/records`);
```
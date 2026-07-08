# Security Guide

This document covers the security model for kilink deployments, credential handling, API key management, and recommendations for hardening your installation.

---

## Credential storage

All secrets stored in kilink are encrypted at rest using **AES-256-CBC** with a random IV per encryption call:

| Secret type | Where stored | How protected |
|-------------|-------------|---------------|
| FileMaker passwords | `FMConnection.password` column | AES-256-CBC encrypted |
| FileMaker client secrets | `FMConnection.clientSecret` column | AES-256-CBC encrypted |
| FM Admin API passwords | `FMServerConnection.adminPasswordEncrypted` column | AES-256-CBC encrypted |
| MCP API keys | `McpApiKey.keyHash` column | bcrypt hashed (never stored in plaintext) |
| AI provider API keys | `AppSettings.aiApiKey` column | AES-256-CBC encrypted |

### Encryption key

Set `ENCRYPTION_KEY` in your environment to a 64-character hex string (32 bytes):

```bash
# Generate a strong key:
openssl rand -hex 32
```

**Do not use the development fallback key in production.** The fallback is intentionally weak and is rejected when `NODE_ENV=production`.

> **Key rotation:** See `CREDENTIAL_ROTATION.md` for the credential rotation runbook.

---

## MCP API key security

- Keys are generated with `crypto.randomBytes(32)` and prefixed `kilink_`.
- The raw key is shown **once** at creation — copy it immediately.
- Only the bcrypt hash is stored; kilink cannot recover the original key.
- Each key is scoped to one MCP server — compromising one key does not expose other servers.
- **Rotate immediately** if a key is exposed in logs, source code, or version control.
- Set an API key expiry via the `expiresAt` field (UI: Settings → API Keys).

---

## Transport security

- Always deploy kilink behind HTTPS. The included `Caddyfile` terminates TLS automatically via Let's Encrypt.
- Never expose the FileMaker Data API port (80/443 on the FileMaker Server) to the public internet without authentication.
- Enable `sslVerify` on all FileMaker connections that use public certificates. Disable only for self-signed certs on private networks.

---

## Auth bypass environment variables

Two environment variables can weaken authentication in development — **never set these in production:**

| Variable | Purpose | Production effect |
|----------|---------|-------------------|
| `MCP_DEV_BYPASS=true` | Skip API key check for local dev | Ignored (hard-blocked) |
| `INTERNAL_TEST_SECRET=<value>` | Allow self-test calls without a key | Ignored (hard-blocked) |

kilink logs a warning at startup when either bypass is active.

---

## Supabase auth security

- Enable **email confirmation** in Supabase: Dashboard → Auth → Settings → Email confirmation required.
- Enable **password strength** requirements.
- Configure **rate limits** on auth endpoints (kilink's own rate limiter also protects `/api/auth/*`).
- Use **Row Level Security (RLS)** — kilink does not use RLS directly (it uses its own `userId` scoping), but enabling RLS in Supabase prevents direct DB access from bypassing app-level access controls.

---

## Rate limiting

kilink applies per-IP rate limits using Upstash Redis:

| Route type | Limit |
|------------|-------|
| Auth endpoints | Strict (prevents brute force) |
| MCP tool execution | Per-server rate limit |
| Read API routes | Moderate |
| Mutation API routes | Conservative |

### Required production env vars

`UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` **must** be set in production. kilink refuses to start distributed rate limiting without them — if they are absent at runtime, every request returns a `500 RATE_LIMIT_CONFIG_ERROR` response rather than silently falling back to per-process memory limits (which are reset on every deploy and bypassed by multiple instances).

In development and test environments, kilink falls back to an in-memory sliding-window limiter and logs a warning.

**Set up Upstash Redis:**
1. Create a free database at [upstash.com](https://upstash.com).
2. Copy the REST URL and token from the database dashboard.
3. Add them to your environment (Vercel dashboard → Settings → Environment Variables):
   ```
   UPSTASH_REDIS_REST_URL=https://<id>.upstash.io
   UPSTASH_REDIS_REST_TOKEN=<token>
   ```

---

## Secrets checklist

Before going to production, verify:

- [ ] `ENCRYPTION_KEY` is a fresh 64-char hex value, not the dev fallback
- [ ] `DATABASE_URL` and `DIRECT_URL` use TLS (`?sslmode=require`)
- [ ] `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set
- [ ] `MCP_DEV_BYPASS` is **not** set
- [ ] `INTERNAL_TEST_SECRET` is **not** set (or set to a strong random value, never the old `mcp-self-test-secret` fallback)
- [ ] `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are set (required — missing vars return 500 on all requests)

---

## Responsible disclosure

If you discover a security vulnerability in kilink, please email **security@kibizsystems.com** before public disclosure. We aim to respond within 48 hours.

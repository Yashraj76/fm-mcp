# Credential Rotation Procedure

**Trigger:** Any time the `.env` file is suspected or confirmed to be in version-control history, or when rotating the `ENCRYPTION_KEY` for any reason.

---

## What needs rotating

| Secret | Where it lives | Why it's sensitive |
|--------|---------------|-------------------|
| `DATABASE_URL` / `DIRECT_URL` | Supabase PostgreSQL password | Full DB access |
| `ENCRYPTION_KEY` | `process.env.ENCRYPTION_KEY` | Decrypts all stored FileMaker and AI credentials |
| Turso auth token (if present in `.env`) | Turso dashboard | Secondary DB access |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase project settings | Client-side auth flows |

---

## Step 1 — Stop tracking `.env`

```bash
git rm --cached .env
echo ".env" >> .gitignore   # already present if the project .gitignore has .env*
git commit -m "chore: untrack .env from version control"
```

This stops *future* commits from including the file. Secrets already in git history remain there; treat them as compromised and follow the steps below.

---

## Step 2 — Rotate external secrets

### Supabase database password
1. Supabase Dashboard → Project Settings → Database → Reset database password
2. Update `DATABASE_URL` and `DIRECT_URL` in your deployment platform (Vercel → Project Settings → Environment Variables)

### Supabase anon key (if leaked)
1. Supabase Dashboard → Project Settings → API → Regenerate `anon` key
2. Update `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in Vercel env vars and any client apps

### Turso token (if present)
1. Turso Dashboard → Tokens → Revoke the compromised token → Create new
2. Update the token in Vercel env vars

---

## Step 3 — Generate a new ENCRYPTION_KEY

```bash
node -e "require('crypto').randomBytes(32).toString('hex')"
```

Example output (do not use this value — generate your own):
```
a3f7e2b1c9d6a4f8e0b3d7c5a1f9e2b4d6c8a0f3e7b1d5c9a3f6e0b2d4c8a1f5
```

Requirements enforced at startup:
- Exactly 64 hex characters (32 bytes)
- Not a known placeholder (`deadbeef`, `cafebabe`, `00000000`, etc.)
- Not all-same-byte or sequential bytes

Set it in Vercel:
```
ENCRYPTION_KEY=<your-new-64-hex-char-key>
```

---

## Step 4 — Re-encrypt stored credentials

All FileMaker and AI credentials stored in the database were encrypted with the old key. They must be decrypted with the **old** key and re-encrypted with the **new** key before deploying.

**Encrypted database fields:**

| Table | Field |
|-------|-------|
| `FMConnection` | `password` |
| `FMConnection` | `clientSecret` |
| `FMServerConnection` | `adminPasswordEncrypted` |
| `AppSettings` | `aiApiKeyEncrypted` |

### Migration script

Run this **before** deploying the new `ENCRYPTION_KEY`:

```ts
// scripts/reencrypt-credentials.ts
// Usage: OLD_ENCRYPTION_KEY=<old> NEW_ENCRYPTION_KEY=<new> npx tsx scripts/reencrypt-credentials.ts
import { PrismaClient } from '@prisma/client'
import crypto from 'crypto'

const ALGORITHM = 'aes-256-cbc'

function makeKey(hex: string): Buffer {
  if (!hex || hex.length !== 64) throw new Error('Key must be 64 hex chars')
  const buf = Buffer.from(hex, 'hex')
  if (buf.length !== 32) throw new Error('Key must decode to 32 bytes')
  return buf
}

function reencryptValue(value: string, oldKey: Buffer, newKey: Buffer): string {
  if (!value) return value
  // Decrypt with old key
  const colonIdx = value.indexOf(':')
  if (colonIdx !== 32) throw new Error(`Unexpected format: ${value.slice(0, 40)}...`)
  const iv = Buffer.from(value.slice(0, 32), 'hex')
  const cipherBuf = Buffer.from(value.slice(33), 'hex')
  const decipher = crypto.createDecipheriv(ALGORITHM, oldKey, iv)
  let plain = decipher.update(cipherBuf, undefined, 'utf8')
  plain += decipher.final('utf8')
  // Re-encrypt with new key
  const newIv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv(ALGORITHM, newKey, newIv)
  let encrypted = cipher.update(plain, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  return `${newIv.toString('hex')}:${encrypted}`
}

async function main() {
  const oldKey = makeKey(process.env.OLD_ENCRYPTION_KEY ?? '')
  const newKey = makeKey(process.env.NEW_ENCRYPTION_KEY ?? '')
  const db = new PrismaClient()

  // FMConnection.password + clientSecret
  const connections = await db.fMConnection.findMany({
    select: { id: true, password: true, clientSecret: true },
  })
  for (const conn of connections) {
    await db.fMConnection.update({
      where: { id: conn.id },
      data: {
        password: conn.password ? reencryptValue(conn.password, oldKey, newKey) : conn.password,
        clientSecret: conn.clientSecret ? reencryptValue(conn.clientSecret, oldKey, newKey) : null,
      },
    })
  }
  console.log(`Re-encrypted ${connections.length} FMConnection rows`)

  // FMServerConnection.adminPasswordEncrypted
  const serverConns = await db.fMServerConnection.findMany({
    select: { id: true, adminPasswordEncrypted: true },
  })
  for (const sc of serverConns) {
    if (!sc.adminPasswordEncrypted) continue
    await db.fMServerConnection.update({
      where: { id: sc.id },
      data: { adminPasswordEncrypted: reencryptValue(sc.adminPasswordEncrypted, oldKey, newKey) },
    })
  }
  console.log(`Re-encrypted ${serverConns.length} FMServerConnection rows`)

  // AppSettings.aiApiKeyEncrypted
  const settings = await db.appSettings.findMany({
    select: { id: true, aiApiKeyEncrypted: true },
  })
  for (const s of settings) {
    if (!s.aiApiKeyEncrypted) continue
    await db.appSettings.update({
      where: { id: s.id },
      data: { aiApiKeyEncrypted: reencryptValue(s.aiApiKeyEncrypted, oldKey, newKey) },
    })
  }
  console.log(`Re-encrypted ${settings.length} AppSettings rows`)

  await db.$disconnect()
  console.log('Done. All credentials re-encrypted.')
}

main().catch(err => { console.error(err); process.exit(1) })
```

### Deployment order

1. Run the migration script against production DB with both keys available
2. Verify the script completes without errors
3. Deploy the new build with the new `ENCRYPTION_KEY` set in Vercel env vars
4. Delete the old `ENCRYPTION_KEY` from all non-production environments

**Do not deploy the new key before running the migration** — existing encrypted values will fail to decrypt.

---

## Step 5 — Verify

After deployment:

1. Open the app and confirm FileMaker connections can be tested successfully (a connection test decrypts the password and hits the FM server)
2. Check that AI tool generation works (decrypts `aiApiKeyEncrypted`)
3. Check logs for any `[crypto] decrypt:` errors

---

## Local development

For local dev, `ENCRYPTION_KEY` is optional. The app uses a known insecure fallback (`deadbeef…`) and logs a warning. Never copy production encrypted values into a local database without also copying the corresponding `ENCRYPTION_KEY`.

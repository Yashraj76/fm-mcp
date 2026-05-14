---
description: # Workflow 9: Server Connection & Admin API Database Listing
---

## Overview
A ServerConnection holds FM Server admin credentials. It uses the FileMaker Admin API (not Data API) to list hosted databases. The user picks a database and that creates a file-level Connection.

---

## Prisma Migration Steps
```bash
# Add to prisma/schema.prisma the ServerConnection model and update Connection
# Then run:
npx prisma migrate dev --name add_server_connection_schema_browser
```

---

## Admin API Client

**File**: `src/lib/filemaker/admin-client.ts`

```typescript
import https from 'https';
import { decrypt } from '../crypto';

export class FileMakerAdminClient {
  private baseUrl: string;
  private agent: https.Agent;
  private token: string | null = null;

  constructor(private config: {
    host: string;
    port: number;
    adminUsername: string;
    adminPassword: string;
    sslVerify: boolean;
  }) {
    this.baseUrl = `https://${config.host}:${config.port}/fmi/admin/api/v2`;
    this.agent = new https.Agent({ rejectUnauthorized: config.sslVerify });
  }

  async login(): Promise<void> {
    const credentials = Buffer.from(
      `${this.config.adminUsername}:${this.config.adminPassword}`
    ).toString('base64');

    const res = await fetch(`${this.baseUrl}/user/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${credentials}`,
      },
      body: JSON.stringify({}),
      agent: this.agent,
    } as any);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(`Admin auth failed: ${res.status} — ${body?.messages?.[0]?.message ?? 'Unknown'}`);
    }

    const json = await res.json();
    this.token = json.response?.token;
    if (!this.token) throw new Error('Admin API did not return a token');
  }

  async logout(): Promise<void> {
    if (!this.token) return;
    await fetch(`${this.baseUrl}/user/logout`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${this.token}` },
      agent: this.agent,
    } as any).catch(() => {});
    this.token = null;
  }

  async listDatabases(): Promise<FMDatabase[]> {
    const res = await fetch(`${this.baseUrl}/databases`, {
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      agent: this.agent,
    } as any);

    if (!res.ok) throw new Error(`List databases failed: ${res.status}`);
    const json = await res.json();
    return json.response?.databases ?? [];
  }
}

export interface FMDatabase {
  id: string;
  name: string;
  status: string;    // "Normal" = open, "Closed" = closed
  enabled: boolean;
  folderId?: string;
}

// Wrapper — auto login/logout
export async function withAdminSession<T>(
  serverConn: { host: string; port: number; adminPasswordEncrypted: string; adminUsername: string; sslVerify: boolean },
  fn: (client: FileMakerAdminClient) => Promise<T>
): Promise<T> {
  const client = new FileMakerAdminClient({
    host: serverConn.host,
    port: serverConn.port,
    adminUsername: serverConn.adminUsername,
    adminPassword: decrypt(serverConn.adminPasswordEncrypted),
    sslVerify: serverConn.sslVerify,
  });
  await client.login();
  try {
    return await fn(client);
  } finally {
    await client.logout();
  }
}
```

---

## Server Connection API Routes

**File**: `src/app/api/server-connections/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { encrypt } from '@/lib/crypto';
import { z } from 'zod';

const CreateSchema = z.object({
  name: z.string().min(1),
  host: z.string().min(1),
  port: z.number().int().default(443),
  adminUsername: z.string().min(1),
  adminPassword: z.string().min(1),
  sslVerify: z.boolean().default(true),
});

export async function GET() {
  const list = await prisma.serverConnection.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, name: true, host: true, port: true,
      adminUsername: true, sslVerify: true,
      status: true, lastTestedAt: true, lastError: true,
      _count: { select: { connections: true } },
    },
  });
  return NextResponse.json({ success: true, data: list });
}

export async function POST(req: Request) {
  try {
    const parsed = CreateSchema.parse(await req.json());
    const sc = await prisma.serverConnection.create({
      data: {
        name: parsed.name,
        host: parsed.host,
        port: parsed.port,
        adminUsername: parsed.adminUsername,
        adminPasswordEncrypted: encrypt(parsed.adminPassword),
        sslVerify: parsed.sslVerify,
      },
    });
    return NextResponse.json({ success: true, data: { id: sc.id, name: sc.name } }, { status: 201 });
  } catch (err: any) {
    if (err.name === 'ZodError') {
      return NextResponse.json({ success: false, error: 'Validation failed', code: 'VALIDATION_ERROR', details: err.errors }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: err.message, code: 'SERVER_ERROR' }, { status: 500 });
  }
}
```

**File**: `src/app/api/server-connections/[id]/test/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAdminSession } from '@/lib/filemaker/admin-client';

export async function POST(_: Request, { params }: { params: { id: string } }) {
  const sc = await prisma.serverConnection.findUnique({ where: { id: params.id } });
  if (!sc) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });

  try {
    await withAdminSession(sc, async (client) => {
      await client.listDatabases(); // validates credentials + connectivity
    });
    await prisma.serverConnection.update({
      where: { id: params.id },
      data: { status: 'online', lastTestedAt: new Date(), lastError: null },
    });
    return NextResponse.json({ success: true, data: { status: 'online' } });
  } catch (err: any) {
    await prisma.serverConnection.update({
      where: { id: params.id },
      data: { status: 'error', lastError: err.message },
    });
    return NextResponse.json({ success: false, error: err.message, code: 'ADMIN_AUTH_FAILED' }, { status: 400 });
  }
}
```

---

## List Databases Route (the "database picker")

**File**: `src/app/api/server-connections/[id]/databases/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAdminSession, FMDatabase } from '@/lib/filemaker/admin-client';

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const sc = await prisma.serverConnection.findUnique({ where: { id: params.id } });
  if (!sc) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });

  try {
    const databases = await withAdminSession(sc, (client) => client.listDatabases());

    // Filter: only return open databases
    const open = databases.filter((db: FMDatabase) => db.status === 'Normal');

    return NextResponse.json({ success: true, data: open });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message, code: 'ADMIN_LIST_FAILED' }, { status: 500 });
  }
}
```

---

## Updated Connection Creation (with server source)

When user picks a database from the picker, POST to `/api/connections` with:
```json
{
  "name": "Production - ContactMgmt",
  "serverConnectionId": "sc_abc123",   ← server connection to link
  "database": "ContactMgmt",           ← picked from database list
  "username": "file_user",             ← file-level credentials (different from admin)
  "password": "file_password",
  "host": "fm.example.com",            ← auto-populated from ServerConnection
  "port": 443,
  "sslVerify": true
}
```

Update `POST /api/connections` to accept and store `serverConnectionId`:
```typescript
const connection = await prisma.connection.create({
  data: {
    ...parsed,
    passwordEncrypted: encrypt(parsed.password),
    serverConnectionId: parsed.serverConnectionId ?? null,
  },
});
```

---

## UI Flow (for frontend reference)

```
[New Connection Dialog]
  Step 1: "Add from Server" tab
    → Pick a ServerConnection (or create new)
    → Enter admin username + password
    → Click "Connect" → POST /api/server-connections → POST /api/server-connections/[id]/test
    → Database list loads → GET /api/server-connections/[id]/databases
    → User picks a database from dropdown

  Step 2: File Credentials
    → Enter username + password for the selected database file
    → Click "Create Connection" → POST /api/connections

  [Manual tab still available for direct entry]
```

---

## Notes
- Admin credentials (ServerConnection) ≠ file credentials (Connection). Never mix them.
- A ServerConnection can be reused: once saved, user can create multiple file Connections from it.
- Admin API token is valid 15 min and resets per call. Always open/close per request — never cache.
- `status: "Normal"` in Admin API = database is open. Closed databases return `"Closed"` — filter them out from the picker.
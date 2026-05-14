---
description: Workflow 1: FileMaker Authentication & Session Management
---


## Overview
Every interaction with FileMaker goes through a temporary session. This workflow defines how to open, use, and close FM sessions safely.

---

## Step 1 — Build the FileMakerClient class

**File**: `src/lib/filemaker/client.ts`

```typescript
import https from 'https';

interface FMConnectionConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  sslVerify: boolean;
}

export class FileMakerClient {
  private baseUrl: string;
  private agent: https.Agent;
  private token: string | null = null;

  constructor(private config: FMConnectionConfig) {
    this.baseUrl = `https://${config.host}:${config.port}/fmi/data/v1/databases/${encodeURIComponent(config.database)}`;
    this.agent = new https.Agent({ rejectUnauthorized: config.sslVerify });
  }

  async login(): Promise<void> {
    const credentials = Buffer.from(`${this.config.username}:${this.config.password}`).toString('base64');
    const res = await fetch(`${this.baseUrl}/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${credentials}`,
      },
      body: JSON.stringify({}),
      // @ts-ignore
      agent: this.agent,
    });
    if (!res.ok) throw new FMAuthError(await res.json());
    const json = await res.json();
    this.token = json.response.token;
  }

  async logout(): Promise<void> {
    if (!this.token) return;
    await fetch(`${this.baseUrl}/sessions/${this.token}`, {
      method: 'DELETE',
      // @ts-ignore
      agent: this.agent,
    }).catch(() => {}); // best-effort
    this.token = null;
  }

  getAuthHeaders() {
    if (!this.token) throw new Error('Not authenticated');
    return {
      'Authorization': `Bearer ${this.token}`,
      'Content-Type': 'application/json',
    };
  }

  getBaseUrl() { return this.baseUrl; }
  getAgent() { return this.agent; }
}
```

---

## Step 2 — Create a session wrapper helper

**File**: `src/lib/filemaker/session.ts`

```typescript
import { FileMakerClient } from './client';
import { getConnectionById } from '../db/connections';
import { decrypt } from '../crypto';

export async function withFMSession<T>(
  connectionId: string,
  fn: (client: FileMakerClient) => Promise<T>
): Promise<T> {
  const conn = await getConnectionById(connectionId);
  const client = new FileMakerClient({
    host: conn.host,
    port: conn.port,
    database: conn.database,
    username: conn.username,
    password: decrypt(conn.passwordEncrypted),
    sslVerify: conn.sslVerify,
  });

  await client.login();
  try {
    return await fn(client);
  } finally {
    await client.logout(); // ALWAYS logout
  }
}
```

---

## Step 3 — Credential encryption helpers

**File**: `src/lib/crypto.ts`

```typescript
import crypto from 'crypto';

const ALGO = 'aes-256-cbc';
const KEY = Buffer.from(process.env.ENCRYPTION_KEY!, 'hex'); // 32 bytes hex

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGO, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(text), cipher.final()]);
  return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decrypt(encryptedText: string): string {
  const [ivHex, dataHex] = encryptedText.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGO, KEY, iv);
  return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString();
}
```

Add to `.env`:
```
ENCRYPTION_KEY=<generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
```

---

## Step 4 — Connection test API route

**File**: `src/app/api/connections/[id]/test/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { withFMSession } from '@/lib/filemaker/session';
import { prisma } from '@/lib/prisma';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    await withFMSession(params.id, async (client) => {
      // Just opening and closing a session is sufficient to test auth
    });

    await prisma.connection.update({
      where: { id: params.id },
      data: { status: 'connected', lastTestedAt: new Date() },
    });

    return NextResponse.json({ success: true, data: { status: 'connected' } });
  } catch (err: any) {
    await prisma.connection.update({
      where: { id: params.id },
      data: { status: 'error', lastError: err.message },
    });
    return NextResponse.json({ success: false, error: err.message, code: 'CONNECTION_FAILED' }, { status: 400 });
  }
}
```

---

## Error Codes Reference

| Code | Meaning |
|------|---------|
| `401` | Bad FM credentials |
| `404` | Database not found on server |
| `500` | FM Server unreachable |
| `952` | Invalid session token |
| `401` (FM error 9) | Insufficient privileges |

---

## Notes
- FM sessions expire after ~15 minutes of inactivity — never reuse tokens across requests
- One request = one session open/close cycle
- The `withFMSession` wrapper must wrap EVERY FM call in the codebase
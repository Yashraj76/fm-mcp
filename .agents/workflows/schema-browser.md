---
description: # Workflow 10: Schema Browser — Deep Fetch from Data API & OData
---

## Overview
After a Connection is created, the user browses the full schema: layouts + fields (Data API), scripts (Data API), OData tables + fields (OData $metadata XML), and AI-suggested relationships. The user then selects what to include, and the result is saved as `BrowsedSchema.compiledSchema` for use by the tool generator.

---

## Phase 1: Fetch Raw Schema

**File**: `src/lib/filemaker/schema-browser.ts`

```typescript
import { FileMakerClient } from './client';
import { decrypt } from '../crypto';
import { prisma } from '../prisma';
import https from 'https';
import { XMLParser } from 'fast-xml-parser'; // npm install fast-xml-parser

export interface RawSchema {
  layouts: LayoutMeta[];
  scripts: ScriptMeta[];
  odataTables: ODataTable[];
}

export interface LayoutMeta {
  name: string;
  fields: FieldMeta[];
  portals: PortalMeta[];
  valueLists: ValueListMeta[];
}

export interface FieldMeta {
  name: string;
  type: string;        // "normal" | "calculation" | "summary"
  result: string;      // "text" | "number" | "date" | "time" | "timestamp" | "container"
  global: boolean;
  autoEnter: boolean;
  notEmpty: boolean;
}

export interface PortalMeta {
  table: string;
  fields: { name: string; type: string }[];
}

export interface ScriptMeta {
  name: string;
  isFolder: boolean;
}

export interface ODataTable {
  name: string;
  fields: { name: string; type: string }[];
}

export interface ValueListMeta {
  name: string;
  type: string;
  values: { displayValue: string; value: string }[];
}

export async function fetchFullSchema(connectionId: string): Promise<RawSchema> {
  const conn = await prisma.connection.findUnique({ where: { id: connectionId } });
  if (!conn) throw new Error('Connection not found');

  // Open FM Data API session
  const client = new FileMakerClient({
    host: conn.host,
    port: conn.port,
    database: conn.database,
    username: conn.username,
    password: decrypt(conn.passwordEncrypted),
    sslVerify: conn.sslVerify,
  });

  await client.login();

  let layouts: LayoutMeta[] = [];
  let scripts: ScriptMeta[] = [];
  let odataTables: ODataTable[] = [];

  try {
    const headers = client.getAuthHeaders();
    const base = client.getBaseUrl();
    const agent = client.getAgent();

    // ── Step 1: List all layout names ──────────────────────────────────────
    const layoutListRes = await fetch(`${base}/layouts`, { headers, agent } as any);
    const layoutListJson = await layoutListRes.json();
    const layoutNames: string[] = (layoutListJson.response?.layouts ?? [])
      .filter((l: any) => !l.isFolder)
      .map((l: any) => l.name);

    // ── Step 2: Fetch metadata for each layout (fields, portals, valueLists) ─
    // Limit to first 30 layouts to avoid timeout; user can refresh individual ones
    const layoutsToFetch = layoutNames.slice(0, 30);
    layouts = await Promise.all(
      layoutsToFetch.map(async (name): Promise<LayoutMeta> => {
        try {
          const res = await fetch(
            `${base}/layouts/${encodeURIComponent(name)}`,
            { headers, agent } as any
          );
          const json = await res.json();
          const r = json.response ?? {};
          return {
            name,
            fields: (r.fieldMetaData ?? []).map((f: any) => ({
              name: f.name,
              type: f.type,
              result: f.result,
              global: f.global ?? false,
              autoEnter: f.autoEnter ?? false,
              notEmpty: f.notEmpty ?? false,
            })),
            portals: Object.entries(r.portalMetaData ?? {}).map(([table, fields]: any) => ({
              table,
              fields: (fields ?? []).map((f: any) => ({ name: f.name, type: f.result })),
            })),
            valueLists: (r.valueLists ?? []).map((vl: any) => ({
              name: vl.name,
              type: vl.type,
              values: vl.values ?? [],
            })),
          };
        } catch {
          return { name, fields: [], portals: [], valueLists: [] };
        }
      })
    );

    // ── Step 3: List scripts ────────────────────────────────────────────────
    const scriptRes = await fetch(`${base}/_scripts`, { headers, agent } as any);
    const scriptJson = await scriptRes.json();
    scripts = (scriptJson.response?.scripts ?? []).map((s: any) => ({
      name: s.name,
      isFolder: s.isFolder ?? false,
    }));

  } finally {
    await client.logout();
  }

  // ── Step 4: OData $metadata (XML) ──────────────────────────────────────────
  odataTables = await fetchODataMetadata(conn);

  return { layouts, scripts, odataTables };
}

async function fetchODataMetadata(conn: any): Promise<ODataTable[]> {
  const odataBase = `https://${conn.host}:${conn.port}/fmi/odata/v4/${encodeURIComponent(conn.database)}`;
  const credentials = Buffer.from(`${conn.username}:${decrypt(conn.passwordEncrypted)}`).toString('base64');
  const agent = new https.Agent({ rejectUnauthorized: conn.sslVerify });

  try {
    const res = await fetch(`${odataBase}/$metadata`, {
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Accept': 'application/xml',
        'OData-Version': '4.0',
      },
      agent,
    } as any);

    if (!res.ok) return [];

    const xml = await res.text();
    return parseODataMetadataXml(xml);
  } catch {
    return []; // OData may not be enabled — non-fatal
  }
}

function parseODataMetadataXml(xml: string): ODataTable[] {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
  const parsed = parser.parse(xml);

  // Navigate: Edmx > DataServices > Schema > EntityType
  const schema = parsed?.['edmx:Edmx']?.['edmx:DataServices']?.['Schema'];
  if (!schema) return [];

  const entityTypes = Array.isArray(schema.EntityType)
    ? schema.EntityType
    : schema.EntityType ? [schema.EntityType] : [];

  return entityTypes.map((et: any) => ({
    name: et['@_Name'],
    fields: (Array.isArray(et.Property) ? et.Property : et.Property ? [et.Property] : []).map((p: any) => ({
      name: p['@_Name'],
      type: p['@_Type']?.replace('Edm.', '') ?? 'String',
    })),
  }));
}
```

---

## Phase 2: Browse Schema API Routes

**File**: `src/app/api/connections/[id]/browse-schema/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { fetchFullSchema } from '@/lib/filemaker/schema-browser';

export async function POST(_: Request, { params }: { params: { id: string } }) {
  try {
    const schema = await fetchFullSchema(params.id);

    // Save raw schema to BrowsedSchema
    await prisma.browsedSchema.upsert({
      where: { connectionId: params.id },
      create: {
        connectionId: params.id,
        rawLayouts: JSON.stringify(schema.layouts.map(l => l.name)),
        rawScripts: JSON.stringify(schema.scripts.filter(s => !s.isFolder).map(s => s.name)),
        rawLayoutMeta: JSON.stringify(Object.fromEntries(schema.layouts.map(l => [l.name, l]))),
        rawODataTables: JSON.stringify(schema.odataTables.map(t => t.name)),
        rawODataMeta: JSON.stringify(Object.fromEntries(schema.odataTables.map(t => [t.name, t]))),
        suggestedRelationships: '[]',
        selectedLayouts: '[]',
        selectedTables: '[]',
        selectedScripts: '[]',
        compiledSchema: '{}',
      },
      update: {
        rawLayouts: JSON.stringify(schema.layouts.map(l => l.name)),
        rawScripts: JSON.stringify(schema.scripts.filter(s => !s.isFolder).map(s => s.name)),
        rawLayoutMeta: JSON.stringify(Object.fromEntries(schema.layouts.map(l => [l.name, l]))),
        rawODataTables: JSON.stringify(schema.odataTables.map(t => t.name)),
        rawODataMeta: JSON.stringify(Object.fromEntries(schema.odataTables.map(t => [t.name, t]))),
        fetchedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        layoutCount: schema.layouts.length,
        scriptCount: schema.scripts.filter(s => !s.isFolder).length,
        odataTableCount: schema.odataTables.length,
        layouts: schema.layouts.map(l => ({ name: l.name, fieldCount: l.fields.length })),
        scripts: schema.scripts.filter(s => !s.isFolder).map(s => s.name),
        odataTables: schema.odataTables.map(t => ({ name: t.name, fieldCount: t.fields.length })),
      },
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message, code: 'SCHEMA_FETCH_FAILED' }, { status: 500 });
  }
}

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const bs = await prisma.browsedSchema.findUnique({ where: { connectionId: params.id } });
  if (!bs) return NextResponse.json({ success: false, error: 'Schema not browsed yet', code: 'NOT_FOUND' }, { status: 404 });

  return NextResponse.json({
    success: true,
    data: {
      layouts: JSON.parse(bs.rawLayouts),
      layoutMeta: JSON.parse(bs.rawLayoutMeta),
      scripts: JSON.parse(bs.rawScripts),
      odataTables: JSON.parse(bs.rawODataTables),
      odataMeta: JSON.parse(bs.rawODataMeta),
      suggestedRelationships: JSON.parse(bs.suggestedRelationships),
      selectedLayouts: JSON.parse(bs.selectedLayouts),
      selectedTables: JSON.parse(bs.selectedTables),
      selectedScripts: JSON.parse(bs.selectedScripts),
      fetchedAt: bs.fetchedAt,
    },
  });
}
```

---

## Phase 3: Save User Selections + Compile

**File**: `src/app/api/connections/[id]/schema/selections/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const SelectionSchema = z.object({
  selectedLayouts: z.array(z.string()),
  selectedTables: z.array(z.string()),
  selectedScripts: z.array(z.string()),
});

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const body = SelectionSchema.parse(await req.json());
  const bs = await prisma.browsedSchema.findUnique({ where: { connectionId: params.id } });
  if (!bs) return NextResponse.json({ success: false, error: 'Schema not fetched' }, { status: 404 });

  const layoutMeta = JSON.parse(bs.rawLayoutMeta);
  const odataMeta = JSON.parse(bs.rawODataMeta);
  const relationships = JSON.parse(bs.suggestedRelationships);

  // Compile selected schema for tool generator
  const compiledSchema = {
    layouts: body.selectedLayouts.map(name => layoutMeta[name] ?? { name, fields: [] }),
    tables: body.selectedTables.map(name => odataMeta[name] ?? { name, fields: [] }),
    scripts: body.selectedScripts,
    relationships: relationships.filter((r: any) =>
      body.selectedLayouts.includes(r.from) || body.selectedTables.includes(r.from)
    ),
  };

  await prisma.browsedSchema.update({
    where: { connectionId: params.id },
    data: {
      selectedLayouts: JSON.stringify(body.selectedLayouts),
      selectedTables: JSON.stringify(body.selectedTables),
      selectedScripts: JSON.stringify(body.selectedScripts),
      compiledSchema: JSON.stringify(compiledSchema),
    },
  });

  return NextResponse.json({ success: true, data: compiledSchema });
}
```

---

## Phase 4: Get Compiled Schema (for tool generator)

**File**: `src/app/api/connections/[id]/schema/compiled/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const bs = await prisma.browsedSchema.findUnique({ where: { connectionId: params.id } });
  if (!bs) return NextResponse.json({ success: false, error: 'No schema saved' }, { status: 404 });

  const compiled = JSON.parse(bs.compiledSchema);
  if (!compiled || Object.keys(compiled).length === 0) {
    return NextResponse.json({ success: false, error: 'Schema selections not saved yet', code: 'SCHEMA_INCOMPLETE' }, { status: 400 });
  }

  return NextResponse.json({ success: true, data: compiled });
}
```
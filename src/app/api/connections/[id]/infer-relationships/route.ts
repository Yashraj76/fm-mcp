import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { callAI } from '@/lib/ai/client';
import { INFER_RELATIONSHIPS_PROMPT } from '@/lib/ai/prompts/infer-relationships';
import { withAuth } from "@/lib/auth/api-guard";
import { safeParseJSON } from '@/lib/utils/safe-parse';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const POST = withAuth(async (req, { params, userId }) => {
    try {
    const { id } = params;

    // Verify connection ownership
    const conn = await prisma.fMConnection.findFirst({
      where: { id, userId }
    });
    if (!conn) {
      return NextResponse.json(
        { success: false, error: 'Connection not found', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    // Accept optional selectedLayouts from request body — allows app to pass
    // current UI selection without requiring a save first
    let bodyLayouts: string[] | null = null;
    try {
      const body = await req.json();
      if (Array.isArray(body?.selectedLayouts)) bodyLayouts = body.selectedLayouts;
    } catch { /* no body is fine */ }

    // Load the browsed schema selections for this connection
    const bs = await prisma.browsedSchema.findUnique({
      where: { connectionId: id },
    });

    if (!bs) {
      return NextResponse.json(
        { success: false, error: 'No schema found. Browse schema first.', code: 'SCHEMA_MISSING' },
        { status: 400 }
      );
    }

    // Prefer request-body layouts → fallback to DB-saved selection
    const selectedLayouts = (bodyLayouts ?? safeParseJSON<string[]>(bs.selectedLayouts, [])) || [];
    const layoutMeta = safeParseJSON(bs.rawLayoutMeta, {});

    if (selectedLayouts.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No layouts selected. Select layouts first.', code: 'NO_SELECTIONS' },
        { status: 400 }
      );
    }

    // Build input payload — only selected layouts with their fields + portals
    const inputPayload = {
      selectedLayouts: selectedLayouts.map((name: string) => {
        const meta = layoutMeta[name];
        if (!meta || !meta.fields?.length) {
          console.warn(`[infer-relationships] Layout "${name}" has no field metadata in rawLayoutMeta — ` +
            'expand it in the Schema Browser first so field data is persisted.');
        }
        return {
          name,
          fields: meta?.fields ?? [],
          portals: meta?.portals ?? [],
        };
      }),
    };

    // Call AI
    let parsed: any;
    try {
      const aiText = await callAI({
        systemPrompt: INFER_RELATIONSHIPS_PROMPT,
        userMessage: JSON.stringify(inputPayload, null, 2),
        maxOutputTokens: 8192,
      });
      
      let clean = aiText;
      const match = aiText.match(/\{[\s\S]*\}/);
      if (match) {
        clean = match[0];
      } else {
        clean = aiText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      }
      
      parsed = safeParseJSON(clean);
      if (!parsed) {
        console.error('[AI Parse Error] Raw text:', aiText);
        throw new Error(`Parse error: Invalid JSON structure. Raw output: ${aiText.substring(0, 100)}`);
      }
    } catch (err: any) {
      console.error('[Infer Relationships Error]', err);
      return NextResponse.json(
        { success: false, error: 'AI inference failed: ' + err.message, code: 'AI_FAILED' },
        { status: 500 }
      );
    }

    // Upsert relationship graph
    await prisma.relationshipGraph.upsert({
      where: { connectionId: id },
      create: {
        connectionId: id,
        relationships: JSON.stringify(parsed.relationships ?? []),
        generatedBy: 'ai',
      },
      update: {
        relationships: JSON.stringify(parsed.relationships ?? []),
        generatedBy: 'ai',
        generatedAt: new Date(),
      },
    });

    // Also update compiled schema with relationships and primary keys
    if (bs.compiledSchema) {
      const compiled = safeParseJSON(bs.compiledSchema, {});
      compiled.relationships = parsed.relationships ?? [];
      compiled.primaryKeys = parsed.primaryKeys ?? {};
      await prisma.browsedSchema.update({
        where: { connectionId: id },
        data: { compiledSchema: JSON.stringify(compiled) },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        relationships: parsed.relationships ?? [],
        primaryKeys: parsed.primaryKeys ?? {},
        notes: parsed.notes ?? null,
        count: (parsed.relationships ?? []).length,
      },
    });
    } catch (globalErr: any) {
    console.error('[Infer Relationships Global Error]', globalErr);
    return NextResponse.json(
      { success: false, error: 'Internal Server Error: ' + globalErr.message, code: 'SERVER_ERROR' },
      { status: 500 }
    );
    }
    });
export const GET = withAuth(async (_, { params, userId }) => {
    const { id } = params;

    // Verify connection ownership
    const conn = await prisma.fMConnection.findFirst({
      where: { id, userId }
    });
    if (!conn) {
      return NextResponse.json(
        { success: false, error: 'Connection not found', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    const rg = await prisma.relationshipGraph.findUnique({
      where: { connectionId: id },
    });
    if (!rg) {
      return NextResponse.json({ success: true, data: { relationships: [], primaryKeys: {} } });
    }
    return NextResponse.json({
      success: true,
      data: {
        relationships: safeParseJSON(rg.relationships, []),
        generatedBy: rg.generatedBy,
        generatedAt: rg.generatedAt,
      },
    });
  });

export const PUT = withAuth(async (req, { params, userId }) => {
    const { id } = params;

    // Verify connection ownership
    const conn = await prisma.fMConnection.findFirst({
      where: { id, userId }
    });
    if (!conn) {
      return NextResponse.json(
        { success: false, error: 'Connection not found', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    const { relationships, primaryKeys } = await req.json();
    await prisma.relationshipGraph.upsert({
      where: { connectionId: id },
      create: {
        connectionId: id,
        relationships: JSON.stringify(relationships),
        generatedBy: 'manual',
      },
      update: {
        relationships: JSON.stringify(relationships),
        generatedBy: 'manual',
        updatedAt: new Date(),
      },
    });

    // Sync back to compiledSchema
    const bs = await prisma.browsedSchema.findUnique({
      where: { connectionId: id }
    });
    if (bs?.compiledSchema) {
      const compiled = safeParseJSON(bs.compiledSchema, {});
      compiled.relationships = relationships;
      compiled.primaryKeys = primaryKeys ?? compiled.primaryKeys ?? {};
      await prisma.browsedSchema.update({
        where: { connectionId: id },
        data: { compiledSchema: JSON.stringify(compiled) },
      });
    }

    return NextResponse.json({ success: true, data: { updated: true } });
  });

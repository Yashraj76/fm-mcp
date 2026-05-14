import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { callAI } from '@/lib/ai/client';
import { INFER_RELATIONSHIPS_PROMPT } from '@/lib/ai/prompts/infer-relationships';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
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

    const selectedLayouts = JSON.parse(bs.selectedLayouts ?? '[]');
    const layoutMeta = JSON.parse(bs.rawLayoutMeta ?? '{}');

    if (selectedLayouts.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No layouts selected. Select layouts first.', code: 'NO_SELECTIONS' },
        { status: 400 }
      );
    }

    // Build input payload — only selected layouts with their fields + portals
    const inputPayload = {
      selectedLayouts: selectedLayouts.map((name: string) => {
        const meta = layoutMeta[name] ?? { name, fields: [], portals: [] };
        return {
          name,
          fields: meta.fields ?? [],
          portals: meta.portals ?? [],
        };
      }),
    };

    // Call AI
    let parsed: any;
    try {
      const aiText = await callAI({
        systemPrompt: INFER_RELATIONSHIPS_PROMPT,
        userMessage: JSON.stringify(inputPayload, null, 2),
        maxTokens: 8192,
      });
      
      let clean = aiText;
      const match = aiText.match(/\{[\s\S]*\}/);
      if (match) {
        clean = match[0];
      } else {
        clean = aiText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      }
      
      try {
        parsed = JSON.parse(clean);
      } catch (parseErr: any) {
        console.error('[AI Parse Error] Raw text:', aiText);
        throw new Error(`Parse error: ${parseErr.message}. Raw output: ${aiText.substring(0, 100)}`);
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
      const compiled = JSON.parse(bs.compiledSchema);
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
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rg = await prisma.relationshipGraph.findUnique({
    where: { connectionId: id },
  });
  if (!rg) {
    return NextResponse.json({ success: true, data: { relationships: [], primaryKeys: {} } });
  }
  return NextResponse.json({
    success: true,
    data: {
      relationships: JSON.parse(rg.relationships),
      generatedBy: rg.generatedBy,
      generatedAt: rg.generatedAt,
    },
  });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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
  const bs = await prisma.browsedSchema.findUnique({ where: { connectionId: id } });
  if (bs?.compiledSchema) {
    const compiled = JSON.parse(bs.compiledSchema);
    compiled.relationships = relationships;
    compiled.primaryKeys = primaryKeys ?? compiled.primaryKeys ?? {};
    await prisma.browsedSchema.update({
      where: { connectionId: id },
      data: { compiledSchema: JSON.stringify(compiled) },
    });
  }

  return NextResponse.json({ success: true, data: { updated: true } });
}

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'
import { callAI } from '@/lib/ai/client'
import { SUGGEST_TOOLS_PROMPT } from '@/lib/ai/prompts/suggest-tools'
import { withAuth } from "@/lib/auth/api-guard";
import { safeParseJSON } from '@/lib/utils/safe-parse';

const suggestSchema = z.object({
  branchId: z.string().optional(),
  connectionId: z.string().optional(),
  context: z.string().optional(),
  suggestionType: z.enum(['tool_suggestion', 'optimization', 'error_fix']).default('tool_suggestion'),
  layoutName: z.string().optional(),
  tableName: z.string().optional(),
})

// POST /api/servers/[id]/ai/suggest - Get AI-generated tool suggestions based on schema
export const POST = withAuth(async (request, { params, userId }) => {
    try {
    const { id } = params;
    const server = await db.mcpServer.findFirst({ 
      where: { id, userId },
      include: { 
        connections: { 
          where: { isActive: true },
          take: 1,
          include: { 
            connection: { 
              include: { 
                browsedSchema: true 
              } 
            } 
          } 
        } 
      }
    });

    if (!server) {
      return NextResponse.json({ success: false, error: 'Server not found' }, { status: 404 });
    }

    const body = await request.json();
    const parsed = suggestSchema.safeParse(body || {});

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // Load schema from connection
    const activeConnection = server.connections[0]?.connection;
    const bs = activeConnection?.browsedSchema;
    if (!bs || !bs.compiledSchema) {
      return NextResponse.json(
        { success: false, error: 'Schema not browsed or compiled. Please browse and save schema selections first.', code: 'SCHEMA_MISSING' },
        { status: 400 }
      );
    }

    const compiledSchema = safeParseJSON(bs.compiledSchema, {});

    // Call AI for suggestions
    const inputPayload = {
      layouts: (compiledSchema.layouts || []).map((l: any) => ({
        name: l.name,
        fields: l.fields?.map((f: any) => f.name) || [], // Simplify to names only
      })),
      relationships: compiledSchema.relationships || [],
      context: parsed.data.context,
      type: parsed.data.suggestionType
    };

    const aiText = await callAI({
      systemPrompt: SUGGEST_TOOLS_PROMPT,
      userMessage: JSON.stringify(inputPayload, null, 2),
      maxOutputTokens: 2500,
    });

    // Parse AI output defensively
    const clean = aiText
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();

    let aiParsed = safeParseJSON<{ suggestions: any[] }>(clean, { suggestions: [] });
    if (!aiParsed || !Array.isArray(aiParsed.suggestions)) {
      // Try mapping via matching brace just in case of conversational prefixes
      const match = clean.match(/\{[\s\S]*\}/);
      if (match) {
        aiParsed = safeParseJSON<{ suggestions: any[] }>(match[0], { suggestions: [] });
      }
    }

    const suggestions = aiParsed?.suggestions || [];

    // Save suggestions to database
    const savedSuggestions = await Promise.all(
      suggestions.map((suggestion) =>
        db.aiSuggestion.create({
          data: {
            serverId: id,
            branchId: parsed.data.branchId || null,
            schemaContext: bs.compiledSchema,
            suggestionType: parsed.data.suggestionType,
            title: suggestion.title as string,
            description: suggestion.description as string,
            proposedConfig: JSON.stringify(suggestion.proposedConfig),
            status: 'pending',
          },
        })
      )
    );

    return NextResponse.json({
      success: true,
      suggestions: savedSuggestions.map((s) => ({
        id: s.id,
        title: s.title,
        description: s.description,
        suggestionType: s.suggestionType,
        proposedConfig: safeParseJSON(s.proposedConfig),
        status: s.status,
        createdAt: s.createdAt,
      })),
      generatedAt: new Date().toISOString(),
    });
    } catch (error: any) {
    console.error('Error generating suggestions:', error)
    return NextResponse.json({ success: false, error: 'Failed to generate suggestions: ' + error.message }, { status: 500 })
    }
    });

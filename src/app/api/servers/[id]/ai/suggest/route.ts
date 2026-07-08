import { apiNotFound, apiError, apiServerError, apiValidationFailed } from '@/lib/utils/api-response'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'
import { callAI } from '@/lib/ai/client'
import { SUGGEST_TOOLS_PROMPT } from '@/lib/ai/prompts/suggest-tools'
import { resolveGenerationConnection } from '@/lib/tools/resolve-generation-connection'
import { withAuth } from "@/lib/auth/api-guard";
import { safeParseJSON } from '@/lib/utils/safe-parse';
import { normalizeTool } from '@/lib/tools/normalize-tool';
import { logger } from '@/lib/logger'

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
          include: {
            connection: {
              include: { browsedSchema: true }
            }
          }
        }
      }
    });

    if (!server) {
      return apiNotFound('Server not found');
    }

    const body = await request.json();
    const parsed = suggestSchema.safeParse(body || {});

    if (!parsed.success) {
      return apiValidationFailed(parsed.error.issues);
    }

    // Resolve which connection to use — enforces explicit selection for multi-connection servers.
    const connResult = resolveGenerationConnection(parsed.data.connectionId, server.connections as any);
    if (!connResult.ok) {
      if (connResult.reason === 'no-connections') {
        return apiError('No connections are linked to this server. Attach a FileMaker database first.', 'NO_CONNECTIONS', 400);
      }
      if (connResult.reason === 'connection-required') {
        return apiError(
          'This server has multiple connections. Select which one to generate suggestions from.',
          'CONNECTION_REQUIRED',
          400,
          { connections: connResult.connections }
        );
      }
      return apiError('The selected connection is not linked to this server.', 'INVALID_CONNECTION', 400);
    }

    const resolvedConnectionId = connResult.connectionId;
    const resolvedConnServer = server.connections.find((c: any) => c.connectionId === resolvedConnectionId);
    const activeConnection = resolvedConnServer?.connection;
    const bs = activeConnection?.browsedSchema;
    if (!bs || !bs.compiledSchema) {
      return apiError('Schema not browsed or compiled. Please browse and save schema selections first.', 'SCHEMA_MISSING', 400);
    }

    const compiledSchema = safeParseJSON<Record<string, any>>(bs.compiledSchema, {});

    // Call AI for suggestions
    const inputPayload = {
      connectionId: resolvedConnectionId,
      layouts: (compiledSchema.layouts || []).map((l: any) => ({
        name: l.name,
        fields: l.fields?.map((f: any) => f.name) || [],
      })),
      relationships: compiledSchema.relationships || [],
      context: parsed.data.context,
      type: parsed.data.suggestionType
    };

    const aiText = await callAI({
      systemPrompt: SUGGEST_TOOLS_PROMPT,
      userMessage: JSON.stringify(inputPayload, null, 2),
      maxOutputTokens: 2500,
      userId,
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
      suggestions.map((suggestion) => {
        // Normalise the proposedConfig so the dialog opens with all fields pre-filled
        const rawConfig = suggestion.proposedConfig ?? {}
        const normalized = normalizeTool({ ...rawConfig, isAiGenerated: true })
        const hc = safeParseJSON<Record<string, any>>(normalized.handlerConfig, {})
        const normalizedConfig = {
          ...rawConfig,
          name: normalized.name,
          description: normalized.description,
          category: normalized.category,
          fmMethod: normalized.fmMethod,
          fmLayout: normalized.fmLayout,
          fmScript: normalized.fmScript,
          isEnabled: normalized.isEnabled,
          isAiGenerated: true,
          inputSchema: safeParseJSON<Record<string, any>>(normalized.inputSchema, {}),
          outputSchema: safeParseJSON<Record<string, any>>(normalized.outputSchema, {}),
          // Ensure connectionId is present — use AI's value if set, else resolved
          handlerConfig: { ...hc, connectionId: hc.connectionId || resolvedConnectionId },
        }
        return db.aiSuggestion.create({
          data: {
            serverId: id,
            branchId: parsed.data.branchId || null,
            schemaContext: bs.compiledSchema,
            suggestionType: parsed.data.suggestionType,
            title: suggestion.title as string,
            description: suggestion.description as string,
            proposedConfig: JSON.stringify(normalizedConfig),
            status: 'pending',
          },
        })
      })
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
    logger.error({ err: error }, 'Error generating suggestions:')
    return apiServerError('Failed to generate suggestions')
  }
})

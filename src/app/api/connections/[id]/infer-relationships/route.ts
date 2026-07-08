import { apiSuccess, apiNotFound, apiError, apiServerError, apiValidationFailed } from '@/lib/utils/api-response';
import { z, ZodError } from 'zod';
import { prisma } from '@/lib/prisma';
import { callAI } from '@/lib/ai/client';
import { withAuth } from "@/lib/auth/api-guard";
import { safeParseJSON } from '@/lib/utils/safe-parse';
import { getAppSettings } from '@/lib/settings';
import { inferRelationships } from '@/lib/ai/infer-relationships-service';
import { logger } from '@/lib/logger'

export const runtime = 'nodejs';
export const maxDuration = 300;

export const POST = withAuth(async (req, { params, userId }) => {
  try {
    const { id } = params;

    const conn = await prisma.fMConnection.findFirst({ where: { id, userId } });
    if (!conn) return apiNotFound('Connection not found');

    // Accept optional selectedLayouts from request body — allows the UI to pass
    // the current selection without requiring a save first.
    let bodyLayouts: string[] | null = null;
    try {
      const body = await req.json();
      if (Array.isArray(body?.selectedLayouts)) bodyLayouts = body.selectedLayouts;
    } catch { /* no body is fine */ }

    const bs = await prisma.browsedSchema.findUnique({ where: { connectionId: id } });
    if (!bs) return apiError('No schema found. Browse schema first.', 'SCHEMA_MISSING', 400);

    const selectedLayouts = (bodyLayouts ?? safeParseJSON<string[]>(bs.selectedLayouts, [])) || [];
    const layoutMeta = safeParseJSON<Record<string, any>>(bs.rawLayoutMeta, {});

    if (selectedLayouts.length === 0) {
      return apiError('No layouts selected. Select layouts first.', 'NO_SELECTIONS', 400);
    }

    // Validate that enough layouts have field data before calling any AI.
    const layoutsWithData = selectedLayouts.filter((name: string) => {
      const meta = layoutMeta[name];
      return meta && (meta.fields?.length > 0 || meta.portals?.length > 0);
    });
    const skippedLayouts = selectedLayouts.filter(
      (name: string) => !layoutsWithData.includes(name)
    );

    if (skippedLayouts.length > 0) {
      logger.warn({ count: skippedLayouts.length, layouts: skippedLayouts }, '[infer-relationships] skipping layouts with no field data')
    }

    if (layoutsWithData.length === 0) {
      return apiError(
        'No layout fields are loaded. Open Schema Browser, expand each layout to load its fields, then retry relationship inference.',
        'FIELDS_NOT_LOADED',
        400
      );
    }

    if (layoutsWithData.length < 2) {
      return apiError(
        `Only 1 of ${selectedLayouts.length} selected layout(s) has field data. ` +
        `Expand at least 2 layouts in Schema Browser to detect relationships between them.`,
        'INSUFFICIENT_LAYOUTS',
        400
      );
    }

    // Provide callAI only when AI is configured — service degrades to rule-based
    // automatically when no caller is supplied.
    const settings = await getAppSettings(userId);
    const isAiEnabled = !!(settings?.aiApiKeyEncrypted || settings?.aiProvider === 'ollama');
    const callAIFn = isAiEnabled ? callAI : undefined;

    const result = await inferRelationships(selectedLayouts, layoutMeta, userId, callAIFn);

    // Persist to RelationshipGraph
    await prisma.relationshipGraph.upsert({
      where: { connectionId: id },
      create: {
        connectionId: id,
        relationships: JSON.stringify(result.relationships),
        generatedBy: 'ai',
      },
      update: {
        relationships: JSON.stringify(result.relationships),
        generatedBy: 'ai',
        generatedAt: new Date(),
      },
    });

    // Sync primaryKeys and relationships back into compiledSchema
    if (bs.compiledSchema) {
      const compiled = safeParseJSON<Record<string, any>>(bs.compiledSchema, {});
      compiled.relationships = result.relationships;
      compiled.primaryKeys = result.primaryKeys;
      await prisma.browsedSchema.update({
        where: { connectionId: id },
        data: { compiledSchema: JSON.stringify(compiled) },
      });
    }

    return apiSuccess({
      relationships: result.relationships,
      primaryKeys: result.primaryKeys,
      notes: result.notes,
      count: result.relationships.length,
      ...(result.skippedLayouts.length > 0 ? { skippedLayouts: result.skippedLayouts } : {}),
    });
  } catch (globalErr: any) {
    logger.error({ err: globalErr }, '[Infer Relationships Global Error]');
    return apiServerError('Internal Server Error: ' + globalErr.message);
  }
});

export const GET = withAuth(async (_, { params, userId }) => {
  try {
    const { id } = params;

    const conn = await prisma.fMConnection.findFirst({ where: { id, userId } });
    if (!conn) return apiNotFound('Connection not found');

    const rg = await prisma.relationshipGraph.findUnique({ where: { connectionId: id } });
    if (!rg) return apiSuccess({ relationships: [], primaryKeys: {} });

    return apiSuccess({
      relationships: safeParseJSON<any[]>(rg.relationships, []),
      generatedBy: rg.generatedBy,
      generatedAt: rg.generatedAt,
    });
  } catch (error: any) {
    logger.error({ err: error }, '[Infer Relationships GET Error]');
    return apiServerError('Failed to get relationships');
  }
});

const putSchema = z.object({
  relationships: z.array(z.any()),
  primaryKeys: z.record(z.string(), z.any()).optional(),
});

export const PUT = withAuth(async (req, { params, userId }) => {
  try {
    const { id } = params;

    const conn = await prisma.fMConnection.findFirst({ where: { id, userId } });
    if (!conn) return apiNotFound('Connection not found');

    const bodyObj = await req.json().catch(() => ({}));
    const { relationships, primaryKeys } = putSchema.parse(bodyObj);

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
      const compiled = safeParseJSON<Record<string, any>>(bs.compiledSchema, {});
      compiled.relationships = relationships;
      compiled.primaryKeys = primaryKeys ?? compiled.primaryKeys ?? {};
      await prisma.browsedSchema.update({
        where: { connectionId: id },
        data: { compiledSchema: JSON.stringify(compiled) },
      });
    }

    return apiSuccess({ updated: true });
  } catch (error: any) {
    if (error instanceof ZodError) return apiValidationFailed(error.issues);
    logger.error({ err: error }, '[Infer Relationships PUT Error]');
    return apiServerError('Failed to save relationships');
  }
});

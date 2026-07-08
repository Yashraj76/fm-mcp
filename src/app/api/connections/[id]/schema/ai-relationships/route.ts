import { apiSuccess, apiNotFound, apiServerError } from '@/lib/utils/api-response';
import { db } from '@/lib/db';
import { withAuth } from "@/lib/auth/api-guard";
import { getAppSettings } from '@/lib/settings';
import { callAI } from '@/lib/ai/client';
import { safeParseJSON } from '@/lib/utils/safe-parse';
import { inferRelationships } from '@/lib/ai/infer-relationships-service';
import { logger } from '@/lib/logger'

/**
 * POST /api/connections/[id]/schema/ai-relationships
 *
 * Secondary relationship inference endpoint — delegates to the same
 * `inferRelationships` service used by `/api/connections/[id]/infer-relationships`.
 * Both routes return an identical response shape and persist to the same
 * `RelationshipGraph` record.
 *
 * The difference from the primary endpoint is its selection fallback:
 * body → saved selection → all available layouts (more lenient).  The primary
 * endpoint requires a selection and enforces a minimum of 2 layouts with data.
 */
export const POST = withAuth(async (req, { params, userId }) => {
  try {
    const { id } = params;

    const conn = await db.fMConnection.findFirst({ where: { id, userId } });
    if (!conn) return apiNotFound('Connection not found');

    let body: any = {};
    try { body = await req.json() } catch { /* no body is fine */ }

    const browsedSchema = await db.browsedSchema.findUnique({ where: { connectionId: id } });
    if (!browsedSchema) return apiNotFound('Schema not browsed yet. Run browse-schema first.');

    const layoutMeta = safeParseJSON<Record<string, any>>(browsedSchema.rawLayoutMeta, {});

    // Fallback: body → saved selection → all available layouts
    const selectedLayouts: string[] =
      body.selectedLayouts
      ?? (browsedSchema.selectedLayouts
          ? safeParseJSON<string[]>(browsedSchema.selectedLayouts, null)
          : null)
      ?? Object.keys(layoutMeta);

    const settings = await getAppSettings(userId);
    const isAiEnabled = !!(settings?.aiApiKeyEncrypted || settings?.aiProvider === 'ollama');
    const callAIFn = isAiEnabled ? callAI : undefined;

    const result = await inferRelationships(selectedLayouts, layoutMeta, userId, callAIFn);

    // Persist to the canonical RelationshipGraph store
    await db.relationshipGraph.upsert({
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
    if (browsedSchema.compiledSchema) {
      const compiled = safeParseJSON<Record<string, any>>(browsedSchema.compiledSchema, {});
      compiled.relationships = result.relationships;
      compiled.primaryKeys = result.primaryKeys;
      await db.browsedSchema.update({
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
  } catch (e: any) {
    logger.error({ err: e }, '[ai-relationships POST]');
    return apiServerError(e.message || 'Relationship inference failed');
  }
});

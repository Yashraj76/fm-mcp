import { apiSuccess, apiNotFound, apiServerError, apiValidationFailed } from '@/lib/utils/api-response'
import { db } from '@/lib/db'
import { z, ZodError } from 'zod'
import { withAuth } from "@/lib/auth/api-guard";
import { safeParseJSON } from '@/lib/utils/safe-parse';
import { validateSchemaSelections } from '@/lib/schema/validate-schema-selections';
import { logger } from '@/lib/logger'

const selectionsSchema = z.object({
  selectedLayouts: z.array(z.string()),
  selectedTables: z.array(z.string()).default([]),
  selectedScripts: z.array(z.string()).default([]),
  selectedFields: z.record(z.string(), z.array(z.string())).optional().default({}),
  relationships: z.array(z.object({
    from: z.string(),
    to: z.string(),
    key: z.string(),
    confidence: z.enum(['high', 'medium', 'low']),
    reason: z.string()
  })).optional().default([]),
})

export const PUT = withAuth(async (req, { params, userId }) => {
  try {
    const { id } = params

    // Verify connection ownership
    const conn = await db.fMConnection.findFirst({
      where: { id, userId }
    });
    if (!conn) {
      return apiNotFound('Connection not found')
    }

    const browsedSchema = await db.browsedSchema.findUnique({
      where: { connectionId: id }
    })
    if (!browsedSchema) {
      return apiNotFound('Schema not browsed yet')
    }

    const body = await req.json()
    const parsed = selectionsSchema.parse(body)

    // Validate: at least one layout or table, and all selected tables exist in fetched metadata
    const availableODataTables = safeParseJSON<string[]>(browsedSchema.rawODataTables, [])
    const selectionValidation = validateSchemaSelections(
      parsed.selectedLayouts,
      parsed.selectedTables,
      availableODataTables,
    )
    if (!selectionValidation.valid) {
      return apiValidationFailed(
        selectionValidation.errors.map(e => ({
          code: e.code,
          message: e.message,
          path: [e.field],
          ...(e.invalidNames ? { invalidNames: e.invalidNames } : {}),
        })),
      )
    }

    const layoutMeta = safeParseJSON<Record<string, any>>(browsedSchema.rawLayoutMeta, {})
    const odataMeta = safeParseJSON<Record<string, any>>(browsedSchema.rawODataMeta, {})

    // Build compiledSchema from selections. `[]` is truthy in JS, so `||`
    // can't be used here — an empty selectedFields[name] (nothing narrowed
    // yet, not a deliberate "zero fields" choice) must still fall through to
    // the fetched layoutMeta, or it permanently locks in an empty field list
    // that a later re-save can never heal even once metadata exists.
    const compiledLayouts = parsed.selectedLayouts.map((name) => ({
      name,
      fields: parsed.selectedFields[name]?.length ? parsed.selectedFields[name] : (layoutMeta[name]?.fields || []),
      portals: layoutMeta[name]?.portals || [],
      valueLists: layoutMeta[name]?.valueLists || [],
    }))

    const compiledTables = parsed.selectedTables.map((name) => ({
      name,
      fields: odataMeta[name]?.fields || [],
    }))

    // Only include relationships where both sides are in selected layouts/tables
    const selectedSet = new Set([...parsed.selectedLayouts, ...parsed.selectedTables])
    const compiledRelationships = parsed.relationships.filter(
      (r: any) => selectedSet.has(r.from) && selectedSet.has(r.to)
    )

    const compiledSchema = {
      layouts: compiledLayouts,
      tables: compiledTables,
      scripts: parsed.selectedScripts,
      relationships: compiledRelationships,
    }

    const updated = await db.browsedSchema.update({
      where: { connectionId: id },
      data: {
        selectedLayouts: JSON.stringify(parsed.selectedLayouts),
        selectedTables: JSON.stringify(parsed.selectedTables),
        selectedScripts: JSON.stringify(parsed.selectedScripts),
        compiledSchema: JSON.stringify(compiledSchema),
      },
    })

    return apiSuccess({ compiledSchema, updatedAt: updated.updatedAt })
  } catch (e: any) {
    if (e instanceof ZodError) {
      return apiValidationFailed(e.issues)
    }
    logger.error({ err: e }, '[schema/selections PUT]')
    return apiServerError('Internal server error')
  }
})

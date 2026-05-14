import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z, ZodError } from 'zod'

type Params = { params: Promise<{ id: string }> }

const selectionsSchema = z.object({
  selectedLayouts: z.array(z.string()),
  selectedTables: z.array(z.string()).default([]),
  selectedScripts: z.array(z.string()).default([]),
  selectedFields: z.record(z.array(z.string())).optional().default({}),
  relationships: z.array(z.object({
    from: z.string(),
    to: z.string(),
    key: z.string(),
    confidence: z.enum(['high', 'medium', 'low']),
    reason: z.string()
  })).optional().default([]),
})

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const browsedSchema = await db.browsedSchema.findUnique({ where: { connectionId: id } })
    if (!browsedSchema) {
      return NextResponse.json({ success: false, error: 'Schema not browsed yet', code: 'NOT_FOUND' }, { status: 404 })
    }

    const body = await req.json()
    const parsed = selectionsSchema.parse(body)

    const layoutMeta = JSON.parse(browsedSchema.rawLayoutMeta)
    const odataMeta = JSON.parse(browsedSchema.rawODataMeta)
    const suggestedRels = JSON.parse(browsedSchema.suggestedRelationships)

    // Build compiledSchema from selections
    const compiledLayouts = parsed.selectedLayouts.map((name) => ({
      name,
      fields: parsed.selectedFields[name] || layoutMeta[name]?.fields || [],
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

    return NextResponse.json({ success: true, data: { compiledSchema, updatedAt: updated.updatedAt } })
  } catch (e: any) {
    if (e instanceof ZodError) {
      return NextResponse.json({ success: false, error: 'Validation failed', code: 'VALIDATION_ERROR', details: e.errors }, { status: 400 })
    }
    console.error('[schema/selections PUT]', e)
    return NextResponse.json({ success: false, error: 'Internal server error', code: 'SERVER_ERROR' }, { status: 500 })
  }
}

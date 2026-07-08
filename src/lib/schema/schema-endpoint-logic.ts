import { safeParseJSON } from '@/lib/utils/safe-parse'

/**
 * Pure business logic shared by the schema read endpoints.
 *
 * Both GET /api/connections/[id]/schema and GET /api/connections/[id]/schema/compiled
 * read from the same BrowsedSchema row.  Extracting the logic here keeps the
 * route handlers thin and makes the responsibilities testable without Next.js.
 *
 * Endpoint responsibilities:
 *
 *   POST /browse-schema   — Live fetch from FileMaker + OData; persists to BrowsedSchema.
 *                           The only endpoint that triggers a network call to FileMaker.
 *
 *   GET  /schema          — Returns the raw result of the last browse (layouts, scripts,
 *                           OData tables, layout field metadata).  Read-only; never calls
 *                           FileMaker.  Use this to display "what was browsed" without
 *                           paying the cost of another live round-trip.
 *
 *   GET  /schema/compiled — Returns the user's saved selections (chosen layouts/tables/
 *                           scripts) and the compiled schema used by tool generation and
 *                           AI features.  Injects connectionId so multi-connection tools
 *                           know which connection each layout belongs to.  Read-only.
 */

export class SchemaEndpointError extends Error {
  code: 'NOT_BROWSED_YET' | 'SCHEMA_NOT_SAVED'
  httpStatus: 404

  constructor(code: 'NOT_BROWSED_YET' | 'SCHEMA_NOT_SAVED', message: string) {
    super(message)
    this.name = 'SchemaEndpointError'
    this.code = code
    this.httpStatus = 404
  }
}

export interface BrowsedSchemaRow {
  rawLayouts: string
  rawScripts: string
  rawODataTables: string
  rawLayoutMeta: string
  rawODataMeta: string
  compiledSchema: string
  selectedLayouts: string
  selectedTables: string
  selectedScripts: string
  fetchedAt: Date
  updatedAt: Date
}

export interface BrowsedSchemaPayload {
  layouts: string[]
  scripts: string[]
  odataTables: string[]
  layoutMeta: Record<string, { fields: string[]; portals: string[]; valueLists?: any[] }>
  odataMeta: Record<string, any>
  fetchedAt: Date
  updatedAt: Date
}

export interface CompiledSchemaPayload {
  compiledSchema: Record<string, any>
  selectedLayouts: string[]
  selectedTables: string[]
  selectedScripts: string[]
  fetchedAt: Date
  updatedAt: Date
}

/**
 * Build the payload for GET /api/connections/[id]/schema.
 *
 * Throws SchemaEndpointError(NOT_BROWSED_YET) if the connection has never been browsed.
 */
export function buildBrowsedSchemaPayload(bs: BrowsedSchemaRow | null): BrowsedSchemaPayload {
  if (!bs) {
    throw new SchemaEndpointError(
      'NOT_BROWSED_YET',
      'Schema not browsed yet. Click "Browse Schema" to fetch layouts and tables from FileMaker.',
    )
  }

  return {
    layouts: safeParseJSON<string[]>(bs.rawLayouts, []),
    scripts: safeParseJSON<string[]>(bs.rawScripts, []),
    odataTables: safeParseJSON<string[]>(bs.rawODataTables, []),
    layoutMeta: safeParseJSON<Record<string, any>>(bs.rawLayoutMeta, {}),
    odataMeta: safeParseJSON<Record<string, any>>(bs.rawODataMeta, {}),
    fetchedAt: bs.fetchedAt,
    updatedAt: bs.updatedAt,
  }
}

/**
 * Build the payload for GET /api/connections/[id]/schema/compiled.
 *
 * Throws SchemaEndpointError(NOT_BROWSED_YET) if the connection has never been browsed.
 * Throws SchemaEndpointError(SCHEMA_NOT_SAVED) if browse happened but no selections saved.
 *
 * Injects `connectionId` into every layout and table entry so multi-connection tools
 * know which FileMaker connection each layout belongs to.
 */
export function buildCompiledSchemaPayload(
  bs: BrowsedSchemaRow | null,
  connectionId: string,
): CompiledSchemaPayload {
  if (!bs) {
    throw new SchemaEndpointError(
      'NOT_BROWSED_YET',
      'Schema not browsed yet. Click "Browse Schema" on the connection to get started.',
    )
  }

  const compiledSchema = safeParseJSON<Record<string, any>>(bs.compiledSchema, {})

  if (!compiledSchema?.layouts?.length && !compiledSchema?.tables?.length) {
    throw new SchemaEndpointError(
      'SCHEMA_NOT_SAVED',
      'No schema selections saved yet. Open Schema Browser, select layouts/tables, then save.',
    )
  }

  // Inject connectionId so callers can route back to the right FileMaker connection.
  if (Array.isArray(compiledSchema.layouts)) {
    compiledSchema.layouts = compiledSchema.layouts.map((l: any) => ({ ...l, connectionId }))
  }
  if (Array.isArray(compiledSchema.tables)) {
    compiledSchema.tables = compiledSchema.tables.map((t: any) => ({ ...t, connectionId }))
  }

  return {
    compiledSchema,
    selectedLayouts: safeParseJSON<string[]>(bs.selectedLayouts, []),
    selectedTables: safeParseJSON<string[]>(bs.selectedTables, []),
    selectedScripts: safeParseJSON<string[]>(bs.selectedScripts, []),
    fetchedAt: bs.fetchedAt,
    updatedAt: bs.updatedAt,
  }
}

import { db } from '../db'

// Fields whose change means all cached schema data for a connection is stale.
// Purely cosmetic fields (e.g. name) are NOT included.
export const SCHEMA_AFFECTING_FIELDS = new Set([
  'host',
  'port',
  'database',
  'username',
  'password',
  'authType',
  'clientId',
  'clientSecret',
  'sslVerify',
])

/**
 * Return true when a connection update payload contains at least one field
 * that would make the existing schema cache stale.
 */
export function connectionUpdateAffectsSchema(update: Record<string, unknown>): boolean {
  return Object.keys(update).some(
    (k) => SCHEMA_AFFECTING_FIELDS.has(k) && update[k] !== undefined,
  )
}

/**
 * Delete all schema-related caches for a connection.
 *
 * Pass a Prisma transaction client `tx` when calling from within
 * `db.$transaction(async (tx) => { ... })` so the deletion is atomic
 * with the connection update.
 */
export async function invalidateConnectionSchemaCache(
  connectionId: string,
  tx?: any,
): Promise<{ browsedSchema: number; schemaCache: number; relationshipGraph: number }> {
  const client: typeof db = tx ?? db

  const [browsedSchema, schemaCache, relationshipGraph] = await Promise.all([
    client.browsedSchema.deleteMany({ where: { connectionId } }),
    client.fMSchemaCache.deleteMany({ where: { connectionId } }),
    client.relationshipGraph.deleteMany({ where: { connectionId } }),
  ])

  return {
    browsedSchema: browsedSchema.count,
    schemaCache: schemaCache.count,
    relationshipGraph: relationshipGraph.count,
  }
}

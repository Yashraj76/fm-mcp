import { db } from '../db'
import { safeParseJSON } from '../utils/safe-parse'

export interface LayoutMetaEntry {
  fields: string[]
  portals: string[]
  portalDetails: { table: string; fields: { name: string; type: string }[] }[]
}

/**
 * Merge a fetched layout's metadata into BrowsedSchema.rawLayoutMeta.
 *
 * Safe to call with a Prisma transaction client `tx` so the write can be
 * included in a larger transaction; falls back to the global `db` instance.
 *
 * Returns `true` when the record was updated, `false` when no BrowsedSchema
 * row exists for the connection (cache was never seeded — nothing to update).
 */
export async function persistLayoutMeta(
  connectionId: string,
  layout: string,
  entry: LayoutMetaEntry,
  tx?: any,
): Promise<boolean> {
  const client: typeof db = tx ?? db

  const bs = await client.browsedSchema.findUnique({ where: { connectionId } })
  if (!bs) return false

  const existing = safeParseJSON<Record<string, LayoutMetaEntry>>(bs.rawLayoutMeta, {})
  existing[layout] = entry

  await client.browsedSchema.update({
    where: { connectionId },
    data: { rawLayoutMeta: JSON.stringify(existing) },
  })

  return true
}

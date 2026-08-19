import { XMLParser } from 'fast-xml-parser'
import { Agent } from 'undici'
import { decrypt } from '../crypto'
import { logger } from '../logger'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ODataFieldMeta {
  name: string
  type: string
}

/**
 * Keyed by entity/table name. This is what gets stored in BrowsedSchema.rawODataMeta
 * and consumed by the selections route to build compiledSchema.tables[n].fields.
 */
export type ODataEntityMeta = Record<string, { fields: ODataFieldMeta[] }>

export type ODataMetaStatus =
  | 'ok'           // $metadata fetched and parsed successfully
  | 'timeout'      // fetch timed out (large database)
  | 'not_available'// OData not enabled on this server (404/501) or other network error
  | 'parse_error'  // fetched but XML was malformed or unrecognisable
  | 'auth_error'   // 401/403
  | 'empty'        // fetched and parsed but no entity types found

export interface ODataMetaResult {
  meta: ODataEntityMeta
  status: ODataMetaStatus
  message?: string
}

// ── XML helpers ───────────────────────────────────────────────────────────────

function toArray<T>(v: T | T[] | undefined | null): T[] {
  if (v == null) return []
  return Array.isArray(v) ? v : [v]
}

// ── Pure parser (no I/O, fully testable) ─────────────────────────────────────

/**
 * Parse an OData CSDL $metadata XML document into a keyed entity→fields map.
 *
 * Handles:
 *  - Namespace prefixes (edmx:Edmx → Edmx) via removeNSPrefix
 *  - Single vs multiple EntityType elements (fast-xml-parser collapses singletons)
 *  - Single vs multiple Property elements
 *  - Multiple Schema blocks inside DataServices
 *
 * Throws on malformed XML or missing root structure.
 */
export function parseODataCsdl(xml: string): ODataEntityMeta {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    removeNSPrefix: true,
    // Force known collection tags to always be arrays even when there is only one element
    isArray: (tagName: string) =>
      ['EntityType', 'Property', 'EntitySet', 'PropertyRef', 'NavigationProperty', 'Schema'].includes(tagName),
  })

  let doc: any
  try {
    doc = parser.parse(xml)
  } catch (e: any) {
    throw new Error(`Failed to parse CSDL XML: ${e.message}`)
  }

  // Navigate: Edmx → DataServices → Schema[]
  const edmx = doc?.Edmx
  if (!edmx) {
    throw new Error('No Edmx root element found in CSDL XML')
  }

  const dataServices = edmx?.DataServices
  if (!dataServices) {
    throw new Error('No DataServices element found in CSDL XML')
  }

  // Schema can be a single object or an array (multiple namespaces in one $metadata doc)
  const schemas = toArray<any>(dataServices.Schema)
  if (schemas.length === 0) {
    throw new Error('No Schema elements found in CSDL XML')
  }

  const result: ODataEntityMeta = {}

  for (const schema of schemas) {
    // EntityType is forced to array via isArray above; still defend with toArray
    const entityTypes = toArray<any>(schema.EntityType)

    for (const et of entityTypes) {
      const entityName: string | undefined = et['@_Name']
      if (!entityName) continue

      const properties = toArray<any>(et.Property)

      result[entityName] = {
        fields: properties
          .filter((p: any) => Boolean(p['@_Name']))
          .map((p: any) => ({
            name: p['@_Name'] as string,
            type: (p['@_Type'] as string | undefined) ?? 'Edm.String',
          })),
      }
    }
  }

  return result
}

// ── Network fetcher ───────────────────────────────────────────────────────────

export interface ODataConnectionConfig {
  host: string
  port: number | null
  database: string
  username: string
  password: string   // stored encrypted; decrypted inside this function
  sslVerify: boolean
}

/**
 * Fetch and parse OData $metadata for a FileMaker connection.
 *
 * Always resolves — never rejects. Returns a status code so callers can
 * surface an appropriate message to the user without crashing the browse-schema flow.
 *
 * @param timeoutMs  How long to wait for the $metadata response (default 20 s).
 *                   Large FileMaker databases can produce multi-MB XML.
 */
export async function fetchODataMetadata(
  connection: ODataConnectionConfig,
  timeoutMs = 20_000,
): Promise<ODataMetaResult> {
  const host = connection.host.startsWith('http') ? connection.host : `https://${connection.host}`
  const port = connection.port ? `:${connection.port}` : ''
  const dbName = encodeURIComponent(connection.database)
  const url = `${host}${port}/fmi/odata/v4/${dbName}/$metadata`

  let password: string | null
  try {
    password = decrypt(connection.password)
  } catch (e: any) {
    return {
      meta: {},
      status: 'auth_error',
      message: 'Failed to decrypt connection credentials',
    }
  }

  if (!password) {
    return {
      meta: {},
      status: 'auth_error',
      message: 'Connection credentials could not be decrypted',
    }
  }

  const credentials = Buffer.from(`${connection.username}:${password}`).toString('base64')
  const dispatcher = new Agent({ connect: { rejectUnauthorized: connection.sslVerify } })

  let res: Response
  try {
    res = await fetch(url, {
      headers: {
        Authorization: `Basic ${credentials}`,
        Accept: 'application/xml,text/xml',
      },
      // undici-specific options must go through `as any` to satisfy TypeScript
      ...(({ dispatcher, signal: AbortSignal.timeout(timeoutMs) } as any)),
    })
  } catch (e: any) {
    await dispatcher.destroy().catch(() => {}) // release the one-shot Agent on fetch failure
    // AbortSignal timeout fires as an AbortError/TimeoutError
    const isTimeout =
      e?.name === 'TimeoutError' ||
      e?.name === 'AbortError' ||
      e?.code === 'UND_ERR_CONNECT_TIMEOUT' ||
      String(e?.message).toLowerCase().includes('timed out') ||
      String(e?.message).toLowerCase().includes('abort')

    if (isTimeout) {
      logger.warn({ timeoutMs, database: connection.database }, '[odata-metadata] $metadata timed out')
      return {
        meta: {},
        status: 'timeout',
        message: `$metadata request timed out after ${timeoutMs / 1000}s. The database may be very large.`,
      }
    }

    logger.warn({ errMsg: e.message }, '[odata-metadata] $metadata fetch error')
    return { meta: {}, status: 'not_available', message: e.message }
  }

  if (!res.ok) {
    await dispatcher.destroy().catch(() => {}) // error paths below don't read the body
    if (res.status === 401 || res.status === 403) {
      return { meta: {}, status: 'auth_error', message: `HTTP ${res.status} — check FileMaker credentials` }
    }
    if (res.status === 404 || res.status === 501) {
      logger.warn({ status: res.status }, '[odata-metadata] OData not available on this server')
      return { meta: {}, status: 'not_available', message: `OData not enabled on this server (HTTP ${res.status})` }
    }
    logger.warn({ status: res.status }, '[odata-metadata] unexpected HTTP status from $metadata')
    return { meta: {}, status: 'not_available', message: `HTTP ${res.status}` }
  }

  let xml: string
  try {
    xml = await res.text()
  } catch (e: any) {
    return { meta: {}, status: 'parse_error', message: `Failed to read $metadata response body: ${e.message}` }
  } finally {
    // Body consumed (or failed) — the one-shot Agent's sockets are no longer needed.
    await dispatcher.destroy().catch(() => {})
  }

  if (!xml.trim()) {
    return { meta: {}, status: 'empty', message: 'OData $metadata returned an empty document' }
  }

  let meta: ODataEntityMeta
  try {
    meta = parseODataCsdl(xml)
  } catch (e: any) {
    logger.warn({ errMsg: e.message }, '[odata-metadata] failed to parse CSDL XML')
    return { meta: {}, status: 'parse_error', message: e.message }
  }

  const entityCount = Object.keys(meta).length
  if (entityCount === 0) {
    return { meta: {}, status: 'empty', message: 'No entity types found in $metadata' }
  }

  logger.info({ entityCount, database: connection.database }, '[odata-metadata] parsed entity types')
  return { meta, status: 'ok' }
}

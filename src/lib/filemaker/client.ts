import { Agent } from 'undici'
import { FMConnection } from '@prisma/client'
import { decrypt } from '../crypto'
import { safeParseJSON } from '../utils/safe-parse'
import { sanitizeText } from '../utils/sanitizer'
import { logger } from '../logger'
import { assertPublicHost } from '../net/ssrf-guard'

/**
 * Structured error thrown by FileMakerClient.
 * Carries the FM Data API error code and HTTP status separately so callers
 * can distinguish "no records found" (FM code 401) from HTTP 401 (auth failure)
 * without fragile string-matching on the error message.
 */
export class FileMakerError extends Error {
  constructor(
    /** FM Data API error code ('401', '212', …). Empty string for HTTP-level errors. */
    public readonly fmCode: string,
    /** HTTP status from the server response. */
    public readonly httpStatus: number,
    message: string
  ) {
    super(message)
    this.name = 'FileMakerError'
  }

  /** FM Data API code 401 — "No records match the request." Safe to treat as empty result. */
  get isNoRecordsFound(): boolean {
    return this.fmCode === '401'
  }

  /**
   * HTTP 401 (bad credentials / session expiry / proxy auth) OR FM codes that
   * indicate invalid/inactive account: 212 (invalid credentials), 213 (user
   * account disabled), 214 (too many login attempts), 216 (must change password).
   */
  get isAuthError(): boolean {
    if (this.httpStatus === 401) return true
    return ['212', '213', '214', '216'].includes(this.fmCode)
  }
}

/** User-safe message for an HTTP-level failure (no JSON body available). */
function httpStatusMessage(status: number): string {
  switch (status) {
    case 401: return 'Authentication failed. Verify the FileMaker username and password in connection settings.'
    case 403: return 'Access denied. The FileMaker account lacks privilege to perform this operation.'
    case 404: return 'FileMaker resource not found. The layout or database may have been renamed or deleted.'
    case 500: return 'FileMaker server error. Check the server logs for details.'
    default:  return `FileMaker request failed (HTTP ${status}).`
  }
}

/** User-safe message for a FileMaker Data API error code. */
function fmCodeMessage(fmCode: string, rawMsg: string): string {
  switch (fmCode) {
    case '212': return 'Invalid FileMaker username or password.'
    case '213': return 'FileMaker user account is disabled or inactive.'
    case '300': return 'Record is locked by another user — try again shortly.'
    case '500': return `Missing required field value. (${rawMsg})`
    case '501': return `Invalid field value. (${rawMsg})`
    case '502': return `Field value out of range. (${rawMsg})`
    default:    return `FM Error ${fmCode}: ${rawMsg}`
  }
}

/**
 * Maps a low-level network or undici error to a user-safe FileMakerError.
 * Always throws — return type `never` lets callers write `.catch(mapNetworkError)`
 * without TypeScript thinking the subsequent code is unreachable.
 *
 * Undici error codes used here are stable across v6.x:
 *   UND_ERR_CONNECT_TIMEOUT  – TCP connect timed out
 *   UND_ERR_HEADERS_TIMEOUT  – response headers never arrived
 *   UND_ERR_BODY_TIMEOUT     – body chunk gap exceeded bodyTimeout
 */
export function mapNetworkError(err: unknown): never {
  if (err instanceof FileMakerError) throw err

  const code = (err as any)?.code as string | undefined
  const message = err instanceof Error ? err.message : String(err)

  if (code === 'UND_ERR_CONNECT_TIMEOUT') {
    throw new FileMakerError(
      '',
      0,
      'Unable to connect to FileMaker server — connection timed out. ' +
      'Check that the server address is correct and the host is reachable.',
    )
  }

  if (code === 'UND_ERR_BODY_TIMEOUT' || code === 'UND_ERR_HEADERS_TIMEOUT') {
    throw new FileMakerError(
      '',
      0,
      'FileMaker server took too long to respond — request timed out. ' +
      'The server may be overloaded; try again in a moment.',
    )
  }

  if (message.includes('ECONNREFUSED')) {
    throw new FileMakerError(
      '',
      0,
      'FileMaker server refused the connection. ' +
      'Verify the host, port, and that the FileMaker Data API service is running.',
    )
  }

  if (message.includes('ENOTFOUND') || message.includes('ENOENT')) {
    throw new FileMakerError(
      '',
      0,
      'FileMaker server hostname could not be resolved. ' +
      'Check the server address in connection settings.',
    )
  }

  if (message.includes('ECONNRESET') || message.includes('socket hang up')) {
    throw new FileMakerError(
      '',
      0,
      'FileMaker server closed the connection unexpectedly. ' +
      'The server may have restarted or dropped idle sessions.',
    )
  }

  throw new FileMakerError('', 0, `FileMaker connection error: ${message}`)
}

export interface FMRecord {
  recordId: string;
  modId: string;
  fieldData: Record<string, unknown>;
  portalData?: Record<string, unknown>;
}

export interface FMResponse {
  response: {
    data?: FMRecord[];
    dataInfo?: {
      database: string;
      layout: string;
      table: string;
      totalRecordCount: number;
      foundCount: number;
      returnedCount: number;
    };
    scriptResult?: string;
    scriptError?: string;
    token?: string;
    recordId?: string;
    modId?: string;
    layouts?: any[];
    scripts?: any[];
    fieldMetaData?: any[];
    portalMetaData?: any[];
    valueLists?: any[];
  };
  messages: { code: string; message: string }[];
}

export class FileMakerClient {
  private config: FMConnection
  private token: string | null = null
  private baseUrl: string
  private dispatcher: Agent
  private hostCheck: Promise<unknown> | null = null

  constructor(config: FMConnection) {
    this.config = config
    const host = this.config.host.startsWith('http') ? this.config.host : `https://${this.config.host}`
    const port = this.config.port ? `:${this.config.port}` : ''
    const encodedDb = encodeURIComponent(this.config.database)
    this.baseUrl = `${host}${port}/fmi/data/v1/databases/${encodedDb}`
    
    this.dispatcher = new Agent({
      connect: {
        rejectUnauthorized: this.config.sslVerify,
        timeout: 10_000,
      },
      connectTimeout: 10_000,
      bodyTimeout: 30_000,
    })
  }

  private async fetch(path: string, options: RequestInit = {}): Promise<FMResponse> {
    // Defense-in-depth SSRF check: hosts are validated at connection
    // create/update, but re-check here (once per client instance) in case a
    // disallowed host reached the DB some other way or now resolves internally.
    if (!this.hostCheck) this.hostCheck = assertPublicHost(this.config.host)
    await this.hostCheck

    const url = `${this.baseUrl}${path}`
    const headers = new Headers(options.headers || {})
    
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json')
    }
    
    if (this.token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${this.token}`)
    }

    const response = await fetch(url, {
      ...options,
      headers,
      dispatcher: this.dispatcher
    } as RequestInit & { dispatcher: Agent }).catch((err: unknown) => mapNetworkError(err))

    logger.debug({ method: options.method || 'GET', url }, '[FileMakerClient]')

    const text = await response.text().catch((err: unknown) => mapNetworkError(err))

    // Handle non-JSON responses (e.g., HTML 404/401 pages from nginx proxy)
    if (!response.ok && (!text.trim().startsWith('{') && !text.trim().startsWith('['))) {
      logger.error({ status: response.status, body: sanitizeText(text.slice(0, 500)) }, '[FileMakerClient] non-JSON error body')
      throw new FileMakerError('', response.status, httpStatusMessage(response.status))
    }

    let data: FMResponse;
    const parsed = safeParseJSON<FMResponse>(text, null);
    if (parsed === null && text && text.trim() !== 'null' && text.trim() !== '') {
      logger.error({ body: sanitizeText(text.slice(0, 200)) }, '[FileMakerClient] non-JSON response')
      throw new Error(`FileMaker Error: Non-JSON response (${response.status})`)
    }
    data = parsed || { response: {}, messages: [] } as unknown as FMResponse;

    if (data.messages && data.messages[0] && data.messages[0].code !== '0') {
      const code = data.messages[0].code
      const msg = data.messages[0].message
      
      // FM code 401 = "No records match" — return empty result instead of throwing.
      // This is NOT an auth error; HTTP 401 (auth failure) is caught above before
      // JSON parsing and throws FileMakerError with httpStatus=401 / fmCode=''.
      if (code === '401') {
        return {
          response: { data: [], dataInfo: { database: '', layout: '', table: '', totalRecordCount: 0, foundCount: 0, returnedCount: 0 } },
          messages: data.messages
        } as FMResponse
      }

      throw new FileMakerError(code, response.status, fmCodeMessage(code, msg))
    }

    return data
  }


  async login() {
    // Only HTTP Basic is implemented. Legacy rows may still hold 'oauth' or
    // 'clamid' (options the UI once offered but that never worked) — fail
    // loudly with a clear message instead of silently attempting Basic with
    // credentials that were never meant for it.
    if (this.config.authType && this.config.authType !== 'basic') {
      throw new FileMakerError(
        '',
        0,
        `Authentication type "${this.config.authType}" is not supported — edit the connection and use Basic authentication.`,
      )
    }

    const username = this.config.username
    const password = decrypt(this.config.password)
    const auth = Buffer.from(`${username}:${password}`).toString('base64')

    try {
      logger.debug({ database: this.config.database }, '[FileMakerClient] login')
      const data = await this.fetch('/sessions', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`
        },
        body: JSON.stringify({})
      })
      this.token = data.response.token || null
      return this.token
    } catch (err: unknown) {
      logger.error({ errMsg: err instanceof Error ? err.message : String(err) }, '[FileMakerClient] login failed')
      throw err
    }
  }

  /**
   * Destroy this client's undici Agent, releasing its keep-alive sockets.
   * Each FileMakerClient owns its own Agent (created in the constructor —
   * nothing shared), so this must be called once the client is done or the
   * pool leaks one Agent per operation. The client is unusable afterwards.
   */
  async close(): Promise<void> {
    try {
      await this.dispatcher.destroy()
    } catch (err: unknown) {
      logger.warn({ errMsg: err instanceof Error ? err.message : String(err) }, '[FileMakerClient] dispatcher destroy error')
    }
  }

  async logout() {
    if (!this.token) return
    try {
      logger.debug({ database: this.config.database }, '[FileMakerClient] logout')
      await this.fetch(`/sessions/${this.token}`, {
        method: 'DELETE'
      })
    } catch (err: unknown) {
      logger.warn({ errMsg: err instanceof Error ? err.message : String(err) }, '[FileMakerClient] logout error')
    } finally {
      this.token = null
    }
  }

  async getLayouts() {
    return this.fetch('/layouts')
  }

  async getLayoutMetadata(layout: string) {
    return this.fetch(`/layouts/${encodeURIComponent(layout)}`)
  }

  async getScripts(): Promise<FMResponse> {
    try {
      // Correct FM Data API endpoint is /scripts (not /_scripts)
      return await this.fetch('/scripts') as FMResponse
    } catch (e: unknown) {
      // FM server may not expose script listing — non-fatal
      logger.warn({ errMsg: e instanceof Error ? e.message : String(e) }, '[FileMakerClient] /scripts not supported')
      return { response: { scripts: [] }, messages: [{ code: '0', message: 'OK' }] }
    }
  }

  async find(layout: string, query: Record<string, string | number>[], limit?: number, offset?: number, sort?: {fieldName: string, sortOrder: string}[]) {
    const body: Record<string, unknown> = { query }
    if (limit) body.limit = limit
    if (offset) body.offset = offset
    if (sort && sort.length > 0) body.sort = sort
    return this.fetch(`/layouts/${encodeURIComponent(layout)}/_find`, {
      method: 'POST',
      body: JSON.stringify(body)
    })
  }

  /**
   * FileMaker internal record ids are strictly numeric. Validate before
   * building the path so a crafted "id" (e.g. "1/../../other") can never
   * change the request target, then encode as defense-in-depth.
   */
  private static encodeRecordId(recordId: string | number): string {
    const id = String(recordId).trim()
    if (!/^\d+$/.test(id)) {
      throw new FileMakerError(
        '',
        400,
        `Invalid FileMaker record id "${id}" — expected the numeric internal record id.`,
      )
    }
    return encodeURIComponent(id)
  }

  async getRecord(layout: string, recordId: string) {
    return this.fetch(`/layouts/${encodeURIComponent(layout)}/records/${FileMakerClient.encodeRecordId(recordId)}`, {
      method: 'GET'
    })
  }

  async createRecord(layout: string, fieldData: Record<string, unknown>) {
    return this.fetch(`/layouts/${encodeURIComponent(layout)}/records`, {
      method: 'POST',
      body: JSON.stringify({ fieldData })
    })
  }

  async updateRecord(layout: string, recordId: string, fieldData: Record<string, unknown>) {
    return this.fetch(`/layouts/${encodeURIComponent(layout)}/records/${FileMakerClient.encodeRecordId(recordId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ fieldData })
    })
  }

  async deleteRecord(layout: string, recordId: string) {
    return this.fetch(`/layouts/${encodeURIComponent(layout)}/records/${FileMakerClient.encodeRecordId(recordId)}`, {
      method: 'DELETE'
    })
  }

  async listRecords(layout: string, limit: number = 100, offset: number = 1) {
    return this.fetch(`/layouts/${encodeURIComponent(layout)}/records?_limit=${limit}&_offset=${offset}`, {
      method: 'GET'
    })
  }

  async runScript(layout: string, scriptName: string, param?: string) {
    let path = `/layouts/${encodeURIComponent(layout)}/_scripts/${encodeURIComponent(scriptName)}`
    if (param) {
      path += `?script.param=${encodeURIComponent(param)}`
    }
    return this.fetch(path, {
      method: 'GET'
    })
  }
}

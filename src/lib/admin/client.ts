import { Agent } from 'undici'
import { decrypt } from '@/lib/crypto'
import { sanitizeText } from '@/lib/utils/sanitizer'
import { logger } from '@/lib/logger'

interface FMServerConfig {
  host: string
  port: number
  adminUsername: string
  adminPasswordEncrypted: string
  sslVerify: boolean
}

export class FMAdminClient {
  private baseUrl: string
  private config: FMServerConfig
  private dispatcher: Agent
  private token: string | null = null

  constructor(config: FMServerConfig) {
    this.config = config
    const host = config.host.startsWith('http') ? config.host : `https://${config.host}`
    // Only append port if it's non-standard (not 443)
    const port = config.port && config.port !== 443 ? `:${config.port}` : ''
    this.baseUrl = `${host}${port}/fmi/admin/api/v2`
    this.dispatcher = new Agent({ connect: { rejectUnauthorized: config.sslVerify } })
  }

  private async fetch(path: string, options: RequestInit = {}) {
    const url = `${this.baseUrl}${path}`
    const headers = new Headers(options.headers || {})
    if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
    if (this.token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${this.token}`)
    }
    const res = await fetch(url, { ...options, headers, dispatcher: this.dispatcher } as any)
    const text = await res.text()
    try {
      return { status: res.status, data: text ? JSON.parse(text) : {} }
    } catch {
      throw new Error(`Admin API non-JSON response (${res.status}): ${sanitizeText(text.slice(0, 200))}`)
    }
  }

  /**
   * Login using POST /fmi/admin/api/v2/user/auth
   * Requires Basic auth header + JSON body (FM Server requires both)
   * Returns a JWT Bearer token (no "Bearer " prefix in the value)
   */
  async login() {
    const password = decrypt(this.config.adminPasswordEncrypted)
    const credentials = Buffer.from(`${this.config.adminUsername}:${password}`).toString('base64')

    const { status, data } = await this.fetch('/user/auth', {
      method: 'POST',
      headers: { Authorization: `Basic ${credentials}` },
      body: JSON.stringify({
        username: this.config.adminUsername,
        password,
      }),
    })

    if (status !== 200) {
      const msg = data?.messages?.[0]?.text || data?.messages?.[0]?.message || JSON.stringify(data)
      throw new Error(`Admin login failed (HTTP ${status}): ${msg}`)
    }
    const msgCode = data?.messages?.[0]?.code
    if (msgCode && msgCode !== '0') {
      throw new Error(`Admin login error (code ${msgCode}): ${data?.messages?.[0]?.text || 'Unknown'}`)
    }

    const rawToken: string = data?.response?.token || ''
    if (!rawToken) throw new Error('Admin login succeeded but no token returned')
    // Strip "Bearer " prefix if server includes it (some FM versions do)
    this.token = rawToken.startsWith('Bearer ') ? rawToken.slice(7) : rawToken
    logger.debug({ host: this.config.host }, '[FMAdminClient] logged in')
  }

  /**
   * Logout using DELETE /fmi/admin/api/v2/user/auth
   */
  async logout() {
    if (!this.token) return
    try {
      await this.fetch('/user/auth', { method: 'DELETE' })
    } catch (e: any) {
      logger.warn({ errMsg: e.message }, '[FMAdminClient] logout error')
    } finally {
      this.token = null
    }
  }

  /**
   * List all databases from GET /fmi/admin/api/v2/databases
   * Returns only databases with status === "Normal" (open + accessible)
   */
  async getDatabases(): Promise<{ id: string; name: string; status: string; filename: string }[]> {
    const { status, data } = await this.fetch('/databases')
    if (status !== 200) {
      const msg = data?.messages?.[0]?.text || data?.messages?.[0]?.message || 'Unknown'
      throw new Error(`Failed to list databases (HTTP ${status}): ${msg}`)
    }
    const all: any[] = data?.response?.databases || []
    return all
      // FM returns status as 'NORMAL' (uppercase)
      .filter((db) => db.status === 'NORMAL' || db.status === 'Normal')
      .map((db) => {
        const filename: string = db.filename || ''
        const name = filename.replace(/\.fmp12$/i, '')
        return {
          id: String(db.id),
          name: name || String(db.id),
          status: db.status,
          filename,
        }
      })
  }


  async getServerStatus() {
    const { data } = await this.fetch('/server/status')
    return data?.response || {}
  }
}

// Wrapper: login → do work → always logout
export async function withAdminSession<T>(
  config: FMServerConfig,
  fn: (client: FMAdminClient) => Promise<T>
): Promise<T> {
  const client = new FMAdminClient(config)
  await client.login()
  try {
    return await fn(client)
  } finally {
    await client.logout().catch(() => {})
  }
}

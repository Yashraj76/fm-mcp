import { Agent } from 'undici'
import { FMConnection } from '@prisma/client'
import { decrypt } from '../crypto'

export class FileMakerClient {
  private config: FMConnection
  private token: string | null = null
  private baseUrl: string
  private dispatcher: Agent

  constructor(config: FMConnection) {
    this.config = config
    const host = this.config.host.startsWith('http') ? this.config.host : `https://${this.config.host}`
    const port = this.config.port ? `:${this.config.port}` : ''
    const encodedDb = encodeURIComponent(this.config.database)
    this.baseUrl = `${host}${port}/fmi/data/v1/databases/${encodedDb}`
    
    this.dispatcher = new Agent({
      connect: {
        rejectUnauthorized: this.config.sslVerify
      }
    })
  }

  private async fetch(path: string, options: RequestInit = {}) {
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
    } as RequestInit & { dispatcher: Agent })

    console.log(`[FileMakerClient] ${options.method || 'GET'} ${url}`)
    
    const text = await response.text()

    // Handle non-JSON responses (e.g., HTML 404 pages from nginx proxy)
    if (!response.ok && (!text.trim().startsWith('{') && !text.trim().startsWith('['))) {
      console.error(`[FileMakerClient] Non-JSON error body (${response.status}):`, text.slice(0, 500))
      throw new Error(`FileMaker Error: Non-JSON response (${response.status})`)
    }

    let data
    try {
      data = text ? JSON.parse(text) : {}
    } catch {
      console.error('[FileMakerClient] Non-JSON response:', text.slice(0, 200))
      throw new Error(`FileMaker Error: Non-JSON response (${response.status})`)
    }

    if (data.messages && data.messages[0] && data.messages[0].code !== '0') {
      const code = data.messages[0].code
      const msg = data.messages[0].message
      
      // Handle "No records match" (401) gracefully instead of throwing
      if (code === '401' && msg.includes('No records match')) {
        return {
          response: { data: [], dataInfo: { foundCount: 0, returnedCount: 0 } },
          messages: data.messages
        }
      }
      
      throw new Error(`FM Error ${code}: ${msg}`)
    }

    return data
  }


  async login() {
    const username = this.config.username
    const password = decrypt(this.config.password)
    const auth = Buffer.from(`${username}:${password}`).toString('base64')

    try {
      console.log('[FileMakerClient] Logging in to', this.config.database)
      const data = await this.fetch('/sessions', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`
        },
        body: JSON.stringify({})
      })
      this.token = data.response.token
      return this.token
    } catch (err: any) {
      console.error('[FileMakerClient] Login failed:', err.message)
      throw err
    }
  }

  async logout() {
    if (!this.token) return
    try {
      console.log('[FileMakerClient] Logging out')
      await this.fetch(`/sessions/${this.token}`, {
        method: 'DELETE'
      })
    } catch (err: any) {
      console.warn('[FileMakerClient] Logout error (ignored):', err.message)
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

  async getScripts(): Promise<any> {
    try {
      // Correct FM Data API endpoint is /scripts (not /_scripts)
      return await this.fetch('/scripts')
    } catch (e: any) {
      // FM server may not expose script listing — non-fatal
      console.warn('[FileMakerClient] /scripts not supported on this server:', e.message)
      return { response: { scripts: [] } }
    }
  }


  async find(layout: string, query: any[], limit?: number, offset?: number, sort?: {fieldName: string, sortOrder: string}[]) {
    const body: any = { query }
    if (limit) body.limit = limit
    if (offset) body.offset = offset
    if (sort && sort.length > 0) body.sort = sort
    return this.fetch(`/layouts/${encodeURIComponent(layout)}/_find`, {
      method: 'POST',
      body: JSON.stringify(body)
    })
  }

  async getRecord(layout: string, recordId: string) {
    return this.fetch(`/layouts/${encodeURIComponent(layout)}/records/${recordId}`, {
      method: 'GET'
    })
  }

  async createRecord(layout: string, fieldData: any) {
    return this.fetch(`/layouts/${encodeURIComponent(layout)}/records`, {
      method: 'POST',
      body: JSON.stringify({ fieldData })
    })
  }

  async updateRecord(layout: string, recordId: string, fieldData: any) {
    return this.fetch(`/layouts/${encodeURIComponent(layout)}/records/${recordId}`, {
      method: 'PATCH',
      body: JSON.stringify({ fieldData })
    })
  }

  async deleteRecord(layout: string, recordId: string) {
    return this.fetch(`/layouts/${encodeURIComponent(layout)}/records/${recordId}`, {
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

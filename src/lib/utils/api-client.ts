export class ApiError extends Error {
  status: number
  code?: string
  details?: any

  constructor(message: string, status: number, code?: string, details?: any) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

export async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options)
  
  let json: any = null
  const text = await res.text()
  
  if (text) {
    try {
      json = JSON.parse(text)
    } catch {
      // Ignore parse failure, will handle text or status fallback
    }
  }

  if (!res.ok) {
    const errorMsg = json?.error || `Request failed with status ${res.status}`
    const errorCode = json?.code || 'HTTP_ERROR'
    throw new ApiError(errorMsg, res.status, errorCode, json?.details)
  }

  if (json && typeof json === 'object') {
    if (json.success === false) {
      const errorMsg = json.error || 'Operation failed'
      const errorCode = json.code || 'API_ERROR'
      throw new ApiError(errorMsg, res.status, errorCode, json.details)
    }
    
    // If standard API shape has a data field, return it directly
    if ('success' in json && 'data' in json) {
      return json.data as T
    }

    return json as T
  }

  return text as unknown as T
}

export const api = {
  get: <T>(url: string, options?: RequestInit) => apiFetch<T>(url, { ...options, method: 'GET' }),
  post: <T>(url: string, body?: any, options?: RequestInit) => 
    apiFetch<T>(url, { 
      ...options, 
      method: 'POST', 
      headers: { 'Content-Type': 'application/json', ...options?.headers },
      body: body !== undefined ? JSON.stringify(body) : undefined 
    }),
  put: <T>(url: string, body?: any, options?: RequestInit) => 
    apiFetch<T>(url, { 
      ...options, 
      method: 'PUT', 
      headers: { 'Content-Type': 'application/json', ...options?.headers },
      body: body !== undefined ? JSON.stringify(body) : undefined 
    }),
  delete: <T>(url: string, options?: RequestInit) => apiFetch<T>(url, { ...options, method: 'DELETE' }),
}

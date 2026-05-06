import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const settingsSchema = z.object({
  general: z.object({
    theme: z.enum(['dark', 'light', 'system']).optional(),
    autoSave: z.boolean().optional(),
    connectionTimeout: z.number().int().min(5).max(120).optional(),
  }).optional(),
  filemakerApi: z.object({
    dataApiVersion: z.enum(['v1', 'v2', 'latest']).optional(),
    maxRecordsPerRequest: z.number().int().min(1).max(10000).optional(),
    portalDepthLimit: z.number().int().min(1).max(10).optional(),
    defaultLayout: z.string().optional(),
  }).optional(),
  ai: z.object({
    provider: z.enum(['openai', 'anthropic', 'google', 'ollama', 'custom']).optional(),
    apiKey: z.string().optional(),
    model: z.string().optional(),
    baseUrl: z.string().optional(),
    maxTokens: z.number().int().min(1).optional().nullable(),
    temperature: z.number().min(0).max(2).optional(),
    maxSuggestions: z.number().int().min(1).max(100).optional(),
    autoSuggestOnSchemaLoad: z.boolean().optional(),
    toolGenerationEnabled: z.boolean().optional(),
    schemaAnalysisEnabled: z.boolean().optional(),
    rateLimitPerMinute: z.number().int().min(1).max(1000).optional().nullable(),
    monthlyBudget: z.number().int().min(0).optional().nullable(),
    enableToolTesting: z.boolean().optional(),
    verboseLogging: z.boolean().optional(),
  }).optional(),
  security: z.object({
    encryptCredentials: z.boolean().optional(),
    tokenExpiryMinutes: z.number().int().min(1).max(1440).optional(),
    auditLogging: z.boolean().optional(),
    allowedOrigins: z.array(z.string()).optional(),
  }).optional(),
})

const defaultSettings = {
  general: { theme: 'dark', autoSave: true, connectionTimeout: 30 },
  filemakerApi: { dataApiVersion: 'v2', maxRecordsPerRequest: 100, portalDepthLimit: 5, defaultLayout: '' },
  ai: {
    provider: 'openai', apiKey: '', model: '', baseUrl: '', maxTokens: 4096, temperature: 0.7,
    maxSuggestions: 10, autoSuggestOnSchemaLoad: true, toolGenerationEnabled: true,
    schemaAnalysisEnabled: true, rateLimitPerMinute: 60, monthlyBudget: null,
    enableToolTesting: true, verboseLogging: false,
  },
  security: { encryptCredentials: true, tokenExpiryMinutes: 15, auditLogging: true, allowedOrigins: [] as string[] },
}

let settings = { ...defaultSettings }

function maskKey(key: string): string {
  if (!key || key.length <= 8) return key ? '••••' : ''
  return key.slice(0, 4) + '••••' + key.slice(-4)
}

export async function GET() {
  const masked = JSON.parse(JSON.stringify(settings))
  if (masked.ai?.apiKey) {
    masked.ai.apiKeyMasked = maskKey(masked.ai.apiKey)
    delete masked.ai.apiKey
  }
  return NextResponse.json(masked)
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = settingsSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 })
    }
    settings = {
      general: { ...settings.general, ...parsed.data.general },
      filemakerApi: { ...settings.filemakerApi, ...parsed.data.filemakerApi },
      ai: { ...settings.ai, ...parsed.data.ai },
      security: { ...settings.security, ...parsed.data.security },
    }
    if (parsed.data.ai?.apiKey !== undefined && parsed.data.ai.apiKey !== '') {
      settings.ai.apiKey = parsed.data.ai.apiKey
    }
    const masked = JSON.parse(JSON.stringify(settings))
    if (masked.ai?.apiKey) {
      masked.ai.apiKeyMasked = maskKey(masked.ai.apiKey)
      delete masked.ai.apiKey
    }
    return NextResponse.json({ message: 'Settings saved successfully', settings: masked })
  } catch (error) {
    console.error('Error saving settings:', error)
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 })
  }
}

import { db } from '@/lib/db'
import { decrypt } from '@/lib/crypto'
import { generateText } from 'ai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'

// Reads AI config from AppSettings singleton (never hardcoded)
export async function getAISettings() {
  const settings = await db.appSettings.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton' },
    update: {},
  })
  return {
    provider: settings.aiProvider,
    model: settings.aiModel,
    apiKey: settings.aiApiKeyEncrypted ? decrypt(settings.aiApiKeyEncrypted) : '',
    baseUrl: settings.aiBaseUrl || undefined,
    maxTokens: settings.aiMaxTokens,
    temperature: settings.aiTemperature,
  }
}

export function buildModel(provider: string, model: string, apiKey: string, baseUrl?: string) {
  switch (provider) {
    case 'anthropic':
      return createAnthropic({ apiKey })(model)
    case 'openai':
      return createOpenAI({ apiKey, baseURL: baseUrl })(model)
    case 'google':
      return createGoogleGenerativeAI({ apiKey })(model)
    case 'ollama':
    case 'custom':
      return createOpenAI({ apiKey: apiKey || 'ollama', baseURL: baseUrl || 'http://localhost:11434/v1' })(model)
    default:
      throw new Error(`Unsupported AI provider: ${provider}`)
  }
}

export interface AICallOptions {
  systemPrompt: string
  userMessage: string
  maxOutputTokens?: number
  configOverride?: {
    provider?: string
    apiKey?: string
    baseUrl?: string
    model?: string
  }
}

export async function callAI(options: AICallOptions): Promise<string> {
  const settings = await getAISettings()
  
  const provider = options.configOverride?.provider || settings.provider
  const apiKey = options.configOverride?.apiKey || settings.apiKey
  const baseUrl = options.configOverride?.baseUrl || settings.baseUrl
  const modelName = options.configOverride?.model || settings.model

  if (!apiKey && !['ollama', 'custom'].includes(provider)) {
    throw new Error('AI API key not configured. Go to Settings → AI to configure.')
  }
  const model = buildModel(provider, modelName, apiKey, baseUrl)
  const result = await generateText({
    model,
    system: options.systemPrompt,
    prompt: options.userMessage,
    maxOutputTokens: options.maxOutputTokens || settings.maxTokens,
  })
  return result.text
}

import { SUGGEST_RELATIONSHIPS_PROMPT } from './prompts/suggest-relationships'

// Suggest relationships between layouts/tables based on field name analysis
export async function suggestRelationships(payload: {
  layouts: { name: string; fields: string[] }[]
  tables: { name: string; fields: string[] }[]
}): Promise<{ from: string; to: string; key: string; confidence: 'high' | 'medium' | 'low'; reason: string }[]> {
  const schemaStr = JSON.stringify(payload, null, 2)

  const text = await callAI({
    systemPrompt: SUGGEST_RELATIONSHIPS_PROMPT,
    userMessage: `Analyze this FileMaker schema and return relationship suggestions:\n\n${schemaStr}`,
    maxOutputTokens: 2048,
  })

  // Extract JSON from response
  const jsonMatch = text.match(/\[[\s\S]*\]/)
  if (!jsonMatch) return []
  try {
    return JSON.parse(jsonMatch[0])
  } catch {
    console.error('[AI] Failed to parse relationship suggestions:', text.slice(0, 200))
    return []
  }
}

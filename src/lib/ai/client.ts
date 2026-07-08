import { decrypt } from '@/lib/crypto'
import { getAppSettings } from '@/lib/settings'
import { sanitizeText } from '@/lib/utils/sanitizer'
import { generateText } from 'ai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import { createGoogleGenerativeAI } from '@ai-sdk/google'

// Reads AI config — checks user-specific settings first, falls back to global singleton.
// Always pass userId when calling from an authenticated context.
export async function getAISettings(userId?: string) {
  const settings = await getAppSettings(userId)
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
  userId?: string  // Pass to resolve user-specific API key
  configOverride?: {
    provider?: string
    apiKey?: string
    baseUrl?: string
    model?: string
  }
}

export async function callAI(options: AICallOptions): Promise<string> {
  // Use userId to resolve user-specific key first; fall back to global singleton
  const settings = await getAISettings(options.userId)
  
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

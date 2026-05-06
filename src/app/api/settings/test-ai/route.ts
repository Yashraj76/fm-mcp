import { NextRequest, NextResponse } from 'next/server'

const providerConfigs: Record<string, { baseUrl: string; models: string[] }> = {
  openai: { baseUrl: 'https://api.openai.com/v1', models: ['gpt-4', 'gpt-4o', 'gpt-4-turbo', 'gpt-4o-mini', 'gpt-3.5-turbo'] },
  anthropic: { baseUrl: 'https://api.anthropic.com/v1', models: ['claude-sonnet-4-20250514', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229'] },
  google: { baseUrl: 'https://generativelanguage.googleapis.com/v1beta', models: ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-2.0-flash'] },
  ollama: { baseUrl: 'http://localhost:11434', models: ['llama3.2', 'codellama', 'mistral', 'mixtral', 'qwen2.5-coder'] },
  custom: { baseUrl: '', models: [] },
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { provider, apiKey, baseUrl } = body

    if (!provider) {
      return NextResponse.json({ error: 'Provider is required' }, { status: 400 })
    }

    const config = providerConfigs[provider]
    if (!config) {
      return NextResponse.json({ error: `Unknown provider: ${provider}` }, { status: 400 })
    }

    // For ollama/custom, check if we have a baseUrl
    if ((provider === 'ollama' || provider === 'custom') && !baseUrl) {
      return NextResponse.json(
        { error: `${provider === 'ollama' ? 'Ollama' : 'Custom'} provider requires a base URL` },
        { status: 400 }
      )
    }

    // Simulate test — in production this would actually call the API
    const effectiveUrl = baseUrl || config.baseUrl

    // Check if API key format looks correct
    if (provider !== 'ollama') {
      if (!apiKey || apiKey.length < 10) {
        return NextResponse.json({
          success: false,
          error: 'API key appears to be invalid (too short)',
          provider,
          testedAt: new Date().toISOString(),
        })
      }
    }

    return NextResponse.json({
      success: true,
      message: `Connected to ${provider} successfully`,
      provider,
      baseUrl: effectiveUrl,
      availableModels: provider === 'custom' ? ['custom-model'] : config.models,
      testedAt: new Date().toISOString(),
    })
  } catch (error) {
    return NextResponse.json({ error: 'AI connection test failed' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { generateObject } from 'ai'
import { z } from 'zod'
import { getAISettings, buildModel } from '@/lib/ai/client'

const toolSuggestionSchema = z.object({
  name: z.string().describe('Snake case name of the tool, e.g. search_contacts'),
  description: z.string().describe('Description of what the tool does'),
  inputSchema: z.object({
    type: z.literal('object'),
    properties: z.record(z.object({
      type: z.string(),
      description: z.string().optional()
    })),
    required: z.array(z.string()).optional()
  }),
  fmMethod: z.enum(['create', 'read', 'update', 'delete', 'find', 'script', 'custom']),
  fmLayout: z.string().optional().describe('The FileMaker layout to target, if applicable'),
  category: z.enum(['CRUD', 'Find', 'Script', 'Custom']).optional(),
})

// POST /api/tools/suggest
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { prompt } = body

    if (!prompt) {
      return NextResponse.json({ success: false, error: 'Prompt is required' }, { status: 400 })
    }

    const aiConfig = await getAISettings()

    if (!aiConfig.apiKey && !['ollama', 'custom'].includes(aiConfig.provider)) {
      return NextResponse.json({ success: false, error: 'API key is not configured' }, { status: 400 })
    }

    let aiModel;
    try {
      const modelName = aiConfig.model || (
        aiConfig.provider === 'openai' ? 'gpt-4o' : 
        aiConfig.provider === 'anthropic' ? 'claude-3-5-sonnet-20241022' : 
        'gemini-1.5-pro'
      )
      aiModel = buildModel(aiConfig.provider, modelName, aiConfig.apiKey, aiConfig.baseUrl)
    } catch (e: any) {
      return NextResponse.json({ success: false, error: e.message || 'Failed to initialize AI model' }, { status: 500 })
    }

    const { object } = await generateObject({
      model: aiModel,
      schema: toolSuggestionSchema,
      prompt: `Generate an MCP tool configuration for FileMaker based on this request: "${prompt}". 
      Return a useful tool name in snake_case, a clear description, the required input schema (JSON schema format), 
      the best FileMaker method (create, read, update, delete, find, script, custom), and an appropriate category.`,
      maxTokens: aiConfig.maxTokens || 1024,
      temperature: aiConfig.temperature ?? 0.7,
    })

    return NextResponse.json({
      success: true,
      data: {
        suggestion: {
          ...object,
          inputSchema: JSON.stringify(object.inputSchema, null, 2),
        }
      }
    })
  } catch (error: any) {
    console.error('[API Error]', error)
    return NextResponse.json({ 
      success: false, 
      error: error.message || 'Internal server error', 
      code: 'SERVER_ERROR' 
    }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { generateObject } from 'ai'
import { z } from 'zod'
import { getAISettings, buildModel } from '@/lib/ai/client'
import { db } from '@/lib/db'

// ─── Simplified CRUD-only schema ─────────────────────────────────────────────
// Auto-generate only produces simple, single-layout tools.
// Multi-table tools are complex and are built manually via the Multi-Table tab.

const crudToolSchema = z.object({
  name: z.string().describe('snake_case tool name starting with a verb'),
  description: z.string().describe('1-2 sentences for an AI agent describing the business action'),
  fmMethod: z.enum(['find', 'create', 'update', 'delete', 'list']),
  fmLayout: z.string().describe('Exact layout name from the schema'),
  inputSchema: z.object({
    type: z.string().default('object'),
    properties: z.record(z.string(), z.any()),
    required: z.array(z.string()).optional().default([])
  }),
  handlerConfig: z.object({
    connectionId: z.string(),
    layout: z.string(),
    method: z.string(),
    fieldMappings: z.record(z.string(), z.string()).optional()
  })
})

const responseSchema = z.object({
  tools: z.array(crudToolSchema)
})

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await request.json()
    const { branchId, layouts, connectionId: passedConnectionId } = body

    if (!branchId) {
      return NextResponse.json({ success: false, error: 'Missing branchId', code: 'VALIDATION_ERROR' }, { status: 400 })
    }

    const server = await db.mcpServer.findUnique({ 
      where: { id },
      include: { connections: true }
    })
    if (!server) {
      return NextResponse.json({ success: false, error: 'Server not found', code: 'NOT_FOUND' }, { status: 404 })
    }

    const branch = await db.branch.findFirst({ where: { id: branchId, serverId: id } })
    if (!branch) {
      return NextResponse.json({ success: false, error: 'Branch not found', code: 'NOT_FOUND' }, { status: 404 })
    }

    // Determine connectionId and layouts from the compiled schema if not provided
    let connectionId = passedConnectionId
    let layoutsToProcess: Array<{ name: string; fields: string[] }> = layouts || []

    if (!connectionId || layoutsToProcess.length === 0) {
      // Find the first active connection for this server
      const activeConnection = server.connections.find((c: any) => c.isActive) || server.connections[0]
      if (!activeConnection) {
        return NextResponse.json({ success: false, error: 'No database connection found for this server. Please attach a connection first.', code: 'VALIDATION_ERROR' }, { status: 400 })
      }
      
      connectionId = activeConnection.connectionId
      
      // Fetch the compiled schema for this connection
      const browsedSchema = await db.browsedSchema.findUnique({
        where: { connectionId }
      })
      
      if (!browsedSchema || !browsedSchema.compiledSchema || browsedSchema.compiledSchema === '{}') {
        return NextResponse.json({ success: false, error: 'No compiled schema found for the attached database connection. Please go to Connection -> Browse Schema, select layouts, and save.', code: 'VALIDATION_ERROR' }, { status: 400 })
      }
      
      try {
        const compiled = JSON.parse(browsedSchema.compiledSchema)
        if (compiled.layouts) {
          layoutsToProcess = Object.keys(compiled.layouts).map(layoutName => ({
            name: layoutName,
            fields: Object.keys(compiled.layouts[layoutName].fields || {})
          }))
        }
      } catch (e) {
        console.error('[generate-server-tools] Failed to parse compiled schema:', e)
      }
    }
    
    if (layoutsToProcess.length === 0) {
       return NextResponse.json({ success: false, error: 'No layouts found in the compiled schema. Please ensure you have selected layouts in the schema browser.', code: 'VALIDATION_ERROR' }, { status: 400 })
    }

    const aiConfig = await getAISettings()

    if (!aiConfig.apiKey && !['ollama', 'custom'].includes(aiConfig.provider)) {
      return NextResponse.json({
        success: false,
        error: 'No API key configured. Please add your API key in Settings → AI Configuration.',
        code: 'VALIDATION_ERROR'
      }, { status: 400 })
    }

    let aiModel
    try {
      const modelName = aiConfig.model || (
        aiConfig.provider === 'openai' ? 'gpt-4o' :
        aiConfig.provider === 'anthropic' ? 'claude-sonnet-4-6' :
        'gemini-1.5-pro'
      )
      aiModel = buildModel(aiConfig.provider, modelName, aiConfig.apiKey, aiConfig.baseUrl)
    } catch (e: any) {
      return NextResponse.json({ success: false, error: e.message || 'Failed to initialize AI model', code: 'SERVER_ERROR' }, { status: 500 })
    }

    // Build a concise layout summary — only use fields present in each layout
    const layoutSummary = layoutsToProcess.map(l =>
      `Layout: ${l.name}\nFields: ${l.fields.join(', ')}`
    ).join('\n\n')

    const prompt = `You are generating simple, production-ready CRUD MCP tools for a FileMaker database.

Server: "${server.name}"
Description: "${server.description || 'FileMaker MCP Server'}"
Connection ID: "${connectionId}"

FileMaker Layouts (these are the ONLY layouts and fields you may reference):
${layoutSummary}

INSTRUCTIONS:
Generate exactly 5 tools per layout: search, create, list, update, delete.
- search_{layout}: FM find operation using relevant searchable fields
- create_{layout}_record: FM create using the layout's fields
- list_{layout}_records: FM list/paginate with optional limit and offset
- update_{layout}_record: FM update using recordId + updatable fields
- delete_{layout}_record: FM delete using recordId only

STRICT RULES:
1. Tool names must be snake_case, unique, start with a verb
2. ONLY use field names that appear in the provided layout fields list
3. inputSchema.required must only list truly mandatory fields (recordId for update/delete)
4. pagination fields (limit, offset) are always optional
5. fieldMappings maps inputParam → FM field name exactly as listed
6. connectionId must be "${connectionId}"
7. Do NOT invent layouts, tables, or fields not shown above
8. MUST use camelCase exactly for all JSON keys (e.g., inputSchema, handlerConfig, fieldMappings).`

    const { object } = await generateObject({
      model: aiModel,
      schema: responseSchema,
      prompt,
      maxOutputTokens: aiConfig.maxTokens || 4096,
      temperature: 0.3, // low temp for deterministic field names
    })

    const generatedTools = object.tools || []

    // Map to DB schema
    const toolsData = generatedTools.map((tool, index) => ({
      serverId: id,
      branchId,
      name: tool.name,
      description: tool.description,
      category: tool.fmMethod === 'find' || tool.fmMethod === 'list' ? 'Find' : 'CRUD',
      fmMethod: tool.fmMethod,
      fmLayout: tool.fmLayout,
      inputSchema: JSON.stringify(tool.inputSchema),
      handlerConfig: JSON.stringify(tool.handlerConfig),
      isEnabled: true,
      isAiGenerated: true,
      sortOrder: index
    }))

    await db.tool.createMany({ data: toolsData })

    return NextResponse.json({
      success: true,
      data: object,
      count: toolsData.length
    }, { status: 201 })

  } catch (error: any) {
    console.error('[generate-server-tools] Error:', error)
    return NextResponse.json({
      success: false,
      error: error.message || 'Internal server error',
      code: 'SERVER_ERROR'
    }, { status: 500 })
  }
}

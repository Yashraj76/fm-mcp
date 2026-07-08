import { apiSuccess, apiNotFound, apiError, apiServerError } from '@/lib/utils/api-response'
import { generateObject } from 'ai'
import { z } from 'zod'
import { getAISettings, buildModel } from '@/lib/ai/client'
import { db } from '@/lib/db'
import { resolveGenerationConnection } from '@/lib/tools/resolve-generation-connection'
import { withAuth } from "@/lib/auth/api-guard";
import { safeParseJSON } from '@/lib/utils/safe-parse';
import { normalizeTool } from '@/lib/tools/normalize-tool';
import { validateToolForSave } from '@/lib/tools/validate-tool';
import { createToolWithBranch } from '@/lib/tools/create-tool-with-branch';
import { logger } from '@/lib/logger'

// ─── Simplified CRUD-only schema ─────────────────────────────────────────────
// Auto-generate only produces simple, single-layout tools.
// Multi-table tools are complex and are built manually via the Multi-Table tab.

const crudToolSchema = z.object({
  name: z.string().describe('snake_case tool name starting with a verb'),
  description: z.string().describe('1-2 sentences for an AI agent describing the business action'),
  fmMethod: z.enum(['find', 'create', 'update', 'delete', 'list', 'get']),
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
export const POST = withAuth(async (request, { params, userId }) => {
    try {
    const { id } = params
    const body = await request.json()
    const { branchId, layouts, connectionId: passedConnectionId } = body

    if (!branchId) {
      return apiError('Missing branchId', 'VALIDATION_ERROR', 400)
    }

    const server = await db.mcpServer.findFirst({
      where: { id, userId },
      include: {
        connections: {
          include: {
            connection: { select: { id: true, name: true, database: true } }
          }
        }
      }
    })
    if (!server) {
      return apiNotFound('Server not found')
    }

    const branch = await db.branch.findFirst({
      where: { id: branchId, serverId: id }
    })
    if (!branch) {
      return apiNotFound('Branch not found')
    }

    // Resolve which connection to use — enforces explicit selection for multi-connection servers.
    const connResult = resolveGenerationConnection(passedConnectionId, server.connections as any)
    if (!connResult.ok) {
      if (connResult.reason === 'no-connections') {
        return apiError('No database connection found for this server. Please attach a connection first.', 'NO_CONNECTIONS', 400)
      }
      if (connResult.reason === 'connection-required') {
        return apiError(
          'This server has multiple connections. Select which one to generate tools from.',
          'CONNECTION_REQUIRED',
          400,
          { connections: connResult.connections }
        )
      }
      return apiError('The selected connection is not linked to this server.', 'INVALID_CONNECTION', 400)
    }

    const connectionId = connResult.connectionId

    // Verify connection ownership and fetch schema when layouts not provided by caller
    let layoutsToProcess: Array<{ name: string; fields: string[] }> = layouts || []

    if (layoutsToProcess.length === 0) {
      const conn = await db.fMConnection.findFirst({ where: { id: connectionId, userId } })
      if (!conn) {
        return apiNotFound('Connection not found')
      }

      const browsedSchema = await db.browsedSchema.findUnique({ where: { connectionId } })
      if (!browsedSchema || !browsedSchema.compiledSchema || browsedSchema.compiledSchema === '{}') {
        return apiError('No compiled schema found for the attached database connection. Please go to Connection → Browse Schema, select layouts, and save.', 'VALIDATION_ERROR', 400)
      }

      try {
        const compiled = safeParseJSON<Record<string, any>>(browsedSchema.compiledSchema, {})
        if (Array.isArray(compiled.layouts) && compiled.layouts.length > 0) {
          layoutsToProcess = compiled.layouts.map((l: any) => ({
            name: l.name as string,
            fields: Array.isArray(l.fields) ? (l.fields as string[]) : [],
          }))
        } else if (!Array.isArray(compiled.layouts) && !Array.isArray(compiled.tables)) {
          return apiError('Compiled schema is malformed. Please re-save schema selections in the Schema Browser.', 'VALIDATION_ERROR', 400)
        }
      } catch (e) {
        logger.error({ err: e }, '[generate-server-tools] Failed to parse compiled schema:')
      }
    }

    if (layoutsToProcess.length === 0) {
      return apiError(
        'No layouts found in the compiled schema. ' +
        'Auto-generate creates CRUD tools from FileMaker layouts — ' +
        'please select at least one layout in the Schema Browser and save your selections. ' +
        'OData-based tools must be created manually.',
        'NO_LAYOUTS',
        400,
      )
    }

    const aiConfig = await getAISettings()

    if (!aiConfig.apiKey && !['ollama', 'custom'].includes(aiConfig.provider)) {
      return apiError('No API key configured. Please add your API key in Settings → AI Configuration.', 'VALIDATION_ERROR', 400)
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
      return apiServerError(e.message || 'Failed to initialize AI model')
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

    // Save tools to DB sequentially (no transaction — AI call already took >5s so
    // $transaction would timeout; each create is individually atomic and that's fine)
    const createdTools: any[] = []
    let skippedCount = 0
    for (let i = 0; i < generatedTools.length; i++) {
      const tool = generatedTools[i]

      // Skip if a tool with this name already exists on the server (idempotency)
      const existing = await db.tool.findFirst({
        where: { serverId: id, name: tool.name, deletedAt: null }
      })
      if (existing) { createdTools.push(existing); continue; }

      // Normalize to fill missing category, outputSchema, handlerConfig.method, etc.
      const normalized = normalizeTool({ ...tool, isAiGenerated: true })

      // Validate before saving — skip invalid tools rather than aborting the whole batch
      const validationErrors = validateToolForSave(normalized)
      if (validationErrors.length > 0) {
        logger.warn({ toolName: tool.name, errors: validationErrors.map(e => e.message).join(', ') }, '[generate-server-tools] skipping invalid tool')
        skippedCount++
        continue
      }

      // Atomically create Tool + BranchTool so neither record is left orphaned
      const { tool: baseTool } = await createToolWithBranch(
        db,
        {
          serverId: id,
          name: normalized.name,
          description: normalized.description,
          category: normalized.category,
          fmMethod: normalized.fmMethod,
          fmLayout: normalized.fmLayout,
          fmScript: normalized.fmScript,
          inputSchema: normalized.inputSchema,
          outputSchema: normalized.outputSchema,
          handlerConfig: normalized.handlerConfig,
          isEnabled: true,
          isAiGenerated: true,
          sortOrder: i,
        },
        branchId,
      )
      createdTools.push(baseTool)
    }

    return apiSuccess({
      data: object,
      count: createdTools.length,
      skipped: skippedCount,
    }, 201)

  } catch (error: any) {
    logger.error({ err: error }, '[generate-server-tools] Error:')
    return apiServerError('Internal server error')
  }
})

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'
import { callAI } from '@/lib/ai/client'
import { SINGLE_TOOL_FROM_PROMPT, FLOW_TOOLS_FROM_PROMPT } from '@/lib/ai/prompts/prompt-tool-from-prompt'
import { normalizeTool } from '@/lib/tools/normalize-tool'
import { validateToolForSave } from '@/lib/tools/validate-tool'
import { resolveGenerationConnection } from '@/lib/tools/resolve-generation-connection'
import { withAuth } from "@/lib/auth/api-guard";
import { safeParseJSON } from '@/lib/utils/safe-parse';
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'

const requestSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required'),
  mode: z.enum(['single', 'flow']),
  branchId: z.string().optional(),
  connectionId: z.string().optional(),
})

// POST /api/servers/[id]/ai/generate-from-prompt
// Generates tools from a user prompt in either single-tool or workflow-flow mode.
export const POST = withAuth(async (request, { params, userId }) => {
    try {
    const { id } = await params

    // Validate request body
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON body', code: 'VALIDATION_ERROR' },
        { status: 400 }
      )
    }

    const parsed = requestSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { prompt, mode, connectionId: requestedConnectionId } = parsed.data

    // Load server with all connections (not filtered by isActive — user must pick explicitly)
    const server = await db.mcpServer.findFirst({
      where: { id, userId },
      include: {
        connections: {
          include: {
            connection: {
              include: { browsedSchema: true },
            },
          },
        },
      },
    })

    if (!server) {
      return NextResponse.json(
        { success: false, error: 'Server not found', code: 'NOT_FOUND' },
        { status: 404 }
      )
    }

    // Resolve which connection to use — enforces explicit selection for multi-connection servers.
    const connResult = resolveGenerationConnection(requestedConnectionId, server.connections as any)
    if (!connResult.ok) {
      if (connResult.reason === 'no-connections') {
        return NextResponse.json(
          { success: false, error: 'No connections are linked to this server. Attach a FileMaker database first.', code: 'NO_CONNECTIONS' },
          { status: 400 }
        )
      }
      if (connResult.reason === 'connection-required') {
        return NextResponse.json(
          {
            success: false,
            error: 'This server has multiple connections. Select which one to generate tools from.',
            code: 'CONNECTION_REQUIRED',
            details: { connections: connResult.connections },
          },
          { status: 400 }
        )
      }
      return NextResponse.json(
        { success: false, error: 'The selected connection is not linked to this server.', code: 'INVALID_CONNECTION' },
        { status: 400 }
      )
    }

    const resolvedConnectionId = connResult.connectionId
    const resolvedConnServer = server.connections.find((c: any) => c.connectionId === resolvedConnectionId)
    const activeConn = resolvedConnServer?.connection
    const bs = activeConn?.browsedSchema
    if (!bs || !bs.compiledSchema) {
      return NextResponse.json(
        {
          success: false,
          error: 'Schema not browsed or compiled. Please browse and save schema selections first.',
          code: 'SCHEMA_MISSING',
        },
        { status: 400 }
      )
    }

    const compiledSchema = safeParseJSON<Record<string, any>>(bs.compiledSchema, {})
    const hasLayouts = Array.isArray(compiledSchema?.layouts) && compiledSchema.layouts.length > 0
    const hasTables = Array.isArray(compiledSchema?.tables) && compiledSchema.tables.length > 0
    if (!hasLayouts && !hasTables) {
      return NextResponse.json(
        {
          success: false,
          error:
            'No layouts or OData tables are selected. Open Schema Browser, select at least one layout or table, and save your selections before generating tools.',
          code: 'SCHEMA_MISSING',
        },
        { status: 400 },
      )
    }

    // Build user message payload — include connectionId so AI embeds it in handlerConfig
    const userMessage = JSON.stringify(
      {
        serverName: server.name,
        serverDescription: server.description || '',
        connectionId: resolvedConnectionId,
        userPrompt: prompt,
        compiledSchema,
      },
      null,
      2
    )

    // Pick prompt based on mode
    const systemPrompt = mode === 'single' ? SINGLE_TOOL_FROM_PROMPT : FLOW_TOOLS_FROM_PROMPT

    // Call AI
    const aiText = await callAI({
      systemPrompt,
      userMessage,
      maxOutputTokens: mode === 'single' ? 2000 : 6000,
      userId,
    })

    // Defensively parse AI output — strip code fences, find JSON array
    const clean = aiText
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
  .trim()

let tools: unknown[] = []
try {
  const arrayMatch = clean.match(/\[[\s\S]*\]/)
  if (!arrayMatch) throw new Error('No JSON array found in AI output')
  const rawParsed = safeParseJSON<unknown[]>(arrayMatch[0], [])
  if (!Array.isArray(rawParsed) || rawParsed.length === 0) throw new Error('Expected non-empty JSON array')
  tools = rawParsed
} catch (err: any) {
  logger.error({ output: aiText.substring(0, 500) }, '[generate-from-prompt] AI parse error')
  return NextResponse.json(
    { success: false, error: 'Failed to parse AI tool output: ' + err.message, code: 'SERVER_ERROR' },
    { status: 500 }
  )
}

// Normalize + validate each tool so the preview matches what save will produce.
// Valid tools are fully normalized (fields serialized as objects for the UI).
// Invalid tools are collected with per-tool error messages.
const validTools: Record<string, unknown>[] = []
const rejectedTools: Array<{ name: string; errors: string[] }> = []

for (const rawTool of tools) {
  const t = rawTool as Record<string, unknown>
  const toolName = typeof t.name === 'string' && t.name ? t.name : null
  if (!toolName) continue // unnamed tools are silently dropped

  try {
    const normalized = normalizeTool({ ...t, isAiGenerated: true })
    const validationErrors = validateToolForSave(normalized)

    if (validationErrors.length > 0) {
      rejectedTools.push({ name: toolName, errors: validationErrors.map((e) => e.message) })
    } else {
      const hc = safeParseJSON<Record<string, any>>(normalized.handlerConfig, {})
      validTools.push({
        ...normalized,
        // Deserialize JSON strings back to objects so the preview UI can render them
        inputSchema: safeParseJSON(normalized.inputSchema, {}),
        // Ensure connectionId is always present — use AI's value if set, else resolved
        handlerConfig: { ...hc, connectionId: hc.connectionId || resolvedConnectionId },
        outputSchema: safeParseJSON(normalized.outputSchema, {}),
      })
    }
  } catch (err: any) {
    rejectedTools.push({ name: toolName, errors: [err.message] })
  }
}

return NextResponse.json(
  { success: true, data: { tools: validTools, rejectedTools, mode } },
  { status: 200 }
)
} catch (error: unknown) {
const msg = error instanceof Error ? error.message : 'Unknown error'
logger.error({ err: msg }, '[generate-from-prompt] Unexpected error:')
return NextResponse.json(
  { success: false, error: 'Internal server error', code: 'SERVER_ERROR' },
  { status: 500 }
)
}
});

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'
import { callAI } from '@/lib/ai/client'
import { SINGLE_TOOL_FROM_PROMPT, FLOW_TOOLS_FROM_PROMPT } from '@/lib/ai/prompts/prompt-tool-from-prompt'
import { withAuth } from "@/lib/auth/api-guard";
import { safeParseJSON } from '@/lib/utils/safe-parse';

export const runtime = 'nodejs'

const requestSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required'),
  mode: z.enum(['single', 'flow']),
  branchId: z.string().optional(),
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

    const { prompt, mode } = parsed.data

    // Load server with active connections + browsed schema
    const server = await db.mcpServer.findUnique({
      where: {
          userId: userId,
        id },
      include: {
        connections: {
          where: { isActive: true },
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

    // Require compiled schema
    const activeConn = server.connections[0]?.connection
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

    const compiledSchema = safeParseJSON<Record<string, unknown>>(bs.compiledSchema, {})
    if (!compiledSchema || Object.keys(compiledSchema).length === 0) {
      return NextResponse.json(
        { success: false, error: 'Compiled schema is malformed or empty', code: 'SCHEMA_MISSING' },
        { status: 500 }
      )
    }

    // Build user message payload
    const userMessage = JSON.stringify(
      {
        serverName: server.name,
        serverDescription: server.description || '',
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
  console.error('[generate-from-prompt] AI parse error. Raw output:', aiText.substring(0, 500))
  return NextResponse.json(
    { success: false, error: 'Failed to parse AI tool output: ' + err.message, code: 'SERVER_ERROR' },
    { status: 500 }
  )
}

// Normalise each tool: ensure inputSchema and handlerConfig are plain objects (not strings)
const normalisedTools = tools
  .filter((t): t is Record<string, unknown> => !!t && typeof t === 'object' && !!(t as Record<string, unknown>).name)
  .map((tool) => {
    const t = tool as Record<string, unknown>
    return {
      ...t,
      inputSchema:
        typeof t.inputSchema === 'string'
          ? safeParseJSON(t.inputSchema as string, { type: 'object', properties: {}, required: [] })
          : (t.inputSchema ?? { type: 'object', properties: {}, required: [] }),
      handlerConfig:
        typeof t.handlerConfig === 'string'
          ? safeParseJSON(t.handlerConfig as string, {})
          : (t.handlerConfig ?? {}),
    }
  })

return NextResponse.json(
  { success: true, data: { tools: normalisedTools, mode } },
  { status: 200 }
)
} catch (error: unknown) {
const msg = error instanceof Error ? error.message : 'Unknown error'
console.error('[generate-from-prompt] Unexpected error:', msg)
return NextResponse.json(
  { success: false, error: 'Internal server error', code: 'SERVER_ERROR' },
  { status: 500 }
)
}
});

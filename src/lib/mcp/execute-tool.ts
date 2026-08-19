import { safeParseJSON } from '@/lib/utils/safe-parse'
import { logger } from '@/lib/logger'
import { db } from '@/lib/db'
import { sanitizeObject } from '@/lib/utils/sanitizer'
import type { Tool, McpServer, FMConnectionServer, FMConnection } from '@prisma/client'
import { executeToolWithParams } from '@/lib/tools/executor-service'
import { logMcpToolActivity } from './activity'
import { resolveToolConnection } from '@/lib/filemaker/resolve-connection'

type ToolWithServer = Tool & {
  server: McpServer & {
    connections: (FMConnectionServer & { connection: FMConnection })[]
  }
}

export async function executeMcpTool(
  tool: ToolWithServer,
  params: Record<string, unknown>,
  context: { branchId?: string | null; branchConnectionOverride?: FMConnection | null } = {}
): Promise<unknown> {
  const handlerConfig = safeParseJSON<{ connectionId?: string } & Record<string, unknown>>(tool.handlerConfig, {})

  if (tool.category === 'system') {
    return executeToolWithParams(tool, params, null)
  }

  const connection = resolveToolConnection(
    handlerConfig.connectionId,
    tool.server.connections,
    tool.name,
    context.branchConnectionOverride
  )

  const startTime = Date.now()
  try {
    const result = await executeToolWithParams(tool, params, connection)
    const duration = Date.now() - startTime

    // Persist execution history + ActivityLog in ONE parallel round-trip.
    // Each write has its own .catch, so logging failures can never fail the
    // tool result. We still await the batch rather than firing-and-forgetting:
    // Vercel freezes the process once the response is sent, so un-awaited
    // writes here would silently be lost in production (same failure mode as
    // the setImmediate bug fixed in the ai-run/servers routes).
    await Promise.all([
      db.toolExecution.create({
        data: {
          toolId: tool.id,
          requestBody: JSON.stringify(sanitizeObject(params)),
          responseStatus: 200,
          responseBody: JSON.stringify(sanitizeObject(result)),
          duration,
          status: 'success'
        }
      }).catch(e => logger.error({ err: e }, '[MCP Execution History] failed to save')),

      // ActivityLog entry — safe fields only, no credentials or full payloads
      logMcpToolActivity({
        tool,
        branchId: context.branchId,
        status: 'success',
        durationMs: duration,
      }).catch(e => logger.error({ err: e }, '[MCP ActivityLog] failed to write success log')),
    ])

    return result
  } catch (error: any) {
    const duration = Date.now() - startTime

    // Same pattern as the success path: one parallel batch, failures logged
    // but never masking the original tool error.
    await Promise.all([
      db.toolExecution.create({
        data: {
          toolId: tool.id,
          requestBody: JSON.stringify(sanitizeObject(params)),
          responseStatus: 500,
          error: error.message,
          duration,
          status: 'error'
        }
      }).catch(e => logger.error({ err: e }, '[MCP Execution History] failed to save error')),

      logMcpToolActivity({
        tool,
        branchId: context.branchId,
        status: 'error',
        durationMs: duration,
        errorMessage: error.message,
      }).catch(e => logger.error({ err: e }, '[MCP ActivityLog] failed to write error log')),
    ])

    throw error
  }
}

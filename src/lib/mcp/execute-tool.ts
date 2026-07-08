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
  context: { branchId?: string | null } = {}
): Promise<unknown> {
  const handlerConfig = safeParseJSON<{ connectionId?: string } & Record<string, unknown>>(tool.handlerConfig, {})

  if (tool.category === 'system') {
    return executeToolWithParams(tool, params, null)
  }

  const connection = resolveToolConnection(
    handlerConfig.connectionId,
    tool.server.connections,
    tool.name
  )

  const startTime = Date.now()
  try {
    const result = await executeToolWithParams(tool, params, connection)
    const duration = Date.now() - startTime

    // Persist execution history — fire-and-forget pattern (catch prevents crash on DB failure)
    await db.toolExecution.create({
      data: {
        toolId: tool.id,
        requestBody: JSON.stringify(sanitizeObject(params)),
        responseStatus: 200,
        responseBody: JSON.stringify(sanitizeObject(result)),
        duration,
        status: 'success'
      }
    }).catch(e => logger.error({ err: e }, '[MCP Execution History] failed to save'))

    // Persist ActivityLog entry — safe fields only, no credentials or full payloads
    await logMcpToolActivity({
      tool,
      branchId: context.branchId,
      status: 'success',
      durationMs: duration,
    }).catch(e => logger.error({ err: e }, '[MCP ActivityLog] failed to write success log'))

    return result
  } catch (error: any) {
    const duration = Date.now() - startTime

    await db.toolExecution.create({
      data: {
        toolId: tool.id,
        requestBody: JSON.stringify(sanitizeObject(params)),
        responseStatus: 500,
        error: error.message,
        duration,
        status: 'error'
      }
    }).catch(e => logger.error({ err: e }, '[MCP Execution History] failed to save error'))

    await logMcpToolActivity({
      tool,
      branchId: context.branchId,
      status: 'error',
      durationMs: duration,
      errorMessage: error.message,
    }).catch(e => logger.error({ err: e }, '[MCP ActivityLog] failed to write error log'))

    throw error
  }
}

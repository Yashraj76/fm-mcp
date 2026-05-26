import { safeParseJSON } from '@/lib/utils/safe-parse'
import type { Tool, McpServer, FMConnectionServer, FMConnection } from '@prisma/client'
import { executeToolWithParams } from '@/lib/tools/executor-service'

type ToolWithServer = Tool & {
  server: McpServer & {
    connections: (FMConnectionServer & { connection: FMConnection })[]
  }
}

export async function executeMcpTool(
  tool: ToolWithServer,
  params: Record<string, any>
): Promise<unknown> {
  const handlerConfig = safeParseJSON(tool.handlerConfig, {})
  
  if (tool.category === 'system') {
    return executeToolWithParams(tool, params, null)
  }

  const connectionId = handlerConfig.connectionId || tool.server.connections[0]?.connectionId
  if (!connectionId) throw new Error('No FileMaker connection associated with this tool/server')

  const connection =
    tool.server.connections.find((c) => c.connectionId === connectionId)?.connection

  if (!connection) throw new Error('FileMaker connection not attached to this server')

  return executeToolWithParams(tool, params, connection)
}

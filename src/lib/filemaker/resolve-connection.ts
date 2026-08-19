import type { FMConnection, FMConnectionServer } from '@prisma/client'

type ConnectionWithFM = FMConnectionServer & { connection: FMConnection }

/**
 * Resolves which FileMaker connection to use for a tool, given the tool's
 * handlerConfig.connectionId and the server's linked connections.
 *
 * Rules:
 *  - the branch has a connectionOverride → use it, unconditionally (lets a
 *    test/feature branch redirect every tool call to a sandbox file without
 *    touching each tool's handlerConfig.connectionId)
 *  - connectionId is set AND found  → use it
 *  - connectionId is set AND NOT found → throw (wrong/unlinked connection)
 *  - connectionId is absent AND server has exactly 1 connection → use it (unambiguous)
 *  - connectionId is absent AND server has 0 connections → throw
 *  - connectionId is absent AND server has >1 connections → throw (ambiguous)
 */
export function resolveToolConnection(
  connectionId: string | null | undefined,
  serverConnections: ConnectionWithFM[],
  toolName: string,
  branchConnectionOverride?: FMConnection | null,
): FMConnection {
  if (branchConnectionOverride) {
    return branchConnectionOverride
  }

  if (connectionId) {
    const found = serverConnections.find((c) => c.connectionId === connectionId)?.connection
    if (!found) {
      throw new Error(
        `Connection "${connectionId}" is not linked to this server. Cannot execute tool "${toolName}".`
      )
    }
    return found
  }

  if (serverConnections.length === 0) {
    throw new Error(`No FileMaker connection linked to server. Cannot execute tool "${toolName}".`)
  }

  if (serverConnections.length === 1) {
    return serverConnections[0].connection
  }

  throw new Error(
    `Tool "${toolName}" has no connectionId in handlerConfig. ` +
      `Cannot determine which of ${serverConnections.length} connections to use.`
  )
}

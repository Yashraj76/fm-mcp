/**
 * Resolves the connectionId for a tool being saved via generate-tools/save.
 *
 * Rules:
 *  - If the tool already carries a connectionId, verify it is linked to the server.
 *  - If absent and the server has exactly 1 connection, auto-default and log it.
 *  - If absent and the server has 0 or 2+ connections, throw with a clear message.
 */
import { logger } from '../logger'

export function resolveSaveConnectionId(
  toolName: string,
  rawConnectionId: string | undefined | null,
  serverConnections: ReadonlyArray<{ connectionId: string }>,
): string {
  if (rawConnectionId) {
    const isLinked = serverConnections.some((c) => c.connectionId === rawConnectionId);
    if (!isLinked) {
      throw new Error(
        `Connection "${rawConnectionId}" is not linked to this server. Cannot save tool "${toolName}". ` +
          `Check the server's connection settings.`,
      );
    }
    return rawConnectionId;
  }

  if (serverConnections.length === 0) {
    throw new Error(
      `Tool "${toolName}" cannot be saved: this server has no FileMaker connections. ` +
        `Add a connection to this server first.`,
    );
  }

  if (serverConnections.length === 1) {
    const defaultId = serverConnections[0].connectionId;
    logger.debug({ connectionId: defaultId, toolName }, '[generate-tools/save] auto-assigned connectionId')
    return defaultId;
  }

  throw new Error(
    `Tool "${toolName}" has no connectionId in handlerConfig. ` +
      `This server has ${serverConnections.length} connections — ` +
      `specify which connection to use by setting handlerConfig.connectionId.`,
  );
}

type ConnectionsTx = {
  fMConnectionServer: {
    deleteMany: (args: { where: { serverId: string } }) => Promise<unknown>
    createMany: (args: { data: Array<{ connectionId: string; serverId: string; fileNames: string }> }) => Promise<unknown>
  }
}

/**
 * Replaces all junction rows for a server with a new set of connections.
 *
 * Must be called inside a prisma.$transaction — the caller owns the transaction
 * boundary so that a createMany failure rolls back the preceding deleteMany.
 */
export async function replaceServerConnections(
  tx: ConnectionsTx,
  serverId: string,
  connectionIds: string[],
  fileNamesPerConnection?: string[],
): Promise<void> {
  await tx.fMConnectionServer.deleteMany({ where: { serverId } })

  if (connectionIds.length > 0) {
    await tx.fMConnectionServer.createMany({
      data: connectionIds.map((connId, index) => ({
        connectionId: connId,
        serverId,
        fileNames: JSON.stringify(
          (fileNamesPerConnection?.[index] ?? '')
            .split(',')
            .map((f: string) => f.trim())
            .filter(Boolean),
        ),
      })),
    })
  }
}

import { prisma } from '../prisma'

function buildQueryOptions(where: any, options?: any) {
  if (!options) return { where }
  if (options.select || options.include) {
    return { where, ...options }
  }
  return { where, include: options }
}

/**
 * ============================================================================
 * MCP SERVERS HELPERS
 * ============================================================================
 */

export async function getMcpServer(id: string, userId: string, options?: any) {
  return prisma.mcpServer.findFirst(buildQueryOptions({ id, userId }, options))
}

export async function listMcpServers(userId: string, options?: any) {
  return prisma.mcpServer.findMany({
    where: { userId },
    ...options,
  })
}

/**
 * ============================================================================
 * FM SERVER CONNECTIONS (Admin Server Connections) HELPERS
 * ============================================================================
 */

export async function getFMServerConnection(id: string, userId: string, options?: any) {
  return prisma.fMServerConnection.findFirst(buildQueryOptions({ id, userId }, options))
}

export async function listFMServerConnections(userId: string, options?: any) {
  return prisma.fMServerConnection.findMany({
    where: { userId },
    ...options,
  })
}

/**
 * ============================================================================
 * FM CONNECTIONS (File-level Connections) HELPERS
 * ============================================================================
 */

export async function getFMConnection(id: string, userId: string, options?: any) {
  return prisma.fMConnection.findFirst(buildQueryOptions({ id, userId }, options))
}

export async function listFMConnections(userId: string, options?: any) {
  return prisma.fMConnection.findMany({
    where: { userId },
    ...options,
  })
}

/**
 * ============================================================================
 * BRANCHES HELPERS
 * ============================================================================
 */

export async function getBranch(id: string, userId: string, options?: any) {
  return prisma.branch.findFirst(buildQueryOptions({ id, server: { userId } }, options))
}

export async function listBranches(serverId: string, userId: string, options?: any) {
  return prisma.branch.findMany({
    where: {
      serverId,
      server: { userId },
    },
    ...options,
  })
}

/**
 * ============================================================================
 * TOOLS HELPERS
 * ============================================================================
 */

export async function getTool(id: string, userId: string, options?: any) {
  return prisma.tool.findFirst(buildQueryOptions({ id, deletedAt: null, server: { userId } }, options))
}

export async function listTools(serverId: string, userId: string, options?: any) {
  return prisma.tool.findMany({
    where: {
      serverId,
      deletedAt: null,
      server: { userId },
    },
    ...options,
  })
}

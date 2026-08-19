import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z, ZodError } from 'zod'
import { withAuth } from "@/lib/auth/api-guard";
import { toSafeServer } from '@/lib/utils/dto'
import { apiSuccess, apiNotFound, apiValidationFailed, apiServerError, apiError } from '@/lib/utils/api-response'
import { safeParseJSON } from '@/lib/utils/safe-parse';
import { getMcpServer } from '@/lib/db/user-scoped';
import { replaceServerConnections } from '@/lib/db/replace-server-connections';
import { logger } from '@/lib/logger'

const updateServerSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  version: z.string().optional(),
  status: z.enum(['draft', 'staging', 'deployed']).optional(),
  serverUrl: z.string().nullable().optional(),
  sseToken: z.string().nullable().optional(),
  proxyUrl: z.string().nullable().optional(),
  config: z.string().optional(),
  connectionIds: z.array(z.string()).optional(),
  fileNamesPerConnection: z.array(z.string()).optional(),
})

// GET /api/servers/[id] - Get a single MCP server with full details
export const GET = withAuth(async (_request, { params, userId }) => {
  try {
    const { id } = await params
    const server = await getMcpServer(id, userId, {
      connections: {
        include: {
          connection: {
            include: {
              // Fetch only the lightweight selection arrays — not the full compiledSchema blob
              browsedSchema: {
                select: { selectedLayouts: true, selectedTables: true },
              },
            },
          },
        },
      },
      branches: {
        orderBy: { isDefault: 'desc' },
      },
      deployments: {
        orderBy: { createdAt: 'desc' },
        take: 10,
        // Exclude the snapshot column (a full server+tools JSON blob) from the
        // list — the latest deployment's snapshot is grafted back below.
        select: {
          id: true,
          serverId: true,
          branchId: true,
          version: true,
          changelog: true,
          status: true,
          isLive: true,
          deployedAt: true,
          createdAt: true,
        },
      },
      apiKey: true,
      _count: {
        select: {
          tools: true,
          deployments: true,
          branches: true,
          connections: true,
        },
      },
    })

    if (!server) {
      return apiNotFound('Server not found')
    }

    // The "Deployed Tools" tab reads deployments[0].snapshot — fetch that one
    // blob rather than pulling snapshots for all 10 listed deployments.
    const deployments = (server as { deployments?: Array<{ id: string; snapshot?: string }> }).deployments
    if (deployments && deployments.length > 0) {
      const latest = await db.deployment.findUnique({
        where: { id: deployments[0].id },
        select: { snapshot: true },
      })
      deployments[0].snapshot = latest?.snapshot
    }

    return apiSuccess(toSafeServer(server))
  } catch (error) {
    logger.error({ err: error }, '[API Error]')
    return apiServerError('Failed to fetch server')
  }
});

// PUT /api/servers/[id] - Update a server
export const PUT = withAuth(async (request, { params, userId }) => {
  try {
    const { id } = await params
    const existing = await getMcpServer(id, userId)
    if (!existing) {
      return apiNotFound('Server not found')
    }

    const body = await request.json()
    const parsed = updateServerSchema.parse(body)

    const { connectionIds, fileNamesPerConnection, ...updateData } = parsed

    // Verify all connectionIds belong to the user
    if (connectionIds !== undefined && connectionIds.length > 0) {
      const ownedConnections = await db.fMConnection.findMany({
        where: {
          id: { in: connectionIds },
          userId,
        },
        select: { id: true }
      });
      if (ownedConnections.length !== connectionIds.length) {
        return apiNotFound('One or more connections not found');
      }
    }

    // If connection IDs are provided, replace junction records and update the
    // server atomically. All three operations (deleteMany, createMany, update)
    // share a single transaction so a createMany failure cannot leave the server
    // with zero connections.
    let server: Awaited<ReturnType<typeof db.mcpServer.update>>

    if (connectionIds !== undefined) {
      // Pre-compute config change — pure computation, no DB needed
      const currentConfig = safeParseJSON<Record<string, unknown>>(existing.config, {})
      currentConfig.connections = connectionIds
      currentConfig.fileNames = fileNamesPerConnection || []
      currentConfig.updatedAt = new Date().toISOString()
      updateData.config = JSON.stringify(currentConfig)

      server = await db.$transaction(async (tx) => {
        await replaceServerConnections(tx, id, connectionIds, fileNamesPerConnection)
        return tx.mcpServer.update({ where: { id }, data: updateData })
      })
    } else {
      server = await db.mcpServer.update({ where: { id }, data: updateData })
    }

    return apiSuccess(toSafeServer(server))
  } catch (error: any) {
    if (error instanceof ZodError) {
      return apiValidationFailed(error.issues)
    }
    if (error?.code === 'P2002') {
      return apiError('One or more connections are already linked to this server', 'CONFLICT', 409)
    }
    logger.error({ err: error }, '[API Error]')
    return apiServerError('Failed to update server')
  }
});

// DELETE /api/servers/[id] - Delete a server and all associated data
export const DELETE = withAuth(async (_request, { params, userId }) => {
  try {
    const { id } = await params
    const existing = await getMcpServer(id, userId)
    if (!existing) {
      return apiNotFound('Server not found')
    }

    await db.mcpServer.delete({ where: { id } })

    return apiSuccess(null)
  } catch (error) {
    logger.error({ err: error }, '[API Error]')
    return apiServerError('Failed to delete server')
  }
});

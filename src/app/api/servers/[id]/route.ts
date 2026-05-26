import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z, ZodError } from 'zod'
import { withAuth } from "@/lib/auth/api-guard";
import { toSafeServer } from '@/lib/utils/dto'
import { apiSuccess, apiNotFound, apiValidationFailed, apiServerError } from '@/lib/utils/api-response'
import { safeParseJSON } from '@/lib/utils/safe-parse';
import { getMcpServer } from '@/lib/db/user-scoped';

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
              browsedSchema: {
                select: {
                  compiledSchema: true,
                },
              },
              relationshipGraph: true,
            },
          },
        },
      },
      branches: {
        orderBy: { isDefault: 'desc' },
        include: {
          tools: {
            include: { tool: true }
          },
        },
      },
      deployments: {
        orderBy: { createdAt: 'desc' },
        take: 10,
      },
      tools: {
        orderBy: { sortOrder: 'asc' },
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

    return apiSuccess(toSafeServer(server))
  } catch (error) {
    console.error('[API Error]', error)
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

    // If connection IDs are provided, update junction records
    if (connectionIds !== undefined) {
      // Delete existing connections
      await db.fMConnectionServer.deleteMany({
        where: { serverId: id },
      })

      // Create new junction records
      if (connectionIds.length > 0) {
        await db.fMConnectionServer.createMany({
          data: connectionIds.map((connId, index) => ({
            connectionId: connId,
            serverId: id,
            fileNames: JSON.stringify(
              (fileNamesPerConnection?.[index] || '')
                .split(',')
                .map(f => f.trim())
                .filter(Boolean)
            ),
          })),
        })
      }

      // Update config
      const currentConfig = safeParseJSON(existing.config, {})
      currentConfig.connections = connectionIds
      currentConfig.fileNames = fileNamesPerConnection || []
      currentConfig.updatedAt = new Date().toISOString()
      updateData.config = JSON.stringify(currentConfig)
    }

    const server = await db.mcpServer.update({
      where: { id },
      data: updateData,
    })

    return apiSuccess(toSafeServer(server))
  } catch (error) {
    if (error instanceof ZodError) {
      return apiValidationFailed(error.issues)
    }
    console.error('[API Error]', error)
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
    console.error('[API Error]', error)
    return apiServerError('Failed to delete server')
  }
});

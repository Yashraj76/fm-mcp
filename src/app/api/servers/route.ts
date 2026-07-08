import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z, ZodError } from 'zod'
import { withAuth } from "@/lib/auth/api-guard";
import { toSafeServer } from '@/lib/utils/dto'
import { apiSuccess, apiNotFound, apiValidationFailed, apiServerError, apiError } from '@/lib/utils/api-response'
import { logger } from '@/lib/logger'

const createServerSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  version: z.string().optional().default('1.0.0'),
  connectionIds: z.array(z.string()).optional(),
  fileNamesPerConnection: z.array(z.string()).optional(),
})

// GET /api/servers - List all MCP servers
// POST /api/servers - Create a new MCP server
export const GET = withAuth(async (req, { params, userId }) => {
    try {
    const servers = await db.mcpServer.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      include: {
        connections: {
          include: {
            connection: {
              select: { id: true, name: true, host: true, status: true, database: true },
            },
          },
        },
        branches: {
          where: { status: 'active' },
          orderBy: { isDefault: 'desc' },
        },
        tools: {
          where: { isEnabled: true },
          select: { id: true, name: true, isEnabled: true, category: true, sortOrder: true },
        },
        deployments: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
        _count: {
          select: {
            tools: true,
            deployments: true,
            branches: true,
            connections: true,
          },
        },
      },
    })

    return apiSuccess(servers.map(toSafeServer))
    } catch (error) {
    logger.error({ err: error }, '[API Error]')
    return apiServerError('Failed to fetch servers')
    }
    });
export const POST = withAuth(async (request, { params, userId }) => {
    try {
    const body = await request.json()
    const parsed = createServerSchema.parse(body)

    const { name, description, version, connectionIds, fileNamesPerConnection } = parsed

    // Verify all connectionIds belong to the user
    if (connectionIds && connectionIds.length > 0) {
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

    // Auto-generate config from connections
    const config = JSON.stringify({
      name,
      description,
      version,
      connections: connectionIds || [],
      fileNames: fileNamesPerConnection || [],
      createdAt: new Date().toISOString(),
    })

    const server = await db.mcpServer.create({
      data: {
          userId: userId,
        name,
        description,
        version: version || '1.0.0',
        config,
        sseToken: `fmcp_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
        proxyUrl: `/mcp/${name.toLowerCase().replace(/\s+/g, '-')}`,
      },
    })

    // Create junction records for connections
    if (connectionIds && connectionIds.length > 0) {
      await db.fMConnectionServer.createMany({
        data: connectionIds.map((connId, index) => ({
          connectionId: connId,
          serverId: server.id,
          fileNames: JSON.stringify((fileNamesPerConnection?.[index] || '').split(',').map(f => f.trim()).filter(Boolean)),
        })),
  })
}

// Always create main branch on server creation
const mainBranch = await db.branch.create({
  data: {
    name: 'main',
    serverId: server.id,
    isDefault: true,
    isProtected: true,
    description: 'Production branch — always live',
    status: 'active',
  },
})

const { log, LOG_ACTIONS } = await import('@/lib/logging/logger');
log({
  action: LOG_ACTIONS.BRANCH_CREATED,
  entityType: 'branch', entityId: mainBranch.id, entityName: 'main',
  serverId: server.id,
  meta: { isDefault: true, isProtected: true },
  actorUserId: userId,
});

// Start background job to generate tools if there are connections
if (connectionIds && connectionIds.length > 0) {
  // Create the job record first so we can track progress
  const job = await db.toolGenerationJob.create({
    data: {
      userId: userId,
      serverId: server.id,
      status: 'pending',
      progress: 0,
      log: JSON.stringify([{ time: new Date().toISOString(), message: 'Job created via server setup', level: 'info' }])
    }
  });

  setImmediate(async () => {
    try {
      const { runToolGenerationJob } = await import('@/lib/tools/job-runner');
      await runToolGenerationJob(job.id, server.id, userId, connectionIds[0]);
    } catch (e) {
      logger.error({ err: e }, '[ServerCreation] Tool generation error:');
    }
  });
}

return apiSuccess(toSafeServer(server), 201)
} catch (error: any) {
if (error instanceof ZodError) {
  return apiValidationFailed(error.issues)
}
if (error?.code === 'P2002') {
  return apiError('One or more connections are already linked to this server', 'CONFLICT', 409)
}
logger.error({ err: error }, '[API Error]')
return apiServerError('Failed to create server')
}
});

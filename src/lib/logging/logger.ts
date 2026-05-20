import { prisma } from '../prisma';

export const LOG_ACTIONS = {
  SERVER_CREATED: 'server.created',
  SERVER_UPDATED: 'server.updated',
  SERVER_DELETED: 'server.deleted',
  BRANCH_CREATED: 'branch.created',
  BRANCH_MERGED: 'branch.merged',
  BRANCH_ARCHIVED: 'branch.archived',
  BRANCH_DELETED: 'branch.deleted',
  BRANCH_UPDATED: 'branch.updated',
  BRANCH_REVERTED: 'branch.reverted',
  TOOL_CREATED: 'tool.created',
  TOOL_UPDATED: 'tool.updated',
  TOOL_DELETED: 'tool.deleted',
  TOOL_ENABLED: 'tool.enabled',
  TOOL_DISABLED: 'tool.disabled',
  TOOL_GENERATED: 'tool.generated',
  TOOL_EXECUTED: 'tool.executed',
  TOOL_EXECUTION_FAILED: 'tool.execution_failed',
  DEPLOYMENT_CREATED: 'deployment.created',
  DEPLOYMENT_ROLLED_BACK: 'deployment.rolled_back',
  CONNECTION_CREATED: 'connection.created',
  CONNECTION_TESTED: 'connection.tested',
  SCHEMA_BROWSED: 'schema.browsed',
  RELATIONSHIPS_INFERRED: 'schema.relationships_inferred',
  API_KEY_GENERATED: 'api_key.generated',
  API_KEY_ROTATED: 'api_key.rotated',
  API_KEY_REVOKED: 'api_key.revoked',
  API_KEY_USED: 'api_key.used',
} as const;

export type LogAction = typeof LOG_ACTIONS[keyof typeof LOG_ACTIONS];

interface LogOptions {
  action: LogAction;
  entityType: string;
  entityId: string;
  entityName: string;
  serverId?: string;
  branchId?: string;
  deploymentId?: string;
  before?: string;
  after?: string;
  meta?: Record<string, any>;
  actorIp?: string;
}

// Fire-and-forget — never awaited in main request path
export function log(options: LogOptions): void {
  prisma.activityLog.create({
    data: {
      action: options.action,
      entityType: options.entityType,
      entityId: options.entityId,
      entityName: options.entityName,
      serverId: options.serverId ?? null,
      branchId: options.branchId ?? null,
      deploymentId: options.deploymentId ?? null,
      before: options.before ?? null,
      after: options.after ?? null,
      meta: options.meta ? JSON.stringify(options.meta) : null,
      actorIp: options.actorIp ?? null,
    },
  }).catch(err => {
    // Log errors to console only — never re-throw
    console.error('[Logger] Failed to write activity log:', err.message);
  });
}

// Awaitable version for when you need to ensure the log is written
export async function logAwait(options: LogOptions): Promise<void> {
  try {
    await prisma.activityLog.create({
      data: {
        action: options.action,
        entityType: options.entityType,
        entityId: options.entityId,
        entityName: options.entityName,
        serverId: options.serverId ?? null,
        branchId: options.branchId ?? null,
        deploymentId: options.deploymentId ?? null,
        before: options.before ?? null,
        after: options.after ?? null,
        meta: options.meta ? JSON.stringify(options.meta) : null,
        actorIp: options.actorIp ?? null,
      },
    });
  } catch (err: any) {
    console.error('[Logger] Failed:', err.message);
  }
}

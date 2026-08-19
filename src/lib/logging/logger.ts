import { prisma } from '../prisma';
import { logger as structuredLogger } from '../logger';

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

export interface LogOptions {
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
  /** Supabase user UUID from the authenticated session. Null for API-key/MCP requests. */
  actorUserId?: string;
  actorIp?: string;
  actorSession?: string;
}

/**
 * Build the ActivityLog row data from a LogOptions object.
 * Exported as a pure function so it can be tested without a database connection.
 */
export function buildActivityLogData(options: LogOptions) {
  return {
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
    actorUserId: options.actorUserId ?? null,
    actorIp: options.actorIp ?? null,
    actorSession: options.actorSession ?? null,
  };
}

/**
 * Where-clause for fetching a single activity-log entry on behalf of a user.
 * Server-scoped entries are visible to the server's owner; global
 * (null-server) entries are visible ONLY to the user who performed them —
 * without the actorUserId scope, any authenticated user could read any other
 * user's global activity (e.g. API-key events). Exported as a pure function
 * so it can be tested without a database connection.
 */
export function buildLogEntryAccessWhere(id: string, userId: string) {
  return {
    id,
    OR: [
      { serverId: null, actorUserId: userId },
      { server: { userId } },
    ],
  };
}

// Fire-and-forget — never awaited in main request path
export function log(options: LogOptions): void {
  prisma.activityLog.create({
    data: buildActivityLogData(options),
  }).catch(err => {
    structuredLogger.error({ errMsg: err?.message }, '[ActivityLog] failed to write')
  });
}

// Awaitable version for when you need to ensure the log is written
export async function logAwait(options: LogOptions): Promise<void> {
  try {
    await prisma.activityLog.create({
      data: buildActivityLogData(options),
    });
  } catch (err: any) {
    structuredLogger.error({ errMsg: err?.message }, '[ActivityLog] failed to write')
  }
}

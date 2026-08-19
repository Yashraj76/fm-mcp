import { safeParseJSON } from '@/lib/utils/safe-parse';
import type {
  FMServerConnection,
  FMConnection,
  McpServer,
  McpApiKey,
  Tool,
  Branch,
  Deployment,
  AppSettings,
  FMConnectionServer
} from '@prisma/client';

/**
 * Data Transfer Object (DTO) mapping helpers for secure API responses.
 * Ensures passwords, key hashes, encrypted keys, and secret tokens are never returned.
 */

export interface SafeServerConnection {
  id: string;
  userId: string;
  name: string;
  host: string;
  port: number;
  adminUsername: string;
  sslVerify: boolean;
  status: string;
  lastTestedAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
  connections?: SafeConnection[];
}

export function toSafeServerConnection(sc: Partial<FMServerConnection> & { connections?: Partial<FMConnection>[] } | null | undefined): SafeServerConnection | null {
  if (!sc) return null;
  return {
    id: sc.id,
    userId: sc.userId,
    name: sc.name,
    host: sc.host,
    port: sc.port,
    adminUsername: sc.adminUsername,
    sslVerify: sc.sslVerify,
    status: sc.status,
    lastTestedAt: sc.lastTestedAt,
    lastError: sc.lastError,
    createdAt: sc.createdAt,
    updatedAt: sc.updatedAt,
    connections: sc.connections ? sc.connections.map(c => toSafeConnection(c)).filter((c): c is SafeConnection => c !== null) : undefined,
  } as SafeServerConnection;
}

export interface SafeConnection {
  id: string;
  userId: string;
  name: string;
  host: string;
  port: number;
  database: string;
  username: string;
  authType: string;
  clientId: string | null;
  sslVerify: boolean;
  version: string | null;
  status: string;
  lastTested: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
  serverConnectionId?: string | null;
  serverConnection?: SafeServerConnection | null;
  browsedSchema?: unknown;
  relationshipGraph?: unknown;
}

export type ConnectionInput = Partial<FMConnection> & { 
  serverConnection?: Partial<FMServerConnection> | null, 
  browsedSchema?: unknown, 
  relationshipGraph?: unknown 
};

export function toSafeConnection(conn: ConnectionInput | null | undefined): SafeConnection | null {
  if (!conn) return null;
  return {
    id: conn.id,
    userId: conn.userId,
    name: conn.name,
    host: conn.host,
    port: conn.port,
    database: conn.database,
    username: conn.username,
    authType: conn.authType,
    clientId: conn.clientId,
    sslVerify: conn.sslVerify,
    version: conn.version,
    status: conn.status,
    lastTested: conn.lastTested,
    lastError: conn.lastError,
    createdAt: conn.createdAt,
    updatedAt: conn.updatedAt,
    serverConnectionId: conn.serverConnectionId,
    serverConnection: conn.serverConnection ? toSafeServerConnection(conn.serverConnection) : undefined,
    browsedSchema: conn.browsedSchema || undefined,
    relationshipGraph: conn.relationshipGraph || undefined,
  } as SafeConnection;
}

export interface SafeServer {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  version: string;
  status: string;
  serverUrl: string | null;
  proxyUrl: string | null;
  config: string;
  createdAt: Date;
  updatedAt: Date;
  connections?: { id: string; connectionId: string; serverId: string; fileNames: string; isActive: boolean; connection?: SafeConnection | null }[];
  branches?: SafeBranch[];
  deployments?: SafeDeployment[];
  tools?: SafeTool[];
  apiKey?: SafeApiKey | null;
}

export type ServerInput = Partial<McpServer> & {
  connections?: (Partial<FMConnectionServer> & { connection?: ConnectionInput | null })[];
  branches?: BranchInput[];
  deployments?: DeploymentInput[];
  tools?: ToolInput[];
  apiKey?: Partial<McpApiKey> | null;
};

export function toSafeServer(server: ServerInput | null | undefined): SafeServer | null {
  if (!server) return null;
  return {
    id: server.id,
    userId: server.userId,
    name: server.name,
    description: server.description,
    version: server.version,
    status: server.status,
    serverUrl: server.serverUrl,
    proxyUrl: server.proxyUrl,
    config: server.config,
    createdAt: server.createdAt,
    updatedAt: server.updatedAt,
    connections: server.connections ? server.connections.map((c) => ({
      id: c.id,
      connectionId: c.connectionId,
      serverId: c.serverId,
      fileNames: c.fileNames,
      isActive: c.isActive ?? true,
      connection: c.connection ? toSafeConnection(c.connection) : undefined
    })) : undefined,
    branches: server.branches ? server.branches.map(b => toSafeBranch(b)).filter((b): b is SafeBranch => b !== null) : undefined,
    deployments: server.deployments ? server.deployments.map(d => toSafeDeployment(d)).filter((d): d is SafeDeployment => d !== null) : undefined,
    tools: server.tools ? server.tools.map(t => toSafeTool(t)).filter((t): t is SafeTool => t !== null) : undefined,
    apiKey: server.apiKey ? toSafeApiKey(server.apiKey) : undefined,
  } as SafeServer;
}

// Lightweight shape for list/dropdown consumers (servers-page.tsx cards) —
// deliberately excludes userId/config/serverUrl/proxyUrl and the nested
// connection/deployment/branch detail the full `SafeServer` carries, since
// list views only ever read counts and health-flag booleans off these.
export interface SafeServerSummary {
  id: string;
  name: string;
  description: string | null;
  version: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  connections: { isActive: boolean }[];
  tools: { isEnabled: boolean }[];
  deployments: { status: string }[];
  _count: { tools: number; deployments: number; branches: number; connections: number };
}

export function toSafeServerSummary(server: SafeServerSummary): SafeServerSummary {
  return {
    id: server.id,
    name: server.name,
    description: server.description,
    version: server.version,
    status: server.status,
    createdAt: server.createdAt,
    updatedAt: server.updatedAt,
    connections: server.connections,
    tools: server.tools,
    deployments: server.deployments,
    _count: server._count,
  };
}

export interface SafeApiKey {
  id: string;
  serverId: string;
  keyPrefix: string;
  createdAt: Date;
  lastUsedAt: Date | null;
}

export function toSafeApiKey(key: Partial<McpApiKey> | null | undefined): SafeApiKey | null {
  if (!key) return null;
  return {
    id: key.id,
    serverId: key.serverId,
    keyPrefix: key.keyPrefix,
    createdAt: key.createdAt,
    lastUsedAt: key.lastUsedAt || null,
  } as SafeApiKey;
}

export interface SafeTool {
  id: string;
  serverId: string;
  name: string;
  description: string;
  category: string | null;
  inputSchema: string;
  outputSchema: string | null;
  outputSelector: string | null;
  handlerConfig: string;
  fmLayout: string | null;
  fmScript: string | null;
  fmMethod: string | null;
  isEnabled: boolean;
  version: number;
  isAiGenerated: boolean;
  testConfig: string | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  server?: SafeServer | null;
}

export type ToolInput = Partial<Tool> & { server?: ServerInput | null };

export function toSafeTool(tool: ToolInput | null | undefined): SafeTool | null {
  if (!tool) return null;
  
  // Strip out passwords or client credentials that might have leaked into handlerConfig
  let sanitizedHandlerConfig = tool.handlerConfig;
  const config = safeParseJSON<Record<string, unknown>>(tool.handlerConfig, null);
  if (config && typeof config === 'object') {
    if ('password' in config) delete config.password;
    if ('adminPassword' in config) delete config.adminPassword;
    if ('clientSecret' in config) delete config.clientSecret;
    if ('refreshToken' in config) delete config.refreshToken;
    if ('accessToken' in config) delete config.accessToken;
    sanitizedHandlerConfig = JSON.stringify(config);
  }

  return {
    id: tool.id,
    serverId: tool.serverId,
    name: tool.name,
    description: tool.description,
    category: tool.category,
    inputSchema: tool.inputSchema,
    outputSchema: tool.outputSchema,
    outputSelector: tool.outputSelector ?? null,
    handlerConfig: sanitizedHandlerConfig,
    fmLayout: tool.fmLayout,
    fmScript: tool.fmScript,
    fmMethod: tool.fmMethod,
    isEnabled: tool.isEnabled,
    version: tool.version,
    isAiGenerated: tool.isAiGenerated,
    testConfig: tool.testConfig,
    sortOrder: tool.sortOrder,
    createdAt: tool.createdAt,
    updatedAt: tool.updatedAt,
    server: tool.server ? toSafeServer(tool.server) : undefined,
  } as SafeTool;
}

export interface SafeBranch {
  id: string;
  serverId: string;
  name: string;
  isDefault: boolean;
  isProtected: boolean;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  connectionOverrideId?: string | null;
  // Minimal, credential-free preview — never the full FMConnection.
  connectionOverride?: { id: string; name: string; database: string } | null;
  server?: SafeServer | null;
}

export type BranchInput = Partial<Branch> & {
  server?: ServerInput | null;
  connectionOverride?: Partial<FMConnection> | null;
};

export function toSafeBranch(branch: BranchInput | null | undefined): SafeBranch | null {
  if (!branch) return null;
  return {
    id: branch.id,
    serverId: branch.serverId,
    name: branch.name,
    isDefault: branch.isDefault,
    isProtected: branch.isProtected,
    status: branch.status,
    createdAt: branch.createdAt,
    updatedAt: branch.updatedAt,
    connectionOverrideId: branch.connectionOverrideId,
    connectionOverride: branch.connectionOverride
      ? { id: branch.connectionOverride.id!, name: branch.connectionOverride.name!, database: branch.connectionOverride.database! }
      : branch.connectionOverride,
    server: branch.server ? toSafeServer(branch.server) : undefined,
  } as SafeBranch;
}

export interface SafeDeployment {
  id: string;
  serverId: string;
  branchId: string;
  version: string;
  changelog: string | null;
  status: string;
  isLive: boolean;
  snapshot: string;
  deployedAt: Date;
  createdAt: Date;
  server?: SafeServer | null;
  branch?: SafeBranch | null;
}

export type DeploymentInput = Partial<Deployment> & { server?: ServerInput | null, branch?: BranchInput | null };

export function toSafeDeployment(dep: DeploymentInput | null | undefined): SafeDeployment | null {
  if (!dep) return null;

  // Clean snapshot if it contains raw connection info with credentials
  let sanitizedSnapshot = dep.snapshot;
  const snap = safeParseJSON(dep.snapshot);
  if (snap && typeof snap === 'object' && !Array.isArray(snap)) {
    const snapObj = snap as Record<string, unknown>;
    if (Array.isArray(snapObj.connections)) {
      snapObj.connections = snapObj.connections.map((c: unknown) => {
        if (c && typeof c === 'object') {
          const conn = c as Record<string, unknown>;
          if (conn.password) delete conn.password;
          if (conn.clientSecret) delete conn.clientSecret;
          return conn;
        }
        return c;
      });
    }
    sanitizedSnapshot = JSON.stringify(snapObj);
  }

  return {
    id: dep.id,
    serverId: dep.serverId,
    branchId: dep.branchId,
    version: dep.version,
    changelog: dep.changelog,
    status: dep.status,
    isLive: dep.isLive,
    snapshot: sanitizedSnapshot,
    deployedAt: dep.deployedAt,
    createdAt: dep.createdAt,
    server: dep.server ? toSafeServer(dep.server) : undefined,
    branch: dep.branch ? toSafeBranch(dep.branch) : undefined,
  } as SafeDeployment;
}

export interface SafeAppSettings {
  id: string;
  userId: string | null;
  aiProvider: string;
  aiModel: string;
  aiBaseUrl: string;
  aiMaxTokens: number;
  aiTemperature: number;
  createdAt: Date;
  updatedAt: Date;
}

export function toSafeAppSettings(settings: Partial<AppSettings> | null | undefined): SafeAppSettings | null {
  if (!settings) return null;
  return {
    id: settings.id,
    userId: settings.userId,
    aiProvider: settings.aiProvider,
    aiModel: settings.aiModel,
    aiBaseUrl: settings.aiBaseUrl,
    aiMaxTokens: settings.aiMaxTokens,
    aiTemperature: settings.aiTemperature,
    createdAt: settings.createdAt,
    updatedAt: settings.updatedAt,
  } as SafeAppSettings;
}

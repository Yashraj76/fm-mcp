import { safeParseJSON } from '@/lib/utils/safe-parse';

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

export function toSafeServerConnection(sc: any): SafeServerConnection | null {
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
    connections: sc.connections ? sc.connections.map(toSafeConnection) : undefined,
  };
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
  browsedSchema?: any;
  relationshipGraph?: any;
}

export function toSafeConnection(conn: any): SafeConnection | null {
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
  };
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
  connections?: any[];
  branches?: any[];
  deployments?: any[];
  tools?: any[];
  apiKey?: SafeApiKey | null;
}

export function toSafeServer(server: any): SafeServer | null {
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
    connections: server.connections ? server.connections.map((c: any) => ({
      id: c.id,
      connectionId: c.connectionId,
      serverId: c.serverId,
      fileNames: c.fileNames,
      connection: c.connection ? toSafeConnection(c.connection) : undefined
    })) : undefined,
    branches: server.branches ? server.branches.map(toSafeBranch) : undefined,
    deployments: server.deployments ? server.deployments.map(toSafeDeployment) : undefined,
    tools: server.tools ? server.tools.map(toSafeTool) : undefined,
    apiKey: server.apiKey ? toSafeApiKey(server.apiKey) : undefined,
  };
}

export interface SafeApiKey {
  id: string;
  serverId: string;
  keyPrefix: string;
  createdAt: Date;
  lastUsedAt: Date | null;
}

export function toSafeApiKey(key: any): SafeApiKey | null {
  if (!key) return null;
  return {
    id: key.id,
    serverId: key.serverId,
    keyPrefix: key.keyPrefix,
    createdAt: key.createdAt,
    lastUsedAt: key.lastUsedAt,
  };
}

export interface SafeTool {
  id: string;
  serverId: string;
  name: string;
  description: string;
  category: string | null;
  inputSchema: string;
  outputSchema: string | null;
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

export function toSafeTool(tool: any): SafeTool | null {
  if (!tool) return null;
  
  // Strip out passwords or client credentials that might have leaked into handlerConfig
  let sanitizedHandlerConfig = tool.handlerConfig;
  const config = safeParseJSON(tool.handlerConfig);
  if (config && typeof config === 'object') {
    if (config.password) delete config.password;
    if (config.adminPassword) delete config.adminPassword;
    if (config.clientSecret) delete config.clientSecret;
    if (config.refreshToken) delete config.refreshToken;
    if (config.accessToken) delete config.accessToken;
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
  };
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
  server?: SafeServer | null;
}

export function toSafeBranch(branch: any): SafeBranch | null {
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
    server: branch.server ? toSafeServer(branch.server) : undefined,
  };
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

export function toSafeDeployment(dep: any): SafeDeployment | null {
  if (!dep) return null;

  // Clean snapshot if it contains raw connection info with credentials
  let sanitizedSnapshot = dep.snapshot;
  const snap = safeParseJSON(dep.snapshot);
  if (snap && typeof snap === 'object') {
    if (snap.connections) {
      snap.connections = snap.connections.map((c: any) => {
        if (c.password) delete c.password;
        if (c.clientSecret) delete c.clientSecret;
        return c;
      });
    }
    sanitizedSnapshot = JSON.stringify(snap);
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
  };
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

export function toSafeAppSettings(settings: any): SafeAppSettings | null {
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
  };
}

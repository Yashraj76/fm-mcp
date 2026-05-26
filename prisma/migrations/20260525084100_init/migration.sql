-- CreateTable
CREATE TABLE "FMServerConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 443,
    "adminUsername" TEXT NOT NULL,
    "adminPasswordEncrypted" TEXT NOT NULL,
    "sslVerify" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'unknown',
    "lastTestedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FMServerConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FMConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 443,
    "database" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "authType" TEXT NOT NULL DEFAULT 'basic',
    "clientId" TEXT,
    "clientSecret" TEXT,
    "refreshToken" TEXT,
    "accessToken" TEXT,
    "tokenExpiry" TIMESTAMP(3),
    "sslVerify" BOOLEAN NOT NULL DEFAULT true,
    "version" TEXT,
    "status" TEXT NOT NULL DEFAULT 'disconnected',
    "lastTested" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "serverConnectionId" TEXT,

    CONSTRAINT "FMConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrowsedSchema" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "rawLayouts" TEXT NOT NULL DEFAULT '[]',
    "rawScripts" TEXT NOT NULL DEFAULT '[]',
    "rawLayoutMeta" TEXT NOT NULL DEFAULT '{}',
    "rawODataTables" TEXT NOT NULL DEFAULT '[]',
    "rawODataMeta" TEXT NOT NULL DEFAULT '{}',
    "suggestedRelationships" TEXT NOT NULL DEFAULT '[]',
    "selectedLayouts" TEXT NOT NULL DEFAULT '[]',
    "selectedTables" TEXT NOT NULL DEFAULT '[]',
    "selectedScripts" TEXT NOT NULL DEFAULT '[]',
    "compiledSchema" TEXT NOT NULL DEFAULT '{}',
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrowsedSchema_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FMSchemaCache" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "databaseName" TEXT NOT NULL,
    "layouts" TEXT NOT NULL,
    "scripts" TEXT NOT NULL,
    "tables" TEXT NOT NULL,
    "fields" TEXT NOT NULL,
    "relationships" TEXT NOT NULL,
    "cachedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FMSchemaCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "McpServer" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "description" TEXT,
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "serverUrl" TEXT,
    "sseToken" TEXT,
    "proxyUrl" TEXT,
    "config" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "McpServer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "McpApiKey" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "McpApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FMConnectionServer" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "fileNames" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FMConnectionServer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Branch" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isProtected" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "mergedIntoId" TEXT,
    "mergedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BranchTool" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "toolId" TEXT NOT NULL,
    "action" TEXT NOT NULL DEFAULT 'inherited',
    "overrideData" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BranchTool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tool" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT,
    "inputSchema" TEXT NOT NULL,
    "outputSchema" TEXT,
    "handlerConfig" TEXT NOT NULL,
    "fmLayout" TEXT,
    "fmScript" TEXT,
    "fmMethod" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isAiGenerated" BOOLEAN NOT NULL DEFAULT false,
    "testConfig" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ToolExecution" (
    "id" TEXT NOT NULL,
    "toolId" TEXT NOT NULL,
    "requestId" TEXT,
    "requestBody" TEXT,
    "responseStatus" INTEGER,
    "responseBody" TEXT,
    "duration" INTEGER,
    "error" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ToolExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deployment" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "snapshot" TEXT NOT NULL,
    "changelog" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "isLive" BOOLEAN NOT NULL DEFAULT false,
    "deployedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Deployment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "entityName" TEXT NOT NULL,
    "serverId" TEXT,
    "branchId" TEXT,
    "deploymentId" TEXT,
    "before" TEXT,
    "after" TEXT,
    "meta" TEXT,
    "actorIp" TEXT,
    "actorSession" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiSuggestion" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "branchId" TEXT,
    "schemaContext" TEXT NOT NULL,
    "suggestionType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "proposedConfig" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "userId" TEXT,
    "aiProvider" TEXT NOT NULL DEFAULT 'anthropic',
    "aiModel" TEXT NOT NULL DEFAULT 'claude-sonnet-4-5',
    "aiApiKeyEncrypted" TEXT NOT NULL DEFAULT '',
    "aiBaseUrl" TEXT NOT NULL DEFAULT '',
    "aiMaxTokens" INTEGER NOT NULL DEFAULT 4096,
    "aiTemperature" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RelationshipGraph" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "relationships" TEXT NOT NULL,
    "generatedBy" TEXT NOT NULL DEFAULT 'ai',
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RelationshipGraph_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ToolGenerationJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "serverId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "log" TEXT NOT NULL DEFAULT '[]',
    "generatedTools" TEXT,
    "toolsCreated" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ToolGenerationJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaygroundSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "serverId" TEXT,
    "userMessage" TEXT NOT NULL,
    "agentPlan" TEXT,
    "stepLog" TEXT NOT NULL DEFAULT '[]',
    "finalResult" TEXT,
    "status" TEXT NOT NULL DEFAULT 'running',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlaygroundSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FMServerConnection_userId_idx" ON "FMServerConnection"("userId");

-- CreateIndex
CREATE INDEX "FMConnection_userId_idx" ON "FMConnection"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "BrowsedSchema_connectionId_key" ON "BrowsedSchema"("connectionId");

-- CreateIndex
CREATE INDEX "McpServer_userId_idx" ON "McpServer"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "McpApiKey_serverId_key" ON "McpApiKey"("serverId");

-- CreateIndex
CREATE UNIQUE INDEX "Branch_serverId_name_key" ON "Branch"("serverId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "BranchTool_branchId_toolId_key" ON "BranchTool"("branchId", "toolId");

-- CreateIndex
CREATE INDEX "ActivityLog_serverId_createdAt_idx" ON "ActivityLog"("serverId", "createdAt");

-- CreateIndex
CREATE INDEX "ActivityLog_entityType_entityId_idx" ON "ActivityLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "ActivityLog_action_createdAt_idx" ON "ActivityLog"("action", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RelationshipGraph_connectionId_key" ON "RelationshipGraph"("connectionId");

-- AddForeignKey
ALTER TABLE "FMConnection" ADD CONSTRAINT "FMConnection_serverConnectionId_fkey" FOREIGN KEY ("serverConnectionId") REFERENCES "FMServerConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrowsedSchema" ADD CONSTRAINT "BrowsedSchema_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "FMConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FMSchemaCache" ADD CONSTRAINT "FMSchemaCache_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "FMConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpApiKey" ADD CONSTRAINT "McpApiKey_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "McpServer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FMConnectionServer" ADD CONSTRAINT "FMConnectionServer_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "FMConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FMConnectionServer" ADD CONSTRAINT "FMConnectionServer_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "McpServer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "McpServer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchTool" ADD CONSTRAINT "BranchTool_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchTool" ADD CONSTRAINT "BranchTool_toolId_fkey" FOREIGN KEY ("toolId") REFERENCES "Tool"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tool" ADD CONSTRAINT "Tool_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "McpServer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolExecution" ADD CONSTRAINT "ToolExecution_toolId_fkey" FOREIGN KEY ("toolId") REFERENCES "Tool"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deployment" ADD CONSTRAINT "Deployment_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "McpServer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deployment" ADD CONSTRAINT "Deployment_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "McpServer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "Deployment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RelationshipGraph" ADD CONSTRAINT "RelationshipGraph_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "FMConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolGenerationJob" ADD CONSTRAINT "ToolGenerationJob_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "McpServer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

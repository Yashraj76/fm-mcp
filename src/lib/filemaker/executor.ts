import { prisma } from '../prisma';
import { withFMSession } from './session';
import { FileMakerClient } from './client';
import { safeParseJSON } from '@/lib/utils/safe-parse';
import { resolveToolConnection } from './resolve-connection';

export interface ToolHandlerConfig {
  method?: string;
  layout?: string;
  script?: string;
  fieldMappings?: Record<string, string>;
  recordIdField?: string;
  limit?: number;
  offset?: number;
  [key: string]: any;
}

export async function executeTool(
  toolId: string,
  params: Record<string, unknown>,
  userId?: string
): Promise<unknown> {
  const tool = await prisma.tool.findFirst({
    where: userId ? { id: toolId, deletedAt: null, server: { userId } } : { id: toolId, deletedAt: null },
    include: { server: { include: { connections: { include: { connection: true } } } } }
  });

  if (!tool) throw new Error(`Tool ${toolId} not found`);

  // System tools should be handled by system-executor, but we catch them here just in case
  if (tool.category === 'system') {
    throw new Error('System tool execution not implemented in FM executor. Use system-executor instead.');
  }

  const config: ToolHandlerConfig = safeParseJSON(tool.handlerConfig, {});
  const connection = resolveToolConnection(
    (config as any).connectionId,
    tool.server.connections as any,
    tool.name
  );
  const method = tool.fmMethod || config.method || 'find';

  return withFMSession(connection, async (client) => {
    switch (method) {
      case 'find':
        return await handleFind(client, config, params);
      case 'create':
        return await handleCreate(client, config, params);
      case 'update':
        return await handleUpdate(client, config, params);
      case 'delete':
        return await handleDelete(client, config, params);
      case 'list':
        return await handleList(client, config, params);
      case 'script':
        return await handleScript(client, config, params);
      default:
        throw new Error(`Execution method "${method}" not implemented`);
    }
  });
}

async function handleFind(client: FileMakerClient, config: ToolHandlerConfig, params: Record<string, unknown>) {
  if (!config.layout) throw new Error('Layout missing in tool config');
  
  // Map input params to FM fields
  const query: Record<string, any> = {};
  if (config.fieldMappings) {
    for (const [paramKey, fmField] of Object.entries(config.fieldMappings)) {
      if (params[paramKey] !== undefined) {
        query[fmField] = params[paramKey] as string | number;
      }
    }
  } else {
    // Fallback: use params as-is if no mapping
    Object.assign(query, params);
  }

  const result = await client.find(
    config.layout,
    [query],
    (params.limit || config.limit) as number | undefined,
    (params.offset || config.offset) as number | undefined
  );
  
  return {
    status: 'success',
    data: result.response.data?.map((r: any) => ({
      recordId: r.recordId,
      modId: r.modId,
      fieldData: r.fieldData,
      ...r.fieldData
    })) ?? []
  };
}

async function handleCreate(client: FileMakerClient, config: ToolHandlerConfig, params: Record<string, unknown>) {
  if (!config.layout) throw new Error('Layout missing in tool config');
  
  const fieldData: Record<string, any> = {};
  if (config.fieldMappings) {
    for (const [paramKey, fmField] of Object.entries(config.fieldMappings)) {
      if (params[paramKey] !== undefined) {
        fieldData[fmField] = params[paramKey];
      }
    }
  } else {
    Object.assign(fieldData, params);
  }

  const result = await client.createRecord(config.layout, fieldData);
  return {
    status: 'success',
    recordId: result.response.recordId || '',
    message: 'Record created successfully'
  };
}

async function handleUpdate(client: FileMakerClient, config: ToolHandlerConfig, params: Record<string, unknown>) {
  if (!config.layout) throw new Error('Layout missing in tool config');
  
  const recordId = params[config.recordIdField || 'recordId'] as string;
  if (!recordId) throw new Error(`Missing required field: ${config.recordIdField || 'recordId'}`);

  const fieldData: Record<string, any> = {};
  if (config.fieldMappings) {
    for (const [paramKey, fmField] of Object.entries(config.fieldMappings)) {
      if (params[paramKey] !== undefined && paramKey !== (config.recordIdField || 'recordId')) {
        fieldData[fmField] = params[paramKey];
      }
    }
  } else {
    Object.assign(fieldData, params);
    delete fieldData[config.recordIdField || 'recordId'];
  }

  await client.updateRecord(config.layout, recordId, fieldData);
  return {
    status: 'success',
    recordId,
    message: 'Record updated successfully'
  };
}

async function handleDelete(client: FileMakerClient, config: ToolHandlerConfig, params: Record<string, unknown>) {
  if (!config.layout) throw new Error('Layout missing in tool config');
  
  const recordId = params[config.recordIdField || 'recordId'] as string;
  if (!recordId) throw new Error(`Missing required field: ${config.recordIdField || 'recordId'}`);

  await client.deleteRecord(config.layout, recordId);
  return {
    status: 'success',
    recordId,
    message: 'Record deleted successfully'
  };
}

async function handleList(client: FileMakerClient, config: ToolHandlerConfig, params: Record<string, unknown>) {
  if (!config.layout) throw new Error('Layout missing in tool config');
  
  const result = await client.listRecords(
    config.layout,
    (params.limit as number) || config.limit || 100,
    (params.offset as number) || config.offset || 1
  );
  
  return {
    status: 'success',
    data: result.response.data?.map((r: any) => ({
      recordId: r.recordId,
      modId: r.modId,
      fieldData: r.fieldData,
      ...r.fieldData
    })) ?? []
  };
}

async function handleScript(client: FileMakerClient, config: ToolHandlerConfig, params: Record<string, unknown>) {
  if (!config.layout) throw new Error('Layout missing in tool config (required for script context)');
  if (!config.script) throw new Error('Script name missing in tool config');
  
  const paramValue = typeof params.param === 'object' ? JSON.stringify(params.param) : String(params.param || '');
  
  const result = await client.runScript(config.layout, config.script, paramValue);
  return {
    status: 'success',
    scriptResult: result.response.scriptResult || '',
    scriptError: result.response.scriptError || '',
    data: result.response.data || [] // Some scripts return records
  };
}

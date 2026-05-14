import { FMConnection } from '@prisma/client';
import { prisma } from '../prisma';
import { withFMSession } from './session';
import { FileMakerClient } from './client';

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
  params: Record<string, any>
): Promise<any> {
  const tool = await prisma.tool.findUnique({
    where: { id: toolId },
    include: { server: { include: { connections: { include: { connection: true } } } } }
  });

  if (!tool) throw new Error(`Tool ${toolId} not found`);

  // System tools should be handled by system-executor, but we catch them here just in case
  if (tool.category === 'system') {
    throw new Error('System tool execution not implemented in FM executor. Use system-executor instead.');
  }

  const connServer = tool.server.connections[0];
  if (!connServer || !connServer.connection) {
    throw new Error(`No FileMaker connection linked to server ${tool.serverId}`);
  }

  const connection = connServer.connection;
  const config: ToolHandlerConfig = JSON.parse(tool.handlerConfig);
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

async function handleFind(client: FileMakerClient, config: ToolHandlerConfig, params: any) {
  if (!config.layout) throw new Error('Layout missing in tool config');
  
  // Map input params to FM fields
  const query: Record<string, any> = {};
  if (config.fieldMappings) {
    for (const [paramKey, fmField] of Object.entries(config.fieldMappings)) {
      if (params[paramKey] !== undefined) {
        query[fmField] = params[paramKey];
      }
    }
  } else {
    // Fallback: use params as-is if no mapping
    Object.assign(query, params);
  }

  const result = await client.find(
    config.layout,
    [query],
    params.limit || config.limit,
    params.offset || config.offset
  );
  
  return {
    status: 'success',
    data: result.response.data.map((r: any) => ({
      recordId: r.recordId,
      modId: r.modId,
      fieldData: r.fieldData,
      ...r.fieldData
    }))
  };
}

async function handleCreate(client: FileMakerClient, config: ToolHandlerConfig, params: any) {
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
    recordId: result.response.recordId,
    message: 'Record created successfully'
  };
}

async function handleUpdate(client: FileMakerClient, config: ToolHandlerConfig, params: any) {
  if (!config.layout) throw new Error('Layout missing in tool config');
  
  const recordId = params[config.recordIdField || 'recordId'];
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

async function handleDelete(client: FileMakerClient, config: ToolHandlerConfig, params: any) {
  if (!config.layout) throw new Error('Layout missing in tool config');
  
  const recordId = params[config.recordIdField || 'recordId'];
  if (!recordId) throw new Error(`Missing required field: ${config.recordIdField || 'recordId'}`);

  await client.deleteRecord(config.layout, recordId);
  return {
    status: 'success',
    recordId,
    message: 'Record deleted successfully'
  };
}

async function handleList(client: FileMakerClient, config: ToolHandlerConfig, params: any) {
  if (!config.layout) throw new Error('Layout missing in tool config');
  
  const result = await client.listRecords(
    config.layout,
    params.limit || config.limit || 100,
    params.offset || config.offset || 1
  );
  
  return {
    status: 'success',
    data: result.response.data.map((r: any) => ({
      recordId: r.recordId,
      modId: r.modId,
      fieldData: r.fieldData,
      ...r.fieldData
    }))
  };
}

async function handleScript(client: FileMakerClient, config: ToolHandlerConfig, params: any) {
  if (!config.layout) throw new Error('Layout missing in tool config (required for script context)');
  if (!config.script) throw new Error('Script name missing in tool config');
  
  const paramValue = typeof params.param === 'object' ? JSON.stringify(params.param) : String(params.param || '');
  
  const result = await client.runScript(config.layout, config.script, paramValue);
  return {
    status: 'success',
    scriptResult: result.response.scriptResult,
    scriptError: result.response.scriptError,
    data: result.response.data // Some scripts return records
  };
}

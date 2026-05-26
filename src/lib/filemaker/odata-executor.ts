import { Agent } from 'undici';
import { decrypt } from '../crypto';
import { prisma } from '../prisma';
import { safeParseJSON } from '@/lib/utils/safe-parse';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ODataHandlerConfig {
  type: 'odata-filter' | 'odata-expand' | 'odata-batch';
  table: string;                    // OData table/entity name
  filterExpression?: string;        // e.g. "Email eq {email} and Status eq {status}"
  expandTables?: string[];          // e.g. ["Orders", "Payments"]
  select?: string[];                // specific fields to return
  top?: number;                     // $top limit
  skip?: number;                    // $skip offset
  orderby?: string;                 // e.g. "CreatedDate desc"
  // For odata-batch writes
  batchOperations?: {
    method: 'POST' | 'PATCH' | 'DELETE';
    table: string;
    fieldMappings?: Record<string, string>;
    recordIdParam?: string;         // param name containing the record ID
  }[];
}

// ─── Auth helper ─────────────────────────────────────────────────────────────

function buildODataAuth(connection: any): string {
  const password = decrypt(connection.password); // DB field is `password`, not `passwordEncrypted`
  return Buffer.from(`${connection.username}:${password}`).toString('base64');
}

function buildODataBase(connection: any): string {
  const host = connection.host.startsWith('http') ? connection.host : `https://${connection.host}`;
  const port = connection.port ? `:${connection.port}` : '';
  const dbName = encodeURIComponent(connection.database);
  return `${host}${port}/fmi/odata/v4/${dbName}`;
}

function buildDispatcher(connection: any): Agent {
  return new Agent({ connect: { rejectUnauthorized: connection.sslVerify } });
}

// ─── Filter interpolation ────────────────────────────────────────────────────

/**
 * Replaces {paramName} placeholders in a filter expression with actual values.
 * Strings are auto-wrapped in single quotes. Numbers are injected as-is.
 * Single quotes inside string values are escaped as ''.
 */
function interpolateFilter(expression: string, params: Record<string, any>): string {
  return expression.replace(/\{(\w+)\}/g, (_, key) => {
    const val = params[key];
    if (val === undefined || val === null) return 'null';
    if (typeof val === 'number' || typeof val === 'boolean') return String(val);
    return `'${String(val).replace(/'/g, "''")}'`;
  });
}

// ─── Strategy: OData $filter ─────────────────────────────────────────────────

export async function executeODataFilter(
  config: ODataHandlerConfig,
  params: Record<string, any>,
  connection: any
): Promise<any> {
  const base = buildODataBase(connection);
  const credentials = buildODataAuth(connection);
  const dispatcher = buildDispatcher(connection);

  const queryParts: string[] = [];

  if (config.filterExpression) {
    const interpolated = interpolateFilter(config.filterExpression, params);
    queryParts.push(`$filter=${encodeURIComponent(interpolated)}`);
  }
  if (config.select?.length) queryParts.push(`$select=${config.select.join(',')}`);
  if (config.top ?? params.limit) queryParts.push(`$top=${config.top ?? params.limit}`);
  if (config.skip ?? params.offset) queryParts.push(`$skip=${config.skip ?? params.offset}`);
  if (config.orderby) queryParts.push(`$orderby=${encodeURIComponent(config.orderby)}`);

  const url = `${base}/${encodeURIComponent(config.table)}${queryParts.length ? '?' + queryParts.join('&') : ''}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Basic ${credentials}`,
      Accept: 'application/json',
      'OData-Version': '4.0',
    },
    dispatcher,
    signal: AbortSignal.timeout(30_000),
  } as any);

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OData $filter failed (${res.status}): ${errText.substring(0, 300)}`);
  }

  const json = await res.json();
  return {
    status: 'success',
    data: json.value ?? [],
    count: json['@odata.count'] ?? (json.value?.length ?? 0),
  };
}

// ─── Strategy: OData $expand ─────────────────────────────────────────────────

export async function executeODataExpand(
  config: ODataHandlerConfig,
  params: Record<string, any>,
  connection: any
): Promise<any> {
  const base = buildODataBase(connection);
  const credentials = buildODataAuth(connection);
  const dispatcher = buildDispatcher(connection);

  const queryParts: string[] = [];

  if (config.filterExpression) {
    const interpolated = interpolateFilter(config.filterExpression, params);
    queryParts.push(`$filter=${encodeURIComponent(interpolated)}`);
  }
  if (config.expandTables?.length) {
    queryParts.push(`$expand=${config.expandTables.join(',')}`);
  }
  if (config.select?.length) queryParts.push(`$select=${config.select.join(',')}`);
  if (config.top ?? params.limit) queryParts.push(`$top=${config.top ?? params.limit}`);

  const url = `${base}/${encodeURIComponent(config.table)}${queryParts.length ? '?' + queryParts.join('&') : ''}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Basic ${credentials}`,
      Accept: 'application/json',
      'OData-Version': '4.0',
    },
    dispatcher,
    signal: AbortSignal.timeout(30_000),
  } as any);

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OData $expand failed (${res.status}): ${errText.substring(0, 300)}`);
  }

  const json = await res.json();
  return {
    status: 'success',
    data: json.value ?? [],
    count: json.value?.length ?? 0,
  };
}

// ─── Strategy: OData $batch ───────────────────────────────────────────────────

export async function executeODataBatch(
  config: ODataHandlerConfig,
  params: Record<string, any>,
  connection: any
): Promise<any> {
  const base = buildODataBase(connection);
  const credentials = buildODataAuth(connection);
  const dispatcher = buildDispatcher(connection);

  if (!config.batchOperations?.length) {
    throw new Error('OData batch requires batchOperations in config');
  }

  const boundary = `batch_${Date.now()}`;
  const changesetBoundary = `changeset_${Date.now()}`;

  const writes = config.batchOperations.filter(op => op.method !== ('GET' as any));

  let body = '';

  if (writes.length > 0) {
    body += `--${boundary}\r\n`;
    body += `Content-Type: multipart/mixed; boundary=${changesetBoundary}\r\n\r\n`;

    for (let i = 0; i < writes.length; i++) {
      const op = writes[i];

      // Build field data from mappings
      const fieldData: Record<string, any> = {};
      if (op.fieldMappings) {
        for (const [paramKey, tableField] of Object.entries(op.fieldMappings)) {
          if (params[paramKey] !== undefined) fieldData[tableField] = params[paramKey];
        }
      }

      const recordId = op.recordIdParam ? params[op.recordIdParam] : undefined;
      const url = recordId
        ? `${base}/${encodeURIComponent(op.table)}(${recordId})`
        : `${base}/${encodeURIComponent(op.table)}`;

      const jsonBody = JSON.stringify(fieldData);

      body += `--${changesetBoundary}\r\n`;
      body += `Content-Type: application/http\r\n`;
      body += `Content-ID: ${i + 1}\r\n\r\n`;
      body += `${op.method} ${url} HTTP/1.1\r\n`;
      body += `Content-Type: application/json\r\n`;
      body += `Content-Length: ${jsonBody.length}\r\n\r\n`;
      body += `${jsonBody}\r\n`;
    }

    body += `--${changesetBoundary}--\r\n`;
  }

  body += `--${boundary}--`;

  const res = await fetch(`${base}/$batch`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': `multipart/mixed; boundary=${boundary}`,
      'OData-Version': '4.0',
      Accept: 'application/json',
    },
    body,
    dispatcher,
    signal: AbortSignal.timeout(30_000),
  } as any);

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OData $batch failed (${res.status}): ${errText.substring(0, 300)}`);
  }

  const responseText = await res.text();
  // Extract JSON payloads from multipart response
  const jsonBlocks = responseText.match(/\{[\s\S]*?\}/g) ?? [];
  const results = jsonBlocks.map((block: string) => safeParseJSON(block, block));

  return {
    status: 'success',
    results,
    operationCount: writes.length,
  };
}

// ─── Main OData dispatcher ───────────────────────────────────────────────────

export async function executeODataTool(
  toolId: string,
  params: Record<string, any>,
  userId?: string
): Promise<any> {
  const tool = await prisma.tool.findFirst({
    where: userId ? { id: toolId, server: { userId } } : { id: toolId },
    include: { server: { include: { connections: { include: { connection: true } } } } },
  });

  if (!tool) throw new Error(`Tool ${toolId} not found`);

  const connServer = tool.server.connections[0];
  if (!connServer?.connection) {
    throw new Error(`No FileMaker connection linked to server ${tool.serverId}`);
  }

  const connection = connServer.connection;
  const config: ODataHandlerConfig = safeParseJSON(tool.handlerConfig, {});

  switch (config.type) {
    case 'odata-filter':
      return executeODataFilter(config, params, connection);
    case 'odata-expand':
      return executeODataExpand(config, params, connection);
    case 'odata-batch':
      return executeODataBatch(config, params, connection);
    default:
      throw new Error(`Unknown OData handler type: ${(config as any).type}`);
  }
}

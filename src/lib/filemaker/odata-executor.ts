import { Agent } from 'undici';
import { FMConnection } from '@prisma/client';
import { decrypt } from '../crypto';
import { prisma } from '../prisma';
import { safeParseJSON } from '@/lib/utils/safe-parse';
import { FileMakerError } from './client';
import { interpolateODataFilter, coerceODataInt, validateODataRecordId } from './odata-filter';
import { resolveToolConnection } from './resolve-connection';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ODataResponse {
  status: string;
  data?: unknown[];
  count?: number;
  results?: unknown[];
  operationCount?: number;
}

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
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    table: string;
    fieldMappings?: Record<string, string>;
    recordIdParam?: string;         // param name containing the record ID
  }[];
}

// ─── Auth helper ─────────────────────────────────────────────────────────────

function buildODataAuth(connection: FMConnection): string {
  const password = decrypt(connection.password); // DB field is `password`, not `passwordEncrypted`
  return Buffer.from(`${connection.username}:${password}`).toString('base64');
}

function buildODataBase(connection: FMConnection): string {
  const host = connection.host.startsWith('http') ? connection.host : `https://${connection.host}`;
  const port = connection.port ? `:${connection.port}` : '';
  const dbName = encodeURIComponent(connection.database);
  return `${host}${port}/fmi/odata/v4/${dbName}`;
}

function buildDispatcher(connection: FMConnection): Agent {
  return new Agent({ connect: { rejectUnauthorized: connection.sslVerify } });
}

/**
 * Perform one OData request on a fresh per-connection Agent and ALWAYS destroy
 * the Agent afterwards — these are one-shot requests, and an undestroyed Agent
 * keeps its keep-alive sockets open (one leaked pool per tool execution).
 * Returns the response body text; the body is fully consumed BEFORE the Agent
 * is destroyed (fetch resolves at headers — destroying earlier would abort the
 * body stream). Throws FileMakerError on non-2xx responses.
 */
async function odataFetch(
  connection: FMConnection,
  url: string,
  init: Omit<RequestInit, 'signal'>,
  opName: string,
): Promise<string> {
  const dispatcher = buildDispatcher(connection);
  try {
    const res = await fetch(url, {
      ...init,
      dispatcher,
      signal: AbortSignal.timeout(30_000),
    } as RequestInit & { dispatcher: Agent });

    const text = await res.text();
    if (!res.ok) {
      if (res.status === 401) {
        throw new FileMakerError('', 401, 'OData authentication failed. Verify the FileMaker username and password in connection settings.');
      }
      throw new FileMakerError('', res.status, `OData ${opName} failed (HTTP ${res.status}): ${text.substring(0, 200)}`);
    }
    return text;
  } finally {
    await dispatcher.destroy();
  }
}

// ─── Strategy: OData $filter ─────────────────────────────────────────────────

export async function executeODataFilter(
  config: ODataHandlerConfig,
  params: Record<string, unknown>,
  connection: FMConnection
): Promise<ODataResponse> {
  const base = buildODataBase(connection);
  const credentials = buildODataAuth(connection);

  const queryParts: string[] = [];

  if (config.filterExpression) {
    const interpolated = interpolateODataFilter(config.filterExpression, params);
    queryParts.push(`$filter=${encodeURIComponent(interpolated)}`);
  }
  if (config.select?.length) queryParts.push(`$select=${config.select.join(',')}`);
  const topVal = coerceODataInt(config.top ?? params.limit);
  if (topVal !== undefined) queryParts.push(`$top=${topVal}`);
  const skipVal = coerceODataInt(config.skip ?? params.offset);
  if (skipVal !== undefined) queryParts.push(`$skip=${skipVal}`);
  if (config.orderby) queryParts.push(`$orderby=${encodeURIComponent(config.orderby)}`);

  const url = `${base}/${encodeURIComponent(config.table)}${queryParts.length ? '?' + queryParts.join('&') : ''}`;

  const text = await odataFetch(connection, url, {
    headers: {
      Authorization: `Basic ${credentials}`,
      Accept: 'application/json',
      'OData-Version': '4.0',
    },
  }, '$filter');

  const json = JSON.parse(text);
  return {
    status: 'success',
    data: json.value ?? [],
    count: json['@odata.count'] ?? (json.value?.length ?? 0),
  };
}

// ─── Strategy: OData $expand ─────────────────────────────────────────────────

export async function executeODataExpand(
  config: ODataHandlerConfig,
  params: Record<string, unknown>,
  connection: FMConnection
): Promise<ODataResponse> {
  const base = buildODataBase(connection);
  const credentials = buildODataAuth(connection);

  const queryParts: string[] = [];

  if (config.filterExpression) {
    const interpolated = interpolateODataFilter(config.filterExpression, params);
    queryParts.push(`$filter=${encodeURIComponent(interpolated)}`);
  }
  if (config.expandTables?.length) {
    queryParts.push(`$expand=${config.expandTables.join(',')}`);
  }
  if (config.select?.length) queryParts.push(`$select=${config.select.join(',')}`);
  const expandTopVal = coerceODataInt(config.top ?? params.limit);
  if (expandTopVal !== undefined) queryParts.push(`$top=${expandTopVal}`);

  const url = `${base}/${encodeURIComponent(config.table)}${queryParts.length ? '?' + queryParts.join('&') : ''}`;

  const text = await odataFetch(connection, url, {
    headers: {
      Authorization: `Basic ${credentials}`,
      Accept: 'application/json',
      'OData-Version': '4.0',
    },
  }, '$expand');

  const json = JSON.parse(text);
  return {
    status: 'success',
    data: json.value ?? [],
    count: json.value?.length ?? 0,
  };
}

// ─── Strategy: OData $batch ───────────────────────────────────────────────────

export async function executeODataBatch(
  config: ODataHandlerConfig,
  params: Record<string, unknown>,
  connection: FMConnection
): Promise<ODataResponse> {
  const base = buildODataBase(connection);
  const credentials = buildODataAuth(connection);

  if (!config.batchOperations?.length) {
    throw new Error('OData batch requires batchOperations in config');
  }

  const boundary = `batch_${Date.now()}`;
  const changesetBoundary = `changeset_${Date.now()}`;

  const writes = config.batchOperations.filter(op => op.method !== 'GET');

  let body = '';

  if (writes.length > 0) {
    body += `--${boundary}\r\n`;
    body += `Content-Type: multipart/mixed; boundary=${changesetBoundary}\r\n\r\n`;

    for (let i = 0; i < writes.length; i++) {
      const op = writes[i];

      // Build field data from mappings
      const fieldData: Record<string, unknown> = {};
      if (op.fieldMappings) {
        for (const [paramKey, tableField] of Object.entries(op.fieldMappings)) {
          if (params[paramKey] !== undefined) fieldData[tableField] = params[paramKey];
        }
      }

      const rawRecordId = op.recordIdParam ? params[op.recordIdParam] : undefined;
      const recordId = rawRecordId !== undefined ? validateODataRecordId(rawRecordId) : undefined;
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

  const responseText = await odataFetch(connection, `${base}/$batch`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': `multipart/mixed; boundary=${boundary}`,
      'OData-Version': '4.0',
      Accept: 'application/json',
    },
    body,
  }, '$batch');
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
  params: Record<string, unknown>,
  userId?: string
): Promise<ODataResponse> {
  const tool = await prisma.tool.findFirst({
    where: userId ? { id: toolId, deletedAt: null, server: { userId } } : { id: toolId, deletedAt: null },
    include: { server: { include: { connections: { include: { connection: true } } } } },
  });

  if (!tool) throw new Error(`Tool ${toolId} not found`);

  const config: ODataHandlerConfig = safeParseJSON(tool.handlerConfig, {});
  const connection = resolveToolConnection(
    (config as any).connectionId ?? null,
    (tool as any).server.connections,
    tool.name,
  );

  switch (config.type) {
    case 'odata-filter':
      return executeODataFilter(config, params, connection);
    case 'odata-expand':
      return executeODataExpand(config, params, connection);
    case 'odata-batch':
      return executeODataBatch(config, params, connection);
    default:
      throw new Error(`Unknown OData handler type: ${(config as { type: string }).type}`);
  }
}

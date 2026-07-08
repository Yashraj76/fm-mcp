import { apiNotFound, apiServerError, apiValidationFailed } from '@/lib/utils/api-response'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'
import { withAuth } from "@/lib/auth/api-guard";
import { fmMethodSchema } from '@/lib/tools/fm-methods';
import { normalizeTool } from '@/lib/tools/normalize-tool';
import { logger } from '@/lib/logger'

const generateToolSchema = z.object({
  description: z.string().min(10, 'Please provide a more detailed description (at least 10 characters)'),
  branchId: z.string().min(1, 'Branch ID is required'),
  category: z.string().optional(),
  connectionId: z.string().optional(),
  fmMethod: fmMethodSchema.optional(),
  additionalInstructions: z.string().optional(),
})

// POST /api/servers/[id]/ai/generate-tool - AI-generate a complete tool definition
export const POST = withAuth(async (request, { params, userId }) => {
    try {
    const { id } = params
    const server = await db.mcpServer.findFirst({
      where: { id, userId }
    })
    if (!server) {
      return apiNotFound('Server not found')
    }

    const body = await request.json()
    const parsed = generateToolSchema.safeParse(body)

    if (!parsed.success) {
      return apiValidationFailed(parsed.error.issues)
    }

    // Verify branch exists
    const branch = await db.branch.findFirst({
      where: { id: parsed.data.branchId, serverId: id },
    })
    if (!branch) {
      return apiNotFound('Branch not found')
    }

    // Simulate AI processing time
    await new Promise((resolve) => setTimeout(resolve, 800 + Math.floor(Math.random() * 1200)))

    // Parse description to generate appropriate tool configuration
    const desc = parsed.data.description.toLowerCase()
    const method = parsed.data.fmMethod || (
      desc.includes('create') || desc.includes('add') || desc.includes('new') ? 'create' :
      desc.includes('search') || desc.includes('find') || desc.includes('list') || desc.includes('get all') ? 'find' :
      desc.includes('update') || desc.includes('modify') || desc.includes('edit') ? 'update' :
      desc.includes('delete') || desc.includes('remove') ? 'delete' :
      desc.includes('script') || desc.includes('run') || desc.includes('execute') ? 'script' :
      'find'
    )

    // Generate tool name from description
    const actionWords = ['get', 'find', 'create', 'update', 'delete', 'search', 'list', 'run']
    const nameBase = desc
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !actionWords.includes(w))
      .slice(0, 3)
      .join('_')

    const toolName = `fm_${method}_${nameBase || 'tool'}`

    // Generate input schema based on method
    let inputSchema: Record<string, unknown>
    let handlerConfig: Record<string, unknown>

    switch (method) {
      case 'create':
        inputSchema = {
          type: 'object',
          properties: {
            firstName: { type: 'string', description: 'First name' },
            lastName: { type: 'string', description: 'Last name' },
            email: { type: 'string', format: 'email', description: 'Email address' },
            notes: { type: 'string', description: 'Additional notes' },
          },
          required: ['firstName', 'lastName'],
        }
        handlerConfig = {
          type: 'create',
          layout: 'Contacts',
          fieldMapping: {
            firstName: 'firstName',
            lastName: 'lastName',
            email: 'email',
            notes: 'notes',
          },
        }
        break

      case 'find':
        inputSchema = {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' },
            status: { type: 'string', description: 'Filter by status' },
            limit: { type: 'number', default: 25, description: 'Maximum results' },
            offset: { type: 'number', default: 0, description: 'Pagination offset' },
          },
        }
        handlerConfig = {
          type: 'find',
          layout: 'Contacts',
          sort: [{ fieldName: 'createdAt', sortOrder: 'descend' }],
          pagination: { limit: 25, offset: 0 },
        }
        break

      case 'update':
        inputSchema = {
          type: 'object',
          properties: {
            recordId: { type: 'string', description: 'ID of the record to update' },
            firstName: { type: 'string', description: 'Updated first name' },
            lastName: { type: 'string', description: 'Updated last name' },
            email: { type: 'string', description: 'Updated email address' },
          },
          required: ['recordId'],
        }
        handlerConfig = {
          type: 'update',
          layout: 'Contacts',
          fieldMapping: {
            firstName: 'firstName',
            lastName: 'lastName',
            email: 'email',
          },
        }
        break

      case 'delete':
        inputSchema = {
          type: 'object',
          properties: {
            recordId: { type: 'string', description: 'ID of the record to delete' },
            confirm: { type: 'boolean', default: false, description: 'Confirm deletion' },
          },
          required: ['recordId', 'confirm'],
        }
        handlerConfig = {
          type: 'delete',
          layout: 'Contacts',
        }
        break

      case 'script':
        inputSchema = {
          type: 'object',
          properties: {
            parameter1: { type: 'string', description: 'Primary script parameter' },
            parameter2: { type: 'string', description: 'Secondary script parameter' },
          },
        }
        handlerConfig = {
          type: 'script',
          scriptName: 'ProcessData',
          scriptParameters: {
            param1: 'parameter1',
            param2: 'parameter2',
          },
        }
        break

      default:
        inputSchema = { type: 'object', properties: {} }
        handlerConfig = { type: 'custom' }
    }

    const outputSchema = {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        data: { type: 'object' },
        message: { type: 'string' },
      },
    }

    // Inject connectionId if the caller provided one
    if (parsed.data.connectionId) {
      (handlerConfig as Record<string, unknown>).connectionId = parsed.data.connectionId
    }

    // Normalize: fills correct category, outputSchema, handlerConfig.method, etc.
    // Also fixes the category precedence bug that existed in the old inline expression.
    const normalized = normalizeTool({
      name: toolName,
      description: parsed.data.description,
      fmMethod: method,
      fmLayout: method !== 'script' ? 'Contacts' : undefined,
      fmScript: method === 'script' ? 'ProcessData' : undefined,
      category: parsed.data.category,
      inputSchema,
      outputSchema,
      handlerConfig,
      isEnabled: true,
      isAiGenerated: true,
    })

    // Save suggestion record using the normalized shape
    const suggestion = await db.aiSuggestion.create({
      data: {
        serverId: id,
        branchId: parsed.data.branchId,
        schemaContext: JSON.stringify({}),
        suggestionType: 'tool_suggestion',
        title: `AI Generated: ${toolName}`,
        description: parsed.data.description,
        proposedConfig: JSON.stringify(normalized),
        status: 'pending',
      },
    })

    // Return inputSchema/handlerConfig/outputSchema as objects for the UI
    const toolForResponse = {
      ...normalized,
      inputSchema: JSON.parse(normalized.inputSchema),
      handlerConfig: JSON.parse(normalized.handlerConfig),
      outputSchema: JSON.parse(normalized.outputSchema),
    }

    return NextResponse.json({
      suggestionId: suggestion.id,
      tool: toolForResponse,
      metadata: {
        generatedFrom: parsed.data.description,
        inferredMethod: method,
        aiModel: 'mock-generator-v1',
        confidence: 0.87 + Math.random() * 0.12,
        processingTime: '1.2s',
      },
      nextSteps: [
        'Review the generated tool configuration',
        'Adjust input schema and field mappings as needed',
        'Select the appropriate FileMaker layout',
        'Test the tool with sample data',
        'Save the tool to your branch',
      ],
    })
    } catch (error) {
    logger.error({ err: error }, 'Error generating tool:')
    return apiServerError('Failed to generate tool')
    }
    });

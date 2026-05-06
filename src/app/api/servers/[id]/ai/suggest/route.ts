import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'

const suggestSchema = z.object({
  branchId: z.string().optional(),
  connectionId: z.string().optional(),
  context: z.string().optional(),
  suggestionType: z.enum(['tool_suggestion', 'optimization', 'error_fix']).default('tool_suggestion'),
  layoutName: z.string().optional(),
  tableName: z.string().optional(),
})

// POST /api/servers/[id]/ai/suggest - Get AI-generated tool suggestions based on schema
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const server = await db.mcpServer.findUnique({ where: { id } })
    if (!server) {
      return NextResponse.json({ error: 'Server not found' }, { status: 404 })
    }

    const body = await request.json()
    const parsed = suggestSchema.safeParse(body || {})

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    // Build schema context from connected databases
    let schemaContext: Record<string, unknown>[] = []

    if (parsed.data.connectionId) {
      const schemaCache = await db.fMSchemaCache.findFirst({
        where: { connectionId: parsed.data.connectionId },
        orderBy: { cachedAt: 'desc' },
      })
      if (schemaCache) {
        schemaContext = [
          { layouts: JSON.parse(schemaCache.layouts || '[]') },
          { scripts: JSON.parse(schemaCache.scripts || '[]') },
          { tables: JSON.parse(schemaCache.tables || '[]') },
          { fields: JSON.parse(schemaCache.fields || '[]') },
        ]
      }
    }

    // Generate mock AI suggestions based on type
    const suggestions: Array<Record<string, unknown>> = []

    if (parsed.data.suggestionType === 'tool_suggestion') {
      const mockSuggestions = [
        {
          title: 'Create Contact Tool',
          description: 'A tool to create new contact records in the Contacts layout. This would map to a FileMaker "create record" operation with fields for name, email, phone, and company.',
          category: 'CRUD',
          fmMethod: 'create',
          fmLayout: 'Contacts',
          proposedConfig: {
            name: 'fm_create_contact',
            description: 'Create a new contact record in FileMaker',
            inputSchema: {
              type: 'object',
              properties: {
                firstName: { type: 'string', description: 'Contact first name' },
                lastName: { type: 'string', description: 'Contact last name' },
                email: { type: 'string', format: 'email', description: 'Contact email address' },
                phone: { type: 'string', description: 'Contact phone number' },
                company: { type: 'string', description: 'Associated company name' },
              },
              required: ['firstName', 'lastName'],
            },
            handlerConfig: {
              type: 'create',
              layout: 'Contacts',
              fieldMapping: {
                firstName: 'Contacts::firstName',
                lastName: 'Contacts::lastName',
                email: 'Contacts::email',
                phone: 'Contacts::phone',
                company: 'Contacts::company',
              },
            },
          },
        },
        {
          title: 'Find Invoices Tool',
          description: 'A tool to search and find invoice records based on criteria like date range, status, and customer. Supports pagination.',
          category: 'Find',
          fmMethod: 'find',
          fmLayout: 'Invoices',
          proposedConfig: {
            name: 'fm_find_invoices',
            description: 'Search for invoices by criteria',
            inputSchema: {
              type: 'object',
              properties: {
                status: { type: 'string', enum: ['pending', 'paid', 'overdue'], description: 'Invoice status' },
                dateFrom: { type: 'string', format: 'date', description: 'Start date filter' },
                dateTo: { type: 'string', format: 'date', description: 'End date filter' },
                customerId: { type: 'number', description: 'Filter by customer ID' },
                limit: { type: 'number', default: 20, description: 'Max results to return' },
                offset: { type: 'number', default: 0, description: 'Pagination offset' },
              },
            },
            handlerConfig: {
              type: 'find',
              layout: 'Invoices',
              sort: [{ fieldName: 'createdAt', sortOrder: 'descend' }],
              pagination: { limit: 20, offset: 0 },
            },
          },
        },
        {
          title: 'Generate Invoice Script Tool',
          description: 'Execute the FileMaker script that generates invoices from orders, with support for custom discount percentages.',
          category: 'Script',
          fmMethod: 'script',
          fmScript: 'Create Invoice',
          proposedConfig: {
            name: 'fm_generate_invoice',
            description: 'Generate an invoice from an existing order using the Create Invoice script',
            inputSchema: {
              type: 'object',
              properties: {
                orderId: { type: 'number', description: 'The order ID to generate invoice from' },
                discountPercent: { type: 'number', default: 0, description: 'Discount percentage to apply (0-100)' },
              },
              required: ['orderId'],
            },
            handlerConfig: {
              type: 'script',
              scriptName: 'Create Invoice',
              scriptParameters: {
                orderId: 'orderId',
                discountPercent: 'discountPercent',
              },
            },
          },
        },
      ]

      suggestions.push(...mockSuggestions)
    } else if (parsed.data.suggestionType === 'optimization') {
      suggestions.push({
        title: 'Add Caching Layer',
        description: 'Implement response caching for frequently accessed tools like product catalogs to reduce FileMaker server load. Cache TTL of 5 minutes recommended.',
        category: 'optimization',
        proposedConfig: {
          type: 'cache',
          ttl: 300,
          applicableTools: ['fm_find_products', 'fm_get_product', 'fm_list_categories'],
        },
      })
      suggestions.push({
        title: 'Batch Operation Support',
        description: 'Add batch create/update support to reduce API round-trips. Group multiple record operations into a single tool call.',
        category: 'optimization',
        proposedConfig: {
          type: 'batch',
          maxBatchSize: 100,
          operations: ['create', 'update', 'delete'],
        },
      })
    } else if (parsed.data.suggestionType === 'error_fix') {
      suggestions.push({
        title: 'Fix Auth Token Refresh',
        description: 'The OAuth token refresh logic may fail silently. Add explicit token refresh handling with retry logic before FileMaker API calls.',
        category: 'error_fix',
        proposedConfig: {
          type: 'auth_fix',
          retryCount: 3,
          retryDelay: 1000,
          tokenRefreshBuffer: 300000,
        },
      })
    }

    // Save suggestions to database
    const savedSuggestions = await Promise.all(
      suggestions.map((suggestion) =>
        db.aiSuggestion.create({
          data: {
            serverId: id,
            branchId: parsed.data.branchId || null,
            schemaContext: JSON.stringify(schemaContext),
            suggestionType: parsed.data.suggestionType,
            title: suggestion.title as string,
            description: suggestion.description as string,
            proposedConfig: JSON.stringify(suggestion.proposedConfig),
            status: 'pending',
          },
        })
      )
    )

    return NextResponse.json({
      suggestions: savedSuggestions.map((s) => ({
        id: s.id,
        title: s.title,
        description: s.description,
        suggestionType: s.suggestionType,
        proposedConfig: JSON.parse(s.proposedConfig),
        status: s.status,
        createdAt: s.createdAt,
      })),
      schemaUsed: schemaContext.length > 0,
      generatedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Error generating suggestions:', error)
    return NextResponse.json({ error: 'Failed to generate suggestions' }, { status: 500 })
  }
}

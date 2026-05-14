import { db } from './src/lib/db'

async function run() {
  // Find the "Customer Sales Server"
  const server = await db.mcpServer.findFirst({
    where: { name: { contains: 'Customer Sales' } },
    include: { connections: true }
  })
  if (!server) return console.log('Server not found')

  const branch = await db.branch.findFirst({
    where: { serverId: server.id, isDefault: true }
  })
  if (!branch) return console.log('Branch not found')

  const connectionId = server.connections[0]?.connectionId
  if (!connectionId) return console.log('No connection found')

  console.log(`Server: ${server.name} (${server.id})`)
  console.log(`Branch: ${branch.name} (${branch.id})`)
  console.log(`Connection: ${connectionId}`)

  // Delete existing copies of these tools first (idempotent)
  await db.tool.deleteMany({
    where: {
      serverId: server.id,
      name: { in: [
        'search_customer_by_ussmid',
        'get_customer_sales_this_year',
        'get_all_valid_user_sales_this_year'
      ]}
    }
  })
  console.log('Cleared old versions...')

  // ─── Tool 1: Search customer by USSMID ───────────────────────────────────
  await db.tool.create({
    data: {
      serverId: server.id,
      branchId: branch.id,
      name: 'search_customer_by_ussmid',
      description: 'Find a customer record in CMT_Web by their USSMID (e.g. AAG197).',
      category: 'Find',
      fmMethod: 'find',
      fmLayout: 'CMT_Web',
      isEnabled: true,
      sortOrder: 1,
      inputSchema: JSON.stringify({
        type: 'object',
        properties: {
          ussmid: { type: 'string', description: 'The USSMID of the customer (e.g. AAG197)' }
        },
        required: ['ussmid']
      }),
      handlerConfig: JSON.stringify({
        connectionId,
        layout: 'CMT_Web',
        method: 'find',
        fieldMappings: { ussmid: 'USSMID' }
      })
    }
  })
  console.log('✓ Tool 1 created: search_customer_by_ussmid')

  // ─── Tool 2: Get sales for a specific customer this year ─────────────────
  await db.tool.create({
    data: {
      serverId: server.id,
      branchId: branch.id,
      name: 'get_customer_sales_this_year',
      description: 'Get all sales (SLS_Web) for the current year for a specific customer looked up by USSMID from CMT_Web. Uses ContactID as the join key.',
      category: 'Multi-Table',
      fmMethod: 'sequential-multi-table',
      isEnabled: true,
      sortOrder: 2,
      inputSchema: JSON.stringify({
        type: 'object',
        properties: {
          ussmid: { type: 'string', description: 'The USSMID of the customer (e.g. AAG197)' },
          orderEnteredDate: {
            type: 'string',
            description: 'Optional date filter for OrderEnteredDate (e.g. */2026). Defaults to the current year if omitted.'
          }
        },
        required: ['ussmid']
      }),
      handlerConfig: JSON.stringify({
        method: 'sequential-multi-table',
        type: 'sequential',
        steps: [
          {
            stepIndex: 0,
            api: 'data-api',
            connectionId,
            layout: 'CMT_Web',
            method: 'find',
            fieldMappings: { ussmid: 'USSMID' },
            extractField: 'ContactID',
            useExtractedAs: 'contactId',
            extractMode: 'first',
            limit: 1
          },
          {
            stepIndex: 1,
            api: 'data-api',
            connectionId,
            layout: 'SLS_Web',
            method: 'find',
            fieldMappings: {
              contactId: 'ContactID',
              orderEnteredDate: 'OrderEnteredDate'
            },
            staticFilters: {},
            limit: 500
          }
        ]
      })
    }
  })
  console.log('✓ Tool 2 created: get_customer_sales_this_year')

  // ─── Tool 3: All valid users' sales this year ─────────────────────────────
  await db.tool.create({
    data: {
      serverId: server.id,
      branchId: branch.id,
      name: 'get_all_valid_user_sales_this_year',
      description: 'Get all sales from SLS_Web for the current year across all customers where ValidUser=1 in CMT_Web. No parameters required.',
      category: 'Multi-Table',
      fmMethod: 'sequential-multi-table',
      isEnabled: true,
      sortOrder: 3,
      inputSchema: JSON.stringify({
        type: 'object',
        properties: {},
        required: []
      }),
      handlerConfig: JSON.stringify({
        method: 'sequential-multi-table',
        type: 'sequential',
        steps: [
          {
            stepIndex: 0,
            api: 'data-api',
            connectionId,
            layout: 'CMT_Web',
            method: 'find',
            staticFilters: { ValidUser: '1' },
            extractField: 'ContactID',
            useExtractedAs: 'contactIds',
            extractMode: 'all',
            limit: 5000
          },
          {
            stepIndex: 1,
            api: 'data-api',
            connectionId,
            layout: 'SLS_Web',
            method: 'find',
            joinField: 'ContactID',
            joinFrom: 'contactIds',
            staticFilters: { OrderEnteredDate: '{yearStart}...{yearEnd}' },
            limit: 5000
          }
        ]
      })
    }
  })
  console.log('✓ Tool 3 created: get_all_valid_user_sales_this_year')

  console.log('\nAll 3 tools created successfully!')
}

run().catch(console.error)

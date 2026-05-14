import { db } from './src/lib/db'

async function run() {
  const server = await db.mcpServer.findFirst({ include: { connections: true } })
  const branch = await db.branch.findFirst({ where: { serverId: server!.id } })
  const connectionId = server!.connections[0]?.connectionId

  // Tool 1
  await db.tool.create({
    data: {
      serverId: server!.id,
      branchId: branch!.id,
      name: 'search_customer_by_ussmid',
      description: 'Find a customer in CMT_Web using their USSMID (e.g. AAG197).',
      category: 'Find',
      fmMethod: 'find',
      fmLayout: 'CMT_Web',
      isEnabled: true,
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
        fieldMappings: {
          ussmid: 'USSMID'
        }
      })
    }
  })

  // Tool 2
  await db.tool.create({
    data: {
      serverId: server!.id,
      branchId: branch!.id,
      name: 'get_customer_sales_this_year',
      description: 'Get all sales for a customer by USSMID for a specific year. Performs a multi-table lookup using ContactID.',
      category: 'Multi-Table',
      fmMethod: 'find',
      isEnabled: true,
      inputSchema: JSON.stringify({
        type: 'object',
        properties: {
          ussmid: { type: 'string', description: 'The USSMID of the customer (e.g. AAG197)' },
          orderEnteredDate: { type: 'string', description: 'Date query for OrderEnteredDate (e.g. */2026 or 2026)' }
        },
        required: ['ussmid', 'orderEnteredDate']
      }),
      steps: JSON.stringify([
        {
          stepIndex: 0,
          connectionId,
          layout: 'CMT_Web',
          method: 'find',
          fieldMappings: {
            ussmid: 'USSMID'
          },
          extractField: 'ContactID',
          useExtractedAs: 'contactId'
        },
        {
          stepIndex: 1,
          connectionId,
          layout: 'SLS_Web',
          method: 'find',
          fieldMappings: {
            contactId: 'ContactID',
            orderEnteredDate: 'OrderEnteredDate'
          }
        }
      ])
    }
  })

  console.log("Custom tools created successfully.")
}

run()

import { db } from './src/lib/db'

async function run() {
  const server = await db.mcpServer.findFirst({ include: { connections: true } })
  const branch = await db.branch.findFirst({ where: { serverId: server!.id } })
  const connectionId = server!.connections[0]?.connectionId

  await db.tool.create({
    data: {
      serverId: server!.id,
      branchId: branch!.id,
      name: 'get_all_valid_user_sales_this_year',
      description: 'Get all sales for the current year from all customers marked as ValidUser=1. This uses a sequential multi-table join.',
      category: 'Multi-Table',
      fmMethod: 'sequential-multi-table',
      isEnabled: true,
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
            staticFilters: {
              ValidUser: '1'
            },
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
            staticFilters: {
              OrderEnteredDate: '{yearStart}...{yearEnd}'
            },
            limit: 5000
          }
        ]
      })
    }
  })

  console.log("Third tool created successfully.")
}

run()

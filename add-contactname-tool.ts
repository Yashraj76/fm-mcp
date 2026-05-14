import { db } from './src/lib/db'

async function run() {
  const server = await db.mcpServer.findFirst({
    where: { name: { contains: 'Customer Sales' } },
    include: { connections: true }
  })
  if (!server) return console.log('Server not found')

  const branch = await db.branch.findFirst({ where: { serverId: server.id, isDefault: true } })
  const connectionId = server.connections[0]?.connectionId

  await db.tool.create({
    data: {
      serverId: server.id,
      branchId: branch!.id,
      name: 'search_customer_by_contact_name',
      description: 'Search for customers in CMT_Web by their ContactName. Supports partial name matching (contains search).',
      category: 'Find',
      fmMethod: 'find',
      fmLayout: 'CMT_Web',
      isEnabled: true,
      sortOrder: 4,
      inputSchema: JSON.stringify({
        type: 'object',
        properties: {
          contactName: { type: 'string', description: 'Full or partial contact name to search for (e.g. "Smith" or "John Smith")' }
        },
        required: ['contactName']
      }),
      handlerConfig: JSON.stringify({
        connectionId,
        layout: 'CMT_Web',
        method: 'find',
        fieldMappings: { contactName: 'ContactName' }
      })
    }
  })

  console.log('✓ Tool created: search_customer_by_contact_name')
}

run().catch(console.error)

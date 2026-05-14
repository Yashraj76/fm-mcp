import { db } from './src/lib/db'
async function run() {
  const server = await db.mcpServer.findFirst({
    include: { connections: true }
  })
  if (!server) return console.log('no server')
  const branch = await db.branch.findFirst({ where: { serverId: server.id } })
  console.log({
    serverId: server.id,
    branchId: branch?.id,
    connectionId: server.connections[0]?.connectionId
  })
}
run()

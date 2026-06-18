import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const servers = await prisma.mcpServer.findMany({
    include: {
      apiKey: true,
      connections: {
        include: {
          connection: true
        }
      }
    }
  })
  console.log('SERVERS:')
  console.log(JSON.stringify(servers, null, 2))
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())

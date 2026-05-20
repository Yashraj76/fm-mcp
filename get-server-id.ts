import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const server = await prisma.mcpServer.findFirst();
  console.log(server ? server.id : 'No server found');
}
main().finally(() => prisma.$disconnect());

import { prisma } from '../src/lib/prisma';
import { seedDefaultTools } from '../src/lib/tools/default-tools';

async function main() {
  const serverId = 'cmp2iu1xa004dv0wyf35us9uh';
  console.log('Seeding tools for server:', serverId);
  await seedDefaultTools(serverId);
  console.log('Done.');
}

main().catch(console.error);

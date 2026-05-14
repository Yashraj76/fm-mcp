import { prisma } from '../src/lib/prisma';

async function main() {
  const serverId = 'cmp2iu1xa004dv0wyf35us9uh';
  const connectionId = 'cmp0yyllz0004v0dg1bxzmdds';

  const tools = await prisma.tool.findMany({ where: { serverId } });
  console.log(`Found ${tools.length} tools. Updating handlerConfigs...`);

  for (const tool of tools) {
    const config = JSON.parse(tool.handlerConfig);
    if (!config.connectionId) {
      config.connectionId = connectionId;
      await prisma.tool.update({
        where: { id: tool.id },
        data: { handlerConfig: JSON.stringify(config) }
      });
      console.log(`Updated tool: ${tool.name}`);
    }
  }
  console.log('Done.');
}

main().catch(console.error);

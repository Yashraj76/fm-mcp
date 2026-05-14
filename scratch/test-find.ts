import { prisma } from '../src/lib/prisma';
import { withFMSession } from '../src/lib/filemaker/session';

async function test() {
  const tool = await prisma.tool.findFirst({ where: { name: 'get_contact_with_sales_orders' }});
  const config = JSON.parse(tool.handlerConfig);
  
  const connection = await prisma.fMConnection.findUnique({ where: { id: config.connectionId }});
  
  await withFMSession(connection, async (client) => {
    try {
      const res = await client.find('CMT_Web', [{ Company: 'A. & G.FOODS.' }]);
      console.log(JSON.stringify(res, null, 2));
    } catch (e: any) {
      console.error(e.message);
    }
  });
}

test().catch(console.error);

import { prisma } from '../src/lib/prisma';
async function test() {
  const tool = await prisma.tool.findFirst({ where: { name: 'get_contact_with_sales_orders' }});
  if (tool) {
    console.log(tool.handlerConfig);
  }
}
test().catch(console.error);

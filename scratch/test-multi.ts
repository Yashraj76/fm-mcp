import { prisma } from '../src/lib/prisma';
import { MultiExecutor } from '../src/lib/filemaker/multi-executor';

async function test() {
  const tool = await prisma.tool.findFirst({ where: { name: 'get_contact_with_sales_orders' }});
  if (!tool) throw new Error("no tool");
  
  const config = JSON.parse(tool.handlerConfig);
  const result = await MultiExecutor.execute(config, { company: 'A. & G.FOODS.' });
  console.log(JSON.stringify(result, null, 2));
}

test().catch(console.error);

import { db } from './src/lib/db'
async function check() {
  const tool = await db.tool.findFirst({ where: { name: 'get_customer_sales_this_year' } })
  const executions = await db.toolExecution.findMany({ where: { toolId: tool!.id } })
  console.log(executions.map(e => ({ status: e.status, error: e.error, res: e.responseBody })))
}
check()

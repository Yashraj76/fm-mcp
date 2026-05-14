import { db } from './src/lib/db'

async function run() {
  const tool = await db.tool.findFirst({ where: { name: 'get_customer_sales_this_year' } })
  if (!tool) return console.log('no tool found')

  const handlerConfigStr = tool.handlerConfig
  const handlerConfig = JSON.parse(handlerConfigStr)

  handlerConfig.method = 'sequential-multi-table'
  handlerConfig.steps = handlerConfig.steps.map((step: any) => ({
    ...step,
    api: 'data-api'
  }))

  await db.tool.update({
    where: { id: tool.id },
    data: {
      handlerConfig: JSON.stringify(handlerConfig),
      fmMethod: 'sequential-multi-table'
    }
  })

  console.log('Fixed handlerConfig')
}

run()

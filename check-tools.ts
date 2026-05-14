import { db } from './src/lib/db'
async function check() {
  const c = await db.tool.count()
  console.log("Total tools:", c)
}
check()

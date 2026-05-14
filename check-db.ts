import { db } from './src/lib/db'
async function check() {
  const s = await db.appSettings.findFirst()
  console.log("Base URL:", s?.aiBaseUrl)
}
check()

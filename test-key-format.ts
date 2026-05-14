import { db } from './src/lib/db'
import { decrypt } from './src/lib/crypto'
import * as dotenv from 'dotenv'
dotenv.config()
async function check() {
  const s = await db.appSettings.findFirst()
  const key = decrypt(s!.aiApiKeyEncrypted!)
  console.log("Raw key JSON:", JSON.stringify(key))
}
check()

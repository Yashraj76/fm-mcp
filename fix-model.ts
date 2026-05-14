import { db } from './src/lib/db'
async function fix() {
  await db.appSettings.update({
    where: { id: 'singleton' },
    data: { aiModel: 'claude-sonnet-4-6' }
  })
}
fix()

import { db } from './src/lib/db'

async function test() {
  try {
    console.log('Accessing db.appSettings...')
    const settings = await db.appSettings.findUnique({ where: { id: 'singleton' } })
    console.log('Success! settings:', settings)
    process.exit(0)
  } catch (err: any) {
    console.error('Failed to access db.appSettings:', err.message)
    process.exit(1)
  }
}

test()

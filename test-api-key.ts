import { db } from './src/lib/db'
import { decrypt } from './src/lib/crypto'
import { generateObject } from 'ai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { z } from 'zod'
import * as dotenv from 'dotenv'

dotenv.config()

async function test() {
  const s = await db.appSettings.findFirst()
  if (!s || !s.aiApiKeyEncrypted) return console.log('no key')
  
  const key = decrypt(s.aiApiKeyEncrypted)
  console.log("Key length:", key.length, "Starts with:", key.substring(0, 5))
  
  try {
    const anthropic = createAnthropic({ apiKey: key })
    const model = anthropic('claude-3-5-sonnet-20241022')
    
    const { object } = await generateObject({
      model,
      schema: z.object({ result: z.string() }),
      prompt: "Say hello",
    })
    console.log("Success:", object)
  } catch (e: any) {
    console.error("Error:", e)
  }
}

test()

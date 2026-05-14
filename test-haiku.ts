import { db } from './src/lib/db'
import { decrypt } from './src/lib/crypto'
import { generateText } from 'ai'
import { createAnthropic } from '@ai-sdk/anthropic'
import * as dotenv from 'dotenv'
dotenv.config()

async function test() {
  const s = await db.appSettings.findFirst()
  const key = decrypt(s!.aiApiKeyEncrypted!)
  const anthropic = createAnthropic({ apiKey: key })
  
  const models = ['claude-3-haiku-20240307', 'claude-3-5-sonnet-latest', 'claude-3-sonnet-20240229']
  
  for (const modelName of models) {
    try {
      console.log("Testing", modelName)
      const { text } = await generateText({
        model: anthropic(modelName),
        prompt: "Say hi"
      })
      console.log("Success:", modelName, text)
    } catch (e: any) {
      console.error("Failed:", modelName, e.message)
    }
  }
}
test()

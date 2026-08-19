import { FMConnection } from '@prisma/client'
import { FileMakerClient } from './client'

export async function withFMSession<T>(
  connection: FMConnection,
  operation: (client: FileMakerClient) => Promise<T>
): Promise<T> {
  const client = new FileMakerClient(connection)
  try {
    // login inside the try so the client's undici Agent is destroyed even
    // when login itself throws.
    await client.login()
    return await operation(client)
  } finally {
    await client.logout() // no-ops when login never issued a token
    await client.close()  // release the per-client connection pool
  }
}

import { FMConnection } from '@prisma/client'
import { FileMakerClient } from './client'

export async function withFMSession<T>(
  connection: FMConnection,
  operation: (client: FileMakerClient) => Promise<T>
): Promise<T> {
  const client = new FileMakerClient(connection)
  await client.login()
  try {
    return await operation(client)
  } finally {
    await client.logout()
  }
}

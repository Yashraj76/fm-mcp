export type ConnectionPatch = {
  name?: string
  host?: string
  port?: number
  database?: string
  username?: string
  password?: string | null
  authType?: string
  clientId?: string | null
  clientSecret?: string | null
  sslVerify?: boolean
}

/**
 * Build the Prisma data payload for an FMConnection update.
 *
 * Credential fields (password, clientSecret) are only included when the
 * caller supplies a non-empty value.  An empty string means "keep current" —
 * the field is deleted from the payload so Prisma leaves the stored value
 * intact.  A truthy value is passed through encryptFn before inclusion.
 *
 * The update always marks status as 'disconnected' so the connection is
 * re-tested after a change.
 */
export function buildConnectionUpdatePayload(
  patch: ConnectionPatch,
  encryptFn: (plaintext: string) => string,
): Record<string, unknown> {
  const data: Record<string, unknown> = { ...patch, status: 'disconnected' }

  if (patch.password) {
    data.password = encryptFn(patch.password)
  } else {
    delete data.password
  }

  if (patch.clientSecret) {
    data.clientSecret = encryptFn(patch.clientSecret)
  } else {
    delete data.clientSecret
  }

  return data
}

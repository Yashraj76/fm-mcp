import bcrypt from 'bcryptjs'
import { randomBytes } from 'crypto'

export interface ApiKeyRecord {
  keyHash: string
}

// Lazily initialized — never stored, never logged, regenerated each process lifetime.
// A fresh random value means no real token can ever match the dummy hash, so using
// it in bcrypt.compare cannot accidentally grant access.
let _dummyHash: string | null = null

// Exported for tests only — not part of the public API.
export async function getDummyHash(): Promise<string> {
  if (!_dummyHash) {
    _dummyHash = await bcrypt.hash(randomBytes(32).toString('hex'), 10)
  }
  return _dummyHash
}

/**
 * Verify a bearer token against a stored bcrypt hash.
 *
 * ALWAYS calls bcrypt.compare — even when no key record exists for the given
 * serverId — so that response latency cannot reveal whether a server ID is
 * valid (timing oracle prevention).
 *
 * Returns true ONLY when a record exists AND the token matches the hash.
 */
export async function verifyMcpApiKey(
  bearerToken: string,
  apiKeyRecord: ApiKeyRecord | null
): Promise<boolean> {
  const hashToCompare = apiKeyRecord?.keyHash ?? (await getDummyHash())
  const matches = await bcrypt.compare(bearerToken, hashToCompare)
  // apiKeyRecord check must be AFTER bcrypt.compare so both paths take ~equal time
  return apiKeyRecord !== null && matches
}

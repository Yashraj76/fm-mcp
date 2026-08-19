import crypto from 'crypto'
import { logger } from './logger'

// All NEW writes use AES-256-GCM (authenticated encryption) in the 3-part
// format `iv:tag:ciphertext` (hex). Values written before the GCM migration
// are AES-256-CBC in the 2-part format `iv:ciphertext`; decrypt() still reads
// those so stored credentials keep working, and they are upgraded to GCM the
// next time they are saved. To upgrade all legacy rows at once, run:
//   npx tsx scripts/reencrypt-credentials.ts
// (re-encrypts FMConnection.password/clientSecret, AppSettings.aiApiKeyEncrypted,
// FMServerConnection.adminPasswordEncrypted in place with the current key).
const GCM_ALGORITHM = 'aes-256-gcm'
const LEGACY_CBC_ALGORITHM = 'aes-256-cbc' // decrypt-only

// Non-secret, fixed key used ONLY in local development (NODE_ENV !== 'production').
// Any value encrypted with this key has no real confidentiality — it exists solely
// so that `npm run dev` works without environment variable setup.
const DEV_FALLBACK_HEX = 'deadbeef'.repeat(8) // 64 hex chars of known pattern

let _devKeyWarned = false

// Hex strings of known-weak keys that must never be used in production.
// These are common dev placeholders, not secrets — listing them here is not a leak.
const KNOWN_WEAK_HEXES = new Set([
  'deadbeef'.repeat(8),           // built-in dev fallback
  'cafebabe'.repeat(8),           // Java class-file magic, common placeholder
  'badf00d0'.repeat(8),
  'deadc0de'.repeat(8),
  '00000000'.repeat(8),           // all-zero key
  'ffffffff'.repeat(8),           // all-ones key
  'a5a5a5a5'.repeat(8),           // alternating pattern
  '01020304050607080910111213141516171819202122232425262728293031323334'.slice(0, 64),
])

function isWeakKey(buf: Buffer): boolean {
  // 1. Known dev/placeholder patterns (case-normalised to lower)
  if (KNOWN_WEAK_HEXES.has(buf.toString('hex'))) return true

  // 2. All bytes identical (zero entropy)
  if (buf.every(b => b === buf[0])) return true

  // 3. Monotonically sequential bytes mod-256 (ascending or descending)
  //    e.g. 00 01 02 03 ... or 1f 20 21 22 ... or ff fe fd ...
  let asc = true
  let desc = true
  for (let i = 1; i < buf.length; i++) {
    if (buf[i] !== ((buf[i - 1] + 1) & 0xFF)) asc = false
    if (buf[i] !== ((buf[i - 1] - 1 + 256) & 0xFF)) desc = false
    if (!asc && !desc) break
  }
  if (asc || desc) return true

  return false
}

function parseKey(raw: string | undefined): Buffer | null {
  if (!raw || raw.length !== 64) return null
  const buf = Buffer.from(raw, 'hex')
  // Buffer.from silently shortens when non-hex chars appear; guard the result length
  return buf.length === 32 ? buf : null
}

function getKey(): Buffer {
  const key = parseKey(process.env.ENCRYPTION_KEY)
  if (key) {
    if (process.env.NODE_ENV === 'production' && isWeakKey(key)) {
      throw new Error(
        'ENCRYPTION_KEY appears to be a placeholder or non-random value and cannot be ' +
        'used in production. Generate a cryptographically random key: ' +
        'node -e "require(\'crypto\').randomBytes(32).toString(\'hex\')"'
      )
    }
    return key
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'ENCRYPTION_KEY environment variable is required in production and must be a ' +
      '64-character hex string (32 bytes). ' +
      'Generate one: node -e "require(\'crypto\').randomBytes(32).toString(\'hex\')"'
    )
  }

  if (!_devKeyWarned) {
    logger.warn('[crypto] ENCRYPTION_KEY missing or invalid — using insecure dev fallback key')
    _devKeyWarned = true
  }
  return Buffer.from(DEV_FALLBACK_HEX, 'hex')
}

export function encrypt(text: string): string {
  if (!text) return text
  const iv = crypto.randomBytes(12) // 96-bit IV per NIST SP 800-38D for GCM
  const cipher = crypto.createCipheriv(GCM_ALGORITHM, getKey(), iv)
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`
}

/** True when the value is in the legacy 2-part CBC format (pre-GCM write). */
export function isLegacyCiphertext(value: string): boolean {
  return !!value && value.split(':').length === 2
}

/**
 * Decrypt a value previously produced by `encrypt`.
 *
 * 3-part `iv:tag:ciphertext` values are AES-256-GCM — the auth tag is verified
 * in final(), so a tampered ciphertext, tag, or IV throws. 2-part
 * `iv:ciphertext` values are legacy AES-256-CBC from before the GCM migration
 * and are decrypted for backward compatibility (see module header).
 *
 * Throws on any format or crypto failure. Never returns the raw ciphertext on
 * failure — the caller must handle errors explicitly.
 */
export function decrypt(hash: string): string {
  if (!hash) return hash
  const parts = hash.split(':')

  if (parts.length === 3) {
    const [ivHex, tagHex, cipherHex] = parts
    // 12-byte IV → 24 hex chars; 16-byte GCM tag → 32 hex chars.
    if (ivHex.length !== 24 || tagHex.length !== 32 || cipherHex.length === 0) {
      throw new Error(
        '[crypto] decrypt: value is not in the expected encrypted format ' +
        '(24-char IV hex + ":" + 32-char auth tag hex + ":" + ciphertext hex)'
      )
    }
    // Let crypto errors propagate — do NOT catch and return hash.
    // Using a decryption-failure result as a credential is worse than crashing.
    const decipher = crypto.createDecipheriv(GCM_ALGORITHM, getKey(), Buffer.from(ivHex, 'hex'))
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(cipherHex, 'hex')),
      decipher.final(), // GCM auth-tag verification happens here
    ])
    return decrypted.toString('utf8')
  }

  if (parts.length === 2) {
    // Legacy AES-256-CBC (pre-GCM). IV must be exactly 16 bytes → 32 hex chars.
    const [ivHex, cipherHex] = parts
    if (ivHex.length !== 32 || cipherHex.length === 0) {
      throw new Error(
        '[crypto] decrypt: value is not in the expected encrypted format ' +
        '(32-char IV hex + ":" + ciphertext hex)'
      )
    }
    const decipher = crypto.createDecipheriv(LEGACY_CBC_ALGORITHM, getKey(), Buffer.from(ivHex, 'hex'))
    let decrypted = decipher.update(Buffer.from(cipherHex, 'hex'), undefined, 'utf8')
    decrypted += decipher.final('utf8')
    return decrypted
  }

  throw new Error(
    '[crypto] decrypt: value is not in the expected encrypted format ' +
    '(iv:tag:ciphertext for GCM, or legacy iv:ciphertext)'
  )
}

import crypto from 'crypto'

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY
const ALGORITHM = 'aes-256-cbc'

if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 64) {
  // We need a 32-byte (64 hex char) key for aes-256
  // In development, we can mock it, but warn
  if (process.env.NODE_ENV === 'production') {
    throw new Error('ENCRYPTION_KEY must be a 64 character hex string in production')
  }
}

// Fallback key for dev if missing or wrong length (32 bytes = 64 hex chars)
const key = ENCRYPTION_KEY && ENCRYPTION_KEY.length === 64 
  ? Buffer.from(ENCRYPTION_KEY, 'hex') 
  : Buffer.alloc(32, '0')

export function encrypt(text: string): string {
  if (!text) return text
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  let encrypted = cipher.update(text, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  return `${iv.toString('hex')}:${encrypted}`
}

export function decrypt(hash: string): string {
  if (!hash) return hash
  try {
    const parts = hash.split(':')
    if (parts.length !== 2) return hash // Not encrypted with our format
    const iv = Buffer.from(parts[0], 'hex')
    const encryptedText = Buffer.from(parts[1], 'hex')
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
    let decrypted = decipher.update(encryptedText, undefined, 'utf8')
    decrypted += decipher.final('utf8')
    return decrypted
  } catch (error) {
    console.error('[crypto] Decryption failed', error)
    return hash // Return original on failure (might be plain text from old DB)
  }
}

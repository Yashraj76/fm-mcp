import assert from 'assert'
import crypto from 'crypto'
import { encrypt, decrypt, isLegacyCiphertext } from './crypto'

// ── env helpers ────────────────────────────────────────────────────────────────

// A key that passes all weak-key checks: not sequential, not uniform, not a
// known placeholder. Generated offline; safe to commit as a test constant.
const VALID_KEY = '9f3e1c5a7d2b4e8f0c6a3d7b5e9f2c4a8d1b6e0a3c7f5d2b4e8c1a6f9d3b7e0a'
const ALT_KEY   = 'b4e8f2c6a0d3b7e1f5c9a2d6b0e4f8c3a7d1b5e9f3c7a1d5b9e3f7c2a6d0b4e8'

// Cast to a plain mutable record to avoid TS2540 on ProcessEnv's typed properties.
const mutableEnv = process.env as Record<string, string | undefined>

function withEnv(key: string | undefined, nodeEnv: string | undefined, fn: () => void): void {
  const savedKey = mutableEnv.ENCRYPTION_KEY
  const savedEnv = mutableEnv.NODE_ENV
  try {
    if (key === undefined) delete mutableEnv.ENCRYPTION_KEY
    else mutableEnv.ENCRYPTION_KEY = key

    if (nodeEnv === undefined) delete mutableEnv.NODE_ENV
    else mutableEnv.NODE_ENV = nodeEnv

    fn()
  } finally {
    if (savedKey === undefined) delete mutableEnv.ENCRYPTION_KEY
    else mutableEnv.ENCRYPTION_KEY = savedKey

    if (savedEnv === undefined) delete mutableEnv.NODE_ENV
    else mutableEnv.NODE_ENV = savedEnv
  }
}

// ── tests ──────────────────────────────────────────────────────────────────────

async function runTests() {
  console.log('🚀 Starting Crypto Tests...\n')

  // ── 1. Missing key in production throws ───────────────────────────────────
  console.log('Testing missing key in production...')
  {
    withEnv(undefined, 'production', () => {
      assert.throws(
        () => encrypt('secret'),
        (err: Error) => {
          assert.ok(err.message.includes('ENCRYPTION_KEY'), `Expected ENCRYPTION_KEY in message, got: ${err.message}`)
          return true
        }
      )
      assert.throws(
        () => decrypt('a'.repeat(32) + ':' + 'b'.repeat(32)),
        (err: Error) => {
          assert.ok(err.message.includes('ENCRYPTION_KEY'))
          return true
        }
      )
    })
    console.log('  ✓ encrypt() throws when ENCRYPTION_KEY missing in production')
    console.log('  ✓ decrypt() throws when ENCRYPTION_KEY missing in production')
  }

  // ── 2. Invalid key (wrong length) in production throws ────────────────────
  console.log('\nTesting invalid key in production...')
  {
    withEnv('tooshort', 'production', () => {
      assert.throws(
        () => encrypt('secret'),
        /ENCRYPTION_KEY/
      )
    })
    withEnv('z'.repeat(64), 'production', () => {
      // 'z' is not a valid hex char → Buffer.from shortens → length < 32 → parseKey returns null
      assert.throws(
        () => encrypt('secret'),
        /ENCRYPTION_KEY/
      )
    })
    console.log('  ✓ encrypt() throws for key that is too short')
    console.log('  ✓ encrypt() throws for key with non-hex characters')
  }

  // ── 3. Valid encrypt / decrypt roundtrip ──────────────────────────────────
  console.log('\nTesting valid encrypt/decrypt roundtrip...')
  {
    withEnv(VALID_KEY, 'production', () => {
      const plaintext = 'correct_horse_battery_staple'
      const ciphertext = encrypt(plaintext)

      // Must not equal plaintext
      assert.notStrictEqual(ciphertext, plaintext, 'Encrypted value should differ from plaintext')

      // Must be in GCM iv:tag:ciphertext format
      const parts = ciphertext.split(':')
      assert.strictEqual(parts.length, 3, 'Encrypted format should be iv:tag:ciphertext (GCM)')
      assert.strictEqual(parts[0].length, 24, 'IV should be 24 hex chars (12 bytes, GCM)')
      assert.strictEqual(parts[1].length, 32, 'Auth tag should be 32 hex chars (16 bytes)')

      // Must round-trip back to original
      const decrypted = decrypt(ciphertext)
      assert.strictEqual(decrypted, plaintext)
    })
    console.log('  ✓ Encrypted output differs from plaintext')
    console.log('  ✓ Encrypted format is 24-char IV : 32-char auth tag : ciphertext (GCM)')
    console.log('  ✓ decrypt(encrypt(x)) === x (GCM round-trip)')
  }

  // ── 4. Each encryption produces a unique ciphertext (random IV) ───────────
  console.log('\nTesting unique ciphertext per call...')
  {
    withEnv(VALID_KEY, 'production', () => {
      const a = encrypt('same_value')
      const b = encrypt('same_value')
      assert.notStrictEqual(a, b, 'Two encryptions of the same value should differ (random IV)')
    })
    console.log('  ✓ Same plaintext produces different ciphertext each time (random IV)')
  }

  // ── 5. decrypt rejects plaintext / wrong-format values ────────────────────
  console.log('\nTesting decrypt rejects wrong format...')
  {
    withEnv(VALID_KEY, 'production', () => {
      // Plain text — no colon at all
      assert.throws(
        () => decrypt('plaintext_password'),
        /not in the expected encrypted format/
      )
      // 3-part but wrong segment lengths (not a real GCM value)
      assert.throws(
        () => decrypt('iv:cipher:extra'),
        /not in the expected encrypted format/
      )
      // 4+ parts — matches neither format
      assert.throws(
        () => decrypt('a:b:c:d'),
        /not in the expected encrypted format/
      )
      // Legacy 2-part with IV of wrong length
      assert.throws(
        () => decrypt('shortiv:ciphertext'),
        /not in the expected encrypted format/
      )
      // Empty-ish (only a colon at wrong position)
      assert.throws(
        () => decrypt(':nodatahere'),
        /not in the expected encrypted format/
      )
    })
    console.log('  ✓ decrypt() throws for plaintext input')
    console.log('  ✓ decrypt() throws for malformed 3-part input')
    console.log('  ✓ decrypt() throws for 4+-part input')
    console.log('  ✓ decrypt() throws when legacy IV is wrong length')
    console.log('  ✓ decrypt() throws when IV is empty')
  }

  // ── 6. GCM tamper detection: any flipped byte fails auth-tag verification ──
  console.log('\nTesting GCM tamper detection...')
  {
    withEnv(VALID_KEY, 'production', () => {
      const flipLastHexChar = (s: string) => s.slice(0, -1) + (s.endsWith('0') ? '1' : '0')

      // Flip one byte of the CIPHERTEXT → auth tag mismatch → throws
      {
        const [iv, tag, cipher] = encrypt('some_credential').split(':')
        const tampered = `${iv}:${tag}:${flipLastHexChar(cipher)}`
        assert.throws(() => decrypt(tampered), (err: Error) => {
          assert.ok(err instanceof Error)
          return true
        })
      }
      // Flip one byte of the AUTH TAG → throws
      {
        const [iv, tag, cipher] = encrypt('some_credential').split(':')
        const tampered = `${iv}:${flipLastHexChar(tag)}:${cipher}`
        assert.throws(() => decrypt(tampered))
      }
      // Flip one byte of the IV → throws
      {
        const [iv, tag, cipher] = encrypt('some_credential').split(':')
        const tampered = `${flipLastHexChar(iv)}:${tag}:${cipher}`
        assert.throws(() => decrypt(tampered))
      }
    })
    console.log('  ✓ decrypt() throws when a ciphertext byte is flipped (auth tag verified)')
    console.log('  ✓ decrypt() throws when the auth tag is tampered')
    console.log('  ✓ decrypt() throws when the IV is tampered')
  }

  // ── 6b. Legacy CBC format (pre-GCM writes) still decrypts ──────────────────
  console.log('\nTesting legacy CBC backward compatibility...')
  {
    withEnv(VALID_KEY, 'production', () => {
      // Construct a value exactly as the pre-migration encrypt() did:
      // AES-256-CBC, 16-byte IV, `iv:ciphertext` hex format.
      const key = Buffer.from(VALID_KEY, 'hex')
      const iv = crypto.randomBytes(16)
      const cipher = crypto.createCipheriv('aes-256-cbc', key, iv)
      const legacy = `${iv.toString('hex')}:${cipher.update('legacy_stored_password', 'utf8', 'hex') + cipher.final('hex')}`

      assert.ok(isLegacyCiphertext(legacy), 'legacy 2-part value detected as legacy')
      assert.ok(!isLegacyCiphertext(encrypt('x')), 'new GCM value not detected as legacy')
      assert.strictEqual(decrypt(legacy), 'legacy_stored_password', 'legacy CBC value decrypts')

      // Corrupted legacy ciphertext (broken block alignment) still throws
      const corrupted = legacy.slice(0, -1)
      assert.throws(() => decrypt(corrupted), (err: Error) => {
        assert.ok(err instanceof Error)
        return true
      })
    })
    console.log('  ✓ legacy iv:ciphertext (CBC) value decrypts correctly')
    console.log('  ✓ isLegacyCiphertext() distinguishes legacy from GCM values')
    console.log('  ✓ decrypt() throws for corrupted legacy ciphertext')
  }

  // ── 7. Empty / falsy passthrough ──────────────────────────────────────────
  console.log('\nTesting empty string passthrough...')
  {
    withEnv(VALID_KEY, 'production', () => {
      assert.strictEqual(encrypt(''), '')
      assert.strictEqual(decrypt(''), '')
    })
    console.log('  ✓ encrypt(\'\') returns \'\'')
    console.log('  ✓ decrypt(\'\') returns \'\'')
  }

  // ── 8. Dev fallback: works without ENCRYPTION_KEY in non-production ───────
  console.log('\nTesting dev fallback in non-production...')
  {
    withEnv(undefined, 'development', () => {
      // Should not throw — uses dev fallback key
      const ciphertext = encrypt('dev_value')
      const decrypted = decrypt(ciphertext)
      assert.strictEqual(decrypted, 'dev_value')
    })
    console.log('  ✓ encrypt/decrypt works in development without ENCRYPTION_KEY (dev fallback)')
  }

  // ── 9. Weak key: known placeholder patterns rejected in production ─────────
  console.log('\nTesting weak key rejection in production...')
  {
    const weakKeys = [
      { key: 'deadbeef'.repeat(8), label: 'dev fallback (deadbeef×8)' },
      { key: 'cafebabe'.repeat(8), label: 'cafebabe placeholder' },
      { key: '00000000'.repeat(8), label: 'all-zeros' },
      { key: 'ffffffff'.repeat(8), label: 'all-ones (0xff×32)' },
    ]
    for (const { key, label } of weakKeys) {
      withEnv(key, 'production', () => {
        assert.throws(
          () => encrypt('secret'),
          (err: Error) => {
            assert.ok(
              err.message.includes('placeholder') || err.message.includes('ENCRYPTION_KEY'),
              `Expected weak-key error for ${label}, got: ${err.message}`
            )
            return true
          }
        )
      })
      console.log(`  ✓ encrypt() rejects known-weak key in production: ${label}`)
    }
  }

  // ── 10. Weak key: all-same-byte keys rejected in production ───────────────
  console.log('\nTesting all-same-byte key rejection in production...')
  {
    // 32 bytes of 0xAB — zero entropy, all identical
    const uniformKey = 'abababab'.repeat(8)
    withEnv(uniformKey, 'production', () => {
      assert.throws(() => encrypt('secret'), /placeholder|ENCRYPTION_KEY/)
    })
    console.log('  ✓ encrypt() rejects all-same-byte key (0xab×32) in production')
  }

  // ── 11. Weak key: sequential-byte keys rejected in production ─────────────
  console.log('\nTesting sequential-byte key rejection in production...')
  {
    // 00 01 02 03 … 1f — ascending byte sequence
    const seqBytes = Buffer.alloc(32)
    for (let i = 0; i < 32; i++) seqBytes[i] = i
    const seqKey = seqBytes.toString('hex')
    withEnv(seqKey, 'production', () => {
      assert.throws(() => encrypt('secret'), /placeholder|ENCRYPTION_KEY/)
    })
    console.log('  ✓ encrypt() rejects ascending-sequential key (0x00…0x1f) in production')

    // ff fe fd fc … e0 — descending sequence
    const descBytes = Buffer.alloc(32)
    for (let i = 0; i < 32; i++) descBytes[i] = 0xFF - i
    const descKey = descBytes.toString('hex')
    withEnv(descKey, 'production', () => {
      assert.throws(() => encrypt('secret'), /placeholder|ENCRYPTION_KEY/)
    })
    console.log('  ✓ encrypt() rejects descending-sequential key (0xff…0xe0) in production')
  }

  // ── 12. Weak key in development: allowed (warn, don't throw) ─────────────
  console.log('\nTesting weak key is allowed in development...')
  {
    withEnv('deadbeef'.repeat(8), 'development', () => {
      // Should not throw in dev — weak-key check is production-only
      const ciphertext = encrypt('dev_secret')
      const decrypted = decrypt(ciphertext)
      assert.strictEqual(decrypted, 'dev_secret')
    })
    console.log('  ✓ Weak key in development does not throw (dev environment allows it)')
  }

  // ── 13. Valid non-weak key accepted in production ─────────────────────────
  console.log('\nTesting valid non-weak key accepted in production...')
  {
    withEnv(VALID_KEY, 'production', () => {
      const ciphertext = encrypt('production_secret')
      assert.strictEqual(decrypt(ciphertext), 'production_secret')
    })
    withEnv(ALT_KEY, 'production', () => {
      const ciphertext = encrypt('another_secret')
      assert.strictEqual(decrypt(ciphertext), 'another_secret')
    })
    console.log('  ✓ Valid random-looking key accepted and round-trips correctly in production')
  }

  console.log('\n🎉 ALL CRYPTO TESTS PASSED! 🎉')
}

runTests().catch((err) => {
  console.error('\n❌ CRYPTO TESTS FAILED:', err)
  process.exit(1)
})

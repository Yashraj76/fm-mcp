/**
 * One-off migration: re-encrypt legacy AES-256-CBC credentials to AES-256-GCM.
 *
 * decrypt() reads both formats, so running this is OPTIONAL for correctness —
 * legacy values also upgrade lazily whenever a row is re-saved. Run it once to
 * get tamper-protection (GCM auth tags) on every stored credential:
 *
 *   npx tsx scripts/reencrypt-credentials.ts          # dry-run (reports counts)
 *   npx tsx scripts/reencrypt-credentials.ts --apply  # rewrite legacy rows
 *
 * Requires DATABASE_URL and the SAME ENCRYPTION_KEY the rows were written with.
 */
import { prisma } from '../src/lib/prisma'
import { decrypt, encrypt, isLegacyCiphertext } from '../src/lib/crypto'

const APPLY = process.argv.includes('--apply')

// model → encrypted columns. Keep in sync with encrypt() call sites.
const TARGETS = [
  { model: 'fMConnection', label: 'FMConnection', columns: ['password', 'clientSecret'] },
  { model: 'appSettings', label: 'AppSettings', columns: ['aiApiKeyEncrypted'] },
  { model: 'fMServerConnection', label: 'FMServerConnection', columns: ['adminPasswordEncrypted'] },
] as const

async function main() {
  let legacyTotal = 0
  let updatedTotal = 0
  let failedTotal = 0

  for (const { model, label, columns } of TARGETS) {
    const delegate = (prisma as any)[model]
    const rows: Array<Record<string, string | null> & { id: string }> = await delegate.findMany({
      select: Object.fromEntries([['id', true], ...columns.map((c) => [c, true])]),
    })

    for (const row of rows) {
      const data: Record<string, string> = {}
      for (const col of columns) {
        const value = row[col]
        if (!value || !isLegacyCiphertext(value)) continue
        legacyTotal++
        try {
          data[col] = encrypt(decrypt(value))
        } catch (e) {
          failedTotal++
          console.error(`  ✗ ${label} ${row.id}.${col}: decrypt failed — wrong key or corrupt value (${(e as Error).message})`)
        }
      }
      if (Object.keys(data).length === 0) continue
      if (APPLY) {
        await delegate.update({ where: { id: row.id }, data })
        updatedTotal += Object.keys(data).length
        console.log(`  ✓ ${label} ${row.id}: re-encrypted ${Object.keys(data).join(', ')}`)
      } else {
        console.log(`  • ${label} ${row.id}: would re-encrypt ${Object.keys(data).join(', ')}`)
      }
    }
  }

  console.log(
    `\n${APPLY ? 'Re-encrypted' : 'Found'} ${APPLY ? updatedTotal : legacyTotal} legacy value(s)` +
    (failedTotal ? `, ${failedTotal} failed (fix the key or clear those rows)` : '') +
    (APPLY ? '' : legacyTotal ? '\nRe-run with --apply to rewrite them.' : ' — nothing to do.')
  )
  process.exit(failedTotal > 0 ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

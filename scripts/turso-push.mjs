#!/usr/bin/env node
/**
 * Syncs schema changes to the Turso database.
 *
 * Since the Prisma schema now points directly at TURSO_DATABASE_URL,
 * `prisma db push` will push changes directly to Turso.
 * This script is kept for manual schema inspection and new-table detection.
 *
 * Workflow for schema changes:
 *   1. Edit prisma/schema.prisma
 *   2. npm run db:push   ← pushes directly to Turso via Prisma
 *   OR for manual inspection:
 *   2. npm run db:turso-push  ← this script
 */

import { createClient } from '@libsql/client'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

// ── Load .env ──────────────────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dirname, '../.env')
try {
  const lines = readFileSync(envPath, 'utf-8').split('\n')
  for (const line of lines) {
    const m = line.match(/^([^#=\s][^=]*)=(.*)$/)
    if (m) {
      const key = m[1].trim()
      const val = m[2].trim().replace(/^["']|["']$/g, '')
      if (!process.env[key]) process.env[key] = val
    }
  }
} catch {
  // .env optional — env vars may already be set
}

// ── Config ─────────────────────────────────────────────────────────────────
const tursoUrl   = process.env.TURSO_DATABASE_URL
const tursoToken = process.env.TURSO_AUTH_TOKEN

if (!tursoUrl || !tursoToken) {
  console.error('✗  TURSO_DATABASE_URL or TURSO_AUTH_TOKEN not set in .env')
  process.exit(1)
}

const turso = createClient({ url: tursoUrl, authToken: tursoToken })

// ── Helpers ────────────────────────────────────────────────────────────────
async function getItems(client, type) {
  const res = await client.execute(
    `SELECT name, sql FROM sqlite_master WHERE type='${type}' AND name NOT LIKE 'sqlite_%' AND sql IS NOT NULL ORDER BY name`
  )
  return new Map(res.rows.map(r => [String(r[0]), String(r[1])]))
}

// ── Main ───────────────────────────────────────────────────────────────────
async function run() {
  console.log(`Inspecting Turso: ${tursoUrl}\n`)

  const [tables, indexes] = await Promise.all([
    getItems(turso, 'table'),
    getItems(turso, 'index'),
  ])

  console.log(`✓  Tables in Turso (${tables.size}):`)
  for (const name of [...tables.keys()].sort()) {
    console.log(`   • ${name}`)
  }

  console.log(`\n✓  Indexes in Turso (${indexes.size}):`)
  for (const name of [...indexes.keys()].sort()) {
    console.log(`   • ${name}`)
  }

  console.log('\n✓  To push schema changes: npm run db:push')
  console.log('   (Prisma db push now targets Turso directly via TURSO_DATABASE_URL)')
}

run().catch(err => {
  console.error('Error:', err.message)
  process.exit(1)
})

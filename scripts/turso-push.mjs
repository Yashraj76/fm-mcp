#!/usr/bin/env node
/**
 * Syncs the local SQLite schema (prisma/dev.db) to the Turso database.
 *
 * Workflow:
 *   1. npm run db:push          ← applies schema changes to local dev.db
 *   2. npm run db:turso-push    ← this script: applies the same changes to Turso
 *
 * Handles: new tables, new indexes. Does NOT handle column renames or drops.
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

// ── Clients ────────────────────────────────────────────────────────────────
const tursoUrl = process.env.TURSO_DATABASE_URL
const tursoToken = process.env.TURSO_AUTH_TOKEN

if (!tursoUrl || !tursoToken) {
  console.error('✗  TURSO_DATABASE_URL or TURSO_AUTH_TOKEN not set')
  process.exit(1)
}

const turso = createClient({ url: tursoUrl, authToken: tursoToken })
const local = createClient({ url: 'file:./prisma/dev.db' })

// ── Helpers ────────────────────────────────────────────────────────────────
async function getItems(client, type) {
  const res = await client.execute(
    `SELECT name, sql FROM sqlite_master WHERE type='${type}' AND name NOT LIKE 'sqlite_%' AND sql IS NOT NULL ORDER BY name`
  )
  return new Map(res.rows.map(r => [String(r[0]), String(r[1])]))
}

// ── Main ───────────────────────────────────────────────────────────────────
async function run() {
  const [localTables, tursoTables] = await Promise.all([
    getItems(local, 'table'),
    getItems(turso, 'table'),
  ])

  // Missing tables
  const missingTables = [...localTables.entries()].filter(([name]) => !tursoTables.has(name))

  if (missingTables.length === 0) {
    console.log('✓  Tables already in sync')
  } else {
    console.log(`→  Creating ${missingTables.length} missing table(s):`)
    for (const [name, sql] of missingTables) {
      try {
        await turso.execute(sql)
        console.log(`   ✓  ${name}`)
      } catch (err) {
        console.error(`   ✗  ${name}: ${err.message}`)
      }
    }
  }

  // Missing indexes
  const [localIndexes, tursoIndexes] = await Promise.all([
    getItems(local, 'index'),
    getItems(turso, 'index'),
  ])
  const missingIndexes = [...localIndexes.entries()].filter(([name]) => !tursoIndexes.has(name))

  if (missingIndexes.length === 0) {
    console.log('✓  Indexes already in sync')
  } else {
    console.log(`→  Creating ${missingIndexes.length} missing index(es):`)
    for (const [name, sql] of missingIndexes) {
      try {
        await turso.execute(sql)
        console.log(`   ✓  ${name}`)
      } catch (err) {
        console.error(`   ✗  ${name}: ${err.message}`)
      }
    }
  }

  console.log('\n✓  Turso push complete')
}

run().catch(err => {
  console.error('Error:', err.message)
  process.exit(1)
})

/**
 * Turso (LibSQL) Prisma client — single source of truth for all DB operations.
 *
 * All routes import from either:
 *   import { db } from '@/lib/db'
 *   import { prisma } from '@/lib/prisma'  ← re-exports db as prisma
 *
 * Both resolve to the same singleton connected to Turso.
 * Local SQLite (dev.db) is no longer used — all data lives in Turso.
 */

import { PrismaClient } from '@prisma/client'
import { PrismaLibSQL } from '@prisma/adapter-libsql'

const globalForPrisma = globalThis as unknown as {
  prismaDb: PrismaClient | undefined
}

function createPrismaClient(): PrismaClient {
  const url = process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL

  if (!url) {
    throw new Error(
      '[db] TURSO_DATABASE_URL is not set. ' +
      'Add it to .env: TURSO_DATABASE_URL="libsql://your-db.turso.io"'
    )
  }

  if (!url.startsWith('libsql://') && !url.startsWith('https://')) {
    throw new Error(
      `[db] TURSO_DATABASE_URL must start with "libsql://" or "https://". Got: ${url.slice(0, 30)}`
    )
  }

  const authToken = process.env.TURSO_AUTH_TOKEN

  if (!authToken) {
    throw new Error(
      '[db] TURSO_AUTH_TOKEN is not set. ' +
      'Add it to .env: TURSO_AUTH_TOKEN="eyJ..."'
    )
  }

  const adapter = new PrismaLibSQL({ url, authToken })
  return new PrismaClient({ adapter })
}

export const db = globalForPrisma.prismaDb ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prismaDb = db
}
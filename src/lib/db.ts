/**
 * Supabase (PostgreSQL) Prisma client — single source of truth for all DB operations.
 *
 * Uses standard Prisma PostgreSQL driver (no adapter needed).
 * - DATABASE_URL: pooled connection (port 6543) — used at runtime on Vercel
 * - DIRECT_URL:   direct connection (port 5432) — used for migrations
 *
 * Import from '@/lib/db' everywhere. Never instantiate PrismaClient directly.
 */

import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prismaDb: PrismaClient | undefined
}

function createPrismaClient(): PrismaClient {
  const url = process.env.DATABASE_URL

  if (!url) {
    throw new Error(
      '[db] DATABASE_URL is not set. ' +
      'Add it to .env: DATABASE_URL="postgresql://postgres:[PASSWORD]@db.[ref].supabase.co:5432/postgres"'
    )
  }

  // Add pgBouncer-friendly params: short connect timeout + retry on closed
  // connections so the 15-minute hang (Error { kind: Closed }) never recurs.
  const urlWithParams = url.includes('?')
    ? `${url}&connect_timeout=10&pool_timeout=10`
    : `${url}?connect_timeout=10&pool_timeout=10`

  return new PrismaClient({
    datasources: { db: { url: urlWithParams } },
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })
}

export const db = globalForPrisma.prismaDb ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prismaDb = db
}
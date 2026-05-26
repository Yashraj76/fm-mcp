/**
 * Diagnostic endpoint — reveals env vars and DB connectivity on Vercel.
 * REMOVE or protect this route before going to production with real users.
 */
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function GET() {
  const checks: Record<string, any> = {}

  // 1. Check all env vars (masked)
  checks.env = {
    DATABASE_URL: process.env.DATABASE_URL ? `set (${process.env.DATABASE_URL.slice(0, 30)}...)` : 'MISSING',
    DIRECT_URL: process.env.DIRECT_URL ? `set (${process.env.DIRECT_URL.slice(0, 30)}...)` : 'MISSING',
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || 'MISSING',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
      ? `set (...${process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.slice(-8)})`
      : 'MISSING',
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY ? `set (length=${process.env.ENCRYPTION_KEY.length})` : 'MISSING',
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || 'MISSING',
  }

  // 2. Test Prisma DB connection
  try {
    const { db } = await import('@/lib/db')
    const count = await db.mcpServer.count()
    checks.database = { status: 'connected', mcpServerCount: count }
  } catch (err: any) {
    checks.database = { status: 'ERROR', error: err.message, stack: err.stack?.slice(0, 500) }
  }

  // 3. Test Supabase client init
  try {
    const { createClient } = await import('@/lib/supabase/server')
    const supabase = await createClient()
    const { data, error } = await supabase.auth.getUser()
    checks.supabase = {
      status: error ? 'error' : 'ok',
      hasUser: !!data?.user,
      error: error?.message || null,
    }
  } catch (err: any) {
    checks.supabase = { status: 'ERROR', error: err.message }
  }

  return NextResponse.json({ ok: true, checks }, { status: 200 })
}

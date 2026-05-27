// Diagnostic endpoint disabled — was used for debugging Vercel env/DB issues.
import { NextResponse } from 'next/server'
export async function GET() {
  return NextResponse.json({ error: 'Not found' }, { status: 404 })
}

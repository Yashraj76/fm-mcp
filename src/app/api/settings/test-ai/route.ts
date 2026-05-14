import { NextResponse } from 'next/server'
import { callAI } from '@/lib/ai/client'

export async function POST() {
  try {
    const result = await callAI({
      systemPrompt: 'You are a test assistant. Respond with exactly "OK" and nothing else.',
      userMessage: 'ping',
      maxTokens: 10,
    })
    const ok = result.trim().includes('OK')
    return NextResponse.json({ success: true, data: { ok, response: result.trim() } })
  } catch (e: any) {
    return NextResponse.json({
      success: false,
      error: e.message || 'AI test failed',
      code: 'AI_TEST_FAILED',
    }, { status: 500 })
  }
}

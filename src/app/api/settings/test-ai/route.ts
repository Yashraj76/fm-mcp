import { NextRequest, NextResponse } from 'next/server'
import { callAI } from '@/lib/ai/client'
import { TEST_AI_PROMPT } from '@/lib/ai/prompts/test-ai'
import { withAuth } from "@/lib/auth/api-guard";
export const POST = withAuth(async (req, { params, userId }) => {
    try {
    const body = await req.json().catch(() => ({}));
    const { provider, apiKey, baseUrl } = body;

    const result = await callAI({
      systemPrompt: TEST_AI_PROMPT,
      userMessage: 'ping',
      maxOutputTokens: 10,
      userId,
      configOverride: {
        provider,
        apiKey,
        baseUrl
      }
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
    });

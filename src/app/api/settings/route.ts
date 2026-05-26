import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { encrypt, decrypt } from '@/lib/crypto'
import { z, ZodError } from 'zod'
import { withAuth } from "@/lib/auth/api-guard";

const settingsSchema = z.object({
  aiProvider: z.enum(['anthropic', 'openai', 'google', 'ollama', 'custom']).optional(),
  aiModel: z.string().min(1).optional(),
  aiApiKey: z.string().optional(),      // plain-text input, stored encrypted
  aiBaseUrl: z.string().optional(),
  aiMaxTokens: z.number().int().min(1).max(32768).optional(),
  aiTemperature: z.number().min(0).max(2).optional(),
})

function maskKey(key: string): string {
  if (!key || key.length <= 8) return key ? '••••' : ''
  return key.slice(0, 4) + '••••' + key.slice(-4)
}

import { getAppSettings } from '@/lib/settings'

export const GET = withAuth(async (req, { params, userId }) => {
    try {
    const settings = await getAppSettings(userId)
    const decryptedKey = settings.aiApiKeyEncrypted ? decrypt(settings.aiApiKeyEncrypted) : ''
    return NextResponse.json({
      success: true,
      data: {
        aiProvider: settings.aiProvider,
        aiModel: settings.aiModel,
        aiApiKeyMasked: maskKey(decryptedKey),
        aiApiKeySet: decryptedKey.length > 0,
        aiBaseUrl: settings.aiBaseUrl,
        aiMaxTokens: settings.aiMaxTokens,
        aiTemperature: settings.aiTemperature,
        updatedAt: settings.updatedAt,
      },
    })
    } catch (e) {
    console.error('[settings GET]', e)
    return NextResponse.json({ success: false, error: 'Internal server error', code: 'SERVER_ERROR' }, { status: 500 })
    }
    });
export const PUT = withAuth(async (req, { params, userId }) => {
    try {
    const body = await req.json()
    const parsed = settingsSchema.parse(body)

    const updateData: any = {}
    if (parsed.aiProvider !== undefined) updateData.aiProvider = parsed.aiProvider
    if (parsed.aiModel !== undefined) updateData.aiModel = parsed.aiModel
    if (parsed.aiApiKey !== undefined && parsed.aiApiKey !== '') {
      updateData.aiApiKeyEncrypted = encrypt(parsed.aiApiKey)
    }
    if (parsed.aiBaseUrl !== undefined) updateData.aiBaseUrl = parsed.aiBaseUrl
    if (parsed.aiMaxTokens !== undefined) updateData.aiMaxTokens = parsed.aiMaxTokens
    if (parsed.aiTemperature !== undefined) updateData.aiTemperature = parsed.aiTemperature

    let settings = await db.appSettings.findFirst({ where: { userId } })
    if (settings) {
      settings = await db.appSettings.update({
        where: { id: settings.id },
        data: updateData,
      })
    } else {
      settings = await db.appSettings.create({
        data: {
          id: `user_${userId}`,
          userId,
          ...updateData,
        },
      })
    }

    const decryptedKey = settings.aiApiKeyEncrypted ? decrypt(settings.aiApiKeyEncrypted) : ''
    return NextResponse.json({
      success: true,
      data: {
        aiProvider: settings.aiProvider,
        aiModel: settings.aiModel,
        aiApiKeyMasked: maskKey(decryptedKey),
        aiApiKeySet: decryptedKey.length > 0,
        aiBaseUrl: settings.aiBaseUrl,
        aiMaxTokens: settings.aiMaxTokens,
        aiTemperature: settings.aiTemperature,
        updatedAt: settings.updatedAt,
      },
    })
    } catch (e) {
    if (e instanceof ZodError) {
      return NextResponse.json({ success: false, error: 'Validation failed', code: 'VALIDATION_ERROR', details: e.issues }, { status: 400 })
    }
    console.error('[settings PUT]', e)
    return NextResponse.json({ success: false, error: 'Internal server error', code: 'SERVER_ERROR' }, { status: 500 })
    }
    });

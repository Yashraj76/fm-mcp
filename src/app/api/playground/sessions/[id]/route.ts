import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth } from "@/lib/auth/api-guard";
import { apiSuccess, apiNotFound } from '@/lib/utils/api-response';
import { safeParseJSON } from '@/lib/utils/safe-parse';

export const GET = withAuth(async (_, { params, userId }) => {
    const { id } = await params;
    const session = await prisma.playgroundSession.findFirst({ where: {
      userId: userId,
      id } });
    if (!session) return apiNotFound('Session not found');

    const agentPlan = safeParseJSON<Record<string, any>>(session.agentPlan);

    return apiSuccess({
      sessionId: session.id,
      status: session.status,
      branchId: session.branchId ?? null,
      userMessage: session.userMessage,
      intent: agentPlan ? agentPlan.intent : null,
      stepLog: safeParseJSON<any[]>(session.stepLog, []),
      finalResult: safeParseJSON(session.finalResult),
      createdAt: session.createdAt,
    });
});

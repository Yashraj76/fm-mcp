import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await prisma.playgroundSession.findUnique({ where: { id } });
  if (!session) return NextResponse.json({ success: false, error: 'Session not found' }, { status: 404 });

  return NextResponse.json({
    success: true,
    data: {
      sessionId: session.id,
      status: session.status,
      userMessage: session.userMessage,
      intent: session.agentPlan ? JSON.parse(session.agentPlan).intent : null,
      stepLog: JSON.parse(session.stepLog),
      finalResult: session.finalResult ? JSON.parse(session.finalResult) : null,
      createdAt: session.createdAt,
    },
  });
}

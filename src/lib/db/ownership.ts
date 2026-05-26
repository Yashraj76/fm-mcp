import { prisma } from '../prisma';

// Returns true if the resource belongs to this user
export async function userOwns(
  model: 'connection' | 'server' | 'serverConnection',
  id: string,
  userId: string
): Promise<boolean> {
  let record: any = null;

  if (model === 'connection') {
    record = await prisma.fMConnection.findFirst({ where: { id, userId }, select: { id: true } });
  } else if (model === 'server') {
    record = await prisma.mcpServer.findFirst({ where: { id, userId }, select: { id: true } });
  } else if (model === 'serverConnection') {
    record = await prisma.fMServerConnection.findFirst({ where: { id, userId }, select: { id: true } });
  }

  return !!record;
}

// Use in nested resource routes (e.g. /api/connections/[id]/browse-schema)
export async function requireOwnership(
  model: 'connection' | 'server' | 'serverConnection',
  id: string,
  userId: string
): Promise<void> {
  const owns = await userOwns(model, id, userId);
  if (!owns) throw new Error('NOT_FOUND'); // throw, not return — catch at route level
}

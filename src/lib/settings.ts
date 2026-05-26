import { prisma } from './prisma';

export async function getAppSettings(userId?: string) {
  if (userId) {
    const userSettings = await prisma.appSettings.findFirst({
      where: { userId },
    });
    if (userSettings) return userSettings;
  }
  // Fall back to global singleton
  return prisma.appSettings.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton' },
    update: {},
  });
}

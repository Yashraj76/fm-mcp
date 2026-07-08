import { prisma } from './prisma';

/** Minimal DB interface required — compatible with Prisma client and transaction clients. */
interface AppSettingsClient {
  appSettings: {
    findUnique(args: { where: { id: string } }): Promise<any>
    upsert(args: { where: { id: string }; create: any; update: any }): Promise<any>
  }
}

/** Derive the per-user AppSettings primary key from a userId. */
export function userSettingsId(userId: string): string {
  return `user_${userId}`;
}

/**
 * Retrieve the effective AppSettings for a user.
 *
 * Lookup order:
 *  1. Per-user row, found via the deterministic primary key `user_${userId}`.
 *     Using findUnique (PK lookup) instead of findFirst avoids arbitrary row
 *     selection if duplicate userId rows somehow exist.
 *  2. Global singleton row (id = 'singleton'), created on first access via upsert
 *     so concurrent cold-starts are safe.
 *
 * `db` is injectable for testing; defaults to the shared Prisma client.
 */
export async function getAppSettings(
  userId?: string,
  db: AppSettingsClient = prisma,
) {
  if (userId) {
    const userSettings = await db.appSettings.findUnique({
      where: { id: userSettingsId(userId) },
    });
    if (userSettings) return userSettings;
  }
  return db.appSettings.upsert({
    where:  { id: 'singleton' },
    create: { id: 'singleton' },
    update: {},
  });
}

import { db } from '@/lib/db';
import { safeParseJSON } from '@/lib/utils/safe-parse';

export async function getEffectiveTools(branchId: string) {
  const branchTools = await db.branchTool.findMany({
    where: { branchId, action: { not: 'deleted' } },
    include: { tool: { include: { server: { include: { connections: { include: { connection: true } } } } } } },
    orderBy: { createdAt: 'asc' },
  });

  return branchTools.map((bt: any) => {
    const base = bt.tool;
    const override = safeParseJSON(bt.overrideData, {});
    return {
      ...base,
      ...override,
    };
  });
}

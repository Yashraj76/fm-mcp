export interface BranchToolForConflictCheck {
  toolId: string;
  toolName: string;
  baseUpdatedAt: Date | null;
  currentToolUpdatedAt: Date;
}

export interface MergeConflict {
  toolId: string;
  toolName: string;
  baseUpdatedAt: string | null;
  currentUpdatedAt: string;
}

/**
 * Detects modified BranchTool entries whose recorded base state (the base
 * Tool.updatedAt at the time the branch edit was made) no longer matches the
 * base tool's current updatedAt — meaning another branch already merged a
 * conflicting change to the same tool since this branch's edit was made.
 *
 * A null baseUpdatedAt (rows written before this field existed) is treated as
 * "unknown base" and never flagged — there is nothing to compare against.
 */
export function detectMergeConflicts(changes: BranchToolForConflictCheck[]): MergeConflict[] {
  const conflicts: MergeConflict[] = [];

  for (const change of changes) {
    if (!change.baseUpdatedAt) continue;
    if (change.baseUpdatedAt.getTime() === change.currentToolUpdatedAt.getTime()) continue;

    conflicts.push({
      toolId: change.toolId,
      toolName: change.toolName,
      baseUpdatedAt: change.baseUpdatedAt.toISOString(),
      currentUpdatedAt: change.currentToolUpdatedAt.toISOString(),
    });
  }

  return conflicts;
}

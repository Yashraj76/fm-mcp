/**
 * UI predicates for deployment rows.
 *
 * The backend status vocabulary (see servers/[id]/deployments, branches/[id]/merge,
 * deployments/[id]/rollback routes) is:
 *   'active'     + isLive=true  → the one live deployment per server
 *   'superseded' + isLive=false → replaced by a newer deploy/merge
 *   'rolled_back'+ isLive=false → replaced by a rollback
 * There is no 'deployed' status — keying UI off it shows nothing.
 */

export interface DeploymentUiFlags {
  status: string;
  isLive: boolean;
}

/** The live deployment — the backend guarantees at most one per server. */
export function isCurrentDeployment(d: DeploymentUiFlags): boolean {
  return d.isLive;
}

/** Any non-live deployment is a valid rollback target (the rollback endpoint rejects isLive ones). */
export function canRollbackTo(d: DeploymentUiFlags): boolean {
  return d.status !== 'active' && !d.isLive;
}

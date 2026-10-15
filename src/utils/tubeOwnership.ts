import { Core, CoreOwner, User } from '../types';
import { DEFAULT_PERMISSIONS } from '../constants';

export type TubeOwner = CoreOwner | 'Mixed';

/** Always inspect every Core in the Tube, regardless of the active UI filter. */
export function getTubeOwner(cores: Core[]): TubeOwner {
  if (cores.length === 0) return 'Mixed';
  return cores.every(core => core.owner === cores[0].owner) ? cores[0].owner : 'Mixed';
}

/** Unassigned Tubes can be assigned by any participating company user.
 * Once assigned, only its company or Admin may manage it.
 */
export function canChangeTubeOwner(user: User | null, currentOwner: TubeOwner): boolean {
  if (!user || !DEFAULT_PERMISSIONS[user.role]?.editRoutes) return false;
  if (user.role === 'Admin') return true;
  const company = user.owner;
  return !!company && company !== 'None' &&
    (currentOwner === 'None' || currentOwner === company);
}

export function tubeIdForCore(coreId: number): number {
  return Math.floor((coreId - 1) / 12) + 1;
}

/** Validate against the latest saved route before writing a Tube Owner change. */
export function validateTubeOwnerUpdates(
  cores: Core[],
  updates: Array<{ coreId: number; data: Partial<Core> }>,
  user: User | null,
  availableOwners: CoreOwner[]
): void {
  const targets = new Map<number, CoreOwner>();
  const ownerUpdates = new Map<number, CoreOwner>();
  const coreIds = new Set(cores.map(core => core.id));
  for (const update of updates) {
    if (!coreIds.has(update.coreId)) throw new Error('A Core in this Tube is no longer available. Please reload the route.');
    const tubeId = tubeIdForCore(update.coreId);
    const savedOwner = getTubeOwner(cores.filter(core => tubeIdForCore(core.id) === tubeId));
    if (!canChangeTubeOwner(user, savedOwner)) {
      throw new Error(`Only the current Owner or Admin can manage Tube ${tubeId}. Please reload the route.`);
    }
    if (update.data.owner === undefined) continue;
    const target = update.data.owner;
    if (target !== 'None' && !availableOwners.includes(target)) {
      throw new Error('This Owner is not available for the selected Fiber route.');
    }
    if (targets.has(tubeId) && targets.get(tubeId) !== target) {
      throw new Error('All Cores in a Tube must have the same Owner.');
    }
    targets.set(tubeId, target);
    ownerUpdates.set(update.coreId, target);
  }
  for (const [tubeId, target] of targets) {
    const tubeCores = cores.filter(core => tubeIdForCore(core.id) === tubeId);
    const current = getTubeOwner(tubeCores);
    if (target === current) continue;
    if (!canChangeTubeOwner(user, current)) {
      throw new Error(`You cannot change the Owner of Tube ${tubeId}. Please reload the route.`);
    }
    if (tubeCores.some(core => ownerUpdates.get(core.id) !== target)) {
      throw new Error(`All Cores in Tube ${tubeId} must be updated together.`);
    }
  }
  for (const update of updates) {
    if (update.data.priority === undefined) continue;
    const tubeId = tubeIdForCore(update.coreId);
    const savedOwner = getTubeOwner(cores.filter(core => tubeIdForCore(core.id) === tubeId));
    const effectiveOwner = targets.get(tubeId) ?? savedOwner;
    if (user?.role !== 'Admin' && effectiveOwner !== user?.owner) {
      throw new Error(`Only the Tube Owner or Admin can change Tube ${tubeId} priority.`);
    }
  }
}

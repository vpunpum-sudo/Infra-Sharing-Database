import { useSyncExternalStore } from 'react';
import { Feature, RolePermissions, UserRole } from '../types';
import { DEFAULT_PERMISSIONS } from '../constants';

// In-memory store for the role permissions in effect. Starts from
// DEFAULT_PERMISSIONS and is replaced by the values saved in Firestore
// (see rolePermissionsService). Kept free of Firebase imports so pure
// utilities and their tests can read permissions.

let current: RolePermissions = DEFAULT_PERMISSIONS;
const listeners = new Set<() => void>();

/** Overlay saved values onto the defaults; unknown keys and non-boolean values are ignored. */
export function mergeWithDefaults(saved: Partial<Record<string, Record<string, unknown>>>): RolePermissions {
  const merged = {} as RolePermissions;
  (Object.keys(DEFAULT_PERMISSIONS) as UserRole[]).forEach(role => {
    const defaults = DEFAULT_PERMISSIONS[role];
    const savedRole = saved[role] || {};
    const rolePerms = { ...defaults };
    (Object.keys(defaults) as Feature[]).forEach(feature => {
      const value = savedRole[feature];
      if (typeof value === 'boolean') rolePerms[feature] = value;
    });
    merged[role] = rolePerms;
  });
  return merged;
}

export const getRolePermissions = (): RolePermissions => current;

export function setRolePermissions(next: RolePermissions) {
  current = next;
  listeners.forEach(listener => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Re-renders the calling component whenever the saved permissions change. */
export function useRolePermissions(): RolePermissions {
  return useSyncExternalStore(subscribe, getRolePermissions, getRolePermissions);
}

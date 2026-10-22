import type { User } from '../types';

export function appUserFromDoc(id: string, data: Record<string, unknown>): User {
  return { ...data, id } as User;
}

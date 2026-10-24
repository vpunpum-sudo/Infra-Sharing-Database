export class CancelledHistoryLoadError extends Error { constructor() { super('History load cancelled'); } }
export function createSnapshotCache<T>(capacity = 8) {
  const resident = new Map<string, T>();
  const pending = new Map<string, Promise<T>>();
  let generation = 0;
  let staleDropped = 0;
  const cancelPending = () => { generation++; pending.clear(); };
  return {
    get size() { return resident.size; }, get staleDropped() { return staleDropped; },
    cancelPending,
    resetSession() { cancelPending(); resident.clear(); },
    load(key: string, loader: () => Promise<T>): Promise<T> {
      if (resident.has(key)) { const value = resident.get(key)!; resident.delete(key); resident.set(key, value); return Promise.resolve(value); }
      if (pending.has(key)) return pending.get(key)!;
      const token = generation;
      const promise = Promise.resolve().then(loader).then(value => {
        if (token !== generation) { staleDropped++; throw new CancelledHistoryLoadError(); }
        resident.set(key, value);
        if (resident.size > capacity) resident.delete(resident.keys().next().value!);
        return value;
      }).finally(() => { if (pending.get(key) === promise) pending.delete(key); });
      pending.set(key, promise); return promise;
    }
  };
}

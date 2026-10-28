export interface SelectionResult {
  readonly id: string | undefined;
  readonly cleared: boolean;
}

export function reconcileSelection(
  selectedId: string | undefined,
  existingIds: ReadonlySet<string> | readonly string[],
  listLoaded: boolean
): SelectionResult {
  if (!selectedId) return { id: undefined, cleared: false };
  if (!listLoaded) return { id: selectedId, cleared: false };
  const exists = Array.isArray(existingIds)
    ? (existingIds as readonly string[]).includes(selectedId)
    : (existingIds as ReadonlySet<string>).has(selectedId);
  return exists ? { id: selectedId, cleared: false } : { id: undefined, cleared: true };
}

export function countActiveFilters(
  values: Readonly<Record<string, string | undefined | null>>,
  neutral: Readonly<Record<string, string>> = {}
): number {
  return Object.entries(values).filter(([key, value]) => {
    const trimmed = (value ?? '').trim();
    return trimmed !== '' && trimmed !== neutral[key];
  }).length;
}

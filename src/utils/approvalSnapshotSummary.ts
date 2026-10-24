import type { ApprovalSnapshot } from './approvalSnapshot';
export type SummaryRow = { id: string; cells: Array<string | number> };
export type SnapshotSummary = ReturnType<typeof summarizeSnapshot>;
const valid = (items: unknown, skipped: { count: number }): Record<string, any>[] => {
  if (!Array.isArray(items)) { skipped.count++; return []; }
  return items.filter(i => { const ok = i && typeof i === 'object' && typeof i.id === 'string'; if (!ok) skipped.count++; return ok; });
};
const text = (v: unknown) => typeof v === 'string' ? v : '-';
const ownerList = (items: unknown[]) => [...new Set(items.filter(o => ['ITEL', 'SYMC', 'UIH'].includes(o as string)))].sort().join(', ') || '-';
export function summarizeSnapshot(snapshot: Pick<ApprovalSnapshot, 'collections'>) {
  const c = snapshot?.collections; const skipped = { count: 0 };
  const types = new Map(valid(c?.enclosureTypes, skipped).map(t => [t.id, text(t.name)]));
  const routes = valid(c?.routes, skipped).map(r => ({ id: r.id, cells: [text(r.name), ownerList(Array.isArray(r.owners) ? r.owners : Array.isArray(r.cores) ? r.cores.map((x: any) => x?.owner) : []), Number.isFinite(r.capacity) ? r.capacity : '-', Number.isFinite(r.totalLength) ? r.totalLength : 'ไม่ได้บันทึกไว้'] } satisfies SummaryRow));
  const enclosures = valid(c?.enclosures, skipped).map(e => ({ id: e.id, cells: [text(e.name), types.get(e.enclosureTypeId) || '-', ownerList([...Object.values(e.trayAssignments || {}), ...Object.values(e.portAssignments || {}).map((x: any) => x?.owner)])] } satisfies SummaryRow));
  const loops = valid(c?.loops, skipped).map(l => ({ id: l.id, cells: [text(l.name), Number.isFinite(l.length) ? l.length : 'ไม่ได้บันทึกไว้'] } satisfies SummaryRow));
  return { counts: { routes: routes.length, enclosures: enclosures.length, loops: loops.length }, routes, enclosures, loops, skippedMalformed: skipped.count };
}

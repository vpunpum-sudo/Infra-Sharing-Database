import { CoreOwner, FiberEnclosure, Route } from '../types';

export const formatNumberRanges = (values: number[]): string => {
  const sorted = [...new Set(values.filter(Number.isFinite))].sort((a, b) => a - b);
  if (!sorted.length) return 'ยังไม่ได้กำหนด';
  const ranges: string[] = [];
  let start = sorted[0];
  let last = start;
  for (const value of sorted.slice(1)) {
    if (value === last + 1) last = value;
    else {
      ranges.push(start === last ? `${start}` : `${start}-${last}`);
      start = last = value;
    }
  }
  ranges.push(start === last ? `${start}` : `${start}-${last}`);
  return ranges.join(', ');
};

/** Only saved core owners and Enclosure tray assignments are shown in approval documents. */
export function getApprovalAllocation(route: Route | undefined, enclosures: FiberEnclosure[], owner: CoreOwner) {
  const coreIds = (route?.cores || []).filter(core => core.owner === owner).map(core => core.id);
  const tubeIds = coreIds.map(id => Math.floor((id - 1) / 12) + 1);
  const trays = enclosures.map(enclosure => {
    const ids = Object.entries(enclosure.trayAssignments || {})
      .filter(([, assignedOwner]) => assignedOwner === owner)
      .map(([id]) => Number(id));
    return { enclosure: enclosure.name || enclosure.id, value: formatNumberRanges(ids) };
  });
  const distinct = [...new Set(trays.map(tray => tray.value))];
  const trayText = trays.length === 0 ? 'ยังไม่ได้กำหนด'
    : distinct.length === 1 ? `${distinct[0]} (${trays.length} จุด)`
      : trays.map(tray => `${tray.enclosure}: ${tray.value}`).join(' | ');
  return {
    coreText: formatNumberRanges(coreIds),
    tubeText: formatNumberRanges(tubeIds),
    trayText
  };
}

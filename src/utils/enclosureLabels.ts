export const ENCLOSURE_NAMES_OVERLAY = 'Enclosure Names';

export function getEnclosureMarkerKey(id: string, namesEnabled: boolean): string {
  // Recreate off-map markers when names change so an old bound tooltip cannot reopen.
  return `${id}-${namesEnabled ? 'names-on' : 'names-off'}`;
}

export function getEnclosureLabel(enclosure: { name?: string | null }): string | null {
  const label = enclosure.name?.trim();
  return label || null;
}

export function getEnclosureLabelOffset(kind: 'icon' | 'circle', enlarged: boolean): [number, number] {
  // The marker anchors are centered. Leave two pixels between its edge and the label.
  const radius = kind === 'icon' ? (enlarged ? 12 : 10) : (enlarged ? 9 : 7);
  return [radius + 2, 0];
}

export function getEnclosureLabelKey(enlarged: boolean): string {
  // React-Leaflet creates a Tooltip with immutable options. Remount it when the marker size changes.
  return enlarged ? 'enclosure-name-edit' : 'enclosure-name-normal';
}

export interface AltSyncableMarker {
  options: { alt?: string };
  getElement(): object | null | undefined;
}

// Leaflet recreates an icon from options.alt when its overlay is re-added.
// Update that value and the current icon so renames are reflected in both cases.
export function syncMarkerAlt(marker: AltSyncableMarker | null | undefined, name?: string | null): void {
  if (!marker) return;

  const alt = name ?? '';
  if (marker.options.alt !== alt) marker.options.alt = alt;

  const element = marker.getElement();
  if (element && 'alt' in element && element.alt !== alt) {
    element.alt = alt;
  }
}

export const ENCLOSURE_NAMES_OVERLAY = 'Enclosure Names';

export function getEnclosureMarkerKey(id: string, namesEnabled: boolean): string {
  // Recreate off-map markers when names change so an old bound tooltip cannot reopen.
  return `${id}-${namesEnabled ? 'names-on' : 'names-off'}`;
}

export function getEnclosureLabel(enclosure: { name?: string | null }): string | null {
  const label = enclosure.name?.trim();
  return label || null;
}

export type LabelDirection = 'right' | 'left' | 'top' | 'bottom';
export const LABEL_DIRECTIONS: readonly LabelDirection[] = ['right', 'left', 'top', 'bottom'];

// Keep these values in sync with .enclosure-name-label in index.css.
export const LABEL_GAP = 2;
export const LABEL_SAFETY = 1;
export const LABEL_PADDING_X = 5;
export const LABEL_PADDING_Y = 2;
export const LABEL_BORDER = 1;
export const LABEL_NORMAL_FONT_SIZE = 11;
export const LABEL_COMPACT_FONT_SIZE = 10;
export const LABEL_FONT_WEIGHT = 600;
export const LABEL_NORMAL_MAX_WIDTH = 160;
export const LABEL_COMPACT_MAX_WIDTH = 120;
export const LABEL_COMPACT_BREAKPOINT = 640;

export function getEnclosureMarkerRadius(kind: 'icon' | 'circle', enlarged: boolean): number {
  return kind === 'icon' ? (enlarged ? 12 : 10) : (enlarged ? 9 : 7);
}

export function getEnclosureLabelOffset(kind: 'icon' | 'circle', enlarged: boolean, direction: LabelDirection): [number, number] {
  const distance = getEnclosureMarkerRadius(kind, enlarged) + LABEL_GAP;
  switch (direction) {
    case 'right': return [distance, 0];
    case 'left': return [-distance, 0];
    case 'top': return [0, -distance];
    case 'bottom': return [0, distance];
  }
}

export interface LabelLayoutItem {
  id: string;
  x: number;
  y: number;
  markerRadius: number;
  label: string | null;
  labelWidth: number;
  labelHeight: number;
  priority: number;
}

export interface Rect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export type LabelPlacement = { direction: LabelDirection } | { hidden: true };

export function getLabelRect(item: LabelLayoutItem, direction: LabelDirection): Rect {
  const distance = item.markerRadius + LABEL_GAP;
  const { x, y, labelWidth: width, labelHeight: height } = item;
  switch (direction) {
    case 'right': return { left: x + distance, right: x + distance + width, top: y - height / 2, bottom: y + height / 2 };
    case 'left': return { left: x - distance - width, right: x - distance, top: y - height / 2, bottom: y + height / 2 };
    case 'top': return { left: x - width / 2, right: x + width / 2, top: y - distance - height, bottom: y - distance };
    case 'bottom': return { left: x - width / 2, right: x + width / 2, top: y + distance, bottom: y + distance + height };
  }
}

function intersects(a: Rect, b: Rect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

export function layoutEnclosureLabels(items: LabelLayoutItem[]): Map<string, LabelPlacement> {
  const placements = new Map<string, LabelPlacement>();
  const markers = items.map(item => ({
    id: item.id,
    rect: {
      left: item.x - item.markerRadius,
      right: item.x + item.markerRadius,
      top: item.y - item.markerRadius,
      bottom: item.y + item.markerRadius
    }
  }));
  const placedRects: Rect[] = [];
  const ordered = items.map((item, index) => ({ item, index }))
    .filter(({ item }) => item.label !== null)
    .sort((a, b) => a.item.priority - b.item.priority || a.index - b.index);

  for (const { item } of ordered) {
    let placement: LabelPlacement = { hidden: true };
    // A shared centre cannot identify which of the overlapping markers owns a label.
    // Keep the markers as they are and hide their labels at this zoom level.
    if (items.some(other => other.id !== item.id && other.x === item.x && other.y === item.y)) {
      placements.set(item.id, placement);
      continue;
    }
    for (const direction of LABEL_DIRECTIONS) {
      const rect = getLabelRect(item, direction);
      const padded = {
        left: rect.left - LABEL_SAFETY,
        right: rect.right + LABEL_SAFETY,
        top: rect.top - LABEL_SAFETY,
        bottom: rect.bottom + LABEL_SAFETY
      };
      if (markers.some(marker => marker.id !== item.id && intersects(padded, marker.rect))) continue;
      if (placedRects.some(other => intersects(padded, other))) continue;
      placement = { direction };
      placedRects.push(padded);
      break;
    }
    placements.set(item.id, placement);
  }
  return placements;
}

const widthCache = new Map<string, number>();
let measureContext: CanvasRenderingContext2D | null = null;

export function clearEnclosureLabelWidthCache(): void {
  widthCache.clear();
}

export function getEnclosureLabelHeight(compact: boolean): number {
  const fontSize = compact ? LABEL_COMPACT_FONT_SIZE : LABEL_NORMAL_FONT_SIZE;
  return Math.ceil(fontSize * 1.3) + 2 * LABEL_PADDING_Y + 2 * LABEL_BORDER;
}

export function measureEnclosureLabelWidth(text: string, compact: boolean, mapContainer?: HTMLElement): number {
  const key = `${compact}|${text}`;
  const cached = widthCache.get(key);
  if (cached !== undefined) return cached;

  const fontSize = compact ? LABEL_COMPACT_FONT_SIZE : LABEL_NORMAL_FONT_SIZE;
  const maxWidth = compact ? LABEL_COMPACT_MAX_WIDTH : LABEL_NORMAL_MAX_WIDTH;
  if (!measureContext && typeof document !== 'undefined') {
    measureContext = document.createElement('canvas').getContext('2d');
  }
  let textWidth = text.length * fontSize * 0.6;
  if (measureContext) {
    const fontFamily = mapContainer ? getComputedStyle(mapContainer).fontFamily : 'sans-serif';
    measureContext.font = `${LABEL_FONT_WEIGHT} ${fontSize}px ${fontFamily}`;
    textWidth = measureContext.measureText(text).width;
  }
  const width = Math.min(Math.ceil(textWidth) + 2 * LABEL_PADDING_X + 2 * LABEL_BORDER, maxWidth);
  widthCache.set(key, width);
  return width;
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

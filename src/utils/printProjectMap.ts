export type PrintMapPoint = { lat: number; lng: number };

export type PrintMapRoute = {
  name: string;
  color: string;
  points: PrintMapPoint[];
};

export type PrintMapEnclosure = {
  label: string;
  color: string;
  iconUrl?: string;
  position: PrintMapPoint;
};

const MAP_WIDTH = 1000;
const MAP_HEIGHT = 550;
const TILE_SIZE = 256;

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[char] || char);

const safeColor = (value: string | undefined, fallback: string) =>
  value && /^#[0-9a-f]{3,8}$/i.test(value) ? value : fallback;

const validPoint = (point: PrintMapPoint | undefined): point is PrintMapPoint =>
  !!point && Number.isFinite(point.lat) && Number.isFinite(point.lng) &&
  Math.abs(point.lat) <= 90 && Math.abs(point.lng) <= 180;

const worldPoint = (point: PrintMapPoint) => {
  const latitude = Math.max(-85.0511, Math.min(85.0511, point.lat));
  const sin = Math.sin(latitude * Math.PI / 180);
  return {
    x: (point.lng + 180) / 360 * TILE_SIZE,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * TILE_SIZE
  };
};

export function renderPrintableProjectMap(
  routes: PrintMapRoute[], enclosures: PrintMapEnclosure[],
  options: { focusOnEnclosures?: boolean } = {}
): string {
  const visibleRoutes = routes.map(route => ({
    ...route,
    points: route.points.filter(validPoint)
  }));
  const visibleEnclosures = enclosures.filter(enclosure => validPoint(enclosure.position));
  const coordinates = options.focusOnEnclosures && visibleEnclosures.length > 0
    ? visibleEnclosures.map(enclosure => enclosure.position)
    : [...visibleRoutes.flatMap(route => route.points), ...visibleEnclosures.map(enclosure => enclosure.position)];

  if (coordinates.length === 0) {
    return `<div style="margin-top: 14px; padding: 24px; border: 1px solid #cbd5e1; border-radius: 8px; color: #64748b; text-align: center;">ไม่มีพิกัดเส้นทางหรือ Enclosure สำหรับแสดงแผนที่โครงการ</div>`;
  }

  const projected = coordinates.map(worldPoint);
  const minX = Math.min(...projected.map(point => point.x));
  const maxX = Math.max(...projected.map(point => point.x));
  const minY = Math.min(...projected.map(point => point.y));
  const maxY = Math.max(...projected.map(point => point.y));
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const fitScale = Math.min((MAP_WIDTH - 180) / Math.max(spanX, 0.0001), (MAP_HEIGHT - 130) / Math.max(spanY, 0.0001));
  const zoom = Math.max(3, Math.min(18, Math.floor(Math.log2(fitScale))));
  const scale = 2 ** zoom;
  const centerX = (minX + maxX) / 2 * scale;
  const centerY = (minY + maxY) / 2 * scale;
  const left = centerX - MAP_WIDTH / 2;
  const top = centerY - MAP_HEIGHT / 2;
  const toScreen = (point: PrintMapPoint) => {
    const world = worldPoint(point);
    return { x: world.x * scale - left, y: world.y * scale - top };
  };

  const tiles: string[] = [];
  const tileCount = 2 ** zoom;
  for (let tileX = Math.floor(left / TILE_SIZE); tileX <= Math.floor((left + MAP_WIDTH) / TILE_SIZE); tileX++) {
    for (let tileY = Math.floor(top / TILE_SIZE); tileY <= Math.floor((top + MAP_HEIGHT) / TILE_SIZE); tileY++) {
      if (tileY < 0 || tileY >= tileCount) continue;
      const wrappedX = ((tileX % tileCount) + tileCount) % tileCount;
      const tileLeft = (tileX * TILE_SIZE - left) / MAP_WIDTH * 100;
      const tileTop = (tileY * TILE_SIZE - top) / MAP_HEIGHT * 100;
      tiles.push(`<img src="https://mt1.google.com/vt/lyrs=m&amp;x=${wrappedX}&amp;y=${tileY}&amp;z=${zoom}" alt="" loading="eager" style="position: absolute; left: ${tileLeft.toFixed(3)}%; top: ${tileTop.toFixed(3)}%; width: ${(TILE_SIZE / MAP_WIDTH * 100).toFixed(3)}%; height: ${(TILE_SIZE / MAP_HEIGHT * 100).toFixed(3)}%; border: 0;" />`);
    }
  }

  const routeLines = visibleRoutes.filter(route => route.points.length >= 2).map(route => {
    const points = route.points.map(point => {
      const screen = toScreen(point);
      return `${screen.x.toFixed(1)},${screen.y.toFixed(1)}`;
    }).join(' ');
    const color = safeColor(route.color, '#0284c7');
    return `<polyline points="${points}" fill="none" stroke="#ffffff" stroke-width="8" stroke-linejoin="round" stroke-linecap="round" opacity="0.95" /><polyline points="${points}" fill="none" stroke="${color}" stroke-width="5" stroke-linejoin="round" stroke-linecap="round" />`;
  }).join('');

  const labelBoxes: { x: number; y: number; width: number; height: number }[] = [];
  const calloutLines: string[] = [];
  const markers = visibleEnclosures.map(enclosure => {
    const screen = toScreen(enclosure.position);
    const x = (screen.x / MAP_WIDTH * 100).toFixed(3);
    const y = (screen.y / MAP_HEIGHT * 100).toFixed(3);
    const icon = enclosure.iconUrl
      ? `<img src="${escapeHtml(enclosure.iconUrl)}" alt="" style="width: 16px; height: 16px; object-fit: contain; background: white; border: 1px solid #0f172a; border-radius: 3px;" />`
      : `<span style="display: block; width: 12px; height: 12px; background: ${safeColor(enclosure.color, '#3b82f6')}; border: 2px solid white; border-radius: 50%; box-shadow: 0 0 0 1px #0f172a;"></span>`;
    const boxWidth = 196;
    const boxHeight = Math.max(44, Math.ceil(enclosure.label.length / 28) * 13 + 8);
    let chosen: { x: number; y: number; width: number; height: number } | undefined;
    const rightSide = screen.x < MAP_WIDTH / 2;
    for (const side of [rightSide ? 1 : -1, rightSide ? -1 : 1]) {
      for (let step = 0; step <= 12 && !chosen; step++) {
        for (const sign of step === 0 ? [1] : [1, -1]) {
          const candidate = {
            x: Math.max(5, Math.min(MAP_WIDTH - boxWidth - 5, screen.x + side * 24 - (side < 0 ? boxWidth : 0))),
            y: Math.max(5, Math.min(MAP_HEIGHT - boxHeight - 5, screen.y - boxHeight / 2 + sign * step * 47)),
            width: boxWidth,
            height: boxHeight
          };
          if (!labelBoxes.some(box => candidate.x < box.x + box.width + 4 && candidate.x + boxWidth + 4 > box.x && candidate.y < box.y + box.height + 4 && candidate.y + boxHeight + 4 > box.y)) {
            chosen = candidate;
            break;
          }
        }
      }
      if (chosen) break;
    }
    if (!chosen) chosen = { x: Math.max(5, Math.min(MAP_WIDTH - boxWidth - 5, screen.x + 24)), y: Math.max(5, Math.min(MAP_HEIGHT - boxHeight - 5, screen.y - boxHeight / 2)), width: boxWidth, height: boxHeight };
    labelBoxes.push(chosen);
    const lineEndX = chosen.x > screen.x ? chosen.x : chosen.x + boxWidth;
    const lineEndY = chosen.y + boxHeight / 2;
    calloutLines.push(`<line x1="${screen.x.toFixed(1)}" y1="${screen.y.toFixed(1)}" x2="${lineEndX.toFixed(1)}" y2="${lineEndY.toFixed(1)}" stroke="#0f172a" stroke-width="1.5" />`);
    const label = `<span style="position: absolute; left: ${(chosen.x / MAP_WIDTH * 100).toFixed(3)}%; top: ${(chosen.y / MAP_HEIGHT * 100).toFixed(3)}%; width: ${(boxWidth / MAP_WIDTH * 100).toFixed(3)}%; min-height: ${(boxHeight / MAP_HEIGHT * 100).toFixed(3)}%; box-sizing: border-box; overflow-wrap: anywhere; background: rgba(255,255,255,.96); color: #0f172a; border: 1px solid #334155; border-radius: 4px; padding: 3px 5px; font-size: 10px; line-height: 1.2; font-weight: 700; z-index: 3;">${escapeHtml(enclosure.label)}</span>`;
    return `<div style="position: absolute; left: ${x}%; top: ${y}%; transform: translate(-50%, -50%); z-index: 4;">${icon}</div>${label}`;
  }).join('');

  const legend = visibleRoutes.filter(route => route.points.length >= 2).map(route =>
    `<span style="display: inline-flex; align-items: center; gap: 4px;"><span style="display: inline-block; width: 18px; border-top: 4px solid ${safeColor(route.color, '#0284c7')};"></span>${escapeHtml(route.name)}</span>`
  ).join('');

  return `<section class="pdf-map pdf-keep-together" style="margin-top: 14px; break-inside: avoid; page-break-inside: avoid;">
    <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 6px; font-size: 11px; color: #334155;">
      <strong style="font-size: 13px; color: #0369a1;">แผนที่เส้นทางโครงการ (Project Map)</strong>
      <span>${visibleRoutes.filter(route => route.points.length >= 2).length} เส้นทาง · ${visibleEnclosures.length} จุด Enclosure</span>
    </div>
    <div style="position: relative; width: 100%; height: ${MAP_HEIGHT}px; overflow: hidden; border: 1px solid #94a3b8; border-radius: 8px; background: repeating-linear-gradient(0deg, #e9f1eb, #e9f1eb 31px, #dae6dc 32px), repeating-linear-gradient(90deg, transparent, transparent 31px, #dae6dc 32px);">
      ${tiles.join('')}
      <svg viewBox="0 0 ${MAP_WIDTH} ${MAP_HEIGHT}" preserveAspectRatio="none" aria-hidden="true" style="position: absolute; inset: 0; width: 100%; height: 100%; z-index: 1;">${routeLines}${calloutLines.join('')}</svg>
      ${markers}
    </div>
    ${legend ? `<div style="display: flex; flex-wrap: wrap; gap: 6px 14px; margin-top: 6px; font-size: 10px; color: #475569;">${legend}</div>` : ''}
  </section>`;
}

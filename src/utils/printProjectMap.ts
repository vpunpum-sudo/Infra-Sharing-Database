export type PrintMapPoint = { lat: number; lng: number };

export type PrintMapRoute = {
  name: string;
  color: string;
  distanceKm: string;
  fiberType: string;
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
  routes: PrintMapRoute[], enclosures: PrintMapEnclosure[]
): string {
  const visibleRoutes = routes.map(route => ({
    ...route,
    points: route.points.filter(validPoint)
  }));
  const visibleEnclosures = enclosures.filter(enclosure => validPoint(enclosure.position));
  const coordinates = [...visibleRoutes.flatMap(route => route.points), ...visibleEnclosures.map(enclosure => enclosure.position)];

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

  const drawableRoutes = visibleRoutes.filter(route => route.points.length >= 2);
  const routeLines = drawableRoutes.map(route => {
    const points = route.points.map(point => {
      const screen = toScreen(point);
      return `${screen.x.toFixed(1)},${screen.y.toFixed(1)}`;
    }).join(' ');
    const color = safeColor(route.color, '#0284c7');
    return `<polyline points="${points}" fill="none" stroke="#ffffff" stroke-width="8" stroke-linejoin="round" stroke-linecap="round" opacity="0.95" /><polyline points="${points}" fill="none" stroke="${color}" stroke-width="5" stroke-linejoin="round" stroke-linecap="round" />`;
  }).join('');

  // Place a compact route description near its line, avoiding other descriptions
  // and the map legend. The leader makes the associated Fiber unambiguous.
  const labelBoxes: { x: number; y: number; width: number; height: number }[] = [
    { x: MAP_WIDTH - 270, y: 0, width: 270, height: Math.min(160, 26 + drawableRoutes.length * 27) }
  ];
  const calloutLines: string[] = [];
  const routeLabels = drawableRoutes.map((route, routeIndex) => {
    const width = 260;
    const height = 94;
    const anchors = [0.5, 0.3, 0.7, 0.15, 0.85].map(fraction =>
      toScreen(route.points[Math.round((route.points.length - 1) * fraction)]));
    let chosen: { x: number; y: number; width: number; height: number } | undefined;
    let anchor = anchors[0];
    for (const point of anchors) {
      for (const [dx, dy] of [[-width / 2, -height - 28], [-width / 2, 28], [24, -height / 2], [-width - 24, -height / 2]]) {
        const candidate = {
          x: Math.max(6, Math.min(MAP_WIDTH - width - 6, point.x + dx)),
          y: Math.max(6, Math.min(MAP_HEIGHT - height - 6, point.y + dy)),
          width, height
        };
        if (labelBoxes.some(box => candidate.x < box.x + box.width + 8 && candidate.x + width + 8 > box.x && candidate.y < box.y + box.height + 8 && candidate.y + height + 8 > box.y)) continue;
        chosen = candidate;
        anchor = point;
        break;
      }
      if (chosen) break;
    }
    if (!chosen) {
      anchor = anchors[0];
      chosen = { x: Math.max(6, Math.min(MAP_WIDTH - width - 6, anchor.x - width / 2)), y: Math.min(MAP_HEIGHT - height - 6, 8 + routeIndex * (height + 8)), width, height };
    }
    labelBoxes.push(chosen);
    const lineEndX = Math.max(chosen.x, Math.min(chosen.x + width, anchor.x));
    const lineEndY = Math.max(chosen.y, Math.min(chosen.y + height, anchor.y));
    calloutLines.push(`<line x1="${anchor.x.toFixed(1)}" y1="${anchor.y.toFixed(1)}" x2="${lineEndX.toFixed(1)}" y2="${lineEndY.toFixed(1)}" stroke="${safeColor(route.color, '#0284c7')}" stroke-width="2" />`);
    return `<div style="position: absolute; left: ${(chosen.x / MAP_WIDTH * 100).toFixed(3)}%; top: ${(chosen.y / MAP_HEIGHT * 100).toFixed(3)}%; width: ${(width / MAP_WIDTH * 100).toFixed(3)}%; min-height: ${(height / MAP_HEIGHT * 100).toFixed(3)}%; box-sizing: border-box; background: rgba(255,255,255,.97); border: 2px solid ${safeColor(route.color, '#0284c7')}; border-radius: 6px; padding: 5px 7px; box-shadow: 0 2px 5px rgba(15,23,42,.15); color: #0f172a; font-size: 10px; line-height: 1.2; z-index: 5; overflow-wrap: anywhere;"><strong style="display:block;">${escapeHtml(route.name)}</strong><span style="display:block; margin-top: 3px; color:#334155;">${escapeHtml(route.distanceKm)} km · ${escapeHtml(route.fiberType)}</span></div>`;
  }).join('');

  const markers = visibleEnclosures.map((enclosure, index) => {
    const screen = toScreen(enclosure.position);
    const x = (screen.x / MAP_WIDTH * 100).toFixed(3);
    const y = (screen.y / MAP_HEIGHT * 100).toFixed(3);
    const icon = enclosure.iconUrl
      ? `<img src="${escapeHtml(enclosure.iconUrl)}" alt="" style="width: 16px; height: 16px; object-fit: contain; background: white; border: 1px solid #0f172a; border-radius: 3px;" />`
      : `<span style="display: block; width: 12px; height: 12px; background: ${safeColor(enclosure.color, '#3b82f6')}; border: 2px solid white; border-radius: 50%; box-shadow: 0 0 0 1px #0f172a;"></span>`;
    const labelOffset = index % 2 === 0 ? 'translate(-50%, -100%)' : 'translate(-50%, 0)';
    const labelTop = index % 2 === 0 ? '-10px' : '10px';
    return `<div style="position: absolute; left: ${x}%; top: ${y}%; transform: translate(-50%, -50%); z-index: 6;">${icon}<span style="position: absolute; left: 50%; top: ${labelTop}; transform: ${labelOffset}; white-space: nowrap; max-width: 165px; overflow: hidden; text-overflow: ellipsis; background: rgba(255,255,255,.95); border: 1px solid #94a3b8; border-radius: 4px; padding: 2px 4px; color: #0f172a; font-size: 9px; font-weight: 700;">${escapeHtml(enclosure.label)}</span></div>`;
  }).join('');

  const legend = drawableRoutes.map((route, index) =>
    `<div style="display: flex; align-items: center; gap: 6px; white-space: nowrap;"><span style="display: inline-block; width: 20px; flex: none; border-top: 4px solid ${safeColor(route.color, '#0284c7')};"></span><span style="overflow: hidden; text-overflow: ellipsis;">เส้นที่ ${index + 1}: ${escapeHtml(route.fiberType)}</span></div>`
  ).join('');

  return `<section class="pdf-map pdf-keep-together" style="margin-top: 14px; break-inside: avoid; page-break-inside: avoid;">
    <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 6px; font-size: 11px; color: #334155;">
      <strong style="font-size: 13px; color: #0369a1;">แผนที่เส้นทางโครงการ (Project Map)</strong>
      <span>${drawableRoutes.length} เส้นทาง · ${visibleEnclosures.length} จุด Enclosure ต้นทาง/ปลายทาง</span>
    </div>
    <div style="position: relative; width: 100%; height: ${MAP_HEIGHT}px; overflow: hidden; border: 1px solid #94a3b8; border-radius: 8px; background: repeating-linear-gradient(0deg, #e9f1eb, #e9f1eb 31px, #dae6dc 32px), repeating-linear-gradient(90deg, transparent, transparent 31px, #dae6dc 32px);">
      ${tiles.join('')}
      <svg viewBox="0 0 ${MAP_WIDTH} ${MAP_HEIGHT}" preserveAspectRatio="none" aria-hidden="true" style="position: absolute; inset: 0; width: 100%; height: 100%; z-index: 1;">${routeLines}${calloutLines.join('')}</svg>
      ${routeLabels}
      ${markers}
      ${legend ? `<div style="position: absolute; right: 8px; top: 8px; z-index: 7; max-width: 250px; box-sizing: border-box; padding: 7px 9px; background: rgba(255,255,255,.96); border: 1px solid #94a3b8; border-radius: 6px; color: #334155; font-size: 10px; font-weight: 600;"><strong style="display:block; margin-bottom:4px; color:#0f172a;">Legend</strong>${legend}</div>` : ''}
    </div>
  </section>`;
}

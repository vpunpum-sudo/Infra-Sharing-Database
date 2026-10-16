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

  const legendHeight = 24 + drawableRoutes.length * 48;
  const occupied: { x: number; y: number; width: number; height: number }[] = [
    { x: MAP_WIDTH - 300, y: 0, width: 300, height: legendHeight }
  ];
  const overlaps = (box: { x: number; y: number; width: number; height: number }) =>
    occupied.some(other => box.x < other.x + other.width + 6 && box.x + box.width + 6 > other.x &&
      box.y < other.y + other.height + 6 && box.y + box.height + 6 > other.y);
  const endpointLines: string[] = [];
  const markers = visibleEnclosures.map(enclosure => {
    const screen = toScreen(enclosure.position);
    const x = (screen.x / MAP_WIDTH * 100).toFixed(3);
    const y = (screen.y / MAP_HEIGHT * 100).toFixed(3);
    const icon = enclosure.iconUrl
      ? `<img src="${escapeHtml(enclosure.iconUrl)}" alt="" style="width: 16px; height: 16px; object-fit: contain; background: white; border: 1px solid #0f172a; border-radius: 3px;" />`
      : `<span style="display: block; width: 12px; height: 12px; background: ${safeColor(enclosure.color, '#3b82f6')}; border: 2px solid white; border-radius: 50%; box-shadow: 0 0 0 1px #0f172a;"></span>`;
    const width = 174, height = 29;
    const candidates = [[12, -height - 12], [12, 12], [-width - 12, -height - 12], [-width - 12, 12]];
    const boxes = candidates.map(([dx, dy]) => ({
      x: Math.max(6, Math.min(MAP_WIDTH - width - 6, screen.x + dx)),
      y: Math.max(6, Math.min(MAP_HEIGHT - height - 6, screen.y + dy)), width, height
    }));
    const fallbackBoxes = Array.from({ length: 12 }, (_, row) =>
      Array.from({ length: 5 }, (_, col) => ({ x: 8 + col * 196, y: 8 + row * 44, width, height }))).flat();
    const box = [...boxes, ...fallbackBoxes].find(candidate => !overlaps(candidate)) || boxes[0];
    occupied.push(box);
    const endX = Math.max(box.x, Math.min(box.x + width, screen.x));
    const endY = Math.max(box.y, Math.min(box.y + height, screen.y));
    endpointLines.push(`<line x1="${screen.x.toFixed(1)}" y1="${screen.y.toFixed(1)}" x2="${endX.toFixed(1)}" y2="${endY.toFixed(1)}" stroke="#334155" stroke-width="1.5" />`);
    return `<div style="position:absolute; left:${x}%; top:${y}%; transform:translate(-50%,-50%); z-index:6;">${icon}</div><div style="position:absolute; left:${(box.x / MAP_WIDTH * 100).toFixed(3)}%; top:${(box.y / MAP_HEIGHT * 100).toFixed(3)}%; width:${(width / MAP_WIDTH * 100).toFixed(3)}%; box-sizing:border-box; padding:3px 5px; background:rgba(255,255,255,.96); border:1px solid #94a3b8; border-radius:4px; color:#0f172a; font-size:9px; font-weight:700; line-height:1.2; overflow-wrap:anywhere; z-index:5;">${escapeHtml(enclosure.label)}</div>`;
  }).join('');

  const routePins = drawableRoutes.map((route, index) => {
    const candidates = [0.5, 0.35, 0.65, 0.2, 0.8].map(fraction =>
      toScreen(route.points[Math.round((route.points.length - 1) * fraction)]));
    const point = candidates.find(candidate => candidate.x > 16 && candidate.x < MAP_WIDTH - 16 &&
      candidate.y > 16 && candidate.y < MAP_HEIGHT - 16 &&
      !overlaps({ x: candidate.x - 13, y: candidate.y - 13, width: 26, height: 26 }));
    if (!point) return '';
    occupied.push({ x: point.x - 13, y: point.y - 13, width: 26, height: 26 });
    return `<div style="position:absolute; left:${(point.x / MAP_WIDTH * 100).toFixed(3)}%; top:${(point.y / MAP_HEIGHT * 100).toFixed(3)}%; transform:translate(-50%,-50%); width:23px; height:23px; border:2px solid white; border-radius:50%; background:${safeColor(route.color, '#0284c7')}; color:#0f172a; font-size:12px; font-weight:900; line-height:19px; text-align:center; box-shadow:0 0 0 1px #334155; z-index:4;">${index + 1}</div>`;
  }).join('');

  const legend = drawableRoutes.map((route, index) =>
    `<div style="display:flex; align-items:flex-start; gap:6px; padding:3px 0; border-top:1px solid #e2e8f0;"><span style="flex:none; width:20px; text-align:center; color:#0f172a; font-weight:800; border-bottom:4px solid ${safeColor(route.color, '#0284c7')};">${index + 1}</span><span style="min-width:0;"><strong style="display:block; font-size:9px; line-height:1.2; overflow-wrap:anywhere;">${escapeHtml(route.name)}</strong><span style="display:block; color:#475569;">${escapeHtml(route.distanceKm)} km · ${escapeHtml(route.fiberType)}</span></span></div>`
  ).join('');

  return `<section class="pdf-map pdf-keep-together" style="margin-top: 14px; break-inside: avoid; page-break-inside: avoid;">
    <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 6px; font-size: 11px; color: #334155;">
      <strong style="font-size: 13px; color: #0369a1;">แผนที่เส้นทางโครงการ (Project Map)</strong>
      <span>${drawableRoutes.length} เส้นทาง · ${visibleEnclosures.length} จุด Enclosure ต้นทาง/ปลายทาง</span>
    </div>
    <div style="position: relative; width: 100%; height: ${MAP_HEIGHT}px; overflow: hidden; border: 1px solid #94a3b8; border-radius: 8px; background: repeating-linear-gradient(0deg, #e9f1eb, #e9f1eb 31px, #dae6dc 32px), repeating-linear-gradient(90deg, transparent, transparent 31px, #dae6dc 32px);">
      ${tiles.join('')}
      <svg viewBox="0 0 ${MAP_WIDTH} ${MAP_HEIGHT}" preserveAspectRatio="none" aria-hidden="true" style="position: absolute; inset: 0; width: 100%; height: 100%; z-index: 1;">${routeLines}${endpointLines.join('')}</svg>
      ${markers}
      ${routePins}
      ${legend ? `<div style="position: absolute; right: 8px; top: 8px; z-index: 7; width: 280px; box-sizing: border-box; padding: 7px 9px; background: rgba(255,255,255,.97); border: 1px solid #94a3b8; border-radius: 6px; color: #334155; font-size: 9px; font-weight: 600;"><strong style="display:block; margin-bottom:4px; color:#0f172a;">Legend · เส้นทาง Fiber</strong>${legend}</div>` : ''}
    </div>
  </section>`;
}

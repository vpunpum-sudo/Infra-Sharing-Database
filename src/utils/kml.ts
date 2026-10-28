import { CoreOwner, EnclosureType, FiberColorConfig, FiberEnclosure, FiberLoop, FiberType, Point, Project, Route } from '../types';
import { formatNumberRanges } from './approvalAllocation';
import { getConnectedEnclosureRoutes } from './enclosureRoutes';
import { getRouteColor } from './routeColor';
import { getRouteEnclosureSpans, getTubePriority } from './routeSegments';

/** An icon the KMZ must contain, rasterised by the caller. */
export type KmlIcon =
  | { href: string; kind: 'image'; src: string; size: number }
  | { href: string; kind: 'circle'; color: string; size: number }
  | { href: string; kind: 'loop'; color: string; size: number };

export type KmlInput = {
  project: Pick<Project, 'name' | 'routeCode'>;
  routes: Route[];
  enclosures: FiberEnclosure[];
  loops: FiberLoop[];
  enclosureTypes: EnclosureType[];
  fiberTypes: FiberType[];
  fiberColorConfigs: FiberColorConfig[];
};

// Same sizes as the map markers (enclosure 20px, circle radius 7, loop 18px).
// Google Earth draws an icon at 32px times its scale.
const ENCLOSURE_PX = 20;
const CIRCLE_PX = 14;
const LOOP_PX = 18;
const DEFAULT_LOOP_COLOR = '#475569';

const OWNER_COLORS: Record<string, string> = { ITEL: '#f59e0b', SYMC: '#ec4899', UIH: '#0ea5e9', None: '#94a3b8' };
const PORT_COLORS: Record<number, string> = { 1: '#2563eb', 2: '#059669', 3: '#d97706', 4: '#0891b2', 5: '#e11d48', 6: '#7c3aed' };

const escapeXml = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');
const html = escapeXml;

const validPoint = (point?: Point) => !!point && Number.isFinite(point.lat) && Number.isFinite(point.lng);
const coordinate = (point: Point) => `${point.lng},${point.lat},0`;
const hexColor = (value: string | undefined, fallback: string) =>
  value && /^#[0-9a-fA-F]{6}$/.test(value) ? value.toLowerCase() : fallback;
/** KML colours are aabbggrr. */
const kmlColor = (hex: string, alpha = 'ff') => `${alpha}${hex.slice(5, 7)}${hex.slice(3, 5)}${hex.slice(1, 3)}`;
const tubeRanges = (ids: number[]) => formatNumberRanges(ids).split(', ')
  .map(range => range.includes('-') ? `T${range.replace('-', '-T')}` : `T${range}`).join(', ');
const tubeOf = (coreId: number) => Math.floor((coreId - 1) / 12) + 1;

// Description HTML: inline styles only, since Google Earth balloons have no stylesheet.
const box = 'border:1px solid #e2e8f0;border-radius:10px;background:#f1f5f9;padding:8px 10px;margin-top:8px';
const label = (text: string) => `<div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:#64748b">${html(text)}</div>`;
const chip = (text: string, color: string) =>
  `<span style="display:inline-block;padding:1px 8px;border-radius:6px;border:1px solid ${color}66;background:${color}22;color:${color};font-weight:800;font-size:11px">${html(text)}</span>`;
const card = (body: string) =>
  `<div style="font-family:Arial,'IBM Plex Sans Thai',sans-serif;font-size:12px;color:#1e293b;width:360px">${body}</div>`;
const header = (kind: string, name: string, badge: string, sub?: string) =>
  `<div style="border-bottom:1px solid #e2e8f0;padding-bottom:6px">${label(kind)}
    <table style="width:100%;border-collapse:collapse"><tr>
      <td style="font-size:14px;font-weight:700;color:#0f172a">${html(name)}</td>
      <td style="text-align:right;white-space:nowrap">${badge}</td>
    </tr></table>${sub ? `<div style="font-size:11px;color:#64748b">${html(sub)}</div>` : ''}</div>`;
const twoCols = (a: [string, string], b: [string, string]) =>
  `<table style="width:100%;border-collapse:collapse;${box}"><tr>
    <td style="width:50%;vertical-align:top">${label(a[0])}<div style="font-weight:700">${a[1]}</div></td>
    <td style="vertical-align:top">${label(b[0])}<div style="font-weight:700">${b[1]}</div></td>
  </tr></table>`;

function routeDescription(route: Route, color: string, enclosures: FiberEnclosure[]) {
  const length = route.totalLength !== undefined
    ? `${route.totalLength.toLocaleString()} m`
    : route.markEnd !== undefined && route.markStart !== undefined
      ? `${Math.abs(route.markEnd - route.markStart).toLocaleString()} m` : '-';
  const ml = route.markStart !== undefined || route.markEnd !== undefined
    ? `${route.markStart?.toLocaleString() ?? '-'} → ${route.markEnd?.toLocaleString() ?? '-'}` : '-';

  const cores = route.cores || [];
  const total = route.capacity || cores.length || 1;
  const listed = route.owners?.length ? route.owners : route.tierSharingPartners?.length ? route.tierSharingPartners : [];
  const owners = Array.from(new Set([...listed, ...cores.map(core => core.owner)])).filter(owner => owner && owner !== 'None') as CoreOwner[];
  const breakdowns = owners.map(owner => {
    const ownerCores = cores.filter(core => core.owner === owner);
    const priority = Array.from(new Set(ownerCores.map(core => tubeOf(core.id))
      .filter(tube => getTubePriority(route, null, tube) === 'High'))).sort((a, b) => a - b);
    return { owner, count: ownerCores.length, percent: ownerCores.length / total * 100,
      cores: formatNumberRanges(ownerCores.map(core => core.id)), tubes: tubeRanges(ownerCores.map(core => tubeOf(core.id))), priority };
  }).filter(item => item.count > 0);
  const priorityTubes = new Set(cores.map(core => tubeOf(core.id)).filter(tube => getTubePriority(route, null, tube) === 'High')).size;
  const bar = breakdowns.map(item =>
    `<td style="width:${item.percent.toFixed(2)}%;background:${OWNER_COLORS[item.owner] || OWNER_COLORS.None};height:8px"></td>`).join('');
  const rows = breakdowns.map(item => `<tr style="border-bottom:1px solid #f1f5f9">
      <td style="padding:3px 0"><span style="color:${OWNER_COLORS[item.owner]};font-weight:800">● ${html(item.owner)}</span>
        ${item.tubes !== 'T-' ? `<span style="font-family:monospace;font-size:11px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:4px;padding:0 4px">${html(item.tubes)}</span>` : ''}
        ${item.cores !== '-' ? `<span style="font-family:monospace;font-size:11px;color:#64748b">(Core ${html(item.cores)})</span>` : ''}</td>
      <td style="text-align:right;font-family:monospace;font-size:11px;color:#64748b;white-space:nowrap">${item.count}C (${item.percent.toFixed(0)}%)
        ${item.priority.length ? `<span style="color:#e11d48;font-weight:700">★ Priority: ${html(tubeRanges(item.priority))}</span>` : '<i>Normal</i>'}</td>
    </tr>`).join('');
  const spans = getRouteEnclosureSpans(route, enclosures);

  return card(`${header('Fiber Optic', route.name, chip(`${route.capacity}F`, '#2563eb'),
      [route.tierSharing || route.tier, route.fiberType].filter(Boolean).join(' • '))}
    <div style="margin-top:8px"><span style="display:inline-block;width:24px;height:4px;border-radius:2px;background:${color};vertical-align:middle"></span>
      <span style="font-size:11px;color:#64748b">สีเส้นบนแผนที่ ${color}</span></div>
    ${twoCols(['Length', `<span style="color:#2563eb">${html(length)}</span>`], ['ML (หัว - ท้าย)', `<span style="font-family:monospace">${html(ml)}</span>`])}
    <div style="margin-top:8px">${label('Owner Share & Tube Priority')}
      <div style="font-size:11px;color:${priorityTubes ? '#e11d48' : '#64748b'};font-weight:700">${priorityTubes ? `★ ${priorityTubes} Priority ${priorityTubes === 1 ? 'Tube' : 'Tubes'}` : 'Standard Priority'}</div>
      ${breakdowns.length ? `<table style="width:100%;border-collapse:collapse;background:#e2e8f0;border-radius:4px;margin-top:4px"><tr>${bar}<td></td></tr></table>
      <table style="width:100%;border-collapse:collapse;margin-top:4px;font-size:12px">${rows}</table>` : '<div style="color:#94a3b8">ยังไม่ได้จัดสรร Core</div>'}
    </div>
    ${spans.length ? `<div style="${box}">${label('ช่วงระหว่าง Enclosure')}${spans.map(span =>
      `<div>${html(span.from.name)} → ${html(span.to.name)}</div>`).join('')}</div>` : ''}`);
}

function enclosureDescription(enclosure: FiberEnclosure, enclosureTypes: EnclosureType[], routes: Route[]) {
  // Same type lookup as the map popup.
  const type = enclosureTypes.find(item => item.id === enclosure.enclosureTypeId) || enclosureTypes[0];
  const typeColor = hexColor(type?.color, '#ef4444');
  const totalTrays = type?.spliceTrays || 4;
  const trays = enclosure.trayAssignments || {};
  const trayCells = Array.from({ length: totalTrays }, (_, index) => {
    const owner = trays[index + 1] || 'None';
    const color = OWNER_COLORS[owner] || OWNER_COLORS.None;
    return `<td style="border:1px solid ${color}55;background:${color}1f;border-radius:6px;text-align:center;padding:2px 4px;font-size:10px">
      <div style="color:#64748b">T${index + 1}</div><div style="color:${color};font-weight:800">${owner === 'None' ? '-' : html(owner)}</div></td>`;
  });
  // All trays share one row, matching the map popup.
  const trayRow = `<tr>${trayCells.join('')}</tr>`;
  const summary = (['ITEL', 'SYMC', 'UIH', 'None'] as CoreOwner[]).map(owner => {
    const ids = Array.from({ length: totalTrays }, (_, index) => index + 1).filter(id => (trays[id] || 'None') === owner);
    return ids.length ? `<span style="margin-right:8px;font-family:monospace;font-size:11px"><b style="color:${OWNER_COLORS[owner]}">● ${owner}:</b> ${html(tubeRanges(ids))} (${ids.length}T)</span>` : '';
  }).join('');

  const connected = getConnectedEnclosureRoutes(enclosure, routes);
  const ports = enclosure.portAssignments || {};
  const remote = (route: Route) => {
    const parts = route.name.split(' - ');
    if (parts.length !== 2) return route.name;
    return parts[0].includes(enclosure.name) || (enclosure.name && parts[0].includes(enclosure.name.split(' ')[0]))
      ? parts[1].trim() : parts[0].trim();
  };
  const cables = [1, 2, 3, 4, 5, 6].flatMap(port => {
    const route = connected.find(item => item.id === ports[port]?.routeId);
    return route ? [{ port, route }] : [];
  });
  const ownerPorts = [1, 2, 3, 4, 5, 6].flatMap(port => {
    const owner = ports[port]?.owner;
    return !connected.some(item => item.id === ports[port]?.routeId) && owner && owner !== 'None' ? [`P${port} → ${owner}`] : [];
  });

  return card(`${header('Enclosure', enclosure.name, chip(type?.name || 'Enclosure', typeColor), enclosure.locationName)}
    ${twoCols(['Location Type', html(enclosure.locationType || 'Manhole / Pole')],
      ['Coordinates (พิกัด)', `<span style="font-family:monospace">${enclosure.position.lat.toFixed(6)}, ${enclosure.position.lng.toFixed(6)}</span>`])}
    <div style="${box}">${label(`Owner Splice Trays (${totalTrays} Trays)`)}
      <table style="border-collapse:separate;border-spacing:3px;margin-top:2px">${trayRow}</table>
      <div style="margin-top:4px;white-space:nowrap">${summary}</div></div>
    <div style="border:1px solid #1e293b;border-radius:10px;background:#0f172a;color:#f1f5f9;padding:8px 10px;margin-top:8px">
      <div style="font-size:10px;font-weight:800;text-transform:uppercase;color:#94a3b8">Physical Hardware Layout · <span style="color:#38bdf8">${cables.length} Cables Connected</span></div>
      ${cables.length ? `<div style="font-size:10px;font-weight:800;text-transform:uppercase;color:#64748b;margin-top:6px">Connected Cables by Port</div>
      <table style="width:100%;border-collapse:separate;border-spacing:0 3px">${cables.map(({ port, route }) => `<tr>
        <td style="width:30px"><span style="font-family:monospace;font-weight:800;font-size:11px;color:${PORT_COLORS[port]};border:1px solid ${PORT_COLORS[port]}88;border-radius:4px;padding:0 4px">P${port}</span></td>
        <td><div style="font-weight:700">${html(route.name)}</div><div style="font-size:11px;color:#38bdf8">To: ${html(remote(route))}</div></td>
        <td style="text-align:right;font-family:monospace;font-weight:800;color:#38bdf8">${route.capacity}F</td></tr>`).join('')}</table>`
        : '<div style="font-size:11px;color:#64748b;margin-top:4px">ยังไม่ได้กำหนดสายเข้า Port</div>'}
      ${ownerPorts.length ? `<div style="font-size:11px;color:#cbd5e1;margin-top:4px">${html(ownerPorts.join(', '))}</div>` : ''}
    </div>`);
}

function loopDescription(loop: FiberLoop, route: Route | undefined, color: string) {
  return card(`${header('Fiber Loop', loop.name, chip('LOOP', '#475569'))}
    ${twoCols(['Loop Length', `<span style="color:#2563eb">${(loop.length || 0).toLocaleString()} m</span>`],
      ['Position', `<span style="font-family:monospace">${loop.position.lat.toFixed(6)}, ${loop.position.lng.toFixed(6)}</span>`])}
    <div style="border:1px solid #e2e8f0;border-radius:8px;padding:8px 10px;margin-top:8px">${label('Connected Fiber Optic')}
      ${route ? `<span style="display:inline-block;width:20px;height:4px;border-radius:2px;background:${color};vertical-align:middle"></span>
        <b>${html(route.name)}</b><div style="font-size:11px;color:#64748b">${html([route.tierSharing || route.tier, route.fiberType, `${route.capacity}F`].filter(Boolean).join(' • '))}</div>`
        : '<span style="color:#64748b">ไม่พบเส้น Fiber ที่เชื่อมต่อ</span>'}</div>`);
}

function placemark(name: string, style: string, description: string, geometry: string) {
  return `      <Placemark>
        <name>${escapeXml(name)}</name>
        <styleUrl>#${style}</styleUrl>
        <description><![CDATA[${description.replace(/]]>/g, ']]]]><![CDATA[>')}]]></description>
        ${geometry}
      </Placemark>`;
}

function folder(name: string, placemarks: string[]) {
  return placemarks.length ? `    <Folder>
      <name>${escapeXml(name)}</name>
${placemarks.join('\n')}
    </Folder>` : '';
}

const balloon = '<BalloonStyle><text>$[description]</text></BalloonStyle>';
const iconStyle = (href: string, px: number) =>
  `<IconStyle><scale>${(px / 32).toFixed(3)}</scale><Icon><href>${escapeXml(href)}</href></Icon><hotSpot x="0.5" y="0.5" xunits="fraction" yunits="fraction"/></IconStyle><LabelStyle><scale>0</scale></LabelStyle>`;

/**
 * A KML document drawn like the map: routes in their fiber-type colour,
 * enclosures with their type icon (or coloured dot), loops with the loop icon
 * in their route's colour, and each map popup's details as the description.
 * `icons` lists the image files the KMZ has to include.
 */
export function buildProjectKml(input: KmlInput): { kml: string; icons: KmlIcon[] } {
  const { project, routes, enclosures, loops, enclosureTypes, fiberTypes, fiberColorConfigs } = input;
  const styles = new Map<string, string>();
  const icons = new Map<string, KmlIcon>();
  const colorOf = (route: Route) => hexColor(getRouteColor(route, fiberTypes, fiberColorConfigs), '#10b981');

  const routeMarks = routes
    .map(route => ({ route, path: (route.path || []).filter(validPoint) }))
    .filter(({ path }) => path.length >= 2)
    .map(({ route, path }) => {
      const color = colorOf(route);
      const id = `route-${color.slice(1)}`;
      // The map draws routes 4px wide at 80% opacity.
      styles.set(id, `<Style id="${id}"><LineStyle><color>${kmlColor(color, 'cc')}</color><width>4</width></LineStyle>${balloon}</Style>`);
      return placemark(route.name || 'Fiber Optic', id, routeDescription(route, color, enclosures),
        `<LineString><tessellate>1</tessellate><coordinates>${path.map(coordinate).join(' ')}</coordinates></LineString>`);
    });

  const enclosureMarks = enclosures.filter(enclosure => validPoint(enclosure.position)).map(enclosure => {
    // Same type lookup as the map marker.
    const type = enclosure.enclosureTypeId
      ? enclosureTypes.find(item => item.id === enclosure.enclosureTypeId)
      : enclosureTypes.find(item => item.name === enclosure.locationType);
    let id: string;
    if (type?.icon) {
      id = `enclosure-${type.id.replace(/[^\w-]/g, '')}`;
      const href = `files/${id}.png`;
      icons.set(href, { href, kind: 'image', src: type.icon, size: ENCLOSURE_PX * 2 });
      styles.set(id, `<Style id="${id}">${iconStyle(href, ENCLOSURE_PX)}${balloon}</Style>`);
    } else {
      const color = hexColor(type?.color, '#ef4444');
      id = `enclosure-dot-${color.slice(1)}`;
      const href = `files/${id}.png`;
      icons.set(href, { href, kind: 'circle', color, size: CIRCLE_PX * 2 });
      styles.set(id, `<Style id="${id}">${iconStyle(href, CIRCLE_PX)}${balloon}</Style>`);
    }
    return placemark(enclosure.name || 'Enclosure', id, enclosureDescription(enclosure, enclosureTypes, routes),
      `<Point><coordinates>${coordinate(enclosure.position)}</coordinates></Point>`);
  });

  const loopMarks = loops.filter(loop => validPoint(loop.position)).map(loop => {
    const route = routes.find(item => item.id === loop.routeId);
    const color = route ? colorOf(route) : DEFAULT_LOOP_COLOR;
    const id = `loop-${color.slice(1)}`;
    const href = `files/${id}.png`;
    icons.set(href, { href, kind: 'loop', color, size: LOOP_PX * 2 });
    styles.set(id, `<Style id="${id}">${iconStyle(href, LOOP_PX)}${balloon}</Style>`);
    return placemark(loop.name || 'Fiber Loop', id, loopDescription(loop, route, color),
      `<Point><coordinates>${coordinate(loop.position)}</coordinates></Point>`);
  });

  const title = project.routeCode ? `${project.name} (${project.routeCode})` : project.name;
  const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${escapeXml(title)}</name>
    ${[...styles.values()].join('\n    ')}
${[folder('Fiber Optic', routeMarks), folder('Enclosures', enclosureMarks), folder('Fiber Loops', loopMarks)].filter(Boolean).join('\n')}
  </Document>
</kml>
`;
  return { kml, icons: [...icons.values()] };
}

/** A file name that is safe on Windows and macOS. */
export function exportFileName(project: Pick<Project, 'name' | 'routeCode'>, extension: string) {
  const base = [project.routeCode, project.name].filter(Boolean).join(' ')
    .replace(/[\\/:*?"<>|\x00-\x1f]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 120);
  return `${base || 'project'}.${extension}`;
}

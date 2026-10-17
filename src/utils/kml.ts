import { FiberEnclosure, FiberLoop, Point, Project, Route } from '../types';

const escapeXml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

const validPoint = (point?: Point) =>
  !!point && Number.isFinite(point.lat) && Number.isFinite(point.lng);

// KML wants longitude first.
const coordinate = (point: Point) => `${point.lng},${point.lat},0`;

function placemark(name: string, style: string, description: string, geometry: string) {
  return `      <Placemark>
        <name>${escapeXml(name)}</name>
        <styleUrl>#${style}</styleUrl>
        <description>${escapeXml(description)}</description>
        ${geometry}
      </Placemark>`;
}

function folder(name: string, placemarks: string[]) {
  if (!placemarks.length) return '';
  return `    <Folder>
      <name>${escapeXml(name)}</name>
${placemarks.join('\n')}
    </Folder>`;
}

/** A KML document with the project's routes as lines and its enclosures and loops as points. */
export function buildProjectKml({ project, routes, enclosures, loops }: {
  project: Pick<Project, 'name' | 'routeCode'>;
  routes: Route[];
  enclosures: FiberEnclosure[];
  loops: FiberLoop[];
}) {
  const routeNames = new Map(routes.map(route => [route.id, route.name]));
  const routeMarks = routes
    .map(route => ({ route, path: (route.path || []).filter(validPoint) }))
    .filter(({ path }) => path.length >= 2)
    .map(({ route, path }) => placemark(route.name || 'Route', 'route',
      `${route.capacity || route.cores?.length || 0} Core`,
      `<LineString><tessellate>1</tessellate><coordinates>${path.map(coordinate).join(' ')}</coordinates></LineString>`));
  const enclosureMarks = enclosures
    .filter(enclosure => validPoint(enclosure.position))
    .map(enclosure => placemark(enclosure.name || 'Enclosure', 'enclosure',
      [enclosure.locationType, enclosure.locationName].filter(Boolean).join(' · '),
      `<Point><coordinates>${coordinate(enclosure.position)}</coordinates></Point>`));
  const loopMarks = loops
    .filter(loop => validPoint(loop.position))
    .map(loop => placemark(loop.name || 'Fiber Loop', 'loop',
      [`${loop.length || 0} m`, routeNames.get(loop.routeId)].filter(Boolean).join(' · '),
      `<Point><coordinates>${coordinate(loop.position)}</coordinates></Point>`));

  const title = project.routeCode ? `${project.name} (${project.routeCode})` : project.name;
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${escapeXml(title)}</name>
    <Style id="route"><LineStyle><color>ffe9a50e</color><width>4</width></LineStyle></Style>
    <Style id="enclosure"><IconStyle><color>ff3f3fe1</color><Icon><href>http://maps.google.com/mapfiles/kml/paddle/red-circle.png</href></Icon></IconStyle></Style>
    <Style id="loop"><IconStyle><color>ff0b9ef5</color><Icon><href>http://maps.google.com/mapfiles/kml/paddle/ylw-circle.png</href></Icon></IconStyle></Style>
${[folder('Routes', routeMarks), folder('Enclosures', enclosureMarks), folder('Fiber Loops', loopMarks)].filter(Boolean).join('\n')}
  </Document>
</kml>
`;
}

/** A file name that is safe on Windows and macOS. */
export function kmlFileName(project: Pick<Project, 'name' | 'routeCode'>) {
  const base = [project.routeCode, project.name].filter(Boolean).join(' ')
    .replace(/[\\/:*?"<>|\x00-\x1f]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 120);
  return `${base || 'project'}.kml`;
}

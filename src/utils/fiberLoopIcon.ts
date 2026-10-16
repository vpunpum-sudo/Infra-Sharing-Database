import L from 'leaflet';

const DEFAULT_LOOP_COLOR = '#475569';

/** Match the route color while keeping SVG markup safe for Leaflet's HTML icon. */
export const createFiberLoopSvg = (routeColor?: string) => {
  const color = routeColor && /^#[0-9a-fA-F]{3,8}$/.test(routeColor)
    ? routeColor
    : DEFAULT_LOOP_COLOR;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="100%" height="100%" aria-hidden="true">
    <circle cx="14" cy="14" r="12.5" fill="white" stroke="white" stroke-width="2"/>
    <circle cx="14" cy="14" r="11" fill="none" stroke="${color}" stroke-width="2.2"/>
    <circle cx="14" cy="14" r="7.5" fill="none" stroke="${color}" stroke-width="2.2"/>
    <circle cx="14" cy="14" r="4" fill="none" stroke="${color}" stroke-width="2.2"/>
    <circle cx="14" cy="14" r="1.3" fill="${color}"/>
  </svg>`;
};

export const fiberLoopSvg = createFiberLoopSvg();

export const createFiberLoopIcon = (routeColor?: string, size = 18) => L.divIcon({
  className: 'fiber-loop-map-icon',
  html: createFiberLoopSvg(routeColor),
  iconSize: [size, size],
  iconAnchor: [size / 2, size / 2],
  popupAnchor: [0, -size / 2]
});

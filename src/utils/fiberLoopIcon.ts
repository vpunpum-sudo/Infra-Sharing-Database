import L from 'leaflet';

/** A cable coil with two visible ends, distinct from Enclosure markers. */
export const fiberLoopSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true">
  <rect x="1" y="1" width="22" height="22" rx="6" fill="#fff7ed" stroke="#c2410c" stroke-width="1.5"/>
  <path d="M5 8.5h2.2m9.6 7H19M8 8.5a5 5 0 1 1 0 7m0-7a3 3 0 1 0 0 7" fill="none" stroke="#c2410c" stroke-width="1.7" stroke-linecap="round"/>
  <circle cx="7.2" cy="8.5" r="1" fill="#c2410c"/><circle cx="16.8" cy="15.5" r="1" fill="#c2410c"/>
</svg>`;

export const createFiberLoopIcon = (size = 20) => L.divIcon({
  className: 'fiber-loop-map-icon',
  html: fiberLoopSvg,
  iconSize: [size, size],
  iconAnchor: [size / 2, size / 2],
  popupAnchor: [0, -size / 2]
});

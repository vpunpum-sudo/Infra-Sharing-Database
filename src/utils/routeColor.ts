import { FiberColorConfig, FiberType, Route } from '../types';

/** Colour of a Fiber route on the map: its fiber type and sharing tier's configured colour. */
export function getRouteColor(route: Route, fiberTypes: FiberType[], fiberColorConfigs: FiberColorConfig[]) {
  const fiberType = route.fiberType || route.capacity.toString();
  const tier = route.tierSharing || route.tier || 'Tier 1';
  const ft = fiberTypes.find(f => f.name === fiberType);
  if (ft) {
    const config = fiberColorConfigs.find(c => c.fiberTypeId === ft.id && c.tier === tier);
    if (config) return config.color;
    return ft.color || '#10b981';
  }
  return '#10b981';
}

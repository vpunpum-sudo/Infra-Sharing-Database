export const WI_FIGURES = [
  { id: 'login', screen: '/login', needs: 'any', clip: 'element', markCount: 4 },
  { id: 'dashboard', screen: '/', needs: 'any', clip: 'viewport', markCount: 6 },
  { id: 'card-actions', screen: '/', needs: 'data:card-actions', clip: 'element', markCount: 6 },
  { id: 'project-form', screen: '/', needs: 'permission:createProjects', clip: 'element', markCount: 4 },
  { id: 'profile', screen: '/profile', needs: 'any', clip: 'composite', markCount: 5 },
  { id: 'map', screen: '/project/:id', needs: 'any', clip: 'viewport', markCount: 6 },
  { id: 'enclosure-form', screen: '/project/:id', needs: 'permission:editMap', clip: 'element', markCount: 6 },
  { id: 'route-draw', screen: '/project/:id', needs: 'permission:editMap', clip: 'composite', markCount: 6 },
  { id: 'context-menu', screen: '/project/:id', needs: 'any', clip: 'viewport', markCount: 4 },
  { id: 'core-manager', screen: '/project/:id', needs: 'data:core-manager', clip: 'element', markCount: 6 },
  { id: 'splice', screen: '/project/:id', needs: 'data:splice', clip: 'element', markCount: 6 },
  { id: 'files', screen: '/', needs: 'data:files', clip: 'element', markCount: 6 },
  { id: 'schedule', screen: '/', needs: 'data:schedule', clip: 'element', markCount: 6 },
  { id: 'approval-request', screen: '/', needs: 'data:approval-request', clip: 'element', markCount: 5 },
  { id: 'approval-sign', screen: '/', needs: 'data:approval-sign', clip: 'element', markCount: 6 },
  { id: 'users', screen: '/user-management', needs: 'permission:viewUsers', clip: 'viewport', markCount: 6 },
  { id: 'permissions', screen: '/permission-management', needs: 'admin', clip: 'viewport', markCount: 4 },
  { id: 'settings', screen: '/settings', needs: 'permission:viewSettings', clip: 'viewport', markCount: 5 },
  { id: 'logs', screen: '/logs', needs: 'admin', clip: 'viewport', markCount: 4 }
] as const;

export type FigureId = (typeof WI_FIGURES)[number]['id'];
export type Figure = (typeof WI_FIGURES)[number];
export const WI_FIGURE_IDS: FigureId[] = WI_FIGURES.map(item => item.id);
export function figureImagePath(id: FigureId): string {
  return `/wi/${id === 'map' ? 'map-overview' : id === 'context-menu' ? 'route-context-menu' : id}.png`;
}
export function parseOnlyArg(arg?: string): Figure[] {
  if (arg === undefined) return [...WI_FIGURES];
  const valid = `Valid ids: ${WI_FIGURE_IDS.join(', ')}`;
  if (!arg.startsWith('--only=')) throw new Error(`Expected --only=<id,id>. ${valid}`);
  const ids = arg.slice('--only='.length).split(',');
  if (ids.some(id => !id || !WI_FIGURE_IDS.includes(id as FigureId)) || new Set(ids).size !== ids.length) {
    throw new Error(`Invalid --only list. ${valid}`);
  }
  return WI_FIGURES.filter(item => ids.includes(item.id));
}

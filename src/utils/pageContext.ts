export type PrimaryNavId = 'projects' | 'settings' | 'users' | 'permissions' | 'logs' | 'profile' | 'manual';

export interface Breadcrumb {
  readonly label: string;
  readonly path?: string;
  readonly current?: boolean;
}

export interface PageContext {
  readonly navId: PrimaryNavId | null;
  readonly title: string;
  readonly breadcrumbs: readonly Breadcrumb[];
}

export const APP_TITLE = 'Fiber Sharing Database' as const;
export const PROJECT_LOADING_LABEL = 'กำลังโหลดโครงการ…' as const;

const STATIC_PAGES: Record<string, { title: string; navId: PrimaryNavId }> = {
  '/settings': { title: 'ตั้งค่าระบบ', navId: 'settings' },
  '/user-management': { title: 'จัดการผู้ใช้งาน', navId: 'users' },
  '/permission-management': { title: 'กำหนดสิทธิ์ตามบทบาท', navId: 'permissions' },
  '/logs': { title: 'ประวัติการใช้งานระบบ', navId: 'logs' },
  '/profile': { title: 'โปรไฟล์', navId: 'profile' },
  '/manual': { title: 'คู่มือการใช้งาน', navId: 'manual' },
  '/system-summary': { title: 'คู่มือการใช้งาน', navId: 'manual' }
};

function normalizePath(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

export function resolvePageContext(pathname: string, options: { projectName?: string } = {}): PageContext {
  const path = normalizePath(pathname);
  const projectsCrumb = { label: 'โครงการ', path: '/' };
  if (path === '/') {
    return { navId: 'projects', title: 'โครงการ', breadcrumbs: [{ label: 'โครงการ', current: true }] };
  }
  if (/^\/project\/[^/]+$/.test(path)) {
    const title = options.projectName?.trim() || PROJECT_LOADING_LABEL;
    return { navId: 'projects', title, breadcrumbs: [projectsCrumb, { label: title, current: true }] };
  }
  const page = STATIC_PAGES[path];
  if (page) {
    return { navId: page.navId, title: page.title, breadcrumbs: [projectsCrumb, { label: page.title, current: true }] };
  }
  return { navId: null, title: APP_TITLE, breadcrumbs: [] };
}

export function isNavActive(itemPath: string, pathname: string): boolean {
  const item = normalizePath(itemPath);
  const path = normalizePath(pathname);
  return item === path || (item === '/' && path.startsWith('/project/'));
}

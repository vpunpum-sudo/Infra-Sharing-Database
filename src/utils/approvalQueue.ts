import type { CoreOwner, Project, RolePermissions, User } from '../types';
import { getParticipatingOwners } from './approvalSnapshot';

type Permissions = RolePermissions[User['role']];
export type SigningQueueRow = {
  project: Project;
  projectId: string;
  name: string;
  routeCode: string;
  documentNumber: string;
  stage: 'Planning' | 'OM';
  unsignedOwners: CoreOwner[];
  signableOwners: CoreOwner[];
  waitingMs: number | null;
};

export function canSignAsOwner(appUser: User | null, permissions: Permissions | undefined, owner: CoreOwner, level: 'Planning' | 'OM'): boolean {
  if (!appUser) return false;
  if (!(level === 'Planning' ? permissions?.approvePlanning : permissions?.approveOM)) return false;
  if (appUser.role === 'Admin') return true;

  return !(appUser.owner && appUser.owner !== 'None' && appUser.owner !== owner);
}

export function canSeeSigningQueue(permissions: Permissions): boolean {
  return permissions.viewProjects && permissions.viewApprovalDocs && (permissions.approvePlanning || permissions.approveOM);
}

export function formatWaiting(waitingMs: number | null): string {
  if (waitingMs === null || !Number.isFinite(waitingMs)) return 'ไม่ระบุ';
  const hours = Math.floor(Math.max(0, waitingMs) / 3_600_000);
  if (hours < 1) return 'น้อยกว่า 1 ชม.';
  if (hours < 24) return `${hours} ชม.`;
  return `${Math.floor(hours / 24)} วัน`;
}

export function buildSigningQueue(projects: Project[], appUser: User | null, permissions: Permissions, now: number): SigningQueueRow[] {
  const rows: SigningQueueRow[] = [];
  for (const project of projects) {
    const approval = project.designApproval;
    if (!approval || approval.status !== 'Pending Approval' ||
      (project.status !== undefined && project.status !== 'Pending Approval') ||
      approval.approvalStage === 'Completed' || approval.approvalStage === 'Rejected') continue;
    const owners = getParticipatingOwners(project, []);
    const unsignedPlanning = owners.filter(owner => approval.planningSignOffs?.[owner]?.status !== 'Approved');
    const stage = unsignedPlanning.length ? 'Planning' : 'OM';
    const unsignedOwners = stage === 'Planning' ? unsignedPlanning : owners.filter(owner => approval.omSignOffs?.[owner]?.status !== 'Approved');
    const signableOwners = unsignedOwners.filter(owner => canSignAsOwner(appUser, permissions, owner, stage));
    if (!signableOwners.length) continue;
    // Resubmission creates a new approval: requestedAt measures the latest request.
    const requestedAt = Date.parse(approval.requestedAt);
    const waitingMs = Number.isFinite(requestedAt) ? Math.max(0, now - requestedAt) : null;
    rows.push({ project, projectId: project.id, name: project.name, routeCode: project.routeCode || '',
      documentNumber: approval.documentNumber || '', stage, unsignedOwners, signableOwners, waitingMs });
  }
  return rows.sort((a, b) => {
    if (a.waitingMs === null && b.waitingMs !== null) return 1;
    if (b.waitingMs === null && a.waitingMs !== null) return -1;
    return (b.waitingMs ?? 0) - (a.waitingMs ?? 0) || a.name.localeCompare(b.name);
  });
}

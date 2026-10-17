import { Project } from '../types';

const sanitize = (value: string) =>
  value.toUpperCase().replace(/[^A-Z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

// The project key is the route code when it has usable characters, otherwise
// the first 6 characters of the project id, so Thai-only names stay distinct.
export function approvalProjectKey(project: Pick<Project, 'id' | 'routeCode'>): string {
  const routeKey = sanitize(project.routeCode || '').slice(0, 16).replace(/-$/, '');
  if (routeKey) return routeKey;
  return sanitize(project.id).replace(/-/g, '').slice(0, 6) || 'PROJ';
}

// APP-<YYYYMM>-<project key>, with -R2, -R3, ... when the project is resubmitted
// in the same month, so every approval request gets its own number.
export function buildApprovalDocumentNumber(
  project: Pick<Project, 'id' | 'routeCode' | 'designApproval'>,
  now: Date = new Date()
): string {
  const month = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const base = `APP-${month}-${approvalProjectKey(project)}`;
  const previous = project.designApproval?.documentNumber || '';
  if (previous !== base && !previous.startsWith(`${base}-R`)) return base;
  const previousRevision = Number(previous.slice(base.length + 2)) || 1;
  return `${base}-R${previousRevision + 1}`;
}

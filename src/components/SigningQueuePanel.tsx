import React, { useEffect, useMemo, useState } from 'react';
import type { Project, RolePermissions, User } from '../types';
import { buildSigningQueue, canSeeSigningQueue, formatWaiting } from '../utils/approvalQueue';

export type SigningQueuePanelProps = {
  projects: Project[];
  appUser: User | null;
  permissions: RolePermissions[User['role']];
  onOpenApproval: (project: Project) => void;
};

function useNow(intervalMs: number) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

export function SigningQueuePanel({ projects, appUser, permissions, onOpenApproval }: SigningQueuePanelProps) {
  const now = useNow(60_000);
  const rows = useMemo(() => buildSigningQueue(projects, appUser, permissions, now), [projects, appUser, permissions, now]);
  if (!canSeeSigningQueue(permissions)) return null;
  return (
    <section data-wi-pii="other-project-card" className="mb-6 rounded-2xl border border-slate-700/80 bg-slate-900/90 text-slate-100">
      <div className="px-5 py-4">
        <h3 className="text-lg font-bold font-display">รอฉันลงนาม <span className="text-slate-300 text-sm font-medium">({rows.length} โครงการ)</span></h3>
        <p className="mt-1 text-sm text-slate-300">เลือกโครงการเพื่อเปิดเอกสารอนุมัติ</p>
      </div>
      {rows.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-slate-300">ไม่มีโครงการที่รอคุณลงนาม</p>
      ) : (
        <ul className="divide-y divide-slate-700/80">
          {rows.map(row => (
            <li key={row.projectId}>
              <button type="button" aria-label={`เปิดเอกสารอนุมัติ ${row.name} ${row.documentNumber}`}
                onClick={() => onOpenApproval(row.project)}
                className="w-full px-5 py-4 text-left hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-sky-400 transition-colors">
                <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:justify-between">
                  <div className="min-w-0 break-words [overflow-wrap:anywhere]">
                    <div className="font-semibold">{row.name}</div>
                    <div className="mt-1 text-sm text-slate-300">{row.routeCode && <span>{row.routeCode} · </span>}{row.documentNumber}</div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      <span className="text-slate-300">ยังไม่ลงนาม:</span>
                      {row.unsignedOwners.map(owner => (
                        <span key={owner} className={row.signableOwners.includes(owner) ? 'font-semibold text-white' : 'text-slate-300'}>
                          {owner}{row.signableOwners.includes(owner) && ' (คุณลงนามได้)'}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-3 text-xs sm:flex-col sm:items-end">
                    <span className={`rounded-md px-2 py-1 font-bold ${row.stage === 'Planning' ? 'bg-amber-500/15 text-amber-300' : 'bg-sky-500/15 text-sky-300'}`}>{row.stage === 'Planning' ? 'Planning' : 'O&M'}</span>
                    <span className="text-slate-300">รอ {formatWaiting(row.waitingMs)}</span>
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

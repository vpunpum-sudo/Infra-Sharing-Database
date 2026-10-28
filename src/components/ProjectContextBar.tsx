import React from 'react';
import { CheckCircle2, Clock } from 'lucide-react';
import type { Project } from '../types';

export function ProjectStatusBadge({ project }: { project: Project }) {
  const status = project.status || project.designApproval?.status || 'Draft';
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-black uppercase tracking-wider border flex items-center gap-1 ${
      status === 'Approved'
        ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
        : status === 'Pending Approval'
        ? 'bg-amber-500/15 border-amber-500/30 text-amber-400'
        : status === 'Rejected'
        ? 'bg-rose-500/15 border-rose-500/30 text-rose-400'
        : 'bg-slate-800 border-slate-700 text-slate-400'
    }`}>
      {status === 'Approved' ? <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" /> : status === 'Pending Approval' ? <Clock className="w-2.5 h-2.5 text-amber-400 animate-pulse" /> : null}
      {status === 'Approved' ? 'ผ่านการอนุมัติ' : status === 'Pending Approval' ? 'รออนุมัติ' : status === 'Rejected' ? 'ไม่อนุมัติ' : 'แบบร่าง'}
    </span>
  );
}

export function ProjectContextBar({ project, compact = false, actions }: {
  project: Project | null;
  compact?: boolean;
  actions?: React.ReactNode;
}) {
  if (!project) {
    return (
      <div role="status" aria-busy="true" aria-label="กำลังโหลดโครงการ…" className={`ux-skeleton ${compact ? 'h-8 w-40' : 'h-14 w-full'}`} />
    );
  }
  if (compact) {
    return (
      <div data-wi-pii="project-context-chip" className="inline-flex max-w-[16rem] items-center gap-2 rounded-full border border-slate-700 bg-slate-900/90 px-3 py-1.5 shadow-lg backdrop-blur">
        <span className="truncate text-xs font-bold text-slate-100">{project.name}</span>
        <ProjectStatusBadge project={project} />
      </div>
    );
  }
  const owners = project.owners?.join(', ') || project.owner || 'Participating Owners';
  return (
    <div className="bg-slate-950/70 p-2.5 rounded-xl border border-slate-800/80 flex items-center justify-between gap-2 shadow-inner">
      <div className="min-w-0">
        <p className="text-xs font-bold text-slate-200 truncate">{project.name}</p>
        {project.routeCode && <p className="text-xs text-brand-400 font-mono truncate">{project.routeCode}</p>}
        <p className="text-xs text-slate-500 font-mono truncate">{owners}</p>
      </div>
      {actions}
    </div>
  );
}

import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { History } from 'lucide-react';
import type { Project } from '../types';
import { summarizeCurrentApproval } from '../utils/approvalHistory';
import { createHistoryController, type HistoryController, type HistoryReader } from '../utils/approvalHistoryController';
import { createApprovalHistoryReader } from '../services/approvalHistoryService';
import { ApprovalHistoryPanel } from './ApprovalHistoryPanel';
type Session = { key: string; controller: HistoryController };
const noopSubscribe = () => () => {};
const closed = () => false;
const formatTime = (iso: string) => new Date(iso).toLocaleString('th-TH');
export function ApprovalHistoryEntry({ project, uid, readerFactory = createApprovalHistoryReader }: { project: Project; uid?: string; readerFactory?: () => HistoryReader }) {
  const key = JSON.stringify([project.id, uid]);
  const current = useMemo(() => summarizeCurrentApproval(project), [project]);
  const ref = useRef<Session | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const active = session?.key === key ? session.controller : null;
  const open = useSyncExternalStore(active?.subscribe || noopSubscribe, active ? () => active.getState().open : closed, closed);
  useEffect(() => {
    // No session is created by the effect. Strict-mode cleanup leaves the next click
    // to create a new, usable session instead of retaining a disposed controller.
    return () => { const old = ref.current; if (old?.key === key) { old.controller.dispose(); ref.current = null; } };
  }, [key]);
  function show() {
    if (ref.current?.key !== key) { ref.current?.controller.dispose(); ref.current = null; }
    if (!ref.current) ref.current = { key, controller: createHistoryController({ reader: readerFactory(), projectId: project.id, uid }) };
    setSession(ref.current);
    void ref.current.controller.open(current);
  }
  return <>
    <button type="button" onClick={show} className="px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 bg-slate-800 text-slate-300 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300"><History size={13} /><span>ประวัติคำขอ</span></button>
    {open && active && <ApprovalHistoryPanel controller={active} formatTime={formatTime} />}
  </>;
}

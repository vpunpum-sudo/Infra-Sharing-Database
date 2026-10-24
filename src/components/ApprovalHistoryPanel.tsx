import React, { useEffect, useRef, useSyncExternalStore } from 'react';
import type { HistoryController } from '../utils/approvalHistoryController';
import type { TimeFormatter } from '../utils/approvalHistory';
import { ApprovalHistoryView } from './ApprovalHistoryView';
export function ApprovalHistoryPanel({ controller, formatTime }: { controller: HistoryController; formatTime?: TimeFormatter }) {
  const state = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    container.current?.querySelector('button')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); controller.close(); }
      if (event.key === 'Tab') {
        const nodes = Array.from(container.current?.querySelectorAll<HTMLElement>('button:not(:disabled),select:not(:disabled),summary') || []);
        const visible = nodes.filter(n => n.getClientRects().length > 0);
        const first = visible[0], last = visible.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => { document.removeEventListener('keydown', onKey, true); previous?.focus(); };
  }, [controller]);
  return <div ref={container}><ApprovalHistoryView state={state} controller={controller} formatTime={formatTime} /></div>;
}

import React from 'react';
import { AlertCircle, Inbox, RefreshCw } from 'lucide-react';

export function SkeletonList({ rows = 3, label = 'กำลังโหลด…' }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-busy="true" aria-label={label} className="grid gap-3">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="ux-skeleton h-24 w-full" aria-hidden="true" />
      ))}
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function EmptyState({ title, description, action, icon }: {
  title: string; description?: string; action?: React.ReactNode; icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center text-center gap-3 py-12 px-4 border border-dashed border-slate-700 rounded-2xl">
      <div className="text-slate-500" aria-hidden="true">{icon ?? <Inbox size={36} />}</div>
      <p className="font-bold text-slate-200">{title}</p>
      {description && <p className="text-sm text-slate-500 max-w-sm">{description}</p>}
      {action}
    </div>
  );
}

export function InlineError({ message, onRetry, retryLabel = 'ลองใหม่' }: { message: string; onRetry?: () => void; retryLabel?: string }) {
  return (
    <div role="alert" className="ux-state-error rounded-xl px-3 py-2 text-sm flex items-start gap-2">
      <AlertCircle size={16} className="shrink-0 mt-0.5" aria-hidden="true" />
      <span className="flex-1 break-words">{message}</span>
      {onRetry && <button type="button" onClick={onRetry} className="font-bold underline shrink-0">{retryLabel}</button>}
    </div>
  );
}

export function StaleBanner({ message, onRefresh }: { message: string; onRefresh?: () => void }) {
  return (
    <div role="status" className="ux-state-warn rounded-xl px-3 py-2 text-sm flex items-center gap-2">
      <RefreshCw size={14} className="shrink-0" aria-hidden="true" />
      <span className="flex-1">{message}</span>
      {onRefresh && <button type="button" onClick={onRefresh} className="font-bold underline shrink-0">โหลดใหม่</button>}
    </div>
  );
}

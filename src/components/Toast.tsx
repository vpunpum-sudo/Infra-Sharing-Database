import React, { createContext, useCallback, useContext, useEffect, useReducer, useState } from 'react';
import { CheckCircle, XCircle, Info, AlertTriangle, X } from 'lucide-react';
import {
  EMPTY_QUEUE,
  NotificationKind,
  NotificationQueueState,
  QueuedNotification,
  dismissNotification,
  enqueueNotification,
  visibleNotifications
} from '../utils/notificationQueue';

export type ToastType = NotificationKind;

interface ToastProps {
  isOpen: boolean;
  message: string;
  type?: ToastType;
  onClose: () => void;
  duration?: number;
}

const ICONS: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle className="w-6 h-6 text-emerald-400" />,
  error: <XCircle className="w-6 h-6 text-rose-400" />,
  info: <Info className="w-6 h-6 text-blue-400" />,
  warning: <AlertTriangle className="w-6 h-6 text-amber-400" />
};

const SURFACES: Record<ToastType, string> = {
  success: 'bg-slate-900/90 border-emerald-500/20 text-slate-100 shadow-emerald-500/10',
  error: 'bg-slate-900/90 border-rose-500/20 text-slate-100 shadow-rose-500/10',
  info: 'bg-slate-900/90 border-blue-500/20 text-slate-100 shadow-blue-500/10',
  warning: 'bg-slate-900/90 border-amber-500/20 text-slate-100 shadow-amber-500/10'
};

const PROGRESS: Record<ToastType, string> = {
  success: 'bg-emerald-500',
  error: 'bg-rose-500',
  info: 'bg-blue-500',
  warning: 'bg-amber-500'
};

function ToastItem({ id, message, kind, durationMs, onClose, paused }: {
  id: string; message: string; kind: ToastType; durationMs: number; onClose: (id: string) => void; paused: boolean;
}) {
  useEffect(() => {
    if (paused) return;
    const timer = setTimeout(() => onClose(id), durationMs);
    return () => clearTimeout(timer);
  }, [id, durationMs, onClose, paused]);

  return (
    <div
      role={kind === 'error' ? 'alert' : 'status'}
      className={`ux-toast flex items-center gap-4 px-5 py-3 rounded-2xl shadow-2xl backdrop-blur-xl border ${SURFACES[kind]} sm:min-w-[320px] max-w-md relative overflow-hidden`}
    >
      <div className="absolute bottom-0 left-0 h-1 bg-slate-800 w-full" />
      <div
        className={`ux-toast-progress absolute bottom-0 left-0 h-1 w-full ${PROGRESS[kind]}`}
        style={{ animationDuration: `${durationMs}ms`, animationPlayState: paused ? 'paused' : 'running' }}
      />
      <div className="shrink-0">{ICONS[kind]}</div>
      <p className="font-semibold text-sm flex-1 break-words">{message}</p>
      <button
        type="button"
        aria-label="ปิดการแจ้งเตือน"
        onClick={() => onClose(id)}
        className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-slate-700 rounded-xl transition-all text-slate-500 hover:text-slate-100"
      >
        <X className="w-5 h-5" />
      </button>
    </div>
  );
}

function ToastStack({ items, onClose }: { items: readonly QueuedNotification[]; onClose: (id: string) => void }) {
  const [paused, setPaused] = useState(false);
  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="fixed inset-x-4 bottom-4 z-[9999] flex flex-col gap-3 pointer-events-none sm:inset-x-auto sm:bottom-8 sm:right-8"
    >
      {items.map(item => (
        <div key={item.id} className="pointer-events-auto">
          <ToastItem id={item.id} message={item.message} kind={item.kind} durationMs={item.durationMs} onClose={onClose} paused={paused} />
        </div>
      ))}
    </div>
  );
}

// Single-notification display kept for callers that manage their own open state.
export const Toast: React.FC<ToastProps> = ({ isOpen, message, type = 'success', onClose, duration = 3000 }) => (
  <div aria-live="polite" aria-atomic="false" className="fixed inset-x-4 bottom-4 z-[9999] flex flex-col gap-3 sm:inset-x-auto sm:bottom-8 sm:right-8">
    {isOpen && <ToastItem id="single" message={message} kind={type} durationMs={duration} onClose={() => onClose()} paused={false} />}
  </div>
);

type Notify = (message: string, type?: ToastType) => void;
const ToastContext = createContext<Notify>(() => {});

type QueueAction =
  | { type: 'enqueue'; message: string; kind: ToastType; id: string }
  | { type: 'dismiss'; id: string };

function queueReducer(state: NotificationQueueState, action: QueueAction): NotificationQueueState {
  return action.type === 'enqueue'
    ? enqueueNotification(state, { message: action.message, kind: action.kind }, action.id)
    : dismissNotification(state, action.id);
}

let notificationCounter = 0;

// App-wide toast: call useToast()('บันทึกแล้ว') from any screen.
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(queueReducer, EMPTY_QUEUE);
  const notify = useCallback<Notify>((message, type = 'success') => {
    notificationCounter += 1;
    dispatch({ type: 'enqueue', message, kind: type, id: `n${notificationCounter}` });
  }, []);
  const close = useCallback((id: string) => dispatch({ type: 'dismiss', id }), []);
  return (
    <ToastContext.Provider value={notify}>
      {children}
      <ToastStack items={visibleNotifications(state)} onClose={close} />
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

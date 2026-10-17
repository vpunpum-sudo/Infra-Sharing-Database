import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  confirmText = 'ลบ',
  cancelText = 'ยกเลิก',
  danger = true
}) => {
  const confirmButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!isOpen) return;
    confirmButton.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); onCancel(); } };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [isOpen, onCancel]);
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-message">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={onCancel}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative bg-slate-900 rounded-[1.5rem] shadow-2xl w-full max-w-sm p-6 overflow-hidden border border-slate-700"
          >
            {/* Decorative background */}
            <div className="absolute top-0 right-0 w-20 h-20 bg-rose-500/10 rounded-full blur-3xl pointer-events-none"></div>

            <div className="flex flex-col items-center text-center gap-3.5 relative z-10">
              <div className={`p-3 rounded-2xl border ${danger ? 'bg-rose-500/10 text-rose-500 border-rose-500/20' : 'bg-amber-500/10 text-amber-500 border-amber-500/20'}`}>
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h2 id="confirm-title" className="text-lg font-bold text-slate-100 mb-1.5">{title}</h2>
                <p id="confirm-message" className="text-sm text-slate-400 leading-relaxed whitespace-pre-line">{message}</p>
              </div>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-2.5 mt-6 relative z-10">
              <button
                type="button"
                onClick={onCancel}
                className="flex-1 px-4 py-2.5 text-slate-300 font-semibold text-sm border border-slate-700 hover:text-slate-100 hover:bg-slate-800 rounded-xl transition-all order-2 sm:order-1"
              >
                {cancelText}
              </button>
              <button
                ref={confirmButton}
                type="button"
                onClick={onConfirm}
                className={`flex-1 px-4 py-2.5 text-white font-bold text-sm rounded-xl transition-all order-1 sm:order-2 ${danger ? 'bg-rose-600 hover:bg-rose-500' : 'bg-brand-600 hover:bg-brand-500'}`}
              >
                {confirmText}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

type ConfirmOptions = { title: string; message: string; confirmText?: string; cancelText?: string; danger?: boolean };
const ConfirmContext = createContext<(options: ConfirmOptions) => Promise<boolean>>(async () => false);

// Promise-based replacement for window.confirm:
//   if (!(await confirm({ title: 'ลบไฟล์?', message: '...' }))) return;
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null);
  const confirm = useCallback((options: ConfirmOptions) => new Promise<boolean>(resolve => setPending({ ...options, resolve })), []);
  const settle = useCallback((ok: boolean) => setPending(current => { current?.resolve(ok); return null; }), []);
  const cancel = useCallback(() => settle(false), [settle]);
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <ConfirmModal isOpen={!!pending} title={pending?.title || ''} message={pending?.message || ''}
        confirmText={pending?.confirmText} cancelText={pending?.cancelText} danger={pending?.danger}
        onConfirm={() => settle(true)} onCancel={cancel} />
    </ConfirmContext.Provider>
  );
}

export const useConfirm = () => useContext(ConfirmContext);

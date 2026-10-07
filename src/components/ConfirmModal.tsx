import React from 'react';
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
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  confirmText = 'Delete',
  cancelText = 'Cancel'
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center">
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
            className="relative bg-slate-900 rounded-[1.5rem] shadow-2xl w-full max-w-[320px] p-5 overflow-hidden border border-slate-700"
          >
            {/* Decorative background */}
            <div className="absolute top-0 right-0 w-20 h-20 bg-rose-500/10 rounded-full blur-3xl pointer-events-none"></div>

            <div className="flex flex-col items-center text-center gap-3.5 relative z-10">
              <div className="p-3 bg-rose-500/10 text-rose-500 rounded-2xl border border-rose-500/20 shadow-2xl shadow-rose-500/10">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-lg font-black text-slate-100 tracking-tight mb-1.5">{title}</h2>
                <p className="text-xs text-slate-400 font-medium leading-relaxed">{message}</p>
              </div>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-2.5 mt-6 relative z-10">
              <button
                onClick={onCancel}
                className="flex-1 px-4 py-2.5 text-slate-500 font-black uppercase tracking-widest text-[9px] hover:text-slate-100 hover:bg-slate-800 rounded-xl transition-all order-2 sm:order-1"
              >
                {cancelText}
              </button>
              <button
                onClick={onConfirm}
                className="flex-1 px-4 py-2.5 bg-rose-600 text-slate-100 font-black uppercase tracking-widest text-[9px] rounded-xl hover:bg-rose-500 transition-all shadow-2xl shadow-rose-500/20 order-1 sm:order-2"
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

import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle, XCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

interface ToastProps {
  isOpen: boolean;
  message: string;
  type?: ToastType;
  onClose: () => void;
  duration?: number;
}

export const Toast: React.FC<ToastProps> = ({
  isOpen,
  message,
  type = 'success',
  onClose,
  duration = 3000
}) => {
  useEffect(() => {
    if (isOpen && duration > 0) {
      const timer = setTimeout(() => {
        onClose();
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [isOpen, duration, onClose]);

  const icons = {
    success: <CheckCircle className="w-6 h-6 text-emerald-400" />,
    error: <XCircle className="w-6 h-6 text-rose-400" />,
    info: <Info className="w-6 h-6 text-blue-400" />
  };

  const backgrounds = {
    success: 'bg-slate-900/90 border-emerald-500/20 text-slate-100 shadow-emerald-500/10',
    error: 'bg-slate-900/90 border-rose-500/20 text-slate-100 shadow-rose-500/10',
    info: 'bg-slate-900/90 border-blue-500/20 text-slate-100 shadow-blue-500/10'
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed bottom-8 right-8 z-[9999] flex flex-col gap-3">
          <motion.div
            initial={{ opacity: 0, x: 50, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 50, scale: 0.9 }}
            className={`flex items-center gap-5 px-6 py-5 rounded-[1.5rem] shadow-2xl backdrop-blur-xl border ${backgrounds[type]} min-w-[320px] max-w-md relative overflow-hidden group`}
          >
            {/* Progress bar background */}
            <div className="absolute bottom-0 left-0 h-1 bg-slate-800 w-full"></div>
            <motion.div 
              initial={{ width: '100%' }}
              animate={{ width: '0%' }}
              transition={{ duration: duration / 1000, ease: 'linear' }}
              className={`absolute bottom-0 left-0 h-1 ${type === 'success' ? 'bg-emerald-500' : type === 'error' ? 'bg-rose-500' : 'bg-blue-500'}`}
            ></motion.div>

            <div className="shrink-0">{icons[type]}</div>
            <p className="font-black text-sm tracking-tight flex-1">{message}</p>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-700 rounded-xl transition-all text-slate-500 hover:text-slate-100"
            >
              <X className="w-5 h-5" />
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

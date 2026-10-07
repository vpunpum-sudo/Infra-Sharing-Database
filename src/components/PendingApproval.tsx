import React from 'react';
import { motion } from 'motion/react';
import { Clock, LogOut, ShieldAlert } from 'lucide-react';
import { logout } from '../firebase';

interface PendingApprovalProps {
  email: string;
}

export const PendingApproval: React.FC<PendingApprovalProps> = ({ email }) => {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full bg-slate-900 rounded-3xl shadow-xl border border-slate-800 p-6 text-center"
      >
        <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center mx-auto mb-5">
          <Clock size={32} />
        </div>
        
        <h1 className="text-xl font-black text-slate-100 mb-1.5 tracking-tight">Account Pending Approval</h1>
        <p className="text-xs text-slate-500 font-medium mb-5">
          Your account <span className="text-slate-100 font-bold">({email})</span> has been registered but requires administrator approval before you can access the system.
        </p>
        
        <div className="bg-slate-800/50 p-3.5 rounded-2xl border border-slate-800 mb-6 text-left">
          <div className="flex items-start gap-2.5">
            <ShieldAlert className="text-amber-500 w-4 h-4 mt-0.5 shrink-0" />
            <div>
              <p className="text-[10px] font-bold text-slate-100 uppercase tracking-wider mb-1">Next Steps</p>
              <p className="text-[10px] text-slate-500 leading-relaxed">
                An administrator will review your request, assign your role, and set your organizational owner. You will be able to log in once your account is approved.
              </p>
            </div>
          </div>
        </div>
        
        <div className="space-y-2.5">
          <button 
            onClick={() => window.location.reload()}
            className="w-full bg-brand-600 text-slate-100 py-2.5 rounded-xl font-bold hover:bg-brand-700 shadow-lg shadow-brand-500/20 transition-all active:scale-95 text-xs"
          >
            Check Status
          </button>
          
          <button 
            onClick={() => logout()}
            className="w-full bg-slate-900 text-slate-300 py-2.5 rounded-xl font-bold border border-slate-800 hover:bg-slate-800 transition-all flex items-center justify-center gap-2 text-xs"
          >
            <LogOut size={16} /> Sign Out
          </button>
        </div>
        
        <p className="mt-6 text-[8px] text-slate-400 font-bold uppercase tracking-widest">
          Network Infrastructure Management System
        </p>
      </motion.div>
    </div>
  );
};

import React from 'react';
import { PermissionManager } from './PermissionManager';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { User as AppUser } from '../types';

export const PermissionManagement: React.FC<{ appUser: AppUser | null }> = ({ appUser }) => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-8 relative overflow-hidden">
      {/* Decorative background elements */}
      <div className="absolute top-[-5%] right-[-5%] w-[40%] h-[40%] bg-brand-600/10 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-5%] left-[-5%] w-[40%] h-[40%] bg-brand-500/5 rounded-full blur-[120px] pointer-events-none"></div>

      <button 
        onClick={() => navigate('/user-management')} 
        className="mb-8 flex items-center gap-3 text-slate-400 hover:text-slate-100 font-black uppercase tracking-widest text-xs transition-all group relative z-10"
      >
        <div className="w-8 h-8 bg-slate-900 rounded-xl flex items-center justify-center border border-slate-800 group-hover:border-brand-500/50 transition-all">
          <ArrowLeft size={16} />
        </div>
        Back to User Management
      </button>
      
      <div className="max-w-6xl mx-auto relative z-10">
        <PermissionManager />
      </div>
    </div>
  );
};

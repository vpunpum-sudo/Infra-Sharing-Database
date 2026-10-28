import React, { useEffect, useState } from 'react';
import type { User as FirebaseUser } from 'firebase/auth';
import type { User as AppUser } from '../types';
import { Layers, Users, Activity, Shield, Image as ImageIcon, SlidersHorizontal, FileText, User as UserIcon, LogOut, X, Menu } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { logout } from '../firebase';
import { getRolePermissions, useRolePermissions } from '../services/rolePermissionsStore';
import { isNavActive } from '../utils/pageContext';
import { ThemeToggle } from './ThemeToggle';

// Shared by the dashboard and its destination pages so the current item stays visible.
export function DashboardHeader({ user, appUser }: { user: FirebaseUser; appUser: AppUser | null }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  useRolePermissions();
  const userPermissions = getRolePermissions()[appUser?.role || 'Viewer'];
  useEffect(() => { setMenuOpen(false); }, [pathname]);
  const displayName = appUser?.displayName || user.email?.split('@')[0];
  const navItems = [
    ...(userPermissions.viewUsers ? [{ label: 'ผู้ใช้งาน', title: 'จัดการผู้ใช้งาน', path: '/user-management', icon: Users, color: 'text-brand-400' }] : []),
    ...(appUser?.role === 'Admin' ? [
      { label: 'ประวัติการใช้งาน', title: 'ประวัติการใช้งานระบบ', path: '/logs', icon: Activity, color: 'text-amber-400' },
      { label: 'สิทธิ์', title: 'กำหนดสิทธิ์ตามบทบาท', path: '/permission-management', icon: Shield, color: 'text-emerald-400' }
    ] : []),
    ...(userPermissions.viewSettings ? [
      { label: 'โลโก้ Owner', title: 'จัดการรูปภาพโลโก้ของแต่ละ Owner', path: '/settings', icon: ImageIcon, color: 'text-pink-400' },
      { label: 'ตั้งค่า', title: 'ตั้งค่าระบบ', path: '/settings', icon: SlidersHorizontal, color: 'text-sky-400' }
    ] : []),
    { label: 'WI การใช้งาน', title: 'วิธีปฏิบัติงาน (Work Instruction) การใช้งานระบบทั้งหมด', path: '/manual', icon: FileText, color: 'text-brand-400', primary: true }
  ];
  const currentNavIndex = navItems.findIndex(item => isNavActive(item.path, pathname) && item.path !== '/');

  return (
    <header className="sticky top-0 z-50 bg-slate-900/80 backdrop-blur-2xl border-b border-slate-800/80 px-4 sm:px-6 py-3 sm:py-4 flex justify-between items-center gap-3 transition-all">
        <div className="flex min-w-0 items-center gap-3">
          <div className="w-9 h-9 sm:w-10 sm:h-10 shrink-0 bg-gradient-to-br from-brand-500 to-brand-700 rounded-xl flex items-center justify-center shadow-lg shadow-brand-500/25 ring-1 ring-white/20">
            <Layers className="text-white w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="truncate text-base sm:text-lg font-extrabold text-white tracking-tight font-display">FIBER SHARING DATABASE</p>
              <span className="hidden sm:inline px-2 py-0.5 text-xs font-bold bg-brand-500/15 text-brand-400 border border-brand-500/30 rounded-full">GIS Suite</span>
            </div>
            <p className="hidden sm:block text-xs text-slate-400 font-medium">ระบบจัดการโครงข่ายใยแก้วนำแสง</p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {/* Desktop: one button per destination */}
          <nav aria-label="เมนูหลัก" className="hidden lg:flex items-center gap-1.5">
            {navItems.map((item, index) => (
              <button key={item.label} type="button" onClick={() => navigate(item.path)} title={item.title} aria-label={item.title}
                aria-current={index === currentNavIndex ? 'page' : undefined}
                className={`ux-selectable ${item.primary
                  ? 'px-3 py-1.5 text-brand-300 hover:text-white bg-brand-500/10 hover:bg-brand-500/20 border border-brand-500/30 rounded-lg transition-all flex items-center gap-1.5 text-xs font-bold shadow-sm'
                  : 'px-2.5 py-1.5 text-slate-300 hover:text-white hover:bg-slate-800/80 rounded-lg transition-all flex items-center gap-1.5 text-xs font-semibold border border-transparent hover:border-slate-700'}`}>
                <item.icon className={`w-3.5 h-3.5 ${item.color}`} />
                {item.label}
              </button>
            ))}
          </nav>

          <ThemeToggle />

          <div className="h-5 w-px bg-slate-800 mx-1 hidden lg:block"></div>

          <button type="button"
            className="hidden lg:flex items-center gap-2.5 bg-slate-800/50 hover:bg-slate-800 border border-slate-700/60 pl-2.5 pr-2 py-1 rounded-xl transition-all group"
            onClick={() => navigate('/profile')}
            title="ตั้งค่าโปรไฟล์" aria-label="ตั้งค่าโปรไฟล์"
          >
            <div className="flex flex-col items-end">
              <span data-wi-pii="account-name" className="text-xs font-bold text-slate-200 group-hover:text-white transition-colors">{displayName}</span>
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <span className="text-xs text-slate-400 font-semibold uppercase">{appUser?.role || 'Viewer'}</span>
              </div>
            </div>
            <div className="w-7 h-7 bg-slate-700 text-slate-300 rounded-lg flex items-center justify-center group-hover:bg-brand-500 group-hover:text-white transition-all overflow-hidden border border-slate-600">
              {appUser?.photoURL ? (
                <img data-wi-pii="account-avatar" src={appUser.photoURL} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <UserIcon size={14} />
              )}
            </div>
          </button>

          <button type="button"
            onClick={logout}
            className="hidden lg:block p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all border border-transparent hover:border-rose-500/20"
            title="ออกจากระบบ" aria-label="ออกจากระบบ"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>

          {/* Phones and tablets: everything moves into one menu */}
          <div className="relative lg:hidden">
            <button type="button" onClick={() => setMenuOpen(open => !open)} aria-expanded={menuOpen} aria-controls="dashboard-menu"
              aria-label="เปิดเมนู" className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg border border-slate-700/60">
              {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            {menuOpen && <>
              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
              <div id="dashboard-menu" role="menu"
                className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
                <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); navigate('/profile'); }}
                  className="flex w-full items-center gap-3 border-b border-slate-800 px-4 py-3 text-left hover:bg-slate-800">
                  <UserIcon className="w-4 h-4 text-slate-300" />
                  <span className="min-w-0">
                    <span data-wi-pii="account-name" className="block truncate text-sm font-bold text-slate-100">{displayName}</span>
                    <span className="block text-xs text-slate-400">{appUser?.role || 'Viewer'}</span>
                  </span>
                </button>
                {navItems.map((item, index) => (
                  <button key={item.label} type="button" role="menuitem" onClick={() => { setMenuOpen(false); navigate(item.path); }}
                    aria-current={index === currentNavIndex ? 'page' : undefined}
                    className="ux-selectable flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-semibold text-slate-200 hover:bg-slate-800">
                    <item.icon className={`w-4 h-4 ${item.color}`} /> {item.label}
                  </button>
                ))}
                <button type="button" role="menuitem" onClick={logout}
                  className="flex w-full items-center gap-3 border-t border-slate-800 px-4 py-3 text-left text-sm font-semibold text-rose-300 hover:bg-rose-500/10">
                  <LogOut className="w-4 h-4" /> ออกจากระบบ
                </button>
              </div>
            </>}
          </div>
        </div>
      </header>
  );
}

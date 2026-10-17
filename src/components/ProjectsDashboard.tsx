import React, { useState, useEffect } from 'react';
import { User as FirebaseUser } from 'firebase/auth';
import { collection, onSnapshot, doc, setDoc, deleteDoc, query, where, getDocs, or } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions, logout, handleFirestoreError, OperationType } from '../firebase';
import { Project, User as AppUser, CoreOwner, ProjectStatus } from '../types';
import { getRolePermissions, useRolePermissions } from '../services/rolePermissionsStore';
import { v4 as uuidv4 } from 'uuid';
import { Layers, Plus, Folder, Trash2, Edit2, LogOut, X, Users, Shield, User as UserIcon, Activity, FileText, Search, ArrowUpRight, Sparkles, SlidersHorizontal, Map, Database, Check, ShieldCheck, Clock, CheckCircle2, AlertTriangle, Image as ImageIcon, Menu } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { logActivity } from '../services/logService';
import { ThemeToggle } from './ThemeToggle';
import { DesignApprovalModal } from './DesignApprovalModal';
import { ProjectFilesModal } from './ProjectFilesModal';

const formatProjectDate = (value?: string) => {
  if (!value) return 'ไม่ระบุ';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'ไม่ระบุ' : date.toLocaleDateString('th-TH', { dateStyle: 'medium' });
};

export default function ProjectsDashboard({ user, appUser, quotaExceeded = false }: { user: FirebaseUser, appUser: AppUser | null, quotaExceeded?: boolean }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [approvalModalProject, setApprovalModalProject] = useState<Project | null>(null);
  const [filesModalProject, setFilesModalProject] = useState<Project | null>(null);
  const [legacyCreatedDates, setLegacyCreatedDates] = useState<Record<string, string>>({});
  const [projectNameInput, setProjectNameInput] = useState('');
  const [projectOwnersInput, setProjectOwnersInput] = useState<CoreOwner[]>(['ITEL']);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [deleteProjectId, setDeleteProjectId] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [oldProjects, setOldProjects] = useState<Project[]>([]);
  const [isMigrating, setIsMigrating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOwnerFilter, setSelectedOwnerFilter] = useState<'All' | CoreOwner>('All');
  const navigate = useNavigate();

  useRolePermissions();
  const userPermissions = appUser ? getRolePermissions()[appUser.role] : getRolePermissions()['Viewer'];
  const [menuOpen, setMenuOpen] = useState(false);
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
    { label: 'คู่มือ (PDF)', title: 'คู่มือการใช้งานระบบ (นำเสนอและ PDF)', path: '/manual', icon: FileText, color: 'text-brand-400', primary: true }
  ];
  const missingCreatedDateIds = projects.filter(project => !project.createdAt).map(project => project.id).sort().join('|');

  useEffect(() => {
    if (!missingCreatedDateIds) return;
    let cancelled = false;
    const getDates = httpsCallable<{ projectIds: string[] }, Record<string, string | null>>(functions, 'getProjectCreatedDates');
    const ids = missingCreatedDateIds.split('|');
    Promise.all(Array.from({ length: Math.ceil(ids.length / 50) }, (_, index) =>
      getDates({ projectIds: ids.slice(index * 50, index * 50 + 50) })
    )).then(results => {
      if (!cancelled) setLegacyCreatedDates(Object.assign({}, ...results.map(result => result.data)));
    }).catch(() => { /* Older projects can still be viewed if the date service is unavailable. */ });
    return () => { cancelled = true; };
  }, [missingCreatedDateIds]);

  useEffect(() => {
    if (!user || !appUser) return;
    const projectsPath = `projects`;
    let q = collection(db, projectsPath) as any;
    
    // Filter projects based on user role and owner
    if (appUser.role !== 'Admin') {
      if (appUser.owner && appUser.owner !== 'None') {
        q = query(
          collection(db, projectsPath), 
          or(
            where('owner', '==', appUser.owner),
            where('owners', 'array-contains', appUser.owner),
            where('uid', '==', user.uid)
          )
        );
      } else {
        q = query(collection(db, projectsPath), where('uid', '==', user.uid));
      }
    }

    const unsubscribeProjects = onSnapshot(q, (snapshot: any) => {
      const newProjects = snapshot.docs.map(doc => doc.data() as Project);
      setProjects(newProjects);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, projectsPath);
    });

    // Check for old projects
    const checkOldProjects = async () => {
      try {
        const oldProjectsPath = `users/${user.uid}/projects`;
        const oldProjectsSnapshot = await getDocs(collection(db, oldProjectsPath));
        if (!oldProjectsSnapshot.empty) {
          setOldProjects(oldProjectsSnapshot.docs.map(doc => doc.data() as Project));
        }
      } catch (error) {
        console.error("Error checking old projects:", error);
      }
    };
    checkOldProjects();

    return () => {
      unsubscribeProjects();
    };
  }, [user, appUser]);

  const handleMigrateProjects = async () => {
    if (!user || oldProjects.length === 0) return;
    setIsMigrating(true);
    try {
      for (const project of oldProjects) {
        const newProjectPath = `projects/${project.id}`;
        await setDoc(doc(db, newProjectPath), {
          ...project,
          owner: project.owner || 'ITEL'
        });

        const oldEnclosuresPath = `users/${user.uid}/projects/${project.id}/enclosures`;
        const newEnclosuresPath = `projects/${project.id}/enclosures`;
        const enclosuresSnapshot = await getDocs(collection(db, oldEnclosuresPath));
        for (const enclosureDoc of enclosuresSnapshot.docs) {
          await setDoc(doc(db, newEnclosuresPath, enclosureDoc.id), enclosureDoc.data());
        }

        const oldRoutesPath = `users/${user.uid}/projects/${project.id}/routes`;
        const newRoutesPath = `projects/${project.id}/routes`;
        const routesSnapshot = await getDocs(collection(db, oldRoutesPath));
        for (const routeDoc of routesSnapshot.docs) {
          await setDoc(doc(db, newRoutesPath, routeDoc.id), routeDoc.data());
        }

        const oldLoopsPath = `users/${user.uid}/projects/${project.id}/loops`;
        const newLoopsPath = `projects/${project.id}/loops`;
        const loopsSnapshot = await getDocs(collection(db, oldLoopsPath));
        for (const loopDoc of loopsSnapshot.docs) {
          await setDoc(doc(db, newLoopsPath, loopDoc.id), loopDoc.data());
        }

        await deleteDoc(doc(db, `users/${user.uid}/projects/${project.id}`));
      }
      setOldProjects([]);
      await logActivity('migrate_projects', `Migrated ${oldProjects.length} old projects to new structure`);
      setSuccessMessage('ย้ายข้อมูลโครงการแล้ว');
    } catch (error) {
      console.error("Error migrating projects:", error);
      setErrorMessage('Failed to migrate projects. See console for details.');
    } finally {
      setIsMigrating(false);
    }
  };

  const handleSaveProject = async () => {
    if (!projectNameInput.trim() || !user) return;
    
    try {
      if (editingProjectId) {
        const path = `projects/${editingProjectId}`;
        await setDoc(doc(db, path), { 
          name: projectNameInput.trim(), 
          owners: projectOwnersInput,
          owner: projectOwnersInput[0] || 'ITEL'
        }, { merge: true });
        await logActivity('edit_project', `Edited project ${projectNameInput.trim()}`, { projectId: editingProjectId, owners: projectOwnersInput });
        setSuccessMessage('บันทึกโครงการแล้ว');
      } else {
        const newProject: Project = { 
          id: uuidv4(), 
          name: projectNameInput.trim(), 
          uid: user.uid, 
          createdAt: new Date().toISOString(),
          owners: projectOwnersInput,
          owner: projectOwnersInput[0] || 'ITEL'
        };
        const path = `projects/${newProject.id}`;
        await setDoc(doc(db, path), newProject);
        await logActivity('create_project', `Created project ${newProject.name}`, { projectId: newProject.id, owners: projectOwnersInput });
        setSuccessMessage('สร้างโครงการแล้ว');
      }
      
      setProjectNameInput('');
      setEditingProjectId(null);
      setProjectModalOpen(false);
      
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (error: any) {
      const path = editingProjectId ? `projects/${editingProjectId}` : `projects`;
      handleFirestoreError(error, editingProjectId ? OperationType.UPDATE : OperationType.CREATE, path);
    }
  };

  const handleDeleteProject = (projectId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteProjectId(projectId);
  };

  const confirmDeleteProject = async () => {
    if (!deleteProjectId || !user) return;
    
    try {
      const projectToDelete = projects.find(p => p.id === deleteProjectId);
      const path = `projects/${deleteProjectId}`;
      await deleteDoc(doc(db, path));
      if (projectToDelete) {
        await logActivity('delete_project', `Deleted project ${projectToDelete.name}`, { projectId: deleteProjectId });
      }
      setDeleteProjectId(null);
      setSuccessMessage('ลบโครงการแล้ว');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (error: any) {
      const path = `projects/${deleteProjectId}`;
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  const openEditModal = (project: Project, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingProjectId(project.id);
    setProjectNameInput(project.name);
    const existingOwners: CoreOwner[] = (project.owners && project.owners.length > 0 
      ? project.owners 
      : (project.owner ? [project.owner] : ['ITEL'])) as CoreOwner[];
    setProjectOwnersInput(existingOwners);
    setProjectModalOpen(true);
  };

  const openCreateModal = () => {
    setEditingProjectId(null);
    setProjectNameInput('');
    if (appUser?.role === 'Design') {
      const defaultOwners: CoreOwner[] = appUser.owner && appUser.owner !== 'None' ? [appUser.owner] : ['ITEL', 'SYMC', 'UIH'];
      setProjectOwnersInput(defaultOwners);
    } else {
      const defaultOwner: CoreOwner = (appUser?.role === 'Viewer') && appUser.owner ? appUser.owner : 'ITEL';
      setProjectOwnersInput([defaultOwner]);
    }
    setProjectModalOpen(true);
  };

  const getOwnerBadgeStyle = (owner: CoreOwner) => {
    switch (owner) {
      case 'ITEL':
        return 'bg-amber-500/15 text-amber-300 border-amber-500/40 shadow-sm shadow-amber-500/10';
      case 'SYMC':
        return 'bg-pink-500/15 text-pink-300 border-pink-500/40 shadow-sm shadow-pink-500/10';
      case 'UIH':
        return 'bg-sky-500/15 text-sky-300 border-sky-500/40 shadow-sm shadow-sky-500/10';
      default:
        return 'bg-slate-800/80 text-slate-300 border-slate-700/80';
    }
  };

  const filteredProjects = projects.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
    const projectOwners = p.owners || (p.owner ? [p.owner] : []);
    const matchesOwner = selectedOwnerFilter === 'All' || projectOwners.includes(selectedOwnerFilter);
    return matchesSearch && matchesOwner;
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans relative overflow-x-hidden transition-colors duration-200">
      {/* Background ambient lighting effects */}
      <div className="fixed top-[-10%] right-[-5%] w-[600px] h-[600px] bg-brand-500/10 rounded-full blur-[140px] pointer-events-none"></div>
      <div className="fixed bottom-[-10%] left-[-5%] w-[600px] h-[600px] bg-sky-500/5 rounded-full blur-[140px] pointer-events-none"></div>
      <div className="fixed top-[40%] left-[30%] w-[400px] h-[400px] bg-emerald-500/5 rounded-full blur-[160px] pointer-events-none"></div>

      {/* Modern Top Header */}
      <header className="sticky top-0 z-50 bg-slate-900/80 backdrop-blur-2xl border-b border-slate-800/80 px-4 sm:px-6 py-3 sm:py-4 flex justify-between items-center gap-3 transition-all">
        <div className="flex min-w-0 items-center gap-3">
          <div className="w-9 h-9 sm:w-10 sm:h-10 shrink-0 bg-gradient-to-br from-brand-500 to-brand-700 rounded-xl flex items-center justify-center shadow-lg shadow-brand-500/25 ring-1 ring-white/20">
            <Layers className="text-white w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-base sm:text-lg font-extrabold text-white tracking-tight font-display">FIBER SHARING DATABASE</h1>
              <span className="hidden sm:inline px-2 py-0.5 text-xs font-bold bg-brand-500/15 text-brand-400 border border-brand-500/30 rounded-full">GIS Suite</span>
            </div>
            <p className="hidden sm:block text-xs text-slate-400 font-medium">ระบบจัดการโครงข่ายใยแก้วนำแสง</p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {/* Desktop: one button per destination */}
          <nav aria-label="เมนูหลัก" className="hidden lg:flex items-center gap-1.5">
            {navItems.map(item => (
              <button key={item.label} type="button" onClick={() => navigate(item.path)} title={item.title} aria-label={item.title}
                className={item.primary
                  ? 'px-3 py-1.5 text-brand-300 hover:text-white bg-brand-500/10 hover:bg-brand-500/20 border border-brand-500/30 rounded-lg transition-all flex items-center gap-1.5 text-xs font-bold shadow-sm'
                  : 'px-2.5 py-1.5 text-slate-300 hover:text-white hover:bg-slate-800/80 rounded-lg transition-all flex items-center gap-1.5 text-xs font-semibold border border-transparent hover:border-slate-700'}>
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
              <span className="text-xs font-bold text-slate-200 group-hover:text-white transition-colors">{displayName}</span>
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <span className="text-xs text-slate-400 font-semibold uppercase">{appUser?.role || 'Viewer'}</span>
              </div>
            </div>
            <div className="w-7 h-7 bg-slate-700 text-slate-300 rounded-lg flex items-center justify-center group-hover:bg-brand-500 group-hover:text-white transition-all overflow-hidden border border-slate-600">
              {appUser?.photoURL ? (
                <img src={appUser.photoURL} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
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
                    <span className="block truncate text-sm font-bold text-slate-100">{displayName}</span>
                    <span className="block text-xs text-slate-400">{appUser?.role || 'Viewer'}</span>
                  </span>
                </button>
                {navItems.map(item => (
                  <button key={item.label} type="button" role="menuitem" onClick={() => { setMenuOpen(false); navigate(item.path); }}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-semibold text-slate-200 hover:bg-slate-800">
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

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8 relative z-10">
        {!appUser ? (
          <div className="card p-12 text-center max-w-xl mx-auto mt-12">
            <div className="w-16 h-16 bg-rose-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-rose-500/20">
              <Shield className="w-8 h-8 text-rose-400" />
            </div>
            <h3 className="text-2xl font-black text-white mb-2 tracking-tight font-display">ยังไม่มีสิทธิ์เข้าใช้งาน</h3>
            <p className="text-slate-400 mb-8 text-sm leading-relaxed">บัญชีนี้ยังไม่ได้รับบทบาท กรุณาติดต่อผู้ดูแลระบบเพื่อขอสิทธิ์เข้าใช้งาน</p>
            <button onClick={logout} className="btn-secondary text-xs">เข้าสู่ระบบด้วยบัญชีอื่น</button>
          </div>
        ) : (
          <>
            {/* Header section with Stats & Actions */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="px-2.5 py-0.5 text-xs font-bold bg-brand-500/15 text-brand-400 border border-brand-500/30 rounded-full flex items-center gap-1.5">
                    <Sparkles size={12} /> Workspaces Overview
                  </span>
                </div>
                <h2 className="text-2xl font-bold text-white tracking-tight font-display">โครงการโครงข่าย</h2>
                <p className="text-slate-300 mt-1 text-sm font-medium">เลือกโครงการเพื่อดูเส้นทาง จุด Splice และการจัดสรร Core</p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {oldProjects.length > 0 && (
                  <button 
                    onClick={handleMigrateProjects}
                    disabled={isMigrating || quotaExceeded}
                    className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-2.5 px-4 rounded-xl transition-all shadow-lg shadow-amber-500/20 flex items-center gap-2 text-xs disabled:opacity-50"
                  >
                    <Database className="w-4 h-4" />
                    {isMigrating ? 'กำลังย้ายข้อมูล...' : `ย้ายข้อมูล ${oldProjects.length} โครงการ`}
                  </button>
                )}
                {(!appUser || getRolePermissions()[appUser.role].createProjects) && (
                  <button 
                    onClick={openCreateModal}
                    disabled={quotaExceeded}
                    className="btn-primary py-2.5 px-5 text-xs font-bold shadow-lg shadow-brand-500/20"
                  >
                    <Plus className="w-4 h-4" />
                    สร้างโครงการ
                  </button>
                )}
              </div>
            </div>

            {/* Filter & Search Bar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-8 bg-slate-900/90 p-3.5 rounded-2xl border border-slate-700/80 backdrop-blur-xl shadow-lg">
              <div className="relative w-full sm:w-84">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                <input 
                  type="text"
                  placeholder="ค้นหาชื่อโครงการ..." aria-label="ค้นหาชื่อโครงการ"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-950/80 border border-slate-700/80 pl-10 pr-4 py-2.5 rounded-xl text-xs text-white placeholder:text-slate-400 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all font-medium"
                />
              </div>

              <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
                <span className="text-xs font-bold text-slate-300 mr-1.5 whitespace-nowrap">กรองตาม Owner:</span>
                {(['All', 'ITEL', 'SYMC', 'UIH'] as const).map((owner) => (
                  <button
                    key={owner}
                    type="button"
                    aria-pressed={selectedOwnerFilter === owner}
                    onClick={() => setSelectedOwnerFilter(owner)}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                      selectedOwnerFilter === owner
                        ? 'bg-brand-600 text-white shadow-md shadow-brand-500/25 ring-1 ring-brand-400'
                        : 'bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 border border-slate-700/60'
                    }`}
                  >
                    {owner === 'All' ? 'ทั้งหมด' : owner}
                  </button>
                ))}
              </div>
            </div>

            {/* Projects Grid */}
            {filteredProjects.length === 0 ? (
              <div className="card p-16 text-center max-w-lg mx-auto">
                <div className="w-16 h-16 bg-slate-800/80 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-slate-700">
                  <Folder className="w-8 h-8 text-slate-400" />
                </div>
                <h3 className="text-xl font-bold text-white mb-1 font-display">
                  {searchQuery ? 'ไม่พบโครงการที่ค้นหา' : 'ยังไม่มีโครงการ'}
                </h3>
                <p className="text-slate-300 mb-6 text-xs max-w-sm mx-auto">
                  {searchQuery 
                    ? 'ลองเปลี่ยนคำค้นหาหรือตัวกรอง Owner' 
                    : 'สร้างโครงการแรกเพื่อวาดเส้นทาง วางจุด Splice และจัดสรร Core'}
                </p>
                {(!appUser || getRolePermissions()[appUser.role].createProjects) && !searchQuery && (
                  <button 
                    onClick={openCreateModal}
                    className="btn-primary text-xs"
                  >
                    <Plus className="w-4 h-4" />
                    สร้างโครงการแรก
                  </button>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-3" aria-label="Project workspaces">
                {filteredProjects.map(project => {
                  const orderMap: Record<string, number> = { 'ITEL': 1, 'SYMC': 2, 'UIH': 3 };
                  const owners = [...(project.owners || (project.owner ? [project.owner] : ['ITEL']))].sort((a, b) => (orderMap[a] || 99) - (orderMap[b] || 99));
                  const fileOwners = project.owners || (project.owner ? [project.owner] : []);
                  const canAccessFiles = !!appUser?.isApproved && (appUser.role === 'Admin' ||
                    !!(appUser.owner && fileOwners.includes(appUser.owner)));
                  return (
                    <motion.div 
                      key={project.id}
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      onClick={() => navigate(`/project/${project.id}`)}
                      className="card p-4 sm:p-5 cursor-pointer group flex flex-col justify-between relative overflow-hidden"
                    >
                      <div className="absolute top-0 right-0 w-32 h-32 bg-brand-500/10 rounded-full -mr-16 -mt-16 opacity-0 group-hover:opacity-100 transition-opacity blur-xl pointer-events-none"></div>

                      <div>
                        {/* Compact project heading */}
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="flex items-start gap-3 min-w-0">
                            <div className="w-9 h-9 shrink-0 bg-brand-500/15 text-brand-400 rounded-lg flex items-center justify-center border border-brand-500/30 shadow-sm group-hover:bg-brand-500 group-hover:text-white transition-all">
                              <Map className="w-4 h-4" />
                            </div>
                            <div className="min-w-0 flex flex-wrap items-center gap-2 pt-1">
                              <h3 className="text-base font-bold text-white tracking-tight group-hover:text-brand-300 transition-colors font-display break-words">
                                {project.name}
                              </h3>
                              {project.uid === user.uid && (
                                <span className="px-2 py-0.5 text-xs font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 rounded-full">
                                  คุณเป็นผู้สร้าง
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 opacity-80 group-hover:opacity-100 transition-opacity">
                            {(!appUser || getRolePermissions()[appUser.role].editProjects) && (
                              <button 
                                onClick={(e) => openEditModal(project, e)}
                                className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-all"
                                title="แก้ไขโครงการ" aria-label="แก้ไขโครงการ"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {(!appUser || getRolePermissions()[appUser.role].deleteProjects || (appUser.role === 'Design' && project.uid === user.uid)) && (
                              <button 
                                onClick={(e) => handleDeleteProject(project.id, e)}
                                className="p-2 text-slate-300 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all"
                                title="ลบโครงการ" aria-label="ลบโครงการ"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-col lg:flex-row lg:items-center lg:gap-4 mb-3">
                        {/* Project Status Banner (2-Level Progress) */}
                        {(() => {
                          const status: ProjectStatus = project.status || project.designApproval?.status || 'Draft';
                          const totalOwners = owners.length;
                          
                          const planningSignOffs = project.designApproval?.planningSignOffs || {};
                          const omSignOffs = project.designApproval?.omSignOffs || {};
                          
                          const planningApprovedCount = owners.filter(o => planningSignOffs[o]?.status === 'Approved').length;
                          const omApprovedCount = owners.filter(o => omSignOffs[o]?.status === 'Approved').length;
                          const isPlanningAllDone = totalOwners > 0 && planningApprovedCount === totalOwners;

                          return (
                            <div className="mb-3 lg:mb-0 lg:flex-[1.15] min-w-0">
                              <div className={`p-2.5 rounded-xl border flex items-center justify-between ${
                                status === 'Approved'
                                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                                  : status === 'Pending Approval'
                                  ? isPlanningAllDone
                                    ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400'
                                    : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                                  : status === 'Rejected'
                                  ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                                  : 'bg-slate-800/60 border-slate-700/60 text-slate-400'
                              }`}>
                                <div className="flex items-center gap-2">
                                  {status === 'Approved' ? (
                                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                  ) : status === 'Pending Approval' ? (
                                    <Clock className="w-4 h-4 text-amber-400 animate-pulse" />
                                  ) : status === 'Rejected' ? (
                                    <AlertTriangle className="w-4 h-4 text-rose-400" />
                                  ) : (
                                    <FileText className="w-4 h-4 text-slate-400" />
                                  )}
                                  <div className="text-left">
                                    <span className="text-xs font-bold block leading-snug">
                                      {status === 'Approved' 
                                        ? 'ผ่านการอนุมัติ (Approved)' 
                                        : status === 'Pending Approval' 
                                        ? isPlanningAllDone 
                                          ? 'รออนุมัติระดับ O&M (Management)' 
                                          : 'รออนุมัติระดับ Planning' 
                                        : status === 'Rejected' 
                                        ? 'ไม่อนุมัติ (Rejected)' 
                                        : 'แบบร่าง (Draft)'}
                                    </span>
                                    {status === 'Pending Approval' && (
                                      <span className="text-xs text-slate-300 font-mono">
                                        Planning: {planningApprovedCount}/{totalOwners} &bull; O&M: {omApprovedCount}/{totalOwners}
                                      </span>
                                    )}
                                  </div>
                                </div>

                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setApprovalModalProject(project);
                                  }}
                                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                                    status === 'Approved'
                                      ? 'bg-emerald-600/20 hover:bg-emerald-600/30 border-emerald-500/40 text-emerald-300'
                                      : status === 'Pending Approval'
                                      ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 border-amber-400 font-black shadow-md'
                                      : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
                                  }`}
                                >
                                  {status === 'Pending Approval' ? 'ลงนาม 2 ระดับ' : 'เอกสารอนุมัติ'}
                                </button>
                              </div>
                            </div>
                          );
                        })()}

                        {/* Owner badges */}
                        <div className="flex flex-wrap items-center gap-2 lg:flex-1 min-w-0">
                          <span className="text-xs font-semibold text-slate-300">
                            Operator ที่มีสิทธิ์ ({owners.length}):
                          </span>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {owners.map(o => (
                              <span 
                                key={o}
                                className={`px-2 py-0.5 text-xs font-bold rounded-md border flex items-center gap-1 ${getOwnerBadgeStyle(o)}`}
                              >
                                {o}
                              </span>
                            ))}
                          </div>
                        </div>
                        </div>
                        <div className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-300">
                          <span>สร้างโครงการ: <strong className="text-slate-100">{formatProjectDate(project.createdAt || legacyCreatedDates[project.id])}</strong></span>
                          <span>อนุมัติขั้นสุดท้าย: <strong className="text-slate-100">{formatProjectDate(project.designApproval?.finalApprovedAt)}</strong></span>
                        </div>
                      </div>

                      {/* Card Footer */}
                      <div className="pt-2 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50 animate-pulse"></span>
                          <span className="text-xs font-semibold text-slate-300">พร้อมใช้งาน</span>
                        </div>
                        <div className="flex items-center gap-3">
                          {canAccessFiles && <button type="button" onClick={event => { event.stopPropagation(); setFilesModalProject(project); }}
                            className="flex items-center gap-1 text-xs font-bold text-sky-300 hover:text-sky-200">
                            <Folder size={14} /> ไฟล์โครงการ
                          </button>}
                          <span className="text-xs font-bold text-brand-400 group-hover:text-brand-300 flex items-center gap-1">
                            เปิดแผนที่ <ArrowUpRight size={14} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                          </span>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>

      {/* Design Approval Modal */}
      {approvalModalProject && (
        <DesignApprovalModal
          isOpen={!!approvalModalProject}
          onClose={() => setApprovalModalProject(null)}
          project={approvalModalProject}
          appUser={appUser}
          onProjectUpdated={(updatedProject) => {
            setProjects(prev => prev.map(p => p.id === updatedProject.id ? updatedProject : p));
            setApprovalModalProject(updatedProject);
          }}
        />
      )}

      {filesModalProject && <ProjectFilesModal project={filesModalProject}
        canManage={!!appUser?.isApproved && (appUser.role === 'Admin' || (appUser.role !== 'Viewer' && !!appUser.owner &&
          (filesModalProject.owners || (filesModalProject.owner ? [filesModalProject.owner] : [])).includes(appUser.owner)))}
        onClose={() => setFilesModalProject(null)} />}

      {/* Project Modal */}
      {projectModalOpen && (
        <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-md z-[2000] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="glass-panel-elevated rounded-2xl w-full max-w-lg overflow-hidden border border-slate-700/80 shadow-2xl"
          >
            <div className="p-6">
              <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-brand-500/10 text-brand-400 rounded-xl flex items-center justify-center border border-brand-500/20">
                    <Folder className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-white font-display">{editingProjectId ? 'แก้ไขโครงการ' : 'สร้างโครงการใหม่'}</h2>
                    <p className="text-xs text-slate-400">ตั้งชื่อโครงการและเลือก Operator ที่มีสิทธิ์</p>
                  </div>
                </div>
                <button type="button" aria-label="ปิด" onClick={() => setProjectModalOpen(false)} className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800">
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-5">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-2">ชื่อโครงการ</label>
                  <input
                    type="text"
                    autoFocus
                    placeholder="เช่น ถนนพระราม 4 ช่วงที่ 1"
                    className="w-full bg-slate-950/80 border border-slate-700 p-3 rounded-xl text-white text-sm focus:border-brand-500 focus:outline-none transition-colors"
                    value={projectNameInput}
                    onChange={e => setProjectNameInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSaveProject()}
                  />
                </div>

                {(appUser?.role === 'Admin' || appUser?.role === 'Design' || appUser?.role === 'Sub-contract') && (
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-bold text-slate-200">
                        Authorized Operators (กำหนดสิทธิ์ Operator ที่เข้าดูข้อมูลได้)
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          if (projectOwnersInput.length === 3) {
                            setProjectOwnersInput(['ITEL']);
                          } else {
                            setProjectOwnersInput(['ITEL', 'SYMC', 'UIH']);
                          }
                        }}
                        className="text-xs text-brand-400 hover:text-brand-300 font-bold transition-colors cursor-pointer"
                      >
                        {projectOwnersInput.length === 3 ? 'เลือกเฉพาะ ITEL' : 'เลือกทั้งหมด (Select All)'}
                      </button>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      ผู้ใช้งานในสังกัด Operator ที่ถูกเลือก จะสามารถมองเห็นและเข้าถึงข้อมูลโครงสร้างสายและอุปกรณ์ในโครงการนี้ได้
                    </p>
                    <div className="grid grid-cols-3 gap-3 pt-1">
                      {(['ITEL', 'SYMC', 'UIH'] as CoreOwner[]).map((owner) => {
                        const isSelected = projectOwnersInput.includes(owner);
                        return (
                          <button
                            type="button"
                            key={owner}
                            onClick={() => {
                              if (isSelected) {
                                if (projectOwnersInput.length > 1) {
                                  setProjectOwnersInput(projectOwnersInput.filter(o => o !== owner));
                                }
                              } else {
                                setProjectOwnersInput([...projectOwnersInput, owner]);
                              }
                            }}
                            className={`p-3 rounded-xl border text-center font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
                              isSelected
                                ? getOwnerBadgeStyle(owner) + ' shadow-md ring-1 ring-brand-500/40'
                                : 'bg-slate-900/60 border-slate-700 text-slate-500 hover:border-slate-600 hover:text-slate-300'
                            }`}
                          >
                            {isSelected && <Check size={14} className="shrink-0" />}
                            <span>{owner}</span>
                          </button>
                        );
                      })}
                    </div>
                    {projectOwnersInput.length === 0 && (
                      <p className="text-xs text-rose-400 mt-1 font-semibold">
                        * ต้องเลือกอย่างน้อย 1 Operator เพื่อให้มีสิทธิ์เข้าถึงโครงการ
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 mt-8 pt-4 border-t border-slate-800">
                <button onClick={() => setProjectModalOpen(false)} className="btn-secondary text-xs">ยกเลิก</button>
                <button 
                  onClick={handleSaveProject} 
                  disabled={quotaExceeded || !projectNameInput.trim() || projectOwnersInput.length === 0}
                  className="btn-primary text-xs"
                >
                  {editingProjectId ? 'บันทึกการแก้ไข' : 'สร้างโครงการ'}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteProjectId && (
        <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-md z-[3000] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass-panel-elevated rounded-2xl w-full max-w-md overflow-hidden border border-slate-700/80 shadow-2xl p-6 text-center"
          >
            <div className="w-14 h-14 bg-rose-500/10 text-rose-400 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-rose-500/20">
              <Trash2 className="w-7 h-7" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2 font-display">ลบโครงการ?</h2>
            <p className="text-xs text-slate-400 mb-6 leading-relaxed">
              เส้นทาง จุด Enclosure และการเชื่อมต่อ Splice ทั้งหมดของโครงการนี้จะถูกลบถาวร และกู้คืนไม่ได้
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteProjectId(null)} className="btn-secondary flex-1 text-xs">ยกเลิก</button>
              <button 
                onClick={confirmDeleteProject} 
                disabled={quotaExceeded}
                className="flex-1 px-5 py-2.5 bg-rose-600 text-white rounded-xl font-bold hover:bg-rose-500 transition-all text-xs shadow-lg shadow-rose-600/20"
              >
                ลบโครงการ
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Toast Notification */}
      <AnimatePresence>
        {successMessage && (
          <motion.div 
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 30 }}
            className="fixed bottom-6 right-6 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-2xl z-[4000] flex items-center gap-2.5 border border-slate-700"
          >
            <div className="w-2 h-2 bg-emerald-400 rounded-full animate-ping" />
            <span className="font-semibold text-xs">{successMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

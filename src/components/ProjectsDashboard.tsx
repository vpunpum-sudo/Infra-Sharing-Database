import React, { useState, useEffect } from 'react';
import { User as FirebaseUser } from 'firebase/auth';
import { collection, onSnapshot, doc, setDoc, deleteDoc, query, where, getDocs, or } from 'firebase/firestore';
import { db, logout, handleFirestoreError, OperationType } from '../firebase';
import { Project, User as AppUser, CoreOwner, ProjectStatus } from '../types';
import { DEFAULT_PERMISSIONS } from '../constants';
import { v4 as uuidv4 } from 'uuid';
import { Layers, Plus, Folder, Trash2, Edit2, LogOut, X, Users, Shield, User as UserIcon, Activity, FileText, Search, ArrowUpRight, Sparkles, SlidersHorizontal, Map, Database, Check, ShieldCheck, Clock, CheckCircle2, AlertTriangle, Image as ImageIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { logActivity } from '../services/logService';
import { ThemeToggle } from './ThemeToggle';
import { DesignApprovalModal } from './DesignApprovalModal';
import { OwnerLogo } from './OwnerLogo';

export default function ProjectsDashboard({ user, appUser, quotaExceeded = false }: { user: FirebaseUser, appUser: AppUser | null, quotaExceeded?: boolean }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [approvalModalProject, setApprovalModalProject] = useState<Project | null>(null);
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

  const userPermissions = appUser ? DEFAULT_PERMISSIONS[appUser.role] : DEFAULT_PERMISSIONS['Viewer'];

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
      setSuccessMessage('Projects migrated successfully!');
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
        setSuccessMessage('Project updated successfully!');
      } else {
        const newProject: Project = { 
          id: uuidv4(), 
          name: projectNameInput.trim(), 
          uid: user.uid, 
          owners: projectOwnersInput,
          owner: projectOwnersInput[0] || 'ITEL'
        };
        const path = `projects/${newProject.id}`;
        await setDoc(doc(db, path), newProject);
        await logActivity('create_project', `Created project ${newProject.name}`, { projectId: newProject.id, owners: projectOwnersInput });
        setSuccessMessage('Project created successfully!');
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
      setSuccessMessage('Project deleted successfully!');
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
      <header className="sticky top-0 z-50 bg-slate-900/80 backdrop-blur-2xl border-b border-slate-800/80 px-6 py-4 flex justify-between items-center transition-all">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 bg-gradient-to-br from-brand-500 to-brand-700 rounded-xl flex items-center justify-center shadow-lg shadow-brand-500/25 ring-1 ring-white/20">
            <Layers className="text-white w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-extrabold text-white tracking-tight font-display">FIBER SHARING DATABASE</h1>
              <span className="px-2 py-0.5 text-[9px] font-bold bg-brand-500/15 text-brand-400 border border-brand-500/30 rounded-full">GIS Suite</span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium">Telecom Optical Infrastructure Manager</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {userPermissions.viewUsers && (
            <button 
              onClick={() => navigate('/user-management')}
              className="px-2.5 py-1.5 text-slate-300 hover:text-white hover:bg-slate-800/80 rounded-lg transition-all flex items-center gap-1.5 text-[11px] font-semibold border border-transparent hover:border-slate-700"
              title="User Management"
            >
              <Users className="w-3.5 h-3.5 text-brand-400" />
              <span className="hidden sm:inline">Users</span>
            </button>
          )}

          {appUser?.role === 'Admin' && (
            <>
              <button 
                onClick={() => navigate('/logs')}
                className="px-2.5 py-1.5 text-slate-300 hover:text-white hover:bg-slate-800/80 rounded-lg transition-all flex items-center gap-1.5 text-[11px] font-semibold border border-transparent hover:border-slate-700"
                title="System Logs"
              >
                <Activity className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden sm:inline">Logs</span>
              </button>
              <button 
                onClick={() => navigate('/permission-management')}
                className="px-2.5 py-1.5 text-slate-300 hover:text-white hover:bg-slate-800/80 rounded-lg transition-all flex items-center gap-1.5 text-[11px] font-semibold border border-transparent hover:border-slate-700"
                title="Permissions"
              >
                <Shield className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden sm:inline">Permissions</span>
              </button>
            </>
          )}

          {userPermissions.viewSettings && (
            <>
              <button 
                onClick={() => navigate('/settings')}
                className="px-2.5 py-1.5 text-slate-300 hover:text-white hover:bg-slate-800/80 rounded-lg transition-all flex items-center gap-1.5 text-[11px] font-semibold border border-transparent hover:border-slate-700"
                title="จัดการรูปภาพ Logo ของแต่ละ Owner"
              >
                <ImageIcon className="w-3.5 h-3.5 text-pink-400" />
                <span className="hidden sm:inline">Owner Logos</span>
              </button>
              <button 
                onClick={() => navigate('/settings')}
                className="px-2.5 py-1.5 text-slate-300 hover:text-white hover:bg-slate-800/80 rounded-lg transition-all flex items-center gap-1.5 text-[11px] font-semibold border border-transparent hover:border-slate-700"
                title="System Settings"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-sky-400" />
                <span className="hidden sm:inline">Settings</span>
              </button>
            </>
          )}

          <button 
            onClick={() => navigate('/manual')}
            className="px-3 py-1.5 text-brand-300 hover:text-white bg-brand-500/10 hover:bg-brand-500/20 border border-brand-500/30 rounded-lg transition-all flex items-center gap-1.5 text-[11px] font-bold shadow-sm"
            title="System Manual (Presentation & PDF)"
          >
            <FileText className="w-3.5 h-3.5 text-brand-400" />
            <span className="hidden sm:inline">Manual (PDF)</span>
          </button>

          <ThemeToggle />

          <div className="h-5 w-px bg-slate-800 mx-1 hidden md:block"></div>

          <div 
            className="hidden md:flex items-center gap-2.5 bg-slate-800/50 hover:bg-slate-800 border border-slate-700/60 pl-2.5 pr-2 py-1 rounded-xl cursor-pointer transition-all group"
            onClick={() => navigate('/profile')}
            title="Profile Settings"
          >
            <div className="flex flex-col items-end">
              <span className="text-[11px] font-bold text-slate-200 group-hover:text-white transition-colors">{appUser?.displayName || user.email?.split('@')[0]}</span>
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <span className="text-[9px] text-slate-400 font-semibold uppercase">{appUser?.role || 'Viewer'}</span>
              </div>
            </div>
            <div className="w-7 h-7 bg-slate-700 text-slate-300 rounded-lg flex items-center justify-center group-hover:bg-brand-500 group-hover:text-white transition-all overflow-hidden border border-slate-600">
              {appUser?.photoURL ? (
                <img src={appUser.photoURL} alt="Profile" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <UserIcon size={14} />
              )}
            </div>
          </div>

          <button 
            onClick={logout} 
            className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all border border-transparent hover:border-rose-500/20" 
            title="Logout"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8 relative z-10">
        {!appUser ? (
          <div className="card p-12 text-center max-w-xl mx-auto mt-12">
            <div className="w-16 h-16 bg-rose-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-rose-500/20">
              <Shield className="w-8 h-8 text-rose-400" />
            </div>
            <h3 className="text-2xl font-black text-white mb-2 tracking-tight font-display">Access Restricted</h3>
            <p className="text-slate-400 mb-8 text-sm leading-relaxed">You do not have a role assigned. Please contact an administrator to grant you access to the fiber network workspace.</p>
            <button onClick={logout} className="btn-secondary text-xs">Sign In With Another Account</button>
          </div>
        ) : (
          <>
            {/* Header section with Stats & Actions */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="px-2.5 py-0.5 text-[11px] font-bold bg-brand-500/15 text-brand-400 border border-brand-500/30 rounded-full flex items-center gap-1.5">
                    <Sparkles size={12} /> Workspaces Overview
                  </span>
                </div>
                <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight font-display">Network Projects</h2>
                <p className="text-slate-300 mt-1 text-sm font-medium">Select an optical fiber project to inspect routes, splice enclosures, and core assignments.</p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {oldProjects.length > 0 && (
                  <button 
                    onClick={handleMigrateProjects}
                    disabled={isMigrating || quotaExceeded}
                    className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-2.5 px-4 rounded-xl transition-all shadow-lg shadow-amber-500/20 flex items-center gap-2 text-xs disabled:opacity-50"
                  >
                    <Database className="w-4 h-4" />
                    {isMigrating ? 'Migrating...' : `Migrate ${oldProjects.length} Projects`}
                  </button>
                )}
                {(!appUser || DEFAULT_PERMISSIONS[appUser.role].createProjects) && (
                  <button 
                    onClick={openCreateModal}
                    disabled={quotaExceeded}
                    className="btn-primary py-2.5 px-5 text-xs font-bold shadow-lg shadow-brand-500/20"
                  >
                    <Plus className="w-4 h-4" />
                    New Project
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
                  placeholder="Search project by name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-950/80 border border-slate-700/80 pl-10 pr-4 py-2.5 rounded-xl text-xs text-white placeholder:text-slate-400 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all font-medium"
                />
              </div>

              <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
                <span className="text-[11px] font-bold text-slate-300 mr-1.5 whitespace-nowrap">Filter Owner:</span>
                {(['All', 'ITEL', 'SYMC', 'UIH'] as const).map((owner) => (
                  <button
                    key={owner}
                    onClick={() => setSelectedOwnerFilter(owner)}
                    className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-all whitespace-nowrap cursor-pointer ${
                      selectedOwnerFilter === owner
                        ? 'bg-brand-600 text-white shadow-md shadow-brand-500/25 ring-1 ring-brand-400'
                        : 'bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 border border-slate-700/60'
                    }`}
                  >
                    {owner}
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
                  {searchQuery ? 'No matching projects found' : 'No projects created yet'}
                </h3>
                <p className="text-slate-300 mb-6 text-xs max-w-sm mx-auto">
                  {searchQuery 
                    ? 'Try adjusting your search keywords or owner filter.' 
                    : 'Create your first project workspace to map optical routes, deploy splice enclosures, and allocate fiber cores.'}
                </p>
                {(!appUser || DEFAULT_PERMISSIONS[appUser.role].createProjects) && !searchQuery && (
                  <button 
                    onClick={openCreateModal}
                    className="btn-primary text-xs"
                  >
                    <Plus className="w-4 h-4" />
                    Create First Project
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredProjects.map(project => {
                  const orderMap: Record<string, number> = { 'ITEL': 1, 'SYMC': 2, 'UIH': 3 };
                  const owners = [...(project.owners || (project.owner ? [project.owner] : ['ITEL']))].sort((a, b) => (orderMap[a] || 99) - (orderMap[b] || 99));
                  return (
                    <motion.div 
                      key={project.id}
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      onClick={() => navigate(`/project/${project.id}`)}
                      className="card p-6 cursor-pointer group flex flex-col justify-between relative overflow-hidden"
                    >
                      <div className="absolute top-0 right-0 w-32 h-32 bg-brand-500/10 rounded-full -mr-16 -mt-16 opacity-0 group-hover:opacity-100 transition-opacity blur-xl pointer-events-none"></div>

                      <div>
                        {/* Card topbar */}
                        <div className="flex items-start justify-between gap-3 mb-5">
                          <div className="w-11 h-11 bg-brand-500/15 text-brand-400 rounded-xl flex items-center justify-center border border-brand-500/30 shadow-sm group-hover:scale-105 group-hover:bg-brand-500 group-hover:text-white transition-all">
                            <Map className="w-5 h-5" />
                          </div>

                          <div className="flex items-center gap-1.5 opacity-80 group-hover:opacity-100 transition-opacity">
                            {(!appUser || DEFAULT_PERMISSIONS[appUser.role].editProjects) && (
                              <button 
                                onClick={(e) => openEditModal(project, e)}
                                className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-all"
                                title="Edit Project"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {(!appUser || DEFAULT_PERMISSIONS[appUser.role].deleteProjects || (appUser.role === 'Design' && project.uid === user.uid)) && (
                              <button 
                                onClick={(e) => handleDeleteProject(project.id, e)}
                                className="p-2 text-slate-300 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all"
                                title="Delete Project"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Title & info */}
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <h3 className="text-xl font-bold text-white tracking-tight group-hover:text-brand-300 transition-colors font-display line-clamp-1">
                            {project.name}
                          </h3>
                          {project.uid === user.uid && (
                            <span className="shrink-0 px-2 py-0.5 text-[9px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 rounded-full">
                              Created by you
                            </span>
                          )}
                        </div>

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
                            <div className="mb-4">
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
                                    <span className="text-[10.5px] font-black uppercase tracking-wider block leading-tight">
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
                                      <span className="text-[9px] text-slate-400 font-mono">
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
                                  className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider border transition-all ${
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
                        <div className="flex flex-col gap-1.5 mb-5">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                            Authorized Operators ({owners.length}):
                          </span>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {owners.map(o => (
                              <span 
                                key={o}
                                className={`px-2 py-0.5 text-[10px] font-black uppercase tracking-wider rounded-md border flex items-center gap-1 ${getOwnerBadgeStyle(o)}`}
                              >
                                <OwnerLogo owner={o} size="xs" />
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Card Footer */}
                      <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50 animate-pulse"></span>
                          <span className="text-[11px] font-semibold text-slate-300">Active Workspace</span>
                        </div>
                        
                        <span className="text-xs font-bold text-brand-400 group-hover:text-brand-300 flex items-center gap-1">
                          Open Map <ArrowUpRight size={14} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                        </span>
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
                    <h2 className="text-lg font-bold text-white font-display">{editingProjectId ? 'Edit Project Details' : 'Create New Project'}</h2>
                    <p className="text-xs text-slate-400">Configure workspace name and authorized network operators</p>
                  </div>
                </div>
                <button onClick={() => setProjectModalOpen(false)} className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800">
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-5">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-2">Project Name</label>
                  <input
                    type="text"
                    autoFocus
                    placeholder="e.g. Bangkok Core Ring-1 Expansion"
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
                        className="text-[11px] text-brand-400 hover:text-brand-300 font-bold transition-colors cursor-pointer"
                      >
                        {projectOwnersInput.length === 3 ? 'เลือกเฉพาะ ITEL' : 'เลือกทั้งหมด (Select All)'}
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
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
                      <p className="text-[11px] text-rose-400 mt-1 font-semibold">
                        * ต้องเลือกอย่างน้อย 1 Operator เพื่อให้มีสิทธิ์เข้าถึงโครงการ
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 mt-8 pt-4 border-t border-slate-800">
                <button onClick={() => setProjectModalOpen(false)} className="btn-secondary text-xs">Cancel</button>
                <button 
                  onClick={handleSaveProject} 
                  disabled={quotaExceeded || !projectNameInput.trim() || projectOwnersInput.length === 0}
                  className="btn-primary text-xs"
                >
                  {editingProjectId ? 'Save Changes' : 'Create Project'}
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
            <h2 className="text-xl font-bold text-white mb-2 font-display">Delete Project?</h2>
            <p className="text-xs text-slate-400 mb-6 leading-relaxed">
              Are you sure you want to delete this project? All associated routes, enclosures, and splice connections will be permanently removed.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteProjectId(null)} className="btn-secondary flex-1 text-xs">Cancel</button>
              <button 
                onClick={confirmDeleteProject} 
                disabled={quotaExceeded}
                className="flex-1 px-5 py-2.5 bg-rose-600 text-white rounded-xl font-bold hover:bg-rose-500 transition-all text-xs shadow-lg shadow-rose-600/20"
              >
                Confirm Delete
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

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Route, Core, CoreStatus, CoreOwner, CorePriority, User as AppUser } from '../types';
import { DEFAULT_PERMISSIONS } from '../constants';
import { X, Activity, User, ShieldAlert, Box, CheckCircle2, Eye, History, Clock, Maximize2, Minimize2, ChevronRight, ChevronDown, Filter, Lock, Pencil, AlertCircle, Save, RotateCcw } from 'lucide-react';

interface CoreManagerProps {
  route: Route;
  appUser: AppUser | null;
  onClose: () => void;
  onUpdateCore: (routeId: string, coreId: number, data: Partial<Core>) => void;
  onUpdateCores: (routeId: string, updates: { coreId: number, data: Partial<Core> }[]) => void;
}

export default function CoreManager({ route, appUser, onClose, onUpdateCore, onUpdateCores }: CoreManagerProps) {
  const permissions = appUser ? DEFAULT_PERMISSIONS[appUser.role] : DEFAULT_PERMISSIONS['Viewer'];
  const [filterOwner, setFilterOwner] = useState<'All' | CoreOwner>('All');
  const [filterPriority, setFilterPriority] = useState<'All' | CorePriority>('All');
  const [selectedCore, setSelectedCore] = useState<Core | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [width, setWidth] = useState(600);
  const [isResizing, setIsResizing] = useState(false);
  const [expandedTubes, setExpandedTubes] = useState<Record<number, boolean>>({});
  const [activeTab, setActiveTab] = useState<'details' | 'history'>('details');
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<Core>>({});
  const [pendingUpdates, setPendingUpdates] = useState<Record<number, CoreOwner>>({});
  const [pendingPriorityUpdates, setPendingPriorityUpdates] = useState<Record<number, CorePriority>>({});
  const [isConfirmingSave, setIsConfirmingSave] = useState(false);

  const toggleTube = (tubeId: number) => {
    setExpandedTubes(prev => ({ ...prev, [tubeId]: !prev[tubeId] }));
  };

  const startEditing = () => {
    if (!selectedCore) return;
    setEditData({
      status: selectedCore.status,
      owner: selectedCore.owner,
      priority: selectedCore.priority,
      details: selectedCore.details || ''
    });
    setIsEditing(true);
  };

  const handleSave = () => {
    if (!selectedCore) return;
    
    // Create history entry
    const newHistoryEntry = {
      id: Date.now().toString(),
      action: 'Updated Core',
      description: `Status: ${editData.status}, Owner: ${editData.owner}, Priority: ${editData.priority}`,
      user: appUser?.email || 'Unknown',
      date: new Date().toISOString()
    };

    const updatedHistory = [...(selectedCore.history || []), newHistoryEntry];
    
    onUpdateCore(route.id, selectedCore.id, { ...editData, history: updatedHistory });
    setIsEditing(false);
    setSelectedCore({ ...selectedCore, ...editData, history: updatedHistory });
  };

  const handleBulkSave = () => {
    const allUpdates: { coreId: number, data: Partial<Core> }[] = [];
    const modifiedTubeIds = Array.from(new Set([
      ...Object.keys(pendingUpdates).map(Number),
      ...Object.keys(pendingPriorityUpdates).map(Number)
    ]));
    
    modifiedTubeIds.forEach(tubeId => {
      const nextOwner = pendingUpdates[tubeId];
      const nextPriority = pendingPriorityUpdates[tubeId];
      const tubeCores = route.cores.filter(c => Math.floor((c.id - 1) / 12) + 1 === tubeId);
      
      tubeCores.forEach(core => {
        const dataToUpdate: Partial<Core> = {};
        const historyDescriptions: string[] = [];

        if (nextOwner !== undefined) {
          dataToUpdate.owner = nextOwner;
          historyDescriptions.push(`Owner: ${nextOwner}`);
        }
        if (nextPriority !== undefined) {
          dataToUpdate.priority = nextPriority;
          historyDescriptions.push(`Priority: ${nextPriority}`);
        }

        if (Object.keys(dataToUpdate).length > 0) {
          allUpdates.push({
            coreId: core.id,
            data: { 
              ...dataToUpdate,
              history: [
                ...(core.history || []),
                {
                  id: Date.now().toString() + core.id,
                  action: 'Bulk Tube Update',
                  description: `${historyDescriptions.join(', ')} via Tube ${tubeId} update`,
                  user: appUser?.email || 'Unknown',
                  date: new Date().toISOString()
                }
              ]
            }
          });
        }
      });
    });

    onUpdateCores(route.id, allUpdates);
    setPendingUpdates({});
    setPendingPriorityUpdates({});
    setIsConfirmingSave(false);
  };

  const statusColors: Record<CoreStatus, string> = {
    used: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300',
    bad: 'bg-rose-500/15 border-rose-500/40 text-rose-300',
    reserved: 'bg-amber-500/15 border-amber-500/40 text-amber-300'
  };

  const ownerColors: Record<CoreOwner, string> = {
    None: 'bg-slate-800/80 text-slate-300 border-slate-700/80',
    ITEL: 'bg-amber-500/15 text-amber-300 border-amber-500/40 shadow-sm shadow-amber-500/10',
    SYMC: 'bg-pink-500/15 text-pink-300 border-pink-500/40 shadow-sm shadow-pink-500/10',
    UIH: 'bg-sky-500/15 text-sky-300 border-sky-500/40 shadow-sm shadow-sky-500/10'
  };

  const priorityColors: Record<CorePriority, string> = {
    Low: 'text-slate-400',
    Medium: 'text-amber-400 font-semibold',
    High: 'text-rose-400 font-bold'
  };

  const availableOwners = route.owners || ['ITEL', 'SYMC', 'UIH'];
  const filterOptions = ['All', 'None', ...availableOwners] as const;
  const priorityFilterOptions = ['All', 'High', 'Medium', 'Low'] as const;

  const filteredCores = route.cores.filter(c => 
    (filterOwner === 'All' || c.owner === filterOwner) &&
    (filterPriority === 'All' || c.priority === filterPriority)
  );
  const hasTubes = route.cores.some(c => c.label.startsWith('T'));

  const tubes = hasTubes ? filteredCores.reduce((acc, core) => {
    const tubeId = Math.floor((core.id - 1) / 12) + 1;
    if (!acc[tubeId]) acc[tubeId] = [];
    acc[tubeId].push(core);
    return acc;
  }, {} as Record<number, Core[]>) : null;

  React.useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = window.innerWidth - e.clientX;
      if (newWidth > 400 && newWidth < window.innerWidth * 0.8) {
        setWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.body.style.cursor = 'default';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  return (
    <div 
      className={`fixed top-0 right-0 h-screen bg-slate-950 shadow-2xl z-[1000] flex flex-col border-l border-slate-800 transition-all duration-500 ease-in-out ${isFullscreen ? 'w-screen' : ''}`}
      style={{ width: isFullscreen ? '100vw' : `${width}px` }}
    >
      {/* Resize Handle */}
      {!isFullscreen && (
        <div 
          className="absolute left-0 top-0 w-1 h-full cursor-col-resize hover:bg-brand-500/30 transition-colors z-50"
          onMouseDown={() => setIsResizing(true)}
        />
      )}

      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between bg-slate-950/80 backdrop-blur-md sticky top-0 z-20">
        <div>
          <div className="flex items-center gap-1 mb-0.5">
            <Activity className="w-3 h-3 text-brand-400" />
            <h2 className="text-base font-black text-slate-100 tracking-tight font-display">{route.name}</h2>
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[9px] font-bold text-slate-400 uppercase tracking-tight">
            <span className="flex items-center gap-1"><Box className="w-2 h-2" /> {route.capacity} Cores</span>
            <span className="w-0.5 h-0.5 bg-slate-700 rounded-full" />
            <span>{route.tier || 'Standard'}</span>
            {route.owners && route.owners.length > 0 && (
              <>
                <span className="w-0.5 h-0.5 bg-slate-700 rounded-full" />
                <span className="flex items-center gap-1"><User className="w-2 h-2" /> {route.owners.join(', ')}</span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button 
            onClick={() => setIsFullscreen(!isFullscreen)} 
            className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 transition-all active:scale-95"
            title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
          <button 
            onClick={onClose} 
            className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 transition-all active:scale-95"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="px-4 py-2.5 border-b border-slate-800 bg-slate-900/50 backdrop-blur-sm space-y-2">
        <div>
          <div className="flex items-center gap-1 mb-1">
            <Filter className="w-2.5 h-2.5 text-slate-500" />
            <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Filter by Owner</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {filterOptions.map(owner => (
              <button
                key={owner}
                onClick={() => setFilterOwner(owner as 'All' | CoreOwner)}
                className={`px-2.5 py-0.5 text-[8px] font-black rounded-full border transition-all duration-300 uppercase tracking-wider ${
                  filterOwner === owner 
                    ? 'bg-brand-600 text-slate-100 border-brand-600 shadow-lg shadow-brand-900/20' 
                    : 'bg-slate-800 text-slate-400 border-slate-700 hover:border-brand-500 hover:text-brand-400'
                }`}
              >
                {owner}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center gap-1 mb-1">
            <ShieldAlert className="w-2.5 h-2.5 text-slate-500" />
            <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Filter by Priority</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {priorityFilterOptions.map(priority => (
              <button
                key={priority}
                onClick={() => setFilterPriority(priority as 'All' | CorePriority)}
                className={`px-2.5 py-0.5 text-[8px] font-black rounded-full border transition-all duration-300 uppercase tracking-wider ${
                  filterPriority === priority 
                    ? priority === 'High'
                      ? 'bg-rose-600 text-slate-100 border-rose-500 shadow-lg shadow-rose-900/20'
                      : priority === 'Medium'
                        ? 'bg-amber-600 text-slate-100 border-amber-500 shadow-lg shadow-amber-900/20'
                        : 'bg-brand-600 text-slate-100 border-brand-600 shadow-lg shadow-brand-900/20'
                    : 'bg-slate-800 text-slate-400 border-slate-700 hover:border-brand-500 hover:text-brand-400'
                }`}
              >
                {priority === 'High' ? '★ High' : priority}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
        <AnimatePresence mode="wait">
          {filteredCores.length === 0 ? (
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center justify-center h-full text-slate-500 py-12"
            >
              <div className="p-2.5 bg-slate-900 rounded-full mb-2.5">
                <AlertCircle className="w-6 h-6 opacity-50" />
              </div>
              <p className="text-[10px] font-bold uppercase tracking-widest">No cores found</p>
              <p className="text-[9px] mt-0.5">Try adjusting your filter</p>
            </motion.div>
          ) : (
            <div className="space-y-4">
              {hasTubes && tubes ? (
                Object.entries(tubes).map(([tubeIdStr, tubeCores]) => {
                  const tubeId = parseInt(tubeIdStr);
                  const isExpanded = expandedTubes[tubeId];
                  const isAllSameOwner = tubeCores.every(c => c.owner === tubeCores[0].owner);
                  const tubeOwner = isAllSameOwner ? tubeCores[0].owner : 'Mixed';
                  const effectiveOwner = pendingUpdates[tubeId] || tubeOwner;

                  const isAllSamePriority = tubeCores.every(c => c.priority === tubeCores[0].priority);
                  const effectivePriority = pendingPriorityUpdates[tubeId] || (isAllSamePriority ? tubeCores[0].priority : (tubeCores.some(c => c.priority === 'High') ? 'High' : 'Low'));
                  
                  const userCompany = appUser?.owner && appUser.owner !== 'None' ? appUser.owner : null;
                  const isGlobalAdminOrDesign = !userCompany && (appUser?.role === 'Admin' || appUser?.role === 'Design');

                  // 1. Permission check for expanding tube:
                  // Can expand if global Admin/Design, or if tube belongs to user's company, or unassigned ('None')
                  const canExpand = 
                    isGlobalAdminOrDesign || 
                    !userCompany || 
                    effectiveOwner === 'None' || 
                    effectiveOwner === userCompany;

                  // 2. Permission check for editing tube owner:
                  // Global Admin/Design can reassign any tube.
                  // Company user can ONLY claim an unassigned tube ('None') or unassign their own tube ('None').
                  // Company user CANNOT change owner of other companies' tubes!
                  const canEditTubeOwner = 
                    permissions.editRoutes && (
                      isGlobalAdminOrDesign || 
                      (userCompany && (effectiveOwner === 'None' || effectiveOwner === userCompany))
                    );

                  // 3. Permission check for editing tube priority:
                  // ONLY the company that owns the tube can set/change its priority!
                  // Company user CANNOT change priority of other companies' tubes or unassigned tubes.
                  const canEditTubePriority = 
                    permissions.editRoutes && 
                    effectiveOwner !== 'None' && 
                    effectiveOwner !== 'Mixed' && (
                      isGlobalAdminOrDesign || 
                      (userCompany && effectiveOwner === userCompany)
                    );

                  // Options available in Owner dropdown for this user
                  const selectableOwners = isGlobalAdminOrDesign 
                    ? ['None', ...availableOwners] 
                    : userCompany 
                      ? ['None', userCompany] 
                      : ['None'];

                  return (
                    <motion.div 
                      key={tubeId}
                      layout
                      className={`glass-panel overflow-hidden border-slate-800/50 ${!canExpand ? 'opacity-75' : ''}`}
                    >
                      <div className="p-2.5 flex items-center justify-between bg-slate-900/40 gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <button 
                            onClick={() => canExpand && toggleTube(tubeId)} 
                            className={`p-1 rounded-lg text-slate-500 transition-all shrink-0 ${
                              canExpand 
                                ? 'hover:bg-slate-800 active:scale-90' 
                                : 'cursor-not-allowed opacity-50'
                            }`}
                            title={!canExpand ? `Restricted: Owned by ${effectiveOwner}` : ''}
                          >
                            {!canExpand ? (
                              <Lock className="w-3 h-3 text-slate-500" />
                            ) : isExpanded ? (
                              <ChevronDown className="w-3 h-3" />
                            ) : (
                              <ChevronRight className="w-3 h-3" />
                            )}
                          </button>
                          <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-[9px] font-black shadow-sm shrink-0 ${
                            effectivePriority === 'High'
                              ? 'bg-rose-950/60 text-rose-300 border border-rose-500/40 shadow-rose-900/20'
                              : 'bg-brand-900/30 text-brand-400'
                          }`}>
                            T{tubeId}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <h3 className="font-black text-slate-100 text-[11px] tracking-tight font-display truncate">Tube {tubeId}</h3>
                              {effectivePriority === 'High' && (
                                <span className="px-1.5 py-0.5 rounded-md bg-rose-500/25 border border-rose-500/40 text-[7px] font-black text-rose-300 uppercase tracking-widest flex items-center gap-0.5 shadow-sm">
                                  <ShieldAlert className="w-2.5 h-2.5 text-rose-400" />
                                  PRIORITY
                                </span>
                              )}
                              {effectivePriority === 'Medium' && (
                                <span className="px-1.5 py-0.5 rounded-md bg-amber-500/20 border border-amber-500/40 text-[7px] font-black text-amber-300 uppercase tracking-widest">
                                  MED
                                </span>
                              )}
                              {!canExpand && (
                                <span className="px-1 py-0.5 rounded bg-slate-800 text-[6px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-0.5">
                                  <Lock className="w-1 h-1" /> Locked ({effectiveOwner})
                                </span>
                              )}
                            </div>
                            <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">12 Cores</p>
                          </div>
                        </div>

                        {/* Right Actions: Priority & Owner Selectors */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          {/* Tube Priority Selector */}
                          <div className="relative">
                            <select
                              disabled={!canEditTubePriority}
                              className={`text-[8px] font-black uppercase tracking-widest border-2 rounded-lg px-2 py-1 transition-all shadow-sm cursor-pointer ${
                                effectivePriority === 'High'
                                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/50 shadow-sm shadow-rose-500/20 ring-1 ring-rose-500/30 font-extrabold'
                                  : effectivePriority === 'Medium'
                                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-bold'
                                    : 'bg-slate-800/60 border-slate-700 text-slate-400'
                              } ${!canEditTubePriority ? 'opacity-40 cursor-not-allowed' : 'hover:border-slate-500'}`}
                              value={pendingPriorityUpdates[tubeId] || (isAllSamePriority ? tubeCores[0].priority : (tubeCores.some(c => c.priority === 'High') ? 'High' : 'Low'))}
                              onChange={(e) => {
                                const nextPriority = e.target.value as CorePriority;
                                setPendingPriorityUpdates(prev => ({ ...prev, [tubeId]: nextPriority }));
                              }}
                              title={
                                !permissions.editRoutes
                                  ? 'No permission to edit routes'
                                  : effectiveOwner === 'None'
                                    ? 'Assign an Owner first to enable Priority selection'
                                    : !canEditTubePriority
                                      ? `Locked: Owned by ${effectiveOwner} (Cannot modify other company's tube priority)`
                                      : `Set Priority for all 12 cores in Tube ${tubeId}`
                              }
                            >
                              <option value="Low">Low</option>
                              <option value="Medium">Medium</option>
                              <option value="High">★ Priority</option>
                            </select>
                          </div>

                          {/* Tube Owner Selector */}
                          <div className="relative">
                            <select
                              disabled={!permissions.editRoutes || !canEditTubeOwner}
                              className={`text-[8px] font-black uppercase tracking-widest border-2 rounded-lg px-2 py-1 transition-all shadow-sm cursor-pointer ${
                                (pendingUpdates[tubeId] || tubeOwner) !== 'None' && (pendingUpdates[tubeId] || tubeOwner) !== 'Mixed'
                                  ? ownerColors[(pendingUpdates[tubeId] || tubeOwner) as CoreOwner]
                                  : 'bg-slate-800/60 border-slate-700 text-slate-400'
                              } ${(!permissions.editRoutes || !canEditTubeOwner) ? 'opacity-80 cursor-not-allowed' : 'hover:border-slate-500'}`}
                              value={pendingUpdates[tubeId] || (isAllSameOwner ? tubeCores[0].owner : "None")}
                              onChange={(e) => {
                                const nextOwner = e.target.value as CoreOwner;
                                if (userCompany && nextOwner !== 'None' && nextOwner !== userCompany) {
                                  return;
                                }
                                setPendingUpdates(prev => ({ ...prev, [tubeId]: nextOwner }));
                              }}
                              title={
                                !canEditTubeOwner
                                  ? `Locked: Owned by ${effectiveOwner} (Cannot reassign other company's tube)`
                                  : undefined
                              }
                            >
                              {['None', ...availableOwners].map(owner => {
                                const isOptionDisabled = !!(userCompany && owner !== 'None' && owner !== userCompany && owner !== effectiveOwner);
                                return (
                                  <option key={owner} value={owner} disabled={isOptionDisabled}>
                                    {owner}
                                  </option>
                                );
                              })}
                            </select>
                          </div>
                        </div>
                      </div>
                      
                      <AnimatePresence>
                        {isExpanded && canExpand && (
                          <motion.div 
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="p-2.5 bg-slate-900/30 border-t border-slate-800"
                          >
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                              {tubeCores.map(core => (
                                <CoreCard 
                                  key={core.id} 
                                  core={core} 
                                  onClick={() => {
                                    setSelectedCore(core);
                                  }}
                                  statusColors={statusColors}
                                  ownerColors={ownerColors}
                                  priorityColors={priorityColors}
                                />
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                  {filteredCores.map(core => (
                    <CoreCard 
                      key={core.id} 
                      core={core} 
                      onClick={() => {
                        setSelectedCore(core);
                      }}
                      statusColors={statusColors}
                      ownerColors={ownerColors}
                      priorityColors={priorityColors}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </AnimatePresence>
      </div>

      {/* Bulk Save Floating Bar */}
      <AnimatePresence>
        {(Object.keys(pendingUpdates).length > 0 || Object.keys(pendingPriorityUpdates).length > 0) && (
          <motion.div 
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="absolute bottom-4 left-4 right-4 bg-slate-900 text-slate-100 p-2.5 rounded-xl shadow-2xl z-50 flex items-center justify-between border border-slate-800"
          >
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-brand-500 flex items-center justify-center">
                <Save className="w-3.5 h-3.5 text-slate-100" />
              </div>
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest">Unsaved Changes</p>
                <p className="text-[8px] text-slate-400 font-bold">
                  {Array.from(new Set([...Object.keys(pendingUpdates), ...Object.keys(pendingPriorityUpdates)])).length} tubes modified
                  {Object.keys(pendingPriorityUpdates).length > 0 && ` (${Object.keys(pendingPriorityUpdates).length} priority)`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button 
                onClick={() => {
                  setPendingUpdates({});
                  setPendingPriorityUpdates({});
                }}
                className="px-2.5 py-1 text-[8px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-100 transition-colors flex items-center gap-1"
              >
                <RotateCcw className="w-2.5 h-2.5" /> Reset
              </button>
              <button 
                onClick={() => setIsConfirmingSave(true)}
                className="px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-slate-100 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all shadow-lg shadow-brand-900/20"
              >
                Save All
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bulk Save Confirmation Modal */}
      <AnimatePresence>
        {isConfirmingSave && (
          <div className="fixed inset-0 z-[4000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-slate-900 rounded-xl shadow-2xl w-full max-w-[320px] overflow-hidden border border-slate-800"
            >
              <div className="p-5 text-center">
                <div className="w-12 h-12 bg-brand-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <AlertCircle className="w-6 h-6 text-brand-400" />
                </div>
                <h3 className="text-base font-black text-slate-100 mb-1.5 tracking-tight font-display">Confirm Changes?</h3>
                <p className="text-[11px] text-slate-400 leading-relaxed font-medium">
                  Are you sure you want to update the settings for {Array.from(new Set([...Object.keys(pendingUpdates), ...Object.keys(pendingPriorityUpdates)])).length} tube(s)? All 12 cores in each selected tube will be updated.
                </p>
              </div>
              <div className="p-4 bg-slate-950 flex gap-2">
                <button 
                  onClick={() => setIsConfirmingSave(false)}
                  className="flex-1 py-2.5 bg-slate-900 text-slate-400 rounded-lg text-[8px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all border border-slate-800"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleBulkSave}
                  className="flex-1 py-2.5 bg-brand-600 text-slate-100 rounded-lg text-[8px] font-black uppercase tracking-widest hover:bg-brand-700 shadow-lg shadow-brand-900/20 transition-all"
                >
                  Confirm Save
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* View Modal Overlay */}
      <AnimatePresence>
        {selectedCore && (() => {
          const userCompany = appUser?.owner && appUser.owner !== 'None' ? appUser.owner : null;
          const isGlobalAdminOrDesign = !userCompany && (appUser?.role === 'Admin' || appUser?.role === 'Design');
          const canEditSelectedCore = 
            permissions.editRoutes && (
              isGlobalAdminOrDesign || 
              (userCompany && (selectedCore.owner === userCompany || selectedCore.owner === 'None'))
            );
          const selectableOwnersForCore = isGlobalAdminOrDesign 
            ? ['None', ...availableOwners] 
            : userCompany 
              ? Array.from(new Set(['None', userCompany, selectedCore.owner])) 
              : ['None', selectedCore.owner];

          return (
            <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="bg-slate-900 rounded-xl shadow-2xl w-full max-w-sm overflow-hidden border border-slate-800"
              >
                <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-brand-900/30 flex items-center justify-center text-brand-400 font-black text-[10px]">
                      {selectedCore.id}
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-slate-100 tracking-tight font-display">
                        Core Details
                      </h3>
                      <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">{selectedCore.label}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {canEditSelectedCore && !isEditing ? (
                      <button 
                        onClick={startEditing}
                        className="p-1 hover:bg-slate-800 rounded-lg text-brand-400 transition-all flex items-center gap-1 text-[8px] font-black uppercase tracking-widest"
                      >
                        <Pencil className="w-2.5 h-2.5" /> Edit
                      </button>
                    ) : !isEditing && (
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[7px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                        <Lock className="w-2 h-2 text-slate-500" /> Read-only ({selectedCore.owner})
                      </span>
                    )}
                    <button onClick={() => { setSelectedCore(null); setActiveTab('details'); setIsEditing(false); }} className="p-1 hover:bg-slate-800 rounded-lg text-slate-500 transition-all">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="flex border-b border-slate-800 bg-slate-900 sticky top-0 z-10">
                  <button 
                    onClick={() => setActiveTab('details')}
                    className={`flex-1 py-2 text-[8px] font-black uppercase tracking-widest transition-all border-b-2 ${activeTab === 'details' ? 'border-brand-500 text-brand-500' : 'border-transparent text-slate-500 hover:text-slate-300'}`}
                  >
                    Details
                  </button>
                  <button 
                    onClick={() => setActiveTab('history')}
                    className={`flex-1 py-2 text-[8px] font-black uppercase tracking-widest transition-all border-b-2 ${activeTab === 'history' ? 'border-brand-500 text-brand-500' : 'border-transparent text-slate-500 hover:text-slate-300'}`}
                  >
                    History
                  </button>
                </div>

                <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
                  {activeTab === 'details' && (
                    <div className="space-y-5">
                      {isEditing ? (
                        <div className="space-y-4">
                          <div className="grid grid-cols-2 gap-2.5">
                            <div>
                              <label className="block text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Status</label>
                              <select 
                                className="w-full bg-slate-800 border border-slate-700 p-1.5 rounded-lg text-[10px] font-bold text-slate-100 outline-none focus:ring-2 focus:ring-brand-500"
                                value={editData.status}
                                onChange={(e) => setEditData({ ...editData, status: e.target.value as CoreStatus })}
                              >
                                <option value="used">Used</option>
                                <option value="reserved">Reserved</option>
                                <option value="bad">Bad</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Priority</label>
                              <select 
                                className="w-full bg-slate-800 border border-slate-700 p-1.5 rounded-lg text-[10px] font-bold text-slate-100 outline-none focus:ring-2 focus:ring-brand-500"
                                value={editData.priority}
                                onChange={(e) => setEditData({ ...editData, priority: e.target.value as CorePriority })}
                              >
                                <option value="Low">Low</option>
                                <option value="Medium">Medium</option>
                                <option value="High">High</option>
                              </select>
                            </div>
                          </div>

                          <div>
                            <label className="block text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Owner</label>
                            <div className="flex flex-wrap gap-1">
                              {selectableOwnersForCore.map((owner) => (
                                <button
                                  key={owner}
                                  onClick={() => setEditData({ ...editData, owner: owner as CoreOwner })}
                                  className={`px-2.5 py-1 text-[8px] font-black rounded-lg border transition-all uppercase tracking-wider ${
                                    editData.owner === owner 
                                      ? 'bg-brand-600 text-slate-100 border-brand-600 shadow-md' 
                                      : 'bg-slate-800 text-slate-400 border-slate-700 hover:border-brand-500'
                                  }`}
                                >
                                  {owner}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div>
                            <label className="block text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Usage Details</label>
                            <textarea 
                              className="w-full bg-slate-800 border border-slate-700 p-2.5 rounded-xl text-[11px] text-slate-100 outline-none focus:ring-2 focus:ring-brand-500 min-h-[80px] resize-none"
                              placeholder="Describe what this core is used for..."
                              value={editData.details}
                              onChange={(e) => setEditData({ ...editData, details: e.target.value })}
                            />
                          </div>

                          <div className="flex gap-2 pt-2">
                            <button 
                              onClick={() => setIsEditing(false)}
                              className="flex-1 py-2 bg-slate-800 text-slate-400 rounded-lg text-[8px] font-black uppercase tracking-widest hover:bg-slate-700 transition-all"
                            >
                              Cancel
                            </button>
                            <button 
                              onClick={handleSave}
                              className="flex-1 py-2 bg-brand-600 text-slate-100 rounded-lg text-[8px] font-black uppercase tracking-widest hover:bg-brand-700 shadow-lg shadow-brand-900/20 transition-all"
                            >
                              Save Changes
                            </button>
                          </div>
                        </div>
                      ) : (
                      <div className="space-y-5">
                        {/* Visual Core Representation */}
                        <div className="flex items-center justify-center py-2">
                          <div className="relative">
                            <motion.div 
                              initial={{ scale: 0.8, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              className="w-16 h-16 rounded-full border-[5px] border-slate-800 shadow-2xl flex items-center justify-center relative z-10"
                              style={{ backgroundColor: selectedCore.color }}
                            >
                              <span className="text-lg font-black text-slate-100 drop-shadow-md">#{selectedCore.id}</span>
                            </motion.div>
                            <div className={`absolute -inset-2 rounded-full blur-lg opacity-20 animate-pulse ${
                              selectedCore.status === 'used' ? 'bg-emerald-500' : 
                              selectedCore.status === 'bad' ? 'bg-rose-500' : 'bg-amber-500'
                            }`} />
                          </div>
                        </div>

                        {/* Status Dashboard */}
                        <div className="grid grid-cols-3 gap-2">
                          <div className="bg-slate-800/50 p-2.5 rounded-xl border border-slate-800 flex flex-col items-center text-center">
                            <Activity className={`w-3.5 h-3.5 mb-1 ${
                              selectedCore.status === 'used' ? 'text-emerald-400' : 
                              selectedCore.status === 'bad' ? 'text-rose-400' : 'text-amber-400'
                            }`} />
                            <p className="text-[7px] font-black text-slate-500 uppercase tracking-widest mb-0.5">Status</p>
                            <p className="text-[9px] font-black text-slate-100 uppercase">{selectedCore.status}</p>
                          </div>
                          <div className="bg-slate-800/50 p-2.5 rounded-xl border border-slate-800 flex flex-col items-center text-center">
                            <ShieldAlert className={`w-3.5 h-3.5 mb-1 ${priorityColors[selectedCore.priority]}`} />
                            <p className="text-[7px] font-black text-slate-500 uppercase tracking-widest mb-0.5">Priority</p>
                            <p className="text-[9px] font-black text-slate-100 uppercase">{selectedCore.priority}</p>
                          </div>
                          <div className="bg-slate-800/50 p-2.5 rounded-xl border border-slate-800 flex flex-col items-center text-center">
                            <User className={`w-3.5 h-3.5 mb-1 ${ownerColors[selectedCore.owner]}`} />
                            <p className="text-[7px] font-black text-slate-500 uppercase tracking-widest mb-0.5">Owner</p>
                            <p className="text-[9px] font-black text-slate-100 uppercase">{selectedCore.owner}</p>
                          </div>
                        </div>
                        
                        {/* Metadata & Connections */}
                        <div className="space-y-2.5">
                          <div className="flex items-center gap-1">
                            <Clock className="w-2.5 h-2.5 text-slate-500" />
                            <h4 className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Metadata</h4>
                          </div>
                          <div className="bg-slate-800/50 rounded-xl p-3 space-y-2">
                            <div className="flex justify-between items-center text-[10px]">
                              <span className="text-slate-500 font-bold">Label</span>
                              <span className="text-slate-100 font-black">{selectedCore.label}</span>
                            </div>
                            <div className="flex justify-between items-center text-[10px]">
                              <span className="text-slate-500 font-bold">Last Updated</span>
                              <span className="text-slate-100 font-black">
                                {selectedCore.history && selectedCore.history.length > 0 
                                  ? new Date(selectedCore.history[selectedCore.history.length - 1].date).toLocaleDateString() 
                                  : 'Never'}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Usage Details */}
                        <div className="space-y-2.5">
                          <div className="flex items-center gap-1">
                            <Activity className="w-2.5 h-2.5 text-slate-500" />
                            <h4 className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Usage Description</h4>
                          </div>
                          <div className="text-[11px] text-slate-400 leading-relaxed bg-slate-800/50 p-3 rounded-xl border border-slate-800 italic min-h-[60px]">
                            {selectedCore.details || "No specific usage details provided for this core."}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'history' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Usage History</h4>
                    </div>

                    {!permissions.viewHistory ? (
                      <div className="flex flex-col items-center justify-center py-8 bg-slate-900 rounded-2xl border-2 border-dashed border-slate-800">
                        <Lock className="w-6 h-6 text-slate-700 mb-2" />
                        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Access Restricted</p>
                        <p className="text-[8px] text-slate-500 mt-1">You do not have permission to view history.</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {(!selectedCore.history || selectedCore.history.length === 0) ? (
                          <div className="text-center py-5 text-slate-700">
                            <History className="w-6 h-6 mx-auto mb-1 opacity-20" />
                            <p className="text-[8px] font-bold uppercase tracking-widest">No history entries</p>
                          </div>
                        ) : (
                          selectedCore.history.slice().reverse().map(entry => (
                            <div key={entry.id} className="relative pl-4 border-l-2 border-slate-800 py-1">
                              <div className="absolute left-[-5px] top-2 w-1.5 h-1.5 rounded-full bg-brand-500" />
                              <div className="flex items-center justify-between mb-0.5">
                                <span className="text-[8px] font-black text-slate-100 uppercase tracking-tight">{entry.action}</span>
                                <span className="text-[7px] font-bold text-slate-500">{new Date(entry.date).toLocaleDateString()}</span>
                              </div>
                              <p className="text-[10px] text-slate-400 mb-1 leading-relaxed">{entry.description}</p>
                              <div className="flex items-center gap-1 text-[7px] font-bold text-slate-500">
                                <User className="w-2 h-2" />
                                {entry.user}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        );
      })()}
      </AnimatePresence>
    </div>
  );
}

function CoreCard({ core, onClick, statusColors, ownerColors, priorityColors }: any) {
  return (
    <motion.div
      whileHover={{ y: -2, scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={`group relative p-2.5 rounded-xl border cursor-pointer transition-all bg-slate-900/90 hover:bg-slate-800/90 shadow-md flex flex-col gap-1.5 ${statusColors[core.status]}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <div
            className="w-3.5 h-3.5 rounded-full border-2 border-slate-700 shadow-sm shrink-0"
            style={{ backgroundColor: core.color }}
          />
          <span className="font-extrabold text-xs tracking-tight text-white">#{core.id}</span>
        </div>
        <div className="flex items-center gap-1">
          {core.priority === 'High' && <ShieldAlert className="w-3 h-3 text-rose-400" />}
        </div>
      </div>
      
      <div className="flex flex-col">
        <span className="text-[9px] font-bold uppercase tracking-wider opacity-75">{core.status}</span>
        <span className="text-[10px] font-semibold truncate text-slate-200">{core.label}</span>
      </div>

      <div className="mt-1 pt-1.5 border-t border-slate-800 flex items-center justify-between gap-1">
        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md border uppercase tracking-wider ${ownerColors[core.owner]}`}>
          {core.owner}
        </span>
        <span className={`text-[9px] font-bold uppercase tracking-wider ${priorityColors[core.priority]}`}>
          {core.priority}
        </span>
      </div>
    </motion.div>
  );
}

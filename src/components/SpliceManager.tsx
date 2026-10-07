import React, { useState, useMemo, useCallback, memo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Route, FiberEnclosure, Point, Core, CoreConnection, EnclosureType, CoreOwner, CoreStatus, CorePriority, User as AppUser, FiberType, FiberColorConfig } from '../types';
import { DEFAULT_PERMISSIONS } from '../constants';
import { X, GitMerge, Unlink, AlertCircle, ChevronRight, ChevronDown, List, Wrench, Network, Maximize2, Minimize2, ArrowLeftRight, Layers, Box, Zap, Activity, Plus, Minus, Edit2, MapPin, ShieldAlert, Pencil, Lock, Download } from 'lucide-react';
import { toPng } from 'html-to-image';
import jsPDF from 'jspdf';

export const ownerColors: Record<CoreOwner, string> = {
  None: 'bg-slate-800/80 text-slate-300 border-slate-700/80',
  ITEL: 'bg-amber-500/15 text-amber-300 border-amber-500/40 shadow-sm shadow-amber-500/10',
  SYMC: 'bg-pink-500/15 text-pink-300 border-pink-500/40 shadow-sm shadow-pink-500/10',
  UIH: 'bg-sky-500/15 text-sky-300 border-sky-500/40 shadow-sm shadow-sky-500/10'
};

export const ownerHexColors: Record<CoreOwner, string> = {
  None: '#64748b',
  ITEL: '#f59e0b',
  SYMC: '#ec4899',
  UIH: '#0ea5e9'
};

const PortNode = ({ id, type, enclosure, connectedRoutes, fiberTypes, fiberColorConfigs, onUpdate, side, isDetailView, appUser }: { id: number, type: 'main' | 'drop', enclosure: FiberEnclosure, connectedRoutes: Route[], fiberTypes: FiberType[], fiberColorConfigs: FiberColorConfig[], onUpdate: (enclosureId: string, portId: number, data: { owner?: CoreOwner, routeId?: string }) => void, side: 'left' | 'right', isDetailView?: boolean, appUser: AppUser | null }) => {
  const permissions = appUser ? DEFAULT_PERMISSIONS[appUser.role] : DEFAULT_PERMISSIONS['Viewer'];
  const assignment = enclosure.portAssignments?.[id] || {};
  const isMain = type === 'main';
  const [isOpen, setIsOpen] = useState(false);

  const mainAssignedRouteIds = Object.entries(enclosure.portAssignments || {})
    .filter(([portId, data]) => ['1', '2', '6'].includes(portId) && data.routeId)
    .map(([_, data]) => data.routeId);

  const availableRoutes = isMain 
    ? connectedRoutes 
    : connectedRoutes.filter(r => !mainAssignedRouteIds.includes(r.id) || r.id === assignment.routeId);

  const assignedRoute = connectedRoutes.find(r => r.id === assignment.routeId);
  
  const getRouteColor = (route: Route | undefined) => {
    if (!route) return '#cbd5e1';
    const fiberType = route.fiberType || route.capacity.toString();
    const tier = route.tierSharing || route.tier || 'Tier 1';
    
    // Find matching color config
    const ft = fiberTypes.find(f => f.name === fiberType);
    if (ft) {
      const config = fiberColorConfigs.find(c => c.fiberTypeId === ft.id && c.tier === tier);
      if (config) return config.color;
      return ft.color || '#10b981';
    }
    
    return '#10b981';
  };

  const routeColor = getRouteColor(assignedRoute);

  return (
    <div className="relative group" onMouseLeave={() => setIsOpen(false)}>
      {/* Port UI */}
      <div 
        className="w-10 h-10 bg-slate-800 rounded-full border-[2px] border-slate-600 shadow-2xl flex items-center justify-center z-10 relative cursor-pointer hover:border-brand-500 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="w-5 h-5 bg-black rounded-full shadow-inner flex items-center justify-center">
           <div className="w-2.5 h-2.5 bg-slate-900 rounded-full"></div>
        </div>
        <span className={`absolute ${side === 'left' ? '-left-5' : '-right-5'} text-slate-100 font-black text-[10px] bg-slate-800 px-1.5 py-0.5 rounded-md`}>{id}</span>
      </div>

      {/* Assignment UI Popover */}
      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0, x: side === 'left' ? -10 : 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: side === 'left' ? -10 : 10 }}
            className={`absolute top-1/2 -translate-y-1/2 ${side === 'left' ? 'right-full mr-6' : 'left-full ml-6'} w-64 bg-slate-900 p-5 rounded-3xl shadow-2xl border border-slate-800 z-50 backdrop-blur-xl`}
          >
            <div className="text-xs font-black text-slate-200 mb-4 border-b border-slate-800 pb-3 uppercase tracking-widest">{isMain ? 'Fiber Main Port' : 'Drop Cable Port'}</div>
            
            {!isMain && (
              <div className="mb-4">
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Assigned Owner</label>
                <select 
                  className="w-full text-xs p-3 bg-slate-800 border border-slate-700 rounded-2xl focus:ring-2 focus:ring-brand-500 outline-none font-black text-slate-200 disabled:opacity-50 transition-all"
                  value={assignment.owner || 'None'}
                  onChange={e => onUpdate(enclosure.id, id, { owner: e.target.value as CoreOwner })}
                  disabled={!permissions.editEnclosures}
                >
                  <option value="None">None</option>
                  <option value="ITEL">ITEL</option>
                  <option value="SYMC">SYMC</option>
                  <option value="UIH">UIH</option>
                </select>
              </div>
            )}

            {isMain && (
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Connected Route</label>
                <select 
                  className="w-full text-xs p-3 bg-slate-800 border border-slate-700 rounded-2xl focus:ring-2 focus:ring-brand-500 outline-none font-black text-slate-200 disabled:opacity-50 transition-all"
                  value={assignment.routeId || ''}
                  onChange={e => onUpdate(enclosure.id, id, { routeId: e.target.value })}
                  disabled={!permissions.editEnclosures}
                >
                  <option value="">Select Route...</option>
                  {availableRoutes.map(r => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>
            )}
            
            {!permissions.editEnclosures && (
              <div className="mt-4 flex items-center gap-2 text-[10px] font-black text-amber-400 bg-amber-900/20 p-3 rounded-xl border border-amber-800/50 uppercase tracking-widest">
                <ShieldAlert size={14} />
                <span>Read-only access</span>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Visual Line if route assigned or owner assigned for drop ports */}
      {((isMain && assignment.routeId) || (!isMain && assignment.owner && assignment.owner !== 'None')) && (
        <div 
          className={`absolute top-1/2 -translate-y-1/2 ${side === 'left' ? 'right-12 w-12' : 'left-12 w-12'} h-2.5 rounded-full z-0 flex items-center ${side === 'left' ? 'justify-start' : 'justify-end'}`}
          style={{ backgroundColor: isMain ? routeColor : (assignment.owner && assignment.owner !== 'None' ? ownerHexColors[assignment.owner] : '#334155') }}
        >
          {isMain && <div className="w-full h-full rounded-full opacity-20 absolute inset-0" style={{ backgroundColor: 'var(--color-slate-100)' }}></div>}
          
          {/* Add owner label for drop ports */}
          {!isMain && assignment.owner && assignment.owner !== 'None' && (
            <div className={`absolute ${side === 'left' ? 'right-full mr-3' : 'left-full ml-3'} flex items-center gap-2 bg-slate-800 px-3 py-1.5 rounded-xl shadow-xl border border-slate-700 whitespace-nowrap z-10`}>
              <div className="w-2.5 h-2.5 rounded-full shadow-sm" style={{ backgroundColor: ownerHexColors[assignment.owner] }}></div>
              <span className="text-[10px] font-black text-slate-200 uppercase tracking-widest">{assignment.owner}</span>
            </div>
          )}

          {/* Add route label for main ports */}
          {isMain && assignedRoute && (
            <div className={`absolute ${side === 'left' ? 'right-full mr-3' : 'left-full ml-3'} flex items-center gap-2 bg-slate-800 px-3 py-1.5 rounded-xl shadow-xl border border-slate-700 whitespace-nowrap z-10`}>
              <span className="text-[10px] font-black text-slate-200 uppercase tracking-widest">
                {isDetailView && [1, 2, 6].includes(id) ? 'Fiber Main' : `${assignedRoute.name} (${assignedRoute.capacity}F)`}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

interface SpliceManagerProps {
  enclosure: FiberEnclosure;
  routes: Route[];
  enclosureTypes: EnclosureType[];
  fiberTypes: FiberType[];
  fiberColorConfigs: FiberColorConfig[];
  appUser: AppUser | null;
  onClose: () => void;
  onSplice: (enclosureId: string, routeAId: string, coreAId: number, routeBId: string, coreBId: number) => void;
  onUnsplice: (enclosureId: string, routeId: string, coreId: number) => void;
  onUnspliceAll: (enclosureId: string, routeId: string) => void;
  onUnspliceTube: (enclosureId: string, routeId: string, tubeId: number) => void;
  onSpliceTube: (enclosureId: string, routeAId: string, tubeAIds: number[], routeBId: string, tubeBIds: number[]) => void;
  onUpdateTrayOwner: (enclosureId: string, trayId: number, owner: CoreOwner) => void;
  onUpdateRouteSide?: (enclosureId: string, routeId: string, side: 'left' | 'right' | 'top' | 'bottom') => void;
  onUpdatePortAssignment?: (enclosureId: string, portId: number, data: { owner?: CoreOwner, routeId?: string }) => void;
  onUpdateCore?: (routeId: string, coreId: number, data: Partial<Core>) => void;
  onUpdateEnclosure?: (enclosureId: string, data: Partial<FiberEnclosure>) => void;
  onEditEnclosure?: (enclosure: FiberEnclosure) => void;
  quotaExceeded?: boolean;
}

// Sub-components for better performance and organization
interface SpliceSummaryGroup {
  routeA: Route;
  routeB: Route;
  tubePairs: {
    tubeAId: number;
    tubeBId: number;
    isFullTube: boolean;
    coreSplices: {
      coreA: Core;
      coreB: Core;
    }[];
  }[];
}

const SummaryTab = memo(({ summary }: { summary: SpliceSummaryGroup[] }) => {
  if (summary.length === 0) {
    return (
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center justify-center h-full text-slate-500 p-12 text-center"
      >
        <div className="p-6 bg-slate-800 rounded-3xl mb-6 shadow-xl border border-slate-700">
          <AlertCircle className="w-12 h-12 text-slate-500" />
        </div>
        <p className="text-xl font-black text-slate-200 tracking-tight mb-2">No Splices Found</p>
        <p className="text-sm font-medium text-slate-500">There are no active splices at this enclosure.</p>
      </motion.div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar bg-slate-950/50">
      {summary.map((rp, idx) => (
        <motion.div 
          key={idx}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: idx * 0.1 }}
          className="bg-slate-900 rounded-[32px] overflow-hidden border border-slate-800 shadow-2xl"
        >
          <div className="bg-slate-800/50 backdrop-blur-md px-6 py-5 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-2.5 bg-brand-500/10 text-brand-400 rounded-xl border border-brand-500/20">
                <GitMerge className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-black text-slate-100 tracking-tight font-display flex items-center gap-2">
                <span>{rp.routeA.name}</span>
                {rp.routeA.id === rp.routeB.id ? (
                  <span className="text-[11px] font-bold text-brand-400 bg-brand-500/10 px-2.5 py-0.5 rounded-full border border-brand-500/20">
                    Intra-cable / Loopback (สายเดียวกัน)
                  </span>
                ) : (
                  <>
                    <span className="text-slate-500 mx-2 font-normal">↔</span>
                    <span>{rp.routeB.name}</span>
                  </>
                )}
              </h3>
            </div>
            <span className="text-[10px] font-black bg-slate-800 px-3 py-1.5 rounded-full text-slate-400 uppercase tracking-widest border border-slate-700">
              {rp.tubePairs.length} Connections
            </span>
          </div>
          <div className="p-6 space-y-6">
            {rp.tubePairs.map((tp: any, tIdx: number) => (
              <div key={tIdx} className="rounded-3xl bg-slate-950/50 p-6 border border-slate-800/50 hover:border-slate-700 transition-all">
                {tp.isFullTube ? (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center -space-x-3">
                        <div className="w-10 h-10 rounded-2xl bg-brand-600 text-slate-100 flex items-center justify-center font-black text-xs shadow-lg ring-4 ring-slate-900">T{tp.tubeAId}</div>
                        <div className="w-10 h-10 rounded-2xl bg-brand-500 text-slate-100 flex items-center justify-center font-black text-xs shadow-lg ring-4 ring-slate-900">T{tp.tubeBId}</div>
                      </div>
                      <div>
                        <span className="font-black text-slate-100 text-base tracking-tight">Full Tube Splice</span>
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-0.5">12 Cores Connected</p>
                      </div>
                    </div>
                    <div className="px-4 py-1.5 bg-emerald-900/20 text-emerald-400 text-[10px] font-black rounded-full uppercase tracking-widest border border-emerald-800/50">
                      Complete
                    </div>
                  </div>
                ) : (
                  <div className="space-y-5">
                    <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Partial Connection</span>
                        <span className="w-1.5 h-1.5 bg-slate-700 rounded-full" />
                        <span className="text-xs font-black text-slate-300">Tube {tp.tubeAId} ↔ {tp.tubeBId}</span>
                      </div>
                      <span className="text-[10px] font-black text-brand-400 bg-brand-900/20 px-2 py-1 rounded-lg border border-brand-800/50">{tp.coreSplices.length}/12 Cores</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                      {tp.coreSplices.map((cs: any, cIdx: number) => (
                        <div key={cIdx} className="flex items-center justify-between bg-slate-900 border border-slate-800 p-3 rounded-2xl text-[10px] font-black shadow-sm hover:border-slate-700 transition-all">
                          <div className="flex items-center gap-2.5">
                            <div className="w-3 h-3 rounded-full border border-slate-700 shadow-inner" style={{ backgroundColor: cs.coreA.color }} />
                            <span className="text-slate-300">C{cs.coreA.id}</span>
                          </div>
                          <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                          <div className="flex items-center gap-2.5">
                            <span className="text-slate-300">C{cs.coreB.id}</span>
                            <div className="w-3 h-3 rounded-full border border-slate-700 shadow-inner" style={{ backgroundColor: cs.coreB.color }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </motion.div>
      ))}
    </div>
  );
});

const CoreList = memo(({ 
  route, 
  selectedCore, 
  onSelectCore, 
  selectedTubes, 
  onToggleSelectTube, 
  expandedTubes, 
  onToggleTube, 
  onToggleAllTubes,
  onSelectAllTubes,
  onUnsplice,
  onUnspliceAll,
  onUnspliceTube,
  onEditCore,
  enclosureId,
  routes,
  appUser,
  quotaExceeded
}: { 
  route: Route | undefined, 
  selectedCore: number | null, 
  onSelectCore: (id: number) => void, 
  selectedTubes: number[], 
  onToggleSelectTube: (id: number) => void,
  expandedTubes: Record<string, boolean>,
  onToggleTube: (tubeId: number) => void,
  onToggleAllTubes: (expand: boolean) => void,
  onSelectAllTubes: (tubeIds: number[]) => void,
  onUnsplice: (enclosureId: string, routeId: string, coreId: number) => void,
  onUnspliceAll: (enclosureId: string, routeId: string) => void,
  onUnspliceTube: (enclosureId: string, routeId: string, tubeId: number) => void,
  onEditCore?: (route: Route, core: Core) => void,
  enclosureId: string,
  routes: Route[],
  appUser: AppUser | null,
  quotaExceeded: boolean
}) => {
  if (!route) return (
    <div className="flex flex-col items-center justify-center h-full text-slate-500 py-12">
      <div className="p-4 bg-slate-900 rounded-3xl mb-4 border border-slate-800 shadow-xl">
        <Activity className="w-8 h-8 opacity-50" />
      </div>
      <p className="text-xs font-black uppercase tracking-widest">Select a route</p>
    </div>
  );

  const tubes = useMemo(() => route.cores.reduce((acc, core) => {
    const tubeId = Math.floor((core.id - 1) / 12) + 1;
    if (!acc[tubeId]) acc[tubeId] = [];
    acc[tubeId].push(core);
    return acc;
  }, {} as Record<number, Core[]>), [route.cores]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-between items-center mb-2">
        {(!appUser || appUser.role === 'Admin' || appUser.role === 'Design' || (appUser.owner && route.cores.every(c => c.owner === 'None' || c.owner === appUser.owner))) ? (
          <button 
            onClick={() => onUnspliceAll(enclosureId, route.id)}
            className="text-[10px] px-4 py-2 bg-rose-900/20 hover:bg-rose-900/30 rounded-2xl text-rose-400 font-black border border-rose-800/50 transition-all flex items-center gap-2 uppercase tracking-widest active:scale-95 shadow-lg"
            title="Unsplice all cores in this route"
          >
            <Unlink className="w-3.5 h-3.5" /> Unsplice All
          </button>
        ) : <div />}
        <div className="flex gap-2">
          <button 
            onClick={() => onToggleAllTubes(true)}
            className="text-[10px] px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-2xl text-slate-300 font-black border border-slate-700 uppercase tracking-widest transition-all active:scale-95 shadow-sm"
          >
            Expand
          </button>
          <button 
            onClick={() => onToggleAllTubes(false)}
            className="text-[10px] px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-2xl text-slate-300 font-black border border-slate-700 uppercase tracking-widest transition-all active:scale-95 shadow-sm"
          >
            Collapse
          </button>
          <button 
            onClick={() => {
              const allowedTubeIds = Object.entries(tubes)
                .filter(([_, cores]) => !appUser || appUser.role === 'Admin' || appUser.role === 'Design' || (appUser.owner && (cores.every(c => c.owner === 'None' || c.owner === appUser.owner))))
                .map(([id, _]) => Number(id));
              onSelectAllTubes(allowedTubeIds);
            }}
            className="text-[10px] px-4 py-2 bg-brand-600 hover:bg-brand-700 rounded-2xl text-slate-100 font-black border border-brand-500 uppercase tracking-widest transition-all active:scale-95 shadow-lg shadow-brand-900/20"
          >
            Select All
          </button>
        </div>
      </div>
      
      <div className="space-y-4">
        {Object.entries(tubes).map(([tubeIdStr, tubeCores]) => {
          const cores = tubeCores as Core[];
          const tubeId = parseInt(tubeIdStr);
          const isTubeSelected = selectedTubes.includes(tubeId);
          const selectionIndex = selectedTubes.indexOf(tubeId);
          const isExpanded = expandedTubes[`manage-${route.id}-${tubeId}`];

          const splicedCount = cores.filter(c => !!c.splices?.[enclosureId]).length;
          const isAllSpliced = splicedCount === cores.length;
          const isPartialSpliced = splicedCount > 0 && splicedCount < cores.length;

          const firstOwner = cores[0].owner;
          const tubeOwner = cores.every(c => c.owner === firstOwner) ? firstOwner : 'None';
          const canExpand = !appUser || appUser.role === 'Admin' || appUser.role === 'Design' || (appUser.owner && (tubeOwner === 'None' || tubeOwner === appUser.owner));

          return (
            <motion.div 
              key={tubeId} 
              layout
              className={`border-2 rounded-[32px] overflow-hidden transition-all duration-300 ${
                isTubeSelected 
                  ? 'border-brand-500 bg-brand-900/10 shadow-2xl shadow-brand-900/20' 
                  : isAllSpliced 
                    ? 'border-emerald-900/30 bg-emerald-900/5' 
                    : isPartialSpliced 
                      ? 'border-amber-900/30 bg-amber-900/5' 
                      : 'border-slate-800 bg-slate-900/40'
              } ${!canExpand ? 'opacity-75' : ''}`}
            >
              <div 
                className={`flex items-center justify-between p-4 transition-colors relative ${canExpand ? 'cursor-pointer hover:bg-slate-800/50' : 'cursor-not-allowed bg-slate-900/20'}`}
                onClick={() => {
                  if (!canExpand) return;
                  if (isExpanded) {
                    onToggleTube(tubeId);
                  } else {
                    onToggleSelectTube(tubeId);
                    onSelectCore(-1);
                  }
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  if (!canExpand) return;
                  if (!isExpanded) {
                    onToggleTube(tubeId);
                  }
                }}
              >
                <div className="flex items-center gap-4">
                  <div className={`p-2 rounded-xl transition-colors ${isExpanded ? 'bg-slate-800 text-slate-200' : 'text-slate-500'}`}>
                    {!canExpand ? <Lock className="w-4 h-4 text-slate-500" /> : (isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />)}
                  </div>
                  <div className="relative">
                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-xs font-black shadow-xl border-2 ${
                      isTubeSelected ? 'bg-brand-600 text-slate-100 border-brand-500' : ownerColors[tubeOwner as CoreOwner] || 'bg-slate-800 text-slate-400 border-slate-700'
                    }`}>
                      T{tubeId}
                    </div>
                    {isTubeSelected && (
                      <div className="absolute -top-2 -left-2 w-5 h-5 bg-brand-500 text-slate-100 text-[10px] font-black rounded-full flex items-center justify-center border-2 border-slate-900 shadow-xl z-10">
                        {selectionIndex + 1}
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-black text-sm text-slate-100 tracking-tight font-display">Tube {tubeId}</h3>
                      {!canExpand && <span className="text-[8px] font-black bg-slate-800 text-slate-500 px-2 py-0.5 rounded-lg border border-slate-700 uppercase tracking-widest">Locked</span>}
                    </div>
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-0.5">
                      {splicedCount}/12 Spliced
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  {splicedCount > 0 && (!appUser || appUser.role === 'Admin' || appUser.role === 'Design' || (appUser.owner && tubeOwner === appUser.owner)) && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onUnspliceTube(enclosureId, route.id, tubeId);
                      }}
                      className="p-2 hover:bg-rose-900/20 rounded-xl text-rose-400 transition-all border border-transparent hover:border-rose-800/50"
                      title="Unsplice Tube"
                    >
                      <Unlink className="w-4 h-4" />
                    </button>
                  )}
                  <div className={`w-6 h-6 rounded-full border-2 transition-all flex items-center justify-center ${
                    isTubeSelected ? 'bg-brand-600 border-brand-500' : 'border-slate-700 bg-slate-950'
                  }`}>
                    {isTubeSelected && <div className="w-2.5 h-2.5 rounded-full shadow-sm" style={{ backgroundColor: 'var(--color-slate-100)' }} />}
                  </div>
                </div>
              </div>
              
              <AnimatePresence>
                {isExpanded && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="p-4 pt-0 bg-slate-950/30"
                  >
                    <div className="grid grid-cols-2 gap-3">
                      {cores.map(core => {
                        const isSelected = selectedCore === core.id;
                        const splice = core.splices?.[enclosureId];
                        const isSpliced = !!splice;

                        return (
                          <motion.div
                            key={core.id}
                            whileHover={canExpand ? { y: -2, scale: 1.02 } : {}}
                            whileTap={canExpand ? { scale: 0.98 } : {}}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!canExpand) return;
                              onSelectCore(isSelected ? -1 : core.id);
                              onSelectAllTubes([]);
                            }}
                            className={`flex flex-col p-3.5 rounded-2xl text-[10px] border-2 transition-all ${
                              isSelected 
                                ? 'bg-brand-900/20 border-brand-500 shadow-lg shadow-brand-900/10' 
                                : isSpliced 
                                  ? 'bg-emerald-900/10 border-emerald-900/30' 
                                  : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                            } ${!canExpand ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2.5">
                                <div className="w-3 h-3 rounded-full border border-slate-700 shadow-inner" style={{ backgroundColor: core.color }} />
                                <span className="font-black text-slate-200">C{core.id}</span>
                                {!canExpand && <Lock className="w-2.5 h-2.5 text-slate-500" />}
                                {onEditCore && canExpand && (
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); onEditCore(route, core); }}
                                    className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-500 hover:text-brand-400 transition-colors"
                                    title="Edit Details"
                                  >
                                    <Pencil className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                              {isSpliced && canExpand && (
                                <button 
                                  onClick={(e) => { e.stopPropagation(); onUnsplice(enclosureId, route.id, core.id); }}
                                  className="text-rose-400 hover:text-rose-300 p-1.5 hover:bg-rose-900/20 rounded-xl transition-all border border-transparent hover:border-rose-800/50"
                                  title="Unsplice"
                                >
                                  <Unlink className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                            
                            {isSpliced ? (
                              <div className="flex items-center gap-2 text-emerald-400 font-black">
                                <GitMerge className="w-3.5 h-3.5 opacity-60" />
                                <span className="truncate" title={`Spliced to ${routes.find(r => r.id === splice.routeId)?.name} C${splice.coreId}`}>
                                  {routes.find(r => r.id === splice.routeId)?.name || 'Unknown'} C{splice.coreId}
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-500 font-black uppercase tracking-widest">Available</span>
                            )}
                          </motion.div>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
});

export default function SpliceManager({ enclosure, routes, enclosureTypes, fiberTypes, fiberColorConfigs, appUser, onClose, onSplice, onUnsplice, onUnspliceAll, onUnspliceTube, onSpliceTube, onUpdateTrayOwner, onUpdateRouteSide, onUpdatePortAssignment, onUpdateCore, onUpdateEnclosure, onEditEnclosure, quotaExceeded = false }: SpliceManagerProps) {
  // Find routes that start or end at this enclosure, or pass through it
  const connectedRoutes = useMemo(() => {
    return routes
      .filter(r => {
        if (r.startEnclosureId === enclosure.id || r.endEnclosureId === enclosure.id) return true;
        if (r.path && r.path.length > 0) {
          return r.path.some(p => Math.hypot(p.lat - enclosure.position.lat, p.lng - enclosure.position.lng) < 0.00025);
        }
        return false;
      })
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
  }, [routes, enclosure.id, enclosure.position.lat, enclosure.position.lng]);

  const [routeAId, setRouteAId] = useState<string>(connectedRoutes.length > 0 ? connectedRoutes[0].id : '');
  const [routeBId, setRouteBId] = useState<string>(connectedRoutes.length > 1 ? connectedRoutes[1].id : (connectedRoutes.length > 0 ? connectedRoutes[0].id : ''));
  const [singleCableViewMode, setSingleCableViewMode] = useState<'two-sided' | 'single-sided'>('two-sided');

  useEffect(() => {
    if (connectedRoutes.length > 0) {
      if (!routeAId || !connectedRoutes.some(r => r.id === routeAId)) {
        setRouteAId(connectedRoutes[0].id);
      }
      if (!routeBId || !connectedRoutes.some(r => r.id === routeBId)) {
        setRouteBId(connectedRoutes.length > 1 ? connectedRoutes[1].id : connectedRoutes[0].id);
      }
    }
  }, [connectedRoutes]);

  const [selectedCoreA, setSelectedCoreA] = useState<number | null>(null);
  const [selectedCoreB, setSelectedCoreB] = useState<number | null>(null);

  const [selectedTubesA, setSelectedTubesA] = useState<number[]>([]);
  const [selectedTubesB, setSelectedTubesB] = useState<number[]>([]);

  const [activeTab, setActiveTab] = useState<'manage' | 'summary' | 'diagram' | 'trays' | 'physical' | 'detail'>('detail');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [width, setWidth] = useState(800);
  const [isResizing, setIsResizing] = useState(false);
  const [diagramScale, setDiagramScale] = useState(0.5);
  const [physicalScale, setPhysicalScale] = useState(1);
  const [showDiagramInfo, setShowDiagramInfo] = useState(true);
  const [editingCore, setEditingCore] = useState<{ route: Route, core: Core } | null>(null);
  const [coreEditData, setCoreEditData] = useState<Partial<Core>>({});
  const [isSavingCore, setIsSavingCore] = useState(false);
  const [expandedTubes, setExpandedTubes] = useState<Record<string, boolean>>({});
  const [routeOffsets, setRouteOffsets] = useState<Record<string, number>>(enclosure.routeOffsets || {});
  const [draggingRoute, setDraggingRoute] = useState<string | null>(null);
  const [hasAutoFitted, setHasAutoFitted] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number, y: number } | null>(null);
  const [initialOffset, setInitialOffset] = useState<number>(0);
  const [hoveredCore, setHoveredCore] = useState<{
    routeId: string;
    coreId: number;
    x: number;
    y: number;
  } | null>(null);
  const [hoveredSplice, setHoveredSplice] = useState<{
    splice: any;
    x: number;
    y: number;
  } | null>(null);

  useEffect(() => {
    setHoveredCore(null);
  }, [enclosure.id]);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = window.innerWidth - e.clientX;
      if (newWidth > 400 && newWidth < window.innerWidth * 0.9) {
        setWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  const routeA = useMemo(() => connectedRoutes.find(r => r.id === routeAId), [connectedRoutes, routeAId]);
  const routeB = useMemo(() => connectedRoutes.find(r => r.id === routeBId), [connectedRoutes, routeBId]);

  const permissions = useMemo(() => appUser ? DEFAULT_PERMISSIONS[appUser.role] : DEFAULT_PERMISSIONS['Viewer'], [appUser]);

  const canSpliceCore = useMemo(() => {
    if (!permissions.manageSplices) return false;
    if (!selectedCoreA || !selectedCoreB) return false;
    if (routeAId === routeBId && selectedCoreA === selectedCoreB) return false;
    if (!appUser || appUser.role === 'Admin' || appUser.role === 'Design') return true;
    if (!appUser.owner) return false;
    const coreA = routeA?.cores.find(c => c.id === selectedCoreA);
    const coreB = routeB?.cores.find(c => c.id === selectedCoreB);
    if (!coreA || !coreB) return false;
    const canEditA = coreA.owner === 'None' || coreA.owner === appUser.owner;
    const canEditB = coreB.owner === 'None' || coreB.owner === appUser.owner;
    return canEditA && canEditB;
  }, [appUser, permissions.manageSplices, routeA, selectedCoreA, routeB, selectedCoreB, routeAId, routeBId]);

  const canSpliceTube = useMemo(() => {
    if (!permissions.manageSplices) return false;
    if (selectedTubesA.length === 0 || selectedTubesB.length === 0) return false;
    if (routeAId === routeBId && selectedTubesA.some(t => selectedTubesB.includes(t))) return false;
    if (!appUser || appUser.role === 'Admin' || appUser.role === 'Design') return true;
    if (!appUser.owner) return false;
    
    const count = Math.min(selectedTubesA.length, selectedTubesB.length);
    for (let i = 0; i < count; i++) {
      const tubeAId = selectedTubesA[i];
      const tubeBId = selectedTubesB[i];
      const tubeCoresA = routeA?.cores.filter(c => Math.floor((c.id - 1) / 12) + 1 === tubeAId) || [];
      const tubeCoresB = routeB?.cores.filter(c => Math.floor((c.id - 1) / 12) + 1 === tubeBId) || [];
      
      const canEditA = tubeCoresA.every(c => c.owner === 'None' || c.owner === appUser.owner);
      const canEditB = tubeCoresB.every(c => c.owner === 'None' || c.owner === appUser.owner);
      if (!canEditA || !canEditB) return false;
    }
    return true;
  }, [appUser, permissions.manageSplices, routeA, selectedTubesA, routeB, selectedTubesB, routeAId, routeBId]);

  const handleSpliceCore = useCallback(() => {
    if (!permissions.manageSplices) return;
    if (routeAId && selectedCoreA && routeBId && selectedCoreB) {
      if (routeAId === routeBId && selectedCoreA === selectedCoreB) return;
      onSplice(enclosure.id, routeAId, selectedCoreA, routeBId, selectedCoreB);
      setSelectedCoreA(null);
      setSelectedCoreB(null);
    }
  }, [onSplice, enclosure.id, routeAId, selectedCoreA, routeBId, selectedCoreB, permissions.manageSplices]);

  const handleSpliceTube = useCallback(() => {
    if (!permissions.manageSplices) return;
    if (routeAId && selectedTubesA.length > 0 && routeBId && selectedTubesB.length > 0) {
      if (routeAId === routeBId && selectedTubesA.some(t => selectedTubesB.includes(t))) return;
      // Only splice up to the minimum selected on either side
      const count = Math.min(selectedTubesA.length, selectedTubesB.length);
      onSpliceTube(enclosure.id, routeAId, selectedTubesA.slice(0, count), routeBId, selectedTubesB.slice(0, count));
      setSelectedTubesA([]);
      setSelectedTubesB([]);
    }
  }, [onSpliceTube, enclosure.id, routeAId, selectedTubesA, routeBId, selectedTubesB, permissions.manageSplices]);

  const statusColors: Record<CoreStatus, string> = {
    used: 'bg-brand-50 border-brand-200 text-brand-700',
    bad: 'bg-rose-50 border-rose-200 text-rose-700',
    reserved: 'bg-amber-50 border-amber-200 text-amber-700'
  };

  const priorityColors: Record<CorePriority, string> = {
    Low: 'text-slate-400',
    Medium: 'text-amber-600',
    High: 'text-rose-600 font-black'
  };

  const coreDetails = useMemo(() => {
    if (!hoveredCore) return null;
    const route = routes.find(r => r.id === hoveredCore.routeId);
    const core = route?.cores.find(c => c.id === hoveredCore.coreId);
    if (!route || !core) return null;

    const splice = core.splices?.[enclosure.id];
    let connectedTo = null;
    if (splice) {
      const otherRoute = routes.find(r => r.id === splice.routeId);
      const otherCore = otherRoute?.cores.find(c => c.id === splice.coreId);
      if (otherRoute && otherCore) {
        connectedTo = {
          routeName: otherRoute.name,
          coreId: otherCore.id,
          coreColor: otherCore.color
        };
      }
    }

    return {
      routeName: route.name,
      coreId: core.id,
      coreColor: core.color,
      status: core.status,
      owner: core.owner,
      priority: core.priority,
      details: core.details,
      isSpliced: !!splice,
      connectedTo
    };
  }, [hoveredCore, routes, enclosure.id]);

  const spliceDetails = useMemo(() => {
    if (!hoveredSplice) return null;
    const { splice } = hoveredSplice;
    const cleanIdA = splice.routeAId.replace(/-side[AB]$/, '');
    const cleanIdB = splice.routeBId.replace(/-side[AB]$/, '');
    const routeA = routes.find(r => r.id === splice.routeAId || r.id === cleanIdA);
    const coreA = routeA?.cores.find(c => c.id === splice.coreAId);
    const routeB = routes.find(r => r.id === splice.routeBId || r.id === cleanIdB);
    const coreB = routeB?.cores.find(c => c.id === splice.coreBId);
    
    if (!routeA || !coreA || !routeB || !coreB) return null;
    
    const sideSuffixA = splice.routeAId.endsWith('-sideA') ? ' (Side A - ขาเข้า)' : splice.routeAId.endsWith('-sideB') ? ' (Side B - ขาออก)' : '';
    const sideSuffixB = splice.routeBId.endsWith('-sideA') ? ' (Side A - ขาเข้า)' : splice.routeBId.endsWith('-sideB') ? ' (Side B - ขาออก)' : '';

    return {
      coreA: { ...coreA, routeName: routeA.name + sideSuffixA },
      coreB: { ...coreB, routeName: routeB.name + sideSuffixB }
    };
  }, [hoveredSplice, routes]);

  const spliceSummary = useMemo(() => {
    const pairs = new Map<string, any>();

    connectedRoutes.forEach(route => {
      route.cores.forEach(core => {
        const splice = core.splices?.[enclosure.id];
        if (splice) {
          const rAId = route.id;
          const rBId = splice.routeId;
          const cAId = core.id;
          const cBId = splice.coreId;

          const isAFirst = rAId < rBId || (rAId === rBId && cAId < cBId);
          const key = isAFirst 
            ? `${rAId}:${cAId}-${rBId}:${cBId}`
            : `${rBId}:${cBId}-${rAId}:${cAId}`;

          if (!pairs.has(key)) {
            const rA = isAFirst ? route : routes.find(r => r.id === rBId)!;
            const cA = isAFirst ? core : rA?.cores.find(c => c.id === cBId)!;
            const rB = isAFirst ? routes.find(r => r.id === rBId)! : route;
            const cB = isAFirst ? rB?.cores.find(c => c.id === cBId)! : core;

            if (rA && cA && rB && cB) {
              pairs.set(key, {
                routeA: rA,
                coreA: cA,
                routeB: rB,
                coreB: cB,
                tubeAId: Math.floor((cA.id - 1) / 12) + 1,
                tubeBId: Math.floor((cB.id - 1) / 12) + 1,
              });
            }
          }
        }
      });
    });

    const routePairsMap = new Map<string, any>();

    pairs.forEach(record => {
      const routePairKey = `${record.routeA.id}-${record.routeB.id}`;
      if (!routePairsMap.has(routePairKey)) {
        routePairsMap.set(routePairKey, {
          routeA: record.routeA,
          routeB: record.routeB,
          tubePairsMap: new Map<string, any>()
        });
      }
      
      const rpGroup = routePairsMap.get(routePairKey)!;
      const tubePairKey = `${record.tubeAId}-${record.tubeBId}`;
      
      if (!rpGroup.tubePairsMap.has(tubePairKey)) {
        rpGroup.tubePairsMap.set(tubePairKey, {
          tubeAId: record.tubeAId,
          tubeBId: record.tubeBId,
          coreSplices: []
        });
      }
      
      rpGroup.tubePairsMap.get(tubePairKey).coreSplices.push({
        coreA: record.coreA,
        coreB: record.coreB
      });
    });

    return Array.from(routePairsMap.values()).map(rp => {
      const tubePairs = Array.from(rp.tubePairsMap.values()).map((tp: any) => {
        let isFullTube = false;
        if (tp.coreSplices.length === 12) {
          tp.coreSplices.sort((a: any, b: any) => a.coreA.id - b.coreA.id);
          isFullTube = tp.coreSplices.every((splice: any, index: number) => {
            const expectedCoreAId = (tp.tubeAId - 1) * 12 + 1 + index;
            const expectedCoreBId = (tp.tubeBId - 1) * 12 + 1 + index;
            return splice.coreA.id === expectedCoreAId && splice.coreB.id === expectedCoreBId;
          });
        }
        return { ...tp, isFullTube };
      });
      return { routeA: rp.routeA, routeB: rp.routeB, tubePairs };
    });
  }, [connectedRoutes, routes, enclosure.id]);

  const diagramData = useMemo(() => {
    if (connectedRoutes.length === 0) return null;

    const getRouteSide = (route: Route): 'left' | 'right' | 'top' | 'bottom' => {
      // Check for manual override first
      if (enclosure.routeSideOverrides?.[route.id]) {
        return enclosure.routeSideOverrides[route.id];
      }

      let p1 = enclosure.position;
      let p2: Point | undefined;
      if (route.startEnclosureId === enclosure.id) {
        p2 = route.path[1];
      } else if (route.endEnclosureId === enclosure.id) {
        p2 = route.path[route.path.length - 2];
      } else {
        const idx = route.path.findIndex(p => Math.hypot(p.lat - enclosure.position.lat, p.lng - enclosure.position.lng) < 0.0003);
        if (idx > 0) {
          p2 = route.path[idx - 1];
        } else if (idx === 0 && route.path.length > 1) {
          p2 = route.path[1];
        } else {
          p2 = route.path[0];
        }
      }

      if (!p2) return 'left';
      const dx = p2.lng - p1.lng;
      const dy = p2.lat - p1.lat;
      const angle = Math.atan2(dy, dx) * 180 / Math.PI;
      if (angle >= -45 && angle <= 45) return 'right';
      if (angle > 45 && angle < 135) return 'top';
      if (angle >= 135 || angle <= -135) return 'left';
      return 'bottom';
    };

    const isRoutePassThrough = (route: Route): boolean => {
      // 1. Explicit enclosure IDs
      if (route.startEnclosureId && route.endEnclosureId) {
        if (route.startEnclosureId === enclosure.id && route.endEnclosureId === enclosure.id) {
          return true; // Loop cable
        }
        if (route.startEnclosureId === enclosure.id || route.endEnclosureId === enclosure.id) {
          return false; // Endpoint terminal
        }
        return true; // Mid-span pass-through
      }

      // 2. Check path geometry
      if (route.path && route.path.length > 1) {
        let closestIdx = -1;
        let minDistance = Infinity;
        route.path.forEach((p, idx) => {
          const dist = Math.hypot(p.lat - enclosure.position.lat, p.lng - enclosure.position.lng);
          if (dist < minDistance) {
            minDistance = dist;
            closestIdx = idx;
          }
        });

        if (minDistance < 0.0005 && closestIdx !== -1) {
          // If strictly at first point or last point of path -> Endpoint (1 side)
          if (closestIdx === 0 || closestIdx === route.path.length - 1) {
            return false;
          }
          // If in the middle of path with points before and after -> Pass-through (2 sides)
          return true;
        }
      }

      // 3. Name check "Start - End"
      if (route.name && route.name.includes(' - ')) {
        const parts = route.name.split(' - ').map(s => s.trim().toLowerCase());
        const encName = enclosure.name.toLowerCase();
        if (parts.length === 2) {
          const isStart = encName.includes(parts[0]) || parts[0].includes(encName);
          const isEnd = encName.includes(parts[1]) || parts[1].includes(encName);
          if (isStart && isEnd) return true;
          if (isStart || isEnd) return false;
        }
      }

      return false;
    };

    const isSingleRouteTwoSided = connectedRoutes.length === 1 && isRoutePassThrough(connectedRoutes[0]);

    interface VisualRoute {
      id: string;
      originalRoute: Route;
      side: 'left' | 'right' | 'top' | 'bottom';
      label: string;
      subBadge: string;
      sideKey?: 'sideA' | 'sideB';
    }

    const visualRoutes: VisualRoute[] = [];
    if (isSingleRouteTwoSided) {
      const r = connectedRoutes[0];
      visualRoutes.push({
        id: `${r.id}-sideA`,
        originalRoute: r,
        side: 'left',
        label: r.name,
        subBadge: 'Side A (Inbound / ขาเข้า)',
        sideKey: 'sideA'
      });
      visualRoutes.push({
        id: `${r.id}-sideB`,
        originalRoute: r,
        side: 'right',
        label: r.name,
        subBadge: 'Side B (Outbound / ขาออก)',
        sideKey: 'sideB'
      });
    } else {
      connectedRoutes.forEach(route => {
        visualRoutes.push({
          id: route.id,
          originalRoute: route,
          side: getRouteSide(route),
          label: route.name,
          subBadge: '',
        });
      });
    }

    const visualRouteSides = new Map<string, 'left' | 'right' | 'top' | 'bottom'>();
    visualRoutes.forEach(vr => visualRouteSides.set(vr.id, vr.side));

    const getRenderItems = (vr: VisualRoute) => {
      const items: any[] = [];
      const route = vr.originalRoute;
      const tubes = route.cores.reduce((acc, core) => {
        const tubeId = Math.floor((core.id - 1) / 12) + 1;
        if (!acc[tubeId]) acc[tubeId] = [];
        acc[tubeId].push(core);
        return acc;
      }, {} as Record<number, Core[]>);

      const sortedTubeIds = Object.keys(tubes).map(Number).sort((a, b) => a - b);
      sortedTubeIds.forEach(tubeId => {
        const cores = tubes[tubeId];
        const isExpanded = expandedTubes[`diagram-${vr.id}-${tubeId}`] ?? expandedTubes[`diagram-${route.id}-${tubeId}`];
        const firstOwner = cores[0].owner;
        const tubeOwner = cores.every(c => c.owner === firstOwner) ? firstOwner : 'None';

        if (!isExpanded) {
          items.push({ 
            type: 'tube', 
            route, 
            visualRouteId: vr.id, 
            tubeId, 
            id: `tube-${tubeId}`, 
            color: cores[0].color, 
            owner: tubeOwner 
          });
        } else {
          items.push({ 
            type: 'tube-header', 
            route, 
            visualRouteId: vr.id, 
            tubeId, 
            id: `tube-header-${tubeId}`, 
            owner: tubeOwner 
          });
          cores.forEach(core => {
            items.push({ 
              type: 'core', 
              route, 
              visualRouteId: vr.id, 
              tubeId, 
              core, 
              id: `core-${core.id}`, 
              color: core.color, 
              owner: core.owner 
            });
          });
        }
      });
      return items;
    };

    const sides = { left: [], right: [], top: [], bottom: [] } as Record<string, any[]>;
    visualRoutes.forEach(vr => {
      sides[vr.side].push(...getRenderItems(vr));
    });

    const allSplices: any[] = [];
    const processedSplices = new Set<string>();

    if (isSingleRouteTwoSided) {
      const route = connectedRoutes[0];
      const sideAId = `${route.id}-sideA`;
      const sideBId = `${route.id}-sideB`;

      const explicitSplicedCores = new Set<number>();

      // 1. Explicit splices (e.g. loops between coreA and coreB on the same route)
      route.cores.forEach(coreA => {
        const splice = coreA.splices?.[enclosure.id];
        if (splice && splice.routeId === route.id) {
          explicitSplicedCores.add(coreA.id);
          explicitSplicedCores.add(splice.coreId);
          const minCore = Math.min(coreA.id, splice.coreId);
          const maxCore = Math.max(coreA.id, splice.coreId);
          const key = `${minCore}-${maxCore}`;
          if (!processedSplices.has(key)) {
            processedSplices.add(key);
            allSplices.push({
              routeAId: sideAId,
              coreAId: coreA.id,
              routeBId: sideBId,
              coreBId: splice.coreId,
              isPassThrough: false
            });
          }
        }
      });

      // 2. All remaining continuous pass-through cores of the same cable connect straight across!
      route.cores.forEach(core => {
        if (!explicitSplicedCores.has(core.id)) {
          const key = `pt-${core.id}`;
          if (!processedSplices.has(key)) {
            processedSplices.add(key);
            allSplices.push({
              routeAId: sideAId,
              coreAId: core.id,
              routeBId: sideBId,
              coreBId: core.id,
              isPassThrough: true
            });
          }
        }
      });
    } else {
      connectedRoutes.forEach((routeA, aIdx) => {
        routeA.cores.forEach(coreA => {
          const splice = coreA.splices?.[enclosure.id];
          if (splice) {
            const routeBIdx = connectedRoutes.findIndex(r => r.id === splice.routeId);
            if (routeBIdx !== -1) {
              const minIdx = Math.min(aIdx, routeBIdx);
              const maxIdx = Math.max(aIdx, routeBIdx);
              let minCore: number;
              let maxCore: number;
              if (minIdx === maxIdx) {
                minCore = Math.min(coreA.id, splice.coreId);
                maxCore = Math.max(coreA.id, splice.coreId);
              } else {
                minCore = minIdx === aIdx ? coreA.id : splice.coreId;
                maxCore = minIdx === aIdx ? splice.coreId : coreA.id;
              }
              const key = `${minIdx}-${minCore}-${maxIdx}-${maxCore}`;
              if (!processedSplices.has(key)) {
                processedSplices.add(key);
                allSplices.push({
                  routeAId: connectedRoutes[minIdx].id,
                  coreAId: minCore,
                  routeBId: connectedRoutes[maxIdx].id,
                  coreBId: maxCore
                });
              }
            }
          }
        });
      });
    }

    const SPACING = 48;
    const PADDING = 60;
    const OUTSIDE_DIST = 90;

    const N_L = sides.left.length;
    const N_R = sides.right.length;
    const N_T = sides.top.length;
    const N_B = sides.bottom.length;

    const N_H = Math.max(N_L, N_R);
    const N_V = Math.max(N_T, N_B);

    const lrUniquePairs = new Set<string>();
    const tbUniquePairs = new Set<string>();
    const sameSideLeftUniquePairs = new Set<string>();
    const sameSideRightUniquePairs = new Set<string>();
    const sameSideTopUniquePairs = new Set<string>();
    const sameSideBottomUniquePairs = new Set<string>();

    const getVisualIdForCore = (visualRouteId: string, coreId: number) => {
      const tubeId = Math.floor((coreId - 1) / 12) + 1;
      const cleanRouteId = visualRouteId.replace(/-side[AB]$/, '');
      const isExpanded = expandedTubes[`diagram-${visualRouteId}-${tubeId}`] ?? expandedTubes[`diagram-${cleanRouteId}-${tubeId}`];
      return !isExpanded ? `${visualRouteId}-tube-${tubeId}` : `${visualRouteId}-core-${coreId}`;
    };

    allSplices.forEach(s => {
      const sideA = visualRouteSides.get(s.routeAId);
      const sideB = visualRouteSides.get(s.routeBId);
      const idA = getVisualIdForCore(s.routeAId, s.coreAId);
      const idB = getVisualIdForCore(s.routeBId, s.coreBId);
      
      if ((sideA === 'left' && sideB === 'right') || (sideA === 'right' && sideB === 'left')) {
        const leftId = sideA === 'left' ? idA : idB;
        const rightId = sideA === 'right' ? idA : idB;
        const cleanLeft = leftId.replace(/^[^-]+-/, '');
        const cleanRight = rightId.replace(/^[^-]+-/, '');
        if (cleanLeft !== cleanRight) {
          lrUniquePairs.add(`${leftId},${rightId}`);
        }
      } else if ((sideA === 'top' && sideB === 'bottom') || (sideA === 'bottom' && sideB === 'top')) {
        const topId = sideA === 'top' ? idA : idB;
        const bottomId = sideA === 'bottom' ? idA : idB;
        const cleanTop = topId.replace(/^[^-]+-/, '');
        const cleanBottom = bottomId.replace(/^[^-]+-/, '');
        if (cleanTop !== cleanBottom) {
          tbUniquePairs.add(`${topId},${bottomId}`);
        }
      } else if (sideA === 'left' && sideB === 'left') {
        sameSideLeftUniquePairs.add([idA, idB].sort().join(','));
      } else if (sideA === 'right' && sideB === 'right') {
        sameSideRightUniquePairs.add([idA, idB].sort().join(','));
      } else if (sideA === 'top' && sideB === 'top') {
        sameSideTopUniquePairs.add([idA, idB].sort().join(','));
      } else if (sideA === 'bottom' && sideB === 'bottom') {
        sameSideBottomUniquePairs.add([idA, idB].sort().join(','));
      }
    });

    const TRACK_SPACING = 32;
    const BW = Math.max(
      N_V * SPACING + PADDING * 2, 
      380, 
      Math.min(lrUniquePairs.size * TRACK_SPACING, 400) + (Math.max(sameSideLeftUniquePairs.size, sameSideRightUniquePairs.size) * TRACK_SPACING + PADDING) * 2
    );
    const BH = Math.max(
      N_H * SPACING + PADDING * 2, 
      260, 
      Math.min(tbUniquePairs.size * TRACK_SPACING, 400) + (Math.max(sameSideTopUniquePairs.size, sameSideBottomUniquePairs.size) * TRACK_SPACING + PADDING) * 2
    );

    const MARGIN_LEFT = sides.left.length > 0 ? 420 : 60;
    const MARGIN_RIGHT = sides.right.length > 0 ? 420 : 60;
    const MARGIN_TOP = sides.top.length > 0 ? 220 : 60;
    const MARGIN_BOTTOM = sides.bottom.length > 0 ? 220 : 60;

    const totalWidth = BW + MARGIN_LEFT + MARGIN_RIGHT;
    const totalHeight = BH + MARGIN_TOP + MARGIN_BOTTOM;

    const boxLeft = MARGIN_LEFT;
    const boxRight = MARGIN_LEFT + BW;
    const boxTop = MARGIN_TOP;
    const boxBottom = MARGIN_TOP + BH;

    const CX = (boxLeft + boxRight) / 2;
    const CY = (boxTop + boxBottom) / 2;

    const itemCoords = new Map<string, number>();
    
    const startL = CY - (N_L - 1) * SPACING / 2;
    sides.left.forEach((item, i) => itemCoords.set(`${item.visualRouteId}-${item.id}`, startL + i * SPACING));
    
    const startR = CY - (N_R - 1) * SPACING / 2;
    sides.right.forEach((item, i) => itemCoords.set(`${item.visualRouteId}-${item.id}`, startR + i * SPACING));

    const startT = CX - (N_T - 1) * SPACING / 2;
    sides.top.forEach((item, i) => itemCoords.set(`${item.visualRouteId}-${item.id}`, startT + i * SPACING));
    
    const startB = CX - (N_B - 1) * SPACING / 2;
    sides.bottom.forEach((item, i) => itemCoords.set(`${item.visualRouteId}-${item.id}`, startB + i * SPACING));

    return {
      connectedRoutes,
      visualRoutes,
      visualRouteSides,
      routeSides: visualRouteSides,
      sides,
      allSplices,
      isSingleRouteTwoSided,
      SPACING,
      PADDING,
      OUTSIDE_DIST,
      BW,
      BH,
      boxLeft,
      boxRight,
      boxTop,
      boxBottom,
      totalWidth,
      totalHeight,
      CX,
      CY,
      itemCoords
    };
  }, [connectedRoutes, expandedTubes, enclosure.id, enclosure.position.lat, enclosure.position.lng, enclosure.name, enclosure.routeSideOverrides, routes]);

  const onToggleTube = useCallback((routeId: string, tubeId: number) => {
    setExpandedTubes(prev => ({
      ...prev,
      [`manage-${routeId}-${tubeId}`]: !prev[`manage-${routeId}-${tubeId}`]
    }));
  }, []);

  const onToggleAllTubes = useCallback((routeId: string, capacity: number, expand: boolean) => {
    const newExpanded = { ...expandedTubes };
    const numTubes = Math.ceil(capacity / 12);
    for (let t = 1; t <= numTubes; t++) {
      newExpanded[`manage-${routeId}-${t}`] = expand;
    }
    setExpandedTubes(newExpanded);
  }, [expandedTubes]);

  const enclosureType = useMemo(() => enclosureTypes.find(t => t.id === enclosure.enclosureTypeId), [enclosureTypes, enclosure.enclosureTypeId]);
  const numTrays = enclosureType?.spliceTrays || 1;
  const trayAssignments = enclosure.trayAssignments || {};

  const handleUpdateTrayOwner = (trayId: number, owner: CoreOwner) => {
    onUpdateTrayOwner(enclosure.id, trayId, owner);
  };

  const renderSummary = () => {
    if (spliceSummary.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-slate-500 p-8 text-center">
          <AlertCircle className="w-12 h-12 mb-4 opacity-50" />
          <p className="text-lg font-black text-slate-300 mb-2">No Splices Found</p>
          <p className="text-sm font-medium text-slate-500">There are no active splices at this node.</p>
        </div>
      );
    }

    return <SummaryTab summary={spliceSummary} />;
  };

  const renderTrays = () => {
    const trayIds = Array.from({ length: numTrays }, (_, i) => i + 1).reverse();
    return (
      <div className="p-6 grid grid-cols-1 gap-4 overflow-y-auto h-full bg-slate-950/50 custom-scrollbar max-w-3xl mx-auto w-full">
        {!permissions.viewSpliceTrays && (
          <div className="flex flex-col items-center justify-center p-12 bg-slate-900 rounded-3xl border-2 border-dashed border-slate-800">
            <ShieldAlert className="w-12 h-12 text-amber-500 mb-4 opacity-50" />
            <p className="text-sm font-black text-slate-400 uppercase tracking-widest">Access Denied</p>
            <p className="text-xs text-slate-500 mt-1">You do not have permission to view splice trays.</p>
          </div>
        )}
        {permissions.viewSpliceTrays && trayIds.map((trayId, i) => {
          const owner = trayAssignments[trayId] || 'None';
          const canEditTray = permissions.editSpliceTrays && (!appUser || appUser.role === 'Admin' || appUser.role === 'Design' || (appUser.owner && (owner === 'None' || owner === appUser.owner)));
          return (
            <motion.div 
              key={trayId} 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.02 }}
              className="flex items-center justify-between p-4 bg-slate-900 rounded-2xl border border-slate-800 shadow-sm hover:shadow-md transition-all group"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center border border-slate-700 group-hover:bg-brand-900/20 group-hover:border-brand-800 transition-colors">
                  <Layers className="w-5 h-5 text-slate-500 group-hover:text-brand-400 transition-colors" />
                </div>
                <div>
                  <span className="text-sm font-black text-slate-200 tracking-tight">Splice Tray {trayId}</span>
                </div>
              </div>
              
              <div className="relative">
                <select
                  disabled={!canEditTray || quotaExceeded}
                  className={`text-[10px] font-black uppercase tracking-widest border-2 rounded-xl px-4 py-2 focus:ring-2 focus:ring-brand-500 focus:bg-slate-900 outline-none shadow-inner cursor-pointer appearance-none pr-10 transition-all ${
                    owner !== 'None' 
                      ? ownerColors[owner as CoreOwner] 
                      : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600'
                  } ${(!canEditTray || quotaExceeded) ? 'opacity-50 cursor-not-allowed' : ''}`}
                  value={owner}
                  onChange={(e) => handleUpdateTrayOwner(trayId, e.target.value as CoreOwner)}
                >
                  <option value="None">None</option>
                  {['ITEL', 'SYMC', 'UIH'].map(o => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
                <div className={`absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none ${owner !== 'None' ? 'text-current opacity-70' : 'text-slate-500'}`}>
                  <ChevronDown className="w-3.5 h-3.5" />
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    );
  };

  const handleAutoFit = useCallback(() => {
    if (!diagramData) return;
    const container = document.getElementById('diagram-container');
    if (!container) return;

    const { totalWidth, totalHeight } = diagramData;
    const padding = 60;
    const scaleX = (container.clientWidth - padding) / totalWidth;
    const scaleY = (container.clientHeight - padding) / totalHeight;
    const newScale = Math.min(scaleX, scaleY, 1);
    setDiagramScale(Math.max(0.1, Number(newScale.toFixed(2))));
  }, [diagramData]);

  useEffect(() => {
    if (activeTab === 'diagram') {
      const timer = setTimeout(() => {
        handleAutoFit();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [activeTab, handleAutoFit, connectedRoutes.length]);

  const handlePhysicalAutoFit = useCallback(() => {
    const container = document.getElementById('physical-container');
    if (!container) return;

    // The physical enclosure is roughly 800x400 with labels
    const totalWidth = 1200;
    const totalHeight = 600;
    const padding = 60;
    const scaleX = (container.clientWidth - padding) / totalWidth;
    const scaleY = (container.clientHeight - padding) / totalHeight;
    const newScale = Math.min(scaleX, scaleY, 1.5);
    setPhysicalScale(Math.max(0.1, newScale));
  }, []);

  const [isExporting, setIsExporting] = useState(false);

  const handleExportPDF = async () => {
    const element = document.getElementById('diagram-content');
    if (!element) return;

    setIsExporting(true);
    try {
      // Small delay to ensure any UI changes are reflected
      await new Promise(resolve => setTimeout(resolve, 500));

      // Use html-to-image for better compatibility with modern CSS colors
      const isLightMode = typeof document !== 'undefined' && document.documentElement.classList.contains('light-theme');
      const dataUrl = await toPng(element, {
        quality: 1,
        pixelRatio: 2,
        backgroundColor: isLightMode ? '#f8fafc' : '#020617',
        style: {
          transform: 'none',
        }
      });

      const pdf = new jsPDF({
        orientation: element.offsetWidth > element.offsetHeight ? 'landscape' : 'portrait',
        unit: 'px',
        format: [element.offsetWidth * 2, element.offsetHeight * 2]
      });

      pdf.addImage(dataUrl, 'PNG', 0, 0, element.offsetWidth * 2, element.offsetHeight * 2);
      pdf.save(`diagram-${enclosure.name}-${new Date().toISOString().split('T')[0]}.pdf`);
      console.log('Export successful');
    } catch (error) {
      console.error('Export failed:', error);
      alert(`Export failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsExporting(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'diagram' && !hasAutoFitted) {
      // Small delay to ensure container is rendered
      setTimeout(() => {
        handleAutoFit();
        setHasAutoFitted(true);
      }, 100);
    } else if (activeTab === 'physical') {
      setTimeout(handlePhysicalAutoFit, 100);
    }
  }, [activeTab, handleAutoFit, handlePhysicalAutoFit, hasAutoFitted]);

  const handleSaveCore = async () => {
    if (!editingCore || !onUpdateCore) return;
    setIsSavingCore(true);
    try {
      const newHistoryEntry = {
        id: Date.now().toString(),
        action: 'Updated Core (from Splice Manager)',
        description: `Status: ${coreEditData.status}, Owner: ${coreEditData.owner}, Priority: ${coreEditData.priority}`,
        user: appUser?.email || 'Unknown',
        date: new Date().toISOString()
      };
      const updatedHistory = [...(editingCore.core.history || []), newHistoryEntry];
      await onUpdateCore(editingCore.route.id, editingCore.core.id, { ...coreEditData, history: updatedHistory });
      setEditingCore(null);
    } catch (error) {
      console.error('Error saving core:', error);
    } finally {
      setIsSavingCore(false);
    }
  };

  const renderPhysical = () => {
    return (
      <div className="flex flex-col h-full bg-slate-950 relative">
        <div className="absolute top-6 left-6 z-20 flex items-center gap-2">
          <button 
            onClick={handlePhysicalAutoFit}
            className="text-[10px] px-3 py-1.5 bg-slate-800 border border-slate-700 hover:border-brand-500 hover:text-brand-400 rounded-xl text-slate-300 font-black uppercase tracking-widest transition-all shadow-lg"
            title="Fit diagram to screen"
          >
            Auto Fit
          </button>
          <div className="flex items-center gap-1 bg-slate-800 border border-slate-700 rounded-xl p-1 shadow-lg ml-2">
            <button 
              onClick={() => setPhysicalScale(prev => Math.max(0.1, prev - 0.1))}
              className="p-1.5 hover:bg-slate-700 rounded-lg text-slate-400 transition-all active:scale-90"
              title="Zoom Out"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <span className="text-[10px] font-black text-slate-500 w-10 text-center uppercase tracking-widest">
              {Math.round(physicalScale * 100)}%
            </span>
            <button 
              onClick={() => setPhysicalScale(prev => Math.min(2, prev + 0.1))}
              className="p-1.5 hover:bg-slate-700 rounded-lg text-slate-400 transition-all active:scale-90"
              title="Zoom In"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div id="physical-container" className="flex-1 overflow-auto custom-scrollbar flex p-8">
          <div style={{ width: 1200 * physicalScale, height: 600 * physicalScale, position: 'relative', flexShrink: 0, margin: 'auto', transition: 'all 0.2s ease-out' }}>
            <div style={{ width: 1200, height: 600, transform: `scale(${physicalScale})`, transformOrigin: 'top left', position: 'absolute', top: 0, left: 0 }}>
              <div style={{ position: 'absolute', left: (1200 - 500) / 2, top: (600 - 256) / 2, width: 500, height: 256 }}>
                <div className="relative w-[448px] h-[192px] mt-8 mx-auto">
                <div className="w-full h-full bg-slate-800 rounded-[40px] shadow-xl border-[5px] border-slate-700 flex items-center justify-center relative">
                  {/* Inner tray */}
                  <div className="w-[288px] h-[128px] bg-slate-100 rounded-[24px] shadow-inner flex items-center justify-center border-[2px] border-slate-300 relative overflow-hidden" style={{ backgroundColor: 'var(--color-slate-100)', borderColor: 'var(--color-slate-300)' }}>
                    <div className="w-[192px] h-[90px] bg-slate-800 rounded-xl shadow-sm border border-slate-700 flex flex-col items-center justify-center gap-1.5" style={{ backgroundColor: 'var(--color-slate-800)', borderColor: 'var(--color-slate-700)' }}>
                      <div className="w-28 h-2 bg-slate-200 rounded-full"></div>
                      <div className="w-28 h-2 bg-slate-200 rounded-full"></div>
                      <div className="w-28 h-2 bg-slate-200 rounded-full"></div>
                      <div className="w-28 h-2 bg-slate-200 rounded-full"></div>
                    </div>
                  </div>

                  {/* Ports Left */}
                  <div className="absolute -left-8 top-0 bottom-0 flex flex-col justify-evenly py-6">
                    <PortNode id={1} type="main" enclosure={enclosure} connectedRoutes={connectedRoutes} fiberTypes={fiberTypes} fiberColorConfigs={fiberColorConfigs} onUpdate={onUpdatePortAssignment!} side="left" appUser={appUser} />
                    <PortNode id={3} type="drop" enclosure={enclosure} connectedRoutes={connectedRoutes} fiberTypes={fiberTypes} fiberColorConfigs={fiberColorConfigs} onUpdate={onUpdatePortAssignment!} side="left" appUser={appUser} />
                    <PortNode id={5} type="drop" enclosure={enclosure} connectedRoutes={connectedRoutes} fiberTypes={fiberTypes} fiberColorConfigs={fiberColorConfigs} onUpdate={onUpdatePortAssignment!} side="left" appUser={appUser} />
                  </div>

                  {/* Ports Right */}
                  <div className="absolute -right-8 top-0 bottom-0 flex flex-col justify-evenly py-6">
                    <PortNode id={2} type="main" enclosure={enclosure} connectedRoutes={connectedRoutes} fiberTypes={fiberTypes} fiberColorConfigs={fiberColorConfigs} onUpdate={onUpdatePortAssignment!} side="right" appUser={appUser} />
                    <PortNode id={4} type="drop" enclosure={enclosure} connectedRoutes={connectedRoutes} fiberTypes={fiberTypes} fiberColorConfigs={fiberColorConfigs} onUpdate={onUpdatePortAssignment!} side="right" appUser={appUser} />
                    <PortNode id={6} type="main" enclosure={enclosure} connectedRoutes={connectedRoutes} fiberTypes={fiberTypes} fiberColorConfigs={fiberColorConfigs} onUpdate={onUpdatePortAssignment!} side="right" appUser={appUser} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      </div>
    );
  };

  const renderDiagram = () => {
    if (!diagramData || diagramData.connectedRoutes.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-slate-500 p-12 text-center">
          <div className="w-16 h-16 bg-slate-900 rounded-3xl mb-4 flex items-center justify-center border border-slate-800 shadow-xl">
            <Network className="w-8 h-8 text-slate-500" />
          </div>
          <p className="text-base font-black text-slate-200 mb-1">No Routes Connected</p>
          <p className="text-xs text-slate-500">Connect a fiber optic cable to this enclosure on the map to view the schematic diagram.</p>
        </div>
      );
    }

    const {
      connectedRoutes,
      visualRoutes,
      visualRouteSides,
      routeSides,
      sides,
      allSplices,
      isSingleRouteTwoSided,
      SPACING,
      PADDING,
      OUTSIDE_DIST,
      BW,
      BH,
      boxLeft: dataBoxLeft,
      boxRight: dataBoxRight,
      boxTop: dataBoxTop,
      boxBottom: dataBoxBottom,
      totalWidth,
      totalHeight,
      CX,
      CY,
      itemCoords
    } = diagramData;

    const getCoordForCore = (routeIdOrVisualId: string, coreId: number) => {
      const tubeId = Math.floor((coreId - 1) / 12) + 1;
      const cleanRouteId = routeIdOrVisualId.replace(/-side[AB]$/, '');
      const isExpanded = expandedTubes[`diagram-${routeIdOrVisualId}-${tubeId}`] ?? expandedTubes[`diagram-${cleanRouteId}-${tubeId}`];
      let coord;
      if (!isExpanded) {
        coord = itemCoords.get(`${routeIdOrVisualId}-tube-${tubeId}`) ?? itemCoords.get(`${cleanRouteId}-tube-${tubeId}`);
      } else {
        coord = itemCoords.get(`${routeIdOrVisualId}-core-${coreId}`) ?? itemCoords.get(`${cleanRouteId}-core-${coreId}`);
      }
      const offset = routeOffsets[routeIdOrVisualId] || routeOffsets[cleanRouteId] || 0;
      return coord !== undefined ? coord + offset : undefined;
    };

    let boxMinY = dataBoxTop;
    let boxMaxY = dataBoxBottom;
    let boxMinX = dataBoxLeft;
    let boxMaxX = dataBoxRight;

    const updateY = (item: any) => {
      const visualRouteId = item.visualRouteId || item.route.id;
      const baseCoord = itemCoords.get(`${visualRouteId}-${item.id}`);
      if (baseCoord !== undefined) {
        const offset = routeOffsets[visualRouteId] || routeOffsets[item.route.id] || 0;
        const coord = baseCoord + offset;
        boxMinY = Math.min(boxMinY, coord - PADDING);
        boxMaxY = Math.max(boxMaxY, coord + PADDING);
      }
    };

    const updateX = (item: any) => {
      const visualRouteId = item.visualRouteId || item.route.id;
      const baseCoord = itemCoords.get(`${visualRouteId}-${item.id}`);
      if (baseCoord !== undefined) {
        const offset = routeOffsets[visualRouteId] || routeOffsets[item.route.id] || 0;
        const coord = baseCoord + offset;
        boxMinX = Math.min(boxMinX, coord - PADDING);
        boxMaxX = Math.max(boxMaxX, coord + PADDING);
      }
    };

    sides.left.forEach(updateY);
    sides.right.forEach(updateY);
    sides.top.forEach(updateX);
    sides.bottom.forEach(updateX);

    const boxLeft = boxMinX;
    const boxRight = boxMaxX;
    const boxTop = boxMinY;
    const boxBottom = boxMaxY;
    const dynamicBW = boxMaxX - boxMinX;
    const dynamicBH = boxMaxY - boxMinY;

    return (
      <div id="diagram-container" className="bg-slate-950 p-8 relative w-full h-full overflow-auto custom-scrollbar">
        <div style={{ width: totalWidth * diagramScale, height: totalHeight * diagramScale, position: 'relative', margin: '0 auto' }}>
          <div id="diagram-content" className="relative" style={{ width: totalWidth, height: totalHeight, transform: `scale(${diagramScale})`, transformOrigin: 'top left', position: 'absolute', top: 0, left: 0 }}>
            {/* SVG Overlay */}
            <svg 
              className="absolute inset-0 z-0" 
              style={{ width: totalWidth, height: totalHeight, overflow: 'visible' }}
              onClick={() => setHoveredCore(null)}
            >
            {/* Box (Enclosure) */}
            <rect 
              x={boxLeft} 
              y={boxTop} 
              width={dynamicBW} 
              height={dynamicBH} 
              rx="24"
              className="diagram-box-rect"
              fill="var(--color-slate-900)" 
              fillOpacity="0.6"
              stroke="var(--color-brand-500)" 
              strokeWidth="3" 
              strokeDasharray="8 4"
              style={{ pointerEvents: 'none' }} 
            />
            <text 
              x={boxLeft + 15} 
              y={boxTop + 25} 
              textAnchor="start" 
              dominantBaseline="middle"
              className="diagram-box-label text-[12px] font-black fill-slate-500 uppercase tracking-[0.2em]"
              style={{ pointerEvents: 'none' }}
            >
              SPLICE NODE
            </text>

            {/* Unspliced Lines */}
            {visualRoutes.map(vr => {
              const side = vr.side;
              const route = vr.originalRoute;
              return route.cores.map(core => {
                const coord = getCoordForCore(vr.id, core.id);
                if (coord === undefined) return null;

                const isSpliced = allSplices.some(s => 
                  (s.routeAId === vr.id && s.coreAId === core.id) ||
                  (s.routeBId === vr.id && s.coreBId === core.id)
                );
                if (isSpliced) return null; // Spliced lines are drawn in allSplices

                let startX, startY, entryX, entryY;

                if (side === 'left') {
                  startX = boxLeft - OUTSIDE_DIST; startY = coord;
                  entryX = boxLeft; entryY = coord;
                } else if (side === 'right') {
                  startX = boxRight + OUTSIDE_DIST; startY = coord;
                  entryX = boxRight; entryY = coord;
                } else if (side === 'top') {
                  startX = coord; startY = boxTop - OUTSIDE_DIST;
                  entryX = coord; entryY = boxTop;
                } else if (side === 'bottom') {
                  startX = coord; startY = boxBottom + OUTSIDE_DIST;
                  entryX = coord; entryY = boxBottom;
                } else {
                  return null;
                }

                let pathD = `M ${startX} ${startY} L ${entryX} ${entryY}`;
                if (side === 'left') pathD += ` L ${entryX + PADDING/2} ${entryY}`;
                if (side === 'right') pathD += ` L ${entryX - PADDING/2} ${entryY}`;
                if (side === 'top') pathD += ` L ${entryX} ${entryY + PADDING/2}`;
                if (side === 'bottom') pathD += ` L ${entryX} ${entryY - PADDING/2}`;

                return (
                  <path 
                    key={`unspliced-${route.id}-${core.id}`}
                    d={pathD} 
                    stroke={ownerHexColors[core.owner] || core.color || '#005577'} 
                    strokeWidth="2.5" 
                    strokeLinecap="round"
                    fill="none" 
                    className="cursor-pointer hover:stroke-[5px] transition-all opacity-40 hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      setHoveredCore({ routeId: route.id, coreId: core.id, x: e.clientX, y: e.clientY });
                    }}
                  />
                );
              });
            })}

            {/* Spliced Lines and Dots */}
            {(() => {
              const lrSplices = allSplices.filter(s => {
                const sideA = routeSides.get(s.routeAId);
                const sideB = routeSides.get(s.routeBId);
                return (sideA === 'left' && sideB === 'right') || (sideA === 'right' && sideB === 'left');
              }).sort((a, b) => {
                const yA = routeSides.get(a.routeAId) === 'left' ? getCoordForCore(a.routeAId, a.coreAId) : getCoordForCore(a.routeBId, a.coreBId);
                const yB = routeSides.get(b.routeAId) === 'left' ? getCoordForCore(b.routeAId, b.coreAId) : getCoordForCore(b.routeBId, b.coreBId);
                return (yA || 0) - (yB || 0);
              });

              const tbSplices = allSplices.filter(s => {
                const sideA = routeSides.get(s.routeAId);
                const sideB = routeSides.get(s.routeBId);
                return (sideA === 'top' && sideB === 'bottom') || (sideA === 'bottom' && sideB === 'top');
              }).sort((a, b) => {
                const xA = routeSides.get(a.routeAId) === 'top' ? getCoordForCore(a.routeAId, a.coreAId) : getCoordForCore(a.routeBId, a.coreBId);
                const xB = routeSides.get(b.routeAId) === 'top' ? getCoordForCore(b.routeAId, b.coreAId) : getCoordForCore(b.routeBId, b.coreBId);
                return (xA || 0) - (xB || 0);
              });

              const sameSideLeftSplices = allSplices.filter(s => routeSides.get(s.routeAId) === 'left' && routeSides.get(s.routeBId) === 'left')
                .sort((a, b) => Math.abs((getCoordForCore(a.routeAId, a.coreAId) || 0) - (getCoordForCore(a.routeBId, a.coreBId) || 0)) - Math.abs((getCoordForCore(b.routeAId, b.coreAId) || 0) - (getCoordForCore(b.routeBId, b.coreBId) || 0)));
              const sameSideRightSplices = allSplices.filter(s => routeSides.get(s.routeAId) === 'right' && routeSides.get(s.routeBId) === 'right')
                .sort((a, b) => Math.abs((getCoordForCore(a.routeAId, a.coreAId) || 0) - (getCoordForCore(a.routeBId, a.coreBId) || 0)) - Math.abs((getCoordForCore(b.routeAId, b.coreAId) || 0) - (getCoordForCore(b.routeBId, b.coreBId) || 0)));
              const sameSideTopSplices = allSplices.filter(s => routeSides.get(s.routeAId) === 'top' && routeSides.get(s.routeBId) === 'top')
                .sort((a, b) => Math.abs((getCoordForCore(a.routeAId, a.coreAId) || 0) - (getCoordForCore(a.routeBId, a.coreBId) || 0)) - Math.abs((getCoordForCore(b.routeAId, b.coreAId) || 0) - (getCoordForCore(b.routeBId, b.coreBId) || 0)));
              const sameSideBottomSplices = allSplices.filter(s => routeSides.get(s.routeAId) === 'bottom' && routeSides.get(s.routeBId) === 'bottom')
                .sort((a, b) => Math.abs((getCoordForCore(a.routeAId, a.coreAId) || 0) - (getCoordForCore(a.routeBId, a.coreBId) || 0)) - Math.abs((getCoordForCore(b.routeAId, b.coreAId) || 0) - (getCoordForCore(b.routeBId, b.coreBId) || 0)));

              const getUniquePairs = (splices: typeof allSplices, type: 'lr' | 'tb' | 'same') => {
                const uniquePairs: string[] = [];
                splices.forEach(s => {
                  const sideA = routeSides.get(s.routeAId);
                  const coordA = getCoordForCore(s.routeAId, s.coreAId);
                  const coordB = getCoordForCore(s.routeBId, s.coreBId);
                  
                  let pair = '';
                  if (type === 'lr') {
                    const leftY = sideA === 'left' ? coordA : coordB;
                    const rightY = sideA === 'right' ? coordA : coordB;
                    if (leftY !== undefined && rightY !== undefined && Math.abs(leftY - rightY) < 1) return;
                    pair = `${leftY},${rightY}`;
                  } else if (type === 'tb') {
                    const topX = sideA === 'top' ? coordA : coordB;
                    const bottomX = sideA === 'bottom' ? coordA : coordB;
                    if (topX !== undefined && bottomX !== undefined && Math.abs(topX - bottomX) < 1) return;
                    pair = `${topX},${bottomX}`;
                  } else {
                    pair = [coordA, coordB].sort().join(',');
                  }

                  if (!uniquePairs.includes(pair)) uniquePairs.push(pair);
                });
                return uniquePairs;
              };

              const lrUniquePairs = getUniquePairs(lrSplices, 'lr');
              const tbUniquePairs = getUniquePairs(tbSplices, 'tb');
              const sameSideLeftUniquePairs = getUniquePairs(sameSideLeftSplices, 'same');
              const sameSideRightUniquePairs = getUniquePairs(sameSideRightSplices, 'same');
              const sameSideTopUniquePairs = getUniquePairs(sameSideTopSplices, 'same');
              const sameSideBottomUniquePairs = getUniquePairs(sameSideBottomSplices, 'same');

              const drawnVisualSplices = new Set<string>();

              return allSplices.map((s, i) => {
                const sideA = routeSides.get(s.routeAId);
                const sideB = routeSides.get(s.routeBId);
                const coordA = getCoordForCore(s.routeAId, s.coreAId);
                const coordB = getCoordForCore(s.routeBId, s.coreBId);
                
                if (coordA === undefined || coordB === undefined) return null;

                const visualKey = `${s.routeAId}:${coordA}-${s.routeBId}:${coordB}`;
                if (drawnVisualSplices.has(visualKey)) return null;
                drawnVisualSplices.add(visualKey);

                let startXA = 0, startYA = 0, entryXA = 0, entryYA = 0;
              if (sideA === 'left') { startXA = boxLeft - OUTSIDE_DIST; startYA = coordA; entryXA = boxLeft; entryYA = coordA; }
              else if (sideA === 'right') { startXA = boxRight + OUTSIDE_DIST; startYA = coordA; entryXA = boxRight; entryYA = coordA; }
              else if (sideA === 'top') { startXA = coordA; startYA = boxTop - OUTSIDE_DIST; entryXA = coordA; entryYA = boxTop; }
              else if (sideA === 'bottom') { startXA = coordA; startYA = boxBottom + OUTSIDE_DIST; entryXA = coordA; entryYA = boxBottom; }

              let startXB = 0, startYB = 0, entryXB = 0, entryYA_B = 0; // entryYA_B to avoid conflict if needed, but let's keep it simple
              let entryYB = 0;
              if (sideB === 'left') { startXB = boxLeft - OUTSIDE_DIST; startYB = coordB; entryXB = boxLeft; entryYB = coordB; }
              else if (sideB === 'right') { startXB = boxRight + OUTSIDE_DIST; startYB = coordB; entryXB = boxRight; entryYB = coordB; }
              else if (sideB === 'top') { startXB = coordB; startYB = boxTop - OUTSIDE_DIST; entryXB = coordB; entryYB = boxTop; }
              else if (sideB === 'bottom') { startXB = coordB; startYB = boxBottom + OUTSIDE_DIST; entryXB = coordB; entryYB = boxBottom; }

              let pathD = `M ${startXA} ${startYA} L ${entryXA} ${entryYA}`;

              const TRACK_SPACING = 48;

              if ((sideA === 'left' && sideB === 'right') || (sideA === 'right' && sideB === 'left')) {
                const leftY = sideA === 'left' ? coordA : coordB;
                const rightY = sideA === 'right' ? coordA : coordB;

                if (Math.abs(leftY - rightY) < 1) {
                  pathD += ` L ${entryXB} ${entryYB}`;
                } else {
                  const pair = `${leftY},${rightY}`;
                  const idx = lrUniquePairs.indexOf(pair);
                  const staggerOffset = (idx - (lrUniquePairs.length - 1) / 2) * TRACK_SPACING;
                  const midX = (entryXA + entryXB) / 2 + staggerOffset;
                  pathD += ` L ${midX} ${entryYA} L ${midX} ${entryYB} L ${entryXB} ${entryYB}`;
                }
              } else if ((sideA === 'top' && sideB === 'bottom') || (sideA === 'bottom' && sideB === 'top')) {
                const topX = sideA === 'top' ? coordA : coordB;
                const bottomX = sideA === 'bottom' ? coordA : coordB;

                if (Math.abs(topX - bottomX) < 1) {
                  pathD += ` L ${entryXB} ${entryYB}`;
                } else {
                  const pair = `${topX},${bottomX}`;
                  const idx = tbUniquePairs.indexOf(pair);
                  const staggerOffset = (idx - (tbUniquePairs.length - 1) / 2) * TRACK_SPACING;
                  const midY = (entryYA + entryYB) / 2 + staggerOffset;
                  pathD += ` L ${entryXA} ${midY} L ${entryXB} ${midY} L ${entryXB} ${entryYB}`;
                }
              } else if ((sideA === 'left' || sideA === 'right') && (sideB === 'top' || sideB === 'bottom')) {
                pathD += ` L ${entryXB} ${entryYA} L ${entryXB} ${entryYB}`;
              } else if ((sideB === 'left' || sideB === 'right') && (sideA === 'top' || sideA === 'bottom')) {
                pathD += ` L ${entryXA} ${entryYB} L ${entryXB} ${entryYB}`;
              } else if (sideA === sideB) {
                const pair = [coordA, coordB].sort().join(',');
                let idx = 0;
                if (sideA === 'left') idx = sameSideLeftUniquePairs.indexOf(pair);
                else if (sideA === 'right') idx = sameSideRightUniquePairs.indexOf(pair);
                else if (sideA === 'top') idx = sameSideTopUniquePairs.indexOf(pair);
                else if (sideA === 'bottom') idx = sameSideBottomUniquePairs.indexOf(pair);
                
                const pad = PADDING + idx * TRACK_SPACING;
                if (sideA === 'left') { pathD += ` L ${entryXA + pad} ${coordA} L ${entryXA + pad} ${coordB} L ${entryXB} ${entryYB}`; }
                else if (sideA === 'right') { pathD += ` L ${entryXA - pad} ${coordA} L ${entryXA - pad} ${coordB} L ${entryXB} ${entryYB}`; }
                else if (sideA === 'top') { pathD += ` L ${coordA} ${entryYA + pad} L ${coordB} ${entryYA + pad} L ${entryXB} ${entryYB}`; }
                else if (sideA === 'bottom') { pathD += ` L ${coordA} ${entryYA - pad} L ${coordB} ${entryYA - pad} L ${entryXB} ${entryYB}`; }
              }

              pathD += ` L ${startXB} ${startYB}`;

              const visualRouteA = visualRoutes.find(vr => vr.id === s.routeAId);
              const coreA = visualRouteA?.originalRoute.cores.find(c => c.id === s.coreAId) || connectedRoutes.find(r => r.id === s.routeAId || r.id === s.routeAId.replace(/-side[AB]$/, ''))?.cores.find(c => c.id === s.coreAId);
              const coreAColor = coreA ? (ownerHexColors[coreA.owner] || coreA.color) : '#005577';

              return (
                <g key={`splice-${i}`}>
                  <path 
                    d={pathD} 
                    stroke={coreAColor} 
                    strokeWidth="3" 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    fill="none" 
                    className="cursor-pointer hover:stroke-[6px] transition-all"
                    onClick={(e) => {
                      e.stopPropagation();
                      setHoveredSplice({ splice: s, x: e.clientX, y: e.clientY });
                    }}
                  />
                  {/* Connection Dot */}
                  <circle cx={entryXA} cy={entryYA} r="3" className="diagram-conn-dot" fill="var(--color-slate-900)" stroke={coreAColor} strokeWidth="1.5" />
                  <circle cx={entryXB} cy={entryYB} r="3" className="diagram-conn-dot" fill="var(--color-slate-900)" stroke={coreAColor} strokeWidth="1.5" />
                </g>
              );
            });
            })()}
          </svg>

          {/* HTML Overlay for Labels and Interactions */}
          
          {visualRoutes.map(vr => {
            const side = vr.side;
            const route = vr.originalRoute;
            const items = (sides as any)[side || 'left'].filter((item: any) => item.visualRouteId === vr.id);
            
            // Render Route Name
            let routeLabelX = 0, routeLabelY = 0, align = 'center';
            let hasLabel = false;
            if (items.length > 0) {
              const firstCoord = itemCoords.get(`${vr.id}-${items[0].id}`);
              const lastCoord = itemCoords.get(`${vr.id}-${items[items.length - 1].id}`);
              
              if (firstCoord !== undefined && lastCoord !== undefined) {
                const centerCoord = (firstCoord + lastCoord) / 2;
                hasLabel = true;
                
                const LABEL_GAP = 90;
                if (side === 'left') {
                  routeLabelX = boxLeft - OUTSIDE_DIST - LABEL_GAP;
                  routeLabelY = centerCoord;
                  align = 'right';
                } else if (side === 'right') {
                  routeLabelX = boxRight + OUTSIDE_DIST + LABEL_GAP;
                  routeLabelY = centerCoord;
                  align = 'left';
                } else if (side === 'top') {
                  routeLabelX = centerCoord;
                  routeLabelY = boxTop - OUTSIDE_DIST - LABEL_GAP;
                  align = 'bottom';
                } else if (side === 'bottom') {
                  routeLabelX = centerCoord;
                  routeLabelY = boxBottom + OUTSIDE_DIST + LABEL_GAP;
                  align = 'top';
                }
              }
            }

            return (
              <div key={vr.id}>
                {hasLabel && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className={`absolute z-20 flex flex-col items-center cursor-grab active:cursor-grabbing select-none ${
                      side === 'left' 
                        ? '-translate-x-full -translate-y-1/2' 
                        : side === 'right' 
                          ? 'translate-x-0 -translate-y-1/2' 
                          : side === 'top' 
                            ? '-translate-x-1/2 -translate-y-full' 
                            : '-translate-x-1/2 translate-y-0'
                    }`}
                    style={{
                      left: routeLabelX + (side === 'top' || side === 'bottom' ? (routeOffsets[vr.id] || routeOffsets[route.id] || 0) : 0),
                      top: routeLabelY + (side === 'left' || side === 'right' ? (routeOffsets[vr.id] || routeOffsets[route.id] || 0) : 0)
                    }}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      (e.target as HTMLElement).setPointerCapture(e.pointerId);
                      setDraggingRoute(vr.id);
                      setDragStart({ x: e.clientX, y: e.clientY });
                      setInitialOffset(routeOffsets[vr.id] || routeOffsets[route.id] || 0);
                    }}
                    onPointerMove={(e) => {
                      if (draggingRoute === vr.id && dragStart) {
                        const delta = side === 'left' || side === 'right' 
                          ? (e.clientY - dragStart.y) / diagramScale 
                          : (e.clientX - dragStart.x) / diagramScale;
                        setRouteOffsets(prev => ({
                          ...prev,
                          [vr.id]: initialOffset + delta
                        }));
                      }
                    }}
                    onPointerUp={(e) => {
                      if (draggingRoute === vr.id) {
                        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
                        setDraggingRoute(null);
                        setDragStart(null);
                      }
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex flex-col items-center gap-1.5 max-w-[260px] sm:max-w-[300px]">
                      <div className="px-4 py-2.5 bg-brand-600 text-slate-100 rounded-2xl shadow-2xl shadow-brand-900/40 text-sm font-black text-center break-words leading-snug border-2 border-slate-700/80 w-full">
                        {vr.label}
                      </div>
                      {vr.subBadge && (
                        <div className="px-3 py-1 bg-brand-500/20 text-brand-300 border border-brand-500/30 rounded-xl text-[10px] font-black uppercase tracking-wider shadow-md">
                          {vr.subBadge}
                        </div>
                      )}
                      <div className="px-4 py-1 bg-slate-800/95 border-2 border-slate-700 rounded-xl text-xs font-black text-slate-200 uppercase tracking-widest shadow-xl">
                        {route.cores.length} CORES
                      </div>
                      {!isSingleRouteTwoSided && (
                        <div className="flex gap-2 mt-2 bg-slate-800/90 p-2 rounded-2xl border-2 border-slate-700 shadow-2xl">
                          {(['left', 'right', 'top', 'bottom'] as const).map(s => (
                            <button
                              key={s}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (onUpdateRouteSide) onUpdateRouteSide(enclosure.id, route.id, s);
                              }}
                              className={`p-2 rounded-lg transition-all ${
                                side === s 
                                  ? 'bg-brand-500 text-slate-100 shadow-inner' 
                                  : 'bg-slate-900 text-slate-500 hover:bg-slate-700 hover:text-brand-400 shadow-sm border border-slate-700'
                              }`}
                              title={`Move to ${s}`}
                            >
                              {s === 'left' && <ArrowLeftRight className="w-4 h-4 rotate-180" />}
                              {s === 'right' && <ArrowLeftRight className="w-4 h-4" />}
                              {s === 'top' && <ArrowLeftRight className="w-4 h-4 -rotate-90" />}
                              {s === 'bottom' && <ArrowLeftRight className="w-4 h-4 rotate-90" />}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}

                <AnimatePresence mode="popLayout">
                  {items.map(item => {
                    const baseCoord = itemCoords.get(`${vr.id}-${item.id}`);
                    if (baseCoord === undefined) return null;
                    const coord = baseCoord + (routeOffsets[vr.id] || routeOffsets[route.id] || 0);

                    let x = 0, y = 0, translateX = '0%', translateY = '0%';
                    if (side === 'left') {
                      x = boxLeft - OUTSIDE_DIST - 20; y = coord; translateX = '-100%'; translateY = '-50%';
                    } else if (side === 'right') {
                      x = boxRight + OUTSIDE_DIST + 20; y = coord; translateX = '0%'; translateY = '-50%';
                    } else if (side === 'top') {
                      x = coord; y = boxTop - OUTSIDE_DIST - 20; translateX = '-50%'; translateY = '-100%';
                    } else if (side === 'bottom') {
                      x = coord; y = boxBottom + OUTSIDE_DIST + 20; translateX = '-50%'; translateY = '0%';
                    }

                    if (item.type === 'tube' || item.type === 'tube-header') {
                      const isCollapsed = item.type === 'tube';
                      const canExpand = !appUser || appUser.role === 'Admin' || appUser.role === 'Design' || (appUser.owner && (item.owner === 'None' || item.owner === appUser.owner));
                      const isExpanded = expandedTubes[`diagram-${vr.id}-${item.tubeId}`] ?? expandedTubes[`diagram-${route.id}-${item.tubeId}`];
                      return (
                        <motion.div 
                          key={`${vr.id}-${item.id}`}
                          layout
                          initial={{ opacity: 0, scale: 0.8, x: translateX, y: translateY }}
                          animate={{ opacity: 1, scale: 1, x: translateX, y: translateY }}
                          exit={{ opacity: 0, scale: 0.8, x: translateX, y: translateY }}
                          whileHover={canExpand ? { scale: 1.1, x: translateX, y: translateY } : { x: translateX, y: translateY }}
                          whileTap={canExpand ? { scale: 0.9, x: translateX, y: translateY } : { x: translateX, y: translateY }}
                          className={`absolute flex items-center gap-3 bg-slate-800/95 backdrop-blur-md border-2 rounded-2xl px-3 py-1.5 z-10 shadow-2xl transition-all ${
                            canExpand 
                              ? 'cursor-pointer border-slate-700 hover:border-brand-500 hover:shadow-brand-500/20' 
                              : 'cursor-not-allowed border-slate-800 opacity-75'
                          }`}
                          style={{ left: x, top: y }}
                          onClick={() => {
                            if (!canExpand) return;
                            setExpandedTubes(prev => ({
                              ...prev,
                              [`diagram-${vr.id}-${item.tubeId}`]: !(prev[`diagram-${vr.id}-${item.tubeId}`] ?? prev[`diagram-${route.id}-${item.tubeId}`])
                            }));
                          }}
                        >
                          <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-[14px] font-black border-2 ${ownerColors[item.owner as CoreOwner] || 'bg-slate-900 text-slate-500 border-slate-800'}`}>
                            T{item.tubeId}
                          </div>
                          {!canExpand ? (
                            <Lock className="w-4 h-4 text-slate-500" />
                          ) : (
                            isCollapsed ? <ChevronRight className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />
                          )}
                        </motion.div>
                      );
                    } else if (item.type === 'core') {
                      const coreX = side === 'left' ? x - 5 : side === 'right' ? x + 5 : x;
                      const coreY = side === 'top' ? y - 5 : side === 'bottom' ? y + 5 : y;
                      
                      return (
                        <motion.div 
                          key={`${vr.id}-${item.id}`}
                          layout
                          initial={{ opacity: 0, scale: 0.8, x: translateX, y: translateY }}
                          animate={{ opacity: 1, scale: 1, x: translateX, y: translateY }}
                          exit={{ opacity: 0, scale: 0.8, x: translateX, y: translateY }}
                          className="absolute flex items-center gap-2 bg-slate-900/90 backdrop-blur-sm border-2 border-slate-800 rounded-xl px-2.5 py-1.5 z-10 shadow-xl"
                          style={{ left: coreX, top: coreY }}
                        >
                          <div className="w-4 h-4 rounded-full border-2 border-slate-800 shadow-sm" style={{ backgroundColor: item.color }} />
                          <span className="text-[12px] font-black text-slate-200">C{item.core.id}</span>
                        </motion.div>
                      );
                    }
                    return null;
                  })}
                </AnimatePresence>
              </div>
            );
          })}

          </div>
        </div>

        {/* Modals rendered outside the scaled container */}
        <AnimatePresence>
          {hoveredCore && coreDetails && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.1 }}
              className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-900/20 backdrop-blur-sm"
              onClick={() => setHoveredCore(null)}
            >
              <motion.div 
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                transition={{ duration: 0.1 }}
                className="bg-slate-900 rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-800"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-inner" style={{ backgroundColor: coreDetails.coreColor + '20' }}>
                      <div className="w-5 h-5 rounded-full border-2 border-slate-800 shadow-sm" style={{ backgroundColor: coreDetails.coreColor }} />
                    </div>
                    <div>
                      <h4 className="text-xl font-black text-slate-100 tracking-tight">Core Details</h4>
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                        C{coreDetails.coreId} ({coreDetails.routeName})
                      </p>
                    </div>
                  </div>
                  <button onClick={() => setHoveredCore(null)} className="p-2 hover:bg-slate-800 rounded-full text-slate-500 transition-colors">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                
                <div className="p-8 space-y-6">
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Status</p>
                      <div className={`inline-flex items-center px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${statusColors[coreDetails.status as CoreStatus]}`}>
                        {coreDetails.status}
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Priority</p>
                      <div className={`inline-flex items-center px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${priorityColors[coreDetails.priority as CorePriority]}`}>
                        {coreDetails.priority}
                      </div>
                    </div>
                  </div>

                  <div>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Owner</p>
                    <div className={`inline-flex items-center px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${ownerColors[coreDetails.owner as CoreOwner]}`}>
                      {coreDetails.owner}
                    </div>
                  </div>

                  <div>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Usage Details</p>
                    <p className="text-sm text-slate-400 leading-relaxed bg-slate-950 p-4 rounded-2xl min-h-[100px] border border-slate-800 shadow-inner">
                      {coreDetails.details || "No details provided for this core."}
                    </p>
                  </div>

                  <div className="pt-4">
                    <button 
                      onClick={() => {
                        // Assuming you want to trigger edit mode here, 
                        // you might need to pass onEditCore to SpliceManager
                        setHoveredCore(null);
                        alert("Edit functionality needs to be connected to CoreManager");
                      }}
                      className="w-full py-4 px-4 rounded-2xl text-sm font-bold bg-brand-600 text-slate-100 hover:bg-brand-700 shadow-lg shadow-brand-100 transition-all flex items-center justify-center gap-2"
                    >
                      <Edit2 className="w-4 h-4" />
                      Edit Core Details
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}

          {hoveredSplice && spliceDetails && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.1 }}
              className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-900/20 backdrop-blur-sm"
              onClick={() => setHoveredSplice(null)}
            >
              <motion.div 
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                transition={{ duration: 0.1 }}
                className="bg-slate-900 rounded-3xl shadow-2xl w-full max-w-4xl overflow-hidden border border-slate-800"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
                  <h4 className="text-xl font-black text-slate-100 tracking-tight">Splice Connection Details</h4>
                  <button onClick={() => setHoveredSplice(null)} className="p-2 hover:bg-slate-800 rounded-full text-slate-500 transition-colors">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                
                <div className="p-8 grid grid-cols-2 gap-8">
                  {[spliceDetails.coreA, spliceDetails.coreB].map((core, i) => (
                    <div key={i} className="space-y-4 bg-slate-950 p-6 rounded-2xl border border-slate-800 shadow-inner">
                      <div className="flex items-center gap-3">
                        <div className="w-4 h-4 rounded-full border border-slate-700" style={{ backgroundColor: core.color }} />
                        <span className="font-black text-slate-100">{core.routeName} - C{core.id}</span>
                      </div>
                      <div className="space-y-2">
                        <div>
                          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Status</p>
                          <div className={`inline-flex items-center px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${statusColors[core.status as CoreStatus]}`}>
                            {core.status}
                          </div>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Owner</p>
                          <div className={`inline-flex items-center px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${ownerColors[core.owner as CoreOwner]}`}>
                            {core.owner}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  return (
    <div 
      className={`${isFullscreen ? 'fixed inset-0 w-full' : ''} bg-slate-900 border-l border-slate-800 flex flex-col h-full shadow-2xl z-[1000] relative ${isResizing ? '' : 'transition-all duration-300'}`}
      style={!isFullscreen ? { width: `${width}px`, maxWidth: '95vw' } : {}}
    >
      {!isFullscreen && (
        <div
          className={`absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-brand-500/50 transition-colors z-50 flex items-center justify-center ${isResizing ? 'bg-brand-500' : ''}`}
          onMouseDown={(e) => {
            e.preventDefault();
            setIsResizing(true);
          }}
        >
          <div className="w-0.5 h-8 bg-slate-700 rounded-full" />
        </div>
      )}
      <div className="p-5 border-b border-slate-800 flex justify-between items-start bg-slate-900/50">
        <div>
          <h2 className="text-2xl font-bold text-slate-100 font-display">Enclosure: {enclosure.name}</h2>
          <p className="text-base text-slate-400 font-medium mt-1">{connectedRoutes.length} Connected Routes</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setIsFullscreen(!isFullscreen)} className="p-2 hover:bg-slate-800 rounded-full transition-colors" title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}>
            {isFullscreen ? <Minimize2 className="w-5 h-5 text-slate-400" /> : <Maximize2 className="w-5 h-5 text-slate-400" />}
          </button>
          <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-full transition-colors" title="Close">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>
      </div>

      <div className="flex border-b border-slate-800 bg-slate-900/60 backdrop-blur-sm sticky top-[64px] z-20 overflow-x-auto no-scrollbar">
        {[
          { id: 'detail', label: 'Detail', icon: Activity, show: true },
          { id: 'manage', label: 'Splicing Tool', icon: Wrench, show: permissions.manageSplices },
          { id: 'diagram', label: 'Diagram', icon: Network, show: true },
          { id: 'summary', label: 'Splice Summary', icon: List, show: true },
          { id: 'trays', label: 'Splice Trays', icon: Layers, show: permissions.viewSpliceTrays },
          { id: 'physical', label: 'Physical View', icon: Box, show: true }
        ].filter(tab => tab.show).map(tab => (
          <button
            key={tab.id}
            className={`flex-1 py-2.5 px-3 text-[10px] sm:text-[10.5px] font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all relative whitespace-nowrap ${
              activeTab === tab.id 
                ? 'text-brand-400 bg-brand-500/5' 
                : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/40'
            }`}
            onClick={() => setActiveTab(tab.id as any)}
          >
            <tab.icon className={`w-3.5 h-3.5 ${activeTab === tab.id ? 'text-brand-400' : 'text-slate-500'}`} />
            <span>{tab.label}</span>
            {activeTab === tab.id && (
              <motion.div 
                layoutId="activeTab"
                className="absolute bottom-0 left-0 right-0 h-[2px] bg-brand-500 rounded-full"
              />
            )}
          </button>
        ))}
      </div>

      <div className="flex flex-col flex-1 overflow-hidden">
        {activeTab === 'manage' && (
          connectedRoutes.length === 0 ? (
            <div className="flex flex-col items-center justify-center flex-1 text-slate-500 p-12 text-center bg-slate-900/30">
              <div className="w-20 h-20 bg-slate-800 rounded-3xl shadow-xl flex items-center justify-center mb-6 border border-slate-700">
                <AlertCircle className="w-10 h-10 text-slate-500" />
              </div>
              <h3 className="text-xl font-black text-slate-200 mb-3 tracking-tight font-display">No Connected Routes</h3>
              <p className="text-sm text-slate-400 max-w-xs mx-auto leading-relaxed">
                There are no fiber optic routes connected to this enclosure. Connect a route on the map to manage splices.
              </p>
              <button 
                onClick={onClose}
                className="mt-8 px-6 py-3 bg-brand-600 text-slate-100 rounded-2xl font-bold text-sm hover:bg-brand-700 transition-all active:scale-95 shadow-lg shadow-brand-900/20"
              >
                Back to Map
              </button>
            </div>
          ) : (
            <div className="flex flex-col flex-1 overflow-hidden">
              {/* Explanatory banner for single cable / intra-cable loopback */}
              {(connectedRoutes.length === 1 || routeAId === routeBId) && (
                <div className="bg-slate-900/90 border-b border-slate-800 px-6 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2.5 text-slate-300">
                    <span className="flex h-2.5 w-2.5 relative">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-brand-500"></span>
                    </span>
                    <div>
                      <span className="font-bold text-slate-200">สายเคเบิลเส้นเดียวกัน (Single Cable / Loopback): </span>
                      <span className="text-slate-400">
                        {singleCableViewMode === 'two-sided'
                          ? 'แสดง 2 ฝั่งเพื่อเลือก Core ต้นทาง (A) และ ปลายทาง (B) สำหรับการเชื่อมต่อ Splice หรือ Loopback'
                          : 'มุมมองฝั่งเดียวสำหรับตรวจสอบสถานะคอร์ทั้งหมดของสายนี้'}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center bg-slate-800 p-1 rounded-xl border border-slate-700 shadow-sm ml-auto">
                    <button
                      onClick={() => setSingleCableViewMode('two-sided')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-black tracking-wide transition-all ${
                        singleCableViewMode === 'two-sided'
                          ? 'bg-brand-600 text-slate-100 shadow'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      2 ฝั่ง (Splicing)
                    </button>
                    <button
                      onClick={() => setSingleCableViewMode('single-sided')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-black tracking-wide transition-all ${
                        singleCableViewMode === 'single-sided'
                          ? 'bg-brand-600 text-slate-100 shadow'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      1 ฝั่ง (Overview)
                    </button>
                  </div>
                </div>
              )}

              <div className="flex p-6 gap-6 border-b border-slate-800 bg-slate-900/30 backdrop-blur-sm z-10 flex-col sm:flex-row">
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                      {routeAId === routeBId ? 'Route A (ฝั่งที่ 1 / Source)' : 'Route A (Source)'}
                    </label>
                    {connectedRoutes.length === 1 && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-brand-400 bg-brand-500/10 px-2 py-0.5 rounded-full border border-brand-500/20">
                        <Zap className="w-3 h-3" /> Single Cable Mode
                      </span>
                    )}
                  </div>
                  <div className="relative group">
                    <select
                      className="w-full bg-slate-800 border border-slate-700 p-3 rounded-2xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none text-sm font-black text-slate-200 appearance-none shadow-sm transition-all hover:border-slate-600"
                      value={routeAId}
                      onChange={e => { setRouteAId(e.target.value); setSelectedCoreA(null); setSelectedTubesA([]); }}
                    >
                      {connectedRoutes.map(r => (
                        <option key={r.id} value={r.id}>{r.name} ({r.capacity}F)</option>
                      ))}
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                      <ChevronDown className="w-4 h-4" />
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center justify-center pt-2 sm:pt-6">
                  <div className="w-10 h-10 rounded-full bg-brand-500/10 flex items-center justify-center border border-brand-500/20 shadow-sm" title={routeAId === routeBId ? "Intra-cable Loopback Splicing" : "Inter-route Splicing"}>
                    <GitMerge className="w-5 h-5 text-brand-400" />
                  </div>
                </div>

                <div className="flex-1">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                      {routeAId === routeBId ? 'Route B (ฝั่งที่ 2 / Destination)' : 'Route B (Destination)'}
                    </label>
                    {routeAId === routeBId && (
                      <span className="text-[10px] font-bold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full border border-indigo-500/20">
                        Loop / Intra-cable
                      </span>
                    )}
                  </div>
                  <div className="relative group">
                    <select
                      className="w-full bg-slate-800 border border-slate-700 p-3 rounded-2xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none text-sm font-black text-slate-200 appearance-none shadow-sm transition-all hover:border-slate-600"
                      value={routeBId}
                      onChange={e => { setRouteBId(e.target.value); setSelectedCoreB(null); setSelectedTubesB([]); }}
                    >
                      {connectedRoutes.map(r => (
                        <option key={r.id} value={r.id}>
                          {r.name} ({r.capacity}F){routeAId === r.id ? ' — Same Cable (Loop)' : ''}
                        </option>
                      ))}
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                      <ChevronDown className="w-4 h-4" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col flex-1 overflow-hidden">
                {singleCableViewMode === 'single-sided' && (connectedRoutes.length === 1 || routeAId === routeBId) ? (
                  <div className="flex-1 overflow-y-auto p-6 max-w-4xl mx-auto w-full custom-scrollbar">
                    <div className="mb-4 p-4 bg-slate-900 rounded-2xl border border-slate-800 flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-black text-slate-100 flex items-center gap-2">
                          <span>{routeA?.name} ({routeA?.capacity}F)</span>
                          <span className="text-[10px] font-bold text-brand-400 bg-brand-500/10 px-2 py-0.5 rounded-full border border-brand-500/20">
                            Single Cable Overview
                          </span>
                        </h4>
                        <p className="text-xs text-slate-400 mt-1">ภาพรวมของสายเส้นเดียว คลิกเลือก Core และสลับไปโหมด 2 ฝั่งเพื่อทำ Splice Loopback</p>
                      </div>
                      <button
                        onClick={() => setSingleCableViewMode('two-sided')}
                        className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-xs font-black transition-all shadow-md active:scale-95 flex items-center gap-1.5"
                      >
                        <GitMerge className="w-3.5 h-3.5" /> สลับไปโหมด 2 ฝั่งเพื่อ Splice
                      </button>
                    </div>
                    <CoreList 
                      route={routeA}
                      selectedCore={selectedCoreA}
                      onSelectCore={(id) => setSelectedCoreA(id === -1 ? null : id)}
                      selectedTubes={selectedTubesA}
                      onToggleSelectTube={(id) => setSelectedTubesA(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id])}
                      onSelectAllTubes={(ids) => {
                        const allSelected = ids.every(id => selectedTubesA.includes(id));
                        setSelectedTubesA(allSelected ? [] : ids);
                      }}
                      expandedTubes={expandedTubes}
                      onToggleTube={(tubeId) => routeA && onToggleTube(routeA.id, tubeId)}
                      onToggleAllTubes={(expand) => routeA && onToggleAllTubes(routeA.id, routeA.capacity, expand)}
                      onUnsplice={onUnsplice}
                      onUnspliceAll={onUnspliceAll}
                      onUnspliceTube={onUnspliceTube}
                      onEditCore={(r, c) => {
                        setEditingCore({ route: r, core: c });
                        setCoreEditData({
                          status: c.status,
                          owner: c.owner,
                          priority: c.priority,
                          details: c.details || ''
                        });
                      }}
                      enclosureId={enclosure.id}
                      routes={routes}
                      appUser={appUser}
                      quotaExceeded={quotaExceeded}
                    />
                  </div>
                ) : (
                  <div className="flex flex-1 overflow-hidden bg-slate-950/50">
                    <div className="flex-1 overflow-y-auto p-4 border-r border-slate-800">
                      <CoreList 
                        route={routeA}
                        selectedCore={selectedCoreA}
                        onSelectCore={(id) => setSelectedCoreA(id === -1 ? null : id)}
                        selectedTubes={selectedTubesA}
                        onToggleSelectTube={(id) => setSelectedTubesA(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id])}
                        onSelectAllTubes={(ids) => {
                          const allSelected = ids.every(id => selectedTubesA.includes(id));
                          setSelectedTubesA(allSelected ? [] : ids);
                        }}
                        expandedTubes={expandedTubes}
                        onToggleTube={(tubeId) => routeA && onToggleTube(routeA.id, tubeId)}
                        onToggleAllTubes={(expand) => routeA && onToggleAllTubes(routeA.id, routeA.capacity, expand)}
                        onUnsplice={onUnsplice}
                        onUnspliceAll={onUnspliceAll}
                        onUnspliceTube={onUnspliceTube}
                        onEditCore={(r, c) => {
                          setEditingCore({ route: r, core: c });
                          setCoreEditData({
                            status: c.status,
                            owner: c.owner,
                            priority: c.priority,
                            details: c.details || ''
                          });
                        }}
                        enclosureId={enclosure.id}
                        routes={routes}
                        appUser={appUser}
                        quotaExceeded={quotaExceeded}
                      />
                    </div>
                    <div className="flex-1 overflow-y-auto p-4">
                      <CoreList 
                        route={routeB}
                        selectedCore={selectedCoreB}
                        onSelectCore={(id) => setSelectedCoreB(id === -1 ? null : id)}
                        selectedTubes={selectedTubesB}
                        onToggleSelectTube={(id) => setSelectedTubesB(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id])}
                        onSelectAllTubes={(ids) => {
                          const allSelected = ids.every(id => selectedTubesB.includes(id));
                          setSelectedTubesB(allSelected ? [] : ids);
                        }}
                        expandedTubes={expandedTubes}
                        onToggleTube={(tubeId) => routeB && onToggleTube(routeB.id, tubeId)}
                        onToggleAllTubes={(expand) => routeB && onToggleAllTubes(routeB.id, routeB.capacity, expand)}
                        onUnsplice={onUnsplice}
                        onUnspliceAll={onUnspliceAll}
                        onUnspliceTube={onUnspliceTube}
                        onEditCore={(r, c) => {
                          setEditingCore({ route: r, core: c });
                          setCoreEditData({
                            status: c.status,
                            owner: c.owner,
                            priority: c.priority,
                            details: c.details || ''
                          });
                        }}
                        enclosureId={enclosure.id}
                        routes={routes}
                        appUser={appUser}
                        quotaExceeded={quotaExceeded}
                      />
                    </div>
                  </div>
                )}

                {/* Action Bar for Splicing Cores */}
                {(selectedCoreA && selectedCoreB) && (routeAId !== routeBId || selectedCoreA !== selectedCoreB) && (
                  <motion.div 
                    initial={{ y: 100 }}
                    animate={{ y: 0 }}
                    className="p-4 bg-brand-600 border-t border-brand-700 flex items-center justify-between shadow-2xl z-30"
                  >
                    <div className="text-sm font-black text-slate-100 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-white/20">
                        <Zap className="w-4 h-4 text-slate-100" />
                      </div>
                      <span>Splice Core {selectedCoreA}</span>
                      <ChevronRight className="w-4 h-4 opacity-50" />
                      <span>Core {selectedCoreB} {routeAId === routeBId ? '(Loop)' : ''}</span>
                    </div>
                    <button
                      onClick={handleSpliceCore}
                      disabled={!canSpliceCore || quotaExceeded || !permissions.manageSplices}
                      className={`px-6 py-2.5 bg-slate-800 text-brand-400 border border-slate-700 rounded-xl font-black text-sm flex items-center gap-2 transition-all shadow-lg ${(!canSpliceCore || quotaExceeded || !permissions.manageSplices) ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-700 active:scale-95'}`}
                    >
                      <GitMerge className="w-4 h-4" /> SPLICE CORES
                    </button>
                  </motion.div>
                )}

                {/* Action Bar for Splicing Tubes */}
                {(selectedTubesA.length > 0 && selectedTubesB.length > 0) && (routeAId !== routeBId || !selectedTubesA.some(t => selectedTubesB.includes(t))) && (
                  <motion.div 
                    initial={{ y: 100 }}
                    animate={{ y: 0 }}
                    className="p-4 bg-indigo-600 border-t border-indigo-700 flex items-center justify-between shadow-2xl z-30"
                  >
                    <div className="text-sm font-black text-slate-100 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-white/20">
                        <Box className="w-4 h-4 text-slate-100" />
                      </div>
                      <span>Splice {Math.min(selectedTubesA.length, selectedTubesB.length)} Tube(s)</span>
                    </div>
                    <button
                      onClick={handleSpliceTube}
                      disabled={!canSpliceTube || quotaExceeded || !permissions.manageSplices}
                      className={`px-6 py-2.5 bg-slate-800 text-indigo-400 border border-slate-700 rounded-xl font-black text-sm flex items-center gap-2 transition-all shadow-lg ${(!canSpliceTube || quotaExceeded || !permissions.manageSplices) ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-700 active:scale-95'}`}
                    >
                      <GitMerge className="w-4 h-4" /> SPLICE TUBES ({Math.min(selectedTubesA.length, selectedTubesB.length) * 12}F)
                    </button>
                  </motion.div>
                )}

                {routeAId === routeBId && selectedCoreA && selectedCoreB && selectedCoreA === selectedCoreB && (
                  <div className="p-4 bg-amber-500/10 border-t border-amber-500/20 text-amber-400 text-xs font-bold text-center">
                    Cannot splice Core {selectedCoreA} to itself. Please select a different Core B on this route to create a loop/splice.
                  </div>
                )}
                {routeAId === routeBId && selectedTubesA.length > 0 && selectedTubesB.length > 0 && selectedTubesA.some(t => selectedTubesB.includes(t)) && (
                  <div className="p-4 bg-amber-500/10 border-t border-amber-500/20 text-amber-400 text-xs font-bold text-center">
                    Cannot splice a tube to itself. Please select different tubes to perform intra-cable splicing.
                  </div>
                )}
              </div>
            </div>
          )
        )}

          {activeTab === 'diagram' && (
            <div className="flex flex-col flex-1 overflow-hidden bg-slate-950 relative diagram-tab-wrapper">
              {/* Fixed Enclosure Info Overlay */}
              <div className="absolute top-[68px] left-6 z-30 pointer-events-auto">
                <div className="flex flex-col items-start gap-2">
                  <div 
                    onClick={() => setShowDiagramInfo(prev => !prev)}
                    className="enclosure-diagram-badge flex items-center gap-3 px-4 py-2 bg-slate-900 border-[2px] border-brand-500 rounded-xl shadow-2xl text-base font-black text-brand-400 uppercase tracking-widest ring-4 ring-brand-500/10 cursor-pointer hover:brightness-110 select-none transition-all"
                    title={showDiagramInfo ? "Click to collapse info" : "Click to expand info"}
                  >
                    <Box className="w-5 h-5" />
                    <span>{enclosure.name}</span>
                    <ChevronDown className={`w-4 h-4 text-brand-400 transition-transform ${showDiagramInfo ? 'rotate-180' : ''}`} />
                  </div>
                  
                  {showDiagramInfo && (
                    <div className="enclosure-diagram-card flex flex-col items-start bg-slate-900/95 backdrop-blur-xl px-4 py-2.5 rounded-xl border border-slate-800 shadow-2xl">
                      <div className="flex items-center gap-2 text-xs font-black text-slate-200">
                        <Activity className="w-3.5 h-3.5 text-brand-500" />
                        <span>{enclosure.locationName || 'No Location Name'}</span>
                        {enclosure.locationType && (
                          <>
                            <span className="w-1 h-1 bg-slate-700 rounded-full" />
                            <span className="text-slate-500">{enclosure.locationType}</span>
                          </>
                        )}
                      </div>
                      <div className="enclosure-diagram-coords flex items-center gap-1.5 mt-1.5 text-[9px] font-mono font-bold text-slate-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800 shadow-inner">
                        <MapPin className="w-2.5 h-2.5 text-slate-500" />
                        <span>{enclosure.position.lat.toFixed(6)}, {enclosure.position.lng.toFixed(6)}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="diagram-toolbar p-3 border-b border-slate-800 bg-slate-900/50 backdrop-blur-sm flex justify-end gap-2 z-10">
                <button 
                  onClick={() => {
                    const newExpanded = { ...expandedTubes };
                    connectedRoutes.forEach(r => {
                      for (let t = 1; t <= Math.ceil(r.capacity / 12); t++) {
                        newExpanded[`diagram-${r.id}-${t}`] = true;
                        newExpanded[`diagram-${r.id}-sideA-${t}`] = true;
                        newExpanded[`diagram-${r.id}-sideB-${t}`] = true;
                      }
                    });
                    setExpandedTubes(newExpanded);
                  }}
                  className="text-[10px] px-3 py-1.5 bg-slate-800 border border-slate-700 hover:border-slate-600 rounded-xl text-slate-300 font-black uppercase tracking-widest transition-all shadow-sm"
                >
                  Expand All
                </button>
                <button 
                  onClick={() => {
                    const newExpanded = { ...expandedTubes };
                    connectedRoutes.forEach(r => {
                      for (let t = 1; t <= Math.ceil(r.capacity / 12); t++) {
                        newExpanded[`diagram-${r.id}-${t}`] = false;
                        newExpanded[`diagram-${r.id}-sideA-${t}`] = false;
                        newExpanded[`diagram-${r.id}-sideB-${t}`] = false;
                      }
                    });
                    setExpandedTubes(newExpanded);
                  }}
                  className="text-[10px] px-3 py-1.5 bg-slate-800 border border-slate-700 hover:border-slate-600 rounded-xl text-slate-300 font-black uppercase tracking-widest transition-all shadow-sm"
                >
                  Collapse All
                </button>
                <button 
                  onClick={handleAutoFit}
                  className="text-[10px] px-3 py-1.5 bg-slate-800 border border-slate-700 hover:border-brand-500 hover:text-brand-400 rounded-xl text-slate-300 font-black uppercase tracking-widest transition-all shadow-sm"
                  title="Fit diagram to screen"
                >
                  Auto Fit
                </button>
                <button 
                  onClick={handleExportPDF}
                  disabled={isExporting}
                  className="text-[10px] px-3 py-1.5 bg-brand-600 border border-brand-500 hover:bg-brand-500 rounded-xl text-slate-100 font-black uppercase tracking-widest transition-all shadow-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Export Diagram as PDF"
                >
                  <Download className="w-3 h-3" />
                  {isExporting ? 'Exporting...' : 'Export PDF'}
                </button>
                <div className="flex items-center gap-1 bg-slate-800 border border-slate-700 rounded-xl p-1 shadow-sm ml-2">
                  <button 
                    onClick={() => setDiagramScale(prev => Math.max(0.1, prev - 0.1))}
                    className="p-1.5 hover:bg-slate-700 rounded-lg text-slate-400 transition-all active:scale-90"
                    title="Zoom Out"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-[10px] font-black text-slate-500 w-10 text-center uppercase tracking-widest">
                    {Math.round(diagramScale * 100)}%
                  </span>
                  <button 
                    onClick={() => setDiagramScale(prev => Math.min(2, prev + 0.1))}
                    className="p-1.5 hover:bg-slate-700 rounded-lg text-slate-400 transition-all active:scale-90"
                    title="Zoom In"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-hidden">
                {renderDiagram()}
              </div>
            </div>
          )}
          {activeTab === 'summary' && <SummaryTab summary={spliceSummary} />}
          {activeTab === 'trays' && renderTrays()}
          {activeTab === 'physical' && renderPhysical()}
          
          <AnimatePresence>
            {editingCore && (
              <div className="fixed inset-0 z-[4000] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-md">
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 20 }}
                  className="bg-slate-900 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-800"
                >
                  <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-brand-600/20 flex items-center justify-center text-brand-400 font-black border border-brand-500/20">
                        {editingCore.core.id}
                      </div>
                      <div>
                        <h3 className="text-lg font-black text-slate-100 tracking-tight font-display">Edit Core Details</h3>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{editingCore.route.name}</p>
                      </div>
                    </div>
                    <button onClick={() => setEditingCore(null)} className="p-2 hover:bg-slate-800 rounded-xl text-slate-500 transition-all">
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="p-6 space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Status</label>
                        <select 
                          value={coreEditData.status}
                          onChange={(e) => setCoreEditData({ ...coreEditData, status: e.target.value as CoreStatus })}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm font-black text-slate-300 focus:ring-2 focus:ring-brand-500 outline-none transition-all"
                        >
                          <option value="used">Used</option>
                          <option value="bad">Bad</option>
                          <option value="reserved">Reserved</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Priority</label>
                        <select 
                          value={coreEditData.priority}
                          onChange={(e) => setCoreEditData({ ...coreEditData, priority: e.target.value as CorePriority })}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm font-black text-slate-300 focus:ring-2 focus:ring-brand-500 outline-none transition-all"
                        >
                          <option value="High">High</option>
                          <option value="Medium">Medium</option>
                          <option value="Low">Low</option>
                        </select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Owner</label>
                      <select 
                        value={coreEditData.owner}
                        onChange={(e) => setCoreEditData({ ...coreEditData, owner: e.target.value as CoreOwner })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm font-black text-slate-300 focus:ring-2 focus:ring-brand-500 outline-none transition-all"
                      >
                        <option value="None">None</option>
                        <option value="ITEL">ITEL</option>
                        <option value="SYMC">SYMC</option>
                        <option value="UIH">UIH</option>
                      </select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Usage Details</label>
                      <textarea 
                        value={coreEditData.details}
                        onChange={(e) => setCoreEditData({ ...coreEditData, details: e.target.value })}
                        placeholder="Enter usage details, circuit ID, etc."
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm font-medium text-slate-400 focus:ring-2 focus:ring-brand-500 outline-none transition-all min-h-[100px] resize-none"
                      />
                    </div>

                    <div className="flex gap-3 pt-2">
                      <button 
                        onClick={() => setEditingCore(null)}
                        className="flex-1 py-3 bg-slate-800 text-slate-400 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-700 transition-all"
                      >
                        Cancel
                      </button>
                      <button 
                        onClick={handleSaveCore}
                        disabled={isSavingCore}
                        className="flex-1 py-3 bg-brand-600 text-slate-100 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-brand-700 shadow-2xl shadow-brand-900/20 transition-all disabled:opacity-50"
                      >
                        {isSavingCore ? 'Saving...' : 'Save Changes'}
                      </button>
                    </div>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          {activeTab === 'detail' && (
            <div className="p-8 space-y-10 overflow-y-auto h-full custom-scrollbar bg-slate-900/30">
              <div className="max-w-4xl mx-auto space-y-10">
                {/* Header Section */}
                <div className="flex items-center justify-between border-b border-slate-800 pb-6">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 bg-brand-600 rounded-2xl flex items-center justify-center shadow-lg shadow-brand-900/20">
                      <Box className="w-8 h-8 text-slate-100" />
                    </div>
                    <div>
                      <h3 className="text-2xl font-black text-slate-100 tracking-tight font-display">{enclosure.name}</h3>
                      <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">
                        {enclosureTypes.find(t => t.id === enclosure.enclosureTypeId)?.name || 'Standard Enclosure'}
                      </p>
                    </div>
                  </div>
                  {permissions.editEnclosures && onEditEnclosure && (
                    <button 
                      onClick={() => onEditEnclosure(enclosure)}
                      className="flex items-center gap-2 px-4 py-2 bg-brand-600/10 text-brand-400 hover:bg-brand-600/20 rounded-xl font-bold text-xs transition-all border border-brand-500/20"
                    >
                      <Edit2 className="w-4 h-4" />
                      Edit Enclosure
                    </button>
                  )}
                </div>

                {/* Details Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  <div className="bg-slate-800/50 p-6 rounded-3xl border border-slate-700 shadow-sm">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Location Name</p>
                    <p className="text-sm font-black text-slate-200">{enclosure.locationName || 'N/A'}</p>
                  </div>
                  <div className="bg-slate-800/50 p-6 rounded-3xl border border-slate-700 shadow-sm">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Location Type</p>
                    <p className="text-sm font-black text-slate-200">{enclosure.locationType || 'N/A'}</p>
                  </div>
                  <div className="bg-slate-800/50 p-6 rounded-3xl border border-slate-700 shadow-sm">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Coordinates</p>
                    <p className="text-sm font-black text-slate-200">{enclosure.position.lat.toFixed(6)}, {enclosure.position.lng.toFixed(6)}</p>
                  </div>
                  <div className="bg-slate-800/50 p-6 rounded-3xl border border-slate-700 shadow-sm">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Enclosure ID</p>
                    <p className="text-sm font-mono font-bold text-slate-400">{enclosure.id}</p>
                  </div>
                  <div className="bg-slate-800/50 p-6 rounded-3xl border border-slate-700 shadow-sm">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Splice Trays</p>
                    <p className="text-sm font-black text-slate-200">{enclosureType?.spliceTrays || 0} Trays</p>
                  </div>
                  <div className="bg-slate-800/50 p-6 rounded-3xl border border-slate-700 shadow-sm">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Connected Routes</p>
                    <p className="text-sm font-black text-slate-200">{connectedRoutes.length} Routes</p>
                  </div>
                </div>

                {/* Physical Preview Section */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-black text-slate-200 uppercase tracking-widest">Physical Layout Preview</h4>
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest bg-slate-800 px-2 py-1 rounded-md border border-slate-700">Read Only</span>
                  </div>
                  <div className="bg-slate-800/30 rounded-[40px] border border-slate-700 shadow-xl overflow-hidden p-4 flex items-center justify-center min-h-[300px]">
                    <div className="pointer-events-none select-none w-full flex justify-center overflow-hidden">
                      <div className="relative flex items-center justify-center" style={{ width: 1100, height: 350, transform: 'scale(0.65)', transformOrigin: 'center' }}>
                        <div className="relative w-[448px] h-[192px]">
                          <div className="w-full h-full bg-slate-800 rounded-[40px] shadow-xl border-[5px] border-slate-700 flex items-center justify-center relative">
                            {/* Inner tray */}
                            <div className="w-[288px] h-[128px] bg-slate-100 rounded-[24px] shadow-inner flex items-center justify-center border-[2px] border-slate-300 relative overflow-hidden" style={{ backgroundColor: 'var(--color-slate-100)', borderColor: 'var(--color-slate-300)' }}>
                              <div className="w-[192px] h-[90px] bg-slate-800 rounded-xl shadow-sm border border-slate-700 flex flex-col items-center justify-center gap-1.5" style={{ backgroundColor: 'var(--color-slate-800)', borderColor: 'var(--color-slate-700)' }}>
                                <div className="w-28 h-2 bg-slate-200 rounded-full"></div>
                                <div className="w-28 h-2 bg-slate-200 rounded-full"></div>
                                <div className="w-28 h-2 bg-slate-200 rounded-full"></div>
                                <div className="w-28 h-2 bg-slate-200 rounded-full"></div>
                              </div>
                            </div>

                            {/* Ports Left */}
                            <div className="absolute -left-8 top-0 bottom-0 flex flex-col justify-evenly py-6">
                              <PortNode id={1} type="main" enclosure={enclosure} connectedRoutes={connectedRoutes} fiberTypes={fiberTypes} fiberColorConfigs={fiberColorConfigs} onUpdate={() => {}} side="left" isDetailView appUser={appUser} />
                              <PortNode id={3} type="drop" enclosure={enclosure} connectedRoutes={connectedRoutes} fiberTypes={fiberTypes} fiberColorConfigs={fiberColorConfigs} onUpdate={() => {}} side="left" isDetailView appUser={appUser} />
                              <PortNode id={5} type="drop" enclosure={enclosure} connectedRoutes={connectedRoutes} fiberTypes={fiberTypes} fiberColorConfigs={fiberColorConfigs} onUpdate={() => {}} side="left" isDetailView appUser={appUser} />
                            </div>

                            {/* Ports Right */}
                            <div className="absolute -right-8 top-0 bottom-0 flex flex-col justify-evenly py-6">
                              <PortNode id={2} type="main" enclosure={enclosure} connectedRoutes={connectedRoutes} fiberTypes={fiberTypes} fiberColorConfigs={fiberColorConfigs} onUpdate={() => {}} side="right" isDetailView appUser={appUser} />
                              <PortNode id={4} type="drop" enclosure={enclosure} connectedRoutes={connectedRoutes} fiberTypes={fiberTypes} fiberColorConfigs={fiberColorConfigs} onUpdate={() => {}} side="right" isDetailView appUser={appUser} />
                              <PortNode id={6} type="main" enclosure={enclosure} connectedRoutes={connectedRoutes} fiberTypes={fiberTypes} fiberColorConfigs={fiberColorConfigs} onUpdate={() => {}} side="right" isDetailView appUser={appUser} />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
    </div>
  );
}

import { MapContainer, TileLayer, Polyline, CircleMarker, Marker, useMapEvents, Tooltip, useMap, LayersControl, LayerGroup, Popup } from 'react-leaflet';
import L from 'leaflet';
import { useEffect, useRef, useState } from 'react';
import { Point, FiberEnclosure, Route, EnclosureType, FiberType, FiberLoop, FiberColorConfig, CoreOwner, Core } from '../types';
import { useMapDrawing } from '../hooks/useMapDrawing';
import { Maximize, Plus, Minus, Info, ChevronDown, ChevronUp, Pencil, ExternalLink, MapPin, Layers, Box, Cable, Radio, Compass, Network, Search, X, Copy, Check, CornerDownRight, RefreshCcw, Navigation, Sparkles } from 'lucide-react';

const draftIcon = new L.DivIcon({
  className: 'bg-yellow-500 border-2 border-slate-100 rounded-full shadow-md',
  iconSize: [8, 8],
  iconAnchor: [4, 4]
});

const searchPinIcon = new L.DivIcon({
  className: 'custom-search-pin',
  html: `<div class="relative flex items-center justify-center">
    <div class="absolute w-8 h-8 rounded-full bg-rose-500/40 animate-ping"></div>
    <div class="w-6 h-6 rounded-full bg-rose-600 border-2 border-white shadow-xl flex items-center justify-center text-white font-black text-xs">
      📍
    </div>
  </div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 24],
  popupAnchor: [0, -24]
});

function parseCoordinates(input: string): { lat: number; lng: number } | null {
  if (!input) return null;
  const clean = input.trim();
  // Support: "13.738124, 100.531245", "13.738124 100.531245", "13.738124,100.531245", "lat: 13.738, lng: 100.531"
  const regex = /[-+]?([1-8]?\d(\.\d+)?|90(\.0+)?)[,\s]+[-+]?(180(\.0+)?|((1[0-7]\d)|([1-9]?\d))(\.\d+)?)/;
  const match = clean.match(regex);
  if (match) {
    const parts = match[0].split(/[,\s]+/).map(Number).filter(n => !isNaN(n));
    if (parts.length >= 2) {
      const [lat, lng] = parts;
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        return { lat, lng };
      }
    }
  }
  return null;
}

interface FiberMapProps {
  enclosures: FiberEnclosure[];
  routes: Route[];
  enclosureTypes: EnclosureType[];
  fiberTypes: FiberType[];
  fiberColorConfigs: FiberColorConfig[];
  loops: FiberLoop[];
  drawingMode: 'none' | 'enclosure' | 'route' | 'edit-route' | 'loop' | 'edit-enclosure';
  draftRoute: Point[];
  onMapClick: (point: Point) => void;
  onRouteClick: (route: Route) => void;
  onEnclosureClick?: (enclosure: FiberEnclosure) => void;
  onEditRoute?: (route: Route) => void;
  onEditEnclosure?: (enclosure: FiberEnclosure) => void;
  onEnclosureDragEnd?: (enclosure: FiberEnclosure, point: Point) => void;
  selectedRouteId?: string;
  selectedEnclosureId?: string;
  editingRouteId?: string | null;
  editingEnclosureId?: string | null;
  onMarkerDragEnd?: (index: number, point: Point) => void;
  onMarkerClick?: (index: number) => void;
  onDraftRouteClick?: (point: Point) => void;
  sidebarCollapsed?: boolean;
}

function MapEvents({ onMapClick }: { onMapClick: (latlng: L.LatLng) => void }) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng);
    },
  });
  return null;
}

function formatNumberRanges(numbers: number[]): string {
  if (!numbers || numbers.length === 0) return '-';
  const sorted = Array.from(new Set(numbers)).sort((a, b) => a - b);
  const ranges: string[] = [];
  let start = sorted[0];
  let end = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === end + 1) {
      end = sorted[i];
    } else {
      ranges.push(start === end ? `${start}` : `${start}-${end}`);
      start = sorted[i];
      end = sorted[i];
    }
  }
  ranges.push(start === end ? `${start}` : `${start}-${end}`);
  return ranges.join(', ');
}

function EnclosureTooltipContent({ 
  enclosure, 
  enclosureTypes, 
  routes 
}: { 
  enclosure: FiberEnclosure; 
  enclosureTypes: EnclosureType[]; 
  routes: Route[]; 
}) {
  const type = enclosureTypes.find(t => t.id === enclosure.enclosureTypeId) || enclosureTypes[0];
  const typeName = type?.name || 'Enclosure';
  const totalTrays = type?.spliceTrays || 4;
  const trayAssignments = enclosure.trayAssignments || {};

  // Group trays by owner
  const distinctOwners: CoreOwner[] = ['ITEL', 'SYMC', 'UIH', 'None'];
  const trayOwnerGroups = distinctOwners.map(owner => {
    const matchingTrayIds: number[] = [];
    for (let i = 1; i <= totalTrays; i++) {
      const assigned = trayAssignments[i] || 'None';
      if (assigned === owner) {
        matchingTrayIds.push(i);
      }
    }
    if (matchingTrayIds.length === 0) return null;
    const trayRanges = formatNumberRanges(matchingTrayIds).split(', ').map(r => r.includes('-') ? `T${r.replace('-', '-T')}` : `T${r}`).join(', ');
    return {
      owner,
      trayIds: matchingTrayIds,
      count: matchingTrayIds.length,
      trayRanges
    };
  }).filter(Boolean);

  // Connected routes and ports
  const connectedRoutes = routes.filter(r => r.startEnclosureId === enclosure.id || r.endEnclosureId === enclosure.id);
  const portAssignments = enclosure.portAssignments || {};

  const ownerColorMap: Record<string, { text: string, bar: string, bg: string, border: string }> = {
    ITEL: { text: 'text-amber-500 font-bold', bar: 'bg-amber-500', bg: 'bg-amber-500/15', border: 'border-amber-500/30' },
    SYMC: { text: 'text-pink-500 font-bold', bar: 'bg-pink-500', bg: 'bg-pink-500/15', border: 'border-pink-500/30' },
    UIH: { text: 'text-sky-500 font-bold', bar: 'bg-sky-500', bg: 'bg-sky-500/15', border: 'border-sky-500/30' },
    None: { text: 'text-slate-400 font-bold', bar: 'bg-slate-400', bg: 'bg-slate-500/15', border: 'border-slate-500/30' }
  };

  const portThemes: Record<number, { bg: string, border: string, text: string, badgeBg: string }> = {
    1: { bg: 'bg-blue-600', border: 'border-blue-400', text: 'text-blue-400', badgeBg: 'bg-blue-500/15 border-blue-500/30 text-blue-400' },
    2: { bg: 'bg-emerald-600', border: 'border-emerald-400', text: 'text-emerald-400', badgeBg: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400' },
    6: { bg: 'bg-violet-600', border: 'border-violet-400', text: 'text-violet-400', badgeBg: 'bg-violet-500/15 border-violet-500/30 text-violet-400' },
    3: { bg: 'bg-amber-600', border: 'border-amber-400', text: 'text-amber-400', badgeBg: 'bg-amber-500/15 border-amber-500/30 text-amber-400' },
    4: { bg: 'bg-cyan-600', border: 'border-cyan-400', text: 'text-cyan-400', badgeBg: 'bg-cyan-500/15 border-cyan-500/30 text-cyan-400' },
    5: { bg: 'bg-rose-600', border: 'border-rose-400', text: 'text-rose-400', badgeBg: 'bg-rose-500/15 border-rose-500/30 text-rose-400' }
  };

  const dropPortDefaultOwners: Record<number, CoreOwner> = {
    3: 'ITEL',
    4: 'SYMC',
    5: 'UIH'
  };

  const getDropOwner = (pId: number): CoreOwner => {
    if (portAssignments[pId]?.owner && portAssignments[pId].owner !== 'None') {
      return portAssignments[pId].owner!;
    }
    return dropPortDefaultOwners[pId] || 'None';
  };

  // Helper to extract clean remote destination from route name relative to current enclosure
  const getRemoteTargetName = (route: Route) => {
    const parts = route.name.split(' - ');
    if (parts.length === 2) {
      if (parts[0].includes(enclosure.name) || (enclosure.name && parts[0].includes(enclosure.name.split(' ')[0]))) {
        return parts[1].trim();
      }
      return parts[0].trim();
    }
    return route.name;
  };

  const getShortCode = (name: string) => {
    const match = name.match(/(BJ#[\w/]+|[A-Za-z0-9#-]+)/);
    if (match) return match[1];
    return name.slice(0, 10);
  };

  // Main cable port mapping for P1, P2, P6 (Main Ports)
  const mainPortOrder = [1, 2, 6];
  const mainPortMap: Record<number, Route | null> = {};
  const assignedRouteIds = new Set<string>();

  mainPortOrder.forEach(pId => {
    const assignment = portAssignments[pId];
    if (assignment?.routeId) {
      const route = routes.find(r => r.id === assignment.routeId) || null;
      if (route) {
        mainPortMap[pId] = route;
        assignedRouteIds.add(route.id);
      }
    }
  });

  const availableMainPorts = mainPortOrder.filter(pId => !mainPortMap[pId]);
  const unassignedConnectedRoutes = connectedRoutes.filter(r => !assignedRouteIds.has(r.id));

  unassignedConnectedRoutes.forEach((route, idx) => {
    if (idx < availableMainPorts.length) {
      const pId = availableMainPorts[idx];
      mainPortMap[pId] = route;
    }
  });

  // Collect connected main cable entries for bottom list
  const connectedMainCableEntries = mainPortOrder
    .filter(pId => mainPortMap[pId])
    .map(pId => ({
      portId: pId,
      route: mainPortMap[pId]!,
      theme: portThemes[pId] || portThemes[1],
      remoteTarget: getRemoteTargetName(mainPortMap[pId]!)
    }));

  return (
    <div className="p-1 space-y-2 text-slate-800 dark:text-slate-100 min-w-[340px] max-w-[460px] w-auto">
      {/* Header: Name & Type */}
      <div className="border-b border-slate-200 dark:border-slate-800 pb-1.5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className="font-bold text-[12px] leading-snug text-slate-900 dark:text-slate-100 block">
              {enclosure.name}
            </span>
            {enclosure.locationName && (
              <span className="text-[8.5px] text-slate-500 font-medium block mt-0.5">
                {enclosure.locationName}
              </span>
            )}
          </div>
          <span 
            className="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider shrink-0 border"
            style={{ 
              backgroundColor: `${type?.color || '#ef4444'}20`, 
              borderColor: `${type?.color || '#ef4444'}40`,
              color: type?.color || '#ef4444' 
            }}
          >
            {typeName}
          </span>
        </div>
      </div>

      {/* Location Type & Coordinates (พิกัด) */}
      <div className="grid grid-cols-2 gap-2 bg-slate-100 dark:bg-slate-950/60 rounded-xl p-2 text-[9px] border border-slate-200 dark:border-slate-800">
        <div>
          <span className="text-[7.5px] font-black uppercase tracking-wider text-slate-500 block flex items-center gap-1">
            <Radio className="w-2.5 h-2.5 text-blue-500" /> Location Type
          </span>
          <span className="font-bold text-slate-800 dark:text-slate-200 block mt-0.5 text-[9.5px]">
            {enclosure.locationType || 'Manhole / Pole'}
          </span>
        </div>
        <div>
          <span className="text-[7.5px] font-black uppercase tracking-wider text-slate-500 block flex items-center gap-1">
            <MapPin className="w-2.5 h-2.5 text-rose-500" /> Coordinates (พิกัด)
          </span>
          <span className="font-mono font-bold text-slate-700 dark:text-slate-300 block mt-0.5 text-[8.5px]">
            {enclosure.position.lat.toFixed(6)}, {enclosure.position.lng.toFixed(6)}
          </span>
        </div>
      </div>

      {/* Owner Splice Trays */}
      <div className="space-y-1 bg-slate-100/70 dark:bg-slate-950/40 rounded-xl p-2 border border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between text-[8px] font-black uppercase tracking-wider text-slate-500">
          <span className="flex items-center gap-1">
            <Layers className="w-2.5 h-2.5 text-indigo-500" /> Owner Splice Trays ({totalTrays} Trays)
          </span>
        </div>

        {/* Mini Visual Tray Slots */}
        <div className="grid grid-cols-4 sm:grid-cols-6 gap-1 pt-0.5">
          {Array.from({ length: totalTrays }, (_, i) => i + 1).map(trayNum => {
            const owner = trayAssignments[trayNum] || 'None';
            const theme = ownerColorMap[owner] || ownerColorMap.None;
            return (
              <div 
                key={trayNum}
                className={`flex flex-col items-center justify-center p-1 rounded-lg border text-center ${theme.bg} ${theme.border}`}
                title={`Tray ${trayNum}: ${owner}`}
              >
                <span className="text-[7px] font-bold text-slate-500">T{trayNum}</span>
                <span className={`text-[7.5px] font-black uppercase ${theme.text}`}>
                  {owner === 'None' ? '-' : owner}
                </span>
              </div>
            );
          })}
        </div>

        {/* Tray Summary by Owner */}
        <div className="flex flex-wrap gap-1.5 pt-1">
          {trayOwnerGroups.map((g: any) => {
            const theme = ownerColorMap[g.owner] || ownerColorMap.None;
            return (
              <div key={g.owner} className="flex items-center gap-1 text-[8px] font-mono">
                <span className={`w-1.5 h-1.5 rounded-full ${theme.bar}`} />
                <span className={`font-bold ${theme.text}`}>{g.owner}:</span>
                <span className="text-slate-600 dark:text-slate-400 font-semibold">{g.trayRanges} ({g.count}T)</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Physical View Preview with Correlated Ports & Routes */}
      <div className="space-y-1.5 bg-slate-900 text-slate-100 rounded-xl p-2.5 border border-slate-800">
        <div className="flex items-center justify-between text-[8px] font-black uppercase tracking-wider text-slate-400">
          <span className="flex items-center gap-1">
            <Box className="w-2.5 h-2.5 text-amber-400" /> Physical Hardware Layout
          </span>
          <span className="text-brand-400 font-mono text-[7.5px] font-bold">
            {connectedMainCableEntries.length} Cables Connected
          </span>
        </div>

        {/* Hardware Capsule Schematic */}
        <div className="relative py-2 px-1 flex items-center justify-between gap-2">
          {/* Left Ports (1: Main, 3: Drop ITEL, 5: Drop UIH) */}
          <div className="flex flex-col gap-1.5 shrink-0">
            {/* P1 Main */}
            {(() => {
              const route = mainPortMap[1];
              const isConnected = !!route;
              const theme = portThemes[1];
              const shortDest = route ? getShortCode(getRemoteTargetName(route)) : 'Main';
              return (
                <div className="flex items-center gap-1.5">
                  <div className={`w-5 h-4 rounded-md flex items-center justify-center font-mono text-[7.5px] font-black border transition-all ${
                    isConnected 
                      ? `${theme.bg} ${theme.border} text-white shadow-sm` 
                      : 'bg-slate-800 border-slate-700 text-slate-500'
                  }`}>
                    P1
                  </div>
                  <span className={`text-[7.5px] font-black uppercase truncate max-w-[55px] ${
                    isConnected ? theme.text : 'text-slate-500'
                  }`} title={route ? getRemoteTargetName(route) : 'Port 1 (Main)'}>
                    {isConnected ? `→ ${shortDest}` : 'Main'}
                  </span>
                </div>
              );
            })()}

            {/* P3 Drop (ITEL) */}
            {(() => {
              const owner = getDropOwner(3);
              const theme = ownerColorMap[owner] || ownerColorMap.ITEL;
              return (
                <div className="flex items-center gap-1.5">
                  <div className={`w-5 h-4 rounded-md flex items-center justify-center font-mono text-[7.5px] font-black border transition-all ${theme.bar} text-slate-950 shadow-sm shadow-amber-500/20`}>
                    P3
                  </div>
                  <span className={`text-[7.5px] font-black uppercase truncate max-w-[55px] ${theme.text}`} title={`Port 3 Drop (${owner})`}>
                    → {owner}
                  </span>
                </div>
              );
            })()}

            {/* P5 Drop (UIH) */}
            {(() => {
              const owner = getDropOwner(5);
              const theme = ownerColorMap[owner] || ownerColorMap.UIH;
              return (
                <div className="flex items-center gap-1.5">
                  <div className={`w-5 h-4 rounded-md flex items-center justify-center font-mono text-[7.5px] font-black border transition-all ${theme.bar} text-slate-950 shadow-sm shadow-sky-500/20`}>
                    P5
                  </div>
                  <span className={`text-[7.5px] font-black uppercase truncate max-w-[55px] ${theme.text}`} title={`Port 5 Drop (${owner})`}>
                    → {owner}
                  </span>
                </div>
              );
            })()}
          </div>

          {/* Central Enclosure Capsule & Tray Core */}
          <div className="flex-1 bg-slate-950 border-2 border-slate-700 rounded-2xl p-2 flex flex-col items-center justify-center shadow-inner relative overflow-hidden h-20">
            <div className="w-full h-full bg-slate-900/90 rounded-xl border border-slate-700 flex flex-col items-center justify-center gap-1 p-1">
              <div className="w-16 h-1 bg-slate-700 rounded-full" />
              <div className="w-20 h-1.5 bg-brand-500/40 rounded-full border border-brand-500/50" />
              <div className="w-20 h-1.5 bg-brand-500/40 rounded-full border border-brand-500/50" />
              <div className="w-16 h-1 bg-slate-700 rounded-full" />
            </div>
            <span className="text-[6.5px] font-black text-slate-500 uppercase tracking-widest mt-0.5">
              FIBER ENCLOSURE
            </span>
          </div>

          {/* Right Ports (2: Main, 4: Drop SYMC, 6: Main) */}
          <div className="flex flex-col gap-1.5 shrink-0 items-end">
            {/* P2 Main */}
            {(() => {
              const route = mainPortMap[2];
              const isConnected = !!route;
              const theme = portThemes[2];
              const shortDest = route ? getShortCode(getRemoteTargetName(route)) : 'Main';
              return (
                <div className="flex items-center gap-1.5">
                  <span className={`text-[7.5px] font-black uppercase truncate max-w-[55px] text-right ${
                    isConnected ? theme.text : 'text-slate-500'
                  }`} title={route ? getRemoteTargetName(route) : 'Port 2 (Main)'}>
                    {isConnected ? `${shortDest} ←` : 'Main'}
                  </span>
                  <div className={`w-5 h-4 rounded-md flex items-center justify-center font-mono text-[7.5px] font-black border transition-all ${
                    isConnected 
                      ? `${theme.bg} ${theme.border} text-white shadow-sm` 
                      : 'bg-slate-800 border-slate-700 text-slate-500'
                  }`}>
                    P2
                  </div>
                </div>
              );
            })()}

            {/* P4 Drop (SYMC) */}
            {(() => {
              const owner = getDropOwner(4);
              const theme = ownerColorMap[owner] || ownerColorMap.SYMC;
              return (
                <div className="flex items-center gap-1.5">
                  <span className={`text-[7.5px] font-black uppercase truncate max-w-[55px] text-right ${theme.text}`} title={`Port 4 Drop (${owner})`}>
                    {owner} ←
                  </span>
                  <div className={`w-5 h-4 rounded-md flex items-center justify-center font-mono text-[7.5px] font-black border transition-all ${theme.bar} text-slate-950 shadow-sm shadow-pink-500/20`}>
                    P4
                  </div>
                </div>
              );
            })()}

            {/* P6 Main */}
            {(() => {
              const route = mainPortMap[6];
              const isConnected = !!route;
              const theme = portThemes[6];
              const shortDest = route ? getShortCode(getRemoteTargetName(route)) : 'Main';
              return (
                <div className="flex items-center gap-1.5">
                  <span className={`text-[7.5px] font-black uppercase truncate max-w-[55px] text-right ${
                    isConnected ? theme.text : 'text-slate-500'
                  }`} title={route ? getRemoteTargetName(route) : 'Port 6 (Main)'}>
                    {isConnected ? `${shortDest} ←` : 'Main'}
                  </span>
                  <div className={`w-5 h-4 rounded-md flex items-center justify-center font-mono text-[7.5px] font-black border transition-all ${
                    isConnected 
                      ? `${theme.bg} ${theme.border} text-white shadow-sm` 
                      : 'bg-slate-800 border-slate-700 text-slate-500'
                  }`}>
                    P6
                  </div>
                </div>
              );
            })()}
          </div>
        </div>

        {/* Correlated Connected Cables List */}
        {connectedMainCableEntries.length > 0 && (
          <div className="border-t border-slate-800 pt-1.5 space-y-1">
            <span className="text-[7px] font-black uppercase tracking-wider text-slate-500 block">
              Connected Cables by Port
            </span>
            {connectedMainCableEntries.map(entry => (
              <div 
                key={entry.route.id} 
                className="flex items-center justify-between text-[8px] bg-slate-950/60 rounded-lg p-1.5 border border-slate-800/80 gap-2"
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  {/* Correlated Port Badge */}
                  <span className={`px-1.5 py-0.5 rounded font-mono text-[7.5px] font-black shrink-0 border ${entry.theme.badgeBg}`}>
                    P{entry.portId}
                  </span>
                  <div className="min-w-0">
                    <span className="font-bold text-slate-200 block truncate" title={entry.route.name}>
                      {entry.route.name}
                    </span>
                    <span className="text-[7px] text-slate-400 flex items-center gap-1">
                      <span className="text-brand-400 font-bold">To: {entry.remoteTarget}</span>
                    </span>
                  </div>
                </div>
                <span className="font-mono text-[8.5px] font-black text-brand-400 shrink-0 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                  {entry.route.capacity}F
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Drop Ports Summary */}
        <div className="border-t border-slate-800/60 pt-1.5">
          <span className="text-[7px] font-black uppercase tracking-wider text-slate-500 block mb-1">
            Drop Ports by Owner
          </span>
          <div className="grid grid-cols-3 gap-1.5">
            {[3, 4, 5].map(pId => {
              const owner = getDropOwner(pId);
              const theme = ownerColorMap[owner] || ownerColorMap.None;
              return (
                <div key={pId} className={`flex items-center gap-1.5 p-1 rounded-lg border ${theme.bg} ${theme.border}`}>
                  <span className={`w-4 h-3.5 rounded flex items-center justify-center font-mono text-[7px] font-black ${theme.bar} text-slate-950 shrink-0`}>
                    P{pId}
                  </span>
                  <span className={`text-[7.5px] font-black uppercase truncate ${theme.text}`}>
                    {owner} Drop
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function MapResizer({ sidebarCollapsed, selectedRouteId, selectedEnclosureId }: { 
  sidebarCollapsed?: boolean, 
  selectedRouteId?: string,
  selectedEnclosureId?: string 
}) {
  const map = useMap();
  
  useEffect(() => {
    if (!map) return;

    // Immediate invalidation
    map.invalidateSize();

    // Aggressive invalidation during transitions (sidebar toggle, panel opening)
    // Most CSS transitions are 300ms-500ms
    const intervals = [50, 100, 200, 300, 400, 500, 800, 1000];
    const timers = intervals.map(delay => 
      setTimeout(() => {
        map.invalidateSize({ animate: true });
      }, delay)
    );

    return () => timers.forEach(clearTimeout);
  }, [map, sidebarCollapsed, !!selectedRouteId, !!selectedEnclosureId]);

  useEffect(() => {
    if (!map) return;

    const resizeObserver = new ResizeObserver(() => {
      if (!map) return;
      // Use requestAnimationFrame to ensure we're in sync with the browser's paint cycle
      const rafId = requestAnimationFrame(() => {
        if (map) {
          try {
            map.invalidateSize();
          } catch (e) {
            console.warn("MapResizer: Failed to invalidate size", e);
          }
        }
      });
      return () => cancelAnimationFrame(rafId);
    });

    const container = map.getContainer();
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, [map]);

  return null;
}

function MapLegend({ 
  enclosureTypes, 
  fiberTypes, 
  fiberColorConfigs,
  enclosures,
  routes,
  loops,
  draftRoute
}: { 
  enclosureTypes: EnclosureType[], 
  fiberTypes: FiberType[], 
  fiberColorConfigs: FiberColorConfig[],
  enclosures: FiberEnclosure[],
  routes: Route[],
  loops: FiberLoop[],
  draftRoute: Point[]
}) {
  const [isOpen, setIsOpen] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Filter enclosure types based on what's on the map
  const visibleEnclosureTypes = enclosureTypes.filter(t => 
    enclosures.some(e => 
      e.enclosureTypeId === t.id || 
      e.locationType === t.name || 
      (e.locationType && t.name && e.locationType.toLowerCase() === t.name.toLowerCase())
    )
  );

  // Filter fiber types based on what's on the map
  const visibleFiberTypes = fiberTypes.filter(ft => 
    routes.some(r => 
      (r.fiberType === ft.name) || 
      (r.capacity === ft.cores) ||
      (r.fiberType && ft.name && r.fiberType.toLowerCase() === ft.name.toLowerCase())
    )
  );

  useEffect(() => {
    console.log('Legend Visible Types:', {
      enclosures: visibleEnclosureTypes.map(t => t.name),
      fibers: visibleFiberTypes.map(t => t.name)
    });
  }, [visibleEnclosureTypes.length, visibleFiberTypes.length]);

  // Filter fiber configs based on what's on the map
  const visibleFiberConfigs = fiberColorConfigs.filter(c => {
    const ft = fiberTypes.find(f => f.id === c.fiberTypeId);
    if (!ft) return false;
    return routes.some(r => {
      const rFiberType = r.fiberType || r.capacity.toString();
      const rTier = r.tierSharing || r.tier || 'Tier 1';
      return (rFiberType.toLowerCase() === ft.name.toLowerCase() || r.capacity === ft.cores) && 
             (rTier === c.tier || (c.tier === 'Tier 1' && !r.tier && !r.tierSharing));
    });
  });

  const isVisible = visibleEnclosureTypes.length > 0 || visibleFiberTypes.length > 0 || loops.length > 0 || draftRoute.length > 0;

  useEffect(() => {
    if (!isVisible) return;

    if (containerRef.current) {
      L.DomEvent.disableClickPropagation(containerRef.current);
      L.DomEvent.disableScrollPropagation(containerRef.current);
    }
    
    const btn = buttonRef.current;
    if (!btn) return;
    
    const handleClick = (e: Event) => {
      L.DomEvent.stopPropagation(e);
      setIsOpen(prev => !prev);
    };
    
    L.DomEvent.on(btn, 'click', handleClick);
    
    return () => {
      L.DomEvent.off(btn, 'click', handleClick);
    };
  }, [isVisible]);

  if (!isVisible) {
    return null;
  }

  return (
    <div 
      ref={containerRef}
      className="leaflet-top leaflet-right leaflet-control" 
      style={{ marginTop: '8px', marginRight: '8px', zIndex: 1000, pointerEvents: 'auto' }}
    >
      <div className="bg-slate-900 rounded-lg shadow-xl border border-slate-800 overflow-hidden min-w-[140px] max-w-[220px]">
        <button 
          ref={buttonRef}
          type="button"
          className="w-full px-2.5 py-1.5 bg-slate-900 flex items-center justify-between hover:bg-slate-800 transition-colors border-b border-slate-800 cursor-pointer"
        >
          <div className="flex items-center gap-1.5">
            <Info className="w-3 h-3 text-brand-600" />
            <span className="text-[8px] font-black text-slate-700 uppercase tracking-wider">Legend</span>
          </div>
          {isOpen ? <ChevronUp className="w-3 h-3 text-slate-400" /> : <ChevronDown className="w-3 h-3 text-slate-400" />}
        </button>

        {isOpen && (
          <div className="p-2.5 space-y-3 max-h-[280px] overflow-y-auto custom-scrollbar">
            {/* Enclosures */}
            {visibleEnclosureTypes.length > 0 && (
              <div>
                <h4 className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Enclosures</h4>
                <div className="space-y-1">
                  {visibleEnclosureTypes.map(type => (
                    <div key={type.id} className="flex items-center gap-1.5">
                      {type.icon ? (
                        <img src={type.icon} alt={type.name} className="w-3.5 h-3.5 object-contain" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="w-2.5 h-2.5 rounded-full border border-slate-800" style={{ backgroundColor: type.color || '#64748b' }} />
                      )}
                      <span className="text-[8px] font-medium text-slate-300">{type.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Routes */}
            {visibleFiberTypes.length > 0 && (
              <div>
                <h4 className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Routes</h4>
                <div className="space-y-1">
                  {visibleFiberTypes.map(ft => {
                    const configs = visibleFiberConfigs.filter(c => c.fiberTypeId === ft.id);
                    if (configs.length > 0) {
                      return configs.map(config => (
                        <div key={config.id} className="flex items-center gap-1.5">
                          <div className="w-4 h-0.5 rounded-full" style={{ backgroundColor: config.color }} />
                          <span className="text-[8px] font-medium text-slate-300">{ft.name} ({config.tier})</span>
                        </div>
                      ));
                    }
                    return (
                      <div key={ft.id} className="flex items-center gap-1.5">
                        <div className="w-4 h-0.5 rounded-full" style={{ backgroundColor: ft.color || '#10b981' }} />
                        <span className="text-[8px] font-medium text-slate-300">{ft.name}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Others */}
            {(loops.length > 0 || draftRoute.length > 0) && (
              <div>
                <h4 className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Others</h4>
                <div className="space-y-1">
                  {loops.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-orange-500" />
                      <span className="text-[8px] font-medium text-slate-300">Fiber Loop</span>
                    </div>
                  )}
                  {draftRoute.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      <div className="w-4 h-0.5 rounded-full border border-dashed border-amber-500" />
                      <span className="text-[8px] font-medium text-slate-300">Draft Route</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function MapControls({ enclosures, routes, loops }: { 
  enclosures: FiberEnclosure[], 
  routes: Route[], 
  loops: FiberLoop[] 
}) {
  const map = useMap();
  const hasFocusedRef = useRef(false);

  const focusAll = () => {
    if (!map) return;
    if (enclosures.length === 0 && routes.length === 0 && loops.length === 0) return;

    const bounds = L.latLngBounds([]);
    
    enclosures.forEach(e => bounds.extend([e.position.lat, e.position.lng]));
    routes.forEach(r => r.path.forEach(p => bounds.extend([p.lat, p.lng])));
    loops.forEach(l => bounds.extend([l.position.lat, l.position.lng]));

    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
    }
  };

  useEffect(() => {
    if (!map || hasFocusedRef.current) return;
    if (enclosures.length === 0 && routes.length === 0 && loops.length === 0) return;

    focusAll();
    hasFocusedRef.current = true;
  }, [map, enclosures, routes, loops]);

  return (
    <div className="absolute top-[8px] left-[8px] z-[1000]">
      <div className="flex flex-row overflow-hidden bg-slate-900 shadow-md rounded-md border border-slate-800">
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); map.zoomIn(); }}
          className="bg-slate-900 hover:bg-slate-800 text-slate-300 p-1.5 flex items-center justify-center transition-colors border-r border-slate-700"
          title="Zoom in"
          style={{ width: '28px', height: '28px', border: 'none', cursor: 'pointer' }}
        >
          <Plus size={14} />
        </button>
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); map.zoomOut(); }}
          className="bg-slate-900 hover:bg-slate-800 text-slate-300 p-1.5 flex items-center justify-center transition-colors border-r border-slate-700"
          title="Zoom out"
          style={{ width: '28px', height: '28px', border: 'none', cursor: 'pointer' }}
        >
          <Minus size={14} />
        </button>
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            focusAll();
          }}
          className="bg-slate-900 hover:bg-slate-800 text-slate-300 p-1.5 flex items-center justify-center transition-colors"
          title="Focus all objects"
          style={{ width: '28px', height: '28px', border: 'none', cursor: 'pointer' }}
        >
          <Maximize size={14} />
        </button>
      </div>
    </div>
  );
}

function MapSearchControl({
  enclosures,
  routes,
  loops,
  enclosureTypes,
  onEnclosureClick,
  onRouteClick,
  setSearchPin
}: {
  enclosures: FiberEnclosure[];
  routes: Route[];
  loops: FiberLoop[];
  enclosureTypes: EnclosureType[];
  onEnclosureClick?: (enclosure: FiberEnclosure) => void;
  onRouteClick: (route: Route) => void;
  setSearchPin: (pin: { lat: number; lng: number; label: string } | null) => void;
}) {
  const map = useMap();
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [filterType, setFilterType] = useState<'all' | 'coords' | 'enclosure' | 'route' | 'loop' | 'core'>('all');
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Global hotkey: Ctrl+K, Cmd+K, or / to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setIsOpen(true);
      } else if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        inputRef.current?.focus();
        setIsOpen(true);
      } else if (e.key === 'Escape') {
        setIsOpen(false);
        inputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Click outside to close results dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const q = query.trim().toLowerCase();
  const parsedCoord = parseCoordinates(query);

  // Filter Enclosures
  const matchingEnclosures = q ? enclosures.filter(e => {
    const type = enclosureTypes.find(t => t.id === e.enclosureTypeId);
    return (
      e.name.toLowerCase().includes(q) ||
      e.locationName?.toLowerCase().includes(q) ||
      e.locationType?.toLowerCase().includes(q) ||
      type?.name.toLowerCase().includes(q) ||
      e.id.toLowerCase().includes(q)
    );
  }) : [];

  // Filter Routes
  const matchingRoutes = q ? routes.filter(r => {
    return (
      r.name.toLowerCase().includes(q) ||
      r.tier?.toLowerCase().includes(q) ||
      r.fiberType?.toLowerCase().includes(q) ||
      `${r.capacity}f`.includes(q) ||
      `${r.capacity}`.includes(q) ||
      r.owners?.some(o => o.toLowerCase().includes(q))
    );
  }) : [];

  // Filter Loops
  const matchingLoops = q ? loops.filter(l => {
    return (
      l.name.toLowerCase().includes(q) ||
      `${l.length}m`.includes(q) ||
      `${l.length}`.includes(q)
    );
  }) : [];

  // Filter Cores / Customer Circuits / Descriptions
  const matchingCores: { route: Route; core: Core; tubeNo: number }[] = [];
  if (q && q.length >= 2) {
    routes.forEach(r => {
      (r.cores || []).forEach(c => {
        const descMatch = (c.details || c.label)?.toLowerCase().includes(q);
        const ownerMatch = c.owner?.toLowerCase().includes(q);
        const idMatch = `core ${c.id}`.includes(q) || `c${c.id}` === q || `${c.id}` === q;
        if (descMatch || (ownerMatch && q.length > 2) || idMatch) {
          matchingCores.push({
            route: r,
            core: c,
            tubeNo: Math.floor((c.id - 1) / 12) + 1
          });
        }
      });
    });
  }

  const totalResultsCount = (parsedCoord ? 1 : 0) + matchingEnclosures.length + matchingRoutes.length + matchingLoops.length + matchingCores.length;

  const handleSelectCoordinate = (lat: number, lng: number) => {
    map.flyTo([lat, lng], 18, { animate: true, duration: 1.2 });
    setSearchPin({
      lat,
      lng,
      label: `Coordinates: ${lat.toFixed(6)}, ${lng.toFixed(6)}`
    });
    setIsOpen(false);
  };

  const handleSelectEnclosure = (enclosure: FiberEnclosure) => {
    map.flyTo([enclosure.position.lat, enclosure.position.lng], 18, { animate: true, duration: 1.2 });
    if (onEnclosureClick) {
      onEnclosureClick(enclosure);
    }
    setIsOpen(false);
  };

  const handleSelectRoute = (route: Route) => {
    if (route.path.length > 0) {
      const bounds = L.latLngBounds(route.path.map(p => [p.lat, p.lng]));
      map.fitBounds(bounds, { padding: [80, 80], maxZoom: 17, animate: true });
    }
    onRouteClick(route);
    setIsOpen(false);
  };

  const handleSelectLoop = (loop: FiberLoop) => {
    map.flyTo([loop.position.lat, loop.position.lng], 18, { animate: true, duration: 1.2 });
    setIsOpen(false);
  };

  return (
    <div 
      ref={containerRef}
      className="absolute top-2.5 left-28 sm:left-32 z-[1000] w-[260px] sm:w-[360px] md:w-[440px]"
    >
      {/* Search Input Bar */}
      <div className="relative group">
        <div className="relative flex items-center bg-slate-900/90 hover:bg-slate-900 focus-within:bg-slate-900 backdrop-blur-md border border-slate-700/80 focus-within:border-brand-500 rounded-2xl shadow-2xl transition-all">
          <div className="pl-3 pr-2 flex items-center pointer-events-none text-slate-400 group-focus-within:text-brand-400">
            <Search className="w-3.5 h-3.5 transition-transform group-focus-within:scale-110" />
          </div>

          <input 
            ref={inputRef}
            type="text"
            className="w-full bg-transparent py-2 pr-14 text-xs text-slate-100 placeholder-slate-400 outline-none font-medium"
            placeholder="Search coordinates (13.738, 100.531), closures, routes, cores..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIsOpen(true);
            }}
            onFocus={() => setIsOpen(true)}
          />

          <div className="absolute right-2 flex items-center gap-1">
            {query ? (
              <button 
                onClick={() => {
                  setQuery('');
                  setIsOpen(false);
                  inputRef.current?.focus();
                }}
                className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
                title="Clear"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            ) : (
              <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[8.5px] font-mono text-slate-400 bg-slate-800 border border-slate-700 rounded-md shadow-inner">
                ⌘K
              </kbd>
            )}
          </div>
        </div>

        {/* Filter Category Chips (when focused or searching) */}
        {isOpen && (
          <div className="flex items-center gap-1 px-1 pt-1.5 overflow-x-auto no-scrollbar">
            {(['all', 'coords', 'enclosure', 'route', 'loop', 'core'] as const).map(type => (
              <button
                key={type}
                onClick={() => setFilterType(type)}
                className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider transition-all shrink-0 border ${
                  filterType === type 
                    ? 'bg-brand-500 text-slate-900 border-brand-400 shadow-md font-bold' 
                    : 'bg-slate-900/80 text-slate-400 border-slate-700/80 hover:bg-slate-800 hover:text-slate-200'
                }`}
              >
                {type === 'all' && `All (${totalResultsCount})`}
                {type === 'coords' && `📍 Coords`}
                {type === 'enclosure' && `📦 Closures (${matchingEnclosures.length})`}
                {type === 'route' && `⚡ Routes (${matchingRoutes.length})`}
                {type === 'loop' && `🔄 Loops (${matchingLoops.length})`}
                {type === 'core' && `🧵 Cores (${matchingCores.length})`}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Results Dropdown */}
      {isOpen && query.trim() && (
        <div className="mt-2 bg-slate-900/95 backdrop-blur-xl border border-slate-700/90 rounded-2xl shadow-2xl overflow-hidden max-h-[360px] overflow-y-auto custom-scrollbar divide-y divide-slate-800/80">
          {totalResultsCount === 0 ? (
            <div className="p-5 text-center text-slate-400">
              <Search className="w-5 h-5 mx-auto mb-1.5 opacity-30 text-slate-400" />
              <p className="text-xs font-bold text-slate-300">No results found for "{query}"</p>
              <p className="text-[10px] text-slate-500 mt-0.5">Try coordinates like 13.7381, 100.5312 or a cable name</p>
            </div>
          ) : null}

          {/* Coordinates Match */}
          {parsedCoord && (filterType === 'all' || filterType === 'coords') && (
            <div className="p-1.5">
              <div className="px-2.5 py-1 text-[8px] font-black uppercase tracking-wider text-rose-400 flex items-center gap-1">
                <MapPin className="w-2.5 h-2.5" /> Direct Coordinate Target
              </div>
              <button
                onClick={() => handleSelectCoordinate(parsedCoord.lat, parsedCoord.lng)}
                className="w-full text-left p-2 rounded-xl hover:bg-slate-800/80 transition-all flex items-center justify-between group"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-lg bg-rose-500/20 text-rose-400 border border-rose-500/40 flex items-center justify-center shrink-0">
                    <Navigation className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
                  </div>
                  <div className="min-w-0">
                    <span className="font-mono font-bold text-xs text-slate-100 block">
                      {parsedCoord.lat.toFixed(6)}, {parsedCoord.lng.toFixed(6)}
                    </span>
                    <span className="text-[9px] text-slate-400 block">
                      Click to fly map to coordinates & drop pin
                    </span>
                  </div>
                </div>
                <CornerDownRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-brand-400 shrink-0" />
              </button>
            </div>
          )}

          {/* Enclosures Matches */}
          {matchingEnclosures.length > 0 && (filterType === 'all' || filterType === 'enclosure') && (
            <div className="p-1.5">
              <div className="px-2.5 py-1 text-[8px] font-black uppercase tracking-wider text-blue-400 flex items-center justify-between">
                <span className="flex items-center gap-1"><Box className="w-2.5 h-2.5" /> Fiber Enclosures</span>
                <span className="font-mono text-[9px]">{matchingEnclosures.length}</span>
              </div>
              <div className="space-y-0.5">
                {matchingEnclosures.map(e => {
                  const type = enclosureTypes.find(t => t.id === e.enclosureTypeId);
                  return (
                    <button
                      key={e.id}
                      onClick={() => handleSelectEnclosure(e)}
                      className="w-full text-left p-2 rounded-xl hover:bg-slate-800/80 transition-all flex items-center justify-between group"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div 
                          className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border"
                          style={{ 
                            backgroundColor: `${type?.color || '#3b82f6'}20`, 
                            borderColor: `${type?.color || '#3b82f6'}50`,
                            color: type?.color || '#3b82f6'
                          }}
                        >
                          <Box className="w-3.5 h-3.5" />
                        </div>
                        <div className="min-w-0">
                          <span className="font-bold text-xs text-slate-100 block truncate group-hover:text-brand-400">
                            {e.name}
                          </span>
                          <span className="text-[9px] text-slate-400 flex items-center gap-1.5 truncate">
                            <span className="font-semibold text-slate-300">{type?.name || 'Enclosure'}</span>
                            {e.locationType && <span>• {e.locationType}</span>}
                            <span className="font-mono text-[8px] text-slate-500">
                              ({e.position.lat.toFixed(4)}, {e.position.lng.toFixed(4)})
                            </span>
                          </span>
                        </div>
                      </div>
                      <CornerDownRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-brand-400 shrink-0" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Routes Matches */}
          {matchingRoutes.length > 0 && (filterType === 'all' || filterType === 'route') && (
            <div className="p-1.5">
              <div className="px-2.5 py-1 text-[8px] font-black uppercase tracking-wider text-emerald-400 flex items-center justify-between">
                <span className="flex items-center gap-1"><Cable className="w-2.5 h-2.5" /> Fiber Routes</span>
                <span className="font-mono text-[9px]">{matchingRoutes.length}</span>
              </div>
              <div className="space-y-0.5">
                {matchingRoutes.map(r => (
                  <button
                    key={r.id}
                    onClick={() => handleSelectRoute(r)}
                    className="w-full text-left p-2 rounded-xl hover:bg-slate-800/80 transition-all flex items-center justify-between group"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center shrink-0">
                        <Cable className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0">
                        <span className="font-bold text-xs text-slate-100 block truncate group-hover:text-brand-400">
                          {r.name}
                        </span>
                        <span className="text-[9px] text-slate-400 flex items-center gap-1.5 truncate">
                          <span className="px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-400 font-mono font-bold text-[8px]">
                            {r.capacity}F
                          </span>
                          {r.totalLength !== undefined && <span>{r.totalLength}m</span>}
                          {r.tier && <span className="font-semibold text-slate-300">• {r.tier}</span>}
                          {r.owners && r.owners.length > 0 && (
                            <span className="text-amber-400 font-bold">• {r.owners.join(', ')}</span>
                          )}
                        </span>
                      </div>
                    </div>
                    <CornerDownRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-brand-400 shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Loops Matches */}
          {matchingLoops.length > 0 && (filterType === 'all' || filterType === 'loop') && (
            <div className="p-1.5">
              <div className="px-2.5 py-1 text-[8px] font-black uppercase tracking-wider text-orange-400 flex items-center justify-between">
                <span className="flex items-center gap-1"><RefreshCcw className="w-2.5 h-2.5" /> Fiber Loops</span>
                <span className="font-mono text-[9px]">{matchingLoops.length}</span>
              </div>
              <div className="space-y-0.5">
                {matchingLoops.map(l => (
                  <button
                    key={l.id}
                    onClick={() => handleSelectLoop(l)}
                    className="w-full text-left p-2 rounded-xl hover:bg-slate-800/80 transition-all flex items-center justify-between group"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-orange-500/20 text-orange-400 border border-orange-500/40 flex items-center justify-center shrink-0">
                        <RefreshCcw className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0">
                        <span className="font-bold text-xs text-slate-100 block truncate group-hover:text-brand-400">
                          {l.name}
                        </span>
                        <span className="text-[9px] text-slate-400 flex items-center gap-1.5">
                          <span className="font-mono font-bold text-orange-400">{l.length}m</span>
                          <span className="font-mono text-[8px] text-slate-500">
                            ({l.position.lat.toFixed(4)}, {l.position.lng.toFixed(4)})
                          </span>
                        </span>
                      </div>
                    </div>
                    <CornerDownRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-brand-400 shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Cores / Customer Circuit Matches */}
          {matchingCores.length > 0 && (filterType === 'all' || filterType === 'core') && (
            <div className="p-1.5">
              <div className="px-2.5 py-1 text-[8px] font-black uppercase tracking-wider text-indigo-400 flex items-center justify-between">
                <span className="flex items-center gap-1"><Layers className="w-2.5 h-2.5" /> Cores & Customer Usage</span>
                <span className="font-mono text-[9px]">{matchingCores.length}</span>
              </div>
              <div className="space-y-0.5">
                {matchingCores.slice(0, 8).map((match, idx) => (
                  <button
                    key={`${match.route.id}-c-${match.core.id}-${idx}`}
                    onClick={() => handleSelectRoute(match.route)}
                    className="w-full text-left p-2 rounded-xl hover:bg-slate-800/80 transition-all flex items-center justify-between group"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/40 flex items-center justify-center shrink-0 font-mono text-[9px] font-black">
                        C{match.core.id}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-xs text-slate-100 group-hover:text-brand-400">
                            Core {match.core.id} (Tube {match.tubeNo})
                          </span>
                          <span className="px-1 py-0.2 rounded bg-slate-800 text-[8px] font-black uppercase text-amber-400 border border-slate-700">
                            {match.core.owner}
                          </span>
                        </div>
                        <span className="text-[9px] text-slate-400 block truncate">
                          {match.core.details || match.core.label || `In ${match.route.name}`}
                        </span>
                      </div>
                    </div>
                    <CornerDownRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-brand-400 shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function FiberMap({ 
  enclosures, 
  routes, 
  enclosureTypes,
  fiberTypes,
  fiberColorConfigs,
  loops,
  drawingMode, 
  draftRoute, 
  onMapClick, 
  onRouteClick, 
  onEnclosureClick,
  selectedRouteId,
  selectedEnclosureId,
  editingRouteId,
  onMarkerDragEnd,
  onMarkerClick,
  onDraftRouteClick,
  sidebarCollapsed,
  onEditRoute,
  onEditEnclosure,
  onEnclosureDragEnd,
  editingEnclosureId
}: FiberMapProps) {
  const [searchPin, setSearchPin] = useState<{ lat: number; lng: number; label: string } | null>(null);
  const [copiedPin, setCopiedPin] = useState(false);
  const [menuData, setMenuData] = useState<{
    type: 'route' | 'enclosure';
    data: any;
    position: [number, number];
  } | null>(null);

  const [hoveredObjectId, setHoveredObjectId] = useState<string | null>(null);

  const { handleMapClick: originalHandleMapClick, handleEnclosureClick: originalHandleEnclosureClick, handleMarkerDragEnd, handleMarkerClick, handleDraftRouteClick } = useMapDrawing(
    drawingMode,
    onMapClick,
    onEnclosureClick,
    onMarkerDragEnd,
    onMarkerClick,
    onDraftRouteClick
  );

  const handleMapClick = (latlng: L.LatLng) => {
    setMenuData(null);
    setHoveredObjectId(null);
    originalHandleMapClick(latlng);
  };

  const handleEnclosureClick = (enclosure: FiberEnclosure, e: L.LeafletMouseEvent) => {
    if (e.originalEvent) {
      e.originalEvent.stopPropagation();
    }
    
    if (drawingMode === 'none') {
      setMenuData({
        type: 'enclosure',
        data: enclosure,
        position: [enclosure.position.lat, enclosure.position.lng]
      });
      setHoveredObjectId(enclosure.id);
    } else {
      originalHandleEnclosureClick(enclosure, e);
    }
  };

  const handleRouteClick = (route: Route, e: L.LeafletMouseEvent) => {
    if (e.originalEvent) {
      e.originalEvent.stopPropagation();
    }
    if (drawingMode === 'none') {
      setMenuData({
        type: 'route',
        data: route,
        position: [e.latlng.lat, e.latlng.lng]
      });
      setHoveredObjectId(route.id);
    } else {
      onRouteClick(route);
    }
  };

  // Default center (Bangkok, Thailand)
  const center = { lat: 13.7563, lng: 100.5018 };

  const visibleRoutes = routes.filter(r => r.id !== editingRouteId);

  const getEnclosureType = (enclosure: FiberEnclosure) => {
    if (enclosure.enclosureTypeId) {
      return enclosureTypes.find(et => et.id === enclosure.enclosureTypeId);
    }
    return enclosureTypes.find(et => et.name === enclosure.locationType);
  };

  const getEnclosureColor = (enclosure: FiberEnclosure) => {
    const t = getEnclosureType(enclosure);
    return t ? t.color : '#ef4444';
  };

  const getRouteColor = (route: Route) => {
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

  return (
    <MapContainer 
      center={center} 
      zoom={13} 
      zoomControl={false}
      className={`w-full h-full z-0 bg-slate-900 fiber-map-container ${drawingMode !== 'none' ? 'cursor-crosshair' : ''}`}
      style={{ height: '100%', width: '100%' }}
    >
      <LayersControl position="topleft">
        <LayersControl.BaseLayer checked name="Google Roadmap">
          <TileLayer
            attribution='&copy; Google'
            url="https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}"
            className="map-tile-filter"
          />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name="Google Satellite">
          <TileLayer
            attribution='&copy; Google'
            url="https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}"
          />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name="Google Hybrid">
          <TileLayer
            attribution='&copy; Google'
            url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"
          />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name="Google Terrain">
          <TileLayer
            attribution='&copy; Google'
            url="https://mt1.google.com/vt/lyrs=p&x={x}&y={y}&z={z}"
            className="map-tile-filter"
          />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name="Light (Clean)">
          <TileLayer
            attribution='&copy; Google'
            url="https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}"
            className="grayscale opacity-80 map-tile-filter"
          />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name="Natural (OSM)">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            className="map-tile-filter"
          />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name="Satellite (Esri)">
          <TileLayer
            attribution='Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          />
        </LayersControl.BaseLayer>

        <LayersControl.Overlay checked name="Enclosures">
          <LayerGroup>
            {enclosures.map(enclosure => {
              const type = getEnclosureType(enclosure);
              const color = type ? type.color : '#ef4444';
              const iconUrl = type?.icon;

              const isEditingThis = drawingMode === 'edit-enclosure' && editingEnclosureId === enclosure.id;

              if (iconUrl) {
                const customIcon = new L.Icon({
                  iconUrl: iconUrl,
                  iconSize: isEditingThis ? [18, 18] : [10, 10],
                  iconAnchor: isEditingThis ? [9, 9] : [5, 5],
                  className: (selectedEnclosureId === enclosure.id || isEditingThis) ? 'border-2 border-blue-500 rounded-sm shadow-lg' : ''
                });

                return (
                  <Marker
                    key={enclosure.id}
                    position={[enclosure.position.lat, enclosure.position.lng]}
                    icon={customIcon}
                    draggable={isEditingThis}
                    bubblingMouseEvents={false}
                    eventHandlers={{
                      click: (e) => handleEnclosureClick(enclosure, e),
                      dragend: (e) => {
                        if (onEnclosureDragEnd) {
                          const marker = e.target;
                          const position = marker.getLatLng();
                          onEnclosureDragEnd(enclosure, { lat: position.lat, lng: position.lng });
                        }
                      }
                    }}
                  >
                    <Tooltip sticky opacity={1} className="route-detail-tooltip min-w-[320px] max-w-[420px] w-auto">
                      <EnclosureTooltipContent 
                        enclosure={enclosure} 
                        enclosureTypes={enclosureTypes} 
                        routes={routes} 
                      />
                    </Tooltip>
                  </Marker>
                );
              }

              return (
                <CircleMarker 
                  key={enclosure.id} 
                  center={[enclosure.position.lat, enclosure.position.lng]} 
                  radius={isEditingThis ? 6 : 3} 
                  bubblingMouseEvents={false}
                  pathOptions={{ 
                    color: (selectedEnclosureId === enclosure.id || hoveredObjectId === enclosure.id || isEditingThis) ? '#3b82f6' : color, 
                    fillColor: (selectedEnclosureId === enclosure.id || hoveredObjectId === enclosure.id || isEditingThis) ? '#3b82f6' : color, 
                    fillOpacity: 1, 
                    weight: (selectedEnclosureId === enclosure.id || hoveredObjectId === enclosure.id || isEditingThis) ? 2.2 : 1.2 
                  }}
                  eventHandlers={{
                    click: (e) => handleEnclosureClick(enclosure, e)
                  }}
                >
                  <Tooltip sticky opacity={1} className="route-detail-tooltip min-w-[320px] max-w-[420px] w-auto">
                    <EnclosureTooltipContent 
                      enclosure={enclosure} 
                      enclosureTypes={enclosureTypes} 
                      routes={routes} 
                    />
                  </Tooltip>
                </CircleMarker>
              );
            })}
          </LayerGroup>
        </LayersControl.Overlay>

        <LayersControl.Overlay checked name="Routes">
          <LayerGroup>
            {visibleRoutes.map(route => (
              <Polyline
                key={route.id}
                positions={route.path.map(p => [p.lat, p.lng])}
                bubblingMouseEvents={false}
                pathOptions={{
                  color: (selectedRouteId === route.id || hoveredObjectId === route.id) ? '#3b82f6' : getRouteColor(route),
                  weight: (selectedRouteId === route.id || hoveredObjectId === route.id) ? 3.8 : 2.2,
                  opacity: 0.8
                }}
                eventHandlers={{
                  click: (e) => handleRouteClick(route, e)
                }}
              >
                <Tooltip sticky opacity={1} className="route-detail-tooltip min-w-[340px] max-w-[500px] w-auto">
                  <div className="p-1 space-y-2 text-slate-800 dark:text-slate-100">
                    {/* Route Name & Capacity Header */}
                    <div className="border-b border-slate-200 dark:border-slate-800 pb-1.5">
                      <div className="flex items-start justify-between gap-3">
                        <span className="font-bold text-[11.5px] leading-snug text-slate-900 dark:text-slate-100">
                          {route.name}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-blue-500/15 border border-blue-500/30 text-[9.5px] font-black text-blue-600 dark:text-blue-400 shrink-0">
                          {route.capacity}F
                        </span>
                      </div>
                      {(route.tier || route.fiberType) && (
                        <span className="text-[8.5px] font-bold uppercase tracking-wider text-slate-500 block mt-0.5">
                          {route.tier} {route.fiberType ? `• ${route.fiberType}` : ''}
                        </span>
                      )}
                    </div>

                    {/* Length & ML หัว-ท้าย */}
                    <div className="grid grid-cols-2 gap-2 py-1.5 bg-slate-100 dark:bg-slate-950/60 rounded-xl px-2.5 text-[9px] font-semibold border border-slate-200 dark:border-slate-800">
                      <div>
                        <span className="text-[7.5px] font-black uppercase tracking-wider text-slate-500 block">Length</span>
                        <span className="font-bold text-blue-600 dark:text-blue-400 text-[10px]">
                          {route.totalLength !== undefined 
                            ? `${route.totalLength.toLocaleString()} m` 
                            : (route.markEnd !== undefined && route.markStart !== undefined 
                                ? `${Math.abs(route.markEnd - route.markStart).toLocaleString()} m` 
                                : '-')}
                        </span>
                      </div>
                      <div>
                        <span className="text-[7.5px] font-black uppercase tracking-wider text-slate-500 block">ML (หัว - ท้าย)</span>
                        <span className="font-bold text-slate-700 dark:text-slate-200">
                          {(route.markStart !== undefined || route.markEnd !== undefined) ? (
                            <span className="font-mono text-[9px]">
                              {route.markStart !== undefined ? route.markStart.toLocaleString() : '-'} → {route.markEnd !== undefined ? route.markEnd.toLocaleString() : '-'}
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[9px]">-</span>
                          )}
                        </span>
                      </div>
                    </div>

                    {/* Owner Usage Proportion (สัดส่วนการใช้งานของแต่ละ Owner) */}
                    {(() => {
                      const ownerColorMap: Record<string, { text: string, bar: string }> = {
                        ITEL: { text: 'text-amber-500 font-bold', bar: 'bg-amber-500' },
                        SYMC: { text: 'text-pink-500 font-bold', bar: 'bg-pink-500' },
                        UIH: { text: 'text-sky-500 font-bold', bar: 'bg-sky-500' },
                        None: { text: 'text-slate-400 font-bold', bar: 'bg-slate-400' }
                      };

                      const cores = route.cores || [];
                      const totalCores = route.capacity || cores.length || 1;
                      
                      const routeOwnersList: CoreOwner[] = (route.owners && route.owners.length > 0)
                        ? route.owners
                        : ((route.tierSharingPartners && route.tierSharingPartners.length > 0)
                          ? route.tierSharingPartners
                          : []);

                      const distinctOwners = Array.from(new Set([
                        ...routeOwnersList,
                        ...cores.map(c => c.owner)
                      ])).filter(o => o && o !== 'None');

                      if (distinctOwners.length === 0) distinctOwners.push('None');

                      const ownerBreakdowns = distinctOwners.map(owner => {
                        const ownerCores = cores.filter(c => c.owner === owner);
                        const assignedCount = ownerCores.length;
                        const percentCapacity = totalCores > 0 ? (assignedCount / totalCores) * 100 : 0;

                        const coreIds = ownerCores.map(c => c.id);
                        const coreRangesStr = formatNumberRanges(coreIds);
                        const tubeIds = ownerCores.map(c => Math.floor((c.id - 1) / 12) + 1);
                        const tubeRangesStr = formatNumberRanges(tubeIds).split(', ').map(r => r.includes('-') ? `T${r.replace('-', '-T')}` : `T${r}`).join(', ');

                        const priorityTubeIds = Array.from(new Set(
                          ownerCores
                            .filter(c => c.priority === 'High')
                            .map(c => Math.floor((c.id - 1) / 12) + 1)
                        )).sort((a, b) => a - b);

                        const priorityTubeRangesStr = priorityTubeIds.length > 0
                          ? formatNumberRanges(priorityTubeIds).split(', ').map(r => r.includes('-') ? `T${r.replace('-', '-T')}` : `T${r}`).join(', ')
                          : null;

                        return {
                          owner,
                          assignedCount,
                          percentCapacity,
                          coreRangesStr,
                          tubeRangesStr,
                          priorityTubeIds,
                          priorityTubeRangesStr
                        };
                      }).filter(b => b.assignedCount > 0);

                      const totalPriorityTubesCount = Array.from(new Set(
                        cores.filter(c => c.priority === 'High').map(c => Math.floor((c.id - 1) / 12) + 1)
                      )).length;

                      return (
                        <div className="space-y-1.5 pt-0.5">
                          <div className="flex items-center justify-between text-[8px] font-black uppercase tracking-wider text-slate-500">
                            <span>Owner Share & Tube Priority</span>
                            {totalPriorityTubesCount > 0 ? (
                              <span className="text-rose-500 font-bold flex items-center gap-1">
                                ★ {totalPriorityTubesCount} Priority {totalPriorityTubesCount === 1 ? 'Tube' : 'Tubes'}
                              </span>
                            ) : (
                              <span>Standard Priority</span>
                            )}
                          </div>

                          {/* Segmented Progress Bar */}
                          <div className="h-2 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden flex">
                            {ownerBreakdowns.map((b) => (
                              <div 
                                key={b.owner}
                                style={{ width: `${b.percentCapacity}%` }}
                                className={`h-full ${ownerColorMap[b.owner]?.bar || 'bg-slate-400'}`}
                                title={`${b.owner}: ${b.assignedCount} Cores (${b.percentCapacity.toFixed(0)}%)`}
                              />
                            ))}
                          </div>

                          {/* Owner Breakdown Rows with Priority Tubes */}
                          <div className="space-y-1 pt-1">
                            {ownerBreakdowns.map((b) => {
                              const theme = ownerColorMap[b.owner] || ownerColorMap.None;
                              return (
                                <div key={b.owner} className="flex items-center justify-between text-[9px] py-1 border-b border-slate-100 dark:border-slate-800/60 last:border-0 gap-3">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <span className={`w-2 h-2 rounded-full shrink-0 ${theme.bar}`} />
                                    <span className={`font-black uppercase tracking-tight ${theme.text}`}>
                                      {b.owner}
                                    </span>
                                    {b.tubeRangesStr !== '-' && (
                                      <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono text-[8px] font-bold text-slate-700 dark:text-slate-300 shrink-0 border border-slate-200 dark:border-slate-700">
                                        {b.tubeRangesStr}
                                      </span>
                                    )}
                                    {b.coreRangesStr !== '-' && (
                                      <span className="font-mono text-[8.5px] text-slate-500 font-semibold truncate">
                                        (Core {b.coreRangesStr})
                                      </span>
                                    )}
                                  </div>

                                  <div className="flex items-center gap-2 shrink-0 font-mono text-[8.5px]">
                                    <span className="text-slate-400 font-medium">
                                      {b.assignedCount}C ({b.percentCapacity.toFixed(0)}%)
                                    </span>
                                    {b.priorityTubeRangesStr ? (
                                      <span className="px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-500 border border-rose-500/30 font-bold text-[8px] flex items-center gap-1">
                                        ★ Priority: {b.priorityTubeRangesStr}
                                      </span>
                                    ) : (
                                      <span className="text-slate-400 text-[8px] italic">
                                        Normal
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </Tooltip>
              </Polyline>
            ))}
          </LayerGroup>
        </LayersControl.Overlay>

        <LayersControl.Overlay checked name="Loops">
          <LayerGroup>
            {loops.map(loop => (
              <CircleMarker
                key={loop.id}
                center={[loop.position.lat, loop.position.lng]}
                radius={3}
                pathOptions={{
                  color: '#f97316',
                  fillColor: '#f97316',
                  fillOpacity: 1,
                  weight: 1.2
                }}
              >
                <Tooltip direction="top" offset={[0, -10]} opacity={1}>
                  <span className="font-bold text-[10px]">{loop.name}</span> <span className="text-[9px]">({loop.length}m)</span>
                </Tooltip>
              </CircleMarker>
            ))}
          </LayerGroup>
        </LayersControl.Overlay>
      </LayersControl>

      <MapEvents onMapClick={handleMapClick} />
      <MapResizer 
        sidebarCollapsed={sidebarCollapsed} 
        selectedRouteId={selectedRouteId} 
        selectedEnclosureId={selectedEnclosureId} 
      />
      <MapControls enclosures={enclosures} routes={routes} loops={loops} />
      <MapSearchControl 
        enclosures={enclosures}
        routes={routes}
        loops={loops}
        enclosureTypes={enclosureTypes}
        onEnclosureClick={onEnclosureClick}
        onRouteClick={onRouteClick}
        setSearchPin={setSearchPin}
      />
      <MapLegend 
        enclosureTypes={enclosureTypes} 
        fiberTypes={fiberTypes} 
        fiberColorConfigs={fiberColorConfigs} 
        enclosures={enclosures}
        routes={routes}
        loops={loops}
        draftRoute={draftRoute}
      />

      {/* Render Searched Coordinate Pin Marker */}
      {searchPin && (
        <Marker
          position={[searchPin.lat, searchPin.lng]}
          icon={searchPinIcon}
        >
          <Popup autoPan={false}>
            <div className="p-1 space-y-2 min-w-[210px] text-slate-900 dark:text-slate-100">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-1">
                <span className="font-bold text-xs flex items-center gap-1 text-rose-500 font-display">
                  <MapPin className="w-3.5 h-3.5" /> Searched Coordinate
                </span>
                <button 
                  onClick={() => setSearchPin(null)}
                  className="text-slate-400 hover:text-slate-200 text-xs px-1 hover:bg-slate-800 rounded"
                >
                  ✕
                </button>
              </div>
              <div className="font-mono text-xs font-bold bg-slate-100 dark:bg-slate-950 p-2 rounded-xl border border-slate-200 dark:border-slate-800 text-center text-slate-800 dark:text-slate-200 shadow-inner">
                {searchPin.lat.toFixed(6)}, {searchPin.lng.toFixed(6)}
              </div>
              <div className="flex gap-1.5 pt-0.5">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(`${searchPin.lat.toFixed(6)}, ${searchPin.lng.toFixed(6)}`);
                    setCopiedPin(true);
                    setTimeout(() => setCopiedPin(false), 2000);
                  }}
                  className="flex-1 py-1.5 px-2 rounded-xl bg-slate-800 text-slate-100 text-[9px] font-bold flex items-center justify-center gap-1 hover:bg-slate-700 transition-colors border border-slate-700"
                >
                  {copiedPin ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-slate-400" />}
                  {copiedPin ? 'Copied' : 'Copy'}
                </button>
                <button
                  onClick={() => {
                    if (onMapClick) {
                      onMapClick({ lat: searchPin.lat, lng: searchPin.lng });
                    }
                  }}
                  className="flex-1 py-1.5 px-2 rounded-xl bg-brand-600 text-slate-950 text-[9px] font-black flex items-center justify-center gap-1 hover:bg-brand-500 transition-colors shadow-md"
                >
                  <Plus className="w-3 h-3" /> Add Object
                </button>
              </div>
            </div>
          </Popup>
        </Marker>
      )}

      {/* Render Draft Route Path */}
      {draftRoute.length > 0 && (
        <Polyline
          positions={draftRoute.map(p => [p.lat, p.lng])}
          pathOptions={{ color: '#f59e0b', weight: 2, dashArray: '8, 8' }}
          eventHandlers={{
            click: handleDraftRouteClick
          }}
        />
      )}

      {/* Render Draft Route Markers */}
      {draftRoute.map((p, i) => (
        <Marker
          key={`draft-marker-${i}-${p.lat.toFixed(6)}-${p.lng.toFixed(6)}`}
          position={[p.lat, p.lng]}
          draggable={drawingMode === 'route' || drawingMode === 'edit-route'}
          icon={draftIcon}
          eventHandlers={{
            dragend: (e) => handleMarkerDragEnd(i, e),
            click: (e) => handleMarkerClick(i, e)
          }}
        >
          <Tooltip direction="top">Drag to move, Click to remove</Tooltip>
        </Marker>
      ))}

        {/* Context Menu Popup */}
      {menuData && (
        <Popup
          position={menuData.position}
          eventHandlers={{
            remove: () => setMenuData(null)
          }}
          className="fiber-context-menu"
        >
          <div className="flex flex-col gap-1 p-1 min-w-[140px] bg-slate-900 rounded-xl border border-slate-800 shadow-2xl overflow-hidden">
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (menuData.type === 'route' && onEditRoute) {
                  onEditRoute(menuData.data);
                } else if (menuData.type === 'enclosure' && onEditEnclosure) {
                  onEditEnclosure(menuData.data);
                }
                setMenuData(null);
                setHoveredObjectId(null);
              }}
              className="flex items-center gap-2 px-2.5 py-1.5 text-[9px] font-black text-slate-300 hover:bg-slate-800 hover:text-brand-600 rounded-lg transition-all w-full text-left cursor-pointer uppercase tracking-widest"
            >
              <Pencil className="w-3 h-3 text-brand-500" />
              <span>Edit</span>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (menuData.type === 'route') {
                  onRouteClick(menuData.data);
                } else if (menuData.type === 'enclosure' && onEnclosureClick) {
                  onEnclosureClick(menuData.data);
                }
                setMenuData(null);
                setHoveredObjectId(null);
              }}
              className="flex items-center gap-2 px-2.5 py-1.5 text-[9px] font-black text-slate-300 hover:bg-slate-800 hover:text-brand-600 rounded-lg transition-all w-full text-left cursor-pointer uppercase tracking-widest"
            >
              <ExternalLink className="w-3 h-3 text-brand-500" />
              <span>Detail</span>
            </button>
          </div>
        </Popup>
      )}
    </MapContainer>
  );
}

import { CoreStatus, CoreOwner, CorePriority, RolePermissions } from './types';

export const DEFAULT_PERMISSIONS: RolePermissions = {
  Admin: {
    viewProjects: true, createProjects: true, editProjects: true, deleteProjects: true,
    viewUsers: true, manageUsers: true, viewSettings: true, editSettings: true,
    viewMap: true, editMap: true,
    viewEnclosures: true, createEnclosures: true, editEnclosures: true, deleteEnclosures: true,
    viewRoutes: true, createRoutes: true, editRoutes: true, deleteRoutes: true,
    manageSplices: true, viewSpliceTrays: true, editSpliceTrays: true,
    viewReports: true, exportData: true, viewHistory: true,
    requestApproval: true, approvePlanning: true, approveOM: true, approveDesign: true, viewApprovalDocs: true
  },
  Management: {
    viewProjects: true, createProjects: false, editProjects: false, deleteProjects: false,
    viewUsers: true, manageUsers: false, viewSettings: true, editSettings: false,
    viewMap: true, editMap: false,
    viewEnclosures: true, createEnclosures: false, editEnclosures: false, deleteEnclosures: false,
    viewRoutes: true, createRoutes: false, editRoutes: false, deleteRoutes: false,
    manageSplices: false, viewSpliceTrays: true, editSpliceTrays: false,
    viewReports: true, exportData: true, viewHistory: true,
    requestApproval: false, approvePlanning: false, approveOM: true, approveDesign: true, viewApprovalDocs: true
  },
  Planning: {
    viewProjects: true, createProjects: true, editProjects: true, deleteProjects: false,
    viewUsers: false, manageUsers: false, viewSettings: false, editSettings: false,
    viewMap: true, editMap: true,
    viewEnclosures: true, createEnclosures: true, editEnclosures: true, deleteEnclosures: false,
    viewRoutes: true, createRoutes: true, editRoutes: true, deleteRoutes: false,
    manageSplices: true, viewSpliceTrays: true, editSpliceTrays: true,
    viewReports: true, exportData: true, viewHistory: true,
    requestApproval: true, approvePlanning: true, approveOM: false, approveDesign: true, viewApprovalDocs: true
  },
  Design: {
    viewProjects: true, createProjects: true, editProjects: true, deleteProjects: false,
    viewUsers: false, manageUsers: false, viewSettings: false, editSettings: false,
    viewMap: true, editMap: true,
    viewEnclosures: true, createEnclosures: true, editEnclosures: true, deleteEnclosures: false,
    viewRoutes: true, createRoutes: true, editRoutes: true, deleteRoutes: false,
    manageSplices: true, viewSpliceTrays: true, editSpliceTrays: true,
    viewReports: true, exportData: true, viewHistory: true,
    requestApproval: true, approvePlanning: true, approveOM: false, approveDesign: true, viewApprovalDocs: true
  },
  Viewer: {
    viewProjects: true, createProjects: false, editProjects: false, deleteProjects: false,
    viewUsers: false, manageUsers: false, viewSettings: false, editSettings: false,
    viewMap: true, editMap: false,
    viewEnclosures: true, createEnclosures: false, editEnclosures: false, deleteEnclosures: false,
    viewRoutes: true, createRoutes: false, editRoutes: false, deleteRoutes: false,
    manageSplices: false, viewSpliceTrays: true, editSpliceTrays: false,
    viewReports: true, exportData: false, viewHistory: true,
    requestApproval: false, approvePlanning: false, approveOM: false, approveDesign: false, viewApprovalDocs: true
  },
  'Sub-contract': {
    viewProjects: true, createProjects: false, editProjects: true, deleteProjects: false,
    viewUsers: false, manageUsers: false, viewSettings: false, editSettings: false,
    viewMap: true, editMap: true,
    viewEnclosures: true, createEnclosures: false, editEnclosures: true, deleteEnclosures: false,
    viewRoutes: true, createRoutes: false, editRoutes: true, deleteRoutes: false,
    manageSplices: true, viewSpliceTrays: true, editSpliceTrays: true,
    viewReports: false, exportData: false, viewHistory: true,
    requestApproval: false, approvePlanning: false, approveOM: false, approveDesign: false, viewApprovalDocs: true
  }
};

export const FIBER_COLORS = [
  { name: 'Blue', hex: '#2563eb' }, // Solid vivid blue
  { name: 'Orange', hex: '#ea580c' }, // Vivid orange
  { name: 'Green', hex: '#16a34a' }, // Vivid green
  { name: 'Brown', hex: '#92400e' }, // Amber-brown
  { name: 'Slate', hex: '#64748b' }, // Slate grey
  { name: 'White', hex: '#f8fafc' }, // Pure white
  { name: 'Red', hex: '#dc2626' }, // Signal red
  { name: 'Black', hex: '#0f172a' }, // Jet black
  { name: 'Yellow', hex: '#eab308' }, // Sunflower yellow
  { name: 'Violet', hex: '#9333ea' }, // Electric violet
  { name: 'Rose', hex: '#f43f5e' }, // Vivid rose/pink
  { name: 'Aqua', hex: '#06b6d4' } // Cyan/aqua
];

export const OWNER_BADGE_COLORS: Record<CoreOwner, string> = {
  None: 'bg-slate-800/80 text-slate-300 border-slate-700/80',
  ITEL: 'bg-amber-500/15 text-amber-300 border-amber-500/40 shadow-sm shadow-amber-500/10',
  SYMC: 'bg-pink-500/15 text-pink-300 border-pink-500/40 shadow-sm shadow-pink-500/10',
  UIH: 'bg-sky-500/15 text-sky-300 border-sky-500/40 shadow-sm shadow-sky-500/10'
};

export const OWNER_HEX_COLORS: Record<CoreOwner, string> = {
  None: '#64748b',
  ITEL: '#f59e0b',
  SYMC: '#ec4899',
  UIH: '#0ea5e9'
};

export const CORE_STATUS_COLORS: Record<CoreStatus, string> = {
  used: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300',
  reserved: 'bg-amber-500/15 border-amber-500/40 text-amber-300',
  bad: 'bg-rose-500/15 border-rose-500/40 text-rose-300'
};

export const PRIORITY_COLORS: Record<CorePriority, string> = {
  Low: 'text-slate-400',
  Medium: 'text-amber-400 font-semibold',
  High: 'text-rose-400 font-bold'
};

export const generateCores = (capacity: number, tubes: number = 0) => {
  const cores = [];
  
  if (tubes > 0) {
    const coresPerTube = Math.ceil(capacity / tubes);
    
    for (let i = 0; i < capacity; i++) {
      const tubeIndex = Math.floor(i / coresPerTube);
      const coreIndexInTube = i % coresPerTube;
      
      const coreColorIndex = coreIndexInTube % 12;
      const tubeColorIndex = tubeIndex % 12;
      
      const tubeColorName = FIBER_COLORS[tubeColorIndex].name;
      const coreColorName = FIBER_COLORS[coreColorIndex].name;
      
      cores.push({
        id: i + 1,
        color: FIBER_COLORS[coreColorIndex].hex,
        status: 'used' as CoreStatus,
        label: `T${tubeIndex + 1} (${tubeColorName}) - C${coreIndexInTube + 1} (${coreColorName})`,
        owner: 'None' as CoreOwner,
        priority: 'Low' as CorePriority,
        details: ''
      });
    }
  } else {
    for (let i = 0; i < capacity; i++) {
      const coreColorIndex = i % 12;
      const coreColorName = FIBER_COLORS[coreColorIndex].name;
      
      cores.push({
        id: i + 1,
        color: FIBER_COLORS[coreColorIndex].hex,
        status: 'used' as CoreStatus,
        label: `Core ${i + 1} (${coreColorName})`,
        owner: 'None' as CoreOwner,
        priority: 'Low' as CorePriority,
        details: ''
      });
    }
  }
  return cores;
};

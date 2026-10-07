import React, { useState } from 'react';
import { UserRole, Feature, RolePermissions } from '../types';
import { DEFAULT_PERMISSIONS } from '../constants';
import { Shield, Save, CheckCircle2, Circle } from 'lucide-react';
import { logActivity } from '../services/logService';

const FEATURE_CATEGORIES = [
  {
    id: 'projects',
    name: 'Project Management',
    description: 'Control access to project creation, viewing, and modification.',
    features: [
      { id: 'viewProjects', label: 'View Projects' },
      { id: 'createProjects', label: 'Create Projects' },
      { id: 'editProjects', label: 'Edit Projects' },
      { id: 'deleteProjects', label: 'Delete Projects' }
    ] as { id: Feature; label: string }[]
  },
  {
    id: 'enclosures',
    name: 'Enclosure Management',
    description: 'Manage fiber enclosures and their physical properties.',
    features: [
      { id: 'viewEnclosures', label: 'View Enclosures' },
      { id: 'createEnclosures', label: 'Create Enclosures' },
      { id: 'editEnclosures', label: 'Edit Enclosures' },
      { id: 'deleteEnclosures', label: 'Delete Enclosures' }
    ] as { id: Feature; label: string }[]
  },
  {
    id: 'routes',
    name: 'Route Management',
    description: 'Manage fiber routes, paths, and connections.',
    features: [
      { id: 'viewRoutes', label: 'View Routes' },
      { id: 'createRoutes', label: 'Create Routes' },
      { id: 'editRoutes', label: 'Edit Routes' },
      { id: 'deleteRoutes', label: 'Delete Routes' }
    ] as { id: Feature; label: string }[]
  },
  {
    id: 'splicing',
    name: 'Splicing Operations',
    description: 'Control core splicing and tray management.',
    features: [
      { id: 'manageSplices', label: 'Manage Splices' },
      { id: 'viewSpliceTrays', label: 'View Splice Trays' },
      { id: 'editSpliceTrays', label: 'Edit Splice Trays' }
    ] as { id: Feature; label: string }[]
  },
  {
    id: 'users',
    name: 'User Management',
    description: 'Manage user accounts and their access levels.',
    features: [
      { id: 'viewUsers', label: 'View Users' },
      { id: 'manageUsers', label: 'Manage Users' }
    ] as { id: Feature; label: string }[]
  },
  {
    id: 'settings',
    name: 'System Settings',
    description: 'Configure global system parameters and preferences.',
    features: [
      { id: 'viewSettings', label: 'View Settings' },
      { id: 'editSettings', label: 'Edit Settings' }
    ] as { id: Feature; label: string }[]
  },
  {
    id: 'map',
    name: 'Fiber Sharing Database',
    description: 'Access and modify fiber network data on the map.',
    features: [
      { id: 'viewMap', label: 'View Map' },
      { id: 'editMap', label: 'Edit Map' }
    ] as { id: Feature; label: string }[]
  },
  {
    id: 'data',
    name: 'Data & Analytics',
    description: 'Access reports, history, and data export tools.',
    features: [
      { id: 'viewReports', label: 'View Reports' },
      { id: 'exportData', label: 'Export Data' },
      { id: 'viewHistory', label: 'View History' }
    ] as { id: Feature; label: string }[]
  }
];

export const PermissionManager: React.FC = () => {
  const [permissions, setPermissions] = useState<RolePermissions>(DEFAULT_PERMISSIONS);
  const roles: UserRole[] = ['Admin', 'Design', 'Viewer', 'Sub-contract'];

  const togglePermission = (role: UserRole, feature: Feature) => {
    setPermissions(prev => ({
      ...prev,
      [role]: {
        ...prev[role],
        [feature]: !prev[role][feature]
      }
    }));
  };

  const toggleCategory = (role: UserRole, categoryFeatures: Feature[]) => {
    const allEnabled = categoryFeatures.every(f => permissions[role][f]);
    setPermissions(prev => {
      const nextRolePermissions = { ...prev[role] };
      categoryFeatures.forEach(f => {
        nextRolePermissions[f] = !allEnabled;
      });
      return {
        ...prev,
        [role]: nextRolePermissions
      };
    });
  };

  const handleSave = async () => {
    console.log('Saving permissions:', permissions);
    await logActivity('update_permissions', 'Updated role permissions', { permissions });
    alert('Permissions saved successfully!');
  };

  return (
    <div className="glass-panel-elevated rounded-3xl overflow-hidden border border-slate-800 shadow-2xl">
      <div className="p-8 border-b border-slate-800 bg-slate-900/80 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-gradient-to-br from-brand-500 to-brand-700 rounded-2xl flex items-center justify-center shadow-lg shadow-brand-500/20">
            <Shield className="text-white w-6 h-6" />
          </div>
          <div>
            <h2 className="text-2xl font-extrabold text-white tracking-tight font-display">Role Permissions Matrix</h2>
            <p className="text-slate-400 text-xs mt-0.5">Configure operational capabilities across all tenant tiers.</p>
          </div>
        </div>
        <button 
          onClick={handleSave} 
          className="btn-primary py-2.5 px-5 text-xs font-bold"
        >
          <Save size={15} /> Save Changes
        </button>
      </div>
      
      <div className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-900/60">
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800 w-1/3">Feature Category</th>
                {roles.map(role => (
                  <th key={role} className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800 text-center">
                    <span className="text-white text-xs">{role}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {FEATURE_CATEGORIES.map((category) => (
                <React.Fragment key={category.id}>
                  {/* Category Header */}
                  <tr className="bg-slate-900/40 border-b border-slate-800/80">
                    <td className="px-6 py-3.5">
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-white uppercase tracking-wider">{category.name}</span>
                        <span className="text-[11px] text-slate-400 font-medium">{category.description}</span>
                      </div>
                    </td>
                    {roles.map(role => {
                      const categoryFeatures = category.features.map(f => f.id);
                      const allEnabled = categoryFeatures.every(f => permissions[role][f]);
                      const someEnabled = categoryFeatures.some(f => permissions[role][f]);
                      
                      return (
                        <td key={role} className="px-6 py-3.5 text-center">
                          <button 
                            onClick={() => toggleCategory(role, categoryFeatures)}
                            className={`p-1.5 rounded-lg transition-all border ${allEnabled ? 'text-brand-400 bg-brand-500/10 border-brand-500/30' : someEnabled ? 'text-brand-400/60 bg-brand-500/5 border-brand-500/20' : 'text-slate-600 border-slate-800 hover:bg-slate-800'}`}
                            title={`Toggle all ${category.name} for ${role}`}
                          >
                            {allEnabled ? <CheckCircle2 size={16} /> : someEnabled ? <CheckCircle2 size={16} className="opacity-50" /> : <Circle size={16} />}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                  {/* Features in Category */}
                  {category.features.map((feature) => (
                    <tr key={feature.id} className="hover:bg-slate-800/30 transition-colors border-b border-slate-800/50">
                      <td className="px-6 py-3 pl-10">
                        <div className="flex items-center gap-2.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-brand-500/60" />
                          <span className="text-xs font-semibold text-slate-300 group-hover:text-white transition-colors">{feature.label}</span>
                        </div>
                      </td>
                      {roles.map(role => (
                        <td key={role} className="px-6 py-3 text-center">
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={permissions[role][feature.id]}
                              onChange={() => togglePermission(role, feature.id)}
                              className="sr-only peer"
                            />
                            <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-400 after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-600 peer-checked:after:bg-white"></div>
                          </label>
                        </td>
                      ))}
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

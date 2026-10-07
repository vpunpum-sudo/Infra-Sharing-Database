import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, Trash2, Edit2, Save, X, Settings, Box, Zap, Layers, ChevronLeft, Image as ImageIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { EnclosureType, FiberType, FiberColorConfig, CoreOwner, User as AppUser } from '../types';
import { db, auth as firebaseAuth, handleFirestoreError, OperationType } from '../firebase';
import { collection, onSnapshot, doc, setDoc, deleteDoc, query, where } from 'firebase/firestore';
import { ConfirmModal } from './ConfirmModal';
import { Toast } from './Toast';
import { logActivity } from '../services/logService';
import { ThemeToggle } from './ThemeToggle';
import { OwnerLogoSettings } from './OwnerLogoSettings';

export const SettingsManager = ({ user, appUser, quotaExceeded = false }: { user: User, appUser: AppUser | null, quotaExceeded?: boolean }) => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'logos' | 'enclosure' | 'fiber' | 'colorConfig'>('logos');
  const [enclosureTypes, setEnclosureTypes] = useState<EnclosureType[]>([]);
  const [fiberTypes, setFiberTypes] = useState<FiberType[]>([]);
  const [fiberColorConfigs, setFiberColorConfigs] = useState<FiberColorConfig[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingType, setEditingType] = useState<'enclosure' | 'fiber' | 'colorConfig' | null>(null);
  const [editName, setEditName] = useState('');
  const [editCapacity, setEditCapacity] = useState<number>(60);
  const [editSpliceTrays, setEditSpliceTrays] = useState<number>(1);
  const [editIcon, setEditIcon] = useState<string | null>(null);
  const [editImageUrl, setEditImageUrl] = useState<string | null>(null);
  const [editTubes, setEditTubes] = useState<number>(1);
  const [editCores, setEditCores] = useState<number>(12);
  const [editCoreCapacity, setEditCoreCapacity] = useState<number>(60);
  const [editFiberTypeId, setEditFiberTypeId] = useState<string>('');
  const [editTier, setEditTier] = useState<string>('Tier 1');
  const [editColor, setEditColor] = useState<string>('#10b981');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; type: 'enclosure' | 'fiber' | 'colorConfig' | null; id: string | null }>({ isOpen: false, type: null, id: null });
  const [toast, setToast] = useState<{ isOpen: boolean; message: string; type: 'success' | 'error' | 'info' }>({ isOpen: false, message: '', type: 'success' });

  useEffect(() => {
    if (!user) return;
    const unsubEnclosure = onSnapshot(collection(db, 'enclosureTypes'), (snapshot) => {
      setEnclosureTypes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as EnclosureType)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'enclosureTypes');
    });
    const unsubFiber = onSnapshot(collection(db, 'fiberTypes'), (snapshot) => {
      setFiberTypes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FiberType)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'fiberTypes');
    });
    const unsubColorConfigs = onSnapshot(collection(db, 'fiberColorConfigs'), (snapshot) => {
      setFiberColorConfigs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FiberColorConfig)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'fiberColorConfigs');
    });
    return () => { unsubEnclosure(); unsubFiber(); unsubColorConfigs(); };
  }, [user]);

  const handleSave = async (type: 'enclosure' | 'fiber' | 'colorConfig', id?: string) => {
    const docId = id || Date.now().toString();
    try {
      if (type === 'enclosure') {
        const path = 'enclosureTypes';
        await setDoc(doc(db, path, docId), { 
          name: editName, 
          capacity: editCapacity, 
          spliceTrays: editSpliceTrays,
          icon: editIcon || null
        });
        await logActivity('edit_enclosure_type', `Saved enclosure type ${editName}`, { docId, name: editName, capacity: editCapacity });
      } else if (type === 'fiber') {
        const path = 'fiberTypes';
        await setDoc(doc(db, path, docId), { 
          name: editName, 
          tubes: editTubes, 
          cores: editCores,
          coreCapacity: editCoreCapacity,
          imageUrl: editImageUrl || null
        });
        await logActivity('edit_fiber_type', `Saved fiber type ${editName}`, { docId, name: editName, tubes: editTubes, cores: editCores });
      } else {
        const path = 'fiberColorConfigs';
        await setDoc(doc(db, path, docId), { 
          id: docId,
          fiberTypeId: editFiberTypeId, 
          tier: editTier, 
          color: editColor,
          uid: user.uid
        });
        await logActivity('edit_fiber_color_config', `Saved fiber color config for ${editTier}`, { docId, fiberTypeId: editFiberTypeId, tier: editTier, color: editColor });
      }
      setToast({ isOpen: true, message: 'Saved successfully', type: 'success' });
    } catch (error) {
      const path = type === 'enclosure' ? 'enclosureTypes' : type === 'fiber' ? 'fiberTypes' : 'fiberColorConfigs';
      handleFirestoreError(error, OperationType.WRITE, path);
      setToast({ isOpen: true, message: 'Error saving data', type: 'error' });
    }
    setEditingId(null);
    setEditingType(null);
    setEditName('');
    setEditCapacity(60);
    setEditSpliceTrays(1);
    setEditIcon(null);
    setEditTubes(1);
    setEditCores(12);
    setEditCoreCapacity(60);
    setEditFiberTypeId('');
    setEditTier('Tier 1');
    setEditColor('#10b981');
  };

  const handleDeleteClick = (type: 'enclosure' | 'fiber' | 'colorConfig', id: string) => {
    setDeleteConfirm({ isOpen: true, type, id });
  };

  const handleConfirmDelete = async () => {
    const { type, id } = deleteConfirm;
    if (!type || !id) return;
    
    const path = type === 'enclosure' ? 'enclosureTypes' : type === 'fiber' ? 'fiberTypes' : 'fiberColorConfigs';
    try {
      await deleteDoc(doc(db, path, id));
      await logActivity('delete_setting', `Deleted ${type} setting`, { type, id });
      setToast({ isOpen: true, message: 'Deleted successfully', type: 'success' });
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
      setToast({ isOpen: true, message: 'Error deleting data', type: 'error' });
    }
    setDeleteConfirm({ isOpen: false, type: null, id: null });
  };

  const handleImageUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setUploadError(null);
    if (file) {
      if (file.size > 20 * 1024 * 1024) {
        setUploadError('File is too large (Max 20MB)');
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        setEditImageUrl(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleIconChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setUploadError(null);
    
    if (file) {
      if (file.size > 20 * 1024 * 1024) {
        setUploadError('File is too large (Max 20MB)');
        return;
      }

      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 256; // Increased quality
          const MAX_HEIGHT = 256;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            const resizedBase64 = canvas.toDataURL('image/png', 0.8);
            setEditIcon(resizedBase64);
          }
        } catch (err) {
          console.error('Image processing error:', err);
          setUploadError('Failed to process image');
        } finally {
          URL.revokeObjectURL(objectUrl);
        }
      };

      img.onerror = () => {
        setUploadError('Invalid image file');
        URL.revokeObjectURL(objectUrl);
      };

      img.src = objectUrl;
    }
    // Reset input value to allow selecting the same file again
    e.target.value = '';
  };

  return (
    <div className="min-h-screen bg-slate-950 p-4 md:p-12 relative overflow-hidden flex items-start justify-center">
      {/* Decorative background elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-brand-600/10 rounded-full blur-[140px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-brand-500/5 rounded-full blur-[140px] pointer-events-none"></div>

      <div className="w-full max-w-5xl relative z-10" style={{ transform: 'scale(0.75)', transformOrigin: 'top center' }}>
        <button 
          onClick={() => navigate(-1)} 
          className="mb-10 flex items-center gap-3 text-slate-500 hover:text-slate-100 font-black transition-all hover:-translate-x-1 group"
        >
          <ChevronLeft size={22} className="group-hover:text-brand-400 transition-colors" /> 
          <span className="uppercase tracking-widest text-xs">Back to Dashboard</span>
        </button>
        
        <div className="glass-panel rounded-[2.5rem] shadow-2xl border border-slate-700 overflow-hidden">
          <div className="bg-brand-600 p-10 text-slate-100 relative overflow-hidden">
            {/* Background pattern */}
            <div className="absolute inset-0 opacity-10 pointer-events-none">
              <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <pattern id="grid-settings" width="30" height="30" patternUnits="userSpaceOnUse">
                    <path d="M 30 0 L 0 0 0 30" fill="none" stroke="var(--color-slate-100)" strokeWidth="0.5"/>
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#grid-settings)" />
              </svg>
            </div>
            
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
              <div>
                <h2 className="text-4xl font-black text-slate-100 tracking-tighter flex items-center gap-4 font-display">
                  <Settings className="w-10 h-10" /> System Settings
                </h2>
                <p className="text-brand-100 font-black text-xs uppercase tracking-[0.2em] opacity-80 mt-2">Manage network infrastructure specifications</p>
              </div>
              <div>
                <ThemeToggle className="bg-white/10 text-white hover:bg-white/20 border-white/20" />
              </div>
            </div>
          </div>

          <div className="p-6 sm:p-10 bg-slate-900/60 backdrop-blur-xl space-y-12">
            {/* Tab Navigation */}
            <div className="flex flex-wrap items-center gap-2 p-1.5 bg-slate-950/80 border border-slate-800 rounded-2xl shadow-inner">
              <button
                onClick={() => setActiveTab('logos')}
                className={`flex items-center gap-2.5 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                  activeTab === 'logos'
                    ? 'bg-brand-600 text-white shadow-lg shadow-brand-600/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                }`}
              >
                <ImageIcon className="w-4 h-4" />
                <span>Owner Logos & Branding</span>
              </button>

              <button
                onClick={() => setActiveTab('enclosure')}
                className={`flex items-center gap-2.5 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                  activeTab === 'enclosure'
                    ? 'bg-brand-600 text-white shadow-lg shadow-brand-600/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                }`}
              >
                <Box className="w-4 h-4" />
                <span>Enclosure Types</span>
              </button>

              <button
                onClick={() => setActiveTab('fiber')}
                className={`flex items-center gap-2.5 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                  activeTab === 'fiber'
                    ? 'bg-brand-600 text-white shadow-lg shadow-brand-600/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                }`}
              >
                <Zap className="w-4 h-4" />
                <span>Fiber Specs</span>
              </button>

              <button
                onClick={() => setActiveTab('colorConfig')}
                className={`flex items-center gap-2.5 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                  activeTab === 'colorConfig'
                    ? 'bg-brand-600 text-white shadow-lg shadow-brand-600/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                }`}
              >
                <Layers className="w-4 h-4" />
                <span>Fiber Color Management</span>
              </button>
            </div>

            {/* TAB 1: Owner Logos */}
            {activeTab === 'logos' && (
              <OwnerLogoSettings />
            )}

            {/* TAB 2: Enclosure Types Section */}
            {activeTab === 'enclosure' && (
              <section>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-blue-500/10 text-blue-400 rounded-2xl flex items-center justify-center border border-blue-500/20 shadow-lg shadow-blue-500/5">
                    <Box className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-black text-slate-100 tracking-tight font-display">Enclosure Types</h3>
                    <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em]">Physical Hardware Standards</p>
                  </div>
                </div>
                {editingId !== 'new-enclosure' && (
                  <button 
                    onClick={() => { setEditingId('new-enclosure'); setEditingType('enclosure'); setEditName(''); setEditCapacity(60); setEditSpliceTrays(1); setEditIcon(null); }}
                    disabled={quotaExceeded}
                    className={`bg-brand-600 text-slate-100 flex items-center justify-center gap-3 py-3 px-8 text-sm font-black rounded-2xl shadow-2xl shadow-brand-500/20 hover:bg-brand-500 transition-all active:scale-95 uppercase tracking-widest ${quotaExceeded ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <Plus className="w-5 h-5" />
                    Add Type
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4">
                {enclosureTypes.map(t => (
                  <motion.div 
                    key={t.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-slate-800/40 border border-slate-800 p-4 sm:p-6 rounded-[2rem] flex flex-col sm:flex-row sm:items-center justify-between gap-4 sm:gap-6 group hover:border-brand-500/30 hover:bg-slate-800/60 transition-all duration-500"
                  >
                    <div className="flex items-center gap-4 sm:gap-8 min-w-0">
                      <div className="relative shrink-0">
                        {t.icon ? (
                          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-[1.5rem] bg-slate-900 p-3 shadow-2xl border border-slate-800 flex items-center justify-center group-hover:scale-105 transition-transform duration-500">
                            <img src={t.icon} alt={t.name} className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                          </div>
                        ) : (
                          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-[1.5rem] bg-slate-900 shadow-2xl border-2 border-slate-800 flex items-center justify-center group-hover:scale-105 transition-transform duration-500">
                            <Box className="w-8 h-8 sm:w-10 sm:h-10 text-slate-700" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="text-lg sm:text-xl font-black text-slate-100 truncate tracking-tight">{t.name}</h4>
                        <div className="flex flex-wrap items-center gap-2 mt-3">
                          <div className="flex items-center gap-2 px-4 py-1.5 bg-slate-900 text-slate-300 rounded-xl border border-slate-800 shrink-0">
                            <Zap className="w-3.5 h-3.5 text-brand-400" />
                            <span className="text-[11px] font-black uppercase tracking-widest">{t.capacity || 60} Cores</span>
                          </div>
                          <div className="flex items-center gap-2 px-4 py-1.5 bg-slate-900 text-slate-300 rounded-xl border border-slate-800 shrink-0">
                            <Layers className="w-3.5 h-3.5 text-blue-400" />
                            <span className="text-[11px] font-black uppercase tracking-widest">{t.spliceTrays || 1} Trays</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 justify-end shrink-0 border-t sm:border-t-0 pt-4 sm:pt-0 border-slate-800/50">
                      <button 
                        onClick={() => { setEditingId(t.id); setEditingType('enclosure'); setEditName(t.name); setEditCapacity(t.capacity || 60); setEditSpliceTrays(t.spliceTrays || 1); setEditIcon(t.icon || null); }}
                        className="p-3 text-slate-500 hover:text-brand-400 hover:bg-brand-500/10 rounded-2xl transition-all"
                        title="Edit"
                      >
                        <Edit2 className="w-5 h-5" />
                      </button>
                      <button 
                        onClick={() => handleDeleteClick('enclosure', t.id)}
                        disabled={quotaExceeded}
                        className={`p-3 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-2xl transition-all ${quotaExceeded ? 'opacity-50 cursor-not-allowed' : ''}`}
                        title="Delete"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            </section>
            )}

            {/* TAB 3: Fiber Types Section */}
            {activeTab === 'fiber' && (
            <section>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-emerald-500/10 text-emerald-400 rounded-2xl flex items-center justify-center border border-emerald-500/20 shadow-lg shadow-emerald-500/5">
                    <Zap className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-black text-slate-100 tracking-tight font-display">Fiber Specs</h3>
                    <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em]">Cable Standards</p>
                  </div>
                </div>
                {editingId !== 'new-fiber' && (
                  <button 
                    onClick={() => { setEditingId('new-fiber'); setEditingType('fiber'); setEditName(''); setEditTubes(1); setEditCores(12); setEditImageUrl(null); }}
                    disabled={quotaExceeded}
                    className={`bg-brand-600 text-slate-100 flex items-center justify-center gap-3 py-3 px-8 text-sm font-black rounded-2xl shadow-2xl shadow-brand-500/20 hover:bg-brand-500 transition-all active:scale-95 uppercase tracking-widest ${quotaExceeded ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <Plus className="w-5 h-5" />
                    Add Spec
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4">
                {fiberTypes.map(t => (
                  <motion.div 
                    key={t.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-slate-800/40 border border-slate-800 p-4 sm:p-6 rounded-[2rem] flex flex-col sm:flex-row sm:items-center justify-between gap-4 sm:gap-6 group hover:border-brand-500/30 hover:bg-slate-800/60 transition-all duration-500"
                  >
                    <div className="flex items-center gap-4 sm:gap-8 min-w-0">
                      <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-[1.5rem] bg-slate-900 shadow-2xl border border-slate-800 flex items-center justify-center overflow-hidden group-hover:scale-105 transition-transform duration-500 shrink-0">
                        {t.imageUrl ? (
                          <img src={t.imageUrl} alt={t.name} className="w-full h-full object-cover" />
                        ) : (
                          <Zap className="w-8 h-8 sm:w-10 sm:h-10 text-emerald-500/50" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="text-lg sm:text-xl font-black text-slate-100 truncate tracking-tight">{t.name}</h4>
                        <div className="flex flex-wrap items-center gap-2 mt-3">
                          <div className="flex items-center gap-2 px-4 py-1.5 bg-slate-900 text-slate-300 rounded-xl border border-slate-800 shrink-0">
                            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/50" />
                            <span className="text-[11px] font-black uppercase tracking-widest">{t.tubes || 1} Tubes</span>
                          </div>
                          <div className="flex items-center gap-2 px-4 py-1.5 bg-slate-900 text-slate-300 rounded-xl border border-slate-800 shrink-0">
                            <div className="w-2.5 h-2.5 rounded-full bg-brand-500 shadow-lg shadow-brand-500/50" />
                            <span className="text-[11px] font-black uppercase tracking-widest">{t.cores || 12} Cores</span>
                          </div>
                          <div className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-2 shrink-0">
                            Total: {(t.tubes || 1) * (t.cores || 12)}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 justify-end shrink-0 border-t sm:border-t-0 pt-4 sm:pt-0 border-slate-800/50">
                      <button 
                        onClick={() => { 
                          setEditingId(t.id); 
                          setEditingType('fiber'); 
                          setEditName(t.name); 
                          setEditTubes(t.tubes || 1); 
                          setEditCores(t.cores || 12); 
                          setEditCoreCapacity(t.coreCapacity || (t.tubes || 1) * (t.cores || 12));
                          setEditImageUrl(t.imageUrl || null);
                        }}
                        className="p-3 text-slate-500 hover:text-brand-400 hover:bg-brand-500/10 rounded-2xl transition-all"
                        title="Edit"
                      >
                        <Edit2 className="w-5 h-5" />
                      </button>
                      <button 
                        onClick={() => handleDeleteClick('fiber', t.id)}
                        disabled={quotaExceeded}
                        className={`p-3 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-2xl transition-all ${quotaExceeded ? 'opacity-50 cursor-not-allowed' : ''}`}
                        title="Delete"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            </section>
            )}

            {/* TAB 4: Fiber Color Management Section */}
            {activeTab === 'colorConfig' && (
            <section>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-indigo-500/10 text-indigo-400 rounded-2xl flex items-center justify-center border border-indigo-500/20 shadow-lg shadow-indigo-500/5">
                    <Layers className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-black text-slate-100 tracking-tight font-display">Fiber Color Management</h3>
                    <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em]">Visual Styles & Tiers</p>
                  </div>
                </div>
                {editingId !== 'new-color-config' && (
                  <button 
                    onClick={() => { 
                      setEditingId('new-color-config'); 
                      setEditingType('colorConfig'); 
                      setEditFiberTypeId(fiberTypes[0]?.id || ''); 
                      setEditTier('Tier 1'); 
                      setEditColor('#10b981'); 
                    }}
                    disabled={quotaExceeded}
                    className={`bg-brand-600 text-slate-100 flex items-center justify-center gap-3 py-3 px-8 text-sm font-black rounded-2xl shadow-2xl shadow-brand-500/20 hover:bg-brand-500 transition-all active:scale-95 uppercase tracking-widest ${quotaExceeded ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <Plus className="w-5 h-5" />
                    Add Color Config
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4">
                {fiberColorConfigs.map(config => {
                  const fiberType = fiberTypes.find(ft => ft.id === config.fiberTypeId);
                  return (
                    <motion.div 
                      key={config.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-slate-800/40 border border-slate-800 p-4 sm:p-6 rounded-[2rem] flex flex-col sm:flex-row sm:items-center justify-between gap-4 sm:gap-6 group hover:border-brand-500/30 hover:bg-slate-800/60 transition-all duration-500"
                    >
                      <div className="flex items-center gap-4 sm:gap-8 min-w-0">
                        <div 
                          className="w-16 h-16 sm:w-20 sm:h-20 rounded-[1.5rem] flex items-center justify-center shrink-0 shadow-2xl border border-slate-700 group-hover:scale-105 transition-transform duration-500"
                          style={{ backgroundColor: config.color }}
                        >
                          <Zap className="w-8 h-8 sm:w-10 sm:h-10 text-slate-100 drop-shadow-lg" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="text-lg sm:text-xl font-black text-slate-100 truncate tracking-tight">{fiberType?.name || 'Unknown Fiber Type'}</h4>
                          <div className="flex flex-wrap items-center gap-2 mt-3">
                            <div className="flex items-center gap-2 px-4 py-1.5 bg-slate-900 text-slate-300 rounded-xl border border-slate-800 shrink-0">
                              <span className="text-[11px] font-black uppercase tracking-widest">{config.tier}</span>
                            </div>
                            <div className="flex items-center gap-2 px-4 py-1.5 bg-slate-900 text-slate-300 rounded-xl border border-slate-800 shrink-0">
                              <span className="text-[11px] font-black uppercase tracking-widest">{config.color}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 justify-end shrink-0 border-t sm:border-t-0 pt-4 sm:pt-0 border-slate-800/50">
                        <button 
                          onClick={() => { 
                            setEditingId(config.id); 
                            setEditingType('colorConfig'); 
                            setEditFiberTypeId(config.fiberTypeId); 
                            setEditTier(config.tier); 
                            setEditColor(config.color); 
                          }}
                          className="p-3 text-slate-500 hover:text-brand-400 hover:bg-brand-500/10 rounded-2xl transition-all"
                          title="Edit"
                        >
                          <Edit2 className="w-5 h-5" />
                        </button>
                        <button 
                          onClick={() => handleDeleteClick('colorConfig', config.id)}
                          disabled={quotaExceeded}
                          className={`p-3 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-2xl transition-all ${quotaExceeded ? 'opacity-50 cursor-not-allowed' : ''}`}
                          title="Delete"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </section>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {editingId && editingType && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-xl">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-slate-900 rounded-[2.5rem] shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-700 m-4 max-h-[90vh] flex flex-col relative"
            >
              {/* Decorative background in modal */}
              <div className="absolute top-0 right-0 w-32 h-32 bg-brand-500/10 rounded-full blur-3xl pointer-events-none"></div>

              <div className="p-8 sm:p-10 bg-slate-800/50 border-b border-slate-800 flex items-center justify-between shrink-0 relative z-10">
                <div className="flex items-center gap-5">
                  <div className="w-12 h-12 sm:w-16 sm:h-16 bg-slate-900 rounded-2xl shadow-2xl border border-slate-700 flex items-center justify-center">
                    {editingType === 'enclosure' ? <Box className="w-6 h-6 sm:w-8 sm:h-8 text-blue-400" /> : <Zap className="w-6 h-6 sm:w-8 sm:h-8 text-emerald-400" />}
                  </div>
                  <div>
                    <h3 className="text-xl sm:text-2xl font-black text-slate-100 tracking-tight font-display">
                      {editingId.startsWith('new') ? 'Create New' : 'Edit Specification'}
                    </h3>
                    <p className="text-[10px] sm:text-xs text-slate-500 font-black uppercase tracking-[0.2em] mt-1">
                      {editingType === 'enclosure' ? 'Enclosure Type' : editingType === 'fiber' ? 'Fiber Specification' : 'Fiber Color Config'}
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => { setEditingId(null); setEditingType(null); }} 
                  className="p-3 text-slate-500 hover:text-slate-100 hover:bg-slate-800 rounded-2xl transition-all"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="p-8 sm:p-10 space-y-8 sm:space-y-10 overflow-y-auto flex-1 custom-scrollbar relative z-10">
                <div className="space-y-4">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">Specification Name</label>
                  <input 
                    value={editName} 
                    onChange={e => setEditName(e.target.value)} 
                    className="w-full bg-slate-950/50 border-2 border-slate-800 focus:border-brand-500 rounded-2xl px-5 py-4 sm:px-6 sm:py-5 text-sm sm:text-base font-black text-slate-100 placeholder:text-slate-700 transition-all outline-none"
                    placeholder="e.g. Tier 1 : Fiber Optic 312 Core"
                    autoFocus
                  />
                </div>

                {editingType === 'enclosure' ? (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8">
                      <div className="space-y-4">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">Capacity (Cores)</label>
                        <div className="relative">
                          <input 
                            type="number"
                            value={editCapacity} 
                            onChange={e => setEditCapacity(parseInt(e.target.value) || 60)} 
                            className="w-full bg-slate-950/50 border-2 border-slate-800 focus:border-brand-500 rounded-2xl px-5 py-4 sm:px-6 sm:py-5 text-sm sm:text-base font-black text-slate-100 transition-all outline-none"
                          />
                          <Box className="absolute right-5 sm:right-6 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-700" />
                        </div>
                      </div>
                      <div className="space-y-4">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">Splice Trays</label>
                        <div className="relative">
                          <input 
                            type="number"
                            value={editSpliceTrays} 
                            onChange={e => setEditSpliceTrays(parseInt(e.target.value) || 1)} 
                            className="w-full bg-slate-950/50 border-2 border-slate-800 focus:border-brand-500 rounded-2xl px-5 py-4 sm:px-6 sm:py-5 text-sm sm:text-base font-black text-slate-100 transition-all outline-none"
                          />
                          <Layers className="absolute right-5 sm:right-6 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-700" />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">Visual Icon</label>
                      <div className="group relative flex flex-col sm:flex-row sm:items-center gap-6 sm:gap-8 p-6 sm:p-8 bg-slate-950/30 rounded-[2rem] border-2 border-dashed border-slate-800 hover:border-brand-500/50 transition-all">
                        <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-slate-900 shadow-2xl border border-slate-800 flex items-center justify-center overflow-hidden shrink-0">
                          {editIcon ? (
                            <img src={editIcon} alt="Preview" className="w-full h-full object-contain p-3" />
                          ) : (
                            <Box className="w-10 h-10 text-slate-800" />
                          )}
                        </div>
                        <div className="flex-1">
                          <input 
                            type="file" 
                            accept="image/*" 
                            onChange={handleIconChange}
                            className="hidden"
                            id="icon-upload"
                          />
                          <label htmlFor="icon-upload" className="inline-flex items-center gap-3 px-5 py-2.5 bg-slate-900 text-brand-400 text-[10px] sm:text-xs font-black uppercase tracking-widest rounded-xl border border-brand-500/20 hover:bg-brand-500/10 cursor-pointer transition-all shadow-xl">
                            <Plus className="w-4 h-4" />
                            Choose Image
                          </label>
                          <p className="text-[10px] text-slate-500 font-black mt-3 uppercase tracking-tight">
                            {uploadError ? <span className="text-rose-500">{uploadError}</span> : 'PNG or JPG, Max 20MB'}
                          </p>
                          {editIcon && (
                            <button onClick={() => setEditIcon(null)} className="text-[10px] text-rose-500 font-black mt-3 uppercase tracking-widest hover:underline block">
                              Remove Icon
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </>
                ) : editingType === 'fiber' ? (
                  <div className="space-y-8 sm:space-y-10">
                    <div className="space-y-4">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">Core Capacity</label>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        {[60, 144, 216, 312].map(cap => (
                          <button
                            key={cap}
                            onClick={() => {
                              setEditCoreCapacity(cap);
                              setEditTubes(Math.ceil(cap / 12));
                              setEditCores(12);
                            }}
                            className={`py-4 px-5 rounded-2xl text-sm font-black transition-all border-2 ${
                              editCoreCapacity === cap 
                                ? 'bg-brand-600 text-slate-100 border-brand-600 shadow-2xl shadow-brand-500/20' 
                                : 'bg-slate-950/50 text-slate-500 border-slate-800 hover:border-brand-500/30'
                            }`}
                          >
                            {cap} Cores
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8">
                      <div className="space-y-4">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">Tube Count (Calculated)</label>
                        <div className="relative">
                          <input 
                            type="number"
                            value={editTubes} 
                            onChange={e => {
                              const val = parseInt(e.target.value) || 1;
                              setEditTubes(val);
                              setEditCoreCapacity(val * editCores);
                            }} 
                            className="w-full bg-slate-950/50 border-2 border-slate-800 focus:border-brand-500 rounded-2xl px-5 py-4 sm:px-6 sm:py-5 text-sm sm:text-base font-black text-slate-100 transition-all outline-none"
                          />
                          <Layers className="absolute right-5 sm:right-6 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-700" />
                        </div>
                      </div>
                      <div className="space-y-4">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">Cores per Tube</label>
                        <div className="relative">
                          <input 
                            type="number"
                            value={editCores} 
                            onChange={e => {
                              const val = parseInt(e.target.value) || 12;
                              setEditCores(val);
                              setEditCoreCapacity(editTubes * val);
                            }} 
                            className="w-full bg-slate-950/50 border-2 border-slate-800 focus:border-brand-500 rounded-2xl px-5 py-4 sm:px-6 sm:py-5 text-sm sm:text-base font-black text-slate-100 transition-all outline-none"
                          />
                          <Zap className="absolute right-5 sm:right-6 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-700" />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">Cable Spec Image</label>
                      <div className="group relative flex flex-col sm:flex-row sm:items-center gap-6 sm:gap-8 p-6 sm:p-8 bg-slate-950/30 rounded-[2rem] border-2 border-dashed border-slate-800 hover:border-brand-500/50 transition-all">
                        <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-slate-900 shadow-2xl border border-slate-800 flex items-center justify-center overflow-hidden shrink-0">
                          {editImageUrl ? (
                            <img src={editImageUrl} alt="Fiber Preview" className="w-full h-full object-cover" />
                          ) : (
                            <Zap className="w-10 h-10 text-slate-800" />
                          )}
                        </div>
                        <div className="flex-1">
                          <input 
                            type="file" 
                            accept="image/*" 
                            onChange={handleImageUrlChange}
                            className="hidden"
                            id="fiber-image-upload"
                          />
                          <label htmlFor="fiber-image-upload" className="inline-flex items-center gap-3 px-5 py-2.5 bg-slate-900 text-brand-400 text-[10px] sm:text-xs font-black uppercase tracking-widest rounded-xl border border-brand-500/20 hover:bg-brand-500/10 cursor-pointer transition-all shadow-xl">
                            <Plus className="w-4 h-4" />
                            Choose Cable Image
                          </label>
                          <p className="text-[10px] text-slate-500 font-black mt-3 uppercase tracking-tight">
                            {uploadError ? <span className="text-rose-500">{uploadError}</span> : 'PNG or JPG, Max 20MB'}
                          </p>
                          {editImageUrl && (
                            <button onClick={() => setEditImageUrl(null)} className="text-[10px] text-rose-500 font-black mt-3 uppercase tracking-widest hover:underline block">
                              Remove Image
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-8 sm:space-y-10">
                    <div className="space-y-4">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">Fiber Type</label>
                      <select
                        value={editFiberTypeId}
                        onChange={e => setEditFiberTypeId(e.target.value)}
                        className="w-full bg-slate-950/50 border-2 border-slate-800 focus:border-brand-500 rounded-2xl px-5 py-4 sm:px-6 sm:py-5 text-sm sm:text-base font-black text-slate-100 transition-all outline-none appearance-none"
                      >
                        <option value="" className="bg-slate-900">Select Fiber Type</option>
                        {fiberTypes.map(ft => (
                          <option key={ft.id} value={ft.id} className="bg-slate-900">{ft.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-4">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">Tier</label>
                      <div className="grid grid-cols-2 gap-4">
                        {['Tier 1', 'Tier 2'].map(tier => (
                          <button
                            key={tier}
                            onClick={() => setEditTier(tier)}
                            className={`py-4 px-5 rounded-2xl text-sm font-black transition-all border-2 ${
                              editTier === tier 
                                ? 'bg-brand-600 text-slate-100 border-brand-600 shadow-2xl shadow-brand-500/20' 
                                : 'bg-slate-950/50 text-slate-500 border-slate-800 hover:border-brand-500/30'
                            }`}
                          >
                            {tier}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-4">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">Display Color</label>
                      <div className="flex items-center gap-6 p-5 bg-slate-950/50 rounded-2xl border border-slate-800">
                        <input 
                          type="color"
                          value={editColor} 
                          onChange={e => setEditColor(e.target.value)} 
                          className="w-14 h-14 rounded-xl cursor-pointer border-none bg-transparent"
                        />
                        <input 
                          type="text"
                          value={editColor} 
                          onChange={e => setEditColor(e.target.value)} 
                          className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-5 py-3 text-sm font-black text-slate-100 uppercase outline-none focus:border-brand-500 transition-all"
                          placeholder="#000000"
                        />
                      </div>
                    </div>
                  </div>
                )}

              </div>

              <div className="p-6 sm:p-10 bg-slate-800/50 border-t border-slate-800 flex flex-col sm:flex-row gap-4 sm:gap-6 shrink-0 relative z-10">
                <button 
                  onClick={() => { setEditingId(null); setEditingType(null); }}
                  className="order-2 sm:order-1 flex-1 py-4 sm:py-5 px-6 sm:px-8 rounded-2xl text-[10px] sm:text-xs font-black uppercase tracking-[0.2em] text-slate-500 hover:text-slate-100 hover:bg-slate-800 transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => handleSave(editingType, editingId.startsWith('new') ? undefined : editingId)}
                  disabled={quotaExceeded}
                  className={`order-1 sm:order-2 flex-[2] py-4 sm:py-5 px-8 sm:px-10 rounded-2xl text-[10px] sm:text-xs font-black uppercase tracking-[0.2em] bg-brand-600 text-slate-100 hover:bg-brand-500 shadow-2xl shadow-brand-500/20 transition-all flex items-center justify-center gap-3 ${quotaExceeded ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <Save className="w-5 h-5" />
                  Save Specification
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ConfirmModal
        isOpen={deleteConfirm.isOpen}
        title="Delete Item"
        message="Are you sure you want to delete this item? This action cannot be undone."
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteConfirm({ isOpen: false, type: null, id: null })}
      />

      <Toast
        isOpen={toast.isOpen}
        message={toast.message}
        type={toast.type}
        onClose={() => setToast({ ...toast, isOpen: false })}
      />
    </div>
  );
};

export default SettingsManager;

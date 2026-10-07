import React, { useState, useRef } from 'react';
import { 
  Upload, RotateCcw, Check, Sparkles, Building2, Image as ImageIcon, 
  AlertCircle, Plus, Trash2, ExternalLink, ZoomIn, ZoomOut, Sliders, Maximize2, Scale
} from 'lucide-react';
import { useOwnerLogos, DEFAULT_OWNER_CONFIGS } from '../services/ownerLogosService';
import { OwnerConfig, CoreOwner } from '../types';
import { Toast } from './Toast';
import { OwnerLogo } from './OwnerLogo';

export const OwnerLogoSettings: React.FC = () => {
  const { configs, saveConfig, resetConfig, allOwners } = useOwnerLogos();
  const [selectedOwner, setSelectedOwner] = useState<string>('UIH');
  const [previewSize, setPreviewSize] = useState<'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'banner'>('xl');
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [toast, setToast] = useState<{ isOpen: boolean; message: string; type: 'success' | 'error' | 'info' }>({
    isOpen: false,
    message: '',
    type: 'success'
  });

  // Modal / Form state for editing or adding
  const [editCode, setEditCode] = useState<string>('');
  const [editName, setEditName] = useState<string>('');
  const [editColor, setEditColor] = useState<string>('#3b82f6');
  const [editLogoUrl, setEditLogoUrl] = useState<string>('');
  const [urlInput, setUrlInput] = useState<string>('');
  const [isAddingNew, setIsAddingNew] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentConfig: OwnerConfig = configs[selectedOwner] || DEFAULT_OWNER_CONFIGS[selectedOwner] || {
    id: selectedOwner,
    code: selectedOwner,
    name: selectedOwner,
    logoUrl: '',
    zoom: selectedOwner === 'UIH' ? 120 : 100
  };

  const isCustomLogo = Boolean(
    currentConfig.logoUrl && 
    !currentConfig.logoUrl.startsWith('/logos/logo-') && 
    !currentConfig.logoUrl.startsWith('/logos/partner-')
  );

  const currentZoom = currentConfig.zoom ?? (selectedOwner === 'UIH' ? 120 : 100);

  // Handle Zoom change (Range expanded up to 500%!)
  const handleZoomChange = async (newZoom: number) => {
    const clamped = Math.max(20, Math.min(500, Math.round(newZoom)));
    try {
      const existing = configs[selectedOwner] || DEFAULT_OWNER_CONFIGS[selectedOwner] || {
        id: selectedOwner,
        code: selectedOwner,
        name: selectedOwner
      };
      await saveConfig({
        ...existing,
        code: selectedOwner,
        zoom: clamped,
        updatedAt: new Date().toISOString()
      });
    } catch (err) {
      console.error('Update zoom error:', err);
    }
  };

  // Reset zoom back to default (+20% for UIH, 100% for others)
  const handleResetZoom = async (ownerCode: string) => {
    const defaultZoom = ownerCode === 'UIH' ? 120 : 100;
    const existing = configs[ownerCode] || DEFAULT_OWNER_CONFIGS[ownerCode] || {
      id: ownerCode,
      code: ownerCode,
      name: ownerCode
    };
    await saveConfig({
      ...existing,
      code: ownerCode,
      zoom: defaultZoom,
      updatedAt: new Date().toISOString()
    });
    setToast({
      isOpen: true,
      message: `รีเซ็ตการซูมของ ${ownerCode} เป็นค่าเริ่มต้น (${defaultZoom}%) เรียบร้อยแล้ว`,
      type: 'info'
    });
  };

  // Auto-equalize all logos to balanced optical sizes
  const handleAutoEqualize = async () => {
    try {
      // Optical equilibrium: UIH +20% (120%), SYMC 100%, ITEL 100%
      await saveConfig({ ...(configs['SYMC'] || DEFAULT_OWNER_CONFIGS['SYMC']), zoom: 100 });
      await saveConfig({ ...(configs['UIH'] || DEFAULT_OWNER_CONFIGS['UIH']), zoom: 120 });
      await saveConfig({ ...(configs['ITEL'] || DEFAULT_OWNER_CONFIGS['ITEL']), zoom: 100 });
      setToast({
        isOpen: true,
        message: 'ปรับสมดุลขนาด Logo ทุกค่ายให้มีขนาดเท่ากันเรียบร้อยแล้ว (UIH ขยายใหญ่ขึ้น +20%)',
        type: 'success'
      });
    } catch (err) {
      console.error('Equalize error:', err);
      setToast({ isOpen: true, message: 'เกิดข้อผิดพลาดในการปรับสมดุล', type: 'error' });
    }
  };

  // Handle file selection (SVG / PNG / JPG)
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 15 * 1024 * 1024) {
      setToast({ isOpen: true, message: 'ขนาดไฟล์เกิน 15MB กรุณาเลือกไฟล์ขนาดเล็กลง', type: 'error' });
      return;
    }

    setIsUploading(true);

    try {
      // If SVG file, read as text and convert to clean data URL
      if (file.type === 'image/svg+xml' || file.name.endsWith('.svg')) {
        const reader = new FileReader();
        reader.onload = async (event) => {
          const content = event.target?.result as string;
          let finalUrl = '';
          if (content.startsWith('data:')) {
            finalUrl = content;
          } else {
            // Encode as SVG data URL
            finalUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(content)}`;
          }

          await applyLogo(selectedOwner, finalUrl);
          setIsUploading(false);
        };
        reader.readAsText(file);
      } else {
        // Image PNG / JPG / WebP
        const reader = new FileReader();
        reader.onload = async (event) => {
          const dataUrl = event.target?.result as string;
          await applyLogo(selectedOwner, dataUrl);
          setIsUploading(false);
        };
        reader.readAsDataURL(file);
      }
    } catch (err) {
      console.error('Upload logo error:', err);
      setToast({ isOpen: true, message: 'เกิดข้อผิดพลาดในการโหลดรูปภาพ', type: 'error' });
      setIsUploading(false);
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const applyLogo = async (ownerCode: string, logoUrl: string) => {
    try {
      const existing = configs[ownerCode] || DEFAULT_OWNER_CONFIGS[ownerCode] || {
        id: ownerCode,
        code: ownerCode,
        name: ownerCode
      };

      await saveConfig({
        ...existing,
        code: ownerCode,
        logoUrl: logoUrl,
        updatedAt: new Date().toISOString()
      });

      setToast({
        isOpen: true,
        message: `อัปเดต Logo ของ ${existing.name || ownerCode} และนำไปปรับใช้ในระบบทั้งหมดเรียบร้อยแล้ว`,
        type: 'success'
      });
    } catch (err) {
      console.error('Save logo config error:', err);
      setToast({ isOpen: true, message: 'ไม่สามารถบันทึก Logo ได้ กรุณาลองใหม่อีกครั้ง', type: 'error' });
    }
  };

  const handleApplyUrl = async () => {
    if (!urlInput.trim()) return;
    await applyLogo(selectedOwner, urlInput.trim());
    setUrlInput('');
  };

  const handleResetToDefault = async (ownerCode: string) => {
    try {
      await resetConfig(ownerCode);
      setToast({
        isOpen: true,
        message: `คืนค่า Logo เริ่มต้นของ ${ownerCode} เรียบร้อยแล้ว`,
        type: 'info'
      });
    } catch (err) {
      console.error('Reset error:', err);
      setToast({ isOpen: true, message: 'เกิดข้อผิดพลาดในการคืนค่า', type: 'error' });
    }
  };

  const handleCreateNewOwner = async () => {
    if (!editCode.trim() || !editName.trim()) {
      setToast({ isOpen: true, message: 'กรุณากรอกรหัสและชื่อผู้ให้บริการ', type: 'error' });
      return;
    }

    const code = editCode.trim().toUpperCase();
    try {
      await saveConfig({
        id: code,
        code: code,
        name: editName.trim(),
        primaryColor: editColor,
        logoUrl: editLogoUrl || undefined,
        zoom: 100
      });

      setSelectedOwner(code);
      setIsAddingNew(false);
      setEditCode('');
      setEditName('');
      setEditLogoUrl('');
      setToast({ isOpen: true, message: `เพิ่มผู้ให้บริการ ${code} สำเร็จ`, type: 'success' });
    } catch (err) {
      setToast({ isOpen: true, message: 'ไม่สามารถเพิ่มข้อมูลได้', type: 'error' });
    }
  };

  // Base list of owners (SYMC, UIH, ITEL + any custom)
  const ownersList = ['SYMC', 'UIH', 'ITEL', ...Object.keys(configs).filter(k => !['SYMC', 'UIH', 'ITEL'].includes(k))];

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      <Toast 
        isOpen={toast.isOpen} 
        message={toast.message} 
        type={toast.type} 
        onClose={() => setToast(prev => ({ ...prev, isOpen: false }))} 
      />

      {/* Hidden file input */}
      <input 
        ref={fileInputRef} 
        type="file" 
        accept="image/svg+xml,image/png,image/jpeg,image/webp" 
        className="hidden" 
        onChange={handleFileChange} 
      />

      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-brand-500/10 text-brand-400 border border-brand-500/20">
              <ImageIcon size={20} />
            </div>
            <h3 className="text-xl font-black text-slate-100 tracking-tight font-display">
              จัดการรูปภาพและการซูมขยายขนาด Logo ทุกตำแหน่ง
            </h3>
          </div>
          <p className="text-xs text-slate-400">
            ปรับขยายขนาดของ Logo ได้อิสระสูงสุดถึง 400%+ เพื่อให้ขนาดใหญ่เท่ากันทุกค่าย พร้อมตัวเลือกซูมด่วนและระบบอัปโหลดไฟล์
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={handleAutoEqualize}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 text-xs font-bold transition-all border border-emerald-500/30 shadow-sm"
            title="ปรับขนาดและซูมของทุก Logo ให้สมดุลเท่ากันทุกตำแหน่งทันที"
          >
            <Scale size={15} />
            <span>ปรับขนาดให้เท่ากันอัตโนมัติ</span>
          </button>

          <button 
            onClick={() => setIsAddingNew(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-all border border-slate-700 shadow-sm"
          >
            <Plus size={15} className="text-brand-400" />
            <span>เพิ่ม Owner ใหม่</span>
          </button>
        </div>
      </div>

      {/* Owner Selector Tabs with Zoom Indicator Badges */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {ownersList.map(code => {
          const cfg: OwnerConfig = configs[code] || DEFAULT_OWNER_CONFIGS[code] || { id: code, code, name: code, logoUrl: '' };
          const isSelected = selectedOwner === code;
          const isCustom = Boolean(cfg.logoUrl && !cfg.logoUrl.startsWith('/logos/logo-') && !cfg.logoUrl.startsWith('/logos/partner-'));
          const ownerZoom = cfg.zoom ?? (code === 'UIH' ? 120 : 100);

          return (
            <button
              key={code}
              onClick={() => setSelectedOwner(code)}
              className={`p-3.5 rounded-xl border text-left transition-all relative flex flex-col justify-between ${
                isSelected 
                  ? 'bg-slate-900 border-brand-500 shadow-md shadow-brand-500/10 ring-1 ring-brand-500' 
                  : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 hover:bg-slate-900/80 text-slate-400'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className={`text-xs font-black tracking-wider uppercase ${isSelected ? 'text-brand-400' : 'text-slate-300'}`}>
                  {code}
                </span>
                <div className="flex items-center gap-1">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                    ownerZoom > 100 
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' 
                      : ownerZoom < 100
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      : 'bg-slate-800 text-slate-400 border border-slate-700'
                  }`}>
                    {ownerZoom}%
                  </span>
                  {isCustom && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                      Custom
                    </span>
                  )}
                </div>
              </div>
              <p className="text-[11px] font-medium text-slate-400 truncate">
                {cfg.name || code}
              </p>
            </button>
          );
        })}
      </div>

      {/* Active Owner Logo Card & Editor */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-black text-white">{currentConfig.code}</span>
              <span className="text-sm text-slate-400">&bull; {currentConfig.name}</span>
              {selectedOwner === 'UIH' && (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                  ขยายขนาด {currentZoom}%
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              สถานะ: {isCustomLogo ? (
                <span className="text-amber-400 font-semibold">กำลังใช้รูป Logo ที่อัปโหลดด้วยตนเอง</span>
              ) : (
                <span className="text-emerald-400 font-semibold">กำลังใช้รูป Logo มาตรฐานของระบบ</span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => handleResetZoom(selectedOwner)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-slate-200 bg-slate-800/80 hover:bg-slate-800 border border-slate-700 transition-colors"
              title="รีเซ็ตการซูมของแบรนด์นี้กลับเป็นค่าเริ่มต้น"
            >
              <RotateCcw size={13} />
              <span>รีเซ็ตขนาดซูม ({selectedOwner === 'UIH' ? '120%' : '100%'})</span>
            </button>

            {isCustomLogo && (
              <button
                onClick={() => handleResetToDefault(selectedOwner)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-amber-300 hover:text-amber-200 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 transition-colors"
                title="ลบรูปภาพที่อัปโหลดและกลับไปใช้ Logo ค่าเริ่มต้น"
              >
                <RotateCcw size={13} />
                <span>คืนค่ารูปไฟล์เดิม</span>
              </button>
            )}

            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white bg-brand-600 hover:bg-brand-500 active:bg-brand-700 shadow-md shadow-brand-600/30 transition-all disabled:opacity-50"
            >
              <Upload size={15} />
              <span>{isUploading ? 'กำลังอัปโหลด...' : 'อัปโหลดรูป Logo ใหม่'}</span>
            </button>
          </div>
        </div>

        {/* 1. INTERACTIVE ZOOM & SCALE CONTROL (ระบบซูมและปรับขนาดของ Logo สูงสุดถึง 400%+) */}
        <div className="p-5 rounded-2xl bg-slate-950/80 border border-brand-500/20 shadow-inner space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <Sliders size={16} className="text-brand-400" />
                <span className="text-xs font-black text-slate-200 uppercase tracking-wider">
                  การซูมและปรับขนาด Logo (Zoom & Scale Level)
                </span>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-brand-500/20 text-brand-300 border border-brand-500/30">
                  {currentConfig.code}: {currentZoom}%
                  {currentZoom > 100 ? ` (+${currentZoom - 100}%)` : currentZoom < 100 ? ` (${currentZoom - 100}%)` : ' (100% ปกติ)'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                เลื่อนแถบหรือพิมพ์ตัวเลขเปอร์เซ็นต์เพื่อซูมขยาย Logo ของ {currentConfig.code} ได้สูงสุด 400%+ เพื่อปรับให้มีขนาดใหญ่เท่ากันทุกตำแหน่ง
              </p>
            </div>

            {/* Direct Number Input & Stepper buttons */}
            <div className="flex items-center gap-1.5 self-start sm:self-auto flex-wrap">
              {/* Number Input Box */}
              <div className="flex items-center gap-1 bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1">
                <input
                  type="number"
                  min="20"
                  max="500"
                  step="5"
                  value={currentZoom}
                  onChange={(e) => handleZoomChange(Number(e.target.value))}
                  className="w-14 bg-transparent text-center font-bold text-sm text-brand-300 focus:outline-none"
                  title="พิมพ์ตัวเลข % ซูมที่ต้องการได้โดยตรง"
                />
                <span className="text-xs font-bold text-slate-400">%</span>
              </div>

              {/* Step buttons */}
              <button
                onClick={() => handleZoomChange(currentZoom - 25)}
                className="px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-bold border border-slate-700 transition-colors"
                title="ลดขนาด 25%"
              >
                -25%
              </button>
              <button
                onClick={() => handleZoomChange(currentZoom - 10)}
                className="px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-bold border border-slate-700 transition-colors"
                title="ลดขนาด 10%"
              >
                -10%
              </button>
              <button
                onClick={() => handleZoomChange(currentZoom - 5)}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors"
                title="ลดขนาด 5%"
              >
                <ZoomOut size={15} />
              </button>
              <button
                onClick={() => handleZoomChange(currentZoom + 5)}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors"
                title="เพิ่มขนาด 5%"
              >
                <ZoomIn size={15} />
              </button>
              <button
                onClick={() => handleZoomChange(currentZoom + 10)}
                className="px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-bold border border-slate-700 transition-colors"
                title="เพิ่มขนาด 10%"
              >
                +10%
              </button>
              <button
                onClick={() => handleZoomChange(currentZoom + 25)}
                className="px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-bold border border-slate-700 transition-colors"
                title="เพิ่มขนาด 25%"
              >
                +25%
              </button>
            </div>
          </div>

          {/* Slider with expanded range 30% - 400% */}
          <div className="space-y-2.5">
            <div className="flex items-center gap-4">
              <span className="text-[11px] font-mono text-slate-500">30%</span>
              <input 
                type="range" 
                min="30" 
                max="400" 
                step="1"
                value={currentZoom} 
                onChange={(e) => handleZoomChange(Number(e.target.value))}
                className="w-full h-2.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-brand-500 focus:outline-none"
              />
              <span className="text-[11px] font-mono text-slate-500">400%</span>
            </div>

            {/* Expanded Quick Preset Buttons */}
            <div className="flex items-center gap-1.5 flex-wrap pt-1">
              <span className="text-[10px] font-bold text-slate-500 uppercase mr-1">ระดับซูมด่วน:</span>
              {[
                { label: '50%', val: 50 },
                { label: '75%', val: 75 },
                { label: '90%', val: 90 },
                { label: '100% (ปกติ)', val: 100 },
                { label: '120% (UIH +20%)', val: 120 },
                { label: '140%', val: 140 },
                { label: '160%', val: 160 },
                { label: '180%', val: 180 },
                { label: '200%', val: 200 },
                { label: '250%', val: 250 },
                { label: '300%', val: 300 },
                { label: '350%', val: 350 },
                { label: '400%', val: 400 },
              ].map(preset => (
                <button
                  key={preset.val}
                  onClick={() => handleZoomChange(preset.val)}
                  className={`text-[10px] font-bold px-2 py-1 rounded-lg border transition-all ${
                    currentZoom === preset.val 
                      ? 'bg-brand-500 text-white border-brand-400 shadow-sm shadow-brand-500/20' 
                      : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 2. OPTICAL SCALE COMPARISON (การเปรียบเทียบสัดส่วนและความสมดุล Side-by-Side) */}
        <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Scale size={16} className="text-emerald-400" />
              <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                การเปรียบเทียบความสมดุลขนาดจริง (Side-by-Side Scale Balance & Verification)
              </span>
            </div>
            
            {/* Preview Size Selector */}
            <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800">
              <span className="text-[10px] font-bold text-slate-500 px-1.5 uppercase">Size:</span>
              {(['xs', 'sm', 'md', 'lg', 'xl', 'banner'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setPreviewSize(s)}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase transition-all ${
                    previewSize === s 
                      ? 'bg-brand-500 text-white shadow-sm' 
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <p className="text-[11px] text-slate-400">
            คลิกที่ Logo ด้านล่างเพื่อเลือกและปรับซูมได้โดยตรง ทุก Logo จะแสดงผลตามขนาดและอัตราการซูมจริงที่บันทึกไว้ในระบบ
          </p>

          {/* Side by side preview row with roomy bounds and overflow-visible */}
          <div className="p-6 sm:p-8 bg-white rounded-xl border border-slate-200 shadow-sm flex items-center justify-center gap-8 sm:gap-14 flex-wrap min-h-[140px] overflow-visible">
            <div 
              onClick={() => setSelectedOwner('SYMC')}
              className={`p-3 rounded-2xl transition-all cursor-pointer flex flex-col items-center justify-center gap-2 overflow-visible min-h-[90px] ${
                selectedOwner === 'SYMC' ? 'ring-2 ring-brand-500 bg-slate-50 shadow-sm' : 'hover:bg-slate-50'
              }`}
              title="คลิกเพื่อปรับขนาด SYMC"
            >
              <div className="flex items-center justify-center overflow-visible py-1">
                <OwnerLogo owner="SYMC" size={previewSize} />
              </div>
              <span className="text-[10px] font-bold text-slate-500 font-mono mt-1">
                SYMC ({configs['SYMC']?.zoom ?? 100}%)
              </span>
            </div>

            <span className="text-slate-300 font-black text-2xl select-none">&bull;</span>

            <div 
              onClick={() => setSelectedOwner('UIH')}
              className={`p-3 rounded-2xl transition-all cursor-pointer flex flex-col items-center justify-center gap-2 overflow-visible min-h-[90px] ${
                selectedOwner === 'UIH' ? 'ring-2 ring-brand-500 bg-slate-50 shadow-sm' : 'hover:bg-slate-50'
              }`}
              title="คลิกเพื่อปรับขนาด UIH"
            >
              <div className="flex items-center justify-center overflow-visible py-1">
                <OwnerLogo owner="UIH" size={previewSize} />
              </div>
              <span className="text-[10px] font-bold text-blue-600 font-mono mt-1">
                UIH ({configs['UIH']?.zoom ?? 120}%)
              </span>
            </div>

            <span className="text-slate-300 font-black text-2xl select-none">&bull;</span>

            <div 
              onClick={() => setSelectedOwner('ITEL')}
              className={`p-3 rounded-2xl transition-all cursor-pointer flex flex-col items-center justify-center gap-2 overflow-visible min-h-[90px] ${
                selectedOwner === 'ITEL' ? 'ring-2 ring-brand-500 bg-slate-50 shadow-sm' : 'hover:bg-slate-50'
              }`}
              title="คลิกเพื่อปรับขนาด ITEL"
            >
              <div className="flex items-center justify-center overflow-visible py-1">
                <OwnerLogo owner="ITEL" size={previewSize} />
              </div>
              <span className="text-[10px] font-bold text-slate-500 font-mono mt-1">
                ITEL ({configs['ITEL']?.zoom ?? 100}%)
              </span>
            </div>
          </div>
        </div>

        {/* 3. LIVE PREVIEWS: Light background vs Dark background */}
        <div className="space-y-3">
          <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
            ตัวอย่างการแสดงผล Logo ของ {currentConfig.code} (Live Preview)
          </label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* 1. On Light Background (Documents, Cover Pills, Tables) */}
            <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-sm flex flex-col items-center justify-center min-h-[160px] text-center relative group overflow-visible">
              <span className="absolute top-2 left-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                พื้นหลังสว่าง (White / Paper & Covers)
              </span>
              <div className="py-4 flex items-center justify-center overflow-visible">
                <OwnerLogo owner={selectedOwner} size={previewSize} />
              </div>
            </div>

            {/* 2. On Dark Background (Dark Theme, App Header, Slide Background) */}
            <div className="p-6 rounded-xl bg-slate-950 border border-slate-800 shadow-sm flex flex-col items-center justify-center min-h-[160px] text-center relative group overflow-visible">
              <span className="absolute top-2 left-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                พื้นหลังมืด (Dark / UI & Banners)
              </span>
              <div className="py-4 flex items-center justify-center overflow-visible">
                <OwnerLogo owner={selectedOwner} size={previewSize} />
              </div>
            </div>

          </div>
        </div>

        {/* Drop Zone / Direct Upload Card */}
        <div 
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-slate-700/80 hover:border-brand-500/80 bg-slate-950/40 hover:bg-brand-500/5 rounded-2xl p-8 text-center cursor-pointer transition-all group space-y-2"
        >
          <div className="w-12 h-12 rounded-2xl bg-slate-800 group-hover:bg-brand-500/20 text-slate-400 group-hover:text-brand-400 flex items-center justify-center mx-auto transition-colors">
            <Upload size={24} />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-bold text-slate-200 group-hover:text-white">
              คลิกเพื่อเลือกไฟล์ Logo ของ <span className="text-brand-400">{selectedOwner}</span>
            </p>
            <p className="text-xs text-slate-500">
              รองรับไฟล์ <strong className="text-slate-400">SVG</strong> (แนะนำเพื่อความคมชัดสูงสุด), <strong className="text-slate-400">PNG</strong> (โปร่งใส), <strong className="text-slate-400">JPG</strong>, หรือ <strong className="text-slate-400">WebP</strong>
            </p>
          </div>
        </div>

        {/* Alternative: Image URL Input */}
        <div className="pt-2 border-t border-slate-800/80 flex flex-col sm:flex-row gap-2">
          <input 
            type="text" 
            placeholder="หรือวาง URL ของรูปภาพ / SVG Link เช่น https://example.com/logo.svg" 
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-brand-500 transition-colors"
          />
          <button
            onClick={handleApplyUrl}
            disabled={!urlInput.trim()}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-200 disabled:opacity-40 transition-colors shrink-0"
          >
            ใช้รูปภาพจาก URL
          </button>
        </div>
      </div>

      {/* Modal: Add New Owner */}
      {isAddingNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <h4 className="text-base font-bold text-white flex items-center gap-2">
              <Building2 size={18} className="text-brand-400" />
              <span>เพิ่ม Owner / ผู้ร่วมใช้งานโครงข่ายใหม่</span>
            </h4>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 font-semibold mb-1">รหัสย่อ (Owner Code เช่น NT, AIS, TRUE)</label>
                <input 
                  type="text" 
                  value={editCode} 
                  onChange={(e) => setEditCode(e.target.value.toUpperCase())}
                  placeholder="e.g. NT" 
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono uppercase focus:outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">ชื่อเต็มผู้ให้บริการ (Full Name)</label>
                <input 
                  type="text" 
                  value={editName} 
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="e.g. National Telecom Public Company Limited" 
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">สีประจำแบรนด์ (Brand Color Hex)</label>
                <div className="flex items-center gap-2">
                  <input 
                    type="color" 
                    value={editColor} 
                    onChange={(e) => setEditColor(e.target.value)}
                    className="w-10 h-9 bg-slate-950 border border-slate-800 rounded-lg p-0.5 cursor-pointer"
                  />
                  <input 
                    type="text" 
                    value={editColor} 
                    onChange={(e) => setEditColor(e.target.value)}
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-brand-500"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setIsAddingNew(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700 transition-colors"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleCreateNewOwner}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-brand-600 hover:bg-brand-500 transition-colors"
              >
                บันทึก Owner
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useState } from 'react';
import { MapContainer, TileLayer } from 'react-leaflet';

import { 
  MapPin, Route as RouteIcon, User as UserIcon, Check, X as XIcon, Layers, Pencil, 
  ChevronRight, ChevronLeft, GitMerge, Settings as SettingsIcon, AlertTriangle, 
  AlertCircle, Network, ExternalLink, FileText, Printer, Shield, Activity, Users,
  Folder, Plus, CheckCircle2, ArrowRight, CornerDownRight, Database, Eye, Trash2,
  Sparkles, Radio, Server, Sliders, Lock, Play, Presentation, Monitor, Compass,
  Cpu, Zap, Info, Split, Share2, Layers2, ShieldCheck, CheckCircle, Search, HelpCircle,
  BarChart3, RefreshCw, Smartphone, Globe, Bookmark, ArrowUpRight, Box, Cable, CircleDot
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';

export default function SystemManual() {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const [viewMode, setViewMode] = useState<'presentation' | 'document'>('presentation');
  const [activeSlide, setActiveSlide] = useState<number>(0);
  const themeMode = theme;

  // Interactive demo states
  const [selectedOwnerFilter, setSelectedOwnerFilter] = useState<'ALL' | 'ITEL' | 'SYMC' | 'UIH'>('ALL');
  const [interactiveTube, setInteractiveTube] = useState<number>(1);
  const [activeTab, setActiveTab] = useState<'structure' | 'specs' | 'workflow'>('structure');

  const handlePrint = () => {
    window.print();
  };

  const slides = [
    {
      id: 'overview',
      number: '01',
      badge: 'Executive Summary & Infrastructure',
      title: 'ระบบบริหารจัดการฐานข้อมูลโครงข่ายใยแก้วนำแสงร่วม (Fiber Sharing Database)',
      subtitle: 'แพลตฟอร์มศูนย์กลางข้อมูลโครงข่าย GIS และการแบ่งปันความจุสายไฟเบอร์ออปติกระหว่าง 3 ผู้ให้บริการ (ITEL • SYMC • UIH)',
      category: 'สถาปัตยกรรมภาพรวม'
    },
    {
      id: 'rbac',
      number: '02',
      badge: 'Security & Access Control (RBAC)',
      title: 'ระบบจัดการผู้ใช้งานและสิทธิ์ความปลอดภัยแยกองค์กร',
      subtitle: 'การควบคุมระดับการเข้าถึง 4 ระดับ (Admin, Design, Viewer, Sub-contract) และการอนุมัติสมาชิกแบบ Multi-Tenant',
      category: 'ความปลอดภัยและสิทธิ์'
    },
    {
      id: 'dashboard',
      number: '03',
      badge: 'Project Workspace & Multi-Tenant Boundaries',
      title: 'ศูนย์รวมโครงการโครงข่ายและขอบเขตพื้นที่ดำเนินงาน',
      subtitle: 'การแยกฐานข้อมูลตามโครงการ (Project Scoping) พร้อมสรุปสถิติจุดเชื่อมต่อ ระยะทาง และการถือครองแบบเรียลไทม์',
      category: 'การจัดการโครงการ'
    },
    {
      id: 'gis-map',
      number: '04',
      badge: 'GIS Spatial Mapping & Route Snapping',
      title: 'แผนที่ภูมิสารสนเทศอัจฉริยะและการวาดแนวสายเคเบิล',
      subtitle: 'เครื่องมือสร้าง Enclosure, ลากสายตามพิกัดจริง (Route Snapping), จุดขดสายสำรอง (Slack Loops) และค้นหาสถานที่',
      category: 'แผนที่ภูมิสารสนเทศ'
    },
    {
      id: 'core-manager',
      number: '05',
      badge: 'TIA/EIA-598 Color Standard & Capacity',
      title: 'ระบบบริหารจัดการคอร์ รหัสสีสากล และ Circuit ID',
      subtitle: 'โครงสร้างหลอดและคอร์ (Tube & Core Identification), การจัดสรรคอร์ให้ลูกค้า, ลำดับความสำคัญ และประวัติสถานะ',
      category: 'การจัดการคอร์ไฟเบอร์'
    },
    {
      id: 'splice-manager',
      number: '06',
      badge: 'Splice Hub, Tray Layout & Port Matrix',
      title: 'ระบบผังการสไปลซ์สายและจัดการพอร์ตกล่องรอยต่อ',
      subtitle: 'การเชื่อมต่อคอร์ระดับ Click-to-Splice, การต่อยกหลอด 12F Bulk Splice, ถาดสไปลซ์ (Trays) และ Port Assignment',
      category: 'ผังการเชื่อมต่อและสไปลซ์'
    },
    {
      id: 'settings-audit',
      number: '07',
      badge: 'Master Hardware Catalog & Audit Trails',
      title: 'คลังมาตรฐานอุปกรณ์และบันทึกประวัติการทำงานย้อนหลัง',
      subtitle: 'การกำหนดแม่แบบกล่อง (ODF, Closure, FDB), มาตรฐานชนิดสายเคเบิล และระบบบันทึก Audit Logs ตรวจสอบย้อนหลัง',
      category: 'อุปกรณ์และบันทึกประวัติ'
    }
  ];

  return (
    <div className={`min-h-screen font-sans selection:bg-sky-500 selection:text-white transition-colors duration-200 ${
      themeMode === 'light' 
        ? 'bg-slate-50 text-slate-800 print:bg-white print:text-slate-900' 
        : 'bg-slate-950 text-slate-100 print:bg-white print:text-slate-900'
    }`}>
      
      {/* Top Floating Control Bar */}
      <header className={`sticky top-0 z-50 backdrop-blur-xl border-b px-4 sm:px-8 py-3 flex items-center justify-between shadow-sm print:hidden ${
        themeMode === 'light'
          ? 'bg-white/95 border-slate-200 text-slate-800 shadow-slate-100'
          : 'bg-slate-900/90 border-slate-800 text-slate-100'
      }`}>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => navigate('/')}
            className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 text-xs font-bold border ${
              themeMode === 'light'
                ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
            }`}
          >
            <ChevronLeft size={16} /> กลับสู่ระบบงาน
          </button>

          <div className="h-5 w-px bg-slate-200 dark:bg-slate-800 mx-1 hidden sm:block" />

          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-sky-600 rounded-xl flex items-center justify-center shadow-md shadow-sky-600/20">
              <Presentation className="text-white w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black text-slate-900 dark:text-white tracking-tight font-display">
                  FIBER SHARING DATABASE
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-400 font-bold border border-sky-200 dark:border-sky-500/30">
                  SYSTEM PRESENTATION & SPECIFICATION
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                เอกสารนำเสนอและภาพรวมการทำงานของระบบ (ITEL &bull; SYMC &bull; UIH)
              </p>
            </div>
          </div>
        </div>

        {/* View mode switcher & theme switcher */}
        <div className="flex items-center gap-2">
          {/* Theme Switcher */}
          <button
            onClick={toggleTheme}
            className={`px-2.5 py-1.5 rounded-xl text-xs font-bold border flex items-center gap-1.5 transition-all ${
              themeMode === 'light'
                ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                : 'bg-slate-800 hover:bg-slate-700 text-amber-400 border-slate-700'
            }`}
            title="สลับโหมดสีสว่าง/มืด"
          >
            {themeMode === 'light' ? '🌙 โหมดมืด' : '☀️ โหมดสว่าง'}
          </button>

          <div className={`flex items-center p-1 rounded-xl border text-xs ${
            themeMode === 'light' ? 'bg-slate-100 border-slate-200' : 'bg-slate-950 border-slate-800'
          }`}>
            <button
              onClick={() => setViewMode('presentation')}
              className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-all flex items-center gap-1.5 ${
                viewMode === 'presentation'
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Presentation size={14} /> โหมดสไลด์นำเสนอ
            </button>
            <button
              onClick={() => setViewMode('document')}
              className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-all flex items-center gap-1.5 ${
                viewMode === 'document'
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <FileText size={14} /> คู่มือฉบับเต็ม
            </button>
          </div>

          <button 
            onClick={handlePrint}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition-all ${
              themeMode === 'light'
                ? 'bg-white hover:bg-slate-50 text-slate-700 border-slate-300 shadow-sm'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
            }`}
          >
            <Printer size={14} /> <span className="hidden sm:inline">พิมพ์ / PDF</span>
          </button>
        </div>
      </header>

      {/* =========================================================================
          VIEW MODE 1: MODERN, READABLE PRESENTATION DECK (เน้นอ่านง่าย สบายตา ชัดเจน)
      ========================================================================= */}
      {viewMode === 'presentation' && (
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-6">
          
          {/* Quick Slide Navigation Bar */}
          <div className={`p-2.5 rounded-2xl border mb-6 flex items-center justify-between overflow-x-auto gap-2 shadow-sm ${
            themeMode === 'light' ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
          }`}>
            <div className="flex items-center gap-1.5 min-w-max">
              {slides.map((s, idx) => (
                <button
                  key={s.id}
                  onClick={() => setActiveSlide(idx)}
                  className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                    activeSlide === idx
                      ? 'bg-sky-600 text-white shadow-md shadow-sky-600/20'
                      : themeMode === 'light'
                        ? 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                        : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                  }`}
                >
                  <span className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-black ${
                    activeSlide === idx 
                      ? 'bg-white/20 text-white' 
                      : themeMode === 'light' ? 'bg-slate-200 text-slate-700' : 'bg-slate-800 text-slate-400'
                  }`}>
                    {s.number}
                  </span>
                  <span className="truncate max-w-[140px] sm:max-w-none">{s.category}</span>
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1.5 shrink-0 pl-2 border-l border-slate-200 dark:border-slate-800">
              <button 
                disabled={activeSlide === 0}
                onClick={() => setActiveSlide(prev => Math.max(0, prev - 1))}
                className={`p-2 rounded-xl border transition-all ${
                  themeMode === 'light'
                    ? 'bg-slate-50 hover:bg-slate-100 disabled:opacity-30 border-slate-200 text-slate-700'
                    : 'bg-slate-800 hover:bg-slate-700 disabled:opacity-30 border-slate-700 text-white'
                }`}
                title="สไลด์ก่อนหน้า"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-xs font-mono font-bold px-2 text-slate-500">
                {activeSlide + 1} / {slides.length}
              </span>
              <button 
                disabled={activeSlide === slides.length - 1}
                onClick={() => setActiveSlide(prev => Math.min(slides.length - 1, prev + 1))}
                className={`p-2 rounded-xl border transition-all ${
                  themeMode === 'light'
                    ? 'bg-slate-50 hover:bg-slate-100 disabled:opacity-30 border-slate-200 text-slate-700'
                    : 'bg-slate-800 hover:bg-slate-700 disabled:opacity-30 border-slate-700 text-white'
                }`}
                title="สไลด์ถัดไป"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          {/* Main Slide Presentation Stage */}
          <div className={`rounded-3xl border shadow-xl p-6 sm:p-10 transition-all ${
            themeMode === 'light' 
              ? 'bg-white border-slate-200/90 shadow-slate-200/50' 
              : 'bg-slate-900 border-slate-800 shadow-slate-950/80'
          }`}>
            
            {/* Slide Header */}
            <div className="mb-8 pb-6 border-b border-slate-200 dark:border-slate-800">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-sky-100 text-sky-800 dark:bg-sky-500/10 dark:text-sky-400 dark:border dark:border-sky-500/30">
                  <Sparkles size={14} /> สไลด์ที่ {slides[activeSlide].number} : {slides[activeSlide].badge}
                </span>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-500">พันธมิตรผู้ใช้บริการ:</span>
                  <span className="px-2 py-0.5 rounded text-[11px] font-black bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800">ITEL</span>
                  <span className="px-2 py-0.5 rounded text-[11px] font-black bg-rose-100 text-rose-800 border border-rose-300 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800">SYMC</span>
                  <span className="px-2 py-0.5 rounded text-[11px] font-black bg-blue-100 text-blue-800 border border-blue-300 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800">UIH</span>
                </div>
              </div>

              <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-white font-display mb-2">
                {slides[activeSlide].title}
              </h2>
              <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed max-w-5xl">
                {slides[activeSlide].subtitle}
              </p>
            </div>

            {/* ---------------- SLIDE 0: SYSTEM OVERVIEW & ARCHITECTURE ---------------- */}
            {activeSlide === 0 && (
              <div className="space-y-8">
                {/* 3 Core Value Pillars */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  <div className={`p-5 rounded-2xl border transition-all ${
                    themeMode === 'light' ? 'bg-sky-50/50 border-sky-200' : 'bg-slate-950 border-slate-800'
                  }`}>
                    <div className="w-10 h-10 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center mb-3">
                      <Share2 size={22} />
                    </div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2">
                      1. Multi-Tenant Core Sharing
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                      บริหารจัดการและแยกกรรมสิทธิ์สายใยแก้ว (Core Owner) ระหว่าง <strong>ITEL, SYMC, UIH</strong> ป้องกันปัญหาการใช้คอร์ซ้ำซ้อน และติดตามการจองได้อย่างชัดเจน
                    </p>
                  </div>

                  <div className={`p-5 rounded-2xl border transition-all ${
                    themeMode === 'light' ? 'bg-purple-50/50 border-purple-200' : 'bg-slate-950 border-slate-800'
                  }`}>
                    <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center mb-3">
                      <GitMerge size={22} />
                    </div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2">
                      2. Splice Matrix & Tray Hub
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                      ผังการสไปลซ์เชื่อมต่อสายแบบละเอียด (ระดับเส้นต่อเส้น และยกหลอด 12F) พร้อมระบุตำแหน่งถาดสไปลซ์ (Tray) และการเชื่อมต่อท่อทางเข้า-ออก (Port Matrix)
                    </p>
                  </div>

                  <div className={`p-5 rounded-2xl border transition-all ${
                    themeMode === 'light' ? 'bg-emerald-50/50 border-emerald-200' : 'bg-slate-950 border-slate-800'
                  }`}>
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-3">
                      <Compass size={22} />
                    </div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2">
                      3. GIS Spatial & Slack Loops
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                      วาดเส้นทางบนแผนที่ดาวเทียมตามแนวถนนจริง พร้อมคำนวณระยะทางแม่นยำ และมาร์กจุดพักขดสายสำรอง (Slack Loops) ตามหน้างาน
                    </p>
                  </div>
                </div>

                {/* Technical Architecture Overview */}
                <div className={`p-6 rounded-2xl border ${
                  themeMode === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
                }`}>
                  <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-200 dark:border-slate-800">
                    <div className="flex items-center gap-2">
                      <Cpu className="text-sky-600 dark:text-sky-400" size={18} />
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                        สถาปัตยกรรมการทำงานระดับ Cloud & Realtime Database
                      </h4>
                    </div>
                    <span className="text-xs font-bold px-2.5 py-1 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300">
                      LIVE FIREBASE FIRESTORE
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className={`p-4 rounded-xl border ${
                      themeMode === 'light' ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
                    }`}>
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Frontend Layer</span>
                      <p className="text-sm font-bold text-slate-900 dark:text-white">React 18 + TypeScript</p>
                      <p className="text-xs text-slate-500 mt-1">Tailwind CSS & Motion UI</p>
                    </div>

                    <div className={`p-4 rounded-xl border ${
                      themeMode === 'light' ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
                    }`}>
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">GIS Engine</span>
                      <p className="text-sm font-bold text-slate-900 dark:text-white">Leaflet Map Engine</p>
                      <p className="text-xs text-slate-500 mt-1">OpenStreetMap & Satellite View</p>
                    </div>

                    <div className={`p-4 rounded-xl border ${
                      themeMode === 'light' ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
                    }`}>
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Database & Sync</span>
                      <p className="text-sm font-bold text-slate-900 dark:text-white">Google Firestore</p>
                      <p className="text-xs text-slate-500 mt-1">Real-time Snapshot Listeners</p>
                    </div>

                    <div className={`p-4 rounded-xl border ${
                      themeMode === 'light' ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
                    }`}>
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Security & Access</span>
                      <p className="text-sm font-bold text-slate-900 dark:text-white">RBAC 4 Levels</p>
                      <p className="text-xs text-slate-500 mt-1">Email Approval Verification</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ---------------- SLIDE 1: RBAC & USER APPROVAL ---------------- */}
            {activeSlide === 1 && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Left: Role Definitions */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <ShieldCheck className="text-sky-600 dark:text-sky-400" size={18} />
                      ระดับสิทธิ์ผู้ใช้งาน (4 Roles Architecture)
                    </h3>

                    <div className={`p-4 rounded-xl border ${
                      themeMode === 'light' ? 'bg-sky-50 border-sky-200' : 'bg-slate-950 border-slate-800'
                    }`}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-black text-sky-800 dark:text-sky-400">1. Admin (ผู้ดูแลระบบสูงสุด)</span>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-sky-200 text-sky-800 dark:bg-sky-500/20 dark:text-sky-300 font-bold">Full Access</span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                        อนุมัติสมาชิกใหม่, กำหนดบทบาท, สร้าง/ลบโครงการ, แก้ไขคลังอุปกรณ์ และจัดการระบบความปลอดภัยทั้งหมด
                      </p>
                    </div>

                    <div className={`p-4 rounded-xl border ${
                      themeMode === 'light' ? 'bg-indigo-50 border-indigo-200' : 'bg-slate-950 border-slate-800'
                    }`}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-black text-indigo-800 dark:text-indigo-400">2. Design (วิศวกรออกแบบโครงข่าย)</span>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-200 text-indigo-800 dark:bg-indigo-500/20 dark:text-indigo-300 font-bold">Read & Write</span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                        สร้างโปรเจกต์ใหม่และกำหนดสิทธิ์เลือกว่า Operator ใดสามารถเข้าดูข้อมูลได้, วาดและแก้ไขเส้นทางเคเบิล, ปักหมุดกล่องพัก, บันทึกการต่อสายสไปลซ์ และกำหนด Circuit ID ในสังกัด
                      </p>
                    </div>

                    <div className={`p-4 rounded-xl border ${
                      themeMode === 'light' ? 'bg-purple-50 border-purple-200' : 'bg-slate-950 border-slate-800'
                    }`}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-black text-purple-800 dark:text-purple-400">3. Viewer (ฝ่ายปฏิบัติการ/ตรวจสอบ)</span>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-purple-200 text-purple-800 dark:bg-purple-500/20 dark:text-purple-300 font-bold">Read Only</span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                        ค้นหาและดูแผนที่เส้นทาง, ตรวจสอบสถานะคู่สายและผังการต่อสาย, ตรวจสอบ Circuit ID และพิมพ์รายงาน
                      </p>
                    </div>

                    <div className={`p-4 rounded-xl border ${
                      themeMode === 'light' ? 'bg-amber-50 border-amber-200' : 'bg-slate-950 border-slate-800'
                    }`}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-black text-amber-800 dark:text-amber-400">4. Sub-contract (ผู้รับเหมาภาคสนาม)</span>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-amber-200 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300 font-bold">Field Access</span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                        เข้าดูพิกัดกล่องและผังสไปลซ์เฉพาะโครงการที่ได้รับมอบหมาย บันทึกผลการทำงานหน้างาน
                      </p>
                    </div>
                  </div>

                  {/* Right: Mockup of Real User Management Table */}
                  <div className={`lg:col-span-2 p-5 rounded-2xl border ${
                    themeMode === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
                  }`}>
                    <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-200 dark:border-slate-800">
                      <div>
                        <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                          <Users size={16} className="text-sky-600 dark:text-sky-400" />
                          หน้าต่างจริง: User Management Console (ระบบจัดการและอนุมัติผู้ใช้)
                        </h4>
                        <p className="text-xs text-slate-500 mt-0.5">จำลองการเข้าถึงและแยกสังกัด 3 องค์กรพันธมิตร</p>
                      </div>
                      <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-500/10 px-2.5 py-1 rounded-lg">
                        ระบบอนุมัติเข้มงวด
                      </span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className={`border-b text-[11px] font-bold uppercase ${
                            themeMode === 'light' ? 'border-slate-200 text-slate-500' : 'border-slate-800 text-slate-400'
                          }`}>
                            <th className="pb-2.5">ผู้ใช้งาน / Email</th>
                            <th className="pb-2.5">องค์กร (Owner)</th>
                            <th className="pb-2.5">บทบาท (Role)</th>
                            <th className="pb-2.5">สถานะการอนุมัติ</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60 font-medium">
                          <tr>
                            <td className="py-3">
                              <span className="font-bold text-slate-900 dark:text-white block">vpunpum@gmail.com</span>
                              <span className="text-[11px] text-slate-500">Super Admin • Master Authority</span>
                            </td>
                            <td className="py-3"><span className="text-slate-700 dark:text-slate-300 font-bold">Global Admin</span></td>
                            <td className="py-3"><span className="px-2 py-0.5 rounded text-[11px] font-bold bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-400">Admin</span></td>
                            <td className="py-3"><span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1"><CheckCircle2 size={13} /> Approved</span></td>
                          </tr>
                          <tr>
                            <td className="py-3">
                              <span className="font-bold text-slate-900 dark:text-white block">somchai.itel@infra.co.th</span>
                              <span className="text-[11px] text-slate-500">Lead Fiber Design Engineer</span>
                            </td>
                            <td className="py-3"><span className="px-2 py-0.5 rounded text-[11px] font-black bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800">ITEL</span></td>
                            <td className="py-3"><span className="px-2 py-0.5 rounded text-[11px] font-bold bg-indigo-100 text-indigo-800 dark:bg-indigo-500/20 dark:text-indigo-400">Design</span></td>
                            <td className="py-3"><span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1"><CheckCircle2 size={13} /> Approved</span></td>
                          </tr>
                          <tr>
                            <td className="py-3">
                              <span className="font-bold text-slate-900 dark:text-white block">wichai.symc@infra.co.th</span>
                              <span className="text-[11px] text-slate-500">NOC Operations & Monitoring</span>
                            </td>
                            <td className="py-3"><span className="px-2 py-0.5 rounded text-[11px] font-black bg-rose-100 text-rose-800 border border-rose-300 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800">SYMC</span></td>
                            <td className="py-3"><span className="px-2 py-0.5 rounded text-[11px] font-bold bg-purple-100 text-purple-800 dark:bg-purple-500/20 dark:text-purple-400">Viewer</span></td>
                            <td className="py-3"><span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1"><CheckCircle2 size={13} /> Approved</span></td>
                          </tr>
                          <tr>
                            <td className="py-3">
                              <span className="font-bold text-slate-900 dark:text-white block">field.uih@infra.co.th</span>
                              <span className="text-[11px] text-slate-500">Site Contractor Engineer</span>
                            </td>
                            <td className="py-3"><span className="px-2 py-0.5 rounded text-[11px] font-black bg-blue-100 text-blue-800 border border-blue-300 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800">UIH</span></td>
                            <td className="py-3"><span className="text-slate-400">ยังไม่กำหนด</span></td>
                            <td className="py-3"><span className="text-amber-600 dark:text-amber-400 font-bold flex items-center gap-1">⏳ รอ Admin อนุมัติ</span></td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ---------------- SLIDE 2: PROJECTS DIRECTORY ---------------- */}
            {activeSlide === 2 && (
              <div className="space-y-6">
                <div className={`p-6 rounded-2xl border ${
                  themeMode === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
                }`}>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 mb-6 border-b border-slate-200 dark:border-slate-800">
                    <div>
                      <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <Folder className="text-sky-600 dark:text-sky-400" size={18} />
                        หน้าจอจัดการโครงการ (Project Scoping & Workspace Isolation)
                      </h3>
                      <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                        แยกฐานข้อมูลโครงข่ายตามขอบเขตโครงการเพื่อความเป็นระเบียบและป้องกันการปะปนของข้อมูล
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold px-3 py-1 rounded-lg bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-300">
                        Total: 2 Active Projects
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {/* Project Card 1 */}
                    <div className={`p-5 rounded-2xl border transition-all ${
                      themeMode === 'light' ? 'bg-white border-slate-200 hover:border-sky-400 shadow-sm' : 'bg-slate-900 border-slate-800 hover:border-sky-500'
                    }`}>
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-400">
                            โครงการเขตกรุงเทพมหานคร (Tier 1)
                          </span>
                          <h4 className="text-base font-bold text-slate-900 dark:text-white mt-1.5">
                            Bangkok Metro Loop 01 (Sukhumvit - Asoke - Rama 9)
                          </h4>
                          <p className="text-xs text-slate-500 mt-0.5">
                            โครงข่ายหลักเชื่อมต่อศูนย์ข้อมูลและสถานีสำคัญในเขตศูนย์กลางธุรกิจ
                          </p>
                        </div>
                        <span className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                      </div>

                      <div className={`grid grid-cols-3 gap-2 p-3 my-3 rounded-xl text-center border ${
                        themeMode === 'light' ? 'bg-slate-50 border-slate-100' : 'bg-slate-950 border-slate-800'
                      }`}>
                        <div>
                          <span className="text-[10px] text-slate-500 font-bold block uppercase">Enclosures</span>
                          <span className="text-sm font-black text-slate-900 dark:text-white">12 จุดพัก</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-500 font-bold block uppercase">Fiber Routes</span>
                          <span className="text-sm font-black text-slate-900 dark:text-white">24 เส้นทาง</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-500 font-bold block uppercase">Total Distance</span>
                          <span className="text-sm font-black text-sky-600 dark:text-sky-400">38.5 กม.</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold">ร่วมใช้งานโดย:</span>
                          <span className="font-bold text-amber-700 dark:text-amber-400">ITEL</span>,
                          <span className="font-bold text-rose-700 dark:text-rose-400">SYMC</span>,
                          <span className="font-bold text-blue-700 dark:text-blue-400">UIH</span>
                        </div>
                        <span className="text-sky-600 dark:text-sky-400 font-bold flex items-center gap-1">
                          เข้าสู่แผนที่ <ArrowRight size={13} />
                        </span>
                      </div>
                    </div>

                    {/* Project Card 2 */}
                    <div className={`p-5 rounded-2xl border transition-all ${
                      themeMode === 'light' ? 'bg-white border-slate-200 hover:border-purple-400 shadow-sm' : 'bg-slate-900 border-slate-800 hover:border-purple-500'
                    }`}>
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-purple-100 text-purple-800 dark:bg-purple-500/20 dark:text-purple-400">
                            โครงการระเบียงเศรษฐกิจภาคตะวันออก (Tier 2)
                          </span>
                          <h4 className="text-base font-bold text-slate-900 dark:text-white mt-1.5">
                            EEC Highway Backbone 07 (Chonburi - Rayong Trunk)
                          </h4>
                          <p className="text-xs text-slate-500 mt-0.5">
                            โครงข่ายทางหลวงเชื่อมโยงนิคมอุตสาหกรรมแหลมฉบังและมาบตาพุด
                          </p>
                        </div>
                        <span className="w-3 h-3 rounded-full bg-emerald-500 shrink-0" />
                      </div>

                      <div className={`grid grid-cols-3 gap-2 p-3 my-3 rounded-xl text-center border ${
                        themeMode === 'light' ? 'bg-slate-50 border-slate-100' : 'bg-slate-950 border-slate-800'
                      }`}>
                        <div>
                          <span className="text-[10px] text-slate-500 font-bold block uppercase">Enclosures</span>
                          <span className="text-sm font-black text-slate-900 dark:text-white">8 จุดพัก</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-500 font-bold block uppercase">Fiber Routes</span>
                          <span className="text-sm font-black text-slate-900 dark:text-white">16 เส้นทาง</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-500 font-bold block uppercase">Total Distance</span>
                          <span className="text-sm font-black text-purple-600 dark:text-purple-400">62.1 กม.</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold">ร่วมใช้งานโดย:</span>
                          <span className="font-bold text-amber-700 dark:text-amber-400">ITEL</span>,
                          <span className="font-bold text-rose-700 dark:text-rose-400">SYMC</span>
                        </div>
                        <span className="text-purple-600 dark:text-purple-400 font-bold flex items-center gap-1">
                          เข้าสู่แผนที่ <ArrowRight size={13} />
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ---------------- SLIDE 3: GIS INTERACTIVE MAP ---------------- */}
            {activeSlide === 3 && (
              <div className="space-y-6">
                <div className={`p-6 rounded-2xl border ${
                  themeMode === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
                }`}>
                  <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-200 dark:border-slate-800">
                    <div>
                      <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <MapPin className="text-sky-600 dark:text-sky-400" size={18} />
                        หน้าจอจริง: GIS Interactive Network Map & Drawing Canvas
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        ระบบวาดและคำนวณเส้นทางตามแนวถนน (Road Snapping) พร้อมจุดพักสายสำรอง
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold px-2.5 py-1 rounded bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-400">
                        GPS พิกัดจริง & สลับภาพดาวเทียม
                      </span>
                    </div>
                  </div>

                  {/* Visual Demonstration of GIS Canvas */}
                  <div className={`rounded-2xl border overflow-hidden flex flex-col md:flex-row h-[360px] ${
                    themeMode === 'light' ? 'border-slate-300' : 'border-slate-800'
                  }`}>
                    {/* Left Toolbar */}
                    <div className={`w-full md:w-60 p-4 border-r flex flex-col justify-between shrink-0 ${
                      themeMode === 'light' ? 'bg-slate-100 border-slate-200' : 'bg-slate-900 border-slate-800'
                    }`}>
                      <div className="space-y-2">
                        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-2">
                          ชุดเครื่องมือวาดโครงข่าย
                        </span>

                        <div className="p-2.5 bg-sky-600 text-white rounded-xl flex items-center gap-2 shadow-sm cursor-pointer">
                          <MapPin size={16} />
                          <span className="text-xs font-bold">1. ปักหมุดกล่องรอยต่อ (Enclosure)</span>
                        </div>

                        <div className={`p-2.5 rounded-xl border flex items-center gap-2 text-xs font-bold cursor-pointer ${
                          themeMode === 'light' ? 'bg-white text-slate-700 border-slate-200' : 'bg-slate-950 text-slate-300 border-slate-800'
                        }`}>
                          <RouteIcon size={16} className="text-sky-600" />
                          <span>2. ลากเส้นทางเคเบิล (Route)</span>
                        </div>

                        <div className={`p-2.5 rounded-xl border flex items-center gap-2 text-xs font-bold cursor-pointer ${
                          themeMode === 'light' ? 'bg-white text-slate-700 border-slate-200' : 'bg-slate-950 text-slate-300 border-slate-800'
                        }`}>
                          <GitMerge size={16} className="text-purple-600" />
                          <span>3. เพิ่มจุดขดสาย (Slack Loop)</span>
                        </div>
                      </div>

                      <div className={`p-3 rounded-xl border text-xs ${
                        themeMode === 'light' ? 'bg-white border-slate-200' : 'bg-slate-950 border-slate-800'
                      }`}>
                        <span className="text-[10px] font-bold text-slate-500 uppercase block">Selected Node:</span>
                        <p className="font-bold text-slate-900 dark:text-white">ENC-02 Asoke Junction</p>
                        <p className="text-sky-600 dark:text-sky-400 font-mono text-[11px]">13.7367° N, 100.5608° E</p>
                      </div>
                    </div>

                    {/* Canvas Stage */}
                    <div className="flex-1 bg-slate-900 relative overflow-hidden flex items-center justify-center">
                      
                      {/* Real Map Background */}
                      <div className="absolute inset-0 z-0 opacity-40 dark:opacity-25 pointer-events-none">
                        <MapContainer 
                          center={[13.7367, 100.5608]} 
                          zoom={14} 
                          className="w-full h-full" 
                          zoomControl={false} 
                          dragging={false} 
                          scrollWheelZoom={false} 
                          doubleClickZoom={false}
                          attributionControl={false}
                        >
                          <TileLayer url="https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}" className={themeMode === 'dark' ? 'invert hue-rotate-180 brightness-90 contrast-75' : 'opacity-80'} />
                        </MapContainer>
                      </div>

                      <div className="absolute inset-0 opacity-25 z-0" style={{ backgroundImage: 'radial-gradient(#38bdf8 1px, transparent 1px)', backgroundSize: '24px 24px' }} />

                      {/* Map Paths */}
                      <svg className="absolute inset-0 w-full h-full pointer-events-none">
                        <path 
                          d="M 80 220 Q 220 140 340 160 T 540 80" 
                          fill="none" 
                          stroke="#0284c7" 
                          strokeWidth="4" 
                          strokeLinecap="round"
                          className="drop-shadow-[0_0_8px_rgba(2,132,199,0.8)]"
                        />
                        <path 
                          d="M 340 160 Q 420 230 480 280" 
                          fill="none" 
                          stroke="#a855f7" 
                          strokeWidth="4" 
                          strokeLinecap="round"
                          className="drop-shadow-[0_0_8px_rgba(168,85,247,0.8)]"
                        />
                      </svg>

                      {/* Markers */}
                      <div className="absolute top-[190px] left-[65px] flex flex-col items-center">
                        <div className="w-8 h-8 rounded-full bg-sky-600 border-2 border-white text-white flex items-center justify-center shadow-lg">
                          <MapPin size={15} />
                        </div>
                        <span className="mt-1 px-2 py-0.5 bg-slate-900/90 text-white text-[10px] font-bold rounded border border-slate-700">
                          ENC-01 Sukhumvit
                        </span>
                      </div>

                      <div className="absolute top-[135px] left-[320px] flex flex-col items-center">
                        <div className="w-9 h-9 rounded-full bg-purple-600 border-2 border-white text-white flex items-center justify-center shadow-lg animate-pulse">
                          <GitMerge size={17} />
                        </div>
                        <span className="mt-1 px-2 py-0.5 bg-purple-950 text-purple-300 text-[10px] font-black rounded border border-purple-800">
                          ENC-02 Asoke Hub
                        </span>
                      </div>

                      <div className="absolute top-[250px] left-[460px] flex flex-col items-center">
                        <div className="w-7 h-7 rounded-full bg-emerald-600 border-2 border-white text-white flex items-center justify-center shadow-md">
                          <Server size={13} />
                        </div>
                        <span className="mt-1 px-2 py-0.5 bg-slate-900/90 text-white text-[10px] font-bold rounded border border-slate-700">
                          ODF Rama 9 POP
                        </span>
                      </div>

                      {/* Slack Loop Callout */}
                      <div className="absolute top-[90px] left-[220px] flex items-center gap-1.5 px-3 py-1 bg-amber-500 text-slate-950 text-xs font-black rounded-full shadow-lg">
                        <RefreshCw size={13} /> ขดสายสำรอง: 50 เมตร
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ---------------- SLIDE 4: TIA-598 CORES & CAPACITY ---------------- */}
            {activeSlide === 4 && (
              <div className="space-y-6">
                <div className={`p-6 rounded-2xl border ${
                  themeMode === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
                }`}>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 mb-4 border-b border-slate-200 dark:border-slate-800">
                    <div>
                      <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <Layers className="text-emerald-600 dark:text-emerald-400" size={18} />
                        หน้าจอจัดการคอร์และรหัสสีตามมาตรฐานสากล TIA/EIA-598
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        แสดงการจัดกลุ่มหลอด (Loose Tubes 12 สี), เจ้าของคอร์, Circuit ID และสถานะความพร้อม
                      </p>
                    </div>

                    {/* Filter Owner */}
                    <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-bold">
                      <span className="text-slate-400 px-2">กรองเจ้าของ:</span>
                      {(['ALL', 'ITEL', 'SYMC', 'UIH'] as const).map(owner => (
                        <button
                          key={owner}
                          onClick={() => setSelectedOwnerFilter(owner)}
                          className={`px-2.5 py-1 rounded-lg transition-all ${
                            selectedOwnerFilter === owner
                              ? 'bg-sky-600 text-white'
                              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                          }`}
                        >
                          {owner}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className={`border-b text-[11px] font-bold uppercase ${
                          themeMode === 'light' ? 'border-slate-200 text-slate-500' : 'border-slate-800 text-slate-400'
                        }`}>
                          <th className="pb-2.5 pl-2">คอร์ #</th>
                          <th className="pb-2.5">รหัสสีหลอดและคอร์ (TIA-598)</th>
                          <th className="pb-2.5">ผู้ถือครอง (Owner)</th>
                          <th className="pb-2.5">สถานะการใช้งาน</th>
                          <th className="pb-2.5">Priority</th>
                          <th className="pb-2.5">Circuit ID & รายละเอียดวงจร</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60 font-medium">
                        {(selectedOwnerFilter === 'ALL' || selectedOwnerFilter === 'ITEL') && (
                          <tr>
                            <td className="py-2.5 pl-2 font-mono font-bold text-slate-900 dark:text-white">#01</td>
                            <td className="py-2.5">
                              <div className="flex items-center gap-2">
                                <span className="w-3.5 h-3.5 rounded bg-blue-500 border border-slate-300 dark:border-white/20" />
                                <span className="font-bold text-slate-800 dark:text-slate-200">Tube 1 (Blue) &bull; Core 1 Blue</span>
                              </div>
                            </td>
                            <td className="py-2.5">
                              <span className="px-2 py-0.5 rounded text-[11px] font-black bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800">ITEL</span>
                            </td>
                            <td className="py-2.5">
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-400">USED</span>
                            </td>
                            <td className="py-2.5"><span className="text-rose-600 dark:text-rose-400 font-bold text-[10px]">HIGH</span></td>
                            <td className="py-2.5 font-mono text-[11px] text-slate-700 dark:text-slate-300">CKT-ITEL-BKK-0982 (Bank Main Gateway)</td>
                          </tr>
                        )}

                        {(selectedOwnerFilter === 'ALL' || selectedOwnerFilter === 'SYMC') && (
                          <tr>
                            <td className="py-2.5 pl-2 font-mono font-bold text-slate-900 dark:text-white">#02</td>
                            <td className="py-2.5">
                              <div className="flex items-center gap-2">
                                <span className="w-3.5 h-3.5 rounded bg-orange-500 border border-slate-300 dark:border-white/20" />
                                <span className="font-bold text-slate-800 dark:text-slate-200">Tube 1 (Blue) &bull; Core 2 Orange</span>
                              </div>
                            </td>
                            <td className="py-2.5">
                              <span className="px-2 py-0.5 rounded text-[11px] font-black bg-rose-100 text-rose-800 border border-rose-300 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800">SYMC</span>
                            </td>
                            <td className="py-2.5">
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-400">USED</span>
                            </td>
                            <td className="py-2.5"><span className="text-amber-600 dark:text-amber-400 font-bold text-[10px]">MEDIUM</span></td>
                            <td className="py-2.5 font-mono text-[11px] text-slate-700 dark:text-slate-300">CKT-SYMC-METRO-4411 (Enterprise Lease)</td>
                          </tr>
                        )}

                        {(selectedOwnerFilter === 'ALL' || selectedOwnerFilter === 'UIH') && (
                          <tr>
                            <td className="py-2.5 pl-2 font-mono font-bold text-slate-900 dark:text-white">#03</td>
                            <td className="py-2.5">
                              <div className="flex items-center gap-2">
                                <span className="w-3.5 h-3.5 rounded bg-emerald-500 border border-slate-300 dark:border-white/20" />
                                <span className="font-bold text-slate-800 dark:text-slate-200">Tube 1 (Blue) &bull; Core 3 Green</span>
                              </div>
                            </td>
                            <td className="py-2.5">
                              <span className="px-2 py-0.5 rounded text-[11px] font-black bg-blue-100 text-blue-800 border border-blue-300 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800">UIH</span>
                            </td>
                            <td className="py-2.5">
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-400">RESERVED</span>
                            </td>
                            <td className="py-2.5"><span className="text-slate-500 font-bold text-[10px]">LOW</span></td>
                            <td className="py-2.5 font-mono text-[11px] text-slate-700 dark:text-slate-300">UIH Phase 2 Expansion Booking</td>
                          </tr>
                        )}

                        {selectedOwnerFilter === 'ALL' && (
                          <tr>
                            <td className="py-2.5 pl-2 font-mono font-bold text-slate-900 dark:text-white">#04</td>
                            <td className="py-2.5">
                              <div className="flex items-center gap-2">
                                <span className="w-3.5 h-3.5 rounded bg-amber-800 border border-slate-300 dark:border-white/20" />
                                <span className="font-bold text-slate-800 dark:text-slate-200">Tube 1 (Blue) &bull; Core 4 Brown</span>
                              </div>
                            </td>
                            <td className="py-2.5"><span className="text-slate-400 font-bold">None</span></td>
                            <td className="py-2.5">
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-400">BAD / CUT</span>
                            </td>
                            <td className="py-2.5"><span className="text-slate-400">-</span></td>
                            <td className="py-2.5 text-rose-600 dark:text-rose-400 text-[11px]">OTDR Fault: High Reflection @ 450m</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ---------------- SLIDE 5: SPLICE MATRIX & TRAYS ---------------- */}
            {activeSlide === 5 && (
              <div className="space-y-6">
                <div className={`p-6 rounded-2xl border ${
                  themeMode === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
                }`}>
                  <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-200 dark:border-slate-800">
                    <div>
                      <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <GitMerge className="text-purple-600 dark:text-purple-400" size={18} />
                        หน้าจอจริง: Enclosure Splice Matrix & Tray Management (ผังสไปลซ์และถาด)
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        แสดงการเชื่อมต่อระหว่าง Route In และ Route Out พร้อมถาดสไปลซ์ (Tray) และการคำนวณ dB Loss
                      </p>
                    </div>
                    <span className="text-xs font-black px-2.5 py-1 rounded bg-purple-100 text-purple-800 dark:bg-purple-500/20 dark:text-purple-300">
                      ENC-02 ASOKE HUB
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative">
                    {/* Cable In */}
                    <div className={`p-4 rounded-xl border ${
                      themeMode === 'light' ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
                    }`}>
                      <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-200 dark:border-slate-800">
                        <span className="text-xs font-black text-sky-600 dark:text-sky-400">สายฝั่งเข้า: RT-SUKHUMVIT-24F</span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-400">Tube 1 (Blue)</span>
                      </div>

                      <div className="space-y-2">
                        <div className={`p-2.5 rounded-lg border flex items-center justify-between text-xs ${
                          themeMode === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
                        }`}>
                          <div className="flex items-center gap-2">
                            <span className="w-3.5 h-3.5 rounded bg-blue-500" />
                            <span className="font-bold text-slate-900 dark:text-white">#01 Blue</span>
                          </div>
                          <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                            Spliced (0.02 dB) &rarr;
                          </span>
                        </div>

                        <div className={`p-2.5 rounded-lg border flex items-center justify-between text-xs ${
                          themeMode === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
                        }`}>
                          <div className="flex items-center gap-2">
                            <span className="w-3.5 h-3.5 rounded bg-orange-500" />
                            <span className="font-bold text-slate-900 dark:text-white">#02 Orange</span>
                          </div>
                          <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                            Spliced (0.01 dB) &rarr;
                          </span>
                        </div>

                        <div className={`p-2.5 rounded-lg border flex items-center justify-between text-xs ${
                          themeMode === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
                        }`}>
                          <div className="flex items-center gap-2">
                            <span className="w-3.5 h-3.5 rounded bg-emerald-500" />
                            <span className="font-bold text-slate-900 dark:text-white">#03 Green</span>
                          </div>
                          <span className="text-[11px] text-slate-400 font-bold">Unconnected</span>
                        </div>
                      </div>
                    </div>

                    {/* Cable Out */}
                    <div className={`p-4 rounded-xl border ${
                      themeMode === 'light' ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
                    }`}>
                      <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-200 dark:border-slate-800">
                        <span className="text-xs font-black text-purple-600 dark:text-purple-400">สายฝั่งออก: RT-RAMA9-48F</span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-100 text-purple-800 dark:bg-purple-500/20 dark:text-purple-400">Tube 1 (Blue)</span>
                      </div>

                      <div className="space-y-2">
                        <div className={`p-2.5 rounded-lg border flex items-center justify-between text-xs ${
                          themeMode === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
                        }`}>
                          <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                            &larr; Spliced (Tray 1)
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 dark:text-white">#01 Blue</span>
                            <span className="w-3.5 h-3.5 rounded bg-blue-500" />
                          </div>
                        </div>

                        <div className={`p-2.5 rounded-lg border flex items-center justify-between text-xs ${
                          themeMode === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
                        }`}>
                          <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                            &larr; Spliced (Tray 1)
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 dark:text-white">#02 Orange</span>
                            <span className="w-3.5 h-3.5 rounded bg-orange-500" />
                          </div>
                        </div>

                        <div className={`p-2.5 rounded-lg border flex items-center justify-between text-xs ${
                          themeMode === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
                        }`}>
                          <span className="text-[11px] text-slate-400 font-bold">ว่าง (Available)</span>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 dark:text-white">#03 Green</span>
                            <span className="w-3.5 h-3.5 rounded bg-emerald-500" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ---------------- SLIDE 6: MASTER SETTINGS & AUDIT ---------------- */}
            {activeSlide === 6 && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Master Devices */}
                  <div className={`p-5 rounded-2xl border ${
                    themeMode === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
                  }`}>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                      <SettingsIcon size={16} className="text-sky-600 dark:text-sky-400" />
                      คลังแม่แบบอุปกรณ์จริง (Hardware Templates)
                    </h3>
                    <div className="space-y-2.5">
                      <div className={`p-3 rounded-xl border flex items-center justify-between text-xs ${
                        themeMode === 'light' ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
                      }`}>
                        <div>
                          <span className="font-bold text-slate-900 dark:text-white block">Joint Closure (Dome / In-line)</span>
                          <span className="text-slate-500">กล่องต่อกันน้ำสำหรับติดตั้งบนเสาและบ่อพัก Manhole</span>
                        </div>
                        <span className="text-xs font-bold px-2 py-1 bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-400 rounded-lg">Cap: 96 Cores</span>
                      </div>

                      <div className={`p-3 rounded-xl border flex items-center justify-between text-xs ${
                        themeMode === 'light' ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
                      }`}>
                        <div>
                          <span className="font-bold text-slate-900 dark:text-white block">ODF (Optical Distribution Frame)</span>
                          <span className="text-slate-500">ตู้กระจายสายหลักในห้องชุมสาย POP และ Data Center</span>
                        </div>
                        <span className="text-xs font-bold px-2 py-1 bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-400 rounded-lg">Cap: 288 Cores</span>
                      </div>

                      <div className={`p-3 rounded-xl border flex items-center justify-between text-xs ${
                        themeMode === 'light' ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
                      }`}>
                        <div>
                          <span className="font-bold text-slate-900 dark:text-white block">FDB (Fiber Distribution Box)</span>
                          <span className="text-slate-500">กล่องกระจายสายหน้าอาคารและจุดเชื่อมต่อผู้ใช้บริการ</span>
                        </div>
                        <span className="text-xs font-bold px-2 py-1 bg-purple-100 text-purple-800 dark:bg-purple-500/20 dark:text-purple-400 rounded-lg">Cap: 24 Cores</span>
                      </div>
                    </div>
                  </div>

                  {/* Audit Log Trail */}
                  <div className={`p-5 rounded-2xl border ${
                    themeMode === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
                  }`}>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                      <Activity size={16} className="text-rose-600 dark:text-rose-400" />
                      บันทึกกิจกรรมและประวัติการทำงานย้อนหลัง (Audit Logs)
                    </h3>
                    <div className="space-y-2 text-xs">
                      <div className={`p-3 rounded-xl border ${
                        themeMode === 'light' ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
                      }`}>
                        <div className="flex items-center justify-between text-slate-500 mb-1">
                          <span className="text-rose-600 dark:text-rose-400 font-bold uppercase text-[10px]">SPLICE_TUBES_BULK</span>
                          <span className="text-[11px]">วันนี้ 15:42</span>
                        </div>
                        <p className="text-slate-800 dark:text-slate-200">somchai.itel ต่อสาย Tube 1 บน RT-SUKHUMVIT เข้า RT-RAMA9</p>
                      </div>

                      <div className={`p-3 rounded-xl border ${
                        themeMode === 'light' ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
                      }`}>
                        <div className="flex items-center justify-between text-slate-500 mb-1">
                          <span className="text-sky-600 dark:text-sky-400 font-bold uppercase text-[10px]">UPDATE_CORE_OWNER</span>
                          <span className="text-[11px]">วันนี้ 14:18</span>
                        </div>
                        <p className="text-slate-800 dark:text-slate-200">vpunpum อนุมัติคอร์ #01 ให้สิทธิ์ ITEL ใช้งาน (CKT-ITEL-0982)</p>
                      </div>

                      <div className={`p-3 rounded-xl border ${
                        themeMode === 'light' ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
                      }`}>
                        <div className="flex items-center justify-between text-slate-500 mb-1">
                          <span className="text-emerald-600 dark:text-emerald-400 font-bold uppercase text-[10px]">CREATE_ROUTE_GIS</span>
                          <span className="text-[11px]">วันนี้ 11:05</span>
                        </div>
                        <p className="text-slate-800 dark:text-slate-200">somchai.itel วาดแนวสาย 24F ระยะทาง 1.85 km</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Slide Navigation Footer */}
            <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <button
                disabled={activeSlide === 0}
                onClick={() => setActiveSlide(prev => Math.max(0, prev - 1))}
                className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all border ${
                  themeMode === 'light'
                    ? 'bg-slate-100 hover:bg-slate-200 disabled:opacity-30 border-slate-200 text-slate-700'
                    : 'bg-slate-800 hover:bg-slate-700 disabled:opacity-30 border-slate-700 text-white'
                }`}
              >
                <ChevronLeft size={15} /> สไลด์ก่อนหน้า
              </button>

              {/* Dot Indicators */}
              <div className="flex items-center gap-1.5">
                {slides.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setActiveSlide(idx)}
                    className={`h-2 rounded-full transition-all ${
                      activeSlide === idx 
                        ? 'bg-sky-600 w-6' 
                        : themeMode === 'light' ? 'bg-slate-300 hover:bg-slate-400 w-2' : 'bg-slate-700 hover:bg-slate-500 w-2'
                    }`}
                  />
                ))}
              </div>

              <button
                disabled={activeSlide === slides.length - 1}
                onClick={() => setActiveSlide(prev => Math.min(slides.length - 1, prev + 1))}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-500 disabled:opacity-30 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-sky-600/20 transition-all"
              >
                สไลด์ถัดไป <ChevronRight size={15} />
              </button>
            </div>

          </div>
        </div>
      )}

      {/* =========================================================================
          VIEW MODE 2: FULL DETAILED DOCUMENTATION MANUAL (เอกสารคู่มือพร้อมรายละเอียดเชิงลึก)
      ========================================================================= */}
      {viewMode === 'document' && (
        <main className="max-w-5xl mx-auto px-6 py-8 print:p-0 print:max-w-full">
          {/* Header Card */}
          <section className={`p-8 rounded-3xl border mb-8 shadow-sm ${
            themeMode === 'light' ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
          }`}>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-400 mb-3">
              <Sparkles size={14} /> เอกสารข้อกำหนดและคู่มือระบบฉบับทางการ (Official System Manual)
            </div>

            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-white font-display mb-2">
              คู่มือและสเปกระบบบริหารจัดการฐานข้อมูลโครงข่ายใยแก้วนำแสงร่วม (Fiber Sharing Database)
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-6">
              เอกสารอธิบายโครงสร้างระบบ สิทธิ์การใช้งาน กระบวนการวาดแผนที่ GIS การบริหารคอร์ไฟเบอร์ และการสไปลซ์สายในระดับปฏิบัติการ
            </p>

            <div className={`grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-2xl border ${
              themeMode === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
            }`}>
              <div>
                <span className="text-[10px] font-bold text-slate-500 uppercase block">แพลตฟอร์ม</span>
                <span className="text-xs font-bold text-slate-900 dark:text-white">React + Cloud Firestore</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-500 uppercase block">พันธมิตรผู้ใช้งาน</span>
                <span className="text-xs font-bold text-sky-600 dark:text-sky-400">ITEL &bull; SYMC &bull; UIH</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-500 uppercase block">ระดับสิทธิ์ (RBAC)</span>
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">4 บทบาท (Email Approval)</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-500 uppercase block">มาตรฐานสี</span>
                <span className="text-xs font-bold text-slate-900 dark:text-white">TIA/EIA-598 (12 Cores)</span>
              </div>
            </div>
          </section>

          {/* Detailed Content Modules */}
          <div className="space-y-8">
            
            {/* Section 1 */}
            <section className={`p-6 rounded-2xl border ${
              themeMode === 'light' ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
            }`}>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-3">
                <ShieldCheck className="text-sky-600 dark:text-sky-400" size={18} />
                1. การบริหารจัดการผู้ใช้งานและสิทธิ์การเข้าถึง (User Management & RBAC)
              </h2>
              <div className="space-y-3 text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                <p>
                  ระบบออกแบบให้รองรับการทำงานร่วมกันระหว่างผู้ให้บริการ 3 ราย โดยแบ่งระดับสิทธิ์ออกเป็น 4 ระดับ:
                </p>
                <ul className="list-disc pl-5 space-y-1.5">
                  <li><strong>Admin:</strong> มีอำนาจสูงสุดในการอนุมัติผู้ใช้ จัดการสิทธิ์ สร้างและลบโครงการ</li>
                  <li><strong>Design:</strong> วิศวกรออกแบบโครงข่าย มีสิทธิ์สร้าง Project และกำหนดเลือกว่า Operator ไหนสามารถเข้าดูข้อมูลได้ วาดเส้นทางเคเบิล ปักหมุดกล่อง และทำการสไปลซ์สาย</li>
                  <li><strong>Viewer:</strong> เจ้าหน้าที่มอนิเตอร์และตรวจสอบ สามารถค้นหาเส้นทาง ตรวจสอบ Circuit ID และพิมพ์เอกสาร</li>
                  <li><strong>Sub-contract:</strong> ผู้รับเหมาภาคสนาม มีสิทธิ์เข้าถึงเฉพาะข้อมูลและโครงการที่ได้รับมอบหมาย</li>
                </ul>
              </div>
            </section>

            {/* Section 2 */}
            <section className={`p-6 rounded-2xl border ${
              themeMode === 'light' ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
            }`}>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-3">
                <MapPin className="text-purple-600 dark:text-purple-400" size={18} />
                2. แผนที่ภูมิสารสนเทศและการวาดเส้นทาง (Interactive GIS Mapping)
              </h2>
              <div className="space-y-3 text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                <p>
                  รองรับการแสดงผลทั้งแบบ OpenStreetMap แผนที่ดาวเทียม และโหมดมืด โดยมีคุณสมบัติสำคัญดังนี้:
                </p>
                <ul className="list-disc pl-5 space-y-1.5">
                  <li><strong>Route Snapping:</strong> ดึงเส้นทางสายเคเบิลให้ทาบไปตามแนวถนนจริงโดยอัตโนมัติ</li>
                  <li><strong>Enclosure Placement:</strong> ปักหมุดกล่องรอยต่อ บ่อพัก Manhole และระบุพิกัด GPS แม่นยำ</li>
                  <li><strong>Slack Loops:</strong> บันทึกตำแหน่งและระยะความยาวของสายสำรองที่ขดไว้หน้างาน</li>
                  <li><strong>Distance Calculation:</strong> คำนวณระยะทางรวมของเคเบิลพร้อมแสดงความยาวแยกตามประเภทสาย</li>
                </ul>
              </div>
            </section>

            {/* Section 3 */}
            <section className={`p-6 rounded-2xl border ${
              themeMode === 'light' ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
            }`}>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-3">
                <GitMerge className="text-emerald-600 dark:text-emerald-400" size={18} />
                3. การบริหารคอร์ไฟเบอร์และผังสไปลซ์ (Core Allocation & Splice Matrix)
              </h2>
              <div className="space-y-3 text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                <p>
                  ใช้มาตรฐานรหัสสี TIA/EIA-598 (Blue, Orange, Green, Brown, Slate, White, Red, Black, Yellow, Violet, Rose, Aqua):
                </p>
                <ul className="list-disc pl-5 space-y-1.5">
                  <li><strong>Click-to-Splice:</strong> คลิกเลือกคอร์ต้นทางและคอร์ปลายทางเพื่อเชื่อมต่อทันที</li>
                  <li><strong>Bulk 12F Splice:</strong> ต่อสายแบบยกหลอด 12 คอร์ในคลิกเดียว เพิ่มความเร็วในการทำงาน</li>
                  <li><strong>Tray Assignment:</strong> จัดระเบียบการสไปลซ์ลงในถาด Splice Trays เพื่อความสะดวกในการซ่อมบำรุง</li>
                  <li><strong>Circuit & Owner Tracking:</strong> กำหนด Circuit ID, ลูกค้าปลายทาง และบันทึกประวัติการปรับปรุง</li>
                </ul>
              </div>
            </section>

          </div>

          {/* Printable Footer */}
          <footer className="mt-10 pt-6 border-t border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500">
            <p className="font-bold text-slate-700 dark:text-slate-300">FIBER SHARING DATABASE PLATFORM &bull; SYSTEM MANUAL 2026</p>
            <p className="mt-1">Developed for Joint Multi-Tenant Fiber Infrastructure Operations.</p>
          </footer>
        </main>
      )}

    </div>
  );
}

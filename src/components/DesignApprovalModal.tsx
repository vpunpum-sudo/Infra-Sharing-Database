import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Project, User as AppUser, CoreOwner, DesignApproval, 
  OwnerSignOff, ProjectStatus, Route, FiberEnclosure, 
  FiberLoop, EnclosureType, FiberType, ApprovalStage, FiberColorConfig 
} from '../types';
import { doc, setDoc, collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { logActivity } from '../services/logService';
import { 
  FileText, CheckCircle2, XCircle, Clock, ShieldCheck, 
  Send, PenTool, X, Download, AlertTriangle, 
  Layers, Box, Cable, MapPin, Check, ChevronRight, 
  RotateCcw, Sparkles, Network, Compass, ShieldAlert,
  HelpCircle, ChevronDown, ChevronUp, Loader2, Share2,
  Cpu, Radio, Eye, Map as MapIcon, GitCommit, Maximize2,
  ChevronLeft, Users, Building, ArrowRight, Lock, CheckCheck,
  Presentation, FileCheck, Info, FileSpreadsheet, Navigation
} from 'lucide-react';
import { OwnerLogo } from './OwnerLogo';
import { getEffectiveOwnerLogo, getEffectiveOwnerZoom } from '../services/ownerLogosService';
import { motion, AnimatePresence } from 'motion/react';
import { MapContainer, TileLayer, Polyline, CircleMarker, Marker, Popup, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';

interface DesignApprovalModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project;
  appUser: AppUser | null;
  routes?: Route[];
  enclosures?: FiberEnclosure[];
  onProjectUpdated?: (updatedProject: Project) => void;
}

// Leaflet Auto-Fit Bounds Component
function MapAutoFitBounds({ enclosures, routes }: { enclosures: FiberEnclosure[]; routes: Route[] }) {
  const map = useMap();
  useEffect(() => {
    const latlngs: [number, number][] = [];
    enclosures.forEach(e => {
      if (e.position && e.position.lat && e.position.lng) {
        latlngs.push([e.position.lat, e.position.lng]);
      }
    });
    routes.forEach(r => {
      r.path?.forEach(p => {
        if (p.lat && p.lng) {
          latlngs.push([p.lat, p.lng]);
        }
      });
    });
    if (latlngs.length > 0) {
      const bounds = L.latLngBounds(latlngs);
      map.fitBounds(bounds, { padding: [35, 35], maxZoom: 16 });
    }
  }, [enclosures, routes, map]);
  return null;
}

// Standard 12-Fiber Color Code
const FIBER_COLOR_STANDARDS = [
  { no: 1, name: 'Blue (น้ำเงิน)', hex: '#2563eb', bgClass: 'bg-blue-600', textClass: 'text-white' },
  { no: 2, name: 'Orange (ส้ม)', hex: '#ea580c', bgClass: 'bg-orange-500', textClass: 'text-white' },
  { no: 3, name: 'Green (เขียว)', hex: '#16a34a', bgClass: 'bg-green-600', textClass: 'text-white' },
  { no: 4, name: 'Brown (น้ำตาล)', hex: '#92400e', bgClass: 'bg-amber-800', textClass: 'text-white' },
  { no: 5, name: 'Slate (เทา)', hex: '#64748b', bgClass: 'bg-slate-500', textClass: 'text-white' },
  { no: 6, name: 'White (ขาว)', hex: '#f8fafc', bgClass: 'bg-slate-100', textClass: 'text-slate-900 border border-slate-300' },
  { no: 7, name: 'Red (แดง)', hex: '#dc2626', bgClass: 'bg-red-600', textClass: 'text-white' },
  { no: 8, name: 'Black (ดำ)', hex: '#0f172a', bgClass: 'bg-slate-900', textClass: 'text-white border border-slate-700' },
  { no: 9, name: 'Yellow (เหลือง)', hex: '#eab308', bgClass: 'bg-yellow-400', textClass: 'text-slate-900' },
  { no: 10, name: 'Violet (ม่วง)', hex: '#9333ea', bgClass: 'bg-purple-600', textClass: 'text-white' },
  { no: 11, name: 'Rose (ชมพู)', hex: '#f43f5e', bgClass: 'bg-pink-500', textClass: 'text-white' },
  { no: 12, name: 'Aqua (ฟ้าทะเล)', hex: '#06b6d4', bgClass: 'bg-cyan-500', textClass: 'text-white' }
];

export function DesignApprovalModal({
  isOpen,
  onClose,
  project,
  appUser,
  routes: propRoutes = [],
  enclosures: propEnclosures = [],
  onProjectUpdated
}: DesignApprovalModalProps) {
  // Modal View State: 'slides' | 'document' | 'request'
  const [viewMode, setViewMode] = useState<'slides' | 'document' | 'request'>('slides');
  const [currentSlide, setCurrentSlide] = useState(1);
  const totalSlides = 6;

  // Signing dialog states
  const [signingModalOpen, setSigningModalOpen] = useState(false);
  const [signingTarget, setSigningTarget] = useState<{ owner: CoreOwner; level: 'Planning' | 'OM' } | null>(null);
  const [signerName, setSignerName] = useState(appUser?.displayName || appUser?.email?.split('@')[0] || '');
  const [signerPosition, setSignerPosition] = useState('');
  const [signerComment, setSignerComment] = useState('Approved design layout according to fiber infra sharing specifications.');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [exportSuccess, setExportSuccess] = useState(false);

  // Loaded subcollections from Firestore
  const [loadedRoutes, setLoadedRoutes] = useState<Route[]>(propRoutes);
  const [loadedEnclosures, setLoadedEnclosures] = useState<FiberEnclosure[]>(propEnclosures);
  const [loadedLoops, setLoadedLoops] = useState<FiberLoop[]>([]);
  const [enclosureTypes, setEnclosureTypes] = useState<EnclosureType[]>([]);
  const [fiberTypes, setFiberTypes] = useState<FiberType[]>([]);
  const [fiberColorConfigs, setFiberColorConfigs] = useState<FiberColorConfig[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);

  // Request form state
  const [requestNotes, setRequestNotes] = useState('');
  const [mapLabelMode, setMapLabelMode] = useState<'all' | 'hover' | 'code'>('hover');
  const [contractorInput, setContractorInput] = useState('United Telecommunication Services Co., Ltd.');
  const [operationKmInput, setOperationKmInput] = useState('1.50');
  const [targetInstallDate, setTargetInstallDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().split('T')[0];
  });

  // Signature Canvas
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

  // Auto-subscribe to real project subcollections
  useEffect(() => {
    if (!isOpen || !project?.id) return;
    setIsLoadingData(true);

    const routesPath = `projects/${project.id}/routes`;
    const enclosuresPath = `projects/${project.id}/enclosures`;
    const loopsPath = `projects/${project.id}/loops`;

    const unsubRoutes = onSnapshot(collection(db, routesPath), (snapshot) => {
      const data = snapshot.docs.map(doc => doc.data() as Route);
      setLoadedRoutes(data);
      setIsLoadingData(false);
    }, (err) => {
      console.warn("Could not load routes for approval:", err);
      setIsLoadingData(false);
    });

    const unsubEnclosures = onSnapshot(collection(db, enclosuresPath), (snapshot) => {
      const data = snapshot.docs.map(doc => doc.data() as FiberEnclosure);
      setLoadedEnclosures(data);
    }, (err) => {
      console.warn("Could not load enclosures for approval:", err);
    });

    const unsubLoops = onSnapshot(collection(db, loopsPath), (snapshot) => {
      const data = snapshot.docs.map(doc => doc.data() as FiberLoop);
      setLoadedLoops(data);
    }, (err) => {
      console.warn("Could not load loops for approval:", err);
    });

    const unsubTypes = onSnapshot(collection(db, 'enclosureTypes'), (snapshot) => {
      setEnclosureTypes(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as EnclosureType)));
    });

    const unsubFiberTypes = onSnapshot(collection(db, 'fiberTypes'), (snapshot) => {
      setFiberTypes(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as FiberType)));
    });

    const unsubConfigs = onSnapshot(collection(db, 'fiberColorConfigs'), (snapshot) => {
      setFiberColorConfigs(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as FiberColorConfig)));
    });

    return () => {
      unsubRoutes();
      unsubEnclosures();
      unsubLoops();
      unsubTypes();
      unsubFiberTypes();
      unsubConfigs();
    };
  }, [isOpen, project?.id]);

  const effectiveRoutes = loadedRoutes.length > 0 ? loadedRoutes : propRoutes;
  const effectiveEnclosures = loadedEnclosures.length > 0 ? loadedEnclosures : propEnclosures;
  const effectiveLoops = loadedLoops;

  // Participating / Authorized operators for this project (แสดงตาม authorized operators ที่กำหนดสิทธิ์ไว้ในโครงการ)
  const participatingOwners: CoreOwner[] = useMemo(() => {
    const list: CoreOwner[] = [];
    const addOwner = (o?: CoreOwner | string) => {
      if (!o || o === 'None') return;
      const norm = o.toUpperCase().trim() as CoreOwner;
      if (!list.includes(norm)) {
        list.push(norm);
      }
    };

    // Use project's configured Authorized Operators (project.owners or project.owner)
    if (project.owners && project.owners.length > 0) {
      project.owners.forEach(addOwner);
    } else if (project.owner && project.owner !== 'None') {
      addOwner(project.owner);
    }

    const orderMap: Record<string, number> = { 'ITEL': 1, 'SYMC': 2, 'UIH': 3 };

    if (list.length > 0) {
      return list.sort((a, b) => (orderMap[a] || 99) - (orderMap[b] || 99));
    }
    // Default fallback if no authorized operator was configured
    return ['ITEL', 'SYMC', 'UIH'];
  }, [project.owners, project.owner]);

  const designApproval = project.designApproval;

  // Derive approval stage and overall status
  const currentStage: ApprovalStage = designApproval?.approvalStage || (
    project.status === 'Approved' ? 'Completed' :
    project.status === 'Pending Approval' ? 'Planning' : 'Planning'
  );

  const planningSignOffs = designApproval?.planningSignOffs || {};
  const omSignOffs = designApproval?.omSignOffs || {};

  // Check Planning completion
  const isPlanningComplete = useMemo(() => {
    if (participatingOwners.length === 0) return false;
    return participatingOwners.every(owner => planningSignOffs[owner]?.status === 'Approved');
  }, [participatingOwners, planningSignOffs]);

  // Check OM completion
  const isOMComplete = useMemo(() => {
    if (participatingOwners.length === 0) return false;
    return participatingOwners.every(owner => omSignOffs[owner]?.status === 'Approved');
  }, [participatingOwners, omSignOffs]);

  // Check if any rejected
  const isRejected = useMemo(() => {
    const pRej = participatingOwners.some(o => planningSignOffs[o]?.status === 'Rejected');
    const mRej = participatingOwners.some(o => omSignOffs[o]?.status === 'Rejected');
    return pRej || mRej || project.status === 'Rejected';
  }, [participatingOwners, planningSignOffs, omSignOffs, project.status]);

  // Dynamically compute the Tier level and label based on participating operators count or explicit route tier
  const projectTierName = useMemo(() => {
    // Priority 1: Number of participating operators determines the Tier level:
    // 3 operators (ITEL, SYMC, UIH) -> Tier 1
    // 2 operators (e.g. UIH + SYMC) -> Tier 2
    // 1 operator -> Tier 3
    if (participatingOwners.length >= 3) return 'Tier 1';
    if (participatingOwners.length === 2) return 'Tier 2';
    if (participatingOwners.length === 1) return 'Tier 3';

    // Fallback if participatingOwners is empty
    const routeTiers = effectiveRoutes.map(r => r.tierSharing || r.tier).filter(Boolean);
    if (routeTiers.includes('Tier 1')) return 'Tier 1';
    if (routeTiers.includes('Tier 2')) return 'Tier 2';
    if (routeTiers.includes('Tier 3')) return 'Tier 3';

    return 'Tier 1';
  }, [effectiveRoutes, participatingOwners]);

  const projectTierLabel = useMemo(() => {
    return `${projectTierName} (${participatingOwners.join(' + ')})`;
  }, [projectTierName, participatingOwners]);

  const projectTierCompactLabel = useMemo(() => {
    return `${projectTierName} (${participatingOwners.join('+')})`;
  }, [projectTierName, participatingOwners]);

  // Helper to get enclosure type exactly like in FiberMap.tsx
  function getEnclosureType(enclosure: FiberEnclosure) {
    if (enclosure.enclosureTypeId) {
      return enclosureTypes.find(et => et.id === enclosure.enclosureTypeId);
    }
    return enclosureTypes.find(et => et.name?.toLowerCase() === enclosure.locationType?.toLowerCase());
  }

  function getEnclosureColor(enclosure: FiberEnclosure) {
    const t = getEnclosureType(enclosure);
    return t ? t.color : '#ef4444';
  }

  // Group co-located or nearby enclosures into clean non-overlapping location cards
  const locationGroupedPlacements = useMemo(() => {
    if (!effectiveEnclosures || effectiveEnclosures.length === 0) return [];

    // Cluster threshold: ~0.0012 lat/lng (~80-100 meters)
    const threshold = 0.0012;
    const groups: Array<{
      id: string;
      centerLat: number;
      centerLng: number;
      enclosures: FiberEnclosure[];
      latStr: string;
      lngStr: string;
      iconUrl?: string;
      encColor: string;
    }> = [];

    // Sort enclosures North to South
    const sorted = [...effectiveEnclosures].sort((a, b) => (b.position?.lat || 0) - (a.position?.lat || 0));

    sorted.forEach((e) => {
      if (!e.position) return;

      // Find existing group within proximity threshold
      const existing = groups.find((g) => {
        const dLat = Math.abs(g.centerLat - e.position.lat);
        const dLng = Math.abs(g.centerLng - e.position.lng);
        return dLat < threshold && dLng < threshold;
      });

      if (existing) {
        existing.enclosures.push(e);
      } else {
        const encType = getEnclosureType(e);
        groups.push({
          id: `group-${e.id || groups.length}`,
          centerLat: e.position.lat,
          centerLng: e.position.lng,
          enclosures: [e],
          latStr: e.position.lat.toFixed(6),
          lngStr: e.position.lng.toFixed(6),
          iconUrl: encType?.icon,
          encColor: encType?.color || '#3b82f6'
        });
      }
    });

    // Assign staggered alternate directions for location cards along route
    return groups.map((g, idx) => {
      const direction: 'right' | 'left' = idx % 2 === 0 ? 'right' : 'left';
      const offset: [number, number] = direction === 'right' ? [14, -2] : [-14, -2];

      return {
        ...g,
        direction,
        offset
      };
    });
  }, [effectiveEnclosures, enclosureTypes]);

  const getRouteColor = (route: Route) => {
    const fiberType = route.fiberType || route.capacity.toString();
    const tier = route.tierSharing || route.tier || 'Tier 1';
    
    // Find matching color config
    const ft = fiberTypes.find(f => f.name === fiberType);
    if (ft) {
      const config = fiberColorConfigs.find(c => c.fiberTypeId === ft.id && c.tier === tier);
      if (config) return config.color;
      if (ft.color) return ft.color;
    }
    
    if (route.tierSharing === 'Tier 1' || route.tier === 'Tier 1') return '#3b82f6';
    if (route.tierSharing === 'Tier 2' || route.tier === 'Tier 2' || route.tier?.includes('T2')) return '#dc2626';
    return '#10b981';
  };

  // Sort enclosures geographically along the corridor based on actual map coordinates
  const sldEnclosures = useMemo(() => {
    if (effectiveEnclosures.length === 0) {
      return [
        { id: 'bj1', name: 'BJ#01 สภากาชาดไทย', position: { lat: 13.7315, lng: 100.5332 }, locationType: 'PB#' },
        { id: 'bj2', name: 'BJ#02 สำนักงานบรรเทาทุกข์', position: { lat: 13.7328, lng: 100.5335 }, locationType: 'PB#' },
        { id: 'bj3', name: 'BJ#03 สถานเสาวภา', position: { lat: 13.7342, lng: 100.5338 }, locationType: 'PB#' },
        { id: 'bj4', name: 'BJ#04 คณะวิศวกรรมศาสตร์ จุฬาฯ', position: { lat: 13.7368, lng: 100.5342 }, locationType: 'PB#' },
        { id: 'bj5', name: 'BJ#05 โรงเรียนสาธิต มศว', position: { lat: 13.7385, lng: 100.5345 }, locationType: 'PB#' },
        { id: 'bj6', name: 'BJ#06 อาคารสมเด็จพระเทพฯ', position: { lat: 13.7402, lng: 100.5348 }, locationType: 'PB#' },
        { id: 'bj7', name: 'BJ#07 วิทยาลัยพยาบาลตำรวจ', position: { lat: 13.7420, lng: 100.5350 }, locationType: 'PB#' },
        { id: 'bj8', name: 'BJ#08 สำนักงานพิสูจน์หลักฐาน', position: { lat: 13.7445, lng: 100.5353 }, locationType: 'Riser#' },
      ];
    }
    
    // Sort along linear path vector
    const sorted = [...effectiveEnclosures].sort((a, b) => {
      const latDiff = a.position.lat - b.position.lat;
      const lngDiff = a.position.lng - b.position.lng;
      if (Math.abs(latDiff) > Math.abs(lngDiff)) {
        return a.position.lat - b.position.lat;
      }
      return a.position.lng - b.position.lng;
    });

    return sorted;
  }, [effectiveEnclosures]);

  const formatTrayRanges = (trays: number[]) => {
    if (!trays || trays.length === 0) return '-';
    const sorted = [...trays].sort((a, b) => a - b);
    const ranges: string[] = [];
    let start = sorted[0];
    let prev = sorted[0];

    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] === prev + 1) {
        prev = sorted[i];
      } else {
        ranges.push(start === prev ? `${start}` : `${start}-${prev}`);
        start = sorted[i];
        prev = sorted[i];
      }
    }
    ranges.push(start === prev ? `${start}` : `${start}-${prev}`);
    return ranges.join(', ');
  };

  // Extract corridor road name and dynamic landmarks based on real project data
  const corridorRoadName = useMemo(() => {
    const projName = project.name || '';
    if (projName.includes('อังรีดูนังต์')) return 'ถนนอังรีดูนังต์';
    if (projName.includes('วิทยุ')) return 'ถนนวิทยุ';
    if (projName.includes('สุขุมวิท')) return 'ถนนสุขุมวิท';
    if (projName.includes('เพชรบุรี')) return 'ถนนเพชรบุรี';
    if (projName.includes('พระราม')) return 'ถนนพระราม';
    if (projName.includes('พหลโยธิน')) return 'ถนนพหลโยธิน';
    return projName.split(' ')[0] || 'แนวเส้นทางโครงข่ายเคเบิล';
  }, [project.name]);

  // Derive Landmark Chips from actual enclosure names / locations along the corridor
  const dynamicLandmarks = useMemo(() => {
    if (sldEnclosures.length === 0) {
      return ['จุดเริ่มต้นโครงการ', 'จุดเชื่อมต่อกึ่งกลาง', 'จุดแยกสาย', 'จุดสิ้นสุดโครงการ'];
    }

    const first = sldEnclosures[0]?.name.replace(/BJ#\d+\/?\d*\s*/, '') || 'จุดเริ่มต้น';
    const quarter = sldEnclosures[Math.floor(sldEnclosures.length * 0.33)]?.name.replace(/BJ#\d+\/?\d*\s*/, '') || 'จุดเชื่อมต่อที่ 1';
    const threeQuarter = sldEnclosures[Math.floor(sldEnclosures.length * 0.66)]?.name.replace(/BJ#\d+\/?\d*\s*/, '') || 'จุดเชื่อมต่อที่ 2';
    const last = sldEnclosures[sldEnclosures.length - 1]?.name.replace(/BJ#\d+\/?\d*\s*/, '') || 'จุดสิ้นสุด';

    return [first, quarter, threeQuarter, last];
  }, [sldEnclosures]);

  // Accurate Fiber Optic Route Schedule (Referenced directly to each Fiber Optic Line)
  const fiberRouteSchedule = useMemo(() => {
    if (effectiveRoutes.length === 0) {
      let defaultSymc = 0;
      let defaultUih = 0;
      let defaultItel = 0;
      if (participatingOwners.length === 1) {
        if (participatingOwners[0] === 'SYMC') defaultSymc = 144;
        else if (participatingOwners[0] === 'UIH') defaultUih = 144;
        else if (participatingOwners[0] === 'ITEL') defaultItel = 144;
      } else if (participatingOwners.length === 3) {
        defaultSymc = 48;
        defaultUih = 48;
        defaultItel = 48;
      } else if (participatingOwners.includes('SYMC') && participatingOwners.includes('UIH')) {
        defaultSymc = 72;
        defaultUih = 72;
      } else if (participatingOwners.includes('ITEL') && participatingOwners.includes('SYMC')) {
        defaultSymc = 72;
        defaultItel = 72;
      } else if (participatingOwners.includes('ITEL') && participatingOwners.includes('UIH')) {
        defaultUih = 72;
        defaultItel = 72;
      }

      return [{
        id: 't2_default',
        tier: projectTierCompactLabel,
        routeName: project.name || 'แนวสาย OFC 144 Core',
        capacity: 144,
        sectionName: `${sldEnclosures[0]?.name || 'BJ#01'} - ${sldEnclosures[sldEnclosures.length - 1]?.name || 'BJ#08'}`,
        distanceKm: '1.50',
        symcCores: defaultSymc,
        uihCores: defaultUih,
        itelCores: defaultItel,
        totalCores: 144
      }];
    }

    // Map each distinct shared fiber route into structured table rows
    return effectiveRoutes.map((route, idx) => {
      const cores = route.cores || [];
      const startEnc = effectiveEnclosures.find(e => e.id === route.startEnclosureId) || sldEnclosures[0];
      const endEnc = effectiveEnclosures.find(e => e.id === route.endEnclosureId) || sldEnclosures[sldEnclosures.length - 1];

      // Calculate realistic distance of this specific fiber line
      let distKm = '1.50';
      if (route.totalLength && route.totalLength > 0 && route.totalLength < 100000) {
        distKm = (route.totalLength / 1000).toFixed(2);
      } else if (route.markStart !== undefined && route.markEnd !== undefined && Math.abs(route.markEnd - route.markStart) > 0 && Math.abs(route.markEnd - route.markStart) < 100000) {
        distKm = (Math.abs(route.markEnd - route.markStart) / 1000).toFixed(2);
      } else if (route.path && route.path.length >= 2) {
        let distMeters = 0;
        for (let i = 0; i < route.path.length - 1; i++) {
          const p1 = L.latLng(route.path[i].lat, route.path[i].lng);
          const p2 = L.latLng(route.path[i + 1].lat, route.path[i + 1].lng);
          distMeters += p1.distanceTo(p2);
        }
        distKm = distMeters > 0 ? (distMeters / 1000).toFixed(2) : '1.50';
      } else if (startEnc?.position && endEnc?.position) {
        const p1 = L.latLng(startEnc.position.lat, startEnc.position.lng);
        const p2 = L.latLng(endEnc.position.lat, endEnc.position.lng);
        const distMeters = p1.distanceTo(p2);
        distKm = distMeters > 0 ? (distMeters / 1000).toFixed(2) : '1.50';
      }

      // Determine participating owners specific to THIS route line strictly from the route itself (no project fallback)
      const routeOwners: CoreOwner[] = (route.tierSharingPartners && route.tierSharingPartners.length > 0)
        ? route.tierSharingPartners
        : ((route.owners && route.owners.length > 0)
          ? route.owners
          : Array.from(new Set(cores.map(c => c.owner).filter(o => o && o !== 'None'))));

      // Derive route's Tier string strictly from route settings
      let routeTierName = route.tier || (routeOwners.length > 0 ? `Tier ${routeOwners.length >= 3 ? 1 : routeOwners.length}` : 'ยังไม่ได้กำหนด');
      
      const routeTierFormatted = route.tier && route.tier.includes('(')
        ? route.tier
        : (routeOwners.length > 0 ? `${routeTierName.replace(/Tier \d+/, r => r)} (${routeOwners.join('+')})` : 'ยังไม่ได้กำหนดสัดส่วน');

      // Capacity of this specific fiber line
      const capacity = route.capacity || 144;
      const capacityTag = `OFC ${capacity}C`;

      // Construct clean display name for this Fiber Optic Route
      let displayRouteName = route.name?.trim() || `${capacityTag} ${startEnc?.name || 'ต้นทาง'} - ${endEnc?.name || 'ปลายทาง'}`;
      if (!displayRouteName.startsWith('OFC') && !displayRouteName.includes(`${capacity}C`)) {
        displayRouteName = `${capacityTag} ${displayRouteName}`;
      }

      const displaySectionName = `${startEnc?.name || 'ต้นทาง'} - ${endEnc?.name || 'ปลายทาง'}`;

      // Count core allocations for this specific route line strictly from actual assigned cores in route.cores
      const symcCount = cores.filter(c => c.owner === 'SYMC').length;
      const uihCount = cores.filter(c => c.owner === 'UIH').length;
      const itelCount = cores.filter(c => c.owner === 'ITEL').length;

      const totalAllocated = symcCount + uihCount + itelCount;

      return {
        id: route.id || `route_${idx}`,
        tier: routeTierFormatted,
        routeName: displayRouteName,
        capacity: capacity,
        sectionName: displaySectionName,
        distanceKm: distKm,
        symcCores: symcCount,
        uihCores: uihCount,
        itelCores: itelCount,
        totalCores: totalAllocated
      };
    });
  }, [effectiveRoutes, effectiveEnclosures, sldEnclosures, project.name, participatingOwners, projectTierName, projectTierCompactLabel]);

  // Aggregate totals across all fiber optic routes
  const fiberRouteTotals = useMemo(() => {
    let totalDist = 0;
    let totalSYMC = 0;
    let totalUIH = 0;
    let totalITEL = 0;
    let totalAllCores = 0;

    fiberRouteSchedule.forEach(r => {
      totalDist += parseFloat(r.distanceKm) || 0;
      totalSYMC += r.symcCores || 0;
      totalUIH += r.uihCores || 0;
      totalITEL += r.itelCores || 0;
      totalAllCores += r.totalCores || 0;
    });

    return {
      distanceKm: totalDist > 0 ? totalDist.toFixed(2) : '1.50',
      symcCores: totalSYMC,
      uihCores: totalUIH,
      itelCores: totalITEL,
      totalCores: totalAllCores
    };
  }, [fiberRouteSchedule]);

  const primaryRoute = fiberRouteSchedule[0] || {
    tier: projectTierCompactLabel,
    routeName: project.name,
    capacity: 144,
    sectionName: `${sldEnclosures[0]?.name || 'BJ#01'} - ${sldEnclosures[sldEnclosures.length - 1]?.name || 'BJ#08'}`,
    distanceKm: '1.50',
    symcCores: 72,
    uihCores: 72,
    itelCores: 0,
    totalCores: 144
  };

  const totalLengthKm = fiberRouteTotals.distanceKm;

  // Canvas drawing listeners
  useEffect(() => {
    if (!signingModalOpen) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  }, [signingModalOpen]);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    setIsDrawing(true);
    const rect = canvas.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();
    setHasSignature(true);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  };

  // Open Signing Modal for specific Owner & Level
  const handleOpenSignModal = (owner: CoreOwner, level: 'Planning' | 'OM') => {
    setSigningTarget({ owner, level });
    const defaultPosition = level === 'Planning' ? 'Planning Engineer / Network Planner' : 'VP of Operation & Maintenance';
    setSignerPosition(defaultPosition);
    setSignerName(appUser?.displayName || appUser?.email?.split('@')[0] || '');
    setSignerComment(level === 'Planning' ? 'เห็นชอบแบบการติดตั้งและสัดส่วน Core ตามเกณฑ์วิศวกรรมโครงข่าย' : 'อนุมัติการดำเนินโครงการและอนุญาตให้เข้าติดตั้งตามแผนงาน');
    setSigningModalOpen(true);
  };

  // Check if current logged in user can sign for owner & level
  const canUserSign = (owner: CoreOwner, level: 'Planning' | 'OM') => {
    if (!appUser) return false;
    if (appUser.role === 'Admin') return true;

    if (appUser.owner && appUser.owner !== 'None' && appUser.owner !== owner) {
      return false;
    }

    if (level === 'Planning') {
      return appUser.role === 'Planning' || appUser.role === 'Design';
    } else {
      return appUser.role === 'Management';
    }
  };

  // Submit new request for design approval
  const handleSubmitApprovalRequest = async () => {
    if (!appUser) return;
    setIsSubmitting(true);
    setActionError(null);

    try {
      const docNumber = `APP-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-${project.name.replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toUpperCase() || 'PROJ'}`;
      
      const initialPlanningSignOffs: Record<string, OwnerSignOff> = {};
      const initialOMSignOffs: Record<string, OwnerSignOff> = {};

      participatingOwners.forEach(owner => {
        initialPlanningSignOffs[owner] = {
          owner,
          level: 'Planning',
          status: 'Pending'
        };
        initialOMSignOffs[owner] = {
          owner,
          level: 'OM',
          status: 'Pending'
        };
      });

      const newApproval: DesignApproval = {
        id: `appr_${Date.now()}`,
        documentNumber: docNumber,
        status: 'Pending Approval',
        approvalStage: 'Planning',
        requestedBy: appUser.displayName || appUser.email || 'Planning Engineer',
        requestedByEmail: appUser.email,
        requestedByUid: appUser.id,
        requestedAt: new Date().toISOString(),
        designNotes: requestNotes.trim() || 'ขออนุมัติแบบโครงการ Fiber Infra Sharing ตามสัดส่วน Core และ Enclosure',
        contractorName: contractorInput.trim() || 'United Telecommunication Services Co., Ltd.',
        totalOperationDistanceKm: parseFloat(totalLengthKm) || 1.5,
        estimatedInstallationDate: targetInstallDate,
        planningSignOffs: initialPlanningSignOffs,
        omSignOffs: initialOMSignOffs,
        ownerSignOffs: initialPlanningSignOffs
      };

      const updatedProject: Project = {
        ...project,
        status: 'Pending Approval',
        designApproval: newApproval
      };

      await setDoc(doc(db, `projects/${project.id}`), {
        status: 'Pending Approval',
        designApproval: newApproval
      }, { merge: true });

      await logActivity('request_design_approval', `Requested 2-level design approval for project ${project.name} (${docNumber})`, {
        projectId: project.id,
        documentNumber: docNumber,
        owners: participatingOwners,
        routesCount: effectiveRoutes.length,
        enclosuresCount: effectiveEnclosures.length
      });

      if (onProjectUpdated) {
        onProjectUpdated(updatedProject);
      }

      setViewMode('slides');
      setCurrentSlide(1);
    } catch (err: any) {
      console.error('Error requesting approval:', err);
      setActionError(err.message || 'Failed to submit approval request');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Sign & Approve for specific Owner & Level (Planning or OM)
  const handleConfirmSignature = async (isApproved: boolean) => {
    if (!signingTarget || !appUser || !project.designApproval) return;
    setIsSubmitting(true);
    setActionError(null);

    try {
      const canvas = canvasRef.current;
      const signatureUrl = canvas ? canvas.toDataURL('image/png') : '';
      const { owner, level } = signingTarget;

      const signOffData: OwnerSignOff = {
        owner,
        level,
        status: isApproved ? 'Approved' : 'Rejected',
        signedBy: signerName.trim() || appUser.displayName || appUser.email,
        signedByEmail: appUser.email,
        signedByUid: appUser.id,
        position: signerPosition.trim() || (level === 'Planning' ? 'Planning Engineer' : 'O&M Director'),
        role: appUser.role,
        signedAt: new Date().toISOString(),
        comment: signerComment.trim(),
        signatureDataUrl: signatureUrl
      };

      let nextPlanningSignOffs = { ...(project.designApproval.planningSignOffs || {}) };
      let nextOMSignOffs = { ...(project.designApproval.omSignOffs || {}) };

      if (level === 'Planning') {
        nextPlanningSignOffs[owner] = signOffData;
      } else {
        nextOMSignOffs[owner] = signOffData;
      }

      const anyPlanningRejected = participatingOwners.some(o => nextPlanningSignOffs[o]?.status === 'Rejected');
      const anyOMRejected = participatingOwners.some(o => nextOMSignOffs[o]?.status === 'Rejected');
      const isAnyRejected = anyPlanningRejected || anyOMRejected || !isApproved;

      const allPlanningApproved = participatingOwners.every(o => nextPlanningSignOffs[o]?.status === 'Approved');
      const allOMApproved = allPlanningApproved && participatingOwners.every(o => nextOMSignOffs[o]?.status === 'Approved');

      let nextStage: ApprovalStage = project.designApproval.approvalStage || 'Planning';
      let nextProjectStatus: ProjectStatus = 'Pending Approval';

      if (isAnyRejected) {
        nextStage = 'Rejected';
        nextProjectStatus = 'Rejected';
      } else if (allOMApproved) {
        nextStage = 'Completed';
        nextProjectStatus = 'Approved';
      } else if (allPlanningApproved) {
        nextStage = 'OM';
        nextProjectStatus = 'Pending Approval';
      } else {
        nextStage = 'Planning';
        nextProjectStatus = 'Pending Approval';
      }

      const updatedApproval: DesignApproval = {
        ...project.designApproval,
        status: nextProjectStatus,
        approvalStage: nextStage,
        planningSignOffs: nextPlanningSignOffs,
        omSignOffs: nextOMSignOffs,
        finalApprovedAt: allOMApproved ? new Date().toISOString() : project.designApproval.finalApprovedAt,
        finalApprovedBy: allOMApproved ? signerName.trim() : project.designApproval.finalApprovedBy
      };

      const updatedProject: Project = {
        ...project,
        status: nextProjectStatus,
        designApproval: updatedApproval
      };

      await setDoc(doc(db, `projects/${project.id}`), {
        status: nextProjectStatus,
        designApproval: updatedApproval
      }, { merge: true });

      await logActivity('sign_design_approval', `${isApproved ? 'Approved' : 'Rejected'} [Level: ${level}] for ${owner} on project ${project.name}`, {
        projectId: project.id,
        owner,
        level,
        allPlanningApproved,
        allOMApproved,
        nextStage,
        nextStatus: nextProjectStatus
      });

      if (onProjectUpdated) {
        onProjectUpdated(updatedProject);
      }

      setSigningModalOpen(false);
      setSigningTarget(null);
    } catch (err: any) {
      console.error('Error signing approval:', err);
      setActionError(err.message || 'Failed to record signature');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Safe Export to HTML / Presentation Report
  const handleExportDocument = () => {
    try {
      const printDoc = generatePrintableHtml();
      const blob = new Blob([printDoc], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Fiber_Infra_Sharing_Approval_${project.name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.html`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setExportSuccess(true);
      setTimeout(() => setExportSuccess(false), 4000);
    } catch (e) {
      console.error("Export error:", e);
    }
  };

  // Generate complete printable HTML
  const generatePrintableHtml = () => {
    const docNum = designApproval?.documentNumber || `APP-2026-${projectTierName.replace('Tier ', 'T')}-01`;
    const dateStr = new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
    const contractor = designApproval?.contractorName || 'United Telecommunication Services Co., Ltd.';

    // Generate dynamic cover logos HTML for ONLY participating owners
    const coverLogosHtml = participatingOwners.map(owner => {
      const logoUrl = getEffectiveOwnerLogo(owner) || (owner === 'SYMC' ? '/logos/logo-symphony.svg' : owner === 'UIH' ? '/logos/logo-uih.svg' : '/logos/logo-itel.svg');
      const zoom = getEffectiveOwnerZoom(owner);
      const isUih = owner === 'UIH' || (owner as string).includes('UNITED INFORMATION');
      const baseH = isUih ? 48 : 40;
      const h = Math.round(baseH * (isUih ? zoom / 120 : zoom / 100));
      return `<img src="${logoUrl}" alt="${owner}" style="height: ${h}px; width: auto; object-fit: contain;" />`;
    }).join('<span style="color: #cbd5e1; font-size: 22px; font-weight: bold;">&bull;</span>');

    // Generate dynamic header logos HTML for ONLY participating owners
    const headerLogosHtml = participatingOwners.map(owner => {
      const logoUrl = getEffectiveOwnerLogo(owner) || (owner === 'SYMC' ? '/logos/logo-symphony.svg' : owner === 'UIH' ? '/logos/logo-uih.svg' : '/logos/logo-itel.svg');
      const zoom = getEffectiveOwnerZoom(owner);
      const isUih = owner === 'UIH' || (owner as string).includes('UNITED INFORMATION');
      const baseH = isUih ? 26 : 22;
      const h = Math.round(baseH * (isUih ? zoom / 120 : zoom / 100));
      return `<img src="${logoUrl}" alt="${owner}" style="height: ${h}px; width: auto; object-fit: contain;" />`;
    }).join('<span style="color: #cbd5e1; font-size: 13px; font-weight: bold;">&bull;</span>');
    
    return `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8">
  <title>Fiber Infra Sharing Approval Document - ${project.name}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700;800&family=Space+Grotesk:wght@600;700&display=swap');
    @page { size: A4 landscape; margin: 10mm; }
    body {
      font-family: 'Sarabun', -apple-system, BlinkMacSystemFont, sans-serif;
      background: #f8fafc;
      color: #0f172a;
      margin: 0;
      padding: 20px;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .slide-page {
      background: #ffffff;
      border-radius: 12px;
      padding: 30px;
      margin-bottom: 30px;
      page-break-after: always;
      box-shadow: 0 4px 20px rgba(0,0,0,0.06);
      border: 1px solid #e2e8f0;
      min-height: 190mm;
      position: relative;
    }
    .slide-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 2px solid #0284c7;
      padding-bottom: 12px;
      margin-bottom: 20px;
    }
    .slide-title {
      font-size: 22px;
      font-weight: 800;
      color: #0369a1;
      margin: 0;
    }
    .logos-bar {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .logos-bar img {
      height: 24px;
      object-fit: contain;
    }
    .cover-logos {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 24px;
      background: white;
      padding: 16px 32px;
      border-radius: 16px;
      border: 1px solid #cbd5e1;
      margin-bottom: 30px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.05);
    }
    .cover-logos img {
      height: 48px;
      object-fit: contain;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
      margin: 15px 0;
    }
    th, td {
      border: 1px solid #cbd5e1;
      padding: 8px 10px;
      text-align: center;
    }
    th {
      background-color: #f1f5f9;
      font-weight: 700;
      color: #334155;
    }
    .th-highlight {
      background-color: #fef08a;
      font-weight: 800;
    }
    .metric-badge {
      display: inline-block;
      padding: 8px 16px;
      background: #fef08a;
      border: 2px solid #eab308;
      border-radius: 8px;
      font-weight: 800;
      font-size: 14px;
      margin: 6px 0;
    }
    .sig-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 20px;
      margin-top: 15px;
    }
    .sig-card {
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 16px;
      background: #f8fafc;
      text-align: center;
    }
    .sig-img {
      height: 60px;
      object-fit: contain;
      margin: 8px auto;
    }
    .level-badge {
      background: #e0f2fe;
      color: #0369a1;
      border: 1px solid #7dd3fc;
      padding: 3px 8px;
      border-radius: 4px;
      font-weight: 700;
      font-size: 11px;
    }
  </style>
</head>
<body>
  <!-- Slide 1: Cover -->
  <div class="slide-page" style="display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);">
    <div style="display: flex; align-items: center; justify-content: center; gap: 32px; background: white; padding: 18px 40px; border-radius: 18px; border: 1px solid #cbd5e1; margin-bottom: 24px; box-shadow: 0 4px 16px rgba(0,0,0,0.05); flex-wrap: wrap;">
      ${coverLogosHtml}
    </div>
    <h1 style="font-size: 42px; font-weight: 900; color: #0369a1; margin: 0 0 16px 0; text-transform: uppercase;">FIBER INFRA SHARING</h1>
    <h2 style="font-size: 26px; font-weight: 700; color: #334155; margin: 0 0 20px 0;">${project.name}</h2>
    <div style="display: flex; gap: 16px; margin-bottom: 24px; flex-wrap: wrap; justify-content: center;">
      <div style="background: white; padding: 10px 20px; border-radius: 12px; border: 1px solid #cbd5e1; box-shadow: 0 2px 8px rgba(0,0,0,0.04); text-align: left;">
        <span style="color: #64748b; font-size: 11px; text-transform: uppercase; font-weight: bold; display: block;">Tier Classification</span>
        <strong style="color: #0369a1; font-size: 15px;">${projectTierLabel}</strong>
      </div>
      <div style="background: white; padding: 10px 20px; border-radius: 12px; border: 1px solid #cbd5e1; box-shadow: 0 2px 8px rgba(0,0,0,0.04); text-align: left;">
        <span style="color: #64748b; font-size: 11px; text-transform: uppercase; font-weight: bold; display: block;">Shared Cable Distance</span>
        <strong style="color: #d97706; font-size: 15px;">${totalLengthKm} km.</strong>
      </div>
      <div style="background: white; padding: 10px 20px; border-radius: 12px; border: 1px solid #cbd5e1; box-shadow: 0 2px 8px rgba(0,0,0,0.04); text-align: left;">
        <span style="color: #64748b; font-size: 11px; text-transform: uppercase; font-weight: bold; display: block;">Total Enclosures</span>
        <strong style="color: #9333ea; font-size: 15px;">${sldEnclosures.length} EA.</strong>
      </div>
    </div>
    <div style="font-size: 14px; color: #64748b; background: white; padding: 12px 24px; border-radius: 10px; border: 1px solid #cbd5e1; display: inline-block;">
      <strong>Ref Doc:</strong> ${docNum} | <strong>Date:</strong> ${dateStr} | <strong>Status:</strong> ${project.status || 'Pending Approval'}
    </div>
  </div>

  <!-- Slide 2: Project Overview -->
  <div class="slide-page">
    <div class="slide-header">
      <h2 class="slide-title">ภาพรวมโครงการ (Project Overview)</h2>
      <div class="logos-bar" style="display: flex; align-items: center; gap: 14px; background: white; padding: 6px 14px; border-radius: 10px; border: 1px solid #cbd5e1; flex-wrap: wrap;">
        ${headerLogosHtml}
      </div>
    </div>
    <div style="margin-bottom: 16px;">
      <div class="metric-badge">ระยะดำเนินการ ${totalLengthKm} km.</div>
    </div>
    <table>
      <thead>
        <tr>
          <th>Tier</th>
          <th>เส้นทาง</th>
          <th>ระยะทาง (กม.)</th>
          ${participatingOwners.map(owner => `
            <th style="background: ${owner === 'SYMC' ? '#fdf2f8' : owner === 'UIH' ? '#f0f9ff' : '#fffbeb'}; color: ${owner === 'SYMC' ? '#db2777' : owner === 'UIH' ? '#0038b8' : '#d97706'};">Plan Core Use ${owner}</th>
          `).join('')}
          <th class="th-highlight">Plan Core Use TOTAL</th>
        </tr>
      </thead>
      <tbody>
        ${fiberRouteSchedule.map(r => `
          <tr>
            <td><strong>${r.tier}</strong></td>
            <td style="text-align: left;"><strong>${r.routeName}</strong><br><span style="font-size: 10px; color: #64748b;">${r.sectionName}</span></td>
            <td><strong>${r.distanceKm}</strong></td>
            ${participatingOwners.map(owner => `
              <td style="font-weight: 700; color: ${owner === 'SYMC' ? '#db2777' : owner === 'UIH' ? '#0038b8' : '#d97706'};">${owner === 'SYMC' ? r.symcCores : owner === 'UIH' ? r.uihCores : (r.itelCores || 0)}</td>
            `).join('')}
            <td style="font-weight: 800; background: #fef9c3;">${r.totalCores}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>

  <!-- Slide 4: Enclosure Details Table -->
  <div class="slide-page">
    <div class="slide-header">
      <h2 class="slide-title">รายละเอียดตำแหน่ง ENCLOSURE</h2>
      <div class="logos-bar" style="display: flex; align-items: center; gap: 14px; background: white; padding: 6px 14px; border-radius: 10px; border: 1px solid #cbd5e1; flex-wrap: wrap;">
        ${headerLogosHtml}
      </div>
    </div>
    <table>
      <thead>
        <tr>
          <th>No.</th>
          <th>BJ#No</th>
          <th>BJ#Name</th>
          <th>Lat.</th>
          <th>Long.</th>
          <th>Enclosure</th>
          ${participatingOwners.map(owner => `
            <th style="background: ${owner === 'SYMC' ? '#fdf2f8' : owner === 'UIH' ? '#f0f9ff' : '#fffbeb'}; color: ${owner === 'SYMC' ? '#db2777' : owner === 'UIH' ? '#0038b8' : '#d97706'};">${owner}_Tray No.</th>
          `).join('')}
          <th>Spare_Tray</th>
          <th>ตำแหน่ง</th>
        </tr>
      </thead>
      <tbody>
        ${sldEnclosures.map((enc, idx) => {
          const trayAssignments = enc.trayAssignments || {};
          return `
            <tr>
              <td>${idx + 1}</td>
              <td><strong>BJ#${String(idx + 1).padStart(2, '0')}</strong></td>
              <td style="text-align: left; font-weight: 600;">${enc.name}</td>
              <td>${enc.position?.lat?.toFixed(6) || '-'}</td>
              <td>${enc.position?.lng?.toFixed(6) || '-'}</td>
              <td>312 Core</td>
              ${participatingOwners.map(owner => {
                const assignedTrays = Object.entries(trayAssignments)
                  .filter(([_, o]) => o === owner)
                  .map(([tId]) => Number(tId))
                  .sort((a, b) => a - b);
                const trayStr = assignedTrays.length > 0 ? assignedTrays.join(',') : '-';
                return `<td style="color: ${owner === 'SYMC' ? '#db2777' : owner === 'UIH' ? '#0038b8' : '#d97706'}; font-weight: 700;">${trayStr}</td>`;
              }).join('')}
              <td style="color: #64748b; font-weight: 700;">
                ${(() => {
                  const encType = enclosureTypes.find(t => t.id === enc.enclosureTypeId) || enclosureTypes.find(t => t.name?.toLowerCase() === enc.locationType?.toLowerCase());
                  const totalTrays = encType?.spliceTrays || 13;
                  let spare = 0;
                  for (let tId = 1; tId <= totalTrays; tId++) {
                    const owner = trayAssignments[tId] || 'None';
                    if (owner === 'None') spare++;
                  }
                  return spare;
                })()}
              </td>
              <td>${enc.locationType || 'PB#'}</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  </div>

  <!-- Slide 5: Fiber Core & Tube Sharing -->
  <div class="slide-page">
    <div class="slide-header">
      <h2 class="slide-title">รายละเอียดการใช้งานตามสัดส่วน ${projectTierName.toUpperCase()}</h2>
      <div class="logos-bar" style="display: flex; align-items: center; gap: 14px; background: white; padding: 6px 14px; border-radius: 10px; border: 1px solid #cbd5e1; flex-wrap: wrap;">
        ${headerLogosHtml}
      </div>
    </div>
    ${fiberRouteSchedule.map((routeSched, rIdx) => {
      const totalC = routeSched.capacity || 144;
      let coreCursor = 1;

      const ownerRows = participatingOwners.map((owner) => {
        const ownerCoresCount = owner === 'SYMC' ? routeSched.symcCores : owner === 'UIH' ? routeSched.uihCores : (routeSched.itelCores || 0);
        let coreStr = '-';
        let tubeStr = '-';
        let trayStr = '-';

        if (ownerCoresCount > 0) {
          const cStart = coreCursor;
          const cEnd = coreCursor + ownerCoresCount - 1;
          coreStr = `${cStart}-${cEnd} (${ownerCoresCount}C)`;
          
          const tStart = Math.floor((cStart - 1) / 12) + 1;
          const tEnd = Math.floor((cEnd - 1) / 12) + 1;
          tubeStr = tStart === tEnd ? `Tube ${tStart}` : `Tube ${tStart}-${tEnd}`;

          const trStart = Math.floor((cStart - 1) / 24) + 1;
          const trEnd = Math.floor((cEnd - 1) / 24) + 1;
          trayStr = trStart === trEnd ? `Tray ${trStart}` : `Tray ${trStart}-${trEnd}`;

          coreCursor = cEnd + 1;
        }

        const colorHex = owner === 'SYMC' ? '#db2777' : owner === 'UIH' ? '#0038b8' : '#d97706';

        return {
          owner,
          colorHex,
          coreStr,
          tubeStr,
          trayStr
        };
      });

      return `
        <h3 style="font-size: 14px; color: #0369a1; margin-top: 10px; margin-bottom: 8px;">
          <strong>${routeSched.tier}</strong> - ${routeSched.routeName} (${routeSched.sectionName}) : ${routeSched.distanceKm} km.
        </h3>
        <table style="margin-bottom: 20px;">
          <thead>
            <tr>
              <th rowspan="2">Sharing</th>
              <th rowspan="2">Oper.</th>
              <th colspan="2" style="background: #f3e8ff; color: #6b21a8;">Enclosure 312 Core</th>
              <th colspan="2" style="background: #e0f2fe; color: #0369a1;">OFC ${totalC} Core</th>
            </tr>
            <tr>
              <th>BJ# No.</th>
              <th>Tray</th>
              <th>Tube</th>
              <th>Core</th>
            </tr>
          </thead>
          <tbody>
            ${ownerRows.map((row, idx) => `
              <tr>
                ${idx === 0 ? `<td rowspan="${ownerRows.length + 1}" style="font-weight: 800;">${routeSched.tier.split(' ')[0]} #${rIdx + 1}</td>` : ''}
                <td style="font-weight: 800; color: ${row.colorHex};">${row.owner}</td>
                <td>BJ#1-${sldEnclosures.length}</td>
                <td style="color: ${row.colorHex}; font-weight: 700;">${row.trayStr}</td>
                <td style="color: ${row.colorHex}; font-weight: 700;">${row.tubeStr}</td>
                <td style="color: ${row.colorHex}; font-weight: 700;">${row.coreStr}</td>
              </tr>
            `).join('')}
            <tr>
              <td style="font-weight: 700; color: #64748b;">Spare</td>
              <td>BJ#1-${sldEnclosures.length}</td>
              <td>Tray ${ownerRows.length + 1}</td>
              <td>-</td>
              <td>-</td>
            </tr>
          </tbody>
        </table>
      `;
    }).join('')}
  </div>

  <!-- Slide 6: Summary & 2-Level Approval -->
  <div class="slide-page">
    <div class="slide-header">
      <h2 class="slide-title">สรุปงานติดตั้ง & การลงนามอนุมัติ (2 ระดับ: Planning & O&M)</h2>
      <div class="logos-bar" style="display: flex; align-items: center; gap: 14px; background: white; padding: 6px 14px; border-radius: 10px; border: 1px solid #cbd5e1; flex-wrap: wrap;">
        ${headerLogosHtml}
      </div>
    </div>
    
    <div style="background: #f8fafc; padding: 14px; border-radius: 8px; border: 1px solid #e2e8f0; font-size: 13px; line-height: 1.6; margin-bottom: 20px;">
      <strong>สรุปงานติดตั้ง ${projectTierName} (${participatingOwners.join('+')}):</strong><br>
      1. ระยะเคเบิลที่ต้องใช้ร่วมกัน: ขนาด 144 Core ระยะทาง ${totalLengthKm} กิโลเมตร<br>
      2. การแบ่งจำนวน Core ใช้งาน: ขนาด 144 Core ${projectTierName.replace('Tier ', 'T')}#1 (${participatingOwners.map(o => `${o} ${Math.floor(144 / participatingOwners.length)} Core`).join(' ; ')})<br>
      3. ต้องใช้ Enclosure: ขนาด 312 Core จำนวน ${sldEnclosures.length} หัว<br>
      <strong>ผู้รับจ้างที่ดำเนินการติดตั้ง:</strong> ${contractor}<br>
      <div style="margin-top: 8px; font-weight: 700; color: #0369a1; text-align: center;">
        "โดยมีมติสรุปเห็นชอบร่วมกับดำเนินการ ตามรายละเอียดดังกล่าวข้างต้น"
      </div>
    </div>

    <!-- Level 1 Planning Signatures -->
    <div style="margin-bottom: 16px;">
      <span class="level-badge">ระดับที่ 1: ผู้อนุมัติทีม Planning</span>
      <div class="sig-grid">
        ${participatingOwners.map(o => {
          const s = planningSignOffs[o];
          return `
            <div class="sig-card">
              <strong style="color: ${o === 'SYMC' ? '#db2777' : o === 'UIH' ? '#0038b8' : '#d97706'}">${o === 'SYMC' ? 'Symphony Communication PCL.' : o === 'UIH' ? 'United Information Highway Co., Ltd.' : 'Interlink Telecom PCL.'} (Planning)</strong>
              ${s?.signatureDataUrl ? `<img src="${s.signatureDataUrl}" class="sig-img" />` : '<div style="height: 60px; line-height: 60px; color: #94a3b8;">[ยังไม่ได้ลงนาม]</div>'}
              <div style="font-size: 12px; font-weight: 700;">Name: ${s?.signedBy || '................................'}</div>
              <div style="font-size: 11px; color: #64748b;">Date: ${s?.signedAt ? new Date(s.signedAt).toLocaleDateString('th-TH') : '................................'}</div>
            </div>
          `;
        }).join('')}
      </div>
    </div>

    <!-- Level 2 OM Signatures -->
    <div>
      <span class="level-badge" style="background: #f0fdf4; color: #15803d; border-color: #86efac;">ระดับที่ 2: ผู้อนุมัติทีม O&M (Management)</span>
      <div class="sig-grid">
        ${participatingOwners.map(o => {
          const s = omSignOffs[o];
          return `
            <div class="sig-card">
              <strong style="color: ${o === 'SYMC' ? '#db2777' : o === 'UIH' ? '#0038b8' : '#d97706'}">${o === 'SYMC' ? 'Symphony Communication PCL.' : o === 'UIH' ? 'United Information Highway Co., Ltd.' : 'Interlink Telecom PCL.'} (O&M Management)</strong>
              ${s?.signatureDataUrl ? `<img src="${s.signatureDataUrl}" class="sig-img" />` : '<div style="height: 60px; line-height: 60px; color: #94a3b8;">[ยังไม่ได้ลงนาม]</div>'}
              <div style="font-size: 12px; font-weight: 700;">Name: ${s?.signedBy || '................................'}</div>
              <div style="font-size: 11px; color: #64748b;">Date: ${s?.signedAt ? new Date(s.signedAt).toLocaleDateString('th-TH') : '................................'}</div>
            </div>
          `;
        }).join('')}
      </div>
    </div>

  </div>
</body>
</html>`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/85 backdrop-blur-md overflow-hidden">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-6xl max-h-[96vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Top Header Bar */}
        <div className="px-5 py-3.5 bg-slate-950/90 border-b border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500 to-brand-600 flex items-center justify-center text-white shadow-md shadow-sky-500/20 shrink-0">
              <FileCheck size={20} />
            </div>
            <div className="truncate">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-extrabold text-white truncate font-display">
                  FIBER INFRA SHARING : ขออนุมัติแบบโครงการ
                </h2>
                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${
                  project.status === 'Approved' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' :
                  project.status === 'Rejected' ? 'bg-rose-500/20 text-rose-300 border-rose-500/40' :
                  isPlanningComplete ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40' :
                  'bg-amber-500/20 text-amber-300 border-amber-500/40'
                }`}>
                  {project.status === 'Approved' ? '✓ ผ่านการอนุมัติสมบูรณ์' :
                   project.status === 'Rejected' ? '✕ ไม่อนุมัติ / ขอแก้ไข' :
                   isPlanningComplete ? '2/2 รออนุมัติระดับ O&M' : '1/2 รออนุมัติระดับ Planning'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium truncate">
                {project.name} &bull; {participatingOwners.join(' + ')} &bull; {sldEnclosures.length} Enclosures &bull; {totalLengthKm} km
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* View Mode Switcher */}
            <div className="flex items-center bg-slate-800/80 p-1 rounded-xl border border-slate-700/80 text-xs">
              <button
                onClick={() => setViewMode('slides')}
                className={`px-3 py-1 rounded-lg font-bold flex items-center gap-1.5 transition-all ${
                  viewMode === 'slides' ? 'bg-sky-500 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Presentation size={13} />
                <span>สไลด์นำเสนอ</span>
              </button>
              <button
                onClick={() => setViewMode('document')}
                className={`px-3 py-1 rounded-lg font-bold flex items-center gap-1.5 transition-all ${
                  viewMode === 'document' ? 'bg-sky-500 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                <FileText size={13} />
                <span>เอกสารเต็ม</span>
              </button>
              {(!designApproval || isRejected) && (
                <button
                  onClick={() => setViewMode('request')}
                  className={`px-3 py-1 rounded-lg font-bold flex items-center gap-1.5 transition-all ${
                    viewMode === 'request' ? 'bg-amber-500 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Send size={13} />
                  <span>ยื่นขออนุมัติใหม่</span>
                </button>
              )}
            </div>

            {/* Export HTML / Print */}
            <button
              onClick={handleExportDocument}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 hover:text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm"
              title="Download print-ready presentation memo HTML"
            >
              <Download size={13} className={exportSuccess ? 'text-emerald-400' : 'text-slate-300'} />
              <span>{exportSuccess ? 'ดาวน์โหลดแล้ว!' : 'Export / PDF'}</span>
            </button>

            {/* Close */}
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition-all border border-slate-700/60"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* 2-Level Approval Stage Indicator Header */}
        <div className="px-6 py-2.5 bg-slate-950/60 border-b border-slate-800/80 flex items-center justify-between gap-4 text-xs shrink-0">
          <div className="flex items-center gap-2 sm:gap-4 overflow-x-auto py-0.5">
            {/* Stage 1: Planning */}
            <div className={`flex items-center gap-2 px-3 py-1 rounded-lg border ${
              isPlanningComplete 
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' 
                : 'bg-amber-500/15 border-amber-500/30 text-amber-300 font-bold'
            }`}>
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${
                isPlanningComplete ? 'bg-emerald-500 text-slate-950' : 'bg-amber-500 text-slate-950'
              }`}>
                {isPlanningComplete ? '✓' : '1'}
              </div>
              <span>ระดับที่ 1: Planning Team</span>
              <span className="text-[10px] opacity-75">({participatingOwners.filter(o => planningSignOffs[o]?.status === 'Approved').length}/{participatingOwners.length})</span>
            </div>

            <ArrowRight size={14} className="text-slate-600 shrink-0" />

            {/* Stage 2: O&M */}
            <div className={`flex items-center gap-2 px-3 py-1 rounded-lg border ${
              !isPlanningComplete 
                ? 'bg-slate-800/30 border-slate-800 text-slate-500'
                : isOMComplete
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-sky-500/15 border-sky-500/30 text-sky-300 font-bold'
            }`}>
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${
                !isPlanningComplete ? 'bg-slate-700 text-slate-400' :
                isOMComplete ? 'bg-emerald-500 text-slate-950' : 'bg-sky-500 text-slate-950'
              }`}>
                {!isPlanningComplete ? <Lock size={10} /> : isOMComplete ? '✓' : '2'}
              </div>
              <span>ระดับที่ 2: O&M (Management)</span>
              <span className="text-[10px] opacity-75">({participatingOwners.filter(o => omSignOffs[o]?.status === 'Approved').length}/{participatingOwners.length})</span>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-3 text-[11px] text-slate-400">
            <span>Doc: <span className="font-mono text-slate-300">{designApproval?.documentNumber || `APP-2026-${projectTierName.replace('Tier ', 'T')}-01`}</span></span>
          </div>
        </div>

        {/* Modal Main Content Body */}
        <div className="flex-1 overflow-y-auto bg-slate-950 p-4 sm:p-6 custom-scrollbar">
          
          {/* VIEW MODE 1: PRESENTATION SLIDES (Matching the attached PDF presentation) */}
          {viewMode === 'slides' && (
            <div className="max-w-5xl mx-auto space-y-4">
              
              {/* Slide Container with clean presentation border */}
              <div className="bg-slate-900 border border-slate-700/80 rounded-2xl p-6 md:p-8 shadow-xl relative min-h-[520px] flex flex-col justify-between overflow-hidden">
                
                {/* Background watermarks */}
                <div className="absolute top-0 right-0 w-96 h-96 bg-sky-500/5 rounded-full blur-3xl pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-96 h-96 bg-pink-500/5 rounded-full blur-3xl pointer-events-none" />

                {/* Slide Header with Co-branding Owner Logos */}
                <div className="flex items-center justify-between pb-4 border-b border-slate-800 relative z-10 shrink-0">
                  <div className="flex items-center gap-2.5">
                    <span className="text-xs font-black tracking-wider px-2 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/30">
                      SLIDE {currentSlide} / {totalSlides}
                    </span>
                    <h3 className="text-sm md:text-base font-extrabold text-white">
                      {currentSlide === 1 && "FIBER INFRA SHARING"}
                      {currentSlide === 2 && "ภาพรวมโครงการ (Project Overview)"}
                      {currentSlide === 3 && "แผนที่และแนวเส้นทางโครงการ (Project Route Map)"}
                      {currentSlide === 4 && "รายละเอียดตำแหน่ง ENCLOSURE"}
                      {currentSlide === 5 && `รายละเอียดการใช้งานตามสัดส่วน ${projectTierName.toUpperCase()} (Core & Tube Allocation)`}
                      {currentSlide === 6 && "สรุปงานติดตั้ง & การลงนามอนุมัติ (2 ระดับ: Planning & O&M)"}
                    </h3>
                  </div>

                  {/* Owner Vector Logos Header Pill with dynamic OwnerLogos for ONLY participating owners */}
                  <div className="flex items-center gap-3 bg-white/95 py-1 px-3.5 rounded-xl border border-slate-200 shadow-sm flex-wrap">
                    {participatingOwners.map((owner, idx) => (
                      <React.Fragment key={owner}>
                        {idx > 0 && <span className="text-slate-300 font-black text-xs select-none">&bull;</span>}
                        <OwnerLogo owner={owner} size="sm" />
                      </React.Fragment>
                    ))}
                  </div>
                </div>

                {/* Slide Contents Body */}
                <div className="py-6 flex-1 flex flex-col justify-center relative z-10">
                  
                  {/* SLIDE 1: COVER */}
                  {currentSlide === 1 && (
                    <div className="text-center py-8 space-y-6">
                      {/* Co-Branding Logos Pill with dynamic OwnerLogos for ONLY participating owners */}
                      <div className="flex justify-center">
                        <div className="inline-flex items-center justify-center gap-6 sm:gap-8 py-4 px-8 sm:px-12 rounded-2xl bg-white/95 border border-slate-200/90 shadow-xl flex-wrap">
                          {participatingOwners.map((owner, idx) => (
                            <React.Fragment key={owner}>
                              {idx > 0 && <span className="text-slate-300 font-black text-2xl select-none">&bull;</span>}
                              <OwnerLogo owner={owner} size="xl" />
                            </React.Fragment>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-3">
                        <h1 className="text-3xl md:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-sky-400 via-blue-300 to-pink-400 tracking-tight font-display uppercase">
                          FIBER INFRA SHARING
                        </h1>
                        <p className="text-lg md:text-2xl font-bold text-slate-200">
                          {project.name}
                        </p>
                        <p className="text-xs md:text-sm text-slate-400">
                          ข้อเสนอการร่วมใช้โครงข่ายเคเบิลใยแก้วนำแสงร่วมกัน (Infrastructure Sharing Agreement)
                        </p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-2xl mx-auto pt-4 text-left">
                        <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                          <p className="text-[10px] text-slate-400 font-bold uppercase">Tier Classification</p>
                          <p className="text-xs font-black text-sky-400">{projectTierLabel}</p>
                        </div>
                        <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                          <p className="text-[10px] text-slate-400 font-bold uppercase">Shared Cable Distance</p>
                          <p className="text-xs font-black text-amber-400">{totalLengthKm} km.</p>
                        </div>
                        <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                          <p className="text-[10px] text-slate-400 font-bold uppercase">Total Enclosures</p>
                          <p className="text-xs font-black text-purple-400">{sldEnclosures.length} EA.</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* SLIDE 2: PROJECT OVERVIEW (Accurate Fiber Optic Table & High-Precision Map) */}
                  {currentSlide === 2 && (
                    <div className="space-y-5">
                      {/* Metric Callouts */}
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="bg-amber-400 text-slate-950 font-black text-xs px-4 py-2 rounded-xl shadow-md flex items-center gap-2">
                          <Cable size={14} />
                          <span>ระยะดำเนินการ {totalLengthKm} km.</span>
                        </div>
                      </div>

                      {/* Main Overview Table with well-proportioned columns, each Fiber Optic line, and summary totals */}
                      <div className="border border-slate-700/80 rounded-xl overflow-x-auto bg-slate-950/80">
                        <table className="w-full text-xs text-center border-collapse min-w-[720px]">
                          <thead>
                            <tr className="bg-slate-800/90 text-slate-200 font-bold border-b border-slate-700">
                              <th className="p-3 border-r border-slate-700 w-28">Tier</th>
                              <th className="p-3 border-r border-slate-700 text-left">เส้นทาง (Fiber Optic Route)</th>
                              <th className="p-3 border-r border-slate-700 w-28">ระยะทาง (กม.)</th>
                              {participatingOwners.map(owner => (
                                <th key={owner} className="p-3 border-r border-slate-700 min-w-[130px]" style={{ backgroundColor: owner === 'SYMC' ? 'rgba(236,72,153,0.1)' : owner === 'UIH' ? 'rgba(14,165,233,0.1)' : 'rgba(245,158,11,0.1)' }}>
                                  <div className="flex flex-col items-center justify-center gap-1">
                                    <span className="text-[10px] font-bold text-slate-300">Plan Core Use</span>
                                    <OwnerLogo owner={owner} size="xs" />
                                  </div>
                                </th>
                              ))}
                              <th className="p-3 bg-amber-400 text-slate-950 font-black min-w-[130px]">Plan Core Use TOTAL</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800">
                            {fiberRouteSchedule.map(r => (
                              <tr key={r.id} className="hover:bg-slate-800/40 font-medium">
                                <td className="p-3 border-r border-slate-800 font-bold text-sky-400">{r.tier}</td>
                                <td className="p-3 border-r border-slate-800 text-left text-slate-200">
                                  <span className="font-bold text-white block">{r.routeName}</span>
                                  <span className="text-[11px] text-slate-400">{r.sectionName}</span>
                                </td>
                                <td className="p-3 border-r border-slate-800 font-black text-slate-100">{r.distanceKm}</td>
                                {participatingOwners.map(owner => (
                                  <td key={owner} className="p-3 border-r border-slate-800 font-black text-center" style={{ color: owner === 'SYMC' ? '#f472b6' : owner === 'UIH' ? '#38bdf8' : '#fbbf24' }}>
                                    {owner === 'SYMC' ? r.symcCores : owner === 'UIH' ? r.uihCores : (r.itelCores || 0)}
                                  </td>
                                ))}
                                <td className="p-3 font-black text-slate-950 bg-amber-400/90 text-sm">{r.totalCores}</td>
                              </tr>
                            ))}
                          </tbody>
                          {/* Summary Totals Row */}
                          <tfoot>
                            <tr className="bg-slate-900 font-black text-slate-100 border-t-2 border-slate-700">
                              <td colSpan={2} className="p-3 border-r border-slate-700 text-right uppercase tracking-wider text-xs">
                                รวมทั้งโครงการ (Total Infra Sharing)
                              </td>
                              <td className="p-3 border-r border-slate-700 text-amber-400 text-sm font-black">
                                {fiberRouteTotals.distanceKm} km.
                              </td>
                              {participatingOwners.map(owner => (
                                <td 
                                  key={owner} 
                                  className="p-3 border-r border-slate-700 font-black text-sm" 
                                  style={{ 
                                    backgroundColor: owner === 'SYMC' ? 'rgba(236,72,153,0.1)' : owner === 'UIH' ? 'rgba(14,165,233,0.1)' : 'rgba(245,158,11,0.1)',
                                    color: owner === 'SYMC' ? '#f472b6' : owner === 'UIH' ? '#38bdf8' : '#fbbf24' 
                                  }}
                                >
                                  {owner === 'SYMC' ? fiberRouteTotals.symcCores : owner === 'UIH' ? fiberRouteTotals.uihCores : (fiberRouteTotals.itelCores || 0)}
                                </td>
                              ))}
                              <td className="p-3 bg-amber-400 text-slate-950 font-black text-base">
                                {fiberRouteTotals.totalCores}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* SLIDE 3: ROUTE MAP & GIS MAP WITH SIDE LEGEND PANEL */}
                  {currentSlide === 3 && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                        {/* Interactive GIS Map */}
                        <div className="lg:col-span-8 border border-slate-700/80 rounded-xl overflow-hidden h-[480px] relative shadow-inner bg-slate-950">
                          {/* Map Label Mode Switcher Bar */}
                          <div className="absolute top-3 right-3 z-[1000] bg-slate-900/90 backdrop-blur-md border border-slate-700/80 rounded-lg p-1 flex items-center gap-1 shadow-2xl text-[10px] text-slate-200">
                            <span className="px-1.5 text-slate-400 font-bold text-[9px] uppercase tracking-wider hidden sm:inline">Label Mode:</span>
                            <button
                              type="button"
                              onClick={() => setMapLabelMode('all')}
                              className={`px-2 py-1 rounded font-bold transition-all ${mapLabelMode === 'all' ? 'bg-sky-500 text-white shadow-md' : 'text-slate-300 hover:text-white hover:bg-slate-800'}`}
                              title="แสดงชื่อ Enclosure และพิกัดพร้อมการจัดระเบียบไม่ให้ทับกัน"
                            >
                              📌 แสดงทั้งหมด (จัดระเบียบ)
                            </button>
                            <button
                              type="button"
                              onClick={() => setMapLabelMode('code')}
                              className={`px-2 py-1 rounded font-bold transition-all ${mapLabelMode === 'code' ? 'bg-sky-500 text-white shadow-md' : 'text-slate-300 hover:text-white hover:bg-slate-800'}`}
                              title="แสดงรหัสย่อสำหรับแผนที่คลีน"
                            >
                              🏷️ รหัสย่อ
                            </button>
                            <button
                              type="button"
                              onClick={() => setMapLabelMode('hover')}
                              className={`px-2 py-1 rounded font-bold transition-all ${mapLabelMode === 'hover' ? 'bg-sky-500 text-white shadow-md' : 'text-slate-300 hover:text-white hover:bg-slate-800'}`}
                              title="แสดงเมื่อเอาเมาส์ไปชี้ที่หมุด"
                            >
                              🔍 ชี้เพื่อดู (Hover)
                            </button>
                          </div>

                          <MapContainer
                            center={[sldEnclosures[0]?.position?.lat || 13.748, sldEnclosures[0]?.position?.lng || 100.548]}
                            zoom={15}
                            style={{ width: '100%', height: '100%' }}
                            attributionControl={false}
                          >
                            <TileLayer 
                              url="https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}" 
                              attribution="&copy; Google Maps" 
                            />
                            <MapAutoFitBounds enclosures={effectiveEnclosures} routes={effectiveRoutes} />
                            
                            {/* Fiber Optic Routes matching design colors & details */}
                            {effectiveRoutes.map((r, i) => {
                              const routeData = fiberRouteSchedule[i] || fiberRouteSchedule.find(s => s.routeName === r.name) || {
                                tier: r.tier || projectTierCompactLabel,
                                distanceKm: '1.50',
                                symcCores: 0,
                                uihCores: 0,
                                itelCores: 0,
                                totalCores: r.capacity || 144
                              };

                              const totalC = routeData.totalCores || r.capacity || 144;
                              const symcPct = totalC > 0 ? ((routeData.symcCores / totalC) * 100).toFixed(0) : '0';
                              const uihPct = totalC > 0 ? ((routeData.uihCores / totalC) * 100).toFixed(0) : '0';
                              const itelPct = totalC > 0 ? (((routeData.itelCores || 0) / totalC) * 100).toFixed(0) : '0';

                              const shares = [];
                              if (routeData.symcCores > 0) shares.push(`SYMC ${routeData.symcCores}C (${symcPct}%)`);
                              if (routeData.uihCores > 0) shares.push(`UIH ${routeData.uihCores}C (${uihPct}%)`);
                              if ((routeData.itelCores || 0) > 0) shares.push(`ITEL ${routeData.itelCores}C (${itelPct}%)`);
                              const sharingRatioText = shares.join(' • ');

                              return (
                                <Polyline 
                                  key={r.id || i} 
                                  positions={r.path?.map(p => [p.lat, p.lng]) || []} 
                                  pathOptions={{ 
                                    color: getRouteColor(r), 
                                    weight: 4.5,
                                    opacity: 0.9
                                  }} 
                                >
                                  <Tooltip direction="top" opacity={0.98} sticky>
                                    <div className="text-xs font-sans p-1 space-y-1.5 min-w-[260px]">
                                      <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-1">
                                        <strong className="text-slate-900 font-bold text-xs">{r.name || `Fiber Route ${i + 1}`}</strong>
                                        <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 font-bold text-[10px]">{r.capacity || 144}F</span>
                                      </div>

                                      <div className="flex items-center justify-between text-[10.5px]">
                                        <span className="font-bold text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded border border-sky-200">
                                          {routeData.tier || r.tier || projectTierCompactLabel}
                                        </span>
                                        {r.fiberType && <span className="text-slate-500 font-mono text-[10px]">{r.fiberType}</span>}
                                      </div>

                                      <div className="bg-slate-900 text-slate-100 p-2 rounded-lg space-y-1 text-[10px] border border-slate-700 shadow-sm">
                                        <div className="text-amber-400 font-bold text-[9px] uppercase tracking-wider flex items-center justify-between">
                                          <span>สัดส่วนการแชร์ (Sharing Ratio)</span>
                                          <span className="text-slate-400 font-mono">{totalC} Core</span>
                                        </div>
                                        <div className="font-mono text-slate-200 font-bold text-[10.5px] leading-snug">
                                          {sharingRatioText || 'ยังไม่ได้กำหนดสัดส่วนในเส้น'}
                                        </div>
                                      </div>

                                      <div className="text-[10px] font-mono text-slate-600 flex justify-between pt-0.5">
                                        <span>ระยะทาง (Distance):</span>
                                        <span className="font-bold text-slate-800">{r.totalLength ? `${(r.totalLength / 1000).toFixed(2)} km` : `${routeData.distanceKm || '1.50'} km`}</span>
                                      </div>
                                    </div>
                                  </Tooltip>
                                </Polyline>
                              );
                            })}

                            {/* Fiber Loops */}
                            {effectiveLoops.map((loop, i) => (
                              <CircleMarker
                                key={loop.id || i}
                                center={[loop.position.lat, loop.position.lng]}
                                radius={4}
                                pathOptions={{
                                  color: '#ffffff',
                                  fillColor: '#f97316',
                                  fillOpacity: 1,
                                  weight: 1.5
                                }}
                              >
                                <Tooltip direction="top" offset={[0, -6]} opacity={0.95}>
                                  <div className="text-xs font-sans">
                                    <strong className="block text-slate-900">{loop.name || 'Fiber Loop'}</strong>
                                    <span className="text-amber-600 font-bold text-[10px]">{loop.length}m Coil</span>
                                  </div>
                                </Tooltip>
                              </CircleMarker>
                            ))}

                            {/* Individual Enclosure Markers */}
                            {effectiveEnclosures.map((e, i) => {
                              const encType = getEnclosureType(e);
                              const encColor = encType?.color || '#3b82f6';
                              const iconUrl = encType?.icon;
                              if (!e.position) return null;

                              if (iconUrl) {
                                const customIcon = new L.Icon({
                                  iconUrl: iconUrl,
                                  iconSize: [14, 14],
                                  iconAnchor: [7, 7],
                                  className: ''
                                });
                                return (
                                  <Marker 
                                    key={`enc-marker-${e.id || i}`} 
                                    position={[e.position.lat, e.position.lng]} 
                                    icon={customIcon}
                                  />
                                );
                              }

                              return (
                                <CircleMarker 
                                  key={`enc-marker-${e.id || i}`} 
                                  center={[e.position.lat, e.position.lng]} 
                                  radius={5} 
                                  pathOptions={{ 
                                    color: '#ffffff', 
                                    fillColor: encColor, 
                                    fillOpacity: 1, 
                                    weight: 1.5 
                                  }}
                                />
                              );
                            })}

                            {/* Non-overlapping Consolidated Location Group Tooltip Cards attached directly to Closure locations */}
                            {locationGroupedPlacements.map((g) => {
                              const isPermanent = mapLabelMode === 'all' || mapLabelMode === 'code';

                              const labelContent = (
                                <div className="p-1 space-y-1 max-w-[250px] text-center font-sans">
                                  <div className="flex items-center justify-center gap-1 flex-wrap">
                                    {g.enclosures.map((enc) => (
                                      <span 
                                        key={enc.id || enc.name} 
                                        className="px-1.5 py-0.5 rounded bg-slate-900 text-amber-400 font-extrabold text-[10px] border border-slate-700 shadow-sm"
                                      >
                                        {mapLabelMode === 'code' ? enc.name.split(' ')[0] : enc.name}
                                      </span>
                                    ))}
                                  </div>
                                  <div className="text-[8.5px] font-mono text-slate-600 border-t border-slate-200 pt-0.5 mt-0.5">
                                    📍 พิกัด: {g.latStr}, {g.lngStr}
                                  </div>
                                </div>
                              );

                              const hoverContent = (
                                <div className="text-xs font-sans p-1 space-y-1 min-w-[170px]">
                                  <strong className="block text-slate-900 font-bold text-xs">จุดติดตั้ง ({g.enclosures.length} Enclosures)</strong>
                                  <div className="text-slate-700 text-[10px] font-bold">
                                    {g.enclosures.map(e => e.name).join(', ')}
                                  </div>
                                  <div className="text-slate-500 text-[9.5px] font-mono border-t pt-1">
                                    📍 พิกัด: {g.latStr}, {g.lngStr}
                                  </div>
                                </div>
                              );

                              return (
                                <Marker
                                  key={`group-tooltip-${g.id}`}
                                  position={[g.centerLat, g.centerLng]}
                                  icon={L.divIcon({ className: 'hidden-group-anchor', html: '' })}
                                >
                                  <Tooltip permanent={isPermanent} direction={g.direction} offset={g.offset} opacity={0.96}>
                                    {isPermanent ? labelContent : hoverContent}
                                  </Tooltip>
                                </Marker>
                              );
                            })}
                          </MapContainer>
                        </div>

                        {/* Side Legend & Route Table Panel */}
                        <div className="lg:col-span-4 bg-slate-900 border border-slate-700/80 rounded-xl p-3.5 h-[480px] overflow-y-auto space-y-3 shadow-xl text-xs text-slate-200">
                          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                            <h4 className="font-black text-amber-400 flex items-center gap-1.5 text-sm">
                              <span>🗺️ Map Legend & Route Summary</span>
                            </h4>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400">{effectiveRoutes.length} เส้นทาง</span>
                          </div>

                          <div className="space-y-2.5">
                            {effectiveRoutes.map((r, i) => {
                              const routeData = fiberRouteSchedule[i] || fiberRouteSchedule.find(s => s.routeName === r.name) || {
                                tier: r.tier || projectTierCompactLabel,
                                distanceKm: '1.50',
                                symcCores: 0,
                                uihCores: 0,
                                itelCores: 0,
                                totalCores: r.capacity || 144
                              };
                              const routeColor = getRouteColor(r);
                              const totalC = routeData.totalCores || r.capacity || 144;

                              const shares = [];
                              if (routeData.symcCores > 0) shares.push(`SYMC: ${routeData.symcCores}C`);
                              if (routeData.uihCores > 0) shares.push(`UIH: ${routeData.uihCores}C`);
                              if ((routeData.itelCores || 0) > 0) shares.push(`ITEL: ${routeData.itelCores}C`);
                              const sharingText = shares.length > 0 ? shares.join(' | ') : 'ยังไม่ได้กำหนดสัดส่วน';

                              return (
                                <div key={r.id || i} className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800 space-y-1.5 hover:border-slate-700 transition-all">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <span className="w-3 h-3 rounded-full inline-block shadow-sm shrink-0" style={{ backgroundColor: routeColor }} />
                                      <strong className="text-white font-bold text-xs truncate max-w-[170px]" title={r.name || `Route ${i + 1}`}>{r.name || `Route ${i + 1}`}</strong>
                                    </div>
                                    <span className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 font-mono font-bold text-[10px]">{totalC}F</span>
                                  </div>

                                  <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                                    <span>Tier: <strong className="text-sky-300">{routeData.tier || r.tier || projectTierCompactLabel}</strong></span>
                                    <span>ระยะทาง: <strong className="text-white">{routeData.distanceKm} km</strong></span>
                                  </div>

                                  <div className="bg-slate-900/90 px-2 py-1 rounded border border-slate-800 text-[10.5px] font-mono text-amber-300/90">
                                    <div className="text-[9px] uppercase tracking-wider text-slate-400 font-bold mb-0.5">สัดส่วนการแชร์ (Core Shares):</div>
                                    <div className="font-bold">{sharingText}</div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      {/* Bottom Legend Bar */}
                      <div className="grid grid-cols-3 gap-3 text-center text-xs font-black">
                        <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-slate-200 flex items-center justify-center gap-2 flex-wrap">
                          <span>{projectTierCompactLabel}</span>
                          {participatingOwners.map((owner, idx) => (
                            <React.Fragment key={owner}>
                              {idx > 0 && <span>+</span>}
                              <OwnerLogo owner={owner} size="xs" />
                            </React.Fragment>
                          ))}
                        </div>
                        <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-amber-400">
                          OFC 144 Core : {totalLengthKm} km.
                        </div>
                        <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-pink-400">
                          Enclosure 312 Core : {sldEnclosures.length} EA.
                        </div>
                      </div>
                    </div>
                  )}

                  {/* SLIDE 4: ENCLOSURE DETAIL TABLE */}
                  {currentSlide === 4 && (
                    <div className="space-y-4">
                      <div className="border border-slate-700/80 rounded-xl overflow-x-auto bg-slate-950/80 max-h-[340px] custom-scrollbar">
                        <table className="w-full text-xs text-center border-collapse min-w-[760px]">
                          <thead className="sticky top-0 bg-slate-800 z-10">
                            <tr className="border-b border-slate-700 text-slate-200 font-bold">
                              <th className="p-2.5 border-r border-slate-700">No.</th>
                              <th className="p-2.5 border-r border-slate-700">BJ#No</th>
                              <th className="p-2.5 border-r border-slate-700 text-left">BJ#Name</th>
                              <th className="p-2.5 border-r border-slate-700">Lat.</th>
                              <th className="p-2.5 border-r border-slate-700">Long.</th>
                              <th className="p-2.5 border-r border-slate-700">Enclosure</th>
                              {participatingOwners.map(owner => (
                                <th key={owner} className="p-2.5 border-r border-slate-700 min-w-[120px]" style={{ backgroundColor: owner === 'SYMC' ? 'rgba(236,72,153,0.1)' : owner === 'UIH' ? 'rgba(14,165,233,0.1)' : 'rgba(245,158,11,0.1)' }}>
                                  <div className="flex items-center justify-center gap-1">
                                    <OwnerLogo owner={owner} size="xs" />
                                    <span className="text-[10px]" style={{ color: owner === 'SYMC' ? '#f472b6' : owner === 'UIH' ? '#38bdf8' : '#fbbf24' }}>Tray No.</span>
                                  </div>
                                </th>
                              ))}
                              <th className="p-2.5 border-r border-slate-700">Spare_Tray</th>
                              <th className="p-2.5">ตำแหน่ง</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800 font-medium">
                            {sldEnclosures.map((enc, idx) => {
                              const trayAssignments = enc.trayAssignments || {};
                              return (
                                <tr key={enc.id || idx} className="hover:bg-slate-800/40">
                                  <td className="p-2 border-r border-slate-800 text-slate-400">{idx + 1}</td>
                                  <td className="p-2 border-r border-slate-800 font-black text-sky-400">BJ#{String(idx + 1).padStart(2, '0')}</td>
                                  <td className="p-2 border-r border-slate-800 text-left font-bold text-slate-200">{enc.name}</td>
                                  <td className="p-2 border-r border-slate-800 font-mono text-[11px] text-slate-400">{enc.position?.lat?.toFixed(6) || '13.748000'}</td>
                                  <td className="p-2 border-r border-slate-800 font-mono text-[11px] text-slate-400">{enc.position?.lng?.toFixed(6) || '100.548000'}</td>
                                  <td className="p-2 border-r border-slate-800 font-bold text-slate-300">312 Core</td>
                                  {participatingOwners.map(owner => {
                                    const assignedTrays = Object.entries(trayAssignments)
                                      .filter(([_, o]) => o === owner)
                                      .map(([tId]) => Number(tId))
                                      .sort((a, b) => a - b);
                                    const trayRangeStr = formatTrayRanges(assignedTrays);

                                    return (
                                      <td key={owner} className="p-2 border-r border-slate-800 font-black" style={{ color: owner === 'SYMC' ? '#f472b6' : owner === 'UIH' ? '#38bdf8' : '#fbbf24' }}>
                                        {trayRangeStr}
                                      </td>
                                    );
                                  })}
                                  <td className="p-2 border-r border-slate-800 font-bold text-slate-400">
                                    {(() => {
                                      const encType = enclosureTypes.find(t => t.id === enc.enclosureTypeId) || enclosureTypes.find(t => t.name?.toLowerCase() === enc.locationType?.toLowerCase());
                                      const totalTrays = encType?.spliceTrays || 13;
                                      let spare = 0;
                                      for (let tId = 1; tId <= totalTrays; tId++) {
                                        const owner = trayAssignments[tId] || 'None';
                                        if (owner === 'None') spare++;
                                      }
                                      return spare;
                                    })()}
                                  </td>
                                  <td className="p-2 font-bold text-slate-300">{enc.locationType || 'PB#'}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* SLIDE 5: FIBER USAGE BREAKDOWN & TUBE GRAPHIC */}
                  {currentSlide === 5 && (
                    <div className="space-y-4">
                      {fiberRouteSchedule.map((routeSched, rIdx) => {
                        const totalC = routeSched.capacity || 144;
                        let coreCursor = 1;

                        const ownerRows = participatingOwners.map((owner) => {
                          const ownerCoresCount = owner === 'SYMC' ? routeSched.symcCores : owner === 'UIH' ? routeSched.uihCores : (routeSched.itelCores || 0);
                          
                          let coreStr = '-';
                          let tubeStr = '-';
                          let trayStr = '-';

                          if (ownerCoresCount > 0) {
                            const cStart = coreCursor;
                            const cEnd = coreCursor + ownerCoresCount - 1;
                            coreStr = `${cStart}-${cEnd} (${ownerCoresCount}C)`;
                            
                            const tStart = Math.floor((cStart - 1) / 12) + 1;
                            const tEnd = Math.floor((cEnd - 1) / 12) + 1;
                            tubeStr = tStart === tEnd ? `Tube ${tStart}` : `Tube ${tStart}-${tEnd} (${tEnd - tStart + 1} Tube)`;

                            const trStart = Math.floor((cStart - 1) / 24) + 1;
                            const trEnd = Math.floor((cEnd - 1) / 24) + 1;
                            trayStr = trStart === trEnd ? `Tray ${trStart}` : `Tray ${trStart}-${trEnd}`;

                            coreCursor = cEnd + 1;
                          }

                          const colorStyle = owner === 'SYMC' ? 'text-pink-400 bg-pink-500/10' : owner === 'UIH' ? 'text-sky-400 bg-sky-500/10' : 'text-amber-400 bg-amber-500/10';

                          return {
                            owner,
                            coresCount: ownerCoresCount,
                            coreStr,
                            tubeStr,
                            trayStr,
                            colorStyle
                          };
                        });

                        return (
                          <div key={routeSched.id || rIdx} className="space-y-2">
                            <div className="text-xs font-black text-sky-400 flex items-center justify-between gap-2 flex-wrap bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
                              <span className="font-bold text-slate-100 flex items-center gap-1.5">
                                <span className="px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30 font-black text-[10px]">{routeSched.tier}</span>
                                <span className="text-amber-400 font-extrabold">{routeSched.routeName}</span> ({routeSched.sectionName})
                              </span>
                              <span className="text-slate-400 font-mono text-[11px]">
                                ระยะทาง: <strong className="text-white">{routeSched.distanceKm} km</strong> &bull; ขนาด: <strong className="text-amber-300">OFC {totalC} Core</strong>
                              </span>
                            </div>

                            {/* Usage Table */}
                            <div className="border border-slate-700/80 rounded-xl overflow-x-auto bg-slate-950/80">
                              <table className="w-full text-xs text-center border-collapse min-w-[700px]">
                                <thead>
                                  <tr className="bg-slate-800 border-b border-slate-700 text-slate-200 font-bold">
                                    <th rowSpan={2} className="p-2 border-r border-slate-700 w-28">Sharing</th>
                                    <th rowSpan={2} className="p-2 border-r border-slate-700 min-w-[100px]">Oper.</th>
                                    <th colSpan={2} className="p-2 border-r border-slate-700 bg-purple-500/20 text-purple-300">Enclosure 312 Core</th>
                                    <th colSpan={2} className="p-2 bg-blue-500/20 text-blue-300">OFC {totalC} Core</th>
                                  </tr>
                                  <tr className="bg-slate-800/60 border-b border-slate-700 text-[11px] text-slate-300 font-bold">
                                    <th className="p-1.5 border-r border-slate-700">BJ# No.</th>
                                    <th className="p-1.5 border-r border-slate-700">Tray</th>
                                    <th className="p-1.5 border-r border-slate-700">Tube</th>
                                    <th className="p-1.5">Core</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800 font-bold">
                                  {ownerRows.map((row, idx) => {
                                    const isFirst = idx === 0;
                                    return (
                                      <tr key={row.owner}>
                                        {isFirst && (
                                          <td rowSpan={ownerRows.length + 1} className="p-2 border-r border-slate-800 text-amber-400 font-black">
                                            {routeSched.tier.split(' ')[0]} #{rIdx + 1}
                                          </td>
                                        )}
                                        <td className={`p-2 border-r border-slate-800 ${row.colorStyle}`}>
                                          <div className="flex items-center justify-center">
                                            <OwnerLogo owner={row.owner} size="xs" />
                                          </div>
                                        </td>
                                        <td className="p-2 border-r border-slate-800 font-normal">BJ#1-{sldEnclosures.length}</td>
                                        <td className={`p-2 border-r border-slate-800 ${row.colorStyle.split(' ')[0]}`}>{row.trayStr}</td>
                                        <td className={`p-2 border-r border-slate-800 ${row.colorStyle.split(' ')[0]}`}>{row.tubeStr}</td>
                                        <td className={`p-2 ${row.colorStyle.split(' ')[0]}`}>{row.coreStr}</td>
                                      </tr>
                                    );
                                  })}
                                  <tr>
                                    <td className="p-2 border-r border-slate-800 text-slate-400">Spare</td>
                                    <td className="p-2 border-r border-slate-800 font-normal">BJ#1-{sldEnclosures.length}</td>
                                    <td className="p-2 border-r border-slate-800 text-slate-400">Tray {ownerRows.length + 1}</td>
                                    <td className="p-2 border-r border-slate-800 text-slate-500">-</td>
                                    <td className="p-2 text-slate-500">-</td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          </div>
                        );
                      })}

                      {/* Cable Cross-Section Graphic (12 Loose Tubes) */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                        <div className="p-4 bg-slate-950/90 rounded-xl border border-slate-800 flex flex-col items-center">
                          <p className="text-xs font-black text-slate-200 mb-3">OFC 144 Core (12 Tube Cross Section)</p>
                          
                          {/* Circular SVG representation */}
                          <div className="w-44 h-44 relative flex items-center justify-center">
                            <svg viewBox="0 0 200 200" className="w-full h-full drop-shadow-md">
                              <circle cx="100" cy="100" r="92" fill="#0f172a" stroke="#475569" strokeWidth="4" />
                              <circle cx="100" cy="100" r="78" fill="#1e293b" stroke="#334155" strokeWidth="2" />
                              <circle cx="100" cy="100" r="28" fill="#64748b" stroke="#94a3b8" strokeWidth="2" />
                              <text x="100" y="104" textAnchor="middle" fill="#f8fafc" fontSize="10" fontWeight="bold">FRP</text>

                              {FIBER_COLOR_STANDARDS.map((color, idx) => {
                                const angle = (idx * (360 / 12) - 90) * (Math.PI / 180);
                                const radius = 54;
                                const cx = 100 + radius * Math.cos(angle);
                                const cy = 100 + radius * Math.sin(angle);
                                const isSYMC = idx < 6;
                                return (
                                  <g key={idx}>
                                    <circle 
                                      cx={cx} 
                                      cy={cy} 
                                      r="15" 
                                      fill={color.hex} 
                                      stroke={isSYMC ? '#ec4899' : '#0038b8'} 
                                      strokeWidth="2.5" 
                                    />
                                    <text 
                                      x={cx} 
                                      y={cy + 3.5} 
                                      textAnchor="middle" 
                                      fill={color.hex === '#f8fafc' || color.hex === '#eab308' ? '#0f172a' : '#ffffff'} 
                                      fontSize="10" 
                                      fontWeight="bold"
                                    >
                                      {color.no}
                                    </text>
                                  </g>
                                );
                              })}
                            </svg>
                          </div>

                          <div className="flex items-center gap-4 text-[11px] font-bold mt-2 flex-wrap">
                            {participatingOwners.map(owner => (
                              <span key={owner} className="flex items-center gap-1.5" style={{ color: owner === 'SYMC' ? '#f472b6' : owner === 'UIH' ? '#38bdf8' : '#fbbf24' }}>
                                <OwnerLogo owner={owner} size="xs" /> ({owner === 'SYMC' ? 'Tubes 1-6 : 72 Core' : owner === 'UIH' ? 'Tubes 7-12 : 72 Core' : 'Assigned Tubes'})
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* Enclosure Tray Internal Diagram */}
                        <div className="p-4 bg-slate-950/90 rounded-xl border border-slate-800 flex flex-col justify-between">
                          <div>
                            <p className="text-xs font-black text-slate-200 mb-2">Enclosure 312 Core : Tray Configuration</p>
                            <p className="text-[11px] text-slate-400 mb-3">การจัดสรรถาดสไปรซ์ (Splice Trays) สำหรับ Enclosure ทั้ง {sldEnclosures.length} หัว</p>
                          </div>
                          <div className="space-y-2 text-xs font-bold">
                            {participatingOwners.map((owner, idx) => (
                              <div key={owner} className="p-2.5 rounded-lg border flex items-center justify-between" style={{
                                backgroundColor: owner === 'SYMC' ? 'rgba(236,72,153,0.15)' : owner === 'UIH' ? 'rgba(14,165,233,0.15)' : 'rgba(245,158,11,0.15)',
                                borderColor: owner === 'SYMC' ? 'rgba(236,72,153,0.3)' : owner === 'UIH' ? 'rgba(14,165,233,0.3)' : 'rgba(245,158,11,0.3)',
                                color: owner === 'SYMC' ? '#f472b6' : owner === 'UIH' ? '#38bdf8' : '#fbbf24'
                              }}>
                                <span className="flex items-center gap-1.5">
                                  <OwnerLogo owner={owner} size="xs" />
                                  <span>{owner === 'SYMC' ? 'Tray 1 - 3 (Dedicated)' : owner === 'UIH' ? 'Tray 4 - 6 (Dedicated)' : `Tray ${idx * 3 + 1} - ${idx * 3 + 3}`}</span>
                                </span>
                                <span className="font-mono">72 Splice Cores</span>
                              </div>
                            ))}
                            <div className="p-2.5 rounded-lg bg-slate-800/80 border border-slate-700 flex items-center justify-between text-slate-400">
                              <span>Tray 7 (Spare / Future Expansion)</span>
                              <span className="font-mono">Spare Capacity</span>
                            </div>
                          </div>
                          <div className="text-[10px] text-slate-500 mt-2 text-center">
                            * ผ่านเกณฑ์มาตรฐานการติดตั้งเคเบิลร่วมกันตามข้อกำหนดวิศวกรรม
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* SLIDE 6: INSTALLATION SUMMARY & 2-LEVEL APPROVAL */}
                  {currentSlide === 6 && (
                    <div className="space-y-4">
                      
                      {/* Installation Scope Overview */}
                      <div className="p-3.5 bg-slate-950/90 rounded-xl border border-slate-800 text-xs text-slate-300 leading-relaxed">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-2 mb-2 font-bold">
                          <span className="text-sky-400 font-extrabold">{project.name}</span>
                          <span>ผู้รับจ้างที่ดำเนินการติดตั้ง: <strong className="text-white">{designApproval?.contractorName || 'United Telecommunication Services Co., Ltd.'}</strong></span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
                          <div>1. ระยะเคเบิลที่ต้องใช้ร่วมกัน: <strong className="text-white">144 Core ({totalLengthKm} km.)</strong></div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span>2. การแบ่ง Core:</span>
                            {participatingOwners.map((owner, idx) => (
                              <React.Fragment key={owner}>
                                {idx > 0 && <span>;</span>}
                                <span className="inline-flex items-center gap-1" style={{ color: owner === 'SYMC' ? '#f472b6' : owner === 'UIH' ? '#38bdf8' : '#fbbf24' }}>
                                  <OwnerLogo owner={owner} size="xs" /> {owner === 'SYMC' ? primaryRoute.symcCores : owner === 'UIH' ? primaryRoute.uihCores : (primaryRoute.itelCores || 0)}
                                </span>
                              </React.Fragment>
                            ))}
                          </div>
                          <div>3. ต้องใช้ Enclosure: <strong className="text-amber-400">312 Core ({sldEnclosures.length} หัว)</strong></div>
                        </div>
                        <p className="mt-2 text-center text-xs font-black text-sky-300 bg-sky-500/10 py-1 rounded-lg border border-sky-500/20">
                          "โดยมีมติสรุปเห็นชอบร่วมกับดำเนินการ ตามรายละเอียดดังกล่าวข้างต้น"
                        </p>
                      </div>

                      {/* 2-Level Approval Signing Cards */}
                      <div className="space-y-4">
                        
                        {/* LEVEL 1: PLANNING TEAM APPROVAL */}
                        <div className="p-3.5 bg-slate-950/80 rounded-xl border border-amber-500/30 space-y-2.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="w-5 h-5 rounded-full bg-amber-500 text-slate-950 flex items-center justify-center font-black text-[10px]">1</span>
                              <span className="text-xs font-black text-amber-300 uppercase tracking-wide">
                                ระดับที่ 1: ผู้อนุมัติทีม Planning (Planning Team Approval)
                              </span>
                            </div>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                              isPlanningComplete ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                            }`}>
                              {isPlanningComplete ? '✓ Planning อนุมัติครบทุก Owner แล้ว' : 'รอลงนามระดับ Planning'}
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {participatingOwners.map(owner => {
                              const signOff = planningSignOffs[owner];
                              const isSigned = signOff && signOff.status === 'Approved';
                              const canSign = canUserSign(owner, 'Planning');

                              return (
                                <div key={owner} className={`p-3 rounded-xl border flex flex-col justify-between min-h-[140px] ${
                                  isSigned 
                                    ? 'bg-emerald-950/30 border-emerald-500/40' 
                                    : 'bg-slate-900/90 border-slate-700/80'
                                }`}>
                                  <div>
                                    <div className="flex items-center justify-between gap-1 mb-1.5">
                                      <div className="flex items-center gap-1.5">
                                        <OwnerLogo owner={owner} size="xs" />
                                        <span className="text-[11px] font-black text-slate-300">Planning</span>
                                      </div>
                                      <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded ${
                                        isSigned ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-400'
                                      }`}>
                                        {isSigned ? 'Approved' : 'Pending'}
                                      </span>
                                    </div>

                                    {isSigned ? (
                                      <div className="space-y-1">
                                        {signOff.signatureDataUrl && (
                                          <img src={signOff.signatureDataUrl} alt="signature" className="h-9 object-contain bg-white/90 rounded p-0.5" />
                                        )}
                                        <p className="text-[11px] font-bold text-white truncate">{signOff.signedBy}</p>
                                        <p className="text-[10px] text-slate-400 truncate">{signOff.position || 'Planning Engineer'}</p>
                                        <p className="text-[9px] text-slate-500">{new Date(signOff.signedAt || '').toLocaleDateString('th-TH')}</p>
                                      </div>
                                    ) : (
                                      <div className="py-3 text-center text-slate-500 text-[11px]">
                                        รอทีม Planning ลงนาม
                                      </div>
                                    )}
                                  </div>

                                  {!isSigned && canSign && (
                                    <button
                                      onClick={() => handleOpenSignModal(owner, 'Planning')}
                                      className="mt-2 w-full py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded-lg flex items-center justify-center gap-1.5 transition-all shadow"
                                    >
                                      <PenTool size={12} />
                                      <span>ลงนาม Planning ({owner})</span>
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* LEVEL 2: O&M MANAGEMENT APPROVAL */}
                        <div className={`p-3.5 rounded-xl border space-y-2.5 transition-all ${
                          !isPlanningComplete 
                            ? 'bg-slate-950/40 border-slate-800 opacity-60' 
                            : 'bg-slate-950/80 border-sky-500/40'
                        }`}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className={`w-5 h-5 rounded-full flex items-center justify-center font-black text-[10px] ${
                                !isPlanningComplete ? 'bg-slate-700 text-slate-400' : 'bg-sky-500 text-slate-950'
                              }`}>
                                {!isPlanningComplete ? <Lock size={10} /> : '2'}
                              </span>
                              <span className="text-xs font-black text-sky-300 uppercase tracking-wide">
                                ระดับที่ 2: ผู้อนุมัติทีม O&M (Management Approval)
                              </span>
                            </div>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                              !isPlanningComplete ? 'bg-slate-800 text-slate-500 border-slate-700' :
                              isOMComplete ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                            }`}>
                              {!isPlanningComplete ? 'ล็อค (รอ Planning อนุมัติครบก่อน)' :
                               isOMComplete ? '✓ อนุมัติสมบูรณ์แล้ว' : 'รอลงนามระดับ O&M'}
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {participatingOwners.map(owner => {
                              const signOff = omSignOffs[owner];
                              const isSigned = signOff && signOff.status === 'Approved';
                              const canSign = canUserSign(owner, 'OM');

                              return (
                                <div key={owner} className={`p-3 rounded-xl border flex flex-col justify-between min-h-[140px] ${
                                  isSigned 
                                    ? 'bg-emerald-950/30 border-emerald-500/40' 
                                    : 'bg-slate-900/90 border-slate-700/80'
                                }`}>
                                  <div>
                                    <div className="flex items-center justify-between gap-1 mb-1.5">
                                      <div className="flex items-center gap-1.5">
                                        <OwnerLogo owner={owner} size="xs" />
                                        <span className="text-[11px] font-black text-slate-300">O&M</span>
                                      </div>
                                      <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded ${
                                        isSigned ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-400'
                                      }`}>
                                        {isSigned ? 'Approved' : 'Pending'}
                                      </span>
                                    </div>

                                    {isSigned ? (
                                      <div className="space-y-1">
                                        {signOff.signatureDataUrl && (
                                          <img src={signOff.signatureDataUrl} alt="signature" className="h-9 object-contain bg-white/90 rounded p-0.5" />
                                        )}
                                        <p className="text-[11px] font-bold text-white truncate">{signOff.signedBy}</p>
                                        <p className="text-[10px] text-slate-400 truncate">{signOff.position || 'O&M Director'}</p>
                                        <p className="text-[9px] text-slate-500">{new Date(signOff.signedAt || '').toLocaleDateString('th-TH')}</p>
                                      </div>
                                    ) : (
                                      <div className="py-3 text-center text-slate-500 text-[11px]">
                                        {!isPlanningComplete ? 'รอระดับ Planning อนุมัติครบ' : `รอผู้บริหาร O&M ลงนาม`}
                                      </div>
                                    )}
                                  </div>

                                  {isPlanningComplete && !isSigned && canSign && (
                                    <button
                                      onClick={() => handleOpenSignModal(owner, 'OM')}
                                      className="mt-2 w-full py-1.5 bg-sky-500 hover:bg-sky-400 text-slate-950 font-black text-xs rounded-lg flex items-center justify-center gap-1.5 transition-all shadow"
                                    >
                                      <PenTool size={12} />
                                      <span>ลงนาม O&M ({owner})</span>
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>

                      </div>
                    </div>
                  )}

                </div>

                {/* Slide Navigation Footer Bar */}
                <div className="pt-4 border-t border-slate-800 flex items-center justify-between gap-3 shrink-0 relative z-10">
                  <button
                    onClick={() => setCurrentSlide(prev => Math.max(1, prev - 1))}
                    disabled={currentSlide === 1}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:pointer-events-none text-slate-200 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all"
                  >
                    <ChevronLeft size={15} />
                    <span>ก่อนหน้า</span>
                  </button>

                  {/* Slide Dots / Thumbnails */}
                  <div className="flex items-center gap-1.5">
                    {Array.from({ length: totalSlides }).map((_, idx) => {
                      const sNum = idx + 1;
                      return (
                        <button
                          key={sNum}
                          onClick={() => setCurrentSlide(sNum)}
                          className={`w-7 h-7 rounded-lg text-xs font-black transition-all ${
                            currentSlide === sNum 
                              ? 'bg-sky-500 text-white shadow-md shadow-sky-500/20' 
                              : 'bg-slate-800/80 text-slate-400 hover:text-white hover:bg-slate-700'
                          }`}
                        >
                          {sNum}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    onClick={() => setCurrentSlide(prev => Math.min(totalSlides, prev + 1))}
                    disabled={currentSlide === totalSlides}
                    className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 disabled:opacity-30 disabled:pointer-events-none text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all shadow-md shadow-sky-600/20"
                  >
                    <span>ถัดไป</span>
                    <ChevronRight size={15} />
                  </button>
                </div>

              </div>
            </div>
          )}

          {/* VIEW MODE 2: CONTINUOUS FULL DOCUMENT */}
          {viewMode === 'document' && (
            <div className="max-w-4xl mx-auto space-y-6">
              
              {/* Cover Summary Banner with Owner Logos */}
              <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3 mb-2 flex-wrap">
                    {participatingOwners.map((owner, idx) => (
                      <React.Fragment key={owner}>
                        {idx > 0 && <span className="text-slate-600">&bull;</span>}
                        <OwnerLogo owner={owner} size="sm" />
                      </React.Fragment>
                    ))}
                  </div>
                  <h3 className="text-xl font-extrabold text-white">{project.name}</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Fiber Infra Sharing Official Approval Memorandum</p>
                </div>
                <div className="text-right">
                  <span className="text-xs font-mono text-slate-400">Doc: {designApproval?.documentNumber || `APP-2026-${projectTierName.replace('Tier ', 'T')}-01`}</span>
                  <div className="text-xs font-bold text-emerald-400 mt-1">Total {sldEnclosures.length} Enclosures &bull; {totalLengthKm} km</div>
                </div>
              </div>

              {/* Enclosure Schedule */}
              <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-4">
                <h4 className="text-sm font-extrabold text-white flex items-center gap-2">
                  <Box size={16} className="text-sky-400" />
                  <span>ตารางตำแหน่งและรายละเอียด Enclosure</span>
                </h4>
                <div className="border border-slate-800 rounded-xl overflow-x-auto">
                  <table className="w-full text-xs text-center border-collapse min-w-[700px]">
                    <thead className="bg-slate-800/80 text-slate-300 font-bold border-b border-slate-700">
                      <tr>
                        <th className="p-2 border-r border-slate-700">No.</th>
                        <th className="p-2 border-r border-slate-700">BJ# No</th>
                        <th className="p-2 border-r border-slate-700 text-left">BJ# Name</th>
                        <th className="p-2 border-r border-slate-700">Lat. / Long.</th>
                        <th className="p-2 border-r border-slate-700">Enclosure</th>
                        {participatingOwners.map(owner => (
                          <th key={owner} className="p-2 border-r border-slate-700 min-w-[120px]">
                            <div className="flex items-center justify-center gap-1">
                              <OwnerLogo owner={owner} size="xs" />
                              <span>Tray</span>
                            </div>
                          </th>
                        ))}
                        <th className="p-2">ตำแหน่ง</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 text-slate-300">
                      {sldEnclosures.map((enc, idx) => (
                        <tr key={enc.id || idx} className="hover:bg-slate-800/30">
                          <td className="p-2 border-r border-slate-800">{idx + 1}</td>
                          <td className="p-2 border-r border-slate-800 font-bold text-sky-400">BJ#{String(idx + 1).padStart(2, '0')}</td>
                          <td className="p-2 border-r border-slate-800 text-left font-bold text-white">{enc.name}</td>
                          <td className="p-2 border-r border-slate-800 font-mono text-[11px] text-slate-400">{enc.position?.lat?.toFixed(5)}, {enc.position?.lng?.toFixed(5)}</td>
                          <td className="p-2 border-r border-slate-800">312 Core</td>
                          {participatingOwners.map(owner => (
                            <td key={owner} className="p-2 border-r border-slate-800 font-bold" style={{ color: owner === 'SYMC' ? '#f472b6' : owner === 'UIH' ? '#38bdf8' : '#fbbf24' }}>
                              {owner === 'SYMC' ? '1-3' : owner === 'UIH' ? '4-6' : '-'}
                            </td>
                          ))}
                          <td className="p-2 font-bold">{enc.locationType || 'PB#'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 2-Level Signature Matrix in Full Document */}
              <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-6">
                <h4 className="text-sm font-extrabold text-white flex items-center gap-2">
                  <ShieldCheck size={16} className="text-emerald-400" />
                  <span>บันทึกการลงนามอนุมัติ (2 ระดับ: Planning & O&M)</span>
                </h4>

                {/* Level 1: Planning */}
                <div className="space-y-3">
                  <p className="text-xs font-black text-amber-400 uppercase tracking-wide">
                    ระดับที่ 1: ผู้อนุมัติทีม Planning
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {participatingOwners.map(o => {
                      const s = planningSignOffs[o];
                      return (
                        <div key={o} className="p-4 bg-slate-950 border border-slate-800 rounded-xl text-center space-y-2">
                          <div className="flex items-center justify-center gap-2 mb-1">
                            <OwnerLogo owner={o} size="xs" />
                            <span className="text-xs font-extrabold text-slate-200">(Planning)</span>
                          </div>
                          {s?.signatureDataUrl ? (
                            <img src={s.signatureDataUrl} alt="sig" className="h-12 object-contain mx-auto bg-white/95 rounded p-1" />
                          ) : (
                            <div className="h-12 flex items-center justify-center text-xs text-slate-500 border border-dashed border-slate-800 rounded">ยังไม่ได้ลงนาม</div>
                          )}
                          <p className="text-xs font-bold text-white">{s?.signedBy || '........................................'}</p>
                          <p className="text-[10px] text-slate-400">{s?.signedAt ? new Date(s.signedAt).toLocaleDateString('th-TH') : 'วันที่: ....................................'}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Level 2: O&M */}
                <div className="space-y-3 pt-2 border-t border-slate-800">
                  <p className="text-xs font-black text-sky-400 uppercase tracking-wide">
                    ระดับที่ 2: ผู้อนุมัติทีม O&M (Management)
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {participatingOwners.map(o => {
                      const s = omSignOffs[o];
                      return (
                        <div key={o} className="p-4 bg-slate-950 border border-slate-800 rounded-xl text-center space-y-2">
                          <div className="flex items-center justify-center gap-2 mb-1">
                            <OwnerLogo owner={o} size="xs" />
                            <span className="text-xs font-extrabold text-slate-200">(O&M Management)</span>
                          </div>
                          {s?.signatureDataUrl ? (
                            <img src={s.signatureDataUrl} alt="sig" className="h-12 object-contain mx-auto bg-white/95 rounded p-1" />
                          ) : (
                            <div className="h-12 flex items-center justify-center text-xs text-slate-500 border border-dashed border-slate-800 rounded">ยังไม่ได้ลงนาม</div>
                          )}
                          <p className="text-xs font-bold text-white">{s?.signedBy || '........................................'}</p>
                          <p className="text-[10px] text-slate-400">{s?.signedAt ? new Date(s.signedAt).toLocaleDateString('th-TH') : 'วันที่: ....................................'}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>

              </div>

            </div>
          )}

          {/* VIEW MODE 3: REQUEST FORM */}
          {viewMode === 'request' && (
            <div className="max-w-2xl mx-auto p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-5">
              <div className="border-b border-slate-800 pb-4">
                <h3 className="text-base font-extrabold text-white font-display">ยื่นคำขออนุมัติแบบโครงการใหม่ (2-Level Approval)</h3>
                <p className="text-xs text-slate-400 mt-1">ระบบจะส่งเอกสารให้ทีม Planning ของแต่ละ Owner อนุมัติในระดับที่ 1 ก่อน แล้วจึงส่งต่อไปยังระดับ O&M</p>
              </div>

              {actionError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-center gap-2">
                  <AlertTriangle size={15} />
                  <span>{actionError}</span>
                </div>
              )}

              <div className="space-y-4 text-xs">
                <div>
                  <label className="block font-bold text-slate-300 mb-1">ชื่อผู้รับจ้างที่ดำเนินการติดตั้ง (Contractor)</label>
                  <input
                    type="text"
                    value={contractorInput}
                    onChange={e => setContractorInput(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 p-2.5 rounded-xl text-white outline-none focus:border-sky-500"
                    placeholder="เช่น United Telecommunication Services Co., Ltd."
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-300 mb-1">ระยะดำเนินการเคเบิล (Total km)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={operationKmInput}
                    onChange={e => setOperationKmInput(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 p-2.5 rounded-xl text-white outline-none focus:border-sky-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-300 mb-1">บันทึกหรือข้อความประกอบการยื่นขออนุมัติ</label>
                  <textarea
                    rows={3}
                    value={requestNotes}
                    onChange={e => setRequestNotes(e.target.value)}
                    placeholder="ระบุข้อกำหนดหรือหมายเหตุสำคัญสำหรับการก่อสร้าง..."
                    className="w-full bg-slate-950 border border-slate-700 p-2.5 rounded-xl text-white outline-none focus:border-sky-500"
                  />
                </div>

                <div className="pt-2">
                  <button
                    onClick={handleSubmitApprovalRequest}
                    disabled={isSubmitting}
                    className="w-full py-3 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-extrabold rounded-xl shadow-lg shadow-sky-500/20 flex items-center justify-center gap-2 transition-all"
                  >
                    {isSubmitting ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
                    <span>ส่งคำขออนุมัติแบบ (เริ่มระดับที่ 1: Planning)</span>
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>

      </div>

      {/* SIGNING MODAL POPUP */}
      {signingModalOpen && signingTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-950/80 backdrop-blur-md">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg p-6 space-y-4 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-slate-950 font-black text-xs ${
                  signingTarget.level === 'Planning' ? 'bg-amber-500' : 'bg-sky-500'
                }`}>
                  {signingTarget.level === 'Planning' ? '1' : '2'}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-extrabold text-white">ลงนามอนุมัติ :</h3>
                    <OwnerLogo owner={signingTarget.owner} size="xs" />
                    <span className="text-xs text-sky-400 font-bold">({signingTarget.level === 'Planning' ? 'ระดับ Planning' : 'ระดับ O&M'})</span>
                  </div>
                  <p className="text-[10px] text-slate-400">ลายเซ็นอิเล็กทรอนิกส์พร้อมบันทึกลงระบบ</p>
                </div>
              </div>
              <button onClick={() => setSigningModalOpen(false)} className="text-slate-400 hover:text-white">
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-300 mb-1">ชื่อ-นามสกุล ผู้ลงนาม</label>
                <input
                  type="text"
                  value={signerName}
                  onChange={e => setSignerName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 p-2.5 rounded-xl text-white outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-300 mb-1">ตำแหน่ง</label>
                <input
                  type="text"
                  value={signerPosition}
                  onChange={e => setSignerPosition(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 p-2.5 rounded-xl text-white outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-bold text-slate-300">วาดลายเซ็น (Digital Signature)</label>
                  <button onClick={clearSignature} className="text-[10px] text-slate-400 hover:text-amber-400">
                    ล้างลายเซ็น
                  </button>
                </div>
                <div className="border-2 border-dashed border-slate-700 rounded-xl bg-white overflow-hidden touch-none">
                  <canvas
                    ref={canvasRef}
                    width={440}
                    height={120}
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                    className="w-full h-28 cursor-crosshair"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-300 mb-1">ความเห็น / มติการอนุมัติ</label>
                <textarea
                  rows={2}
                  value={signerComment}
                  onChange={e => setSignerComment(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 p-2 rounded-xl text-white outline-none focus:border-sky-500"
                />
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={() => handleConfirmSignature(true)}
                  disabled={isSubmitting}
                  className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold rounded-xl flex items-center justify-center gap-1.5 transition-all shadow"
                >
                  <CheckCircle2 size={15} />
                  <span>อนุมัติ (Approve)</span>
                </button>
                <button
                  onClick={() => handleConfirmSignature(false)}
                  disabled={isSubmitting}
                  className="px-4 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all"
                >
                  <XCircle size={15} />
                  <span>ไม่อนุมัติ / ขอแก้ไข</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

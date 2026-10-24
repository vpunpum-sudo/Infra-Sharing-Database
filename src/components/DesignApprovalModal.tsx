import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useConfirm } from './ConfirmModal';
import { ApprovalHistoryEntry } from './ApprovalHistoryEntry';
import { canSignAsOwner } from '../utils/approvalQueue';
import { 
  Project, User as AppUser, CoreOwner, DesignApproval, 
  OwnerSignOff, ProjectStatus, Route, FiberEnclosure, 
  FiberLoop, EnclosureType, FiberType, ApprovalStage, FiberColorConfig 
} from '../types';
import { doc, setDoc, updateDoc, deleteField, collection, onSnapshot, getDocFromServer } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { logActivity } from '../services/logService';
import { 
  CheckCircle2, XCircle, Clock, FileText,
  Send, PenTool, X, Download, AlertTriangle, 
  Layers, Box, Cable, MapPin, Check, ChevronRight, 
  RotateCcw, Sparkles, Network, Compass, ShieldAlert,
  HelpCircle, ChevronDown, ChevronUp, Loader2, Share2,
  Cpu, Radio, Eye, Map as MapIcon, GitCommit, Maximize2, Image,
  ChevronLeft, Users, Building, ArrowRight, Lock, CheckCheck,
  Presentation, FileCheck, Info, FileSpreadsheet, Navigation,
  Edit3, Save, Phone, Briefcase, Calendar
} from 'lucide-react';
import { OwnerLogo } from './OwnerLogo';
import { getEffectiveOwnerLogo } from '../services/ownerLogosService';
import { getClosestPointOnRoute } from '../utils/geo';
import { renderPrintableProjectMap } from '../utils/printProjectMap';
import { normalizePrintLogo } from '../utils/printLogo';
import { getApprovalAllocation } from '../utils/approvalAllocation';
import { createFiberLoopIcon } from '../utils/fiberLoopIcon';
import { createApprovalPdf, exportApprovalPdf } from '../utils/exportApprovalPdf';
import { buildProjectKmz } from '../utils/kmz';
import { exportFileName } from '../utils/kml';
import { ensureProjectFolder, uploadProjectFile } from '../utils/projectFileUpload';
import { buildApprovalDocumentNumber } from '../utils/approvalDocumentNumber';
import { createLatestRequestGuard, SignatureImageError } from '../utils/signatureImage';
import { processSignatureFile, type ProcessedSignature } from '../utils/signatureImageBrowser';
import { motion, AnimatePresence } from 'motion/react';
import { MapContainer, TileLayer, Polyline, CircleMarker, Marker, Popup, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useRolePermissions } from '../services/rolePermissionsStore';
import type { ApprovalSnapshotCollections } from '../types';
import { backfillCommitMessage, backfillFailureMessage, backfillLockedAt, buildApprovalSnapshot, chooseApprovalSource,
  classifyBackfillFailure, firestoreErrorCode, formatBackfillNotice, getParticipatingOwners, isBackfilledApproval,
  nextApprovalId, nextSnapshotId, projectForDocument, rejectionReasonPatch, resolveApprovalFormValues, resolveBackfillLocker,
  sourceReadiness, ApprovalStateChangedError, type ApprovalSnapshot, type BackfillExpected, type ExpectedApprovalState,
  type SnapshotSourceStatus } from '../utils/approvalSnapshot';
import { attachApprovalSnapshot, backfillApprovalSnapshot, readApprovalSnapshot, readBackfillLockerProfile,
  rereadProjectForBackfill, writeApprovalSnapshot } from '../services/approvalSnapshotService';

interface DesignApprovalModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project;
  appUser: AppUser | null;
  routes?: Route[];
  enclosures?: FiberEnclosure[];
  onProjectUpdated?: (updatedProject: Project) => void;
}

const escapePrintText = (value: string) => value.replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[char] || char);

function getTrimmedSignatureDataUrl(canvas: HTMLCanvasElement): string {
  const context = canvas.getContext('2d');
  if (!context) return canvas.toDataURL('image/png');

  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let left = canvas.width;
  let top = canvas.height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const offset = (y * canvas.width + x) * 4;
      if (pixels[offset + 3] < 16 || (pixels[offset] > 245 && pixels[offset + 1] > 245 && pixels[offset + 2] > 245)) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  if (right < left || bottom < top) return canvas.toDataURL('image/png');

  const padding = 8;
  const width = right - left + 1;
  const height = bottom - top + 1;
  const trimmed = document.createElement('canvas');
  trimmed.width = width + padding * 2;
  trimmed.height = height + padding * 2;
  const trimmedContext = trimmed.getContext('2d');
  if (!trimmedContext) return canvas.toDataURL('image/png');
  trimmedContext.drawImage(canvas, left, top, width, height, padding, padding, width, height);
  return trimmed.toDataURL('image/png');
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
  const rolePermissions = useRolePermissions();
  const permissions = appUser ? rolePermissions[appUser.role] : rolePermissions['Viewer'];

  // Modal View State: presentation and the approval request form
  const [viewMode, setViewMode] = useState<'slides' | 'request'>('slides');
  const [previewLive, setPreviewLive] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(1);
  const totalSlides = 6;

  // Signing dialog states
  const [signingModalOpen, setSigningModalOpen] = useState(false);
  const [signingTarget, setSigningTarget] = useState<{ owner: CoreOwner; level: 'Planning' | 'OM' } | null>(null);
  const [signerName, setSignerName] = useState('');
  const [signerPosition, setSignerPosition] = useState('');
  const [signerComment, setSignerComment] = useState('Approved design layout according to fiber infra sharing specifications.');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [committedLock, setCommittedLock] = useState<{ approvalId: string; snapshotId: string } | null>(null);
  const [lockerProfile, setLockerProfile] = useState<{ id?: string; displayName?: string } | null>(null);
  useEffect(() => {
    setCommittedLock(null);
    setActionNotice(null);
  }, [project.id, project.designApproval?.id]);
  const [exportSuccess, setExportSuccess] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  // Signed PDF + KMZ for the completion email, made once the last sign-off lands.
  const [pendingFinalDocuments, setPendingFinalDocuments] = useState(false);
  const [finalDocumentsState, setFinalDocumentsState] = useState<'idle' | 'working' | 'error'>('idle');
  const [exportError, setExportError] = useState<string | null>(null);

  // Loaded subcollections from Firestore
  const [loadedRoutes, setLoadedRoutes] = useState<Route[]>(propRoutes);
  const [loadedEnclosures, setLoadedEnclosures] = useState<FiberEnclosure[]>(propEnclosures);
  const [loadedLoops, setLoadedLoops] = useState<FiberLoop[]>([]);
  const [enclosureTypes, setEnclosureTypes] = useState<EnclosureType[]>([]);
  const [fiberTypes, setFiberTypes] = useState<FiberType[]>([]);
  const [fiberColorConfigs, setFiberColorConfigs] = useState<FiberColorConfig[]>([]);
  const [sourceStatus, setSourceStatus] = useState<SnapshotSourceStatus>({
    routes: { loaded: false }, enclosures: { loaded: false }, loops: { loaded: false },
    enclosureTypes: { loaded: false }, fiberTypes: { loaded: false }, fiberColorConfigs: { loaded: false }
  });
  const [sourceProjectId, setSourceProjectId] = useState<string | null>(null);
  const [snapshotState, setSnapshotState] = useState<{ id?: string; data?: ApprovalSnapshot; error?: string }>({});
  const readiness = sourceProjectId === project.id ? sourceReadiness(sourceStatus)
    : { ready: false, loading: true, errorSource: undefined };
  const isLoadingData = readiness.loading;
  const sourceError = readiness.errorSource ? [readiness.errorSource, sourceStatus[readiness.errorSource]] as const : undefined;

  // Request form state
  const formValues = resolveApprovalFormValues(project);
  const [requestNotes, setRequestNotes] = useState(formValues.designNotes);
  const [mapLabelMode, setMapLabelMode] = useState<'all' | 'hover' | 'code'>('hover');
  const [contractorInput, setContractorInput] = useState(formValues.contractorName);
  const [contractorContactInput, setContractorContactInput] = useState(formValues.contractorContact);
  const [contractorPhoneInput, setContractorPhoneInput] = useState(formValues.contractorPhone);
  const [contractorPoInput, setContractorPoInput] = useState(formValues.contractorPoNumber);
  const [contractorScopeInput, setContractorScopeInput] = useState(formValues.contractorScope);
  const [isEditingContractor, setIsEditingContractor] = useState(false);
  const [isSavingContractor, setIsSavingContractor] = useState(false);
  const [contractorSaveSuccess, setContractorSaveSuccess] = useState(false);
  const [contractorSaveError, setContractorSaveError] = useState<string | null>(null);
  const [operationKmInput, setOperationKmInput] = useState(formValues.totalOperationDistanceKm?.toString() || '');
  const [rewindTarget, setRewindTarget] = useState<'Draft' | 'Planning' | 'OM'>('Draft');
  const [targetInstallDate, setTargetInstallDate] = useState(formValues.estimatedInstallationDate);
  const pendingDraftWrites = useRef<Set<Promise<void>>>(new Set());
  const draftWriteError = useRef<Error | null>(null);
  const saveDraftField = (key: keyof NonNullable<Project['approvalDraft']>, value: string | number) => {
    if (project.designApproval && project.designApproval.status !== 'Rejected') return;
    draftWriteError.current = null;
    const write = updateDoc(doc(db, `projects/${project.id}`), { [`approvalDraft.${key}`]: value });
    pendingDraftWrites.current.add(write);
    write.catch(error => {
      draftWriteError.current = error instanceof Error ? error : new Error(String(error));
      setActionError(`บันทึกข้อมูลคำขอไม่สำเร็จ: ${draftWriteError.current.message}`);
    }).finally(() => pendingDraftWrites.current.delete(write));
  };

  // What the slide shows is what the PDF prints: both read the form values,
  // which follow the saved approval (or draft). Empty fields show "-".
  const historicalContractor = project.designApproval &&
    !(previewLive && project.designApproval.status === 'Rejected') && viewMode === 'slides' ? project.designApproval : null;
  const contractorView = {
    name: historicalContractor ? historicalContractor.contractorName?.trim() || '-' : contractorInput.trim() || '-',
    contact: historicalContractor ? historicalContractor.contractorContact?.trim() || '-' : contractorContactInput.trim() || '-',
    phone: historicalContractor ? historicalContractor.contractorPhone?.trim() || '-' : contractorPhoneInput.trim() || '-',
    po: historicalContractor ? historicalContractor.contractorPoNumber?.trim() || '-' : contractorPoInput.trim() || '-',
    scope: historicalContractor ? historicalContractor.contractorScope?.trim() || '' : contractorScopeInput.trim(),
    installDate: historicalContractor ? historicalContractor.estimatedInstallationDate || '-' : targetInstallDate || '-'
  };

  // A partial draft update must not reset another field the user is still editing.
  const previousFormValues = useRef({ projectId: project.id, values: formValues });
  useEffect(() => {
    const prior = previousFormValues.current;
    const reset = prior.projectId !== project.id;
    if (reset || prior.values.designNotes !== formValues.designNotes) setRequestNotes(formValues.designNotes);
    if (reset || prior.values.contractorName !== formValues.contractorName) setContractorInput(formValues.contractorName);
    if (reset || prior.values.contractorContact !== formValues.contractorContact) setContractorContactInput(formValues.contractorContact);
    if (reset || prior.values.contractorPhone !== formValues.contractorPhone) setContractorPhoneInput(formValues.contractorPhone);
    if (reset || prior.values.contractorPoNumber !== formValues.contractorPoNumber) setContractorPoInput(formValues.contractorPoNumber);
    if (reset || prior.values.contractorScope !== formValues.contractorScope) setContractorScopeInput(formValues.contractorScope);
    if (reset || prior.values.totalOperationDistanceKm !== formValues.totalOperationDistanceKm)
      setOperationKmInput(formValues.totalOperationDistanceKm?.toString() || '');
    if (reset || prior.values.estimatedInstallationDate !== formValues.estimatedInstallationDate)
      setTargetInstallDate(formValues.estimatedInstallationDate);
    previousFormValues.current = { projectId: project.id, values: formValues };
  }, [project.id, formValues.designNotes, formValues.contractorName, formValues.contractorContact,
    formValues.contractorPhone, formValues.contractorPoNumber, formValues.contractorScope,
    formValues.totalOperationDistanceKm, formValues.estimatedInstallationDate]);

  // Signature Canvas
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [uploadedSignature, setUploadedSignature] = useState<ProcessedSignature | null>(null);
  const [isProcessingSignature, setIsProcessingSignature] = useState(false);
  const signatureUploadGuardRef = useRef(createLatestRequestGuard());
  const signatureFileRef = useRef<HTMLInputElement | null>(null);
  const [slide4SelectedRouteId, setSlide4SelectedRouteId] = useState<string>('all');
  const [slide5SelectedRouteId, setSlide5SelectedRouteId] = useState<string>('all');
  const [routeEnclosureSelections, setRouteEnclosureSelections] = useState<Record<string, string[]>>(formValues.routeEnclosureSelections);
  const [editingEnclosureRouteId, setEditingEnclosureRouteId] = useState<string | null>(null);
  const [previewingEnclosureImage, setPreviewingEnclosureImage] = useState<{ url: string; name: string } | null>(null);
  const [previewingFiberImage, setPreviewingFiberImage] = useState<{ url: string; name: string; cores: number } | null>(null);

  useEffect(() => {
    setRouteEnclosureSelections(resolveApprovalFormValues(project).routeEnclosureSelections);
  }, [project.id, project.designApproval?.status,
    project.designApproval?.routeEnclosureSelections, project.approvalDraft?.routeEnclosureSelections]);

  const handleToggleEnclosureForRoute = async (routeId: string, encId: string) => {
    if (project.designApproval?.status !== 'Rejected' && project.designApproval) return;
    const currentList = getRouteEnclosures(routeId).map(e => e.id);
    let nextList: string[];
    if (currentList.includes(encId)) {
      nextList = currentList.filter(id => id !== encId);
    } else {
      nextList = [...currentList, encId];
    }
    const updatedMap = {
      ...routeEnclosureSelections,
      [routeId]: nextList
    };
    setRouteEnclosureSelections(updatedMap);

    if (project?.id) {
      try {
        const updatedProject: Project = { ...project, approvalDraft: { ...project.approvalDraft, routeEnclosureSelections: updatedMap } };
        await setDoc(doc(db, `projects/${project.id}`), { approvalDraft: updatedProject.approvalDraft }, { merge: true });
        onProjectUpdated?.(updatedProject);
      } catch (err) {
        console.warn("Could not save routeEnclosureSelections:", err);
      }
    }
  };

  const handleResetEnclosuresForRoute = async (routeId: string) => {
    if (project.designApproval?.status !== 'Rejected' && project.designApproval) return;
    const updatedMap = { ...routeEnclosureSelections };
    delete updatedMap[routeId];
    setRouteEnclosureSelections(updatedMap);

    if (project?.id) {
      try {
        const updatedProject: Project = { ...project, approvalDraft: { ...project.approvalDraft, routeEnclosureSelections: updatedMap } };
        await setDoc(doc(db, `projects/${project.id}`), { approvalDraft: updatedProject.approvalDraft }, { merge: true });
        onProjectUpdated?.(updatedProject);
      } catch (err) {
        console.warn("Could not reset routeEnclosureSelections:", err);
      }
    }
  };
  useEffect(() => {
    if (!isOpen || !project?.id) return;
    const fresh = { loaded: false };
    setSourceStatus({ routes: fresh, enclosures: fresh, loops: fresh,
      enclosureTypes: fresh, fiberTypes: fresh, fiberColorConfigs: fresh });
    setSourceProjectId(project.id);
    const ready = (name: keyof ApprovalSnapshotCollections) =>
      setSourceStatus(previous => ({ ...previous, [name]: { loaded: true } }));
    const failed = (name: keyof ApprovalSnapshotCollections, error: Error) => {
      console.warn(`Could not load ${name} for approval:`, error);
      setSourceStatus(previous => ({ ...previous, [name]: { loaded: false, error: error.message } }));
    };

    const routesPath = `projects/${project.id}/routes`;
    const enclosuresPath = `projects/${project.id}/enclosures`;
    const loopsPath = `projects/${project.id}/loops`;

    const unsubRoutes = onSnapshot(collection(db, routesPath), (snapshot) => {
      const data = snapshot.docs.map(item => ({ ...item.data(), id: item.id } as Route));
      setLoadedRoutes(data);
      ready('routes');
    }, err => failed('routes', err));

    const unsubEnclosures = onSnapshot(collection(db, enclosuresPath), (snapshot) => {
      const data = snapshot.docs.map(item => ({ ...item.data(), id: item.id } as FiberEnclosure));
      setLoadedEnclosures(data);
      ready('enclosures');
    }, err => failed('enclosures', err));

    const unsubLoops = onSnapshot(collection(db, loopsPath), (snapshot) => {
      const data = snapshot.docs.map(item => ({ ...item.data(), id: item.id } as FiberLoop));
      setLoadedLoops(data);
      ready('loops');
    }, err => failed('loops', err));

    const unsubTypes = onSnapshot(collection(db, 'enclosureTypes'), (snapshot) => {
      setEnclosureTypes(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as EnclosureType)));
      ready('enclosureTypes');
    }, err => failed('enclosureTypes', err));

    const unsubFiberTypes = onSnapshot(collection(db, 'fiberTypes'), (snapshot) => {
      setFiberTypes(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as FiberType)));
      ready('fiberTypes');
    }, err => failed('fiberTypes', err));

    const unsubConfigs = onSnapshot(collection(db, 'fiberColorConfigs'), (snapshot) => {
      setFiberColorConfigs(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as FiberColorConfig)));
      ready('fiberColorConfigs');
    }, err => failed('fiberColorConfigs', err));

    return () => {
      unsubRoutes();
      unsubEnclosures();
      unsubLoops();
      unsubTypes();
      unsubFiberTypes();
      unsubConfigs();
    };
  }, [isOpen, project?.id]);

  useEffect(() => {
    const id = project.designApproval?.snapshotId;
    const approvalId = project.designApproval?.id;
    if (!isOpen || !id || !approvalId) { setSnapshotState({}); return; }
    let cancelled = false;
    setSnapshotState({ id });
    readApprovalSnapshot(project.id, id, approvalId).then(data => {
      if (!cancelled) setSnapshotState({ id, data });
    }).catch(error => {
      if (!cancelled) setSnapshotState({ id, error: error instanceof Error ? error.message : String(error) });
    });
    return () => { cancelled = true; };
  }, [isOpen, project.id, project.designApproval?.snapshotId, project.designApproval?.id]);

  useEffect(() => {
    const approval = project.designApproval;
    const uid = approval?.snapshotBackfilledByUid;
    setLockerProfile(null);
    if (!isOpen || !isBackfilledApproval(approval) || !uid) return;
    let cancelled = false;
    readBackfillLockerProfile(uid).then(profile => {
      if (!cancelled) setLockerProfile(profile);
    }).catch(() => { if (!cancelled) setLockerProfile(null); });
    return () => { cancelled = true; };
  }, [isOpen, project.designApproval?.id, project.designApproval?.snapshotId, project.designApproval?.snapshotBackfilledByUid]);

  const liveSource: ApprovalSnapshotCollections = {
    routes: loadedRoutes, enclosures: loadedEnclosures, loops: loadedLoops,
    enclosureTypes, fiberTypes, fiberColorConfigs
  };
  const viewedSnapshot = snapshotState.id === project.designApproval?.snapshotId ? snapshotState.data : undefined;
  const snapshotUnavailable = Boolean(project.designApproval?.snapshotId &&
    (!viewedSnapshot || (isBackfilledApproval(project.designApproval) && !backfillLockedAt(project.designApproval))));
  const documentSource = project.designApproval?.snapshotId
    ? viewedSnapshot?.collections : liveSource;
  const usingLivePreview = (previewLive || viewMode === 'request') && project.designApproval?.status === 'Rejected';
  const activeSource = usingLivePreview ? chooseApprovalSource(liveSource, project.designApproval, viewedSnapshot, true) : documentSource;
  const effectiveRoutes = activeSource?.routes || [];
  const effectiveEnclosures = activeSource?.enclosures || [];
  const effectiveLoops = activeSource?.loops || [];
  const documentProject = projectForDocument(project, viewedSnapshot);
  const activeProject = usingLivePreview ? project : documentProject;
  const activeEnclosureTypes = activeSource?.enclosureTypes || [];
  const activeFiberTypes = activeSource?.fiberTypes || [];
  const activeFiberColorConfigs = activeSource?.fiberColorConfigs || [];
  const hasApprovalDesign = effectiveRoutes.length > 0 && effectiveEnclosures.length > 0;

  // Participating / Authorized operators for this project (แสดงตาม authorized operators ที่กำหนดสิทธิ์ไว้ในโครงการ)
  const participatingOwners: CoreOwner[] = useMemo(() => {
    if (viewedSnapshot && !usingLivePreview) return [...viewedSnapshot.metadata.participatingOwners];
    return getParticipatingOwners(activeProject, effectiveRoutes);
  }, [activeProject.owners, activeProject.owner, effectiveRoutes, viewedSnapshot, usingLivePreview]);

  const designApproval = project.designApproval;
  const activeSelections = designApproval && !usingLivePreview
    ? designApproval.routeEnclosureSelections || {} : routeEnclosureSelections;

  // Derive approval stage and overall status
  const currentStage: ApprovalStage = designApproval?.approvalStage || (
    project.status === 'Approved' ? 'Completed' :
    project.status === 'Pending Approval' ? 'Planning' : 'Planning'
  );
  useEffect(() => setRewindTarget('Draft'), [currentStage, project.id]);

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

    return 'ยังไม่ได้กำหนด';
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
      return activeEnclosureTypes.find(et => et.id === enclosure.enclosureTypeId);
    }
    return activeEnclosureTypes.find(et => et.name?.toLowerCase() === enclosure.locationType?.toLowerCase());
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
  }, [effectiveEnclosures, activeEnclosureTypes]);

  const getRouteColor = (route: Route) => {
    const fiberType = route.fiberType || route.capacity.toString();
    const tier = route.tierSharing || route.tier || 'Tier 1';
    
    // Find matching color config
    const ft = activeFiberTypes.find(f => f.name === fiberType);
    if (ft) {
      const config = activeFiberColorConfigs.find(c => c.fiberTypeId === ft.id && c.tier === tier);
      if (config) return config.color;
      if (ft.color) return ft.color;
    }
    
    if (route.tierSharing === 'Tier 1' || route.tier === 'Tier 1') return '#3b82f6';
    if (route.tierSharing === 'Tier 2' || route.tier === 'Tier 2' || route.tier?.includes('T2')) return '#dc2626';
    return '#10b981';
  };

  // Helper to extract natural sort key from BJ# codes (e.g. BJ#01 -> 1, BJ#03/1 -> 3.01, BJ#12 -> 12)
  const getBjSortKey = (name: string): number => {
    const match = name.match(/BJ#?(\d+)(?:\/(\d+))?/i);
    if (match) {
      const mainNum = parseInt(match[1], 10);
      const subNum = match[2] ? parseInt(match[2], 10) / 100 : 0;
      return mainNum + subNum;
    }
    return 999999;
  };

  // Parse enclosure BJ number and clean landmark/location name cleanly
  const parseEnclosureName = (enc: { name?: string; locationName?: string }, fallbackIdx: number) => {
    const rawName = (enc.name || '').trim();
    // Pattern starting with BJ#... like "BJ#01 สภากาชาดไทย", "BJ#03/1 อาคารเกษม"
    const match = rawName.match(/^(BJ#[\w/.-]+)\s*(.*)$/i) || rawName.match(/^(BJ[\s#]*[\w/.-]+)\s*(.*)$/i);
    if (match) {
      const bjNo = match[1].trim().replace(/^BJ\s*#?/i, 'BJ#');
      const cleanName = match[2].trim() || enc.locationName || rawName;
      return { bjNo, bjName: cleanName };
    }
    
    // Check if BJ# exists anywhere in the string
    const anyBjMatch = rawName.match(/(BJ#[\w/.-]+)/i);
    if (anyBjMatch) {
      const bjNo = anyBjMatch[1].trim();
      const cleanName = rawName.replace(anyBjMatch[1], '').trim() || enc.locationName || rawName;
      return { bjNo, bjName: cleanName };
    }

    return {
      bjNo: `BJ#${String(fallbackIdx + 1).padStart(2, '0')}`,
      bjName: rawName || enc.locationName || `จุดต่อที่ ${fallbackIdx + 1}`
    };
  };

  // Sort enclosures along corridor according to natural BJ sequence
  const sldEnclosures = useMemo(() => {
    if (effectiveEnclosures.length === 0) {
      return [];
    }
    
    // Sort enclosures primarily by natural BJ sequence
    const sorted = [...effectiveEnclosures].sort((a, b) => {
      const keyA = getBjSortKey(a.name || '');
      const keyB = getBjSortKey(b.name || '');
      if (keyA !== 999999 || keyB !== 999999) {
        if (keyA !== keyB) return keyA - keyB;
      }
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
    const projName = activeProject.name || '';
    if (projName.includes('อังรีดูนังต์')) return 'ถนนอังรีดูนังต์';
    if (projName.includes('วิทยุ')) return 'ถนนวิทยุ';
    if (projName.includes('สุขุมวิท')) return 'ถนนสุขุมวิท';
    if (projName.includes('เพชรบุรี')) return 'ถนนเพชรบุรี';
    if (projName.includes('พระราม')) return 'ถนนพระราม';
    if (projName.includes('พหลโยธิน')) return 'ถนนพหลโยธิน';
    return projName.split(' ')[0] || 'แนวเส้นทางโครงข่ายเคเบิล';
  }, [activeProject.name]);

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
      return [];
    }

    // Map each distinct shared fiber route into structured table rows
    return effectiveRoutes.map((route, idx) => {
      const cores = route.cores || [];
      const startEnc = effectiveEnclosures.find(e => e.id === route.startEnclosureId) || sldEnclosures[0];
      const endEnc = effectiveEnclosures.find(e => e.id === route.endEnclosureId) || sldEnclosures[sldEnclosures.length - 1];

      // Calculate realistic distance of this specific fiber line
      let distKm = '0.00';
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
        distKm = (distMeters / 1000).toFixed(2);
      } else if (startEnc?.position && endEnc?.position) {
        const p1 = L.latLng(startEnc.position.lat, startEnc.position.lng);
        const p2 = L.latLng(endEnc.position.lat, endEnc.position.lng);
        const distMeters = p1.distanceTo(p2);
        distKm = (distMeters / 1000).toFixed(2);
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
        cableId: route.lineageId || route.id || `route_${idx}`,
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
  }, [effectiveRoutes, effectiveEnclosures, sldEnclosures, activeProject.name, participatingOwners, projectTierName, projectTierCompactLabel]);

  // Aggregate totals across all fiber optic routes
  const fiberRouteTotals = useMemo(() => {
    let totalDist = 0;
    let totalSYMC = 0;
    let totalUIH = 0;
    let totalITEL = 0;
    let totalAllCores = 0;
    const countedCables = new Set<string>();

    fiberRouteSchedule.forEach((r, index) => {
      const rawLength = effectiveRoutes[index]?.totalLength;
      totalDist += rawLength !== undefined && rawLength > 0 ? rawLength / 1000 : (parseFloat(r.distanceKm) || 0);
      // Split segments are shown separately, but their shared cable cores count once.
      if (!countedCables.has(r.cableId)) {
        totalSYMC += r.symcCores || 0;
        totalUIH += r.uihCores || 0;
        totalITEL += r.itelCores || 0;
        totalAllCores += r.totalCores || 0;
        countedCables.add(r.cableId);
      }
    });

    return {
      distanceKm: totalDist.toFixed(2),
      symcCores: totalSYMC,
      uihCores: totalUIH,
      itelCores: totalITEL,
      totalCores: totalAllCores
    };
  }, [fiberRouteSchedule, effectiveRoutes]);

  const fiberOpticSummary = useMemo(() => {
    const distanceByType = new Map<string, number>();

    fiberRouteSchedule.forEach((route, index) => {
      const capacityLabel = `OFC ${route.capacity} Core`;
      const typeName = effectiveRoutes[index]?.fiberType?.trim();
      const label = !typeName || /^\d+$/.test(typeName)
        ? capacityLabel
        : typeName.includes(String(route.capacity))
          ? typeName
          : `${capacityLabel} (${typeName})`;
      const rawLength = effectiveRoutes[index]?.totalLength;
      distanceByType.set(label, (distanceByType.get(label) || 0) +
        (rawLength !== undefined && rawLength > 0 ? rawLength / 1000 : (parseFloat(route.distanceKm) || 0)));
    });

    return Array.from(distanceByType, ([label, distanceKm]) => ({
      label,
      distanceKm: distanceKm.toFixed(2)
    }));
  }, [fiberRouteSchedule, effectiveRoutes]);

  // Helper to dynamically calculate per-route fiber and enclosure sharing configuration
  const calculateRouteSharingDetails = (routeSched: typeof fiberRouteSchedule[0]) => {
    const rawRoute = effectiveRoutes.find(r => r.id === routeSched.id);
    const totalC = routeSched.capacity || 144;
    const totalTubes = Math.max(1, Math.round(totalC / 12)) || 12;
    const coresPerTube = Math.max(1, Math.floor(totalC / totalTubes)) || 12;

    let itelCores = routeSched.itelCores || 0;
    let symcCores = routeSched.symcCores || 0;
    let uihCores = routeSched.uihCores || 0;

    const itelTubesCount = itelCores > 0 ? Math.ceil(itelCores / coresPerTube) : 0;
    const symcTubesCount = symcCores > 0 ? Math.ceil(symcCores / coresPerTube) : 0;
    const uihTubesCount = uihCores > 0 ? Math.ceil(uihCores / coresPerTube) : 0;

    let tubeCursor = 1;
    let itelTubeStart = 0, itelTubeEnd = 0;
    let symcTubeStart = 0, symcTubeEnd = 0;
    let uihTubeStart = 0, uihTubeEnd = 0;

    if (itelTubesCount > 0) {
      itelTubeStart = tubeCursor;
      itelTubeEnd = tubeCursor + itelTubesCount - 1;
      tubeCursor = itelTubeEnd + 1;
    }
    if (symcTubesCount > 0) {
      symcTubeStart = tubeCursor;
      symcTubeEnd = tubeCursor + symcTubesCount - 1;
      tubeCursor = symcTubeEnd + 1;
    }
    if (uihTubesCount > 0) {
      uihTubeStart = tubeCursor;
      uihTubeEnd = tubeCursor + uihTubesCount - 1;
      tubeCursor = uihTubeEnd + 1;
    }

    const itelTraysCount = itelCores > 0 ? Math.max(1, Math.ceil(itelCores / 24)) : 0;
    const symcTraysCount = symcCores > 0 ? Math.max(1, Math.ceil(symcCores / 24)) : 0;
    const uihTraysCount = uihCores > 0 ? Math.max(1, Math.ceil(uihCores / 24)) : 0;

    let trayCursor = 1;
    let itelTrayStart = 0, itelTrayEnd = 0;
    let symcTrayStart = 0, symcTrayEnd = 0;
    let uihTrayStart = 0, uihTrayEnd = 0;

    if (itelTraysCount > 0) {
      itelTrayStart = trayCursor;
      itelTrayEnd = trayCursor + itelTraysCount - 1;
      trayCursor = itelTrayEnd + 1;
    }
    if (symcTraysCount > 0) {
      symcTrayStart = trayCursor;
      symcTrayEnd = trayCursor + symcTraysCount - 1;
      trayCursor = symcTrayEnd + 1;
    }
    if (uihTraysCount > 0) {
      uihTrayStart = trayCursor;
      uihTrayEnd = trayCursor + uihTraysCount - 1;
      trayCursor = uihTrayEnd + 1;
    }

    const spareTrayStart = trayCursor;

    const getTubeOwner = (tubeNum: number): CoreOwner | 'Spare' => {
      if (itelTubesCount > 0 && tubeNum >= itelTubeStart && tubeNum <= itelTubeEnd) return 'ITEL';
      if (symcTubesCount > 0 && tubeNum >= symcTubeStart && tubeNum <= symcTubeEnd) return 'SYMC';
      if (uihTubesCount > 0 && tubeNum >= uihTubeStart && tubeNum <= uihTubeEnd) return 'UIH';
      return 'Spare';
    };

    const routeEncCount = sldEnclosures.length;

    return {
      rawRoute,
      totalC,
      totalTubes,
      itelCores,
      symcCores,
      uihCores,
      itelTubeStart,
      itelTubeEnd,
      symcTubeStart,
      symcTubeEnd,
      uihTubeStart,
      uihTubeEnd,
      itelTrayStart,
      itelTrayEnd,
      symcTrayStart,
      symcTrayEnd,
      uihTrayStart,
      uihTrayEnd,
      spareTrayStart,
      getTubeOwner,
      routeEncCount
    };
  };

  // Helper to resolve enclosures associated with a specific route line (strictly separated per route)
  const getRouteEnclosures = (routeSchedId: string): FiberEnclosure[] => {
    // 0. User custom selection takes highest precedence
    if (activeSelections[routeSchedId] && Array.isArray(activeSelections[routeSchedId])) {
      const selectedIds = new Set(activeSelections[routeSchedId]);
      return sldEnclosures.filter(e => selectedIds.has(e.id));
    }

    const rawRoute = effectiveRoutes.find(r => r.id === routeSchedId);
    const routeIdx = fiberRouteSchedule.findIndex(s => s.id === routeSchedId);
    const totalRoutes = fiberRouteSchedule.length;

    if (!rawRoute || totalRoutes <= 1 || sldEnclosures.length === 0) {
      return sldEnclosures;
    }

    // Check if an enclosure is explicitly connected to a given route
    const isExplicitlyConnectedToRoute = (enc: FiberEnclosure, r: Route): boolean => {
      if (r.startEnclosureId === enc.id || r.endEnclosureId === enc.id) return true;
      if (r.cores?.some(c => c.splices && Boolean(c.splices[enc.id]))) return true;
      if (effectiveRoutes.some(other => other.cores?.some(c => c.splices?.[enc.id]?.routeId === r.id))) return true;
      if (enc.portAssignments && Object.values(enc.portAssignments).some(p => p && p.routeId === r.id)) return true;
      if (enc.routeSideOverrides && Boolean(enc.routeSideOverrides[r.id])) return true;
      if (enc.routeOffsets && Boolean(enc.routeOffsets[r.id])) return true;
      return false;
    };

    // 1. Direct explicit connections to this specific route
    const directlyConnected = sldEnclosures.filter(enc => isExplicitlyConnectedToRoute(enc, rawRoute));

    // 2. Geometric proximity along this route's polyline
    const geometricallyConnected: FiberEnclosure[] = [];
    if (rawRoute.path && rawRoute.path.length >= 2) {
      sldEnclosures.forEach(enc => {
        if (!enc.position) return;
        if (directlyConnected.some(d => d.id === enc.id)) return;

        // Never attach an enclosure that explicitly belongs to ANOTHER route!
        const explicitlyBelongsToOther = effectiveRoutes.some(
          other => other.id !== rawRoute.id && isExplicitlyConnectedToRoute(enc, other)
        );
        if (explicitlyBelongsToOther) return;

        const { distance: distToThis } = getClosestPointOnRoute(enc.position, rawRoute.path);
        // Strict threshold: enclosure must be within 25 meters of this route polyline
        if (distToThis <= 25) {
          let isCloserToOther = false;
          for (const other of effectiveRoutes) {
            if (other.id !== rawRoute.id && other.path && other.path.length >= 2) {
              const { distance: otherDist } = getClosestPointOnRoute(enc.position, other.path);
              if (otherDist < distToThis - 5) {
                isCloserToOther = true;
                break;
              }
            }
          }
          if (!isCloserToOther) {
            geometricallyConnected.push(enc);
          }
        }
      });
    }

    const combined = [...directlyConnected, ...geometricallyConnected];
    const uniqueIds = new Set(combined.map(e => e.id));
    const matched = sldEnclosures.filter(e => uniqueIds.has(e.id));

    if (matched.length > 0) {
      return matched;
    }

    // 3. Strict non-overlapping partition per route if no direct or geometric links distinguish the routes
    const chunkSize = Math.max(1, Math.ceil(sldEnclosures.length / totalRoutes));
    const start = routeIdx * chunkSize;
    const end = routeIdx === totalRoutes - 1 ? sldEnclosures.length : Math.min(sldEnclosures.length, start + chunkSize);
    const partitioned = sldEnclosures.slice(start, end);
    return partitioned.length > 0 ? partitioned : [sldEnclosures[routeIdx % sldEnclosures.length]];
  };

  // Show each Enclosure Type used on this route once, using its configured report image.
  const getUsedEnclosureTypes = (routeEncs: FiberEnclosure[]) => {
    const used = new Map<string, { key: string; name: string; imageUrl: string | null; enclosureNames: string[] }>();
    for (const enc of routeEncs) {
      const locationTypeName = enc.locationType?.trim().toLowerCase();
      const type = activeEnclosureTypes.find(t => t.id === enc.enclosureTypeId) ||
        (locationTypeName ? activeEnclosureTypes.find(t => t.name?.trim().toLowerCase() === locationTypeName) : undefined);
      const key = type?.id || enc.enclosureTypeId || locationTypeName || 'unassigned';
      const imageUrl = type?.imageUrl || enc.imageUrl || null;
      const enclosureName = enc.name?.trim() || enc.locationName?.trim() || '-';
      const existing = used.get(key);
      if (!existing) {
        used.set(key, {
          key,
          name: type?.name || enc.locationType || 'ไม่ระบุ Type',
          imageUrl,
          enclosureNames: [enclosureName]
        });
      } else {
        if (!existing.imageUrl && imageUrl) existing.imageUrl = imageUrl;
        if (!existing.enclosureNames.includes(enclosureName)) existing.enclosureNames.push(enclosureName);
      }
    }
    return Array.from(used.values());
  };

  const getOwnerCoreCount = (route: (typeof fiberRouteSchedule)[number], owner: CoreOwner) =>
    owner === 'SYMC' ? route.symcCores : owner === 'UIH' ? route.uihCores : route.itelCores;

  const getCoreShareText = (cores: number, capacity: number) => {
    const percent = capacity > 0 ? cores / capacity * 100 : 0;
    return `${cores} Core (${Number.isInteger(percent) ? percent : percent.toFixed(1)}%)`;
  };

  // One source for the route summary shown on slide 6 and in the PDF.
  const approvalSummaryRows = fiberRouteSchedule.map((route, index) => {
    const routeEnclosures = getRouteEnclosures(route.id);
    const typeCounts = new Map<string, number>();
    routeEnclosures.forEach(enclosure => {
      const type = getEnclosureType(enclosure);
      const baseName = type?.name || enclosure.locationType || 'ไม่ระบุ Type';
      const typeName = type?.capacity && !baseName.includes(String(type.capacity))
        ? `${baseName} (${type.capacity} Core)` : baseName;
      typeCounts.set(typeName, (typeCounts.get(typeName) || 0) + 1);
    });
    return {
      route,
      index,
      typeCounts: Array.from(typeCounts, ([name, count]) => ({ name, count }))
    };
  });
  const approvalEnclosureTypeTotals = Array.from(
    sldEnclosures.reduce((counts, enclosure) => {
      const type = getEnclosureType(enclosure);
      const baseName = type?.name || enclosure.locationType || 'ไม่ระบุ Type';
      const name = type?.capacity && !baseName.includes(String(type.capacity))
        ? `${baseName} (${type.capacity} Core)` : baseName;
      counts.set(name, (counts.get(name) || 0) + 1);
      return counts;
    }, new Map<string, number>()),
    ([name, count]) => ({ name, count })
  );

  const renderRouteEnclosureGallery = (
    routeEncs: FiberEnclosure[],
    extraClass = ''
  ) => {
    const usedTypes = getUsedEnclosureTypes(routeEncs);
    if (usedTypes.length === 0) return null;

    return (
      <div className={`${extraClass} approval-dark-feature p-5 bg-gradient-to-r from-slate-900 via-slate-950 to-slate-900 rounded-2xl border-2 border-slate-700/90 shadow-2xl`}>
        <h4 className="approval-dark-title text-base font-black text-white mb-3">ภาพประกอบ Enclosure Type ที่ใช้ในเส้น Fiber</h4>
        <div className={`grid ${usedTypes.length === 1 ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'} gap-3`}>
          {usedTypes.map(encType => (
            <div key={encType.key} className="min-w-0 rounded-xl bg-white border border-sky-500/30 p-2 shadow-lg">
              <div className="h-36 sm:h-44 flex items-center justify-center overflow-hidden">
                {encType.imageUrl ? (
                  <img src={encType.imageUrl} alt={`Enclosure Type ${encType.name}`} className="max-w-full max-h-full object-contain" />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-slate-500 text-xs text-center">
                    <Box size={28} />
                    <span>ไม่มีรูป Enclosure</span>
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between gap-2 border-t border-slate-200 pt-2">
                <span className="truncate text-xs font-bold text-slate-900" title={encType.name}>{encType.name}</span>
                {encType.imageUrl && (
                  <button
                    type="button"
                    onClick={() => setPreviewingEnclosureImage({ url: encType.imageUrl!, name: encType.name })}
                    aria-label={`ขยายรูป Enclosure Type ${encType.name}`}
                    className="shrink-0 p-1.5 rounded-md bg-sky-600 hover:bg-sky-500 text-white cursor-pointer"
                  >
                    <Maximize2 size={14} />
                  </button>
                )}
              </div>
              <div className="text-xs text-slate-700 mt-2 break-words">ใช้กับ Enclosure: {encType.enclosureNames.join(', ')}</div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const getEnclosureCapacityText = (enc: FiberEnclosure) => {
    const encType = activeEnclosureTypes.find(t => t.id === enc.enclosureTypeId) ||
                    activeEnclosureTypes.find(t => t.name?.toLowerCase() === enc.locationType?.toLowerCase());
    if (encType?.capacity) {
      return `${encType.capacity} Core`;
    }
    if (encType?.name) {
      return encType.name;
    }
    const numMatch = enc.name?.match(/(\d+)\s*C(ore)?/i) || enc.locationType?.match(/(\d+)\s*C(ore)?/i);
    if (numMatch) {
      return `${numMatch[1]} Core`;
    }
    return '312 Core';
  };

  const totalLengthKm = fiberRouteTotals.distanceKm;
  useEffect(() => {
    if (project.designApproval?.totalOperationDistanceKm == null && project.approvalDraft?.totalOperationDistanceKm == null) {
      setOperationKmInput(current => current || totalLengthKm);
    }
  }, [project.id, project.designApproval?.totalOperationDistanceKm, project.approvalDraft?.totalOperationDistanceKm, totalLengthKm]);

  // Canvas drawing listeners
  useEffect(() => {
    signatureUploadGuardRef.current.invalidate();
    setIsProcessingSignature(false);
    setUploadedSignature(null);
    if (!isOpen) {
      setSigningModalOpen(false);
      setSigningTarget(null);
      setHasSignature(false);
      setIsDrawing(false);
    }
  }, [signingModalOpen, isOpen]);

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
    if (isProcessingSignature || uploadedSignature) return;
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
    if (!isDrawing || isProcessingSignature || uploadedSignature) return;
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
    signatureUploadGuardRef.current.invalidate();
    setIsProcessingSignature(false);
    setUploadedSignature(null);
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (canvas) canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
    setActionError(null);
  };

  const handleSignatureFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const token = signatureUploadGuardRef.current.begin();
    setIsProcessingSignature(true);
    setIsDrawing(false);
    setActionError(null);
    try {
      const processed = await processSignatureFile(file);
      if (!signatureUploadGuardRef.current.isCurrent(token)) return;
      setUploadedSignature(processed);
      setHasSignature(true);
      setIsDrawing(false);
      setActionError(null);
    } catch (error) {
      if (!signatureUploadGuardRef.current.isCurrent(token)) return;
      const messages: Record<SignatureImageError['code'], string> = {
        unsupported_type: 'กรุณาเลือกไฟล์ลายเซ็นชนิด PNG, JPG, WebP หรือ HEIC',
        too_large: 'ไฟล์ลายเซ็นต้องมีขนาดไม่เกิน 15 MB',
        decode_failed: 'ไม่สามารถเปิดภาพลายเซ็นได้ กรุณาใช้ไฟล์ JPG หรือ PNG',
        image_too_large_pixels: 'ภาพลายเซ็นมีความละเอียดสูงเกินไป กรุณาเลือกภาพที่เล็กลง',
        no_ink: 'ไม่พบลายเส้นลายเซ็นในภาพ',
        too_big_output: 'ลายเซ็นหลังประมวลผลมีขนาดใหญ่เกินไป กรุณาใช้ภาพที่เล็กลง'
      };
      setActionError(error instanceof SignatureImageError ? messages[error.code] : 'ประมวลผลลายเซ็นไม่สำเร็จ');
    } finally {
      if (signatureUploadGuardRef.current.isCurrent(token)) setIsProcessingSignature(false);
    }
  };

  const closeSigningModal = () => {
    signatureUploadGuardRef.current.invalidate();
    setIsProcessingSignature(false);
    setUploadedSignature(null);
    setSigningModalOpen(false);
  };

  // Open Signing Modal for specific Owner & Level
  const handleOpenSignModal = (owner: CoreOwner, level: 'Planning' | 'OM', previousSignOff?: OwnerSignOff) => {
    if (snapshotUnavailable || usingLivePreview) return;
    signatureUploadGuardRef.current.invalidate();
    setIsProcessingSignature(false);
    setUploadedSignature(null);
    setActionError(null);
    setSigningTarget({ owner, level });
    setSignerPosition(previousSignOff?.position || '');
    setSignerName(previousSignOff?.signedBy || '');
    setSignerComment(previousSignOff?.comment || (level === 'Planning' ? 'เห็นชอบแบบการติดตั้งและสัดส่วน Core ตามเกณฑ์วิศวกรรมโครงข่าย' : 'อนุมัติการดำเนินโครงการและอนุญาตให้เข้าติดตั้งตามแผนงาน'));
    setSigningModalOpen(true);
  };

  // Check if current logged in user can sign for owner & level
  // Signing depends only on the level's own permission. approveDesign used to be
  // an extra master switch; with it off, roles allowed to sign a level could not.
  const canUserSign = (owner: CoreOwner, level: 'Planning' | 'OM') => {
    if (!appUser || snapshotUnavailable || usingLivePreview) return false;
    return canSignAsOwner(appUser, permissions, owner, level);
  };

  const canCorrectSignOff = () => appUser?.role === 'Admin' && !snapshotUnavailable && !usingLivePreview;

  const confirm = useConfirm();
  const handleLockLegacyApproval = async () => {
    const approval = project.designApproval;
    if (appUser?.role !== 'Admin' || !approval || approval.snapshotId ||
      committedLock?.approvalId === approval.id || !readiness.ready || isSubmitting) return;
    if (!(await confirm({ title: 'ล็อกเอกสารคำขอย้อนหลัง?',
      message: `เอกสารจะล็อกเนื้อหาจากข้อมูลโครงการปัจจุบัน ณ เวลาที่ล็อก ไม่ใช่ข้อมูลตอนยื่นคำขอ (${approval.requestedAt})\nลายเซ็น สถานะ และเลขที่เอกสารจะคงเดิม หน้าจออนุมัติจะแสดงเวลาจากเซิร์ฟเวอร์และบัญชีผู้ล็อกย้อนหลังอย่างถาวร แต่ไฟล์ PDF ที่ส่งออกจะไม่แสดงข้อความนี้\nการล็อกนี้ยกเลิกไม่ได้`,
      confirmText: 'ล็อกเอกสารนี้', danger: false }))) return;
    const user = auth.currentUser;
    if (!user || !user.email) {
      setActionError('ไม่พบบัญชีหรืออีเมลที่ยืนยันตัวตน กรุณาเข้าสู่ระบบใหม่');
      return;
    }
    const expected: BackfillExpected = { approvalId: approval.id };
    const snapshotId = nextSnapshotId();
    const record = { snapshotId, createdAt: new Date().toISOString(), uid: user.uid, email: user.email };
    let committed = false;
    let stage: 'snapshot' | 'attach' = 'snapshot';
    setIsSubmitting(true);
    setActionError(null);
    setActionNotice(null);
    try {
      const snapshot = buildApprovalSnapshot(project, approval.id, record.createdAt, user.uid,
        getParticipatingOwners(project, liveSource.routes), liveSource, snapshotId);
      await writeApprovalSnapshot(snapshot);
      stage = 'attach';
      await backfillApprovalSnapshot(project.id, expected, record);
      committed = true;
    } catch (error) {
      if (!committed) {
        const code = firestoreErrorCode(error);
        const reread = error instanceof ApprovalStateChangedError ? undefined
          : code === 'permission-denied' ? await rereadProjectForBackfill(project.id) : undefined;
        const classification = error instanceof ApprovalStateChangedError ? 'state-changed'
          : classifyBackfillFailure(code, expected, reread);
        console.error('Backfill approval snapshot failed', { error, code, snapshotId, stage, classification });
        setActionError(backfillFailureMessage(classification, code, reread?.ok === false));
        try { await logActivity('backfill_approval_snapshot_failed', `Approval lock failed for ${project.name}`, {
          projectId: project.id, approvalId: approval.id, snapshotId, stage, errorCode: code || 'unknown', classification
        }); } catch (logError) { console.warn('Backfill failure log unavailable', logError); }
      }
      setIsSubmitting(false);
      return;
    }
    try { setCommittedLock({ approvalId: approval.id, snapshotId }); }
    catch (error) { console.warn('Backfill committed state unavailable', error); }
    let refreshFailed = false;
    try {
      const fresh = await getDocFromServer(doc(db, `projects/${project.id}`));
      if (!fresh.exists()) throw new Error('Locked project not found during refresh');
      onProjectUpdated?.({ ...fresh.data(), id: fresh.id } as Project);
    } catch (error) { refreshFailed = true; console.warn('Backfill refresh unavailable', error); }
    try { await logActivity('backfill_approval_snapshot', `Approval locked for ${project.name}`, {
      projectId: project.id, approvalId: approval.id, snapshotId
    }); } catch (error) { console.warn('Backfill success log unavailable', error); }
    try { setActionError(null); setActionNotice(backfillCommitMessage(refreshFailed)); }
    catch (error) { console.warn('Backfill result display unavailable', error); }
    try { setIsSubmitting(false); } catch (error) { console.warn('Backfill busy state unavailable', error); }
  };
  const handleRewindApproval = async () => {
    if (appUser?.role !== 'Admin' || !project.designApproval || snapshotUnavailable) return;
    const allowedTargets = currentStage === 'Completed' ? ['Draft', 'Planning', 'OM']
      : currentStage === 'OM' ? ['Draft', 'Planning']
      : currentStage === 'Rejected' ? ['Draft', 'Planning']
      : ['Draft'];
    if (!allowedTargets.includes(rewindTarget)) return;
    const targetLabel = rewindTarget === 'Draft' ? 'ก่อนส่งขออนุมัติ' : rewindTarget;
    if (!(await confirm({ title: 'ถอยขั้นตอนอนุมัติ?', message: `ถอยไป ${targetLabel} และล้างลายเซ็นของขั้นตอนที่ต้องอนุมัติใหม่`, confirmText: 'ถอยขั้นตอน', danger: false }))) return;

    const pendingSignOffs = (level: 'Planning' | 'OM') =>
      Object.fromEntries(participatingOwners.map(owner => [owner, { owner, level, status: 'Pending' as const }]));
    const { finalApprovedAt, finalApprovedBy, ...previousApproval } = project.designApproval;
    const approvalDraft: NonNullable<Project['approvalDraft']> = {
      designNotes: previousApproval.designNotes || '',
      contractorName: previousApproval.contractorName || '',
      contractorContact: previousApproval.contractorContact || '',
      contractorPhone: previousApproval.contractorPhone || '',
      contractorPoNumber: previousApproval.contractorPoNumber || '',
      contractorScope: previousApproval.contractorScope || '',
      estimatedInstallationDate: previousApproval.estimatedInstallationDate || '',
      routeEnclosureSelections: previousApproval.routeEnclosureSelections || {},
      ...(previousApproval.totalOperationDistanceKm != null
        ? { totalOperationDistanceKm: previousApproval.totalOperationDistanceKm } : {})
    };
    const updatedApproval: DesignApproval | undefined = rewindTarget === 'Draft' ? undefined : {
      ...previousApproval,
      status: 'Pending Approval',
      approvalStage: rewindTarget,
      planningSignOffs: rewindTarget === 'Planning' ? pendingSignOffs('Planning') : previousApproval.planningSignOffs,
      omSignOffs: pendingSignOffs('OM'),
      ownerSignOffs: rewindTarget === 'Planning' ? pendingSignOffs('Planning') : previousApproval.ownerSignOffs
    };
    setIsSubmitting(true);
    setActionError(null);
    try {
      await updateDoc(doc(db, `projects/${project.id}`), {
        status: rewindTarget === 'Draft' ? 'Draft' : 'Pending Approval',
        designApproval: updatedApproval || deleteField(),
        approvalDraft: rewindTarget === 'Draft' ? approvalDraft : deleteField()
      });
      await logActivity('rewind_design_approval', `Admin returned approval for ${project.name} to ${targetLabel}`, {
        projectId: project.id, fromStage: currentStage, toStage: rewindTarget, adminUid: appUser.id
      });
      onProjectUpdated?.({ ...project, status: rewindTarget === 'Draft' ? 'Draft' : 'Pending Approval',
        designApproval: updatedApproval, approvalDraft: rewindTarget === 'Draft' ? approvalDraft : undefined });
    } catch (err: any) {
      setActionError(err.message || 'ไม่สามารถถอยขั้นตอนอนุมัติได้');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit new request for design approval
  const handleSubmitApprovalRequest = async () => {
    if (!appUser || !permissions?.requestApproval) return;
    const uid = auth.currentUser?.uid;
    if (!uid) {
      setActionError('ไม่พบบัญชีที่ยืนยันตัวตน กรุณาเข้าสู่ระบบใหม่');
      return;
    }
    if (isLoadingData || sourceError) {
      setActionError(sourceError ? `โหลด ${sourceError[0]} ไม่สำเร็จ: ${sourceError[1].error}` : 'กำลังโหลดข้อมูลโครงการ');
      return;
    }
    const liveOwners = getParticipatingOwners(project, liveSource.routes);
    if (liveSource.routes.length === 0 || liveSource.enclosures.length === 0 || liveOwners.length === 0) {
      setActionError('กรุณาเพิ่มเส้น Fiber, Enclosure และกำหนด Owner ของโครงการก่อนยื่นขออนุมัติ');
      return;
    }
    setIsSubmitting(true);
    setActionError(null);

    try {
      await Promise.all([...pendingDraftWrites.current]);
      if (draftWriteError.current) throw draftWriteError.current;
      const docNumber = buildApprovalDocumentNumber(project);
      
      const initialPlanningSignOffs: Record<string, OwnerSignOff> = {};
      const initialOMSignOffs: Record<string, OwnerSignOff> = {};

      liveOwners.forEach(owner => {
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
        id: nextApprovalId(),
        documentNumber: docNumber,
        status: 'Pending Approval',
        approvalStage: 'Planning',
        requestedBy: appUser.displayName || appUser.email || 'Planning Engineer',
        requestedByEmail: appUser.email,
        requestedByUid: uid,
        requestedAt: new Date().toISOString(),
        designNotes: requestNotes.trim() || 'ขออนุมัติแบบโครงการ Fiber Infra Sharing ตามสัดส่วน Core และ Enclosure',
        contractorName: contractorInput.trim(),
        contractorContact: contractorContactInput.trim(),
        contractorPhone: contractorPhoneInput.trim(),
        contractorPoNumber: contractorPoInput.trim(),
        contractorScope: contractorScopeInput.trim(),
        totalOperationDistanceKm: Number.isFinite(Number.parseFloat(operationKmInput)) && Number.parseFloat(operationKmInput) >= 0
          ? Number.parseFloat(operationKmInput) : Number.parseFloat(totalLengthKm),
        estimatedInstallationDate: targetInstallDate,
        routeEnclosureSelections,
        planningSignOffs: initialPlanningSignOffs,
        omSignOffs: initialOMSignOffs,
        ownerSignOffs: initialPlanningSignOffs
      };

      const snapshot = buildApprovalSnapshot(project, newApproval.id, newApproval.requestedAt, uid, liveOwners, liveSource);
      newApproval.snapshotId = newApproval.id;
      newApproval.snapshotCreatedAt = snapshot.metadata.createdAt;
      const expected: ExpectedApprovalState = project.designApproval?.status === 'Rejected'
        ? { kind: 'rejected', id: project.designApproval.id } : { kind: 'none' };

      await writeApprovalSnapshot(snapshot);
      await attachApprovalSnapshot(project.id, expected, newApproval);

      const updatedProject: Project = {
        ...project,
        status: 'Pending Approval',
        designApproval: newApproval,
        approvalDraft: undefined
      };

      logActivity('request_design_approval', `Requested 2-level design approval for project ${project.name} (${docNumber})`, {
        projectId: project.id,
        documentNumber: docNumber,
        owners: liveOwners,
        routesCount: liveSource.routes.length,
        enclosuresCount: liveSource.enclosures.length
      }).catch(console.warn);

      if (onProjectUpdated) {
        onProjectUpdated(updatedProject);
      }

      setViewMode('slides');
      setPreviewLive(false);
      setCurrentSlide(1);
    } catch (err: any) {
      console.error('Error requesting approval:', err);
      setActionError(err instanceof ApprovalStateChangedError ? 'คำขอเปลี่ยนไปแล้ว กรุณาโหลดหน้าใหม่ก่อนยื่นอีกครั้ง'
        : err.message || 'Failed to submit approval request');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Directly save contractor details from Slide 6 or request form
  const handleSaveContractorDetails = async () => {
    if (project.designApproval && project.designApproval.status !== 'Rejected') return;
    setIsSavingContractor(true);
    setContractorSaveError(null);
    try {
      const contractorDetails = {
        contractorName: contractorInput.trim(),
        contractorContact: contractorContactInput.trim(),
        contractorPhone: contractorPhoneInput.trim(),
        contractorPoNumber: contractorPoInput.trim(),
        contractorScope: contractorScopeInput.trim(),
        estimatedInstallationDate: targetInstallDate
      };
      const updatedProject: Project = { ...project, approvalDraft: { ...project.approvalDraft, ...contractorDetails } };
      await setDoc(doc(db, `projects/${project.id}`), { approvalDraft: updatedProject.approvalDraft }, { merge: true });

      await logActivity('update_contractor_details', `Updated contractor details for project ${project.name}: ${contractorInput.trim()}`, {
        projectId: project.id,
        contractorName: contractorInput.trim(),
        contractorContact: contractorContactInput.trim(),
        contractorPhone: contractorPhoneInput.trim(),
        contractorPoNumber: contractorPoInput.trim()
      });

      if (onProjectUpdated) {
        onProjectUpdated(updatedProject);
      }

      setIsEditingContractor(false);
      setContractorSaveSuccess(true);
      setTimeout(() => setContractorSaveSuccess(false), 3000);
    } catch (err: any) {
      console.error('Error saving contractor:', err);
      setContractorSaveError(err.message || 'ไม่สามารถบันทึกข้อมูลผู้รับจ้างได้');
    } finally {
      setIsSavingContractor(false);
    }
  };

  // Sign & Approve for specific Owner & Level (Planning or OM)
  const handleConfirmSignature = async (isApproved: boolean) => {
    if (isProcessingSignature || !signingTarget || !appUser || !project.designApproval || snapshotUnavailable || usingLivePreview) return;
    const existingSignOff = signingTarget.level === 'Planning'
      ? project.designApproval.planningSignOffs?.[signingTarget.owner]
      : project.designApproval.omSignOffs?.[signingTarget.owner];
    if (existingSignOff?.status === 'Approved' && appUser.role !== 'Admin') {
      setActionError('เฉพาะ Admin เท่านั้นที่แก้ไขการอนุมัติเดิมหรือถอยขั้นตอนอนุมัติได้');
      return;
    }
    const fullName = signerName.trim();
    const position = signerPosition.trim();
    if (fullName.split(/\s+/).length < 2) {
      setActionError('กรุณากรอกชื่อและนามสกุลจริงก่อนลงนาม');
      return;
    }
    if (!position) {
      setActionError('กรุณากรอกตำแหน่งจริงก่อนลงนาม');
      return;
    }
    if (!hasSignature) {
      setActionError('กรุณาวาดหรือแทรกรูปลายเซ็นก่อนลงนาม');
      return;
    }
    const uid = auth.currentUser?.uid;
    if (!uid) {
      setActionError('ไม่พบบัญชีที่ยืนยันตัวตน กรุณาเข้าสู่ระบบใหม่');
      return;
    }
    setIsSubmitting(true);
    setActionError(null);

    try {
      const canvas = canvasRef.current;
      const signatureUrl = uploadedSignature?.dataUrl || (canvas ? getTrimmedSignatureDataUrl(canvas) : '');
      const { owner, level } = signingTarget;

      const signOffData: OwnerSignOff = {
        owner,
        level,
        status: isApproved ? 'Approved' : 'Rejected',
        signedBy: fullName,
        signedByEmail: appUser.email,
        signedByUid: uid,
        position,
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

      const { finalApprovedAt, finalApprovedBy, ...existingApproval } = project.designApproval;
      const previousSignOff = level === 'OM' ? project.designApproval.omSignOffs?.[owner] : undefined;
      const correctedFinalApprover = previousSignOff?.signedBy === finalApprovedBy ? fullName : finalApprovedBy;
      const updatedApproval: DesignApproval = {
        ...existingApproval,
        status: nextProjectStatus,
        approvalStage: nextStage,
        ...rejectionReasonPatch(existingApproval.rejectionReason, isAnyRejected, signerComment),
        planningSignOffs: nextPlanningSignOffs,
        omSignOffs: nextOMSignOffs,
        ...(allOMApproved ? {
          finalApprovedAt: finalApprovedAt || new Date().toISOString(),
          finalApprovedBy: correctedFinalApprover || fullName
        } : {})
      };

      const updatedProject: Project = {
        ...project,
        status: nextProjectStatus,
        designApproval: updatedApproval
      };

      await updateDoc(doc(db, `projects/${project.id}`), {
        status: nextProjectStatus,
        designApproval: updatedApproval
      });

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
      if (allOMApproved && project.designApproval.approvalStage !== 'Completed') setPendingFinalDocuments(true);

      closeSigningModal();
      setSigningTarget(null);
    } catch (err: any) {
      console.error('Error signing approval:', err);
      setActionError(err.message || 'Failed to record signature');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Render the printable presentation and download an actual PDF file.
  const buildPrintDocument = async () => {
    const printLogos = Object.fromEntries(await Promise.all(participatingOwners.map(async owner => {
      const fallback = owner === 'SYMC' ? '/logos/logo-symphony.svg' : owner === 'UIH' ? '/logos/logo-uih.svg' : '/logos/logo-itel.svg';
      return [owner, await normalizePrintLogo(getEffectiveOwnerLogo(owner) || fallback, fallback)];
    }))) as Partial<Record<CoreOwner, string>>;
    return generatePrintableHtml(printLogos);
  };

  /** Builds the fully signed PDF and the KMZ, saves both to the project files
   *  ("เอกสารอนุมัติ") and records them on the approval for the completion email. */
  const createFinalDocuments = async () => {
    if (!appUser || !project.designApproval || finalDocumentsState === 'working' || snapshotUnavailable || usingLivePreview) return;
    setFinalDocumentsState('working');
    try {
      const pdf = (await createApprovalPdf(await buildPrintDocument())).output('blob');
      const folderId = await ensureProjectFolder(project.id, 'เอกสารอนุมัติ');
      const baseName = exportFileName(documentProject, 'pdf').replace(/\.pdf$/, '');
      const docNo = (project.designApproval.documentNumber || '').replace(/[\\/:*?"<>|]+/g, '-');
      const pdfName = `${docNo ? `${docNo} ` : ''}${baseName} (ลงนามครบ).pdf`;
      const pdfFileId = await uploadProjectFile(project.id, pdf, pdfName, folderId);
      let kmz: { kmzFileId: string; kmzName: string } | {} = {};
      try {
        const kmzName = exportFileName(documentProject, 'kmz');
        const kmzBlob = await buildProjectKmz({ project: documentProject, routes: effectiveRoutes, enclosures: effectiveEnclosures, loops: effectiveLoops,
          enclosureTypes: activeEnclosureTypes, fiberTypes: activeFiberTypes, fiberColorConfigs: activeFiberColorConfigs });
        kmz = { kmzFileId: await uploadProjectFile(project.id, kmzBlob, kmzName, folderId), kmzName };
      } catch (error) {
        console.error('Final KMZ failed', error);
      }
      await updateDoc(doc(db, `projects/${project.id}`), {
        'designApproval.finalDocuments': { pdfFileId, pdfName, ...kmz, createdAt: new Date().toISOString(), createdBy: appUser.id }
      });
      setFinalDocumentsState('idle');
    } catch (error) {
      console.error('Final documents failed', error);
      setFinalDocumentsState('error');
    }
  };

  // Runs once the completed approval (with the last signature) is in the props.
  useEffect(() => {
    if (!pendingFinalDocuments || isLoadingData || snapshotUnavailable || usingLivePreview || project.designApproval?.approvalStage !== 'Completed') return;
    setPendingFinalDocuments(false);
    if (!project.designApproval.finalDocuments) createFinalDocuments();
  }, [pendingFinalDocuments, isLoadingData, snapshotUnavailable, usingLivePreview, project.designApproval?.approvalStage]);

  const handleExportDocument = async () => {
    if (isExporting || !permissions?.exportData || snapshotUnavailable || usingLivePreview) return;
    setIsExporting(true);
    setExportError(null);
    try {
      const printDoc = await buildPrintDocument();
      const submittedName = exportFileName(documentProject, 'pdf').replace(/\.pdf$/, '').replace(/\s+/g, '_');
      await exportApprovalPdf(printDoc, `Fiber_Infra_Sharing_Approval_${submittedName}_${new Date().toISOString().split('T')[0]}.pdf`);
      setExportSuccess(true);
      setTimeout(() => setExportSuccess(false), 4000);
    } catch (e) {
      console.error("Export error:", e);
      setExportError(e instanceof Error ? e.message : 'ไม่สามารถส่งออก PDF ได้');
    } finally {
      setIsExporting(false);
    }
  };

  // Generate complete printable HTML
  const generatePrintableHtml = (printLogos: Partial<Record<CoreOwner, string>>) => {
    const docNum = designApproval?.documentNumber || '-';
    const dateStr = new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });

    const printMapRoutes = effectiveRoutes.map(route => {
      const routeSummary = fiberRouteSchedule.find(item => item.id === route.id);
      const connected = getRouteEnclosures(route.id);
      const routePoints = (route.path || []).filter(point =>
        Number.isFinite(point.lat) && Number.isFinite(point.lng)
      );
      const start = (effectiveEnclosures.find(enc => enc.id === route.startEnclosureId) || connected[0])?.position;
      const end = (effectiveEnclosures.find(enc => enc.id === route.endEnclosureId) || connected[connected.length - 1])?.position;
      return {
        name: route.name || 'Fiber Route',
        color: getRouteColor(route),
        distanceKm: routeSummary?.distanceKm || (route.totalLength ? (route.totalLength / 1000).toFixed(2) : '-'),
        fiberType: route.fiberType?.trim() || activeFiberTypes.find(type => type.cores === route.capacity)?.name || `OFC ${route.capacity} Core`,
        points: routePoints.length >= 2 ? routePoints : (start && end ? [start, end] : routePoints)
      };
    });
    const endpointIds = new Set<string>();
    effectiveRoutes.forEach(route => {
      const connected = getRouteEnclosures(route.id);
      const start = effectiveEnclosures.find(enc => enc.id === route.startEnclosureId) || connected[0];
      const end = effectiveEnclosures.find(enc => enc.id === route.endEnclosureId) || connected[connected.length - 1];
      if (start) endpointIds.add(start.id);
      if (end) endpointIds.add(end.id);
    });
    const printMapEnclosures = effectiveEnclosures.filter(enc => endpointIds.has(enc.id))
      .sort((a, b) => getBjSortKey(a.name || '') - getBjSortKey(b.name || ''))
      .map((enc, index) => {
      const type = getEnclosureType(enc);
      const savedName = enc.name?.trim() || parseEnclosureName(enc, index).bjNo;
      const location = enc.locationName?.trim();
      return {
        label: location && !savedName.includes(location) ? `${savedName} · ${location}` : savedName,
        color: getEnclosureColor(enc),
        iconUrl: type?.icon,
        position: enc.position
      };
    });
    // Generate dynamic cover logos HTML for ONLY participating owners
    const coverLogosHtml = participatingOwners.map(owner => {
      const logoUrl = printLogos[owner];
      return `<span class="pdf-logo-slot"><img src="${logoUrl}" alt="${owner}" /></span>`;
    }).join('');

    // Generate dynamic header logos HTML for ONLY participating owners
    const headerLogosHtml = participatingOwners.map(owner => {
      const logoUrl = printLogos[owner];
      return `<span class="pdf-logo-slot"><img src="${logoUrl}" alt="${owner}" /></span>`;
    }).join('');
    const projectMapPage = `
      <div class="slide-page pdf-map-page">
        <div class="slide-header">
          <h2 class="slide-title">แผนที่เส้นทางโครงการ (Project Map)</h2>
          <div class="logos-bar">${headerLogosHtml}</div>
        </div>
        ${renderPrintableProjectMap(printMapRoutes, printMapEnclosures)}
      </div>`;
    
    return `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8">
  <title>Fiber Infra Sharing Approval Document - ${escapePrintText(documentProject.name)}</title>
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
      box-sizing: border-box;
      min-height: 190mm;
      position: relative;
    }
    /* Printed on a portrait A4 page: about A4's width at the PDF's scale. */
    .slide-page.pdf-portrait {
      width: 780px;
      min-height: 0;
      padding: 22px;
    }
    .pdf-enclosure-table {
      table-layout: fixed;
    }
    .pdf-enclosure-table th, .pdf-enclosure-table td {
      padding: 7px 5px;
      overflow-wrap: anywhere;
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
      justify-content: flex-end;
      gap: 10px;
      flex-wrap: nowrap;
      min-width: 0;
    }
    .logos-bar .pdf-logo-slot {
      width: 85px;
      height: 28px;
      min-width: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .pdf-logo-slot img {
      display: block;
      width: auto;
      height: 24px;
      max-width: 100%;
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
    .cover-logos .pdf-logo-slot {
      width: 170px;
      height: 58px;
      min-width: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .cover-logos .pdf-logo-slot img {
      height: 44px;
      max-width: 100%;
    }
    .pdf-map-page .pdf-map {
      margin-top: 0 !important;
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
      grid-template-columns: repeat(${Math.max(1, participatingOwners.length)}, minmax(0, 1fr));
      gap: 12px;
      margin-top: 12px;
    }
    .sig-card {
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 12px 8px;
      background: #f8fafc;
      text-align: center;
      min-width: 0;
      break-inside: avoid;
      display: flex;
      flex-direction: column;
    }
    .sig-card strong {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 42px;
      line-height: 1.25;
      overflow-wrap: break-word;
    }
    .sig-role {
      display: block;
      font-size: 12px;
      font-weight: 600;
      color: #64748b;
    }
    .slide-subtitle {
      display: block;
      font-size: 14px;
      font-weight: 600;
      color: #64748b;
      margin-top: 2px;
    }
    .sig-mark {
      height: 72px;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
    }
    .sig-img {
      display: block;
      max-width: 100%;
      max-height: 60px;
      object-fit: contain;
      margin: 0 auto;
    }
    .sig-name, .sig-position, .sig-date {
      overflow-wrap: anywhere;
      line-height: 1.3;
    }
    .sig-name {
      font-size: 12px;
      font-weight: 700;
    }
    .sig-position {
      font-size: 11px;
      color: #334155;
    }
    .sig-date {
      font-size: 11px;
      color: #64748b;
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
    <div class="cover-logos" style="width: min(780px, 100%); box-sizing: border-box; flex-wrap: nowrap;">
      ${coverLogosHtml}
    </div>
    <h1 style="font-size: 42px; font-weight: 900; color: #0369a1; margin: 0 0 16px 0; text-transform: uppercase;">FIBER INFRA SHARING</h1>
    <h2 style="font-size: 26px; font-weight: 700; color: #334155; margin: 0 0 20px 0;">${escapePrintText(documentProject.name)}</h2>
    <div style="display: flex; gap: 16px; margin-bottom: 24px; flex-wrap: wrap; justify-content: center;">
      ${documentProject.routeCode?.trim() ? `<div style="background: white; padding: 10px 20px; border-radius: 12px; border: 1px solid #cbd5e1; box-shadow: 0 2px 8px rgba(0,0,0,0.04); text-align: left;">
        <span style="color: #64748b; font-size: 11px; text-transform: uppercase; font-weight: bold; display: block;">รหัสเส้นทาง (Route Code)</span>
        <strong style="color: #047857; font-size: 15px; font-family: monospace;">${escapePrintText(documentProject.routeCode.trim())}</strong>
      </div>` : ''}
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
      ${designApproval?.rejectionReason ? `<div><strong>เหตุผลที่ไม่อนุมัติ:</strong> ${escapePrintText(designApproval.rejectionReason)}</div>` : ''}
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
  ${projectMapPage}

  <!-- Slide 4: Enclosure Details Table -->
  <div class="slide-page">
    <div class="slide-header">
      <h2 class="slide-title">รายละเอียดการ SHARING รายเส้นทาง FIBER & ตำแหน่ง ENCLOSURE</h2>
      <div class="logos-bar" style="display: flex; align-items: center; gap: 14px; background: white; padding: 6px 14px; border-radius: 10px; border: 1px solid #cbd5e1; flex-wrap: wrap;">
        ${headerLogosHtml}
      </div>
    </div>
    ${fiberRouteSchedule.map((routeSched, rIdx) => {
      const routeEncs = getRouteEnclosures(routeSched.id);
      const totalC = routeSched.capacity || 144;
      const symcPct = totalC > 0 ? ((routeSched.symcCores / totalC) * 100).toFixed(0) : '0';
      const uihPct = totalC > 0 ? ((routeSched.uihCores / totalC) * 100).toFixed(0) : '0';
      const itelPct = totalC > 0 ? (((routeSched.itelCores || 0) / totalC) * 100).toFixed(0) : '0';
      const spareC = Math.max(0, totalC - (routeSched.symcCores + routeSched.uihCores + (routeSched.itelCores || 0)));
      return `
        <div class="pdf-route${rIdx ? ' pdf-start-page' : ''}" style="margin-bottom: 22px; border: 1px solid #cbd5e1; border-radius: 12px; overflow: hidden; background: #ffffff;">
          <div class="pdf-route-intro">
          <div class="pdf-route-heading">
          <!-- Fiber Route Sharing Summary Header -->
          <div style="background: linear-gradient(135deg, #0f172a, #1e293b); color: white; padding: 10px 14px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <span style="background: #38bdf8; color: #0f172a; font-weight: 900; font-size: 11px; padding: 3px 8px; border-radius: 6px;">
                เส้นที่ ${rIdx + 1}
              </span>
              <strong style="font-size: 13px; font-weight: 800;">${routeSched.routeName}</strong>
              <span style="font-size: 11px; color: #94a3b8;">(${routeSched.sectionName})</span>
            </div>
            <div style="display: flex; align-items: center; gap: 10px; font-size: 11px;">
              <span style="background: #334155; padding: 2px 8px; border-radius: 6px; font-weight: 700;">
                OFC ${routeSched.capacity} Core
              </span>
              <span style="background: #334155; padding: 2px 8px; border-radius: 6px; font-weight: 700;">
                ระยะทาง ${routeSched.distanceKm} km
              </span>
              <span style="background: #0284c7; color: white; padding: 2px 8px; border-radius: 6px; font-weight: 700;">
                Tier: ${routeSched.tier || projectTierCompactLabel}
              </span>
            </div>
          </div>

          <!-- Sharing Ratio Breakdown Bar -->
          <div style="background: #f8fafc; padding: 8px 14px; border-bottom: 1px solid #e2e8f0; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; font-size: 11px;">
            <div style="display: flex; align-items: center; gap: 14px; flex-wrap: wrap;">
              <span style="font-weight: 800; color: #475569;">สัดส่วนการ Sharing เส้น Fiber:</span>
              ${participatingOwners.map(owner => {
                const count = owner === 'SYMC' ? routeSched.symcCores : owner === 'UIH' ? routeSched.uihCores : (routeSched.itelCores || 0);
                const pct = totalC > 0 ? ((count / totalC) * 100).toFixed(0) : '0';
                const color = owner === 'SYMC' ? '#db2777' : owner === 'UIH' ? '#0284c7' : '#d97706';
                const bg = owner === 'SYMC' ? '#fdf2f8' : owner === 'UIH' ? '#f0f9ff' : '#fffbeb';
                return `
                  <span style="background: ${bg}; color: ${color}; padding: 2px 8px; border-radius: 6px; font-weight: 800; border: 1px solid ${color}40;">
                    ${owner}: ${count}C (${pct}%)
                  </span>
                `;
              }).join('')}
              ${spareC > 0 ? `
                <span style="background: #f1f5f9; color: #64748b; padding: 2px 8px; border-radius: 6px; font-weight: 700;">
                  Spare: ${spareC}C
                </span>
              ` : ''}
            </div>
            <div style="color: #64748b; font-weight: 700;">
              จุดตัดต่อ Enclosure: <strong>${routeEncs.length} หัว</strong>
            </div>
          </div>
          </div>

          <!-- Enclosure illustration -->
          ${(() => {
            const types = getUsedEnclosureTypes(routeEncs);
            return types.length ? `
              <div style="padding: 10px 14px; background: #ffffff; border-bottom: 1px solid #e2e8f0;">
                <strong style="display:block; margin-bottom:8px; font-size:12px; color:#0f172a;">ภาพประกอบ Enclosure Type ที่ใช้ในเส้น Fiber</strong>
                <div style="display:grid; grid-template-columns:repeat(${Math.min(types.length, 3)}, minmax(0, 1fr)); gap:8px;">
                  ${types.map(type => `<div style="min-width:0; padding:7px; border:1px solid #cbd5e1; border-radius:7px; font-size:10px; color:#334155;">
                    ${type.imageUrl ? `<img src="${escapePrintText(type.imageUrl)}" alt="${escapePrintText(type.name)}" style="display:block; max-width:100%; width:100%; height:90px; object-fit:contain; background:white;" />` : `<div style="height:90px; display:flex; align-items:center; justify-content:center; color:#64748b;">ไม่มีรูป Enclosure</div>`}
                    <strong style="display:block; margin-top:4px; color:#0f172a;">${escapePrintText(type.name)}</strong>
                    <span>ใช้กับ Enclosure: ${escapePrintText(type.enclosureNames.join(', '))}</span>
                  </div>`).join('')}
                </div>
              </div>` : '';
          })()}
          </div>

          <!-- Enclosure Table for This Route -->
          <table class="pdf-enclosure-table" style="margin: 0; width: 100%;">
            <colgroup>
              <col style="width:4%" /><col style="width:4%" /><col style="width:14%" />
              <col style="width:17%" /><col style="width:7%" /><col style="width:8%" />
              <col style="width:8%" /><col style="width:9%" />
              ${participatingOwners.map(() => '<col style="width:7%" />').join('')}
              <col style="width:8%" />
            </colgroup>
            <thead>
              <tr>
                <th>No.</th>
                <th>Image</th>
                <th>Enclosure Name</th>
                <th>Location Name</th>
                <th>Location Type</th>
                <th>Lat.</th>
                <th>Long.</th>
                <th>ขนาด Enclosure</th>
                ${participatingOwners.map(owner => `
                  <th style="background: ${owner === 'SYMC' ? '#fdf2f8' : owner === 'UIH' ? '#f0f9ff' : '#fffbeb'}; color: ${owner === 'SYMC' ? '#db2777' : owner === 'UIH' ? '#0038b8' : '#d97706'}; text-align: center;">${owner}_Tray No.</th>
                `).join('')}
                <th>Spare_Tray</th>
              </tr>
            </thead>
            <tbody>
              ${routeEncs.map((enc, idx) => {
                const trayAssignments = enc.trayAssignments || {};
                const hasExplicitAssignments = Object.values(trayAssignments).some(o => o && o !== 'None');
                const encCapText = getEnclosureCapacityText(enc);
                const encType = activeEnclosureTypes.find(t => t.id === enc.enclosureTypeId) || activeEnclosureTypes.find(t => t.name?.toLowerCase() === enc.locationType?.toLowerCase());
                const totalTrays = encType?.spliceTrays || 7;

                return `
                  <tr>
                    <td>${idx + 1}</td>
                    <td style="padding: 3px; text-align: center;">
                      ${encType?.icon
                        ? `<img src="${encType.icon}" alt="${encType.name}" style="width: 24px; height: 24px; object-fit: contain; border-radius: 4px; border: 1px solid #cbd5e1;" />`
                        : `<div style="width: 24px; height: 24px; margin: auto; border-radius: 4px; border: 1px solid #cbd5e1; display: flex; align-items: center; justify-content: center;"><span style="width: 8px; height: 8px; border-radius: 50%; background: ${encType?.color || '#ef4444'}; border: 1px solid #1e293b;"></span></div>`
                      }
                    </td>
                    <td style="text-align: left; font-weight: 600;">${escapePrintText(enc.name?.trim() || '-')}</td>
                    <td style="text-align: left;">${escapePrintText(enc.locationName?.trim() || '-')}</td>
                    <td>${escapePrintText(enc.locationType?.trim() || '-')}</td>
                    <td>${enc.position?.lat?.toFixed(6) || '-'}</td>
                    <td>${enc.position?.lng?.toFixed(6) || '-'}</td>
                    <td style="font-weight: 700; color: #334155;">${encCapText}</td>
                    ${participatingOwners.map(owner => {
                      const assignedTrays = Object.entries(trayAssignments)
                        .filter(([_, o]) => o === owner)
                        .map(([tId]) => Number(tId))
                        .sort((a, b) => a - b);
                      let trayStr = assignedTrays.length > 0 ? formatTrayRanges(assignedTrays) : '';
                      if (!trayStr) trayStr = '-';
                      return `<td style="color: ${owner === 'SYMC' ? '#db2777' : owner === 'UIH' ? '#0038b8' : '#d97706'}; font-weight: 700; text-align: center;">${trayStr}</td>`;
                    }).join('')}
                    <td style="color: #64748b; font-weight: 700;">
                      ${(() => {
                        if (hasExplicitAssignments) {
                          let spare = 0;
                          for (let tId = 1; tId <= totalTrays; tId++) {
                            const owner = trayAssignments[tId] || 'None';
                            if (owner === 'None') spare++;
                          }
                          return spare || '-';
                        }
                        return '-';
                      })()}
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      `;
    }).join('')}
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
      const routeEncs = getRouteEnclosures(routeSched.id);
      const totalC = routeSched.capacity || 144;
      const actualRoute = effectiveRoutes.find(route => route.id === routeSched.id);
      const routeFt = activeFiberTypes.find(ft => ft.cores === totalC || ft.name?.toLowerCase().includes(totalC.toString())) || activeFiberTypes[0];
      const fiberImgUrl = routeFt?.imageUrl || '';
      const fiberName = routeFt?.name || `OFC ${totalC} Core`;
      const firstEnc = routeEncs.length > 0 ? parseEnclosureName(routeEncs[0], 0).bjNo : '-';
      const lastEnc = routeEncs.length > 0 ? parseEnclosureName(routeEncs[routeEncs.length - 1], routeEncs.length - 1).bjNo : '-';
      const routeBjDisplay = routeEncs.length === 0 ? '-' : routeEncs.length === 1 ? firstEnc : `${firstEnc} - ${lastEnc}`;
      const firstEnclosureName = routeEncs[0]?.name?.trim() || firstEnc;
      const lastEnclosureName = routeEncs[routeEncs.length - 1]?.name?.trim() || lastEnc;
      const routeEnclosureNames = routeEncs.length === 0 ? '-' : routeEncs.length === 1 ? firstEnclosureName : `${firstEnclosureName} - ${lastEnclosureName}`;

      const ownerRows = participatingOwners.map((owner) => {
        const allocation = getApprovalAllocation(actualRoute, routeEncs, owner);

        const colorHex = owner === 'SYMC' ? '#db2777' : owner === 'UIH' ? '#0038b8' : '#d97706';

        return {
          owner,
          colorHex,
          coreStr: allocation.coreText,
          tubeStr: allocation.tubeText,
          trayStr: allocation.trayText
        };
      });
      const spareAllocation = getApprovalAllocation(actualRoute, routeEncs, 'None', enc => getEnclosureType(enc)?.spliceTrays || 7);

      return `
        <div class="pdf-keep-together${rIdx ? ' pdf-start-page' : ''}" style="margin-top: 14px; margin-bottom: 16px; border: 1px solid #cbd5e1; border-radius: 10px; overflow: hidden; background: white;">
          <div style="background: linear-gradient(135deg, #0f172a, #1e293b); color: white; padding: 10px 14px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <span style="background: #38bdf8; color: #0f172a; font-weight: 900; font-size: 11px; padding: 3px 8px; border-radius: 6px;">
                เส้นที่ ${rIdx + 1}
              </span>
              <strong style="font-size: 13px; font-weight: 800;">${routeSched.tier} - ${routeSched.routeName}</strong>
              <span style="font-size: 11px; color: #94a3b8;">(${routeSched.sectionName})</span>
            </div>
            <div style="font-size: 11px; color: #94a3b8;">
              ระยะทาง: <strong style="color: white;">${routeSched.distanceKm} km</strong> | ขนาด: <strong style="color: #facc15;">OFC ${totalC} Core</strong>
            </div>
          </div>
          ${fiberImgUrl ? `
            <div style="padding: 12px 14px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; display: flex; align-items: center; gap: 16px;">
              <img src="${fiberImgUrl}" alt="${fiberName}" style="width: 140px; height: 140px; object-fit: contain; border-radius: 8px; background: white; padding: 6px; border: 1px solid #cbd5e1; flex-shrink: 0;" />
              <div>
                <div style="font-size: 13px; font-weight: 800; color: #0f172a; margin-bottom: 4px;">
                  ประเภทสาย Fiber Optic: ${fiberName} (OFC ${totalC} Cores)
                </div>
                <div style="font-size: 11px; color: #475569; line-height: 1.5; margin-bottom: 6px;">
                  โครงสร้างสายเคเบิลใยแก้วนำแสงมาตรฐานสำหรับโครงการ ${projectTierName} (${participatingOwners.join('+')}) รายละเอียดโครงสร้างท่อ Loose Tube และสีของ Core ชัดเจนตามมาตรฐานสากล
                </div>
                <div style="font-size: 11px; color: #0369a1; font-weight: 700;">
                  จุดเชื่อมต่อ Enclosure ประจำเส้นทาง: <strong>${routeBjDisplay}</strong> (${routeEncs.length} หัว)
                </div>
              </div>
            </div>
          ` : ''}

          <table style="margin: 0; width: 100%;">
            <thead>
              <tr>
                <th rowspan="2">Sharing</th>
                <th rowspan="2">Oper.</th>
                <th colspan="2" style="background: #f3e8ff; color: #6b21a8;">Enclosure 312 Core</th>
                <th colspan="2" style="background: #e0f2fe; color: #0369a1;">OFC ${totalC} Core</th>
              </tr>
              <tr>
                <th>Enclosure Name</th>
                <th style="text-align: center;">Tray</th>
                <th>Tube</th>
                <th>Core</th>
              </tr>
            </thead>
            <tbody>
              ${ownerRows.map((row, idx) => `
                <tr>
                  ${idx === 0 ? `<td rowspan="${ownerRows.length + 1}" style="font-weight: 800;">${routeSched.tier}</td>` : ''}
                  <td style="font-weight: 800; color: ${row.colorHex};">${row.owner}</td>
                  <td>${[row.trayStr, row.tubeStr, row.coreStr].some(value => value !== '-') ? `<strong>${escapePrintText(routeEnclosureNames)}</strong>` : ''}</td>
                  <td style="color: ${row.colorHex}; font-weight: 700; text-align: center; overflow-wrap: anywhere;">${escapePrintText(row.trayStr)}</td>
                  <td style="color: ${row.colorHex}; font-weight: 700;">${escapePrintText(row.tubeStr)}</td>
                  <td style="color: ${row.colorHex}; font-weight: 700;">${escapePrintText(row.coreStr)}</td>
                </tr>
              `).join('')}
              <tr>
                <td style="font-weight: 700; color: #64748b;">Spare</td>
                <td>${[spareAllocation.trayText, spareAllocation.tubeText, spareAllocation.coreText].some(value => value !== '-') ? escapePrintText(routeEnclosureNames) : ''}</td>
                <td style="text-align: center;">${escapePrintText(spareAllocation.trayText)}</td>
                <td>${escapePrintText(spareAllocation.tubeText)}</td>
                <td>${escapePrintText(spareAllocation.coreText)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      `;
    }).join('')}
  </div>

  <!-- Slide 6: Summary & 2-Level Approval -->
  <div class="slide-page pdf-portrait">
    <div class="slide-header">
      <h2 class="slide-title">สรุปงานติดตั้ง & การลงนามอนุมัติ<span class="slide-subtitle">2 ระดับ: Planning &amp; O&amp;M</span></h2>
      <div class="logos-bar" style="display: flex; align-items: center; gap: 14px; background: white; padding: 6px 14px; border-radius: 10px; border: 1px solid #cbd5e1; flex-wrap: nowrap; flex-shrink: 0;">
        ${headerLogosHtml}
      </div>
    </div>
    
    <div style="background: #f8fafc; padding: 16px; border-radius: 10px; border: 1px solid #cbd5e1; font-size: 12px; line-height: 1.6; margin-bottom: 20px;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; margin-bottom: 12px;">
        <div style="min-width: 0;">
          <div style="font-size: 12px; color: #0369a1; font-weight: 700;">สรุปงานติดตั้ง ${projectTierName} (${participatingOwners.join('+')})</div>
          <strong style="display: block; font-size: 14px; color: #0f172a; line-height: 1.4;">${escapePrintText(documentProject.name)}</strong>
          <div style="font-size: 11px; color: #64748b;">รหัสเอกสาร: <span style="white-space: nowrap;">${escapePrintText(docNum)}</span> | สถานะ: ${designApproval?.status || project.status || 'Pending Approval'}</div>
        </div>
        <div style="text-align: right; font-size: 11px; color: #475569; white-space: nowrap; flex-shrink: 0;">
          <strong>กำหนดการติดตั้ง:</strong><br>${escapePrintText(contractorView.installDate)}
        </div>
      </div>

      <!-- Combined Fiber Optic, sharing and Enclosure summary -->
      <div style="margin-bottom: 12px;">
        <strong style="color: #0369a1; font-size: 13px;">สรุปเส้น Fiber Optic และการใช้งานร่วมกัน</strong>
        <table style="table-layout: fixed; width: 100%; font-size: 10px; margin: 8px 0;">
          <colgroup>
            <col style="width: 12%;" /><col style="width: 35%;" /><col style="width: 13%;" />
            <col style="width: 21%;" /><col style="width: 19%;" />
          </colgroup>
          <thead>
            <tr>
              <th>Tier</th>
              <th>ชื่อเส้น Fiber Optic</th>
              <th>สาย / ระยะทาง</th>
              <th>สัดส่วนการใช้งาน</th>
              <th>Type Enclosure</th>
            </tr>
          </thead>
          <tbody>
            ${approvalSummaryRows.map(({ route, typeCounts }) => `
              <tr>
                <td style="vertical-align: top; overflow-wrap: break-word;"><strong>${escapePrintText(route.tier)}</strong></td>
                <td style="vertical-align: top; text-align: left; overflow-wrap: break-word;"><strong>${route.routeName.split(/\s+-\s+/).map(escapePrintText).join(' –<br>')}</strong></td>
                <td style="vertical-align: top;">OFC ${route.capacity} Core<br><strong>${route.distanceKm} กม.</strong></td>
                <td style="vertical-align: top; text-align: left;">
                  ${participatingOwners.map(owner => `
                    <div><strong style="color: ${owner === 'SYMC' ? '#db2777' : owner === 'UIH' ? '#0038b8' : '#d97706'};">${owner}:</strong> ${getCoreShareText(getOwnerCoreCount(route, owner), route.capacity)}</div>
                  `).join('')}
                </td>
                <td style="vertical-align: top; text-align: left; overflow-wrap: break-word;">
                  ${typeCounts.length ? typeCounts.map(type => `<div>${escapePrintText(type.name)} <strong>(${type.count} หัว)</strong></div>`).join('') : '-'}
                </td>
              </tr>
            `).join('')}
          </tbody>
          <tfoot>
            <tr style="background: #e0f2fe; font-weight: 700;">
              <td>รวม</td>
              <td>${approvalSummaryRows.length} เส้น Fiber Optic</td>
              <td>${totalLengthKm} กม.</td>
              <td style="text-align: left;">${participatingOwners.map(owner => `<div>${owner}: ${owner === 'SYMC' ? fiberRouteTotals.symcCores : owner === 'UIH' ? fiberRouteTotals.uihCores : fiberRouteTotals.itelCores} Core</div>`).join('')}</td>
              <td style="text-align: left;">${approvalEnclosureTypeTotals.length ? approvalEnclosureTypeTotals.map(type => `<div>${escapePrintText(type.name)} <strong>(${type.count} หัว)</strong></div>`).join('') : '-'}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <!-- Item 2: Contractor Details -->
      <div style="margin-bottom: 12px; background: white; padding: 10px; border-radius: 8px; border: 1px solid #cbd5e1;">
        <strong style="color: #0f172a; font-size: 13px;">2. ผู้รับจ้างที่ดำเนินการติดตั้ง (Contractor):</strong>
        <div style="margin-top: 6px; display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; font-size: 11px;">
          <div><strong>ชื่อบริษัทผู้รับจ้าง:</strong> ${escapePrintText(contractorView.name)}</div>
          <div><strong>ผู้ควบคุมงาน / ผู้ประสานงาน:</strong> ${escapePrintText(contractorView.contact)}</div>
          <div><strong>เบอร์โทรศัพท์ติดต่อ:</strong> ${escapePrintText(contractorView.phone)}</div>
          <div><strong>เลขที่สัญญา / PO:</strong> ${escapePrintText(contractorView.po)}</div>
          ${contractorView.scope ? `<div style="grid-column: span 2;"><strong>ขอบเขตงาน:</strong> ${escapePrintText(contractorView.scope)}</div>` : ''}
        </div>
      </div>

      <div style="margin-top: 10px; font-weight: 800; color: #0369a1; text-align: center; font-size: 13px; background: #f0f9ff; padding: 8px; border-radius: 8px; border: 1px solid #bae6fd;">
        "โดยมีมติสรุปเห็นชอบร่วมกับดำเนินการ ตามรายละเอียดดังกล่าวข้างต้น"
      </div>
    </div>

    <!-- Signatures share the summary page (portrait A4 in the PDF) -->
    <h3 style="margin: 18px 0 8px; font-size: 15px; color: #0369a1; border-bottom: 2px solid #e2e8f0; padding-bottom: 4px;">ผู้ลงนามอนุมัติโครงการ</h3>

    <!-- Level 1 Planning Signatures -->
    <div class="pdf-keep-together" style="margin-bottom: 16px;">
      <span class="level-badge">ระดับที่ 1: ผู้อนุมัติทีม Planning</span>
      <div class="sig-grid">
        ${participatingOwners.map(o => {
          const s = planningSignOffs[o];
          return `
            <div class="sig-card">
              <strong style="color: ${o === 'SYMC' ? '#db2777' : o === 'UIH' ? '#0038b8' : '#d97706'}">${o === 'SYMC' ? 'Symphony Communication PCL.' : o === 'UIH' ? 'United Information Highway Co., Ltd.' : 'Interlink Telecom PCL.'}<span class="sig-role">Planning</span></strong>
              <div class="sig-mark">${s?.signatureDataUrl ? `<img src="${s.signatureDataUrl}" class="sig-img" alt="ลายเซ็น" />` : '<span style="color: #94a3b8;">[ยังไม่ได้ลงนาม]</span>'}</div>
              <div class="sig-name">ชื่อ-นามสกุล: ${escapePrintText(s?.signedBy || '................................')}</div>
              <div class="sig-position">ตำแหน่ง: ${escapePrintText(s?.position || '................................')}</div>
              <div class="sig-date">วันที่: ${s?.signedAt ? new Date(s.signedAt).toLocaleDateString('th-TH') : '................................'}</div>
            </div>
          `;
        }).join('')}
      </div>
    </div>

    <!-- Level 2 OM Signatures -->
    <div class="pdf-keep-together">
      <span class="level-badge" style="background: #f0fdf4; color: #15803d; border-color: #86efac;">ระดับที่ 2: ผู้อนุมัติทีม O&M (Management)</span>
      <div class="sig-grid">
        ${participatingOwners.map(o => {
          const s = omSignOffs[o];
          return `
            <div class="sig-card">
              <strong style="color: ${o === 'SYMC' ? '#db2777' : o === 'UIH' ? '#0038b8' : '#d97706'}">${o === 'SYMC' ? 'Symphony Communication PCL.' : o === 'UIH' ? 'United Information Highway Co., Ltd.' : 'Interlink Telecom PCL.'}<span class="sig-role">O&amp;M Management</span></strong>
              <div class="sig-mark">${s?.signatureDataUrl ? `<img src="${s.signatureDataUrl}" class="sig-img" alt="ลายเซ็น" />` : '<span style="color: #94a3b8;">[ยังไม่ได้ลงนาม]</span>'}</div>
              <div class="sig-name">ชื่อ-นามสกุล: ${escapePrintText(s?.signedBy || '................................')}</div>
              <div class="sig-position">ตำแหน่ง: ${escapePrintText(s?.position || '................................')}</div>
              <div class="sig-date">วันที่: ${s?.signedAt ? new Date(s.signedAt).toLocaleDateString('th-TH') : '................................'}</div>
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
    <div className="fixed inset-0 z-[1500] flex items-center justify-center p-2 sm:p-4 bg-slate-950/85 backdrop-blur-md overflow-hidden">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-none max-h-[96vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
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
                  !designApproval ? 'bg-slate-500/20 text-slate-300 border-slate-500/40' :
                  isPlanningComplete ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40' :
                  'bg-amber-500/20 text-amber-300 border-amber-500/40'
                }`}>
                  {!designApproval ? 'ยังไม่ได้ยื่นขออนุมัติ' :
                   project.status === 'Approved' ? '✓ ผ่านการอนุมัติสมบูรณ์' :
                   project.status === 'Rejected' ? '✕ ไม่อนุมัติ / ขอแก้ไข' :
                   isPlanningComplete ? '2/2 รออนุมัติระดับ O&M' : '1/2 รออนุมัติระดับ Planning'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium truncate">
                {activeProject.name} &bull; {participatingOwners.join(' + ')} &bull; {sldEnclosures.length} Enclosures &bull; {totalLengthKm} km
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {permissions?.viewApprovalDocs && <ApprovalHistoryEntry project={project} uid={appUser?.id} />}
            <button
              onClick={() => setViewMode('slides')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                viewMode === 'slides' ? 'bg-sky-500 text-white shadow-sm' : 'bg-slate-800 text-slate-300 hover:text-white'
              }`}
            >
              <Presentation size={13} />
              <span>สไลด์นำเสนอ</span>
            </button>

            {/* Signed documents for the completion email */}
            {project.designApproval?.approvalStage === 'Completed' && (
              finalDocumentsState === 'working' ? (
                <span className="px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 bg-sky-500/10 border border-sky-500/30 text-sky-300">
                  <Loader2 size={13} className="animate-spin" /> กำลังสร้างเอกสารฉบับลงนามครบ…
                </span>
              ) : project.designApproval.finalDocuments ? (
                <span className="px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300"
                  title={`บันทึกในไฟล์โครงการ › เอกสารอนุมัติ: ${[project.designApproval.finalDocuments.pdfName, project.designApproval.finalDocuments.kmzName].filter(Boolean).join(', ')}`}>
                  <CheckCircle2 size={13} /> แนบ PDF ลงนามครบ{project.designApproval.finalDocuments.kmzFileId ? ' + KMZ' : ''} แล้ว
                </span>
              ) : (
                <button type="button" onClick={createFinalDocuments}
                  disabled={snapshotUnavailable || usingLivePreview}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/40 text-amber-300"
                  title="สร้าง PDF ฉบับลงนามครบและ KMZ บันทึกในไฟล์โครงการ แล้วส่งอีเมลแนบไฟล์ให้ผู้เกี่ยวข้อง">
                  <FileText size={13} /> {finalDocumentsState === 'error' ? 'สร้างเอกสารไม่สำเร็จ ลองใหม่' : 'สร้างและส่งเอกสารฉบับลงนามครบ'}
                </button>
              )
            )}

            {/* Export HTML / Print */}
            {permissions?.exportData && <button
              onClick={handleExportDocument}
              disabled={isExporting || !hasApprovalDesign || snapshotUnavailable || usingLivePreview}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-60 border border-slate-700 text-slate-200 hover:text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm"
              title="ดาวน์โหลดเอกสาร PDF" aria-label="ดาวน์โหลดเอกสาร PDF"
            >
              {isExporting ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} className={exportSuccess ? 'text-emerald-400' : 'text-slate-300'} />}
              <span>{isExporting ? 'กำลังสร้าง PDF…' : exportSuccess ? 'ดาวน์โหลดแล้ว!' : 'Export / PDF'}</span>
            </button>}

            {/* Close */}
            <button type="button" aria-label="ปิด"
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition-all border border-slate-700/60"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* 2-Level Approval Stage Indicator Header */}
        {designApproval && <div className="px-6 py-2.5 bg-slate-950/60 border-b border-slate-800/80 flex items-center justify-between gap-4 text-xs shrink-0">
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

          <div className="flex items-center gap-3 text-[11px] text-slate-400">
            {appUser?.role === 'Admin' && designApproval && (
              <div className="flex items-center gap-2">
                <label htmlFor="approval-rewind-target" className="sr-only">เลือกขั้นตอนที่ต้องการถอย</label>
                <select id="approval-rewind-target" value={rewindTarget}
                  onChange={event => setRewindTarget(event.target.value as 'Draft' | 'Planning' | 'OM')}
                  className="rounded-lg border border-slate-600 bg-slate-800 px-2.5 py-1 text-xs text-slate-100">
                  <option value="Draft">ก่อนส่งขออนุมัติ</option>
                  {(currentStage === 'OM' || currentStage === 'Completed' || currentStage === 'Rejected') && <option value="Planning">Planning</option>}
                  {currentStage === 'Completed' && <option value="OM">O&amp;M</option>}
                </select>
                <button type="button" onClick={handleRewindApproval} disabled={isSubmitting || snapshotUnavailable}
                  className="rounded-lg border border-amber-500/40 px-2.5 py-1 text-amber-300 hover:bg-amber-500/10 disabled:opacity-50">
                  ถอยขั้นตอนอนุมัติ
                </button>
              </div>
            )}
            <span className="hidden md:inline">Doc: <span className="font-mono text-slate-300">{designApproval.documentNumber || '-'}</span></span>
          </div>
        </div>}

        {/* Modal Main Content Body */}
        <div className="flex-1 overflow-y-auto bg-slate-950 p-4 sm:p-6 custom-scrollbar">
          {project.designApproval && !project.designApproval.snapshotId && committedLock?.approvalId !== project.designApproval.id && (
            <div role="status" className="mb-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-xs text-amber-200">
              <div>เอกสารคำขอเก่านี้ยังไม่ล็อกข้อมูล และอาจเปลี่ยนตามข้อมูลโครงการปัจจุบัน</div>
              {appUser?.role === 'Admin' && <div className="mt-2 flex flex-wrap items-center gap-2">
                <button type="button" onClick={handleLockLegacyApproval} disabled={!readiness.ready || isSubmitting}
                  className="rounded-lg border border-amber-400/50 px-3 py-1.5 font-bold text-amber-100 hover:bg-amber-500/20 disabled:opacity-50">
                  {isSubmitting ? 'กำลังล็อกเอกสาร…' : 'ล็อกเอกสารนี้'}
                </button>
                {!readiness.ready && <span>{readiness.errorSource
                  ? `โหลด ${readiness.errorSource} ไม่สำเร็จ ล็อกเอกสารไม่ได้`
                  : 'กำลังโหลดข้อมูลโครงการ… ยังล็อกเอกสารไม่ได้'}</span>}
              </div>}
            </div>
          )}
          {project.designApproval && isBackfilledApproval(project.designApproval) && (
            <div role="status" className="mb-3 rounded-xl border border-sky-500/40 bg-sky-500/10 px-4 py-2 text-xs text-sky-100">
              {formatBackfillNotice(project.designApproval, resolveBackfillLocker(
                project.designApproval.snapshotBackfilledByUid, project.designApproval.snapshotBackfilledByEmail, lockerProfile))}
            </div>
          )}
          {actionNotice && <div role="status" className="mb-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-xs text-emerald-200">{actionNotice}</div>}
          {/* The request form and the signing modal show actionError themselves. */}
          {actionError && viewMode === 'slides' && !signingModalOpen &&
            <div role="alert" className="mb-3 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-xs text-rose-200">{actionError}</div>}
          {snapshotUnavailable && !viewedSnapshot && (
            <div role="alert" className="mb-3 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-xs text-rose-200">
              {snapshotState.error ? `โหลดเอกสารคำขอเดิมไม่สำเร็จ: ${snapshotState.error}` : 'กำลังโหลดเอกสารคำขอเดิม…'}
            </div>
          )}
          {sourceError && (
            <div role="alert" className="mb-3 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-xs text-rose-200">
              โหลด {sourceError[0]} ไม่สำเร็จ: {sourceError[1].error}
            </div>
          )}
          {exportError && (
            <div role="alert" className="mb-3 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-xs text-rose-300">
              ส่งออก PDF ไม่สำเร็จ: {exportError}
            </div>
          )}
          
          {/* VIEW MODE 1: PRESENTATION SLIDES (Matching the attached PDF presentation) */}
          {viewMode === 'slides' && (!snapshotUnavailable || usingLivePreview) && (
            <div className="w-full space-y-4">
              {isRejected && (
                <div className="flex items-center gap-2 rounded-xl border border-sky-500/30 bg-sky-500/10 px-4 py-2 text-xs text-sky-100">
                  <span>{usingLivePreview ? 'ตัวอย่างคำขอใหม่จากข้อมูลปัจจุบัน' : 'เอกสารคำขอที่ถูกปฏิเสธ (ข้อมูล ณ วันที่ยื่น)'}</span>
                  <button type="button" onClick={() => setPreviewLive(value => !value)} className="ml-auto rounded-lg bg-sky-600 px-2.5 py-1 font-bold text-white">
                    {usingLivePreview ? 'ดูเอกสารเดิม' : 'ดูตัวอย่างคำขอใหม่'}
                  </button>
                </div>
              )}
              {!hasApprovalDesign && !isLoadingData && (
                <div role="status" className="approval-empty-notice rounded-xl px-4 py-3 text-sm font-medium">
                  ยังไม่มีข้อมูลเส้น Fiber และ Enclosure ครบสำหรับขออนุมัติ กรุณาเพิ่มข้อมูลโครงการก่อนยื่นคำขอ
                </div>
              )}
              {hasApprovalDesign && !isLoadingData && (!designApproval || isRejected) && (
                <div className="approval-warning flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-100">
                  <span>{isRejected ? `คำขอเดิมถูกปฏิเสธ${designApproval?.rejectionReason ? `: ${designApproval.rejectionReason}` : ''} สามารถยื่นคำขอใหม่ได้` : 'ยังไม่ได้ยื่นคำขออนุมัติแบบโครงการ'}</span>
                  {permissions?.requestApproval && (
                    <button onClick={() => setViewMode('request')} className="rounded-lg bg-amber-500 px-3 py-1.5 font-bold text-slate-950 hover:bg-amber-400">
                      ยื่นขออนุมัติใหม่
                    </button>
                  )}
                </div>
              )}
              
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
                      {currentSlide === 4 && "รายละเอียดการ Sharing รายเส้นทาง Fiber & ตำแหน่ง Enclosure"}
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
                  {!hasApprovalDesign && currentSlide !== 1 && (
                    <div className="mx-auto max-w-lg rounded-2xl border border-slate-700 bg-slate-950/70 p-8 text-center text-sm text-slate-300">
                      ยังไม่มีเส้น Fiber และ Enclosure ในโครงการ จึงยังไม่มีรายละเอียดสำหรับสไลด์นี้
                    </div>
                  )}
                  
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
                          {activeProject.name}
                        </p>
                        <p className="text-xs md:text-sm text-slate-400">
                          ข้อเสนอการร่วมใช้โครงข่ายเคเบิลใยแก้วนำแสงร่วมกัน (Infrastructure Sharing Agreement)
                        </p>
                      </div>

                      <div className={`grid grid-cols-1 gap-3 mx-auto pt-4 text-left ${activeProject.routeCode?.trim() ? 'sm:grid-cols-4 max-w-3xl' : 'sm:grid-cols-3 max-w-2xl'}`}>
                        {activeProject.routeCode?.trim() && (
                          <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                            <p className="text-[10px] text-slate-400 font-bold uppercase">รหัสเส้นทาง (Route Code)</p>
                            <p className="text-xs font-black text-emerald-400 font-mono break-all">{activeProject.routeCode.trim()}</p>
                          </div>
                        )}
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
                  {hasApprovalDesign && currentSlide === 2 && (
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
                                  <td key={`${r.id}-${owner}`} className="p-3 border-r border-slate-800 font-black text-center" style={{ color: owner === 'SYMC' ? '#f472b6' : owner === 'UIH' ? '#38bdf8' : '#fbbf24' }}>
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
                  {hasApprovalDesign && currentSlide === 3 && (
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
                              title="แสดงชื่อ Enclosure และพิกัดพร้อมการจัดระเบียบไม่ให้ทับกัน" aria-label="แสดงชื่อ Enclosure และพิกัดพร้อมการจัดระเบียบไม่ให้ทับกัน"
                            >
                              📌 แสดงทั้งหมด (จัดระเบียบ)
                            </button>
                            <button
                              type="button"
                              onClick={() => setMapLabelMode('code')}
                              className={`px-2 py-1 rounded font-bold transition-all ${mapLabelMode === 'code' ? 'bg-sky-500 text-white shadow-md' : 'text-slate-300 hover:text-white hover:bg-slate-800'}`}
                              title="แสดงรหัสย่อสำหรับแผนที่คลีน" aria-label="แสดงรหัสย่อสำหรับแผนที่คลีน"
                            >
                              🏷️ รหัสย่อ
                            </button>
                            <button
                              type="button"
                              onClick={() => setMapLabelMode('hover')}
                              className={`px-2 py-1 rounded font-bold transition-all ${mapLabelMode === 'hover' ? 'bg-sky-500 text-white shadow-md' : 'text-slate-300 hover:text-white hover:bg-slate-800'}`}
                              title="แสดงเมื่อเอาเมาส์ไปชี้ที่หมุด" aria-label="แสดงเมื่อเอาเมาส์ไปชี้ที่หมุด"
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
                                distanceKm: '0.00',
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
                                        <span className="font-bold text-slate-800">{r.totalLength ? `${(r.totalLength / 1000).toFixed(2)} km` : `${routeData.distanceKm || '0.00'} km`}</span>
                                      </div>
                                    </div>
                                  </Tooltip>
                                </Polyline>
                              );
                            })}

                            {/* Fiber Loops */}
                            {effectiveLoops.map((loop, i) => (
                              <Marker
                                key={loop.id || i}
                                position={[loop.position.lat, loop.position.lng]}
                                icon={createFiberLoopIcon(
                                  effectiveRoutes.find(route => route.id === loop.routeId)
                                    ? getRouteColor(effectiveRoutes.find(route => route.id === loop.routeId)!)
                                    : undefined,
                                  16
                                )}
                              >
                                <Tooltip direction="top" offset={[0, -6]} opacity={0.95}>
                                  <div className="text-xs font-sans">
                                    <strong className="block text-slate-900">{loop.name || 'Fiber Loop'}</strong>
                                    <span className="text-amber-600 font-bold text-[10px]">{loop.length}m Coil</span>
                                  </div>
                                </Tooltip>
                              </Marker>
                            ))}

                            {/* Individual Enclosure Markers */}
                            {effectiveEnclosures.map((e, i) => {
                              const encType = getEnclosureType(e);
                              const encColor = encType?.color || '#3b82f6';
                              const iconUrl = encType?.icon;
                              if (!e.position) return null;
                              const enclosureTooltip = (
                                <Tooltip direction="top" offset={[0, -8]} opacity={0.98}>
                                  <div className="font-sans text-xs text-slate-900 min-w-[150px] max-w-[280px] max-h-[240px] overflow-y-auto">
                                    <strong className="block font-extrabold">{e.name || 'Enclosure'}</strong>
                                    {e.locationName && <span className="block text-slate-700">{e.locationName}</span>}
                                    <span className="block text-slate-600 font-mono mt-1">{e.position.lat.toFixed(6)}, {e.position.lng.toFixed(6)}</span>
                                  </div>
                                </Tooltip>
                              );

                              if (iconUrl) {
                                const customIcon = new L.Icon({
                                  iconUrl: iconUrl,
                                  iconSize: [20, 20],
                                  iconAnchor: [10, 10],
                                  className: 'approval-enclosure-map-icon'
                                });
                                return (
                                  <Marker 
                                    key={`enc-marker-${e.id || i}`} 
                                    position={[e.position.lat, e.position.lng]} 
                                    icon={customIcon}
                                  >{enclosureTooltip}</Marker>
                                );
                              }

                              return (
                                <CircleMarker 
                                  key={`enc-marker-${e.id || i}`} 
                                  center={[e.position.lat, e.position.lng]} 
                                  radius={4}
                                  pathOptions={{ 
                                    color: '#ffffff', 
                                    fillColor: encColor, 
                                    fillOpacity: 1, 
                                    weight: 1.5 
                                  }}
                                >{enclosureTooltip}</CircleMarker>
                              );
                            })}

                            {/* Non-overlapping Consolidated Location Group Tooltip Cards attached directly to Closure locations */}
                            {mapLabelMode !== 'hover' && locationGroupedPlacements.map((g) => {
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
                                distanceKm: '0.00',
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
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-center text-xs font-black">
                        <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-slate-200 flex items-center justify-center gap-2 flex-wrap">
                          <span>{projectTierCompactLabel}</span>
                          {participatingOwners.map((owner, idx) => (
                            <React.Fragment key={owner}>
                              {idx > 0 && <span>+</span>}
                              <OwnerLogo owner={owner} size="xs" />
                            </React.Fragment>
                          ))}
                        </div>
                        <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-amber-400 min-w-0 space-y-1">
                          <div className="text-[10px] text-slate-400 uppercase">Fiber Optic</div>
                          {fiberOpticSummary.map(({ label, distanceKm }) => (
                            <div key={label} className="break-words leading-snug">{label}: {distanceKm} km.</div>
                          ))}
                          <div className="border-t border-slate-800 pt-1 text-[10px] text-amber-300">รวม {totalLengthKm} km.</div>
                        </div>
                        <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-pink-400">
                          Enclosures: {sldEnclosures.length} EA.
                        </div>
                      </div>
                    </div>
                  )}

                  {/* SLIDE 4: ENCLOSURE DETAIL TABLE & FIBER ROUTE SHARING */}
                  {hasApprovalDesign && currentSlide === 4 && (
                    <div className="space-y-4">
                      {/* Route Selection Filter Tabs */}
                      <div className="flex items-center justify-between flex-wrap gap-2 pb-1 border-b border-slate-800">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <button
                            type="button"
                            onClick={() => setSlide4SelectedRouteId('all')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                              slide4SelectedRouteId === 'all'
                                ? 'bg-amber-500 text-slate-950 shadow-md font-black'
                                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                            }`}
                          >
                            ทุกเส้นทาง ({fiberRouteSchedule.length} เส้น)
                          </button>
                          {fiberRouteSchedule.map((routeSched, rIdx) => (
                            <button
                              key={routeSched.id || rIdx}
                              type="button"
                              onClick={() => setSlide4SelectedRouteId(routeSched.id)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                                slide4SelectedRouteId === routeSched.id
                                  ? 'bg-sky-500 text-white shadow-md font-black'
                                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                              }`}
                            >
                              <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                              <span>เส้นที่ {rIdx + 1}: {routeSched.routeName.replace(/^OFC\s*\d+C\s*/i, '').slice(0, 18)}...</span>
                            </button>
                          ))}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono">
                          ดึงข้อมูลจริงจาก Enclosure Closures & Fiber Specifications
                        </div>
                      </div>

                      {/* Render Route Sections */}
                      <div className="space-y-5 max-h-[440px] overflow-y-auto custom-scrollbar pr-1">
                        {fiberRouteSchedule
                          .filter(routeSched => slide4SelectedRouteId === 'all' || slide4SelectedRouteId === routeSched.id)
                          .map((routeSched, rIdx) => {
                            const originalIdx = fiberRouteSchedule.findIndex(s => s.id === routeSched.id);
                            const displayIdx = originalIdx >= 0 ? originalIdx + 1 : rIdx + 1;
                            const routeEncs = getRouteEnclosures(routeSched.id);
                            const totalC = routeSched.capacity || 144;
                            const symcPct = totalC > 0 ? ((routeSched.symcCores / totalC) * 100).toFixed(0) : '0';
                            const uihPct = totalC > 0 ? ((routeSched.uihCores / totalC) * 100).toFixed(0) : '0';
                            const itelPct = totalC > 0 ? (((routeSched.itelCores || 0) / totalC) * 100).toFixed(0) : '0';
                            const spareCores = Math.max(0, totalC - (routeSched.symcCores + routeSched.uihCores + (routeSched.itelCores || 0)));

                            return (
                              <div key={routeSched.id || rIdx} className="border border-slate-700/80 rounded-xl overflow-hidden bg-slate-900/90 shadow-lg">
                                {/* Fiber Route Sharing Card Header */}
                                <div className="approval-dark-route-header p-3 bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 border-b border-slate-700 flex flex-wrap items-center justify-between gap-3">
                                  <div className="flex items-center gap-2.5 flex-wrap">
                                    <span className="px-2.5 py-1 rounded-md bg-amber-400 text-slate-950 font-black text-xs shadow-sm">
                                      เส้นที่ {displayIdx}
                                    </span>
                                    <strong className="approval-dark-title text-white text-sm font-extrabold">{routeSched.routeName}</strong>
                                    <span className="approval-dark-description text-xs text-slate-400 font-medium">({routeSched.sectionName})</span>
                                  </div>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="px-2 py-0.5 rounded bg-slate-800 text-sky-300 font-mono text-[11px] font-bold border border-slate-700">
                                      OFC {routeSched.capacity} Core
                                    </span>
                                    <span className="px-2 py-0.5 rounded bg-slate-800 text-emerald-300 font-mono text-[11px] font-bold border border-slate-700">
                                      ระยะทาง {routeSched.distanceKm} km
                                    </span>
                                    <span className="approval-dark-badge-sky px-2 py-0.5 rounded bg-sky-950 text-sky-300 font-mono text-[11px] font-bold border border-sky-800">
                                      Tier: {routeSched.tier || projectTierCompactLabel}
                                    </span>
                                  </div>
                                </div>

                                {/* Fiber Sharing Core Breakdown Bar */}
                                <div className="px-3.5 py-2 bg-slate-950/60 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
                                  <div className="flex items-center gap-3 flex-wrap">
                                    <span className="font-bold text-slate-400 text-[11px]">สัดส่วน Sharing เส้น Fiber:</span>
                                    {participatingOwners.map(owner => {
                                      const count = owner === 'SYMC' ? routeSched.symcCores : owner === 'UIH' ? routeSched.uihCores : (routeSched.itelCores || 0);
                                      const pct = totalC > 0 ? ((count / totalC) * 100).toFixed(0) : '0';
                                      const colorClass = owner === 'SYMC' ? 'text-pink-400 bg-pink-500/10 border-pink-500/30' : owner === 'UIH' ? 'text-sky-400 bg-sky-500/10 border-sky-500/30' : 'text-amber-400 bg-amber-500/10 border-amber-500/30';
                                      return (
                                        <div key={owner} className={`flex items-center gap-1 px-2.5 py-1 rounded-md border font-black text-[11px] ${colorClass}`}>
                                          <OwnerLogo owner={owner} size="xs" />
                                          <span>{owner}: {count}C ({pct}%)</span>
                                        </div>
                                      );
                                    })}
                                    {spareCores > 0 && (
                                      <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 text-[11px] font-bold border border-slate-700">
                                        Spare: {spareCores}C
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <div className="text-[11px] font-bold text-slate-400">
                                      จุดตัดต่อ Enclosure: <strong className="text-amber-400 font-black">{routeEncs.length} หัว</strong>
                                    </div>
                                    {(!designApproval || usingLivePreview) && <button
                                      type="button"
                                      onClick={() => setEditingEnclosureRouteId(editingEnclosureRouteId === routeSched.id ? null : routeSched.id)}
                                      className={`px-2.5 py-1 rounded-lg text-[10px] font-black transition-all flex items-center gap-1 cursor-pointer border ${
                                        editingEnclosureRouteId === routeSched.id
                                          ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md'
                                          : 'bg-slate-800 text-sky-300 border-slate-700 hover:bg-slate-750 hover:border-sky-500/50'
                                      }`}
                                      title="เลือก/แก้ไข Enclosure ที่เกาะอยู่กับเส้นนี้โดยเฉพาะ" aria-label="เลือก/แก้ไข Enclosure ที่เกาะอยู่กับเส้นนี้โดยเฉพาะ"
                                    >
                                      <Box size={12} />
                                      <span>{editingEnclosureRouteId === routeSched.id ? 'ปิดการเลือก' : 'เลือก Enclosure ของเส้นนี้'}</span>
                                    </button>}
                                  </div>
                                </div>

                                {/* Enclosure Selection Manager for this specific Route */}
                                {editingEnclosureRouteId === routeSched.id && (!designApproval || usingLivePreview) && (
                                  <div className="m-3 p-3.5 bg-slate-950/95 rounded-xl border border-amber-500/50 space-y-3 shadow-2xl">
                                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                                      <div className="flex items-center gap-2">
                                        <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
                                        <span className="text-xs font-black text-amber-300">
                                          กำหนดจุดต่อ Enclosure ที่เกาะอยู่กับ เส้นที่ {displayIdx} ({routeSched.routeName})
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <button
                                          type="button"
                                          onClick={() => handleResetEnclosuresForRoute(routeSched.id)}
                                          className="text-[10px] px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold border border-slate-700 transition-colors cursor-pointer"
                                        >
                                          รีเซ็ตตามค่าตรวจจับอัตโนมัติ
                                        </button>
                                        <span className="text-[10px] text-slate-400 font-mono">
                                          เลือกแล้ว {routeEncs.length} จาก {sldEnclosures.length} หัว
                                        </span>
                                      </div>
                                    </div>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 text-[11px]">
                                      {sldEnclosures.map((enc, eIdx) => {
                                        const { bjNo, bjName } = parseEnclosureName(enc, eIdx);
                                        const isSelected = routeEncs.some(e => e.id === enc.id);
                                        return (
                                          <button
                                            key={enc.id || eIdx}
                                            type="button"
                                            onClick={() => handleToggleEnclosureForRoute(routeSched.id, enc.id)}
                                            className={`p-2 rounded-lg border text-left flex items-start gap-2 transition-all cursor-pointer ${
                                              isSelected
                                                ? 'bg-sky-500/15 border-sky-400/80 text-white font-bold shadow-sm'
                                                : 'bg-slate-900 border-slate-800 text-slate-500 hover:border-slate-700 opacity-60'
                                            }`}
                                          >
                                            <div className={`w-4 h-4 rounded mt-0.5 shrink-0 flex items-center justify-center text-[10px] font-black ${
                                              isSelected ? 'bg-sky-500 text-slate-950' : 'border border-slate-700'
                                            }`}>
                                              {isSelected ? '✓' : ''}
                                            </div>
                                            <div className="truncate">
                                              <div className="font-black text-sky-300">{bjNo}</div>
                                              <div className="truncate text-[10px] text-slate-400">{bjName}</div>
                                            </div>
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}

                                {renderRouteEnclosureGallery(routeEncs, 'm-3')}

                                {/* Enclosure Sharing Table */}
                                <div className="overflow-x-auto">
                                  <table className="w-full text-xs text-center border-collapse min-w-[780px]">
                                    <thead className="bg-slate-800/90 text-slate-300 font-bold border-b border-slate-700">
                                      <tr>
                                        <th className="p-2 border-r border-slate-700 w-10">No.</th>
                                        <th className="p-2 border-r border-slate-700 w-14">Image</th>
                                        <th className="p-2 border-r border-slate-700 text-left">Enclosure Name</th>
                                        <th className="p-2 border-r border-slate-700 text-left">Location Name</th>
                                        <th className="p-2 border-r border-slate-700 w-24">Location Type</th>
                                        <th className="p-2 border-r border-slate-700 w-24">Lat.</th>
                                        <th className="p-2 border-r border-slate-700 w-24">Long.</th>
                                        <th className="p-2 border-r border-slate-700 w-28">ขนาด Enclosure</th>
                                        {participatingOwners.map(owner => (
                                          <th key={owner} className="p-2 border-r border-slate-700 min-w-[110px] text-center" style={{ backgroundColor: owner === 'SYMC' ? 'rgba(236,72,153,0.1)' : owner === 'UIH' ? 'rgba(14,165,233,0.1)' : 'rgba(245,158,11,0.1)' }}>
                                            <div className="flex items-center justify-center gap-1">
                                              <OwnerLogo owner={owner} size="xs" />
                                              <span className="text-[10px]" style={{ color: owner === 'SYMC' ? '#f472b6' : owner === 'UIH' ? '#38bdf8' : '#fbbf24' }}>Tray No.</span>
                                            </div>
                                          </th>
                                        ))}
                                        <th className="p-2 border-r border-slate-700 w-20">Spare_Tray</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800/80 font-medium">
                                      {routeEncs.map((enc, idx) => {
                                        const encType = activeEnclosureTypes.find(t => t.id === enc.enclosureTypeId) || activeEnclosureTypes.find(t => t.name?.toLowerCase() === enc.locationType?.toLowerCase());
                                        const trayAssignments = enc.trayAssignments || {};
                                        const hasExplicitAssignments = Object.values(trayAssignments).some(o => o && o !== 'None');
                                        const encCapText = getEnclosureCapacityText(enc);
                                        const totalTrays = encType?.spliceTrays || 7;

                                        return (
                                          <tr key={`${enc.id || 'enc'}-${idx}`} className="hover:bg-slate-800/40 transition-colors">
                                            <td className="p-2 border-r border-slate-800 text-slate-400">{idx + 1}</td>
                                            <td className="p-1 border-r border-slate-800">
                                              {encType?.icon ? (
                                                <img src={encType.icon} alt={enc.name || 'Enclosure'} className="w-6 h-6 object-contain rounded border border-slate-700 mx-auto" />
                                              ) : (
                                                <div className="w-6 h-6 bg-slate-800 rounded border border-slate-700 flex items-center justify-center mx-auto">
                                                  <span className="w-2 h-2 rounded-full border border-slate-900" style={{ backgroundColor: encType?.color || '#ef4444' }} />
                                                </div>
                                              )}
                                            </td>
                                            <td className="p-2 border-r border-slate-800 text-left font-bold text-slate-200">{enc.name?.trim() || '-'}</td>
                                            <td className="p-2 border-r border-slate-800 text-left text-slate-300">{enc.locationName?.trim() || '-'}</td>
                                            <td className="p-2 border-r border-slate-800 text-slate-300">{enc.locationType?.trim() || '-'}</td>
                                            <td className="p-2 border-r border-slate-800 font-mono text-[11px] text-slate-400">{enc.position?.lat?.toFixed(6) || '-'}</td>
                                            <td className="p-2 border-r border-slate-800 font-mono text-[11px] text-slate-400">{enc.position?.lng?.toFixed(6) || '-'}</td>
                                            <td className="p-2 border-r border-slate-800 font-bold text-slate-300">{encCapText}</td>
                                            {participatingOwners.map(owner => {
                                              const assignedTrays = Object.entries(trayAssignments)
                                                .filter(([_, o]) => o === owner)
                                                .map(([tId]) => Number(tId))
                                                .sort((a, b) => a - b);
                                              let trayRangeStr = assignedTrays.length > 0 ? formatTrayRanges(assignedTrays) : '';
                                              if (!trayRangeStr) trayRangeStr = '-';

                                              return (
                                                <td key={`${enc.id || idx}-${owner}`} className="p-2 border-r border-slate-800 font-black text-center" style={{ color: owner === 'SYMC' ? '#f472b6' : owner === 'UIH' ? '#38bdf8' : '#fbbf24' }}>
                                                  {trayRangeStr}
                                                </td>
                                              );
                                            })}
                                            <td className="p-2 border-r border-slate-800 font-bold text-slate-400 text-center">
                                              {(() => {
                                                if (hasExplicitAssignments) {
                                                  let spare = 0;
                                                  for (let tId = 1; tId <= totalTrays; tId++) {
                                                    const owner = trayAssignments[tId] || 'None';
                                                    if (owner === 'None') spare++;
                                                  }
                                                  return spare || '-';
                                                }
                                                return '-';
                                              })()}
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  )}

                  {/* SLIDE 5: FIBER USAGE BREAKDOWN & TUBE GRAPHIC */}
                  {hasApprovalDesign && currentSlide === 5 && (
                    <div className="space-y-4">
                      {fiberRouteSchedule.map((routeSched, rIdx) => {
                        const routeEncs = getRouteEnclosures(routeSched.id);
                        const totalC = routeSched.capacity || 144;
                        const actualRoute = effectiveRoutes.find(route => route.id === routeSched.id);

                        const ownerRows = participatingOwners.map((owner) => {
                          const ownerCoresCount = owner === 'SYMC' ? routeSched.symcCores : owner === 'UIH' ? routeSched.uihCores : (routeSched.itelCores || 0);
                          const allocation = getApprovalAllocation(actualRoute, routeEncs, owner);

                          const colorStyle = owner === 'SYMC' ? 'text-pink-400 bg-pink-500/10' : owner === 'UIH' ? 'text-sky-400 bg-sky-500/10' : 'text-amber-400 bg-amber-500/10';

                          return {
                            owner,
                            coresCount: ownerCoresCount,
                            coreStr: allocation.coreText,
                            tubeStr: allocation.tubeText,
                            trayStr: allocation.trayText,
                            colorStyle
                          };
                        });
                        const spareAllocation = getApprovalAllocation(actualRoute, routeEncs, 'None', enc => getEnclosureType(enc)?.spliceTrays || 7);

                        return (
                          <div key={routeSched.id || rIdx} className="space-y-2">
                            <div className="text-xs font-black text-sky-400 flex items-center justify-between gap-2 flex-wrap bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
                              <span className="font-bold text-slate-100 flex items-center gap-2">
                                <span className="px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30 font-black text-[10px]">{routeSched.tier}</span>
                                {(() => {
                                  const routeFt = activeFiberTypes.find(ft => ft.cores === totalC || ft.name?.toLowerCase().includes(totalC.toString())) || activeFiberTypes[0];
                                  return routeFt?.imageUrl ? (
                                    <img src={routeFt.imageUrl} alt={routeFt.name} className="w-5 h-5 object-contain rounded bg-slate-800 p-0.5 border border-slate-700" title={routeFt.name} />
                                  ) : null;
                                })()}
                                <span className="text-amber-400 font-extrabold">{routeSched.routeName}</span> ({routeSched.sectionName})
                              </span>
                              <span className="text-slate-400 font-mono text-[11px]">
                                ระยะทาง: <strong className="text-white">{routeSched.distanceKm} km</strong> &bull; ขนาด: <strong className="text-amber-300">OFC {totalC} Core</strong>
                              </span>
                            </div>

                            {(() => {
                              const routeFt = activeFiberTypes.find(ft => ft.cores === totalC || ft.name?.toLowerCase().includes(totalC.toString())) || activeFiberTypes[0];
                              const firstEnc = routeEncs.length > 0 ? parseEnclosureName(routeEncs[0], 0).bjNo : '-';
                              const lastEnc = routeEncs.length > 0 ? parseEnclosureName(routeEncs[routeEncs.length - 1], routeEncs.length - 1).bjNo : '-';
                              const routeBjDisplay = routeEncs.length === 0 ? '-' : routeEncs.length === 1 ? firstEnc : `${firstEnc} - ${lastEnc}`;
                              return routeFt?.imageUrl ? (
                                <div className="approval-dark-feature flex flex-col md:flex-row items-center gap-5 p-5 bg-gradient-to-r from-slate-900 via-slate-950 to-slate-900 rounded-2xl border-2 border-slate-700/90 shadow-2xl">
                                  <div className="relative group shrink-0">
                                    <img
                                      src={routeFt.imageUrl}
                                      alt={routeFt.name}
                                      className="w-56 h-56 sm:w-64 sm:h-64 md:w-72 md:h-72 object-contain rounded-2xl bg-slate-950 p-4 border-2 border-sky-500/30 shadow-2xl transition-transform duration-300 group-hover:scale-[1.02]"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => setPreviewingFiberImage({ url: routeFt.imageUrl!, name: routeFt.name, cores: totalC })}
                                      className="absolute bottom-3 right-3 px-2.5 py-1.5 rounded-lg bg-sky-600/90 hover:bg-sky-500 text-white font-bold text-[10px] flex items-center gap-1.5 shadow-lg backdrop-blur-sm transition-all cursor-pointer"
                                    >
                                      <Maximize2 size={12} /> ขยายดูรูปใหญ่
                                    </button>
                                  </div>
                                  <div className="space-y-2.5 flex-1 w-full">
                                    <div className="text-xs font-black text-amber-300 flex items-center gap-2 flex-wrap">
                                      <span className="approval-dark-title text-base md:text-lg font-black text-white tracking-wide">
                                        ประเภทสาย Fiber Optic: {routeFt.name}
                                      </span>
                                      <span className="approval-dark-badge-sky px-2.5 py-0.5 rounded-full bg-sky-500/20 text-sky-300 text-[10.5px] font-mono font-bold border border-sky-500/40">
                                        OFC {totalC} Cores Standard
                                      </span>
                                      <span className="approval-dark-badge-amber px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10.5px] font-mono font-bold border border-amber-500/40">
                                        จุดเชื่อมต่อ {routeBjDisplay} ({routeEncs.length} หัว)
                                      </span>
                                    </div>
                                    <p className="approval-dark-description text-xs text-slate-300 leading-relaxed font-medium">
                                      โครงสร้างสายเคเบิลใยแก้วนำแสงมาตรฐานขนาด {totalC} Core สำหรับการติดตั้งระบบโครงข่ายร่วมกัน (Infra Sharing) รายละเอียดโครงสร้างท่อ Loose Tube และสีของ Core ชัดเจนตามมาตรฐานสากล TIA/EIA-598
                                    </p>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] pt-2 border-t border-slate-800">
                                      <div className="p-2 rounded-lg bg-slate-950/80 border border-slate-800">
                                        <span className="text-slate-400 text-[10px] block">ระยะทางสายเคเบิล:</span>
                                        <strong className="text-emerald-400 text-xs">{routeSched.distanceKm} km</strong>
                                      </div>
                                      <div className="p-2 rounded-lg bg-slate-950/80 border border-slate-800">
                                        <span className="text-slate-400 text-[10px] block">Enclosure ที่เกาะอยู่:</span>
                                        <strong className="text-sky-300 text-xs">{routeBjDisplay}</strong>
                                      </div>
                                      <div className="p-2 rounded-lg bg-slate-950/80 border border-slate-800">
                                        <span className="text-slate-400 text-[10px] block">จำนวนจุดตัดต่อ:</span>
                                        <strong className="text-amber-400 text-xs">{routeEncs.length} หัว</strong>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ) : null;
                            })()}

                             {/* Usage Table */}
                            {(() => {
                              const firstEnclosureName = routeEncs[0]?.name?.trim() || '-';
                              const lastEnclosureName = routeEncs[routeEncs.length - 1]?.name?.trim() || '-';
                              const routeEnclosureNames = routeEncs.length === 0 ? '-' : routeEncs.length === 1 ? firstEnclosureName : `${firstEnclosureName} - ${lastEnclosureName}`;

                              return (
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
                                        <th className="p-1.5 border-r border-slate-700">Enclosure Name</th>
                                        <th className="p-1.5 border-r border-slate-700 text-center">Tray</th>
                                        <th className="p-1.5 border-r border-slate-700">Tube</th>
                                        <th className="p-1.5">Core</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800 font-bold">
                                      {ownerRows.map((row, idx) => {
                                        const isFirst = idx === 0;
                                        return (
                                          <tr key={`${routeSched.id || rIdx}-${row.owner}`}>
                                            {isFirst && (
                                              <td rowSpan={ownerRows.length + 1} className="p-2 border-r border-slate-800 text-amber-400 font-black">
                                                {routeSched.tier}
                                              </td>
                                            )}
                                            <td className={`p-2 border-r border-slate-800 ${row.colorStyle}`}>
                                              <div className="flex items-center justify-center">
                                                <OwnerLogo owner={row.owner} size="xs" />
                                              </div>
                                            </td>
                                            <td className="p-2 border-r border-slate-800 font-bold text-sky-300">
                                              {[row.trayStr, row.tubeStr, row.coreStr].some(value => value !== '-') ? routeEnclosureNames : ''}
                                            </td>
                                            <td className={`p-2 border-r border-slate-800 text-center ${row.colorStyle.split(' ')[0]}`}>{row.trayStr}</td>
                                            <td className={`p-2 border-r border-slate-800 ${row.colorStyle.split(' ')[0]}`}>{row.tubeStr}</td>
                                            <td className={`p-2 ${row.colorStyle.split(' ')[0]}`}>{row.coreStr}</td>
                                          </tr>
                                        );
                                      })}
                                      <tr>
                                        <td className="p-2 border-r border-slate-800 text-slate-400">Spare</td>
                                        <td className="p-2 border-r border-slate-800 font-bold text-slate-400">
                                          {[spareAllocation.trayText, spareAllocation.tubeText, spareAllocation.coreText].some(value => value !== '-') ? routeEnclosureNames : ''}
                                        </td>
                                        <td className="p-2 border-r border-slate-800 text-slate-400 text-center">{spareAllocation.trayText}</td>
                                        <td className="p-2 border-r border-slate-800 text-slate-500">{spareAllocation.tubeText}</td>
                                        <td className="p-2 text-slate-500">{spareAllocation.coreText}</td>
                                      </tr>
                                    </tbody>
                                  </table>
                                </div>
                              );
                            })()}
                          </div>
                        );
                      })}

                                          </div>
                  )}{/* SLIDE 6: INSTALLATION SUMMARY & 2-LEVEL APPROVAL */}
                  {hasApprovalDesign && currentSlide === 6 && (
                    <div className="space-y-4">
                      
                      {/* Installation Scope Overview - Full Project Scope */}
                      <div className="p-4 bg-slate-950/95 rounded-2xl border border-slate-800 text-xs text-slate-300 leading-relaxed shadow-xl space-y-4">
                        
                        {/* Header: Project Info & Contractor Action */}
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="px-2.5 py-1 rounded-lg bg-sky-500/20 text-sky-300 border border-sky-500/30 font-black text-xs">
                              {projectTierName} ({participatingOwners.join('+')})
                            </span>
                            <span className="text-white font-extrabold text-sm md:text-base">
                              {activeProject.name}
                            </span>
                            {designApproval?.documentNumber && (
                              <span className="text-[11px] text-slate-400 font-mono bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                                {designApproval.documentNumber}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            {contractorSaveSuccess && (
                              <span className="text-[11px] text-emerald-400 font-bold flex items-center gap-1 animate-pulse">
                                <Check size={13} /> บันทึกข้อมูลแล้ว
                              </span>
                            )}
                            {(!designApproval || usingLivePreview) && <button
                              type="button"
                              onClick={() => setIsEditingContractor(!isEditingContractor)}
                              className={`px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-all shadow-sm ${
                                isEditingContractor
                                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 hover:bg-rose-500/30'
                                  : 'bg-sky-600 hover:bg-sky-500 text-white'
                              }`}
                            >
                              <Edit3 size={13} />
                              <span>{isEditingContractor ? 'ยกเลิกการแก้ไข' : 'กรอก/แก้ไขข้อมูลผู้รับจ้าง'}</span>
                            </button>}
                          </div>
                        </div>

                        {/* Editable Contractor Form (when isEditingContractor is true) */}
                        {isEditingContractor && (!designApproval || usingLivePreview) && (
                          <div className="p-3.5 bg-slate-900/90 rounded-xl border border-sky-500/40 space-y-3">
                            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                              <span className="text-xs font-black text-sky-400 flex items-center gap-1.5">
                                <Briefcase size={14} /> กรอกรายละเอียดผู้รับจ้างที่ดำเนินการติดตั้ง (Contractor)
                              </span>
                              <span className="text-[10px] text-slate-400">กรอกข้อมูลและกดบันทึกเพื่ออัปเดตแบบฟอร์ม</span>
                            </div>

                            {contractorSaveError && (
                              <div className="p-2 bg-rose-500/20 border border-rose-500/40 rounded-lg text-[11px] text-rose-300 flex items-center gap-1.5">
                                <AlertTriangle size={13} /> {contractorSaveError}
                              </div>
                            )}

                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-[11px]">
                              <div>
                                <label className="block text-slate-300 font-bold mb-1">
                                  ชื่อผู้รับจ้าง / บริษัทที่ติดตั้ง <span className="text-rose-400">*</span>
                                </label>
                                <input
                                  data-wi-pii="approval-company"
                                  type="text"
                                  value={contractorInput}
                                  onChange={e => setContractorInput(e.target.value)}
                                  placeholder="เช่น United Telecommunication Services Co., Ltd."
                                  className="w-full bg-slate-950 border border-slate-700 p-2 rounded-lg text-white outline-none focus:border-sky-500"
                                />
                              </div>

                              <div>
                                <label className="block text-slate-300 font-bold mb-1">
                                  ผู้ควบคุมงาน / ผู้ประสานงาน
                                </label>
                                <input
                                  data-wi-pii="approval-supervisor"
                                  type="text"
                                  value={contractorContactInput}
                                  onChange={e => setContractorContactInput(e.target.value)}
                                  placeholder="เช่น คุณประสิทธิ์ สุขใจ (วิศวกรโครงการ)"
                                  className="w-full bg-slate-950 border border-slate-700 p-2 rounded-lg text-white outline-none focus:border-sky-500"
                                />
                              </div>

                              <div>
                                <label className="block text-slate-300 font-bold mb-1">
                                  เบอร์โทรศัพท์ / ข้อมูลติดต่อ
                                </label>
                                <input
                                  data-wi-pii="approval-phone"
                                  type="text"
                                  value={contractorPhoneInput}
                                  onChange={e => setContractorPhoneInput(e.target.value)}
                                  placeholder="เช่น 02-123-4567, 089-123-4567"
                                  className="w-full bg-slate-950 border border-slate-700 p-2 rounded-lg text-white outline-none focus:border-sky-500"
                                />
                              </div>

                              <div>
                                <label className="block text-slate-300 font-bold mb-1">
                                  เลขที่สัญญา / ใบสั่งจ้าง PO
                                </label>
                                <input
                                  data-wi-pii="approval-contract"
                                  type="text"
                                  value={contractorPoInput}
                                  onChange={e => setContractorPoInput(e.target.value)}
                                  placeholder="เช่น PO-2026-FIBER-089"
                                  className="w-full bg-slate-950 border border-slate-700 p-2 rounded-lg text-white outline-none focus:border-sky-500"
                                />
                              </div>

                              <div>
                                <label className="block text-slate-300 font-bold mb-1">
                                  กำหนดการติดตั้ง (Target Installation Date)
                                </label>
                                <input
                                  type="date"
                                  value={targetInstallDate}
                                  onChange={e => setTargetInstallDate(e.target.value)}
                                  className="w-full bg-slate-950 border border-slate-700 p-2 rounded-lg text-white outline-none focus:border-sky-500"
                                />
                              </div>

                              <div>
                                <label className="block text-slate-300 font-bold mb-1">
                                  ขอบเขตงาน / บันทึกเพิ่มเติม
                                </label>
                                <input
                                  type="text"
                                  value={contractorScopeInput}
                                  onChange={e => setContractorScopeInput(e.target.value)}
                                  placeholder="เช่น ติดตั้งพาดสาย Fiber Optic และเชื่อมสไปรซ์ Enclosure"
                                  className="w-full bg-slate-950 border border-slate-700 p-2 rounded-lg text-white outline-none focus:border-sky-500"
                                />
                              </div>
                            </div>

                            <div className="flex justify-end gap-2 pt-1 border-t border-slate-800">
                              <button
                                type="button"
                                onClick={() => setIsEditingContractor(false)}
                                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs"
                              >
                                ยกเลิก
                              </button>
                              <button
                                type="button"
                                onClick={handleSaveContractorDetails}
                                disabled={isSavingContractor}
                                className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1.5 shadow"
                              >
                                {isSavingContractor ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                                <span>{isSavingContractor ? 'กำลังบันทึก...' : 'บันทึกข้อมูลผู้รับจ้าง'}</span>
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Combined Fiber Optic, sharing and Enclosure summary */}
                        <div className="space-y-2 bg-slate-900/60 p-3 rounded-xl border border-slate-800/80">
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <span className="font-extrabold text-white text-xs">สรุปเส้น Fiber Optic และการใช้งานร่วมกัน</span>
                            <span className="text-[11px] font-bold text-sky-400 bg-sky-500/10 px-2.5 py-0.5 rounded-full border border-sky-500/20">
                              {approvalSummaryRows.length} เส้น | {totalLengthKm} กม.
                            </span>
                          </div>
                          <div className="overflow-x-auto rounded-lg border border-slate-700">
                            <table className="w-full min-w-[900px] table-fixed border-collapse text-[11px] text-left">
                              <colgroup>
                                <col className="w-[15%]" /><col className="w-[29%]" /><col className="w-[13%]" />
                                <col className="w-[22%]" /><col className="w-[21%]" />
                              </colgroup>
                              <thead className="bg-slate-800 text-slate-200">
                                <tr>
                                  <th className="p-2 border-r border-slate-700">Tier</th>
                                  <th className="p-2 border-r border-slate-700">ชื่อเส้น Fiber Optic</th>
                                  <th className="p-2 border-r border-slate-700">สาย / ระยะทาง</th>
                                  <th className="p-2 border-r border-slate-700">สัดส่วนการใช้งาน</th>
                                  <th className="p-2 border-r border-slate-700">Type Enclosure</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-800 bg-slate-950/70 align-top text-slate-200">
                                {approvalSummaryRows.map(({ route, index, typeCounts }) => (
                                  <tr key={route.id || index}>
                                    <td className="p-2 border-r border-slate-800 font-bold text-sky-300 break-words">{route.tier}</td>
                                    <td className="p-2 border-r border-slate-800 font-semibold break-words">{route.routeName}</td>
                                    <td className="p-2 border-r border-slate-800">
                                      <div>OFC {route.capacity} Core</div>
                                      <strong className="text-emerald-400">{route.distanceKm} กม.</strong>
                                    </td>
                                    <td className="p-2 border-r border-slate-800 space-y-1">
                                      {participatingOwners.map(owner => (
                                        <div key={owner} className="break-words">
                                          <strong className={owner === 'SYMC' ? 'text-pink-400' : owner === 'UIH' ? 'text-sky-400' : 'text-amber-400'}>{owner}:</strong>{' '}
                                          {getCoreShareText(getOwnerCoreCount(route, owner), route.capacity)}
                                        </div>
                                      ))}
                                    </td>
                                    <td className="p-2 border-r border-slate-800 space-y-1">
                                      {typeCounts.length ? typeCounts.map(type => (
                                        <div key={type.name} className="break-words">{type.name} <strong className="text-amber-300">({type.count} หัว)</strong></div>
                                      )) : '-'}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot className="approval-summary-total-row bg-sky-500/10 font-bold text-sky-200">
                                <tr>
                                  <td className="p-2 border-r border-slate-700">รวม</td>
                                  <td className="p-2 border-r border-slate-700">{approvalSummaryRows.length} เส้น Fiber Optic</td>
                                  <td className="p-2 border-r border-slate-700">{totalLengthKm} กม.</td>
                                  <td className="p-2 border-r border-slate-700">
                                    {participatingOwners.map(owner => (
                                      <div key={owner}>{owner}: {owner === 'SYMC' ? fiberRouteTotals.symcCores : owner === 'UIH' ? fiberRouteTotals.uihCores : fiberRouteTotals.itelCores} Core</div>
                                    ))}
                                  </td>
                                  <td className="p-2 border-r border-slate-700">
                                    {approvalEnclosureTypeTotals.length ? approvalEnclosureTypeTotals.map(type => (
                                      <div key={type.name} className="break-words">{type.name} <strong>({type.count} หัว)</strong></div>
                                    )) : '-'}
                                  </td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        </div>

                        {/* SECTION 2: CONTRACTOR OVERVIEW CARD */}
                        <div className="p-3 bg-slate-900/90 rounded-xl border border-slate-800 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-extrabold text-white text-xs flex items-center gap-1.5">
                              <span className="w-4 h-4 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center text-[10px] font-black">2</span>
                              ผู้รับจ้างที่ดำเนินการติดตั้ง (Contractor):
                            </span>
                            {!isEditingContractor && (!designApproval || usingLivePreview) && (
                              <button
                                type="button"
                                onClick={() => setIsEditingContractor(true)}
                                className="text-[11px] text-sky-400 hover:text-sky-300 flex items-center gap-1 font-bold underline cursor-pointer"
                              >
                                <Edit3 size={11} /> แก้ไขข้อมูลผู้รับจ้าง
                              </button>
                            )}
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-[11px]">
                            <div className="p-2 rounded-lg bg-slate-950 border border-slate-800/80">
                              <span className="text-slate-400 block text-[10px]">ชื่อบริษัทผู้รับจ้าง:</span>
                              <strong data-wi-pii="approval-company" className="text-white truncate block" title={contractorView.name}>
                                {contractorView.name}
                              </strong>
                            </div>
                            <div className="p-2 rounded-lg bg-slate-950 border border-slate-800/80">
                              <span className="text-slate-400 block text-[10px]">ผู้ควบคุมงาน / ประสานงาน:</span>
                              <span data-wi-pii="approval-supervisor" className="text-slate-200 truncate block">
                                {contractorView.contact}
                              </span>
                            </div>
                            <div className="p-2 rounded-lg bg-slate-950 border border-slate-800/80">
                              <span className="text-slate-400 block text-[10px]">เบอร์ติดต่อ:</span>
                              <span data-wi-pii="approval-phone" className="text-slate-200 truncate block">
                                {contractorView.phone}
                              </span>
                            </div>
                            <div className="p-2 rounded-lg bg-slate-950 border border-slate-800/80">
                              <span className="text-slate-400 block text-[10px]">เลขที่สัญญา / PO:</span>
                              <span data-wi-pii="approval-contract" className="text-amber-300 truncate block font-mono">
                                {contractorView.po}
                              </span>
                            </div>
                          </div>

                          {contractorView.scope && (
                            <div className="text-[10px] text-slate-400 px-2 py-1 bg-slate-950/60 rounded border border-slate-800/60">
                              <span className="text-slate-300 font-bold mr-1">ขอบเขตงาน:</span> {contractorView.scope}
                            </div>
                          )}
                        </div>

                        {/* Joint Resolution Note */}
                        <div className="text-center font-black text-sky-300 bg-sky-950/80 border border-sky-500/40 py-2.5 px-4 rounded-xl shadow-lg text-xs sm:text-sm">
                          "โดยมีมติสรุปเห็นชอบร่วมกับดำเนินการ ตามรายละเอียดดังกล่าวข้างต้น"
                        </div>

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
                                        <div data-wi-pii="approval-signature" className="h-14 w-full rounded bg-white/90 flex items-center justify-center p-1">
                                          {signOff.signatureDataUrl && <img data-wi-pii="previous-signature" src={signOff.signatureDataUrl} alt="ลายเซ็น" className="max-h-full max-w-full object-contain" />}
                                        </div>
                                        <p data-wi-pii="approval-signer-name" className="text-[11px] font-bold text-white break-words">ชื่อ-นามสกุล: {signOff.signedBy || '-'}</p>
                                        <p className="text-[10px] text-slate-400 break-words">ตำแหน่ง: {signOff.position || 'ไม่ได้ระบุ'}</p>
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
                                  {isSigned && canCorrectSignOff() && (
                                    <button
                                      onClick={() => handleOpenSignModal(owner, 'Planning', signOff)}
                                      className="mt-2 w-full py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-[11px] rounded-lg"
                                    >
                                      แก้ไขข้อมูล / ลงนามใหม่
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
                                        <div data-wi-pii="approval-signature" className="h-14 w-full rounded bg-white/90 flex items-center justify-center p-1">
                                          {signOff.signatureDataUrl && <img data-wi-pii="previous-signature" src={signOff.signatureDataUrl} alt="ลายเซ็น" className="max-h-full max-w-full object-contain" />}
                                        </div>
                                        <p data-wi-pii="previous-signer" className="text-[11px] font-bold text-white break-words">ชื่อ-นามสกุล: {signOff.signedBy || '-'}</p>
                                        <p className="text-[10px] text-slate-400 break-words">ตำแหน่ง: {signOff.position || 'ไม่ได้ระบุ'}</p>
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
                                  {isSigned && canCorrectSignOff() && (
                                    <button
                                      onClick={() => handleOpenSignModal(owner, 'OM', signOff)}
                                      className="mt-2 w-full py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-[11px] rounded-lg"
                                    >
                                      แก้ไขข้อมูล / ลงนามใหม่
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

          {/* APPROVAL REQUEST FORM */}
          {viewMode === 'request' && (
            <div className="max-w-2xl mx-auto p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-5">
              <div className="border-b border-slate-800 pb-4">
                <button onClick={() => setViewMode('slides')} className="mb-3 text-xs font-bold text-sky-400 hover:text-sky-300">← กลับไปสไลด์นำเสนอ</button>
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
                    data-wi-pii="approval-request-company"
                    type="text"
                    value={contractorInput}
                    onChange={e => setContractorInput(e.target.value)}
                    onBlur={() => saveDraftField('contractorName', contractorInput)}
                    className="w-full bg-slate-950 border border-slate-700 p-2.5 rounded-xl text-white outline-none focus:border-sky-500"
                    placeholder="เช่น United Telecommunication Services Co., Ltd."
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-300 mb-1">ระยะดำเนินการเคเบิล (Total km)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={operationKmInput}
                    onChange={e => setOperationKmInput(e.target.value)}
                    onBlur={() => saveDraftField('totalOperationDistanceKm', Number.parseFloat(operationKmInput) || 0)}
                    className="w-full bg-slate-950 border border-slate-700 p-2.5 rounded-xl text-white outline-none focus:border-sky-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-300 mb-1">บันทึกหรือข้อความประกอบการยื่นขออนุมัติ</label>
                  <textarea
                    data-wi-pii="approval-request-notes"
                    rows={3}
                    value={requestNotes}
                    onChange={e => setRequestNotes(e.target.value)}
                    onBlur={() => saveDraftField('designNotes', requestNotes)}
                    placeholder="ระบุข้อกำหนดหรือหมายเหตุสำคัญสำหรับการก่อสร้าง..."
                    className="w-full bg-slate-950 border border-slate-700 p-2.5 rounded-xl text-white outline-none focus:border-sky-500"
                  />
                </div>

                <div className="pt-2">
                  <button
                    onClick={handleSubmitApprovalRequest}
                    disabled={isSubmitting || liveSource.routes.length === 0 || liveSource.enclosures.length === 0 ||
                      isLoadingData || Boolean(sourceError) || !permissions?.requestApproval}
                    className="w-full py-3 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-extrabold rounded-xl shadow-lg shadow-sky-500/20 flex items-center justify-center gap-2 transition-all"
                  >
                    {isSubmitting ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
                    <span>{isLoadingData ? 'กำลังโหลดข้อมูลโครงการ…' : 'ส่งคำขออนุมัติแบบ (เริ่มระดับที่ 1: Planning)'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>

      </div>

      {/* SIGNING MODAL POPUP */}
      {signingModalOpen && signingTarget && (
        <div className="fixed inset-0 z-[1600] flex items-center justify-center p-3 bg-slate-950/80 backdrop-blur-md">
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
              <button type="button" aria-label="ปิด" onClick={closeSigningModal} className="text-slate-400 hover:text-white">
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-300 mb-1">ชื่อ-นามสกุล ผู้ลงนาม</label>
                <input
                  data-wi-pii="signer-name"
                  type="text"
                  value={signerName}
                  onChange={e => setSignerName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 p-2.5 rounded-xl text-white outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-300 mb-1">ตำแหน่ง</label>
                <input
                  data-wi-pii="signer-position"
                  type="text"
                  value={signerPosition}
                  onChange={e => setSignerPosition(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 p-2.5 rounded-xl text-white outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-bold text-slate-300">ลายเซ็น (Digital Signature)</label>
                  <button onClick={clearSignature} className="text-[10px] text-slate-400 hover:text-amber-400">
                    ล้างลายเซ็น
                  </button>
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <input
                    ref={signatureFileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/heic,image/heif,.heic,.heif"
                    onChange={handleSignatureFile}
                    className="hidden"
                    aria-label="เลือกภาพลายเซ็น PNG, JPG, WebP หรือ HEIC"
                    disabled={isProcessingSignature}
                  />
                  <button
                    type="button"
                    onClick={() => signatureFileRef.current?.click()}
                    disabled={isProcessingSignature}
                    className="px-3 py-1.5 rounded-lg border border-sky-500/50 bg-sky-500/10 text-sky-300 font-bold hover:bg-sky-500/20 disabled:opacity-50"
                  >
                    แทรกรูปลายเซ็น (PNG/JPG/WebP/HEIC)
                  </button>
                  <span className="text-slate-400">หรือวาดในกรอบด้านล่าง</span>
                </div>
                <div className="relative border-2 border-dashed border-slate-700 rounded-xl bg-white overflow-hidden touch-none">
                  <canvas
                    data-wi-pii="signature-pad"
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
                    className={`w-full h-28 ${isProcessingSignature || uploadedSignature ? 'cursor-default' : 'cursor-crosshair'}`}
                  />
                  {uploadedSignature && (
                    <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: '#fff', backgroundImage: 'linear-gradient(45deg, #e2e8f0 25%, transparent 25%), linear-gradient(-45deg, #e2e8f0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e2e8f0 75%), linear-gradient(-45deg, transparent 75%, #e2e8f0 75%)', backgroundSize: '16px 16px', backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0' }}>
                      <img src={uploadedSignature.dataUrl} alt="ตัวอย่างลายเซ็นหลังลบพื้นหลัง" className="max-w-full max-h-full object-contain" />
                    </div>
                  )}
                </div>
                {isProcessingSignature && <p role="status" className="mt-1 text-[10px] text-sky-300">กำลังประมวลผลลายเซ็น…</p>}
                {uploadedSignature && <p className="mt-1 text-[10px] text-emerald-400">ลบพื้นหลังภาพลายเซ็นให้อัตโนมัติแล้ว</p>}
                {hasSignature && <p className="mt-1 text-[10px] text-emerald-400">ตัวอย่างลายเซ็นที่จะบันทึกแสดงในกรอบด้านบน</p>}
              </div>

              {actionError && (
                <div role="alert" className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-rose-300">
                  {actionError}
                </div>
              )}

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
                  disabled={isSubmitting || isProcessingSignature}
                  className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold rounded-xl flex items-center justify-center gap-1.5 transition-all shadow"
                >
                  <CheckCircle2 size={15} />
                  <span>อนุมัติ (Approve)</span>
                </button>
                <button
                  onClick={() => handleConfirmSignature(false)}
                  disabled={isSubmitting || isProcessingSignature}
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

      {/* ENCLOSURE IMAGE LIGHTBOX PREVIEW */}
      {previewingEnclosureImage && (
        <div 
          className="fixed inset-0 z-[1600] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => setPreviewingEnclosureImage(null)}
        >
          <div 
            className="bg-slate-900 border-2 border-sky-500/50 rounded-3xl max-w-2xl w-full p-6 shadow-2xl space-y-4 relative"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center font-bold">
                  <Box size={18} />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-white">
                    Enclosure Type: {previewingEnclosureImage.name}
                  </h3>
                  <p className="text-[11px] text-slate-400">รูป Enclosure ที่ใช้งานในเส้นทางนี้</p>
                </div>
              </div>
              <button aria-label="ปิด"
                type="button"
                onClick={() => setPreviewingEnclosureImage(null)}
                className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>
            
            <div className="flex justify-center items-center bg-slate-950 rounded-2xl p-6 border border-slate-800 min-h-[360px]">
              <img 
                src={previewingEnclosureImage.url} 
                alt={previewingEnclosureImage.name} 
                className="max-h-[460px] w-auto object-contain drop-shadow-2xl rounded-xl"
              />
            </div>

            <div className="p-3.5 bg-slate-950/80 rounded-xl border border-slate-800 text-xs text-slate-300 flex items-center justify-between flex-wrap gap-2">
              <span className="font-bold text-amber-300">
                รูปประกอบ Enclosure Type ที่บันทึกไว้ในระบบ
              </span>
              <span className="text-[11px] font-mono text-slate-400">
                {previewingEnclosureImage.name}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* FIBER OPTIC IMAGE LIGHTBOX PREVIEW */}
      {previewingFiberImage && (
        <div
          className="fixed inset-0 z-[1600] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => setPreviewingFiberImage(null)}
        >
          <div
            className="bg-slate-900 border-2 border-sky-500/50 rounded-3xl max-w-2xl w-full p-6 shadow-2xl space-y-4 relative"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center font-bold">
                  <Cable size={18} />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-white">
                    {previewingFiberImage.name} (OFC {previewingFiberImage.cores} Cores)
                  </h3>
                  <p className="text-[11px] text-slate-400">รูปภาพโครงสร้างสายเคเบิลใยแก้วนำแสงความละเอียดสูง (Cross-Section Diagram)</p>
                </div>
              </div>
              <button aria-label="ปิด"
                type="button"
                onClick={() => setPreviewingFiberImage(null)}
                className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex justify-center items-center bg-slate-950 rounded-2xl p-6 border border-slate-800 min-h-[360px]">
              <img
                src={previewingFiberImage.url}
                alt={previewingFiberImage.name}
                className="max-h-[460px] w-auto object-contain drop-shadow-2xl rounded-xl"
              />
            </div>
            <div className="p-3.5 bg-slate-950/80 rounded-xl border border-slate-800 text-xs text-slate-300 flex items-center justify-between flex-wrap gap-2">
              <span className="font-bold text-amber-300">
                มาตรฐานการจัดเรียง Loose Tube & โค้ดสี Core ตามมาตรฐาน TIA/EIA-598
              </span>
              <span className="text-[11px] font-mono text-slate-400">
                ขนาด {previewingFiberImage.cores}C &bull; Infra Sharing Certified
              </span>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

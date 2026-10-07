import { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { MapPin, Route as RouteIcon, User as UserIcon, Check, X as XIcon, Layers, Pencil, LogOut, Loader2, ChevronDown, ChevronRight, ChevronLeft, GitMerge, Settings as SettingsIcon, AlertTriangle, AlertCircle, Network, ExternalLink, FileText, ShieldCheck, Clock, CheckCircle2 } from 'lucide-react';
import { BrowserRouter, Routes, Route, Navigate, useParams, useNavigate } from 'react-router-dom';
import FiberMap from './components/FiberMap';
import CoreManager from './components/CoreManager';
import SpliceManager from './components/SpliceManager';
import Login from './components/Login';
import ProjectsDashboard from './components/ProjectsDashboard';
import { DesignApprovalModal } from './components/DesignApprovalModal';
import { SettingsManager } from './components/SettingsManager';
import { UserManagement } from './components/UserManagement';
import { PermissionManagement } from './components/PermissionManagement';
import { LogViewer } from './components/LogViewer';
import { PendingApproval } from './components/PendingApproval';
import { ProfileSettings } from './components/ProfileSettings';
import { ForceChangePassword } from './components/ForceChangePassword';
import SystemManual from './components/SystemManual';
import { Point, FiberEnclosure, Route as RouteType, CoreStatus, CoreOwner, Core, Project, EnclosureType, FiberType, FiberLoop, FiberColorConfig, User as AppUser } from './types';
import { generateCores, DEFAULT_PERMISSIONS } from './constants';
import { getClosestPointOnRoute } from './utils/geo';
import { db, auth, logout, handleFirestoreError, OperationType, onQuotaExceeded } from './firebase';
import { collection, doc, setDoc, deleteDoc, onSnapshot, deleteField, query, where, getDoc, getDocs, limit, writeBatch } from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';
import { motion, AnimatePresence } from 'motion/react';
import { logActivity } from './services/logService';
import { ThemeToggle } from './components/ThemeToggle';
import { useTheme } from './context/ThemeContext';

function ProjectWorkspace({ user, appUser, quotaExceeded = false }: { user: User, appUser: AppUser | null, quotaExceeded?: boolean }) {
  const { projectId } = useParams<{ projectId: string }>();
  const activeProjectId = projectId;
  const navigate = useNavigate();

  const [enclosures, setEnclosures] = useState<FiberEnclosure[]>([]);
  const [routes, setRoutes] = useState<RouteType[]>([]);
  const [loops, setLoops] = useState<FiberLoop[]>([]);
  const [drawingMode, setDrawingMode] = useState<'none' | 'enclosure' | 'route' | 'edit-route' | 'loop' | 'edit-enclosure'>('none');
  const [draftRoute, setDraftRoute] = useState<Point[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<string | undefined>();
  const [selectedEnclosureId, setSelectedEnclosureId] = useState<string | undefined>();
  const [editingRouteId, setEditingRouteId] = useState<string | null>(null);
  const [enclosureTypes, setEnclosureTypes] = useState<EnclosureType[]>([]);
  const [fiberTypes, setFiberTypes] = useState<FiberType[]>([]);
  const [fiberColorConfigs, setFiberColorConfigs] = useState<FiberColorConfig[]>([]);

  useEffect(() => {
    if (!user || !activeProjectId) return;
    const unsubEnclosure = onSnapshot(collection(db, 'enclosureTypes'), (snapshot) => {
      setEnclosureTypes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as EnclosureType)));
    });
    const unsubFiber = onSnapshot(collection(db, 'fiberTypes'), (snapshot) => {
      setFiberTypes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FiberType)));
    });
    return () => { unsubEnclosure(); unsubFiber(); };
  }, [user, activeProjectId]);

  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [approvalModalOpen, setApprovalModalOpen] = useState(false);

  useEffect(() => {
    if (!activeProjectId) return;
    const unsubProject = onSnapshot(doc(db, 'projects', activeProjectId), (snapshot) => {
      if (snapshot.exists()) {
        setCurrentProject({ id: snapshot.id, ...snapshot.data() } as Project);
      }
    });
    return () => unsubProject();
  }, [activeProjectId]);

  // Modal States
  const [enclosureModalOpen, setEnclosureModalOpen] = useState(false);
  const [pendingEnclosurePoint, setPendingEnclosurePoint] = useState<Point | null>(null);
  const [enclosureNameInput, setEnclosureNameInput] = useState('');
  const [enclosureLatInput, setEnclosureLatInput] = useState('');
  const [enclosureLngInput, setEnclosureLngInput] = useState('');
  const [enclosureLocationType, setEnclosureLocationType] = useState('');
  const [enclosureLocationName, setEnclosureLocationName] = useState('');
  const [enclosureTypeId, setEnclosureTypeId] = useState('');

  const [routeModalOpen, setRouteModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [routeNameInput, setRouteNameInput] = useState('');
  const [routeCapacityInput, setRouteCapacityInput] = useState('24');
  const [routeTierInput, setRouteTierInput] = useState('');
  const [routeOwnersInput, setRouteOwnersInput] = useState<CoreOwner[]>(['ITEL', 'SYMC', 'UIH']);
  const [routeMarkStart, setRouteMarkStart] = useState<string>('0');
  const [routeMarkEnd, setRouteMarkEnd] = useState<string>('0');

  const [loopModalOpen, setLoopModalOpen] = useState(false);
  const [pendingLoopPoint, setPendingLoopPoint] = useState<Point | null>(null);
  const [pendingLoopRouteId, setPendingLoopRouteId] = useState<string | null>(null);
  const [loopNameInput, setLoopNameInput] = useState('');
  const [loopLengthInput, setLoopLengthInput] = useState('50');
  const [loopLatInput, setLoopLatInput] = useState('');
  const [loopLngInput, setLoopLngInput] = useState('');
  const [editingLoopId, setEditingLoopId] = useState<string | null>(null);
  const [deleteLoopId, setDeleteLoopId] = useState<string | null>(null);

  const [errorModalOpen, setErrorModalOpen] = useState<string | null>(null);

  const [routesExpanded, setRoutesExpanded] = useState(false);
  const [enclosuresExpanded, setEnclosuresExpanded] = useState(false);
  const [loopsExpanded, setLoopsExpanded] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    if (!user || !activeProjectId) {
      setEnclosures([]);
      setRoutes([]);
      return;
    }
    const enclosuresPath = `projects/${activeProjectId}/enclosures`;
    const routesPath = `projects/${activeProjectId}/routes`;
    const loopsPath = `projects/${activeProjectId}/loops`;
    const colorConfigsPath = 'fiberColorConfigs';

    const unsubscribeNodes = onSnapshot(collection(db, enclosuresPath), (snapshot) => {
      const newEnclosures = snapshot.docs.map(doc => doc.data() as FiberEnclosure);
      setEnclosures(newEnclosures);
    }, (error) => {
      if (error.message.includes('Missing or insufficient permissions')) {
        console.warn('Access denied to project. Redirecting to dashboard.');
        navigate('/');
      } else {
        handleFirestoreError(error, OperationType.LIST, enclosuresPath);
      }
    });

    const unsubscribeRoutes = onSnapshot(collection(db, routesPath), (snapshot) => {
      const newRoutes = snapshot.docs.map(doc => doc.data() as RouteType);
      setRoutes(newRoutes);
    }, (error) => {
      if (error.message.includes('Missing or insufficient permissions')) {
        navigate('/');
      } else {
        handleFirestoreError(error, OperationType.LIST, routesPath);
      }
    });

    const unsubscribeLoops = onSnapshot(collection(db, loopsPath), (snapshot) => {
      const newLoops = snapshot.docs.map(doc => doc.data() as FiberLoop);
      setLoops(newLoops);
    }, (error) => {
      if (error.message.includes('Missing or insufficient permissions')) {
        navigate('/');
      } else {
        handleFirestoreError(error, OperationType.LIST, loopsPath);
      }
    });

    const unsubscribeColorConfigs = onSnapshot(collection(db, colorConfigsPath), (snapshot) => {
      const newConfigs = snapshot.docs.map(doc => doc.data() as FiberColorConfig);
      setFiberColorConfigs(newConfigs);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, colorConfigsPath);
    });

    return () => {
      unsubscribeNodes();
      unsubscribeRoutes();
      unsubscribeLoops();
      unsubscribeColorConfigs();
    };
  }, [user, activeProjectId]);

  const handleMapClick = (point: Point) => {
    const permissions = appUser ? DEFAULT_PERMISSIONS[appUser.role] : DEFAULT_PERMISSIONS['Viewer'];

    if (drawingMode === 'enclosure') {
      if (!permissions.createEnclosures) {
        setErrorModalOpen('You do not have permission to create enclosures.');
        setDrawingMode('none');
        return;
      }
      setPendingEnclosurePoint(point);
      setEnclosureLatInput(point.lat.toFixed(6));
      setEnclosureLngInput(point.lng.toFixed(6));
      setEnclosureModalOpen(true);
      setDrawingMode('none');
    } else if (drawingMode === 'route' || drawingMode === 'edit-route') {
      if (drawingMode === 'route' && !permissions.createRoutes) {
        setErrorModalOpen('You do not have permission to create routes.');
        setDrawingMode('none');
        return;
      }
      if (drawingMode === 'edit-route' && !permissions.editRoutes) {
        setErrorModalOpen('You do not have permission to edit routes.');
        setDrawingMode('none');
        return;
      }
      setDraftRoute([...draftRoute, point]);
    } else if (drawingMode === 'loop') {
      // Find the closest point on any route
      let closestRouteId = null;
      let minDistance = Infinity;
      let snappedPoint = point;

      routes.forEach(route => {
        const { point: cp, distance } = getClosestPointOnRoute(point, route.path);
        if (distance < minDistance) {
          minDistance = distance;
          closestRouteId = route.id;
          snappedPoint = cp;
        }
      });

      // Only snap if within a reasonable distance (e.g., 50 meters)
      if (minDistance < 50 && closestRouteId) {
        setPendingLoopPoint(snappedPoint);
        setPendingLoopRouteId(closestRouteId);
        setLoopNameInput(`Loop ${loops.length + 1}`);
        setLoopLengthInput('50');
        setLoopLatInput(snappedPoint.lat.toFixed(6));
        setLoopLngInput(snappedPoint.lng.toFixed(6));
        setLoopModalOpen(true);
        setDrawingMode('none');
      } else {
        setErrorModalOpen('Please click closer to a Fiber Optic route to add a loop.');
      }
    } else {
      setSelectedRouteId(undefined);
      setSelectedEnclosureId(undefined);
    }
  };

  const handleEnclosureClick = (enclosure: FiberEnclosure) => {
    if (drawingMode === 'none') {
      setSelectedEnclosureId(enclosure.id);
      setSelectedRouteId(undefined);
    }
  };

  const handleMarkerDragEnd = (index: number, point: Point) => {
    const newDraft = [...draftRoute];
    newDraft[index] = point;
    setDraftRoute(newDraft);
  };

  const handleMarkerClick = (index: number) => {
    const newDraft = draftRoute.filter((_, i) => i !== index);
    setDraftRoute(newDraft);
  };

  const handleDraftRouteClick = (point: Point) => {
    if (draftRoute.length < 2) return;
    const { segmentIndex } = getClosestPointOnRoute(point, draftRoute);
    const newDraft = [...draftRoute];
    newDraft.splice(segmentIndex + 1, 0, point);
    setDraftRoute(newDraft);
  };

  const startEditRoute = (route: RouteType) => {
    const permissions = appUser ? DEFAULT_PERMISSIONS[appUser.role] : DEFAULT_PERMISSIONS['Viewer'];
    if (!permissions.editRoutes) {
      setErrorModalOpen('You do not have permission to edit routes.');
      return;
    }
    setDrawingMode('edit-route');
    setEditingRouteId(route.id);
    setDraftRoute(route.path);
    setRouteNameInput(route.name);
    setRouteCapacityInput(route.fiberType || route.capacity.toString());
    setRouteTierInput(route.tierSharing || route.tier || 'Tier 1');
    setRouteOwnersInput(route.tierSharingPartners || route.owners || ['ITEL', 'SYMC', 'UIH']);
    setRouteMarkStart(route.markStart?.toString() || '0');
    setRouteMarkEnd(route.markEnd?.toString() || '0');
    setSelectedRouteId(undefined);
    // Modal will be opened via finishRoute after position editing
  };

  const finishRoute = () => {
    if (draftRoute.length < 2) {
      setErrorModalOpen('A route must have at least 2 points.');
      return;
    }
    if (drawingMode === 'route') {
      setRouteNameInput('');
      setRouteCapacityInput(fiberTypes.length > 0 ? fiberTypes[0].name : '24');
      setRouteTierInput('Tier 1');
      setRouteOwnersInput(['ITEL', 'SYMC', 'UIH']);
      setRouteMarkStart('0');
      setRouteMarkEnd('0');
    }
    setRouteModalOpen(true);
  };

  const handleSaveEnclosure = async () => {
    const permissions = appUser ? DEFAULT_PERMISSIONS[appUser.role] : DEFAULT_PERMISSIONS['Viewer'];
    const lat = parseFloat(enclosureLatInput);
    const lng = parseFloat(enclosureLngInput);

    if (enclosureNameInput.trim() && !isNaN(lat) && !isNaN(lng) && user && activeProjectId) {
      if (editingEnclosureId) {
        if (!permissions.editEnclosures) {
          setErrorModalOpen('You do not have permission to edit enclosures.');
          return;
        }
        const path = `projects/${activeProjectId}/enclosures/${editingEnclosureId}`;
        try {
          await setDoc(doc(db, path), {
            name: enclosureNameInput.trim(),
            position: { lat, lng },
            locationType: enclosureLocationType || deleteField(),
            locationName: enclosureLocationName.trim() || deleteField(),
            enclosureTypeId: enclosureTypeId || deleteField()
          }, { merge: true });
          await logActivity('edit_enclosure', `Edited enclosure ${enclosureNameInput.trim()}`, { enclosureId: editingEnclosureId, projectId: activeProjectId });
        } catch (error) {
          handleFirestoreError(error, OperationType.UPDATE, path);
        }
      } else {
        if (!permissions.createEnclosures) {
          setErrorModalOpen('You do not have permission to create enclosures.');
          return;
        }
        const newEnclosure: any = { 
          id: uuidv4(), 
          name: enclosureNameInput.trim(), 
          position: { lat, lng }, 
          uid: user.uid
        };
        if (enclosureLocationType) newEnclosure.locationType = enclosureLocationType;
        if (enclosureLocationName.trim()) newEnclosure.locationName = enclosureLocationName.trim();
        if (enclosureTypeId) newEnclosure.enclosureTypeId = enclosureTypeId;
        
        const path = `projects/${activeProjectId}/enclosures/${newEnclosure.id}`;
        try {
          await setDoc(doc(db, path), newEnclosure);
          await logActivity('create_enclosure', `Created enclosure ${newEnclosure.name}`, { enclosureId: newEnclosure.id, projectId: activeProjectId });
        } catch (error) {
          handleFirestoreError(error, OperationType.CREATE, path);
        }
      }
    } else {
      setErrorModalOpen('Please enter a valid name and coordinates.');
      return;
    }
    setEnclosureModalOpen(false);
    setPendingEnclosurePoint(null);
    setEditingEnclosureId(null);
    setOriginalEnclosurePosition(null);
    setDrawingMode('none');
    setEnclosureLatInput('');
    setEnclosureLngInput('');
    setEnclosureLocationType('');
    setEnclosureLocationName('');
    setEnclosureTypeId('');
  };

  const handleSaveLoop = async () => {
    if (!user || !activeProjectId) return;

    const lat = parseFloat(loopLatInput);
    const lng = parseFloat(loopLngInput);

    if (isNaN(lat) || isNaN(lng)) {
      setErrorModalOpen('Please enter valid coordinates.');
      return;
    }

    // Re-snap based on potentially edited coordinates
    let closestRouteId = null;
    let minDistance = Infinity;
    let snappedPoint = { lat, lng };

    routes.forEach(route => {
      const { point: cp, distance } = getClosestPointOnRoute({ lat, lng }, route.path);
      if (distance < minDistance) {
        minDistance = distance;
        closestRouteId = route.id;
        snappedPoint = cp;
      }
    });

    if (!closestRouteId || minDistance >= 100) {
      setErrorModalOpen('The coordinates must be close to a Fiber Optic route (within 100m).');
      return;
    }

    const newLoop: FiberLoop = {
      id: editingLoopId || uuidv4(),
      name: loopNameInput.trim() || 'Unnamed Loop',
      position: snappedPoint,
      routeId: closestRouteId,
      length: parseFloat(loopLengthInput) || 50,
      uid: user.uid
    };

    const path = `projects/${activeProjectId}/loops/${newLoop.id}`;
    try {
      await setDoc(doc(db, path), newLoop);
      await logActivity(editingLoopId ? 'edit_loop' : 'create_loop', `${editingLoopId ? 'Edited' : 'Created'} loop ${newLoop.name}`, { loopId: newLoop.id, projectId: activeProjectId });
      setLoopModalOpen(false);
      setPendingLoopPoint(null);
      setPendingLoopRouteId(null);
      setEditingLoopId(null);
      setLoopLatInput('');
      setLoopLngInput('');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  };

  const handleDeleteLoop = async (loopId: string) => {
    if (!user || !activeProjectId) return;
    const path = `projects/${activeProjectId}/loops/${loopId}`;
    try {
      await deleteDoc(doc(db, path));
      await logActivity('delete_loop', `Deleted loop`, { loopId, projectId: activeProjectId });
      setDeleteLoopId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  const handleSaveRoute = async () => {
    const permissions = appUser ? DEFAULT_PERMISSIONS[appUser.role] : DEFAULT_PERMISSIONS['Viewer'];
    if (!user) return;
    const selectedFiberType = fiberTypes.find(ft => ft.name === routeCapacityInput);
    
    let capacity = NaN;
    if (selectedFiberType) {
      capacity = selectedFiberType.coreCapacity || (selectedFiberType.tubes || 1) * (selectedFiberType.cores || 12);
    } else {
      const match = routeCapacityInput.match(/\d+/);
      capacity = match ? parseInt(match[0], 10) : NaN;
    }
    
    const tubes = selectedFiberType ? (selectedFiberType.tubes || 1) : 0;

    if (!routeNameInput.trim()) {
      setErrorModalOpen('Route name is required.');
      return;
    }
    if (isNaN(capacity) || capacity <= 0) {
      setErrorModalOpen('Invalid capacity. The selected Fiber Type must contain a positive number of cores or have a number in its name (e.g., "24 Cores").');
      return;
    }

    if (routeTierInput === 'Tier 2' && routeOwnersInput.length !== 2) {
      setErrorModalOpen('Tier 2 routes must have exactly 2 owners selected.');
      return;
    }

    const startPoint = draftRoute[0];
    const endPoint = draftRoute[draftRoute.length - 1];
    const startEnclosure = enclosures.find(n => Math.hypot(n.position.lat - startPoint.lat, n.position.lng - startPoint.lng) < 0.00025);
    const endEnclosure = enclosures.find(n => Math.hypot(n.position.lat - endPoint.lat, n.position.lng - endPoint.lng) < 0.00025);

    const markStart = parseFloat(routeMarkStart) || 0;
    const markEnd = parseFloat(routeMarkEnd) || 0;
    const totalLength = Math.abs(markEnd - markStart);

    if (editingRouteId) {
      if (!permissions.editRoutes) {
        setErrorModalOpen('You do not have permission to edit routes.');
        return;
      }
      const existingRoute = routes.find(r => r.id === editingRouteId);
      if (existingRoute) {
        const routeOwners = routeTierInput === 'Tier 1' ? ['ITEL', 'SYMC', 'UIH'] as CoreOwner[] : routeOwnersInput;
        let newCores = [...existingRoute.cores];
        if (capacity > existingRoute.capacity) {
          const extraCores = generateCores(capacity, tubes).slice(existingRoute.capacity);
          newCores = [...newCores, ...extraCores];
        } else if (capacity < existingRoute.capacity) {
          newCores = newCores.slice(0, capacity);
        }
        const updatedRoute: RouteType = {
          ...existingRoute,
          name: routeNameInput.trim(),
          capacity,
          path: draftRoute,
          cores: newCores,
          tier: routeTierInput,
          fiberType: routeCapacityInput,
          tierSharing: routeTierInput as 'Tier 1' | 'Tier 2',
          tierSharingPartners: routeOwners,
          markStart,
          markEnd,
          totalLength,
          owners: routeOwners,
        };
        if (startEnclosure?.id) updatedRoute.startEnclosureId = startEnclosure.id;
        else delete updatedRoute.startEnclosureId;
        
        if (endEnclosure?.id) updatedRoute.endEnclosureId = endEnclosure.id;
        else delete updatedRoute.endEnclosureId;

        const path = `projects/${activeProjectId}/routes/${updatedRoute.id}`;
        try {
          await setDoc(doc(db, path), updatedRoute);
          await logActivity('edit_route', `Edited route ${updatedRoute.name}`, { routeId: updatedRoute.id, projectId: activeProjectId });
        } catch (error) {
          handleFirestoreError(error, OperationType.UPDATE, path);
        }
      }
      setEditingRouteId(null);
    } else {
      if (!permissions.createRoutes) {
        setErrorModalOpen('You do not have permission to create routes.');
        return;
      }
      const routeOwners = routeTierInput === 'Tier 1' ? ['ITEL', 'SYMC', 'UIH'] as CoreOwner[] : routeOwnersInput;
      const newRoute: RouteType = {
        id: uuidv4(),
        name: routeNameInput.trim(),
        path: draftRoute,
        capacity,
        cores: generateCores(capacity, tubes),
        tier: routeTierInput,
        fiberType: routeCapacityInput,
        tierSharing: routeTierInput as 'Tier 1' | 'Tier 2',
        tierSharingPartners: routeOwners,
        markStart,
        markEnd,
        totalLength,
        owners: routeOwners,
        uid: user.uid
      };
      if (startEnclosure?.id) newRoute.startEnclosureId = startEnclosure.id;
      if (endEnclosure?.id) newRoute.endEnclosureId = endEnclosure.id;

      const path = `projects/${activeProjectId}/routes/${newRoute.id}`;
      try {
        await setDoc(doc(db, path), newRoute);
        await logActivity('create_route', `Created route ${newRoute.name}`, { routeId: newRoute.id, projectId: activeProjectId });
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, path);
      }
    }

    setDraftRoute([]);
    setDrawingMode('none');
    setRouteModalOpen(false);
  };

  const cancelRoute = () => {
    setDraftRoute([]);
    setDrawingMode('none');
    setEditingRouteId(null);
  };

  const [deleteRouteId, setDeleteRouteId] = useState<string | null>(null);
  const [deleteEnclosureId, setDeleteEnclosureId] = useState<string | null>(null);
  const [editingEnclosureId, setEditingEnclosureId] = useState<string | null>(null);
  const [originalEnclosurePosition, setOriginalEnclosurePosition] = useState<Point | null>(null);

  const handleDeleteRoute = (routeId: string) => {
    const permissions = appUser ? DEFAULT_PERMISSIONS[appUser.role] : DEFAULT_PERMISSIONS['Viewer'];
    if (!permissions.deleteRoutes) {
      setErrorModalOpen('You do not have permission to delete routes.');
      return;
    }
    setDeleteRouteId(routeId);
  };

  const confirmDeleteRoute = async () => {
    if (deleteRouteId && user) {
      const path = `projects/${activeProjectId}/routes/${deleteRouteId}`;
      try {
        await deleteDoc(doc(db, path));
        await logActivity('delete_route', `Deleted route`, { routeId: deleteRouteId, projectId: activeProjectId });
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, path);
      }
      if (selectedRouteId === deleteRouteId) {
        setSelectedRouteId(undefined);
      }
      setDeleteRouteId(null);
    }
  };

  const startEditEnclosure = (enclosure: FiberEnclosure) => {
    const permissions = appUser ? DEFAULT_PERMISSIONS[appUser.role] : DEFAULT_PERMISSIONS['Viewer'];
    if (!permissions.editEnclosures) {
      setErrorModalOpen('You do not have permission to edit enclosures.');
      return;
    }
    setEditingEnclosureId(enclosure.id);
    setEnclosureNameInput(enclosure.name);
    setEnclosureLatInput(enclosure.position.lat.toString());
    setEnclosureLngInput(enclosure.position.lng.toString());
    setEnclosureLocationType(enclosure.locationType || '');
    setEnclosureLocationName(enclosure.locationName || '');
    setEnclosureTypeId(enclosure.enclosureTypeId || '');
    setOriginalEnclosurePosition(enclosure.position);
    setDrawingMode('edit-enclosure');
  };

  const handleDeleteEnclosure = (enclosureId: string) => {
    const permissions = appUser ? DEFAULT_PERMISSIONS[appUser.role] : DEFAULT_PERMISSIONS['Viewer'];
    if (!permissions.deleteEnclosures) {
      setErrorModalOpen('You do not have permission to delete enclosures.');
      return;
    }
    setDeleteEnclosureId(enclosureId);
  };

  const confirmDeleteEnclosure = async () => {
    if (deleteEnclosureId && user) {
      const path = `projects/${activeProjectId}/enclosures/${deleteEnclosureId}`;
      try {
        await deleteDoc(doc(db, path));
        await logActivity('delete_enclosure', `Deleted enclosure`, { enclosureId: deleteEnclosureId, projectId: activeProjectId });
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, path);
      }
      if (selectedEnclosureId === deleteEnclosureId) {
        setSelectedEnclosureId(undefined);
      }
      setDeleteEnclosureId(null);
    }
  };

  const handleUpdateRouteSide = async (enclosureId: string, routeId: string, side: 'left' | 'right' | 'top' | 'bottom') => {
    if (!user || !activeProjectId) return;
    console.log('Updating route side:', { enclosureId, routeId, side });
    const path = `projects/${activeProjectId}/enclosures/${enclosureId}`;
    try {
      const enclosure = enclosures.find(e => e.id === enclosureId);
      if (!enclosure) return;
      const routeSideOverrides = { ...(enclosure.routeSideOverrides || {}), [routeId]: side };
      await setDoc(doc(db, path), { routeSideOverrides }, { merge: true });
      await logActivity('update_route_side', `Updated route side for route ${routeId} to ${side}`, { enclosureId, routeId, side, projectId: activeProjectId });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  const handleUpdateEnclosure = async (enclosureId: string, data: Partial<FiberEnclosure>) => {
    if (!user || !activeProjectId) return;
    const path = `projects/${activeProjectId}/enclosures/${enclosureId}`;
    try {
      await setDoc(doc(db, path), data, { merge: true });
      await logActivity('update_enclosure', `Updated enclosure data`, { enclosureId, projectId: activeProjectId });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  const handleUpdatePortAssignment = async (enclosureId: string, portId: number, data: { owner?: CoreOwner, routeId?: string }) => {
    if (!user || !activeProjectId) return;
    const path = `projects/${activeProjectId}/enclosures/${enclosureId}`;
    try {
      const enclosure = enclosures.find(e => e.id === enclosureId);
      const currentAssignments = enclosure?.portAssignments || {};
      await setDoc(doc(db, path), { 
        portAssignments: {
          ...currentAssignments,
          [portId]: { ...currentAssignments[portId], ...data }
        }
      }, { merge: true });
      await logActivity('update_port_assignment', `Updated port assignment for port ${portId}`, { enclosureId, portId, data, projectId: activeProjectId });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  const handleUpdateTrayOwner = async (enclosureId: string, trayId: number, owner: CoreOwner) => {
    if (!user || !activeProjectId) return;
    const path = `projects/${activeProjectId}/enclosures/${enclosureId}`;
    try {
      const enclosure = enclosures.find(e => e.id === enclosureId);
      if (!enclosure) return;
      const trayAssignments = { ...(enclosure.trayAssignments || {}), [trayId]: owner };
      await setDoc(doc(db, path), { trayAssignments }, { merge: true });
      await logActivity('update_tray_owner', `Updated tray owner for tray ${trayId} to ${owner}`, { enclosureId, trayId, owner, projectId: activeProjectId });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  const handleUpdateCore = async (routeId: string, coreId: number, data: Partial<Core>) => {
    if (!user || !activeProjectId) return;
    console.log('Updating core:', { routeId, coreId, data });
    const route = routes.find(r => r.id === routeId);
    if (!route) {
      console.error('Route not found:', routeId);
      return;
    }

    const updatedRoute: RouteType = {
      ...route,
      cores: route.cores.map(c => c.id === coreId ? { ...c, ...data } : c)
    };

    const path = `projects/${activeProjectId}/routes/${routeId}`;
    try {
      await setDoc(doc(db, path), updatedRoute);
      await logActivity('update_core', `Updated core ${coreId} on route ${routeId}`, { routeId, coreId, data, projectId: activeProjectId });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  const handleUpdateCores = async (routeId: string, updates: { coreId: number, data: Partial<Core> }[]) => {
    if (!user || !activeProjectId) return;
    console.log('Updating cores:', { routeId, updates });
    const route = routes.find(r => r.id === routeId);
    if (!route) {
      console.error('Route not found:', routeId);
      return;
    }

    const updatedCores = route.cores.map(c => {
      const update = updates.find(u => u.coreId === c.id);
      return update ? { ...c, ...update.data } : c;
    });

    const updatedRoute: RouteType = {
      ...route,
      cores: updatedCores
    };

    const path = `projects/${activeProjectId}/routes/${routeId}`;
    try {
      await setDoc(doc(db, path), updatedRoute);
      await logActivity('update_cores_bulk', `Bulk updated cores on route ${routeId}`, { routeId, updatesCount: updates.length, projectId: activeProjectId });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  const handleSplice = async (enclosureId: string, routeAId: string, coreAId: number, routeBId: string, coreBId: number) => {
    if (!user) return;
    const routeA = routes.find(r => r.id === routeAId);
    const routeB = routes.find(r => r.id === routeBId);
    if (!routeA || !routeB) return;

    if (routeAId === routeBId) {
      const updatedRoute = {
        ...routeA,
        cores: routeA.cores.map(c => {
          if (c.id === coreAId) {
            return {
              ...c,
              splices: { ...(c.splices || {}), [enclosureId]: { routeId: routeBId, coreId: coreBId } }
            };
          }
          if (c.id === coreBId) {
            return {
              ...c,
              splices: { ...(c.splices || {}), [enclosureId]: { routeId: routeAId, coreId: coreAId } }
            };
          }
          return c;
        })
      };
      try {
        await setDoc(doc(db, `projects/${activeProjectId}/routes/${routeAId}`), updatedRoute);
        await logActivity('splice_cores', `Spliced core ${coreAId} to core ${coreBId} on route ${routeAId}`, { enclosureId, routeAId, coreAId, routeBId, coreBId, projectId: activeProjectId });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `projects/${activeProjectId}/routes`);
      }
      return;
    }

    const updatedRouteA = {
      ...routeA,
      cores: routeA.cores.map(c => c.id === coreAId ? {
        ...c,
        splices: { ...(c.splices || {}), [enclosureId]: { routeId: routeBId, coreId: coreBId } }
      } : c)
    };

    const updatedRouteB = {
      ...routeB,
      cores: routeB.cores.map(c => c.id === coreBId ? {
        ...c,
        splices: { ...(c.splices || {}), [enclosureId]: { routeId: routeAId, coreId: coreAId } }
      } : c)
    };

    try {
      await setDoc(doc(db, `projects/${activeProjectId}/routes/${routeAId}`), updatedRouteA);
      await setDoc(doc(db, `projects/${activeProjectId}/routes/${routeBId}`), updatedRouteB);
      await logActivity('splice_cores', `Spliced core ${coreAId} on route ${routeAId} to core ${coreBId} on route ${routeBId}`, { enclosureId, routeAId, coreAId, routeBId, coreBId, projectId: activeProjectId });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `projects/${activeProjectId}/routes`);
    }
  };

  const handleUnsplice = async (enclosureId: string, routeId: string, coreId: number) => {
    if (!user) return;
    const route = routes.find(r => r.id === routeId);
    const core = route?.cores.find(c => c.id === coreId);
    const splice = core?.splices?.[enclosureId];

    if (!splice || !route) return;
    const routeB = routes.find(r => r.id === splice.routeId);
    if (!routeB) return;

    if (route.id === routeB.id) {
      const updatedRoute = {
        ...route,
        cores: route.cores.map(c => {
          if (c.id === coreId || c.id === splice.coreId) {
            const newSplices = { ...c.splices };
            delete newSplices[enclosureId];
            return { ...c, splices: newSplices };
          }
          return c;
        })
      };
      try {
        await setDoc(doc(db, `projects/${activeProjectId}/routes/${route.id}`), updatedRoute);
        await logActivity('unsplice_cores', `Unspliced core ${coreId} on route ${routeId}`, { enclosureId, routeId, coreId, projectId: activeProjectId });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `projects/${activeProjectId}/routes`);
      }
      return;
    }

    const updatedRouteA = {
      ...route,
      cores: route.cores.map(c => {
        if (c.id === coreId) {
          const newSplices = { ...c.splices };
          delete newSplices[enclosureId];
          return { ...c, splices: newSplices };
        }
        return c;
      })
    };

    const updatedRouteB = {
      ...routeB,
      cores: routeB.cores.map(c => {
        if (c.id === splice.coreId) {
          const newSplices = { ...c.splices };
          delete newSplices[enclosureId];
          return { ...c, splices: newSplices };
        }
        return c;
      })
    };

    try {
      await setDoc(doc(db, `projects/${activeProjectId}/routes/${route.id}`), updatedRouteA);
      await setDoc(doc(db, `projects/${activeProjectId}/routes/${routeB.id}`), updatedRouteB);
      await logActivity('unsplice_cores', `Unspliced core ${coreId} on route ${routeId}`, { enclosureId, routeId, coreId, projectId: activeProjectId });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `projects/${activeProjectId}/routes`);
    }
  };

  const handleUnspliceTube = async (enclosureId: string, routeId: string, tubeId: number) => {
    if (!user) return;
    const route = routes.find(r => r.id === routeId);
    if (!route) return;

    const startCore = (tubeId - 1) * 12 + 1;
    const endCore = startCore + 11;

    // Find all connected routes that need updating
    const routesToUpdate = new Map<string, RouteType>();
    routesToUpdate.set(route.id, { ...route, cores: [...route.cores] });

    for (let i = startCore; i <= endCore; i++) {
      const core = route.cores.find(c => c.id === i);
      const splice = core?.splices?.[enclosureId];
      if (splice) {
        // Remove splice from Route A
        const routeAToUpdate = routesToUpdate.get(route.id)!;
        routeAToUpdate.cores = routeAToUpdate.cores.map(c => {
          if (c.id === i) {
            const newSplices = { ...c.splices };
            delete newSplices[enclosureId];
            return { ...c, splices: newSplices };
          }
          return c;
        });

        // Remove splice from Route B
        let routeBToUpdate = routesToUpdate.get(splice.routeId);
        if (!routeBToUpdate) {
          const originalRouteB = routes.find(r => r.id === splice.routeId);
          if (originalRouteB) {
            routeBToUpdate = { ...originalRouteB, cores: [...originalRouteB.cores] };
            routesToUpdate.set(splice.routeId, routeBToUpdate);
          }
        }

        if (routeBToUpdate) {
          routeBToUpdate.cores = routeBToUpdate.cores.map(c => {
            if (c.id === splice.coreId) {
              const newSplices = { ...c.splices };
              delete newSplices[enclosureId];
              return { ...c, splices: newSplices };
            }
            return c;
          });
        }
      }
    }

    try {
      const batch = writeBatch(db);
      for (const [id, updatedRoute] of routesToUpdate.entries()) {
        batch.set(doc(db, `projects/${activeProjectId}/routes/${id}`), updatedRoute);
      }
      await batch.commit();
      await logActivity('unsplice_tube', `Unspliced tube ${tubeId} on route ${routeId}`, { enclosureId, routeId, tubeId, projectId: activeProjectId });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `projects/${activeProjectId}/routes`);
    }
  };

  const handleUnspliceAll = async (enclosureId: string, routeId: string) => {
    if (!user) return;
    const route = routes.find(r => r.id === routeId);
    if (!route) return;

    // Find all splices for this route at this enclosure
    const splicesToRemove: { routeId: string, coreId: number, otherRouteId: string, otherCoreId: number }[] = [];
    
    route.cores.forEach(core => {
      const splice = core.splices?.[enclosureId];
      if (splice) {
        splicesToRemove.push({
          routeId: route.id,
          coreId: core.id,
          otherRouteId: splice.routeId,
          otherCoreId: splice.coreId
        });
      }
    });

    if (splicesToRemove.length === 0) return;

    // Group updates by routeId to minimize setDoc calls
    const routeUpdates: Record<string, RouteType> = {};

    const getRoute = (id: string) => {
      if (routeUpdates[id]) return routeUpdates[id];
      const r = routes.find(x => x.id === id);
      if (r) {
        routeUpdates[id] = JSON.parse(JSON.stringify(r)); // deep copy
        return routeUpdates[id];
      }
      return null;
    };

    splicesToRemove.forEach(s => {
      const rA = getRoute(s.routeId);
      const rB = getRoute(s.otherRouteId);

      if (rA) {
        const coreA = rA.cores.find(c => c.id === s.coreId);
        if (coreA && coreA.splices) {
          delete coreA.splices[enclosureId];
        }
      }

      if (rB) {
        const coreB = rB.cores.find(c => c.id === s.otherCoreId);
        if (coreB && coreB.splices) {
          delete coreB.splices[enclosureId];
        }
      }
    });

    try {
      const promises = Object.entries(routeUpdates).map(([id, updatedRoute]) => 
        setDoc(doc(db, `projects/${activeProjectId}/routes/${id}`), updatedRoute)
      );
      await Promise.all(promises);
      await logActivity('unsplice_all', `Unspliced all cores on route ${routeId}`, { enclosureId, routeId, projectId: activeProjectId });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `projects/${activeProjectId}/routes`);
    }
  };

  const handleSpliceTube = async (enclosureId: string, routeAId: string, tubeAIds: number[], routeBId: string, tubeBIds: number[]) => {
    if (!user) return;
    
    const routeA = routes.find(r => r.id === routeAId);
    const routeB = routes.find(r => r.id === routeBId);
    if (!routeA || !routeB) return;

    if (routeAId === routeBId) {
      let updatedRoute = { ...routeA, cores: [...routeA.cores] };
      for (let i = 0; i < Math.min(tubeAIds.length, tubeBIds.length); i++) {
        const tubeAId = tubeAIds[i];
        const tubeBId = tubeBIds[i];
        if (tubeAId === tubeBId) {
          const startCore = (tubeAId - 1) * 12 + 1;
          updatedRoute.cores = updatedRoute.cores.map(c => {
            if (c.id >= startCore && c.id < startCore + 12) {
              return {
                ...c,
                splices: { ...(c.splices || {}), [enclosureId]: { routeId: routeAId, coreId: c.id } }
              };
            }
            return c;
          });
          continue;
        }
        const startCoreA = (tubeAId - 1) * 12 + 1;
        const startCoreB = (tubeBId - 1) * 12 + 1;

        updatedRoute.cores = updatedRoute.cores.map(c => {
          if (c.id >= startCoreA && c.id < startCoreA + 12) {
            const offset = c.id - startCoreA;
            return {
              ...c,
              splices: { ...(c.splices || {}), [enclosureId]: { routeId: routeAId, coreId: startCoreB + offset } }
            };
          }
          if (c.id >= startCoreB && c.id < startCoreB + 12) {
            const offset = c.id - startCoreB;
            return {
              ...c,
              splices: { ...(c.splices || {}), [enclosureId]: { routeId: routeAId, coreId: startCoreA + offset } }
            };
          }
          return c;
        });
      }

      try {
        await setDoc(doc(db, `projects/${activeProjectId}/routes/${routeAId}`), updatedRoute);
        await logActivity('splice_tubes', `Spliced tubes on route ${routeAId}`, { enclosureId, routeAId, tubeAIds, tubeBIds, projectId: activeProjectId });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `projects/${activeProjectId}/routes`);
      }
      return;
    }

    const updatedRouteA = { ...routeA, cores: [...routeA.cores] };
    const updatedRouteB = { ...routeB, cores: [...routeB.cores] };

    for (let i = 0; i < Math.min(tubeAIds.length, tubeBIds.length); i++) {
      const tubeAId = tubeAIds[i];
      const tubeBId = tubeBIds[i];
      const startCoreA = (tubeAId - 1) * 12 + 1;
      const startCoreB = (tubeBId - 1) * 12 + 1;

      updatedRouteA.cores = updatedRouteA.cores.map(c => {
        if (c.id >= startCoreA && c.id < startCoreA + 12) {
          const offset = c.id - startCoreA;
          return {
            ...c,
            splices: { ...(c.splices || {}), [enclosureId]: { routeId: routeBId, coreId: startCoreB + offset } }
          };
        }
        return c;
      });

      updatedRouteB.cores = updatedRouteB.cores.map(c => {
        if (c.id >= startCoreB && c.id < startCoreB + 12) {
          const offset = c.id - startCoreB;
          return {
            ...c,
            splices: { ...(c.splices || {}), [enclosureId]: { routeId: routeAId, coreId: startCoreA + offset } }
          };
        }
        return c;
      });
    }

    try {
      await setDoc(doc(db, `projects/${activeProjectId}/routes/${routeAId}`), updatedRouteA);
      await setDoc(doc(db, `projects/${activeProjectId}/routes/${routeBId}`), updatedRouteB);
      await logActivity('splice_tubes', `Spliced tubes on route ${routeAId} to route ${routeBId}`, { enclosureId, routeAId, tubeAIds, routeBId, tubeBIds, projectId: activeProjectId });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `projects/${activeProjectId}/routes`);
    }
  };

  const selectedRoute = routes.find(r => r.id === selectedRouteId);

  return (
    <div className="h-screen flex flex-col overflow-hidden font-sans bg-slate-950 text-slate-100">
      <AnimatePresence>
        {quotaExceeded && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-rose-600 text-slate-100 px-4 py-2 flex items-center justify-between gap-4 z-[2000] shadow-lg"
          >
            <div className="flex items-center gap-3 text-sm font-black uppercase tracking-widest">
              <AlertTriangle className="w-5 h-5" />
              <span>Daily Write Limit Reached (Firestore Quota Exceeded)</span>
            </div>
            <div className="flex items-center gap-4">
              <p className="text-[10px] font-bold opacity-90 hidden sm:block">
                The free tier daily write limit has been reached. Saving is disabled until the quota resets (usually at midnight PST).
              </p>
              <button 
                onClick={() => window.location.reload()}
                className="px-3 py-1 bg-slate-800 hover:bg-slate-600 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all"
              >
                Retry
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar Area */}
      <div className="relative flex h-full shrink-0 z-[1002]">
        <div 
          className={`glass-panel h-full flex flex-col transition-all duration-500 ease-in-out overflow-hidden ${sidebarCollapsed ? '-translate-x-full w-0' : 'translate-x-0 w-84 md:w-[350px]'}`}
        >
          {/* Sidebar Top Header */}
          <div className="p-4.5 border-b border-slate-800 bg-slate-900/60 backdrop-blur-md flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 bg-brand-600 rounded-xl flex items-center justify-center shrink-0 shadow-lg shadow-brand-500/20">
                  <RouteIcon className="text-slate-100 w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-sm font-black text-slate-100 tracking-tight leading-tight font-display truncate">FIBER SHARING DATABASE</h1>
                  <p className="text-[10px] text-brand-400 font-black uppercase tracking-widest truncate">Network Infra</p>
                </div>
              </div>
            </div>

            {/* Top Toolbar Actions */}
            <div className="flex items-center justify-between gap-1 p-1 bg-slate-950/40 rounded-xl border border-slate-800/80">
              <div className="flex items-center gap-1">
                <button 
                  onClick={() => navigate('/profile')} 
                  className="p-2 text-slate-400 hover:text-brand-400 hover:bg-brand-500/10 rounded-lg transition-all overflow-hidden" 
                  title="Profile Settings"
                >
                  {appUser?.photoURL ? (
                    <img src={appUser.photoURL} alt="Profile" className="w-5 h-5 rounded object-cover border border-slate-700" referrerPolicy="no-referrer" />
                  ) : (
                    <UserIcon size={16} />
                  )}
                </button>
                <button onClick={() => navigate('/settings')} className="p-2 text-slate-400 hover:text-brand-400 hover:bg-brand-500/10 rounded-lg transition-all" title="Settings">
                  <SettingsIcon size={16} />
                </button>
                <button 
                  onClick={() => navigate('/manual')} 
                  className="p-2 text-slate-400 hover:text-brand-400 hover:bg-brand-500/10 rounded-lg transition-all" 
                  title="คู่มือระบบ (PDF)"
                >
                  <FileText size={16} />
                </button>
              </div>

              <div className="flex items-center gap-1">
                <ThemeToggle className="!p-1.5" />
                <button onClick={logout} className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-all" title="Logout">
                  <LogOut size={16} />
                </button>
              </div>
            </div>
          </div>

          {/* Project Header & Design Approval Bar */}
          <div className="p-3 border-b border-slate-800 bg-slate-900/40 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <button 
                onClick={() => navigate('/')}
                className="btn-secondary text-[11px] font-semibold flex items-center justify-center gap-1.5 py-1.5 px-3"
              >
                <ChevronLeft size={13} /> Back to Projects
              </button>

              {currentProject && (() => {
                const status = currentProject.status || currentProject.designApproval?.status || 'Draft';
                return (
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border flex items-center gap-1 ${
                    status === 'Approved'
                      ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                      : status === 'Pending Approval'
                      ? 'bg-amber-500/15 border-amber-500/30 text-amber-400'
                      : status === 'Rejected'
                      ? 'bg-rose-500/15 border-rose-500/30 text-rose-400'
                      : 'bg-slate-800 border-slate-700 text-slate-400'
                  }`}>
                    {status === 'Approved' ? <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" /> : status === 'Pending Approval' ? <Clock className="w-2.5 h-2.5 text-amber-400 animate-pulse" /> : null}
                    {status === 'Approved' ? 'ผ่านการอนุมัติ' : status === 'Pending Approval' ? 'รออนุมัติ' : status === 'Rejected' ? 'ไม่อนุมัติ' : 'แบบร่าง'}
                  </span>
                );
              })()}
            </div>

            {currentProject && (
              <div className="bg-slate-950/70 p-2.5 rounded-xl border border-slate-800/80 flex items-center justify-between gap-2 shadow-inner">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold text-slate-200 truncate">{currentProject.name}</p>
                  <p className="text-[9px] text-slate-500 font-mono truncate">
                    {currentProject.owners?.join(', ') || currentProject.owner || 'Participating Owners'}
                  </p>
                </div>
                <button
                  onClick={() => setApprovalModalOpen(true)}
                  className={`px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all shrink-0 border ${
                    (currentProject.status || currentProject.designApproval?.status) === 'Approved'
                      ? 'bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border-emerald-500/40'
                      : (currentProject.status || currentProject.designApproval?.status) === 'Pending Approval'
                      ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 border-amber-400 font-black shadow-md shadow-amber-500/20'
                      : 'bg-brand-600 hover:bg-brand-500 text-white border-brand-500 shadow-sm'
                  }`}
                  title="Design Approval & Management Sign-off"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>
                    {(currentProject.status || currentProject.designApproval?.status) === 'Approved' 
                      ? 'เอกสารอนุมัติ' 
                      : (currentProject.status || currentProject.designApproval?.status) === 'Pending Approval'
                      ? 'ลงนามอนุมัติ'
                      : 'ขออนุมัติ Design'}
                  </span>
                </button>
              </div>
            )}
          </div>

          <div className="p-3.5 flex flex-col gap-2 border-b border-slate-800 bg-slate-900/20">
            <div className="grid grid-cols-2 gap-2">
              {(!appUser || DEFAULT_PERMISSIONS[appUser.role].editMap) && (
                <>
                  <button
                    onClick={() => { 
                      setEnclosureNameInput('');
                      setEnclosureLatInput('');
                      setEnclosureLngInput('');
                      setEnclosureLocationType('');
                      setEnclosureLocationName('');
                      setPendingEnclosurePoint(null);
                      setEnclosureModalOpen(true);
                      setDrawingMode('none');
                      setDraftRoute([]); 
                      setSelectedRouteId(undefined); 
                      setEditingRouteId(null); 
                    }}
                    disabled={quotaExceeded}
                    className={`flex flex-col items-center justify-center p-2.5 rounded-xl border transition-all gap-1.5 ${enclosureModalOpen ? 'bg-brand-600/10 border-brand-500 text-brand-400 shadow-md shadow-brand-500/10' : 'bg-slate-900/50 border-slate-800 text-slate-400 hover:border-slate-700 hover:bg-slate-800/50'} ${quotaExceeded ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <MapPin size={18} className={enclosureModalOpen ? 'text-brand-400' : 'text-slate-500'} />
                    <span className="text-[10px] font-bold uppercase tracking-wider">Enclosure</span>
                  </button>
                  <button
                    onClick={() => { setDrawingMode('route'); setDraftRoute([]); setSelectedRouteId(undefined); setEditingRouteId(null); }}
                    disabled={quotaExceeded}
                    className={`flex flex-col items-center justify-center p-2.5 rounded-xl border transition-all gap-1.5 ${drawingMode === 'route' ? 'bg-brand-600/10 border-brand-500 text-brand-400 shadow-md shadow-brand-500/10' : 'bg-slate-900/50 border-slate-800 text-slate-400 hover:border-slate-700 hover:bg-slate-800/50'} ${quotaExceeded ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <RouteIcon size={18} className={drawingMode === 'route' ? 'text-brand-400' : 'text-slate-500'} />
                    <span className="text-[10px] font-bold uppercase tracking-wider">Route</span>
                  </button>
                  <button
                    onClick={() => { setDrawingMode('loop'); setDraftRoute([]); setSelectedRouteId(undefined); setEditingRouteId(null); }}
                    disabled={quotaExceeded}
                    className={`flex flex-col items-center justify-center p-2.5 rounded-xl border transition-all gap-1.5 ${drawingMode === 'loop' ? 'bg-brand-600/10 border-brand-500 text-brand-400 shadow-md shadow-brand-500/10' : 'bg-slate-900/50 border-slate-800 text-slate-400 hover:border-slate-700 hover:bg-slate-800/50'} ${quotaExceeded ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <GitMerge size={18} className={drawingMode === 'loop' ? 'text-brand-400' : 'text-slate-500'} />
                    <span className="text-[10px] font-bold uppercase tracking-wider">Loop</span>
                  </button>
                </>
              )}
              <button
                onClick={() => setDrawingMode('none')}
                className={`flex flex-col items-center justify-center p-2.5 rounded-xl border transition-all gap-1.5 ${drawingMode === 'none' ? 'bg-slate-800 border-slate-600 text-slate-200 shadow-sm' : 'bg-slate-900/50 border-slate-800 text-slate-400 hover:border-slate-700 hover:bg-slate-800/50'}`}
              >
                <Layers size={18} className="text-slate-500" />
                <span className="text-[10px] font-bold uppercase tracking-wider">Select</span>
              </button>
            </div>
          </div>

          {(drawingMode === 'route' || drawingMode === 'edit-route' || drawingMode === 'edit-enclosure') && (
            <div className="p-5 bg-brand-600/10 border-b border-brand-500/20">
              <p className="text-[11px] text-brand-400 mb-4 font-black uppercase tracking-widest leading-relaxed">
                {drawingMode === 'edit-route' 
                  ? 'Edit route path. Drag points to move, click to remove, click map to add.' 
                  : drawingMode === 'edit-enclosure'
                  ? 'Drag the enclosure marker to its new position.'
                  : 'Click on the map to draw the route.'}
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={() => {
                    if (drawingMode === 'edit-enclosure') {
                      setEnclosureModalOpen(true);
                    } else {
                      finishRoute();
                    }
                  }} 
                  disabled={quotaExceeded}
                  className={`flex-1 btn-primary text-xs py-3 flex items-center justify-center gap-2 ${quotaExceeded ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <Check className="w-4 h-4" /> {drawingMode === 'route' ? 'Finish Drawing' : 'Save Position'}
                </button>
                <button 
                  onClick={() => {
                    if (originalEnclosurePosition && editingEnclosureId) {
                      setEnclosures(prev => prev.map(e => e.id === editingEnclosureId ? { ...e, position: originalEnclosurePosition } : e));
                    }
                    cancelRoute();
                    setEditingEnclosureId(null);
                    setOriginalEnclosurePosition(null);
                    setDrawingMode('none');
                  }} 
                  className="flex-1 btn-secondary text-xs py-3 flex items-center justify-center gap-2"
                >
                  <XIcon className="w-4 h-4" /> Cancel
                </button>
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
            <div className="space-y-3">
              <button 
                onClick={() => setRoutesExpanded(!routesExpanded)}
                className="w-full flex items-center justify-between group"
              >
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-4 bg-brand-500 rounded-full shadow-lg shadow-brand-500/50"></div>
                  <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Routes</span>
                  <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded-lg font-black">{routes.length}</span>
                </div>
                {routesExpanded ? <ChevronDown className="w-4 h-4 text-slate-500 group-hover:text-slate-300 transition-colors" /> : <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-slate-300 transition-colors" />}
              </button>
              
              <AnimatePresence>
                {routesExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    {routes.length === 0 ? (
                      <p className="text-xs text-slate-500 italic px-3 py-2">No routes drawn yet.</p>
                    ) : (
                      <ul className="space-y-2">
                        {routes.map(route => (
                          <li
                            key={route.id}
                            onClick={() => {
                              if (drawingMode === 'none') setSelectedRouteId(route.id);
                            }}
                            className={`p-3 rounded-2xl cursor-pointer text-sm transition-all border ${selectedRouteId === route.id ? 'bg-slate-800 border-brand-500 shadow-lg shadow-brand-500/10' : 'bg-slate-900/50 border-slate-800 text-slate-400 hover:border-slate-700 hover:bg-slate-800/50'} ${editingRouteId === route.id ? 'opacity-50 ring-2 ring-amber-500' : ''}`}
                          >
                            <div className="flex justify-between items-center">
                              <div className="flex flex-col min-w-0">
                                <span className="font-bold text-slate-200 truncate">{route.name}</span>
                                {(route.fiberType || route.tier) && <span className="text-[10px] text-slate-500 font-black uppercase mt-0.5 tracking-wider">{route.fiberType || route.tier}</span>}
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <div className="flex flex-col items-end mr-1">
                                  <span className="text-[10px] px-2 py-0.5 bg-slate-800 rounded-lg text-slate-300 font-black tracking-wider">{route.capacity}F</span>
                                  {route.totalLength !== undefined && <span className="text-[9px] text-brand-400 font-black mt-1">{route.totalLength}m</span>}
                                </div>
                                {(!appUser || DEFAULT_PERMISSIONS[appUser.role].editMap) && (
                                  <>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); startEditRoute(route); }}
                                      className="p-1.5 hover:bg-brand-500/20 rounded-lg text-brand-400 transition-colors"
                                    >
                                      <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleDeleteRoute(route.id); }}
                                      className="p-1.5 hover:bg-rose-500/20 rounded-lg text-rose-400 transition-colors"
                                    >
                                      <XIcon className="w-3.5 h-3.5" />
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="space-y-3">
              <button 
                onClick={() => setEnclosuresExpanded(!enclosuresExpanded)}
                className="w-full flex items-center justify-between group"
              >
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-4 bg-rose-500 rounded-full shadow-lg shadow-rose-500/50"></div>
                  <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Enclosures</span>
                  <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded-lg font-black">{enclosures.length}</span>
                </div>
                {enclosuresExpanded ? <ChevronDown className="w-4 h-4 text-slate-500 group-hover:text-slate-300 transition-colors" /> : <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-slate-300 transition-colors" />}
              </button>

              <AnimatePresence>
                {enclosuresExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    {enclosures.length === 0 ? (
                      <p className="text-xs text-slate-500 italic px-3 py-2">No enclosures added yet.</p>
                    ) : (
                      <ul className="space-y-2">
                        {enclosures.map(enclosure => (
                          <li 
                            key={enclosure.id} 
                            className={`p-3 rounded-2xl border text-sm transition-all cursor-pointer group ${
                              selectedEnclosureId === enclosure.id 
                                ? 'bg-slate-800 border-rose-500 shadow-lg shadow-rose-500/10' 
                                : 'bg-slate-900/50 border-slate-800 text-slate-400 hover:border-rose-500/50 hover:bg-slate-800/50'
                            }`}
                            onClick={() => {
                              if (drawingMode === 'none') {
                                setSelectedEnclosureId(enclosure.id);
                                setSelectedRouteId(undefined);
                              }
                            }}
                          >
                            <div className="flex justify-between items-center">
                              <div className="flex flex-col min-w-0">
                                <span className="font-bold text-slate-200 truncate">{enclosure.name}</span>
                                <span className="text-[10px] text-slate-500 font-black uppercase mt-0.5 tracking-wider">{enclosure.locationType || 'Enclosure'}</span>
                              </div>
                              <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                {(!appUser || DEFAULT_PERMISSIONS[appUser.role].editMap) && (
                                  <>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); startEditEnclosure(enclosure); }}
                                      className="p-1.5 hover:bg-rose-500/20 rounded-lg text-rose-400 transition-colors"
                                    >
                                      <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setDeleteEnclosureId(enclosure.id); }}
                                      className="p-1.5 hover:bg-rose-500/30 rounded-lg text-rose-500 transition-colors"
                                    >
                                      <XIcon className="w-3.5 h-3.5" />
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="space-y-3">
              <button 
                onClick={() => setLoopsExpanded(!loopsExpanded)}
                className="w-full flex items-center justify-between group"
              >
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-4 bg-amber-500 rounded-full shadow-lg shadow-amber-500/50"></div>
                  <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Loops</span>
                  <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded-lg font-black">{loops.length}</span>
                </div>
                {loopsExpanded ? <ChevronDown className="w-4 h-4 text-slate-500 group-hover:text-slate-300 transition-colors" /> : <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-slate-300 transition-colors" />}
              </button>

              <AnimatePresence>
                {loopsExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    {loops.length === 0 ? (
                      <p className="text-xs text-slate-500 italic px-3 py-2">No loops added yet.</p>
                    ) : (
                      <ul className="space-y-2">
                        {loops.map(loop => (
                          <li 
                            key={loop.id} 
                            className="p-3 rounded-2xl border border-slate-800 bg-slate-900/50 text-sm transition-all cursor-pointer hover:border-amber-500/50 hover:bg-slate-800/50 group"
                          >
                            <div className="flex justify-between items-center">
                              <div className="flex flex-col min-w-0">
                                <span className="font-bold text-slate-200 truncate">{loop.name}</span>
                                <span className="text-[10px] text-slate-500 font-black uppercase mt-0.5 tracking-wider">Length: {loop.length}m</span>
                              </div>
                              <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                {(!appUser || DEFAULT_PERMISSIONS[appUser.role].editMap) && (
                                  <>
                                    <button
                                      onClick={(e) => { 
                                        e.stopPropagation(); 
                                        setEditingLoopId(loop.id);
                                        setLoopNameInput(loop.name);
                                        setLoopLengthInput(loop.length.toString());
                                        setLoopLatInput(loop.position.lat.toFixed(6));
                                        setLoopLngInput(loop.position.lng.toFixed(6));
                                        setPendingLoopPoint(loop.position);
                                        setPendingLoopRouteId(loop.routeId);
                                        setLoopModalOpen(true);
                                      }}
                                      className="p-1.5 hover:bg-amber-500/20 rounded-lg text-amber-400 transition-colors"
                                    >
                                      <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setDeleteLoopId(loop.id); }}
                                      className="p-1.5 hover:bg-rose-500/20 rounded-lg text-rose-400 transition-colors"
                                    >
                                      <XIcon className="w-3.5 h-3.5" />
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* Sidebar Toggle Button */}
        <button 
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className={`absolute top-1/2 -translate-y-1/2 left-full z-[1001] bg-slate-900 border-y border-r border-slate-800 py-6 px-1 rounded-r-2xl shadow-2xl hover:bg-slate-800 transition-all duration-500 flex items-center justify-center group`}
          title={sidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          {sidebarCollapsed ? <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-slate-100 transition-colors" /> : <ChevronLeft className="w-5 h-5 text-slate-400 group-hover:text-slate-100 transition-colors" />}
        </button>
      </div>

      {/* Main Map Area */}
      <div key={activeProjectId} className="flex-1 relative z-0 min-h-0 min-w-0 p-4 bg-slate-950">
        <div className="w-full h-full rounded-[2rem] overflow-hidden shadow-2xl border border-slate-800 relative">
          <FiberMap
            enclosures={enclosures}
            routes={routes}
            loops={loops}
            enclosureTypes={enclosureTypes}
            fiberTypes={fiberTypes}
            fiberColorConfigs={fiberColorConfigs}
            drawingMode={drawingMode}
            draftRoute={draftRoute}
            onMapClick={handleMapClick}
            onRouteClick={(route) => {
              if (drawingMode === 'none') {
                setSelectedRouteId(route.id);
                setSelectedEnclosureId(undefined);
              }
            }}
            onEnclosureClick={handleEnclosureClick}
            onEditRoute={startEditRoute}
            onEditEnclosure={startEditEnclosure}
            onEnclosureDragEnd={(enclosure, point) => {
              setEnclosureLatInput(point.lat.toString());
              setEnclosureLngInput(point.lng.toString());
              setEnclosures(prev => prev.map(e => e.id === enclosure.id ? { ...e, position: point } : e));
            }}
            selectedRouteId={selectedRouteId}
            selectedEnclosureId={selectedEnclosureId}
            editingRouteId={editingRouteId}
            editingEnclosureId={editingEnclosureId}
            onMarkerDragEnd={handleMarkerDragEnd}
            onMarkerClick={handleMarkerClick}
            onDraftRouteClick={handleDraftRouteClick}
            sidebarCollapsed={sidebarCollapsed}
          />
        </div>
      </div>

      {/* Right Panel: Core Manager */}
      {selectedRoute && drawingMode === 'none' && (
        <CoreManager
          route={selectedRoute}
          appUser={appUser}
          onClose={() => setSelectedRouteId(undefined)}
          onUpdateCore={handleUpdateCore}
          onUpdateCores={handleUpdateCores}
        />
      )}

      {/* Right Panel: Splice Manager */}
      {selectedEnclosureId && drawingMode === 'none' && enclosures.find(n => n.id === selectedEnclosureId) && (
        <SpliceManager
          enclosure={enclosures.find(n => n.id === selectedEnclosureId)!}
          routes={routes}
          enclosureTypes={enclosureTypes}
          fiberTypes={fiberTypes}
          fiberColorConfigs={fiberColorConfigs}
          appUser={appUser}
          onClose={() => setSelectedEnclosureId(undefined)}
          onSplice={handleSplice}
          onUnsplice={handleUnsplice}
          onUnspliceAll={handleUnspliceAll}
          onUnspliceTube={handleUnspliceTube}
          onSpliceTube={handleSpliceTube}
          onUpdateTrayOwner={handleUpdateTrayOwner}
          onUpdateRouteSide={handleUpdateRouteSide}
          onUpdatePortAssignment={handleUpdatePortAssignment}
          onUpdateCore={handleUpdateCore}
          onUpdateEnclosure={handleUpdateEnclosure}
          onEditEnclosure={(enclosure) => {
            setEditingEnclosureId(enclosure.id);
            setEnclosureNameInput(enclosure.name);
            setEnclosureLatInput(enclosure.position.lat.toFixed(6));
            setEnclosureLngInput(enclosure.position.lng.toFixed(6));
            setEnclosureLocationType(enclosure.locationType || '');
            setEnclosureLocationName(enclosure.locationName || '');
            setEnclosureTypeId(enclosure.enclosureTypeId || '');
            setDrawingMode('edit-enclosure');
            setSelectedEnclosureId(undefined);
          }}
          quotaExceeded={quotaExceeded}
        />
      )}

      {/* Modals */}
      {currentProject && approvalModalOpen && (
        <DesignApprovalModal
          isOpen={approvalModalOpen}
          onClose={() => setApprovalModalOpen(false)}
          project={currentProject}
          appUser={appUser}
          routes={routes}
          enclosures={enclosures}
          onProjectUpdated={(updated) => setCurrentProject(updated)}
        />
      )}

        {enclosureModalOpen && (
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-md z-[2000] flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              className="glass-panel p-10 rounded-[2.5rem] shadow-2xl w-full max-w-lg border-slate-700"
            >
              <h2 className="text-3xl font-black mb-8 text-slate-100 tracking-tight flex items-center gap-3 font-display">
                <div className="w-10 h-10 bg-brand-600 rounded-xl flex items-center justify-center">
                  <MapPin size={24} />
                </div>
                {editingEnclosureId ? 'Edit Enclosure' : 'Add Enclosure'}
              </h2>
              <div className="space-y-6">
                <div>
                  <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Enclosure Name</label>
                  <input
                    type="text"
                    autoFocus
                    placeholder="e.g., SN-001"
                    className="w-full bg-slate-800/50 border border-slate-700 p-4 rounded-2xl text-slate-100 font-bold focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 outline-none transition-all"
                    value={enclosureNameInput}
                    onChange={e => setEnclosureNameInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSaveEnclosure()}
                  />
                </div>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Enclosure Type</label>
                    <select
                      className="w-full bg-slate-800/50 border border-slate-700 p-4 rounded-2xl text-slate-100 font-bold focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 outline-none transition-all appearance-none"
                      value={enclosureTypeId}
                      onChange={e => setEnclosureTypeId(e.target.value)}
                    >
                      <option value="">Select Type</option>
                      {enclosureTypes.map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Location Type</label>
                    <select
                      className="w-full bg-slate-800/50 border border-slate-700 p-4 rounded-2xl text-slate-100 font-bold focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 outline-none transition-all appearance-none"
                      value={enclosureLocationType}
                      onChange={e => setEnclosureLocationType(e.target.value)}
                    >
                      <option value="">Select Location Type</option>
                      <option value="Pole">Pole</option>
                      <option value="PB">PB</option>
                      <option value="MH">MH</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Location Name</label>
                  <input
                    type="text"
                    placeholder="e.g., MH-123"
                    className="w-full bg-slate-800/50 border border-slate-700 p-4 rounded-2xl text-slate-100 font-bold focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 outline-none transition-all"
                    value={enclosureLocationName}
                    onChange={e => setEnclosureLocationName(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Latitude</label>
                    <input
                      type="number"
                      step="any"
                      placeholder="e.g., 13.7563"
                      className="w-full bg-slate-800/50 border border-slate-700 p-4 rounded-2xl text-slate-100 font-bold focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 outline-none transition-all"
                      value={enclosureLatInput}
                      onChange={e => setEnclosureLatInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleSaveEnclosure()}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Longitude</label>
                    <input
                      type="number"
                      step="any"
                      placeholder="e.g., 100.5018"
                      className="w-full bg-slate-800/50 border border-slate-700 p-4 rounded-2xl text-slate-100 font-bold focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 outline-none transition-all"
                      value={enclosureLngInput}
                      onChange={e => setEnclosureLngInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleSaveEnclosure()}
                    />
                  </div>
                </div>
              </div>
              <div className="flex justify-between items-center mt-10">
                <button
                  onClick={() => {
                    setEnclosureModalOpen(false);
                    setDrawingMode('enclosure');
                  }}
                  className="text-sm text-brand-400 hover:text-brand-300 font-black flex items-center gap-2 transition-colors uppercase tracking-widest"
                >
                  <MapPin className="w-5 h-5" /> Pick on Map
                </button>
                <div className="flex gap-4">
                  <button onClick={() => {
                    setEnclosureModalOpen(false);
                    setEditingEnclosureId(null);
                  }} className="btn-secondary px-6">Cancel</button>
                  <button 
                    onClick={handleSaveEnclosure} 
                    disabled={quotaExceeded}
                    className="btn-primary px-8 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {editingEnclosureId ? 'Save Changes' : 'Save Enclosure'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {deleteEnclosureId && (
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-md z-[3000] flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              className="bg-slate-900 rounded-[2.5rem] shadow-2xl w-full max-w-sm overflow-hidden border border-slate-800"
            >
              <div className="p-8 text-center">
                <div className="w-20 h-20 bg-rose-900/20 rounded-full flex items-center justify-center mx-auto mb-6">
                  <AlertCircle className="w-10 h-10 text-rose-400" />
                </div>
                <h3 className="text-xl font-black text-slate-100 mb-2 tracking-tight font-display">Delete Enclosure?</h3>
                <p className="text-sm text-slate-400 leading-relaxed font-medium">
                  Are you sure you want to delete this enclosure? Any routes connected to it will lose their connection points.
                </p>
              </div>
              <div className="p-6 bg-slate-950 flex gap-3">
                <button 
                  onClick={() => setDeleteEnclosureId(null)}
                  className="flex-1 py-4 bg-slate-900 text-slate-400 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all border border-slate-800"
                >
                  Cancel
                </button>
                <button 
                  onClick={confirmDeleteEnclosure}
                  disabled={quotaExceeded}
                  className="flex-1 py-4 bg-rose-600 text-slate-100 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-rose-700 shadow-lg shadow-rose-900/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {routeModalOpen && (
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-md z-[2000] flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              className="glass-panel p-10 rounded-[2.5rem] shadow-2xl w-full max-w-lg border-slate-700"
            >
              <h2 className="text-3xl font-black mb-8 text-slate-100 tracking-tight flex items-center gap-3 font-display">
                <div className="w-10 h-10 bg-brand-600 rounded-xl flex items-center justify-center">
                  <RouteIcon size={24} />
                </div>
                {editingRouteId ? 'Edit Fiber Route' : 'Save Fiber Route'}
              </h2>
              <div className="space-y-6">
                <div>
                  <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Route Name</label>
                  <input
                    type="text"
                    autoFocus
                    placeholder="e.g., Main Backbone"
                    className="w-full bg-slate-800/50 border border-slate-700 p-4 rounded-2xl text-slate-100 font-bold focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 outline-none transition-all"
                    value={routeNameInput}
                    onChange={e => setRouteNameInput(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Capacity / Fiber Type</label>
                    <select
                      className="w-full bg-slate-800/50 border border-slate-700 p-4 rounded-2xl text-slate-100 font-bold focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 outline-none transition-all appearance-none"
                      value={routeCapacityInput}
                      onChange={e => setRouteCapacityInput(e.target.value)}
                    >
                      {fiberTypes.length > 0 ? (
                        fiberTypes.map(ft => (
                          <option key={ft.id} value={ft.name}>{ft.name}</option>
                        ))
                      ) : (
                        <option value="24">24 Cores (Default)</option>
                      )}
                    </select>
                    {editingRouteId && (() => {
                      const ft = fiberTypes.find(f => f.name === routeCapacityInput);
                      const cap = ft?.cores || (routeCapacityInput.match(/\d+/) ? parseInt(routeCapacityInput.match(/\d+/)![0], 10) : 0);
                      return cap < (routes.find(r => r.id === editingRouteId)?.capacity || 0);
                    })() && (
                      <p className="text-[10px] text-rose-400 mt-2 font-bold uppercase tracking-wider">Warning: Reducing capacity will delete cores from the end.</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Tier</label>
                    <select
                      className="w-full bg-slate-800/50 border border-slate-700 p-4 rounded-2xl text-slate-100 font-bold focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 outline-none transition-all appearance-none"
                      value={routeTierInput}
                      onChange={e => {
                        const newTier = e.target.value as 'Tier 1' | 'Tier 2';
                        setRouteTierInput(newTier);
                        if (newTier === 'Tier 1') {
                          setRouteOwnersInput(['ITEL', 'SYMC', 'UIH']);
                        } else {
                          setRouteOwnersInput([]);
                        }
                      }}
                    >
                      <option value="Tier 1">Tier 1 (ITEL, SYMC, UIH)</option>
                      <option value="Tier 2">Tier 2 (Select 2 Owners)</option>
                    </select>
                  </div>
                </div>

                {routeTierInput === 'Tier 2' && (
                  <div>
                    <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">Select 2 Owners</label>
                    <div className="flex gap-4">
                      {['ITEL', 'SYMC', 'UIH'].map((owner) => (
                        <label key={owner} className="flex items-center gap-3 cursor-pointer group">
                          <div className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center transition-all ${routeOwnersInput.includes(owner as CoreOwner) ? 'bg-brand-600 border-brand-600' : 'bg-slate-800 border-slate-700 group-hover:border-brand-500'}`}>
                            <input
                              type="checkbox"
                              className="hidden"
                              checked={routeOwnersInput.includes(owner as CoreOwner)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  if (routeOwnersInput.length < 2) {
                                    setRouteOwnersInput([...routeOwnersInput, owner as CoreOwner]);
                                  }
                                } else {
                                  setRouteOwnersInput(routeOwnersInput.filter(o => o !== owner));
                                }
                              }}
                              disabled={!routeOwnersInput.includes(owner as CoreOwner) && routeOwnersInput.length >= 2}
                            />
                            {routeOwnersInput.includes(owner as CoreOwner) && <Check className="w-3.5 h-3.5 text-slate-100" />}
                          </div>
                          <span className={`text-xs font-bold transition-colors ${routeOwnersInput.includes(owner as CoreOwner) ? 'text-slate-100' : 'text-slate-400'}`}>{owner}</span>
                        </label>
                      ))}
                    </div>
                    {routeOwnersInput.length !== 2 && (
                      <p className="text-[10px] text-rose-400 mt-2 font-bold uppercase tracking-wider">Please select exactly 2 owners.</p>
                    )}
                  </div>
                )}

                <div>
                  <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">Mark Length (Meters)</label>
                  <div className="grid grid-cols-2 gap-6 mb-4">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">Start</label>
                      <input
                        type="number"
                        placeholder="0"
                        className="w-full bg-slate-800/50 border border-slate-700 p-4 rounded-2xl text-slate-100 font-bold focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 outline-none transition-all"
                        value={routeMarkStart}
                        onChange={e => setRouteMarkStart(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">End</label>
                      <input
                        type="number"
                        placeholder="0"
                        className="w-full bg-slate-800/50 border border-slate-700 p-4 rounded-2xl text-slate-100 font-bold focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 outline-none transition-all"
                        value={routeMarkEnd}
                        onChange={e => setRouteMarkEnd(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 flex justify-between items-center">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Total Length:</span>
                    <span className="text-sm font-black text-brand-400">
                      {Math.abs((parseFloat(routeMarkEnd) || 0) - (parseFloat(routeMarkStart) || 0)).toLocaleString()} m
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-4 mt-10">
                <button onClick={() => setRouteModalOpen(false)} className="btn-secondary px-6">Cancel</button>
                <button 
                  onClick={handleSaveRoute} 
                  disabled={quotaExceeded}
                  className="btn-primary px-8 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {editingRouteId ? 'Save Changes' : 'Save Route'}
                </button>
              </div>
            </motion.div>
          </div>
        )}

          {loopModalOpen && (
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-md z-[2000] flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              className="glass-panel p-10 rounded-[2.5rem] shadow-2xl w-full max-w-lg border-slate-700"
            >
              <h2 className="text-3xl font-black mb-8 text-slate-100 tracking-tight flex items-center gap-3 font-display">
                <div className="w-10 h-10 bg-amber-600 rounded-xl flex items-center justify-center">
                  <GitMerge size={24} />
                </div>
                {editingLoopId ? 'Edit Loop' : 'Add Loop'}
              </h2>
              <div className="space-y-6">
                <div>
                  <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Loop Name</label>
                  <input
                    type="text"
                    autoFocus
                    placeholder="e.g., Loop 1"
                    className="w-full bg-slate-800/50 border border-slate-700 p-4 rounded-2xl text-slate-100 font-bold focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 outline-none transition-all"
                    value={loopNameInput}
                    onChange={e => setLoopNameInput(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Loop Length (Meters)</label>
                  <input
                    type="number"
                    placeholder="e.g., 50"
                    className="w-full bg-slate-800/50 border border-slate-700 p-4 rounded-2xl text-slate-100 font-bold focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 outline-none transition-all"
                    value={loopLengthInput}
                    onChange={e => setLoopLengthInput(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Latitude</label>
                    <input
                      type="text"
                      placeholder="Latitude"
                      className="w-full bg-slate-800/50 border border-slate-700 p-4 rounded-2xl text-slate-100 font-bold focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 outline-none transition-all"
                      value={loopLatInput}
                      onChange={e => setLoopLatInput(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Longitude</label>
                    <input
                      type="text"
                      placeholder="Longitude"
                      className="w-full bg-slate-800/50 border border-slate-700 p-4 rounded-2xl text-slate-100 font-bold focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 outline-none transition-all"
                      value={loopLngInput}
                      onChange={e => setLoopLngInput(e.target.value)}
                    />
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-4 mt-10">
                <button onClick={() => {
                  setLoopModalOpen(false);
                  setEditingLoopId(null);
                  setPendingLoopPoint(null);
                  setPendingLoopRouteId(null);
                  setLoopLatInput('');
                  setLoopLngInput('');
                }} className="btn-secondary px-6">Cancel</button>
                <button 
                  onClick={handleSaveLoop} 
                  disabled={quotaExceeded}
                  className="btn-primary px-8 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {editingLoopId ? 'Save Changes' : 'Save Loop'}
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {deleteLoopId && (
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-md z-[3000] flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              className="bg-slate-900 rounded-[2.5rem] shadow-2xl w-full max-w-sm overflow-hidden border border-slate-800"
            >
              <div className="p-8 text-center">
                <div className="w-20 h-20 bg-rose-900/20 rounded-full flex items-center justify-center mx-auto mb-6">
                  <AlertCircle className="w-10 h-10 text-rose-400" />
                </div>
                <h3 className="text-xl font-black text-slate-100 mb-2 tracking-tight font-display">Delete Loop?</h3>
                <p className="text-sm text-slate-400 leading-relaxed font-medium">
                  Are you sure you want to delete this loop? This action cannot be undone.
                </p>
              </div>
              <div className="p-6 bg-slate-950 flex gap-3">
                <button 
                  onClick={() => setDeleteLoopId(null)}
                  className="flex-1 py-4 bg-slate-900 text-slate-400 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all border border-slate-800"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => handleDeleteLoop(deleteLoopId!)}
                  disabled={quotaExceeded}
                  className="flex-1 py-4 bg-rose-600 text-slate-100 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-rose-700 shadow-lg shadow-rose-900/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {errorModalOpen && (
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-md z-[3000] flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              className="bg-slate-900 rounded-[2.5rem] shadow-2xl w-full max-w-sm overflow-hidden border border-slate-800"
            >
              <div className="p-8 text-center">
                <div className="w-20 h-20 bg-brand-900/20 rounded-full flex items-center justify-center mx-auto mb-6">
                  <AlertCircle className="w-10 h-10 text-brand-400" />
                </div>
                <h3 className="text-xl font-black text-slate-100 mb-2 tracking-tight font-display">Notice</h3>
                <p className="text-sm text-slate-400 leading-relaxed font-medium">
                  {errorModalOpen}
                </p>
              </div>
              <div className="p-6 bg-slate-950">
                <button 
                  onClick={() => setErrorModalOpen(null)}
                  className="w-full py-4 bg-brand-600 text-slate-100 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-brand-700 shadow-lg shadow-brand-900/20 transition-all"
                >
                  OK
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {deleteRouteId && (
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-md z-[3000] flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              className="bg-slate-900 rounded-[2.5rem] shadow-2xl w-full max-w-sm overflow-hidden border border-slate-800"
            >
              <div className="p-8 text-center">
                <div className="w-20 h-20 bg-rose-900/20 rounded-full flex items-center justify-center mx-auto mb-6">
                  <AlertCircle className="w-10 h-10 text-rose-400" />
                </div>
                <h3 className="text-xl font-black text-slate-100 mb-2 tracking-tight font-display">Delete Route?</h3>
                <p className="text-sm text-slate-400 leading-relaxed font-medium">
                  Are you sure you want to delete this route? This action cannot be undone and will remove all core data.
                </p>
              </div>
              <div className="p-6 bg-slate-950 flex gap-3">
                <button 
                  onClick={() => setDeleteRouteId(null)}
                  className="flex-1 py-4 bg-slate-900 text-slate-400 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all border border-slate-800"
                >
                  Cancel
                </button>
                <button 
                  onClick={confirmDeleteRoute}
                  disabled={quotaExceeded}
                  className="flex-1 py-4 bg-rose-600 text-slate-100 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-rose-700 shadow-lg shadow-rose-900/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [appUser, setAppUser] = useState<any | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    return onQuotaExceeded((exceeded) => {
      setQuotaExceeded(exceeded);
    });
  }, []);

  useEffect(() => {
    let unsubscribeUserDoc: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (unsubscribeUserDoc) {
        unsubscribeUserDoc();
        unsubscribeUserDoc = null;
      }

      if (currentUser) {
        // Start real-time listener for user document
        const userDocRef = doc(db, 'users', currentUser.uid);
        unsubscribeUserDoc = onSnapshot(userDocRef, async (docSnap) => {
          if (docSnap.exists()) {
            setAppUser({ id: docSnap.id, ...docSnap.data() });
          } else if (currentUser.email) {
            // Search by email if UID doc doesn't exist (one-time check)
            const usersRef = collection(db, 'users');
            const q = query(usersRef, where('email', '==', currentUser.email.toLowerCase()), limit(1));
            const querySnapshot = await getDocs(q);
            
            if (!querySnapshot.empty) {
              const userDoc = querySnapshot.docs[0];
              const userData = userDoc.data() as AppUser;
              
              // Migrate to UID-based document
              if (userDoc.id !== currentUser.uid) {
                try {
                  console.log("Migrating user doc to UID-based ID");
                  await setDoc(doc(db, 'users', currentUser.uid), { ...userData, id: currentUser.uid });
                } catch (migrationError: any) {
                  console.error("Migration error:", migrationError);
                }
              }
            } else if (currentUser.email === 'vpunpum@gmail.com') {
              const defaultAdmin: AppUser = { id: currentUser.uid, email: currentUser.email, role: 'Admin', owner: 'None', isApproved: true };
              try {
                await setDoc(doc(db, 'users', currentUser.uid), defaultAdmin, { merge: true });
              } catch (e) {
                console.error("Error creating default admin doc:", e);
              }
            } else {
              // Create a new pending user record
              const newUser: AppUser = {
                id: currentUser.uid,
                email: currentUser.email.toLowerCase(),
                role: 'Viewer',
                owner: 'None',
                isApproved: false
              };
              try {
                await setDoc(doc(db, 'users', currentUser.uid), newUser);
              } catch (e) {
                console.error("Error creating pending user doc:", e);
              }
            }
          }
          setIsAuthReady(true);
        }, (error) => {
          console.error("Error in user doc snapshot:", error);
          setIsAuthReady(true);
        });
      } else {
        setAppUser(null);
        setIsAuthReady(true);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeUserDoc) unsubscribeUserDoc();
    };
  }, []);

  const isGoogleUser = user?.providerData.some(p => p.providerId === 'google.com');
  const needsPasswordChange = appUser?.requiresPasswordChange === true && !isGoogleUser;

  if (quotaExceeded) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-950 p-6 text-center">
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-slate-900 p-10 rounded-[2.5rem] shadow-2xl max-w-md border border-rose-900/30"
        >
          <div className="w-20 h-20 bg-rose-900/20 text-rose-400 rounded-full flex items-center justify-center mx-auto mb-8 shadow-lg shadow-rose-900/20">
            <AlertTriangle size={36} />
          </div>
          <h1 className="text-3xl font-black text-slate-100 mb-4 tracking-tight font-display">Daily Limit Reached</h1>
          <p className="text-slate-400 mb-8 font-medium leading-relaxed">
            The application has reached its free daily database write limit (Firebase Quota). 
            The system will be fully functional again once the quota resets at midnight (Pacific Time).
          </p>
          <div className="bg-slate-950 p-6 rounded-2xl text-xs text-slate-500 mb-8 text-left border border-slate-800">
            <p className="font-black text-slate-400 uppercase tracking-widest mb-2">Why am I seeing this?</p>
            <p className="leading-relaxed">This project is on the Firebase Free Tier, which allows 20,000 writes per day. This limit has been exceeded.</p>
          </div>
          <button 
            onClick={() => window.location.reload()}
            className="w-full bg-brand-600 text-slate-100 py-4 rounded-2xl font-black uppercase tracking-widest hover:bg-brand-700 transition-all shadow-lg shadow-brand-900/20 active:scale-[0.98]"
          >
            Try Refreshing
          </button>
        </motion.div>
      </div>
    );
  }

  if (!isAuthReady) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-950">
        <div className="relative">
          <motion.div 
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
            className="w-16 h-16 border-4 border-brand-500/20 border-t-brand-500 rounded-full"
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-8 h-8 bg-brand-500/10 rounded-full blur-xl animate-pulse" />
          </div>
        </div>
        <p className="mt-8 text-slate-500 font-black uppercase tracking-[0.3em] text-[10px] animate-pulse">Initializing Network</p>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" /> : <Login />} />
        <Route path="/pending-approval" element={user && appUser && appUser.isApproved === false && appUser.role !== 'Admin' ? <PendingApproval email={user.email || ''} /> : <Navigate to="/" />} />
        <Route path="/change-password" element={user && appUser && needsPasswordChange ? <ForceChangePassword user={user} appUser={appUser} /> : <Navigate to="/" />} />
        
        <Route path="/" element={
          user ? (
            appUser ? (
              (appUser.isApproved === false && appUser.role !== 'Admin') ? <Navigate to="/pending-approval" /> :
              needsPasswordChange ? <Navigate to="/change-password" /> :
              <ProjectsDashboard user={user} appUser={appUser} quotaExceeded={quotaExceeded} />
            ) : <div className="h-screen w-full flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
          ) : <Navigate to="/login" />
        } />
        
        <Route path="/project/:projectId" element={
          user ? (
            appUser ? (
              (appUser.isApproved === false && appUser.role !== 'Admin') ? <Navigate to="/pending-approval" /> :
              needsPasswordChange ? <Navigate to="/change-password" /> :
              <ProjectWorkspace user={user} appUser={appUser} quotaExceeded={quotaExceeded} />
            ) : <div className="h-screen w-full flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
          ) : <Navigate to="/login" />
        } />
        
        <Route path="/settings" element={user && appUser && (appUser.isApproved !== false || appUser.role === 'Admin') && !needsPasswordChange && DEFAULT_PERMISSIONS[appUser.role]?.viewSettings ? <SettingsManager user={user} appUser={appUser} quotaExceeded={quotaExceeded} /> : <Navigate to="/" />} />
        <Route path="/user-management" element={user && appUser && (appUser.isApproved !== false || appUser.role === 'Admin') && !needsPasswordChange && DEFAULT_PERMISSIONS[appUser.role]?.viewUsers ? <UserManagement user={user} appUser={appUser} quotaExceeded={quotaExceeded} /> : <Navigate to="/" />} />
        <Route path="/logs" element={user && appUser && appUser.role === 'Admin' ? <LogViewer /> : <Navigate to="/" />} />
        <Route path="/permission-management" element={user && appUser && (appUser.isApproved !== false || appUser.role === 'Admin') && !needsPasswordChange && appUser.role === 'Admin' ? <PermissionManagement appUser={appUser} /> : <Navigate to="/" />} />
        <Route path="/profile" element={user && appUser && (appUser.isApproved !== false || appUser.role === 'Admin') && !needsPasswordChange ? <ProfileSettings user={user} appUser={appUser} onBack={() => window.history.back()} theme={theme} setTheme={setTheme} /> : <Navigate to="/" />} />
        <Route path="/manual" element={<SystemManual />} />
        <Route path="/system-summary" element={<SystemManual />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  );
}

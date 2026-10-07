export type UserRole = 'Admin' | 'Management' | 'Planning' | 'Design' | 'Viewer' | 'Sub-contract';

export type Feature = 
  | 'viewProjects' 
  | 'createProjects' 
  | 'editProjects' 
  | 'deleteProjects' 
  | 'viewUsers' 
  | 'manageUsers' 
  | 'viewSettings' 
  | 'editSettings' 
  | 'viewMap' 
  | 'editMap'
  | 'viewEnclosures'
  | 'createEnclosures'
  | 'editEnclosures'
  | 'deleteEnclosures'
  | 'viewRoutes'
  | 'createRoutes'
  | 'editRoutes'
  | 'deleteRoutes'
  | 'manageSplices'
  | 'viewSpliceTrays'
  | 'editSpliceTrays'
  | 'viewReports'
  | 'exportData'
  | 'viewHistory'
  | 'requestApproval'
  | 'approvePlanning'
  | 'approveOM'
  | 'approveDesign'
  | 'viewApprovalDocs';

export type RolePermissions = Record<UserRole, Record<Feature, boolean>>;

export type User = {
  id: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  role: UserRole;
  owner?: CoreOwner;
  isApproved: boolean;
  requiresPasswordChange?: boolean;
};

export type Point = { lat: number; lng: number };

export type ProjectStatus = 'Draft' | 'Pending Approval' | 'Approved' | 'Rejected';
export type ApprovalStage = 'Planning' | 'OM' | 'Completed' | 'Rejected';

export type OwnerSignOff = {
  owner: CoreOwner;
  status: 'Pending' | 'Approved' | 'Rejected';
  signedBy?: string;
  signedByEmail?: string;
  signedByUid?: string;
  signatureDataUrl?: string;
  signedAt?: string;
  comment?: string;
  position?: string;
  role?: string;
  level?: 'Planning' | 'OM';
};

export type DesignApproval = {
  id: string;
  documentNumber: string;
  status: ProjectStatus;
  approvalStage?: ApprovalStage;
  requestedBy: string;
  requestedByEmail?: string;
  requestedByUid: string;
  requestedAt: string;
  designNotes?: string;
  estimatedInstallationDate?: string;
  contractorName?: string;
  projectCorridorDistanceKm?: number;
  totalOperationDistanceKm?: number;
  planningSignOffs?: Record<string, OwnerSignOff>;
  omSignOffs?: Record<string, OwnerSignOff>;
  ownerSignOffs?: Record<string, OwnerSignOff>;
  rejectionReason?: string;
  finalApprovedAt?: string;
  finalApprovedBy?: string;
};

export type Project = {
  id: string;
  name: string;
  uid: string;
  owner?: CoreOwner;
  owners?: CoreOwner[];
  status?: ProjectStatus;
  designApproval?: DesignApproval;
};

export type EnclosureType = {
  id: string;
  name: string;
  color: string;
  capacity?: number;
  spliceTrays?: number;
  icon?: string;
};

export type FiberType = {
  id: string;
  name: string;
  color: string;
  tubes?: number;
  cores?: number;
  coreCapacity?: number;
  imageUrl?: string;
};

export type FiberEnclosure = {
  id: string;
  name: string;
  position: Point;
  locationType?: string; // Changed from union to string to allow dynamic types
  locationName?: string;
  uid?: string;
  enclosureTypeId?: string;
  trayAssignments?: Record<number, CoreOwner>;
  portAssignments?: Record<number, { owner?: CoreOwner, routeId?: string }>;
  routeSideOverrides?: Record<string, 'left' | 'right' | 'top' | 'bottom'>;
  routeOffsets?: Record<string, number>;
};

export type CoreStatus = 'used' | 'bad' | 'reserved';
export type CoreOwner = 'None' | 'ITEL' | 'SYMC' | 'UIH';
export type CorePriority = 'Low' | 'Medium' | 'High';

export type OwnerConfig = {
  id: string; // 'SYMC' | 'UIH' | 'ITEL' or custom code
  code: string;
  name: string;
  logoUrl?: string; // Data URL or URL to custom logo image
  iconUrl?: string; // Optional compact icon
  primaryColor?: string;
  description?: string;
  zoom?: number; // Zoom / Scale percentage (e.g. 100 = 100%, 120 = 120% enlarged)
  updatedAt?: string;
  updatedBy?: string;
};

export type CoreConnection = {
  routeId: string;
  coreId: number;
};

export type CoreHistoryEntry = {
  id: string;
  date: string;
  action: string;
  user: string;
  description: string;
};

export type Core = {
  id: number;
  color: string;
  status: CoreStatus;
  label: string;
  owner: CoreOwner;
  priority: CorePriority;
  details: string;
  splices?: Record<string, CoreConnection>; // enclosureId -> connection
  history?: CoreHistoryEntry[];
};

export type Route = {
  id: string;
  name: string;
  path: Point[];
  capacity: number;
  cores: Core[];
  startEnclosureId?: string;
  endEnclosureId?: string;
  tier?: string; // Changed from RouteTier to string to allow dynamic types
  fiberType?: string; // Added to store the actual Fiber Type name for color mapping
  tierSharing?: 'Tier 1' | 'Tier 2';
  tierSharingPartners?: CoreOwner[];
  markStart?: number;
  markEnd?: number;
  totalLength?: number;
  owners?: CoreOwner[];
  uid?: string;
};

export type FiberLoop = {
  id: string;
  name: string;
  position: Point;
  routeId: string;
  length: number; // in meters
  uid?: string;
};

export type FiberColorConfig = {
  id: string;
  fiberTypeId: string;
  tier: string;
  color: string;
  uid: string;
};

export type UserLog = {
  id: string;
  timestamp: string;
  userId?: string;
  userEmail: string;
  action: string;
  description: string;
  metadata?: any;
  userAgent?: string;
  path?: string;
  screenResolution?: string;
  language?: string;
};

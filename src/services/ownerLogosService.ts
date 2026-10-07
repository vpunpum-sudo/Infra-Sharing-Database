import { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { OwnerConfig, CoreOwner } from '../types';

export const DEFAULT_OWNER_CONFIGS: Record<string, OwnerConfig> = {
  SYMC: {
    id: 'SYMC',
    code: 'SYMC',
    name: 'Symphony Communication',
    logoUrl: '/logos/logo-symphony.svg',
    primaryColor: '#eb5527',
    description: 'Symphony Communication Public Company Limited',
    zoom: 100
  },
  UIH: {
    id: 'UIH',
    code: 'UIH',
    name: 'United Information Highway',
    logoUrl: '/logos/logo-uih.svg',
    primaryColor: '#0038b8',
    description: 'United Information Highway Company Limited',
    zoom: 120 // UIH scaled up 20% by default for equal visual weight
  },
  ITEL: {
    id: 'ITEL',
    code: 'ITEL',
    name: 'Interlink Telecom',
    logoUrl: '/logos/logo-itel.svg',
    primaryColor: '#ea580c',
    description: 'Interlink Telecom Public Company Limited',
    zoom: 100
  }
};

const CACHE_KEY = 'custom_owner_logos_cache_v1';

// Read initial cached state from localStorage or defaults
const getInitialCache = (): Record<string, OwnerConfig> => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_OWNER_CONFIGS, ...parsed };
    }
  } catch (e) {
    console.warn('Failed to parse cached owner logos', e);
  }
  return { ...DEFAULT_OWNER_CONFIGS };
};

let currentStore: Record<string, OwnerConfig> = getInitialCache();
const listeners = new Set<(store: Record<string, OwnerConfig>) => void>();

const notifyListeners = () => {
  listeners.forEach(fn => fn({ ...currentStore }));
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(currentStore));
    window.dispatchEvent(new CustomEvent('owner-logos-updated', { detail: currentStore }));
  } catch (e) {
    console.warn('Failed to cache owner logos', e);
  }
};

// Initialize global Firestore listener
let isFirestoreInitialized = false;
export const initOwnerLogosListener = () => {
  if (isFirestoreInitialized) return;
  isFirestoreInitialized = true;

  try {
    onSnapshot(collection(db, 'ownerConfigs'), (snapshot) => {
      const updated: Record<string, OwnerConfig> = { ...DEFAULT_OWNER_CONFIGS };
      snapshot.docs.forEach(d => {
        const data = d.data() as OwnerConfig;
        const code = (data.code || d.id).toUpperCase().trim();
        updated[code] = {
          ...DEFAULT_OWNER_CONFIGS[code],
          ...data,
          id: d.id,
          code
        };
      });
      currentStore = updated;
      notifyListeners();
    }, (err) => {
      console.warn('Firestore ownerConfigs listener error (using cache):', err);
    });
  } catch (err) {
    console.warn('Error starting ownerConfigs listener:', err);
  }
};

// Start listening immediately
if (typeof window !== 'undefined') {
  initOwnerLogosListener();
}

/**
 * Returns the effective logo URL for a given owner.
 * If a custom logo was saved in Settings, returns that custom logo.
 * Otherwise returns the default official SVG.
 */
export const getEffectiveOwnerLogo = (owner: CoreOwner | string): string => {
  const norm = (owner || '').toUpperCase().trim();
  
  if (norm === 'SYMC' || norm.includes('SYMPHONY')) {
    return currentStore['SYMC']?.logoUrl || DEFAULT_OWNER_CONFIGS['SYMC'].logoUrl!;
  }
  if (norm === 'UIH' || norm.includes('UNITED INFORMATION')) {
    return currentStore['UIH']?.logoUrl || DEFAULT_OWNER_CONFIGS['UIH'].logoUrl!;
  }
  if (norm === 'ITEL' || norm.includes('INTERLINK')) {
    return currentStore['ITEL']?.logoUrl || DEFAULT_OWNER_CONFIGS['ITEL'].logoUrl!;
  }

  // Check custom added owner
  if (currentStore[norm]?.logoUrl) {
    return currentStore[norm].logoUrl!;
  }

  return '';
};

/**
 * Returns the effective zoom scale percentage for a given owner.
 * Default is 120% for UIH (+20%), and 100% for others.
 */
export const getEffectiveOwnerZoom = (owner: CoreOwner | string): number => {
  const norm = (owner || '').toUpperCase().trim();
  if (currentStore[norm]?.zoom !== undefined) {
    return Number(currentStore[norm].zoom);
  }
  if (norm === 'UIH' || norm.includes('UNITED INFORMATION')) {
    return 120;
  }
  return 100;
};

/**
 * Save custom owner config (Logo, name, color, zoom) to Firestore and local cache
 */
export const saveOwnerLogoConfig = async (config: OwnerConfig): Promise<void> => {
  const code = config.code.toUpperCase().trim();
  const fullConfig: OwnerConfig = {
    ...config,
    id: code,
    code,
    updatedAt: new Date().toISOString()
  };

  // Immediate local optimistic update
  currentStore[code] = fullConfig;
  notifyListeners();

  // Persist to Firestore
  try {
    await setDoc(doc(db, 'ownerConfigs', code), fullConfig);
  } catch (err) {
    console.error('Failed to save owner config to Firestore:', err);
    throw err;
  }
};

/**
 * Reset an owner logo back to default official SVG
 */
export const resetOwnerLogoConfig = async (code: string): Promise<void> => {
  const norm = code.toUpperCase().trim();
  
  // Reset in store
  if (DEFAULT_OWNER_CONFIGS[norm]) {
    currentStore[norm] = { ...DEFAULT_OWNER_CONFIGS[norm] };
  } else {
    delete currentStore[norm];
  }
  notifyListeners();

  // Delete document in Firestore to revert to default
  try {
    await deleteDoc(doc(db, 'ownerConfigs', norm));
  } catch (err) {
    console.warn('Could not delete from Firestore (might not exist):', err);
  }
};

/**
 * React hook to access and manage owner logos with instant updates
 */
export const useOwnerLogos = () => {
  const [configs, setConfigs] = useState<Record<string, OwnerConfig>>({ ...currentStore });

  useEffect(() => {
    const handleUpdate = (updated: Record<string, OwnerConfig>) => {
      setConfigs({ ...updated });
    };

    listeners.add(handleUpdate);
    return () => {
      listeners.delete(handleUpdate);
    };
  }, []);

  return {
    configs,
    getLogoUrl: (owner: CoreOwner | string) => getEffectiveOwnerLogo(owner),
    getZoom: (owner: CoreOwner | string) => getEffectiveOwnerZoom(owner),
    saveConfig: saveOwnerLogoConfig,
    resetConfig: resetOwnerLogoConfig,
    allOwners: Object.values(configs)
  };
};

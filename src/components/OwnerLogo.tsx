import React from 'react';
import { CoreOwner } from '../types';
import { useOwnerLogos } from '../services/ownerLogosService';

interface OwnerLogoProps {
  owner: CoreOwner | string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'banner';
  className?: string;
  showText?: boolean;
  variant?: 'full' | 'icon' | 'badge';
  zoom?: number; // Optional zoom percentage override (e.g. 100, 120)
}

export const OwnerLogo: React.FC<OwnerLogoProps> = ({
  owner,
  size = 'md',
  className = '',
  showText = true,
  variant = 'full',
  zoom
}) => {
  const normOwner = (owner || '').toUpperCase().trim();
  const { getLogoUrl, configs } = useOwnerLogos();

  // Optical height and bounding rules for visual uniformity across all brands
  // All SVG assets are normalized to 60px height viewBox with 0 padding.
  // UIH has +20% optical height expansion so block letters match wordmark presence.
  const opticalStyles: Record<string, Record<string, string>> = {
    SYMC: {
      xs: 'h-[20px] max-w-[85px]',
      sm: 'h-[26px] max-w-[110px]',
      md: 'h-[30px] max-w-[130px]',
      lg: 'h-[38px] max-w-[165px]',
      xl: 'h-[48px] max-w-[205px]',
      banner: 'h-[58px] max-w-[250px]'
    },
    UIH: {
      // +20% enlarged across all positions for equal optical weight
      xs: 'h-[24px] max-w-[70px]',
      sm: 'h-[31px] max-w-[88px]',
      md: 'h-[36px] max-w-[105px]',
      lg: 'h-[46px] max-w-[130px]',
      xl: 'h-[58px] max-w-[165px]',
      banner: 'h-[70px] max-w-[200px]'
    },
    ITEL: {
      xs: 'h-[20px] max-w-[80px]',
      sm: 'h-[26px] max-w-[105px]',
      md: 'h-[30px] max-w-[125px]',
      lg: 'h-[38px] max-w-[160px]',
      xl: 'h-[48px] max-w-[195px]',
      banner: 'h-[58px] max-w-[240px]'
    },
    DEFAULT: {
      xs: 'h-[20px] max-w-[85px]',
      sm: 'h-[26px] max-w-[110px]',
      md: 'h-[30px] max-w-[130px]',
      lg: 'h-[38px] max-w-[165px]',
      xl: 'h-[48px] max-w-[205px]',
      banner: 'h-[58px] max-w-[250px]'
    }
  };

  const textSizes = {
    xs: 'text-[9px]',
    sm: 'text-[11px]',
    md: 'text-xs',
    lg: 'text-sm',
    xl: 'text-base',
    banner: 'text-lg'
  }[size];

  const isCompact = variant === 'icon' || (!showText && (size === 'xs' || size === 'sm'));

  // Calculate zoom scale factor relative to calibrated baseline
  // UIH has a default base zoom of 120% (+20% size), other owners default to 100%
  const isUih = normOwner === 'UIH' || normOwner.includes('UNITED INFORMATION');
  const baseZoom = isUih ? 120 : 100;
  const configuredZoom = configs[normOwner]?.zoom ?? baseZoom;
  const activeZoom = zoom !== undefined ? zoom : configuredZoom;
  const zoomScale = Math.max(0.2, Math.min(6.0, activeZoom / baseZoom));

  const zoomStyle: React.CSSProperties = zoomScale !== 1 ? {
    transform: `scale(${zoomScale})`,
    transformOrigin: 'center center',
    transition: 'transform 0.15s ease-out'
  } : {};

  // Get active logo URL (either custom uploaded from Settings or official default)
  const activeLogoUrl = getLogoUrl(normOwner);

  // 1. SYMPHONY
  if (normOwner === 'SYMC' || normOwner.includes('SYMPHONY')) {
    const customConfig = configs['SYMC'];
    const isCustom = Boolean(customConfig?.logoUrl && !customConfig.logoUrl.startsWith('/logos/logo-'));
    const src = isCustom 
      ? customConfig!.logoUrl 
      : (isCompact ? '/logos/logo-symphony-icon.svg' : '/logos/logo-symphony.svg');
    const scale = opticalStyles.SYMC[size];

    return (
      <div 
        className={`inline-flex items-center justify-center select-none shrink-0 align-middle overflow-visible ${className}`} 
        title={customConfig?.name || "Symphony Communication"}
      >
        <img 
          src={src} 
          alt="SYMPHONY" 
          className={`${scale} w-auto object-contain block`}
          style={zoomStyle}
          loading="eager"
        />
      </div>
    );
  }

  // 2. UIH (+20% enlarged by default)
  if (isUih) {
    const customConfig = configs['UIH'];
    const src = activeLogoUrl || '/logos/logo-uih.svg';
    const scale = opticalStyles.UIH[size];

    return (
      <div 
        className={`inline-flex items-center justify-center select-none shrink-0 align-middle overflow-visible ${className}`} 
        title={customConfig?.name || "UIH (United Information Highway)"}
      >
        <img 
          src={src} 
          alt="UIH" 
          className={`${scale} w-auto object-contain block`}
          style={zoomStyle}
          loading="eager"
        />
      </div>
    );
  }

  // 3. ITEL
  if (normOwner === 'ITEL' || normOwner.includes('INTERLINK')) {
    const customConfig = configs['ITEL'];
    const isCustom = Boolean(customConfig?.logoUrl && !customConfig.logoUrl.startsWith('/logos/logo-'));
    const src = isCustom 
      ? customConfig!.logoUrl 
      : (isCompact ? '/logos/logo-itel-icon.svg' : '/logos/logo-itel.svg');
    const scale = opticalStyles.ITEL[size];

    return (
      <div 
        className={`inline-flex items-center justify-center select-none shrink-0 align-middle overflow-visible ${className}`} 
        title={customConfig?.name || "Interlink Telecom Public Company Limited"}
      >
        <img 
          src={src} 
          alt="ITEL" 
          className={`${scale} w-auto object-contain block`}
          style={zoomStyle}
          loading="eager"
        />
      </div>
    );
  }

  // 4. Custom Owner with configured Logo
  if (activeLogoUrl) {
    const scale = opticalStyles.DEFAULT[size];
    return (
      <div 
        className={`inline-flex items-center justify-center select-none shrink-0 align-middle overflow-visible ${className}`} 
        title={normOwner}
      >
        <img 
          src={activeLogoUrl} 
          alt={normOwner} 
          className={`${scale} w-auto object-contain block`}
          style={zoomStyle}
          loading="eager"
        />
      </div>
    );
  }

  // Fallback text
  return (
    <span className={`font-bold text-slate-400 ${textSizes} ${className}`} style={zoomStyle}>
      {owner}
    </span>
  );
};

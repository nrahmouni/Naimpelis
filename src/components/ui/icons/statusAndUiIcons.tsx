import React from 'react';
import {
  BASE_STROKE,
  BrandGradientDef,
  type RiffanIconProps,
  ToneGradientDef,
  useRiffanIconDefs,
} from './iconPrimitives';

// ============================================================================
// 7. ESTADO
// ============================================================================

export const RiffanSyncIcon: React.FC<RiffanIconProps> = ({
  size = 18,
  animate = 'always',
  tone = 'brand',
  className = '',
  ...props
}) => {
  const { gradId, paint } = useRiffanIconDefs(tone);
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" data-anim={animate} className={`rtv-ico shrink-0 ${className}`} {...props}>
      {tone === 'brand' && <BrandGradientDef id={gradId} />}
      <g className="rtv-k-sync" style={{ transformOrigin: '24px 24px' }}>
        <path stroke={paint} {...BASE_STROKE} d="M10 22 a14 14 0 0 1 24 -7" />
        <path stroke={paint} {...BASE_STROKE} d="M34 8 V15 H27" />
        <path stroke={paint} {...BASE_STROKE} d="M38 26 a14 14 0 0 1 -24 7" />
        <path stroke={paint} {...BASE_STROKE} d="M14 40 V33 H21" />
      </g>
    </svg>
  );
};

export const RiffanWarningIcon: React.FC<RiffanIconProps> = ({
  size = 20,
  animate = 'always',
  tone = 'brand',
  className = '',
  ...props
}) => {
  const { gradId, paint } = useRiffanIconDefs(tone);
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" data-anim={animate} className={`rtv-ico shrink-0 ${className}`} {...props}>
      {tone === 'brand' && <BrandGradientDef id={gradId} />}
      <g className="rtv-k-alert" style={{ transformOrigin: '24px 38px' }}>
        <path stroke={paint} {...BASE_STROKE} d="M24 9 L41 38 H7Z" />
        <path stroke={paint} {...BASE_STROKE} d="M24 20 V28" />
        <path stroke={paint} {...BASE_STROKE} d="M24 33.5 V34" />
      </g>
    </svg>
  );
};

export const RiffanInfoIcon: React.FC<RiffanIconProps> = ({
  size = 20,
  animate = 'hover',
  tone = 'brand',
  className = '',
  ...props
}) => {
  const { gradId, paint } = useRiffanIconDefs(tone);
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" data-anim={animate} className={`rtv-ico shrink-0 ${className}`} {...props}>
      {tone === 'brand' && <BrandGradientDef id={gradId} />}
      <circle className="rtv-k-draw" pathLength={1} style={{ animationDelay: '0s' }} stroke={paint} {...BASE_STROKE} cx="24" cy="24" r="16" />
      <path className="rtv-k-draw" pathLength={1} style={{ animationDelay: '0.15s' }} stroke={paint} {...BASE_STROKE} d="M24 22 V33" />
      <path className="rtv-k-draw" pathLength={1} style={{ animationDelay: '0.3s' }} stroke={paint} {...BASE_STROKE} d="M24 15 V15.5" />
    </svg>
  );
};

export const RiffanErrorIcon: React.FC<RiffanIconProps> = ({
  size = 20,
  animate = 'hover',
  tone = 'brand',
  className = '',
  ...props
}) => {
  const { gradId, paint } = useRiffanIconDefs(tone);
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" data-anim={animate} className={`rtv-ico shrink-0 ${className}`} {...props}>
      {tone === 'brand' && <BrandGradientDef id={gradId} />}
      <circle className="rtv-k-draw" pathLength={1} style={{ animationDelay: '0s' }} stroke={paint} {...BASE_STROKE} cx="24" cy="24" r="16" />
      <path className="rtv-k-draw" pathLength={1} style={{ animationDelay: '0.15s' }} stroke={paint} {...BASE_STROKE} d="M18 18 L30 30" />
      <path className="rtv-k-draw" pathLength={1} style={{ animationDelay: '0.3s' }} stroke={paint} {...BASE_STROKE} d="M30 18 L18 30" />
    </svg>
  );
};

export const RiffanUnavailableIcon: React.FC<RiffanIconProps> = ({
  size = 20,
  animate = 'hover',
  tone = 'brand',
  className = '',
  ...props
}) => {
  const { gradId, paint } = useRiffanIconDefs(tone);
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" data-anim={animate} className={`rtv-ico shrink-0 ${className}`} {...props}>
      {tone === 'brand' && <BrandGradientDef id={gradId} />}
      <circle className="rtv-k-draw" pathLength={1} style={{ animationDelay: '0s' }} stroke={paint} {...BASE_STROKE} cx="24" cy="24" r="16" />
      <path className="rtv-k-draw" pathLength={1} style={{ animationDelay: '0.15s' }} stroke={paint} {...BASE_STROKE} d="M13 13 L35 35" />
    </svg>
  );
};

export const RiffanWifiIcon: React.FC<RiffanIconProps> = ({
  size = 20,
  animate = 'hover',
  tone = 'brand',
  className = '',
  ...props
}) => {
  const { gradId, paint } = useRiffanIconDefs(tone);
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" data-anim={animate} className={`rtv-ico shrink-0 ${className}`} {...props}>
      {tone === 'brand' && <BrandGradientDef id={gradId} />}
      <path className="rtv-k-wave" style={{ animationDelay: '.5s' }} stroke={paint} {...BASE_STROKE} d="M5 19 C16 9 32 9 43 19" />
      <path className="rtv-k-wave" style={{ animationDelay: '.25s' }} stroke={paint} {...BASE_STROKE} d="M12 26 C19 20 29 20 36 26" />
      <path className="rtv-k-wave" stroke={paint} {...BASE_STROKE} d="M19 33 C22 30 26 30 29 33" />
      <circle cx="24" cy="39" r="2" fill={paint} />
    </svg>
  );
};

// ============================================================================
// 8. BÁSICOS
// ============================================================================

export const RiffanSearchIcon: React.FC<RiffanIconProps> = ({
  size = 20,
  animate = 'hover',
  tone = 'brand',
  className = '',
  ...props
}) => {
  const { gradId, paint } = useRiffanIconDefs(tone);
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" data-anim={animate} className={`rtv-ico shrink-0 ${className}`} {...props}>
      {tone === 'brand' && <BrandGradientDef id={gradId} />}
      <g className="rtv-k-search-orbit" style={{ transformOrigin: '24px 24px' }}>
        <circle stroke={paint} {...BASE_STROKE} cx="21" cy="21" r="12" />
        <path stroke={paint} {...BASE_STROKE} d="M30 30 L41 41" />
        <circle className="rtv-k-search-scan" style={{ transformOrigin: '21px 21px' }} stroke={paint} fill="none" strokeWidth="2" strokeLinecap="round" cx="21" cy="21" r="7" strokeDasharray="8 36" />
      </g>
    </svg>
  );
};

export const RiffanMenuIcon: React.FC<RiffanIconProps> = ({
  size = 20,
  animate = 'hover',
  tone = 'brand',
  className = '',
  ...props
}) => {
  const { gradId, paint } = useRiffanIconDefs(tone);
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" data-anim={animate} className={`rtv-ico shrink-0 ${className}`} {...props}>
      {tone === 'brand' && <BrandGradientDef id={gradId} />}
      <path stroke={paint} {...BASE_STROKE} d="M10 14 H38" />
      <path stroke={paint} {...BASE_STROKE} d="M10 24 H38" />
      <path stroke={paint} {...BASE_STROKE} d="M10 34 H38" />
    </svg>
  );
};

export const RiffanCloseIcon: React.FC<RiffanIconProps> = ({
  size = 20,
  animate = 'hover',
  tone = 'brand',
  className = '',
  ...props
}) => {
  const { gradId, paint } = useRiffanIconDefs(tone);
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" data-anim={animate} className={`rtv-ico shrink-0 ${className}`} {...props}>
      {tone === 'brand' && <BrandGradientDef id={gradId} />}
      <path className="rtv-k-draw" pathLength={1} style={{ animationDelay: '0s' }} stroke={paint} {...BASE_STROKE} d="M12 12 L36 36" />
      <path className="rtv-k-draw" pathLength={1} style={{ animationDelay: '0.15s' }} stroke={paint} {...BASE_STROKE} d="M36 12 L12 36" />
    </svg>
  );
};

export const RiffanHomeIcon: React.FC<RiffanIconProps> = ({
  size = 20,
  animate = 'hover',
  tone = 'brand',
  className = '',
  ...props
}) => {
  const { gradId, paint } = useRiffanIconDefs(tone);
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" data-anim={animate} className={`rtv-ico shrink-0 ${className}`} {...props}>
      {tone === 'brand' && <BrandGradientDef id={gradId} />}
      <path className="rtv-k-draw" pathLength={1} style={{ animationDelay: '0s' }} stroke={paint} {...BASE_STROKE} d="M8 23 L24 9 L40 23" />
      <path className="rtv-k-draw" pathLength={1} style={{ animationDelay: '0.2s' }} stroke={paint} {...BASE_STROKE} d="M12 20 V38 H20 V28 H28 V38 H36 V20" />
    </svg>
  );
};

export const RiffanUserIcon: React.FC<RiffanIconProps> = ({
  size = 20,
  animate = 'hover',
  tone = 'brand',
  className = '',
  ...props
}) => {
  const { gradId, paint } = useRiffanIconDefs(tone);
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" data-anim={animate} className={`rtv-ico shrink-0 ${className}`} {...props}>
      {tone === 'brand' && <BrandGradientDef id={gradId} />}
      <circle className="rtv-k-draw" pathLength={1} style={{ animationDelay: '0s' }} stroke={paint} {...BASE_STROKE} cx="24" cy="16" r="7" />
      <path className="rtv-k-draw" pathLength={1} style={{ animationDelay: '0.25s' }} stroke={paint} {...BASE_STROKE} d="M10 40 C10 31 16 27 24 27 C32 27 38 31 38 40" />
    </svg>
  );
};

export const RiffanMailIcon: React.FC<RiffanIconProps> = ({
  size = 20,
  animate = 'hover',
  tone = 'brand',
  className = '',
  ...props
}) => {
  const { gradId, paint } = useRiffanIconDefs(tone);
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" data-anim={animate} className={`rtv-ico shrink-0 ${className}`} {...props}>
      {tone === 'brand' && <BrandGradientDef id={gradId} />}
      <rect className="rtv-k-draw" pathLength={1} style={{ animationDelay: '0s' }} stroke={paint} {...BASE_STROKE} x="7" y="11" width="34" height="26" rx="6" />
      <path className="rtv-k-draw" pathLength={1} style={{ animationDelay: '0.25s' }} stroke={paint} {...BASE_STROKE} d="M10 17 L24 27 L38 17" />
    </svg>
  );
};

export const RiffanCartIcon: React.FC<RiffanIconProps> = ({
  size = 20,
  animate = 'hover',
  tone = 'brand',
  className = '',
  ...props
}) => {
  const { gradId, paint } = useRiffanIconDefs(tone);
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" data-anim={animate} className={`rtv-ico shrink-0 ${className}`} {...props}>
      {tone === 'brand' && <BrandGradientDef id={gradId} />}
      <path className="rtv-k-draw" pathLength={1} style={{ animationDelay: '0s' }} stroke={paint} {...BASE_STROKE} d="M5 9 H10 L14 30 H35 L39 16 H12" />
      <circle className="rtv-k-draw" pathLength={1} style={{ animationDelay: '0.3s' }} stroke={paint} {...BASE_STROKE} cx="19" cy="38" r="2.5" />
      <circle className="rtv-k-draw" pathLength={1} style={{ animationDelay: '0.4s' }} stroke={paint} {...BASE_STROKE} cx="33" cy="38" r="2.5" />
    </svg>
  );
};

export const RiffanLockIcon: React.FC<RiffanIconProps> = ({
  size = 18,
  animate = 'hover',
  tone = 'brand',
  className = '',
  ...props
}) => {
  const { gradId, paint } = useRiffanIconDefs(tone);
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" data-anim={animate} className={`rtv-ico shrink-0 ${className}`} {...props}>
      {tone === 'brand' && <BrandGradientDef id={gradId} />}
      <rect className="rtv-k-draw" pathLength={1} style={{ animationDelay: '0s' }} stroke={paint} {...BASE_STROKE} x="11" y="21" width="26" height="18" rx="5" />
      <path className="rtv-k-draw" pathLength={1} style={{ animationDelay: '0.2s' }} stroke={paint} {...BASE_STROKE} d="M16 21 V15 a8 8 0 0 1 16 0 V21" />
      <path className="rtv-k-draw" pathLength={1} style={{ animationDelay: '0.45s' }} stroke={paint} {...BASE_STROKE} d="M24 29 V32" />
    </svg>
  );
};

export const RiffanCheckCircleIcon: React.FC<RiffanIconProps> = ({
  size = 20,
  animate = 'hover',
  tone = 'brand',
  className = '',
  ...props
}) => {
  const { gradId, paint } = useRiffanIconDefs(tone);
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" data-anim={animate} className={`rtv-ico shrink-0 ${className}`} {...props}>
      {tone === 'brand' && <BrandGradientDef id={gradId} />}
      <circle className="rtv-k-draw" pathLength={1} style={{ animationDelay: '0s' }} stroke={paint} {...BASE_STROKE} cx="24" cy="24" r="16" />
      <path className="rtv-k-draw" pathLength={1} style={{ animationDelay: '0.35s' }} stroke={paint} {...BASE_STROKE} d="M16 25 L22 31 L33 18" />
    </svg>
  );
};

export const RiffanHeartIcon: React.FC<RiffanIconProps & { active?: boolean }> = ({
  size = 18,
  animate = 'hover',
  tone = 'brand',
  active = false,
  className = '',
  ...props
}) => {
  const { gradId, paint } = useRiffanIconDefs(tone);
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" data-anim={animate} className={`rtv-ico shrink-0 ${className}`} {...props}>
      {tone === 'brand' && <BrandGradientDef id={gradId} />}
      <path
        className="rtv-k-heart"
        style={{ transformOrigin: '24px 26px', fill: paint, fillOpacity: active ? 0.85 : 0.16 }}
        stroke={paint}
        {...BASE_STROKE}
        d="M24 40 C10 30 7 21 11 15 C15 9 22 10 24 16 C26 10 33 9 37 15 C41 21 38 30 24 40Z"
      />
    </svg>
  );
};

export const RiffanBellIcon: React.FC<RiffanIconProps> = ({
  size = 20,
  animate = 'hover',
  tone = 'brand',
  className = '',
  ...props
}) => {
  const { gradId, paint } = useRiffanIconDefs(tone);
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" data-anim={animate} className={`rtv-ico shrink-0 ${className}`} {...props}>
      {tone === 'brand' && <BrandGradientDef id={gradId} />}
      <g className="rtv-k-bell" style={{ transformOrigin: '24px 7px' }}>
        <path stroke={paint} {...BASE_STROKE} d="M24 7 C16 7 12 13 12 21 V30 L8 35 H40 L36 30 V21 C36 13 32 7 24 7Z" />
        <path stroke={paint} {...BASE_STROKE} d="M20 40 a4 4 0 0 0 8 0" />
      </g>
    </svg>
  );
};

export const RiffanSettingsGearIcon: React.FC<RiffanIconProps> = ({
  size = 20,
  animate = 'hover',
  tone = 'brand',
  className = '',
  ...props
}) => {
  const { gradId, paint } = useRiffanIconDefs(tone);
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" data-anim={animate} className={`rtv-ico shrink-0 ${className}`} {...props}>
      {tone === 'brand' && <BrandGradientDef id={gradId} />}
      <g className="rtv-k-gear" style={{ transformOrigin: '24px 24px' }}>
        <circle stroke={paint} fill="none" strokeWidth="5" strokeLinecap="butt" strokeLinejoin="round" cx="24" cy="24" r="16.5" strokeDasharray="4.32 4.32" />
        <circle stroke={paint} {...BASE_STROKE} cx="24" cy="24" r="12" />
        <circle stroke={paint} {...BASE_STROKE} cx="24" cy="24" r="4.5" />
      </g>
    </svg>
  );
};

export const RiffanArrowRightIcon: React.FC<RiffanIconProps> = ({
  size = 18,
  animate = 'hover',
  tone = 'brand',
  className = '',
  ...props
}) => {
  const { gradId, paint } = useRiffanIconDefs(tone);
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" data-anim={animate} className={`rtv-ico shrink-0 ${className}`} {...props}>
      {tone === 'brand' && <BrandGradientDef id={gradId} />}
      <g className="rtv-k-nudge-right">
        <path stroke={paint} {...BASE_STROKE} d="M9 24 H37" />
        <path stroke={paint} {...BASE_STROKE} d="M27 14 L37 24 L27 34" />
      </g>
    </svg>
  );
};

export const RiffanDownloadIcon: React.FC<RiffanIconProps> = ({
  size = 20,
  animate = 'hover',
  tone = 'brand',
  className = '',
  ...props
}) => {
  const { gradId, paint } = useRiffanIconDefs(tone);
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" data-anim={animate} className={`rtv-ico shrink-0 ${className}`} {...props}>
      <ToneGradientDef tone={tone} id={gradId} />
      <path stroke={paint} {...BASE_STROKE} d="M9 38 H39" />
      <g className="rtv-k-nudge-down">
        <path stroke={paint} {...BASE_STROKE} d="M24 8 V29" />
        <path stroke={paint} {...BASE_STROKE} d="M14 20 L24 30 L34 20" />
      </g>
    </svg>
  );
};

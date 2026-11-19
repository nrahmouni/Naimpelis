import React from 'react';
import { BASE_STROKE, BrandGradientDef, type RiffanIconProps, useRiffanIconDefs } from './iconPrimitives';

// ============================================================================
// 5. CONTENIDO
// ============================================================================

export const RiffanMoviesIcon: React.FC<RiffanIconProps> = ({
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
      <rect className="rtv-k-draw" pathLength={1} style={{ animationDelay: '0s' }} stroke={paint} {...BASE_STROKE} x="8" y="8" width="32" height="32" rx="6" />
      <path className="rtv-k-draw" pathLength={1} style={{ animationDelay: '0.15s' }} stroke={paint} {...BASE_STROKE} d="M16 8 V40" />
      <path className="rtv-k-draw" pathLength={1} style={{ animationDelay: '0.3s' }} stroke={paint} {...BASE_STROKE} d="M32 8 V40" />
      <path className="rtv-k-draw" pathLength={1} style={{ animationDelay: '0.45s' }} stroke={paint} {...BASE_STROKE} d="M8 18 H16" />
      <path className="rtv-k-draw" pathLength={1} style={{ animationDelay: '0.6s' }} stroke={paint} {...BASE_STROKE} d="M8 30 H16" />
      <path className="rtv-k-draw" pathLength={1} style={{ animationDelay: '0.75s' }} stroke={paint} {...BASE_STROKE} d="M32 18 H40" />
      <path className="rtv-k-draw" pathLength={1} style={{ animationDelay: '0.9s' }} stroke={paint} {...BASE_STROKE} d="M32 30 H40" />
    </svg>
  );
};

export const RiffanSeriesIcon: React.FC<RiffanIconProps> = ({
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
      <rect className="rtv-k-draw" pathLength={1} style={{ animationDelay: '0s' }} stroke={paint} {...BASE_STROKE} x="6" y="15" width="36" height="25" rx="6" />
      <path className="rtv-k-draw" pathLength={1} style={{ animationDelay: '0.15s' }} stroke={paint} {...BASE_STROKE} d="M17 6 L24 15 L31 6" />
    </svg>
  );
};

export const RiffanSurpriseIcon: React.FC<RiffanIconProps> = ({
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
      <path className="rtv-k-twinkle" style={{ transformOrigin: '20px 24px' }} stroke={paint} {...BASE_STROKE} d="M20 10 Q21.5 22.5 34 24 Q21.5 25.5 20 38 Q18.5 25.5 6 24 Q18.5 22.5 20 10Z" />
      <path className="rtv-k-twinkle" style={{ transformOrigin: '36px 12px', animationDelay: '0.5s' }} stroke={paint} {...BASE_STROKE} d="M36 6 Q36.8 11.2 42 12 Q36.8 12.8 36 18 Q35.2 12.8 30 12 Q35.2 11.2 36 6Z" />
    </svg>
  );
};

export const RiffanStarIcon: React.FC<RiffanIconProps> = ({
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
      <path
        className="rtv-k-star"
        style={{ transformOrigin: '24px 25px', fill: paint, fillOpacity: tone === 'current' ? 0.85 : 0.2 }}
        stroke={paint}
        {...BASE_STROKE}
        d="M24 7 L29.4 18.2 L41.5 19.9 L32.7 28.4 L34.8 40.5 L24 34.8 L13.2 40.5 L15.3 28.4 L6.5 19.9 L18.6 18.2Z"
      />
    </svg>
  );
};

export const RiffanAddIcon: React.FC<RiffanIconProps> = ({
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
      <g className="rtv-k-plus" style={{ transformOrigin: '24px 24px' }}>
        <path stroke={paint} {...BASE_STROKE} d="M24 10 V38" />
        <path stroke={paint} {...BASE_STROKE} d="M10 24 H38" />
      </g>
    </svg>
  );
};

export const RiffanScheduleIcon: React.FC<RiffanIconProps> = ({
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
      <rect className="rtv-k-draw" pathLength={1} style={{ animationDelay: '0s' }} stroke={paint} {...BASE_STROKE} x="8" y="12" width="32" height="28" rx="6" />
      <path className="rtv-k-draw" pathLength={1} style={{ animationDelay: '0.15s' }} stroke={paint} {...BASE_STROKE} d="M8 22 H40" />
      <path className="rtv-k-draw" pathLength={1} style={{ animationDelay: '0.3s' }} stroke={paint} {...BASE_STROKE} d="M17 8 V15" />
      <path className="rtv-k-draw" pathLength={1} style={{ animationDelay: '0.45s' }} stroke={paint} {...BASE_STROKE} d="M31 8 V15" />
    </svg>
  );
};

export const RiffanChannelsIcon: React.FC<RiffanIconProps> = ({
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
      <path className="rtv-k-draw" pathLength={1} style={{ animationDelay: '0s' }} stroke={paint} {...BASE_STROKE} d="M24 8 L41 17 L24 26 L7 17Z" />
      <path className="rtv-k-draw" pathLength={1} style={{ animationDelay: '0.15s' }} stroke={paint} {...BASE_STROKE} d="M7 25 L24 34 L41 25" />
      <path className="rtv-k-draw" pathLength={1} style={{ animationDelay: '0.3s' }} stroke={paint} {...BASE_STROKE} d="M7 32 L24 41 L41 32" />
    </svg>
  );
};

export const RiffanClockIcon: React.FC<RiffanIconProps> = ({
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
      <circle stroke={paint} {...BASE_STROKE} cx="24" cy="24" r="16" />
      <path stroke={paint} {...BASE_STROKE} d="M24 24 L30 28" />
      <g className="rtv-k-sync" style={{ transformOrigin: '24px 24px', animationDuration: '4s' }}>
        <path stroke={paint} {...BASE_STROKE} d="M24 24 V13" />
      </g>
    </svg>
  );
};

export const RiffanLiveIcon: React.FC<RiffanIconProps> = ({
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
      <circle className="rtv-k-live-dot" style={{ transformOrigin: '24px 24px' }} cx="24" cy="24" r="4" fill={paint} />
      <path className="rtv-k-wave" stroke={paint} {...BASE_STROKE} d="M16.5 16.5 a10.6 10.6 0 0 0 0 15" />
      <path className="rtv-k-wave" stroke={paint} {...BASE_STROKE} d="M31.5 16.5 a10.6 10.6 0 0 1 0 15" />
      <path className="rtv-k-wave" style={{ animationDelay: '.25s' }} stroke={paint} {...BASE_STROKE} d="M10 10 a19 19 0 0 0 0 28" />
      <path className="rtv-k-wave" style={{ animationDelay: '.25s' }} stroke={paint} {...BASE_STROKE} d="M38 10 a19 19 0 0 1 0 28" />
    </svg>
  );
};

export const RiffanUsersIcon: React.FC<RiffanIconProps> = ({
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
      <circle className="rtv-k-draw" pathLength={1} style={{ animationDelay: '0s' }} stroke={paint} {...BASE_STROKE} cx="19" cy="16" r="6" />
      <path className="rtv-k-draw" pathLength={1} style={{ animationDelay: '0.15s' }} stroke={paint} {...BASE_STROKE} d="M7 38 C7 30 12 26 19 26 C26 26 31 30 31 38" />
      <path className="rtv-k-draw" pathLength={1} style={{ animationDelay: '0.3s' }} stroke={paint} {...BASE_STROKE} d="M31 10.5 a6 6 0 0 1 0 11" />
      <path className="rtv-k-draw" pathLength={1} style={{ animationDelay: '0.45s' }} stroke={paint} {...BASE_STROKE} d="M36 27 C41 28 42 33 42 38" />
    </svg>
  );
};

export const RiffanLanguageIcon: React.FC<RiffanIconProps> = ({
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
      <circle className="rtv-k-draw" pathLength={1} style={{ animationDelay: '0s' }} stroke={paint} {...BASE_STROKE} cx="24" cy="24" r="16" />
      <path className="rtv-k-draw" pathLength={1} style={{ animationDelay: '0.15s' }} stroke={paint} {...BASE_STROKE} d="M8 24 H40" />
      <path className="rtv-k-draw" pathLength={1} style={{ animationDelay: '0.3s' }} stroke={paint} {...BASE_STROKE} d="M24 8 C17 15 17 33 24 40 C31 33 31 15 24 8" />
    </svg>
  );
};

// ============================================================================
// 6. DISPOSITIVOS Y CUENTA
// ============================================================================

export const RiffanMobileIcon: React.FC<RiffanIconProps> = ({
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
      <rect className="rtv-k-draw" pathLength={1} style={{ animationDelay: '0s' }} stroke={paint} {...BASE_STROKE} x="14" y="6" width="20" height="36" rx="5" />
      <path className="rtv-k-draw" pathLength={1} style={{ animationDelay: '0.15s' }} stroke={paint} {...BASE_STROKE} d="M22 36 H26" />
    </svg>
  );
};

export const RiffanMonitorIcon: React.FC<RiffanIconProps> = ({
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
      <rect className="rtv-k-draw" pathLength={1} style={{ animationDelay: '0s' }} stroke={paint} {...BASE_STROKE} x="6" y="9" width="36" height="24" rx="5" />
      <path className="rtv-k-draw" pathLength={1} style={{ animationDelay: '0.15s' }} stroke={paint} {...BASE_STROKE} d="M18 40 H30" />
      <path className="rtv-k-draw" pathLength={1} style={{ animationDelay: '0.3s' }} stroke={paint} {...BASE_STROKE} d="M24 33 V40" />
    </svg>
  );
};

export const RiffanTvRemoteIcon: React.FC<RiffanIconProps> = ({
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
      <rect className="rtv-k-draw" pathLength={1} style={{ animationDelay: '0s' }} stroke={paint} {...BASE_STROKE} x="16" y="6" width="16" height="36" rx="8" />
      <circle className="rtv-k-draw" pathLength={1} style={{ animationDelay: '0.15s' }} stroke={paint} {...BASE_STROKE} cx="24" cy="17" r="3" />
      <path className="rtv-k-draw" pathLength={1} style={{ animationDelay: '0.3s' }} stroke={paint} {...BASE_STROKE} d="M21 28 H27" />
      <path className="rtv-k-draw" pathLength={1} style={{ animationDelay: '0.45s' }} stroke={paint} {...BASE_STROKE} d="M21 34 H27" />
    </svg>
  );
};

export const RiffanRoomKeyIcon: React.FC<RiffanIconProps> = ({
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
      <circle className="rtv-k-draw" pathLength={1} style={{ animationDelay: '0s' }} stroke={paint} {...BASE_STROKE} cx="16" cy="32" r="8" />
      <path className="rtv-k-draw" pathLength={1} style={{ animationDelay: '0.15s' }} stroke={paint} {...BASE_STROKE} d="M22 26 L40 8" />
      <path className="rtv-k-draw" pathLength={1} style={{ animationDelay: '0.3s' }} stroke={paint} {...BASE_STROKE} d="M33 15 L38 20" />
    </svg>
  );
};

export const RiffanShuffleIcon: React.FC<RiffanIconProps> = ({
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
      <path className="rtv-k-draw" pathLength={1} style={{ animationDelay: '0s' }} stroke={paint} {...BASE_STROKE} d="M8 14 H15 C25 14 23 34 33 34 H40" />
      <path className="rtv-k-draw" pathLength={1} style={{ animationDelay: '0.15s' }} stroke={paint} {...BASE_STROKE} d="M34 28 L40 34 L34 40" />
      <path className="rtv-k-draw" pathLength={1} style={{ animationDelay: '0.3s' }} stroke={paint} {...BASE_STROKE} d="M8 34 H15 C19 34 21 31 22 29" />
      <path className="rtv-k-draw" pathLength={1} style={{ animationDelay: '0.45s' }} stroke={paint} {...BASE_STROKE} d="M26 19 C28 15 30 14 33 14 H40" />
      <path className="rtv-k-draw" pathLength={1} style={{ animationDelay: '0.6s' }} stroke={paint} {...BASE_STROKE} d="M34 8 L40 14 L34 20" />
    </svg>
  );
};

export const RiffanShareIcon: React.FC<RiffanIconProps> = ({
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
      <circle className="rtv-k-draw" pathLength={1} style={{ animationDelay: '0s' }} stroke={paint} {...BASE_STROKE} cx="36" cy="12" r="5" />
      <circle className="rtv-k-draw" pathLength={1} style={{ animationDelay: '0.15s' }} stroke={paint} {...BASE_STROKE} cx="12" cy="24" r="5" />
      <circle className="rtv-k-draw" pathLength={1} style={{ animationDelay: '0.3s' }} stroke={paint} {...BASE_STROKE} cx="36" cy="36" r="5" />
      <path className="rtv-k-draw" pathLength={1} style={{ animationDelay: '0.45s' }} stroke={paint} {...BASE_STROKE} d="M16.5 21.5 L31.5 14.5" />
      <path className="rtv-k-draw" pathLength={1} style={{ animationDelay: '0.6s' }} stroke={paint} {...BASE_STROKE} d="M16.5 26.5 L31.5 33.5" />
    </svg>
  );
};

export const RiffanLogoutIcon: React.FC<RiffanIconProps> = ({
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
      <path stroke={paint} {...BASE_STROKE} d="M18 8 H12 a4 4 0 0 0 -4 4 V36 a4 4 0 0 0 4 4 H18" />
      <g className="rtv-k-nudge-right">
        <path stroke={paint} {...BASE_STROKE} d="M28 16 L38 24 L28 32" />
        <path stroke={paint} {...BASE_STROKE} d="M38 24 H16" />
      </g>
    </svg>
  );
};

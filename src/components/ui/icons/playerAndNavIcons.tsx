import React from 'react';
import { BASE_STROKE, BrandGradientDef, type RiffanIconProps, useRiffanIconDefs } from './iconPrimitives';

// ============================================================================
// 3. REPRODUCTOR
// ============================================================================

export const RiffanPlayIcon: React.FC<RiffanIconProps> = ({
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
      <path className="rtv-k-play" style={{ transformOrigin: '26px 24px', fill: paint, fillOpacity: tone === 'current' ? 0.95 : 0.22 }} stroke={paint} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" d="M17 10 L38 24 L17 38Z" />
    </svg>
  );
};

export const RiffanPauseIcon: React.FC<RiffanIconProps> = ({
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
      <rect className="rtv-k-pause" style={{ transformBox: 'fill-box', transformOrigin: 'center', fill: paint, fillOpacity: tone === 'current' ? 0.95 : 0.2 }} stroke={paint} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" x="12" y="10" width="8" height="28" rx="3" />
      <rect className="rtv-k-pause" style={{ transformBox: 'fill-box', transformOrigin: 'center', animationDelay: '.2s', fill: paint, fillOpacity: tone === 'current' ? 0.95 : 0.2 }} stroke={paint} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" x="28" y="10" width="8" height="28" rx="3" />
    </svg>
  );
};

export const RiffanNextEpisodeIcon: React.FC<RiffanIconProps> = ({
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
      <g className="rtv-k-nudge-right">
        <path stroke={paint} {...BASE_STROKE} fill={paint} fillOpacity={tone === 'current' ? 0.9 : 0.2} d="M11 11 L29 24 L11 37Z" />
        <path stroke={paint} {...BASE_STROKE} d="M37 11 V37" />
      </g>
    </svg>
  );
};

export const RiffanFullscreenIcon: React.FC<RiffanIconProps> = ({
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
      <g className="rtv-k-zoom-in" style={{ transformOrigin: '24px 24px' }}>
        <path stroke={paint} {...BASE_STROKE} d="M8 18 V8 H18" />
        <path stroke={paint} {...BASE_STROKE} d="M30 8 H40 V18" />
        <path stroke={paint} {...BASE_STROKE} d="M40 30 V40 H30" />
        <path stroke={paint} {...BASE_STROKE} d="M18 40 H8 V30" />
      </g>
    </svg>
  );
};

export const RiffanExitFullscreenIcon: React.FC<RiffanIconProps> = ({
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
      <g className="rtv-k-zoom-out" style={{ transformOrigin: '24px 24px' }}>
        <path stroke={paint} {...BASE_STROKE} d="M18 8 V18 H8" />
        <path stroke={paint} {...BASE_STROKE} d="M30 8 V18 H40" />
        <path stroke={paint} {...BASE_STROKE} d="M40 30 H30 V40" />
        <path stroke={paint} {...BASE_STROKE} d="M8 30 H18 V40" />
      </g>
    </svg>
  );
};

export const RiffanVolumeIcon: React.FC<RiffanIconProps & { muted?: boolean }> = ({
  size = 20,
  animate = 'hover',
  tone = 'brand',
  muted = false,
  className = '',
  ...props
}) => {
  const { gradId, paint } = useRiffanIconDefs(tone);
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" data-anim={muted ? 'none' : animate} className={`rtv-ico shrink-0 ${className}`} {...props}>
      {tone === 'brand' && <BrandGradientDef id={gradId} />}
      <path stroke={paint} {...BASE_STROKE} d="M8 19 H14 L23 11 V37 L14 29 H8Z" />
      {muted ? (
        <>
          <path stroke={paint} {...BASE_STROKE} d="M30 18 L40 28" />
          <path stroke={paint} {...BASE_STROKE} d="M40 18 L30 28" />
        </>
      ) : (
        <>
          <path className="rtv-k-wave" stroke={paint} {...BASE_STROKE} d="M29 19 a7 7 0 0 1 0 10" />
          <path className="rtv-k-wave" style={{ animationDelay: '.25s' }} stroke={paint} {...BASE_STROKE} d="M34 13 a15 15 0 0 1 0 22" />
        </>
      )}
    </svg>
  );
};

export const RiffanSubtitlesIcon: React.FC<RiffanIconProps> = ({
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
      <rect className="rtv-k-draw" pathLength={1} style={{ animationDelay: '0s' }} stroke={paint} {...BASE_STROKE} x="6" y="10" width="36" height="28" rx="7" />
      <path className="rtv-k-draw" pathLength={1} style={{ animationDelay: '0.15s' }} stroke={paint} {...BASE_STROKE} d="M13 24 H21" />
      <path className="rtv-k-draw" pathLength={1} style={{ animationDelay: '0.3s' }} stroke={paint} {...BASE_STROKE} d="M27 24 H35" />
      <path className="rtv-k-draw" pathLength={1} style={{ animationDelay: '0.45s' }} stroke={paint} {...BASE_STROKE} d="M13 31 H27" />
    </svg>
  );
};

export const RiffanExternalLinkIcon: React.FC<RiffanIconProps> = ({
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
      <path stroke={paint} {...BASE_STROKE} d="M20 10 H12 a4 4 0 0 0 -4 4 V36 a4 4 0 0 0 4 4 H34 a4 4 0 0 0 4 -4 V28" />
      <g className="rtv-k-nudge-tr">
        <path stroke={paint} {...BASE_STROKE} d="M28 8 H40 V20" />
        <path stroke={paint} {...BASE_STROKE} d="M40 8 L22 26" />
      </g>
    </svg>
  );
};

export const RiffanRetryIcon: React.FC<RiffanIconProps> = ({
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
      <g className="rtv-k-retry" style={{ transformOrigin: '24px 24px' }}>
        <path stroke={paint} {...BASE_STROKE} d="M38 24 a14 14 0 1 1 -4.1 -9.9" />
        <path stroke={paint} {...BASE_STROKE} d="M36 8 V16 H28" />
      </g>
    </svg>
  );
};

export const RiffanCastIcon: React.FC<RiffanIconProps> = ({
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
      <path stroke={paint} {...BASE_STROKE} d="M8 15 a4 4 0 0 1 4 -4 H36 a4 4 0 0 1 4 4 V35 a4 4 0 0 1 -4 4 H28" />
      <path className="rtv-k-wave" stroke={paint} {...BASE_STROKE} d="M8 29 a10 10 0 0 1 10 10" />
      <path className="rtv-k-wave" style={{ animationDelay: '.25s' }} stroke={paint} {...BASE_STROKE} d="M8 21 a18 18 0 0 1 18 18" />
      <circle cx="9" cy="39" r="2" fill={paint} />
    </svg>
  );
};

export const RiffanVoiceCallIcon: React.FC<RiffanIconProps> = ({
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
      <path stroke={paint} {...BASE_STROKE} d="M15 9 H21 L24 18 L20 21 C22 26 26 30 31 32 L34 28 L43 31 V37 a4 4 0 0 1 -4 4 C22 41 7 26 7 13 a4 4 0 0 1 4 -4Z" />
      <path className="rtv-k-wave" stroke={paint} {...BASE_STROKE} d="M29 17 a6 6 0 0 1 6 6" />
      <path className="rtv-k-wave" style={{ animationDelay: '.25s' }} stroke={paint} {...BASE_STROKE} d="M29 10 a13 13 0 0 1 13 13" />
    </svg>
  );
};

export const RiffanChatIcon: React.FC<RiffanIconProps> = ({
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
      <path stroke={paint} {...BASE_STROKE} d="M9 12 a4 4 0 0 1 4 -4 H35 a4 4 0 0 1 4 4 V28 a4 4 0 0 1 -4 4 H22 L14 40 V32 H13 a4 4 0 0 1 -4 -4Z" />
      <circle className="rtv-k-chat-dot" cx="17" cy="20" r="2.4" fill={paint} style={{ animationDelay: '0s' }} />
      <circle className="rtv-k-chat-dot" cx="24" cy="20" r="2.4" fill={paint} style={{ animationDelay: '0.15s' }} />
      <circle className="rtv-k-chat-dot" cx="31" cy="20" r="2.4" fill={paint} style={{ animationDelay: '0.3s' }} />
    </svg>
  );
};

export const RiffanSlidersIcon: React.FC<RiffanIconProps> = ({
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
      <path stroke={paint} {...BASE_STROKE} d="M8 14 H40" />
      <path stroke={paint} {...BASE_STROKE} d="M8 24 H40" />
      <path stroke={paint} {...BASE_STROKE} d="M8 34 H40" />
      <circle className="rtv-k-knob" style={{ ['--rtv-d' as string]: '-12px' }} cx="30" cy="14" r="4.5" fill={paint} />
      <circle className="rtv-k-knob" style={{ animationDelay: '.3s', ['--rtv-d' as string]: '12px' }} cx="18" cy="24" r="4.5" fill={paint} />
      <circle className="rtv-k-knob" style={{ animationDelay: '.6s', ['--rtv-d' as string]: '-14px' }} cx="32" cy="34" r="4.5" fill={paint} />
    </svg>
  );
};

// ============================================================================
// 4. NAVEGACIÓN
// ============================================================================

export const RiffanChevronDownIcon: React.FC<RiffanIconProps> = ({
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
      <g className="rtv-k-nudge-down">
        <path stroke={paint} {...BASE_STROKE} d="M12 18 L24 30 L36 18" />
      </g>
    </svg>
  );
};

export const RiffanChevronUpIcon: React.FC<RiffanIconProps> = ({
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
      <g className="rtv-k-nudge-up">
        <path stroke={paint} {...BASE_STROKE} d="M12 30 L24 18 L36 30" />
      </g>
    </svg>
  );
};

export const RiffanChevronLeftIcon: React.FC<RiffanIconProps> = ({
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
      <g className="rtv-k-nudge-left">
        <path stroke={paint} {...BASE_STROKE} d="M30 12 L18 24 L30 36" />
      </g>
    </svg>
  );
};

export const RiffanChevronRightIcon: React.FC<RiffanIconProps> = ({
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
        <path stroke={paint} {...BASE_STROKE} d="M18 12 L30 24 L18 36" />
      </g>
    </svg>
  );
};

export const RiffanBackIcon: React.FC<RiffanIconProps> = ({
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
      <g className="rtv-k-nudge-left">
        <path stroke={paint} {...BASE_STROKE} d="M39 24 H11" />
        <path stroke={paint} {...BASE_STROKE} d="M21 14 L11 24 L21 34" />
      </g>
    </svg>
  );
};

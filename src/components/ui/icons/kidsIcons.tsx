import React from 'react';
import {
  BASE_STROKE,
  type RiffanIconProps,
  ToneGradientDef,
  useRiffanIconDefs,
} from './iconPrimitives';

// ============================================================================
// 10. RIFFAN KIDS (ACENTO CÁLIDO AMBAR -> ROSA)
// ============================================================================

export const RiffanKidsFoxIcon: React.FC<RiffanIconProps> = ({
  size = 24,
  animate = 'hover',
  tone = 'kids',
  className = '',
  ...props
}) => {
  const { gradId, paint } = useRiffanIconDefs(tone);
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" data-anim={animate} className={`rtv-ico shrink-0 ${className}`} {...props}>
      <ToneGradientDef tone={tone} id={gradId} />
      <g className="rtv-k-nudge-up" style={{ transformOrigin: '24px 26px' }}>
        <path {...BASE_STROKE} stroke={paint} fill={paint} fillOpacity="0.22" d="M13 15 L24 28 L35 15 L38 24 L24 40 L10 24 Z" />
        <path fill={paint} d="M19 19 L24 25 L29 19 Z" />
        <circle fill={paint} cx="18" cy="22" r="2" />
        <circle fill={paint} cx="30" cy="22" r="2" />
      </g>
    </svg>
  );
};

export const RiffanKidsLearnIcon: React.FC<RiffanIconProps> = ({
  size = 24,
  animate = 'hover',
  tone = 'kids',
  className = '',
  ...props
}) => {
  const { gradId, paint } = useRiffanIconDefs(tone);
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" data-anim={animate} className={`rtv-ico shrink-0 ${className}`} {...props}>
      <ToneGradientDef tone={tone} id={gradId} />
      <path {...BASE_STROKE} stroke={paint} fill={paint} fillOpacity="0.16" d="M24 14 C19 10 12 10 7 13 V36 C12 33 19 33 24 37 C29 33 36 33 41 36 V13 C36 10 29 10 24 14 Z" />
      <path {...BASE_STROKE} stroke={paint} d="M24 14 V37" />
      <path className="rtv-k-star" style={{ transformOrigin: '24px 8px' }} fill={paint} d="M24 4 L25.8 8 L30 8.6 L27 11.4 L27.8 15.5 L24 13.5 L20.2 15.5 L21 11.4 L18 8.6 L22.2 8 Z" />
    </svg>
  );
};

export const RiffanKidsDrawIcon: React.FC<RiffanIconProps> = ({
  size = 24,
  animate = 'hover',
  tone = 'kids',
  className = '',
  ...props
}) => {
  const { gradId, paint } = useRiffanIconDefs(tone);
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" data-anim={animate} className={`rtv-ico shrink-0 ${className}`} {...props}>
      <ToneGradientDef tone={tone} id={gradId} />
      <path {...BASE_STROKE} className="rtv-k-card-fan" style={{ transformOrigin: '16px 32px' }} stroke={paint} fill={paint} fillOpacity="0.2" d="M31 9 L39 17 L19 37 L9 39 L11 29 Z" />
      <path {...BASE_STROKE} stroke={paint} d="M26 14 L34 22" />
    </svg>
  );
};

export const RiffanKidsPianoIcon: React.FC<RiffanIconProps> = ({
  size = 24,
  animate = 'hover',
  tone = 'kids',
  className = '',
  ...props
}) => {
  const { gradId, paint } = useRiffanIconDefs(tone);
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" data-anim={animate} className={`rtv-ico shrink-0 ${className}`} {...props}>
      <ToneGradientDef tone={tone} id={gradId} />
      <rect {...BASE_STROKE} stroke={paint} fill={paint} fillOpacity="0.14" x="7" y="19" width="34" height="20" rx="5" />
      <path {...BASE_STROKE} stroke={paint} d="M16 19 V31 M24 19 V31 M32 19 V31" />
      <path className="rtv-k-note" style={{ transformOrigin: '24px 12px' }} stroke={paint} strokeWidth="2.8" strokeLinecap="round" fill="none" d="M20 14 V8 L30 6 V12" />
    </svg>
  );
};

export const RiffanKidsPuzzleIcon: React.FC<RiffanIconProps> = ({
  size = 24,
  animate = 'hover',
  tone = 'kids',
  className = '',
  ...props
}) => {
  const { gradId, paint } = useRiffanIconDefs(tone);
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" data-anim={animate} className={`rtv-ico shrink-0 ${className}`} {...props}>
      <ToneGradientDef tone={tone} id={gradId} />
      <path {...BASE_STROKE} className="rtv-k-nudge-up" stroke={paint} fill={paint} fillOpacity="0.2" d="M12 16 H20 C20 12.5 28 12.5 28 16 H36 V23 C39.5 23 39.5 31 36 31 V38 H12 V31 C15.5 31 15.5 23 12 23 Z" />
    </svg>
  );
};

export const RiffanKidsSimonIcon: React.FC<RiffanIconProps> = ({
  size = 24,
  animate = 'hover',
  tone = 'kids',
  className = '',
  ...props
}) => {
  const { gradId, paint } = useRiffanIconDefs(tone);
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" data-anim={animate} className={`rtv-ico shrink-0 ${className}`} {...props}>
      <ToneGradientDef tone={tone} id={gradId} />
      <path {...BASE_STROKE} className="rtv-k-wave" style={{ animationDelay: '0s' }} stroke={paint} fill={paint} fillOpacity="0.26" d="M22 8 A16 16 0 0 0 8 22 H22 Z" />
      <path {...BASE_STROKE} className="rtv-k-wave" style={{ animationDelay: '0.3s' }} stroke={paint} fill={paint} fillOpacity="0.26" d="M26 8 V22 H40 A16 16 0 0 0 26 8 Z" />
      <path {...BASE_STROKE} className="rtv-k-wave" style={{ animationDelay: '0.6s' }} stroke={paint} fill={paint} fillOpacity="0.26" d="M8 26 A16 16 0 0 0 22 40 V26 Z" />
      <path {...BASE_STROKE} className="rtv-k-wave" style={{ animationDelay: '0.9s' }} stroke={paint} fill={paint} fillOpacity="0.26" d="M26 26 V40 A16 16 0 0 0 40 26 Z" />
    </svg>
  );
};

export const RiffanKidsBubblesIcon: React.FC<RiffanIconProps> = ({
  size = 24,
  animate = 'hover',
  tone = 'kids',
  className = '',
  ...props
}) => {
  const { gradId, paint } = useRiffanIconDefs(tone);
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" data-anim={animate} className={`rtv-ico shrink-0 ${className}`} {...props}>
      <ToneGradientDef tone={tone} id={gradId} />
      <circle {...BASE_STROKE} className="rtv-k-bubble" style={{ animationDelay: '0s' }} stroke={paint} fill={paint} fillOpacity="0.2" cx="17" cy="27" r="9" />
      <circle {...BASE_STROKE} className="rtv-k-bubble" style={{ animationDelay: '0.3s' }} stroke={paint} fill={paint} fillOpacity="0.22" cx="33" cy="17" r="7" />
      <circle {...BASE_STROKE} className="rtv-k-bubble" style={{ animationDelay: '0.6s' }} stroke={paint} fill={paint} fillOpacity="0.18" cx="32" cy="35" r="5" />
    </svg>
  );
};

export const RiffanKidsMagicIcon: React.FC<RiffanIconProps> = ({
  size = 24,
  animate = 'hover',
  tone = 'kids',
  className = '',
  ...props
}) => {
  const { gradId, paint } = useRiffanIconDefs(tone);
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" data-anim={animate} className={`rtv-ico shrink-0 ${className}`} {...props}>
      <ToneGradientDef tone={tone} id={gradId} />
      <path {...BASE_STROKE} stroke={paint} d="M10 38 L29 19" />
      <path className="rtv-k-star" style={{ transformOrigin: '33px 15px' }} fill={paint} stroke={paint} strokeWidth="2" strokeLinejoin="round" d="M33 7 L35.5 12.5 L41 15 L35.5 17.5 L33 23 L30.5 17.5 L25 15 L30.5 12.5 Z" />
      <circle className="rtv-k-twinkle" style={{ transformOrigin: '16px 14px' }} fill={paint} cx="16" cy="14" r="2.2" />
      <circle className="rtv-k-twinkle" style={{ transformOrigin: '36px 32px', animationDelay: '0.35s' }} fill={paint} cx="36" cy="32" r="2" />
    </svg>
  );
};

export const RiffanKidsOwlIcon: React.FC<RiffanIconProps> = ({
  size = 24,
  animate = 'hover',
  tone = 'kids',
  className = '',
  ...props
}) => {
  const { gradId, paint } = useRiffanIconDefs(tone);
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" data-anim={animate} className={`rtv-ico shrink-0 ${className}`} {...props}>
      <ToneGradientDef tone={tone} id={gradId} />
      <g className="rtv-k-wave" style={{ transformOrigin: '24px 24px' }}>
        <path {...BASE_STROKE} stroke={paint} fill={paint} fillOpacity="0.2" d="M12 18 L16 11 L24 16 L32 11 L36 18 C36 30 32 39 24 39 C16 39 12 30 12 18 Z" />
        <circle {...BASE_STROKE} stroke={paint} fill="#fff" cx="19" cy="22" r="5" />
        <circle {...BASE_STROKE} stroke={paint} fill="#fff" cx="29" cy="22" r="5" />
        <circle fill={paint} cx="19" cy="22" r="2" />
        <circle fill={paint} cx="29" cy="22" r="2" />
        <path fill={paint} d="M22 29 L24 33 L26 29 Z" />
      </g>
    </svg>
  );
};

export const RiffanKidsPandaIcon: React.FC<RiffanIconProps> = ({
  size = 24,
  animate = 'hover',
  tone = 'kids',
  className = '',
  ...props
}) => {
  const { gradId, paint } = useRiffanIconDefs(tone);
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" data-anim={animate} className={`rtv-ico shrink-0 ${className}`} {...props}>
      <ToneGradientDef tone={tone} id={gradId} />
      <g className="rtv-k-nudge-up" style={{ transformOrigin: '24px 26px' }}>
        <circle fill={paint} fillOpacity="0.25" cx="15" cy="15" r="5" />
        <circle fill={paint} fillOpacity="0.25" cx="33" cy="15" r="5" />
        <circle {...BASE_STROKE} stroke={paint} fill="#fff" cx="24" cy="26" r="14" />
        <ellipse fill={paint} cx="18" cy="25" rx="3.5" ry="5" transform="rotate(-15 18 25)" />
        <ellipse fill={paint} cx="30" cy="25" rx="3.5" ry="5" transform="rotate(15 30 25)" />
        <circle fill="#fff" cx="17.5" cy="24" r="1.2" />
        <circle fill="#fff" cx="30.5" cy="24" r="1.2" />
        <path fill={paint} d="M21 31 Q24 34 27 31 Z" />
      </g>
    </svg>
  );
};

export const RiffanKidsCatIcon: React.FC<RiffanIconProps> = ({
  size = 24,
  animate = 'hover',
  tone = 'kids',
  className = '',
  ...props
}) => {
  const { gradId, paint } = useRiffanIconDefs(tone);
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" data-anim={animate} className={`rtv-ico shrink-0 ${className}`} {...props}>
      <ToneGradientDef tone={tone} id={gradId} />
      <g className="rtv-k-card-fan" style={{ transformOrigin: '24px 26px' }}>
        <path fill={paint} d="M12 17 L18 23 L14 27 Z" />
        <path fill={paint} d="M36 17 L30 23 L34 27 Z" />
        <circle {...BASE_STROKE} stroke={paint} fill={paint} fillOpacity="0.18" cx="24" cy="26" r="13" />
        <circle fill={paint} cx="19" cy="24" r="2" />
        <circle fill={paint} cx="29" cy="24" r="2" />
        <path fill={paint} d="M22 30 L24 32 L26 30 Z" />
        <path stroke={paint} strokeWidth="1.8" d="M9 28 L15 29 M9 33 L14 32 M39 28 L33 29 M39 33 L34 32" />
      </g>
    </svg>
  );
};

export const RiffanKidsBearIcon: React.FC<RiffanIconProps> = ({
  size = 24,
  animate = 'hover',
  tone = 'kids',
  className = '',
  ...props
}) => {
  const { gradId, paint } = useRiffanIconDefs(tone);
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" data-anim={animate} className={`rtv-ico shrink-0 ${className}`} {...props}>
      <ToneGradientDef tone={tone} id={gradId} />
      <g className="rtv-k-nudge-up" style={{ transformOrigin: '24px 26px' }}>
        <circle fill={paint} fillOpacity="0.3" cx="14" cy="14" r="6" />
        <circle fill={paint} fillOpacity="0.3" cx="34" cy="14" r="6" />
        <circle {...BASE_STROKE} stroke={paint} fill={paint} fillOpacity="0.16" cx="24" cy="26" r="13" />
        <circle fill={paint} cx="18" cy="23" r="2" />
        <circle fill={paint} cx="30" cy="23" r="2" />
        <ellipse fill={paint} fillOpacity="0.5" cx="24" cy="29" rx="5" ry="3.5" />
        <circle fill={paint} cx="24" cy="28" r="2" />
      </g>
    </svg>
  );
};

export const RiffanKidsRabbitIcon: React.FC<RiffanIconProps> = ({
  size = 24,
  animate = 'hover',
  tone = 'kids',
  className = '',
  ...props
}) => {
  const { gradId, paint } = useRiffanIconDefs(tone);
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" data-anim={animate} className={`rtv-ico shrink-0 ${className}`} {...props}>
      <ToneGradientDef tone={tone} id={gradId} />
      <g className="rtv-k-nudge-up" style={{ transformOrigin: '24px 28px' }}>
        <ellipse {...BASE_STROKE} stroke={paint} fill={paint} fillOpacity="0.2" cx="19" cy="11" rx="3.5" ry="9" />
        <ellipse {...BASE_STROKE} stroke={paint} fill={paint} fillOpacity="0.2" cx="29" cy="11" rx="3.5" ry="9" />
        <circle {...BASE_STROKE} stroke={paint} fill={paint} fillOpacity="0.16" cx="24" cy="29" r="11" />
        <circle fill={paint} cx="20" cy="27" r="1.8" />
        <circle fill={paint} cx="28" cy="27" r="1.8" />
        <polygon fill={paint} points="23,31 25,31 24,33" />
      </g>
    </svg>
  );
};

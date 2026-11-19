import React from 'react';
import {
  BASE_STROKE,
  type RiffanIconProps,
  ToneGradientDef,
  useRiffanIconDefs,
} from './iconPrimitives';

// ============================================================================
// 8. DEPORTES Y SALÓN DE JUEGOS
// ============================================================================

export const RiffanFootballIcon: React.FC<RiffanIconProps> = ({
  size = 22,
  animate = 'hover',
  tone = 'brand',
  className = '',
  ...props
}) => {
  const { gradId, paint } = useRiffanIconDefs(tone);
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" data-anim={animate} className={`rtv-ico shrink-0 ${className}`} {...props}>
      <ToneGradientDef tone={tone} id={gradId} />
      <g className="rtv-k-ball" style={{ transformOrigin: '24px 24px' }}>
        <circle stroke={paint} {...BASE_STROKE} cx="24" cy="24" r="16" />
        <polygon stroke={paint} fill={paint} fillOpacity="0.22" strokeWidth="2.5" strokeLinejoin="round" points="24,16 30.5,20.8 28,28.5 20,28.5 17.5,20.8" />
        <path stroke={paint} strokeWidth="2.2" strokeLinecap="round" d="M24 16 V8.5 M30.5 20.8 L38 17.5 M28 28.5 L33.5 36 M20 28.5 L14.5 36 M17.5 20.8 L10 17.5" />
      </g>
    </svg>
  );
};

export const RiffanTrophyIcon: React.FC<RiffanIconProps> = ({
  size = 22,
  animate = 'hover',
  tone = 'brand',
  className = '',
  ...props
}) => {
  const { gradId, paint } = useRiffanIconDefs(tone);
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" data-anim={animate} className={`rtv-ico shrink-0 ${className}`} {...props}>
      <ToneGradientDef tone={tone} id={gradId} />
      <g className="rtv-k-trophy" style={{ transformOrigin: '24px 24px' }}>
        <path {...BASE_STROKE} stroke={paint} fill={paint} fillOpacity="0.14" d="M15 9 H33 V19 C33 25 29 29 24 29 C19 29 15 25 15 19 Z" />
        <path {...BASE_STROKE} stroke={paint} d="M15 12 H10 C8 12 8 20 12 21 H15 M33 12 H38 C40 12 40 20 36 21 H33" />
        <path {...BASE_STROKE} stroke={paint} d="M24 29 V37 M17 39 H31" />
      </g>
    </svg>
  );
};

export const RiffanGamesIcon: React.FC<RiffanIconProps> = ({
  size = 22,
  animate = 'hover',
  tone = 'brand',
  className = '',
  ...props
}) => {
  const { gradId, paint } = useRiffanIconDefs(tone);
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" data-anim={animate} className={`rtv-ico shrink-0 ${className}`} {...props}>
      <ToneGradientDef tone={tone} id={gradId} />
      <path {...BASE_STROKE} stroke={paint} fill={paint} fillOpacity="0.14" d="M14 15 H34 C38.5 15 42 19 42 24 L40.5 32.5 C40 35.5 37 37 34.5 35 L30 31 H18 L13.5 35 C11 37 8 35.5 7.5 32.5 L6 24 C6 19 9.5 15 14 15 Z" />
      <path {...BASE_STROKE} stroke={paint} d="M14 21 V27 M11 24 H17" />
      <g className="rtv-k-twinkle" style={{ transformOrigin: '33px 23px' }}>
        <circle fill={paint} cx="31" cy="21.5" r="1.9" />
        <circle fill={paint} cx="35.5" cy="25.5" r="1.9" />
      </g>
    </svg>
  );
};

export const RiffanBilliardsIcon: React.FC<RiffanIconProps> = ({
  size = 22,
  animate = 'hover',
  tone = 'brand',
  className = '',
  ...props
}) => {
  const { gradId, paint } = useRiffanIconDefs(tone);
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" data-anim={animate} className={`rtv-ico shrink-0 ${className}`} {...props}>
      <ToneGradientDef tone={tone} id={gradId} />
      <g className="rtv-k-ball" style={{ transformOrigin: '24px 24px' }}>
        <circle {...BASE_STROKE} stroke={paint} fill={paint} fillOpacity="0.16" cx="24" cy="24" r="15.5" />
        <circle stroke={paint} strokeWidth="2.4" fill="none" cx="24" cy="23" r="6.8" />
        <circle stroke={paint} strokeWidth="2.2" fill="none" cx="24" cy="20.8" r="2.1" />
        <circle stroke={paint} strokeWidth="2.2" fill="none" cx="24" cy="25.2" r="2.4" />
      </g>
    </svg>
  );
};

export const RiffanDiceIcon: React.FC<RiffanIconProps> = ({
  size = 22,
  animate = 'hover',
  tone = 'brand',
  className = '',
  ...props
}) => {
  const { gradId, paint } = useRiffanIconDefs(tone);
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" data-anim={animate} className={`rtv-ico shrink-0 ${className}`} {...props}>
      <ToneGradientDef tone={tone} id={gradId} />
      <g className="rtv-k-dice" style={{ transformOrigin: '24px 24px' }}>
        <rect {...BASE_STROKE} stroke={paint} fill={paint} fillOpacity="0.14" x="9" y="9" width="30" height="30" rx="7" />
        <circle fill={paint} cx="17" cy="17" r="2.2" />
        <circle fill={paint} cx="31" cy="17" r="2.2" />
        <circle fill={paint} cx="24" cy="24" r="2.2" />
        <circle fill={paint} cx="17" cy="31" r="2.2" />
        <circle fill={paint} cx="31" cy="31" r="2.2" />
      </g>
    </svg>
  );
};

export const RiffanCardsIcon: React.FC<RiffanIconProps> = ({
  size = 22,
  animate = 'hover',
  tone = 'brand',
  className = '',
  ...props
}) => {
  const { gradId, paint } = useRiffanIconDefs(tone);
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" data-anim={animate} className={`rtv-ico shrink-0 ${className}`} {...props}>
      <ToneGradientDef tone={tone} id={gradId} />
      <rect {...BASE_STROKE} stroke={paint} fill={paint} fillOpacity="0.1" x="9" y="11" width="18" height="26" rx="4" transform="rotate(-10 18 24)" />
      <g className="rtv-k-card-fan" style={{ transformOrigin: '28px 32px' }}>
        <rect {...BASE_STROKE} stroke={paint} fill="#0E1018" fillOpacity="0.88" x="19" y="10" width="19" height="27" rx="4" transform="rotate(8 28 24)" />
        <path fill={paint} d="M28.5 19 L32 23.5 L28.5 28 L25 23.5 Z" />
      </g>
    </svg>
  );
};

// ============================================================================
// 9. CUENTA Y UTILIDADES DE PERFIL
// ============================================================================

export const RiffanContinueWatchingIcon: React.FC<RiffanIconProps> = ({
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
      <circle stroke={paint} {...BASE_STROKE} cx="24" cy="24" r="16" strokeDasharray="78 24" />
      <path className="rtv-k-play" style={{ transformOrigin: '25px 24px' }} stroke={paint} fill={paint} fillOpacity="0.24" strokeWidth="2.8" strokeLinejoin="round" d="M20 17 L32 24 L20 31 Z" />
    </svg>
  );
};

export const RiffanBookmarkIcon: React.FC<RiffanIconProps & { active?: boolean }> = ({
  size = 20,
  animate = 'hover',
  tone = 'brand',
  active = false,
  className = '',
  ...props
}) => {
  const { gradId, paint } = useRiffanIconDefs(tone);
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" data-anim={animate} className={`rtv-ico shrink-0 ${className}`} {...props}>
      <ToneGradientDef tone={tone} id={gradId} />
      <path
        {...BASE_STROKE}
        className="rtv-k-bookmark"
        style={{ transformOrigin: '24px 10px', fill: paint, fillOpacity: active ? 0.82 : 0.16 }}
        stroke={paint}
        d="M14 9 H34 C35.7 9 37 10.3 37 12 V39 L24 31 L11 39 V12 C11 10.3 12.3 9 14 9 Z"
      />
    </svg>
  );
};

export const RiffanYouTubeIcon: React.FC<RiffanIconProps> = ({
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
      <rect {...BASE_STROKE} stroke={paint} fill={paint} fillOpacity="0.12" x="6" y="11" width="36" height="26" rx="8" />
      <path className="rtv-k-play" style={{ transformOrigin: '25px 24px' }} stroke={paint} fill={paint} fillOpacity="0.3" strokeWidth="2.8" strokeLinejoin="round" d="M20 18 L31 24 L20 30 Z" />
    </svg>
  );
};

export const RiffanDevicesIcon: React.FC<RiffanIconProps> = ({
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
      <path {...BASE_STROKE} stroke={paint} d="M24 33 H8 C6.9 33 6 32.1 6 31 V12 C6 10.9 6.9 10 8 10 H36 C37.1 10 38 10.9 38 12 V16" />
      <path {...BASE_STROKE} stroke={paint} d="M12 39 H22" />
      <rect {...BASE_STROKE} className="rtv-k-nudge-up" stroke={paint} fill={paint} fillOpacity="0.15" x="29" y="20" width="13" height="20" rx="3" />
    </svg>
  );
};

export const RiffanVoiceMicIcon: React.FC<RiffanIconProps> = ({
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
      <rect {...BASE_STROKE} stroke={paint} fill={paint} fillOpacity="0.18" x="19" y="8" width="10" height="19" rx="5" />
      <path {...BASE_STROKE} stroke={paint} d="M12 22 C12 29 17 34 24 34 C31 34 36 29 36 22 M24 34 V40 M18 40 H30" />
      <path className="rtv-k-wave" style={{ animationDelay: '0s' }} stroke={paint} strokeWidth="2.4" strokeLinecap="round" fill="none" d="M7 18 C5 21 5 25 7 28" />
      <path className="rtv-k-wave" style={{ animationDelay: '0.25s' }} stroke={paint} strokeWidth="2.4" strokeLinecap="round" fill="none" d="M41 18 C43 21 43 25 41 28" />
    </svg>
  );
};

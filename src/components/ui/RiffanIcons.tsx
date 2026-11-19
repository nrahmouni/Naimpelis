import React, { useId } from 'react';

export interface RiffanIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
  /**
   * 'always': runs kit animation continuously (best for loaders, live beacons, unread bell, active spinners)
   * 'hover': static by default, plays kit animation when button or parent `.group` is hovered
   * 'none': static gradient/currentColor vector
   */
  animate?: 'always' | 'hover' | 'none';
  /**
   * 'brand': signature RiffanTV #8B5CF6 -> #4CC9F0 gradient stroke/fill
   * 'kids': Riffan Kids warm #FBBF24 -> #F472B6 gradient stroke/fill
   * 'current': inherits currentColor for crisp contrast inside solid #9146FF / colored buttons
   */
  tone?: 'brand' | 'current' | 'kids';
}

function useRiffanIconDefs(tone: 'brand' | 'current' | 'kids' = 'brand') {
  const rawId = useId().replace(/:/g, '');
  const gradId = `rtv-g-${rawId}`;
  const paint = tone === 'current' ? 'currentColor' : `url(#${gradId})`;
  return { rawId, gradId, paint };
}

const BrandGradientDef: React.FC<{ id: string; x1?: number; y1?: number; x2?: number; y2?: number }> = ({
  id,
  x1 = 6,
  y1 = 6,
  x2 = 42,
  y2 = 42,
}) => (
  <defs>
    <linearGradient id={id} x1={x1} y1={y1} x2={x2} y2={y2} gradientUnits="userSpaceOnUse">
      <stop offset="0" stopColor="#8B5CF6" />
      <stop offset="1" stopColor="#4CC9F0" />
    </linearGradient>
  </defs>
);

const KidsGradientDef: React.FC<{ id: string; x1?: number; y1?: number; x2?: number; y2?: number }> = ({
  id,
  x1 = 6,
  y1 = 6,
  x2 = 42,
  y2 = 42,
}) => (
  <defs>
    <linearGradient id={id} x1={x1} y1={y1} x2={x2} y2={y2} gradientUnits="userSpaceOnUse">
      <stop offset="0" stopColor="#FBBF24" />
      <stop offset="1" stopColor="#F472B6" />
    </linearGradient>
  </defs>
);

const ToneGradientDef: React.FC<{ tone: 'brand' | 'current' | 'kids'; id: string }> = ({
  tone,
  id,
}) => {
  if (tone === 'current') return null;
  if (tone === 'kids') return <KidsGradientDef id={id} />;
  return <BrandGradientDef id={id} />;
};

const BASE_STROKE = {
  fill: 'none',
  strokeWidth: 3,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

// ============================================================================
// 1. MARCA Y CARGA CON LA R
// ============================================================================

export const RiffanAnimatedLogo: React.FC<{
  width?: number | string;
  height?: number | string;
  animate?: 'always' | 'none';
  className?: string;
}> = ({ width = 210, height = 60, animate = 'always', className = '' }) => {
  const uid = useId().replace(/:/g, '');
  const sg = `rtv-lh-sg-${uid}`;
  const lg = `rtv-lh-lg-${uid}`;
  const bg = `rtv-lh-bg-${uid}`;
  const ps = `rtv-lh-ps-${uid}`;
  const pl = `rtv-lh-pl-${uid}`;
  const pb = `rtv-lh-pb-${uid}`;
  const cs = `rtv-lh-cs-${uid}`;
  const cl = `rtv-lh-cl-${uid}`;
  const cb = `rtv-lh-cb-${uid}`;
  const ms = `rtv-lh-ms-${uid}`;
  const mb = `rtv-lh-mb-${uid}`;
  const ml = `rtv-lh-ml-${uid}`;
  const bl = `rtv-lh-bl-${uid}`;
  const tb = `rtv-lh-tb-${uid}`;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 420 120"
      width={width}
      height={height}
      role="img"
      aria-label="RiffanTV"
      data-anim={animate}
      className={`rtv-ico shrink-0 ${className}`}
    >
      <defs>
        <linearGradient id={sg} x1="142" y1="148" x2="192" y2="396" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#7C3AED" />
          <stop offset=".28" stopColor="#8B46F6" />
          <stop offset=".68" stopColor="#6929D4" />
          <stop offset="1" stopColor="#4C1D95" />
        </linearGradient>
        <linearGradient id={lg} x1="238" y1="264" x2="392" y2="396" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#5B21B6" />
          <stop offset=".26" stopColor="#6D28D9" />
          <stop offset=".56" stopColor="#4F46E5" />
          <stop offset=".82" stopColor="#3B82F6" />
          <stop offset="1" stopColor="#4CC9F0" />
        </linearGradient>
        <linearGradient id={bg} x1="158" y1="100" x2="322" y2="264" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset=".36" stopColor="#FAF8FF" />
          <stop offset=".64" stopColor="#ECE7FF" />
          <stop offset=".85" stopColor="#DDD5FF" />
          <stop offset="1" stopColor="#C9BEFF" />
        </linearGradient>
        <path
          id={ps}
          d="M 155.2 148 L 217.2 148 L 188.28 389.05 Q 187.44 396 180.44 396 L 132.44 396 Q 125.44 396 126.28 389.05 Z"
        />
        <path
          id={pl}
          d="M 228 264 L 294 264 L 391.55 390.46 Q 396 396 389 396 L 341 396 Q 334 396 329.72 390.46 Z"
        />
        <path
          id={pb}
          d="M 167.93 96 L 326.08 96 C 372.47 96, 405.57 133.61, 400 180 C 394.43 226.39, 352.31 264, 305.92 264 L 207.28 264 Q 203.28 264 203.76 260.03 L 209.52 212 L 312.16 212 C 329.83 212, 345.88 197.67, 348 180 C 350.12 162.33, 337.51 148, 319.84 148 L 156.72 148 Q 151.76 148 152.35 143.07 L 156.81 105.93 Q 158 96 167.93 96 Z"
        />
        <clipPath id={cs}>
          <use href={`#${ps}`} />
        </clipPath>
        <clipPath id={cl}>
          <use href={`#${pl}`} />
        </clipPath>
        <clipPath id={cb}>
          <use href={`#${pb}`} />
        </clipPath>
        <mask id={ms} maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">
          <path
            className="rtv-k-logo-stem"
            fill="none"
            stroke="#fff"
            strokeDasharray="1"
            pathLength={1}
            strokeWidth="150"
            d="M148 420 L194 130"
          />
        </mask>
        <mask id={mb} maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">
          <path
            className="rtv-k-logo-bow"
            fill="none"
            stroke="#fff"
            strokeDasharray="1"
            pathLength={1}
            strokeWidth="110"
            d="M140 122 H322 C362 122 380 150 374 182 C368 214 340 238 306 238 H196"
          />
        </mask>
        <mask id={ml} maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">
          <path
            className="rtv-k-logo-leg"
            fill="none"
            stroke="#fff"
            strokeDasharray="1"
            pathLength={1}
            strokeWidth="150"
            d="M236 236 L372 420"
          />
        </mask>
        <filter id={bl}>
          <feGaussianBlur stdDeviation="6" />
        </filter>
        <linearGradient id={tb} x1="64" y1="36" x2="448" y2="476" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#1E2638" />
          <stop offset=".42" stopColor="#111622" />
          <stop offset="1" stopColor="#07090F" />
        </linearGradient>
      </defs>
      <g transform="translate(-1.3 3.7) scale(.22)">
        <rect x="24" y="24" width="464" height="464" rx="116" fill={`url(#${tb})`} stroke="#2B3142" strokeWidth="3" />
        <g>
          <g mask={`url(#${ms})`}>
            <g clipPath={`url(#${cs})`}>
              <rect x="120" y="144" width="104" height="256" fill={`url(#${sg})`} />
            </g>
          </g>
          <g mask={`url(#${ml})`}>
            <g clipPath={`url(#${cl})`}>
              <rect x="224" y="260" width="176" height="140" fill={`url(#${lg})`} />
            </g>
          </g>
          <g mask={`url(#${mb})`}>
            <use href={`#${pb}`} fill={`url(#${bg})`} />
          </g>
          <g clipPath={`url(#${cb})`}>
            <path
              className="rtv-k-logo-cm"
              pathLength={1}
              d="M140 122 H322 C362 122 380 150 374 182 C368 214 340 238 306 238 H196"
              fill="none"
              stroke="#B9A4FF"
              strokeWidth="40"
              strokeLinecap="round"
              strokeDasharray=".07 2"
              filter={`url(#${bl})`}
            />
          </g>
        </g>
      </g>
      <text
        className="rtv-k-logo-t1"
        x="124"
        y="64"
        fontFamily="'Plus Jakarta Sans',Inter,'Segoe UI',system-ui,sans-serif"
        fontSize="52"
        fontWeight="800"
        letterSpacing="-1.5"
        fill="#fff"
      >
        Riffan<tspan fill="#8B5CF6">TV</tspan>
      </text>
      <text
        className="rtv-k-logo-t2"
        x="126"
        y="92"
        fontFamily="Inter,'Segoe UI',system-ui,sans-serif"
        fontSize="14"
        fontWeight="600"
        letterSpacing="4"
        fill="#8A90A8"
      >
        ULTRA HD STREAMING
      </text>
    </svg>
  );
};

export const RiffanLoaderR: React.FC<RiffanIconProps> = ({
  size = 56,
  animate = 'always',
  className = '',
  ...props
}) => {
  const uid = useId().replace(/:/g, '');
  const sg = `rtv-lr-sg-${uid}`;
  const lg = `rtv-lr-lg-${uid}`;
  const bg = `rtv-lr-bg-${uid}`;
  const ps = `rtv-lr-ps-${uid}`;
  const pl = `rtv-lr-pl-${uid}`;
  const pb = `rtv-lr-pb-${uid}`;
  const cs = `rtv-lr-cs-${uid}`;
  const cl = `rtv-lr-cl-${uid}`;
  const cb = `rtv-lr-cb-${uid}`;
  const ms = `rtv-lr-ms-${uid}`;
  const mb = `rtv-lr-mb-${uid}`;
  const ml = `rtv-lr-ml-${uid}`;
  const bl = `rtv-lr-bl-${uid}`;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      width={size}
      height={size}
      role="img"
      aria-label="Cargando RiffanTV"
      data-anim={animate}
      className={`rtv-ico shrink-0 drop-shadow-[0_0_12px_rgba(124,58,237,0.45)] ${className}`}
      {...props}
    >
      <defs>
        <linearGradient id={sg} x1="142" y1="148" x2="192" y2="396" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#7C3AED" />
          <stop offset=".28" stopColor="#8B46F6" />
          <stop offset=".68" stopColor="#6929D4" />
          <stop offset="1" stopColor="#4C1D95" />
        </linearGradient>
        <linearGradient id={lg} x1="238" y1="264" x2="392" y2="396" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#5B21B6" />
          <stop offset=".26" stopColor="#6D28D9" />
          <stop offset=".56" stopColor="#4F46E5" />
          <stop offset=".82" stopColor="#3B82F6" />
          <stop offset="1" stopColor="#4CC9F0" />
        </linearGradient>
        <linearGradient id={bg} x1="158" y1="100" x2="322" y2="264" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset=".36" stopColor="#FAF8FF" />
          <stop offset=".64" stopColor="#ECE7FF" />
          <stop offset=".85" stopColor="#DDD5FF" />
          <stop offset="1" stopColor="#C9BEFF" />
        </linearGradient>
        <path
          id={ps}
          d="M 155.2 148 L 217.2 148 L 188.28 389.05 Q 187.44 396 180.44 396 L 132.44 396 Q 125.44 396 126.28 389.05 Z"
        />
        <path
          id={pl}
          d="M 228 264 L 294 264 L 391.55 390.46 Q 396 396 389 396 L 341 396 Q 334 396 329.72 390.46 Z"
        />
        <path
          id={pb}
          d="M 167.93 96 L 326.08 96 C 372.47 96, 405.57 133.61, 400 180 C 394.43 226.39, 352.31 264, 305.92 264 L 207.28 264 Q 203.28 264 203.76 260.03 L 209.52 212 L 312.16 212 C 329.83 212, 345.88 197.67, 348 180 C 350.12 162.33, 337.51 148, 319.84 148 L 156.72 148 Q 151.76 148 152.35 143.07 L 156.81 105.93 Q 158 96 167.93 96 Z"
        />
        <clipPath id={cs}>
          <use href={`#${ps}`} />
        </clipPath>
        <clipPath id={cl}>
          <use href={`#${pl}`} />
        </clipPath>
        <clipPath id={cb}>
          <use href={`#${pb}`} />
        </clipPath>
        <mask id={ms} maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">
          <path
            className="rtv-k-loader-stem"
            fill="none"
            stroke="#fff"
            strokeDasharray="1"
            pathLength={1}
            strokeWidth="150"
            d="M148 420 L194 130"
          />
        </mask>
        <mask id={mb} maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">
          <path
            className="rtv-k-loader-bow"
            fill="none"
            stroke="#fff"
            strokeDasharray="1"
            pathLength={1}
            strokeWidth="110"
            d="M140 122 H322 C362 122 380 150 374 182 C368 214 340 238 306 238 H196"
          />
        </mask>
        <mask id={ml} maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">
          <path
            className="rtv-k-loader-leg"
            fill="none"
            stroke="#fff"
            strokeDasharray="1"
            pathLength={1}
            strokeWidth="150"
            d="M236 236 L372 420"
          />
        </mask>
        <filter id={bl}>
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>
      <g className="rtv-k-loader-all">
        <g mask={`url(#${ms})`}>
          <g clipPath={`url(#${cs})`}>
            <rect x="120" y="144" width="104" height="256" fill={`url(#${sg})`} />
          </g>
        </g>
        <g mask={`url(#${ml})`}>
          <g clipPath={`url(#${cl})`}>
            <rect x="224" y="260" width="176" height="140" fill={`url(#${lg})`} />
          </g>
        </g>
        <g mask={`url(#${mb})`}>
          <use href={`#${pb}`} fill={`url(#${bg})`} />
        </g>
        <g clipPath={`url(#${cb})`}>
          <path
            className="rtv-k-loader-cm"
            pathLength={1}
            d="M140 122 H322 C362 122 380 150 374 182 C368 214 340 238 306 238 H196"
            fill="none"
            stroke="#B9A4FF"
            strokeWidth="40"
            strokeLinecap="round"
            strokeDasharray=".07 2"
            filter={`url(#${bl})`}
          />
        </g>
      </g>
    </svg>
  );
};

// ============================================================================
// 2. CARGA
// ============================================================================

export const RiffanSpinner: React.FC<RiffanIconProps> = ({
  size = 20,
  animate = 'always',
  tone = 'brand',
  className = '',
  ...props
}) => {
  const { gradId, paint } = useRiffanIconDefs(tone);
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 48 48"
      width={size}
      height={size}
      aria-hidden="true"
      data-anim={animate}
      className={`rtv-ico shrink-0 ${className}`}
      {...props}
    >
      {tone === 'brand' && <BrandGradientDef id={gradId} />}
      <circle cx="24" cy="24" r="16" fill="none" stroke={tone === 'current' ? 'currentColor' : '#2A3145'} strokeOpacity={tone === 'current' ? 0.25 : 1} strokeWidth="4" />
      <circle
        className="rtv-k-spinner"
        style={{ transformOrigin: '24px 24px' }}
        cx="24"
        cy="24"
        r="16"
        fill="none"
        stroke={paint}
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray="30 100"
      />
    </svg>
  );
};

export const RiffanDotsLoader: React.FC<RiffanIconProps> = ({
  size = 24,
  animate = 'always',
  tone = 'brand',
  className = '',
  ...props
}) => {
  const { gradId, paint } = useRiffanIconDefs(tone);
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 48 48"
      width={size}
      height={size}
      aria-hidden="true"
      data-anim={animate}
      className={`rtv-ico shrink-0 ${className}`}
      {...props}
    >
      {tone === 'brand' && <BrandGradientDef id={gradId} />}
      <circle className="rtv-k-dot" cx="12" cy="30" r="4.5" fill={paint} style={{ animationDelay: '0s' }} />
      <circle className="rtv-k-dot" cx="24" cy="30" r="4.5" fill={paint} style={{ animationDelay: '0.15s' }} />
      <circle className="rtv-k-dot" cx="36" cy="30" r="4.5" fill={paint} style={{ animationDelay: '0.3s' }} />
    </svg>
  );
};

export const RiffanProgressBar: React.FC<{
  width?: number | string;
  height?: number | string;
  animate?: 'always' | 'none';
  className?: string;
}> = ({ width = 160, height = 24, animate = 'always', className = '' }) => {
  const uid = useId().replace(/:/g, '');
  const gradId = `rtv-bar-g-${uid}`;
  const clipId = `rtv-bar-c-${uid}`;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 160 48"
      width={width}
      height={height}
      aria-hidden="true"
      data-anim={animate}
      className={`rtv-ico shrink-0 ${className}`}
    >
      <defs>
        <linearGradient id={gradId} x1="8" y1="24" x2="152" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#8B5CF6" />
          <stop offset="1" stopColor="#4CC9F0" />
        </linearGradient>
        <clipPath id={clipId}>
          <rect x="8" y="20" width="144" height="8" rx="4" />
        </clipPath>
      </defs>
      <rect x="8" y="20" width="144" height="8" rx="4" fill="#2A3145" />
      <g clipPath={`url(#${clipId})`}>
        <rect className="rtv-k-bar" x="8" y="20" width="64" height="8" rx="4" fill={`url(#${gradId})`} />
      </g>
    </svg>
  );
};

export const RiffanVideoLoading: React.FC<RiffanIconProps> = ({
  size = 24,
  animate = 'always',
  tone = 'brand',
  className = '',
  ...props
}) => {
  const { gradId, paint } = useRiffanIconDefs(tone);
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 48 48"
      width={size}
      height={size}
      aria-hidden="true"
      data-anim={animate}
      className={`rtv-ico shrink-0 ${className}`}
      {...props}
    >
      {tone === 'brand' && <BrandGradientDef id={gradId} />}
      <circle cx="24" cy="24" r="19" fill="none" stroke={tone === 'current' ? 'currentColor' : '#2A3145'} strokeOpacity={tone === 'current' ? 0.25 : 1} strokeWidth="3.5" />
      <circle
        className="rtv-k-vid-rot"
        style={{ transformOrigin: '24px 24px' }}
        cx="24"
        cy="24"
        r="19"
        fill="none"
        stroke={paint}
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeDasharray="26 100"
      />
      <path
        className="rtv-k-vid-pl"
        style={{ transformOrigin: '26px 24px' }}
        d="M20 16 L33 24 L20 32Z"
        fill={paint}
      />
    </svg>
  );
};

export const RiffanPosterSkeleton: React.FC<{
  width?: number | string;
  height?: number | string;
  animate?: 'always' | 'none';
  className?: string;
}> = ({ width = '100%', height = '100%', animate = 'always', className = '' }) => {
  const uid = useId().replace(/:/g, '');
  const sh = `rtv-sk-sh-${uid}`;
  const clip = `rtv-sk-c-${uid}`;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 120 172"
      width={width}
      height={height}
      aria-hidden="true"
      data-anim={animate}
      className={`rtv-ico shrink-0 ${className}`}
    >
      <defs>
        <linearGradient id={sh}>
          <stop offset="0" stopColor="#8B5CF6" stopOpacity="0" />
          <stop offset=".5" stopColor="#8B5CF6" stopOpacity=".4" />
          <stop offset="1" stopColor="#8B5CF6" stopOpacity="0" />
        </linearGradient>
        <clipPath id={clip}>
          <rect x="4" y="4" width="112" height="130" rx="14" />
          <rect x="4" y="144" width="90" height="10" rx="5" />
          <rect x="4" y="160" width="56" height="8" rx="4" />
        </clipPath>
      </defs>
      <rect x="4" y="4" width="112" height="130" rx="14" fill="#1B2132" />
      <rect x="4" y="144" width="90" height="10" rx="5" fill="#1B2132" />
      <rect x="4" y="160" width="56" height="8" rx="4" fill="#1B2132" />
      <g clipPath={`url(#${clip})`}>
        <rect className="rtv-k-skel" x="-70" y="0" width="70" height="180" fill={`url(#${sh})`} />
      </g>
    </svg>
  );
};

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



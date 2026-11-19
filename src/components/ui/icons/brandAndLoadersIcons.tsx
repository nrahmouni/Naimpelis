import React, { useId } from 'react';
import { BrandGradientDef, type RiffanIconProps, useRiffanIconDefs } from './iconPrimitives';

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

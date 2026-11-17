import React, { useId, useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { RiffanSpinner } from './RiffanIcons';

export type UnifiedLanguageCode = 'ES' | 'LAT' | 'VOSE' | 'EN' | 'CAT';
export type FlagCode =
  | 'es'
  | 'en'
  | 'uk'
  | 'us'
  | 'ca'
  | 'zh'
  | 'cn'
  | 'ar'
  | 'qa'
  | 'ma'
  | 'eu'
  | 'mx'
  | 'lat'
  | 'docs'
  | 'all'
  | 'vose'
  | 'nl'
  | 'fr'
  | 'rif';

export const FlagBadgeSvg: React.FC<{ code: FlagCode; className?: string }> = ({
  code,
  className = 'w-5 h-3.5',
}) => {
  const uid = useId().replace(/:/g, '');
  const baseClass = `${className} rounded-[3px] shrink-0 overflow-hidden shadow-[0_1px_4px_rgba(0,0,0,0.45)] ring-1 ring-white/20`;

  if (code === 'es') {
    const shieldClipId = `es-shield-${uid}`;
    return (
      <svg viewBox="0 0 900 600" className={baseClass} aria-hidden="true">
        <defs>
          <clipPath id={shieldClipId}>
            <path d="M248,236 H352 V332 A52,56 0 0,1 248,332 Z" />
          </clipPath>
        </defs>
        <rect width="900" height="600" fill="#AA151B" />
        <rect y="150" width="900" height="300" fill="#F1BF00" />
        <g>
          <g>
            <path d="M298.5,172 H301.5 V176 H305.5 V179 H301.5 V183 H298.5 V179 H294.5 V176 H298.5 Z" fill="#F1BF00" stroke="#2B1D00" strokeWidth="1.2" strokeLinejoin="round" />
            <circle cx="300" cy="188" r="5" fill="#0039A6" stroke="#2B1D00" strokeWidth="1.3" />
            <path d="M295.2,188 H304.8 M300,183 V193" stroke="#F1BF00" strokeWidth="1.2" />
            <path d="M261,218 C255,200 278,191 300,196 C322,191 345,200 339,218 Z" fill="#AA151B" stroke="#2B1D00" strokeWidth="1.5" />
            <path d="M258,215 C254,193 282,188 300,194" fill="none" stroke="#2B1D00" strokeWidth="5.5" strokeLinecap="round" />
            <path d="M258,215 C254,193 282,188 300,194" fill="none" stroke="#F1BF00" strokeWidth="3" strokeLinecap="round" />
            <path d="M342,215 C346,193 318,188 300,194" fill="none" stroke="#2B1D00" strokeWidth="5.5" strokeLinecap="round" />
            <path d="M342,215 C346,193 318,188 300,194" fill="none" stroke="#F1BF00" strokeWidth="3" strokeLinecap="round" />
            <path d="M278,215 C277,196 290,191 300,194" fill="none" stroke="#2B1D00" strokeWidth="5" strokeLinecap="round" />
            <path d="M278,215 C277,196 290,191 300,194" fill="none" stroke="#F1BF00" strokeWidth="2.6" strokeLinecap="round" />
            <path d="M322,215 C323,196 310,191 300,194" fill="none" stroke="#2B1D00" strokeWidth="5" strokeLinecap="round" />
            <path d="M322,215 C323,196 310,191 300,194" fill="none" stroke="#F1BF00" strokeWidth="2.6" strokeLinecap="round" />
            <line x1="300" y1="215" x2="300" y2="193" stroke="#2B1D00" strokeWidth="5" />
            <line x1="300" y1="215" x2="300" y2="193" stroke="#F1BF00" strokeWidth="2.6" />
            <g fill="#FFFFFF">
              <circle cx="257" cy="207" r="1.4" />
              <circle cx="262" cy="198" r="1.4" />
              <circle cx="271" cy="193" r="1.4" />
              <circle cx="283" cy="191" r="1.4" />
              <circle cx="343" cy="207" r="1.4" />
              <circle cx="338" cy="198" r="1.4" />
              <circle cx="329" cy="193" r="1.4" />
              <circle cx="317" cy="191" r="1.4" />
              <circle cx="278" cy="206" r="1.3" />
              <circle cx="282" cy="198" r="1.3" />
              <circle cx="290" cy="194" r="1.3" />
              <circle cx="322" cy="206" r="1.3" />
              <circle cx="318" cy="198" r="1.3" />
              <circle cx="310" cy="194" r="1.3" />
              <circle cx="300" cy="207" r="1.3" />
              <circle cx="300" cy="200" r="1.3" />
            </g>
            <path d="M259,221 L254,213 L260,215 L264,210 L268,216 L273,213 L278,216 L283,210 L288,216 L294,213 L300,209 L306,213 L312,216 L317,210 L322,216 L327,213 L332,216 L336,210 L340,215 L346,213 L341,221 Z" fill="#F1BF00" stroke="#2B1D00" strokeWidth="1.4" strokeLinejoin="round" />
            <rect x="259" y="220" width="82" height="11" rx="2" fill="#F1BF00" stroke="#2B1D00" strokeWidth="1.5" />
            <rect x="297" y="223" width="6" height="5" rx="1" fill="#AA151B" stroke="#2B1D00" strokeWidth="0.9" />
            <circle cx="282" cy="225.5" r="2.3" fill="#007A3D" stroke="#2B1D00" strokeWidth="0.9" />
            <circle cx="318" cy="225.5" r="2.3" fill="#007A3D" stroke="#2B1D00" strokeWidth="0.9" />
            <circle cx="268" cy="225.5" r="2" fill="#0039A6" stroke="#2B1D00" strokeWidth="0.9" />
            <circle cx="332" cy="225.5" r="2" fill="#0039A6" stroke="#2B1D00" strokeWidth="0.9" />
          </g>
          <g>
            <path d="M207,242 L206,232 L211,235 L216,230 L221,235 L226,232 L225,242 Z" fill="#F1BF00" stroke="#2B1D00" strokeWidth="1.2" strokeLinejoin="round" />
            <rect x="205" y="243" width="22" height="6" fill="#F1BF00" stroke="#2B1D00" strokeWidth="1.2" />
            <rect x="209" y="249" width="14" height="137" fill="#D1D5DB" stroke="#4B5563" strokeWidth="1" />
            <rect x="205" y="386" width="22" height="7" fill="#F1BF00" stroke="#2B1D00" strokeWidth="1.2" />
            <path d="M202,394 Q209,390 216,394 T230,394 V403 H202 Z" fill="#0039A6" />
            <path d="M198,308 L234,322 V334 L198,320 Z" fill="#AA151B" />
            <text x="216" y="324" fontFamily="sans-serif" fontSize="8" fontWeight="bold" fill="#F1BF00" textAnchor="middle" transform="rotate(21 216 321)">PLVS</text>
            <path d="M375,242 L374,232 L379,235 L384,230 L389,235 L394,232 L393,242 Z" fill="#F1BF00" stroke="#2B1D00" strokeWidth="1.2" strokeLinejoin="round" />
            <rect x="373" y="243" width="22" height="6" fill="#F1BF00" stroke="#2B1D00" strokeWidth="1.2" />
            <rect x="377" y="249" width="14" height="137" fill="#D1D5DB" stroke="#4B5563" strokeWidth="1" />
            <rect x="373" y="386" width="22" height="7" fill="#F1BF00" stroke="#2B1D00" strokeWidth="1.2" />
            <path d="M370,394 Q377,390 384,394 T398,394 V403 H370 Z" fill="#0039A6" />
            <path d="M366,322 L402,308 V320 L366,334 Z" fill="#AA151B" />
            <text x="384" y="324" fontFamily="sans-serif" fontSize="7.5" fontWeight="bold" fill="#F1BF00" textAnchor="middle" transform="rotate(-21 384 321)">VLTRA</text>
          </g>
          <g clipPath={`url(#${shieldClipId})`}>
            <rect x="248" y="236" width="52" height="66" fill="#AA151B" />
            <path d="M261,286 V264 H265 V268 H270 V260 H278 V268 H283 V264 H287 V286 Z" fill="#F1BF00" />
            <rect x="300" y="236" width="52" height="66" fill="#FFFFFF" />
            <path d="M321,286 L323,272 L316,266 L322,258 L328,254 L334,260 L331,270 L336,286 H330 L327,277 L325,286 Z" fill="#9B1B5A" />
            <polygon points="323,253 326,248 329,253" fill="#F1BF00" stroke="#2B1D00" strokeWidth="0.8" />
            <rect x="248" y="302" width="52" height="86" fill="#F1BF00" />
            <rect x="255" y="302" width="6" height="86" fill="#AA151B" />
            <rect x="267" y="302" width="6" height="86" fill="#AA151B" />
            <rect x="279" y="302" width="6" height="86" fill="#AA151B" />
            <rect x="291" y="302" width="6" height="86" fill="#AA151B" />
            <rect x="300" y="302" width="52" height="86" fill="#AA151B" />
            <g stroke="#F1BF00" strokeWidth="2.5" fill="none">
              <rect x="308" y="310" width="36" height="44" />
              <line x1="308" y1="310" x2="344" y2="354" />
              <line x1="344" y1="310" x2="308" y2="354" />
              <line x1="326" y1="310" x2="326" y2="354" />
              <line x1="308" y1="332" x2="344" y2="332" />
            </g>
            <circle cx="326" cy="332" r="4" fill="#007A3D" />
            <path d="M278,388 L300,360 L322,388 Z" fill="#FFFFFF" />
            <circle cx="300" cy="378" r="4.5" fill="#AA151B" />
            <path d="M296,373 L300,369 L304,373" fill="none" stroke="#007A3D" strokeWidth="2" />
          </g>
          <path d="M248,236 H352 V332 A52,56 0 0,1 248,332 Z" fill="none" stroke="#2B1D00" strokeWidth="2" />
          <ellipse cx="300" cy="302" rx="13" ry="16" fill="#0039A6" stroke="#AA151B" strokeWidth="2.5" />
          <circle cx="295.5" cy="298" r="2.2" fill="#F1BF00" />
          <circle cx="304.5" cy="298" r="2.2" fill="#F1BF00" />
          <circle cx="300" cy="307.5" r="2.2" fill="#F1BF00" />
        </g>
      </svg>
    );
  }

  if (code === 'ca') {
    return (
      <svg viewBox="0 0 24 18" className={baseClass} aria-hidden="true">
        <rect width="24" height="18" fill="#FCDD09" />
        <rect width="24" height="2" y="2" fill="#DA121A" />
        <rect width="24" height="2" y="6" fill="#DA121A" />
        <rect width="24" height="2" y="10" fill="#DA121A" />
        <rect width="24" height="2" y="14" fill="#DA121A" />
      </svg>
    );
  }

  if (code === 'en' || code === 'uk') {
    return (
      <svg viewBox="0 0 24 16" className={baseClass} aria-hidden="true">
        <rect width="24" height="16" fill="#012169" />
        <path d="M0,0 L24,16 M24,0 L0,16" stroke="#FFFFFF" strokeWidth="3.2" />
        <path d="M0,0 L24,16 M24,0 L0,16" stroke="#C8102E" strokeWidth="1.6" />
        <path d="M12,0 V16 M0,8 H24" stroke="#FFFFFF" strokeWidth="5" />
        <path d="M12,0 V16 M0,8 H24" stroke="#C8102E" strokeWidth="3" />
      </svg>
    );
  }

  if (code === 'us') {
    return (
      <svg viewBox="0 0 24 16" className={baseClass} aria-hidden="true">
        <rect width="24" height="16" fill="#FFFFFF" />
        <rect width="24" height="1.6" y="0" fill="#B22234" />
        <rect width="24" height="1.6" y="3.2" fill="#B22234" />
        <rect width="24" height="1.6" y="6.4" fill="#B22234" />
        <rect width="24" height="1.6" y="9.6" fill="#B22234" />
        <rect width="24" height="1.6" y="12.8" fill="#B22234" />
        <rect width="24" height="1.6" y="14.4" fill="#B22234" />
        <rect width="10.5" height="8.6" x="0" y="0" fill="#3C3B6E" />
        <circle cx="2.2" cy="2.1" r="0.65" fill="#FFFFFF" />
        <circle cx="5.2" cy="2.1" r="0.65" fill="#FFFFFF" />
        <circle cx="8.2" cy="2.1" r="0.65" fill="#FFFFFF" />
        <circle cx="3.7" cy="4.3" r="0.65" fill="#FFFFFF" />
        <circle cx="6.7" cy="4.3" r="0.65" fill="#FFFFFF" />
        <circle cx="2.2" cy="6.5" r="0.65" fill="#FFFFFF" />
        <circle cx="5.2" cy="6.5" r="0.65" fill="#FFFFFF" />
        <circle cx="8.2" cy="6.5" r="0.65" fill="#FFFFFF" />
      </svg>
    );
  }

  if (code === 'nl') {
    return (
      <svg viewBox="0 0 24 16" className={baseClass} aria-hidden="true">
        <rect width="8" height="16" x="0" fill="#111111" />
        <rect width="8" height="16" x="8" fill="#FDDA24" />
        <rect width="8" height="16" x="16" fill="#EF3340" />
      </svg>
    );
  }

  if (code === 'fr') {
    return (
      <svg viewBox="0 0 24 16" className={baseClass} aria-hidden="true">
        <rect width="8" height="16" x="0" fill="#0055A4" />
        <rect width="8" height="16" x="8" fill="#FFFFFF" />
        <rect width="8" height="16" x="16" fill="#EF4135" />
      </svg>
    );
  }

  if (code === 'rif') {
    return (
      <svg viewBox="0 0 900 600" className={baseClass} aria-hidden="true">
        <rect width="900" height="600" fill="#C8102E"/>
        <polygon points="450,100 700,300 450,500 200,300" fill="#FFFFFF"/>
        <path d="M 479.98 245.46 A 75 75 0 1 0 479.98 354.54 A 62 62 0 1 1 479.98 245.46 Z" fill="#006233"/>
        <polygon points="513.5,262 524.47,281 546.41,281 535.44,300 546.41,319 524.47,319 513.5,338 502.53,319 480.59,319 491.56,300 480.59,281 502.53,281" fill="#006233"/>
      </svg>
    );
  }

  if (code === 'zh' || code === 'cn') {
    return (
      <svg viewBox="0 0 24 16" className={baseClass} aria-hidden="true">
        <rect width="24" height="16" fill="#DE2910" />
        <polygon
          points="5,2.4 5.7,4.5 7.9,4.5 6.1,5.8 6.8,7.9 5,6.6 3.2,7.9 3.9,5.8 2.1,4.5 4.3,4.5"
          fill="#FFDE00"
        />
        <circle cx="9.6" cy="2.3" r="0.7" fill="#FFDE00" />
        <circle cx="10.9" cy="4.0" r="0.7" fill="#FFDE00" />
        <circle cx="10.9" cy="6.2" r="0.7" fill="#FFDE00" />
        <circle cx="9.5" cy="7.9" r="0.7" fill="#FFDE00" />
      </svg>
    );
  }

  if (code === 'ar' || code === 'qa') {
    return (
      <svg viewBox="0 0 24 16" className={baseClass} aria-hidden="true">
        <rect width="24" height="16" fill="#8A1538" />
        <polygon
          points="0,0 7.2,0 9.4,1.33 7.2,2.67 9.4,4 7.2,5.33 9.4,6.67 7.2,8 9.4,9.33 7.2,10.67 9.4,12 7.2,13.33 9.4,14.67 7.2,16 0,16"
          fill="#FFFFFF"
        />
      </svg>
    );
  }

  if (code === 'ma') {
    return (
      <svg viewBox="0 0 24 16" className={baseClass} aria-hidden="true">
        <rect width="24" height="16" fill="#C1272D" />
        <polygon
          points="12,3.4 13.15,6.8 16.75,6.8 13.85,8.9 14.95,12.3 12,10.2 9.05,12.3 10.15,8.9 7.25,6.8 10.85,6.8"
          fill="none"
          stroke="#006233"
          strokeWidth="1.25"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (code === 'eu') {
    const stars = Array.from({ length: 12 }).map((_, i) => {
      const angle = (i * 30 * Math.PI) / 180;
      const cx = 12 + Math.cos(angle) * 4.8;
      const cy = 8 + Math.sin(angle) * 4.8;
      return { cx, cy };
    });
    return (
      <svg viewBox="0 0 24 16" className={baseClass} aria-hidden="true">
        <rect width="24" height="16" fill="#003399" />
        {stars.map((s, idx) => (
          <circle key={idx} cx={s.cx} cy={s.cy} r="0.72" fill="#FFCC00" />
        ))}
      </svg>
    );
  }

  if (code === 'mx') {
    return (
      <svg viewBox="0 0 24 16" className={baseClass} aria-hidden="true">
        <rect width="8" height="16" x="0" fill="#006847" />
        <rect width="8" height="16" x="8" fill="#FFFFFF" />
        <rect width="8" height="16" x="16" fill="#CE1126" />
        <circle cx="12" cy="8" r="2.1" fill="#8C5A2B" />
        <path d="M10.4,8.6 A1.8,1.8 0 0,0 13.6,8.6" fill="none" stroke="#006847" strokeWidth="0.9" />
      </svg>
    );
  }

  if (code === 'docs') {
    const gradId = `docsGrad-${uid}`;
    return (
      <svg viewBox="0 0 24 16" className={baseClass} aria-hidden="true">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#0369A1" />
            <stop offset="100%" stopColor="#0F766E" />
          </linearGradient>
        </defs>
        <rect width="24" height="16" fill={`url(#${gradId})`} />
        <circle cx="12" cy="8" r="5" fill="#0EA5E9" opacity="0.35" />
        <path d="M9.5,5.2 Q11.5,4.2 13,5.8 Q14,7 12.2,8.4 Q10.6,9.5 11.4,11.2" fill="none" stroke="#4ADE80" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="12" cy="8" r="4.8" fill="none" stroke="#E0F2FE" strokeWidth="1" opacity="0.85" />
      </svg>
    );
  }

  if (code === 'all') {
    const gradId = `allGrad-${uid}`;
    return (
      <svg viewBox="0 0 24 16" className={baseClass} aria-hidden="true">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#1E1B4B" />
            <stop offset="100%" stopColor="#4C1D95" />
          </linearGradient>
        </defs>
        <rect width="24" height="16" fill={`url(#${gradId})`} />
        <circle cx="12" cy="8" r="4.7" fill="none" stroke="#E9D5FF" strokeWidth="1.15" />
        <ellipse cx="12" cy="8" rx="2.2" ry="4.7" fill="none" stroke="#E9D5FF" strokeWidth="0.95" />
        <line x1="7.3" y1="8" x2="16.7" y2="8" stroke="#E9D5FF" strokeWidth="0.95" />
      </svg>
    );
  }

  if (code === 'lat') {
    const gradId = `latGrad-${uid}`;
    return (
      <svg viewBox="0 0 24 16" className={baseClass} aria-hidden="true">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#0284C7" />
            <stop offset="50%" stopColor="#059669" />
            <stop offset="100%" stopColor="#D97706" />
          </linearGradient>
        </defs>
        <rect width="24" height="16" fill={`url(#${gradId})`} />
        <circle cx="12" cy="8" r="4.5" fill="none" stroke="#FFFFFF" strokeWidth="1.2" opacity="0.92" />
        <ellipse cx="12" cy="8" rx="2.2" ry="4.5" fill="none" stroke="#FFFFFF" strokeWidth="1" opacity="0.85" />
        <line x1="7.5" y1="8" x2="16.5" y2="8" stroke="#FFFFFF" strokeWidth="1" opacity="0.85" />
      </svg>
    );
  }

  // vose
  const voseGradId = `voseGrad-${uid}`;
  return (
    <svg viewBox="0 0 24 16" className={baseClass} aria-hidden="true">
      <defs>
        <linearGradient id={voseGradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#4C1D95" />
          <stop offset="100%" stopColor="#9146FF" />
        </linearGradient>
      </defs>
      <rect width="24" height="16" fill={`url(#${voseGradId})`} />
      <rect x="4" y="4.5" width="16" height="2.2" rx="1" fill="#FFFFFF" opacity="0.95" />
      <rect x="6.5" y="9.3" width="11" height="2.2" rx="1" fill="#E9D5FF" opacity="0.95" />
    </svg>
  );
};

interface LanguageBadgeProps {
  code: string;
  active?: boolean;
  onClick?: () => void;
  size?: 'xs' | 'sm' | 'md';
  showFlag?: boolean;
  className?: string;
}

export function normalizeLangCode(raw?: string): UnifiedLanguageCode {
  if (!raw) return 'ES';
  const up = String(raw).trim().toUpperCase();
  if (up === 'CAT' || up === 'CA' || up.includes('CATAL') || up.includes('VALENCI')) return 'CAT';
  if (up === 'LAT' || up.includes('LATINO') || up.includes('LATIN')) return 'LAT';
  if (up === 'VOSE' || up.includes('SUB') || up.includes('ORIGINAL')) return 'VOSE';
  if (up === 'EN' || up.includes('ENG') || up.includes('INGLES') || up.includes('INGLÉS')) return 'EN';
  return 'ES';
}

export const LANGUAGE_LABELS: Record<UnifiedLanguageCode, { short: string; title: string; flag: FlagCode }> = {
  ES: { short: 'ES', title: 'Castellano (España)', flag: 'es' },
  CAT: { short: 'CAT', title: 'Català', flag: 'ca' },
  LAT: { short: 'LAT', title: 'Español Latino', flag: 'lat' },
  VOSE: { short: 'VOSE', title: 'Subtitulado (VOSE)', flag: 'vose' },
  EN: { short: 'EN', title: 'English', flag: 'en' },
};

export const LanguageBadge: React.FC<LanguageBadgeProps> = ({
  code,
  active = false,
  onClick,
  size = 'sm',
  showFlag = true,
  className = '',
}) => {
  const normCode = normalizeLangCode(code);
  const info = LANGUAGE_LABELS[normCode];

  const sizeClasses = {
    xs: 'px-1.5 py-0.5 text-[9px] rounded-md min-h-[20px] gap-1',
    sm: 'px-2 py-0.5 text-[10px] rounded-lg min-h-[24px] gap-1.5',
    md: 'px-2.5 py-1 text-xs rounded-xl min-h-[30px] gap-1.5',
  }[size];

  const flagSizeClasses = {
    xs: 'w-3.5 h-2.5',
    sm: 'w-4 h-2.5',
    md: 'w-4.5 h-3',
  }[size];

  const Comp = onClick ? 'button' : 'span';

  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      title={info.title}
      className={`inline-flex items-center justify-center font-bold font-mono tracking-wider transition-all select-none ${sizeClasses} ${
        active
          ? 'bg-[#9146FF] text-white border border-[#9146FF] shadow-[0_2px_10px_rgba(145,70,255,0.4)]'
          : 'bg-white/[0.06] text-zinc-300 border border-white/[0.1] hover:bg-white/[0.12] hover:text-white'
      } ${onClick ? 'cursor-pointer active:scale-95' : ''} ${className}`}
    >
      {showFlag && <FlagBadgeSvg code={info.flag} className={flagSizeClasses} />}
      <span>{info.short}</span>
    </Comp>
  );
};

export interface MediaLanguageOptionItem {
  code: string;
  label?: string;
}

export interface MediaLanguageSelectorProps {
  labelPrefix?: string;
  selectedLang: string;
  availableLangs?: readonly (string | MediaLanguageOptionItem)[];
  onSelectLang: (code: string) => void;
  disabled?: boolean;
  probing?: boolean;
  size?: 'sm' | 'md';
  align?: 'left' | 'right';
  className?: string;
  triggerClassName?: string;
}

/**
 * High-polish accessible "Idioma:" dropdown selector displaying custom SVG flags,
 * clean responsive popover, and checkmark selection indicator.
 */
export const MediaLanguageSelector: React.FC<MediaLanguageSelectorProps> = ({
  labelPrefix = 'Idioma:',
  selectedLang,
  availableLangs,
  onSelectLang,
  disabled = false,
  probing = false,
  size = 'md',
  align = 'left',
  className = '',
  triggerClassName = '',
}) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Normalize candidate options
  const rawList: (string | MediaLanguageOptionItem)[] =
    Array.isArray(availableLangs) && availableLangs.length > 0
      ? [...availableLangs]
      : ['ES', 'LAT', 'VOSE', 'EN'];

  const options: Array<{ code: string; normCode: UnifiedLanguageCode; label: string; flag: FlagCode }> = [];
  const seenCodes = new Set<string>();

  for (const item of rawList) {
    const rawCode = typeof item === 'string' ? item : item?.code;
    if (!rawCode) continue;
    const norm = normalizeLangCode(rawCode);
    const codeKey = String(rawCode).trim().toUpperCase();
    if (seenCodes.has(codeKey)) continue;
    seenCodes.add(codeKey);
    const meta = LANGUAGE_LABELS[norm];
    const customLabel = typeof item === 'object' && item.label ? item.label : meta.title;
    options.push({
      code: codeKey,
      normCode: norm,
      label: customLabel,
      flag: meta.flag,
    });
  }

  // Active option info
  const activeNorm = normalizeLangCode(selectedLang);
  const activeMeta = LANGUAGE_LABELS[activeNorm];
  const activeOption = options.find((o) => o.code === String(selectedLang).trim().toUpperCase()) || {
    code: selectedLang,
    normCode: activeNorm,
    label: activeMeta.title,
    flag: activeMeta.flag,
  };

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const heightClass = size === 'sm' ? 'min-h-[34px] text-xs' : 'min-h-[42px] text-xs sm:text-sm';
  const flagClass = size === 'sm' ? 'w-4 h-2.5' : 'w-5 h-3.5';

  return (
    <div ref={containerRef} className={`relative inline-block text-left ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`group flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 hover:border-[#9146FF]/50 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed select-none active:scale-[0.98] ${heightClass} ${triggerClassName}`}
      >
        <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 group-hover:text-zinc-300">
          {labelPrefix}
        </span>
        <span className="inline-flex items-center gap-1.5 font-bold text-white">
          <FlagBadgeSvg code={activeOption.flag} className={flagClass} />
          <span className="truncate max-w-[140px] sm:max-w-[200px]">{activeOption.label}</span>
        </span>
        {probing ? (
          <RiffanSpinner size={14} className="shrink-0 ml-0.5" />
        ) : (
          <ChevronDown
            className={`w-3.5 h-3.5 text-zinc-400 group-hover:text-white transition-transform duration-200 shrink-0 ${
              open ? 'rotate-180 text-[#BF94FF]' : ''
            }`}
          />
        )}
      </button>

      {open && (
        <div
          role="listbox"
          className={`absolute ${
            align === 'right' ? 'right-0' : 'left-0'
          } mt-2 z-[250] min-w-[220px] sm:min-w-[260px] rounded-2xl bg-[#0F111E]/95 backdrop-blur-2xl border border-white/15 p-1.5 shadow-[0_18px_45px_rgba(0,0,0,0.85)] animate-in fade-in zoom-in-95 duration-150`}
        >
          <div className="px-2.5 py-1.5 text-[10px] font-extrabold uppercase tracking-wider text-zinc-400 border-b border-white/[0.08] mb-1 flex items-center justify-between">
            <span>{labelPrefix} Audio disponible</span>
            {probing && <span className="text-[9px] text-[#BF94FF] normal-case">Comprobando...</span>}
          </div>
          <div className="space-y-0.5 max-h-60 overflow-y-auto no-scrollbar">
            {options.map((opt) => {
              const isSelected = opt.code === activeOption.code;
              return (
                <button
                  key={opt.code}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    onSelectLang(opt.code);
                    setOpen(false);
                  }}
                  className={`w-full min-h-[38px] px-2.5 py-2 rounded-xl flex items-center justify-between gap-2.5 text-left text-xs font-semibold cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-[#9146FF]/25 text-[#E9D5FF] font-bold border border-[#9146FF]/40 shadow-sm'
                      : 'text-zinc-200 hover:bg-white/[0.08] hover:text-white'
                  }`}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <FlagBadgeSvg code={opt.flag} className="w-5 h-3.5 shrink-0" />
                    <span className="truncate">{opt.label}</span>
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[10px] font-mono font-bold text-zinc-400 bg-black/40 px-1.5 py-0.5 rounded-md">
                      {opt.code}
                    </span>
                    {isSelected && <Check className="w-4 h-4 text-[#BF94FF] shrink-0" />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};


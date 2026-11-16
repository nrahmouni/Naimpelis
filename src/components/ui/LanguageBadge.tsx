import React from 'react';

export type UnifiedLanguageCode = 'ES' | 'LAT' | 'VOSE' | 'EN';
export type FlagCode = 'es' | 'en' | 'ca' | 'zh' | 'lat' | 'vose';

export const FlagBadgeSvg: React.FC<{ code: FlagCode; className?: string }> = ({
  code,
  className = 'w-5 h-3.5',
}) => {
  const baseClass = `${className} rounded-[3px] shrink-0 overflow-hidden shadow-[0_1px_4px_rgba(0,0,0,0.45)] ring-1 ring-white/20`;

  if (code === 'es') {
    return (
      <svg viewBox="0 0 24 16" className={baseClass} aria-hidden="true">
        <rect width="24" height="4" y="0" fill="#AA151B" />
        <rect width="24" height="8" y="4" fill="#F1BF00" />
        <rect width="24" height="4" y="12" fill="#AA151B" />
        <rect x="5" y="5.5" width="3" height="5" rx="0.8" fill="#AA151B" opacity="0.85" />
        <rect x="5.7" y="6.2" width="1.6" height="3.6" rx="0.4" fill="#F1BF00" />
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

  if (code === 'en') {
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

  if (code === 'zh') {
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

  if (code === 'lat') {
    return (
      <svg viewBox="0 0 24 16" className={baseClass} aria-hidden="true">
        <defs>
          <linearGradient id="latGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#0284C7" />
            <stop offset="50%" stopColor="#059669" />
            <stop offset="100%" stopColor="#D97706" />
          </linearGradient>
        </defs>
        <rect width="24" height="16" fill="url(#latGrad)" />
        <circle cx="12" cy="8" r="4.5" fill="none" stroke="#FFFFFF" strokeWidth="1.2" opacity="0.9" />
        <ellipse cx="12" cy="8" rx="2.2" ry="4.5" fill="none" stroke="#FFFFFF" strokeWidth="1" opacity="0.8" />
        <line x1="7.5" y1="8" x2="16.5" y2="8" stroke="#FFFFFF" strokeWidth="1" opacity="0.8" />
      </svg>
    );
  }

  // vose
  return (
    <svg viewBox="0 0 24 16" className={baseClass} aria-hidden="true">
      <defs>
        <linearGradient id="voseGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#4C1D95" />
          <stop offset="100%" stopColor="#9146FF" />
        </linearGradient>
      </defs>
      <rect width="24" height="16" fill="url(#voseGrad)" />
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
  if (up === 'LAT' || up.includes('LATINO') || up.includes('LATIN')) return 'LAT';
  if (up === 'VOSE' || up.includes('SUB') || up.includes('ORIGINAL')) return 'VOSE';
  if (up === 'EN' || up.includes('ENG') || up.includes('INGLES') || up.includes('INGLÉS')) return 'EN';
  return 'ES';
}

export const LANGUAGE_LABELS: Record<UnifiedLanguageCode, { short: string; title: string; flag: FlagCode }> = {
  ES: { short: 'ES', title: 'Castellano (España)', flag: 'es' },
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

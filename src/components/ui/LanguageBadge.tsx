import React, { useId, useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, Loader2 } from 'lucide-react';

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
  | 'rif';

export const FlagBadgeSvg: React.FC<{ code: FlagCode; className?: string }> = ({
  code,
  className = 'w-5 h-3.5',
}) => {
  const uid = useId().replace(/:/g, '');
  const baseClass = `${className} rounded-[3px] shrink-0 overflow-hidden shadow-[0_1px_4px_rgba(0,0,0,0.45)] ring-1 ring-white/20`;

  if (code === 'es' || code === 'lat') {
    return (
      <svg viewBox="0 0 900 600" className={baseClass} aria-hidden="true">
        <rect width="900" height="600" fill="#AA151B" />
        <rect y="150" width="900" height="300" fill="#F1BF00" />
        <g transform="translate(250, 160) scale(0.65)">
          <path d="M248,236 H352 V332 A52,56 0 0,1 248,332 Z" fill="#AA151B" stroke="#F1BF00" strokeWidth="10" />
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
          <Loader2 className="w-3.5 h-3.5 animate-spin text-[#BF94FF] shrink-0 ml-0.5" />
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


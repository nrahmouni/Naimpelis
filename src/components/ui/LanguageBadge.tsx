import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { RiffanSpinner } from './RiffanIcons';
import { FlagBadgeSvg, type FlagCode } from './FlagSvgLibrary';

export { FlagBadgeSvg, type FlagCode };
export type UnifiedLanguageCode =
  | 'ES'
  | 'CAT'
  | 'LAT'
  | 'VOSE'
  | 'EN'
  | 'FR'
  | 'PT'
  | 'IT'
  | 'DE'
  | 'AR'
  | 'QUALITY';

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
  if (up === 'QUALITY' || up === 'BEST' || up === '4K') return 'QUALITY';
  if (up === 'CAT' || up === 'CA' || up.includes('CATAL') || up.includes('VALENCI')) return 'CAT';
  if (up === 'LAT' || up.includes('LATINO') || up.includes('LATIN')) return 'LAT';
  if (up === 'VOSE' || up.includes('SUB') || up.includes('ORIGINAL')) return 'VOSE';
  if (up === 'EN' || up.includes('ENG') || up.includes('INGLES') || up.includes('INGLÉS')) return 'EN';
  if (up === 'FR' || up.includes('FRANC') || up.includes('FRENCH')) return 'FR';
  if (up === 'PT' || up === 'BR' || up.includes('PORTUG')) return 'PT';
  if (up === 'IT' || up.includes('ITAL')) return 'IT';
  if (up === 'DE' || up === 'GER' || up.includes('ALEM') || up.includes('GERMAN')) return 'DE';
  if (up === 'AR' || up === 'ARB' || up.includes('ARAB')) return 'AR';
  return 'ES';
}

export const LANGUAGE_LABELS: Record<UnifiedLanguageCode, { short: string; title: string; flag: FlagCode }> = {
  ES: { short: 'ES', title: 'Castellano (España)', flag: 'es' },
  CAT: { short: 'CAT', title: 'Català', flag: 'ca' },
  LAT: { short: 'LAT', title: 'Español Latino', flag: 'lat' },
  VOSE: { short: 'VOSE', title: 'Subtitulado (VOSE)', flag: 'vose' },
  EN: { short: 'EN', title: 'English', flag: 'en' },
  FR: { short: 'FR', title: 'Français', flag: 'fr' },
  PT: { short: 'PT', title: 'Português', flag: 'pt' },
  IT: { short: 'IT', title: 'Italiano', flag: 'it' },
  DE: { short: 'DE', title: 'Deutsch', flag: 'de' },
  AR: { short: 'AR', title: 'العربية (Árabe)', flag: 'ar' },
  QUALITY: { short: '4K/HD', title: 'Mejor calidad (4K / HD)', flag: 'all' },
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


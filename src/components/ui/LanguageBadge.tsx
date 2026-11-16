import React from 'react';

export type UnifiedLanguageCode = 'ES' | 'LAT' | 'VOSE' | 'EN';

interface LanguageBadgeProps {
  code: string;
  active?: boolean;
  onClick?: () => void;
  size?: 'xs' | 'sm' | 'md';
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

export const LANGUAGE_LABELS: Record<UnifiedLanguageCode, { short: string; title: string }> = {
  ES: { short: 'ES', title: 'Castellano (España)' },
  LAT: { short: 'LAT', title: 'Español Latino' },
  VOSE: { short: 'VOSE', title: 'Subtitulado (VOSE)' },
  EN: { short: 'EN', title: 'English' },
};

export const LanguageBadge: React.FC<LanguageBadgeProps> = ({
  code,
  active = false,
  onClick,
  size = 'sm',
  className = '',
}) => {
  const normCode = normalizeLangCode(code);
  const info = LANGUAGE_LABELS[normCode];

  const sizeClasses = {
    xs: 'px-1.5 py-0.5 text-[9px] rounded-md min-h-[20px]',
    sm: 'px-2 py-0.5 text-[10px] rounded-lg min-h-[24px]',
    md: 'px-2.5 py-1 text-xs rounded-xl min-h-[30px]',
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
      {info.short}
    </Comp>
  );
};

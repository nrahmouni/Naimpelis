/**
 * @module src/components/ui/FlagSvgLibrary
 * @description Crisp inline SVG flag badges for VOD languages and World TV / ADRAR / MENA countries.
 */
import React, { useId } from 'react';

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
  | 'de'
  | 'it'
  | 'tr'
  | 'be'
  | 'ru'
  | 'dz'
  | 'eg'
  | 'sa'
  | 'ae'
  | 'in'
  | 'pk'
  | 'pt'
  | 'iq'
  | 'om'
  | 'kw'
  | 'bh'
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
        <g clipPath={`url(#${shieldClipId})`}>
          <rect x="248" y="236" width="52" height="66" fill="#AA151B" />
          <rect x="300" y="236" width="52" height="66" fill="#FFFFFF" />
          <rect x="248" y="302" width="52" height="86" fill="#F1BF00" />
          <rect x="300" y="302" width="52" height="86" fill="#AA151B" />
        </g>
        <ellipse cx="300" cy="302" rx="13" ry="16" fill="#0039A6" stroke="#AA151B" strokeWidth="2.5" />
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
        <circle cx="3" cy="2.5" r="0.7" fill="#FFFFFF" />
        <circle cx="7" cy="2.5" r="0.7" fill="#FFFFFF" />
        <circle cx="5" cy="4.8" r="0.7" fill="#FFFFFF" />
        <circle cx="3" cy="6.8" r="0.7" fill="#FFFFFF" />
        <circle cx="7" cy="6.8" r="0.7" fill="#FFFFFF" />
      </svg>
    );
  }

  if (code === 'nl') {
    return (
      <svg viewBox="0 0 24 16" className={baseClass} aria-hidden="true">
        <rect width="24" height="5.4" y="0" fill="#AE1C28" />
        <rect width="24" height="5.4" y="5.3" fill="#FFFFFF" />
        <rect width="24" height="5.4" y="10.6" fill="#21468B" />
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

  if (code === 'de') {
    return (
      <svg viewBox="0 0 24 16" className={baseClass} aria-hidden="true">
        <rect width="24" height="5.4" y="0" fill="#111111" />
        <rect width="24" height="5.4" y="5.3" fill="#DD0000" />
        <rect width="24" height="5.4" y="10.6" fill="#FFCE00" />
      </svg>
    );
  }

  if (code === 'it') {
    return (
      <svg viewBox="0 0 24 16" className={baseClass} aria-hidden="true">
        <rect width="8" height="16" x="0" fill="#009246" />
        <rect width="8" height="16" x="8" fill="#FFFFFF" />
        <rect width="8" height="16" x="16" fill="#CE2B37" />
      </svg>
    );
  }

  if (code === 'be') {
    return (
      <svg viewBox="0 0 24 16" className={baseClass} aria-hidden="true">
        <rect width="8" height="16" x="0" fill="#111111" />
        <rect width="8" height="16" x="8" fill="#FDDA24" />
        <rect width="8" height="16" x="16" fill="#EF3340" />
      </svg>
    );
  }

  if (code === 'ru') {
    return (
      <svg viewBox="0 0 24 16" className={baseClass} aria-hidden="true">
        <rect width="24" height="5.4" y="0" fill="#FFFFFF" />
        <rect width="24" height="5.4" y="5.3" fill="#0039A6" />
        <rect width="24" height="5.4" y="10.6" fill="#D52B1E" />
      </svg>
    );
  }

  if (code === 'tr') {
    return (
      <svg viewBox="0 0 24 16" className={baseClass} aria-hidden="true">
        <rect width="24" height="16" fill="#E30A17" />
        <circle cx="9.8" cy="8" r="3.8" fill="#FFFFFF" />
        <circle cx="11" cy="8" r="3.0" fill="#E30A17" />
        <polygon points="15.2,6.2 15.8,7.8 17.5,7.8 16.1,8.8 16.6,10.4 15.2,9.4 13.8,10.4 14.3,8.8 12.9,7.8 14.6,7.8" fill="#FFFFFF" />
      </svg>
    );
  }

  if (code === 'dz') {
    return (
      <svg viewBox="0 0 24 16" className={baseClass} aria-hidden="true">
        <rect width="12" height="16" x="0" fill="#006233" />
        <rect width="12" height="16" x="12" fill="#FFFFFF" />
        <circle cx="12" cy="8" r="3.6" fill="#D21034" />
        <circle cx="13" cy="8" r="2.8" fill="#FFFFFF" />
        <polygon points="14,6.7 14.4,7.7 15.4,7.7 14.6,8.3 14.9,9.3 14,8.7 13.1,9.3 13.4,8.3 12.6,7.7 13.6,7.7" fill="#D21034" />
      </svg>
    );
  }

  if (code === 'eg' || code === 'iq') {
    return (
      <svg viewBox="0 0 24 16" className={baseClass} aria-hidden="true">
        <rect width="24" height="5.4" y="0" fill="#CE1126" />
        <rect width="24" height="5.4" y="5.3" fill="#FFFFFF" />
        <rect width="24" height="5.4" y="10.6" fill="#111111" />
        <circle cx="12" cy="8" r="1.4" fill={code === 'iq' ? '#007A3D' : '#C09300'} />
      </svg>
    );
  }

  if (code === 'sa') {
    return (
      <svg viewBox="0 0 24 16" className={baseClass} aria-hidden="true">
        <rect width="24" height="16" fill="#006C35" />
        <rect x="6" y="6" width="12" height="2" rx="1" fill="#FFFFFF" />
        <rect x="7" y="10.2" width="10" height="1.2" rx="0.6" fill="#FFFFFF" />
      </svg>
    );
  }

  if (code === 'ae' || code === 'kw') {
    return (
      <svg viewBox="0 0 24 16" className={baseClass} aria-hidden="true">
        <rect width="24" height="5.4" y="0" fill="#00732F" />
        <rect width="24" height="5.4" y="5.3" fill="#FFFFFF" />
        <rect width="24" height="5.4" y="10.6" fill="#111111" />
        <rect width="6" height="16" x="0" fill={code === 'kw' ? '#111111' : '#FF0000'} />
      </svg>
    );
  }

  if (code === 'om') {
    return (
      <svg viewBox="0 0 24 16" className={baseClass} aria-hidden="true">
        <rect width="24" height="5.4" y="0" fill="#FFFFFF" />
        <rect width="24" height="5.4" y="5.3" fill="#DB161B" />
        <rect width="24" height="5.4" y="10.6" fill="#008000" />
        <rect width="6" height="16" x="0" fill="#DB161B" />
      </svg>
    );
  }

  if (code === 'in') {
    return (
      <svg viewBox="0 0 24 16" className={baseClass} aria-hidden="true">
        <rect width="24" height="5.4" y="0" fill="#FF9933" />
        <rect width="24" height="5.4" y="5.3" fill="#FFFFFF" />
        <rect width="24" height="5.4" y="10.6" fill="#138808" />
        <circle cx="12" cy="8" r="1.8" fill="none" stroke="#000080" strokeWidth="0.9" />
      </svg>
    );
  }

  if (code === 'pk') {
    return (
      <svg viewBox="0 0 24 16" className={baseClass} aria-hidden="true">
        <rect width="6" height="16" x="0" fill="#FFFFFF" />
        <rect width="18" height="16" x="6" fill="#01411C" />
        <circle cx="15" cy="8" r="3.4" fill="#FFFFFF" />
        <circle cx="16.2" cy="7.3" r="2.7" fill="#01411C" />
      </svg>
    );
  }

  if (code === 'pt') {
    return (
      <svg viewBox="0 0 24 16" className={baseClass} aria-hidden="true">
        <rect width="9" height="16" x="0" fill="#006600" />
        <rect width="15" height="16" x="9" fill="#FF0000" />
        <circle cx="9" cy="8" r="2.6" fill="#FFCC00" />
      </svg>
    );
  }

  if (code === 'rif') {
    return (
      <svg viewBox="0 0 900 600" className={baseClass} aria-hidden="true">
        <rect width="900" height="600" fill="#C8102E" />
        <polygon points="450,100 700,300 450,500 200,300" fill="#FFFFFF" />
        <path d="M 479.98 245.46 A 75 75 0 1 0 479.98 354.54 A 62 62 0 1 1 479.98 245.46 Z" fill="#006233" />
      </svg>
    );
  }

  if (code === 'zh' || code === 'cn') {
    return (
      <svg viewBox="0 0 24 16" className={baseClass} aria-hidden="true">
        <rect width="24" height="16" fill="#DE2910" />
        <polygon points="5,2.4 5.7,4.5 7.9,4.5 6.1,5.8 6.8,7.9 5,6.6 3.2,7.9 3.9,5.8 2.1,4.5 4.3,4.5" fill="#FFDE00" />
      </svg>
    );
  }

  if (code === 'ar' || code === 'qa' || code === 'bh') {
    return (
      <svg viewBox="0 0 24 16" className={baseClass} aria-hidden="true">
        <rect width="24" height="16" fill={code === 'bh' ? '#CE1126' : '#8A1538'} />
        <polygon points="0,0 7.2,0 9.4,2 7.2,4 9.4,6 7.2,8 9.4,10 7.2,12 9.4,14 7.2,16 0,16" fill="#FFFFFF" />
      </svg>
    );
  }

  if (code === 'ma') {
    return (
      <svg viewBox="0 0 24 16" className={baseClass} aria-hidden="true">
        <rect width="24" height="16" fill="#C1272D" />
        <polygon points="12,3.4 13.15,6.8 16.75,6.8 13.85,8.9 14.95,12.3 12,10.2 9.05,12.3 10.15,8.9 7.25,6.8 10.85,6.8" fill="none" stroke="#006233" strokeWidth="1.25" strokeLinejoin="round" />
      </svg>
    );
  }

  if (code === 'eu') {
    const stars = Array.from({ length: 12 }).map((_, i) => {
      const angle = (i * 30 * Math.PI) / 180;
      return { cx: 12 + Math.cos(angle) * 4.8, cy: 8 + Math.sin(angle) * 4.8 };
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

  if (code === 'mx' || code === 'lat') {
    return (
      <svg viewBox="0 0 24 16" className={baseClass} aria-hidden="true">
        <rect width="8" height="16" x="0" fill="#006847" />
        <rect width="8" height="16" x="8" fill="#FFFFFF" />
        <rect width="8" height="16" x="16" fill="#CE1126" />
        <circle cx="12" cy="8" r="2.1" fill="#8C5A2B" />
      </svg>
    );
  }

  if (code === 'docs') {
    return (
      <svg viewBox="0 0 24 16" className={baseClass} aria-hidden="true">
        <rect width="24" height="16" fill="#0369A1" />
        <circle cx="12" cy="8" r="4.8" fill="none" stroke="#E0F2FE" strokeWidth="1" />
        <path d="M9.5,5.2 Q11.5,4.2 13,5.8 Q14,7 12.2,8.4 Q10.6,9.5 11.4,11.2" fill="none" stroke="#4ADE80" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  }

  if (code === 'all') {
    return (
      <svg viewBox="0 0 24 16" className={baseClass} aria-hidden="true">
        <rect width="24" height="16" fill="#1E1B4B" />
        <circle cx="12" cy="8" r="4.7" fill="none" stroke="#E9D5FF" strokeWidth="1.15" />
        <ellipse cx="12" cy="8" rx="2.2" ry="4.7" fill="none" stroke="#E9D5FF" strokeWidth="0.95" />
        <line x1="7.3" y1="8" x2="16.7" y2="8" stroke="#E9D5FF" strokeWidth="0.95" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 16" className={baseClass} aria-hidden="true">
      <rect width="24" height="16" fill="#4C1D95" />
      <rect x="4" y="4.5" width="16" height="2.2" rx="1" fill="#FFFFFF" opacity="0.95" />
      <rect x="6.5" y="9.3" width="11" height="2.2" rx="1" fill="#E9D5FF" opacity="0.95" />
    </svg>
  );
};

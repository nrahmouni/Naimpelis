import React from 'react';

export function renderSpainAndSportsArtwork(id: string): React.ReactElement | null {
  // 1. La 1 (RTVE Deep Blue Orb)
  if (id === 'tdt-la1') {
    return (
      <svg viewBox="0 0 64 64" className="w-full h-full">
        <defs>
          <radialGradient id="rtve1-bg" cx="32%" cy="28%" r="75%">
            <stop offset="0%" stopColor="#60A5FA" />
            <stop offset="55%" stopColor="#1D4ED8" />
            <stop offset="100%" stopColor="#0F172A" />
          </radialGradient>
        </defs>
        <rect width="64" height="64" rx="16" fill="url(#rtve1-bg)" />
        <circle cx="32" cy="32" r="24" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="1.5" />
        <text
          x="32"
          y="44"
          textAnchor="middle"
          fill="#FFFFFF"
          fontSize="36"
          fontWeight="900"
          fontFamily="system-ui, sans-serif"
        >
          1
        </text>
      </svg>
    );
  }

  // 2. La 2 (RTVE Cyan Sphere)
  if (id === 'tdt-la2') {
    return (
      <svg viewBox="0 0 64 64" className="w-full h-full">
        <defs>
          <radialGradient id="rtve2-bg" cx="32%" cy="28%" r="75%">
            <stop offset="0%" stopColor="#67E8F9" />
            <stop offset="55%" stopColor="#0284C7" />
            <stop offset="100%" stopColor="#082F49" />
          </radialGradient>
        </defs>
        <rect width="64" height="64" rx="16" fill="url(#rtve2-bg)" />
        <text
          x="32"
          y="44"
          textAnchor="middle"
          fill="#FFFFFF"
          fontSize="35"
          fontWeight="900"
          fontFamily="system-ui, sans-serif"
        >
          2
        </text>
      </svg>
    );
  }

  // 3. Antena 3 (Orange Faceted Triangle Prism)
  if (id === 'tdt-antena3') {
    return (
      <svg viewBox="0 0 64 64" className="w-full h-full">
        <rect width="64" height="64" rx="16" fill="#18120E" />
        <polygon points="32,10 53,48 11,48" fill="#F97316" />
        <polygon points="32,10 53,48 32,37" fill="#EA580C" />
        <polygon points="32,37 53,48 11,48" fill="#FB923C" />
        <text
          x="32"
          y="44"
          textAnchor="middle"
          fill="#FFFFFF"
          fontSize="14"
          fontWeight="900"
          fontFamily="system-ui, sans-serif"
        >
          A3
        </text>
      </svg>
    );
  }

  // 4. Cuatro (Bold Crimson Sphere)
  if (id === 'tdt-cuatro') {
    return (
      <svg viewBox="0 0 64 64" className="w-full h-full">
        <rect width="64" height="64" rx="16" fill="#180D10" />
        <circle cx="32" cy="32" r="21" fill="#EF4444" />
        <text
          x="32"
          y="42"
          textAnchor="middle"
          fill="#FFFFFF"
          fontSize="30"
          fontWeight="900"
          fontFamily="system-ui, sans-serif"
        >
          4
        </text>
      </svg>
    );
  }

  // 5. Telecinco (Mediaset Blue Circle)
  if (id === 'tdt-telecinco') {
    return (
      <svg viewBox="0 0 64 64" className="w-full h-full">
        <rect width="64" height="64" rx="16" fill="#0B1829" />
        <circle cx="32" cy="32" r="21" fill="#0284C7" stroke="#38BDF8" strokeWidth="1.5" />
        <text
          x="32"
          y="42"
          textAnchor="middle"
          fill="#FFFFFF"
          fontSize="30"
          fontWeight="900"
          fontFamily="system-ui, sans-serif"
        >
          5
        </text>
      </svg>
    );
  }

  // 6. laSexta (Green Hexagon)
  if (id === 'tdt-lasexta') {
    return (
      <svg viewBox="0 0 64 64" className="w-full h-full">
        <rect width="64" height="64" rx="16" fill="#0A1A10" />
        <polygon points="32,9 52,20 52,44 32,55 12,44 12,20" fill="#16A34A" />
        <text
          x="32"
          y="41"
          textAnchor="middle"
          fill="#FFFFFF"
          fontSize="26"
          fontWeight="900"
          fontFamily="system-ui, sans-serif"
        >
          6
        </text>
      </svg>
    );
  }

  // 7. Movistar Plus+ family (Cyan M wave + channel tag)
  if (id.startsWith('mplus-') && !id.includes('eurosport')) {
    const tagMap: Record<string, string> = {
      'mplus-canal': '+',
      'mplus-vamos': 'VAMOS',
      'mplus-laliga': 'LIGA',
      'mplus-hypermotion': 'LIGA2',
      'mplus-champions': 'UCL',
      'mplus-deportes': 'DEP',
      'mplus-deportes2': 'DEP2',
      'mplus-golf': 'GOLF',
    };
    const subTag = tagMap[id] || '+';
    return (
      <svg viewBox="0 0 64 64" className="w-full h-full">
        <defs>
          <linearGradient id={`mp-${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#00A9E0" />
            <stop offset="100%" stopColor="#0B2447" />
          </linearGradient>
        </defs>
        <rect width="64" height="64" rx="16" fill={`url(#mp-${id})`} />
        <path
          d="M14 40 C16 22, 24 20, 32 32 C40 20, 48 22, 50 40"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="6"
          strokeLinecap="round"
        />
        <rect x="10" y="45" width="44" height="13" rx="6" fill="rgba(5,12,26,0.85)" />
        <text
          x="32"
          y="54.5"
          textAnchor="middle"
          fill="#7DD3FC"
          fontSize="9.5"
          fontWeight="900"
          fontFamily="system-ui, sans-serif"
        >
          {subTag}
        </text>
      </svg>
    );
  }

  // 8. DAZN family (Iconic Square Frame)
  if (id.startsWith('dazn-') || id.startsWith('uk-dazn-')) {
    const sub = id.replace('dazn-', '').replace('uk-dazn-', '').toUpperCase();
    const label = sub === 'LALIGA' ? 'LL' : sub === 'DARTS' ? 'DARTS' : sub === 'COMBAT' ? 'CMB' : sub;
    const barColor = sub === 'F1' ? '#EF4444' : sub === 'LALIGA' ? '#F59E0B' : '#9146FF';
    return (
      <svg viewBox="0 0 64 64" className="w-full h-full">
        <rect width="64" height="64" rx="16" fill="#0B0C10" />
        <path
          d="M16 13 H48 L52 17 V47 L48 51 H16 L12 47 V17 Z"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="2.6"
        />
        <text
          x="32"
          y="31"
          textAnchor="middle"
          fill="#FFFFFF"
          fontSize="13.5"
          fontWeight="900"
          letterSpacing="1.5"
          fontFamily="system-ui, sans-serif"
        >
          DAZN
        </text>
        <rect x="18" y="36" width="28" height="11" rx="3" fill={barColor} />
        <text
          x="32"
          y="44.5"
          textAnchor="middle"
          fill="#FFFFFF"
          fontSize="8.5"
          fontWeight="900"
          fontFamily="system-ui, sans-serif"
        >
          {label}
        </text>
      </svg>
    );
  }

  // 9. ESPN 1-7 & Premium
  if (id.startsWith('espn-')) {
    const suffix = id === 'espn-premium' ? 'PREM' : id.replace('espn-', '');
    return (
      <svg viewBox="0 0 64 64" className="w-full h-full">
        <rect width="64" height="64" rx="16" fill="#B91C1C" />
        <rect x="0" y="18" width="64" height="4" fill="rgba(255,255,255,0.22)" />
        <text
          x="32"
          y="37"
          textAnchor="middle"
          fill="#FFFFFF"
          fontSize="16"
          fontWeight="900"
          fontStyle="italic"
          fontFamily="system-ui, sans-serif"
        >
          ESPN
        </text>
        {suffix !== '1' && (
          <>
            <rect x="18" y="43" width="28" height="13" rx="5" fill="#180808" />
            <text
              x="32"
              y="52.5"
              textAnchor="middle"
              fill="#FDE68A"
              fontSize="9"
              fontWeight="900"
              fontFamily="system-ui, sans-serif"
            >
              {suffix}
            </text>
          </>
        )}
      </svg>
    );
  }

  // 10. DSports (DirecTV Sports)
  if (id.startsWith('dsports-')) {
    const tag = id === 'dsports-1' ? 'LIVE' : id.replace('dsports-', '').toUpperCase().slice(0, 5);
    return (
      <svg viewBox="0 0 64 64" className="w-full h-full">
        <rect width="64" height="64" rx="16" fill="#07192E" />
        <path
          d="M12 36 A22 18 0 0 1 52 24"
          fill="none"
          stroke="#38BDF8"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <text
          x="32"
          y="36"
          textAnchor="middle"
          fill="#FFFFFF"
          fontSize="18"
          fontWeight="900"
          fontFamily="system-ui, sans-serif"
        >
          DS
        </text>
        <rect x="13" y="43" width="38" height="12" rx="5" fill="#0284C7" />
        <text
          x="32"
          y="52"
          textAnchor="middle"
          fill="#FFFFFF"
          fontSize="8.5"
          fontWeight="900"
          fontFamily="system-ui, sans-serif"
        >
          {tag}
        </text>
      </svg>
    );
  }

  // 11. beIN SPORTS
  if (id.startsWith('bein-')) {
    const tag =
      id === 'bein-es-n' ? 'Ñ' : id === 'bein-xtra-hd' ? 'XTRA' : id === 'bein-usa' ? 'USA' : id.replace('bein-', '');
    return (
      <svg viewBox="0 0 64 64" className="w-full h-full">
        <rect width="64" height="64" rx="16" fill="#4C1D95" />
        <rect x="7" y="13" width="50" height="24" rx="6" fill="#7C3AED" />
        <text
          x="32"
          y="30"
          textAnchor="middle"
          fill="#FFFFFF"
          fontSize="14.5"
          fontWeight="900"
          fontFamily="system-ui, sans-serif"
        >
          beIN
        </text>
        <text
          x="32"
          y="52"
          textAnchor="middle"
          fill="#E9D5FF"
          fontSize="11"
          fontWeight="900"
          fontFamily="system-ui, sans-serif"
        >
          {tag}
        </text>
      </svg>
    );
  }

  // 12. Eurosport 1 & 2
  if (id.includes('eurosport')) {
    const num = id.endsWith('2') ? '2' : '1';
    return (
      <svg viewBox="0 0 64 64" className="w-full h-full">
        <rect width="64" height="64" rx="16" fill="#0F172A" />
        <circle cx="32" cy="32" r="22" fill="none" stroke="#3B82F6" strokeWidth="2.5" strokeDasharray="5 3" />
        <text
          x="27"
          y="40"
          textAnchor="middle"
          fill="#FFFFFF"
          fontSize="24"
          fontWeight="900"
          fontFamily="system-ui, sans-serif"
        >
          E
        </text>
        <circle cx="44" cy="24" r="9" fill={num === '1' ? '#2563EB' : '#E11D48'} />
        <text
          x="44"
          y="28"
          textAnchor="middle"
          fill="#FFFFFF"
          fontSize="11"
          fontWeight="900"
          fontFamily="system-ui, sans-serif"
        >
          {num}
        </text>
      </svg>
    );
  }

  // 13. Sky Sports UK
  if (id.startsWith('uk-sky-')) {
    const tag =
      id === 'uk-sky-premier'
        ? 'PL'
        : id === 'uk-sky-f1'
        ? 'F1'
        : id === 'uk-sky-action'
        ? 'ACT'
        : id === 'uk-sky-racing'
        ? 'RAC'
        : id.endsWith('2')
        ? '2'
        : '1';
    return (
      <svg viewBox="0 0 64 64" className="w-full h-full">
        <rect width="64" height="64" rx="16" fill="#0F172A" />
        <rect x="6" y="10" width="52" height="22" rx="6" fill="#E2E8F0" />
        <text
          x="32"
          y="26"
          textAnchor="middle"
          fill="#0F172A"
          fontSize="14.5"
          fontWeight="900"
          fontFamily="system-ui, sans-serif"
        >
          sky
        </text>
        <rect x="6" y="34" width="52" height="20" rx="6" fill="#DC2626" />
        <text
          x="32"
          y="47.5"
          textAnchor="middle"
          fill="#FFFFFF"
          fontSize="10.5"
          fontWeight="900"
          fontFamily="system-ui, sans-serif"
        >
          {tag}
        </text>
      </svg>
    );
  }

  // 14. Catalan 3Cat / TV3 / SX3 / Esport3 / 324 (Quad-Bar Geometric Emblem)
  if (id.includes('3cat') || id.startsWith('cat-')) {
    const sub = id.includes('sx3') ? 'SX3' : id.includes('esport3') ? 'E3' : id.includes('324') ? '324' : 'TV3';
    return (
      <svg viewBox="0 0 64 64" className="w-full h-full">
        <rect width="64" height="64" rx="16" fill="#180A10" />
        <g stroke="#E11D48" strokeWidth="4.2" strokeLinecap="round">
          <line x1="16" y1="14" x2="16" y2="34" />
          <line x1="25" y1="14" x2="25" y2="34" />
          <line x1="34" y1="14" x2="34" y2="34" />
          <line x1="43" y1="14" x2="43" y2="34" />
        </g>
        <rect x="8" y="40" width="48" height="16" rx="6" fill="#E11D48" />
        <text
          x="32"
          y="51.5"
          textAnchor="middle"
          fill="#FFFFFF"
          fontSize="11.5"
          fontWeight="900"
          fontFamily="system-ui, sans-serif"
        >
          {sub}
        </text>
      </svg>
    );
  }

  // 15. Canal Sur (Andalusian 8-Point Star)
  if (id === 'tdt-canalsur') {
    return (
      <svg viewBox="0 0 64 64" className="w-full h-full">
        <rect width="64" height="64" rx="16" fill="#0B2214" />
        <rect x="16" y="16" width="32" height="32" fill="none" stroke="#16A34A" strokeWidth="3.5" />
        <rect
          x="16"
          y="16"
          width="32"
          height="32"
          fill="none"
          stroke="#22C55E"
          strokeWidth="3.5"
          transform="rotate(45 32 32)"
        />
        <text
          x="32"
          y="36"
          textAnchor="middle"
          fill="#FFFFFF"
          fontSize="12"
          fontWeight="900"
          fontFamily="system-ui, sans-serif"
        >
          CS
        </text>
      </svg>
    );
  }

  // 16. Paramount Network (Mountain Silhouettes + Stars)
  if (id === 'tdt-paramount') {
    return (
      <svg viewBox="0 0 64 64" className="w-full h-full">
        <rect width="64" height="64" rx="16" fill="#0B1B3B" />
        <path d="M12 24 A22 22 0 0 1 52 24" fill="none" stroke="#93C5FD" strokeWidth="2" strokeDasharray="3 4" />
        <polygon points="10,50 32,19 54,50" fill="#2563EB" />
        <polygon points="22,50 40,26 56,50" fill="#60A5FA" opacity="0.65" />
      </svg>
    );
  }

  // 17. 24 Horas (Broadcast Globe + 24h)
  if (id === 'tdt-24h') {
    return (
      <svg viewBox="0 0 64 64" className="w-full h-full">
        <rect width="64" height="64" rx="16" fill="#7F1D1D" />
        <circle cx="32" cy="32" r="21" fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="1.5" />
        <ellipse cx="32" cy="32" rx="10" ry="21" fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="1.5" />
        <text
          x="32"
          y="39"
          textAnchor="middle"
          fill="#FFFFFF"
          fontSize="20"
          fontWeight="900"
          fontFamily="system-ui, sans-serif"
        >
          24h
        </text>
      </svg>
    );
  }

  // 18. Teledeporte (RTVE Orange Chevron + tdp)
  if (id === 'tdt-teledeporte') {
    return (
      <svg viewBox="0 0 64 64" className="w-full h-full">
        <rect width="64" height="64" rx="16" fill="#EA580C" />
        <path d="M12 16 H52 L44 26 H12 Z" fill="rgba(255,255,255,0.22)" />
        <text
          x="32"
          y="44"
          textAnchor="middle"
          fill="#FFFFFF"
          fontSize="20"
          fontWeight="900"
          fontFamily="system-ui, sans-serif"
        >
          tdp
        </text>
      </svg>
    );
  }

  // 19. Real Madrid TV
  if (id === 'tdt-rmtv') {
    return (
      <svg viewBox="0 0 64 64" className="w-full h-full">
        <rect width="64" height="64" rx="16" fill="#1E1B4B" />
        <circle cx="32" cy="34" r="19" fill="none" stroke="#FACC15" strokeWidth="2.5" />
        <polygon points="22,17 27,11 32,16 37,11 42,17" fill="#FACC15" />
        <text
          x="32"
          y="39"
          textAnchor="middle"
          fill="#FFFFFF"
          fontSize="13.5"
          fontWeight="900"
          fontFamily="system-ui, sans-serif"
        >
          RMTV
        </text>
      </svg>
    );
  }

  // 20. TNT / TNT Sports / Space
  if (id.startsWith('tnt-') || id === 'space-vivo') {
    if (id === 'space-vivo') {
      return (
        <svg viewBox="0 0 64 64" className="w-full h-full">
          <rect width="64" height="64" rx="16" fill="#181204" />
          <ellipse
            cx="32"
            cy="32"
            rx="24"
            ry="10"
            fill="none"
            stroke="#FACC15"
            strokeWidth="2.4"
            transform="rotate(-18 32 32)"
          />
          <text
            x="32"
            y="37"
            textAnchor="middle"
            fill="#FFFFFF"
            fontSize="12"
            fontWeight="900"
            fontFamily="system-ui, sans-serif"
          >
            SPACE
          </text>
        </svg>
      );
    }
    return (
      <svg viewBox="0 0 64 64" className="w-full h-full">
        <rect width="64" height="64" rx="16" fill="#1F0B19" />
        <circle cx="32" cy="32" r="21" fill="none" stroke="#EC4899" strokeWidth="3" />
        <text
          x="32"
          y="37"
          textAnchor="middle"
          fill="#FFFFFF"
          fontSize="15"
          fontWeight="900"
          fontFamily="system-ui, sans-serif"
        >
          {id === 'tnt-sports' ? 'TNT SP' : 'TNT'}
        </text>
      </svg>
    );
  }

  return null;
}

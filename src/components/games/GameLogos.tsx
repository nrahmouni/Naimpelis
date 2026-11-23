import React from 'react';

export type UnifiedGameId =
  | 'parchis'
  | 'uno'
  | 'pinturillo'
  | 'pool'
  | 'chapas'
  | 'headsoccer'
  | 'penalty'
  | 'racing3d'
  | 'pingpong'
  | 'gyrohockey'
  | 'gyrospace'
  | 'bomberman'
  | 'pacman'
  | 'tetris'
  | 'hextris'
  | 'game2048'
  | 'flappy'
  | 'hexgl'
  | 'arkanoid'
  | 'invaders'
  | 'tvtrivia'
  | 'poker'
  | 'blackjack'
  | 'chess'
  | 'checkers'
  | 'connect4';

interface GameLogoArtworkProps {
  gameId: UnifiedGameId;
  className?: string;
}

export const GameLogoArtwork: React.FC<GameLogoArtworkProps> = ({
  gameId,
  className = 'w-full h-full',
}) => {
  switch (gameId) {
    case 'headsoccer':
      return (
        <svg viewBox="0 0 240 140" className={className} aria-hidden="true">
          <defs>
            <linearGradient id="hs-sky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#09152B" />
              <stop offset="68%" stopColor="#12274A" />
              <stop offset="100%" stopColor="#0D3B28" />
            </linearGradient>
            <radialGradient id="hs-glow" cx="50%" cy="40%" r="55%">
              <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#38BDF8" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="hs-p1" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#C084FC" />
              <stop offset="100%" stopColor="#7C3AED" />
            </linearGradient>
            <linearGradient id="hs-p2" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#FB7185" />
              <stop offset="100%" stopColor="#E11D48" />
            </linearGradient>
          </defs>
          <rect width="240" height="140" fill="url(#hs-sky)" />
          <rect width="240" height="140" fill="url(#hs-glow)" />
          {/* Stadium floodlight beams */}
          <polygon points="36,0 90,108 12,108" fill="#BAE6FD" opacity="0.06" />
          <polygon points="204,0 228,108 150,108" fill="#BAE6FD" opacity="0.06" />
          {/* Turf pitch */}
          <rect x="0" y="102" width="240" height="38" fill="#14532D" />
          <rect x="0" y="102" width="240" height="3" fill="#4ADE80" opacity="0.55" />
          <line x1="120" y1="105" x2="120" y2="140" stroke="rgba(255,255,255,0.28)" strokeWidth="1.5" />
          {/* Left Goal */}
          <path d="M4 66 H20 V104" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="2.5" strokeLinejoin="round" />
          {/* Right Goal */}
          <path d="M236 66 H220 V104" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="2.5" strokeLinejoin="round" />
          {/* Player 1 Hero Silhouette */}
          <g transform="translate(64, 72)">
            <ellipse cx="0" cy="34" rx="14" ry="4" fill="rgba(0,0,0,0.4)" />
            <rect x="-9" y="12" width="18" height="16" rx="5" fill="#9146FF" />
            <circle cx="0" cy="-2" r="18" fill="url(#hs-p1)" stroke="#0B0B0F" strokeWidth="2.5" />
            <path d="M-16 -7 Q0 -14 16 -7 L17 -1 Q0 -6 -17 -1 Z" fill="#FFFFFF" opacity="0.9" />
            <circle cx="6" cy="-1" r="2.2" fill="#0B0B0F" />
          </g>
          {/* Player 2 Rival Silhouette */}
          <g transform="translate(176, 72)">
            <ellipse cx="0" cy="34" rx="14" ry="4" fill="rgba(0,0,0,0.4)" />
            <rect x="-9" y="12" width="18" height="16" rx="5" fill="#E11D48" />
            <circle cx="0" cy="-2" r="18" fill="url(#hs-p2)" stroke="#0B0B0F" strokeWidth="2.5" />
            <path d="M-16 -7 Q0 -14 16 -7 L17 -1 Q0 -6 -17 -1 Z" fill="#FDE047" opacity="0.9" />
            <circle cx="-6" cy="-1" r="2.2" fill="#0B0B0F" />
          </g>
          {/* Geodesic Match Ball */}
          <g transform="translate(120, 62)">
            <circle cx="0" cy="0" r="15" fill="#F8FAFC" stroke="#0B0B0F" strokeWidth="2.4" />
            <polygon points="0,-6 6,-1.8 3.8,5.2 -3.8,5.2 -6,-1.8" fill="#18181B" />
            <path d="M0,-6 V-14.5 M6,-1.8 L14,-5 M3.8,5.2 L9,12 M-3.8,5.2 L-9,12 M-6,-1.8 L-14,-5" stroke="#18181B" strokeWidth="1.6" />
          </g>
        </svg>
      );

    case 'penalty':
      return (
        <svg viewBox="0 0 240 140" className={className} aria-hidden="true">
          <defs>
            <linearGradient id="pn-sky2" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#040814" />
              <stop offset="100%" stopColor="#132347" />
            </linearGradient>
          </defs>
          <rect width="240" height="140" fill="url(#pn-sky2)" />
          <polygon points="34,0 92,98 8,98" fill="#BAE6FD" opacity="0.09" />
          <polygon points="206,0 232,98 148,98" fill="#BAE6FD" opacity="0.09" />
          <circle cx="34" cy="14" r="7" fill="#FEF08A" opacity="0.65" />
          <circle cx="206" cy="14" r="7" fill="#FEF08A" opacity="0.65" />
          <rect x="0" y="92" width="240" height="48" fill="#14532D" />
          <rect x="0" y="106" width="240" height="16" fill="rgba(255,255,255,0.05)" />
          <path d="M36 96 V26 H204 V96" fill="rgba(255,255,255,0.08)" stroke="#F8FAFC" strokeWidth="4.5" strokeLinejoin="round" />
          <circle cx="170" cy="46" r="14" fill="none" stroke="#22D3EE" strokeWidth="2.5" strokeDasharray="4 3" />
          <path d="M72 120 Q128 58 170 46" fill="none" stroke="#FACC15" strokeWidth="2.8" strokeDasharray="5 4" />
          <circle cx="70" cy="118" r="12" fill="#FFFFFF" stroke="#0F172A" strokeWidth="2.2" />
          <polygon points="70,113 74.5,116.5 73,122 67,122 65.5,116.5" fill="#18181B" />
          <circle cx="118" cy="66" r="10" fill="#FED7AA" />
          <rect x="104" y="76" width="28" height="22" rx="6" fill="#DC2626" stroke="#FACC15" strokeWidth="1.5" />
          <circle cx="94" cy="78" r="6" fill="#FFFFFF" stroke="#06B6D4" strokeWidth="1.8" />
          <circle cx="142" cy="78" r="6" fill="#FFFFFF" stroke="#06B6D4" strokeWidth="1.8" />
        </svg>
      );

    case 'racing3d':
      return (
        <svg viewBox="0 0 240 140" className={className} aria-hidden="true">
          <defs>
            <linearGradient id="rc-sky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#070A18" />
              <stop offset="100%" stopColor="#1B1040" />
            </linearGradient>
          </defs>
          <rect width="240" height="140" fill="url(#rc-sky)" />
          <polygon points="18,140 88,46 152,46 222,140" fill="#182034" stroke="#38BDF8" strokeWidth="1.5" />
          <line x1="120" y1="48" x2="120" y2="140" stroke="#F8FAFC" strokeWidth="2" strokeDasharray="7 7" />
          {/* Left Blue Car (P1) */}
          <path d="M52 104 L68 78 L112 78 L126 104 Z" fill="#0284C7" stroke="#22D3EE" strokeWidth="2" />
          <rect x="48" y="100" width="80" height="14" rx="5" fill="#0F172A" stroke="#38BDF8" strokeWidth="1.5" />
          <circle cx="62" cy="114" r="7" fill="#38BDF8" />
          <circle cx="114" cy="114" r="7" fill="#38BDF8" />
          {/* Right Red Car (P2) */}
          <path d="M128 84 L142 62 L184 62 L196 84 Z" fill="#E11D48" stroke="#FDA4AF" strokeWidth="2" />
          <rect x="124" y="82" width="76" height="12" rx="4" fill="#1E1B4B" stroke="#FB7185" strokeWidth="1.4" />
          <circle cx="138" cy="94" r="6" fill="#FB7185" />
          <circle cx="186" cy="94" r="6" fill="#FB7185" />
        </svg>
      );

    case 'pingpong':
      return (
        <svg viewBox="0 0 240 140" className={className} aria-hidden="true">
          <defs>
            <linearGradient id="pp-tbl" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#064E3B" />
              <stop offset="100%" stopColor="#047857" />
            </linearGradient>
          </defs>
          <rect width="240" height="140" fill="#07101E" />
          <polygon points="36,24 204,24 226,122 14,122" fill="url(#pp-tbl)" stroke="#FFFFFF" strokeWidth="3" />
          <line x1="120" y1="24" x2="120" y2="122" stroke="rgba(255,255,255,0.45)" strokeWidth="2" />
          <rect x="22" y="68" width="196" height="6" fill="#F8FAFC" />
          <ellipse cx="70" cy="98" rx="22" ry="16" fill="#0284C7" stroke="#E0F2FE" strokeWidth="2.5" />
          <rect x="65" y="112" width="10" height="18" rx="3" fill="#B45309" />
          <ellipse cx="172" cy="46" rx="18" ry="13" fill="#E11D48" stroke="#FFE4E6" strokeWidth="2.5" />
          <rect x="168" y="20" width="8" height="14" rx="3" fill="#B45309" />
          <path d="M74 96 Q120 52 170 48" fill="none" stroke="#FDE047" strokeWidth="2.4" strokeDasharray="4 4" />
          <circle cx="124" cy="60" r="8.5" fill="#FACC15" stroke="#FFFFFF" strokeWidth="1.5" />
        </svg>
      );

    case 'gyrohockey':
      return (
        <svg viewBox="0 0 240 140" className={className} aria-hidden="true">
          <defs>
            <linearGradient id="gh-bg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#082442" />
              <stop offset="100%" stopColor="#140928" />
            </linearGradient>
          </defs>
          <rect width="240" height="140" fill="url(#gh-bg)" />
          <rect x="16" y="14" width="208" height="112" rx="14" fill="#071226" stroke="#22D3EE" strokeWidth="2.5" />
          <line x1="120" y1="14" x2="120" y2="126" stroke="#7C3AED" strokeWidth="2" strokeDasharray="5 4" />
          <circle cx="120" cy="70" r="24" fill="none" stroke="rgba(56,189,248,0.45)" strokeWidth="2" />
          <circle cx="62" cy="70" r="20" fill="#0284C7" stroke="#22D3EE" strokeWidth="3.5" />
          <circle cx="62" cy="70" r="7" fill="#0F172A" stroke="#FFFFFF" strokeWidth="1.8" />
          <circle cx="178" cy="70" r="20" fill="#E11D48" stroke="#FDA4AF" strokeWidth="3.5" />
          <circle cx="178" cy="70" r="7" fill="#0F172A" stroke="#FFFFFF" strokeWidth="1.8" />
          <circle cx="120" cy="70" r="10.5" fill="#FDE047" stroke="#FFFFFF" strokeWidth="2" />
        </svg>
      );

    case 'gyrospace':
      return (
        <svg viewBox="0 0 240 140" className={className} aria-hidden="true">
          <defs>
            <radialGradient id="gs-bg" cx="50%" cy="50%" r="68%">
              <stop offset="0%" stopColor="#26134D" />
              <stop offset="100%" stopColor="#040611" />
            </radialGradient>
          </defs>
          <rect width="240" height="140" fill="url(#gs-bg)" />
          <circle cx="32" cy="24" r="2" fill="#BAE6FD" />
          <circle cx="198" cy="20" r="2.5" fill="#FDE047" />
          <circle cx="212" cy="108" r="2" fill="#E9D5FF" />
          <circle cx="40" cy="96" r="16" fill="#334155" stroke="#38BDF8" strokeWidth="2.5" />
          <polygon points="198,38 216,60 180,60" fill="#E11D48" stroke="#FACC15" strokeWidth="2" />
          <rect x="86" y="14" width="4" height="20" rx="2" fill="#22D3EE" />
          <rect x="150" y="18" width="4" height="20" rx="2" fill="#FB923C" />
          <polygon points="88,28 122,96 98,84 88,100 78,84 54,96" fill="#2563EB" stroke="#22D3EE" strokeWidth="2.4" />
          <polygon points="154,38 184,96 164,86 154,100 144,86 124,96" fill="#EA580C" stroke="#FDBA74" strokeWidth="2.2" />
        </svg>
      );

    case 'pool':
      return (
        <svg viewBox="0 0 240 140" className={className} aria-hidden="true">
          <defs>
            <linearGradient id="pl-felt" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#0E513F" />
              <stop offset="100%" stopColor="#06291F" />
            </linearGradient>
            <radialGradient id="pl-b8" cx="35%" cy="30%" r="70%">
              <stop offset="0%" stopColor="#3F3F46" />
              <stop offset="45%" stopColor="#18181B" />
              <stop offset="100%" stopColor="#050507" />
            </radialGradient>
            <radialGradient id="pl-cueb" cx="35%" cy="30%" r="70%">
              <stop offset="0%" stopColor="#FFFFFF" />
              <stop offset="75%" stopColor="#E4E4E7" />
              <stop offset="100%" stopColor="#A1A1AA" />
            </radialGradient>
            <radialGradient id="pl-b9" cx="35%" cy="30%" r="70%">
              <stop offset="0%" stopColor="#FDE047" />
              <stop offset="70%" stopColor="#F59E0B" />
              <stop offset="100%" stopColor="#B45309" />
            </radialGradient>
          </defs>
          <rect width="240" height="140" fill="#120E0B" />
          {/* Mahogany rail frame */}
          <rect x="10" y="10" width="220" height="120" rx="14" fill="#4A2511" stroke="#854D27" strokeWidth="2.5" />
          <rect x="20" y="20" width="200" height="100" rx="8" fill="url(#pl-felt)" stroke="#052E23" strokeWidth="2" />
          {/* Pockets */}
          <circle cx="22" cy="22" r="7.5" fill="#050507" stroke="#A16207" strokeWidth="1.5" />
          <circle cx="120" cy="20" r="6.5" fill="#050507" stroke="#A16207" strokeWidth="1.5" />
          <circle cx="218" cy="22" r="7.5" fill="#050507" stroke="#A16207" strokeWidth="1.5" />
          <circle cx="22" cy="118" r="7.5" fill="#050507" stroke="#A16207" strokeWidth="1.5" />
          <circle cx="120" cy="120" r="6.5" fill="#050507" stroke="#A16207" strokeWidth="1.5" />
          <circle cx="218" cy="118" r="7.5" fill="#050507" stroke="#A16207" strokeWidth="1.5" />
          {/* Aim dotted guide */}
          <line x1="74" y1="86" x2="122" y2="68" stroke="rgba(255,255,255,0.35)" strokeWidth="1.4" strokeDasharray="3 3" />
          {/* Cue Stick */}
          <g transform="rotate(-21 74 86)">
            <rect x="-20" y="83" width="76" height="5.5" rx="2.5" fill="#FDE68A" />
            <rect x="-20" y="83" width="32" height="5.5" rx="2" fill="#27272A" />
            <rect x="52" y="83" width="6" height="5.5" rx="1" fill="#38BDF8" />
          </g>
          {/* Cue Ball */}
          <circle cx="76" cy="86" r="13" fill="url(#pl-cueb)" />
          {/* 9-Ball Striped */}
          <circle cx="170" cy="60" r="14.5" fill="#F8FAFC" />
          <path d="M156 54 H184 V66 H156 Z" fill="url(#pl-b9)" />
          <circle cx="170" cy="60" r="6" fill="#FFFFFF" />
          <text x="170" y="63.5" textAnchor="middle" fontSize="9.5" fontWeight="900" fill="#18181B">9</text>
          {/* Center Hero 8-Ball */}
          <circle cx="126" cy="67" r="20" fill="url(#pl-b8)" stroke="rgba(255,255,255,0.16)" strokeWidth="1.2" />
          <circle cx="126" cy="67" r="8.8" fill="#FAFAFA" />
          <text x="126" y="71.5" textAnchor="middle" fontSize="13.5" fontWeight="900" fill="#09090B">8</text>
          <ellipse cx="118" cy="56" rx="5" ry="2.5" transform="rotate(-30 118 56)" fill="rgba(255,255,255,0.28)" />
        </svg>
      );

    case 'poker':
      return (
        <svg viewBox="0 0 240 140" className={className} aria-hidden="true">
          <defs>
            <radialGradient id="pk-bg" cx="50%" cy="45%" r="65%">
              <stop offset="0%" stopColor="#3B1A69" />
              <stop offset="100%" stopColor="#0D0818" />
            </radialGradient>
            <linearGradient id="pk-gold" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#FDE047" />
              <stop offset="100%" stopColor="#D97706" />
            </linearGradient>
          </defs>
          <rect width="240" height="140" fill="url(#pk-bg)" />
          <ellipse cx="120" cy="86" rx="102" ry="42" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1.5" />
          {/* Left Card A Spade */}
          <g transform="translate(86, 68) rotate(-13)">
            <rect x="-24" y="-35" width="48" height="70" rx="7" fill="#FFFFFF" stroke="#E4E4E7" strokeWidth="1.5" />
            <text x="-17" y="-19" fontSize="12" fontWeight="900" fill="#18181B">A</text>
            <path d="M0,-10 C-10,2 -14,9 -8,14 C-4,17 -1,14 0,11 C1,14 4,17 8,14 C14,9 10,2 0,-10 Z" fill="#18181B" />
            <path d="M-3,12 L3,12 L5,19 L-5,19 Z" fill="#18181B" />
          </g>
          {/* Right Card K Heart */}
          <g transform="translate(142, 66) rotate(11)">
            <rect x="-24" y="-35" width="48" height="70" rx="7" fill="#FFFFFF" stroke="#FDE047" strokeWidth="1.8" />
            <text x="-17" y="-19" fontSize="12" fontWeight="900" fill="#E11D48">K</text>
            <path d="M0,16 C-12,7 -15,-2 -9,-8 C-4,-12 0,-8 0,-4 C0,-8 4,-12 9,-8 C15,-2 12,7 0,16 Z" fill="#E11D48" />
          </g>
          {/* Poker Chip */}
          <g transform="translate(174, 98)">
            <circle cx="0" cy="0" r="18" fill="url(#pk-gold)" stroke="#18181B" strokeWidth="2" />
            <circle cx="0" cy="0" r="14" fill="none" stroke="#18181B" strokeWidth="2.5" strokeDasharray="5 4" />
            <circle cx="0" cy="0" r="8.5" fill="#18181B" />
            <text x="0" y="3.5" textAnchor="middle" fontSize="10" fontWeight="900" fill="#FDE047">$</text>
          </g>
        </svg>
      );

    case 'blackjack':
      return (
        <svg viewBox="0 0 240 140" className={className} aria-hidden="true">
          <defs>
            <radialGradient id="bj-bg" cx="50%" cy="45%" r="65%">
              <stop offset="0%" stopColor="#0D4B37" />
              <stop offset="100%" stopColor="#051B14" />
            </radialGradient>
          </defs>
          <rect width="240" height="140" fill="url(#bj-bg)" />
          <path d="M30 120 A110 75 0 0 1 210 120" fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth="1.8" strokeDasharray="4 4" />
          {/* Card 1: A Spade */}
          <g transform="translate(92, 66) rotate(-8)">
            <rect x="-24" y="-34" width="48" height="68" rx="7" fill="#FFFFFF" stroke="#D4D4D8" strokeWidth="1.5" />
            <text x="-17" y="-18" fontSize="12" fontWeight="900" fill="#09090B">A</text>
            <path d="M0,-9 C-9,2 -12,9 -7,13 C-3,16 -1,13 0,10 C1,13 3,16 7,13 C12,9 9,2 0,-9 Z" fill="#09090B" />
            <path d="M-2.5,11 L2.5,11 L4,18 L-4,18 Z" fill="#09090B" />
          </g>
          {/* Card 2: J Diamond */}
          <g transform="translate(142, 68) rotate(10)">
            <rect x="-24" y="-34" width="48" height="68" rx="7" fill="#FFFFFF" stroke="#34D399" strokeWidth="2" />
            <text x="-17" y="-18" fontSize="12" fontWeight="900" fill="#DC2626">J</text>
            <polygon points="0,-10 11,3 0,16 -11,3" fill="#DC2626" />
          </g>
          {/* Emblematic 21 Medallion */}
          <g transform="translate(62, 98)">
            <circle cx="0" cy="0" r="18" fill="#10B981" stroke="#052E16" strokeWidth="2.5" />
            <text x="0" y="5.5" textAnchor="middle" fontSize="15" fontWeight="900" fill="#052E16">21</text>
          </g>
        </svg>
      );

    case 'chapas':
      return (
        <svg viewBox="0 0 240 140" className={className} aria-hidden="true">
          <defs>
            <linearGradient id="ch-turf" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#1B561B" />
              <stop offset="100%" stopColor="#0E2E11" />
            </linearGradient>
          </defs>
          <rect width="240" height="140" fill="#09150B" />
          <rect x="14" y="14" width="212" height="112" rx="12" fill="url(#ch-turf)" stroke="rgba(255,255,255,0.3)" strokeWidth="2" />
          <line x1="120" y1="14" x2="120" y2="126" stroke="rgba(255,255,255,0.28)" strokeWidth="1.6" />
          <circle cx="120" cy="70" r="24" fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="1.6" />
          {/* Left Blue Bottle Cap */}
          <g transform="translate(74, 70)">
            <circle cx="0" cy="0" r="20" fill="#E2E8F0" stroke="#0F172A" strokeWidth="2" strokeDasharray="3.2 2" />
            <circle cx="0" cy="0" r="15" fill="#0284C7" stroke="#BAE6FD" strokeWidth="1.5" />
            <text x="0" y="4.5" textAnchor="middle" fontSize="12" fontWeight="900" fill="#FFFFFF">7</text>
          </g>
          {/* Trajectory line */}
          <path d="M96 70 Q120 42 150 64" fill="none" stroke="#A3E635" strokeWidth="2" strokeDasharray="4 4" />
          {/* Right Purple Bottle Cap */}
          <g transform="translate(166, 70)">
            <circle cx="0" cy="0" r="20" fill="#E2E8F0" stroke="#0F172A" strokeWidth="2" strokeDasharray="3.2 2" />
            <circle cx="0" cy="0" r="15" fill="#9146FF" stroke="#DDD6FE" strokeWidth="1.5" />
            <text x="0" y="4.5" textAnchor="middle" fontSize="11" fontWeight="900" fill="#FFFFFF">10</text>
          </g>
          {/* Center Ball */}
          <circle cx="120" cy="70" r="8.5" fill="#FFFFFF" stroke="#18181B" strokeWidth="1.8" />
          <polygon points="120,66 123.5,68.8 122,73 118,73 116.5,68.8" fill="#18181B" />
        </svg>
      );

    case 'uno':
      return (
        <svg viewBox="0 0 240 140" className={className} aria-hidden="true">
          <defs>
            <radialGradient id="un-bg" cx="50%" cy="45%" r="65%">
              <stop offset="0%" stopColor="#431223" />
              <stop offset="100%" stopColor="#120911" />
            </radialGradient>
          </defs>
          <rect width="240" height="140" fill="url(#un-bg)" />
          {/* Red Card */}
          <g transform="translate(76, 72) rotate(-14)">
            <rect x="-24" y="-34" width="48" height="68" rx="8" fill="#E11D48" stroke="#FFFFFF" strokeWidth="2.5" />
            <ellipse cx="0" cy="0" rx="18" ry="25" transform="rotate(22)" fill="rgba(255,255,255,0.16)" />
            <text x="0" y="7" textAnchor="middle" fontSize="22" fontWeight="900" fill="#FFFFFF">7</text>
          </g>
          {/* Blue Card */}
          <g transform="translate(164, 72) rotate(14)">
            <rect x="-24" y="-34" width="48" height="68" rx="8" fill="#2563EB" stroke="#FFFFFF" strokeWidth="2.5" />
            <ellipse cx="0" cy="0" rx="18" ry="25" transform="rotate(22)" fill="rgba(255,255,255,0.16)" />
            <path d="M-8 -4 H8 L4 -9 M8 4 H-8 L-4 9" fill="none" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </g>
          {/* Center Wild +4 Card */}
          <g transform="translate(120, 66)">
            <rect x="-26" y="-37" width="52" height="74" rx="9" fill="#18181B" stroke="#FFFFFF" strokeWidth="2.8" />
            <ellipse cx="0" cy="0" rx="19" ry="28" transform="rotate(20)" fill="#27272A" />
            <rect x="-12" y="-16" width="11" height="15" rx="2.5" fill="#E11D48" stroke="#FFFFFF" strokeWidth="1" />
            <rect x="-2" y="-12" width="11" height="15" rx="2.5" fill="#2563EB" stroke="#FFFFFF" strokeWidth="1" />
            <rect x="-10" y="-2" width="11" height="15" rx="2.5" fill="#FACC15" stroke="#FFFFFF" strokeWidth="1" />
            <rect x="0" y="2" width="11" height="15" rx="2.5" fill="#16A34A" stroke="#FFFFFF" strokeWidth="1" />
          </g>
        </svg>
      );

    case 'parchis':
      return (
        <svg viewBox="0 0 240 140" className={className} aria-hidden="true">
          <defs>
            <radialGradient id="pa-bg" cx="50%" cy="45%" r="65%">
              <stop offset="0%" stopColor="#261A47" />
              <stop offset="100%" stopColor="#0E0B1A" />
            </radialGradient>
          </defs>
          <rect width="240" height="140" fill="url(#pa-bg)" />
          {/* Board frame */}
          <g transform="translate(46, 16)">
            <rect x="0" y="0" width="108" height="108" rx="12" fill="#F8FAFC" stroke="#18181B" strokeWidth="3" />
            {/* 4 Colored Home Yards */}
            <rect x="4" y="4" width="38" height="38" rx="6" fill="#EF4444" />
            <rect x="66" y="4" width="38" height="38" rx="6" fill="#3B82F6" />
            <rect x="4" y="66" width="38" height="38" rx="6" fill="#FACC15" />
            <rect x="66" y="66" width="38" height="38" rx="6" fill="#22C55E" />
            {/* Center Crown Triangles */}
            <polygon points="42,42 66,42 54,54" fill="#3B82F6" />
            <polygon points="66,42 66,66 54,54" fill="#22C55E" />
            <polygon points="42,66 66,66 54,54" fill="#FACC15" />
            <polygon points="42,42 42,66 54,54" fill="#EF4444" />
            {/* Tokens inside yards */}
            <circle cx="15" cy="15" r="5" fill="#FFFFFF" stroke="#7F1D1D" strokeWidth="2" />
            <circle cx="30" cy="30" r="5" fill="#FFFFFF" stroke="#7F1D1D" strokeWidth="2" />
            <circle cx="78" cy="15" r="5" fill="#FFFFFF" stroke="#1E3A8A" strokeWidth="2" />
            <circle cx="78" cy="78" r="5" fill="#FFFFFF" stroke="#14532D" strokeWidth="2" />
            <circle cx="30" cy="78" r="5" fill="#FFFFFF" stroke="#854D0E" strokeWidth="2" />
          </g>
          {/* Crisp Floating Die */}
          <g transform="translate(182, 74) rotate(12)">
            <rect x="-20" y="-20" width="40" height="40" rx="9" fill="#9146FF" stroke="#E9D5FF" strokeWidth="2" />
            <circle cx="-9" cy="-9" r="3" fill="#FFFFFF" />
            <circle cx="9" cy="-9" r="3" fill="#FFFFFF" />
            <circle cx="0" cy="0" r="3" fill="#FFFFFF" />
            <circle cx="-9" cy="9" r="3" fill="#FFFFFF" />
            <circle cx="9" cy="9" r="3" fill="#FFFFFF" />
          </g>
        </svg>
      );

    case 'pinturillo':
      return (
        <svg viewBox="0 0 240 140" className={className} aria-hidden="true">
          <defs>
            <linearGradient id="pn-bg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#122840" />
              <stop offset="100%" stopColor="#09111B" />
            </linearGradient>
            <linearGradient id="pn-ribbon" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#F43F5E" />
              <stop offset="50%" stopColor="#9146FF" />
              <stop offset="100%" stopColor="#38BDF8" />
            </linearGradient>
          </defs>
          <rect width="240" height="140" fill="url(#pn-bg)" />
          {/* Sketchbook pad */}
          <rect x="28" y="20" width="184" height="100" rx="14" fill="#F8FAFC" />
          <rect x="28" y="20" width="184" height="16" rx="10" fill="#E2E8F0" />
          <circle cx="52" cy="28" r="3" fill="#94A3B8" />
          <circle cx="80" cy="28" r="3" fill="#94A3B8" />
          <circle cx="108" cy="28" r="3" fill="#94A3B8" />
          <circle cx="136" cy="28" r="3" fill="#94A3B8" />
          <circle cx="164" cy="28" r="3" fill="#94A3B8" />
          {/* Expressive ribbon curve */}
          <path d="M52 92 C 80 46, 118 106, 148 64 C 160 48, 174 52, 186 68" fill="none" stroke="url(#pn-ribbon)" strokeWidth="10" strokeLinecap="round" />
          {/* Floating Paint Brush */}
          <g transform="translate(184, 72) rotate(36)">
            <rect x="-4" y="-36" width="8" height="42" rx="4" fill="#9146FF" />
            <rect x="-4.5" y="4" width="9" height="8" rx="1.5" fill="#CBD5E1" />
            <path d="M-4.5 12 Q0 28 4.5 12 Z" fill="#38BDF8" />
          </g>
        </svg>
      );

    case 'chess':
      return (
        <svg viewBox="0 0 240 140" className={className} aria-hidden="true">
          <defs>
            <linearGradient id="cs-bg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#261F1A" />
              <stop offset="100%" stopColor="#0E0D12" />
            </linearGradient>
            <linearGradient id="cs-ivory" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FFFDF7" />
              <stop offset="100%" stopColor="#D6C7B2" />
            </linearGradient>
          </defs>
          <rect width="240" height="140" fill="url(#cs-bg)" />
          {/* Architectural Chessboard Floor */}
          <g transform="translate(48, 86)">
            <rect x="0" y="0" width="36" height="18" fill="#E7D8C1" />
            <rect x="36" y="0" width="36" height="18" fill="#6F523B" />
            <rect x="72" y="0" width="36" height="18" fill="#E7D8C1" />
            <rect x="108" y="0" width="36" height="18" fill="#6F523B" />
            <rect x="0" y="18" width="36" height="18" fill="#6F523B" />
            <rect x="36" y="18" width="36" height="18" fill="#E7D8C1" />
            <rect x="72" y="18" width="36" height="18" fill="#6F523B" />
            <rect x="108" y="18" width="36" height="18" fill="#E7D8C1" />
          </g>
          {/* White King */}
          <g transform="translate(96, 58)">
            <path d="M0 -34 V-24 M-5 -29 H5" stroke="#FDE047" strokeWidth="3" strokeLinecap="round" />
            <path d="M-12 -14 C-12 -22 12 -22 12 -14 L10 18 H-10 Z" fill="url(#cs-ivory)" stroke="#1E1813" strokeWidth="2" />
            <rect x="-15" y="18" width="30" height="7" rx="3" fill="url(#cs-ivory)" stroke="#1E1813" strokeWidth="2" />
          </g>
          {/* Obsidian Knight Silhouette */}
          <g transform="translate(148, 62)">
            <path d="M-12 20 C-12 4 -8 -16 8 -22 L14 -14 L4 -8 C10 -2 12 8 10 20 Z" fill="#18181B" stroke="#9146FF" strokeWidth="2" />
            <rect x="-14" y="20" width="28" height="6" rx="2.5" fill="#18181B" stroke="#9146FF" strokeWidth="1.8" />
          </g>
        </svg>
      );

    case 'checkers':
      return (
        <svg viewBox="0 0 240 140" className={className} aria-hidden="true">
          <defs>
            <linearGradient id="ck-bg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#2A121D" />
              <stop offset="100%" stopColor="#0E0B10" />
            </linearGradient>
            <radialGradient id="ck-red" cx="35%" cy="30%" r="70%">
              <stop offset="0%" stopColor="#FB7185" />
              <stop offset="65%" stopColor="#E11D48" />
              <stop offset="100%" stopColor="#881337" />
            </radialGradient>
            <radialGradient id="ck-pearl" cx="35%" cy="30%" r="70%">
              <stop offset="0%" stopColor="#FFFFFF" />
              <stop offset="70%" stopColor="#E5D5BA" />
              <stop offset="100%" stopColor="#9C8B70" />
            </radialGradient>
          </defs>
          <rect width="240" height="140" fill="url(#ck-bg)" />
          <g opacity="0.32" transform="translate(48, 22)">
            <rect x="0" y="0" width="48" height="48" fill="#52525B" />
            <rect x="96" y="0" width="48" height="48" fill="#52525B" />
            <rect x="48" y="48" width="48" height="48" fill="#52525B" />
          </g>
          {/* Pearl checker */}
          <g transform="translate(152, 74)">
            <ellipse cx="0" cy="6" rx="26" ry="20" fill="#78716C" />
            <ellipse cx="0" cy="0" rx="26" ry="20" fill="url(#ck-pearl)" stroke="#FFFDF7" strokeWidth="1.5" />
            <ellipse cx="0" cy="0" rx="17" ry="12" fill="none" stroke="rgba(120,113,108,0.45)" strokeWidth="2" />
          </g>
          {/* Crowned Crimson King Checker */}
          <g transform="translate(88, 66)">
            <ellipse cx="0" cy="8" rx="28" ry="21" fill="#4C0519" />
            <ellipse cx="0" cy="0" rx="28" ry="21" fill="url(#ck-red)" stroke="#FECDD3" strokeWidth="1.6" />
            <ellipse cx="0" cy="0" rx="19" ry="13.5" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="2" />
            <path d="M-10 5 L-8 -5 L-2 0 L0 -8 L2 0 L8 -5 L10 5 Z" fill="#FDE047" />
          </g>
        </svg>
      );

    case 'bomberman':
      return (
        <svg viewBox="0 0 240 140" className={className} aria-hidden="true">
          <rect width="240" height="140" fill="#0B1914" />
          <rect x="26" y="16" width="188" height="108" rx="12" fill="#14532D" stroke="#22C55E" strokeWidth="2.5" />
          <rect x="46" y="34" width="28" height="28" rx="4" fill="#B45309" stroke="#78350F" strokeWidth="2" />
          <rect x="166" y="34" width="28" height="28" rx="4" fill="#B45309" stroke="#78350F" strokeWidth="2" />
          <rect x="46" y="78" width="28" height="28" rx="4" fill="#334155" />
          <rect x="166" y="78" width="28" height="28" rx="4" fill="#334155" />
          <path d="M104 30 V110 M82 70 H158" stroke="#F97316" strokeWidth="16" strokeLinecap="round" opacity="0.7" />
          <path d="M120 34 V106 M88 70 H152" stroke="#FEF08A" strokeWidth="7" strokeLinecap="round" />
          <circle cx="120" cy="70" r="18" fill="#0F172A" stroke="#FACC15" strokeWidth="2.5" />
          <circle cx="132" cy="52" r="5" fill="#FACC15" />
        </svg>
      );

    case 'pacman':
      return (
        <svg viewBox="0 0 240 140" className={className} aria-hidden="true">
          <rect width="240" height="140" fill="#050814" />
          <rect x="18" y="20" width="204" height="100" rx="10" fill="none" stroke="#2563EB" strokeWidth="3.5" />
          <line x1="18" y1="42" x2="108" y2="42" stroke="#2563EB" strokeWidth="3" />
          <line x1="18" y1="98" x2="108" y2="98" stroke="#2563EB" strokeWidth="3" />
          <circle cx="110" cy="70" r="4" fill="#FDE68A" />
          <circle cx="132" cy="70" r="4" fill="#FDE68A" />
          <circle cx="154" cy="70" r="7" fill="#FACC15" />
          <path d="M72 70 L94 56 A26 26 0 1 0 94 84 Z" fill="#FACC15" />
          <g transform="translate(184, 70)">
            <path d="M-16 14 V-4 A16 16 0 0 1 16 -4 V14 L10 8 L4 14 L-4 8 L-10 14 Z" fill="#EF4444" />
            <circle cx="-5" cy="-4" r="3.5" fill="#FFFFFF" />
            <circle cx="5" cy="-4" r="3.5" fill="#FFFFFF" />
            <circle cx="-4" cy="-4" r="1.7" fill="#0F172A" />
            <circle cx="6" cy="-4" r="1.7" fill="#0F172A" />
          </g>
        </svg>
      );

    case 'tetris':
      return (
        <svg viewBox="0 0 240 140" className={className} aria-hidden="true">
          <rect width="240" height="140" fill="#080C1A" />
          <rect x="64" y="12" width="112" height="116" rx="8" fill="#0F172A" stroke="#7C3AED" strokeWidth="2.5" />
          <rect x="92" y="34" width="18" height="18" rx="3" fill="#A855F7" />
          <rect x="74" y="52" width="18" height="18" rx="3" fill="#A855F7" />
          <rect x="92" y="52" width="18" height="18" rx="3" fill="#A855F7" />
          <rect x="110" y="52" width="18" height="18" rx="3" fill="#A855F7" />
          <rect x="132" y="32" width="18" height="18" rx="3" fill="#22D3EE" />
          <rect x="132" y="50" width="18" height="18" rx="3" fill="#22D3EE" />
          <rect x="132" y="68" width="18" height="18" rx="3" fill="#22D3EE" />
          <rect x="74" y="102" width="18" height="18" rx="3" fill="#FACC15" />
          <rect x="92" y="102" width="18" height="18" rx="3" fill="#FACC15" />
          <rect x="110" y="102" width="18" height="18" rx="3" fill="#22C55E" />
          <rect x="128" y="102" width="18" height="18" rx="3" fill="#F43F5E" />
          <rect x="146" y="102" width="18" height="18" rx="3" fill="#F97316" />
        </svg>
      );

    case 'hextris':
      return (
        <svg viewBox="0 0 240 140" className={className} aria-hidden="true">
          <rect width="240" height="140" fill="#070A16" />
          <polygon points="120,26 158,48 158,92 120,114 82,92 82,48" fill="none" stroke="#F43F5E" strokeWidth="6" />
          <polygon points="120,38 148,54 148,86 120,102 92,86 92,54" fill="none" stroke="#38BDF8" strokeWidth="6" />
          <polygon points="120,50 138,60 138,80 120,90 102,80 102,60" fill="#141B33" stroke="#A78BFA" strokeWidth="3" />
          <rect x="184" y="58" width="22" height="12" rx="3" fill="#22C55E" />
          <rect x="34" y="72" width="22" height="12" rx="3" fill="#FACC15" />
        </svg>
      );

    case 'game2048':
      return (
        <svg viewBox="0 0 240 140" className={className} aria-hidden="true">
          <rect width="240" height="140" fill="#0B1120" />
          <rect x="52" y="16" width="136" height="108" rx="14" fill="#162036" stroke="#334155" strokeWidth="2" />
          <rect x="64" y="28" width="52" height="38" rx="8" fill="#F59563" />
          <text x="90" y="54" textAnchor="middle" fontSize="18" fontWeight="900" fill="#FFFFFF">64</text>
          <rect x="124" y="28" width="52" height="38" rx="8" fill="#EDCF72" />
          <text x="150" y="54" textAnchor="middle" fontSize="17" fontWeight="900" fill="#FFFFFF">512</text>
          <rect x="64" y="74" width="52" height="38" rx="8" fill="#8B5CF6" />
          <text x="90" y="100" textAnchor="middle" fontSize="15" fontWeight="900" fill="#FFFFFF">1024</text>
          <rect x="124" y="74" width="52" height="38" rx="8" fill="#22C55E" />
          <text x="150" y="100" textAnchor="middle" fontSize="16" fontWeight="900" fill="#FFFFFF">2048</text>
        </svg>
      );

    case 'flappy':
      return (
        <svg viewBox="0 0 240 140" className={className} aria-hidden="true">
          <rect width="240" height="140" fill="#0C4A6E" />
          <rect x="0" y="114" width="240" height="26" fill="#15803D" />
          <rect x="148" y="0" width="28" height="46" fill="#22C55E" stroke="#14532D" strokeWidth="2" />
          <rect x="144" y="38" width="36" height="10" rx="2" fill="#22C55E" stroke="#14532D" strokeWidth="2" />
          <rect x="148" y="88" width="28" height="28" fill="#22C55E" stroke="#14532D" strokeWidth="2" />
          <rect x="144" y="84" width="36" height="10" rx="2" fill="#22C55E" stroke="#14532D" strokeWidth="2" />
          <ellipse cx="86" cy="68" rx="18" ry="14" fill="#FACC15" stroke="#0F172A" strokeWidth="2.5" />
          <circle cx="94" cy="63" r="5" fill="#FFFFFF" />
          <circle cx="96" cy="63" r="2.2" fill="#0F172A" />
          <polygon points="101,67 114,71 101,76" fill="#F97316" />
        </svg>
      );

    case 'hexgl':
      return (
        <svg viewBox="0 0 240 140" className={className} aria-hidden="true">
          <rect width="240" height="140" fill="#060A18" />
          <polygon points="14,140 94,48 146,48 226,140" fill="#111834" stroke="#22D3EE" strokeWidth="2" />
          <line x1="120" y1="48" x2="120" y2="140" stroke="#7C3AED" strokeWidth="2" strokeDasharray="6 6" />
          <rect x="92" y="78" width="56" height="8" rx="3" fill="#22D3EE" />
          <polygon points="120,86 150,118 128,112 120,122 112,112 90,118" fill="#22D3EE" stroke="#FFFFFF" strokeWidth="2" />
        </svg>
      );

    case 'arkanoid':
      return (
        <svg viewBox="0 0 240 140" className={className} aria-hidden="true">
          <rect width="240" height="140" fill="#070B16" />
          <rect x="28" y="20" width="42" height="14" rx="4" fill="#F43F5E" />
          <rect x="76" y="20" width="42" height="14" rx="4" fill="#F97316" />
          <rect x="124" y="20" width="42" height="14" rx="4" fill="#FACC15" />
          <rect x="172" y="20" width="42" height="14" rx="4" fill="#22C55E" />
          <rect x="28" y="40" width="42" height="14" rx="4" fill="#38BDF8" />
          <rect x="76" y="40" width="42" height="14" rx="4" fill="#A855F7" />
          <rect x="172" y="40" width="42" height="14" rx="4" fill="#38BDF8" />
          <circle cx="136" cy="76" r="8" fill="#FFFFFF" />
          <rect x="84" y="114" width="72" height="11" rx="5.5" fill="#38BDF8" stroke="#FFFFFF" strokeWidth="1.5" />
        </svg>
      );

    case 'invaders':
      return (
        <svg viewBox="0 0 240 140" className={className} aria-hidden="true">
          <rect width="240" height="140" fill="#040710" />
          <g fill="#22C55E">
            <rect x="52" y="26" width="24" height="14" rx="3" />
            <rect x="108" y="26" width="24" height="14" rx="3" />
            <rect x="164" y="26" width="24" height="14" rx="3" />
          </g>
          <g fill="#38BDF8">
            <rect x="78" y="50" width="24" height="14" rx="3" />
            <rect x="138" y="50" width="24" height="14" rx="3" />
          </g>
          <rect x="118" y="74" width="4" height="16" fill="#FDE047" />
          <polygon points="120,98 138,118 102,118" fill="#22D3EE" />
        </svg>
      );

    case 'tvtrivia':
      return (
        <svg viewBox="0 0 240 140" className={className} aria-hidden="true">
          <rect width="240" height="140" fill="#1E1038" />
          <circle cx="120" cy="48" r="24" fill="#7C3AED" stroke="#FACC15" strokeWidth="2.5" />
          <text x="120" y="57" textAnchor="middle" fontSize="26" fontWeight="900" fill="#FFFFFF">?</text>
          <rect x="34" y="84" width="80" height="20" rx="6" fill="#0F172A" stroke="#38BDF8" strokeWidth="1.8" />
          <rect x="126" y="84" width="80" height="20" rx="6" fill="#14532D" stroke="#22C55E" strokeWidth="2" />
          <rect x="34" y="110" width="80" height="18" rx="6" fill="#0F172A" stroke="#A855F7" strokeWidth="1.5" />
          <rect x="126" y="110" width="80" height="18" rx="6" fill="#0F172A" stroke="#F43F5E" strokeWidth="1.5" />
        </svg>
      );

    case 'connect4':
      return (
        <svg viewBox="0 0 240 140" className={className} aria-hidden="true">
          <defs>
            <linearGradient id="c4-bg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#0F1C3F" />
              <stop offset="100%" stopColor="#080B16" />
            </linearGradient>
            <linearGradient id="c4-board" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2563EB" />
              <stop offset="100%" stopColor="#1D4ED8" />
            </linearGradient>
          </defs>
          <rect width="240" height="140" fill="url(#c4-bg)" />
          <rect x="44" y="20" width="152" height="100" rx="14" fill="url(#c4-board)" stroke="#60A5FA" strokeWidth="2" />
          {/* 5x3 architectural slot discs showing diagonal 4-win highlight */}
          {[
            [0, 0, 'empty'], [1, 0, 'empty'], [2, 0, 'red'], [3, 0, 'purple'], [4, 0, 'empty'],
            [0, 1, 'red'], [1, 1, 'purple'], [2, 1, 'purple'], [3, 1, 'red'], [4, 1, 'empty'],
            [0, 2, 'purple'], [1, 2, 'red'], [2, 2, 'red'], [3, 2, 'purple'], [4, 2, 'red'],
          ].map(([col, row, kind], idx) => {
            const cx = 64 + Number(col) * 28;
            const cy = 42 + Number(row) * 28;
            const fill =
              kind === 'purple' ? '#9146FF' : kind === 'red' ? '#F43F5E' : '#090D1C';
            const stroke =
              kind === 'purple' ? '#E9D5FF' : kind === 'red' ? '#FECDD3' : 'rgba(255,255,255,0.12)';
            return (
              <circle
                key={idx}
                cx={cx}
                cy={cy}
                r="10.5"
                fill={fill}
                stroke={stroke}
                strokeWidth={kind === 'empty' ? 1 : 1.8}
              />
            );
          })}
        </svg>
      );
  }
};

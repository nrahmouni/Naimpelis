import React, { useId, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import type { AppLanguage } from '../../types';
import { pickLang } from '../../utils/i18n';

export type WorldPortalKind = 'cine' | 'futbol' | 'tv' | 'juegos' | 'sala';

export interface PortalOriginRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface WorldPortalTransitionProps {
  portal: WorldPortalKind | null;
  originRect?: PortalOriginRect | null;
  lang: AppLanguage;
}

const EASE_STUDIO: [number, number, number, number] = [0.16, 1, 0.3, 1];
const EASE_EXIT: [number, number, number, number] = [0.22, 1, 0.36, 1];

interface WorldSpec {
  accent: string;
  secondary: string;
  glowRgb: string;
  ambient: string;
  title: Record<AppLanguage, string>;
  subtitle: Record<AppLanguage, string>;
}

export const WORLD_SPECS: Record<WorldPortalKind, WorldSpec> = {
  cine: {
    accent: '#9146FF',
    secondary: '#4CC9F0',
    glowRgb: '145,70,255',
    ambient:
      'radial-gradient(ellipse 68% 54% at 50% 47%, rgba(145,70,255,0.22) 0%, rgba(76,201,240,0.08) 42%, rgba(6,7,12,0) 74%)',
    title: {
      es: 'Cine y Series',
      ca: 'Cinema i Sèries',
      en: 'Movies & Series',
      rif: 'Sini d Tezrarin',
      zh: '电影与剧集',
    },
    subtitle: {
      es: 'Catálogo 4K · Estrenos y sagas',
      ca: 'Catàleg 4K · Estrenes i sagues',
      en: '4K Catalog · Premieres & series',
      rif: '4K · Imsarayen d isura',
      zh: '4K 高清片库与热播剧集',
    },
  },
  sala: {
    accent: '#8B5CF6',
    secondary: '#10B981',
    glowRgb: '139,92,246',
    ambient:
      'radial-gradient(ellipse 68% 54% at 50% 47%, rgba(139,92,246,0.22) 0%, rgba(16,185,129,0.09) 42%, rgba(6,7,12,0) 74%)',
    title: {
      es: 'Sala con Amigos',
      ca: 'Sala amb Amics',
      en: 'Watch Party',
      rif: 'Tazqa n Yemdukkal',
      zh: '好友观影房',
    },
    subtitle: {
      es: 'Voz espacial · Sincronización en vivo',
      ca: 'Veu espacial · Sincronització en directe',
      en: 'Spatial voice · Real-time sync',
      rif: 'Awal srid · Asuddes',
      zh: '语音连麦 · 毫秒同步观影',
    },
  },
  juegos: {
    accent: '#A855F7',
    secondary: '#34D399',
    glowRgb: '168,85,247',
    ambient:
      'radial-gradient(ellipse 68% 54% at 50% 47%, rgba(168,85,247,0.22) 0%, rgba(52,211,153,0.09) 42%, rgba(6,7,12,0) 74%)',
    title: {
      es: 'Juegos',
      ca: 'Jocs',
      en: 'Games',
      rif: 'Uraren',
      zh: '游戏厅',
    },
    subtitle: {
      es: 'Multijugador de sala · Arcade y mesa',
      ca: 'Multijugador de sala · Arcade i taula',
      en: 'Room multiplayer · Arcade & tabletop',
      rif: 'Urar aked yemdukkal',
      zh: '实时房间联机小游戏',
    },
  },
  futbol: {
    accent: '#10B981',
    secondary: '#38BDF8',
    glowRgb: '16,185,129',
    ambient:
      'radial-gradient(ellipse 68% 54% at 50% 47%, rgba(16,185,129,0.21) 0%, rgba(56,189,248,0.08) 42%, rgba(6,7,12,0) 74%)',
    title: {
      es: 'Fútbol',
      ca: 'Futbol',
      en: 'Football',
      rif: 'Takurt',
      zh: '足球赛事',
    },
    subtitle: {
      es: 'Partidos en directo · Señales HD',
      ca: 'Partits en directe · Senyals HD',
      en: 'Live fixtures · HD match feeds',
      rif: 'Timdyazin srid · HD',
      zh: '顶级赛事高清直播',
    },
  },
  tv: {
    accent: '#38BDF8',
    secondary: '#8B5CF6',
    glowRgb: '56,189,248',
    ambient:
      'radial-gradient(ellipse 68% 54% at 50% 47%, rgba(56,189,248,0.22) 0%, rgba(139,92,246,0.09) 42%, rgba(6,7,12,0) 74%)',
    title: {
      es: 'TV en Directo',
      ca: 'TV en Directe',
      en: 'Live TV',
      rif: 'Tilivizyun Srid',
      zh: '直播电视',
    },
    subtitle: {
      es: 'TDT, deportes y canales 24/7',
      ca: 'TDT, esports i canals 24/7',
      en: 'DTT, sports & 24/7 channels',
      rif: 'Tilivizyun 24/7',
      zh: '实时频道与全天候播出',
    },
  },
};

export const WorldEmblemTile: React.FC<{
  kind: WorldPortalKind;
  animate?: 'always' | 'hover' | 'none';
  className?: string;
}> = ({ kind, animate = 'always', className = 'w-20 h-20 sm:w-24 sm:h-24' }) => {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const spec = WORLD_SPECS[kind];

  const ids = {
    chassis: `rtv-we-ch-${uid}`,
    well: `rtv-we-wl-${uid}`,
    rim: `rtv-we-rm-${uid}`,
    glow: `rtv-we-gl-${uid}`,
    accent: `rtv-we-ac-${uid}`,
    accentSoft: `rtv-we-as-${uid}`,
    platinum: `rtv-we-pl-${uid}`,
    shadow: `rtv-we-sh-${uid}`,
    sheen: `rtv-we-sn-${uid}`,
    clip: `rtv-we-cp-${uid}`,
    drop: `rtv-we-dp-${uid}`,
  };

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 120 120"
      fill="none"
      data-anim={animate}
      role="img"
      aria-label={spec.title.es}
      className={`rtv-we shrink-0 select-none ${className}`}
      style={{
        filter: `drop-shadow(0 14px 28px rgba(0,0,0,0.68)) drop-shadow(0 0 22px rgba(${spec.glowRgb},0.22))`,
      }}
    >
      <defs>
        {/* Sculpted obsidian chassis */}
        <linearGradient id={ids.chassis} x1="14" y1="8" x2="106" y2="112" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#232B42" />
          <stop offset="38%" stopColor="#121726" />
          <stop offset="100%" stopColor="#06080F" />
        </linearGradient>

        {/* Inner recessed OLED stage */}
        <radialGradient id={ids.well} cx="50%" cy="34%" r="68%">
          <stop offset="0%" stopColor="#171D30" />
          <stop offset="68%" stopColor="#0B0E18" />
          <stop offset="100%" stopColor="#05060B" />
        </radialGradient>

        {/* Chamfered glass perimeter rim */}
        <linearGradient id={ids.rim} x1="12" y1="6" x2="108" y2="114" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.42" />
          <stop offset="34%" stopColor={spec.accent} stopOpacity="0.68" />
          <stop offset="72%" stopColor={spec.secondary} stopOpacity="0.42" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.08" />
        </linearGradient>

        {/* Backlit emitter core */}
        <radialGradient id={ids.glow} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={spec.accent} stopOpacity="0.42" />
          <stop offset="48%" stopColor={spec.secondary} stopOpacity="0.14" />
          <stop offset="100%" stopColor={spec.accent} stopOpacity="0" />
        </radialGradient>

        {/* Saturated brand gradient */}
        <linearGradient id={ids.accent} x1="24" y1="24" x2="96" y2="96" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={spec.accent} />
          <stop offset="55%" stopColor={spec.accent} />
          <stop offset="100%" stopColor={spec.secondary} />
        </linearGradient>

        <linearGradient id={ids.accentSoft} x1="24" y1="24" x2="96" y2="96" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={spec.accent} stopOpacity="0.34" />
          <stop offset="100%" stopColor={spec.secondary} stopOpacity="0.16" />
        </linearGradient>

        {/* Luminous platinum foreground */}
        <linearGradient id={ids.platinum} x1="30" y1="22" x2="88" y2="92" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="58%" stopColor="#ECE9FE" />
          <stop offset="100%" stopColor="#BDB2F8" />
        </linearGradient>

        {/* Soft architectural depth shadow */}
        <linearGradient id={ids.shadow} x1="30" y1="40" x2="85" y2="92" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#04050B" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#04050B" stopOpacity="0" />
        </linearGradient>

        {/* Diagonal studio glass sheen */}
        <linearGradient id={ids.sheen} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0" />
          <stop offset="50%" stopColor="#FFFFFF" stopOpacity="0.16" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>

        <clipPath id={ids.clip}>
          <rect x="6" y="6" width="108" height="108" rx="28" />
        </clipPath>

        <filter id={ids.drop} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="3" stdDeviation="3.2" floodColor="#03040A" floodOpacity="0.65" />
        </filter>
      </defs>

      {/* Outer Obsidian Squircle Chassis */}
      <rect x="6" y="6" width="108" height="108" rx="28" fill={`url(#${ids.chassis})`} />

      {/* Recessed Architectural Well */}
      <rect
        x="11"
        y="11"
        width="98"
        height="98"
        rx="23.5"
        fill={`url(#${ids.well})`}
        stroke="#FFFFFF"
        strokeOpacity="0.06"
        strokeWidth="1"
      />

      {/* Top Glass Specular Meniscus */}
      <path
        d="M 28 11.75 H 92"
        stroke="#FFFFFF"
        strokeOpacity="0.22"
        strokeWidth="1.2"
        strokeLinecap="round"
      />

      {/* Dynamic Backlit Emitter Core */}
      <circle
        cx="60"
        cy="60"
        r="38"
        fill={`url(#${ids.glow})`}
        className="rtv-we-center rtv-we-glow"
      />

      {/* Precision Optical Corner Calibration Brackets */}
      <g stroke={spec.accent} strokeOpacity="0.34" strokeWidth="1.15" strokeLinecap="round">
        <path d="M 20 26 V 20 H 26" />
        <path d="M 94 20 H 100 V 26" />
        <path d="M 20 94 V 100 H 26" />
        <path d="M 94 100 H 100 V 94" />
      </g>

      {/* ==================================================================== */}
      {/* CINE Y SERIES: Sculpted Anamorphic Cinema Aperture & Play Prism       */}
      {/* ==================================================================== */}
      {kind === 'cine' && (
        <g filter={`url(#${ids.drop})`}>
          {/* Architectural widescreen frame plate */}
          <rect
            x="25"
            y="38"
            width="70"
            height="48"
            rx="10"
            fill={`url(#${ids.accentSoft})`}
            stroke={`url(#${ids.accent})`}
            strokeWidth="2"
          />

          {/* Sculpted tilted cinema clapper rail */}
          <g transform="rotate(-5 60 32)">
            <rect x="27" y="26.5" width="66" height="11.5" rx="4" fill={`url(#${ids.platinum})`} />
            <path d="M 37 26.5 L 44 26.5 L 38.5 38 L 31.5 38 Z" fill="#141828" />
            <path d="M 53 26.5 L 60 26.5 L 54.5 38 L 47.5 38 Z" fill={`url(#${ids.accent})`} />
            <path d="M 69 26.5 L 76 26.5 L 70.5 38 L 63.5 38 Z" fill="#141828" />
          </g>

          {/* Subtle anamorphic lens orbit arc */}
          <circle
            cx="60"
            cy="63"
            r="16.5"
            stroke={`url(#${ids.accent})`}
            strokeOpacity="0.55"
            strokeWidth="1.4"
            strokeDasharray="18 8 6 8"
            className="rtv-we-center rtv-we-orbit"
          />

          {/* Sculpted platinum play prism */}
          <path
            d="M 54.5 53.5 C 54.5 52.3 55.8 51.6 56.8 52.2 L 71 61.5 C 72 62.1 72 63.6 71 64.2 L 56.8 73.5 C 55.8 74.1 54.5 73.4 54.5 72.2 Z"
            fill={`url(#${ids.platinum})`}
          />
          {/* Inner accent facet */}
          <path
            d="M 54.5 63 L 71 63 L 56.8 73.5 C 55.8 74.1 54.5 73.4 54.5 72.2 Z"
            fill={spec.secondary}
            fillOpacity="0.22"
          />
        </g>
      )}

      {/* ==================================================================== */}
      {/* SALA CON AMIGOS: Dual Watch-Party Silhouettes & Live Spatial Bridge   */}
      {/* ==================================================================== */}
      {kind === 'sala' && (
        <g filter={`url(#${ids.drop})`}>
          {/* Shared ambient cinema screen horizon arc in background */}
          <path
            d="M 28 31 Q 60 25 92 31"
            stroke={`url(#${ids.accent})`}
            strokeWidth="2.6"
            strokeLinecap="round"
            opacity="0.85"
          />
          <path
            d="M 34 36 H 86"
            stroke={spec.secondary}
            strokeOpacity="0.32"
            strokeWidth="1.2"
            strokeLinecap="round"
          />

          {/* Secondary friend layer (violet->emerald gradient) */}
          <circle cx="74" cy="54" r="9.5" fill={`url(#${ids.accent})`} />
          <path
            d="M 57 86 C 57 74.5 64 68.5 74 68.5 C 84 68.5 91 74.5 91 86 Z"
            fill={`url(#${ids.accent})`}
          />

          {/* Cast overlap shadow for clean figure separation */}
          <circle cx="47" cy="51" r="13.5" fill="#080B14" />
          <path
            d="M 25.5 87.5 C 25.5 72 34.5 64.5 47 64.5 C 59.5 64.5 68.5 72 68.5 87.5"
            fill="#080B14"
          />

          {/* Primary foreground friend (luminous platinum) */}
          <circle cx="47" cy="51" r="10.5" fill={`url(#${ids.platinum})`} />
          <path
            d="M 28 86 C 28 73.5 35.8 67 47 67 C 58.2 67 66 73.5 66 86 Z"
            fill={`url(#${ids.platinum})`}
          />

          {/* Floating kinetic voice equalizer pill */}
          <rect
            x="45"
            y="38"
            width="30"
            height="14"
            rx="7"
            fill="#090C16"
            stroke={`url(#${ids.accent})`}
            strokeWidth="1.6"
          />
          <rect x="52.5" y="42.5" width="2.5" height="6" rx="1.25" fill="#FFFFFF" className="rtv-we-eq" />
          <rect
            x="58.75"
            y="40.8"
            width="2.5"
            height="8.4"
            rx="1.25"
            fill={spec.secondary}
            className="rtv-we-eq"
            style={{ animationDelay: '0.18s' }}
          />
          <rect
            x="65"
            y="42.5"
            width="2.5"
            height="6"
            rx="1.25"
            fill="#FFFFFF"
            className="rtv-we-eq"
            style={{ animationDelay: '0.36s' }}
          />
        </g>
      )}

      {/* ==================================================================== */}
      {/* JUEGOS: Sculpted Pro Controller Monolith & Faceted Jewel Controls    */}
      {/* ==================================================================== */}
      {kind === 'juegos' && (
        <g filter={`url(#${ids.drop})`}>
          {/* Glowing top trigger aura */}
          <path
            d="M 33 41 C 38 35.5 46 35.5 50 38 M 87 41 C 82 35.5 74 35.5 70 38"
            stroke={`url(#${ids.accent})`}
            strokeWidth="2.8"
            strokeLinecap="round"
            opacity="0.9"
          />

          {/* Back obsidian grip bevel */}
          <path
            d="M 39 40 H 81 C 88.5 40 94.5 45.5 96 53.5 L 98.5 69 C 99.5 76 94 82 87.5 82 C 83 82 79 79 76.5 74 L 72.5 67.5 H 47.5 L 43.5 74 C 41 79 37 82 32.5 82 C 26 82 20.5 76 21.5 69 L 24 53.5 C 25.5 45.5 31.5 40 39 40 Z"
            fill={`url(#${ids.platinum})`}
          />

          {/* Recessed lower chassis shading */}
          <path
            d="M 45 61 H 75 L 72.5 67.5 H 47.5 Z"
            fill={`url(#${ids.shadow})`}
          />

          {/* Carved precision D-Pad */}
          <rect x="33.5" y="52.2" width="13.5" height="4.4" rx="2.2" fill="#161A2B" />
          <rect x="38.1" y="47.6" width="4.4" height="13.5" rx="2.2" fill="#161A2B" />
          <circle cx="40.3" cy="54.4" r="1.4" fill={spec.accent} />

          {/* Dual subtle analog rings */}
          <circle cx="49" cy="61.5" r="3.4" fill="#161A2B" stroke={spec.accent} strokeWidth="1.2" />
          <circle cx="71" cy="61.5" r="3.4" fill="#161A2B" stroke={spec.secondary} strokeWidth="1.2" />

          {/* Faceted jewel ABXY cluster */}
          <circle cx="79.5" cy="48.5" r="2.7" fill={spec.secondary} />
          <circle cx="85.5" cy="54.2" r="2.7" fill={spec.accent} />
          <circle cx="79.5" cy="59.9" r="2.7" fill="#38BDF8" />
          <circle cx="73.5" cy="54.2" r="2.7" fill="#F59E0B" />

          {/* Glowing center home jewel */}
          <circle cx="60" cy="51.5" r="2.8" fill={`url(#${ids.accent})`} />
        </g>
      )}

      {/* ==================================================================== */}
      {/* FÚTBOL: Architectural Champions Shield Crest & Match Sphere          */}
      {/* ==================================================================== */}
      {kind === 'futbol' && (
        <g filter={`url(#${ids.drop})`}>
          {/* Outer faceted shield crest */}
          <path
            d="M 60 25 L 88 35 V 58.5 C 88 76 76 87.5 60 94 C 44 87.5 32 76 32 58.5 V 35 Z"
            fill={`url(#${ids.accentSoft})`}
            stroke={`url(#${ids.accent})`}
            strokeWidth="2.4"
            strokeLinejoin="round"
          />

          {/* Inner stadium turf pitch geometry */}
          <path
            d="M 60 31.5 L 82 39.2 V 58 C 82 72 72.5 81.5 60 87 C 47.5 81.5 38 72 38 58 V 39.2 Z"
            fill="#0A1219"
            stroke="#FFFFFF"
            strokeOpacity="0.1"
            strokeWidth="1"
          />
          <line x1="39" y1="58" x2="81" y2="58" stroke={spec.accent} strokeOpacity="0.38" strokeWidth="1.4" />
          <circle cx="60" cy="58" r="16" stroke={spec.secondary} strokeOpacity="0.24" strokeWidth="1.2" strokeDasharray="6 5" className="rtv-we-center rtv-we-orbit" />

          {/* Luminous match sphere centerpiece */}
          <circle cx="60" cy="58" r="12.5" fill={`url(#${ids.platinum})`} />
          {/* Sculpted pentagon crest inside ball */}
          <polygon
            points="60,51 66.2,55.5 63.8,62.8 56.2,62.8 53.8,55.5"
            fill="#0D1520"
          />
          <g stroke="#0D1520" strokeWidth="1.6" strokeLinecap="round" opacity="0.72">
            <line x1="60" y1="51" x2="60" y2="45.8" />
            <line x1="66.2" y1="55.5" x2="71.4" y2="53.6" />
            <line x1="63.8" y1="62.8" x2="67.5" y2="67.4" />
            <line x1="56.2" y1="62.8" x2="52.5" y2="67.4" />
            <line x1="53.8" y1="55.5" x2="48.6" y2="53.6" />
          </g>
        </g>
      )}

      {/* ==================================================================== */}
      {/* TV EN DIRECTO: Sculpted OLED Broadcast Screen & RF Waves Array       */}
      {/* ==================================================================== */}
      {kind === 'tv' && (
        <g filter={`url(#${ids.drop})`}>
          {/* Radiating live RF broadcast arcs */}
          <path
            d="M 75 33.5 A 12 12 0 0 1 86.5 45"
            stroke={spec.accent}
            strokeWidth="2.2"
            strokeLinecap="round"
            className="rtv-we-wave"
          />
          <path
            d="M 79 27.5 A 18 18 0 0 1 92.5 41"
            stroke={spec.secondary}
            strokeWidth="2"
            strokeLinecap="round"
            className="rtv-we-wave"
            style={{ animationDelay: '0.28s' }}
          />

          {/* Monitor outer architectural bezel */}
          <rect
            x="25"
            y="37"
            width="70"
            height="46"
            rx="10.5"
            fill={`url(#${ids.platinum})`}
          />
          {/* Deep OLED glass panel */}
          <rect x="29.5" y="41.5" width="61" height="37" rx="7" fill="#070A13" />

          {/* Sweeping horizontal broadcast scanline */}
          <rect
            x="31"
            y="58"
            width="58"
            height="2.5"
            rx="1.25"
            fill={spec.accent}
            fillOpacity="0.45"
            className="rtv-we-scan"
          />

          {/* Kinetic 4-pillar broadcast equalizer */}
          <rect x="43" y="54" width="5.2" height="16" rx="2.6" fill={spec.accent} className="rtv-we-eq" />
          <rect
            x="52.6"
            y="47"
            width="5.2"
            height="23"
            rx="2.6"
            fill={`url(#${ids.platinum})`}
            className="rtv-we-eq"
            style={{ animationDelay: '0.16s' }}
          />
          <rect
            x="62.2"
            y="50.5"
            width="5.2"
            height="19.5"
            rx="2.6"
            fill={`url(#${ids.accent})`}
            className="rtv-we-eq"
            style={{ animationDelay: '0.32s' }}
          />
          <rect
            x="71.8"
            y="45.5"
            width="5.2"
            height="24.5"
            rx="2.6"
            fill={spec.secondary}
            className="rtv-we-eq"
            style={{ animationDelay: '0.48s' }}
          />

          {/* Anodized studio stand */}
          <line x1="60" y1="83" x2="60" y2="88.5" stroke={`url(#${ids.platinum})`} strokeWidth="3.2" strokeLinecap="round" />
          <line x1="45" y1="89.5" x2="75" y2="89.5" stroke={`url(#${ids.accent})`} strokeWidth="3" strokeLinecap="round" />
        </g>
      )}

      {/* Clipped Sweeping Glass Sheen */}
      <g clipPath={`url(#${ids.clip})`} pointerEvents="none">
        <rect
          x="-60"
          y="-10"
          width="54"
          height="145"
          fill={`url(#${ids.sheen})`}
          className="rtv-we-sheen"
        />
      </g>

      {/* Outer Specular Perimeter Rim */}
      <rect
        x="6.75"
        y="6.75"
        width="106.5"
        height="106.5"
        rx="27.25"
        stroke={`url(#${ids.rim})`}
        strokeWidth="1.5"
      />
    </svg>
  );
};

export const WorldPortalTransition: React.FC<WorldPortalTransitionProps> = ({
  portal,
  originRect,
  lang,
}) => {
  const initialClip = useMemo(() => {
    if (originRect && typeof window !== 'undefined' && window.innerWidth > 0 && window.innerHeight > 0) {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const top = Math.max(0, Math.round(originRect.top));
      const left = Math.max(0, Math.round(originRect.left));
      const right = Math.max(0, Math.round(vw - (originRect.left + originRect.width)));
      const bottom = Math.max(0, Math.round(vh - (originRect.top + originRect.height)));
      return `inset(${top}px ${right}px ${bottom}px ${left}px round 24px)`;
    }
    return 'inset(0px 0px 0px 0px round 0px)';
  }, [originRect]);

  const spec = portal ? WORLD_SPECS[portal] : WORLD_SPECS.cine;

  const overlay = (
    <AnimatePresence>
      {portal && (
        <motion.div
          key={portal}
          initial={{ opacity: originRect ? 0.96 : 0, clipPath: initialClip }}
          animate={{ opacity: 1, clipPath: 'inset(0px 0px 0px 0px round 0px)' }}
          exit={{ opacity: 0, scale: 1.02, transition: { duration: 0.32, ease: EASE_EXIT } }}
          transition={{
            clipPath: { duration: 0.44, ease: EASE_STUDIO },
            opacity: { duration: 0.26, ease: 'easeOut' },
          }}
          className="fixed inset-0 w-screen h-[100dvh] z-[9998] pointer-events-none overflow-hidden select-none bg-[#06070C] flex items-center justify-center"
          aria-hidden="true"
        >
          {/* Breathing Studio Radial Ambient Stage */}
          <motion.div
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1.05 }}
            transition={{ duration: 0.68, ease: EASE_STUDIO }}
            className="absolute inset-0 pointer-events-none"
            style={{ background: spec.ambient }}
          />

          {/* Subtle Optical Studio Vignette */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                'radial-gradient(circle at 50% 50%, transparent 38%, rgba(3,4,8,0.84) 100%)',
            }}
          />

          {/* Precision Anamorphic Horizon Beam */}
          <motion.div
            initial={{ opacity: 0, scaleX: 0.08 }}
            animate={{ opacity: [0, 1, 0.55], scaleX: 1 }}
            transition={{ duration: 0.62, delay: 0.08, ease: EASE_STUDIO }}
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-[58px] w-[min(680px,86vw)] h-[1.5px] pointer-events-none"
            style={{
              background: `linear-gradient(90deg, transparent 0%, ${spec.accent}80 24%, #FFFFFFD9 50%, ${spec.secondary}80 76%, transparent 100%)`,
              boxShadow: `0 0 26px rgba(${spec.glowRgb},0.6)`,
            }}
          />

          {/* Centerpiece Optical Focus Lockup */}
          <motion.div
            initial={{ opacity: 0, scale: 0.84, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.48, delay: 0.06, ease: EASE_STUDIO }}
            className="relative z-10 flex flex-col items-center gap-5 px-6 text-center"
          >
            {/* Dual Optical Aperture Rings + Sculpted Emblem */}
            <div className="relative flex items-center justify-center">
              <motion.div
                initial={{ opacity: 0.88, scale: 1.36 }}
                animate={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.58, delay: 0.08, ease: EASE_STUDIO }}
                className="absolute w-32 h-32 sm:w-36 sm:h-36 rounded-[34px] pointer-events-none"
                style={{
                  border: `1.5px solid ${spec.accent}`,
                  boxShadow: `0 0 32px rgba(${spec.glowRgb},0.48)`,
                }}
              />
              <motion.div
                initial={{ opacity: 0.45, scale: 0.92 }}
                animate={{ opacity: 0, scale: 1.42 }}
                transition={{ duration: 0.78, delay: 0.16, ease: EASE_EXIT }}
                className="absolute w-28 h-28 sm:w-32 sm:h-32 rounded-[30px] pointer-events-none"
                style={{
                  border: `1px solid ${spec.secondary}`,
                }}
              />
              <WorldEmblemTile kind={portal} animate="always" className="w-24 h-24 sm:w-28 sm:h-28" />
            </div>

            {/* Staggered Editorial Typography & Hairline Progress */}
            <div className="flex flex-col items-center gap-2">
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.36, delay: 0.14, ease: EASE_STUDIO }}
                className="flex items-center gap-2.5 text-[10px] font-semibold uppercase tracking-[0.26em] text-zinc-400"
              >
                <span className="w-4 h-px bg-white/20" />
                <span>RiffanTV</span>
                <span className="w-4 h-px bg-white/20" />
              </motion.div>

              <motion.h2
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.42, delay: 0.18, ease: EASE_STUDIO }}
                className="font-display font-extrabold text-2xl sm:text-3xl text-white tracking-tight leading-none"
              >
                {pickLang(lang, spec.title)}
              </motion.h2>

              <motion.p
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.24, ease: EASE_STUDIO }}
                className="text-xs sm:text-[13px] font-medium text-zinc-400 tracking-wide"
              >
                {pickLang(lang, spec.subtitle)}
              </motion.p>

              {/* Razor-Thin Studio Sync Hairline */}
              <div className="mt-2.5 w-40 h-[2px] rounded-full bg-white/[0.08] overflow-hidden">
                <motion.div
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: 0.72, delay: 0.16, ease: EASE_STUDIO }}
                  className="w-full h-full origin-left rounded-full"
                  style={{
                    background: `linear-gradient(90deg, ${spec.accent}, ${spec.secondary})`,
                  }}
                />
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  if (typeof document !== 'undefined') {
    return createPortal(overlay, document.body);
  }
  return overlay;
};

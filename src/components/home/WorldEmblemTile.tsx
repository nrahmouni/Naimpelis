import React, { useId } from 'react';
import type { AppLanguage } from '../../types';

export type WorldPortalKind = 'cine' | 'futbol' | 'tv' | 'juegos' | 'sala' | 'clipbox' | 'rbtv' | 'belix' | 'atresplayer' | 'movistardazn' | 'music' | 'providers' | 'reels';

export interface WorldSpec {
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
      rif: 'Talfaza Direkt',
      zh: '直播电视',
    },
    subtitle: {
      es: 'TDT, deportes y canales 24/7',
      ca: 'TDT, esports i canals 24/7',
      en: 'DTT, sports & 24/7 channels',
      rif: 'Talfaza d lkanalat 24/7',
      zh: '实时频道与全天候播出',
    },
  },
  clipbox: {
    accent: '#06B6D4',
    secondary: '#7C3AED',
    glowRgb: '6,182,212',
    ambient:
      'radial-gradient(ellipse 68% 54% at 50% 47%, rgba(6,182,212,0.22) 0%, rgba(124,58,237,0.10) 42%, rgba(6,7,12,0) 74%)',
    title: {
      es: 'ClipBox Vault',
      ca: 'ClipBox Vault',
      en: 'ClipBox Vault',
      rif: 'ClipBox Vault',
      zh: 'ClipBox 片源库',
    },
    subtitle: {
      es: '574 URLs · 440 hosts · 954 rutas descifradas',
      ca: '574 URLs · 440 hosts · 954 rutes desxifrades',
      en: '574 URLs · 440 hosts · 954 decoded routes',
      rif: '574 URLs · 440 hosts · 954 tibridin',
      zh: '574 链接 · 440 源站 · 954 解析路由',
    },
  },
  rbtv: {
    accent: '#F59E0B',
    secondary: '#10B981',
    glowRgb: '245,158,11',
    ambient:
      'radial-gradient(ellipse 68% 54% at 50% 47%, rgba(245,158,11,0.22) 0%, rgba(16,185,129,0.10) 42%, rgba(6,7,12,0) 74%)',
    title: {
      es: 'RBTV+ Cluster',
      ca: 'RBTV+ Clúster',
      en: 'RBTV+ Cluster',
      rif: 'RBTV+ Cluster',
      zh: 'RBTV+ 体育集群',
    },
    subtitle: {
      es: '61 URLs · 47 hosts · 13 DoH & P2P',
      ca: '61 URLs · 47 hosts · 13 DoH i P2P',
      en: '61 URLs · 47 hosts · 13 DoH & P2P',
      rif: '61 URLs · 47 hosts · 13 DoH & P2P',
      zh: '61 链接 · 47 节点 · 13 DoH 解析',
    },
  },
  belix: {
    accent: '#F43F5E',
    secondary: '#818CF8',
    glowRgb: '244,63,94',
    ambient:
      'radial-gradient(ellipse 68% 54% at 50% 47%, rgba(244,63,94,0.22) 0%, rgba(129,140,248,0.10) 42%, rgba(6,7,12,0) 74%)',
    title: {
      es: 'Belix TV Xtream',
      ca: 'Belix TV Xtream',
      en: 'Belix TV Xtream',
      rif: 'Belix TV Xtream',
      zh: 'Belix TV 直播引擎',
    },
    subtitle: {
      es: '15 APIs Xtream · 48 URLs · 21 hosts',
      ca: '15 APIs Xtream · 48 URLs · 21 hosts',
      en: '15 Xtream APIs · 48 URLs · 21 hosts',
      rif: '15 APIs Xtream · 48 URLs · 21 hosts',
      zh: '15 Xtream 接口 · 48 链接 · 21 域名',
    },
  },
  atresplayer: {
    accent: '#FF5E1A',
    secondary: '#F59E0B',
    glowRgb: '255,94,26',
    ambient:
      'radial-gradient(ellipse 68% 54% at 50% 47%, rgba(255,94,26,0.24) 0%, rgba(245,158,11,0.10) 42%, rgba(6,7,12,0) 74%)',
    title: {
      es: 'Atresmedia',
      ca: 'Atresmedia',
      en: 'Atresmedia',
      rif: 'Atresmedia',
      zh: 'Atresmedia 频道',
    },
    subtitle: {
      es: 'Directos 1080p · Pasapalabra y programas HD',
      ca: 'Directes 1080p · Pasapalabra i programes HD',
      en: '1080p Live · Pasapalabra & HD Shows',
      rif: 'Directos 1080p · Pasapalabra d programas HD',
      zh: '1080p 直播 · Pasapalabra 与高清节目',
    },
  },
  movistardazn: {
    accent: '#D4FF00',
    secondary: '#00A9E0',
    glowRgb: '0,169,224',
    ambient:
      'radial-gradient(ellipse 68% 54% at 50% 47%, rgba(212,255,0,0.20) 0%, rgba(0,169,224,0.16) 44%, rgba(6,7,12,0) 76%)',
    title: {
      es: 'DAZN & Movistar+',
      ca: 'DAZN & Movistar+',
      en: 'DAZN & Movistar+',
      rif: 'DAZN & Movistar+',
      zh: 'DAZN & Movistar+',
    },
    subtitle: {
      es: '17 directos HD · LaLiga, F1, MotoGP y Series M+',
      ca: '17 directes HD · LaLiga, F1, MotoGP i Sèries M+',
      en: '17 HD live feeds · LaLiga, F1, MotoGP & M+ Series',
      rif: '17 directos HD · LaLiga, F1, MotoGP d Series M+',
      zh: '17 路高清直播 · 西甲 F1 与 Movistar 原创剧集',
    },
  },
  music: {
    accent: '#FF3366',
    secondary: '#F59E0B',
    glowRgb: '255,51,102',
    ambient:
      'radial-gradient(ellipse 68% 54% at 50% 47%, rgba(255,51,102,0.24) 0%, rgba(245,158,11,0.12) 44%, rgba(7,5,10,0) 76%)',
    title: {
      es: 'Riffan Music',
      ca: 'Riffan Music',
      en: 'Riffan Music',
      rif: 'Riffan Music',
      zh: 'Riffan 音乐',
    },
    subtitle: {
      es: 'Millones de canciones · Letras, Videoclips y Radios 24/7',
      ca: 'Milions de cançons · Lletres, Videoclips i Ràdios 24/7',
      en: 'Millions of tracks · Synced Lyrics, MVs & 24/7 Radios',
      rif: 'Izlan · Imdyaz d Radyu 24/7',
      zh: '海量曲库 · 实时歌词、MV 与全天候电台',
    },
  },
  providers: {
    accent: '#7C3AED',
    secondary: '#10B981',
    glowRgb: '124,58,237',
    ambient:
      'radial-gradient(ellipse 68% 54% at 50% 47%, rgba(124,58,237,0.24) 0%, rgba(16,185,129,0.12) 44%, rgba(6,7,12,0) 76%)',
    title: {
      es: 'Catálogo Total',
      ca: 'Catàleg Total',
      en: 'Full Catalog',
      rif: 'Catálogo Total',
      zh: '全部片源库',
    },
    subtitle: {
      es: 'VOD 4K · 2M2H · Adtupac · Ultra VIP · Sult-Vo',
      ca: 'VOD 4K · 2M2H · Adtupac · Ultra VIP · Sult-Vo',
      en: 'VOD 4K · 2M2H · Adtupac · Ultra VIP · Sult-Vo',
      rif: 'VOD 4K · 2M2H · Adtupac · Ultra VIP · Sult-Vo',
      zh: 'VOD 4K · 2M2H · Adtupac · Ultra VIP · Sult-Vo',
    },
  },
  reels: {
    accent: '#FF2E63',
    secondary: '#9146FF',
    glowRgb: '255,46,99',
    ambient:
      'radial-gradient(ellipse 68% 54% at 50% 47%, rgba(255,46,99,0.24) 0%, rgba(145,70,255,0.12) 44%, rgba(6,7,12,0) 76%)',
    title: {
      es: 'CineTok · Clips',
      ca: 'CineTok · Clips',
      en: 'CineTok · Reels',
      rif: 'CineTok · Clips',
      zh: '影视短视频',
    },
    subtitle: {
      es: 'Tráilers, escenas pro y presentador por tus gustos',
      ca: 'Tràilers, escenes pro i presentador pels teus gustos',
      en: 'Trailers, pro scenes & taste-driven AI host',
      rif: 'Tráilers d escenas pro',
      zh: '预告片与高能片段推荐',
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
        <linearGradient id={ids.chassis} x1="14" y1="8" x2="106" y2="112" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#232B42" />
          <stop offset="38%" stopColor="#121726" />
          <stop offset="100%" stopColor="#06080F" />
        </linearGradient>

        <radialGradient id={ids.well} cx="50%" cy="34%" r="68%">
          <stop offset="0%" stopColor="#171D30" />
          <stop offset="68%" stopColor="#0B0E18" />
          <stop offset="100%" stopColor="#05060B" />
        </radialGradient>

        <linearGradient id={ids.rim} x1="12" y1="6" x2="108" y2="114" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.42" />
          <stop offset="34%" stopColor={spec.accent} stopOpacity="0.68" />
          <stop offset="72%" stopColor={spec.secondary} stopOpacity="0.42" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.08" />
        </linearGradient>

        <radialGradient id={ids.glow} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={spec.accent} stopOpacity="0.42" />
          <stop offset="48%" stopColor={spec.secondary} stopOpacity="0.14" />
          <stop offset="100%" stopColor={spec.accent} stopOpacity="0" />
        </radialGradient>

        <linearGradient id={ids.accent} x1="24" y1="24" x2="96" y2="96" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={spec.accent} />
          <stop offset="55%" stopColor={spec.accent} />
          <stop offset="100%" stopColor={spec.secondary} />
        </linearGradient>

        <linearGradient id={ids.accentSoft} x1="24" y1="24" x2="96" y2="96" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={spec.accent} stopOpacity="0.34" />
          <stop offset="100%" stopColor={spec.secondary} stopOpacity="0.16" />
        </linearGradient>

        <linearGradient id={ids.platinum} x1="30" y1="22" x2="88" y2="92" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="58%" stopColor="#ECE9FE" />
          <stop offset="100%" stopColor="#BDB2F8" />
        </linearGradient>

        <linearGradient id={ids.shadow} x1="30" y1="40" x2="85" y2="92" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#04050B" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#04050B" stopOpacity="0" />
        </linearGradient>

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

      <rect x="6" y="6" width="108" height="108" rx="28" fill={`url(#${ids.chassis})`} />

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

      <path
        d="M 28 11.75 H 92"
        stroke="#FFFFFF"
        strokeOpacity="0.22"
        strokeWidth="1.2"
        strokeLinecap="round"
      />

      <circle
        cx="60"
        cy="60"
        r="38"
        fill={`url(#${ids.glow})`}
        className="rtv-we-center rtv-we-glow"
      />

      <g stroke={spec.accent} strokeOpacity="0.34" strokeWidth="1.15" strokeLinecap="round">
        <path d="M 20 26 V 20 H 26" />
        <path d="M 94 20 H 100 V 26" />
        <path d="M 20 94 V 100 H 26" />
        <path d="M 94 100 H 100 V 94" />
      </g>

      {kind === 'cine' && (
        <g filter={`url(#${ids.drop})`}>
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

          <g transform="rotate(-5 60 32)">
            <rect x="27" y="26.5" width="66" height="11.5" rx="4" fill={`url(#${ids.platinum})`} />
            <path d="M 37 26.5 L 44 26.5 L 38.5 38 L 31.5 38 Z" fill="#141828" />
            <path d="M 53 26.5 L 60 26.5 L 54.5 38 L 47.5 38 Z" fill={`url(#${ids.accent})`} />
            <path d="M 69 26.5 L 76 26.5 L 70.5 38 L 63.5 38 Z" fill="#141828" />
          </g>

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

          <path
            d="M 54.5 53.5 C 54.5 52.3 55.8 51.6 56.8 52.2 L 71 61.5 C 72 62.1 72 63.6 71 64.2 L 56.8 73.5 C 55.8 74.1 54.5 73.4 54.5 72.2 Z"
            fill={`url(#${ids.platinum})`}
          />
          <path
            d="M 54.5 63 L 71 63 L 56.8 73.5 C 55.8 74.1 54.5 73.4 54.5 72.2 Z"
            fill={spec.secondary}
            fillOpacity="0.22"
          />
        </g>
      )}

      {kind === 'sala' && (
        <g filter={`url(#${ids.drop})`}>
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

          <circle cx="74" cy="54" r="9.5" fill={`url(#${ids.accent})`} />
          <path
            d="M 57 86 C 57 74.5 64 68.5 74 68.5 C 84 68.5 91 74.5 91 86 Z"
            fill={`url(#${ids.accent})`}
          />

          <circle cx="47" cy="51" r="13.5" fill="#080B14" />
          <path
            d="M 25.5 87.5 C 25.5 72 34.5 64.5 47 64.5 C 59.5 64.5 68.5 72 68.5 87.5"
            fill="#080B14"
          />

          <circle cx="47" cy="51" r="10.5" fill={`url(#${ids.platinum})`} />
          <path
            d="M 28 86 C 28 73.5 35.8 67 47 67 C 58.2 67 66 73.5 66 86 Z"
            fill={`url(#${ids.platinum})`}
          />

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

      {kind === 'juegos' && (
        <g filter={`url(#${ids.drop})`}>
          <path
            d="M 33 41 C 38 35.5 46 35.5 50 38 M 87 41 C 82 35.5 74 35.5 70 38"
            stroke={`url(#${ids.accent})`}
            strokeWidth="2.8"
            strokeLinecap="round"
            opacity="0.9"
          />

          <path
            d="M 39 40 H 81 C 88.5 40 94.5 45.5 96 53.5 L 98.5 69 C 99.5 76 94 82 87.5 82 C 83 82 79 79 76.5 74 L 72.5 67.5 H 47.5 L 43.5 74 C 41 79 37 82 32.5 82 C 26 82 20.5 76 21.5 69 L 24 53.5 C 25.5 45.5 31.5 40 39 40 Z"
            fill={`url(#${ids.platinum})`}
          />

          <path d="M 45 61 H 75 L 72.5 67.5 H 47.5 Z" fill={`url(#${ids.shadow})`} />

          <rect x="33.5" y="52.2" width="13.5" height="4.4" rx="2.2" fill="#161A2B" />
          <rect x="38.1" y="47.6" width="4.4" height="13.5" rx="2.2" fill="#161A2B" />
          <circle cx="40.3" cy="54.4" r="1.4" fill={spec.accent} />

          <circle cx="49" cy="61.5" r="3.4" fill="#161A2B" stroke={spec.accent} strokeWidth="1.2" />
          <circle cx="71" cy="61.5" r="3.4" fill="#161A2B" stroke={spec.secondary} strokeWidth="1.2" />

          <circle cx="79.5" cy="48.5" r="2.7" fill={spec.secondary} />
          <circle cx="85.5" cy="54.2" r="2.7" fill={spec.accent} />
          <circle cx="79.5" cy="59.9" r="2.7" fill="#38BDF8" />
          <circle cx="73.5" cy="54.2" r="2.7" fill="#F59E0B" />

          <circle cx="60" cy="51.5" r="2.8" fill={`url(#${ids.accent})`} />
        </g>
      )}

      {kind === 'futbol' && (
        <g filter={`url(#${ids.drop})`}>
          <path
            d="M 60 25 L 88 35 V 58.5 C 88 76 76 87.5 60 94 C 44 87.5 32 76 32 58.5 V 35 Z"
            fill={`url(#${ids.accentSoft})`}
            stroke={`url(#${ids.accent})`}
            strokeWidth="2.4"
            strokeLinejoin="round"
          />

          <path
            d="M 60 31.5 L 82 39.2 V 58 C 82 72 72.5 81.5 60 87 C 47.5 81.5 38 72 38 58 V 39.2 Z"
            fill="#0A1219"
            stroke="#FFFFFF"
            strokeOpacity="0.1"
            strokeWidth="1"
          />
          <line x1="39" y1="58" x2="81" y2="58" stroke={spec.accent} strokeOpacity="0.38" strokeWidth="1.4" />
          <circle cx="60" cy="58" r="16" stroke={spec.secondary} strokeOpacity="0.24" strokeWidth="1.2" strokeDasharray="6 5" className="rtv-we-center rtv-we-orbit" />

          <circle cx="60" cy="58" r="12.5" fill={`url(#${ids.platinum})`} />
          <polygon points="60,51 66.2,55.5 63.8,62.8 56.2,62.8 53.8,55.5" fill="#0D1520" />
          <g stroke="#0D1520" strokeWidth="1.6" strokeLinecap="round" opacity="0.72">
            <line x1="60" y1="51" x2="60" y2="45.8" />
            <line x1="66.2" y1="55.5" x2="71.4" y2="53.6" />
            <line x1="63.8" y1="62.8" x2="67.5" y2="67.4" />
            <line x1="56.2" y1="62.8" x2="52.5" y2="67.4" />
            <line x1="53.8" y1="55.5" x2="48.6" y2="53.6" />
          </g>
        </g>
      )}

      {kind === 'tv' && (
        <g filter={`url(#${ids.drop})`}>
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

          <rect x="25" y="37" width="70" height="46" rx="10.5" fill={`url(#${ids.platinum})`} />
          <rect x="29.5" y="41.5" width="61" height="37" rx="7" fill="#070A13" />

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

          <line x1="60" y1="83" x2="60" y2="88.5" stroke={`url(#${ids.platinum})`} strokeWidth="3.2" strokeLinecap="round" />
          <line x1="45" y1="89.5" x2="75" y2="89.5" stroke={`url(#${ids.accent})`} strokeWidth="3" strokeLinecap="round" />
        </g>
      )}

      {kind === 'clipbox' && (
        <g filter={`url(#${ids.drop})`}>
          <polygon
            points="60,24 91,42 91,78 60,96 29,78 29,42"
            fill={`url(#${ids.accentSoft})`}
            stroke={`url(#${ids.accent})`}
            strokeWidth="2.2"
            strokeLinejoin="round"
          />
          <polygon
            points="60,31 84,45 84,75 60,89 36,75 36,45"
            fill="#070B13"
            stroke="#FFFFFF"
            strokeOpacity="0.12"
            strokeWidth="1"
            strokeLinejoin="round"
          />
          <circle
            cx="60"
            cy="60"
            r="19"
            stroke={spec.accent}
            strokeOpacity="0.45"
            strokeWidth="1.2"
            strokeDasharray="10 6 4 6"
            className="rtv-we-center rtv-we-orbit"
          />
          <polygon
            points="60,41 76,50.5 76,69.5 60,79 44,69.5 44,50.5"
            fill={`url(#${ids.platinum})`}
            fillOpacity="0.14"
            stroke={`url(#${ids.platinum})`}
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path
            d="M 55.5 52.5 C 55.5 51.5 56.6 50.9 57.5 51.5 L 69.5 59.1 C 70.3 59.6 70.3 60.8 69.5 61.3 L 57.5 68.9 C 56.6 69.5 55.5 68.9 55.5 67.9 Z"
            fill={`url(#${ids.platinum})`}
          />
        </g>
      )}

      {kind === 'rbtv' && (
        <g filter={`url(#${ids.drop})`}>
          <circle
            cx="60"
            cy="58"
            r="27"
            stroke={`url(#${ids.accent})`}
            strokeOpacity="0.4"
            strokeWidth="1.4"
            strokeDasharray="14 6"
            className="rtv-we-center rtv-we-orbit"
          />
          <circle
            cx="60"
            cy="58"
            r="18"
            fill={`url(#${ids.accentSoft})`}
            stroke={`url(#${ids.accent})`}
            strokeWidth="2.1"
          />
          <path
            d="M 35 42 A 28 28 0 0 1 85 42"
            stroke={spec.accent}
            strokeWidth="2.2"
            strokeLinecap="round"
            className="rtv-we-wave"
          />
          <path
            d="M 41 48 A 20 20 0 0 1 79 48"
            stroke={spec.secondary}
            strokeWidth="2"
            strokeLinecap="round"
            className="rtv-we-wave"
            style={{ animationDelay: '0.24s' }}
          />
          <path
            d="M 55 50.5 C 55 49.4 56.2 48.8 57.1 49.4 L 69 57 C 69.9 57.6 69.9 58.9 69 59.5 L 57.1 67.1 C 56.2 67.7 55 67.1 55 66 Z"
            fill={`url(#${ids.platinum})`}
          />
          <line x1="60" y1="77" x2="60" y2="88" stroke={`url(#${ids.platinum})`} strokeWidth="3" strokeLinecap="round" />
          <line x1="45" y1="89" x2="75" y2="89" stroke={`url(#${ids.accent})`} strokeWidth="2.8" strokeLinecap="round" />
        </g>
      )}

      {kind === 'belix' && (
        <g filter={`url(#${ids.drop})`}>
          <rect
            x="27"
            y="30"
            width="66"
            height="58"
            rx="16"
            fill={`url(#${ids.accentSoft})`}
            stroke={`url(#${ids.accent})`}
            strokeWidth="2.2"
          />
          <rect
            x="33"
            y="36"
            width="54"
            height="46"
            rx="11"
            fill="#070B13"
            stroke="#FFFFFF"
            strokeOpacity="0.12"
            strokeWidth="1"
          />
          <path
            d="M 41 47 H 59 M 41 59 H 68 M 41 71 H 54"
            stroke={`url(#${ids.accent})`}
            strokeWidth="3.2"
            strokeLinecap="round"
          />
          <path
            d="M 65 46 L 78 59 L 65 72"
            stroke={`url(#${ids.platinum})`}
            strokeWidth="3.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      )}

      {kind === 'atresplayer' && (
        <g filter={`url(#${ids.drop})`}>
          <circle
            cx="60"
            cy="60"
            r="27"
            fill={`url(#${ids.accentSoft})`}
            stroke={`url(#${ids.accent})`}
            strokeWidth="2.4"
          />
          <circle
            cx="60"
            cy="60"
            r="19.5"
            fill="#070A13"
            stroke="#FFFFFF"
            strokeOpacity="0.14"
            strokeWidth="1"
          />
          <path
            d="M 52 46.5 L 73 60 L 52 73.5 Z"
            fill={`url(#${ids.accent})`}
          />
          <path
            d="M 45 48 L 62 60 L 45 72"
            stroke={`url(#${ids.platinum})`}
            strokeWidth="2.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      )}

      {kind === 'movistardazn' && (
        <g filter={`url(#${ids.drop})`}>
          {/* Outer dual volt-azure stadium orbit */}
          <circle
            cx="60"
            cy="60"
            r="28.5"
            stroke={`url(#${ids.accent})`}
            strokeOpacity="0.55"
            strokeWidth="1.6"
            strokeDasharray="16 7 6 7"
            className="rtv-we-center rtv-we-orbit"
          />
          {/* Left faceted DAZN prism */}
          <path
            d="M 28 38 H 48 L 57 60 L 48 82 H 28 Z"
            fill={`url(#${ids.accentSoft})`}
            stroke={spec.accent}
            strokeWidth="2.1"
            strokeLinejoin="round"
          />
          <path
            d="M 35 47 H 44.5 L 50 60 L 44.5 73 H 35 Z"
            fill={spec.accent}
          />
          {/* Right Movistar+ azure '+' prism */}
          <rect
            x="61"
            y="38"
            width="31"
            height="44"
            rx="11"
            fill="#07101C"
            stroke={spec.secondary}
            strokeWidth="2.1"
          />
          <path
            d="M 76.5 49 V 71 M 65.5 60 H 87.5"
            stroke={`url(#${ids.platinum})`}
            strokeWidth="4.2"
            strokeLinecap="round"
          />
        </g>
      )}

      {kind === 'music' && (
        <g filter={`url(#${ids.drop})`}>
          {/* Sonic vinyl outer halo */}
          <circle
            cx="60"
            cy="60"
            r="30"
            fill={`url(#${ids.accentSoft})`}
            stroke={`url(#${ids.accent})`}
            strokeWidth="2.1"
          />
          <circle
            cx="60"
            cy="60"
            r="23.5"
            fill="#0A060C"
            stroke={spec.secondary}
            strokeOpacity="0.45"
            strokeWidth="1.2"
            strokeDasharray="14 6 4 6"
            className="rtv-we-center rtv-we-orbit"
          />
          {/* Folded Ribbon R core (Sonic Studio remix of RiffanTV monogram) */}
          <rect x="44" y="40" width="9.5" height="40" rx="4.75" fill={`url(#${ids.platinum})`} />
          <path
            d="M 48 41.5 H 64.5 C 72.5 41.5 76.5 46.5 76.5 52 C 76.5 57.5 72.2 61.5 64.5 61.5 H 52.5"
            stroke={`url(#${ids.accent})`}
            strokeWidth="6.8"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M 55.5 61.5 L 74.5 79"
            stroke={spec.secondary}
            strokeWidth="6.6"
            strokeLinecap="round"
          />
          {/* Harmonic acoustic arc accents */}
          <path
            d="M 81.5 50.5 C 85 55.5 85 64.5 81.5 69.5"
            stroke={spec.accent}
            strokeWidth="2.2"
            strokeLinecap="round"
            fill="none"
          />
        </g>
      )}

      {kind === 'providers' && (
        <g filter={`url(#${ids.drop})`}>
          <rect
            x="28"
            y="29"
            width="64"
            height="16"
            rx="6"
            fill={`url(#${ids.accentSoft})`}
            stroke={`url(#${ids.accent})`}
            strokeWidth="2"
          />
          <rect
            x="28"
            y="52"
            width="64"
            height="16"
            rx="6"
            fill="#070B13"
            stroke={`url(#${ids.platinum})`}
            strokeWidth="1.8"
          />
          <rect
            x="28"
            y="75"
            width="64"
            height="16"
            rx="6"
            fill={`url(#${ids.accentSoft})`}
            stroke={spec.secondary}
            strokeWidth="2"
          />
          <circle cx="38" cy="37" r="2.6" fill={spec.secondary} />
          <circle cx="38" cy="60" r="2.6" fill={spec.accent} />
          <circle cx="38" cy="83" r="2.6" fill={spec.secondary} />
          <line x1="47" y1="37" x2="82" y2="37" stroke={`url(#${ids.platinum})`} strokeWidth="2.4" strokeLinecap="round" />
          <line x1="47" y1="60" x2="82" y2="60" stroke={`url(#${ids.platinum})`} strokeWidth="2.4" strokeLinecap="round" />
          <line x1="47" y1="83" x2="82" y2="83" stroke={`url(#${ids.platinum})`} strokeWidth="2.4" strokeLinecap="round" />
        </g>
      )}

      {kind === 'reels' && (
        <g filter={`url(#${ids.drop})`}>
          <rect
            x="38"
            y="24"
            width="44"
            height="72"
            rx="11"
            fill={`url(#${ids.accentSoft})`}
            stroke={`url(#${ids.accent})`}
            strokeWidth="2.2"
          />
          <polygon
            points="53,48 53,72 73,60"
            fill={`url(#${ids.platinum})`}
          />
        </g>
      )}

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

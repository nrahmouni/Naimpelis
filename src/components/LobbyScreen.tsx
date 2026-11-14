import React, { useEffect, useState } from 'react';
import { User } from 'firebase/auth';
import { motion } from 'motion/react';
import {
  ArrowRight,
  Shuffle,
  Play,
  Globe,
  Clock,
  ChevronRight,
  Film,
  Tv,
  Trophy,
  Users,
  Cloud,
  LogIn,
  LogOut,
  Settings,
  Download,
  Monitor,
  Smartphone,
  ShieldCheck,
  Sparkles,
  KeyRound,
} from 'lucide-react';
import { AppLanguage } from '../types';
import { UI_COPY } from '../utils/i18n';
import { RecentRoomEntry, StoredProfile } from '../utils/storage';
import { triggerHaptic } from '../utils/haptics';
import {
  extractRoomCodeFromInput,
  generateShortRoomCode,
  isSmartTvBrowser,
} from '../utils/shortLink';
import { NaimBrandLogo } from './NaimBrandLogo';
import { EffectiveViewMode, getMonogramInitials } from './MobileViewportGuard';
import { PWAInstallLandingCard } from './PWAInstallPrompt';
import {
  PrimaryButton,
  SecondaryButton,
  IconButton,
  BottomSheet,
  SegmentedControl,
} from './ui/DesignSystem';
import twitchBroadcastHeroImg from '../assets/images/twitch_broadcast_hero_1794673805657.jpg';

const RANDOM_NAMES = [
  'Naim',
  'Cineasta',
  'SalaVIP',
  'NocheDeCine',
  'InvitadoHD',
  'ButacaCentral',
  'Premier',
];

interface LobbyScreenProps {
  initialProfile: StoredProfile;
  recentRooms: RecentRoomEntry[];
  lang: AppLanguage;
  effectiveView: EffectiveViewMode;
  isFramedMobileOnPc: boolean;
  onToggleViewMode: () => void;
  authUser: User | null;
  authLoading: boolean;
  onSignIn: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onChangeLang: (lang: AppLanguage) => void;
  onReplayIntro: () => void;
  onEnterRoom: (roomId: string, profile: StoredProfile, roomName?: string) => void;
  onOpenTvPairLobby?: () => void;
  onOpenAdsPage?: () => void;
}

export const LobbyScreen: React.FC<LobbyScreenProps> = ({
  initialProfile,
  recentRooms,
  lang,
  effectiveView,
  isFramedMobileOnPc,
  onToggleViewMode,
  authUser,
  authLoading,
  onSignIn,
  onSignOut,
  onChangeLang,
  onReplayIntro,
  onEnterRoom,
  onOpenTvPairLobby,
  onOpenAdsPage,
}) => {
  const t = UI_COPY[lang];
  const isDesktop = effectiveView === 'desktop';
  const [name, setName] = useState(initialProfile.name);
  const [roomCode, setRoomCode] = useState('');
  const [heroImgFailed, setHeroImgFailed] = useState(false);
  const [nameError, setNameError] = useState(false);
  const [showLobbyOptionsSheet, setShowLobbyOptionsSheet] = useState(false);
  const [entryMode, setEntryMode] = useState<'create' | 'join'>('create');

  useEffect(() => {
    setName(initialProfile.name);
  }, [initialProfile.id, initialProfile.name]);

  const buildProfile = (): StoredProfile | null => {
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError(true);
      triggerHaptic('warning');
      return null;
    }
    setNameError(false);
    return {
      id: initialProfile.id,
      name: trimmed.slice(0, 24),
      avatar: initialProfile.avatar || '🎬',
      color: initialProfile.color || '#9146FF',
      isCustomized: true,
    };
  };

  const handleCreateRoom = () => {
    const profile = buildProfile();
    if (!profile) return;
    triggerHaptic('success');
    const code = generateShortRoomCode(4);
    onEnterRoom(code, profile, `Sala de ${profile.name}`);
  };

  const handleJoinByCode = (e: React.FormEvent) => {
    e.preventDefault();
    const profile = buildProfile();
    if (!profile) return;
    const cleanCode = extractRoomCodeFromInput(roomCode);
    if (!cleanCode) return;
    triggerHaptic('success');
    onEnterRoom(cleanCode, profile);
  };

  const handleRandomName = () => {
    triggerHaptic('light');
    const pick = RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)];
    setName(`${pick}_${Math.floor(Math.random() * 90 + 10)}`);
    setNameError(false);
  };

  const featureHighlights =
    lang === 'ca'
      ? [
          {
            icon: Film,
            title: 'Catàleg sense límits',
            desc: 'Estrenes, 14 gèneres, 3Cat, anime i canals FAST 24/7 en obert.',
          },
          {
            icon: Trophy,
            title: 'Esports i TDT EPG',
            desc: 'Marcador de futbol en directe i guia XMLTV de canals TDT.',
          },
          {
            icon: Users,
            title: 'Watch Party real',
            desc: 'Xat, enquestes democràtiques i cua col·laborativa sense latència.',
          },
          {
            icon: Tv,
            title: 'Smart TV & Android',
            desc: 'Mateix disseny modern a Web, APK Android mòbil i receptor Google TV.',
          },
        ]
      : lang === 'en'
      ? [
          {
            icon: Film,
            title: 'Expanded Catalog',
            desc: 'Premieres, 14 genres, 10 streaming hubs, anime, and 24/7 FAST channels.',
          },
          {
            icon: Trophy,
            title: 'Live Football & TDT',
            desc: 'Real-time matchboard scores, multi-feed mirrors, and full EPG guide.',
          },
          {
            icon: Users,
            title: 'Synchronized Party',
            desc: 'Sub-second frame sync, live polls, collaborative queue, and reactions.',
          },
          {
            icon: Tv,
            title: 'Android & Google TV',
            desc: 'Same ultra-fluid app interface on Web, Android Mobile APK & Google TV.',
          },
        ]
      : [
          {
            icon: Film,
            title: 'Catálogo Expandido',
            desc: 'Estrenos, 14 géneros, plataformas, anime, documentales y canales FAST 24/7.',
          },
          {
            icon: Trophy,
            title: 'Fútbol y TDT en Vivo',
            desc: 'Marcador directo de partidos y guía EPG XMLTV sin bloqueos ni anuncios.',
          },
          {
            icon: Users,
            title: 'Sala Sincronizada',
            desc: 'Reproducción al milisegundo con encuestas, cola compartida y chat en vivo.',
          },
          {
            icon: Tv,
            title: 'Android y Google TV',
            desc: 'Mismo diseño y fluidez en Web, APK Móvil Android y Receptor Google TV.',
          },
        ];

  return (
    <div className="min-h-dvh w-full bg-[#0B0B0E] text-[#EFEFF1] overflow-x-clip relative">
      {/* Subtle Ambient Broadcast & Aurora Lighting */}
      <div className="pointer-events-none fixed inset-x-0 top-0 h-[38rem] overflow-hidden">
        {!heroImgFailed && (
          <img
            src={twitchBroadcastHeroImg}
            alt=""
            aria-hidden="true"
            referrerPolicy="no-referrer"
            onError={() => setHeroImgFailed(true)}
            className="w-full h-full object-cover object-center opacity-[0.16] scale-105"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-[#0B0B0E]/40 via-[#0B0B0E]/85 to-[#0B0B0E]" />
        <div className="absolute inset-0 nc-aurora-ambient" />
      </div>

      <div
        className={`@container min-h-dvh w-full flex flex-col pt-safe pb-safe relative z-10 ${
          isFramedMobileOnPc
            ? 'max-w-[27rem] mx-auto border-x border-white/[0.08] bg-[#0B0B0E] shadow-[0_0_120px_rgba(0,0,0,0.96)]'
            : ''
        }`}
      >
        {/* ==================================================================== */}
        {/* SINGLE-RESPONSIBILITY HEADER (Zero Duplicate Action Menus)           */}
        {/* ==================================================================== */}
        <header
          className={`w-full max-w-[1440px] mx-auto ${
            isDesktop ? 'px-6 lg:px-10 h-20' : 'px-4 h-16'
          } flex items-center justify-between gap-4 shrink-0`}
        >
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onReplayIntro();
            }}
            className="flex items-center gap-3 min-w-0 cursor-pointer text-left group py-1 whitespace-nowrap shrink-0"
            title={lang === 'es' ? 'Ver Intro NAIMCINE' : 'Play NAIMCINE Intro'}
          >
            <NaimBrandLogo
              size={isDesktop ? 42 : 34}
              className="shrink-0 shadow-[0_0_26px_rgba(145,70,255,0.4)] group-hover:scale-105 transition-transform"
            />
            <span className="font-display font-bold text-base sm:text-lg tracking-[0.14em] text-white">
              NAIM <span className="text-[#A970FF]">CINE</span>
            </span>
          </button>

          <div className="flex items-center gap-2 shrink-0">
            {onOpenTvPairLobby && (
              <SecondaryButton
                type="button"
                onClick={() => {
                  triggerHaptic('medium');
                  onOpenTvPairLobby();
                }}
                className="!px-3.5"
                title="Abrir Receptor Smart TV (/tv)"
              >
                <Tv className="w-4 h-4 text-[#BF94FF] shrink-0" />
                <span className="hidden sm:inline">
                  {lang === 'es' ? 'Receptor Smart TV' : 'Smart TV'}
                </span>
                <span className="sm:hidden">TV</span>
              </SecondaryButton>
            )}

            <IconButton
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setShowLobbyOptionsSheet(true);
              }}
              aria-label="Ajustes, idioma y descarga APK"
              title="Ajustes, cuenta Google, idioma y descarga APK"
            >
              <Settings className="w-5 h-5" />
            </IconButton>
          </div>
        </header>

        {/* ==================================================================== */}
        {/* MAIN STAGE: 12-COLUMN ASYMMETRIC THEATER SHOWCASE + LAUNCHPAD        */}
        {/* ==================================================================== */}
        <main className="flex-1 w-full max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-10 py-3 lg:py-8 flex flex-col justify-center">
          {/* Smart TV Auto-Detection Banner */}
          {onOpenTvPairLobby && isSmartTvBrowser() && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6 p-4 rounded-2xl bg-[#9146FF]/15 border border-[#9146FF]/45 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3"
            >
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-[#9146FF] flex items-center justify-center text-white shrink-0">
                  <Tv className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-display font-bold text-sm text-white">
                    {lang === 'es' ? 'Smart TV detectada' : 'Smart TV detected'}
                  </div>
                  <p className="text-xs text-[#ADADB8]">
                    {lang === 'es'
                      ? 'Muestra el código de 4 dígitos y controla desde tu teléfono.'
                      : 'Display the 4-digit pairing code and control from your phone.'}
                  </p>
                </div>
              </div>
              <PrimaryButton onClick={onOpenTvPairLobby}>
                <Tv className="w-4 h-4" />
                <span>{lang === 'es' ? 'Modo TV' : 'TV Mode'}</span>
              </PrimaryButton>
            </motion.div>
          )}

          <div
            className={
              isDesktop
                ? 'grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-stretch'
                : 'max-w-lg mx-auto w-full space-y-4'
            }
          >
            {/* LEFT: BROADCAST STUDIO SHOWCASE (Desktop 7 Columns) */}
            {isDesktop && (
              <motion.section
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                className="hidden lg:flex lg:col-span-7 rounded-3xl overflow-hidden nc-specular-surface relative flex-col justify-between min-h-[32rem]"
              >
                <div className="relative flex-1 min-h-[19rem] overflow-hidden bg-[#18181D]">
                  {!heroImgFailed && (
                    <img
                      src={twitchBroadcastHeroImg}
                      alt="Sala privada NAIMCINE"
                      referrerPolicy="no-referrer"
                      onError={() => setHeroImgFailed(true)}
                      className="w-full h-full object-cover object-center"
                    />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-[#121217] via-[#121217]/35 to-transparent" />
                  <div className="absolute inset-0 bg-gradient-to-r from-[#121217]/85 via-transparent to-transparent" />
                </div>

                <div className="relative z-10 p-8 -mt-20 space-y-4">
                  <p className="text-xs font-mono uppercase tracking-[0.18em] text-[#C6A2FF]">
                    {lang === 'ca'
                      ? 'EMISSIÓ EN DIRECTE · SINCRONITZACIÓ < 40 MS · MULTIPLATAFORMA'
                      : lang === 'en'
                      ? 'LIVE BROADCAST ROOMS · SUB-40MS SYNC · WEB, ANDROID & GOOGLE TV'
                      : 'EMISIÓN EN DIRECTO · SINCRONIZACIÓN < 40 MS · WEB, ANDROID Y GOOGLE TV'}
                  </p>

                  <h1 className="font-display font-bold text-4xl xl:text-[2.75rem] leading-[1.08] tracking-tight text-white text-balance">
                    {t.heroHeadline}
                  </h1>

                  <p className="text-sm text-[#ADADB8] max-w-2xl leading-relaxed">
                    {lang === 'ca'
                      ? 'Catàleg ampliat amb 14 gèneres, futbol en directe, canals FAST 24/7 i la mateixa experiència a Web, Android APK i Google TV.'
                      : lang === 'en'
                      ? 'Expanded catalog across 14 genres, live football matchboards, 24/7 FAST channels, and unified rooms across Web, Android APK, and Google TV.'
                      : 'Salas de emisión en vivo con chat en directo, 14 géneros, fútbol, canales TDT/FAST 24/7 y la misma interfaz unificada en Web, Android APK y Google TV.'}
                  </p>

                  <div className="pt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-medium text-[#ADADB8] border-t border-white/[0.08]">
                    <span className="flex items-center gap-1.5 text-[#EFEFF1]">
                      <ShieldCheck className="w-4 h-4 text-[#00F593]" />
                      {lang === 'es' ? 'Salas privadas cifradas' : 'Encrypted private rooms'}
                    </span>
                    <span>·</span>
                    <span>Web · Android APK · Google TV</span>
                    <span>·</span>
                    <span className="font-mono text-[#EFEFF1] tabular-nums">14 Géneros · +500 Canales</span>
                  </div>
                </div>
              </motion.section>
            )}

            {/* MOBILE HERO HEADLINE (Compact Android Mobile Native Feel) */}
            {!isDesktop && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.28 }}
                className="text-center space-y-1.5 px-1"
              >
                <p className="text-[11px] font-mono uppercase tracking-[0.16em] text-[#C6A2FF]">
                  {lang === 'es'
                    ? 'Directos · Cine · Fútbol · Google TV'
                    : 'Live · Movies · Football · Google TV'}
                </p>
                <h1 className="font-display font-bold text-2xl sm:text-3xl leading-[1.12] tracking-tight text-white text-balance">
                  {t.heroHeadline}
                </h1>
              </motion.div>
            )}

            {/* RIGHT: ROOM LAUNCHPAD CARD (Desktop 5 Columns / Mobile Full) */}
            <motion.section
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.04, ease: [0.16, 1, 0.3, 1] }}
              className={`${
                isDesktop ? 'lg:col-span-5' : ''
              } rounded-3xl bg-[#141418]/92 backdrop-blur-2xl border border-white/[0.11] shadow-[0_28px_80px_rgba(0,0,0,0.84),inset_0_1px_0_rgba(255,255,255,0.1)] p-5 sm:p-7 flex flex-col justify-between space-y-5`}
            >
              <div className="space-y-4">
                {/* 1. Recent Rooms Quick Strip */}
                {recentRooms.length > 0 && (
                  <div className="space-y-2 pb-3.5 border-b border-white/[0.08]">
                    <div className="flex items-center justify-between text-xs text-[#ADADB8]">
                      <span className="font-semibold flex items-center gap-1.5 text-[#EFEFF1]">
                        <Clock className="w-3.5 h-3.5 text-[#BF94FF]" />
                        {lang === 'es' ? 'Continuar en tus salas' : 'Continue in your rooms'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                      {recentRooms.slice(0, 4).map((room, idx) => (
                        <button
                          key={room.id}
                          type="button"
                          onClick={() => {
                            const profile = buildProfile();
                            if (profile) {
                              onEnterRoom(room.id, profile, room.name);
                            }
                          }}
                          className={`min-h-10 px-3.5 rounded-xl flex items-center gap-2 text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer active:scale-95 transition-all ${
                            idx === 0
                              ? 'bg-gradient-to-b from-[#9E5CFF] to-[#7C2AE8] text-white shadow-[0_6px_18px_rgba(145,70,255,0.34)]'
                              : 'bg-white/[0.07] hover:bg-white/[0.13] border border-white/[0.08] text-[#EFEFF1]'
                          }`}
                        >
                          <Play className="w-3 h-3 fill-current shrink-0" />
                          <span className="truncate max-w-36">{room.name}</span>
                          <ChevronRight className="w-3.5 h-3.5 opacity-60 shrink-0" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* 2. Google Cloud Account / Sign In */}
                {!authUser ? (
                  <button
                    type="button"
                    disabled={authLoading}
                    onClick={() => {
                      triggerHaptic('medium');
                      onSignIn();
                    }}
                    className="w-full min-h-12 px-5 rounded-2xl bg-white hover:bg-zinc-100 active:scale-[0.98] disabled:opacity-60 text-[#07070b] font-display font-bold text-sm flex items-center justify-center gap-3 shadow-[0_10px_28px_rgba(255,255,255,0.14)] transition-all cursor-pointer"
                  >
                    <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        fill="#4285F4"
                        d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.13-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"
                      />
                    </svg>
                    <span>
                      {authLoading
                        ? lang === 'es'
                          ? 'Conectando con Google...'
                          : 'Connecting to Google...'
                        : lang === 'es'
                        ? 'Continuar con Google (Sincronizar Todo)'
                        : 'Continue with Google'}
                    </span>
                  </button>
                ) : (
                  <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/[0.09] space-y-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#9E5CFF] to-[#7C2AE8] text-white flex items-center justify-center font-display font-bold text-sm shrink-0 shadow-[0_6px_16px_rgba(145,70,255,0.3)]">
                          {getMonogramInitials(authUser.displayName || authUser.email || 'NC')}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-white truncate">
                            {authUser.displayName || authUser.email}
                          </div>
                          <div className="text-xs text-emerald-400 truncate">
                            {lang === 'es'
                              ? 'Nube sincronizada · Progreso e historial'
                              : 'Cloud synced · Progress & history'}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={onSignOut}
                        className="px-3 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-xs font-semibold text-zinc-300 cursor-pointer shrink-0"
                      >
                        {lang === 'es' ? 'Salir' : 'Switch'}
                      </button>
                    </div>

                    {entryMode === 'create' && (
                      <PrimaryButton
                        type="button"
                        onClick={() => {
                          const googleName =
                            authUser.displayName?.trim() || name.trim() || 'Cineasta';
                          const profile: StoredProfile = {
                            id: initialProfile.id,
                            name: googleName.slice(0, 24),
                            avatar: initialProfile.avatar || '🎬',
                            color: initialProfile.color || '#9146FF',
                            isCustomized: true,
                          };
                          if (recentRooms.length > 0) {
                            onEnterRoom(recentRooms[0].id, profile, recentRooms[0].name);
                          } else {
                            const code = generateShortRoomCode(4);
                            onEnterRoom(code, profile, `Sala de ${profile.name}`);
                          }
                        }}
                        fullWidth
                        size="lg"
                      >
                        <Play className="w-4 h-4 fill-current shrink-0" />
                        <span>
                          {lang === 'es'
                            ? `Abrir Sala (${authUser.displayName?.split(' ')[0] || 'Directo'})`
                            : 'Enter My Room'}
                        </span>
                        <ArrowRight className="w-4 h-4 shrink-0" />
                      </PrimaryButton>
                    )}
                  </div>
                )}

                {/* 3. Segmented Mode Switcher: Create Room vs Join with Code */}
                <SegmentedControl
                  layoutId="lobby-entry-mode"
                  value={entryMode}
                  onChange={(mode) => {
                    triggerHaptic('light');
                    setEntryMode(mode);
                  }}
                  options={[
                    {
                      id: 'create',
                      label: lang === 'es' ? 'Crear sala nueva' : 'Create room',
                      icon: <Sparkles className="w-3.5 h-3.5" />,
                    },
                    {
                      id: 'join',
                      label: lang === 'es' ? 'Unirse con código' : 'Join with code',
                      icon: <KeyRound className="w-3.5 h-3.5" />,
                    },
                  ]}
                />

                {entryMode === 'create' && !authUser && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <div
                        aria-hidden="true"
                        className="w-11 h-11 rounded-2xl bg-white/[0.06] border border-white/[0.09] flex items-center justify-center font-display font-bold text-sm text-white shrink-0"
                      >
                        {getMonogramInitials(name)}
                      </div>
                      <input
                        id="lobby-nickname"
                        type="text"
                        value={name}
                        onChange={(e) => {
                          setName(e.target.value);
                          if (nameError) setNameError(false);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleCreateRoom();
                          }
                        }}
                        placeholder={t.nicknamePlaceholder}
                        maxLength={24}
                        className={`flex-1 min-w-0 min-h-11 px-4 rounded-2xl bg-white/[0.05] border ${
                          nameError
                            ? 'border-[#EB0400]'
                            : 'border-white/[0.09] focus:border-[#9146FF]'
                        } text-sm font-medium text-white placeholder:text-zinc-500 outline-none transition-colors`}
                      />
                      <IconButton
                        type="button"
                        onClick={handleRandomName}
                        title={lang === 'es' ? 'Generar alias aleatorio' : 'Random alias'}
                        aria-label="Generar alias aleatorio"
                      >
                        <Shuffle className="w-4 h-4" />
                      </IconButton>
                    </div>

                    <PrimaryButton
                      type="button"
                      onClick={handleCreateRoom}
                      fullWidth
                      size="lg"
                    >
                      <Play className="w-4 h-4 fill-current shrink-0" />
                      <span>{lang === 'es' ? 'Entrar y Crear Sala' : t.createRoomBtn}</span>
                      <ArrowRight className="w-4 h-4 shrink-0" />
                    </PrimaryButton>
                  </div>
                )}

                {entryMode === 'join' && (
                  <form onSubmit={handleJoinByCode} className="space-y-3">
                    <div className="flex items-center gap-2">
                      <input
                        id="lobby-room-code"
                        type="text"
                        value={roomCode}
                        onChange={(e) => setRoomCode(e.target.value)}
                        placeholder={t.roomCodePlaceholder}
                        autoFocus
                        className="flex-1 min-w-0 min-h-12 px-4 rounded-2xl bg-white/[0.05] border border-white/[0.1] focus:border-[#9146FF] text-sm text-white placeholder:text-zinc-500 outline-none font-mono uppercase tracking-wider"
                      />
                      <PrimaryButton type="submit" disabled={!roomCode.trim()} size="lg" className="shrink-0">
                        <span>{t.joinBtn}</span>
                        <ArrowRight className="w-4 h-4" />
                      </PrimaryButton>
                    </div>
                  </form>
                )}
              </div>

              {/* 4. Single Clean APK / App Settings Trigger */}
              <div className="pt-3 border-t border-white/[0.07] flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    setShowLobbyOptionsSheet(true);
                  }}
                  className="w-full min-h-11 px-4 rounded-2xl bg-white/[0.04] hover:bg-white/[0.09] border border-white/[0.08] text-xs font-semibold text-zinc-200 flex items-center justify-between gap-2 cursor-pointer transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <Download className="w-4 h-4 text-[#BF94FF]" />
                    <span>
                      {lang === 'es'
                        ? 'Descargar APK Android / Google TV e Idioma'
                        : 'Download Android / Google TV APK & Settings'}
                    </span>
                  </span>
                  <ChevronRight className="w-4 h-4 text-zinc-400" />
                </button>
              </div>
            </motion.section>
          </div>

          {/* 4-COLUMN DESKTOP CAPABILITY PROOF STRIP */}
          {isDesktop && (
            <section className="hidden lg:grid grid-cols-4 gap-4 mt-8">
              {featureHighlights.map((item, idx) => {
                const Icon = item.icon;
                return (
                  <motion.div
                    key={item.title}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: 0.08 + idx * 0.04 }}
                    className="p-5 rounded-2xl nc-specular-surface hover:border-[#9146FF]/45 hover:-translate-y-0.5 transition-all space-y-2"
                  >
                    <Icon className="w-5 h-5 text-[#BF94FF]" />
                    <h2 className="font-display font-bold text-sm text-white">{item.title}</h2>
                    <p className="text-xs text-[#ADADB8] leading-relaxed">{item.desc}</p>
                  </motion.div>
                );
              })}
            </section>
          )}
        </main>

        <footer className="w-full max-w-[1440px] mx-auto px-6 py-4 flex flex-wrap items-center justify-center gap-4 text-xs text-zinc-500">
          <span>NAIM CINE · Arquitectura sincronizada multiplataforma</span>
          {onOpenAdsPage && (
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                onOpenAdsPage();
              }}
              className="hover:text-zinc-300 transition-colors cursor-pointer py-1 px-2"
            >
              {lang === 'ca' ? 'Sobre la plataforma' : lang === 'en' ? 'About' : 'Sobre la plataforma'}
            </button>
          )}
        </footer>

        {/* LOBBY SETTINGS & APK BOTTOM SHEET */}
        <BottomSheet
          isOpen={showLobbyOptionsSheet}
          onClose={() => setShowLobbyOptionsSheet(false)}
          title={lang === 'es' ? 'Ajustes, Cuenta y App APK' : 'Settings, Account & APK'}
          subtitle={
            lang === 'es'
              ? 'Sincronización en la nube, modo de vista e instalación Android / Google TV'
              : 'Cloud sync, view mode, and Android / Google TV installation'
          }
          icon={<Settings className="w-5 h-5" />}
        >
          <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08] space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    authUser
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                      : 'bg-white/[0.06] text-zinc-300'
                  }`}
                >
                  <Cloud className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-bold text-white truncate">
                    {authUser
                      ? authUser.displayName || authUser.email
                      : lang === 'es'
                      ? 'Sincronización con Google'
                      : 'Google Cloud Sync'}
                  </div>
                  <div className="text-xs text-zinc-400 truncate">
                    {authUser
                      ? lang === 'es'
                        ? 'Historial, minuto exacto y salas guardadas'
                        : 'History, resume points & saved rooms active'
                      : lang === 'es'
                      ? 'Guarda tu progreso y salas en todos tus dispositivos'
                      : 'Save your watch progress across devices'}
                  </div>
                </div>
              </div>

              {authUser ? (
                <SecondaryButton onClick={onSignOut}>
                  <LogOut className="w-4 h-4 text-rose-400" />
                  <span>{lang === 'es' ? 'Salir' : 'Sign out'}</span>
                </SecondaryButton>
              ) : (
                <PrimaryButton onClick={onSignIn} disabled={authLoading}>
                  <LogIn className="w-4 h-4" />
                  <span>{lang === 'es' ? 'Conectar' : 'Sign in'}</span>
                </PrimaryButton>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <SecondaryButton
              onClick={() => {
                triggerHaptic('light');
                onToggleViewMode();
              }}
              fullWidth
            >
              {effectiveView === 'desktop' ? (
                <>
                  <Smartphone className="w-4 h-4 text-[#BF94FF]" />
                  <span>{lang === 'es' ? 'Vista Móvil' : 'Mobile View'}</span>
                </>
              ) : (
                <>
                  <Monitor className="w-4 h-4 text-[#BF94FF]" />
                  <span>{lang === 'es' ? 'Vista PC' : 'Desktop View'}</span>
                </>
              )}
            </SecondaryButton>

            <SecondaryButton
              onClick={() => {
                triggerHaptic('light');
                onChangeLang(lang === 'es' ? 'ca' : lang === 'ca' ? 'en' : 'es');
              }}
              fullWidth
            >
              <Globe className="w-4 h-4 text-sky-400" />
              <span>
                {lang === 'es' ? 'Idioma: ES' : lang === 'ca' ? 'Idioma: CA' : 'Lang: EN'}
              </span>
            </SecondaryButton>
          </div>

          <div className="pt-2 border-t border-white/[0.07]">
            <div className="flex items-center gap-2 text-xs font-bold text-zinc-300 mb-2.5">
              <Download className="w-4 h-4 text-[#BF94FF]" />
              <span>
                {lang === 'es'
                  ? 'Instalar Aplicación (APK Android / Google TV / iOS)'
                  : 'Install App (Android APK / Google TV / iOS)'}
              </span>
            </div>
            <PWAInstallLandingCard lang={lang} isDesktop={isDesktop} />
          </div>
        </BottomSheet>
      </div>
    </div>
  );
};

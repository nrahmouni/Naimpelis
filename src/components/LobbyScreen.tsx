import React, { useEffect, useState } from 'react';
import { User } from 'firebase/auth';
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
  const [showJoinDrawer, setShowJoinDrawer] = useState(false);

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
            title: 'Smart TV 10-Foot',
            desc: 'Emparellament instantani amb codi /tv i trackpad tàctil al mòbil.',
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
            title: '10-Foot Smart TV',
            desc: 'Instant 4-digit TV pairing with haptic mobile trackpad remote.',
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
            title: 'Receptor Smart TV',
            desc: 'Empareja cualquier televisor en /tv con mando táctil háptico desde el móvil.',
          },
        ];

  return (
    <div className="min-h-dvh w-full bg-[#0E0E10] text-[#EFEFF1] overflow-x-clip relative">
      {/* Subtle Ambient Broadcast Lighting */}
      <div className="pointer-events-none fixed inset-x-0 top-0 h-[36rem] overflow-hidden">
        {!heroImgFailed && (
          <img
            src={twitchBroadcastHeroImg}
            alt=""
            aria-hidden="true"
            referrerPolicy="no-referrer"
            onError={() => setHeroImgFailed(true)}
            className="w-full h-full object-cover object-center opacity-[0.18] scale-105"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-[#0E0E10]/45 via-[#0E0E10]/85 to-[#0E0E10]" />
        <div className="absolute -top-40 left-1/3 w-[42rem] h-72 rounded-full bg-[#9146FF]/16 blur-[140px]" />
      </div>

      <div
        className={`@container min-h-dvh w-full flex flex-col pt-safe pb-safe relative z-10 ${
          isFramedMobileOnPc
            ? 'max-w-[27rem] mx-auto border-x border-white/[0.08] bg-[#0E0E10] shadow-[0_0_120px_rgba(0,0,0,0.96)]'
            : ''
        }`}
      >
        {/* ==================================================================== */}
        {/* 3-ZONE TOP NAVIGATION HEADER                                         */}
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
              size={isDesktop ? 40 : 34}
              className="shrink-0 shadow-[0_0_24px_rgba(145,70,255,0.35)] group-hover:scale-105 transition-transform"
            />
            <span className="font-display font-bold text-base sm:text-lg tracking-[0.14em] text-white">
              NAIM <span className="text-[#9146FF]">CINE</span>
            </span>
          </button>

          {isDesktop && (
            <nav className="hidden lg:flex items-center gap-7 text-sm font-medium text-zinc-400">
              {onOpenTvPairLobby && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    onOpenTvPairLobby();
                  }}
                  className="hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5"
                >
                  <Tv className="w-4 h-4 text-[#BF94FF]" />
                  <span>{lang === 'es' ? 'Receptor Smart TV' : 'Smart TV Receiver'}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  onChangeLang(lang === 'es' ? 'ca' : lang === 'ca' ? 'en' : 'es');
                }}
                className="hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5"
              >
                <Globe className="w-4 h-4 text-zinc-400" />
                <span>{lang === 'es' ? 'ES' : lang === 'ca' ? 'CA' : 'EN'}</span>
              </button>
              {onOpenAdsPage && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    onOpenAdsPage();
                  }}
                  className="hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {lang === 'ca' ? 'Plataforma' : lang === 'en' ? 'Platform' : 'Plataforma'}
                </button>
              )}
            </nav>
          )}

          <div className="flex items-center gap-2 shrink-0">
            {onOpenTvPairLobby && (
              <SecondaryButton
                type="button"
                onClick={() => {
                  triggerHaptic('medium');
                  onOpenTvPairLobby();
                }}
                className="!px-3.5 lg:hidden"
                title="Modo Smart TV (/tv)"
              >
                <Tv className="w-4 h-4 text-[#BF94FF] shrink-0" />
                <span>Smart TV</span>
              </SecondaryButton>
            )}

            <IconButton
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setShowLobbyOptionsSheet(true);
              }}
              aria-label="Ajustes, cuenta y descargas"
              title="Ajustes, cuenta Google, idioma y APK"
            >
              <Settings className="w-5 h-5" />
            </IconButton>
          </div>
        </header>

        {/* ==================================================================== */}
        {/* MAIN STAGE: 12-COLUMN ASYMMETRIC THEATER SHOWCASE + LAUNCHPAD        */}
        {/* ==================================================================== */}
        <main className="flex-1 w-full max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-10 py-4 lg:py-8 flex flex-col justify-center">
          {/* Smart TV Auto-Detection Banner */}
          {onOpenTvPairLobby && isSmartTvBrowser() && (
            <div className="mb-6 p-4 rounded-2xl bg-[#9146FF]/15 border border-[#9146FF]/45 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
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
            </div>
          )}

          <div
            className={
              isDesktop
                ? 'grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-stretch'
                : 'max-w-lg mx-auto w-full space-y-5'
            }
          >
            {/* LEFT: BROADCAST STUDIO SHOWCASE (Desktop 7 Columns) */}
            {isDesktop && (
              <section className="hidden lg:flex lg:col-span-7 rounded-3xl overflow-hidden border border-white/[0.08] bg-[#18181B] relative flex-col justify-between shadow-[0_28px_80px_rgba(0,0,0,0.75)] min-h-[32rem]">
                <div className="relative flex-1 min-h-[19rem] overflow-hidden bg-[#1F1F23]">
                  {!heroImgFailed && (
                    <img
                      src={twitchBroadcastHeroImg}
                      alt="Sala privada NAIMCINE"
                      referrerPolicy="no-referrer"
                      onError={() => setHeroImgFailed(true)}
                      className="w-full h-full object-cover object-center"
                    />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-[#18181B] via-[#18181B]/35 to-transparent" />
                  <div className="absolute inset-0 bg-gradient-to-r from-[#18181B]/80 via-transparent to-transparent" />
                </div>

                <div className="relative z-10 p-8 -mt-20 space-y-4">
                  <p className="text-xs font-mono uppercase tracking-[0.18em] text-[#BF94FF]">
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

                  <div className="pt-2 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-medium text-[#ADADB8] border-t border-white/[0.07]">
                    <span className="flex items-center gap-1.5 text-[#EFEFF1]">
                      <ShieldCheck className="w-4 h-4 text-[#00F593]" />
                      {lang === 'es' ? 'Salas privadas cifradas' : 'Encrypted private rooms'}
                    </span>
                    <span>·</span>
                    <span>Web · Android APK · Google TV / Tizen</span>
                    <span>·</span>
                    <span className="font-mono text-[#EFEFF1] tabular-nums">14 Géneros · +500 Canales</span>
                  </div>
                </div>
              </section>
            )}

            {/* MOBILE HERO HEADLINE (Compact Single-Screen Fit) */}
            {!isDesktop && (
              <div className="text-center space-y-1.5 px-1">
                <p className="text-[11px] font-mono uppercase tracking-[0.16em] text-[#BF94FF]">
                  {lang === 'es'
                    ? 'Directos · Cine · Fútbol · Google TV'
                    : 'Live · Movies · Football · Google TV'}
                </p>
                <h1 className="font-display font-bold text-2xl sm:text-3xl leading-[1.12] tracking-tight text-white text-balance">
                  {t.heroHeadline}
                </h1>
              </div>
            )}

            {/* RIGHT: ROOM LAUNCHPAD CARD (Desktop 5 Columns / Mobile Full) */}
            <section
              className={`${
                isDesktop ? 'lg:col-span-5' : ''
              } rounded-3xl bg-[#18181B]/95 backdrop-blur-2xl border border-white/[0.09] shadow-[0_28px_80px_rgba(0,0,0,0.8)] p-5 sm:p-7 flex flex-col justify-between space-y-5`}
            >
              <div className="space-y-4">
                {/* 1. Recent Rooms Quick Strip */}
                {recentRooms.length > 0 && (
                  <div className="space-y-2 pb-3.5 border-b border-white/[0.07]">
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
                              ? 'bg-[#9146FF] hover:bg-[#772CE8] text-white shadow-md'
                              : 'bg-[#26262C] hover:bg-white/[0.14] text-[#EFEFF1]'
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
                    className="w-full min-h-12 px-5 rounded-2xl bg-white hover:bg-zinc-100 active:scale-[0.98] disabled:opacity-60 text-[#07070b] font-display font-bold text-sm flex items-center justify-center gap-3 shadow-[0_10px_28px_rgba(255,255,255,0.12)] transition-all cursor-pointer"
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
                  <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/[0.07] space-y-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-white text-[#07070b] flex items-center justify-center font-display font-bold text-sm shrink-0">
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
                  </div>
                )}

                {/* 3. Fast Guest Entry */}
                {!authUser && (
                  <div className="space-y-3">
                    <div className="relative flex items-center py-0.5">
                      <div className="flex-grow border-t border-white/[0.07]" />
                      <span className="shrink-0 px-3 text-xs font-medium text-zinc-500">
                        {lang === 'es' ? 'o crea una sala al instante' : 'or launch an instant room'}
                      </span>
                      <div className="flex-grow border-t border-white/[0.07]" />
                    </div>

                    <div className="flex items-center gap-2">
                      <div
                        aria-hidden="true"
                        className="w-11 h-11 rounded-2xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center font-display font-bold text-sm text-white shrink-0"
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
                        className={`flex-1 min-w-0 min-h-11 px-4 rounded-2xl bg-[#26262C] border ${
                          nameError
                            ? 'border-[#EB0400]'
                            : 'border-white/[0.09] focus:border-[#9146FF]'
                        } text-sm font-medium text-white placeholder:text-[#ADADB8] outline-none transition-colors`}
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
                      <span>{lang === 'es' ? 'Crear Sala Privada' : t.createRoomBtn}</span>
                      <ArrowRight className="w-4 h-4 shrink-0" />
                    </PrimaryButton>
                  </div>
                )}
              </div>

              {/* 4. Secondary Actions: Join by Code & App Downloads */}
              <div className="pt-3 border-t border-white/[0.07]">
                {!showJoinDrawer ? (
                  <div className="grid grid-cols-2 gap-2.5">
                    <SecondaryButton
                      type="button"
                      onClick={() => setShowJoinDrawer(true)}
                      fullWidth
                    >
                      <span>{lang === 'es' ? 'Unirse con código' : 'Join with code'}</span>
                    </SecondaryButton>

                    <SecondaryButton
                      type="button"
                      onClick={() => setShowLobbyOptionsSheet(true)}
                      fullWidth
                    >
                      <Download className="w-4 h-4 text-zinc-300" />
                      <span className="truncate">
                        {lang === 'es' ? 'APK y Ajustes' : 'Apps & Settings'}
                      </span>
                    </SecondaryButton>
                  </div>
                ) : (
                  <form onSubmit={handleJoinByCode} className="space-y-2 animate-fade-in">
                    <div className="flex items-center justify-between">
                      <label htmlFor="lobby-room-code" className="text-xs font-semibold text-zinc-300">
                        {t.joinRoomLabel}
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowJoinDrawer(false)}
                        className="text-xs text-zinc-400 hover:text-white cursor-pointer"
                      >
                        {lang === 'es' ? 'Cerrar' : 'Close'}
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        id="lobby-room-code"
                        type="text"
                        value={roomCode}
                        onChange={(e) => setRoomCode(e.target.value)}
                        placeholder={t.roomCodePlaceholder}
                        autoFocus
                        className="flex-1 min-w-0 min-h-11 px-4 rounded-2xl bg-white/[0.05] border border-white/[0.1] focus:border-white/30 text-sm text-white placeholder:text-zinc-500 outline-none font-mono"
                      />
                      <PrimaryButton type="submit" disabled={!roomCode.trim()} className="shrink-0">
                        <span>{t.joinBtn}</span>
                        <ArrowRight className="w-4 h-4" />
                      </PrimaryButton>
                    </div>
                  </form>
                )}
              </div>
            </section>
          </div>

          {/* 4-COLUMN DESKTOP CAPABILITY PROOF STRIP */}
          {isDesktop && (
            <section className="hidden lg:grid grid-cols-4 gap-4 mt-8">
              {featureHighlights.map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.title}
                    className="p-5 rounded-2xl bg-[#18181B] border border-white/[0.08] hover:border-[#9146FF]/45 transition-colors space-y-2"
                  >
                    <Icon className="w-5 h-5 text-[#BF94FF]" />
                    <h2 className="font-display font-bold text-sm text-white">{item.title}</h2>
                    <p className="text-xs text-[#ADADB8] leading-relaxed">{item.desc}</p>
                  </div>
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
          title={lang === 'es' ? 'Ajustes, Cuenta y App' : 'Settings, Account & App'}
          subtitle={
            lang === 'es'
              ? 'Sincronización en la nube, modo de vista e instalación APK'
              : 'Cloud sync, view mode, and APK installation'
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
                onChangeLang(lang === 'es' ? 'en' : 'es');
              }}
              fullWidth
            >
              <Globe className="w-4 h-4 text-sky-400" />
              <span>{lang === 'es' ? 'Idioma: Español' : 'Language: English'}</span>
            </SecondaryButton>
          </div>

          {onOpenTvPairLobby && (
            <SecondaryButton
              onClick={() => {
                setShowLobbyOptionsSheet(false);
                onOpenTvPairLobby();
              }}
              fullWidth
            >
              <Tv className="w-4 h-4 text-[#BF94FF]" />
              <span>
                {lang === 'es'
                  ? 'Abrir Pantalla Receptora Smart TV (/tv)'
                  : 'Open Smart TV Receiver Screen (/tv)'}
              </span>
            </SecondaryButton>
          )}

          <div className="pt-2 border-t border-white/[0.07]">
            <div className="flex items-center gap-2 text-xs font-bold text-zinc-300 mb-2.5">
              <Download className="w-4 h-4 text-[#BF94FF]" />
              <span>
                {lang === 'es' ? 'Instalar Aplicación (APK / Móvil / Google TV)' : 'Install App (APK / Mobile / Google TV)'}
              </span>
            </div>
            <PWAInstallLandingCard lang={lang} isDesktop={isDesktop} />
          </div>
        </BottomSheet>
      </div>
    </div>
  );
};

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
  Youtube,
  Cloud,
  LogIn,
  LogOut,
  Settings,
  Download,
  Monitor,
  Smartphone,
  Sparkles,
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
import {
  EffectiveViewMode,
  getMonogramInitials,
} from './MobileViewportGuard';
import { PWAInstallLandingCard } from './PWAInstallPrompt';
import {
  PrimaryButton,
  SecondaryButton,
  IconButton,
  BottomSheet,
} from './ui/DesignSystem';
import lobbyHeroImg from '../assets/images/cinema_hero_lobby_1794353709142.jpg';

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
      color: initialProfile.color || '#E11D48',
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

  return (
    <div className="min-h-dvh w-full bg-[var(--nc-bg-canvas)] text-[var(--nc-text-primary)] overflow-x-clip">
      <div
        className={`@container min-h-dvh w-full flex flex-col pt-safe pb-safe relative ${
          isFramedMobileOnPc
            ? 'max-w-[27rem] mx-auto border-x border-white/[0.08] bg-[var(--nc-bg-canvas)] shadow-[0_0_120px_rgba(0,0,0,0.96)]'
            : ''
        }`}
      >
        {/* Deep OLED Atmospheric Backdrop */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[38rem] overflow-hidden">
          {!heroImgFailed && (
            <img
              src={lobbyHeroImg}
              alt=""
              aria-hidden="true"
              referrerPolicy="no-referrer"
              onError={() => setHeroImgFailed(true)}
              className="w-full h-full object-cover object-center opacity-[0.24] scale-105"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-[#050507]/60 via-[#050507]/90 to-[#050507]" />
          <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-full max-w-2xl h-64 rounded-full bg-[#E11D48]/15 blur-[120px]" />
        </div>

        {/* ==================================================================== */}
        {/* ZERO-OVERLAP HEADER: Brand + Max 2 Clean Actions + Settings Sheet    */}
        {/* ==================================================================== */}
        <header
          className={`relative z-20 w-full max-w-6xl mx-auto ${
            isDesktop ? 'px-8 h-20' : 'px-4 h-16'
          } flex items-center justify-between gap-3 shrink-0`}
        >
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onReplayIntro();
            }}
            className="flex items-center gap-2.5 min-w-0 cursor-pointer text-left group py-1"
            title={lang === 'es' ? 'Ver Intro Cinema NAIM CINE' : 'Play NAIM CINE Cinema Intro'}
          >
            <NaimBrandLogo
              size={isDesktop ? 38 : 34}
              className="shrink-0 shadow-[0_0_24px_rgba(225,29,72,0.3)] group-hover:scale-105 transition-transform"
            />
            <span className="font-display font-bold text-base sm:text-lg tracking-[0.12em] text-white whitespace-nowrap">
              NAIM <span className="text-[#E11D48]">CINE</span>
            </span>
          </button>

          {/* Max 2 buttons on right to guarantee zero overlap on any mobile width */}
          <div className="flex items-center gap-2 shrink-0">
            {onOpenTvPairLobby && (
              <SecondaryButton
                type="button"
                onClick={() => {
                  triggerHaptic('medium');
                  onOpenTvPairLobby();
                }}
                className="!px-3.5"
                title="Modo Smart TV (/tv)"
              >
                <Tv className="w-4 h-4 text-[#E11D48] shrink-0" />
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
        {/* HERO LAUNCH CONSOLE (1-Screen Zero-Scroll Mobile Design)             */}
        {/* ==================================================================== */}
        <section
          className={`relative z-10 w-full max-w-xl mx-auto ${
            isDesktop ? 'px-6 pt-6 pb-12' : 'px-4 pt-2 pb-6'
          }`}
        >
          <div className="text-center space-y-2 mb-4 sm:mb-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.05] text-xs font-semibold tracking-wide text-zinc-300">
              <Sparkles className="w-3.5 h-3.5 text-[#E11D48]" />
              <span>
                {lang === 'es'
                  ? 'Cine · Series · Fútbol · Smart TV'
                  : 'Movies · Series · Live Sports · Smart TV'}
              </span>
            </div>

            <h1
              className={`font-display font-bold ${
                isDesktop ? 'text-4xl sm:text-5xl' : 'text-2xl sm:text-3xl'
              } leading-[1.12] tracking-tight text-white text-balance`}
            >
              {t.heroHeadline}
            </h1>
          </div>

          {/* Smart TV Auto-Detection Banner */}
          {onOpenTvPairLobby && isSmartTvBrowser() && (
            <div className="mb-4 p-4 rounded-3xl bg-[#E11D48]/15 border border-[#E11D48]/40 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shadow-[0_20px_50px_rgba(225,29,72,0.25)]">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-[#E11D48] flex items-center justify-center text-white shrink-0">
                  <Tv className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-display font-bold text-sm text-white">
                    {lang === 'es' ? 'Smart TV detectada' : 'Smart TV detected'}
                  </div>
                  <p className="text-xs text-zinc-300">
                    {lang === 'es'
                      ? 'Muestra el código de 4 dígitos y controla desde el móvil.'
                      : 'Display the 4-digit code and control from your phone.'}
                  </p>
                </div>
              </div>
              <PrimaryButton onClick={onOpenTvPairLobby}>
                <Tv className="w-4 h-4" />
                <span>{lang === 'es' ? 'Modo TV' : 'TV Mode'}</span>
              </PrimaryButton>
            </div>
          )}

          {/* Main OLED Cinema Launch Card */}
          <div className="rounded-3xl bg-[#0E0F16]/90 backdrop-blur-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.09),0_28px_80px_rgba(0,0,0,0.85)] p-5 sm:p-6 space-y-4">
            {/* 0. INSTANT 1-TAP RECENT ROOMS AT THE VERY TOP */}
            {recentRooms.length > 0 && (
              <div className="space-y-2 pb-3 border-b border-white/[0.06]">
                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <span className="font-semibold flex items-center gap-1.5 text-zinc-300">
                    <Clock className="w-3.5 h-3.5 text-[#E11D48]" />
                    {lang === 'es' ? 'Entrar directo a tus salas:' : 'Jump back into your rooms:'}
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
                      className={`min-h-10 px-3.5 rounded-2xl flex items-center gap-2 text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer active:scale-95 transition-all ${
                        idx === 0
                          ? 'bg-white text-[#050508] shadow-md'
                          : 'bg-white/[0.06] hover:bg-white/[0.11] text-zinc-200'
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

            {/* 1. TOP PRIMARY OPTION: GOOGLE SIGN-IN OR SYNCED ACCOUNT */}
            {!authUser ? (
              <button
                type="button"
                disabled={authLoading}
                onClick={() => {
                  triggerHaptic('medium');
                  onSignIn();
                }}
                className="w-full min-h-13 px-5 rounded-2xl bg-white hover:bg-zinc-100 active:scale-[0.98] disabled:opacity-60 text-[#050508] font-display font-bold text-sm flex items-center justify-center gap-3 shadow-[0_12px_32px_rgba(255,255,255,0.14)] transition-all cursor-pointer"
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
              <div className="p-3.5 rounded-2xl bg-white/[0.04] space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-white flex items-center justify-center shrink-0 shadow">
                      <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
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
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-white truncate">
                        {authUser.displayName || authUser.email}
                      </div>
                      <div className="text-xs text-emerald-400 truncate">
                        {lang === 'es'
                          ? 'Cuenta sincronizada ✓'
                          : 'Account synced ✓'}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={onSignOut}
                    className="px-3 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-xs font-semibold text-zinc-300 cursor-pointer shrink-0"
                  >
                    {lang === 'es' ? 'Cambiar' : 'Switch'}
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
                      color: initialProfile.color || '#E11D48',
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
                      ? `Entrar a mi Sala (${
                          authUser.displayName?.split(' ')[0] || 'Directo'
                        })`
                      : 'Enter My Room'}
                  </span>
                  <ArrowRight className="w-4 h-4 shrink-0" />
                </PrimaryButton>
              </div>
            )}

            {/* 2. FAST ALIAS ENTRY (Only shown prominently if not signed in, or compact) */}
            {!authUser && (
              <>
                <div className="relative flex items-center py-0.5">
                  <div className="flex-grow border-t border-white/[0.06]" />
                  <span className="shrink-0 px-3 text-xs font-medium text-zinc-500">
                    {lang === 'es' ? 'o entra rápido con tu alias' : 'or quick guest entry'}
                  </span>
                  <div className="flex-grow border-t border-white/[0.06]" />
                </div>

                <div className="space-y-2.5">
                  <div className="flex items-center gap-2">
                    <div
                      aria-hidden="true"
                      className="w-11 h-11 rounded-2xl bg-white/[0.06] flex items-center justify-center font-display font-bold text-sm text-white shrink-0"
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
                          ? 'border-[#E11D48]'
                          : 'border-white/[0.08] focus:border-white/30'
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
                    <span>
                      {lang === 'es' ? 'Entrar a la Sala' : t.createRoomBtn}
                    </span>
                    <ArrowRight className="w-4 h-4 shrink-0" />
                  </PrimaryButton>
                </div>
              </>
            )}

            {/* Secondary Actions: Join by Code or Settings/APK */}
            <div className="pt-2 border-t border-white/[0.06]">
              {!showJoinDrawer ? (
                <div className="grid grid-cols-2 gap-2">
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
                      {lang === 'es' ? 'App y Ajustes' : 'App & Settings'}
                    </span>
                  </SecondaryButton>
                </div>
              ) : (
                <form
                  onSubmit={handleJoinByCode}
                  className="space-y-2 animate-fade-in"
                >
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="lobby-room-code"
                      className="text-xs font-semibold text-zinc-300"
                    >
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
                    <PrimaryButton
                      type="submit"
                      disabled={!roomCode.trim()}
                      className="shrink-0"
                    >
                      <span>{t.joinBtn}</span>
                      <ArrowRight className="w-4 h-4" />
                    </PrimaryButton>
                  </div>
                </form>
              )}
            </div>
          </div>
        </section>

        <footer className="pt-4 pb-2 flex flex-wrap items-center justify-center gap-3 text-[11px] text-zinc-500">
          <span>NAIM CINE · Streaming sincronizado</span>
          {onOpenAdsPage && (
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                onOpenAdsPage();
              }}
              className="hover:text-zinc-300 transition-colors cursor-pointer py-1 px-2"
            >
              {lang === 'ca' ? 'Sobre la plataforma' : lang === 'en' ? 'About' : 'Sobre la app'}
            </button>
          )}
        </footer>

        {/* ==================================================================== */}
        {/* PROGRESSIVE DISCLOSURE: LOBBY SETTINGS & APK BOTTOM SHEET            */}
        {/* ==================================================================== */}
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
          {/* 1. Cloud Account */}
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

          {/* 2. View Mode & Language */}
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
                  <Smartphone className="w-4 h-4 text-[#E11D48]" />
                  <span>{lang === 'es' ? 'Vista Móvil' : 'Mobile View'}</span>
                </>
              ) : (
                <>
                  <Monitor className="w-4 h-4 text-[#E11D48]" />
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

          {/* 3. Smart TV Mode Direct Launch */}
          {onOpenTvPairLobby && (
            <SecondaryButton
              onClick={() => {
                setShowLobbyOptionsSheet(false);
                onOpenTvPairLobby();
              }}
              fullWidth
            >
              <Tv className="w-4 h-4 text-[#E11D48]" />
              <span>
                {lang === 'es'
                  ? 'Abrir Pantalla Receptora Smart TV (/tv)'
                  : 'Open Smart TV Receiver Screen (/tv)'}
              </span>
            </SecondaryButton>
          )}

          {/* 4. Native APK / App Installation Card */}
          <div className="pt-2 border-t border-white/[0.07]">
            <div className="flex items-center gap-2 text-xs font-bold text-zinc-300 mb-2.5">
              <Download className="w-4 h-4 text-[#E11D48]" />
              <span>
                {lang === 'es' ? 'Instalar Aplicación (APK / Móvil)' : 'Install App (APK / Mobile)'}
              </span>
            </div>
            <PWAInstallLandingCard lang={lang} isDesktop={isDesktop} />
          </div>
        </BottomSheet>
      </div>
    </div>
  );
};

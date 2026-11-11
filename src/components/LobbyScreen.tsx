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
    <div className="min-h-full w-full bg-[#050507] text-[#F5F5F7] overflow-x-clip">
      <div
        className={`@container min-h-full w-full flex flex-col pt-safe pb-safe relative ${
          isFramedMobileOnPc
            ? 'max-w-[27rem] mx-auto border-x border-white/[0.08] bg-[#050507] shadow-[0_0_120px_rgba(0,0,0,0.96)]'
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
        {/* HERO LAUNCH CONSOLE (Clean, Tactile, Progressive Disclosure)         */}
        {/* ==================================================================== */}
        <section
          className={`relative z-10 w-full max-w-2xl mx-auto ${
            isDesktop ? 'px-6 pt-8 pb-14' : 'px-4 pt-3 pb-10'
          }`}
        >
          <div className="text-center space-y-2.5 mb-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.04] border border-white/[0.08] text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-300">
              <Sparkles className="w-3 h-3 text-[#E11D48]" />
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

            <p className="text-xs sm:text-sm text-zinc-400 max-w-md mx-auto leading-relaxed">
              {lang === 'es'
                ? 'Entra con tu alias, invita con un toque y disfruta en sincronía milimétrica.'
                : 'Enter your alias, invite with one tap, and watch in frame-accurate sync.'}
            </p>
          </div>

          {/* Smart TV Auto-Detection Banner */}
          {onOpenTvPairLobby && isSmartTvBrowser() && (
            <div className="mb-5 p-4 rounded-3xl bg-[#E11D48]/15 border border-[#E11D48]/50 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3.5 shadow-[0_20px_50px_rgba(225,29,72,0.25)]">
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

          {/* Main Glass Launch Card */}
          <div className="rounded-[28px] glass-panel shadow-[0_28px_80px_rgba(0,0,0,0.85)] p-5 sm:p-7 space-y-5">
            {/* Alias Input */}
            <div className="space-y-2">
              <label
                htmlFor="lobby-nickname"
                className="block text-xs font-semibold text-zinc-300"
              >
                {t.nicknameLabel}
              </label>
              <div className="flex items-center gap-2">
                <div
                  aria-hidden="true"
                  className="w-12 h-12 rounded-2xl bg-[#E11D48]/15 border border-[#E11D48]/35 flex items-center justify-center font-display font-bold text-sm text-white shrink-0"
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
                  className={`flex-1 min-w-0 min-h-[48px] px-4 rounded-2xl bg-white/[0.04] border ${
                    nameError
                      ? 'border-[#E11D48]'
                      : 'border-white/[0.1] focus:border-[#E11D48]'
                  } text-base sm:text-sm font-medium text-white placeholder:text-zinc-500 outline-none transition-colors`}
                />
                <IconButton
                  type="button"
                  onClick={handleRandomName}
                  title={lang === 'es' ? 'Generar alias aleatorio' : 'Random alias'}
                  aria-label="Generar alias aleatorio"
                  className="w-12 h-12"
                >
                  <Shuffle className="w-4 h-4" />
                </IconButton>
              </div>
            </div>

            {/* Primary CTA: Create Room */}
            <PrimaryButton
              type="button"
              onClick={handleCreateRoom}
              fullWidth
              size="lg"
            >
              <Play className="w-4 h-4 fill-current shrink-0" />
              <span>{t.createRoomBtn}</span>
              <ArrowRight className="w-4 h-4 shrink-0" />
            </PrimaryButton>

            {/* Secondary Actions (Progressive Disclosure: Join by code or Recent Room) */}
            <div className="pt-3 border-t border-white/[0.07] space-y-3">
              {!showJoinDrawer ? (
                <div className="grid grid-cols-2 gap-2.5">
                  <SecondaryButton
                    type="button"
                    onClick={() => setShowJoinDrawer(true)}
                    fullWidth
                  >
                    <span>{lang === 'es' ? 'Tengo un código' : 'Join with code'}</span>
                  </SecondaryButton>

                  <SecondaryButton
                    type="button"
                    onClick={() => setShowLobbyOptionsSheet(true)}
                    fullWidth
                  >
                    <Cloud className={`w-4 h-4 ${authUser ? 'text-emerald-400' : 'text-zinc-400'}`} />
                    <span className="truncate">
                      {authUser
                        ? authUser.displayName?.split(' ')[0] || 'Conectado'
                        : lang === 'es'
                        ? 'Cuenta y APK'
                        : 'Account & App'}
                    </span>
                  </SecondaryButton>
                </div>
              ) : (
                <form
                  onSubmit={handleJoinByCode}
                  className="space-y-2.5 animate-fade-in"
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
                      className="flex-1 min-w-0 min-h-[46px] px-4 rounded-2xl bg-white/[0.05] border border-white/[0.1] focus:border-[#E11D48] text-base sm:text-sm text-white placeholder:text-zinc-500 outline-none font-mono"
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

              {/* Fluid Horizontal Pills for Recent Rooms */}
              {recentRooms.length > 0 && (
                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pt-1">
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-zinc-500 shrink-0">
                    <Clock className="w-3.5 h-3.5" />
                    {lang === 'es' ? 'Recientes:' : 'Recent:'}
                  </span>
                  {recentRooms.slice(0, 4).map((room) => (
                    <button
                      key={room.id}
                      type="button"
                      onClick={() => {
                        const profile = buildProfile();
                        if (profile) {
                          onEnterRoom(room.id, profile, room.name);
                        }
                      }}
                      className="min-h-[38px] px-3.5 rounded-full bg-white/[0.04] hover:bg-white/[0.09] border border-white/[0.08] flex items-center gap-1.5 text-xs font-medium text-zinc-200 whitespace-nowrap shrink-0 cursor-pointer active:scale-95 transition-all"
                    >
                      <span className="truncate max-w-36">{room.name}</span>
                      <ChevronRight className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Compact Visual Feature Pills (Replaces Long Manual Text) */}
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#E11D48]/15 flex items-center justify-center text-[#E11D48] shrink-0">
                <Film className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-white truncate">Cine 1080p</div>
                <div className="text-[10px] text-zinc-400 truncate">Español y VOSE</div>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-sky-500/15 flex items-center justify-center text-sky-400 shrink-0">
                <Tv className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-white truncate">Series HD</div>
                <div className="text-[10px] text-zinc-400 truncate">Guarda el minuto</div>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/15 flex items-center justify-center text-emerald-400 shrink-0">
                <Trophy className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-white truncate">Deportes</div>
                <div className="text-[10px] text-zinc-400 truncate">Directo + Multiview</div>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-500/15 flex items-center justify-center text-amber-400 shrink-0">
                <Youtube className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-white truncate">Watch Party</div>
                <div className="text-[10px] text-zinc-400 truncate">Chat y Mando TV</div>
              </div>
            </div>
          </div>
        </section>

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

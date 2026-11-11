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
  Moon,
  Cast,
} from 'lucide-react';
import { AppLanguage } from '../types';
import { UI_COPY } from '../utils/i18n';
import { RecentRoomEntry, StoredProfile } from '../utils/storage';
import { playNaimcineIntroSound, triggerHaptic } from '../utils/haptics';
import { extractRoomCodeFromInput, generateShortRoomCode } from '../utils/shortLink';
import { NaimBrandLogo } from './NaimBrandLogo';
import { CloudAccountButton } from './CloudAccountButton';
import {
  EffectiveViewMode,
  getMonogramInitials,
  ViewModeSwitchButton,
} from './MobileViewportGuard';
import { PWAInstallButton, PWAInstallNotification } from './PWAInstallPrompt';
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
}) => {
  const t = UI_COPY[lang];
  const isDesktop = effectiveView === 'desktop';
  const [name, setName] = useState(initialProfile.name);
  const [roomCode, setRoomCode] = useState('');
  const [heroImgFailed, setHeroImgFailed] = useState(false);
  const [nameError, setNameError] = useState(false);

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
    playNaimcineIntroSound();
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
    playNaimcineIntroSound();
    onEnterRoom(cleanCode, profile);
  };

  const handleRandomName = () => {
    triggerHaptic('light');
    const pick = RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)];
    setName(`${pick}_${Math.floor(Math.random() * 90 + 10)}`);
    setNameError(false);
  };

  const scrollToTopStudio = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-full w-full bg-[#090A0F] text-[#F4F5F8] overflow-x-clip">
      <div
        className={`min-h-full w-full flex flex-col pt-safe pb-safe relative ${
          isFramedMobileOnPc
            ? 'max-w-[430px] mx-auto border-x border-white/[0.1] bg-[#090A0F] shadow-[0_0_90px_rgba(0,0,0,0.92)]'
            : ''
        }`}
      >
        {/* Subtle Architectural Grid & Ambient Cinema Vignette */}
        <div className="pointer-events-none fixed inset-0 cyber-grid-bg opacity-45" />
        <div className="pointer-events-none fixed -top-44 left-1/2 -translate-x-1/2 w-full max-w-[680px] h-[300px] rounded-full bg-[#E11D48]/18 blur-[120px]" />

        {/* ==================================================================== */}
        {/* TOP HEADER: BRAND + VIEW SWITCHER + CLOUD LOGIN + LANGUAGE           */}
        {/* ==================================================================== */}
        <header className="relative z-20 w-full max-w-[1240px] mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-20 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onReplayIntro();
            }}
            className="flex items-center gap-2.5 min-w-0 cursor-pointer text-left group"
            title="NAIM CINE"
          >
            <NaimBrandLogo
              size={36}
              className="shrink-0 shadow-[0_0_24px_rgba(225,29,72,0.22)] group-hover:scale-105 transition-transform"
            />
            <span className="font-display font-bold text-base sm:text-lg tracking-[0.14em] text-white whitespace-nowrap">
              NAIM <span className="text-[#E11D48]">CINE</span>
            </span>
          </button>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <ViewModeSwitchButton
              effectiveView={effectiveView}
              onToggle={onToggleViewMode}
              lang={lang}
              compact
            />

            <CloudAccountButton
              user={authUser}
              authLoading={authLoading}
              lang={lang}
              onSignIn={onSignIn}
              onSignOut={onSignOut}
              compact
            />

            <PWAInstallButton lang={lang} compact />

            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                onChangeLang(lang === 'es' ? 'en' : 'es');
              }}
              className="min-h-[40px] px-2.5 sm:px-3 rounded-xl bg-[#12141D] hover:bg-[#191C28] border border-white/12 text-xs font-medium text-zinc-200 flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Globe className="w-3.5 h-3.5 text-zinc-400" />
              <span>{lang === 'es' ? 'ES' : 'EN'}</span>
            </button>
          </div>
        </header>

        {/* ==================================================================== */}
        {/* ABOVE THE FOLD: STREAMLINED NAME-ONLY LAUNCH CONSOLE                 */}
        {/* ==================================================================== */}
        <section className="relative z-10 w-full max-w-[920px] mx-auto px-4 sm:px-6 pt-4 pb-12 sm:pt-10 sm:pb-16">
          <div className="text-center max-w-2xl mx-auto mb-6 sm:mb-9 space-y-3">
            <div className="text-xs font-medium text-zinc-400 tracking-wide">
              {lang === 'es'
                ? 'Cine · Series · Fútbol en directo · YouTube sincronizado'
                : 'Movies · Series · Live Sports · Synchronized YouTube'}
            </div>
            <h1
              className={`font-display font-bold ${
                isDesktop
                  ? 'text-3xl sm:text-5xl leading-[1.08]'
                  : 'text-2xl sm:text-3xl leading-[1.12]'
              } tracking-tight text-white text-balance`}
            >
              {t.heroHeadline}
            </h1>
            <p className="text-xs sm:text-base text-zinc-400 max-w-[58ch] mx-auto leading-relaxed">
              {lang === 'es'
                ? 'Escribe tu nombre y abre tu sala privada al instante. Sin registros obligatorios, sin publicidad y con sincronización exacta para todos tus invitados.'
                : 'Enter your name and launch your private theater room instantly. Zero mandatory sign-ups, zero ads, and frame-accurate group sync.'}
            </p>
          </div>

          {/* Primary Launch Surface (Single-Elevation Obsidian Console) */}
          <div className="rounded-3xl bg-[#11131B]/95 backdrop-blur-xl border border-white/[0.1] shadow-[0_28px_90px_rgba(0,0,0,0.7)] p-5 sm:p-8 space-y-5">
            {/* Step 1: Name + Create Room Side-by-Side */}
            <div
              className={`grid grid-cols-1 ${
                isDesktop ? 'lg:grid-cols-12' : ''
              } gap-3.5 items-end`}
            >
              <div className={isDesktop ? 'lg:col-span-7 space-y-2' : 'space-y-2'}>
                <label
                  htmlFor="lobby-nickname"
                  className="block text-xs font-medium text-zinc-300"
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
                    className={`flex-1 min-w-0 h-12 px-4 rounded-2xl bg-[#090A0F] border ${
                      nameError
                        ? 'border-rose-500'
                        : 'border-white/12 focus:border-white/40'
                    } text-base sm:text-sm font-medium text-white placeholder:text-zinc-500 outline-none transition-colors`}
                  />
                  <button
                    type="button"
                    onClick={handleRandomName}
                    title={lang === 'es' ? 'Generar nombre aleatorio' : 'Random alias'}
                    aria-label={lang === 'es' ? 'Generar nombre aleatorio' : 'Random alias'}
                    className="w-12 h-12 rounded-2xl bg-[#191C28] hover:bg-[#232838] active:scale-95 border border-white/10 flex items-center justify-center text-zinc-300 transition-all shrink-0 cursor-pointer"
                  >
                    <Shuffle className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className={isDesktop ? 'lg:col-span-5' : ''}>
                <button
                  type="button"
                  onClick={handleCreateRoom}
                  className="w-full h-12 px-6 rounded-2xl bg-[#E11D48] hover:bg-[#BE123C] active:scale-[0.98] text-white font-display font-bold text-sm sm:text-base tracking-wide flex items-center justify-center gap-2.5 shadow-[0_12px_36px_rgba(225,29,72,0.38)] transition-all whitespace-nowrap cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>{t.createRoomBtn}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Secondary Row: Join Friend's Room Code + Recent Rooms */}
            <div
              className={`pt-4 border-t border-white/[0.08] grid grid-cols-1 ${
                isDesktop ? 'md:grid-cols-12' : ''
              } gap-3.5 items-center`}
            >
              <form
                onSubmit={handleJoinByCode}
                className={`${
                  isDesktop
                    ? recentRooms.length > 0
                      ? 'md:col-span-7'
                      : 'md:col-span-12'
                    : ''
                } flex flex-col sm:flex-row sm:items-center gap-2`}
              >
                <label
                  htmlFor="lobby-room-code"
                  className="text-xs font-medium text-zinc-400 shrink-0"
                >
                  {t.joinRoomLabel}:
                </label>
                <div className="flex items-center gap-2 flex-1">
                  <input
                    id="lobby-room-code"
                    type="text"
                    value={roomCode}
                    onChange={(e) => setRoomCode(e.target.value)}
                    placeholder={t.roomCodePlaceholder}
                    className="flex-1 min-w-0 h-11 px-3.5 rounded-xl bg-[#090A0F] border border-white/10 focus:border-white/35 text-base sm:text-xs text-white placeholder:text-zinc-500 outline-none font-mono"
                  />
                  <button
                    type="submit"
                    disabled={!roomCode.trim()}
                    className="h-11 px-4 rounded-xl bg-[#191C28] hover:bg-[#232838] disabled:opacity-40 border border-white/12 text-xs font-semibold text-white flex items-center gap-1.5 transition-all whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed"
                  >
                    <span>{t.joinBtn}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </form>

              {recentRooms.length > 0 && (
                <div
                  className={`${
                    isDesktop ? 'md:col-span-5' : ''
                  } min-w-0 flex items-center gap-2 overflow-x-auto no-scrollbar`}
                >
                  <Clock className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                  {recentRooms.slice(0, 2).map((room) => (
                    <button
                      key={room.id}
                      type="button"
                      onClick={() => {
                        const profile = buildProfile();
                        if (profile) {
                          playNaimcineIntroSound();
                          onEnterRoom(room.id, profile, room.name);
                        }
                      }}
                      className="h-10 px-3 rounded-xl bg-[#090A0F] hover:bg-[#191C28] border border-white/[0.08] flex items-center gap-2 text-xs text-zinc-200 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                    >
                      <span className="font-medium truncate max-w-[115px]">
                        {room.name}
                      </span>
                      <ChevronRight className="w-3.5 h-3.5 text-zinc-500" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Optional Cloud Sync Strip */}
            <div className="pt-3.5 border-t border-white/[0.07] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
              <div className="flex items-center gap-2 text-zinc-300 min-w-0">
                <Cloud
                  className={`w-4 h-4 shrink-0 ${
                    authUser ? 'text-emerald-400' : 'text-[#38BDF8]'
                  }`}
                />
                <span className="leading-snug text-zinc-400">
                  {authUser
                    ? lang === 'es'
                      ? `Sincronizado con ${authUser.displayName || authUser.email} · Historial, minuto exacto y favoritos activos.`
                      : `Synced with ${authUser.displayName || authUser.email} · Watch history, resume time & favorites active.`
                    : lang === 'es'
                    ? 'Inicia sesión con Google si quieres sincronizar tu historial, "Seguir viendo" y favoritos entre tus dispositivos.'
                    : 'Sign in with Google to sync watch history, exact resume points, and favorites across devices.'}
                </span>
              </div>
              {!authUser && !authLoading && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('medium');
                    onSignIn();
                  }}
                  className="min-h-[38px] px-3.5 rounded-xl bg-[#191C28] hover:bg-[#232838] border border-white/12 text-xs font-semibold text-white flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                >
                  <LogIn className="w-3.5 h-3.5 text-[#38BDF8]" />
                  <span>
                    {lang === 'es' ? 'Conectar Google' : 'Sign in with Google'}
                  </span>
                </button>
              )}
            </div>
          </div>
        </section>

        {/* ==================================================================== */}
        {/* BELOW THE FOLD: EDITORIAL ARCHITECTURE & PLATFORM CAPABILITIES       */}
        {/* ==================================================================== */}
        <section
          id="que-ofrece-naim-cine"
          className="relative z-10 w-full border-t border-white/[0.08] bg-[#0B0D14]/95 py-12 sm:py-20"
        >
          <div className="max-w-[1180px] mx-auto px-4 sm:px-6 lg:px-8 space-y-14 sm:space-y-20">
            {/* Block 1: Editorial Overview + Theater Photography */}
            <div
              className={`grid grid-cols-1 ${
                isDesktop ? 'lg:grid-cols-12' : ''
              } gap-8 items-stretch`}
            >
              <div
                className={`${
                  isDesktop ? 'lg:col-span-6' : ''
                } flex flex-col justify-center space-y-4`}
              >
                <div className="text-xs font-medium text-[#FB7185]">
                  {lang === 'es' ? 'Experiencia de sala privada' : 'Private screening room'}
                </div>
                <h2 className="font-display font-bold text-2xl sm:text-4xl text-white leading-tight text-balance">
                  {lang === 'es'
                    ? 'Todo tu entretenimiento en una sola sala, sincronizado al milisegundo.'
                    : 'All your entertainment in one private room, synchronized to the millisecond.'}
                </h2>
                <p className="text-sm sm:text-base text-zinc-400 leading-relaxed">
                  {lang === 'es'
                    ? 'Reproduce películas en Castellano, Latino o versión original 1080p, maratonea series completas guardando el segundo exacto donde lo dejaste, sigue el fútbol en directo y proyecta en tu televisor con Chromecast o Modo Cine.'
                    : 'Stream 1080p movies in multiple languages, binge full TV series with exact-second resume, watch live football, and cast directly to your TV with Cinema Focus Mode.'}
                </p>

                <div className="pt-4 grid grid-cols-3 gap-4 border-t border-white/10">
                  <div>
                    <div className="font-display font-bold text-xl sm:text-2xl text-white tabular-nums">
                      0 Ads
                    </div>
                    <div className="text-xs text-zinc-400 mt-0.5">
                      {lang === 'es' ? 'Reproducción limpia' : 'Clean native HLS'}
                    </div>
                  </div>
                  <div>
                    <div className="font-display font-bold text-xl sm:text-2xl text-white tabular-nums">
                      &lt; 50ms
                    </div>
                    <div className="text-xs text-zinc-400 mt-0.5">
                      {lang === 'es' ? 'Sincronía grupal' : 'Real-time sync'}
                    </div>
                  </div>
                  <div>
                    <div className="font-display font-bold text-xl sm:text-2xl text-[#E11D48] tabular-nums">
                      1080p
                    </div>
                    <div className="text-xs text-zinc-400 mt-0.5">
                      {lang === 'es' ? 'Multi-audio HD' : 'Multi-audio HD'}
                    </div>
                  </div>
                </div>
              </div>

              <div
                className={`${
                  isDesktop ? 'lg:col-span-6' : ''
                } relative rounded-3xl overflow-hidden border border-white/10 bg-[#11131B] min-h-[240px] sm:min-h-[300px] flex items-end p-6`}
              >
                {!heroImgFailed ? (
                  <img
                    src={lobbyHeroImg}
                    alt="Sala privada NAIM CINE"
                    referrerPolicy="no-referrer"
                    onError={() => setHeroImgFailed(true)}
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-br from-[#25122B] via-[#12141D] to-[#090A0F]" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-[#090A0F] via-[#090A0F]/55 to-transparent" />
                <div className="relative z-10 space-y-1.5">
                  <div className="flex items-center gap-2 text-xs text-zinc-300">
                    <Moon className="w-3.5 h-3.5 text-amber-300" />
                    <span>Modo Cine</span>
                    <span aria-hidden="true">·</span>
                    <Cast className="w-3.5 h-3.5 text-[#38BDF8]" />
                    <span>Chromecast</span>
                    <span aria-hidden="true">·</span>
                    <span>PiP Flotante</span>
                  </div>
                  <p className="text-sm font-medium text-white leading-snug">
                    {lang === 'es'
                      ? 'Apaga las luces de la interfaz con Modo Cine, superpón el vídeo sobre otras apps o envíalo directo a tu TV.'
                      : 'Dim surrounding UI with Cinema Mode, float video over phone apps, or cast directly to your TV.'}
                  </p>
                </div>
              </div>
            </div>

            {/* Block 2: 4 Content Pillars */}
            <div className="space-y-6">
              <div className="max-w-xl">
                <h3 className="font-display font-bold text-xl sm:text-2xl text-white">
                  {lang === 'es'
                    ? 'Cuatro catálogos integrados en tu sala'
                    : 'Four integrated catalogs inside your room'}
                </h3>
              </div>

              <div
                className={`grid grid-cols-1 ${
                  isDesktop ? 'sm:grid-cols-2 lg:grid-cols-4' : ''
                } gap-4`}
              >
                <div className="rounded-2xl bg-[#11131B] border border-white/[0.08] p-5 space-y-2.5">
                  <Film className="w-5 h-5 text-[#FB7185]" />
                  <h4 className="font-display font-semibold text-base text-white">
                    {lang === 'es'
                      ? 'Cine Español, Latino y VOSE'
                      : 'Spanish, Latino & VOSE Movies'}
                  </h4>
                  <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
                    {lang === 'es'
                      ? 'Cambio inmediato de pista de audio y reanudación automática en el segundo exacto.'
                      : 'Instant audio track switching and automatic exact-second playback resume.'}
                  </p>
                </div>

                <div className="rounded-2xl bg-[#11131B] border border-white/[0.08] p-5 space-y-2.5">
                  <Tv className="w-5 h-5 text-[#38BDF8]" />
                  <h4 className="font-display font-semibold text-base text-white">
                    {lang === 'es'
                      ? 'Series TV y Bingetrix 1080p'
                      : 'Full TV Series & Bingetrix 1080p'}
                  </h4>
                  <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
                    {lang === 'es'
                      ? 'Temporadas completas, paso automático al siguiente episodio y fila de series favoritas.'
                      : 'Complete seasons, one-tap next episode, and synced favorite series.'}
                  </p>
                </div>

                <div className="rounded-2xl bg-[#11131B] border border-white/[0.08] p-5 space-y-2.5">
                  <Trophy className="w-5 h-5 text-emerald-400" />
                  <h4 className="font-display font-semibold text-base text-white">
                    {lang === 'es'
                      ? 'Fútbol en Directo y Motor'
                      : 'Live Football & Motorsport'}
                  </h4>
                  <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
                    {lang === 'es'
                      ? 'Agenda en vivo y canales 24/7 con acceso rápido para tus canales deportivos favoritos.'
                      : 'Live match schedule and 24/7 channels with quick-launch sports favorites.'}
                  </p>
                </div>

                <div className="rounded-2xl bg-[#11131B] border border-white/[0.08] p-5 space-y-2.5">
                  <Youtube className="w-5 h-5 text-amber-400" />
                  <h4 className="font-display font-semibold text-base text-white">
                    {lang === 'es'
                      ? 'YouTube y Cola Colaborativa'
                      : 'YouTube & Shared Queue'}
                  </h4>
                  <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
                    {lang === 'es'
                      ? 'Buscador integrado y cola compartida para añadir vídeos entre todos los participantes.'
                      : 'Built-in search and shared room queue so everyone can line up videos.'}
                  </p>
                </div>
              </div>
            </div>

            {/* Block 3: Editorial 3-Step Flow */}
            <div className="pt-8 border-t border-white/[0.08] flex flex-col sm:flex-row sm:items-center justify-between gap-6">
              <div
                className={`grid grid-cols-1 ${
                  isDesktop ? 'md:grid-cols-3' : ''
                } gap-6 flex-1`}
              >
                <div className="space-y-1">
                  <div className="text-xs font-mono text-zinc-500 tabular-nums">01.</div>
                  <h4 className="font-display font-semibold text-sm sm:text-base text-white">
                    {lang === 'es' ? 'Pon tu nombre y entra' : 'Enter your name & launch'}
                  </h4>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    {lang === 'es'
                      ? 'Sin formularios largos ni avatares innecesarios: solo tu nombre y dentro.'
                      : 'No lengthy forms: just type your name and step inside.'}
                  </p>
                </div>
                <div className="space-y-1">
                  <div className="text-xs font-mono text-zinc-500 tabular-nums">02.</div>
                  <h4 className="font-display font-semibold text-sm sm:text-base text-white">
                    {lang === 'es' ? 'Comparte el enlace corto' : 'Share the short invite'}
                  </h4>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    {lang === 'es'
                      ? 'Tus amigos entran directo a la proyección con un enlace limpio.'
                      : 'Friends land directly inside your screening room via a short link.'}
                  </p>
                </div>
                <div className="space-y-1">
                  <div className="text-xs font-mono text-zinc-500 tabular-nums">03.</div>
                  <h4 className="font-display font-semibold text-sm sm:text-base text-white">
                    {lang === 'es' ? 'Activa el Modo Cine' : 'Turn on Cinema Mode'}
                  </h4>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    {lang === 'es'
                      ? 'Oscurece todo alrededor del reproductor o cambia entre vista PC y móvil cuando quieras.'
                      : 'Dim everything around the video player or switch between PC and mobile views anytime.'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={scrollToTopStudio}
                className="min-h-[44px] px-5 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-xs sm:text-sm font-semibold text-white flex items-center justify-center gap-2 shrink-0 cursor-pointer transition-colors"
              >
                <span>{lang === 'es' ? 'Crear sala ahora' : 'Create room now'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </section>

        <PWAInstallNotification lang={lang} />
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import {
  ArrowRight,
  Shuffle,
  Play,
  Globe,
  Clock,
  ChevronRight,
  Sparkles,
  Film,
  Tv,
  Trophy,
  Youtube,
  Users,
  Zap,
  ChevronDown,
  Smartphone,
} from 'lucide-react';
import { AppLanguage } from '../types';
import { UI_COPY } from '../utils/i18n';
import { RecentRoomEntry, StoredProfile } from '../utils/storage';
import { playNaimcineIntroSound, triggerHaptic } from '../utils/haptics';
import { extractRoomCodeFromInput, generateShortRoomCode } from '../utils/shortLink';
import { NaimBrandLogo } from './NaimBrandLogo';
import { PWAInstallButton, PWAInstallNotification } from './PWAInstallPrompt';
import lobbyHeroImg from '../assets/images/cinema_hero_lobby_1794353709142.jpg';

const AVATAR_PROFILES = [
  { emoji: '🍿', labelEs: 'Cineasta', labelEn: 'Moviegoer' },
  { emoji: '🎬', labelEs: 'Director', labelEn: 'Director' },
  { emoji: '⚽', labelEs: 'Capitán', labelEn: 'Captain' },
  { emoji: '🏎️', labelEs: 'Piloto F1', labelEn: 'F1 Driver' },
  { emoji: '🚀', labelEs: 'Cyber', labelEn: 'Cyber' },
  { emoji: '⚡', labelEs: 'VIP', labelEn: 'VIP' },
  { emoji: '🎧', labelEs: 'DJ Sala', labelEn: 'DJ' },
  { emoji: '🦁', labelEs: 'Leyenda', labelEn: 'Legend' },
];

const ACCENT_COLORS = ['#E11D48', '#38BDF8', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899'];

const RANDOM_NAMES = [
  'Naim_VIP',
  'Cineasta_Pro',
  'NocheDeSeries',
  'GolazoLive',
  'CyberButaca',
  'DirectorCut',
  'PitWall_F1',
];

interface LobbyScreenProps {
  initialProfile: StoredProfile;
  recentRooms: RecentRoomEntry[];
  lang: AppLanguage;
  onChangeLang: (lang: AppLanguage) => void;
  onReplayIntro: () => void;
  onEnterRoom: (roomId: string, profile: StoredProfile, roomName?: string) => void;
}

export const LobbyScreen: React.FC<LobbyScreenProps> = ({
  initialProfile,
  recentRooms,
  lang,
  onChangeLang,
  onReplayIntro,
  onEnterRoom,
}) => {
  const t = UI_COPY[lang];
  const [name, setName] = useState(initialProfile.name);
  const [avatar, setAvatar] = useState(initialProfile.avatar || '🍿');
  const [color, setColor] = useState(initialProfile.color || '#E11D48');
  const [roomCode, setRoomCode] = useState('');
  const [heroImgFailed, setHeroImgFailed] = useState(false);
  const [nameError, setNameError] = useState(false);

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
      avatar,
      color,
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
    <div className="min-h-dvh w-full bg-[#090A0F] text-[#F4F5F8] flex flex-col pt-safe pb-safe relative overflow-x-hidden">
      {/* Subtle Futuristic Cyber-Cinema Ambient Background */}
      <div className="pointer-events-none fixed inset-0 cyber-grid-bg opacity-65" />
      <div
        className="pointer-events-none fixed -top-36 left-1/2 -translate-x-1/2 w-[620px] h-[340px] rounded-full blur-[130px] opacity-30 transition-colors duration-500"
        style={{ backgroundColor: color }}
      />

      {/* ==================================================================== */}
      {/* TOP BAR: NAIM CINE BRAND EMBLEM + INTRO FX + LANGUAGE                */}
      {/* ==================================================================== */}
      <header className="relative z-20 w-full max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-20 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3 shrink-0">
          <NaimBrandLogo size={42} className="shadow-[0_0_24px_rgba(225,29,72,0.25)]" />
          <div className="flex flex-col">
            <span className="font-display font-bold text-lg sm:text-xl tracking-[0.14em] text-white leading-none whitespace-nowrap">
              NAIM <span className="text-[#E11D48]">CINE</span>
            </span>
            <span className="text-[10px] sm:text-[11px] text-zinc-400 mt-0.5 whitespace-nowrap">
              {lang === 'es'
                ? 'Cine · Series · Fútbol · YouTube con Amigos'
                : 'Movies · Series · Live Sports · YouTube'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <PWAInstallButton lang={lang} />

          <button
            type="button"
            onClick={() => {
              triggerHaptic('medium');
              onReplayIntro();
            }}
            className="min-h-[40px] px-3 rounded-xl bg-[#12141D]/90 hover:bg-[#191C28] border border-white/12 text-xs font-semibold text-zinc-200 flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            title="Repetir Intro NAIM CINE"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#FB7185]" />
            <span className="hidden sm:inline">Intro FX</span>
          </button>

          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onChangeLang(lang === 'es' ? 'en' : 'es');
            }}
            className="min-h-[40px] px-3 rounded-xl bg-[#12141D]/90 hover:bg-[#191C28] border border-white/12 text-xs font-medium text-zinc-200 flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Globe className="w-4 h-4 text-zinc-400" />
            <span>{lang === 'es' ? 'ES' : 'EN'}</span>
          </button>
        </div>
      </header>

      {/* ==================================================================== */}
      {/* ABOVE THE FOLD (PRIMARY): NETFLIX PROFILE STUDIO + 1-TAP ENTER ROOM  */}
      {/* ==================================================================== */}
      <section className="relative z-10 w-full max-w-[1040px] mx-auto px-4 sm:px-6 pt-2 pb-10 sm:pt-5 sm:pb-14">
        <div className="text-center max-w-2xl mx-auto mb-5 sm:mb-7 space-y-2">
          <h1 className="font-display font-bold text-2xl sm:text-4xl lg:text-[44px] leading-[1.08] tracking-tight text-white text-balance">
            {lang === 'es' ? (
              <>
                ¿Quién entra hoy a <span className="text-[#E11D48]">NAIM CINE</span>?
              </>
            ) : (
              <>
                Who’s entering <span className="text-[#E11D48]">NAIM CINE</span> tonight?
              </>
            )}
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400 max-w-[54ch] mx-auto">
            {lang === 'es'
              ? 'Elige tu avatar, pon tu nombre y entra directo a tu sala privada para ver películas, series, fútbol o YouTube con tus amigos.'
              : 'Choose your avatar, enter your name, and step right into your private screening room with friends.'}
          </p>
        </div>

        {/* Main Futuristic Profile & Room Launch Card */}
        <div className="rounded-3xl futuristic-panel border border-white/[0.12] shadow-[0_24px_80px_rgba(0,0,0,0.65)] p-5 sm:p-8 lg:p-9 space-y-6">
          {/* Step 1: Netflix-Inspired Avatar Selector Grid */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
                1 · {t.avatarLabel}
              </span>
              {/* Accent Aura Picker */}
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-zinc-400 hidden sm:inline mr-1">
                  {t.accentLabel}:
                </span>
                {ACCENT_COLORS.map((hex) => {
                  const active = color.toLowerCase() === hex.toLowerCase();
                  return (
                    <button
                      key={hex}
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        setColor(hex);
                      }}
                      aria-label={`Color ${hex}`}
                      className="w-7 h-7 rounded-full flex items-center justify-center cursor-pointer"
                    >
                      <span
                        className={`w-5 h-5 rounded-full transition-transform ${
                          active
                            ? 'scale-115 ring-2 ring-white ring-offset-2 ring-offset-[#12141D]'
                            : 'opacity-65 hover:opacity-100'
                        }`}
                        style={{ backgroundColor: hex }}
                      />
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-4 sm:grid-cols-8 gap-2.5 sm:gap-3">
              {AVATAR_PROFILES.map((item) => {
                const selected = avatar === item.emoji;
                return (
                  <button
                    key={item.emoji}
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      setAvatar(item.emoji);
                    }}
                    style={
                      selected
                        ? {
                            borderColor: color,
                            boxShadow: `0 0 24px ${color}40`,
                          }
                        : undefined
                    }
                    className={`group rounded-2xl py-2.5 px-1.5 flex flex-col items-center justify-center gap-1 transition-all cursor-pointer border ${
                      selected
                        ? 'bg-white/[0.1] scale-[1.04]'
                        : 'bg-[#090A0F]/85 border-white/[0.07] hover:border-white/25 hover:bg-white/[0.05]'
                    }`}
                  >
                    <span className="text-2xl sm:text-[28px] leading-none group-hover:scale-110 transition-transform">
                      {item.emoji}
                    </span>
                    <span
                      className={`text-[10px] font-medium truncate max-w-full ${
                        selected ? 'text-white font-semibold' : 'text-zinc-400'
                      }`}
                    >
                      {lang === 'es' ? item.labelEs : item.labelEn}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step 2: Name Input + Instant Primary Enter CTA */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-end pt-1">
            <div className="lg:col-span-6 space-y-2">
              <label
                htmlFor="lobby-nickname"
                className="block text-xs font-semibold uppercase tracking-wider text-zinc-300"
              >
                2 · {t.nicknameLabel}
              </label>
              <div className="flex items-center gap-2">
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shrink-0 border transition-colors"
                  style={{
                    backgroundColor: `${color}22`,
                    borderColor: `${color}75`,
                  }}
                >
                  {avatar}
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
                    nameError ? 'border-rose-500' : 'border-white/12 focus:border-white/40'
                  } text-base sm:text-sm font-medium text-white placeholder:text-zinc-500 outline-none transition-colors`}
                />
                <button
                  type="button"
                  onClick={handleRandomName}
                  title="Generar alias aleatorio"
                  aria-label="Generar alias aleatorio"
                  className="w-12 h-12 rounded-2xl bg-[#191C28] hover:bg-[#232838] active:scale-95 border border-white/10 flex items-center justify-center text-zinc-300 transition-all shrink-0 cursor-pointer"
                >
                  <Shuffle className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="lg:col-span-6">
              <button
                type="button"
                onClick={handleCreateRoom}
                className="w-full h-12 sm:h-[52px] px-6 rounded-2xl bg-[#E11D48] hover:bg-[#BE123C] active:scale-[0.98] text-white font-display font-bold text-sm sm:text-base tracking-wide flex items-center justify-center gap-2.5 shadow-[0_10px_35px_rgba(225,29,72,0.4)] transition-all whitespace-nowrap cursor-pointer"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>{t.createRoomBtn}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Secondary Row: Join Friend's Room Code + Recent Rooms */}
          <div className="pt-4 border-t border-white/[0.08] grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
            <form
              onSubmit={handleJoinByCode}
              className={`${
                recentRooms.length > 0 ? 'md:col-span-7' : 'md:col-span-12'
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
              <div className="md:col-span-5 flex items-center gap-2 overflow-x-auto no-scrollbar">
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
                    <span className="font-medium truncate max-w-[110px]">{room.name}</span>
                    <ChevronRight className="w-3.5 h-3.5 text-zinc-500" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Subtle Scroll Indicator to Feature Breakdown Below */}
        <div className="mt-7 flex justify-center">
          <a
            href="#que-ofrece-naim-cine"
            className="inline-flex items-center gap-2 text-xs font-medium text-zinc-400 hover:text-white transition-colors"
          >
            <span>
              {lang === 'es'
                ? 'Descubre todo lo que incluye NAIM CINE y para qué sirve'
                : 'Explore everything included in NAIM CINE'}
            </span>
            <ChevronDown className="w-4 h-4 text-[#E11D48]" />
          </a>
        </div>
      </section>

      {/* ==================================================================== */}
      {/* BELOW THE FOLD: VISUAL BREAKDOWN OF WHAT NAIM CINE OFFERS & WHY      */}
      {/* ==================================================================== */}
      <section
        id="que-ofrece-naim-cine"
        className="relative z-10 w-full border-t border-white/[0.08] bg-[#0B0D14]/90 py-14 sm:py-20"
      >
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 space-y-14 sm:space-y-20">
          {/* Block 1: What is NAIM CINE & Visual Theater Banner */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10 items-center">
            <div className="lg:col-span-6 space-y-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#FB7185]">
                {lang === 'es' ? '¿QUÉ ES Y PARA QUÉ SIRVE?' : 'WHAT IS NAIM CINE?'}
              </p>
              <h2 className="font-display font-bold text-2xl sm:text-4xl text-white leading-tight text-balance">
                {lang === 'es'
                  ? 'Tu sala de cine privada del futuro para ver cualquier contenido con amigos a distancia.'
                  : 'Your futuristic private theater to watch anything together with friends anywhere.'}
              </h2>
              <p className="text-sm sm:text-base text-zinc-300 leading-relaxed">
                {lang === 'es'
                  ? 'NAIM CINE une en una sola plataforma cine de estreno, series completas, partidos de fútbol en directo y YouTube sincronizado. Sin registros obligatorios, sin anuncios molestos y con sincronización automática para que todos veáis el mismo segundo exacto.'
                  : 'NAIM CINE combines premiere movies, full TV series, live football broadcasts, and synchronized YouTube in one clean room. Zero mandatory sign-ups, zero popups, and frame-accurate group playback.'}
              </p>
              <div className="pt-2 grid grid-cols-3 gap-3 border-t border-white/10">
                <div>
                  <div className="font-display font-bold text-xl sm:text-2xl text-white tabular-nums">
                    0 Ads
                  </div>
                  <div className="text-[11px] text-zinc-400">
                    {lang === 'es' ? 'Flujo HLS limpio' : 'Clean native HLS'}
                  </div>
                </div>
                <div>
                  <div className="font-display font-bold text-xl sm:text-2xl text-[#38BDF8] tabular-nums">
                    &lt; 50ms
                  </div>
                  <div className="text-[11px] text-zinc-400">
                    {lang === 'es' ? 'Sincronía en vivo' : 'Real-time sync'}
                  </div>
                </div>
                <div>
                  <div className="font-display font-bold text-xl sm:text-2xl text-[#E11D48] tabular-nums">
                    4 en 1
                  </div>
                  <div className="text-[11px] text-zinc-400">
                    {lang === 'es' ? 'Cine · TV · Fútbol · YT' : 'Movies · TV · Live · YT'}
                  </div>
                </div>
              </div>
            </div>

            <div className="lg:col-span-6 relative rounded-3xl overflow-hidden border border-white/12 bg-[#12141D] aspect-[16/10] flex items-end p-6">
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
              <div className="absolute inset-0 bg-gradient-to-t from-[#090A0F] via-[#090A0F]/60 to-transparent" />
              <div className="relative z-10 space-y-1">
                <div className="text-xs font-semibold text-[#38BDF8]">
                  {lang === 'es'
                    ? 'Chromecast Directo · Modo Flotante · App Android/iOS'
                    : 'Direct Chromecast · Floating PiP · Installable App'}
                </div>
                <p className="text-sm font-semibold text-white">
                  {lang === 'es'
                    ? 'Envía el vídeo directo a tu tele con Chromecast, superpón la pantalla sobre otras apps del móvil o instálala en Android.'
                    : 'Cast video directly to your TV, float video on top of phone apps, or install locally on Android & iOS.'}
                </p>
              </div>
            </div>
          </div>

          {/* Block 2: The 4 Content Universes Grid */}
          <div className="space-y-6">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#38BDF8]">
                {lang === 'es' ? 'CATÁLOGO TODO EN UNO' : 'ALL-IN-ONE CATALOG'}
              </p>
              <h3 className="font-display font-bold text-xl sm:text-3xl text-white mt-1">
                {lang === 'es'
                  ? 'Todo lo que ofrece NAIM CINE dentro de tu sala'
                  : 'Everything waiting inside your NAIM CINE room'}
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="rounded-3xl bg-[#12141D] border border-white/[0.08] p-5 space-y-3">
                <div className="w-11 h-11 rounded-2xl bg-[#E11D48]/15 border border-[#E11D48]/35 flex items-center justify-center text-[#FB7185]">
                  <Film className="w-5 h-5" />
                </div>
                <h4 className="font-display font-bold text-base text-white">
                  {lang === 'es' ? 'Cine Español, Latino & VOSE' : 'Spanish, Latino & VOSE Cinema'}
                </h4>
                <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
                  {lang === 'es'
                    ? 'Miles de películas con cambio instantáneo de idioma entre Castellano HD, Español Latino y Subtitulado sin cortar la reproducción.'
                    : 'Instant audio switching between Spanish, Latino, and subtitled HD streams without interrupting playback.'}
                </p>
              </div>

              <div className="rounded-3xl bg-[#12141D] border border-white/[0.08] p-5 space-y-3">
                <div className="w-11 h-11 rounded-2xl bg-[#38BDF8]/15 border border-[#38BDF8]/35 flex items-center justify-center text-[#38BDF8]">
                  <Tv className="w-5 h-5" />
                </div>
                <h4 className="font-display font-bold text-base text-white">
                  {lang === 'es'
                    ? 'Bingetrix 1080p & Series TV'
                    : 'Bingetrix 1080p & Full TV Series'}
                </h4>
                <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
                  {lang === 'es'
                    ? 'Catálogo completo de Bingetrix en inglés original + todas las series por temporadas, botón "Siguiente Episodio" e Historial de visualización.'
                    : 'Complete Bingetrix 1080p English library plus full TV seasons, 1-tap Next Episode, and local Watch History.'}
                </p>
              </div>

              <div className="rounded-3xl bg-[#12141D] border border-white/[0.08] p-5 space-y-3">
                <div className="w-11 h-11 rounded-2xl bg-emerald-500/15 border border-emerald-500/35 flex items-center justify-center text-emerald-400">
                  <Trophy className="w-5 h-5" />
                </div>
                <h4 className="font-display font-bold text-base text-white">
                  {lang === 'es' ? 'Fútbol en Directo & F1' : 'Live Football & Motorsport'}
                </h4>
                <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
                  {lang === 'es'
                    ? 'Agenda deportiva actualizada al minuto con señales 24/7 para vivir LaLiga, Champions, Fórmula 1 y grandes partidos comentando en vivo.'
                    : 'Real-time live sports schedule and 24/7 channels for LaLiga, Champions League, and Formula 1 with your squad.'}
                </p>
              </div>

              <div className="rounded-3xl bg-[#12141D] border border-white/[0.08] p-5 space-y-3">
                <div className="w-11 h-11 rounded-2xl bg-amber-500/15 border border-amber-500/35 flex items-center justify-center text-amber-400">
                  <Youtube className="w-5 h-5" />
                </div>
                <h4 className="font-display font-bold text-base text-white">
                  {lang === 'es' ? 'YouTube & Cola Compartida' : 'YouTube & Shared Room Queue'}
                </h4>
                <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
                  {lang === 'es'
                    ? 'Buscador integrado de YouTube para ver resúmenes, videoclips o tráilers juntos y armar una Cola de Reproducción entre todos.'
                    : 'Built-in YouTube search for highlights, music videos, and trailers with a real-time collaborative room queue.'}
                </p>
              </div>
            </div>
          </div>

          {/* Block 3: How Invite & Watch Party Works (3 Simple Steps) */}
          <div className="rounded-3xl bg-[#12141D] border border-white/10 p-6 sm:p-9 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#FB7185]">
                  {lang === 'es' ? 'SENCILLO Y SIN REGISTROS' : 'ZERO FRICTION'}
                </p>
                <h3 className="font-display font-bold text-xl sm:text-2xl text-white mt-1">
                  {lang === 'es'
                    ? '¿Cómo funciona invitar a tus amigos?'
                    : 'How inviting friends works'}
                </h3>
              </div>
              <button
                type="button"
                onClick={scrollToTopStudio}
                className="min-h-[44px] px-5 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-xs sm:text-sm font-semibold text-white flex items-center justify-center gap-2 shrink-0 cursor-pointer transition-colors"
              >
                <Zap className="w-4 h-4" />
                <span>{lang === 'es' ? 'Subir y Crear Sala' : 'Go Up & Create Room'}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-2">
              <div className="p-4 rounded-2xl bg-[#090A0F] border border-white/[0.06] space-y-2">
                <div className="flex items-center gap-2 text-xs font-mono font-semibold text-[#E11D48]">
                  <Users className="w-4 h-4" />
                  <span>PASO 01</span>
                </div>
                <h4 className="font-display font-semibold text-sm sm:text-base text-white">
                  {lang === 'es' ? 'Elige avatar y entra arriba' : 'Pick avatar & launch room'}
                </h4>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  {lang === 'es'
                    ? 'Escoges tu icono, escribes tu apodo y en menos de 2 segundos tu sala privada está activa.'
                    : 'Select an icon, type your nickname, and your private room is live in under two seconds.'}
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-[#090A0F] border border-white/[0.06] space-y-2">
                <div className="flex items-center gap-2 text-xs font-mono font-semibold text-[#38BDF8]">
                  <Smartphone className="w-4 h-4" />
                  <span>PASO 02</span>
                </div>
                <h4 className="font-display font-semibold text-sm sm:text-base text-white">
                  {lang === 'es'
                    ? 'Tus amigos entran directo sin bloqueos'
                    : 'Friends land directly inside'}
                </h4>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  {lang === 'es'
                    ? 'Al abrir tu link entran directo a ver el vídeo. Les aparece una tarjetita discreta por si quieren poner su nombre; si la cierran, se quedan con su alias aleatorio.'
                    : 'Opening your invite link drops friends straight into the live room with a gentle optional card to set their name or keep a random alias.'}
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-[#090A0F] border border-white/[0.06] space-y-2">
                <div className="flex items-center gap-2 text-xs font-mono font-semibold text-emerald-400">
                  <Sparkles className="w-4 h-4" />
                  <span>PASO 03</span>
                </div>
                <h4 className="font-display font-semibold text-sm sm:text-base text-white">
                  {lang === 'es'
                    ? 'Chromecast directo, pantalla flotante y mini-player'
                    : 'Direct Chromecast, floating PiP & mini-player'}
                </h4>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  {lang === 'es'
                    ? 'Minimiza la película mientras buscas otra, ponla flotando encima de otras apps del teléfono o envíala directo al Chromecast del salón.'
                    : 'Minimize while browsing, float video over phone apps with PiP, or cast directly to your living-room Chromecast.'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <PWAInstallNotification lang={lang} />
    </div>
  );
};

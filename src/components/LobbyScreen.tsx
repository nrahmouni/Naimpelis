import React, { useState } from 'react';
import { ArrowRight, Shuffle, Play, Globe, Clock, ChevronRight, Sparkles } from 'lucide-react';
import { AppLanguage } from '../types';
import { UI_COPY } from '../utils/i18n';
import { RecentRoomEntry, StoredProfile } from '../utils/storage';
import { playNaimcineIntroSound, triggerHaptic } from '../utils/haptics';
import lobbyHeroImg from '../assets/images/cinema_hero_lobby_1794353709142.jpg';
import naimLogo from '../assets/images/naimcine_brand_logo_1794356559353.jpg';

const AVATAR_OPTIONS = ['🍿', '🎬', '⚽', '🏎️', '🎧', '🦊', '🦁', '⚡'];
const ACCENT_COLORS = ['#e11d48', '#f59e0b', '#10b981', '#0ea5e9', '#8b5cf6', '#ec4899'];
const RANDOM_NAMES = [
  'Cineasta_VIP',
  'NaimSquad',
  'NocheDeSeries',
  'GolazoLive',
  'ButacaOro',
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
  const [avatar, setAvatar] = useState(initialProfile.avatar);
  const [color, setColor] = useState(initialProfile.color);
  const [roomCode, setRoomCode] = useState('');
  const [heroImgFailed, setHeroImgFailed] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
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
    };
  };

  const handleCreateRoom = () => {
    const profile = buildProfile();
    if (!profile) return;
    triggerHaptic('success');
    playNaimcineIntroSound();
    const code = `naim-${Math.random().toString(36).slice(2, 6)}`;
    onEnterRoom(code, profile, `Sala de ${profile.name}`);
  };

  const handleJoinByCode = (e: React.FormEvent) => {
    e.preventDefault();
    const profile = buildProfile();
    if (!profile) return;
    const cleanCode = roomCode
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-_]/g, '');
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

  return (
    <div className="min-h-dvh w-full bg-[#090A0F] text-[#F4F5F8] flex flex-col pt-safe pb-safe">
      {/* Clean 3-Zone Top Bar */}
      <header className="w-full max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl overflow-hidden bg-[#12141D] border border-white/15 shadow-lg shadow-[#E11D48]/30 flex items-center justify-center shrink-0">
            {!logoFailed ? (
              <img
                src={naimLogo}
                alt="NAIMCINE"
                onError={() => setLogoFailed(true)}
                className="w-full h-full object-cover scale-110"
              />
            ) : (
              <span className="font-display font-bold text-lg text-[#E11D48]">N</span>
            )}
          </div>
          <div className="flex flex-col">
            <span className="font-display font-bold text-base sm:text-lg tracking-wider text-white leading-none whitespace-nowrap">
              NAIM<span className="text-[#E11D48]">CINE</span>
            </span>
            <span className="text-[10px] text-zinc-400 hidden sm:inline whitespace-nowrap">
              {lang === 'es' ? 'Películas · Series · Fútbol · YouTube' : 'Movies · Series · Sports · YouTube'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              triggerHaptic('medium');
              onReplayIntro();
            }}
            className="min-h-[44px] px-3 rounded-xl bg-[#12141D] hover:bg-[#191C28] border border-white/[0.08] text-xs font-medium text-zinc-200 flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            title="Ver animación de entrada NAIMCINE"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#FB7185]" />
            <span className="hidden sm:inline">Intro</span>
          </button>

          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onChangeLang(lang === 'es' ? 'en' : 'es');
            }}
            className="min-h-[44px] px-3.5 rounded-xl bg-[#12141D] hover:bg-[#191C28] border border-white/[0.08] text-xs font-medium text-zinc-200 flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E11D48]"
          >
            <Globe className="w-4 h-4 text-zinc-400" />
            <span>{lang === 'es' ? 'ES · Español' : 'EN · English'}</span>
          </button>
        </div>
      </header>

      {/* Mobile-First Main Container -> 12-Col Architectural Desktop Split */}
      <main className="flex-1 w-full max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8 pb-8 pt-1 lg:py-6 flex lg:items-center">
        <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 lg:gap-8 items-stretch">
          {/* Left / Top Cinema Showcase */}
          <section className="lg:col-span-7 relative rounded-3xl overflow-hidden border border-white/[0.08] bg-[#12141D] min-h-[225px] sm:min-h-[310px] lg:min-h-[600px] flex flex-col justify-end p-5 sm:p-8 lg:p-11">
            {!heroImgFailed ? (
              <img
                src={lobbyHeroImg}
                alt="NAIMCINE Private Screening Room"
                referrerPolicy="no-referrer"
                onError={() => setHeroImgFailed(true)}
                className="absolute inset-0 w-full h-full object-cover object-center"
              />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-[#231129] via-[#12141D] to-[#090A0F]" />
            )}

            {/* Measured Multi-Stop Contrast Scrim */}
            <div className="absolute inset-0 bg-gradient-to-t from-[#090A0F] via-[#090A0F]/80 to-black/20" />
            <div className="hidden lg:block absolute inset-0 bg-gradient-to-r from-[#090A0F]/75 via-transparent to-transparent" />

            <div className="relative z-10 max-w-2xl space-y-2.5 sm:space-y-4">
              <p className="text-xs font-semibold text-[#FB7185] tracking-wide">
                {t.appTagline}
              </p>
              <h1 className="font-display font-bold text-2xl sm:text-4xl lg:text-[44px] leading-[1.1] tracking-tight text-white text-balance">
                {t.heroHeadline}
              </h1>
              <p className="hidden sm:block text-sm sm:text-base text-zinc-300 leading-relaxed max-w-[56ch]">
                {t.heroDescription}
              </p>

              <div className="pt-2.5 sm:pt-4 border-t border-white/10 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-300">
                <span>Películas ES & Bingetrix EN</span>
                <span className="text-zinc-600" aria-hidden="true">·</span>
                <span>Series Completas</span>
                <span className="text-zinc-600" aria-hidden="true">·</span>
                <span>LaLiga, Champions & F1</span>
                <span className="text-zinc-600 hidden sm:inline" aria-hidden="true">·</span>
                <span className="hidden sm:inline">YouTube Sincronizado</span>
              </div>
            </div>
          </section>

          {/* Right / Thumb-Zone Onboarding Studio */}
          <section className="lg:col-span-5 rounded-3xl bg-[#12141D] border border-white/[0.08] p-5 sm:p-7 lg:p-8 flex flex-col justify-between gap-6">
            <div className="space-y-5">
              <div>
                <h2 className="font-display font-semibold text-lg sm:text-xl text-white tracking-tight">
                  {lang === 'es' ? 'Tu pase privado a NAIMCINE' : 'Your private NAIMCINE pass'}
                </h2>
                <p className="text-xs sm:text-sm text-zinc-400 mt-0.5">
                  {lang === 'es'
                    ? 'Crea una sala en un toque, invita a tus amigos por WhatsApp y elegid qué ver juntos.'
                    : 'Create a room in one tap, share the link with friends, and pick what to watch together.'}
                </p>
              </div>

              {/* Nickname Input (16px text-base on mobile prevents browser zoom) */}
              <div className="space-y-2">
                <label
                  htmlFor="lobby-nickname"
                  className="block text-xs font-medium text-zinc-300"
                >
                  {t.nicknameLabel}
                </label>
                <div className="flex items-center gap-2">
                  <div
                    className="w-12 h-12 rounded-2xl flex items-center justify-center text-xl shrink-0 border"
                    style={{
                      backgroundColor: `${color}20`,
                      borderColor: `${color}55`,
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
                    placeholder={t.nicknamePlaceholder}
                    maxLength={24}
                    className={`flex-1 min-w-0 h-12 px-4 rounded-2xl bg-[#090A0F] border ${
                      nameError ? 'border-rose-500' : 'border-white/10 focus:border-white/35'
                    } text-base sm:text-sm text-white placeholder:text-zinc-500 outline-none transition-colors`}
                  />
                  <button
                    type="button"
                    onClick={handleRandomName}
                    aria-label="Generar nombre aleatorio"
                    className="w-12 h-12 rounded-2xl bg-[#191C28] hover:bg-[#232738] active:scale-95 border border-white/[0.08] flex items-center justify-center text-zinc-300 transition-all shrink-0 cursor-pointer"
                  >
                    <Shuffle className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Touch-First Avatar Strip (48x48px hitboxes) */}
              <div className="space-y-2">
                <span className="block text-xs font-medium text-zinc-400">
                  {t.avatarLabel}
                </span>
                <div className="flex sm:grid sm:grid-cols-8 items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
                  {AVATAR_OPTIONS.map((item) => {
                    const selected = avatar === item;
                    return (
                      <button
                        key={item}
                        type="button"
                        onClick={() => {
                          triggerHaptic('light');
                          setAvatar(item);
                        }}
                        className={`min-w-[48px] sm:min-w-0 h-12 rounded-2xl flex items-center justify-center text-xl transition-all shrink-0 cursor-pointer ${
                          selected
                            ? 'bg-white/15 border border-white/40 scale-[1.03]'
                            : 'bg-[#090A0F] border border-white/[0.06] hover:bg-white/[0.06]'
                        }`}
                      >
                        {item}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Accent Swatches with >=44x44px Touch Hitboxes */}
              <div className="space-y-1.5">
                <span className="block text-xs font-medium text-zinc-400">
                  {t.accentLabel}
                </span>
                <div className="flex items-center gap-1.5">
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
                        className="w-11 h-11 rounded-2xl flex items-center justify-center cursor-pointer hover:bg-white/[0.04] transition-colors"
                      >
                        <span
                          className={`w-7 h-7 rounded-full transition-transform ${
                            active
                              ? 'scale-110 ring-2 ring-white ring-offset-2 ring-offset-[#12141D]'
                              : 'opacity-75'
                          }`}
                          style={{ backgroundColor: hex }}
                        />
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Natural Thumb-Zone Primary CTAs */}
            <div className="space-y-4 pt-4 border-t border-white/[0.08]">
              <button
                type="button"
                onClick={handleCreateRoom}
                className="w-full min-h-[50px] px-5 rounded-2xl bg-[#E11D48] hover:bg-[#BE123C] active:scale-[0.98] text-white font-semibold text-sm sm:text-base flex items-center justify-center gap-2.5 shadow-lg shadow-[#E11D48]/25 transition-all whitespace-nowrap cursor-pointer"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>{t.createRoomBtn}</span>
              </button>

              <form onSubmit={handleJoinByCode} className="space-y-2">
                <label
                  htmlFor="lobby-room-code"
                  className="block text-xs font-medium text-zinc-400"
                >
                  {t.joinRoomLabel}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="lobby-room-code"
                    type="text"
                    value={roomCode}
                    onChange={(e) => setRoomCode(e.target.value)}
                    placeholder={t.roomCodePlaceholder}
                    className="flex-1 min-w-0 h-12 px-4 rounded-2xl bg-[#090A0F] border border-white/10 focus:border-white/35 text-base sm:text-sm text-white placeholder:text-zinc-500 outline-none font-mono"
                  />
                  <button
                    type="submit"
                    disabled={!roomCode.trim()}
                    className="min-h-[48px] px-5 rounded-2xl bg-[#191C28] hover:bg-[#232838] active:scale-[0.98] disabled:opacity-40 border border-white/10 text-sm font-semibold text-white flex items-center gap-1.5 transition-all whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed"
                  >
                    <span>{t.joinBtn}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </form>

              {recentRooms.length > 0 && (
                <div className="space-y-2 pt-1">
                  <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{t.recentRooms}</span>
                  </div>
                  <div className="space-y-1.5">
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
                        className="w-full min-h-[52px] px-4 py-2.5 rounded-2xl bg-[#090A0F] hover:bg-[#191C28] active:scale-[0.99] border border-white/[0.07] flex items-center justify-between gap-3 text-left transition-all cursor-pointer"
                      >
                        <div className="min-w-0">
                          <div className="text-xs sm:text-sm font-semibold text-white truncate">
                            {room.name}
                          </div>
                          <div className="text-[11px] font-mono text-zinc-400 truncate">
                            #{room.id}
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-zinc-500 shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
};

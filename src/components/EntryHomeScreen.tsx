import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  Trophy,
  Gamepad2,
  Check,
  Pencil,
  Dices,
  Spade,
  CircleDot,
  Mic,
} from 'lucide-react';
import type {
  AppLanguage,
  CatalogMovie,
  SpanishTdtChannel,
  SportsMatch,
  WatchHistoryItem,
} from '../types';
import type { PrimaryWorldId } from '../store/useAppStore';
import { pickLang } from '../utils/i18n';
import { triggerHaptic } from '../utils/haptics';
import { generateRandomGuestName } from '../utils/storage';
import { PosterImage } from './ui/PosterImage';
import { UniversalHomeSearch } from './home/UniversalHomeSearch';
import { PWAInstallLandingCard } from './PWAInstallPrompt';
import { FlagBadgeSvg, type FlagCode } from './ui/LanguageBadge';
import {
  RiffanArrowRightIcon,
  RiffanChannelsIcon,
  RiffanChevronRightIcon,
  RiffanClockIcon,
  RiffanMoviesIcon,
  RiffanPlayIcon,
  RiffanSurpriseIcon,
  RiffanUsersIcon,
} from './ui/RiffanIcons';

interface EntryHomeScreenProps {
  lang: AppLanguage;
  displayName: string;
  isGuestName: boolean;
  onUpdateDisplayName: (nextName: string) => void;
  watchHistory: WatchHistoryItem[];
  onResumeHistoryItem: (item: WatchHistoryItem) => void;
  onOpenContinueWatchingAll: () => void;
  onOpenSurpriseMe: () => void;
  onSelectWorld: (
    world: PrimaryWorldId,
    originRect?: { left: number; top: number; width: number; height: number }
  ) => void;
  onPreloadWorld?: (world: PrimaryWorldId) => void;
  lastUsedWorld: PrimaryWorldId | null;
  liveMatchesCount: number;
  roomParticipantsCount: number;
  movies?: CatalogMovie[];
  series?: CatalogMovie[];
  tdtChannels?: SpanishTdtChannel[];
  liveMatches?: SportsMatch[];
  onPlayMovie?: (movie: CatalogMovie) => void;
  onPlaySeries?: (series: CatalogMovie, targetSeason?: number, targetEpisode?: number) => void;
  onPlayChannel?: (channel: SpanishTdtChannel) => void;
  onPlayMatch?: (match: SportsMatch) => void;
  onSelectGame?: (gameId: string) => void;
  onOpenVoiceAssistant?: () => void;
  onOpenDesignSystem?: () => void;
  onChangeLang?: (lang: AppLanguage) => void;
}

/** Subtle animated audio waveform bars strictly inside the Sala badge */
const SalaVoiceWaves: React.FC = () => (
  <span className="inline-flex items-end gap-[2px] h-3" aria-hidden="true">
    {[0.45, 0.9, 1, 0.6].map((multiplier, i) => (
      <motion.span
        key={i}
        animate={{ height: ['4px', `${11 * multiplier}px`, '4px'] }}
        transition={{
          duration: 1.15,
          repeat: Infinity,
          delay: i * 0.16,
          ease: 'easeInOut',
        }}
        className="w-[2px] rounded-full bg-[#00F593]"
      />
    ))}
  </span>
);

export const EntryHomeScreen: React.FC<EntryHomeScreenProps> = ({
  lang,
  displayName,
  isGuestName,
  onUpdateDisplayName,
  watchHistory,
  onResumeHistoryItem,
  onOpenContinueWatchingAll,
  onOpenSurpriseMe,
  onSelectWorld,
  onPreloadWorld,
  lastUsedWorld,
  liveMatchesCount,
  roomParticipantsCount,
  movies = [],
  series = [],
  tdtChannels = [],
  liveMatches = [],
  onPlayMovie = () => {},
  onPlaySeries = () => {},
  onPlayChannel = () => {},
  onPlayMatch = () => {},
  onSelectGame = () => {},
  onOpenVoiceAssistant,
  onOpenDesignSystem,
  onChangeLang,
}) => {
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(displayName);
  const [spotlightPos, setSpotlightPos] = useState<Record<string, { x: number; y: number }>>({});

  const handleSaveName = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleaned = nameDraft.trim();
    if (cleaned.length >= 2) {
      triggerHaptic('light');
      onUpdateDisplayName(cleaned);
    } else if (cleaned.length === 0) {
      triggerHaptic('light');
      const fallbackNick = generateRandomGuestName(displayName);
      setNameDraft(fallbackNick);
      onUpdateDisplayName(fallbackNick);
    } else {
      setNameDraft(displayName);
    }
    setEditingName(false);
  };

  const handleCardPointerMove = (id: string, e: React.PointerEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 100);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * 100);
    setSpotlightPos((prev) => ({ ...prev, [id]: { x, y } }));
  };

  const handleCardClick = (
    worldId: PrimaryWorldId,
    e?: React.MouseEvent<HTMLButtonElement>
  ) => {
    triggerHaptic('medium');
    const r = e?.currentTarget?.getBoundingClientRect();
    const originRect = r
      ? { left: r.left, top: r.top, width: r.width, height: r.height }
      : undefined;
    onSelectWorld(worldId, originRect);
  };

  const heroPosters = useMemo(
    () => movies.filter((m) => Boolean(m.poster)).slice(0, 4),
    [movies]
  );

  const featuredChannels = useMemo(
    () =>
      tdtChannels.length > 0
        ? tdtChannels.slice(0, 6).map((ch) => ({
            id: ch.id,
            mark: ch.shortMark || ch.name.slice(0, 3),
            tone: ch.brandTone || '#38BDF8',
          }))
        : [
            { id: 'la1', mark: '1', tone: '#0284C7' },
            { id: 'a3', mark: 'A3', tone: '#EA580C' },
            { id: 't5', mark: '5', tone: '#2563EB' },
            { id: 'mov', mark: 'M+', tone: '#10B981' },
          ],
    [tdtChannels]
  );

  const featuredLiveMatch = useMemo(() => {
    const liveOne = liveMatches.find((m) => m.isLive) || liveMatches[0];
    if (!liveOne) return null;
    const meta = liveOne.matchMeta;
    if (meta?.homeShort && meta?.awayShort) {
      const hasScore =
        meta.homeScore !== undefined &&
        meta.awayScore !== undefined &&
        /^\d+$/.test(String(meta.homeScore).trim()) &&
        /^\d+$/.test(String(meta.awayScore).trim());
      if (liveOne.isLive && hasScore) {
        return `${meta.homeShort} ${meta.homeScore} - ${meta.awayScore} ${meta.awayShort} · ${pickLang(
          lang,
          { es: 'En vivo', ca: 'En directe', en: 'Live' }
        )}`;
      }
      const statusSuffix = liveOne.isLive
        ? pickLang(lang, { es: 'En vivo', ca: 'En directe', en: 'Live' })
        : liveOne.time || pickLang(lang, { es: 'Hoy', ca: 'Avui', en: 'Today' });
      return `${meta.homeShort} vs ${meta.awayShort} · ${statusSuffix}`;
    }
    return liveOne.time ? `${liveOne.title} · ${liveOne.time}` : liveOne.title;
  }, [liveMatches, lang]);

  const greetingWord = pickLang(lang, { es: 'Hola', ca: 'Hola', en: 'Hi', zh: '你好', rif: 'Azul' });

  const renderSpotlightOverlay = (id: string) => {
    const pos = spotlightPos[id] || { x: 50, y: 50 };
    return (
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style={{
          background: `radial-gradient(240px circle at ${pos.x}% ${pos.y}%, rgba(255,255,255,0.06), transparent 72%)`,
        }}
      />
    );
  };

  return (
    <div className="relative w-full overflow-x-hidden">
      <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 pt-3 sm:pt-5 pb-20 sm:pb-24 pb-[calc(env(safe-area-inset-bottom,0px)+5.5rem)] space-y-4 sm:space-y-5 @container">
        {/* 1. COMPACT EDITORIAL GREETING */}
        <section className="flex items-end justify-between gap-3">
          <div className="min-w-0 space-y-0.5">
            {editingName ? (
              <form onSubmit={handleSaveName} className="flex items-center gap-2 max-w-sm">
                <input
                  type="text"
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  maxLength={24}
                  autoFocus
                  aria-label={pickLang(lang, {
                    es: 'Tu nombre',
                    ca: 'El teu nom',
                    en: 'Your name',
                  })}
                  className="flex-1 min-h-11 px-3.5 rounded-xl bg-white/[0.06] border border-[#9146FF] text-base font-display font-bold text-white focus:outline-none"
                />
                <button
                  type="submit"
                  className="min-h-11 min-w-11 px-3.5 rounded-xl bg-[#9146FF] hover:bg-[#7C2AE8] text-white font-bold flex items-center justify-center cursor-pointer active:scale-95 transition-all"
                  aria-label={pickLang(lang, { es: 'Guardar', ca: 'Desar', en: 'Save' })}
                >
                  <Check className="w-4 h-4" />
                </button>
              </form>
            ) : (
              <div className="flex items-center gap-2">
                {isGuestName ? (
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      setNameDraft(displayName);
                      setEditingName(true);
                    }}
                    className="group inline-flex items-center gap-2 text-left cursor-pointer rounded-xl focus:outline-none"
                    title={pickLang(lang, {
                      es: 'Toca para cambiar tu nombre',
                      ca: 'Toca per canviar el teu nom',
                      en: 'Tap to change your name',
                    })}
                  >
                    <h1 className="font-display font-bold text-[1.45rem] sm:text-[1.85rem] leading-tight tracking-tight text-white truncate">
                      {greetingWord}, {displayName}
                    </h1>
                    <span className="w-7 h-7 rounded-full bg-white/[0.06] group-hover:bg-[#9146FF]/25 border border-white/[0.08] flex items-center justify-center text-zinc-400 group-hover:text-white transition-colors shrink-0">
                      <Pencil className="w-3 h-3" />
                    </span>
                  </button>
                ) : (
                  <h1 className="font-display font-bold text-[1.45rem] sm:text-[1.85rem] leading-tight tracking-tight text-white truncate">
                    {greetingWord}, {displayName}
                  </h1>
                )}
              </div>
            )}

            <p className="text-xs sm:text-sm text-zinc-400 font-medium">
              {pickLang(lang, {
                es: '¿Qué quieres ver hoy?',
                ca: 'Què vols veure avui?',
                en: 'What do you want to watch today?',
                zh: '今天想看点什么？',
              })}
            </p>
          </div>

          {onOpenVoiceAssistant && (
            <button
              type="button"
              onClick={() => {
                triggerHaptic('medium');
                onOpenVoiceAssistant();
              }}
              aria-label={pickLang(lang, {
                es: 'Asistente de voz Gemini Live',
                ca: 'Assistent de veu Gemini Live',
                en: 'Gemini Live Voice Assistant',
                zh: '语音助手',
              })}
              title={pickLang(lang, {
                es: 'Asistente de voz',
                ca: 'Assistent de veu',
                en: 'Voice assistant',
              })}
              className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#9146FF] to-[#6D28D9] hover:from-[#A970FF] hover:to-[#7C2AE8] border border-white/20 text-white flex items-center justify-center shrink-0 cursor-pointer active:scale-95 transition-all shadow-[0_8px_22px_rgba(145,70,255,0.38)]"
            >
              <Mic className="w-5 h-5" />
            </button>
          )}
        </section>

        {/* 2. UNIVERSAL SMART AI SEARCH */}
        <section
          aria-label={pickLang(lang, {
            es: 'Buscador inteligente',
            ca: 'Cercador intel·ligent',
            en: 'Smart search',
          })}
        >
          <UniversalHomeSearch
            lang={lang}
            movies={movies}
            series={series}
            tdtChannels={tdtChannels}
            liveMatches={liveMatches}
            onPlayMovie={onPlayMovie}
            onPlaySeries={onPlaySeries}
            onPlayChannel={onPlayChannel}
            onPlayMatch={onPlayMatch}
            onSelectGame={onSelectGame}
          />
        </section>

        {/* 3. CONDITIONAL CONTINUE WATCHING RAIL */}
        {watchHistory.length > 0 && (
          <section className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display font-semibold text-sm sm:text-base text-white flex items-center gap-2">
                <RiffanClockIcon size={17} animate="hover" />
                <span>
                  {pickLang(lang, {
                    es: 'Continuar viendo',
                    ca: 'Continuar veient',
                    en: 'Continue watching',
                  })}
                </span>
              </h2>
              {watchHistory.length > 4 && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    onOpenContinueWatchingAll();
                  }}
                  className="min-h-10 px-2.5 rounded-xl text-xs font-semibold text-[#BF94FF] hover:text-white inline-flex items-center gap-1 cursor-pointer transition-colors group"
                >
                  <span>{pickLang(lang, { es: 'Ver todo', ca: 'Veure-ho tot', en: 'See all' })}</span>
                  <RiffanChevronRightIcon size={14} animate="hover" />
                </button>
              )}
            </div>

            <div className="scroll-snap-x flex gap-3 overflow-x-auto pb-1 no-scrollbar">
              {watchHistory.slice(0, 10).map((item) => {
                const pct =
                  item.durationSec && item.durationSec > 0 && item.resumeTimeSec
                    ? Math.min(96, Math.max(8, Math.round((item.resumeTimeSec / item.durationSec) * 100)))
                    : 24;
                const epBadge =
                  item.mediaType === 'tv' && item.season && item.episode
                    ? `T${item.season}·E${item.episode}`
                    : null;
                const cleanedSubtitle = item.subtitle
                  ? epBadge
                    ? item.subtitle
                        .replace(/^(?:\d+\s*x\s*\d+|T\d+\s*[·:\-]?\s*E\d+)\s*(?:[·\-:|]\s*)?/i, '')
                        .trim() || item.subtitle
                    : item.subtitle
                  : '';

                return (
                  <button
                    key={`${item.id}-${item.watchedAt}`}
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      onResumeHistoryItem(item);
                    }}
                    className="scroll-snap-item w-[164px] sm:w-[185px] shrink-0 rounded-2xl bg-[#10121B] border border-white/[0.08] hover:border-[#9146FF]/60 overflow-hidden text-left group active:scale-[0.97] transition-all cursor-pointer"
                  >
                    <div className="relative aspect-video w-full bg-[#090A0F]">
                      <PosterImage
                        src={item.backdrop || item.poster}
                        alt={item.title}
                        aspect="video"
                        fallbackTitle={item.title}
                        imgClassName="sm:group-hover:scale-105 transition-transform duration-300"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
                      <span className="absolute inset-0 flex items-center justify-center">
                        <span className="w-9 h-9 rounded-full bg-black/65 backdrop-blur-md border border-white/20 flex items-center justify-center text-white group-hover:bg-[#9146FF] group-hover:border-[#9146FF] transition-colors">
                          <RiffanPlayIcon size={16} tone="current" animate="hover" />
                        </span>
                      </span>
                      {epBadge && (
                        <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-md bg-black/80 text-[10px] font-bold text-white tabular-nums">
                          {epBadge}
                        </span>
                      )}
                      <div className="absolute inset-x-0 bottom-0 h-[3.5px] bg-white/20">
                        <div className="h-full bg-[#9146FF] shadow-[0_0_8px_rgba(145,70,255,0.75)]" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    <div className="p-2.5">
                      <p className="text-xs font-semibold text-white leading-snug line-clamp-2 min-h-[2.1rem]">
                        {item.title}
                      </p>
                      {cleanedSubtitle ? (
                        <p className="text-[11px] text-zinc-400 truncate mt-1">
                          {cleanedSubtitle}
                        </p>
                      ) : (
                        <p className="text-[11px] text-zinc-500 truncate mt-1">
                          {item.year ? `${item.year}` : ''}
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* 4. CURATED OBSIDIAN BENTO HUB (ZERO OVERLAP, CLEAN HIERARCHY) */}
        <section className="grid grid-cols-2 md:grid-cols-6 gap-3 sm:gap-4">
          {/* HERO CARD: CINE Y SERIES (col-span-2 mobile, md:col-span-4 desktop) */}
          <motion.button
            type="button"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            whileTap={{ scale: 0.98 }}
            onPointerEnter={() => onPreloadWorld?.('cine')}
            onTouchStart={() => onPreloadWorld?.('cine')}
            onPointerMove={(e) => handleCardPointerMove('cine', e)}
            onClick={(e) => handleCardClick('cine', e)}
            className="group relative col-span-2 md:col-span-4 md:order-1 rounded-3xl p-4 sm:p-6 min-h-[154px] sm:min-h-[188px] bg-[#10121C] hover:bg-[#131624] border border-white/[0.09] hover:border-[#9146FF]/55 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_14px_34px_rgba(0,0,0,0.45)] text-left flex flex-col justify-between overflow-hidden cursor-pointer transition-all duration-200"
          >
            {renderSpotlightOverlay('cine')}

            {/* Restrained electric violet corner aura */}
            <div
              aria-hidden="true"
              className="absolute -bottom-16 right-8 w-56 h-56 rounded-full bg-[#9146FF]/18 blur-3xl pointer-events-none group-hover:bg-[#9146FF]/28 transition-colors duration-300"
            />

            {/* Right-anchored bright fanned poster showcase */}
            <div
              aria-hidden="true"
              className="absolute right-0 top-0 bottom-0 w-[46%] sm:w-[48%] pointer-events-none overflow-hidden select-none"
            >
              {heroPosters.length > 0 ? (
                <div className="relative w-full h-full flex items-center justify-end pr-2 sm:pr-4 pt-1">
                  {heroPosters.slice(0, 3).map((m, idx) => {
                    const offsets = [
                      'right-16 sm:right-24 bottom-3 sm:bottom-4 -rotate-8 opacity-80 scale-90',
                      'right-8 sm:right-12 bottom-4 sm:bottom-5 rotate-2 opacity-95 scale-95 z-[1]',
                      'right-1 sm:right-2 bottom-3 sm:bottom-4 rotate-8 opacity-100 z-[2]',
                    ];
                    return (
                      <div
                        key={m.id || idx}
                        className={`absolute w-[70px] h-[102px] sm:w-[92px] sm:h-[132px] rounded-xl overflow-hidden border border-white/25 bg-[#181A28] shadow-[0_14px_30px_rgba(0,0,0,0.65)] transition-transform duration-300 group-hover:-translate-y-1.5 ${
                          offsets[idx] || offsets[0]
                        }`}
                      >
                        <img
                          src={m.poster}
                          alt=""
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover brightness-110 contrast-105"
                          loading="lazy"
                        />
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="relative w-full h-full flex items-end justify-end pr-4 pb-2 opacity-55">
                  <div className="w-20 h-28 rounded-xl border border-white/15 bg-gradient-to-br from-[#9146FF]/25 to-transparent -rotate-6 translate-x-4" />
                  <div className="w-20 h-28 rounded-xl border border-white/20 bg-gradient-to-br from-white/[0.1] to-transparent rotate-6" />
                </div>
              )}
              {/* Smooth left-side text protection without darkening posters */}
              <div className="absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-[#10121C] via-[#10121C]/55 to-transparent" />
            </div>

            {/* Clean Left Text Zone */}
            <div className="relative z-10 flex items-center gap-2 text-xs font-medium text-zinc-400">
              <span className="w-7 h-7 rounded-lg bg-[#9146FF]/18 border border-[#9146FF]/35 flex items-center justify-center text-[#D8B4FE] shrink-0">
                <RiffanMoviesIcon size={15} animate="hover" />
              </span>
              {lastUsedWorld === 'cine' ? (
                <span className="text-[#C4A7FF] font-semibold">
                  {pickLang(lang, { es: 'Reciente', ca: 'Recent', en: 'Recent' })}
                </span>
              ) : (
                <span>{pickLang(lang, { es: 'Catálogo 4K', ca: 'Catàleg 4K', en: '4K Catalog' })}</span>
              )}
            </div>

            <div className="relative z-10 max-w-[62%] sm:max-w-[56%] space-y-1 mt-3">
              <h2 className="font-display font-bold text-lg sm:text-2xl text-white tracking-tight leading-tight">
                {pickLang(lang, { es: 'Cine y Series', ca: 'Cine i Sèries', en: 'Movies & Series' })}
              </h2>
              <p className="text-xs sm:text-[13px] text-zinc-400 leading-snug line-clamp-2">
                {pickLang(lang, {
                  es: 'Películas, series y anime en 4K',
                  ca: 'Pel·lícules, sèries i anime en 4K',
                  en: 'Movies, series & anime in 4K',
                })}
              </p>
              <div className="pt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-[#C4A7FF] group-hover:text-white transition-colors">
                <span>{pickLang(lang, { es: 'Explorar', ca: 'Explorar', en: 'Browse' })}</span>
                <RiffanArrowRightIcon size={14} animate="hover" />
              </div>
            </div>
          </motion.button>

          {/* CARD 2: FÚTBOL (col-span-1 mobile order-2, md:col-span-2 md:order-3 desktop) */}
          <motion.button
            type="button"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: 0.04 }}
            whileTap={{ scale: 0.97 }}
            onPointerEnter={() => onPreloadWorld?.('futbol')}
            onTouchStart={() => onPreloadWorld?.('futbol')}
            onPointerMove={(e) => handleCardPointerMove('futbol', e)}
            onClick={(e) => handleCardClick('futbol', e)}
            className="group relative col-span-1 md:col-span-2 md:order-3 rounded-3xl p-4 sm:p-5 min-h-[144px] sm:min-h-[168px] bg-[#10121B] hover:bg-[#131722] border border-white/[0.08] hover:border-emerald-400/45 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_10px_28px_rgba(0,0,0,0.42)] text-left flex flex-col justify-between overflow-hidden cursor-pointer transition-all duration-200"
          >
            {renderSpotlightOverlay('futbol')}

            {/* Soft architectural pitch arc watermark strictly in top-right */}
            <svg
              aria-hidden="true"
              viewBox="0 0 120 120"
              className="absolute -top-6 -right-6 w-28 h-28 text-emerald-400 opacity-[0.08] pointer-events-none"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <circle cx="90" cy="30" r="34" />
              <circle cx="90" cy="30" r="14" />
            </svg>

            <div className="relative z-10 flex items-center justify-between gap-2">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/12 border border-emerald-400/25 flex items-center justify-center text-emerald-400 shrink-0 group-hover:scale-105 transition-transform">
                <Trophy className="w-4 h-4" />
              </div>

              {liveMatchesCount > 0 ? (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#EB0400] text-white text-[10px] font-bold leading-none tabular-nums">
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                  <span>
                    {pickLang(lang, {
                      es: `${liveMatchesCount} en vivo`,
                      ca: `${liveMatchesCount} en directe`,
                      en: `${liveMatchesCount} live`,
                    })}
                  </span>
                </span>
              ) : lastUsedWorld === 'futbol' ? (
                <span className="text-[11px] font-semibold text-emerald-300">
                  {pickLang(lang, { es: 'Reciente', ca: 'Recent', en: 'Recent' })}
                </span>
              ) : (
                <span className="text-[11px] font-medium text-zinc-500">
                  {pickLang(lang, { es: 'Hoy', ca: 'Avui', en: 'Today' })}
                </span>
              )}
            </div>

            <div className="relative z-10 min-w-0 space-y-1 pt-4">
              <h2 className="font-display font-bold text-base sm:text-lg text-white tracking-tight leading-snug">
                {pickLang(lang, { es: 'Fútbol', ca: 'Futbol', en: 'Football' })}
              </h2>
              <p className="text-xs text-zinc-400 leading-snug line-clamp-2">
                {featuredLiveMatch
                  ? featuredLiveMatch
                  : pickLang(lang, {
                      es: 'Partidos de hoy y señales en vivo',
                      ca: "Partits d'avui i senyals en directe",
                      en: "Today's matches & live feeds",
                    })}
              </p>
            </div>
          </motion.button>

          {/* CARD 3: TV EN DIRECTO (col-span-1 mobile order-3, md:col-span-2 md:order-4 desktop) */}
          <motion.button
            type="button"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: 0.08 }}
            whileTap={{ scale: 0.97 }}
            onPointerEnter={() => onPreloadWorld?.('tv')}
            onTouchStart={() => onPreloadWorld?.('tv')}
            onPointerMove={(e) => handleCardPointerMove('tv', e)}
            onClick={(e) => handleCardClick('tv', e)}
            className="group relative col-span-1 md:col-span-2 md:order-4 rounded-3xl p-4 sm:p-5 min-h-[144px] sm:min-h-[168px] bg-[#10121B] hover:bg-[#131724] border border-white/[0.08] hover:border-sky-400/45 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_10px_28px_rgba(0,0,0,0.42)] text-left flex flex-col justify-between overflow-hidden cursor-pointer transition-all duration-200"
          >
            {renderSpotlightOverlay('tv')}

            <div
              aria-hidden="true"
              className="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-sky-500/12 blur-2xl pointer-events-none"
            />
            {/* Translucent drifting channel badges strip in TV Bento background safely away from text */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-3 top-10 flex items-center gap-1.5 opacity-[0.09] group-hover:opacity-[0.18] rotate-2 transition-opacity duration-300"
            >
              {featuredChannels.slice(0, 4).map((ch) => (
                <span
                  key={`bg-${ch.id}`}
                  className="px-2 py-0.5 rounded-lg border border-white/20 text-[10px] font-black text-white"
                  style={{ backgroundColor: ch.tone }}
                >
                  {ch.mark}
                </span>
              ))}
            </div>

            <div className="relative z-10 flex items-center justify-between gap-2">
              <div className="w-9 h-9 rounded-xl bg-sky-500/12 border border-sky-400/25 flex items-center justify-center text-sky-400 shrink-0 group-hover:scale-105 transition-transform">
                <RiffanChannelsIcon size={17} animate="hover" />
              </div>

              {/* Clean mini channel medallions strictly tucked in top-right header */}
              <div className="flex items-center -space-x-1.5" aria-hidden="true">
                {featuredChannels.slice(0, 3).map((ch) => (
                  <span
                    key={ch.id}
                    className="w-6 h-6 rounded-full border border-[#10121B] flex items-center justify-center text-[9px] font-display font-bold text-white shadow-sm"
                    style={{ backgroundColor: ch.tone }}
                  >
                    {ch.mark.slice(0, 2)}
                  </span>
                ))}
              </div>
            </div>

            <div className="relative z-10 min-w-0 space-y-1 pt-4">
              <h2 className="font-display font-bold text-base sm:text-lg text-white tracking-tight leading-snug">
                {pickLang(lang, { es: 'TV en Directo', ca: 'TV en Directe', en: 'Live TV' })}
              </h2>
              <p className="text-xs text-zinc-400 leading-snug line-clamp-2">
                {pickLang(lang, {
                  es: 'TDT, programación y canales 24/7',
                  ca: 'TDT, programació i canals 24/7',
                  en: 'DTT, guide & 24/7 channels',
                })}
              </p>
            </div>
          </motion.button>

          {/* CARD 4: JUEGOS (col-span-1 mobile order-4, md:col-span-2 md:order-5 desktop) */}
          <motion.button
            type="button"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: 0.12 }}
            whileTap={{ scale: 0.97 }}
            onPointerEnter={() => onPreloadWorld?.('juegos')}
            onTouchStart={() => onPreloadWorld?.('juegos')}
            onPointerMove={(e) => handleCardPointerMove('juegos', e)}
            onClick={(e) => handleCardClick('juegos', e)}
            className="group relative col-span-1 md:col-span-2 md:order-5 rounded-3xl p-4 sm:p-5 min-h-[144px] sm:min-h-[168px] bg-[#10121B] hover:bg-[#151422] border border-white/[0.08] hover:border-fuchsia-400/45 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_10px_28px_rgba(0,0,0,0.42)] text-left flex flex-col justify-between overflow-hidden cursor-pointer transition-all duration-200"
          >
            {renderSpotlightOverlay('juegos')}

            <div
              aria-hidden="true"
              className="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-fuchsia-500/12 blur-2xl pointer-events-none"
            />
            {/* Subtle translucent drifting tabletop motif */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute right-2 bottom-2 flex items-center gap-2 opacity-[0.1] group-hover:opacity-[0.2] group-hover:scale-105 transition-all duration-300 text-fuchsia-300"
            >
              <CircleDot className="w-7 h-7 -rotate-12" />
              <Dices className="w-8 h-8 rotate-12" />
              <Spade className="w-6 h-6 -rotate-6" />
            </div>

            <div className="relative z-10 flex items-center justify-between gap-2">
              <div className="w-9 h-9 rounded-xl bg-fuchsia-500/12 border border-fuchsia-400/25 flex items-center justify-center text-fuchsia-400 shrink-0 group-hover:scale-105 transition-transform">
                <Gamepad2 className="w-4 h-4" />
              </div>

              <div className="flex items-center -space-x-1.5" aria-hidden="true">
                {[
                  { Icon: CircleDot, key: 'pool' },
                  { Icon: Dices, key: 'dice' },
                  { Icon: Spade, key: 'cards' },
                ].map(({ Icon, key }) => (
                  <span
                    key={key}
                    className="w-6 h-6 rounded-full bg-[#181A28] border border-white/[0.12] flex items-center justify-center text-fuchsia-300 shadow-sm"
                  >
                    <Icon className="w-3 h-3" />
                  </span>
                ))}
              </div>
            </div>

            <div className="relative z-10 min-w-0 space-y-1 pt-4">
              <h2 className="font-display font-bold text-base sm:text-lg text-white tracking-tight leading-snug">
                {pickLang(lang, { es: 'Juegos', ca: 'Jocs', en: 'Games' })}
              </h2>
              <p className="text-xs text-zinc-400 leading-snug line-clamp-2">
                {pickLang(lang, {
                  es: 'Billar, Parchís, UNO y más',
                  ca: 'Billar, Parxís, UNO i més',
                  en: 'Pool, Parchís, UNO & more',
                })}
              </p>
            </div>
          </motion.button>

          {/* CARD 5: SALA CON AMIGOS (col-span-1 mobile order-5, md:col-span-2 md:order-2 desktop) */}
          <motion.button
            type="button"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: 0.16 }}
            whileTap={{ scale: 0.97 }}
            onPointerEnter={() => onPreloadWorld?.('sala')}
            onTouchStart={() => onPreloadWorld?.('sala')}
            onPointerMove={(e) => handleCardPointerMove('sala', e)}
            onClick={(e) => handleCardClick('sala', e)}
            className="group relative col-span-1 md:col-span-2 md:order-2 rounded-3xl p-4 sm:p-5 min-h-[144px] sm:min-h-[188px] bg-gradient-to-br from-[#17132A] via-[#11131E] to-[#10121B] hover:from-[#1D1736] hover:to-[#131522] border border-[#9146FF]/35 hover:border-[#9146FF]/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_12px_32px_rgba(145,70,255,0.14)] text-left flex flex-col justify-between overflow-hidden cursor-pointer transition-all duration-200"
          >
            {renderSpotlightOverlay('sala')}

            <div
              aria-hidden="true"
              className="absolute -bottom-10 -right-10 w-36 h-36 rounded-full bg-[#9146FF]/20 blur-2xl pointer-events-none"
            />

            <div className="relative z-10 flex items-center justify-between gap-2">
              <div className="w-9 h-9 rounded-xl bg-[#9146FF]/22 border border-[#9146FF]/40 flex items-center justify-center text-[#D8B4FE] shrink-0 group-hover:scale-105 transition-transform">
                <RiffanUsersIcon size={17} animate="hover" />
              </div>

              <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#00F593] tabular-nums">
                <SalaVoiceWaves />
                <span>{roomParticipantsCount > 0 ? roomParticipantsCount : 1}</span>
              </div>
            </div>

            <div className="relative z-10 min-w-0 space-y-1 pt-4">
              <h2 className="font-display font-bold text-base sm:text-lg text-white tracking-tight leading-snug">
                {pickLang(lang, {
                  es: 'Sala con Amigos',
                  ca: 'Sala amb Amics',
                  en: 'Watch Party',
                })}
              </h2>
              <p className="text-xs text-zinc-400 leading-snug line-clamp-2">
                {pickLang(lang, {
                  es: 'Chat, voz y cola compartida',
                  ca: 'Xat, veu i cua compartida',
                  en: 'Live chat, voice & shared queue',
                })}
              </p>
            </div>
          </motion.button>
        </section>

        {/* 5. COMPACT SINGLE-LINE "SORPRÉNDEME" AT THE VERY BOTTOM */}
        <section>
          <motion.button
            type="button"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: 0.18 }}
            whileTap={{ scale: 0.985 }}
            onClick={() => {
              triggerHaptic('light');
              onOpenSurpriseMe();
            }}
            className="w-full min-h-12 px-4 py-2.5 rounded-2xl bg-[#10121B] hover:bg-[#151826] border border-white/[0.08] hover:border-[#9146FF]/55 flex items-center justify-between gap-3 text-left cursor-pointer transition-all duration-200 group"
          >
              <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-[#9146FF]/18 text-[#D8B4FE] border border-[#9146FF]/35 flex items-center justify-center shrink-0 group-hover:bg-[#9146FF] group-hover:text-white transition-colors">
                <RiffanSurpriseIcon size={15} animate="always" />
              </div>
              <span className="font-display font-semibold text-xs sm:text-sm text-white shrink-0">
                {pickLang(lang, {
                  es: 'Sorpréndeme',
                  ca: 'Sorprèn-me',
                  en: 'Surprise me',
                  zh: '随机推荐',
                })}
              </span>
              <span className="text-xs text-zinc-400 truncate">
                ·{' '}
                {pickLang(lang, {
                  es: 'Elige algo al azar',
                  ca: "Tria alguna cosa a l'atzar",
                  en: 'Pick something at random',
                  zh: '随机选一部播放',
                })}
              </span>
            </div>
            <RiffanChevronRightIcon size={16} animate="hover" className="shrink-0" />
          </motion.button>
        </section>

        {/* 6. INSTALAR RIFFANTV + IDIOMAS + QUIET FOOTER LINK */}
        <section className="pt-1 space-y-3">
          <PWAInstallLandingCard lang={lang} alwaysShow />

          {onChangeLang && (
            <div className="rounded-2xl bg-[#10121C]/85 border border-white/[0.08] p-1.5 grid grid-cols-5 gap-1.5">
              {[
                { code: 'en' as AppLanguage, flag: 'en' as FlagCode, label: 'EN', title: 'English' },
                { code: 'es' as AppLanguage, flag: 'es' as FlagCode, label: 'ES', title: 'Español' },
                { code: 'ca' as AppLanguage, flag: 'ca' as FlagCode, label: 'CA', title: 'Català' },
                { code: 'rif' as AppLanguage, flag: 'rif' as FlagCode, label: 'RIF', title: 'Tarifit (Riffian)' },
                { code: 'zh' as AppLanguage, flag: 'zh' as FlagCode, label: 'ZH', title: '中文' },
              ].map((item) => {
                const isSelected = lang === item.code;
                return (
                  <button
                    key={item.code}
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      onChangeLang(item.code);
                    }}
                    title={item.title}
                    aria-label={item.title}
                    className={`min-h-10 px-2 rounded-xl text-xs font-display font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-[0.97] whitespace-nowrap border ${
                      isSelected
                        ? 'bg-[#9146FF] text-white border-[#A970FF]/70 shadow-[0_4px_14px_rgba(145,70,255,0.4)]'
                        : 'bg-transparent hover:bg-white/[0.06] text-zinc-400 hover:text-white border-transparent'
                    }`}
                  >
                    <FlagBadgeSvg code={item.flag} className="w-5 h-3.5 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          )}

          {onOpenDesignSystem && (
            <footer className="flex items-center justify-center pt-1">
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  onOpenDesignSystem();
                }}
                className="px-3 py-1.5 rounded-lg text-[11px] font-medium text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
              >
                {pickLang(lang, {
                  es: 'Acerca de RiffanTV · Identidad y recursos de marca',
                  ca: 'Quant a RiffanTV · Identitat i recursos de marca',
                  en: 'About RiffanTV · Brand identity & media kit',
                })}
              </button>
            </footer>
          )}
        </section>
      </div>
    </div>
  );
};

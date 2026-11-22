import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Check, Mic, Pencil } from 'lucide-react';
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
import { useBackInterceptor } from '../lib/backInterceptor';
import { PosterImage } from './ui/PosterImage';
import { UniversalHomeSearch } from './home/UniversalHomeSearch';
import { EntryHomeBentoGrid } from './home/EntryHomeBentoGrid';
import { BarcaMadridDirectBanner } from './home/BarcaMadridDirectBanner';
import {
  getBarcaMadridHomeMatches,
  hasPendingBarcaMadridMatchToday,
} from './home/barcaMadridHomeHelper';
import {
  RiffanChevronRightIcon,
  RiffanClockIcon,
  RiffanPlayIcon,
  RiffanSurpriseIcon,
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
  suppressSearchOverlay?: boolean;
  onOpenMovieDetails?: (movie: CatalogMovie) => void;
  onOpenSeriesPage?: (series: CatalogMovie) => void;
  onPlayChannel?: (channel: SpanishTdtChannel) => void;
  onPlayMatch?: (match: SportsMatch, channelIndex?: number) => void;
  loadingItemId?: string | null;
  onSelectGame?: (gameId: string) => void;
  onOpenVoiceAssistant?: () => void;
  onOpenDesignSystem?: () => void;
  onChangeLang?: (lang: AppLanguage) => void;
  sessionMode?: 'solo' | 'party';
}

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
  suppressSearchOverlay = false,
  onOpenMovieDetails = () => {},
  onOpenSeriesPage = () => {},
  onPlayChannel = () => {},
  onPlayMatch = () => {},
  loadingItemId = null,
  onSelectGame = () => {},
  onOpenVoiceAssistant,
  sessionMode = 'party',
}) => {
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(displayName);
  const [surprisePulse, setSurprisePulse] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const hasPendingFeaturedMatch = useMemo(
    () => hasPendingBarcaMadridMatchToday(liveMatches, nowMs),
    [liveMatches, nowMs]
  );

  useEffect(() => {
    if (!hasPendingFeaturedMatch) return;
    setNowMs(Date.now());
    const id = window.setInterval(() => {
      setNowMs(Date.now());
    }, 10_000);
    return () => window.clearInterval(id);
  }, [hasPendingFeaturedMatch]);

  const directBarcaMadridMatches = useMemo(
    () => getBarcaMadridHomeMatches(liveMatches, nowMs),
    [liveMatches, nowMs]
  );

  const directBarcaMadridLiveCount = useMemo(
    () =>
      directBarcaMadridMatches.filter(
        (m) => m.isLive || m.matchMeta?.statusState === 'live'
      ).length,
    [directBarcaMadridMatches]
  );

  useBackInterceptor(
    editingName,
    'entry-edit-name',
    () => {
      setNameDraft(displayName);
      setEditingName(false);
    },
    { priority: 7 }
  );

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
    const liveOne =
      directBarcaMadridMatches.find((m) => m.isLive || m.matchMeta?.statusState === 'live') ||
      directBarcaMadridMatches[0];
    if (!liveOne) return null;
    const meta = liveOne.matchMeta;
    if (meta?.homeShort && meta?.awayShort) {
      const hasScore =
        meta.homeScore !== undefined &&
        meta.awayScore !== undefined &&
        /^\d+$/.test(String(meta.homeScore).trim()) &&
        /^\d+$/.test(String(meta.awayScore).trim());
      if ((liveOne.isLive || meta.statusState === 'live') && hasScore) {
        return `${meta.homeShort} ${meta.homeScore} - ${meta.awayScore} ${meta.awayShort}`;
      }
      return `${meta.homeShort} vs ${meta.awayShort}`;
    }
    return liveOne.title;
  }, [directBarcaMadridMatches]);

  const greetingWord = pickLang(lang, { es: 'Hola', ca: 'Hola', en: 'Hi', zh: '你好', rif: 'Azul' });

  return (
    <div className="relative w-full overflow-x-clip">
      <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 pt-4 sm:pt-6 pb-16 space-y-5 @container">
        {/* 1. COMPACT EDITORIAL GREETING */}
        <section className="flex items-end justify-between gap-3">
          <div className="min-w-0 space-y-1">
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
                  className="flex-1 min-h-11 px-3.5 rounded-xl bg-[#0D0D12] border border-[#7C3AED] text-base font-display font-bold text-white focus:outline-none"
                />
                <button
                  type="submit"
                  className="min-h-11 min-w-11 px-3.5 rounded-xl bg-[#7C3AED] hover:bg-[#8B5CF6] text-white font-bold flex items-center justify-center cursor-pointer active:scale-95 transition-all"
                  aria-label={pickLang(lang, { es: 'Guardar', ca: 'Desar', en: 'Save' })}
                >
                  <Check className="w-4 h-4" />
                </button>
              </form>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    setNameDraft(displayName);
                    setEditingName(true);
                  }}
                  className="group inline-flex items-center gap-2.5 text-left cursor-pointer rounded-xl focus:outline-none active:scale-95 transition-transform"
                  title={pickLang(lang, {
                    es: isGuestName ? 'Toca para cambiar tu nombre' : 'Editar apodo',
                    ca: isGuestName ? 'Toca per canviar el teu nom' : 'Editar sobrenom',
                    en: isGuestName ? 'Tap to change your name' : 'Edit nickname',
                  })}
                >
                  <h1 className="font-display font-bold text-[1.45rem] sm:text-[1.85rem] leading-tight tracking-tight text-white">
                    {greetingWord}, {displayName}
                  </h1>
                  <span className="w-8 h-8 rounded-full bg-[#0D0D12] group-hover:bg-white/[0.1] border border-white/[0.08] flex items-center justify-center text-zinc-400 group-hover:text-white transition-colors shrink-0">
                    <Pencil className="w-3.5 h-3.5" />
                  </span>
                </button>
              </div>
            )}

            <p className="text-xs sm:text-sm text-zinc-400 font-normal">
              {pickLang(lang, {
                es: '¿Qué te apetece hoy?',
                ca: 'Què et ve de gust avui?',
                en: 'What do you want to enjoy today?',
                zh: '今天想看点什么或听点什么？',
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
                es: 'Asistente de voz',
                ca: 'Assistent de veu',
                en: 'Voice Assistant',
                zh: '语音助手',
              })}
              title={pickLang(lang, {
                es: 'Asistente de voz',
                ca: 'Assistent de veu',
                en: 'Voice assistant',
              })}
              className="w-11 h-11 rounded-2xl bg-[#0D0D12] hover:bg-[#14141C] border border-white/[0.08] hover:border-[#7C3AED]/50 text-[#A78BFA] hover:text-white flex items-center justify-center shrink-0 cursor-pointer active:scale-95 transition-all"
            >
              <Mic className="w-4.5 h-4.5" />
            </button>
          )}
        </section>

        {/* 2. UNIVERSAL SMART SEARCH (INCLUDING RIFFAN MUSIC) */}
        <section
          aria-label={pickLang(lang, {
            es: 'Buscador universal',
            ca: 'Cercador universal',
            en: 'Universal search',
          })}
        >
          <UniversalHomeSearch
            lang={lang}
            movies={movies}
            series={series}
            tdtChannels={tdtChannels}
            liveMatches={liveMatches}
            suppressOverlay={suppressSearchOverlay}
            onOpenMovieDetails={onOpenMovieDetails}
            onOpenSeriesPage={onOpenSeriesPage}
            onPlayChannel={onPlayChannel}
            onPlayMatch={onPlayMatch}
            onSelectGame={onSelectGame}
            onOpenMusicWorld={() => onSelectWorld('music')}
          />
        </section>

        {/* 3. DIRECT BARÇA / REAL MADRID PLAY CARD (ONLY 30 MIN BEFORE KICKOFF OR LIVE; REMOVED WHEN FINISHED) */}
        <BarcaMadridDirectBanner
          lang={lang}
          matches={directBarcaMadridMatches}
          nowMs={nowMs}
          loadingItemId={loadingItemId}
          onPlayMatch={onPlayMatch}
        />

        {/* 4. SIMPLIFIED SPOTIFY-INSPIRED QUICK ACCESS HUB */}
        <EntryHomeBentoGrid
          lang={lang}
          sessionMode={sessionMode}
          lastUsedWorld={lastUsedWorld}
          heroPosters={heroPosters}
          featuredChannels={featuredChannels}
          liveMatchesCount={directBarcaMadridLiveCount}
          featuredLiveMatch={featuredLiveMatch}
          roomParticipantsCount={roomParticipantsCount}
          onPreloadWorld={onPreloadWorld}
          onCardClick={handleCardClick}
        />

        {/* 4. CONDITIONAL CONTINUE WATCHING RAIL */}
        {watchHistory.length > 0 && (
          <section className="space-y-2.5 pt-1">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display font-semibold text-sm sm:text-base text-white flex items-center gap-2">
                <RiffanClockIcon size={16} animate="hover" />
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
                  className="min-h-11 px-2.5 rounded-xl text-xs font-semibold text-[#C4A7FF] hover:text-white inline-flex items-center gap-1 cursor-pointer transition-colors group"
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
                const minsLeft =
                  item.durationSec &&
                  item.resumeTimeSec &&
                  item.durationSec > item.resumeTimeSec
                    ? Math.max(1, Math.round((item.durationSec - item.resumeTimeSec) / 60))
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
                    className="scroll-snap-item w-[160px] sm:w-[180px] shrink-0 rounded-2xl bg-[#0D0D12] border border-white/[0.08] hover:border-[#7C3AED]/60 overflow-hidden text-left group active:scale-95 transition-all cursor-pointer"
                  >
                    <div className="relative aspect-video w-full bg-[#000000]">
                      <PosterImage
                        src={item.backdrop || item.poster}
                        alt={item.title}
                        aspect="video"
                        fallbackTitle={item.title}
                        imgClassName="sm:group-hover:scale-105 transition-transform duration-300"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
                      <span className="absolute inset-0 flex items-center justify-center">
                        <span className="w-9 h-9 rounded-full bg-black/65 backdrop-blur-md border border-white/20 flex items-center justify-center text-white group-hover:bg-[#7C3AED] group-hover:border-[#7C3AED] transition-colors">
                          <RiffanPlayIcon size={16} tone="current" animate="hover" />
                        </span>
                      </span>
                      {epBadge && (
                        <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-md bg-black/80 text-[10px] font-bold text-white tabular-nums">
                          {epBadge}
                        </span>
                      )}
                      {minsLeft !== null && (
                        <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-md bg-black/75 text-[10px] font-semibold text-zinc-200 tabular-nums">
                          ~{minsLeft}m
                        </span>
                      )}
                      <div className="absolute inset-x-0 bottom-0 h-[3px] bg-white/20">
                        <div className="h-full bg-[#7C3AED]" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    <div className="p-3">
                      <p className="text-xs font-semibold text-white leading-snug truncate">
                        {item.title}
                      </p>
                      {cleanedSubtitle ? (
                        <p className="text-[11px] text-zinc-400 leading-snug mt-0.5 truncate">
                          {cleanedSubtitle}
                        </p>
                      ) : minsLeft !== null ? (
                        <p className="text-[11px] text-zinc-400 mt-0.5 tabular-nums">
                          {pickLang(lang, {
                            es: `Quedan ~${minsLeft} min`,
                            ca: `Queden ~${minsLeft} min`,
                            en: `~${minsLeft} min left`,
                          })}
                        </p>
                      ) : (
                        <p className="text-[11px] text-zinc-500 mt-0.5">
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

        {/* 5. BOTTOM RANDOM PICKER BAR: SORPRÉNDEME */}
        <section>
          <motion.button
            type="button"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.14 }}
            whileTap={{ scale: 0.96 }}
            onClick={() => {
              triggerHaptic('light');
              setSurprisePulse(true);
              window.setTimeout(() => {
                setSurprisePulse(false);
                onOpenSurpriseMe();
              }, 160);
            }}
            className="w-full min-h-12 px-4 py-3 rounded-2xl bg-[#0D0D12] hover:bg-[#14141C] border border-white/[0.08] hover:border-[#7C3AED]/55 flex items-center justify-between gap-3 text-left cursor-pointer active:scale-95 transition-all duration-200 group"
          >
            <div className="flex items-center gap-3 min-w-0">
              <motion.div
                animate={surprisePulse ? { rotate: 360, scale: 1.15 } : { rotate: 0, scale: 1 }}
                transition={{ duration: 0.22 }}
                className="w-9 h-9 rounded-xl bg-[#7C3AED]/15 text-[#A78BFA] border border-[#7C3AED]/30 flex items-center justify-center shrink-0"
              >
                <RiffanSurpriseIcon size={16} animate="always" />
              </motion.div>
              <div className="min-w-0">
                <span className="font-display font-semibold text-xs sm:text-sm text-white">
                  {pickLang(lang, {
                    es: 'Sorpréndeme',
                    ca: 'Sorprèn-me',
                    en: 'Surprise me',
                    zh: '随机推荐',
                  })}
                </span>
                <span className="text-xs text-zinc-400 ml-1.5">
                  ·{' '}
                  {pickLang(lang, {
                    es: 'Elige algo al azar',
                    ca: "Tria alguna cosa a l'atzar",
                    en: 'Pick something at random',
                    zh: '随机选一部播放',
                  })}
                </span>
              </div>
            </div>
            <RiffanChevronRightIcon size={16} animate="hover" className="shrink-0" />
          </motion.button>
        </section>
      </div>
    </div>
  );
};

/**
 * @module SeriesEpisodePickerModal
 * @description 2-Step Series -> Season -> Episode modal with instant opening,
 * language probing/switcher, episode search/reverse sort, and 50-episode pagination.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowUpDown,
  Check,
  ChevronLeft,
  ChevronRight,
  Heart,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Search,
  Tv,
  X,
} from 'lucide-react';
import type {
  AppLanguage,
  CatalogMovie,
  RoomQueueItem,
  TvEpisodeItem,
  TvSeriesDetails,
  WatchHistoryItem,
} from '../../types';
import { UI_COPY, pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import { useFocusTrap } from '../../utils/useFocusTrap';
import { sanitizeItemKey } from '../../utils/storage';
import { PosterImage } from '../ui/PosterImage';
import { FlagBadgeSvg, MediaLanguageSelector } from '../ui/LanguageBadge';
import { formatShortTime } from './catalogConstants';

interface SeriesEpisodePickerModalProps {
  lang: AppLanguage;
  selectedSeries: TvSeriesDetails | null;
  seriesModalLang: string;
  forceSpanishSeriesActive: boolean;
  loadingSeriesDetails: boolean;
  probingSeriesLangs: boolean;
  loadingItemId: string | null;
  watchHistory: WatchHistoryItem[];
  isBookmarked: (item: CatalogMovie) => boolean;
  onClose: () => void;
  onSeriesModalLangChange: (code: string) => void;
  onOpenSeriesDetails: (
    tmdbId: number,
    seasonNum: number,
    seedShow?: Partial<CatalogMovie>,
    forceSpanishProbe?: boolean
  ) => void;
  onToggleBookmark: (item: CatalogMovie, e: React.MouseEvent) => void;
  onReplayHistoryItem: (item: WatchHistoryItem, forceRestart?: boolean) => void;
  onPlaySeriesEpisode: (
    series: TvSeriesDetails,
    episode: TvEpisodeItem,
    preferLang: string,
    opts?: { forceSpanish?: boolean }
  ) => void;
  onAddToQueue: (item: Omit<RoomQueueItem, 'id' | 'addedBy'>) => void;
}

export const SeriesEpisodePickerModal: React.FC<SeriesEpisodePickerModalProps> = ({
  lang,
  selectedSeries,
  seriesModalLang,
  forceSpanishSeriesActive,
  loadingSeriesDetails,
  probingSeriesLangs,
  loadingItemId,
  watchHistory,
  isBookmarked,
  onClose,
  onSeriesModalLangChange,
  onOpenSeriesDetails,
  onToggleBookmark,
  onReplayHistoryItem,
  onPlaySeriesEpisode,
  onAddToQueue,
}) => {
  const modalRef = useRef<HTMLDivElement | null>(null);
  const episodeListScrollRef = useRef<HTMLDivElement | null>(null);
  const [episodeSearchQuery, setEpisodeSearchQuery] = useState('');
  const [episodeRangeStart, setEpisodeRangeStart] = useState(0);
  const [episodeSortDesc, setEpisodeSortDesc] = useState(false);

  useFocusTrap(Boolean(selectedSeries), onClose, modalRef);

  const seriesTmdbId = selectedSeries?.tmdbId;
  const activeSeason = selectedSeries?.activeSeason;
  const epsCount = selectedSeries?.episodes?.length ?? 0;

  useEffect(() => {
    setEpisodeSearchQuery('');
    setEpisodeSortDesc(false);
    setEpisodeRangeStart(0);
  }, [seriesTmdbId, activeSeason]);

  useEffect(() => {
    if (!selectedSeries || loadingSeriesDetails) return;
    if (selectedSeries.episodes.length > 50) {
      const savedEpInSeason = watchHistory.find(
        (h) =>
          h.mediaType === 'tv' &&
          h.tmdbId === selectedSeries.tmdbId &&
          h.season === selectedSeries.activeSeason &&
          Boolean(h.episode)
      );
      if (savedEpInSeason?.episode) {
        const foundIdx = selectedSeries.episodes.findIndex(
          (ep) => ep.episodeNumber === savedEpInSeason.episode
        );
        if (foundIdx >= 0) {
          setEpisodeRangeStart(Math.floor(foundIdx / 50) * 50);
        }
      }
    }
    setTimeout(() => {
      episodeListScrollRef.current?.scrollTo({ top: 0 });
    }, 0);
  }, [seriesTmdbId, activeSeason, epsCount, loadingSeriesDetails]);

  if (!selectedSeries) return null;

  const t = UI_COPY[lang];
  const EPISODE_CHUNK_SIZE = 50;
  const allSeasonEpisodes = selectedSeries.episodes || [];
  const orderedEpisodes = episodeSortDesc ? [...allSeasonEpisodes].reverse() : allSeasonEpisodes;

  const trimmedEpQuery = episodeSearchQuery.trim();
  const numericEpTarget = /^\d+$/.test(trimmedEpQuery) ? parseInt(trimmedEpQuery, 10) : null;
  const lowerEpQuery = trimmedEpQuery.toLowerCase();

  const filteredEpisodes = trimmedEpQuery
    ? numericEpTarget !== null
      ? [
          ...orderedEpisodes.filter((ep) => ep.episodeNumber === numericEpTarget),
          ...orderedEpisodes.filter(
            (ep) =>
              ep.episodeNumber !== numericEpTarget &&
              (String(ep.episodeNumber).includes(trimmedEpQuery) ||
                ep.title.toLowerCase().includes(lowerEpQuery))
          ),
        ]
      : orderedEpisodes.filter(
          (ep) =>
            ep.title.toLowerCase().includes(lowerEpQuery) ||
            (ep.overview && ep.overview.toLowerCase().includes(lowerEpQuery)) ||
            String(ep.episodeNumber).includes(lowerEpQuery)
        )
    : orderedEpisodes;

  const totalChunks = Math.ceil(orderedEpisodes.length / EPISODE_CHUNK_SIZE);
  const safeRangeStart = episodeRangeStart < orderedEpisodes.length ? episodeRangeStart : 0;
  const visibleEpisodes = trimmedEpQuery
    ? filteredEpisodes.slice(0, 80)
    : orderedEpisodes.length > EPISODE_CHUNK_SIZE
    ? orderedEpisodes.slice(safeRangeStart, safeRangeStart + EPISODE_CHUNK_SIZE)
    : orderedEpisodes;

  const seriesBookmarkPayload: CatalogMovie = {
    id: `series-${selectedSeries.tmdbId}`,
    tmdbId: selectedSeries.tmdbId,
    mediaType: 'tv',
    title: selectedSeries.title,
    year: selectedSeries.year,
    rating: selectedSeries.rating,
    overview: selectedSeries.overview,
    poster: selectedSeries.poster,
    backdrop: selectedSeries.backdrop,
    languages: [],
  };
  const seriesSaved = isBookmarked(seriesBookmarkPayload);

  const selectedSeriesHistory = watchHistory.find(
    (h) =>
      h.mediaType === 'tv' &&
      (h.tmdbId === selectedSeries.tmdbId ||
        h.title.trim().toLowerCase() === selectedSeries.title.trim().toLowerCase())
  );

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[65] bg-black/85 backdrop-blur-md flex items-end sm:items-center justify-center sm:p-4 animate-fade-in"
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label={selectedSeries.title}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-[940px] max-h-[93dvh] sm:max-h-[89dvh] rounded-t-3xl sm:rounded-3xl bg-[#090A10] border-t sm:border border-white/[0.1] shadow-[0_32px_110px_rgba(0,0,0,0.96)] flex flex-col overflow-hidden outline-none"
      >
        <div className="sm:hidden pt-2 flex justify-center shrink-0">
          <div className="w-10 h-1.5 rounded-full bg-white/25" />
        </div>

        <div className="relative px-3.5 py-3 sm:px-6 sm:py-4 bg-gradient-to-b from-[#131522] to-[#090A10] border-b border-white/[0.08] space-y-2.5 sm:space-y-3 shrink-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1 overflow-x-auto no-scrollbar">
              <button
                type="button"
                onClick={(e) => onToggleBookmark(seriesBookmarkPayload, e)}
                className="min-h-[40px] px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-xs font-semibold text-white flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
              >
                <Heart
                  className={`w-3.5 h-3.5 shrink-0 ${
                    seriesSaved ? 'fill-current text-[#E11D48]' : 'text-zinc-300'
                  }`}
                />
                <span>
                  {seriesSaved
                    ? pickLang(lang, { es: 'Guardada', ca: 'Desada', en: 'Saved' })
                    : pickLang(lang, { es: 'Guardar', ca: 'Desar', en: 'Save' })}
                </span>
              </button>

              <MediaLanguageSelector
                labelPrefix={pickLang(lang, { es: 'Idioma:', ca: 'Idioma:', en: 'Language:' })}
                selectedLang={seriesModalLang}
                availableLangs={
                  Array.isArray(selectedSeries.availableLanguages) &&
                  selectedSeries.availableLanguages.length > 0
                    ? selectedSeries.availableLanguages
                    : ['ES', 'LAT', 'VOSE', 'EN']
                }
                onSelectLang={(code) => {
                  triggerHaptic('light');
                  onSeriesModalLangChange(code);
                }}
                probing={probingSeriesLangs}
                size="sm"
              />

              <button
                type="button"
                disabled={probingSeriesLangs}
                onClick={() => {
                  triggerHaptic('medium');
                  onOpenSeriesDetails(
                    selectedSeries.tmdbId,
                    selectedSeries.activeSeason,
                    selectedSeries,
                    true
                  );
                }}
                className={`min-h-[40px] px-3 rounded-xl border text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors disabled:opacity-60 ${
                  forceSpanishSeriesActive
                    ? 'bg-[#9146FF]/25 border-[#BF94FF]/60 text-white'
                    : 'bg-white/[0.06] hover:bg-white/[0.12] border-[#BF94FF]/35 text-[#EFEFF1]'
                }`}
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 shrink-0 text-[#BF94FF] ${
                    probingSeriesLangs ? 'animate-spin' : ''
                  }`}
                />
                <FlagBadgeSvg code="es" className="w-4 h-2.5 shrink-0" />
                <span>
                  {pickLang(lang, {
                    es: 'Forzar Castellano',
                    ca: 'Forçar Castellà',
                    en: 'Force Spanish (ES)',
                  })}
                </span>
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar serie"
              className="min-h-[40px] min-w-[40px] rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-white flex items-center justify-center shrink-0 cursor-pointer transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="text-[11px] sm:text-xs text-zinc-400 flex items-center gap-1.5 whitespace-nowrap overflow-hidden">
                <span className="text-[#BF94FF] font-semibold">
                  {pickLang(lang, { es: 'Serie TV', ca: 'Sèrie TV', en: 'TV Series' })}
                </span>
                <span aria-hidden="true">·</span>
                <span className="text-zinc-200 tabular-nums">{selectedSeries.year}</span>
                {selectedSeries.rating && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-zinc-200 font-mono font-semibold tabular-nums">
                      ★ {selectedSeries.rating}
                    </span>
                  </>
                )}
                <span aria-hidden="true">·</span>
                <span className="tabular-nums text-zinc-200 truncate">
                  {selectedSeries.seasons.length}{' '}
                  {selectedSeries.seasons.length === 1
                    ? pickLang(lang, { es: 'Temporada', ca: 'Temporada', en: 'Season' })
                    : pickLang(lang, { es: 'Temporadas', ca: 'Temporades', en: 'Seasons' })}
                </span>
              </div>
              <h3 className="font-display font-bold text-lg sm:text-2xl text-white leading-snug line-clamp-1 sm:line-clamp-2 text-balance">
                {selectedSeries.title}
              </h3>
              {selectedSeries.overview && (
                <p className="hidden sm:block text-xs text-zinc-400 line-clamp-1">
                  {selectedSeries.overview}
                </p>
              )}
            </div>

            {selectedSeriesHistory?.season && selectedSeriesHistory?.episode ? (
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('success');
                  onReplayHistoryItem(selectedSeriesHistory, false);
                  onClose();
                }}
                className="min-h-[44px] px-3.5 sm:px-4 rounded-2xl bg-[#9146FF] hover:bg-[#7C2AE8] text-xs font-bold text-white flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors shadow-lg shadow-[#9146FF]/25"
              >
                <Play className="w-4 h-4 fill-current shrink-0" />
                <span className="tabular-nums">
                  {pickLang(lang, {
                    es: `Seguir T${selectedSeriesHistory.season} · Cap. ${selectedSeriesHistory.episode}`,
                    ca: `Seguir T${selectedSeriesHistory.season} · Cap. ${selectedSeriesHistory.episode}`,
                    en: `Resume S${selectedSeriesHistory.season} · Ep ${selectedSeriesHistory.episode}`,
                  })}
                </span>
              </button>
            ) : allSeasonEpisodes.length > 0 ? (
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('success');
                  onPlaySeriesEpisode(
                    selectedSeries,
                    allSeasonEpisodes[0],
                    forceSpanishSeriesActive ? 'ES' : seriesModalLang,
                    forceSpanishSeriesActive ? { forceSpanish: true } : undefined
                  );
                  onClose();
                }}
                className="min-h-[44px] px-3.5 sm:px-4 rounded-2xl bg-[#9146FF] hover:bg-[#7C2AE8] text-xs font-bold text-white flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors shadow-lg shadow-[#9146FF]/25"
              >
                <Play className="w-4 h-4 fill-current shrink-0" />
                <span className="tabular-nums">
                  {pickLang(lang, {
                    es: `Ver T${selectedSeries.activeSeason} · Cap. ${allSeasonEpisodes[0].episodeNumber}`,
                    ca: `Veure T${selectedSeries.activeSeason} · Cap. ${allSeasonEpisodes[0].episodeNumber}`,
                    en: `Play S${selectedSeries.activeSeason} · Ep ${allSeasonEpisodes[0].episodeNumber}`,
                  })}
                </span>
              </button>
            ) : null}
          </div>

          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pt-0.5">
            {selectedSeries.seasons.map((s) => {
              const isActiveSeason = selectedSeries.activeSeason === s.seasonNumber;
              return (
                <button
                  key={s.seasonNumber}
                  type="button"
                  onClick={() => {
                    if (s.seasonNumber === selectedSeries.activeSeason && !loadingSeriesDetails) {
                      return;
                    }
                    triggerHaptic('light');
                    onOpenSeriesDetails(selectedSeries.tmdbId, s.seasonNumber);
                  }}
                  className={`min-h-[40px] px-3.5 rounded-xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors border ${
                    isActiveSeason
                      ? 'bg-[#9146FF] text-white border-[#9146FF] shadow-[0_4px_16px_rgba(145,70,255,0.35)]'
                      : 'bg-white/[0.05] hover:bg-white/[0.11] text-zinc-200 border-white/[0.1]'
                  }`}
                >
                  <span className="tabular-nums">
                    {pickLang(lang, {
                      es: `Temporada ${s.seasonNumber}`,
                      ca: `Temporada ${s.seasonNumber}`,
                      en: `Season ${s.seasonNumber}`,
                    })}
                  </span>
                  {s.episodeCount > 0 && (
                    <span
                      className={`text-[11px] font-normal tabular-nums ${
                        isActiveSeason ? 'text-purple-200' : 'text-zinc-400'
                      }`}
                    >
                      · {s.episodeCount} cap.
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {!loadingSeriesDetails && allSeasonEpisodes.length > 0 && (
          <div className="px-3.5 py-2.5 sm:px-6 bg-[#0C0E16] border-b border-white/[0.07] space-y-2 shrink-0">
            <div className="flex items-center gap-2">
              <div className="relative flex-1 min-w-0">
                <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={episodeSearchQuery}
                  onChange={(e) => setEpisodeSearchQuery(e.target.value)}
                  placeholder={pickLang(lang, {
                    es: `Ir al cap. # (1–${allSeasonEpisodes.length}) o buscar título...`,
                    ca: `Anar al cap. # (1–${allSeasonEpisodes.length}) o cercar títol...`,
                    en: `Jump to ep # (1–${allSeasonEpisodes.length}) or search title...`,
                  })}
                  className="w-full h-10 pl-9 pr-8 rounded-xl bg-[#06070B] border border-white/10 focus:border-[#9146FF]/60 text-xs sm:text-sm text-white placeholder:text-zinc-500 outline-none transition-colors"
                />
                {episodeSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setEpisodeSearchQuery('')}
                    aria-label={pickLang(lang, {
                      es: 'Limpiar búsqueda de capítulo',
                      ca: 'Netejar cerca de capítol',
                      en: 'Clear episode search',
                    })}
                    className="w-7 h-7 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white flex items-center justify-center absolute right-1.5 top-1/2 -translate-y-1/2 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {allSeasonEpisodes.length > 4 && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    setEpisodeSortDesc((prev) => !prev);
                    setEpisodeRangeStart(0);
                    episodeListScrollRef.current?.scrollTo({ top: 0 });
                  }}
                  className="min-h-[40px] px-3 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-xs font-semibold text-zinc-200 flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                  title={
                    episodeSortDesc
                      ? pickLang(lang, {
                          es: 'Ordenado de últimos a primeros',
                          ca: 'Ordenat dels últims als primers',
                          en: 'Sorted newest first',
                        })
                      : pickLang(lang, {
                          es: 'Ordenado del capítulo 1 al final',
                          ca: 'Ordenat del capítol 1 al final',
                          en: 'Sorted episode 1 to end',
                        })
                  }
                >
                  <ArrowUpDown className="w-3.5 h-3.5 text-[#BF94FF] shrink-0" />
                  <span className="tabular-nums">
                    {episodeSortDesc
                      ? pickLang(lang, {
                          es: 'Últimos primero',
                          ca: 'Últims primer',
                          en: 'Newest first',
                        })
                      : `1 → ${allSeasonEpisodes.length}`}
                  </span>
                </button>
              )}
            </div>

            {!trimmedEpQuery && totalChunks > 1 && (
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
                {Array.from({ length: totalChunks }).map((_, chunkIdx) => {
                  const startIdx = chunkIdx * EPISODE_CHUNK_SIZE;
                  const chunkSlice = orderedEpisodes.slice(
                    startIdx,
                    startIdx + EPISODE_CHUNK_SIZE
                  );
                  if (chunkSlice.length === 0) return null;
                  const firstEpNum = chunkSlice[0].episodeNumber;
                  const lastEpNum = chunkSlice[chunkSlice.length - 1].episodeNumber;
                  const isCurrentChunk = safeRangeStart === startIdx;
                  return (
                    <button
                      key={startIdx}
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        setEpisodeRangeStart(startIdx);
                        episodeListScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className={`min-h-[34px] px-3 rounded-lg text-xs font-semibold tabular-nums whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                        isCurrentChunk
                          ? 'bg-[#9146FF] text-white shadow-sm'
                          : 'bg-white/[0.04] hover:bg-white/[0.1] text-zinc-300 border border-white/[0.07]'
                      }`}
                    >
                      {firstEpNum === lastEpNum
                        ? `Cap. ${firstEpNum}`
                        : `${firstEpNum} – ${lastEpNum}`}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div
          ref={episodeListScrollRef}
          className="flex-1 overflow-y-auto px-3.5 py-3 sm:px-6 sm:py-4 space-y-3 pb-[max(2rem,env(safe-area-inset-bottom))]"
        >
          {loadingSeriesDetails ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
              {Array.from({ length: 6 }).map((_, idx) => (
                <div
                  key={idx}
                  className="h-24 rounded-2xl bg-white/[0.04] border border-white/[0.07] skeleton-shimmer"
                />
              ))}
            </div>
          ) : allSeasonEpisodes.length === 0 ? (
            <div className="py-12 text-center rounded-2xl bg-white/[0.03] border border-white/[0.07] px-4 space-y-2">
              <Tv className="w-7 h-7 text-zinc-500 mx-auto" />
              <p className="text-sm font-semibold text-white">
                {pickLang(lang, {
                  es: 'No hay capítulos listados en esta temporada todavía',
                  ca: 'Encara no hi ha capítols llistats en aquesta temporada',
                  en: 'No episodes listed for this season yet',
                })}
              </p>
            </div>
          ) : visibleEpisodes.length === 0 ? (
            <div className="py-10 text-center rounded-2xl bg-white/[0.03] border border-white/[0.07] px-4 space-y-2">
              <Search className="w-6 h-6 text-zinc-500 mx-auto" />
              <p className="text-sm font-semibold text-white">
                {pickLang(lang, {
                  es: `No se encontró ningún capítulo para "${trimmedEpQuery}"`,
                  ca: `No s’ha trobat cap capítol per a "${trimmedEpQuery}"`,
                  en: `No episodes matching "${trimmedEpQuery}"`,
                })}
              </p>
              <button
                type="button"
                onClick={() => setEpisodeSearchQuery('')}
                className="min-h-[38px] px-4 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-white cursor-pointer"
              >
                {pickLang(lang, {
                  es: 'Ver todos los capítulos',
                  ca: 'Veure tots els capítols',
                  en: 'Show all episodes',
                })}
              </button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
                {visibleEpisodes.map((ep) => {
                  const epLoadId = `tv-${selectedSeries.tmdbId}-${ep.seasonNumber}-${ep.episodeNumber}`;
                  const isExtractingEp = loadingItemId === epLoadId;
                  const epHistory = watchHistory.find(
                    (h) => sanitizeItemKey(h.id) === sanitizeItemKey(epLoadId)
                  );
                  const epResume = epHistory?.resumeTimeSec || 0;
                  const epDur = epHistory?.durationSec || 0;
                  const epProgressPct =
                    epResume > 5
                      ? epDur > 60
                        ? Math.min(96, Math.max(8, Math.round((epResume / epDur) * 100)))
                        : 30
                      : 0;

                  const rawTitle = (ep.title || '').trim();
                  const isRedundantEpTitle =
                    !rawTitle ||
                    new RegExp(
                      `^(episodio|episode|cap[ií]tulo|cap\\.?)\\s*0*${ep.episodeNumber}$`,
                      'i'
                    ).test(rawTitle);
                  const displayEpHeading = isRedundantEpTitle
                    ? pickLang(lang, {
                        es: `Capítulo ${ep.episodeNumber}`,
                        ca: `Capítol ${ep.episodeNumber}`,
                        en: `Episode ${ep.episodeNumber}`,
                      })
                    : `${ep.episodeNumber}. ${rawTitle}`;

                  return (
                    <div
                      key={ep.id}
                      className="group relative min-w-0 text-left rounded-2xl bg-[#0F1119] hover:bg-[#161925] border border-white/[0.08] hover:border-white/25 p-2.5 sm:p-3 flex items-center gap-3 transition-colors"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          if (loadingItemId) return;
                          triggerHaptic('success');
                          onPlaySeriesEpisode(
                            selectedSeries,
                            ep,
                            forceSpanishSeriesActive ? 'ES' : seriesModalLang,
                            forceSpanishSeriesActive ? { forceSpanish: true } : undefined
                          );
                          onClose();
                        }}
                        aria-label={`${pickLang(lang, { es: 'Reproducir', ca: 'Reproduir', en: 'Play' })} ${displayEpHeading}`}
                        className="absolute inset-0 z-0 cursor-pointer rounded-2xl focus-visible:outline-2 focus-visible:outline-[#9146FF]"
                      />
                      <div className="relative w-28 sm:w-36 aspect-video rounded-xl overflow-hidden bg-[#090A10] shrink-0 pointer-events-none z-[1]">
                        <PosterImage
                          src={ep.still || selectedSeries.backdrop || selectedSeries.poster}
                          alt={displayEpHeading}
                          aspect="video"
                          imgClassName="object-cover group-hover:scale-105 transition-transform duration-200"
                          fallbackIcon={<Tv className="w-5 h-5 text-zinc-400" />}
                        />

                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent flex items-center justify-center">
                          <div className="w-8 h-8 rounded-full bg-[#9146FF]/95 text-white flex items-center justify-center shadow-md group-hover:scale-105 transition-transform">
                            {isExtractingEp ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                            )}
                          </div>
                        </div>

                        <span className="absolute bottom-1.5 left-2 text-[10px] font-mono font-bold text-white tabular-nums drop-shadow">
                          Cap. {ep.episodeNumber}
                        </span>

                        {epProgressPct > 0 && (
                          <div className="absolute bottom-0 inset-x-0 h-1 bg-white/20">
                            <div
                              className={`h-full ${
                                epProgressPct >= 88 ? 'bg-emerald-400' : 'bg-[#9146FF]'
                              }`}
                              style={{
                                width: `${epProgressPct >= 88 ? 100 : epProgressPct}%`,
                              }}
                            />
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1 space-y-0.5 pointer-events-none relative z-[1]">
                        <h4 className="font-display font-semibold text-sm text-white line-clamp-1">
                          {displayEpHeading}
                        </h4>

                        <div className="text-[11px] text-zinc-400 flex items-center gap-1.5 whitespace-nowrap overflow-hidden tabular-nums">
                          <span className="text-[#BF94FF] font-semibold">
                            T{ep.seasonNumber}
                          </span>
                          {ep.runtime ? (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>{ep.runtime} min</span>
                            </>
                          ) : null}
                          {epProgressPct >= 88 ? (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="inline-flex items-center gap-0.5 text-emerald-400 font-semibold">
                                <Check className="w-3 h-3 shrink-0" />
                                <span>{pickLang(lang, { es: 'Visto', ca: 'Vist', en: 'Watched' })}</span>
                              </span>
                            </>
                          ) : epResume > 5 ? (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="text-amber-300">{formatShortTime(epResume)}</span>
                            </>
                          ) : null}
                        </div>

                        <p className="text-xs text-zinc-400/90 line-clamp-2 leading-snug">
                          {ep.overview ||
                            (ep.airDate
                              ? pickLang(lang, {
                                  es: `Estreno ${ep.airDate} · Pulsa para reproducir`,
                                  ca: `Estrena ${ep.airDate} · Prem per reproduir`,
                                  en: `Aired ${ep.airDate} · Tap to play`,
                                })
                              : pickLang(lang, {
                                  es: 'Pulsa para reproducir en tu sala',
                                  ca: 'Prem per reproduir a la teva sala',
                                  en: 'Tap to play in room',
                                }))}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          triggerHaptic('success');
                          onAddToQueue({
                            kind: 'tv',
                            title: `${selectedSeries.title} · ${ep.seasonNumber}x${String(
                              ep.episodeNumber
                            ).padStart(2, '0')}`,
                            subtitle: `${rawTitle || `Capítulo ${ep.episodeNumber}`} (${seriesModalLang})`,
                            poster: ep.still || selectedSeries.poster,
                            tmdbId: selectedSeries.tmdbId,
                            season: ep.seasonNumber,
                            episode: ep.episodeNumber,
                            preferLang: seriesModalLang as 'ES' | 'LAT' | 'VOSE' | 'EN',
                          });
                        }}
                        title={t.addToQueue}
                        aria-label={t.addToQueue}
                        className="relative z-10 min-h-[44px] min-w-[44px] rounded-xl bg-white/[0.06] hover:bg-white/[0.15] border border-white/10 text-zinc-300 hover:text-white flex items-center justify-center shrink-0 cursor-pointer transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>

              {!trimmedEpQuery && totalChunks > 1 && (
                <div className="pt-2 flex items-center justify-between gap-2 border-t border-white/[0.06]">
                  <button
                    type="button"
                    disabled={safeRangeStart === 0}
                    onClick={() => {
                      triggerHaptic('light');
                      setEpisodeRangeStart(Math.max(0, safeRangeStart - EPISODE_CHUNK_SIZE));
                      episodeListScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="min-h-[44px] px-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] disabled:opacity-35 disabled:pointer-events-none border border-white/10 text-xs font-semibold text-white flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span>
                      {pickLang(lang, {
                        es: 'Anteriores 50',
                        ca: 'Anteriors 50',
                        en: 'Previous 50',
                      })}
                    </span>
                  </button>

                  <span className="text-xs text-zinc-400 tabular-nums text-center">
                    {safeRangeStart + 1}–
                    {Math.min(orderedEpisodes.length, safeRangeStart + EPISODE_CHUNK_SIZE)}{' '}
                    {pickLang(lang, { es: 'de', ca: 'de', en: 'of' })} {orderedEpisodes.length}
                  </span>

                  <button
                    type="button"
                    disabled={safeRangeStart + EPISODE_CHUNK_SIZE >= orderedEpisodes.length}
                    onClick={() => {
                      triggerHaptic('light');
                      setEpisodeRangeStart(safeRangeStart + EPISODE_CHUNK_SIZE);
                      episodeListScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="min-h-[44px] px-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] disabled:opacity-35 disabled:pointer-events-none border border-white/10 text-xs font-semibold text-white flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                  >
                    <span>
                      {pickLang(lang, {
                        es: 'Siguientes 50',
                        ca: 'Següents 50',
                        en: 'Next 50',
                      })}
                    </span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

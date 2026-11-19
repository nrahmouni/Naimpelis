/**
 * @module CatalaEpisodePickerModal
 * @description Episode & season selector modal for Anime en Català series,
 * supporting episode search, reverse sort, and 50-episode pagination chunks.
 */
import React, { useRef, useState } from 'react';
import { ArrowUpDown, Loader2, Play, Plus, Search, Tv, X } from 'lucide-react';
import type {
  AppLanguage,
  CatalaCatalogItem,
  CatalaEpisodeItem,
  CatalaSeriesDetails,
  RoomQueueItem,
} from '../../types';
import { UI_COPY, pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import { useFocusTrap } from '../../utils/useFocusTrap';
import { useSuppressFloatingBubble } from '../../utils/useSuppressFloatingBubble';
import { PosterImage } from '../ui/PosterImage';

interface CatalaEpisodePickerModalProps {
  lang: AppLanguage;
  selectedSeries: CatalaSeriesDetails | null;
  loadingEpisodes: boolean;
  onClose: () => void;
  onSelectSeason: (item: CatalaCatalogItem, seasonNum: number) => void;
  onPlayEpisode: (series: CatalaSeriesDetails, episode: CatalaEpisodeItem) => void;
  onAddToQueue: (item: Omit<RoomQueueItem, 'id' | 'addedBy'>) => void;
}

export const CatalaEpisodePickerModal: React.FC<CatalaEpisodePickerModalProps> = ({
  lang,
  selectedSeries,
  loadingEpisodes,
  onClose,
  onSelectSeason,
  onPlayEpisode,
  onAddToQueue,
}) => {
  const modalRef = useRef<HTMLDivElement | null>(null);
  const epScrollRef = useRef<HTMLDivElement | null>(null);
  const [epQuery, setEpQuery] = useState('');
  const [epRangeStart, setEpRangeStart] = useState(0);
  const [epSortDesc, setEpSortDesc] = useState(false);

  useFocusTrap(Boolean(selectedSeries), onClose, modalRef);
  useSuppressFloatingBubble(Boolean(selectedSeries));

  if (!selectedSeries) return null;

  const t = UI_COPY[lang];
  const CAT_CHUNK = 50;
  const allCatEps = selectedSeries.episodes || [];
  const orderedCatEps = epSortDesc ? [...allCatEps].reverse() : allCatEps;
  const trimmedCatQ = epQuery.trim();
  const numCatTarget = /^\d+$/.test(trimmedCatQ) ? parseInt(trimmedCatQ, 10) : null;
  const lowCatQ = trimmedCatQ.toLowerCase();

  const filteredCatEps = trimmedCatQ
    ? numCatTarget !== null
      ? [
          ...orderedCatEps.filter((ep) => ep.episodeNumber === numCatTarget),
          ...orderedCatEps.filter(
            (ep) =>
              ep.episodeNumber !== numCatTarget &&
              (String(ep.episodeNumber).includes(trimmedCatQ) ||
                ep.title.toLowerCase().includes(lowCatQ))
          ),
        ]
      : orderedCatEps.filter(
          (ep) =>
            ep.title.toLowerCase().includes(lowCatQ) ||
            String(ep.episodeNumber).includes(lowCatQ)
        )
    : orderedCatEps;

  const totalCatChunks = Math.ceil(orderedCatEps.length / CAT_CHUNK);
  const safeCatStart = epRangeStart < orderedCatEps.length ? epRangeStart : 0;
  const visibleCatEps = trimmedCatQ
    ? filteredCatEps.slice(0, 80)
    : orderedCatEps.length > CAT_CHUNK
    ? orderedCatEps.slice(safeCatStart, safeCatStart + CAT_CHUNK)
    : orderedCatEps;

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

        {/* Header */}
        <div className="relative px-3.5 py-3 sm:px-6 sm:py-4 bg-gradient-to-b from-[#1A130D] to-[#090A10] border-b border-white/[0.08] space-y-2.5 shrink-0">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs text-amber-300 font-semibold truncate">
              <span>Anime en Català</span>
              <span className="mx-1.5 text-zinc-500">·</span>
              <span className="text-zinc-300 font-normal">
                {selectedSeries.eraTag}
              </span>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Tancar"
              className="min-h-[40px] min-w-[40px] rounded-xl bg-white/[0.08] hover:bg-white/[0.16] border border-white/15 flex items-center justify-center text-white shrink-0 cursor-pointer transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-display font-bold text-lg sm:text-2xl text-white leading-tight">
                {selectedSeries.title}
              </h2>
              <p className="text-xs text-zinc-400 line-clamp-1 mt-0.5">
                {selectedSeries.overview}
              </p>
            </div>

            {orderedCatEps.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('success');
                  onPlayEpisode(selectedSeries, orderedCatEps[0]);
                  onClose();
                }}
                className="min-h-[44px] px-4 rounded-2xl bg-[#E11D48] hover:bg-[#BE123C] text-xs sm:text-sm font-bold text-white flex items-center justify-center gap-2 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>Reproduir Cap. 1</span>
              </button>
            )}
          </div>

          {selectedSeries.seasons.length > 1 && (
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pt-0.5">
              {selectedSeries.seasons.map((sn) => {
                const active = sn.seasonNumber === selectedSeries.activeSeason;
                return (
                  <button
                    key={sn.seasonNumber}
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      setEpQuery('');
                      setEpRangeStart(0);
                      onSelectSeason(
                        {
                          id: selectedSeries.id,
                          title: selectedSeries.title,
                          originalTitle: selectedSeries.originalTitle || '',
                          mediaType: 'tv',
                          category: 'all',
                          eraTag: selectedSeries.eraTag,
                          episodeHint: '',
                          year: selectedSeries.year || 'CAT',
                          rating: selectedSeries.rating || '',
                          overview: selectedSeries.overview,
                          poster: selectedSeries.poster,
                          backdrop: selectedSeries.backdrop,
                          seasonCount: selectedSeries.seasons.length,
                        },
                        sn.seasonNumber
                      );
                    }}
                    className={`min-h-[38px] px-3.5 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors border ${
                      active
                        ? 'bg-[#9146FF] text-white border-[#9146FF] shadow-[0_4px_16px_rgba(145,70,255,0.35)]'
                        : 'bg-white/[0.05] text-zinc-300 border-white/10 hover:bg-white/[0.1]'
                    }`}
                  >
                    {sn.name}
                  </button>
                );
              })}
            </div>
          )}

          {allCatEps.length > 6 && (
            <div className="space-y-2 pt-0.5">
              <div className="flex items-center gap-2">
                <div className="relative flex-1 min-w-0">
                  <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={epQuery}
                    onChange={(e) => setEpQuery(e.target.value)}
                    placeholder="Cercar número o títol de capítol (ex: 42)..."
                    className="w-full h-10 pl-9 pr-8 rounded-xl bg-black/55 border border-white/12 focus:border-white/35 text-xs sm:text-sm text-white placeholder:text-zinc-500 outline-none"
                  />
                  {epQuery && (
                    <button
                      type="button"
                      onClick={() => setEpQuery('')}
                      aria-label="Netejar cerca"
                      className="w-8 h-8 rounded-lg absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center text-zinc-400 hover:text-white cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    setEpSortDesc((v) => !v);
                    setEpRangeStart(0);
                  }}
                  className="min-h-[40px] px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-xs font-semibold text-zinc-200 flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <ArrowUpDown className="w-3.5 h-3.5" />
                  <span>{epSortDesc ? 'Últims primer' : 'Cap. 1 primer'}</span>
                </button>
              </div>

              {!trimmedCatQ && totalCatChunks > 1 && (
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                  {Array.from({ length: totalCatChunks }).map((_, cIdx) => {
                    const startIdx = cIdx * CAT_CHUNK;
                    const firstEp = orderedCatEps[startIdx]?.episodeNumber ?? startIdx + 1;
                    const lastEp =
                      orderedCatEps[Math.min(orderedCatEps.length - 1, startIdx + CAT_CHUNK - 1)]
                        ?.episodeNumber ?? Math.min(orderedCatEps.length, startIdx + CAT_CHUNK);
                    const activeChunk = safeCatStart === startIdx;
                    return (
                      <button
                        key={startIdx}
                        type="button"
                        onClick={() => {
                          triggerHaptic('light');
                          setEpRangeStart(startIdx);
                          epScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        className={`min-h-[34px] px-3 rounded-lg text-xs font-semibold tabular-nums whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                          activeChunk
                            ? 'bg-amber-400 text-[#120D02]'
                            : 'bg-white/[0.06] text-zinc-300 hover:bg-white/[0.12]'
                        }`}
                      >
                        {firstEp}–{lastEp}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Scrollable Episode List */}
        <div
          ref={epScrollRef}
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3.5 sm:p-5 space-y-3"
        >
          {loadingEpisodes ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2.5 text-sm text-zinc-400">
              <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
              <span>Carregant tots els capítols en català...</span>
            </div>
          ) : visibleCatEps.length === 0 ? (
            <div className="py-10 text-center text-sm text-zinc-400">
              No s&apos;han trobat capítols per a aquesta cerca.
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
              {visibleCatEps.map((ep) => (
                <div
                  key={ep.id}
                  className="group relative min-w-0 text-left rounded-2xl bg-[#0F1119] hover:bg-[#161925] border border-white/[0.08] hover:border-amber-400/45 p-2.5 sm:p-3 flex items-center gap-3 transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('success');
                      onPlayEpisode(selectedSeries, ep);
                      onClose();
                    }}
                    aria-label={`${pickLang(lang, { es: 'Reproducir', ca: 'Reproduir', en: 'Play' })} ${ep.episodeNumber}. ${ep.title}`}
                    className="absolute inset-0 z-0 cursor-pointer rounded-2xl focus-visible:outline-2 focus-visible:outline-[#9146FF]"
                  />
                  <div className="relative w-28 sm:w-36 aspect-video rounded-xl overflow-hidden bg-[#090A10] shrink-0 pointer-events-none z-[1]">
                    <PosterImage
                      src={ep.still || selectedSeries.backdrop}
                      alt={ep.title}
                      aspect="video"
                      imgClassName="object-cover group-hover:scale-105 transition-transform duration-200"
                      fallbackIcon={<Tv className="w-5 h-5 text-zinc-500" />}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent flex items-center justify-center">
                      <div className="w-8 h-8 rounded-full bg-[#E11D48]/95 text-white flex items-center justify-center shadow-md group-hover:scale-105 transition-transform">
                        <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                      </div>
                    </div>
                    <span className="absolute bottom-1.5 left-2 text-[10px] font-mono font-bold text-white tabular-nums drop-shadow">
                      Cap. {ep.episodeNumber}
                    </span>
                  </div>

                  <div className="min-w-0 flex-1 space-y-0.5 pointer-events-none relative z-[1]">
                    <h4 className="font-display font-semibold text-sm text-white line-clamp-1">
                      {ep.episodeNumber}. {ep.title}
                    </h4>
                    <div className="text-[11px] text-zinc-400 flex items-center gap-1.5 whitespace-nowrap overflow-hidden tabular-nums">
                      <span className="text-amber-300 font-semibold">Català</span>
                      {ep.runtime ? (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{ep.runtime} min</span>
                        </>
                      ) : null}
                    </div>
                    <p className="text-xs text-zinc-400/90 line-clamp-1">{ep.overview}</p>
                  </div>

                  {ep.streamUrl && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        triggerHaptic('success');
                        onAddToQueue({
                          kind: 'direct',
                          title: `${selectedSeries.title} · Cap. ${ep.episodeNumber}`,
                          subtitle: `${ep.title} (Català)`,
                          poster: selectedSeries.poster,
                          url: ep.streamUrl,
                        });
                      }}
                      title={t.addToQueue}
                      aria-label={t.addToQueue}
                      className="relative z-10 min-h-[44px] min-w-[44px] rounded-xl bg-white/[0.06] hover:bg-white/[0.15] border border-white/10 text-zinc-300 hover:text-white flex items-center justify-center shrink-0 cursor-pointer transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

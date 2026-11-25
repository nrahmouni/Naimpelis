import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Check,
  Clapperboard,
  Copy,
  Film,
  Loader2,
  Play,
  Search,
  Sparkles,
  Subtitles,
  Timer,
  Tv,
  X,
} from 'lucide-react';
import type { AppLanguage, CatalogMovie, TvSeriesDetails } from '../../types';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import { useBackInterceptor } from '../../lib/backInterceptor';
import { PosterImage } from '../ui/PosterImage';
import type {
  ClipboxPlayerTrack,
  ClipboxSearchItem,
  ClipboxTitleStreamsResult,
} from './clipboxTypes';

type ClipboxScope = 'all' | 'movies' | 'series' | 'anime';

interface ClipBoxSearchTabProps {
  lang: AppLanguage;
  externalQuery?: string;
  onPlayCustomUrl: (url: string) => void;
  onPlayMovie: (movie: CatalogMovie, preferLang: string) => void;
  onPlayClipboxMedia?: (
    item: ClipboxSearchItem,
    track: ClipboxPlayerTrack,
    streamsData: ClipboxTitleStreamsResult,
    epOpts?: { season?: number; episode?: number }
  ) => void;
  onInspectHostInVault?: (host: string) => void;
}

export const ClipBoxSearchTab: React.FC<ClipBoxSearchTabProps> = ({
  lang,
  externalQuery = '',
  onPlayCustomUrl,
  onPlayMovie,
  onPlayClipboxMedia,
}) => {
  const [query, setQuery] = useState(externalQuery);
  const [scope, setScope] = useState<ClipboxScope>('all');
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<ClipboxSearchItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<ClipboxSearchItem | null>(null);
  const [season, setSeason] = useState(1);
  const [episode, setEpisode] = useState(1);
  const [tvDetails, setTvDetails] = useState<TvSeriesDetails | null>(null);
  const [loadingTvDetails, setLoadingTvDetails] = useState(false);
  const [loadingStreams, setLoadingStreams] = useState(false);
  const [streamsData, setStreamsData] = useState<ClipboxTitleStreamsResult | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [onlineTop, setOnlineTop] = useState<{
    archiveMovies: ClipboxSearchItem[];
    airingAnime: ClipboxSearchItem[];
  }>({ archiveMovies: [], airingAnime: [] });
  const searchDebounceRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/clipbox/online-top')
      .then((r) => r.json())
      .then((json) => {
        if (cancelled || !json?.success) return;
        setOnlineTop({
          archiveMovies: Array.isArray(json.archiveMovies) ? json.archiveMovies : [],
          airingAnime: Array.isArray(json.airingAnime) ? json.airingAnime : [],
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (externalQuery !== query && externalQuery.trim().length > 0) {
      setQuery(externalQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalQuery]);

  const runSearch = useCallback(async (q: string, nextScope: ClipboxScope) => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        q: q.trim(),
        scope: nextScope,
      });
      const res = await fetch(`/api/clipbox/search?${qs.toString()}`);
      const json = (await res.json().catch(() => null)) as {
        success?: boolean;
        items?: ClipboxSearchItem[];
      } | null;
      if (json?.success && Array.isArray(json.items)) {
        setItems(json.items);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (searchDebounceRef.current) window.clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = window.setTimeout(() => {
      void runSearch(query, scope);
    }, query ? 320 : 20);
    return () => {
      if (searchDebounceRef.current) window.clearTimeout(searchDebounceRef.current);
    };
  }, [query, scope, runSearch]);

  const loadTitleStreams = useCallback(
    async (item: ClipboxSearchItem, s: number, e: number) => {
      setLoadingStreams(true);
      try {
        const qs = new URLSearchParams({
          title: item.title,
          mediaType: item.mediaType,
          season: String(s),
          episode: String(e),
          ...(item.tmdbId ? { tmdbId: String(item.tmdbId) } : {}),
          ...(item.kitsuId ? { kitsuId: item.kitsuId } : {}),
          ...(item.directMp4Url ? { directMp4Url: item.directMp4Url } : {}),
        });
        const res = await fetch(`/api/clipbox/title-streams?${qs.toString()}`);
        const json = (await res.json().catch(() => null)) as
          | ({ success?: boolean } & ClipboxTitleStreamsResult)
          | null;
        if (json?.success) {
          setStreamsData(json);
        }
      } finally {
        setLoadingStreams(false);
      }
    },
    []
  );

  const loadSeasonMetadata = useCallback(
    async (tmdbId: number, targetSeason: number) => {
      setLoadingTvDetails(true);
      try {
        const res = await fetch(
          `/api/catalog/tv/${tmdbId}?season=${targetSeason}&lang=${lang}`
        );
        const json = (await res.json().catch(() => null)) as {
          success?: boolean;
          details?: TvSeriesDetails;
        } | null;
        if (json?.success && json.details) {
          setTvDetails(json.details);
        }
      } finally {
        setLoadingTvDetails(false);
      }
    },
    [lang]
  );

  const handleOpenItem = (item: ClipboxSearchItem) => {
    triggerHaptic('light');
    setSelectedItem(item);
    setSeason(1);
    setEpisode(1);
    setTvDetails(null);
    setStreamsData(null);
    if (item.mediaType === 'tv' && item.tmdbId) {
      void loadSeasonMetadata(item.tmdbId, 1);
    }
    void loadTitleStreams(item, 1, 1);
  };

  const handleCloseDrawer = useCallback(() => {
    setSelectedItem(null);
    setTvDetails(null);
    setStreamsData(null);
  }, []);

  useBackInterceptor(Boolean(selectedItem), 'clipbox-title-drawer', handleCloseDrawer, {
    priority: 22,
  });

  const handlePlayTrack = (track: ClipboxPlayerTrack) => {
    triggerHaptic('medium');
    if (selectedItem && streamsData && onPlayClipboxMedia) {
      onPlayClipboxMedia(selectedItem, track, streamsData, { season, episode });
      return;
    }
    if (track.mode === 'extract' && selectedItem) {
      onPlayMovie(
        {
          id: selectedItem.id,
          tmdbId: selectedItem.tmdbId,
          mediaType: selectedItem.mediaType === 'movie' ? 'movie' : 'tv',
          seasonNumber: season,
          episodeNumber: episode,
          title: selectedItem.title,
          originalTitle: selectedItem.originalTitle,
          year: selectedItem.year,
          rating: selectedItem.rating,
          overview: selectedItem.overview,
          poster: selectedItem.poster,
          backdrop: selectedItem.backdrop,
          languages: ['ES', 'LAT', 'VOSE'],
        },
        selectedItem.mediaType === 'anime' ? 'VOSE' : 'ES'
      );
      return;
    }
    onPlayCustomUrl(track.url || track.rawUrl);
  };

  const handleCopyUrl = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 1800);
    } catch {
      // ignore clipboard errors
    }
  };

  const formatSec = (s: number) => {
    const m = Math.floor(s / 60);
    const r = Math.floor(s % 60);
    return `${m}:${String(r).padStart(2, '0')}`;
  };

  return (
    <div className="space-y-4">
      {/* Search + Engine Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-2.5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void runSearch(query, scope);
          }}
          className="relative flex-1 min-w-0"
        >
          <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={pickLang(lang, {
              es: 'Buscar película, serie o anime en ClipBox (TMDB + Kitsu)...',
              ca: 'Cercar pel·lícula, sèrie o anime a ClipBox...',
              en: 'Search movie, series or anime across ClipBox engines...',
            })}
            className="w-full min-h-11 pl-10 pr-4 rounded-xl bg-[#0D0D12] border border-white/[0.1] focus:border-[#06B6D4] text-sm text-white placeholder:text-zinc-500 focus:outline-none transition-colors"
          />
        </form>

        <div className="flex items-center gap-1.5 bg-[#0D0D12] p-1 rounded-xl border border-white/[0.08] shrink-0 overflow-x-auto no-scrollbar">
          {(
            [
              { id: 'all', es: 'Todo', ca: 'Tot', en: 'All', icon: Sparkles },
              { id: 'movies', es: 'Películas', ca: 'Pel·lícules', en: 'Movies', icon: Film },
              { id: 'series', es: 'Series', ca: 'Sèries', en: 'Series', icon: Clapperboard },
              { id: 'anime', es: 'Anime', ca: 'Anime', en: 'Anime', icon: Tv },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const active = scope === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setScope(tab.id);
                }}
                className={`min-h-10 px-3 rounded-lg text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                  active
                    ? 'bg-[#7C3AED] text-white'
                    : 'text-zinc-400 hover:text-white hover:bg-white/[0.05]'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{pickLang(lang, { es: tab.es, ca: tab.ca, en: tab.en })}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Live Online Extractors: Archive.org Direct MP4 + Kitsu Currently Airing Anime */}
      {!query.trim() && (scope === 'all' || scope === 'movies') && onlineTop.archiveMovies.length > 0 && (
        <section className="space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-display font-bold text-white">
              {pickLang(lang, {
                es: 'Cine y Documentales MP4 Directo (Internet Archive)',
                ca: 'Cinema i Documentals MP4 Directe (Internet Archive)',
                en: 'Direct MP4 Cinema & Docs (Internet Archive)',
              })}
            </h3>
            <span className="text-[11px] font-medium text-[#22D3EE]">Reproducción sin bloqueos</span>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1 no-scrollbar snap-x">
            {onlineTop.archiveMovies.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleOpenItem(item)}
                className="group shrink-0 w-[136px] sm:w-[154px] text-left rounded-2xl bg-[#0D0D12] hover:bg-[#14141C] border border-white/[0.08] hover:border-[#22D3EE]/55 overflow-hidden transition-all cursor-pointer snap-start"
              >
                <div className="relative aspect-[2/3] w-full overflow-hidden bg-black">
                  <PosterImage
                    src={item.poster}
                    alt={item.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#0D0D12] to-transparent" />
                </div>
                <div className="p-2.5 space-y-0.5">
                  <p className="text-xs font-bold text-white line-clamp-2 leading-snug">{item.title}</p>
                  <p className="text-[11px] text-zinc-400 truncate">
                    Archivo MP4{item.year ? ` · ${item.year}` : ''}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {!query.trim() && (scope === 'all' || scope === 'anime') && onlineTop.airingAnime.length > 0 && (
        <section className="space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-display font-bold text-white">
              {pickLang(lang, {
                es: 'Anime en Emisión Ahora (Kitsu Live)',
                ca: 'Anime en Emissió Ara (Kitsu Live)',
                en: 'Airing Anime Now (Kitsu Live)',
              })}
            </h3>
            <span className="text-[11px] font-medium text-[#A78BFA]">Kitsu + AniSkip</span>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1 no-scrollbar snap-x">
            {onlineTop.airingAnime.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleOpenItem(item)}
                className="group shrink-0 w-[136px] sm:w-[154px] text-left rounded-2xl bg-[#0D0D12] hover:bg-[#14141C] border border-white/[0.08] hover:border-[#A78BFA]/55 overflow-hidden transition-all cursor-pointer snap-start"
              >
                <div className="relative aspect-[2/3] w-full overflow-hidden bg-black">
                  <PosterImage
                    src={item.poster}
                    alt={item.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#0D0D12] to-transparent" />
                </div>
                <div className="p-2.5 space-y-0.5">
                  <p className="text-xs font-bold text-white line-clamp-2 leading-snug">{item.title}</p>
                  <p className="text-[11px] text-zinc-400 truncate tabular-nums">
                    En emisión{item.rating ? ` · ★ ${item.rating}` : ''}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Results Grid */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {Array.from({ length: 10 }).map((_, idx) => (
            <div
              key={idx}
              className="aspect-[2/3] rounded-2xl bg-[#0D0D12] border border-white/[0.06] skeleton-shimmer"
            />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl bg-[#0D0D12] border border-white/[0.08] p-8 text-center space-y-2">
          <p className="text-sm font-semibold text-white">
            {pickLang(lang, {
              es: 'Sin resultados para esta búsqueda',
              ca: 'Sense resultats per a aquesta cerca',
              en: 'No results found for this query',
            })}
          </p>
          <p className="text-xs text-zinc-400">
            {pickLang(lang, {
              es: 'Prueba otro título en español, inglés o japonés.',
              ca: 'Prova un altre títol en espanyol, anglès o japonès.',
              en: 'Try another title in Spanish, English, or Japanese.',
            })}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => handleOpenItem(item)}
              className="group text-left rounded-2xl bg-[#0D0D12] hover:bg-[#14141C] border border-white/[0.08] hover:border-[#06B6D4]/60 overflow-hidden transition-all cursor-pointer flex flex-col active:scale-[0.98]"
            >
              <div className="relative aspect-[2/3] w-full overflow-hidden bg-black">
                <PosterImage
                  src={item.poster}
                  alt={item.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
                <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[#0D0D12] via-[#0D0D12]/65 to-transparent" />
              </div>
              <div className="p-3 space-y-1 flex-1 flex flex-col justify-between">
                <h3 className="text-xs sm:text-sm font-bold text-white line-clamp-2 leading-snug">
                  {item.title}
                </h3>
                <p className="text-[11px] text-zinc-400 tabular-nums">
                  {item.source === 'archive'
                    ? 'Archivo MP4'
                    : item.mediaType === 'anime'
                    ? 'Anime · Kitsu'
                    : item.mediaType === 'tv'
                    ? 'Serie · TMDB'
                    : 'Película · TMDB'}
                  {item.year ? ` · ${item.year}` : ''}
                  {item.rating ? ` · ★ ${item.rating}` : ''}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Title Streams & ClipBox Engines Modal/Drawer */}
      {selectedItem && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={handleCloseDrawer}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-2xl max-h-[90dvh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-[#0D0D12] border border-white/[0.12] shadow-[0_24px_80px_rgba(0,0,0,0.9)] p-4 sm:p-6 space-y-5 animate-sheet-up"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3.5 min-w-0">
                <PosterImage
                  src={selectedItem.poster}
                  alt={selectedItem.title}
                  className="w-16 h-24 rounded-xl object-cover border border-white/10 shrink-0"
                />
                <div className="min-w-0 space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-[#22D3EE]">
                    {selectedItem.mediaType === 'anime'
                      ? 'ClipBox Anime · Kitsu + AniSkip'
                      : selectedItem.mediaType === 'tv'
                      ? 'ClipBox Series · Reproducción Directa'
                      : 'ClipBox Cine · Reproducción Directa'}
                  </p>
                  <h3 className="font-display font-bold text-lg sm:text-xl text-white leading-tight">
                    {selectedItem.title}
                  </h3>
                  <p className="text-xs text-zinc-400 tabular-nums">
                    {[
                      selectedItem.year,
                      selectedItem.rating ? `★ ${selectedItem.rating}` : null,
                      selectedItem.tmdbId ? `TMDB ${selectedItem.tmdbId}` : null,
                      selectedItem.kitsuId ? `Kitsu ${selectedItem.kitsuId}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCloseDrawer}
                aria-label="Cerrar"
                className="min-w-11 min-h-11 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center text-zinc-300 hover:text-white cursor-pointer shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {selectedItem.overview && (
              <p className="text-xs text-zinc-300 leading-relaxed line-clamp-3">
                {selectedItem.overview}
              </p>
            )}

            {/* Season & Episode Selector for Series / Anime */}
            {selectedItem.mediaType !== 'movie' && (
              <div className="flex flex-wrap items-center gap-2.5 p-3 rounded-2xl bg-black/50 border border-white/[0.08]">
                {selectedItem.mediaType === 'tv' && (
                  <label className="flex items-center gap-2 text-xs text-zinc-300">
                    <span>Temporada</span>
                    {tvDetails && tvDetails.seasons.length > 0 ? (
                      <select
                        value={season}
                        onChange={(e) => {
                          const nextSeason = Math.max(1, Number(e.target.value) || 1);
                          setSeason(nextSeason);
                          setEpisode(1);
                          if (selectedItem.tmdbId) void loadSeasonMetadata(selectedItem.tmdbId, nextSeason);
                          void loadTitleStreams(selectedItem, nextSeason, 1);
                        }}
                        className="min-h-10 px-2.5 rounded-lg bg-[#0D0D12] border border-white/15 text-white tabular-nums"
                      >
                        {tvDetails.seasons.map((s) => (
                          <option key={s.seasonNumber} value={s.seasonNumber}>
                            {s.name || `Temp. ${s.seasonNumber}`}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="number"
                        min={1}
                        max={50}
                        value={season}
                        onChange={(e) => setSeason(Math.max(1, Number(e.target.value) || 1))}
                        className="w-16 min-h-10 px-2.5 rounded-lg bg-[#0D0D12] border border-white/15 text-white text-center tabular-nums"
                      />
                    )}
                  </label>
                )}

                <label className="flex items-center gap-2 text-xs text-zinc-300 flex-1 min-w-[160px]">
                  <span>Episodio</span>
                  {tvDetails && tvDetails.episodes.length > 0 ? (
                    <select
                      value={episode}
                      onChange={(e) => {
                        const nextEp = Math.max(1, Number(e.target.value) || 1);
                        setEpisode(nextEp);
                        void loadTitleStreams(selectedItem, season, nextEp);
                      }}
                      className="flex-1 min-w-0 min-h-10 px-2.5 rounded-lg bg-[#0D0D12] border border-white/15 text-white tabular-nums"
                    >
                      {tvDetails.episodes.map((ep) => (
                        <option key={ep.episodeNumber} value={ep.episodeNumber}>
                          {ep.episodeNumber}. {ep.title}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="number"
                      min={1}
                      max={selectedItem.episodeCount || 2000}
                      value={episode}
                      onChange={(e) => setEpisode(Math.max(1, Number(e.target.value) || 1))}
                      className="w-20 min-h-10 px-2.5 rounded-lg bg-[#0D0D12] border border-white/15 text-white text-center tabular-nums"
                    />
                  )}
                </label>

                <button
                  type="button"
                  onClick={() => void loadTitleStreams(selectedItem, season, episode)}
                  className="min-h-10 px-3.5 rounded-lg bg-[#7C3AED] hover:bg-[#8B5CF6] text-xs font-semibold text-white cursor-pointer ml-auto inline-flex items-center gap-1.5"
                >
                  {loadingTvDetails && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Actualizar enlaces</span>
                </button>
              </div>
            )}

            {/* Playable ClipBox Native Tracks */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                Señales Nativas ClipBox (Sin Ventanas Externas)
              </h4>
              {loadingStreams ? (
                <div className="py-6 flex items-center justify-center gap-2 text-xs text-zinc-400">
                  <Loader2 className="w-4 h-4 animate-spin text-[#22D3EE]" />
                  <span>Resolviendo servidores directos, subtítulos y tiempos AniSkip / IntroDB...</span>
                </div>
              ) : streamsData && streamsData.tracks.length > 0 ? (
                <div className="space-y-2">
                  {streamsData.tracks.map((tr) => (
                    <div
                      key={tr.id}
                      className="flex items-center justify-between gap-2.5 p-3 rounded-2xl bg-black/55 border border-white/[0.08] hover:border-white/[0.18] transition-colors"
                    >
                      <div className="min-w-0 space-y-0.5">
                        <p className="text-xs sm:text-sm font-semibold text-white truncate">
                          {tr.label}
                        </p>
                        <p className="text-[11px] text-zinc-400 truncate">
                          {tr.provider} · {tr.lang} · {tr.quality} — {tr.note}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handlePlayTrack(tr)}
                          className="min-h-11 px-4 rounded-xl bg-[#7C3AED] hover:bg-[#8B5CF6] text-xs font-semibold text-white flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>Reproducir</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-zinc-400 py-2">
                  No hay señales nativas directas disponibles para este episodio ahora mismo.
                </p>
              )}
            </div>

            {/* AniSkip / TheIntroDB Timestamps */}
            {streamsData && streamsData.introTimestamps.length > 0 && (
              <div className="space-y-1.5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                  <Timer className="w-3.5 h-3.5 text-[#22D3EE]" />
                  <span>Marcadores AniSkip / TheIntroDB</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {streamsData.introTimestamps.map((seg, i) => (
                    <div
                      key={i}
                      className="px-3 py-2 rounded-xl bg-black/50 border border-white/[0.08] flex items-center justify-between text-xs tabular-nums"
                    >
                      <span className="font-semibold text-white">{seg.type}</span>
                      <span className="text-[#22D3EE]">
                        {formatSec(seg.startSec)} – {formatSec(seg.endSec)} · {seg.source}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* OpenSubtitles-v3 + ClipBox SRT/VTT Tracks (automatically injected in player) */}
            {streamsData && streamsData.subtitles.length > 0 && (
              <div className="space-y-1.5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                  <Subtitles className="w-3.5 h-3.5 text-[#A78BFA]" />
                  <span>
                    Subtítulos disponibles ({streamsData.subtitles.length} · carga automática en reproductor)
                  </span>
                </h4>
                <div className="flex flex-wrap gap-2">
                  {streamsData.subtitles.map((sub, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => void handleCopyUrl(`sub-${idx}`, sub.url)}
                      className="min-h-10 px-3 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-xs text-zinc-200 flex items-center gap-1.5 cursor-pointer"
                    >
                      {copiedId === `sub-${idx}` ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5 text-zinc-400" />
                      )}
                      <span>{sub.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

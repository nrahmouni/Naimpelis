import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Check,
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
import type { AppLanguage, CatalogMovie } from '../../types';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import { useBackInterceptor } from '../../lib/backInterceptor';
import { PosterImage } from '../ui/PosterImage';
import type {
  ClipboxPlayerTrack,
  ClipboxSearchItem,
  ClipboxTitleStreamsResult,
} from './clipboxTypes';

interface ClipBoxSearchTabProps {
  lang: AppLanguage;
  externalQuery?: string;
  onPlayCustomUrl: (url: string) => void;
  onPlayMovie: (movie: CatalogMovie, preferLang: string) => void;
  onInspectHostInVault?: (host: string) => void;
}

export const ClipBoxSearchTab: React.FC<ClipBoxSearchTabProps> = ({
  lang,
  externalQuery = '',
  onPlayCustomUrl,
  onPlayMovie,
  onInspectHostInVault,
}) => {
  const [query, setQuery] = useState(externalQuery);
  const [scope, setScope] = useState<'all' | 'anime' | 'cinema'>('all');
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<ClipboxSearchItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<ClipboxSearchItem | null>(null);
  const [season, setSeason] = useState(1);
  const [episode, setEpisode] = useState(1);
  const [loadingStreams, setLoadingStreams] = useState(false);
  const [streamsData, setStreamsData] = useState<ClipboxTitleStreamsResult | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const searchDebounceRef = useRef<number | null>(null);

  useEffect(() => {
    if (externalQuery !== query && externalQuery.trim().length > 0) {
      setQuery(externalQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalQuery]);

  const runSearch = useCallback(async (q: string, nextScope: 'all' | 'anime' | 'cinema') => {
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

  const handleOpenItem = (item: ClipboxSearchItem) => {
    triggerHaptic('light');
    setSelectedItem(item);
    setSeason(1);
    setEpisode(1);
    setStreamsData(null);
    void loadTitleStreams(item, 1, 1);
  };

  const handleCloseDrawer = useCallback(() => {
    setSelectedItem(null);
    setStreamsData(null);
  }, []);

  useBackInterceptor(Boolean(selectedItem), 'clipbox-title-drawer', handleCloseDrawer, {
    priority: 22,
  });

  const handlePlayTrack = (track: ClipboxPlayerTrack) => {
    triggerHaptic('medium');
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
              es: 'Buscar película, serie o anime en motores ClipBox (Kitsu + TMDB)...',
              ca: 'Cercar pel·lícula, sèrie o anime als motors ClipBox...',
              en: 'Search movie, series or anime across ClipBox engines...',
            })}
            className="w-full min-h-11 pl-10 pr-4 rounded-xl bg-[#0D0D12] border border-white/[0.1] focus:border-[#06B6D4] text-sm text-white placeholder:text-zinc-500 focus:outline-none transition-colors"
          />
        </form>

        <div className="flex items-center gap-1.5 bg-[#0D0D12] p-1 rounded-xl border border-white/[0.08] shrink-0 overflow-x-auto no-scrollbar">
          {(
            [
              { id: 'all', es: 'Todo', ca: 'Tot', en: 'All', icon: Sparkles },
              { id: 'anime', es: 'Anime (Kitsu)', ca: 'Anime (Kitsu)', en: 'Anime (Kitsu)', icon: Tv },
              { id: 'cinema', es: 'Cine y Series', ca: 'Cinema i Sèries', en: 'Movies & TV', icon: Film },
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
                className={`min-h-10 px-3 rounded-lg text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors ${
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
                  {item.mediaType === 'anime'
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
                <img
                  src={selectedItem.poster}
                  alt={selectedItem.title}
                  referrerPolicy="no-referrer"
                  className="w-16 h-24 rounded-xl object-cover border border-white/10 shrink-0"
                />
                <div className="min-w-0 space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-[#22D3EE]">
                    {selectedItem.mediaType === 'anime'
                      ? 'ClipBox Anime · Kitsu + AniSkip'
                      : selectedItem.mediaType === 'tv'
                      ? 'ClipBox Series · Multi-Player'
                      : 'ClipBox Cine · Multi-Player'}
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
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={season}
                      onChange={(e) => setSeason(Math.max(1, Number(e.target.value) || 1))}
                      className="w-16 min-h-10 px-2.5 rounded-lg bg-[#0D0D12] border border-white/15 text-white text-center tabular-nums"
                    />
                  </label>
                )}
                <label className="flex items-center gap-2 text-xs text-zinc-300">
                  <span>Episodio</span>
                  <input
                    type="number"
                    min={1}
                    max={2000}
                    value={episode}
                    onChange={(e) => setEpisode(Math.max(1, Number(e.target.value) || 1))}
                    className="w-20 min-h-10 px-2.5 rounded-lg bg-[#0D0D12] border border-white/15 text-white text-center tabular-nums"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void loadTitleStreams(selectedItem, season, episode)}
                  className="min-h-10 px-3.5 rounded-lg bg-[#7C3AED] hover:bg-[#8B5CF6] text-xs font-semibold text-white cursor-pointer ml-auto"
                >
                  Actualizar enlaces
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
                  <span>Resolviendo servidores, subtítulos y tiempos AniSkip / TheIntroDB...</span>
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
                          onClick={() => void handleCopyUrl(tr.id, tr.rawUrl)}
                          title="Copiar enlace"
                          className="min-w-10 min-h-11 px-2.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-zinc-300 flex items-center justify-center cursor-pointer"
                        >
                          {copiedId === tr.id ? (
                            <Check className="w-4 h-4 text-emerald-400" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePlayTrack(tr)}
                          className="min-h-11 px-3.5 rounded-xl bg-[#7C3AED] hover:bg-[#8B5CF6] text-xs font-semibold text-white flex items-center gap-1.5 cursor-pointer"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>Ver</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-zinc-400 py-2">
                  No se encontró TMDB ID automático para embeds directos; usa los portales inferiores.
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

            {/* OpenSubtitles-v3 + ClipBox SRT Tracks */}
            {streamsData && streamsData.subtitles.length > 0 && (
              <div className="space-y-1.5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                  <Subtitles className="w-3.5 h-3.5 text-[#A78BFA]" />
                  <span>Subtítulos integrados disponibles ({streamsData.subtitles.length})</span>
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

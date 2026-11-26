import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { CornerDownLeft, Film, Loader2, Search, Sparkles, Trophy, Tv, Wand2, X } from 'lucide-react';
import type { AppLanguage, CatalogMovie, SpanishTdtChannel } from '../types';
import type { ProviderLiveItem, ProviderMovieItem, ProviderSeriesItem } from '../types/providers';
import { pickLang } from '../utils/i18n';
import { useGlobalEscape } from '../utils/useGlobalEscape';
import { mergeAndRankCatalogResults, compactSearchText, normalizeSearchText } from '../utils/catalogSearchRank';
import { BottomSheet, StandardInput } from './ui/DesignSystem';
import { PosterImage } from './ui/PosterImage';
import { ChannelLogoBadge } from './ui/ChannelLogoBadge';

interface CommandSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang?: AppLanguage;
  movies: CatalogMovie[];
  series: CatalogMovie[];
  tdtChannels: SpanishTdtChannel[];
  onSelectCatalogItem: (item: CatalogMovie) => void;
  onSelectChannel?: (ch: SpanishTdtChannel) => void;
  onSearchWithAi?: (query: string, mediaType?: 'all' | 'movie' | 'tv') => void;
}

const RECENT_SEARCHES_KEY = 'naimcine_recent_searches_v1';

type FlatSearchAction =
  | { kind: 'movie' | 'series'; key: string; label: string; item: CatalogMovie }
  | { kind: 'channel'; key: string; label: string; channel: SpanishTdtChannel };

export const CommandSearchModal: React.FC<CommandSearchModalProps> = ({
  isOpen,
  onClose,
  lang = 'es',
  movies,
  series,
  tdtChannels,
  onSelectCatalogItem,
  onSelectChannel,
  onSearchWithAi,
}) => {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [recentQueries, setRecentQueries] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(RECENT_SEARCHES_KEY);
      return raw ? (JSON.parse(raw) as string[]) : ['Champions', 'Interstellar', 'La 1'];
    } catch {
      return [];
    }
  });
  const inputRef = useRef<HTMLInputElement | null>(null);

  useGlobalEscape(onClose, isOpen);

  useEffect(() => {
    if (isOpen) {
      setActiveIndex(0);
      window.setTimeout(() => inputRef.current?.focus(), 60);
    }
  }, [isOpen]);

  const recordQuery = (q: string) => {
    const clean = q.trim();
    if (clean.length < 2) return;
    const next = [clean, ...recentQueries.filter((r) => r !== clean)].slice(0, 6);
    setRecentQueries(next);
    try {
      localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  const [remoteMovies, setRemoteMovies] = useState<CatalogMovie[]>([]);
  const [remoteSeries, setRemoteSeries] = useState<CatalogMovie[]>([]);
  const [providerHits, setProviderHits] = useState<{
    live: ProviderLiveItem[];
    movies: ProviderMovieItem[];
    series: ProviderSeriesItem[];
  }>({ live: [], movies: [], series: [] });
  const [loadingRemote, setLoadingRemote] = useState(false);

  useEffect(() => {
    const clean = query.trim();
    if (!isOpen || clean.length < 2 || /^https?:\/\//i.test(clean)) {
      setRemoteMovies((prev) => (prev.length === 0 ? prev : []));
      setRemoteSeries((prev) => (prev.length === 0 ? prev : []));
      setProviderHits((prev) =>
        prev.live.length === 0 && prev.movies.length === 0 && prev.series.length === 0
          ? prev
          : { live: [], movies: [], series: [] }
      );
      setLoadingRemote((prev) => (prev ? false : prev));
      return;
    }

    const controller = new AbortController();
    let active = true;
    setLoadingRemote(true);

    const timer = window.setTimeout(() => {
      let pending = 3;
      const doneOne = () => {
        pending -= 1;
        if (active && pending <= 0) {
          setLoadingRemote(false);
        }
      };

      fetch(
        `/api/catalog/movies?provider=all&category=trending&page=1&query=${encodeURIComponent(clean)}`,
        { signal: controller.signal }
      )
        .then((r) => (r.ok ? r.json() : { movies: [] }))
        .then((data) => {
          if (!active) return;
          const list = Array.isArray(data?.movies)
            ? data.movies
            : Array.isArray(data?.items)
            ? data.items
            : [];
          setRemoteMovies(list.slice(0, 14));
        })
        .catch(() => {
          if (active && !controller.signal.aborted) setRemoteMovies([]);
        })
        .finally(doneOne);

      fetch(
        `/api/catalog/series?provider=all&category=trending&page=1&lang=${lang === 'en' ? 'en' : 'es'}&query=${encodeURIComponent(clean)}`,
        { signal: controller.signal }
      )
        .then((r) => (r.ok ? r.json() : { series: [] }))
        .then((data) => {
          if (!active) return;
          const list = Array.isArray(data?.series)
            ? data.series
            : Array.isArray(data?.items)
            ? data.items
            : [];
          setRemoteSeries(list.slice(0, 14));
        })
        .catch(() => {
          if (active && !controller.signal.aborted) setRemoteSeries([]);
        })
        .finally(doneOne);

      fetch(`/api/providers/search?q=${encodeURIComponent(clean)}&limit=10`, {
        signal: controller.signal,
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (!active) return;
          setProviderHits({
            live: Array.isArray(data?.live) ? data.live.slice(0, 8) : [],
            movies: Array.isArray(data?.movies) ? data.movies.slice(0, 8) : [],
            series: Array.isArray(data?.series) ? data.series.slice(0, 8) : [],
          });
        })
        .catch(() => {
          if (active && !controller.signal.aborted) {
            setProviderHits({ live: [], movies: [], series: [] });
          }
        })
        .finally(doneOne);
    }, 180);

    return () => {
      active = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [isOpen, query, lang]);

  const normText = normalizeSearchText;
  const normCompact = compactSearchText;

  const normQuery = normText(query);
  const compactQuery = normCompact(query);

  const matchedMovies = useMemo(() => {
    if (!normQuery) return movies.slice(0, 6);
    const base = mergeAndRankCatalogResults(remoteMovies, movies, query, {
      limit: 10,
      minLocalScore: 40,
    });
    if (providerHits.movies.length === 0) return base;
    const seen = new Set(base.map((m) => normText(m.title)));
    const extras: CatalogMovie[] = [];
    for (const pm of providerHits.movies) {
      const k = normText(pm.name);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      extras.push({
        id: `provider-vod-${pm.id}`,
        mediaType: 'movie',
        title: pm.name,
        year: pm.year || 'HD',
        rating: '',
        overview: pm.categoryName || pm.providerName,
        poster: pm.poster,
        backdrop: pm.poster,
        bingetrixUrl: pm.playbackUrl,
        languages: ['ES'],
        platform: pm.providerName,
      });
    }
    return [...base, ...extras].slice(0, 12);
  }, [movies, remoteMovies, providerHits.movies, normQuery, query]);

  const matchedSeries = useMemo(() => {
    if (!normQuery) return series.slice(0, 6);
    const base = mergeAndRankCatalogResults(remoteSeries, series, query, {
      limit: 10,
      minLocalScore: 40,
    });
    if (providerHits.series.length === 0) return base;
    const seen = new Set(base.map((s) => normText(s.title)));
    const extras: CatalogMovie[] = [];
    for (const ps of providerHits.series) {
      const k = normText(ps.name);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      extras.push({
        id: `provider-series-${ps.id}`,
        mediaType: 'tv',
        title: ps.name,
        year: ps.year || 'HD',
        rating: '',
        overview: ps.plot || ps.categoryName || ps.providerName,
        poster: ps.poster,
        backdrop: ps.poster,
        languages: ['ES'],
        platform: ps.providerName,
      });
    }
    return [...base, ...extras].slice(0, 12);
  }, [series, remoteSeries, providerHits.series, normQuery, query]);

  const matchedChannels = useMemo(() => {
    if (!normQuery) return tdtChannels.slice(0, 4);
    const base = tdtChannels
      .filter((c) => {
        const hay = `${c.name} ${c.network} ${c.shortMark}`;
        return (
          normText(hay).includes(normQuery) ||
          (compactQuery.length >= 2 && normCompact(hay).includes(compactQuery))
        );
      })
      .slice(0, 6);
    if (providerHits.live.length === 0) return base;
    const seen = new Set(base.map((c) => normText(c.name)));
    const extras: SpanishTdtChannel[] = [];
    for (const item of providerHits.live) {
      const k = normText(item.name);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      extras.push({
        id: item.id,
        dial: 0,
        name: item.name,
        category: 'entretenimiento',
        network: item.providerName,
        quality: 'HD',
        description: item.categoryName,
        shortMark: item.name.slice(0, 3).toUpperCase(),
        brandTone: '#8B5CF6',
        logoUrl: item.logo || undefined,
        channels: [
          {
            id: `${item.id}-hls`,
            label: `${item.providerName} · ${item.categoryName}`,
            lang: 'ES',
            sourceUrl: item.playbackUrl,
            resolverType: 'tdt_hls',
          },
        ],
      });
    }
    return [...base, ...extras].slice(0, 10);
  }, [tdtChannels, providerHits.live, normQuery, compactQuery]);

  const flatActions = useMemo<FlatSearchAction[]>(() => {
    const list: FlatSearchAction[] = [];
    for (const m of matchedMovies) {
      list.push({ kind: 'movie', key: `m-${m.id}`, label: m.title, item: m });
    }
    for (const s of matchedSeries) {
      list.push({ kind: 'series', key: `s-${s.id}`, label: s.title, item: s });
    }
    if (onSelectChannel) {
      for (const ch of matchedChannels) {
        list.push({ kind: 'channel', key: `c-${ch.id}`, label: ch.name, channel: ch });
      }
    }
    return list;
  }, [matchedMovies, matchedSeries, matchedChannels, onSelectChannel]);

  useEffect(() => {
    setActiveIndex(0);
  }, [normQuery]);

  const executeAction = (action: FlatSearchAction) => {
    recordQuery(query || action.label);
    if (action.kind === 'channel') {
      onSelectChannel?.(action.channel);
    } else {
      onSelectCatalogItem(action.item);
    }
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (flatActions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => (prev + 1) % flatActions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => (prev - 1 + flatActions.length) % flatActions.length);
    } else if (e.key === 'Enter') {
      const target = flatActions[activeIndex];
      if (target) {
        e.preventDefault();
        executeAction(target);
      }
    }
  };

  let runningIdx = 0;

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      lang={lang}
      title={pickLang(lang, {
        es: 'Buscar',
        ca: 'Cercar',
        en: 'Search',
      })}
      subtitle={pickLang(lang, {
        es: 'Películas, series y directos',
        ca: 'Pel·lícules, sèries i directes',
        en: 'Movies, series & live TV',
      })}
      icon={<Search className="w-5 h-5" />}
      maxWidth="sm:max-w-2xl"
    >
      <div onKeyDown={handleKeyDown} className="space-y-4">
        <StandardInput
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={pickLang(lang, {
            es: 'Título, género o canal...',
            ca: 'Títol, gènere o canal...',
            en: 'Title, genre or channel...',
          })}
          icon={<Search className="w-4 h-4" />}
          rightElement={
            query ? (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="min-h-10 min-w-10 rounded-lg text-zinc-400 hover:text-white flex items-center justify-center cursor-pointer"
                aria-label={pickLang(lang, {
                  es: 'Limpiar búsqueda',
                  ca: 'Netejar cerca',
                  en: 'Clear search',
                })}
              >
                <X className="w-4 h-4" />
              </button>
            ) : undefined
          }
        />

        {!normQuery && recentQueries.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-semibold text-zinc-500 mr-1">
              {pickLang(lang, { es: 'Recientes:', ca: 'Recents:', en: 'Recent:' })}
            </span>
            {recentQueries.map((rq) => (
              <button
                key={rq}
                type="button"
                onClick={() => setQuery(rq)}
                className="min-h-12 px-3.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.11] border border-white/[0.06] text-xs font-semibold text-zinc-200 cursor-pointer transition-colors"
              >
                {rq}
              </button>
            ))}
          </div>
        )}

        {loadingRemote && (
          <div className="space-y-2.5">
            <div className="px-3 py-2 rounded-xl bg-[#0D0D12] border border-white/[0.08] flex items-center gap-2 text-xs text-zinc-300">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#A78BFA] shrink-0" />
              <span>
                {pickLang(lang, {
                  es: 'Buscando en todo el catálogo...',
                  ca: 'Cercant a tot el catàleg...',
                  en: 'Searching full catalog...',
                })}
              </span>
            </div>
            {flatActions.length === 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {Array.from({ length: 4 }).map((_, idx) => (
                  <div
                    key={idx}
                    className="h-14 rounded-xl bg-[#0D0D12] border border-white/[0.08] skeleton-shimmer"
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {!loadingRemote && flatActions.length === 0 ? (
          <div className="py-8 text-center space-y-3 rounded-2xl bg-[#0D0D12] border border-white/[0.08] px-4">
            <Sparkles className="w-6 h-6 text-[#A78BFA] mx-auto" />
            <p className="text-sm font-semibold text-white">
              {pickLang(lang, {
                es: query.trim().length >= 2
                  ? `No encontramos «${query.trim()}»`
                  : 'Sin coincidencias rápidas',
                ca: query.trim().length >= 2
                  ? `No hem trobat «${query.trim()}»`
                  : 'Sense coincidències ràpides',
                en: query.trim().length >= 2
                  ? `No results for "${query.trim()}"`
                  : 'No quick matches',
              })}
            </p>
            {onSearchWithAi && query.trim().length >= 2 && (
              <button
                type="button"
                onClick={() => {
                  const cleanQ = query.trim();
                  recordQuery(cleanQ);
                  onClose();
                  onSearchWithAi(cleanQ, 'all');
                }}
                className="min-h-12 px-5 rounded-xl bg-[#7C3AED] hover:bg-[#8B5CF6] text-white text-xs font-bold inline-flex items-center gap-2 cursor-pointer active:scale-95 transition-all"
              >
                <Wand2 className="w-4 h-4 shrink-0" />
                <span>
                  {pickLang(lang, {
                    es: `Buscar «${query.trim()}»`,
                    ca: `Cercar «${query.trim()}»`,
                    en: `Find "${query.trim()}"`,
                  })}
                </span>
              </button>
            )}
          </div>
        ) : flatActions.length > 0 ? (
          <div className="space-y-4">
            {matchedMovies.length > 0 && (
              <section className="space-y-2">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                  <Film className="w-3.5 h-3.5 text-[#A78BFA]" />
                  <span>
                    {pickLang(lang, {
                      es: `Películas (${matchedMovies.length})`,
                      ca: `Pel·lícules (${matchedMovies.length})`,
                      en: `Movies (${matchedMovies.length})`,
                    })}
                  </span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {matchedMovies.map((item) => {
                    const idx = runningIdx++;
                    const isFocused = idx === activeIndex;
                    return (
                      <motion.button
                        key={item.id}
                        type="button"
                        whileTap={{ scale: 0.985 }}
                        onMouseEnter={() => setActiveIndex(idx)}
                        onClick={() => {
                          recordQuery(query || item.title);
                          onSelectCatalogItem(item);
                          onClose();
                        }}
                        className={`min-h-14 p-2.5 rounded-xl border flex items-center gap-3 text-left cursor-pointer transition-colors ${
                          isFocused
                            ? 'bg-[#7C3AED]/15 border-[#8B5CF6]/55'
                            : 'bg-[#0D0D12] hover:bg-[#14141C] border-white/[0.08]'
                        }`}
                      >
                        <div className="w-10 shrink-0 rounded-lg overflow-hidden">
                          <PosterImage
                            src={item.poster || '/icon.svg'}
                            alt={item.title}
                            fallbackTitle={item.title}
                            aspect="poster"
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold text-white leading-snug break-words">{item.title}</div>
                          <div className="text-[11px] text-zinc-400 tabular-nums">
                            {item.year} {item.rating ? `· ★ ${item.rating}` : ''}
                          </div>
                        </div>
                        {isFocused && (
                          <CornerDownLeft className="w-3.5 h-3.5 text-[#A78BFA] shrink-0 mr-1" />
                        )}
                      </motion.button>
                    );
                  })}
                </div>
              </section>
            )}

            {matchedSeries.length > 0 && (
              <section className="space-y-2">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                  <Tv className="w-3.5 h-3.5 text-[#A78BFA]" />
                  <span>
                    {pickLang(lang, {
                      es: `Series (${matchedSeries.length})`,
                      ca: `Sèries (${matchedSeries.length})`,
                      en: `Series (${matchedSeries.length})`,
                    })}
                  </span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {matchedSeries.map((item) => {
                    const idx = runningIdx++;
                    const isFocused = idx === activeIndex;
                    return (
                      <motion.button
                        key={item.id}
                        type="button"
                        whileTap={{ scale: 0.985 }}
                        onMouseEnter={() => setActiveIndex(idx)}
                        onClick={() => {
                          recordQuery(query || item.title);
                          onSelectCatalogItem(item);
                          onClose();
                        }}
                        className={`min-h-14 p-2.5 rounded-xl border flex items-center gap-3 text-left cursor-pointer transition-colors ${
                          isFocused
                            ? 'bg-[#7C3AED]/15 border-[#8B5CF6]/55'
                            : 'bg-[#0D0D12] hover:bg-[#14141C] border-white/[0.08]'
                        }`}
                      >
                        <div className="w-10 shrink-0 rounded-lg overflow-hidden">
                          <PosterImage
                            src={item.poster || '/icon.svg'}
                            alt={item.title}
                            fallbackTitle={item.title}
                            aspect="poster"
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold text-white leading-snug break-words">{item.title}</div>
                          <div className="text-[11px] text-zinc-400 tabular-nums">
                            {pickLang(lang, { es: 'Serie', ca: 'Sèrie', en: 'Series' })}{' '}
                            {item.year ? `· ${item.year}` : ''}
                          </div>
                        </div>
                        {isFocused && (
                          <CornerDownLeft className="w-3.5 h-3.5 text-[#A78BFA] shrink-0 mr-1" />
                        )}
                      </motion.button>
                    );
                  })}
                </div>
              </section>
            )}

            {matchedChannels.length > 0 && onSelectChannel && (
              <section className="space-y-2">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                  <Trophy className="w-3.5 h-3.5 text-[#A78BFA]" />
                  <span>
                    {pickLang(lang, {
                      es: `En directo (${matchedChannels.length})`,
                      ca: `En directe (${matchedChannels.length})`,
                      en: `Live (${matchedChannels.length})`,
                    })}
                  </span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {matchedChannels.map((ch) => {
                    const idx = runningIdx++;
                    const isFocused = idx === activeIndex;
                    return (
                      <motion.button
                        key={ch.id}
                        type="button"
                        whileTap={{ scale: 0.985 }}
                        onMouseEnter={() => setActiveIndex(idx)}
                        onClick={() => {
                          recordQuery(query || ch.name);
                          onSelectChannel(ch);
                          onClose();
                        }}
                        className={`min-h-14 p-2.5 rounded-xl border flex items-center gap-2.5 text-left cursor-pointer transition-colors ${
                          isFocused
                            ? 'bg-[#7C3AED]/15 border-[#8B5CF6]/55'
                            : 'bg-[#0D0D12] hover:bg-[#14141C] border-white/[0.08]'
                        }`}
                      >
                        <ChannelLogoBadge channel={ch} size="sm" />
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold text-white leading-snug break-words">{ch.name}</div>
                          <div className="text-[11px] text-[#A78BFA]">
                            {pickLang(lang, {
                              es: 'En directo',
                              ca: 'En directe',
                              en: 'Live',
                            })}
                          </div>
                        </div>
                      </motion.button>
                    );
                  })}
                </div>
              </section>
            )}
            {onSearchWithAi && query.trim().length >= 2 && !loadingRemote && (
              <div className="pt-1">
                <div className="p-3 rounded-xl bg-[#7C3AED]/[0.08] border border-[#8B5CF6]/25 flex flex-wrap items-center justify-between gap-2.5">
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white">
                      {pickLang(lang, {
                        es: '¿No encuentras el título?',
                        ca: 'No trobes el títol?',
                        en: 'Cannot find the title?',
                      })}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const cleanQ = query.trim();
                      recordQuery(cleanQ);
                      onClose();
                      onSearchWithAi(cleanQ, 'all');
                    }}
                    className="min-h-12 px-4 rounded-xl bg-[#7C3AED] hover:bg-[#8B5CF6] text-white text-xs font-bold inline-flex items-center gap-1.5 shrink-0 cursor-pointer active:scale-95 transition-all"
                  >
                    <Wand2 className="w-4 h-4 shrink-0" />
                    <span>
                      {pickLang(lang, {
                        es: 'Buscar título',
                        ca: 'Cercar títol',
                        en: 'Find title',
                      })}
                    </span>
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </BottomSheet>
  );
};

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { CornerDownLeft, Film, Loader2, Search, Sparkles, Trophy, Tv, X } from 'lucide-react';
import type { AppLanguage, CatalogMovie, SpanishTdtChannel } from '../types';
import { pickLang } from '../utils/i18n';
import { BottomSheet, StandardInput } from './ui/DesignSystem';
import { PosterImage } from './ui/PosterImage';

interface CommandSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang?: AppLanguage;
  movies: CatalogMovie[];
  series: CatalogMovie[];
  tdtChannels: SpanishTdtChannel[];
  onSelectCatalogItem: (item: CatalogMovie) => void;
  onSelectChannel?: (ch: SpanishTdtChannel) => void;
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
  const [loadingRemote, setLoadingRemote] = useState(false);

  useEffect(() => {
    const clean = query.trim();
    if (!isOpen || clean.length < 2 || /^https?:\/\//i.test(clean)) {
      setRemoteMovies([]);
      setRemoteSeries([]);
      setLoadingRemote(false);
      return;
    }

    const controller = new AbortController();
    let active = true;
    setLoadingRemote(true);

    const timer = window.setTimeout(() => {
      let pending = 2;
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
          setRemoteMovies(Array.isArray(data?.movies) ? data.movies.slice(0, 8) : []);
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
          setRemoteSeries(Array.isArray(data?.series) ? data.series.slice(0, 8) : []);
        })
        .catch(() => {
          if (active && !controller.signal.aborted) setRemoteSeries([]);
        })
        .finally(doneOne);
    }, 180);

    return () => {
      active = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [isOpen, query, lang]);

  const normText = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const normCompact = (s: string) => normText(s).replace(/[^a-z0-9]+/g, '');

  const normQuery = normText(query).trim();
  const compactQuery = normCompact(query);

  const matchedMovies = useMemo(() => {
    if (!normQuery) return movies.slice(0, 6);
    const localHits = movies.filter((m) => {
      const t = normText(m.title);
      const orig = normText(m.originalTitle || '');
      return (
        t.includes(normQuery) ||
        orig.includes(normQuery) ||
        (compactQuery.length >= 2 &&
          (normCompact(m.title).includes(compactQuery) ||
            normCompact(m.originalTitle || '').includes(compactQuery)))
      );
    });
    const merged: CatalogMovie[] = [];
    const seen = new Set<string>();
    for (const item of [...remoteMovies, ...localHits]) {
      const key = item.tmdbId ? `tmdb-${item.tmdbId}` : `id-${item.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(item);
      if (merged.length >= 8) break;
    }
    return merged;
  }, [movies, remoteMovies, normQuery, compactQuery]);

  const matchedSeries = useMemo(() => {
    if (!normQuery) return series.slice(0, 6);
    const localHits = series.filter((s) => {
      const t = normText(s.title);
      const orig = normText(s.originalTitle || '');
      return (
        t.includes(normQuery) ||
        orig.includes(normQuery) ||
        (compactQuery.length >= 2 &&
          (normCompact(s.title).includes(compactQuery) ||
            normCompact(s.originalTitle || '').includes(compactQuery)))
      );
    });
    const merged: CatalogMovie[] = [];
    const seen = new Set<string>();
    for (const item of [...remoteSeries, ...localHits]) {
      const key = item.tmdbId ? `tmdb-${item.tmdbId}` : `id-${item.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(item);
      if (merged.length >= 8) break;
    }
    return merged;
  }, [series, remoteSeries, normQuery, compactQuery]);

  const matchedChannels = useMemo(() => {
    if (!normQuery) return tdtChannels.slice(0, 4);
    return tdtChannels
      .filter((c) => {
        const hay = `${c.name} ${c.network} ${c.shortMark}`;
        return (
          normText(hay).includes(normQuery) ||
          (compactQuery.length >= 2 && normCompact(hay).includes(compactQuery))
        );
      })
      .slice(0, 6);
  }, [tdtChannels, normQuery, compactQuery]);

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
        es: 'Búsqueda Spotlight',
        ca: 'Cerca Spotlight',
        en: 'Spotlight Search',
      })}
      subtitle={pickLang(lang, {
        es: 'Películas, series y TV en directo · ↑↓ y Enter para abrir',
        ca: 'Pel·lícules, sèries i TV en directe · ↑↓ i Enter per obrir',
        en: 'Movies, series and Live TV · ↑↓ & Enter to open',
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
            es: 'Escribe título, género o canal...',
            ca: 'Escriu títol, gènere o canal...',
            en: 'Type title, genre or channel...',
          })}
          icon={<Search className="w-4 h-4" />}
          rightElement={
            query ? (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="min-h-8 min-w-8 rounded-lg text-zinc-400 hover:text-white flex items-center justify-center cursor-pointer"
                aria-label={pickLang(lang, {
                  es: 'Limpiar búsqueda',
                  ca: 'Netejar cerca',
                  en: 'Clear search',
                })}
              >
                <X className="w-4 h-4" />
              </button>
            ) : (
              <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded-md bg-white/[0.06] border border-white/10 font-mono text-[10px] text-zinc-400">
                ⌘K
              </kbd>
            )
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
                className="min-h-8 px-2.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.11] border border-white/[0.06] text-xs text-zinc-200 cursor-pointer transition-colors"
              >
                {rq}
              </button>
            ))}
          </div>
        )}

        {loadingRemote && (
          <div className="px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.06] flex items-center gap-2 text-xs text-zinc-300">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-[#BF94FF] shrink-0" />
            <span>
              {pickLang(lang, {
                es: 'Buscando en todo el catálogo...',
                ca: 'Cercant a tot el catàleg...',
                en: 'Searching full catalog...',
              })}
            </span>
          </div>
        )}

        {!loadingRemote && flatActions.length === 0 ? (
          <div className="py-10 text-center space-y-2 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
            <Sparkles className="w-6 h-6 text-[#BF94FF] mx-auto" />
            <p className="text-sm font-semibold text-white">
              {pickLang(lang, {
                es: 'Sin coincidencias rápidas',
                ca: 'Sense coincidències ràpides',
                en: 'No quick matches',
              })}
            </p>
            <p className="text-xs text-zinc-400">
              {pickLang(lang, {
                es: 'Prueba con otro título o abre Películas / Series para explorar todo el catálogo.',
                ca: 'Prova un altre títol o obre Pel·lícules / Sèries per explorar tot el catàleg.',
                en: 'Try another title or browse Movies / Series to explore the full catalog.',
              })}
            </p>
          </div>
        ) : flatActions.length > 0 ? (
          <div className="space-y-4">
            {matchedMovies.length > 0 && (
              <section className="space-y-2">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                  <Film className="w-3.5 h-3.5 text-[#BF94FF]" />
                  <span>
                    {pickLang(lang, {
                      es: `Películas (${matchedMovies.length})`,
                      ca: `Pel·lícules (${matchedMovies.length})`,
                      en: `Movies (${matchedMovies.length})`,
                    })}
                  </span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {matchedMovies.map((item) => {
                    const idx = runningIdx++;
                    const isFocused = idx === activeIndex;
                    return (
                      <motion.button
                        key={item.id}
                        type="button"
                        whileHover={{ y: -1 }}
                        whileTap={{ scale: 0.985 }}
                        onMouseEnter={() => setActiveIndex(idx)}
                        onClick={() => {
                          recordQuery(query || item.title);
                          onSelectCatalogItem(item);
                          onClose();
                        }}
                        className={`p-2 rounded-xl border flex items-center gap-3 text-left cursor-pointer transition-colors ${
                          isFocused
                            ? 'bg-[#9146FF]/15 border-[#9146FF]/55 shadow-[0_8px_24px_rgba(145,70,255,0.18)]'
                            : 'bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.07]'
                        }`}
                      >
                        <div className="w-10 shrink-0 rounded-lg overflow-hidden">
                          <PosterImage
                            src={item.poster || '/icon.svg'}
                            alt={item.title}
                            aspect="poster"
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold text-white truncate">{item.title}</div>
                          <div className="text-[11px] text-zinc-400 tabular-nums">
                            {item.year} {item.rating ? `· ★ ${item.rating}` : ''}
                          </div>
                        </div>
                        {isFocused && (
                          <CornerDownLeft className="w-3.5 h-3.5 text-[#BF94FF] shrink-0 mr-1" />
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
                  <Tv className="w-3.5 h-3.5 text-sky-400" />
                  <span>
                    {pickLang(lang, {
                      es: `Series (${matchedSeries.length})`,
                      ca: `Sèries (${matchedSeries.length})`,
                      en: `Series (${matchedSeries.length})`,
                    })}
                  </span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {matchedSeries.map((item) => {
                    const idx = runningIdx++;
                    const isFocused = idx === activeIndex;
                    return (
                      <motion.button
                        key={item.id}
                        type="button"
                        whileHover={{ y: -1 }}
                        whileTap={{ scale: 0.985 }}
                        onMouseEnter={() => setActiveIndex(idx)}
                        onClick={() => {
                          recordQuery(query || item.title);
                          onSelectCatalogItem(item);
                          onClose();
                        }}
                        className={`p-2 rounded-xl border flex items-center gap-3 text-left cursor-pointer transition-colors ${
                          isFocused
                            ? 'bg-[#9146FF]/15 border-[#9146FF]/55 shadow-[0_8px_24px_rgba(145,70,255,0.18)]'
                            : 'bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.07]'
                        }`}
                      >
                        <div className="w-10 shrink-0 rounded-lg overflow-hidden">
                          <PosterImage
                            src={item.poster || '/icon.svg'}
                            alt={item.title}
                            aspect="poster"
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold text-white truncate">{item.title}</div>
                          <div className="text-[11px] text-zinc-400 tabular-nums">
                            {pickLang(lang, { es: 'Serie', ca: 'Sèrie', en: 'Series' })}{' '}
                            {item.year ? `· ${item.year}` : ''}
                          </div>
                        </div>
                        {isFocused && (
                          <CornerDownLeft className="w-3.5 h-3.5 text-[#BF94FF] shrink-0 mr-1" />
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
                  <Trophy className="w-3.5 h-3.5 text-emerald-400" />
                  <span>
                    {pickLang(lang, {
                      es: `TV en directo (${matchedChannels.length})`,
                      ca: `TV en directe (${matchedChannels.length})`,
                      en: `Live TV (${matchedChannels.length})`,
                    })}
                  </span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {matchedChannels.map((ch) => {
                    const idx = runningIdx++;
                    const isFocused = idx === activeIndex;
                    return (
                      <motion.button
                        key={ch.id}
                        type="button"
                        whileHover={{ y: -1 }}
                        whileTap={{ scale: 0.985 }}
                        onMouseEnter={() => setActiveIndex(idx)}
                        onClick={() => {
                          recordQuery(query || ch.name);
                          onSelectChannel(ch);
                          onClose();
                        }}
                        className={`p-2.5 rounded-xl border flex items-center gap-2.5 text-left cursor-pointer transition-colors ${
                          isFocused
                            ? 'bg-emerald-500/15 border-emerald-500/45'
                            : 'bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.07]'
                        }`}
                      >
                        <span className="w-9 h-9 rounded-lg bg-white/10 text-xs font-bold text-white flex items-center justify-center shrink-0">
                          {ch.shortMark}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold text-white truncate">{ch.name}</div>
                          <div className="text-[11px] text-emerald-400">
                            {pickLang(lang, {
                              es: 'EN DIRECTO',
                              ca: 'EN DIRECTE',
                              en: 'LIVE',
                            })}{' '}
                            · {ch.quality}
                          </div>
                        </div>
                      </motion.button>
                    );
                  })}
                </div>
              </section>
            )}
          </div>
        ) : null}
      </div>
    </BottomSheet>
  );
};

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { CornerDownLeft, Film, Search, Sparkles, Trophy, Tv, X } from 'lucide-react';
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

  const normQuery = query
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

  const matchedMovies = useMemo(() => {
    if (!normQuery) return movies.slice(0, 6);
    return movies
      .filter((m) =>
        m.title
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .includes(normQuery)
      )
      .slice(0, 8);
  }, [movies, normQuery]);

  const matchedSeries = useMemo(() => {
    if (!normQuery) return series.slice(0, 6);
    return series
      .filter((s) =>
        s.title
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .includes(normQuery)
      )
      .slice(0, 8);
  }, [series, normQuery]);

  const matchedChannels = useMemo(() => {
    if (!normQuery) return tdtChannels.slice(0, 4);
    return tdtChannels
      .filter((c) =>
        `${c.name} ${c.network}`
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .includes(normQuery)
      )
      .slice(0, 6);
  }, [tdtChannels, normQuery]);

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

        {flatActions.length === 0 ? (
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
        ) : (
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
        )}
      </div>
    </BottomSheet>
  );
};

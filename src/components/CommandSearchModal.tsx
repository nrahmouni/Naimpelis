import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Film, Search, Trophy, Tv, X } from 'lucide-react';
import type { CatalogMovie, SpanishTdtChannel } from '../types';
import { BottomSheet, StandardInput } from './ui/DesignSystem';

interface CommandSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  movies: CatalogMovie[];
  series: CatalogMovie[];
  tdtChannels: SpanishTdtChannel[];
  onSelectCatalogItem: (item: CatalogMovie) => void;
  onSelectChannel?: (ch: SpanishTdtChannel) => void;
}

const RECENT_SEARCHES_KEY = 'naimcine_recent_searches_v1';

export const CommandSearchModal: React.FC<CommandSearchModalProps> = ({
  isOpen,
  onClose,
  movies,
  series,
  tdtChannels,
  onSelectCatalogItem,
  onSelectChannel,
}) => {
  const [query, setQuery] = useState('');
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

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title="Búsqueda rápida"
      subtitle="Películas, series y canales en directo (Cmd/Ctrl + K)"
      icon={<Search className="w-5 h-5" />}
      maxWidth="sm:max-w-2xl"
    >
      <StandardInput
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Escribe título, género o canal..."
        icon={<Search className="w-4 h-4" />}
        rightElement={
          query ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="min-h-8 min-w-8 rounded-lg text-zinc-400 hover:text-white flex items-center justify-center cursor-pointer"
              aria-label="Limpiar búsqueda"
            >
              <X className="w-4 h-4" />
            </button>
          ) : undefined
        }
      />

      {!normQuery && recentQueries.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold text-zinc-500 mr-1">Recientes:</span>
          {recentQueries.map((rq) => (
            <button
              key={rq}
              type="button"
              onClick={() => setQuery(rq)}
              className="min-h-8 px-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.11] text-xs text-zinc-200 cursor-pointer"
            >
              {rq}
            </button>
          ))}
        </div>
      )}

      <div className="space-y-4">
        {matchedMovies.length > 0 && (
          <section className="space-y-2">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
              <Film className="w-3.5 h-3.5 text-[#BF94FF]" />
              <span>Películas ({matchedMovies.length})</span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {matchedMovies.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    recordQuery(query || item.title);
                    onSelectCatalogItem(item);
                    onClose();
                  }}
                  className="p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.09] border border-white/[0.07] flex items-center gap-3 text-left cursor-pointer"
                >
                  <img
                    src={item.poster || '/icon.svg'}
                    alt={item.title}
                    className="w-10 aspect-[2/3] rounded-lg object-cover bg-zinc-900 shrink-0"
                  />
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white truncate">{item.title}</div>
                    <div className="text-[11px] text-zinc-400">
                      {item.year} {item.rating ? `· ★ ${item.rating}` : ''}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {matchedSeries.length > 0 && (
          <section className="space-y-2">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
              <Tv className="w-3.5 h-3.5 text-sky-400" />
              <span>Series ({matchedSeries.length})</span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {matchedSeries.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    recordQuery(query || item.title);
                    onSelectCatalogItem(item);
                    onClose();
                  }}
                  className="p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.09] border border-white/[0.07] flex items-center gap-3 text-left cursor-pointer"
                >
                  <img
                    src={item.poster || '/icon.svg'}
                    alt={item.title}
                    className="w-10 aspect-[2/3] rounded-lg object-cover bg-zinc-900 shrink-0"
                  />
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white truncate">{item.title}</div>
                    <div className="text-[11px] text-zinc-400">
                      Serie {item.year ? `· ${item.year}` : ''}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {matchedChannels.length > 0 && onSelectChannel && (
          <section className="space-y-2">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
              <Trophy className="w-3.5 h-3.5 text-emerald-400" />
              <span>TV en directo ({matchedChannels.length})</span>
            </h4>
            <div className="grid grid-cols-2 gap-2">
              {matchedChannels.map((ch) => (
                <button
                  key={ch.id}
                  type="button"
                  onClick={() => {
                    recordQuery(query || ch.name);
                    onSelectChannel(ch);
                    onClose();
                  }}
                  className="p-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.09] border border-white/[0.07] flex items-center gap-2.5 text-left cursor-pointer"
                >
                  <span className="w-9 h-9 rounded-lg bg-white/10 text-xs font-bold text-white flex items-center justify-center shrink-0">
                    {ch.shortMark}
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white truncate">{ch.name}</div>
                    <div className="text-[11px] text-emerald-400">EN DIRECTO · {ch.quality}</div>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </BottomSheet>
  );
};

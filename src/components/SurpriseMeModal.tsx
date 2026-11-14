import React, { useMemo, useState } from 'react';
import { Sparkles, Play, Shuffle, Flame, Laugh, Tv, Trophy } from 'lucide-react';
import type { CatalogMovie } from '../types';
import { BottomSheet, PrimaryButton, SecondaryButton } from './ui/DesignSystem';

interface SurpriseMeModalProps {
  isOpen: boolean;
  onClose: () => void;
  movies: CatalogMovie[];
  series: CatalogMovie[];
  onPlayItem: (item: CatalogMovie) => void;
}

type MoodId = 'all' | 'intense' | 'chill' | 'series' | 'highrated';

export const SurpriseMeModal: React.FC<SurpriseMeModalProps> = ({
  isOpen,
  onClose,
  movies,
  series,
  onPlayItem,
}) => {
  const [mood, setMood] = useState<MoodId>('all');
  const [rollSeed, setRollSeed] = useState<number>(() => Math.floor(Math.random() * 10000));

  const pickedItem = useMemo(() => {
    const pool =
      mood === 'series'
        ? series
        : mood === 'highrated'
          ? [...movies, ...series].filter((i) => parseFloat(i.rating || '0') >= 7.5)
          : mood === 'chill'
            ? movies.filter((i) => !/terror|guerra|miedo/i.test(i.overview || ''))
            : [...movies, ...series];
    const safePool = pool.length > 0 ? pool : [...movies, ...series];
    if (safePool.length === 0) return null;
    return safePool[rollSeed % safePool.length] || safePool[0];
  }, [movies, series, mood, rollSeed]);

  const moods: Array<{ id: MoodId; label: string; icon: React.ReactNode }> = [
    { id: 'all', label: 'Aleatorio', icon: <Sparkles className="w-3.5 h-3.5" /> },
    { id: 'highrated', label: 'Top +7.5★', icon: <Trophy className="w-3.5 h-3.5" /> },
    { id: 'intense', label: 'Cine de hoy', icon: <Flame className="w-3.5 h-3.5" /> },
    { id: 'chill', label: 'Para desconectar', icon: <Laugh className="w-3.5 h-3.5" /> },
    { id: 'series', label: 'Maratón serie', icon: <Tv className="w-3.5 h-3.5" /> },
  ];

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title="Sorpréndeme"
      subtitle="Elige un estado de ánimo y NAIM CINE selecciona por ti"
      icon={<Sparkles className="w-5 h-5" />}
      maxWidth="sm:max-w-lg"
    >
      <div className="flex flex-wrap gap-1.5">
        {moods.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => {
              setMood(m.id);
              setRollSeed((prev) => prev + 7);
            }}
            className={`min-h-9 px-3 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors ${
              mood === m.id
                ? 'bg-[#9146FF] text-white'
                : 'bg-[#26262C] text-[#EFEFF1] hover:bg-white/[0.14]'
            }`}
          >
            {m.icon}
            <span>{m.label}</span>
          </button>
        ))}
      </div>

      {pickedItem ? (
        <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/[0.09] flex gap-4 items-center">
          <img
            src={pickedItem.poster || '/icon.svg'}
            alt={pickedItem.title}
            className="w-24 aspect-[2/3] object-cover rounded-xl bg-zinc-900 shrink-0"
          />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-400">
              <span>{pickedItem.mediaType === 'tv' ? 'Serie' : 'Película'}</span>
              {pickedItem.year && <span>· {pickedItem.year}</span>}
              {pickedItem.rating && <span>· ★ {pickedItem.rating}</span>}
            </div>
            <h4 className="text-base font-bold text-white leading-snug line-clamp-2">
              {pickedItem.title}
            </h4>
            <p className="text-xs text-zinc-400 line-clamp-3 leading-relaxed">
              {pickedItem.overview || 'Título destacado listo para proyectar en tu sala sincronizada.'}
            </p>
          </div>
        </div>
      ) : (
        <p className="text-xs text-zinc-400 py-6 text-center">
          Cargando catálogo para recomendarte un título...
        </p>
      )}

      <div className="flex items-center gap-2.5 pt-1">
        <SecondaryButton
          onClick={() => setRollSeed((prev) => prev + Math.floor(Math.random() * 19) + 1)}
          className="flex-1"
        >
          <Shuffle className="w-4 h-4" />
          <span>Otra sugerencia</span>
        </SecondaryButton>
        {pickedItem && (
          <PrimaryButton
            onClick={() => {
              onPlayItem(pickedItem);
              onClose();
            }}
            className="flex-1"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>Reproducir ahora</span>
          </PrimaryButton>
        )}
      </div>
    </BottomSheet>
  );
};

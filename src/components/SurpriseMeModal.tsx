import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Sparkles, Play, Shuffle, Flame, Laugh, Tv, Trophy, Loader2 } from 'lucide-react';
import type { CatalogMovie } from '../types';
import { BottomSheet, PrimaryButton, SecondaryButton } from './ui/DesignSystem';

interface SurpriseMeModalProps {
  isOpen: boolean;
  onClose: () => void;
  movies: CatalogMovie[];
  series: CatalogMovie[];
  isLoading?: boolean;
  onRetryLoad?: () => void;
  onPlayItem: (item: CatalogMovie) => void;
}

type MoodId = 'all' | 'intense' | 'chill' | 'series' | 'highrated';

export const SurpriseMeModal: React.FC<SurpriseMeModalProps> = ({
  isOpen,
  onClose,
  movies,
  series,
  isLoading = false,
  onRetryLoad,
  onPlayItem,
}) => {
  const [mood, setMood] = useState<MoodId>('all');
  const [rollSeed, setRollSeed] = useState<number>(() => Math.floor(Math.random() * 10000));

  const pickedItem = useMemo(() => {
    const combined = [...movies, ...series];
    const pool =
      mood === 'series'
        ? series
        : mood === 'highrated'
          ? combined.filter((i) => parseFloat(i.rating || '0') >= 7.5)
          : mood === 'intense'
            ? movies.filter(
                (i) =>
                  parseFloat(i.rating || '0') >= 6.5 ||
                  /accion|thriller|sci|misterio|batalla|crimen/i.test(i.overview || '')
              )
            : mood === 'chill'
              ? combined.filter((i) => !/terror|guerra|horror|asesin/i.test(i.overview || ''))
              : combined;
    const safePool = pool.length > 0 ? pool : combined;
    if (safePool.length === 0) return null;
    return safePool[rollSeed % safePool.length] || safePool[0];
  }, [movies, series, mood, rollSeed]);

  const moods: Array<{ id: MoodId; label: string; icon: React.ReactNode }> = [
    { id: 'all', label: 'Aleatorio', icon: <Sparkles className="w-3.5 h-3.5" /> },
    { id: 'highrated', label: 'Top +7.5★', icon: <Trophy className="w-3.5 h-3.5" /> },
    { id: 'intense', label: 'Cine de hoy', icon: <Flame className="w-3.5 h-3.5" /> },
    { id: 'chill', label: 'Desconectar', icon: <Laugh className="w-3.5 h-3.5" /> },
    { id: 'series', label: 'Maratón serie', icon: <Tv className="w-3.5 h-3.5" /> },
  ];

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title="Sorpréndeme"
      subtitle="Elige tu mood y proyecta una recomendación instantánea"
      icon={<Sparkles className="w-5 h-5" />}
      maxWidth="sm:max-w-lg"
    >
      <div className="flex flex-wrap gap-1.5 min-w-0">
        {moods.map((m) => {
          const active = mood === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                setMood(m.id);
                setRollSeed((prev) => prev + 7);
              }}
              className={`min-h-10 px-3 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all whitespace-nowrap ${
                active
                  ? 'bg-gradient-to-b from-[#9E5CFF] to-[#772CE8] text-white shadow-[0_6px_18px_rgba(145,70,255,0.35)]'
                  : 'bg-white/[0.06] text-zinc-300 hover:text-white hover:bg-white/[0.11] border border-white/[0.07]'
              }`}
            >
              {m.icon}
              <span>{m.label}</span>
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        {pickedItem ? (
          <motion.div
            key={`${pickedItem.id}-${rollSeed}`}
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="p-3.5 sm:p-4 rounded-2xl nc-specular-surface border border-white/[0.09] flex gap-3.5 sm:gap-4 items-center min-w-0"
          >
            <img
              src={pickedItem.poster || '/icon.svg'}
              alt={pickedItem.title}
              className="w-20 sm:w-24 aspect-[2/3] object-cover rounded-xl bg-zinc-900 shrink-0 shadow-[0_12px_30px_rgba(0,0,0,0.6)]"
            />
            <div className="min-w-0 flex-1 space-y-1.5 sm:space-y-2">
              <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-400 tabular-nums">
                <span className="text-[#BF94FF] font-semibold">
                  {pickedItem.mediaType === 'tv' ? 'Serie' : 'Película'}
                </span>
                {pickedItem.year && <span>· {pickedItem.year}</span>}
                {pickedItem.rating && <span>· ★ {pickedItem.rating}</span>}
              </div>
              <h4 className="font-display text-base font-bold text-white leading-snug line-clamp-2">
                {pickedItem.title}
              </h4>
              <p className="text-xs text-zinc-400 line-clamp-3 leading-relaxed">
                {pickedItem.overview ||
                  'Título destacado listo para proyectar en tu sala sincronizada.'}
              </p>
            </div>
          </motion.div>
        ) : (
          <div className="py-8 flex flex-col items-center justify-center gap-3 text-center">
            {isLoading ? (
              <>
                <Loader2 className="w-6 h-6 text-[#BF94FF] animate-spin" />
                <p className="text-xs text-zinc-300 font-medium">
                  Cargando estrenos, series y películas para sorprenderte...
                </p>
              </>
            ) : (
              <>
                <p className="text-xs text-zinc-400">
                  No se pudo cargar la sugerencia en este momento.
                </p>
                {onRetryLoad && (
                  <SecondaryButton onClick={onRetryLoad} size="md">
                    <Shuffle className="w-4 h-4" />
                    <span>Reintentar</span>
                  </SecondaryButton>
                )}
              </>
            )}
          </div>
        )}
      </AnimatePresence>

      <div className="flex items-center gap-2 sm:gap-2.5 pt-1 min-w-0">
        <SecondaryButton
          onClick={() => {
            if (!pickedItem && onRetryLoad) {
              onRetryLoad();
            } else {
              setRollSeed((prev) => prev + Math.floor(Math.random() * 19) + 1);
            }
          }}
          className="flex-1 min-w-0 !px-3 whitespace-nowrap"
        >
          <Shuffle className="w-4 h-4 shrink-0" />
          <span className="truncate">Otra sugerencia</span>
        </SecondaryButton>
        {pickedItem && (
          <PrimaryButton
            onClick={() => {
              onPlayItem(pickedItem);
              onClose();
            }}
            className="flex-1 min-w-0 !px-3 whitespace-nowrap"
          >
            <Play className="w-4 h-4 shrink-0 fill-current" />
            <span className="truncate">Reproducir ahora</span>
          </PrimaryButton>
        )}
      </div>
    </BottomSheet>
  );
};

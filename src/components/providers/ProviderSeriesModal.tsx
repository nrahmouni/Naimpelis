import React, { useEffect, useState } from 'react';
import { Loader2, Play, Tv, X } from 'lucide-react';
import type {
  ProviderSeriesEpisodeItem,
  ProviderSeriesInfoResult,
  ProviderSeriesItem,
} from '../../types/providers';
import { fetchProviderSeriesEpisodes } from '../../services/xtreamProvidersService';
import { useBackInterceptor } from '../../lib/backInterceptor';
import { PosterImage } from '../ui/PosterImage';

interface ProviderSeriesModalProps {
  series: ProviderSeriesItem | null;
  onClose: () => void;
  onPlayEpisode: (
    episode: ProviderSeriesEpisodeItem,
    series: ProviderSeriesItem
  ) => void;
}

export const ProviderSeriesModal: React.FC<ProviderSeriesModalProps> = ({
  series,
  onClose,
  onPlayEpisode,
}) => {
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<ProviderSeriesInfoResult | null>(null);
  const [selectedSeason, setSelectedSeason] = useState<number>(1);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useBackInterceptor(Boolean(series), 'provider-series-modal', onClose, {
    priority: 18,
  });

  useEffect(() => {
    if (!series) {
      setInfo(null);
      setErrorMsg(null);
      return;
    }

    const ctrl = new AbortController();
    setLoading(true);
    setErrorMsg(null);
    setInfo(null);

    void fetchProviderSeriesEpisodes(series.providerId, series.seriesId, ctrl.signal)
      .then((res) => {
        if (ctrl.signal.aborted) return;
        if (!res || res.seasons.length === 0) {
          setErrorMsg('Episodios no disponibles temporalmente.');
          return;
        }
        setInfo(res);
        setSelectedSeason(res.seasons[0] ?? 1);
      })
      .catch(() => {
        if (!ctrl.signal.aborted) {
          setErrorMsg('No se pudieron cargar los episodios.');
        }
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });

    return () => ctrl.abort();
  }, [series]);

  useEffect(() => {
    if (!series) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [series, onClose]);

  if (!series) return null;

  const episodes = info?.episodesBySeason[String(selectedSeason)] || [];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={series.name}
      className="fixed inset-0 z-[110] flex items-center justify-center p-3 sm:p-6 bg-black/82 backdrop-blur-md animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-3xl max-h-[88dvh] rounded-3xl bg-[#0D0D12] border border-white/[0.1] shadow-[0_24px_80px_rgba(0,0,0,0.95)] flex flex-col overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-white/[0.08] flex items-start gap-4">
          <div className="w-16 sm:w-20 shrink-0 rounded-xl overflow-hidden border border-white/[0.08]">
            <PosterImage
              src={info?.poster || series.poster}
              alt={series.name}
              aspect="poster"
              fallbackTitle={series.name}
            />
          </div>

          <div className="flex-1 min-w-0 space-y-1">
            <h3 className="font-display font-bold text-base sm:text-lg text-white leading-snug">
              {series.name}
            </h3>
            <p className="text-xs text-zinc-400">
              {series.providerName} · {series.categoryName}
              {series.year ? ` · ${series.year}` : ''}
            </p>
            {(info?.plot || series.plot) && (
              <p className="text-xs text-zinc-300 line-clamp-2 pt-0.5">
                {info?.plot || series.plot}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="w-10 h-10 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-zinc-300 hover:text-white flex items-center justify-center shrink-0 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 space-y-4">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-zinc-400">
              <Loader2 className="w-6 h-6 animate-spin text-[#8B5CF6]" />
              <span className="text-xs">Cargando temporadas y episodios...</span>
            </div>
          ) : errorMsg ? (
            <div className="py-10 text-center text-xs text-zinc-400">
              {errorMsg}
            </div>
          ) : info ? (
            <>
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
                {info.seasons.map((sNum) => (
                  <button
                    key={sNum}
                    type="button"
                    onClick={() => setSelectedSeason(sNum)}
                    className={`min-h-10 px-3.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                      selectedSeason === sNum
                        ? 'bg-[#7C3AED] text-white'
                        : 'bg-black border border-white/[0.08] text-zinc-300 hover:bg-white/[0.06]'
                    }`}
                  >
                    Temporada {sNum}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {episodes.map((ep) => (
                  <button
                    key={ep.id}
                    type="button"
                    onClick={() => onPlayEpisode(ep, series)}
                    className="rounded-2xl bg-black border border-white/[0.08] hover:border-[#7C3AED]/60 p-3 flex items-center justify-between gap-3 text-left cursor-pointer group active:scale-[0.99] transition-all"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-9 h-9 rounded-xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center text-xs font-bold text-zinc-200 tabular-nums shrink-0">
                        {ep.episodeNum}
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-white truncate">
                          {ep.title || `Episodio ${ep.episodeNum}`}
                        </p>
                        <p className="text-[11px] text-zinc-400 tabular-nums truncate">
                          T{ep.season} · E{ep.episodeNum}
                          {ep.duration ? ` · ${ep.duration}` : ''}
                        </p>
                      </div>
                    </div>

                    <span className="w-9 h-9 rounded-xl bg-[#7C3AED]/20 group-hover:bg-[#7C3AED] text-[#C4A7FF] group-hover:text-white flex items-center justify-center shrink-0 transition-colors">
                      <Play className="w-3.5 h-3.5 fill-current" />
                    </span>
                  </button>
                ))}
                {episodes.length === 0 && (
                  <div className="col-span-full py-6 text-center text-xs text-zinc-400 flex items-center justify-center gap-2">
                    <Tv className="w-4 h-4" />
                    <span>Sin episodios en esta temporada.</span>
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};

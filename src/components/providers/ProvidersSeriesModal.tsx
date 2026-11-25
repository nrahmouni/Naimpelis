import React, { useEffect, useState } from 'react';
import { Loader2, Play, X } from 'lucide-react';
import type { AppLanguage } from '../../types';
import { pickLang } from '../../utils/i18n';
import { useBackInterceptor } from '../../lib/backInterceptor';
import type {
  ProviderSeriesDetailPublic,
  ProviderSeriesEpisodePublic,
} from './providersTypes';

interface ProvidersSeriesModalProps {
  lang: AppLanguage;
  providerId: string;
  seriesId: string;
  initialTitle: string;
  initialPoster?: string;
  onClose: () => void;
  onPlayEpisode: (
    detail: ProviderSeriesDetailPublic,
    episode: ProviderSeriesEpisodePublic
  ) => void;
}

export const ProvidersSeriesModal: React.FC<ProvidersSeriesModalProps> = ({
  lang,
  providerId,
  seriesId,
  initialTitle,
  initialPoster,
  onClose,
  onPlayEpisode,
}) => {
  const [detail, setDetail] = useState<ProviderSeriesDetailPublic | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSeason, setActiveSeason] = useState<number>(1);

  useBackInterceptor(true, 'providers-series-modal', onClose, { priority: 20 });

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/providers/${encodeURIComponent(providerId)}/series/${encodeURIComponent(seriesId)}`)
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (cancelled) return;
        if (!ok || !d?.success || !d?.detail) {
          setError(
            d?.error ||
              pickLang(lang, {
                es: 'No se pudieron cargar las temporadas de esta serie.',
                ca: 'No s’han pogut carregar les temporades d’aquesta sèrie.',
                en: 'Could not load seasons for this series.',
              })
          );
          return;
        }
        const loaded = d.detail as ProviderSeriesDetailPublic;
        setDetail(loaded);
        if (loaded.seasons.length > 0) {
          setActiveSeason(loaded.seasons[0].seasonNumber);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(
            pickLang(lang, {
              es: 'Error de red al consultar episodios.',
              ca: 'Error de xarxa en consultar episodis.',
              en: 'Network error loading episodes.',
            })
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [providerId, seriesId, lang]);

  const currentSeason = detail?.seasons.find((s) => s.seasonNumber === activeSeason) || detail?.seasons[0];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={detail?.title || initialTitle}
      className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-3xl max-h-[88dvh] rounded-[24px] bg-[#0D0D12] border border-white/12 shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-start justify-between gap-4 p-4 sm:p-5 border-b border-white/[0.08]">
          <div className="flex items-start gap-3.5 min-w-0">
            {(detail?.poster || initialPoster) && (
              <img
                src={detail?.poster || initialPoster}
                alt={detail?.title || initialTitle}
                className="w-16 h-24 rounded-xl object-cover shrink-0 border border-white/10 bg-zinc-900"
              />
            )}
            <div className="min-w-0 space-y-1">
              <h2 className="font-display font-bold text-lg sm:text-xl text-white leading-tight truncate">
                {detail?.title || initialTitle}
              </h2>
              <p className="text-xs text-zinc-400">
                {[detail?.providerName, detail?.year, detail?.genre, detail?.rating ? `★ ${detail.rating}` : '']
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              {detail?.plot && (
                <p className="text-xs text-zinc-300/90 line-clamp-2 pt-0.5">{detail.plot}</p>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={pickLang(lang, { es: 'Cerrar', ca: 'Tancar', en: 'Close' })}
            className="min-w-11 min-h-11 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-zinc-200 flex items-center justify-center shrink-0 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 space-y-4 custom-scrollbar">
          {loading ? (
            <div className="py-12 flex items-center justify-center gap-2.5 text-sm text-zinc-400">
              <Loader2 className="w-5 h-5 animate-spin text-[#A78BFA]" />
              <span>
                {pickLang(lang, {
                  es: 'Cargando temporadas y capítulos...',
                  ca: 'Carregant temporades i capítols...',
                  en: 'Loading seasons & episodes...',
                })}
              </span>
            </div>
          ) : error ? (
            <div className="py-10 text-center text-sm text-rose-300">{error}</div>
          ) : !detail || detail.seasons.length === 0 ? (
            <div className="py-10 text-center text-sm text-zinc-400">
              {pickLang(lang, {
                es: 'Esta serie no tiene episodios disponibles todavía.',
                ca: 'Aquesta sèrie encara no té episodis disponibles.',
                en: 'No episodes available for this series yet.',
              })}
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {detail.seasons.map((season) => {
                  const selected = season.seasonNumber === currentSeason?.seasonNumber;
                  return (
                    <button
                      key={season.seasonNumber}
                      type="button"
                      onClick={() => setActiveSeason(season.seasonNumber)}
                      className={`min-h-10 px-3.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer tabular-nums ${
                        selected
                          ? 'bg-[#7C3AED] border-[#8B5CF6] text-white'
                          : 'bg-[#14141C] border-white/[0.08] text-zinc-300 hover:bg-white/[0.07]'
                      }`}
                    >
                      {season.name} ({season.episodes.length})
                    </button>
                  );
                })}
              </div>

              <div className="space-y-2">
                {(currentSeason?.episodes || []).map((ep) => (
                  <button
                    key={ep.id}
                    type="button"
                    onClick={() => onPlayEpisode(detail, ep)}
                    className="w-full min-h-[58px] p-3 rounded-2xl bg-[#14141C] hover:bg-[#1C1C26] border border-white/[0.07] hover:border-[#7C3AED]/60 flex items-center justify-between gap-3 text-left transition-all cursor-pointer group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-9 h-9 rounded-xl bg-[#7C3AED]/15 border border-[#7C3AED]/30 text-[#C4B5FD] text-xs font-bold flex items-center justify-center shrink-0 tabular-nums">
                        {ep.episodeNum}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{ep.title}</p>
                        <p className="text-[11px] text-zinc-400 truncate mt-0.5 tabular-nums">
                          {[
                            `T${ep.season} · E${ep.episodeNum}`,
                            ep.duration,
                            ep.containerExtension.toUpperCase(),
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </div>
                    </div>
                    <span className="w-10 h-10 rounded-xl bg-white/[0.06] group-hover:bg-[#7C3AED] text-zinc-200 group-hover:text-white flex items-center justify-center shrink-0 transition-colors">
                      <Play className="w-4 h-4 fill-current ml-0.5" />
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

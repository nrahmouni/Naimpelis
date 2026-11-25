/**
 * @module src/components/belix/XtreamSeriesEpisodesModal
 * @description BottomSheet modal displaying Xtream series details, season selector tabs,
 * and clickable episodes fetched on demand from /api/xtream/series-info.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Clapperboard, Loader2, Play, Star } from 'lucide-react';
import type { AppLanguage, SpanishTdtChannel } from '../../types';
import {
  fetchXtreamSeriesInfo,
  type XtreamSeriesEpisodeItem,
  type XtreamSeriesInfoPayload,
  type XtreamSeriesItem,
} from '../../services/xtreamClientService';
import { BottomSheet } from '../ui/DesignSystem';
import { triggerHaptic } from '../../utils/haptics';
import { pickLang } from '../../utils/i18n';
import {
  XtreamPosterMedia,
  buildSeriesEpisodeTdtChannel,
  formatXtreamRating,
} from './XtreamMediaHelpers';

interface XtreamSeriesEpisodesModalProps {
  series: XtreamSeriesItem | null;
  categoryName?: string;
  accentColor?: string;
  lang: AppLanguage;
  onClose: () => void;
  onPlayTdtChannel: (channel: SpanishTdtChannel, signalIndex?: number) => void;
}

export const XtreamSeriesEpisodesModal: React.FC<XtreamSeriesEpisodesModalProps> = ({
  series,
  categoryName = 'Series',
  accentColor = '#0EA5E9',
  lang,
  onClose,
  onPlayTdtChannel,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<XtreamSeriesInfoPayload | null>(null);
  const [selectedSeason, setSelectedSeason] = useState<number>(1);

  useEffect(() => {
    if (!series) {
      setInfo(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setInfo(null);

    void fetchXtreamSeriesInfo(series.seriesId, series.providerId || 'primary')
      .then((res) => {
        if (cancelled) return;
        if (!res.ok || !res.info) {
          setError(res.error || 'No se pudieron cargar las temporadas.');
          return;
        }
        setInfo(res.info);
        if (res.info.seasons.length > 0) {
          setSelectedSeason(res.info.seasons[0].seasonNumber);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [series]);

  const activeSeasonGroup = useMemo(() => {
    if (!info || info.seasons.length === 0) return null;
    return (
      info.seasons.find((s) => s.seasonNumber === selectedSeason) || info.seasons[0]
    );
  }, [info, selectedSeason]);

  const handlePlayEpisode = (episode: XtreamSeriesEpisodeItem) => {
    if (!series) return;
    triggerHaptic('success');
    const channel = buildSeriesEpisodeTdtChannel(series, episode, accentColor);
    onClose();
    onPlayTdtChannel(channel, 0);
  };

  return (
    <BottomSheet
      isOpen={Boolean(series)}
      onClose={onClose}
      lang={lang}
      maxWidth="sm:max-w-2xl"
      icon={<Clapperboard className="w-5 h-5" />}
      title={info?.title || series?.name || ''}
      subtitle={
        series
          ? [series.providerName, categoryName, info?.genre || series.genre]
              .filter(Boolean)
              .join(' · ')
          : undefined
      }
    >
      {series && (
        <div className="space-y-4">
          <div className="flex items-start gap-3.5">
            <div className="w-20 sm:w-24 aspect-[2/3] rounded-xl overflow-hidden border border-white/[0.1] bg-black/50 shrink-0">
              <XtreamPosterMedia
                src={info?.cover || series.cover}
                alt={series.name}
                variant="series"
                accentColor={accentColor}
                className="w-full h-full object-cover"
              />
            </div>

            <div className="min-w-0 flex-1 space-y-1.5 text-xs">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-zinc-300 tabular-nums">
                {formatXtreamRating(info?.rating || series.rating) && (
                  <span className="inline-flex items-center gap-1 font-semibold text-amber-300">
                    <Star className="w-3.5 h-3.5 fill-current" />
                    <span>{formatXtreamRating(info?.rating || series.rating)}</span>
                  </span>
                )}
                {(info?.releaseDate || series.releaseDate) && (
                  <span className="text-zinc-400">
                    {info?.releaseDate || series.releaseDate}
                  </span>
                )}
                {info && info.seasons.length > 0 && (
                  <span className="text-zinc-300 font-semibold">
                    {info.seasons.length}{' '}
                    {info.seasons.length === 1 ? 'temporada' : 'temporadas'}
                  </span>
                )}
              </div>

              {(info?.plot || series.plot) && (
                <p className="text-xs text-zinc-400 leading-relaxed line-clamp-4">
                  {info?.plot || series.plot}
                </p>
              )}
            </div>
          </div>

          {loading ? (
            <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-6 flex items-center justify-center gap-2.5 text-xs text-zinc-300">
              <Loader2 className="w-4 h-4 animate-spin text-sky-400" />
              <span>
                {pickLang(lang, {
                  es: 'Cargando temporadas y episodios...',
                  ca: 'Carregant temporades i episodis...',
                  en: 'Loading seasons and episodes...',
                })}
              </span>
            </div>
          ) : error ? (
            <div className="rounded-2xl bg-amber-500/[0.08] border border-amber-500/25 p-4 flex items-start gap-2.5 text-xs text-amber-200">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          ) : info && info.seasons.length > 0 ? (
            <div className="space-y-3">
              {/* Season Selector */}
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
                {info.seasons.map((season) => {
                  const active = activeSeasonGroup?.seasonNumber === season.seasonNumber;
                  return (
                    <button
                      key={`season-${season.seasonNumber}`}
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        setSelectedSeason(season.seasonNumber);
                      }}
                      className={`min-h-11 px-3.5 rounded-xl text-xs font-bold whitespace-nowrap border cursor-pointer transition-colors tabular-nums shrink-0 ${
                        active
                          ? 'bg-white text-black border-white'
                          : 'bg-white/[0.04] border-white/[0.08] text-zinc-300 hover:bg-white/[0.08]'
                      }`}
                    >
                      {season.name} ({season.episodeCount})
                    </button>
                  );
                })}
              </div>

              {/* Episodes List */}
              {activeSeasonGroup && (
                <div className="divide-y divide-white/[0.06] rounded-2xl bg-black/40 border border-white/[0.07] overflow-hidden">
                  {activeSeasonGroup.episodes.map((ep) => (
                    <div
                      key={`ep-${ep.id}-${ep.episodeNum}`}
                      className="p-3 flex items-center justify-between gap-3 hover:bg-white/[0.03] transition-colors"
                    >
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-xs font-mono font-bold text-zinc-400 tabular-nums shrink-0">
                            E{String(ep.episodeNum).padStart(2, '0')}
                          </span>
                          <p className="text-xs sm:text-sm font-semibold text-white truncate">
                            {ep.title}
                          </p>
                        </div>
                        {(ep.duration || ep.plot) && (
                          <p className="text-[11px] text-zinc-400 truncate">
                            {[ep.duration, ep.plot].filter(Boolean).join(' · ')}
                          </p>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => handlePlayEpisode(ep)}
                        className="min-h-11 px-3.5 rounded-xl bg-white/[0.1] hover:bg-white text-white hover:text-black text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shrink-0 transition-colors"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>Ver</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-zinc-400 py-3 text-center">
              {pickLang(lang, {
                es: 'Esta serie no tiene episodios disponibles en este momento.',
                ca: 'Aquesta sèrie no té episodis disponibles en aquest moment.',
                en: 'No episodes available for this series right now.',
              })}
            </p>
          )}
        </div>
      )}
    </BottomSheet>
  );
};

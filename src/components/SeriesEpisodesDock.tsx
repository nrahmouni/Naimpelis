import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Loader2, Play, Tv } from 'lucide-react';
import type {
  ActiveSeriesContext,
  AppLanguage,
  TvEpisodeItem,
  TvSeriesDetails,
} from '../types';
import { pickLang } from '../utils/i18n';
import { triggerHaptic } from '../utils/haptics';
import { PosterImage } from './ui/PosterImage';

interface SeriesEpisodesDockProps {
  seriesMeta: ActiveSeriesContext;
  lang: AppLanguage;
  preferLang: 'ES' | 'LAT' | 'VOSE' | 'EN';
  loadingItemId: string | null;
  onSelectEpisode: (
    series: TvSeriesDetails,
    episode: TvEpisodeItem,
    preferLang: 'ES' | 'LAT' | 'VOSE' | 'EN'
  ) => void;
}

const seasonDetailsCache = new Map<string, TvSeriesDetails>();

export const SeriesEpisodesDock: React.FC<SeriesEpisodesDockProps> = ({
  seriesMeta,
  lang,
  preferLang,
  loadingItemId,
  onSelectEpisode,
}) => {
  const [selectedSeason, setSelectedSeason] = useState<number>(seriesMeta.season || 1);
  const [seriesDetails, setSeriesDetails] = useState<TvSeriesDetails | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [collapsed, setCollapsed] = useState<boolean>(false);
  const railRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setSelectedSeason(seriesMeta.season || 1);
  }, [seriesMeta.tmdbId, seriesMeta.season]);

  useEffect(() => {
    if (!seriesMeta.tmdbId) return;
    const cacheKey = `${seriesMeta.tmdbId}:${selectedSeason}:${lang}`;
    const cached = seasonDetailsCache.get(cacheKey);
    if (cached) {
      setSeriesDetails(cached);
      setLoading(false);
      return;
    }

    const ctrl = new AbortController();
    setLoading(true);

    fetch(
      `/api/catalog/tv/${seriesMeta.tmdbId}?season=${selectedSeason}&lang=${lang}`,
      { signal: ctrl.signal }
    )
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (ctrl.signal.aborted) return;
        const details = data?.details as TvSeriesDetails | undefined;
        if (details && Array.isArray(details.episodes)) {
          seasonDetailsCache.set(cacheKey, details);
          setSeriesDetails(details);
        }
      })
      .catch(() => {
        // silent fallback: keep existing details if any
      })
      .finally(() => {
        if (!ctrl.signal.aborted) {
          setLoading(false);
        }
      });

    return () => ctrl.abort();
  }, [seriesMeta.tmdbId, selectedSeason, lang]);

  // Prioritize upcoming episodes (current & next) first when viewing the active season
  const orderedEpisodes = useMemo(() => {
    const eps = seriesDetails?.episodes || [];
    if (eps.length === 0) return [];
    if (selectedSeason !== seriesMeta.season) return eps;

    const upcoming = eps.filter((ep) => ep.episodeNumber >= seriesMeta.episode);
    const earlier = eps.filter((ep) => ep.episodeNumber < seriesMeta.episode);
    return [...upcoming, ...earlier];
  }, [seriesDetails, selectedSeason, seriesMeta.season, seriesMeta.episode]);

  const nextEpisodeInSeason = useMemo(() => {
    const eps = seriesDetails?.episodes || [];
    if (selectedSeason !== seriesMeta.season) return null;
    return eps.find((ep) => ep.episodeNumber === seriesMeta.episode + 1) || null;
  }, [seriesDetails, selectedSeason, seriesMeta.season, seriesMeta.episode]);

  useEffect(() => {
    railRef.current?.scrollTo({ left: 0, behavior: 'smooth' });
  }, [seriesMeta.tmdbId, seriesMeta.season, seriesMeta.episode, selectedSeason]);

  const seasons = seriesDetails?.seasons || [];

  return (
    <section
      aria-label={pickLang(lang, {
        es: 'Siguientes capítulos de la serie',
        ca: 'Següents capítols de la sèrie',
        en: 'Next episodes',
      })}
      className="rounded-2xl bg-[#111218]/95 border border-white/[0.08] overflow-hidden shadow-[0_12px_32px_rgba(0,0,0,0.45)]"
    >
      {/* Compact Header Row */}
      <div className="px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06]">
        <div className="flex items-center gap-2 min-w-0">
          <Tv className="w-4 h-4 text-[#BF94FF] shrink-0" />
          <div className="min-w-0 flex items-center gap-2">
            <h3 className="font-display font-bold text-xs sm:text-sm text-white whitespace-nowrap">
              {pickLang(lang, {
                es: 'Capítulos',
                ca: 'Capítols',
                en: 'Episodes',
              })}
              <span className="hidden sm:inline">
                {' '}
                {pickLang(lang, {
                  es: 'siguientes',
                  ca: 'següents',
                  en: 'up next',
                })}
              </span>
            </h3>
            <span className="text-[11px] font-mono tabular-nums px-2 py-0.5 rounded-lg bg-[#9146FF]/20 border border-[#9146FF]/35 text-[#E9D5FF] shrink-0">
              {seriesMeta.season}x{String(seriesMeta.episode).padStart(2, '0')}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {seasons.length > 1 && !collapsed && (
            <label className="sr-only" htmlFor="dock-season-select">
              {pickLang(lang, { es: 'Temporada', ca: 'Temporada', en: 'Season' })}
            </label>
          )}
          {seasons.length > 1 && !collapsed && (
            <select
              id="dock-season-select"
              value={selectedSeason}
              onChange={(e) => {
                triggerHaptic('light');
                setSelectedSeason(Number(e.target.value) || 1);
              }}
              className="min-h-8 px-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.1] text-xs font-semibold text-white outline-none cursor-pointer"
            >
              {seasons.map((sn) => (
                <option key={sn.seasonNumber} value={sn.seasonNumber} className="bg-[#111218]">
                  {pickLang(lang, {
                    es: `Temp. ${sn.seasonNumber}`,
                    ca: `Temp. ${sn.seasonNumber}`,
                    en: `Season ${sn.seasonNumber}`,
                  })}
                </option>
              ))}
            </select>
          )}

          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              setCollapsed((v) => !v);
            }}
            aria-label={
              collapsed
                ? pickLang(lang, {
                    es: 'Mostrar capítulos',
                    ca: 'Mostrar capítols',
                    en: 'Show episodes',
                  })
                : pickLang(lang, {
                    es: 'Ocultar capítulos',
                    ca: 'Amagar capítols',
                    en: 'Hide episodes',
                  })
            }
            className="w-8 h-8 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-zinc-300 flex items-center justify-center shrink-0 cursor-pointer"
          >
            {collapsed ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronUp className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* Horizontal Next-Episodes Strip */}
      {!collapsed && (
        <div className="p-3">
          {loading && orderedEpisodes.length === 0 ? (
            <div className="py-5 flex items-center justify-center gap-2 text-xs text-zinc-400">
              <Loader2 className="w-4 h-4 animate-spin text-[#BF94FF]" />
              <span>
                {pickLang(lang, {
                  es: 'Cargando capítulos de la temporada...',
                  ca: 'Carregant capítols de la temporada...',
                  en: 'Loading season episodes...',
                })}
              </span>
            </div>
          ) : orderedEpisodes.length === 0 ? (
            <div className="py-3 text-center text-xs text-zinc-400">
              {pickLang(lang, {
                es: 'No hay más capítulos disponibles en esta temporada.',
                ca: 'No hi ha més capítols disponibles en aquesta temporada.',
                en: 'No more episodes available in this season.',
              })}
            </div>
          ) : (
            <div
              ref={railRef}
              className="flex items-stretch gap-2.5 overflow-x-auto no-scrollbar pb-0.5"
            >
              {orderedEpisodes.map((ep) => {
                const isCurrent =
                  ep.seasonNumber === seriesMeta.season &&
                  ep.episodeNumber === seriesMeta.episode;
                const isNext =
                  ep.seasonNumber === seriesMeta.season &&
                  ep.episodeNumber === seriesMeta.episode + 1;
                const epKey = `tv-${seriesMeta.tmdbId}-${ep.seasonNumber}-${ep.episodeNumber}`;
                const isLoadingThis = loadingItemId === epKey;
                const codeLabel = `${ep.seasonNumber}x${String(ep.episodeNumber).padStart(2, '0')}`;

                return (
                  <button
                    key={ep.id || codeLabel}
                    type="button"
                    disabled={Boolean(loadingItemId) || !seriesDetails}
                    onClick={() => {
                      if (!seriesDetails) return;
                      triggerHaptic('medium');
                      onSelectEpisode(seriesDetails, ep, preferLang);
                    }}
                    aria-label={`${codeLabel} ${ep.title}`}
                    className={`w-[178px] sm:w-[205px] shrink-0 rounded-xl overflow-hidden text-left border transition-all cursor-pointer group flex flex-col ${
                      isCurrent
                        ? 'bg-[#9146FF]/18 border-[#9146FF]/60 shadow-[0_0_0_1px_rgba(145,70,255,0.28)]'
                        : isNext
                        ? 'bg-white/[0.06] border-white/25 hover:border-[#9146FF]/60'
                        : 'bg-[#171923] hover:bg-[#1E212E] border-white/[0.07] hover:border-white/20'
                    }`}
                  >
                    <div className="relative w-full aspect-video bg-[#0B0C12] overflow-hidden">
                      <PosterImage
                        src={ep.still || seriesDetails?.backdrop || seriesMeta.backdrop || seriesMeta.poster}
                        alt={`${codeLabel} ${ep.title}`}
                        aspect="video"
                        imgClassName="group-hover:scale-105 transition-transform duration-300"
                        fallbackTitle={codeLabel}
                        fallbackIcon={<Tv className="w-5 h-5 text-zinc-500" />}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-transparent pointer-events-none" />

                      <span className="absolute bottom-1.5 left-2 text-[10px] font-mono font-bold tabular-nums text-white drop-shadow">
                        {codeLabel}
                        {ep.runtime ? ` · ${ep.runtime}m` : ''}
                      </span>

                      <span
                        className={`absolute bottom-1.5 right-2 w-7 h-7 rounded-full flex items-center justify-center shadow-md transition-colors ${
                          isCurrent
                            ? 'bg-[#9146FF] text-white'
                            : 'bg-[#191B26]/90 border border-white/25 text-white group-hover:bg-[#9146FF] group-hover:border-[#9146FF]'
                        }`}
                      >
                        {isLoadingThis ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Play className="w-3 h-3 fill-current ml-0.5" />
                        )}
                      </span>
                    </div>

                    <div className="p-2 min-w-0 flex-1 flex flex-col justify-between gap-0.5">
                      <span className="font-display font-semibold text-xs text-white line-clamp-1">
                        {ep.title ||
                          `${pickLang(lang, { es: 'Capítulo', ca: 'Capítol', en: 'Episode' })} ${ep.episodeNumber}`}
                      </span>
                      <span className="text-[10px] font-semibold truncate text-zinc-400">
                        {isCurrent
                          ? pickLang(lang, {
                              es: 'Viendo ahora',
                              ca: 'Veient ara',
                              en: 'Playing now',
                            })
                          : isNext
                          ? pickLang(lang, {
                              es: 'Siguiente capítulo',
                              ca: 'Següent capítol',
                              en: 'Up next',
                            })
                          : ep.overview
                          ? ep.overview
                          : seriesMeta.seriesTitle}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
};

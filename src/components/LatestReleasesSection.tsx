import React, { useEffect, useState } from 'react';
import { Clapperboard, Film, Play, Sparkles, Star, Tv } from 'lucide-react';
import type { AppLanguage, CatalogMovie } from '../types';
import { triggerHaptic } from '../utils/haptics';

interface LatestReleasesSectionProps {
  lang: AppLanguage;
  onSelectMovie: (movie: CatalogMovie) => void;
  onSelectSeries: (series: CatalogMovie, seasonNumber: number) => void;
}

type ReleaseFilter = 'all' | 'cinema' | 'seasons';

export const LatestReleasesSection: React.FC<LatestReleasesSectionProps> = ({
  lang,
  onSelectMovie,
  onSelectSeries,
}) => {
  const [cinemaReleases, setCinemaReleases] = useState<CatalogMovie[]>([]);
  const [newSeasons, setNewSeasons] = useState<CatalogMovie[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<ReleaseFilter>('all');
  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(`/api/catalog/latest-releases?lang=${encodeURIComponent(lang)}`)
      .then((r) => r.json())
      .then((data) => {
        if (!active) return;
        if (Array.isArray(data?.cinemaReleases)) {
          setCinemaReleases(data.cinemaReleases);
        }
        if (Array.isArray(data?.newSeasons)) {
          setNewSeasons(data.newSeasons);
        }
      })
      .catch(() => {
        // Keep empty gracefully if upstream TMDB fails temporarily
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [lang]);

  if (!loading && cinemaReleases.length === 0 && newSeasons.length === 0) {
    return null;
  }

  const showSeasons = filter === 'all' || filter === 'seasons';
  const showCinema = filter === 'all' || filter === 'cinema';

  return (
    <section
      aria-label={
        lang === 'es'
          ? 'Últimos estrenos en cine y nuevas temporadas'
          : 'Latest cinema releases and new seasons'
      }
      className="pt-2 space-y-5 border-t border-white/[0.08]"
    >
      {/* Header + Clean Segmented Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-mono uppercase tracking-[0.16em] text-[#BF94FF] flex items-center gap-1.5">
            <Clapperboard className="w-3.5 h-3.5 shrink-0" />
            <span>
              {lang === 'es' ? 'Cartelera y Temporadas Recientes' : 'Cinema & New Seasons'}
            </span>
          </div>
          <h3 className="font-display font-bold text-lg sm:text-xl text-white tracking-tight mt-0.5">
            {lang === 'es'
              ? 'Últimos Estrenos en Cine y Nuevas Temporadas'
              : 'Latest Cinema Releases & New Seasons'}
          </h3>
        </div>

        <div className="inline-flex items-center p-1 rounded-2xl bg-[#121216] border border-white/[0.08] self-start sm:self-auto shrink-0">
          {(
            [
              {
                id: 'all',
                label: lang === 'es' ? 'Todo' : 'All',
              },
              {
                id: 'seasons',
                label: lang === 'es' ? 'Nuevas Temporadas' : 'New Seasons',
              },
              {
                id: 'cinema',
                label: lang === 'es' ? 'Estrenos Cine' : 'In Theaters',
              },
            ] as const
          ).map((tab) => {
            const active = filter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setFilter(tab.id);
                }}
                className={`min-h-[38px] px-3.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                  active
                    ? 'bg-[#9146FF] text-white shadow-[0_6px_18px_rgba(145,70,255,0.35)]'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Loading Skeleton */}
      {loading && (
        <div className="flex items-stretch gap-3.5 overflow-x-auto no-scrollbar pb-1">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div
              key={idx}
              className="w-[152px] sm:w-[172px] shrink-0 aspect-[2/3] rounded-2xl bg-white/[0.04] border border-white/[0.06] skeleton-shimmer"
            />
          ))}
        </div>
      )}

      {/* New TV Seasons (From T4, Jujutsu Kaisen T3, & On The Air) */}
      {!loading && showSeasons && newSeasons.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2 px-0.5">
            <h4 className="font-display font-bold text-sm sm:text-base text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#BF94FF] shrink-0" />
              <span>
                {lang === 'es'
                  ? 'Temporadas Recién Estrenadas'
                  : 'Newly Released TV Seasons'}
              </span>
            </h4>
            <span className="text-xs font-mono tabular-nums text-zinc-400">
              {newSeasons.length} {lang === 'es' ? 'series' : 'shows'}
            </span>
          </div>

          <div className="flex items-stretch gap-3.5 overflow-x-auto no-scrollbar pb-1 min-w-0">
            {newSeasons.map((show) => {
              const imgKey = `newseason-${show.id}`;
              const broken = brokenImages[imgKey];
              const targetSeason = show.seasonNumber || 1;
              return (
                <div
                  key={imgKey}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    triggerHaptic('medium');
                    onSelectSeries(show, targetSeason);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      onSelectSeries(show, targetSeason);
                    }
                  }}
                  className="group relative w-[238px] sm:w-[276px] shrink-0 aspect-[16/9] rounded-2xl overflow-hidden nc-specular-surface border border-white/[0.1] hover:border-[#9146FF]/60 cursor-pointer transition-all duration-200 hover:-translate-y-0.5 shadow-[0_14px_34px_rgba(0,0,0,0.55)]"
                >
                  {!broken && (show.backdrop || show.poster) ? (
                    <img
                      src={show.backdrop || show.poster}
                      alt={show.title}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      onError={() => setBrokenImages((prev) => ({ ...prev, [imgKey]: true }))}
                      className="w-full h-full object-cover sm:group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full p-4 flex flex-col items-center justify-center text-center">
                      <Tv className="w-7 h-7 text-zinc-500 mb-2" />
                      <span className="text-xs font-semibold text-white line-clamp-1">
                        {show.title}
                      </span>
                    </div>
                  )}

                  <div className="absolute inset-0 bg-gradient-to-t from-black/92 via-black/35 to-black/15" />

                  <div className="absolute top-2.5 left-3 flex items-center gap-1.5 text-[11px] font-mono font-bold text-[#BF94FF] drop-shadow">
                    <span className="h-2 w-2 rounded-full bg-[#9146FF]" />
                    <span>{show.platform || (lang === 'es' ? 'Nueva Temp.' : 'New Season')}</span>
                  </div>

                  <div className="absolute bottom-3 left-3.5 right-3.5 flex items-end justify-between gap-2">
                    <div className="min-w-0">
                      <h5 className="font-display font-bold text-xs sm:text-sm text-white line-clamp-1 group-hover:text-[#BF94FF] transition-colors">
                        {show.title}
                      </h5>
                      <div className="text-[11px] text-zinc-300 mt-0.5 tabular-nums">
                        {show.year || '2026'}
                        {show.seasonNumber ? ` · T${show.seasonNumber}` : ''}
                        {show.rating ? ` · ★ ${show.rating}` : ''}
                      </div>
                    </div>

                    <span className="w-8 h-8 rounded-full bg-white text-[#0E0E10] flex items-center justify-center shrink-0 shadow-md">
                      <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Latest Cinema Releases (Cartelera Actual) */}
      {!loading && showCinema && cinemaReleases.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2 px-0.5">
            <h4 className="font-display font-bold text-sm sm:text-base text-white flex items-center gap-2">
              <Film className="w-4 h-4 text-[#BF94FF] shrink-0" />
              <span>
                {lang === 'es'
                  ? 'Últimos Estrenos en Cines'
                  : 'Latest Cinema Releases'}
              </span>
            </h4>
            <span className="text-xs font-mono tabular-nums text-zinc-400">
              {cinemaReleases.length} {lang === 'es' ? 'estrenos' : 'titles'}
            </span>
          </div>

          <div className="flex items-stretch gap-3.5 overflow-x-auto no-scrollbar pb-1 min-w-0">
            {cinemaReleases.map((movie) => {
              const imgKey = `cinema-${movie.id}`;
              const broken = brokenImages[imgKey];
              return (
                <div
                  key={imgKey}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    triggerHaptic('light');
                    onSelectMovie({ ...movie, mediaType: 'movie' });
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      onSelectMovie({ ...movie, mediaType: 'movie' });
                    }
                  }}
                  className="group flex flex-col gap-2 w-[144px] sm:w-[164px] shrink-0 cursor-pointer"
                >
                  <div className="nc-card-sheen relative aspect-[2/3] w-full rounded-2xl overflow-hidden bg-[#121218] border border-white/[0.09] hover:border-[#9146FF]/55 transition-all duration-200 hover:-translate-y-0.5 shadow-[0_12px_28px_rgba(0,0,0,0.55)]">
                    {!broken && movie.poster ? (
                      <img
                        src={movie.poster}
                        alt={movie.title}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        onError={() => setBrokenImages((prev) => ({ ...prev, [imgKey]: true }))}
                        className="w-full h-full object-cover sm:group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full p-3 flex flex-col items-center justify-center text-center">
                        <Film className="w-6 h-6 text-zinc-500 mb-2" />
                        <span className="text-xs font-semibold text-white line-clamp-2">
                          {movie.title}
                        </span>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent" />
                    <span className="absolute bottom-2 right-2 text-[11px] font-mono font-semibold text-amber-300 flex items-center gap-0.5 tabular-nums">
                      <Star className="w-3 h-3 fill-current" />
                      {movie.rating || '7.5'}
                    </span>
                  </div>

                  <div className="px-0.5">
                    <h5 className="font-display font-semibold text-xs text-white line-clamp-1 group-hover:text-[#BF94FF] transition-colors">
                      {movie.title}
                    </h5>
                    <p className="text-[11px] text-zinc-400 tabular-nums">
                      {movie.year || 'HD'} · {lang === 'es' ? 'Cine' : 'Cinema'}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
};

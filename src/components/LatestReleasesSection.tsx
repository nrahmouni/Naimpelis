import React, { useEffect } from 'react';
import { Tv } from 'lucide-react';
import type { AppLanguage, CatalogMovie } from '../types';
import { pickLang } from '../utils/i18n';
import { prefetchImageUrls } from '../utils/imageUrl';
import { useLatestReleasesQuery } from '../hooks/useCatalogQueries';
import { CinePosterCard } from './catalog/CinePosterCard';

interface LatestReleasesSectionProps {
  lang: AppLanguage;
  mediaTypeFilter?: 'all' | 'movie' | 'tv';
  isBookmarked?: (item: CatalogMovie) => boolean;
  onToggleBookmark?: (item: CatalogMovie, e: React.MouseEvent) => void;
  onSelectMovie: (movie: CatalogMovie) => void;
  onSelectSeries: (series: CatalogMovie, seasonNumber: number) => void;
}

export const LatestReleasesSection: React.FC<LatestReleasesSectionProps> = ({
  lang,
  mediaTypeFilter = 'all',
  isBookmarked,
  onToggleBookmark,
  onSelectMovie,
  onSelectSeries,
}) => {
  const { data, isLoading } = useLatestReleasesQuery(lang, true);
  const cinemaReleases = data?.cinemaReleases ?? [];
  const newSeasons = data?.newSeasons ?? [];
  const loading = isLoading && cinemaReleases.length === 0 && newSeasons.length === 0;

  useEffect(() => {
    const primaryList = mediaTypeFilter === 'tv' ? newSeasons : cinemaReleases;
    const secondaryList = mediaTypeFilter === 'tv' ? cinemaReleases : newSeasons;
    if (primaryList.length === 0 && secondaryList.length === 0) return;
    prefetchImageUrls(
      [...primaryList.slice(0, 12), ...secondaryList.slice(0, 4)].map(
        (m) => m.poster || m.backdrop
      ),
      { limit: 16, kind: 'poster' }
    );
  }, [mediaTypeFilter, cinemaReleases, newSeasons]);

  if (!loading && cinemaReleases.length === 0 && newSeasons.length === 0) {
    return null;
  }

  const showSeasons = mediaTypeFilter === 'all' || mediaTypeFilter === 'tv';
  const showCinema = mediaTypeFilter === 'all' || mediaTypeFilter === 'movie';

  return (
    <section
      aria-label={pickLang(lang, {
        es: 'Nuevas temporadas y estrenos en cine',
        ca: 'Noves temporades i estrenes al cinema',
        en: 'New seasons and cinema releases',
      })}
      className="space-y-8"
    >
      {loading && (
        <div className="flex items-stretch gap-3 overflow-x-auto no-scrollbar pb-1">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div
              key={idx}
              className="w-[136px] sm:w-[164px] shrink-0 aspect-[2/3] rounded-2xl bg-white/[0.04] skeleton-shimmer"
            />
          ))}
        </div>
      )}

      {!loading && showSeasons && newSeasons.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-baseline justify-between gap-2 px-0.5">
            <h3 className="font-display font-bold text-base sm:text-lg text-white tracking-tight">
              {pickLang(lang, {
                es: 'Nuevas temporadas',
                ca: 'Noves temporades',
                en: 'New seasons',
              })}
            </h3>
            <span className="text-[11px] text-zinc-500 tabular-nums shrink-0">
              {newSeasons.length} {pickLang(lang, { es: 'títulos', ca: 'títols', en: 'titles' })}
            </span>
          </div>

          <div className="scroll-snap-x flex items-stretch gap-3 sm:gap-4 overflow-x-auto no-scrollbar pb-1 min-w-0">
            {newSeasons.map((show, idx) => {
              const targetSeason = show.seasonNumber || 1;
              return (
                <CinePosterCard
                  key={`newseason-${show.id}`}
                  item={show}
                  forcedKind="tv"
                  priority={idx < 4}
                  subtitleOverride={show.seasonNumber ? `T${show.seasonNumber}` : show.year || '2026'}
                  fallbackIcon={<Tv className="w-5 h-5 text-zinc-400" />}
                  isBookmarked={isBookmarked?.(show)}
                  onToggleBookmark={onToggleBookmark}
                  onSelect={() => onSelectSeries(show, targetSeason)}
                  className="scroll-snap-item w-[136px] sm:w-[162px] shrink-0"
                />
              );
            })}
          </div>
        </div>
      )}

      {!loading && showCinema && cinemaReleases.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-baseline justify-between gap-2 px-0.5">
            <h3 className="font-display font-bold text-base sm:text-lg text-white tracking-tight">
              {pickLang(lang, {
                es: 'Estrenos recientes',
                ca: 'Estrenes recents',
                en: 'Latest releases',
              })}
            </h3>
            <span className="text-[11px] text-zinc-500 tabular-nums shrink-0">
              {cinemaReleases.length} {pickLang(lang, { es: 'títulos', ca: 'títols', en: 'titles' })}
            </span>
          </div>

          <div className="scroll-snap-x flex items-stretch gap-3 sm:gap-4 overflow-x-auto no-scrollbar pb-1 min-w-0">
            {cinemaReleases.map((movie, idx) => (
              <CinePosterCard
                key={`cinema-${movie.id}`}
                item={movie}
                forcedKind="movie"
                priority={idx < 4}
                isBookmarked={isBookmarked?.(movie)}
                onToggleBookmark={onToggleBookmark}
                onSelect={(m) => onSelectMovie(m)}
                className="scroll-snap-item w-[136px] sm:w-[162px] shrink-0"
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
};


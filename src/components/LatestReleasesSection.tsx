import React, { useEffect, useState } from 'react';
import { Tv } from 'lucide-react';
import type { AppLanguage, CatalogMovie } from '../types';
import { triggerHaptic } from '../utils/haptics';
import { pickLang } from '../utils/i18n';
import { PosterImage } from './ui/PosterImage';

interface LatestReleasesSectionProps {
  lang: AppLanguage;
  mediaTypeFilter?: 'all' | 'movie' | 'tv';
  onSelectMovie: (movie: CatalogMovie) => void;
  onSelectSeries: (series: CatalogMovie, seasonNumber: number) => void;
}

export const LatestReleasesSection: React.FC<LatestReleasesSectionProps> = ({
  lang,
  mediaTypeFilter = 'all',
  onSelectMovie,
  onSelectSeries,
}) => {
  const [cinemaReleases, setCinemaReleases] = useState<CatalogMovie[]>([]);
  const [newSeasons, setNewSeasons] = useState<CatalogMovie[]>([]);
  const [loading, setLoading] = useState(true);

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

      {/* New TV Seasons */}
      {!loading && showSeasons && newSeasons.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-display font-bold text-base sm:text-lg text-white tracking-tight px-0.5">
            {pickLang(lang, {
              es: 'Nuevas temporadas',
              ca: 'Noves temporades',
              en: 'New seasons',
            })}
          </h3>

          <div className="flex items-stretch gap-3 sm:gap-4 overflow-x-auto no-scrollbar pb-1 min-w-0">
            {newSeasons.map((show) => {
              const targetSeason = show.seasonNumber || 1;
              return (
                <button
                  key={`newseason-${show.id}`}
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    onSelectSeries(show, targetSeason);
                  }}
                  className="group w-[136px] sm:w-[164px] shrink-0 text-left flex flex-col gap-2 cursor-pointer"
                >
                  <div className="aspect-[2/3] w-full rounded-2xl overflow-hidden bg-[#141418] border border-white/[0.08] group-hover:border-[#9146FF]/60 transition-colors">
                    <PosterImage
                      src={show.poster || show.backdrop}
                      alt={show.title}
                      aspect="none"
                      className="w-full h-full"
                      imgClassName="object-cover"
                      fallbackTitle={show.title}
                      fallbackIcon={<Tv className="w-5 h-5 text-zinc-400" />}
                    />
                  </div>
                  <div className="px-0.5 space-y-0.5">
                    <h4 className="font-display font-semibold text-xs text-white leading-snug line-clamp-2">
                      {show.title}
                    </h4>
                    <p className="text-[11px] text-zinc-400 tabular-nums">
                      {show.seasonNumber ? `T${show.seasonNumber}` : show.year || '2026'}
                      {show.rating ? ` · ★ ${show.rating}` : ''}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Latest Cinema Releases */}
      {!loading && showCinema && cinemaReleases.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-display font-bold text-base sm:text-lg text-white tracking-tight px-0.5">
            {pickLang(lang, {
              es: 'Estrenos recientes',
              ca: 'Estrenes recents',
              en: 'Latest releases',
            })}
          </h3>

          <div className="flex items-stretch gap-3 sm:gap-4 overflow-x-auto no-scrollbar pb-1 min-w-0">
            {cinemaReleases.map((movie) => (
              <button
                key={`cinema-${movie.id}`}
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  onSelectMovie({ ...movie, mediaType: 'movie' });
                }}
                className="group w-[136px] sm:w-[164px] shrink-0 text-left flex flex-col gap-2 cursor-pointer"
              >
                <div className="aspect-[2/3] w-full rounded-2xl overflow-hidden bg-[#141418] border border-white/[0.08] group-hover:border-[#9146FF]/60 transition-colors">
                  <PosterImage
                    src={movie.poster}
                    alt={movie.title}
                    aspect="none"
                    className="w-full h-full"
                    imgClassName="object-cover"
                    fallbackTitle={movie.title}
                  />
                </div>
                <div className="px-0.5 space-y-0.5">
                  <h4 className="font-display font-semibold text-xs text-white leading-snug line-clamp-2">
                    {movie.title}
                  </h4>
                  <p className="text-[11px] text-zinc-400 tabular-nums">
                    {movie.year || 'HD'}
                    {movie.rating ? ` · ★ ${movie.rating}` : ''}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};

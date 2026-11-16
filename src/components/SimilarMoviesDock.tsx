import React, { useEffect, useState } from 'react';
import { Film, Play, Sparkles } from 'lucide-react';
import type { AppLanguage, CatalogMovie } from '../types';
import { pickLang } from '../utils/i18n';
import { triggerHaptic } from '../utils/haptics';
import { PosterImage } from './ui/PosterImage';

interface SimilarMoviesDockProps {
  tmdbId?: number;
  movieTitle: string;
  lang: AppLanguage;
  catalogMovies: CatalogMovie[];
  onPlayMovie: (movie: CatalogMovie) => void;
}

export const SimilarMoviesDock: React.FC<SimilarMoviesDockProps> = ({
  tmdbId,
  movieTitle,
  lang,
  catalogMovies,
  onPlayMovie,
}) => {
  const [similarItems, setSimilarItems] = useState<CatalogMovie[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    if (tmdbId && tmdbId > 0) {
      fetch(`/api/catalog/details/movie/${tmdbId}?lang=${lang}&title=${encodeURIComponent(movieTitle)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (cancelled) return;
          if (Array.isArray(data?.details?.similar) && data.details.similar.length > 0) {
            setSimilarItems(data.details.similar.slice(0, 10));
          } else {
            // Fallback from catalog pool (excluding current movie)
            const fallback = catalogMovies
              .filter((m) => m.tmdbId !== tmdbId && m.title.toLowerCase() !== movieTitle.toLowerCase())
              .slice(0, 8);
            setSimilarItems(fallback);
          }
        })
        .catch(() => {
          if (cancelled) return;
          const fallback = catalogMovies
            .filter((m) => m.tmdbId !== tmdbId && m.title.toLowerCase() !== movieTitle.toLowerCase())
            .slice(0, 8);
          setSimilarItems(fallback);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    } else {
      // Fallback from loaded catalog
      const fallback = catalogMovies
        .filter((m) => m.title.toLowerCase() !== movieTitle.toLowerCase())
        .slice(0, 8);
      setSimilarItems(fallback);
      setLoading(false);
    }

    return () => {
      cancelled = true;
    };
  }, [tmdbId, movieTitle, lang, catalogMovies]);

  if (!loading && similarItems.length === 0) {
    return null;
  }

  return (
    <section className="w-full max-w-6xl mx-auto px-3 sm:px-5 pt-3 pb-8 space-y-3">
      <div className="flex items-center justify-between gap-2 border-b border-white/[0.08] pb-2">
        <div className="flex items-center gap-2">
          <Film className="w-4 h-4 text-[#BF94FF]" />
          <h2 className="font-display font-bold text-sm sm:text-base text-white">
            {pickLang(lang, {
              es: 'Películas similares',
              ca: 'Pel·lícules similars',
              en: 'Similar Movies',
            })}
          </h2>
        </div>
        <span className="text-[11px] text-zinc-400 font-medium truncate">
          {pickLang(lang, {
            es: 'Basado en lo que estás viendo',
            ca: 'Basat en el que estàs veient',
            en: 'Based on what you are watching',
          })}
        </span>
      </div>

      {loading && similarItems.length === 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-3 py-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="aspect-[2/3] rounded-2xl bg-white/[0.04] animate-pulse border border-white/[0.06]"
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {similarItems.map((movie) => (
            <button
              key={movie.id || movie.tmdbId}
              type="button"
              onClick={() => {
                triggerHaptic('light');
                onPlayMovie(movie);
              }}
              className="group text-left rounded-2xl overflow-hidden bg-[#161822] hover:bg-[#1E2130] border border-white/[0.08] hover:border-[#9146FF]/60 transition-all duration-200 cursor-pointer flex flex-col active:scale-[0.98] shadow-md"
            >
              <div className="relative aspect-[2/3] w-full bg-[#0E1017] overflow-hidden">
                <PosterImage
                  src={movie.poster}
                  alt={movie.title}
                  aspect="poster"
                  className="w-full h-full"
                  imgClassName="object-cover group-hover:scale-105 transition-transform duration-300"
                  fallbackTitle={movie.title}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-80 group-hover:opacity-95 transition-opacity" />
                <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="w-10 h-10 rounded-full bg-[#9146FF] text-white flex items-center justify-center shadow-lg shadow-[#9146FF]/40">
                    <Play className="w-4 h-4 fill-current ml-0.5" />
                  </span>
                </span>
                {movie.rating && (
                  <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded-md bg-black/75 backdrop-blur-sm text-[10px] font-mono font-bold text-amber-300 tabular-nums">
                    ★ {movie.rating}
                  </span>
                )}
              </div>
              <div className="p-2.5 space-y-0.5 min-w-0">
                <div className="text-xs font-bold text-white truncate group-hover:text-[#D8B4FE] transition-colors">
                  {movie.title}
                </div>
                <div className="text-[11px] text-zinc-400 flex items-center gap-1.5">
                  <span className="tabular-nums">{movie.year || 'HD'}</span>
                  {movie.languages && movie.languages.length > 0 && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="text-[10px] text-[#BF94FF] font-semibold">
                        {movie.languages[0]}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
};

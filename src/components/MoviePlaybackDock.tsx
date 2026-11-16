import React, { useEffect, useState } from 'react';
import { Film, Loader2, Play, Sparkles, Star, Users, ChevronDown, ChevronUp } from 'lucide-react';
import type { AppLanguage, CatalogMovie, MediaRichDetails } from '../types';
import { pickLang } from '../utils/i18n';
import { triggerHaptic } from '../utils/haptics';
import { PosterImage } from './ui/PosterImage';
import { LanguageBadge } from './ui/LanguageBadge';

export interface ActiveMovieContext {
  tmdbId?: number;
  title: string;
  year?: string;
  poster?: string;
  backdrop?: string;
  overview?: string;
  preferLang?: 'ES' | 'LAT' | 'VOSE' | 'EN';
}

interface MoviePlaybackDockProps {
  movie: ActiveMovieContext;
  lang: AppLanguage;
  preferLang: 'ES' | 'LAT' | 'VOSE' | 'EN';
  loadingItemId?: string | null;
  onSelectMovie: (movie: CatalogMovie, preferLang: 'ES' | 'LAT' | 'VOSE' | 'EN') => void;
}

export const MoviePlaybackDock: React.FC<MoviePlaybackDockProps> = ({
  movie,
  lang,
  preferLang,
  loadingItemId,
  onSelectMovie,
}) => {
  const [details, setDetails] = useState<MediaRichDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [synopsisExpanded, setSynopsisExpanded] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const cleanTitle = (movie.title || '').trim();
    if (!movie.tmdbId && !cleanTitle) {
      setDetails(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setSynopsisExpanded(false);

    const idSegment = movie.tmdbId || 0;
    fetch(
      `/api/catalog/details/movie/${idSegment}?lang=${lang}&title=${encodeURIComponent(cleanTitle)}`
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data?.success && data?.details) {
          setDetails(data.details as MediaRichDetails);
        } else if (!cancelled) {
          setDetails(null);
        }
      })
      .catch(() => {
        if (!cancelled) setDetails(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [movie.tmdbId, movie.title, lang]);

  const title = details?.title || movie.title;
  const poster = details?.poster || movie.poster;
  const overview = details?.overview || movie.overview;
  const year = details?.year || movie.year;
  const rating = details?.rating;
  const runtime = details?.runtimeText;
  const genres = details?.genres || [];
  const cast = details?.cast || [];
  const similarMovies = (details?.similar || []).filter((item) => item.title && item.title !== title);

  return (
    <section
      aria-label={pickLang(lang, {
        es: 'Ficha de la película y sugerencias',
        ca: 'Fitxa de la pel·lícula i suggeriments',
        en: 'Movie details & suggestions',
      })}
      className="rounded-2xl bg-[#111218]/95 border border-white/[0.08] overflow-hidden shadow-[0_14px_38px_rgba(0,0,0,0.5)]"
    >
      {/* Header */}
      <div className="px-3.5 py-2.5 flex items-center justify-between gap-2 border-b border-white/[0.06]">
        <div className="flex items-center gap-2 min-w-0">
          <Film className="w-4 h-4 text-[#BF94FF] shrink-0" />
          <h3 className="font-display font-bold text-xs sm:text-sm text-white truncate">
            {pickLang(lang, {
              es: 'Ficha y similares',
              ca: 'Fitxa i similars',
              en: 'Movie Info & Similar',
            })}
          </h3>
          {loading && <Loader2 className="w-3.5 h-3.5 text-[#9146FF] animate-spin shrink-0" />}
        </div>

        <button
          type="button"
          onClick={() => {
            triggerHaptic('light');
            setCollapsed((v) => !v);
          }}
          aria-label={
            collapsed
              ? pickLang(lang, { es: 'Mostrar ficha', ca: 'Mostrar fitxa', en: 'Show info' })
              : pickLang(lang, { es: 'Ocultar ficha', ca: 'Amagar fitxa', en: 'Hide info' })
          }
          className="w-8 h-8 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-zinc-300 flex items-center justify-center shrink-0 cursor-pointer"
        >
          {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </button>
      </div>

      {!collapsed && (
        <div className="p-3.5 sm:p-4 space-y-5">
          {/* Movie Sheet */}
          <div className="flex gap-3.5 sm:gap-4 items-start">
            <div className="w-20 sm:w-24 shrink-0 rounded-xl overflow-hidden border border-white/10 bg-[#0B0C12] shadow-md">
              <PosterImage
                src={poster}
                alt={title}
                aspect="poster"
                fallbackTitle={title}
              />
            </div>

            <div className="min-w-0 flex-1 space-y-2">
              <div className="space-y-1">
                <h2 className="font-display font-extrabold text-base sm:text-lg text-white leading-snug">
                  {title}
                </h2>
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-zinc-300">
                  {rating && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[#9146FF]/20 border border-[#9146FF]/40 text-[#E9D5FF] font-mono font-bold tabular-nums">
                      <Star className="w-3 h-3 fill-current text-amber-300" />
                      {rating}
                    </span>
                  )}
                  {year && (
                    <span className="px-2 py-0.5 rounded-lg bg-white/[0.06] text-zinc-200 font-semibold tabular-nums">
                      {year}
                    </span>
                  )}
                  {runtime ? (
                    <span className="px-2 py-0.5 rounded-lg bg-white/[0.06] text-zinc-300 tabular-nums">
                      {runtime}
                    </span>
                  ) : null}
                  <LanguageBadge code={preferLang} size="xs" />
                </div>
              </div>

              {genres.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {genres.slice(0, 4).map((g) => (
                    <span
                      key={g}
                      className="px-2 py-0.5 rounded-lg bg-white/[0.04] border border-white/[0.07] text-[11px] font-medium text-zinc-300"
                    >
                      {g}
                    </span>
                  ))}
                </div>
              )}

              {overview && (
                <div className="space-y-1">
                  <p
                    className={`text-xs sm:text-sm text-zinc-300 leading-relaxed ${
                      synopsisExpanded ? '' : 'line-clamp-3'
                    }`}
                  >
                    {overview}
                  </p>
                  {overview.length > 150 && (
                    <button
                      type="button"
                      onClick={() => setSynopsisExpanded((v) => !v)}
                      className="text-[11px] font-bold text-[#BF94FF] hover:text-white cursor-pointer"
                    >
                      {synopsisExpanded
                        ? pickLang(lang, { es: 'Ver menos', ca: 'Veure menys', en: 'Show less' })
                        : pickLang(lang, { es: 'Leer más', ca: 'Llegir més', en: 'Read more' })}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Cast Strip */}
          {cast.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-zinc-400 uppercase tracking-wider">
                <Users className="w-3.5 h-3.5 text-[#BF94FF]" />
                <span>{pickLang(lang, { es: 'Reparto', ca: 'Repartiment', en: 'Cast' })}</span>
              </div>
              <div className="flex items-stretch gap-2 overflow-x-auto no-scrollbar pb-0.5">
                {cast.slice(0, 10).map((actor) => (
                  <div
                    key={`${actor.name}-${actor.character || ''}`}
                    className="w-[104px] shrink-0 p-2 rounded-xl bg-white/[0.03] border border-white/[0.06] flex flex-col items-center text-center gap-1.5"
                  >
                    <div className="w-11 h-11 rounded-full overflow-hidden bg-[#1B1D29] border border-white/15 shrink-0 flex items-center justify-center text-xs font-bold text-zinc-300">
                      {actor.photo ? (
                        <img
                          src={actor.photo}
                          alt={actor.name}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        actor.name.slice(0, 2).toUpperCase()
                      )}
                    </div>
                    <p className="text-[11px] font-bold text-white line-clamp-1 w-full">
                      {actor.name}
                    </p>
                    {actor.character && (
                      <p className="text-[10px] text-zinc-400 line-clamp-1 w-full">
                        {actor.character}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Similar / Suggested Movies */}
          {similarMovies.length > 0 && (
            <div className="space-y-2.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-[#D8B4FE]">
                <Sparkles className="w-3.5 h-3.5 text-[#9146FF]" />
                <span>
                  {pickLang(lang, {
                    es: 'Películas similares sugeridas',
                    ca: 'Pel·lícules similars suggerides',
                    en: 'Similar & Suggested Movies',
                  })}
                </span>
              </div>

              <div className="flex items-stretch gap-2.5 overflow-x-auto no-scrollbar pb-1">
                {similarMovies.slice(0, 12).map((sim) => {
                  const isLoadingThis = loadingItemId === sim.id;
                  return (
                    <button
                      key={sim.id || sim.tmdbId || sim.title}
                      type="button"
                      disabled={Boolean(loadingItemId)}
                      onClick={() => {
                        triggerHaptic('medium');
                        onSelectMovie(sim, preferLang);
                      }}
                      className="group w-[124px] sm:w-[138px] shrink-0 rounded-xl bg-[#161822] hover:bg-[#1E2130] border border-white/[0.08] hover:border-[#9146FF]/60 overflow-hidden text-left cursor-pointer transition-all active:scale-[0.97] flex flex-col"
                    >
                      <div className="relative aspect-[2/3] w-full bg-[#0A0B10] overflow-hidden">
                        <PosterImage
                          src={sim.poster}
                          alt={sim.title}
                          aspect="poster"
                          fallbackTitle={sim.title}
                          imgClassName="object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                        {sim.rating && (
                          <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-md bg-black/75 text-[10px] font-mono font-bold text-amber-300 tabular-nums">
                            ★ {sim.rating}
                          </span>
                        )}
                        <span className="absolute bottom-1.5 right-1.5 w-7 h-7 rounded-full bg-[#9146FF] text-white flex items-center justify-center shadow-md opacity-95 group-hover:scale-105 transition-transform">
                          {isLoadingThis ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Play className="w-3 h-3 fill-current ml-0.5" />
                          )}
                        </span>
                      </div>
                      <div className="p-2 min-w-0">
                        <p className="text-xs font-bold text-white line-clamp-1 group-hover:text-[#D8B4FE]">
                          {sim.title}
                        </p>
                        <p className="text-[10px] text-zinc-400 tabular-nums mt-0.5">
                          {sim.year || 'HD'}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
};

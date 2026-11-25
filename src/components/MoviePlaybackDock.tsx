import React, { useEffect, useState } from 'react';
import {
  Film,
  Loader2,
  Play,
  Sparkles,
  Users,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Search,
} from 'lucide-react';
import type { AppLanguage, CatalogMovie, MediaRichDetails } from '../types';
import { pickLang } from '../utils/i18n';
import { triggerHaptic } from '../utils/haptics';
import { PosterImage } from './ui/PosterImage';
import { LanguageBadge, type UnifiedLanguageCode } from './ui/LanguageBadge';
import { studioFetch } from '../utils/studioApi';

export interface ActiveMovieContext {
  tmdbId?: number;
  title: string;
  year?: string;
  poster?: string;
  backdrop?: string;
  overview?: string;
  preferLang?: UnifiedLanguageCode;
}

interface MoviePlaybackDockProps {
  movie: ActiveMovieContext;
  lang: AppLanguage;
  preferLang: UnifiedLanguageCode;
  loadingItemId?: string | null;
  onSelectMovie: (movie: CatalogMovie, preferLang: UnifiedLanguageCode) => void;
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
  const [aiQuery, setAiQuery] = useState('');
  const [aiAnswer, setAiAnswer] = useState<string | null>(null);
  const [aiSources, setAiSources] = useState<Array<{ title: string; uri: string }>>([]);
  const [aiBusy, setAiBusy] = useState(false);

  useEffect(() => {
    setAiAnswer((prev) => (prev === null ? prev : null));
    setAiSources((prev) => (prev.length === 0 ? prev : []));
    setAiQuery((prev) => (prev === '' ? prev : ''));
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

  const askMovieAi = async (question: string) => {
    const q = question.trim();
    if (!q || aiBusy) return;
    setAiBusy(true);
    try {
      const data = await studioFetch<{
        ok: boolean;
        reply: string;
        sources?: Array<{ kind: 'web' | 'maps'; title: string; uri: string }>;
      }>('/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify({
          model: 'gemini-4-hydrogen',
          grounding: 'search',
          lang,
          messages: [
            {
              role: 'user',
              text: `Sobre la película "${title}"${year ? ` (${year})` : ''}: ${q}. Responde breve y directo (sin spoilers graves salvo que te lo pida).`,
            },
          ],
        }),
      });
      setAiAnswer(data.reply);
      setAiSources(
        Array.isArray(data.sources)
          ? data.sources.slice(0, 4).map((s) => ({ title: s.title, uri: s.uri }))
          : []
      );
    } catch {
      const castNames = cast.slice(0, 4).map((c) => c.name).filter(Boolean).join(', ');
      const genreNames = genres.slice(0, 3).join(', ');
      const metaParts = [
        year ? `${year}` : '',
        runtime || '',
        rating ? `★ ${rating}` : '',
        genreNames,
      ].filter(Boolean);
      const localReply = [
        `${title}${metaParts.length ? ` (${metaParts.join(' · ')})` : ''}`,
        overview ? overview : '',
        castNames ? `${pickLang(lang, { es: 'Reparto principal', ca: 'Repartiment principal', en: 'Main cast' })}: ${castNames}` : '',
      ]
        .filter(Boolean)
        .join('\n\n');

      setAiAnswer(
        localReply ||
          pickLang(lang, {
            es: 'Consulta la ficha técnica y reparto completo justo debajo.',
            ca: 'Consulta la fitxa tècnica i el repartiment complet just a sota.',
            en: 'Full synopsis and cast details are available below.',
          })
      );
      setAiSources([]);
    } finally {
      setAiBusy(false);
    }
  };

  return (
    <section
      aria-label={pickLang(lang, {
        es: 'Ficha de la película y sugerencias',
        ca: 'Fitxa de la pel·lícula i suggeriments',
        en: 'Movie details & suggestions',
      })}
      className="rounded-3xl bg-[#0D0D12]/95 border border-white/[0.08] overflow-hidden shadow-[0_18px_48px_rgba(0,0,0,0.65),inset_0_1px_0_rgba(255,255,255,0.06)]"
    >
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between gap-2 border-b border-white/[0.08]">
        <div className="flex items-center gap-2 min-w-0">
          <Film className="w-4 h-4 text-[#A78BFA] shrink-0" />
          <h3 className="font-display font-bold text-xs sm:text-sm text-white break-words">
            {pickLang(lang, {
              es: 'Ficha y similares',
              ca: 'Fitxa i similars',
              en: 'Movie Info & Similar',
            })}
          </h3>
          {loading && <Loader2 className="w-3.5 h-3.5 text-[#8B5CF6] animate-spin shrink-0" />}
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
              <div className="space-y-1.5">
                <h2 className="font-display font-extrabold text-base sm:text-lg text-white leading-snug">
                  {title}
                </h2>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-400 tabular-nums">
                  {rating && (
                    <span className="font-mono font-bold text-[#E9D5FF]">
                      ★ {rating}
                    </span>
                  )}
                  {rating && (year || runtime) && (
                    <span className="text-zinc-600" aria-hidden="true">·</span>
                  )}
                  {year && (
                    <span className="text-zinc-200 font-semibold">
                      {year}
                    </span>
                  )}
                  {year && runtime && (
                    <span className="text-zinc-600" aria-hidden="true">·</span>
                  )}
                  {runtime ? (
                    <span className="text-zinc-300">
                      {runtime}
                    </span>
                  ) : null}
                  <span className="inline-flex items-center ml-0.5">
                    <LanguageBadge code={preferLang} size="xs" />
                  </span>
                </div>
              </div>

              {genres.length > 0 && (
                <p className="text-[11px] font-medium text-zinc-400 leading-snug">
                  {genres.slice(0, 4).join(' · ')}
                </p>
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
                    className="w-[110px] shrink-0 p-2 rounded-xl bg-[#000000]/60 border border-white/[0.08] flex flex-col items-center text-center gap-1.5"
                  >
                    <div className="w-11 h-11 rounded-full overflow-hidden bg-[#14141C] border border-white/15 shrink-0 flex items-center justify-center text-xs font-bold text-zinc-300">
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
                    <p className="text-[11px] font-bold text-white leading-snug break-words w-full">
                      {actor.name}
                    </p>
                    {actor.character && (
                      <p className="text-[10px] text-zinc-400 leading-snug break-words w-full">
                        {actor.character}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* RiffanAI In-Player Movie Copilot */}
          <div className="rounded-2xl bg-[#000000] border border-white/[0.08] p-4 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-[#A78BFA]">
                <Sparkles className="w-3.5 h-3.5 text-[#8B5CF6]" />
                <span>
                  {pickLang(lang, {
                    es: 'Asistente IA de esta película',
                    ca: 'Assistent IA d’aquesta pel·lícula',
                    en: 'Movie AI Copilot',
                  })}
                </span>
              </div>
              {aiBusy && <Loader2 className="w-3.5 h-3.5 animate-spin text-[#A78BFA]" />}
            </div>

            <div className="flex flex-wrap gap-1.5">
              {[
                pickLang(lang, {
                  es: '¿Tiene escena post-créditos?',
                  ca: 'Té escena postcrèdits?',
                  en: 'Does it have a post-credits scene?',
                }),
                pickLang(lang, {
                  es: 'Curiosidades del rodaje',
                  ca: 'Curiositats del rodatge',
                  en: 'Behind-the-scenes trivia',
                }),
                pickLang(lang, {
                  es: '¿Vale la pena y crítica?',
                  ca: 'Val la pena i crítica?',
                  en: 'Reviews & audience reception',
                }),
              ].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  disabled={aiBusy}
                  onClick={() => void askMovieAi(preset)}
                  className="min-h-9 px-3 py-1.5 rounded-xl bg-white/[0.05] hover:bg-[#7C3AED]/25 border border-white/[0.08] hover:border-[#8B5CF6]/45 text-[11px] font-semibold text-zinc-200 cursor-pointer active:scale-95 transition-all"
                >
                  {preset}
                </button>
              ))}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void askMovieAi(aiQuery);
              }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                value={aiQuery}
                onChange={(e) => setAiQuery(e.target.value)}
                placeholder={pickLang(lang, {
                  es: `Pregunta algo sobre "${title}"...`,
                  ca: `Pregunta sobre "${title}"...`,
                  en: `Ask about "${title}"...`,
                })}
                className="flex-1 min-h-10 px-3 rounded-xl bg-[#0D0D12] border border-white/[0.08] text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#7C3AED]"
              />
              <button
                type="submit"
                disabled={aiBusy || !aiQuery.trim()}
                className="min-h-10 px-3.5 rounded-xl bg-[#7C3AED] hover:bg-[#8B5CF6] disabled:opacity-45 text-white text-xs font-bold inline-flex items-center gap-1 cursor-pointer active:scale-95 transition-all"
              >
                <Search className="w-3.5 h-3.5" />
                <span>{pickLang(lang, { es: 'Buscar', ca: 'Cercar', en: 'Ask' })}</span>
              </button>
            </form>

            {aiAnswer && (
              <div className="rounded-xl bg-[#0D0D12] border border-white/[0.08] p-3 space-y-2 text-xs text-zinc-200 leading-relaxed whitespace-pre-wrap">
                <p>{aiAnswer}</p>
                {aiSources.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {aiSources.map((s, idx) => (
                      <a
                        key={idx}
                        href={s.uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2 py-1 rounded-lg bg-white/[0.05] text-[11px] text-[#A78BFA] inline-flex items-center gap-1"
                      >
                        <span className="break-words">{s.title}</span>
                        <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Similar / Suggested Movies */}
          {similarMovies.length > 0 && (
            <div className="space-y-2.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-[#A78BFA]">
                <Sparkles className="w-3.5 h-3.5 text-[#8B5CF6]" />
                <span>
                  {pickLang(lang, {
                    es: 'Películas similares sugeridas',
                    ca: 'Pel·lícules similars suggerides',
                    en: 'Similar & Suggested Movies',
                  })}
                </span>
              </div>

              <div className="flex items-stretch gap-3 overflow-x-auto no-scrollbar pb-1">
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
                      className="group w-[128px] sm:w-[140px] shrink-0 rounded-2xl bg-[#000000] hover:bg-[#14141C] border border-white/[0.08] hover:border-[#8B5CF6]/60 overflow-hidden text-left cursor-pointer transition-all active:scale-[0.97] flex flex-col"
                    >
                      <div className="relative aspect-[2/3] w-full bg-[#0D0D12] overflow-hidden">
                        <PosterImage
                          src={sim.poster}
                          alt={sim.title}
                          aspect="poster"
                          fallbackTitle={sim.title}
                          imgClassName="object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                        <span className="absolute bottom-1.5 right-1.5 w-7 h-7 rounded-full bg-[#7C3AED] text-white flex items-center justify-center shadow-md opacity-95 group-hover:scale-105 transition-transform">
                          {isLoadingThis ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Play className="w-3 h-3 fill-current ml-0.5" />
                          )}
                        </span>
                      </div>
                      <div className="p-2.5 min-w-0">
                        <p className="text-xs font-bold text-white leading-snug break-words group-hover:text-[#A78BFA]">
                          {sim.title}
                        </p>
                        <p className="text-[10px] text-zinc-400 tabular-nums mt-0.5 break-words">
                          {sim.year || 'HD'}
                          {sim.rating ? ` · ★ ${sim.rating}` : ''}
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

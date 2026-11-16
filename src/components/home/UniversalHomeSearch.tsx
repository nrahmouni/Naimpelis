import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Search,
  Sparkles,
  X,
  Play,
  Film,
  Tv,
  Trophy,
  Gamepad2,
  Users,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import type {
  AppLanguage,
  CatalogMovie,
  SpanishTdtChannel,
  SportsMatch,
} from '../../types';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import { PosterImage } from '../ui/PosterImage';

export type SearchCategoryFilter = 'all' | 'movies' | 'series' | 'sports' | 'tv' | 'games';

interface UniversalHomeSearchProps {
  lang: AppLanguage;
  movies: CatalogMovie[];
  series: CatalogMovie[];
  tdtChannels: SpanishTdtChannel[];
  liveMatches?: SportsMatch[];
  onPlayMovie: (movie: CatalogMovie) => void;
  onPlaySeries: (series: CatalogMovie) => void;
  onPlayChannel: (channel: SpanishTdtChannel) => void;
  onPlayMatch: (match: SportsMatch) => void;
  onSelectGame: (gameId: string) => void;
}

interface AiSearchJobState {
  status: 'idle' | 'searching' | 'verifying' | 'found' | 'not_found' | 'error';
  progressLabel: string;
  item: CatalogMovie | null;
  error?: string;
}

const HALLMARK_GAMES = [
  {
    id: 'billar',
    title: 'Billar 8-Ball',
    desc: 'Partidas 1v1 con físicas reales y apuestas',
    icon: '🎱',
    matchKeywords: ['billar', 'pool', '8ball', '8-ball', 'bola 8', 'billiard'],
  },
  {
    id: 'parchis',
    title: 'Parchís',
    desc: 'Clásico juego de tablero para 2 a 4 jugadores',
    icon: '🎲',
    matchKeywords: ['parchis', 'parchís', 'ludo', 'dados'],
  },
  {
    id: 'uno',
    title: 'UNO! Party',
    desc: 'Cartas de colores, saltos y +4 multijugador',
    icon: '🃏',
    matchKeywords: ['uno', 'cartas', 'card game', 'wild4'],
  },
  {
    id: 'chapas',
    title: 'Fútbol Chapas',
    desc: 'Tiros por turnos sobre tapete de fútbol',
    icon: '⚽',
    matchKeywords: ['chapas', 'futbol chapas', 'fútbol chapas', 'chapa'],
  },
  {
    id: 'pinturillo',
    title: 'Pinturillo',
    desc: 'Dibuja y adivina palabras en tiempo real',
    icon: '🎨',
    matchKeywords: ['pinturillo', 'dibujar', 'pictionary', 'skribbl', 'dibujo'],
  },
];

export const UniversalHomeSearch: React.FC<UniversalHomeSearchProps> = ({
  lang,
  movies,
  series,
  tdtChannels,
  liveMatches = [],
  onPlayMovie,
  onPlaySeries,
  onPlayChannel,
  onPlayMatch,
  onSelectGame,
}) => {
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<SearchCategoryFilter>('all');
  const [remoteMovies, setRemoteMovies] = useState<CatalogMovie[]>([]);
  const [remoteSeries, setRemoteSeries] = useState<CatalogMovie[]>([]);
  const [loadingRemote, setLoadingRemote] = useState(false);

  // AI Web Search state
  const [aiJob, setAiJob] = useState<AiSearchJobState>({
    status: 'idle',
    progressLabel: '',
    item: null,
  });

  const inputRef = useRef<HTMLInputElement | null>(null);

  const norm = (s: string) =>
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

  const cleanQuery = query.trim();
  const normQuery = norm(cleanQuery);
  const isSearchActive = cleanQuery.length > 0;

  // Remote TMDB / catalog auto-fetch on typing
  useEffect(() => {
    if (cleanQuery.length < 2) {
      setRemoteMovies([]);
      setRemoteSeries([]);
      setLoadingRemote(false);
      return;
    }

    const controller = new AbortController();
    setLoadingRemote(true);

    const timer = window.setTimeout(() => {
      let pending = 2;
      const doneOne = () => {
        pending -= 1;
        if (pending <= 0) setLoadingRemote(false);
      };

      fetch(
        `/api/catalog/movies?provider=all&category=trending&page=1&query=${encodeURIComponent(cleanQuery)}`,
        { signal: controller.signal }
      )
        .then((r) => (r.ok ? r.json() : { movies: [] }))
        .then((data) => {
          setRemoteMovies(Array.isArray(data?.movies) ? data.movies.slice(0, 8) : []);
        })
        .catch(() => setRemoteMovies([]))
        .finally(doneOne);

      fetch(
        `/api/catalog/series?provider=all&category=trending&page=1&lang=${lang === 'en' ? 'en' : 'es'}&query=${encodeURIComponent(cleanQuery)}`,
        { signal: controller.signal }
      )
        .then((r) => (r.ok ? r.json() : { series: [] }))
        .then((data) => {
          setRemoteSeries(Array.isArray(data?.series) ? data.series.slice(0, 8) : []);
        })
        .catch(() => setRemoteSeries([]))
        .finally(doneOne);
    }, 220);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [cleanQuery, lang]);

  // Execute AI Web Search directly inside the search bar
  const triggerAiWebSearch = useCallback(
    async (qToSearch: string) => {
      const q = qToSearch.trim();
      if (q.length < 2) return;

      setAiJob({
        status: 'searching',
        progressLabel: pickLang(lang, {
          es: 'Analizando con IA y buscando en fuentes web...',
          ca: 'Analitzant amb IA i cercant a fonts web...',
          en: 'AI is analyzing query and searching web sources...',
        }),
        item: null,
      });

      try {
        const res = await fetch('/api/ai/request-movie', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: q, mediaType: 'all', lang }),
        });
        const data = await res.json();
        const job = data?.job;

        if (data?.success && job) {
          if (job.status === 'found' && job.item) {
            setAiJob({
              status: 'found',
              progressLabel: pickLang(lang, {
                es: '¡Encontrado y listo para ver!',
                ca: 'Trobat i llest per veure!',
                en: 'Found and ready to stream!',
              }),
              item: job.item,
            });
            return;
          }

          // Poll job if still running
          if (job.status === 'searching_ai' || job.status === 'checking_catalog' || job.status === 'verifying_sources') {
            setAiJob((prev) => ({
              ...prev,
              status: 'verifying',
              progressLabel: job.progressLabel || pickLang(lang, {
                es: 'Verificando servidores de streaming en vivo...',
                ca: 'Verificant servidors de reproducció...',
                en: 'Verifying active streaming servers...',
              }),
            }));

            const pollTimer = window.setInterval(async () => {
              try {
                const pollRes = await fetch(`/api/ai/request-movie/${job.jobId}`);
                const pollData = await pollRes.json();
                const updatedJob = pollData?.job;
                if (updatedJob?.status === 'found' && updatedJob.item) {
                  window.clearInterval(pollTimer);
                  setAiJob({
                    status: 'found',
                    progressLabel: pickLang(lang, {
                      es: '¡Encontrado con éxito!',
                      ca: 'Trobat amb èxit!',
                      en: 'Successfully found!',
                    }),
                    item: updatedJob.item,
                  });
                } else if (updatedJob?.status === 'not_found' || updatedJob?.status === 'error') {
                  window.clearInterval(pollTimer);
                  setAiJob({
                    status: 'not_found',
                    progressLabel: pickLang(lang, {
                      es: 'No se encontraron enlaces activos para esta búsqueda.',
                      ca: 'No shan trobat enllaços actius.',
                      en: 'No active streams found for this query.',
                    }),
                    item: null,
                  });
                }
              } catch {
                window.clearInterval(pollTimer);
              }
            }, 1500);

            // Timeout poll after 20s
            window.setTimeout(() => window.clearInterval(pollTimer), 20000);
            return;
          }
        }

        setAiJob({
          status: 'not_found',
          progressLabel: pickLang(lang, {
            es: 'No encontramos coincidencia directa en la web.',
            ca: 'No hem trobat coincidència directa a la web.',
            en: 'No direct web stream found.',
          }),
          item: null,
        });
      } catch (err) {
        setAiJob({
          status: 'error',
          progressLabel: pickLang(lang, {
            es: 'Error de conexión con la IA de búsqueda.',
            ca: 'Error de connexió amb la IA de cerca.',
            en: 'Connection error with AI search.',
          }),
          item: null,
        });
      }
    },
    [lang]
  );

  // 1. Matches: Películas
  const matchedMovies = useMemo(() => {
    if (!normQuery) return [];
    const local = movies.filter((m) => {
      const t = norm(m.title);
      const ot = norm(m.originalTitle || '');
      const ov = norm(m.overview || '');
      return t.includes(normQuery) || ot.includes(normQuery) || (normQuery.length >= 4 && ov.includes(normQuery));
    });

    const map = new Map<string, CatalogMovie>();
    for (const item of [...remoteMovies, ...local]) {
      const k = item.tmdbId ? `tmdb-${item.tmdbId}` : `id-${item.id}`;
      if (!map.has(k)) map.set(k, item);
      if (map.size >= 8) break;
    }
    return Array.from(map.values());
  }, [normQuery, movies, remoteMovies]);

  // 2. Matches: Series
  const matchedSeries = useMemo(() => {
    if (!normQuery) return [];
    const local = series.filter((s) => {
      const t = norm(s.title);
      const ot = norm(s.originalTitle || '');
      const ov = norm(s.overview || '');
      return t.includes(normQuery) || ot.includes(normQuery) || (normQuery.length >= 4 && ov.includes(normQuery));
    });

    const map = new Map<string, CatalogMovie>();
    for (const item of [...remoteSeries, ...local]) {
      const k = item.tmdbId ? `tmdb-${item.tmdbId}` : `id-${item.id}`;
      if (!map.has(k)) map.set(k, item);
      if (map.size >= 8) break;
    }
    return Array.from(map.values());
  }, [normQuery, series, remoteSeries]);

  // 3. Matches: Fútbol & Deportes
  const matchedSports = useMemo(() => {
    if (!normQuery) return [];
    const isGeneralFootball = /f[uú]tbol|partido|deporte|champions|liga|directo|live/i.test(normQuery);
    return liveMatches
      .filter((m) => {
        if (isGeneralFootball) return true;
        const titleNorm = norm(m.title);
        const compNorm = norm(m.competition);
        const homeNorm = norm(m.matchMeta?.homeTeam || '');
        const awayNorm = norm(m.matchMeta?.awayTeam || '');
        return (
          titleNorm.includes(normQuery) ||
          compNorm.includes(normQuery) ||
          homeNorm.includes(normQuery) ||
          awayNorm.includes(normQuery)
        );
      })
      .slice(0, 6);
  }, [normQuery, liveMatches]);

  // 4. Matches: Canales TDT
  const matchedTdt = useMemo(() => {
    if (!normQuery) return [];
    const isGeneralTv = /^(tv|tdt|canal|canales|tele|television|televisión)$/i.test(normQuery);
    return tdtChannels
      .filter((ch) => {
        if (isGeneralTv) return true;
        const n = norm(ch.name);
        const net = norm(ch.network || '');
        const sm = norm(ch.shortMark || '');
        return n.includes(normQuery) || net.includes(normQuery) || sm.includes(normQuery);
      })
      .slice(0, 8);
  }, [normQuery, tdtChannels]);

  // 5. Matches: Juegos de Sala
  const matchedGames = useMemo(() => {
    if (!normQuery) return [];
    const isGeneralGame = /juego|juegos|game|games|partida|sala/i.test(normQuery);
    return HALLMARK_GAMES.filter((g) => {
      if (isGeneralGame) return true;
      const t = norm(g.title);
      return t.includes(normQuery) || g.matchKeywords.some((k) => normQuery.includes(norm(k)) || norm(k).includes(normQuery));
    });
  }, [normQuery]);

  // Total hits count across all categories
  const totalHits =
    matchedMovies.length +
    matchedSeries.length +
    matchedSports.length +
    matchedTdt.length +
    matchedGames.length;

  // Determine if query is natural language or descriptive intent
  const looksLikeNaturalLanguage = useMemo(() => {
    if (cleanQuery.length > 14) return true;
    const nlPatterns = [
      /\b(esa|ese|donde|cuando|peli|pelicula|película|serie|miedo|terror|risa|comedia|espacio|viaje|tiempo|asesino|policiaca|amor|romance|accion|animacion|anime)\b/i,
      /\b(algo de|quiero ver|recomienda|recomiendame|parecida a|similar a)\b/i,
    ];
    return nlPatterns.some((rgx) => rgx.test(cleanQuery));
  }, [cleanQuery]);

  const categories: { id: SearchCategoryFilter; label: string; count?: number; icon: React.ReactNode }[] = [
    {
      id: 'all',
      label: pickLang(lang, { es: 'Todo', ca: 'Tot', en: 'All' }),
      count: totalHits,
      icon: <Sparkles className="w-3.5 h-3.5" />,
    },
    {
      id: 'movies',
      label: pickLang(lang, { es: 'Películas', ca: 'Pel·lícules', en: 'Movies' }),
      count: matchedMovies.length,
      icon: <Film className="w-3.5 h-3.5" />,
    },
    {
      id: 'series',
      label: pickLang(lang, { es: 'Series', ca: 'Sèries', en: 'Series' }),
      count: matchedSeries.length,
      icon: <Tv className="w-3.5 h-3.5" />,
    },
    {
      id: 'sports',
      label: pickLang(lang, { es: 'Fútbol', ca: 'Futbol', en: 'Football' }),
      count: matchedSports.length,
      icon: <Trophy className="w-3.5 h-3.5" />,
    },
    {
      id: 'tv',
      label: pickLang(lang, { es: 'TV en Vivo', ca: 'TV en Directe', en: 'Live TV' }),
      count: matchedTdt.length,
      icon: <Tv className="w-3.5 h-3.5" />,
    },
    {
      id: 'games',
      label: pickLang(lang, { es: 'Juegos', ca: 'Jocs', en: 'Games' }),
      count: matchedGames.length,
      icon: <Gamepad2 className="w-3.5 h-3.5" />,
    },
  ];

  return (
    <div className="w-full space-y-3">
      {/* 1. Large Tactile Smart Search Bar */}
      <div className="relative group">
        <div className="relative flex items-center min-h-[52px] sm:min-h-[56px] w-full px-4 rounded-2xl bg-[#141622] hover:bg-[#181B2B] focus-within:bg-[#1A1D2E] border border-white/[0.12] focus-within:border-[#9146FF] shadow-[0_8px_24px_rgba(0,0,0,0.45)] transition-all duration-200">
          <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-[#9146FF]/20 text-[#BF94FF] mr-3 shrink-0">
            <Search className="w-4 h-4" />
          </div>

          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (aiJob.status !== 'idle') {
                setAiJob({ status: 'idle', progressLabel: '', item: null });
              }
            }}
            placeholder={pickLang(lang, {
              es: 'Busca películas, series, fútbol, TV, juegos o describe qué ver...',
              ca: 'Cerca pel·lícules, sèries, futbol, TV o descriu què veure...',
              en: 'Search movies, series, football, live TV, games or describe...',
            })}
            className="flex-1 min-w-0 bg-transparent text-sm sm:text-base font-medium text-white placeholder:text-zinc-500 focus:outline-none"
          />

          {cleanQuery && (
            <div className="flex items-center gap-1.5 ml-2 shrink-0">
              {loadingRemote && (
                <Loader2 className="w-4 h-4 text-[#9146FF] animate-spin shrink-0" />
              )}
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setQuery('');
                  setAiJob({ status: 'idle', progressLabel: '', item: null });
                  inputRef.current?.focus();
                }}
                className="w-8 h-8 rounded-xl bg-white/[0.08] hover:bg-white/[0.16] text-zinc-300 hover:text-white flex items-center justify-center cursor-pointer transition-colors"
                aria-label={pickLang(lang, { es: 'Borrar búsqueda', ca: 'Esborrar cerca', en: 'Clear search' })}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 2. Results Container & Intelligent Categories */}
      <AnimatePresence>
        {isSearchActive && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="p-3.5 sm:p-5 rounded-3xl bg-[#11131B] border border-white/[0.1] shadow-[0_20px_50px_rgba(0,0,0,0.7)] space-y-4"
          >
            {/* Filter Tabs - STRICT COLOR DISCIPLINE: Vibrant Purple #9146FF, NEVER pure white */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
              {categories.map((cat) => {
                const isActive = activeCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      setActiveCategory(cat.id);
                    }}
                    className={`min-h-[38px] px-3.5 rounded-xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-all border ${
                      isActive
                        ? 'bg-[#9146FF] text-white border-[#9146FF] shadow-[0_4px_16px_rgba(145,70,255,0.35)]'
                        : 'bg-white/[0.04] hover:bg-white/[0.09] text-zinc-300 border-white/[0.08] hover:text-white'
                    }`}
                  >
                    {cat.icon}
                    <span>{cat.label}</span>
                    {cat.count !== undefined && cat.count > 0 && (
                      <span
                        className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono tabular-nums leading-none ${
                          isActive ? 'bg-black/35 text-white' : 'bg-white/10 text-zinc-300'
                        }`}
                      >
                        {cat.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Smart Contextual AI Suggestion Card (if description / plot or no direct exact hits) */}
            {(looksLikeNaturalLanguage || totalHits === 0 || aiJob.status !== 'idle') && (
              <div className="p-3.5 rounded-2xl bg-gradient-to-r from-[#9146FF]/20 via-[#6D28D9]/15 to-[#161824] border border-[#9146FF]/40 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-[#D8B4FE] shrink-0" />
                    <span className="text-xs font-bold text-white">
                      {pickLang(lang, {
                        es: 'Búsqueda Inteligente con IA en la Web',
                        ca: 'Cerca Intel·ligent amb IA a la Web',
                        en: 'Smart AI Web Search',
                      })}
                    </span>
                  </div>

                  {aiJob.status === 'idle' && (
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('medium');
                        void triggerAiWebSearch(cleanQuery);
                      }}
                      className="min-h-[34px] px-3 rounded-xl bg-[#9146FF] hover:bg-[#7C2AE8] text-xs font-bold text-white flex items-center gap-1 cursor-pointer shadow-md shadow-[#9146FF]/30 active:scale-95 transition-all"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>
                        {pickLang(lang, {
                          es: 'Buscar con IA',
                          ca: 'Cercar amb IA',
                          en: 'Search with AI',
                        })}
                      </span>
                    </button>
                  )}
                </div>

                {/* Progress / Status feedback */}
                {aiJob.status !== 'idle' && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs text-zinc-200">
                      {aiJob.status === 'searching' || aiJob.status === 'verifying' ? (
                        <Loader2 className="w-4 h-4 text-[#9146FF] animate-spin shrink-0" />
                      ) : aiJob.status === 'found' ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                      )}
                      <span className="font-medium">{aiJob.progressLabel}</span>
                    </div>

                    {/* Found Item Card */}
                    {aiJob.status === 'found' && aiJob.item && (
                      <div className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-black/40 border border-white/10">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <PosterImage
                            src={aiJob.item.poster}
                            alt={aiJob.item.title}
                            aspect="poster"
                            className="w-11 h-16 rounded-lg overflow-hidden shrink-0"
                            fallbackTitle={aiJob.item.title}
                          />
                          <div className="min-w-0 space-y-0.5">
                            <p className="text-xs font-bold text-white truncate">
                              {aiJob.item.title}
                            </p>
                            <p className="text-[11px] text-zinc-400">
                              {aiJob.item.year || 'HD'} · ★ {aiJob.item.rating || '8.0'}
                            </p>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            triggerHaptic('success');
                            if (aiJob.item?.mediaType === 'tv') {
                              onPlaySeries(aiJob.item);
                            } else if (aiJob.item) {
                              onPlayMovie(aiJob.item);
                            }
                          }}
                          className="min-h-10 px-3.5 rounded-xl bg-[#9146FF] hover:bg-[#7C2AE8] text-xs font-bold text-white flex items-center gap-1.5 shrink-0 cursor-pointer shadow-md active:scale-95 transition-all"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>
                            {pickLang(lang, {
                              es: 'Reproducir',
                              ca: 'Reproduir',
                              en: 'Play',
                            })}
                          </span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Empty state when zero hits across anything */}
            {totalHits === 0 && aiJob.status === 'idle' && (
              <div className="py-6 text-center space-y-2">
                <p className="text-sm font-semibold text-zinc-300">
                  {pickLang(lang, {
                    es: `No hay resultados locales directos para "${cleanQuery}"`,
                    ca: `Sense resultats locals directes per "${cleanQuery}"`,
                    en: `No direct local matches for "${cleanQuery}"`,
                  })}
                </p>
                <p className="text-xs text-zinc-400">
                  {pickLang(lang, {
                    es: 'Toca "Buscar con IA" arriba para encontrarlo en fuentes web externas automáticamente.',
                    ca: 'Toca "Cercar amb IA" a dalt per trobar-ho a fonts web externes.',
                    en: 'Tap "Search with AI" above to automatically find it on external web providers.',
                  })}
                </p>
              </div>
            )}

            {/* Categorized Results */}
            <div className="space-y-4 max-h-[460px] overflow-y-auto no-scrollbar pr-1">
              {/* SECTION: FÚTBOL & DEPORTES */}
              {(activeCategory === 'all' || activeCategory === 'sports') &&
                matchedSports.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-[#00F593]">
                      <Trophy className="w-3.5 h-3.5" />
                      <span>
                        {pickLang(lang, {
                          es: 'Fútbol y Deportes en Directo',
                          ca: 'Futbol i Esports en Directe',
                          en: 'Live Football & Sports',
                        })}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {matchedSports.map((match) => (
                        <button
                          key={match.id}
                          type="button"
                          onClick={() => {
                            triggerHaptic('light');
                            onPlayMatch(match);
                          }}
                          className="flex items-center justify-between gap-2.5 p-3 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] hover:border-[#00F593]/50 text-left cursor-pointer transition-all active:scale-[0.98]"
                        >
                          <div className="min-w-0 space-y-1">
                            <div className="flex items-center gap-1.5 text-[10px] text-zinc-400 font-medium">
                              <span className="truncate">{match.competition}</span>
                              <span aria-hidden="true">·</span>
                              <span className="text-zinc-300 tabular-nums">{match.time}</span>
                            </div>
                            <p className="text-xs font-bold text-white leading-snug line-clamp-2">
                              {match.title}
                            </p>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {match.isLive && (
                              <span className="px-2 py-0.5 rounded-full bg-[#EB0400] text-white text-[10px] font-bold uppercase tracking-wider">
                                LIVE
                              </span>
                            )}
                            <span className="w-8 h-8 rounded-xl bg-white/[0.06] flex items-center justify-center text-white">
                              <Play className="w-3.5 h-3.5 fill-current" />
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

              {/* SECTION: CANALES TDT */}
              {(activeCategory === 'all' || activeCategory === 'tv') && matchedTdt.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-sky-400">
                    <Tv className="w-3.5 h-3.5" />
                    <span>
                      {pickLang(lang, {
                        es: 'Canales de TV en Directo (TDT)',
                        ca: 'Canals de TV en Directe (TDT)',
                        en: 'Live TV Channels (DTT)',
                      })}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {matchedTdt.map((ch) => (
                      <button
                        key={ch.id}
                        type="button"
                        onClick={() => {
                          triggerHaptic('light');
                          onPlayChannel(ch);
                        }}
                        className="flex items-center gap-2 p-2.5 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] hover:border-sky-400/50 text-left cursor-pointer transition-all active:scale-[0.98]"
                      >
                        <div
                          className="w-9 h-9 rounded-xl flex items-center justify-center font-display font-extrabold text-xs text-white shrink-0 shadow-sm"
                          style={{ backgroundColor: ch.brandTone || '#1E293B' }}
                        >
                          {ch.shortMark}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-white truncate">{ch.name}</p>
                          <p className="text-[10px] text-zinc-400">Dial {ch.dial}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* SECTION: JUEGOS DE SALA */}
              {(activeCategory === 'all' || activeCategory === 'games') &&
                matchedGames.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-fuchsia-400">
                      <Gamepad2 className="w-3.5 h-3.5" />
                      <span>
                        {pickLang(lang, {
                          es: 'Juegos de Sala',
                          ca: 'Jocs de Sala',
                          en: 'Room Games',
                        })}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {matchedGames.map((game) => (
                        <button
                          key={game.id}
                          type="button"
                          onClick={() => {
                            triggerHaptic('light');
                            onSelectGame(game.id);
                          }}
                          className="flex items-center justify-between gap-2.5 p-3 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] hover:border-fuchsia-400/50 text-left cursor-pointer transition-all active:scale-[0.98]"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="text-2xl shrink-0">{game.icon}</span>
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-white truncate">{game.title}</p>
                              <p className="text-[11px] text-zinc-400 truncate">{game.desc}</p>
                            </div>
                          </div>
                          <span className="px-2.5 py-1 rounded-xl bg-fuchsia-500/20 text-fuchsia-300 text-[11px] font-bold shrink-0">
                            {pickLang(lang, { es: 'Jugar', ca: 'Jugar', en: 'Play' })}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

              {/* SECTION: PELÍCULAS */}
              {(activeCategory === 'all' || activeCategory === 'movies') &&
                matchedMovies.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-[#BF94FF]">
                      <Film className="w-3.5 h-3.5" />
                      <span>
                        {pickLang(lang, {
                          es: 'Películas',
                          ca: 'Pel·lícules',
                          en: 'Movies',
                        })}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      {matchedMovies.map((movie) => (
                        <button
                          key={movie.id || movie.tmdbId}
                          type="button"
                          onClick={() => {
                            triggerHaptic('light');
                            onPlayMovie(movie);
                          }}
                          className="group rounded-2xl overflow-hidden bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] hover:border-[#9146FF]/50 text-left cursor-pointer transition-all active:scale-[0.98] flex flex-col"
                        >
                          <div className="relative aspect-[2/3] w-full bg-[#0D0E15]">
                            <PosterImage
                              src={movie.poster}
                              alt={movie.title}
                              aspect="poster"
                              className="w-full h-full"
                              imgClassName="object-cover group-hover:scale-105 transition-transform duration-200"
                              fallbackTitle={movie.title}
                            />
                            {movie.rating && (
                              <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-md bg-black/75 text-[10px] font-mono font-bold text-amber-300 tabular-nums">
                                ★ {movie.rating}
                              </span>
                            )}
                          </div>
                          <div className="p-2 min-w-0">
                            <p className="text-xs font-bold text-white truncate group-hover:text-[#D8B4FE]">
                              {movie.title}
                            </p>
                            <p className="text-[10px] text-zinc-400">
                              {movie.year || 'HD'}
                              {movie.languages && movie.languages.length > 0
                                ? ` · ${movie.languages[0]}`
                                : ''}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

              {/* SECTION: SERIES */}
              {(activeCategory === 'all' || activeCategory === 'series') &&
                matchedSeries.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-[#D8B4FE]">
                      <Tv className="w-3.5 h-3.5" />
                      <span>
                        {pickLang(lang, {
                          es: 'Series de TV',
                          ca: 'Sèries de TV',
                          en: 'TV Series',
                        })}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      {matchedSeries.map((s) => (
                        <button
                          key={s.id || s.tmdbId}
                          type="button"
                          onClick={() => {
                            triggerHaptic('light');
                            onPlaySeries(s);
                          }}
                          className="group rounded-2xl overflow-hidden bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] hover:border-[#9146FF]/50 text-left cursor-pointer transition-all active:scale-[0.98] flex flex-col"
                        >
                          <div className="relative aspect-[2/3] w-full bg-[#0D0E15]">
                            <PosterImage
                              src={s.poster}
                              alt={s.title}
                              aspect="poster"
                              className="w-full h-full"
                              imgClassName="object-cover group-hover:scale-105 transition-transform duration-200"
                              fallbackTitle={s.title}
                            />
                            {s.rating && (
                              <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-md bg-black/75 text-[10px] font-mono font-bold text-amber-300 tabular-nums">
                                ★ {s.rating}
                              </span>
                            )}
                          </div>
                          <div className="p-2 min-w-0">
                            <p className="text-xs font-bold text-white truncate group-hover:text-[#D8B4FE]">
                              {s.title}
                            </p>
                            <p className="text-[10px] text-zinc-400">
                              {s.year || 'HD'} · {pickLang(lang, { es: 'Serie', ca: 'Sèrie', en: 'Series' })}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

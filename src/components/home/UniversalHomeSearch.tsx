import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Film, Loader2, Search, Sparkles, Tv, X } from 'lucide-react';
import type {
  AppLanguage,
  CatalogMovie,
  SpanishTdtChannel,
  SportsMatch,
} from '../../types';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import { RiffanDiceIcon, RiffanFootballIcon } from '../ui/RiffanIcons';
import { SkeletonPosterGrid } from '../ui/DesignSystem';
import { mergeAndRankCatalogResults, normalizeSearchText } from '../../utils/catalogSearchRank';
import { useSuppressFloatingBubble } from '../../utils/useSuppressFloatingBubble';
import {
  HALLMARK_GAMES,
  type AiSearchJobState,
  type SearchCategoryFilter,
} from './homeSearchTypes';
import { UniversalSearchAiCard } from './UniversalSearchAiCard';
import { UniversalSearchResultsList } from './UniversalSearchResultsList';

export type { SearchCategoryFilter };

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

  const [aiJob, setAiJob] = useState<AiSearchJobState>({
    status: 'idle',
    progressLabel: '',
    item: null,
  });

  const inputRef = useRef<HTMLInputElement | null>(null);
  const lastAutoAiQueryRef = useRef<string>('');
  const aiPollRef = useRef<number | null>(null);

  const norm = normalizeSearchText;

  const cleanQuery = query.trim();
  const normQuery = norm(cleanQuery);
  const isSearchActive = cleanQuery.length > 0;

  useSuppressFloatingBubble(isSearchActive);

  const clearAiPoll = useCallback(() => {
    if (aiPollRef.current !== null) {
      window.clearInterval(aiPollRef.current);
      aiPollRef.current = null;
    }
  }, []);

  useEffect(() => () => clearAiPoll(), [clearAiPoll]);

  const closeSearchOverlay = useCallback(() => {
    clearAiPoll();
    setQuery('');
    lastAutoAiQueryRef.current = '';
    setAiJob({ status: 'idle', progressLabel: '', item: null });
  }, [clearAiPoll]);

  useEffect(() => {
    if (cleanQuery.length < 2) {
      setRemoteMovies([]);
      setRemoteSeries([]);
      setLoadingRemote(false);
      return;
    }

    const controller = new AbortController();
    let active = true;
    setLoadingRemote(true);

    const timer = window.setTimeout(() => {
      let pending = 2;
      const doneOne = () => {
        pending -= 1;
        if (active && pending <= 0) setLoadingRemote(false);
      };

      fetch(
        `/api/catalog/movies?provider=all&category=trending&page=1&query=${encodeURIComponent(cleanQuery)}`,
        { signal: controller.signal }
      )
        .then((r) => (r.ok ? r.json() : { movies: [] }))
        .then((data) => {
          if (!active) return;
          const list = Array.isArray(data?.movies)
            ? data.movies
            : Array.isArray(data?.items)
            ? data.items
            : [];
          setRemoteMovies(list.slice(0, 16));
        })
        .catch(() => {
          if (active && !controller.signal.aborted) setRemoteMovies([]);
        })
        .finally(doneOne);

      fetch(
        `/api/catalog/series?provider=all&category=trending&page=1&lang=${lang === 'en' ? 'en' : 'es'}&query=${encodeURIComponent(cleanQuery)}`,
        { signal: controller.signal }
      )
        .then((r) => (r.ok ? r.json() : { series: [] }))
        .then((data) => {
          if (!active) return;
          const list = Array.isArray(data?.series)
            ? data.series
            : Array.isArray(data?.items)
            ? data.items
            : [];
          setRemoteSeries(list.slice(0, 16));
        })
        .catch(() => {
          if (active && !controller.signal.aborted) setRemoteSeries([]);
        })
        .finally(doneOne);
    }, 200);

    return () => {
      active = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [cleanQuery, lang]);

  const triggerAiWebSearch = useCallback(
    async (qToSearch: string) => {
      const q = qToSearch.trim();
      if (q.length < 2) return;
      clearAiPoll();

      const aiMediaType =
        activeCategory === 'movies' ? 'movie' : activeCategory === 'series' ? 'tv' : 'all';

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
          body: JSON.stringify({ query: q, mediaType: aiMediaType, lang }),
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

          if (
            job.status === 'searching_ai' ||
            job.status === 'checking_catalog' ||
            job.status === 'verifying_sources'
          ) {
            setAiJob((prev) => ({
              ...prev,
              status: 'verifying',
              progressLabel:
                job.progressLabel ||
                pickLang(lang, {
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
                  clearAiPoll();
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
                  clearAiPoll();
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
                clearAiPoll();
              }
            }, 1500);
            aiPollRef.current = pollTimer;

            window.setTimeout(() => {
              if (aiPollRef.current === pollTimer) clearAiPoll();
            }, 20000);
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
      } catch {
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
    [lang, activeCategory, clearAiPoll]
  );

  const matchedMovies = useMemo(() => {
    if (!normQuery) return [];
    return mergeAndRankCatalogResults(remoteMovies, movies, cleanQuery, {
      limit: 12,
      minLocalScore: 40,
    });
  }, [normQuery, cleanQuery, movies, remoteMovies]);

  const matchedSeries = useMemo(() => {
    if (!normQuery) return [];
    return mergeAndRankCatalogResults(remoteSeries, series, cleanQuery, {
      limit: 12,
      minLocalScore: 40,
    });
  }, [normQuery, cleanQuery, series, remoteSeries]);

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

  const matchedGames = useMemo(() => {
    if (!normQuery) return [];
    const isGeneralGame = /juego|juegos|game|games|partida|sala/i.test(normQuery);
    return HALLMARK_GAMES.filter((g) => {
      if (isGeneralGame) return true;
      const t = norm(g.title);
      return t.includes(normQuery) || g.matchKeywords.some((k) => normQuery.includes(norm(k)) || norm(k).includes(normQuery));
    });
  }, [normQuery]);

  const totalHits =
    matchedMovies.length +
    matchedSeries.length +
    matchedSports.length +
    matchedTdt.length +
    matchedGames.length;

  const visibleCategoryHits = useMemo(() => {
    if (activeCategory === 'movies') return matchedMovies.length;
    if (activeCategory === 'series') return matchedSeries.length;
    if (activeCategory === 'sports') return matchedSports.length;
    if (activeCategory === 'tv') return matchedTdt.length;
    if (activeCategory === 'games') return matchedGames.length;
    return totalHits;
  }, [
    activeCategory,
    matchedMovies.length,
    matchedSeries.length,
    matchedSports.length,
    matchedTdt.length,
    matchedGames.length,
    totalHits,
  ]);

  const looksLikeNaturalLanguage = useMemo(() => {
    if (cleanQuery.length > 36) return true;
    const nlPatterns = [
      /\b(esa peli|ese capitulo|donde sale|como se llama|de miedo|de risa)\b/i,
      /\b(algo de|quiero ver|recomienda|recomiendame|parecida a|similar a)\b/i,
    ];
    return nlPatterns.some((rgx) => rgx.test(cleanQuery));
  }, [cleanQuery]);

  useEffect(() => {
    if (
      cleanQuery.length < 3 ||
      loadingRemote ||
      aiJob.status !== 'idle' ||
      matchedSports.length > 0 ||
      matchedTdt.length > 0 ||
      matchedGames.length > 0
    ) {
      return;
    }
    const shouldAutoSearchAi =
      totalHits === 0 ||
      (looksLikeNaturalLanguage && matchedMovies.length === 0 && matchedSeries.length === 0);
    if (!shouldAutoSearchAi) return;
    const normalizedKey = normQuery;
    if (lastAutoAiQueryRef.current === normalizedKey) return;

    const timer = window.setTimeout(() => {
      lastAutoAiQueryRef.current = normalizedKey;
      void triggerAiWebSearch(cleanQuery);
    }, 650);

    return () => window.clearTimeout(timer);
  }, [
    cleanQuery,
    normQuery,
    loadingRemote,
    aiJob.status,
    totalHits,
    looksLikeNaturalLanguage,
    matchedMovies.length,
    matchedSeries.length,
    matchedSports.length,
    matchedTdt.length,
    matchedGames.length,
    triggerAiWebSearch,
  ]);

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
      icon: <RiffanFootballIcon size={14} animate="hover" />,
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
      icon: <RiffanDiceIcon size={14} animate="hover" />,
    },
  ];

  return (
    <div className="w-full space-y-3">
      {/* Large Tactile Smart Search Bar */}
      <div className="relative group">
        <div className="relative flex items-center min-h-[52px] sm:min-h-[56px] w-full px-3.5 sm:px-4 rounded-2xl bg-[#10121C] hover:bg-[#131624] focus-within:bg-[#151828] border border-white/[0.09] focus-within:border-[#9146FF] shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_10px_28px_rgba(0,0,0,0.42)] transition-all duration-200">
          <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-[#9146FF]/18 border border-[#9146FF]/30 text-[#C4A7FF] mr-3 shrink-0">
            <Search className="w-4 h-4" />
          </div>

          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              clearAiPoll();
              setQuery(e.target.value);
              if (aiJob.status !== 'idle') {
                setAiJob({ status: 'idle', progressLabel: '', item: null });
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                closeSearchOverlay();
              } else if (e.key === 'Enter' && cleanQuery.length >= 2) {
                e.preventDefault();
                if (aiJob.status === 'found' && aiJob.item) {
                  const chosen = aiJob.item;
                  closeSearchOverlay();
                  if (chosen.mediaType === 'tv') onPlaySeries(chosen);
                  else onPlayMovie(chosen);
                } else if (aiJob.status === 'idle' && (totalHits === 0 || looksLikeNaturalLanguage)) {
                  lastAutoAiQueryRef.current = normQuery;
                  void triggerAiWebSearch(cleanQuery);
                }
              }
            }}
            placeholder={pickLang(lang, {
              es: 'Buscar películas, series, canales...',
              ca: 'Cercar pel·lícules, sèries, canals...',
              en: 'Search movies, series, channels...',
            })}
            className="flex-1 min-w-0 bg-transparent text-sm sm:text-[15px] font-medium text-white placeholder:text-zinc-500 focus:outline-none"
          />

          {cleanQuery ? (
            <div className="flex items-center gap-1.5 ml-2 shrink-0">
              {loadingRemote && <Loader2 className="w-4 h-4 text-[#9146FF] animate-spin shrink-0" />}
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  closeSearchOverlay();
                  inputRef.current?.focus();
                }}
                className="w-8 h-8 rounded-xl bg-white/[0.08] hover:bg-white/[0.16] text-zinc-300 hover:text-white flex items-center justify-center cursor-pointer transition-colors"
                aria-label={pickLang(lang, { es: 'Borrar búsqueda', ca: 'Esborrar cerca', en: 'Clear search' })}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <span
              className="ml-2 shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-[#9146FF]/14 border border-[#9146FF]/28 text-[10px] font-bold tracking-wide text-[#D8B4FE] pointer-events-none select-none"
              aria-hidden="true"
            >
              <Sparkles className="w-3 h-3" />
              <span>{lang === 'en' ? 'AI' : 'IA'}</span>
            </span>
          )}
        </div>
      </div>

      {/* Immersive Search Results Window Overlay */}
      <AnimatePresence>
        {isSearchActive && (
          <motion.div
            initial={{ opacity: 0, scale: 0.98, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 10 }}
            transition={{ duration: 0.16 }}
            className="fixed inset-0 z-50 bg-[#0B0D14]/96 backdrop-blur-2xl flex flex-col p-4 sm:p-8 md:p-12 overflow-y-auto"
          >
            <div className="max-w-6xl mx-auto w-full space-y-6 my-auto">
              {/* Header */}
              <div className="flex items-center gap-3">
                <div className="relative flex-1 flex items-center min-h-[58px] px-4 rounded-2xl bg-[#131622] border border-[#9146FF]/40 shadow-[0_10px_30px_rgba(145,70,255,0.25)]">
                  <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-[#9146FF]/20 text-[#C4A7FF] mr-3 shrink-0">
                    <Search className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => {
                      clearAiPoll();
                      setQuery(e.target.value);
                      if (aiJob.status !== 'idle') {
                        setAiJob({ status: 'idle', progressLabel: '', item: null });
                      }
                    }}
                    placeholder={pickLang(lang, {
                      es: 'Buscar películas, series, deportes, canales...',
                      ca: 'Cercar pel·lícules, sèries, esports, canals...',
                      en: 'Search movies, series, sports, channels...',
                    })}
                    className="flex-1 min-w-0 bg-transparent text-base font-semibold text-white placeholder:text-zinc-500 focus:outline-none"
                    autoFocus
                  />
                  {loadingRemote && (
                    <Loader2 className="w-4 h-4 text-[#9146FF] animate-spin shrink-0 mx-2" />
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      closeSearchOverlay();
                    }}
                    className="min-h-10 px-3 rounded-xl bg-white/[0.08] hover:bg-white/[0.16] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <X className="w-4 h-4" />
                    <span>{pickLang(lang, { es: 'Cerrar', ca: 'Tancar', en: 'Close' })}</span>
                  </button>
                </div>
              </div>

              {/* Filter Tabs */}
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
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
                      className={`min-h-[42px] px-4 rounded-xl text-xs font-bold flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer transition-all border ${
                        isActive
                          ? 'bg-[#9146FF] text-white border-[#9146FF] shadow-[0_4px_20px_rgba(145,70,255,0.4)]'
                          : 'bg-white/[0.04] hover:bg-white/[0.09] text-zinc-300 border-white/[0.08] hover:text-white'
                      }`}
                    >
                      {cat.icon}
                      <span>{cat.label}</span>
                      {cat.count !== undefined && cat.count > 0 && (
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-mono tabular-nums leading-none ${
                            isActive ? 'bg-black/40 text-white' : 'bg-white/10 text-zinc-300'
                          }`}
                        >
                          {cat.count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Loading Status Banner & Skeletons */}
              {loadingRemote && (
                <div className="space-y-4">
                  <div className="px-4 py-2.5 rounded-2xl bg-[#9146FF]/12 border border-[#9146FF]/30 flex items-center gap-2.5 text-xs font-semibold text-[#E9D5FF]">
                    <Loader2 className="w-4 h-4 text-[#BF94FF] animate-spin shrink-0" />
                    <span>
                      {pickLang(lang, {
                        es: `Buscando «${cleanQuery}» en todo el catálogo...`,
                        ca: `Cercant «${cleanQuery}» a tot el catàleg...`,
                        en: `Searching "${cleanQuery}" across full catalog...`,
                      })}
                    </span>
                  </div>
                  {visibleCategoryHits === 0 && <SkeletonPosterGrid count={8} />}
                </div>
              )}

              {/* Contextual AI Suggestion Card (only when finished loading or genuinely NL / requested) */}
              {((!loadingRemote && totalHits === 0) || looksLikeNaturalLanguage || aiJob.status !== 'idle') && (
                <UniversalSearchAiCard
                  lang={lang}
                  cleanQuery={cleanQuery}
                  aiJob={aiJob}
                  onTriggerAiSearch={(q) => void triggerAiWebSearch(q)}
                  onSelectFoundItem={(chosen) => {
                    closeSearchOverlay();
                    if (chosen.mediaType === 'tv') onPlaySeries(chosen);
                    else onPlayMovie(chosen);
                  }}
                />
              )}

              {!loadingRemote && visibleCategoryHits === 0 && totalHits > 0 && (
                <div className="py-6 px-4 rounded-2xl bg-white/[0.03] border border-white/[0.08] text-center space-y-3">
                  <p className="text-sm font-semibold text-zinc-200">
                    {pickLang(lang, {
                      es: `Sin coincidencias en esta pestaña, pero encontramos ${totalHits} resultados en el catálogo.`,
                      ca: `Sense coincidències en aquesta pestanya, però hem trobat ${totalHits} resultats al catàleg.`,
                      en: `No hits in this tab, but ${totalHits} results exist across the catalog.`,
                    })}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      setActiveCategory('all');
                    }}
                    className="min-h-10 px-4 rounded-xl bg-[#9146FF] hover:bg-[#7C2AE8] text-xs font-bold text-white cursor-pointer"
                  >
                    {pickLang(lang, {
                      es: `Ver todos (${totalHits})`,
                      ca: `Veure tots (${totalHits})`,
                      en: `View all (${totalHits})`,
                    })}
                  </button>
                </div>
              )}

              {!loadingRemote && totalHits === 0 && aiJob.status === 'idle' && (
                <div className="py-6 text-center space-y-2">
                  <p className="text-sm font-semibold text-zinc-300">
                    {pickLang(lang, {
                      es: `No hay resultados directos en el catálogo para "${cleanQuery}"`,
                      ca: `Sense resultats directes al catàleg per "${cleanQuery}"`,
                      en: `No direct catalog matches for "${cleanQuery}"`,
                    })}
                  </p>
                  <p className="text-xs text-zinc-400">
                    {pickLang(lang, {
                      es: 'Toca "Buscar con IA" arriba para localizarlo en fuentes externas automáticamente.',
                      ca: 'Toca "Cercar amb IA" a dalt per localitzar-ho a fonts externes.',
                      en: 'Tap "Search with AI" above to automatically locate it on external providers.',
                    })}
                  </p>
                </div>
              )}

              <UniversalSearchResultsList
                lang={lang}
                activeCategory={activeCategory}
                matchedSports={matchedSports}
                matchedTdt={matchedTdt}
                matchedGames={matchedGames}
                matchedMovies={matchedMovies}
                matchedSeries={matchedSeries}
                onCloseSearch={closeSearchOverlay}
                onPlayMatch={onPlayMatch}
                onPlayChannel={onPlayChannel}
                onSelectGame={onSelectGame}
                onPlayMovie={onPlayMovie}
                onPlaySeries={onPlaySeries}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Flame,
  Laugh,
  Trophy,
  Wand2,
  CheckCircle2,
} from 'lucide-react';
import type { AppLanguage, CatalogMovie } from '../types';
import { pickLang } from '../utils/i18n';
import { useGlobalEscape } from '../utils/useGlobalEscape';
import { BottomSheet, PrimaryButton, SecondaryButton } from './ui/DesignSystem';
import { PosterImage } from './ui/PosterImage';
import {
  RiffanChannelsIcon,
  RiffanLoaderR,
  RiffanMoviesIcon,
  RiffanPlayIcon,
  RiffanSearchIcon,
  RiffanShuffleIcon,
  RiffanSpinner,
  RiffanSurpriseIcon,
  RiffanWarningIcon,
} from './ui/RiffanIcons';

interface SurpriseMeRequestLaunch {
  query: string;
  mediaType?: 'all' | 'movie' | 'tv';
  mode?: 'surprise' | 'request';
  seq: number;
}

interface SurpriseMeModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang?: AppLanguage;
  movies: CatalogMovie[];
  series: CatalogMovie[];
  isLoading?: boolean;
  onRetryLoad?: () => void;
  onPlayItem: (item: CatalogMovie) => void;
  initialRequest?: SurpriseMeRequestLaunch | null;
}

type ModalMode = 'surprise' | 'request';
type MoodId = 'all' | 'intense' | 'chill' | 'series' | 'highrated';

interface AiMovieJobView {
  jobId: string;
  query: string;
  status:
    | 'checking_catalog'
    | 'searching_ai'
    | 'verifying_sources'
    | 'found'
    | 'not_found'
    | 'error';
  progressLabel: string;
  steps: string[];
  inCatalogAlready: boolean;
  streamReady: boolean;
  sourcesFound: string[];
  aiNote?: string;
  item: CatalogMovie | null;
  error?: string;
}

export const SurpriseMeModal: React.FC<SurpriseMeModalProps> = ({
  isOpen,
  onClose,
  lang = 'es',
  movies,
  series,
  isLoading = false,
  onRetryLoad,
  onPlayItem,
  initialRequest = null,
}) => {
  const [mode, setMode] = useState<ModalMode>('surprise');
  const [mood, setMood] = useState<MoodId>('all');
  const [rollSeed, setRollSeed] = useState<number>(() => Math.floor(Math.random() * 10000));

  useGlobalEscape(onClose, isOpen);

  // AI Request Movie state
  const [requestQuery, setRequestQuery] = useState('');
  const [requestType, setRequestType] = useState<'all' | 'movie' | 'tv'>('all');
  const [aiJob, setAiJob] = useState<AiMovieJobView | null>(null);
  const [isSubmittingAi, setIsSubmittingAi] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const pollTimerRef = useRef<number | null>(null);
  const handledLaunchSeqRef = useRef<number>(0);

  const stopPolling = () => {
    if (pollTimerRef.current !== null) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  };

  useEffect(() => {
    if (!isOpen) {
      stopPolling();
    }
    return () => stopPolling();
  }, [isOpen]);

  const pickedItem = useMemo(() => {
    const combined = [...movies, ...series];
    const pool =
      mood === 'series'
        ? series
        : mood === 'highrated'
          ? combined.filter((i) => parseFloat(i.rating || '0') >= 7.5)
          : mood === 'intense'
            ? movies.filter(
                (i) =>
                  parseFloat(i.rating || '0') >= 6.5 ||
                  /accion|thriller|sci|misterio|batalla|crimen/i.test(i.overview || '')
              )
            : mood === 'chill'
              ? combined.filter((i) => !/terror|guerra|horror|asesin/i.test(i.overview || ''))
              : combined;
    const safePool = pool.length > 0 ? pool : combined;
    if (safePool.length === 0) return null;
    return safePool[rollSeed % safePool.length] || safePool[0];
  }, [movies, series, mood, rollSeed]);

  const moods: Array<{ id: MoodId; label: string; icon: React.ReactNode }> = [
    {
      id: 'all',
      label: pickLang(lang, { es: 'Aleatorio', ca: 'Aleatori', en: 'Random' }),
      icon: <RiffanSurpriseIcon size={14} animate="hover" />,
    },
    {
      id: 'highrated',
      label: pickLang(lang, { es: 'Top +7.5★', ca: 'Top +7.5★', en: 'Top 7.5★+' }),
      icon: <Trophy className="w-3.5 h-3.5" />,
    },
    {
      id: 'intense',
      label: pickLang(lang, { es: 'Cine de hoy', ca: 'Cinema d’avui', en: 'Movie Night' }),
      icon: <Flame className="w-3.5 h-3.5" />,
    },
    {
      id: 'chill',
      label: pickLang(lang, { es: 'Desconectar', ca: 'Desconnectar', en: 'Chill' }),
      icon: <Laugh className="w-3.5 h-3.5" />,
    },
    {
      id: 'series',
      label: pickLang(lang, { es: 'Maratón serie', ca: 'Marató sèrie', en: 'Series Binge' }),
      icon: <RiffanChannelsIcon size={14} animate="hover" />,
    },
  ];

  const findLocalExactHit = (rawQ: string, typeFilter: 'all' | 'movie' | 'tv') => {
    const q = rawQ.trim().toLowerCase();
    if (q.length < 3) return null;
    const pool =
      typeFilter === 'movie'
        ? movies
        : typeFilter === 'tv'
          ? series
          : [...movies, ...series];
    return (
      pool.find(
        (m) =>
          m.title.trim().toLowerCase() === q ||
          (m.originalTitle && m.originalTitle.trim().toLowerCase() === q)
      ) || null
    );
  };

  // Quick instant check in already-loaded catalog pool before firing AI lookup
  const localExactHit = useMemo(
    () => findLocalExactHit(requestQuery, requestType),
    [requestQuery, requestType, movies, series]
  );

  const startAiMovieSearch = async (rawQuery: string, targetType: 'all' | 'movie' | 'tv') => {
    const q = rawQuery.trim();
    if (q.length < 2) return;

    stopPolling();
    setAiError(null);

    const exactHit = findLocalExactHit(q, targetType);
    if (exactHit) {
      setAiJob({
        jobId: 'local-hit',
        query: q,
        status: 'found',
        progressLabel: pickLang(lang, {
          es: '¡Ya está disponible en tu catálogo!',
          ca: 'Ja és disponible al teu catàleg!',
          en: 'Already available in your catalog!',
        }),
        steps: [
          pickLang(lang, {
            es: `Encontrado al instante: ${exactHit.title}`,
            ca: `Trobat a l'instant: ${exactHit.title}`,
            en: `Found immediately: ${exactHit.title}`,
          }),
        ],
        inCatalogAlready: true,
        streamReady: true,
        sourcesFound: exactHit.languages?.length ? exactHit.languages : ['HD'],
        item: exactHit,
      });
      return;
    }

    setIsSubmittingAi(true);
    try {
      const res = await fetch('/api/ai/request-movie', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, mediaType: targetType, lang }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success || !data?.job) {
        setAiError(
          data?.error ||
            pickLang(lang, {
              es: 'No se pudo iniciar la búsqueda con IA.',
              ca: 'No s’ha pogut iniciar la cerca amb IA.',
              en: 'Could not start AI search.',
            })
        );
        return;
      }

      const initialJob = data.job as AiMovieJobView;
      setAiJob(initialJob);

      const isTerminal = (st: AiMovieJobView['status']) =>
        st === 'found' || st === 'not_found' || st === 'error';

      if (!isTerminal(initialJob.status)) {
        pollTimerRef.current = window.setInterval(async () => {
          try {
            const pollRes = await fetch(
              `/api/ai/request-movie/${encodeURIComponent(initialJob.jobId)}`
            );
            const pollJson = await pollRes.json();
            if (pollRes.ok && pollJson?.job) {
              const updated = pollJson.job as AiMovieJobView;
              setAiJob(updated);
              if (isTerminal(updated.status)) {
                stopPolling();
              }
            }
          } catch {
            // tolerate transient poll drop
          }
        }, 1100);
      }
    } catch {
      setAiError(
        pickLang(lang, {
          es: 'Error de conexión al buscar con IA.',
          ca: 'Error de connexió en cercar amb IA.',
          en: 'Connection error during AI search.',
        })
      );
    } finally {
      setIsSubmittingAi(false);
    }
  };

  useEffect(() => {
    if (!isOpen || !initialRequest) return;
    if (initialRequest.seq === handledLaunchSeqRef.current) return;
    handledLaunchSeqRef.current = initialRequest.seq;

    if (initialRequest.mode === 'surprise') {
      setMode('surprise');
      return;
    }

    const targetType = initialRequest.mediaType || 'all';
    const nextQ = initialRequest.query.trim();
    setMode('request');
    setRequestType(targetType);
    setRequestQuery(nextQ);
    setAiError(null);
    setAiJob(null);
    if (nextQ.length >= 2) {
      void startAiMovieSearch(nextQ, targetType);
    }
  }, [isOpen, initialRequest]);

  const handleRequestSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    await startAiMovieSearch(requestQuery, requestType);
  };

  const renderMediaCard = (item: CatalogMovie, badgeText?: string) => (
    <motion.div
      key={`${item.id}-${rollSeed}-${badgeText || ''}`}
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.98 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="p-3.5 sm:p-4 rounded-2xl nc-specular-surface border border-white/[0.09] flex gap-3.5 sm:gap-4 items-center min-w-0"
    >
      <div className="w-20 sm:w-24 shrink-0 rounded-xl overflow-hidden shadow-[0_12px_30px_rgba(0,0,0,0.6)]">
        <PosterImage
          src={item.poster || '/icon.svg'}
          alt={item.title}
          aspect="poster"
        />
      </div>
      <div className="min-w-0 flex-1 space-y-1.5 sm:space-y-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-mono text-zinc-400 tabular-nums">
          <span className="text-[#BF94FF] font-semibold">
            {item.mediaType === 'tv'
              ? pickLang(lang, { es: 'Serie', ca: 'Sèrie', en: 'Series' })
              : pickLang(lang, { es: 'Película', ca: 'Pel·lícula', en: 'Movie' })}
          </span>
          {item.year && <span>· {item.year}</span>}
          {item.rating && <span>· ★ {item.rating}</span>}
          {badgeText && (
            <span className="text-emerald-300 font-semibold">· {badgeText}</span>
          )}
        </div>
        <h4 className="font-display text-base font-bold text-white leading-snug line-clamp-2">
          {item.title}
        </h4>
        <p className="text-xs text-zinc-400 line-clamp-3 leading-relaxed">
          {item.overview ||
            pickLang(lang, {
              es: 'Título destacado listo para proyectar en tu sala sincronizada.',
              ca: 'Títol destacat llest per projectar a la teva sala sincronitzada.',
              en: 'Featured title ready to stream in your synced room.',
            })}
        </p>
      </div>
    </motion.div>
  );

  const isSearchingAi = Boolean(
    aiJob &&
      (aiJob.status === 'checking_catalog' ||
        aiJob.status === 'searching_ai' ||
        aiJob.status === 'verifying_sources')
  );

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      lang={lang}
      title={
        mode === 'surprise'
          ? pickLang(lang, { es: 'Sorpréndeme', ca: 'Sorprèn-me', en: 'Surprise Me' })
          : pickLang(lang, {
              es: 'Pedir película (IA)',
              ca: 'Demanar pel·lícula (IA)',
              en: 'Request Title (AI)',
            })
      }
      subtitle={
        mode === 'surprise'
          ? pickLang(lang, {
              es: 'Elige una recomendación instantánea o pide una peli que no esté',
              ca: 'Tria una recomanació instantània o demana una pel·li que no hi sigui',
              en: 'Get an instant pick or ask AI to find any missing title',
            })
          : pickLang(lang, {
              es: 'Comprobamos tu catálogo y si no está la buscamos con IA hasta encontrarla',
              ca: 'Comprovem el catàleg i si no hi és la cerquem amb IA fins trobar-la',
              en: 'We check your catalog first, then search iteratively with AI until found',
            })
      }
      icon={mode === 'surprise' ? <RiffanSurpriseIcon size={20} animate="always" /> : <Wand2 className="w-5 h-5" />}
      maxWidth="sm:max-w-lg"
    >
      {/* Top 2-Mode Switcher: Sorpréndeme | Pedir película */}
      <div className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-[#0B0C13] border border-white/[0.08]">
        <button
          type="button"
          onClick={() => setMode('surprise')}
          className={`min-h-10 px-3 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
            mode === 'surprise'
              ? 'bg-gradient-to-b from-[#9E5CFF] to-[#772CE8] text-white shadow-[0_6px_18px_rgba(145,70,255,0.35)]'
              : 'text-zinc-300 hover:text-white hover:bg-white/[0.05]'
          }`}
        >
          <RiffanSurpriseIcon size={14} tone={mode === 'surprise' ? 'current' : 'brand'} animate="hover" className="shrink-0" />
          <span className="truncate">
            {pickLang(lang, { es: 'Sorpréndeme', ca: 'Sorprèn-me', en: 'Surprise Me' })}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setMode('request')}
          className={`min-h-10 px-3 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
            mode === 'request'
              ? 'bg-gradient-to-b from-emerald-500 to-emerald-600 text-zinc-950 shadow-[0_6px_18px_rgba(16,185,129,0.35)]'
              : 'text-zinc-300 hover:text-white hover:bg-white/[0.05]'
          }`}
        >
          <Wand2 className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">
            {pickLang(lang, {
              es: 'Pedir película',
              ca: 'Demanar pel·lícula',
              en: 'Request Movie',
            })}
          </span>
        </button>
      </div>

      {mode === 'surprise' ? (
        <>
          <div className="flex flex-wrap gap-1.5 min-w-0">
            {moods.map((m) => {
              const active = mood === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setMood(m.id);
                    setRollSeed((prev) => prev + 7);
                  }}
                  className={`min-h-10 px-3 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all whitespace-nowrap ${
                    active
                      ? 'bg-gradient-to-b from-[#9E5CFF] to-[#772CE8] text-white shadow-[0_6px_18px_rgba(145,70,255,0.35)]'
                      : 'bg-white/[0.06] text-zinc-300 hover:text-white hover:bg-white/[0.11] border border-white/[0.07]'
                  }`}
                >
                  {m.icon}
                  <span>{m.label}</span>
                </button>
              );
            })}
          </div>

          <AnimatePresence mode="wait">
            {pickedItem ? (
              renderMediaCard(pickedItem)
            ) : (
              <div className="py-8 flex flex-col items-center justify-center gap-3 text-center">
                {isLoading ? (
                  <>
                    <RiffanLoaderR size={40} />
                    <p className="text-xs text-zinc-300 font-medium">
                      {pickLang(lang, {
                        es: 'Cargando estrenos, series y películas para sorprenderte...',
                        ca: 'Carregant estrenes, sèries i pel·lícules per sorprendre’t...',
                        en: 'Loading premieres, series and movies to surprise you...',
                      })}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-xs text-zinc-400">
                      {pickLang(lang, {
                        es: 'No se pudo cargar la sugerencia en este momento.',
                        ca: 'No s’ha pogut carregar el suggeriment en aquest moment.',
                        en: 'Could not load a recommendation right now.',
                      })}
                    </p>
                    {onRetryLoad && (
                      <SecondaryButton onClick={onRetryLoad} size="md">
                        <RiffanShuffleIcon size={16} animate="hover" />
                        <span>
                          {pickLang(lang, { es: 'Reintentar', ca: 'Reintentar', en: 'Retry' })}
                        </span>
                      </SecondaryButton>
                    )}
                  </>
                )}
              </div>
            )}
          </AnimatePresence>

          <div className="flex items-center gap-2 sm:gap-2.5 pt-1 min-w-0">
            <SecondaryButton
              onClick={() => {
                if (!pickedItem && onRetryLoad) {
                  onRetryLoad();
                } else {
                  setRollSeed((prev) => prev + Math.floor(Math.random() * 19) + 1);
                }
              }}
              className="flex-1 min-w-0 !px-3 whitespace-nowrap"
            >
              <RiffanShuffleIcon size={16} animate="hover" className="shrink-0" />
              <span className="truncate">
                {pickLang(lang, {
                  es: 'Otra sugerencia',
                  ca: 'Un altre suggeriment',
                  en: 'Try another',
                })}
              </span>
            </SecondaryButton>
            {pickedItem && (
              <PrimaryButton
                onClick={() => {
                  onPlayItem(pickedItem);
                  onClose();
                }}
                className="flex-1 min-w-0 !px-3 whitespace-nowrap"
              >
                <RiffanPlayIcon size={16} tone="current" animate="hover" className="shrink-0" />
                <span className="truncate">
                  {pickLang(lang, {
                    es: 'Reproducir ahora',
                    ca: 'Reproduir ara',
                    en: 'Watch now',
                  })}
                </span>
              </PrimaryButton>
            )}
          </div>
        </>
      ) : (
        <div className="space-y-3 min-w-0">
          <form onSubmit={handleRequestSubmit} className="space-y-2.5">
            <div className="flex items-center gap-1.5">
              {(['all', 'movie', 'tv'] as const).map((tOpt) => (
                <button
                  key={tOpt}
                  type="button"
                  onClick={() => setRequestType(tOpt)}
                  className={`h-8 px-3 rounded-xl text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors ${
                    requestType === tOpt
                      ? 'bg-[#9146FF] text-white shadow-sm'
                      : 'bg-white/[0.05] text-zinc-300 hover:text-white border border-white/[0.08]'
                  }`}
                >
                  {tOpt === 'movie' ? (
                    <RiffanMoviesIcon size={13} tone={requestType === tOpt ? 'current' : 'brand'} animate="hover" />
                  ) : tOpt === 'tv' ? (
                    <RiffanChannelsIcon size={13} tone={requestType === tOpt ? 'current' : 'brand'} animate="hover" />
                  ) : (
                    <RiffanSurpriseIcon size={13} tone={requestType === tOpt ? 'current' : 'brand'} animate="hover" />
                  )}
                  <span>
                    {tOpt === 'all'
                      ? pickLang(lang, { es: 'Todo', ca: 'Tot', en: 'Any' })
                      : tOpt === 'movie'
                        ? pickLang(lang, { es: 'Película', ca: 'Pel·lícula', en: 'Movie' })
                        : pickLang(lang, { es: 'Serie', ca: 'Sèrie', en: 'Series' })}
                  </span>
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <div className="relative flex-1 min-w-0">
                <RiffanSearchIcon size={16} animate="hover" className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={requestQuery}
                  onChange={(e) => setRequestQuery(e.target.value)}
                  placeholder={pickLang(lang, {
                    es: 'Ej: El Hoyo 2, Interstellar, esa peli de viajes espaciales...',
                    ca: 'Ex: El Hoyo 2, Interstellar, aquella pel·li de viatges espacials...',
                    en: 'e.g. Interstellar, The Platform 2, or describe the plot...',
                  })}
                  className="w-full h-11 pl-9 pr-3 rounded-xl bg-white/[0.05] focus:bg-white/[0.08] border border-white/12 focus:border-emerald-400/70 text-sm text-white placeholder:text-zinc-500 outline-none transition-all"
                />
              </div>
              <PrimaryButton
                type="submit"
                disabled={requestQuery.trim().length < 2 || isSubmittingAi || isSearchingAi}
                className="!min-h-11 !px-4 shrink-0 whitespace-nowrap"
              >
                {isSubmittingAi || isSearchingAi ? (
                  <RiffanSpinner size={16} tone="current" />
                ) : (
                  <Wand2 className="w-4 h-4" />
                )}
                <span>
                  {pickLang(lang, { es: 'Buscar', ca: 'Cercar', en: 'Find' })}
                </span>
              </PrimaryButton>
            </div>
          </form>

          {aiError && (
            <div className="p-3 rounded-xl bg-rose-500/12 border border-rose-400/35 text-xs text-rose-200 flex items-center gap-2">
              <RiffanWarningIcon size={16} animate="always" className="shrink-0" />
              <span>{aiError}</span>
            </div>
          )}

          {aiJob && (
            <div className="space-y-3">
              {/* Live Progress Status Box */}
              {aiJob.status !== 'found' && (
                <div className="p-3.5 rounded-2xl bg-white/[0.035] border border-white/[0.08] space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-white">
                    {isSearchingAi ? (
                      <RiffanSpinner size={16} className="shrink-0" />
                    ) : (
                      <RiffanWarningIcon size={16} animate="always" className="shrink-0" />
                    )}
                    <span>{aiJob.progressLabel}</span>
                  </div>
                  {aiJob.aiNote && (
                    <p className="text-[11px] text-emerald-300/90 leading-snug">
                      {aiJob.aiNote}
                    </p>
                  )}
                  <div className="space-y-1 pt-0.5">
                    {aiJob.steps.slice(-3).map((st, idx) => (
                      <div key={idx} className="text-[11px] text-zinc-400 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/75 shrink-0" />
                        <span className="truncate">{st}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Found Title Ready to Play Identically to Catalog Movies */}
              {aiJob.status === 'found' && aiJob.item && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/12 border border-emerald-400/35 text-xs font-bold text-emerald-200">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span className="truncate">{aiJob.progressLabel}</span>
                  </div>

                  {renderMediaCard(
                    aiJob.item,
                    aiJob.sourcesFound.length > 0
                      ? aiJob.sourcesFound.slice(0, 2).join(' · ')
                      : undefined
                  )}

                  <PrimaryButton
                    onClick={() => {
                      if (!aiJob.item) return;
                      onPlayItem(aiJob.item);
                      onClose();
                    }}
                    className="w-full"
                  >
                    <RiffanPlayIcon size={16} tone="current" />
                    <span>
                      {pickLang(lang, {
                        es: 'Reproducir ahora',
                        ca: 'Reproduir ara',
                        en: 'Watch now',
                      })}
                    </span>
                  </PrimaryButton>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </BottomSheet>
  );
};

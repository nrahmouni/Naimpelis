import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  X,
  Play,
  Heart,
  Plus,
  Film,
  Tv,
  Loader2,
  Youtube,
  Users,
  Globe,
  Volume2,
  VolumeX,
  RefreshCw,
} from 'lucide-react';
import {
  AppLanguage,
  CatalogMovie,
  MediaRichDetails,
  RoomQueueItem,
} from '../types';
import { triggerHaptic } from '../utils/haptics';
import { pickLang } from '../utils/i18n';
import { extractSafeAmbientColor } from '../utils/imageUrl';
import { useFocusTrap } from '../utils/useFocusTrap';
import { PosterImage } from './ui/PosterImage';
import { FlagBadgeSvg, type FlagCode, MediaLanguageSelector } from './ui/LanguageBadge';

export type MovieAudioLangPreference = 'ES' | 'LAT' | 'VOSE' | 'EN';

interface MediaDetailsModalProps {
  item: CatalogMovie | null;
  lang: AppLanguage;
  defaultAudioLang?: MovieAudioLangPreference;
  isBookmarked: boolean;
  onClose: () => void;
  onPlayMovie: (
    movie: CatalogMovie,
    preferLang: MovieAudioLangPreference,
    opts?: { forceSpanish?: boolean }
  ) => void;
  onOpenSeriesEpisodes: (tmdbId: number, forceSpanish?: boolean) => void;
  onToggleBookmark: (movie: CatalogMovie) => void;
  onAddToQueue: (item: Omit<RoomQueueItem, 'id' | 'addedBy'>) => void;
  onSelectSimilar: (movie: CatalogMovie) => void;
}

const AUDIO_LANGUAGE_OPTIONS: {
  code: MovieAudioLangPreference;
  flagCode: FlagCode;
  labelEs: string;
  labelCa: string;
  labelEn: string;
  subEs: string;
  subCa: string;
  subEn: string;
}[] = [
  {
    code: 'ES',
    flagCode: 'es',
    labelEs: 'ES',
    labelCa: 'ES',
    labelEn: 'ES',
    subEs: 'Castellano HD',
    subCa: 'Castellà HD',
    subEn: 'Castilian HD',
  },
  {
    code: 'LAT',
    flagCode: 'lat',
    labelEs: 'LAT',
    labelCa: 'LAT',
    labelEn: 'LAT',
    subEs: 'Latino HD',
    subCa: 'Llatí HD',
    subEn: 'LatAm HD',
  },
  {
    code: 'VOSE',
    flagCode: 'vose',
    labelEs: 'VOSE',
    labelCa: 'VOSE',
    labelEn: 'VOSE',
    subEs: 'Subtitulado ES',
    subCa: 'Subtitulat',
    subEn: 'Subtitled',
  },
  {
    code: 'EN',
    flagCode: 'en',
    labelEs: 'EN',
    labelCa: 'EN',
    labelEn: 'EN',
    subEs: 'Original HD',
    subCa: 'Original HD',
    subEn: 'Original HD',
  },
];

export const MediaDetailsModal: React.FC<MediaDetailsModalProps> = ({
  item,
  lang,
  defaultAudioLang = 'ES',
  isBookmarked,
  onClose,
  onPlayMovie,
  onOpenSeriesEpisodes,
  onToggleBookmark,
  onAddToQueue,
  onSelectSimilar,
}) => {
  const [details, setDetails] = useState<MediaRichDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [playTrailer, setPlayTrailer] = useState(false);
  const [trailerMuted, setTrailerMuted] = useState(false);
  const [queuedFeedback, setQueuedFeedback] = useState(false);
  const [forcingSpanish, setForcingSpanish] = useState(false);
  const [forceSpanishStatus, setForceSpanishStatus] = useState<'idle' | 'found' | 'launched'>('idle');
  const [selectedAudioLang, setSelectedAudioLang] =
    useState<MovieAudioLangPreference>(defaultAudioLang);
  const trailerIframeRef = useRef<HTMLIFrameElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useFocusTrap(Boolean(item), onClose, dialogRef);

  const sendTrailerCommand = useCallback((func: string, args: unknown[] = []) => {
    const win = trailerIframeRef.current?.contentWindow;
    if (!win) return;
    try {
      win.postMessage(JSON.stringify({ event: 'command', func, args }), '*');
    } catch {
      // ignore
    }
  }, []);

  const unmuteAndPlayTrailer = useCallback(() => {
    sendTrailerCommand('unMute', []);
    sendTrailerCommand('setVolume', [100]);
    sendTrailerCommand('playVideo', []);
    setTrailerMuted(false);
  }, [sendTrailerCommand]);

  const handleToggleTrailerMute = useCallback(() => {
    triggerHaptic('light');
    if (trailerMuted) {
      unmuteAndPlayTrailer();
    } else {
      sendTrailerCommand('mute', []);
      setTrailerMuted(true);
    }
  }, [trailerMuted, unmuteAndPlayTrailer, sendTrailerCommand]);

  useEffect(() => {
    setSelectedAudioLang(defaultAudioLang);
  }, [defaultAudioLang, item?.id]);

  useEffect(() => {
    if (!item) {
      setDetails(null);
      return;
    }
    let cancelled = false;
    setDetails(null);
    setLoading(true);
    setPlayTrailer(false);
    setQueuedFeedback(false);
    setForcingSpanish(false);
    setForceSpanishStatus('idle');

    const mediaType = item.mediaType === 'tv' ? 'tv' : 'movie';
    const idSegment = item.tmdbId || 0;
    const movidyParam = item.movidyUrl ? `&movidyUrl=${encodeURIComponent(item.movidyUrl)}` : '';
    const vestParam = item.vestUrl ? `&vestUrl=${encodeURIComponent(item.vestUrl)}` : '';
    fetch(
      `/api/catalog/details/${mediaType}/${idSegment}?lang=${lang}&title=${encodeURIComponent(
        item.title || ''
      )}${movidyParam}${vestParam}`
    )
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data?.success && data?.details) {
          const nextDetails: MediaRichDetails = data.details;
          setDetails(nextDetails);
          const avail = nextDetails.availableLanguages;
          if (Array.isArray(avail) && avail.length > 0) {
            setSelectedAudioLang((prev) => (avail.includes(prev) ? prev : avail[0]));
          }
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [item?.id, item?.tmdbId, item?.mediaType, item?.title, item?.movidyUrl, item?.vestUrl, lang]);

  const handleForceSpanishSearch = useCallback(async () => {
    if (!item || forcingSpanish) return;
    triggerHaptic('medium');
    const isSeriesMedia = (details?.mediaType || item.mediaType) === 'tv';
    const resolvedId = item.tmdbId || details?.tmdbId;
    if (isSeriesMedia && resolvedId) {
      onClose();
      onOpenSeriesEpisodes(resolvedId, true);
      return;
    }

    setForcingSpanish(true);
    setForceSpanishStatus('idle');
    const idSegment = resolvedId || 0;
    const movidyParam = item.movidyUrl ? `&movidyUrl=${encodeURIComponent(item.movidyUrl)}` : '';
    const vestParam = item.vestUrl ? `&vestUrl=${encodeURIComponent(item.vestUrl)}` : '';
    let latestDetails = details;
    try {
      const res = await fetch(
        `/api/catalog/details/movie/${idSegment}?lang=${lang}&title=${encodeURIComponent(
          item.title || ''
        )}${movidyParam}${vestParam}&force=1&forceSpanish=1`
      );
      const data = await res.json().catch(() => null);
      if (data?.success && data?.details) {
        latestDetails = data.details as MediaRichDetails;
        setDetails(latestDetails);
      }
    } catch {
      // fall through to forced stream extraction
    } finally {
      setForcingSpanish(false);
    }

    const avail = latestDetails?.availableLanguages;
    if (Array.isArray(avail) && avail.includes('ES')) {
      setSelectedAudioLang('ES');
      setForceSpanishStatus('found');
    } else {
      setForceSpanishStatus('launched');
    }
    const enrichedMovie: CatalogMovie = {
      ...item,
      tmdbId: item.tmdbId || latestDetails?.tmdbId,
      originalTitle: item.originalTitle || latestDetails?.originalTitle,
      year:
        item.year && item.year !== 'HD'
          ? item.year
          : latestDetails?.year || item.year,
    };
    onClose();
    onPlayMovie(enrichedMovie, 'ES', { forceSpanish: true });
  }, [item, details, forcingSpanish, lang, onClose, onOpenSeriesEpisodes, onPlayMovie]);

  if (!item) return null;

  const isSeries = (details?.mediaType || item.mediaType) === 'tv';
  const title =
    item.title ||
    details?.title ||
    pickLang(lang, { es: 'Película', ca: 'Pel·lícula', en: 'Movie' });
  const year = (item.year && item.year !== 'HD' ? item.year : details?.year) || item.year || 'HD';
  const rating = details?.rating || item.rating;
  const overview = details?.overview || item.overview;
  const backdrop = details?.backdrop || item.backdrop || item.poster;
  const hasProbedLanguages = Array.isArray(details?.availableLanguages);
  const visibleAudioOptions = hasProbedLanguages
    ? AUDIO_LANGUAGE_OPTIONS.filter((opt) => details!.availableLanguages!.includes(opt.code))
    : [];

  const ambientGlow = details?.dominantColor || extractSafeAmbientColor(title);
  const selectedOpt = visibleAudioOptions.find((o) => o.code === selectedAudioLang);
  const selectedOptLabel = selectedOpt
    ? pickLang(lang, {
        es: selectedOpt.labelEs,
        ca: selectedOpt.labelCa,
        en: selectedOpt.labelEn,
      })
    : pickLang(lang, { es: 'Sala', ca: 'Sala', en: 'Room' });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
      className="fixed inset-0 z-[65] bg-black/85 backdrop-blur-md flex items-end sm:items-center justify-center sm:p-4"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{ ['--ambient-poster-glow' as string]: ambientGlow }}
        className="w-full sm:max-w-[860px] max-h-[92dvh] sm:max-h-[88dvh] rounded-t-3xl sm:rounded-3xl bg-[#141418]/96 backdrop-blur-2xl nc-specular-surface border-t sm:border border-white/[0.1] shadow-[0_32px_110px_rgba(0,0,0,0.96)] flex flex-col overflow-hidden ambient-poster-aura animate-sheet-up outline-none"
      >
        {/* Top Hero: Inline 4K Official Trailer or High-Res Backdrop */}
        <div className="relative w-full aspect-video max-h-[36dvh] sm:max-h-[380px] bg-black shrink-0 overflow-hidden">
          {playTrailer && details?.trailerKey ? (
            <iframe
              ref={trailerIframeRef}
              title={`${title} Trailer`}
              src={`https://www.youtube.com/embed/${details.trailerKey}?enablejsapi=1&autoplay=1&mute=0&rel=0&modestbranding=1&playsinline=1&origin=${encodeURIComponent(
                typeof window !== 'undefined' ? window.location.origin : ''
              )}`}
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
              onLoad={() => {
                unmuteAndPlayTrailer();
                setTimeout(unmuteAndPlayTrailer, 350);
                setTimeout(unmuteAndPlayTrailer, 950);
              }}
              className="w-full h-full border-0"
            />
          ) : backdrop ? (
            <>
              <PosterImage
                src={backdrop}
                alt={title}
                aspect="none"
                priority
                className="w-full h-full"
                imgClassName="object-cover"
                fallbackTitle={title}
                fallbackIcon={
                  isSeries ? <Tv className="w-6 h-6 text-zinc-500" /> : <Film className="w-6 h-6 text-zinc-500" />
                }
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#141418] via-[#141418]/35 to-black/30 pointer-events-none" />
              {details?.trailerKey && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    setTrailerMuted(false);
                    setPlayTrailer(true);
                  }}
                  className="absolute left-4 bottom-4 z-20 min-h-[42px] px-4 rounded-xl bg-[#141418]/85 hover:bg-[#1C1C22] border border-white/15 text-xs font-bold text-[#EFEFF1] flex items-center gap-2 backdrop-blur-xl shadow-xl cursor-pointer transition-all active:scale-95"
                >
                  <Youtube className="w-4 h-4 text-[#BF94FF]" />
                  <span>
                    {pickLang(lang, {
                      es: '▶ Ver Tráiler 4K',
                      ca: '▶ Veure Tràiler 4K',
                      en: '▶ Watch 4K Trailer',
                    })}
                  </span>
                </button>
              )}
            </>
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-white/[0.04]">
              {isSeries ? (
                <Tv className="w-12 h-12 text-zinc-600" />
              ) : (
                <Film className="w-12 h-12 text-zinc-600" />
              )}
            </div>
          )}

          {/* Mobile Grab Handle Overlay */}
          <div className="sm:hidden absolute top-2 inset-x-0 z-20 flex justify-center pointer-events-none">
            <div className="sheet-handle bg-white/40" />
          </div>

          {/* Top Floating Controls */}
          <div className="absolute top-3 right-3 z-20 flex items-center gap-2">
            {playTrailer && details?.trailerKey && (
              <button
                type="button"
                onClick={handleToggleTrailerMute}
                className={`min-h-[36px] px-3 rounded-xl border text-xs font-bold flex items-center gap-1.5 backdrop-blur-md cursor-pointer transition-colors ${
                  trailerMuted
                    ? 'bg-[#9146FF] border-[#9146FF] text-white'
                    : 'bg-[#18181B]/80 hover:bg-[#18181B] border-white/20 text-white'
                }`}
                title={
                  trailerMuted
                    ? pickLang(lang, {
                        es: 'Activar sonido del tráiler',
                        ca: 'Activar so del tràiler',
                        en: 'Unmute trailer',
                      })
                    : pickLang(lang, {
                        es: 'Silenciar tráiler',
                        ca: 'Silenciar tràiler',
                        en: 'Mute trailer',
                      })
                }
              >
                {trailerMuted ? (
                  <>
                    <VolumeX className="w-3.5 h-3.5" />
                    <span>
                      {pickLang(lang, {
                        es: 'Activar sonido',
                        ca: 'Activar so',
                        en: 'Unmute',
                      })}
                    </span>
                  </>
                ) : (
                  <>
                    <Volume2 className="w-3.5 h-3.5 text-[#00F593]" />
                    <span>{pickLang(lang, { es: 'Sonido', ca: 'So', en: 'Sound' })}</span>
                  </>
                )}
              </button>
            )}
            {details?.trailerKey && (
              <button
                type="button"
                onClick={() => {
                  setPlayTrailer((v) => {
                    const next = !v;
                    if (next) setTrailerMuted(false);
                    return next;
                  });
                }}
                className="min-h-[36px] px-3 rounded-xl bg-[#18181B]/80 hover:bg-[#18181B] border border-white/20 text-xs font-semibold text-white flex items-center gap-1.5 backdrop-blur-md cursor-pointer transition-colors"
              >
                <Youtube className="w-3.5 h-3.5 text-[#BF94FF]" />
                <span>
                  {playTrailer
                    ? pickLang(lang, {
                        es: 'Ocultar tráiler',
                        ca: 'Amagar tràiler',
                        en: 'Hide trailer',
                      })
                    : pickLang(lang, {
                        es: 'Tráiler 4K',
                        ca: 'Tràiler 4K',
                        en: 'Watch trailer',
                      })}
                </span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label={pickLang(lang, {
                es: 'Cerrar ficha',
                ca: 'Tancar fitxa',
                en: 'Close details',
              })}
              className="w-10 h-10 rounded-xl bg-[#141418]/80 hover:bg-[#9146FF] border border-white/20 flex items-center justify-center text-white backdrop-blur-md cursor-pointer transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Details Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
              <span className="font-semibold uppercase tracking-wider text-[#BF94FF]">
                {isSeries
                  ? pickLang(lang, { es: 'Serie TV', ca: 'Sèrie TV', en: 'TV Series' })
                  : pickLang(lang, { es: 'Película HD', ca: 'Pel·lícula HD', en: 'HD Movie' })}
              </span>
              {(details?.watchProviders?.length || item.platform) ? (
                <>
                  <span className="text-zinc-600">·</span>
                  <span className="font-bold text-white">
                    {details?.watchProviders?.length
                      ? details.watchProviders.slice(0, 3).join(' · ')
                      : item.platform}
                  </span>
                </>
              ) : null}
              {year && (
                <>
                  <span className="text-zinc-600">·</span>
                  <span className="text-zinc-200">{year}</span>
                </>
              )}
              {rating && (
                <>
                  <span className="text-zinc-600">·</span>
                  <span className="text-zinc-100 font-mono font-semibold">
                    ★ {rating}
                  </span>
                </>
              )}
              {details?.runtimeText && (
                <>
                  <span className="text-zinc-600">·</span>
                  <span>{details.runtimeText}</span>
                </>
              )}
              {details?.genres?.length ? (
                <>
                  <span className="text-zinc-600">·</span>
                  <span>{details.genres.join(', ')}</span>
                </>
              ) : null}
            </div>

            {details?.logoUrl ? (
              <div className="pt-1">
                <img
                  src={details.logoUrl}
                  alt={title}
                  className="max-h-14 sm:max-h-20 w-auto object-contain drop-shadow-[0_6px_18px_rgba(0,0,0,0.85)]"
                  referrerPolicy="no-referrer"
                />
                <h2 className="sr-only">{title}</h2>
              </div>
            ) : (
              <h2 className="font-display font-bold text-xl sm:text-3xl text-white leading-tight">
                {title}
              </h2>
            )}

            {details?.tagline && (
              <p className="text-xs sm:text-sm italic text-zinc-400">
                “{details.tagline}”
              </p>
            )}

            {/* Pre-Screening Audio & Language Selector (both movies and series) */}
            <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
              <MediaLanguageSelector
                labelPrefix={pickLang(lang, { es: 'Idioma:', ca: 'Idioma:', en: 'Language:' })}
                selectedLang={selectedAudioLang}
                availableLangs={
                  visibleAudioOptions.length > 0
                    ? visibleAudioOptions.map((opt) => ({
                        code: opt.code,
                        label: pickLang(lang, { es: opt.labelEs, ca: opt.labelCa, en: opt.labelEn }),
                      }))
                    : ['ES', 'LAT', 'VOSE', 'EN']
                }
                onSelectLang={(code) => {
                  triggerHaptic('light');
                  setSelectedAudioLang(code as MovieAudioLangPreference);
                }}
                probing={loading && !hasProbedLanguages}
                size="md"
              />

              {visibleAudioOptions.length > 0 && (
                <span className="text-xs font-semibold text-[#BF94FF]">
                  {selectedOptLabel}
                </span>
              )}
            </div>

            {/* Action Buttons Row */}
            <div className="pt-2 flex flex-wrap items-center gap-2.5">
              {isSeries && (item.tmdbId || details?.tmdbId) ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('success');
                      const id = (item.tmdbId || details?.tmdbId)!;
                      onClose();
                      onOpenSeriesEpisodes(id);
                    }}
                    className="min-h-[48px] px-6 rounded-2xl bg-gradient-to-b from-[#9E5CFF] to-[#772CE8] hover:brightness-110 text-xs sm:text-sm font-bold text-white flex items-center gap-2 cursor-pointer transition-all active:scale-[0.98] shadow-[0_10px_28px_rgba(145,70,255,0.38)]"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    <span>
                      {pickLang(lang, {
                        es: 'Elegir Temporada y Episodio',
                        ca: 'Triar Temporada i Episodi',
                        en: 'Browse Episodes',
                      })}
                    </span>
                  </button>
                  <button
                    type="button"
                    disabled={forcingSpanish}
                    onClick={() => void handleForceSpanishSearch()}
                    className="min-h-[48px] px-4 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] border border-[#BF94FF]/40 text-xs font-bold text-[#EFEFF1] flex items-center gap-2 cursor-pointer transition-colors disabled:opacity-60"
                  >
                    {forcingSpanish ? (
                      <Loader2 className="w-4 h-4 animate-spin text-[#BF94FF]" />
                    ) : (
                      <RefreshCw className="w-4 h-4 text-[#BF94FF]" />
                    )}
                    <span className="inline-flex items-center gap-1.5">
                      <FlagBadgeSvg code="es" className="w-4 h-3" />
                      <span>
                        {pickLang(lang, {
                          es: 'Forzar búsqueda en Castellano',
                          ca: 'Forçar cerca en Castellà',
                          en: 'Force Castilian Spanish search',
                        })}
                      </span>
                    </span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={(loading && !hasProbedLanguages) || (hasProbedLanguages && visibleAudioOptions.length === 0)}
                    onClick={() => {
                      triggerHaptic('success');
                      const enrichedMovie: CatalogMovie = {
                        ...item,
                        tmdbId: item.tmdbId || details?.tmdbId,
                        originalTitle: item.originalTitle || details?.originalTitle,
                        year:
                          item.year && item.year !== 'HD'
                            ? item.year
                            : details?.year || item.year,
                      };
                      onClose();
                      onPlayMovie(enrichedMovie, selectedAudioLang);
                    }}
                    className="flex-1 sm:flex-initial min-h-[48px] px-6 rounded-2xl bg-gradient-to-b from-[#9E5CFF] to-[#772CE8] hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed text-xs sm:text-sm font-bold text-white flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-[0.98] shadow-[0_10px_28px_rgba(145,70,255,0.38)]"
                  >
                    {loading && !hasProbedLanguages ? (
                      <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                    ) : (
                      <Play className="w-4 h-4 fill-current shrink-0" />
                    )}
                    <span>
                      {loading && !hasProbedLanguages
                        ? pickLang(lang, {
                            es: 'Verificando idiomas...',
                            ca: 'Verificant idiomes...',
                            en: 'Checking languages...',
                          })
                        : visibleAudioOptions.length === 0 && hasProbedLanguages
                        ? pickLang(lang, {
                            es: 'No disponible ahora',
                            ca: 'No disponible ara',
                            en: 'Unavailable right now',
                          })
                        : pickLang(lang, {
                            es: `Proyectar en ${selectedOptLabel} (${selectedAudioLang})`,
                            ca: `Projectar en ${selectedOptLabel} (${selectedAudioLang})`,
                            en: `Screen in ${selectedOptLabel}`,
                          })}
                    </span>
                  </button>
                  <button
                    type="button"
                    disabled={forcingSpanish}
                    onClick={() => void handleForceSpanishSearch()}
                    className="min-h-[48px] px-4 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] border border-[#BF94FF]/40 text-xs font-bold text-[#EFEFF1] flex items-center gap-2 cursor-pointer transition-colors disabled:opacity-60"
                  >
                    {forcingSpanish ? (
                      <Loader2 className="w-4 h-4 animate-spin text-[#BF94FF]" />
                    ) : (
                      <RefreshCw className="w-4 h-4 text-[#BF94FF]" />
                    )}
                    <span className="inline-flex items-center gap-1.5">
                      {!forcingSpanish && <FlagBadgeSvg code="es" className="w-4 h-3" />}
                      <span>
                        {forcingSpanish
                          ? pickLang(lang, {
                              es: 'Buscando Castellano...',
                              ca: 'Cercant Castellà...',
                              en: 'Searching Castilian...',
                            })
                          : forceSpanishStatus === 'found'
                          ? pickLang(lang, {
                              es: 'Castellano detectado',
                              ca: 'Castellà detectat',
                              en: 'Castilian detected',
                            })
                          : pickLang(lang, {
                              es: 'Forzar búsqueda en Castellano',
                              ca: 'Forçar cerca en Castellà',
                              en: 'Force Castilian Spanish search',
                            })}
                      </span>
                    </span>
                  </button>
                </>
              )}

              {!isSeries && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('success');
                    onAddToQueue({
                      kind: 'movie',
                      title: item.title,
                      subtitle: `${year || 'HD'} · ${selectedAudioLang}`,
                      poster: item.poster || details?.poster,
                      tmdbId: item.tmdbId || details?.tmdbId,
                      url: item.bingetrixUrl || item.movidyUrl || item.vestUrl,
                      vestUrl: item.vestUrl,
                      preferLang: selectedAudioLang,
                    });
                    setQueuedFeedback(true);
                    setTimeout(() => setQueuedFeedback(false), 1800);
                  }}
                  className="min-h-[48px] px-4 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-xs font-semibold text-zinc-200 flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  <span>
                    {queuedFeedback
                      ? pickLang(lang, {
                          es: `En cola (${selectedAudioLang}) ✓`,
                          ca: `A la cua (${selectedAudioLang}) ✓`,
                          en: `Queued (${selectedAudioLang}) ✓`,
                        })
                      : pickLang(lang, {
                          es: `Añadir a Cola (${selectedAudioLang})`,
                          ca: `Afegir a la Cua (${selectedAudioLang})`,
                          en: `Add to Queue (${selectedAudioLang})`,
                        })}
                  </span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  onToggleBookmark(item);
                }}
                className="min-h-[48px] px-4 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-xs font-semibold text-zinc-200 flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <Heart
                  className={`w-4 h-4 ${
                    isBookmarked ? 'fill-current text-[#9146FF]' : 'text-zinc-300'
                  }`}
                />
                <span>
                  {isBookmarked
                    ? pickLang(lang, { es: 'En Mi Lista', ca: 'A La Meva Llista', en: 'Saved' })
                    : pickLang(lang, { es: 'Mi Lista', ca: 'La Meva Llista', en: 'My List' })}
                </span>
              </button>
            </div>
          </div>

          {/* Synopsis */}
          <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
            {overview ||
              pickLang(lang, {
                es: 'Proyección sincronizada en alta definición disponible para toda tu sala.',
                ca: 'Projecció sincronitzada en alta definició disponible per a tota la sala.',
                en: 'Synchronized HD screening ready for your watch party.',
              })}
          </p>

          {loading && (
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <Loader2 className="w-4 h-4 animate-spin text-[#9146FF]" />
              <span>
                {pickLang(lang, {
                  es: 'Cargando reparto y recomendaciones...',
                  ca: 'Carregant repartiment i recomanacions...',
                  en: 'Loading cast & recommendations...',
                })}
              </span>
            </div>
          )}

          {/* Cast Rail */}
          {details?.cast && details.cast.length > 0 && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="font-display font-semibold text-xs sm:text-sm text-zinc-200 flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-[#9146FF]" />
                  <span>
                    {pickLang(lang, {
                      es: 'Reparto Principal',
                      ca: 'Repartiment Principal',
                      en: 'Top Cast',
                    })}
                  </span>
                </h3>
                {details.directorOrCreator && (
                  <span className="text-xs text-zinc-400">
                    {isSeries
                      ? pickLang(lang, { es: 'Creada por ', ca: 'Creada per ', en: 'Created by ' })
                      : 'Dir. '}
                    <strong className="text-zinc-200 font-medium">
                      {details.directorOrCreator}
                    </strong>
                  </span>
                )}
              </div>

              <div className="flex items-stretch gap-2.5 overflow-x-auto no-scrollbar pb-1">
                {details.cast.map((actor) => (
                  <div
                    key={actor.id}
                    className="w-[104px] sm:w-[116px] shrink-0 rounded-2xl bg-white/[0.04] border border-white/[0.08] p-2 flex flex-col items-center text-center gap-1.5"
                  >
                    {actor.photo ? (
                      <img
                        src={actor.photo}
                        alt={actor.name}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        className="w-14 h-14 rounded-full object-cover border border-white/10"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-full bg-white/[0.07] flex items-center justify-center text-xs font-bold text-zinc-300">
                        {actor.name.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 w-full">
                      <div className="text-[11px] font-semibold text-white truncate">
                        {actor.name}
                      </div>
                      <div className="text-[10px] text-zinc-400 truncate">
                        {actor.character}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Similar Recommendations Rail */}
          {details?.similar && details.similar.length > 0 && (
            <div className="space-y-2.5">
              <h3 className="font-display font-semibold text-xs sm:text-sm text-zinc-200">
                {pickLang(lang, {
                  es: 'Títulos Similares',
                  ca: 'Títols Similars',
                  en: 'More Like This',
                })}
              </h3>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
                {details.similar.slice(0, 8).map((sim) => (
                  <button
                    key={sim.id}
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      onSelectSimilar(sim);
                    }}
                    className="group text-left rounded-2xl overflow-hidden bg-white/[0.04] nc-card-sheen border border-white/[0.08] hover:border-[#9146FF]/50 transition-all cursor-pointer flex flex-col"
                  >
                    <PosterImage
                      src={sim.poster}
                      alt={sim.title}
                      aspect="poster"
                      className="w-full"
                      imgClassName="object-cover group-hover:scale-105 transition-transform duration-300"
                      fallbackTitle={sim.title}
                    />
                    <div className="p-2">
                      <div className="text-[11px] font-semibold text-white truncate">
                        {sim.title}
                      </div>
                      <div className="text-[10px] text-zinc-400 truncate">
                        {sim.year}
                        {sim.rating ? ` · ★ ${sim.rating}` : ''}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};


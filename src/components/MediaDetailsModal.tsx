import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Play, Heart, Plus, Share2 } from 'lucide-react';
import { RiffanRetryIcon, RiffanSpinner } from './ui/RiffanIcons';
import {
  AppLanguage,
  CatalogMovie,
  MediaRichDetails,
  RoomQueueItem,
} from '../types';
import { triggerHaptic } from '../utils/haptics';
import { pickLang } from '../utils/i18n';
import { extractSafeAmbientColor } from '../utils/imageUrl';
import { shareDedicatedLink } from '../utils/shareDedicatedLink';
import { useFocusTrap } from '../utils/useFocusTrap';
import { useSuppressFloatingBubble } from '../utils/useSuppressFloatingBubble';
import { useBackInterceptor } from '../lib/backInterceptor';
import { FlagBadgeSvg, MediaLanguageSelector } from './ui/LanguageBadge';
import {
  AUDIO_LANGUAGE_OPTIONS,
  MediaDetailsCastAndSimilar,
  MediaDetailsHero,
} from './catalog/MediaDetailsSections';

export type MovieAudioLangPreference = 'ES' | 'LAT' | 'VOSE' | 'EN';

interface MediaDetailsModalProps {
  item: CatalogMovie | null;
  lang: AppLanguage;
  shareRoomId?: string;
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

export const MediaDetailsModal: React.FC<MediaDetailsModalProps> = ({
  item,
  lang,
  shareRoomId,
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
  useSuppressFloatingBubble(Boolean(item));
  useBackInterceptor(Boolean(item), 'media-details-modal', onClose, {
    priority: 15,
    lockScroll: true,
  });

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
    const gnulaParam = item.gnulaUrl ? `&gnulaUrl=${encodeURIComponent(item.gnulaUrl)}` : '';
    const vestParam = item.vestUrl ? `&vestUrl=${encodeURIComponent(item.vestUrl)}` : '';
    fetch(
      `/api/catalog/details/${mediaType}/${idSegment}?lang=${lang}&title=${encodeURIComponent(
        item.title || ''
      )}${movidyParam}${gnulaParam}${vestParam}`
    )
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data?.success && data?.details) {
          const nextDetails: MediaRichDetails = data.details;
          setDetails(nextDetails);
          const avail = nextDetails.availableLanguages;
          if (Array.isArray(avail) && avail.length > 0) {
            setSelectedAudioLang((prev) =>
              avail.includes(defaultAudioLang)
                ? defaultAudioLang
                : avail.includes(prev)
                ? prev
                : avail[0]
            );
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
  }, [item?.id, item?.tmdbId, item?.mediaType, item?.title, item?.movidyUrl, item?.gnulaUrl, item?.vestUrl, lang]);

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
    const gnulaParam = item.gnulaUrl ? `&gnulaUrl=${encodeURIComponent(item.gnulaUrl)}` : '';
    const vestParam = item.vestUrl ? `&vestUrl=${encodeURIComponent(item.vestUrl)}` : '';
    let latestDetails = details;
    try {
      const res = await fetch(
        `/api/catalog/details/movie/${idSegment}?lang=${lang}&title=${encodeURIComponent(
          item.title || ''
        )}${movidyParam}${gnulaParam}${vestParam}&force=1&forceSpanish=1`
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
    const resolvedMediaType = latestDetails?.mediaType || item.mediaType;
    const resolvedTmdbId = item.tmdbId || latestDetails?.tmdbId;
    const enrichedMovie: CatalogMovie = {
      ...item,
      mediaType: resolvedMediaType,
      tmdbId: resolvedTmdbId,
      originalTitle: item.originalTitle || latestDetails?.originalTitle,
      bingetrixUrl:
        item.bingetrixUrl ||
        (resolvedMediaType !== 'tv' && resolvedTmdbId
          ? `https://bingetrix.sc/watch/${resolvedTmdbId}`
          : undefined),
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
        className="w-full sm:max-w-[860px] max-h-[92dvh] sm:max-h-[88dvh] rounded-t-3xl sm:rounded-3xl bg-[#0D0D12] nc-specular-surface border-t sm:border border-white/[0.08] shadow-[0_32px_110px_rgba(0,0,0,0.96)] flex flex-col overflow-hidden ambient-poster-aura animate-sheet-up outline-none"
      >
        <MediaDetailsHero
          lang={lang}
          title={title}
          isSeries={isSeries}
          backdrop={backdrop}
          details={details}
          playTrailer={playTrailer}
          trailerMuted={trailerMuted}
          trailerIframeRef={trailerIframeRef}
          unmuteAndPlayTrailer={unmuteAndPlayTrailer}
          onToggleTrailerMute={handleToggleTrailerMute}
          setPlayTrailer={setPlayTrailer}
          setTrailerMuted={setTrailerMuted}
          onClose={onClose}
        />

        {/* Scrollable Details Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
              <span className="font-semibold uppercase tracking-wider text-[#A78BFA]">
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
                <span className="text-xs font-semibold text-[#A78BFA]">
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
                    className="min-h-[48px] px-6 rounded-2xl bg-[#7C3AED] hover:bg-[#8B5CF6] text-xs sm:text-sm font-bold text-white flex items-center gap-2 cursor-pointer transition-all active:scale-95 shadow-[0_10px_28px_rgba(124,58,237,0.38)]"
                  >
                    <Play className="w-4 h-4 fill-current shrink-0" />
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
                    className="min-h-[48px] px-4 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] border border-[#8B5CF6]/40 text-xs font-bold text-[#EFEFF1] flex items-center gap-2 cursor-pointer active:scale-95 transition-all disabled:opacity-60"
                  >
                    {forcingSpanish ? (
                      <RiffanSpinner size={16} />
                    ) : (
                      <RiffanRetryIcon size={16} />
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
                      const resolvedMediaType = details?.mediaType || item.mediaType;
                      const resolvedTmdbId = item.tmdbId || details?.tmdbId;
                      const enrichedMovie: CatalogMovie = {
                        ...item,
                        mediaType: resolvedMediaType,
                        tmdbId: resolvedTmdbId,
                        originalTitle: item.originalTitle || details?.originalTitle,
                        bingetrixUrl:
                          item.bingetrixUrl ||
                          (resolvedMediaType !== 'tv' && resolvedTmdbId
                            ? `https://bingetrix.sc/watch/${resolvedTmdbId}`
                            : undefined),
                        year:
                          item.year && item.year !== 'HD'
                            ? item.year
                            : details?.year || item.year,
                      };
                      onClose();
                      onPlayMovie(enrichedMovie, selectedAudioLang);
                    }}
                    className="flex-1 sm:flex-initial min-h-[48px] px-6 rounded-2xl bg-[#7C3AED] hover:bg-[#8B5CF6] disabled:opacity-50 disabled:cursor-not-allowed text-xs sm:text-sm font-bold text-white flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-95 shadow-[0_10px_28px_rgba(124,58,237,0.38)]"
                  >
                    {loading && !hasProbedLanguages ? (
                      <RiffanSpinner size={16} tone="current" />
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
                    className="min-h-[48px] px-4 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] border border-[#8B5CF6]/40 text-xs font-bold text-[#EFEFF1] flex items-center gap-2 cursor-pointer active:scale-95 transition-all disabled:opacity-60"
                  >
                    {forcingSpanish ? (
                      <RiffanSpinner size={16} />
                    ) : (
                      <RiffanRetryIcon size={16} />
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
                      url:
                        item.bingetrixUrl ||
                        (item.tmdbId || details?.tmdbId
                          ? `https://bingetrix.sc/watch/${item.tmdbId || details?.tmdbId}`
                          : undefined) ||
                        item.movidyUrl ||
                        item.gnulaUrl ||
                        item.vestUrl,
                      gnulaUrl: item.gnulaUrl,
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
                    isBookmarked ? 'fill-current text-[#8B5CF6]' : 'text-zinc-300'
                  }`}
                />
                <span>
                  {isBookmarked
                    ? pickLang(lang, { es: 'En Mi Lista', ca: 'A La Meva Llista', en: 'Saved' })
                    : pickLang(lang, { es: 'Mi Lista', ca: 'La Meva Llista', en: 'My List' })}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  void shareDedicatedLink({
                    target: isSeries
                      ? { kind: 'series', tmdbId: item.tmdbId || details?.tmdbId, title }
                      : { kind: 'movie', tmdbId: item.tmdbId || details?.tmdbId, title },
                    roomId: shareRoomId,
                    title,
                  });
                }}
                className="min-h-[48px] px-4 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-xs font-semibold text-zinc-200 flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all"
              >
                <Share2 className="w-4 h-4 text-[#A78BFA]" />
                <span>
                  {pickLang(lang, { es: 'Compartir', ca: 'Compartir', en: 'Share' })}
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
              <RiffanSpinner size={16} />
              <span>
                {pickLang(lang, {
                  es: 'Cargando reparto y recomendaciones...',
                  ca: 'Carregant repartiment i recomanacions...',
                  en: 'Loading cast & recommendations...',
                })}
              </span>
            </div>
          )}

          <MediaDetailsCastAndSimilar
            lang={lang}
            isSeries={isSeries}
            details={details}
            onSelectSimilar={onSelectSimilar}
          />
        </div>
      </div>
    </div>
  );
};


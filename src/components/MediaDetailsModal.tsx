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
} from 'lucide-react';
import {
  AppLanguage,
  CatalogMovie,
  MediaRichDetails,
  RoomQueueItem,
} from '../types';
import { triggerHaptic } from '../utils/haptics';
import { extractSafeAmbientColor } from '../utils/imageUrl';

export type MovieAudioLangPreference = 'ES' | 'LAT' | 'VOSE' | 'EN';

interface MediaDetailsModalProps {
  item: CatalogMovie | null;
  lang: AppLanguage;
  defaultAudioLang?: MovieAudioLangPreference;
  isBookmarked: boolean;
  onClose: () => void;
  onPlayMovie: (movie: CatalogMovie, preferLang: MovieAudioLangPreference) => void;
  onOpenSeriesEpisodes: (tmdbId: number) => void;
  onToggleBookmark: (movie: CatalogMovie) => void;
  onAddToQueue: (item: Omit<RoomQueueItem, 'id' | 'addedBy'>) => void;
  onSelectSimilar: (movie: CatalogMovie) => void;
}

const AUDIO_LANGUAGE_OPTIONS: {
  code: MovieAudioLangPreference;
  flag: string;
  labelEs: string;
  labelEn: string;
  subEs: string;
  subEn: string;
}[] = [
  {
    code: 'ES',
    flag: '🇪🇸',
    labelEs: 'Castellano',
    labelEn: 'Spanish (Spain)',
    subEs: 'Audio España HD',
    subEn: 'Castilian HD',
  },
  {
    code: 'LAT',
    flag: '🇲🇽',
    labelEs: 'Español Latino',
    labelEn: 'Latin Spanish',
    subEs: 'Audio Latino HD',
    subEn: 'LatAm HD',
  },
  {
    code: 'VOSE',
    flag: '💬',
    labelEs: 'Subtitulado (VOSE)',
    labelEn: 'Subtitled (VOSE)',
    subEs: 'V.O. + Subtítulos ES',
    subEn: 'Original + ES Subs',
  },
  {
    code: 'EN',
    flag: '🇬🇧',
    labelEs: 'Inglés Original',
    labelEn: 'Original English',
    subEs: 'Audio V.O. 1080p',
    subEn: 'Original 1080p',
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
  const [selectedAudioLang, setSelectedAudioLang] =
    useState<MovieAudioLangPreference>(defaultAudioLang);
  const trailerIframeRef = useRef<HTMLIFrameElement | null>(null);

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

  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [item, onClose]);

  if (!item) return null;

  const isSeries = (details?.mediaType || item.mediaType) === 'tv';
  const title = item.title || details?.title || 'Película';
  const year = (item.year && item.year !== 'HD' ? item.year : details?.year) || item.year || 'HD';
  const rating = details?.rating || item.rating;
  const overview = details?.overview || item.overview;
  const backdrop = details?.backdrop || item.backdrop || item.poster;
  const hasProbedLanguages = Array.isArray(details?.availableLanguages);
  const visibleAudioOptions = hasProbedLanguages
    ? AUDIO_LANGUAGE_OPTIONS.filter((opt) => details!.availableLanguages!.includes(opt.code))
    : [];

  const ambientGlow = details?.dominantColor || extractSafeAmbientColor(title);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
      className="fixed inset-0 z-[65] bg-black/85 backdrop-blur-md flex items-end sm:items-center justify-center sm:p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ ['--ambient-poster-glow' as string]: ambientGlow }}
        className="w-full sm:max-w-[860px] max-h-[92dvh] sm:max-h-[88dvh] rounded-t-3xl sm:rounded-3xl bg-[#18181B]/95 backdrop-blur-2xl border-t sm:border border-white/[0.08] shadow-[0_32px_110px_rgba(0,0,0,0.96)] flex flex-col overflow-hidden ambient-poster-aura"
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
              <img
                src={backdrop}
                alt={title}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#18181B] via-[#18181B]/35 to-black/30" />
              {details?.trailerKey && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    setTrailerMuted(false);
                    setPlayTrailer(true);
                  }}
                  className="absolute left-4 bottom-4 z-20 min-h-10 px-4 rounded-xl bg-[#18181B]/85 hover:bg-[#18181B] border border-white/15 text-xs font-bold text-[#EFEFF1] flex items-center gap-2 backdrop-blur-xl shadow-xl cursor-pointer transition-all active:scale-95"
                >
                  <Youtube className="w-4 h-4 text-[#BF94FF]" />
                  <span>{lang === 'es' ? '▶ Ver Tráiler 4K' : '▶ Watch 4K Trailer'}</span>
                </button>
              )}
            </>
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-[#1F1F23]">
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
                title={trailerMuted ? 'Activar sonido del tráiler' : 'Silenciar tráiler'}
              >
                {trailerMuted ? (
                  <>
                    <VolumeX className="w-3.5 h-3.5" />
                    <span>{lang === 'es' ? 'Activar sonido' : 'Unmute'}</span>
                  </>
                ) : (
                  <>
                    <Volume2 className="w-3.5 h-3.5 text-[#00F593]" />
                    <span>{lang === 'es' ? 'Sonido' : 'Sound'}</span>
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
                    ? lang === 'es'
                      ? 'Ocultar tráiler'
                      : 'Hide trailer'
                    : lang === 'es'
                    ? 'Tráiler 4K'
                    : 'Watch trailer'}
                </span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar ficha"
              className="w-9 h-9 rounded-xl bg-[#18181B]/80 hover:bg-[#9146FF] border border-white/20 flex items-center justify-center text-white backdrop-blur-md cursor-pointer transition-colors"
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
                  ? lang === 'es'
                    ? 'Serie TV'
                    : 'TV Series'
                  : lang === 'es'
                  ? 'Película HD'
                  : 'HD Movie'}
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

            {/* Pre-Screening Audio & Language Selector (For Movies — ONLY verified available languages) */}
            {!isSeries && (
              <div className="pt-2 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-300 flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-[#9146FF]" />
                    <span>
                      {lang === 'es'
                        ? 'Idiomas disponibles para proyectar'
                        : 'Available audio languages'}
                    </span>
                  </span>
                  {visibleAudioOptions.length > 0 && (
                    <span className="text-[11px] font-semibold text-[#BF94FF]">
                      {
                        visibleAudioOptions.find((o) => o.code === selectedAudioLang)?.[
                          lang === 'es' ? 'labelEs' : 'labelEn'
                        ]
                      }
                    </span>
                  )}
                </div>

                {loading && !hasProbedLanguages ? (
                  <div className="min-h-[52px] px-4 rounded-2xl bg-[#1F1F23] border border-white/[0.08] flex items-center gap-2.5 text-xs text-zinc-300">
                    <Loader2 className="w-4 h-4 animate-spin text-[#9146FF] shrink-0" />
                    <span>
                      {lang === 'es'
                        ? 'Comprobando idiomas disponibles en tiempo real...'
                        : 'Checking available audio languages...'}
                    </span>
                  </div>
                ) : visibleAudioOptions.length > 0 ? (
                  <div
                    className={`grid gap-2 ${
                      visibleAudioOptions.length === 1
                        ? 'grid-cols-1 sm:max-w-[260px]'
                        : visibleAudioOptions.length === 2
                        ? 'grid-cols-2 sm:max-w-[460px]'
                        : visibleAudioOptions.length === 3
                        ? 'grid-cols-2 sm:grid-cols-3'
                        : 'grid-cols-2 sm:grid-cols-4'
                    }`}
                  >
                    {visibleAudioOptions.map((opt) => {
                      const active = selectedAudioLang === opt.code;
                      return (
                        <button
                          key={opt.code}
                          type="button"
                          onClick={() => {
                            triggerHaptic('light');
                            setSelectedAudioLang(opt.code);
                          }}
                          className={`min-h-[52px] px-3 py-2 rounded-2xl border text-left transition-all cursor-pointer active:scale-[0.98] flex items-center gap-2.5 ${
                            active
                              ? 'bg-[#9146FF] text-white border-[#9146FF] shadow-[0_8px_24px_rgba(145,70,255,0.28)]'
                              : 'bg-[#1F1F23] hover:bg-[#26262C] border-white/[0.08] text-zinc-300'
                          }`}
                        >
                          <span className="text-lg shrink-0">{opt.flag}</span>
                          <div className="min-w-0 flex-1">
                            <div
                              className={`text-xs font-bold truncate ${
                                active ? 'text-white' : 'text-[#EFEFF1]'
                              }`}
                            >
                              {lang === 'es' ? opt.labelEs : opt.labelEn}
                            </div>
                            <div
                              className={`text-[10px] truncate ${
                                active ? 'text-[#EFEFF1]/85 font-medium' : 'text-zinc-400'
                              }`}
                            >
                              {lang === 'es' ? opt.subEs : opt.subEn}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="min-h-[48px] px-4 rounded-2xl bg-white/[0.03] border border-white/[0.08] flex items-center text-xs text-zinc-400">
                    {lang === 'es'
                      ? 'Este título no tiene pistas directas activas en este momento.'
                      : 'No direct audio tracks currently active for this title.'}
                  </div>
                )}
              </div>
            )}

            {/* Action Buttons Row */}
            <div className="pt-2 flex flex-wrap items-center gap-2.5">
              {isSeries && (item.tmdbId || details?.tmdbId) ? (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('success');
                    const id = (item.tmdbId || details?.tmdbId)!;
                    onClose();
                    onOpenSeriesEpisodes(id);
                  }}
                  className="min-h-[48px] px-6 rounded-2xl bg-[#9146FF] hover:bg-[#772CE8] text-xs sm:text-sm font-bold text-white flex items-center gap-2 cursor-pointer transition-all active:scale-[0.98] shadow-lg shadow-[#9146FF]/30"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>
                    {lang === 'es' ? 'Elegir Temporada y Episodio' : 'Browse Episodes'}
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  disabled={(loading && !hasProbedLanguages) || (hasProbedLanguages && visibleAudioOptions.length === 0)}
                  onClick={() => {
                    triggerHaptic('success');
                    const enrichedMovie: CatalogMovie = {
                      ...item,
                      tmdbId: item.tmdbId || details?.tmdbId,
                    };
                    onClose();
                    onPlayMovie(enrichedMovie, selectedAudioLang);
                  }}
                  className="flex-1 sm:flex-initial min-h-[48px] px-6 rounded-2xl bg-[#9146FF] hover:bg-[#772CE8] disabled:opacity-50 disabled:cursor-not-allowed text-xs sm:text-sm font-bold text-white flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-[0.98] shadow-lg shadow-[#9146FF]/30"
                >
                  {loading && !hasProbedLanguages ? (
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  ) : (
                    <Play className="w-4 h-4 fill-current shrink-0" />
                  )}
                  <span>
                    {loading && !hasProbedLanguages
                      ? lang === 'es'
                        ? 'Verificando idiomas...'
                        : 'Checking languages...'
                      : visibleAudioOptions.length === 0 && hasProbedLanguages
                      ? lang === 'es'
                        ? 'No disponible ahora'
                        : 'Unavailable right now'
                      : lang === 'es'
                      ? `Proyectar en ${
                          AUDIO_LANGUAGE_OPTIONS.find((o) => o.code === selectedAudioLang)
                            ?.labelEs || 'Sala'
                        } (${selectedAudioLang})`
                      : `Screen in ${
                          AUDIO_LANGUAGE_OPTIONS.find((o) => o.code === selectedAudioLang)
                            ?.labelEn || 'Room'
                        }`}
                  </span>
                </button>
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
                      ? lang === 'es'
                        ? `En cola (${selectedAudioLang}) ✓`
                        : `Queued (${selectedAudioLang}) ✓`
                      : lang === 'es'
                      ? `Añadir a Cola (${selectedAudioLang})`
                      : `Add to Queue (${selectedAudioLang})`}
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
                    ? lang === 'es'
                      ? 'En Mi Lista'
                      : 'Saved'
                    : lang === 'es'
                    ? 'Mi Lista'
                    : 'My List'}
                </span>
              </button>
            </div>
          </div>

          {/* Synopsis */}
          <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
            {overview ||
              (lang === 'es'
                ? 'Proyección sincronizada en alta definición disponible para toda tu sala.'
                : 'Synchronized HD screening ready for your watch party.')}
          </p>

          {loading && (
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <Loader2 className="w-4 h-4 animate-spin text-[#9146FF]" />
              <span>
                {lang === 'es'
                  ? 'Cargando reparto y recomendaciones...'
                  : 'Loading cast & recommendations...'}
              </span>
            </div>
          )}

          {/* Cast Rail */}
          {details?.cast && details.cast.length > 0 && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="font-display font-semibold text-xs sm:text-sm text-zinc-200 flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-[#9146FF]" />
                  <span>{lang === 'es' ? 'Reparto Principal' : 'Top Cast'}</span>
                </h3>
                {details.directorOrCreator && (
                  <span className="text-xs text-zinc-400">
                    {isSeries ? 'Creada por ' : 'Dir. '}
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
                    className="w-[104px] sm:w-[116px] shrink-0 rounded-2xl bg-[#1F1F23] border border-white/[0.08] p-2 flex flex-col items-center text-center gap-1.5"
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
                      <div className="w-14 h-14 rounded-full bg-[#26262C] flex items-center justify-center text-xs font-bold text-zinc-300">
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
                {lang === 'es' ? 'Títulos Similares' : 'More Like This'}
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
                    className="group text-left rounded-2xl overflow-hidden bg-[#1F1F23] border border-white/[0.08] hover:border-[#9146FF]/50 transition-all cursor-pointer flex flex-col"
                  >
                    <div className="aspect-[2/3] w-full bg-[#26262C] overflow-hidden">
                      {sim.poster ? (
                        <img
                          src={sim.poster}
                          alt={sim.title}
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : null}
                    </div>
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

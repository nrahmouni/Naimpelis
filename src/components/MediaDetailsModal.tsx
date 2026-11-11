import React, { useEffect, useState } from 'react';
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
} from 'lucide-react';
import {
  AppLanguage,
  CatalogMovie,
  MediaRichDetails,
  RoomQueueItem,
} from '../types';
import { triggerHaptic } from '../utils/haptics';

interface MediaDetailsModalProps {
  item: CatalogMovie | null;
  lang: AppLanguage;
  isBookmarked: boolean;
  onClose: () => void;
  onPlayMovie: (movie: CatalogMovie, preferLang: 'ES' | 'EN') => void;
  onOpenSeriesEpisodes: (tmdbId: number) => void;
  onToggleBookmark: (movie: CatalogMovie) => void;
  onAddToQueue: (item: Omit<RoomQueueItem, 'id' | 'addedBy'>) => void;
  onSelectSimilar: (movie: CatalogMovie) => void;
}

export const MediaDetailsModal: React.FC<MediaDetailsModalProps> = ({
  item,
  lang,
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
  const [queuedFeedback, setQueuedFeedback] = useState(false);

  useEffect(() => {
    if (!item?.tmdbId) {
      setDetails(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setPlayTrailer(false);
    setQueuedFeedback(false);

    const mediaType = item.mediaType === 'tv' ? 'tv' : 'movie';
    fetch(`/api/catalog/details/${mediaType}/${item.tmdbId}?lang=${lang}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data?.success && data?.details) {
          setDetails(data.details);
          if (data.details.trailerKey) {
            setPlayTrailer(true);
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
  }, [item?.tmdbId, item?.mediaType, lang]);

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
  const title = details?.title || item.title;
  const year = details?.year || item.year;
  const rating = details?.rating || item.rating;
  const overview = details?.overview || item.overview;
  const backdrop = details?.backdrop || item.backdrop || item.poster;

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
        className="w-full sm:max-w-[860px] max-h-[92dvh] sm:max-h-[88dvh] rounded-t-3xl sm:rounded-3xl bg-[#0D0D12]/95 backdrop-blur-2xl border-t sm:border border-white/[0.1] shadow-[0_32px_110px_rgba(0,0,0,0.96)] flex flex-col overflow-hidden"
      >
        {/* Top Hero: Inline 4K Official Trailer or High-Res Backdrop */}
        <div className="relative w-full aspect-video max-h-[36dvh] sm:max-h-[380px] bg-black shrink-0 overflow-hidden">
          {playTrailer && details?.trailerKey ? (
            <iframe
              title={`${title} Trailer`}
              src={`https://www.youtube.com/embed/${details.trailerKey}?autoplay=1&rel=0&modestbranding=1&playsinline=1`}
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
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
              <div className="absolute inset-0 bg-gradient-to-t from-[#0D0D12] via-[#0D0D12]/40 to-black/30" />
            </>
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-[#121218]">
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
            {details?.trailerKey && (
              <button
                type="button"
                onClick={() => setPlayTrailer((v) => !v)}
                className="min-h-[36px] px-3 rounded-xl bg-black/75 hover:bg-black border border-white/20 text-xs font-semibold text-white flex items-center gap-1.5 backdrop-blur-md cursor-pointer transition-colors"
              >
                <Youtube className="w-3.5 h-3.5 text-[#E11D48]" />
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
              className="w-9 h-9 rounded-xl bg-black/75 hover:bg-[#E11D48] border border-white/20 flex items-center justify-center text-white backdrop-blur-md cursor-pointer transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Details Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
              <span className="font-semibold uppercase tracking-wider text-[#E11D48]">
                {isSeries
                  ? lang === 'es'
                    ? 'Serie TV'
                    : 'TV Series'
                  : lang === 'es'
                  ? 'Película HD'
                  : 'HD Movie'}
              </span>
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

            <h2 className="font-display font-bold text-xl sm:text-3xl text-white leading-tight">
              {title}
            </h2>

            {details?.tagline && (
              <p className="text-xs sm:text-sm italic text-zinc-400">
                “{details.tagline}”
              </p>
            )}

            {/* Action Buttons Row */}
            <div className="pt-1.5 flex flex-wrap items-center gap-2">
              {isSeries && item.tmdbId ? (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('success');
                    const id = item.tmdbId!;
                    onClose();
                    onOpenSeriesEpisodes(id);
                  }}
                  className="min-h-[44px] px-5 rounded-2xl bg-[#E11D48] hover:bg-[#BE123C] text-xs sm:text-sm font-semibold text-white flex items-center gap-2 cursor-pointer transition-colors shadow-lg shadow-[#E11D48]/25"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>
                    {lang === 'es' ? 'Elegir Temporada y Episodio' : 'Browse Episodes'}
                  </span>
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('success');
                      onClose();
                      onPlayMovie(item, 'ES');
                    }}
                    className="min-h-[44px] px-5 rounded-2xl bg-[#E11D48] hover:bg-[#BE123C] text-xs sm:text-sm font-semibold text-white flex items-center gap-2 cursor-pointer transition-colors shadow-lg shadow-[#E11D48]/25"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    <span>
                      {lang === 'es' ? 'Proyectar ahora (ES)' : 'Play Spanish HD'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('success');
                      onClose();
                      onPlayMovie(item, 'EN');
                    }}
                    className="min-h-[44px] px-4 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-xs sm:text-sm font-semibold text-white flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <Globe className="w-3.5 h-3.5 text-zinc-300" />
                    <span>VOSE 1080p</span>
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
                      subtitle: `${year || 'HD'} · Cine`,
                      poster: item.poster,
                      tmdbId: item.tmdbId,
                      url: item.bingetrixUrl || item.movidyUrl,
                      preferLang: 'ES',
                    });
                    setQueuedFeedback(true);
                    setTimeout(() => setQueuedFeedback(false), 1800);
                  }}
                  className="min-h-[44px] px-3.5 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-xs font-semibold text-zinc-200 flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  <span>
                    {queuedFeedback
                      ? lang === 'es'
                        ? 'En la cola ✓'
                        : 'Queued ✓'
                      : lang === 'es'
                      ? 'Añadir a Cola'
                      : 'Add to Queue'}
                  </span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  onToggleBookmark(item);
                }}
                className="min-h-[44px] px-3.5 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-xs font-semibold text-zinc-200 flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <Heart
                  className={`w-4 h-4 ${
                    isBookmarked ? 'fill-current text-[#E11D48]' : 'text-zinc-300'
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
              <Loader2 className="w-4 h-4 animate-spin text-[#E11D48]" />
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
                  <Users className="w-4 h-4 text-[#E11D48]" />
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
                    className="w-[104px] sm:w-[116px] shrink-0 rounded-2xl bg-[#14141B] border border-white/[0.06] p-2 flex flex-col items-center text-center gap-1.5"
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
                      <div className="w-14 h-14 rounded-full bg-[#1E1E28] flex items-center justify-center text-xs font-bold text-zinc-300">
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
                    className="group text-left rounded-2xl overflow-hidden bg-[#14141B] border border-white/[0.06] hover:border-white/25 transition-all cursor-pointer flex flex-col"
                  >
                    <div className="aspect-[2/3] w-full bg-[#1B1B24] overflow-hidden">
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

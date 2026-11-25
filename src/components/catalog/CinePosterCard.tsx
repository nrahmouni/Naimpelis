import React from 'react';
import type { CatalogMovie } from '../../types';
import { triggerHaptic } from '../../utils/haptics';
import { PosterImage } from '../ui/PosterImage';
import { RiffanBookmarkIcon } from '../ui/RiffanIcons';
import { CURATED_4K_TMDB_SET } from './catalogConstants';

export interface CinePosterCardProps {
  item: CatalogMovie;
  forcedKind?: 'movie' | 'tv';
  force4kGlow?: boolean;
  rankIndex?: number;
  subtitleOverride?: string;
  isBookmarked?: boolean;
  priority?: boolean;
  fallbackIcon?: React.ReactNode;
  onSelect: (item: CatalogMovie) => void;
  onToggleBookmark?: (item: CatalogMovie, e: React.MouseEvent) => void;
  className?: string;
}

export const CinePosterCard: React.FC<CinePosterCardProps> = ({
  item,
  forcedKind,
  force4kGlow = false,
  rankIndex,
  subtitleOverride,
  isBookmarked = false,
  priority = false,
  fallbackIcon,
  onSelect,
  onToggleBookmark,
  className = 'w-full',
}) => {
  const normalized: CatalogMovie = forcedKind ? { ...item, mediaType: forcedKind } : item;
  const is4kCard = Boolean(
    normalized.is4k ||
      force4kGlow ||
      (normalized.tmdbId && CURATED_4K_TMDB_SET.has(normalized.tmdbId))
  );

  const primaryMetaParts = [
    subtitleOverride || normalized.year || (normalized.seasonNumber ? `T${normalized.seasonNumber}` : ''),
    normalized.rating ? `★ ${normalized.rating}` : '',
    is4kCard ? '4K UHD' : '',
  ].filter(Boolean);

  return (
    <div className={`group relative flex flex-col gap-2 min-w-0 ${className}`}>
      <div className="relative">
        <button
          type="button"
          onClick={() => {
            triggerHaptic('light');
            onSelect(normalized);
          }}
          className="w-full text-left cursor-pointer active:scale-[0.98] transition-transform block focus:outline-none"
        >
          <div
            className={
              is4kCard
                ? 'relative aspect-[2/3] w-full card-4k-border-beam shadow-[0_12px_28px_rgba(0,0,0,0.55)]'
                : 'relative aspect-[2/3] w-full rounded-2xl overflow-hidden bg-[#0D0D12] border border-white/[0.08] group-hover:border-[#7C3AED]/65 shadow-[0_10px_24px_rgba(0,0,0,0.45)] group-hover:shadow-[0_14px_30px_rgba(124,58,237,0.22)] transition-all duration-200'
            }
          >
            <div className={is4kCard ? 'card-4k-inner' : 'w-full h-full'}>
              <PosterImage
                src={normalized.poster || normalized.backdrop}
                alt={normalized.title}
                aspect="poster"
                priority={priority}
                imgClassName="sm:group-hover:scale-105 transition-transform duration-300"
                fallbackTitle={normalized.title}
                fallbackIcon={fallbackIcon}
              />

              {/* Subtle bottom gradient for rank readability */}
              {typeof rankIndex === 'number' && (
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />
              )}

              {typeof rankIndex === 'number' && (
                <span className="pointer-events-none absolute bottom-2 left-2.5 font-display font-black text-3xl leading-none text-white drop-shadow-[0_3px_12px_rgba(0,0,0,0.95)] tabular-nums">
                  {rankIndex}
                </span>
              )}

              {is4kCard && (
                <span className="pointer-events-none absolute top-2 left-2 z-10 px-1.5 py-0.5 rounded-md bg-black/85 backdrop-blur-md border border-amber-400/75 text-[10px] font-black tracking-wider text-amber-300 shadow">
                  4K
                </span>
              )}
            </div>
          </div>

          <div className="px-0.5 pt-2 min-w-0">
            <h4 className="font-display font-bold text-xs sm:text-[13px] text-white leading-snug break-words group-hover:text-[#C4B5FD] transition-colors">
              {normalized.title}
            </h4>
            {primaryMetaParts.length > 0 && (
              <p className="text-[11px] text-zinc-400 mt-0.5 tabular-nums leading-snug">
                {primaryMetaParts.join(' · ')}
              </p>
            )}
          </div>
        </button>

        {onToggleBookmark && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              triggerHaptic('light');
              onToggleBookmark(normalized, e);
            }}
            aria-label={isBookmarked ? 'Quitar de guardados' : 'Guardar título'}
            className={`absolute top-2 right-2 z-20 w-9 h-9 rounded-xl backdrop-blur-md border flex items-center justify-center cursor-pointer active:scale-90 transition-all ${
              isBookmarked
                ? 'bg-[#7C3AED] border-[#7C3AED] text-white opacity-100 shadow-lg'
                : 'bg-black/75 border-white/20 text-white opacity-85 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 hover:bg-[#7C3AED]'
            }`}
          >
            <RiffanBookmarkIcon size={15} tone="current" active={isBookmarked} animate="none" />
          </button>
        )}
      </div>
    </div>
  );
};

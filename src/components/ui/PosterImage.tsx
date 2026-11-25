import React, { useEffect, useRef, useState } from 'react';
import { Film } from 'lucide-react';
import {
  buildBackdropSrcSet,
  buildPosterSrcSet,
  optimizeArtworkUrl,
} from '../../utils/imageUrl';

export interface PosterImageProps {
  src?: string | null;
  alt: string;
  aspect?: 'poster' | 'video' | 'square' | 'none';
  className?: string;
  imgClassName?: string;
  priority?: boolean;
  sizes?: string;
  width?: number;
  height?: number;
  fallbackTitle?: string;
  fallbackIcon?: React.ReactNode;
}

const ASPECT_CLASSES: Record<NonNullable<PosterImageProps['aspect']>, string> = {
  poster: 'aspect-[2/3]',
  video: 'aspect-video',
  square: 'aspect-square',
  none: '',
};

const INTRINSIC_DIMS: Record<
  NonNullable<PosterImageProps['aspect']>,
  { width: number; height: number }
> = {
  poster: { width: 342, height: 513 },
  video: { width: 780, height: 439 },
  square: { width: 300, height: 300 },
  none: { width: 342, height: 513 },
};

/**
 * Fixed-aspect progressive artwork frame preventing Cumulative Layout Shift (CLS = 0)
 * with responsive TMDB srcSet/sizes, async decoding, shimmer skeleton, and clean fallback.
 */
export const PosterImage: React.FC<PosterImageProps> = React.memo(({
  src,
  alt,
  aspect = 'poster',
  className = '',
  imgClassName = 'object-cover',
  priority = false,
  sizes,
  width,
  height,
  fallbackTitle,
  fallbackIcon,
}) => {
  const rawSrc = typeof src === 'string' ? src.trim() : '';
  const artworkKind = aspect === 'video' ? 'backdrop' : aspect === 'square' ? 'square' : 'poster';
  const cleanSrc = rawSrc ? optimizeArtworkUrl(rawSrc, artworkKind) : '';
  const srcSet =
    aspect === 'video' ? buildBackdropSrcSet(rawSrc) : buildPosterSrcSet(rawSrc);
  const resolvedSizes =
    sizes ||
    (aspect === 'video'
      ? '(max-width: 640px) 100vw, 640px'
      : '(max-width: 640px) 160px, 220px');
  const dims = INTRINSIC_DIMS[aspect];
  const resolvedWidth = width ?? dims.width;
  const resolvedHeight = height ?? dims.height;

  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>(
    cleanSrc ? 'loading' : 'error'
  );
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!cleanSrc) {
      setStatus((prev) => (prev === 'error' ? prev : 'error'));
      return;
    }
    const el = imgRef.current;
    if (el && el.complete && el.naturalWidth > 0) {
      setStatus((prev) => (prev === 'loaded' ? prev : 'loaded'));
    } else {
      setStatus((prev) => (prev === 'loading' ? prev : 'loading'));
    }
  }, [cleanSrc]);

  return (
    <div
      className={`relative overflow-hidden bg-[#141418] ${ASPECT_CLASSES[aspect]} ${className}`}
    >
      {status === 'loading' && (
        <div
          aria-hidden="true"
          className="absolute inset-0 skeleton-shimmer bg-[#1A1A22]"
        />
      )}

      {cleanSrc && status !== 'error' ? (
        <img
          ref={imgRef}
          src={cleanSrc}
          srcSet={srcSet}
          sizes={srcSet ? resolvedSizes : undefined}
          width={resolvedWidth}
          height={resolvedHeight}
          alt={alt}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          fetchPriority={priority ? 'high' : 'low'}
          referrerPolicy="no-referrer"
          onLoad={() => setStatus((prev) => (prev === 'loaded' ? prev : 'loaded'))}
          onError={() => setStatus((prev) => (prev === 'error' ? prev : 'error'))}
          className={`w-full h-full transition-opacity duration-300 ease-out ${imgClassName} ${
            status === 'loaded' ? 'opacity-100' : 'opacity-0'
          }`}
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-3 text-center bg-gradient-to-br from-[#191923] via-[#13131A] to-[#0D0D12] text-zinc-400">
          <div className="w-9 h-9 rounded-xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center mb-1.5 text-zinc-400">
            {fallbackIcon ?? <Film className="w-4 h-4" />}
          </div>
          {fallbackTitle && (
            <span className="text-[11px] font-semibold text-zinc-300 line-clamp-2 leading-snug">
              {fallbackTitle}
            </span>
          )}
        </div>
      )}
    </div>
  );
});
PosterImage.displayName = 'PosterImage';

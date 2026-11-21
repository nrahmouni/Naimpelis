import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface HorizontalRailProps {
  title?: string;
  rightSlot?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  compact?: boolean;
  gapClassName?: string;
}

/**
 * Scrollbar-free, hardware-accelerated horizontal rail with dynamic edge-fade masks
 * and crisp desktop chevron navigation controls.
 */
export const HorizontalRail: React.FC<HorizontalRailProps> = ({
  title,
  rightSlot,
  children,
  className = '',
  compact = false,
  gapClassName = 'gap-3 sm:gap-4',
}) => {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const syncScrollState = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    setCanLeft(el.scrollLeft > 8);
    setCanRight(maxScroll - el.scrollLeft > 8);
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    syncScrollState();

    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(syncScrollState) : null;
    ro?.observe(el);
    window.addEventListener('resize', syncScrollState);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', syncScrollState);
    };
  }, [syncScrollState, children]);

  const scrollStep = useCallback((dir: -1 | 1) => {
    const el = scrollerRef.current;
    if (!el) return;
    const amount = Math.max(220, Math.round(el.clientWidth * 0.78));
    el.scrollBy({ left: dir * amount, behavior: 'smooth' });
  }, []);

  const maskGradient =
    canLeft && canRight
      ? 'linear-gradient(to right, transparent 0px, black 24px, black calc(100% - 28px), transparent 100%)'
      : canRight
      ? 'linear-gradient(to right, black 0px, black calc(100% - 28px), transparent 100%)'
      : canLeft
      ? 'linear-gradient(to right, transparent 0px, black 24px, black 100%)'
      : undefined;

  const railEl = (
    <div className={`relative group/rail ${compact ? className : ''}`}>
      {compact && canLeft && (
        <button
          type="button"
          onClick={() => scrollStep(-1)}
          aria-label="Anterior"
          className="hidden sm:flex absolute left-0 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-[#0C0C0F]/92 hover:bg-[#3B82F6]/25 border border-white/15 hover:border-[#60A5FA]/50 text-zinc-200 hover:text-white items-center justify-center shadow-lg backdrop-blur-md cursor-pointer transition-all"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      )}

      <div
        ref={scrollerRef}
        onScroll={syncScrollState}
        style={
          maskGradient
            ? { maskImage: maskGradient, WebkitMaskImage: maskGradient }
            : undefined
        }
        className={`flex items-center ${gapClassName} overflow-x-auto no-scrollbar scroll-smooth snap-x py-0.5`}
      >
        {children}
      </div>

      {compact && canRight && (
        <button
          type="button"
          onClick={() => scrollStep(1)}
          aria-label="Siguiente"
          className="hidden sm:flex absolute right-0 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-[#0C0C0F]/92 hover:bg-[#3B82F6]/25 border border-white/15 hover:border-[#60A5FA]/50 text-zinc-200 hover:text-white items-center justify-center shadow-lg backdrop-blur-md cursor-pointer transition-all"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      )}
    </div>
  );

  if (compact) return railEl;

  return (
    <section className={`space-y-3 ${className}`}>
      {(title || rightSlot || canLeft || canRight) && (
        <div className="flex items-center justify-between gap-3">
          {title ? (
            <h2 className="font-display text-lg sm:text-xl font-bold text-white tracking-tight">
              {title}
            </h2>
          ) : (
            <span />
          )}

          <div className="flex items-center gap-2 shrink-0">
            {rightSlot}
            {(canLeft || canRight) && (
              <div className="hidden sm:flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => scrollStep(-1)}
                  disabled={!canLeft}
                  aria-label="Desplazar izquierda"
                  className="w-8 h-8 rounded-full bg-white/[0.06] hover:bg-[#3B82F6]/20 border border-white/[0.08] hover:border-[#60A5FA]/45 text-zinc-200 hover:text-white disabled:opacity-25 disabled:pointer-events-none flex items-center justify-center transition-all cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => scrollStep(1)}
                  disabled={!canRight}
                  aria-label="Desplazar derecha"
                  className="w-8 h-8 rounded-full bg-white/[0.06] hover:bg-[#3B82F6]/20 border border-white/[0.08] hover:border-[#60A5FA]/45 text-zinc-200 hover:text-white disabled:opacity-25 disabled:pointer-events-none flex items-center justify-center transition-all cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {railEl}
    </section>
  );
};

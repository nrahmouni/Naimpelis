import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

export interface VirtualizedPosterGridProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  getKey?: (item: T, index: number) => string | number;
  /** Responsive column breakpoint override */
  variant?: 'poster' | 'wide' | 'list';
  gapPx?: number;
  estimateRowHeight?: number;
  overscan?: number;
  className?: string;
}

function findScrollParent(el: HTMLElement | null): HTMLElement | null {
  let node: HTMLElement | null = el?.parentElement || null;
  while (node) {
    const style = window.getComputedStyle(node);
    const overflowY = style.overflowY;
    if (overflowY === 'auto' || overflowY === 'scroll') {
      return node;
    }
    node = node.parentElement;
  }
  return document.documentElement;
}

function getColumnCount(width: number, variant: 'poster' | 'wide' | 'list'): number {
  if (variant === 'list') return 1;
  if (variant === 'wide') {
    if (width >= 1150) return 3;
    if (width >= 640) return 2;
    return 1;
  }
  // Poster cards: 2 cols mobile -> 3 sm -> 4 md -> 5 lg -> 6 wide desktop
  if (width >= 1400) return 6;
  if (width >= 1024) return 5;
  if (width >= 768) return 4;
  if (width >= 520) return 3;
  return 2;
}

/**
 * 60fps virtualized grid/list backed by @tanstack/react-virtual.
 * Automatically binds to the nearest scrollable ancestor container (desktop main pane,
 * mobile catalog scroller, or modal body) and dynamically adapts column counts.
 */
export function VirtualizedPosterGrid<T>({
  items,
  renderItem,
  getKey,
  variant = 'poster',
  gapPx = 14,
  estimateRowHeight,
  overscan = 3,
  className = '',
}: VirtualizedPosterGridProps<T>) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scrollEl, setScrollEl] = useState<HTMLElement | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(() =>
    typeof window !== 'undefined' ? Math.min(window.innerWidth, 1280) : 960
  );
  const [scrollMargin, setScrollMargin] = useState(0);

  const columns = useMemo(
    () => getColumnCount(containerWidth, variant),
    [containerWidth, variant]
  );

  // Measure responsive width & scroll margin relative to scrollable parent
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const parent = findScrollParent(el);
    setScrollEl(parent);

    const updateMetrics = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      setContainerWidth(rect.width || containerRef.current.clientWidth || 360);

      if (parent && parent !== document.documentElement) {
        const parentRect = parent.getBoundingClientRect();
        const nextMargin = Math.max(0, Math.round(rect.top - parentRect.top + parent.scrollTop));
        setScrollMargin(nextMargin);
      } else {
        setScrollMargin(Math.max(0, Math.round(rect.top + window.scrollY)));
      }
    };

    updateMetrics();

    const ro = new ResizeObserver(() => updateMetrics());
    ro.observe(el);
    if (parent && parent !== document.documentElement) {
      ro.observe(parent);
      parent.addEventListener('scroll', updateMetrics, { passive: true });
    }
    window.addEventListener('resize', updateMetrics);

    return () => {
      ro.disconnect();
      if (parent && parent !== document.documentElement) {
        parent.removeEventListener('scroll', updateMetrics);
      }
      window.removeEventListener('resize', updateMetrics);
    };
  }, [items.length, columns]);

  const rows = useMemo(() => {
    const chunked: T[][] = [];
    for (let i = 0; i < items.length; i += columns) {
      chunked.push(items.slice(i, i + columns));
    }
    return chunked;
  }, [items, columns]);

  const defaultRowHeight = useMemo(() => {
    if (estimateRowHeight) return estimateRowHeight;
    if (variant === 'list') return 112;
    const colWidth = Math.max(120, (containerWidth - gapPx * (columns - 1)) / columns);
    if (variant === 'wide') {
      return Math.round(colWidth * (9 / 16) + 92);
    }
    return Math.round(colWidth * 1.5 + 68);
  }, [estimateRowHeight, variant, containerWidth, gapPx, columns]);

  // eslint-disable-next-line react-hooks/incompatible-library
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollEl,
    estimateSize: () => defaultRowHeight + gapPx,
    overscan,
    scrollMargin,
  });

  // Render cleanly in natural document flow CSS Grid up to 400 items so sticky desktop players never shift virtual hitboxes
  if (items.length <= 400 || !scrollEl) {
    return (
      <div
        ref={containerRef}
        className={className}
        style={{
          display: 'grid',
          gridTemplateColumns:
            variant === 'list' ? 'minmax(0, 1fr)' : `repeat(${columns}, minmax(0, 1fr))`,
          gap: `${gapPx}px`,
        }}
      >
        {items.map((item, idx) => (
          <div
            key={getKey ? getKey(item, idx) : idx}
            className="min-w-0"
            style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 260px' }}
          >
            {renderItem(item, idx)}
          </div>
        ))}
      </div>
    );
  }

  const virtualRows = rowVirtualizer.getVirtualItems();
  const totalHeight = rowVirtualizer.getTotalSize();

  return (
    <div ref={containerRef} className={`relative w-full ${className}`} style={{ height: `${totalHeight}px` }}>
      {virtualRows.map((vRow) => {
        const rowItems = rows[vRow.index] || [];
        const baseIndex = vRow.index * columns;
        return (
          <div
            key={vRow.key}
            data-index={vRow.index}
            ref={rowVirtualizer.measureElement}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${vRow.start - scrollMargin}px)`,
              paddingBottom: `${gapPx}px`,
              display: 'grid',
              gridTemplateColumns:
                variant === 'list' ? 'minmax(0, 1fr)' : `repeat(${columns}, minmax(0, 1fr))`,
              gap: `${gapPx}px`,
            }}
          >
            {rowItems.map((item, offset) => {
              const absoluteIdx = baseIndex + offset;
              return (
                <div key={getKey ? getKey(item, absoluteIdx) : absoluteIdx} className="min-w-0">
                  {renderItem(item, absoluteIdx)}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

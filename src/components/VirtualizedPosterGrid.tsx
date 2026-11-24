import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

export function getColumnCount(width: number, variant: 'poster' | 'wide' | 'list'): number {
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

interface VirtualizedRowsLayerProps<T> {
  containerRef: React.RefObject<HTMLDivElement | null>;
  scrollEl: HTMLElement;
  rows: T[][];
  columns: number;
  variant: 'poster' | 'wide' | 'list';
  gapPx: number;
  defaultRowHeight: number;
  overscan: number;
  scrollMargin: number;
  className: string;
  renderItem: (item: T, index: number) => React.ReactNode;
  getKey?: (item: T, index: number) => string | number;
}

function VirtualizedRowsLayer<T>({
  containerRef,
  scrollEl,
  rows,
  columns,
  variant,
  gapPx,
  defaultRowHeight,
  overscan,
  scrollMargin,
  className,
  renderItem,
  getKey,
}: VirtualizedRowsLayerProps<T>) {
  const getScrollElement = useCallback(() => scrollEl, [scrollEl]);
  const estimateSize = useCallback(() => defaultRowHeight + gapPx, [defaultRowHeight, gapPx]);

  // eslint-disable-next-line react-hooks/incompatible-library
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement,
    estimateSize,
    overscan,
    scrollMargin,
  });

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

/**
 * 60fps virtualized grid/list backed by @tanstack/react-virtual.
 * Mounts the virtualizer ONLY when items exceed 400 and a scroll container exists,
 * and filters ResizeObserver events strictly by width/scroll-margin tolerance (>= 2px)
 * so virtual container height changes never create feedback loops on mobile WebViews.
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
    setScrollEl((prev) => (prev === parent ? prev : parent));

    let rafId: number | null = null;
    const lastMeasuredWidthRef = { current: -1 };
    const lastParentWidthRef = { current: -1 };
    const lastScrollMarginRef = { current: -1 };

    const updateMetrics = () => {
      rafId = null;
      const node = containerRef.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      const rawWidth = Math.round(rect.width || node.clientWidth || 360);
      if (lastMeasuredWidthRef.current < 0 || Math.abs(rawWidth - lastMeasuredWidthRef.current) >= 2) {
        lastMeasuredWidthRef.current = rawWidth;
        setContainerWidth((prev) => (Math.abs(prev - rawWidth) < 2 ? prev : rawWidth));
      }

      if (parent && parent !== document.documentElement) {
        const parentRect = parent.getBoundingClientRect();
        lastParentWidthRef.current = Math.round(parentRect.width || parent.clientWidth || 0);
        const nextMargin = Math.max(
          0,
          Math.round(rect.top - parentRect.top + parent.scrollTop)
        );
        if (lastScrollMarginRef.current < 0 || Math.abs(nextMargin - lastScrollMarginRef.current) >= 2) {
          lastScrollMarginRef.current = nextMargin;
          setScrollMargin((prev) => (Math.abs(prev - nextMargin) < 2 ? prev : nextMargin));
        }
      } else {
        const nextMargin = Math.max(0, Math.round(rect.top + window.scrollY));
        if (lastScrollMarginRef.current < 0 || Math.abs(nextMargin - lastScrollMarginRef.current) >= 2) {
          lastScrollMarginRef.current = nextMargin;
          setScrollMargin((prev) => (Math.abs(prev - nextMargin) < 2 ? prev : nextMargin));
        }
      }
    };

    const scheduleMetrics = () => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(updateMetrics);
    };

    updateMetrics();

    const ro = new ResizeObserver((entries) => {
      let shouldUpdate = false;
      for (const entry of entries) {
        if (entry.target === el) {
          const w = Math.round(entry.contentRect.width);
          if (Math.abs(w - lastMeasuredWidthRef.current) >= 2) {
            shouldUpdate = true;
            break;
          }
        } else if (entry.target === parent) {
          const pw = Math.round(entry.contentRect.width);
          if (Math.abs(pw - lastParentWidthRef.current) >= 2) {
            shouldUpdate = true;
            break;
          }
        }
      }
      if (shouldUpdate) {
        scheduleMetrics();
      }
    });
    ro.observe(el);
    if (parent && parent !== document.documentElement) {
      ro.observe(parent);
    }
    window.addEventListener('resize', scheduleMetrics);

    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      ro.disconnect();
      window.removeEventListener('resize', scheduleMetrics);
    };
  }, []);

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

  return (
    <VirtualizedRowsLayer
      containerRef={containerRef}
      scrollEl={scrollEl}
      rows={rows}
      columns={columns}
      variant={variant}
      gapPx={gapPx}
      defaultRowHeight={defaultRowHeight}
      overscan={overscan}
      scrollMargin={scrollMargin}
      className={className}
      renderItem={renderItem}
      getKey={getKey}
    />
  );
}

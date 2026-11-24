// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/App';
import { VirtualizedPosterGrid } from '../../src/components/VirtualizedPosterGrid';
import { useAppStore } from '../../src/store/useAppStore';
import {
  getCircleFlagCdnUrl,
  getDiceBearAvatarUrl,
  getPlayingCardSvgUrl,
  resolveGameAssetUrl,
} from '../../src/shared/gameAssetsCdn';
import { benchmarkBatchThroughput, getHeapUsedMb } from './perfHarness';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

class MockResizeObserver {
  private cb: ResizeObserverCallback;
  private observed = new Set<Element>();
  constructor(cb: ResizeObserverCallback) {
    this.cb = cb;
  }
  observe(target: Element) {
    if (this.observed.has(target)) return;
    this.observed.add(target);
    queueMicrotask(() => {
      if (!this.observed.has(target)) return;
      const isRow = target instanceof Element && target.hasAttribute('data-index');
      const h = isRow ? 296 : 640;
      this.cb(
        [
          {
            target,
            contentRect: {
              width: 1024,
              height: h,
              top: 0,
              left: 0,
              bottom: h,
              right: 1024,
              x: 0,
              y: 0,
              toJSON: () => ({}),
            } as DOMRectReadOnly,
            borderBoxSize: [{ blockSize: h, inlineSize: 1024 }] as unknown as ReadonlyArray<ResizeObserverSize>,
            contentBoxSize: [{ blockSize: h, inlineSize: 1024 }] as unknown as ReadonlyArray<ResizeObserverSize>,
            devicePixelContentBoxSize: [],
          },
        ],
        this as unknown as ResizeObserver
      );
    });
  }
  unobserve(target: Element) {
    this.observed.delete(target);
  }
  disconnect() {
    this.observed.clear();
  }
}

class MockIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

class MockWebSocket {
  static OPEN = 1;
  readyState = 1;
  onopen: ((ev: Event) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  send() {}
  close() {}
  addEventListener() {}
  removeEventListener() {}
}

describe('Performance & Speed — Frontend React Boot, Portal Switching, Virtualization & Stores', () => {
  const roots: Array<{ root: Root; el: HTMLElement }> = [];

  beforeEach(() => {
    (globalThis as Record<string, unknown>).WebSocket = MockWebSocket;
    (globalThis as Record<string, unknown>).ResizeObserver = MockResizeObserver;
    (globalThis as Record<string, unknown>).IntersectionObserver = MockIntersectionObserver;
    Object.defineProperty(window, 'innerWidth', { value: 1280, writable: true, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 720, writable: true, configurable: true });
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    Element.prototype.scrollTo = vi.fn();
    Element.prototype.scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      get(this: HTMLElement) {
        return this?.hasAttribute?.('data-index') ? 296 : 640;
      },
    });
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
      configurable: true,
      get() {
        return 1024;
      },
    });
    HTMLElement.prototype.getBoundingClientRect = vi.fn(function (this: HTMLElement) {
      const isRow = Boolean(this?.hasAttribute?.('data-index'));
      const h = isRow ? 296 : 640;
      return {
        width: 1024,
        height: h,
        top: 0,
        left: 0,
        right: 1024,
        bottom: h,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect;
    });

    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      const s = String(url);
      if (s.includes('/api/catalog/movies') || s.includes('/api/catalog/bingetrix')) {
        return new Response(
          JSON.stringify({
            movies: Array.from({ length: 24 }, (_, i) => ({
              id: `m-${i}`,
              tmdbId: 1000 + i,
              title: `Perf Movie ${i}`,
              poster: `https://example.com/p${i}.jpg`,
              backdrop: `https://example.com/b${i}.jpg`,
              year: '2026',
              rating: '8.5',
              overview: 'Benchmark movie',
              languages: ['ES'],
            })),
            hasMore: false,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (s.includes('/api/catalog/series')) {
        return new Response(JSON.stringify({ series: [], hasMore: false }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (s.includes('/api/catalog/catala')) {
        return new Response(JSON.stringify({ items: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (s.includes('/api/catalog/latest-releases')) {
        return new Response(JSON.stringify({ cinemaReleases: [], newSeasons: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (s.includes('/api/catalog/collections')) {
        return new Response(JSON.stringify({ collections: [], genres: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (s.includes('/api/catalog/tdt') || s.includes('/api/catalog/world-tv')) {
        return new Response(JSON.stringify({ channels: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (s.includes('/api/epg/live')) {
        return new Response(JSON.stringify({ epg: {} }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as unknown as typeof fetch;

    useAppStore.setState({
      sessionMode: 'solo',
      hasEnteredApp: true,
      activeWorld: 'cine',
      cineTab: 'movies',
      cineSpecialPortal: 'none',
    });
  });

  afterEach(async () => {
    while (roots.length > 0) {
      const item = roots.pop()!;
      await act(async () => {
        item.root.unmount();
      });
      item.el.remove();
    }
    vi.restoreAllMocks();
    window.history.replaceState({}, '', '/');
  });

  it('boots full React App quickly and switches across all worlds (cine/futbol/musica/kids/juegos) without runaway allocations', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const div = document.createElement('div');
    document.body.appendChild(div);
    const root = createRoot(div);
    roots.push({ root, el: div });

    const tBoot0 = performance.now();
    await act(async () => {
      root.render(
        <QueryClientProvider client={qc}>
          <App />
        </QueryClientProvider>
      );
    });
    const coldBootMs = performance.now() - tBoot0;
    console.info(`[PERF FRONTEND] Cold App boot render=${coldBootMs.toFixed(2)}ms`);
    expect(coldBootMs).toBeLessThan(2500);

    const worlds = ['futbol', 'musica', 'kids', 'juegos', 'cine'] as const;
    const heapBefore = getHeapUsedMb();
    const switchTimes: number[] = [];

    for (const w of worlds) {
      const ts0 = performance.now();
      await act(async () => {
        useAppStore.getState().setActiveWorld(w);
      });
      switchTimes.push(performance.now() - ts0);
    }

    const avgSwitchMs = switchTimes.reduce((a, b) => a + b, 0) / switchTimes.length;
    const maxSwitchMs = Math.max(...switchTimes);
    const heapDelta = Number((getHeapUsedMb() - heapBefore).toFixed(2));
    console.info(
      `[PERF FRONTEND] World switches (${worlds.join('->')}) | avg=${avgSwitchMs.toFixed(2)}ms | max=${maxSwitchMs.toFixed(2)}ms | heapDelta=${heapDelta}MB`
    );

    expect(maxSwitchMs).toBeLessThan(1500);
    expect(heapDelta).toBeLessThan(85);
  });

  it('keeps VirtualizedPosterGrid of 2,000 items windowed in DOM during rapid scroll sweeps', async () => {
    const scroller = document.createElement('div');
    scroller.style.overflowY = 'auto';
    scroller.style.height = '640px';
    Object.defineProperty(scroller, 'clientHeight', { value: 640, configurable: true });
    Object.defineProperty(scroller, 'clientWidth', { value: 1024, configurable: true });
    document.body.appendChild(scroller);

    const mountPoint = document.createElement('div');
    scroller.appendChild(mountPoint);
    const root = createRoot(mountPoint);
    roots.push({ root, el: scroller });

    const items = Array.from({ length: 2000 }, (_, i) => ({
      id: `poster-${i}`,
      title: `Film #${i}`,
    }));

    const tMount0 = performance.now();
    await act(async () => {
      root.render(
        <VirtualizedPosterGrid
          items={items}
          variant="poster"
          estimateRowHeight={280}
          gapPx={16}
          overscan={2}
          getKey={(it) => it.id}
          renderItem={(it) => (
            <div data-testid="perf-poster-card" style={{ height: 280 }}>
              {it.title}
            </div>
          )}
        />
      );
    });
    const initialMountMs = performance.now() - tMount0;
    const renderedInitially = scroller.querySelectorAll('[data-testid="perf-poster-card"]').length;
    expect(renderedInitially).toBeGreaterThan(0);
    expect(renderedInitially).toBeLessThan(120);

    const sweepStart = performance.now();
    for (let step = 0; step < 30; step += 1) {
      await act(async () => {
        scroller.scrollTop = step * 1800;
        scroller.dispatchEvent(new Event('scroll'));
      });
    }
    const sweepMs = performance.now() - sweepStart;
    const renderedAfterSweep = scroller.querySelectorAll('[data-testid="perf-poster-card"]').length;
    console.info(
      `[PERF VIRTUALIZER] 2,000 items | mount=${initialMountMs.toFixed(2)}ms | 30 scroll sweeps=${sweepMs.toFixed(2)}ms | mountedNodes=${renderedAfterSweep}/2000`
    );

    expect(renderedAfterSweep).toBeLessThan(120);
    expect(sweepMs).toBeLessThan(1500);
  });

  it('resolves Game Asset CDN, Flags, Cards & Avatars and updates Zustand store at high speed', () => {
    const assetPaths = [
      'models/ferrari.glb',
      'models/RobotExpressive.glb',
      'pbr/asphalt_diff.jpg',
      'sports/ball_soccer1.png',
      'particles/star_07.png',
      'explosion/groundExplosion02.png',
      'toon/male_kick.png',
    ];

    const cdnBench = benchmarkBatchThroughput('GameAssetsCDN + Flags + Cards + Avatars (20,000 ops)', 20_000, () => {
      for (let i = 0; i < 20_000; i += 1) {
        resolveGameAssetUrl(assetPaths[i % assetPaths.length]);
        if ((i & 3) === 0) {
          getCircleFlagCdnUrl(i % 2 === 0 ? 'spain' : 'argentina');
          getPlayingCardSvgUrl(i % 2 === 0 ? 'A' : 'K', 'spades');
          getDiceBearAvatarUrl(`player-${i % 20}`);
        }
      }
    });
    expect(cdnBench.opsPerSec).toBeGreaterThan(100_000);

    const storeBench = benchmarkBatchThroughput('Zustand useAppStore state reads/updates (10,000 ops)', 10_000, () => {
      for (let i = 0; i < 10_000; i += 1) {
        useAppStore.getState();
        if (i % 100 === 0) {
          useAppStore.setState({ cineTab: i % 200 === 0 ? 'series' : 'movies' });
        }
      }
    });
    expect(storeBench.totalMs).toBeLessThan(300);
  });
});

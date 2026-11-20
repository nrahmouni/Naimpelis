// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { AppErrorBoundary } from '../src/components/AppErrorBoundary';
import { VirtualizedPosterGrid } from '../src/components/VirtualizedPosterGrid';
import { useAppStore } from '../src/store/useAppStore';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

class MobileChromeResizeObserver {
  private cb: ResizeObserverCallback;
  private targets = new Set<Element>();
  constructor(cb: ResizeObserverCallback) {
    this.cb = cb;
  }
  observe(target: Element) {
    this.targets.add(target);
    // Simulate realistic Android Chrome mobile iframe resize callbacks including subpixel jitter
    this.cb(
      [
        {
          target,
          contentRect: {
            width: 390.4,
            height: 700,
            top: 0,
            left: 0,
            bottom: 700,
            right: 390.4,
            x: 0,
            y: 0,
            toJSON: () => ({}),
          } as DOMRectReadOnly,
          borderBoxSize: [],
          contentBoxSize: [],
          devicePixelContentBoxSize: [],
        },
      ],
      this as unknown as ResizeObserver
    );
  }
  triggerHeightChangeOnly(target: Element, nextHeight: number) {
    if (!this.targets.has(target)) return;
    this.cb(
      [
        {
          target,
          contentRect: {
            width: 390.6,
            height: nextHeight,
            top: 0,
            left: 0,
            bottom: nextHeight,
            right: 390.6,
            x: 0,
            y: 0,
            toJSON: () => ({}),
          } as DOMRectReadOnly,
          borderBoxSize: [],
          contentBoxSize: [],
          devicePixelContentBoxSize: [],
        },
      ],
      this as unknown as ResizeObserver
    );
  }
  unobserve(target: Element) {
    this.targets.delete(target);
  }
  disconnect() {
    this.targets.clear();
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

describe('Cine Maximum update depth reproduction & stability', () => {
  beforeEach(() => {
    (globalThis as Record<string, unknown>).WebSocket = MockWebSocket;
    (globalThis as Record<string, unknown>).ResizeObserver = MobileChromeResizeObserver;
    (globalThis as Record<string, unknown>).IntersectionObserver = MockIntersectionObserver;
    Object.defineProperty(window, 'innerWidth', { value: 390, writable: true, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 780, writable: true, configurable: true });
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('coarse') || query.includes('none'),
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
    HTMLElement.prototype.getBoundingClientRect = vi.fn(
      () =>
        ({
          width: 390,
          height: 600,
          top: 64,
          left: 0,
          right: 390,
          bottom: 664,
          x: 0,
          y: 64,
          toJSON: () => ({}),
        }) as DOMRect
    );

    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      const s = String(url);
      if (s.includes('/api/catalog/movies') || s.includes('/api/catalog/bingetrix')) {
        return new Response(
          JSON.stringify({
            movies: Array.from({ length: 12 }, (_, i) => ({
              id: `m${i}`,
              tmdbId: 100 + i,
              title: `Test Movie ${i}`,
              poster: `https://example.com/p${i}.jpg`,
              backdrop: `https://example.com/b${i}.jpg`,
              year: '2025',
              rating: '8.1',
              overview: 'Test',
              languages: ['ES'],
            })),
            hasMore: false,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (s.includes('/api/catalog/series')) {
        return new Response(
          JSON.stringify({
            series: Array.from({ length: 12 }, (_, i) => ({
              id: `s${i}`,
              tmdbId: 200 + i,
              title: `Test Series ${i}`,
              poster: `https://example.com/s${i}.jpg`,
              backdrop: `https://example.com/sb${i}.jpg`,
              year: '2025',
              rating: '8.4',
              overview: 'Test series',
              languages: ['ES'],
            })),
            hasMore: false,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (s.includes('/api/catalog/catala')) {
        return new Response(
          JSON.stringify({
            items: Array.from({ length: 450 }, (_, i) => ({
              id: `cat-${i}`,
              title: `Catala Anime ${i}`,
              poster: `https://example.com/c${i}.jpg`,
              episodeHint: '12 eps',
            })),
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (s.includes('/api/catalog/latest-releases')) {
        return new Response(
          JSON.stringify({ cinemaReleases: [], newSeasons: [] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (s.includes('/api/catalog/collections')) {
        return new Response(
          JSON.stringify({ collections: [], genres: [] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (s.includes('/api/catalog/tdt') || s.includes('/api/catalog/world-tv')) {
        return new Response(
          JSON.stringify({ channels: [] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (s.includes('/api/epg/live')) {
        return new Response(
          JSON.stringify({ epg: {} }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    useAppStore.setState({
      sessionMode: 'solo',
      hasEnteredApp: true,
      activeWorld: 'cine',
      cineTab: 'movies',
      cineSpecialPortal: 'none',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState({}, '', '/');
  });

  it('mounts App into Cine world, handles resize bursts & switches tabs/portals without Maximum update depth exceeded', async () => {
    const errors: string[] = [];
    const origErr = console.error;
    console.error = (...args: unknown[]) => {
      errors.push(args.map((a) => String(a)).join(' '));
      origErr(...args);
    };

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const div = document.createElement('div');
    document.body.appendChild(div);
    const root = createRoot(div);

    await act(async () => {
      root.render(
        <QueryClientProvider client={qc}>
          <App />
        </QueryClientProvider>
      );
    });

    await act(async () => {
      for (let i = 0; i < 6; i += 1) {
        window.dispatchEvent(new Event('resize'));
      }
      await new Promise((r) => setTimeout(r, 180));
    });

    // Switch movies -> series -> catala (>400 items) -> back to movies
    await act(async () => {
      useAppStore.setState({ cineTab: 'series' });
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 120));
    });

    await act(async () => {
      useAppStore.setState({ cineSpecialPortal: 'catala' });
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 180));
    });

    await act(async () => {
      useAppStore.setState({ cineSpecialPortal: 'none', cineTab: 'movies' });
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 120));
    });

    console.error = origErr;
    const text = div.textContent || '';
    root.unmount();
    div.remove();

    expect(text).not.toContain('Maximum update depth exceeded');
    expect(errors.join('\n')).not.toContain('Maximum update depth exceeded');
  });

  it('handles /futbol deep link cleanly without infinite resolveAndApplyRoute loop', async () => {
    const errors: string[] = [];
    const origErr = console.error;
    console.error = (...args: unknown[]) => {
      errors.push(args.map((a) => String(a)).join(' '));
      origErr(...args);
    };
    window.history.replaceState({}, '', '/futbol');

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const div = document.createElement('div');
    document.body.appendChild(div);
    const root = createRoot(div);

    await act(async () => {
      root.render(
        <QueryClientProvider client={qc}>
          <App />
        </QueryClientProvider>
      );
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 180));
    });

    console.error = origErr;
    root.unmount();
    div.remove();
    expect(errors.join('\n')).not.toContain('Maximum update depth exceeded');
  });

  it('mounts VirtualizedPosterGrid with > 400 items inside overflow-y-auto scroller with height-feedback resilience', async () => {
    const errors: string[] = [];
    const origErr = console.error;
    console.error = (...args: unknown[]) => {
      errors.push(args.map((a) => String(a)).join(' '));
      origErr(...args);
    };

    const instances: MobileChromeResizeObserver[] = [];
    (globalThis as Record<string, unknown>).ResizeObserver = class extends MobileChromeResizeObserver {
      constructor(cb: ResizeObserverCallback) {
        super(cb);
        instances.push(this);
      }
    };

    const scrollParent = document.createElement('div');
    scrollParent.style.overflowY = 'auto';
    scrollParent.style.height = '600px';
    Object.defineProperty(scrollParent, 'clientHeight', { value: 600, configurable: true });
    Object.defineProperty(scrollParent, 'clientWidth', { value: 390, configurable: true });
    const host = document.createElement('div');
    scrollParent.appendChild(host);
    document.body.appendChild(scrollParent);

    const items = Array.from({ length: 450 }, (_, i) => ({ id: i, title: `Item ${i}` }));
    const root = createRoot(host);

    await act(async () => {
      root.render(
        <VirtualizedPosterGrid
          items={items}
          getKey={(it) => it.id}
          renderItem={(it) => <div>{it.title}</div>}
        />
      );
    });

    await act(async () => {
      for (const ro of instances) {
        ro.triggerHeightChangeOnly(scrollParent, 2400);
        ro.triggerHeightChangeOnly(scrollParent, 2550);
      }
      await new Promise((r) => setTimeout(r, 150));
    });

    console.error = origErr;
    root.unmount();
    scrollParent.remove();

    expect(errors.join('\n')).not.toContain('Maximum update depth exceeded');
  });

  it('recovers AppErrorBoundary automatically when resetKey changes', async () => {
    const origErr = console.error;
    console.error = vi.fn();

    const ThrowInCine: React.FC<{ world: string }> = ({ world }) => {
      if (world === 'cine') {
        throw new Error('Synthetic loop test');
      }
      return <div>Healthy {world}</div>;
    };

    const div = document.createElement('div');
    document.body.appendChild(div);
    const root = createRoot(div);

    await act(async () => {
      root.render(
        <AppErrorBoundary resetKey="cine">
          <ThrowInCine world="cine" />
        </AppErrorBoundary>
      );
    });
    expect(div.textContent).toContain('Synthetic loop test');

    await act(async () => {
      root.render(
        <AppErrorBoundary resetKey="futbol">
          <ThrowInCine world="futbol" />
        </AppErrorBoundary>
      );
    });
    expect(div.textContent).toContain('Healthy futbol');

    console.error = origErr;
    root.unmount();
    div.remove();
  });
});

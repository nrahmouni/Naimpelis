// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { SettingsBottomSheet } from '../src/components/SettingsBottomSheet';
import { OfflineIndicator } from '../src/components/PWAInstallPrompt';
import {
  FORCE_OFFLINE_STORAGE_KEY,
  installForceOfflineNetworkGuard,
  isForceOfflineEnabled,
  setForceOfflineEnabled,
} from '../src/utils/offlineModeManager';
import { securityHeadersMiddleware } from '../server/middleware/errorHandler';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

describe('App boot iframe compatibility & Force Offline mode', () => {
  const realFetch = globalThis.fetch;
  const realWs = globalThis.WebSocket;

  class MockSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;
    readyState = 1;
    url: string;
    onopen: (() => void) | null = null;
    onclose: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onmessage: (() => void) | null = null;
    constructor(url: string) {
      this.url = url;
    }
    send() {}
    close() {
      this.readyState = 3;
    }
    addEventListener() {}
    removeEventListener() {}
  }

  beforeEach(() => {
    localStorage.clear();
    setForceOfflineEnabled(false);
    window.WebSocket = MockSocket as unknown as typeof WebSocket;
    globalThis.WebSocket = MockSocket as unknown as typeof WebSocket;
  });

  afterEach(() => {
    setForceOfflineEnabled(false);
    window.fetch = realFetch;
    globalThis.fetch = realFetch;
    window.WebSocket = realWs;
    globalThis.WebSocket = realWs;
  });

  it('allows AI Studio preview iframe framing without X-Frame-Options SAMEORIGIN block', () => {
    const headers: Record<string, string> = {};
    const next = vi.fn();
    securityHeadersMiddleware(
      { secure: true, headers: { 'x-forwarded-proto': 'https' } } as never,
      {
        setHeader: (k: string, v: string) => {
          headers[k] = v;
        },
      } as never,
      next
    );

    expect(headers['X-Frame-Options']).toBeUndefined();
    expect(headers['Content-Security-Policy']).toContain('https://aistudio.google.com');
    expect(headers['Content-Security-Policy']).toContain('https://*.run.app');
    expect(next).toHaveBeenCalledOnce();
  });

  it('boots App cleanly on cold Lobby route without throwing runtime errors', async () => {
    window.history.replaceState({}, '', '/');
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    window.fetch = mockFetch as unknown as typeof fetch;
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(
        <QueryClientProvider client={qc}>
          <App />
        </QueryClientProvider>
      );
    });
    await vi.waitFor(
      async () => {
        await act(async () => {
          await new Promise((r) => setTimeout(r, 30));
        });
        expect(host.textContent).toContain('Riffan');
      },
      { timeout: 3500, interval: 40 }
    );
    await act(async () => {
      root.unmount();
    });
    host.remove();
  });

  it('toggles Force Offline in settings, blocks outbound network requests, and shows a clear banner', async () => {
    const underlyingFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );
    window.fetch = underlyingFetch as unknown as typeof fetch;
    globalThis.fetch = underlyingFetch as unknown as typeof fetch;
    installForceOfflineNetworkGuard();

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    const renderUi = async () => {
      await act(async () => {
        root.render(
          <>
            <OfflineIndicator lang="en" />
            <SettingsBottomSheet
              isOpen
              onClose={() => {}}
              lang="en"
              onChangeLang={() => {}}
              effectiveView="desktop"
              onToggleViewMode={() => {}}
              authUser={null}
              authLoading={false}
              onSignIn={async () => {}}
              onSignOut={async () => {}}
            />
          </>
        );
      });
    };

    await renderUi();

    expect(document.body.querySelector('[data-testid="force-offline-banner"]')).toBeNull();
    const toggleBtn = document.body.querySelector(
      '[data-testid="force-offline-toggle"]'
    ) as HTMLButtonElement | null;
    expect(toggleBtn).not.toBeNull();
    expect(toggleBtn?.getAttribute('aria-checked')).toBe('false');

    // Enable Force Offline via settings switch
    await act(async () => {
      toggleBtn!.click();
    });

    expect(isForceOfflineEnabled()).toBe(true);
    expect(localStorage.getItem(FORCE_OFFLINE_STORAGE_KEY)).toBe('1');
    expect(toggleBtn?.getAttribute('aria-checked')).toBe('true');

    const banner = document.body.querySelector('[data-testid="force-offline-banner"]');
    expect(banner).not.toBeNull();
    expect(banner?.textContent).toContain('Offline-only mode active');

    // Outbound HTTP fetch MUST be explicitly rejected without invoking underlyingFetch
    const callsBefore = underlyingFetch.mock.calls.length;
    await act(async () => {
      await expect(window.fetch('/api/catalog/movies')).rejects.toThrow(
        /Force Offline mode active/i
      );
    });
    expect(underlyingFetch.mock.calls.length).toBe(callsBefore);

    // WebSocket MUST immediately resolve to CLOSED stub
    await act(async () => {
      const offlineWs = new window.WebSocket('wss://example.com/ws');
      expect(offlineWs.readyState).toBe(3);
    });

    // In-memory data URLs remain allowed
    await window.fetch('data:text/plain,ok');
    expect(underlyingFetch.mock.calls.length).toBe(callsBefore + 1);

    // Disabling from the banner restores network calls and removes the banner
    const exitBtn = document.body.querySelector(
      '[data-testid="force-offline-disable-btn"]'
    ) as HTMLButtonElement | null;
    expect(exitBtn).not.toBeNull();
    await act(async () => {
      exitBtn!.click();
    });

    expect(isForceOfflineEnabled()).toBe(false);
    expect(localStorage.getItem(FORCE_OFFLINE_STORAGE_KEY)).toBeNull();
    expect(document.body.querySelector('[data-testid="force-offline-banner"]')).toBeNull();

    await window.fetch('/api/health');
    expect(underlyingFetch.mock.calls.length).toBe(callsBefore + 2);

    await act(async () => {
      root.unmount();
    });
    host.remove();
  });
});

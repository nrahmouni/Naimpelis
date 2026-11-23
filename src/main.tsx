import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { queryClient } from './hooks/useCatalogQueries';
import { useAppStore } from './store/useAppStore';
import { useThemeStore } from './store/useThemeStore';
import { installForceOfflineNetworkGuard } from './utils/offlineModeManager';
import './index.css';

// Enforce persisted Force Offline mode & sync initial theme/layout DOM attributes immediately on boot
try {
  installForceOfflineNetworkGuard();
  localStorage.removeItem('naim_arcade_save_v1');
  useThemeStore.getState().syncDomAttributes();

  // Remove deprecated v1-v5 caches on boot, preserving active v6 service worker caches
  if ('caches' in window) {
    caches.keys().then((keys) => {
      for (const key of keys) {
        if (
          key.includes('arcade') ||
          key.includes('naim-cine-v1') ||
          key.includes('naim-cine-v2') ||
          key.includes('naim-cine-twitch-v3') ||
          key.includes('naim-cine-twitch-v4') ||
          key.includes('naim-cine-twitch-v5')
        ) {
          caches.delete(key).catch(() => {});
        }
      }
    });
  }

  // Register Service Worker in production only; unregister any stale dev SW in dev mode
  if ('serviceWorker' in navigator) {
    if (import.meta.env.PROD) {
      const isTizenOrTvMode =
        /[?&](tizen|tv)=1\b/i.test(window.location.search) ||
        /Tizen|SMART-TV|SmartTV|Web0S|WebOS/i.test(navigator.userAgent);
      const isActivelyPlayingMedia = () =>
        Array.from(document.querySelectorAll('video')).some(
          (v) => !v.paused && !v.ended && v.readyState > 1
        );

      window.addEventListener('load', () => {
        navigator.serviceWorker
          .register('/sw.js', { scope: '/' })
          .then((reg) => {
            const tryAutoApplyTvUpdate = (worker: ServiceWorker | null | undefined) => {
              if (!worker) return;
              useAppStore.getState().setSwUpdate({ waitingWorker: worker });
              if (isTizenOrTvMode && !isActivelyPlayingMedia()) {
                worker.postMessage({ type: 'SKIP_WAITING' });
              }
            };

            if (reg.waiting) {
              tryAutoApplyTvUpdate(reg.waiting);
            }
            reg.addEventListener('updatefound', () => {
              const nextWorker = reg.installing;
              if (!nextWorker) return;
              nextWorker.addEventListener('statechange', () => {
                if (nextWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  tryAutoApplyTvUpdate(nextWorker);
                }
              });
            });

            void reg.update().catch(() => {});
            document.addEventListener('visibilitychange', () => {
              if (document.visibilityState === 'visible') {
                void reg.update().catch(() => {});
              }
            });
            window.setInterval(() => {
              void reg.update().catch(() => {});
            }, 60_000);
          })
          .catch(() => {
            // Graceful fallback when running outside HTTPS/PWA scope
          });

        let reloadedForSw = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (reloadedForSw || !isTizenOrTvMode || isActivelyPlayingMedia()) return;
          const lastTs = Number(sessionStorage.getItem('riffan_sw_reload_ts') || '0');
          if (Date.now() - lastTs < 20_000) return;
          reloadedForSw = true;
          sessionStorage.setItem('riffan_sw_reload_ts', String(Date.now()));
          window.location.reload();
        });
      });
    } else {
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => {
          for (const reg of regs) {
            const scriptUrl = reg.active?.scriptURL || reg.installing?.scriptURL || reg.waiting?.scriptURL || '';
            if (!scriptUrl.includes('dev-sw.js')) {
              void reg.unregister();
            }
          }
        })
        .catch(() => {});
    }
  }
  // Case A Google Maps quota & auth circuit-breaker listener
  (window as Window & { gm_authFailure?: () => void }).gm_authFailure = () => {
    window.dispatchEvent(new Event('gmp-quota-exceeded'));
  };
  const origConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    const joined = args.map((a) => (typeof a === 'string' ? a : String(a ?? ''))).join(' ');
    if (/OverQuotaMapError|QuotaExceededError|RESOURCE_EXHAUSTED|429.*maps|maps.*quota/i.test(joined)) {
      window.dispatchEvent(new Event('gmp-quota-exceeded'));
    }
    origConsoleError.apply(console, args);
  };
} catch {
  // ignore storage/SW unavailability in restricted WebViews
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AppErrorBoundary>
        <App />
      </AppErrorBoundary>
    </QueryClientProvider>
  </React.StrictMode>
);

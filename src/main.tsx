import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { useAppStore } from './store/useAppStore';
import { useThemeStore } from './store/useThemeStore';
import './index.css';

// Sync initial theme, density, lite mode, and reduced-motion DOM attributes immediately on boot
try {
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

  // Register Service Worker with non-disruptive prompt-to-update banner
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then((reg) => {
          if (reg.waiting) {
            useAppStore.getState().setSwUpdate({ waitingWorker: reg.waiting });
          }
          reg.addEventListener('updatefound', () => {
            const nextWorker = reg.installing;
            if (!nextWorker) return;
            nextWorker.addEventListener('statechange', () => {
              if (nextWorker.state === 'installed' && navigator.serviceWorker.controller) {
                useAppStore.getState().setSwUpdate({ waitingWorker: nextWorker });
              }
            });
          });
        })
        .catch(() => {
          // Graceful fallback when running outside HTTPS/PWA scope
        });
    });
  }
} catch {
  // ignore storage/SW unavailability in restricted WebViews
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>
);

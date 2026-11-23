import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        selfDestroying: false,
        registerType: 'autoUpdate',
        includeAssets: [
          'favicon.ico',
          'favicon-16x16.png',
          'favicon-32x32.png',
          'icon.svg',
          'apple-touch-icon.png',
          'pwa-192x192.png',
          'pwa-512x512.png',
          'pwa-maskable-512x512.png',
          'logo-mark.png',
          'logo-mark-light.png',
          'logo-monochrome.png',
          'music-icon.svg',
          'music-apple-touch-icon.png',
          'music-pwa-192x192.png',
          'music-pwa-512x512.png',
          'music-pwa-maskable-512x512.png',
          'music-manifest.webmanifest',
        ],
        manifest: {
          id: '/',
          name: 'Riffan TV — Cine, Directos y Sala Privada',
          short_name: 'Riffan TV',
          description:
            'Riffan TV (RTV): tu plataforma multiplataforma en directo para ver películas, series, anime, fútbol y TV con amigos en tiempo real.',
          theme_color: '#000000',
          background_color: '#000000',
          display: 'standalone',
          orientation: 'any',
          start_url: '/',
          scope: '/',
          categories: ['entertainment', 'music', 'video', 'social'],
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
          shortcuts: [
            {
              name: 'Riffan Music',
              short_name: 'Music',
              description: 'Riffan Music Hi-Fi, letras en vivo y radios 24/7',
              url: '/musica',
              icons: [{ src: '/music-pwa-192x192.png', sizes: '192x192' }],
            },
            {
              name: 'Music Radios 24/7',
              short_name: 'Radios',
              description: 'Live Belgian & Worldwide 24/7 Radio Stations',
              url: '/musica?view=radios',
              icons: [{ src: '/music-pwa-192x192.png', sizes: '192x192' }],
            },
            {
              name: 'Riffan Kids',
              short_name: 'Kids',
              description: 'Academia infantil Riffan Kids con Tarifit, cine y juegos',
              url: '/?tab=kids',
              icons: [{ src: '/pwa-192x192.png', sizes: '192x192' }],
            },
            {
              name: 'Riffan TV Directos',
              short_name: 'TV',
              description: 'Emisión y canales de TV',
              url: '/tv',
              icons: [{ src: '/pwa-192x192.png', sizes: '192x192' }],
            },
          ],
        },
        workbox: {
          cacheId: 'riffantv-studio-v1',
          skipWaiting: true,
          clientsClaim: true,
          cleanupOutdatedCaches: true,
          maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
          globIgnores: ['**/tv-receiver.html', '**/tv/**', '**/*.apk', '**/assets/aistudio/**'],
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [
            /^\/api\//,
            /^\/ws/,
            /^\/tv(\/|$)/,
            /^\/vendor\//,
            /^\/\.well-known\//,
            /^\/music-manifest\.webmanifest$/i,
            /\.apk(\?|$)/i,
          ],
          runtimeCaching: [
            {
              urlPattern: /^\/api\/kids\/catalog(\?.*)?$/i,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'kids-catalog-cache',
                expiration: {
                  maxEntries: 30,
                  maxAgeSeconds: 60 * 60 * 24 * 7,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^\/api\/catalog\/football-board(\?.*)?$/i,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'football-board-swr-cache',
                expiration: {
                  maxEntries: 20,
                  maxAgeSeconds: 60 * 5,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/image\.tmdb\.org\/t\/p\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'tmdb-images-cache',
                expiration: {
                  maxEntries: 250,
                  maxAgeSeconds: 60 * 60 * 24 * 14,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/images\.fotmob\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'fotmob-assets-cache',
                expiration: {
                  maxEntries: 200,
                  maxAgeSeconds: 60 * 60 * 24 * 7,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
        devOptions: {
          enabled: false,
          type: 'module',
        },
      }),
    ],
    build: {
      target: ['es2018', 'chrome69'],
      cssCodeSplit: true,
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
              return 'vendor-react';
            }
            if (id.includes('node_modules/@tanstack/react-query/')) {
              return 'vendor-tanstack';
            }
            if (id.includes('node_modules/zod/')) {
              return 'vendor-zod';
            }
            if (id.includes('node_modules/firebase/') || id.includes('node_modules/@firebase/')) {
              return 'vendor-firebase';
            }
            if (id.includes('node_modules/hls.js/')) {
              return 'vendor-media';
            }
            if (id.includes('node_modules/jszip/')) {
              return 'vendor-zip';
            }
            if (id.includes('node_modules/lucide-react/')) {
              return 'vendor-icons';
            }
            if (id.includes('node_modules/motion/')) {
              return 'vendor-motion';
            }
            if (id.includes('/src/components/kids/') || id.includes('/src/store/useKidsStore')) {
              return 'feature-kids';
            }
            if (id.includes('/src/components/music/') || id.includes('/src/store/useMusicStore')) {
              return 'feature-music';
            }
            if (id.includes('/src/components/liveMatch/') || id.includes('FootballWorldView')) {
              return 'feature-sports';
            }
            if (id.includes('/src/components/games/') || id.includes('GamesHubSection')) {
              return 'feature-games';
            }
            if (id.includes('/src/components/admin/')) {
              return 'feature-admin';
            }
          },
        },
      },
    },
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react/jsx-runtime',
        'react/jsx-dev-runtime',
        '@tanstack/react-query',
        'motion/react',
        'lucide-react',
        'zustand',
      ],
    },
    resolve: {
      dedupe: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
      alias: {
        '@': import.meta.dirname,
      },
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      allowedHosts: true,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});

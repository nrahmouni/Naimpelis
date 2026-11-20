# RiffanTV Architecture & Developer Guide

This document describes the modular architecture, design tokens, real-time protocols, and test contracts of **RiffanTV** so AI engineers and human developers can navigate and extend the codebase safely.

---

## 1. Directory & Module Map

```text
/
├── server/                         # Express HTTP server, extractors & WebSocket hub
│   ├── config/                     # Environment & port configuration
│   ├── data/                       # Static channel & seed catalogs
│   ├── extractors/                 # HLS / embed source extractors (Movidy, Vest, Sports, etc.)
│   ├── gateway/                    # Service mesh & upstream proxy routing
│   ├── middleware/                 # Security & error middleware
│   ├── routes/
│   │   ├── castellanoCatalog.ts    # Movidy ES/LAT/VOSE catalog & playback resolution
│   │   ├── catalaCatalog.ts        # Catalan/3Cat & SX3 catalog routes
│   │   ├── detailsAndSubtitles.ts  # TMDB metadata, recommendations & OpenSubtitles
│   │   ├── expandedCatalog.ts      # Infinite curated discovery rails
│   │   ├── geminiLive.ts           # Bidirectional Gemini Live API (/ws/gemini-live)
│   │   ├── health.ts               # Readiness & upstream diagnostics
│   │   ├── iptv.ts                 # TDT & M3U playlist + XMLTV EPG routes
│   │   ├── proxies.ts              # HLS/TS proxy, SSRF guard & image proxy
│   │   ├── sports.ts               # Live football schedule, signals & stats
│   │   ├── voiceAssistant.ts       # Natural-language voice intent + search engine
│   │   └── youtubeCatalog.ts       # Instant YouTube search & parser for watch parties
│   ├── services/                   # TMDB, Vest mirror, APK builder, room sync, Firebase auth
│   ├── utils/                      # TLS fetch, SSRF validation, logger, LRU caches
│   └── ws/
│       ├── roomHub.ts              # Authoritative WebSocket hub & game lifecycle loops
│       ├── roomHubHelpers.ts       # Pure RoomRecord types, snapshot sanitizers & serializers
│       ├── gameSwitchHelper.ts     # Cross-game lobby seat preservation & state builder
│       └── wsSchemas.ts            # Zod message schemas & per-socket rate limiter
│
├── src/                            # React 18 + TypeScript + Tailwind CSS v4 SPA
│   ├── assets/                     # Brand marks, SVG card decks & domain artwork
│   ├── components/
│   │   ├── AppGlobalModalsLayer.tsx# Global modals, bottom sheets, toasts & legal popups
│   │   ├── GamesHubSection.tsx     # Active multiplayer game stages, voice bar & invite logic
│   │   ├── MediaCatalogHub.tsx     # World router (Cine, Sports, Live TV, Games, YouTube)
│   │   ├── NativeCinemaPlayer.tsx  # Primary HLS/MP4/YouTube/Embed player & controls
│   │   ├── catalog/
│   │   │   ├── CineWorldView.tsx   # Cinema hero spotlight, segmented rails & infinite grid
│   │   │   ├── CinePosterCard.tsx  # Shared 2:3 poster card (quick bookmark, rank, 4K beam)
│   │   │   ├── CineFilterSheet.tsx # Cinema filter sheet (genre, year, rating, #9146FF active)
│   │   │   ├── LiveTvWorldView.tsx # TDT & EPG channel browser
│   │   │   ├── YouTubeWorldView.tsx# YouTube search & watch-party queue
│   │   │   └── *PickerModal.tsx    # Series/Català season & episode pickers, EPG modal
│   │   ├── games/
│   │   │   ├── GamesHubLobby.tsx   # Mobile-first & desktop-responsive Games Lounge (unrestricted Y-scroll)
│   │   │   ├── GameLogos.tsx       # 11 custom vector SVG game artworks (GameLogoArtwork)
│   │   │   ├── GameVoiceBar.tsx    # In-game WebRTC voice & audio wave indicator
│   │   │   ├── GameMatchInviteModal.tsx
│   │   │   └── GameEffects.tsx     # Floating game reactions & audio mute hooks
│   │   ├── home/
│   │   │   ├── UniversalHomeSearch.tsx
│   │   │   └── WorldPortalTransition.tsx
│   │   ├── party/                  # Watch-party polls, queue & moderation sheets
│   │   ├── player/                 # Player transport bar, CinemaPlaybackDocks, tracks, PiP & MiniPlayer
│   │   ├── ui/
│   │   │   ├── DesignSystem.tsx    # WorldShell, SegmentedControl, BottomSheet, ActionToast
│   │   │   ├── RiffanIcons.tsx     # Complete animated SVG icon kit (brand/current)
│   │   │   ├── LanguageBadge.tsx   # ES · LAT · VOSE · EN badges & multi-language flags
│   │   │   └── PosterImage.tsx     # Resilient poster/backdrop loader with fallback
│   │   └── worlds/WorldShell.tsx   # Shared sticky header & world container
│   ├── hooks/                      # Extracted state/side-effect orchestration hooks
│   │   ├── useCatalogQueries.ts
│   │   ├── useCloudSyncSubscriptions.ts
│   │   ├── useGameVoiceChat.ts
│   │   ├── useLiveSportsMatchDetails.ts
│   │   ├── useMiniPlayerDrag.ts
│   │   ├── usePlaybackOrchestrator.ts
│   │   ├── useRoomGameActions.ts   # Bundled socket game action dispatchers
│   │   ├── useRoomSocketEvents.ts
│   │   ├── useTvRemoteBridge.ts
│   │   └── useTvRoomPolling.ts
│   ├── services/                   # WebSocket room client & Firebase cloud sync
│   ├── shared/                     # Shared protocol schemas & authoritative game engines
│   ├── store/                      # Zustand / persisted app stores
│   ├── utils/                      # i18n, spatial TV nav, haptics, subtitles, short links
│   ├── App.tsx                     # Root SPA orchestrator (delegates heavy logic to hooks/)
│   ├── index.css                   # Tailwind v4 tokens, scroll utilities & icon keyframes
│   └── types.ts                    # Shared domain types
└── tests/                          # Vitest unit, contract & protocol suites
```

---

## 2. Core Architectural Principles

1. **Hook-Driven Root Orchestration (`src/App.tsx`)**:
   - `App.tsx` composes dedicated hooks (`usePlaybackOrchestrator`, `useRoomSocketEvents`, `useTvRoomPolling`, `useLiveSportsMatchDetails`, `useMiniPlayerDrag`, `useCatalogQueries`, `useCloudSyncSubscriptions`) and mounts `<AppGlobalModalsLayer />` rather than holding inline monolithic handlers.

2. **Strict Chromatic & Touch Standards**:
   - Canvas background: `#0B0B0F` (Obsidian dark); surface cards: `#12121A` / `#141622`.
   - Brand Purple: `#9146FF` — **all active tabs, selected filters, and primary badges MUST use brand purple with white text (never pure `#FFFFFF` active filter/tab buttons)**.
   - Language tags unified as `ES · LAT · VOSE · EN` (plus app shell UI languages `es`, `ca`, `en`, `zh`, `rif`).
   - Mobile first: `>= 44px` minimum touch targets, zero nested clickable `<button>` elements, and unrestricted vertical scrolling (`overflow-x-clip`, explicit `h-[100dvh]` root bounding, `touch-action: pan-y`, and no nested `overflow-y-auto` traps inside scrollable views).

3. **Animated SVG Kit (`src/components/ui/RiffanIcons.tsx`)**:
   - Full vector kit with GPU-composited keyframes in `src/index.css` (`.rtv-ico` with `animate="hover" | "always" | "none"`).
   - Supports two tones: `'brand'` (`#8B5CF6 -> #4CC9F0`) and `'current'`.

4. **Bespoke Games Lounge (`src/components/games/`)**:
   - `GamesHubLobby.tsx` renders mobile-first + desktop (`max-w-6xl`) responsive cards backed by bespoke SVG artwork (`GameLogos.tsx`) and delegates active matches to `GamesHubSection.tsx`.
   - `App.tsx` only enables full-height canvas lock when `isInActiveGame` is `true`, keeping lobby vertical scrolling native and fluid on iOS/Android.

5. **Natural Voice & Gemini Live API**:
   - `/ws/gemini-live` (`server/routes/geminiLive.ts`) provides bidirectional real-time audio chat with Gemini Live and non-blocking function calling alongside `/server/routes/voiceAssistant.ts`.

6. **WebSocket Room & Game Synchronization (`server/ws/`)**:
   - `roomHub.ts` + `roomHubHelpers.ts` + `gameSwitchHelper.ts` manage playback sync, polls, queue voting, TV pairing codes, and authoritative multiplayer engines (Chess, Checkers, Connect 4, Parchís, UNO, Pinturillo, Pool 8 Ball, Fútbol Chapas, Head Soccer, Texas Hold'em Poker, Blackjack).

---

## 3. Preserved Test & Contract Invariants

The automated test suite (`tests/voiceAndAuditSync.test.ts`, `tests/i18nAndCatalogPillar.test.ts`, `tests/gameSwitch.test.ts`, etc.) enforces key architectural anchors:
- `src/App.tsx` renders `<EntryHomeScreen` and `<WorldShell`.
- `src/components/NativeCinemaPlayer.tsx` preserves `'voiceChat'` and `'VoiceWaveBars'`.
- `src/components/MediaCatalogHub.tsx` exports `normalizeCatalogPillar` & `CatalogSection`, and preserves `"worldMode === 'cine'"`, `'Fútbol China (中文)'`, and `'欧冠/西甲/英超'`.
- `server/ws/roomHub.ts` exports `buildHostGameInvitePayload` and `createRoomHub`.

Always run `npm run lint && npx vitest run` plus `npm run build` after modifying modules.

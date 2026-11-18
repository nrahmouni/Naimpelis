# RiffanTV Architecture & Developer Guide (Optimized for Gemini Hydrogen)

This document provides a clean architectural overview of RiffanTV to facilitate effortless navigation, extension, and maintenance by AI coding agents (such as Gemini Hydrogen) and human developers.

---

## 1. Directory Structure

```
/
├── server/                   # Backend Express server & real-time WebSocket room hub
│   ├── config/               # Environment & port config
│   ├── data/                 # Static catalogs & international channel lists
│   ├── extractors/           # HLS / embed source extractors (Movidy, Gnula, Vest, Sports, etc.)
│   ├── gateway/              # Service mesh & upstream proxy routing
│   ├── middleware/           # Error handlers & security middleware
│   ├── routes/               # API routes (proxies, voice assistant, Gemini live, kids, expanded catalog)
│   ├── services/             # TMDB, APK builder, channel health monitor, stream sniffer, room sync
│   ├── utils/                # TLS fetch, SSRF guard, logger, LRU cache
│   └── ws/                   # WebSocket room hub, multiplayer game state handlers, match sync
│
├── src/                      # React 18 + TypeScript + Tailwind CSS Frontend SPA
│   ├── assets/               # Branding logo images, SVG card decks, sports backdrops, kids assets
│   ├── components/           # UI components categorized by domain
│   │   ├── kids/             # Riffan Kids Hub (games, stories, languages, art, simon, math)
│   │   ├── player/           # Native video player, HLS player, PiP, direct cast overlays
│   │   ├── party/            # Watch party poll cards, moderation sheets, queue panels
│   │   ├── worlds/           # World shells (Cinema, SportZone, KidsWorld, Channels, GamesHub)
│   │   ├── ui/               # Reusable UI atoms (LanguageBadge, PosterImage, DesignSystem)
│   │   └── ...               # Modals, docks, headers, voice assistant modal, design showcase
│   ├── hooks/                # Custom React hooks (catalog queries, voice chat, remote bridge, cloud sync)
│   ├── services/             # Client-side services (WebSocket client, user cloud sync)
│   ├── store/                # App state stores (theme, notifications, user profile)
│   ├── utils/                # Internationalization (i18n), storage, spatial navigation, subtitles, haptics
│   ├── App.tsx               # Main SPA router, modal manager, WebSocket room coordinator
│   ├── main.tsx              # React entry point with ErrorBoundary
│   └── types.ts              # Unified TypeScript definitions (shared with backend protocol)
│
├── vitest.config.ts          # Vitest unit test configuration
├── tsconfig.json             # Frontend TypeScript configuration
└── tsconfig.server.json      # Backend TypeScript configuration
```

---

## 2. Core Architectural Principles

1. **Strict Separation of Client & Server**:
   - `/src` contains the React client SPA with Tailwind CSS v4 and Framer/Motion animations.
   - `/server` contains Express middleware, HLS proxy routes, and Socket.io real-time multiplayer room synchronization.

2. **Obsidian Design System**:
   - Background: `#0B0C12`
   - Primary Neon Accent: `#9146FF` (Twitch/Obsidian purple)
   - Accent Cyan: `#00F0FF`
   - Surfaces: `#141622` with frosted glass blur effects (`backdrop-blur-xl`).

3. **Multi-Lingual & Localization**:
   - Fully supported in 5 languages: Spanish (`es`), Catalan (`ca`), English (`en`), Chinese (`zh`), and Riffan (`rif`).
   - Integrated translations in `src/utils/i18n.ts`, `zhTranslations.ts`, and `rifTranslations.ts`.

4. **Multiplayer Room & Game Synchronization**:
   - WebSocket room protocol (`server/ws/roomHub.ts`) synchronizes playback position, queue items, polls, chat messages, and mini-games (Pinturillo, Pool 8 Ball, Futbol Chapas, HeadSoccer, Uno, Poker, Blackjack).

5. **AI Voice Assistant & Smart Parsing**:
   - `/server/routes/voiceAssistant.ts` handles natural language queries with season/episode parsing, Fotmob match lookup, and personalized greetings.

---

## 3. Extending the App

- **Adding New Features**: Place new domain components in `src/components/`, export robust types in `src/types.ts`, and register backend routes in `server/routes/`.
- **Testing**: Run tests using Vitest (`npm test`). Ensure type safety with `npm run build`.

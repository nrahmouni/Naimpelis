# NAIM CINE — Worklog & Architecture Ledger

## Executive Summary
Autonomous execution ledger for NAIM CINE across WebApp, Android Mobile APK (`com.naimcine.mobile`), and Google TV APK (`com.naimcine.tv`), tracking phases **F0 → F11**, measured before/after metrics, ADRs, risk mitigation, and environment gaps.

---

## F0 · Audit & Baseline (Completed)

### 0.1 Codebase & Endpoint Inventory
- **Client Frontend**: React 19, Vite 8, Tailwind v4, Lucide icons, Motion, Hls.js, Firebase Auth/Firestore.
  - Core baseline monoliths: `App.tsx` (4,815 LOC, 69 `useState`), `MediaCatalogHub.tsx` (8,141 LOC), `NativeCinemaPlayer.tsx` (4,597 LOC).
- **Backend Server**: Express + `ws` WebSocket + Puppeteer + `ffmpeg-static`.
  - Core baseline entry point: `server.ts` (15,180 LOC).
  - Extracted initial modules: `server/config/env.ts`, `server/utils/logger.ts`, `server/utils/lruCache.ts`, `server/middleware/errorHandler.ts`, `server/routes/health.ts`, `server/services/roomSync.ts`, `server/services/tmdbService.ts`.
- **REST Endpoints**:
  - Health & Release: `GET /health`, `GET /ready`, `GET /.well-known/assetlinks.json`, `GET /api/app/latest`, `POST /api/metrics/qoe`, `GET /api/metrics/qoe/summary`.
  - Catalog & Discovery: `/api/catalog/movies`, `/api/catalog/series`, `/api/catalog/bingetrix`, `/api/catalog/details`, `/api/catalog/tv/:tmdbId`, `/api/catalog/tdt`, `/api/catalog/epg`, `/api/catalog/sports`, `/api/catalog/football-board`, `/api/catalog/football-match/:eventId`, `/api/catalog/catala`, `/api/catalog/catala/:seriesId`.
  - Extraction & Streaming Proxy: `/api/extract/stream`, `/api/subtitles/search`, `/api/subtitles/fetch`, `/api/hls-proxy/*`, `/api/ts-proxy/*`, `/api/iptv/live/:channelId.m3u8`, `/naim-cine.m3u`.
  - Smart TV & Rooms: `/api/tv/pair`, `/api/tv/claim`, `/api/tv/remote`, `/api/rooms/:id/meta`.
- **WebSocket Protocol (`src/shared/protocol.ts`)**:
  - Client → Server: `PING`, `JOIN_ROOM`, `SYNC_VIDEO_STATE`, `SEND_CHAT`, `TYPING_STATE`, `SEND_REACTION`, `QUEUE_VOTE`, `SET_PARTICIPANT_ROLE`, `TRANSFER_HOST`, `REGISTER_PRESENCE`, `TV_PAIR_REGISTER`, `CLOUD_BROWSER_*`.
  - Server → Client: `PONG`, `ROOM_STATE`, `PARTICIPANTS_UPDATED`, `VIDEO_STATE_UPDATED`, `NEW_CHAT_MESSAGE`, `TYPING_UPDATED`, `FLOATING_REACTION`, `ONLINE_USERS_UPDATED`.

### 0.2 Measured Baseline Metrics
- **Monolith Total**: 32,733 LOC across 4 primary files (`server.ts`, `MediaCatalogHub.tsx`, `App.tsx`, `NativeCinemaPlayer.tsx`).
- **Explicit `any` occurrences (`src/` + `server/` + `server.ts`)**: 199.
- **`useState` hooks in `App.tsx`**: 69.
- **`console.(log|warn|error)` calls (`src/` + `server/` + `server.ts`)**: 31.
- **Stray assets removed**: Deleted `public/assets/aistudio/` (3 unreferenced Sofascore screenshots).
- **Updated `.gitignore`**: Excludes `.apk`, `.aab`, `.keystore`, `dist/`, build artifacts, and local `.env*`.

### 0.3 Risk Map & Logged Environment Gaps
1. **No JDK / Gradle / Android SDK in Container**: Container lacks `java`, `gradle`, `adb`, `apksigner`, `zipalign`, and `keytool`. Native Android/TV multi-flavor Gradle project (`android/`), manifests, Kotlin sources, and `scripts/build-apks.mjs` are fully authored and validated structurally; binary `.apk` compilation requires CI runner or developer workstation with Android SDK 35 + JDK 17.
2. **Non-Git Workspace**: Workspace is not initialized as a `.git` repository; changes are tracked linearly in `WORKLOG.md` and `CHANGELOG.md`.
3. **Firebase Emulators / Remote Config**: App connects cleanly to `firebase-applet-config.json` DB `ai-studio-watch2gethermobi-97429da4-7a91-4bf8-b193-2e87c30f1a72`; Vitest unit tests mock Firestore safely.
4. **HMR Disabled**: Verified `npm test` + `tsc --noEmit` + `restart_dev_server` checks run cleanly without relying on HMR.

---

## Phase Execution Progress
- [x] **F0**: Audit, Baseline Inventory, Hygiene & Asset Cleanup
- [ ] **F1**: Architecture, Modularization, State Stores & Firestore Cost Optimization
- [ ] **F2**: Web Performance, Responsive Images, Virtualization, Worker Search & PWA Prompt
- [ ] **F3**: Strict TypeScript, ESLint, Prettier, Vitest, Playwright & CI/CD
- [ ] **F4**: Design System, `@theme` Tokens, 3 Themes + Lite Mode + ES/CA/EN i18n
- [ ] **F5**: Leak Purge, Product UX, Mobile/TV Ergonomics, Notifications & Legal/GDPR
- [ ] **F6**: Android Mobile Native Multi-Flavor Codebase (`com.naimcine.mobile`)
- [ ] **F7**: Google TV (`com.naimcine.tv`) & 10-Foot `/tv` Spatial UI
- [ ] **F8**: Player QoE, Subtitles Studio, Auto-Failover & Mini-Player
- [ ] **F9**: Social Watch-Party & Discovery Enhancements
- [ ] **F10**: Launch Ops, k6 Load Test, SBOM, Staging/Prod Env & Runbook
- [ ] **F11**: Final Verification & Spanish Executive Summary

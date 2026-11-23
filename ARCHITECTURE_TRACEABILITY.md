# RiffanTV — Trazabilidad de Arquitectura de Alto Rendimiento (Fases 1, 2, 3) y Consola `/admin`

Este documento registra con precisión cada fase arquitectónica ejecutada sobre **RiffanTV**, los módulos creados/actualizados, los endpoints operativos, las garantías de seguridad y la matriz de verificación.

---

## Resumen Ejecutivo por Fases

### Fase 1 · Estabilidad del Control Plane, Base de Datos, Pub/Sub y Push SSE
1. **Precompilación Backend con `esbuild` (`package.json`)**:
   - Añadidos scripts `"build:server"`, `"start:compiled"`, `"start:media"` y `"build": "vite build && npm run build:server"`, conservando `"start": "node server.ts"` por compatibilidad con el entorno de ejecución.
   - Genera artefactos ESM ligeros (`dist-server/server.mjs` y `dist-server/mediaServer.mjs`) que eliminan la sobrecarga de transpilación `tsx` en tiempo de arranque en producción.
2. **Aislamiento en Worker Thread (`server/workers/backgroundWorker.ts` + `server/services/workerBridge.ts`)**:
   - Mueve comprobaciones de red/headers y heartbeats a un `Worker` de Node (`worker_threads`) con respaldo automático `in-process` en entornos sin soporte TS en workers, evitando bloqueos del Event Loop principal.
3. **Persistencia Estructurada PostgreSQL/Drizzle + Redis/Disk (`src/db/schema.ts` + `server/services/telemetryStore.ts`)**:
   - Esquema relacional Drizzle ORM con 4 tablas:
     - `qoe_metrics`: telemetría de arranque, rebuffers, plataforma y vertical.
     - `channel_health_snapshots`: histórico de latencia/disponibilidad de señales TDT/IPTV/Fútbol.
     - `catalog_index_entries`: índice estructurado de catálogo VOD/canales.
     - `admin_audit_events`: trazabilidad de acciones administrativas.
   - Selección automática de driver en tiempo real (`postgres-drizzle` cuando hay `DATABASE_URL` o `SQL_*`, si no `redis-rest` con Upstash/Redis REST, si no `memory-disk` en `/tmp/riffantv-admin-audit-v1.json`).
4. **Sincronización Horizontal de Salas Watch Party (`server/services/roomPubSubBridge.ts`)**:
   - Publica eventos de estado (`VIDEO_STATE_UPDATED`) desde `server/ws/handlers/roomSyncAndChatHandlers.ts` a un bus con `nodeId` único e intercambio por Redis REST para despliegues multi-réplica.
5. **Server-Sent Events (SSE) Push (`server/services/livePushHub.ts` + `src/hooks/useCatalogQueries.ts`)**:
   - Canal público `GET /api/events/stream` que emite `football-board:update`, `scores:update`, `channels:health` y `heartbeat`.
   - El frontend (`useLiveScoresQuery`, `useFootballBoardQuery`) se suscribe con un único `EventSource` compartido por pestaña para invalidar caché al instante cuando cambian marcadores o canales, reduciendo el polling de fondo cuando SSE está activo.

---

### Fase 2 · Separación Media Plane / Control Plane y Edge Caching
1. **Servidor Media Plane Independiente (`server/mediaServer.ts`)**:
   - Entrypoint dedicado (`MEDIA_PORT || 3001`) que monta exclusivamente proxies de streaming (`/api/hls-proxy`, `/api/ts-proxy`, `/api/dvb-live`, `/api/vod-manifest`, `/api/embed-proxy`, `/health`, `/ready`) con `dns.setDefaultResultOrder('ipv4first')` y cierre limpio de sesiones DVB FFmpeg.
   - Configurable opcionalmente en la misma máquina o en nodo aparte mediante `MEDIA_PROXY_ORIGIN`.
2. **Enrutador Direct-Play First (`server/services/mediaPlaneRouter.ts`)**:
   - Evalúa dominio, protocolo HTTPS, cabeceras CORS conocidas y requisito de transcodificación DVB/AAC (`evaluateDirectPlayEligibility`) registrando la tasa de elegibilidad Direct-Play vs proxy backend.
3. **Instrumentación Media & IA (`hlsProxyHandler.ts`, `tsProxyHandler.ts`, `dvbTranscoder.ts`, `aiStudio/shared.ts`)**:
   - Contadores en vivo de streams TS activos, hits de manifiestos VOD en caché, proporción `streamingFetch` nativo vs fallback `curl`, sesiones FFmpeg DVB, y estadísticas de IA (`ok`, `429`, `503`).
4. **Cabeceras de Edge Caching (`server/middleware/errorHandler.ts`)**:
   - Añadido helper `applyEdgeCacheHeaders` con `Cache-Control` + `CDN-Cache-Control: public, s-maxage=...` compatible con Cloudflare/Fastly/Cloud CDN.

---

### Fase 3 · Hilo Principal Ultra-Fluido en Cliente, Web Vitals Reales y Lazy Bundle Admin
1. **Web Worker de Catálogo (`src/workers/catalogWorker.ts` + `src/utils/catalogWorkerClient.ts`)**:
   - Offloading fuera del hilo principal de filtrado/ranking de canales (`filterCatalogOffThread`) y parseo de listas M3U (`parseM3uOffThread`) con umbral adaptativo y fallback síncrono seguro.
2. **Telemetría Real de Web Vitals y Plataformas (`src/utils/clientTelemetry.ts` + `POST /api/metrics/client-vitals`)**:
   - Reporta TTFB, FCP, DOM Interactive, JS Heap, RTT/downlink de red, estado de Service Worker, modo PWA standalone y plataforma detectada (`web`, `pwa`, `android-mobile`, `android-tv`, `smart-tv`, `music-app`) + vertical activa (`cine`, `futbol`, `tv`, `iptv`, `music`, `kids`, `juegos`, `admin`).
3. **Code-Splitting de la Consola Admin (`vite.config.ts`)**:
   - Aislado en el chunk `feature-admin` y cargado de forma perezosa desde `AppEarlyRouteView.tsx`; los usuarios finales nunca descargan el código del panel `/admin`.

---

## Consola de Administración y Telemetría (`/admin`)

- **Ruta dedicada**: `/admin` reservada en `SYSTEM_RESERVED_SLUGS` (`src/shared/dedicatedRoutes.ts`), enrutada antes de salas dinámicas en `shortLink.ts`, `useAppController.ts`, `useDeepLinkRouter.ts` y `AppEarlyRouteView.tsx`, con acceso rápido en `AvatarMenuSheet.tsx` únicamente visible para la cuenta propietaria.
- **Seguridad y Autenticación (`server/services/adminAuthService.ts` + `server/routes/adminRoutes.ts`)**:
  - Verificación en servidor de Google ID Token vía Firebase Admin SDK (`verifyIdToken`) validando `email_verified === true` y pertenencia a `ADMIN_EMAILS` (por defecto `naimrahmouni1998@gmail.com`).
  - Acceso alternativo por clave maestra (`ADMIN_PASSCODE`) o reclamo inicial atómico cifrado con `scrypt` + comparación en tiempo constante (`timingSafeEqual`).
  - Tokens Bearer firmados con `HMAC-SHA256` mantenidos **exclusivamente en memoria de React** (nunca en `localStorage` ni `sessionStorage`) y enviados vía cabecera `Authorization: Bearer` incluso en el stream SSE (`fetch` + `ReadableStream`).
- **6 Vistas de Monitorización Integral**:
  1. **Arquitectura y Sistema**: CPU %, RAM RSS/Heap, latencia Event Loop (p50/p95/p99/max) con gráfico SVG en vivo, estado Worker Thread, driver BD/Redis, Pub/Sub Watch Party, SSE y malla de 8 microservicios.
  2. **Google TV, Android y PWA**: Versiones/packageName APK (`com.naimcine.mobile`, `com.naimcine.tv`, `com.riffan.music`), ruta `/tv`, muestras reales de Web Vitals y QoE agrupadas por plataforma y vertical.
  3. **IPTV, Canales y Media**: Contadores TDT, Català, Belix, RBTV, World IPTV, caché M3U, Media Plane (Direct-Play %, ratio transporte nativo/curl, sesiones DVB FFmpeg activas) y tabla filtrable de canales degradados/caídos.
  4. **Fútbol, VOD, Music e IA**: Tablero de fútbol cacheado, scheduler VOD, proxy Riffan Music y estado del motor Gemini IA (total peticiones, 429, 503, clave configurada).
  5. **Salas, Auditoría y Logs**: Salas Watch Party activas, clientes WebSocket, auditoría persistida de acciones admin y stream de eventos recientes filtrable por severidad.
  6. **Trazabilidad Fases**: Inventario de mejoras F1→F11 + Fases 1–3 directamente visible desde la consola.
- **Acciones Operativas en Directo**:
  - `POST /api/admin/actions/probe-channels`: barrido completo de salud TDT/IPTV/Deportes + push SSE inmediato.
  - `POST /api/admin/actions/refresh-catalog`: recarga paralela IPTV + fútbol del día + catálogos VOD.
  - `POST /api/admin/actions/cleanup-dvb`: cierre seguro de procesos FFmpeg DVB activos.
  - `POST /api/admin/actions/clear-caches`: purga de cooldowns IA, manifiestos VOD y caché de segmentos DVB.
  - Exportación instantánea de snapshot completo en formato JSON.

---

## Inventario de Archivos Creados y Modificados

### Archivos Nuevos
- `src/db/schema.ts`
- `server/services/runtimeMetricsCollector.ts`
- `server/services/telemetryStore.ts`
- `server/services/roomPubSubBridge.ts`
- `server/services/livePushHub.ts`
- `server/services/mediaPlaneRouter.ts`
- `server/workers/backgroundWorker.ts`
- `server/services/workerBridge.ts`
- `server/mediaServer.ts`
- `server/services/adminAuthService.ts`
- `server/routes/adminRoutes.ts`
- `src/workers/catalogWorker.ts`
- `src/utils/catalogWorkerClient.ts`
- `src/utils/clientTelemetry.ts`
- `src/components/admin/adminConsoleTypes.ts`
- `src/components/admin/AdminChartsAndMetrics.tsx`
- `src/components/admin/AdminConsolePage.tsx`
- `tests/architectureAndAdmin.test.ts`
- `ARCHITECTURE_TRACEABILITY.md`

### Archivos Modificados
- `server.ts`
- `server/middleware/errorHandler.ts`
- `server/routes/health.ts`
- `server/routes/proxies/hlsProxyHandler.ts`
- `server/routes/proxies/tsProxyHandler.ts`
- `server/routes/proxies/dvbTranscoder.ts`
- `server/routes/aiStudio/shared.ts`
- `server/routes/sports.ts`
- `server/ws/handlers/roomSyncAndChatHandlers.ts`
- `src/shared/dedicatedRoutes.ts`
- `src/utils/shortLink.ts`
- `src/hooks/useAppController.ts`
- `src/hooks/useDeepLinkRouter.ts`
- `src/hooks/useCatalogQueries.ts`
- `src/components/AppEarlyRouteView.tsx`
- `src/components/AppGlobalModalsLayer.tsx`
- `src/components/AvatarMenuSheet.tsx`
- `src/App.tsx`
- `vite.config.ts`
- `package.json`
- `.env.example`
- `WORKLOG.md`

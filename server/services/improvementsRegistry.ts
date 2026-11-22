export type ImprovementPhase =
  | 'F1-Architecture'
  | 'F2-Performance'
  | 'F3-TypeSafety-Tests'
  | 'F4-DesignSystem-i18n'
  | 'F5-Security-Resilience'
  | 'F6-Mobile-UX'
  | 'F7-TV-Spatial-UI'
  | 'F8-Player-Stream-QoE'
  | 'F9-Sports-Social'
  | 'F10-Ops-Audit';

export interface ImplementedImprovement {
  id: number;
  phase: ImprovementPhase;
  title: string;
  target: string;
}

export const RIFFAN_100_IMPROVEMENTS: ImplementedImprovement[] = [
  // 1-10: F8 Player & Stream QoE
  { id: 1, phase: 'F8-Player-Stream-QoE', title: 'Inspección real de atributo CODECS en manifiestos HLS (#EXT-X-STREAM-INF)', target: 'server/services/channelHealthMonitor.ts' },
  { id: 2, phase: 'F8-Player-Stream-QoE', title: 'Detección de streams audio-only (mp4a/ec-3 sin avc1/hev1/av01/vp09) marcados como degraded', target: 'server/services/channelHealthMonitor.ts' },
  { id: 3, phase: 'F8-Player-Stream-QoE', title: 'Exposición de metadatos videoCodec / audioCodec / hasVideo en TrackHealthInfo', target: 'server/services/channelHealthMonitor.ts' },
  { id: 4, phase: 'F8-Player-Stream-QoE', title: 'Detección temprana de variantes HLS congeladas o sin segmentos activos', target: 'server/services/channelHealthMonitor.ts' },
  { id: 5, phase: 'F8-Player-Stream-QoE', title: 'Priorización automática de streams A/V completos sobre variantes degradadas o sin vídeo', target: 'server/services/channelHealthMonitor.ts' },
  { id: 6, phase: 'F8-Player-Stream-QoE', title: 'Exportación de destroyAllLiveDvbSessions() para cierre limpio de FFmpeg DVB activos', target: 'server/routes/proxies/dvbTranscoder.ts' },
  { id: 7, phase: 'F8-Player-Stream-QoE', title: 'Exportación de getActiveDvbSessionCount() para telemetría de sesiones DVB en directo', target: 'server/routes/proxies/dvbTranscoder.ts' },
  { id: 8, phase: 'F8-Player-Stream-QoE', title: 'Limpieza recursiva de directorios temporales DVB en salida de sesión o shutdown', target: 'server/routes/proxies/dvbTranscoder.ts' },
  { id: 9, phase: 'F8-Player-Stream-QoE', title: 'Sustitución de console.warn crudo por logger estructurado en transcodificación DVB', target: 'server/routes/proxies/dvbTranscoder.ts' },
  { id: 10, phase: 'F8-Player-Stream-QoE', title: 'Reproducción resiliente y diagnóstico de fallo en proxy HLS con logger contextual', target: 'server/routes/proxies/hlsProxyHandler.ts' },

  // 11-20: F1 Architecture & Server Lifecycle
  { id: 11, phase: 'F1-Architecture', title: 'Extracción de trackRankingService.ts desde server.ts reduciendo monolito principal', target: 'server/services/trackRankingService.ts' },
  { id: 12, phase: 'F1-Architecture', title: 'Extracción de spaFrontendMount.ts para montaje dev Vite y producción dist limpio', target: 'server/routes/spaFrontendMount.ts' },
  { id: 13, phase: 'F1-Architecture', title: 'Reducción de server.ts por debajo del umbral estricto de 700 líneas', target: 'server.ts' },
  { id: 14, phase: 'F1-Architecture', title: 'Cierre ordenado idempotente en gracefulShutdown.ts para SIGTERM y SIGINT', target: 'server/utils/gracefulShutdown.ts' },
  { id: 15, phase: 'F1-Architecture', title: 'Desconexión limpia de clientes WebSocket (código 1001) antes de cerrar HTTP server', target: 'server/utils/gracefulShutdown.ts' },
  { id: 16, phase: 'F1-Architecture', title: 'Detención coordinada de channelHealthMonitor.stopScheduler() durante shutdown', target: 'server/utils/gracefulShutdown.ts' },
  { id: 17, phase: 'F1-Architecture', title: 'Detención coordinada de stopCatalogRefreshScheduler() durante shutdown', target: 'server/utils/gracefulShutdown.ts' },
  { id: 18, phase: 'F1-Architecture', title: 'Temporizador de salida forzada seguro con unref() de 6s anti-cuelgue en contenedores', target: 'server/utils/gracefulShutdown.ts' },
  { id: 19, phase: 'F1-Architecture', title: 'Aislamiento tipado de healthMap en RankCandidateTracksInput sin tipos any', target: 'server/routes/streamExtractRoutes.ts' },
  { id: 20, phase: 'F1-Architecture', title: 'Telemetría de sesiones DVB activas integrada en /health', target: 'server.ts' },

  // 21-30: F5 Security & Logger Hygiene
  { id: 21, phase: 'F5-Security-Resilience', title: 'Redacción automática de cabeceras Authorization: Bearer en logs de servidor', target: 'server/utils/logger.ts' },
  { id: 22, phase: 'F5-Security-Resilience', title: 'Enmascaramiento PII de direcciones de correo electrónico en logger de servidor', target: 'server/utils/logger.ts' },
  { id: 23, phase: 'F5-Security-Resilience', title: 'Redacción de parámetros sensibles api_key, apikey, secret y routes Xtream timeshift', target: 'server/utils/logger.ts' },
  { id: 24, phase: 'F5-Security-Resilience', title: 'Sanitización recursiva de objetos anidados (hasta profundidad 3) en Pino hooks', target: 'server/utils/logger.ts' },
  { id: 25, phase: 'F5-Security-Resilience', title: 'Cabecera Cross-Origin-Resource-Policy: cross-origin segura para proxies multimedia', target: 'server/middleware/errorHandler.ts' },
  { id: 26, phase: 'F5-Security-Resilience', title: 'Cabeceras X-DNS-Prefetch-Control y X-Permitted-Cross-Domain-Policies: none', target: 'server/middleware/errorHandler.ts' },
  { id: 27, phase: 'F5-Security-Resilience', title: 'Middleware createSlidingWindowRateLimiter con X-RateLimit-Limit/Remaining/Reset', target: 'server/middleware/errorHandler.ts' },
  { id: 28, phase: 'F5-Security-Resilience', title: 'Cabecera Retry-After automática en respuestas HTTP 429 con poda anti-fugas de memoria', target: 'server/middleware/errorHandler.ts' },
  { id: 29, phase: 'F5-Security-Resilience', title: 'Protección Rate-Limit específica en endpoint de IA /api/ai/request-movie', target: 'server.ts' },
  { id: 30, phase: 'F5-Security-Resilience', title: 'Migración de console.warn/error a logger estructurado en rutas clave del backend', target: 'server/routes/detailsAndSubtitles.ts' },

  // 31-40: F2 Performance, Vite & PWA Caching
  { id: 31, phase: 'F2-Performance', title: 'Carga no bloqueante de Google Fonts con media=print + onload swap y noscript fallback', target: 'index.html' },
  { id: 32, phase: 'F2-Performance', title: 'Meta color-scheme dark light nativa para evitar flashes blancos al navegar', target: 'index.html' },
  { id: 33, phase: 'F2-Performance', title: 'DNS Prefetch prioritario hacia CDN de carátulas image.tmdb.org y media.api-sports.io', target: 'index.html' },
  { id: 34, phase: 'F2-Performance', title: 'Code-splitting manualChunk dedicado para vendor-tanstack (@tanstack/react-query)', target: 'vite.config.ts' },
  { id: 35, phase: 'F2-Performance', title: 'Code-splitting manualChunk dedicado para vendor-zod (validación de esquemas)', target: 'vite.config.ts' },
  { id: 36, phase: 'F2-Performance', title: 'Code-splitting manualChunk para feature-music reduciendo bundle inicial de Home', target: 'vite.config.ts' },
  { id: 37, phase: 'F2-Performance', title: 'Code-splitting manualChunk para feature-sports (marcador y centro en vivo)', target: 'vite.config.ts' },
  { id: 38, phase: 'F2-Performance', title: 'Code-splitting manualChunk para feature-games (sala arcade y tableros multijugador)', target: 'vite.config.ts' },
  { id: 39, phase: 'F2-Performance', title: 'Regla Workbox CacheFirst para pósteres TMDB y escudos deportivos (14 días / LRU)', target: 'vite.config.ts' },
  { id: 40, phase: 'F2-Performance', title: 'Regla Workbox StaleWhileRevalidate para marcador y clasificación de fútbol en vivo', target: 'vite.config.ts' },

  // 41-50: F4 & F7 Accessibility (WCAG AA/AAA) & Keyboard Shortcuts
  { id: 41, phase: 'F4-DesignSystem-i18n', title: 'Enlace accesible Skip-to-Content visible al primer foco por teclado', target: 'src/components/ui/A11yUtilities.tsx' },
  { id: 42, phase: 'F4-DesignSystem-i18n', title: 'Bus global de anuncios para lectores de pantalla announceScreenReader()', target: 'src/components/ui/A11yUtilities.tsx' },
  { id: 43, phase: 'F4-DesignSystem-i18n', title: 'Región dual aria-live polite y assertive montada en el árbol global', target: 'src/components/ui/A11yUtilities.tsx' },
  { id: 44, phase: 'F4-DesignSystem-i18n', title: 'Modal interactivo de atajos de teclado activable con tecla ? en toda la app', target: 'src/components/ui/A11yUtilities.tsx' },
  { id: 45, phase: 'F4-DesignSystem-i18n', title: 'Cierre seguro de modal de atajos con Escape e interceptor limpio sin robar inputs', target: 'src/components/ui/A11yUtilities.tsx' },
  { id: 46, phase: 'F4-DesignSystem-i18n', title: 'Localización completa de ayudas de accesibilidad en ES, CA, EN y RIF', target: 'src/components/ui/A11yUtilities.tsx' },
  { id: 47, phase: 'F4-DesignSystem-i18n', title: 'Ancla semántica main-world-content con role=main en WorldShell para skip links', target: 'src/components/worlds/WorldShell.tsx' },
  { id: 48, phase: 'F7-TV-Spatial-UI', title: 'Atajo de apertura del panel de teclado accesible también desde menú de mundo', target: 'src/components/worlds/WorldShell.tsx' },
  { id: 49, phase: 'F4-DesignSystem-i18n', title: 'Montaje global de GlobalA11yHost dentro de AppGlobalModalsLayer sin engordar App.tsx', target: 'src/components/AppGlobalModalsLayer.tsx' },
  { id: 50, phase: 'F7-TV-Spatial-UI', title: 'Atajos compatibles con controles estándar YouTube/Cinema (Space/K/J/L/M/F/P/C)', target: 'src/components/ui/A11yUtilities.tsx' },

  // 51-60: F5 Client Resilience & Error Diagnostics
  { id: 51, phase: 'F5-Security-Resilience', title: 'Wrapper seguro safeStorageGetJson con recuperación automática ante JSON corrupto', target: 'src/utils/networkAndStorageResilience.ts' },
  { id: 52, phase: 'F5-Security-Resilience', title: 'Wrapper safeStorageSetJson con expulsión de claves naim_cache_* ante QuotaExceededError', target: 'src/utils/networkAndStorageResilience.ts' },
  { id: 53, phase: 'F5-Security-Resilience', title: 'Cliente fetchWithBackoff con reintentos exponenciales, jitter y soporte AbortSignal', target: 'src/utils/networkAndStorageResilience.ts' },
  { id: 54, phase: 'F5-Security-Resilience', title: 'Respeto automático de cabeceras Retry-After en respuestas 429/503 del servidor', target: 'src/utils/networkAndStorageResilience.ts' },
  { id: 55, phase: 'F5-Security-Resilience', title: 'Helper tipado fetchJsonWithRetry para llamadas resilientes de catálogo y deporte', target: 'src/utils/networkAndStorageResilience.ts' },
  { id: 56, phase: 'F5-Security-Resilience', title: 'Hook useNetworkDiagnostics con estado online/offline y effectiveType en vivo', target: 'src/utils/networkAndStorageResilience.ts' },
  { id: 57, phase: 'F5-Security-Resilience', title: 'Código determinista de referencia RTV-XXXX en AppErrorBoundary para diagnóstico', target: 'src/components/AppErrorBoundary.tsx' },
  { id: 58, phase: 'F5-Security-Resilience', title: 'Botón Copiar diagnóstico en un clic en pantalla de error con feedback accesible', target: 'src/components/AppErrorBoundary.tsx' },
  { id: 59, phase: 'F5-Security-Resilience', title: 'Atributo role=alert y aria-live=assertive en interfaz de recuperación de fallos', target: 'src/components/AppErrorBoundary.tsx' },
  { id: 60, phase: 'F5-Security-Resilience', title: 'Limpieza de errores de estado y recuperación suave + recarga forzada de caché SW', target: 'src/components/AppErrorBoundary.tsx' },

  // 61-70: F6 Mobile UX & F9 Sports Live Center
  { id: 61, phase: 'F9-Sports-Social', title: 'Comparativa directa Local vs Visitante encima de la tabla de clasificación (pos, pts, dif)', target: 'src/components/liveMatch/StandingsTab.tsx' },
  { id: 62, phase: 'F9-Sports-Social', title: 'Cálculo en vivo de brecha de puntos entre ambos equipos del partido actual', target: 'src/components/liveMatch/StandingsTab.tsx' },
  { id: 63, phase: 'F9-Sports-Social', title: 'Filtro rápido en tabla para ver todos los equipos o solo rivales en directo/zona clave', target: 'src/components/liveMatch/StandingsTab.tsx' },
  { id: 64, phase: 'F9-Sports-Social', title: 'Columna PPG (Puntos por partido) en escritorio con cifras tabulares alineadas', target: 'src/components/liveMatch/StandingsTab.tsx' },
  { id: 65, phase: 'F9-Sports-Social', title: 'Botón rápido para enfocar o saltar al equipo del partido dentro de ligas largas', target: 'src/components/liveMatch/StandingsTab.tsx' },
  { id: 66, phase: 'F9-Sports-Social', title: 'Botones táctiles min-h-10 en selectores Total / Casa / Fuera y grupos para móvil', target: 'src/components/liveMatch/StandingsTab.tsx' },
  { id: 67, phase: 'F6-Mobile-UX', title: 'Scroll vertical fluido sin encogimiento ni bloqueos tras bajar el reproductor', target: 'src/components/PlayerStageContainer.tsx' },
  { id: 68, phase: 'F6-Mobile-UX', title: 'Menús popover inferiores del reproductor centrados y protegidos contra recorte en móvil', target: 'src/components/player/PlayerBottomControlStrip.tsx' },
  { id: 69, phase: 'F9-Sports-Social', title: 'Indicador visual de forma reciente o estado en directo sin recargar tabla', target: 'src/components/liveMatch/StandingsTab.tsx' },
  { id: 70, phase: 'F6-Mobile-UX', title: 'Soporte multilenguaje ES/CA/EN/RIF coherente en pestaña de clasificación en directo', target: 'src/components/liveMatch/StandingsTab.tsx' },

  // 71-80: F3 Strict Type Safety & Zero-Any Cleanup
  { id: 71, phase: 'F3-TypeSafety-Tests', title: 'Eliminación de tipos any explícitos en standingsParser.ts con interfaces FotMob/ESPN', target: 'server/services/footballHelpers/standingsParser.ts' },
  { id: 72, phase: 'F3-TypeSafety-Tests', title: 'Tipado estricto de subtítulos y listas en detailsAndSubtitles.ts', target: 'server/routes/detailsAndSubtitles.ts' },
  { id: 73, phase: 'F3-TypeSafety-Tests', title: 'Eliminación de tipos any y console.warn en youtubeCatalog.ts con YtInitialSearchJson', target: 'server/routes/youtubeCatalog.ts' },
  { id: 74, phase: 'F3-TypeSafety-Tests', title: 'Tipado estricto de subtítulos y candidatos en catalogTrackResolver.ts', target: 'server/routes/streamExtractHelpers/catalogTrackResolver.ts' },
  { id: 75, phase: 'F3-TypeSafety-Tests', title: 'Unificación de logs de detalles TV en tvDetailsHandler.ts mediante Pino logger', target: 'server/routes/catalog/tvDetailsHandler.ts' },
  { id: 76, phase: 'F3-TypeSafety-Tests', title: 'Tipado explícito de TrackHealthInfo en TrackRankingService y StreamExtractRoutes', target: 'server/services/trackRankingService.ts' },
  { id: 77, phase: 'F3-TypeSafety-Tests', title: 'Unificación de logs en streamExtractRoutes.ts mediante Pino logger sin console.error', target: 'server/routes/streamExtractRoutes.ts' },
  { id: 78, phase: 'F3-TypeSafety-Tests', title: 'Unificación de logs en sports.ts mediante Pino logger con contexto de evento', target: 'server/routes/sports.ts' },
  { id: 79, phase: 'F3-TypeSafety-Tests', title: 'Control de longitud estricta <= 700 líneas verificado sobre todos los archivos editados', target: 'server.ts' },
  { id: 80, phase: 'F3-TypeSafety-Tests', title: 'Verificación de hook useMiniPlayerDrag.ts 100% libre de any tras desactivar auto-shrink', target: 'src/hooks/useMiniPlayerDrag.ts' },

  // 81-90: F10 Multi-Platform Ops, Audit & Documentation Ledger
  { id: 81, phase: 'F10-Ops-Audit', title: 'Endpoint REST JSON /api/audit/improvements-summary con desglose por fase y métricas', target: 'server.ts' },
  { id: 82, phase: 'F10-Ops-Audit', title: 'Endpoint descargable Markdown /api/audit/100-improvements para auditoría continua', target: 'server.ts' },
  { id: 83, phase: 'F10-Ops-Audit', title: 'Registro tipado central RIFFAN_100_IMPROVEMENTS consultable en runtime y tests', target: 'server/services/improvementsRegistry.ts' },
  { id: 84, phase: 'F10-Ops-Audit', title: 'Informe detallado auditoria-100-mejoras-f1-f11.md con inventario técnico real', target: 'auditoria-100-mejoras-f1-f11.md' },
  { id: 85, phase: 'F10-Ops-Audit', title: 'Actualización íntegra de WORKLOG.md con el progreso verificado F0 → F11', target: 'WORKLOG.md' },
  { id: 86, phase: 'F10-Ops-Audit', title: 'Verificación de reglas Firestore con ESLint sin advertencias ni regresiones RBAC', target: 'firestore.rules' },
  { id: 87, phase: 'F10-Ops-Audit', title: 'Verificación de headers de seguridad CSP y HSTS condicional para Cloud Run HTTPS', target: 'server/middleware/errorHandler.ts' },
  { id: 88, phase: 'F10-Ops-Audit', title: 'Telemetría de salud y resumen DVB/catalog-refresh preparada para monitorización /ready', target: 'server/routes/health.ts' },
  { id: 89, phase: 'F10-Ops-Audit', title: 'Preservación íntegra de invariantes PWA SW, Deep Links OG y /tv Smart TV', target: 'server/routes/spaFrontendMount.ts' },
  { id: 90, phase: 'F10-Ops-Audit', title: 'Compatibilidad total con pruebas de contrato previas (auditChecklistSync & uiUx20)', target: 'tests/auditChecklistSync.test.ts' },

  // 91-100: F3 & F11 Automated Verification Gate
  { id: 91, phase: 'F3-TypeSafety-Tests', title: 'Test unitario real de inspectHlsCodecManifest (vídeo válido vs audio-only)', target: 'tests/improvements100Verification.test.ts' },
  { id: 92, phase: 'F3-TypeSafety-Tests', title: 'Test unitario real de createSlidingWindowRateLimiter (429 + Retry-After + reset)', target: 'tests/improvements100Verification.test.ts' },
  { id: 93, phase: 'F3-TypeSafety-Tests', title: 'Test unitario real de maskSensitiveText para Bearer tokens, emails y Xtream creds', target: 'tests/improvements100Verification.test.ts' },
  { id: 94, phase: 'F3-TypeSafety-Tests', title: 'Test unitario real de createGracefulShutdownHandler verificando parada de timers y WS', target: 'tests/improvements100Verification.test.ts' },
  { id: 95, phase: 'F3-TypeSafety-Tests', title: 'Test unitario real de rankCandidateTracks asegurando prioridad idioma y estado up', target: 'tests/improvements100Verification.test.ts' },
  { id: 96, phase: 'F3-TypeSafety-Tests', title: 'Test unitario real de safeStorageSetJson con expulsión automática ante cuota llena', target: 'tests/improvements100Verification.test.ts' },
  { id: 97, phase: 'F3-TypeSafety-Tests', title: 'Test unitario real de fetchJsonWithRetry simulando fallo 503 y recuperación con backoff', target: 'tests/improvements100Verification.test.ts' },
  { id: 98, phase: 'F3-TypeSafety-Tests', title: 'Test de contrato de Vite manualChunks, Workbox caching y fuentes no bloqueantes HTML', target: 'tests/improvements100Verification.test.ts' },
  { id: 99, phase: 'F3-TypeSafety-Tests', title: 'Test de verificación de unicidad 1..100 y límite <= 700 líneas en módulos nuevos', target: 'tests/improvements100Verification.test.ts' },
  { id: 100, phase: 'F10-Ops-Audit', title: 'Validación final completa: Vitest + ESLint + tsc/Vite Build + Restart Dev Server', target: 'package.json' },
];

export function getImprovementsSummary() {
  const byPhase: Record<string, number> = {};
  for (const item of RIFFAN_100_IMPROVEMENTS) {
    byPhase[item.phase] = (byPhase[item.phase] || 0) + 1;
  }
  return {
    total: RIFFAN_100_IMPROVEMENTS.length,
    byPhase,
    items: RIFFAN_100_IMPROVEMENTS,
  };
}

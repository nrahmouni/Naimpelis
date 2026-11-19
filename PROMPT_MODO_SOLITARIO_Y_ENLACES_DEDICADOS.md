# Prompt Maestro de Arquitectura e Implementación: Modo Solitario / Con Amigos + Sistema Completo de Enlaces Dedicados (`riffantv.ai.studio`)

> **Instrucciones de uso:** Pega este prompt completo cuando quieras implementar la funcionalidad. Está diseñado específicamente para la arquitectura real de **RiffanTV** (React + Vite + Zustand + Socket/WS `roomHub` + Express SSR/API).

---

## PROMPT PARA IMPLEMENTAR

Implementa en **RiffanTV** (`riffantv.ai.studio`) dos capacidades estructurales totalmente integradas sin romper el sistema de salas sincronizadas en tiempo real ni el modo Smart TV (`/tv`):

1. **Modo Dual de Entrada y Sesión: "Ver en solitario" vs. "Crear sala / Ver con amigos" (con conversión instantánea de Solitario → Sala sin cortar la reproducción).**
2. **Sistema Universal de Enlaces Dedicados Semánticos (Deep-Linking + Sincronización de URL + OpenGraph SSR)** donde **cada sección, pack de canales, canal individual, película, serie, episodio, partido, filtro de programación de fútbol y juego** tenga su propia URL limpia y compartible bajo `https://riffantv.ai.studio/...`, incluso cuando el usuario lo descubre mediante el buscador global o IA.

Respeta estrictamente la arquitectura actual de la aplicación (modularidad por hooks/componentes, TypeScript estricto, Tailwind CSS, cero regresiones en `Smart TV /tv`, `Riffan Kids /kids`, `useBackInterceptor`, `WorldPortalTransition` y Firebase sync).

---

### BLOQUE 1 — TAXONOMÍA OFICIAL DE RUTAS Y ANTI-COLISIÓN CON SALAS

Actualmente `parseRoomFromWindow()` en `src/utils/shortLink.ts` interpreta **cualquier segmento único** (`/algo`) no incluido en `RESERVED_PATH_SEGMENTS` como un código de sala (`roomId`). Eso provocaría colisiones graves con `/dazn`, `/serie`, `/la-que-se-avecina`, `/cine`, etc.

Crea un módulo compartido cliente/servidor `src/shared/dedicatedRoutes.ts` que sea la **única fuente de verdad** para rutas reservadas, normalización de slugs y parseo/construcción de enlaces canónicos:

#### 1.1 Mapa de Rutas Dedicadas (`https://riffantv.ai.studio/...`)
- **Mundos / Secciones principales:**
  - `/cine` (películas; opcional `/cine?tab=movies`)
  - `/series` (catálogo de series: abre `cine` con `cineTab = 'series'`)
  - `/tv` -> **MANTENER** compatibilidad con Smart TV pairing (`/tv` o `?tvpair=1`)! Usar `/directo` o `/canales` para el mundo de TV en directo en navegador (y opcionalmente `/tdt` como alias del pack TDT España).
  - `/futbol` -> Programación y partidos de fútbol (`/futbol/hoy`, `/futbol/manana`, `/futbol/laliga`, `/futbol/champions`, `/futbol/barcelona`, `/futbol/real-madrid`)
  - `/juegos` y `/juegos/:gameSlug` (ej. `/juegos/pinturillo`, `/juegos/poker`, `/juegos/billar`, `/juegos/head-soccer`)
  - `/kids` (mantener `/kids`, `/riffankids`)
  - `/ads`, `/design-system`, `/auth-bridge` (mantener existentes)
- **Packs / Categorías de TV y Deporte (alias directos de primer nivel + prefijo `/pack/`):**
  - Top-level directos reservados: `/dazn`, `/movistar`, `/tdt`, `/beinsports`, `/espn`, `/adrar`, `/elahmad`, `/marruecos`, `/documentales`, `/usa`, `/europa`, `/famelack`, `/cricket`, `/latam`
  - Forma extendida: `/pack/:packSlug` (ej. `/pack/dazn`, `/pack/adrar-fr`, `/pack/tdt-generalistas`)
- **Canales concretos:**
  - `/canal/:channelSlug` (ej. `/canal/dazn-1`, `/canal/lasexta`, `/canal/movistar-laliga`, `/canal/la-1`, `/canal/tv3`)
  - Aliases cortos directos opcionales sin colisión para canales top (ej. `/dazn-1`, `/dazn-f1`, `/lasexta`, `/la-1`, `/movistar-plus`) registrados explícitamente en un diccionario de rutas reservadas antes de evaluar `roomId`.
- **Películas concretas:**
  - `/pelicula/:idOrSlug` (ej. `/pelicula/157336-interstellar` o `/pelicula/interstellar`)
  - Si lleva ID TMDB al principio (`157336-interstellar` o `157336`), resuelve instantáneamente por `tmdbId`; si solo lleva slug textual (`/pelicula/interstellar`), resuelve contra el catálogo/TMDB en backend.
- **Series concretas y episodios:**
  - `/serie/:idOrSlug` (ej. `/serie/la-que-se-avecina` o `/serie/31572-la-que-se-avecina`)
  - Con temporada/episodio opcional: `/serie/:idOrSlug/t:season/e:episode` o `/serie/:idOrSlug?t=1&e=3` (ej. `/serie/la-que-se-avecina/t1/e3`).
  - Al buscar una serie en el buscador (`UniversalHomeSearch`) o abrirla desde el catálogo/historial, la ficha de la serie y su botón "Compartir enlace" generan la URL dedicada `/serie/{tmdbId}-{slug}` (o `/serie/{slug}`).
- **Partidos de Fútbol:**
  - `/partido/:matchIdOrSlug` (ej. `/partido/barcelona-vs-real-madrid` o `/partido/espn-401234-fc-barcelona-real-madrid`)
- **Salas Privadas (Party Mode):**
  - `/sala/:roomId` y `/s/:roomId` (explícitas, recomendadas para enlaces nuevos de sala si se desea, o mantener `/:code4` para códigos cortos de 4 caracteres `[a-z0-9]{4}` que NO coincidan con ningún slug reservado).
  - Cualquier enlace dedicado puede combinarse opcionalmente con `?room=k8x4` para abrir ese contenido concreto directamente dentro de una sala con amigos (`https://riffantv.ai.studio/serie/la-que-se-avecina?room=k8x4`).

#### 1.2 Regla estricta de resolución en `parseAppRoute()` (orden de prioridad)
1. Rutas del sistema (`/api`, `/tv`, `/kids`, `/ads`, `/design-system`, `/auth-bridge`).
2. Prefijos tipados dedicados (`/pelicula/*`, `/serie/*`, `/canal/*`, `/pack/*`, `/partido/*`, `/futbol/*`, `/juegos/*`, `/cine`, `/series`, `/directo`, `/canales`, `/futbol`).
3. Slugs top-level reservados de packs y canales cortos (`/dazn`, `/movistar`, `/tdt`, etc.).
4. Salas (`/sala/:id`, `/s/:id`, `/r/:id`, `?room=:id` o segmento único válido no reservado de 2–32 chars).
5. En `normalizeCustomRoomSlug()` y `generateShortRoomCode()`: bloquear cualquier token presente en `RESERVED_PATH_SEGMENTS` y en el mapa de packs/canales top-level.

---

### BLOQUE 2 — MODO DE SESIÓN DUAL: SOLITARIO VS. VER CON AMIGOS

#### 2.1 Estado de Sesión en Store y Persistencia (`src/store/useAppStore.ts` + `src/hooks/useAppController.ts`)
- Añade `sessionMode: 'solo' | 'party'` al store de sesión (`sessionStorage` / `localStorage` bajo `riffantv_session_mode_v1`).
- Reglas de inicialización al arrancar la app:
  - Si la URL trae un `roomId` explícito (`/{roomCode}`, `/sala/{id}`, `?room={id}`) -> `sessionMode = 'party'`, `inRoom = true` (y si trae además una ruta dedicada, carga ese destino dentro de la sala).
  - Si la URL es un **enlace dedicado** (`/serie/...`, `/pelicula/...`, `/dazn`, `/canal/...`, `/futbol/...`, `/cine`, `/series`, `/directo`, `/juegos/...`) y **no** trae `?room=` -> **entra directamente sin bloquear en el Lobby**, en `sessionMode = 'solo'` (usando el perfil guardado en `localStorage` o generando perfil invitado automático silencioso si es la primera visita, conservando el `GuestWelcomePopup` discreto o editable en cabecera).
  - Si la URL es la raíz `/` sin sala activa -> muestra `LobbyScreen` con las dos opciones claras.

#### 2.2 Rediseño funcional de `LobbyScreen.tsx`
- Mantén el bloque de identidad (apodo / monograma / aleatorio / Google Sign-In / idiomas / ajustes / QR / Unirme con código / Salas recientes).
- Sustituye el único botón `"Entrar"` por una elección clara y equilibrada en la tarjeta principal:
  1. **Opción A — `"Entrar en solitario"` (Modo Personal / Mi Perfil):**
     - Botón limpio para explorar y reproducir cine, series, canales y fútbol sin crear una sala ni invitar a nadie.
     - No genera `roomId`, no conecta el WebSocket de sala (`socketService`), no aparece `FloatingRoomBubble` ni alertas de sala, y la barra de direcciones permanece en `/` (o en la ruta dedicada de lo que el usuario vaya abriendo).
     - Mantiene intactos historial (`watchHistory`), `watchlist`, canales favoritos, perfil de Google y vinculación con Smart TV.
  2. **Opción B — `"Crear sala con amigos"` (Watch Party Sincronizado):**
     - Genera código corto `/{code}`, cambia `sessionMode = 'party'`, conecta `socketService` contra `roomHub` y abre la sala lista para invitar amigos, chatear, hacer cola compartida, encuestas y jugar online.
- Debajo (o en acción secundaria), mantener `"Unirme con código"` y los chips de `"Continuar en tus salas"` (que al pulsarse entran en `sessionMode = 'party'`).

#### 2.3 Aislamiento seguro de Socket / Estado cuando `sessionMode === 'solo'`
- En `useRoomSocketEvents.ts`: si `sessionMode === 'solo'` (o `!inRoom || !roomId`), **no conectar** WebSocket de sala (o solo mantener presencia global si el usuario está logueado con Google y quiere recibir invitaciones directas, sin unirse a ninguna `RoomRecord`).
- En `usePlaybackOrchestrator.ts`, `useMovieAndSeriesPlayback.ts` y `useLiveAndQueuePlayback.ts`:
  - Hoy muchas acciones llaman a `socketService.syncVideoState(...)` o comprueban `canChangeMedia`.
  - Crea una capa limpia (`syncOrSetLocalVideoState(action, nextVideoState)`):
    - Si `sessionMode === 'party'`: valida `canChangeMedia` y emite por `socketService.syncVideoState(...)`.
    - Si `sessionMode === 'solo'`: aplica `setVideoState(...)` directamente en local con latencia 0 ms, sin restricciones de host ni roundtrips de WebSocket!
- En `EntryHomeBentoGrid.tsx` y `App.tsx`:
  - Cuando `sessionMode === 'solo'`:
    - Ocultar `FloatingRoomBubble` (o sustituirlo por un botón compacto no intrusivo solo si desea invitar).
    - La tarjeta de `Sala con Amigos` en el bento debe reflejar estado **"Crear sala · Ver con amigos"** en lugar de mostrar participantes falsos o conteo `1` de sala vacía; al pulsarla desde Solitario, abre un sheet rápido para crear sala (llevándose lo que se esté reproduciendo) o unirse por código.

#### 2.4 Conversión instantánea "Solitario → Sala con amigos" (`upgradeSoloToPartyRoom`)
- Mientras el usuario está en `sessionMode === 'solo'` (por ejemplo viendo *La que se avecina* en `/serie/la-que-se-avecina` o viendo *DAZN 1* en `/canal/dazn-1`):
  - En el reproductor (`NativeCinemaPlayer` / barra de estado) y en la cabecera (`WorldShell`), mostrar un botón claro **"Ver con amigos"** / **"Crear sala con esto"**.
  - Al pulsarlo:
    1. Genera `newRoomId = generateShortRoomCode(4)`.
    2. Cambia `sessionMode = 'party'`, `roomId = newRoomId`, `inRoom = true`.
    3. Conecta al WebSocket y envía el `videoState` actual (con el `currentTime` real del `<video>`) como estado inicial de la sala **sin reiniciar ni interrumpir el reproductor**.
    4. Actualiza la URL a `/{newRoomId}` (o mantiene la ruta dedicada con `?room={newRoomId}` y copia/muestra el enlace corto `https://riffantv.ai.studio/{newRoomId}` en un toast/modal de invitación).

---

### BLOQUE 3 — RESOLUCIÓN DE ENLACES DEDICADOS Y SINCRONIZACIÓN CON BUSCADOR Y REPRODUCTOR

#### 3.1 Endpoint Backend Unificado: `GET /api/resolve-link?path=...`
Crea `server/routes/deepLinkResolver.ts` y regístralo en `server.ts`:
- Recibe `path` (y query params opcionales como `t`, `e`, `lang`) y resuelve de forma tolerante y cacheada (`LruTtlCache`) cualquier entidad:
  - **Series (`/serie/:idOrSlug`):**
    - Si empieza por dígitos (`12345-...`), extrae `tmdbId` y consulta `handleTvDetailsRequest` / TMDB TV details.
    - Si es slug textual (ej. `la-que-se-avecina`), busca en caché de catálogo de series + búsqueda TMDB (`/search/tv`) el mejor match en español/inglés, obtiene su `tmdbId`, devuelve ficha completa (`CatalogMovie` + `TvSeriesDetails`) y su slug canónico (`/serie/{tmdbId}-{slug}`).
  - **Películas (`/pelicula/:idOrSlug`):**
    - Igual: soporta `{tmdbId}-{slug}`, `{tmdbId}` o `{slug}` textual (buscando en catálogo local + TMDB `/search/movie`).
  - **Canales (`/canal/:slug` o alias directo `/dazn-1`, `/lasexta`):**
    - Normaliza nombres e IDs de `SPANISH_TDT_CHANNELS` + canales sincronizados IPTV (`applySyncedStreamsToChannels`) + canales mundo/ADRAR/Elahmad/Famelack/Sports247 (usando normalizador sin tildes `slugify`). Devuelve el `SpanishTdtChannel` exacto.
  - **Packs (`/dazn`, `/movistar`, `/tdt`, `/pack/:slug`):**
    - Mapea al `tdtCategory` y `tvRegion` exactos (y en el caso de `/dazn` o `/movistar` o `/futbol/*`, permite abrir TV filtrada o Fútbol filtrado con un clic).
  - **Programación y Partidos de Fútbol (`/futbol/*`, `/partido/:idOrSlug`):**
    - Busca en `getPermanent247SportsMatches()`, `getCachedSportsMatches()` y la agenda de fútbol del día (`cachedFootballBoard` / `fetchFotmobDayIndex`) por `match.id` o slug normalizado de equipos (`home-vs-away`).
    - Si es un filtro de programación (`/futbol/hoy`, `/futbol/barcelona`, `/futbol/real-madrid`, `/futbol/laliga`, `/futbol/champions`), devuelve el `futbolScope` correspondiente (`dayOffset`, `leagueFilter`, `searchQuery`).
  - **Juegos (`/juegos/:gameSlug`):**
    - Mapea `billar` -> `pool`, `pinturillo`, `poker`, `blackjack`, `chapas`, `headsoccer`, `parchis`, `uno`, `chess`, etc.

#### 3.2 Integración React en Navegación, Búsqueda y Compartir
1. **Sincronización bidireccional URL ↔ Estado UI (`useDeepLinkRouter.ts`):**
   - Al arrancar (`useAppBootstrap` / `useAppController`): si la ruta inicial es un enlace dedicado, llama a `resolveDeepLinkTarget()` (con fallback inmediato si ya está en `quickPool`, y llamada a `/api/resolve-link` si necesita resolver un slug como `/serie/la-que-se-avecina`), mostrando un indicador sutil de carga (`RiffanLoaderR`) solo mientras resuelve el recurso y abriendo inmediatamente:
     - **Película:** abre `MediaDetailsModal` (o auto-reproduce si lleva `?play=1`).
     - **Serie:** abre `SeriesEpisodePickerModal` de esa serie (en la temporada/episodio indicados si viene `/t1/e3`, o directamente reproduciendo si lleva `?play=1`).
     - **Canal:** entra en mundo TV / reproductor y lanza la reproducción del canal (`handlePlayTdtChannel`) manteniendo la URL `/canal/...`.
     - **Pack:** entra en `LiveTvWorldView` con la categoría/región del pack preseleccionada (`tdtCategory = 'dazn'`, `tvRegion = 'es'`, etc.).
     - **Fútbol / Partido:** entra en `FootballWorldView` con los filtros de liga/equipo aplicados, o abre el partido concreto (`handlePlaySportsMatch` / `FootballMatchDetailSheet`).
     - **Juego:** entra en `juegos` y abre el juego concreto (`forcedOpenGame`).
   - Al navegar dentro de la app (cambiar de mundo, abrir ficha de película, abrir ficha de serie, reproducir canal, cambiar pack de TV, filtrar fútbol, buscar y abrir un resultado en `UniversalHomeSearch`), actualizar la URL vía `window.history.pushState` / `replaceState` (sin recargar página!) cuando estés en modo `'solo'` (y en modo `'party'` opcionalmente mantener `/{roomId}` + botón explícito para copiar enlace dedicado del contenido).
   - Escuchar `popstate` para que el botón **Atrás** del navegador/móvil cierre modales o vuelva a la sección anterior limpiamente sin romper la app.

2. **Buscador Inteligente (`UniversalHomeSearch.tsx` + `UniversalSearchResultsList.tsx`) y Botones de Compartir en todas las tarjetas/modales:**
   - Todo resultado que aparezca en el buscador (película, serie como *"La que se avecina"*, canal como *"DAZN 1"*, partido de fútbol, juego) debe calcular su URL canónica (`buildCanonicalShareUrl(...)` -> `https://riffantv.ai.studio/...`).
   - Añadir un botón compacto **"Copiar link"** / **"Compartir"** (usando `navigator.share` en móvil con fallback a `navigator.clipboard.writeText` + toast de confirmación con el enlace exacto `riffantv.ai.studio/...`) en:
     - `MediaDetailsModal` (películas y series)
     - `SeriesEpisodePickerModal` (enlace a la serie completa y enlace al episodio concreto)
     - `LiveTvWorldView` (cada canal + cabecera del pack activo, p. ej. compartir `/dazn`, `/movistar`, `/tdt`)
     - `FootballMatchboard` y `FootballMatchRow` (compartir partido `/partido/...` o filtro `/futbol/barcelona`)
     - `UniversalSearchResultsList` (acceso directo a copiar link del resultado encontrado)
     - `GamesHubSection` (compartir enlace directo al juego `/juegos/...`)
     - `RiffanKidsHub` (enlaces `/kids/...` si aplica).

#### 3.3 Metadatos OpenGraph / SEO dinámicos en `server.ts`
- En `server.ts`, cuando entre una petición `GET` HTML para una ruta dedicada (`/pelicula/*`, `/serie/*`, `/canal/*`, `/dazn`, `/movistar`, `/tdt`, `/futbol*`, `/partido/*`, `/cine`, `/series`, `/juegos*`) y no sea un asset ni `/api/*`:
  - Resolver rápidamente (con timeout corto <= 900 ms desde caché o lookup ligero) `title`, `description` y `image` (póster TMDB o logo del canal).
  - Reemplazar dinámicamente `<title>`, `<meta name="description">`, `<meta property="og:title">`, `<meta property="og:description">` y `<meta property="og:image">` en la plantilla `index.html` antes de enviarla.
  - Así, al compartir `https://riffantv.ai.studio/serie/la-que-se-avecina` o `https://riffantv.ai.studio/dazn` en WhatsApp, Telegram o iMessage, aparecerá la tarjeta enriquecida con su título y carátula real.

---

### BLOQUE 4 — RESTRICCIONES TÉCNICAS Y VERIFICACIÓN OBLIGATORIA
1. **No romper nada existente:**
   - Mantener funcionando `/tv`, `/kids`, `/ads`, `/design-system`, `/auth-bridge` y el sistema completo de salas (`/{4chars}`, `/s/{id}`, `?room={id}`, PIN, Watch Party, Voz, Smart TV pairing y Chromecast/AirPlay).
   - Mantener el comportamiento limpio cuando el entorno esté en preview privado (`isPrivateDevPreviewHost()`): los enlaces que se copian o muestran para compartir deben usar `https://riffantv.ai.studio/...` como dominio público canónico, mientras que `window.history.pushState` usa rutas relativas (`/serie/...`, `/dazn`, etc.) para que funcione idéntico tanto en preview como en producción.
2. **Orden recomendado de implementación:**
   - Paso 1: Crear `src/shared/dedicatedRoutes.ts` (tipos, tabla de packs/mundos/canales reservados, `slugify`, `parseAppRoute`, `buildCanonicalRoute`).
   - Paso 2: Implementar `server/routes/deepLinkResolver.ts` + meta-tags OpenGraph dinámicos en `server.ts`.
   - Paso 3: Añadir `sessionMode: 'solo' | 'party'` al store y refactorizar `LobbyScreen.tsx` + `useRoomLifecycleActions.ts` + `useRoomSocketEvents.ts` + `usePlaybackOrchestrator.ts` (incluyendo conversión Solitario → Sala sin cortar vídeo).
   - Paso 4: Conectar `useDeepLinkRouter.ts` en `useAppController.ts` y cablear filtros iniciales en `CineWorldView`, `LiveTvWorldView`, `FootballWorldView`, `FootballMatchboard`, `GamesHubSection`.
   - Paso 5: Añadir botones "Copiar enlace dedicado" en modales, buscador (`UniversalHomeSearch`), canales, packs y partidos.
3. **Verificación final exigida:**
   - Ejecutar `tsc --noEmit` (cliente y servidor) y lint.
   - Escribir tests unitarios para `parseAppRoute`, `buildCanonicalRoute`, anti-colisión con `normalizeCustomRoomSlug`, y resolución en `/api/resolve-link`.
   - Verificar en navegador real:
     - Entrada en modo **Solitario** desde `/` (sin crear sala ni burbuja flotante) -> navegar y reproducir -> pulsar **Ver con amigos** y comprobar conversión a sala manteniendo el reproductor activo.
     - Entrada en **Crear sala con amigos** desde `/`.
     - Entrada directa por URL dedicada: `/dazn`, `/serie/la-que-se-avecina`, `/pelicula/157336-interstellar`, `/canal/lasexta`, `/futbol/barcelona`.
     - Buscar *"La que se avecina"* en el buscador y verificar que genera y copia su enlace dedicado en `riffantv.ai.studio`.

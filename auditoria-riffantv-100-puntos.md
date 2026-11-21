# Auditoría Técnica Integral de RiffanTV & Riffan Music — 100 Puntos de Revisión, Corrección y Mejora

Documento generado tras la inspección exhaustiva de toda la arquitectura frontend (`React + Vite + Zustand`), backend (`Express + TypeScript + FFmpeg/TLS`), motor multimedia TDT/Xtream, motor de audio Riffan Music y generador nativo de APKs Android / Google TV.

---

## Bloque I — Señal TDT en Vivo, laSexta, Belix Xtream y Transcodificación (Puntos 1–20)

1. **Eliminación total de IP muerta (`90.163.85.113:8093`)**: El origen TCP `90.163.85.113:8093` producía `Connection timed out` en `laSexta`, `Neox`, `Nova`, `Mega`, `Atreseries`, `Teledeporte` y canales Mediaset. Debe permanecer bloqueado en `curlAndH2Client.ts` y erradicado de todas las listas de canales.
2. **Recuperación de `laSexta` HD (vídeo + audio)**: Priorizar stream Shark Pro `743035` (`direct_hls`) sobre proxy Belix local con fallback a Atresplayer oficial y TDTChannels, garantizando códecs H.264 + AAC compatibles con Chrome/Safari/Android TV.
3. **Resincronización de Audio/Vídeo en MPEG-TS (`dvbTranscoder.ts`)**: El transcodificador FFmpeg para flujos `.ts` de Enigma2/Xtream requiere `-fflags +genpts+discardcorrupt` y `-avoid_negative_ts make_zero` para evitar que laSexta u otros canales TDT pierdan el audio tras cortes de paquetes.
4. **Caché de manifiesto HLS corto en Belix (`belixProxyHelpers.ts`)**: Los enlaces `direct_hls` (`live/.../743035.m3u8`) deben renovarse con TTL corto (<15s) y reintento automático de sesión si Xtream devuelve `403` o `404`.
5. **Autocompletado rápido de credenciales Belix (`8996754342` / `4228202130`)**: El servidor (`ENV` + `belixXtreamClient.ts`) y la UI (`BelixLiveTab.tsx`) deben pre-cargar credenciales válidas y mostrar el listado completo de canales sin obligar a reescribirlas manualmente en cada sesión.
6. **Validación preventiva de canales muertos (DRM/no existentes)**: Canales con DRM estricto sin feed abierto viable (`FDF`, `DMAX`, `Divinity`, `DKISS` cuando carecen de origen activo) deben depurarse o marcarse como no disponibles en lugar de colgar el reproductor 30 segundos en `buffering`.
7. **Verificación activa de salud (`channelHealthMonitor.ts`)**: Ejecutar sondeos escalonados en segundo plano para degradar automáticamente streams con latencia >4s o HTTP 5xx sin bloquear las peticiones del usuario.
8. **Soporte CORS y encabezados `Referer`/`User-Agent` por dominio**: Los CDN de RTVE, Atresmedia, CCMA (`3cat`) y Shark Pro requieren `User-Agent` y `Origin` específicos en `server/routes/proxies/*` para evitar bloqueos por hotlink.
9. **Detección automática de streams `audio-only` o vídeo negro**: El monitor de streams debe inspeccionar los tracks del manifiesto HLS (`CODECS`) para advertir cuando falta la pista de vídeo (`avc1`/`hev1`) o la de audio (`mp4a`).
10. **Separación de rutas proxy HLS vs TS**: Mantener un router dedicado para segmentos `.ts`/`.m4s` con `keep-alive` HTTP y compresión desactivada en vídeo binario para no desperdiciar CPU en Node.
11. **Timeouts escalonados en extracción (`streamExtractRoutes.ts`)**: Limitar los intentos fallidos de fuentes secundarias a 2.5s–3.5s para que el zapping entre canales TDT sea inferior a 2 segundos.
12. **Subtítulos DVB/WebVTT y pistas duales (V.O. / Audiodescripción)**: Preservar `#EXT-X-MEDIA:TYPE=AUDIO` y `#EXT-X-MEDIA:TYPE=SUBTITLES` al reescribir manifiestos maestros en el proxy.
13. **Guía EPG sincronizada (`epgService.ts`)**: Corregir desfases horarios (UTC vs `Europe/Madrid` CET/CEST) y cachear el XMLTV parseado en memoria con refresco incremental.
14. **Modo "El Chiringuito / Halftime Break" (`useHalftimeChiringuitoBreak.ts`)**: Garantizar que el cambio automático de partido a tertulia use feeds vivos (Shark Pro / YouTube oficial) y nunca URLs locales obsoletas.
15. **Prevención de fugas de procesos FFmpeg**: Implementar `SIGKILL` limpio con timeout de inactividad (45s sin peticiones de segmentos) en `dvbTranscoder.ts` para evitar procesos huérfanos en el servidor.
16. **Adaptación de buffer HLS.js para redes móviles**: Configurar `maxBufferLength`, `lowLatencyMode` y recuperación automática de `fragLoadError` / `bufferStalledError` sin reiniciar todo el reproductor.
17. **Indicador real de tasa de bits y resolución en reproductor TV**: Mostrar si la señal entrante es `1080p50`, `720p` o `SD` leído directamente desde los niveles de HLS.js en lugar de etiquetas estáticas.
18. **Protección SSRF en proxies de streaming**: Validar que ninguna URL proxeada apunte a rangos loopback o privados (`127.0.0.1`, `169.254.x.x`, `10.x.x.x`) salvo las configuradas explícitamente para DVB/Belix.
19. **Fallback Picture-in-Picture y audio en segundo plano**: Mantener la sesión `MediaSession` sincronizada con nombre de canal, programa actual de EPG y logo oficial del canal.
20. **Limpieza automática de segmentos temporales FFmpeg**: Purgar `/tmp` al arrancar y al cerrar cada transcodificación para no llenar el disco en ejecuciones prolongadas.

---

## Bloque II — Riffan Music: Motor de Audio, Canciones Completas y Catálogo (Puntos 21–40)

21. **Sondeo automático y backup de `client_id` de SoundCloud**: Renovar dinámicamente el `client_id` desde los bundles JS públicos de SoundCloud con lista de respaldo validada en vivo cuando caduque o devuelva `401/403`.
22. **Regla estricta de canción completa (cero previews de 30s)**: Rechazar fragmentos `preview`/`snipped` (`duration <= 45s`) de iTunes/Deezer como fuente final de audio; iTunes y Spotify solo deben aportar metadatos ricos, ISRC y carátulas HD.
23. **Parsing inteligente de títulos `Artista - Canción` (`isStrictTrackMatch`)**: En canales comunitarios o subidas de YouTube/SoundCloud donde el uploader no coincide con el artista oficial, validar el título completo (`artist` + `title`) antes de descartar resultados válidos.
24. **Cadena completa de transcodings SoundCloud**: Iterar primero `progressive` MP3 y luego todos los flujos `hls` (`audio/mpeg`, `audio/mp4`, Opus) a través de las 3 mejores coincidencias antes de dar por fallida la pista.
25. **Dimensionado seguro del reproductor oculto de YouTube (`MusicAudioEngine.tsx`)**: Un `<iframe>` `0x0` o `display:none` provoca que Chrome/Android pausen o degraden el audio; mantener un contenedor `192x112px` (`opacity-[0.001]`, `pointer-events-none`) garantiza reproducción continua.
26. **Cascada multi-fuente en Riffan Music (`resolveTrackPlayback`)**: Ordenar resolución por: caché local -> SoundCloud Go+/full -> YouTube/YTM vía Innertube/oEmbed/search -> Audius -> Jamendo -> archive.org.
27. **Pre-carga de la siguiente canción en cola (`prefetchNextTrack`)**: Resolver el stream de la pista `index + 1` cuando falten 20 segundos para terminar la actual, eliminando silencios entre canciones.
28. **Crossfade real WebAudio / Dual Element**: Permitir transición suave configurable (0–6s) entre pistas HTMLAudio para una experiencia continua de nivel estudio.
29. **Descarga Offline y MP3 real (`offlineLibrary` + `startDownloadMp3Job`)**: Guardar los blobs de audio en IndexedDB/OPFS con verificación de tamaño mínimo (>400KB) para evitar guardar respuestas HTML o errores 404 como pistas offline.
30. **Enriquecimiento del catálogo editorial (`homeData`)**: Alimentar el inicio con listas vivas de España, Urbano, Pop, Electrónica, Rock/Indie, R&B, Chill/Lo-Fi, Flamenco, Latinoamérica y mixes globales (Marruecos, Árabe, África, Rumanía, etc.) usando múltiples proveedores reales sin mocks estáticos.
31. **Detección de versiones "Live / Cover / Slowed / Nightcore"**: Penalizar remixes no solicitados y versiones ralentizadas cuando el usuario reproduce la canción de estudio original.
32. **Sincronización exacta de `durationSec` real**: Actualizar la duración de la barra de progreso con el `duration` real del `<audio>` o `YT.Player` cargado para que el porcentaje y el tiempo restante coincidan al segundo.
33. **Recuperación ante expiración de URLs prefirmadas**: Si una URL de stream caduca tras pausar >15 minutos, re-resolver automáticamente la misma pista conservando `currentTime` (`seekTo`).
34. **Normalización de volumen (ReplayGain / WebAudio DynamicsCompressor)**: Atenuar picos bruscos entre canciones antiguas y masters modernos mediante el nodo `DynamicsCompressorNode` en el grafo WebAudio.
35. **Ecualizador gráfico real de 5–10 bandas**: Conectar el ecualizador al grafo `MediaElementAudioSourceNode` -> `BiquadFilterNode` cuando la fuente permita CORS, y aplicar fallback limpio cuando YouTube IFrame gestione el audio.
36. **Búsqueda unificada tolerante a tildes y erratas**: Normalizar (`NFKD`) artistas y títulos en backend y cliente para que búsquedas sin tildes o con featurings (`feat.`, `ft.`, `&`) devuelvan resultados exactos.
37. **Letras sincronizadas (`Lyrics`)**: Consultar múltiples fuentes de letras (LRCLIB / Genius fallback) con scroll automático si existen timestamps LRC.
38. **Modo Coche / Conducción (`DriveModeModal`)**: Aumentar área táctil de botones (>56px), alto contraste OLED y controles por voz sin saturar la pantalla.
39. **Historial persistente de búsqueda y colas restaurables**: Persistir en `localStorage`/Zustand la última cola, posición y modo (`shuffle`/`repeat`) entre recargas.
40. **Visualizador de espectro sincronizado por `AnalyserNode` + Beat Engine**: Reemplazar animaciones estáticas por muestreo real `sampleMusicSpectrum` cuando hay `AnalyserNode` CORS, y un motor de pulso armónico sincronizado al reloj de reproducción para iframes YouTube.

---

## Bloque III — Algoritmo de Gustos y Motor de Recomendación Musical (Puntos 41–55)

41. **Modelo de afinidad multi-señal (`musicTasteEngine.ts`)**: Ponderar explícitamente favoritos (`+10`), likes (`+7`), canciones guardadas en playlists (`+2.2`), historial reciente (`+4.5`) y conteos de reproducción (`+1.4 * count`).
42. **Registro de completados vs saltos tempranos (`trackSignals`)**: Si el usuario escucha >75% de la pista (`recordTrackComplete`), sumar `+3.5` al artista y canción; si la salta antes de 25s (`recordTrackSkip`), penalizar `-2.5` para dejar de insistir con artistas rechazados.
43. **Exclusión inteligente de artistas ignorados (`skippedArtists`)**: Filtrar automáticamente de las recomendaciones de Inicio y Radio a artistas con `>= 2` saltos tempranos y `0` escuchas completas.
44. **Endpoint dedicado `POST /api/music/recommendations`**: Calcular en servidor el perfil de usuario agregado, lanzar consultas paralelas por semillas (`topArtists`, `favoriteGenres`, `likedSeeds`, `recentSeeds`), deduplicar por `id` y `artist+title`, y devolver `reasonLabel` legible.
45. **Estanterías dinámicas personalizadas en Inicio (`RiffanMusicWorldView.tsx`)**: Renderizar bloques dinámicos `"Para ti según [Artista 1] y [Artista 2]"` y `"Porque escuchaste [Artista]"`, actualizados reactivamente al dar like o guardar playlists.
46. **Reordenación personalizada de novedades (`rankTracksByTaste`)**: Ordenar listas generales como *Novedades para ti* elevando artistas afines y hundiendo artistas frecuentemente saltados.
47. **Cola infinita / Radio inteligente (`fetchAndEnqueueRelatedTracks`)**: Cuando la cola llega al final, alimentar el siguiente lote desde el motor de gustos combinado con artistas similares a la pista en curso.
48. **Decay temporal de gustos**: Dar mayor peso a las últimas 25 escuchas recientes frente a reproducciones antiguas para que el algoritmo evolucione si cambias de género o estado de ánimo.
49. **Balance Exploración / Explotación**: Mezclar un ~70% de pistas alineadas con artistas conocidos y ~30% de descubrimiento por género/colaboraciones para evitar burbujas repetitivas.
50. **Feedback negativo explícito opcional**: Añadir acción rápida "No me interesa este artista/tema" que registre un skip fuerte en `trackSignals`.
51. **Agrupación por perfil acústico / Mood**: Etiquetar sesiones nocturnas (`Chill/Lo-Fi`) frente a entrenamiento o coche (`Urbano/Electrónica`) según la hora del día.
52. **Semillas mixtas multi-artista en playlists importadas**: Extraer los 5 artistas dominantes de cada CSV/ZIP de Exportify importado para enriquecer inmediatamente `tasteProfile` sin esperar días de escucha.
53. **Deduplicación estricta de variantes en recomendaciones**: Evitar recomendar la misma canción en versiones distintas (*Clean*, *Radio Edit*, *Remastered*) si ya está en likes o ya sonó recientemente.
54. **Telemetría local de privacidad cero-servidor**: Todo el historial de `trackSignals` y `listeningStats` reside en el dispositivo del usuario sin requerir base de datos externa obligatoria ni rastreo de terceros.
55. **Transparencia de recomendaciones**: Mostrar siempre al usuario el motivo real de la recomendación (*"Para ti según Quevedo y Eminem"*, *"Porque escuchaste..."*) en cabecera de cada carrusel.

---

## Bloque IV — Exportify Propio (.zip / .csv), Takeout y Rescate OAuth Google 403 (Puntos 56–70)

56. **Lector nativo de archivos `.zip` sin dependencias (`src/utils/zipImport.ts`)**: Implementar parser ZIP puro en navegador leyendo el End of Central Directory (EOCD) y soportando entradas `STORE` (método 0) y `DEFLATE` (método 8 vía `DecompressionStream('deflate-raw')`).
57. **Importación directa del ZIP oficial de Exportify**: Exportify ahora entrega todas las playlists dentro de un único `.zip` de múltiples `.csv`; el importador debe extraer y fusionar cada `.csv`/`.tsv`/`.json` interno en playlists reales conservando el nombre de cada archivo como nombre de playlist.
58. **Herramienta equivalente integrada ("Exportify Studio")**: Añadir una pestaña propia en el modal de importación/exportación que permita al usuario exportar toda su biblioteca (Canciones que te gustan + Playlists personales) a un archivo `.zip` multi-CSV o a un `.csv` estándar formato Exportify (`Track URI`, `Track Name`, `Artist Name(s)`, `Album Name`, `Duration (ms)`).
59. **Compatibilidad con Google Takeout `.zip`**: Reconocer automáticamente JSON/CSV dentro del ZIP exportado por Google Takeout (`YouTube Music/playlists/*.csv`, `canciones_que_te_gustan.csv`, `music-library-songs.csv`, historial `watch-history.json`).
60. **Detección del error Google OAuth `Error 403: access_denied` ("no ha completado el proceso de verificación")**: Cuando la app OAuth en modo prueba de Firebase/Google bloquea a cuentas no incluidas como test users (`gen-lang-client-*.firebaseapp.com`), detectar el error en `musicPlatformOAuth.ts` y `SpotifyYtmImportModal.tsx`.
61. **Panel de rescate en 1 clic ante error `403` de Google/YouTube**: En lugar de dejar al usuario bloqueado con un mensaje genérico, mostrar instrucciones claras y dos botones directos sin fricción: *Pegar enlace público de playlist YTM* e *Importar ZIP/CSV (Takeout / Exportify)*.
62. **Publicación de OAuth Consent Screen en producción (acción de consola GCP)**: Documentar que para eliminar el error `403: access_denied` en cuentas arbitrarias sin ser tester, en Google Cloud Console (`APIs & Services -> OAuth consent screen`) debe pasarse el estado de *Testing* a *In Production* o añadir `nismac.100@gmail.com` en *Test users* cuando solo requiera uso restringido.
63. **Eliminación de scopes sensibles innecesarios en OAuth**: Limitar Google OAuth únicamente a `youtube.readonly` y no solicitar scopes restringidos que desencadenen verificación manual obligatoria de Google si el usuario solo importa playlists públicas.
64. **Normalización multi-idioma de columnas CSV**: Soportar encabezados de Exportify en inglés, español (`Nombre de la canción`, `Artista(s)`), YouTube Music Takeout (`Video ID`, `Playlist Title`) y TuneMyMusic/Soundiiz.
65. **Validación de archivos grandes y límite seguro de memoria**: Filtrar dentro del `.zip` únicamente archivos de texto relevantes (`.csv`, `.tsv`, `.txt`, `.json`) ignorando binarios o miniaturas para evitar picos de RAM en móvil.
66. **Resolución automática de pistas tras importar CSV/ZIP**: Vincular `Track Name` + `Artist` importados con el catálogo buscable para que cada canción importada sea inmediatamente reproducible entera al pulsar Play.
67. **Detección de duplicados al re-importar**: Evitar duplicar playlists o canciones idénticas si el usuario vuelve a cargar un `.zip` actualizado; ofrecer fusión incremental.
68. **Enlace directo a playlists públicas de Spotify / YouTube Music sin login (`musicImporter.ts`)**: Permitir pegar URLs `open.spotify.com/playlist/...` o `music.youtube.com/playlist?list=...` usando extracción server-side sin depender de tokens OAuth personales.
69. **Exportación rápida desde cualquier playlist de la biblioteca**: Mantener el botón de descarga Exportify CSV por playlist individual además del nuevo paquete `.zip` completo de Exportify Studio.
70. **Retroalimentación detallada tras importar**: Mostrar conteo exacto de playlists creadas, canciones importadas, duplicados omitidos y artistas añadidos al perfil de gustos.

---

## Bloque V — APKs Android (`mobile`, `music`, `tv`), Google TV y Navegación Nativa (Puntos 71–85)

71. **Solución de navegación Atrás en WebView (`onBackPressed` en DEX)**: El botón físico/mando "Atrás" cerraba la app en lugar de retroceder dentro de la SPA; implementar campo privado `webView` (`field_ids`) e instruir `MainActivity.onBackPressed()` en bytecode Dalvik (`if (webView.canGoBack()) webView.goBack(); else super.onBackPressed()`).
72. **Banner dedicado 16:9 `320x180` para Google TV (`@drawable/tv_banner`)**: Android TV / Google TV Launcher exige `android:banner` en `<application>` con relación 16:9 (`320x180` xhdpi); antes apuntaba al icono cuadrado `0x7f020000`. Añadir recurso `0x7f030000` (`res/drawable-xhdpi-v4/tv_banner.png`) en `AndroidManifest.xml` y `resources.arsc`.
73. **Generación de icono propio para Riffan Music APK (`buildMusicIconPng`)**: Al no existir `public/music-pwa-*.png` en disco, el APK de música heredaba el logo de RiffanTV o un píxel de fallback; generar un icono PNG `192x192` azul cobalto propio con barras de ecualizador.
74. **Ordenación estricta de `virtual_methods` en DEX (`class_data_item`)**: Verificar que `MainActivity` ordene `onBackPressed` y `onCreate` por `method_idx` ascendente con delta ULEB128 exacto para evitar errores `INSTALL_FAILED_DEXOPT` / `VerifyError` en ART.
75. **Firma dual APK Signature Scheme v1 (JAR/PKCS#7) + v2**: Mantener alineación a 4 bytes (`store: true, align4: true`) en `resources.arsc`, `ic_launcher.png` y `tv_banner.png` exigida por Android 11+ (`minSdkVersion` / R+ `resources.arsc` alignment).
76. **Alineación correcta de tablas en `resources.arsc` para TV**: Al añadir el tercer tipo (`drawable`), actualizar los contadores `typeStringCount` y `keyStringCount` en `ResTable_package` (offsets `272` y `280`) de `2` a `3`.
77. **Categoría `LEANBACK_LAUNCHER` y soporte D-Pad sin pantalla táctil**: Declarar `<uses-feature android:name="android.hardware.touchscreen" android:required="false"/>` y `android.software.leanback` para instalación limpia en Google TV / Chromecast / Android TV.
78. **Gestión correcta de `window.history` en móvil (`useBackInterceptor`)**: Sincronizar los modales de Riffan Music y reproductor TV con la pila `history` para que `webView.canGoBack()` cierre modales antes de abandonar la pestaña actual.
79. **Activación de audio automático (`setMediaPlaybackRequiresUserGesture(false)`)**: Configurado en `WebSettings` del DEX para permitir reproducción continua al saltar entre canales o pistas dentro de los APKs.
80. **Permiso `RECORD_AUDIO` dinámico en runtime**: Mantener la comprobación `checkSelfPermission` + `requestPermissions` y `NaimWebChromeClient.onPermissionRequest` en las APKs para control por voz.
81. **Rutas diferenciadas por sabor (`flavor`)**: `/` para Móvil, `/musica` para Riffan Music y `/tv?platform=googletv` para Google TV con `versionCode` independiente.
82. **Verificación automática de integridad ZIP y `classes.dex` en CI/build**: Validar CRC32, estructura DEX, checksum Adler32/SHA-1 y firma antes de servir los binarios desde `/api/apk/*`.
83. **Soporte Focus/DPad en vista `/tv` del APK Google TV**: Asegurar anillos de foco visibles (`focus-visible:ring`) en tarjetas de canales, teclado virtual de búsqueda y controles de reproductor para mando a distancia.
84. **Descarga con cabecera `Content-Disposition` y MIME correcto**: Servir los APKs con `application/vnd.android.package-archive` y nombre explícito (`RiffanTV-GoogleTV.apk`, `RiffanMusic.apk`, `RiffanTV.apk`).
85. **Recomendación futura (TWA / Capacitor opcional)**: Para soportar PiP nativo del sistema Android y controles de pantalla bloqueada en segundo plano sin restricciones de WebView, envolver en una fase posterior el cliente mediante TWA o Capacitor con servicio multimedia foreground.

---

## Bloque VI — UI/UX, Seguridad, Rendimiento y Calidad General (Puntos 86–100)

86. **Header no fijo en Riffan Music (`WorldShell.tsx`)**: Cambiar el `<header>` en el mundo de música de `sticky top-0` a `relative` para que desaparezca al hacer scroll hacia abajo y libere espacio vertical de lectura.
87. **Bloqueo de cambio accidental de canción al deslizar sobre carátula (`FullScreenNowPlayingModal.tsx`)**: Eliminar el gesto horizontal (`onTouchEnd`) sobre la carátula; las canciones solo cambian mediante los botones Anterior/Siguiente (conservando únicamente el gesto vertical hacia abajo para minimizar el modal).
88. **Animación de carátula sincronizada con la canción (`artWrapperRef` + `artGlowRef`)**: Vincular el escalado sutil (`scale`), inclinación y halo cromático en 60fps a la energía espectral (`sampleMusicSpectrum`) mientras suena la música, regresando suavemente a reposo al pausar.
89. **Legibilidad tipográfica y truncado en títulos largos**: Ajustar `line-clamp` / `truncate` en títulos tipo `IDK & Eminem — WELCOME...` dentro del modal para que no corten bruscos o desalineen el botón de Like.
90. **Eliminación de dependencias bloqueantes en fuentes o scripts externos**: Garantizar que si un usuario abre la app offline o en red lenta no quede bloqueada esperando fuentes externas no críticas.
91. **Compresión HTTP selectiva (`compression` en `server.ts`)**: Comprimir JSON, HTML y SVG pero excluir flujos binarios `.ts`, `.m3u8` passthrough y `.apk` ya comprimidos.
92. **Cabeceras de seguridad (`securityHeadersMiddleware`)**: Mantener `X-Content-Type-Options: nosniff`, `Referrer-Policy` y control estricto de CORS sin romper el iframe preview de AI Studio ni el proxy de vídeo.
93. **Limpieza de `localStorage` corrupto**: Envolver todas las lecturas JSON (`useMusicStore`, `storage.ts`) en `try/catch` con migración de versión segura para evitar pantallas en blanco tras actualizaciones.
94. **Accesibilidad ARIA en controles de reproducción**: Asegurar `aria-label` descriptivos en botones de Play/Pause, Siguiente, Anterior, Like, Repetir y Aleatorio para lectores de pantalla.
95. **Rendimiento de listas largas (Playlists con >300 pistas)**: Virtualizar o paginar progresivamente listas muy extensas dentro de las vistas de detalle para mantener 60fps constantes en Android gama media.
96. **Prevención de fugas de timers e intervalos en React**: Auditar todos los `useEffect` (especialmente sondeos HLS, RAF del canvas y debounce de recomendaciones) garantizando limpieza `cancelAnimationFrame` / `clearTimeout` al desmontar.
97. **Reconexión WebSocket / Audio sin duplicar listeners**: Garantizar singleton estricto en `MusicAudioEngine` para que no suenen dos canciones superpuestas al cambiar rápidamente entre pistas SoundCloud y YouTube.
98. **Centralización de URLs de logos de canales (`src/shared/channelLogos.ts`)**: Resolver logos oficiales de cadenas TDT desde una única fuente de verdad compartida entre cliente y servidor/EPG.
99. **Logs estructurados sin secretos ni credenciales (`logger.ts`)**: Enmascarar automáticamente contraseñas IPTV (`pass=...`), tokens OAuth y claves de sesión antes de imprimir cualquier error en consola.
100. **Endpoint descargable de auditoría (`GET /api/audit/100-points`) y acceso directo en menú**: Servir este documento Markdown directamente desde la interfaz (`WorldShell.tsx`) y API con cabecera `Content-Disposition: attachment` para revisión y seguimiento continuo de mejoras.

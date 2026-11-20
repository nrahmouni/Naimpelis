export const BELIX_EMBEDDED_RAW_TEXT = `INVENTARIO DE RUTAS — BELIX TV
==========================================
Fuente: Belix TV (1).apk_Decompiler.com.zip
Método: análisis estático de recursos y código Smali del APK decompilado.

RESUMEN
-------
- URLs literales únicas detectadas en el conjunto de archivos de texto: 48
- Hosts/dominios extraídos de esas URLs literales: 21
- URLs literales halladas dentro del paquete de la aplicación com/ibopro/ultra: 3
- La aplicación usa una API tipo Xtream Codes y construye las rutas de reproducción a partir del servidor, usuario, contraseña, ID y extensión configurados.
- No se encontró en el código una lista fija de servidores IPTV de contenido ni una URL HLS .m3u8 fija.

1) ENDPOINTS API (rutas relativas)
----------------------------------
- API general / autenticación: /player_api.php?
- EPG XMLTV: /xmltv.php
- Tabla EPG simple: /player_api.php?action=get_simple_data_table
- Categorías TV en directo: /player_api.php?action=get_live_categories
- Canales en directo por categoría: /player_api.php?action=get_live_streams&category_id=*
- Todos los canales en directo: /player_api.php?action=get_live_streams
- Listado de series: /player_api.php?action=get_series
- Listado VOD / películas: /player_api.php?action=get_vod_streams
- Series por categoría: /player_api.php?action=get_series&category_id=*
- Categorías de series: /player_api.php?action=get_series_categories
- Información de serie: /player_api.php?action=get_series_info
- EPG breve de canal: /player_api.php?action=get_short_epg
- Categorías VOD: /player_api.php?action=get_vod_categories
- Información de película/VOD: /player_api.php?action=get_vod_info
- VOD por categoría: /player_api.php?action=get_vod_streams&category_id=*

Parámetros que aparecen en el código para estas llamadas:
- username
- password
- category_id
- series_id
- stream_id
- vod_id

2) RUTAS DE REPRODUCCIÓN GENERADAS DINÁMICAMENTE
------------------------------------------------
- TV en directo: /live/{username}/{password}/{stream_id}.{extension}
- Película / VOD: /movie/{username}/{password}/{stream_id}.{extension}
- Episodio de serie: /series/{username}/{password}/{episode_id}.{extension}
- Playlist M3U Plus: /get.php?username={username}&password={password}&output=ts&type=m3u_plus

Notas:
- {extension} es un valor dinámico; el reproductor obtiene el formato de las preferencias o del modelo de contenido.
- La ruta de TV en directo recibe también el formato configurado para streams en directo.
- Las rutas anteriores son patrones reconstruidos del código, no enlaces funcionales completos: el host y las credenciales los aporta el usuario/proveedor.

3) FORMATOS Y REFERENCIAS DE STREAMING
--------------------------------------
- M3U Plus: output=ts&type=m3u_plus
- Transporte TS: la app solicita explícitamente output=ts para la playlist.
- El modelo de película expone una extensión de archivo dinámica (getExtension()).
- No se encontró una ruta .m3u8 literal ni un manifiesto HLS fijo en las clases propias de la app.
- No se encontró una ruta .mpd literal en las clases propias de la app.
- La presencia de ExoPlayer y soporte de formatos multimedia no demuestra por sí sola que el proveedor entregue HLS o DASH.

4) URLS EXTERNAS LITERALES EN EL CÓDIGO DE LA APP
--------------------------------------------------
- http://www.youtube.com/watch?v=
    origen: smali/com/ibopro/ultra/activities/MovieCreditActivity.smali
    origen: smali/com/ibopro/ultra/activities/MovieInfoActivity.smali
    origen: smali/com/ibopro/ultra/activities/SeriesInfoActivity.smali
    origen: sources/com/ibopro/ultra/activities/MovieCreditActivity.java
- https://play.google.com/store/apps/details?id=com.mxtech.videoplayer.ad
    origen: smali/com/ibopro/ultra/activities/MovieActivity.smali
    origen: smali/com/ibopro/ultra/activities/MovieInfoActivity.smali
    origen: smali/com/ibopro/ultra/activities/MovieSecondActivity.smali
    origen: smali/com/ibopro/ultra/activities/SeasonActivity.smali
- https://play.google.com/store/apps/details?id=org.videolan.vlc&hl=en_US
    origen: smali/com/ibopro/ultra/activities/MovieActivity.smali
    origen: smali/com/ibopro/ultra/activities/MovieInfoActivity.smali
    origen: smali/com/ibopro/ultra/activities/MovieSecondActivity.smali
    origen: smali/com/ibopro/ultra/activities/SeasonActivity.smali

5) OTRAS URLS LITERALES DEL PROYECTO (SDK / FRAMEWORK / DOCUMENTACIÓN)
---------------------------------------------------------------------
- http://0.0.0.0:1234
- http://dashif.org/guidelines/last-segment-number
- http://dashif.org/guidelines/thumbnail_tile
- http://dashif.org/guidelines/trickmode
- http://dashif.org/thumbnail_tile
- http://localhost/
- http://ns.adobe.com/xap/1.0/
- http://schemas.android.com/aapt
- http://schemas.android.com/apk/res-auto
- http://schemas.android.com/apk/res/android
- http://schemas.android.com/tools
- http://schemas.microsoft.com/DRM/2007/03/protocols/AcquireLicense
- http://www.w3.org/ns/ttml#parameter
- https://aomedia.org/emsg/ID3
- https://default.url
- https://developer.android.com/guide/topics/media/issues/cleartext-not-permitted
- https://developer.android.com/guide/topics/media/issues/player-accessed-on-wrong-thread
- https://developer.android.com/reference/com/google/android/play/core/assetpacks/model/AssetPackErrorCode.html#
- https://developer.android.com/reference/com/google/android/play/core/install/model/InstallErrorCode#
- https://developer.android.com/reference/com/google/android/play/core/review/model/ReviewErrorCode.html#
- https://developer.android.com/reference/com/google/android/play/core/splitinstall/model/SplitInstallErrorCode.html#
- https://developer.apple.com/streaming/emsg-id3
- https://docs.mongodb.com/realm/sdk/android/install/#customize-dependecies-defined-by-the-realm-gradle-plugin
- https://github.com/Kotlin/kotlinx.coroutines#android
- https://github.com/realm/realm-java/tree/master/examples/rxJavaExample
- https://github.com/vinc3m1
- https://github.com/vinc3m1/RoundedImageView
- https://github.com/vinc3m1/RoundedImageView.git
- https://issuetracker.google.com/issues/36918154
- https://play.google.com/store
- https://plus.google.com/
- https://realm.io/docs/java/latest/#rxjava
- https://t.me/shadeedtv
- https://www.googleapis.com/auth/appstate
- https://www.googleapis.com/auth/datastoremobile
- https://www.googleapis.com/auth/drive
- https://www.googleapis.com/auth/drive.appdata
- https://www.googleapis.com/auth/drive.apps
- https://www.googleapis.com/auth/drive.file
- https://www.googleapis.com/auth/games
- https://www.googleapis.com/auth/games.firstparty
- https://www.googleapis.com/auth/games_lite
- https://www.googleapis.com/auth/plus.login
- https://www.googleapis.com/auth/plus.me
- https://x

6) DOMINIOS DE LAS URLS LITERALES DETECTADAS
--------------------------------------------
- 0.0.0.0
- aomedia.org
- dashif.org
- default.url
- developer.android.com
- developer.apple.com
- docs.mongodb.com
- github.com
- issuetracker.google.com
- localhost
- ns.adobe.com
- play.google.com
- plus.google.com
- realm.io
- schemas.android.com
- schemas.microsoft.com
- t.me
- www.googleapis.com
- www.w3.org
- www.youtube.com
- x

7) ARCHIVOS DE CÓDIGO RELEVANTES
--------------------------------
- smali/com/ibopro/ultra/remote/APIService.smali — declaraciones Retrofit de API.
- smali/com/ibopro/ultra/helper/GetSharedInfo.smali — construcción de rutas /live/, /movie/, /series/ y /get.php.
- smali/com/ibopro/ultra/activities/LiveChannelActivity.smali — uso de la URL de directo y formato configurado.
- smali/com/ibopro/ultra/activities/MoviePlayerActivity.smali — reproducción de películas y extensión dinámica.
- smali/com/ibopro/ultra/models/MovieModel.smali — modelo de contenido VOD.

8) LIMITACIONES DEL ANÁLISIS
----------------------------
- Este inventario procede del código estático incluido en el ZIP; no se inició sesión ni se contactó con servidores de proveedores.
- Las URLs finales dependen del servidor IPTV, credenciales, IDs y extensión suministrados al configurar la app.
- No se pueden deducir credenciales, hosts de proveedores ni manifiestos de reproducción activos a partir de estas rutas genéricas.
- No se deben interpretar los enlaces de documentación de Android/Google incluidos en el inventario como servidores de vídeo.

FIN DEL INVENTARIO
`;

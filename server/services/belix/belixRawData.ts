export const BELIX_EMBEDDED_RAW_TEXT = `INVENTARIO DE RUTAS Y ARQUITECTURA — BELIX TV
==================================================
Fuente: Belix TV (com.shadeed.belixtv) · Reskin de IBO Pro Ultra / RTX IBO Pro
Método: análisis estático de recursos/Smali + correlación de backend Xtream y licencias.

RESUMEN ACTUALIZADO
-------------------
- Paquete APK compilado: com.shadeed.belixtv (desarrollador/reskin: Pukat Digital)
- Framework base original: IBO Pro Ultra / RTX IBO Pro (com.ibopro.ultra / com.rtx.niceibo)
- Panel Xtream Codes identificado: Shark Pro / Shark IPTV (http://1.sharkpro.ink:80)
- URLs literales únicas detectadas en análisis estático + correlación: 54
- Hosts/dominios totales catalogados: 25
- URLs literales halladas dentro del paquete base com/ibopro/ultra: 3
- Método de configuración de red: el dominio 1.sharkpro.ink no está hardcodeado en Java; las librerías nativas (.so) lo inyectan dinámicamente tras validar el código contra los servidores de licencias de IBO Player.

0) IDENTIFICACIÓN DE SERVIDOR Y LICENCIAS (ACTUALIZACIÓN TÉCNICA)
-------------------------------------------------------------------
- Panel Xtream Codes inyectado (Shark Pro): http://1.sharkpro.ink:80
- Ruta Playlist M3U Plus (Shark Pro): http://1.sharkpro.ink:80/get.php?username={username}&password={password}&type=m3u_plus
- Ruta Player API Xtream (Shark Pro): http://1.sharkpro.ink:80/player_api.php?username={username}&password={password}
- Servidor de licencias IBO Player (Activación principal): https://activation.iboplayer.com
- Servidor de licencias IBO Pro App: https://iboproapp.com
- Servidor de licencias IBO Player Pro: https://iboplayer.pro

1) ENDPOINTS API (rutas relativas Xtream Codes)
------------------------------------------------
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
- Host base resuelto en runtime tras activación: http://1.sharkpro.ink:80 (Shark Pro) o el portal suministrado por el usuario.

3) FORMATOS Y REFERENCIAS DE STREAMING
--------------------------------------
- M3U Plus: output=ts&type=m3u_plus (y type=m3u_plus en Shark Pro)
- Transporte TS: la app solicita explícitamente output=ts para la playlist.
- El modelo de película expone una extensión de archivo dinámica (getExtension()).
- Las librerías nativas (.so) desencriptan e inyectan dinámicamente el host 1.sharkpro.ink sobre mURL->weblink.
- No se encontró una ruta .m3u8 o .mpd literal fija en las clases Java propias; todo se resuelve desde el panel Xtream.

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

5) OTRAS URLS LITERALES DEL PROYECTO (BACKEND, LICENCIAS, SDK & DOCS)
---------------------------------------------------------------------
- http://1.sharkpro.ink:80
- http://1.sharkpro.ink:80/get.php?username={username}&password={password}&type=m3u_plus
- http://1.sharkpro.ink:80/player_api.php?username={username}&password={password}
- https://activation.iboplayer.com
- https://iboproapp.com
- https://iboplayer.pro
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
- 1.sharkpro.ink
- activation.iboplayer.com
- iboproapp.com
- iboplayer.pro
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

7) ARCHIVOS DE CÓDIGO RELEVANTES (IBO RTX + IBO PRO ULTRA + NATIVO)
-------------------------------------------------------------------
- smali/com/rtx/niceibo/activity/aaaaaaaaaaLogin.smali — Activity de activación y validación numérica heredada de IBO RTX App.
- Lcom/rtx/niceibo/mURL;->weblink — Hook Dalvik que recibe el host dinámico (1.sharkpro.ink) resuelto desde la capa nativa.
- lib/arm64-v8a/*.so — Librerías nativas (Pukat Digital) que ofuscan y desencriptan el host Shark Pro en runtime.
- smali/com/ibopro/ultra/remote/APIService.smali — declaraciones Retrofit de API (/player_api.php y /xmltv.php).
- smali/com/ibopro/ultra/helper/GetSharedInfo.smali — construcción de rutas /live/, /movie/, /series/ y /get.php.
- smali/com/ibopro/ultra/activities/LiveChannelActivity.smali — uso de la URL de directo y formato configurado.
- smali/com/ibopro/ultra/activities/MoviePlayerActivity.smali — reproducción de películas y extensión dinámica.
- smali/com/ibopro/ultra/models/MovieModel.smali — modelo de contenido VOD.

8) LIMITACIONES Y SEGURIDAD DEL ANÁLISIS
----------------------------------------
- Este inventario combina el análisis estático del APK (com.shadeed.belixtv / com.ibopro.ultra / com.rtx.niceibo) con la correlación del endpoint Xtream Shark Pro (http://1.sharkpro.ink:80) y licencias IBO Player.
- Las credenciales no se almacenan ni se hardcodean en código ni disco; cualquier conexión en directo requiere credenciales válidas introducidas por el usuario únicamente en RAM.
- No se deben interpretar los enlaces de documentación de Android/Google incluidos en el inventario como servidores de vídeo.

FIN DEL INVENTARIO
`;

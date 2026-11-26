import type express from 'express';
import { parseYouTubeVideoId } from '../youtubeCatalog.ts';
import {
  buildHlsProxyUrl,
  buildTsProxyUrl,
  curlGetText,
  getPreferredUpstreamUa,
  isChineseIptvStream,
  isDvbHeadendStream,
  maybeSignEasyBroadcastUrl,
  resolveKnownUpstreamReferer,
  type ExtractedStreamResult,
} from '../../extractors/httpHelpers.ts';
import { unpackVidhideToHls } from '../../extractors/vidhideEmbed69.ts';
import { isMovidyVerUrl, resolveMovidyEmbedTrack } from '../../extractors/bingetrixMovidy.ts';
import { sniffStreamWithHeadless } from '../../extractors/sportsExtractor.ts';
import {
  isElahmadUrl,
  resolveElahmadChannelToHls,
} from '../../extractors/elahmadExtractor.ts';
import {
  ensureLiveDvbCleanHlsSession,
  getActiveDvbSessionPath,
  isDvbUpstreamCoolingDown,
} from '../proxies/dvbTranscoder.ts';
import {
  MEGA_CHIRINGUITO_TV_URL,
  resolveChiringuitoLiveStream,
} from '../../services/chiringuitoLiveService.ts';
import { isAnyBelixConnected, resolveBelixManifest } from '../../services/belix/belixXtreamClient.ts';

export async function handleDirectExtractCases(params: {
  rawInput: string;
  resolverType: string;
  preferLang: string;
  titleHint: string;
  isSandboxedFrame: boolean;
  belixSessionKey?: string;
  cacheKey: string;
  setCache: (key: string, val: ExtractedStreamResult) => void;
  sendOk: (payload: ExtractedStreamResult) => express.Response;
  sendErr: (status: number, error: string) => express.Response;
}): Promise<express.Response | null> {
  const {
    rawInput,
    resolverType,
    preferLang,
    titleHint,
    isSandboxedFrame,
    belixSessionKey,
    cacheKey,
    setCache,
    sendOk,
    sendErr,
  } = params;

  // CASE -2: Dynamic El Chiringuito de Jugones / Chiringuito Inside Live Resolver
  if (rawInput.startsWith('chiringuito://')) {
    const prefer = rawInput.includes('inside') ? 'inside' : 'live';
    const resolved = await resolveChiringuitoLiveStream({
      prefer,
      matchHint: titleHint,
      forceRefresh: false,
    }).catch(() => null);
    if (resolved?.activeStream?.videoId) {
      const ytResult: ExtractedStreamResult = {
        success: true,
        mode: 'youtube',
        streamUrl: resolved.activeStream.videoId,
        youtubeId: resolved.activeStream.videoId,
        title: resolved.activeStream.title || titleHint || 'Chiringuito Inside · Directo',
        requestedLang: 'ES',
        resolvedLang: 'ES',
        expiresAt: Date.now() + 60 * 1000,
      };
      setCache(cacheKey, ytResult);
      return sendOk(ytResult);
    }
    const megaUrl = MEGA_CHIRINGUITO_TV_URL.startsWith('/api/')
      ? MEGA_CHIRINGUITO_TV_URL
      : buildHlsProxyUrl(MEGA_CHIRINGUITO_TV_URL, new URL(MEGA_CHIRINGUITO_TV_URL).origin + '/', true);
    const megaResult: ExtractedStreamResult = {
      success: true,
      mode: 'hls',
      streamUrl: megaUrl,
      rawStreamUrl: MEGA_CHIRINGUITO_TV_URL,
      title: titleHint || 'El Chiringuito de Jugones · MEGA HD',
      requestedLang: 'ES',
      resolvedLang: 'ES',
      expiresAt: Date.now() + 60 * 1000,
    };
    setCache(cacheKey, megaResult);
    return sendOk(megaResult);
  }

  // CASE -1: Internal proxy / Belix / Providers stream URLs must never pass through external host resolvers
  if (
    /^\/api\/(?:vod-manifest|hls-proxy|belix\/stream|belix\/xtream\/play|providers\/(?:live|vod|series-stream))\//i.test(
      rawInput
    ) ||
    rawInput.startsWith('/api/hls-proxy?')
  ) {
    const belixStreamMatch = rawInput.match(/^\/api\/belix\/stream\/([a-zA-Z0-9_-]+)(?:\.m3u8)?/i);
    if (/^\/api\/belix\/(?:stream|xtream\/play)\//i.test(rawInput) && !isAnyBelixConnected(belixSessionKey)) {
      return sendErr(
        404,
        'Señal Belix no conectada; cambiando automáticamente a señal TDT en directo.'
      );
    }
    if (belixStreamMatch && process.env.NODE_ENV !== 'test') {
      const warmed = await resolveBelixManifest(
        belixStreamMatch[1],
        '',
        belixSessionKey,
        titleHint
      ).catch(() => null);
      if (!warmed) {
        return sendErr(
          404,
          'Señal Belix temporalmente sin respuesta; cambiando automáticamente a señal alternativa.'
        );
      }
    }
    if (rawInput.startsWith('/api/hls-proxy')) {
      try {
        const parsedInner = new URL(rawInput, 'http://localhost').searchParams.get('url') || '';
        if (parsedInner && isDvbHeadendStream(parsedInner) && isDvbUpstreamCoolingDown(parsedInner)) {
          return sendErr(404, 'Cabecera TDT en enfriamiento; cambiando automáticamente de fuente.');
        }
      } catch {
        // ignore parse error
      }
    }
    const isDirectFile = /\.(mp4|mkv|webm)(\?|$)/i.test(rawInput);
    const result: ExtractedStreamResult = {
      success: true,
      mode: isDirectFile ? 'direct' : 'hls',
      streamUrl: rawInput,
      rawStreamUrl: rawInput,
      title: titleHint || 'Stream en Directo',
      requestedLang: preferLang || 'ES',
      resolvedLang: preferLang || 'ES',
      expiresAt: Date.now() + (belixStreamMatch ? 8_000 : 15 * 60 * 1000),
    };
    setCache(cacheKey, result);
    return sendOk(result);
  }

  // CASE -0.5: Direct Atresplayer web URLs (https://www.atresplayer.com/directos/antena3/, etc.)
  const atresMatch = rawInput.match(
    /^https?:\/\/(?:www\.)?atresplayer\.com\/directos\/([a-z0-9-]+)/i
  );
  if (atresMatch) {
    const slug = atresMatch[1].toLowerCase();
    const ATRES_DIRECTO_MAP: Record<
      string,
      { dvbUrl: string; streamUrl: string; title: string; rawUrl: string }
    > = {
      antena3: {
        dvbUrl: 'http://90.163.85.113:8093/stream/20/index.m3u8',
        streamUrl: '/api/belix/stream/531071.m3u8?name=Antena%203',
        title: 'Antena 3 · Directo HD',
        rawUrl: 'https://www.atresplayer.com/directos/antena3/',
      },
      'antena3-internacional': {
        dvbUrl: 'http://90.163.85.113:8093/stream/20/index.m3u8',
        streamUrl: '/api/belix/stream/531071.m3u8?name=Antena%203',
        title: 'Antena 3 · Directo HD',
        rawUrl: 'https://www.atresplayer.com/directos/antena3/',
      },
      lasexta: {
        dvbUrl: 'http://90.163.85.113:8093/stream/21/index.m3u8',
        streamUrl: '/api/belix/stream/743035.m3u8?name=laSexta',
        title: 'laSexta · Directo HD',
        rawUrl: 'https://www.atresplayer.com/directos/lasexta/',
      },
      neox: {
        dvbUrl: 'http://90.163.85.113:8093/stream/22/index.m3u8',
        streamUrl: '/api/belix/stream/742985.m3u8?name=Neox',
        title: 'Neox · Directo HD',
        rawUrl: 'https://www.atresplayer.com/directos/neox/',
      },
      nova: {
        dvbUrl: 'http://90.163.85.113:8093/stream/23/index.m3u8',
        streamUrl: '/api/belix/stream/742954.m3u8?name=Nova',
        title: 'Nova · Directo HD',
        rawUrl: 'https://www.atresplayer.com/directos/nova/',
      },
      mega: {
        dvbUrl: 'http://90.163.85.113:8093/stream/11/index.m3u8',
        streamUrl: '/api/belix/stream/743032.m3u8?name=Mega',
        title: 'Mega · Directo HD',
        rawUrl: 'https://www.atresplayer.com/directos/mega/',
      },
      atreseries: {
        dvbUrl: 'http://90.163.85.113:8093/stream/24/index.m3u8',
        streamUrl: '/api/belix/stream/743033.m3u8?name=Atreseries',
        title: 'Atreseries · Directo HD',
        rawUrl: 'https://www.atresplayer.com/directos/atreseries/',
      },
    };
    const mapped = ATRES_DIRECTO_MAP[slug] || ATRES_DIRECTO_MAP.antena3;
    const dvbReferer = 'http://90.163.85.113:8093/';
    if (process.env.NODE_ENV !== 'test' && !isDvbUpstreamCoolingDown(mapped.dvbUrl)) {
      const activeDvb =
        getActiveDvbSessionPath(mapped.dvbUrl, 'hd') ||
        (await ensureLiveDvbCleanHlsSession(mapped.dvbUrl, 'hd', dvbReferer).catch(() => null));
      if (activeDvb) {
        const dvbResult: ExtractedStreamResult = {
          success: true,
          mode: 'hls',
          streamUrl: activeDvb,
          rawStreamUrl: mapped.dvbUrl,
          referer: dvbReferer,
          title: titleHint || mapped.title,
          requestedLang: 'ES',
          resolvedLang: 'ES',
          expiresAt: Date.now() + 30_000,
        };
        setCache(cacheKey, dvbResult);
        return sendOk(dvbResult);
      }
    }
    const mappedBelixId = mapped.streamUrl.match(/\/api\/belix\/stream\/([a-zA-Z0-9_-]+)/i)?.[1];
    if (mappedBelixId && process.env.NODE_ENV !== 'test') {
      const warmed = await resolveBelixManifest(
        mappedBelixId,
        '',
        belixSessionKey,
        titleHint || mapped.title
      ).catch(() => null);
      if (!warmed) {
        return sendErr(
          404,
          `Señal de ${mapped.title} temporalmente sin respuesta; prueba otra señal disponible.`
        );
      }
    }
    const result: ExtractedStreamResult = {
      success: true,
      mode: 'hls',
      streamUrl: mapped.streamUrl,
      rawStreamUrl: mapped.rawUrl,
      title: titleHint || mapped.title,
      requestedLang: 'ES',
      resolvedLang: 'ES',
      expiresAt: Date.now() + 10_000,
    };
    setCache(cacheKey, result);
    return sendOk(result);
  }

  // CASE 0: Live Spanish TDT Channel (`tdt_hls`)
  if (resolverType === 'tdt_hls' && rawInput) {
    const dvbProfile: 'hd' | 'fast' = /[?&]profile=fast\b/i.test(rawInput) ? 'fast' : 'hd';
    const strippedCheckUrl = rawInput.replace(/[?&]profile=(hd|fast)\b/gi, '');
    const cleanCheckUrl = await maybeSignEasyBroadcastUrl(strippedCheckUrl);
    const knownReferer = resolveKnownUpstreamReferer(cleanCheckUrl);
    const originRef = knownReferer || new URL(cleanCheckUrl).origin + '/';
    const isCnStream = isChineseIptvStream(cleanCheckUrl);
    const isDvb = isDvbHeadendStream(cleanCheckUrl);

    if (isDvb) {
      const existingDvbPath = getActiveDvbSessionPath(cleanCheckUrl, dvbProfile);
      if (existingDvbPath) {
        const fastResult: ExtractedStreamResult = {
          success: true,
          mode: 'hls',
          streamUrl: existingDvbPath,
          rawStreamUrl: cleanCheckUrl,
          referer: originRef,
          title: titleHint || 'TV España en Directo',
          requestedLang: 'ES',
          resolvedLang: 'ES',
          expiresAt: Date.now() + 30 * 1000,
        };
        setCache(cacheKey, fastResult);
        return sendOk(fastResult);
      }

      const dvbLiveUrl = await ensureLiveDvbCleanHlsSession(
        cleanCheckUrl,
        dvbProfile,
        originRef
      ).catch(() => null);
      if (dvbLiveUrl) {
        const dvbResult: ExtractedStreamResult = {
          success: true,
          mode: 'hls',
          streamUrl: dvbLiveUrl,
          rawStreamUrl: cleanCheckUrl,
          referer: originRef,
          title: titleHint || 'TV España en Directo',
          requestedLang: 'ES',
          resolvedLang: 'ES',
          expiresAt: Date.now() + 30 * 1000,
        };
        setCache(cacheKey, dvbResult);
        return sendOk(dvbResult);
      }
      if (isDvbUpstreamCoolingDown(cleanCheckUrl)) {
        return sendErr(404, 'Señal TDT directa temporalmente no accesible desde servidor.');
      }
    }

    const checkHeaders: Record<string, string> = {
      'User-Agent': getPreferredUpstreamUa(cleanCheckUrl),
      Accept: '*/*',
    };
    if (knownReferer) {
      checkHeaders['Referer'] = knownReferer;
      try {
        checkHeaders['Origin'] = new URL(knownReferer).origin;
      } catch {
        // ignore
      }
    }
    const isDirectBrowserCorsPublicCdn =
      /^https:\/\/([^/]*\.)?(rtvelivestream\.rtve\.es|3catdirectes\.cat|eitb\.eus)\//i.test(
        cleanCheckUrl
      );
    const isFastTrustedCdn =
      isDirectBrowserCorsPublicCdn ||
      /otteravision\.com|stream\.ads\.ottera\.tv|pluto\.tv|samsungtvplus|amagi\.tv/i.test(
        cleanCheckUrl
      );

    let isAlive = false;
    let manifestText = '';
    try {
      const chk = await fetch(cleanCheckUrl, {
        headers: checkHeaders,
        signal: AbortSignal.timeout(isDvb ? 6000 : 2500),
      });
      if (chk.ok) {
        const txt = await chk.text();
        if (txt.includes('#EXTM3U') && !/nosignal/i.test(txt)) {
          isAlive = true;
          manifestText = txt;
        }
      }
    } catch {
      // fallback to curl below
    }
    if (!isAlive) {
      const fb = await curlGetText(cleanCheckUrl, checkHeaders, isCnStream || isDvb ? 5 : 3, isCnStream).catch(() => ({
        text: '',
      }));
      if (fb.text && fb.text.includes('#EXTM3U') && !/nosignal/i.test(fb.text)) {
        isAlive = true;
        manifestText = fb.text;
      }
    }
    if (!isAlive && isCnStream) {
      await new Promise((r) => setTimeout(r, 200));
      const fb2 = await curlGetText(cleanCheckUrl, checkHeaders, 5, true).catch(() => ({
        text: '',
      }));
      if (fb2.text && fb2.text.includes('#EXTM3U') && !/nosignal/i.test(fb2.text)) {
        isAlive = true;
        manifestText = fb2.text;
      }
    }

    if (isAlive && !isDvb && !isCnStream && !isFastTrustedCdn && manifestText) {
      try {
        let mediaText = manifestText;
        let mediaBase = cleanCheckUrl;
        if (mediaText.includes('#EXT-X-STREAM-INF')) {
          const lines = mediaText.split(/\r?\n/);
          let nextVar = false;
          let pickedVar = '';
          for (const rawLine of lines) {
            const tr = rawLine.trim();
            if (!tr) continue;
            if (tr.startsWith('#EXT-X-STREAM-INF')) {
              nextVar = true;
            } else if (nextVar && !tr.startsWith('#')) {
              nextVar = false;
              const varUrl = new URL(tr, mediaBase).href;
              const vRes = await fetch(varUrl, {
                headers: checkHeaders,
                signal: AbortSignal.timeout(1800),
              }).catch(() => null);
              if (vRes?.ok) {
                const vTxt = await vRes.text();
                if (vTxt.includes('#EXTM3U') && !/nosignal/i.test(vTxt)) {
                  mediaText = vTxt;
                  mediaBase = varUrl;
                  pickedVar = varUrl;
                  break;
                }
              }
            }
          }
          if (!pickedVar) {
            isAlive = false;
          }
        }
        if (isAlive && !mediaText.includes('#EXT-X-STREAM-INF') && !mediaText.includes('#EXTINF:')) {
          const mLines = mediaText.split(/\r?\n/);
          let segUrl = '';
          for (let i = mLines.length - 1; i >= 0; i--) {
            const tr = mLines[i].trim();
            if (!tr || tr.startsWith('#')) continue;
            segUrl = new URL(tr, mediaBase).href;
            break;
          }
          if (segUrl) {
            const segRes = await fetch(segUrl, {
              headers: { ...checkHeaders, Range: 'bytes=0-2047' },
              signal: AbortSignal.timeout(1800),
            }).catch(() => null);
            await segRes?.body?.cancel?.().catch(() => {});
            if (segRes && !segRes.ok && segRes.status !== 416) {
              isAlive = false;
            }
          }
        }
      } catch {
        // keep manifest check result on non-fatal probe edge errors
      }
    }

    if (!isAlive) {
      return sendErr(
        404,
        'Esta señal TDT está temporalmente sin emisión. Prueba la señal alternativa.'
      );
    }
    const finalStreamUrl = isDirectBrowserCorsPublicCdn
      ? cleanCheckUrl
      : buildHlsProxyUrl(cleanCheckUrl, originRef, isDvb);

    const resolvedChLang = isCnStream ? 'ZH' : 'ES';
    const result: ExtractedStreamResult = {
      success: true,
      mode: 'hls',
      streamUrl: finalStreamUrl,
      rawStreamUrl: cleanCheckUrl,
      referer: originRef,
      title: titleHint || (isCnStream ? 'Fútbol China en Directo (中文)' : 'TV España en Directo'),
      requestedLang: resolvedChLang,
      resolvedLang: resolvedChLang,
      expiresAt: Date.now() + 4 * 60 * 1000,
    };
    setCache(cacheKey, result);
    return sendOk(result);
  }

  // CASE 0B: Elahmad TV dynamic encrypted live HLS channel (`elahmad_live`)
  if ((resolverType === 'elahmad_live' || isElahmadUrl(rawInput)) && rawInput) {
    const resolved = await resolveElahmadChannelToHls(rawInput);
    if (!resolved) {
      return sendErr(404, 'Señal de Elahmad TV temporalmente sin emisión disponible.');
    }
    if (resolved.isYoutube && resolved.youtubeId) {
      const ytResult: ExtractedStreamResult = {
        success: true,
        mode: 'youtube',
        streamUrl: resolved.youtubeId,
        youtubeId: resolved.youtubeId,
        title: titleHint || 'Elahmad Live TV',
        requestedLang: preferLang || 'AR',
        resolvedLang: 'AR',
        expiresAt: Date.now() + 10 * 60 * 1000,
      };
      setCache(cacheKey, ytResult);
      return sendOk(ytResult);
    }
    const signedUrl = await maybeSignEasyBroadcastUrl(resolved.streamUrl);
    const result: ExtractedStreamResult = {
      success: true,
      mode: 'hls',
      streamUrl: buildHlsProxyUrl(signedUrl, resolved.referer),
      rawStreamUrl: signedUrl,
      referer: resolved.referer,
      title: titleHint || 'Elahmad Live TV',
      requestedLang: preferLang || 'AR',
      resolvedLang: 'AR',
      expiresAt: Date.now() + 3 * 60 * 1000,
    };
    setCache(cacheKey, result);
    return sendOk(result);
  }

  // CASE 1A-0: Already resolved direct_hls track switch
  if (resolverType === 'direct_hls' && rawInput) {
    const streamUrl = rawInput.startsWith('/api/')
      ? rawInput
      : buildHlsProxyUrl(rawInput, new URL(rawInput).origin + '/');
    const result: ExtractedStreamResult = {
      success: true,
      mode: 'hls',
      streamUrl,
      rawStreamUrl: rawInput,
      requestedLang: preferLang,
      resolvedLang: preferLang,
      expiresAt: Date.now() + 15 * 60 * 1000,
    };
    setCache(cacheKey, result);
    return sendOk(result);
  }

  // CASE 1A: Direct Vidhide / Embed69 track switch
  if (resolverType === 'vidhide_hls') {
    const unpacked = await unpackVidhideToHls(rawInput);
    if (!unpacked) {
      return sendErr(404, 'La pista seleccionada no está activa.');
    }
    const result: ExtractedStreamResult = {
      success: true,
      mode: 'hls',
      streamUrl: unpacked.proxyUrl,
      rawStreamUrl: unpacked.rawM3u8,
      requestedLang: preferLang,
      resolvedLang: preferLang,
      expiresAt: Date.now() + 12 * 60 * 1000,
    };
    setCache(cacheKey, result);
    return sendOk(result);
  }

  // CASE 1A-2: Moe / Embed Sniff track switch
  if (resolverType === 'embed_sniff' && rawInput) {
    const sniffed = await sniffStreamWithHeadless(rawInput);
    if (!sniffed) {
      return sendErr(404, 'La pista alternativa no está activa.');
    }
    const proxiedUrl = sniffed.isDirectMp4
      ? buildTsProxyUrl(sniffed.streamUrl, sniffed.referer)
      : buildHlsProxyUrl(sniffed.streamUrl, sniffed.referer);
    const result: ExtractedStreamResult = {
      success: true,
      mode: sniffed.isDirectMp4 ? 'direct' : 'hls',
      streamUrl: proxiedUrl,
      rawStreamUrl: sniffed.streamUrl,
      requestedLang: preferLang,
      resolvedLang: preferLang,
      expiresAt: Date.now() + 12 * 60 * 1000,
    };
    setCache(cacheKey, result);
    return sendOk(result);
  }

  // CASE 1B: Direct Movidy base64/embed track
  if (
    (resolverType === 'movidy_embed' || rawInput.includes('nupload.')) &&
    !isMovidyVerUrl(rawInput)
  ) {
    const resolvedMv = await resolveMovidyEmbedTrack(rawInput);
    if (resolvedMv?.mode === 'hls') {
      const result: ExtractedStreamResult = {
        success: true,
        mode: 'hls',
        streamUrl: resolvedMv.proxyUrl,
        rawStreamUrl: resolvedMv.rawM3u8,
        requestedLang: preferLang,
        resolvedLang: preferLang,
        expiresAt: Date.now() + 15 * 60 * 1000,
      };
      setCache(cacheKey, result);
      return sendOk(result);
    }
    if (resolvedMv?.mode === 'embed') {
      const result: ExtractedStreamResult = {
        success: true,
        mode: 'embed',
        streamUrl: resolvedMv.embedUrl,
        rawStreamUrl: resolvedMv.embedUrl,
        requestedLang: preferLang,
        resolvedLang: preferLang,
        expiresAt: Date.now() + 20 * 60 * 1000,
      };
      setCache(cacheKey, result);
      return sendOk(result);
    }
    return sendErr(404, 'El servidor de esta pista Movidy no está activo ahora mismo.');
  }

  // CASE 1B-VEST: Direct Vest/Groot track switch
  if (resolverType === 'vest_hls' && rawInput) {
    try {
      const originRef = new URL(rawInput).origin + '/';
      const result: ExtractedStreamResult = {
        success: true,
        mode: 'hls',
        streamUrl: buildHlsProxyUrl(rawInput, originRef),
        rawStreamUrl: rawInput,
        referer: originRef,
        requestedLang: preferLang,
        resolvedLang: preferLang,
        expiresAt: Date.now() + 15 * 60 * 1000,
      };
      setCache(cacheKey, result);
      return sendOk(result);
    } catch {
      return sendErr(404, 'La pista seleccionada no está activa.');
    }
  }

  // CASE 1C: Verified Web Embed Player track switch (`web_embed`) & ClipBox embed players
  const isClipboxPlayerHost =
    /(?:^|\.)(vidlink\.pro|player\.videasy\.net|player\.vidzee\.wtf|vixsrc\.to|vidrock\.net|vidnest\.io|moviesapi\.club|2embed\.cc|megaplay\.buzz|vidfast\.[a-z.]+|vidsrc\.[a-z]+|videm\.buzz|primesrc\.me)/i.test(
      rawInput
    );
  if ((resolverType === 'web_embed' || (!resolverType && isClipboxPlayerHost)) && rawInput) {
    const fullEmbedUrl = /^https?:\/\//i.test(rawInput) ? rawInput : `https://${rawInput}`;
    const isCloudflareDirectEmbed =
      /(?:^|\.)(voe\.sx|voe\.bar|hglink\.to|streamwish\.[a-z]+|ok\.ru|byse\.[a-z]+|filelions\.[a-z]+)/i.test(
        fullEmbedUrl
      );
    const isHtmlProxyTarget =
      /(^|\.)(vidsrc\.buzz|videm\.buzz|vidrock\.net|2embed\.cc|www\.2embed\.cc|vidfast\.[a-z.]+)/i.test(
        fullEmbedUrl
      ) ||
      (isSandboxedFrame && !isCloudflareDirectEmbed);
    const safeEmbedUrl = isHtmlProxyTarget
      ? `/api/embed-proxy?url=${encodeURIComponent(fullEmbedUrl)}`
      : fullEmbedUrl;
    const result: ExtractedStreamResult = {
      success: true,
      mode: 'embed',
      streamUrl: safeEmbedUrl,
      rawStreamUrl: fullEmbedUrl,
      requestedLang: preferLang,
      resolvedLang: preferLang,
      expiresAt: Date.now() + 30 * 60 * 1000,
    };
    setCache(cacheKey, result);
    return sendOk(result);
  }

  // CASE 2: YouTube URL
  const ytId = parseYouTubeVideoId(rawInput);
  if (ytId) {
    const result: ExtractedStreamResult = {
      success: true,
      mode: 'youtube',
      streamUrl: ytId,
      youtubeId: ytId,
      title: titleHint || 'YouTube Video',
      expiresAt: Date.now() + 60 * 60 * 1000,
    };
    setCache(cacheKey, result);
    return sendOk(result);
  }

  // CASE 3: Direct .m3u8, .mp4, or internal proxy URL
  if (/^\/api\/(?:vod-manifest|hls-proxy|belix\/xtream\/play)\//i.test(rawInput)) {
    const isDirectFile = /\.(mp4|mkv|webm)(\?|$)/i.test(rawInput);
    const result: ExtractedStreamResult = {
      success: true,
      mode: isDirectFile ? 'direct' : 'hls',
      streamUrl: rawInput,
      rawStreamUrl: rawInput,
      requestedLang: preferLang,
      resolvedLang: preferLang,
      expiresAt: Date.now() + 15 * 60 * 1000,
    };
    setCache(cacheKey, result);
    return sendOk(result);
  }
  if (/\.m3u8(\?|$)/i.test(rawInput)) {
    const originRef = /^https?:\/\//i.test(rawInput) ? new URL(rawInput).origin + '/' : '';
    const result: ExtractedStreamResult = {
      success: true,
      mode: 'hls',
      streamUrl: rawInput.startsWith('/api/') ? rawInput : buildHlsProxyUrl(rawInput, originRef),
      rawStreamUrl: rawInput,
      expiresAt: Date.now() + 15 * 60 * 1000,
    };
    setCache(cacheKey, result);
    return sendOk(result);
  }

  if (resolverType === 'direct_mp4' || /\.(mp4|webm|mkv)(\?|$)/i.test(rawInput)) {
    const isInternalOrCorsCdn =
      rawInput.startsWith('/api/') ||
      /archive\.org\/download\/|3catvideos\.cat\//i.test(rawInput);
    const originRef = /^https?:\/\//i.test(rawInput) ? new URL(rawInput).origin + '/' : '';
    const result: ExtractedStreamResult = {
      success: true,
      mode: 'direct',
      streamUrl: isInternalOrCorsCdn ? rawInput : buildTsProxyUrl(rawInput, originRef),
      rawStreamUrl: rawInput,
      requestedLang: preferLang,
      resolvedLang: preferLang,
      expiresAt: Date.now() + 20 * 60 * 1000,
    };
    setCache(cacheKey, result);
    return sendOk(result);
  }

  return null;
}

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
import { ensureLiveDvbCleanHlsSession } from '../proxies/dvbTranscoder.ts';

export async function handleDirectExtractCases(params: {
  rawInput: string;
  resolverType: string;
  preferLang: string;
  titleHint: string;
  isSandboxedFrame: boolean;
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
    cacheKey,
    setCache,
    sendOk,
    sendErr,
  } = params;

  // CASE 0: Live Spanish TDT Channel (`tdt_hls`)
  if (resolverType === 'tdt_hls' && rawInput) {
    const dvbProfile: 'hd' | 'fast' = /[?&]profile=fast\b/i.test(rawInput) ? 'fast' : 'hd';
    const strippedCheckUrl = rawInput.replace(/[?&]profile=(hd|fast)\b/gi, '');
    const cleanCheckUrl = await maybeSignEasyBroadcastUrl(strippedCheckUrl);
    const knownReferer = resolveKnownUpstreamReferer(cleanCheckUrl);
    const isCnStream = isChineseIptvStream(cleanCheckUrl);
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
    let isAlive = false;
    try {
      const chk = await fetch(cleanCheckUrl, {
        headers: checkHeaders,
        signal: AbortSignal.timeout(4000),
      });
      if (chk.ok) {
        const txt = await chk.text();
        isAlive = txt.includes('#EXTM3U') && !/nosignal/i.test(txt);
      }
    } catch {
      // fallback to curl below
    }
    if (!isAlive) {
      const fb = await curlGetText(cleanCheckUrl, checkHeaders, isCnStream ? 6 : 5, isCnStream).catch(() => ({
        text: '',
      }));
      isAlive = Boolean(fb.text && fb.text.includes('#EXTM3U') && !/nosignal/i.test(fb.text));
    }
    if (!isAlive && isCnStream) {
      await new Promise((r) => setTimeout(r, 250));
      const fb2 = await curlGetText(cleanCheckUrl, checkHeaders, 6, true).catch(() => ({
        text: '',
      }));
      isAlive = Boolean(fb2.text && fb2.text.includes('#EXTM3U') && !/nosignal/i.test(fb2.text));
    }

    if (!isAlive) {
      return sendErr(
        404,
        'Esta señal TDT está temporalmente sin emisión. Prueba la señal alternativa.'
      );
    }

    const originRef = knownReferer || new URL(cleanCheckUrl).origin + '/';
    const isDirectBrowserCorsPublicCdn =
      /^https:\/\/([^/]*\.)?(rtvelivestream\.rtve\.es|3catdirectes\.cat|eitb\.eus)\//i.test(
        cleanCheckUrl
      );
    const isDvb = isDvbHeadendStream(cleanCheckUrl);
    let dvbLiveUrl: string | null = null;
    if (isDvb) {
      dvbLiveUrl = await ensureLiveDvbCleanHlsSession(cleanCheckUrl, dvbProfile, originRef).catch(
        () => null
      );
    }
    const finalStreamUrl = isDirectBrowserCorsPublicCdn
      ? cleanCheckUrl
      : dvbLiveUrl || buildHlsProxyUrl(cleanCheckUrl, originRef, isDvb);

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
      expiresAt: Date.now() + (dvbLiveUrl ? 30 * 1000 : 4 * 60 * 1000),
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

  // CASE 1C: Verified Web Embed Player track switch (`web_embed`)
  if (resolverType === 'web_embed' && rawInput) {
    const fullEmbedUrl = /^https?:\/\//i.test(rawInput) ? rawInput : `https://${rawInput}`;
    const isCloudflareDirectEmbed =
      /(?:^|\.)(voe\.sx|voe\.bar|hglink\.to|streamwish\.[a-z]+|ok\.ru|byse\.[a-z]+|filelions\.[a-z]+)/i.test(
        fullEmbedUrl
      );
    const isHtmlProxyTarget =
      /(^|\.)(vidsrc\.buzz|videm\.buzz|2embed\.cc|www\.2embed\.cc|vidfast\.[a-z.]+)/i.test(
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

  // CASE 3: Direct .m3u8 or .mp4 URL
  if (/^\/api\/vod-manifest\//i.test(rawInput)) {
    const result: ExtractedStreamResult = {
      success: true,
      mode: 'hls',
      streamUrl: rawInput,
      rawStreamUrl: rawInput,
      expiresAt: Date.now() + 15 * 60 * 1000,
    };
    setCache(cacheKey, result);
    return sendOk(result);
  }
  if (/\.m3u8(\?|$)/i.test(rawInput)) {
    const originRef = new URL(rawInput).origin + '/';
    const result: ExtractedStreamResult = {
      success: true,
      mode: 'hls',
      streamUrl: buildHlsProxyUrl(rawInput, originRef),
      rawStreamUrl: rawInput,
      expiresAt: Date.now() + 15 * 60 * 1000,
    };
    setCache(cacheKey, result);
    return sendOk(result);
  }

  if (resolverType === 'direct_mp4' || /\.(mp4|webm|mkv)(\?|$)/i.test(rawInput)) {
    const isGlobalCorsCdn =
      resolverType === 'direct_mp4' ||
      /archive\.org\/download\/|3catvideos\.cat\//i.test(rawInput);
    const originRef = new URL(rawInput).origin + '/';
    const result: ExtractedStreamResult = {
      success: true,
      mode: 'direct',
      streamUrl: isGlobalCorsCdn ? rawInput : buildTsProxyUrl(rawInput, originRef),
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

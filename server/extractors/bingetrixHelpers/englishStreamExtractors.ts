import { LruTtlCache } from '../../utils/lruCache.ts';
import {
  CHROME_UA,
  type TrackRecord,
  buildHlsProxyUrl,
  curlGetBuffer,
  curlGetText,
  probeHlsSegmentHealth,
  rewriteVidsrcBuzzM3u8,
} from '../httpHelpers.ts';
import { unpackVidhideToHls } from '../vidhideHelpers/directHostUnpackers.ts';
export {
  decryptVidRockToken,
  extractVidRockHlsTracks,
  extractVidsrcBuzzHlsTracks,
  probeVidsrcBuzzHasContent,
} from './vidBuzzAndRockExtractors.ts';

export { rewriteVidsrcBuzzM3u8 };

const wasmModuleCache = new LruTtlCache<string, Promise<WebAssembly.Module>>(16, 60 * 60 * 1000);

async function getBingetrixWasmModule(
  windowKey: string,
  wasmUrl?: string,
  wasmB64?: string
): Promise<WebAssembly.Module | null> {
  const key = `${windowKey || wasmUrl || 'default'}`;
  const cached = wasmModuleCache.get(key);
  if (cached) return cached;

  const compilePromise = (async () => {
    const bytes = wasmUrl
      ? await curlGetBuffer(wasmUrl, { 'User-Agent': CHROME_UA }, 6)
      : wasmB64
      ? Buffer.from(wasmB64, 'base64')
      : null;
    if (!bytes || bytes.length === 0) throw new Error('Missing WASM bytes');
    return WebAssembly.compile(new Uint8Array(bytes));
  })();

  wasmModuleCache.set(key, compilePromise);
  compilePromise.catch(() => wasmModuleCache.delete(key));
  return compilePromise;
}

function parseStreamTokenText(raw: string): string {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === 'string') return parsed;
      if (parsed && typeof parsed === 'object') {
        return parsed.token || parsed.data || parsed.string || parsed.result || '';
      }
    } catch {
      // ignore
    }
  }
  return trimmed;
}

export async function extractBingetrixEnglishTracks(opts: {
  tmdbId: string | number;
  mediaType?: 'movie' | 'tv';
  season?: number;
  episode?: number;
}): Promise<TrackRecord[]> {
  try {
    const cleanId = String(opts.tmdbId).replace(/\D/g, '');
    if (!cleanId) return [];

    const mType = opts.mediaType === 'tv' ? 'tv' : 'movie';
    const vsQuery =
      mType === 'tv' && opts.season && opts.episode
        ? `type=tv&id=${cleanId}&season=${opts.season}&episode=${opts.episode}`
        : `type=movie&id=${cleanId}`;

    const vsRaw = await curlGetText(
      `https://screenfetch4.cyou/vs_src.php?${vsQuery}`,
      {
        Referer: `https://screenfetch4.cyou/embed/${mType}?tmdb=${cleanId}&o=https%3A%2F%2Fbingetrix.sc`,
        'User-Agent': CHROME_UA,
      },
      5
    );
    if (!vsRaw.text) return [];
    const vsJson: any = JSON.parse(vsRaw.text);
    if (!vsJson?.src) return [];

    const playerOrigin = new URL(vsJson.src).origin;
    const { text: landingHtml } = await curlGetText(
      vsJson.src,
      { Referer: 'https://screenfetch4.cyou/', 'User-Agent': CHROME_UA },
      5
    );

    const cfgMatch = landingHtml.match(/window\.CFG\s*=\s*(\{[^;]+\});/);
    if (!cfgMatch) return [];
    const cfg = JSON.parse(cfgMatch[1]);
    if (!cfg?.playerUrl) return [];

    const { text: playerHtml } = await curlGetText(
      `${playerOrigin}${cfg.playerUrl}`,
      { Referer: vsJson.src, 'User-Agent': CHROME_UA },
      5
    );

    const pCfgMatch = playerHtml.match(/window\.CONFIG\s*=\s*(\{[^;]+\});/);
    if (!pCfgMatch) return [];
    const pCfg = JSON.parse(pCfgMatch[1]);
    if (!pCfg?.apiToken || (pCfg?.turnstile && !String(pCfg.apiToken).trim())) return [];

    const baseMetaApi = pCfg.metaApi || cfg.metaApi || '';
    const baseStreamApi = pCfg.api || (baseMetaApi ? `${baseMetaApi}&stream_urls` : '');
    if (!baseStreamApi) return [];

    const streamApiUrl = `${baseStreamApi}${baseStreamApi.includes('?') ? '&' : '?'}api_token=${encodeURIComponent(pCfg.apiToken)}`;

    const { text: apiText } = await curlGetText(
      streamApiUrl,
      {
        Referer: `${playerOrigin}/`,
        Origin: playerOrigin,
        Accept: 'application/json',
        'User-Agent': CHROME_UA,
      },
      6
    );
    if (!apiText) return [];
    const apiJson: any = JSON.parse(apiText);

    let rawUrls: string[] = [];
    if (Array.isArray(apiJson?.data?.stream_urls)) {
      rawUrls = apiJson.data.stream_urls;
    } else if (apiJson?.vs && typeof apiJson?.data?.stream_urls === 'string') {
      const mod = await getBingetrixWasmModule(
        String(apiJson.vs.w || ''),
        apiJson.vs.wasm_url,
        apiJson.vs.wasm
      );
      if (mod) {
        const inst = await WebAssembly.instantiate(mod, {});
        const ex = inst.exports as any;
        const enc = Buffer.from(apiJson.data.stream_urls, 'base64');
        const ptr = ex.alloc(enc.length);
        new Uint8Array(ex.memory.buffer, ptr, enc.length).set(enc);
        const outLen = ex.decrypt(ptr, enc.length);
        const plain = new TextDecoder().decode(
          new Uint8Array(ex.memory.buffer, ptr + 12, outLen)
        );
        rawUrls = plain.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
      }
    }

    if (rawUrls.length === 0) return [];

    const stampedTracks = await Promise.all(
      rawUrls.slice(0, 3).map(async (rawStreamUrl, idx) => {
        try {
          const streamOrigin = new URL(rawStreamUrl).origin;
          const genUrl = `${streamOrigin}/generate.php?api_token=${encodeURIComponent(pCfg.apiToken)}`;
          const tokRaw = await curlGetText(
            genUrl,
            {
              Referer: `${playerOrigin}/`,
              Origin: playerOrigin,
              'User-Agent': CHROME_UA,
            },
            4
          )
            .then((r) => r.text)
            .catch(() => '');
          const token = parseStreamTokenText(tokRaw);
          const finalMasterUrl = token
            ? rawStreamUrl.includes('__TOKEN__')
              ? rawStreamUrl.split('__TOKEN__').join(token)
              : `${rawStreamUrl}${rawStreamUrl.includes('?') ? '&' : '?'}token=${token}`
            : rawStreamUrl;

          const healthy = await probeHlsSegmentHealth(finalMasterUrl, playerOrigin);
          if (!healthy) return null;

          const proxyUrl = buildHlsProxyUrl(finalMasterUrl, `${playerOrigin}/`);
          const sourceRef =
            mType === 'tv' && opts.season && opts.episode
              ? `https://bingetrix.sc/watch/tv/${cleanId}/${opts.season}/${opts.episode}`
              : `https://bingetrix.sc/watch/${cleanId}`;

          return {
            id: `bingetrix-en-${mType}-${cleanId}-${idx + 1}`,
            label: `English 1080p · S${idx + 1}`,
            lang: 'EN',
            quality: '1080p HLS',
            sourceUrl: sourceRef,
            resolverType: 'bingetrix_en' as const,
            resolvedStreamUrl: proxyUrl,
          };
        } catch {
          return null;
        }
      })
    );

    return stampedTracks.filter((t): t is NonNullable<typeof t> => Boolean(t));
  } catch (err) {
    console.warn('extractBingetrixEnglishTracks error:', err);
    return [];
  }
}

export async function has2EmbedEnglishStreamFast(opts: {
  tmdbId: string | number;
  imdbId?: string | null;
  mediaType?: 'movie' | 'tv';
  season?: number;
  episode?: number;
}): Promise<boolean> {
  try {
    const cleanId = String(opts.tmdbId || '').replace(/\D/g, '');
    const cleanImdb = String(opts.imdbId || '').trim();
    if (!cleanId && !cleanImdb) return false;

    const mType = opts.mediaType === 'tv' ? 'tv' : 'movie';
    const primaryId = cleanId || cleanImdb;
    const embedUrl =
      mType === 'tv' && opts.season && opts.episode
        ? `https://www.2embed.cc/embedtv/${primaryId}&s=${opts.season}&e=${opts.episode}`
        : `https://www.2embed.cc/embed/${primaryId}`;

    const html = (
      await curlGetText(
        embedUrl,
        { Referer: 'https://www.2embed.cc/', 'User-Agent': CHROME_UA },
        3,
        true
      ).catch(() => ({ text: '' }))
    ).text;

    if (html) {
      if (/https:\/\/streamsrcs\.2embed\.cc\/swish\?id=[a-zA-Z0-9_-]+/i.test(html)) {
        return true;
      }
      if (mType === 'tv') {
        const titleTag = (html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || '').trim();
        if (titleTag && !/^2Embed\.cc\s*-?\s*Player$/i.test(titleTag)) {
          return true;
        }
      }
      if (mType === 'movie') {
        const imdbEmbedMatch = html.match(/https:\/\/www\.2embed\.cc\/embed\/(tt\d+)/i);
        if (imdbEmbedMatch) {
          const innerHtml = (
            await curlGetText(
              imdbEmbedMatch[0],
              { Referer: embedUrl, 'User-Agent': CHROME_UA },
              3,
              true
            ).catch(() => ({ text: '' }))
          ).text;
          if (innerHtml && /https:\/\/streamsrcs\.2embed\.cc\/swish\?id=[a-zA-Z0-9_-]+/i.test(innerHtml)) {
            return true;
          }
        }
      }
    }

    if (cleanImdb && cleanImdb !== primaryId) {
      const imdbUrl =
        mType === 'tv' && opts.season && opts.episode
          ? `https://www.2embed.cc/embedtv/${cleanImdb}&s=${opts.season}&e=${opts.episode}`
          : `https://www.2embed.cc/embed/${cleanImdb}`;
      const imdbHtml = (
        await curlGetText(
          imdbUrl,
          { Referer: 'https://www.2embed.cc/', 'User-Agent': CHROME_UA },
          3,
          true
        ).catch(() => ({ text: '' }))
      ).text;
      if (imdbHtml && /https:\/\/streamsrcs\.2embed\.cc\/swish\?id=[a-zA-Z0-9_-]+/i.test(imdbHtml)) {
        return true;
      }
      if (mType === 'tv' && imdbHtml) {
        const titleTag = (imdbHtml.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || '').trim();
        if (titleTag && !/^2Embed\.cc\s*-?\s*Player$/i.test(titleTag)) {
          return true;
        }
      }
    }

    return false;
  } catch {
    return false;
  }
}

export async function extract2EmbedEnglishTracks(opts: {
  tmdbId: string | number;
  imdbId?: string | null;
  mediaType?: 'movie' | 'tv';
  season?: number;
  episode?: number;
}): Promise<TrackRecord[]> {
  try {
    const cleanId = String(opts.tmdbId || '').replace(/\D/g, '');
    const cleanImdb = String(opts.imdbId || '').trim();
    if (!cleanId && !cleanImdb) return [];

    const mType = opts.mediaType === 'tv' ? 'tv' : 'movie';
    const primaryId = cleanId || cleanImdb;
    const embedUrl =
      mType === 'tv' && opts.season && opts.episode
        ? `https://www.2embed.cc/embedtv/${primaryId}&s=${opts.season}&e=${opts.episode}`
        : `https://www.2embed.cc/embed/${primaryId}`;

    const pageRes = await curlGetText(
      embedUrl,
      { Referer: 'https://www.2embed.cc/', 'User-Agent': CHROME_UA },
      5,
      true
    ).catch(() => ({ text: '', effectiveUrl: embedUrl }));
    let html = pageRes.text || '';

    let swishMatch = html.match(/https:\/\/streamsrcs\.2embed\.cc\/swish\?id=([a-zA-Z0-9_-]+)/i);
    if (!swishMatch && mType === 'movie' && html) {
      const imdbEmbedMatch = html.match(/https:\/\/www\.2embed\.cc\/embed\/(tt\d+)/i);
      if (imdbEmbedMatch) {
        const innerRes = await curlGetText(
          imdbEmbedMatch[0],
          { Referer: embedUrl, 'User-Agent': CHROME_UA },
          5,
          true
        ).catch(() => ({ text: '' }));
        html = innerRes.text || '';
        swishMatch = html.match(/https:\/\/streamsrcs\.2embed\.cc\/swish\?id=([a-zA-Z0-9_-]+)/i);
      }
    }
    if (!swishMatch && cleanImdb && cleanImdb !== primaryId) {
      const imdbUrl =
        mType === 'tv' && opts.season && opts.episode
          ? `https://www.2embed.cc/embedtv/${cleanImdb}&s=${opts.season}&e=${opts.episode}`
          : `https://www.2embed.cc/embed/${cleanImdb}`;
      const imdbRes = await curlGetText(
        imdbUrl,
        { Referer: 'https://www.2embed.cc/', 'User-Agent': CHROME_UA },
        5,
        true
      ).catch(() => ({ text: '' }));
      html = imdbRes.text || '';
      swishMatch = html.match(/https:\/\/streamsrcs\.2embed\.cc\/swish\?id=([a-zA-Z0-9_-]+)/i);
    }
    if (!swishMatch) return [];

    const swishUrl = swishMatch[0];
    const swishHtml = (
      await curlGetText(swishUrl, { Referer: embedUrl, 'User-Agent': CHROME_UA }, 5, true).catch(() => ({
        text: '',
      }))
    ).text;
    if (!swishHtml) return [];

    const frameMatch = swishHtml.match(
      /id=["']framesrc["'][^>]*src=["']([^"']+)["']|src=["']([^"']+)["'][^>]*id=["']framesrc["']/i
    );
    const frameRaw = String(frameMatch?.[1] || frameMatch?.[2] || swishMatch[1] || '').trim();
    if (!frameRaw) return [];

    const vcdnUrl = /^https?:\/\//i.test(frameRaw) ? frameRaw : `https://2vcdn.skin/e/${frameRaw}`;
    const unpacked = await unpackVidhideToHls(vcdnUrl);
    if (!unpacked) return [];

    return [
      {
        id: `2embed-en-${mType}-${cleanId || cleanImdb}-${opts.season || 0}-${opts.episode || 0}`,
        label: 'English 1080p · Direct',
        lang: 'EN',
        quality: '1080p HLS',
        sourceUrl: vcdnUrl,
        resolverType: 'vidhide_hls',
        resolvedStreamUrl: unpacked.proxyUrl,
      },
    ];
  } catch (err) {
    console.warn('extract2EmbedEnglishTracks error:', err);
    return [];
  }
}

export async function hasBingetrixEnglishStreamFast(opts: {
  tmdbId: string | number;
  mediaType?: 'movie' | 'tv';
  season?: number;
  episode?: number;
}): Promise<boolean> {
  try {
    const cleanId = String(opts.tmdbId).replace(/\D/g, '');
    if (!cleanId) return false;

    const mType = opts.mediaType === 'tv' ? 'tv' : 'movie';
    const vsQuery =
      mType === 'tv' && opts.season && opts.episode
        ? `type=tv&id=${cleanId}&season=${opts.season}&episode=${opts.episode}`
        : `type=movie&id=${cleanId}`;

    const vsRaw = await curlGetText(
      `https://screenfetch4.cyou/vs_src.php?${vsQuery}`,
      {
        Referer: `https://screenfetch4.cyou/embed/${mType}?tmdb=${cleanId}&o=https%3A%2F%2Fbingetrix.sc`,
        'User-Agent': CHROME_UA,
      },
      3
    );
    if (!vsRaw.text) return false;
    const vsJson: any = JSON.parse(vsRaw.text);
    if (!vsJson?.src) return false;

    const playerOrigin = new URL(vsJson.src).origin;
    const { text: landingHtml } = await curlGetText(
      vsJson.src,
      { Referer: 'https://screenfetch4.cyou/', 'User-Agent': CHROME_UA },
      3
    );

    const cfgMatch = landingHtml.match(/window\.CFG\s*=\s*(\{[^;]+\});/);
    if (!cfgMatch) return false;
    const cfg = JSON.parse(cfgMatch[1]);
    if (!cfg?.playerUrl) return false;

    const { text: playerHtml } = await curlGetText(
      `${playerOrigin}${cfg.playerUrl}`,
      { Referer: vsJson.src, 'User-Agent': CHROME_UA },
      3
    );

    const pCfgMatch = playerHtml.match(/window\.CONFIG\s*=\s*(\{[^;]+\});/);
    if (!pCfgMatch) return false;
    const pCfg = JSON.parse(pCfgMatch[1]);
    if (!pCfg?.apiToken || (pCfg?.turnstile && !String(pCfg.apiToken).trim())) return false;

    const baseMetaApi = pCfg.metaApi || cfg.metaApi || '';
    const baseStreamApi = pCfg.api || (baseMetaApi ? `${baseMetaApi}&stream_urls` : '');
    if (!baseStreamApi) return false;

    const streamApiUrl = `${baseStreamApi}${
      baseStreamApi.includes('?') ? '&' : '?'
    }api_token=${encodeURIComponent(pCfg.apiToken)}`;

    const { text: apiText } = await curlGetText(
      streamApiUrl,
      {
        Referer: `${playerOrigin}/`,
        Origin: playerOrigin,
        Accept: 'application/json',
        'User-Agent': CHROME_UA,
      },
      4
    );
    if (!apiText) return false;
    const apiJson: any = JSON.parse(apiText);

    if (Array.isArray(apiJson?.data?.stream_urls)) {
      return apiJson.data.stream_urls.length > 0;
    }
    if (
      apiJson?.vs &&
      typeof apiJson?.data?.stream_urls === 'string' &&
      apiJson.data.stream_urls.length > 16
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}



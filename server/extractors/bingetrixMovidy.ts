import crypto from 'crypto';
import { LruTtlCache } from '../utils/lruCache.ts';
import { streamingFetch } from '../utils/tlsFetch.ts';
import {
  findVestSeedForMedia,
  isVestMirrorUrl,
} from '../services/vestMirrorService.ts';
import {
  CHROME_UA,
  type TrackRecord,
  areTitlesStrictlyEqual,
  buildHlsProxyUrl,
  buildTsProxyUrl,
  curlGetBuffer,
  curlGetBufferWithStatus,
  curlGetText,
  isMetadataCompatibleForMedia,
  normalizeTitleForMatch,
  parseDurationTextToMinutes,
  probeHlsSegmentHealth,
  rewriteVidsrcBuzzM3u8,
  unwrapRelaySegmentUrl,
} from './httpHelpers.ts';
export { rewriteVidsrcBuzzM3u8 };
import { extractEmbed69SpanishTracks, unpackVidhideToHls } from './vidhideEmbed69.ts';
import { registerVodManifest } from '../routes/proxies.ts';

const wasmModuleCache = new LruTtlCache<string, Promise<WebAssembly.Module>>(16, 60 * 60 * 1000);
const movidyPageMetaCache = new LruTtlCache<string, MovidyPageMetadata>(350, 15 * 60 * 1000);
const availableLangsCache = new LruTtlCache<string, ('ES' | 'LAT' | 'VOSE' | 'EN')[]>(
  500,
  15 * 60 * 1000
);

export interface MovidyPageMetadata {
  isTvShow: boolean;
  cleanTitle: string;
  year: string;
  durationText: string;
  director: string;
  cast: { id: number; name: string; character: string }[];
  overview: string;
  html: string;
}

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
    if (!pCfg?.apiToken) return [];

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
    if (!pCfg?.apiToken) return false;

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

export async function decodeNuploadToHls(
  embedUrlOrB64: string
): Promise<{ rawM3u8: string; proxyUrl: string } | null> {
  try {
    let embedUrl = embedUrlOrB64.trim();
    if (!embedUrl.startsWith('http')) {
      embedUrl = Buffer.from(embedUrl, 'base64').toString('utf8').trim();
    }
    if (!embedUrl.startsWith('http')) return null;
    if (!embedUrl.includes('?')) {
      embedUrl += '?h=';
    }

    const res = await streamingFetch(embedUrl, {
      headers: {
        Referer: 'https://movidy.pw/',
        'User-Agent': CHROME_UA,
      },
      timeoutMs: 5500,
    });

    if (!res.ok) return null;
    const html = await res.text();

    const forEachMatch = html.match(/([a-zA-Z0-9_]+)\.forEach\([\s\S]{0,200}?-\s*(\d+)\)/);
    if (!forEachMatch) return null;

    const [, arrName, offsetStr] = forEachMatch;
    const offset = parseInt(offsetStr, 10);
    const arrRegex = new RegExp(`var\\s+${arrName}\\s*=\\s*(\\[[^\\]]+\\])`);
    const arrMatch = html.match(arrRegex);
    const sesMatch = html.match(/var\s+sesz\s*=\s*["']([^"']+)["']/);

    if (!arrMatch || !sesMatch) return null;

    const encodedItems: string[] = JSON.parse(arrMatch[1]);
    const baseStream = encodedItems
      .map((item) => {
        const decodedDigits = Buffer.from(item, 'base64').toString('utf8').replace(/\D/g, '');
        return String.fromCharCode(parseInt(decodedDigits, 10) - offset);
      })
      .join('');

    const rawM3u8 = `${baseStream}?s=${sesMatch[1]}`;
    const embedOrigin = new URL(embedUrl).origin + '/';
    return {
      rawM3u8,
      proxyUrl: buildHlsProxyUrl(rawM3u8, embedOrigin),
    };
  } catch {
    return null;
  }
}

export function parseMovidyHtmlMetadata(html: string): MovidyPageMetadata {
  const isTvShow = html.includes('id="eps"');
  const h2Match = html.match(/<h2>\s*Ver\s+([\s\S]*?)\s+Movidy\s*<\/h2>/i);
  const cleanTitle = h2Match?.[1] ? h2Match[1].replace(/<[^>]+>/g, '').trim() : '';

  const numbersBlock =
    html.match(/<div\s+class="numbers">([\s\S]*?)<\/div>\s*<div\s+class="links">/i)?.[1] ||
    html.match(/<div\s+class="numbers">([\s\S]{0,400})/i)?.[1] ||
    '';
  const yearMatch = numbersBlock.match(/<span>\s*(19\d{2}|20\d{2})\s*<\/span>/i);
  const year = yearMatch?.[1] ? yearMatch[1].trim() : '';
  const durMatch = numbersBlock.match(/<span>\s*(\d+h\s*\d*m(?:in)?|\d+\s*min)\s*<\/span>/i);
  const durationText = durMatch?.[1] ? durMatch[1].trim() : '';

  const linksBlock =
    html.match(/<div\s+class="links">([\s\S]*?)<\/div>\s*<p>/i)?.[1] || '';
  const dirMatch = linksBlock.match(/<b>\s*Director:\s*<\/b>\s*<a[^>]*>([^<]+)<\/a>/i);
  const director = dirMatch?.[1] ? dirMatch[1].trim() : '';

  const castBlock = linksBlock.split(/<b>\s*Reparto:\s*<\/b>/i)[1] || '';
  const castNames = [...castBlock.matchAll(/<a[^>]*>([^<]+)<\/a>/gi)]
    .map((m) => String(m[1] || '').replace(/,+$/, '').trim())
    .filter(Boolean)
    .slice(0, 8);
  const cast = castNames.map((name, idx) => ({
    id: idx + 1,
    name,
    character: 'Reparto',
  }));

  const pMatch = html.match(/<div\s+class="links">[\s\S]*?<\/div>\s*<p>([\s\S]*?)<\/p>/i);
  const overview = pMatch?.[1] ? pMatch[1].replace(/<[^>]+>/g, '').trim() : '';

  return {
    isTvShow,
    cleanTitle,
    year,
    durationText,
    director,
    cast,
    overview,
    html,
  };
}

export async function fetchMovidyPageMetadata(
  movidyVerUrl: string
): Promise<MovidyPageMetadata | null> {
  try {
    const cleanUrl = String(movidyVerUrl || '').trim();
    if (!cleanUrl.includes('movidy.pw/ver/')) return null;

    const cached = movidyPageMetaCache.get(cleanUrl);
    if (cached) return cached;

    let html = '';
    try {
      const res = await streamingFetch(cleanUrl, {
        headers: {
          'User-Agent': CHROME_UA,
          Referer: 'https://movidy.pw/pelis/',
        },
        timeoutMs: 5000,
      });
      if (res.ok) {
        html = await res.text();
      }
    } catch {
      const fb = await curlGetText(
        cleanUrl,
        { 'User-Agent': CHROME_UA, Referer: 'https://movidy.pw/' },
        5
      ).catch(() => ({ text: '' }));
      html = fb.text;
    }

    if (!html) return null;

    const meta = parseMovidyHtmlMetadata(html);
    movidyPageMetaCache.set(cleanUrl, meta);
    return meta;
  } catch {
    return null;
  }
}

export function extractMovidyTracksFromHtml(html: string, slugHint = 'movidy'): TrackRecord[] {
  const trackRegex =
    /<li[^>]*class="[^"]*play-url[^"]*"[^>]*data-url="([^"]+)"[^>]*>[\s\S]*?<span>([^<]+)<\/span>\s*<\/li>/gi;
  const rawTracks: TrackRecord[] = [];
  let match: RegExpExecArray | null;

  while ((match = trackRegex.exec(html)) !== null) {
    const dataUrl = String(match[1] || '').trim();
    const rawLangText = String(match[2] || '').trim();
    if (!dataUrl) continue;

    let lang: 'ES' | 'LAT' | 'VOSE' = 'ES';
    let label = 'Castellano HD (Movidy)';

    if (/castellano|espa[ñn]ol|espa[ñn]a/i.test(rawLangText) && !/latino/i.test(rawLangText)) {
      lang = 'ES';
      label = 'Castellano HD · Movidy';
    } else if (/latino/i.test(rawLangText)) {
      lang = 'LAT';
      label = 'Español Latino HD · Movidy';
    } else if (/subtitulado|vose|original/i.test(rawLangText)) {
      lang = 'VOSE';
      label = 'Subtitulado VOSE · Movidy';
    } else {
      lang = 'ES';
      label = `${rawLangText} HD · Movidy`;
    }

    rawTracks.push({
      id: `movidy-${slugHint}-${lang.toLowerCase()}-${rawTracks.length + 1}`,
      label,
      lang,
      quality: 'HD HLS',
      sourceUrl: dataUrl,
      resolverType: 'movidy_embed',
    });
  }

  const langOrder: Record<string, number> = { ES: 1, LAT: 2, VOSE: 3 };
  return rawTracks.sort((a, b) => (langOrder[a.lang] || 9) - (langOrder[b.lang] || 9));
}

export function verifyMovidyMetaMatch(
  meta: Pick<MovidyPageMetadata, 'isTvShow' | 'cleanTitle' | 'year' | 'durationText' | 'director'>,
  opts: {
    titleHints: string[];
    expectedYear?: string;
    expectedDirector?: string;
    expectedRuntimeMin?: number;
    expectedMediaType?: 'movie' | 'tv';
  }
): { ok: boolean; exactYear: boolean; reason?: string } {
  if (opts.expectedMediaType === 'movie' && meta.isTvShow) {
    return { ok: false, exactYear: false, reason: 'tv_show_not_movie' };
  }
  if (opts.expectedMediaType === 'tv' && !meta.isTvShow) {
    return { ok: false, exactYear: false, reason: 'movie_not_tv_show' };
  }
  const candRuntimeMin = parseDurationTextToMinutes(meta.durationText);
  return isMetadataCompatibleForMedia({
    candidateTitle: meta.cleanTitle || undefined,
    targetTitleHints: opts.titleHints,
    candidateYear: meta.year || undefined,
    expectedYear: opts.expectedYear,
    candidateDirector: meta.director || undefined,
    expectedDirector: opts.expectedDirector,
    candidateRuntimeMin: candRuntimeMin || undefined,
    expectedRuntimeMin: opts.expectedRuntimeMin,
  });
}

export async function extractMovidyPageTracks(
  movidyVerUrl: string,
  opts?: {
    expectedYear?: string;
    requireMovieOnly?: boolean;
    expectedTitleHints?: string[];
    expectedDirector?: string;
    expectedRuntimeMin?: number;
  }
): Promise<TrackRecord[]> {
  try {
    const cleanUrl = movidyVerUrl.trim();
    if (!cleanUrl.includes('movidy.pw/ver/')) return [];

    const meta = await fetchMovidyPageMetadata(cleanUrl);
    if (!meta || !meta.html) return [];

    if (opts?.requireMovieOnly && meta.isTvShow) {
      return [];
    }

    if (
      opts &&
      (opts.expectedYear ||
        (opts.expectedTitleHints && opts.expectedTitleHints.length > 0) ||
        opts.expectedDirector ||
        opts.expectedRuntimeMin)
    ) {
      const check = verifyMovidyMetaMatch(meta, {
        titleHints: opts.expectedTitleHints || [],
        expectedYear: opts.expectedYear,
        expectedDirector: opts.expectedDirector,
        expectedRuntimeMin: opts.expectedRuntimeMin,
        expectedMediaType: opts.requireMovieOnly ? 'movie' : undefined,
      });
      if (!check.ok) {
        return [];
      }
    }

    const slug =
      cleanUrl
        .split('/ver/')[1]
        ?.replace(/\//g, '')
        .replace(/[^a-zA-Z0-9_-]/g, '') || 'movidy';

    return extractMovidyTracksFromHtml(meta.html, slug);
  } catch (err) {
    console.warn('extractMovidyPageTracks error:', err);
    return [];
  }
}

export async function findMovidyUrlByTitle(
  title: string,
  expectedYear?: string,
  opts?: {
    expectedDirector?: string;
    expectedRuntimeMin?: number;
    titleHints?: string[];
  }
): Promise<string | null> {
  try {
    const rawClean = String(title || '').trim();
    const clean = rawClean.replace(/\s*\([^)]*\)/g, '').trim();
    const queryTerm = clean || rawClean;
    const allHints = Array.from(
      new Set([rawClean, ...(opts?.titleHints || [])].map((s) => String(s || '').trim()).filter(Boolean))
    );

    if (!queryTerm || queryTerm.length < 2 || allHints.length === 0) {
      return null;
    }

    const searchUrl = `https://movidy.pw/?s=${encodeURIComponent(queryTerm)}`;
    let html = '';
    try {
      const res = await streamingFetch(searchUrl, {
        headers: { 'User-Agent': CHROME_UA, Referer: 'https://movidy.pw/' },
        timeoutMs: 3800,
      });
      if (res.ok) html = await res.text();
    } catch {
      const fb = await curlGetText(
        searchUrl,
        { 'User-Agent': CHROME_UA, Referer: 'https://movidy.pw/' },
        5
      ).catch(() => ({ text: '' }));
      html = fb.text;
    }
    if (!html) return null;

    const itemRe =
      /<li>\s*<a\s+href="((?:https?:\/\/movidy\.[a-z]+)?\/ver\/[^"]+)"[^>]*>\s*<h3\s+class="item-title">\s*<span>([^<]+)<\/span>\s*<\/h3>/gi;

    const exactMatches: string[] = [];
    let m: RegExpExecArray | null;

    while ((m = itemRe.exec(html)) !== null) {
      const rawHref = String(m[1] || '').trim();
      const rawSpanTitle = String(m[2] || '').trim();
      if (!rawHref || !rawSpanTitle) continue;

      const fullUrl = rawHref.startsWith('http') ? rawHref : `https://movidy.pw${rawHref}`;
      if (areTitlesStrictlyEqual(rawSpanTitle, allHints) && !exactMatches.includes(fullUrl)) {
        exactMatches.push(fullUrl);
      }
    }

    if (exactMatches.length === 0) return null;

    let verifiedAdjacentFallback: string | null = null;
    for (const candidateUrl of exactMatches.slice(0, 6)) {
      const meta = await fetchMovidyPageMetadata(candidateUrl);
      if (!meta || meta.isTvShow) continue;

      const verdict = verifyMovidyMetaMatch(meta, {
        titleHints: allHints,
        expectedYear,
        expectedDirector: opts?.expectedDirector,
        expectedRuntimeMin: opts?.expectedRuntimeMin,
        expectedMediaType: 'movie',
      });
      if (!verdict.ok) continue;

      if (verdict.exactYear || !expectedYear) {
        return candidateUrl;
      }
      if (!verifiedAdjacentFallback) {
        verifiedAdjacentFallback = candidateUrl;
      }
    }

    return verifiedAdjacentFallback;
  } catch {
    return null;
  }
}

export async function probeAvailableLanguages(opts: {
  tmdbId: string | number;
  imdbId?: string | null;
  mediaType: 'movie' | 'tv';
  season?: number;
  episode?: number;
  titleHints?: string[];
  movidyUrl?: string;
  vestUrl?: string;
  yearHint?: string;
  directorHint?: string;
  runtimeMinHint?: number;
}): Promise<('ES' | 'LAT' | 'VOSE' | 'EN')[]> {
  const cleanId = String(opts.tmdbId || '').replace(/\D/g, '');
  const season = opts.mediaType === 'tv' ? opts.season || 1 : 0;
  const episode = opts.mediaType === 'tv' ? opts.episode || 1 : 0;
  const cacheKey = `v3|${opts.mediaType}|${cleanId || opts.movidyUrl || opts.vestUrl || ''}|${opts.yearHint || ''}|${season}|${episode}`;

  const cached = availableLangsCache.get(cacheKey);
  if (cached) return cached;

  const hints = Array.from(
    new Set((opts.titleHints || []).map((t) => String(t || '').trim()).filter(Boolean))
  );

  const hasExplicitMovidy = Boolean(
    opts.movidyUrl && opts.movidyUrl.includes('movidy.pw/ver/')
  );

  const movidyPromise = (async (): Promise<TrackRecord[]> => {
    if (opts.mediaType !== 'movie') return [];
    let mvUrl = hasExplicitMovidy ? opts.movidyUrl! : '';
    if (mvUrl && (cleanId || opts.yearHint || opts.directorHint || opts.runtimeMinHint)) {
      const explicitMeta = await fetchMovidyPageMetadata(mvUrl);
      if (
        !explicitMeta ||
        !verifyMovidyMetaMatch(explicitMeta, {
          titleHints: cleanId ? hints : [],
          expectedYear: opts.yearHint,
          expectedDirector: opts.directorHint,
          expectedRuntimeMin: opts.runtimeMinHint,
          expectedMediaType: 'movie',
        }).ok
      ) {
        mvUrl = '';
      }
    }
    if (!mvUrl) {
      for (const h of hints.slice(0, 2)) {
        const found = await findMovidyUrlByTitle(h, opts.yearHint, {
          expectedDirector: opts.directorHint,
          expectedRuntimeMin: opts.runtimeMinHint,
          titleHints: hints,
        });
        if (found) {
          mvUrl = found;
          break;
        }
      }
    }
    if (!mvUrl) return [];
    return extractMovidyPageTracks(mvUrl, {
      expectedYear: opts.yearHint,
      requireMovieOnly: true,
      expectedTitleHints: cleanId ? hints : undefined,
      expectedDirector: opts.directorHint,
      expectedRuntimeMin: opts.runtimeMinHint,
    });
  })();

  const embedPromise =
    cleanId || hints.length > 0
      ? extractEmbed69SpanishTracks({
          tmdbId: cleanId || undefined,
          imdbId: opts.imdbId,
          mediaType: opts.mediaType,
          season: season || undefined,
          episode: episode || undefined,
          titleHints: hints,
          yearHint: opts.yearHint,
          directorHint: opts.directorHint,
          runtimeMinHint: opts.runtimeMinHint,
        })
      : Promise.resolve([] as TrackRecord[]);

  const checkAnyEnglishStream = async (): Promise<boolean> => {
    if (!cleanId && !opts.imdbId) return false;
    const probes: Promise<boolean>[] = [
      has2EmbedEnglishStreamFast({
        tmdbId: cleanId || '0',
        imdbId: opts.imdbId,
        mediaType: opts.mediaType,
        season: season || undefined,
        episode: episode || undefined,
      }),
    ];
    if (cleanId) {
      probes.push(
        hasBingetrixEnglishStreamFast({
          tmdbId: cleanId,
          mediaType: opts.mediaType,
          season: season || undefined,
          episode: episode || undefined,
        })
      );
    }
    return new Promise<boolean>((resolve) => {
      let pending = probes.length;
      for (const p of probes) {
        p.then((ok) => {
          if (ok) {
            resolve(true);
            return;
          }
          pending -= 1;
          if (pending <= 0) resolve(false);
        }).catch(() => {
          pending -= 1;
          if (pending <= 0) resolve(false);
        });
      }
    });
  };

  const withProbeTimeout = <T>(p: Promise<T>, ms: number, fallback: T): Promise<T> =>
    Promise.race([
      p.catch(() => fallback),
      new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
    ]);

  const [mvTracks, esTracks, hasEn] = await Promise.all([
    withProbeTimeout(movidyPromise, 4500, [] as TrackRecord[]),
    withProbeTimeout(embedPromise, 6500, [] as TrackRecord[]),
    withProbeTimeout(checkAnyEnglishStream(), 4200, false),
  ]);
  const foundSet = new Set<'ES' | 'LAT' | 'VOSE' | 'EN'>();

  for (const t of [...mvTracks, ...esTracks]) {
    const code = String(t.lang || '').toUpperCase();
    if (code === 'ES' || code === 'LAT' || code === 'VOSE' || code === 'EN') {
      foundSet.add(code);
    }
  }
  if (hasEn) {
    foundSet.add('EN');
  }

  const vestMatch =
    (opts.vestUrl && isVestMirrorUrl(opts.vestUrl)) ||
    Boolean(
      findVestSeedForMedia({
        tmdbId: cleanId || undefined,
        mediaType: opts.mediaType,
        yearHint: opts.yearHint,
        titleHints: hints,
        season: season || undefined,
        episode: episode || undefined,
      })
    );
  if (vestMatch) {
    foundSet.add('ES');
    foundSet.add('VOSE');
  }

  const ordered = (['ES', 'LAT', 'VOSE', 'EN'] as const).filter((code) =>
    foundSet.has(code)
  );

  if (ordered.length > 0) {
    availableLangsCache.set(cacheKey, ordered);
  }

  return ordered;
}

function parseQConfigFromHtml(html: string): any | null {
  const idx = html.search(/var\s+Q\s*=\s*\{/);
  if (idx === -1) return null;
  const start = html.indexOf('{', idx);
  if (start === -1) return null;
  let depth = 0;
  let inStr: string | null = null;
  let escaped = false;
  for (let i = start; i < html.length && i - start < 100_000; i++) {
    const ch = html[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (inStr) {
      if (ch === '\\') escaped = true;
      else if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inStr = ch;
    } else if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

export async function extractVidsrcBuzzHlsTracks(opts: {
  tmdbId?: string | number;
  imdbId?: string | null;
  mediaType?: 'movie' | 'tv';
  season?: number;
  episode?: number;
}): Promise<TrackRecord[]> {
  const cleanId = String(opts.tmdbId || '').replace(/\D/g, '');
  const cleanImdb = String(opts.imdbId || '').trim();
  const idList = Array.from(new Set([cleanId, cleanImdb].filter(Boolean)));
  if (idList.length === 0) return [];

  const mType = opts.mediaType === 'tv' ? 'tv' : 'movie';
  const season = Math.max(1, Number(opts.season || 1));
  const episode = Math.max(1, Number(opts.episode || 1));
  const embedBases = ['https://vidsrc.buzz', 'https://videm.buzz'];
  const tracks: TrackRecord[] = [];
  const seenStreams = new Set<string>();

  for (const baseOrigin of embedBases) {
    if (tracks.length >= 2) break;
    for (const mediaId of idList) {
      if (tracks.length >= 2) break;
      const embedUrl =
        mType === 'tv'
          ? `${baseOrigin}/embed/tv/${encodeURIComponent(mediaId)}/${season}/${episode}`
          : `${baseOrigin}/embed/movie/${encodeURIComponent(mediaId)}`;

      try {
        const embedReferer = baseOrigin.includes('videm.buzz')
          ? 'https://vidsrc.buzz/'
          : `${baseOrigin}/`;
        const page = await curlGetText(
          embedUrl,
          { 'User-Agent': CHROME_UA, Referer: embedReferer },
          7,
          true
        );
        const html = page.text || '';
        if (!html || /not\s*found|unavailable/i.test(html.slice(0, 600))) continue;

        const qObj = parseQConfigFromHtml(html);
        if (!qObj || !qObj.t) continue;

        const rawServers = qObj?.ssr?.servers;
        const servers: { name?: string; ref?: string }[] = Array.isArray(rawServers)
          ? rawServers
          : rawServers && typeof rawServers === 'object'
          ? Object.values(rawServers)
          : qObj?.ssr?.ref
          ? [qObj.ssr]
          : [];
        if (servers.length === 0) continue;

        const baseHrefMatch = html.match(/<base[^>]+href\s*=\s*["']([^"']+)["']/i);
        const resolvedBase = baseHrefMatch?.[1]
          ? new URL(baseHrefMatch[1], `${baseOrigin}/`).href
          : /\/pl\/api\.php/i.test(html)
          ? `${baseOrigin}/pl/`
          : `${baseOrigin}/`;

        for (const srv of servers.slice(0, 3)) {
          if (!srv?.ref) continue;
          const apiUrl = new URL(
            `api.php?a=play&ref=${encodeURIComponent(String(srv.ref))}&t=${encodeURIComponent(
              String(qObj.t)
            )}`,
            resolvedBase
          ).href;
          const apiResp = await curlGetText(
            apiUrl,
            {
              'User-Agent': CHROME_UA,
              Referer: embedUrl,
              Accept: 'application/json, text/plain, */*',
            },
            7,
            true
          ).catch(() => ({ text: '' }));
          if (!apiResp.text) continue;

          let playJson: any = null;
          try {
            playJson = JSON.parse(apiResp.text);
          } catch {
            continue;
          }
          const rawManifestPath = String(playJson?.url || '').trim();
          if (!rawManifestPath) continue;

          let manifestUrl = new URL(rawManifestPath, `${baseOrigin}/`).href;
          const mResp = await curlGetText(
            manifestUrl,
            { 'User-Agent': CHROME_UA, Referer: embedUrl },
            7,
            true
          ).catch(() => ({ text: '', effectiveUrl: manifestUrl }));
          let manifestText = mResp.text || '';
          manifestUrl = mResp.effectiveUrl || manifestUrl;
          if (!manifestText.includes('#EXTM3U')) continue;

          // If master playlist, pick the highest-bitrate variant so we unwrap relay segments cleanly
          if (manifestText.includes('#EXT-X-STREAM-INF')) {
            const variantLines = manifestText.split(/\r?\n/);
            let bestVar = '';
            let bestBw = -1;
            let pendingBw = 0;
            let expectUri = false;
            for (const raw of variantLines) {
              const t = raw.trim();
              if (!t) continue;
              if (t.startsWith('#EXT-X-STREAM-INF')) {
                pendingBw = parseInt(t.match(/BANDWIDTH=(\d+)/i)?.[1] || '0', 10) || 0;
                expectUri = true;
                continue;
              }
              if (t.startsWith('#')) continue;
              if (expectUri) {
                expectUri = false;
                if (!bestVar || pendingBw >= bestBw) {
                  bestBw = pendingBw;
                  bestVar = new URL(t, manifestUrl).href;
                }
              }
            }
            if (bestVar) {
              const varResp = await curlGetText(
                bestVar,
                { 'User-Agent': CHROME_UA, Referer: embedUrl },
                5,
                true
              ).catch(() => ({ text: '', effectiveUrl: bestVar }));
              if (varResp.text && varResp.text.includes('#EXTM3U')) {
                manifestText = varResp.text;
                manifestUrl = varResp.effectiveUrl || bestVar;
              }
            }
          }

          const { rewritten, firstSegment } = rewriteVidsrcBuzzM3u8(
            manifestText,
            manifestUrl,
            `${baseOrigin}/`
          );

          if (firstSegment) {
            if (seenStreams.has(firstSegment.url)) continue;
            const probe = await curlGetBufferWithStatus(
              firstSegment.url,
              {
                'User-Agent': CHROME_UA,
                Referer: firstSegment.referer,
                Range: 'bytes=0-65535',
              },
              4
            ).catch(() => ({ buf: Buffer.alloc(0), status: 0 }));
            const headStr = probe.buf.subarray(0, 64).toString('utf8').trimStart().toLowerCase();
            if (
              probe.status < 200 ||
              probe.status >= 400 ||
              probe.buf.length < 512 ||
              headStr.startsWith('<!doctype') ||
              headStr.startsWith('<html')
            ) {
              continue;
            }
            seenStreams.add(firstSegment.url);
          }

          const vodManifestPath = registerVodManifest(rewritten);
          const serverLabel = String(srv.name || `Cloud ${tracks.length + 1}`).trim();
          tracks.push({
            id: `vidbuzz-${mType}-${mediaId}-${tracks.length + 1}`,
            label: `English HD · ${serverLabel}`,
            lang: 'EN',
            quality: '1080p HLS',
            sourceUrl: embedUrl,
            referer: `${baseOrigin}/`,
            resolverType: 'bingetrix_en',
            resolvedStreamUrl: vodManifestPath,
          });
          if (tracks.length >= 2) break;
        }
      } catch {
        // try next source
      }
    }
  }

  return tracks;
}

const vidRockKey = Buffer.from(
  '7f3e9c2a8b5d1f4e6a9c3b7d2e5f8a1c4b6d9e2f5a8c1b4d7e9f2a5c8b1d4e7f',
  'hex'
);

export function decryptVidRockToken(token: string): string | null {
  try {
    const raw = Buffer.from(token, 'base64url');
    if (raw.length <= 28) return null;
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(raw.length - 16);
    const ciphertext = raw.subarray(12, raw.length - 16);
    const decipher = crypto.createDecipheriv('aes-256-gcm', vidRockKey, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

const vidsrcBuzzEmptyCache = new LruTtlCache<string, boolean>(300, 15 * 60 * 1000);

export async function probeVidsrcBuzzHasContent(opts: {
  tmdbId?: string | number;
  imdbId?: string | null;
  mediaType?: 'movie' | 'tv';
  season?: number;
  episode?: number;
}): Promise<boolean> {
  const cleanId = String(opts.tmdbId || '').replace(/\D/g, '');
  const cleanImdb = String(opts.imdbId || '').trim();
  const id = cleanId || cleanImdb;
  if (!id) return false;
  const mType = opts.mediaType === 'tv' ? 'tv' : 'movie';
  const s = Math.max(1, Number(opts.season || 1));
  const e = Math.max(1, Number(opts.episode || 1));
  const key = `${mType}:${id}:${s}:${e}`;
  if (vidsrcBuzzEmptyCache.has(key)) {
    return vidsrcBuzzEmptyCache.get(key) === true;
  }
  try {
    const testUrl =
      mType === 'tv'
        ? `https://vidsrc.buzz/embed/tv/${encodeURIComponent(id)}/${s}/${e}`
        : `https://vidsrc.buzz/embed/movie/${encodeURIComponent(id)}`;
    const page = await curlGetText(testUrl, { 'User-Agent': CHROME_UA, Referer: 'https://vidsrc.buzz/' }, 4, true);
    const html = page.text || '';
    if (!html || /No content available/i.test(html) || /"ssr"\s*:\s*null/i.test(html)) {
      vidsrcBuzzEmptyCache.set(key, false);
      return false;
    }
    vidsrcBuzzEmptyCache.set(key, true);
    return true;
  } catch {
    return false;
  }
}

export async function extractVidRockHlsTracks(opts: {
  tmdbId?: string | number;
  mediaType?: 'movie' | 'tv';
  season?: number;
  episode?: number;
}): Promise<TrackRecord[]> {
  const cleanId = String(opts.tmdbId || '').replace(/\D/g, '');
  if (!cleanId) return [];

  const mType = opts.mediaType === 'tv' ? 'tv' : 'movie';
  const s = Math.max(1, Number(opts.season || 1));
  const e = Math.max(1, Number(opts.episode || 1));

  const apiUrl =
    mType === 'tv'
      ? `https://vidrock.net/api/tv/${cleanId}/${s}/${e}`
      : `https://vidrock.net/api/movie/${cleanId}`;

  try {
    const resp = await streamingFetch(apiUrl, {
      headers: {
        'User-Agent': CHROME_UA,
        Referer: 'https://vidrock.net/',
        Accept: 'application/json, text/plain, */*',
      },
      timeoutMs: 4500,
    }).catch(() => null);

    let rawJson: any = null;
    if (resp && resp.ok) {
      rawJson = await resp.json().catch(() => null);
    }
    if (!rawJson) {
      const fb = await curlGetText(apiUrl, { 'User-Agent': CHROME_UA, Referer: 'https://vidrock.net/' }, 5, true).catch(
        () => ({ text: '' })
      );
      if (fb.text) {
        try {
          rawJson = JSON.parse(fb.text);
        } catch {
          rawJson = null;
        }
      }
    }

    const rawEntries: { name: string; url: string; rawLang?: string }[] = [];
    if (Array.isArray(rawJson)) {
      for (const entry of rawJson) {
        const name = String(entry?.name || 'Server').trim();
        const rawToken = String(entry?.url || '').trim();
        if (rawToken) rawEntries.push({ name, url: rawToken, rawLang: entry?.language });
      }
    } else if (rawJson && typeof rawJson === 'object') {
      for (const [srvName, val] of Object.entries(rawJson)) {
        if (val && typeof val === 'object') {
          const rawToken = String((val as any)?.url || '').trim();
          if (rawToken) {
            rawEntries.push({
              name: srvName,
              url: rawToken,
              rawLang: (val as any)?.language,
            });
          }
        }
      }
    }

    if (rawEntries.length === 0) return [];

    const candidates = rawEntries
      .map((entry) => {
        const decrypted = entry.url.startsWith('http')
          ? entry.url
          : decryptVidRockToken(entry.url);
        if (!decrypted || !decrypted.startsWith('http')) return null;
        let lang: 'ES' | 'LAT' | 'VOSE' | 'EN' = 'EN';
        const rl = String(entry.rawLang || '').toLowerCase();
        if (rl.includes('spanish') || rl.includes('español')) {
          lang = rl.includes('latino') ? 'LAT' : 'ES';
        } else if (rl.includes('japanese') || rl.includes('japón') || rl.includes('anime')) {
          lang = 'VOSE';
        }
        return { name: entry.name, url: decrypted, lang };
      })
      .filter((c): c is { name: string; url: string; lang: 'ES' | 'LAT' | 'VOSE' | 'EN' } => Boolean(c));

    if (candidates.length === 0) return [];

    const verified = await Promise.all(
      candidates.slice(0, 5).map(async (item, idx): Promise<TrackRecord | null> => {
        const isHealthy = await probeHlsSegmentHealth(item.url, 'https://vidrock.net/');
        if (!isHealthy) return null;

        const proxyUrl = buildHlsProxyUrl(item.url, 'https://vidrock.net/');
        const trackId = `vidrock-${mType}-${cleanId}-${s}-${e}-${idx + 1}`;
        const langLabel =
          item.lang === 'VOSE'
            ? 'VOSE Sub'
            : item.lang === 'ES'
            ? 'Castellano'
            : item.lang === 'LAT'
            ? 'Latino'
            : 'English';
        return {
          id: trackId,
          label: `${langLabel} 1080p · ${item.name}`,
          lang: item.lang,
          quality: '1080p HLS',
          sourceUrl: item.url,
          referer: 'https://vidrock.net/',
          resolverType: 'direct_hls',
          resolvedStreamUrl: proxyUrl,
        };
      })
    );

    return verified.filter((t): t is TrackRecord => Boolean(t));
  } catch (err) {
    console.warn('extractVidRockHlsTracks error:', err);
    return [];
  }
}


import { LruTtlCache } from '../../utils/lruCache.ts';
export { renderIptvChannelPng } from './iptvPngBadge.ts';
import { streamingFetch } from '../../utils/tlsFetch.ts';
import { curlPlainGetText } from '../../services/vestMirrorService.ts';
import {
  CHROME_UA,
  TDT_DVB_UA,
  buildHlsProxyUrl,
  buildTsProxyUrl,
  curlGetBufferWithStatus,
  curlGetText,
  getPreferredUpstreamUa,
  isDvbHeadendStream,
  markHostNeedsCurlFallback,
  resolveKnownUpstreamReferer,
  shouldBypassNodeFetch,
} from '../../extractors/httpHelpers.ts';

export const IPTV_GROUP_TITLES: Record<string, string> = {
  generalistas: 'España · TDT Generalistas',
  infantil_autonomicas: 'España · Infantil y Autonómicas',
  movistar: 'Deportes · Movistar+ & LaLiga',
  dazn: 'Deportes · DAZN & Motor',
  uk_sports: 'Deportes · UK Sports & Eurosport',
  china_football: 'Deportes · Fútbol Internacional',
  beinsports: 'Deportes · beIN SPORTS HD',
  bein_arabic: 'Deportes · beIN SPORTS العربية',
  espn: 'Deportes · ESPN & LatAm',
  dsports: 'Deportes · DSports',
  tnt_space: 'Deportes · TNT Sports & Space',
  world_cricket: 'Deportes Mundial & Cricket',
  noticias_deportes: 'Deportes & Noticias Directo',
  cine_series: 'Cine y Series 24/7',
  famelack_movies: 'Cine Mundial · Famelack 24/7',
  documentales: 'Documentales y Ciencia',
  entretenimiento: 'Entretenimiento y Variedades',
  fast_thematic: 'Canales Temáticos FAST 24/7',
  kids_world: 'Infantil Mundial',
  marruecos: 'Marruecos · SNRT & 2M',
  elahmad_mena: 'MENA & Árabe · Elahmad',
  adrar_europa: 'Europa · ADRAR (ES/FR/DE/IT/TR/UK/PT/NL/BE/RU)',
  europa_tv: 'Europa · Noticias & Generalistas',
  usa_tv: 'Estados Unidos · FOX / NBC / CNN',
  noticias_intl: 'Noticias Internacionales',
  internacional: 'Canales Internacionales',
  belix_live: 'Belix TV · Canales Directo',
  rbtv_sports: 'RBTV+ · Deportes Estables',
};

export type IptvMacroGroupId =
  | 'espana'
  | 'deportes'
  | 'cine_docs'
  | 'europa_usa'
  | 'mena_marruecos'
  | 'infantil';

export const IPTV_MACRO_GROUP_LABELS: Record<IptvMacroGroupId, string> = {
  espana: 'España y Autonómicas',
  deportes: 'Fútbol y Deportes',
  cine_docs: 'Cine, Series y Docs',
  europa_usa: 'Europa y América',
  mena_marruecos: 'Marruecos y MENA',
  infantil: 'Infantil y Familia',
};

export function getIptvMacroGroup(category: string): IptvMacroGroupId {
  switch (category) {
    case 'generalistas':
      return 'espana';
    case 'infantil_autonomicas':
    case 'kids_world':
      return 'infantil';
    case 'movistar':
    case 'dazn':
    case 'uk_sports':
    case 'china_football':
    case 'beinsports':
    case 'bein_arabic':
    case 'espn':
    case 'dsports':
    case 'tnt_space':
    case 'world_cricket':
    case 'noticias_deportes':
    case 'rbtv_sports':
      return 'deportes';
    case 'belix_live':
      return 'cine_docs';
    case 'cine_series':
    case 'famelack_movies':
    case 'documentales':
    case 'fast_thematic':
    case 'entretenimiento':
      return 'cine_docs';
    case 'marruecos':
    case 'elahmad_mena':
      return 'mena_marruecos';
    default:
      return 'europa_usa';
  }
}

const IPTV_EPG_ID_ALIASES: Record<string, string> = {
  'cat-sx3-live': 'cat-sx3',
  'cat-tv3-live': 'cat-tv3',
  'cat-324-live': 'cat-324',
  'bein-ar-1': 'beINSports1.qa@MENA',
  'bein-ar-2': 'beINSports2.qa@MENA',
  'bein-ar-3': 'beINSports3.qa@MENA',
  'bein-ar-4': 'beINSports4.qa@MENA',
  'bein-ar-5': 'beINSports5.qa@MENA',
  'bein-ar-6': 'beINSports6.qa@MENA',
  'bein-ar-7': 'beINSports7.qa@MENA',
  'bein-ar-8': 'beINSports8.qa@MENA',
  'bein-ar-9': 'beINSports9.qa@MENA',
  'bein-ar-xtra': 'beINSportsXTRA1.qa@MENA',
};

export function getIptvEpgId(channelId: string): string {
  return IPTV_EPG_ID_ALIASES[channelId] || channelId;
}

export function escapeXmlText(val: string): string {
  return String(val || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function formatXmltvUtcTime(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(
    d.getUTCHours()
  )}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())} +0000`;
}


export async function fetchUpstreamManifestText(
  targetUrl: string,
  referer: string,
  forceAac: boolean
): Promise<{ text: string; finalUrl: string } | null> {
  const headers: Record<string, string> = {
    'User-Agent': isDvbHeadendStream(targetUrl) || forceAac ? TDT_DVB_UA : getPreferredUpstreamUa(targetUrl),
    Accept: '*/*',
  };
  if (referer) {
    headers['Referer'] = referer;
    try {
      headers['Origin'] = new URL(referer).origin;
    } catch {
      // ignore
    }
  }

  const manifestTimeoutMs = isDvbHeadendStream(targetUrl) ? 7500 : 3800;

  if (!shouldBypassNodeFetch(targetUrl)) {
    try {
      const resp = await streamingFetch(targetUrl, {
        headers,
        timeoutMs: manifestTimeoutMs,
      });
      if (resp.ok) {
        const text = await resp.text();
        if (text.includes('#EXTM3U') && !/nosignal/i.test(text)) {
          return { text, finalUrl: resp.url || targetUrl };
        }
      }
    } catch {
      markHostNeedsCurlFallback(targetUrl);
    }
  }

  const fb = await curlGetText(targetUrl, headers, 5, true, true).catch(() => ({
    text: '',
    effectiveUrl: targetUrl,
  }));
  if (fb.text && fb.text.includes('#EXTM3U') && !/nosignal/i.test(fb.text)) {
    return { text: fb.text, finalUrl: fb.effectiveUrl || targetUrl };
  }
  if (referer || Object.keys(headers).length > 0) {
    const plainText = await curlPlainGetText(targetUrl, 5).catch(() => '');
    if (plainText && plainText.includes('#EXTM3U') && !/nosignal/i.test(plainText)) {
      return { text: plainText, finalUrl: targetUrl };
    }
  }
  return null;
}

export async function unwrapMasterPlaylistForIptv(
  manifestObj: { text: string; finalUrl: string },
  referer: string,
  forceAac: boolean
): Promise<{ text: string; finalUrl: string } | null> {
  let current = manifestObj;

  for (let depth = 0; depth < 3; depth++) {
    const txt = current.text || '';
    if (!txt.includes('#EXT-X-STREAM-INF')) {
      return current;
    }

    const lines = txt.split(/\r?\n/);
    let hasExternalOnlyDefaultAudio = false;
    let hasAnyAudioMedia = false;
    let hasMuxedDefaultAudio = false;
    for (const raw of lines) {
      const line = raw.trim();
      if (line.startsWith('#EXT-X-MEDIA') && line.includes('TYPE=AUDIO')) {
        hasAnyAudioMedia = true;
        const isDefault = /DEFAULT=YES/i.test(line);
        const hasUri = /URI="/i.test(line);
        if (isDefault && !hasUri) hasMuxedDefaultAudio = true;
        if (isDefault && hasUri) hasExternalOnlyDefaultAudio = true;
      }
    }
    if (hasAnyAudioMedia && hasExternalOnlyDefaultAudio && !hasMuxedDefaultAudio) {
      return current;
    }

    const variants: Array<{ url: string; bw: number }> = [];
    let pendingBw = 0;
    let expectingUrl = false;
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      if (line.startsWith('#EXT-X-STREAM-INF')) {
        const bwMatch = line.match(/BANDWIDTH=(\d+)/i);
        pendingBw = bwMatch ? parseInt(bwMatch[1], 10) || 0 : 0;
        expectingUrl = true;
        continue;
      }
      if (line.startsWith('#')) {
        continue;
      }
      if (expectingUrl) {
        expectingUrl = false;
        try {
          const absVariant = new URL(line, current.finalUrl).href;
          variants.push({ url: absVariant, bw: pendingBw });
        } catch {
          // ignore invalid variant URL
        }
      }
    }

    if (variants.length === 0) return null;
    variants.sort((a, b) => b.bw - a.bw);

    let loadedSub: { text: string; finalUrl: string } | null = null;
    for (const variant of variants) {
      const sub = await fetchUpstreamManifestText(variant.url, referer, forceAac);
      if (sub) {
        loadedSub = sub;
        break;
      }
    }
    if (!loadedSub) return null;
    current = loadedSub;
  }

  return current;
}

export function trimLiveDvrManifestForIptv(manifestText: string, maxSegments = 6): string {
  if (
    !manifestText ||
    manifestText.includes('#EXT-X-ENDLIST') ||
    manifestText.includes('#EXT-X-STREAM-INF')
  ) {
    return manifestText;
  }

  const lines = manifestText.split(/\r?\n/);
  const headerLines: string[] = [];
  const segments: Array<{ tags: string[]; uri: string }> = [];
  let inSegments = false;
  let pendingTags: string[] = [];

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    const isSegTag =
      trimmed.startsWith('#EXTINF:') ||
      trimmed.startsWith('#EXT-X-PROGRAM-DATE-TIME:') ||
      trimmed.startsWith('#EXT-X-DISCONTINUITY') ||
      trimmed.startsWith('#EXT-X-BYTERANGE:') ||
      trimmed.startsWith('#EXT-X-KEY:') ||
      trimmed.startsWith('#EXT-X-MAP:');

    if (!trimmed.startsWith('#')) {
      inSegments = true;
      segments.push({ tags: pendingTags, uri: rawLine });
      pendingTags = [];
      continue;
    }

    if (
      trimmed.startsWith('#EXT-X-DISCONTINUITY-SEQUENCE:') ||
      trimmed.startsWith('#EXT-X-MEDIA-SEQUENCE:') ||
      trimmed.startsWith('#EXT-X-TARGETDURATION:') ||
      trimmed.startsWith('#EXT-X-VERSION:') ||
      trimmed.startsWith('#EXT-X-ALLOW-CACHE:') ||
      trimmed === '#EXTM3U' ||
      trimmed.startsWith('#EXT-X-INDEPENDENT-SEGMENTS') ||
      trimmed.startsWith('#EXT-X-PLAYLIST-TYPE:')
    ) {
      headerLines.push(rawLine);
      continue;
    }

    if (inSegments || isSegTag) {
      if (trimmed.startsWith('#EXTINF:') || inSegments) {
        inSegments = true;
        pendingTags.push(rawLine);
      } else {
        headerLines.push(rawLine);
      }
    } else {
      headerLines.push(rawLine);
    }
  }

  if (segments.length <= maxSegments + 2) {
    return manifestText;
  }

  const keepCount = Math.max(3, maxSegments);
  const dropped = segments.slice(0, segments.length - keepCount);
  const kept = segments.slice(segments.length - keepCount);
  const droppedCount = dropped.length;

  let droppedDiscont = 0;
  let lastDroppedKey = '';
  let lastDroppedMap = '';
  for (const seg of dropped) {
    for (const t of seg.tags) {
      const tr = t.trim();
      if (tr === '#EXT-X-DISCONTINUITY') droppedDiscont++;
      if (tr.startsWith('#EXT-X-KEY:')) lastDroppedKey = tr;
      if (tr.startsWith('#EXT-X-MAP:')) lastDroppedMap = tr;
    }
  }

  let hasMediaSeq = false;
  const outHeader: string[] = [];
  for (const h of headerLines) {
    const tr = h.trim();
    if (tr.startsWith('#EXT-X-PLAYLIST-TYPE:EVENT')) {
      continue;
    }
    const seqMatch = tr.match(/^#EXT-X-MEDIA-SEQUENCE:(\d+)/i);
    if (seqMatch) {
      hasMediaSeq = true;
      outHeader.push(`#EXT-X-MEDIA-SEQUENCE:${parseInt(seqMatch[1], 10) + droppedCount}`);
      continue;
    }
    const discMatch = tr.match(/^#EXT-X-DISCONTINUITY-SEQUENCE:(\d+)/i);
    if (discMatch) {
      outHeader.push(`#EXT-X-DISCONTINUITY-SEQUENCE:${parseInt(discMatch[1], 10) + droppedDiscont}`);
      continue;
    }
    outHeader.push(h);
  }
  if (!hasMediaSeq) {
    outHeader.push(`#EXT-X-MEDIA-SEQUENCE:${droppedCount}`);
  }
  if (lastDroppedKey && !kept[0].tags.some((t) => t.trim().startsWith('#EXT-X-KEY:'))) {
    outHeader.push(lastDroppedKey);
  }
  if (lastDroppedMap && !kept[0].tags.some((t) => t.trim().startsWith('#EXT-X-MAP:'))) {
    outHeader.push(lastDroppedMap);
  }

  const outLines = [...outHeader];
  for (const seg of kept) {
    outLines.push(...seg.tags);
    outLines.push(seg.uri);
  }
  return outLines.join('\n') + '\n';
}

async function probeLiveEdgeSegmentOk(segUrl: string, referer: string): Promise<boolean> {
  const headers: Record<string, string> = {
    'User-Agent': getPreferredUpstreamUa(segUrl),
    Accept: '*/*',
    Range: 'bytes=0-16383',
  };
  if (referer) {
    headers['Referer'] = referer;
  }

  const tryCurlSegmentFallback = async (): Promise<boolean> => {
    const res = await curlGetBufferWithStatus(segUrl, headers, 4).catch(() => ({
      buf: Buffer.alloc(0),
      status: 0,
    }));
    if (res.status < 200 || res.status >= 400 || res.buf.length < 64) {
      return false;
    }
    const headText = res.buf.subarray(0, 64).toString('utf8').trimStart();
    return !/^(<!doctype|<html\b|<head\b|<body\b|<error\b)/i.test(headText);
  };

  if (shouldBypassNodeFetch(segUrl)) {
    return tryCurlSegmentFallback();
  }

  try {
    const resp = await streamingFetch(segUrl, {
      method: 'GET',
      headers,
      timeoutMs: 4000,
    });
    if (resp.status === 416) {
      // Some CDNs reject Range probes; re-check without Range and read only the first chunk
      const plainHeaders = { ...headers };
      delete plainHeaders['Range'];
      const fullResp = await streamingFetch(segUrl, {
        method: 'GET',
        headers: plainHeaders,
        timeoutMs: 4000,
      });
      if (!fullResp.ok) return tryCurlSegmentFallback();
      try {
        await fullResp.body?.cancel?.();
      } catch {
        // ignore
      }
      return true;
    }
    if (!resp.ok) {
      try {
        await resp.body?.cancel?.();
      } catch {
        // ignore
      }
      return tryCurlSegmentFallback();
    }
    const ct = (resp.headers.get('content-type') || '').toLowerCase();
    if (ct.includes('text/html')) {
      try {
        await resp.body?.cancel?.();
      } catch {
        // ignore
      }
      return false;
    }
    // Consume just the small chunk or cancel immediately to avoid buffering multi-MB TS files
    if (resp.body) {
      const reader = resp.body.getReader();
      try {
        const first = await reader.read();
        if (first.value && first.value.length > 0) {
          const headText = Buffer.from(first.value.subarray(0, 64)).toString('utf8').trimStart();
          if (/^(<!doctype|<html\b|<head\b|<body\b|<error\b)/i.test(headText)) {
            return false;
          }
        }
      } finally {
        reader.cancel().catch(() => {});
      }
    }
    return true;
  } catch {
    markHostNeedsCurlFallback(segUrl);
    return tryCurlSegmentFallback();
  }
}

export async function verifyIptvMediaManifestSegments(
  manifestText: string,
  manifestUrl: string,
  referer: string
): Promise<boolean> {
  if (/METHOD=(SAMPLE-AES|SAMPLE-AES-CTR|SAMPLE-AES-CENC)|com\.apple\.streamingkeydelivery/i.test(manifestText)) {
    return false;
  }
  const effectiveReferer = resolveKnownUpstreamReferer(manifestUrl, referer) || '';
  const lines = manifestText.split(/\r?\n/);

  if (manifestText.includes('#EXT-X-STREAM-INF')) {
    let firstVideoVariantUrl = '';
    let firstAudioUrl = '';
    let expectingVariant = false;
    for (const raw of lines) {
      const tr = raw.trim();
      if (!tr) continue;
      if (tr.startsWith('#EXT-X-MEDIA') && tr.includes('TYPE=AUDIO') && !firstAudioUrl) {
        const m = tr.match(/URI="([^"]+)"/i);
        if (m) {
          try {
            firstAudioUrl = new URL(m[1], manifestUrl).href;
          } catch {
            // ignore
          }
        }
      } else if (tr.startsWith('#EXT-X-STREAM-INF')) {
        expectingVariant = true;
      } else if (expectingVariant && !tr.startsWith('#')) {
        expectingVariant = false;
        if (!firstVideoVariantUrl) {
          try {
            firstVideoVariantUrl = new URL(tr, manifestUrl).href;
          } catch {
            // ignore
          }
        }
      }
    }
    if (!firstVideoVariantUrl) return false;
    const vSub = await fetchUpstreamManifestText(firstVideoVariantUrl, effectiveReferer, false);
    if (!vSub) return false;
    const vOk = await verifyIptvMediaManifestSegments(vSub.text, vSub.finalUrl, effectiveReferer);
    if (!vOk) return false;
    if (firstAudioUrl) {
      const aSub = await fetchUpstreamManifestText(firstAudioUrl, effectiveReferer, false);
      if (!aSub) return false;
      const aOk = await verifyIptvMediaManifestSegments(aSub.text, aSub.finalUrl, effectiveReferer);
      if (!aOk) return false;
    }
    return true;
  }

  let lastSegmentUrl = '';
  for (let i = lines.length - 1; i >= 0; i--) {
    const tr = lines[i].trim();
    if (!tr || tr.startsWith('#')) continue;
    try {
      lastSegmentUrl = new URL(tr, manifestUrl).href;
      break;
    } catch {
      // skip invalid URI
    }
  }
  if (!lastSegmentUrl) return false;
  return probeLiveEdgeSegmentOk(lastSegmentUrl, effectiveReferer);
}

export function rewriteManifestForSamsungIptv(
  manifestText: string,
  baseUrl: string,
  referer: string,
  forceAac: boolean,
  isPublicCorsCdn: boolean,
  publicOrigin: string
): string {
  const effectiveReferer = resolveKnownUpstreamReferer(baseUrl, referer) || new URL(baseUrl).origin + '/';
  const lines = manifestText.split(/\r?\n/);
  let nextLineIsVariantPlaylist = false;
  const outLines: string[] = [];

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith('##')) {
      continue;
    }

    // Strip external WebVTT subtitle tracks on Smart TV IPTV playlists (causes AVPlay / ffmpeg errors)
    if (trimmed.startsWith('#EXT-X-MEDIA') && /TYPE=SUBTITLES/i.test(trimmed)) {
      continue;
    }

    let line = rawLine;
    if (trimmed.startsWith('#EXT-X-STREAM-INF')) {
      line = line.replace(/,?SUBTITLES="[^"]*"/gi, '').replace(/,(\s*)$/, '$1');
      nextLineIsVariantPlaylist = true;
    }

    if (trimmed.startsWith('#')) {
      if (trimmed.includes('URI="')) {
        line = line.replace(/URI="([^"]+)"/g, (_match, uriVal) => {
          try {
            const absUri = new URL(uriVal, baseUrl).href;
            if (isPublicCorsCdn) {
              return `URI="${absUri}"`;
            }
            if (trimmed.startsWith('#EXT-X-MEDIA') || absUri.includes('.m3u8')) {
              return `URI="${buildHlsProxyUrl(absUri, effectiveReferer, forceAac, publicOrigin)}"`;
            }
            return `URI="${buildTsProxyUrl(absUri, effectiveReferer, forceAac, publicOrigin)}"`;
          } catch {
            return _match;
          }
        });
      }
      outLines.push(line);
      continue;
    }

    try {
      const absUrl = new URL(trimmed, baseUrl).href;
      const isPlaylist =
        nextLineIsVariantPlaylist ||
        /\.m3u8(\?|$)/i.test(absUrl) ||
        absUrl.includes('stream_tv=');
      nextLineIsVariantPlaylist = false;

      if (isPublicCorsCdn) {
        outLines.push(absUrl);
      } else {
        outLines.push(
          isPlaylist
            ? buildHlsProxyUrl(absUrl, effectiveReferer, forceAac, publicOrigin)
            : buildTsProxyUrl(absUrl, effectiveReferer, forceAac, publicOrigin)
        );
      }
    } catch {
      nextLineIsVariantPlaylist = false;
      outLines.push(line);
    }
  }

  return outLines.length > 0 ? outLines.join('\n') + '\n' : '';
}

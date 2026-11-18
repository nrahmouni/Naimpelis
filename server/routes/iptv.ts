/**
 * @module server/routes/iptv
 * @description TDT catalog API + Smart TV IPTV suite (.m3u playlists, live HLS resolver, PNG channel badges, and XMLTV /epg.xml).
 */
import zlib from 'zlib';
import type { Express, Request } from 'express';
import { resolveOfficialChannelLogoUrl } from '../../src/shared/channelLogos.ts';
import { LruTtlCache } from '../utils/lruCache.ts';
import {
  CHROME_UA,
  TDT_DVB_UA,
  buildHlsProxyUrl,
  buildTsProxyUrl,
  curlGetText,
  isDvbHeadendStream,
  markHostNeedsCurlFallback,
  maybeSignEasyBroadcastUrl,
  resolveKnownUpstreamReferer,
  shouldBypassNodeFetch,
  type TrackRecord,
} from '../extractors/httpHelpers.ts';
import { extractLiveSportsHlsDirect, sniffStreamWithHeadless, verifyM3u8HasCleanVideoFrame } from '../extractors/sportsExtractor.ts';
import { SPANISH_TDT_CHANNELS } from '../data/tdtChannels.ts';
import { CATALA_LIVE_CHANNELS } from '../data/catalaRegistry.ts';
import { INTERNATIONAL_TV_CHANNELS } from '../data/internationalChannels.ts';
import { FAST_THEMATIC_CHANNELS } from '../services/catalogDiscoveryService.ts';
import {
  applySyncedStreamsToChannels,
  getIptvSyncMeta,
  refreshLiveIptvRegistry,
} from '../services/iptvPlaylistService.ts';
import { channelHealthMonitor } from '../services/channelHealthMonitor.ts';
import { loadSpanishEpgSchedule } from '../services/epgService.ts';
import { getPermanent247SportsMatches } from './sports.ts';
import { KIDS_LIVE_CHANNELS } from './kids.ts';

const IPTV_GROUP_TITLES: Record<string, string> = {
  generalistas: 'TDT España Generalistas',
  movistar: 'Fútbol · Movistar+ & LaLiga',
  dazn: 'Fútbol & Motor · DAZN',
  uk_sports: 'Deportes UK · Sky Sports & Eurosport',
  china_football: 'Fútbol · Streaming Internacional',
  beinsports: 'Fútbol · beIN SPORTS HD',
  bein_arabic: 'Fútbol · beIN SPORTS (العربية)',
  marruecos: 'TV Marruecos (المغرب · SNRT & 2M)',
  documentales: 'Documentales y Ciencia (Nat Geo & Discovery)',
  usa_tv: 'TV Estados Unidos (FOX · NBC · CNN)',
  europa_tv: 'TV Europa (BBC · Euronews · DW · France 24)',
  noticias_intl: 'Noticias Internacionales (Al Jazeera · Al Arabiya)',
  espn: 'Fútbol & Deportes · ESPN 1-7',
  dsports: 'Fútbol & Deportes · DSports',
  tnt_space: 'Deportes · TNT Sports & Space',
  cine_series: 'Cine y Series 24/7',
  entretenimiento: 'Entretenimiento y Variedades',
  noticias_deportes: 'Noticias y Deporte en Directo',
  infantil_autonomicas: 'Infantil y Autonómicas (TV3 · SX3 · Autonómicas)',
  infantil_kids: 'Riffan Kids (Infantil y Dibujos 24/7)',
  fast_thematic: 'Canales Temáticos FAST 24/7',
  internacional: 'Canales Internacionales',
};

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

export function getLiveVoiceChannels() {
  const merged = applySyncedStreamsToChannels(SPANISH_TDT_CHANNELS);
  return channelHealthMonitor.prioritizeChannels(merged).map((ch) => ({
    ...ch,
    logoUrl: ch.logoUrl || resolveOfficialChannelLogoUrl(ch) || undefined,
  }));
}

function getAllIptvChannels(): any[] {
  const seen = new Set<string>();
  const combined: any[] = [];

  const mergedTdt = applySyncedStreamsToChannels(SPANISH_TDT_CHANNELS);
  for (const ch of mergedTdt) {
    if (!ch?.id || seen.has(ch.id)) continue;
    seen.add(ch.id);
    combined.push({
      ...ch,
      dial: ch.dial || combined.length + 1,
      category: ch.category || 'generalistas',
    });
  }

  for (const ch of CATALA_LIVE_CHANNELS) {
    if (!ch?.id || seen.has(ch.id)) continue;
    seen.add(ch.id);
    combined.push({
      ...ch,
      dial: ch.dial || combined.length + 1,
      category: ch.category || 'infantil_autonomicas',
    });
  }

  const sportsMuxes = getPermanent247SportsMatches();
  sportsMuxes.forEach((m, idx) => {
    const muxId = `live-sports-${m.id}`;
    if (!seen.has(muxId)) {
      seen.add(muxId);
      const isLaliga = m.id.includes('laliga');
      const isF1 = m.id.includes('f1');
      const isChampions = m.id.includes('champions');
      const category = isLaliga ? 'movistar' : isF1 ? 'dazn' : isChampions ? 'movistar' : 'noticias_deportes';
      combined.push({
        id: muxId,
        dial: 201 + idx,
        name: m.title.split(' · ')[0] || m.title,
        shortMark: isLaliga ? 'LIGA' : isF1 ? 'F1' : isChampions ? 'UCL' : 'SPRT',
        brandTone: isLaliga ? '#0EA5E9' : isF1 ? '#F59E0B' : '#E11D48',
        network: m.competition || 'Fútbol 24/7',
        category,
        quality: '1080p HD',
        description: `${m.title} · ${m.competition}`,
        channels: m.channels,
      });
    }

    (m.channels || []).forEach((tr, trIdx) => {
      const trId = `ch-sport-${tr.id || `${m.id}-${trIdx}`}`;
      if (!seen.has(trId) && tr.label && !tr.label.includes('Satélite')) {
        seen.add(trId);
        const cat = /movistar|m\+/i.test(tr.label)
          ? 'movistar'
          : /dazn/i.test(tr.label)
          ? 'dazn'
          : /espn/i.test(tr.label)
          ? 'espn'
          : /dsports/i.test(tr.label)
          ? 'dsports'
          : /tnt/i.test(tr.label)
          ? 'tnt_space'
          : 'noticias_deportes';
        combined.push({
          id: trId,
          dial: 210 + combined.filter((c) => c.dial >= 210 && c.dial < 300).length,
          name: `${tr.label} 24/7`,
          shortMark: tr.label.replace(/[^A-Za-z0-9]/g, '').slice(0, 4).toUpperCase() || 'SPRT',
          brandTone: '#9146FF',
          network: m.competition || 'Deportes en Directo',
          category: cat,
          quality: tr.quality || '1080p HD',
          description: `${tr.label} - Señal oficial en directo`,
          channels: [tr, ...m.channels.filter((other) => other.id !== tr.id)],
        });
      }
    });
  });

  for (const ch of INTERNATIONAL_TV_CHANNELS) {
    if (!ch?.id || seen.has(ch.id)) continue;
    seen.add(ch.id);
    combined.push({
      ...ch,
      dial: ch.dial || 300 + combined.filter((c) => c.dial >= 300 && c.dial < 500).length,
      category: ch.category || 'internacional',
    });
  }

  for (const f of FAST_THEMATIC_CHANNELS) {
    const fId = `fast-${f.id}`;
    if (!seen.has(fId) && !seen.has(f.id)) {
      seen.add(fId);
      const cat =
        f.category === 'news'
          ? 'noticias_deportes'
          : f.category === 'sports'
          ? 'noticias_deportes'
          : f.category === 'documentary'
          ? 'documentales'
          : 'cine_series';
      combined.push({
        id: fId,
        dial: 501 + combined.filter((c) => c.dial >= 500).length,
        name: f.name,
        shortMark: f.mark || f.name.slice(0, 4).toUpperCase(),
        brandTone: f.tone || '#9146FF',
        network: 'FAST TV 24/7',
        category: cat,
        quality: f.quality || '1080p HD',
        description: f.descriptionEs || f.name,
        channels: [
          {
            id: `${f.id}-direct`,
            label: `${f.name} HD`,
            lang: 'ES',
            quality: f.quality || '1080p',
            sourceUrl: f.streamUrl,
            resolverType: 'tdt_hls',
          },
        ],
      });
    }
  }

  for (const k of KIDS_LIVE_CHANNELS) {
    if (!seen.has(k.id)) {
      seen.add(k.id);
      combined.push({
        ...k,
        dial: k.dial || 150 + combined.filter((c) => c.dial >= 150 && c.dial < 170).length,
        category: 'infantil_kids',
      });
    }
  }

  return channelHealthMonitor.prioritizeChannels(combined);
}

function getIptvEpgId(channelId: string): string {
  return IPTV_EPG_ID_ALIASES[channelId] || channelId;
}

function escapeXmlText(val: string): string {
  return String(val || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatXmltvUtcTime(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(
    d.getUTCHours()
  )}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())} +0000`;
}

const iptvPngLogoCache = new LruTtlCache<string, Buffer>(120, 24 * 60 * 60 * 1000);
const PNG_CRC32_TABLE = (() => {
  const tbl = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    tbl[n] = c >>> 0;
  }
  return tbl;
})();

function pngCrc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = PNG_CRC32_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makePngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  const combined = Buffer.concat([typeBuf, data]);
  crcBuf.writeUInt32BE(pngCrc32(combined), 0);
  return Buffer.concat([len, combined, crcBuf]);
}

const MINI_FONT_3X5: Record<string, string[]> = {
  A: ['010', '101', '111', '101', '101'],
  B: ['110', '101', '110', '101', '110'],
  C: ['011', '100', '100', '100', '011'],
  D: ['110', '101', '101', '101', '110'],
  E: ['111', '100', '110', '100', '111'],
  F: ['111', '100', '110', '100', '100'],
  G: ['011', '100', '101', '101', '011'],
  H: ['101', '101', '111', '101', '101'],
  I: ['111', '010', '010', '010', '111'],
  J: ['001', '001', '001', '101', '010'],
  K: ['101', '101', '110', '101', '101'],
  L: ['100', '100', '100', '100', '111'],
  M: ['101', '111', '111', '101', '101'],
  N: ['101', '111', '111', '111', '101'],
  O: ['010', '101', '101', '101', '010'],
  P: ['110', '101', '110', '100', '100'],
  Q: ['010', '101', '101', '111', '011'],
  R: ['110', '101', '110', '101', '101'],
  S: ['011', '100', '010', '001', '110'],
  T: ['111', '010', '010', '010', '010'],
  U: ['101', '101', '101', '101', '111'],
  V: ['101', '101', '101', '101', '010'],
  W: ['101', '101', '111', '111', '101'],
  X: ['101', '101', '010', '101', '101'],
  Y: ['101', '101', '010', '010', '010'],
  Z: ['111', '001', '010', '100', '111'],
  '0': ['111', '101', '101', '101', '111'],
  '1': ['010', '110', '010', '010', '111'],
  '2': ['110', '001', '010', '100', '111'],
  '3': ['110', '001', '010', '001', '110'],
  '4': ['101', '101', '111', '001', '001'],
  '5': ['111', '100', '110', '001', '110'],
  '6': ['011', '100', '111', '101', '111'],
  '7': ['111', '001', '010', '010', '010'],
  '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '110'],
  '+': ['000', '010', '111', '010', '000'],
  '-': ['000', '000', '111', '000', '000'],
};

function renderIptvChannelPng(shortMark: string, hexColor: string): Buffer {
  const cleanMark = (shortMark || 'TV').toUpperCase().replace(/[^A-Z0-9+-]/g, '').slice(0, 4) || 'TV';
  const cacheKey = `${cleanMark}|${hexColor}`;
  const existing = iptvPngLogoCache.get(cacheKey);
  if (existing) return existing;

  const cleanHex = /^#[0-9a-fA-F]{6}$/.test(hexColor) ? hexColor.slice(1) : 'E11D48';
  const r = parseInt(cleanHex.slice(0, 2), 16);
  const g = parseInt(cleanHex.slice(2, 4), 16);
  const b = parseInt(cleanHex.slice(4, 6), 16);

  const w = 96;
  const h = 96;
  const raw = Buffer.alloc(h * (1 + w * 4));

  for (let y = 0; y < h; y++) {
    const rowOff = y * (1 + w * 4);
    raw[rowOff] = 0;
    for (let x = 0; x < w; x++) {
      const pxOff = rowOff + 1 + x * 4;
      const inInner = x >= 6 && x < w - 6 && y >= 6 && y < h - 6;
      if (!inInner) {
        raw[pxOff] = 10;
        raw[pxOff + 1] = 12;
        raw[pxOff + 2] = 18;
        raw[pxOff + 3] = 255;
      } else {
        const shade = Math.max(0.55, 1 - (y / h) * 0.38);
        raw[pxOff] = Math.round(r * shade);
        raw[pxOff + 1] = Math.round(g * shade);
        raw[pxOff + 2] = Math.round(b * shade);
        raw[pxOff + 3] = 255;
      }
    }
  }

  const scale = cleanMark.length <= 2 ? 5 : cleanMark.length === 3 ? 4 : 3;
  const glyphW = 3 * scale;
  const gap = scale;
  const totalW = cleanMark.length * glyphW + (cleanMark.length - 1) * gap;
  const totalH = 5 * scale;
  const startX = Math.floor((w - totalW) / 2);
  const startY = Math.floor((h - totalH) / 2);

  for (let ci = 0; ci < cleanMark.length; ci++) {
    const glyph = MINI_FONT_3X5[cleanMark[ci]] || MINI_FONT_3X5['T'];
    const gx0 = startX + ci * (glyphW + gap);
    for (let gy = 0; gy < 5; gy++) {
      for (let gx = 0; gx < 3; gx++) {
        if (glyph[gy][gx] !== '1') continue;
        for (let sy = 0; sy < scale; sy++) {
          for (let sx = 0; sx < scale; sx++) {
            const px = gx0 + gx * scale + sx;
            const py = startY + gy * scale + sy;
            if (px >= 0 && px < w && py >= 0 && py < h) {
              const pxOff = py * (1 + w * 4) + 1 + px * 4;
              raw[pxOff] = 255;
              raw[pxOff + 1] = 255;
              raw[pxOff + 2] = 255;
              raw[pxOff + 3] = 255;
            }
          }
        }
      }
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const compressed = zlib.deflateSync(raw);
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const png = Buffer.concat([
    sig,
    makePngChunk('IHDR', ihdr),
    makePngChunk('IDAT', compressed),
    makePngChunk('IEND', Buffer.alloc(0)),
  ]);
  iptvPngLogoCache.set(cacheKey, png);
  return png;
}

const iptvChannelResolveCache = new LruTtlCache<
  string,
  {
    rawM3u8Url: string;
    referer: string;
    forceAac: boolean;
    isPublicCorsCdn: boolean;
    ts: number;
  }
>(150, 20 * 60 * 1000);

async function fetchUpstreamManifestText(
  targetUrl: string,
  referer: string,
  forceAac: boolean
): Promise<{ text: string; finalUrl: string } | null> {
  const headers: Record<string, string> = {
    'User-Agent': isDvbHeadendStream(targetUrl) || forceAac ? TDT_DVB_UA : CHROME_UA,
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

  if (!shouldBypassNodeFetch(targetUrl)) {
    try {
      const resp = await fetch(targetUrl, {
        headers,
        signal: AbortSignal.timeout(3500),
      });
      if (resp.ok) {
        const text = await resp.text();
        if (text.includes('#EXTM3U')) {
          return { text, finalUrl: resp.url || targetUrl };
        }
      }
    } catch {
      markHostNeedsCurlFallback(targetUrl);
    }
  }

  const fb = await curlGetText(targetUrl, headers, 6).catch(() => ({
    text: '',
    effectiveUrl: targetUrl,
  }));
  if (fb.text && fb.text.includes('#EXTM3U')) {
    return { text: fb.text, finalUrl: fb.effectiveUrl || targetUrl };
  }
  return null;
}

async function unwrapMasterPlaylistForIptv(
  manifestObj: { text: string; finalUrl: string },
  referer: string,
  forceAac: boolean
): Promise<{ text: string; finalUrl: string }> {
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

    let bestUrl = '';
    let bestBw = -1;
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
          if (pendingBw >= bestBw) {
            bestBw = pendingBw;
            bestUrl = absVariant;
          }
        } catch {
          // ignore
        }
      }
    }

    if (!bestUrl) return current;
    const sub = await fetchUpstreamManifestText(bestUrl, referer, forceAac);
    if (!sub) return current;
    current = sub;
  }

  return current;
}

function rewriteManifestForSamsungIptv(
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

  return lines
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;

      if (trimmed.startsWith('#')) {
        if (trimmed.startsWith('#EXT-X-STREAM-INF')) {
          nextLineIsVariantPlaylist = true;
        }
        if (trimmed.includes('URI="')) {
          return line.replace(/URI="([^"]+)"/g, (_match, uriVal) => {
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
        return line;
      }

      try {
        const absUrl = new URL(trimmed, baseUrl).href;
        const isPlaylist =
          nextLineIsVariantPlaylist ||
          /\.m3u8(\?|$)/i.test(absUrl) ||
          absUrl.includes('stream_tv=');
        nextLineIsVariantPlaylist = false;

        if (isPublicCorsCdn) {
          return absUrl;
        }
        return isPlaylist
          ? buildHlsProxyUrl(absUrl, effectiveReferer, forceAac, publicOrigin)
          : buildTsProxyUrl(absUrl, effectiveReferer, forceAac, publicOrigin);
      } catch {
        nextLineIsVariantPlaylist = false;
        return line;
      }
    })
    .join('\n');
}

export function registerIptvAndTdtRoutes(
  app: Express,
  deps: { getPublicOrigin: (req: Request) => string }
): void {
  const { getPublicOrigin } = deps;

  app.get('/api/catalog/tdt', async (req, res) => {
    if (req.query.refresh === '1') {
      await refreshLiveIptvRegistry(true).catch(() => undefined);
    } else {
      void refreshLiveIptvRegistry(false).catch(() => undefined);
    }
    const merged = applySyncedStreamsToChannels(SPANISH_TDT_CHANNELS);
    res.json({
      success: true,
      iptvMeta: getIptvSyncMeta(),
      channels: channelHealthMonitor.prioritizeChannels(merged).map((ch) => ({
        ...ch,
        logoUrl: ch.logoUrl || resolveOfficialChannelLogoUrl(ch) || undefined,
      })),
    });
  });

  app.get(
    [
      '/naim-cine.m3u',
      '/naimcine.m3u',
      '/naimcine-smarttv.m3u',
      '/NAIM-CINE-Samsung-TV.m3u',
      '/NAIMCINE-Samsung-Tizen.m3u',
      '/riffantv.m3u',
      '/riffantv-smarttv.m3u',
      '/channels.m3u',
      '/playlist.m3u',
      '/iptv.m3u',
      '/naim-cine.m3u8',
      '/api/iptv/playlist.m3u',
    ],
    async (req, res) => {
      if (req.query.refresh === '1') {
        await refreshLiveIptvRegistry(true).catch(() => undefined);
      } else {
        await refreshLiveIptvRegistry(false).catch(() => undefined);
      }
      const publicOrigin = getPublicOrigin(req);
      const channels = getAllIptvChannels();
      const lines: string[] = [
        `#EXTM3U x-tvg-url="${publicOrigin}/epg.xml" url-tvg="${publicOrigin}/epg.xml"`,
      ];

      channels.forEach((ch, idx) => {
        const groupTitle = IPTV_GROUP_TITLES[ch.category] || 'TDT y Directo';
        const epgId = getIptvEpgId(ch.id);
        const chno = ch.dial ? String(ch.dial) : String(idx + 1);
        const officialLogo = ch.logoUrl || resolveOfficialChannelLogoUrl(ch);
        const logoUrl =
          officialLogo && /^https?:\/\//i.test(officialLogo)
            ? officialLogo
            : `${publicOrigin}/api/iptv/logo/${encodeURIComponent(ch.id)}.png`;
        const streamUrl = `${publicOrigin}/api/iptv/live/${encodeURIComponent(ch.id)}.m3u8`;
        const safeName = String(ch.name || ch.id).replace(/[\r\n,]+/g, ' ').trim();

        lines.push(
          `#EXTINF:-1 tvg-id="${epgId}" tvg-name="${safeName}" tvg-chno="${chno}" tvg-logo="${logoUrl}" group-title="${groupTitle}",${safeName}`
        );
        lines.push(streamUrl);
      });

      const playlistBody = lines.join('\n') + '\n';
      const forceDownload = req.query.download === '1';

      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', '*');
      res.setHeader('Content-Type', 'audio/x-mpegurl; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      if (forceDownload) {
        res.setHeader('Content-Disposition', 'attachment; filename="RIFFANTV-IPTV.m3u"');
      }
      res.send(playlistBody);
    }
  );

  app.get('/api/iptv/status', async (req, res) => {
    if (req.query.refresh === '1') {
      await refreshLiveIptvRegistry(true).catch(() => undefined);
    }
    const channels = getAllIptvChannels();
    res.json({
      ok: true,
      totalChannels: channels.length,
      ...getIptvSyncMeta(),
    });
  });

  app.get('/api/iptv/summary', async (req, res) => {
    if (req.query.refresh === '1') {
      await refreshLiveIptvRegistry(true).catch(() => undefined);
    }
    const publicOrigin = getPublicOrigin(req);
    const channels = getAllIptvChannels();
    const catMap: Record<string, { label: string; count: number; sampleChannels: string[] }> = {};

    channels.forEach((ch) => {
      const cat = ch.category || 'generalistas';
      const groupLabel = IPTV_GROUP_TITLES[cat] || 'TDT y Directo';
      if (!catMap[cat]) {
        catMap[cat] = { label: groupLabel, count: 0, sampleChannels: [] };
      }
      catMap[cat].count++;
      if (catMap[cat].sampleChannels.length < 5) {
        catMap[cat].sampleChannels.push(ch.name);
      }
    });

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=180');
    res.json({
      ok: true,
      totalChannels: channels.length,
      m3uUrl: `${publicOrigin}/riffantv.m3u`,
      epgUrl: `${publicOrigin}/epg.xml`,
      riffantvM3uUrl: `${publicOrigin}/riffantv.m3u`,
      riffantvEpgUrl: `${publicOrigin}/epg.xml`,
      tvUrl: `${publicOrigin}/tv`,
      kidsUrl: `${publicOrigin}/kids`,
      legacyM3uUrl: `${publicOrigin}/naim-cine.m3u`,
      categories: Object.entries(catMap).map(([id, info]) => ({
        id,
        label: info.label,
        count: info.count,
        sampleChannels: info.sampleChannels,
      })),
      channels: channels.map((c, idx) => ({
        id: c.id,
        dial: c.dial || idx + 1,
        name: c.name,
        category: c.category,
        groupTitle: IPTV_GROUP_TITLES[c.category] || 'TDT y Directo',
        quality: c.quality || '1080p HD',
        shortMark: c.shortMark || c.name.slice(0, 4).toUpperCase(),
        brandTone: c.brandTone || '#9146FF',
        logoUrl: c.logoUrl || `${publicOrigin}/api/iptv/logo/${encodeURIComponent(c.id)}.png`,
      })),
    });
  });

  app.get('/api/iptv/logo/:channelId', (req, res) => {
    const rawId = String(req.params.channelId || '').replace(/\.png$/i, '');
    const ch = getAllIptvChannels().find((c) => c.id === rawId);
    const png = renderIptvChannelPng(ch?.shortMark || rawId.slice(0, 3), ch?.brandTone || '#E11D48');

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Content-Length', String(png.length));
    res.end(png);
  });

  app.get('/api/iptv/live/:channelId', async (req, res) => {
    const rawId = String(req.params.channelId || '').replace(/\.m3u8$/i, '');
    const channel = getAllIptvChannels().find((c) => c.id === rawId);
    if (!channel) {
      return res.status(404).send('Channel not found');
    }

    const publicOrigin = getPublicOrigin(req);
    const forceAacOverride = req.query.aac === '1';
    const cached = iptvChannelResolveCache.get(channel.id);
    if (cached && Date.now() - cached.ts < 45_000) {
      const manifestObj = await fetchUpstreamManifestText(
        cached.rawM3u8Url,
        cached.referer,
        forceAacOverride || cached.forceAac
      );
      if (manifestObj) {
        const unwrapped = await unwrapMasterPlaylistForIptv(
          manifestObj,
          cached.referer,
          forceAacOverride || cached.forceAac
        );
        const rewritten = rewriteManifestForSamsungIptv(
          unwrapped.text,
          unwrapped.finalUrl,
          cached.referer,
          forceAacOverride || cached.forceAac,
          false,
          publicOrigin
        );
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', '*');
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        return res.send(rewritten);
      }
      iptvChannelResolveCache.delete(channel.id);
    }

    const tracks: TrackRecord[] = Array.isArray(channel.channels) ? channel.channels : [];
    for (const track of tracks) {
      try {
        const sourceUrl = String(track?.sourceUrl || '').trim();
        if (!sourceUrl) continue;

        const isDirectHls =
          track.resolverType === 'tdt_hls' ||
          track.resolverType === 'direct_hls' ||
          /\.m3u8(\?|$)/i.test(sourceUrl);

        if (isDirectHls) {
          const cleanUrl = await maybeSignEasyBroadcastUrl(
            sourceUrl.replace(/[?&]profile=(hd|fast)\b/gi, '')
          );
          const referer =
            resolveKnownUpstreamReferer(cleanUrl, track.referer) || new URL(cleanUrl).origin + '/';
          const forceAac = forceAacOverride;

          const manifestObj = await fetchUpstreamManifestText(cleanUrl, referer, forceAac);
          if (!manifestObj) continue;

          const unwrapped = await unwrapMasterPlaylistForIptv(manifestObj, referer, forceAac);

          iptvChannelResolveCache.set(channel.id, {
            rawM3u8Url: unwrapped.finalUrl,
            referer,
            forceAac,
            isPublicCorsCdn: false,
            ts: Date.now(),
          });

          const rewritten = rewriteManifestForSamsungIptv(
            unwrapped.text,
            unwrapped.finalUrl,
            referer,
            forceAac,
            false,
            publicOrigin
          );
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', '*');
          res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          return res.send(rewritten);
        }

        const fullTarget = /^https?:\/\//i.test(sourceUrl) ? sourceUrl : `https://${sourceUrl}`;
        let directSports = await extractLiveSportsHlsDirect(fullTarget);
        if (directSports?.isBrokenGreenFeed) continue;

        const isKnownDirectMirror = /footunder\.online|tilinhd\.|streamxhd\./i.test(fullTarget);
        if (!directSports && !isKnownDirectMirror) {
          directSports = await sniffStreamWithHeadless(fullTarget);
        }
        if (!directSports || !directSports.streamUrl || directSports.isDirectMp4) continue;

        const manifestObj = await fetchUpstreamManifestText(
          directSports.streamUrl,
          directSports.referer,
          false
        );
        if (!manifestObj) continue;

        const unwrapped = await unwrapMasterPlaylistForIptv(manifestObj, directSports.referer, false);

        const clean = await verifyM3u8HasCleanVideoFrame(
          unwrapped.text,
          unwrapped.finalUrl,
          directSports.referer
        );
        if (!clean) continue;

        iptvChannelResolveCache.set(channel.id, {
          rawM3u8Url: unwrapped.finalUrl,
          referer: directSports.referer,
          forceAac: forceAacOverride,
          isPublicCorsCdn: false,
          ts: Date.now(),
        });

        const rewritten = rewriteManifestForSamsungIptv(
          unwrapped.text,
          unwrapped.finalUrl,
          directSports.referer,
          forceAacOverride,
          false,
          publicOrigin
        );
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', '*');
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        return res.send(rewritten);
      } catch {
        // try next backup track
      }
    }

    return res.status(503).send('Canal temporalmente sin señal disponible');
  });

  app.get(['/epg.xml', '/riffantv-epg.xml', '/api/iptv/epg.xml'], async (req, res) => {
    try {
      const publicOrigin = getPublicOrigin(req);
      const store = await loadSpanishEpgSchedule();
      const channels = getAllIptvChannels();
      const xmlParts: string[] = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<tv generator-info-name="RIFFANTV IPTV EPG" generator-info-url="' +
          escapeXmlText(publicOrigin) +
          '">',
      ];

      const emittedChannelIds = new Set<string>();
      for (const ch of channels) {
        const epgId = getIptvEpgId(ch.id);
        if (emittedChannelIds.has(epgId)) continue;
        emittedChannelIds.add(epgId);
        const officialLogo = ch.logoUrl || resolveOfficialChannelLogoUrl(ch);
        const logoUrl =
          officialLogo && /^https?:\/\//i.test(officialLogo)
            ? officialLogo
            : `${publicOrigin}/api/iptv/logo/${encodeURIComponent(ch.id)}.png`;
        xmlParts.push(`  <channel id="${escapeXmlText(epgId)}">`);
        xmlParts.push(`    <display-name lang="es">${escapeXmlText(ch.name)}</display-name>`);
        xmlParts.push(`    <icon src="${escapeXmlText(logoUrl)}" />`);
        xmlParts.push('  </channel>');
      }

      const now = Date.now();
      for (const ch of channels) {
        const epgId = getIptvEpgId(ch.id);
        const events = store.get(epgId) || [];
        if (events.length > 0) {
          for (const ev of events) {
            xmlParts.push(
              `  <programme start="${formatXmltvUtcTime(ev.startMs)}" stop="${formatXmltvUtcTime(
                ev.stopMs
              )}" channel="${escapeXmlText(epgId)}">`
            );
            xmlParts.push(`    <title lang="es">${escapeXmlText(ev.title)}</title>`);
            if (ev.subtitle) {
              xmlParts.push(`    <sub-title lang="es">${escapeXmlText(ev.subtitle)}</sub-title>`);
            }
            if (ev.description) {
              xmlParts.push(`    <desc lang="es">${escapeXmlText(ev.description)}</desc>`);
            }
            if (ev.category) {
              xmlParts.push(`    <category lang="es">${escapeXmlText(ev.category)}</category>`);
            }
            xmlParts.push('  </programme>');
          }
        } else {
          const blockDuration = 4 * 60 * 60 * 1000;
          const currentBlockStart = Math.floor(now / blockDuration) * blockDuration;
          for (let b = 0; b < 6; b++) {
            const bStart = currentBlockStart + b * blockDuration;
            const bStop = bStart + blockDuration;
            const blockTitle = ch.category?.includes('futbol') || ch.category?.includes('movistar') || ch.category?.includes('dazn')
              ? `${ch.name} · Fútbol y Deportes en Directo HD`
              : ch.category === 'documentales'
              ? `${ch.name} · Documentales y Naturaleza HD`
              : ch.category === 'cine_series'
              ? `${ch.name} · Cine y Series en Emisión Continua`
              : `${ch.name} · Emisión en Directo HD`;

            xmlParts.push(
              `  <programme start="${formatXmltvUtcTime(bStart)}" stop="${formatXmltvUtcTime(bStop)}" channel="${escapeXmlText(epgId)}">`
            );
            xmlParts.push(`    <title lang="es">${escapeXmlText(blockTitle)}</title>`);
            xmlParts.push(`    <desc lang="es">${escapeXmlText(ch.description || `Transmisión oficial en directo de ${ch.name} sin cortes para Smart TV.`)}</desc>`);
            xmlParts.push(`    <category lang="es">${escapeXmlText(IPTV_GROUP_TITLES[ch.category] || 'Directo')}</category>`);
            xmlParts.push('  </programme>');
          }
        }
      }

      xmlParts.push('</tv>');
      const forceDownload = req.query.download === '1';
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=300');
      if (forceDownload) {
        res.setHeader('Content-Disposition', 'attachment; filename="RIFFANTV-EPG.xml"');
      }
      res.send(xmlParts.join('\n'));
    } catch (err) {
      console.warn('/epg.xml error:', err);
      res.status(500).type('application/xml').send('<tv></tv>');
    }
  });
}

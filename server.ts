import dns from 'dns';
import crypto from 'crypto';
import fs from 'fs';
import http2 from 'http2';
import zlib from 'zlib';
import { execFile, spawn } from 'child_process';
import express from 'express';
import { createServer } from 'http';
import { Readable } from 'stream';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer, { type Browser, type Page } from 'puppeteer';
import ffmpegStatic from 'ffmpeg-static';

// Prefer IPv4 to avoid transient container IPv6 socket resets with upstream CDNs
dns.setDefaultResultOrder('ipv4first');
// Allow upstream streaming CDNs with incomplete intermediate certificate chains
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FFMPEG_BIN: string = fs.existsSync('/usr/bin/ffmpeg')
  ? '/usr/bin/ffmpeg'
  : typeof ffmpegStatic === 'string' && fs.existsSync(ffmpegStatic)
    ? ffmpegStatic
    : 'ffmpeg';

const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const TMDB_API_KEY = '90b2cae8d7161e8ba0f3836240d7d352';

const AD_DOMAIN_PATTERNS = [
  'doubleclick',
  'googlesyndication',
  'googleads',
  'adsterra',
  'popads',
  'popunder',
  'exoclick',
  'propeller',
  'onclickmega',
  'clickadu',
  'adcash',
  'hilltopads',
  'profitablecpmrate',
  'capitalhospitals',
  'llvpn',
  'xadsmart',
  'laguneelemong',
  'mbuqxdxsra',
  'acscdn',
  'chaldeedaws',
  'sewinramjets',
  'directdexchange',
  'bet365',
  '1xbet',
  'trafficjunky',
  'adnxs',
];

function isBlockedAdUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return AD_DOMAIN_PATTERNS.some((domain) => lower.includes(domain));
}

// ============================================================================
// WARM SINGLETON HEADLESS CHROMIUM ENGINE (FOR SPORTS SNIFFING & CLOUD BROWSER)
// ============================================================================
let sharedBrowserPromise: Promise<Browser> | null = null;

async function getSharedBrowser(): Promise<Browser> {
  if (sharedBrowserPromise) {
    try {
      const browser = await sharedBrowserPromise;
      if (browser.connected) return browser;
    } catch {
      sharedBrowserPromise = null;
    }
  }

  sharedBrowserPromise = puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--ignore-certificate-errors',
      '--autoplay-policy=no-user-gesture-required',
      '--disable-popup-blocking=false',
      '--mute-audio',
    ],
  });

  const browser = await sharedBrowserPromise;
  browser.on('disconnected', () => {
    sharedBrowserPromise = null;
  });
  return browser;
}

// ============================================================================
// STREAM EXTRACTION TYPES & CACHE
// ============================================================================
const TDT_DVB_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36';

function isDvbHeadendStream(urlStr: string): boolean {
  return urlStr.includes('90.163.85.113:8093');
}

interface TrackRecord {
  id: string;
  label: string;
  lang: string;
  quality?: string;
  sourceUrl: string;
  resolverType:
    | 'movidy_embed'
    | 'vidhide_hls'
    | 'embed_sniff'
    | 'bingetrix_en'
    | 'sports_channel'
    | 'tdt_hls'
    | 'direct_hls'
    | 'direct_mp4'
    | 'youtube'
    | 'web_embed'
    | 'cloud_browser';
  resolvedStreamUrl?: string;
}

interface ExtractedStreamResult {
  success: boolean;
  mode: 'hls' | 'direct' | 'youtube' | 'embed' | 'cloud';
  streamUrl: string;
  rawStreamUrl?: string;
  referer?: string;
  youtubeId?: string;
  title?: string;
  tracks?: TrackRecord[];
  requestedLang?: string;
  resolvedLang?: string;
  resolvedLabel?: string;
  languageFallbackUsed?: boolean;
  availableLanguages?: string[];
  expiresAt: number;
}

const extractionCache = new Map<string, ExtractedStreamResult>();

function buildHlsProxyUrl(rawM3u8Url: string, referer: string, transcodeAudio = false): string {
  const needsAac = transcodeAudio || isDvbHeadendStream(rawM3u8Url);
  return `/api/hls-proxy/stream.m3u8?url=${encodeURIComponent(rawM3u8Url)}&referer=${encodeURIComponent(referer)}${needsAac ? '&aac=1' : ''}`;
}

function buildTsProxyUrl(rawMediaUrl: string, referer: string, transcodeAudio = false): string {
  const isMp4Segment =
    /\.(m4s|mp4|cmfv|cmfa)(\?|$)/i.test(rawMediaUrl) ||
    /\/segs\/[^/]+\/init\./i.test(rawMediaUrl);
  const ext = isMp4Segment ? 'segment.m4s' : 'segment.ts';
  const needsAac = !isMp4Segment && (transcodeAudio || isDvbHeadendStream(rawMediaUrl));
  return `/api/ts-proxy/${ext}?url=${encodeURIComponent(rawMediaUrl)}&referer=${encodeURIComponent(referer)}${needsAac ? '&aac=1' : ''}`;
}

// ============================================================================
// SUBSYSTEM 1A: EMBED69 + VIDHIDE SPANISH/LATINO/VOSE DECOMPILER (<500ms)
// ============================================================================
function unpackDeanEdwards(html: string): string | null {
  const m = html.match(
    /eval\(function\(p,a,c,k,e,d\)\{[\s\S]+?\}\(\s*'([\s\S]*?)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'([^']*)'\.split\('\|'\)/
  );
  if (!m) return null;

  let [, payload, radixStr, countStr, dictStr] = m;
  const radix = parseInt(radixStr, 10);
  let count = parseInt(countStr, 10);
  const dict = dictStr.split('|');

  const toBase = (num: number, base: number): string => {
    const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    return num < base ? chars[num] : toBase(Math.floor(num / base), base) + chars[num % base];
  };

  while (count--) {
    if (dict[count]) {
      const token = toBase(count, radix);
      payload = payload.replace(new RegExp(`\\b${token}\\b`, 'g'), dict[count]);
    }
  }
  return payload;
}

async function unpackVidhideToHls(embedUrl: string): Promise<{ rawM3u8: string; proxyUrl: string } | null> {
  try {
    // 1. Fast Vidaraa / Vidara JSON Stream Unpacker (`vidaraa.cc`, `vidara.to`, `vidara.so` -> 1080p HLS in ~200ms)
    if (/vidaraa?\.[a-z]+/i.test(embedUrl)) {
      const u = new URL(embedUrl);
      const segments = u.pathname.split('/').filter(Boolean);
      const filecode = segments[segments.length - 1] || '';
      if (filecode) {
        const apiRes = await fetch(`${u.origin}/api/stream`, {
          method: 'POST',
          headers: {
            'User-Agent': CHROME_UA,
            'Content-Type': 'application/json',
            Accept: 'application/json, text/plain, */*',
            Origin: u.origin,
            Referer: embedUrl,
          },
          body: JSON.stringify({ filecode, device: 'web', codecs: [] }),
          signal: AbortSignal.timeout(4800),
        });
        if (apiRes.ok) {
          const apiJson: any = await apiRes.json();
          const rawM3u8 = String(apiJson?.streaming_url || apiJson?.file || '').trim();
          if (rawM3u8 && /^https?:\/\//i.test(rawM3u8)) {
            return {
              rawM3u8,
              proxyUrl: buildHlsProxyUrl(rawM3u8, `${u.origin}/`),
            };
          }
        }
      }
    }

    // 2. Standard Vidhide / Smoothpre / Earnvids / Streamwish Dean Edwards Unpacker
    const refererOrigin = embedUrl.includes('gnulahd')
      ? 'https://ww3.gnulahd.nu/'
      : 'https://embed69.org/';
    const res = await fetch(embedUrl, {
      headers: {
        'User-Agent': CHROME_UA,
        Referer: refererOrigin,
      },
      signal: AbortSignal.timeout(5500),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const unpacked = unpackDeanEdwards(html);
    if (!unpacked) return null;

    const linksMatch = unpacked.match(/var\s+links\s*=\s*(\{[^}]+\})/);
    if (!linksMatch) return null;

    const links = JSON.parse(linksMatch[1]);
    const origin = new URL(embedUrl).origin;
    const rawCandidate = links.hls2 || links.hls4 || links.hls3 || '';
    if (!rawCandidate) return null;

    const rawM3u8 = rawCandidate.startsWith('/') ? `${origin}${rawCandidate}` : rawCandidate;
    return {
      rawM3u8,
      proxyUrl: buildHlsProxyUrl(rawM3u8, `${origin}/`),
    };
  } catch (err) {
    console.warn('unpackVidhideToHls error:', err);
    return null;
  }
}

async function resolveImdbId(tmdbId: string | number, mediaType: 'movie' | 'tv'): Promise<string | null> {
  try {
    const cleanId = String(tmdbId).replace(/\D/g, '');
    if (!cleanId) return null;
    const url =
      mediaType === 'tv'
        ? `https://api.themoviedb.org/3/tv/${cleanId}/external_ids?api_key=${TMDB_API_KEY}`
        : `https://api.themoviedb.org/3/movie/${cleanId}?api_key=${TMDB_API_KEY}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(3500) });
    if (!res.ok) return null;
    const json: any = await res.json();
    return json?.imdb_id || null;
  } catch {
    return null;
  }
}

let cachedEmbed69AnubisCookie: { cookie: string; expiresAt: number } | null = null;

async function fetchEmbed69HtmlWithMirrorAndAnubis(imdbSuffix: string): Promise<string> {
  // 1. Primary ultra-fast mirror (`serieskao.top/vidurl/...`) serves identical Embed69/Moe player HTML without Anubis PoW
  try {
    const mirrorUrl = `https://serieskao.top/vidurl/${imdbSuffix}/`;
    const mRes = await fetch(mirrorUrl, {
      headers: {
        'User-Agent': CHROME_UA,
        Referer: 'https://serieskao.top/',
      },
      signal: AbortSignal.timeout(4500),
    });
    if (mRes.ok) {
      const mHtml = await mRes.text();
      if (mHtml.includes('dataLink') || mHtml.includes('OptionsLangDisp')) {
        return mHtml;
      }
    }
  } catch {
    // fallback to embed69.org direct
  }

  // 2. Direct `embed69.org/f/...` with automatic Anubis v1.28.2 PoW challenge solver & 6h cookie cache
  const targetPath = `/f/${imdbSuffix}/`;
  const embed69Url = `https://embed69.org${targetPath}`;
  const reqHeaders: Record<string, string> = {
    'User-Agent': CHROME_UA,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  };
  if (cachedEmbed69AnubisCookie && cachedEmbed69AnubisCookie.expiresAt > Date.now()) {
    reqHeaders.Cookie = cachedEmbed69AnubisCookie.cookie;
  }

  const res = await fetch(embed69Url, {
    headers: reqHeaders,
    signal: AbortSignal.timeout(5500),
  });
  const html = await res.text();
  if (html.includes('dataLink') || html.includes('OptionsLangDisp')) {
    return html;
  }

  const anubisMatch = html.match(
    /<script[^>]*id="anubis_challenge"[^>]*>([\s\S]*?)<\/script>/i
  );
  if (!anubisMatch) return html;

  try {
    const parsed = JSON.parse(anubisMatch[1].trim());
    const randomData = String(parsed?.challenge?.randomData || '');
    const challengeId = String(parsed?.challenge?.id || '');
    const difficulty = Math.min(6, Number(parsed?.rules?.difficulty || 4));
    if (!randomData || !challengeId) return '';

    const prefix = '0'.repeat(difficulty);
    let nonce = 0;
    let responseHash = '';
    const maxIters = 1500000;
    while (nonce < maxIters) {
      const hex = crypto
        .createHash('sha256')
        .update(randomData + nonce)
        .digest('hex');
      if (hex.startsWith(prefix)) {
        responseHash = hex;
        break;
      }
      nonce++;
    }
    if (!responseHash) return '';

    const passUrl = `https://embed69.org/.within.website/x/cmd/anubis/api/pass-challenge?id=${encodeURIComponent(
      challengeId
    )}&response=${encodeURIComponent(responseHash)}&nonce=${nonce}&redir=${encodeURIComponent(
      targetPath
    )}&elapsedTime=15`;

    const passRes = await fetch(passUrl, {
      headers: {
        'User-Agent': CHROME_UA,
        Referer: embed69Url,
      },
      redirect: 'manual',
      signal: AbortSignal.timeout(4500),
    });

    const rawSetCookies: string[] =
      typeof (passRes.headers as any).getSetCookie === 'function'
        ? (passRes.headers as any).getSetCookie()
        : [passRes.headers.get('set-cookie') || ''].filter(Boolean);

    const cookiePair = rawSetCookies
      .map((c) => c.split(';')[0]?.trim())
      .filter((c) => c && c.includes('='))
      .join('; ');

    if (!cookiePair) return '';

    cachedEmbed69AnubisCookie = {
      cookie: cookiePair,
      expiresAt: Date.now() + 6 * 60 * 60 * 1000,
    };

    const retryRes = await fetch(embed69Url, {
      headers: {
        'User-Agent': CHROME_UA,
        Cookie: cookiePair,
      },
      signal: AbortSignal.timeout(5000),
    });
    return retryRes.ok ? await retryRes.text() : '';
  } catch {
    return '';
  }
}

function parseEmbed69OrMoeTracks(html: string, tagId: string): TrackRecord[] {
  if (!html) return [];
  const tracks: TrackRecord[] = [];
  const langPriority: Record<string, number> = { ESP: 1, LAT: 2, SUB: 3, VOSE: 3 };

  // FORMAT A & B: Encrypted `let dataLink = [...]` (New LINK_CHALLENGE + LINK_SALT OR Legacy POW_CHALLENGE)
  const dataLinkMatch = html.match(/let\s+dataLink\s*=\s*(\[[\s\S]*?\]);/);
  if (dataLinkMatch) {
    try {
      const dataLink: any[] = JSON.parse(dataLinkMatch[1]);
      if (Array.isArray(dataLink) && dataLink.length > 0) {
        let aesKey: Buffer | null = null;

        const linkChallengeMatch = html.match(/LINK_CHALLENGE\s*=\s*["']([^"']+)["']/);
        const linkSaltMatch = html.match(/LINK_SALT\s*=\s*["']([^"']+)["']/);

        if (linkChallengeMatch && linkSaltMatch) {
          aesKey = crypto
            .createHash('sha256')
            .update(linkChallengeMatch[1] + linkSaltMatch[1])
            .digest();
        } else {
          const challengeMatch = html.match(/POW_CHALLENGE\s*=\s*["']([^"']+)["']/);
          const diffMatch = html.match(/POW_DIFFICULTY\s*=\s*(\d+)/);
          const saltMatch = html.match(/POW_SALT\s*=\s*["']([^"']+)["']/);
          if (challengeMatch && diffMatch && saltMatch) {
            const challenge = challengeMatch[1];
            const difficulty = Math.min(5, parseInt(diffMatch[1], 10) || 3);
            const salt = saltMatch[1];
            const prefix = '0'.repeat(difficulty);
            let nonce = 0;
            while (nonce < 500000) {
              const hex = crypto
                .createHash('sha256')
                .update(challenge + nonce)
                .digest('hex');
              if (hex.startsWith(prefix)) break;
              nonce++;
            }
            aesKey = crypto
              .createHash('sha256')
              .update(challenge + nonce + salt)
              .digest();
          }
        }

        if (aesKey) {
          const keyBuf = aesKey;
          const decryptEmbedLink = (b64: string): string | null => {
            try {
              const raw = Buffer.from(b64, 'base64');
              if (raw.length <= 16) return null;
              const decipher = crypto.createDecipheriv(
                'aes-256-cbc',
                keyBuf,
                raw.subarray(0, 16)
              );
              return Buffer.concat([
                decipher.update(raw.subarray(16)),
                decipher.final(),
              ]).toString('utf8');
            } catch {
              return null;
            }
          };

          const sortedGroups = [...dataLink].sort(
            (a, b) =>
              (langPriority[String(a.video_language || '').toUpperCase()] || 9) -
              (langPriority[String(b.video_language || '').toUpperCase()] || 9)
          );

          for (const grp of sortedGroups) {
            const rawLang = String(grp.video_language || 'LAT').toUpperCase();
            const embeds: any[] = Array.isArray(grp.sortedEmbeds) ? grp.sortedEmbeds : [];

            const vidhideEntry = embeds.find(
              (e) =>
                String(e?.servername || '').toLowerCase() === 'vidhide' ||
                String(e?.servername || '').toLowerCase() === 'filelions'
            );

            let chosenUrl: string | null = null;
            let chosenResolver: 'vidhide_hls' | 'embed_sniff' = 'vidhide_hls';

            if (vidhideEntry?.link) {
              const dec = decryptEmbedLink(vidhideEntry.link);
              if (dec && dec.startsWith('http')) {
                chosenUrl = dec;
                chosenResolver = 'vidhide_hls';
              }
            }

            if (!chosenUrl) {
              for (const fbEmbed of embeds) {
                const srv = String(fbEmbed?.servername || '').toLowerCase();
                if (!fbEmbed?.link || srv === 'download') continue;
                const dec = decryptEmbedLink(fbEmbed.link);
                if (dec && dec.startsWith('http')) {
                  chosenUrl = dec;
                  chosenResolver =
                    /morencius|vidhide|smoothpre|earnvids/i.test(dec)
                      ? 'vidhide_hls'
                      : 'embed_sniff';
                  break;
                }
              }
            }

            if (!chosenUrl) continue;

            const label =
              rawLang === 'ESP'
                ? 'Castellano HD'
                : rawLang === 'LAT'
                ? 'Español Latino HD'
                : rawLang === 'SUB' || rawLang === 'VOSE'
                ? 'Subtitulado VOSE'
                : `${rawLang} HD`;

            const langCode =
              rawLang === 'ESP' ? 'ES' : rawLang === 'LAT' ? 'LAT' : 'VOSE';

            tracks.push({
              id: `embed69-${tagId}-${rawLang.toLowerCase()}`,
              label,
              lang: langCode,
              quality: 'HD HLS',
              sourceUrl: chosenUrl,
              resolverType: chosenResolver,
            });
          }
        }
      }
    } catch {
      // continue to Format C check
    }
  }

  if (tracks.length > 0) return tracks;

  // FORMAT C: Moe / SelectLangDisp + OptionsLangDisp (`ODDIV` plain `data-url` used on Castellano series like Berlín, Reina Roja)
  const langIdMap = new Map<string, string>();
  const selectBlock =
    html.match(/<ul[^>]*class="[^"]*SelectLangDisp[^"]*"[^>]*>([\s\S]*?)<\/ul>/i)?.[1] ||
    html;
  const langLiRe =
    /<li[^>]*data-lang="(\d+)"[^>]*>[\s\S]*?\/lang\/([A-Z]+)\.png/gi;
  let lm: RegExpExecArray | null;
  while ((lm = langLiRe.exec(selectBlock)) !== null) {
    langIdMap.set(lm[1], lm[2].toUpperCase());
  }

  const byRawLang = new Map<
    string,
    { url: string; resolverType: 'vidhide_hls' | 'embed_sniff'; priority: number }
  >();

  const optRe = /<li[^>]*data-url="([^"]+)"[^>]*data-lang="(\d+)"[^>]*>([\s\S]*?)<\/li>/gi;
  let om: RegExpExecArray | null;
  while ((om = optRe.exec(html)) !== null) {
    const rawUrl = String(om[1] || '').trim();
    const langNum = String(om[2] || '');
    const innerTxt = String(om[3] || '').toLowerCase();
    if (!rawUrl.startsWith('http')) continue;
    if (/1fichier|uptobox|mega\.nz|mediafire/i.test(rawUrl)) continue;

    const rawLang =
      langIdMap.get(langNum) ||
      (langNum === '1' ? 'ESP' : langNum === '0' ? 'LAT' : 'SUB');

    const isVidhide =
      /morencius|vidhide|smoothpre|earnvids/i.test(rawUrl) ||
      innerTxt.includes('vidhide');
    const candPriority = isVidhide
      ? 1
      : /voe|streamwish|wishembed|filelions/i.test(rawUrl) ||
        innerTxt.includes('voe') ||
        innerTxt.includes('streamwish')
      ? 2
      : 3;

    const prev = byRawLang.get(rawLang);
    if (!prev || candPriority < prev.priority) {
      byRawLang.set(rawLang, {
        url: rawUrl,
        resolverType: isVidhide ? 'vidhide_hls' : 'embed_sniff',
        priority: candPriority,
      });
    }
  }

  const sortedMoeLangs = Array.from(byRawLang.entries()).sort(
    (a, b) => (langPriority[a[0]] || 9) - (langPriority[b[0]] || 9)
  );

  for (const [rawLang, info] of sortedMoeLangs) {
    const label =
      rawLang === 'ESP'
        ? 'Castellano HD'
        : rawLang === 'LAT'
        ? 'Español Latino HD'
        : 'Subtitulado VOSE';
    const langCode = rawLang === 'ESP' ? 'ES' : rawLang === 'LAT' ? 'LAT' : 'VOSE';

    tracks.push({
      id: `moe-${tagId}-${rawLang.toLowerCase()}`,
      label,
      lang: langCode,
      quality: 'HD HLS',
      sourceUrl: info.url,
      resolverType: info.resolverType,
    });
  }

  return tracks;
}

const seriesKaoSlugCache = new Map<string, string | null>();

async function resolveSeriesKaoVidurlTracks(opts: {
  titleHints: string[];
  mediaType: 'movie' | 'tv';
  season?: number;
  episode?: number;
  yearHint?: string;
  imdbId?: string | null;
}): Promise<TrackRecord[]> {
  try {
    const uniqueHints = Array.from(
      new Set(
        opts.titleHints
          .map((t) => String(t || '').replace(/\s*\([^)]*\)/g, '').trim())
          .filter((t) => normalizeTitleForMatch(t).length >= 2)
      )
    );
    if (uniqueHints.length === 0) return [];

    const expectedSegment = opts.mediaType === 'tv' ? '/serie/' : '/pelicula/';
    const expectedYearNum =
      opts.yearHint && /^\d{4}$/.test(opts.yearHint.trim()) ? Number(opts.yearHint.trim()) : 0;
    const cacheKey = `${opts.mediaType}|${expectedYearNum || ''}|${normalizeTitleForMatch(
      uniqueHints[0]
    )}`;
    let matchedShowUrl = seriesKaoSlugCache.get(cacheKey) || null;

    if (!seriesKaoSlugCache.has(cacheKey)) {
      const normTargets = uniqueHints
        .map((h) => normalizeTitleForMatch(h))
        .filter((nt) => nt.length >= 2);

      for (const hint of uniqueHints.slice(0, 2)) {
        try {
          const sRes = await fetch(
            `https://serieskao.top/search?s=${encodeURIComponent(hint)}`,
            {
              headers: {
                'User-Agent': CHROME_UA,
                Referer: 'https://serieskao.top/',
              },
              signal: AbortSignal.timeout(4000),
            }
          );
          if (!sRes.ok) continue;
          const sHtml = await sRes.text();

          const cardRe =
            /<a[^>]+href="((?:https?:\/\/serieskao\.top)?\/(?:serie|pelicula)\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
          let bestUrl: string | null = null;
          let bestScore = 0;
          let cm: RegExpExecArray | null;

          while ((cm = cardRe.exec(sHtml)) !== null) {
            const href = String(cm[1] || '').trim();
            const cardInner = String(cm[2] || '');
            if (!href.includes(expectedSegment)) continue;

            const h2Match = cardInner.match(/<h2[^>]*>([^<]+)<\/h2>/i);
            const cardTitle = String(h2Match?.[1] || '').trim();
            if (!cardTitle) continue;

            const cardYearMatch = cardInner.match(/\b(19\d{2}|20\d{2})\b/);
            const cardYearNum = cardYearMatch?.[1] ? Number(cardYearMatch[1]) : 0;
            if (expectedYearNum && cardYearNum && Math.abs(cardYearNum - expectedYearNum) > 1) {
              continue;
            }

            const fullHref = href.startsWith('http')
              ? href.replace(/\/+$/, '')
              : `https://serieskao.top${href.replace(/\/+$/, '')}`;
            const normCard = normalizeTitleForMatch(cardTitle);
            const normCardOutside = normalizeTitleForMatch(
              cardTitle.replace(/\s*\([^)]*\)/g, '')
            );
            if (!normCard || normCard.length < 2) continue;

            let score = 0;
            for (const nt of normTargets) {
              if (normCard === nt || (normCardOutside && normCardOutside === nt)) {
                score = Math.max(score, expectedYearNum && cardYearNum === expectedYearNum ? 105 : 100);
              }
            }

            if (score > bestScore) {
              bestScore = score;
              bestUrl = fullHref;
              if (score >= 105) break;
            }
          }

          if (bestUrl && bestScore >= 100) {
            matchedShowUrl = bestUrl;
            break;
          }
        } catch {
          // continue next hint
        }
      }

      seriesKaoSlugCache.set(cacheKey, matchedShowUrl);
    }

    if (!matchedShowUrl) return [];

    const pageUrl =
      opts.mediaType === 'tv'
        ? `${matchedShowUrl}/temporada/${opts.season || 1}/capitulo/${opts.episode || 1}`
        : matchedShowUrl;

    const pRes = await fetch(pageUrl, {
      headers: {
        'User-Agent': CHROME_UA,
        Referer: 'https://serieskao.top/',
      },
      signal: AbortSignal.timeout(4200),
    });
    if (!pRes.ok) return [];
    const pHtml = await pRes.text();

    if (opts.imdbId) {
      const pageImdbMatch = pHtml.match(/\b(tt\d{6,10})\b/i);
      if (pageImdbMatch?.[1] && pageImdbMatch[1].toLowerCase() !== opts.imdbId.toLowerCase()) {
        return [];
      }
    }

    const vidurlMatch = pHtml.match(
      /data-url="((?:https?:\/\/serieskao\.top)?\/vidurl\/[^"]+)"/i
    );
    if (!vidurlMatch) return [];

    const rawVidurl = vidurlMatch[1];
    const fullVidurl = rawVidurl.startsWith('http')
      ? rawVidurl
      : `https://serieskao.top${rawVidurl}`;

    const vRes = await fetch(fullVidurl, {
      headers: {
        'User-Agent': CHROME_UA,
        Referer: pageUrl,
      },
      signal: AbortSignal.timeout(4500),
    });
    if (!vRes.ok) return [];
    const vHtml = await vRes.text();
    const slugTag =
      fullVidurl
        .split('/vidurl/')[1]
        ?.replace(/\//g, '')
        .replace(/[^a-zA-Z0-9_-]/g, '') || 'skao';

    return parseEmbed69OrMoeTracks(vHtml, slugTag);
  } catch {
    return [];
  }
}

const animeAv1SlugCache = new Map<string, { slug: string | null; ts: number }>();

async function extractAnimeAv1Tracks(opts: {
  titleHints: string[];
  mediaType: 'movie' | 'tv';
  season?: number;
  episode?: number;
}): Promise<TrackRecord[]> {
  try {
    const rawHints = Array.from(
      new Set(
        opts.titleHints
          .flatMap((raw) => {
            const clean = String(raw || '').replace(/\s*\([^)]*\)/g, '').trim();
            const beforeColon = clean.includes(':') ? clean.split(':')[0].trim() : '';
            const afterColon = clean.includes(':') ? clean.split(':').slice(1).join(' ').trim() : '';
            return [clean, beforeColon, afterColon];
          })
          .filter((s) => s.length >= 2 && !/[\u3040-\u30ff\u4e00-\u9faf]/.test(s))
      )
    );
    if (rawHints.length === 0) return [];

    const seasonNum = opts.mediaType === 'tv' ? Math.max(1, opts.season || 1) : 1;
    const epNum = opts.mediaType === 'tv' ? Math.max(1, opts.episode || 1) : 1;
    const slugCacheKey = `${opts.mediaType}|s${seasonNum}|${normalizeTitleForMatch(rawHints[0])}`;

    let matchedSlug: string | null = null;
    const cachedSlug = animeAv1SlugCache.get(slugCacheKey);
    if (cachedSlug && Date.now() - cachedSlug.ts < 30 * 60 * 1000) {
      matchedSlug = cachedSlug.slug;
    } else {
      const normHints = rawHints
        .map((h) => normalizeTitleForMatch(h))
        .filter((nh) => nh.length >= 2);
      if (normHints.length === 0) return [];

      for (const q of rawHints.slice(0, 3)) {
        try {
          const sRes = await fetch(
            `https://animeav1.com/catalogo?search=${encodeURIComponent(q)}`,
            {
              headers: {
                'User-Agent': CHROME_UA,
                Referer: 'https://animeav1.com/',
              },
              signal: AbortSignal.timeout(3800),
            }
          );
          if (!sRes.ok) continue;
          const sHtml = await sRes.text();
          const rIdx = sHtml.indexOf('results:[');
          if (rIdx === -1) continue;
          const block = sHtml.slice(rIdx, rIdx + 28000);

          const candidates = [
            ...block.matchAll(/\{id:"?\d+"?,title:"([^"]+)"[^{}]*?slug:"([^"]+)"/g),
          ].map((m) => ({
            title: m[1],
            slug: m[2],
          }));

          let bestSlug: string | null = null;
          let bestScore = -999;

          for (const cand of candidates) {
            const normCand = normalizeTitleForMatch(cand.title);
            const slugLower = cand.slug.toLowerCase();
            if (!normCand || normCand.length < 2) continue;

            let baseScore = 0;
            for (const nh of normHints) {
              if (normCand === nh || slugLower === nh.replace(/\s+/g, '-')) {
                baseScore = Math.max(baseScore, 100);
              } else if (
                nh.length >= 5 &&
                (normCand.startsWith(`${nh} `) ||
                  slugLower.startsWith(`${nh.replace(/\s+/g, '-')}-`))
              ) {
                baseScore = Math.max(baseScore, 84);
              }
            }
            if (baseScore < 80) continue;

            const isMovieEntry = /\b(movie|pelicula|film)\b/i.test(`${cand.title} ${cand.slug}`);
            const isSpecialOrOva = /\b(ova|special|sunny-side|recap|summary)\b/i.test(
              `${cand.title} ${cand.slug}`
            );
            const hasSeasonN = new RegExp(
              `(?:season[-\\s]*${seasonNum}|${seasonNum}(?:nd|rd|th)[-\\s]*season|\\bpart[-\\s]*${seasonNum}\\b)`,
              'i'
            ).test(`${cand.title} ${cand.slug}`);
            const hasAnyHigherSeason =
              /(?:season[-\s]*[2-9]|[2-9](?:nd|rd|th)[-\s]*season)/i.test(
                `${cand.title} ${cand.slug}`
              );

            if (opts.mediaType === 'movie') {
              if (isMovieEntry) baseScore += 22;
              if (hasAnyHigherSeason) baseScore -= 30;
            } else {
              if (isMovieEntry) baseScore -= 45;
              if (isSpecialOrOva) baseScore -= 35;
              if (seasonNum >= 2) {
                if (hasSeasonN) baseScore += 35;
                else baseScore -= 25;
              } else if (hasAnyHigherSeason) {
                baseScore -= 28;
              }
            }

            if (baseScore > bestScore) {
              bestScore = baseScore;
              bestSlug = cand.slug;
            }
          }

          if (bestSlug && bestScore >= 55) {
            matchedSlug = bestSlug;
            break;
          }
        } catch {
          // try next hint
        }
      }

      animeAv1SlugCache.set(slugCacheKey, { slug: matchedSlug, ts: Date.now() });
    }

    if (!matchedSlug) return [];

    const epUrl = `https://animeav1.com/media/${matchedSlug}/${epNum}`;
    const epRes = await fetch(epUrl, {
      headers: {
        'User-Agent': CHROME_UA,
        Referer: 'https://animeav1.com/',
      },
      signal: AbortSignal.timeout(4000),
    });
    if (!epRes.ok) return [];
    const epHtml = await epRes.text();

    const embedsIdx = epHtml.indexOf('embeds:{');
    if (embedsIdx === -1) return [];
    const embedsSlice = epHtml.slice(embedsIdx, embedsIdx + 4500);

    const subBlockMatch = embedsSlice.match(/SUB:\s*\[([\s\S]*?)\]/);
    const dubBlockMatch = embedsSlice.match(/DUB:\s*\[([\s\S]*?)\]/);

    const resolveBlockTracks = async (
      blockStr: string | undefined,
      langCode: 'VOSE' | 'LAT',
      langLabel: string
    ): Promise<TrackRecord[]> => {
      if (!blockStr) return [];
      const found: TrackRecord[] = [];
      const zillaMatch = blockStr.match(
        /https:\/\/player\.zilla-networks\.com\/play\/([a-f0-9]{16,64})/i
      );
      if (zillaMatch?.[1]) {
        const hash = zillaMatch[1];
        const playRef = `https://player.zilla-networks.com/play/${hash}`;
        const rawM3u8 = `https://player.zilla-networks.com/m3u8/${hash}`;
        try {
          const chk = await fetch(rawM3u8, {
            headers: {
              'User-Agent': CHROME_UA,
              Referer: playRef,
            },
            signal: AbortSignal.timeout(3000),
          });
          if (chk.ok) {
            const m3uTxt = await chk.text();
            if (m3uTxt.includes('#EXTM3U')) {
              found.push({
                id: `anime-zilla-${matchedSlug}-${epNum}-${langCode.toLowerCase()}`,
                label: `${langLabel} · Anime HD`,
                lang: langCode,
                quality: '1080p HLS',
                sourceUrl: rawM3u8,
                resolverType: 'direct_hls',
                resolvedStreamUrl: buildHlsProxyUrl(rawM3u8, playRef),
              });
            }
          }
        } catch {
          // fallback below
        }
      }

      if (found.length === 0) {
        const voeMatch = blockStr.match(/https?:\/\/(?:voe\.sx|[a-z0-9.-]*voe[a-z0-9.-]*)\/e\/[a-zA-Z0-9]+/i);
        if (voeMatch?.[0]) {
          found.push({
            id: `anime-voe-${matchedSlug}-${epNum}-${langCode.toLowerCase()}`,
            label: `${langLabel} · Mirror`,
            lang: langCode,
            quality: 'HD',
            sourceUrl: voeMatch[0],
            resolverType: 'embed_sniff',
          });
        }
      }
      return found;
    };

    const [voseTracks, dubTracks] = await Promise.all([
      resolveBlockTracks(subBlockMatch?.[1], 'VOSE', 'Sub Español VOSE'),
      resolveBlockTracks(dubBlockMatch?.[1], 'LAT', 'Español Doblado'),
    ]);

    return [...dubTracks, ...voseTracks];
  } catch {
    return [];
  }
}

// ============================================================================
// SUBSYSTEM 1A-PLUS: GNULAHD + VIDARAA CASTELLANO (ESPAÑA) 1080P EXTRACTOR
// Unlocks real Español de España (ES) tracks for From, Reina Roja, Fallout, HBO, Netflix, Prime & Movies
// ============================================================================
const GNULA_ORIGIN = 'https://ww3.gnulahd.nu';
const gnulaSlugCache = new Map<string, { slug: string | null; ts: number }>();

function gnrdXorUnpack(base64Payload: string): any {
  const buf = Buffer.from(base64Payload, 'base64');
  const key = [103, 78, 55, 100]; // 'gN7d'
  const out = Buffer.alloc(buf.length);
  for (let i = 0; i < buf.length; i++) {
    out[i] = buf[i] ^ key[i & 3];
  }
  return JSON.parse(out.toString('utf8'));
}

async function resolveGnulaSlug(opts: {
  titleHints: string[];
  mediaType: 'movie' | 'tv';
  yearHint?: string;
}): Promise<string | null> {
  const uniqueHints = Array.from(
    new Set(
      opts.titleHints
        .map((h) => String(h || '').replace(/\s*\([^)]*\)/g, '').trim())
        .filter((h) => normalizeTitleForMatch(h).length >= 2)
    )
  ).slice(0, 3);
  if (uniqueHints.length === 0) return null;

  const cacheKey = `${opts.mediaType}|${opts.yearHint || ''}|${uniqueHints
    .map((h) => normalizeTitleForMatch(h))
    .join('|')}`;
  const cached = gnulaSlugCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < 30 * 60 * 1000) {
    return cached.slug;
  }

  const wantedType = opts.mediaType === 'tv' ? 'serie' : 'pelicula';
  const expectedYearNum =
    opts.yearHint && /^\d{4}$/.test(opts.yearHint.trim()) ? Number(opts.yearHint.trim()) : 0;

  for (const hint of uniqueHints) {
    try {
      const searchUrl = `${GNULA_ORIGIN}/wp-json/gnrd/v1/search?q=${encodeURIComponent(hint)}`;
      const res = await fetch(searchUrl, {
        headers: {
          'User-Agent': CHROME_UA,
          Accept: 'application/json',
          Referer: `${GNULA_ORIGIN}/`,
        },
        signal: AbortSignal.timeout(3600),
      });
      if (!res.ok) continue;
      const json: any = await res.json();
      const results: any[] = Array.isArray(json?.results) ? json.results : [];
      if (results.length === 0) continue;

      const normTargets = uniqueHints
        .map((h) => normalizeTitleForMatch(h))
        .filter((nt) => nt.length >= 2);
      const hasAnyTypedResult = results.some((r) => Boolean(String(r?.type || '').trim()));
      const pool = hasAnyTypedResult
        ? results.filter((r) =>
            normalizeTitleForMatch(String(r?.type || '')).includes(wantedType)
          )
        : results;
      if (pool.length === 0) continue;

      const isYearCompatible = (rawYear: any): boolean => {
        if (!expectedYearNum) return true;
        const ry = String(rawYear || '').trim();
        if (!/^\d{4}$/.test(ry)) return true;
        return Math.abs(Number(ry) - expectedYearNum) <= 1;
      };

      const isExactTitle = (rawTitle: any): boolean => {
        const str = String(rawTitle || '').trim();
        const rFull = normalizeTitleForMatch(str);
        const rOutside = normalizeTitleForMatch(str.replace(/\s*\([^)]*\)/g, ''));
        return (
          (rFull.length >= 2 && normTargets.includes(rFull)) ||
          (rOutside.length >= 2 && normTargets.includes(rOutside))
        );
      };

      const chosen =
        pool.find(
          (r) =>
            isExactTitle(r?.title) &&
            expectedYearNum > 0 &&
            Number(String(r?.year || '').trim()) === expectedYearNum
        ) || pool.find((r) => isExactTitle(r?.title) && isYearCompatible(r?.year));

      if (chosen?.url) {
        const m = String(chosen.url).match(/\/ver\/([^/?#]+)\/?/i);
        if (m?.[1]) {
          gnulaSlugCache.set(cacheKey, { slug: m[1], ts: Date.now() });
          return m[1];
        }
      }
    } catch {
      // try next hint
    }
  }

  gnulaSlugCache.set(cacheKey, { slug: null, ts: Date.now() });
  return null;
}

async function extractGnulaCastellanoTracks(opts: {
  titleHints: string[];
  mediaType: 'movie' | 'tv';
  season?: number;
  episode?: number;
  yearHint?: string;
}): Promise<TrackRecord[]> {
  try {
    const slug = await resolveGnulaSlug({
      titleHints: opts.titleHints,
      mediaType: opts.mediaType,
      yearHint: opts.yearHint,
    });
    if (!slug) return [];

    const pageUrl =
      opts.mediaType === 'tv'
        ? `${GNULA_ORIGIN}/${slug}-${opts.season || 1}x${String(opts.episode || 1).padStart(
            2,
            '0'
          )}/`
        : `${GNULA_ORIGIN}/ver/${slug}/`;

    const pageRes = await fetch(pageUrl, {
      headers: {
        'User-Agent': CHROME_UA,
        Referer: `${GNULA_ORIGIN}/`,
      },
      signal: AbortSignal.timeout(4000),
    });
    if (!pageRes.ok) return [];
    const html = await pageRes.text();

    const pidMatch = html.match(/_gnrdPid\s*=\s*(\d+)/);
    const tokMatch = html.match(/_gnrdTok\s*=\s*["']([^"']+)["']/);
    if (!pidMatch?.[1] || !tokMatch?.[1]) return [];

    const playerApiUrl = `${GNULA_ORIGIN}/wp-json/gnrd/v1/player?id=${
      pidMatch[1]
    }&t=${encodeURIComponent(tokMatch[1])}`;
    const pRes = await fetch(playerApiUrl, {
      headers: {
        'User-Agent': CHROME_UA,
        Accept: 'application/json',
        Referer: pageUrl,
      },
      signal: AbortSignal.timeout(3800),
    });
    if (!pRes.ok) return [];
    const pJson: any = await pRes.json();
    if (!pJson?.p) return [];

    const decoded = gnrdXorUnpack(String(pJson.p));
    const langs: any[] = Array.isArray(decoded?.langs) ? decoded.langs : [];
    if (langs.length === 0) return [];

    const nativeTracks: TrackRecord[] = [];
    const embedBackupTracks: TrackRecord[] = [];

    langs.forEach((lObj, lIdx) => {
      const rawLabel = String(lObj?.label || '').trim();
      const rawFlag = String(lObj?.flag || '').toUpperCase();
      let langCode: 'ES' | 'LAT' | 'VOSE' = 'LAT';
      let displayLang = 'Español Latino';

      if (rawFlag === 'ES' || /castellano|espa[ñn]a/i.test(rawLabel)) {
        langCode = 'ES';
        displayLang = 'Castellano (España)';
      } else if (/subtitul|vose/i.test(rawLabel)) {
        langCode = 'VOSE';
        displayLang = 'VOSE (Sub Español)';
      } else if (rawFlag === 'MX' || /latino/i.test(rawLabel)) {
        langCode = 'LAT';
        displayLang = 'Español Latino';
      }

      const servers: any[] = Array.isArray(lObj?.servers) ? lObj.servers : [];
      servers.forEach((srv, sIdx) => {
        const rawSrc = String(srv?.src || '').trim();
        if (!rawSrc || !/^https?:\/\//i.test(rawSrc)) return;
        const srvTitle = String(srv?.title || `Servidor ${sIdx + 1}`).trim();
        const hostLow = rawSrc.toLowerCase();

        if (
          /vidaraa?\.[a-z]+|vidhide|smoothpre|earnvids|streamwish|filelions|hglink|hlswish|wishembed/i.test(
            hostLow
          )
        ) {
          nativeTracks.push({
            id: `gnula-hls-${langCode}-${lIdx}-${sIdx}`,
            label: `${displayLang} · 1080p`,
            lang: langCode,
            quality: '1080p',
            sourceUrl: rawSrc,
            resolverType: 'vidhide_hls',
          });
        } else if (/voe\.[a-z]+/i.test(hostLow)) {
          nativeTracks.push({
            id: `gnula-voe-${langCode}-${lIdx}-${sIdx}`,
            label: `${displayLang} · VOE HD`,
            lang: langCode,
            quality: 'HD',
            sourceUrl: rawSrc,
            resolverType: 'embed_sniff',
          });
        } else if (/ok\.ru|byse|vidsonic|dood|netu/i.test(hostLow)) {
          embedBackupTracks.push({
            id: `gnula-emb-${langCode}-${lIdx}-${sIdx}`,
            label: `${displayLang} · ${srvTitle} (Web)`,
            lang: langCode,
            quality: 'HD',
            sourceUrl: rawSrc,
            resolverType: 'web_embed',
          });
        }
      });
    });

    return [...nativeTracks, ...embedBackupTracks];
  } catch {
    return [];
  }
}

async function extractEmbed69SpanishTracks(opts: {
  tmdbId?: string | number;
  imdbId?: string | null;
  mediaType: 'movie' | 'tv';
  season?: number;
  episode?: number;
  titleHints?: string[];
}): Promise<TrackRecord[]> {
  try {
    const imdbId =
      opts.imdbId || (opts.tmdbId ? await resolveImdbId(opts.tmdbId, opts.mediaType) : null);

    const epSuffix =
      opts.mediaType === 'tv' && opts.season && opts.episode
        ? `-${opts.season}x${String(opts.episode).padStart(2, '0')}`
        : '';

    const hints = [...(opts.titleHints || [])].filter(Boolean);
    let isLikelyAnime = false;
    let yearHint = '';

    if (opts.tmdbId) {
      try {
        const cleanId = String(opts.tmdbId).replace(/\D/g, '');
        const tmUrl =
          opts.mediaType === 'tv'
            ? `https://api.themoviedb.org/3/tv/${cleanId}?api_key=${TMDB_API_KEY}&language=es-ES`
            : `https://api.themoviedb.org/3/movie/${cleanId}?api_key=${TMDB_API_KEY}&language=es-ES`;
        const tmRes = await fetch(tmUrl, { signal: AbortSignal.timeout(2800) });
        if (tmRes.ok) {
          const tmJson: any = await tmRes.json();
          const esName = String(tmJson?.name || tmJson?.title || '').trim();
          const origName = String(
            tmJson?.original_name || tmJson?.original_title || ''
          ).trim();
          const rawDate = String(tmJson?.first_air_date || tmJson?.release_date || '');
          if (rawDate) yearHint = rawDate.split('-')[0] || '';
          if (esName) hints.push(esName);
          if (origName) hints.push(origName);

          const genres: any[] = Array.isArray(tmJson?.genres) ? tmJson.genres : [];
          const hasAnimGenre = genres.some((g) => Number(g?.id) === 16);
          const origCountries: string[] = Array.isArray(tmJson?.origin_country)
            ? tmJson.origin_country
            : [];
          const isJp =
            String(tmJson?.original_language || '').toLowerCase() === 'ja' ||
            origCountries.includes('JP');
          isLikelyAnime = hasAnimGenre && isJp;

          if (isLikelyAnime) {
            const enUrl =
              opts.mediaType === 'tv'
                ? `https://api.themoviedb.org/3/tv/${cleanId}?api_key=${TMDB_API_KEY}&language=en-US`
                : `https://api.themoviedb.org/3/movie/${cleanId}?api_key=${TMDB_API_KEY}&language=en-US`;
            const enRes = await fetch(enUrl, { signal: AbortSignal.timeout(2400) }).catch(
              () => null
            );
            if (enRes?.ok) {
              const enJson: any = await enRes.json();
              const enName = String(enJson?.name || enJson?.title || '').trim();
              if (enName) hints.push(enName);
            }
          }
        }
      } catch {
        // ignore
      }
    }

    const [gnulaTracks, directTracks, skTracks, animeTracks] = await Promise.all([
      hints.length > 0
        ? extractGnulaCastellanoTracks({
            titleHints: hints,
            mediaType: opts.mediaType,
            season: opts.season,
            episode: opts.episode,
            yearHint,
          }).catch(() => [] as TrackRecord[])
        : Promise.resolve([] as TrackRecord[]),
      imdbId
        ? fetchEmbed69HtmlWithMirrorAndAnubis(`${imdbId}${epSuffix}`)
            .then((html) => parseEmbed69OrMoeTracks(html, `${imdbId}${epSuffix}`))
            .catch(() => [] as TrackRecord[])
        : Promise.resolve([] as TrackRecord[]),
      hints.length > 0
        ? resolveSeriesKaoVidurlTracks({
            titleHints: hints,
            mediaType: opts.mediaType,
            season: opts.season,
            episode: opts.episode,
            yearHint,
            imdbId,
          }).catch(() => [] as TrackRecord[])
        : Promise.resolve([] as TrackRecord[]),
      isLikelyAnime && hints.length > 0
        ? extractAnimeAv1Tracks({
            titleHints: hints,
            mediaType: opts.mediaType,
            season: opts.season,
            episode: opts.episode,
          }).catch(() => [] as TrackRecord[])
        : Promise.resolve([] as TrackRecord[]),
    ]);

    const seenTrackKeys = new Set<string>();
    const countPerLang: Record<string, number> = {};
    const merged: TrackRecord[] = [];

    // Prioritize exact IMDb-matched `directTracks` FIRST, followed by year-verified native HLS extractors
    const orderedCandidates = [
      ...directTracks,
      ...gnulaTracks.filter((t) => t.resolverType !== 'web_embed'),
      ...skTracks,
      ...animeTracks,
      ...gnulaTracks.filter((t) => t.resolverType === 'web_embed'),
    ];

    for (const tr of orderedCandidates) {
      const code = String(tr.lang || '').toUpperCase();
      if (!code) continue;
      const key = `${code}:${tr.sourceUrl}`;
      if (seenTrackKeys.has(key)) continue;
      const currentCount = countPerLang[code] || 0;
      if (currentCount >= 3) continue;
      seenTrackKeys.add(key);
      countPerLang[code] = currentCount + 1;
      merged.push(tr);
    }

    const orderMap: Record<string, number> = { ES: 1, LAT: 2, VOSE: 3 };
    const resolverRank = (rt: string) =>
      rt === 'vidhide_hls' ? 1 : rt === 'movidy_embed' ? 2 : rt === 'embed_sniff' ? 3 : 4;
    return merged.sort((a, b) => {
      const langDiff = (orderMap[a.lang] || 9) - (orderMap[b.lang] || 9);
      if (langDiff !== 0) return langDiff;
      return resolverRank(a.resolverType) - resolverRank(b.resolverType);
    });
  } catch (err) {
    console.warn('extractEmbed69SpanishTracks error:', err);
    return [];
  }
}

// ============================================================================
// SUBSYSTEM 1B: BINGETRIX ENGLISH 1080P WASM CHACHA20 DECOMPILER (PURE NODE H2)
// ============================================================================
function h2GetRaw(
  targetUrl: string,
  headers: Record<string, string> = {},
  maxTimeSec = 6,
  redirectsLeft = 4
): Promise<{ buf: Buffer; effectiveUrl: string; status: number }> {
  return new Promise((resolve, reject) => {
    let u: URL;
    try {
      u = new URL(targetUrl);
    } catch (err) {
      return reject(err);
    }

    if (u.protocol !== 'https:') {
      fetch(targetUrl, {
        headers,
        signal: AbortSignal.timeout(maxTimeSec * 1000),
      })
        .then(async (r) => ({
          buf: Buffer.from(await r.arrayBuffer()),
          effectiveUrl: r.url || targetUrl,
          status: r.status,
        }))
        .then(resolve)
        .catch(reject);
      return;
    }

    const client = http2.connect(u.origin, { rejectUnauthorized: false });
    let settled = false;
    const finishErr = (err: Error) => {
      if (settled) return;
      settled = true;
      try {
        client.close();
      } catch {}
      reject(err);
    };

    client.on('error', finishErr);

    const reqHeaders: Record<string, string> = {
      ':method': 'GET',
      ':path': u.pathname + u.search,
      ':scheme': 'https',
      ':authority': u.host,
      'user-agent': CHROME_UA,
      'accept-encoding': 'gzip, deflate, br',
    };
    for (const [k, v] of Object.entries(headers)) {
      if (v) reqHeaders[k.toLowerCase()] = v;
    }

    const req = client.request(reqHeaders);
    let status = 0;
    let locationHeader = '';
    let contentEncoding = '';
    const chunks: Buffer[] = [];

    req.on('response', (resHeaders) => {
      status = Number(resHeaders[':status'] || 0);
      locationHeader = String(resHeaders['location'] || '');
      contentEncoding = String(resHeaders['content-encoding'] || '').toLowerCase();
    });

    req.on('data', (chunk: Buffer) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    const finalize = () => {
      if (settled) return;
      settled = true;
      try {
        client.close();
      } catch {}

      if ([301, 302, 303, 307, 308].includes(status) && locationHeader && redirectsLeft > 0) {
        const nextUrl = new URL(locationHeader, targetUrl).href;
        h2GetRaw(nextUrl, headers, maxTimeSec, redirectsLeft - 1).then(resolve).catch(reject);
        return;
      }

      let rawBuf = Buffer.concat(chunks);
      try {
        if (contentEncoding.includes('br')) {
          rawBuf = zlib.brotliDecompressSync(rawBuf);
        } else if (contentEncoding.includes('gzip')) {
          rawBuf = zlib.gunzipSync(rawBuf);
        } else if (contentEncoding.includes('deflate')) {
          rawBuf = zlib.inflateSync(rawBuf);
        }
      } catch {
        // keep raw buffer if already decompressed
      }

      resolve({ buf: rawBuf, effectiveUrl: targetUrl, status });
    };

    req.on('end', finalize);
    req.on('error', (err) => {
      if (chunks.length > 0) finalize();
      else finishErr(err);
    });
    req.setTimeout(maxTimeSec * 1000, () => {
      try {
        req.close();
      } catch {}
      if (chunks.length > 0) finalize();
      else finishErr(new Error('HTTP/2 request timeout'));
    });
    req.end();
  });
}

async function curlGetText(
  targetUrl: string,
  headers: Record<string, string> = {},
  maxTimeSec = 6
): Promise<{ text: string; effectiveUrl: string }> {
  try {
    const h2 = await h2GetRaw(targetUrl, headers, maxTimeSec);
    if (h2.buf.length > 0 && h2.status < 400) {
      return { text: h2.buf.toString('utf8'), effectiveUrl: h2.effectiveUrl };
    }
  } catch {
    // fallback to curl if available
  }

  return new Promise((resolve, reject) => {
    const args = [
      '-sS',
      '-L',
      '-k',
      '--compressed',
      '--max-time',
      String(maxTimeSec),
      '-w',
      '\n__FINAL_URL__:%{url_effective}',
    ];
    for (const [k, v] of Object.entries(headers)) {
      if (v) args.push('-H', `${k}: ${v}`);
    }
    args.push(targetUrl);
    execFile('curl', args, { maxBuffer: 15 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err && !stdout) {
        return reject(new Error(stderr || err.message));
      }
      const raw = String(stdout || '');
      const markerIdx = raw.lastIndexOf('\n__FINAL_URL__:');
      if (markerIdx !== -1) {
        return resolve({
          text: raw.slice(0, markerIdx),
          effectiveUrl: raw.slice(markerIdx + 15).trim() || targetUrl,
        });
      }
      resolve({ text: raw, effectiveUrl: targetUrl });
    });
  });
}

async function curlGetBuffer(
  targetUrl: string,
  headers: Record<string, string> = {},
  maxTimeSec = 7
): Promise<Buffer> {
  try {
    const h2 = await h2GetRaw(targetUrl, headers, maxTimeSec);
    if (h2.buf.length > 0 && h2.status < 400) {
      return h2.buf;
    }
  } catch {
    // fallback to curl if available
  }

  return new Promise((resolve, reject) => {
    const args = ['-sS', '-L', '-k', '--max-time', String(maxTimeSec)];
    for (const [k, v] of Object.entries(headers)) {
      if (v) args.push('-H', `${k}: ${v}`);
    }
    args.push(targetUrl);
    execFile(
      'curl',
      args,
      { encoding: 'buffer', maxBuffer: 25 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err && (!stdout || stdout.length === 0)) {
          return reject(new Error(stderr ? stderr.toString() : err.message));
        }
        resolve(Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout));
      }
    );
  });
}

const wasmModuleCache = new Map<string, Promise<WebAssembly.Module>>();

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
  if (wasmModuleCache.size > 12) {
    const oldest = wasmModuleCache.keys().next().value;
    if (oldest) wasmModuleCache.delete(oldest);
  }
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

async function extractBingetrixEnglishTracks(opts: {
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

async function hasBingetrixEnglishStreamFast(opts: {
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

// ============================================================================
// SUBSYSTEM 1C: MOVIDY SPANISH STREAM & CATALOG ENGINE (movidy.pw + nupload.my)
// ============================================================================
async function decodeNuploadToHls(embedUrlOrB64: string): Promise<{ rawM3u8: string; proxyUrl: string } | null> {
  try {
    let embedUrl = embedUrlOrB64.trim();
    if (!embedUrl.startsWith('http')) {
      embedUrl = Buffer.from(embedUrl, 'base64').toString('utf8').trim();
    }
    if (!embedUrl.startsWith('http')) return null;
    if (!embedUrl.includes('?')) {
      embedUrl += '?h=';
    }

    const res = await fetch(embedUrl, {
      headers: {
        Referer: 'https://movidy.pw/',
        'User-Agent': CHROME_UA,
      },
      signal: AbortSignal.timeout(5500),
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

interface MovidyPageMetadata {
  isTvShow: boolean;
  cleanTitle: string;
  year: string;
  durationText: string;
  director: string;
  cast: { id: number; name: string; character: string }[];
  overview: string;
  html: string;
}

const movidyPageMetaCache = new Map<string, { meta: MovidyPageMetadata; ts: number }>();

async function fetchMovidyPageMetadata(movidyVerUrl: string): Promise<MovidyPageMetadata | null> {
  try {
    const cleanUrl = String(movidyVerUrl || '').trim();
    if (!cleanUrl.includes('movidy.pw/ver/')) return null;

    const cached = movidyPageMetaCache.get(cleanUrl);
    if (cached && Date.now() - cached.ts < 15 * 60 * 1000) {
      return cached.meta;
    }

    let html = '';
    try {
      const res = await fetch(cleanUrl, {
        headers: {
          'User-Agent': CHROME_UA,
          Referer: 'https://movidy.pw/pelis/',
        },
        signal: AbortSignal.timeout(5000),
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

    const meta: MovidyPageMetadata = {
      isTvShow,
      cleanTitle,
      year,
      durationText,
      director,
      cast,
      overview,
      html,
    };
    movidyPageMetaCache.set(cleanUrl, { meta, ts: Date.now() });
    if (movidyPageMetaCache.size > 300) {
      const oldest = movidyPageMetaCache.keys().next().value;
      if (oldest) movidyPageMetaCache.delete(oldest);
    }
    return meta;
  } catch {
    return null;
  }
}

async function extractMovidyPageTracks(
  movidyVerUrl: string,
  opts?: { expectedYear?: string; requireMovieOnly?: boolean }
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
      opts?.expectedYear &&
      /^\d{4}$/.test(opts.expectedYear.trim()) &&
      meta.year &&
      /^\d{4}$/.test(meta.year)
    ) {
      if (Math.abs(Number(meta.year) - Number(opts.expectedYear.trim())) > 1) {
        return [];
      }
    }

    const html = meta.html;
    const slug =
      cleanUrl
        .split('/ver/')[1]
        ?.replace(/\//g, '')
        .replace(/[^a-zA-Z0-9_-]/g, '') || 'movidy';

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
        id: `movidy-${slug}-${lang.toLowerCase()}-${rawTracks.length + 1}`,
        label,
        lang,
        quality: 'HD HLS',
        sourceUrl: dataUrl,
        resolverType: 'movidy_embed',
      });
    }

    const langOrder: Record<string, number> = { ES: 1, LAT: 2, VOSE: 3 };
    return rawTracks.sort((a, b) => (langOrder[a.lang] || 9) - (langOrder[b.lang] || 9));
  } catch (err) {
    console.warn('extractMovidyPageTracks error:', err);
    return [];
  }
}

function normalizeTitleForMatch(raw: string): string {
  return String(raw || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

async function findMovidyUrlByTitle(
  title: string,
  expectedYear?: string
): Promise<string | null> {
  try {
    const rawClean = String(title || '').trim();
    const clean = rawClean.replace(/\s*\([^)]*\)/g, '').trim();
    const parenPart = (rawClean.match(/\(([^)]+)\)/)?.[1] || '').trim();
    const queryTerm = clean || rawClean;
    const normTarget = normalizeTitleForMatch(clean || rawClean);
    const normParenTarget = normalizeTitleForMatch(parenPart);

    // Reject empty or 1-char normalized titles (e.g. non-Latin / CJK scripts) so they NEVER match random titles!
    if (!queryTerm || queryTerm.length < 2 || !normTarget || normTarget.length < 2) {
      return null;
    }

    const searchUrl = `https://movidy.pw/?s=${encodeURIComponent(queryTerm)}`;
    let html = '';
    try {
      const res = await fetch(searchUrl, {
        headers: { 'User-Agent': CHROME_UA, Referer: 'https://movidy.pw/' },
        signal: AbortSignal.timeout(3800),
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
      const fullNorm = normalizeTitleForMatch(rawSpanTitle);
      const outsideNorm = normalizeTitleForMatch(rawSpanTitle.replace(/\s*\([^)]*\)/g, ''));
      const insideNorm = normalizeTitleForMatch(rawSpanTitle.match(/\(([^)]+)\)/)?.[1] || '');

      const isExact =
        (fullNorm.length >= 2 && fullNorm === normTarget) ||
        (outsideNorm.length >= 2 && outsideNorm === normTarget) ||
        (insideNorm.length >= 2 && insideNorm === normTarget) ||
        (normParenTarget.length >= 2 &&
          (outsideNorm === normParenTarget || insideNorm === normParenTarget));

      if (isExact && !exactMatches.includes(fullUrl)) {
        exactMatches.push(fullUrl);
      }
    }

    if (exactMatches.length === 0) return null;

    // Verify movie type + release year against Movidy's `/ver/` page so homonym movies from different decades never collide!
    const expectedYearNum =
      expectedYear && /^\d{4}$/.test(expectedYear.trim()) ? Number(expectedYear.trim()) : 0;

    for (const candidateUrl of exactMatches.slice(0, 3)) {
      const meta = await fetchMovidyPageMetadata(candidateUrl);
      if (!meta || meta.isTvShow) continue;
      if (expectedYearNum && meta.year && /^\d{4}$/.test(meta.year)) {
        if (Math.abs(Number(meta.year) - expectedYearNum) > 1) {
          continue;
        }
      }
      return candidateUrl;
    }

    return null;
  } catch {
    return null;
  }
}

const availableLangsCache = new Map<
  string,
  { langs: ('ES' | 'LAT' | 'VOSE' | 'EN')[]; ts: number }
>();

async function probeAvailableLanguages(opts: {
  tmdbId: string | number;
  mediaType: 'movie' | 'tv';
  season?: number;
  episode?: number;
  titleHints?: string[];
  movidyUrl?: string;
  yearHint?: string;
}): Promise<('ES' | 'LAT' | 'VOSE' | 'EN')[]> {
  const cleanId = String(opts.tmdbId || '').replace(/\D/g, '');
  const season = opts.mediaType === 'tv' ? opts.season || 1 : 0;
  const episode = opts.mediaType === 'tv' ? opts.episode || 1 : 0;
  const cacheKey = `${opts.mediaType}|${cleanId || opts.movidyUrl || ''}|${season}|${episode}`;

  const cached = availableLangsCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < 15 * 60 * 1000) {
    return cached.langs;
  }

  const hints = Array.from(
    new Set((opts.titleHints || []).map((t) => String(t || '').trim()).filter(Boolean))
  );

  const hasExplicitMovidy = Boolean(
    opts.movidyUrl && opts.movidyUrl.includes('movidy.pw/ver/')
  );

  const movidyPromise = (async (): Promise<TrackRecord[]> => {
    if (opts.mediaType !== 'movie') return [];
    let mvUrl = hasExplicitMovidy ? opts.movidyUrl! : '';
    if (!mvUrl) {
      for (const h of hints.slice(0, 2)) {
        const found = await findMovidyUrlByTitle(h, opts.yearHint);
        if (found) {
          mvUrl = found;
          break;
        }
      }
    }
    if (!mvUrl) return [];
    return extractMovidyPageTracks(
      mvUrl,
      hasExplicitMovidy
        ? undefined
        : { expectedYear: opts.yearHint, requireMovieOnly: true }
    );
  })();

  const embedPromise =
    cleanId || hints.length > 0
      ? extractEmbed69SpanishTracks({
          tmdbId: cleanId || undefined,
          mediaType: opts.mediaType,
          season: season || undefined,
          episode: episode || undefined,
          titleHints: hints,
        })
      : Promise.resolve([] as TrackRecord[]);

  const enPromise = cleanId
    ? hasBingetrixEnglishStreamFast({
        tmdbId: cleanId,
        mediaType: opts.mediaType,
        season: season || undefined,
        episode: episode || undefined,
      })
    : Promise.resolve(false);

  const withProbeTimeout = <T>(p: Promise<T>, ms: number, fallback: T): Promise<T> =>
    Promise.race([
      p.catch(() => fallback),
      new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
    ]);

  const [mvTracks, esTracks, hasEn] = await Promise.all([
    withProbeTimeout(movidyPromise, 4500, [] as TrackRecord[]),
    withProbeTimeout(embedPromise, 6500, [] as TrackRecord[]),
    withProbeTimeout(enPromise, 4200, false),
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

  const ordered = (['ES', 'LAT', 'VOSE', 'EN'] as const).filter((code) =>
    foundSet.has(code)
  );

  if (ordered.length > 0) {
    availableLangsCache.set(cacheKey, { langs: ordered, ts: Date.now() });
    if (availableLangsCache.size > 400) {
      const firstKey = availableLangsCache.keys().next().value;
      if (firstKey) availableLangsCache.delete(firstKey);
    }
  }

  return ordered;
}

// ============================================================================
// SUBSYSTEM 2: PURE CRYPTO + HTTP LIVE SPORTS DECOMPILER (<350ms, ZERO CHROME)
// ============================================================================
function healUpstreamSportsDomain(rawUrl: string): string {
  // Auto-heal rotated mirror hostnames (doc.tilinhd.lol / dog.tilinhd.lol -> pig.footunder.online)
  return rawUrl.replace(/\/\/(?:doc|dog)\.tilinhd\.lol\b/gi, '//pig.footunder.online');
}

const liveFrameHealthCache = new Map<string, { ok: boolean; ts: number }>();

async function verifyM3u8HasCleanVideoFrame(
  m3uText: string,
  m3uUrl: string,
  referer: string
): Promise<boolean> {
  const now = Date.now();
  const cached = liveFrameHealthCache.get(m3uUrl);
  if (cached && now - cached.ts < 150_000) {
    return cached.ok;
  }

  try {
    const segLines = m3uText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));
    if (segLines.length === 0) return false;

    // Pick the freshest segment near the live edge
    const chosenRel = segLines[segLines.length - 1] || segLines[0];
    const segUrl = new URL(chosenRel, m3uUrl).href;

    // If nested variant playlist, follow one level
    if (/\.m3u8(\?|$)/i.test(segUrl)) {
      const subText = await fetchSportsHtmlHop(segUrl, referer);
      if (subText.includes('#EXTM3U')) {
        return verifyM3u8HasCleanVideoFrame(subText, segUrl, referer);
      }
      return false;
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3500);
    const chunks: Buffer[] = [];
    let totalBytes = 0;

    try {
      const resp = await fetch(segUrl, {
        headers: {
          Referer: referer,
          'User-Agent': CHROME_UA,
          Range: 'bytes=0-380000',
        },
        signal: ctrl.signal,
      });
      if (!resp.ok || !resp.body) {
        clearTimeout(timer);
        liveFrameHealthCache.set(m3uUrl, { ok: false, ts: now });
        return false;
      }

      const reader = resp.body.getReader();
      while (totalBytes < 380_000) {
        const { done, value } = await reader.read();
        if (done || !value) break;
        chunks.push(Buffer.from(value));
        totalBytes += value.byteLength;
      }
      ctrl.abort();
    } catch {
      // Partial buffer already collected before abort is expected
    } finally {
      clearTimeout(timer);
    }

    const sampleBuf = Buffer.concat(chunks);
    if (sampleBuf.length < 16_000) {
      liveFrameHealthCache.set(m3uUrl, { ok: false, ts: now });
      return false;
    }

    let ffmpegSpawnFailed = false;
    const rawFrame = await new Promise<Buffer>((resolve) => {
      const ff = spawn(FFMPEG_BIN, [
        '-hide_banner',
        '-loglevel',
        'error',
        '-i',
        'pipe:0',
        '-vf',
        'scale=160:90',
        '-frames:v',
        '1',
        '-f',
        'rawvideo',
        '-pix_fmt',
        'rgb24',
        'pipe:1',
      ]);
      const outChunks: Buffer[] = [];
      const killTimer = setTimeout(() => {
        try {
          ff.kill('SIGKILL');
        } catch {
          // ignore
        }
      }, 2200);
      ff.stdout.on('data', (c: Buffer) => {
        outChunks.push(c);
      });
      ff.on('error', () => {
        ffmpegSpawnFailed = true;
        clearTimeout(killTimer);
        resolve(Buffer.alloc(0));
      });
      ff.on('close', () => {
        clearTimeout(killTimer);
        resolve(Buffer.concat(outChunks));
      });
      ff.stdin.on('error', () => {});
      ff.stdin.end(sampleBuf);
    });

    if (ffmpegSpawnFailed) {
      // Never block valid live streams if FFmpeg binary cannot spawn in container
      liveFrameHealthCache.set(m3uUrl, { ok: true, ts: now });
      return true;
    }

    const expectedBytes = 160 * 90 * 3;
    if (rawFrame.length < expectedBytes) {
      liveFrameHealthCache.set(m3uUrl, { ok: false, ts: now });
      return false;
    }

    // Pixel-level guard against scrambled/corrupted satellite feeds:
    // 1) Detect YUV (0,0,0) uninitialized decoder-green (`G > 95 && R < 45 && B < 45 && G > R + 55 && G > B + 55`),
    //    including top-25%-rainbow-garbled + bottom-75%-green feeds that fool JPEG size checks!
    // 2) Detect dead black/flat static feeds via luma standard deviation.
    const totalPixels = 160 * 90;
    const bottomStartY = 45;
    const bottomPixels = 160 * (90 - bottomStartY);
    let decoderGreenAll = 0;
    let decoderGreenBottom = 0;
    let lumaSum = 0;
    let lumaSqSum = 0;

    for (let y = 0; y < 90; y++) {
      for (let x = 0; x < 160; x++) {
        const idx = (y * 160 + x) * 3;
        const r = rawFrame[idx];
        const g = rawFrame[idx + 1];
        const b = rawFrame[idx + 2];

        const isDecoderGreen =
          g > 95 && r < 45 && b < 45 && g > r + 55 && g > b + 55;
        if (isDecoderGreen) {
          decoderGreenAll++;
          if (y >= bottomStartY) decoderGreenBottom++;
        }

        const luma = 0.299 * r + 0.587 * g + 0.114 * b;
        lumaSum += luma;
        lumaSqSum += luma * luma;
      }
    }

    const greenAllRatio = decoderGreenAll / totalPixels;
    const greenBottomRatio = decoderGreenBottom / bottomPixels;
    const meanLuma = lumaSum / totalPixels;
    const lumaVariance = Math.max(0, lumaSqSum / totalPixels - meanLuma * meanLuma);
    const lumaStdDev = Math.sqrt(lumaVariance);

    const isClean =
      greenBottomRatio < 0.08 &&
      greenAllRatio < 0.10 &&
      lumaStdDev >= 4.0;

    liveFrameHealthCache.set(m3uUrl, { ok: isClean, ts: now });
    return isClean;
  } catch {
    return false;
  }
}

function decodeSportsPlaystreamEconfig(econfig: string): any | null {
  try {
    const order = [2, 0, 3, 1];
    const s1 = Buffer.from(econfig, 'base64').toString('binary');
    const chunkLen = Math.ceil(s1.length / 4);
    const chunks: string[] = [];
    for (let i = 0; i < 4; i++) {
      chunks.push(s1.slice(i * chunkLen, (i + 1) * chunkLen));
    }
    const reordered: string[] = [];
    for (let i = 0; i < 4; i++) {
      const part = String(chunks[i] || '');
      const cleanPart = part.slice(0, 3) + part.slice(4);
      reordered[order[i]] = Buffer.from(cleanPart, 'base64').toString('binary');
    }
    const jsonText = Buffer.from(reordered.join(''), 'base64').toString('utf8');
    return JSON.parse(jsonText);
  } catch {
    return null;
  }
}

async function fetchSportsHtmlHop(url: string, referer: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: {
        Referer: referer,
        'User-Agent': CHROME_UA,
        Accept: 'text/html,application/xhtml+xml,*/*;q=0.9',
      },
      signal: AbortSignal.timeout(4500),
    });
    if (res.ok) return await res.text();
  } catch {
    // fallback to HTTP/2 helper
  }
  const fb = await curlGetText(url, { Referer: referer, 'User-Agent': CHROME_UA }, 5).catch(
    () => ({ text: '', effectiveUrl: url })
  );
  return fb.text;
}

async function extractLiveSportsHlsDirect(
  initialUrl: string
): Promise<{
  streamUrl: string;
  referer: string;
  isDirectMp4: boolean;
  isBrokenGreenFeed?: boolean;
} | null> {
  let currentUrl = healUpstreamSportsDomain(initialUrl);
  let currentReferer = 'https://www.rojadirectv.live/';
  try {
    currentReferer = new URL(currentUrl).origin + '/';
  } catch {
    // keep default referer
  }

  for (let hop = 0; hop < 7; hop++) {
    currentUrl = healUpstreamSportsDomain(currentUrl);
    const html = await fetchSportsHtmlHop(currentUrl, currentReferer);
    if (!html) break;

    // 1. Playstream / Footunder `window._econfig` pure crypto decode + green-screen guard!
    const econfigMatch = html.match(/window\._econfig\s*=\s*['"]([^'"]+)['"]/);
    if (econfigMatch && econfigMatch[1]) {
      const cfg = decodeSportsPlaystreamEconfig(econfigMatch[1]);
      const rawCandidate: string = cfg?.stream_url_nop2p || cfg?.stream_url || '';
      if (rawCandidate) {
        const origin = new URL(currentUrl).origin;
        const candidateTargets: { url: string; ref: string }[] = [
          rawCandidate.startsWith('http')
            ? {
                url: `${origin}/playstream.php?stream_tv=${Buffer.from(rawCandidate).toString('base64')}`,
                ref: currentUrl,
              }
            : { url: new URL(rawCandidate, currentUrl).href, ref: currentUrl },
        ];

        if (!origin.includes('pig.footunder.online') && rawCandidate.startsWith('http')) {
          candidateTargets.push({
            url: `https://pig.footunder.online/playstream.php?stream_tv=${Buffer.from(rawCandidate).toString('base64')}`,
            ref: 'https://pig.footunder.online/playstream.php',
          });
        }

        let sawM3uButScrambled = false;
        for (const cand of candidateTargets) {
          const checkM3u = await fetchSportsHtmlHop(cand.url, cand.ref);
          if (checkM3u.includes('#EXTM3U')) {
            const frameOk = await verifyM3u8HasCleanVideoFrame(checkM3u, cand.url, cand.ref);
            if (!frameOk) {
              sawM3uButScrambled = true;
              continue;
            }
            return {
              streamUrl: cand.url,
              referer: cand.ref,
              isDirectMp4: false,
            };
          }
        }
        if (sawM3uButScrambled) {
          return {
            streamUrl: '',
            referer: currentUrl,
            isDirectMp4: false,
            isBrokenGreenFeed: true,
          };
        }
      }
      return {
        streamUrl: '',
        referer: currentUrl,
        isDirectMp4: false,
        isBrokenGreenFeed: true,
      };
    }

    // 2. Direct `.m3u8` in Clappr / JWPlayer / HLS.js config (verified clean frame!)
    const directM3u8Match = html.match(
      /(?:source|file|src|streamUrl)\s*:\s*['"](https?:\/\/[^'"]+\.m3u8[^'"]*)['"]/i
    );
    if (directM3u8Match && directM3u8Match[1] && !isBlockedAdUrl(directM3u8Match[1])) {
      const m3uCandidate = directM3u8Match[1];
      const checkM3u = await fetchSportsHtmlHop(m3uCandidate, currentUrl);
      if (checkM3u.includes('#EXTM3U')) {
        const frameOk = await verifyM3u8HasCleanVideoFrame(checkM3u, m3uCandidate, currentUrl);
        if (!frameOk) {
          return {
            streamUrl: '',
            referer: currentUrl,
            isDirectMp4: false,
            isBrokenGreenFeed: true,
          };
        }
      }
      return {
        streamUrl: m3uCandidate,
        referer: currentUrl,
        isDirectMp4: false,
      };
    }

    // 3. Base64 `atob('...')` or `encodedUrl = "..."` iframe hop
    const b64Matches = [
      ...html.matchAll(/(?:atob\(\s*['"]|encodedUrl\s*=\s*['"])([A-Za-z0-9+/=]{16,})['"]/g),
    ];
    let followedB64 = false;
    for (const m of b64Matches) {
      try {
        const decoded = Buffer.from(m[1], 'base64').toString('utf8').trim();
        if (
          (decoded.startsWith('http') || decoded.startsWith('/')) &&
          !isBlockedAdUrl(decoded)
        ) {
          const nextUrl = healUpstreamSportsDomain(new URL(decoded, currentUrl).href);
          currentReferer = currentUrl;
          currentUrl = nextUrl;
          followedB64 = true;
          break;
        }
      } catch {
        // ignore invalid base64
      }
    }
    if (followedB64) continue;

    // 4. Static `<iframe src="...">` hop
    const staticIframe = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
    if (staticIframe && staticIframe[1] && !isBlockedAdUrl(staticIframe[1])) {
      const nextUrl = healUpstreamSportsDomain(new URL(staticIframe[1], currentUrl).href);
      if (nextUrl !== currentUrl) {
        currentReferer = currentUrl;
        currentUrl = nextUrl;
        continue;
      }
    }

    break;
  }

  return null;
}

async function unwrapNestedEmbedChain(initialUrl: string): Promise<{ targetUrl: string; referer: string }> {
  let currentUrl = healUpstreamSportsDomain(initialUrl);
  let currentReferer = new URL(currentUrl).origin + '/';

  for (let hop = 0; hop < 5; hop++) {
    try {
      const html = await fetchSportsHtmlHop(currentUrl, currentReferer);
      if (!html) break;

      if (html.includes('_econfig') || html.includes('Clappr') || html.includes('jwplayer')) {
        return { targetUrl: currentUrl, referer: currentReferer };
      }

      const staticIframe = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
      if (staticIframe && staticIframe[1] && !isBlockedAdUrl(staticIframe[1])) {
        const nextUrl = healUpstreamSportsDomain(new URL(staticIframe[1], currentUrl).href);
        currentReferer = currentUrl;
        currentUrl = nextUrl;
        continue;
      }

      const atobMatch =
        html.match(/atob\(\s*["']([A-Za-z0-9+/=]{16,})["']\s*\)/) ||
        html.match(/encodedUrl\s*=\s*["']([A-Za-z0-9+/=]{16,})["']/);
      if (atobMatch && atobMatch[1]) {
        const decoded = Buffer.from(atobMatch[1], 'base64').toString('utf8').trim();
        if (decoded.startsWith('http') || decoded.startsWith('/')) {
          const nextUrl = healUpstreamSportsDomain(new URL(decoded, currentUrl).href);
          currentReferer = currentUrl;
          currentUrl = nextUrl;
          continue;
        }
      }

      break;
    } catch {
      break;
    }
  }

  return { targetUrl: currentUrl, referer: currentReferer };
}

async function sniffStreamWithHeadless(
  rawUrl: string
): Promise<{ streamUrl: string; referer: string; isDirectMp4: boolean } | null> {
  let page: Page | null = null;
  try {
    const { targetUrl, referer } = await unwrapNestedEmbedChain(rawUrl);
    const browser = await getSharedBrowser();
    page = await browser.newPage();

    await page.setUserAgent(CHROME_UA);
    await page.setExtraHTTPHeaders({ Referer: referer });
    await page.setRequestInterception(true);

    let resolvedMedia: { streamUrl: string; referer: string; isDirectMp4: boolean } | null = null;
    let resolvePromise!: (val: { streamUrl: string; referer: string; isDirectMp4: boolean } | null) => void;
    const mediaFoundPromise = new Promise<{
      streamUrl: string;
      referer: string;
      isDirectMp4: boolean;
    } | null>((res) => {
      resolvePromise = res;
    });

    page.on('request', (req) => {
      const reqUrl = req.url();
      const resType = req.resourceType();

      if (isBlockedAdUrl(reqUrl) || resType === 'image' || resType === 'font') {
        req.abort().catch(() => {});
        return;
      }

      const isSwOnlyVirtualPlaystream =
        reqUrl.includes('tilinhd.') && reqUrl.includes('stream_tv=');

      if (
        !resolvedMedia &&
        !isSwOnlyVirtualPlaystream &&
        (reqUrl.includes('.m3u8') || reqUrl.includes('stream_tv=') || /\.mp4(\?|$)/i.test(reqUrl))
      ) {
        const reqReferer = req.headers()['referer'] || targetUrl;
        const isDirectMp4 = /\.mp4(\?|$)/i.test(reqUrl) && !reqUrl.includes('.m3u8');
        resolvedMedia = {
          streamUrl: reqUrl,
          referer: reqReferer,
          isDirectMp4,
        };
        resolvePromise(resolvedMedia);
      }

      req.continue().catch(() => {});
    });

    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});

    setTimeout(async () => {
      if (!resolvedMedia && page && !page.isClosed()) {
        await page
          .evaluate(() => {
            const btn = document.querySelector<HTMLElement>(
              '.play-wrapper, .vjs-big-play-button, .jw-icon-display, [data-play], button, video'
            );
            btn?.click();
          })
          .catch(() => {});
      }
    }, 900);

    const timeoutPromise = new Promise<null>((res) => setTimeout(() => res(null), 6000));
    return await Promise.race([mediaFoundPromise, timeoutPromise]);
  } catch (err) {
    console.warn('Headless stream sniff unavailable (safe fallback):', (err as Error)?.message);
    return null;
  } finally {
    if (page) {
      await page.close().catch(() => {});
    }
  }
}

// ============================================================================
// EXPRESS + WEBSOCKET SERVER INITIALIZATION
// ============================================================================
const app = express();
const httpServer = createServer(app);
const wss = new WebSocketServer({ noServer: true });

httpServer.on('upgrade', (req, socket, head) => {
  const pathname = (req.url || '').split('?')[0];
  if (pathname === '/ws') {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  }
});

app.use(express.json());

// Serve ES5 UMD Hls.js locally for Samsung Tizen / LG webOS Smart TVs (zero external CDN dependency)
app.get('/vendor/hls.min.js', (_req, res) => {
  const hlsPath = path.resolve(__dirname, 'node_modules', 'hls.js', 'dist', 'hls.min.js');
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.sendFile(hlsPath);
});

// Digital Asset Links for Android Trusted Web Activity (100% fullscreen native APK without URL bar)
app.get('/.well-known/assetlinks.json', (_req, res) => {
  const pubPath = path.resolve(__dirname, 'public', '.well-known', 'assetlinks.json');
  const distPath = path.resolve(__dirname, 'dist', '.well-known', 'assetlinks.json');
  const target = fs.existsSync(pubPath) ? pubPath : distPath;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.sendFile(target);
});

// Direct Ready-to-Install Signed Android APK Download (Mobile & Google TV / Chromecast)
app.get(['/NAIM-CINE-TV.apk', '/tv.apk', '/googletv.apk', '/api/download/apk-tv'], (_req, res) => {
  const pubTvApk = path.resolve(__dirname, 'public', 'NAIM-CINE-TV.apk');
  const distTvApk = path.resolve(__dirname, 'dist', 'NAIM-CINE-TV.apk');
  const target = fs.existsSync(pubTvApk) ? pubTvApk : distTvApk;
  if (!fs.existsSync(target)) {
    return res.status(404).json({ error: 'Google TV APK file not found' });
  }
  res.setHeader('Content-Type', 'application/vnd.android.package-archive');
  res.setHeader('Content-Disposition', 'attachment; filename="NAIM-CINE-TV.apk"');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.sendFile(target);
});

app.get(['/NAIM-CINE.apk', '/naimcine.apk', '/api/download/apk'], (_req, res) => {
  const pubApk = path.resolve(__dirname, 'public', 'NAIM-CINE.apk');
  const distApk = path.resolve(__dirname, 'dist', 'NAIM-CINE.apk');
  const target = fs.existsSync(pubApk) ? pubApk : distApk;
  if (!fs.existsSync(target)) {
    return res.status(404).json({ error: 'APK file not found' });
  }
  res.setHeader('Content-Type', 'application/vnd.android.package-archive');
  res.setHeader('Content-Disposition', 'attachment; filename="NAIM-CINE.apk"');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.sendFile(target);
});

// Serve Zero-Dependency Pure ES5 + Classic CSS Smart TV Receiver (/tv) directly
// Works on 100% of Samsung Tizen, LG webOS, Bravia, Viera, VIDAA & Fire TV browsers!
function sendSmartTvReceiverHtml(res: express.Response) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  const publicPath = path.resolve(__dirname, 'public', 'tv-receiver.html');
  const distPath = path.resolve(__dirname, 'dist', 'tv-receiver.html');
  const target = fs.existsSync(publicPath) ? publicPath : distPath;
  res.sendFile(target);
}

app.get(['/tv', '/tv/'], (_req, res) => {
  sendSmartTvReceiverHtml(res);
});

// Auto-redirect Smart TV browsers (Samsung Tizen, LG webOS, etc.) opening "/" straight to "/tv"
app.get('/', (req, res, next) => {
  if (req.query.web === '1' || req.query.room) {
    return next();
  }
  const ua = String(req.headers['user-agent'] || '');
  if (
    /SMART-TV|SmartTV|Tizen|Web0S|WebOS|NetCast|BRAVIA|Viera|VIDAA|HbbTV|AFTB|AFTT|AFTM|GoogleTV/i.test(
      ua
    )
  ) {
    return res.redirect(302, '/tv');
  }
  return next();
});

// ============================================================================
// SUBSYSTEM 3: AUTHORITATIVE REAL-TIME ROOM, QUEUE & CLOUD BROWSER ENGINE
// ============================================================================
interface CloudRoomSession {
  page: Page;
  timer: ReturnType<typeof setInterval>;
  url: string;
  title: string;
  isLoading: boolean;
  detectedStreamUrl?: string;
}

interface RoomRecord {
  id: string;
  name: string;
  hostId: string;
  videoState: {
    mode: 'idle' | 'hls' | 'direct' | 'youtube' | 'embed' | 'cloud';
    url: string;
    rawSourceUrl: string;
    title: string;
    subtitle?: string;
    poster?: string;
    backdrop?: string;
    currentTime: number;
    isPlaying: boolean;
    isLive: boolean;
    tracks: any[];
    activeTrackIndex: number;
    seriesMeta?: any;
    lastUpdated: number;
  updatedBy?: string;
  };
  pinCode?: string;
  hostOnlyControl: boolean;
  activePoll: {
    id: string;
    question: string;
    createdBy: string;
    createdAt: number;
    endsAt: number;
    isClosed: boolean;
    winnerOptionId?: string;
    options: {
      id: string;
      item: any;
      voterIds: string[];
    }[];
  } | null;
  queue: any[];
  participants: {
    id: string;
    name: string;
    avatar: string;
    color: string;
    isHost: boolean;
    joinedAt: number;
  }[];
  messages: any[];
  lastTvRemoteCommand?: {
    seq: number;
    command: string;
    senderName: string;
    ts: number;
  };
  createdAt: number;
}

const ROOMS_SNAPSHOT_PATH = '/tmp/naimcine-rooms-v1.json';
const rooms = new Map<string, RoomRecord>();
const cloudSessions = new Map<string, CloudRoomSession>();
const roomPollTimers = new Map<string, ReturnType<typeof setTimeout>>();

interface TvPairingSession {
  code: string;
  ws?: WebSocket | null;
  createdAt: number;
  expiresAt: number;
  pairedPayload?: {
    roomId: string;
    roomName: string;
    tvAuthToken: string;
    claimedBy: string;
  };
}

const tvPairingSessions = new Map<string, TvPairingSession>();
const tvSocketToCode = new Map<WebSocket, string>();
const tvHttpHeartbeats = new Map<string, number>();
const tvAuthTokens = new Map<string, { roomId: string; expiresAt: number }>();

function loadPersistedRoomsFromDisk() {
  try {
    if (!fs.existsSync(ROOMS_SNAPSHOT_PATH)) return;
    const raw = fs.readFileSync(ROOMS_SNAPSHOT_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;
    const validModes = new Set(['idle', 'hls', 'direct', 'youtube', 'embed', 'cloud']);
    for (const item of parsed.slice(0, 120)) {
      if (item && typeof item.id === 'string') {
        const vs = item.videoState;
        const isInvalidOrGame =
          !vs ||
          !validModes.has(vs.mode) ||
          (typeof vs.url === 'string' && vs.url.startsWith('arcade://'));
        rooms.set(item.id, {
          ...item,
          videoState: isInvalidOrGame
            ? {
                mode: 'idle',
                url: '',
                rawSourceUrl: '',
                title: 'NAIM CINE · Elige película, serie, partido o YouTube',
                subtitle: 'Proyección sincronizada en alta definición sin anuncios',
                currentTime: 0,
                isPlaying: false,
                isLive: false,
                tracks: [],
                activeTrackIndex: 0,
                lastUpdated: Date.now(),
              }
            : vs,
          participants: [],
          activePoll: null,
        });
      }
    }
  } catch {
    // ignore corrupted snapshot
  }
}

let persistDiskTimer: ReturnType<typeof setTimeout> | null = null;
function schedulePersistRoomsToDisk() {
  if (persistDiskTimer) return;
  persistDiskTimer = setTimeout(() => {
    persistDiskTimer = null;
    try {
      const serializable = Array.from(rooms.values())
        .slice(-100)
        .map((r) => ({
          id: r.id,
          name: r.name,
          hostId: r.hostId,
          pinCode: r.pinCode,
          hostOnlyControl: r.hostOnlyControl,
          videoState:
            r.videoState.mode === 'cloud'
              ? {
                  ...r.videoState,
                  mode: 'idle' as const,
                  url: '',
                  isPlaying: false,
                }
              : r.videoState,
          queue: (r.queue || []).slice(0, 20),
          messages: (r.messages || []).slice(-60),
          createdAt: r.createdAt,
        }));
      fs.writeFileSync(ROOMS_SNAPSHOT_PATH, JSON.stringify(serializable), 'utf8');
    } catch {
      // ignore disk write error
    }
  }, 1500);
}

loadPersistedRoomsFromDisk();

function generateTvPairingCode(): string {
  const now = Date.now();
  for (const [k, session] of tvPairingSessions.entries()) {
    if (session.expiresAt <= now) {
      tvPairingSessions.delete(k);
      if (session.ws) tvSocketToCode.delete(session.ws);
    }
  }
  for (let attempt = 0; attempt < 40; attempt++) {
    const num = Math.floor(1000 + Math.random() * 9000);
    const code = String(num);
    if (!tvPairingSessions.has(code)) return code;
  }
  return String(Math.floor(1000 + Math.random() * 9000));
}

function claimTvPairingCodeCore(params: {
  rawCode: string;
  targetRoomId: string;
  roomNameHint?: string;
  claimedByRaw?: string;
}):
  | { ok: true; code: string; roomId: string; roomName: string; tvAuthToken: string }
  | { ok: false; error: string } {
  const code = String(params.rawCode || '')
    .replace(/\D/g, '')
    .slice(0, 4);
  const targetRoomId = String(params.targetRoomId || '')
    .trim()
    .toLowerCase();

  if (code.length !== 4 || !targetRoomId) {
    return {
      ok: false,
      error: 'Código de 4 dígitos no válido.',
    };
  }

  const session = tvPairingSessions.get(code);
  if (!session || session.expiresAt <= Date.now()) {
    if (session) {
      tvPairingSessions.delete(code);
      if (session.ws) tvSocketToCode.delete(session.ws);
    }
    return {
      ok: false,
      error:
        'Código no encontrado o caducado. Revisa los 4 números que aparecen en tu Smart TV.',
    };
  }

  const { room } = getOrCreateRoom(targetRoomId, params.roomNameHint);
  const tvAuthToken = crypto.randomBytes(16).toString('hex');
  tvAuthTokens.set(tvAuthToken, {
    roomId: targetRoomId,
    expiresAt: Date.now() + 2 * 60 * 60 * 1000,
  });

  const claimedBy = String(params.claimedByRaw || 'Móvil')
    .trim()
    .slice(0, 32);

  session.pairedPayload = {
    roomId: targetRoomId,
    roomName: room.name,
    tvAuthToken,
    claimedBy,
  };
  // Keep paired payload alive for 90s so HTTP-polling Samsung TVs read it reliably
  session.expiresAt = Date.now() + 90 * 1000;

  if (session.ws && session.ws.readyState === WebSocket.OPEN) {
    try {
      session.ws.send(
        JSON.stringify({
          type: 'TV_PAIRED_REDIRECT',
          payload: {
            roomId: targetRoomId,
            roomName: room.name,
            tvAuthToken,
            claimedBy,
            pairedBy: claimedBy,
          },
        })
      );
    } catch {
      // HTTP polling fallback on TV will pick up session.pairedPayload
    }
  }

  return {
    ok: true,
    code,
    roomId: targetRoomId,
    roomName: room.name,
    tvAuthToken,
  };
}

function serializeRoomForClient(room: RoomRecord) {
  const { pinCode, ...safeRoom } = room;
  return {
    ...safeRoom,
    hasPin: Boolean(pinCode),
    videoState: computeAuthoritativeVideoState(room),
  };
}

interface ClientMeta {
  ws: WebSocket;
  roomId?: string;
  roomName?: string;
  userId?: string;
  userName?: string;
  userAvatar?: string;
  userColor?: string;
  friendCode?: string;
  lastSeen?: number;
}

const clients = new Map<WebSocket, ClientMeta>();
const pendingDirectInvites = new Map<string, any[]>();

function deriveServerFriendCode(userId: string): string {
  const clean = String(userId || 'user').trim();
  let hash = 2166136261;
  for (let i = 0; i < clean.length; i += 1) {
    hash ^= clean.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).toUpperCase().padStart(5, '0').slice(-5);
}

function getOnlineUsersSnapshot() {
  const byUserId = new Map<
    string,
    {
      userId: string;
      name: string;
      avatar: string;
      color: string;
      friendCode: string;
      roomId?: string;
      roomName?: string;
      mediaTitle?: string;
      lastSeen: number;
    }
  >();

  clients.forEach((meta, clientWs) => {
    if (clientWs.readyState !== WebSocket.OPEN || !meta.userId || !meta.userName) {
      return;
    }
    if (meta.userName.includes('(TV)') || meta.userAvatar === '📺') {
      return;
    }
    const activeRoom = meta.roomId ? rooms.get(meta.roomId) : undefined;
    const activeMedia =
      activeRoom && activeRoom.videoState.mode !== 'idle'
        ? activeRoom.videoState.title
        : undefined;

    byUserId.set(meta.userId, {
      userId: meta.userId,
      name: meta.userName,
      avatar: meta.userAvatar || '🍿',
      color: meta.userColor || '#E11D48',
      friendCode: meta.friendCode || deriveServerFriendCode(meta.userId),
      roomId: meta.roomId,
      roomName: activeRoom?.name || meta.roomName,
      mediaTitle: activeMedia,
      lastSeen: meta.lastSeen || Date.now(),
    });
  });

  return Array.from(byUserId.values());
}

let broadcastPresenceTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleBroadcastOnlineUsers() {
  if (broadcastPresenceTimer) return;
  broadcastPresenceTimer = setTimeout(() => {
    broadcastPresenceTimer = null;
    const snapshot = getOnlineUsersSnapshot();
    const packet = JSON.stringify({
      type: 'ONLINE_USERS_UPDATED',
      payload: { users: snapshot },
    });
    clients.forEach((_meta, clientWs) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        try {
          clientWs.send(packet);
        } catch {
          // ignore
        }
      }
    });
  }, 150);
}

function flushPendingInvitesForClient(ws: WebSocket, userId: string, friendCode: string) {
  const now = Date.now();
  const keys = [userId, friendCode.toUpperCase()];
  for (const key of keys) {
    const list = pendingDirectInvites.get(key);
    if (!list || list.length === 0) continue;
    const valid = list.filter((inv) => now - inv.timestamp < 90000);
    pendingDirectInvites.delete(key);
    for (const inv of valid) {
      try {
        ws.send(JSON.stringify({ type: 'INCOMING_ROOM_INVITE', payload: inv }));
      } catch {
        // ignore
      }
    }
  }
}

function finalizeRoomPoll(roomId: string, expectedPollId: string) {
  const timer = roomPollTimers.get(roomId);
  if (timer) {
    clearTimeout(timer);
    roomPollTimers.delete(roomId);
  }
  const room = rooms.get(roomId);
  if (!room || !room.activePoll || room.activePoll.id !== expectedPollId || room.activePoll.isClosed) {
    return;
  }

  room.activePoll.isClosed = true;
  let bestOpt = room.activePoll.options[0];
  for (const opt of room.activePoll.options) {
    if (opt.voterIds.length > (bestOpt?.voterIds.length || 0)) {
      bestOpt = opt;
    }
  }
  room.activePoll.winnerOptionId = bestOpt?.id;

  const totalVotes = room.activePoll.options.reduce((acc, o) => acc + o.voterIds.length, 0);
  const sysMsg = {
    id: `poll-win-${Date.now()}`,
    senderId: 'system',
    senderName: 'NAIMCINE',
    senderAvatar: '🏆',
    senderColor: '#f59e0b',
    text: bestOpt
      ? `Votación cerrada (${totalVotes} voto${totalVotes === 1 ? '' : 's'}): ganó "${bestOpt.item?.title || 'Opción'}"`
      : 'Votación finalizada',
    timestamp: Date.now(),
    isSystem: true,
    systemType: 'poll',
  };
  room.messages.push(sysMsg);
  if (room.messages.length > 150) room.messages.shift();

  broadcastToRoom(roomId, {
    type: 'POLL_UPDATED',
    payload: {
      poll: room.activePoll,
      winnerItem: bestOpt?.item || null,
      justFinished: true,
      message: sysMsg,
    },
  });
}

function getOrCreateRoom(roomId: string, roomName?: string): { room: RoomRecord; isFresh: boolean } {
  const existing = rooms.get(roomId);
  if (existing) return { room: existing, isFresh: false };

  const created: RoomRecord = {
    id: roomId,
    name: roomName || `Sala ${roomId.toUpperCase()}`,
    hostId: '',
    pinCode: undefined,
    hostOnlyControl: false,
    activePoll: null,
    videoState: {
      mode: 'idle',
      url: '',
      rawSourceUrl: '',
      title: 'NAIMCINE · Elige película, serie, partido o YouTube',
      subtitle: 'Reproducción nativa HLS sincronizada sin anuncios',
      currentTime: 0,
      isPlaying: false,
      isLive: false,
      tracks: [],
      activeTrackIndex: 0,
      lastUpdated: Date.now(),
    },
    queue: [],
    participants: [],
    messages: [
      {
        id: `sys-welcome-${Date.now()}`,
        senderId: 'system',
        senderName: 'NAIMCINE',
        senderAvatar: '🎬',
        senderColor: '#e11d48',
        text: 'Bienvenido a NAIMCINE. Elige cualquier película (Español o Bingetrix EN), serie, fútbol en vivo o YouTube para ver juntos sin anuncios.',
        timestamp: Date.now(),
        isSystem: true,
      },
    ],
    createdAt: Date.now(),
  };

  rooms.set(roomId, created);
  schedulePersistRoomsToDisk();
  return { room: created, isFresh: true };
}

function computeAuthoritativeVideoState(room: RoomRecord) {
  const vs = { ...room.videoState };
  if (vs.isPlaying && !vs.isLive && (vs.mode === 'hls' || vs.mode === 'direct' || vs.mode === 'youtube')) {
    const elapsedSec = Math.max(0, (Date.now() - vs.lastUpdated) / 1000);
    vs.currentTime = vs.currentTime + elapsedSec;
  }
  return vs;
}

function broadcastToRoom(roomId: string, message: unknown, excludeWs?: WebSocket) {
  const serialized = JSON.stringify(message);
  clients.forEach((meta, clientWs) => {
    if (meta.roomId === roomId && clientWs.readyState === WebSocket.OPEN && clientWs !== excludeWs) {
      clientWs.send(serialized);
    }
  });
}

async function stopCloudSession(roomId: string) {
  const existing = cloudSessions.get(roomId);
  if (!existing) return;
  clearInterval(existing.timer);
  cloudSessions.delete(roomId);
  await existing.page.close().catch(() => {});
}

async function startCloudSession(roomId: string, targetUrl: string) {
  await stopCloudSession(roomId);

  let normalizedUrl = targetUrl.trim();
  if (!/^https?:\/\//i.test(normalizedUrl)) {
    normalizedUrl = 'https://' + normalizedUrl;
  }

  let browser: Browser;
  try {
    browser = await getSharedBrowser();
  } catch {
    return;
  }
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  await page.setUserAgent(CHROME_UA);
  await page.setRequestInterception(true);

  const session: CloudRoomSession = {
    page,
    url: normalizedUrl,
    title: normalizedUrl,
    isLoading: true,
    timer: setInterval(async () => {
      if (page.isClosed()) return;
      try {
        const base64Jpeg = await page.screenshot({ type: 'jpeg', quality: 65, encoding: 'base64' });
        broadcastToRoom(roomId, {
          type: 'CLOUD_BROWSER_FRAME',
          payload: {
            image: `data:image/jpeg;base64,${base64Jpeg}`,
            url: session.url,
            title: session.title,
            isLoading: session.isLoading,
            detectedStreamUrl: session.detectedStreamUrl,
          },
        });
      } catch {
        // ignore transient navigation screenshot errors
      }
    }, 320),
  };

  cloudSessions.set(roomId, session);

  page.on('popup', async (popupPage) => {
    if (popupPage) await popupPage.close().catch(() => {});
  });

  page.on('request', (req) => {
    const reqUrl = req.url();
    if (isBlockedAdUrl(reqUrl)) {
      req.abort().catch(() => {});
      return;
    }
    if (/\.mp4(\?|$)/i.test(reqUrl)) {
      const ref = req.headers()['referer'] || session.url;
      session.detectedStreamUrl = buildTsProxyUrl(reqUrl, ref);
    } else if (reqUrl.includes('.m3u8') || reqUrl.includes('stream_tv=')) {
      const ref = req.headers()['referer'] || session.url;
      // Verify live frame health asynchronously before exposing `detectedStreamUrl` so scrambled green satellite streams are never promoted!
      void (async () => {
        try {
          const m3uText = await fetchSportsHtmlHop(reqUrl, ref);
          if (m3uText.includes('#EXTM3U')) {
            const clean = await verifyM3u8HasCleanVideoFrame(m3uText, reqUrl, ref);
            if (!clean) return;
          }
          session.detectedStreamUrl = buildHlsProxyUrl(reqUrl, ref);
        } catch {
          // ignore
        }
      })();
    }
    req.continue().catch(() => {});
  });

  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) {
      session.url = frame.url();
      page
        .title()
        .then((t) => {
          session.title = t || session.url;
        })
        .catch(() => {});
    }
  });

  await page.evaluateOnNewDocument(() => {
    window.open = () => null;
    window.alert = () => {};
    window.confirm = () => true;
  });

  page
    .goto(normalizedUrl, { waitUntil: 'domcontentloaded', timeout: 15000 })
    .then(async () => {
      session.isLoading = false;
      session.title = (await page.title().catch(() => '')) || session.url;
    })
    .catch(() => {
      session.isLoading = false;
    });
}

wss.on('connection', (ws) => {
  clients.set(ws, { ws });

  ws.on('message', async (raw) => {
    try {
      const data = JSON.parse(raw.toString());
      const { type, payload } = data;

      if (type === 'PING') {
        const currentMeta = clients.get(ws);
        if (currentMeta) {
          currentMeta.lastSeen = Date.now();
        }
        ws.send(JSON.stringify({ type: 'PONG', payload: { clientTs: payload?.clientTs || Date.now() } }));
        return;
      }

      if (type === 'REGISTER_PRESENCE') {
        const userObj = payload?.user || {};
        const userId = String(userObj.id || payload?.userId || '').trim();
        const userName = String(userObj.name || payload?.userName || '').trim().slice(0, 40);
        const userAvatar = String(userObj.avatar || payload?.userAvatar || '🍿').slice(0, 16);
        const userColor = String(userObj.color || payload?.userColor || '#E11D48').slice(0, 16);
        if (!userId || !userName) return;

        const existingMeta = clients.get(ws) || { ws };
        const friendCode = deriveServerFriendCode(userId);
        clients.set(ws, {
          ...existingMeta,
          ws,
          userId,
          userName,
          userAvatar,
          userColor,
          friendCode,
          roomId: payload?.roomId ? String(payload.roomId).trim().toLowerCase() : existingMeta.roomId,
          roomName: payload?.roomName ? String(payload.roomName).trim().slice(0, 60) : existingMeta.roomName,
          lastSeen: Date.now(),
        });

        ws.send(
          JSON.stringify({
            type: 'ONLINE_USERS_UPDATED',
            payload: { users: getOnlineUsersSnapshot() },
          })
        );
        flushPendingInvitesForClient(ws, userId, friendCode);
        scheduleBroadcastOnlineUsers();
        return;
      }

      if (type === 'TV_REGISTER_PAIRING') {
        const requestedExisting = String(payload?.existingCode || '')
          .replace(/\D/g, '')
          .slice(0, 4);
        const now = Date.now();
        const existingSession =
          requestedExisting.length === 4 ? tvPairingSessions.get(requestedExisting) : undefined;

        let code: string;
        let expiresAt: number;

        if (existingSession && existingSession.expiresAt > now && !existingSession.pairedPayload) {
          code = existingSession.code;
          expiresAt = existingSession.expiresAt;
          existingSession.ws = ws;
          tvSocketToCode.set(ws, code);
        } else {
          const prevCode = tvSocketToCode.get(ws);
          if (prevCode) {
            const prevSession = tvPairingSessions.get(prevCode);
            if (prevSession && !prevSession.pairedPayload) {
              tvPairingSessions.delete(prevCode);
            }
          }
          code = generateTvPairingCode();
          expiresAt = now + 15 * 60 * 1000;
          tvPairingSessions.set(code, { code, ws, createdAt: now, expiresAt });
          tvSocketToCode.set(ws, code);
        }

        ws.send(
          JSON.stringify({
            type: 'TV_PAIRING_READY',
            payload: { code, expiresAt },
          })
        );
        return;
      }

      if (type === 'JOIN_ROOM') {
        const roomId = String(payload?.roomId || 'sala-naim').trim().toLowerCase();
        const userObj = payload?.user || {};
        const userId = String(userObj.id || payload?.userId || `u-${Date.now()}`);
        const userName = String(userObj.name || payload?.userName || 'Invitado').trim();
        const userAvatar = String(userObj.avatar || payload?.userAvatar || '🍿');
        const userColor = String(userObj.color || payload?.userColor || '#e11d48');

        const { room, isFresh } = getOrCreateRoom(roomId, payload?.roomName);

        // Hydrate permanent cloud room blueprint when owner re-opens an empty/fresh room
        const bp = payload?.restoredBlueprint;
        if (bp && typeof bp === 'object' && (isFresh || room.participants.length === 0)) {
          if (typeof bp.roomName === 'string' && bp.roomName.trim()) {
            room.name = bp.roomName.trim().slice(0, 60);
          }
          if (typeof bp.hostOnlyControl === 'boolean') {
            room.hostOnlyControl = bp.hostOnlyControl;
          }
          if (typeof bp.pinCode === 'string' && /^[0-9]{4}$/.test(bp.pinCode)) {
            room.pinCode = bp.pinCode;
          }
          if (Array.isArray(bp.queueItems) && room.queue.length === 0) {
            room.queue = bp.queueItems.slice(0, 12);
          }
          room.hostId = userId;
          schedulePersistRoomsToDisk();
        }

        // Validate Private Room 4-digit PIN (unless caller is existing host or paired Smart TV token)
        if (room.pinCode) {
          const incomingPin = typeof payload?.pin === 'string' ? payload.pin.trim() : '';
          const incomingTvToken =
            typeof payload?.tvAuthToken === 'string' ? payload.tvAuthToken.trim() : '';
          let validTvToken = false;
          if (incomingTvToken) {
            const tokenEntry = tvAuthTokens.get(incomingTvToken);
            if (tokenEntry && tokenEntry.roomId === roomId && tokenEntry.expiresAt > Date.now()) {
              validTvToken = true;
            }
          }

          const isReturningHost = Boolean(room.hostId && room.hostId === userId);
          if (!isReturningHost && !validTvToken && incomingPin !== room.pinCode) {
            ws.send(
              JSON.stringify({
                type: 'ROOM_PIN_REQUIRED',
                payload: {
                  roomId,
                  roomName: room.name,
                  invalidAttempt: Boolean(incomingPin),
                },
              })
            );
            return;
          }
        }

        if (!room.hostId || !room.participants.some((p) => p.id === room.hostId)) {
          room.hostId = userId;
        }

        const isHost = room.hostId === userId;
        const alreadyInRoom = room.participants.some((p) => p.id === userId);
        room.participants = room.participants.filter((p) => p.id !== userId);

        room.participants.push({
          id: userId,
          name: userName,
          avatar: userAvatar,
          color: userColor,
          isHost,
          joinedAt: Date.now(),
        });

        const friendCode = deriveServerFriendCode(userId);
        clients.set(ws, {
          ws,
          roomId,
          roomName: room.name,
          userId,
          userName,
          userAvatar,
          userColor,
          friendCode,
          lastSeen: Date.now(),
        });
        flushPendingInvitesForClient(ws, userId, friendCode);
        scheduleBroadcastOnlineUsers();

        let joinMsg = null;
        if (!alreadyInRoom) {
          joinMsg = {
            id: `join-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            senderId: 'system',
            senderName: 'NAIMCINE',
            senderAvatar: userAvatar,
            senderColor: '#10b981',
            text: `${userName} se ha unido a la sala`,
            timestamp: Date.now(),
            isSystem: true,
            systemType: 'join',
          };
          room.messages.push(joinMsg);
          if (room.messages.length > 150) room.messages.shift();
        }

        schedulePersistRoomsToDisk();

        ws.send(
          JSON.stringify({
            type: 'ROOM_STATE',
            payload: serializeRoomForClient(room),
          })
        );

        broadcastToRoom(
          roomId,
          {
            type: 'PARTICIPANTS_UPDATED',
            payload: {
              participants: room.participants,
              hostId: room.hostId,
              message: joinMsg,
            },
          },
          ws
        );
      } else if (type === 'SYNC_VIDEO_STATE') {
        const { roomId, action, videoState: incomingState, updatedBy } = payload || {};
        const room = rooms.get(roomId);
        if (!room || !incomingState) return;

        const senderMeta = clients.get(ws);
        if (
          room.hostOnlyControl &&
          room.hostId &&
          senderMeta?.userId &&
          senderMeta.userId !== room.hostId
        ) {
          const hostMember = room.participants.find((p) => p.id === room.hostId);
          ws.send(
            JSON.stringify({
              type: 'HOST_LOCK_REJECTED',
              payload: {
                videoState: computeAuthoritativeVideoState(room),
                hostName: hostMember?.name || 'el anfitrión',
              },
            })
          );
          return;
        }

        room.videoState = {
          ...room.videoState,
          ...incomingState,
          lastUpdated: Date.now(),
          updatedBy: updatedBy || 'Anfitrión',
        };

        if (room.videoState.mode !== 'cloud') {
          await stopCloudSession(roomId);
        }

        let sysMsg = null;
        if (action === 'change_url') {
          sysMsg = {
            id: `sys-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            senderId: 'system',
            senderName: 'NAIMCINE',
            senderAvatar: '🎬',
            senderColor: '#e11d48',
            text: `${updatedBy || 'Un amigo'} puso "${room.videoState.title}"`,
            timestamp: Date.now(),
            isSystem: true,
            systemType: 'video_change',
          };
          room.messages.push(sysMsg);
          if (room.messages.length > 150) room.messages.shift();
        }

        schedulePersistRoomsToDisk();

        broadcastToRoom(
          roomId,
          {
            type: 'VIDEO_STATE_UPDATED',
            payload: {
              videoState: room.videoState,
              action,
              message: sysMsg,
            },
          },
          action === 'play' || action === 'pause' || action === 'seek' ? ws : undefined
        );
        if (action === 'change_url') {
          scheduleBroadcastOnlineUsers();
        }
      } else if (type === 'QUEUE_ADD') {
        const { roomId, item } = payload || {};
        const room = rooms.get(roomId);
        if (!room || !item) return;
        room.queue = [...room.queue, item].slice(0, 30);
        const sysMsg = {
          id: `qmsg-${Date.now()}`,
          senderId: 'system',
          senderName: 'NAIMCINE',
          senderAvatar: '➕',
          senderColor: '#f59e0b',
          text: `${item.addedBy || 'Un amigo'} añadió "${item.title}" a la cola`,
          timestamp: Date.now(),
          isSystem: true,
        };
        room.messages.push(sysMsg);
        schedulePersistRoomsToDisk();
        broadcastToRoom(roomId, {
          type: 'QUEUE_UPDATED',
          payload: { queue: room.queue, message: sysMsg },
        });
      } else if (type === 'QUEUE_REMOVE') {
        const { roomId, itemId } = payload || {};
        const room = rooms.get(roomId);
        if (!room || !itemId) return;
        room.queue = room.queue.filter((q) => q.id !== itemId);
        schedulePersistRoomsToDisk();
        broadcastToRoom(roomId, {
          type: 'QUEUE_UPDATED',
          payload: { queue: room.queue },
        });
      } else if (type === 'QUEUE_PROMOTE') {
        const { roomId, itemId } = payload || {};
        const room = rooms.get(roomId);
        if (!room || !itemId) return;
        const target = room.queue.find((q) => q.id === itemId);
        if (!target) return;
        room.queue = [target, ...room.queue.filter((q) => q.id !== itemId)];
        schedulePersistRoomsToDisk();
        broadcastToRoom(roomId, {
          type: 'QUEUE_UPDATED',
          payload: { queue: room.queue },
        });
      } else if (type === 'SEND_CHAT') {
        const { roomId, text, user } = payload || {};
        const room = rooms.get(roomId);
        const cleanText = String(text || '').trim();
        if (!room || !cleanText) return;

        const msg = {
          id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          senderId: user?.id || payload?.senderId || 'anon',
          senderName: user?.name || payload?.senderName || 'Invitado',
          senderAvatar: user?.avatar || payload?.senderAvatar || '🍿',
          senderColor: user?.color || payload?.senderColor || '#e11d48',
          text: cleanText,
          timestamp: Date.now(),
        };

        room.messages.push(msg);
        if (room.messages.length > 150) room.messages.shift();

        broadcastToRoom(roomId, { type: 'NEW_CHAT_MESSAGE', payload: msg });
      } else if (type === 'SEND_REACTION') {
        const { roomId, emoji, user } = payload || {};
        if (!rooms.has(roomId) || !emoji) return;

        broadcastToRoom(roomId, {
          type: 'FLOATING_REACTION',
          payload: {
            id: `react-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            emoji,
            senderName: user?.name || 'Invitado',
            senderColor: user?.color || '#e11d48',
            xOffset: 12 + Math.floor(Math.random() * 76),
            timestamp: Date.now(),
          },
        });
      } else if (type === 'TRANSFER_HOST') {
        const { roomId, newHostId } = payload || {};
        const room = rooms.get(roomId);
        if (!room || !newHostId) return;

        room.hostId = newHostId;
        room.participants.forEach((p) => {
          p.isHost = p.id === newHostId;
        });

        const target = room.participants.find((p) => p.id === newHostId);
        const sysMsg = {
          id: `host-${Date.now()}`,
          senderId: 'system',
          senderName: 'NAIMCINE',
          senderAvatar: '👑',
          senderColor: '#eab308',
          text: `${target?.name || 'Un participante'} es ahora el anfitrión`,
          timestamp: Date.now(),
          isSystem: true,
          systemType: 'host_change',
        };
        room.messages.push(sysMsg);

        broadcastToRoom(roomId, {
          type: 'HOST_TRANSFERRED',
          payload: {
            hostId: room.hostId,
            participants: room.participants,
            message: sysMsg,
          },
        });
      } else if (type === 'UPDATE_PROFILE') {
        const { roomId, userId, userName, userAvatar, userColor } = payload || {};
        const currentMeta = clients.get(ws);
        if (currentMeta && userId) {
          if (userName) currentMeta.userName = String(userName).slice(0, 40);
          if (userAvatar) currentMeta.userAvatar = String(userAvatar).slice(0, 16);
          if (userColor) currentMeta.userColor = String(userColor).slice(0, 16);
          currentMeta.lastSeen = Date.now();
          scheduleBroadcastOnlineUsers();
        }
        const room = rooms.get(roomId);
        if (!room) return;
        const member = room.participants.find((p) => p.id === userId);
        if (member) {
          if (userName) member.name = userName;
          if (userAvatar) member.avatar = userAvatar;
          if (userColor) member.color = userColor;
          broadcastToRoom(roomId, {
            type: 'PARTICIPANTS_UPDATED',
            payload: { participants: room.participants, hostId: room.hostId },
          });
        }
      } else if (type === 'WEBRTC_SIGNAL') {
        const { roomId, signalData, targetId, senderId } = payload || {};
        broadcastToRoom(roomId, { type: 'WEBRTC_SIGNAL', payload: { signalData, targetId, senderId } }, ws);
      } else if (type === 'CLOUD_BROWSER_START') {
        const { roomId, url, updatedBy } = payload || {};
        const room = rooms.get(roomId);
        if (!room || !url) return;

        const senderMeta = clients.get(ws);
        if (
          room.hostOnlyControl &&
          room.hostId &&
          senderMeta?.userId &&
          senderMeta.userId !== room.hostId
        ) {
          const hostMember = room.participants.find((p) => p.id === room.hostId);
          ws.send(
            JSON.stringify({
              type: 'HOST_LOCK_REJECTED',
              payload: {
                videoState: computeAuthoritativeVideoState(room),
                hostName: hostMember?.name || 'el anfitrión',
              },
            })
          );
          return;
        }

        room.videoState = {
          mode: 'cloud',
          url,
          rawSourceUrl: url,
          title: `Cloud Browser · ${url}`,
          subtitle: 'Navegador aislado en servidor sin ventanas emergentes',
          currentTime: 0,
          isPlaying: true,
          isLive: true,
          tracks: [],
          activeTrackIndex: 0,
          lastUpdated: Date.now(),
          updatedBy,
        };

        broadcastToRoom(roomId, {
          type: 'VIDEO_STATE_UPDATED',
          payload: { videoState: room.videoState, action: 'change_url' },
        });

        await startCloudSession(roomId, url);
      } else if (type === 'CLOUD_BROWSER_INPUT') {
        const { roomId, input } = payload || {};
        const session = cloudSessions.get(roomId);
        if (!session || session.page.isClosed() || !input) return;

        try {
          if (input.type === 'click' && typeof input.x === 'number' && typeof input.y === 'number') {
            await session.page.mouse.click(input.x, input.y);
          } else if (input.type === 'scroll' && typeof input.deltaY === 'number') {
            await session.page.mouse.wheel({ deltaY: input.deltaY });
          } else if (input.type === 'type' && typeof input.text === 'string') {
            await session.page.keyboard.type(input.text);
          } else if (input.type === 'key' && typeof input.key === 'string') {
            await session.page.keyboard.press(input.key as any);
          } else if (input.type === 'navigate' && typeof input.url === 'string') {
            await startCloudSession(roomId, input.url);
          } else if (input.type === 'back') {
            await session.page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {});
          } else if (input.type === 'reload') {
            await session.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
          }
        } catch {
          // ignore input error during page navigation
        }
      } else if (type === 'CLOUD_BROWSER_STOP') {
        const { roomId } = payload || {};
        await stopCloudSession(roomId);
      } else if (type === 'SET_HOST_LOCK') {
        const { roomId, hostOnlyControl } = payload || {};
        const room = rooms.get(roomId);
        const senderMeta = clients.get(ws);
        if (!room || !senderMeta?.userId || senderMeta.userId !== room.hostId) return;

        room.hostOnlyControl = Boolean(hostOnlyControl);
        const sysMsg = {
          id: `lock-${Date.now()}`,
          senderId: 'system',
          senderName: 'NAIMCINE',
          senderAvatar: room.hostOnlyControl ? '🔒' : '🔓',
          senderColor: '#f59e0b',
          text: room.hostOnlyControl
            ? `${senderMeta.userName || 'El anfitrión'} activó el Modo Cineasta (solo el anfitrión controla el reproductor)`
            : `${senderMeta.userName || 'El anfitrión'} permitió control compartido en la sala`,
          timestamp: Date.now(),
          isSystem: true,
          systemType: 'lock',
        };
        room.messages.push(sysMsg);
        if (room.messages.length > 150) room.messages.shift();

        broadcastToRoom(roomId, {
          type: 'HOST_LOCK_UPDATED',
          payload: {
            hostOnlyControl: room.hostOnlyControl,
            message: sysMsg,
          },
        });
      } else if (type === 'POLL_START') {
        const { roomId, question, options, durationSec } = payload || {};
        const room = rooms.get(roomId);
        const senderMeta = clients.get(ws);
        if (!room || !Array.isArray(options) || options.length < 2) return;
        if (room.hostOnlyControl && room.hostId && senderMeta?.userId !== room.hostId) return;

        const existingTimer = roomPollTimers.get(roomId);
        if (existingTimer) {
          clearTimeout(existingTimer);
          roomPollTimers.delete(roomId);
        }

        const clampedSec = Math.max(12, Math.min(90, Number(durationSec) || 25));
        const now = Date.now();
        const pollId = `poll-${now}-${Math.random().toString(36).slice(2, 6)}`;
        room.activePoll = {
          id: pollId,
          question: String(question || '¿Qué vemos ahora en la sala?').slice(0, 80),
          createdBy: senderMeta?.userName || 'Anfitrión',
          createdAt: now,
          endsAt: now + clampedSec * 1000,
          isClosed: false,
          options: options.slice(0, 5).map((item: any, idx: number) => ({
            id: `opt-${idx + 1}`,
            item,
            voterIds: [],
          })),
        };

        const sysMsg = {
          id: `poll-start-${now}`,
          senderId: 'system',
          senderName: 'NAIMCINE',
          senderAvatar: '🗳️',
          senderColor: '#38bdf8',
          text: `${room.activePoll.createdBy} inició una votación en vivo (${clampedSec}s)`,
          timestamp: now,
          isSystem: true,
          systemType: 'poll',
        };
        room.messages.push(sysMsg);
        if (room.messages.length > 150) room.messages.shift();

        const t = setTimeout(() => {
          finalizeRoomPoll(roomId, pollId);
        }, clampedSec * 1000);
        roomPollTimers.set(roomId, t);

        broadcastToRoom(roomId, {
          type: 'POLL_UPDATED',
          payload: {
            poll: room.activePoll,
            justFinished: false,
            message: sysMsg,
          },
        });
      } else if (type === 'POLL_VOTE') {
        const { roomId, pollId, optionId } = payload || {};
        const room = rooms.get(roomId);
        const senderMeta = clients.get(ws);
        if (
          !room ||
          !room.activePoll ||
          room.activePoll.id !== pollId ||
          room.activePoll.isClosed ||
          !senderMeta?.userId
        ) {
          return;
        }

        const voterId = senderMeta.userId;
        for (const opt of room.activePoll.options) {
          opt.voterIds = opt.voterIds.filter((id) => id !== voterId);
          if (opt.id === optionId) {
            opt.voterIds.push(voterId);
          }
        }

        broadcastToRoom(roomId, {
          type: 'POLL_UPDATED',
          payload: {
            poll: room.activePoll,
            justFinished: false,
          },
        });
      } else if (type === 'POLL_CLOSE') {
        const { roomId, pollId } = payload || {};
        const room = rooms.get(roomId);
        const senderMeta = clients.get(ws);
        if (!room || !room.activePoll || room.activePoll.id !== pollId) return;
        if (room.hostId && senderMeta?.userId && senderMeta.userId !== room.hostId) return;
        finalizeRoomPoll(roomId, pollId);
      } else if (type === 'SET_ROOM_PIN') {
        const { roomId, pinCode } = payload || {};
        const room = rooms.get(roomId);
        const senderMeta = clients.get(ws);
        if (!room || !senderMeta?.userId || senderMeta.userId !== room.hostId) return;

        const cleanPin = typeof pinCode === 'string' ? pinCode.trim() : '';
        if (cleanPin && !/^[0-9]{4}$/.test(cleanPin)) return;

        room.pinCode = cleanPin || undefined;
        schedulePersistRoomsToDisk();

        const sysMsg = {
          id: `pin-${Date.now()}`,
          senderId: 'system',
          senderName: 'NAIMCINE',
          senderAvatar: room.pinCode ? '🔐' : '🔓',
          senderColor: '#f59e0b',
          text: room.pinCode
            ? `${senderMeta.userName || 'El anfitrión'} protegió la sala con un PIN privado de 4 dígitos`
            : `${senderMeta.userName || 'El anfitrión'} quitó el PIN de la sala (acceso libre con enlace)`,
          timestamp: Date.now(),
          isSystem: true,
          systemType: 'lock',
        };
        room.messages.push(sysMsg);
        if (room.messages.length > 150) room.messages.shift();

        broadcastToRoom(roomId, {
          type: 'ROOM_PIN_UPDATED',
          payload: {
            hasPin: Boolean(room.pinCode),
            message: sysMsg,
          },
        });
      } else if (type === 'RENAME_ROOM') {
        const { roomId, roomName } = payload || {};
        const room = rooms.get(roomId);
        const senderMeta = clients.get(ws);
        if (!room || !senderMeta?.userId || senderMeta.userId !== room.hostId) return;
        const cleanName = typeof roomName === 'string' ? roomName.trim().slice(0, 60) : '';
        if (!cleanName) return;

        room.name = cleanName;
        schedulePersistRoomsToDisk();

        broadcastToRoom(roomId, {
          type: 'ROOM_RENAMED',
          payload: {
            roomName: room.name,
          },
        });
      } else if (type === 'TV_CLAIM_CODE') {
        const result = claimTvPairingCodeCore({
          rawCode: payload?.code,
          targetRoomId: payload?.roomId,
          roomNameHint: payload?.roomName,
          claimedByRaw: payload?.claimedBy,
        });

        if (!result.ok) {
          ws.send(
            JSON.stringify({
              type: 'TV_CLAIM_RESULT',
              payload: {
                success: false,
                error: result.error,
              },
            })
          );
          return;
        }

        ws.send(
          JSON.stringify({
            type: 'TV_CLAIM_RESULT',
            payload: {
              success: true,
              code: result.code,
              roomId: result.roomId,
            },
          })
        );
      } else if (type === 'TV_REMOTE_COMMAND') {
        const { roomId, command, senderName } = payload || {};
        const room = rooms.get(String(roomId || '').toLowerCase());
        const senderMeta = clients.get(ws);
        if (!room || !command) return;
        if (
          room.hostOnlyControl &&
          room.hostId &&
          senderMeta?.userId &&
          senderMeta.userId !== room.hostId
        ) {
          return;
        }
        const resolvedSender = senderName || senderMeta?.userName || 'Mando móvil';
        room.lastTvRemoteCommand = {
          seq: (room.lastTvRemoteCommand?.seq || 0) + 1,
          command: String(command),
          senderName: String(resolvedSender),
          ts: Date.now(),
        };
        broadcastToRoom(room.id, {
          type: 'TV_REMOTE_COMMAND',
          payload: {
            command,
            senderName: resolvedSender,
            seq: room.lastTvRemoteCommand.seq,
          },
        });
      } else if (type === 'SEND_ROOM_INVITE') {
        const senderMeta = clients.get(ws);
        const fromUser = payload?.fromUser || {};
        const fromUserId = String(fromUser.id || senderMeta?.userId || '').trim();
        const fromUserName = String(
          fromUser.name || senderMeta?.userName || 'Tu amigo'
        )
          .trim()
          .slice(0, 40);
        const fromUserAvatar = String(
          fromUser.avatar || senderMeta?.userAvatar || '🍿'
        ).slice(0, 16);
        const fromUserColor = String(
          fromUser.color || senderMeta?.userColor || '#E11D48'
        ).slice(0, 16);

        const targetRoomId = String(payload?.roomId || senderMeta?.roomId || '')
          .trim()
          .toLowerCase();
        if (!targetRoomId) return;

        const { room } = getOrCreateRoom(targetRoomId, payload?.roomName);
        const inviteAuthToken = crypto.randomBytes(16).toString('hex');
        tvAuthTokens.set(inviteAuthToken, {
          roomId: targetRoomId,
          expiresAt: Date.now() + 2 * 60 * 60 * 1000,
        });

        const mediaTitle =
          payload?.mediaTitle ||
          (room.videoState.mode !== 'idle' ? room.videoState.title : undefined);

        const inviteObj = {
          id: `inv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          fromUserId,
          fromUserName,
          fromUserAvatar,
          fromUserColor,
          fromFriendCode: deriveServerFriendCode(fromUserId),
          roomId: targetRoomId,
          roomName: room.name || payload?.roomName || `Sala ${targetRoomId.toUpperCase()}`,
          mediaTitle,
          inviteAuthToken,
          timestamp: Date.now(),
        };

        const toUserId = String(payload?.toUserId || '').trim();
        const toFriendCode = String(payload?.toFriendCode || '')
          .trim()
          .replace(/^#/, '')
          .toUpperCase();
        const toUserNameLower = String(payload?.toUserName || '')
          .trim()
          .toLowerCase();

        let deliveredCount = 0;
        clients.forEach((meta, clientWs) => {
          if (clientWs.readyState !== WebSocket.OPEN || clientWs === ws) return;
          if (meta.userId === fromUserId) return;

          const matchById = Boolean(toUserId && meta.userId === toUserId);
          const matchByCode = Boolean(
            toFriendCode &&
              (meta.friendCode === toFriendCode ||
                deriveServerFriendCode(meta.userId || '') === toFriendCode)
          );
          const matchByName = Boolean(
            toUserNameLower &&
              meta.userName &&
              meta.userName.trim().toLowerCase() === toUserNameLower
          );

          if (matchById || matchByCode || matchByName) {
            try {
              clientWs.send(
                JSON.stringify({
                  type: 'INCOMING_ROOM_INVITE',
                  payload: inviteObj,
                })
              );
              deliveredCount += 1;
            } catch {
              // ignore
            }
          }
        });

        if (deliveredCount === 0) {
          const queueKey = toFriendCode || toUserId;
          if (queueKey) {
            const existing = pendingDirectInvites.get(queueKey) || [];
            pendingDirectInvites.set(queueKey, [...existing.slice(-4), inviteObj]);
          }
        }

        ws.send(
          JSON.stringify({
            type: 'ROOM_INVITE_SENT_ACK',
            payload: {
              toUserId,
              toUserName: payload?.toUserName || 'Amigo',
              deliveredLive: deliveredCount > 0,
            },
          })
        );
      } else if (type === 'NOTIFY_FRIEND_ADDED') {
        const senderMeta = clients.get(ws);
        const fromUser = payload?.fromUser || {};
        const fromUserId = String(fromUser.id || senderMeta?.userId || '').trim();
        const fromUserName = String(
          fromUser.name || senderMeta?.userName || 'Un amigo'
        )
          .trim()
          .slice(0, 40);
        const fromUserAvatar = String(
          fromUser.avatar || senderMeta?.userAvatar || '🍿'
        ).slice(0, 16);
        const fromUserColor = String(
          fromUser.color || senderMeta?.userColor || '#E11D48'
        ).slice(0, 16);
        if (!fromUserId) return;

        const toUserId = String(payload?.toUserId || '').trim();
        const toFriendCode = String(payload?.toFriendCode || '')
          .trim()
          .replace(/^#/, '')
          .toUpperCase();

        const noticeObj = {
          id: `fadd-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          fromUserId,
          fromUserName,
          fromUserAvatar,
          fromUserColor,
          fromFriendCode: deriveServerFriendCode(fromUserId),
          timestamp: Date.now(),
        };

        clients.forEach((meta, clientWs) => {
          if (clientWs.readyState !== WebSocket.OPEN || clientWs === ws) return;
          if (meta.userId === fromUserId) return;
          const matchById = Boolean(toUserId && meta.userId === toUserId);
          const matchByCode = Boolean(
            toFriendCode && meta.friendCode === toFriendCode
          );
          if (matchById || matchByCode) {
            try {
              clientWs.send(
                JSON.stringify({
                  type: 'INCOMING_FRIEND_ADDED',
                  payload: noticeObj,
                })
              );
            } catch {
              // ignore
            }
          }
        });
      }
    } catch (err) {
      console.error('WS message handling error:', err);
    }
  });

  ws.on('close', async () => {
    const pairedCode = tvSocketToCode.get(ws);
    if (pairedCode) {
      const sess = tvPairingSessions.get(pairedCode);
      if (sess) {
        sess.ws = null;
      }
      tvSocketToCode.delete(ws);
    }

    const meta = clients.get(ws);
    clients.delete(ws);
    scheduleBroadcastOnlineUsers();
    if (!meta?.roomId || !meta?.userId) return;

    const room = rooms.get(meta.roomId);
    if (!room) return;

    room.participants = room.participants.filter((p) => p.id !== meta.userId);
    schedulePersistRoomsToDisk();
    if (room.participants.length === 0) {
      await stopCloudSession(meta.roomId);
      return;
    }

    if (room.hostId === meta.userId) {
      room.hostId = room.participants[0].id;
      room.participants[0].isHost = true;
    }

    const leaveMsg = {
      id: `leave-${Date.now()}`,
      senderId: 'system',
      senderName: 'NAIMCINE',
      senderAvatar: '👋',
      senderColor: '#71717a',
      text: `${meta.userName || 'Un participante'} salió de la sala`,
      timestamp: Date.now(),
      isSystem: true,
      systemType: 'leave',
    };
    room.messages.push(leaveMsg);
    schedulePersistRoomsToDisk();

    broadcastToRoom(meta.roomId, {
      type: 'PARTICIPANTS_UPDATED',
      payload: {
        participants: room.participants,
        hostId: room.hostId,
        message: leaveMsg,
      },
    });
  });
});

// ============================================================================
// REST API: IMAGE, HLS MANIFEST & MPEG-TS SEGMENT STREAMING PROXIES
// ============================================================================
app.get('/api/img-proxy', async (req, res) => {
  const rawUrl = String(req.query.url || '');
  if (!rawUrl) return res.status(400).end();

  try {
    const fullUrl = rawUrl.startsWith('//') ? `https:${rawUrl}` : rawUrl;
    const upstream = await fetch(fullUrl, {
      headers: {
        Referer: 'https://movidy.pw/',
        'User-Agent': CHROME_UA,
      },
      signal: AbortSignal.timeout(6000),
    });
    if (!upstream.ok || !upstream.body) return res.status(404).end();

    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'image/webp');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    Readable.fromWeb(upstream.body as any).pipe(res);
  } catch {
    res.status(404).end();
  }
});

app.options(
  ['/api/hls-proxy', '/api/hls-proxy/:filename', '/api/ts-proxy', '/api/ts-proxy/:filename'],
  (_req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Content-Type');
    res.status(204).end();
  }
);

const tlsFallbackHosts = new Set<string>();
const vodHlsManifestCache = new Map<string, { manifest: string; ts: number }>();

function shouldBypassNodeFetch(urlStr: string): boolean {
  try {
    const host = new URL(urlStr).hostname.toLowerCase();
    if (tlsFallbackHosts.has(host)) return true;
    if (host.endsWith('.ibra.lat') || host === 'ibra.lat') return true;
    return false;
  } catch {
    return false;
  }
}

function markHostNeedsCurlFallback(urlStr: string): void {
  try {
    const host = new URL(urlStr).hostname.toLowerCase();
    if (host) tlsFallbackHosts.add(host);
  } catch {
    // ignore
  }
}

const dvbAacSegmentCache = new Map<string, { promise: Promise<Buffer>; ts: number }>();

interface DvbTranscodeTask {
  run: () => void;
  highPriority: boolean;
}
let activeDvbTranscodes = 0;
const MAX_CONCURRENT_DVB_TRANSCODES = 2;
const dvbTranscodeQueue: DvbTranscodeTask[] = [];

function scheduleDvbTranscode<T>(fn: () => Promise<T>, highPriority: boolean): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const execTask = () => {
      activeDvbTranscodes++;
      fn()
        .then(resolve, reject)
        .finally(() => {
          activeDvbTranscodes = Math.max(0, activeDvbTranscodes - 1);
          const next = dvbTranscodeQueue.shift();
          if (next) next.run();
        });
    };
    if (activeDvbTranscodes < MAX_CONCURRENT_DVB_TRANSCODES) {
      execTask();
    } else if (highPriority) {
      let insertIdx = 0;
      while (insertIdx < dvbTranscodeQueue.length && dvbTranscodeQueue[insertIdx].highPriority) {
        insertIdx++;
      }
      dvbTranscodeQueue.splice(insertIdx, 0, { run: execTask, highPriority: true });
    } else {
      dvbTranscodeQueue.push({ run: execTask, highPriority: false });
    }
  });
}

interface RollingDvbSeg {
  seq: number;
  extinf: string;
  absUrl: string;
  proxiedUrl: string;
  ts: number;
}
const dvbRollingPlaylistMap = new Map<string, RollingDvbSeg[]>();

function remuxDvbTsToAac(
  segmentUrl: string,
  referer: string,
  highPriority = false
): Promise<Buffer> {
  const now = Date.now();
  const cached = dvbAacSegmentCache.get(segmentUrl);
  if (cached && now - cached.ts < 75_000) {
    return cached.promise;
  }

  for (const [k, v] of dvbAacSegmentCache.entries()) {
    if (now - v.ts > 80_000 || dvbAacSegmentCache.size > 65) {
      dvbAacSegmentCache.delete(k);
    }
  }

  const jobPromise = (async (): Promise<Buffer> => {
    const segHeaders: Record<string, string> = {
      'User-Agent': isDvbHeadendStream(segmentUrl) ? TDT_DVB_UA : CHROME_UA,
      Accept: '*/*',
    };
    if (referer) {
      segHeaders['Referer'] = referer;
    }

    let rawBuf: Buffer | null = null;
    try {
      const resp = await fetch(segmentUrl, {
        headers: segHeaders,
        signal: AbortSignal.timeout(5000),
      });
      if (resp.ok) {
        rawBuf = Buffer.from(await resp.arrayBuffer());
      }
    } catch {
      // fallback to curl
    }

    if (!rawBuf || rawBuf.length === 0) {
      rawBuf = await curlGetBuffer(segmentUrl, segHeaders, 7);
    }
    if (!rawBuf || rawBuf.length === 0) {
      throw new Error('Empty DVB TS segment');
    }

    return await scheduleDvbTranscode(
      () =>
        new Promise<Buffer>((resolve) => {
          const ff = spawn(FFMPEG_BIN, [
            '-hide_banner',
            '-loglevel',
            'error',
            '-fflags',
            '+genpts+discardcorrupt',
            '-flags2',
            '+showall',
            '-threads',
            '2',
            '-f',
            'mpegts',
            '-i',
            'pipe:0',
            '-map',
            '0:v:0',
            '-map',
            '0:a:0?',
            '-vf',
            'field=top,scale=960:540:flags=fast_bilinear,setsar=1:1',
            '-c:v',
            'libx264',
            '-preset',
            'ultrafast',
            '-tune',
            'zerolatency',
            '-profile:v',
            'main',
            '-level',
            '3.1',
            '-pix_fmt',
            'yuv420p',
            '-bf',
            '0',
            '-g',
            '50',
            '-crf',
            '24',
            '-maxrate',
            '1600k',
            '-bufsize',
            '3200k',
            '-c:a',
            'aac',
            '-ac',
            '2',
            '-ar',
            '48000',
            '-b:a',
            '112k',
            '-copyts',
            '-muxdelay',
            '0',
            '-muxpreload',
            '0',
            '-f',
            'mpegts',
            'pipe:1',
          ]);

          const outChunks: Buffer[] = [];
          const safetyTimer = setTimeout(() => {
            try {
              ff.kill('SIGKILL');
            } catch {
              // ignore
            }
          }, 6000);

          ff.stdout.on('data', (chunk: Buffer) => outChunks.push(chunk));
          ff.on('error', () => {
            clearTimeout(safetyTimer);
            resolve(rawBuf!);
          });
          ff.on('close', (code) => {
            clearTimeout(safetyTimer);
            const remuxed = Buffer.concat(outChunks);
            if (code === 0 && remuxed.length > 512) {
              resolve(remuxed);
            } else {
              resolve(rawBuf!);
            }
          });

          ff.stdin.on('error', () => {});
          ff.stdin.end(rawBuf);
        }),
      highPriority
    );
  })();

  jobPromise.catch(() => {
    dvbAacSegmentCache.delete(segmentUrl);
  });

  dvbAacSegmentCache.set(segmentUrl, { promise: jobPromise, ts: now });
  return jobPromise;
}

// ============================================================================
// CONTINUOUS LIVE DVB-T2 PROGRESSIVE H.264 IDR + AAC RELAY ENGINE
// Fixes Spanish Atresmedia (Antena 3, laSexta, Neox, Nova, Mega, Atreseries)
// & Mediaset Open-GOP non-IDR / PAFF 1080i streams that render black on MSE/Android
// ============================================================================
interface LiveDvbRelaySession {
  key: string;
  upstreamUrl: string;
  dir: string;
  proc: ReturnType<typeof spawn>;
  startedAt: number;
  lastAccessAt: number;
  readyPromise: Promise<boolean>;
  dead: boolean;
}

const DVB_LIVE_ROOT = '/tmp/naim-dvb-live';
const liveDvbSessions = new Map<string, LiveDvbRelaySession>();

function destroyLiveDvbSession(key: string): void {
  const sess = liveDvbSessions.get(key);
  if (!sess) return;
  sess.dead = true;
  liveDvbSessions.delete(key);
  try {
    sess.proc.kill('SIGKILL');
  } catch {
    // ignore
  }
  try {
    fs.rmSync(sess.dir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

setInterval(() => {
  const now = Date.now();
  for (const [key, sess] of liveDvbSessions.entries()) {
    if (sess.dead || now - sess.lastAccessAt > 45_000) {
      destroyLiveDvbSession(key);
    }
  }
}, 12_000).unref();

async function ensureLiveDvbCleanHlsSession(
  rawUpstreamUrl: string,
  profile: 'hd' | 'fast' = 'hd'
): Promise<string | null> {
  const cleanUpstream = rawUpstreamUrl.replace(/[?&]profile=(hd|fast)\b/gi, '');
  const hash = crypto
    .createHash('sha1')
    .update(`${cleanUpstream}|${profile}`)
    .digest('hex')
    .slice(0, 14);
  const sessionKey = `dvb_${profile}_${hash}`;

  const existing = liveDvbSessions.get(sessionKey);
  if (existing && !existing.dead) {
    existing.lastAccessAt = Date.now();
    const ok = await existing.readyPromise;
    if (ok && fs.existsSync(path.join(existing.dir, 'index.m3u8'))) {
      return `/api/dvb-live/${sessionKey}/index.m3u8`;
    }
    destroyLiveDvbSession(sessionKey);
  }

  // Cap concurrent FFmpeg live transcodes to 4 (evict least-recently accessed)
  if (liveDvbSessions.size >= 4) {
    let oldestKey = '';
    let oldestAccess = Infinity;
    for (const [k, s] of liveDvbSessions.entries()) {
      if (s.lastAccessAt < oldestAccess) {
        oldestAccess = s.lastAccessAt;
        oldestKey = k;
      }
    }
    if (oldestKey) destroyLiveDvbSession(oldestKey);
  }

  const sessionDir = path.join(DVB_LIVE_ROOT, sessionKey);
  try {
    fs.rmSync(sessionDir, { recursive: true, force: true });
    fs.mkdirSync(sessionDir, { recursive: true });
  } catch {
    return null;
  }

  const playlistPath = path.join(sessionDir, 'index.m3u8');
  const segmentPattern = path.join(sessionDir, 'seg_%05d.ts');
  // Ultra-low-CPU progressive field extraction (avoids heavy yadif CPU bottleneck on 1-vCPU Cloud Run!)
  const vfFilter =
    profile === 'fast'
      ? 'field=top,scale=960:540:flags=fast_bilinear'
      : 'field=top,scale=1280:720:flags=fast_bilinear';

  const proc = spawn(FFMPEG_BIN, [
    '-hide_banner',
    '-loglevel',
    'error',
    '-user_agent',
    TDT_DVB_UA,
    '-reconnect',
    '1',
    '-reconnect_streamed',
    '1',
    '-reconnect_delay_max',
    '2',
    '-live_start_index',
    '-3',
    '-fflags',
    '+genpts+discardcorrupt',
    '-flags2',
    '+showall',
    '-threads',
    '3',
    '-i',
    cleanUpstream,
    '-map',
    '0:v:0',
    '-map',
    '0:a:0?',
    '-vf',
    vfFilter,
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-tune',
    'zerolatency',
    '-profile:v',
    'main',
    '-level',
    '3.1',
    '-pix_fmt',
    'yuv420p',
    '-r',
    '25',
    '-g',
    '50',
    '-keyint_min',
    '50',
    '-sc_threshold',
    '0',
    '-bf',
    '0',
    '-crf',
    profile === 'fast' ? '25' : '23',
    '-maxrate',
    profile === 'fast' ? '1800k' : '3000k',
    '-bufsize',
    profile === 'fast' ? '3600k' : '6000k',
    '-c:a',
    'aac',
    '-ac',
    '2',
    '-ar',
    '48000',
    '-b:a',
    '128k',
    '-f',
    'hls',
    '-hls_time',
    '2',
    '-hls_list_size',
    '8',
    '-hls_flags',
    'delete_segments+independent_segments+omit_endlist+temp_file',
    '-hls_segment_filename',
    segmentPattern,
    playlistPath,
  ]);

  const session: LiveDvbRelaySession = {
    key: sessionKey,
    upstreamUrl: cleanUpstream,
    dir: sessionDir,
    proc,
    startedAt: Date.now(),
    lastAccessAt: Date.now(),
    dead: false,
    readyPromise: Promise.resolve(false),
  };

  proc.on('exit', () => {
    session.dead = true;
  });
  proc.on('error', () => {
    session.dead = true;
  });

  session.readyPromise = new Promise<boolean>((resolve) => {
    const deadline = Date.now() + 9000;
    const poll = setInterval(() => {
      if (session.dead) {
        clearInterval(poll);
        resolve(false);
        return;
      }
      try {
        if (fs.existsSync(playlistPath)) {
          const content = fs.readFileSync(playlistPath, 'utf8');
          const segMatches = content.match(/seg_\d+\.ts/g);
          // Wait for at least 2 segments (4s buffer) so hls.js starts smoothly with zero "Cargando buffer..."!
          if (segMatches && segMatches.length >= 2) {
            clearInterval(poll);
            resolve(true);
            return;
          }
        }
      } catch {
        // wait next tick
      }
      if (Date.now() > deadline) {
        clearInterval(poll);
        destroyLiveDvbSession(sessionKey);
        resolve(false);
      }
    }, 120);
  });

  liveDvbSessions.set(sessionKey, session);
  const ready = await session.readyPromise;
  return ready ? `/api/dvb-live/${sessionKey}/index.m3u8` : null;
}

app.options(
  [
    '/api/dvb-live/:sessionKey/:filename',
    '/api/hls-proxy',
    '/api/hls-proxy/:filename',
    '/api/ts-proxy',
    '/api/ts-proxy/:filename',
  ],
  (_req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Content-Type');
    res.status(204).end();
  }
);

app.get('/api/dvb-live/:sessionKey/:filename', (req, res) => {
  const sessionKey = String(req.params.sessionKey || '').replace(/[^a-zA-Z0-9_-]/g, '');
  const filename = String(req.params.filename || '').replace(/[^a-zA-Z0-9_.-]/g, '');
  const sess = liveDvbSessions.get(sessionKey);
  if (!sess || sess.dead || !filename) {
    return res.status(404).send('Live session expired');
  }
  sess.lastAccessAt = Date.now();
  const filePath = path.join(sess.dir, filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).send('Segment not ready');
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Content-Type');
  if (filename.endsWith('.m3u8')) {
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  } else {
    res.setHeader('Content-Type', 'video/mp2t');
    res.setHeader('Cache-Control', 'public, max-age=12');
  }
  return res.sendFile(filePath);
});

app.get(['/api/hls-proxy', '/api/hls-proxy/:filename'], async (req, res) => {
  const targetUrl = String(req.query.url || '');
  const referer = String(req.query.referer || '');
  const forceAac = req.query.aac === '1' || isDvbHeadendStream(targetUrl);
  if (!targetUrl) return res.status(400).send('Missing url');

  const cachedVod = !forceAac ? vodHlsManifestCache.get(targetUrl) : undefined;
  if (cachedVod && Date.now() - cachedVod.ts < 2 * 60 * 60 * 1000) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Content-Type');
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    return res.send(cachedVod.manifest);
  }

  try {
    const headers: Record<string, string> = {
      'User-Agent': isDvbHeadendStream(targetUrl) ? TDT_DVB_UA : CHROME_UA,
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

    let baseUrl = targetUrl;
    let manifestText = '';

    if (shouldBypassNodeFetch(targetUrl)) {
      const fallback = await curlGetText(targetUrl, headers, 7);
      if (!fallback.text || !fallback.text.includes('#EXTM3U')) {
        return res.status(502).send('Upstream HLS error');
      }
      baseUrl = fallback.effectiveUrl || targetUrl;
      manifestText = fallback.text;
    } else {
      try {
        const upstream = await fetch(targetUrl, {
          headers,
          signal: AbortSignal.timeout(3500),
        });
        if (!upstream.ok) {
          throw new Error(`HTTP ${upstream.status}`);
        }
        baseUrl = upstream.url || targetUrl;
        manifestText = await upstream.text();
        if (!manifestText.includes('#EXTM3U')) {
          throw new Error('Not M3U8');
        }
      } catch {
        markHostNeedsCurlFallback(targetUrl);
        const fallback = await curlGetText(targetUrl, headers, 7);
        if (!fallback.text || !fallback.text.includes('#EXTM3U')) {
          return res.status(502).send('Upstream HLS error');
        }
        baseUrl = fallback.effectiveUrl || targetUrl;
        manifestText = fallback.text;
      }
    }

    const effectiveReferer = referer || new URL(baseUrl).origin + '/';
    const lines = manifestText.split(/\r?\n/);
    let nextLineIsVariantPlaylist = false;
    const discoveredTsUrls: string[] = [];

    const rewritten = lines.map((line) => {
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
              if (trimmed.startsWith('#EXT-X-MEDIA') || absUri.includes('.m3u8')) {
                return `URI="${buildHlsProxyUrl(absUri, effectiveReferer, forceAac)}"`;
              }
              return `URI="${buildTsProxyUrl(absUri, effectiveReferer, forceAac)}"`;
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

        if (!isPlaylist && forceAac) {
          discoveredTsUrls.push(absUrl);
        }

        return isPlaylist
          ? buildHlsProxyUrl(absUrl, effectiveReferer, forceAac)
          : buildTsProxyUrl(absUrl, effectiveReferer, forceAac);
      } catch {
        nextLineIsVariantPlaylist = false;
        return line;
      }
    });

    // Warm-prefetch ALL live DVB-T2 segments in playback order into RAM cache (~200ms/seg)
    // and extend the 5-segment (~10s) upstream playlist into a contiguous 11-segment (~25s) rolling window
    let finalManifest = rewritten.join('\n');
    if (forceAac && discoveredTsUrls.length > 0) {
      for (const segUrl of discoveredTsUrls) {
        remuxDvbTsToAac(segUrl, effectiveReferer, false).catch(() => {});
      }

      if (isDvbHeadendStream(targetUrl) && !manifestText.includes('#EXT-X-STREAM-INF')) {
        const seqMatch = manifestText.match(/#EXT-X-MEDIA-SEQUENCE:(\d+)/i);
        if (seqMatch) {
          const baseSeq = parseInt(seqMatch[1], 10);
          const nowMs = Date.now();
          const currentSegs: RollingDvbSeg[] = [];
          let pendingExtinf = '#EXTINF:2.500000,';
          let segOffset = 0;
          for (const rawLine of lines) {
            const t = rawLine.trim();
            if (!t) continue;
            if (t.startsWith('#EXTINF:')) {
              pendingExtinf = t;
            } else if (!t.startsWith('#')) {
              try {
                const abs = new URL(t, baseUrl).href;
                currentSegs.push({
                  seq: baseSeq + segOffset,
                  extinf: pendingExtinf,
                  absUrl: abs,
                  proxiedUrl: buildTsProxyUrl(abs, effectiveReferer, true),
                  ts: nowMs,
                });
                segOffset++;
              } catch {
                // ignore
              }
            }
          }

          if (currentSegs.length > 0) {
            const prevHistory = dvbRollingPlaylistMap.get(targetUrl) || [];
            const bySeq = new Map<number, RollingDvbSeg>();
            for (const oldSeg of prevHistory) {
              if (nowMs - oldSeg.ts < 65_000 && dvbAacSegmentCache.has(oldSeg.absUrl)) {
                bySeq.set(oldSeg.seq, oldSeg);
              }
            }
            for (const curSeg of currentSegs) {
              bySeq.set(curSeg.seq, curSeg);
            }

            // Walk backwards from newest segment so sequence numbers are 100% contiguous with zero gaps
            const maxSeq = currentSegs[currentSegs.length - 1].seq;
            const contiguous: RollingDvbSeg[] = [];
            for (let s = maxSeq; s > maxSeq - 11; s--) {
              const found = bySeq.get(s);
              if (!found) break;
              contiguous.unshift(found);
            }
            dvbRollingPlaylistMap.set(targetUrl, contiguous);

            if (dvbRollingPlaylistMap.size > 40) {
              const oldestChannel = dvbRollingPlaylistMap.keys().next().value;
              if (oldestChannel) dvbRollingPlaylistMap.delete(oldestChannel);
            }

            if (contiguous.length > currentSegs.length) {
              const targetDurMatch = manifestText.match(/#EXT-X-TARGETDURATION:(\d+)/i);
              const targetDur = targetDurMatch ? targetDurMatch[1] : '4';
              const headerLines = [
                '#EXTM3U',
                '#EXT-X-VERSION:3',
                `#EXT-X-MEDIA-SEQUENCE:${contiguous[0].seq}`,
                '#EXT-X-ALLOW-CACHE:YES',
                `#EXT-X-TARGETDURATION:${targetDur}`,
              ];
              for (const seg of contiguous) {
                headerLines.push(seg.extinf);
                headerLines.push(seg.proxiedUrl);
              }
              finalManifest = headerLines.join('\n') + '\n';
            }
          }
        }
      }
    }
    if (
      !forceAac &&
      (manifestText.includes('#EXT-X-ENDLIST') ||
        manifestText.includes('#EXT-X-STREAM-INF') ||
        targetUrl.includes('ibra.lat'))
    ) {
      if (vodHlsManifestCache.size > 300) {
        const oldestKey = vodHlsManifestCache.keys().next().value;
        if (oldestKey) vodHlsManifestCache.delete(oldestKey);
      }
      vodHlsManifestCache.set(targetUrl, { manifest: finalManifest, ts: Date.now() });
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Content-Type');
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.send(finalManifest);
  } catch (err) {
    console.error('HLS proxy error:', err);
    res.status(502).send('HLS proxy fetch failed');
  }
});

app.get(['/api/ts-proxy', '/api/ts-proxy/:filename'], async (req, res) => {
  const targetUrl = String(req.query.url || '');
  const referer = String(req.query.referer || '');
  const forceAac = req.query.aac === '1' || isDvbHeadendStream(targetUrl);
  if (!targetUrl) return res.status(400).end();

  const isUrlMp4 =
    /\.(m4s|mp4|cmfv|cmfa)(\?|$)/i.test(targetUrl) ||
    /\/segs\/[^/]+\/init\./i.test(targetUrl);

  if (forceAac && !isUrlMp4) {
    try {
      const remuxedBuf = await remuxDvbTsToAac(targetUrl, referer, true);
      res.status(200);
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', '*');
      res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Content-Type');
      res.setHeader('Content-Type', 'video/mp2t');
      res.setHeader('Cache-Control', 'public, max-age=20');
      res.setHeader('Content-Length', String(remuxedBuf.length));
      return res.end(remuxedBuf);
    } catch {
      return res.status(502).end();
    }
  }

  const headers: Record<string, string> = {
    'User-Agent': CHROME_UA,
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
  if (req.headers.range) {
    headers['Range'] = req.headers.range;
  }

  try {
    if (shouldBypassNodeFetch(targetUrl)) {
      throw new Error('Use fast curl/h2 fallback');
    }
    const upstream = await fetch(targetUrl, {
      headers,
      signal: AbortSignal.timeout(3500),
    });
    if (!upstream.ok || !upstream.body) {
      markHostNeedsCurlFallback(targetUrl);
      throw new Error(`TS upstream ${upstream.status}`);
    }

    res.status(upstream.status);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Content-Type');

    const rawCt = (upstream.headers.get('content-type') || '').toLowerCase();
    const isDisguisedSegment =
      !rawCt ||
      rawCt.startsWith('text/html') ||
      rawCt.startsWith('text/plain') ||
      rawCt.startsWith('image/') ||
      rawCt.startsWith('application/octet-stream');
    res.setHeader(
      'Content-Type',
      isDisguisedSegment ? (isUrlMp4 ? 'video/mp4' : 'video/mp2t') : rawCt
    );

    const cl = upstream.headers.get('content-length');
    if (cl) res.setHeader('Content-Length', cl);

    const cr = upstream.headers.get('content-range');
    if (cr) res.setHeader('Content-Range', cr);

    const ar = upstream.headers.get('accept-ranges');
    if (ar) res.setHeader('Accept-Ranges', ar);

    const nodeStream = Readable.fromWeb(upstream.body as any);
    nodeStream.on('error', () => res.end());
    req.on('close', () => nodeStream.destroy());
    nodeStream.pipe(res);
  } catch {
    markHostNeedsCurlFallback(targetUrl);
    if (res.headersSent) return res.end();
    try {
      const buf = await curlGetBuffer(targetUrl, headers, 18);
      if (!buf || buf.length === 0) {
        res.status(502).end();
        return;
      }
      // Sniff fMP4 box magic ('ftyp', 'styp', 'moof', 'sidx') at offset 4 so Cast / AirPlay / Smart TV
      // hardware video decoders always receive the exact MIME type and never drop the video track!
      const boxType = buf.length >= 8 ? buf.subarray(4, 8).toString('ascii') : '';
      const isFmp4Buffer =
        isUrlMp4 ||
        boxType === 'ftyp' ||
        boxType === 'styp' ||
        boxType === 'moof' ||
        boxType === 'sidx';

      res.status(req.headers.range ? 206 : 200);
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', '*');
      res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Content-Type');
      res.setHeader('Content-Type', isFmp4Buffer ? 'video/mp4' : 'video/mp2t');
      res.setHeader('Content-Length', String(buf.length));
      res.end(buf);
    } catch {
      if (!res.headersSent) res.status(502);
      res.end();
    }
  }
});

// ============================================================================
// REST API: MOVIES CATALOG (SPANISH CINEMA + BINGETRIX EXPLORE ENGLISH)
// ============================================================================
const MOVIE_GENRE_MAP: Record<string, number> = {
  action: 28,
  scifi: 878,
  horror: 27,
  comedy: 35,
  animation: 16,
  thriller: 53,
  adventure: 12,
  drama: 18,
};

const movieCatalogCache = new Map<string, { movies: any[]; hasMore: boolean; ts: number }>();

const MOVIDY_GENRE_SLUGS: Record<string, string> = {
  action: 'accion',
  scifi: 'ciencia-ficcion',
  horror: 'terror',
  comedy: 'comedia',
  animation: 'animacion',
  thriller: 'suspense',
  adventure: 'aventura',
  drama: 'drama',
};

async function scrapeMovidyCatalog(opts: {
  category: string;
  page: number;
  query: string;
}): Promise<{ movies: any[]; hasMore: boolean }> {
  try {
    const { category, page, query } = opts;
    let targetUrl = 'https://movidy.pw/pelis/';

    if (query) {
      targetUrl = `https://movidy.pw/?s=${encodeURIComponent(query)}`;
    } else if (MOVIDY_GENRE_SLUGS[category]) {
      const slug = MOVIDY_GENRE_SLUGS[category];
      targetUrl =
        page > 1
          ? `https://movidy.pw/genero/${slug}/page/${page}`
          : `https://movidy.pw/genero/${slug}/`;
    } else {
      targetUrl = page > 1 ? `https://movidy.pw/pelis/page/${page}` : 'https://movidy.pw/pelis/';
    }

    let html = '';
    try {
      const res = await fetch(targetUrl, {
        headers: { 'User-Agent': CHROME_UA, Referer: 'https://movidy.pw/' },
        signal: AbortSignal.timeout(4500),
      });
      if (res.ok) {
        html = await res.text();
      }
    } catch {
      const fb = await curlGetText(
        targetUrl,
        { 'User-Agent': CHROME_UA, Referer: 'https://movidy.pw/' },
        5
      ).catch(() => ({ text: '' }));
      html = fb.text;
    }

    if (!html) return { movies: [], hasMore: false };

    const itemRe =
      /<li>\s*<a\s+href="((?:https?:\/\/movidy\.[a-z]+)?\/ver\/[^"]+)"[^>]*>\s*<h3\s+class="item-title">\s*<span>([^<]+)<\/span>\s*<\/h3>\s*<img[^>]+data-src="([^"]+)"/gi;
    const movies: any[] = [];
    let m: RegExpExecArray | null;

    while ((m = itemRe.exec(html)) !== null) {
      const rawHref = String(m[1] || '').trim();
      const rawTitle = String(m[2] || '').trim();
      const rawPoster = String(m[3] || '').trim();
      if (!rawHref || !rawTitle) continue;
      const movidyUrl = rawHref.startsWith('http') ? rawHref : `https://movidy.pw${rawHref}`;

      const absPoster = rawPoster.startsWith('//')
        ? `https:${rawPoster}`
        : rawPoster.startsWith('http')
        ? rawPoster
        : `https://movidy.pw${rawPoster}`;
      const proxiedPoster = `/api/img-proxy?url=${encodeURIComponent(absPoster)}`;
      const slug =
        movidyUrl
          .split('/ver/')[1]
          ?.replace(/\//g, '')
          .replace(/[^a-zA-Z0-9_-]/g, '') || `${movies.length}`;

      movies.push({
        id: `movidy-${slug}`,
        mediaType: 'movie',
        title: rawTitle,
        originalTitle: rawTitle,
        year: 'HD',
        rating: '',
        overview:
          'Disponible en reproducción directa HLS sin anuncios en Español (Castellano, Latino y VOSE vía Movidy + Embed69).',
        poster: proxiedPoster,
        backdrop: proxiedPoster,
        movidyUrl,
        languages: ['Castellano', 'Latino', 'VOSE'],
      });
    }

    const hasNextPage = html.includes(`/page/${page + 1}`);
    return { movies, hasMore: hasNextPage && movies.length > 0 };
  } catch (err) {
    console.warn('scrapeMovidyCatalog error:', err);
    return { movies: [], hasMore: false };
  }
}

const ANIME_PROVIDER_IDS = new Set([
  'anime_all',
  'crunchyroll',
  'animebox',
  'jkanime',
  'animeflv',
]);

// Selecta Visión / AnimeBox Spain flagship TV & Movie TMDB IDs (always authentic & rich in Castellano/VOSE)
const ANIMEBOX_CURATED_TV_IDS = [
  12971, // Dragon Ball Z
  12609, // Dragon Ball
  62715, // Dragon Ball Super
  46260, // Naruto
  31910, // Naruto Shippuden
  1429, // Attack on Titan (Shingeki no Kyojin)
  203737, // Oshi no Ko
  46261, // Fairy Tail
  60863, // Haikyu!!
  42444, // Saint Seiya: Los Caballeros del Zodiaco
  30669, // Yu Yu Hakusho
  42445, // Slam Dunk
  35610, // Inuyasha
  61374, // Tokyo Ghoul
  61663, // Assassination Classroom
];

const ANIMEBOX_CURATED_MOVIE_IDS = [
  372058, // Your Name
  916224, // Suzume
  503314, // Dragon Ball Super: Broly
  149, // Akira
  378064, // A Silent Voice (La voz silenciosa)
  568160, // El tiempo contigo (Weathering with You)
  783675, // The First Slam Dunk
  635302, // Kimetsu no Yaiba: El tren infinito
];

const STREAMING_PROVIDER_MAP: Record<
  string,
  {
    id: string;
    label: string;
    watchProviders: string;
    tvNetworks: string;
    movieCompanies?: string;
    isAnimePortal?: boolean;
    watchRegion?: string;
  }
> = {
  netflix: {
    id: 'netflix',
    label: 'Netflix',
    watchProviders: '8|1796',
    tvNetworks: '213',
  },
  hbomax: {
    id: 'hbomax',
    label: 'HBO Max',
    watchProviders: '1899|1825|384',
    tvNetworks: '49|3186',
    movieCompanies: '174|49',
  },
  disney: {
    id: 'disney',
    label: 'Disney+',
    watchProviders: '337',
    tvNetworks: '2739|453|88',
    movieCompanies: '2|3|420|1',
  },
  prime: {
    id: 'prime',
    label: 'Prime Video',
    watchProviders: '119|2100',
    tvNetworks: '1024',
    movieCompanies: '1024|20580',
  },
  apple: {
    id: 'apple',
    label: 'Apple TV+',
    watchProviders: '350|2243',
    tvNetworks: '2552',
    movieCompanies: '194232',
  },
  movistar: {
    id: 'movistar',
    label: 'Movistar+',
    watchProviders: '2241|149',
    tvNetworks: '678',
  },
  skyshowtime: {
    id: 'skyshowtime',
    label: 'SkyShowtime',
    watchProviders: '1773|2801',
    tvNetworks: '4330|67',
  },
  anime_all: {
    id: 'anime_all',
    label: 'Anime',
    watchProviders: '',
    tvNetworks: '',
    isAnimePortal: true,
  },
  crunchyroll: {
    id: 'crunchyroll',
    label: 'Crunchyroll',
    watchProviders: '283|1968',
    tvNetworks: '1112',
    isAnimePortal: true,
    watchRegion: 'US',
  },
  animebox: {
    id: 'animebox',
    label: 'AnimeBox',
    watchProviders: '2735',
    tvNetworks: '',
    isAnimePortal: true,
    watchRegion: 'ES',
  },
  jkanime: {
    id: 'jkanime',
    label: 'JKAnime',
    watchProviders: '',
    tvNetworks: '',
    isAnimePortal: true,
  },
  animeflv: {
    id: 'animeflv',
    label: 'AnimeFLV',
    watchProviders: '',
    tvNetworks: '',
    isAnimePortal: true,
  },
};

function resolveEffectiveProviderAndQuery(
  rawProvider: string,
  rawQuery: string
): { provider: string; query: string } {
  const cleanProvider = String(rawProvider || 'all').toLowerCase().trim();
  const cleanQuery = String(rawQuery || '').trim();
  const normQ = cleanQuery.toLowerCase().replace(/\s+/g, ' ');

  if (normQ === 'netflix') return { provider: 'netflix', query: '' };
  if (normQ === 'hbo' || normQ === 'hbo max' || normQ === 'hbomax' || normQ === 'max') {
    return { provider: 'hbomax', query: '' };
  }
  if (normQ === 'disney' || normQ === 'disney+' || normQ === 'disney plus') {
    return { provider: 'disney', query: '' };
  }
  if (
    normQ === 'prime' ||
    normQ === 'prime video' ||
    normQ === 'amazon' ||
    normQ === 'amazon prime'
  ) {
    return { provider: 'prime', query: '' };
  }
  if (normQ === 'apple tv' || normQ === 'apple tv+' || normQ === 'apple') {
    return { provider: 'apple', query: '' };
  }
  if (normQ === 'movistar' || normQ === 'movistar+' || normQ === 'movistar plus') {
    return { provider: 'movistar', query: '' };
  }
  if (normQ === 'skyshowtime') {
    return { provider: 'skyshowtime', query: '' };
  }
  if (normQ === 'crunchyroll') {
    return { provider: 'crunchyroll', query: '' };
  }
  if (normQ === 'animebox' || normQ === 'anime box') {
    return { provider: 'animebox', query: '' };
  }
  if (normQ === 'jkanime' || normQ === 'jk anime') {
    return { provider: 'jkanime', query: '' };
  }
  if (normQ === 'animeflv' || normQ === 'anime flv') {
    return { provider: 'animeflv', query: '' };
  }
  if (normQ === 'anime') {
    return { provider: 'anime_all', query: '' };
  }

  return {
    provider: STREAMING_PROVIDER_MAP[cleanProvider] ? cleanProvider : 'all',
    query: cleanQuery,
  };
}

const ANIME_MOVIE_GENRE_EXTRAS: Record<string, string> = {
  shonen: '16,28',
  action: '16,28',
  fantasy: '16,14',
  scifi: '16,878',
  comedy: '16,35',
  drama: '16,18',
};

async function fetchTmdbItemsByIds(
  ids: number[],
  mediaType: 'movie' | 'tv',
  lang: 'es-ES' | 'en-US'
): Promise<any[]> {
  const results = await Promise.all(
    ids.map((id) =>
      fetch(
        `https://api.themoviedb.org/3/${mediaType}/${id}?api_key=${TMDB_API_KEY}&language=${lang}`,
        { signal: AbortSignal.timeout(3500) }
      )
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)
    )
  );
  return results.filter((x) => x && x.id && (x.poster_path || x.backdrop_path));
}

async function fetchTmdbMovieCatalog(opts: {
  lang: 'es-ES' | 'en-US';
  category: string;
  page: number;
  query: string;
  provider?: string;
}) {
  const { lang, category, page } = opts;
  const { provider, query } = resolveEffectiveProviderAndQuery(opts.provider || 'all', opts.query);
  const provCfg = STREAMING_PROVIDER_MAP[provider];
  const isAnime = ANIME_PROVIDER_IDS.has(provider);

  const cacheKey = `v5|${lang}|${provider}|${category}|${page}|${query}`;
  const cached = movieCatalogCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < 5 * 60 * 1000) {
    return cached;
  }

  const todayIso = new Date().toISOString().slice(0, 10);
  let endpoint = '';
  let curatedSeedItems: any[] = [];

  if (query) {
    endpoint = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&language=${lang}&query=${encodeURIComponent(query)}&page=${page}&include_adult=false`;
  } else if (isAnime) {
    const animeGenres = ANIME_MOVIE_GENRE_EXTRAS[category] || '16';
    const sortBy =
      category === 'top_rated'
        ? 'vote_average.desc'
        : category === 'simulcast' || category === 'now_playing' || provider === 'jkanime'
        ? 'primary_release_date.desc'
        : provider === 'animeflv' && category === 'trending'
        ? 'vote_count.desc'
        : 'popularity.desc';
    const minVotes =
      category === 'top_rated'
        ? 180
        : sortBy === 'primary_release_date.desc'
        ? 15
        : 45;

    if (provider === 'crunchyroll') {
      endpoint = `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_API_KEY}&language=${lang}&watch_region=US&with_watch_providers=283&with_watch_monetization_types=${encodeURIComponent(
        'flatrate|ads|free'
      )}&with_genres=${animeGenres}&with_original_language=ja&sort_by=${sortBy}&vote_count.gte=15&primary_release_date.lte=${todayIso}&page=${page}&include_adult=false`;
    } else if (provider === 'animebox') {
      if (page === 1 && (category === 'trending' || category === 'popular')) {
        curatedSeedItems = await fetchTmdbItemsByIds(ANIMEBOX_CURATED_MOVIE_IDS, 'movie', lang);
      }
      endpoint = `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_API_KEY}&language=${lang}&watch_region=ES&with_genres=${animeGenres}&with_original_language=ja&sort_by=${sortBy}&vote_count.gte=${minVotes}&primary_release_date.lte=${todayIso}&page=${page}&include_adult=false`;
    } else {
      endpoint = `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_API_KEY}&language=${lang}&with_genres=${animeGenres}&with_original_language=ja&sort_by=${sortBy}&vote_count.gte=${minVotes}&primary_release_date.lte=${todayIso}&page=${page}&include_adult=false`;
    }
  } else if (provCfg) {
    const sortBy =
      category === 'top_rated'
        ? 'vote_average.desc'
        : category === 'now_playing'
        ? 'primary_release_date.desc'
        : 'popularity.desc';
    const minVotes = category === 'top_rated' ? 300 : 120;
    const genreParam = MOVIE_GENRE_MAP[category] ? `&with_genres=${MOVIE_GENRE_MAP[category]}` : '';
    const companyParam =
      category === 'originals' && provCfg.movieCompanies
        ? `&with_companies=${encodeURIComponent(provCfg.movieCompanies)}`
        : '';
    endpoint = `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_API_KEY}&language=${lang}&watch_region=ES&with_watch_providers=${encodeURIComponent(
      provCfg.watchProviders
    )}&with_watch_monetization_types=${encodeURIComponent(
      'flatrate|ads|free'
    )}&sort_by=${sortBy}&vote_count.gte=${minVotes}&primary_release_date.lte=${todayIso}${genreParam}${companyParam}&page=${page}&include_adult=false`;
  } else if (category === 'popular') {
    endpoint = `https://api.themoviedb.org/3/movie/popular?api_key=${TMDB_API_KEY}&language=${lang}&page=${page}`;
  } else if (category === 'top_rated') {
    endpoint = `https://api.themoviedb.org/3/movie/top_rated?api_key=${TMDB_API_KEY}&language=${lang}&page=${page}`;
  } else if (category === 'now_playing') {
    endpoint = `https://api.themoviedb.org/3/movie/now_playing?api_key=${TMDB_API_KEY}&language=${lang}&page=${page}`;
  } else if (MOVIE_GENRE_MAP[category]) {
    endpoint = `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_API_KEY}&language=${lang}&sort_by=popularity.desc&vote_count.gte=45&primary_release_date.lte=${todayIso}&with_genres=${MOVIE_GENRE_MAP[category]}&page=${page}&include_adult=false`;
  } else {
    endpoint = `https://api.themoviedb.org/3/trending/movie/week?api_key=${TMDB_API_KEY}&language=${lang}&page=${page}`;
  }

  let res = await fetch(endpoint, { signal: AbortSignal.timeout(5000) });
  let json: any = res.ok ? await res.json() : { results: [], total_pages: 1 };
  let results: any[] = Array.isArray(json?.results) ? json.results : [];
  let totalPages = Number(json?.total_pages || 1);

  // Fallback for Crunchyroll movie sub-genres if US watch_provider filter is sparse
  if (isAnime && provider === 'crunchyroll' && !query && results.length < 4) {
    const animeGenres = ANIME_MOVIE_GENRE_EXTRAS[category] || '16';
    const fbRes = await fetch(
      `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_API_KEY}&language=${lang}&with_genres=${animeGenres}&with_original_language=ja&sort_by=popularity.desc&vote_count.gte=30&primary_release_date.lte=${todayIso}&page=${page}&include_adult=false`,
      { signal: AbortSignal.timeout(4500) }
    ).catch(() => null);
    if (fbRes?.ok) {
      const fbJson: any = await fbRes.json();
      if (Array.isArray(fbJson?.results) && fbJson.results.length > results.length) {
        results = fbJson.results;
        totalPages = Number(fbJson?.total_pages || 1);
      }
    }
  }

  const mergedRaw: any[] = [];
  const seenIds = new Set<number>();
  for (const item of [...curatedSeedItems, ...results]) {
    if (item?.id && !seenIds.has(item.id)) {
      seenIds.add(item.id);
      mergedRaw.push(item);
    }
  }

  const isEn = lang === 'en-US';
  const movies = mergedRaw
    .filter((m) => {
      if (!m || !m.id || (!m.poster_path && !m.backdrop_path)) return false;
      if (isAnime && query) {
        const gIds: number[] = Array.isArray(m.genre_ids) ? m.genre_ids : [];
        const isJa = String(m.original_language || '').toLowerCase() === 'ja';
        if (!gIds.includes(16) && !isJa) return false;
      }
      if (!query && !isAnime) {
        if (Number(m.vote_count || 0) < 35 || Number(m.vote_average || 0) <= 0) {
          return false;
        }
        if (m.release_date && String(m.release_date) > todayIso) {
          return false;
        }
      }
      return true;
    })
    .map((m) => ({
      id: `${isEn ? 'bingetrix' : 'es'}-${provider}-movie-${m.id}`,
      tmdbId: m.id,
      mediaType: 'movie',
      title: m.title || m.original_title || 'Película',
      originalTitle: m.original_title || m.title || '',
      year: m.release_date ? String(m.release_date).split('-')[0] : 'HD',
      rating: m.vote_average ? Number(m.vote_average).toFixed(1) : '',
      overview:
        m.overview ||
        (isAnime
          ? 'Película de anime disponible en Español, Latino y VOSE (Japonés Sub Español) en 1080p.'
          : isEn
          ? 'Available in 1080p Original English ad-free HLS streaming.'
          : 'Disponible en reproducción directa HLS sin anuncios (Castellano, Latino y VO Inglés 1080p).'),
      poster: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : '',
      backdrop: m.backdrop_path ? `https://image.tmdb.org/t/p/w1280${m.backdrop_path}` : '',
      bingetrixUrl: `https://bingetrix.sc/watch/${m.id}`,
      languages: isAnime
        ? ['Español', 'VOSE · Sub', 'EN']
        : isEn
        ? ['English 1080p', 'ES / LAT']
        : ['Castellano', 'Latino', 'EN'],
      platform: provCfg?.label,
      providerId: provCfg ? provider : undefined,
    }));

  const payload = {
    movies,
    hasMore: page < totalPages && movies.length > 0,
    ts: Date.now(),
  };
  movieCatalogCache.set(cacheKey, payload);
  return payload;
}

app.get('/api/catalog/movies', async (req, res) => {
  try {
    const rawQuery = String(req.query.query || '').trim();
    const rawProvider = String(req.query.provider || 'all').toLowerCase().trim();
    const { provider, query } = resolveEffectiveProviderAndQuery(rawProvider, rawQuery);
    const category = String(req.query.category || 'trending').toLowerCase();
    const page = Math.max(1, Math.min(100, parseInt(String(req.query.page || '1'), 10) || 1));

    const mergedCacheKey = `merged-es-v4|${provider}|${category}|${page}|${query}`;
    const cachedMerged = movieCatalogCache.get(mergedCacheKey);
    if (cachedMerged && Date.now() - cachedMerged.ts < 5 * 60 * 1000) {
      return res.json({
        success: true,
        movies: cachedMerged.movies,
        hasMore: cachedMerged.hasMore,
        page,
      });
    }

    // When a specific streaming platform or anime portal is active, serve its TMDB catalog directly
    if ((STREAMING_PROVIDER_MAP[provider] && !query) || ANIME_PROVIDER_IDS.has(provider)) {
      const tmdbData = await fetchTmdbMovieCatalog({
        lang: 'es-ES',
        category,
        page,
        query: '',
        provider,
      });
      movieCatalogCache.set(mergedCacheKey, {
        movies: tmdbData.movies,
        hasMore: tmdbData.hasMore,
        ts: Date.now(),
      });
      return res.json({
        success: true,
        movies: tmdbData.movies,
        hasMore: tmdbData.hasMore,
        page,
      });
    }

    const [movidyData, tmdbData] = await Promise.all([
      scrapeMovidyCatalog({ category, page, query }),
      fetchTmdbMovieCatalog({ lang: 'es-ES', category, page, query, provider }),
    ]);

    const tmdbByNormTitle = new Map<string, any>();
    for (const tm of tmdbData.movies) {
      const kTitle = normalizeTitleForMatch(tm.title);
      const kOrig = normalizeTitleForMatch(tm.originalTitle || '');
      if (kTitle && !tmdbByNormTitle.has(kTitle)) tmdbByNormTitle.set(kTitle, tm);
      if (kOrig && !tmdbByNormTitle.has(kOrig)) tmdbByNormTitle.set(kOrig, tm);
    }

    const seenNormTitles = new Set<string>();
    const combinedMovies: any[] = [];

    // 1. Place Movidy Spanish catalog movies FIRST so every top Spanish movie has guaranteed Castellano / Latino / VOSE streams
    for (const mv of movidyData.movies) {
      const kFull = normalizeTitleForMatch(mv.title);
      const kOutside = normalizeTitleForMatch(String(mv.title || '').replace(/\s*\([^)]*\)/g, ''));
      const kInside = normalizeTitleForMatch(String(mv.title || '').match(/\(([^)]+)\)/)?.[1] || '');

      if (
        (kFull && seenNormTitles.has(kFull)) ||
        (kOutside && seenNormTitles.has(kOutside))
      ) {
        continue;
      }
      if (kFull) seenNormTitles.add(kFull);
      if (kOutside) seenNormTitles.add(kOutside);
      if (kInside) seenNormTitles.add(kInside);

      const matchedTmdb =
        (kFull ? tmdbByNormTitle.get(kFull) : undefined) ||
        (kOutside ? tmdbByNormTitle.get(kOutside) : undefined) ||
        (kInside ? tmdbByNormTitle.get(kInside) : undefined);

      if (matchedTmdb) {
        const kTitle = normalizeTitleForMatch(matchedTmdb.title || '');
        const kOrig = normalizeTitleForMatch(matchedTmdb.originalTitle || '');
        if (kTitle) seenNormTitles.add(kTitle);
        if (kOrig) seenNormTitles.add(kOrig);
        combinedMovies.push({
          ...matchedTmdb,
          id: mv.id,
          title: mv.title,
          poster: mv.poster || matchedTmdb.poster,
          backdrop: matchedTmdb.backdrop || mv.poster,
          movidyUrl: mv.movidyUrl,
          bingetrixUrl: matchedTmdb.bingetrixUrl,
          languages: ['Castellano', 'Latino', 'VOSE', 'EN'],
        });
      } else {
        combinedMovies.push(mv);
      }
    }

    // 2. Append verified released TMDB Spanish movies (backed by Embed69 + Movidy search + Bingetrix)
    for (const tm of tmdbData.movies) {
      const kTitle = normalizeTitleForMatch(tm.title);
      const kOrig = normalizeTitleForMatch(tm.originalTitle || '');
      if ((kTitle && seenNormTitles.has(kTitle)) || (kOrig && seenNormTitles.has(kOrig))) {
        continue;
      }
      if (kTitle) seenNormTitles.add(kTitle);
      if (kOrig) seenNormTitles.add(kOrig);
      combinedMovies.push(tm);
    }

    const hasMore = Boolean(movidyData.hasMore || tmdbData.hasMore);
    movieCatalogCache.set(mergedCacheKey, {
      movies: combinedMovies,
      hasMore,
      ts: Date.now(),
    });

    res.json({ success: true, movies: combinedMovies, hasMore, page });
  } catch (err) {
    console.error('Spanish movies catalog error:', err);
    res.status(500).json({ success: false, movies: [], hasMore: false });
  }
});

app.get('/api/catalog/bingetrix', async (req, res) => {
  try {
    const query = String(req.query.query || '').trim();
    const provider = String(req.query.provider || 'all').toLowerCase().trim();
    const category = String(req.query.category || 'trending').toLowerCase();
    const page = Math.max(1, Math.min(100, parseInt(String(req.query.page || '1'), 10) || 1));

    const data = await fetchTmdbMovieCatalog({
      lang: 'en-US',
      category,
      page,
      query,
      provider,
    });
    res.json({ success: true, movies: data.movies, hasMore: data.hasMore, page });
  } catch (err) {
    console.error('Bingetrix catalog error:', err);
    res.status(500).json({ success: false, movies: [], hasMore: false });
  }
});

// ============================================================================
// REST API: TV SERIES CATALOG + SEASONS & EPISODES EXPLORER
// ============================================================================
const SERIES_GENRE_MAP: Record<string, number> = {
  action: 10759,
  scifi: 10765,
  drama: 18,
  crime: 80,
  comedy: 35,
  animation: 16,
  mystery: 9648,
};

const seriesCatalogCache = new Map<string, { series: any[]; hasMore: boolean; ts: number }>();
const movidyTvTmdbCache = new Map<string, any | null>();

async function resolveMovidyShowToTmdbSeries(rawItem: {
  title: string;
  movidyUrl: string;
  poster: string;
  verifyShowOnMovidy?: boolean;
}): Promise<any | null> {
  const cacheKey = rawItem.movidyUrl || normalizeTitleForMatch(rawItem.title);
  if (movidyTvTmdbCache.has(cacheKey)) {
    return movidyTvTmdbCache.get(cacheKey) || null;
  }

  try {
    if (rawItem.verifyShowOnMovidy && rawItem.movidyUrl) {
      const pageRes = await fetch(rawItem.movidyUrl, {
        headers: { 'User-Agent': CHROME_UA, Referer: 'https://movidy.pw/' },
        signal: AbortSignal.timeout(3200),
      });
      if (!pageRes.ok) {
        movidyTvTmdbCache.set(cacheKey, null);
        return null;
      }
      const pageHtml = await pageRes.text();
      if (!pageHtml.includes('id="eps"')) {
        movidyTvTmdbCache.set(cacheKey, null);
        return null;
      }
    }

    const cleanTitle = String(rawItem.title || '').replace(/\s*\([^)]*\)/g, '').trim();
    const parenTitle = (String(rawItem.title || '').match(/\(([^)]+)\)/)?.[1] || '').trim();
    const candidates = [cleanTitle, parenTitle].filter((c) => c.length >= 2);

    let bestMatch: any = null;
    for (const q of candidates) {
      const tRes = await fetch(
        `https://api.themoviedb.org/3/search/tv?api_key=${TMDB_API_KEY}&language=es-ES&query=${encodeURIComponent(
          q
        )}&page=1&include_adult=false`,
        { signal: AbortSignal.timeout(3500) }
      );
      if (!tRes.ok) continue;
      const tJson: any = await tRes.json();
      const results: any[] = Array.isArray(tJson?.results) ? tJson.results : [];
      if (results.length === 0) continue;

      const normQ = normalizeTitleForMatch(q);
      bestMatch =
        results.find(
          (r) =>
            normalizeTitleForMatch(r.name || '') === normQ ||
            normalizeTitleForMatch(r.original_name || '') === normQ
        ) || results[0];
      if (bestMatch) break;
    }

    if (!bestMatch?.id) {
      movidyTvTmdbCache.set(cacheKey, null);
      return null;
    }

    const resolved = {
      id: `tv-es-ES-${bestMatch.id}`,
      tmdbId: bestMatch.id,
      mediaType: 'tv',
      title: bestMatch.name || rawItem.title || bestMatch.original_name || 'Serie',
      originalTitle: bestMatch.original_name || bestMatch.name || rawItem.title || '',
      year: bestMatch.first_air_date
        ? String(bestMatch.first_air_date).split('-')[0]
        : 'TV',
      rating: bestMatch.vote_average ? Number(bestMatch.vote_average).toFixed(1) : '',
      overview:
        bestMatch.overview ||
        'Serie disponible en Castellano, Español Latino y VOSE por temporadas y episodios en HD.',
      poster: bestMatch.poster_path
        ? `https://image.tmdb.org/t/p/w500${bestMatch.poster_path}`
        : rawItem.poster,
      backdrop: bestMatch.backdrop_path
        ? `https://image.tmdb.org/t/p/w1280${bestMatch.backdrop_path}`
        : rawItem.poster,
      movidyUrl: rawItem.movidyUrl,
      languages: ['Español', 'VOSE'],
    };

    movidyTvTmdbCache.set(cacheKey, resolved);
    return resolved;
  } catch {
    movidyTvTmdbCache.set(cacheKey, null);
    return null;
  }
}

async function scrapeMovidySeriesCatalog(opts: {
  category: string;
  page: number;
  query: string;
}): Promise<{ series: any[]; hasMore: boolean }> {
  const { category, page, query } = opts;
  if (!query && category !== 'trending' && category !== 'popular') {
    return { series: [], hasMore: false };
  }

  try {
    const targetUrl = query
      ? page > 1
        ? `https://movidy.pw/page/${page}/?s=${encodeURIComponent(query)}`
        : `https://movidy.pw/?s=${encodeURIComponent(query)}`
      : page > 1
      ? `https://movidy.pw/shows/page/${page}`
      : 'https://movidy.pw/shows/';

    let html = '';
    try {
      const res = await fetch(targetUrl, {
        headers: { 'User-Agent': CHROME_UA, Referer: 'https://movidy.pw/' },
        signal: AbortSignal.timeout(4500),
      });
      if (res.ok) html = await res.text();
    } catch {
      const fb = await curlGetText(
        targetUrl,
        { 'User-Agent': CHROME_UA, Referer: 'https://movidy.pw/' },
        5
      ).catch(() => ({ text: '' }));
      html = fb.text;
    }

    if (!html) return { series: [], hasMore: false };

    const itemRe =
      /<li>\s*<a\s+href="((?:https?:\/\/movidy\.[a-z]+)?\/ver\/[^"]+)"[^>]*>\s*<h3\s+class="item-title">\s*<span>([^<]+)<\/span>\s*<\/h3>\s*<img[^>]+data-src="([^"]+)"/gi;
    const rawItems: {
      title: string;
      movidyUrl: string;
      poster: string;
      verifyShowOnMovidy: boolean;
    }[] = [];

    let m: RegExpExecArray | null;
    while ((m = itemRe.exec(html)) !== null && rawItems.length < 18) {
      const rawHref = String(m[1] || '').trim();
      const rawTitle = String(m[2] || '').trim();
      const rawPoster = String(m[3] || '').trim();
      if (!rawHref || !rawTitle) continue;

      const movidyUrl = rawHref.startsWith('http')
        ? rawHref
        : `https://movidy.pw${rawHref}`;
      const absPoster = rawPoster.startsWith('//')
        ? `https:${rawPoster}`
        : rawPoster.startsWith('http')
        ? rawPoster
        : `https://movidy.pw${rawPoster}`;
      const proxiedPoster = `/api/img-proxy?url=${encodeURIComponent(absPoster)}`;

      rawItems.push({
        title: rawTitle,
        movidyUrl,
        poster: proxiedPoster,
        verifyShowOnMovidy: Boolean(query),
      });
    }

    const resolvedList = await Promise.all(
      rawItems.map((it) => resolveMovidyShowToTmdbSeries(it))
    );
    const series = resolvedList.filter(Boolean);
    const hasNextPage = html.includes(`/page/${page + 1}`);
    return { series, hasMore: hasNextPage && series.length > 0 };
  } catch (err) {
    console.warn('scrapeMovidySeriesCatalog error:', err);
    return { series: [], hasMore: false };
  }
}

app.get('/api/catalog/series', async (req, res) => {
  try {
    const rawQuery = String(req.query.query || '').trim();
    const rawProvider = String(req.query.provider || 'all').toLowerCase().trim();
    const { provider, query } = resolveEffectiveProviderAndQuery(rawProvider, rawQuery);
    const provCfg = STREAMING_PROVIDER_MAP[provider];
    const isAnime = ANIME_PROVIDER_IDS.has(provider);
    const category = String(req.query.category || 'trending').toLowerCase();
    const langParam = String(req.query.lang || 'es').toLowerCase() === 'en' ? 'en-US' : 'es-ES';
    const isSpanishCatalog = langParam === 'es-ES';
    const page = Math.max(1, Math.min(100, parseInt(String(req.query.page || '1'), 10) || 1));

    const cacheKey = `v5|${langParam}|${provider}|${category}|${page}|${query}`;
    const cached = seriesCatalogCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < 5 * 60 * 1000) {
      return res.json({ success: true, series: cached.series, hasMore: cached.hasMore, page });
    }

    const todayIso = new Date().toISOString().slice(0, 10);
    const recentSimulcastIso = new Date(Date.now() - 75 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    let endpoint = '';
    let originalsBoostEndpoint = '';
    let curatedAnimeSeedPromise: Promise<any[]> = Promise.resolve([]);

    const ANIME_SERIES_GENRES: Record<string, string> = {
      shonen: '16,10759',
      action: '16,10759',
      fantasy: '16,10765',
      scifi: '16,10765',
      comedy: '16,35',
      drama: '16,18',
      mystery: '16,9648',
    };

    if (query) {
      endpoint = `https://api.themoviedb.org/3/search/tv?api_key=${TMDB_API_KEY}&language=${langParam}&query=${encodeURIComponent(query)}&page=${page}&include_adult=false`;
    } else if (isAnime) {
      const animeGenreStr = ANIME_SERIES_GENRES[category] || '16';
      const isSimulcastMode =
        category === 'simulcast' || (provider === 'jkanime' && category === 'trending');
      const sortBy =
        category === 'top_rated'
          ? 'vote_average.desc'
          : provider === 'animeflv' && category === 'trending'
          ? 'vote_count.desc'
          : 'popularity.desc';
      const minVotes = category === 'top_rated' ? 200 : isSimulcastMode ? 8 : 30;
      const simulcastFilter = isSimulcastMode
        ? `&air_date.gte=${recentSimulcastIso}&air_date.lte=${todayIso}`
        : `&first_air_date.lte=${todayIso}`;

      if (provider === 'crunchyroll') {
        endpoint = `https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_API_KEY}&language=${langParam}&watch_region=US&with_watch_providers=${encodeURIComponent(
          '283|1968'
        )}&with_watch_monetization_types=${encodeURIComponent(
          'flatrate|ads|free'
        )}&with_genres=${animeGenreStr}&with_origin_country=JP&sort_by=${sortBy}&vote_count.gte=${minVotes}${simulcastFilter}&page=${page}&include_adult=false`;

        if (page === 1 && category === 'trending') {
          originalsBoostEndpoint = `https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_API_KEY}&language=${langParam}&watch_region=ES&with_watch_providers=${encodeURIComponent(
            '283|1968'
          )}&with_watch_monetization_types=${encodeURIComponent(
            'flatrate|ads|free'
          )}&with_genres=16&with_origin_country=JP&sort_by=popularity.desc&vote_count.gte=25&page=1&include_adult=false`;
        }
      } else if (provider === 'animebox') {
        if (page === 1 && (category === 'trending' || category === 'popular')) {
          curatedAnimeSeedPromise = fetchTmdbItemsByIds(
            ANIMEBOX_CURATED_TV_IDS,
            'tv',
            langParam
          );
        }
        // Check Spain AnimeBox provider 2735 on page 1 boost + Japanese Anime in Spain
        if (page === 1) {
          originalsBoostEndpoint = `https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_API_KEY}&language=${langParam}&watch_region=ES&with_watch_providers=2735&with_watch_monetization_types=${encodeURIComponent(
            'flatrate|ads|free'
          )}&sort_by=popularity.desc&page=1&include_adult=false`;
        }
        endpoint = `https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_API_KEY}&language=${langParam}&watch_region=ES&with_genres=${animeGenreStr}&with_origin_country=JP&sort_by=${sortBy}&vote_count.gte=${minVotes}${simulcastFilter}&page=${page}&include_adult=false`;
      } else if (provider === 'jkanime') {
        // JKAnime: En Emisión (Simulcasts) + Popular Japanese Anime Directory
        if (page === 1 && category === 'trending') {
          originalsBoostEndpoint = `https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_API_KEY}&language=${langParam}&with_genres=16&with_origin_country=JP&air_date.gte=${recentSimulcastIso}&air_date.lte=${todayIso}&sort_by=popularity.desc&vote_count.gte=10&page=1&include_adult=false`;
        }
        endpoint = `https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_API_KEY}&language=${langParam}&with_genres=${animeGenreStr}&with_origin_country=JP&sort_by=${sortBy}&vote_count.gte=${minVotes}${simulcastFilter}&page=${page}&include_adult=false`;
      } else if (provider === 'animeflv') {
        // AnimeFLV: Latest seasonal premieres + All-Time Most Watched AnimeFLV legends
        if (page === 1 && category === 'trending') {
          originalsBoostEndpoint = `https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_API_KEY}&language=${langParam}&with_genres=16&with_origin_country=JP&air_date.gte=${recentSimulcastIso}&air_date.lte=${todayIso}&sort_by=vote_count.desc&vote_count.gte=15&page=1&include_adult=false`;
        }
        endpoint = `https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_API_KEY}&language=${langParam}&with_genres=${animeGenreStr}&with_origin_country=JP&sort_by=${sortBy}&vote_count.gte=${minVotes}${simulcastFilter}&page=${page}&include_adult=false`;
      } else {
        // anime_all
        endpoint = `https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_API_KEY}&language=${langParam}&with_genres=${animeGenreStr}&with_origin_country=JP&sort_by=${sortBy}&vote_count.gte=${minVotes}${simulcastFilter}&page=${page}&include_adult=false`;
      }
    } else if (provCfg) {
      const sortBy = category === 'top_rated' ? 'vote_average.desc' : 'popularity.desc';
      const minVotes = category === 'top_rated' ? 250 : 80;
      const genreParam = SERIES_GENRE_MAP[category] ? `&with_genres=${SERIES_GENRE_MAP[category]}` : '';

      if (category === 'originals') {
        endpoint = `https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_API_KEY}&language=${langParam}&with_networks=${encodeURIComponent(
          provCfg.tvNetworks
        )}&sort_by=${sortBy}&vote_count.gte=${minVotes}&first_air_date.lte=${todayIso}&without_genres=10767,10763,10764${genreParam}&page=${page}&include_adult=false`;
      } else {
        endpoint = `https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_API_KEY}&language=${langParam}&watch_region=ES&with_watch_providers=${encodeURIComponent(
          provCfg.watchProviders
        )}&with_watch_monetization_types=${encodeURIComponent(
          'flatrate|ads|free'
        )}&sort_by=${sortBy}&vote_count.gte=${minVotes}&first_air_date.lte=${todayIso}&without_genres=10767,10763,10764${genreParam}&page=${page}&include_adult=false`;

        // On page 1 of Tendencias for a selected platform, lead with iconic flagship Originals
        if (page === 1 && category === 'trending') {
          originalsBoostEndpoint = `https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_API_KEY}&language=${langParam}&with_networks=${encodeURIComponent(
            provCfg.tvNetworks
          )}&sort_by=vote_count.desc&vote_count.gte=400&first_air_date.lte=${todayIso}&without_genres=10767,10763,10764&page=1&include_adult=false`;
        }
      }
    } else if (category === 'popular') {
      endpoint = `https://api.themoviedb.org/3/tv/popular?api_key=${TMDB_API_KEY}&language=${langParam}&page=${page}`;
    } else if (category === 'top_rated') {
      endpoint = `https://api.themoviedb.org/3/tv/top_rated?api_key=${TMDB_API_KEY}&language=${langParam}&page=${page}`;
    } else if (SERIES_GENRE_MAP[category]) {
      endpoint = `https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_API_KEY}&language=${langParam}&sort_by=popularity.desc&without_genres=10767,10763&with_genres=${SERIES_GENRE_MAP[category]}&page=${page}`;
    } else {
      endpoint = `https://api.themoviedb.org/3/trending/tv/week?api_key=${TMDB_API_KEY}&language=${langParam}&page=${page}`;
    }

    const mapTmdbSeriesItem = (s: any) => ({
      id: `tv-${langParam}-${provider}-${s.id}`,
      tmdbId: s.id,
      mediaType: 'tv',
      title: s.name || s.original_name || 'Serie',
      originalTitle: s.original_name || s.name || '',
      year: s.first_air_date ? String(s.first_air_date).split('-')[0] : 'TV',
      rating: s.vote_average ? Number(s.vote_average).toFixed(1) : '',
      overview:
        s.overview ||
        (isAnime
          ? 'Anime disponible por temporadas y capítulos en Español, Latino y VOSE (Sub Español) 1080p.'
          : isSpanishCatalog
          ? 'Serie disponible en Español (Castellano / Latino) y VO Inglés 1080p.'
          : 'Full TV series available in Original English 1080p & Spanish.'),
      poster: s.poster_path ? `https://image.tmdb.org/t/p/w500${s.poster_path}` : '',
      backdrop: s.backdrop_path ? `https://image.tmdb.org/t/p/w1280${s.backdrop_path}` : '',
      languages: isAnime
        ? ['Español', 'VOSE · Sub', 'EN']
        : isSpanishCatalog
        ? ['Español', 'VOSE · EN']
        : ['English 1080p', 'Español'],
      platform: provCfg?.label,
      providerId: provCfg ? provider : undefined,
    });

    const [movidySeriesData, curatedAnimeRaw, originalsRes, tRes] = await Promise.all([
      isSpanishCatalog && !provCfg && !isAnime
        ? scrapeMovidySeriesCatalog({ category, page, query })
        : Promise.resolve({ series: [], hasMore: false }),
      curatedAnimeSeedPromise,
      originalsBoostEndpoint
        ? fetch(originalsBoostEndpoint, { signal: AbortSignal.timeout(4500) }).catch(() => null)
        : Promise.resolve(null),
      fetch(endpoint, { signal: AbortSignal.timeout(5000) }),
    ]);

    const curatedLead = curatedAnimeRaw.map(mapTmdbSeriesItem);

    let originalsLead: any[] = [];
    if (originalsRes?.ok) {
      const oJson: any = await originalsRes.json().catch(() => null);
      const oResults: any[] = Array.isArray(oJson?.results) ? oJson.results : [];
      originalsLead = oResults
        .filter((s) => s && s.id && (s.poster_path || s.backdrop_path))
        .slice(0, 12)
        .map(mapTmdbSeriesItem);
    }

    let tmdbSeries: any[] = [];
    let totalPages = 1;

    if (tRes.ok) {
      const json: any = await tRes.json();
      const results: any[] = Array.isArray(json?.results) ? json.results : [];
      totalPages = Number(json?.total_pages || 1);

      tmdbSeries = results
        .filter((s) => {
          if (!s || !s.id || (!s.poster_path && !s.backdrop_path)) return false;
          if (isAnime && query) {
            const gIds: number[] = Array.isArray(s.genre_ids) ? s.genre_ids : [];
            const origCountries: string[] = Array.isArray(s.origin_country)
              ? s.origin_country
              : [];
            const isJa =
              String(s.original_language || '').toLowerCase() === 'ja' ||
              origCountries.includes('JP');
            if (!gIds.includes(16) && !isJa) return false;
          }
          if (isSpanishCatalog && !query && !isAnime && Array.isArray(s.genre_ids)) {
            if (s.genre_ids.includes(10767) || s.genre_ids.includes(10763)) {
              return false;
            }
          }
          return true;
        })
        .map(mapTmdbSeriesItem);
    }

    const seenTmdbIds = new Set<number>();
    const combinedSeries: any[] = [];

    for (const cs of curatedLead) {
      if (cs?.tmdbId && !seenTmdbIds.has(cs.tmdbId)) {
        seenTmdbIds.add(cs.tmdbId);
        combinedSeries.push(cs);
      }
    }

    for (const ms of movidySeriesData.series) {
      if (ms?.tmdbId && !seenTmdbIds.has(ms.tmdbId)) {
        seenTmdbIds.add(ms.tmdbId);
        combinedSeries.push(ms);
      }
    }

    for (const orig of originalsLead) {
      if (orig?.tmdbId && !seenTmdbIds.has(orig.tmdbId)) {
        seenTmdbIds.add(orig.tmdbId);
        combinedSeries.push(orig);
      }
    }

    for (const ts of tmdbSeries) {
      if (ts?.tmdbId && !seenTmdbIds.has(ts.tmdbId)) {
        seenTmdbIds.add(ts.tmdbId);
        combinedSeries.push(ts);
      }
    }

    const hasMore =
      Boolean(movidySeriesData.hasMore) || (page < totalPages && tmdbSeries.length > 0);
    seriesCatalogCache.set(cacheKey, { series: combinedSeries, hasMore, ts: Date.now() });
    res.json({ success: true, series: combinedSeries, hasMore, page });
  } catch (err) {
    console.error('Series catalog error:', err);
    res.status(500).json({ success: false, series: [], hasMore: false });
  }
});

const tvDetailsFastCache = new Map<string, { details: any; ts: number }>();
const tvLangProbeCache = new Map<
  string,
  { availableLanguages: ('ES' | 'LAT' | 'VOSE' | 'EN')[]; ts: number }
>();

app.get('/api/catalog/tv/:tmdbId', async (req, res) => {
  try {
    const cleanId = String(req.params.tmdbId || '').replace(/\D/g, '');
    if (!cleanId) return res.status(400).json({ success: false });

    const requestedSeason = Math.max(1, parseInt(String(req.query.season || '1'), 10) || 1);
    const isEn = String(req.query.lang || 'es').toLowerCase() === 'en';
    const langParam = isEn ? 'en-US' : 'es-ES';
    const cacheKey = `${cleanId}:${requestedSeason}:${langParam}`;

    const cached = tvDetailsFastCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < 15 * 60 * 1000) {
      const cachedLangs = tvLangProbeCache.get(`${cleanId}:${cached.details.activeSeason}:1`);
      return res.json({
        success: true,
        details: {
          ...cached.details,
          ...(cachedLangs ? { availableLanguages: cachedLangs.availableLanguages } : {}),
        },
      });
    }

    const showRes = await fetch(
      `https://api.themoviedb.org/3/tv/${cleanId}?api_key=${TMDB_API_KEY}&language=${langParam}`,
      { signal: AbortSignal.timeout(4500) }
    );

    if (!showRes.ok) return res.status(404).json({ success: false });
    const showJson: any = await showRes.json();

    const seasons = (Array.isArray(showJson?.seasons) ? showJson.seasons : [])
      .filter(
        (s: any) =>
          s &&
          typeof s.season_number === 'number' &&
          s.season_number >= 1 &&
          (Number(s.episode_count) > 0 || s.season_number === 1)
      )
      .sort((a: any, b: any) => a.season_number - b.season_number)
      .map((s: any) => ({
        seasonNumber: s.season_number,
        name:
          s.name && !/^season\s+\d+$/i.test(s.name)
            ? s.name
            : isEn
            ? `Season ${s.season_number}`
            : `Temporada ${s.season_number}`,
        episodeCount: Number(s.episode_count) || 0,
        poster: s.poster_path ? `https://image.tmdb.org/t/p/w342${s.poster_path}` : '',
      }));

    const effectiveSeason =
      seasons.length > 0 && !seasons.some((s: any) => s.seasonNumber === requestedSeason)
        ? seasons[0].seasonNumber
        : requestedSeason;

    const seasonRequests: Promise<Response>[] = [
      fetch(
        `https://api.themoviedb.org/3/tv/${cleanId}/season/${effectiveSeason}?api_key=${TMDB_API_KEY}&language=${langParam}`,
        { signal: AbortSignal.timeout(4500) }
      ),
    ];
    if (!isEn) {
      seasonRequests.push(
        fetch(
          `https://api.themoviedb.org/3/tv/${cleanId}/season/${effectiveSeason}?api_key=${TMDB_API_KEY}&language=en-US`,
          { signal: AbortSignal.timeout(4500) }
        )
      );
    }

    const [seasonRes, seasonEnRes] = await Promise.all(seasonRequests);
    const seasonJson: any = seasonRes?.ok ? await seasonRes.json() : { episodes: [] };
    const seasonEnJson: any = seasonEnRes?.ok ? await seasonEnRes.json() : { episodes: [] };

    const enEpisodesByNum = new Map<number, any>();
    if (Array.isArray(seasonEnJson?.episodes)) {
      for (const epEn of seasonEnJson.episodes) {
        if (epEn && typeof epEn.episode_number === 'number') {
          enEpisodesByNum.set(epEn.episode_number, epEn);
        }
      }
    }

    const rawEpisodes =
      Array.isArray(seasonJson?.episodes) && seasonJson.episodes.length > 0
        ? seasonJson.episodes
        : Array.isArray(seasonEnJson?.episodes)
        ? seasonEnJson.episodes
        : [];

    let episodes = rawEpisodes
      .filter((ep: any) => ep && typeof ep.episode_number === 'number' && ep.episode_number >= 1)
      .sort((a: any, b: any) => a.episode_number - b.episode_number)
      .map((ep: any) => {
        const epNum = ep.episode_number;
        const enFallback = enEpisodesByNum.get(epNum);
        const rawName = String(ep.name || '').trim();
        const isGenericEsName =
          !rawName || /^(episodio|episode|cap[ií]tulo)\s*\d+$/i.test(rawName);
        const enName = String(enFallback?.name || '').trim();
        const finalTitle =
          !isGenericEsName
            ? rawName
            : enName && !/^(episode|episodio)\s*\d+$/i.test(enName)
            ? enName
            : isEn
            ? `Episode ${epNum}`
            : `Capítulo ${epNum}`;
        const stillPath = ep.still_path || enFallback?.still_path || '';

        return {
          id: `ep-${cleanId}-${effectiveSeason}-${epNum}`,
          episodeNumber: epNum,
          seasonNumber: effectiveSeason,
          title: finalTitle,
          overview: ep.overview || enFallback?.overview || '',
          still: stillPath ? `https://image.tmdb.org/t/p/w500${stillPath}` : '',
          runtime: ep.runtime || enFallback?.runtime || undefined,
          airDate: ep.air_date || enFallback?.air_date || undefined,
          rating: ep.vote_average ? Number(ep.vote_average).toFixed(1) : undefined,
        };
      });

    const activeSeasonSummary = seasons.find((s: any) => s.seasonNumber === effectiveSeason);
    if (episodes.length === 0 && activeSeasonSummary && activeSeasonSummary.episodeCount > 0) {
      episodes = Array.from({ length: activeSeasonSummary.episodeCount }, (_, idx) => ({
        id: `ep-${cleanId}-${effectiveSeason}-${idx + 1}`,
        episodeNumber: idx + 1,
        seasonNumber: effectiveSeason,
        title: isEn ? `Episode ${idx + 1}` : `Capítulo ${idx + 1}`,
        overview: '',
        still: '',
        runtime: undefined,
        airDate: undefined,
        rating: undefined,
      }));
    }

    const normalizedSeasons =
      seasons.length > 0
        ? seasons.map((s: any) =>
            s.seasonNumber === effectiveSeason && episodes.length > s.episodeCount
              ? { ...s, episodeCount: episodes.length }
              : s
          )
        : [
            {
              seasonNumber: 1,
              name: isEn ? 'Season 1' : 'Temporada 1',
              episodeCount: episodes.length,
            },
          ];

    const showTitle = showJson.name || showJson.original_name || 'Serie';
    const origTitle = showJson.original_name || showJson.name || '';

    const detailsPayload: any = {
      tmdbId: Number(cleanId),
      title: showTitle,
      originalTitle: origTitle,
      year: showJson.first_air_date ? String(showJson.first_air_date).split('-')[0] : 'TV',
      rating: showJson.vote_average ? Number(showJson.vote_average).toFixed(1) : '',
      overview: showJson.overview || '',
      poster: showJson.poster_path ? `https://image.tmdb.org/t/p/w500${showJson.poster_path}` : '',
      backdrop: showJson.backdrop_path
        ? `https://image.tmdb.org/t/p/w1280${showJson.backdrop_path}`
        : '',
      seasons: normalizedSeasons,
      activeSeason: effectiveSeason,
      episodes,
    };

    tvDetailsFastCache.set(cacheKey, { details: detailsPayload, ts: Date.now() });

    const cachedLangs = tvLangProbeCache.get(`${cleanId}:${effectiveSeason}:1`);
    res.json({
      success: true,
      details: {
        ...detailsPayload,
        ...(cachedLangs ? { availableLanguages: cachedLangs.availableLanguages } : {}),
      },
    });
  } catch (err) {
    console.error('TV details error:', err);
    res.status(500).json({ success: false });
  }
});

app.get('/api/catalog/tv/:tmdbId/languages', async (req, res) => {
  try {
    const cleanId = String(req.params.tmdbId || '').replace(/\D/g, '');
    if (!cleanId) return res.status(400).json({ success: false, availableLanguages: [] });

    const seasonNum = Math.max(1, parseInt(String(req.query.season || '1'), 10) || 1);
    const episodeNum = Math.max(1, parseInt(String(req.query.episode || '1'), 10) || 1);
    const cacheKey = `${cleanId}:${seasonNum}:${episodeNum}`;

    const cached = tvLangProbeCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < 15 * 60 * 1000) {
      return res.json({ success: true, availableLanguages: cached.availableLanguages });
    }

    const titleHint = String(req.query.title || '').trim();
    const origTitleHint = String(req.query.origTitle || '').trim();
    let hints = [titleHint, origTitleHint].filter(Boolean);

    if (hints.length === 0) {
      const showRes = await fetch(
        `https://api.themoviedb.org/3/tv/${cleanId}?api_key=${TMDB_API_KEY}&language=es-ES`,
        { signal: AbortSignal.timeout(3500) }
      ).catch(() => null);
      if (showRes?.ok) {
        const showJson: any = await showRes.json();
        hints = [showJson?.name, showJson?.original_name].filter(Boolean);
      }
    }

    const availableLanguages = await probeAvailableLanguages({
      tmdbId: cleanId,
      mediaType: 'tv',
      season: seasonNum,
      episode: episodeNum,
      titleHints: hints,
    });

    tvLangProbeCache.set(cacheKey, { availableLanguages, ts: Date.now() });
    res.json({ success: true, availableLanguages });
  } catch {
    res.json({ success: false, availableLanguages: [] });
  }
});

// ============================================================================
// REST API: INSTANT YOUTUBE SEARCH FOR SYNCHRONIZED WATCH PARTIES
// ============================================================================
const ytSearchCache = new Map<string, { videos: any[]; ts: number }>();

app.get('/api/catalog/youtube', async (req, res) => {
  const q = String(req.query.q || '').trim() || 'trailers peliculas 2025 hd';
  const cached = ytSearchCache.get(q.toLowerCase());
  if (cached && Date.now() - cached.ts < 5 * 60 * 1000) {
    return res.json({ success: true, videos: cached.videos });
  }

  try {
    // Also support direct YouTube URL pasted into the YouTube search bar!
    const directId = parseYouTubeVideoId(q);
    if (directId) {
      return res.json({
        success: true,
        videos: [
          {
            id: `yt-${directId}`,
            videoId: directId,
            title: 'Vídeo de YouTube Directo',
            channel: 'YouTube',
            duration: 'HD',
            views: '',
            thumbnail: `https://i.ytimg.com/vi/${directId}/hqdefault.jpg`,
            url: `https://www.youtube.com/watch?v=${directId}`,
          },
        ],
      });
    }

    const ytRes = await fetch(
      `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&hl=es`,
      {
        headers: {
          'User-Agent': CHROME_UA,
          'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
        },
        signal: AbortSignal.timeout(5500),
      }
    );
    if (!ytRes.ok) return res.json({ success: true, videos: [] });

    const html = await ytRes.text();
    const initMatch = html.match(/var\s+ytInitialData\s*=\s*(\{[\s\S]+?\});<\/script>/);
    if (!initMatch) return res.json({ success: true, videos: [] });

    const data = JSON.parse(initMatch[1]);
    const sections =
      data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer
        ?.contents || [];

    const videos: any[] = [];
    for (const sec of sections) {
      const items = sec?.itemSectionRenderer?.contents || [];
      for (const item of items) {
        const vr = item?.videoRenderer;
        if (!vr?.videoId) continue;
        const title = vr.title?.runs?.map((r: any) => r.text).join('') || 'YouTube Video';
        const channel =
          vr.ownerText?.runs?.[0]?.text || vr.longBylineText?.runs?.[0]?.text || 'YouTube';
        const duration = vr.lengthText?.simpleText || 'LIVE';
        const views = vr.shortViewCountText?.simpleText || vr.viewCountText?.simpleText || '';
        videos.push({
          id: `yt-${vr.videoId}`,
          videoId: vr.videoId,
          title,
          channel,
          duration,
          views,
          thumbnail: `https://i.ytimg.com/vi/${vr.videoId}/hqdefault.jpg`,
          url: `https://www.youtube.com/watch?v=${vr.videoId}`,
        });
        if (videos.length >= 18) break;
      }
      if (videos.length >= 18) break;
    }

    ytSearchCache.set(q.toLowerCase(), { videos, ts: Date.now() });
    res.json({ success: true, videos });
  } catch (err) {
    console.warn('YouTube search error:', err);
    res.json({ success: true, videos: [] });
  }
});

// ============================================================================
// REST API: LIVE SPORTS AGENDA (REAL-TIME ROJADIRECTA SCRAPER + 24/7 MULTIPLEX)
// ============================================================================
let cachedSportsSchedule: { matches: any[]; ts: number } | null = null;

function getPermanent247SportsMatches() {
  return [
    {
      id: 'mux-laliga',
      title: 'LaLiga EA Sports & Hypermotion · Movistar + DAZN 24/7',
      competition: 'Fútbol Español en Directo',
      sport: 'soccer',
      time: 'EN DIRECTO',
      isLive: true,
      is247Channel: true,
      channels: [
        {
          id: 'ch-laliga-1',
          label: 'M+ LaLiga HD',
          lang: 'ES',
          quality: '1080p',
          sourceUrl: 'https://footunder.online/tvtodo/laliga.php',
          resolverType: 'sports_channel',
        },
        {
          id: 'ch-laliga-2',
          label: 'DAZN LaLiga HD',
          lang: 'ES',
          quality: '1080p',
          sourceUrl: 'https://pig.footunder.online/stream/538',
          resolverType: 'sports_channel',
        },
        {
          id: 'ch-laliga-3',
          label: 'LaLiga Hypermotion',
          lang: 'ES',
          quality: '1080p',
          sourceUrl: 'https://pig.footunder.online/stream/522',
          resolverType: 'sports_channel',
        },
        {
          id: 'ch-laliga-4',
          label: 'Señal Satélite LaLiga',
          lang: 'ES',
          quality: '1080p',
          sourceUrl: 'https://pig.footunder.online/stream/84',
          resolverType: 'sports_channel',
        },
      ],
    },
    {
      id: 'mux-f1-motor',
      title: 'DAZN F1, MotoGP & Motorsport · Circuito 24/7',
      competition: 'Fórmula 1 · MotoGP · WEC',
      sport: 'motor',
      time: 'EN DIRECTO',
      isLive: true,
      is247Channel: true,
      channels: [
        {
          id: 'ch-f1-rb',
          label: 'Red Bull Motorsport 1080p',
          lang: 'ES',
          quality: '1080p',
          sourceUrl: 'https://rbmn-live.akamaized.net/hls/live/590964/BoRB-AT/master.m3u8',
          resolverType: 'tdt_hls',
        },
        {
          id: 'ch-f1-euro2',
          label: 'Eurosport 2 Motor HD',
          lang: 'ES',
          quality: '1080p',
          sourceUrl: 'https://pig.footunder.online/stream/232',
          resolverType: 'sports_channel',
        },
        {
          id: 'ch-f1-1',
          label: 'F1 Circuito 24/7 HD',
          lang: 'ES',
          quality: '1080p',
          sourceUrl: 'https://pig.footunder.online/stream/60',
          resolverType: 'sports_channel',
        },
        {
          id: 'ch-f1-tdp',
          label: 'Teledeporte Motor 1080p',
          lang: 'ES',
          quality: '1080p',
          sourceUrl: 'https://rtvelivestream.rtve.es/rtvesec/tdp/tdp_main.m3u8',
          resolverType: 'tdt_hls',
        },
      ],
    },
    {
      id: 'mux-champions',
      title: 'Movistar Liga de Campeones & Fútbol Europeo · 24/7',
      competition: 'UEFA Champions · Europa League',
      sport: 'soccer',
      time: 'EN DIRECTO',
      isLive: true,
      is247Channel: true,
      channels: [
        {
          id: 'ch-ucl-gol',
          label: 'GOL Fútbol Abierto 1080p',
          lang: 'ES',
          quality: '1080p',
          sourceUrl: 'http://90.163.85.113:8093/stream/38/index.m3u8',
          resolverType: 'tdt_hls',
        },
        {
          id: 'ch-ucl-ll',
          label: 'Fútbol en Directo M+ HD',
          lang: 'ES',
          quality: '1080p',
          sourceUrl: 'https://footunder.online/tvtodo/laliga.php',
          resolverType: 'sports_channel',
        },
        {
          id: 'ch-ucl-1',
          label: 'M+ Liga de Campeones',
          lang: 'ES',
          quality: '1080p',
          sourceUrl: 'https://pig.footunder.online/stream/435',
          resolverType: 'sports_channel',
        },
        {
          id: 'ch-ucl-2',
          label: 'DAZN Fútbol Europeo HD',
          lang: 'ES',
          quality: '1080p',
          sourceUrl: 'https://footunder.online/tvtodo/dazn3.php',
          resolverType: 'sports_channel',
        },
      ],
    },
    {
      id: 'mux-nba-tennis',
      title: 'Movistar Deportes, Golf & Eurosport · Arena 24/7',
      competition: 'ACB · Euroliga · Tenis · Golf',
      sport: 'basketball',
      time: 'EN DIRECTO',
      isLive: true,
      is247Channel: true,
      channels: [
        {
          id: 'ch-nba-4',
          label: 'Teledeporte 1080p',
          lang: 'ES',
          quality: '1080p',
          sourceUrl: 'https://rtvelivestream.rtve.es/rtvesec/tdp/tdp_main.m3u8',
          resolverType: 'tdt_hls',
        },
        {
          id: 'ch-nba-euro2',
          label: 'Eurosport 2 Arena HD',
          lang: 'ES',
          quality: '1080p',
          sourceUrl: 'https://pig.footunder.online/stream/232',
          resolverType: 'sports_channel',
        },
        {
          id: 'ch-nba-e3',
          label: 'Esport3 Polideportivo HD',
          lang: 'ES',
          quality: '1080p',
          sourceUrl: 'https://directes-tv-int.3catdirectes.cat/live-origin/esport3-hls/master.m3u8',
          resolverType: 'tdt_hls',
        },
        {
          id: 'ch-nba-1',
          label: 'Arena Basket & Deportes HD',
          lang: 'ES',
          quality: '1080p',
          sourceUrl: 'https://footunder.online/tvtodo/mligacampeones.php',
          resolverType: 'sports_channel',
        },
      ],
    },
  ];
}

function detectSportKind(text: string): 'soccer' | 'motor' | 'basketball' | 'tennis' | 'other' {
  const lower = text.toLowerCase();
  if (/baloncesto|basket|nba|eurocup|euroliga|acb|ncaa/.test(lower)) return 'basketball';
  if (/tenis|tennis|atp|wta|roland|wimbledon/.test(lower)) return 'tennis';
  if (/f1|formula|fórmula|motogp|motor|nascar|rally|indy/.test(lower)) return 'motor';
  return 'soccer';
}

function getVerifiedSportBackupChannels(
  sport: 'soccer' | 'motor' | 'basketball' | 'tennis' | 'other'
): TrackRecord[] {
  if (sport === 'motor') {
    return [
      {
        id: 'bk-motor-rb',
        label: 'Señal Respaldo · Motorsport 1080p',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://rbmn-live.akamaized.net/hls/live/590964/BoRB-AT/master.m3u8',
        resolverType: 'tdt_hls',
      },
      {
        id: 'bk-motor-eu2',
        label: 'Señal Respaldo · Eurosport 2 HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://pig.footunder.online/stream/232',
        resolverType: 'sports_channel',
      },
    ];
  }
  if (sport === 'basketball' || sport === 'tennis') {
    return [
      {
        id: 'bk-arena-tdp',
        label: 'Señal Respaldo · Teledeporte HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://rtvelivestream.rtve.es/rtvesec/tdp/tdp_main.m3u8',
        resolverType: 'tdt_hls',
      },
      {
        id: 'bk-arena-eu2',
        label: 'Señal Respaldo · Eurosport 2 HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://pig.footunder.online/stream/232',
        resolverType: 'sports_channel',
      },
    ];
  }
  return [
    {
      id: 'bk-fut-daznll',
      label: 'Señal Respaldo · Fútbol HD 1',
      lang: 'ES',
      quality: '1080p',
      sourceUrl: 'https://pig.footunder.online/stream/538',
      resolverType: 'sports_channel',
    },
    {
      id: 'bk-fut-mll',
      label: 'Señal Respaldo · Fútbol HD 2',
      lang: 'ES',
      quality: '1080p',
      sourceUrl: 'https://footunder.online/tvtodo/laliga.php',
      resolverType: 'sports_channel',
    },
    {
      id: 'bk-fut-gol',
      label: 'Señal Respaldo · GOL 1080p',
      lang: 'ES',
      quality: '1080p',
      sourceUrl: 'http://90.163.85.113:8093/stream/38/index.m3u8',
      resolverType: 'tdt_hls',
    },
  ];
}

app.get('/api/catalog/sports', async (_req, res) => {
  if (cachedSportsSchedule && Date.now() - cachedSportsSchedule.ts < 2 * 60 * 1000) {
    return res.json({ success: true, events: cachedSportsSchedule.matches });
  }

  const permanentChannels = getPermanent247SportsMatches();
  const liveGrouped = new Map<string, any>();

  try {
    const agendaHtml = await fetch('https://www.rojadirectv.live/', {
      headers: { 'User-Agent': CHROME_UA },
      signal: AbortSignal.timeout(4500),
    }).then((r) => (r.ok ? r.text() : ''));

    const rowRegex =
      /<tr>\s*<td><span class="t">([^<]+)<\/span><\/td>[\s\S]*?<td align="left">([\s\S]*?)<\/td>\s*<\/tr>/gi;

    for (const rowMatch of agendaHtml.matchAll(rowRegex)) {
      const timeStr = rowMatch[1].trim();
      const cellHtml = rowMatch[2];

      const titleMatch = cellHtml.match(/<b>([^<]+)<\/b>/i);
      const compPrefix = cellHtml
        .split('<a')[0]
        .replace(/<[^>]+>/g, '')
        .replace(/:\s*$/, '')
        .trim();
      const b64Links = [
        ...cellHtml.matchAll(/\?r=([A-Za-z0-9+/=]+)"[^>]*class="btn-canal"[^>]*>([^<]+)</gi),
      ];

      if (!titleMatch || b64Links.length === 0) continue;
      const matchTitle = titleMatch[1].trim();
      const key = `${timeStr}-${matchTitle}`;

      if (!liveGrouped.has(key)) {
        liveGrouped.set(key, {
          id: `live-${Buffer.from(key).toString('base64url').slice(0, 14)}`,
          title: matchTitle,
          competition: compPrefix || 'Agenda en Directo',
          sport: detectSportKind(`${compPrefix} ${matchTitle}`),
          time: timeStr,
          isLive: true,
          is247Channel: false,
          channels: [],
        });
      }

      const entry = liveGrouped.get(key);
      for (const link of b64Links) {
        try {
          const decodedChannelUrl = Buffer.from(link[1], 'base64').toString('utf8').trim();
          if (!decodedChannelUrl.startsWith('http')) continue;
          if (entry.channels.some((c: any) => c.sourceUrl === decodedChannelUrl)) continue;
          entry.channels.push({
            id: `live-ch-${entry.channels.length + 1}`,
            label: link[2].trim() || `Señal ${entry.channels.length + 1}`,
            lang: 'LIVE',
            quality: 'HD',
            sourceUrl: decodedChannelUrl,
            resolverType: 'sports_channel',
          });
        } catch {
          // skip malformed base64
        }
      }
    }
  } catch (err) {
    console.warn('RojaDirecta live scrape fallback to 24/7 channels:', err);
  }

  // Ensure every scraped match has verified clean HD fallback signals so a single scrambled satellite feed never dead-ends!
  const scrapedEvents = Array.from(liveGrouped.values())
    .slice(0, 28)
    .map((ev) => {
      const backups = getVerifiedSportBackupChannels(ev.sport);
      const existingUrls = new Set(ev.channels.map((c: any) => c.sourceUrl));
      return {
        ...ev,
        channels: [
          ...ev.channels,
          ...backups.filter((bk) => !existingUrls.has(bk.sourceUrl)),
        ],
      };
    });

  const combined = [...permanentChannels, ...scrapedEvents];
  cachedSportsSchedule = { matches: combined, ts: Date.now() };

  res.json({ success: true, events: combined });
});

// ============================================================================
// REST API: TELEVISIÓN ESPAÑOLA EN VIVO (TDT NACIONAL 1080P + AUDIO AAC)
// ============================================================================
interface SpanishTdtChannelDef {
  id: string;
  dial: number;
  name: string;
  shortMark: string;
  brandTone: string;
  network: string;
  category:
    | 'movistar'
    | 'dazn'
    | 'generalistas'
    | 'cine_series'
    | 'entretenimiento'
    | 'noticias_deportes'
    | 'infantil_autonomicas';
  quality: string;
  description: string;
  channels: TrackRecord[];
}

const SPANISH_TDT_CHANNELS: SpanishTdtChannelDef[] = [
  {
    id: 'tdt-la1',
    dial: 1,
    name: 'La 1',
    shortMark: '1',
    brandTone: '#2563EB',
    network: 'RTVE',
    category: 'generalistas',
    quality: '1080p HD',
    description: 'Telediario, cine, entretenimiento, selección española y grandes eventos en directo',
    channels: [
      {
        id: 'la1-rtve',
        label: 'Señal Oficial RTVE HD (La 1 España)',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://rtvelivestream.rtve.es/rtvesec/la1/la1_main.m3u8',
        resolverType: 'tdt_hls',
      },
      {
        id: 'la1-dvb',
        label: 'Señal Antena TDT 1080p (La 1)',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'http://90.163.85.113:8093/stream/45/index.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'tdt-la2',
    dial: 2,
    name: 'La 2',
    shortMark: '2',
    brandTone: '#0EA5E9',
    network: 'RTVE',
    category: 'generalistas',
    quality: '1080p HD',
    description: 'Documentales, cultura, cine clásico e independiente y Saber y Ganar',
    channels: [
      {
        id: 'la2-rtve',
        label: 'Señal Oficial RTVE HD (La 2 España)',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://rtvelivestream.rtve.es/rtvesec/la2/la2_main.m3u8',
        resolverType: 'tdt_hls',
      },
      {
        id: 'la2-dvb',
        label: 'Señal Antena TDT 1080p (La 2)',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'http://90.163.85.113:8093/stream/48/index.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'tdt-antena3',
    dial: 3,
    name: 'Antena 3',
    shortMark: 'A3',
    brandTone: '#F97316',
    network: 'Atresmedia',
    category: 'generalistas',
    quality: '1080p HD',
    description: 'El Hormiguero, Pasapalabra, Antena 3 Noticias y series estelares',
    channels: [
      {
        id: 'a3-dvb',
        label: 'Señal Directa HD',
        lang: 'ES',
        quality: '720p HD',
        sourceUrl: 'http://90.163.85.113:8093/stream/20/index.m3u8',
        resolverType: 'tdt_hls',
      },
      {
        id: 'a3-fast',
        label: 'Señal 2 · Estabilizada Rápida',
        lang: 'ES',
        quality: 'HD',
        sourceUrl: 'http://90.163.85.113:8093/stream/20/index.m3u8?profile=fast',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'tdt-cuatro',
    dial: 4,
    name: 'Cuatro',
    shortMark: '4',
    brandTone: '#EF4444',
    network: 'Mediaset',
    category: 'generalistas',
    quality: '1080p HD',
    description: 'First Dates, Horizonte, Cuarto Milenio, actualidad y cine de acción',
    channels: [
      {
        id: 'cuatro-dvb',
        label: 'Señal Directa HD',
        lang: 'ES',
        quality: '720p HD',
        sourceUrl: 'http://90.163.85.113:8093/stream/42/index.m3u8',
        resolverType: 'tdt_hls',
      },
      {
        id: 'cuatro-fast',
        label: 'Señal 2 · Estabilizada Rápida',
        lang: 'ES',
        quality: 'HD',
        sourceUrl: 'http://90.163.85.113:8093/stream/42/index.m3u8?profile=fast',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'tdt-telecinco',
    dial: 5,
    name: 'Telecinco',
    shortMark: '5',
    brandTone: '#0284C7',
    network: 'Mediaset',
    category: 'generalistas',
    quality: '1080p HD',
    description: 'Realities en directo, Informativos Telecinco, entretenimiento y cine',
    channels: [
      {
        id: 't5-dvb',
        label: 'Señal Directa HD',
        lang: 'ES',
        quality: '720p HD',
        sourceUrl: 'http://90.163.85.113:8093/stream/41/index.m3u8',
        resolverType: 'tdt_hls',
      },
      {
        id: 't5-fast',
        label: 'Señal 2 · Estabilizada Rápida',
        lang: 'ES',
        quality: 'HD',
        sourceUrl: 'http://90.163.85.113:8093/stream/41/index.m3u8?profile=fast',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'tdt-lasexta',
    dial: 6,
    name: 'laSexta',
    shortMark: '6',
    brandTone: '#16A34A',
    network: 'Atresmedia',
    category: 'generalistas',
    quality: '1080p HD',
    description: 'Al Rojo Vivo, El Intermedio, Zapeando, Equipo de Investigación y cine',
    channels: [
      {
        id: 'lasexta-dvb',
        label: 'Señal Directa HD',
        lang: 'ES',
        quality: '720p HD',
        sourceUrl: 'http://90.163.85.113:8093/stream/21/index.m3u8',
        resolverType: 'tdt_hls',
      },
      {
        id: 'lasexta-fast',
        label: 'Señal 2 · Estabilizada Rápida',
        lang: 'ES',
        quality: 'HD',
        sourceUrl: 'http://90.163.85.113:8093/stream/21/index.m3u8?profile=fast',
        resolverType: 'tdt_hls',
      },
    ],
  },
  // ==========================================================================
  // MOVISTAR PLUS+ EN VIVO (FÚTBOL, CHAMPIONS, VAMOS, DEPORTES, GOLF, EUROSPORT)
  // ==========================================================================
  {
    id: 'mplus-canal',
    dial: 7,
    name: 'Movistar Plus+',
    shortMark: 'M+',
    brandTone: '#00A9E0',
    network: 'Movistar Plus+',
    category: 'movistar',
    quality: '1080p HD',
    description: 'Canal principal de Movistar Plus+ (#0): partido de la jornada, cine, series y programas propios',
    channels: [
      {
        id: 'mplus-1',
        label: 'Señal Principal M+ 1080p',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'http://90.163.85.113:8093/stream/38/index.m3u8',
        resolverType: 'tdt_hls',
      },
      {
        id: 'mplus-2',
        label: 'Señal Alternativa M+ HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://footunder.online/tvtodo/laliga.php',
        resolverType: 'sports_channel',
      },
      {
        id: 'mplus-sat',
        label: 'Señal Satélite M+',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://pig.footunder.online/stream/531',
        resolverType: 'sports_channel',
      },
    ],
  },
  {
    id: 'mplus-vamos',
    dial: 8,
    name: 'Movistar Vamos',
    shortMark: 'VAMOS',
    brandTone: '#10B981',
    network: 'Movistar Plus+',
    category: 'movistar',
    quality: '1080p HD',
    description: 'El Día Después, El Tercer Tiempo, noticias deportivas 24h y grandes citas en directo',
    channels: [
      {
        id: 'mvamos-1',
        label: 'Señal Directo Fútbol 1080p',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'http://90.163.85.113:8093/stream/38/index.m3u8',
        resolverType: 'tdt_hls',
      },
      {
        id: 'mvamos-2',
        label: 'Señal Multideporte HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://pig.footunder.online/stream/529',
        resolverType: 'sports_channel',
      },
      {
        id: 'mvamos-sat',
        label: 'Señal Satélite Vamos',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://pig.footunder.online/stream/526',
        resolverType: 'sports_channel',
      },
    ],
  },
  {
    id: 'mplus-laliga',
    dial: 54,
    name: 'Movistar LaLiga TV',
    shortMark: 'M+LIGA',
    brandTone: '#00A9E0',
    network: 'Movistar Plus+',
    category: 'movistar',
    quality: '1080p HD',
    description: 'LaLiga EA Sports en directo, previas, postpartidos y resúmenes oficiales 24/7',
    channels: [
      {
        id: 'mlaliga-fast',
        label: 'Señal Directa LaLiga 1080p',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://pig.footunder.online/stream/538',
        resolverType: 'sports_channel',
      },
      {
        id: 'mlaliga-1',
        label: 'Señal Principal M+ LaLiga HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://footunder.online/tvtodo/laliga.php',
        resolverType: 'sports_channel',
      },
      {
        id: 'mlaliga-2',
        label: 'Señal Alternativa LaLiga HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://pig.footunder.online/stream/522',
        resolverType: 'sports_channel',
      },
      {
        id: 'mlaliga-sat',
        label: 'Señal Satélite M+ LaLiga',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://pig.footunder.online/stream/84',
        resolverType: 'sports_channel',
      },
      {
        id: 'mlaliga-gol',
        label: 'Señal Respaldo Fútbol TDT 1080p',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'http://90.163.85.113:8093/stream/38/index.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'mplus-hypermotion',
    dial: 56,
    name: 'LaLiga TV Hypermotion',
    shortMark: 'LIGA2',
    brandTone: '#0284C7',
    network: 'Movistar Plus+',
    category: 'movistar',
    quality: '1080p HD',
    description: 'Toda LaLiga Hypermotion, Copa del Rey y fútbol español en directo 24/7',
    channels: [
      {
        id: 'mhyper-1',
        label: 'Señal 24/7 Hypermotion HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://pig.footunder.online/stream/522',
        resolverType: 'sports_channel',
      },
      {
        id: 'mhyper-ev',
        label: 'Señal Evento 2 HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://footunder.online/tvtodo/laliga2.php',
        resolverType: 'sports_channel',
      },
    ],
  },
  {
    id: 'mplus-champions',
    dial: 60,
    name: 'M+ Liga de Campeones',
    shortMark: 'M+UCL',
    brandTone: '#16A34A',
    network: 'Movistar Plus+',
    category: 'movistar',
    quality: '1080p HD',
    description: 'UEFA Champions League, Europa League, Conference League y fútbol europeo en vivo',
    channels: [
      {
        id: 'mucl-gol',
        label: 'Señal Directo Fútbol 1080p',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'http://90.163.85.113:8093/stream/38/index.m3u8',
        resolverType: 'tdt_hls',
      },
      {
        id: 'mucl-ll',
        label: 'Señal Fútbol M+ HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://footunder.online/tvtodo/laliga.php',
        resolverType: 'sports_channel',
      },
      {
        id: 'mucl-1',
        label: 'Señal Satélite Champions HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://pig.footunder.online/stream/435',
        resolverType: 'sports_channel',
      },
    ],
  },
  {
    id: 'mplus-deportes',
    dial: 63,
    name: 'Movistar Deportes',
    shortMark: 'M+DEP',
    brandTone: '#00A9E0',
    network: 'Movistar Plus+',
    category: 'movistar',
    quality: '1080p HD',
    description: 'Liga Endesa ACB, Euroliga, NBA, ATP Masters 1000, Wimbledon, Rugby y NFL en directo',
    channels: [
      {
        id: 'mdep1-eu2',
        label: 'Señal Arena Deportes HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://pig.footunder.online/stream/232',
        resolverType: 'sports_channel',
      },
      {
        id: 'mdep1-tdp',
        label: 'Señal Polideportivo 1080p',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://rtvelivestream.rtve.es/rtvesec/tdp/tdp_main.m3u8',
        resolverType: 'tdt_hls',
      },
      {
        id: 'mdep1-sat',
        label: 'Señal Satélite M+ Deportes',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://pig.footunder.online/stream/438',
        resolverType: 'sports_channel',
      },
    ],
  },
  {
    id: 'mplus-deportes2',
    dial: 64,
    name: 'Movistar Deportes 2',
    shortMark: 'M+DEP2',
    brandTone: '#0EA5E9',
    network: 'Movistar Plus+',
    category: 'movistar',
    quality: '1080p HD',
    description: 'Multideporte en directo: baloncesto ACB/Euroliga, tenis Grand Slam y atletismo',
    channels: [
      {
        id: 'mdep2-1',
        label: 'Señal Directo Deportes 1080p',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://rtvelivestream.rtve.es/rtvesec/tdp/tdp_main.m3u8',
        resolverType: 'tdt_hls',
      },
      {
        id: 'mdep2-2',
        label: 'Señal Arena 2 HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://pig.footunder.online/stream/232',
        resolverType: 'sports_channel',
      },
      {
        id: 'mdep2-sat',
        label: 'Señal Satélite M+ Dep 2',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://pig.footunder.online/stream/527',
        resolverType: 'sports_channel',
      },
    ],
  },
  {
    id: 'mplus-golf',
    dial: 67,
    name: 'Movistar Golf',
    shortMark: 'M+GOLF',
    brandTone: '#059669',
    network: 'Movistar Plus+',
    category: 'movistar',
    quality: '1080p HD',
    description: 'PGA Tour, DP World Tour, Ryder Cup, Masters de Augusta y LIV Golf 24 horas en vivo',
    channels: [
      {
        id: 'mgolf-eu2',
        label: 'Señal Directo Deportes HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://pig.footunder.online/stream/232',
        resolverType: 'sports_channel',
      },
      {
        id: 'mgolf-tdp',
        label: 'Señal Polideportivo 1080p',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://rtvelivestream.rtve.es/rtvesec/tdp/tdp_main.m3u8',
        resolverType: 'tdt_hls',
      },
      {
        id: 'mgolf-1',
        label: 'Señal Satélite M+ Golf HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://pig.footunder.online/stream/528',
        resolverType: 'sports_channel',
      },
    ],
  },
  {
    id: 'mplus-eurosport1',
    dial: 72,
    name: 'Eurosport 1',
    shortMark: 'EURO1',
    brandTone: '#2563EB',
    network: 'Movistar+ · DAZN',
    category: 'movistar',
    quality: '1080p HD',
    description: 'Roland Garros, Open de Australia, Tour de Francia, La Vuelta, UFC y JJ.OO.',
    channels: [
      {
        id: 'euro1-2',
        label: 'Señal Eurosport Directo HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://pig.footunder.online/stream/232',
        resolverType: 'sports_channel',
      },
      {
        id: 'euro1-tdp',
        label: 'Señal Respaldo 1080p',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://rtvelivestream.rtve.es/rtvesec/tdp/tdp_main.m3u8',
        resolverType: 'tdt_hls',
      },
      {
        id: 'euro1-1',
        label: 'Señal Satélite Eurosport 1',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://pig.footunder.online/stream/231',
        resolverType: 'sports_channel',
      },
    ],
  },
  {
    id: 'mplus-eurosport2',
    dial: 73,
    name: 'Eurosport 2',
    shortMark: 'EURO2',
    brandTone: '#E11D48',
    network: 'Movistar+ · DAZN',
    category: 'movistar',
    quality: '1080p HD',
    description: 'Ciclismo mundial, WEC 24h Le Mans, tenis, snooker y deportes de invierno en vivo',
    channels: [
      {
        id: 'euro2-1',
        label: 'Señal 24/7 Eurosport 2 HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://pig.footunder.online/stream/232',
        resolverType: 'sports_channel',
      },
      {
        id: 'euro2-2',
        label: 'Señal Motor WEC HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://pig.footunder.online/stream/525',
        resolverType: 'sports_channel',
      },
    ],
  },
  // ==========================================================================
  // DAZN ESPAÑA EN VIVO (DAZN LALIGA, DAZN F1, DAZN 1, DAZN 2, DAZN 3, DAZN 4)
  // ==========================================================================
  {
    id: 'dazn-laliga',
    dial: 55,
    name: 'DAZN LaLiga',
    shortMark: 'DAZN LL',
    brandTone: '#F59E0B',
    network: 'DAZN España',
    category: 'dazn',
    quality: '1080p HD',
    description: 'Partidos exclusivos de LaLiga EA Sports en directo, previas a pie de campo y El Post',
    channels: [
      {
        id: 'daznll-1',
        label: 'Señal 24/7 DAZN LaLiga HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://pig.footunder.online/stream/538',
        resolverType: 'sports_channel',
      },
      {
        id: 'daznll-ev',
        label: 'Señal Evento 2 HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://footunder.online/tvtodo/laliga.php',
        resolverType: 'sports_channel',
      },
    ],
  },
  {
    id: 'dazn-f1',
    dial: 69,
    name: 'DAZN F1',
    shortMark: 'DAZN F1',
    brandTone: '#EF4444',
    network: 'DAZN España',
    category: 'dazn',
    quality: '1080p HD',
    description: 'Mundial de Fórmula 1 24/7: libres, clasificación, sprint, carreras y cámaras onboard',
    channels: [
      {
        id: 'daznf1-rb',
        label: 'Red Bull Motorsport 1080p',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://rbmn-live.akamaized.net/hls/live/590964/BoRB-AT/master.m3u8',
        resolverType: 'tdt_hls',
      },
      {
        id: 'daznf1-eu2',
        label: 'Señal Circuito Motor HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://pig.footunder.online/stream/232',
        resolverType: 'sports_channel',
      },
      {
        id: 'daznf1-1',
        label: 'Señal Satélite F1 HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://pig.footunder.online/stream/60',
        resolverType: 'sports_channel',
      },
    ],
  },
  {
    id: 'dazn-1',
    dial: 70,
    name: 'DAZN 1',
    shortMark: 'DAZN 1',
    brandTone: '#F4F4F5',
    network: 'DAZN España',
    category: 'dazn',
    quality: '1080p HD',
    description: 'Premier League, MotoGP, Serie A, Bundesliga, Liga F y boxeo mundial en directo',
    channels: [
      {
        id: 'dazn1-ll',
        label: 'Señal Directo DAZN HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://pig.footunder.online/stream/538',
        resolverType: 'sports_channel',
      },
      {
        id: 'dazn1-eu2',
        label: 'Señal Motor & Deportes HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://pig.footunder.online/stream/232',
        resolverType: 'sports_channel',
      },
      {
        id: 'dazn1-1',
        label: 'Señal Satélite DAZN 1',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://footunder.online/tvtodo/dazn3.php',
        resolverType: 'sports_channel',
      },
    ],
  },
  {
    id: 'dazn-2',
    dial: 71,
    name: 'DAZN 2',
    shortMark: 'DAZN 2',
    brandTone: '#E4E4E7',
    network: 'DAZN España',
    category: 'dazn',
    quality: '1080p HD',
    description: 'Segundo canal lineal DAZN España: Premier League, Moto2/Moto3, Serie A y ciclismo',
    channels: [
      {
        id: 'dazn2-1',
        label: 'Señal 24/7 Multideporte HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://pig.footunder.online/stream/232',
        resolverType: 'sports_channel',
      },
      {
        id: 'dazn2-ev',
        label: 'Señal Fútbol En Vivo HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://footunder.online/tvtodo/laliga.php',
        resolverType: 'sports_channel',
      },
      {
        id: 'dazn2-sat',
        label: 'Señal Satélite DAZN 2',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://pig.footunder.online/stream/446',
        resolverType: 'sports_channel',
      },
    ],
  },
  {
    id: 'dazn-3',
    dial: 196,
    name: 'DAZN 3',
    shortMark: 'DAZN 3',
    brandTone: '#D4D4D8',
    network: 'DAZN España',
    category: 'dazn',
    quality: '1080p HD',
    description: 'Canal multievento DAZN 3 para jornadas simultáneas de fútbol europeo y motor',
    channels: [
      {
        id: 'dazn3-ll',
        label: 'Señal DAZN Multievento HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://pig.footunder.online/stream/522',
        resolverType: 'sports_channel',
      },
      {
        id: 'dazn3-eu2',
        label: 'Señal Motor & Arena HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://pig.footunder.online/stream/232',
        resolverType: 'sports_channel',
      },
      {
        id: 'dazn3-1',
        label: 'Señal 24/7 DAZN 3 HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://footunder.online/tvtodo/dazn3.php',
        resolverType: 'sports_channel',
      },
      {
        id: 'dazn3-2',
        label: 'Señal Circuito F1 HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://pig.footunder.online/stream/60',
        resolverType: 'sports_channel',
      },
    ],
  },
  {
    id: 'dazn-4',
    dial: 197,
    name: 'DAZN 4',
    shortMark: 'DAZN 4',
    brandTone: '#A1A1AA',
    network: 'DAZN España',
    category: 'dazn',
    quality: '1080p HD',
    description: 'Cuarto canal lineal DAZN España para retransmisiones simultáneas en alta definición',
    channels: [
      {
        id: 'dazn4-1',
        label: 'Señal DAZN Motorsport 1080p',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://rbmn-live.akamaized.net/hls/live/590964/BoRB-AT/master.m3u8',
        resolverType: 'tdt_hls',
      },
      {
        id: 'dazn4-2',
        label: 'Señal Arena Multievento HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://footunder.online/tvtodo/mligacampeones.php',
        resolverType: 'sports_channel',
      },
    ],
  },
  {
    id: 'tdt-neox',
    dial: 10,
    name: 'Neox',
    shortMark: 'NEOX',
    brandTone: '#F59E0B',
    network: 'Atresmedia',
    category: 'cine_series',
    quality: '1080p HD',
    description: 'Los Simpson, The Big Bang Theory, comedia juvenil y cine taquillero',
    channels: [
      {
        id: 'neox-dvb',
        label: 'Antena TDT 1080p',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'http://90.163.85.113:8093/stream/22/index.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'tdt-fdf',
    dial: 8,
    name: 'Factoría de Ficción',
    shortMark: 'FDF',
    brandTone: '#10B981',
    network: 'Mediaset',
    category: 'cine_series',
    quality: '1080p HD',
    description: 'La Que Se Avecina, Aída, comedia española y series 24 horas',
    channels: [
      {
        id: 'fdf-dvb',
        label: 'Antena TDT 1080p',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'http://90.163.85.113:8093/stream/39/index.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'tdt-nova',
    dial: 9,
    name: 'Nova',
    shortMark: 'NOVA',
    brandTone: '#EC4899',
    network: 'Atresmedia',
    category: 'cine_series',
    quality: '1080p HD',
    description: 'Series internacionales, grandes estrenos románticos y cine familiar',
    channels: [
      {
        id: 'nova-dvb',
        label: 'Antena TDT 1080p',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'http://90.163.85.113:8093/stream/23/index.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'tdt-energy',
    dial: 10,
    name: 'Energy',
    shortMark: 'E.',
    brandTone: '#6366F1',
    network: 'Mediaset',
    category: 'cine_series',
    quality: '1080p HD',
    description: 'CSI, FBI, Mentes Criminales y las mejores series procedimentales',
    channels: [
      {
        id: 'energy-dvb',
        label: 'Antena TDT 1080p',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'http://90.163.85.113:8093/stream/18/index.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'tdt-atreseries',
    dial: 11,
    name: 'Atreseries',
    shortMark: 'A3S',
    brandTone: '#E11D48',
    network: 'Atresmedia',
    category: 'cine_series',
    quality: '1080p HD',
    description: 'Series españolas e internacionales en alta definición',
    channels: [
      {
        id: 'a3s-dvb',
        label: 'Antena TDT 1080p',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'http://90.163.85.113:8093/stream/24/index.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'tdt-bemad',
    dial: 12,
    name: 'Be Mad',
    shortMark: 'BMAD',
    brandTone: '#D97706',
    network: 'Mediaset',
    category: 'cine_series',
    quality: '1080p HD',
    description: 'Canal 100% cine de Hollywood en alta definición',
    channels: [
      {
        id: 'bemad-dvb',
        label: 'Antena TDT 1080p',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'http://90.163.85.113:8093/stream/25/index.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'tdt-paramount',
    dial: 13,
    name: 'Paramount Network',
    shortMark: 'PAR',
    brandTone: '#3B82F6',
    network: 'Paramount · TDT Cine',
    category: 'cine_series',
    quality: '1080p HD',
    description: 'Cine de estudio, thriller, acción y series clásicas de misterio',
    channels: [
      {
        id: 'paramount-dvb',
        label: 'Antena TDT Cine 1080p',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'http://90.163.85.113:8093/stream/50/index.m3u8',
        resolverType: 'tdt_hls',
      },
      {
        id: 'paramount-bom',
        label: 'Señal Cine Alternativa HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'http://90.163.85.113:8093/stream/35/index.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'tdt-bomcine',
    dial: 14,
    name: 'BOM Cine',
    shortMark: 'BOM',
    brandTone: '#B91C1C',
    network: 'TDT Cine',
    category: 'cine_series',
    quality: '1080p HD',
    description: 'Películas ininterrumpidas de todos los géneros las 24 horas',
    channels: [
      {
        id: 'bom-dvb',
        label: 'Antena TDT 1080p',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'http://90.163.85.113:8093/stream/35/index.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'tdt-mega',
    dial: 15,
    name: 'Mega',
    shortMark: 'MEGA',
    brandTone: '#DC2626',
    network: 'Atresmedia',
    category: 'entretenimiento',
    quality: '1080p HD',
    description: 'El Chiringuito de Jugones, Forjado a Fuego y docu-realities',
    channels: [
      {
        id: 'mega-dvb',
        label: 'Antena TDT 1080p',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'http://90.163.85.113:8093/stream/11/index.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'tdt-dmax',
    dial: 16,
    name: 'DMAX',
    shortMark: 'DMAX',
    brandTone: '#EA580C',
    network: 'Warner Bros. Discovery',
    category: 'entretenimiento',
    quality: '1080p HD',
    description: 'Aventura, motor, ciencia, supervivencia, historia y cine',
    channels: [
      {
        id: 'dmax-dvb',
        label: 'Antena TDT 1080p',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'http://90.163.85.113:8093/stream/51/index.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'tdt-divinity',
    dial: 17,
    name: 'Divinity',
    shortMark: 'DIV',
    brandTone: '#DB2777',
    network: 'Mediaset',
    category: 'entretenimiento',
    quality: '1080p HD',
    description: 'Reformas, decoración, lifestyle y grandes series románticas',
    channels: [
      {
        id: 'divinity-dvb',
        label: 'Antena TDT 1080p',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'http://90.163.85.113:8093/stream/40/index.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'tdt-dkiss',
    dial: 18,
    name: 'DKISS',
    shortMark: 'DKISS',
    brandTone: '#C026D3',
    network: 'TDT Nacional',
    category: 'entretenimiento',
    quality: '1080p HD',
    description: 'True crime, reformas, salud y entretenimiento factual',
    channels: [
      {
        id: 'dkiss-dvb',
        label: 'Antena TDT 1080p',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'http://90.163.85.113:8093/stream/4/index.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'tdt-ten',
    dial: 19,
    name: 'TEN',
    shortMark: 'TEN',
    brandTone: '#14B8A6',
    network: 'Secuoya',
    category: 'entretenimiento',
    quality: '1080p HD',
    description: 'Ni que fuéramos, investigación criminal, magacines y realities',
    channels: [
      {
        id: 'ten-dvb',
        label: 'Antena TDT 1080p',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'http://90.163.85.113:8093/stream/27/index.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'tdt-trece',
    dial: 20,
    name: 'TRECE',
    shortMark: '13',
    brandTone: '#0D9488',
    network: 'TRECE TV',
    category: 'entretenimiento',
    quality: '1080p HD',
    description: 'Cine western, cine clásico español, actualidad y tertulia',
    channels: [
      {
        id: 'trece-oficial',
        label: 'Señal Oficial HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl:
          'https://play.cdn.enetres.net/091DB7AFBD77442B9BA2F141DCC182F5021/021/playlist.m3u8',
        resolverType: 'tdt_hls',
      },
      {
        id: 'trece-dvb',
        label: 'Señal Antena TDT HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'http://90.163.85.113:8093/stream/15/index.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'tdt-24h',
    dial: 21,
    name: '24 Horas',
    shortMark: '24h',
    brandTone: '#EF4444',
    network: 'RTVE Noticias',
    category: 'noticias_deportes',
    quality: '1080p HD',
    description: 'Información continua nacional e internacional en tiempo real',
    channels: [
      {
        id: '24h-rtve',
        label: 'Señal Oficial RTVE HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://rtvelivestream.rtve.es/rtvesec/24h/24h_main.m3u8',
        resolverType: 'tdt_hls',
      },
      {
        id: '24h-dvb',
        label: 'Señal Antena TDT HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'http://90.163.85.113:8093/stream/44/index.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'tdt-teledeporte',
    dial: 22,
    name: 'Teledeporte',
    shortMark: 'TDP',
    brandTone: '#F97316',
    network: 'RTVE Deportes',
    category: 'noticias_deportes',
    quality: '1080p HD',
    description: 'Tenis, ciclismo, fútbol, atletismo, motor y Estudio Estadio en vivo',
    channels: [
      {
        id: 'tdp-dvb',
        label: 'Señal Antena TDT 1080p',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'http://90.163.85.113:8093/stream/43/index.m3u8',
        resolverType: 'tdt_hls',
      },
      {
        id: 'tdp-rtve',
        label: 'Señal Oficial RTVE HD (España)',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://rtvelivestream.rtve.es/rtvesec/tdp/tdp_main.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'tdt-rmtv',
    dial: 23,
    name: 'Real Madrid TV',
    shortMark: 'RMTV',
    brandTone: '#4F46E5',
    network: 'Deportes TDT',
    category: 'noticias_deportes',
    quality: '1080p HD',
    description: 'Actualidad blanca, ruedas de prensa, cantera, tertulia y cine',
    channels: [
      {
        id: 'rmtv-oficial',
        label: 'Señal Oficial HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://rmtv.akamaized.net/hls/live/2043153/rmtv-es-web/master.m3u8',
        resolverType: 'tdt_hls',
      },
      {
        id: 'rmtv-dvb',
        label: 'Señal Antena TDT HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'http://90.163.85.113:8093/stream/26/index.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'tdt-clan',
    dial: 24,
    name: 'Clan RTVE',
    shortMark: 'CLAN',
    brandTone: '#8B5CF6',
    network: 'RTVE Infantil',
    category: 'infantil_autonomicas',
    quality: '1080p HD',
    description: 'Series infantiles, animación familiar y cine juvenil',
    channels: [
      {
        id: 'clan-dvb',
        label: 'Señal Antena TDT 1080p',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'http://90.163.85.113:8093/stream/52/index.m3u8',
        resolverType: 'tdt_hls',
      },
      {
        id: 'clan-rtve',
        label: 'Señal Oficial RTVE HD (España)',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://rtvelivestream.rtve.es/rtvesec/clan/clan_main.m3u8',
        resolverType: 'tdt_hls',
      },
      {
        id: 'clan-boing-bk',
        label: 'Señal Infantil Alternativa HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'http://90.163.85.113:8093/stream/19/index.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'tdt-boing',
    dial: 25,
    name: 'Boing',
    shortMark: 'BOING',
    brandTone: '#06B6D4',
    network: 'Mediaset Infantil',
    category: 'infantil_autonomicas',
    quality: '1080p HD',
    description: 'Doraemon, Gumball, Dragon Ball, Teen Titans y Cartoon Network',
    channels: [
      {
        id: 'boing-dvb',
        label: 'Antena TDT 1080p',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'http://90.163.85.113:8093/stream/19/index.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'tdt-canalsur',
    dial: 26,
    name: 'Canal Sur',
    shortMark: 'CSUR',
    brandTone: '#16A34A',
    network: 'RTVA Andalucía',
    category: 'infantil_autonomicas',
    quality: '1080p HD',
    description: 'Televisión pública de Andalucía: entretenimiento, cine e informativos',
    channels: [
      {
        id: 'canalsur-dvb',
        label: 'Antena TDT 1080p',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'http://90.163.85.113:8093/stream/34/index.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'tdt-3cat',
    dial: 27,
    name: '3Cat (TV3)',
    shortMark: '3CAT',
    brandTone: '#E11D48',
    network: 'CCMA Catalunya',
    category: 'infantil_autonomicas',
    quality: '1080p HD',
    description: 'Emisión en directo de TV3Cat · Informativos, series y entretenimiento',
    channels: [
      {
        id: '3cat-oficial',
        label: 'Señal Oficial 3Cat HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://directes3-tv-int.3catdirectes.cat/live-content/tvi-hls/master.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'tdt-etb1',
    dial: 28,
    name: 'ETB 1',
    shortMark: 'ETB1',
    brandTone: '#0284C7',
    network: 'EITB Euskadi',
    category: 'infantil_autonomicas',
    quality: '1080p HD',
    description: 'Primer canal autonómico vasco · Deporte, pelota y actualidad',
    channels: [
      {
        id: 'etb1-oficial',
        label: 'Señal Oficial EITB HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://multimedia.eitb.eus/live-content/etb1hd-hls/master.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'tdt-etb2',
    dial: 29,
    name: 'ETB 2',
    shortMark: 'ETB2',
    brandTone: '#2563EB',
    network: 'EITB Euskadi',
    category: 'infantil_autonomicas',
    quality: '1080p HD',
    description: 'ETB 2 en castellano · Teleberri, concursos, cine y actualidad',
    channels: [
      {
        id: 'etb2-oficial',
        label: 'Señal Oficial EITB HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://multimedia.eitb.eus/live-content/etb2hd-hls/master.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'tdt-tvcanaria',
    dial: 30,
    name: 'TV Canaria',
    shortMark: 'RTVC',
    brandTone: '#EAB308',
    network: 'RTVC Canarias',
    category: 'infantil_autonomicas',
    quality: '1080p HD',
    description: 'Televisión Pública de Canarias · Directos, cine e informativos',
    channels: [
      {
        id: 'tvcanaria-oficial',
        label: 'Señal Oficial RTVC HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl:
          'https://rtvclive.flumotion.cloud/rtvc1live/smil:channel1PRG.smil/playlist.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
];

app.get('/api/catalog/tdt', (_req, res) => {
  res.json({
    success: true,
    channels: SPANISH_TDT_CHANNELS,
  });
});

// ============================================================================
// REAL-TIME SPANISH EPG ENGINE (TDT + MOVISTAR+ + DAZN + 3CAT)
// ============================================================================
interface RawEpgEvent {
  title: string;
  subtitle?: string;
  description?: string;
  category?: string;
  icon?: string;
  startMs: number;
  stopMs: number;
  isLiveSport?: boolean;
}

const EPG_CHANNEL_MAPPING: Record<string, { xmltv: string[]; tdtJson: string[] }> = {
  'tdt-la1': { xmltv: ['La 1 HD', 'La 1'], tdtJson: ['La1.TV'] },
  'tdt-la2': { xmltv: ['La 2', 'La 2 HD'], tdtJson: ['La2.TV'] },
  'tdt-antena3': { xmltv: ['Antena 3 HD', 'Antena 3'], tdtJson: ['Antena3.TV'] },
  'tdt-cuatro': { xmltv: ['Cuatro HD', 'Cuatro'], tdtJson: ['Cuatro.TV'] },
  'tdt-telecinco': { xmltv: ['Telecinco HD', 'Telecinco'], tdtJson: ['Telecinco.TV'] },
  'tdt-lasexta': { xmltv: ['La Sexta HD', 'La Sexta'], tdtJson: ['LaSexta.TV'] },
  'mplus-canal': { xmltv: ['Movistar Plus HD', 'M+ Cero'], tdtJson: [] },
  'mplus-vamos': { xmltv: ['M+ Vamos HD', 'M+ Vamos 2'], tdtJson: [] },
  'mplus-laliga': { xmltv: ['M+ LaLiga HD', 'M+ LaLiga HDR', 'M+ LaLiga 2 HD'], tdtJson: [] },
  'mplus-hypermotion': { xmltv: ['LaLiga TV Hypermotion HD', 'LaLiga TV Hypermotion 2'], tdtJson: [] },
  'mplus-champions': { xmltv: ['M+ Liga de Campeones HD', 'M+ Liga de Campeones 2 HD'], tdtJson: [] },
  'mplus-deportes': { xmltv: ['M+ Deportes HD', 'M+ Baloncesto'], tdtJson: [] },
  'mplus-deportes2': { xmltv: ['M+ Deportes 2 HD', 'M+ Deportes 3'], tdtJson: [] },
  'mplus-golf': { xmltv: ['M+ Golf HD', 'M+ Golf 2 HD'], tdtJson: [] },
  'mplus-eurosport1': { xmltv: ['Eurosport 1 HD'], tdtJson: [] },
  'mplus-eurosport2': { xmltv: ['Eurosport 2'], tdtJson: [] },
  'dazn-laliga': { xmltv: ['DAZN LaLiga HD', 'DAZN LaLiga 2 HD'], tdtJson: [] },
  'dazn-f1': { xmltv: ['DAZN F1 HD'], tdtJson: [] },
  'dazn-1': { xmltv: ['DAZN 1 HD', 'DAZN MotoGP'], tdtJson: [] },
  'dazn-2': { xmltv: ['DAZN 2 HD', 'DAZN Baloncesto'], tdtJson: [] },
  'dazn-3': { xmltv: ['DAZN 3 HD', 'DAZN Bundesliga'], tdtJson: [] },
  'dazn-4': { xmltv: ['DAZN 4 HD', 'Unbeaten (DAZN)', 'Red Bull TV (DAZN)'], tdtJson: [] },
  'tdt-neox': { xmltv: ['Neox'], tdtJson: ['Neox.TV'] },
  'tdt-fdf': { xmltv: ['Factoría de Ficción'], tdtJson: ['FDF.TV'] },
  'tdt-nova': { xmltv: ['Nova'], tdtJson: ['Nova.TV'] },
  'tdt-energy': { xmltv: ['Energy'], tdtJson: ['Energy.TV'] },
  'tdt-atreseries': { xmltv: ['Atreseries'], tdtJson: ['Atreseries.TV'] },
  'tdt-bemad': { xmltv: ['Be Mad'], tdtJson: ['Bemad.TV'] },
  'tdt-paramount': { xmltv: ['Paramount Network', 'Squirrel TV'], tdtJson: ['Paramount.TV'] },
  'tdt-bomcine': { xmltv: ['BOM Cine'], tdtJson: ['BOM.TV'] },
  'tdt-mega': { xmltv: ['Mega'], tdtJson: ['Mega.TV'] },
  'tdt-dmax': { xmltv: ['DMAX'], tdtJson: ['DMax.TV'] },
  'tdt-divinity': { xmltv: ['Divinity'], tdtJson: ['Divinity.TV'] },
  'tdt-dkiss': { xmltv: ['DKISS'], tdtJson: ['DKISS.TV'] },
  'tdt-ten': { xmltv: ['Ten'], tdtJson: ['TEN.TV'] },
  'tdt-trece': { xmltv: ['TRECE', 'TR3CE'], tdtJson: ['13.TV'] },
  'tdt-24h': { xmltv: ['24 Horas'], tdtJson: ['24Horas.TV'] },
  'tdt-teledeporte': { xmltv: ['Teledeporte'], tdtJson: ['TDP.TV'] },
  'tdt-rmtv': { xmltv: ['Real Madrid TV'], tdtJson: ['RMTV.TV'] },
  'tdt-clan': { xmltv: ['Clan'], tdtJson: ['Clan.TV'] },
  'tdt-boing': { xmltv: ['Boing'], tdtJson: ['Boing.TV'] },
  'tdt-canalsur': { xmltv: ['Canal Sur HD', 'Canal Sur Andalucía'], tdtJson: ['CanalSurA.TV'] },
  'tdt-3cat': { xmltv: ['TV3', 'TV3 Catalunya'], tdtJson: ['TV3.TV'] },
  'tdt-etb1': { xmltv: ['etb1'], tdtJson: ['ETB1.TV'] },
  'tdt-etb2': { xmltv: ['etb2'], tdtJson: ['ETB2.TV'] },
  'tdt-tvcanaria': { xmltv: ['TV Canaria', 'Atlántico TV'], tdtJson: ['TVCanaria.TV'] },
  'cat-sx3': { xmltv: ['SX3', 'SX3 Catalunya'], tdtJson: ['SX3.TV'] },
  'cat-tv3': { xmltv: ['TV3', 'TV3 Catalunya'], tdtJson: ['TV3.TV'] },
  'cat-324': { xmltv: ['3CatInfo', '3CatInfo Catalunya'], tdtJson: ['324.TV'] },
  'cat-c33': { xmltv: ['El 33 Catalunya'], tdtJson: ['C33.TV'] },
};

const madridTimeFormatter = new Intl.DateTimeFormat('es-ES', {
  timeZone: 'Europe/Madrid',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function formatMadridHHMM(ms: number): string {
  try {
    return madridTimeFormatter.format(new Date(ms));
  } catch {
    const d = new Date(ms);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
}

function decodeXmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

function parseXmltvTimeMs(raw: string): number {
  const m = raw.trim().match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\s*([+-])(\d{2})(\d{2}))?/);
  if (!m) return 0;
  const [, y, mo, d, h, mi, s, sign, offH, offM] = m;
  const utcBase = Date.UTC(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h),
    Number(mi),
    Number(s)
  );
  if (!sign) return utcBase;
  const offsetMs = (Number(offH) * 60 + Number(offM)) * 60_000 * (sign === '+' ? 1 : -1);
  return utcBase - offsetMs;
}

function isSportsProgramText(title: string, category: string): boolean {
  const txt = `${title} ${category}`.toLowerCase();
  return /fútbol|futbol|laliga|champions|premier|bundesliga|f1|fórmula 1|formula 1|motogp|baloncesto|nba|acb|euroliga|tenis|golf|ciclismo|boxeo|ufc|deporte|directo:\s| vs | - /i.test(
    txt
  );
}

let cachedEpgStore: { byChannel: Map<string, RawEpgEvent[]>; fetchedAt: number } | null = null;
let inflightEpgPromise: Promise<Map<string, RawEpgEvent[]>> | null = null;

async function loadSpanishEpgSchedule(): Promise<Map<string, RawEpgEvent[]>> {
  if (cachedEpgStore && Date.now() - cachedEpgStore.fetchedAt < 20 * 60 * 1000) {
    return cachedEpgStore.byChannel;
  }
  if (inflightEpgPromise) return inflightEpgPromise;

  inflightEpgPromise = (async () => {
    const result = new Map<string, RawEpgEvent[]>();
    const now = Date.now();
    const minWindow = now - 3 * 60 * 60 * 1000;
    const maxWindow = now + 18 * 60 * 60 * 1000;

    // Reverse lookup tables
    const xmltvToOurIds = new Map<string, { ourId: string; priority: number }[]>();
    const jsonToOurIds = new Map<string, string[]>();

    for (const [ourId, cfg] of Object.entries(EPG_CHANNEL_MAPPING)) {
      cfg.xmltv.forEach((xName, idx) => {
        const list = xmltvToOurIds.get(xName) || [];
        list.push({ ourId, priority: idx });
        xmltvToOurIds.set(xName, list);
      });
      cfg.tdtJson.forEach((jName) => {
        const list = jsonToOurIds.get(jName.toLowerCase()) || [];
        list.push(ourId);
        jsonToOurIds.set(jName.toLowerCase(), list);
      });
    }

    // 1. Stream-gunzip EPG_dobleM (Movistar+, DAZN, TDT & 3Cat complete XMLTV) with <5MB RAM
    try {
      const xmlByPriority = new Map<string, { priority: number; events: RawEpgEvent[] }>();
      const resp = await fetch(
        'https://raw.githubusercontent.com/davidmuma/EPG_dobleM/master/guiatv_sincolor.xml.gz',
        {
          headers: { 'User-Agent': CHROME_UA },
          signal: AbortSignal.timeout(14_000),
        }
      );

      if (resp.ok && resp.body) {
        const gunzip = zlib.createGunzip();
        gunzip.setEncoding('utf8');
        let leftover = '';

        await new Promise<void>((resolve) => {
          gunzip.on('data', (chunk: string) => {
            leftover += chunk;
            let endIdx = leftover.indexOf('</programme>');
            while (endIdx !== -1) {
              const block = leftover.slice(0, endIdx + 12);
              leftover = leftover.slice(endIdx + 12);
              endIdx = leftover.indexOf('</programme>');

              const pStart = block.indexOf('<programme ');
              if (pStart === -1) continue;
              const tagEnd = block.indexOf('>', pStart);
              if (tagEnd === -1) continue;
              const header = block.slice(pStart, tagEnd);

              const chMatch = header.match(/channel="([^"]+)"/);
              if (!chMatch) continue;
              const chName = decodeXmlEntities(chMatch[1]);
              const targets = xmltvToOurIds.get(chName);
              if (!targets) continue;

              const startMatch = header.match(/start="([^"]+)"/);
              const stopMatch = header.match(/stop="([^"]+)"/);
              if (!startMatch || !stopMatch) continue;

              const startMs = parseXmltvTimeMs(startMatch[1]);
              const stopMs = parseXmltvTimeMs(stopMatch[1]);
              if (!startMs || !stopMs || stopMs < minWindow || startMs > maxWindow) continue;

              const body = block.slice(tagEnd + 1);
              const titleM = body.match(/<title[^>]*>([\s\S]*?)<\/title>/);
              if (!titleM) continue;
              const title = decodeXmlEntities(titleM[1]);
              if (!title) continue;

              const subM = body.match(/<sub-title[^>]*>([\s\S]*?)<\/sub-title>/);
              const descM = body.match(/<desc[^>]*>([\s\S]*?)<\/desc>/);
              const catM = body.match(/<category[^>]*>([\s\S]*?)<\/category>/);
              const iconM = body.match(/<icon[^>]+src="([^"]+)"/);

              const category = catM ? decodeXmlEntities(catM[1]) : undefined;
              const ev: RawEpgEvent = {
                title,
                subtitle: subM ? decodeXmlEntities(subM[1]) : undefined,
                description: descM ? decodeXmlEntities(descM[1]) : undefined,
                category,
                icon: iconM ? iconM[1] : undefined,
                startMs,
                stopMs,
                isLiveSport: isSportsProgramText(title, category || ''),
              };

              for (const t of targets) {
                const cur = xmlByPriority.get(t.ourId);
                if (!cur || t.priority < cur.priority) {
                  xmlByPriority.set(t.ourId, { priority: t.priority, events: [ev] });
                } else if (t.priority === cur.priority) {
                  cur.events.push(ev);
                }
              }
            }
            if (leftover.length > 250_000) {
              leftover = leftover.slice(-60_000);
            }
          });
          gunzip.on('end', () => resolve());
          gunzip.on('error', () => resolve());
          Readable.fromWeb(resp.body as any)
            .on('error', () => resolve())
            .pipe(gunzip);
        });

        for (const [ourId, data] of xmlByPriority.entries()) {
          if (data.events.length > 0) {
            data.events.sort((a, b) => a.startMs - b.startMs);
            result.set(ourId, data.events);
          }
        }
      }
    } catch (err) {
      console.warn('EPG XMLTV stream warning:', err);
    }

    // 2. Fallback / complement from TDTChannels JSON EPG for any missing TDT channel
    try {
      const missingJsonTargets = Array.from(jsonToOurIds.values()).some((ids) =>
        ids.some((id) => !result.has(id))
      );
      if (missingJsonTargets) {
        const jResp = await fetch('https://www.tdtchannels.com/epg/TV.json', {
          headers: { 'User-Agent': CHROME_UA },
          signal: AbortSignal.timeout(8000),
        });
        if (jResp.ok) {
          const jList: any[] = await jResp.json();
          if (Array.isArray(jList)) {
            for (const entry of jList) {
              const nameKey = String(entry?.name || '').toLowerCase();
              const ourIds = jsonToOurIds.get(nameKey);
              if (!ourIds || !Array.isArray(entry?.events)) continue;
              const parsed: RawEpgEvent[] = [];
              for (const ev of entry.events) {
                const startMs = Number(ev.hi || 0) * 1000;
                const stopMs = Number(ev.hf || 0) * 1000;
                if (!startMs || !stopMs || stopMs < minWindow || startMs > maxWindow) continue;
                const title = String(ev.t || '').trim();
                if (!title) continue;
                const category = String(ev.g || '').trim() || undefined;
                parsed.push({
                  title,
                  description: String(ev.d || '').trim() || undefined,
                  category,
                  startMs,
                  stopMs,
                  isLiveSport: isSportsProgramText(title, category || ''),
                });
              }
              if (parsed.length > 0) {
                parsed.sort((a, b) => a.startMs - b.startMs);
                for (const oid of ourIds) {
                  if (!result.has(oid)) {
                    result.set(oid, parsed);
                  }
                }
              }
            }
          }
        }
      }
    } catch {
      // keep XMLTV results
    }

    if (result.size > 0) {
      cachedEpgStore = { byChannel: result, fetchedAt: Date.now() };
    }
    return result;
  })().finally(() => {
    inflightEpgPromise = null;
  });

  return inflightEpgPromise;
}

// Pre-warm Spanish EPG quietly in background (pure HTTP gunzip, <5MB RAM)
setTimeout(() => {
  loadSpanishEpgSchedule().catch(() => {});
}, 800);

app.get('/api/epg/live', async (_req, res) => {
  try {
    const store = await loadSpanishEpgSchedule();
    const now = Date.now();
    const epgMap: Record<string, any> = {};

    const allKnownChannelIds = Object.keys(EPG_CHANNEL_MAPPING);
    for (const chId of allKnownChannelIds) {
      const events = store.get(chId) || [];
      if (events.length === 0) continue;

      let nowIdx = events.findIndex((e) => e.startMs <= now && e.stopMs > now);
      if (nowIdx === -1) {
        nowIdx = events.findIndex((e) => e.startMs > now);
        if (nowIdx > 0) nowIdx = nowIdx - 1;
      }

      const activeEv =
        nowIdx >= 0 && events[nowIdx] && events[nowIdx].stopMs > now ? events[nowIdx] : null;
      const nextIdx = activeEv
        ? nowIdx + 1
        : events.findIndex((e) => e.startMs > now);
      const nextEv = nextIdx >= 0 && nextIdx < events.length ? events[nextIdx] : null;

      const upcomingSlice = events
        .filter((e) => e.stopMs > now)
        .slice(0, 8)
        .map((e) => ({
          title: e.title,
          subtitle: e.subtitle,
          description: e.description,
          category: e.category,
          icon: e.icon,
          startMs: e.startMs,
          stopMs: e.stopMs,
          startLabel: formatMadridHHMM(e.startMs),
          stopLabel: formatMadridHHMM(e.stopMs),
          isLiveSport: e.isLiveSport,
        }));

      let progressPct = 0;
      let remainingMin = 0;
      if (activeEv) {
        const dur = Math.max(1, activeEv.stopMs - activeEv.startMs);
        progressPct = Math.max(2, Math.min(99, Math.round(((now - activeEv.startMs) / dur) * 100)));
        remainingMin = Math.max(1, Math.ceil((activeEv.stopMs - now) / 60_000));
      }

      epgMap[chId] = {
        channelId: chId,
        now: activeEv
          ? {
              title: activeEv.title,
              subtitle: activeEv.subtitle,
              description: activeEv.description,
              category: activeEv.category,
              icon: activeEv.icon,
              startMs: activeEv.startMs,
              stopMs: activeEv.stopMs,
              startLabel: formatMadridHHMM(activeEv.startMs),
              stopLabel: formatMadridHHMM(activeEv.stopMs),
              isLiveSport: activeEv.isLiveSport,
            }
          : null,
        next: nextEv
          ? {
              title: nextEv.title,
              subtitle: nextEv.subtitle,
              description: nextEv.description,
              category: nextEv.category,
              icon: nextEv.icon,
              startMs: nextEv.startMs,
              stopMs: nextEv.stopMs,
              startLabel: formatMadridHHMM(nextEv.startMs),
              stopLabel: formatMadridHHMM(nextEv.stopMs),
              isLiveSport: nextEv.isLiveSport,
            }
          : null,
        upcoming: upcomingSlice,
        progressPct,
        remainingMin,
      };
    }

    res.setHeader('Cache-Control', 'public, max-age=45');
    res.json({
      success: true,
      serverTimeMs: now,
      madridTimeLabel: formatMadridHHMM(now),
      channelsCount: Object.keys(epgMap).length,
      epg: epgMap,
    });
  } catch (err) {
    console.warn('/api/epg/live error:', err);
    res.json({ success: true, serverTimeMs: Date.now(), epg: {} });
  }
});

// ============================================================================
// REST API: UNIVERSAL STREAM DECOMPILER (/api/extract/stream)
// ============================================================================
function parseYouTubeVideoId(url: string): string | null {
  const m = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|live\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/i
  );
  return m ? m[1] : null;
}

async function resolveTmdbIdByTitle(
  title: string,
  mediaType: 'movie' | 'tv',
  expectedYear?: string
): Promise<number | null> {
  try {
    const rawStr = String(title || '').trim();
    const clean = rawStr.replace(/\s*\([^)]*\)/g, '').trim();
    const parenPart = (rawStr.match(/\(([^)]+)\)/)?.[1] || '').trim();
    const normClean = normalizeTitleForMatch(clean || rawStr);
    const normParen = normalizeTitleForMatch(parenPart);
    if (!clean || normClean.length < 2) return null;

    const yearNum =
      expectedYear && /^\d{4}$/.test(expectedYear.trim()) ? Number(expectedYear.trim()) : 0;

    const res = await fetch(
      `https://api.themoviedb.org/3/search/${mediaType}?api_key=${TMDB_API_KEY}&language=es-ES&query=${encodeURIComponent(clean)}&page=1`,
      { signal: AbortSignal.timeout(3500) }
    );
    if (!res.ok) return null;
    const json: any = await res.json();
    const results: any[] = Array.isArray(json?.results) ? json.results : [];
    if (results.length === 0) return null;

    const matchesTitle = (r: any): boolean => {
      const rTitle = normalizeTitleForMatch(String(r?.title || r?.name || ''));
      const rOrig = normalizeTitleForMatch(String(r?.original_title || r?.original_name || ''));
      return (
        (rTitle.length >= 2 && (rTitle === normClean || (normParen.length >= 2 && rTitle === normParen))) ||
        (rOrig.length >= 2 && (rOrig === normClean || (normParen.length >= 2 && rOrig === normParen)))
      );
    };

    const matchesYear = (r: any): boolean => {
      if (!yearNum) return true;
      const rawDate = String(r?.release_date || r?.first_air_date || '').trim();
      const ry = rawDate.split('-')[0];
      if (!/^\d{4}$/.test(ry)) return false;
      return Math.abs(Number(ry) - yearNum) <= 1;
    };

    const exactYearAndTitle = results.find(
      (r) =>
        matchesTitle(r) &&
        yearNum > 0 &&
        Number(String(r?.release_date || r?.first_air_date || '').split('-')[0]) === yearNum
    );
    if (exactYearAndTitle?.id) return Number(exactYearAndTitle.id);

    const exactCompatible = results.find((r) => matchesTitle(r) && matchesYear(r));
    return exactCompatible?.id ? Number(exactCompatible.id) : null;
  } catch {
    return null;
  }
}

app.get('/api/extract/stream', async (req, res) => {
  const rawInput = String(req.query.url || '').trim();
  const movidyUrlParam = String(req.query.movidyUrl || '').trim();
  const resolverType = String(req.query.resolverType || '').trim();
  const preferLang = String(req.query.preferLang || req.query.lang || 'ES').toUpperCase();
  const titleHint = String(req.query.title || '').trim();
  const mediaTypeParam = String(req.query.mediaType || req.query.type || '').toLowerCase();
  const tmdbIdParam = String(req.query.tmdbId || '').replace(/\D/g, '');
  const seasonParam = parseInt(String(req.query.season || '0'), 10) || undefined;
  const episodeParam = parseInt(String(req.query.episode || '0'), 10) || undefined;
  const episodeTitleHint = String(req.query.episodeTitle || '').trim();

  if (!rawInput && !movidyUrlParam && !titleHint && !tmdbIdParam) {
    return res.status(400).json({ success: false, error: 'Falta el enlace o título del contenido.' });
  }

  const cacheKey = `${mediaTypeParam}|${tmdbIdParam}|${seasonParam || ''}|${episodeParam || ''}|${resolverType}|${preferLang}|${rawInput}|${movidyUrlParam}|${titleHint}`;
  const cached = extractionCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return res.json(cached);
  }

  try {
    // CASE 0: Live Spanish TDT Channel (`tdt_hls`) -> Stateless per-segment Progressive H.264 IDR + AAC via /api/hls-proxy
    // (100% stateless across multi-instance Cloud Run deployments — never expires or drops across load-balanced containers!)
    if (resolverType === 'tdt_hls' && rawInput) {

      const cleanCheckUrl = rawInput.replace(/[?&]profile=(hd|fast)\b/gi, '');
      const checkHeaders: Record<string, string> = {
        'User-Agent': isDvbHeadendStream(cleanCheckUrl) ? TDT_DVB_UA : CHROME_UA,
        Accept: '*/*',
      };
      let isAlive = false;
      try {
        const chk = await fetch(cleanCheckUrl, {
          headers: checkHeaders,
          signal: AbortSignal.timeout(4000),
        });
        if (chk.ok) {
          const txt = await chk.text();
          isAlive = txt.includes('#EXTM3U');
        }
      } catch {
        const fb = await curlGetText(cleanCheckUrl, checkHeaders, 5);
        isAlive = Boolean(fb.text && fb.text.includes('#EXTM3U'));
      }

      if (!isAlive) {
        return res.status(404).json({
          success: false,
          error: 'Esta señal TDT está temporalmente sin emisión. Prueba la señal alternativa.',
        });
      }

      const originRef = new URL(cleanCheckUrl).origin + '/';
      // Official Spanish public broadcaster HTTPS CDNs (`rtvelivestream.rtve.es`, `3catdirectes.cat`, `eitb.eus`)
      // send `Access-Control-Allow-Origin: *` for direct client playback in Spain, whereas proxying them through
      // a non-Spanish Cloud Run datacenter triggers HTTP 403 geo-blocks on `.ts` segments!
      const isDirectBrowserCorsPublicCdn =
        /^https:\/\/([^/]*\.)?(rtvelivestream\.rtve\.es|3catdirectes\.cat|eitb\.eus)\//i.test(
          cleanCheckUrl
        );
      const finalStreamUrl = isDirectBrowserCorsPublicCdn
        ? cleanCheckUrl
        : buildHlsProxyUrl(cleanCheckUrl, originRef, isDvbHeadendStream(cleanCheckUrl));

      const result: ExtractedStreamResult = {
        success: true,
        mode: 'hls',
        streamUrl: finalStreamUrl,
        rawStreamUrl: cleanCheckUrl,
        referer: originRef,
        title: titleHint || 'TV España en Directo',
        requestedLang: 'ES',
        resolvedLang: 'ES',
        expiresAt: Date.now() + 4 * 60 * 1000,
      };
      extractionCache.set(cacheKey, result);
      return res.json(result);
    }

    // CASE 1A: Direct Vidhide / Embed69 Spanish/Latino/VOSE track switch
    if (resolverType === 'vidhide_hls') {
      const unpacked = await unpackVidhideToHls(rawInput);
      if (!unpacked) {
        return res.status(404).json({ success: false, error: 'La pista seleccionada no está activa.' });
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
      extractionCache.set(cacheKey, result);
      return res.json(result);
    }

    // CASE 1A-2: Moe / Embed Sniff track switch (VOE / Streamwish / Filelions fallback)
    if (resolverType === 'embed_sniff' && rawInput) {
      const sniffed = await sniffStreamWithHeadless(rawInput);
      if (!sniffed) {
        return res.status(404).json({ success: false, error: 'La pista alternativa no está activa.' });
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
      extractionCache.set(cacheKey, result);
      return res.json(result);
    }

    // CASE 1B: Direct Movidy base64 track (`nupload.my`)
    if (
      (resolverType === 'movidy_embed' || rawInput.includes('nupload.')) &&
      !rawInput.includes('movidy.pw/ver/')
    ) {
      const decoded = await decodeNuploadToHls(rawInput);
      if (decoded) {
        const result: ExtractedStreamResult = {
          success: true,
          mode: 'hls',
          streamUrl: decoded.proxyUrl,
          rawStreamUrl: decoded.rawM3u8,
          requestedLang: preferLang,
          resolvedLang: preferLang,
          expiresAt: Date.now() + 15 * 60 * 1000,
        };
        extractionCache.set(cacheKey, result);
        return res.json(result);
      }
      return res.status(404).json({
        success: false,
        error: 'El servidor de esta pista Movidy no está activo ahora mismo.',
      });
    }

    // CASE 1C: Verified Web Embed Player track switch (`web_embed`)
    if (resolverType === 'web_embed' && rawInput) {
      const fullEmbedUrl = /^https?:\/\//i.test(rawInput) ? rawInput : `https://${rawInput}`;
      const result: ExtractedStreamResult = {
        success: true,
        mode: 'embed',
        streamUrl: fullEmbedUrl,
        rawStreamUrl: fullEmbedUrl,
        requestedLang: preferLang,
        resolvedLang: preferLang,
        expiresAt: Date.now() + 30 * 60 * 1000,
      };
      extractionCache.set(cacheKey, result);
      return res.json(result);
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
      extractionCache.set(cacheKey, result);
      return res.json(result);
    }

    // CASE 3: Direct .m3u8 or .mp4 URL
    if (/\.m3u8(\?|$)/i.test(rawInput)) {
      const originRef = new URL(rawInput).origin + '/';
      const result: ExtractedStreamResult = {
        success: true,
        mode: 'hls',
        streamUrl: buildHlsProxyUrl(rawInput, originRef),
        rawStreamUrl: rawInput,
        expiresAt: Date.now() + 15 * 60 * 1000,
      };
      extractionCache.set(cacheKey, result);
      return res.json(result);
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
      extractionCache.set(cacheKey, result);
      return res.json(result);
    }

    // CASE 4: UNIFIED MOVIE & TV SERIES MULTI-ENGINE (MOVIDY ES/LAT/VOSE + EMBED69/SERIESKAO ES/LAT/VOSE + BINGETRIX EN 1080P)
    const bingetrixTvMatch = rawInput.match(/bingetrix\.[a-z]+\/watch\/tv\/(\d+)\/(\d+)\/(\d+)/i);
    const bingetrixMovieMatch = rawInput.match(/bingetrix\.[a-z]+\/(?:watch|movie)\/(\d+)/i);
    const isMovidyLink =
      rawInput.includes('movidy.pw/ver/') || movidyUrlParam.includes('movidy.pw/ver/');

    const isCatalogMediaRequest =
      mediaTypeParam === 'movie' ||
      mediaTypeParam === 'tv' ||
      Boolean(tmdbIdParam) ||
      Boolean(bingetrixTvMatch) ||
      Boolean(bingetrixMovieMatch) ||
      isMovidyLink ||
      resolverType === 'bingetrix_en' ||
      (!rawInput && Boolean(titleHint));

    if (isCatalogMediaRequest && resolverType !== 'sports_channel') {
      let effectiveMediaType: 'movie' | 'tv' =
        mediaTypeParam === 'tv' || Boolean(bingetrixTvMatch) ? 'tv' : 'movie';

      const effectiveSeason = bingetrixTvMatch
        ? parseInt(bingetrixTvMatch[2], 10)
        : seasonParam || 1;
      const effectiveEpisode = bingetrixTvMatch
        ? parseInt(bingetrixTvMatch[3], 10)
        : episodeParam || 1;

      let resolvedTmdbId: string | number | null =
        tmdbIdParam ||
        (bingetrixTvMatch ? bingetrixTvMatch[1] : null) ||
        (bingetrixMovieMatch ? bingetrixMovieMatch[1] : null);

      const hasExplicitMovidyUrl =
        movidyUrlParam.includes('movidy.pw/ver/') || rawInput.includes('movidy.pw/ver/');
      let effectiveMovidyUrl = movidyUrlParam.includes('movidy.pw/ver/')
        ? movidyUrlParam
        : rawInput.includes('movidy.pw/ver/')
        ? rawInput
        : '';

      let extractedMovidyCleanTitle = '';
      let extractedMovidyYear = '';
      let tmdbVerifiedYear = '';

      // Inspect direct Movidy `/ver/...` link to detect TV Series (`id="eps"`), exact title, and exact release year
      if (effectiveMovidyUrl && (!mediaTypeParam || !resolvedTmdbId)) {
        const mvMeta = await fetchMovidyPageMetadata(effectiveMovidyUrl);
        if (mvMeta) {
          if (!mediaTypeParam && mvMeta.isTvShow) {
            effectiveMediaType = 'tv';
          }
          extractedMovidyCleanTitle = mvMeta.cleanTitle;
          extractedMovidyYear = mvMeta.year;
        }
      }

      if (!resolvedTmdbId && titleHint) {
        resolvedTmdbId = await resolveTmdbIdByTitle(
          titleHint,
          effectiveMediaType,
          extractedMovidyYear || undefined
        );
      }

      if (!resolvedTmdbId && extractedMovidyCleanTitle) {
        resolvedTmdbId = await resolveTmdbIdByTitle(
          extractedMovidyCleanTitle,
          effectiveMediaType,
          extractedMovidyYear || undefined
        );
      }

      if (!resolvedTmdbId && effectiveMovidyUrl) {
        const slug =
          effectiveMovidyUrl
            .split('/ver/')[1]
            ?.replace(/\//g, '')
            .replace(/-\d+$/, '')
            .replace(/-/g, ' ') || '';
        if (slug) {
          resolvedTmdbId = await resolveTmdbIdByTitle(
            slug,
            effectiveMediaType,
            extractedMovidyYear || undefined
          );
        }
      }

      if (effectiveMediaType === 'movie' && resolvedTmdbId && !hasExplicitMovidyUrl) {
        try {
          const tmRes = await fetch(
            `https://api.themoviedb.org/3/movie/${resolvedTmdbId}?api_key=${TMDB_API_KEY}&language=es-ES`,
            { signal: AbortSignal.timeout(3000) }
          );
          if (tmRes.ok) {
            const tmJson: any = await tmRes.json();
            const esTitle = String(tmJson?.title || '').trim();
            const origTitle = String(tmJson?.original_title || '').trim();
            tmdbVerifiedYear = String(tmJson?.release_date || '').split('-')[0] || '';

            if (!effectiveMovidyUrl && titleHint) {
              effectiveMovidyUrl =
                (await findMovidyUrlByTitle(titleHint, tmdbVerifiedYear)) || '';
            }
            if (
              !effectiveMovidyUrl &&
              esTitle &&
              esTitle.toLowerCase() !== titleHint.toLowerCase()
            ) {
              effectiveMovidyUrl =
                (await findMovidyUrlByTitle(esTitle, tmdbVerifiedYear)) || '';
            }
            if (
              !effectiveMovidyUrl &&
              origTitle &&
              origTitle.toLowerCase() !== esTitle.toLowerCase()
            ) {
              effectiveMovidyUrl =
                (await findMovidyUrlByTitle(origTitle, tmdbVerifiedYear)) || '';
            }
          }
        } catch {
          // ignore
        }
      } else if (effectiveMediaType === 'movie' && !effectiveMovidyUrl && titleHint) {
        effectiveMovidyUrl = (await findMovidyUrlByTitle(titleHint)) || '';
      }

      const combinedTitleHints = [titleHint, extractedMovidyCleanTitle].filter(Boolean);

      const [movidyTracks, esTracks, enTracks] = await Promise.all([
        effectiveMediaType === 'movie' && effectiveMovidyUrl
          ? extractMovidyPageTracks(
              effectiveMovidyUrl,
              hasExplicitMovidyUrl
                ? undefined
                : { expectedYear: tmdbVerifiedYear || undefined, requireMovieOnly: true }
            )
          : Promise.resolve([]),
        resolvedTmdbId || combinedTitleHints.length > 0
          ? extractEmbed69SpanishTracks({
              tmdbId: resolvedTmdbId || undefined,
              mediaType: effectiveMediaType,
              season: effectiveSeason,
              episode: effectiveEpisode,
              titleHints: combinedTitleHints,
            })
          : Promise.resolve([]),
        resolvedTmdbId
          ? extractBingetrixEnglishTracks({
              tmdbId: resolvedTmdbId,
              mediaType: effectiveMediaType,
              season: effectiveSeason,
              episode: effectiveEpisode,
            })
          : Promise.resolve([]),
      ]);

      // Combine all discovered tracks and sort by requested language priority
      const allDiscovered: TrackRecord[] = hasExplicitMovidyUrl
        ? [...movidyTracks, ...esTracks, ...enTracks]
        : [...esTracks, ...movidyTracks, ...enTracks];

      const getLangScore = (trackLang: string): number => {
        const tl = String(trackLang || '').toUpperCase();
        if (preferLang === 'EN') {
          if (tl === 'EN') return 1;
          if (tl === 'VOSE') return 2;
          if (tl === 'ES') return 3;
          if (tl === 'LAT') return 4;
          return 5;
        }
        if (preferLang === 'LAT') {
          if (tl === 'LAT') return 1;
          if (tl === 'ES') return 2;
          if (tl === 'VOSE') return 3;
          if (tl === 'EN') return 4;
          return 5;
        }
        if (preferLang === 'VOSE') {
          if (tl === 'VOSE') return 1;
          if (tl === 'EN') return 2;
          if (tl === 'ES') return 3;
          if (tl === 'LAT') return 4;
          return 5;
        }
        // Default preferLang === 'ES' (Castellano first, then Latino, then VOSE, then EN)
        if (tl === 'ES') return 1;
        if (tl === 'LAT') return 2;
        if (tl === 'VOSE') return 3;
        if (tl === 'EN') return 4;
        return 5;
      };

      const resolverPriority = (rt: string): number => {
        if (rt === 'vidhide_hls' || rt === 'movidy_embed' || rt === 'bingetrix_en') return 1;
        if (rt === 'embed_sniff') return 2;
        if (rt === 'web_embed') return 3;
        return 4;
      };

      const orderedTracks: TrackRecord[] = [...allDiscovered].sort((a, b) => {
        const lDiff = getLangScore(a.lang) - getLangScore(b.lang);
        if (lDiff !== 0) return lDiff;
        return resolverPriority(a.resolverType) - resolverPriority(b.resolverType);
      });

      // Resolve the first available track that produces a valid proxied HLS stream,
      // and immediately prune any candidate that fails unpacking so dead tracks never reach the UI
      let primaryStreamUrl = '';
      let primaryMode: 'hls' | 'direct' | 'embed' = 'hls';
      let resolvedTrack: TrackRecord | null = null;
      const deadTrackIndices = new Set<number>();

      // Pass 1: Prefer native `<video>` HLS / MP4 tracks (`vidhide_hls`, `movidy_embed`, `bingetrix_en`, `embed_sniff`)
      for (let i = 0; i < orderedTracks.length; i++) {
        const candidate = orderedTracks[i];
        if (candidate.resolverType === 'web_embed') {
          continue;
        }
        if (candidate.resolvedStreamUrl) {
          primaryStreamUrl = candidate.resolvedStreamUrl;
          resolvedTrack = candidate;
          break;
        }
        if (candidate.resolverType === 'movidy_embed') {
          const decoded = await decodeNuploadToHls(candidate.sourceUrl);
          if (decoded) {
            orderedTracks[i] = { ...candidate, resolvedStreamUrl: decoded.proxyUrl };
            primaryStreamUrl = decoded.proxyUrl;
            resolvedTrack = orderedTracks[i];
            break;
          } else {
            deadTrackIndices.add(i);
          }
        } else if (candidate.resolverType === 'vidhide_hls') {
          const unpacked = await unpackVidhideToHls(candidate.sourceUrl);
          if (unpacked) {
            orderedTracks[i] = { ...candidate, resolvedStreamUrl: unpacked.proxyUrl };
            primaryStreamUrl = unpacked.proxyUrl;
            resolvedTrack = orderedTracks[i];
            break;
          } else {
            deadTrackIndices.add(i);
          }
        } else if (candidate.resolverType === 'embed_sniff') {
          const sniffed = await sniffStreamWithHeadless(candidate.sourceUrl);
          if (sniffed) {
            const proxiedUrl = sniffed.isDirectMp4
              ? buildTsProxyUrl(sniffed.streamUrl, sniffed.referer)
              : buildHlsProxyUrl(sniffed.streamUrl, sniffed.referer);
            orderedTracks[i] = { ...candidate, resolvedStreamUrl: proxiedUrl };
            primaryStreamUrl = proxiedUrl;
            primaryMode = sniffed.isDirectMp4 ? 'direct' : 'hls';
            resolvedTrack = orderedTracks[i];
            break;
          } else {
            deadTrackIndices.add(i);
          }
        }
      }

      // Pass 2: If user explicitly requested Castellano ('ES') and no native ES HLS was available (or no native stream at all),
      // check if a verified Castellano `web_embed` server (e.g. GnulaHD OK.ru / Byse Castellano) is available before falling back to LAT/EN!
      if (!primaryStreamUrl || (preferLang === 'ES' && String(resolvedTrack?.lang || '').toUpperCase() !== 'ES')) {
        const esWebIdx = orderedTracks.findIndex(
          (t, idx) =>
            !deadTrackIndices.has(idx) &&
            t.resolverType === 'web_embed' &&
            (preferLang === 'ES' ? String(t.lang || '').toUpperCase() === 'ES' : !primaryStreamUrl)
        );
        if (esWebIdx !== -1 && !primaryStreamUrl) {
          const webCand = orderedTracks[esWebIdx];
          orderedTracks[esWebIdx] = { ...webCand, resolvedStreamUrl: webCand.sourceUrl };
          primaryStreamUrl = webCand.sourceUrl;
          primaryMode = 'embed';
          resolvedTrack = orderedTracks[esWebIdx];
        }
      }

      if (primaryStreamUrl) {
        const validTracks = orderedTracks.filter((_, idx) => !deadTrackIndices.has(idx));
        const resolvedLang = String(resolvedTrack?.lang || preferLang).toUpperCase();
        const resolvedLabel = resolvedTrack?.label || preferLang;
        const availableLanguages = Array.from(
          new Set(validTracks.map((t) => String(t.lang || '').toUpperCase()).filter(Boolean))
        );
        const languageFallbackUsed =
          (preferLang === 'ES' && resolvedLang !== 'ES') ||
          (preferLang === 'LAT' && resolvedLang !== 'LAT') ||
          (preferLang === 'VOSE' && resolvedLang !== 'VOSE') ||
          (preferLang === 'EN' && resolvedLang !== 'EN');

        const displayTitle =
          titleHint ||
          (extractedMovidyCleanTitle
            ? effectiveMediaType === 'tv'
              ? `${extractedMovidyCleanTitle} · ${effectiveSeason}x${String(
                  effectiveEpisode
                ).padStart(2, '0')}`
              : extractedMovidyCleanTitle
            : 'NAIMCINE HD');

        const result: ExtractedStreamResult = {
          success: true,
          mode: primaryMode,
          streamUrl: primaryStreamUrl,
          title: displayTitle,
          tracks: validTracks,
          requestedLang: preferLang,
          resolvedLang,
          resolvedLabel,
          languageFallbackUsed,
          availableLanguages,
          expiresAt: Date.now() + 8 * 60 * 1000,
        };
        extractionCache.set(cacheKey, result);
        return res.json(result);
      }

      // ======================================================================
      // UNIVERSAL ZERO-DEAD-END PLAYBACK FALLBACK (ONLY WHEN DIRECT HLS = 0)
      // Combines YouTube full-episode/movie search + verified multi-server web
      // players so every episode/movie plays immediately without 404 dead ends.
      // ======================================================================
      const fallbackBaseTitle =
        titleHint || extractedMovidyCleanTitle || '';
      const displayFallbackTitle =
        titleHint ||
        (extractedMovidyCleanTitle
          ? effectiveMediaType === 'tv'
            ? `${extractedMovidyCleanTitle} · ${effectiveSeason}x${String(
                effectiveEpisode
              ).padStart(2, '0')}`
            : extractedMovidyCleanTitle
          : 'NAIMCINE HD');

      const parseYtSec = (durText: string): number => {
        const clean = String(durText || '').trim();
        if (!clean || /live|directo/i.test(clean)) return 0;
        const parts = clean.split(':').map((p) => parseInt(p.replace(/\D/g, ''), 10));
        if (parts.some((n) => Number.isNaN(n))) return 0;
        if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
        if (parts.length === 2) return parts[0] * 60 + parts[1];
        return 0;
      };

      const searchYouTubeFullFallback = async (): Promise<{
        track: TrackRecord;
        exactEpisodeMatch: boolean;
      } | null> => {
        const cleanMain = fallbackBaseTitle
          .replace(/\s*\([^)]*\)/g, '')
          .replace(/[,:;!?]+/g, ' ')
          .trim();
        if (cleanMain.length < 2) return null;

        const shortMain = cleanMain.split(/\s+/).slice(0, 4).join(' ');
        const isGenericEpTitle =
          !episodeTitleHint ||
          /^(episodio|episode|cap[ií]tulo|cap\.?|ep\.?)\s*\d+$/i.test(episodeTitleHint.trim());

        const langKeywords =
          preferLang === 'LAT'
            ? 'español latino'
            : preferLang === 'VOSE'
            ? 'sub español'
            : preferLang === 'EN'
            ? 'english'
            : 'español castellano';

        const queries: string[] = [];
        if (effectiveMediaType === 'tv') {
          if (!isGenericEpTitle && episodeTitleHint.length >= 3) {
            queries.push(`${shortMain} ${episodeTitleHint} ${preferLang === 'EN' ? 'full episode' : 'español'}`);
          }
          queries.push(
            preferLang === 'EN'
              ? `${shortMain} season ${effectiveSeason} episode ${effectiveEpisode} full episode`
              : `${shortMain} capitulo ${effectiveEpisode} ${langKeywords} completo`
          );
        } else {
          queries.push(
            preferLang === 'EN'
              ? `${shortMain} full movie`
              : `${shortMain} pelicula completa ${langKeywords}`
          );
        }

        const normMainTokens = normalizeTitleForMatch(shortMain)
          .split(/\s+/)
          .filter((w) => w.length >= 3);
        const normEpTitle = !isGenericEpTitle ? normalizeTitleForMatch(episodeTitleHint) : '';
        const epNumRegex = new RegExp(`\\b0*${effectiveEpisode}\\b`);

        for (const q of queries.slice(0, 2)) {
          try {
            const ytRes = await fetch(
              `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&hl=es`,
              {
                headers: {
                  'User-Agent': CHROME_UA,
                  'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
                },
                signal: AbortSignal.timeout(3800),
              }
            );
            if (!ytRes.ok) continue;
            const html = await ytRes.text();
            const initMatch = html.match(/var\s+ytInitialData\s*=\s*(\{[\s\S]+?\});<\/script>/);
            if (!initMatch) continue;
            const ytData = JSON.parse(initMatch[1]);
            const sections =
              ytData?.contents?.twoColumnSearchResultsRenderer?.primaryContents
                ?.sectionListRenderer?.contents || [];

            for (const sec of sections) {
              const items = sec?.itemSectionRenderer?.contents || [];
              for (const item of items) {
                const vr = item?.videoRenderer;
                if (!vr?.videoId) continue;
                const vTitle = vr.title?.runs?.map((r: any) => r.text).join('') || '';
                const durStr = vr.lengthText?.simpleText || '';
                const durSec = parseYtSec(durStr);

                if (effectiveMediaType === 'tv') {
                  if (durSec < 360 || durSec > 7200) continue;
                } else {
                  if (durSec < 2700 || durSec > 14400) continue;
                }

                if (
                  /\b(trailer|tráiler|teaser|reaction|reaccion|reacción|review|resumen|opening|ending|amv|ost|soundtrack|gameplay|parodia|parody|shorts|#shorts)\b/i.test(
                    vTitle
                  )
                ) {
                  continue;
                }

                const normVTitle = normalizeTitleForMatch(vTitle);
                if (
                  normMainTokens.length > 0 &&
                  !normMainTokens.some((tok) => normVTitle.includes(tok))
                ) {
                  continue;
                }

                const exactEpisodeMatch =
                  effectiveMediaType === 'movie' ||
                  epNumRegex.test(vTitle) ||
                  Boolean(normEpTitle && normEpTitle.length >= 4 && normVTitle.includes(normEpTitle));

                const ytLangCode =
                  preferLang === 'LAT'
                    ? 'LAT'
                    : preferLang === 'VOSE'
                    ? 'VOSE'
                    : preferLang === 'EN'
                    ? 'EN'
                    : 'ES';
                const ytLangName =
                  ytLangCode === 'LAT'
                    ? 'Latino'
                    : ytLangCode === 'VOSE'
                    ? 'VOSE'
                    : ytLangCode === 'EN'
                    ? 'Inglés'
                    : 'Español';

                return {
                  track: {
                    id: `yt-fallback-${vr.videoId}`,
                    label: `YouTube · ${ytLangName} (${durStr})`,
                    lang: ytLangCode,
                    quality: 'HD',
                    sourceUrl: `https://www.youtube.com/watch?v=${vr.videoId}`,
                    resolverType: 'youtube',
                    resolvedStreamUrl: vr.videoId,
                  },
                  exactEpisodeMatch,
                };
              }
            }
          } catch {
            // continue to next query or web embed
          }
        }
        return null;
      };

      const buildWebEmbedTracks = (): TrackRecord[] => {
        if (!resolvedTmdbId) return [];
        const idStr = String(resolvedTmdbId);
        const s = Math.max(1, effectiveSeason || 1);
        const e = Math.max(1, effectiveEpisode || 1);
        const rawEntries =
          effectiveMediaType === 'tv'
            ? [
                {
                  id: `embed-vidlink-${idStr}-${s}-${e}`,
                  label: 'Servidor Web 1 · Multi-Audio HD',
                  url: `https://vidlink.pro/tv/${idStr}/${s}/${e}?autoplay=true&primaryColor=e11d48`,
                },
                {
                  id: `embed-vidfast-${idStr}-${s}-${e}`,
                  label: 'Servidor Web 2 · VidFast HD',
                  url: `https://vidfast.pro/tv/${idStr}/${s}/${e}?autoPlay=true&theme=E11D48`,
                },
                {
                  id: `embed-111movies-${idStr}-${s}-${e}`,
                  label: 'Servidor Web 3 · 111Movies HD',
                  url: `https://111movies.com/tv/${idStr}/${s}/${e}`,
                },
                {
                  id: `embed-2embed-${idStr}-${s}-${e}`,
                  label: 'Servidor Web 4 · 2Embed',
                  url: `https://www.2embed.cc/embedtv/${idStr}&s=${s}&e=${e}`,
                },
              ]
            : [
                {
                  id: `embed-vidlink-${idStr}`,
                  label: 'Servidor Web 1 · Multi-Audio HD',
                  url: `https://vidlink.pro/movie/${idStr}?autoplay=true&primaryColor=e11d48`,
                },
                {
                  id: `embed-vidfast-${idStr}`,
                  label: 'Servidor Web 2 · VidFast HD',
                  url: `https://vidfast.pro/movie/${idStr}?autoPlay=true&theme=E11D48`,
                },
                {
                  id: `embed-111movies-${idStr}`,
                  label: 'Servidor Web 3 · 111Movies HD',
                  url: `https://111movies.com/movie/${idStr}`,
                },
                {
                  id: `embed-2embed-${idStr}`,
                  label: 'Servidor Web 4 · 2Embed',
                  url: `https://www.2embed.cc/embed/${idStr}`,
                },
              ];

        return rawEntries.map((entry) => ({
          id: entry.id,
          label: entry.label,
          lang: preferLang || 'EN',
          quality: '1080p',
          sourceUrl: entry.url,
          resolverType: 'web_embed' as const,
          resolvedStreamUrl: entry.url,
        }));
      };

      const [ytFallback, embedFallbackTracks] = await Promise.all([
        searchYouTubeFullFallback(),
        Promise.resolve(buildWebEmbedTracks()),
      ]);

      const prioritizeYoutube =
        Boolean(ytFallback) &&
        (embedFallbackTracks.length === 0 ||
          ((preferLang === 'ES' || preferLang === 'LAT') && ytFallback!.exactEpisodeMatch));

      const combinedFallbackTracks: TrackRecord[] = prioritizeYoutube
        ? [ytFallback!.track, ...embedFallbackTracks]
        : ytFallback
        ? [embedFallbackTracks[0], ytFallback.track, ...embedFallbackTracks.slice(1)].filter(
            Boolean
          )
        : embedFallbackTracks;

      if (combinedFallbackTracks.length > 0) {
        const firstTrack = combinedFallbackTracks[0];
        const fallbackMode: ExtractedStreamResult['mode'] =
          firstTrack.resolverType === 'youtube' ? 'youtube' : 'embed';
        const fallbackResult: ExtractedStreamResult = {
          success: true,
          mode: fallbackMode,
          streamUrl: firstTrack.resolvedStreamUrl || firstTrack.sourceUrl,
          rawStreamUrl: firstTrack.sourceUrl,
          youtubeId:
            firstTrack.resolverType === 'youtube' ? firstTrack.resolvedStreamUrl : undefined,
          title: displayFallbackTitle,
          tracks: combinedFallbackTracks,
          requestedLang: preferLang,
          resolvedLang: firstTrack.lang || preferLang,
          resolvedLabel: firstTrack.label,
          languageFallbackUsed: false,
          availableLanguages: Array.from(
            new Set(combinedFallbackTracks.map((t) => String(t.lang || '').toUpperCase()))
          ),
          expiresAt: Date.now() + 10 * 60 * 1000,
        };
        extractionCache.set(cacheKey, fallbackResult);
        return res.json(fallbackResult);
      }
    }

    // CASE 5: Live Sports Channel / External Web URL -> Pure Crypto Direct (<350ms) + Green-Screen Guard + Safe Fallback
    if (rawInput) {
      const fullTargetUrl = /^https?:\/\//i.test(rawInput) ? rawInput : `https://${rawInput}`;
      const directSports = await extractLiveSportsHlsDirect(fullTargetUrl);

      if (directSports?.isBrokenGreenFeed) {
        return res.status(502).json({
          success: false,
          canUseCloudBrowser: false,
          error: 'Señal satélite en mantenimiento temporal; cambiando automáticamente a señal alternativa.',
        });
      }

      // For sports_channel tracks on known mirrors (footunder / tilinhd), skip slow headless Chrome if direct HTTP failed
      const isKnownDirectMirror = /footunder\.online|tilinhd\./i.test(fullTargetUrl);
      if (!directSports && resolverType === 'sports_channel' && isKnownDirectMirror) {
        return res.status(404).json({
          success: false,
          canUseCloudBrowser: false,
          error: 'Esta señal alternativa no está activa ahora mismo; saltando a otra pista.',
        });
      }

      const sniffed = directSports || (await sniffStreamWithHeadless(fullTargetUrl));

      if (sniffed && sniffed.streamUrl) {
        if (!sniffed.isDirectMp4 && resolverType === 'sports_channel') {
          const checkM3u = await fetchSportsHtmlHop(sniffed.streamUrl, sniffed.referer);
          if (checkM3u.includes('#EXTM3U')) {
            const clean = await verifyM3u8HasCleanVideoFrame(
              checkM3u,
              sniffed.streamUrl,
              sniffed.referer
            );
            if (!clean) {
              return res.status(502).json({
                success: false,
                canUseCloudBrowser: false,
                error: 'Señal con interferencias descartada automáticamente; saltando a respaldo HD.',
              });
            }
          }
        }

        const proxiedUrl = sniffed.isDirectMp4
          ? buildTsProxyUrl(sniffed.streamUrl, sniffed.referer)
          : buildHlsProxyUrl(sniffed.streamUrl, sniffed.referer);

        const result: ExtractedStreamResult = {
          success: true,
          mode: sniffed.isDirectMp4 ? 'direct' : 'hls',
          streamUrl: proxiedUrl,
          rawStreamUrl: sniffed.streamUrl,
          referer: sniffed.referer,
          expiresAt: Date.now() + 3 * 60 * 1000,
        };
        extractionCache.set(cacheKey, result);
        return res.json(result);
      }

      // If no raw HLS/MP4 stream was sniffed, check if the external source allows clean iframe embedding;
      // otherwise automatically launch it in the ad-free Cloud Browser so playback never hits a 404 wall!
      let canFrame = false;
      try {
        const probeController = new AbortController();
        const probeTimer = setTimeout(() => probeController.abort(), 3000);
        const probeRes = await fetch(fullTargetUrl, {
          headers: { 'User-Agent': CHROME_UA },
          signal: probeController.signal,
        });
        clearTimeout(probeTimer);
        const xfo = String(probeRes.headers.get('x-frame-options') || '').toLowerCase();
        const csp = String(probeRes.headers.get('content-security-policy') || '').toLowerCase();
        probeController.abort();
        const blockedByXfo = xfo.includes('deny') || xfo.includes('sameorigin');
        const blockedByCsp =
          csp.includes('frame-ancestors') &&
          !csp.includes('frame-ancestors *') &&
          !csp.includes('frame-ancestors https:');
        canFrame = probeRes.ok && !blockedByXfo && !blockedByCsp;
      } catch {
        canFrame = false;
      }

      const extFallbackResult: ExtractedStreamResult = {
        success: true,
        mode: canFrame ? 'embed' : 'cloud',
        streamUrl: fullTargetUrl,
        rawStreamUrl: fullTargetUrl,
        title: titleHint || 'Señal Web Directa',
        tracks: canFrame
          ? [
              {
                id: 'ext-web-embed-1',
                label: 'Reproductor Web Integrado',
                lang: preferLang || 'ES',
                sourceUrl: fullTargetUrl,
                resolverType: 'web_embed',
                resolvedStreamUrl: fullTargetUrl,
              },
            ]
          : [],
        expiresAt: Date.now() + 2 * 60 * 1000,
      };
      return res.json(extFallbackResult);
    }

    return res.status(404).json({
      success: false,
      canUseCloudBrowser: true,
      error:
        'No se encontró ninguna señal activa para este enlace.',
    });
  } catch (err) {
    console.error('Extract stream error:', err);
    return res.status(500).json({
      success: false,
      canUseCloudBrowser: true,
      error: 'Error temporal al extraer el flujo de vídeo.',
    });
  }
});

// ============================================================================
// REST API: RICH MEDIA DETAILS (4K TRAILER, CAST, RUNTIME, SIMILAR)
// ============================================================================
const richDetailsCache = new Map<string, { details: any; ts: number }>();

app.get('/api/catalog/details/:mediaType/:tmdbId', async (req, res) => {
  try {
    const mediaType = req.params.mediaType === 'tv' ? 'tv' : 'movie';
    let cleanId = String(req.params.tmdbId || '').replace(/\D/g, '');
    const titleHint = String(req.query.title || '').trim();
    const movidyUrlHint = String(req.query.movidyUrl || '').trim();

    let movidyMeta: MovidyPageMetadata | null = null;
    if ((!cleanId || cleanId === '0') && movidyUrlHint) {
      movidyMeta = await fetchMovidyPageMetadata(movidyUrlHint);
    }

    if ((!cleanId || cleanId === '0') && (movidyMeta?.cleanTitle || titleHint)) {
      const resolved = await resolveTmdbIdByTitle(
        movidyMeta?.cleanTitle || titleHint,
        mediaType,
        movidyMeta?.year || undefined
      );
      if (resolved) cleanId = String(resolved);
    }

    // If a Movidy movie has no exact TMDB match (e.g. brand-new release or homonym from another year),
    // return Movidy's own verified metadata & languages so the modal NEVER jumps to an unrelated TMDB movie!
    if ((!cleanId || cleanId === '0') && movidyMeta) {
      const availableLanguages = await probeAvailableLanguages({
        tmdbId: '',
        mediaType,
        titleHints: [movidyMeta.cleanTitle || titleHint].filter(Boolean),
        movidyUrl: movidyUrlHint,
        yearHint: movidyMeta.year || undefined,
      });
      return res.json({
        success: true,
        details: {
          tmdbId: undefined,
          mediaType: movidyMeta.isTvShow ? 'tv' : mediaType,
          title: titleHint || movidyMeta.cleanTitle || 'Película',
          originalTitle: movidyMeta.cleanTitle || undefined,
          year: movidyMeta.year || 'HD',
          rating: '',
          runtimeText: movidyMeta.durationText || undefined,
          genres: [],
          overview: movidyMeta.overview || '',
          poster: '',
          backdrop: '',
          directorOrCreator: movidyMeta.director || undefined,
          watchProviders: [],
          availableLanguages,
          cast: movidyMeta.cast,
          similar: [],
        },
      });
    }

    if (!cleanId || cleanId === '0') return res.status(400).json({ success: false });

    const langParam = String(req.query.lang || 'es').toLowerCase() === 'en' ? 'en-US' : 'es-ES';
    const cacheKey = `v4|${mediaType}|${cleanId}|${langParam}|${movidyUrlHint}`;
    const cached = richDetailsCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < 10 * 60 * 1000) {
      return res.json({ success: true, details: cached.details });
    }

    const url = `https://api.themoviedb.org/3/${mediaType}/${cleanId}?api_key=${TMDB_API_KEY}&language=${langParam}&append_to_response=videos,credits,recommendations,watch/providers`;
    const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return res.status(404).json({ success: false });
    const data: any = await r.json();

    const esWp = data?.['watch/providers']?.results?.ES;
    const rawProviderEntries: any[] = [
      ...(Array.isArray(esWp?.flatrate) ? esWp.flatrate : []),
      ...(Array.isArray(esWp?.ads) ? esWp.ads : []),
      ...(Array.isArray(esWp?.free) ? esWp.free : []),
    ];
    const watchProviders = Array.from(
      new Set(
        rawProviderEntries
          .map((p) => {
            const n = String(p?.provider_name || '').trim();
            if (/netflix/i.test(n)) return 'Netflix';
            if (/hbo|max/i.test(n)) return 'HBO Max';
            if (/disney/i.test(n)) return 'Disney+';
            if (/prime video|amazon/i.test(n)) return 'Prime Video';
            if (/apple tv/i.test(n)) return 'Apple TV+';
            if (/movistar/i.test(n)) return 'Movistar+';
            if (/skyshowtime/i.test(n)) return 'SkyShowtime';
            if (/filmin/i.test(n)) return 'Filmin';
            if (/crunchyroll/i.test(n)) return 'Crunchyroll';
            if (/animebox/i.test(n)) return 'AnimeBox';
            return '';
          })
          .filter(Boolean)
      )
    );

    const primaryTitle =
      data.title || data.name || data.original_title || data.original_name || 'Título';
    const originalTitle = data.original_title || data.original_name || '';
    const tmdbYear = String(data.release_date || data.first_air_date || '').split('-')[0] || '';

    const [allVideosResolved, availableLanguages] = await Promise.all([
      (async () => {
        let vids: any[] = Array.isArray(data?.videos?.results) ? data.videos.results : [];
        if (vids.length === 0 && langParam !== 'en-US') {
          const enVideosRes = await fetch(
            `https://api.themoviedb.org/3/${mediaType}/${cleanId}/videos?api_key=${TMDB_API_KEY}&language=en-US`,
            { signal: AbortSignal.timeout(3500) }
          ).catch(() => null);
          if (enVideosRes?.ok) {
            const enJson: any = await enVideosRes.json();
            vids = Array.isArray(enJson?.results) ? enJson.results : [];
          }
        }
        return vids;
      })(),
      probeAvailableLanguages({
        tmdbId: cleanId,
        mediaType,
        season: mediaType === 'tv' ? 1 : undefined,
        episode: mediaType === 'tv' ? 1 : undefined,
        titleHints: [primaryTitle, originalTitle, titleHint],
        movidyUrl: movidyUrlHint || undefined,
        yearHint: tmdbYear || undefined,
      }),
    ]);

    const ytVideos = allVideosResolved.filter((v) => v && v.site === 'YouTube' && v.key);
    const officialTrailer =
      ytVideos.find((v) => v.type === 'Trailer' && v.official) ||
      ytVideos.find((v) => v.type === 'Trailer') ||
      ytVideos.find((v) => v.type === 'Teaser') ||
      ytVideos[0];

    const rawCast: any[] = Array.isArray(data?.credits?.cast) ? data.credits.cast : [];
    const rawCrew: any[] = Array.isArray(data?.credits?.crew) ? data.credits.crew : [];
    const director =
      mediaType === 'movie'
        ? rawCrew.find((c) => c.job === 'Director')?.name
        : Array.isArray(data?.created_by) && data.created_by[0]?.name
        ? data.created_by[0].name
        : undefined;

    const runtimeMin =
      mediaType === 'movie'
        ? Number(data?.runtime || 0)
        : Number(data?.episode_run_time?.[0] || 0);
    const runtimeText =
      mediaType === 'tv'
        ? `${Number(data?.number_of_seasons || 1)} temp · ${Number(data?.number_of_episodes || 0)} eps`
        : runtimeMin > 0
        ? `${Math.floor(runtimeMin / 60)}h ${runtimeMin % 60}m`
        : undefined;

    const recs: any[] = Array.isArray(data?.recommendations?.results)
      ? data.recommendations.results
      : [];

    const details = {
      tmdbId: Number(cleanId),
      mediaType,
      title: primaryTitle,
      originalTitle,
      tagline: data.tagline || undefined,
      year: String(data.release_date || data.first_air_date || '').split('-')[0] || 'HD',
      rating: data.vote_average ? Number(data.vote_average).toFixed(1) : '',
      runtimeText,
      genres: (Array.isArray(data?.genres) ? data.genres : [])
        .map((g: any) => g?.name)
        .filter(Boolean)
        .slice(0, 4),
      overview: data.overview || '',
      poster: data.poster_path ? `https://image.tmdb.org/t/p/w500${data.poster_path}` : '',
      backdrop: data.backdrop_path ? `https://image.tmdb.org/t/p/w1280${data.backdrop_path}` : '',
      trailerKey: officialTrailer?.key || undefined,
      directorOrCreator: director,
      cast: rawCast.slice(0, 10).map((c) => ({
        id: c.id,
        name: c.name || '',
        character: c.character || '',
        photo: c.profile_path ? `https://image.tmdb.org/t/p/w185${c.profile_path}` : undefined,
      })),
      similar: recs
        .filter((item) => item && item.id && (item.poster_path || item.backdrop_path))
        .slice(0, 8)
        .map((item) => ({
          id: `${mediaType}-${item.id}`,
          tmdbId: item.id,
          mediaType,
          title: item.title || item.name || 'Título',
          originalTitle: item.original_title || item.original_name || '',
          year: String(item.release_date || item.first_air_date || '').split('-')[0] || 'HD',
          rating: item.vote_average ? Number(item.vote_average).toFixed(1) : '',
          overview: item.overview || '',
          poster: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : '',
          backdrop: item.backdrop_path ? `https://image.tmdb.org/t/p/w780${item.backdrop_path}` : '',
          bingetrixUrl: mediaType === 'movie' ? `https://bingetrix.sc/watch/${item.id}` : undefined,
          languages: ['Español', 'VOSE'],
        })),
      availableLanguages,
      watchProviders,
    };

    richDetailsCache.set(cacheKey, { details, ts: Date.now() });
    res.json({ success: true, details });
  } catch (err) {
    console.warn('Rich details error:', err);
    res.status(500).json({ success: false });
  }
});

// ============================================================================
// REST API: CLOUD SUBTITLES SEARCH & PROXY (SPANISH + ENGLISH .SRT/.VTT)
// ============================================================================
const subtitleSearchCache = new Map<string, { tracks: any[]; ts: number }>();

app.get('/api/subtitles/search', async (req, res) => {
  try {
    const tmdbId = String(req.query.tmdbId || '').replace(/\D/g, '');
    if (!tmdbId) return res.json({ success: true, tracks: [] });
    const season = parseInt(String(req.query.season || '0'), 10) || 0;
    const episode = parseInt(String(req.query.episode || '0'), 10) || 0;

    const cacheKey = `${tmdbId}|${season}|${episode}`;
    const cached = subtitleSearchCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < 15 * 60 * 1000) {
      return res.json({ success: true, tracks: cached.tracks });
    }

    const qs = new URLSearchParams({ id: tmdbId });
    if (season > 0 && episode > 0) {
      qs.set('season', String(season));
      qs.set('episode', String(episode));
    }

    const subRes = await fetch(`https://sub.wyzie.ru/search?${qs.toString()}`, {
      headers: { 'User-Agent': CHROME_UA },
      signal: AbortSignal.timeout(5000),
    });
    if (!subRes.ok) return res.json({ success: true, tracks: [] });

    const rawList: any[] = await subRes.json();
    if (!Array.isArray(rawList)) return res.json({ success: true, tracks: [] });

    const prioritized = rawList
      .filter((s) => s?.url && /^(es|spa|en|eng)/i.test(String(s.language || '')))
      .slice(0, 10)
      .map((s, idx) => {
        const code = String(s.language || '').toLowerCase();
        const isEs = code.startsWith('es') || code.startsWith('spa');
        return {
          id: `sub-${tmdbId}-${idx}-${code}`,
          label: `${isEs ? 'Español' : 'English'}${s.display ? ` · ${s.display}` : ''} #${idx + 1}`,
          lang: isEs ? 'ES' : 'EN',
          url: `/api/subtitles/proxy?url=${encodeURIComponent(s.url)}`,
        };
      });

    subtitleSearchCache.set(cacheKey, { tracks: prioritized, ts: Date.now() });
    res.json({ success: true, tracks: prioritized });
  } catch {
    res.json({ success: true, tracks: [] });
  }
});

app.get('/api/subtitles/proxy', async (req, res) => {
  const rawUrl = String(req.query.url || '');
  if (!rawUrl || !/^https?:\/\//i.test(rawUrl)) return res.status(400).send('');
  try {
    const r = await fetch(rawUrl, {
      headers: { 'User-Agent': CHROME_UA },
      signal: AbortSignal.timeout(5500),
    });
    if (!r.ok) return res.status(404).send('');
    const txt = await r.text();
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(txt);
  } catch {
    res.status(502).send('');
  }
});

// ============================================================================
// REST API: REAL-TIME LIVE FOOTBALL & SPORTS SCOREBOARDS (ESPN PUBLIC JSON)
// ============================================================================
let liveScoresCache: { matches: any[]; ts: number } | null = null;

app.get('/api/sports/scores', async (_req, res) => {
  if (liveScoresCache && Date.now() - liveScoresCache.ts < 45 * 1000) {
    return res.json({ success: true, scores: liveScoresCache.matches });
  }

  const feeds: { url: string; league: string; sport: 'soccer' | 'basketball' }[] = [
    {
      url: 'https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1/scoreboard',
      league: 'LaLiga',
      sport: 'soccer',
    },
    {
      url: 'https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.champions/scoreboard',
      league: 'Champions',
      sport: 'soccer',
    },
    {
      url: 'https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard',
      league: 'Premier',
      sport: 'soccer',
    },
    {
      url: 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard',
      league: 'NBA',
      sport: 'basketball',
    },
  ];

  try {
    const responses = await Promise.all(
      feeds.map((f) =>
        fetch(f.url, { signal: AbortSignal.timeout(4000) })
          .then((r) => (r.ok ? r.json() : null))
          .then((json) => ({ feed: f, json }))
          .catch(() => ({ feed: f, json: null }))
      )
    );

    const parsed: any[] = [];
    for (const { feed, json } of responses) {
      const events: any[] = Array.isArray(json?.events) ? json.events : [];
      for (const ev of events.slice(0, 6)) {
        const comp = ev?.competitions?.[0];
        const competitors: any[] = Array.isArray(comp?.competitors) ? comp.competitors : [];
        const home = competitors.find((c) => c.homeAway === 'home') || competitors[0];
        const away = competitors.find((c) => c.homeAway === 'away') || competitors[1];
        if (!home || !away) continue;

        const stateStr = String(ev?.status?.type?.state || '');
        const isLive = stateStr === 'in';
        const shortDetail =
          ev?.status?.type?.shortDetail || ev?.status?.displayClock || (isLive ? 'EN JUEGO' : '');

        parsed.push({
          id: `${feed.league}-${ev.id}`,
          league: feed.league,
          sport: feed.sport,
          homeTeam: home.team?.shortDisplayName || home.team?.displayName || 'Local',
          awayTeam: away.team?.shortDisplayName || away.team?.displayName || 'Visitante',
          homeScore: stateStr === 'pre' ? '-' : String(home.score ?? '0'),
          awayScore: stateStr === 'pre' ? '-' : String(away.score ?? '0'),
          homeLogo: home.team?.logo || undefined,
          awayLogo: away.team?.logo || undefined,
          statusText: shortDetail,
          isLive,
        });
      }
    }

    parsed.sort((a, b) => Number(b.isLive) - Number(a.isLive));
    liveScoresCache = { matches: parsed.slice(0, 18), ts: Date.now() };
    res.json({ success: true, scores: liveScoresCache.matches });
  } catch {
    res.json({ success: true, scores: [] });
  }
});

// ============================================================================
// REST API: LIVE FOOTBALL MATCHBOARD (FLAGS, CLUB CRESTS, LIVE MINUTE, STREAMS & STATS)
// ============================================================================
interface SoccerLeagueFeedDef {
  slug: string;
  regionName: string;
  leagueName: string;
  regionFlagUrl: string;
  priority: number;
  broadcasterProfile: 'spain_nt' | 'laliga' | 'copa_rey' | 'uefa' | 'europe' | 'americas';
}

const SOCCER_BOARD_LEAGUES: SoccerLeagueFeedDef[] = [
  {
    slug: 'esp.1',
    regionName: 'España',
    leagueName: 'LaLiga EA Sports',
    regionFlagUrl: 'https://flagcdn.com/w40/es.png',
    priority: 1,
    broadcasterProfile: 'laliga',
  },
  {
    slug: 'uefa.champions',
    regionName: 'Europa',
    leagueName: 'Champions League',
    regionFlagUrl: 'https://flagcdn.com/w40/eu.png',
    priority: 2,
    broadcasterProfile: 'uefa',
  },
  {
    slug: 'uefa.nations',
    regionName: 'Europa',
    leagueName: 'Liga de Naciones UEFA',
    regionFlagUrl: 'https://flagcdn.com/w40/eu.png',
    priority: 3,
    broadcasterProfile: 'spain_nt',
  },
  {
    slug: 'esp.copa_del_rey',
    regionName: 'España',
    leagueName: 'Copa del Rey',
    regionFlagUrl: 'https://flagcdn.com/w40/es.png',
    priority: 4,
    broadcasterProfile: 'copa_rey',
  },
  {
    slug: 'esp.2',
    regionName: 'España',
    leagueName: 'LaLiga Hypermotion',
    regionFlagUrl: 'https://flagcdn.com/w40/es.png',
    priority: 5,
    broadcasterProfile: 'laliga',
  },
  {
    slug: 'uefa.europa',
    regionName: 'Europa',
    leagueName: 'Europa League',
    regionFlagUrl: 'https://flagcdn.com/w40/eu.png',
    priority: 6,
    broadcasterProfile: 'uefa',
  },
  {
    slug: 'uefa.europa.conf',
    regionName: 'Europa',
    leagueName: 'Conference League',
    regionFlagUrl: 'https://flagcdn.com/w40/eu.png',
    priority: 7,
    broadcasterProfile: 'uefa',
  },
  {
    slug: 'uefa.wchampions',
    regionName: 'Europa',
    leagueName: 'Champions League Femenina',
    regionFlagUrl: 'https://flagcdn.com/w40/eu.png',
    priority: 8,
    broadcasterProfile: 'uefa',
  },
  {
    slug: 'eng.1',
    regionName: 'Inglaterra',
    leagueName: 'Premier League',
    regionFlagUrl: 'https://flagcdn.com/w40/gb-eng.png',
    priority: 9,
    broadcasterProfile: 'europe',
  },
  {
    slug: 'eng.fa',
    regionName: 'Inglaterra',
    leagueName: 'FA Cup',
    regionFlagUrl: 'https://flagcdn.com/w40/gb-eng.png',
    priority: 10,
    broadcasterProfile: 'europe',
  },
  {
    slug: 'ita.1',
    regionName: 'Italia',
    leagueName: 'Serie A',
    regionFlagUrl: 'https://flagcdn.com/w40/it.png',
    priority: 11,
    broadcasterProfile: 'europe',
  },
  {
    slug: 'ger.1',
    regionName: 'Alemania',
    leagueName: 'Bundesliga',
    regionFlagUrl: 'https://flagcdn.com/w40/de.png',
    priority: 12,
    broadcasterProfile: 'europe',
  },
  {
    slug: 'fra.1',
    regionName: 'Francia',
    leagueName: 'Ligue 1',
    regionFlagUrl: 'https://flagcdn.com/w40/fr.png',
    priority: 13,
    broadcasterProfile: 'europe',
  },
  {
    slug: 'fra.coupe_de_france',
    regionName: 'Francia',
    leagueName: 'Coupe de France',
    regionFlagUrl: 'https://flagcdn.com/w40/fr.png',
    priority: 14,
    broadcasterProfile: 'europe',
  },
  {
    slug: 'por.1',
    regionName: 'Portugal',
    leagueName: 'Primeira Liga',
    regionFlagUrl: 'https://flagcdn.com/w40/pt.png',
    priority: 15,
    broadcasterProfile: 'europe',
  },
  {
    slug: 'ned.1',
    regionName: 'Países Bajos',
    leagueName: 'Eredivisie',
    regionFlagUrl: 'https://flagcdn.com/w40/nl.png',
    priority: 16,
    broadcasterProfile: 'europe',
  },
  {
    slug: 'fifa.worldq.uefa',
    regionName: 'Europa',
    leagueName: 'Clasificación Mundial UEFA',
    regionFlagUrl: 'https://flagcdn.com/w40/eu.png',
    priority: 17,
    broadcasterProfile: 'spain_nt',
  },
  {
    slug: 'fifa.worldq.conmebol',
    regionName: 'Sudamérica',
    leagueName: 'Eliminatorias CONMEBOL',
    regionFlagUrl: 'https://flagcdn.com/w40/ar.png',
    priority: 18,
    broadcasterProfile: 'americas',
  },
  {
    slug: 'fifa.worldq.caf',
    regionName: 'África',
    leagueName: 'Clasificación CAF',
    regionFlagUrl: 'https://flagcdn.com/w40/ma.png',
    priority: 19,
    broadcasterProfile: 'europe',
  },
  {
    slug: 'fifa.friendly',
    regionName: 'Internacional',
    leagueName: 'Amistosos Internacionales',
    regionFlagUrl: 'https://flagcdn.com/w40/un.png',
    priority: 20,
    broadcasterProfile: 'spain_nt',
  },
  {
    slug: 'conmebol.libertadores',
    regionName: 'Sudamérica',
    leagueName: 'Copa Libertadores',
    regionFlagUrl: 'https://flagcdn.com/w40/br.png',
    priority: 21,
    broadcasterProfile: 'americas',
  },
  {
    slug: 'bra.1',
    regionName: 'Brasil',
    leagueName: 'Brasileirao Serie A',
    regionFlagUrl: 'https://flagcdn.com/w40/br.png',
    priority: 22,
    broadcasterProfile: 'americas',
  },
  {
    slug: 'bra.2',
    regionName: 'Brasil',
    leagueName: 'Brasileirao Serie B',
    regionFlagUrl: 'https://flagcdn.com/w40/br.png',
    priority: 23,
    broadcasterProfile: 'americas',
  },
  {
    slug: 'arg.1',
    regionName: 'Argentina',
    leagueName: 'Liga Profesional',
    regionFlagUrl: 'https://flagcdn.com/w40/ar.png',
    priority: 24,
    broadcasterProfile: 'americas',
  },
  {
    slug: 'mex.1',
    regionName: 'México',
    leagueName: 'Liga MX',
    regionFlagUrl: 'https://flagcdn.com/w40/mx.png',
    priority: 25,
    broadcasterProfile: 'americas',
  },
  {
    slug: 'usa.1',
    regionName: 'EE. UU.',
    leagueName: 'MLS',
    regionFlagUrl: 'https://flagcdn.com/w40/us.png',
    priority: 26,
    broadcasterProfile: 'americas',
  },
];

const COUNTRY_NAME_TO_ISO2: Record<string, string> = {
  espana: 'es',
  spain: 'es',
  francia: 'fr',
  france: 'fr',
  italia: 'it',
  italy: 'it',
  alemania: 'de',
  germany: 'de',
  inglaterra: 'gb-eng',
  england: 'gb-eng',
  escocia: 'gb-sct',
  gales: 'gb-wls',
  portugal: 'pt',
  croacia: 'hr',
  croatia: 'hr',
  republica_checa: 'cz',
  chequia: 'cz',
  czechia: 'cz',
  montenegro: 'me',
  letonia: 'lv',
  latvia: 'lv',
  albania: 'al',
  finlandia: 'fi',
  finland: 'fi',
  san_marino: 'sm',
  bielorrusia: 'by',
  belarus: 'by',
  paises_bajos: 'nl',
  holanda: 'nl',
  belgica: 'be',
  suiza: 'ch',
  austria: 'at',
  dinamarca: 'dk',
  suecia: 'se',
  noruega: 'no',
  polonia: 'pl',
  turquia: 'tr',
  grecia: 'gr',
  serbia: 'rs',
  rumania: 'ro',
  ucrania: 'ua',
  hungria: 'hu',
  irlanda: 'ie',
  islandia: 'is',
  eslovaquia: 'sk',
  eslovenia: 'si',
  georgia: 'ge',
  armenia: 'am',
  chipre: 'cy',
  rusia: 'ru',
  brasil: 'br',
  argentina: 'ar',
  uruguay: 'uy',
  colombia: 'co',
  chile: 'cl',
  paraguay: 'py',
  peru: 'pe',
  ecuador: 'ec',
  venezuela: 've',
  bolivia: 'bo',
  mexico: 'mx',
  estados_unidos: 'us',
  canada: 'ca',
  japon: 'jp',
  marruecos: 'ma',
  nigeria: 'ng',
  senegal: 'sn',
  egipto: 'eg',
  camerun: 'cm',
  ghana: 'gh',
  argelia: 'dz',
  tunez: 'tn',
};

function normalizeTeamToken(raw: string): string {
  return String(raw || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function resolveTeamBadgeUrl(teamObj: any, isInternational: boolean): string | undefined {
  const directLogo = String(teamObj?.logo || teamObj?.logos?.[0]?.href || '').trim();
  if (directLogo.startsWith('http')) {
    return directLogo;
  }
  if (isInternational) {
    const slug = normalizeTeamToken(teamObj?.displayName || teamObj?.shortDisplayName || '');
    const iso = COUNTRY_NAME_TO_ISO2[slug];
    if (iso) return `https://flagcdn.com/w40/${iso}.png`;
  }
  return undefined;
}

function buildFootballMatchChannels(params: {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  league: SoccerLeagueFeedDef;
  scrapedMatches: any[];
}): TrackRecord[] {
  const { matchId, homeTeam, awayTeam, league, scrapedMatches } = params;
  const channels: TrackRecord[] = [];
  const seenUrls = new Set<string>();

  const pushTrack = (track: TrackRecord) => {
    if (!track.sourceUrl || seenUrls.has(track.sourceUrl)) return;
    seenUrls.add(track.sourceUrl);
    channels.push(track);
  };

  const homeNorm = normalizeTeamToken(homeTeam).replace(/_/g, ' ');
  const awayNorm = normalizeTeamToken(awayTeam).replace(/_/g, ' ');
  const isSpainTeam =
    /\bespana\b|\bspain\b/i.test(homeNorm) || /\bespana\b|\bspain\b/i.test(awayNorm);

  // 1. If Selección Española or Copa del Rey is playing, put La 1 RTVE HD & Teledeporte HD first!
  if (isSpainTeam || league.broadcasterProfile === 'copa_rey') {
    pushTrack({
      id: `${matchId}-la1`,
      label: 'La 1 RTVE HD',
      lang: 'ES',
      quality: '1080p',
      sourceUrl: 'https://rtvelivestream.rtve.es/rtvesec/la1/la1_main.m3u8',
      resolverType: 'tdt_hls',
    });
    pushTrack({
      id: `${matchId}-tdp`,
      label: 'Teledeporte HD',
      lang: 'ES',
      quality: '1080p',
      sourceUrl: 'https://rtvelivestream.rtve.es/rtvesec/tdp/tdp_main.m3u8',
      resolverType: 'tdt_hls',
    });
  }

  // 2. Match any live scraped direct match channels from our sports agenda!
  const homeWords = homeNorm.split(' ').filter((w) => w.length >= 4);
  const awayWords = awayNorm.split(' ').filter((w) => w.length >= 4);
  for (const sm of scrapedMatches) {
    if (sm.is247Channel) continue;
    const smTitle = normalizeTeamToken(sm.title || '').replace(/_/g, ' ');
    const hitHome = homeWords.some((w) => smTitle.includes(w));
    const hitAway = awayWords.some((w) => smTitle.includes(w));
    if (hitHome || hitAway) {
      for (const ch of sm.channels || []) {
        pushTrack({
          id: `${matchId}-live-${channels.length + 1}`,
          label: ch.label || `Señal Directo ${channels.length + 1}`,
          lang: ch.lang || 'ES',
          quality: ch.quality || 'HD',
          sourceUrl: ch.sourceUrl,
          resolverType: ch.resolverType || 'sports_channel',
        });
      }
    }
  }

  // 3. Competition-tailored broadcasters so every match has instant multi-server buttons
  if (league.broadcasterProfile === 'laliga') {
    pushTrack({
      id: `${matchId}-mll`,
      label: 'Movistar LaLiga',
      lang: 'ES',
      quality: '1080p',
      sourceUrl: 'https://footunder.online/tvtodo/laliga.php',
      resolverType: 'sports_channel',
    });
    pushTrack({
      id: `${matchId}-daznll`,
      label: 'DAZN LaLiga',
      lang: 'ES',
      quality: '1080p',
      sourceUrl: 'https://pig.footunder.online/stream/538',
      resolverType: 'sports_channel',
    });
    pushTrack({
      id: `${matchId}-hyper`,
      label: 'LaLiga TV 2',
      lang: 'ES',
      quality: '1080p',
      sourceUrl: 'https://pig.footunder.online/stream/522',
      resolverType: 'sports_channel',
    });
    pushTrack({
      id: `${matchId}-gol`,
      label: 'GOL Play HD',
      lang: 'ES',
      quality: '1080p',
      sourceUrl: 'http://90.163.85.113:8093/stream/38/index.m3u8',
      resolverType: 'tdt_hls',
    });
  } else if (league.broadcasterProfile === 'uefa' || league.broadcasterProfile === 'spain_nt') {
    pushTrack({
      id: `${matchId}-mlc`,
      label: 'Movistar Campeones',
      lang: 'ES',
      quality: '1080p',
      sourceUrl: 'https://pig.footunder.online/stream/435',
      resolverType: 'sports_channel',
    });
    pushTrack({
      id: `${matchId}-dazneu`,
      label: 'DAZN Europa',
      lang: 'ES',
      quality: '1080p',
      sourceUrl: 'https://footunder.online/tvtodo/dazn3.php',
      resolverType: 'sports_channel',
    });
    pushTrack({
      id: `${matchId}-mplus`,
      label: 'Movistar Fútbol',
      lang: 'ES',
      quality: '1080p',
      sourceUrl: 'https://footunder.online/tvtodo/laliga.php',
      resolverType: 'sports_channel',
    });
    if (league.slug === 'uefa.wchampions') {
      pushTrack({
        id: `${matchId}-esport3`,
        label: 'Esport3 HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://directes-tv-int.3catdirectes.cat/live-origin/esport3-hls/master.m3u8',
        resolverType: 'tdt_hls',
      });
    }
    pushTrack({
      id: `${matchId}-tdp-bk`,
      label: 'Teledeporte HD',
      lang: 'ES',
      quality: '1080p',
      sourceUrl: 'https://rtvelivestream.rtve.es/rtvesec/tdp/tdp_main.m3u8',
      resolverType: 'tdt_hls',
    });
  } else {
    pushTrack({
      id: `${matchId}-dazn1`,
      label: 'DAZN Fútbol HD',
      lang: 'ES',
      quality: '1080p',
      sourceUrl: 'https://pig.footunder.online/stream/538',
      resolverType: 'sports_channel',
    });
    pushTrack({
      id: `${matchId}-mplus-int`,
      label: 'Movistar Fútbol',
      lang: 'ES',
      quality: '1080p',
      sourceUrl: 'https://pig.footunder.online/stream/435',
      resolverType: 'sports_channel',
    });
    pushTrack({
      id: `${matchId}-gol-int`,
      label: 'GOL Play HD',
      lang: 'ES',
      quality: '1080p',
      sourceUrl: 'http://90.163.85.113:8093/stream/38/index.m3u8',
      resolverType: 'tdt_hls',
    });
    pushTrack({
      id: `${matchId}-tdp-int`,
      label: 'Teledeporte HD',
      lang: 'ES',
      quality: '1080p',
      sourceUrl: 'https://rtvelivestream.rtve.es/rtvesec/tdp/tdp_main.m3u8',
      resolverType: 'tdt_hls',
    });
  }

  return channels.slice(0, 7);
}

let cachedFootballBoard: { dateKey: string; matches: any[]; ts: number } | null = null;

app.get('/api/sports/football-board', async (req, res) => {
  const requestedDate = String(req.query.date || '')
    .replace(/\D/g, '')
    .slice(0, 8);
  const madridToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' })
    .format(new Date())
    .replace(/-/g, '');
  const dateKey = requestedDate.length === 8 ? requestedDate : madridToday;

  if (
    cachedFootballBoard &&
    cachedFootballBoard.dateKey === dateKey &&
    Date.now() - cachedFootballBoard.ts < 35 * 1000
  ) {
    return res.json({ success: true, dateKey, matches: cachedFootballBoard.matches });
  }

  try {
    const scrapedMatches = cachedSportsSchedule?.matches || [];
    const madridTimeFmt = new Intl.DateTimeFormat('es-ES', {
      timeZone: 'Europe/Madrid',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    const responses = await Promise.all(
      SOCCER_BOARD_LEAGUES.map((league) =>
        fetch(
          `https://site.api.espn.com/apis/site/v2/sports/soccer/${league.slug}/scoreboard?dates=${dateKey}&lang=es&region=es`,
          { signal: AbortSignal.timeout(4500) }
        )
          .then((r) => (r.ok ? r.json() : null))
          .then((json) => ({ league, json }))
          .catch(() => ({ league, json: null }))
      )
    );

    const items: any[] = [];
    const seenEventIds = new Set<string>();

    for (const { league, json } of responses) {
      const events: any[] = Array.isArray(json?.events) ? json.events : [];
      const espnLeagueLogo = String(json?.leagues?.[0]?.logos?.[0]?.href || '').trim() || undefined;
      const isInternational =
        league.slug.startsWith('uefa.nations') || league.slug.startsWith('fifa.');

      for (const ev of events) {
        const eventId = String(ev?.id || '').trim();
        if (!eventId || seenEventIds.has(eventId)) continue;
        seenEventIds.add(eventId);

        const comp = ev?.competitions?.[0];
        const competitors: any[] = Array.isArray(comp?.competitors) ? comp.competitors : [];
        const home = competitors.find((c) => c.homeAway === 'home') || competitors[0];
        const away = competitors.find((c) => c.homeAway === 'away') || competitors[1];
        if (!home || !away) continue;

        const kickoffDate = ev?.date ? new Date(ev.date) : new Date();
        const kickoffTime = Number.isNaN(kickoffDate.getTime())
          ? '20:45'
          : madridTimeFmt.format(kickoffDate);

        const rawState = String(ev?.status?.type?.state || '').toLowerCase();
        const statusName = String(ev?.status?.type?.name || '');
        const statusState: 'live' | 'upcoming' | 'finished' =
          rawState === 'in' ? 'live' : rawState === 'post' ? 'finished' : 'upcoming';

        let statusLabel = '';
        if (statusState === 'live') {
          if (statusName.includes('HALFTIME')) {
            statusLabel = 'HT';
          } else {
            const clk = String(
              ev?.status?.displayClock || ev?.status?.type?.shortDetail || ''
            ).trim();
            statusLabel = clk || 'EN VIVO';
          }
        } else if (statusState === 'finished') {
          statusLabel = statusName.includes('PEN') ? 'PEN' : statusName.includes('AET') ? 'PRÓ' : 'FT';
        }

        const homeTeam = String(
          home.team?.shortDisplayName || home.team?.displayName || 'Local'
        ).trim();
        const awayTeam = String(
          away.team?.shortDisplayName || away.team?.displayName || 'Visitante'
        ).trim();

        const channels = buildFootballMatchChannels({
          matchId: `fb-${eventId}`,
          homeTeam,
          awayTeam,
          league,
          scrapedMatches,
        });

        items.push({
          id: `fb-${eventId}`,
          eventId,
          leagueSlug: league.slug,
          regionName: league.regionName,
          leagueName: league.leagueName,
          groupTitle: `${league.regionName}: ${league.leagueName}`,
          regionFlagUrl: league.regionFlagUrl,
          leagueLogoUrl: espnLeagueLogo,
          priority: league.priority,
          kickoffIso: kickoffDate.toISOString(),
          kickoffTime,
          kickoffMs: kickoffDate.getTime() || 0,
          statusState,
          statusLabel,
          homeTeam,
          awayTeam,
          homeShort: String(home.team?.abbreviation || homeTeam.slice(0, 3)).toUpperCase(),
          awayShort: String(away.team?.abbreviation || awayTeam.slice(0, 3)).toUpperCase(),
          homeLogo: resolveTeamBadgeUrl(home.team, isInternational),
          awayLogo: resolveTeamBadgeUrl(away.team, isInternational),
          homeScore: statusState === 'upcoming' ? '-' : String(home.score ?? '0'),
          awayScore: statusState === 'upcoming' ? '-' : String(away.score ?? '0'),
          channels,
        });
      }
    }

    items.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      const rank = (s: string) => (s === 'live' ? 0 : s === 'upcoming' ? 1 : 2);
      if (rank(a.statusState) !== rank(b.statusState)) {
        return rank(a.statusState) - rank(b.statusState);
      }
      return a.kickoffMs - b.kickoffMs;
    });

    cachedFootballBoard = { dateKey, matches: items, ts: Date.now() };
    res.json({ success: true, dateKey, matches: items });
  } catch (err) {
    console.warn('Football matchboard fetch error:', err);
    res.json({ success: true, dateKey, matches: cachedFootballBoard?.matches || [] });
  }
});

const cachedMatchDetailsMap = new Map<string, { data: any; ts: number }>();

app.get('/api/sports/match-details', async (req, res) => {
  const eventId = String(req.query.eventId || '').replace(/\D/g, '');
  const leagueSlug = String(req.query.leagueSlug || 'all').replace(/[^a-z0-9._-]/gi, '') || 'all';
  if (!eventId) {
    return res.status(400).json({ success: false, error: 'Missing eventId' });
  }

  const cacheKey = `${leagueSlug}:${eventId}`;
  const cached = cachedMatchDetailsMap.get(cacheKey);
  if (cached && Date.now() - cached.ts < 30 * 1000) {
    return res.json({ success: true, details: cached.data });
  }

  try {
    const summaryUrl = `https://site.api.espn.com/apis/site/v2/sports/soccer/${leagueSlug}/summary?event=${eventId}&lang=es&region=es`;
    const r = await fetch(summaryUrl, { signal: AbortSignal.timeout(4500) });
    if (!r.ok) {
      return res.json({
        success: true,
        details: { eventId, stats: [], events: [] },
      });
    }
    const sj: any = await r.json();

    const comp = sj?.header?.competitions?.[0];
    const competitors: any[] = Array.isArray(comp?.competitors) ? comp.competitors : [];
    const homeComp = competitors.find((c) => c.homeAway === 'home') || competitors[0];
    const awayComp = competitors.find((c) => c.homeAway === 'away') || competitors[1];
    const homeTeamId = String(homeComp?.team?.id || homeComp?.id || '');
    const awayTeamId = String(awayComp?.team?.id || awayComp?.id || '');

    // 1. Comparative Team Statistics
    const boxTeams: any[] = Array.isArray(sj?.boxscore?.teams) ? sj.boxscore.teams : [];
    const homeStatsArr: any[] =
      boxTeams.find((t) => String(t?.team?.id || '') === homeTeamId)?.statistics ||
      boxTeams[0]?.statistics ||
      [];
    const awayStatsArr: any[] =
      boxTeams.find((t) => String(t?.team?.id || '') === awayTeamId)?.statistics ||
      boxTeams[1]?.statistics ||
      [];

    const statKeysOrder: { key: string; esLabel: string }[] = [
      { key: 'possessionPct', esLabel: 'Posesión (%)' },
      { key: 'shotsSummary', esLabel: 'Remates Totales' },
      { key: 'totalShots', esLabel: 'Remates Totales' },
      { key: 'shotsOnTarget', esLabel: 'Remates a Puerta' },
      { key: 'wonCorners', esLabel: 'Saques de Esquina' },
      { key: 'foulsCommitted', esLabel: 'Faltas Cometidas' },
      { key: 'offsides', esLabel: 'Fueras de Juego' },
      { key: 'yellowCards', esLabel: 'Tarjetas Amarillas' },
      { key: 'redCards', esLabel: 'Tarjetas Rojas' },
      { key: 'saves', esLabel: 'Paradas del Portero' },
    ];

    const stats: any[] = [];
    const seenLabels = new Set<string>();
    for (const def of statKeysOrder) {
      const hs = homeStatsArr.find((s) => s?.name === def.key);
      const as = awayStatsArr.find((s) => s?.name === def.key);
      if (!hs && !as) continue;
      const label = def.esLabel || hs?.label || as?.label || def.key;
      if (seenLabels.has(label)) continue;
      seenLabels.add(label);

      const hStr = String(hs?.displayValue ?? '0');
      const aStr = String(as?.displayValue ?? '0');
      const hNum = parseFloat(hStr.replace(/[^0-9.]/g, '')) || 0;
      const aNum = parseFloat(aStr.replace(/[^0-9.]/g, '')) || 0;
      const sum = hNum + aNum;
      const homePct = sum > 0 ? Math.round((hNum / sum) * 100) : 50;
      const awayPct = sum > 0 ? 100 - homePct : 50;

      stats.push({
        key: def.key,
        label,
        homeValue: def.key === 'possessionPct' && !hStr.includes('%') ? `${hStr}%` : hStr,
        awayValue: def.key === 'possessionPct' && !aStr.includes('%') ? `${aStr}%` : aStr,
        homePct,
        awayPct,
      });
    }

    // 2. Match Key Events (Goals, Cards, Substitutions)
    const rawKeyEvents: any[] = Array.isArray(sj?.keyEvents)
      ? sj.keyEvents
      : Array.isArray(comp?.details)
      ? comp.details
      : [];

    const events: any[] = rawKeyEvents
      .map((ke, idx) => {
        const rawType = String(ke?.type?.type || ke?.type?.text || '').toLowerCase();
        const isGoal = Boolean(ke?.scoringPlay) || rawType.includes('goal') || rawType.includes('gol');
        const isRed = rawType.includes('red') || rawType.includes('roja');
        const isYellow = !isRed && (rawType.includes('yellow') || rawType.includes('amarilla'));
        const isSub = rawType.includes('sub') || rawType.includes('cambio');
        if (!isGoal && !isRed && !isYellow && !isSub) return null;

        const evTeamId = String(ke?.team?.id || '');
        const side: 'home' | 'away' | 'neutral' =
          evTeamId && evTeamId === homeTeamId
            ? 'home'
            : evTeamId && evTeamId === awayTeamId
            ? 'away'
            : 'neutral';

        const participants: any[] = Array.isArray(ke?.participants) ? ke.participants : [];
        const playerName =
          String(
            participants[0]?.athlete?.displayName ||
              ke?.athletesInvolved?.[0]?.displayName ||
              ke?.shortText ||
              ''
          ).trim() || 'Jugador';
        const assistOrSubName =
          String(participants[1]?.athlete?.displayName || '').trim() || undefined;

        return {
          id: String(ke?.id || `ev-${idx}`),
          clock: String(ke?.clock?.displayValue || '').trim() || "•",
          type: isGoal
            ? 'goal'
            : isRed
            ? 'red-card'
            : isYellow
            ? 'yellow-card'
            : isSub
            ? 'substitution'
            : 'other',
          typeLabel: isGoal
            ? 'Gol'
            : isRed
            ? 'Tarjeta Roja'
            : isYellow
            ? 'Amarilla'
            : 'Cambio',
          playerName,
          assistOrSubName,
          side,
          detailText: String(ke?.shortText || ke?.text || '').trim() || undefined,
        };
      })
      .filter(Boolean);

    // 3. Starting XI & Substitutes Lineups
    const rosters: any[] = Array.isArray(sj?.rosters) ? sj.rosters : [];
    const parseLineup = (rObj: any) => {
      if (!rObj) return undefined;
      const list: any[] = Array.isArray(rObj?.roster) ? rObj.roster : [];
      if (list.length === 0) return undefined;
      const mapped = list.map((p, idx) => ({
        id: String(p?.athlete?.id || `p-${idx}`),
        jersey: String(p?.jersey || '-'),
        name: String(p?.athlete?.displayName || p?.athlete?.shortName || 'Jugador'),
        position: String(p?.position?.abbreviation || ''),
        starter: Boolean(p?.starter),
      }));
      return {
        teamName: String(rObj?.team?.displayName || ''),
        formation: rObj?.formation ? String(rObj.formation) : undefined,
        starters: mapped.filter((x) => x.starter),
        substitutes: mapped.filter((x) => !x.starter),
      };
    };

    const homeRoster = rosters.find((rItem) => rItem?.homeAway === 'home') || rosters[0];
    const awayRoster = rosters.find((rItem) => rItem?.homeAway === 'away') || rosters[1];

    const details = {
      eventId,
      venue: sj?.gameInfo?.venue?.fullName
        ? String(sj.gameInfo.venue.fullName)
        : undefined,
      stats,
      events,
      homeLineup: parseLineup(homeRoster),
      awayLineup: parseLineup(awayRoster),
    };

    cachedMatchDetailsMap.set(cacheKey, { data: details, ts: Date.now() });
    res.json({ success: true, details });
  } catch (err) {
    console.warn('Match details error:', err);
    res.json({ success: true, details: { eventId, stats: [], events: [] } });
  }
});

// ============================================================================
// SMART TV (SAMSUNG TIZEN / LG WEBOS / ANDROID TV) HTTP PAIRING & SYNC FALLBACK
// Works 100% reliably even when TV browsers or routers block WebSockets!
// ============================================================================
app.post('/api/tv/register', (req, res) => {
  const forceNew = Boolean(req.body?.forceNew);
  const existingCode = String(req.body?.existingCode || '')
    .replace(/\D/g, '')
    .slice(0, 4);
  const now = Date.now();

  if (!forceNew && existingCode.length === 4) {
    const existing = tvPairingSessions.get(existingCode);
    if (existing && existing.expiresAt > now && !existing.pairedPayload) {
      existing.expiresAt = now + 15 * 60 * 1000;
      return res.json({
        success: true,
        code: existing.code,
        expiresAt: existing.expiresAt,
      });
    }
  }

  const code = generateTvPairingCode();
  const expiresAt = now + 15 * 60 * 1000;
  tvPairingSessions.set(code, {
    code,
    ws: null,
    createdAt: now,
    expiresAt,
  });

  return res.json({
    success: true,
    code,
    expiresAt,
  });
});

app.get('/api/tv/poll/:code', (req, res) => {
  const code = String(req.params.code || '')
    .replace(/\D/g, '')
    .slice(0, 4);
  const session = tvPairingSessions.get(code);
  if (!session || session.expiresAt <= Date.now()) {
    return res.json({ success: false, expired: true, paired: false });
  }
  if (session.pairedPayload) {
    return res.json({
      success: true,
      paired: true,
      ...session.pairedPayload,
    });
  }
  return res.json({
    success: true,
    paired: false,
    expiresAt: session.expiresAt,
  });
});

app.post('/api/tv/claim', (req, res) => {
  const result = claimTvPairingCodeCore({
    rawCode: req.body?.code,
    targetRoomId: req.body?.roomId,
    roomNameHint: req.body?.roomName,
    claimedByRaw: req.body?.claimedBy,
  });

  if (!result.ok) {
    return res.status(400).json({
      success: false,
      error: result.error,
    });
  }

  return res.json({
    success: true,
    code: result.code,
    roomId: result.roomId,
    roomName: result.roomName,
  });
});

app.post('/api/tv/remote', (req, res) => {
  const roomId = String(req.body?.roomId || '')
    .trim()
    .toLowerCase();
  const command = String(req.body?.command || '').trim();
  const senderName = String(req.body?.senderName || 'Mando móvil')
    .trim()
    .slice(0, 32);
  const userId = String(req.body?.userId || '').trim();

  const room = rooms.get(roomId);
  if (!room || !command) {
    return res.status(404).json({ success: false, error: 'Sala no encontrada' });
  }
  if (room.hostOnlyControl && room.hostId && userId && userId !== room.hostId) {
    return res.status(403).json({ success: false, error: 'Solo el anfitrión controla la sala' });
  }

  room.lastTvRemoteCommand = {
    seq: (room.lastTvRemoteCommand?.seq || 0) + 1,
    command,
    senderName,
    ts: Date.now(),
  };

  broadcastToRoom(room.id, {
    type: 'TV_REMOTE_COMMAND',
    payload: {
      command,
      senderName,
      seq: room.lastTvRemoteCommand.seq,
    },
  });

  return res.json({ success: true, seq: room.lastTvRemoteCommand.seq });
});

app.get('/api/rooms/:roomId', (req, res) => {
  const roomId = String(req.params.roomId || '').toLowerCase();
  const { room } = getOrCreateRoom(roomId);

  if (room.pinCode) {
    const incomingPin = typeof req.query.pin === 'string' ? req.query.pin.trim() : '';
    const incomingTvToken =
      typeof req.query.tvAuthToken === 'string' ? req.query.tvAuthToken.trim() : '';
    let validTvToken = false;
    if (incomingTvToken) {
      const tokenEntry = tvAuthTokens.get(incomingTvToken);
      if (tokenEntry && tokenEntry.roomId === roomId && tokenEntry.expiresAt > Date.now()) {
        validTvToken = true;
      }
    }
    if (!validTvToken && incomingPin !== room.pinCode) {
      return res.status(403).json({
        error: 'PIN required',
        hasPin: true,
        roomName: room.name,
      });
    }
  }

  // Register HTTP-polling Smart TV presence so mobile UI shows "✓ Smart TV conectada"
  if (req.query.tv === '1') {
    const tvId =
      typeof req.query.tvId === 'string' && req.query.tvId.trim()
        ? req.query.tvId.trim().slice(0, 40)
        : `tv-http-${roomId}`;
    const tvNameRaw =
      typeof req.query.tvName === 'string' && req.query.tvName.trim()
        ? req.query.tvName.trim().slice(0, 28)
        : 'Samsung Smart TV';
    const tvDisplayName = tvNameRaw.includes('(TV)') ? tvNameRaw : `${tvNameRaw} (TV)`;
    tvHttpHeartbeats.set(`${roomId}:${tvId}`, Date.now());

    const exists = room.participants.some((p) => p.id === tvId);
    if (!exists) {
      room.participants.push({
        id: tvId,
        name: tvDisplayName,
        avatar: '📺',
        color: '#E11D48',
        isHost: false,
        joinedAt: Date.now(),
      });
      broadcastToRoom(roomId, {
        type: 'PARTICIPANTS_UPDATED',
        payload: {
          participants: room.participants,
          hostId: room.hostId,
        },
      });
    }
  }

  // Prune stale HTTP TV heartbeats (>12s idle)
  const now = Date.now();
  let pruned = false;
  for (const [key, lastSeen] of tvHttpHeartbeats.entries()) {
    if (now - lastSeen > 12000) {
      tvHttpHeartbeats.delete(key);
      const [rId, pId] = key.split(':');
      if (rId === roomId && pId) {
        const before = room.participants.length;
        room.participants = room.participants.filter((p) => p.id !== pId);
        if (room.participants.length !== before) pruned = true;
      }
    }
  }
  if (pruned) {
    broadcastToRoom(roomId, {
      type: 'PARTICIPANTS_UPDATED',
      payload: {
        participants: room.participants,
        hostId: room.hostId,
      },
    });
  }

  res.json(serializeRoomForClient(room));
});

// ============================================================================
// REST API: DEDICATED "TODO EN CASTELLANO (ESPAÑA)" HUB (/api/catalog/castellano)
// Curated + TMDB Spain (`watch_region=ES` & `with_origin_country=ES`) + GnulaHD/Movidy
// ============================================================================
const CURATED_CASTELLANO_SERIES_SEEDS: {
  tmdbId: number;
  providerId: string;
  platform: string;
}[] = [
  { tmdbId: 124364, providerId: 'hbomax', platform: 'HBO Max' }, // From (¡pedida explícitamente!)
  { tmdbId: 94997, providerId: 'hbomax', platform: 'HBO Max' }, // La Casa del Dragón
  { tmdbId: 100088, providerId: 'hbomax', platform: 'HBO Max' }, // The Last of Us
  { tmdbId: 205715, providerId: 'prime', platform: 'Prime Video' }, // Reina Roja
  { tmdbId: 106379, providerId: 'prime', platform: 'Prime Video' }, // Fallout
  { tmdbId: 71446, providerId: 'netflix', platform: 'Netflix' }, // La Casa de Papel
  { tmdbId: 196890, providerId: 'netflix', platform: 'Netflix' }, // Berlín
  { tmdbId: 40173, providerId: 'prime', platform: 'Prime Video' }, // La que se avecina
  { tmdbId: 2361, providerId: 'netflix', platform: 'Netflix' }, // Aquí no hay quien viva
  { tmdbId: 156933, providerId: 'netflix', platform: 'Netflix' }, // Entrevías
  { tmdbId: 215720, providerId: 'netflix', platform: 'Netflix' }, // Machos Alfa
  { tmdbId: 108296, providerId: 'movistar', platform: 'Movistar+' }, // Antidisturbios
  { tmdbId: 106392, providerId: 'hbomax', platform: 'HBO Max' }, // 30 Monedas
  { tmdbId: 259850, providerId: 'movistar', platform: 'Movistar+' }, // Querer
  { tmdbId: 259915, providerId: 'movistar', platform: 'Movistar+' }, // Celeste
  { tmdbId: 249980, providerId: 'netflix', platform: 'Netflix' }, // Clanes
  { tmdbId: 210945, providerId: 'netflix', platform: 'Netflix' }, // El cuerpo en llamas
  { tmdbId: 66732, providerId: 'netflix', platform: 'Netflix' }, // Stranger Things
  { tmdbId: 76479, providerId: 'prime', platform: 'Prime Video' }, // The Boys
  { tmdbId: 1399, providerId: 'hbomax', platform: 'HBO Max' }, // Juego de Tronos
  { tmdbId: 95396, providerId: 'apple', platform: 'Apple TV+' }, // Severance (Separación)
  { tmdbId: 125988, providerId: 'apple', platform: 'Apple TV+' }, // Silo
  { tmdbId: 62099, providerId: 'hbomax', platform: 'RTVE / HBO' }, // El Ministerio del Tiempo
  { tmdbId: 93405, providerId: 'netflix', platform: 'Netflix' }, // El juego del calamar
];

const CURATED_CASTELLANO_MOVIE_SEEDS: {
  tmdbId: number;
  providerId: string;
  platform: string;
}[] = [
  { tmdbId: 906126, providerId: 'netflix', platform: 'Netflix' }, // La sociedad de la nieve
  { tmdbId: 1154766, providerId: 'movistar', platform: 'Movistar+' }, // La infiltrada
  { tmdbId: 1125510, providerId: 'netflix', platform: 'Netflix' }, // El hoyo 2
  { tmdbId: 693134, providerId: 'hbomax', platform: 'HBO Max' }, // Dune: Parte Dos
  { tmdbId: 558449, providerId: 'movistar', platform: 'Movistar+' }, // Gladiator II
  { tmdbId: 533535, providerId: 'disney', platform: 'Disney+' }, // Deadpool y Lobezno
  { tmdbId: 1022789, providerId: 'disney', platform: 'Disney+' }, // Del revés 2 (Inside Out 2)
  { tmdbId: 762504, providerId: 'movistar', platform: 'Movistar+' }, // As bestas
  { tmdbId: 1059264, providerId: 'movistar', platform: 'Movistar+' }, // CampeoneX
  { tmdbId: 872585, providerId: 'skyshowtime', platform: 'SkyShowtime' }, // Oppenheimer
  { tmdbId: 1184918, providerId: 'movistar', platform: 'Movistar+' }, // Robot salvaje
  { tmdbId: 912649, providerId: 'movistar', platform: 'Movistar+' }, // Venom: El último baile
];

const castellanoSeedHydrationCache = new Map<string, { item: any; ts: number }>();
const castellanoCatalogCache = new Map<string, { items: any[]; hasMore: boolean; ts: number }>();

async function hydrateCastellanoSeed(
  tmdbId: number,
  mediaType: 'tv' | 'movie',
  providerId: string,
  platform: string
): Promise<any | null> {
  const key = `${mediaType}:${tmdbId}`;
  const cached = castellanoSeedHydrationCache.get(key);
  if (cached && Date.now() - cached.ts < 6 * 60 * 60 * 1000) {
    return cached.item;
  }
  try {
    const url =
      mediaType === 'tv'
        ? `https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${TMDB_API_KEY}&language=es-ES`
        : `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${TMDB_API_KEY}&language=es-ES`;
    const res = await fetch(url, { signal: AbortSignal.timeout(3500) });
    if (!res.ok) return null;
    const m: any = await res.json();
    if (!m?.id || (!m.poster_path && !m.backdrop_path)) return null;

    const item = {
      id: `castellano-${mediaType}-${m.id}`,
      tmdbId: m.id,
      mediaType,
      title: m.name || m.title || m.original_name || m.original_title || 'Título',
      originalTitle: m.original_name || m.original_title || m.name || m.title || '',
      year: String(m.first_air_date || m.release_date || '').split('-')[0] || 'HD',
      rating: m.vote_average ? Number(m.vote_average).toFixed(1) : '',
      overview:
        m.overview ||
        'Disponible en Castellano (Español de España) 1080p sin anuncios.',
      poster: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : '',
      backdrop: m.backdrop_path ? `https://image.tmdb.org/t/p/w1280${m.backdrop_path}` : '',
      bingetrixUrl:
        mediaType === 'movie' ? `https://bingetrix.sc/watch/${m.id}` : undefined,
      languages: ['Castellano', 'VOSE', 'EN'],
      platform,
      providerId,
    };
    castellanoSeedHydrationCache.set(key, { item, ts: Date.now() });
    return item;
  } catch {
    return null;
  }
}

app.get('/api/catalog/castellano', async (req, res) => {
  try {
    const kind = String(req.query.kind || 'all').toLowerCase(); // 'all' | 'series' | 'movies'
    const provider = String(req.query.provider || 'all').toLowerCase();
    const category = String(req.query.category || 'trending').toLowerCase();
    const query = String(req.query.query || '').trim();
    const page = Math.max(1, Math.min(50, parseInt(String(req.query.page || '1'), 10) || 1));

    const cacheKey = `${kind}|${provider}|${category}|${page}|${query.toLowerCase()}`;
    const cached = castellanoCatalogCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < 5 * 60 * 1000) {
      return res.json({
        success: true,
        items: cached.items,
        hasMore: cached.hasMore,
        page,
      });
    }

    const provCfg = STREAMING_PROVIDER_MAP[provider];
    const items: any[] = [];
    const seenKeys = new Set<string>();

    const pushUnique = (entry: any) => {
      if (!entry || (!entry.poster && !entry.backdrop)) return;
      const k = `${entry.mediaType || 'movie'}:${entry.tmdbId || normalizeTitleForMatch(entry.title || '')}`;
      if (seenKeys.has(k)) return;
      seenKeys.add(k);
      items.push({
        ...entry,
        languages: Array.from(new Set(['Castellano', ...(entry.languages || [])])),
      });
    };

    // 1. On Page 1 with no search query (or matching provider), inject curated Castellano flagship titles first
    if (page === 1 && !query && (category === 'trending' || category === 'popular')) {
      const wantSeries = kind === 'all' || kind === 'series';
      const wantMovies = kind === 'all' || kind === 'movies';

      const seriesSeeds = wantSeries
        ? CURATED_CASTELLANO_SERIES_SEEDS.filter(
            (s) => provider === 'all' || s.providerId === provider
          )
        : [];
      const movieSeeds = wantMovies
        ? CURATED_CASTELLANO_MOVIE_SEEDS.filter(
            (m) => provider === 'all' || m.providerId === provider
          )
        : [];

      const [hydratedSeries, hydratedMovies] = await Promise.all([
        Promise.all(
          seriesSeeds.map((s) =>
            hydrateCastellanoSeed(s.tmdbId, 'tv', s.providerId, s.platform)
          )
        ),
        Promise.all(
          movieSeeds.map((m) =>
            hydrateCastellanoSeed(m.tmdbId, 'movie', m.providerId, m.platform)
          )
        ),
      ]);

      if (kind === 'series') {
        hydratedSeries.forEach(pushUnique);
      } else if (kind === 'movies') {
        hydratedMovies.forEach(pushUnique);
      } else {
        const maxLen = Math.max(hydratedSeries.length, hydratedMovies.length);
        for (let i = 0; i < maxLen; i++) {
          if (hydratedSeries[i]) pushUnique(hydratedSeries[i]);
          if (hydratedMovies[i]) pushUnique(hydratedMovies[i]);
        }
      }
    }

    // 2. Discover / Search Spain-distributed & Spanish-origin Series & Movies from TMDB (`es-ES`, `watch_region=ES`)
    const todayIso = new Date().toISOString().split('T')[0];
    const buildTmdbDiscoverUrl = (mType: 'tv' | 'movie') => {
      if (query) {
        return `https://api.themoviedb.org/3/search/${mType}?api_key=${TMDB_API_KEY}&language=es-ES&query=${encodeURIComponent(
          query
        )}&page=${page}&include_adult=false`;
      }
      const params = new URLSearchParams({
        api_key: TMDB_API_KEY,
        language: 'es-ES',
        page: String(page),
        include_adult: 'false',
        watch_region: 'ES',
        with_watch_monetization_types: 'flatrate|free|ads|rent|buy',
      });
      if (mType === 'movie') {
        params.set('primary_release_date.lte', todayIso);
      } else {
        params.set('first_air_date.lte', todayIso);
      }
      if (provCfg) {
        params.set('with_watch_providers', provCfg.id);
      }
      if (category === 'spanish_originals') {
        params.set('with_origin_country', 'ES');
        params.set('sort_by', 'popularity.desc');
      } else if (category === 'top_rated') {
        params.set('sort_by', 'vote_average.desc');
        params.set('vote_count.gte', '200');
      } else {
        params.set('sort_by', 'popularity.desc');
        params.set('vote_count.gte', '40');
      }
      const movieGenreMap: Record<string, string> = {
        action: '28',
        drama: '18',
        thriller: '53',
        comedy: '35',
        scifi: '878',
        horror: '27',
      };
      const tvGenreMap: Record<string, string> = {
        action: '10759',
        drama: '18',
        thriller: '80,9648',
        comedy: '35',
        scifi: '10765',
        horror: '9648',
      };
      const gVal = mType === 'tv' ? tvGenreMap[category] : movieGenreMap[category];
      if (gVal) params.set('with_genres', gVal);

      return `https://api.themoviedb.org/3/discover/${mType}?${params.toString()}`;
    };

    const [tvRes, movRes, movidyData] = await Promise.all([
      kind === 'all' || kind === 'series'
        ? fetch(buildTmdbDiscoverUrl('tv'), { signal: AbortSignal.timeout(4500) })
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null)
        : Promise.resolve(null),
      kind === 'all' || kind === 'movies'
        ? fetch(buildTmdbDiscoverUrl('movie'), { signal: AbortSignal.timeout(4500) })
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null)
        : Promise.resolve(null),
      (kind === 'all' || kind === 'movies') && provider === 'all' && category !== 'spanish_originals'
        ? scrapeMovidyCatalog({ category: 'trending', page, query }).catch(() => ({
            movies: [],
            hasMore: false,
          }))
        : Promise.resolve({ movies: [], hasMore: false }),
    ]);

    for (const mv of movidyData.movies.slice(0, 12)) {
      pushUnique({
        ...mv,
        mediaType: 'movie',
        languages: ['Castellano', 'Latino', 'VOSE'],
      });
    }

    const mapTmdbEntry = (raw: any, mType: 'tv' | 'movie') => {
      if (!raw?.id || (!raw.poster_path && !raw.backdrop_path)) return null;
      return {
        id: `castellano-${mType}-${raw.id}`,
        tmdbId: raw.id,
        mediaType: mType,
        title: raw.name || raw.title || raw.original_name || raw.original_title || 'Título',
        originalTitle: raw.original_name || raw.original_title || '',
        year: String(raw.first_air_date || raw.release_date || '').split('-')[0] || 'HD',
        rating: raw.vote_average ? Number(raw.vote_average).toFixed(1) : '',
        overview:
          raw.overview ||
          'Disponible en Castellano (Español de España) y VO Subtitulado en 1080p.',
        poster: raw.poster_path ? `https://image.tmdb.org/t/p/w500${raw.poster_path}` : '',
        backdrop: raw.backdrop_path
          ? `https://image.tmdb.org/t/p/w1280${raw.backdrop_path}`
          : '',
        bingetrixUrl: mType === 'movie' ? `https://bingetrix.sc/watch/${raw.id}` : undefined,
        languages: ['Castellano', 'VOSE', 'EN'],
        platform: provCfg?.label || (category === 'spanish_originals' ? 'España' : undefined),
        providerId: provCfg ? provider : undefined,
      };
    };

    const tvArr: any[] = Array.isArray(tvRes?.results) ? tvRes.results : [];
    const movArr: any[] = Array.isArray(movRes?.results) ? movRes.results : [];
    const maxDisc = Math.max(tvArr.length, movArr.length);
    for (let i = 0; i < maxDisc; i++) {
      if (tvArr[i]) pushUnique(mapTmdbEntry(tvArr[i], 'tv'));
      if (movArr[i]) pushUnique(mapTmdbEntry(movArr[i], 'movie'));
    }

    const hasMore =
      page < Math.max(Number(tvRes?.total_pages || 1), Number(movRes?.total_pages || 1));

    castellanoCatalogCache.set(cacheKey, { items, hasMore, ts: Date.now() });
    res.json({ success: true, items, hasMore, page });
  } catch (err) {
    console.error('Castellano catalog error:', err);
    res.status(500).json({ success: false, items: [], hasMore: false });
  }
});

// ============================================================================
// REST API: "TOT L'ANIME EN CATALÀ EN UN SOL LLOC" (/api/catalog/catala)
// Unifies Archive.org Catalan Anime Packs + 3Cat/SX3 Live & On-Demand in one place
// ============================================================================
interface CatalaPackSeasonDef {
  seasonNumber: number;
  name: string;
  archiveId?: string;
  ccmaProgramId?: string;
  audioNote?: string;
  customEpisodes?: any[];
}

interface CatalaAnimeEntryDef {
  id: string;
  titleCat: string;
  originalTitle: string;
  aliases?: string;
  tmdbId?: number;
  tmdbType?: 'tv' | 'movie';
  category: 'classics' | 'shonen' | 'movies';
  eraTag: string;
  episodeHint: string;
  overviewCat: string;
  fallbackPoster?: string;
  seasons: CatalaPackSeasonDef[];
}

const CATALA_ANIME_REGISTRY: CatalaAnimeEntryDef[] = [
  {
    id: 'combat-xiaolin',
    titleCat: 'Combat Xiaolin (Combat Xaolín)',
    originalTitle: 'Xiaolin Showdown',
    aliases: 'combat xaolin combat xiaolin duelo xiaolin xiaolin showdown k3 3xl omi raimundo kimiko clay shen gong wu',
    tmdbId: 679,
    tmdbType: 'tv',
    category: 'shonen',
    eraTag: 'K3 / 3XL · Arxiu + Sèrie',
    episodeHint: 'Arxiu Català K3 + 52 capítols MP4',
    overviewCat:
      "L'Omi, en Raimundo, la Kimiko i en Clay entrenant al Temple Xiaolin per protegir els Shen Gong Wu contra en Jack Spicer i la Wuya. Inclou l'arxiu conservat en català del K3 i els 52 capítols complets en reproducció directa MP4.",
    seasons: [
      {
        seasonNumber: 1,
        name: 'Arxiu K3 en Català (Openings i Clips)',
        customEpisodes: [
          {
            id: 'xiaolin-cat-op1',
            episodeNumber: 1,
            detectedNumber: 1,
            seasonNumber: 1,
            title: 'Opening 1 Oficial en Català (Emissió K3 / TV3)',
            overview: 'Careta d’entrada original en català emesa pel canal K3 / Super3.',
            still: 'https://i.ytimg.com/vi/oRvYwMsGAZQ/hqdefault.jpg',
            runtime: 1,
            youtubeVideoId: 'oRvYwMsGAZQ',
            streamUrl: 'oRvYwMsGAZQ',
            audioNote: 'Doblatge Original Català (K3)',
            sourceType: 'youtube',
          },
          {
            id: 'xiaolin-cat-intro2',
            episodeNumber: 2,
            detectedNumber: 2,
            seasonNumber: 1,
            title: 'Intro Televisió de Catalunya · Combat Xiaolin',
            overview: 'Versió televisiva conservada de la sintonia en català del canal K3.',
            still: 'https://i.ytimg.com/vi/RO7SwnPHKAk/hqdefault.jpg',
            runtime: 1,
            youtubeVideoId: 'RO7SwnPHKAk',
            streamUrl: 'RO7SwnPHKAk',
            audioNote: 'Doblatge Original Català (K3)',
            sourceType: 'youtube',
          },
          {
            id: 'xiaolin-cat-k3promo',
            episodeNumber: 3,
            detectedNumber: 3,
            seasonNumber: 1,
            title: 'Especial K3 Arts Marcials · Combat Xiaolin & Jackie Chan',
            overview: 'Fragment nostàlgic d’emissió de les sèries d’arts marcials en català al K3.',
            still: 'https://i.ytimg.com/vi/J9fNCr05ij8/hqdefault.jpg',
            runtime: 2,
            youtubeVideoId: 'J9fNCr05ij8',
            streamUrl: 'J9fNCr05ij8',
            audioNote: 'Arxiu Històric K3 Català',
            sourceType: 'youtube',
          },
          {
            id: 'xiaolin-cat-op-alt',
            episodeNumber: 4,
            detectedNumber: 4,
            seasonNumber: 1,
            title: 'Sintonia Clàssica · Combat Xiaolin (Remaster)',
            overview: ' Versió neta de l’opening de Combat Xiaolin.',
            still: 'https://i.ytimg.com/vi/v9URlfv_JDI/hqdefault.jpg',
            runtime: 1,
            youtubeVideoId: 'v9URlfv_JDI',
            streamUrl: 'v9URlfv_JDI',
            audioNote: 'Arxiu Català (K3)',
            sourceType: 'youtube',
          },
        ],
      },
      {
        seasonNumber: 2,
        name: 'Sèrie Completa · 52 Capítols (MP4 Directe)',
        archiveId: 'Dueloxiaolinlat',
        audioNote: 'Sèrie Completa MP4 (Àudio alternatiu · Rip K3 només a eMule TotsRucs)',
      },
    ],
  },
  {
    id: 'bola-de-drac',
    titleCat: 'Bola de Drac',
    originalTitle: 'Dragon Ball',
    tmdbId: 12609,
    tmdbType: 'tv',
    category: 'classics',
    eraTag: 'TV3 · Clàssic Complet',
    episodeHint: '153 capítols en català',
    overviewCat:
      "Les aventures d'en Son Goku i la Bulma buscant les set Boles de Drac amb el doblatge històric en català de TV3.",
    seasons: [{ seasonNumber: 1, name: 'Sèrie Completa (1–153)', archiveId: 'boladedrac-cat' }],
  },
  {
    id: 'bola-de-drac-z',
    titleCat: 'Bola de Drac Z',
    originalTitle: 'Dragon Ball Z',
    tmdbId: 12971,
    tmdbType: 'tv',
    category: 'shonen',
    eraTag: 'TV3 / 3XL · HD Català',
    episodeHint: '291 capítols en català',
    overviewCat:
      'Totes les sagues dels Saiyans, Freezer, Cèl·lula i Majin Buu íntegres amb àudio en català i valencià.',
    seasons: [
      { seasonNumber: 1, name: 'Temporada 1 · Saiyans i Namek', archiveId: 'boladedracz-1' },
      { seasonNumber: 2, name: 'Temporada 2 · Freezer i Androides', archiveId: 'boladedracz-2' },
      {
        seasonNumber: 3,
        name: 'Temporada 3 · Cèl·lula i Majin Buu (1080p)',
        archiveId: 'anime-en-valencia-bola-de-drac-z-hd-1080p-multi-214',
      },
    ],
  },
  {
    id: 'bola-de-drac-gt',
    titleCat: 'Bola de Drac GT',
    originalTitle: 'Dragon Ball GT',
    tmdbId: 12697,
    tmdbType: 'tv',
    category: 'shonen',
    eraTag: 'K3 / 3XL · Català',
    episodeHint: '64 capítols en català',
    overviewCat:
      'El gran viatge espacial d’en Son Goku, la Pan i en Trunks contra Baby i els Dracs Malignes en català.',
    seasons: [{ seasonNumber: 1, name: 'Sèrie Completa (1–64)', archiveId: 'bola-de-drac-gt' }],
  },
  {
    id: 'bola-de-drac-super-sx3',
    titleCat: 'Bola de Drac Súper',
    originalTitle: 'Dragon Ball Super',
    tmdbId: 62715,
    tmdbType: 'tv',
    category: 'shonen',
    eraTag: 'SX3 / 3Cat · Català',
    episodeHint: '131 capítols en català',
    overviewCat:
      'La nova etapa oficial doblada en català pel SX3 (3Cat): el Torneig del Poder, Beerus, Goku Black i Ultra Instint.',
    seasons: [{ seasonNumber: 1, name: 'SX3 Català (Capítols Oficials)', ccmaProgramId: '73476' }],
  },
  {
    id: 'one-piece-sx3',
    titleCat: 'One Piece (Català)',
    originalTitle: 'One Piece',
    tmdbId: 37854,
    tmdbType: 'tv',
    category: 'shonen',
    eraTag: 'SX3 / K3 · Català',
    episodeHint: '+220 capítols en català',
    overviewCat:
      'En Monkey D. Ruffy i la tripulació del Barret de Palla en català (emissió oficial SX3 / 3Cat).',
    seasons: [
      { seasonNumber: 1, name: 'SX3 Català (Sagues en Emissió)', ccmaProgramId: '201374971' },
    ],
  },
  {
    id: 'dr-slump',
    titleCat: 'Dr. Slump',
    originalTitle: 'Dr. Slump Arale-chan',
    tmdbId: 30723,
    tmdbType: 'tv',
    category: 'classics',
    eraTag: 'TV3 · Mític Català',
    episodeHint: '243 capítols en català',
    overviewCat:
      "L'Arale Norimaki, en Senbei i tota la Vila del Pingüí amb el llegendari doblatge català de TV3.",
    seasons: [
      { seasonNumber: 1, name: 'Pack 1 (Capítols 1–50)', archiveId: 'drslump-1' },
      { seasonNumber: 2, name: 'Pack 2 (Capítols 51–100)', archiveId: 'drslump-2' },
      { seasonNumber: 3, name: 'Pack 3 (Capítols 101–150)', archiveId: 'drslump-3' },
      { seasonNumber: 4, name: 'Pack 4 (Capítols 151–200)', archiveId: 'dr-slump-4' },
      { seasonNumber: 5, name: 'Pack 5 (Capítols 201–243)', archiveId: 'drslump-cat-5' },
    ],
  },
  {
    id: 'detectiu-conan',
    titleCat: 'El Detectiu Conan',
    originalTitle: 'Meitantei Conan',
    tmdbId: 30983,
    tmdbType: 'tv',
    category: 'classics',
    eraTag: 'K3 / Super3 / SX3',
    episodeHint: '9 Temporades en català',
    overviewCat:
      'En Shinichi Kudo convertit en Conan Edogawa resolent els casos més complexos amb el mític doblatge català.',
    seasons: [
      {
        seasonNumber: 1,
        name: 'Temporada 1',
        archiveId: 'episodi-1-el-detectiu-mes-famos-daquest-segle_202607',
      },
      {
        seasonNumber: 2,
        name: 'Temporada 2',
        archiveId: 'episodi-1-el-segrest-den-conan-edogawa',
      },
      { seasonNumber: 3, name: 'Temporada 3', archiveId: 'episodi-1-el-cas-del-segrest' },
      {
        seasonNumber: 4,
        name: 'Temporada 9',
        archiveId: 'episodi-14-el-petit-client-primera-part',
      },
      {
        seasonNumber: 5,
        name: 'Temporada 10',
        archiveId: 'episodi-1-lobjectiu-es-en-kogoro-mouri',
      },
      {
        seasonNumber: 6,
        name: 'Temporada 11 · Impacte Negre',
        archiveId: 'episodis-1-2-3-4-5-impacte-negre-a-labast-dels-bracos-de-la-organitzacio',
      },
      {
        seasonNumber: 7,
        name: 'Temporada 12',
        archiveId: 'episodi-1-la-gran-operacio-de-1r-b',
      },
      {
        seasonNumber: 8,
        name: 'Temporada 13 · Vermell i Negre',
        archiveId: 'episodi-1-el-xoc-entre-el-vermell-i-el-negre-lorigen',
      },
      {
        seasonNumber: 9,
        name: 'Temporada 14',
        archiveId: 'episodi-1-shinichi-kudo-lassassi-primera-part',
      },
    ],
  },
  {
    id: 'sakura-cacadora-cartes',
    titleCat: 'Sakura, la caçadora de cartes',
    originalTitle: 'Cardcaptor Sakura',
    tmdbId: 46261,
    tmdbType: 'tv',
    category: 'classics',
    eraTag: 'K3 / SX3 · Sèrie Completa',
    episodeHint: '70 capítols en català',
    overviewCat:
      'La Sakura Kinomoto i en Keroberos reunint totes les cartes de Clow amb el doblatge íntegre en català.',
    seasons: [
      {
        seasonNumber: 1,
        name: 'Sèrie Completa (1–70)',
        archiveId: 'sakura-la-cacadora-de-cartes-episodi-1-sakura-i-el-misterios-llibre-magic',
      },
    ],
  },
  {
    id: 'guardians-de-la-nit',
    titleCat: 'Guardians de la Nit (Kimetsu no Yaiba)',
    originalTitle: 'Kimetsu no Yaiba',
    tmdbId: 85937,
    tmdbType: 'tv',
    category: 'shonen',
    eraTag: 'SX3 · Doblatge Català HD',
    episodeHint: 'Temporada 1 en català',
    overviewCat:
      'En Tanjiro Kamado i la Nezuko en la seva lluita contra els dimonis amb doblatge en català d’alta definició.',
    seasons: [{ seasonNumber: 1, name: 'Temporada 1 (Català HD)', archiveId: 'episodi-1-crueltat' }],
  },
  {
    id: 'death-note-cat',
    titleCat: 'Death Note',
    originalTitle: 'Death Note',
    tmdbId: 13916,
    tmdbType: 'tv',
    category: 'shonen',
    eraTag: 'Canal 3XL · Complet',
    episodeHint: '37 capítols en català',
    overviewCat:
      'El duel psicològic entre en Light Yagami (Kira) i L amb el doblatge oficial en català del mític Canal 3XL.',
    seasons: [{ seasonNumber: 1, name: 'Sèrie Completa (1–37)', archiveId: 'Death-Note-cat' }],
  },
  {
    id: 'evangelion-cat',
    titleCat: 'Neon Genesis Evangelion',
    originalTitle: 'Shinseiki Evangelion',
    tmdbId: 890,
    tmdbType: 'tv',
    category: 'shonen',
    eraTag: '3XL · Obra Mestra',
    episodeHint: '26 capítols en català',
    overviewCat:
      'En Shinji Ikari, la Rei Ayanami i l’Asuka pilotant els EVA a Tòquio-3 amb el doblatge clàssic en català.',
    seasons: [{ seasonNumber: 1, name: 'Sèrie Completa (1–26)', archiveId: 'ngecat-21' }],
  },
  {
    id: 'ranma-cat',
    titleCat: 'Ranma ½',
    originalTitle: 'Ranma ½',
    tmdbId: 42501,
    tmdbType: 'tv',
    category: 'classics',
    eraTag: 'TV3 / K3 · Complet',
    episodeHint: '161 capítols en català',
    overviewCat:
      'Arts marcials, humor i les fonts maleïdes de Jusenkyo amb en Ranma Saotome i l’Akane Tendo en català.',
    seasons: [{ seasonNumber: 1, name: 'Sèrie Completa (1–161)', archiveId: 'ranma161cat' }],
  },
  {
    id: 'shin-chan-cat',
    titleCat: 'Shin-chan',
    originalTitle: 'Crayon Shin-chan',
    tmdbId: 54041,
    tmdbType: 'tv',
    category: 'classics',
    eraTag: 'K3 / 3XL · Català',
    episodeHint: '458 capítols en català',
    overviewCat:
      'Les trapelleries d’en Shinnosuke Nohara, la Misae, l’Hiroshi i el Nevado amb el doblatge català més estimat.',
    seasons: [
      { seasonNumber: 1, name: 'Col·lecció Català (458 cap.)', archiveId: 'shin-chan-catala-japanese' },
    ],
  },
  {
    id: 'inuyasha-cat',
    titleCat: 'Musculman (Kinnikuman)',
    originalTitle: 'Kinnikuman',
    tmdbId: 44213,
    tmdbType: 'tv',
    category: 'classics',
    eraTag: 'TV3 / 33 · Clàssic',
    episodeHint: '136 capítols en català',
    overviewCat:
      'El superheroi més esbojarrat del ring i l’all amb arròs amb el doblatge llegendari en català.',
    seasons: [
      { seasonNumber: 1, name: 'Sèrie Completa (136 cap.)', archiveId: 'musculman-audio-catala' },
    ],
  },
  {
    id: 'yu-yu-hakusho-cat',
    titleCat: 'Yu Yu Hakusho · Els Defensors del Més Enllà',
    originalTitle: 'Yu Yu Hakusho',
    tmdbId: 30669,
    tmdbType: 'tv',
    category: 'shonen',
    eraTag: 'K3 / 3XL · Català',
    episodeHint: 'Sagues completes en català',
    overviewCat:
      'En Yusuke Urameshi, en Kuwabara, en Kurama i en Hiei al Torneig Fosc amb el doblatge mític en català.',
    seasons: [{ seasonNumber: 1, name: 'Episodis en Català', archiveId: 'yu-yu-hakusho-part-2' }],
  },
  {
    id: 'trigun-cat',
    titleCat: "Trigun '98",
    originalTitle: 'Trigun',
    tmdbId: 46896,
    tmdbType: 'tv',
    category: 'shonen',
    eraTag: '3XL · Sèrie Completa',
    episodeHint: '26 capítols en català',
    overviewCat:
      'En Vash l’Estampida travessant el desert de Gunsmoke amb l’emblemàtic doblatge en català del 3XL.',
    seasons: [{ seasonNumber: 1, name: 'Sèrie Completa (1–26)', archiveId: '05-el-puny-mortal' }],
  },
  {
    id: 'bobobo-cat',
    titleCat: 'Bo-Bobo',
    originalTitle: 'Bobobo-bo Bo-bobo',
    tmdbId: 34857,
    tmdbType: 'tv',
    category: 'classics',
    eraTag: 'K3 · Humor Absurd',
    episodeHint: 'Sèrie en català',
    overviewCat:
      'El combat pels cabells i l’humor més surrealista amb un dels doblatges catalans més recordats del K3.',
    seasons: [{ seasonNumber: 1, name: 'Capítols en Català', archiveId: 'Bo-Bobo-cat' }],
  },
  {
    id: 'flcl-cat',
    titleCat: 'FLCL (Furi Kuri)',
    originalTitle: 'FLCL',
    tmdbId: 21437,
    tmdbType: 'tv',
    category: 'shonen',
    eraTag: '3XL · Gainax OVAs',
    episodeHint: '6 OVAs completes en català',
    overviewCat:
      'La Haruko Haruhara, en Naota i la música de The Pillows en l’obra de culte de Gainax doblada al català.',
    seasons: [{ seasonNumber: 1, name: 'OVAs Completes (1–6)', archiveId: 'flcl-cat' }],
  },
  {
    id: 'conan-noi-del-futur',
    titleCat: 'Conan, el noi del futur',
    originalTitle: 'Mirai Shonen Conan',
    tmdbId: 2004,
    tmdbType: 'tv',
    category: 'classics',
    eraTag: 'Hayao Miyazaki · Català',
    episodeHint: '26 capítols en català',
    overviewCat:
      'La primera gran sèrie dirigida per Hayao Miyazaki, amb en Conan i la Lana en un món postapocalíptic en català.',
    seasons: [{ seasonNumber: 1, name: 'Sèrie Completa (1–26)', archiveId: 'conan-el-noi-del-futur' }],
  },
  {
    id: 'capita-harlock-cat',
    titleCat: 'El Capità Harlock',
    originalTitle: 'Uchuu Kaizoku Captain Harlock',
    tmdbId: 20420,
    tmdbType: 'tv',
    category: 'classics',
    eraTag: 'TV3 · Leiji Matsumoto',
    episodeHint: 'Sèrie clàssica en català',
    overviewCat:
      'El pirata espacial de l’Arcàdia lluitant per la llibertat de la Terra amb el doblatge clàssic català.',
    seasons: [{ seasonNumber: 1, name: 'Sèrie en Català', archiveId: 'el-capita-harlock-cat' }],
  },
  {
    id: 'lamu-urusei-yatsura',
    titleCat: 'Lamu (Urusei Yatsura)',
    originalTitle: 'Urusei Yatsura',
    tmdbId: 34005,
    tmdbType: 'tv',
    category: 'classics',
    eraTag: 'TV3 / 33 · Rumiko Takahashi',
    episodeHint: 'Capítols en català',
    overviewCat:
      "L'extraterrestre Lamu i el malaurat Ataru Moroboshi en la comèdia clàssica de Rumiko Takahashi en català.",
    seasons: [{ seasonNumber: 1, name: 'Episodis en Català', archiveId: 'urusei-yatsura-lamu' }],
  },
  {
    id: 'corrector-yui-cat',
    titleCat: 'Corrector Yui',
    originalTitle: 'Corrector Yui',
    tmdbId: 44903,
    tmdbType: 'tv',
    category: 'classics',
    eraTag: 'K3 · Sèrie Completa',
    episodeHint: '2 Temporades en català',
    overviewCat:
      'La Yui Kasuga viatjant per la xarxa ComNet per protegir el món digital amb el doblatge del K3.',
    seasons: [
      {
        seasonNumber: 1,
        name: 'Box 1 (Temporada 1)',
        archiveId: 'corrector-yui-16-box-1-dvd-4-01-c-cat-jap-by-el-millor-anime',
      },
      {
        seasonNumber: 2,
        name: 'Box 2 (Temporada 2)',
        archiveId: 'corrector-yui-33-box-2-dvd-2-02-c-cat-jap-by-el-millor-anime',
      },
    ],
  },
  {
    id: 'magica-doremi-cat',
    titleCat: 'La Màgica DoReMi (+ Naisho i Pel·lícula)',
    originalTitle: 'Ojamajo Doremi',
    aliases: 'doremi naisho totsrucs buscant la magica doremi',
    tmdbId: 42705,
    tmdbType: 'tv',
    category: 'classics',
    eraTag: 'K3 / TotsRucs · 1080p',
    episodeHint: 'Sèrie + 13 OVAs + Pel·lícula',
    overviewCat:
      'La Doremi, la Hazuki i l’Aiko convertides en aprenentes de bruixa en català, incloent les 13 OVAs de Naisho i la pel·lícula de TotsRucs.',
    seasons: [
      {
        seasonNumber: 1,
        name: 'Edició 1080p Català',
        archiveId: 'buscant-la-magica-doremi-bdmv-1080p-cat-jap-by-el-millor-anime',
      },
      {
        seasonNumber: 2,
        name: 'DoReMi Naisho · 13 OVAs en Català',
        archiveId: 'doreminaisho.cat',
      },
      {
        seasonNumber: 3,
        name: 'Pel·lícula · Buscant la Màgica DoReMi (TotsRucs)',
        archiveId: 'buscando-a-la-magica-doremi-adria-tots-rucs_202609',
      },
    ],
  },
  {
    id: 'fushigi-yuugi-cat',
    titleCat: 'Fushigi Yuugi · El Joc Misteriós',
    originalTitle: 'Fushigi Yuugi',
    tmdbId: 31687,
    tmdbType: 'tv',
    category: 'classics',
    eraTag: '3XL / K3 · 2 Temporades',
    episodeHint: '52 capítols en català',
    overviewCat:
      'La Miaka i la Yui transportades a l’interior del llibre dels Quatre Déus amb doblatge íntegre en català.',
    seasons: [
      {
        seasonNumber: 1,
        name: 'Temporada 1 (Català)',
        archiveId: 'fushigi-yuugi-o-el-joc-misterios-01-dvd-raw-480cat-jap-by-taketokun-el-millor-anime',
      },
      {
        seasonNumber: 2,
        name: 'Temporada 2 (Català)',
        archiveId: 'fushigi-yuugi-o-el-joc-misterios-02-dvd-raw-480cat-jap-by-taketokun-el-millor-anime',
      },
    ],
  },
  {
    id: 'cinturo-negre-yawara',
    titleCat: 'Cinturó Negre (Yawara!)',
    originalTitle: 'Yawara! A Fashionable Judo Girl',
    tmdbId: 42992,
    tmdbType: 'tv',
    category: 'classics',
    eraTag: 'TV3 / Canal 9 · Judo',
    episodeHint: '117 capítols',
    overviewCat:
      "L'obra de Naoki Urasawa sobre el talent prodigiós de la jove judoka Yawara Inokuma.",
    seasons: [
      {
        seasonNumber: 1,
        name: 'Sèrie Completa (117 cap.)',
        archiveId: 'cinturo-negre-ginger-yawara-117-val-dvd-vhs-by-angelus-oriol-per-a-ficcioenvalencia',
      },
    ],
  },
  {
    id: 'street-fighter-2-v',
    titleCat: 'Street Fighter II V',
    originalTitle: 'Street Fighter II V',
    tmdbId: 19611,
    tmdbType: 'tv',
    category: 'shonen',
    eraTag: '3XL · Sèrie Completa',
    episodeHint: '29 capítols en català',
    overviewCat:
      'En Ryu i en Ken recorrent el món per perfeccionar el seu estil de lluita contra Shadaloo i M. Bison en català.',
    seasons: [
      { seasonNumber: 1, name: 'Sèrie Completa', archiveId: 'street-fighter-2-audio-catala' },
    ],
  },
  {
    id: 'haikyu-sx3',
    titleCat: 'Haikyu!! (Català)',
    originalTitle: 'Haikyu!!',
    tmdbId: 60863,
    tmdbType: 'tv',
    category: 'shonen',
    eraTag: 'SX3 · Voleibol HD',
    episodeHint: 'Emissió SX3 en català',
    overviewCat:
      'En Shoyo Hinata i en Tobio Kageyama portant l’institut Karasuno al cim del voleibol japonès en català.',
    seasons: [{ seasonNumber: 1, name: 'SX3 Català Oficial', ccmaProgramId: '64916' }],
  },
  // --- PEL·LÍCULES I ESPECIALS D'ANIME EN CATALÀ ---
  {
    id: 'bola-de-drac-especials',
    titleCat: 'Bola de Drac · Pel·lícules i Especials',
    originalTitle: 'Dragon Ball Movies',
    tmdbId: 39100,
    tmdbType: 'movie',
    category: 'movies',
    eraTag: 'Col·lecció Cinema · Català',
    episodeHint: 'Pel·lícules i Especials TV',
    overviewCat:
      'Col·lecció de pel·lícules clàssiques i especials de televisió de Bola de Drac i Bola de Drac Z en català.',
    seasons: [
      { seasonNumber: 1, name: 'Pel·lícules i Especials', archiveId: 'bola-de-drac-especials' },
    ],
  },
  {
    id: 'conan-black-iron-submarine',
    titleCat: 'Detectiu Conan: Black Iron Submarine',
    originalTitle: 'Detective Conan: Black Iron Submarine',
    tmdbId: 1056360,
    tmdbType: 'movie',
    category: 'movies',
    eraTag: 'Cinema en Català · HD',
    episodeHint: 'Pel·lícula en català',
    overviewCat:
      "En Conan i l'Ai Haibara s'enfronten a l'Organització dels Homes de Negre a la instal·lació submarina d'Interpol.",
    seasons: [{ seasonNumber: 1, name: 'Pel·lícula Completa', archiveId: '1744246284468' }],
  },
  {
    id: 'conan-million-dollar-pentagram',
    titleCat: 'Detectiu Conan: The Million-dollar Pentagram',
    originalTitle: 'Detective Conan: The Million-dollar Pentagram',
    tmdbId: 1211483,
    tmdbType: 'movie',
    category: 'movies',
    eraTag: 'Estrena en Català · HD',
    episodeHint: 'Pel·lícula en català',
    overviewCat:
      'En Kaito Kid, en Heiji Hattori i en Conan Edogawa a Hakodate darrere el misteri de les espases japoneses.',
    seasons: [{ seasonNumber: 1, name: 'Pel·lícula Completa', archiveId: '1766885273493_202602' }],
  },
  {
    id: 'vull-menjar-me-el-teu-pancrees',
    titleCat: 'Vull menjar-me el teu pàncrees',
    originalTitle: 'Kimi no Suizou wo Tabetai',
    tmdbId: 504253,
    tmdbType: 'movie',
    category: 'movies',
    eraTag: 'Cinema Anime · Català',
    episodeHint: 'Pel·lícula completa',
    overviewCat:
      'Una de les pel·lícules d’animació japonesa més emotives dels últims anys, íntegra doblada en català.',
    seasons: [{ seasonNumber: 1, name: 'Pel·lícula Completa', archiveId: '20200427_20200427_1958' }],
  },
  {
    id: 'tomba-de-les-lluernes-cat',
    titleCat: 'La tomba de les lluernes (Studio Ghibli)',
    originalTitle: 'Hotaru no Haka',
    tmdbId: 12477,
    tmdbType: 'movie',
    category: 'movies',
    eraTag: 'Studio Ghibli · Català',
    episodeHint: 'Pel·lícula completa',
    overviewCat:
      "L'obra mestra d'Isao Takahata i Studio Ghibli amb doblatge en català.",
    seasons: [
      {
        seasonNumber: 1,
        name: 'Pel·lícula Completa',
        archiveId: 'LaTumbaDeLasLuciernagasDVDripAC3EspCatJapwwwlokotorrentscom',
      },
    ],
  },
  {
    id: 'ghost-in-the-shell-2-cat',
    titleCat: 'Ghost in the Shell 2: Innocence',
    originalTitle: 'Ghost in the Shell 2: Innocence',
    tmdbId: 12244,
    tmdbType: 'movie',
    category: 'movies',
    eraTag: 'Mamoru Oshii · Català',
    episodeHint: 'Pel·lícula completa',
    overviewCat:
      'En Batou i en Togusa de la Secció 9 investigant ginoides rebels en el clàssic ciberpunk en català.',
    seasons: [
      {
        seasonNumber: 1,
        name: 'Pel·lícula Completa',
        archiveId: 'ghost-in-the-shell-2-innocence-cat',
      },
    ],
  },
  {
    id: 'alita-angel-combat-cat',
    titleCat: 'Alita, Àngel de Combat (OVA 1993)',
    originalTitle: 'Gunnm',
    tmdbId: 37933,
    tmdbType: 'movie',
    category: 'movies',
    eraTag: '3XL · Cyberpunk Català',
    episodeHint: 'OVAs completes en català',
    overviewCat:
      'Les OVAs clàssiques de 1993 basades en el manga Gunnm amb el doblatge històric en català.',
    seasons: [
      { seasonNumber: 1, name: 'OVAs en Català', archiveId: 'alita-angel-de-combat-1993' },
    ],
  },
  {
    id: 'dr-slump-pelis-ovas',
    titleCat: 'Dr. Slump · Pel·lícules i OVAs',
    originalTitle: 'Dr. Slump Movies',
    tmdbId: 30723,
    tmdbType: 'tv',
    category: 'movies',
    eraTag: 'TV3 · Especials Català',
    episodeHint: 'Col·lecció Pel·lícules',
    overviewCat:
      "Totes les pel·lícules i OVAs clàssiques del Dr. Slump i l'Arale doblades al català.",
    seasons: [{ seasonNumber: 1, name: 'Pel·lícules i OVAs', archiveId: 'OVAS-PELIS-DR-SLUMP' }],
  },
  {
    id: 'wicked-city-cat',
    titleCat: 'La Ciutat Maldita (Wicked City · 1080p)',
    originalTitle: 'Youjuu Toshi',
    tmdbId: 20541,
    tmdbType: 'movie',
    category: 'movies',
    eraTag: 'Yoshiaki Kawajiri · 1080p',
    episodeHint: 'Blu-ray 1080p Català',
    overviewCat:
      'El clàssic fosc de Yoshiaki Kawajiri restaurat en Blu-ray 1080p amb àudio en català.',
    seasons: [
      {
        seasonNumber: 1,
        name: 'Blu-ray 1080p Català',
        archiveId: 'wicked-city-1987-blu-ray-1440x-1080-cat',
      },
    ],
  },
  {
    id: 'saint-seiya-santuari-cat',
    titleCat: 'Saint Seiya: La Llegenda del Santuari',
    originalTitle: 'Saint Seiya: Legend of Sanctuary',
    tmdbId: 227707,
    tmdbType: 'movie',
    category: 'movies',
    eraTag: 'Cavallers del Zodíac · Català',
    episodeHint: 'Pel·lícula en català',
    overviewCat:
      'La batalla de les Dotze Cases del Santuari amb en Seiya i els Cavallers de Bronze en català.',
    seasons: [
      {
        seasonNumber: 1,
        name: 'Pel·lícula Completa',
        archiveId: 'saint-seiya-la-llegenda-del-santuari',
      },
    ],
  },
  // --- COL·LECCIÓ TOTSRUCS / MECANOSCRIT / 3XL / K3 EN CATALÀ ---
  {
    id: 'serial-experiments-lain-cat',
    titleCat: 'Serial Experiments Lain',
    originalTitle: 'Serial Experiments Lain',
    aliases: 'lain 3xl ciberpunk totsrucs',
    tmdbId: 1087,
    tmdbType: 'tv',
    category: 'shonen',
    eraTag: 'Canal 3XL · Obra de Culte',
    episodeHint: '13 capítols HD en català',
    overviewCat:
      'La Lain Iwakura endinsant-se al Wired en una de les obres mestres més hipnòtiques i llegendàries emeses al Canal 3XL en català.',
    seasons: [
      {
        seasonNumber: 1,
        name: 'Sèrie Completa (1–13 HD Català)',
        archiveId: 'serial-experiments-lain-9-hd-catala-480p-24fps-h-264-128kbit-aac',
      },
    ],
  },
  {
    id: 'candy-candy-cat',
    titleCat: 'Candy Candy',
    originalTitle: 'Candy Candy',
    aliases: 'candy tv3 classic totsrucs',
    tmdbId: 9160,
    tmdbType: 'tv',
    category: 'classics',
    eraTag: 'TV3 · Clàssic Complet',
    episodeHint: '115 capítols en català',
    overviewCat:
      'La història clàssica i inoblidable de la Candy White amb els 115 capítols íntegres doblats en català.',
    seasons: [
      {
        seasonNumber: 1,
        name: 'Sèrie Completa (1–115 Català)',
        archiveId: 'CandyCandyCatalan',
      },
    ],
  },
  {
    id: 'reboot-cat',
    titleCat: 'ReBoot',
    originalTitle: 'ReBoot',
    aliases: 'reboot bob enzo mainframe k3 3xl totsrucs',
    tmdbId: 2121,
    tmdbType: 'tv',
    category: 'classics',
    eraTag: 'K3 / 3XL · Clàssic Digital',
    episodeHint: '39 capítols en català',
    overviewCat:
      'En Bob, la Dot i l’Enzo defensant el sistema Mainframe dels virus Megabyte i Hexadecimal amb el doblatge mític en català.',
    seasons: [
      {
        seasonNumber: 1,
        name: ' Temporades en Català (39 cap.)',
        archiveId: 'reboot_202601',
      },
    ],
  },
  {
    id: 'dome-beisbol-cat',
    titleCat: 'Dome, el petit geni del beisbol',
    originalTitle: 'Miracle Giants Dome-kun',
    aliases: 'dome beisbol tv3 k3 totsrucs',
    category: 'classics',
    eraTag: 'TV3 / K3 · Esports Clàssic',
    episodeHint: 'Sèrie completa en català',
    overviewCat:
      'En Dome新城 i els seus llançaments impossibles als Yomiuri Giants amb el doblatge clàssic en català de TV3.',
    seasons: [
      {
        seasonNumber: 1,
        name: 'Sèrie en Català',
        archiveId: 'dome-el-petit-geni-del-beisbol',
      },
    ],
  },
  {
    id: 'os-gran-casa-blava-cat',
    titleCat: "L'ós de la gran casa blava",
    originalTitle: 'Bear in the Big Blue House',
    aliases: 'os de la gran casa blava totsrucs super3 k3',
    tmdbId: 207,
    tmdbType: 'tv',
    category: 'classics',
    eraTag: 'Club Super3 · TotsRucs',
    episodeHint: '44 capítols en català',
    overviewCat:
      'El clàssic més estimat del Club Super3 rescatat per TotsRucs amb 44 episodis complets en català.',
    seasons: [
      {
        seasonNumber: 1,
        name: 'Col·lecció TotsRucs (44 cap. Català)',
        archiveId: 'los-de-la-gran-casa-blava',
      },
    ],
  },
  {
    id: 'sagwa-cat',
    titleCat: 'Sagwa, la gata siamesa',
    originalTitle: 'Sagwa, the Chinese Siamese Cat',
    aliases: 'sagwa k3 super3 totsrucs',
    tmdbId: 35104,
    tmdbType: 'tv',
    category: 'classics',
    eraTag: 'K3 / Super3 · Català',
    episodeHint: '17 episodis en català',
    overviewCat:
      'Les aventures cal·ligràfiques de la gata Sagwa amb l’emissió clàssica en català de TV3 / K3.',
    seasons: [
      {
        seasonNumber: 1,
        name: 'Episodis TV3Rip en Català',
        archiveId: 'sagwa-la-gata-siamesa-catala',
      },
    ],
  },
  {
    id: 'taro-alienigena-cat',
    titleCat: "Taro, l'alienígena",
    originalTitle: 'Uchuuujin Tanaka Tarou',
    aliases: 'taro alienigena k3 totsrucs',
    category: 'classics',
    eraTag: 'K3 · Humor Esbojarrat',
    episodeHint: 'Capítols en català',
    overviewCat:
      'Les bogeries surrealistes d’en Taro Tanaka a l’escola primària amb el doblatge en català del K3.',
    seasons: [
      {
        seasonNumber: 1,
        name: 'Capítols Conservats en Català',
        archiveId: 'taro-lalienigena-catala',
      },
    ],
  },
  {
    id: 'castell-al-cel-ghibli-cat',
    titleCat: 'El Castell al Cel (Studio Ghibli · 1080p)',
    originalTitle: 'Tenkuu no Shiro Laputa',
    aliases: 'laputa castell al cel ghibli miyazaki totsrucs hakyra',
    tmdbId: 10515,
    tmdbType: 'movie',
    category: 'movies',
    eraTag: 'Studio Ghibli · TotsRucs 1080p',
    episodeHint: 'Blu-ray 1080p Català',
    overviewCat:
      "L'aventura llegendària d'en Pazu i la Sheeta cap a Laputa dirigida per Hayao Miyazaki, edició TotsRucs Blu-ray 1080p en català.",
    seasons: [
      {
        seasonNumber: 1,
        name: 'Edició TotsRucs BD 1080p Català',
        archiveId: 'sg-01-el-castell-al-cel-1986-bd.-1080p.-cat-esp-jpn.-h-264.8bit.-25-fps-hakyra-t',
      },
    ],
  },
  {
    id: 'akira-totsrucs-cat',
    titleCat: 'Akira (1988 · Edició TotsRucs 1080p)',
    originalTitle: 'Akira',
    aliases: 'akira kaneda tetsuo neo tokyo 3xl totsrucs',
    tmdbId: 149,
    tmdbType: 'movie',
    category: 'movies',
    eraTag: '3XL / TotsRucs · BDRip 1080p',
    episodeHint: 'Pel·lícula 1080p Català',
    overviewCat:
      'Neo-Tokyo 2019: l’obra mestra ciberpunk de Katsuhiro Otomo en edició restaurada BDRip 1080p de TotsRucs amb àudio català.',
    seasons: [
      {
        seasonNumber: 1,
        name: 'BDRip 1080p TotsRucs',
        archiveId: 'akira-bdrip-1080p-h-264-ac-3-multiaudio-subs-kyaneros-shippuden-sanin-sondela-89-tots-rucs',
      },
    ],
  },
  {
    id: 'tortugues-ninja-1990-cat',
    titleCat: 'Les Tortugues Ninja (1990 · TotsRucs 1080p)',
    originalTitle: 'Teenage Mutant Ninja Turtles',
    aliases: 'tortugues ninja tmnt totsrucs 1990',
    tmdbId: 1498,
    tmdbType: 'movie',
    category: 'movies',
    eraTag: 'TotsRucs.cat · BDRip 1080p',
    episodeHint: 'Pel·lícula 1080p en català',
    overviewCat:
      'El clàssic de 1990 d’en Leonardo, Raphael, Michelangelo i Donatello en 1080p amb el mític doblatge en català (TotsRucs.cat).',
    seasons: [
      {
        seasonNumber: 1,
        name: 'Pel·lícula BDRip 1080p Català (TotsRucs)',
        archiveId: 'les-tortugues-ninja-1990-teenage-mutant-ninja-turtles-bdrip-1080p-x-264-ac-3-cat',
      },
    ],
  },
  {
    id: 'la-mascara-1994-cat',
    titleCat: 'La Màscara (1994 · Mecanoscrit / TotsRucs)',
    originalTitle: 'The Mask',
    aliases: 'la mascara jim carrey mecanoscrit totsrucs tv3',
    tmdbId: 854,
    tmdbType: 'movie',
    category: 'movies',
    eraTag: 'TV3 / Mecanoscrit · 720p',
    episodeHint: 'Pel·lícula HD en català',
    overviewCat:
      'Jim Carrey amb l’icònic doblatge català de TV3 preservat per Mecanoscrit.cat i TotsRucs en alta definició.',
    seasons: [
      {
        seasonNumber: 1,
        name: 'BRRip 720p Català (Mecanoscrit.cat)',
        archiveId: 'la-mascara-1994-brrip-720p-x-264-catala-english-per-hal-9000-mecanoscrit.cat',
      },
    ],
  },
];

const CATALA_LIVE_CHANNELS: any[] = [
  {
    id: 'cat-sx3-live',
    dial: 1,
    name: 'SX3 / 33 · Anime i Infantil 24h',
    shortMark: 'SX3',
    brandTone: '#EC4899',
    network: '3Cat Catalunya',
    category: 'infantil_autonomicas',
    quality: '1080p HD',
    description: 'Emissió oficial en directe amb anime en català (One Piece, Conan, Sakura, Haikyu)',
    channels: [
      {
        id: 'sx3-int-hls',
        label: 'Senyal Internacional 3Cat HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://directes-tv-int.3catdirectes.cat/live-content/c33-super3-hls/master.m3u8',
        resolverType: 'tdt_hls',
      },
      {
        id: 'sx3-24h-cat',
        label: 'Senyal SX3 24h Exclusiu (Espanya)',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://directes-tv-cat.3catdirectes.cat/live-content/super3-hls/master.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'cat-tv3-live',
    dial: 2,
    name: 'TV3 en Directe (3Cat)',
    shortMark: 'TV3',
    brandTone: '#E11D48',
    network: '3Cat Catalunya',
    category: 'infantil_autonomicas',
    quality: '1080p HD',
    description: 'Televisió de Catalunya en directe: sèries, cinema en català i TN',
    channels: [
      {
        id: 'tv3-int-hls',
        label: 'Senyal Internacional TV3 HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://directes3-tv-int.3catdirectes.cat/live-content/tvi-hls/master.m3u8',
        resolverType: 'tdt_hls',
      },
      {
        id: 'tv3-cat-hls',
        label: 'Senyal Catalunya TV3 HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://directes3-tv-cat.3catdirectes.cat/live-content/tv3-hls/master.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'cat-esport3-live',
    dial: 3,
    name: 'Esport3 en Directe',
    shortMark: 'E3',
    brandTone: '#F97316',
    network: '3Cat Esports',
    category: 'noticias_deportes',
    quality: '1080p HD',
    description: 'Esports i retransmissions en directe en català',
    channels: [
      {
        id: 'esport3-int-hls',
        label: 'Senyal Oficial Esport3 HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://directes-tv-int.3catdirectes.cat/live-origin/esport3-hls/master.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'cat-324-live',
    dial: 4,
    name: '324 Notícies 24h',
    shortMark: '324',
    brandTone: '#EF4444',
    network: '3Cat Informatius',
    category: 'noticias_deportes',
    quality: '1080p HD',
    description: 'Informació contínua 24 hores en català',
    channels: [
      {
        id: '324-int-hls',
        label: 'Senyal Oficial 324 HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://directes-tv-int.3catdirectes.cat/live-content/canal324-hls/master.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
];

const catalaArtHydrationCache = new Map<
  string,
  { poster: string; backdrop: string; year: string; rating: string; ts: number }
>();
const archiveMetadataCache = new Map<string, { episodes: any[]; ts: number }>();

async function hydrateCatalaArtwork(entry: CatalaAnimeEntryDef) {
  const cached = catalaArtHydrationCache.get(entry.id);
  if (cached && Date.now() - cached.ts < 12 * 60 * 60 * 1000) {
    return cached;
  }
  let poster = entry.fallbackPoster || '';
  let backdrop = '';
  let year = 'CAT';
  let rating = '';

  if (entry.tmdbId && entry.tmdbType) {
    try {
      const res = await fetch(
        `https://api.themoviedb.org/3/${entry.tmdbType}/${entry.tmdbId}?api_key=${TMDB_API_KEY}&language=es-ES`,
        { signal: AbortSignal.timeout(3200) }
      );
      if (res.ok) {
        const m: any = await res.json();
        if (m?.poster_path) poster = `https://image.tmdb.org/t/p/w500${m.poster_path}`;
        if (m?.backdrop_path) backdrop = `https://image.tmdb.org/t/p/w1280${m.backdrop_path}`;
        const d = String(m?.first_air_date || m?.release_date || '');
        if (d) year = d.split('-')[0] || year;
        if (m?.vote_average) rating = Number(m.vote_average).toFixed(1);
      }
    } catch {
      // fallback to archive thumbnail if needed
    }
  }

  if (!poster && entry.seasons[0]?.archiveId) {
    poster = `https://archive.org/services/img/${entry.seasons[0].archiveId}`;
  }

  const art = { poster, backdrop: backdrop || poster, year, rating, ts: Date.now() };
  catalaArtHydrationCache.set(entry.id, art);
  return art;
}

async function fetchArchivePackEpisodes(
  archiveId: string,
  seasonNumber: number,
  audioNote?: string
): Promise<any[]> {
  const cacheKey = `${archiveId}:${seasonNumber}:${audioNote || ''}`;
  const cached = archiveMetadataCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < 60 * 60 * 1000) {
    return cached.episodes;
  }

  try {
    const res = await fetch(`https://archive.org/metadata/${encodeURIComponent(archiveId)}`, {
      headers: { 'User-Agent': CHROME_UA, Accept: 'application/json' },
      signal: AbortSignal.timeout(6500),
    });
    if (!res.ok) return [];
    const meta: any = await res.json();
    const files: any[] = Array.isArray(meta?.files) ? meta.files : [];

    // Group `.ia.mp4` (H.264/AAC browser universal) and original `.mp4` by base stem
    const byStem = new Map<
      string,
      { iaMp4?: any; origMp4?: any; mkvFile?: any; rawTitle?: string; thumb?: string }
    >();

    const thumbsByStem = new Map<string, string>();
    for (const f of files) {
      const name = String(f?.name || '');
      if (/\.(jpg|jpeg|png)$/i.test(name) && !name.includes('__ia_thumb')) {
        const stem = name.replace(/\.(thumbs\/.*|jpg|jpeg|png)$/i, '').trim();
        if (stem) {
          thumbsByStem.set(
            stem,
            `https://archive.org/download/${encodeURIComponent(archiveId)}/${encodeURIComponent(
              name
            )}`
          );
        }
      }
    }

    for (const f of files) {
      const name = String(f?.name || '');
      if (!name || name.startsWith('__')) continue;
      if (/\.ia\.mp4$/i.test(name)) {
        const stem = name.replace(/\.ia\.mp4$/i, '');
        const cur = byStem.get(stem) || {};
        cur.iaMp4 = f;
        if (f.title) cur.rawTitle = String(f.title);
        byStem.set(stem, cur);
      } else if (/\.mp4$/i.test(name)) {
        const stem = name.replace(/\.mp4$/i, '');
        const cur = byStem.get(stem) || {};
        cur.origMp4 = f;
        if (f.title) cur.rawTitle = String(f.title);
        byStem.set(stem, cur);
      }
    }

    const rawEntries = Array.from(byStem.entries()).filter(
      ([, v]) => Boolean(v.iaMp4 || v.origMp4)
    );

    rawEntries.sort(([stemA], [stemB]) =>
      stemA.localeCompare(stemB, 'ca', { numeric: true, sensitivity: 'base' })
    );

    const defaultThumb = `https://archive.org/services/img/${encodeURIComponent(archiveId)}`;

    const episodes = rawEntries.map(([stem, val], idx) => {
      const cleanName = stem
        .replace(/^.*\//, '')
        .replace(/[_]+/g, ' ')
        .replace(/\b(BDMV|DVDrip|1080p|720p|480p|x264|h264|AC3|CAT-JAP|by\s+.*)\b/gi, '')
        .replace(/\s{2,}/g, ' ')
        .trim();

      const epNumMatch =
        cleanName.match(/(?:episodi|cap[ií]tol|ep\.?|cap\.?)\s*0*(\d{1,4})/i) ||
        cleanName.match(/(?:^|\s|-)0*(\d{1,3})(?:\s|-|\.)/);
      const epNumber = idx + 1;
      const displayTitle = val.rawTitle
        ? String(val.rawTitle).trim()
        : cleanName || `Capítol ${epNumber}`;

      const iaUrl = val.iaMp4
        ? `https://archive.org/download/${encodeURIComponent(archiveId)}/${nameToArchivePath(
            val.iaMp4.name
          )}`
        : '';
      const origUrl = val.origMp4
        ? `https://archive.org/download/${encodeURIComponent(archiveId)}/${nameToArchivePath(
            val.origMp4.name
          )}`
        : '';

      // Prefer `.ia.mp4` first when present because Archive.org transcodes `.ia.mp4` to universal browser H.264 + AAC stereo,
      // while keeping original `.mp4` as Track 2 ("Català Original Màxima Qualitat")!
      const primaryUrl = iaUrl || origUrl;
      const tracks: TrackRecord[] = [];
      if (iaUrl) {
        tracks.push({
          id: `cat-ia-${seasonNumber}-${epNumber}`,
          label: 'Català · Web HD (Compatible)',
          lang: 'ES',
          quality: 'HD',
          sourceUrl: iaUrl,
          resolverType: 'direct_mp4',
          resolvedStreamUrl: iaUrl,
        });
      }
      if (origUrl && origUrl !== iaUrl) {
        tracks.push({
          id: `cat-orig-${seasonNumber}-${epNumber}`,
          label: 'Català · Màxima Qualitat Original',
          lang: 'ES',
          quality: '1080p',
          sourceUrl: origUrl,
          resolverType: 'direct_mp4',
          resolvedStreamUrl: origUrl,
        });
      }

      const lenSec = Number(val.origMp4?.length || val.iaMp4?.length || 0);
      const runtimeMin = lenSec > 60 ? Math.round(lenSec / 60) : undefined;

      return {
        id: `cat-ep-${archiveId}-${epNumber}`,
        episodeNumber: epNumber,
        detectedNumber: epNumMatch?.[1] ? Number(epNumMatch[1]) : epNumber,
        seasonNumber,
        title: displayTitle,
        overview: audioNote || 'Àudio en català · Reproducció directa sense anuncis.',
        still: thumbsByStem.get(stem) || defaultThumb,
        runtime: runtimeMin,
        streamUrl: primaryUrl,
        audioNote,
        sourceType: 'archive_mp4',
        tracks,
      };
    });

    archiveMetadataCache.set(cacheKey, { episodes, ts: Date.now() });
    return episodes;
  } catch (err) {
    console.warn('Archive metadata error:', archiveId, err);
    return [];
  }
}

function nameToArchivePath(fileName: string): string {
  return String(fileName || '')
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
}

async function fetchCcmaProgramEpisodes(programId: string, seasonNumber: number): Promise<any[]> {
  const cacheKey = `ccma:${programId}:${seasonNumber}`;
  const cached = archiveMetadataCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < 20 * 60 * 1000) {
    return cached.episodes;
  }
  try {
    const apiUrl = `https://api.3cat.cat/videos?_format=json&origen=llistat&programatv_id=${encodeURIComponent(
      programId
    )}&tipus_contingut=PPD&items_pagina=100&pagina=1&ordre=capitol&perfil=pc`;
    const res = await fetch(apiUrl, {
      headers: { 'User-Agent': CHROME_UA, Accept: 'application/json' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const json: any = await res.json();
    const rawItems = json?.resposta?.items?.item;
    const list: any[] = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];

    const episodes = list.map((it, idx) => {
      const vidId = String(it?.id || '');
      const capNum = Number(it?.capitol || idx + 1);
      const title = String(it?.titol || `Capítol ${capNum}`).trim();
      const synopsis = String(it?.entradeta || 'Emissió oficial SX3 / 3Cat en català.').trim();
      const imgs: any[] = Array.isArray(it?.imatges?.imatge)
        ? it.imatges.imatge
        : it?.imatges?.imatge
        ? [it.imatges.imatge]
        : [];
      const still = String(imgs[0]?.text || '');

      return {
        id: `3cat-${programId}-${vidId || idx}`,
        episodeNumber: idx + 1,
        detectedNumber: capNum,
        seasonNumber,
        title: capNum ? `Cap. ${capNum} · ${title}` : title,
        overview: synopsis,
        still,
        ccmaVideoId: vidId,
        sourceType: 'ccma_3cat',
      };
    });

    archiveMetadataCache.set(cacheKey, { episodes, ts: Date.now() });
    return episodes;
  } catch {
    return [];
  }
}

app.get('/api/catalog/catala', async (req, res) => {
  try {
    const category = String(req.query.category || 'all').toLowerCase();
    const query = String(req.query.query || '').trim();
    const normalizeCatalaSearch = (s: string) =>
      normalizeTitleForMatch(s)
        .replace(/\bxaolin\b/g, 'xiaolin')
        .replace(/xao/g, 'xiao');
    const normQ = normalizeCatalaSearch(query);

    let baseEntries = CATALA_ANIME_REGISTRY;
    if (category === 'classics' || category === 'shonen' || category === 'movies') {
      baseEntries = baseEntries.filter((e) => e.category === category);
    }
    if (normQ) {
      baseEntries = baseEntries.filter((e) => {
        const hay = normalizeCatalaSearch(
          `${e.titleCat} ${e.originalTitle} ${e.aliases || ''} ${e.overviewCat} ${e.eraTag}`
        );
        return hay.includes(normQ);
      });
    }

    const hydratedItems = await Promise.all(
      baseEntries.map(async (entry) => {
        const art = await hydrateCatalaArtwork(entry);
        return {
          id: entry.id,
          title: entry.titleCat,
          originalTitle: entry.originalTitle,
          tmdbId: entry.tmdbId,
          mediaType: entry.tmdbType || 'tv',
          category: entry.category,
          eraTag: entry.eraTag,
          episodeHint: entry.episodeHint,
          year: art.year,
          rating: art.rating,
          overview: entry.overviewCat,
          poster: art.poster,
          backdrop: art.backdrop,
          seasonCount: entry.seasons.length,
        };
      })
    );

    // Dynamic Live Archive.org Search (including TotsRucs / Mecanoscrit / Trobanime uploads) when user types a custom title!
    let dynamicArchiveItems: any[] = [];
    if (query.length >= 2) {
      try {
        const cleanArchQ = query.replace(/xaol[ií]n/gi, 'xiaolin');
        const advQ = `(${cleanArchQ}) AND (catala OR català OR valencia OR 3xl OR super3 OR totsrucs OR "tots rucs" OR mecanoscrit OR trobanime) AND mediatype:(movies)`;
        const advUrl = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(
          advQ
        )}&fl[]=identifier,title,description&sort[]=downloads+desc&rows=12&page=1&output=json`;
        const advRes = await fetch(advUrl, { signal: AbortSignal.timeout(4200) });
        if (advRes.ok) {
          const advJson: any = await advRes.json();
          const docs: any[] = Array.isArray(advJson?.response?.docs)
            ? advJson.response.docs
            : [];
          const knownArchiveIds = new Set(
            CATALA_ANIME_REGISTRY.flatMap((e) => e.seasons.map((s) => s.archiveId).filter(Boolean))
          );
          dynamicArchiveItems = docs
            .filter((d) => d?.identifier && !knownArchiveIds.has(String(d.identifier)))
            .map((d) => {
              const ident = String(d.identifier);
              const img = `https://archive.org/services/img/${encodeURIComponent(ident)}`;
              return {
                id: `arch-${ident}`,
                title: String(d.title || ident),
                originalTitle: ident,
                mediaType: 'tv',
                category: 'all',
                eraTag: 'Arxiu Català / TotsRucs',
                episodeHint: 'Vídeo directe',
                year: 'CAT',
                rating: '',
                overview:
                  typeof d.description === 'string'
                    ? d.description.replace(/<[^>]+>/g, '').slice(0, 220)
                    : 'Contingut en català trobat a l’arxiu comunitari.',
                poster: img,
                backdrop: img,
                seasonCount: 1,
              };
            });
        }
      } catch {
        // ignore dynamic search timeout
      }
    }

    res.json({
      success: true,
      items: [...hydratedItems, ...dynamicArchiveItems],
      liveChannels: CATALA_LIVE_CHANNELS,
      communityLinks: [
        {
          id: 'totsrucs-cat',
          label: 'TotsRucs.cat (Índex P2P Català)',
          url: 'https://web.totsrucs.cat/',
          desc: 'Arxiu històric eMule/ed2k de sèries i cinema en català (packs directes ja integrats aquí)',
        },
        {
          id: 'mecanoscrit-cat',
          label: 'Mecanoscrit.cat',
          url: 'https://mecanoscrit.cat/',
          desc: 'Preservació de cinema i ciència-ficció doblada o subtitulada en català',
        },
        {
          id: 'tg-animecatala',
          label: 'Telegram @animecatala',
          url: 'https://t.me/s/animecatala',
          desc: 'Canal comunitari amb avisos i novetats en català',
        },
        {
          id: 'fansubs-cat',
          label: 'Anime Fansubs.cat',
          url: 'https://anime.fansubs.cat/',
          desc: 'Enciclopèdia i índex del doblatge i fansub en català',
        },
        {
          id: 'sx3-portal',
          label: 'SX3 / 3Cat Anime Oficial',
          url: 'https://www.3cat.cat/tv3/sx3/',
          desc: 'Portal públic oficial amb estrenes d’anime en català',
        },
      ],
    });
  } catch (err) {
    console.error('Catala catalog error:', err);
    res.status(500).json({ success: false, items: [], liveChannels: [] });
  }
});

app.get('/api/catalog/catala/:itemId/episodes', async (req, res) => {
  try {
    const itemId = String(req.params.itemId || '').trim();
    const requestedSeason = Math.max(1, parseInt(String(req.query.season || '1'), 10) || 1);

    // Support dynamic `arch-<identifier>` items discovered via live search!
    if (itemId.startsWith('arch-')) {
      const archiveId = itemId.slice(5);
      const episodes = await fetchArchivePackEpisodes(archiveId, 1);
      const img = `https://archive.org/services/img/${encodeURIComponent(archiveId)}`;
      return res.json({
        success: true,
        details: {
          id: itemId,
          title: archiveId.replace(/[-_]+/g, ' '),
          eraTag: 'Arxiu Català',
          overview: ' Reproducció directa en català sense anuncis.',
          poster: img,
          backdrop: img,
          activeSeason: 1,
          seasons: [{ seasonNumber: 1, name: 'Capítols i Vídeos', episodeCount: episodes.length }],
          episodes,
        },
      });
    }

    const entry = CATALA_ANIME_REGISTRY.find((e) => e.id === itemId);
    if (!entry) {
      return res.status(404).json({ success: false, error: 'Anime en català no trobat.' });
    }

    const art = await hydrateCatalaArtwork(entry);
    const chosenSeason =
      entry.seasons.find((s) => s.seasonNumber === requestedSeason) || entry.seasons[0];

    const episodes = Array.isArray(chosenSeason.customEpisodes)
      ? chosenSeason.customEpisodes
      : chosenSeason.archiveId
      ? await fetchArchivePackEpisodes(
          chosenSeason.archiveId,
          chosenSeason.seasonNumber,
          chosenSeason.audioNote
        )
      : chosenSeason.ccmaProgramId
      ? await fetchCcmaProgramEpisodes(chosenSeason.ccmaProgramId, chosenSeason.seasonNumber)
      : [];

    return res.json({
      success: true,
      details: {
        id: entry.id,
        title: entry.titleCat,
        originalTitle: entry.originalTitle,
        eraTag: entry.eraTag,
        year: art.year,
        rating: art.rating,
        overview: entry.overviewCat,
        poster: art.poster,
        backdrop: art.backdrop,
        activeSeason: chosenSeason.seasonNumber,
        seasons: entry.seasons.map((s) => ({
          seasonNumber: s.seasonNumber,
          name: s.name,
          episodeCount:
            s.seasonNumber === chosenSeason.seasonNumber
              ? episodes.length
              : Array.isArray(s.customEpisodes)
              ? s.customEpisodes.length
              : 0,
        })),
        episodes,
      },
    });
  } catch (err) {
    console.error('Catala episodes error:', err);
    res.status(500).json({ success: false });
  }
});

app.get('/api/extract/catala-3cat', async (req, res) => {
  try {
    const vidId = String(req.query.vidId || '').replace(/\D/g, '');
    if (!vidId) return res.status(400).json({ success: false });

    const mediaApi = `https://dinamics.ccma.cat/pvideo/media.jsp?media=video&version=0s&idint=${vidId}&profile=pc`;
    const mRes = await fetch(mediaApi, {
      headers: { 'User-Agent': CHROME_UA, Accept: 'application/json' },
      signal: AbortSignal.timeout(4500),
    });
    const officialWebUrl = `https://www.3cat.cat/3cat/video/${vidId}/`;

    if (mRes.ok) {
      const mJson: any = await mRes.json();
      const urlsRaw = mJson?.media?.url;
      const urlList: any[] = Array.isArray(urlsRaw) ? urlsRaw : urlsRaw ? [urlsRaw] : [];
      const sorted = [...urlList].sort(
        (a, b) =>
          parseInt(String(b?.label || '0'), 10) - parseInt(String(a?.label || '0'), 10)
      );
      const bestUrl = String(sorted[0]?.file || '').trim();
      if (bestUrl) {
        const tracks: TrackRecord[] = sorted
          .filter((u) => u?.file)
          .map((u, idx) => ({
            id: `3cat-mp4-${vidId}-${idx}`,
            label: `Català Oficial 3Cat · ${u.label || 'HD'}`,
            lang: 'ES',
            quality: String(u.label || 'HD'),
            sourceUrl: String(u.file),
            resolverType: 'direct_mp4',
            resolvedStreamUrl: String(u.file),
          }));
        tracks.push({
          id: `3cat-cloud-${vidId}`,
          label: 'Obrir al Cloud Browser (3Cat Oficial)',
          lang: 'ES',
          quality: 'HD',
          sourceUrl: officialWebUrl,
          resolverType: 'cloud_browser',
        });
        return res.json({
          success: true,
          mode: 'direct',
          streamUrl: bestUrl,
          tracks,
          officialWebUrl,
        });
      }
    }

    return res.json({
      success: true,
      mode: 'cloud',
      streamUrl: officialWebUrl,
      tracks: [],
      officialWebUrl,
    });
  } catch {
    return res.status(500).json({ success: false });
  }
});

// ============================================================================
// SELF-DESTROYING SERVICE WORKER & CACHE PURGE ENDPOINT
// Ensures any browser that previously cached a Workbox bundle immediately
// purges its cache and reloads fresh from the live server.
// ============================================================================
app.get(['/sw.js', '/service-worker.js'], (_req, res) => {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.send(`// NAIMCINE Cache-Purging Service Worker v4
self.addEventListener('install', function () {
  self.skipWaiting();
});
self.addEventListener('activate', function (event) {
  event.waitUntil(
    (async function () {
      try {
        var keys = await caches.keys();
        await Promise.all(keys.map(function (k) { return caches.delete(k); }));
      } catch (e) {}
      try {
        await self.registration.unregister();
      } catch (e) {}
    })()
  );
});
`);
});

app.get('/registerSW.js', (_req, res) => {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.send(`if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(function (regs) {
    regs.forEach(function (r) { r.unregister(); });
  });
}
`);
});

// ============================================================================
// VITE + PRODUCTION STATIC MOUNTING (INSTANT PORT 3000 BINDING)
// ============================================================================
async function startServer() {
  const PORT = Number(process.env.PORT) || 3000;
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    let viteMiddleware: any = null;
    const viteReady = (async () => {
      const { createServer: createViteServer } = await import('vite');
      const hmrEnabled = process.env.DISABLE_HMR !== 'true';
      const vite = await createViteServer({
        server: {
          middlewareMode: true,
          hmr: hmrEnabled,
          ws: { server: httpServer },
        },
        appType: 'spa',
      });
      viteMiddleware = vite.middlewares;
    })();

    app.use(async (req, res, next) => {
      if (!viteMiddleware) {
        await viteReady;
      }
      return viteMiddleware(req, res, next);
    });

    httpServer.listen(PORT, '0.0.0.0', () => {
      console.log(`NAIMCINE Media Engine running on http://0.0.0.0:${PORT}`);
    });
  } else {
    app.use(
      express.static(path.resolve(__dirname, 'dist'), {
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('.html') || filePath.endsWith('sw.js')) {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
          }
        },
      })
    );
    app.get('*', (req, res) => {
      if (req.path === '/tv' || req.path === '/tv/') {
        return sendSmartTvReceiverHtml(res);
      }
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });

    httpServer.listen(PORT, '0.0.0.0', () => {
      console.log(`NAIMCINE Media Engine running on http://0.0.0.0:${PORT}`);
    });
  }
}

startServer();

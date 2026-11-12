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
import puppeteer, { Browser, Page } from 'puppeteer';

// Prefer IPv4 to avoid transient container IPv6 socket resets with upstream CDNs
dns.setDefaultResultOrder('ipv4first');
// Allow upstream streaming CDNs with incomplete intermediate certificate chains
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

setTimeout(() => {
  getSharedBrowser().catch(() => {});
}, 1500);

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
    | 'youtube';
  resolvedStreamUrl?: string;
}

interface ExtractedStreamResult {
  success: boolean;
  mode: 'hls' | 'direct' | 'youtube';
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
  const isMp4Segment = /\.(m4s|mp4|cmfv|cmfa)(\?|$)/i.test(rawMediaUrl);
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
    const res = await fetch(embedUrl, {
      headers: {
        'User-Agent': CHROME_UA,
        Referer: 'https://embed69.org/',
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
}): Promise<TrackRecord[]> {
  try {
    const uniqueHints = Array.from(
      new Set(
        opts.titleHints
          .map((t) => String(t || '').replace(/\s*\([^)]*\)/g, '').trim())
          .filter((t) => t.length >= 2)
      )
    );
    if (uniqueHints.length === 0) return [];

    const expectedSegment = opts.mediaType === 'tv' ? '/serie/' : '/pelicula/';
    const cacheKey = `${opts.mediaType}|${normalizeTitleForMatch(uniqueHints[0])}`;
    let matchedShowUrl = seriesKaoSlugCache.get(cacheKey) || null;

    if (!seriesKaoSlugCache.has(cacheKey)) {
      const normTargets = uniqueHints
        .map((h) => normalizeTitleForMatch(h))
        .filter(Boolean);

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
            /<a[^>]+href="((?:https?:\/\/serieskao\.top)?\/(?:serie|pelicula)\/[^"]+)"[^>]*>[\s\S]*?<h2[^>]*>([^<]+)<\/h2>/gi;
          let bestUrl: string | null = null;
          let bestScore = 0;
          let cm: RegExpExecArray | null;

          while ((cm = cardRe.exec(sHtml)) !== null) {
            const href = String(cm[1] || '').trim();
            const cardTitle = String(cm[2] || '').trim();
            if (!href.includes(expectedSegment)) continue;

            const fullHref = href.startsWith('http')
              ? href.replace(/\/+$/, '')
              : `https://serieskao.top${href.replace(/\/+$/, '')}`;
            const normCard = normalizeTitleForMatch(cardTitle);
            if (!normCard) continue;

            let score = 0;
            for (const nt of normTargets) {
              if (normCard === nt) score = Math.max(score, 100);
              else if (normCard.startsWith(`${nt} `) || nt.startsWith(`${normCard} `)) {
                score = Math.max(score, 82);
              } else if (normCard.includes(nt) || nt.includes(normCard)) {
                score = Math.max(score, 65);
              }
            }

            if (score > bestScore) {
              bestScore = score;
              bestUrl = fullHref;
              if (score === 100) break;
            }
          }

          if (bestUrl && bestScore >= 65) {
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
    if (opts.tmdbId && hints.length < 2) {
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
          if (esName) hints.push(esName);
          if (origName) hints.push(origName);
        }
      } catch {
        // ignore
      }
    }

    const [directTracks, skTracks] = await Promise.all([
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
          }).catch(() => [] as TrackRecord[])
        : Promise.resolve([] as TrackRecord[]),
    ]);

    const seenLangs = new Set<string>();
    const merged: TrackRecord[] = [];
    for (const tr of [...directTracks, ...skTracks]) {
      const code = String(tr.lang || '').toUpperCase();
      if (code && !seenLangs.has(code)) {
        seenLangs.add(code);
        merged.push(tr);
      }
    }
    const orderMap: Record<string, number> = { ES: 1, LAT: 2, VOSE: 3 };
    return merged.sort((a, b) => (orderMap[a.lang] || 9) - (orderMap[b.lang] || 9));
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

async function extractMovidyPageTracks(movidyVerUrl: string): Promise<TrackRecord[]> {
  try {
    const cleanUrl = movidyVerUrl.trim();
    if (!cleanUrl.includes('movidy.pw/ver/')) return [];

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
      const fb = await curlGetText(cleanUrl, { 'User-Agent': CHROME_UA, Referer: 'https://movidy.pw/' }, 5).catch(() => ({ text: '' }));
      html = fb.text;
    }

    if (!html) return [];

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

async function findMovidyUrlByTitle(title: string): Promise<string | null> {
  try {
    const rawClean = String(title || '').trim();
    const clean = rawClean.replace(/\s*\([^)]*\)/g, '').trim();
    const parenPart = (rawClean.match(/\(([^)]+)\)/)?.[1] || '').trim();
    const queryTerm = clean || rawClean;
    if (!queryTerm || queryTerm.length < 2) return null;

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
    const normTarget = normalizeTitleForMatch(clean || rawClean);
    const normParenTarget = normalizeTitleForMatch(parenPart);

    let bestUrl: string | null = null;
    let bestScore = 0;
    let m: RegExpExecArray | null;

    while ((m = itemRe.exec(html)) !== null) {
      const rawHref = String(m[1] || '').trim();
      const rawSpanTitle = String(m[2] || '').trim();
      if (!rawHref || !rawSpanTitle) continue;

      const fullUrl = rawHref.startsWith('http') ? rawHref : `https://movidy.pw${rawHref}`;
      const fullNorm = normalizeTitleForMatch(rawSpanTitle);
      const outsideNorm = normalizeTitleForMatch(rawSpanTitle.replace(/\s*\([^)]*\)/g, ''));
      const insideNorm = normalizeTitleForMatch(rawSpanTitle.match(/\(([^)]+)\)/)?.[1] || '');

      let score = 0;
      if (
        fullNorm === normTarget ||
        (outsideNorm && outsideNorm === normTarget) ||
        (insideNorm && insideNorm === normTarget) ||
        (normParenTarget &&
          (outsideNorm === normParenTarget || insideNorm === normParenTarget))
      ) {
        score = 100;
      } else if (
        (outsideNorm && outsideNorm.startsWith(`${normTarget} `)) ||
        (insideNorm && insideNorm.startsWith(`${normTarget} `))
      ) {
        score = 80;
      } else if (
        fullNorm.split(' ').includes(normTarget) ||
        fullNorm.includes(normTarget) ||
        (outsideNorm && normTarget.includes(outsideNorm))
      ) {
        score = 55;
      }

      if (score > bestScore) {
        bestScore = score;
        bestUrl = fullUrl;
        if (score === 100) break;
      }
    }
    return bestUrl;
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
}): Promise<('ES' | 'LAT' | 'VOSE' | 'EN')[]> {
  const cleanId = String(opts.tmdbId || '').replace(/\D/g, '');
  const season = opts.mediaType === 'tv' ? opts.season || 1 : 0;
  const episode = opts.mediaType === 'tv' ? opts.episode || 1 : 0;
  const cacheKey = `${opts.mediaType}|${cleanId}|${season}|${episode}`;

  const cached = availableLangsCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < 15 * 60 * 1000) {
    return cached.langs;
  }

  const hints = Array.from(
    new Set((opts.titleHints || []).map((t) => String(t || '').trim()).filter(Boolean))
  );

  const movidyPromise = (async (): Promise<TrackRecord[]> => {
    if (opts.mediaType !== 'movie') return [];
    let mvUrl =
      opts.movidyUrl && opts.movidyUrl.includes('movidy.pw/ver/') ? opts.movidyUrl : '';
    if (!mvUrl) {
      for (const h of hints.slice(0, 2)) {
        const found = await findMovidyUrlByTitle(h);
        if (found) {
          mvUrl = found;
          break;
        }
      }
    }
    if (!mvUrl) return [];
    return extractMovidyPageTracks(mvUrl);
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
  // Auto-heal rotated mirror hostnames (e.g. doc.tilinhd.lol -> dog.tilinhd.lol)
  return rawUrl.replace(/\/\/doc\.tilinhd\.lol\b/gi, '//dog.tilinhd.lol');
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
): Promise<{ streamUrl: string; referer: string; isDirectMp4: boolean } | null> {
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

    // 1. Playstream / TilinHD / Footunder `window._econfig` pure crypto decode!
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

        // dog.tilinhd.lol intercepts /playstream.php?stream_tv= only in a client ServiceWorker (404 on HTTP),
        // whereas pig.footunder.online proxies the same CDN upstream natively on the server.
        if (!origin.includes('pig.footunder.online') && rawCandidate.startsWith('http')) {
          candidateTargets.push({
            url: `https://pig.footunder.online/playstream.php?stream_tv=${Buffer.from(rawCandidate).toString('base64')}`,
            ref: 'https://pig.footunder.online/playstream.php',
          });
        }

        for (const cand of candidateTargets) {
          const checkM3u = await fetchSportsHtmlHop(cand.url, cand.ref);
          if (checkM3u.includes('#EXTM3U')) {
            return {
              streamUrl: cand.url,
              referer: cand.ref,
              isDirectMp4: false,
            };
          }
        }
      }
      return null;
    }

    // 2. Direct `.m3u8` in Clappr / JWPlayer / HLS.js config
    const directM3u8Match = html.match(
      /(?:source|file|src|streamUrl)\s*:\s*['"](https?:\/\/[^'"]+\.m3u8[^'"]*)['"]/i
    );
    if (directM3u8Match && directM3u8Match[1] && !isBlockedAdUrl(directM3u8Match[1])) {
      return {
        streamUrl: directM3u8Match[1],
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

// Direct Ready-to-Install Signed Android APK Download
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
    mode: 'idle' | 'hls' | 'direct' | 'youtube' | 'cloud';
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
    const validModes = new Set(['idle', 'hls', 'direct', 'youtube', 'cloud']);
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
    if (reqUrl.includes('.m3u8') || reqUrl.includes('stream_tv=') || /\.mp4(\?|$)/i.test(reqUrl)) {
      const ref = req.headers()['referer'] || session.url;
      const proxied = /\.mp4(\?|$)/i.test(reqUrl)
        ? buildTsProxyUrl(reqUrl, ref)
        : buildHlsProxyUrl(reqUrl, ref);
      session.detectedStreamUrl = proxied;
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

function remuxDvbTsToAac(segmentUrl: string, referer: string): Promise<Buffer> {
  const now = Date.now();
  const cached = dvbAacSegmentCache.get(segmentUrl);
  if (cached && now - cached.ts < 30_000) {
    return cached.promise;
  }

  for (const [k, v] of dvbAacSegmentCache.entries()) {
    if (now - v.ts > 35_000 || dvbAacSegmentCache.size > 28) {
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
        signal: AbortSignal.timeout(5500),
      });
      if (resp.ok) {
        rawBuf = Buffer.from(await resp.arrayBuffer());
      }
    } catch {
      // fallback to curl
    }

    if (!rawBuf || rawBuf.length === 0) {
      rawBuf = await curlGetBuffer(segmentUrl, segHeaders, 8);
    }
    if (!rawBuf || rawBuf.length === 0) {
      throw new Error('Empty DVB TS segment');
    }

    return await new Promise<Buffer>((resolve) => {
      const ff = spawn('ffmpeg', [
        '-hide_banner',
        '-loglevel',
        'error',
        '-probesize',
        '500000',
        '-analyzeduration',
        '500000',
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
        '-c:v',
        'copy',
        '-c:a',
        'aac',
        '-ac',
        '2',
        '-ar',
        '48000',
        '-b:a',
        '128k',
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
      }, 6500);

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
    });
  })();

  jobPromise.catch(() => {
    dvbAacSegmentCache.delete(segmentUrl);
  });

  dvbAacSegmentCache.set(segmentUrl, { promise: jobPromise, ts: now });
  return jobPromise;
}

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

    // Warm-prefetch the latest 2 live DVB-T2 segments into AAC cache so hls.js starts in <0.5s
    if (forceAac && discoveredTsUrls.length > 0) {
      const latestTwo = discoveredTsUrls.slice(-2);
      for (const segUrl of latestTwo) {
        remuxDvbTsToAac(segUrl, effectiveReferer).catch(() => {});
      }
    }

    const finalManifest = rewritten.join('\n');
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

  const isUrlMp4 = /\.(m4s|mp4|cmfv|cmfa)(\?|$)/i.test(targetUrl);

  if (forceAac && !isUrlMp4) {
    try {
      const remuxedBuf = await remuxDvbTsToAac(targetUrl, referer);
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

async function fetchTmdbMovieCatalog(opts: {
  lang: 'es-ES' | 'en-US';
  category: string;
  page: number;
  query: string;
}) {
  const { lang, category, page, query } = opts;
  const cacheKey = `${lang}|${category}|${page}|${query}`;
  const cached = movieCatalogCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < 5 * 60 * 1000) {
    return cached;
  }

  let endpoint = '';
  if (query) {
    endpoint = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&language=${lang}&query=${encodeURIComponent(query)}&page=${page}&include_adult=false`;
  } else if (category === 'popular') {
    endpoint = `https://api.themoviedb.org/3/movie/popular?api_key=${TMDB_API_KEY}&language=${lang}&page=${page}`;
  } else if (category === 'top_rated') {
    endpoint = `https://api.themoviedb.org/3/movie/top_rated?api_key=${TMDB_API_KEY}&language=${lang}&page=${page}`;
  } else if (category === 'now_playing') {
    endpoint = `https://api.themoviedb.org/3/movie/now_playing?api_key=${TMDB_API_KEY}&language=${lang}&page=${page}`;
  } else if (MOVIE_GENRE_MAP[category]) {
    endpoint = `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_API_KEY}&language=${lang}&sort_by=popularity.desc&vote_count.gte=25&with_genres=${MOVIE_GENRE_MAP[category]}&page=${page}&include_adult=false`;
  } else {
    endpoint = `https://api.themoviedb.org/3/trending/movie/week?api_key=${TMDB_API_KEY}&language=${lang}&page=${page}`;
  }

  const res = await fetch(endpoint, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) {
    return { movies: [], hasMore: false, ts: Date.now() };
  }
  const json: any = await res.json();
  const results: any[] = Array.isArray(json?.results) ? json.results : [];
  const totalPages = Number(json?.total_pages || 1);

  const isEn = lang === 'en-US';
  const todayIso = new Date().toISOString().slice(0, 10);
  const movies = results
    .filter((m) => {
      if (!m || !m.id || (!m.poster_path && !m.backdrop_path)) return false;
      // Exclude unreleased movies or low-vote titles so listed movies have real streams
      if (!query) {
        if (Number(m.vote_count || 0) < 45 || Number(m.vote_average || 0) <= 0) {
          return false;
        }
        if (m.release_date && String(m.release_date) > todayIso) {
          return false;
        }
      }
      return true;
    })
    .map((m) => ({
      id: `${isEn ? 'bingetrix' : 'es'}-movie-${m.id}`,
      tmdbId: m.id,
      mediaType: 'movie',
      title: m.title || m.original_title || 'Película',
      originalTitle: m.original_title || m.title || '',
      year: m.release_date ? String(m.release_date).split('-')[0] : 'HD',
      rating: m.vote_average ? Number(m.vote_average).toFixed(1) : '',
      overview:
        m.overview ||
        (isEn
          ? 'Available in 1080p Original English ad-free HLS streaming via Bingetrix.'
          : 'Disponible en reproducción directa HLS sin anuncios (Castellano, Latino e Inglés 1080p).'),
      poster: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : '',
      backdrop: m.backdrop_path ? `https://image.tmdb.org/t/p/w1280${m.backdrop_path}` : '',
      bingetrixUrl: `https://bingetrix.sc/watch/${m.id}`,
      languages: isEn ? ['English 1080p', 'ES / LAT'] : ['Castellano', 'Latino', 'EN'],
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
    const query = String(req.query.query || '').trim();
    const category = String(req.query.category || 'trending').toLowerCase();
    const page = Math.max(1, Math.min(100, parseInt(String(req.query.page || '1'), 10) || 1));

    const mergedCacheKey = `merged-es-v3|${category}|${page}|${query}`;
    const cachedMerged = movieCatalogCache.get(mergedCacheKey);
    if (cachedMerged && Date.now() - cachedMerged.ts < 5 * 60 * 1000) {
      return res.json({
        success: true,
        movies: cachedMerged.movies,
        hasMore: cachedMerged.hasMore,
        page,
      });
    }

    const [movidyData, tmdbData] = await Promise.all([
      scrapeMovidyCatalog({ category, page, query }),
      fetchTmdbMovieCatalog({ lang: 'es-ES', category, page, query }),
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
    const category = String(req.query.category || 'trending').toLowerCase();
    const page = Math.max(1, Math.min(100, parseInt(String(req.query.page || '1'), 10) || 1));

    const data = await fetchTmdbMovieCatalog({
      lang: 'en-US',
      category,
      page,
      query,
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
    const query = String(req.query.query || '').trim();
    const category = String(req.query.category || 'trending').toLowerCase();
    const langParam = String(req.query.lang || 'es').toLowerCase() === 'en' ? 'en-US' : 'es-ES';
    const isSpanishCatalog = langParam === 'es-ES';
    const page = Math.max(1, Math.min(100, parseInt(String(req.query.page || '1'), 10) || 1));

    const cacheKey = `v3|${langParam}|${category}|${page}|${query}`;
    const cached = seriesCatalogCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < 5 * 60 * 1000) {
      return res.json({ success: true, series: cached.series, hasMore: cached.hasMore, page });
    }

    let endpoint = '';
    if (query) {
      endpoint = `https://api.themoviedb.org/3/search/tv?api_key=${TMDB_API_KEY}&language=${langParam}&query=${encodeURIComponent(query)}&page=${page}&include_adult=false`;
    } else if (category === 'popular') {
      endpoint = `https://api.themoviedb.org/3/tv/popular?api_key=${TMDB_API_KEY}&language=${langParam}&page=${page}`;
    } else if (category === 'top_rated') {
      endpoint = `https://api.themoviedb.org/3/tv/top_rated?api_key=${TMDB_API_KEY}&language=${langParam}&page=${page}`;
    } else if (SERIES_GENRE_MAP[category]) {
      endpoint = `https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_API_KEY}&language=${langParam}&sort_by=popularity.desc&without_genres=10767,10763&with_genres=${SERIES_GENRE_MAP[category]}&page=${page}`;
    } else {
      endpoint = `https://api.themoviedb.org/3/trending/tv/week?api_key=${TMDB_API_KEY}&language=${langParam}&page=${page}`;
    }

    const [movidySeriesData, tRes] = await Promise.all([
      isSpanishCatalog
        ? scrapeMovidySeriesCatalog({ category, page, query })
        : Promise.resolve({ series: [], hasMore: false }),
      fetch(endpoint, { signal: AbortSignal.timeout(5000) }),
    ]);

    let tmdbSeries: any[] = [];
    let totalPages = 1;

    if (tRes.ok) {
      const json: any = await tRes.json();
      const results: any[] = Array.isArray(json?.results) ? json.results : [];
      totalPages = Number(json?.total_pages || 1);

      tmdbSeries = results
        .filter((s) => {
          if (!s || !s.id || (!s.poster_path && !s.backdrop_path)) return false;
          // Filter out un-dubbed US late-night talk/news shows when browsing Spanish series
          if (isSpanishCatalog && !query && Array.isArray(s.genre_ids)) {
            if (s.genre_ids.includes(10767) || s.genre_ids.includes(10763)) {
              return false;
            }
          }
          return true;
        })
        .map((s) => ({
          id: `tv-${langParam}-${s.id}`,
          tmdbId: s.id,
          mediaType: 'tv',
          title: s.name || s.original_name || 'Serie',
          originalTitle: s.original_name || s.name || '',
          year: s.first_air_date ? String(s.first_air_date).split('-')[0] : 'TV',
          rating: s.vote_average ? Number(s.vote_average).toFixed(1) : '',
          overview:
            s.overview ||
            (isSpanishCatalog
              ? 'Serie disponible en Castellano, Español Latino y VOSE en HD.'
              : 'Full TV series available in 1080p HD.'),
          poster: s.poster_path ? `https://image.tmdb.org/t/p/w500${s.poster_path}` : '',
          backdrop: s.backdrop_path ? `https://image.tmdb.org/t/p/w1280${s.backdrop_path}` : '',
          languages: isSpanishCatalog
            ? ['Español', 'VOSE']
            : ['English 1080p', 'Español'],
        }));
    }

    const seenTmdbIds = new Set<number>();
    const combinedSeries: any[] = [];

    for (const ms of movidySeriesData.series) {
      if (ms?.tmdbId && !seenTmdbIds.has(ms.tmdbId)) {
        seenTmdbIds.add(ms.tmdbId);
        combinedSeries.push(ms);
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

app.get('/api/catalog/tv/:tmdbId', async (req, res) => {
  try {
    const cleanId = String(req.params.tmdbId || '').replace(/\D/g, '');
    if (!cleanId) return res.status(400).json({ success: false });

    const seasonNum = Math.max(1, parseInt(String(req.query.season || '1'), 10) || 1);
    const langParam = String(req.query.lang || 'es').toLowerCase() === 'en' ? 'en-US' : 'es-ES';

    const [showRes, seasonRes] = await Promise.all([
      fetch(
        `https://api.themoviedb.org/3/tv/${cleanId}?api_key=${TMDB_API_KEY}&language=${langParam}`,
        { signal: AbortSignal.timeout(4500) }
      ),
      fetch(
        `https://api.themoviedb.org/3/tv/${cleanId}/season/${seasonNum}?api_key=${TMDB_API_KEY}&language=${langParam}`,
        { signal: AbortSignal.timeout(4500) }
      ),
    ]);

    if (!showRes.ok) return res.status(404).json({ success: false });
    const showJson: any = await showRes.json();
    const seasonJson: any = seasonRes.ok ? await seasonRes.json() : { episodes: [] };

    const seasons = (Array.isArray(showJson?.seasons) ? showJson.seasons : [])
      .filter((s: any) => s && s.season_number >= 1 && s.episode_count > 0)
      .map((s: any) => ({
        seasonNumber: s.season_number,
        name: s.name || `Temporada ${s.season_number}`,
        episodeCount: s.episode_count,
        poster: s.poster_path ? `https://image.tmdb.org/t/p/w342${s.poster_path}` : '',
      }));

    const episodes = (Array.isArray(seasonJson?.episodes) ? seasonJson.episodes : []).map(
      (ep: any) => ({
        id: `ep-${cleanId}-${seasonNum}-${ep.episode_number}`,
        episodeNumber: ep.episode_number,
        seasonNumber: seasonNum,
        title: ep.name || `Episodio ${ep.episode_number}`,
        overview: ep.overview || '',
        still: ep.still_path ? `https://image.tmdb.org/t/p/w500${ep.still_path}` : '',
        runtime: ep.runtime || undefined,
        airDate: ep.air_date || undefined,
        rating: ep.vote_average ? Number(ep.vote_average).toFixed(1) : undefined,
      })
    );

    const showTitle = showJson.name || showJson.original_name || 'Serie';
    const origTitle = showJson.original_name || showJson.name || '';
    const firstEpNumber = episodes[0]?.episodeNumber || 1;
    const availableLanguages = await probeAvailableLanguages({
      tmdbId: cleanId,
      mediaType: 'tv',
      season: seasonNum,
      episode: firstEpNumber,
      titleHints: [showTitle, origTitle],
    });

    res.json({
      success: true,
      details: {
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
        seasons:
          seasons.length > 0
            ? seasons
            : [{ seasonNumber: 1, name: 'Temporada 1', episodeCount: episodes.length }],
        activeSeason: seasonNum,
        episodes,
        availableLanguages,
      },
    });
  } catch (err) {
    console.error('TV details error:', err);
    res.status(500).json({ success: false });
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
          sourceUrl: 'https://pig.footunder.online/stream/84',
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
          label: 'DAZN 1 España',
          lang: 'ES',
          quality: '1080p',
          sourceUrl: 'https://pig.footunder.online/stream/445',
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
          id: 'ch-f1-1',
          label: 'DAZN F1 HD',
          lang: 'ES',
          quality: '1080p',
          sourceUrl: 'https://pig.footunder.online/stream/537',
          resolverType: 'sports_channel',
        },
        {
          id: 'ch-f1-2',
          label: 'DAZN 1 Motor',
          lang: 'ES',
          quality: '1080p',
          sourceUrl: 'https://pig.footunder.online/stream/445',
          resolverType: 'sports_channel',
        },
        {
          id: 'ch-f1-3',
          label: 'DAZN 2 España',
          lang: 'ES',
          quality: '1080p',
          sourceUrl: 'https://pig.footunder.online/stream/446',
          resolverType: 'sports_channel',
        },
        {
          id: 'ch-f1-4',
          label: 'Eurosport 2 Motor',
          lang: 'ES',
          quality: '1080p',
          sourceUrl: 'https://pig.footunder.online/stream/232',
          resolverType: 'sports_channel',
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
          id: 'ch-ucl-1',
          label: 'M+ Liga de Campeones',
          lang: 'ES',
          quality: '1080p',
          sourceUrl: 'https://pig.footunder.online/stream/435',
          resolverType: 'sports_channel',
        },
        {
          id: 'ch-ucl-2',
          label: 'DAZN 3 España',
          lang: 'ES',
          quality: '1080p',
          sourceUrl: 'https://pig.footunder.online/stream/447',
          resolverType: 'sports_channel',
        },
        {
          id: 'ch-ucl-3',
          label: 'DAZN 4 España',
          lang: 'ES',
          quality: '1080p',
          sourceUrl: 'https://pig.footunder.online/stream/448',
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
          id: 'ch-nba-1',
          label: 'M+ Deportes HD',
          lang: 'ES',
          quality: '1080p',
          sourceUrl: 'https://pig.footunder.online/stream/438',
          resolverType: 'sports_channel',
        },
        {
          id: 'ch-nba-2',
          label: 'M+ Deportes 2',
          lang: 'ES',
          quality: '1080p',
          sourceUrl: 'https://pig.footunder.online/stream/527',
          resolverType: 'sports_channel',
        },
        {
          id: 'ch-nba-3',
          label: 'M+ Golf HD',
          lang: 'ES',
          quality: '1080p',
          sourceUrl: 'https://pig.footunder.online/stream/528',
          resolverType: 'sports_channel',
        },
        {
          id: 'ch-nba-4',
          label: 'Eurosport 1 HD',
          lang: 'ES',
          quality: '1080p',
          sourceUrl: 'https://pig.footunder.online/stream/231',
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

  const scrapedEvents = Array.from(liveGrouped.values()).slice(0, 28);
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
    description: 'Telediario, cine, entretenimiento y grandes eventos en directo',
    channels: [
      {
        id: 'la1-rtve',
        label: 'Señal Oficial RTVE HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://rtvelivestream.rtve.es/rtvesec/la1/la1_main_dvr.m3u8',
        resolverType: 'tdt_hls',
      },
      {
        id: 'la1-dvb',
        label: 'Señal Antena TDT HD',
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
        label: 'Señal Oficial RTVE HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://rtvelivestream.rtve.es/rtvesec/la2/la2_main_dvr.m3u8',
        resolverType: 'tdt_hls',
      },
      {
        id: 'la2-dvb',
        label: 'Señal Antena TDT HD',
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
        label: 'Antena TDT 1080p',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'http://90.163.85.113:8093/stream/20/index.m3u8',
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
        label: 'Antena TDT 1080p',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'http://90.163.85.113:8093/stream/42/index.m3u8',
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
        label: 'Antena TDT 1080p',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'http://90.163.85.113:8093/stream/41/index.m3u8',
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
        label: 'Antena TDT 1080p',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'http://90.163.85.113:8093/stream/21/index.m3u8',
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
        label: 'Señal 24/7 M+ HD',
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
        label: 'Señal 24/7 Vamos HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://pig.footunder.online/stream/526',
        resolverType: 'sports_channel',
      },
      {
        id: 'mvamos-2',
        label: 'Señal M+ Deportes',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://pig.footunder.online/stream/438',
        resolverType: 'sports_channel',
      },
      {
        id: 'mvamos-ev',
        label: 'Señal Evento',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://footunder.online/tvtodo/m-vamos.php',
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
        id: 'mlaliga-1',
        label: 'Señal 24/7 M+ LaLiga HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://pig.footunder.online/stream/84',
        resolverType: 'sports_channel',
      },
      {
        id: 'mlaliga-ev',
        label: 'Señal Evento 2',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://footunder.online/tvtodo/laliga.php',
        resolverType: 'sports_channel',
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
        label: 'Señal Evento 2',
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
        id: 'mucl-1',
        label: 'Señal 24/7 Champions HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://pig.footunder.online/stream/435',
        resolverType: 'sports_channel',
      },
      {
        id: 'mucl-ev1',
        label: 'Señal Evento 2',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://footunder.online/tvtodo/mligacampeones.php',
        resolverType: 'sports_channel',
      },
      {
        id: 'mucl-ev2',
        label: 'Señal Evento 3',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://footunder.online/tvtodo/mligacampeones2.php',
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
        id: 'mdep1-1',
        label: 'Señal 24/7 M+ Deportes HD',
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
        label: 'Señal 24/7 M+ Deportes 2 HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://pig.footunder.online/stream/527',
        resolverType: 'sports_channel',
      },
      {
        id: 'mdep2-2',
        label: 'Señal M+ Deportes 1',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://pig.footunder.online/stream/438',
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
        id: 'mgolf-1',
        label: 'Señal 24/7 M+ Golf HD',
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
        id: 'euro1-1',
        label: 'Señal 24/7 Eurosport 1 HD',
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
        label: 'Señal Evento 2',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://footunder.online/tvtodo/dazn-laliga.php',
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
    description: 'Mundial de Fórmula 1 24/7 en castellano: libres, clasificación, sprint, carreras y Box, Box',
    channels: [
      {
        id: 'daznf1-1',
        label: 'Señal 24/7 DAZN F1 HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://pig.footunder.online/stream/537',
        resolverType: 'sports_channel',
      },
      {
        id: 'daznf1-ev',
        label: 'Señal Alternativa F1',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://footunder.online/tvtodo/daznf1.php',
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
        id: 'dazn1-1',
        label: 'Señal 24/7 DAZN 1 HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://pig.footunder.online/stream/445',
        resolverType: 'sports_channel',
      },
      {
        id: 'dazn1-ev',
        label: 'Señal Evento 2',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://footunder.online/tvtodo/dazn1.php',
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
        label: 'Señal 24/7 DAZN 2 HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://pig.footunder.online/stream/446',
        resolverType: 'sports_channel',
      },
      {
        id: 'dazn2-ev',
        label: 'Señal Evento 2',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://footunder.online/tvtodo/dazn2.php',
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
        id: 'dazn3-1',
        label: 'Señal 24/7 DAZN 3 HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://pig.footunder.online/stream/447',
        resolverType: 'sports_channel',
      },
      {
        id: 'dazn3-ev',
        label: 'Señal Evento 2',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://footunder.online/tvtodo/dazn3.php',
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
        label: 'Señal 24/7 DAZN 4 HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://pig.footunder.online/stream/448',
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
    network: 'Paramount',
    category: 'cine_series',
    quality: '1080p HD',
    description: 'Cine de estudio, thriller, acción y series clásicas de misterio',
    channels: [
      {
        id: 'paramount-hls',
        label: 'Señal Directa HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://jmp2.uk/plu-68d566603d3a9580eb461251.m3u8',
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
        sourceUrl: 'https://rtvelivestream.rtve.es/rtvesec/24h/24h_main_dvr.m3u8',
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
        id: 'tdp-rtve',
        label: 'Señal Oficial RTVE HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://rtvelivestream.rtve.es/rtvesec/tdp/tdp_main.m3u8',
        resolverType: 'tdt_hls',
      },
      {
        id: 'tdp-dvb',
        label: 'Señal Antena TDT HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'http://90.163.85.113:8093/stream/43/index.m3u8',
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
        id: 'clan-rtve',
        label: 'Señal Oficial RTVE HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://rtvelivestream.rtve.es/rtvesec/clan/clan_main_dvr.m3u8',
        resolverType: 'tdt_hls',
      },
      {
        id: 'clan-dvb',
        label: 'Señal Antena TDT HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'http://90.163.85.113:8093/stream/59/index.m3u8',
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
// REST API: UNIVERSAL STREAM DECOMPILER (/api/extract/stream)
// ============================================================================
function parseYouTubeVideoId(url: string): string | null {
  const m = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|live\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/i
  );
  return m ? m[1] : null;
}

async function resolveTmdbIdByTitle(title: string, mediaType: 'movie' | 'tv'): Promise<number | null> {
  try {
    const clean = title.replace(/\s*\([^)]*\)/g, '').trim();
    if (!clean) return null;
    const res = await fetch(
      `https://api.themoviedb.org/3/search/${mediaType}?api_key=${TMDB_API_KEY}&language=es-ES&query=${encodeURIComponent(clean)}&page=1`,
      { signal: AbortSignal.timeout(3500) }
    );
    if (!res.ok) return null;
    const json: any = await res.json();
    return json?.results?.[0]?.id || null;
  } catch {
    return null;
  }
}

app.get('/api/extract/stream', async (req, res) => {
  const rawInput = String(req.query.url || '').trim();
  const movidyUrlParam = String(req.query.movidyUrl || '').trim();
  const resolverType = String(req.query.resolverType || '').trim();
  const preferLang = String(req.query.preferLang || 'ES').toUpperCase();
  const titleHint = String(req.query.title || '').trim();
  const mediaTypeParam = String(req.query.mediaType || '').toLowerCase();
  const tmdbIdParam = String(req.query.tmdbId || '').replace(/\D/g, '');
  const seasonParam = parseInt(String(req.query.season || '0'), 10) || undefined;
  const episodeParam = parseInt(String(req.query.episode || '0'), 10) || undefined;

  if (!rawInput && !movidyUrlParam && !titleHint && !tmdbIdParam) {
    return res.status(400).json({ success: false, error: 'Falta el enlace o título del contenido.' });
  }

  const cacheKey = `${mediaTypeParam}|${tmdbIdParam}|${seasonParam || ''}|${episodeParam || ''}|${resolverType}|${preferLang}|${rawInput}|${movidyUrlParam}|${titleHint}`;
  const cached = extractionCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return res.json(cached);
  }

  try {
    // CASE 0: Live Spanish TDT Channel (`tdt_hls`) -> Verify live #EXTM3U + Audio AAC Remux when DVB-T2
    if (resolverType === 'tdt_hls' && rawInput) {
      const checkHeaders: Record<string, string> = {
        'User-Agent': isDvbHeadendStream(rawInput) ? TDT_DVB_UA : CHROME_UA,
        Accept: '*/*',
      };
      let isAlive = false;
      try {
        const chk = await fetch(rawInput, {
          headers: checkHeaders,
          signal: AbortSignal.timeout(4000),
        });
        if (chk.ok) {
          const txt = await chk.text();
          isAlive = txt.includes('#EXTM3U');
        }
      } catch {
        const fb = await curlGetText(rawInput, checkHeaders, 5);
        isAlive = Boolean(fb.text && fb.text.includes('#EXTM3U'));
      }

      if (!isAlive) {
        return res.status(404).json({
          success: false,
          error: 'Esta señal TDT está temporalmente sin emisión. Prueba la señal alternativa.',
        });
      }

      const originRef = new URL(rawInput).origin + '/';
      const proxiedUrl = buildHlsProxyUrl(rawInput, originRef, isDvbHeadendStream(rawInput));
      const result: ExtractedStreamResult = {
        success: true,
        mode: 'hls',
        streamUrl: proxiedUrl,
        rawStreamUrl: rawInput,
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

    if (/\.(mp4|webm)(\?|$)/i.test(rawInput)) {
      const originRef = new URL(rawInput).origin + '/';
      const result: ExtractedStreamResult = {
        success: true,
        mode: 'direct',
        streamUrl: buildTsProxyUrl(rawInput, originRef),
        rawStreamUrl: rawInput,
        expiresAt: Date.now() + 15 * 60 * 1000,
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

      let effectiveMovidyUrl = movidyUrlParam.includes('movidy.pw/ver/')
        ? movidyUrlParam
        : rawInput.includes('movidy.pw/ver/')
        ? rawInput
        : '';

      let extractedMovidyCleanTitle = '';

      // Inspect direct Movidy `/ver/...` link to detect TV Series (`id="eps"`) & extract exact clean title (e.g. `nocturno-2` -> `Nocturno`)
      if (effectiveMovidyUrl && (!mediaTypeParam || !resolvedTmdbId)) {
        try {
          const mvRes = await fetch(effectiveMovidyUrl, {
            headers: { 'User-Agent': CHROME_UA, Referer: 'https://movidy.pw/' },
            signal: AbortSignal.timeout(4000),
          });
          if (mvRes.ok) {
            const mvHtml = await mvRes.text();
            if (!mediaTypeParam && mvHtml.includes('id="eps"')) {
              effectiveMediaType = 'tv';
            }
            const h2Match = mvHtml.match(/<h2>\s*Ver\s+([\s\S]*?)\s+Movidy\s*<\/h2>/i);
            if (h2Match?.[1]) {
              extractedMovidyCleanTitle = h2Match[1].replace(/<[^>]+>/g, '').trim();
            }
          }
        } catch {
          // ignore
        }
      }

      if (!resolvedTmdbId && titleHint) {
        resolvedTmdbId = await resolveTmdbIdByTitle(titleHint, effectiveMediaType);
      }

      if (!resolvedTmdbId && extractedMovidyCleanTitle) {
        resolvedTmdbId = await resolveTmdbIdByTitle(
          extractedMovidyCleanTitle,
          effectiveMediaType
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
          resolvedTmdbId = await resolveTmdbIdByTitle(slug, effectiveMediaType);
        }
      }

      if (effectiveMediaType === 'movie' && !effectiveMovidyUrl) {
        if (titleHint) {
          effectiveMovidyUrl = (await findMovidyUrlByTitle(titleHint)) || '';
        }
        if (!effectiveMovidyUrl && resolvedTmdbId) {
          try {
            const tmRes = await fetch(
              `https://api.themoviedb.org/3/movie/${resolvedTmdbId}?api_key=${TMDB_API_KEY}&language=es-ES`,
              { signal: AbortSignal.timeout(3000) }
            );
            if (tmRes.ok) {
              const tmJson: any = await tmRes.json();
              const esTitle = String(tmJson?.title || '').trim();
              const origTitle = String(tmJson?.original_title || '').trim();
              if (esTitle && esTitle.toLowerCase() !== titleHint.toLowerCase()) {
                effectiveMovidyUrl = (await findMovidyUrlByTitle(esTitle)) || '';
              }
              if (!effectiveMovidyUrl && origTitle && origTitle.toLowerCase() !== esTitle.toLowerCase()) {
                effectiveMovidyUrl = (await findMovidyUrlByTitle(origTitle)) || '';
              }
            }
          } catch {
            // ignore
          }
        }
      }

      const combinedTitleHints = [titleHint, extractedMovidyCleanTitle].filter(Boolean);

      const [movidyTracks, esTracks, enTracks] = await Promise.all([
        effectiveMediaType === 'movie' && effectiveMovidyUrl
          ? extractMovidyPageTracks(effectiveMovidyUrl)
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
      const allDiscovered: TrackRecord[] = [...movidyTracks, ...esTracks, ...enTracks];

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

      const orderedTracks: TrackRecord[] = [...allDiscovered].sort(
        (a, b) => getLangScore(a.lang) - getLangScore(b.lang)
      );

      // Resolve the first available track that produces a valid proxied HLS stream,
      // and immediately prune any candidate that fails unpacking so dead tracks never reach the UI
      let primaryStreamUrl = '';
      let primaryMode: 'hls' | 'direct' = 'hls';
      let resolvedTrack: TrackRecord | null = null;
      const deadTrackIndices = new Set<number>();

      for (let i = 0; i < orderedTracks.length; i++) {
        const candidate = orderedTracks[i];
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
    }

    // CASE 5: Live Sports Channel (`footunder.online`, `tilinhd`, etc.) -> Pure Crypto Direct (<350ms) + Safe Headless Fallback
    if (rawInput) {
      const fullTargetUrl = /^https?:\/\//i.test(rawInput) ? rawInput : `https://${rawInput}`;
      const directSports = await extractLiveSportsHlsDirect(fullTargetUrl);
      const sniffed = directSports || (await sniffStreamWithHeadless(fullTargetUrl));

      if (sniffed) {
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
    }

    return res.status(404).json({
      success: false,
      canUseCloudBrowser: true,
      error:
        'Esta fuente externa aún no tiene flujo HLS activo. Prueba otra pista o ábrela en el Cloud Browser sin anuncios.',
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
    if ((!cleanId || cleanId === '0') && titleHint) {
      const resolved = await resolveTmdbIdByTitle(titleHint, mediaType);
      if (resolved) cleanId = String(resolved);
    }
    if (!cleanId || cleanId === '0') return res.status(400).json({ success: false });

    const langParam = String(req.query.lang || 'es').toLowerCase() === 'en' ? 'en-US' : 'es-ES';
    const movidyUrlHint = String(req.query.movidyUrl || '').trim();
    const cacheKey = `v2|${mediaType}|${cleanId}|${langParam}`;
    const cached = richDetailsCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < 10 * 60 * 1000) {
      return res.json({ success: true, details: cached.details });
    }

    const url = `https://api.themoviedb.org/3/${mediaType}/${cleanId}?api_key=${TMDB_API_KEY}&language=${langParam}&append_to_response=videos,credits,recommendations`;
    const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return res.status(404).json({ success: false });
    const data: any = await r.json();

    const primaryTitle =
      data.title || data.name || data.original_title || data.original_name || 'Título';
    const originalTitle = data.original_title || data.original_name || '';

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
      try {
        var clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        for (var i = 0; i < clientList.length; i++) {
          if ('navigate' in clientList[i]) {
            await clientList[i].navigate(clientList[i].url);
          }
        }
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
// VITE + PRODUCTION STATIC MOUNTING
// ============================================================================
async function startServer() {
  const PORT = Number(process.env.PORT) || 3000;
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
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
    app.use(vite.middlewares);
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
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`NAIMCINE Media Engine running on http://0.0.0.0:${PORT}`);
  });
}

startServer();

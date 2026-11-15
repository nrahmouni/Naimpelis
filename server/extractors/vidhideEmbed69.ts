import crypto from 'crypto';
import { ENV } from '../config/env.ts';
import { LruTtlCache } from '../utils/lruCache.ts';
import { streamingFetch } from '../utils/tlsFetch.ts';
import {
  CHROME_UA,
  TrackRecord,
  buildHlsProxyUrl,
  curlGetText,
  curlPostJsonText,
  fetchTextWithCurlFallback,
  normalizeTitleForMatch,
  probeHlsSegmentHealth,
  unpackDeanEdwards,
} from './httpHelpers.ts';

const TMDB_API_KEY = ENV.tmdbApiKey;
const GNULA_ORIGIN = 'https://ww3.gnulahd.nu';

const seriesKaoSlugCache = new LruTtlCache<string, string | null>(400, 30 * 60 * 1000);
const animeAv1SlugCache = new LruTtlCache<string, string | null>(400, 30 * 60 * 1000);
const gnulaSlugCache = new LruTtlCache<string, string | null>(400, 30 * 60 * 1000);

let cachedEmbed69AnubisCookie: { cookie: string; expiresAt: number } | null = null;

export async function unpackVidhideToHls(
  embedUrl: string
): Promise<{ rawM3u8: string; proxyUrl: string } | null> {
  try {
    // 1. Fast Vidaraa / Vidara JSON Stream Unpacker
    if (/vidaraa?\.[a-z]+/i.test(embedUrl)) {
      const u = new URL(embedUrl);
      const segments = u.pathname.split('/').filter(Boolean);
      const filecode = segments[segments.length - 1] || '';
      if (filecode) {
        const apiHeaders: Record<string, string> = {
          'User-Agent': CHROME_UA,
          'Content-Type': 'application/json',
          Accept: 'application/json, text/plain, */*',
          Origin: u.origin,
          Referer: embedUrl,
        };
        let apiJson: any = null;
        try {
          const apiRes = await streamingFetch(`${u.origin}/api/stream`, {
            method: 'POST',
            headers: apiHeaders,
            body: JSON.stringify({ filecode, device: 'web', codecs: [] }),
            timeoutMs: 4800,
          });
          if (apiRes.ok) {
            apiJson = await apiRes.json();
          }
        } catch {
          // fallback to curl POST in containerized Cloud Run environments
        }
        if (!apiJson) {
          const rawPost = await curlPostJsonText(
            `${u.origin}/api/stream`,
            { filecode, device: 'web', codecs: [] },
            apiHeaders,
            5
          );
          if (rawPost) {
            try {
              apiJson = JSON.parse(rawPost);
            } catch {
              apiJson = null;
            }
          }
        }
        const rawM3u8 = String(apiJson?.streaming_url || apiJson?.file || '').trim();
        if (rawM3u8 && /^https?:\/\//i.test(rawM3u8)) {
          const healthy = await probeHlsSegmentHealth(rawM3u8, u.origin);
          if (healthy) {
            return {
              rawM3u8,
              proxyUrl: buildHlsProxyUrl(rawM3u8, `${u.origin}/`),
            };
          }
        }
      }
    }

    // 2. Standard Vidhide / Smoothpre / Earnvids / Streamwish / 2vcdn Dean Edwards Unpacker
    const refererOrigin = embedUrl.includes('gnulahd')
      ? 'https://ww3.gnulahd.nu/'
      : embedUrl.includes('2vcdn')
      ? 'https://streamsrcs.2embed.cc/'
      : 'https://embed69.org/';
    let html = '';
    if (embedUrl.includes('2vcdn')) {
      const curlRes = await curlGetText(
        embedUrl,
        { 'User-Agent': CHROME_UA, Referer: refererOrigin },
        4,
        true
      ).catch(() => ({ text: '' }));
      html = curlRes.text || '';
    } else {
      html = await fetchTextWithCurlFallback(
        embedUrl,
        {
          'User-Agent': CHROME_UA,
          Referer: refererOrigin,
        },
        4500
      );
    }
    if (!html) return null;

    const unpacked = unpackDeanEdwards(html);
    if (!unpacked) return null;

    const linksMatch = unpacked.match(/var\s+links\s*=\s*(\{[^}]+\})/);
    if (!linksMatch) return null;

    const links = JSON.parse(linksMatch[1]);
    const origin = new URL(embedUrl).origin;
    const rawCandidates = [links.hls4, links.hls2, links.hls3]
      .map((c) => String(c || '').trim())
      .filter(Boolean);

    if (rawCandidates.length === 0) return null;

    for (const rawCandidate of rawCandidates) {
      const rawM3u8 = rawCandidate.startsWith('/') ? `${origin}${rawCandidate}` : rawCandidate;
      const healthy = await probeHlsSegmentHealth(rawM3u8, origin);
      if (healthy) {
        return {
          rawM3u8,
          proxyUrl: buildHlsProxyUrl(rawM3u8, `${origin}/`),
        };
      }
    }

    return null;
  } catch (err) {
    console.warn('unpackVidhideToHls error:', err);
    return null;
  }
}

export async function resolveImdbId(
  tmdbId: string | number,
  mediaType: 'movie' | 'tv'
): Promise<string | null> {
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

async function fetchEmbed69HtmlWithMirrorAndAnubis(imdbSuffix: string): Promise<string> {
  const mirrorUrl = `https://serieskao.top/vidurl/${imdbSuffix}/`;
  const mHtml = await fetchTextWithCurlFallback(
    mirrorUrl,
    {
      'User-Agent': CHROME_UA,
      Referer: 'https://serieskao.top/',
    },
    4000
  );
  if (mHtml && (mHtml.includes('dataLink') || mHtml.includes('OptionsLangDisp'))) {
    return mHtml;
  }

  const targetPath = `/f/${imdbSuffix}/`;
  const embed69Url = `https://embed69.org${targetPath}`;
  const reqHeaders: Record<string, string> = {
    'User-Agent': CHROME_UA,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  };
  if (cachedEmbed69AnubisCookie && cachedEmbed69AnubisCookie.expiresAt > Date.now()) {
    reqHeaders.Cookie = cachedEmbed69AnubisCookie.cookie;
  }

  const html = await fetchTextWithCurlFallback(embed69Url, reqHeaders, 5000);
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

    const passRes = await streamingFetch(passUrl, {
      headers: {
        'User-Agent': CHROME_UA,
        Referer: embed69Url,
      },
      redirect: 'manual',
      timeoutMs: 4500,
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

    const retryRes = await streamingFetch(embed69Url, {
      headers: {
        'User-Agent': CHROME_UA,
        Cookie: cookiePair,
      },
      timeoutMs: 5000,
    });
    return retryRes.ok ? await retryRes.text() : '';
  } catch {
    return '';
  }
}

export function parseEmbed69OrMoeTracks(html: string, tagId: string): TrackRecord[] {
  if (!html) return [];
  const tracks: TrackRecord[] = [];
  const langPriority: Record<string, number> = { ESP: 1, LAT: 2, SUB: 3, VOSE: 3 };

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
                  chosenResolver = /morencius|vidhide|smoothpre|earnvids/i.test(dec)
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

            const langCode = rawLang === 'ESP' ? 'ES' : rawLang === 'LAT' ? 'LAT' : 'VOSE';

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
      langIdMap.get(langNum) || (langNum === '1' ? 'ESP' : langNum === '0' ? 'LAT' : 'SUB');

    const isVidhide =
      /morencius|vidhide|smoothpre|earnvids/i.test(rawUrl) || innerTxt.includes('vidhide');
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

export async function resolveSeriesKaoVidurlTracks(opts: {
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
          const sHtml = await fetchTextWithCurlFallback(
            `https://serieskao.top/search?s=${encodeURIComponent(hint)}`,
            {
              'User-Agent': CHROME_UA,
              Referer: 'https://serieskao.top/',
            },
            4000
          );
          if (!sHtml) continue;

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

    const pHtml = await fetchTextWithCurlFallback(
      pageUrl,
      {
        'User-Agent': CHROME_UA,
        Referer: 'https://serieskao.top/',
      },
      4200
    );
    if (!pHtml) return [];

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

    const vHtml = await fetchTextWithCurlFallback(
      fullVidurl,
      {
        'User-Agent': CHROME_UA,
        Referer: pageUrl,
      },
      4500
    );
    if (!vHtml) return [];
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

export async function extractAnimeAv1Tracks(opts: {
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
            const beforeSemi = clean.includes(';') ? clean.split(';')[0].trim() : '';
            const afterSemi = clean.includes(';') ? clean.split(';').slice(1).join(' ').trim() : '';
            const noSemi = clean.replace(/;/g, ' ').trim();
            return [clean, noSemi, beforeColon, afterColon, beforeSemi, afterSemi];
          })
          .filter((s) => s.length >= 2 && !/[\u3040-\u30ff\u4e00-\u9faf]/.test(s))
      )
    );
    if (rawHints.length === 0) return [];

    const seasonNum = opts.mediaType === 'tv' ? Math.max(1, opts.season || 1) : 1;
    const epNum = opts.mediaType === 'tv' ? Math.max(1, opts.episode || 1) : 1;

    const resolveCanonicalAnimeAv1Target = (
      normList: string[],
      sNum: number,
      eNum: number
    ): { slug: string; ep: number } | null => {
      for (const nh of normList) {
        if (
          nh === 'attack on titan' ||
          nh === 'ataque a los titanes' ||
          nh === 'shingeki no kyojin'
        ) {
          if (sNum === 1) return { slug: 'shingeki-no-kyojin', ep: eNum };
          if (sNum === 2) return { slug: 'shingeki-no-kyojin-season-2', ep: eNum };
          if (sNum === 3) {
            return eNum <= 12
              ? { slug: 'shingeki-no-kyojin-season-3', ep: eNum }
              : { slug: 'shingeki-no-kyojin-season-3-part-2', ep: eNum - 12 };
          }
          return { slug: 'shingeki-no-kyojin-the-final-season', ep: eNum };
        }
        if (nh === 'solo leveling' || nh === 'ore dake level up na ken') {
          if (sNum === 1 && eNum <= 12) return { slug: 'ore-dake-level-up-na-ken', ep: eNum };
          if (sNum === 1 && eNum > 12) return { slug: 'ore-dake-level-up-na-ken-season-2', ep: eNum - 12 };
          return { slug: 'ore-dake-level-up-na-ken-season-2', ep: eNum };
        }
        if (nh === 'jujutsu kaisen') {
          if (sNum === 1) {
            if (eNum >= 48) return { slug: 'jujutsu-kaisen-shimetsu-kaiyuu-zenpen', ep: eNum - 47 };
            if (eNum >= 25) return { slug: 'jujutsu-kaisen-2nd-season', ep: eNum - 24 };
            return { slug: 'jujutsu-kaisen', ep: eNum };
          }
          if (sNum === 2) return { slug: 'jujutsu-kaisen-2nd-season', ep: eNum };
          return { slug: 'jujutsu-kaisen-shimetsu-kaiyuu-zenpen', ep: eNum };
        }
        if (nh === 'demon slayer' || nh === 'kimetsu no yaiba' || nh === 'guardianes de la noche') {
          if (sNum === 1) return { slug: 'kimetsu-no-yaiba', ep: eNum };
          if (sNum === 2) return { slug: 'kimetsu-no-yaiba-yuukaku-hen', ep: eNum };
          if (sNum === 3) return { slug: 'kimetsu-no-yaiba-katanakaji-no-sato-hen', ep: eNum };
          return { slug: 'kimetsu-no-yaiba-hashira-geiko-hen', ep: eNum };
        }
        if (nh === 'vinland saga') {
          return sNum >= 2 ? { slug: 'vinland-saga-season-2', ep: eNum } : { slug: 'vinland-saga', ep: eNum };
        }
        if (nh === 'berserk') {
          return sNum >= 2 ? { slug: 'berserk-2nd-season', ep: eNum } : { slug: 'berserk', ep: eNum };
        }
        if (
          nh === 'los siete pecados capitales' ||
          nh === 'los 7 pecados capitales' ||
          nh === 'nanatsu no taizai' ||
          nh === 'the seven deadly sins'
        ) {
          if (sNum === 1) return { slug: 'nanatsu-no-taizai', ep: eNum };
          if (sNum === 2) return { slug: 'nanatsu-no-taizai-imashime-no-fukkatsu', ep: eNum };
          if (sNum === 3) return { slug: 'nanatsu-no-taizai-kamigami-no-gekirin', ep: eNum };
          return { slug: 'nanatsu-no-taizai-mokushiroku-no-yonkishi', ep: eNum };
        }
        if (nh === 'fullmetal alchemist brotherhood' || nh === 'fullmetal alchemist') {
          return { slug: 'fullmetal-alchemist-brotherhood', ep: eNum };
        }
        if (nh === 'hunter x hunter' || nh === 'hunter hunter') return { slug: 'hunter-x-hunter-2011', ep: eNum };
        if (nh === 'death note') return { slug: 'death-note', ep: eNum };
        if (nh === 'one piece') return { slug: 'one-piece', ep: eNum };
        if (nh === 'steins gate' || nh === 'steinsgate') return { slug: 'steinsgate', ep: eNum };
        if (nh === 'dragon ball z') return { slug: 'dragon-ball-z', ep: eNum };
      }
      return null;
    };

    const normHints = rawHints.map((h) => normalizeTitleForMatch(h)).filter((nh) => nh.length >= 2);
    if (normHints.length === 0) return [];

    let matchedSlug: string | null = null;
    let resolvedEpNum = epNum;

    const canonicalTarget = resolveCanonicalAnimeAv1Target(normHints, seasonNum, epNum);
    if (canonicalTarget) {
      matchedSlug = canonicalTarget.slug;
      resolvedEpNum = Math.max(1, canonicalTarget.ep);
    } else {
      const slugCacheKey = `${opts.mediaType}|s${seasonNum}|${normHints[0]}`;
      if (animeAv1SlugCache.has(slugCacheKey)) {
        matchedSlug = animeAv1SlugCache.get(slugCacheKey) ?? null;
      } else {
        for (const q of rawHints.slice(0, 3)) {
          try {
            const sRes = await streamingFetch(
              `https://animeav1.com/catalogo?search=${encodeURIComponent(q)}`,
              {
                headers: {
                  'User-Agent': CHROME_UA,
                  Referer: 'https://animeav1.com/',
                },
                timeoutMs: 3800,
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
              const slugNoHyphen = slugLower.replace(/-/g, '');
              for (const nh of normHints) {
                const nhNoSpace = nh.replace(/\s+/g, '');
                if (
                  normCand === nh ||
                  slugLower === nh.replace(/\s+/g, '-') ||
                  (nhNoSpace.length >= 4 && slugNoHyphen === nhNoSpace)
                ) {
                  baseScore = Math.max(baseScore, 100);
                } else if (
                  nh.length >= 4 &&
                  (normCand.startsWith(`${nh} `) ||
                    slugLower.startsWith(`${nh.replace(/\s+/g, '-')}-`) ||
                    slugNoHyphen.startsWith(nhNoSpace))
                ) {
                  baseScore = Math.max(baseScore, 86);
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
              const hasAnyHigherSeason = /(?:season[-\s]*[2-9]|[2-9](?:nd|rd|th)[-\s]*season)/i.test(
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

        animeAv1SlugCache.set(slugCacheKey, matchedSlug);
      }
    }

    if (!matchedSlug) return [];

    const epUrl = `https://animeav1.com/media/${matchedSlug}/${resolvedEpNum}`;
    const epRes = await streamingFetch(epUrl, {
      headers: {
        'User-Agent': CHROME_UA,
        Referer: 'https://animeav1.com/',
      },
      timeoutMs: 4000,
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
          const chk = await streamingFetch(rawM3u8, {
            headers: {
              'User-Agent': CHROME_UA,
              Referer: playRef,
            },
            timeoutMs: 3000,
          });
          if (chk.ok) {
            const m3uTxt = await chk.text();
            if (m3uTxt.includes('#EXTM3U')) {
              found.push({
                id: `anime-zilla-${matchedSlug}-${resolvedEpNum}-${langCode.toLowerCase()}`,
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
        const vidhideMatch = blockStr.match(
          /https?:\/\/(?:ryderjet\.com|vidhide[a-z0-9.-]*)\/(?:embed\/|v\/|d\/)([a-zA-Z0-9_-]+)/i
        );
        if (vidhideMatch?.[0]) {
          found.push({
            id: `anime-vidhide-${matchedSlug}-${epNum}-${langCode.toLowerCase()}`,
            label: `${langLabel} · VidHide 1080p`,
            lang: langCode,
            quality: '1080p HLS',
            sourceUrl: vidhideMatch[0],
            resolverType: 'vidhide_hls',
          });
        }
      }

      if (found.length === 0) {
        const voeMatch = blockStr.match(
          /https?:\/\/(?:voe\.sx|[a-z0-9.-]*voe[a-z0-9.-]*)\/e\/[a-zA-Z0-9]+/i
        );
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
  ).slice(0, 5);
  if (uniqueHints.length === 0) return null;

  const cacheKey = `${opts.mediaType}|${opts.yearHint || ''}|${uniqueHints
    .map((h) => normalizeTitleForMatch(h))
    .join('|')}`;
  if (gnulaSlugCache.has(cacheKey)) {
    return gnulaSlugCache.get(cacheKey) ?? null;
  }

  const wantedType = opts.mediaType === 'tv' ? 'serie' : 'pelicula';
  const expectedYearNum =
    opts.yearHint && /^\d{4}$/.test(opts.yearHint.trim()) ? Number(opts.yearHint.trim()) : 0;

  for (const hint of uniqueHints) {
    try {
      const searchUrl = `${GNULA_ORIGIN}/wp-json/gnrd/v1/search?q=${encodeURIComponent(hint)}`;
      const rawJsonText = await fetchTextWithCurlFallback(
        searchUrl,
        {
          'User-Agent': CHROME_UA,
          Accept: 'application/json',
          Referer: `${GNULA_ORIGIN}/`,
        },
        4000
      );
      if (!rawJsonText) continue;
      let json: any = null;
      try {
        json = JSON.parse(rawJsonText);
      } catch {
        continue;
      }
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

      const isStrongTokenYearMatch = (rawTitle: any, rawYear: any): boolean => {
        if (!expectedYearNum || Number(String(rawYear || '').trim()) !== expectedYearNum) {
          return false;
        }
        const rNorm = normalizeTitleForMatch(String(rawTitle || '').replace(/\s*\([^)]*\)/g, ''));
        if (!rNorm || rNorm.length < 4) return false;
        return normTargets.some((nt) => {
          if (nt.length < 4) return false;
          if (rNorm.includes(nt) || nt.includes(rNorm)) return true;
          const ntTokens = nt.split(/\s+/).filter((t) => t.length >= 3);
          const rTokens = rNorm.split(/\s+/).filter((t) => t.length >= 3);
          if (ntTokens.length >= 2 && ntTokens.every((tok) => rTokens.includes(tok))) return true;
          if (rTokens.length >= 2 && rTokens.every((tok) => ntTokens.includes(tok))) return true;
          return false;
        });
      };

      const chosen =
        pool.find(
          (r) =>
            isExactTitle(r?.title) &&
            expectedYearNum > 0 &&
            Number(String(r?.year || '').trim()) === expectedYearNum
        ) ||
        pool.find((r) => isExactTitle(r?.title) && isYearCompatible(r?.year)) ||
        pool.find((r) => isStrongTokenYearMatch(r?.title, r?.year));

      if (chosen?.url) {
        const m = String(chosen.url).match(/\/ver\/([^/?#]+)\/?/i);
        if (m?.[1]) {
          gnulaSlugCache.set(cacheKey, m[1]);
          return m[1];
        }
      }
    } catch {
      // try next hint
    }
  }

  gnulaSlugCache.set(cacheKey, null);
  return null;
}

export async function extractGnulaCastellanoTracks(opts: {
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
        ? `${GNULA_ORIGIN}/${slug}-${opts.season || 1}x${String(opts.episode || 1).padStart(2, '0')}/`
        : `${GNULA_ORIGIN}/ver/${slug}/`;

    const html = await fetchTextWithCurlFallback(
      pageUrl,
      {
        'User-Agent': CHROME_UA,
        Referer: `${GNULA_ORIGIN}/`,
      },
      4200
    );
    if (!html) return [];

    const pidMatch = html.match(/_gnrdPid\s*=\s*(\d+)/);
    const tokMatch = html.match(/_gnrdTok\s*=\s*["']([^"']+)["']/);
    if (!pidMatch?.[1] || !tokMatch?.[1]) return [];

    const playerApiUrl = `${GNULA_ORIGIN}/wp-json/gnrd/v1/player?id=${
      pidMatch[1]
    }&t=${encodeURIComponent(tokMatch[1])}`;
    const pText = await fetchTextWithCurlFallback(
      playerApiUrl,
      {
        'User-Agent': CHROME_UA,
        Accept: 'application/json',
        Referer: pageUrl,
      },
      4000
    );
    if (!pText) return [];
    const pJson = JSON.parse(pText);
    if (!pJson?.d) return [];

    const langsPayload: any[] = gnrdXorUnpack(pJson.d);
    if (!Array.isArray(langsPayload)) return [];

    const nativeTracks: TrackRecord[] = [];
    const embedBackupTracks: TrackRecord[] = [];

    langsPayload.forEach((grp, lIdx) => {
      const rawLangName = String(grp?.name || '');
      const langCode: 'ES' | 'LAT' | 'VOSE' = /latino/i.test(rawLangName)
        ? 'LAT'
        : /castellano|espa[ñn]ol/i.test(rawLangName)
        ? 'ES'
        : 'VOSE';
      const displayLang =
        langCode === 'ES' ? 'Castellano' : langCode === 'LAT' ? 'Latino' : 'Subtitulado';

      const servers: any[] = Array.isArray(grp?.servers) ? grp.servers : [];
      servers.forEach((srv, sIdx) => {
        const rawSrc = String(srv?.src || '').trim();
        const srvTitle = String(srv?.title || 'HD').trim();
        if (!rawSrc.startsWith('http')) return;
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

    return nativeTracks.length > 0 ? nativeTracks : embedBackupTracks;
  } catch {
    return [];
  }
}

export async function extractEmbed69SpanishTracks(opts: {
  tmdbId?: string | number;
  imdbId?: string | null;
  mediaType: 'movie' | 'tv';
  season?: number;
  episode?: number;
  titleHints?: string[];
}): Promise<TrackRecord[]> {
  try {
    let imdbId = opts.imdbId || null;
    const hints = [...(opts.titleHints || [])].filter(Boolean);
    let isLikelyAnime = false;
    let yearHint = '';

    if (opts.tmdbId) {
      try {
        const cleanId = String(opts.tmdbId).replace(/\D/g, '');
        const tmUrl =
          opts.mediaType === 'tv'
            ? `https://api.themoviedb.org/3/tv/${cleanId}?api_key=${TMDB_API_KEY}&language=es-ES&append_to_response=translations,external_ids`
            : `https://api.themoviedb.org/3/movie/${cleanId}?api_key=${TMDB_API_KEY}&language=es-ES&append_to_response=translations,external_ids`;
        const tmRes = await fetch(tmUrl, { signal: AbortSignal.timeout(3000) });
        if (tmRes.ok) {
          const tmJson: any = await tmRes.json();
          if (!imdbId) {
            imdbId = tmJson?.imdb_id || tmJson?.external_ids?.imdb_id || null;
          }
          const esName = String(tmJson?.name || tmJson?.title || '').trim();
          const origName = String(
            tmJson?.original_name || tmJson?.original_title || ''
          ).trim();
          const rawDate = String(tmJson?.first_air_date || tmJson?.release_date || '');
          if (rawDate) yearHint = rawDate.split('-')[0] || '';
          if (esName) hints.push(esName);

          const translations: any[] = Array.isArray(tmJson?.translations?.translations)
            ? tmJson.translations.translations
            : [];
          const mxEntry = translations.find(
            (tr) => tr?.iso_3166_1 === 'MX' || (tr?.iso_639_1 === 'es' && tr?.iso_3166_1 !== 'ES')
          );
          const mxName = String(mxEntry?.data?.title || mxEntry?.data?.name || '').trim();
          if (mxName && !hints.includes(mxName)) hints.push(mxName);

          if (origName && !hints.includes(origName)) hints.push(origName);

          const enEntry = translations.find(
            (tr) => tr?.iso_3166_1 === 'US' || tr?.iso_639_1 === 'en'
          );
          const enTrName = String(enEntry?.data?.title || enEntry?.data?.name || '').trim();
          if (enTrName && !hints.includes(enTrName)) hints.push(enTrName);

          const genres: any[] = Array.isArray(tmJson?.genres) ? tmJson.genres : [];
          const hasAnimGenre = genres.some((g) => Number(g?.id) === 16);
          const origCountries: string[] = Array.isArray(tmJson?.origin_country)
            ? tmJson.origin_country
            : [];
          const isJp =
            String(tmJson?.original_language || '').toLowerCase() === 'ja' ||
            origCountries.includes('JP');
          isLikelyAnime = hasAnimGenre && isJp;
        }
      } catch {
        // ignore
      }
    }

    if (!imdbId && opts.tmdbId) {
      imdbId = await resolveImdbId(opts.tmdbId, opts.mediaType);
    }

    const epSuffix =
      opts.mediaType === 'tv' && opts.season && opts.episode
        ? `-${opts.season}x${String(opts.episode).padStart(2, '0')}`
        : '';

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

    const nativeCandidates = [
      ...gnulaTracks.filter((t) => t.resolverType === 'vidhide_hls'),
      ...directTracks,
      ...skTracks,
      ...animeTracks,
      ...gnulaTracks.filter((t) => t.resolverType !== 'vidhide_hls' && t.resolverType !== 'web_embed'),
    ];
    const orderedCandidates =
      nativeCandidates.length > 0
        ? nativeCandidates
        : gnulaTracks.filter((t) => t.resolverType === 'web_embed');

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

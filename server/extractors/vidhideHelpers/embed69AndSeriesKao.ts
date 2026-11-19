import crypto from 'crypto';
import { LruTtlCache } from '../../utils/lruCache.ts';
import { streamingFetch } from '../../utils/tlsFetch.ts';
import {
  CHROME_UA,
  type TrackRecord,
  areTitlesStrictlyEqual,
  fetchTextWithCurlFallback,
  isMetadataCompatibleForMedia,
  normalizeTitleForMatch,
} from '../httpHelpers.ts';
import { parseGnulaPageMetadata } from './animeAv1AndGnulaCompat.ts';

const seriesKaoSlugCache = new LruTtlCache<string, string | null>(400, 30 * 60 * 1000);
let cachedEmbed69AnubisCookie: { cookie: string; expiresAt: number } | null = null;

export async function fetchEmbed69HtmlWithMirrorAndAnubis(imdbSuffix: string): Promise<string> {
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

  const initRes = await streamingFetch(embed69Url, {
    headers: reqHeaders,
    timeoutMs: 5000,
  }).catch(() => null);

  let html = initRes ? await initRes.text().catch(() => '') : '';
  if (!html) {
    html = await fetchTextWithCurlFallback(embed69Url, reqHeaders, 5000);
  }
  if (html.includes('dataLink') || html.includes('OptionsLangDisp')) {
    return html;
  }

  const anubisMatch = html.match(
    /<script[^>]*id="anubis_challenge"[^>]*>([\s\S]*?)<\/script>/i
  );
  if (!anubisMatch) return html;

  // Cached cookie expired or rejected — clear and solve fresh challenge
  cachedEmbed69AnubisCookie = null;

  try {
    const parsed = JSON.parse(anubisMatch[1].trim());
    const randomData = String(parsed?.challenge?.randomData || '');
    const challengeId = String(parsed?.challenge?.id || '');
    const difficulty = Math.min(6, Number(parsed?.rules?.difficulty || 4));
    if (!randomData || !challengeId) return '';

    const initSetCookies: string[] = initRes
      ? typeof (initRes.headers as any).getSetCookie === 'function'
        ? (initRes.headers as any).getSetCookie()
        : [initRes.headers.get('set-cookie') || ''].filter(Boolean)
      : [];
    const verificationCookies = initSetCookies
      .map((c) => c.split(';')[0]?.trim())
      .filter((c) => c && c.includes('='));

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

    const passHeaders: Record<string, string> = {
      'User-Agent': CHROME_UA,
      Referer: embed69Url,
    };
    if (verificationCookies.length > 0) {
      passHeaders.Cookie = verificationCookies.join('; ');
    }

    const passRes = await streamingFetch(passUrl, {
      headers: passHeaders,
      redirect: 'manual',
      timeoutMs: 4500,
    });

    const rawSetCookies: string[] =
      typeof (passRes.headers as any).getSetCookie === 'function'
        ? (passRes.headers as any).getSetCookie()
        : [passRes.headers.get('set-cookie') || ''].filter(Boolean);

    const authCookies = rawSetCookies
      .map((c) => c.split(';')[0]?.trim())
      .filter((c) => c && c.includes('=') && !c.endsWith('='));

    const combinedCookie = Array.from(new Set([...verificationCookies, ...authCookies])).join('; ');
    if (!combinedCookie) return '';

    cachedEmbed69AnubisCookie = {
      cookie: combinedCookie,
      expiresAt: Date.now() + 6 * 60 * 60 * 1000,
    };

    const retryRes = await streamingFetch(embed69Url, {
      headers: {
        'User-Agent': CHROME_UA,
        Cookie: combinedCookie,
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

            const label =
              rawLang === 'ESP'
                ? 'Castellano HD'
                : rawLang === 'LAT'
                ? 'Español Latino HD'
                : rawLang === 'SUB' || rawLang === 'VOSE'
                ? 'Subtitulado VOSE'
                : `${rawLang} HD`;
            const langCode = rawLang === 'ESP' ? 'ES' : rawLang === 'LAT' ? 'LAT' : 'VOSE';

            const decodedCandList: Array<{
              url: string;
              srv: string;
              resolverType: 'vidhide_hls' | 'embed_sniff' | 'web_embed';
              priority: number;
            }> = [];

            for (const fbEmbed of embeds) {
              const srv = String(fbEmbed?.servername || '').toLowerCase();
              if (!fbEmbed?.link || srv === 'download') continue;
              const dec = decryptEmbedLink(fbEmbed.link);
              if (!dec || !dec.startsWith('http')) continue;
              const low = dec.toLowerCase();
              if (/1fichier|uptobox|mega\.nz|mediafire/i.test(low)) continue;

              if (/byse|bysevepoin/i.test(low)) {
                decodedCandList.push({ url: dec, srv: srv || 'byse', resolverType: 'vidhide_hls', priority: 0 });
              } else if (/vidaraa?\./i.test(low)) {
                decodedCandList.push({ url: dec, srv: srv || 'vidara', resolverType: 'vidhide_hls', priority: 1 });
              } else if (/filelions|smoothpre|earnvids|vidhide/i.test(low) && !/morencius/i.test(low)) {
                decodedCandList.push({ url: dec, srv: srv || 'vidhide', resolverType: 'vidhide_hls', priority: 2 });
              } else if (/morencius/i.test(low)) {
                decodedCandList.push({ url: dec, srv: srv || 'vidhide', resolverType: 'vidhide_hls', priority: 5 });
              } else if (/streamwish|hglink|hlswish|wishembed/i.test(low) || srv === 'streamwish') {
                decodedCandList.push({ url: dec, srv: 'streamwish', resolverType: 'web_embed', priority: 3 });
              } else if (/voe\./i.test(low) || srv === 'voe') {
                decodedCandList.push({ url: dec, srv: 'voe', resolverType: 'embed_sniff', priority: 4 });
                decodedCandList.push({ url: dec, srv: 'voe-web', resolverType: 'web_embed', priority: 6 });
              } else {
                decodedCandList.push({ url: dec, srv: srv || 'web', resolverType: 'web_embed', priority: 7 });
              }
            }

            decodedCandList.sort((a, b) => a.priority - b.priority);

            decodedCandList.forEach((cand, idx) => {
              tracks.push({
                id: `embed69-${tagId}-${rawLang.toLowerCase()}-${idx + 1}`,
                label: cand.resolverType === 'web_embed' ? `${label} (${cand.srv})` : label,
                lang: langCode,
                quality: cand.resolverType === 'web_embed' ? 'HD Web' : 'HD HLS',
                sourceUrl: cand.url,
                resolverType: cand.resolverType,
              });
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
  directorHint?: string;
  runtimeMinHint?: number;
  force?: boolean;
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
    const cacheKey = `v2|${opts.mediaType}|${expectedYearNum || ''}|${opts.imdbId || ''}|${normalizeTitleForMatch(
      uniqueHints[0]
    )}`;
    let matchedShowUrl = opts.force ? null : seriesKaoSlugCache.get(cacheKey) || null;

    if (opts.force || !seriesKaoSlugCache.has(cacheKey)) {
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
            if (!areTitlesStrictlyEqual(cardTitle, uniqueHints)) continue;

            const cardYearMatch = cardInner.match(/\b(19\d{2}|20\d{2})\b/);
            const cardYearNum = cardYearMatch?.[1] ? Number(cardYearMatch[1]) : 0;
            if (expectedYearNum && cardYearNum && Math.abs(cardYearNum - expectedYearNum) > 1) {
              continue;
            }
            if (
              opts.mediaType === 'movie' &&
              expectedYearNum &&
              cardYearNum &&
              cardYearNum !== expectedYearNum &&
              !opts.imdbId
            ) {
              continue;
            }
            const fullHref = href.startsWith('http')
              ? href.replace(/\/+$/, '')
              : `https://serieskao.top${href.replace(/\/+$/, '')}`;

            const score =
              expectedYearNum && cardYearNum === expectedYearNum
                ? 110
                : expectedYearNum && cardYearNum === 0
                ? 95
                : 100;

            if (score > bestScore) {
              bestScore = score;
              bestUrl = fullHref;
              if (score >= 110) break;
            }
          }

          if (bestUrl && bestScore >= 95) {
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

    let imdbVerified = false;
    if (opts.imdbId) {
      const pageImdbMatch = pHtml.match(/\b(tt\d{6,10})\b/i);
      if (pageImdbMatch?.[1]) {
        if (pageImdbMatch[1].toLowerCase() !== opts.imdbId.toLowerCase()) {
          return [];
        }
        imdbVerified = true;
      }
    }

    if (!imdbVerified) {
      const pageMeta = parseGnulaPageMetadata(pHtml);
      const fallbackBodyYear =
        pHtml.match(/<title[^>]*>[^<]*\((\d{4})\)[^<]*<\/title>/i)?.[1] ||
        pHtml.match(/\/year\/((?:19|20)\d{2})\b/i)?.[1] ||
        pageMeta.year ||
        '';
      if (opts.mediaType === 'movie') {
        if (expectedYearNum > 0 || opts.directorHint || opts.runtimeMinHint) {
          const compat = isMetadataCompatibleForMedia({
            targetTitleHints: uniqueHints,
            candidateYear: fallbackBodyYear || undefined,
            expectedYear: opts.yearHint,
            candidateDirector: pageMeta.director || undefined,
            expectedDirector: opts.directorHint,
            candidateRuntimeMin: pageMeta.runtimeMin || undefined,
            expectedRuntimeMin: opts.runtimeMinHint,
          });
          if (!compat.ok) {
            return [];
          }
        }
      } else if (expectedYearNum > 0 && fallbackBodyYear && /^\d{4}$/.test(fallbackBodyYear)) {
        // TV episode pages often omit series first_air_date or show episode air year (>= first_air_date)
        const candYearNum = Number(fallbackBodyYear);
        if (candYearNum < expectedYearNum - 1) {
          return [];
        }
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

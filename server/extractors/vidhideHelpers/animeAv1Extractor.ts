import { LruTtlCache } from '../../utils/lruCache.ts';
import { streamingFetch } from '../../utils/tlsFetch.ts';
import {
  CHROME_UA,
  type TrackRecord,
  buildHlsProxyUrl,
  curlGetBufferWithStatus,
  normalizeTitleForMatch,
} from '../httpHelpers.ts';
import { unpackMp4UploadToDirect } from './directHostUnpackers.ts';

const animeAv1SlugCache = new LruTtlCache<string, string | null>(400, 30 * 60 * 1000);

function resolveCanonicalAnimeAv1Target(
  normList: string[],
  sNum: number,
  eNum: number
): { slug: string; ep: number } | null {
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
                const remainder = normCand.startsWith(`${nh} `)
                  ? normCand.slice(nh.length + 1).trim()
                  : '';
                const isQualifierSuffix =
                  /^(?:season\s*\d+|part\s*\d+|\d+(?:st|nd|rd|th)\s+season|movie|pelicula|film|ii|iii|iv|final season|shippuden)$/i.test(
                    remainder
                  );
                if (
                  normCand === nh ||
                  slugLower === nh.replace(/\s+/g, '-') ||
                  (nhNoSpace.length >= 4 && slugNoHyphen === nhNoSpace)
                ) {
                  baseScore = Math.max(baseScore, 100);
                } else if (nh.length >= 4 && isQualifierSuffix) {
                  baseScore = Math.max(baseScore, 88);
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
              const mapMatch = m3uTxt.match(/#EXT-X-MAP:URI="([^"]+)"/i);
              const firstSegLine = m3uTxt
                .split(/\r?\n/)
                .find((l) => l.trim() && !l.trim().startsWith('#'));
              const probeTargetRaw = mapMatch?.[1] || firstSegLine?.trim() || '';
              let segmentHealthy = false;
              if (probeTargetRaw) {
                try {
                  const absProbeUrl = new URL(probeTargetRaw, rawM3u8).href;
                  const segProbe = await curlGetBufferWithStatus(
                    absProbeUrl,
                    { 'User-Agent': CHROME_UA, Referer: playRef, Range: 'bytes=0-16383' },
                    3
                  ).catch(() => ({ buf: Buffer.alloc(0), status: 0 }));
                  const headStr = segProbe.buf
                    .subarray(0, 48)
                    .toString('utf8')
                    .trimStart()
                    .toLowerCase();
                  segmentHealthy =
                    segProbe.status >= 200 &&
                    segProbe.status < 400 &&
                    segProbe.buf.length >= 256 &&
                    !headStr.startsWith('<!doctype') &&
                    !headStr.startsWith('<html');
                } catch {
                  segmentHealthy = false;
                }
              }
              if (segmentHealthy) {
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
          }
        } catch {
          // fallback below
        }
      }

      if (found.length === 0) {
        const mp4UploadMatch = blockStr.match(
          /https?:\/\/(?:www\.)?mp4upload\.com\/embed-[a-zA-Z0-9]+\.html/i
        );
        if (mp4UploadMatch?.[0]) {
          const unpacked = await unpackMp4UploadToDirect(mp4UploadMatch[0]);
          if (unpacked) {
            found.push({
              id: `anime-mp4u-${matchedSlug}-${resolvedEpNum}-${langCode.toLowerCase()}`,
              label: `${langLabel} · MP4 Directo 1080p`,
              lang: langCode,
              quality: '1080p Direct',
              sourceUrl: unpacked.rawMp4,
              referer: 'https://www.mp4upload.com/',
              resolverType: 'direct_mp4',
              resolvedStreamUrl: unpacked.proxyUrl,
            });
          }
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
      resolveBlockTracks(dubBlockMatch?.[1], 'LAT', 'Español Doblado (Latino)'),
    ]);

    const esDubTracks: TrackRecord[] = dubTracks.map((tr) => ({
      ...tr,
      id: tr.id.replace('anime-lat-', 'anime-es-'),
      label: tr.label.replace('Latino', 'Castellano'),
      lang: 'ES',
    }));

    return [...dubTracks, ...esDubTracks, ...voseTracks];
  } catch {
    return [];
  }
}

import { type TrackRecord } from './httpHelpers.ts';
import { unpackVidhideToHls } from './vidhideHelpers/directHostUnpackers.ts';
import { logger } from '../utils/logger.ts';
import {
  type GnulaPageMetadata,
  fetchGnulaPageMetadata,
  fetchGnulaPathWithMirrorFailover,
  getActiveGnulaOrigin,
  gnrdUnpack,
  normalizeGnulaUrl,
  verifyGnulaMetaMatch,
} from './gnulaHelpers/gnulaMirrorsAndParser.ts';

export * from './gnulaHelpers/gnulaMirrorsAndParser.ts';
export * from './gnulaHelpers/gnulaSearchAndCatalog.ts';

function getGnulaHostPriority(rawUrl: string): number {
  const low = rawUrl.toLowerCase();
  if (/byse|bysevepoin/i.test(low)) return 0;
  if (/vidaraa?\.[a-z]+/i.test(low)) return 1;
  if (/vidhide|smoothpre|earnvids|morencius/i.test(low)) return 2;
  if (/filelions/i.test(low)) return 3;
  if (/streamwish|hglink|hlswish|wishembed/i.test(low)) return 4;
  if (/voe\.[a-z]+/i.test(low)) return 5;
  return 6;
}

/**
 * Extracts streaming tracks from a Gnula HD movie or series page in HLS
 * (unpacking Byse/Vidara/Vidhide/Streamwish/Filelions concurrently across mirrors)
 */
export async function extractGnulaHdTracks(
  pageUrl: string,
  opts?: {
    expectedYear?: string;
    expectedTitleHints?: string[];
    expectedDirector?: string;
    expectedRuntimeMin?: number;
    mediaType?: 'movie' | 'tv';
    season?: number;
    episode?: number;
    skipUnpack?: boolean;
  }
): Promise<TrackRecord[]> {
  try {
    let targetUrl = normalizeGnulaUrl(pageUrl);
    if (!targetUrl) return [];

    let meta = await fetchGnulaPageMetadata(targetUrl);
    if (!meta) return [];

    if (opts?.expectedTitleHints && opts.expectedTitleHints.length > 0 && meta.cleanTitle) {
      const check = verifyGnulaMetaMatch(meta, {
        titleHints: opts.expectedTitleHints,
        expectedYear: opts.expectedYear,
        expectedDirector: opts.expectedDirector,
        expectedRuntimeMin: opts.expectedRuntimeMin,
        expectedMediaType: opts.mediaType,
      });
      if (!check.ok && !(opts.expectedYear && meta.year === opts.expectedYear)) {
        return [];
      }
    }

    // If TV series hub (/ver/<slug>/ without _gnrdPid), navigate to the specific episode page
    if ((opts?.mediaType === 'tv' || meta.isTvShow) && (!meta.pid || !meta.token)) {
      const sNum = Math.max(1, opts?.season || 1);
      const eNum = Math.max(1, opts?.episode || 1);
      const epKey = `${sNum}x${eNum}`;
      const epPadded = String(eNum).padStart(2, '0');
      const slug = targetUrl.split('/ver/')[1]?.replace(/\//g, '') || '';
      const activeOrigin = getActiveGnulaOrigin();

      const epCandidates = [
        meta.episodeUrls[epKey],
        slug ? `${activeOrigin}/${slug}-${sNum}x${epPadded}/` : '',
        slug ? `${activeOrigin}/${slug}-${sNum}x${eNum}/` : '',
      ].filter(Boolean);

      let epMeta: GnulaPageMetadata | null = null;
      for (const epUrl of Array.from(new Set(epCandidates))) {
        const candidateMeta = await fetchGnulaPageMetadata(epUrl);
        if (candidateMeta && candidateMeta.pid && candidateMeta.token) {
          epMeta = candidateMeta;
          targetUrl = candidateMeta.resolvedUrl || epUrl;
          break;
        }
      }
      if (!epMeta) return [];
      meta = epMeta;
    }

    if (!meta.pid || !meta.token) return [];

    const playerPath = `/wp-json/gnrd/v1/player?id=${meta.pid}&t=${encodeURIComponent(meta.token)}`;
    const playerRes = await fetchGnulaPathWithMirrorFailover(playerPath, {
      referer: targetUrl,
      acceptJson: true,
      timeoutMs: 4200,
    });
    if (!playerRes?.text) return [];

    const json = JSON.parse(playerRes.text);
    const rawPayload = json?.p ?? json?.d;
    if (!rawPayload) return [];

    const unpacked = typeof rawPayload === 'string' ? gnrdUnpack(rawPayload) : rawPayload;
    const langsPayload: any[] = Array.isArray(unpacked?.langs)
      ? unpacked.langs
      : Array.isArray(unpacked)
      ? unpacked
      : [];
    if (langsPayload.length === 0) return [];

    interface CandidateServerJob {
      lang: 'ES' | 'LAT' | 'VOSE';
      srvTitle: string;
      srcUrl: string;
      sIdx: number;
      hostPriority: number;
    }

    const jobs: CandidateServerJob[] = [];

    for (const langItem of langsPayload) {
      const rawLang = String(langItem.label || langItem.name || '').toLowerCase();
      let trackLang: 'ES' | 'LAT' | 'VOSE' = 'ES';
      if (rawLang.includes('latino') || langItem.flag === 'MX') {
        trackLang = 'LAT';
      } else if (rawLang.includes('sub') || langItem.flag === 'US') {
        trackLang = 'VOSE';
      } else if (rawLang.includes('castellano') || rawLang.includes('espa') || langItem.flag === 'ES') {
        trackLang = 'ES';
      }

      const servers: any[] = Array.isArray(langItem.servers) ? langItem.servers : [];
      servers.forEach((srv, sIdx) => {
        const srcUrl = String(srv?.src || '').trim();
        if (!srcUrl.startsWith('http')) return;
        jobs.push({
          lang: trackLang,
          srvTitle: String(srv?.title || 'HD').trim(),
          srcUrl,
          sIdx,
          hostPriority: getGnulaHostPriority(srcUrl),
        });
      });
    }

    const langDisplay = (lang: 'ES' | 'LAT' | 'VOSE') =>
      lang === 'ES' ? 'Castellano' : lang === 'LAT' ? 'Español Latino' : 'Subtitulado VOSE';

    const langsWithPrimaryDirectHls = new Set(
      jobs.filter((j) => j.hostPriority <= 2).map((j) => j.lang)
    );

    const resolvedItems = await Promise.all(
      jobs.map(async (job): Promise<{ track: TrackRecord; hostPriority: number } | null> => {
        const { lang, srvTitle, srcUrl, sIdx, hostPriority } = job;
        const low = srcUrl.toLowerCase();

        if (/byse|bysevepoin|vidaraa?\.[a-z]+|morencius|vidhide|smoothpre|earnvids|streamwish|filelions|hglink|hlswish|wishembed/i.test(low)) {
          const shouldEagerUnpack =
            !opts?.skipUnpack &&
            (hostPriority <= 3 || !langsWithPrimaryDirectHls.has(lang));
          const directHls = shouldEagerUnpack
            ? await Promise.race([
                unpackVidhideToHls(srcUrl).catch(() => null),
                new Promise<null>((r) => setTimeout(() => r(null), 2600)),
              ])
            : null;
          if (directHls) {
            return {
              hostPriority,
              track: {
                id: `gnula-hls-${meta!.pid}-${lang.toLowerCase()}-${sIdx + 1}`,
                label: `${langDisplay(lang)} HD · GnulaHD (${srvTitle || 'HLS'})`,
                lang,
                quality: '1080p HLS',
                resolvedStreamUrl: directHls.proxyUrl,
                sourceUrl: srcUrl,
                resolverType: 'direct_hls',
              },
            };
          }
          // Keep vidhide_hls resolver so primary playback / track switching unpacks on demand cleanly
          return {
            hostPriority,
            track: {
              id: `gnula-vidhide-${meta!.pid}-${lang.toLowerCase()}-${sIdx + 1}`,
              label: `${langDisplay(lang)} HD · GnulaHD (${srvTitle || 'HLS'})`,
              lang,
              quality: '1080p',
              sourceUrl: srcUrl,
              resolverType: 'vidhide_hls',
            },
          };
        }

        if (/voe\.[a-z]+/i.test(low)) {
          return {
            hostPriority,
            track: {
              id: `gnula-voe-${meta!.pid}-${lang.toLowerCase()}-${sIdx + 1}`,
              label: `${langDisplay(lang)} · GnulaHD (VOE)`,
              lang,
              quality: 'HD',
              sourceUrl: srcUrl,
              resolverType: 'embed_sniff',
            },
          };
        }

        return {
          hostPriority,
          track: {
            id: `gnula-embed-${meta!.pid}-${lang.toLowerCase()}-${sIdx + 1}`,
            label: `${langDisplay(lang)} · GnulaHD (${srvTitle || 'Web'})`,
            lang,
            quality: 'HD',
            sourceUrl: srcUrl,
            resolverType: 'web_embed',
          },
        };
      })
    );

    const langOrder: Record<string, number> = { ES: 1, LAT: 2, VOSE: 3 };
    const resolverRank = (rt: string) =>
      rt === 'direct_hls' ? 0 : rt === 'vidhide_hls' ? 1 : rt === 'embed_sniff' ? 2 : 3;

    return resolvedItems
      .filter((x): x is { track: TrackRecord; hostPriority: number } => Boolean(x))
      .sort((a, b) => {
        const rDiff = resolverRank(a.track.resolverType) - resolverRank(b.track.resolverType);
        if (rDiff !== 0) return rDiff;
        const lDiff = (langOrder[a.track.lang] || 9) - (langOrder[b.track.lang] || 9);
        if (lDiff !== 0) return lDiff;
        return a.hostPriority - b.hostPriority;
      })
      .map((x) => x.track);
  } catch (err) {
    logger.warn({ err }, 'extractGnulaHdTracks_error');
    return [];
  }
}

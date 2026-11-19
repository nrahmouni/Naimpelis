import express from 'express';
import { ENV } from '../config/env.ts';
import { LruTtlCache } from '../utils/lruCache.ts';
import { parseYouTubeVideoId } from './youtubeCatalog.ts';
import { fetchAndCacheSubtitles } from './detailsAndSubtitles.ts';
import {
  CHROME_UA,
  buildHlsProxyUrl,
  buildTsProxyUrl,
  curlGetText,
  generateSpanishTitleHints,
  getPreferredUpstreamUa,
  isChineseIptvStream,
  isDvbHeadendStream,
  maybeSignEasyBroadcastUrl,
  resolveKnownUpstreamReferer,
  type ExtractedStreamResult,
  type TrackRecord,
} from '../extractors/httpHelpers.ts';
import {
  extractEmbed69SpanishTracks,
  unpackVidhideToHls,
} from '../extractors/vidhideEmbed69.ts';
import {
  extract2EmbedEnglishTracks,
  extractBingetrixEnglishTracks,
  extractMovidyPageTracks,
  extractVidRockHlsTracks,
  extractVidsrcBuzzHlsTracks,
  fetchMovidyPageMetadata,
  findMovidyUrlByTitle,
  isMovidyVerUrl,
  normalizeMovidyUrl,
  resolveMovidyEmbedTrack,
  verifyMovidyMetaMatch,
  type MovidyPageMetadata,
} from '../extractors/bingetrixMovidy.ts';
import {
  extractGnulaHdTracks,
  fetchGnulaPageMetadata,
  findGnulaHdUrlByTitle,
  isGnulaHdUrl,
  normalizeGnulaUrl,
  verifyGnulaMetaMatch,
  type GnulaPageMetadata,
} from '../extractors/gnulaHdExtractor.ts';
import {
  extractLiveSportsHlsDirect,
  fetchSportsHtmlHop,
  sniffStreamWithHeadless,
  verifyM3u8HasCleanVideoFrame,
} from '../extractors/sportsExtractor.ts';
import { fetchTmdbJson } from '../services/tmdbService.ts';
import {
  extractVestStreamsAndSubtitles,
  fetchVestDetailPage,
  findVestSeedForMedia,
  isVestMirrorUrl,
  type VestParsedDetail,
} from '../services/vestMirrorService.ts';
import { channelHealthMonitor } from '../services/channelHealthMonitor.ts';
import {
  extractLocalizedTmdbTitleHints,
  resolveTmdbIdByTitle,
} from '../services/tmdbCatalogHelpers.ts';
import {
  buildWebEmbedTracks,
  searchYouTubeFullFallback,
  toProxiedEmbedUrl,
  verifyWebEmbedCandidateAlive,
} from '../services/streamExtractFallback.ts';

const TMDB_API_KEY = ENV.tmdbApiKey;
const extractionCache = new LruTtlCache<string, ExtractedStreamResult>(400, 15 * 60 * 1000);

export interface RankCandidateTracksInput {
  allDiscovered: TrackRecord[];
  preferLang: string;
  isVestLink: boolean;
  hasExplicitMovidyUrl: boolean;
  hasExplicitGnulaUrl: boolean;
  healthMap: Record<string, any>;
}

export interface RankCandidateTracksOutput {
  orderedTracks: TrackRecord[];
  getLangScore: (trackLang: string) => number;
  sourcePriority: (tr: TrackRecord) => number;
  getTrackHealthScore: (tr: TrackRecord) => number;
}

export type RankCandidateTracksFn = (input: RankCandidateTracksInput) => RankCandidateTracksOutput;

function formatExtractResponseForClient(
  req: express.Request,
  payload: ExtractedStreamResult,
  getPublicOrigin: (r: express.Request) => string
): ExtractedStreamResult & { requestId?: string } {
  const headerReqId = typeof req.headers['x-request-id'] === 'string' ? req.headers['x-request-id'] : '';
  const requestId =
    (payload as { requestId?: string }).requestId ||
    headerReqId ||
    `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  if (String(req.query.abs || '') !== '1') {
    return { ...payload, requestId };
  }
  const publicOrigin = getPublicOrigin(req);
  const absProxyUrl = (u?: string): string | undefined => {
    if (!u) return u;
    if (u.startsWith('/api/hls-proxy/') || u.startsWith('/api/vod-manifest/')) {
      const full = `${publicOrigin}${u}`;
      return full.includes('abs=1') ? full : `${full}${full.includes('?') ? '&' : '?'}abs=1`;
    }
    if (u.startsWith('/api/ts-proxy/') || u.startsWith('/api/embed-proxy')) {
      return `${publicOrigin}${u}`;
    }
    return u;
  };
  return {
    ...payload,
    requestId,
    streamUrl: absProxyUrl(payload.streamUrl) || payload.streamUrl,
    tracks: Array.isArray(payload.tracks)
      ? payload.tracks.map((tr) => ({
          ...tr,
          resolvedStreamUrl: absProxyUrl(tr.resolvedStreamUrl),
        }))
      : payload.tracks,
  };
}

export function registerStreamExtractRoute(
  app: express.Express,
  deps: {
    getPublicOrigin: (r: express.Request) => string;
    rankCandidateTracks: RankCandidateTracksFn;
  }
) {
  const formatResp = (req: express.Request, payload: ExtractedStreamResult) =>
    formatExtractResponseForClient(req, payload, deps.getPublicOrigin);

  app.get('/api/extract/stream', async (req, res) => {
    const rawInput = String(req.query.url || '').trim();
    const movidyUrlParam = String(req.query.movidyUrl || '').trim();
    const gnulaUrlParam = String(req.query.gnulaUrl || '').trim();
    const vestUrlParam = String(req.query.vestUrl || '').trim();
    const resolverType = String(req.query.resolverType || '').trim();
    const preferLang = String(req.query.preferLang || req.query.lang || 'ES').toUpperCase();
    const titleHint = String(req.query.title || '').trim();
    const origTitleHint = String(req.query.origTitle || '').trim();
    const rawYearParam = String(req.query.year || '').trim();
    const yearParam = /^(?:19|20)\d{2}$/.test(rawYearParam) ? rawYearParam : '';
    const mediaTypeParam = String(req.query.mediaType || req.query.type || '').toLowerCase();
    const tmdbIdParam = String(req.query.tmdbId || '').replace(/\D/g, '');
    const seasonParam = parseInt(String(req.query.season || '0'), 10) || undefined;
    const episodeParam = parseInt(String(req.query.episode || '0'), 10) || undefined;
    const episodeTitleHint = String(req.query.episodeTitle || '').trim();
    const isSandboxedFrame = String(req.query.sandboxed || '').trim() === '1';
    const forceExtract = String(req.query.force || req.query.forceSpanish || '') === '1';

    if (!rawInput && !movidyUrlParam && !gnulaUrlParam && !vestUrlParam && !titleHint && !tmdbIdParam) {
      return res.status(400).json({ success: false, error: 'Falta el enlace o título del contenido.' });
    }

    const cacheKey = `v3|${mediaTypeParam}|${tmdbIdParam}|${yearParam}|${seasonParam || ''}|${episodeParam || ''}|${resolverType}|${preferLang}|${isSandboxedFrame ? 'sb1' : 'sb0'}|${rawInput}|${movidyUrlParam}|${gnulaUrlParam}|${vestUrlParam}|${titleHint}`;
    const cached = !forceExtract ? extractionCache.get(cacheKey) : undefined;
    if (cached && cached.expiresAt > Date.now()) {
      return res.json(formatResp(req, cached));
    }

    try {
      // CASE 0: Live Spanish TDT Channel (`tdt_hls`)
      if (resolverType === 'tdt_hls' && rawInput) {
        const strippedCheckUrl = rawInput.replace(/[?&]profile=(hd|fast)\b/gi, '');
        const cleanCheckUrl = await maybeSignEasyBroadcastUrl(strippedCheckUrl);
        const knownReferer = resolveKnownUpstreamReferer(cleanCheckUrl);
        const isCnStream = isChineseIptvStream(cleanCheckUrl);
        const checkHeaders: Record<string, string> = {
          'User-Agent': getPreferredUpstreamUa(cleanCheckUrl),
          Accept: '*/*',
        };
        if (knownReferer) {
          checkHeaders['Referer'] = knownReferer;
          try {
            checkHeaders['Origin'] = new URL(knownReferer).origin;
          } catch {
            // ignore
          }
        }
        let isAlive = false;
        try {
          const chk = await fetch(cleanCheckUrl, {
            headers: checkHeaders,
            signal: AbortSignal.timeout(4000),
          });
          if (chk.ok) {
            const txt = await chk.text();
            isAlive = txt.includes('#EXTM3U') && !/nosignal/i.test(txt);
          }
        } catch {
          // fallback to curl below
        }
        if (!isAlive) {
          const fb = await curlGetText(cleanCheckUrl, checkHeaders, isCnStream ? 6 : 5, isCnStream).catch(() => ({
            text: '',
          }));
          isAlive = Boolean(fb.text && fb.text.includes('#EXTM3U') && !/nosignal/i.test(fb.text));
        }
        if (!isAlive && isCnStream) {
          await new Promise((r) => setTimeout(r, 250));
          const fb2 = await curlGetText(cleanCheckUrl, checkHeaders, 6, true).catch(() => ({
            text: '',
          }));
          isAlive = Boolean(fb2.text && fb2.text.includes('#EXTM3U') && !/nosignal/i.test(fb2.text));
        }

        if (!isAlive) {
          return res.status(404).json({
            success: false,
            error: 'Esta señal TDT está temporalmente sin emisión. Prueba la señal alternativa.',
          });
        }

        const originRef = knownReferer || new URL(cleanCheckUrl).origin + '/';
        const isDirectBrowserCorsPublicCdn =
          /^https:\/\/([^/]*\.)?(rtvelivestream\.rtve\.es|3catdirectes\.cat|eitb\.eus)\//i.test(
            cleanCheckUrl
          );
        const finalStreamUrl = isDirectBrowserCorsPublicCdn
          ? cleanCheckUrl
          : buildHlsProxyUrl(cleanCheckUrl, originRef, isDvbHeadendStream(cleanCheckUrl));

        const resolvedChLang = isCnStream ? 'ZH' : 'ES';
        const result: ExtractedStreamResult = {
          success: true,
          mode: 'hls',
          streamUrl: finalStreamUrl,
          rawStreamUrl: cleanCheckUrl,
          referer: originRef,
          title: titleHint || (isCnStream ? 'Fútbol China en Directo (中文)' : 'TV España en Directo'),
          requestedLang: resolvedChLang,
          resolvedLang: resolvedChLang,
          expiresAt: Date.now() + 4 * 60 * 1000,
        };
        extractionCache.set(cacheKey, result);
        return res.json(formatResp(req, result));
      }

      // CASE 1A-0: Already resolved direct_hls track switch
      if (resolverType === 'direct_hls' && rawInput) {
        const streamUrl =
          rawInput.startsWith('/api/') ? rawInput : buildHlsProxyUrl(rawInput, new URL(rawInput).origin + '/');
        const result: ExtractedStreamResult = {
          success: true,
          mode: 'hls',
          streamUrl,
          rawStreamUrl: rawInput,
          requestedLang: preferLang,
          resolvedLang: preferLang,
          expiresAt: Date.now() + 15 * 60 * 1000,
        };
        extractionCache.set(cacheKey, result);
        return res.json(formatResp(req, result));
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
        return res.json(formatResp(req, result));
      }

      // CASE 1A-2: Moe / Embed Sniff track switch
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
        return res.json(formatResp(req, result));
      }

      // CASE 1B: Direct Movidy base64/embed track
      if (
        (resolverType === 'movidy_embed' || rawInput.includes('nupload.')) &&
        !isMovidyVerUrl(rawInput)
      ) {
        const resolvedMv = await resolveMovidyEmbedTrack(rawInput);
        if (resolvedMv?.mode === 'hls') {
          const result: ExtractedStreamResult = {
            success: true,
            mode: 'hls',
            streamUrl: resolvedMv.proxyUrl,
            rawStreamUrl: resolvedMv.rawM3u8,
            requestedLang: preferLang,
            resolvedLang: preferLang,
            expiresAt: Date.now() + 15 * 60 * 1000,
          };
          extractionCache.set(cacheKey, result);
          return res.json(formatResp(req, result));
        }
        if (resolvedMv?.mode === 'embed') {
          const result: ExtractedStreamResult = {
            success: true,
            mode: 'embed',
            streamUrl: resolvedMv.embedUrl,
            rawStreamUrl: resolvedMv.embedUrl,
            requestedLang: preferLang,
            resolvedLang: preferLang,
            expiresAt: Date.now() + 20 * 60 * 1000,
          };
          extractionCache.set(cacheKey, result);
          return res.json(formatResp(req, result));
        }
        return res.status(404).json({
          success: false,
          error: 'El servidor de esta pista Movidy no está activo ahora mismo.',
        });
      }

      // CASE 1B-VEST: Direct Vest/Groot track switch
      if (resolverType === 'vest_hls' && rawInput) {
        try {
          const originRef = new URL(rawInput).origin + '/';
          const result: ExtractedStreamResult = {
            success: true,
            mode: 'hls',
            streamUrl: buildHlsProxyUrl(rawInput, originRef),
            rawStreamUrl: rawInput,
            referer: originRef,
            requestedLang: preferLang,
            resolvedLang: preferLang,
            expiresAt: Date.now() + 15 * 60 * 1000,
          };
          extractionCache.set(cacheKey, result);
          return res.json(formatResp(req, result));
        } catch {
          return res.status(404).json({
            success: false,
            error: 'La pista seleccionada no está activa.',
          });
        }
      }

      // CASE 1C: Verified Web Embed Player track switch (`web_embed`)
      if (resolverType === 'web_embed' && rawInput) {
        const fullEmbedUrl = /^https?:\/\//i.test(rawInput) ? rawInput : `https://${rawInput}`;
        const isCloudflareDirectEmbed =
          /(?:^|\.)(voe\.sx|voe\.bar|hglink\.to|streamwish\.[a-z]+|ok\.ru|byse\.[a-z]+|filelions\.[a-z]+)/i.test(
            fullEmbedUrl
          );
        const isHtmlProxyTarget =
          /(^|\.)(vidsrc\.buzz|videm\.buzz|2embed\.cc|www\.2embed\.cc|vidfast\.[a-z.]+)/i.test(
            fullEmbedUrl
          ) ||
          (isSandboxedFrame && !isCloudflareDirectEmbed);
        const safeEmbedUrl = isHtmlProxyTarget
          ? `/api/embed-proxy?url=${encodeURIComponent(fullEmbedUrl)}`
          : fullEmbedUrl;
        const result: ExtractedStreamResult = {
          success: true,
          mode: 'embed',
          streamUrl: safeEmbedUrl,
          rawStreamUrl: fullEmbedUrl,
          requestedLang: preferLang,
          resolvedLang: preferLang,
          expiresAt: Date.now() + 30 * 60 * 1000,
        };
        extractionCache.set(cacheKey, result);
        return res.json(formatResp(req, result));
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
        return res.json(formatResp(req, result));
      }

      // CASE 3: Direct .m3u8 or .mp4 URL
      if (/^\/api\/vod-manifest\//i.test(rawInput)) {
        const result: ExtractedStreamResult = {
          success: true,
          mode: 'hls',
          streamUrl: rawInput,
          rawStreamUrl: rawInput,
          expiresAt: Date.now() + 15 * 60 * 1000,
        };
        extractionCache.set(cacheKey, result);
        return res.json(formatResp(req, result));
      }
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
        return res.json(formatResp(req, result));
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
        return res.json(formatResp(req, result));
      }

      // CASE 4: UNIFIED MOVIE & TV SERIES MULTI-ENGINE
      const bingetrixTvMatch = rawInput.match(/bingetrix\.[a-z]+\/(?:watch\/)?tv\/(\d+)\/(\d+)\/(\d+)/i);
      const bingetrixMovieMatch = rawInput.match(/bingetrix\.[a-z]+\/(?:watch|movie)\/(\d+)/i);
      const externalEmbedTvMatch =
        rawInput.match(/(?:vidfast|vidlink|vidsrc|videm|vidrock|vidnest|vsembed)\.[a-z.]+\/(?:v2\/)?(?:embed\/)?tv\/(tt\d+|\d+)\/(\d+)[/-](\d+)/i) ||
        rawInput.match(/2embed\.[a-z]+\/(?:embedtv|tv)\/(tt\d+|\d+)(?:&s=|\/)(\d+)(?:&e=|\/)(\d+)/i) ||
        rawInput.match(/[?&]tmdb=(\d+).*?[?&]season=(\d+).*?[?&]episode=(\d+)/i);
      const externalEmbedMovieMatch =
        !externalEmbedTvMatch
          ? rawInput.match(/(?:vidfast|vidlink|vidsrc|videm|vidrock|vidnest|vsembed|2embed)\.[a-z.]+\/(?:v2\/)?(?:embed\/)?(?:movie\/)?(tt\d+|\d+)/i) ||
            rawInput.match(/[?&]tmdb=(\d+)/i)
          : null;
      const isMovidyLink = isMovidyVerUrl(rawInput) || isMovidyVerUrl(movidyUrlParam);
      const isGnulaLink = isGnulaHdUrl(rawInput) || isGnulaHdUrl(gnulaUrlParam);
      const isVestLink = isVestMirrorUrl(rawInput) || isVestMirrorUrl(vestUrlParam);

      const isCatalogMediaRequest =
        mediaTypeParam === 'movie' ||
        mediaTypeParam === 'tv' ||
        Boolean(tmdbIdParam) ||
        Boolean(bingetrixTvMatch) ||
        Boolean(bingetrixMovieMatch) ||
        Boolean(externalEmbedTvMatch) ||
        Boolean(externalEmbedMovieMatch) ||
        isMovidyLink ||
        isGnulaLink ||
        isVestLink ||
        resolverType === 'bingetrix_en' ||
        (!rawInput && Boolean(titleHint));

      if (isCatalogMediaRequest && resolverType !== 'sports_channel') {
        let effectiveMediaType: 'movie' | 'tv' =
          mediaTypeParam === 'tv' || Boolean(bingetrixTvMatch) || Boolean(externalEmbedTvMatch)
            ? 'tv'
            : 'movie';

        let effectiveSeason = bingetrixTvMatch
          ? parseInt(bingetrixTvMatch[2], 10)
          : externalEmbedTvMatch
          ? parseInt(externalEmbedTvMatch[2], 10)
          : seasonParam || 1;
        let effectiveEpisode = bingetrixTvMatch
          ? parseInt(bingetrixTvMatch[3], 10)
          : externalEmbedTvMatch
          ? parseInt(externalEmbedTvMatch[3], 10)
          : episodeParam || 1;

        let resolvedTmdbId: string | number | null =
          tmdbIdParam ||
          (bingetrixTvMatch ? bingetrixTvMatch[1] : null) ||
          (bingetrixMovieMatch ? bingetrixMovieMatch[1] : null) ||
          (externalEmbedTvMatch ? externalEmbedTvMatch[1] : null) ||
          (externalEmbedMovieMatch ? externalEmbedMovieMatch[1] : null);

        if (resolvedTmdbId && /^tt\d+$/i.test(String(resolvedTmdbId))) {
          try {
            const findRes = await fetch(
              `https://api.themoviedb.org/3/find/${encodeURIComponent(
                String(resolvedTmdbId)
              )}?api_key=${TMDB_API_KEY}&external_source=imdb_id`,
              { signal: AbortSignal.timeout(3500) }
            );
            if (findRes.ok) {
              const findJson: any = await findRes.json();
              const hit =
                effectiveMediaType === 'tv'
                  ? findJson?.tv_results?.[0] || findJson?.movie_results?.[0]
                  : findJson?.movie_results?.[0] || findJson?.tv_results?.[0];
              if (hit?.id) {
                resolvedTmdbId = hit.id;
              }
            }
          } catch {
            // keep original id fallback
          }
        }

        let hasExplicitMovidyUrl =
          isMovidyVerUrl(movidyUrlParam) || isMovidyVerUrl(rawInput);
        let effectiveMovidyUrl = isMovidyVerUrl(movidyUrlParam)
          ? normalizeMovidyUrl(movidyUrlParam)
          : isMovidyVerUrl(rawInput)
          ? normalizeMovidyUrl(rawInput)
          : '';

        let hasExplicitGnulaUrl =
          isGnulaHdUrl(gnulaUrlParam) || isGnulaHdUrl(rawInput);
        let effectiveGnulaUrl = isGnulaHdUrl(gnulaUrlParam)
          ? normalizeGnulaUrl(gnulaUrlParam)
          : isGnulaHdUrl(rawInput)
          ? normalizeGnulaUrl(rawInput)
          : '';

        const effectiveVestUrl = isVestMirrorUrl(vestUrlParam)
          ? vestUrlParam
          : isVestMirrorUrl(rawInput)
          ? rawInput
          : '';

        let extractedMovidyMeta: MovidyPageMetadata | null = null;
        let extractedMovidyCleanTitle = '';
        let extractedMovidyYear = '';
        let extractedGnulaMeta: GnulaPageMetadata | null = null;
        let extractedGnulaCleanTitle = '';
        let extractedGnulaYear = '';
        let extractedVestDetail: VestParsedDetail | null = null;
        let tmdbVerifiedYear = '';
        let tmdbDirector = '';
        let tmdbRuntimeMin = 0;
        let tmdbImdbId: string | null = null;
        const tmdbAltTitles: string[] = [];

        await Promise.all([
          (async () => {
            if (!effectiveMovidyUrl) return;
            extractedMovidyMeta = await fetchMovidyPageMetadata(effectiveMovidyUrl);
            if (extractedMovidyMeta) {
              if (!mediaTypeParam && extractedMovidyMeta.isTvShow) {
                effectiveMediaType = 'tv';
              }
              extractedMovidyCleanTitle = extractedMovidyMeta.cleanTitle;
              extractedMovidyYear = extractedMovidyMeta.year;
            }
          })(),
          (async () => {
            if (!effectiveGnulaUrl) return;
            extractedGnulaMeta = await fetchGnulaPageMetadata(effectiveGnulaUrl);
            if (extractedGnulaMeta) {
              if (!mediaTypeParam && extractedGnulaMeta.isTvShow) {
                effectiveMediaType = 'tv';
              }
              extractedGnulaCleanTitle = extractedGnulaMeta.cleanTitle;
              extractedGnulaYear = extractedGnulaMeta.year;
            }
          })(),
        ]);

        if (effectiveVestUrl) {
          extractedVestDetail = await fetchVestDetailPage(
            effectiveVestUrl,
            episodeParam && episodeParam > 0 ? episodeParam : undefined
          );
          if (extractedVestDetail) {
            if (!mediaTypeParam) {
              effectiveMediaType = extractedVestDetail.mediaType;
            }
            if (!episodeParam && extractedVestDetail.currentEpisodeNumber > 0) {
              effectiveEpisode = extractedVestDetail.currentEpisodeNumber;
            }
            if (!extractedMovidyCleanTitle) {
              extractedMovidyCleanTitle = extractedVestDetail.cleanTitle;
            }
            const vestSeed = findVestSeedForMedia({
              titleHints: [extractedVestDetail.cleanTitle],
            });
            if (!resolvedTmdbId && vestSeed?.tmdbId) {
              resolvedTmdbId = vestSeed.tmdbId;
            }
          }
        }

        if (!resolvedTmdbId && (titleHint || origTitleHint)) {
          for (const qTitle of [titleHint, origTitleHint].filter(Boolean)) {
            resolvedTmdbId = await resolveTmdbIdByTitle(
              qTitle,
              effectiveMediaType,
              extractedMovidyYear || extractedGnulaYear || yearParam || undefined
            );
            if (resolvedTmdbId) break;
          }
        }

        if (!resolvedTmdbId && (extractedMovidyCleanTitle || extractedGnulaCleanTitle)) {
          const pageTitle = extractedMovidyCleanTitle || extractedGnulaCleanTitle;
          const pageYear = extractedMovidyYear || extractedGnulaYear;
          if (pageYear) {
            resolvedTmdbId = await resolveTmdbIdByTitle(
              pageTitle,
              effectiveMediaType,
              pageYear
            );
          }
        }

        if (!resolvedTmdbId && effectiveMovidyUrl && extractedMovidyYear) {
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
              extractedMovidyYear
            );
          }
        }

        let tmdbResolvedTitle = '';
        if (resolvedTmdbId) {
          try {
            const tmJson = await fetchTmdbJson<any>(
              `/${effectiveMediaType}/${resolvedTmdbId}`,
              {
                language: 'es-ES',
                append_to_response: 'credits,translations,alternative_titles,external_ids',
              },
              15 * 60 * 1000
            ).catch(() => null);
            if (tmJson) {
              const esTitle = String(tmJson?.title || tmJson?.name || '').trim();
              const origTitle = String(tmJson?.original_title || tmJson?.original_name || '').trim();
              tmdbResolvedTitle = esTitle || origTitle;
              tmdbVerifiedYear = String(tmJson?.release_date || tmJson?.first_air_date || '').split('-')[0] || '';
              tmdbImdbId = tmJson?.imdb_id || tmJson?.external_ids?.imdb_id || null;
              if (effectiveMediaType === 'movie') {
                const crew: any[] = Array.isArray(tmJson?.credits?.crew) ? tmJson.credits.crew : [];
                tmdbDirector = String(crew.find((c) => c?.job === 'Director')?.name || '').trim();
                tmdbRuntimeMin = Number(tmJson?.runtime || 0) || 0;
              }
              for (const hint of extractLocalizedTmdbTitleHints(tmJson)) {
                if (hint && !tmdbAltTitles.includes(hint)) tmdbAltTitles.push(hint);
              }

              if (effectiveMovidyUrl && extractedMovidyMeta) {
                const mvCheck = verifyMovidyMetaMatch(extractedMovidyMeta, {
                  titleHints: [titleHint, ...tmdbAltTitles].filter(Boolean),
                  expectedYear: tmdbVerifiedYear || undefined,
                  expectedDirector: tmdbDirector || undefined,
                  expectedRuntimeMin: tmdbRuntimeMin || undefined,
                  expectedMediaType: effectiveMediaType,
                });
                if (!mvCheck.ok) {
                  effectiveMovidyUrl = '';
                  hasExplicitMovidyUrl = false;
                }
              }
              if (effectiveGnulaUrl && extractedGnulaMeta) {
                const gnCheck = verifyGnulaMetaMatch(extractedGnulaMeta, {
                  titleHints: [titleHint, ...tmdbAltTitles].filter(Boolean),
                  expectedYear: tmdbVerifiedYear || undefined,
                  expectedDirector: tmdbDirector || undefined,
                  expectedRuntimeMin: tmdbRuntimeMin || undefined,
                  expectedMediaType: effectiveMediaType,
                });
                if (!gnCheck.ok) {
                  effectiveGnulaUrl = '';
                  hasExplicitGnulaUrl = false;
                }
              }
            }
          } catch {
            // ignore
          }
        }

        const rawHints = [
          titleHint,
          origTitleHint,
          ...tmdbAltTitles,
          extractedMovidyCleanTitle,
          extractedGnulaCleanTitle,
          tmdbResolvedTitle,
        ].filter(Boolean);
        const expandedHints: string[] = [];
        for (const h of rawHints) {
          expandedHints.push(h);
          for (const v of generateSpanishTitleHints(h)) {
            expandedHints.push(v);
          }
        }
        const combinedTitleHints = Array.from(new Set(expandedHints));
        const effectiveYearForExtract =
          tmdbVerifiedYear || extractedMovidyYear || extractedGnulaYear || yearParam || undefined;

        const shouldQueryVest =
          Boolean(effectiveVestUrl) ||
          Boolean(
            findVestSeedForMedia({
              tmdbId: resolvedTmdbId,
              mediaType: effectiveMediaType,
              yearHint: effectiveYearForExtract,
              titleHints: combinedTitleHints,
              preferLang,
              season: effectiveSeason,
              episode: effectiveEpisode,
            })
          );

        const resolveAndExtractMovidy = async (): Promise<TrackRecord[]> => {
          try {
            let mvUrl = effectiveMovidyUrl;
            if (!mvUrl && combinedTitleHints.length > 0) {
              mvUrl =
                (await findMovidyUrlByTitle(combinedTitleHints[0], effectiveYearForExtract, {
                  expectedDirector: effectiveMediaType === 'movie' ? (tmdbDirector || undefined) : undefined,
                  expectedRuntimeMin: effectiveMediaType === 'movie' ? (tmdbRuntimeMin || undefined) : undefined,
                  titleHints: combinedTitleHints,
                  expectedMediaType: effectiveMediaType,
                })) || '';
            }
            if (!mvUrl) return [];
            return await extractMovidyPageTracks(mvUrl, {
              expectedYear: effectiveYearForExtract,
              requireMovieOnly: effectiveMediaType === 'movie',
              expectedTitleHints:
                resolvedTmdbId || combinedTitleHints.length > 0 ? combinedTitleHints : undefined,
              expectedDirector: effectiveMediaType === 'movie' ? (tmdbDirector || undefined) : undefined,
              expectedRuntimeMin: effectiveMediaType === 'movie' ? (tmdbRuntimeMin || undefined) : undefined,
            });
          } catch {
            return [];
          }
        };

        const resolveAndExtractGnula = async (): Promise<TrackRecord[]> => {
          try {
            let gnUrl = effectiveGnulaUrl;
            if (!gnUrl && combinedTitleHints.length > 0) {
              gnUrl =
                (await findGnulaHdUrlByTitle(combinedTitleHints, effectiveYearForExtract, {
                  expectedDirector: effectiveMediaType === 'movie' ? (tmdbDirector || undefined) : undefined,
                  expectedRuntimeMin: effectiveMediaType === 'movie' ? (tmdbRuntimeMin || undefined) : undefined,
                  titleHints: combinedTitleHints,
                  expectedMediaType: effectiveMediaType,
                })) || '';
            }
            if (!gnUrl) return [];
            return await extractGnulaHdTracks(gnUrl, {
              expectedYear: effectiveYearForExtract,
              expectedTitleHints:
                resolvedTmdbId || combinedTitleHints.length > 0 ? combinedTitleHints : undefined,
              expectedDirector: effectiveMediaType === 'movie' ? (tmdbDirector || undefined) : undefined,
              expectedRuntimeMin: effectiveMediaType === 'movie' ? (tmdbRuntimeMin || undefined) : undefined,
              mediaType: effectiveMediaType,
              season: effectiveSeason,
              episode: effectiveEpisode,
            });
          } catch {
            return [];
          }
        };

        const withExtractTimeout = <T>(p: Promise<T>, ms: number, fallback: T): Promise<T> =>
          Promise.race([
            p.catch(() => fallback),
            new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
          ]);

        const [
          movidyTracks,
          gnulaTracks,
          esTracks,
          vidRockTracks,
          bingetrixEnTracks,
          twoEmbedEnTracks,
          vidBuzzHlsTracks,
          vestExtracted,
        ] = await Promise.all([
          withExtractTimeout(resolveAndExtractMovidy(), 6800, [] as TrackRecord[]),
          withExtractTimeout(resolveAndExtractGnula(), 7000, [] as TrackRecord[]),
          resolvedTmdbId || combinedTitleHints.length > 0
            ? withExtractTimeout(
                extractEmbed69SpanishTracks({
                  tmdbId: resolvedTmdbId || undefined,
                  imdbId: tmdbImdbId,
                  mediaType: effectiveMediaType,
                  season: effectiveSeason,
                  episode: effectiveEpisode,
                  titleHints: combinedTitleHints,
                  yearHint: effectiveYearForExtract,
                  directorHint: tmdbDirector || undefined,
                  runtimeMinHint: tmdbRuntimeMin || undefined,
                  force: forceExtract,
                  skipGnula: true,
                }),
                6800,
                [] as TrackRecord[]
              )
            : Promise.resolve([]),
          resolvedTmdbId
            ? withExtractTimeout(
                extractVidRockHlsTracks({
                  tmdbId: resolvedTmdbId,
                  mediaType: effectiveMediaType,
                  season: effectiveSeason,
                  episode: effectiveEpisode,
                }),
                7200,
                [] as TrackRecord[]
              )
            : Promise.resolve([]),
          resolvedTmdbId
            ? withExtractTimeout(
                extractBingetrixEnglishTracks({
                  tmdbId: resolvedTmdbId,
                  mediaType: effectiveMediaType,
                  season: effectiveSeason,
                  episode: effectiveEpisode,
                }),
                4500,
                [] as TrackRecord[]
              )
            : Promise.resolve([]),
          resolvedTmdbId
            ? withExtractTimeout(
                extract2EmbedEnglishTracks({
                  tmdbId: resolvedTmdbId,
                  imdbId: tmdbImdbId,
                  mediaType: effectiveMediaType,
                  season: effectiveSeason,
                  episode: effectiveEpisode,
                }),
                7200,
                [] as TrackRecord[]
              )
            : Promise.resolve([]),
          resolvedTmdbId || tmdbImdbId
            ? withExtractTimeout(
                extractVidsrcBuzzHlsTracks({
                  tmdbId: resolvedTmdbId || undefined,
                  imdbId: tmdbImdbId,
                  mediaType: effectiveMediaType,
                  season: effectiveSeason,
                  episode: effectiveEpisode,
                }),
                7200,
                [] as TrackRecord[]
              )
            : Promise.resolve([]),
          shouldQueryVest
            ? withExtractTimeout(
                extractVestStreamsAndSubtitles({
                  vestUrl: effectiveVestUrl || undefined,
                  tmdbId: resolvedTmdbId,
                  mediaType: effectiveMediaType,
                  yearHint: effectiveYearForExtract,
                  season: effectiveSeason,
                  episode: effectiveEpisode,
                  preferLang,
                  titleHints: combinedTitleHints,
                  tmdbApiKey: TMDB_API_KEY,
                  buildHlsProxyUrl: (m3u8Url, referer) => buildHlsProxyUrl(m3u8Url, referer),
                }),
                6000,
                null
              )
            : Promise.resolve(null),
        ]);

        const enTracks: TrackRecord[] = [
          ...vidRockTracks,
          ...bingetrixEnTracks,
          ...twoEmbedEnTracks,
          ...vidBuzzHlsTracks,
        ];
        const vestTracks: TrackRecord[] = vestExtracted?.tracks || [];
        const vestSubtitles = vestExtracted?.subtitles || [];
        const vestDetailMeta = vestExtracted?.detail || extractedVestDetail;

        const allDiscovered: TrackRecord[] = isVestLink
          ? [...vestTracks, ...movidyTracks, ...gnulaTracks, ...enTracks, ...esTracks]
          : !hasExplicitMovidyUrl && hasExplicitGnulaUrl
          ? [...gnulaTracks, ...movidyTracks, ...enTracks, ...esTracks, ...vestTracks]
          : [...movidyTracks, ...gnulaTracks, ...enTracks, ...esTracks, ...vestTracks];

        const { orderedTracks, getLangScore, sourcePriority, getTrackHealthScore } =
          deps.rankCandidateTracks({
            allDiscovered,
            preferLang,
            isVestLink,
            hasExplicitMovidyUrl,
            hasExplicitGnulaUrl,
            healthMap: channelHealthMonitor.getAllTrackStatuses(),
          });

        let primaryStreamUrl = '';
        let primaryMode: 'hls' | 'direct' | 'embed' = 'hls';
        let resolvedTrack: TrackRecord | null = null;
        const deadTrackIndices = new Set<number>();

        const tierScores = Array.from(
          new Set(orderedTracks.map((t) => getLangScore(t.lang)))
        ).sort((a, b) => a - b);

        for (const tierScore of tierScores) {
          const tierWebEmbedCandidates: { idx: number; track: TrackRecord; url: string }[] = [];

          for (let i = 0; i < orderedTracks.length; i++) {
            if (getLangScore(orderedTracks[i].lang) !== tierScore) continue;
            const candidate = orderedTracks[i];

            if (candidate.resolverType === 'web_embed') {
              if (candidate.sourceUrl) {
                tierWebEmbedCandidates.push({ idx: i, track: candidate, url: candidate.sourceUrl });
              }
              continue;
            }

            if (candidate.resolvedStreamUrl) {
              primaryStreamUrl = candidate.resolvedStreamUrl;
              primaryMode = candidate.resolverType === 'direct_mp4' ? 'direct' : 'hls';
              resolvedTrack = candidate;
              break;
            }

            if (candidate.resolverType === 'movidy_embed') {
              const resolvedMv = await resolveMovidyEmbedTrack(candidate.sourceUrl);
              if (resolvedMv?.mode === 'hls') {
                orderedTracks[i] = { ...candidate, resolvedStreamUrl: resolvedMv.proxyUrl };
                primaryStreamUrl = resolvedMv.proxyUrl;
                primaryMode = 'hls';
                resolvedTrack = orderedTracks[i];
                break;
              } else if (resolvedMv?.mode === 'embed') {
                orderedTracks[i] = {
                  ...candidate,
                  resolverType: 'web_embed',
                  sourceUrl: resolvedMv.embedUrl,
                };
                tierWebEmbedCandidates.push({
                  idx: i,
                  track: orderedTracks[i],
                  url: resolvedMv.embedUrl,
                });
              } else {
                deadTrackIndices.add(i);
              }
            } else if (candidate.resolverType === 'vidhide_hls') {
              const unpacked = await withExtractTimeout(
                unpackVidhideToHls(candidate.sourceUrl),
                4200,
                null
              );
              if (unpacked) {
                orderedTracks[i] = { ...candidate, resolvedStreamUrl: unpacked.proxyUrl };
                primaryStreamUrl = unpacked.proxyUrl;
                primaryMode = 'hls';
                resolvedTrack = orderedTracks[i];
                break;
              } else {
                deadTrackIndices.add(i);
              }
            } else if (candidate.resolverType === 'embed_sniff') {
              const sniffed = await withExtractTimeout(
                sniffStreamWithHeadless(candidate.sourceUrl),
                5500,
                null
              );
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

          if (primaryStreamUrl) break;

          if (tierWebEmbedCandidates.length > 0) {
            tierWebEmbedCandidates.sort(
              (a, b) =>
                sourcePriority(a.track) - sourcePriority(b.track) ||
                getTrackHealthScore(a.track) - getTrackHealthScore(b.track)
            );
            for (const cand of tierWebEmbedCandidates) {
              const alive = await verifyWebEmbedCandidateAlive(cand.track, cand.url);
              if (!alive) {
                deadTrackIndices.add(cand.idx);
                continue;
              }
              const proxiedWeb = toProxiedEmbedUrl(cand.url, isSandboxedFrame);
              orderedTracks[cand.idx] = {
                ...cand.track,
                resolvedStreamUrl: proxiedWeb,
              };
              primaryStreamUrl = proxiedWeb;
              primaryMode = 'embed';
              resolvedTrack = orderedTracks[cand.idx];
              break;
            }
          }

          if (primaryStreamUrl) break;
        }

        if (primaryStreamUrl) {
          const langsWithNativeTracks = new Set(
            orderedTracks
              .filter((tr, idx) => !deadTrackIndices.has(idx) && tr.resolverType !== 'web_embed')
              .map((tr) => String(tr.lang || '').toUpperCase())
          );
          const validTracks = orderedTracks.filter(
            (tr, idx) =>
              !deadTrackIndices.has(idx) &&
              (primaryMode === 'embed' ||
                tr.resolverType !== 'web_embed' ||
                !langsWithNativeTracks.has(String(tr.lang || '').toUpperCase()))
          );
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

          const baseCleanTitle = extractedMovidyCleanTitle || extractedGnulaCleanTitle || tmdbResolvedTitle;
          const displayTitle =
            titleHint ||
            (baseCleanTitle
              ? effectiveMediaType === 'tv'
                ? `${baseCleanTitle} · ${
                    vestDetailMeta && vestDetailMeta.currentEpisodeNumber > 1 && effectiveSeason === 1
                      ? `Ep. ${vestDetailMeta.currentEpisodeNumber}`
                      : `${effectiveSeason}x${String(effectiveEpisode).padStart(2, '0')}`
                  }`
                : baseCleanTitle
              : 'RiffanTV HD');

          let combinedSubtitles = vestSubtitles;
          if (combinedSubtitles.length === 0 && resolvedTmdbId) {
            combinedSubtitles = await fetchAndCacheSubtitles(
              String(resolvedTmdbId),
              effectiveMediaType === 'tv' ? effectiveSeason : 0,
              effectiveMediaType === 'tv' ? effectiveEpisode : 0,
              1800
            );
          }

          const cacheTtlMs =
            primaryMode === 'hls' && !languageFallbackUsed
              ? 8 * 60 * 1000
              : primaryMode === 'hls'
              ? 90 * 1000
              : 20 * 1000;
          const result: ExtractedStreamResult = {
            success: true,
            mode: primaryMode,
            streamUrl: primaryStreamUrl,
            title: displayTitle,
            poster: vestDetailMeta?.coverVerticalUrl
              ? `/api/img-proxy?url=${encodeURIComponent(vestDetailMeta.coverVerticalUrl)}`
              : undefined,
            backdrop: vestDetailMeta?.coverHorizontalUrl
              ? `/api/img-proxy?url=${encodeURIComponent(vestDetailMeta.coverHorizontalUrl)}`
              : undefined,
            tracks: validTracks,
            subtitles: combinedSubtitles.length > 0 ? combinedSubtitles : undefined,
            requestedLang: preferLang,
            resolvedLang,
            resolvedLabel,
            languageFallbackUsed,
            availableLanguages,
            expiresAt: Date.now() + cacheTtlMs,
          };
          extractionCache.set(cacheKey, result);
          return res.json(formatResp(req, result));
        }

        const fallbackBaseTitle =
          titleHint || extractedMovidyCleanTitle || extractedGnulaCleanTitle || tmdbResolvedTitle || '';
        const displayFallbackTitle =
          titleHint ||
          (fallbackBaseTitle
            ? effectiveMediaType === 'tv'
              ? `${fallbackBaseTitle} · ${effectiveSeason}x${String(
                  effectiveEpisode
                ).padStart(2, '0')}`
              : fallbackBaseTitle
            : 'RiffanTV HD');

        const [ytFallback, embedFallbackTracks] = await Promise.all([
          preferLang === 'ES' || !resolvedTmdbId
            ? searchYouTubeFullFallback({
                fallbackBaseTitle,
                episodeTitleHint,
                preferLang,
                effectiveMediaType,
                effectiveSeason,
                effectiveEpisode,
              }).catch(() => null)
            : Promise.resolve(null),
          buildWebEmbedTracks({
            resolvedTmdbId,
            effectiveMediaType,
            effectiveSeason,
            effectiveEpisode,
            rawInput,
            isSandboxedFrame,
          }),
        ]);

        const combinedFallbackTracks: TrackRecord[] =
          ytFallback && (preferLang === 'ES' || embedFallbackTracks.length === 0)
            ? [ytFallback.track, ...embedFallbackTracks]
            : embedFallbackTracks.length > 0
            ? [...embedFallbackTracks, ...(ytFallback ? [ytFallback.track] : [])]
            : ytFallback
            ? [ytFallback.track]
            : [];

        if (combinedFallbackTracks.length > 0) {
          const firstTrack = combinedFallbackTracks[0];
          const fallbackMode: ExtractedStreamResult['mode'] =
            firstTrack.resolverType === 'youtube' ? 'youtube' : 'embed';
          const resolvedLang = String(firstTrack.lang || 'EN').toUpperCase();
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
            resolvedLang,
            resolvedLabel: firstTrack.label,
            languageFallbackUsed: resolvedLang !== preferLang,
            availableLanguages: Array.from(
              new Set(combinedFallbackTracks.map((t) => String(t.lang || '').toUpperCase()))
            ),
            expiresAt: Date.now() + 30 * 1000,
          };
          extractionCache.set(cacheKey, fallbackResult);
          return res.json(formatResp(req, fallbackResult));
        }
      }

      // CASE 5: Live Sports Channel / External Web URL
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

        const isKnownDirectMirror = /footunder\.online|tilinhd\.|streamxhd\./i.test(fullTargetUrl);
        if (!directSports && resolverType === 'sports_channel' && isKnownDirectMirror) {
          return res.status(404).json({
            success: false,
            canUseCloudBrowser: false,
            error: 'Esta señal no está activa en este instante. Elige otra señal o canal.',
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
          return res.json(formatResp(req, result));
        }

        let canFrame = false;
        let canProxyInline = false;
        try {
          const probeController = new AbortController();
          const probeTimer = setTimeout(() => probeController.abort(), 3500);
          const probeRes = await fetch(fullTargetUrl, {
            headers: { 'User-Agent': CHROME_UA },
            signal: probeController.signal,
          });
          clearTimeout(probeTimer);
          const ct = String(probeRes.headers.get('content-type') || '').toLowerCase();
          const xfo = String(probeRes.headers.get('x-frame-options') || '').toLowerCase();
          const csp = String(probeRes.headers.get('content-security-policy') || '').toLowerCase();
          probeController.abort();
          const blockedByXfo = xfo.includes('deny') || xfo.includes('sameorigin');
          const blockedByCsp =
            csp.includes('frame-ancestors') &&
            !csp.includes('frame-ancestors *') &&
            !csp.includes('frame-ancestors https:');
          canFrame = probeRes.ok && !blockedByXfo && !blockedByCsp;
          canProxyInline = probeRes.ok && ct.includes('text/html');
        } catch {
          canFrame = false;
          canProxyInline = false;
        }

        const useInlineProxy =
          canProxyInline ||
          /(^|\.)(vidfast\.[a-z.]+|vidsrc\.[a-z.]+|videm\.buzz|2embed\.cc)/i.test(fullTargetUrl);
        const inlineEmbedUrl = useInlineProxy
          ? `/api/embed-proxy?url=${encodeURIComponent(fullTargetUrl)}`
          : fullTargetUrl;
        const playInline = canFrame || useInlineProxy;

        const extFallbackResult: ExtractedStreamResult = {
          success: true,
          mode: playInline ? 'embed' : 'cloud',
          streamUrl: playInline ? inlineEmbedUrl : fullTargetUrl,
          rawStreamUrl: fullTargetUrl,
          title: titleHint || 'Señal Web Directa',
          tracks: playInline
            ? [
                {
                  id: 'ext-web-embed-1',
                  label: 'Reproductor Web Integrado',
                  lang: preferLang || 'ES',
                  sourceUrl: fullTargetUrl,
                  resolverType: 'web_embed',
                  resolvedStreamUrl: inlineEmbedUrl,
                },
              ]
            : [],
          expiresAt: Date.now() + 2 * 60 * 1000,
        };
        return res.json(formatResp(req, extFallbackResult));
      }

      return res.status(404).json({
        success: false,
        canUseCloudBrowser: true,
        error: 'No se encontró ninguna señal activa para este enlace.',
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
}

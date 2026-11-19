import type express from 'express';
import { ENV } from '../../config/env.ts';
import { fetchAndCacheSubtitles } from '../detailsAndSubtitles.ts';
import {
  buildHlsProxyUrl,
  buildTsProxyUrl,
  type ExtractedStreamResult,
  type TrackRecord,
} from '../../extractors/httpHelpers.ts';
import {
  extractEmbed69SpanishTracks,
  unpackVidhideToHls,
} from '../../extractors/vidhideEmbed69.ts';
import {
  extract2EmbedEnglishTracks,
  extractBingetrixEnglishTracks,
  extractGhostflixVidboltTracks,
  extractMovidyPageTracks,
  extractVidRockHlsTracks,
  extractVidsrcBuzzHlsTracks,
  findMovidyUrlByTitle,
  isMovidyVerUrl,
  resolveMovidyEmbedTrack,
} from '../../extractors/bingetrixMovidy.ts';
import {
  extractGnulaHdTracks,
  findGnulaHdUrlByTitle,
  isGnulaHdUrl,
} from '../../extractors/gnulaHdExtractor.ts';
import { sniffStreamWithHeadless } from '../../extractors/sportsExtractor.ts';
import {
  extractVestStreamsAndSubtitles,
  findVestSeedForMedia,
  isVestMirrorUrl,
} from '../../services/vestMirrorService.ts';
import { channelHealthMonitor } from '../../services/channelHealthMonitor.ts';
import {
  toProxiedEmbedUrl,
  verifyWebEmbedCandidateAlive,
} from '../../services/streamExtractFallback.ts';
import {
  buildFallbackCatalogResult,
  resolveCatalogMediaMetadata,
} from './catalogMediaMetadataAndFallback.ts';
import type { RankCandidateTracksFn } from '../streamExtractRoutes.ts';

const TMDB_API_KEY = ENV.tmdbApiKey;

export interface CatalogMediaExtractParams {
  rawInput: string;
  movidyUrlParam: string;
  gnulaUrlParam: string;
  vestUrlParam: string;
  resolverType: string;
  preferLang: string;
  titleHint: string;
  origTitleHint: string;
  yearParam: string;
  mediaTypeParam: string;
  tmdbIdParam: string;
  seasonParam?: number;
  episodeParam?: number;
  episodeTitleHint: string;
  isSandboxedFrame: boolean;
  forceExtract: boolean;
  cacheKey: string;
  rankCandidateTracks: RankCandidateTracksFn;
  setCache: (key: string, val: ExtractedStreamResult) => void;
  sendOk: (payload: ExtractedStreamResult) => express.Response;
}

export async function handleCatalogMediaExtract(
  params: CatalogMediaExtractParams
): Promise<express.Response | null> {
  const {
    rawInput,
    movidyUrlParam,
    gnulaUrlParam,
    vestUrlParam,
    resolverType,
    preferLang,
    titleHint,
    origTitleHint,
    yearParam,
    mediaTypeParam,
    tmdbIdParam,
    seasonParam,
    episodeParam,
    episodeTitleHint,
    isSandboxedFrame,
    forceExtract,
    cacheKey,
    rankCandidateTracks,
    setCache,
    sendOk,
  } = params;

  const bingetrixTvMatch = rawInput.match(/bingetrix\.[a-z]+\/(?:watch\/)?tv\/(\d+)\/(\d+)\/(\d+)/i);
  const bingetrixMovieMatch = rawInput.match(/bingetrix\.[a-z]+\/(?:watch|movie)\/(\d+)/i);
  const externalEmbedTvMatch =
    rawInput.match(/(?:vidfast|vidlink|vidsrc|videm|vidrock|vidnest|vsembed|ghostflix|vidbolt)\.[a-z.]+\/(?:v2\/)?(?:embed\/)?tv\/(tt\d+|\d+)\/(\d+)[/-](\d+)/i) ||
    rawInput.match(/2embed\.[a-z]+\/(?:embedtv|tv)\/(tt\d+|\d+)(?:&s=|\/)(\d+)(?:&e=|\/)(\d+)/i) ||
    rawInput.match(/[?&]tmdb=(\d+).*?[?&]season=(\d+).*?[?&]episode=(\d+)/i);
  const externalEmbedMovieMatch = !externalEmbedTvMatch
    ? rawInput.match(/(?:vidfast|vidlink|vidsrc|videm|vidrock|vidnest|vsembed|2embed|ghostflix|vidbolt)\.[a-z.]+\/(?:v2\/)?(?:embed\/)?(?:(?:movies?|watch)\/)?(tt\d+|\d+)/i) ||
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

  if (!isCatalogMediaRequest || resolverType === 'sports_channel') {
    return null;
  }

  const {
    effectiveMediaType,
    effectiveSeason,
    effectiveEpisode,
    resolvedTmdbId,
    hasExplicitMovidyUrl,
    effectiveMovidyUrl,
    hasExplicitGnulaUrl,
    effectiveGnulaUrl,
    effectiveVestUrl,
    extractedMovidyCleanTitle,
    extractedGnulaCleanTitle,
    extractedVestDetail,
    tmdbDirector,
    tmdbRuntimeMin,
    tmdbImdbId,
    tmdbResolvedTitle,
    combinedTitleHints,
    effectiveYearForExtract,
    shouldQueryVest,
  } = await resolveCatalogMediaMetadata({
    rawInput,
    movidyUrlParam,
    gnulaUrlParam,
    vestUrlParam,
    preferLang,
    titleHint,
    origTitleHint,
    yearParam,
    mediaTypeParam,
    tmdbIdParam,
    seasonParam,
    episodeParam,
    tmdbApiKey: TMDB_API_KEY,
    bingetrixTvMatch,
    bingetrixMovieMatch,
    externalEmbedTvMatch,
    externalEmbedMovieMatch,
  });

  const resolveAndExtractMovidy = async (): Promise<TrackRecord[]> => {
    try {
      let mvUrl = effectiveMovidyUrl;
      if (!mvUrl && combinedTitleHints.length > 0) {
        mvUrl =
          (await findMovidyUrlByTitle(combinedTitleHints[0], effectiveYearForExtract, {
            expectedDirector: effectiveMediaType === 'movie' ? tmdbDirector || undefined : undefined,
            expectedRuntimeMin: effectiveMediaType === 'movie' ? tmdbRuntimeMin || undefined : undefined,
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
        expectedDirector: effectiveMediaType === 'movie' ? tmdbDirector || undefined : undefined,
        expectedRuntimeMin: effectiveMediaType === 'movie' ? tmdbRuntimeMin || undefined : undefined,
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
            expectedDirector: effectiveMediaType === 'movie' ? tmdbDirector || undefined : undefined,
            expectedRuntimeMin: effectiveMediaType === 'movie' ? tmdbRuntimeMin || undefined : undefined,
            titleHints: combinedTitleHints,
            expectedMediaType: effectiveMediaType,
          })) || '';
      }
      if (!gnUrl) return [];
      return await extractGnulaHdTracks(gnUrl, {
        expectedYear: effectiveYearForExtract,
        expectedTitleHints:
          resolvedTmdbId || combinedTitleHints.length > 0 ? combinedTitleHints : undefined,
        expectedDirector: effectiveMediaType === 'movie' ? tmdbDirector || undefined : undefined,
        expectedRuntimeMin: effectiveMediaType === 'movie' ? tmdbRuntimeMin || undefined : undefined,
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
    ghostflixExtracted,
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
    resolvedTmdbId
      ? withExtractTimeout(
          extractGhostflixVidboltTracks({
            tmdbId: resolvedTmdbId,
            mediaType: effectiveMediaType,
            season: effectiveSeason,
            episode: effectiveEpisode,
            force: forceExtract,
          }),
          6500,
          { tracks: [] as TrackRecord[], subtitles: [], detectedLangs: [] }
        )
      : Promise.resolve({ tracks: [] as TrackRecord[], subtitles: [], detectedLangs: [] }),
  ]);

  const ghostflixTracks: TrackRecord[] = ghostflixExtracted?.tracks || [];
  const ghostflixSubtitles = ghostflixExtracted?.subtitles || [];
  const enTracks: TrackRecord[] = [
    ...ghostflixTracks,
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

  const { orderedTracks, getLangScore, sourcePriority, getTrackHealthScore } = rankCandidateTracks({
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

  const tierScores = Array.from(new Set(orderedTracks.map((t) => getLangScore(t.lang)))).sort(
    (a, b) => a - b
  );

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
        const unpacked = await withExtractTimeout(unpackVidhideToHls(candidate.sourceUrl), 4200, null);
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
        orderedTracks[cand.idx] = { ...cand.track, resolvedStreamUrl: proxiedWeb };
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

    let combinedSubtitles = [...vestSubtitles, ...ghostflixSubtitles];
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
    setCache(cacheKey, result);
    return sendOk(result);
  }

  const fallbackResult = await buildFallbackCatalogResult({
    titleHint,
    extractedMovidyCleanTitle,
    extractedGnulaCleanTitle,
    tmdbResolvedTitle,
    effectiveMediaType,
    effectiveSeason,
    effectiveEpisode,
    episodeTitleHint,
    preferLang,
    resolvedTmdbId,
    rawInput,
    isSandboxedFrame,
  });
  if (fallbackResult) {
    setCache(cacheKey, fallbackResult);
    return sendOk(fallbackResult);
  }

  return null;
}

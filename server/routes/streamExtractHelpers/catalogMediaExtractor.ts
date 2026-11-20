import type express from 'express';
import { ENV } from '../../config/env.ts';
import { fetchAndCacheSubtitles } from '../detailsAndSubtitles.ts';
import {
  buildHlsProxyUrl,
  buildTsProxyUrl,
  type ExtractedStreamResult,
  type TrackRecord,
} from '../../extractors/httpHelpers.ts';
import { extractClipboxDirectStreams } from '../../extractors/clipboxDirectExtractor.ts';
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
import { extractDailymotionSeriesTracks } from '../../extractors/dailymotionExtractor.ts';
import { extractArchiveOrgTracks } from '../../extractors/archiveOrgExtractor.ts';
import { extractSpanishSeriesTracks } from '../../extractors/spanishSeriesExtractor.ts';
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
  sendUnavailable?: (status: number, body: Record<string, any>) => express.Response;
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
    sendUnavailable,
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
    tmdbOriginalLanguage,
    episodeAirDate,
    resolvedEpisodeTitle,
    isUnreleasedEpisode,
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

  if (isUnreleasedEpisode) {
    if (sendUnavailable) {
      const [y, m, d] = episodeAirDate.split('-');
      const formattedDate = y && m && d ? `${d}/${m}/${y}` : episodeAirDate;
      return sendUnavailable(404, {
        success: false,
        unreleased: true,
        airDate: episodeAirDate,
        canUseCloudBrowser: false,
        error: `Este capítulo aún no se ha estrenado (estreno previsto: ${formattedDate}).`,
      });
    }
    return null;
  }

  const effectiveEpisodeTitleHint = resolvedEpisodeTitle || episodeTitleHint;

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

  const subtitlesPromise =
    resolvedTmdbId || titleHint
      ? fetchAndCacheSubtitles(
          String(resolvedTmdbId || ''),
          effectiveMediaType === 'tv' ? effectiveSeason : 0,
          effectiveMediaType === 'tv' ? effectiveEpisode : 0,
          2200,
          {
            title: tmdbResolvedTitle || titleHint || undefined,
            mediaType: effectiveMediaType,
          }
        ).catch(() => [] as any[])
      : Promise.resolve([] as any[]);

  const isSpanishNativePreferred = tmdbOriginalLanguage === 'es' && preferLang === 'ES';
  const prefersSpanishTier = preferLang === 'ES' || preferLang === 'LAT';
  const enTimeout = prefersSpanishTier ? 3800 : 6200;

  let movidyTracks: TrackRecord[] = [];
  let gnulaTracks: TrackRecord[] = [];
  let dailymotionTracks: TrackRecord[] = [];
  let archiveOrgTracks: TrackRecord[] = [];
  let spanishSeriesTracks: TrackRecord[] = [];
  let esTracks: TrackRecord[] = [];
  let vidRockTracks: TrackRecord[] = [];
  let bingetrixEnTracks: TrackRecord[] = [];
  let twoEmbedEnTracks: TrackRecord[] = [];
  let vidBuzzHlsTracks: TrackRecord[] = [];
  let clipboxDirectExtracted: { tracks: TrackRecord[]; subtitles: any[] } = {
    tracks: [],
    subtitles: [],
  };
  const vestExtractedHolder: {
    value: Awaited<ReturnType<typeof extractVestStreamsAndSubtitles>>;
  } = { value: null };
  let ghostflixExtracted: { tracks: TrackRecord[]; subtitles: any[]; detectedLangs: any[] } = {
    tracks: [],
    subtitles: [],
    detectedLangs: [],
  };

  let fastDirectEsReadyResolve: (() => void) | null = null;
  let fastDirectEsReadyFired = false;
  const fastDirectEsReadyPromise = new Promise<void>((resolve) => {
    fastDirectEsReadyResolve = resolve;
  });
  const signalFastDirectEsIfReady = (tracks: TrackRecord[]) => {
    if (
      !fastDirectEsReadyFired &&
      tracks.some(
        (t) =>
          String(t.lang || '').toUpperCase() === preferLang &&
          (t.resolverType === 'direct_hls' || t.resolverType === 'direct_mp4') &&
          Boolean(t.resolvedStreamUrl)
      )
    ) {
      fastDirectEsReadyFired = true;
      fastDirectEsReadyResolve?.();
    }
  };

  const movidyP = withExtractTimeout(resolveAndExtractMovidy(), 5800, [] as TrackRecord[]).then(
    (res) => {
      movidyTracks = res;
      signalFastDirectEsIfReady(res);
    }
  );
  const gnulaP = withExtractTimeout(resolveAndExtractGnula(), 6400, [] as TrackRecord[]).then(
    (res) => {
      gnulaTracks = res;
      signalFastDirectEsIfReady(res);
    }
  );
  const dmP =
    effectiveMediaType === 'tv' && combinedTitleHints.length > 0
      ? withExtractTimeout(
          extractDailymotionSeriesTracks({
            tmdbId: resolvedTmdbId,
            mediaType: effectiveMediaType,
            season: effectiveSeason,
            episode: effectiveEpisode,
            titleHints: combinedTitleHints,
            episodeTitleHint: effectiveEpisodeTitleHint,
          }),
          6500,
          [] as TrackRecord[]
        ).then((res) => {
          dailymotionTracks = res;
          signalFastDirectEsIfReady(res);
        })
      : Promise.resolve();
  const archiveP =
    effectiveMediaType === 'tv' &&
    combinedTitleHints.length > 0 &&
    (tmdbOriginalLanguage === 'es' || preferLang === 'ES' || String(resolvedTmdbId || '') === '35338')
      ? withExtractTimeout(
          extractArchiveOrgTracks({
            tmdbId: resolvedTmdbId,
            mediaType: effectiveMediaType,
            season: effectiveSeason,
            episode: effectiveEpisode,
            titleHints: combinedTitleHints,
            originalLanguage: tmdbOriginalLanguage,
          }),
          4500,
          [] as TrackRecord[]
        ).then((res) => {
          archiveOrgTracks = res;
          signalFastDirectEsIfReady(res);
        })
      : Promise.resolve();
  const spanishSeriesP =
    effectiveMediaType === 'tv' &&
    combinedTitleHints.length > 0 &&
    (tmdbOriginalLanguage === 'es' || preferLang === 'ES' || String(resolvedTmdbId || '') === '35338')
      ? withExtractTimeout(
          extractSpanishSeriesTracks({
            tmdbId: resolvedTmdbId,
            mediaType: effectiveMediaType,
            season: effectiveSeason,
            episode: effectiveEpisode,
            titleHints: combinedTitleHints,
          }),
          6000,
          [] as TrackRecord[]
        ).then((res) => {
          spanishSeriesTracks = res;
          signalFastDirectEsIfReady(res);
        })
      : Promise.resolve();
  const embed69P =
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
          6000,
          [] as TrackRecord[]
        ).then((res) => {
          esTracks = res;
          signalFastDirectEsIfReady(res);
        })
      : Promise.resolve();
  const vestP = shouldQueryVest
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
        5500,
        null
      ).then((res) => {
        vestExtractedHolder.value = res;
        if (res?.tracks) signalFastDirectEsIfReady(res.tracks);
      })
    : Promise.resolve();

  const vidRockP =
    resolvedTmdbId && !isSpanishNativePreferred
      ? withExtractTimeout(
          extractVidRockHlsTracks({
            tmdbId: resolvedTmdbId,
            mediaType: effectiveMediaType,
            season: effectiveSeason,
            episode: effectiveEpisode,
          }),
          enTimeout,
          [] as TrackRecord[]
        ).then((res) => {
          vidRockTracks = res;
        })
      : Promise.resolve();
  const bingetrixEnP =
    resolvedTmdbId && !isSpanishNativePreferred
      ? withExtractTimeout(
          extractBingetrixEnglishTracks({
            tmdbId: resolvedTmdbId,
            mediaType: effectiveMediaType,
            season: effectiveSeason,
            episode: effectiveEpisode,
          }),
          3600,
          [] as TrackRecord[]
        ).then((res) => {
          bingetrixEnTracks = res;
        })
      : Promise.resolve();
  const twoEmbedEnP =
    resolvedTmdbId && !isSpanishNativePreferred
      ? withExtractTimeout(
          extract2EmbedEnglishTracks({
            tmdbId: resolvedTmdbId,
            imdbId: tmdbImdbId,
            mediaType: effectiveMediaType,
            season: effectiveSeason,
            episode: effectiveEpisode,
          }),
          enTimeout,
          [] as TrackRecord[]
        ).then((res) => {
          twoEmbedEnTracks = res;
        })
      : Promise.resolve();
  const vidBuzzP =
    (resolvedTmdbId || tmdbImdbId) && !isSpanishNativePreferred
      ? withExtractTimeout(
          extractVidsrcBuzzHlsTracks({
            tmdbId: resolvedTmdbId || undefined,
            imdbId: tmdbImdbId,
            mediaType: effectiveMediaType,
            season: effectiveSeason,
            episode: effectiveEpisode,
          }),
          enTimeout,
          [] as TrackRecord[]
        ).then((res) => {
          vidBuzzHlsTracks = res;
        })
      : Promise.resolve();
  const ghostflixP =
    resolvedTmdbId && !isSpanishNativePreferred
      ? withExtractTimeout(
          extractGhostflixVidboltTracks({
            tmdbId: resolvedTmdbId,
            mediaType: effectiveMediaType,
            season: effectiveSeason,
            episode: effectiveEpisode,
            force: forceExtract,
          }),
          4800,
          { tracks: [] as TrackRecord[], subtitles: [], detectedLangs: [] }
        ).then((res) => {
          ghostflixExtracted = res;
        })
      : Promise.resolve();

  const clipboxDirectP = resolvedTmdbId
    ? withExtractTimeout(
        extractClipboxDirectStreams({
          tmdbId: resolvedTmdbId,
          mediaType: effectiveMediaType,
          season: effectiveSeason,
          episode: effectiveEpisode,
          originalLanguage: tmdbOriginalLanguage,
        }),
        4800,
        { tracks: [] as TrackRecord[], subtitles: [] }
      ).then((res) => {
        clipboxDirectExtracted = res;
      })
    : Promise.resolve();

  const primaryAllPromise = Promise.all([
    movidyP,
    gnulaP,
    dmP,
    archiveP,
    spanishSeriesP,
    embed69P,
    vestP,
  ]);
  const secondaryAllPromise = Promise.all([
    clipboxDirectP,
    vidRockP,
    bingetrixEnP,
    twoEmbedEnP,
    vidBuzzP,
    ghostflixP,
  ]);

  if (isSpanishNativePreferred) {
    // Wait for native Spanish sources, or return within 1.4s after a verified direct ES track is ready
    await Promise.race([
      primaryAllPromise,
      fastDirectEsReadyPromise.then(
        () => new Promise<void>((resolve) => setTimeout(resolve, 1400))
      ),
    ]);
  } else {
    await primaryAllPromise;
    const primaryHasPreferredSpanish =
      prefersSpanishTier &&
      [
        ...movidyTracks,
        ...gnulaTracks,
        ...dailymotionTracks,
        ...archiveOrgTracks,
        ...spanishSeriesTracks,
        ...esTracks,
        ...(vestExtractedHolder.value?.tracks || []),
      ].some(
        (t) =>
          String(t.lang || '').toUpperCase() === preferLang &&
          t.resolverType !== 'web_embed'
      );

    if (primaryHasPreferredSpanish) {
      // Primary Spanish sources already succeeded; allow only a brief 350ms grace window for EN tracks
      await Promise.race([
        secondaryAllPromise,
        new Promise<void>((resolve) => setTimeout(resolve, 350)),
      ]);
    } else {
      await secondaryAllPromise;
    }
  }

  const ghostflixTracks: TrackRecord[] = ghostflixExtracted?.tracks || [];
  const ghostflixSubtitles = ghostflixExtracted?.subtitles || [];
  const clipboxTracks: TrackRecord[] = clipboxDirectExtracted?.tracks || [];
  const clipboxSubtitles = clipboxDirectExtracted?.subtitles || [];
  const enTracks: TrackRecord[] = [
    ...clipboxTracks,
    ...ghostflixTracks,
    ...vidRockTracks,
    ...bingetrixEnTracks,
    ...twoEmbedEnTracks,
    ...vidBuzzHlsTracks,
  ];
  const vestTracks: TrackRecord[] = vestExtractedHolder.value?.tracks || [];
  const vestSubtitles = vestExtractedHolder.value?.subtitles || [];
  const vestDetailMeta = vestExtractedHolder.value?.detail || extractedVestDetail;

  const allDiscovered: TrackRecord[] = isVestLink
    ? [
        ...vestTracks,
        ...movidyTracks,
        ...gnulaTracks,
        ...dailymotionTracks,
        ...archiveOrgTracks,
        ...spanishSeriesTracks,
        ...enTracks,
        ...esTracks,
      ]
    : !hasExplicitMovidyUrl && hasExplicitGnulaUrl
    ? [
        ...gnulaTracks,
        ...dailymotionTracks,
        ...archiveOrgTracks,
        ...spanishSeriesTracks,
        ...movidyTracks,
        ...enTracks,
        ...esTracks,
        ...vestTracks,
      ]
    : [
        ...movidyTracks,
        ...gnulaTracks,
        ...dailymotionTracks,
        ...archiveOrgTracks,
        ...spanishSeriesTracks,
        ...enTracks,
        ...esTracks,
        ...vestTracks,
      ];

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
        const resolvedMv = await withExtractTimeout(
          resolveMovidyEmbedTrack(candidate.sourceUrl),
          3800,
          null
        );
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

    const rawMergedSubs = [...vestSubtitles, ...clipboxSubtitles, ...ghostflixSubtitles];
    if (rawMergedSubs.length === 0 && (resolvedTmdbId || baseCleanTitle || titleHint)) {
      const searchedSubs = await withExtractTimeout(subtitlesPromise, 650, [] as any[]);
      rawMergedSubs.push(...searchedSubs);
    } else if (resolvedTmdbId) {
      const searchedSubs = await withExtractTimeout(subtitlesPromise, 250, [] as any[]);
      rawMergedSubs.push(...searchedSubs);
    }
    const seenSubUrls = new Set<string>();
    const combinedSubtitles = rawMergedSubs.filter((s) => {
      const u = String(s?.url || '').trim();
      if (!u || seenSubUrls.has(u)) return false;
      seenSubUrls.add(u);
      return true;
    });

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
    tmdbOriginalLanguage,
    isUnreleasedEpisode,
    effectiveMediaType,
    effectiveSeason,
    effectiveEpisode,
    episodeTitleHint: effectiveEpisodeTitleHint,
    preferLang,
    resolvedTmdbId,
    rawInput,
    isSandboxedFrame,
  });
  if (fallbackResult) {
    setCache(cacheKey, fallbackResult);
    return sendOk(fallbackResult);
  }

  if (sendUnavailable) {
    if (isUnreleasedEpisode) {
      const [y, m, d] = episodeAirDate.split('-');
      const formattedDate = y && m && d ? `${d}/${m}/${y}` : episodeAirDate;
      return sendUnavailable(404, {
        success: false,
        unreleased: true,
        airDate: episodeAirDate,
        canUseCloudBrowser: false,
        error: `Este capítulo aún no se ha estrenado (estreno previsto: ${formattedDate}).`,
      });
    }
    if (tmdbOriginalLanguage === 'es' && preferLang === 'ES') {
      return sendUnavailable(404, {
        success: false,
        canUseCloudBrowser: false,
        error:
          'Este capítulo no tiene señal activa en Castellano en este momento. Prueba otro capítulo o inténtalo más tarde.',
      });
    }
  }

  return null;
}

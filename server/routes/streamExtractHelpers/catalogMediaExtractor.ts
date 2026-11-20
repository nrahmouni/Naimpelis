import type express from 'express';
import { ENV } from '../../config/env.ts';
import { fetchAndCacheSubtitles } from '../detailsAndSubtitles.ts';
import {
  buildHlsProxyUrl,
  type ExtractedStreamResult,
  type TrackRecord,
} from '../../extractors/httpHelpers.ts';
import { extractClipboxDirectStreams } from '../../extractors/clipboxDirectExtractor.ts';
import { extractEmbed69SpanishTracks } from '../../extractors/vidhideEmbed69.ts';
import {
  extract2EmbedEnglishTracks,
  extractBingetrixEnglishTracks,
  extractGhostflixVidboltTracks,
  extractVidRockHlsTracks,
  extractVidsrcBuzzHlsTracks,
  isMovidyVerUrl,
} from '../../extractors/bingetrixMovidy.ts';
import { isGnulaHdUrl } from '../../extractors/gnulaHdExtractor.ts';
import { extractDailymotionSeriesTracks } from '../../extractors/dailymotionExtractor.ts';
import { extractArchiveOrgTracks } from '../../extractors/archiveOrgExtractor.ts';
import { extractSpanishSeriesTracks } from '../../extractors/spanishSeriesExtractor.ts';
import {
  extractComunidadMontepinarLqsaTracks,
  type MontepinarSubtitleItem,
} from '../../extractors/comunidadMontepinarExtractor.ts';
import {
  extractVestStreamsAndSubtitles,
  isVestMirrorUrl,
} from '../../services/vestMirrorService.ts';
import { channelHealthMonitor } from '../../services/channelHealthMonitor.ts';
import {
  buildFallbackCatalogResult,
  resolveCatalogMediaMetadata,
} from './catalogMediaMetadataAndFallback.ts';
import {
  buildResolvedCatalogStreamResult,
  resolveGnulaTracksForCatalog,
  resolveMovidyTracksForCatalog,
  resolveOrderedCandidateTracks,
} from './catalogTrackResolver.ts';
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
  directOnly?: boolean;
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
    directOnly = false,
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
  let montepinarExtracted: { tracks: TrackRecord[]; subtitles: MontepinarSubtitleItem[] } = {
    tracks: [],
    subtitles: [],
  };
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

  const movidyP = withExtractTimeout(
    resolveMovidyTracksForCatalog({
      effectiveMovidyUrl,
      combinedTitleHints,
      effectiveYearForExtract,
      effectiveMediaType,
      resolvedTmdbId,
      tmdbDirector,
      tmdbRuntimeMin,
    }),
    5800,
    [] as TrackRecord[]
  ).then((res) => {
    movidyTracks = res;
    signalFastDirectEsIfReady(res);
  });
  const gnulaP = withExtractTimeout(
    resolveGnulaTracksForCatalog({
      effectiveGnulaUrl,
      combinedTitleHints,
      effectiveYearForExtract,
      effectiveMediaType,
      resolvedTmdbId,
      tmdbDirector,
      tmdbRuntimeMin,
      effectiveSeason,
      effectiveEpisode,
    }),
    6400,
    [] as TrackRecord[]
  ).then((res) => {
    gnulaTracks = res;
    signalFastDirectEsIfReady(res);
  });
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
  const montepinarP =
    effectiveMediaType === 'tv' &&
    combinedTitleHints.length > 0 &&
    (String(resolvedTmdbId || '') === '35338' ||
      combinedTitleHints.some((h) => h.toLowerCase().includes('la que se avecina')))
      ? withExtractTimeout(
          extractComunidadMontepinarLqsaTracks({
            tmdbId: resolvedTmdbId,
            mediaType: effectiveMediaType,
            season: effectiveSeason,
            episode: effectiveEpisode,
            titleHints: combinedTitleHints,
          }),
          5200,
          { tracks: [] as TrackRecord[], subtitles: [] as MontepinarSubtitleItem[] }
        ).then((res) => {
          montepinarExtracted = res;
          signalFastDirectEsIfReady(res.tracks);
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
    montepinarP,
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
    ...vidRockTracks,
    ...ghostflixTracks,
    ...clipboxTracks,
    ...bingetrixEnTracks,
    ...twoEmbedEnTracks,
    ...vidBuzzHlsTracks,
  ];
  const montepinarTracks: TrackRecord[] = montepinarExtracted?.tracks || [];
  const montepinarSubtitles = montepinarExtracted?.subtitles || [];
  const vestTracks: TrackRecord[] = vestExtractedHolder.value?.tracks || [];
  const vestSubtitles = vestExtractedHolder.value?.subtitles || [];
  const vestDetailMeta = vestExtractedHolder.value?.detail || extractedVestDetail;

  const rawDiscovered: TrackRecord[] = isVestLink
    ? [
        ...vestTracks,
        ...movidyTracks,
        ...gnulaTracks,
        ...montepinarTracks,
        ...dailymotionTracks,
        ...archiveOrgTracks,
        ...spanishSeriesTracks,
        ...enTracks,
        ...esTracks,
      ]
    : !hasExplicitMovidyUrl && hasExplicitGnulaUrl
    ? [
        ...gnulaTracks,
        ...montepinarTracks,
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
        ...montepinarTracks,
        ...dailymotionTracks,
        ...archiveOrgTracks,
        ...spanishSeriesTracks,
        ...enTracks,
        ...esTracks,
        ...vestTracks,
      ];

  const seenTrackKeys = new Set<string>();
  const allDiscovered: TrackRecord[] = rawDiscovered.filter((tr) => {
    const rawU = String(tr.resolvedStreamUrl || tr.sourceUrl || '').trim();
    const archiveNorm = rawU.match(/archive\.org\/(?:\d+\/items|download)\/([^?#]+)/i)?.[1];
    const dedupeKey = archiveNorm ? `ia:${decodeURIComponent(archiveNorm).toLowerCase()}` : rawU;
    if (!dedupeKey) return true;
    if (seenTrackKeys.has(dedupeKey)) return false;
    seenTrackKeys.add(dedupeKey);
    return true;
  });

  const { orderedTracks, getLangScore, sourcePriority, getTrackHealthScore } = rankCandidateTracks({
    allDiscovered,
    preferLang,
    isVestLink,
    hasExplicitMovidyUrl,
    hasExplicitGnulaUrl,
    healthMap: channelHealthMonitor.getAllTrackStatuses(),
  });

  const resolvedSelection = await resolveOrderedCandidateTracks({
    orderedTracks,
    getLangScore,
    sourcePriority,
    getTrackHealthScore,
    isSandboxedFrame,
    directOnly,
  });

  if (resolvedSelection) {
    const result = await buildResolvedCatalogStreamResult({
      resolvedSelection,
      preferLang,
      titleHint,
      extractedMovidyCleanTitle,
      extractedGnulaCleanTitle,
      tmdbResolvedTitle,
      effectiveMediaType,
      effectiveSeason,
      effectiveEpisode,
      vestDetailMeta,
      vestSubtitles,
      clipboxSubtitles,
      ghostflixSubtitles,
      extraSubtitles: montepinarSubtitles,
      resolvedTmdbId,
      subtitlesPromise,
    });
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
    directOnly,
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

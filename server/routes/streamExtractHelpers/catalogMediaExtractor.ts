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
import { findFastProviderVodOrSeriesSignals } from '../../services/providers/xtreamFastSignalService.ts';
import {
  extractXtreamSeriesEpisodeTracks,
  findXtreamMovieMatches,
} from '../../services/xtreamVodMatcher.ts';
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
  let bingetrixEnTracks: TrackRecord[] = [];
  let twoEmbedEnTracks: TrackRecord[] = [];
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
  let providerFastTracks: TrackRecord[] = [];
  let xtreamVodTracks: TrackRecord[] = [];

  let fastDirectReadyResolve: (() => void) | null = null;
  let fastDirectReadyFired = false;
  const fastDirectReadyPromise = new Promise<void>((resolve) => {
    fastDirectReadyResolve = resolve;
  });
  const matchesPreferLang = (trackLang: string): boolean => {
    const tl = String(trackLang || '').toUpperCase();
    const pref = String(preferLang || 'ES').toUpperCase();
    if (tl === pref) return true;
    if (pref === 'VOSE' && tl === 'EN') return true;
    if (pref === 'LAT' && tl === 'ES') return false;
    return false;
  };
  const signalFastDirectIfReady = (tracks: TrackRecord[]) => {
    if (
      !fastDirectReadyFired &&
      tracks.some(
        (t) =>
          matchesPreferLang(t.lang) &&
          t.resolverType !== 'web_embed' &&
          Boolean(t.resolvedStreamUrl)
      )
    ) {
      fastDirectReadyFired = true;
      fastDirectReadyResolve?.();
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
    signalFastDirectIfReady(res);
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
    signalFastDirectIfReady(res);
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
          signalFastDirectIfReady(res);
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
          signalFastDirectIfReady(res);
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
          signalFastDirectIfReady(res);
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
          signalFastDirectIfReady(res.tracks);
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
          signalFastDirectIfReady(res);
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
        if (res?.tracks) signalFastDirectIfReady(res.tracks);
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
          5200,
          [] as TrackRecord[]
        ).then((res) => {
          bingetrixEnTracks = res;
          signalFastDirectIfReady(res);
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
          signalFastDirectIfReady(res);
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
          signalFastDirectIfReady(res.tracks);
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
        signalFastDirectIfReady(res.tracks);
      })
    : Promise.resolve();

  const providerFastP = withExtractTimeout(
    findFastProviderVodOrSeriesSignals({
      mediaType: effectiveMediaType,
      title: tmdbResolvedTitle || titleHint || combinedTitleHints[0] || '',
      origTitle: origTitleHint || combinedTitleHints[1],
      year: effectiveYearForExtract,
      season: effectiveSeason,
      episode: effectiveEpisode,
      preferLang,
      limit: 8,
    }),
    3200,
    [] as TrackRecord[]
  ).then((res) => {
    providerFastTracks = res;
    signalFastDirectIfReady(res);
  });

  const xtreamVodP =
    combinedTitleHints.length > 0
      ? withExtractTimeout(
          effectiveMediaType === 'tv'
            ? extractXtreamSeriesEpisodeTracks({
                titleHints: combinedTitleHints,
                yearHint: effectiveYearForExtract,
                season: effectiveSeason,
                episode: effectiveEpisode,
                preferLang,
              })
            : findXtreamMovieMatches({
                titleHints: combinedTitleHints,
                yearHint: effectiveYearForExtract,
                preferLang,
                limit: 10,
              }).then((r) => r.tracks),
          3600,
          [] as TrackRecord[]
        ).then((res) => {
          xtreamVodTracks = res;
          signalFastDirectIfReady(res);
        })
      : Promise.resolve();

  const xtreamFastSettledPromise = Promise.all([providerFastP, xtreamVodP]);
  const primaryAllPromise = Promise.all([
    movidyP,
    gnulaP,
    dmP,
    archiveP,
    spanishSeriesP,
    montepinarP,
    embed69P,
    vestP,
    providerFastP,
    xtreamVodP,
  ]);
  const secondaryAllPromise = Promise.all([
    clipboxDirectP,
    bingetrixEnP,
    twoEmbedEnP,
    ghostflixP,
  ]);
  const allSourcesSettledPromise = Promise.all([primaryAllPromise, secondaryAllPromise]);

  let settledAllAtResponse = false;
  if (isSpanishNativePreferred) {
    await Promise.race([
      primaryAllPromise.then(() => {
        settledAllAtResponse = true;
      }),
      fastDirectReadyPromise.then(
        () => new Promise<void>((resolve) => setTimeout(resolve, 1200))
      ),
    ]);
  } else {
    // Wait briefly for instant RAM Xtream lookups + race all sources against a 950ms collector window once a preferred direct stream is verified
    await Promise.race([
      allSourcesSettledPromise.then(() => {
        settledAllAtResponse = true;
      }),
      Promise.all([
        xtreamFastSettledPromise,
        fastDirectReadyPromise,
      ]).then(() => new Promise<void>((resolve) => setTimeout(resolve, 950))),
      primaryAllPromise.then(async () => {
        const primaryHasPreferredSpanish =
          prefersSpanishTier &&
          [
            ...providerFastTracks,
            ...xtreamVodTracks,
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
          await Promise.race([
            secondaryAllPromise.then(() => {
              settledAllAtResponse = true;
            }),
            new Promise<void>((resolve) => setTimeout(resolve, 350)),
          ]);
        } else {
          await secondaryAllPromise;
          settledAllAtResponse = true;
        }
      }),
    ]);
  }

  const collectDiscoveredTracks = (): {
    allDiscovered: TrackRecord[];
    clipboxSubs: any[];
    ghostflixSubs: any[];
    montepinarSubs: MontepinarSubtitleItem[];
    vestSubs: any[];
    vestMeta: typeof extractedVestDetail;
  } => {
    const ghostflixTracks: TrackRecord[] = ghostflixExtracted?.tracks || [];
    const ghostflixSubs = ghostflixExtracted?.subtitles || [];
    const clipboxTracks: TrackRecord[] = clipboxDirectExtracted?.tracks || [];
    const clipboxSubs = clipboxDirectExtracted?.subtitles || [];
    const enTracks: TrackRecord[] = [
      ...bingetrixEnTracks,
      ...ghostflixTracks,
      ...clipboxTracks,
      ...twoEmbedEnTracks,
    ];
    const montepinarTracks: TrackRecord[] = montepinarExtracted?.tracks || [];
    const montepinarSubs = montepinarExtracted?.subtitles || [];
    const vestTracks: TrackRecord[] = vestExtractedHolder.value?.tracks || [];
    const vestSubs = vestExtractedHolder.value?.subtitles || [];
    const vestMeta = vestExtractedHolder.value?.detail || extractedVestDetail;

    const rawDiscovered: TrackRecord[] = isVestLink
      ? [
          ...vestTracks,
          ...providerFastTracks,
          ...xtreamVodTracks,
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
          ...providerFastTracks,
          ...xtreamVodTracks,
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
          ...providerFastTracks,
          ...xtreamVodTracks,
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
    const deduped = rawDiscovered.filter((tr) => {
      const rawU = String(tr.resolvedStreamUrl || tr.sourceUrl || '').trim();
      const archiveNorm = rawU.match(/archive\.org\/(?:\d+\/items|download)\/([^?#]+)/i)?.[1];
      const dedupeKey = archiveNorm ? `ia:${decodeURIComponent(archiveNorm).toLowerCase()}` : rawU;
      if (!dedupeKey) return true;
      if (seenTrackKeys.has(dedupeKey)) return false;
      seenTrackKeys.add(dedupeKey);
      return true;
    });
    return {
      allDiscovered: deduped,
      clipboxSubs,
      ghostflixSubs,
      montepinarSubs,
      vestSubs,
      vestMeta,
    };
  };

  const initialCollected = collectDiscoveredTracks();
  const { orderedTracks, getLangScore, sourcePriority, getTrackHealthScore } = rankCandidateTracks({
    allDiscovered: initialCollected.allDiscovered,
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
      vestDetailMeta: initialCollected.vestMeta,
      vestSubtitles: initialCollected.vestSubs,
      clipboxSubtitles: initialCollected.clipboxSubs,
      ghostflixSubtitles: initialCollected.ghostflixSubs,
      extraSubtitles: initialCollected.montepinarSubs,
      resolvedTmdbId,
      subtitlesPromise,
    });
    setCache(cacheKey, result);

    // Background cache enrichment: let slower servers finish after early return and update cache with all alternatives
    if (!settledAllAtResponse) {
      allSourcesSettledPromise
        .then(async () => {
          const fullCollected = collectDiscoveredTracks();
          if (fullCollected.allDiscovered.length <= initialCollected.allDiscovered.length) return;
          const fullRanked = rankCandidateTracks({
            allDiscovered: fullCollected.allDiscovered,
            preferLang,
            isVestLink,
            hasExplicitMovidyUrl,
            hasExplicitGnulaUrl,
            healthMap: channelHealthMonitor.getAllTrackStatuses(),
          });
          const fullSel = await resolveOrderedCandidateTracks({
            orderedTracks: fullRanked.orderedTracks,
            getLangScore: fullRanked.getLangScore,
            sourcePriority: fullRanked.sourcePriority,
            getTrackHealthScore: fullRanked.getTrackHealthScore,
            isSandboxedFrame,
            directOnly,
          });
          if (!fullSel || fullSel.validTracks.length <= (result.tracks?.length ?? 0)) return;
          const enrichedResult = await buildResolvedCatalogStreamResult({
            resolvedSelection: fullSel,
            preferLang,
            titleHint,
            extractedMovidyCleanTitle,
            extractedGnulaCleanTitle,
            tmdbResolvedTitle,
            effectiveMediaType,
            effectiveSeason,
            effectiveEpisode,
            vestDetailMeta: fullCollected.vestMeta,
            vestSubtitles: fullCollected.vestSubs,
            clipboxSubtitles: fullCollected.clipboxSubs,
            ghostflixSubtitles: fullCollected.ghostflixSubs,
            extraSubtitles: fullCollected.montepinarSubs,
            resolvedTmdbId,
            subtitlesPromise,
          });
          setCache(cacheKey, enrichedResult);
        })
        .catch(() => {});
    }

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

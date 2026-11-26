import type express from 'express';
import { ENV } from '../../config/env.ts';
import { fetchAndCacheSubtitles } from '../detailsAndSubtitles.ts';
import {
  buildHlsProxyUrl,
  generateSpanishTitleHints,
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
  findVestSeedForMedia,
  isVestMirrorUrl,
} from '../../services/vestMirrorService.ts';
import { channelHealthMonitor } from '../../services/channelHealthMonitor.ts';
import {
  recordProviderOutcome,
  tryAcquireHalfOpenProbe,
} from '../../services/providerCircuitBreaker.ts';
import {
  buildFallbackCatalogResult,
  resolveCatalogMediaMetadata,
  type ResolvedCatalogMetadata,
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

function buildInitialTitleHints(titleHint: string, origTitleHint: string): string[] {
  const raw = [titleHint, origTitleHint].filter(Boolean);
  const expanded: string[] = [];
  for (const h of raw) {
    expanded.push(h);
    for (const v of generateSpanishTitleHints(h)) expanded.push(v);
  }
  return Array.from(new Set(expanded));
}

function runGuardedScraperWithTimeout<T>(
  circuitKey: string | null,
  ms: number,
  fallback: T,
  runner: () => Promise<T>,
  hasTracksCheck?: (res: T) => boolean
): Promise<T> {
  if (circuitKey && !tryAcquireHalfOpenProbe(circuitKey)) {
    return Promise.resolve(fallback);
  }

  return new Promise<T>((resolve) => {
    let settled = false;
    const t0 = Date.now();
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      if (circuitKey) {
        recordProviderOutcome(circuitKey, { ok: false, latencyMs: ms });
      }
      resolve(fallback);
    }, ms);
    timer.unref?.();

    Promise.resolve()
      .then(runner)
      .then((res) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (circuitKey) {
          const ok = hasTracksCheck ? true : Boolean(res);
          recordProviderOutcome(circuitKey, { ok, latencyMs: Date.now() - t0 });
        }
        resolve(res);
      })
      .catch(() => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (circuitKey) {
          recordProviderOutcome(circuitKey, { ok: false, latencyMs: Date.now() - t0 });
        }
        resolve(fallback);
      });
  });
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

  // Synchronous initial metadata hints so video search starts at t=0ms in parallel with TMDB lookup
  const initialMediaType: 'movie' | 'tv' =
    mediaTypeParam === 'tv' || Boolean(bingetrixTvMatch) || Boolean(externalEmbedTvMatch)
      ? 'tv'
      : 'movie';
  const initialSeason = bingetrixTvMatch
    ? parseInt(bingetrixTvMatch[2], 10)
    : externalEmbedTvMatch
    ? parseInt(externalEmbedTvMatch[2], 10)
    : seasonParam || 1;
  const initialEpisode = bingetrixTvMatch
    ? parseInt(bingetrixTvMatch[3], 10)
    : externalEmbedTvMatch
    ? parseInt(externalEmbedTvMatch[3], 10)
    : episodeParam || 1;
  const rawIdCandidate =
    tmdbIdParam ||
    (bingetrixTvMatch ? bingetrixTvMatch[1] : '') ||
    (bingetrixMovieMatch ? bingetrixMovieMatch[1] : '') ||
    (externalEmbedTvMatch ? externalEmbedTvMatch[1] : '') ||
    (externalEmbedMovieMatch ? externalEmbedMovieMatch[1] : '');
  const initialNumericTmdbId =
    rawIdCandidate && /^\d+$/.test(String(rawIdCandidate)) ? String(rawIdCandidate) : null;
  const initialTitleHints = buildInitialTitleHints(titleHint, origTitleHint);
  const initialYear = yearParam || undefined;
  const initialMovidyUrl = isMovidyVerUrl(movidyUrlParam)
    ? movidyUrlParam
    : isMovidyVerUrl(rawInput)
    ? rawInput
    : '';
  const initialGnulaUrl = isGnulaHdUrl(gnulaUrlParam)
    ? gnulaUrlParam
    : isGnulaHdUrl(rawInput)
    ? rawInput
    : '';
  const initialVestUrl = isVestMirrorUrl(vestUrlParam)
    ? vestUrlParam
    : isVestMirrorUrl(rawInput)
    ? rawInput
    : '';

  let resolvedMetadataSnapshot: ResolvedCatalogMetadata | null = null;
  const metadataPromise = resolveCatalogMediaMetadata({
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
  }).then((meta) => {
    resolvedMetadataSnapshot = meta;
    return meta;
  });
  metadataPromise.catch(() => {});

  // Kick off subtitles search at t=0ms when we already have ID or title hint
  const subtitlesPromise =
    initialNumericTmdbId || titleHint
      ? fetchAndCacheSubtitles(
          String(initialNumericTmdbId || ''),
          initialMediaType === 'tv' ? initialSeason : 0,
          initialMediaType === 'tv' ? initialEpisode : 0,
          1800,
          {
            title: titleHint || undefined,
            mediaType: initialMediaType,
          }
        ).catch(() => [] as any[])
      : metadataPromise
          .then((meta) =>
            meta.resolvedTmdbId || meta.tmdbResolvedTitle || titleHint
              ? fetchAndCacheSubtitles(
                  String(meta.resolvedTmdbId || ''),
                  meta.effectiveMediaType === 'tv' ? meta.effectiveSeason : 0,
                  meta.effectiveMediaType === 'tv' ? meta.effectiveEpisode : 0,
                  1800,
                  {
                    title: meta.tmdbResolvedTitle || titleHint || undefined,
                    mediaType: meta.effectiveMediaType,
                  }
                ).catch(() => [] as any[])
              : ([] as any[])
          )
          .catch(() => [] as any[]);
  subtitlesPromise.catch(() => {});

  const prefersSpanishTier = preferLang === 'ES' || preferLang === 'LAT';
  const enTimeout = prefersSpanishTier ? 2200 : 3000;

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
  let preferGraceTimer: ReturnType<typeof setTimeout> | null = null;
  let anyTrackGraceTimer: ReturnType<typeof setTimeout> | null = null;
  const fastDirectReadyPromise = new Promise<void>((resolve) => {
    fastDirectReadyResolve = resolve;
  });

  const clearEarlyWinTimers = () => {
    if (preferGraceTimer) {
      clearTimeout(preferGraceTimer);
      preferGraceTimer = null;
    }
    if (anyTrackGraceTimer) {
      clearTimeout(anyTrackGraceTimer);
      anyTrackGraceTimer = null;
    }
  };

  const triggerEarlyWin = () => {
    if (fastDirectReadyFired) return;
    fastDirectReadyFired = true;
    clearEarlyWinTimers();
    fastDirectReadyResolve?.();
  };

  const matchesPreferLang = (trackLang: string): boolean => {
    const tl = String(trackLang || '').toUpperCase();
    const pref = String(preferLang || 'ES').toUpperCase();
    if (tl === pref) return true;
    if (pref === 'VOSE' && tl === 'EN') return true;
    if (pref === 'LAT' && tl === 'ES') return false;
    return false;
  };
  const signalFastDirectIfReady = (tracks: TrackRecord[]) => {
    if (fastDirectReadyFired || tracks.length === 0) return;
    if (
      tracks.some(
        (t) =>
          matchesPreferLang(t.lang) &&
          t.resolverType !== 'web_embed' &&
          Boolean(t.resolvedStreamUrl)
      )
    ) {
      triggerEarlyWin();
      return;
    }

    if (
      tracks.some(
        (t) => matchesPreferLang(t.lang) && t.resolverType !== 'web_embed'
      )
    ) {
      if (!preferGraceTimer) {
        preferGraceTimer = setTimeout(() => {
          preferGraceTimer = null;
          triggerEarlyWin();
        }, 260);
        preferGraceTimer.unref?.();
      }
      return;
    }

    if (
      tracks.some((t) => t.resolverType !== 'web_embed') &&
      !anyTrackGraceTimer
    ) {
      anyTrackGraceTimer = setTimeout(() => {
        anyTrackGraceTimer = null;
        triggerEarlyWin();
      }, 650);
      anyTrackGraceTimer.unref?.();
    }
  };

  // Track which sources were launched at t=0 so Stage-2 only fills gaps discovered by TMDB/page metadata
  const launchedFlags = {
    providerFast: false,
    xtreamVod: false,
    movidy: false,
    gnula: false,
    embed69: false,
    vest: false,
    bingetrixEn: false,
    twoEmbedEn: false,
    ghostflix: false,
    clipbox: false,
    dm: false,
    archive: false,
    spanishSeries: false,
    montepinar: false,
  };

  const launchProviderFast = (
    mediaType: 'movie' | 'tv',
    title: string,
    origTitle: string | undefined,
    year: string | undefined,
    season: number,
    episode: number
  ) => {
    if (!title && !origTitle) return Promise.resolve();
    launchedFlags.providerFast = true;
    return runGuardedScraperWithTimeout(
      'scraper:xtream_fast',
      2000,
      [] as TrackRecord[],
      () =>
        findFastProviderVodOrSeriesSignals({
          mediaType,
          title,
          origTitle,
          year,
          season,
          episode,
          preferLang,
          limit: 8,
        }),
      (res) => res.length > 0
    ).then((res) => {
      if (res.length > 0) providerFastTracks = res;
      signalFastDirectIfReady(res);
    });
  };

  const launchXtreamVod = (
    mediaType: 'movie' | 'tv',
    hints: string[],
    year: string | undefined,
    season: number,
    episode: number
  ) => {
    if (hints.length === 0) return Promise.resolve();
    launchedFlags.xtreamVod = true;
    return runGuardedScraperWithTimeout(
      'scraper:xtream_vod',
      2200,
      [] as TrackRecord[],
      () =>
        mediaType === 'tv'
          ? extractXtreamSeriesEpisodeTracks({
              titleHints: hints,
              yearHint: year,
              season,
              episode,
              preferLang,
            })
          : findXtreamMovieMatches({
              titleHints: hints,
              yearHint: year,
              preferLang,
              limit: 10,
            }).then((r) => r.tracks),
      (res) => res.length > 0
    ).then((res) => {
      if (res.length > 0) xtreamVodTracks = res;
      signalFastDirectIfReady(res);
    });
  };

  const launchMovidy = (optsMovidy: {
    effectiveMovidyUrl: string;
    combinedTitleHints: string[];
    effectiveYearForExtract?: string;
    effectiveMediaType: 'movie' | 'tv';
    resolvedTmdbId: string | number | null;
    tmdbDirector?: string;
    tmdbRuntimeMin?: number;
  }) => {
    if (!optsMovidy.effectiveMovidyUrl && optsMovidy.combinedTitleHints.length === 0) {
      return Promise.resolve();
    }
    launchedFlags.movidy = true;
    return runGuardedScraperWithTimeout(
      'scraper:movidy',
      3200,
      [] as TrackRecord[],
      () => resolveMovidyTracksForCatalog(optsMovidy),
      (res) => res.length > 0
    ).then((res) => {
      if (res.length > 0) movidyTracks = res;
      signalFastDirectIfReady(res);
    });
  };

  const launchGnula = (optsGnula: {
    effectiveGnulaUrl: string;
    combinedTitleHints: string[];
    effectiveYearForExtract?: string;
    effectiveMediaType: 'movie' | 'tv';
    resolvedTmdbId: string | number | null;
    tmdbDirector?: string;
    tmdbRuntimeMin?: number;
    effectiveSeason: number;
    effectiveEpisode: number;
  }) => {
    if (!optsGnula.effectiveGnulaUrl && optsGnula.combinedTitleHints.length === 0) {
      return Promise.resolve();
    }
    launchedFlags.gnula = true;
    return runGuardedScraperWithTimeout(
      'scraper:gnula',
      3400,
      [] as TrackRecord[],
      () => resolveGnulaTracksForCatalog(optsGnula),
      (res) => res.length > 0
    ).then((res) => {
      if (res.length > 0) gnulaTracks = res;
      signalFastDirectIfReady(res);
    });
  };

  const launchEmbed69 = (optsE69: {
    tmdbId: string | number | null;
    imdbId: string | null;
    mediaType: 'movie' | 'tv';
    season: number;
    episode: number;
    titleHints: string[];
    yearHint?: string;
    directorHint?: string;
    runtimeMinHint?: number;
    skipTmdbFetch?: boolean;
  }) => {
    if (!optsE69.tmdbId && optsE69.titleHints.length === 0) return Promise.resolve();
    launchedFlags.embed69 = true;
    return runGuardedScraperWithTimeout(
      'scraper:embed69',
      3000,
      [] as TrackRecord[],
      () =>
        extractEmbed69SpanishTracks({
          tmdbId: optsE69.tmdbId || undefined,
          imdbId: optsE69.imdbId,
          mediaType: optsE69.mediaType,
          season: optsE69.season,
          episode: optsE69.episode,
          titleHints: optsE69.titleHints,
          yearHint: optsE69.yearHint,
          directorHint: optsE69.directorHint,
          runtimeMinHint: optsE69.runtimeMinHint,
          skipTmdbFetch: optsE69.skipTmdbFetch,
          force: forceExtract,
          skipGnula: true,
        }),
      (res) => res.length > 0
    ).then((res) => {
      if (res.length > 0) esTracks = res;
      signalFastDirectIfReady(res);
    });
  };

  const launchVest = (optsVest: {
    vestUrl?: string;
    tmdbId: string | number | null;
    mediaType: 'movie' | 'tv';
    yearHint?: string;
    season: number;
    episode: number;
    titleHints: string[];
  }) => {
    launchedFlags.vest = true;
    return runGuardedScraperWithTimeout(
      'scraper:vest',
      2600,
      null as Awaited<ReturnType<typeof extractVestStreamsAndSubtitles>>,
      () =>
        extractVestStreamsAndSubtitles({
          vestUrl: optsVest.vestUrl,
          tmdbId: optsVest.tmdbId,
          mediaType: optsVest.mediaType,
          yearHint: optsVest.yearHint,
          season: optsVest.season,
          episode: optsVest.episode,
          preferLang,
          titleHints: optsVest.titleHints,
          tmdbApiKey: TMDB_API_KEY,
          buildHlsProxyUrl: (m3u8Url, referer) => buildHlsProxyUrl(m3u8Url, referer),
        }),
      (res) => Boolean(res?.tracks?.length)
    ).then((res) => {
      if (res) vestExtractedHolder.value = res;
      if (res?.tracks) signalFastDirectIfReady(res.tracks);
    });
  };

  const launchEnglishAndDirect = (optsEn: {
    tmdbId: string | number | null;
    imdbId: string | null;
    mediaType: 'movie' | 'tv';
    season: number;
    episode: number;
    originalLanguage: string;
  }) => {
    const isSpanishNative = optsEn.originalLanguage === 'es' && preferLang === 'ES';
    const jobs: Promise<void>[] = [];

    if (optsEn.tmdbId && !isSpanishNative && !launchedFlags.bingetrixEn) {
      launchedFlags.bingetrixEn = true;
      jobs.push(
        runGuardedScraperWithTimeout(
          'scraper:bingetrix_en',
          2800,
          [] as TrackRecord[],
          () =>
            extractBingetrixEnglishTracks({
              tmdbId: optsEn.tmdbId!,
              mediaType: optsEn.mediaType,
              season: optsEn.season,
              episode: optsEn.episode,
            }),
          (res) => res.length > 0
        ).then((res) => {
          if (res.length > 0) bingetrixEnTracks = res;
          signalFastDirectIfReady(res);
        })
      );
    }

    if (optsEn.tmdbId && !isSpanishNative && !launchedFlags.twoEmbedEn) {
      launchedFlags.twoEmbedEn = true;
      jobs.push(
        runGuardedScraperWithTimeout(
          'scraper:2embed_en',
          enTimeout,
          [] as TrackRecord[],
          () =>
            extract2EmbedEnglishTracks({
              tmdbId: optsEn.tmdbId!,
              imdbId: optsEn.imdbId,
              mediaType: optsEn.mediaType,
              season: optsEn.season,
              episode: optsEn.episode,
            }),
          (res) => res.length > 0
        ).then((res) => {
          if (res.length > 0) twoEmbedEnTracks = res;
          signalFastDirectIfReady(res);
        })
      );
    }

    if (optsEn.tmdbId && !isSpanishNative && !launchedFlags.ghostflix) {
      launchedFlags.ghostflix = true;
      jobs.push(
        runGuardedScraperWithTimeout(
          'scraper:ghostflix',
          2600,
          { tracks: [] as TrackRecord[], subtitles: [], detectedLangs: [] },
          () =>
            extractGhostflixVidboltTracks({
              tmdbId: optsEn.tmdbId!,
              mediaType: optsEn.mediaType,
              season: optsEn.season,
              episode: optsEn.episode,
              force: forceExtract,
            }),
          (res) => res.tracks.length > 0
        ).then((res) => {
          if (res.tracks.length > 0 || res.subtitles.length > 0) ghostflixExtracted = res;
          signalFastDirectIfReady(res.tracks);
        })
      );
    }

    if (optsEn.tmdbId && !launchedFlags.clipbox) {
      launchedFlags.clipbox = true;
      jobs.push(
        runGuardedScraperWithTimeout(
          'scraper:clipbox',
          2600,
          { tracks: [] as TrackRecord[], subtitles: [] },
          () =>
            extractClipboxDirectStreams({
              tmdbId: optsEn.tmdbId!,
              mediaType: optsEn.mediaType,
              season: optsEn.season,
              episode: optsEn.episode,
              originalLanguage: optsEn.originalLanguage,
            }),
          (res) => res.tracks.length > 0
        ).then((res) => {
          if (res.tracks.length > 0 || res.subtitles.length > 0) clipboxDirectExtracted = res;
          signalFastDirectIfReady(res.tracks);
        })
      );
    }

    return Promise.all(jobs);
  };

  const launchSpanishTvExtras = (optsTv: {
    tmdbId: string | number | null;
    mediaType: 'movie' | 'tv';
    season: number;
    episode: number;
    titleHints: string[];
    episodeTitle: string;
    originalLanguage: string;
  }) => {
    if (optsTv.mediaType !== 'tv' || optsTv.titleHints.length === 0) {
      return Promise.resolve();
    }
    const jobs: Promise<void>[] = [];
    if (!launchedFlags.dm) {
      launchedFlags.dm = true;
      jobs.push(
        runGuardedScraperWithTimeout(
          'scraper:dailymotion',
          2800,
          [] as TrackRecord[],
          () =>
            extractDailymotionSeriesTracks({
              tmdbId: optsTv.tmdbId,
              mediaType: optsTv.mediaType,
              season: optsTv.season,
              episode: optsTv.episode,
              titleHints: optsTv.titleHints,
              episodeTitleHint: optsTv.episodeTitle,
            }),
          (res) => res.length > 0
        ).then((res) => {
          if (res.length > 0) dailymotionTracks = res;
          signalFastDirectIfReady(res);
        })
      );
    }

    const isEsOrLqsa =
      optsTv.originalLanguage === 'es' ||
      preferLang === 'ES' ||
      String(optsTv.tmdbId || '') === '35338';
    if (isEsOrLqsa && !launchedFlags.archive) {
      launchedFlags.archive = true;
      jobs.push(
        runGuardedScraperWithTimeout(
          'scraper:archive_org',
          2400,
          [] as TrackRecord[],
          () =>
            extractArchiveOrgTracks({
              tmdbId: optsTv.tmdbId,
              mediaType: optsTv.mediaType,
              season: optsTv.season,
              episode: optsTv.episode,
              titleHints: optsTv.titleHints,
              originalLanguage: optsTv.originalLanguage,
            }),
          (res) => res.length > 0
        ).then((res) => {
          if (res.length > 0) archiveOrgTracks = res;
          signalFastDirectIfReady(res);
        })
      );
    }

    if (isEsOrLqsa && !launchedFlags.spanishSeries) {
      launchedFlags.spanishSeries = true;
      jobs.push(
        runGuardedScraperWithTimeout(
          'scraper:spanish_series',
          2800,
          [] as TrackRecord[],
          () =>
            extractSpanishSeriesTracks({
              tmdbId: optsTv.tmdbId,
              mediaType: optsTv.mediaType,
              season: optsTv.season,
              episode: optsTv.episode,
              titleHints: optsTv.titleHints,
            }),
          (res) => res.length > 0
        ).then((res) => {
          if (res.length > 0) spanishSeriesTracks = res;
          signalFastDirectIfReady(res);
        })
      );
    }

    if (
      !launchedFlags.montepinar &&
      (String(optsTv.tmdbId || '') === '35338' ||
        optsTv.titleHints.some((h) => h.toLowerCase().includes('la que se avecina')))
    ) {
      launchedFlags.montepinar = true;
      jobs.push(
        runGuardedScraperWithTimeout(
          'scraper:montepinar',
          2800,
          { tracks: [] as TrackRecord[], subtitles: [] as MontepinarSubtitleItem[] },
          () =>
            extractComunidadMontepinarLqsaTracks({
              tmdbId: optsTv.tmdbId,
              mediaType: optsTv.mediaType,
              season: optsTv.season,
              episode: optsTv.episode,
              titleHints: optsTv.titleHints,
            }),
          (res) => res.tracks.length > 0
        ).then((res) => {
          if (res.tracks.length > 0 || res.subtitles.length > 0) montepinarExtracted = res;
          signalFastDirectIfReady(res.tracks);
        })
      );
    }

    return Promise.all(jobs);
  };

  // === WAVE 1 (t=0ms): Launch video discovery immediately in parallel with TMDB metadata ===
  const hasInitialHints = initialTitleHints.length > 0;
  const earlyVestSeed =
    !initialVestUrl && (initialNumericTmdbId || hasInitialHints)
      ? findVestSeedForMedia({
          tmdbId: initialNumericTmdbId,
          mediaType: initialMediaType,
          yearHint: initialYear,
          titleHints: initialTitleHints,
          preferLang,
          season: initialSeason,
          episode: initialEpisode,
        })
      : null;

  const wave1Promises: Promise<unknown>[] = [
    hasInitialHints
      ? launchProviderFast(
          initialMediaType,
          titleHint || initialTitleHints[0] || '',
          origTitleHint || initialTitleHints[1],
          initialYear,
          initialSeason,
          initialEpisode
        )
      : Promise.resolve(),
    hasInitialHints
      ? launchXtreamVod(
          initialMediaType,
          initialTitleHints,
          initialYear,
          initialSeason,
          initialEpisode
        )
      : Promise.resolve(),
    initialMovidyUrl || hasInitialHints
      ? launchMovidy({
          effectiveMovidyUrl: initialMovidyUrl,
          combinedTitleHints: initialTitleHints,
          effectiveYearForExtract: initialYear,
          effectiveMediaType: initialMediaType,
          resolvedTmdbId: initialNumericTmdbId,
        })
      : Promise.resolve(),
    initialGnulaUrl || hasInitialHints
      ? launchGnula({
          effectiveGnulaUrl: initialGnulaUrl,
          combinedTitleHints: initialTitleHints,
          effectiveYearForExtract: initialYear,
          effectiveMediaType: initialMediaType,
          resolvedTmdbId: initialNumericTmdbId,
          effectiveSeason: initialSeason,
          effectiveEpisode: initialEpisode,
        })
      : Promise.resolve(),
    initialNumericTmdbId || hasInitialHints
      ? launchEmbed69({
          tmdbId: initialNumericTmdbId,
          imdbId: null,
          mediaType: initialMediaType,
          season: initialSeason,
          episode: initialEpisode,
          titleHints: initialTitleHints,
          yearHint: initialYear,
          skipTmdbFetch: Boolean(initialNumericTmdbId && hasInitialHints),
        })
      : Promise.resolve(),
    initialVestUrl || earlyVestSeed
      ? launchVest({
          vestUrl: initialVestUrl || undefined,
          tmdbId: initialNumericTmdbId,
          mediaType: initialMediaType,
          yearHint: initialYear,
          season: initialSeason,
          episode: initialEpisode,
          titleHints: initialTitleHints,
        })
      : Promise.resolve(),
    initialNumericTmdbId
      ? launchEnglishAndDirect({
          tmdbId: initialNumericTmdbId,
          imdbId: null,
          mediaType: initialMediaType,
          season: initialSeason,
          episode: initialEpisode,
          originalLanguage: '',
        })
      : Promise.resolve(),
    initialMediaType === 'tv' && hasInitialHints
      ? launchSpanishTvExtras({
          tmdbId: initialNumericTmdbId,
          mediaType: initialMediaType,
          season: initialSeason,
          episode: initialEpisode,
          titleHints: initialTitleHints,
          episodeTitle: episodeTitleHint,
          originalLanguage: '',
        })
      : Promise.resolve(),
  ];

  const wave1AllPromise = Promise.all(wave1Promises);
  wave1AllPromise.catch(() => {});
  wave1AllPromise.finally(() => {
    clearEarlyWinTimers();
  });

  // Immediate Return barrier: 0ms additional hold once a verified stream in preferLang arrives,
  // or short 260ms/650ms grace window when a playable mirror/fallback arrives.
  let settledAllAtResponse = false;
  await Promise.race([
    fastDirectReadyPromise,
    wave1AllPromise.then(() => {
      settledAllAtResponse = true;
    }),
  ]);
  clearEarlyWinTimers();

  let metaForResponse: ResolvedCatalogMetadata | null = resolvedMetadataSnapshot;
  let stage2AllPromise: Promise<unknown> = wave1AllPromise;

  const collectDiscoveredTracks = (): {
    allDiscovered: TrackRecord[];
    clipboxSubs: any[];
    ghostflixSubs: any[];
    montepinarSubs: MontepinarSubtitleItem[];
    vestSubs: any[];
    vestMeta: NonNullable<ResolvedCatalogMetadata['extractedVestDetail']> | null;
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
    const vestMeta =
      vestExtractedHolder.value?.detail || metaForResponse?.extractedVestDetail || null;
    const hasMovidyExplicit = metaForResponse?.hasExplicitMovidyUrl ?? Boolean(initialMovidyUrl);
    const hasGnulaExplicit = metaForResponse?.hasExplicitGnulaUrl ?? Boolean(initialGnulaUrl);

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
      : !hasMovidyExplicit && hasGnulaExplicit
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

  let initialCollected = collectDiscoveredTracks();
  const attemptResolveDiscovered = async () => {
    initialCollected = collectDiscoveredTracks();
    if (initialCollected.allDiscovered.length === 0) return null;
    const ranked = rankCandidateTracks({
      allDiscovered: initialCollected.allDiscovered,
      preferLang,
      isVestLink,
      hasExplicitMovidyUrl: metaForResponse?.hasExplicitMovidyUrl ?? Boolean(initialMovidyUrl),
      hasExplicitGnulaUrl: metaForResponse?.hasExplicitGnulaUrl ?? Boolean(initialGnulaUrl),
      healthMap: channelHealthMonitor.getAllTrackStatuses(),
    });
    return resolveOrderedCandidateTracks({
      orderedTracks: ranked.orderedTracks,
      getLangScore: ranked.getLangScore,
      sourcePriority: ranked.sourcePriority,
      getTrackHealthScore: ranked.getTrackHealthScore,
      isSandboxedFrame,
      directOnly,
    });
  };

  const earlyMetaSnapshot = resolvedMetadataSnapshot as ResolvedCatalogMetadata | null;
  if (earlyMetaSnapshot?.isUnreleasedEpisode && sendUnavailable) {
    const [y, m, d] = earlyMetaSnapshot.episodeAirDate.split('-');
    const formattedDate = y && m && d ? `${d}/${m}/${y}` : earlyMetaSnapshot.episodeAirDate;
    clearEarlyWinTimers();
    return sendUnavailable(404, {
      success: false,
      unreleased: true,
      airDate: earlyMetaSnapshot.episodeAirDate,
      canUseCloudBrowser: false,
      error: `Este capítulo aún no se ha estrenado (estreno previsto: ${formattedDate}).`,
    });
  }

  let resolvedSelection = await attemptResolveDiscovered();

  // If early-win released Wave 1 while faster/working mirrors were still running, wait for Wave 1 completion
  if (!resolvedSelection && !settledAllAtResponse) {
    await wave1AllPromise;
    settledAllAtResponse = true;
    metaForResponse = resolvedMetadataSnapshot;
    resolvedSelection = await attemptResolveDiscovered();
  }

  // Only await TMDB metadata & run Stage-2 gap-fill if Wave 1 still yielded no playable stream
  if (!resolvedSelection) {
    metaForResponse = await metadataPromise;
    if (metaForResponse.isUnreleasedEpisode) {
      if (sendUnavailable) {
        const [y, m, d] = metaForResponse.episodeAirDate.split('-');
        const formattedDate = y && m && d ? `${d}/${m}/${y}` : metaForResponse.episodeAirDate;
        return sendUnavailable(404, {
          success: false,
          unreleased: true,
          airDate: metaForResponse.episodeAirDate,
          canUseCloudBrowser: false,
          error: `Este capítulo aún no se ha estrenado (estreno previsto: ${formattedDate}).`,
        });
      }
      return null;
    }

    const wave2Promises: Promise<unknown>[] = [wave1AllPromise];
    const effectiveTitle =
      metaForResponse.tmdbResolvedTitle || titleHint || metaForResponse.combinedTitleHints[0] || '';
    if (!launchedFlags.providerFast && effectiveTitle) {
      wave2Promises.push(
        launchProviderFast(
          metaForResponse.effectiveMediaType,
          effectiveTitle,
          origTitleHint || metaForResponse.combinedTitleHints[1],
          metaForResponse.effectiveYearForExtract,
          metaForResponse.effectiveSeason,
          metaForResponse.effectiveEpisode
        )
      );
    }
    if (!launchedFlags.xtreamVod && metaForResponse.combinedTitleHints.length > 0) {
      wave2Promises.push(
        launchXtreamVod(
          metaForResponse.effectiveMediaType,
          metaForResponse.combinedTitleHints,
          metaForResponse.effectiveYearForExtract,
          metaForResponse.effectiveSeason,
          metaForResponse.effectiveEpisode
        )
      );
    }
    if (
      !launchedFlags.movidy &&
      (metaForResponse.effectiveMovidyUrl || metaForResponse.combinedTitleHints.length > 0)
    ) {
      wave2Promises.push(
        launchMovidy({
          effectiveMovidyUrl: metaForResponse.effectiveMovidyUrl,
          combinedTitleHints: metaForResponse.combinedTitleHints,
          effectiveYearForExtract: metaForResponse.effectiveYearForExtract,
          effectiveMediaType: metaForResponse.effectiveMediaType,
          resolvedTmdbId: metaForResponse.resolvedTmdbId,
          tmdbDirector: metaForResponse.tmdbDirector,
          tmdbRuntimeMin: metaForResponse.tmdbRuntimeMin,
        })
      );
    }
    if (
      !launchedFlags.gnula &&
      (metaForResponse.effectiveGnulaUrl || metaForResponse.combinedTitleHints.length > 0)
    ) {
      wave2Promises.push(
        launchGnula({
          effectiveGnulaUrl: metaForResponse.effectiveGnulaUrl,
          combinedTitleHints: metaForResponse.combinedTitleHints,
          effectiveYearForExtract: metaForResponse.effectiveYearForExtract,
          effectiveMediaType: metaForResponse.effectiveMediaType,
          resolvedTmdbId: metaForResponse.resolvedTmdbId,
          tmdbDirector: metaForResponse.tmdbDirector,
          tmdbRuntimeMin: metaForResponse.tmdbRuntimeMin,
          effectiveSeason: metaForResponse.effectiveSeason,
          effectiveEpisode: metaForResponse.effectiveEpisode,
        })
      );
    }
    if (
      !launchedFlags.embed69 &&
      (metaForResponse.resolvedTmdbId || metaForResponse.combinedTitleHints.length > 0)
    ) {
      wave2Promises.push(
        launchEmbed69({
          tmdbId: metaForResponse.resolvedTmdbId,
          imdbId: metaForResponse.tmdbImdbId,
          mediaType: metaForResponse.effectiveMediaType,
          season: metaForResponse.effectiveSeason,
          episode: metaForResponse.effectiveEpisode,
          titleHints: metaForResponse.combinedTitleHints,
          yearHint: metaForResponse.effectiveYearForExtract,
          directorHint: metaForResponse.tmdbDirector || undefined,
          runtimeMinHint: metaForResponse.tmdbRuntimeMin || undefined,
        })
      );
    }
    if (!launchedFlags.vest && metaForResponse.shouldQueryVest) {
      wave2Promises.push(
        launchVest({
          vestUrl: metaForResponse.effectiveVestUrl || undefined,
          tmdbId: metaForResponse.resolvedTmdbId,
          mediaType: metaForResponse.effectiveMediaType,
          yearHint: metaForResponse.effectiveYearForExtract,
          season: metaForResponse.effectiveSeason,
          episode: metaForResponse.effectiveEpisode,
          titleHints: metaForResponse.combinedTitleHints,
        })
      );
    }
    if (metaForResponse.resolvedTmdbId) {
      wave2Promises.push(
        launchEnglishAndDirect({
          tmdbId: metaForResponse.resolvedTmdbId,
          imdbId: metaForResponse.tmdbImdbId,
          mediaType: metaForResponse.effectiveMediaType,
          season: metaForResponse.effectiveSeason,
          episode: metaForResponse.effectiveEpisode,
          originalLanguage: metaForResponse.tmdbOriginalLanguage,
        })
      );
    }
    if (metaForResponse.effectiveMediaType === 'tv') {
      wave2Promises.push(
        launchSpanishTvExtras({
          tmdbId: metaForResponse.resolvedTmdbId,
          mediaType: metaForResponse.effectiveMediaType,
          season: metaForResponse.effectiveSeason,
          episode: metaForResponse.effectiveEpisode,
          titleHints: metaForResponse.combinedTitleHints,
          episodeTitle: metaForResponse.resolvedEpisodeTitle || episodeTitleHint,
          originalLanguage: metaForResponse.tmdbOriginalLanguage,
        })
      );
    }

    stage2AllPromise = Promise.all(wave2Promises);
    stage2AllPromise.catch(() => {});
    stage2AllPromise.finally(() => {
      clearEarlyWinTimers();
    });

    settledAllAtResponse = false;
    await Promise.race([
      fastDirectReadyPromise,
      stage2AllPromise.then(() => {
        settledAllAtResponse = true;
      }),
    ]);
    clearEarlyWinTimers();

    resolvedSelection = await attemptResolveDiscovered();
    if (!resolvedSelection && !settledAllAtResponse) {
      await stage2AllPromise;
      settledAllAtResponse = true;
      resolvedSelection = await attemptResolveDiscovered();
    }
  }

  const effectiveMediaType = metaForResponse?.effectiveMediaType ?? initialMediaType;
  const effectiveSeason = metaForResponse?.effectiveSeason ?? initialSeason;
  const effectiveEpisode = metaForResponse?.effectiveEpisode ?? initialEpisode;
  const resolvedTmdbId = metaForResponse?.resolvedTmdbId ?? initialNumericTmdbId;
  const hasExplicitMovidyUrl = metaForResponse?.hasExplicitMovidyUrl ?? Boolean(initialMovidyUrl);
  const hasExplicitGnulaUrl = metaForResponse?.hasExplicitGnulaUrl ?? Boolean(initialGnulaUrl);
  const extractedMovidyCleanTitle = metaForResponse?.extractedMovidyCleanTitle ?? '';
  const extractedGnulaCleanTitle = metaForResponse?.extractedGnulaCleanTitle ?? '';
  const tmdbResolvedTitle = metaForResponse?.tmdbResolvedTitle ?? '';
  const tmdbOriginalLanguage = metaForResponse?.tmdbOriginalLanguage ?? '';
  const isUnreleasedEpisode = metaForResponse?.isUnreleasedEpisode ?? false;
  const effectiveEpisodeTitleHint = metaForResponse?.resolvedEpisodeTitle || episodeTitleHint;

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

    // Background cache enrichment: let slower servers finish after 0ms early return and update cache cleanly
    if (!settledAllAtResponse) {
      Promise.all([stage2AllPromise, metadataPromise.catch(() => null)])
        .then(async ([, bgMeta]) => {
          const fullCollected = collectDiscoveredTracks();
          if (fullCollected.allDiscovered.length <= initialCollected.allDiscovered.length) return;
          const fullRanked = rankCandidateTracks({
            allDiscovered: fullCollected.allDiscovered,
            preferLang,
            isVestLink,
            hasExplicitMovidyUrl: bgMeta?.hasExplicitMovidyUrl ?? hasExplicitMovidyUrl,
            hasExplicitGnulaUrl: bgMeta?.hasExplicitGnulaUrl ?? hasExplicitGnulaUrl,
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
            extractedMovidyCleanTitle: bgMeta?.extractedMovidyCleanTitle ?? extractedMovidyCleanTitle,
            extractedGnulaCleanTitle: bgMeta?.extractedGnulaCleanTitle ?? extractedGnulaCleanTitle,
            tmdbResolvedTitle: bgMeta?.tmdbResolvedTitle ?? tmdbResolvedTitle,
            effectiveMediaType: bgMeta?.effectiveMediaType ?? effectiveMediaType,
            effectiveSeason: bgMeta?.effectiveSeason ?? effectiveSeason,
            effectiveEpisode: bgMeta?.effectiveEpisode ?? effectiveEpisode,
            vestDetailMeta: fullCollected.vestMeta,
            vestSubtitles: fullCollected.vestSubs,
            clipboxSubtitles: fullCollected.clipboxSubs,
            ghostflixSubtitles: fullCollected.ghostflixSubs,
            extraSubtitles: fullCollected.montepinarSubs,
            resolvedTmdbId: bgMeta?.resolvedTmdbId ?? resolvedTmdbId,
            subtitlesPromise,
          });
          setCache(cacheKey, enrichedResult);
        })
        .catch(() => {});
    }

    return sendOk(result);
  }

  const fallbackMeta = metaForResponse || (await metadataPromise.catch(() => null));
  const fallbackResult = await buildFallbackCatalogResult({
    titleHint,
    extractedMovidyCleanTitle: fallbackMeta?.extractedMovidyCleanTitle ?? extractedMovidyCleanTitle,
    extractedGnulaCleanTitle: fallbackMeta?.extractedGnulaCleanTitle ?? extractedGnulaCleanTitle,
    tmdbResolvedTitle: fallbackMeta?.tmdbResolvedTitle ?? tmdbResolvedTitle,
    tmdbOriginalLanguage: fallbackMeta?.tmdbOriginalLanguage ?? tmdbOriginalLanguage,
    isUnreleasedEpisode: fallbackMeta?.isUnreleasedEpisode ?? isUnreleasedEpisode,
    effectiveMediaType: fallbackMeta?.effectiveMediaType ?? effectiveMediaType,
    effectiveSeason: fallbackMeta?.effectiveSeason ?? effectiveSeason,
    effectiveEpisode: fallbackMeta?.effectiveEpisode ?? effectiveEpisode,
    episodeTitleHint: fallbackMeta?.resolvedEpisodeTitle || effectiveEpisodeTitleHint,
    preferLang,
    resolvedTmdbId: fallbackMeta?.resolvedTmdbId ?? resolvedTmdbId,
    rawInput,
    isSandboxedFrame,
    directOnly,
  });
  if (fallbackResult) {
    setCache(cacheKey, fallbackResult);
    return sendOk(fallbackResult);
  }

  const finalUnavailable = fallbackMeta ?? metaForResponse;
  if (sendUnavailable) {
    if (finalUnavailable?.isUnreleasedEpisode) {
      const [y, m, d] = finalUnavailable.episodeAirDate.split('-');
      const formattedDate = y && m && d ? `${d}/${m}/${y}` : finalUnavailable.episodeAirDate;
      return sendUnavailable(404, {
        success: false,
        unreleased: true,
        airDate: finalUnavailable.episodeAirDate,
        canUseCloudBrowser: false,
        error: `Este capítulo aún no se ha estrenado (estreno previsto: ${formattedDate}).`,
      });
    }
    if ((finalUnavailable?.tmdbOriginalLanguage ?? tmdbOriginalLanguage) === 'es' && preferLang === 'ES') {
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

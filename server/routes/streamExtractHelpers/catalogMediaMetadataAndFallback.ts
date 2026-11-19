import {
  generateSpanishTitleHints,
  type ExtractedStreamResult,
  type TrackRecord,
} from '../../extractors/httpHelpers.ts';
import {
  fetchMovidyPageMetadata,
  isMovidyVerUrl,
  normalizeMovidyUrl,
  verifyMovidyMetaMatch,
  type MovidyPageMetadata,
} from '../../extractors/bingetrixMovidy.ts';
import {
  fetchGnulaPageMetadata,
  isGnulaHdUrl,
  normalizeGnulaUrl,
  verifyGnulaMetaMatch,
  type GnulaPageMetadata,
} from '../../extractors/gnulaHdExtractor.ts';
import { fetchTmdbJson } from '../../services/tmdbService.ts';
import {
  fetchVestDetailPage,
  findVestSeedForMedia,
  isVestMirrorUrl,
  type VestParsedDetail,
} from '../../services/vestMirrorService.ts';
import {
  extractLocalizedTmdbTitleHints,
  resolveTmdbIdByTitle,
} from '../../services/tmdbCatalogHelpers.ts';
import {
  buildWebEmbedTracks,
  searchYouTubeFullFallback,
} from '../../services/streamExtractFallback.ts';

export interface ResolvedCatalogMetadata {
  effectiveMediaType: 'movie' | 'tv';
  effectiveSeason: number;
  effectiveEpisode: number;
  resolvedTmdbId: string | number | null;
  hasExplicitMovidyUrl: boolean;
  effectiveMovidyUrl: string;
  hasExplicitGnulaUrl: boolean;
  effectiveGnulaUrl: string;
  effectiveVestUrl: string;
  extractedMovidyMeta: MovidyPageMetadata | null;
  extractedMovidyCleanTitle: string;
  extractedMovidyYear: string;
  extractedGnulaMeta: GnulaPageMetadata | null;
  extractedGnulaCleanTitle: string;
  extractedGnulaYear: string;
  extractedVestDetail: VestParsedDetail | null;
  tmdbVerifiedYear: string;
  tmdbDirector: string;
  tmdbRuntimeMin: number;
  tmdbImdbId: string | null;
  tmdbResolvedTitle: string;
  combinedTitleHints: string[];
  effectiveYearForExtract: string | undefined;
  shouldQueryVest: boolean;
}

export async function resolveCatalogMediaMetadata(opts: {
  rawInput: string;
  movidyUrlParam: string;
  gnulaUrlParam: string;
  vestUrlParam: string;
  preferLang: string;
  titleHint: string;
  origTitleHint: string;
  yearParam: string;
  mediaTypeParam: string;
  tmdbIdParam: string;
  seasonParam?: number;
  episodeParam?: number;
  tmdbApiKey: string;
  bingetrixTvMatch: RegExpMatchArray | null;
  bingetrixMovieMatch: RegExpMatchArray | null;
  externalEmbedTvMatch: RegExpMatchArray | null;
  externalEmbedMovieMatch: RegExpMatchArray | null;
}): Promise<ResolvedCatalogMetadata> {
  const {
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
    tmdbApiKey,
    bingetrixTvMatch,
    bingetrixMovieMatch,
    externalEmbedTvMatch,
    externalEmbedMovieMatch,
  } = opts;

  let effectiveMediaType: 'movie' | 'tv' =
    mediaTypeParam === 'tv' || Boolean(bingetrixTvMatch) || Boolean(externalEmbedTvMatch)
      ? 'tv'
      : 'movie';

  const effectiveSeason = bingetrixTvMatch
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
        )}?api_key=${tmdbApiKey}&external_source=imdb_id`,
        { signal: AbortSignal.timeout(3500) }
      );
      if (findRes.ok) {
        const findJson: any = await findRes.json();
        const hit =
          effectiveMediaType === 'tv'
            ? findJson?.tv_results?.[0] || findJson?.movie_results?.[0]
            : findJson?.movie_results?.[0] || findJson?.tv_results?.[0];
        if (hit?.id) resolvedTmdbId = hit.id;
      }
    } catch {
      // keep original id fallback
    }
  }

  let hasExplicitMovidyUrl = isMovidyVerUrl(movidyUrlParam) || isMovidyVerUrl(rawInput);
  let effectiveMovidyUrl = isMovidyVerUrl(movidyUrlParam)
    ? normalizeMovidyUrl(movidyUrlParam)
    : isMovidyVerUrl(rawInput)
    ? normalizeMovidyUrl(rawInput)
    : '';

  let hasExplicitGnulaUrl = isGnulaHdUrl(gnulaUrlParam) || isGnulaHdUrl(rawInput);
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
      if (!mediaTypeParam) effectiveMediaType = extractedVestDetail.mediaType;
      if (!episodeParam && extractedVestDetail.currentEpisodeNumber > 0) {
        effectiveEpisode = extractedVestDetail.currentEpisodeNumber;
      }
      if (!extractedMovidyCleanTitle) extractedMovidyCleanTitle = extractedVestDetail.cleanTitle;
      const vestSeed = findVestSeedForMedia({ titleHints: [extractedVestDetail.cleanTitle] });
      if (!resolvedTmdbId && vestSeed?.tmdbId) resolvedTmdbId = vestSeed.tmdbId;
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
      resolvedTmdbId = await resolveTmdbIdByTitle(pageTitle, effectiveMediaType, pageYear);
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
      resolvedTmdbId = await resolveTmdbIdByTitle(slug, effectiveMediaType, extractedMovidyYear);
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
        tmdbVerifiedYear =
          String(tmJson?.release_date || tmJson?.first_air_date || '').split('-')[0] || '';
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
    for (const v of generateSpanishTitleHints(h)) expandedHints.push(v);
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

  return {
    effectiveMediaType,
    effectiveSeason,
    effectiveEpisode,
    resolvedTmdbId,
    hasExplicitMovidyUrl,
    effectiveMovidyUrl,
    hasExplicitGnulaUrl,
    effectiveGnulaUrl,
    effectiveVestUrl,
    extractedMovidyMeta,
    extractedMovidyCleanTitle,
    extractedMovidyYear,
    extractedGnulaMeta,
    extractedGnulaCleanTitle,
    extractedGnulaYear,
    extractedVestDetail,
    tmdbVerifiedYear,
    tmdbDirector,
    tmdbRuntimeMin,
    tmdbImdbId,
    tmdbResolvedTitle,
    combinedTitleHints,
    effectiveYearForExtract,
    shouldQueryVest,
  };
}

export async function buildFallbackCatalogResult(opts: {
  titleHint: string;
  extractedMovidyCleanTitle: string;
  extractedGnulaCleanTitle: string;
  tmdbResolvedTitle: string;
  effectiveMediaType: 'movie' | 'tv';
  effectiveSeason: number;
  effectiveEpisode: number;
  episodeTitleHint: string;
  preferLang: string;
  resolvedTmdbId: string | number | null;
  rawInput: string;
  isSandboxedFrame: boolean;
}): Promise<ExtractedStreamResult | null> {
  const {
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
  } = opts;

  const fallbackBaseTitle =
    titleHint || extractedMovidyCleanTitle || extractedGnulaCleanTitle || tmdbResolvedTitle || '';
  const displayFallbackTitle =
    titleHint ||
    (fallbackBaseTitle
      ? effectiveMediaType === 'tv'
        ? `${fallbackBaseTitle} · ${effectiveSeason}x${String(effectiveEpisode).padStart(2, '0')}`
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

  if (combinedFallbackTracks.length === 0) return null;

  const firstTrack = combinedFallbackTracks[0];
  const fallbackMode: ExtractedStreamResult['mode'] =
    firstTrack.resolverType === 'youtube' ? 'youtube' : 'embed';
  const resolvedLang = String(firstTrack.lang || 'EN').toUpperCase();
  return {
    success: true,
    mode: fallbackMode,
    streamUrl: firstTrack.resolvedStreamUrl || firstTrack.sourceUrl,
    rawStreamUrl: firstTrack.sourceUrl,
    youtubeId: firstTrack.resolverType === 'youtube' ? firstTrack.resolvedStreamUrl : undefined,
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
}

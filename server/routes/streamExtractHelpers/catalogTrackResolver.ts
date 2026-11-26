/**
 * @module server/routes/streamExtractHelpers/catalogTrackResolver
 * @description Resolves ordered stream candidate tracks into native HLS/MP4 URLs with optional directOnly mode.
 */
import {
  buildHlsProxyUrl,
  buildTsProxyUrl,
  type ExtractedStreamResult,
  type SubtitleTrackOutput,
  type TrackRecord,
} from '../../extractors/httpHelpers.ts';
import { unpackVidhideToHls } from '../../extractors/vidhideEmbed69.ts';
import {
  extractMovidyPageTracks,
  findMovidyUrlByTitle,
  resolveMovidyEmbedTrack,
} from '../../extractors/bingetrixMovidy.ts';
import {
  extractGnulaHdTracks,
  findGnulaHdUrlByTitle,
} from '../../extractors/gnulaHdExtractor.ts';
import { sniffStreamWithHeadless } from '../../extractors/sportsExtractor.ts';
import {
  toProxiedEmbedUrl,
  verifyWebEmbedCandidateAlive,
} from '../../services/streamExtractFallback.ts';
import { normalizeTrackLangCode } from '../../services/trackRankingService.ts';
import { LruTtlCache } from '../../utils/lruCache.ts';

const deadTrackUrlCache = new LruTtlCache<string, true>(500, 3 * 60 * 1000);

export interface SubtitleCandidateRecord {
  id?: string;
  label?: string;
  lang?: string;
  url: string;
  source?: string;
}

function withExtractTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    p.catch(() => fallback),
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

export async function resolveMovidyTracksForCatalog(opts: {
  effectiveMovidyUrl: string;
  combinedTitleHints: string[];
  effectiveYearForExtract?: string;
  effectiveMediaType: 'movie' | 'tv';
  resolvedTmdbId?: string | number | null;
  tmdbDirector?: string;
  tmdbRuntimeMin?: number;
}): Promise<TrackRecord[]> {
  try {
    let mvUrl = opts.effectiveMovidyUrl;
    if (!mvUrl && opts.combinedTitleHints.length > 0) {
      mvUrl =
        (await findMovidyUrlByTitle(opts.combinedTitleHints[0], opts.effectiveYearForExtract, {
          expectedDirector: opts.effectiveMediaType === 'movie' ? opts.tmdbDirector || undefined : undefined,
          expectedRuntimeMin:
            opts.effectiveMediaType === 'movie' ? opts.tmdbRuntimeMin || undefined : undefined,
          titleHints: opts.combinedTitleHints,
          expectedMediaType: opts.effectiveMediaType,
        })) || '';
    }
    if (!mvUrl) return [];
    return await extractMovidyPageTracks(mvUrl, {
      expectedYear: opts.effectiveYearForExtract,
      requireMovieOnly: opts.effectiveMediaType === 'movie',
      expectedTitleHints:
        opts.resolvedTmdbId || opts.combinedTitleHints.length > 0 ? opts.combinedTitleHints : undefined,
      expectedDirector: opts.effectiveMediaType === 'movie' ? opts.tmdbDirector || undefined : undefined,
      expectedRuntimeMin:
        opts.effectiveMediaType === 'movie' ? opts.tmdbRuntimeMin || undefined : undefined,
    });
  } catch {
    return [];
  }
}

export async function resolveGnulaTracksForCatalog(opts: {
  effectiveGnulaUrl: string;
  combinedTitleHints: string[];
  effectiveYearForExtract?: string;
  effectiveMediaType: 'movie' | 'tv';
  resolvedTmdbId?: string | number | null;
  tmdbDirector?: string;
  tmdbRuntimeMin?: number;
  effectiveSeason: number;
  effectiveEpisode: number;
}): Promise<TrackRecord[]> {
  try {
    let gnUrl = opts.effectiveGnulaUrl;
    if (!gnUrl && opts.combinedTitleHints.length > 0) {
      gnUrl =
        (await findGnulaHdUrlByTitle(opts.combinedTitleHints, opts.effectiveYearForExtract, {
          expectedDirector: opts.effectiveMediaType === 'movie' ? opts.tmdbDirector || undefined : undefined,
          expectedRuntimeMin:
            opts.effectiveMediaType === 'movie' ? opts.tmdbRuntimeMin || undefined : undefined,
          titleHints: opts.combinedTitleHints,
          expectedMediaType: opts.effectiveMediaType,
        })) || '';
    }
    if (!gnUrl) return [];
    return await extractGnulaHdTracks(gnUrl, {
      expectedYear: opts.effectiveYearForExtract,
      expectedTitleHints:
        opts.resolvedTmdbId || opts.combinedTitleHints.length > 0 ? opts.combinedTitleHints : undefined,
      expectedDirector: opts.effectiveMediaType === 'movie' ? opts.tmdbDirector || undefined : undefined,
      expectedRuntimeMin:
        opts.effectiveMediaType === 'movie' ? opts.tmdbRuntimeMin || undefined : undefined,
      mediaType: opts.effectiveMediaType,
      season: opts.effectiveSeason,
      episode: opts.effectiveEpisode,
    });
  } catch {
    return [];
  }
}

export interface ResolvedCandidateTracksResult {
  primaryStreamUrl: string;
  primaryMode: 'hls' | 'direct' | 'embed';
  resolvedTrack: TrackRecord | null;
  validTracks: TrackRecord[];
}

export async function resolveOrderedCandidateTracks(opts: {
  orderedTracks: TrackRecord[];
  getLangScore: (lang: string) => number;
  sourcePriority: (tr: TrackRecord) => number;
  getTrackHealthScore: (tr: TrackRecord) => number;
  isSandboxedFrame: boolean;
  directOnly?: boolean;
}): Promise<ResolvedCandidateTracksResult | null> {
  const {
    orderedTracks,
    getLangScore,
    sourcePriority,
    getTrackHealthScore,
    isSandboxedFrame,
    directOnly = false,
  } = opts;

  let primaryStreamUrl = '';
  let primaryMode: 'hls' | 'direct' | 'embed' = 'hls';
  let resolvedTrack: TrackRecord | null = null;
  const deadTrackIndices = new Set<number>();

  const tierScores = Array.from(new Set(orderedTracks.map((t) => getLangScore(t.lang)))).sort(
    (a, b) => a - b
  );

  const allWebEmbedCandidates: { idx: number; track: TrackRecord; url: string }[] = [];

  const resolveSingleNativeCandidate = async (
    idx: number,
    candidate: TrackRecord
  ): Promise<{ streamUrl: string; mode: 'hls' | 'direct'; track: TrackRecord } | null> => {
    if (candidate.sourceUrl && deadTrackUrlCache.get(candidate.sourceUrl)) {
      deadTrackIndices.add(idx);
      return null;
    }
    if (candidate.resolverType === 'movidy_embed') {
      const resolvedMv = await withExtractTimeout(
        resolveMovidyEmbedTrack(candidate.sourceUrl),
        2000,
        null
      );
      if (resolvedMv?.mode === 'hls') {
        orderedTracks[idx] = { ...candidate, resolvedStreamUrl: resolvedMv.proxyUrl };
        return { streamUrl: resolvedMv.proxyUrl, mode: 'hls', track: orderedTracks[idx] };
      }
      if (!directOnly && resolvedMv?.mode === 'embed') {
        orderedTracks[idx] = {
          ...candidate,
          resolverType: 'web_embed',
          sourceUrl: resolvedMv.embedUrl,
        };
        allWebEmbedCandidates.push({
          idx,
          track: orderedTracks[idx],
          url: resolvedMv.embedUrl,
        });
        return null;
      }
      if (candidate.sourceUrl) deadTrackUrlCache.set(candidate.sourceUrl, true);
      deadTrackIndices.add(idx);
      return null;
    }

    if (candidate.resolverType === 'vidhide_hls') {
      const unpacked = await withExtractTimeout(unpackVidhideToHls(candidate.sourceUrl), 2100, null);
      if (unpacked) {
        orderedTracks[idx] = { ...candidate, resolvedStreamUrl: unpacked.proxyUrl };
        return { streamUrl: unpacked.proxyUrl, mode: 'hls', track: orderedTracks[idx] };
      }
      if (candidate.sourceUrl) deadTrackUrlCache.set(candidate.sourceUrl, true);
      deadTrackIndices.add(idx);
      return null;
    }

    if (candidate.resolverType === 'embed_sniff') {
      const sniffed = await withExtractTimeout(
        sniffStreamWithHeadless(candidate.sourceUrl),
        2500,
        null
      );
      if (sniffed) {
        const proxiedUrl = sniffed.isDirectMp4
          ? buildTsProxyUrl(sniffed.streamUrl, sniffed.referer)
          : buildHlsProxyUrl(sniffed.streamUrl, sniffed.referer);
        orderedTracks[idx] = { ...candidate, resolvedStreamUrl: proxiedUrl };
        return {
          streamUrl: proxiedUrl,
          mode: sniffed.isDirectMp4 ? 'direct' : 'hls',
          track: orderedTracks[idx],
        };
      }
      if (candidate.sourceUrl) deadTrackUrlCache.set(candidate.sourceUrl, true);
      deadTrackIndices.add(idx);
      return null;
    }

    return null;
  };

  const NATIVE_PROBE_WAVE_SIZE = 8;

  // Pass 1: Exhaust ALL native HLS/MP4 tracks across every language tier BEFORE ever accepting a web_embed
  for (const tierScore of tierScores) {
    const unresolvedNativeIndices: number[] = [];

    for (let i = 0; i < orderedTracks.length; i++) {
      if (getLangScore(orderedTracks[i].lang) !== tierScore) continue;
      const candidate = orderedTracks[i];

      if (candidate.resolverType === 'web_embed') {
        if (!directOnly && candidate.sourceUrl) {
          allWebEmbedCandidates.push({ idx: i, track: candidate, url: candidate.sourceUrl });
        } else {
          deadTrackIndices.add(i);
        }
        continue;
      }

      if (candidate.resolvedStreamUrl) {
        if (!primaryStreamUrl) {
          primaryStreamUrl = candidate.resolvedStreamUrl;
          primaryMode = candidate.resolverType === 'direct_mp4' ? 'direct' : 'hls';
          resolvedTrack = candidate;
        }
        continue;
      }

      unresolvedNativeIndices.push(i);
    }

    if (primaryStreamUrl) break;

    for (let w = 0; w < unresolvedNativeIndices.length; w += NATIVE_PROBE_WAVE_SIZE) {
      const wave = unresolvedNativeIndices.slice(w, w + NATIVE_PROBE_WAVE_SIZE);
      const waveResults = await Promise.all(
        wave.map((idx) => resolveSingleNativeCandidate(idx, orderedTracks[idx]))
      );
      const firstWinner = waveResults.find(
        (res): res is { streamUrl: string; mode: 'hls' | 'direct'; track: TrackRecord } =>
          Boolean(res && res.streamUrl)
      );
      if (firstWinner) {
        primaryStreamUrl = firstWinner.streamUrl;
        primaryMode = firstWinner.mode;
        resolvedTrack = firstWinner.track;
        break;
      }
    }

    if (primaryStreamUrl) break;
  }

  // Pass 2: Only if zero native streams succeeded across all languages, fall back to verified web embeds
  if (!primaryStreamUrl && !directOnly && allWebEmbedCandidates.length > 0) {
    allWebEmbedCandidates.sort(
      (a, b) =>
        getLangScore(a.track.lang) - getLangScore(b.track.lang) ||
        sourcePriority(a.track) - sourcePriority(b.track) ||
        getTrackHealthScore(a.track) - getTrackHealthScore(b.track)
    );
    const EMBED_BATCH_SIZE = 4;
    for (let i = 0; i < allWebEmbedCandidates.length; i += EMBED_BATCH_SIZE) {
      const batch = allWebEmbedCandidates.slice(i, i + EMBED_BATCH_SIZE);
      const checks = await Promise.all(
        batch.map(async (cand) => ({
          cand,
          alive: deadTrackUrlCache.get(cand.url)
            ? false
            : await verifyWebEmbedCandidateAlive(cand.track, cand.url).catch(() => false),
        }))
      );
      const firstAlive = checks.find((c) => c.alive);
      for (const c of checks) {
        if (!c.alive) {
          deadTrackUrlCache.set(c.cand.url, true);
          deadTrackIndices.add(c.cand.idx);
        }
      }
      if (firstAlive) {
        const proxiedWeb = toProxiedEmbedUrl(firstAlive.cand.url, isSandboxedFrame);
        orderedTracks[firstAlive.cand.idx] = {
          ...firstAlive.cand.track,
          resolvedStreamUrl: proxiedWeb,
        };
        primaryStreamUrl = proxiedWeb;
        primaryMode = 'embed';
        resolvedTrack = orderedTracks[firstAlive.cand.idx];
        break;
      }
    }
  }

  if (!primaryStreamUrl) return null;

  const langsWithNativeTracks = new Set(
    orderedTracks
      .filter((tr, idx) => !deadTrackIndices.has(idx) && tr.resolverType !== 'web_embed')
      .map((tr) => normalizeTrackLangCode(tr.lang))
  );
  const validTracks = orderedTracks.filter(
    (tr, idx) =>
      !deadTrackIndices.has(idx) &&
      (!directOnly || tr.resolverType !== 'web_embed') &&
      (primaryMode === 'embed' ||
        tr.resolverType !== 'web_embed' ||
        !langsWithNativeTracks.has(normalizeTrackLangCode(tr.lang)))
  );

  return {
    primaryStreamUrl,
    primaryMode,
    resolvedTrack,
    validTracks,
  };
}

export async function buildResolvedCatalogStreamResult(opts: {
  resolvedSelection: ResolvedCandidateTracksResult;
  preferLang: string;
  titleHint: string;
  extractedMovidyCleanTitle: string;
  extractedGnulaCleanTitle: string;
  tmdbResolvedTitle: string;
  effectiveMediaType: 'movie' | 'tv';
  effectiveSeason: number;
  effectiveEpisode: number;
  vestDetailMeta?: {
    currentEpisodeNumber?: number;
    coverVerticalUrl?: string;
    coverHorizontalUrl?: string;
  } | null;
  vestSubtitles: SubtitleCandidateRecord[];
  clipboxSubtitles: SubtitleCandidateRecord[];
  ghostflixSubtitles: SubtitleCandidateRecord[];
  extraSubtitles?: SubtitleCandidateRecord[];
  resolvedTmdbId: string | number | null;
  subtitlesPromise: Promise<SubtitleCandidateRecord[]>;
}): Promise<ExtractedStreamResult> {
  const { primaryStreamUrl, primaryMode, resolvedTrack, validTracks } = opts.resolvedSelection;
  const requestedNormLang = normalizeTrackLangCode(opts.preferLang);
  const resolvedLang = normalizeTrackLangCode(resolvedTrack?.lang || opts.preferLang);
  const resolvedLabel = resolvedTrack?.label || opts.preferLang;
  const availableLanguages = Array.from(
    new Set(validTracks.map((t) => normalizeTrackLangCode(t.lang)).filter(Boolean))
  );
  const languageFallbackUsed =
    (requestedNormLang === 'ES' && resolvedLang !== 'ES') ||
    (requestedNormLang === 'LAT' && resolvedLang !== 'LAT') ||
    (requestedNormLang === 'VOSE' && resolvedLang !== 'VOSE') ||
    (requestedNormLang === 'EN' && resolvedLang !== 'EN');

  const baseCleanTitle =
    opts.extractedMovidyCleanTitle || opts.extractedGnulaCleanTitle || opts.tmdbResolvedTitle;
  const displayTitle =
    opts.titleHint ||
    (baseCleanTitle
      ? opts.effectiveMediaType === 'tv'
        ? `${baseCleanTitle} · ${
            opts.vestDetailMeta &&
            (opts.vestDetailMeta.currentEpisodeNumber || 0) > 1 &&
            opts.effectiveSeason === 1
              ? `Ep. ${opts.vestDetailMeta.currentEpisodeNumber}`
              : `${opts.effectiveSeason}x${String(opts.effectiveEpisode).padStart(2, '0')}`
          }`
        : baseCleanTitle
      : 'RiffanTV HD');

  const rawMergedSubs: SubtitleCandidateRecord[] = [
    ...(opts.extraSubtitles || []),
    ...opts.vestSubtitles,
    ...opts.clipboxSubtitles,
    ...opts.ghostflixSubtitles,
  ];
  // Client player already fetches /api/subtitles/search asynchronously; only collect already-warm subtitles (<40ms)
  if (opts.resolvedTmdbId || baseCleanTitle || opts.titleHint) {
    const searchedSubs = await withExtractTimeout(opts.subtitlesPromise, 40, [] as SubtitleCandidateRecord[]);
    rawMergedSubs.push(...searchedSubs);
  }
  const seenSubUrls = new Set<string>();
  const combinedSubtitles: SubtitleTrackOutput[] = [];
  for (const s of rawMergedSubs) {
    const u = String(s?.url || '').trim();
    if (!u || seenSubUrls.has(u)) continue;
    seenSubUrls.add(u);
    const langCode = String(s?.lang || 'ES').trim().toUpperCase() || 'ES';
    combinedSubtitles.push({
      id: String(s?.id || `sub-${langCode.toLowerCase()}-${combinedSubtitles.length}`),
      label: String(s?.label || langCode),
      lang: langCode,
      url: u,
      ...(s?.source ? { source: s.source } : {}),
    });
  }

  const cacheTtlMs =
    primaryMode === 'hls' && !languageFallbackUsed
      ? 8 * 60 * 1000
      : primaryMode === 'hls'
      ? 90 * 1000
      : 20 * 1000;
  return {
    success: true,
    mode: primaryMode,
    streamUrl: primaryStreamUrl,
    title: displayTitle,
    poster: opts.vestDetailMeta?.coverVerticalUrl
      ? `/api/img-proxy?url=${encodeURIComponent(opts.vestDetailMeta.coverVerticalUrl)}`
      : undefined,
    backdrop: opts.vestDetailMeta?.coverHorizontalUrl
      ? `/api/img-proxy?url=${encodeURIComponent(opts.vestDetailMeta.coverHorizontalUrl)}`
      : undefined,
    tracks: validTracks,
    subtitles: combinedSubtitles.length > 0 ? combinedSubtitles : undefined,
    requestedLang: opts.preferLang,
    resolvedLang,
    resolvedLabel,
    languageFallbackUsed,
    availableLanguages,
    expiresAt: Date.now() + cacheTtlMs,
  };
}

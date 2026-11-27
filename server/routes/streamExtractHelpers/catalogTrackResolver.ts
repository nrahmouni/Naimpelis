/**
 * @module server/routes/streamExtractHelpers/catalogTrackResolver
 * @description Resolves ordered stream candidate tracks into native HLS/MP4 URLs with optional directOnly mode.
 */
import { LruTtlCache } from '../../utils/lruCache.ts';
import { normalizeTrackLangCode } from '../../services/trackRankingService.ts';
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
import {
  parseInternalXtreamVodUrl,
  probeInternalXtreamVodUrl,
} from '../../services/xtreamVodMatcher.ts';

export const deadTrackUrlCache = new LruTtlCache<string, true>(1000, 40 * 60 * 1000);

export interface SubtitleCandidateRecord {
  id?: string;
  label?: string;
  lang?: string;
  url: string;
  source?: string;
}

export interface ResolveTrackHooks {
  unpackVidhideToHls?: (
    url: string,
    signal?: AbortSignal
  ) => Promise<{ rawM3u8: string; proxyUrl: string } | null>;
  resolveMovidyEmbedTrack?: (
    url: string,
    signal?: AbortSignal
  ) => Promise<Awaited<ReturnType<typeof resolveMovidyEmbedTrack>>>;
  sniffStreamWithHeadless?: typeof sniffStreamWithHeadless;
  verifyWebEmbedCandidateAlive?: (
    track: TrackRecord,
    url: string,
    signal?: AbortSignal
  ) => Promise<boolean>;
}

function withExtractTimeout<T>(
  p: Promise<T>,
  ms: number,
  fallback: T,
  signal?: AbortSignal
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    let settled = false;
    const onAbort = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', onAbort);
      resolve(fallback);
    }, ms);
    timer.unref?.();
    signal?.addEventListener('abort', onAbort, { once: true });

    Promise.resolve(p)
      .then((val) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        resolve(val);
      })
      .catch((err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        if (signal?.aborted || (err instanceof Error && err.name === 'AbortError')) {
          reject(err);
          return;
        }
        resolve(fallback);
      });
  });
}

function getDeadCacheKey(url?: string): string {
  return String(url || '').trim();
}

function isTrackUrlKnownDead(url?: string): boolean {
  const k = getDeadCacheKey(url);
  return Boolean(k && deadTrackUrlCache.get(k));
}

function markTrackUrlDead(url?: string): void {
  const k = getDeadCacheKey(url);
  if (k) deadTrackUrlCache.set(k, true);
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
  resolveTrackHooks?: ResolveTrackHooks;
}): Promise<ResolvedCandidateTracksResult | null> {
  const {
    orderedTracks,
    getLangScore,
    sourcePriority,
    getTrackHealthScore,
    isSandboxedFrame,
    directOnly = false,
    resolveTrackHooks,
  } = opts;

  const unpackVidhideFn = resolveTrackHooks?.unpackVidhideToHls || ((url: string) => unpackVidhideToHls(url));
  const resolveMovidyFn =
    resolveTrackHooks?.resolveMovidyEmbedTrack || ((url: string) => resolveMovidyEmbedTrack(url));
  const sniffHeadlessFn = resolveTrackHooks?.sniffStreamWithHeadless || sniffStreamWithHeadless;
  const verifyWebEmbedFn =
    resolveTrackHooks?.verifyWebEmbedCandidateAlive ||
    ((track: TrackRecord, url: string) => verifyWebEmbedCandidateAlive(track, url));

  let primaryStreamUrl = '';
  let primaryMode: 'hls' | 'direct' | 'embed' = 'hls';
  let resolvedTrack: TrackRecord | null = null;
  const deadTrackIndices = new Set<number>();

  const tierScores = Array.from(new Set(orderedTracks.map((t) => getLangScore(t.lang)))).sort(
    (a, b) => a - b
  );

  for (const tierScore of tierScores) {
    const tierWebEmbedCandidates: { idx: number; track: TrackRecord; url: string }[] = [];
    const tierAsyncMirrors: Array<{ idx: number; track: TrackRecord }> = [];

    for (let i = 0; i < orderedTracks.length; i++) {
      if (getLangScore(orderedTracks[i].lang) !== tierScore) continue;
      const candidate = orderedTracks[i];
      const checkUrl = candidate.resolvedStreamUrl || candidate.sourceUrl;

      if (isTrackUrlKnownDead(checkUrl)) {
        deadTrackIndices.add(i);
        continue;
      }

      if (candidate.resolverType === 'web_embed') {
        if (!directOnly && candidate.sourceUrl) {
          tierWebEmbedCandidates.push({ idx: i, track: candidate, url: candidate.sourceUrl });
        } else {
          deadTrackIndices.add(i);
        }
        continue;
      }

      if (candidate.resolvedStreamUrl) {
        if (
          process.env.NODE_ENV !== 'test' &&
          parseInternalXtreamVodUrl(candidate.resolvedStreamUrl) !== null
        ) {
          const probe = await probeInternalXtreamVodUrl(candidate.resolvedStreamUrl, 3800);
          if (!probe.ok) {
            deadTrackIndices.add(i);
            markTrackUrlDead(candidate.resolvedStreamUrl);
            continue;
          }
        }
        primaryStreamUrl = candidate.resolvedStreamUrl;
        primaryMode = candidate.resolverType === 'direct_mp4' ? 'direct' : 'hls';
        resolvedTrack = candidate;
        break;
      }

      if (
        candidate.resolverType === 'movidy_embed' ||
        candidate.resolverType === 'vidhide_hls' ||
        candidate.resolverType === 'embed_sniff'
      ) {
        tierAsyncMirrors.push({ idx: i, track: candidate });
      }
    }

    if (primaryStreamUrl) break;

    // Race async mirrors in batches of 3 with Promise.any + immediate abort of slower batch losers
    for (let batchStart = 0; batchStart < tierAsyncMirrors.length && !primaryStreamUrl; batchStart += 3) {
      const batch = tierAsyncMirrors.slice(batchStart, batchStart + 3);
      const batchAbort = new AbortController();

      try {
        const winner = await Promise.any(
          batch.map(async ({ idx, track }) => {
            if (track.resolverType === 'movidy_embed') {
              const resolvedMv = await withExtractTimeout(
                resolveMovidyFn(track.sourceUrl, batchAbort.signal),
                3800,
                null,
                batchAbort.signal
              );
              if (resolvedMv?.mode === 'hls') {
                return { idx, proxyUrl: resolvedMv.proxyUrl, mode: 'hls' as const };
              }
              if (!directOnly && resolvedMv?.mode === 'embed') {
                orderedTracks[idx] = {
                  ...track,
                  resolverType: 'web_embed',
                  sourceUrl: resolvedMv.embedUrl,
                };
                if (!isTrackUrlKnownDead(resolvedMv.embedUrl)) {
                  tierWebEmbedCandidates.push({
                    idx,
                    track: orderedTracks[idx],
                    url: resolvedMv.embedUrl,
                  });
                } else {
                  deadTrackIndices.add(idx);
                }
              } else {
                deadTrackIndices.add(idx);
                markTrackUrlDead(track.sourceUrl);
              }
              throw new Error('no_native_hls_from_movidy');
            }

            if (track.resolverType === 'vidhide_hls') {
              const unpacked = await withExtractTimeout(
                unpackVidhideFn(track.sourceUrl, batchAbort.signal),
                4200,
                null,
                batchAbort.signal
              );
              if (unpacked?.proxyUrl) {
                return { idx, proxyUrl: unpacked.proxyUrl, mode: 'hls' as const };
              }
              deadTrackIndices.add(idx);
              markTrackUrlDead(track.sourceUrl);
              throw new Error('no_hls_from_vidhide');
            }

            if (track.resolverType === 'embed_sniff') {
              const sniffed = await withExtractTimeout(
                sniffHeadlessFn(track.sourceUrl),
                5500,
                null,
                batchAbort.signal
              );
              if (sniffed) {
                const proxiedUrl = sniffed.isDirectMp4
                  ? buildTsProxyUrl(sniffed.streamUrl, sniffed.referer)
                  : buildHlsProxyUrl(sniffed.streamUrl, sniffed.referer);
                return {
                  idx,
                  proxyUrl: proxiedUrl,
                  mode: sniffed.isDirectMp4 ? ('direct' as const) : ('hls' as const),
                };
              }
              deadTrackIndices.add(idx);
              markTrackUrlDead(track.sourceUrl);
              throw new Error('no_stream_from_sniff');
            }

            throw new Error('unsupported_mirror_type');
          })
        );

        batchAbort.abort();
        orderedTracks[winner.idx] = {
          ...orderedTracks[winner.idx],
          resolvedStreamUrl: winner.proxyUrl,
        };
        primaryStreamUrl = winner.proxyUrl;
        primaryMode = winner.mode;
        resolvedTrack = orderedTracks[winner.idx];
        break;
      } catch {
        // Entire batch failed to yield an HLS/direct stream; continue to next batch or embed fallback
      }
    }

    if (primaryStreamUrl) break;

    if (!directOnly && tierWebEmbedCandidates.length > 0) {
      tierWebEmbedCandidates.sort(
        (a, b) =>
          sourcePriority(a.track) - sourcePriority(b.track) ||
          getTrackHealthScore(a.track) - getTrackHealthScore(b.track)
      );
      for (let start = 0; start < tierWebEmbedCandidates.length && !primaryStreamUrl; start += 3) {
        const embedBatch = tierWebEmbedCandidates.slice(start, start + 3);
        const embedAbort = new AbortController();
        try {
          const winnerEmbed = await Promise.any(
            embedBatch.map(async (cand) => {
              const alive = await verifyWebEmbedFn(cand.track, cand.url, embedAbort.signal);
              if (!alive) {
                deadTrackIndices.add(cand.idx);
                markTrackUrlDead(cand.url);
                throw new Error('dead_web_embed');
              }
              return cand;
            })
          );
          embedAbort.abort();
          const proxiedWeb = toProxiedEmbedUrl(winnerEmbed.url, isSandboxedFrame);
          orderedTracks[winnerEmbed.idx] = {
            ...winnerEmbed.track,
            resolvedStreamUrl: proxiedWeb,
          };
          primaryStreamUrl = proxiedWeb;
          primaryMode = 'embed';
          resolvedTrack = orderedTracks[winnerEmbed.idx];
          break;
        } catch {
          // continue to next web embed batch
        }
      }
    }

    if (primaryStreamUrl) break;
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
  skipSubtitlesWait?: boolean;
}): Promise<ExtractedStreamResult> {
  const { primaryStreamUrl, primaryMode, resolvedTrack, validTracks } = opts.resolvedSelection;
  const normalizedPreferLang =
    normalizeTrackLangCode(opts.preferLang) || String(opts.preferLang || 'ES').toUpperCase();
  const resolvedLang =
    normalizeTrackLangCode(resolvedTrack?.lang || normalizedPreferLang) || normalizedPreferLang;
  const resolvedLabel = resolvedTrack?.label || opts.preferLang;
  const availableLanguages = Array.from(
    new Set(validTracks.map((t) => normalizeTrackLangCode(t.lang)).filter(Boolean))
  );
  const languageFallbackUsed =
    (normalizedPreferLang === 'ES' && resolvedLang !== 'ES') ||
    (normalizedPreferLang === 'LAT' && resolvedLang !== 'LAT') ||
    (normalizedPreferLang === 'VOSE' && resolvedLang !== 'VOSE') ||
    (normalizedPreferLang === 'EN' && resolvedLang !== 'EN');

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
  const subWaitMs = opts.skipSubtitlesWait ? 0 : rawMergedSubs.length === 0 ? 300 : 180;
  if (subWaitMs > 0 && (opts.resolvedTmdbId || baseCleanTitle || opts.titleHint)) {
    const searchedSubs = await withExtractTimeout(
      opts.subtitlesPromise,
      subWaitMs,
      [] as SubtitleCandidateRecord[]
    );
    rawMergedSubs.push(...searchedSubs);
  }
  const seenSubUrls = new Set<string>();
  const combinedSubtitles: SubtitleTrackOutput[] = [];
  for (const s of rawMergedSubs) {
    const u = String(s?.url || '').trim();
    if (!u || seenSubUrls.has(u)) continue;
    seenSubUrls.add(u);
    const langCode = normalizeTrackLangCode(s?.lang || 'ES') || 'ES';
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
    subtitles: combinedSubtitles,
    requestedLang: opts.preferLang,
    resolvedLang,
    resolvedLabel,
    languageFallbackUsed,
    availableLanguages,
    expiresAt: Date.now() + cacheTtlMs,
  };
}

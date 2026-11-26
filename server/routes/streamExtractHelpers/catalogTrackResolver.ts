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
import {
  recordProviderOutcome,
  tryAcquireHalfOpenProbe,
} from '../../services/providerCircuitBreaker.ts';
import { LruTtlCache } from '../../utils/lruCache.ts';

const deadTrackUrlCache = new LruTtlCache<string, boolean>(400, 40 * 1000);
const MIRROR_BATCH_SIZE = 3;
const INITIAL_SUBTITLES_TIMEOUT_MS = 40;

export interface SubtitleCandidateRecord {
  id?: string;
  label?: string;
  lang?: string;
  url: string;
  source?: string;
}

function extractMirrorCircuitKey(rawSource: string, resolverType: string): string {
  const s = String(rawSource || '').trim();
  if (!s) return `mirror:${resolverType}`;
  let decoded = s;
  if (!/^https?:\/\//i.test(decoded)) {
    try {
      const b = Buffer.from(decoded, 'base64').toString('utf8').trim();
      if (/^https?:\/\//i.test(b)) decoded = b;
    } catch {
      // keep raw
    }
  }
  try {
    if (/^https?:\/\//i.test(decoded)) {
      return `mirror:${new URL(decoded).hostname.toLowerCase()}`;
    }
  } catch {
    // ignore
  }
  return `mirror:${resolverType}`;
}

function withAbortableExtractTimeout<T>(
  run: (signal: AbortSignal) => Promise<T>,
  ms: number,
  outerSignal?: AbortSignal
): Promise<T> {
  if (outerSignal?.aborted) {
    return Promise.reject(new DOMException('The operation was aborted.', 'AbortError'));
  }
  const innerController = new AbortController();
  const combinedSignal = outerSignal
    ? AbortSignal.any([outerSignal, innerController.signal])
    : innerController.signal;

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      innerController.abort(new DOMException(`Mirror timeout after ${ms}ms`, 'TimeoutError'));
      reject(new DOMException(`Mirror timeout after ${ms}ms`, 'TimeoutError'));
    }, ms);
    timer.unref?.();

    const onOuterAbort = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      innerController.abort(new DOMException('The operation was aborted.', 'AbortError'));
      reject(new DOMException('The operation was aborted.', 'AbortError'));
    };
    outerSignal?.addEventListener('abort', onOuterAbort, { once: true });

    Promise.resolve()
      .then(() => run(combinedSignal))
      .then((val) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        outerSignal?.removeEventListener('abort', onOuterAbort);
        resolve(val);
      })
      .catch((err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        outerSignal?.removeEventListener('abort', onOuterAbort);
        reject(err);
      });
  });
}

function withExtractTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      resolve(fallback);
    }, ms);
    timer.unref?.();
    p.then(
      (val) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(val);
      },
      () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(fallback);
      }
    );
  });
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

export interface ResolveTrackHooks {
  resolveMovidyEmbedTrack?: (
    embedUrlOrB64: string,
    signal?: AbortSignal
  ) => Promise<
    | { mode: 'hls'; rawM3u8: string; proxyUrl: string }
    | { mode: 'embed'; embedUrl: string }
    | null
  >;
  unpackVidhideToHls?: (
    embedUrl: string,
    signal?: AbortSignal
  ) => Promise<{ rawM3u8: string; proxyUrl: string } | null>;
  sniffStreamWithHeadless?: (
    rawUrl: string,
    signal?: AbortSignal
  ) => Promise<{ streamUrl: string; referer: string; isDirectMp4: boolean } | null>;
  verifyWebEmbedCandidateAlive?: (
    track: TrackRecord,
    url: string,
    signal?: AbortSignal
  ) => Promise<boolean>;
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

  const resolveMovidyFn = resolveTrackHooks?.resolveMovidyEmbedTrack ?? resolveMovidyEmbedTrack;
  const unpackVidhideFn = resolveTrackHooks?.unpackVidhideToHls ?? unpackVidhideToHls;
  const sniffHeadlessFn = resolveTrackHooks?.sniffStreamWithHeadless ?? sniffStreamWithHeadless;
  const verifyWebEmbedFn =
    resolveTrackHooks?.verifyWebEmbedCandidateAlive ?? verifyWebEmbedCandidateAlive;

  let primaryStreamUrl = '';
  let primaryMode: 'hls' | 'direct' | 'embed' = 'hls';
  let resolvedTrack: TrackRecord | null = null;
  const deadTrackIndices = new Set<number>();

  const tierScores = Array.from(new Set(orderedTracks.map((t) => getLangScore(t.lang)))).sort(
    (a, b) => a - b
  );

  for (const tierScore of tierScores) {
    const tierWebEmbedCandidates: { idx: number; track: TrackRecord; url: string }[] = [];

    // 1. Instant 0ms fast path if an already-resolved native stream exists in this language tier
    for (let i = 0; i < orderedTracks.length; i++) {
      if (getLangScore(orderedTracks[i].lang) !== tierScore) continue;
      const instant = orderedTracks[i];
      if (
        instant.resolvedStreamUrl &&
        instant.resolverType !== 'web_embed' &&
        (!instant.sourceUrl || !deadTrackUrlCache.get(instant.sourceUrl))
      ) {
        primaryStreamUrl = instant.resolvedStreamUrl;
        primaryMode = instant.resolverType === 'direct_mp4' ? 'direct' : 'hls';
        resolvedTrack = instant;
        break;
      }
    }
    if (primaryStreamUrl) break;

    // 2. Partition tier into resolvable mirrors and web_embed candidates
    interface MirrorBatchItem {
      idx: number;
      candidate: TrackRecord;
      circuitKey: string;
    }
    const resolvableMirrors: MirrorBatchItem[] = [];

    for (let i = 0; i < orderedTracks.length; i++) {
      if (getLangScore(orderedTracks[i].lang) !== tierScore) continue;
      const candidate = orderedTracks[i];
      if (candidate.sourceUrl && deadTrackUrlCache.get(candidate.sourceUrl)) {
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
        primaryStreamUrl = candidate.resolvedStreamUrl;
        primaryMode = candidate.resolverType === 'direct_mp4' ? 'direct' : 'hls';
        resolvedTrack = candidate;
        break;
      }

      const circuitKey = extractMirrorCircuitKey(candidate.sourceUrl, candidate.resolverType);
      if (!tryAcquireHalfOpenProbe(circuitKey)) {
        // Circuit breaker open: skip mirror in 0ms
        deadTrackIndices.add(i);
        continue;
      }

      resolvableMirrors.push({ idx: i, candidate, circuitKey });
    }
    if (primaryStreamUrl) break;

    // 3. Race lightweight HTTP mirrors ahead of headless embed_sniff in concurrent batches of 3
    resolvableMirrors.sort((a, b) => {
      const aHeadless = a.candidate.resolverType === 'embed_sniff' ? 1 : 0;
      const bHeadless = b.candidate.resolverType === 'embed_sniff' ? 1 : 0;
      return aHeadless - bHeadless;
    });

    for (let b = 0; b < resolvableMirrors.length && !primaryStreamUrl; b += MIRROR_BATCH_SIZE) {
      const batch = resolvableMirrors.slice(b, b + MIRROR_BATCH_SIZE);
      const batchController = new AbortController();
      const deferredEmbedIndices = new Set<number>();

      interface BatchWinResult {
        idx: number;
        circuitKey: string;
        streamUrl: string;
        mode: 'hls' | 'direct';
        updatedTrack: TrackRecord;
      }

      const racePromises = batch.map(async (item): Promise<BatchWinResult> => {
        const { idx, candidate, circuitKey } = item;
        const t0 = Date.now();
        if (candidate.resolverType === 'movidy_embed') {
          const resolvedMv = await withAbortableExtractTimeout(
            (sig) => resolveMovidyFn(candidate.sourceUrl, sig),
            2000,
            batchController.signal
          );
          if (resolvedMv?.mode === 'hls') {
            return {
              idx,
              circuitKey,
              streamUrl: resolvedMv.proxyUrl,
              mode: 'hls',
              updatedTrack: { ...candidate, resolvedStreamUrl: resolvedMv.proxyUrl },
            };
          }
          if (!directOnly && resolvedMv?.mode === 'embed') {
            deferredEmbedIndices.add(idx);
            const embedTrack: TrackRecord = {
              ...candidate,
              resolverType: 'web_embed',
              sourceUrl: resolvedMv.embedUrl,
            };
            orderedTracks[idx] = embedTrack;
            tierWebEmbedCandidates.push({
              idx,
              track: embedTrack,
              url: resolvedMv.embedUrl,
            });
            recordProviderOutcome(circuitKey, { ok: true, latencyMs: Date.now() - t0 });
            throw new Error('MOVIDY_EMBED_DEFERRED');
          }
          throw new Error('MOVIDY_EMPTY');
        }

        if (candidate.resolverType === 'vidhide_hls') {
          const unpacked = await withAbortableExtractTimeout(
            (sig) => unpackVidhideFn(candidate.sourceUrl, sig),
            2100,
            batchController.signal
          );
          if (unpacked?.proxyUrl) {
            return {
              idx,
              circuitKey,
              streamUrl: unpacked.proxyUrl,
              mode: 'hls',
              updatedTrack: { ...candidate, resolvedStreamUrl: unpacked.proxyUrl },
            };
          }
          throw new Error('VIDHIDE_EMPTY');
        }

        if (candidate.resolverType === 'embed_sniff') {
          const sniffed = await withAbortableExtractTimeout(
            (sig) => sniffHeadlessFn(candidate.sourceUrl, sig),
            2200,
            batchController.signal
          );
          if (sniffed?.streamUrl) {
            const proxiedUrl = sniffed.isDirectMp4
              ? buildTsProxyUrl(sniffed.streamUrl, sniffed.referer)
              : buildHlsProxyUrl(sniffed.streamUrl, sniffed.referer);
            return {
              idx,
              circuitKey,
              streamUrl: proxiedUrl,
              mode: sniffed.isDirectMp4 ? 'direct' : 'hls',
              updatedTrack: { ...candidate, resolvedStreamUrl: proxiedUrl },
            };
          }
          throw new Error('EMBED_SNIFF_EMPTY');
        }

        throw new Error(`UNHANDLED_RESOLVER:${candidate.resolverType}`);
      });

      // Attach defensive catchers to prevent unhandled rejections when losers settle after abort
      for (const p of racePromises) {
        p.catch(() => {});
      }

      try {
        const winner = await Promise.any(racePromises);
        batchController.abort(new DOMException('Batch race won by faster mirror', 'AbortError'));
        orderedTracks[winner.idx] = winner.updatedTrack;
        primaryStreamUrl = winner.streamUrl;
        primaryMode = winner.mode;
        resolvedTrack = winner.updatedTrack;
        recordProviderOutcome(winner.circuitKey, { ok: true });
        await Promise.allSettled(racePromises);
        break;
      } catch {
        // Every mirror in the batch failed/timed out (or deferred to web_embed)
        batchController.abort(new DOMException('Batch finished', 'AbortError'));
        await Promise.allSettled(racePromises);
        for (const item of batch) {
          if (deferredEmbedIndices.has(item.idx)) continue;
          if (item.candidate.sourceUrl) deadTrackUrlCache.set(item.candidate.sourceUrl, true);
          deadTrackIndices.add(item.idx);
          recordProviderOutcome(item.circuitKey, { ok: false });
        }
      }
    }

    if (primaryStreamUrl) break;

    // 4. Web embed fallback liveness verification in concurrent batches of 3 via Promise.any + AbortController
    if (!directOnly && tierWebEmbedCandidates.length > 0) {
      tierWebEmbedCandidates.sort(
        (a, b) =>
          sourcePriority(a.track) - sourcePriority(b.track) ||
          getTrackHealthScore(a.track) - getTrackHealthScore(b.track)
      );

      const liveEmbedCandidates = tierWebEmbedCandidates.filter((cand) => {
        if (deadTrackUrlCache.get(cand.url)) {
          deadTrackIndices.add(cand.idx);
          return false;
        }
        const key = extractMirrorCircuitKey(cand.url, 'web_embed');
        if (!tryAcquireHalfOpenProbe(key)) {
          deadTrackIndices.add(cand.idx);
          return false;
        }
        return true;
      });

      for (let b = 0; b < liveEmbedCandidates.length && !primaryStreamUrl; b += MIRROR_BATCH_SIZE) {
        const batch = liveEmbedCandidates.slice(b, b + MIRROR_BATCH_SIZE);
        const batchController = new AbortController();
        const racePromises = batch.map(async (cand) => {
          const circuitKey = extractMirrorCircuitKey(cand.url, 'web_embed');
          const alive = await withAbortableExtractTimeout(
            (sig) => verifyWebEmbedFn(cand.track, cand.url, sig),
            1500,
            batchController.signal
          );
          if (!alive) throw new Error('WEB_EMBED_DEAD');
          return { cand, circuitKey };
        });
        for (const p of racePromises) p.catch(() => {});

        try {
          const winner = await Promise.any(racePromises);
          batchController.abort(new DOMException('Embed batch won', 'AbortError'));
          await Promise.allSettled(racePromises);
          const proxiedWeb = toProxiedEmbedUrl(winner.cand.url, isSandboxedFrame);
          orderedTracks[winner.cand.idx] = { ...winner.cand.track, resolvedStreamUrl: proxiedWeb };
          primaryStreamUrl = proxiedWeb;
          primaryMode = 'embed';
          resolvedTrack = orderedTracks[winner.cand.idx];
          recordProviderOutcome(winner.circuitKey, { ok: true });
          break;
        } catch {
          batchController.abort(new DOMException('Embed batch finished', 'AbortError'));
          await Promise.allSettled(racePromises);
          for (const cand of batch) {
            deadTrackUrlCache.set(cand.url, true);
            deadTrackIndices.add(cand.idx);
            recordProviderOutcome(extractMirrorCircuitKey(cand.url, 'web_embed'), { ok: false });
          }
        }
      }
    }

    if (primaryStreamUrl) break;
  }

  if (!primaryStreamUrl) return null;

  const langsWithNativeTracks = new Set(
    orderedTracks
      .filter((tr, idx) => !deadTrackIndices.has(idx) && tr.resolverType !== 'web_embed')
      .map((tr) => String(tr.lang || '').toUpperCase())
  );
  const validTracks = orderedTracks.filter(
    (tr, idx) =>
      !deadTrackIndices.has(idx) &&
      (!directOnly || tr.resolverType !== 'web_embed') &&
      (primaryMode === 'embed' ||
        tr.resolverType !== 'web_embed' ||
        !langsWithNativeTracks.has(String(tr.lang || '').toUpperCase()))
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
  const resolvedLang = String(resolvedTrack?.lang || opts.preferLang).toUpperCase();
  const resolvedLabel = resolvedTrack?.label || opts.preferLang;
  const availableLanguages = Array.from(
    new Set(validTracks.map((t) => String(t.lang || '').toUpperCase()).filter(Boolean))
  );
  const languageFallbackUsed =
    (opts.preferLang === 'ES' && resolvedLang !== 'ES') ||
    (opts.preferLang === 'LAT' && resolvedLang !== 'LAT') ||
    (opts.preferLang === 'VOSE' && resolvedLang !== 'VOSE') ||
    (opts.preferLang === 'EN' && resolvedLang !== 'EN');

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
  if (rawMergedSubs.length === 0 && (opts.resolvedTmdbId || baseCleanTitle || opts.titleHint)) {
    const searchedSubs = await withExtractTimeout(
      opts.subtitlesPromise,
      INITIAL_SUBTITLES_TIMEOUT_MS,
      [] as SubtitleCandidateRecord[]
    );
    rawMergedSubs.push(...searchedSubs);
  } else if (opts.resolvedTmdbId) {
    const searchedSubs = await withExtractTimeout(
      opts.subtitlesPromise,
      30,
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
    subtitles: combinedSubtitles,
    requestedLang: opts.preferLang,
    resolvedLang,
    resolvedLabel,
    languageFallbackUsed,
    availableLanguages,
    expiresAt: Date.now() + cacheTtlMs,
  };
}

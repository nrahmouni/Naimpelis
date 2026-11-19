import { ENV } from '../config/env.ts';
import { logger } from '../utils/logger.ts';
import { areTitlesStrictlyEqual, generateSpanishTitleHints } from '../extractors/httpHelpers.ts';
import { scrapeGnulaCatalog } from '../extractors/gnulaHdExtractor.ts';
import { fetchMovidyPageMetadata, findMovidyUrlByTitle } from '../extractors/bingetrixMovidy.ts';
import {
  type IndexedCatalogEntry,
  type RefreshCycleSummary,
  buildEntryKey,
  correctCommonSearchTypos,
  indexedCatalogCache,
  mapTmdbRawToIndexed,
  normalizeCompactCatalogQuery,
  onDemandQueryCache,
  politeDelay,
  scoreTitleRelevance,
  searchIndexedCatalog,
  sourceMetrics,
  upsertIndexedEntry,
} from './catalogRefreshHelpers/catalogIndexAndScoring.ts';
import {
  fetchTmdbSpanishAltTitles,
  refreshBingetrixAndTmdb,
  refreshGnulaAndSeriesKao,
  refreshMovidySource,
  refreshVestMirrors,
} from './catalogRefreshHelpers/catalogSourceScrapers.ts';

export * from './catalogRefreshHelpers/catalogIndexAndScoring.ts';
export { fetchTmdbSpanishAltTitles };

const DEFAULT_REFRESH_INTERVAL_MS = 15 * 60 * 1000;

let schedulerTimer: NodeJS.Timeout | null = null;
let initialWarmupTimer: NodeJS.Timeout | null = null;
let refreshInFlight: Promise<RefreshCycleSummary> | null = null;
let lastCycleSummary: RefreshCycleSummary | null = null;

/**
 * Live On-Demand Fallback Scraper when a query misses or underperforms in cache.
 * Searches MOVIDY FIRST (including Spanish hints), then TMDB es-ES & en-US + Gnula,
 * enriches TMDB matches with TMDB Spanish alt-titles -> Movidy, caches discoveries,
 * and returns Movidy-prioritized relevance-sorted matches.
 */
export async function liveOnDemandFallbackSearch(
  rawQuery: string,
  wantMediaType: 'movie' | 'tv' | 'all' = 'all'
): Promise<IndexedCatalogEntry[]> {
  const cleanQ = String(rawQuery || '').trim();
  if (cleanQ.length < 2) return [];

  const qCacheKey = `${wantMediaType}:${normalizeCompactCatalogQuery(cleanQ)}`;
  const cached = onDemandQueryCache.get(qCacheKey);
  if (cached) return cached;

  const apiKey = ENV.tmdbApiKey;
  const correctedQ = correctCommonSearchTypos(cleanQ);
  const tmdbSearchQ = correctedQ && correctedQ.toLowerCase() !== cleanQ.toLowerCase() ? correctedQ : cleanQ;
  const discovered: IndexedCatalogEntry[] = [];
  let directMovidyEntry: IndexedCatalogEntry | null = null;

  try {
    try {
      const hintsToTry = Array.from(
        new Set([
          ...generateSpanishTitleHints(cleanQ),
          ...generateSpanishTitleHints(tmdbSearchQ),
          tmdbSearchQ,
          cleanQ,
        ])
      ).filter((h) => h && h.length >= 2);

      const expectedMediaType = wantMediaType === 'all' ? undefined : wantMediaType;
      const movidyUrl = await findMovidyUrlByTitle(hintsToTry[0] || cleanQ, undefined, {
        titleHints: hintsToTry,
        expectedMediaType,
      }).catch(() => null);

      if (movidyUrl) {
        const mvMeta = await fetchMovidyPageMetadata(movidyUrl).catch(() => null);
        if (mvMeta && mvMeta.cleanTitle?.trim()) {
          directMovidyEntry = {
            id: `movidy-ondemand-${normalizeCompactCatalogQuery(mvMeta.cleanTitle)}`,
            mediaType: mvMeta.isTvShow ? 'tv' : 'movie',
            title: mvMeta.cleanTitle,
            originalTitle: mvMeta.cleanTitle,
            year: mvMeta.year || 'HD',
            rating: '',
            overview: mvMeta.overview || 'Disponible en Movidy.',
            poster: '',
            backdrop: '',
            movidyUrl,
            languages: ['Castellano', 'Latino', 'VOSE', 'EN'],
            sources: ['movidy'],
            popularity: 100,
            indexedAt: Date.now(),
          };
          discovered.push(directMovidyEntry);
        }
      }
    } catch {
      // ignore
    }

    const tmdbUrls: Array<{ url: string; lang: 'en-US' | 'es-ES'; forcedType?: 'movie' | 'tv' }> = [
      {
        url: `https://api.themoviedb.org/3/search/multi?api_key=${apiKey}&language=es-ES&query=${encodeURIComponent(tmdbSearchQ)}&page=1&include_adult=false`,
        lang: 'es-ES',
      },
      {
        url: `https://api.themoviedb.org/3/search/multi?api_key=${apiKey}&language=en-US&query=${encodeURIComponent(tmdbSearchQ)}&page=1&include_adult=false`,
        lang: 'en-US',
      },
    ];
    if (wantMediaType === 'movie') {
      tmdbUrls.unshift({
        url: `https://api.themoviedb.org/3/search/movie?api_key=${apiKey}&language=es-ES&query=${encodeURIComponent(tmdbSearchQ)}&page=1&include_adult=false`,
        lang: 'es-ES',
        forcedType: 'movie',
      });
    } else if (wantMediaType === 'tv') {
      tmdbUrls.unshift({
        url: `https://api.themoviedb.org/3/search/tv?api_key=${apiKey}&language=es-ES&query=${encodeURIComponent(tmdbSearchQ)}&page=1&include_adult=false`,
        lang: 'es-ES',
        forcedType: 'tv',
      });
    }

    const [tmdbPayloads, gnulaLive] = await Promise.all([
      Promise.all(
        tmdbUrls.map(async (reqCfg) => {
          try {
            const r = await fetch(reqCfg.url, { signal: AbortSignal.timeout(4000) });
            if (!r.ok) return { rows: [] as any[], reqCfg };
            const json: any = await r.json();
            return { rows: Array.isArray(json?.results) ? json.results : [], reqCfg };
          } catch {
            return { rows: [] as any[], reqCfg };
          }
        })
      ),
      Promise.race([
        scrapeGnulaCatalog({ query: tmdbSearchQ, mediaType: wantMediaType }).catch(() => ({
          items: [],
          hasMore: false,
        })),
        new Promise<{ items: any[]; hasMore: boolean }>((r) =>
          setTimeout(() => r({ items: [], hasMore: false }), 3500)
        ),
      ]),
    ]);

    for (const { rows, reqCfg } of tmdbPayloads) {
      for (const row of rows) {
        const mType: 'movie' | 'tv' | null =
          reqCfg.forcedType ||
          (row.media_type === 'tv' ? 'tv' : row.media_type === 'movie' ? 'movie' : null);
        if (!mType) continue;
        if (wantMediaType !== 'all' && mType !== wantMediaType) continue;
        const entry = mapTmdbRawToIndexed(
          row,
          mType,
          ['bingetrix', 'tmdb'],
          ['Castellano', 'Latino', 'VOSE', 'EN']
        );
        if (entry) {
          upsertIndexedEntry(entry);
          discovered.push(entry);
        }
      }
    }

    const topTmdbCandidates = discovered
      .filter((d) => Boolean(d.tmdbId) && !d.movidyUrl)
      .sort(
        (a, b) =>
          scoreTitleRelevance(b.title, b.originalTitle, tmdbSearchQ, {
            altTitle: b.altTitle,
            popularity: b.popularity,
            voteCount: b.voteCount,
          }) -
          scoreTitleRelevance(a.title, a.originalTitle, tmdbSearchQ, {
            altTitle: a.altTitle,
            popularity: a.popularity,
            voteCount: a.voteCount,
          })
      )
      .slice(0, 4);

    if (topTmdbCandidates.length > 0) {
      await Promise.all(
        topTmdbCandidates.map(async (cand) => {
          if (!cand.tmdbId) return;
          const esMeta = await fetchTmdbSpanishAltTitles(cand.tmdbId, cand.mediaType);
          const allCandHints = Array.from(
            new Set([cand.title, cand.originalTitle, ...esMeta.titles].filter(Boolean))
          );

          const yearsCompatible =
            !directMovidyEntry ||
            !/^\d{4}$/.test(directMovidyEntry.year) ||
            !/^\d{4}$/.test(cand.year) ||
            Math.abs(Number(directMovidyEntry.year) - Number(cand.year)) <= 1;
          if (
            directMovidyEntry &&
            yearsCompatible &&
            directMovidyEntry.mediaType === cand.mediaType &&
            areTitlesStrictlyEqual(directMovidyEntry.title, allCandHints)
          ) {
            cand.movidyUrl = directMovidyEntry.movidyUrl;
            cand.altTitle =
              directMovidyEntry.title !== cand.title ? directMovidyEntry.title : cand.altTitle;
            if (!cand.sources.includes('movidy')) cand.sources.unshift('movidy');
            cand.languages = ['Castellano', 'Latino', 'VOSE', 'EN'];
            upsertIndexedEntry(cand);
            return;
          }

          if (esMeta.titles.length > 0) {
            const matchedMovidyUrl = await findMovidyUrlByTitle(
              esMeta.titles[0],
              esMeta.year || (cand.year !== 'HD' ? cand.year : undefined),
              {
                titleHints: allCandHints,
                expectedMediaType: cand.mediaType,
              }
            ).catch(() => null);

            if (matchedMovidyUrl) {
              cand.movidyUrl = matchedMovidyUrl;
              cand.altTitle =
                esMeta.esTitle && esMeta.esTitle !== cand.title ? esMeta.esTitle : cand.altTitle;
              if (!cand.sources.includes('movidy')) cand.sources.unshift('movidy');
              cand.languages = ['Castellano', 'Latino', 'VOSE', 'EN'];
              upsertIndexedEntry(cand);
            }
          }
        })
      );
    }

    if (directMovidyEntry) {
      const mvYr = /^\d{4}$/.test(directMovidyEntry.year) ? Number(directMovidyEntry.year) : 0;
      const matchedTmdb = discovered
        .filter((d) => {
          if (!d.tmdbId) return false;
          if (d.movidyUrl === directMovidyEntry!.movidyUrl) return true;
          if (d.mediaType !== directMovidyEntry!.mediaType) return false;
          if (
            !areTitlesStrictlyEqual(
              directMovidyEntry!.title,
              [d.title, d.originalTitle, d.altTitle || ''].filter(Boolean)
            )
          ) {
            return false;
          }
          const dYr = /^\d{4}$/.test(d.year) ? Number(d.year) : 0;
          return !mvYr || !dYr || Math.abs(mvYr - dYr) <= 1;
        })
        .sort((a, b) => (b.voteCount || b.popularity || 0) - (a.voteCount || a.popularity || 0))[0];

      if (matchedTmdb) {
        matchedTmdb.movidyUrl = matchedTmdb.movidyUrl || directMovidyEntry.movidyUrl;
        if (!matchedTmdb.sources.includes('movidy')) matchedTmdb.sources.unshift('movidy');
        matchedTmdb.languages = ['Castellano', 'Latino', 'VOSE', 'EN'];
        upsertIndexedEntry(matchedTmdb);
        const mvIdx = discovered.indexOf(directMovidyEntry);
        if (mvIdx !== -1) discovered.splice(mvIdx, 1);
      }
    }

    for (const gItem of gnulaLive.items) {
      const matchingTmdb = discovered.find(
        (d) =>
          d.mediaType === gItem.mediaType &&
          areTitlesStrictlyEqual(gItem.title, [d.title, d.originalTitle, d.altTitle || ''].filter(Boolean)) &&
          (!/^\d{4}$/.test(gItem.year) || !/^\d{4}$/.test(d.year) || gItem.year === d.year)
      );
      if (matchingTmdb) {
        matchingTmdb.gnulaUrl = matchingTmdb.gnulaUrl || gItem.gnulaUrl;
        if (!matchingTmdb.sources.includes('gnula')) matchingTmdb.sources.push('gnula');
        upsertIndexedEntry(matchingTmdb);
      } else {
        const gEntry: IndexedCatalogEntry = {
          id: gItem.id,
          mediaType: gItem.mediaType,
          title: gItem.title,
          originalTitle: gItem.originalTitle,
          year: gItem.year || 'HD',
          rating: gItem.rating || '',
          overview: gItem.overview,
          poster: gItem.poster,
          backdrop: gItem.backdrop || gItem.poster,
          gnulaUrl: gItem.gnulaUrl,
          languages: gItem.languages,
          sources: ['gnula'],
          popularity: 21,
          indexedAt: Date.now(),
        };
        upsertIndexedEntry(gEntry);
        discovered.push(gEntry);
      }
    }

    const fromIndex = searchIndexedCatalog(cleanQ, { mediaType: wantMediaType, limit: 24 });
    const mergedMap = new Map<string, IndexedCatalogEntry>();
    for (const item of [...discovered, ...fromIndex]) {
      const k = buildEntryKey(item);
      const existing = mergedMap.get(k);
      if (!existing) {
        mergedMap.set(k, indexedCatalogCache.get(k) || item);
      } else {
        mergedMap.set(k, {
          ...existing,
          gnulaUrl: existing.gnulaUrl || item.gnulaUrl,
          movidyUrl: existing.movidyUrl || item.movidyUrl,
          altTitle:
            existing.altTitle || (item.title !== existing.title ? item.title : undefined),
          languages: existing.movidyUrl || item.movidyUrl
            ? ['Castellano', 'Latino', 'VOSE', 'EN']
            : existing.languages,
          sources: Array.from(new Set([...existing.sources, ...item.sources])),
        });
      }
    }

    const scored = Array.from(mergedMap.values())
      .map((entry) => ({
        entry,
        score: scoreTitleRelevance(entry.title, entry.originalTitle, tmdbSearchQ, {
          altTitle: entry.altTitle,
          popularity: entry.popularity,
          voteCount: entry.voteCount,
        }),
      }))
      .filter((x) => x.score >= 70)
      .sort((a, b) => {
        const scoreDiff = b.score - a.score;
        if (Math.abs(scoreDiff) <= 35) {
          const aMov = a.entry.movidyUrl ? 1 : 0;
          const bMov = b.entry.movidyUrl ? 1 : 0;
          if (aMov !== bMov) return bMov - aMov;
        }
        return scoreDiff;
      })
      .map((x) => x.entry);

    onDemandQueryCache.set(qCacheKey, scored);
    return scored;
  } catch {
    return searchIndexedCatalog(cleanQ, { mediaType: wantMediaType, limit: 20 });
  }
}

export async function runRefreshCycle(): Promise<RefreshCycleSummary> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const startedAt = Date.now();
    const vestMetric = await refreshVestMirrors();
    await politeDelay(250);
    const bingetrixMetric = await refreshBingetrixAndTmdb();
    await politeDelay(300);
    const movidyMetric = await refreshMovidySource();
    await politeDelay(300);
    const [gnulaMetric, seriesKaoMetric] = await refreshGnulaAndSeriesKao();

    const finishedAt = Date.now();
    const summary: RefreshCycleSummary = {
      startedAt,
      finishedAt,
      durationMs: finishedAt - startedAt,
      totalIndexed: indexedCatalogCache.size,
      sources: [vestMetric, bingetrixMetric, movidyMetric, gnulaMetric, seriesKaoMetric],
    };
    lastCycleSummary = summary;
    logger.info(
      {
        durationMs: summary.durationMs,
        totalIndexed: summary.totalIndexed,
        sources: summary.sources.map((s) => `${s.source}:${s.itemsIndexed}`),
      },
      'catalog_refresh_cycle_complete'
    );
    return summary;
  })();

  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

export function startCatalogRefreshScheduler(
  intervalMs = DEFAULT_REFRESH_INTERVAL_MS
): void {
  if (ENV.nodeEnv === 'test' || process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST)) {
    return;
  }
  if (schedulerTimer) return;

  initialWarmupTimer = setTimeout(() => {
    void runRefreshCycle();
  }, 12_000);
  initialWarmupTimer.unref?.();

  schedulerTimer = setInterval(() => {
    void runRefreshCycle();
  }, Math.max(60_000, intervalMs));
  schedulerTimer.unref?.();
}

export function stopCatalogRefreshScheduler(): void {
  if (initialWarmupTimer) {
    clearTimeout(initialWarmupTimer);
    initialWarmupTimer = null;
  }
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
}

export function getCatalogRefreshStatus() {
  return {
    schedulerRunning: Boolean(schedulerTimer),
    totalIndexed: indexedCatalogCache.size,
    lastCycle: lastCycleSummary,
    sources: Array.from(sourceMetrics.values()),
  };
}

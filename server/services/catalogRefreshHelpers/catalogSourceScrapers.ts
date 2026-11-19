import { ENV } from '../../config/env.ts';
import { LruTtlCache } from '../../utils/lruCache.ts';
import {
  resolveActiveGnulaMirrors,
  scrapeGnulaCatalog,
} from '../../extractors/gnulaHdExtractor.ts';
import { listVestCatalogEntries } from '../vestMirrorService.ts';
import {
  type SourceRefreshMetric,
  fetchHtmlSafe,
  indexedCatalogCache,
  mapTmdbRawToIndexed,
  normalizeCompactCatalogQuery,
  politeDelay,
  sourceMetrics,
  upsertIndexedEntry,
} from './catalogIndexAndScoring.ts';

const tmdbSpanishMetaCache = new LruTtlCache<
  string,
  { titles: string[]; year: string; esTitle?: string }
>(500, 6 * 60 * 60 * 1000);

export async function refreshBingetrixAndTmdb(): Promise<SourceRefreshMetric> {
  const started = Date.now();
  let count = 0;
  try {
    const apiKey = ENV.tmdbApiKey;
    const endpoints: Array<{ url: string; mediaType: 'movie' | 'tv'; lang: 'en-US' | 'es-ES' }> = [
      { url: `https://api.themoviedb.org/3/trending/movie/day?api_key=${apiKey}&language=en-US&page=1`, mediaType: 'movie', lang: 'en-US' },
      { url: `https://api.themoviedb.org/3/movie/now_playing?api_key=${apiKey}&language=en-US&page=1`, mediaType: 'movie', lang: 'en-US' },
      { url: `https://api.themoviedb.org/3/trending/tv/day?api_key=${apiKey}&language=en-US&page=1`, mediaType: 'tv', lang: 'en-US' },
      { url: `https://api.themoviedb.org/3/trending/movie/week?api_key=${apiKey}&language=es-ES&page=1`, mediaType: 'movie', lang: 'es-ES' },
      { url: `https://api.themoviedb.org/3/trending/tv/week?api_key=${apiKey}&language=es-ES&page=1`, mediaType: 'tv', lang: 'es-ES' },
    ];

    for (const ep of endpoints) {
      try {
        const r = await fetch(ep.url, { signal: AbortSignal.timeout(4500) });
        if (r.ok) {
          const json: any = await r.json();
          const rows: any[] = Array.isArray(json?.results) ? json.results : [];
          for (const row of rows) {
            const entry = mapTmdbRawToIndexed(
              row,
              ep.mediaType,
              ['bingetrix', 'tmdb'],
              ep.lang === 'en-US' ? ['English 1080p', 'VOSE'] : ['Castellano', 'Latino', 'VOSE']
            );
            if (entry) {
              upsertIndexedEntry(entry);
              count += 1;
            }
          }
        }
      } catch {
        // continue with remaining endpoints
      }
      await politeDelay(250);
    }

    const bingetrixHtml = await fetchHtmlSafe('https://bingetrix.sc/', 'https://bingetrix.sc/');
    if (bingetrixHtml) {
      const watchIds = new Set<number>();
      const re = /\/watch\/(?:movie\/)?(\d{4,9})/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(bingetrixHtml)) !== null && watchIds.size < 18) {
        const id = Number(m[1]);
        if (id > 0) watchIds.add(id);
      }
      for (const id of watchIds) {
        const key = `movie:${id}`;
        if (indexedCatalogCache.get(key)) continue;
        try {
          const r = await fetch(
            `https://api.themoviedb.org/3/movie/${id}?api_key=${apiKey}&language=en-US`,
            { signal: AbortSignal.timeout(3500) }
          );
          if (r.ok) {
            const raw: any = await r.json();
            const entry = mapTmdbRawToIndexed(raw, 'movie', ['bingetrix'], ['English 1080p', 'VOSE']);
            if (entry) {
              upsertIndexedEntry(entry);
              count += 1;
            }
          }
        } catch {
          // ignore
        }
        await politeDelay(200);
      }
    }

    const metric: SourceRefreshMetric = {
      source: 'bingetrix',
      lastRunAt: started,
      itemsIndexed: count,
      ok: count > 0,
    };
    sourceMetrics.set('bingetrix', metric);
    return metric;
  } catch (err: any) {
    const metric: SourceRefreshMetric = {
      source: 'bingetrix',
      lastRunAt: started,
      itemsIndexed: count,
      ok: false,
      error: err?.message || 'bingetrix_refresh_failed',
    };
    sourceMetrics.set('bingetrix', metric);
    return metric;
  }
}

export async function refreshMovidySource(): Promise<SourceRefreshMetric> {
  const started = Date.now();
  let count = 0;
  try {
    const targets: Array<{ url: string; mediaType: 'movie' | 'tv' }> = [
      { url: 'https://movidy.work/pelis/', mediaType: 'movie' },
      { url: 'https://movidy.work/shows/', mediaType: 'tv' },
    ];
    const itemRe =
      /<li>\s*<a\s+href="((?:https?:\/\/movidy\.[a-z]+)?\/ver\/[^"]+)"[^>]*>\s*<h3\s+class="item-title">\s*<span>([^<]+)<\/span>\s*<\/h3>\s*<img[^>]+data-src="([^"]+)"/gi;

    for (const t of targets) {
      const html = await fetchHtmlSafe(t.url, 'https://movidy.work/');
      if (html) {
        let m: RegExpExecArray | null;
        itemRe.lastIndex = 0;
        while ((m = itemRe.exec(html)) !== null) {
          const rawHref = String(m[1] || '').trim();
          const rawTitle = String(m[2] || '').trim();
          const rawPoster = String(m[3] || '').trim();
          if (!rawHref || !rawTitle) continue;
          const movidyUrl = (rawHref.startsWith('http') ? rawHref : `https://movidy.work${rawHref}`)
            .replace(/^https?:\/\/(?:www\.)?movidy\.(?:pw|tv|ws)\//i, 'https://movidy.work/');
          const absPoster = (rawPoster.startsWith('//')
            ? `https:${rawPoster}`
            : rawPoster.startsWith('http')
            ? rawPoster
            : `https://movidy.work${rawPoster}`)
            .replace(/^https?:\/\/(?:www\.)?movidy\.(?:pw|tv|ws)\//i, 'https://movidy.work/');
          const slug =
            movidyUrl.split('/ver/')[1]?.replace(/\//g, '').replace(/[^a-zA-Z0-9_-]/g, '') ||
            `${count}`;
          upsertIndexedEntry({
            id: `movidy-${slug}`,
            mediaType: t.mediaType,
            title: rawTitle,
            originalTitle: rawTitle.replace(/\s*\([^)]*\)/g, '').trim() || rawTitle,
            altTitle: rawTitle.match(/\(([^)]+)\)/)?.[1]?.trim(),
            year: 'HD',
            rating: '',
            overview: 'Disponible en streaming directo Castellano, Latino y VOSE vía Movidy.',
            poster: `/api/img-proxy?url=${encodeURIComponent(absPoster)}`,
            backdrop: `/api/img-proxy?url=${encodeURIComponent(absPoster)}`,
            movidyUrl,
            languages: ['Castellano', 'Latino', 'VOSE'],
            sources: ['movidy'],
            popularity: 20,
            indexedAt: Date.now(),
          });
          count += 1;
        }
      }
      await politeDelay(300);
    }

    const metric: SourceRefreshMetric = {
      source: 'movidy',
      lastRunAt: started,
      itemsIndexed: count,
      ok: count > 0,
    };
    sourceMetrics.set('movidy', metric);
    return metric;
  } catch (err: any) {
    const metric: SourceRefreshMetric = {
      source: 'movidy',
      lastRunAt: started,
      itemsIndexed: count,
      ok: false,
      error: err?.message || 'movidy_refresh_failed',
    };
    sourceMetrics.set('movidy', metric);
    return metric;
  }
}

export async function refreshGnulaAndSeriesKao(): Promise<SourceRefreshMetric[]> {
  const out: SourceRefreshMetric[] = [];

  const gStart = Date.now();
  let gCount = 0;
  try {
    await resolveActiveGnulaMirrors();
    const [moviesP1, seriesP1] = await Promise.all([
      scrapeGnulaCatalog({ mediaType: 'movie', page: 1 }).catch(() => ({ items: [], hasMore: false })),
      scrapeGnulaCatalog({ mediaType: 'tv', page: 1 }).catch(() => ({ items: [], hasMore: false })),
    ]);
    await politeDelay(200);
    const [moviesP2, animeP1] = await Promise.all([
      scrapeGnulaCatalog({ mediaType: 'movie', page: 2 }).catch(() => ({ items: [], hasMore: false })),
      scrapeGnulaCatalog({ mediaType: 'tv', category: 'anime', page: 1 }).catch(() => ({
        items: [],
        hasMore: false,
      })),
    ]);

    for (const item of [...moviesP1.items, ...moviesP2.items, ...seriesP1.items, ...animeP1.items]) {
      upsertIndexedEntry({
        id: item.id,
        mediaType: item.mediaType,
        title: item.title,
        originalTitle: item.originalTitle || item.title,
        year: item.year || 'HD',
        rating: item.rating || '',
        overview: item.overview,
        poster: item.poster,
        backdrop: item.backdrop || item.poster,
        gnulaUrl: item.gnulaUrl,
        languages: item.languages,
        sources: ['gnula'],
        popularity: 21,
        indexedAt: Date.now(),
      });
      gCount += 1;
    }

    const metric: SourceRefreshMetric = {
      source: 'gnula',
      lastRunAt: gStart,
      itemsIndexed: gCount,
      ok: gCount > 0,
    };
    sourceMetrics.set('gnula', metric);
    out.push(metric);
  } catch (err: any) {
    const metric: SourceRefreshMetric = {
      source: 'gnula',
      lastRunAt: gStart,
      itemsIndexed: gCount,
      ok: false,
      error: err?.message,
    };
    sourceMetrics.set('gnula', metric);
    out.push(metric);
  }

  await politeDelay(300);

  const sStart = Date.now();
  let sCount = 0;
  try {
    const sHtml = await fetchHtmlSafe('https://serieskao.top/', 'https://serieskao.top/');
    if (sHtml) {
      const linkRe =
        /<a[^>]+href="(https?:\/\/serieskao\.top\/(?:serie|pelicula|ver)\/[^"]+)"[^>]*>[\s\S]{0,400}?<img[^>]+src="([^"]+)"[^>]*alt="([^"]+)"/gi;
      let m: RegExpExecArray | null;
      while ((m = linkRe.exec(sHtml)) !== null && sCount < 30) {
        const href = String(m[1] || '').trim();
        const poster = String(m[2] || '').trim();
        const title = String(m[3] || '').trim();
        if (!href || !title) continue;
        const isMovie = href.includes('/pelicula');
        upsertIndexedEntry({
          id: `serieskao-${normalizeCompactCatalogQuery(title).slice(0, 32)}`,
          mediaType: isMovie ? 'movie' : 'tv',
          title,
          originalTitle: title,
          year: 'HD',
          rating: '',
          overview: 'Disponible por capítulos y HD Español vía SeriesKao.',
          poster: poster ? `/api/img-proxy?url=${encodeURIComponent(poster)}` : '',
          backdrop: poster ? `/api/img-proxy?url=${encodeURIComponent(poster)}` : '',
          seriesKaoUrl: href,
          languages: ['Latino', 'Castellano', 'VOSE'],
          sources: ['serieskao'],
          popularity: 16,
          indexedAt: Date.now(),
        });
        sCount += 1;
      }
    }
    const metric: SourceRefreshMetric = {
      source: 'serieskao',
      lastRunAt: sStart,
      itemsIndexed: sCount,
      ok: true,
    };
    sourceMetrics.set('serieskao', metric);
    out.push(metric);
  } catch (err: any) {
    const metric: SourceRefreshMetric = {
      source: 'serieskao',
      lastRunAt: sStart,
      itemsIndexed: sCount,
      ok: false,
      error: err?.message,
    };
    sourceMetrics.set('serieskao', metric);
    out.push(metric);
  }

  return out;
}

export async function refreshVestMirrors(): Promise<SourceRefreshMetric> {
  const started = Date.now();
  let count = 0;
  try {
    const entries = listVestCatalogEntries({ mediaType: 'all' });
    for (const ve of entries) {
      upsertIndexedEntry({
        id: ve.id || `vest-${normalizeCompactCatalogQuery(ve.title)}`,
        tmdbId: ve.tmdbId,
        mediaType: ve.mediaType === 'tv' ? 'tv' : 'movie',
        title: ve.title,
        originalTitle: ve.originalTitle || ve.title,
        year: ve.year || 'HD',
        rating: ve.rating || '',
        overview: ve.overview || '',
        poster: ve.poster || '',
        backdrop: ve.backdrop || ve.poster || '',
        vestUrl: ve.vestUrl,
        bingetrixUrl: ve.tmdbId
          ? ve.mediaType === 'tv'
            ? `https://bingetrix.sc/watch/tv/${ve.tmdbId}/1/1`
            : `https://bingetrix.sc/watch/${ve.tmdbId}`
          : undefined,
        languages: ve.languages || ['Castellano', 'Latino', 'VOSE'],
        sources: ['vest'],
        popularity: 22,
        indexedAt: Date.now(),
      });
      count += 1;
    }
    const metric: SourceRefreshMetric = { source: 'vest', lastRunAt: started, itemsIndexed: count, ok: true };
    sourceMetrics.set('vest', metric);
    return metric;
  } catch (err: any) {
    const metric: SourceRefreshMetric = {
      source: 'vest',
      lastRunAt: started,
      itemsIndexed: count,
      ok: false,
      error: err?.message,
    };
    sourceMetrics.set('vest', metric);
    return metric;
  }
}

export async function fetchTmdbSpanishAltTitles(
  tmdbId: number,
  mediaType: 'movie' | 'tv'
): Promise<{ titles: string[]; year: string; esTitle?: string }> {
  const cleanId = Number(tmdbId || 0);
  if (!cleanId) return { titles: [], year: '' };
  const cKey = `${mediaType}:${cleanId}`;
  const cached = tmdbSpanishMetaCache.get(cKey);
  if (cached) return cached;

  try {
    const apiKey = ENV.tmdbApiKey;
    const url = `https://api.themoviedb.org/3/${mediaType}/${cleanId}?api_key=${apiKey}&language=es-ES&append_to_response=translations,alternative_titles`;
    const r = await fetch(url, { signal: AbortSignal.timeout(3500) });
    if (!r.ok) return { titles: [], year: '' };
    const tmJson: any = await r.json();

    const esRegions = new Set(['ES', 'MX', 'AR', 'CO', 'CL', 'PE', 'VE', 'UY', '419']);
    const esTranslationTitles: string[] = [];
    const esAltTitles: string[] = [];
    const otherTitles: string[] = [];
    const primary = String(tmJson?.title || tmJson?.name || '').trim();
    const orig = String(tmJson?.original_title || tmJson?.original_name || '').trim();
    const year = String(tmJson?.release_date || tmJson?.first_air_date || '').split('-')[0] || '';

    const translations: any[] = Array.isArray(tmJson?.translations?.translations)
      ? tmJson.translations.translations
      : [];
    for (const tr of translations) {
      const trName = String(tr?.data?.title || tr?.data?.name || '').trim();
      if (!trName) continue;
      const langCode = String(tr?.iso_639_1 || '').toLowerCase();
      const countryCode = String(tr?.iso_3166_1 || '').toUpperCase();
      if (langCode === 'es') {
        if (countryCode === 'ES') esTranslationTitles.unshift(trName);
        else esTranslationTitles.push(trName);
      } else if (langCode === 'en') {
        otherTitles.push(trName);
      }
    }

    const rawAltList: any[] = Array.isArray(tmJson?.alternative_titles?.titles)
      ? tmJson.alternative_titles.titles
      : Array.isArray(tmJson?.alternative_titles?.results)
      ? tmJson.alternative_titles.results
      : [];
    for (const alt of rawAltList) {
      const altTitle = String(alt?.title || alt?.name || '').trim();
      if (!altTitle) continue;
      const countryCode = String(alt?.iso_3166_1 || '').toUpperCase();
      if (esRegions.has(countryCode)) {
        if (countryCode === 'ES') esAltTitles.unshift(altTitle);
        else esAltTitles.push(altTitle);
      } else if (countryCode === 'US' || countryCode === 'GB') {
        otherTitles.push(altTitle);
      }
    }

    const deduped = Array.from(
      new Set(
        [primary, ...esTranslationTitles, ...esAltTitles, orig, ...otherTitles]
          .map((s) => s.trim())
          .filter(Boolean)
      )
    );
    const out = { titles: deduped, year, esTitle: primary || esTranslationTitles[0] || esAltTitles[0] || undefined };
    tmdbSpanishMetaCache.set(cKey, out);
    return out;
  } catch {
    return { titles: [], year: '' };
  }
}

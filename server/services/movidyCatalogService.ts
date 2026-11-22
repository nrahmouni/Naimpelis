/**
 * @module server/services/movidyCatalogService
 * @description Scraper and parser for Movidy Spanish cinema catalog feeds.
 */
import { logger } from '../utils/logger.ts';
import { CHROME_UA, fetchTextWithCurlFallback } from '../extractors/httpHelpers.ts';
import { MOVIDY_ORIGIN, normalizeMovidyUrl } from '../extractors/bingetrixMovidy.ts';
import { MOVIDY_GENRE_SLUGS } from '../data/vodConstants.ts';

export async function scrapeMovidyCatalog(opts: {
  category: string;
  page: number;
  query: string;
}): Promise<{ movies: any[]; hasMore: boolean }> {
  try {
    const { category, page, query } = opts;
    let targetUrl = `${MOVIDY_ORIGIN}/pelis/`;

    if (query) {
      targetUrl = `${MOVIDY_ORIGIN}/?s=${encodeURIComponent(query)}`;
    } else if (MOVIDY_GENRE_SLUGS[category]) {
      const slug = MOVIDY_GENRE_SLUGS[category];
      targetUrl =
        page > 1
          ? `${MOVIDY_ORIGIN}/genero/${slug}/page/${page}`
          : `${MOVIDY_ORIGIN}/genero/${slug}/`;
    } else {
      targetUrl = page > 1 ? `${MOVIDY_ORIGIN}/pelis/page/${page}` : `${MOVIDY_ORIGIN}/pelis/`;
    }

    const html = await fetchTextWithCurlFallback(
      targetUrl,
      { 'User-Agent': CHROME_UA, Referer: `${MOVIDY_ORIGIN}/` },
      4800
    );

    if (!html) return { movies: [], hasMore: false };

    const itemRe =
      /<li>\s*<a\s+href="((?:https?:\/\/movidy\.[a-z]+)?\/ver\/[^"]+)"[^>]*>\s*<h3\s+class="item-title">\s*<span>([^<]+)<\/span>\s*<\/h3>\s*<img[^>]+data-src="([^"]+)"/gi;
    const movies: any[] = [];
    let m: RegExpExecArray | null;

    while ((m = itemRe.exec(html)) !== null) {
      const rawHref = String(m[1] || '').trim();
      const rawTitle = String(m[2] || '').trim();
      const rawPoster = String(m[3] || '').trim();
      if (!rawHref || !rawTitle) continue;
      const movidyUrl = normalizeMovidyUrl(rawHref);

      const absPoster = rawPoster.startsWith('//')
        ? `https:${rawPoster}`
        : rawPoster.startsWith('http')
        ? normalizeMovidyUrl(rawPoster)
        : `${MOVIDY_ORIGIN}${rawPoster.startsWith('/') ? rawPoster : `/${rawPoster}`}`;
      const proxiedPoster = `/api/img-proxy?url=${encodeURIComponent(absPoster)}`;
      const slug =
        movidyUrl
          .split('/ver/')[1]
          ?.replace(/\//g, '')
          .replace(/[^a-zA-Z0-9_-]/g, '') || `${movies.length}`;

      movies.push({
        id: `movidy-${slug}`,
        mediaType: 'movie',
        title: rawTitle,
        originalTitle: rawTitle,
        year: 'HD',
        rating: '',
        overview:
          'Disponible en reproducción directa HLS sin anuncios en Español (Castellano, Latino y VOSE vía Movidy + Embed69).',
        poster: proxiedPoster,
        backdrop: proxiedPoster,
        movidyUrl,
        languages: ['Castellano', 'Latino', 'VOSE'],
      });
    }

    const hasNextPage = html.includes(`/page/${page + 1}`);
    return { movies, hasMore: hasNextPage && movies.length > 0 };
  } catch (err) {
    logger.warn({ err }, 'scrapeMovidyCatalog error');
    return { movies: [], hasMore: false };
  }
}

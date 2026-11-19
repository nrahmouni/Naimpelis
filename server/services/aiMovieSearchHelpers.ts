import type { CatalogMovie } from '../../src/types.ts';
import { buildTmdbImageUrl, fetchTmdbJson, resolveTmdbLanguageTag } from './tmdbService.ts';
import { scoreTitleRelevance, type IndexedCatalogEntry } from './catalogRefreshService.ts';

export type AiMovieJobStatus =
  | 'checking_catalog'
  | 'searching_ai'
  | 'verifying_sources'
  | 'found'
  | 'not_found'
  | 'error';

export interface AiMovieRequestJob {
  jobId: string;
  query: string;
  lang: string;
  status: AiMovieJobStatus;
  progressLabel: string;
  steps: string[];
  inCatalogAlready: boolean;
  streamReady: boolean;
  sourcesFound: string[];
  aiNote?: string;
  item: CatalogMovie | null;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

export interface AiCandidateSuggestion {
  spanishTitle: string;
  originalTitle: string;
  releaseYear?: string;
  mediaType: 'movie' | 'tv';
  altQueries: string[];
  note: string;
}

export function localizedStep(lang: string, es: string, ca: string, en: string): string {
  if (lang === 'ca') return ca;
  if (lang === 'en') return en;
  return es;
}

export function indexedEntryToCatalogMovie(entry: IndexedCatalogEntry): CatalogMovie {
  return {
    id: entry.id,
    tmdbId: entry.tmdbId,
    mediaType: entry.mediaType,
    title: entry.title,
    originalTitle: entry.originalTitle,
    year: entry.year || 'HD',
    rating: entry.rating || '7.5',
    overview: entry.overview || '',
    poster: entry.poster || '',
    backdrop: entry.backdrop || entry.poster || '',
    movidyUrl: entry.movidyUrl,
    vestUrl: entry.vestUrl,
    bingetrixUrl: entry.bingetrixUrl,
    languages: entry.languages?.length ? entry.languages : ['Castellano', 'Latino', 'VOSE'],
  };
}

export async function searchTmdbCandidatesForQueries(
  queries: string[],
  preferredType: 'movie' | 'tv' | 'all',
  lang: string,
  expectedYear?: string
): Promise<Array<{
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  title: string;
  originalTitle: string;
  year: string;
  rating: string;
  overview: string;
  poster: string;
  backdrop: string;
  score: number;
}>> {
  const tmdbLang = resolveTmdbLanguageTag(lang);
  const uniqueQueries = Array.from(
    new Set(queries.map((q) => q.trim()).filter((q) => q.length >= 2))
  ).slice(0, 3);
  const foundMap = new Map<string, any>();

  await Promise.all(
    uniqueQueries.map(async (q) => {
      const endpoint =
        preferredType === 'movie'
          ? '/search/movie'
          : preferredType === 'tv'
          ? '/search/tv'
          : '/search/multi';

      const [esRes, enRes] = await Promise.all([
        fetchTmdbJson<{ results?: any[] }>(endpoint, { query: q, language: tmdbLang, page: 1 }),
        tmdbLang === 'en-US'
          ? Promise.resolve(null)
          : fetchTmdbJson<{ results?: any[] }>(endpoint, { query: q, language: 'en-US', page: 1 }),
      ]);

      for (const payload of [esRes, enRes]) {
        for (const row of payload?.results || []) {
          const mType: 'movie' | 'tv' | null =
            preferredType !== 'all'
              ? preferredType
              : row.media_type === 'tv'
              ? 'tv'
              : row.media_type === 'movie'
              ? 'movie'
              : null;
          if (!mType || !row.id) continue;
          const title = String(row.title || row.name || '').trim();
          const originalTitle = String(row.original_title || row.original_name || title).trim();
          if (!title) continue;
          const date = String(row.release_date || row.first_air_date || '');
          const candYear = date ? date.slice(0, 4) : '';
          const key = `${mType}-${row.id}`;
          const rel = scoreTitleRelevance(title, originalTitle, q, {
            popularity: Number(row.popularity || 0),
          });
          let yearBoost = 0;
          if (expectedYear && candYear) {
            const diff = Math.abs(Number(expectedYear) - Number(candYear));
            if (diff === 0) yearBoost = 360;
            else if (diff === 1) yearBoost = 120;
            else if (diff >= 3) yearBoost = -180;
          }
          const finalScore = rel + yearBoost + (row.poster_path ? 35 : 0);
          const existing = foundMap.get(key);
          if (!existing || finalScore > existing.score) {
            foundMap.set(key, {
              tmdbId: Number(row.id),
              mediaType: mType,
              title,
              originalTitle,
              year: candYear,
              rating: row.vote_average ? Number(row.vote_average).toFixed(1) : '7.4',
              overview: String(row.overview || existing?.overview || '').trim(),
              poster: buildTmdbImageUrl(row.poster_path, 'w500') || existing?.poster || '',
              backdrop:
                buildTmdbImageUrl(row.backdrop_path || row.poster_path, 'w1280') ||
                existing?.backdrop ||
                '',
              score: finalScore,
            });
          }
        }
      }
    })
  );

  return Array.from(foundMap.values()).sort((a, b) => b.score - a.score);
}

export async function buildSmartHeuristicAndWikipediaCandidates(
  userQuery: string,
  preferredType: 'movie' | 'tv' | 'all',
  lang: string
): Promise<AiCandidateSuggestion[]> {
  const clean = String(userQuery || '').trim();
  const inferredType: 'movie' | 'tv' = preferredType === 'tv' ? 'tv' : 'movie';
  const yearMatch = clean.match(/\b(19\d{2}|20\d{2})\b/);
  const releaseYear = yearMatch ? yearMatch[1] : undefined;

  const stripped = clean
    .replace(/\b(19\d{2}|20\d{2})\b/g, ' ')
    .replace(
      /\b(la\s+peli(?:cula)?|esa\s+peli(?:cula)?|pel[ií]cula|serie|movie|film|director|dirigida\s+por|protagonizada\s+por|con|del|de\s+la)\b/gi,
      ' '
    )
    .replace(/\s+/g, ' ')
    .trim();

  const words = stripped.split(/\s+/).filter(Boolean);
  const heuristicQueries = Array.from(
    new Set(
      [
        stripped,
        words.length >= 2 ? words.slice(0, Math.max(1, words.length - 1)).join(' ') : '',
        words.length >= 3 ? words.slice(0, words.length - 2).join(' ') : '',
        words.length >= 4 ? words.slice(0, 3).join(' ') : '',
        clean,
      ].filter((q) => q.length >= 2)
    )
  );

  const wikiSearchBase =
    clean
      .replace(/\b(esa|esta|la|el|los|las|un|una|unos|unas|de|del|en|con|por|para|que|se|su|peli|pelicula|película|donde)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim() || clean;

  const wikiTitles: string[] = [];
  await Promise.all(
    (['es', 'en'] as const).map(async (wpLang) => {
      try {
        const suffix =
          preferredType === 'tv'
            ? wpLang === 'es'
              ? ' serie'
              : ' TV series'
            : wpLang === 'es'
            ? ' pelicula'
            : ' film';
        const url = `https://${wpLang}.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=4&srsearch=${encodeURIComponent(
          `${wikiSearchBase}${suffix}`
        )}`;
        const r = await fetch(url, {
          headers: { 'User-Agent': 'NAIMCINE-Catalog/3.1' },
          signal: AbortSignal.timeout(3500),
        });
        if (!r.ok) return;
        const json: any = await r.json();
        const rows: any[] = Array.isArray(json?.query?.search) ? json.query.search : [];
        for (const row of rows) {
          const rawTitle = String(row?.title || '').trim();
          if (!rawTitle) continue;
          const isFilmArticle = /\((?:pel[ií]cula|film|cortometraje|television\s+series|serie)/i.test(
            rawTitle
          );
          const cleanedTitle = rawTitle.replace(/\s*\([^)]*\)\s*/g, '').trim();
          if (cleanedTitle.length >= 2 && (isFilmArticle || wikiTitles.length < 3)) {
            if (isFilmArticle) wikiTitles.unshift(cleanedTitle);
            else wikiTitles.push(cleanedTitle);
          }
        }
      } catch {
        // non-fatal
      }
    })
  );

  const uniqueAll = Array.from(new Set([...wikiTitles, ...heuristicQueries])).slice(0, 6);
  const primaryTitle = wikiTitles[0] || stripped || clean;

  return [
    {
      spanishTitle: primaryTitle,
      originalTitle: wikiTitles[1] || primaryTitle,
      releaseYear,
      mediaType: inferredType,
      altQueries: uniqueAll,
      note: localizedStep(
        lang,
        `Resolución inteligente multi-fuente para «${clean}».`,
        `Resolució intel·ligent multifont per a «${clean}».`,
        `Smart multi-source resolution for “${clean}”.`
      ),
    },
  ];
}

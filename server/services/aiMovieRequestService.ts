import crypto from 'node:crypto';
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';
import type { CatalogMovie } from '../../src/types.ts';
import { LruTtlCache } from '../utils/lruCache.ts';
import { logger } from '../utils/logger.ts';
import { buildTmdbImageUrl, fetchTmdbJson, resolveTmdbLanguageTag } from './tmdbService.ts';
import {
  liveOnDemandFallbackSearch,
  scoreTitleRelevance,
  searchIndexedCatalog,
  upsertIndexedEntry,
  type IndexedCatalogEntry,
} from './catalogRefreshService.ts';
import {
  findVestSeedForMedia,
  listVestCatalogEntries,
} from './vestMirrorService.ts';
import {
  findMovidyUrlByTitle,
  has2EmbedEnglishStreamFast,
  hasBingetrixEnglishStreamFast,
} from '../extractors/bingetrixMovidy.ts';
import { extractEmbed69SpanishTracks } from '../extractors/vidhideEmbed69.ts';

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

interface AiCandidateSuggestion {
  spanishTitle: string;
  originalTitle: string;
  releaseYear?: string;
  mediaType: 'movie' | 'tv';
  altQueries: string[];
  note: string;
}

const jobCache = new LruTtlCache<string, AiMovieRequestJob>(200, 30 * 60 * 1000);

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function localizedStep(lang: string, es: string, ca: string, en: string): string {
  if (lang === 'ca') return ca;
  if (lang === 'en') return en;
  return es;
}

function indexedEntryToCatalogMovie(entry: IndexedCatalogEntry): CatalogMovie {
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

interface VerifiedMediaResult {
  item: CatalogMovie;
  sourcesFound: string[];
  streamReady: boolean;
}

async function verifyAndBuildCatalogMovie(candidate: {
  tmdbId?: number;
  mediaType: 'movie' | 'tv';
  title: string;
  originalTitle?: string;
  year?: string;
  rating?: string;
  overview?: string;
  poster?: string;
  backdrop?: string;
  movidyUrl?: string;
  vestUrl?: string;
  bingetrixUrl?: string;
  imdbId?: string | null;
}): Promise<VerifiedMediaResult> {
  const titleHints = Array.from(
    new Set([candidate.title, candidate.originalTitle || ''].map((s) => s.trim()).filter(Boolean))
  );
  const yearHint = String(candidate.year || '').slice(0, 4);
  const tmdbId = candidate.tmdbId;
  const mediaType = candidate.mediaType;

  const sourcesFound: string[] = [];
  let movidyUrl = candidate.movidyUrl || '';
  let vestUrl = candidate.vestUrl || '';
  const bingetrixUrl =
    candidate.bingetrixUrl ||
    (tmdbId
      ? mediaType === 'tv'
        ? `https://bingetrix.sc/watch/tv/${tmdbId}/1/1`
        : `https://bingetrix.sc/watch/${tmdbId}`
      : '');

  // Probe stream providers concurrently with a 2.4s deadline so a slow mirror never blocks delivery
  const timedResolve = <T>(p: Promise<T>, fallback: T): Promise<T> =>
    Promise.race([
      p.catch(() => fallback),
      new Promise<T>((resolve) => setTimeout(() => resolve(fallback), 2400)),
    ]);

  const [mvHit, vestHit, bingetrixOk, twoEmbedOk, embed69Tracks] = await Promise.all([
    movidyUrl
      ? Promise.resolve(movidyUrl)
      : timedResolve(findMovidyUrlByTitle(candidate.title, yearHint, { titleHints }), null),
    Promise.resolve(
      vestUrl
        ? { vestUrl }
        : findVestSeedForMedia({
            tmdbId,
            mediaType,
            yearHint,
            titleHints,
          })
    ),
    tmdbId
      ? timedResolve(hasBingetrixEnglishStreamFast({ tmdbId, mediaType, season: 1, episode: 1 }), false)
      : Promise.resolve(false),
    tmdbId
      ? timedResolve(has2EmbedEnglishStreamFast({ tmdbId, mediaType, season: 1, episode: 1 }), false)
      : Promise.resolve(false),
    tmdbId
      ? timedResolve(
          extractEmbed69SpanishTracks({
            tmdbId,
            imdbId: candidate.imdbId,
            mediaType,
            season: 1,
            episode: 1,
            titleHints,
            yearHint,
          }),
          []
        )
      : Promise.resolve([]),
  ]);

  if (mvHit) {
    movidyUrl = mvHit;
    sourcesFound.push('Movidy ES/LAT');
  }
  if (vestHit?.vestUrl) {
    vestUrl = vestHit.vestUrl;
    sourcesFound.push('Mirror HD');
  }
  if (bingetrixOk) {
    sourcesFound.push('Bingetrix EN 1080p');
  }
  if (twoEmbedOk) {
    sourcesFound.push('2Embed HD');
  }
  if (Array.isArray(embed69Tracks) && embed69Tracks.length > 0) {
    sourcesFound.push('Embed69 ES/LAT/VOSE');
  }

  const languages = Array.from(
    new Set([
      ...(sourcesFound.some((s) => /Movidy|Embed69|Mirror/i.test(s))
        ? ['Castellano', 'Latino', 'VOSE']
        : []),
      ...(sourcesFound.some((s) => /Bingetrix|2Embed/i.test(s)) ? ['English 1080p', 'VOSE'] : []),
      ...(sourcesFound.length === 0 ? ['Castellano', 'Latino', 'VOSE'] : []),
    ])
  );

  const itemId = tmdbId
    ? `tmdb-${mediaType}-${tmdbId}`
    : `ai-${mediaType}-${crypto.createHash('md5').update(candidate.title).digest('hex').slice(0, 10)}`;

  const item: CatalogMovie = {
    id: itemId,
    tmdbId,
    mediaType,
    seasonNumber: mediaType === 'tv' ? 1 : undefined,
    title: candidate.title,
    originalTitle: candidate.originalTitle || candidate.title,
    year: yearHint || 'HD',
    rating: candidate.rating || '7.6',
    overview: candidate.overview || '',
    poster: candidate.poster || '/icon.svg',
    backdrop: candidate.backdrop || candidate.poster || '',
    movidyUrl: movidyUrl || undefined,
    vestUrl: vestUrl || undefined,
    bingetrixUrl: bingetrixUrl || undefined,
    languages,
    addedAt: Date.now(),
  };

  // Upsert into indexed catalog cache so future searches & Browse find it instantly
  upsertIndexedEntry({
    id: item.id,
    tmdbId: item.tmdbId,
    mediaType,
    title: item.title,
    originalTitle: item.originalTitle || item.title,
    year: item.year,
    rating: item.rating,
    overview: item.overview,
    poster: item.poster,
    backdrop: item.backdrop,
    movidyUrl: item.movidyUrl,
    vestUrl: item.vestUrl,
    bingetrixUrl: item.bingetrixUrl,
    languages: item.languages,
    sources: ['tmdb'],
    popularity: 55,
    indexedAt: Date.now(),
  });

  return {
    item,
    sourcesFound,
    streamReady: sourcesFound.length > 0,
  };
}

async function searchTmdbCandidatesForQueries(
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
  const uniqueQueries = Array.from(new Set(queries.map((q) => q.trim()).filter((q) => q.length >= 2))).slice(0, 3);
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
              backdrop: buildTmdbImageUrl(row.backdrop_path || row.poster_path, 'w1280') || existing?.backdrop || '',
              score: finalScore,
            });
          }
        }
      }
    })
  );

  return Array.from(foundMap.values()).sort((a, b) => b.score - a.score);
}

async function buildSmartHeuristicAndWikipediaCandidates(
  userQuery: string,
  preferredType: 'movie' | 'tv' | 'all',
  lang: string
): Promise<AiCandidateSuggestion[]> {
  const clean = String(userQuery || '').trim();
  const inferredType: 'movie' | 'tv' = preferredType === 'tv' ? 'tv' : 'movie';
  const yearMatch = clean.match(/\b(19\d{2}|20\d{2})\b/);
  const releaseYear = yearMatch ? yearMatch[1] : undefined;

  // 1. Strip release year & common natural-language wrapper phrases to isolate core title tokens
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

  // Strip Spanish/English stop-words for tighter Wikipedia plot/keyword disambiguation
  const wikiSearchBase = clean
    .replace(/\b(esa|esta|la|el|los|las|un|una|unos|unas|de|del|en|con|por|para|que|se|su|peli|pelicula|película|donde)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim() || clean;

  // 2. Query Spanish & English Wikipedia search APIs to disambiguate plot/director/rare titles
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
            if (isFilmArticle) {
              wikiTitles.unshift(cleanedTitle);
            } else {
              wikiTitles.push(cleanedTitle);
            }
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

async function askGeminiForMovieCandidates(
  userQuery: string,
  preferredType: 'movie' | 'tv' | 'all',
  excludedTitles: string[],
  lang: string
): Promise<AiCandidateSuggestion[]> {
  const ai = getGeminiClient();
  if (!ai) {
    return buildSmartHeuristicAndWikipediaCandidates(userQuery, preferredType, lang);
  }

  const excludeClause =
    excludedTitles.length > 0
      ? `\nPreviously tried without playable streams (try different titles, sequels, remakes, or exact original titles): ${excludedTitles.join(', ')}`
      : '';

  const geminiPromise = ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `Identify up to 4 most likely movies or TV series matching the user's request: "${userQuery}".
Preferred mediaType hint: "${preferredType}".${excludeClause}
Think carefully about:
- Spanish (Spain / Latam) localized release titles AND exact original English/native titles.
- Typos, phonetic spellings, actor/director/plot descriptions, or partial names.
- Exact release year if known.
Respond strictly in JSON matching the schema.`,
    config: {
      systemInstruction:
        'You are a cinema metadata specialist for a streaming catalog. Always return accurate real movie/TV series titles (both Spanish localized title and exact original title) plus concise search variations.',
      thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          candidates: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                spanishTitle: { type: Type.STRING, description: 'Spanish localized title' },
                originalTitle: { type: Type.STRING, description: 'Original English or native title' },
                releaseYear: { type: Type.STRING, description: '4-digit release year if known' },
                mediaType: { type: Type.STRING, description: 'Either movie or tv' },
                altQueries: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: 'Alternative short search strings for catalog/TMDB lookup',
                },
                note: { type: Type.STRING, description: 'Short 1-sentence identification reason' },
              },
              required: ['spanishTitle', 'originalTitle', 'mediaType', 'altQueries', 'note'],
            },
          },
        },
        required: ['candidates'],
      },
    },
  });

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('Gemini candidate lookup timeout')), 11000);
  });

  const response = await Promise.race([geminiPromise, timeoutPromise]);

  const rawText = (response.text || '{}').trim();
  const parsed = JSON.parse(rawText) as { candidates?: any[] };
  if (!Array.isArray(parsed?.candidates)) return [];

  return parsed.candidates
    .map((c) => ({
      spanishTitle: String(c.spanishTitle || '').trim(),
      originalTitle: String(c.originalTitle || c.spanishTitle || '').trim(),
      releaseYear: String(c.releaseYear || '').replace(/\D/g, '').slice(0, 4) || undefined,
      mediaType: (String(c.mediaType).toLowerCase() === 'tv' ? 'tv' : 'movie') as 'movie' | 'tv',
      altQueries: Array.isArray(c.altQueries)
        ? c.altQueries.map((x: any) => String(x || '').trim()).filter(Boolean)
        : [],
      note: String(c.note || '').trim(),
    }))
    .filter((c) => Boolean(c.spanishTitle || c.originalTitle));
}

function updateJob(job: AiMovieRequestJob, patch: Partial<AiMovieRequestJob>): void {
  Object.assign(job, patch, { updatedAt: Date.now() });
  jobCache.set(job.jobId, job);
}

async function runAiSearchPipeline(
  job: AiMovieRequestJob,
  preferredType: 'movie' | 'tv' | 'all'
): Promise<void> {
  const { query, lang } = job;
  const triedTitles: string[] = [];

  try {
    // STEP 1: Check existing local indexed catalog & Vest mirror first
    const indexedHits = searchIndexedCatalog(query, { mediaType: preferredType, limit: 8 });
    const vestHits = listVestCatalogEntries({ mediaType: preferredType, query });
    const topLocal = indexedHits[0];

    if (
      topLocal &&
      scoreTitleRelevance(topLocal.title, topLocal.originalTitle, query, { altTitle: topLocal.altTitle }) >= 420
    ) {
      updateJob(job, {
        status: 'verifying_sources',
        progressLabel: localizedStep(
          lang,
          `Encontrado en tu catálogo («${topLocal.title}»). Verificando streams HD…`,
          `Trobat al teu catàleg («${topLocal.title}»). Verificant streams HD…`,
          `Found in catalog (“${topLocal.title}”). Verifying HD streams…`
        ),
        steps: [
          ...job.steps,
          localizedStep(lang, `Coincidencia exacta en catálogo: ${topLocal.title}`, `Coincidència exacta: ${topLocal.title}`, `Exact catalog match: ${topLocal.title}`),
        ],
      });

      const catalogMovie = indexedEntryToCatalogMovie(topLocal);
      const verified = await verifyAndBuildCatalogMovie({
        ...catalogMovie,
        mediaType: catalogMovie.mediaType === 'tv' ? 'tv' : 'movie',
      });
      if (verified.streamReady || vestHits.length > 0) {
        updateJob(job, {
          status: 'found',
          inCatalogAlready: true,
          streamReady: verified.streamReady,
          sourcesFound: verified.sourcesFound,
          item: verified.item,
          progressLabel: localizedStep(
            lang,
            '¡Película ya disponible y lista para ver!',
            'Pel·lícula disponible i llesta per veure!',
            'Movie ready to watch!'
          ),
        });
        return;
      }
      triedTitles.push(topLocal.title);
    }

    // STEP 2: AI Iterative Search (Up to 2 Gemini disambiguation & deep-source rounds)
    let bestFallbackCandidate: { item: CatalogMovie; sourcesFound: string[]; streamReady: boolean } | null = null;

    for (let round = 1; round <= 2; round += 1) {
      updateJob(job, {
        status: 'searching_ai',
        progressLabel:
          round === 1
            ? localizedStep(
                lang,
                'No estaba directo en tu catálogo. Buscando con IA título, año y fuentes…',
                'No era al catàleg directe. Cercant amb IA títol, any i fonts…',
                'Not in immediate catalog. Searching with AI for title, year & sources…'
              )
            : localizedStep(
                lang,
                'Refinando búsqueda con IA para encontrar fuentes HD disponibles…',
                'Refinant cerca amb IA per trobar fonts HD disponibles…',
                'Refining AI search to locate available HD streams…'
              ),
        steps: [
          ...job.steps,
          round === 1
            ? localizedStep(lang, 'Analizando petición con IA (Gemini)…', 'Analitzant petició amb IA (Gemini)…', 'Analyzing request with AI (Gemini)…')
            : localizedStep(lang, 'Segundo intento IA buscando títulos alternativos…', 'Segon intent IA cercant títols alternatius…', 'AI Round 2 searching alternate titles…'),
        ],
      });

      let aiSuggestions: AiCandidateSuggestion[] = [];
      try {
        aiSuggestions = await askGeminiForMovieCandidates(query, preferredType, triedTitles, lang);
      } catch (aiErr: any) {
        logger.warn({ err: aiErr?.message, query }, 'gemini_movie_request_fallback');
        aiSuggestions = await buildSmartHeuristicAndWikipediaCandidates(
          query,
          preferredType,
          lang
        );
      }

      const searchQueries = Array.from(
        new Set([
          ...(round === 1 ? [query] : []),
          ...aiSuggestions.flatMap((s) => [s.spanishTitle, s.originalTitle, ...s.altQueries]),
        ])
      ).filter(Boolean);

      const firstAiNote = aiSuggestions.find((s) => s.note)?.note;
      if (firstAiNote && !job.aiNote) {
        updateJob(job, { aiNote: firstAiNote });
      }

      const expectedYear =
        aiSuggestions.find((s) => s.releaseYear)?.releaseYear ||
        query.match(/\b(19\d{2}|20\d{2})\b/)?.[1];

      // Query TMDB + on-demand catalog fallback concurrently
      const [tmdbCandidates, onDemandEntries] = await Promise.all([
        searchTmdbCandidatesForQueries(searchQueries, preferredType, lang, expectedYear),
        Promise.all(searchQueries.slice(0, 2).map((sq) => liveOnDemandFallbackSearch(sq, preferredType))).then(
          (lists) => lists.flat()
        ),
      ]);

      // Merge unique TMDB + onDemand candidates prioritizing TMDB rich metadata
      const mergedCandidates: Array<{
        tmdbId?: number;
        mediaType: 'movie' | 'tv';
        title: string;
        originalTitle: string;
        year: string;
        rating: string;
        overview: string;
        poster: string;
        backdrop: string;
        movidyUrl?: string;
        vestUrl?: string;
      }> = [];
      const seenKeys = new Set<string>();

      for (const c of tmdbCandidates) {
        const k = `${c.mediaType}:${c.tmdbId}`;
        if (seenKeys.has(k) || triedTitles.includes(c.title)) continue;
        seenKeys.add(k);
        mergedCandidates.push(c);
      }
      for (const oe of onDemandEntries) {
        const k = oe.tmdbId ? `${oe.mediaType}:${oe.tmdbId}` : `id:${oe.id}`;
        if (seenKeys.has(k) || triedTitles.includes(oe.title)) continue;
        seenKeys.add(k);
        mergedCandidates.push({
          tmdbId: oe.tmdbId,
          mediaType: oe.mediaType,
          title: oe.title,
          originalTitle: oe.originalTitle,
          year: oe.year,
          rating: oe.rating,
          overview: oe.overview,
          poster: oe.poster,
          backdrop: oe.backdrop,
          movidyUrl: oe.movidyUrl,
          vestUrl: oe.vestUrl,
        });
      }

      if (mergedCandidates.length === 0) {
        continue;
      }

      updateJob(job, {
        status: 'verifying_sources',
        progressLabel: localizedStep(
          lang,
          `Verificando servidores HD para «${mergedCandidates[0].title}»…`,
          `Verificant servidors HD per a «${mergedCandidates[0].title}»…`,
          `Verifying HD streams for “${mergedCandidates[0].title}”…`
        ),
        steps: [
          ...job.steps,
          localizedStep(
            lang,
            `Probando fuentes para: ${mergedCandidates.slice(0, 3).map((c) => c.title).join(', ')}`,
            `Provant fonts per a: ${mergedCandidates.slice(0, 3).map((c) => c.title).join(', ')}`,
            `Probing streams for: ${mergedCandidates.slice(0, 3).map((c) => c.title).join(', ')}`
          ),
        ],
      });

      // Check top 2 candidates until one confirms active playable sources
      for (const cand of mergedCandidates.slice(0, 2)) {
        triedTitles.push(cand.title);
        const verified = await verifyAndBuildCatalogMovie(cand);
        if (!bestFallbackCandidate) {
          bestFallbackCandidate = verified;
        }
        if (verified.streamReady) {
          updateJob(job, {
            status: 'found',
            inCatalogAlready: false,
            streamReady: true,
            sourcesFound: verified.sourcesFound,
            item: verified.item,
            progressLabel: localizedStep(
              lang,
              `¡Encontrada en ${verified.sourcesFound.join(' · ')}! Lista para reproducir.`,
              `Trobada a ${verified.sourcesFound.join(' · ')}! Llista per reproduir.`,
              `Found on ${verified.sourcesFound.join(' · ')}! Ready to play.`
            ),
            steps: [
              ...job.steps,
              localizedStep(
                lang,
                `¡Lista! Fuentes activas: ${verified.sourcesFound.join(', ')}`,
                `Llista! Fonts actives: ${verified.sourcesFound.join(', ')}`,
                `Ready! Active sources: ${verified.sourcesFound.join(', ')}`
              ),
            ],
          });
          return;
        }
      }

      if (!process.env.GEMINI_API_KEY && bestFallbackCandidate) {
        break;
      }
    }

    // Even if quick probes didn't confirm a mirror before timeout, return rich TMDB catalog item
    // so `/api/extract/stream` still executes full multi-engine extraction on Play click!
    if (bestFallbackCandidate) {
      updateJob(job, {
        status: 'found',
        inCatalogAlready: false,
        streamReady: false,
        sourcesFound: bestFallbackCandidate.sourcesFound,
        item: bestFallbackCandidate.item,
        progressLabel: localizedStep(
          lang,
          '¡Título localizado y añadido! Listo para intentar reproducción.',
          'Títol localitzat i afegit! Llest per intentar reproducció.',
          'Title located and added! Ready to attempt playback.'
        ),
      });
      return;
    }

    updateJob(job, {
      status: 'not_found',
      progressLabel: localizedStep(
        lang,
        'No encontramos esa película tras buscar con IA. Prueba añadiendo el año o título original.',
        'No hem trobat aquesta pel·lícula després de cercar amb IA. Prova amb l’any o títol original.',
        'Could not locate that title after AI search. Try adding the release year or original title.'
      ),
    });
  } catch (err: any) {
    logger.error({ err: err?.message, query }, 'ai_movie_request_failed');
    updateJob(job, {
      status: 'error',
      error: err?.message || 'AI search error',
      progressLabel: localizedStep(
        lang,
        'Ocurrió un error al buscar con IA. Inténtalo de nuevo.',
        'S’ha produït un error en cercar amb IA. Torna-ho a intentar.',
        'An error occurred during AI search. Please try again.'
      ),
    });
  }
}

export function startAiMovieRequest(opts: {
  query: string;
  mediaType?: 'movie' | 'tv' | 'all';
  lang?: string;
}): AiMovieRequestJob {
  const cleanQuery = String(opts.query || '').trim().slice(0, 180);
  const lang = String(opts.lang || 'es').slice(0, 5);
  const preferredType: 'movie' | 'tv' | 'all' =
    opts.mediaType === 'movie' || opts.mediaType === 'tv' ? opts.mediaType : 'all';

  const jobId = crypto.randomBytes(6).toString('hex');
  const now = Date.now();
  const job: AiMovieRequestJob = {
    jobId,
    query: cleanQuery,
    lang,
    status: 'checking_catalog',
    progressLabel: localizedStep(
      lang,
      'Comprobando si ya está en tu catálogo…',
      'Comprovant si ja és al teu catàleg…',
      'Checking if already in catalog…'
    ),
    steps: [
      localizedStep(
        lang,
        `Petición recibida: «${cleanQuery}»`,
        `Petició rebuda: «${cleanQuery}»`,
        `Request received: “${cleanQuery}”`
      ),
    ],
    inCatalogAlready: false,
    streamReady: false,
    sourcesFound: [],
    item: null,
    createdAt: now,
    updatedAt: now,
  };

  jobCache.set(jobId, job);
  void runAiSearchPipeline(job, preferredType);
  return job;
}

export function getAiMovieRequestJob(jobId: string): AiMovieRequestJob | null {
  const clean = String(jobId || '').trim();
  if (!clean) return null;
  return jobCache.get(clean) || null;
}

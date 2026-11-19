import crypto from 'node:crypto';
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';
import type { CatalogMovie } from '../../src/types.ts';
import { LruTtlCache } from '../utils/lruCache.ts';
import { logger } from '../utils/logger.ts';
import {
  liveOnDemandFallbackSearch,
  scoreTitleRelevance,
  searchIndexedCatalog,
  upsertIndexedEntry,
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
import {
  buildSmartHeuristicAndWikipediaCandidates,
  indexedEntryToCatalogMovie,
  localizedStep,
  searchTmdbCandidatesForQueries,
  type AiCandidateSuggestion,
  type AiMovieJobStatus,
  type AiMovieRequestJob,
} from './aiMovieSearchHelpers.ts';

export type { AiMovieJobStatus, AiMovieRequestJob };

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
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
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

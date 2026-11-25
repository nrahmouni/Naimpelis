/**
 * @module server/services/movieReelsService
 * @description Taste-adaptive movie & series TikTok/Reels feed engine combining TMDB
 * recommendations, official trailers, extracted iconic "pro" scenes from YouTube,
 * and Gemini AI conversational host hooks tailored to the viewer's likes.
 */
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { fetchTmdbJson, fetchTmdbTitleLogo, buildTmdbImageUrl } from './tmdbService.ts';
import { LruTtlCache } from '../utils/lruCache.ts';
import { logger } from '../utils/logger.ts';

export type ReelsMoodFilter =
  | 'para_ti'
  | 'estrenos'
  | 'accion'
  | 'thriller'
  | 'scifi'
  | 'comedia'
  | 'series';

export type ReelsContentMode = 'all' | 'trailers' | 'scenes';

export interface ReelClipSource {
  id: string;
  kind: 'trailer' | 'pro_scene';
  label: string;
  videoId: string;
  title: string;
  startSec: number;
  durationLabel?: string;
}

export interface ReelHostComment {
  hook: string;
  whyForYou: string;
  proMoment: string;
  moodLabel: string;
  aiGenerated: boolean;
}

export interface MovieReelItem {
  id: string;
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  title: string;
  originalTitle?: string;
  year: string;
  rating: string;
  genres: string[];
  genreIds: number[];
  overview: string;
  poster: string;
  backdrop: string;
  logoUrl?: string;
  clips: ReelClipSource[];
  defaultClipIndex: number;
  hostComment: ReelHostComment;
  recommendationReason: string;
  seedMatchTitle?: string;
}

export interface ReelsFeedRequest {
  likedIds?: string[];
  dislikedIds?: string[];
  seenIds?: string[];
  likedGenres?: number[];
  dislikedGenres?: number[];
  likedTitles?: string[];
  seedItems?: Array<{ tmdbId: number; mediaType: 'movie' | 'tv'; title?: string }>;
  mood?: ReelsMoodFilter;
  contentMode?: ReelsContentMode;
  lang?: string;
  limit?: number;
}

const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const TMDB_GENRE_NAMES_ES: Record<number, string> = {
  28: 'Acción',
  12: 'Aventura',
  16: 'Animación',
  35: 'Comedia',
  80: 'Crimen',
  99: 'Documental',
  18: 'Drama',
  10751: 'Familia',
  14: 'Fantasía',
  36: 'Historia',
  27: 'Terror',
  10402: 'Música',
  9648: 'Misterio',
  10749: 'Romance',
  878: 'Ciencia Ficción',
  53: 'Thriller',
  10752: 'Bélica',
  37: 'Western',
  10759: 'Acción y Aventura',
  10765: 'Sci-Fi y Fantasía',
};

const MOOD_GENRE_MAP: Record<ReelsMoodFilter, { movieGenres?: string; tvGenres?: string }> = {
  para_ti: {},
  estrenos: {},
  accion: { movieGenres: '28,12', tvGenres: '10759' },
  thriller: { movieGenres: '53,80,9648', tvGenres: '80,9648' },
  scifi: { movieGenres: '878,14', tvGenres: '10765' },
  comedia: { movieGenres: '35', tvGenres: '35' },
  series: { tvGenres: '18,80,10765' },
};

const clipsCache = new LruTtlCache<
  string,
  { clips: ReelClipSource[]; logoUrl?: string }
>(300, 25 * 60 * 1000);

const hostCommentCache = new LruTtlCache<string, ReelHostComment>(400, 30 * 60 * 1000);
const feedResponseCache = new LruTtlCache<
  string,
  { reels: MovieReelItem[]; aiHostActive: boolean }
>(40, 8 * 60 * 1000);

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

function parseDurationToSeconds(raw: string | undefined): number {
  const clean = String(raw || '').trim();
  if (!clean) return 0;
  const parts = clean.split(':').map((p) => Number(p));
  if (parts.some((n) => !Number.isFinite(n))) return 0;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

function computeSmartSceneStartSec(durationSec: number, title: string): number {
  if (durationSec <= 65) return 0;
  if (/\b(?:intro|opening|trailer)\b/i.test(title)) return 0;
  if (durationSec >= 180) return 14;
  if (durationSec >= 110) return 8;
  return 4;
}

async function searchYouTubeSceneClips(
  title: string,
  originalTitle: string | undefined,
  mediaType: 'movie' | 'tv',
  year: string
): Promise<ReelClipSource[]> {
  const queries = [
    `${title} mejor escena español`,
    `${originalTitle || title} best scene hd ${year && year !== 'HD' ? year : ''}`.trim(),
  ];

  const badTitleRe =
    /\b(?:resumen|explicaci[oó]n|ending\s*explained|review|critica|cr[ií]tica|reacci[oó]n|reaction|podcast|top\s*\d+|curiosidades|easter\s*eggs|teor[ií]as|full\s*movie|pel[ií]cula\s*completa|gameplay|soundtrack\s*1\s*hour|ost\s*full)\b/i;

  const collected: ReelClipSource[] = [];
  const seenIds = new Set<string>();

  for (let qIdx = 0; qIdx < queries.length; qIdx++) {
    // Only run second English query if the first Spanish query returned zero scenes
    if (collected.length >= 1) break;
    const q = queries[qIdx];
    try {
      const ytRes = await fetch(
        `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&hl=es`,
        {
          headers: {
            'User-Agent': CHROME_UA,
            'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
          },
          signal: AbortSignal.timeout(1700),
        }
      );
      if (!ytRes.ok) continue;
      const html = await ytRes.text();
      const initMatch = html.match(/var\s+ytInitialData\s*=\s*(\{[\s\S]+?\});<\/script>/);
      if (!initMatch) continue;
      const data = JSON.parse(initMatch[1]) as {
        contents?: {
          twoColumnSearchResultsRenderer?: {
            primaryContents?: {
              sectionListRenderer?: {
                contents?: Array<{
                  itemSectionRenderer?: {
                    contents?: Array<{
                      videoRenderer?: {
                        videoId?: string;
                        title?: { runs?: Array<{ text?: string }> };
                        lengthText?: { simpleText?: string };
                      };
                    }>;
                  };
                }>;
              };
            };
          };
        };
      };

      const sections =
        data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer
          ?.contents || [];
      for (const sec of sections) {
        const items = sec?.itemSectionRenderer?.contents || [];
        for (const item of items) {
          const vr = item?.videoRenderer;
          const vid = String(vr?.videoId || '').trim();
          if (!vid || seenIds.has(vid)) continue;
          const vTitle = vr?.title?.runs?.map((r) => r.text || '').join('') || '';
          const durText = String(vr?.lengthText?.simpleText || '').trim();
          const durSec = parseDurationToSeconds(durText);
          if (!vTitle || badTitleRe.test(vTitle)) continue;
          if (durSec > 0 && (durSec < 40 || durSec > 420)) continue;

          const isLikelyTrailer = /\b(?:tr[aá]iler|teaser|avance\s*oficial)\b/i.test(vTitle);
          if (isLikelyTrailer && collected.length > 0) continue;

          seenIds.add(vid);
          collected.push({
            id: `yt-scene-${vid}`,
            kind: isLikelyTrailer ? 'trailer' : 'pro_scene',
            label: isLikelyTrailer
              ? 'Tráiler'
              : mediaType === 'tv'
              ? 'Escena Pro · Serie'
              : 'Escena Pro',
            videoId: vid,
            title: vTitle,
            startSec: isLikelyTrailer ? 0 : computeSmartSceneStartSec(durSec, vTitle),
            durationLabel: durText || undefined,
          });
          if (collected.length >= 2) break;
        }
        if (collected.length >= 2) break;
      }
    } catch {
      // ignore transient YouTube extraction errors
    }
  }

  return collected;
}

async function enrichReelClipsAndLogo(candidate: {
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  title: string;
  originalTitle?: string;
  year: string;
}): Promise<{ clips: ReelClipSource[]; logoUrl?: string }> {
  const cacheKey = `${candidate.mediaType}-${candidate.tmdbId}`;
  const cached = clipsCache.get(cacheKey);
  if (cached) return cached;

  const [esVids, enVids, logoUrl, sceneClips] = await Promise.all([
    fetchTmdbJson<{ results?: Array<Record<string, unknown>> }>(
      `/${candidate.mediaType}/${candidate.tmdbId}/videos`,
      { language: 'es-ES' },
      20 * 60 * 1000
    ).catch(() => null),
    fetchTmdbJson<{ results?: Array<Record<string, unknown>> }>(
      `/${candidate.mediaType}/${candidate.tmdbId}/videos`,
      { language: 'en-US' },
      20 * 60 * 1000
    ).catch(() => null),
    fetchTmdbTitleLogo(candidate.tmdbId, candidate.mediaType, 'es').catch(() => null),
    searchYouTubeSceneClips(
      candidate.title,
      candidate.originalTitle,
      candidate.mediaType,
      candidate.year
    ).catch(() => []),
  ]);

  const rawVideos = [
    ...(Array.isArray(esVids?.results) ? esVids.results : []),
    ...(Array.isArray(enVids?.results) ? enVids.results : []),
  ];

  const ytVideos = rawVideos.filter(
    (v) => v && String(v.site || '') === 'YouTube' && typeof v.key === 'string' && v.key.trim()
  );

  const clips: ReelClipSource[] = [];
  const usedIds = new Set<string>();

  const bestTrailer =
    ytVideos.find((v) => String(v.type) === 'Trailer' && Boolean(v.official)) ||
    ytVideos.find((v) => String(v.type) === 'Trailer') ||
    ytVideos.find((v) => String(v.type) === 'Teaser') ||
    ytVideos[0];

  if (bestTrailer && typeof bestTrailer.key === 'string') {
    const k = bestTrailer.key.trim();
    usedIds.add(k);
    clips.push({
      id: `tmdb-trailer-${k}`,
      kind: 'trailer',
      label: 'Tráiler Oficial',
      videoId: k,
      title: String(bestTrailer.name || `${candidate.title} · Tráiler`),
      startSec: 0,
    });
  }

  // Official TMDB scene clips / featurettes first
  for (const v of ytVideos) {
    const t = String(v.type || '');
    const k = String(v.key || '').trim();
    if (!k || usedIds.has(k)) continue;
    if (t === 'Clip' || t === 'Featurette') {
      usedIds.add(k);
      clips.push({
        id: `tmdb-clip-${k}`,
        kind: 'pro_scene',
        label: 'Escena Oficial',
        videoId: k,
        title: String(v.name || `${candidate.title} · Escena`),
        startSec: 0,
      });
      if (clips.filter((c) => c.kind === 'pro_scene').length >= 1) break;
    }
  }

  // Extracted best scenes from YouTube
  for (const sc of sceneClips) {
    if (usedIds.has(sc.videoId)) continue;
    usedIds.add(sc.videoId);
    clips.push(sc);
    if (clips.length >= 4) break;
  }

  const result = { clips, logoUrl: logoUrl || undefined };
  if (clips.length > 0) {
    clipsCache.set(cacheKey, result);
  }
  return result;
}

function buildFallbackHostComment(
  item: {
    title: string;
    mediaType: 'movie' | 'tv';
    genres: string[];
    overview: string;
    year: string;
    rating: string;
    seedMatchTitle?: string;
    hasProScene: boolean;
  },
  likedTitles: string[]
): ReelHostComment {
  const mainGenre = item.genres[0] || (item.mediaType === 'tv' ? 'Serie' : 'Cine');
  const hook = item.seedMatchTitle
    ? `Si te enganchó ${item.seedMatchTitle}, atento a ${item.title}: arranca directo al grano y no suelta la tensión.`
    : item.hasProScene
    ? `Ojo con ${item.title}: en esta escena ves en segundos por qué tiene un ${item.rating || '8.0'} de nota.`
    : `Si buscas ${mainGenre.toLowerCase()} con ritmo, ${item.title} (${item.year}) merece estar arriba en tu lista.`;

  const whyForYou = item.seedMatchTitle
    ? `Te salta porque encaja con ${item.seedMatchTitle}`
    : likedTitles.length > 0
    ? `Afinidad con tu gusto por ${mainGenre}`
    : `Selección ${mainGenre} mejor valorada`;

  const cleanOverview = String(item.overview || '').trim();
  const proMoment = cleanOverview
    ? cleanOverview.split(/[.!?]/)[0].slice(0, 115)
    : `Dirección y montaje de ${mainGenre} pensados para enganchar desde el primer plano.`;

  return {
    hook,
    whyForYou,
    proMoment,
    moodLabel: item.genres.slice(0, 2).join(' · ') || mainGenre,
    aiGenerated: false,
  };
}

async function enrichBatchWithGeminiHost(
  items: Array<{
    id: string;
    title: string;
    mediaType: 'movie' | 'tv';
    genres: string[];
    overview: string;
    year: string;
    rating: string;
    seedMatchTitle?: string;
    clips: ReelClipSource[];
  }>,
  tasteContext: { likedTitles: string[]; likedGenres: number[]; mood: ReelsMoodFilter }
): Promise<Map<string, ReelHostComment>> {
  const out = new Map<string, ReelHostComment>();
  const tasteFingerprint = [
    tasteContext.mood,
    tasteContext.likedTitles.slice(0, 4).join(','),
    tasteContext.likedGenres.slice(0, 4).join(','),
  ].join('|');

  const uncached: typeof items = [];
  for (const item of items) {
    const cached = hostCommentCache.get(`${item.id}::${tasteFingerprint}`);
    if (cached) {
      out.set(item.id, cached);
    } else {
      uncached.push(item);
    }
  }

  if (uncached.length === 0) return out;

  const ai = getGeminiClient();
  if (!ai) return out;

  try {
    const genreLabels = tasteContext.likedGenres
      .map((g) => TMDB_GENRE_NAMES_ES[g])
      .filter(Boolean)
      .slice(0, 5);

    const payload = uncached.map((it) => ({
      id: it.id,
      title: it.title,
      type: it.mediaType === 'tv' ? 'serie' : 'pelicula',
      year: it.year,
      rating: it.rating,
      genres: it.genres,
      seedMatch: it.seedMatchTitle || '',
      clipKinds: it.clips.map((c) => `${c.kind}:${c.title}`).slice(0, 2),
      overview: it.overview.slice(0, 220),
    }));

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents:
        `Eres el presentador carismático de un feed vertical tipo TikTok de cine y series en español (tono cercano, directo, cinéfilo, cero spoilers). ` +
        `Gustos actuales del usuario -> Pelis/series que le gustaron: ${JSON.stringify(
          tasteContext.likedTitles.slice(0, 6)
        )}; Géneros favoritos: ${JSON.stringify(genreLabels)}; Mood actual: "${tasteContext.mood}".\n` +
        `Para cada título de la lista, genera comentarios cortos que atrapen en los primeros 3 segundos:\n` +
        `- hook: frase conversacional hablada de max 22 palabras ("Si te gustó X, quédate a ver este plano de Y...").\n` +
        `- whyForYou: motivo claro en 5-9 palabras ("Por tu gusto por el thriller psicológico").\n` +
        `- proMoment: qué hace épico al tráiler o escena sin hacer spoiler (max 18 palabras).\n` +
        `- moodLabel: 2 palabras separadas por punto medio (ej. "Tensión · Sci-Fi").\n` +
        `Títulos: ${JSON.stringify(payload)}`,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              hook: { type: Type.STRING },
              whyForYou: { type: Type.STRING },
              proMoment: { type: Type.STRING },
              moodLabel: { type: Type.STRING },
            },
            required: ['id', 'hook', 'whyForYou', 'proMoment', 'moodLabel'],
          },
        },
      },
    });

    const parsed = JSON.parse((response.text ?? '[]').trim()) as Array<{
      id?: string;
      hook?: string;
      whyForYou?: string;
      proMoment?: string;
      moodLabel?: string;
    }>;

    if (Array.isArray(parsed)) {
      for (const entry of parsed) {
        if (!entry?.id || !entry?.hook) continue;
        const comment: ReelHostComment = {
          hook: String(entry.hook).trim(),
          whyForYou: String(entry.whyForYou || '').trim(),
          proMoment: String(entry.proMoment || '').trim(),
          moodLabel: String(entry.moodLabel || '').trim(),
          aiGenerated: true,
        };
        out.set(entry.id, comment);
        hostCommentCache.set(`${entry.id}::${tasteFingerprint}`, comment);
      }
    }
  } catch (err) {
    logger.warn({ err }, 'movie_reels_gemini_host_fallback');
  }

  return out;
}

export async function buildAdaptiveMovieReelsFeed(req: ReelsFeedRequest): Promise<{
  reels: MovieReelItem[];
  aiHostActive: boolean;
}> {
  const mood: ReelsMoodFilter = req.mood || 'para_ti';
  const contentMode: ReelsContentMode = req.contentMode || 'all';
  const limit = Math.max(4, Math.min(10, Number(req.limit || 5)));

  const likedIds = new Set((req.likedIds || []).map((s) => String(s)));
  const dislikedIds = new Set((req.dislikedIds || []).map((s) => String(s)));
  const seenIds = new Set((req.seenIds || []).map((s) => String(s)));
  const likedGenres = Array.isArray(req.likedGenres) ? req.likedGenres : [];
  const dislikedGenres = new Set(Array.isArray(req.dislikedGenres) ? req.dislikedGenres : []);
  const likedTitles = Array.isArray(req.likedTitles) ? req.likedTitles : [];
  const seedItems = Array.isArray(req.seedItems) ? req.seedItems.slice(0, 3) : [];

  const isCacheableColdFeed =
    seenIds.size === 0 &&
    dislikedIds.size === 0 &&
    likedIds.size === 0 &&
    seedItems.length === 0 &&
    likedGenres.length === 0;
  const cacheKey = isCacheableColdFeed ? `${mood}:${contentMode}:${limit}` : '';
  if (cacheKey) {
    const hit = feedResponseCache.get(cacheKey);
    if (hit && hit.reels.length > 0) {
      return hit;
    }
  }

  const tmdbQueries: Array<{
    endpoint: string;
    params: Record<string, string>;
    forcedType?: 'movie' | 'tv';
    seedMatchTitle?: string;
  }> = [];

  if (mood === 'para_ti') {
    for (const seed of seedItems) {
      if (seed?.tmdbId > 0) {
        const mt = seed.mediaType === 'tv' ? 'tv' : 'movie';
        tmdbQueries.push({
          endpoint: `/${mt}/${seed.tmdbId}/recommendations`,
          params: { language: 'es-ES', page: '1' },
          forcedType: mt,
          seedMatchTitle: seed.title,
        });
      }
    }
    if (likedGenres.length > 0) {
      const topGenres = likedGenres.slice(0, 2).join('|');
      const randomPage = String(1 + (seenIds.size % 3));
      tmdbQueries.push({
        endpoint: '/discover/movie',
        params: {
          language: 'es-ES',
          sort_by: 'popularity.desc',
          with_genres: topGenres,
          'vote_count.gte': '350',
          page: randomPage,
        },
        forcedType: 'movie',
      });
      tmdbQueries.push({
        endpoint: '/discover/tv',
        params: {
          language: 'es-ES',
          sort_by: 'popularity.desc',
          with_genres: topGenres,
          'vote_count.gte': '200',
          page: '1',
        },
        forcedType: 'tv',
      });
    }
    const trendPage = String(1 + Math.floor(seenIds.size / 8));
    tmdbQueries.push({
      endpoint: '/trending/all/week',
      params: { language: 'es-ES', page: trendPage },
    });
  } else if (mood === 'estrenos') {
    tmdbQueries.push(
      {
        endpoint: '/movie/now_playing',
        params: { language: 'es-ES', region: 'ES', page: '1' },
        forcedType: 'movie',
      },
      {
        endpoint: '/tv/on_the_air',
        params: { language: 'es-ES', page: '1' },
        forcedType: 'tv',
      }
    );
  } else if (mood === 'series') {
    const moodCfg = MOOD_GENRE_MAP.series;
    tmdbQueries.push(
      {
        endpoint: '/trending/tv/week',
        params: { language: 'es-ES', page: String(1 + Math.floor(seenIds.size / 10)) },
        forcedType: 'tv',
      },
      {
        endpoint: '/discover/tv',
        params: {
          language: 'es-ES',
          sort_by: 'vote_average.desc',
          with_genres: moodCfg.tvGenres || '18',
          'vote_count.gte': '350',
          page: '1',
        },
        forcedType: 'tv',
      }
    );
  } else {
    const cfg = MOOD_GENRE_MAP[mood];
    const page = String(1 + (seenIds.size % 4));
    if (cfg.movieGenres) {
      tmdbQueries.push({
        endpoint: '/discover/movie',
        params: {
          language: 'es-ES',
          sort_by: 'popularity.desc',
          with_genres: cfg.movieGenres,
          'vote_count.gte': '400',
          page,
        },
        forcedType: 'movie',
      });
    }
    if (cfg.tvGenres) {
      tmdbQueries.push({
        endpoint: '/discover/tv',
        params: {
          language: 'es-ES',
          sort_by: 'popularity.desc',
          with_genres: cfg.tvGenres,
          'vote_count.gte': '200',
          page: '1',
        },
        forcedType: 'tv',
      });
    }
  }

  const rawPayloads = await Promise.all(
    tmdbQueries.map(async (q) => ({
      q,
      data: await fetchTmdbJson<{ results?: Array<Record<string, unknown>> }>(
        q.endpoint,
        q.params,
        8 * 60 * 1000
      ).catch(() => null),
    }))
  );

  interface ScoredCandidate {
    id: string;
    tmdbId: number;
    mediaType: 'movie' | 'tv';
    title: string;
    originalTitle?: string;
    year: string;
    rating: string;
    genres: string[];
    genreIds: number[];
    overview: string;
    poster: string;
    backdrop: string;
    seedMatchTitle?: string;
    score: number;
  }

  const candidateMap = new Map<string, ScoredCandidate>();
  for (const { q, data } of rawPayloads) {
    const rows = Array.isArray(data?.results) ? data.results : [];
    for (let idx = 0; idx < rows.length; idx++) {
      const r = rows[idx];
      const mt: 'movie' | 'tv' =
        q.forcedType || (r.media_type === 'tv' || (!r.title && Boolean(r.name)) ? 'tv' : 'movie');
      if (String(r.media_type || '') === 'person') continue;
      const tmdbId = Number(r.id || 0);
      if (!tmdbId) continue;
      const id = `${mt}-${tmdbId}`;
      if (dislikedIds.has(id) || seenIds.has(id) || likedIds.has(id)) continue;

      const poster = buildTmdbImageUrl(String(r.poster_path || ''), 'w500');
      const backdrop = buildTmdbImageUrl(String(r.backdrop_path || ''), 'w1280');
      if (!poster && !backdrop) continue;

      const gIds = Array.isArray(r.genre_ids)
        ? (r.genre_ids as unknown[]).map((x) => Number(x)).filter((n) => Number.isFinite(n))
        : [];
      const genres = gIds.map((gid) => TMDB_GENRE_NAMES_ES[gid]).filter(Boolean).slice(0, 3);

      let score = 50 - idx;
      if (q.seedMatchTitle) score += 45;
      for (const gid of gIds) {
        const likedRank = likedGenres.indexOf(gid);
        if (likedRank !== -1) score += Math.max(8, 28 - likedRank * 6);
        if (dislikedGenres.has(gid)) score -= 35;
      }
      const voteAvg = Number(r.vote_average || 0);
      if (voteAvg >= 7.5) score += 12;

      const existing = candidateMap.get(id);
      if (!existing || score > existing.score) {
        const title = String(r.title || r.name || 'Título').trim();
        const originalTitle = String(r.original_title || r.original_name || '').trim() || undefined;
        const releaseDate = String(r.release_date || r.first_air_date || '').trim();
        candidateMap.set(id, {
          id,
          tmdbId,
          mediaType: mt,
          title,
          originalTitle,
          year: releaseDate.split('-')[0] || 'HD',
          rating: voteAvg > 0 ? voteAvg.toFixed(1) : '',
          genres: genres.length > 0 ? genres : [mt === 'tv' ? 'Serie' : 'Cine'],
          genreIds: gIds,
          overview: String(r.overview || '').trim(),
          poster: poster || backdrop,
          backdrop: backdrop || poster,
          seedMatchTitle: q.seedMatchTitle || existing?.seedMatchTitle,
          score,
        });
      }
    }
  }

  const rankedCandidates = Array.from(candidateMap.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.min(limit + 1, 7));

  const enrichedWithClips = await Promise.all(
    rankedCandidates.map(async (cand) => {
      const media = await enrichReelClipsAndLogo({
        tmdbId: cand.tmdbId,
        mediaType: cand.mediaType,
        title: cand.title,
        originalTitle: cand.originalTitle,
        year: cand.year,
      });
      return { cand, media };
    })
  );

  const playable = enrichedWithClips
    .filter(({ media }) => media.clips.length > 0)
    .slice(0, limit);

  const geminiPromise = enrichBatchWithGeminiHost(
    playable.map(({ cand, media }) => ({
      id: cand.id,
      title: cand.title,
      mediaType: cand.mediaType,
      genres: cand.genres,
      overview: cand.overview,
      year: cand.year,
      rating: cand.rating,
      seedMatchTitle: cand.seedMatchTitle,
      clips: media.clips,
    })),
    { likedTitles, likedGenres, mood }
  );

  const geminiComments = await Promise.race([
    geminiPromise,
    new Promise<Map<string, ReelHostComment>>((resolve) =>
      setTimeout(() => resolve(new Map()), 1500)
    ),
  ]);

  const reels: MovieReelItem[] = playable.map(({ cand, media }, idx) => {
    const clips = [...media.clips];
    let defaultClipIndex = 0;
    const firstSceneIdx = clips.findIndex((c) => c.kind === 'pro_scene');
    const firstTrailerIdx = clips.findIndex((c) => c.kind === 'trailer');

    if (contentMode === 'scenes' && firstSceneIdx !== -1) {
      defaultClipIndex = firstSceneIdx;
    } else if (contentMode === 'trailers' && firstTrailerIdx !== -1) {
      defaultClipIndex = firstTrailerIdx;
    } else if (contentMode === 'all' && firstSceneIdx !== -1 && idx % 2 === 1) {
      // Alternate official trailers and extracted pro scenes naturally across the feed
      defaultClipIndex = firstSceneIdx;
    }

    const aiComment = geminiComments.get(cand.id);
    const hostComment =
      aiComment ||
      buildFallbackHostComment(
        {
          title: cand.title,
          mediaType: cand.mediaType,
          genres: cand.genres,
          overview: cand.overview,
          year: cand.year,
          rating: cand.rating,
          seedMatchTitle: cand.seedMatchTitle,
          hasProScene: firstSceneIdx !== -1,
        },
        likedTitles
      );

    return {
      id: cand.id,
      tmdbId: cand.tmdbId,
      mediaType: cand.mediaType,
      title: cand.title,
      originalTitle: cand.originalTitle,
      year: cand.year,
      rating: cand.rating,
      genres: cand.genres,
      genreIds: cand.genreIds,
      overview: cand.overview,
      poster: cand.poster,
      backdrop: cand.backdrop,
      logoUrl: media.logoUrl,
      clips,
      defaultClipIndex,
      hostComment,
      recommendationReason:
        hostComment.whyForYou ||
        (cand.seedMatchTitle
          ? `Porque te gustó ${cand.seedMatchTitle}`
          : `Para ti · ${cand.genres[0]}`),
      seedMatchTitle: cand.seedMatchTitle,
    };
  });

  const payload = {
    reels,
    aiHostActive: Boolean(process.env.GEMINI_API_KEY?.trim()) && geminiComments.size > 0,
  };
  if (cacheKey && payload.reels.length > 0) {
    feedResponseCache.set(cacheKey, payload);
  }
  return payload;
}

export async function prewarmMovieReels(): Promise<void> {
  await Promise.allSettled([
    buildAdaptiveMovieReelsFeed({ mood: 'para_ti', contentMode: 'all', limit: 4 }),
    buildAdaptiveMovieReelsFeed({ mood: 'para_ti', contentMode: 'all', limit: 5 }),
  ]);
}

export async function generateReelHostDeepDive(params: {
  title: string;
  mediaType: 'movie' | 'tv';
  year?: string;
  genres?: string[];
  overview?: string;
  question?: string;
  likedTitles?: string[];
}): Promise<{ reply: string; aiGenerated: boolean }> {
  const ai = getGeminiClient();
  const promptQ =
    String(params.question || '').trim() || 'Cuéntame por qué merece la pena sin spoilers.';

  if (!ai) {
    return {
      reply: `${params.title} (${params.year || 'HD'}) destaca en ${
        params.genres?.slice(0, 2).join(' y ') || 'su género'
      }. ${params.overview ? params.overview.slice(0, 170) : 'Muy buena opción para ver del tirón.'}`,
      aiGenerated: false,
    };
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents:
        `Eres el presentador cinéfilo de RiffanTV. Responde en español en máximo 2 frases con gancho y ZERO spoilers.\n` +
        `Título: ${params.title} (${params.mediaType === 'tv' ? 'Serie' : 'Película'}, ${params.year || ''})\n` +
        `Géneros: ${(params.genres || []).join(', ')}\n` +
        `Sinopsis: ${(params.overview || '').slice(0, 240)}\n` +
        `Gustos del usuario: ${(params.likedTitles || []).slice(0, 5).join(', ')}\n` +
        `Pregunta: ${promptQ}`,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    });
    const text = String(response.text || '').trim();
    if (text) {
      return { reply: text, aiGenerated: true };
    }
  } catch (err) {
    logger.warn({ err }, 'movie_reels_deep_dive_error');
  }

  return {
    reply: `${params.title} combina ${
      params.genres?.slice(0, 2).join(' y ') || 'gran ritmo'
    } con escenas pensadas para engancharte desde el minuto uno.`,
    aiGenerated: false,
  };
}

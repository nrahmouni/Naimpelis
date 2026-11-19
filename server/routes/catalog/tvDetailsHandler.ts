import type express from 'express';
import { LruTtlCache } from '../../utils/lruCache.ts';
import { fetchTmdbJson } from '../../services/tmdbService.ts';

export const tvDetailsFastCache = new LruTtlCache<string, { details: any; ts: number }>(
  350,
  20 * 60 * 1000
);
export const tvLangProbeCache = new LruTtlCache<
  string,
  { availableLanguages: ('ES' | 'LAT' | 'VOSE' | 'EN')[]; ts: number }
>(400, 30 * 60 * 1000);

export function filterTmdbValidSeasons(
  rawSeasons: any[],
  opts?: { lastAiredSeason?: number; nextAirSeason?: number; todayMs?: number }
): any[] {
  const todayMs = opts?.todayMs ?? Date.now();
  const lastAiredSeason = Number(opts?.lastAiredSeason || 0);
  const nextAirSeason = Number(opts?.nextAirSeason || 0);
  return (Array.isArray(rawSeasons) ? rawSeasons : [])
    .filter((s: any) => {
      if (!s || typeof s.season_number !== 'number' || s.season_number < 1) return false;
      if (Number(s.episode_count) <= 0 && s.season_number !== 1) return false;
      // Filter distant future placeholder seasons (e.g., TMDB Season 18 air_date 2027-11-16)
      if (
        s.season_number > 1 &&
        typeof s.air_date === 'string' &&
        /^\d{4}-\d{2}-\d{2}$/.test(s.air_date)
      ) {
        const airMs = new Date(`${s.air_date}T00:00:00Z`).getTime();
        const isDistantFuture = airMs - todayMs > 45 * 24 * 60 * 60 * 1000;
        if (isDistantFuture && s.season_number > lastAiredSeason && s.season_number !== nextAirSeason) {
          return false;
        }
      }
      return true;
    })
    .sort((a: any, b: any) => a.season_number - b.season_number);
}

export async function fetchTvSeriesDetailsPayload(opts: {
  cleanId: string;
  season?: number;
  lang?: string;
  force?: boolean;
}): Promise<any | null> {
  const cleanId = String(opts.cleanId || '').replace(/\D/g, '');
  if (!cleanId) return null;

  const requestedSeason = Math.max(1, Number(opts.season) || 1);
  const isEn = String(opts.lang || 'es').toLowerCase() === 'en';
  const force = Boolean(opts.force);
  const langParam = isEn ? 'en-US' : 'es-ES';
  const cacheKey = `${cleanId}:${requestedSeason}:${langParam}`;

  const cached = !force ? tvDetailsFastCache.get(cacheKey) : undefined;
  if (cached && Date.now() - cached.ts < 15 * 60 * 1000) {
    const cachedLangs = tvLangProbeCache.get(`v2|${cleanId}:${cached.details.activeSeason}:1`);
    return {
      ...cached.details,
      ...(cachedLangs ? { availableLanguages: cachedLangs.availableLanguages } : {}),
    };
  }

  const showJson = await fetchTmdbJson<any>(
    `/tv/${cleanId}`,
    { language: langParam },
    15 * 60 * 1000
  ).catch(() => null);

  if (!showJson) return null;

    const baseSeasons = filterTmdbValidSeasons(showJson?.seasons, {
      lastAiredSeason: Number(showJson?.last_episode_to_air?.season_number || 0),
      nextAirSeason: Number(showJson?.next_episode_to_air?.season_number || 0),
    })
      .map((s: any) => ({
        seasonNumber: s.season_number,
        name:
          s.name && !/^season\s+\d+$/i.test(s.name)
            ? s.name
            : isEn
            ? `Season ${s.season_number}`
            : `Temporada ${s.season_number}`,
        episodeCount: Number(s.episode_count) || 0,
        poster: s.poster_path ? `https://image.tmdb.org/t/p/w342${s.poster_path}` : '',
      }));

    const isJjkSplit =
      cleanId === '95479' &&
      baseSeasons.length === 1 &&
      (baseSeasons[0]?.episodeCount || 0) >= 48;

    const hasFromS4Already = baseSeasons.some((s: any) => s.seasonNumber === 4);

    let seasons = baseSeasons;
    if (isJjkSplit) {
      const basePoster = baseSeasons[0]?.poster || '';
      seasons = [
        {
          seasonNumber: 1,
          name: isEn ? 'Season 1' : 'Temporada 1',
          episodeCount: 24,
          poster: basePoster,
        },
        {
          seasonNumber: 2,
          name: isEn ? 'Season 2 · Shibuya Incident' : 'Temporada 2 · Shibuya',
          episodeCount: 23,
          poster: basePoster,
        },
        {
          seasonNumber: 3,
          name: isEn ? 'Season 3 · The Culling Game' : 'Temporada 3 · Culling Game',
          episodeCount: Math.max(12, (baseSeasons[0]?.episodeCount || 59) - 47),
          poster: basePoster,
        },
      ];
    } else if (cleanId === '124364' && !hasFromS4Already) {
      seasons = [
        ...baseSeasons,
        {
          seasonNumber: 4,
          name: isEn ? 'Season 4 (New)' : 'Temporada 4 (Nueva)',
          episodeCount: 10,
          poster: baseSeasons[baseSeasons.length - 1]?.poster || '',
        },
      ];
    }

    const effectiveSeason =
      seasons.length > 0 && !seasons.some((s: any) => s.seasonNumber === requestedSeason)
        ? seasons[0].seasonNumber
        : requestedSeason;

    const tmdbSeasonToFetch = isJjkSplit ? 1 : effectiveSeason;

    const seasonRequests: Promise<any>[] = [
      fetchTmdbJson<any>(
        `/tv/${cleanId}/season/${tmdbSeasonToFetch}`,
        { language: langParam },
        15 * 60 * 1000
      ).catch(() => null),
    ];
    if (!isEn) {
      seasonRequests.push(
        fetchTmdbJson<any>(
          `/tv/${cleanId}/season/${tmdbSeasonToFetch}`,
          { language: 'en-US' },
          15 * 60 * 1000
        ).catch(() => null)
      );
    }

    const [seasonJsonRaw, seasonEnJsonRaw] = await Promise.all(seasonRequests);
    const seasonJson: any = seasonJsonRaw || { episodes: [] };
    const seasonEnJson: any = seasonEnJsonRaw || { episodes: [] };

    const enEpisodesByNum = new Map<number, any>();
    if (Array.isArray(seasonEnJson?.episodes)) {
      for (const epEn of seasonEnJson.episodes) {
        if (epEn && typeof epEn.episode_number === 'number') {
          enEpisodesByNum.set(epEn.episode_number, epEn);
        }
      }
    }

    const rawEpisodes =
      Array.isArray(seasonJson?.episodes) && seasonJson.episodes.length > 0
        ? seasonJson.episodes
        : Array.isArray(seasonEnJson?.episodes)
        ? seasonEnJson.episodes
        : [];

    let episodes = rawEpisodes
      .filter((ep: any) => ep && typeof ep.episode_number === 'number' && ep.episode_number >= 1)
      .sort((a: any, b: any) => a.episode_number - b.episode_number)
      .filter((ep: any) => {
        if (!isJjkSplit) return true;
        if (effectiveSeason === 1) return ep.episode_number >= 1 && ep.episode_number <= 24;
        if (effectiveSeason === 2) return ep.episode_number >= 25 && ep.episode_number <= 47;
        return ep.episode_number >= 48;
      })
      .map((ep: any) => {
        const origEpNum = ep.episode_number;
        const epNum = isJjkSplit
          ? effectiveSeason === 2
            ? origEpNum - 24
            : effectiveSeason === 3
            ? origEpNum - 47
            : origEpNum
          : origEpNum;
        const enFallback = enEpisodesByNum.get(origEpNum);
        const rawName = String(ep.name || '').trim();
        const isGenericEsName =
          !rawName || /^(episodio|episode|cap[ií]tulo)\s*\d+$/i.test(rawName);
        const enName = String(enFallback?.name || '').trim();
        const finalTitle =
          !isGenericEsName
            ? rawName
            : enName && !/^(episode|episodio)\s*\d+$/i.test(enName)
            ? enName
            : isEn
            ? `Episode ${epNum}`
            : `Capítulo ${epNum}`;
        const stillPath = ep.still_path || enFallback?.still_path || '';

        return {
          id: `ep-${cleanId}-${effectiveSeason}-${epNum}`,
          episodeNumber: epNum,
          seasonNumber: effectiveSeason,
          title: finalTitle,
          overview: ep.overview || enFallback?.overview || '',
          still: stillPath ? `https://image.tmdb.org/t/p/w500${stillPath}` : '',
          runtime: ep.runtime || enFallback?.runtime || undefined,
          airDate: ep.air_date || enFallback?.air_date || undefined,
          rating: ep.vote_average ? Number(ep.vote_average).toFixed(1) : undefined,
        };
      });

    if (isJjkSplit && effectiveSeason === 3 && episodes.length < 12) {
      const existingNums = new Set(episodes.map((e: any) => e.episodeNumber));
      for (let idx = 1; idx <= 12; idx++) {
        if (!existingNums.has(idx)) {
          episodes.push({
            id: `ep-${cleanId}-3-${idx}`,
            episodeNumber: idx,
            seasonNumber: 3,
            title: isEn ? `Episode ${idx}` : `Capítulo ${idx}`,
            overview: '',
            still: '',
            runtime: 24,
            airDate: '2026',
            rating: undefined,
          });
        }
      }
      episodes.sort((a: any, b: any) => a.episodeNumber - b.episodeNumber);
    }

    const activeSeasonSummary = seasons.find((s: any) => s.seasonNumber === effectiveSeason);
    if (episodes.length === 0 && activeSeasonSummary && activeSeasonSummary.episodeCount > 0) {
      episodes = Array.from({ length: activeSeasonSummary.episodeCount }, (_, idx) => ({
        id: `ep-${cleanId}-${effectiveSeason}-${idx + 1}`,
        episodeNumber: idx + 1,
        seasonNumber: effectiveSeason,
        title: isEn ? `Episode ${idx + 1}` : `Capítulo ${idx + 1}`,
        overview: '',
        still: '',
        runtime: undefined,
        airDate: undefined,
        rating: undefined,
      }));
    }

    const normalizedSeasons =
      seasons.length > 0
        ? seasons.map((s: any) =>
            s.seasonNumber === effectiveSeason && episodes.length > s.episodeCount
              ? { ...s, episodeCount: episodes.length }
              : s
          )
        : [
            {
              seasonNumber: 1,
              name: isEn ? 'Season 1' : 'Temporada 1',
              episodeCount: episodes.length,
            },
          ];

    const showTitle = showJson.name || showJson.original_name || 'Serie';
    const origTitle = showJson.original_name || showJson.name || '';

    const detailsPayload: any = {
      tmdbId: Number(cleanId),
      title: showTitle,
      originalTitle: origTitle,
      year: showJson.first_air_date ? String(showJson.first_air_date).split('-')[0] : 'TV',
      rating: showJson.vote_average ? Number(showJson.vote_average).toFixed(1) : '',
      overview: showJson.overview || '',
      poster: showJson.poster_path ? `https://image.tmdb.org/t/p/w500${showJson.poster_path}` : '',
      backdrop: showJson.backdrop_path
        ? `https://image.tmdb.org/t/p/w1280${showJson.backdrop_path}`
        : '',
      seasons: normalizedSeasons,
      activeSeason: effectiveSeason,
      episodes,
    };

  tvDetailsFastCache.set(cacheKey, { details: detailsPayload, ts: Date.now() });

  const cachedLangs = !force
    ? tvLangProbeCache.get(`v2|${cleanId}:${effectiveSeason}:1`)
    : undefined;
  return {
    ...detailsPayload,
    ...(cachedLangs ? { availableLanguages: cachedLangs.availableLanguages } : {}),
  };
}

export async function handleTvDetailsRequest(req: express.Request, res: express.Response) {
  try {
    const cleanId = String(req.params.tmdbId || '').replace(/\D/g, '');
    if (!cleanId) return res.status(400).json({ success: false });

    const requestedSeason = Math.max(1, parseInt(String(req.query.season || '1'), 10) || 1);
    const lang = String(req.query.lang || 'es').toLowerCase() === 'en' ? 'en' : 'es';
    const force = String(req.query.force || req.query.forceSpanish || '') === '1';

    const details = await fetchTvSeriesDetailsPayload({
      cleanId,
      season: requestedSeason,
      lang,
      force,
    });
    if (!details) return res.status(404).json({ success: false });

    return res.json({ success: true, details });
  } catch (err) {
    console.error('TV details error:', err);
    return res.status(500).json({ success: false });
  }
}

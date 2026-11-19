import type { CatalogMovie } from '../../../src/types.ts';
import {
  buildTmdbImageUrl,
  fetchTmdbJson,
  resolveTmdbLanguageTag,
} from '../../services/tmdbService.ts';
import {
  fetchFotmobDayIndex,
  getMadridDateKey,
} from '../../services/footballLiveService.ts';
import type { ParsedVoiceIntent, TmdbDiscoverResult } from './types.ts';
import { normalizeSearchStr } from './parsers.ts';

export function toCatalogMovieItem(r: TmdbDiscoverResult, fallbackMediaType: 'movie' | 'tv'): CatalogMovie {
  const isTv = (r.media_type || fallbackMediaType) === 'tv';
  const title = (r.title || r.name || r.original_title || r.original_name || 'Sin título').trim();
  const year = (r.release_date || r.first_air_date || '').slice(0, 4);
  const poster = buildTmdbImageUrl(r.poster_path, 'w500') || '';
  const backdrop = buildTmdbImageUrl(r.backdrop_path, 'w780') || '';
  const rating = r.vote_average ? r.vote_average.toFixed(1) : '7.0';

  return {
    id: `tmdb-${isTv ? 'tv' : 'movie'}-${r.id}`,
    title,
    originalTitle: r.original_title || r.original_name || title,
    year,
    rating,
    overview: r.overview || '',
    poster,
    backdrop,
    languages: ['ES', 'LAT', 'VOSE', 'EN'],
    mediaType: isTv ? 'tv' : 'movie',
    tmdbId: r.id,
  };
}

export function formatDateYmd(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function scoreTmdbTitleCandidate(r: TmdbDiscoverResult, cleanSearch: string): number {
  const target = normalizeSearchStr(cleanSearch);
  const loc = normalizeSearchStr(r.title || r.name || '');
  const orig = normalizeSearchStr(r.original_title || r.original_name || '');
  let score = 0;

  if (loc === target || orig === target) score += 500;
  else if (loc.startsWith(target) || orig.startsWith(target)) score += 220;
  else if (loc.includes(target) || orig.includes(target)) score += 130;
  else {
    const tokens = target.split(' ').filter((w) => w.length >= 2);
    const hay = `${loc} ${orig}`;
    const hits = tokens.filter((t) => hay.includes(t)).length;
    if (tokens.length > 0) score += (hits / tokens.length) * 110;
  }

  const votes = Number(r.vote_count || 0);
  const pop = Number(r.popularity || 0);
  const avg = Number(r.vote_average || 0);
  score += Math.min(200, pop * 1.4) + Math.min(120, Math.log10(Math.max(1, votes)) * 35);
  if (votes >= 50) score += avg * 2.5;
  return score;
}

export async function searchTmdbPersonCredits(params: {
  personName: string;
  role?: 'director' | 'actor' | 'any';
  mediaType?: 'movie' | 'tv' | 'multi';
  lang?: string;
  limit?: number;
}): Promise<CatalogMovie[]> {
  const cleanPerson = params.personName.trim();
  if (cleanPerson.length < 2) return [];
  const tmdbLang = resolveTmdbLanguageTag(params.lang || 'es');
  const limit = Math.max(1, Math.min(10, params.limit || 8));

  const [esPersonRes, enPersonRes] = await Promise.all([
    fetchTmdbJson<{
      results?: Array<{ id: number; name: string; popularity?: number; known_for_department?: string }>;
    }>('/search/person', { query: cleanPerson, language: tmdbLang, page: 1 }).catch(() => null),
    tmdbLang === 'en-US'
      ? Promise.resolve(null)
      : fetchTmdbJson<{
          results?: Array<{ id: number; name: string; popularity?: number; known_for_department?: string }>;
        }>('/search/person', { query: cleanPerson, language: 'en-US', page: 1 }).catch(() => null),
  ]);

  const combinedPeople = [...(esPersonRes?.results || []), ...(enPersonRes?.results || [])];
  if (combinedPeople.length === 0) return [];

  const targetNorm = normalizeSearchStr(cleanPerson);
  combinedPeople.sort((a, b) => {
    const aExact = normalizeSearchStr(a.name) === targetNorm ? 1000 : 0;
    const bExact = normalizeSearchStr(b.name) === targetNorm ? 1000 : 0;
    return bExact + (b.popularity || 0) - (aExact + (a.popularity || 0));
  });

  const person = combinedPeople[0];
  if (!person?.id) return [];

  const creditEndpoint =
    params.mediaType === 'tv' ? `/person/${person.id}/tv_credits` : `/person/${person.id}/movie_credits`;
  const creditsRes = await fetchTmdbJson<{
    cast?: Array<TmdbDiscoverResult & { character?: string }>;
    crew?: Array<TmdbDiscoverResult & { job?: string; department?: string }>;
  }>(creditEndpoint, { language: tmdbLang }).catch(() => null);

  const directed = (creditsRes?.crew || []).filter(
    (c) => c.job === 'Director' || (params.mediaType === 'tv' && c.department === 'Directing')
  );
  const starred = (creditsRes?.cast || []).filter(
    (c) => !/^(self|himself|herself|archive footage)/i.test(String(c.character || ''))
  );

  let rawPool: TmdbDiscoverResult[] = [];
  if (params.role === 'director') {
    rawPool = directed.length > 0 ? directed : starred;
  } else if (params.role === 'actor') {
    rawPool = starred.length > 0 ? starred : directed;
  } else if (person.known_for_department === 'Directing' && directed.length >= 2) {
    rawPool = directed;
  } else {
    rawPool = starred.length >= 3 ? starred : [...directed, ...starred];
  }

  const dedup = new Map<number, TmdbDiscoverResult>();
  for (const item of rawPool) {
    if (!item?.id || (!item.poster_path && !item.backdrop_path)) continue;
    // Exclude minor documentaries unless few titles exist
    const existing = dedup.get(item.id);
    if (!existing || (item.popularity || 0) > (existing.popularity || 0)) {
      dedup.set(item.id, item);
    }
  }

  const allUnique = Array.from(dedup.values());
  const nonDoc = allUnique.filter((m) => !(m.genre_ids || []).includes(99) || (m.vote_count || 0) >= 200);
  const poolToSort = nonDoc.length >= Math.min(4, limit) ? nonDoc : allUnique;

  const rankItem = (m: TmdbDiscoverResult) => {
    const votes = Number(m.vote_count || 0);
    const pop = Number(m.popularity || 0);
    const avg = Number(m.vote_average || 0);
    const voteBonus = Math.log10(Math.max(1, votes)) * 22;
    const lowVotePenalty = votes < 15 ? -35 : 0;
    return pop * 2.0 + voteBonus + avg * 1.8 + lowVotePenalty;
  };

  poolToSort.sort((a, b) => rankItem(b) - rankItem(a));

  const fallbackType: 'movie' | 'tv' = params.mediaType === 'tv' ? 'tv' : 'movie';
  return poolToSort.slice(0, limit).map((r) => toCatalogMovieItem(r, fallbackType));
}

export async function searchTmdbTitlesRanked(params: {
  titleSearch: string;
  mediaType?: 'movie' | 'tv' | 'multi';
  lang?: string;
  limit?: number;
}): Promise<CatalogMovie[]> {
  const cleanSearch = params.titleSearch.trim();
  if (cleanSearch.length < 2) return [];

  const tmdbLang = resolveTmdbLanguageTag(params.lang || 'es');
  const limit = Math.max(1, Math.min(8, params.limit || 5));
  const searchEndpoint =
    params.mediaType === 'tv'
      ? '/search/tv'
      : params.mediaType === 'movie'
      ? '/search/movie'
      : '/search/multi';

  const [primaryRes, enRes] = await Promise.all([
    fetchTmdbJson<{ results?: TmdbDiscoverResult[] }>(searchEndpoint, {
      query: cleanSearch,
      language: tmdbLang,
      include_adult: false,
      page: 1,
    }).catch(() => null),
    tmdbLang === 'en-US'
      ? Promise.resolve(null)
      : fetchTmdbJson<{ results?: TmdbDiscoverResult[] }>(searchEndpoint, {
          query: cleanSearch,
          language: 'en-US',
          include_adult: false,
          page: 1,
        }).catch(() => null),
  ]);

  const byKey = new Map<string, { raw: TmdbDiscoverResult; score: number }>();
  const ingest = (list?: TmdbDiscoverResult[], preferPrimary = false) => {
    for (const r of list || []) {
      if (!r?.id || r.media_type === 'person' || (!r.poster_path && !r.backdrop_path)) continue;
      const mType = r.media_type || (params.mediaType === 'tv' ? 'tv' : 'movie');
      const key = `${mType}:${r.id}`;
      const score = scoreTmdbTitleCandidate(r, cleanSearch) + (preferPrimary ? 15 : 0);
      const prev = byKey.get(key);
      if (!prev || score > prev.score) {
        byKey.set(key, { raw: r, score });
      }
    }
  };

  ingest(primaryRes?.results, true);
  ingest(enRes?.results, false);

  if (byKey.size === 0 && searchEndpoint !== '/search/multi') {
    const multiRes = await fetchTmdbJson<{ results?: TmdbDiscoverResult[] }>('/search/multi', {
      query: cleanSearch,
      language: tmdbLang,
      include_adult: false,
      page: 1,
    }).catch(() => null);
    ingest(multiRes?.results, true);
  }

  const ranked = Array.from(byKey.values()).sort((a, b) => b.score - a.score);
  return ranked
    .slice(0, limit)
    .map((entry) => toCatalogMovieItem(entry.raw, params.mediaType === 'tv' ? 'tv' : 'movie'));
}

export async function resolveTmdbRecommendations(
  tq: ParsedVoiceIntent['tmdbQuery'],
  lang: string
): Promise<CatalogMovie[]> {
  const tmdbLang = resolveTmdbLanguageTag(lang);
  const limit = Math.max(1, Math.min(8, tq.limit || 4));

  if (tq.personSearch && tq.personSearch.trim().length >= 2) {
    const personCredits = await searchTmdbPersonCredits({
      personName: tq.personSearch,
      role: tq.personRole || 'any',
      mediaType: tq.mediaType,
      lang,
      limit,
    });
    if (personCredits.length > 0) {
      return personCredits;
    }
  }

  if (tq.titleSearch && tq.titleSearch.trim().length >= 2) {
    const rankedMatches = await searchTmdbTitlesRanked({
      titleSearch: tq.titleSearch,
      mediaType: tq.mediaType,
      lang,
      limit,
    });
    if (rankedMatches.length > 0) {
      return rankedMatches;
    }
  }

  const isTv = tq.mediaType === 'tv';
  const endpoint = isTv ? '/discover/tv' : '/discover/movie';
  const now = new Date();
  const dateGteKey = isTv ? 'first_air_date.gte' : 'primary_release_date.gte';
  const dateLteKey = isTv ? 'first_air_date.lte' : 'primary_release_date.lte';

  let sortParam = 'popularity.desc';
  if (tq.sortBy === 'top_rated') sortParam = 'vote_average.desc';
  else if (tq.sortBy === 'newest') sortParam = isTv ? 'first_air_date.desc' : 'primary_release_date.desc';

  const windowsDays =
    tq.timeframe === 'this_month'
      ? [32, 60, 90]
      : tq.timeframe === 'this_year'
      ? [365]
      : [0];

  for (const daysBack of windowsDays) {
    const params: Record<string, string | number | boolean | undefined> = {
      language: tmdbLang,
      include_adult: false,
      sort_by: sortParam,
      'vote_count.gte': tq.timeframe === 'this_month' ? (daysBack <= 40 ? 8 : 15) : 40,
      page: 1,
    };
    if (tq.genreId) {
      params.with_genres = tq.genreId;
    }
    if (daysBack > 0) {
      const start = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);
      params[dateGteKey] = formatDateYmd(start);
      params[dateLteKey] = formatDateYmd(now);
    }

    const res = await fetchTmdbJson<{ results?: TmdbDiscoverResult[] }>(endpoint, params);
    const filtered = (res?.results || []).filter((r) => Boolean(r.poster_path || r.backdrop_path));
    if (filtered.length >= Math.min(limit, 3) || daysBack === windowsDays[windowsDays.length - 1]) {
      return filtered.slice(0, limit).map((r) => toCatalogMovieItem(r, isTv ? 'tv' : 'movie'));
    }
  }

  return [];
}

export async function findUpcomingMatchInFotmob(query: string): Promise<{
  match: {
    homeTeam: string;
    awayTeam: string;
    competition: string;
    kickoffTime: string;
    dayLabel: string;
    homeLogo?: string;
    awayLogo?: string;
  };
  spokenReply: string;
} | null> {
  const norm = normalizeSearchStr(query);
  const teamAliases: Array<{ keys: string[]; canonical: string }> = [
    { keys: ['barca', 'barcelona', 'fc barcelona'], canonical: 'FC Barcelona' },
    { keys: ['madrid', 'real madrid'], canonical: 'Real Madrid' },
    { keys: ['atletico', 'atleti', 'atletico de madrid'], canonical: 'Atlético de Madrid' },
    { keys: ['sevilla'], canonical: 'Sevilla FC' },
    { keys: ['betis', 'real betis'], canonical: 'Real Betis' },
    { keys: ['athletic', 'athletic club', 'bilbao'], canonical: 'Athletic Club' },
    { keys: ['girona'], canonical: 'Girona FC' },
    { keys: ['valencia'], canonical: 'Valencia CF' },
    { keys: ['arsenal'], canonical: 'Arsenal' },
    { keys: ['city', 'manchester city'], canonical: 'Manchester City' },
    { keys: ['liverpool'], canonical: 'Liverpool' },
    { keys: ['psg', 'paris'], canonical: 'PSG' },
    { keys: ['bayern'], canonical: 'Bayern Múnich' },
  ];

  const matchedAlias = teamAliases.find((t) => t.keys.some((k) => norm.includes(k)));
  const searchKey = matchedAlias ? matchedAlias.keys[0] : norm;

  for (let offset = 0; offset <= 6; offset += 1) {
    const dk = getMadridDateKey(offset);
    try {
      const dayMatches = await fetchFotmobDayIndex(dk);
      for (const m of dayMatches) {
        const homeNorm = normalizeSearchStr(m.homeName);
        const awayNorm = normalizeSearchStr(m.awayName);
        if (homeNorm.includes(searchKey) || awayNorm.includes(searchKey)) {
          const isHome = homeNorm.includes(searchKey);
          const teamName = matchedAlias ? matchedAlias.canonical : (isHome ? m.homeName : m.awayName);
          const rivalName = isHome ? m.awayName : m.homeName;
          const spoken = `El ${teamName} juega ${offset === 0 ? 'hoy' : offset === 1 ? 'mañana' : `en los próximos días`} a las ${m.kickoffTime}h contra el ${rivalName} en ${m.leagueName}. Podrás seguirlo en directo en DAZN LaLiga y canales deportivos de RiffanTV.`;

          return {
            match: {
              homeTeam: m.homeName,
              awayTeam: m.awayName,
              competition: m.leagueName,
              kickoffTime: m.kickoffTime,
              dayLabel: offset === 0 ? 'hoy' : offset === 1 ? 'mañana' : 'próximamente',
              homeLogo: `https://images.fotmob.com/image_resources/logo/teamlogo/${m.homeId}.png`,
              awayLogo: `https://images.fotmob.com/image_resources/logo/teamlogo/${m.awayId}.png`,
            },
            spokenReply: spoken,
          };
        }
      }
    } catch {
      // continue
    }
  }

  return null;
}

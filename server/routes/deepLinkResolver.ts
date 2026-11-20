/**
 * @module server/routes/deepLinkResolver
 * @description Universal semantic deep-link resolver & dynamic OpenGraph SSR injector.
 * Handles /pelicula/:slug, /serie/:slug(/tN/eM), /canal/:slug, /dazn, /la-1,
 * /futbol/:scope, /partido/:idOrSlug, /juegos/:game, and world views.
 */
import type express from 'express';
import { LruTtlCache } from '../utils/lruCache.ts';
import { fetchTmdbJson } from '../services/tmdbService.ts';
import {
  mapTmdbGenreLabels,
  rankTmdbSearchResultsForQuery,
} from '../services/tmdbCatalogHelpers.ts';
import { fetchTvSeriesDetailsPayload } from './catalog/tvDetailsHandler.ts';
import { getAllIptvChannels } from './iptvHelpers/iptvChannelRegistry.ts';
import {
  getCachedFootballBoardSnapshot,
  getCachedSportsMatches,
  getFootballBoardMatches,
  getPermanent247SportsMatches,
} from './sports.ts';
import { resolveOfficialChannelLogoUrl } from '../../src/shared/channelLogos.ts';
import {
  buildCanonicalRoute,
  GAME_TITLES,
  isDedicatedAppPath,
  parseAppRoute,
  PUBLIC_PRODUCTION_ORIGIN,
  slugify,
  type FootballScopeConfig,
  type TvPackMapping,
} from '../../src/shared/dedicatedRoutes.ts';

export interface OpenGraphMeta {
  title: string;
  description: string;
  image?: string;
  url: string;
  type?: 'website' | 'video.movie' | 'video.episode' | 'video.other';
}

export interface ResolvedDeepLinkResult {
  found: boolean;
  kind:
    | 'home'
    | 'room'
    | 'system'
    | 'world'
    | 'movie'
    | 'series'
    | 'channel'
    | 'pack'
    | 'footballScope'
    | 'match'
    | 'game';
  route: string;
  movie?: any;
  series?: any;
  requestedSeason?: number;
  requestedEpisode?: number;
  channel?: any;
  pack?: TvPackMapping;
  footballScope?: { scope: string; config: FootballScopeConfig };
  match?: any;
  game?: { gameId: string; gameSlug: string; title: string };
  world?: {
    world: 'cine' | 'futbol' | 'tv' | 'juegos' | 'youtube' | 'clipbox' | 'rbtv' | 'belix' | 'atresplayer' | 'movistardazn';
    cineTab?: 'movies' | 'series';
    cineCategory?: string;
    futbolTab?: 'matches' | 'channels';
  };
  og: OpenGraphMeta;
}

const DEFAULT_OG_META: OpenGraphMeta = {
  title: 'RiffanTV — Cine, Directos y Sala Privada',
  description:
    'RiffanTV (RTV): tu plataforma multiplataforma en directo para ver películas, series, anime, fútbol y TV en solitario o con amigos en tiempo real.',
  url: PUBLIC_PRODUCTION_ORIGIN,
  type: 'website',
};

const deepLinkResolveCache = new LruTtlCache<string, ResolvedDeepLinkResult>(320, 4 * 60 * 1000);

function escapeHtmlAttr(raw: string): string {
  return String(raw || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\r?\n/g, ' ')
    .trim();
}

function truncateDesc(raw: string, maxLen = 195): string {
  const clean = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!clean) return DEFAULT_OG_META.description;
  if (clean.length <= maxLen) return clean;
  return `${clean.slice(0, maxLen - 1).trim()}…`;
}

function queryFromSlug(idOrSlug: string): string {
  return decodeURIComponent(String(idOrSlug || ''))
    .replace(/^\d{1,10}-/, '')
    .replace(/[-_]+/g, ' ')
    .trim();
}

function buildMoviePayload(m: any) {
  return {
    id: `es-all-movie-${m.id}`,
    tmdbId: m.id,
    mediaType: 'movie' as const,
    quality: 'HD',
    title: m.title || m.original_title || 'Película',
    originalTitle: m.original_title || m.title || '',
    year: m.release_date ? String(m.release_date).split('-')[0] : 'HD',
    rating: m.vote_average ? Number(m.vote_average).toFixed(1) : '',
    overview:
      m.overview ||
      'Disponible en reproducción directa HD sin anuncios (Castellano, Latino y VO Inglés 1080p) en RiffanTV.',
    poster: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : '',
    backdrop: m.backdrop_path ? `https://image.tmdb.org/t/p/w1280${m.backdrop_path}` : '',
    bingetrixUrl: `https://bingetrix.sc/watch/${m.id}`,
    languages: ['Castellano', 'Latino', 'VOSE', 'EN'],
    genres: mapTmdbGenreLabels(m, 'es-ES'),
  };
}

async function resolveMovieTarget(
  idOrSlug: string,
  explicitTmdbId: number | undefined,
  origin: string
): Promise<ResolvedDeepLinkResult> {
  let tmdbMovie: any = null;

  if (explicitTmdbId && explicitTmdbId > 0) {
    tmdbMovie = await fetchTmdbJson<any>(
      `/movie/${explicitTmdbId}`,
      { language: 'es-ES' },
      15 * 60 * 1000
    ).catch(() => null);
  }

  if (!tmdbMovie) {
    const q = queryFromSlug(idOrSlug);
    if (q.length >= 2) {
      const searchRes = await fetchTmdbJson<any>(
        '/search/movie',
        { language: 'es-ES', query: q, page: 1, include_adult: false },
        10 * 60 * 1000
      ).catch(() => null);
      let results: any[] = Array.isArray(searchRes?.results) ? searchRes.results : [];
      if (results.length === 0) {
        const enSearch = await fetchTmdbJson<any>(
          '/search/movie',
          { language: 'en-US', query: q, page: 1, include_adult: false },
          10 * 60 * 1000
        ).catch(() => null);
        results = Array.isArray(enSearch?.results) ? enSearch.results : [];
      }
      if (results.length > 0) {
        const ranked = rankTmdbSearchResultsForQuery(results, q, false);
        const top = ranked[0];
        if (top?.id) {
          tmdbMovie =
            (await fetchTmdbJson<any>(
              `/movie/${top.id}`,
              { language: 'es-ES' },
              15 * 60 * 1000
            ).catch(() => null)) || top;
        }
      }
    }
  }

  if (!tmdbMovie?.id) {
    const fallbackRoute = buildCanonicalRoute({ kind: 'movie', id: idOrSlug, title: queryFromSlug(idOrSlug) });
    return {
      found: false,
      kind: 'movie',
      route: fallbackRoute,
      og: {
        ...DEFAULT_OG_META,
        title: `Película en RiffanTV`,
        url: `${origin}${fallbackRoute}`,
      },
    };
  }

  const movie = buildMoviePayload(tmdbMovie);
  const route = buildCanonicalRoute({
    kind: 'movie',
    tmdbId: movie.tmdbId,
    title: movie.title,
  });

  return {
    found: true,
    kind: 'movie',
    route,
    movie,
    og: {
      title: `${movie.title}${movie.year ? ` (${movie.year})` : ''} — Ver en RiffanTV`,
      description: truncateDesc(movie.overview),
      image: movie.backdrop || movie.poster || undefined,
      url: `${origin}${route}`,
      type: 'video.movie',
    },
  };
}

async function resolveSeriesTarget(
  idOrSlug: string,
  explicitTmdbId: number | undefined,
  season: number | undefined,
  episode: number | undefined,
  origin: string
): Promise<ResolvedDeepLinkResult> {
  let targetTmdbId = explicitTmdbId && explicitTmdbId > 0 ? explicitTmdbId : undefined;

  if (!targetTmdbId) {
    const q = queryFromSlug(idOrSlug);
    if (q.length >= 2) {
      const searchEs = await fetchTmdbJson<any>(
        '/search/tv',
        { language: 'es-ES', query: q, page: 1, include_adult: false },
        10 * 60 * 1000
      ).catch(() => null);
      let results: any[] = Array.isArray(searchEs?.results) ? searchEs.results : [];
      if (results.length === 0) {
        const searchEn = await fetchTmdbJson<any>(
          '/search/tv',
          { language: 'en-US', query: q, page: 1, include_adult: false },
          10 * 60 * 1000
        ).catch(() => null);
        results = Array.isArray(searchEn?.results) ? searchEn.results : [];
      }
      if (results.length > 0) {
        const ranked = rankTmdbSearchResultsForQuery(results, q, true);
        if (ranked[0]?.id) {
          targetTmdbId = Number(ranked[0].id);
        }
      }
    }
  }

  if (!targetTmdbId) {
    const fallbackRoute = buildCanonicalRoute({
      kind: 'series',
      id: idOrSlug,
      title: queryFromSlug(idOrSlug),
      season,
      episode,
    });
    return {
      found: false,
      kind: 'series',
      route: fallbackRoute,
      og: {
        ...DEFAULT_OG_META,
        title: `Serie en RiffanTV`,
        url: `${origin}${fallbackRoute}`,
      },
    };
  }

  const targetSeason = season && season > 0 ? season : 1;
  const details = await fetchTvSeriesDetailsPayload({
    cleanId: String(targetTmdbId),
    season: targetSeason,
    lang: 'es',
  });

  if (!details) {
    const fallbackRoute = buildCanonicalRoute({
      kind: 'series',
      tmdbId: targetTmdbId,
      title: queryFromSlug(idOrSlug),
      season,
      episode,
    });
    return {
      found: false,
      kind: 'series',
      route: fallbackRoute,
      og: {
        ...DEFAULT_OG_META,
        title: 'Serie en RiffanTV',
        url: `${origin}${fallbackRoute}`,
      },
    };
  }

  const epItem =
    episode && Array.isArray(details.episodes)
      ? details.episodes.find((ep: any) => Number(ep.episodeNumber) === Number(episode))
      : undefined;

  const route = buildCanonicalRoute({
    kind: 'series',
    tmdbId: Number(details.tmdbId),
    title: details.title,
    season,
    episode,
  });

  const epCode =
    season && episode ? `${season}x${String(episode).padStart(2, '0')}` : season ? `Temporada ${season}` : '';
  const ogTitle = epCode
    ? `${details.title} · ${epCode}${epItem?.title ? ` — ${epItem.title}` : ''} | RiffanTV`
    : `${details.title}${details.year ? ` (${details.year})` : ''} — Serie completa en RiffanTV`;
  const ogDesc = truncateDesc(
    epItem?.overview ||
      details.overview ||
      `Ver ${details.title} por temporadas y episodios en Castellano, Latino y VOSE en RiffanTV.`
  );

  return {
    found: true,
    kind: 'series',
    route,
    series: details,
    requestedSeason: season,
    requestedEpisode: episode,
    og: {
      title: ogTitle,
      description: ogDesc,
      image: epItem?.still || details.backdrop || details.poster || undefined,
      url: `${origin}${route}`,
      type: 'video.episode',
    },
  };
}

function resolveChannelTarget(
  channelSlug: string,
  channelIdAlias: string | undefined,
  origin: string
): ResolvedDeepLinkResult {
  const all = getAllIptvChannels();
  const normSlug = slugify(channelSlug);

  let foundChannel: any = null;
  if (channelIdAlias) {
    foundChannel = all.find((ch) => String(ch.id || '').toLowerCase() === channelIdAlias.toLowerCase());
  }
  if (!foundChannel) {
    foundChannel =
      all.find(
        (ch) =>
          String(ch.id || '').toLowerCase() === normSlug ||
          slugify(String(ch.id || '')) === normSlug
      ) ||
      all.find((ch) => slugify(String(ch.name || '')) === normSlug) ||
      all.find((ch) => {
        const sName = slugify(String(ch.name || ''));
        return sName && normSlug && (sName.includes(normSlug) || normSlug.includes(sName));
      });
  }

  if (!foundChannel) {
    const route = buildCanonicalRoute({ kind: 'channel', id: normSlug, name: channelSlug });
    return {
      found: false,
      kind: 'channel',
      route,
      og: {
        ...DEFAULT_OG_META,
        title: `TV en Directo — RiffanTV`,
        url: `${origin}${route}`,
      },
    };
  }

  const resolvedLogo = resolveOfficialChannelLogoUrl(foundChannel) || foundChannel.logoUrl;
  const enrichedChannel = {
    ...foundChannel,
    ...(resolvedLogo ? { logoUrl: resolvedLogo } : {}),
  };
  const route = buildCanonicalRoute({
    kind: 'channel',
    id: foundChannel.id,
    name: foundChannel.name,
  });

  return {
    found: true,
    kind: 'channel',
    route,
    channel: enrichedChannel,
    og: {
      title: `${foundChannel.name} en Directo — TV Online | RiffanTV`,
      description: truncateDesc(
        foundChannel.description ||
          `Ver ${foundChannel.name} (${foundChannel.network || 'TV en directo HD'}) sin cortes en RiffanTV.`
      ),
      image: resolvedLogo || undefined,
      url: `${origin}${route}`,
      type: 'video.other',
    },
  };
}

async function resolveMatchTarget(
  matchIdOrSlug: string,
  origin: string
): Promise<ResolvedDeepLinkResult> {
  const cleanParam = decodeURIComponent(String(matchIdOrSlug || '')).trim();
  const cleanSlug = slugify(cleanParam);
  const leadingId = cleanParam.match(/^((?:fb-)?[a-z0-9]+)-/i)?.[1] || cleanParam;

  const snap = getCachedFootballBoardSnapshot();
  let boardMatches = Array.isArray(snap?.matches) && snap.matches.length > 0 ? snap.matches : [];
  if (boardMatches.length === 0) {
    const fetched = await getFootballBoardMatches({}).catch(() => ({ matches: [] as any[] }));
    boardMatches = fetched.matches || [];
  }

  const extraMatches = [...getPermanent247SportsMatches(), ...getCachedSportsMatches()];
  const allCandidates = [...boardMatches, ...extraMatches];

  const foundMatch = allCandidates.find((m) => {
    const mId = String(m.id || '').toLowerCase();
    const mEvId = String(m.eventId || '').toLowerCase();
    const mFmId = String(m.fotmobMatchId || '').toLowerCase();
    const rawLow = cleanParam.toLowerCase();
    const leadLow = leadingId.toLowerCase();

    if (
      mId === rawLow ||
      mEvId === rawLow ||
      mFmId === rawLow ||
      mId === `fb-${rawLow}` ||
      mId === leadLow ||
      mEvId === leadLow ||
      mId === `fb-${leadLow}`
    ) {
      return true;
    }

    if (m.homeTeam && m.awayTeam) {
      const vsSlug = slugify(`${m.homeTeam}-vs-${m.awayTeam}`);
      if (vsSlug && (cleanSlug === vsSlug || cleanSlug.endsWith(vsSlug))) {
        return true;
      }
    }
    if (m.title && slugify(String(m.title)) === cleanSlug) {
      return true;
    }
    return false;
  });

  if (!foundMatch) {
    const route = `/partido/${slugify(cleanParam) || 'directo'}`;
    return {
      found: false,
      kind: 'match',
      route,
      og: {
        ...DEFAULT_OG_META,
        title: `Fútbol en Directo — RiffanTV`,
        url: `${origin}${route}`,
      },
    };
  }

  const route = buildCanonicalRoute({
    kind: 'match',
    id: foundMatch.id,
    eventId: foundMatch.eventId,
    homeTeam: foundMatch.homeTeam,
    awayTeam: foundMatch.awayTeam,
  });

  const titleLabel =
    foundMatch.homeTeam && foundMatch.awayTeam
      ? `${foundMatch.homeTeam} vs ${foundMatch.awayTeam}`
      : foundMatch.title || 'Partido en Directo';
  const compLabel = foundMatch.leagueName || foundMatch.competition || 'Fútbol';

  return {
    found: true,
    kind: 'match',
    route,
    match: foundMatch,
    og: {
      title: `${titleLabel} en Directo — ${compLabel} | RiffanTV`,
      description: truncateDesc(
        `${compLabel} · ${foundMatch.kickoffTime || 'EN VIVO'}${
          foundMatch.spanishBroadcaster ? ` · ${foundMatch.spanishBroadcaster}` : ''
        }. Sigue marcador, estadísticas y señal HD en RiffanTV.`
      ),
      image: foundMatch.leagueLogoUrl || foundMatch.homeLogo || undefined,
      url: `${origin}${route}`,
      type: 'video.other',
    },
  };
}

export async function resolveDeepLinkTarget(
  pathOrUrl: string,
  origin = PUBLIC_PRODUCTION_ORIGIN
): Promise<ResolvedDeepLinkResult> {
  let pathname = '/';
  let search = '';
  try {
    const parsedUrl = new URL(pathOrUrl, PUBLIC_PRODUCTION_ORIGIN);
    pathname = parsedUrl.pathname;
    search = parsedUrl.search;
  } catch {
    const parts = String(pathOrUrl || '/').split('?');
    pathname = parts[0] || '/';
    search = parts[1] ? `?${parts[1]}` : '';
  }

  const cleanOrigin = origin.replace(/\/+$/, '');
  const cacheKey = `${cleanOrigin}|${pathname.toLowerCase()}|${search}`;
  const cached = deepLinkResolveCache.get(cacheKey);
  if (cached) return cached;

  const target = parseAppRoute(pathname, search);
  let result: ResolvedDeepLinkResult;

  switch (target.kind) {
    case 'movie':
      result = await resolveMovieTarget(target.idOrSlug, target.tmdbId, cleanOrigin);
      break;
    case 'series':
      result = await resolveSeriesTarget(
        target.idOrSlug,
        target.tmdbId,
        target.season,
        target.episode,
        cleanOrigin
      );
      break;
    case 'channel':
      result = resolveChannelTarget(target.channelSlug, target.channelIdAlias, cleanOrigin);
      break;
    case 'pack': {
      const route = buildCanonicalRoute({ kind: 'pack', packSlug: target.pack.slug });
      result = {
        found: true,
        kind: 'pack',
        route,
        pack: target.pack,
        og: {
          title: `${target.pack.labelEs} — TV en Directo | RiffanTV`,
          description: truncateDesc(
            `Mira ${target.pack.labelEs} gratis y en directo HD en RiffanTV, solo o en sala sincronizada con amigos.`
          ),
          url: `${cleanOrigin}${route}`,
          type: 'website',
        },
      };
      break;
    }
    case 'footballScope': {
      const route = buildCanonicalRoute({ kind: 'footballScope', scope: target.scope });
      result = {
        found: true,
        kind: 'footballScope',
        route,
        footballScope: { scope: target.scope, config: target.config },
        og: {
          title: `${target.config.labelEs} — Fútbol en Directo | RiffanTV`,
          description: truncateDesc(
            `Consulta horarios, marcadores y emisiones en directo de ${target.config.labelEs} en RiffanTV.`
          ),
          url: `${cleanOrigin}${route}`,
          type: 'website',
        },
      };
      break;
    }
    case 'match':
      result = await resolveMatchTarget(target.matchIdOrSlug, cleanOrigin);
      break;
    case 'game': {
      const route = buildCanonicalRoute({ kind: 'game', gameId: target.gameId });
      const title = GAME_TITLES[target.gameId]?.es || target.gameId;
      result = {
        found: true,
        kind: 'game',
        route,
        game: { gameId: target.gameId, gameSlug: target.gameSlug, title },
        og: {
          title: `${title} Online — Riffan Play | RiffanTV`,
          description: truncateDesc(
            `Juega a ${title} gratis en RiffanTV: modo individual contra IA o sala privada multijugador con amigos.`
          ),
          url: `${cleanOrigin}${route}`,
          type: 'website',
        },
      };
      break;
    }
    case 'world': {
      const route = buildCanonicalRoute({
        kind: 'world',
        world: target.world,
        cineTab: target.cineTab,
        cineCategory: target.cineCategory,
        futbolTab: target.futbolTab,
      });
      const worldLabels: Record<string, string> = {
        cine: target.cineTab === 'series' ? 'Catálogo de Series HD' : 'Catálogo de Cine y Estrenos 4K',
        futbol: 'Fútbol en Directo y Marcadores',
        tv: 'Canales de TV y TDT en Directo',
        juegos: 'Riffan Play — Salón de Juegos Multijugador',
        youtube: 'YouTube en Sala Sincronizada',
        clipbox: 'ClipBox Vault — Motores, Búsqueda y Descifrado',
        rbtv: 'RBTV+ — Cluster Deportivo, DoH y Arquitectura P2P',
        belix: 'Belix TV — Motor Xtream Codes y Rutas com.ibopro.ultra',
        atresplayer: 'Atresmedia — Directos 1080p, Pasapalabra, Programas y Series',
        movistardazn: 'DAZN & Movistar+ — Fútbol, F1, MotoGP, Deportes HD y Series Originales',
      };
      const title = `${worldLabels[target.world] || 'RiffanTV'} — RiffanTV`;
      result = {
        found: true,
        kind: 'world',
        route,
        world: {
          world: target.world,
          cineTab: target.cineTab,
          cineCategory: target.cineCategory,
          futbolTab: target.futbolTab,
        },
        og: {
          title,
          description: DEFAULT_OG_META.description,
          url: `${cleanOrigin}${route}`,
          type: 'website',
        },
      };
      break;
    }
    case 'room': {
      const route = buildCanonicalRoute({
        kind: 'room',
        roomId: target.roomId,
        tvMode: target.isTvMode,
        gameType: target.gameType,
      });
      result = {
        found: true,
        kind: 'room',
        route,
        og: {
          title: `Sala Privada ${target.roomId.toUpperCase()} — RiffanTV`,
          description:
            'Únete a esta sala privada en RiffanTV para ver películas, series, fútbol en directo o jugar con amigos en tiempo real.',
          url: `${cleanOrigin}${route}`,
          type: 'website',
        },
      };
      break;
    }
    case 'system':
      result = {
        found: true,
        kind: 'system',
        route: pathname,
        og: {
          ...DEFAULT_OG_META,
          url: `${cleanOrigin}${pathname}`,
        },
      };
      break;
    default:
      result = {
        found: true,
        kind: 'home',
        route: '/',
        og: {
          ...DEFAULT_OG_META,
          url: cleanOrigin,
        },
      };
      break;
  }

  deepLinkResolveCache.set(cacheKey, result);
  return result;
}

export function shouldInjectDeepLinkOg(pathname: string): boolean {
  const cleanPath = String(pathname || '/').split('?')[0];
  if (
    cleanPath.startsWith('/api/') ||
    cleanPath.startsWith('/assets/') ||
    cleanPath.startsWith('/src/') ||
    cleanPath.startsWith('/vendor/') ||
    cleanPath.startsWith('/@') ||
    cleanPath.startsWith('/node_modules/')
  ) {
    return false;
  }
  if (/\.[a-z0-9]{1,8}$/i.test(cleanPath)) return false;
  return isDedicatedAppPath(cleanPath);
}

export async function resolveOpenGraphMetaForRequest(
  reqUrl: string,
  origin: string
): Promise<OpenGraphMeta | null> {
  try {
    const resolved = await Promise.race<ResolvedDeepLinkResult | null>([
      resolveDeepLinkTarget(reqUrl, origin),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 900)),
    ]);
    return resolved?.og || null;
  } catch {
    return null;
  }
}

export function injectDynamicOgMeta(html: string, meta: OpenGraphMeta): string {
  const safeTitle = escapeHtmlAttr(meta.title || DEFAULT_OG_META.title);
  const safeDesc = escapeHtmlAttr(meta.description || DEFAULT_OG_META.description);
  const safeUrl = escapeHtmlAttr(meta.url || DEFAULT_OG_META.url);
  const safeImage = meta.image ? escapeHtmlAttr(meta.image) : '';
  const safeType = escapeHtmlAttr(meta.type || 'website');

  let out = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${safeTitle}</title>`);

  out = out.replace(
    /<meta\b[^>]*\bname=["']description["'][^>]*>/i,
    `<meta name="description" content="${safeDesc}" />`
  );
  out = out.replace(
    /<meta\b[^>]*\bproperty=["']og:title["'][^>]*>/i,
    `<meta property="og:title" content="${safeTitle}" />`
  );
  out = out.replace(
    /<meta\b[^>]*\bproperty=["']og:description["'][^>]*>/i,
    `<meta property="og:description" content="${safeDesc}" />`
  );

  const extraTags: string[] = [
    `<meta property="og:type" content="${safeType}" />`,
    `<meta property="og:url" content="${safeUrl}" />`,
    `<meta property="og:site_name" content="RiffanTV" />`,
    `<meta name="twitter:card" content="${safeImage ? 'summary_large_image' : 'summary'}" />`,
    `<meta name="twitter:title" content="${safeTitle}" />`,
    `<meta name="twitter:description" content="${safeDesc}" />`,
  ];
  if (safeImage) {
    extraTags.push(`<meta property="og:image" content="${safeImage}" />`);
    extraTags.push(`<meta name="twitter:image" content="${safeImage}" />`);
  }

  out = out.replace(/<\/head>/i, `    ${extraTags.join('\n    ')}\n  </head>`);
  return out;
}

export function registerDeepLinkRoutes(
  app: express.Express,
  deps: { getPublicOrigin: (req: express.Request) => string }
): void {
  app.get('/api/resolve-link', async (req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=120');
    const rawPath = String(req.query.path || req.query.url || '/').trim() || '/';
    const origin = deps.getPublicOrigin(req);
    try {
      const resolved = await resolveDeepLinkTarget(rawPath, origin);
      return res.json({ success: true, ...resolved });
    } catch {
      return res.status(500).json({ success: false, found: false, route: '/' });
    }
  });
}

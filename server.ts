import dns from 'dns';
import fs from 'fs';
import express from 'express';
import compression from 'compression';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import { ENV } from './server/config/env.ts';
import { resolveOfficialChannelLogoUrl } from './src/shared/channelLogos.ts';
import { logger } from './server/utils/logger.ts';
import { LruTtlCache } from './server/utils/lruCache.ts';
import {
  applyPublicCacheHeaders,
  expressErrorHandler,
  securityHeadersMiddleware,
} from './server/middleware/errorHandler.ts';
import { serviceMeshGatewayMiddleware } from './server/gateway/serviceMesh.ts';
import { registerOperationalRoutes } from './server/routes/health.ts';
import { registerExpandedCatalogRoutes } from './server/routes/expandedCatalog.ts';
import { registerKidsRoutes } from './server/routes/kids.ts';
import { registerProxyRoutes } from './server/routes/proxies.ts';
import { registerVoiceAssistantRoutes } from './server/routes/voiceAssistant.ts';
import { setupGeminiLiveWebSocket } from './server/routes/geminiLive.ts';
import { registerYouTubeCatalogRoutes, parseYouTubeVideoId } from './server/routes/youtubeCatalog.ts';
import {
  registerSportsRoutes,
  getPermanent247SportsMatches,
  getCachedSportsMatches,
  getLiveVoiceMatches,
} from './server/routes/sports.ts';
import { registerIptvAndTdtRoutes, getLiveVoiceChannels } from './server/routes/iptv.ts';
import { registerEpgRoutes } from './server/services/epgService.ts';
import { registerCastellanoCatalogRoutes } from './server/routes/castellanoCatalog.ts';
import { registerCatalaCatalogRoutes } from './server/routes/catalaCatalog.ts';
import {
  fetchAndCacheSubtitles,
  registerDetailsAndSubtitlesRoutes,
} from './server/routes/detailsAndSubtitles.ts';
import { SPANISH_TDT_CHANNELS } from './server/data/tdtChannels.ts';
import { CATALA_LIVE_CHANNELS } from './server/data/catalaRegistry.ts';
import {
  MOVIE_GENRE_MAP,
  ANIME_PROVIDER_IDS,
  USER_MASTERPIECE_ANIME_TV_IDS,
  matchMasterpieceAnimeIds,
  ANIMEBOX_CURATED_TV_IDS,
  ANIMEBOX_CURATED_MOVIE_IDS,
  CURATED_4K_MOVIE_IDS,
  CURATED_4K_MOVIE_SET,
  CURATED_4K_SERIES_IDS,
  CURATED_4K_SERIES_SET,
  STREAMING_PROVIDER_MAP,
  resolveEffectiveProviderAndQuery,
  ANIME_MOVIE_GENRE_EXTRAS,
} from './server/data/vodConstants.ts';
import { scrapeMovidyCatalog } from './server/services/movidyCatalogService.ts';
import {
  applySyncedStreamsToChannels,
  refreshLiveIptvRegistry,
} from './server/services/iptvPlaylistService.ts';
import { createRoomHub } from './server/ws/roomHub.ts';
import {
  CHROME_UA,
  TDT_DVB_UA,
  areTitlesStrictlyEqual,
  buildHlsProxyUrl,
  buildTsProxyUrl,
  curlGetText,
  fetchTextWithCurlFallback,
  generateSpanishTitleHints,
  getPreferredUpstreamUa,
  isChineseIptvStream,
  isDvbHeadendStream,
  matchesYouTubeFallbackTitle,
  maybeSignEasyBroadcastUrl,
  normalizeTitleForMatch,
  resolveKnownUpstreamReferer,
  type ExtractedStreamResult,
  type TrackRecord,
} from './server/extractors/httpHelpers.ts';
import {
  extractEmbed69SpanishTracks,
  unpackVidhideToHls,
} from './server/extractors/vidhideEmbed69.ts';
import {
  MOVIDY_ORIGIN,
  extract2EmbedEnglishTracks,
  extractBingetrixEnglishTracks,
  extractMovidyPageTracks,
  extractVidRockHlsTracks,
  extractVidsrcBuzzHlsTracks,
  fetchMovidyPageMetadata,
  findMovidyUrlByTitle,
  isMovidyVerUrl,
  normalizeMovidyUrl,
  probeAvailableLanguages,
  probeVidsrcBuzzHasContent,
  resolveMovidyEmbedTrack,
  verifyMovidyMetaMatch,
  type MovidyPageMetadata,
} from './server/extractors/bingetrixMovidy.ts';
import {
  extractGnulaHdTracks,
  fetchGnulaPageMetadata,
  findGnulaHdUrlByTitle,
  isGnulaHdUrl,
  normalizeGnulaUrl,
  resolveActiveGnulaMirrors,
  scrapeGnulaCatalog,
  verifyGnulaMetaMatch,
  type GnulaPageMetadata,
} from './server/extractors/gnulaHdExtractor.ts';
import {
  extractLiveSportsHlsDirect,
  fetchSportsHtmlHop,
  sniffStreamWithHeadless,
  verifyM3u8HasCleanVideoFrame,
} from './server/extractors/sportsExtractor.ts';
import {
  fetchTmdbJson,
  fetchTmdbUrlJson,
} from './server/services/tmdbService.ts';
import {
  extractVestStreamsAndSubtitles,
  fetchVestDetailPage,
  findVestSeedForMedia,
  isVestMirrorUrl,
  listVestCatalogEntries,
  type VestParsedDetail,
  type VestSubtitleItem,
} from './server/services/vestMirrorService.ts';
import { buildSignedApkBuffer } from './server/services/apkBuilderService.ts';
import { channelHealthMonitor } from './server/services/channelHealthMonitor.ts';
import {
  correctCommonSearchTypos,
  getCatalogRefreshStatus,
  liveOnDemandFallbackSearch,
  runRefreshCycle,
  scoreTitleRelevance,
  searchIndexedCatalog,
  startCatalogRefreshScheduler,
} from './server/services/catalogRefreshService.ts';
import {
  getAiMovieRequestJob,
  startAiMovieRequest,
} from './server/services/aiMovieRequestService.ts';

// Prefer IPv4 to avoid transient container IPv6 socket resets with upstream CDNs
dns.setDefaultResultOrder('ipv4first');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TMDB_API_KEY = ENV.tmdbApiKey;

// Bounded LRU + TTL cache for extracted streams (prevents unbounded growth)
const extractionCache = new LruTtlCache<string, ExtractedStreamResult>(400, 15 * 60 * 1000);

function getPublicOrigin(req: express.Request): string {
  const overrideOrigin = String(req.query.origin || '').trim();
  if (/^https?:\/\/[a-z0-9.-]+(:\d+)?$/i.test(overrideOrigin)) {
    return overrideOrigin.replace(/\/+$/, '');
  }
  const rawProto = String(req.headers['x-forwarded-proto'] || req.protocol || 'http')
    .split(',')[0]
    .trim();
  const rawHost = String(req.headers['x-forwarded-host'] || req.get('host') || 'localhost:3000')
    .split(',')[0]
    .trim();
  const hostWithoutPort = rawHost.split(':')[0].toLowerCase();
  if (hostWithoutPort === 'localhost' || hostWithoutPort === '127.0.0.1' || hostWithoutPort.startsWith('192.168.')) {
    return `${rawProto}://${rawHost}`;
  }
  const domain = rawHost.includes('run.app') || rawHost.includes('ai.studio') || rawHost.includes('riffantv.ai.studio')
    ? rawHost
    : (ENV.publicDomain || 'riffantv.ai.studio');
  const proto = domain.includes('localhost') ? 'http' : 'https';
  return `${proto}://${domain}`;
}

// ============================================================================
// EXPRESS + WEBSOCKET SERVER INITIALIZATION
// ============================================================================
const app = express();
app.disable('x-powered-by');
const httpServer = createServer(app);
const wss = new WebSocketServer({
  noServer: true,
  perMessageDeflate: {
    zlibDeflateOptions: { level: 6 },
    threshold: 1024,
  },
});

let geminiLiveBridge: ReturnType<typeof setupGeminiLiveWebSocket> | null = null;

httpServer.on('upgrade', (req, socket, head) => {
  const pathname = (req.url || '').split('?')[0];
  if (pathname === '/ws') {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  } else if (pathname === '/ws/gemini-live' && geminiLiveBridge) {
    geminiLiveBridge.handleUpgrade(req, socket, head);
  }
});

app.use(compression());
app.use(securityHeadersMiddleware);
app.use(express.json({ limit: '10mb' }));
app.use('/api', serviceMeshGatewayMiddleware);

// Serve ES5 UMD Hls.js locally for Samsung Tizen / LG webOS Smart TVs (zero external CDN dependency)
app.get('/vendor/hls.min.js', (_req, res) => {
  const hlsPath = path.resolve(__dirname, 'node_modules', 'hls.js', 'dist', 'hls.min.js');
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  applyPublicCacheHeaders(res, 86400, 86400);
  res.sendFile(hlsPath);
});

const roomHub = createRoomHub(app, wss);


registerOperationalRoutes(app, {
  getStats: () => ({
    ...roomHub.getStats(),
    uptimeSec: Math.round(process.uptime()),
  }),
  getPublicOrigin,
  refreshChannelHealth: async (force = true) => {
    const channels = [
      ...SPANISH_TDT_CHANNELS,
      ...CATALA_LIVE_CHANNELS,
      ...getPermanent247SportsMatches(),
      ...getCachedSportsMatches(),
    ];
    await channelHealthMonitor.runSweep(channels, { force });
  },
});

registerExpandedCatalogRoutes(app);
registerKidsRoutes(app);
registerProxyRoutes(app, { getPublicOrigin });
registerSportsRoutes(app);
registerIptvAndTdtRoutes(app, { getPublicOrigin });
registerEpgRoutes(app);
registerCastellanoCatalogRoutes(app);
registerCatalaCatalogRoutes(app);
registerYouTubeCatalogRoutes(app);
registerVoiceAssistantRoutes(app, {
  getChannels: getLiveVoiceChannels,
  resolveLogoUrl: resolveOfficialChannelLogoUrl,
  getSportsMatches: getLiveVoiceMatches,
});
geminiLiveBridge = setupGeminiLiveWebSocket(httpServer, {
  getChannels: getLiveVoiceChannels,
  getSportsMatches: getLiveVoiceMatches,
});

app.get(
  [
    '/RIFFAN-TV-TV.apk',
    '/riffantv-tv.apk',
    '/NAIM-CINE-TV.apk',
    '/tv.apk',
    '/googletv.apk',
    '/api/download/apk-tv',
  ],
  (req, res) => {
    const candidates = [
      path.resolve(__dirname, 'public', 'RIFFAN-TV-TV.apk'),
      path.resolve(__dirname, 'dist', 'RIFFAN-TV-TV.apk'),
      path.resolve(__dirname, 'public', 'NAIM-CINE-TV.apk'),
      path.resolve(__dirname, 'dist', 'NAIM-CINE-TV.apk'),
    ];
    const target = candidates.find((p) => fs.existsSync(p));
    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    res.setHeader('Content-Disposition', 'attachment; filename="RIFFAN-TV-TV.apk"');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    if (target) {
      return res.sendFile(target);
    }
    try {
      const apkBuf = buildSignedApkBuffer('tv', getPublicOrigin(req));
      res.setHeader('Content-Length', String(apkBuf.length));
      return res.send(apkBuf);
    } catch (err) {
      logger.error({ err }, 'tv_apk_build_failed');
      return res.status(500).json({ error: 'Unable to build Google TV APK package' });
    }
  }
);

app.get(
  [
    '/RIFFAN-TV.apk',
    '/riffantv.apk',
    '/NAIM-CINE.apk',
    '/naimcine.apk',
    '/movil.apk',
    '/api/download/apk',
  ],
  (req, res) => {
    const candidates = [
      path.resolve(__dirname, 'public', 'RIFFAN-TV.apk'),
      path.resolve(__dirname, 'dist', 'RIFFAN-TV.apk'),
      path.resolve(__dirname, 'public', 'NAIM-CINE.apk'),
      path.resolve(__dirname, 'dist', 'NAIM-CINE.apk'),
    ];
    const target = candidates.find((p) => fs.existsSync(p));
    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    res.setHeader('Content-Disposition', 'attachment; filename="RIFFAN-TV.apk"');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    if (target) {
      return res.sendFile(target);
    }
    try {
      const apkBuf = buildSignedApkBuffer('mobile', getPublicOrigin(req));
      res.setHeader('Content-Length', String(apkBuf.length));
      return res.send(apkBuf);
    } catch (err) {
      logger.error({ err }, 'mobile_apk_build_failed');
      return res.status(500).json({ error: 'Unable to build Mobile APK package' });
    }
  }
);

app.get(
  [
    '/RIFFAN-KIDS-TV.apk',
    '/riffankids-tv.apk',
    '/kids-tv.apk',
    '/api/download/apk-kids-tv',
  ],
  (req, res) => {
    const candidates = [
      path.resolve(__dirname, 'public', 'RIFFAN-KIDS-TV.apk'),
      path.resolve(__dirname, 'dist', 'RIFFAN-KIDS-TV.apk'),
    ];
    const target = candidates.find((p) => fs.existsSync(p));
    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    res.setHeader('Content-Disposition', 'attachment; filename="RIFFAN-KIDS-TV.apk"');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    if (target) {
      return res.sendFile(target);
    }
    try {
      const apkBuf = buildSignedApkBuffer('kids_tv', getPublicOrigin(req));
      res.setHeader('Content-Length', String(apkBuf.length));
      return res.send(apkBuf);
    } catch (err) {
      logger.error({ err }, 'kids_tv_apk_build_failed');
      return res.status(500).json({ error: 'Unable to build Riffan Kids Google TV APK' });
    }
  }
);

app.get(
  [
    '/RIFFAN-KIDS.apk',
    '/riffankids.apk',
    '/kids.apk',
    '/riffan-kids.apk',
    '/api/download/apk-kids',
  ],
  (req, res) => {
    const candidates = [
      path.resolve(__dirname, 'public', 'RIFFAN-KIDS.apk'),
      path.resolve(__dirname, 'dist', 'RIFFAN-KIDS.apk'),
    ];
    const target = candidates.find((p) => fs.existsSync(p));
    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    res.setHeader('Content-Disposition', 'attachment; filename="RIFFAN-KIDS.apk"');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    if (target) {
      return res.sendFile(target);
    }
    try {
      const apkBuf = buildSignedApkBuffer('kids_mobile', getPublicOrigin(req));
      res.setHeader('Content-Length', String(apkBuf.length));
      return res.send(apkBuf);
    } catch (err) {
      logger.error({ err }, 'kids_mobile_apk_build_failed');
      return res.status(500).json({ error: 'Unable to build Riffan Kids Mobile APK' });
    }
  }
);

// Serve Zero-Dependency Pure ES5 + Classic CSS Smart TV Receiver (/tv) directly
// Works on 100% of Samsung Tizen, LG webOS, Bravia, Viera, VIDAA & Fire TV browsers!
function sendSmartTvReceiverHtml(res: express.Response) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  const publicPath = path.resolve(__dirname, 'public', 'tv-receiver.html');
  const distPath = path.resolve(__dirname, 'dist', 'tv-receiver.html');
  const target = fs.existsSync(publicPath) ? publicPath : distPath;
  res.sendFile(target);
}

app.get(['/tv', '/tv/'], (_req, res) => {
  sendSmartTvReceiverHtml(res);
});

// Auto-redirect Smart TV browsers (Samsung Tizen, LG webOS, etc.) opening "/" straight to "/tv"
app.get('/', (req, res, next) => {
  if (req.query.web === '1' || req.query.room) {
    return next();
  }
  const ua = String(req.headers['user-agent'] || '');
  if (
    /SMART-TV|SmartTV|Tizen|Web0S|WebOS|NetCast|BRAVIA|Viera|VIDAA|HbbTV|AFTB|AFTT|AFTM|GoogleTV/i.test(
      ua
    )
  ) {
    return res.redirect(302, '/tv');
  }
  return next();
});

// ============================================================================
// REST API: MOVIES CATALOG (SPANISH CINEMA + BINGETRIX EXPLORE ENGLISH)
// ============================================================================

export { CURATED_4K_MOVIE_IDS, CURATED_4K_MOVIE_SET, CURATED_4K_SERIES_IDS, CURATED_4K_SERIES_SET };

const movieCatalogCache = new LruTtlCache<string, { movies: any[]; hasMore: boolean; ts: number }>(
  180,
  15 * 60 * 1000
);

async function fetchTmdbItemsByIds(
  ids: number[],
  mediaType: 'movie' | 'tv',
  lang: 'es-ES' | 'en-US'
): Promise<any[]> {
  const results = await Promise.all(
    ids.map((id) =>
      fetchTmdbJson<any>(`/${mediaType}/${id}`, { language: lang }, 30 * 60 * 1000).catch(() => null)
    )
  );
  return results.filter((x) => x && x.id && (x.poster_path || x.backdrop_path));
}

function normalizeNoSpaceForSearch(input: string): string {
  return String(input || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

function buildSmartConcatQueryVariants(rawQuery: string): string[] {
  const q = String(rawQuery || '').trim();
  if (!q || /\s/.test(q) || q.length < 5 || q.length > 18) return [];
  if (!/^[a-zA-Z0-9\u00C0-\u017F]+$/.test(q)) return [];

  const candidates: string[] = [];
  const camelSplit = q.replace(/([a-z\u00E0-\u00FF])([A-Z\u00C0-\u00DF])/g, '$1 $2').trim();
  if (camelSplit !== q && camelSplit.includes(' ')) {
    candidates.push(camelSplit);
  }

  const splitIndices = Array.from(
    new Set([2, 3, 4, Math.floor(q.length / 2)].filter((i) => i >= 2 && i <= q.length - 2))
  );
  for (const idx of splitIndices) {
    const splitStr = `${q.slice(0, idx)} ${q.slice(idx)}`;
    if (!candidates.includes(splitStr)) {
      candidates.push(splitStr);
    }
  }
  return candidates.slice(0, 3);
}

function rankTmdbSearchResultsForQuery(items: any[], rawQuery: string, isTv = false): any[] {
  const normQSpace = normalizeTitleForMatch(rawQuery);
  const normQCompact = normalizeNoSpaceForSearch(rawQuery);
  if (!normQCompact) return items;

  const scoreItem = (item: any): number => {
    const t1 = String((isTv ? item?.name : item?.title) || item?.title || item?.name || '');
    const t2 = String(
      (isTv ? item?.original_name : item?.original_title) ||
        item?.originalTitle ||
        item?.original_name ||
        item?.original_title ||
        ''
    );
    const n1Space = normalizeTitleForMatch(t1);
    const n2Space = normalizeTitleForMatch(t2);
    const n1Compact = normalizeNoSpaceForSearch(t1);
    const n2Compact = normalizeNoSpaceForSearch(t2);

    let tier = 0;
    if (n1Space === normQSpace || n2Space === normQSpace) tier = 500;
    else if (n1Compact === normQCompact || n2Compact === normQCompact) tier = 420;
    else if (
      n1Space.startsWith(normQSpace) ||
      n2Space.startsWith(normQSpace) ||
      n1Compact.startsWith(normQCompact) ||
      n2Compact.startsWith(normQCompact)
    ) {
      tier = 260;
    } else if (
      n1Space.includes(normQSpace) ||
      n2Space.includes(normQSpace) ||
      n1Compact.includes(normQCompact) ||
      n2Compact.includes(normQCompact)
    ) {
      tier = 140;
    }

    const votes = Number(item?.vote_count || 0);
    const pop = Number(item?.popularity || 0);
    const popBoost = Math.min(95, Math.log10(Math.max(1, votes + pop + 1)) * 22);
    return tier + popBoost;
  };

  return [...items].sort((a, b) => scoreItem(b) - scoreItem(a));
}

const TMDB_GENRE_LABEL_ES: Record<number, string> = {
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
  878: 'Sci-Fi',
  53: 'Thriller',
  10752: 'Bélica',
  37: 'Western',
  10759: 'Acción',
  10765: 'Sci-Fi',
};

const TMDB_GENRE_LABEL_EN: Record<number, string> = {
  28: 'Action',
  12: 'Adventure',
  16: 'Animation',
  35: 'Comedy',
  80: 'Crime',
  99: 'Documentary',
  18: 'Drama',
  10751: 'Family',
  14: 'Fantasy',
  36: 'History',
  27: 'Horror',
  10402: 'Music',
  9648: 'Mystery',
  10749: 'Romance',
  878: 'Sci-Fi',
  53: 'Thriller',
  10752: 'War',
  37: 'Western',
  10759: 'Action',
  10765: 'Sci-Fi',
};

function mapTmdbGenreLabels(item: any, lang: 'es-ES' | 'en-US'): string[] {
  const dict = lang === 'en-US' ? TMDB_GENRE_LABEL_EN : TMDB_GENRE_LABEL_ES;
  if (Array.isArray(item?.genres) && item.genres.length > 0) {
    return item.genres
      .map((g: any) => dict[Number(g?.id)] || g?.name)
      .filter(Boolean)
      .slice(0, 2);
  }
  const ids: number[] = Array.isArray(item?.genre_ids) ? item.genre_ids : [];
  const isJa = String(item?.original_language || '').toLowerCase() === 'ja';
  const labels: string[] = [];
  if (ids.includes(16) && isJa) {
    labels.push('Anime');
  }
  for (const id of ids) {
    const label = dict[Number(id)];
    if (label && !labels.includes(label)) {
      if (label === 'Animación' && labels.includes('Anime')) continue;
      if (label === 'Animation' && labels.includes('Anime')) continue;
      labels.push(label);
    }
    if (labels.length >= 2) break;
  }
  return labels.slice(0, 2);
}

async function fetchTmdbMovieCatalog(opts: {
  lang: 'es-ES' | 'en-US';
  category: string;
  sort?: string;
  page: number;
  query: string;
  provider?: string;
}) {
  const { lang, category, sort = '', page } = opts;
  const { provider, query } = resolveEffectiveProviderAndQuery(opts.provider || 'all', opts.query);
  const provCfg = STREAMING_PROVIDER_MAP[provider];
  const isAnime = ANIME_PROVIDER_IDS.has(provider);

  const cacheKey = `v7|${lang}|${provider}|${category}|${sort}|${page}|${query}`;
  const cached = movieCatalogCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < 5 * 60 * 1000) {
    return cached;
  }

  const todayIso = new Date().toISOString().slice(0, 10);
  let endpoint = '';
  let curatedSeedItems: any[] = [];

  if (query) {
    endpoint = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&language=${lang}&query=${encodeURIComponent(query)}&page=${page}&include_adult=false`;
  } else if (isAnime) {
    const animeGenres = ANIME_MOVIE_GENRE_EXTRAS[category] || '16';
    const sortBy =
      category === 'top_rated'
        ? 'vote_average.desc'
        : category === 'simulcast' || category === 'now_playing' || provider === 'jkanime'
        ? 'primary_release_date.desc'
        : provider === 'animeflv' && category === 'trending'
        ? 'vote_count.desc'
        : 'popularity.desc';
    const minVotes =
      category === 'top_rated'
        ? 180
        : sortBy === 'primary_release_date.desc'
        ? 15
        : 45;

    if (provider === 'crunchyroll') {
      endpoint = `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_API_KEY}&language=${lang}&watch_region=US&with_watch_providers=283&with_watch_monetization_types=${encodeURIComponent(
        'flatrate|ads|free'
      )}&with_genres=${animeGenres}&with_original_language=ja&sort_by=${sortBy}&vote_count.gte=15&primary_release_date.lte=${todayIso}&page=${page}&include_adult=false`;
    } else if (provider === 'animebox') {
      if (page === 1 && (category === 'trending' || category === 'popular')) {
        curatedSeedItems = await fetchTmdbItemsByIds(ANIMEBOX_CURATED_MOVIE_IDS, 'movie', lang);
      }
      endpoint = `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_API_KEY}&language=${lang}&watch_region=ES&with_genres=${animeGenres}&with_original_language=ja&sort_by=${sortBy}&vote_count.gte=${minVotes}&primary_release_date.lte=${todayIso}&page=${page}&include_adult=false`;
    } else {
      endpoint = `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_API_KEY}&language=${lang}&with_genres=${animeGenres}&with_original_language=ja&sort_by=${sortBy}&vote_count.gte=${minVotes}&primary_release_date.lte=${todayIso}&page=${page}&include_adult=false`;
    }
  } else if (provCfg) {
    const sortBy =
      category === 'top_rated'
        ? 'vote_average.desc'
        : category === 'now_playing'
        ? 'primary_release_date.desc'
        : 'popularity.desc';
    const minVotes = category === 'top_rated' ? 300 : 120;
    const genreParam = MOVIE_GENRE_MAP[category] ? `&with_genres=${MOVIE_GENRE_MAP[category]}` : '';
    const companyParam =
      category === 'originals' && provCfg.movieCompanies
        ? `&with_companies=${encodeURIComponent(provCfg.movieCompanies)}`
        : '';
    endpoint = `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_API_KEY}&language=${lang}&watch_region=ES&with_watch_providers=${encodeURIComponent(
      provCfg.watchProviders
    )}&with_watch_monetization_types=${encodeURIComponent(
      'flatrate|ads|free'
    )}&sort_by=${sortBy}&vote_count.gte=${minVotes}&primary_release_date.lte=${todayIso}${genreParam}${companyParam}&page=${page}&include_adult=false`;
  } else if (category === 'anime') {
    const discoverSort =
      sort === 'top_rated'
        ? 'vote_average.desc'
        : sort === 'now_playing'
        ? 'primary_release_date.desc'
        : 'popularity.desc';
    const minVotes = sort === 'top_rated' ? 160 : 30;
    endpoint = `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_API_KEY}&language=${lang}&sort_by=${discoverSort}&vote_count.gte=${minVotes}&primary_release_date.lte=${todayIso}&with_genres=16&with_original_language=ja&page=${page}&include_adult=false`;
  } else if (MOVIE_GENRE_MAP[category]) {
    const discoverSort =
      sort === 'top_rated'
        ? 'vote_average.desc'
        : sort === 'now_playing'
        ? 'primary_release_date.desc'
        : 'popularity.desc';
    const minVotes = sort === 'top_rated' ? 220 : 45;
    endpoint = `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_API_KEY}&language=${lang}&sort_by=${discoverSort}&vote_count.gte=${minVotes}&primary_release_date.lte=${todayIso}&with_genres=${MOVIE_GENRE_MAP[category]}&page=${page}&include_adult=false`;
  } else if (category === '4k' || sort === '4k') {
    if (page === 1) {
      curatedSeedItems = await fetchTmdbItemsByIds(CURATED_4K_MOVIE_IDS, 'movie', lang);
    }
    endpoint = `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_API_KEY}&language=${lang}&sort_by=vote_count.desc&vote_count.gte=1000&vote_average.gte=7.2&primary_release_date.gte=2008-01-01&primary_release_date.lte=${todayIso}&page=${page}&include_adult=false`;
  } else if (category === 'popular' || (!category && sort === 'popular')) {
    endpoint = `https://api.themoviedb.org/3/movie/popular?api_key=${TMDB_API_KEY}&language=${lang}&page=${page}`;
  } else if (category === 'top_rated' || (!category && sort === 'top_rated')) {
    endpoint = `https://api.themoviedb.org/3/movie/top_rated?api_key=${TMDB_API_KEY}&language=${lang}&page=${page}`;
  } else if (category === 'now_playing' || (!category && sort === 'now_playing')) {
    endpoint = `https://api.themoviedb.org/3/movie/now_playing?api_key=${TMDB_API_KEY}&language=${lang}&page=${page}`;
  } else {
    endpoint = `https://api.themoviedb.org/3/trending/movie/week?api_key=${TMDB_API_KEY}&language=${lang}&page=${page}`;
  }

  const json: any =
    (await fetchTmdbUrlJson<any>(endpoint, 5 * 60 * 1000).catch(() => null)) || {
      results: [],
      total_pages: 1,
    };
  let results: any[] = Array.isArray(json?.results) ? json.results : [];
  let totalPages = Number(json?.total_pages || 1);

  if (query && page === 1) {
    const compactQ = normalizeNoSpaceForSearch(query);
    const hasStrongExactMatch = results.some(
      (r) =>
        (normalizeNoSpaceForSearch(r?.title || '') === compactQ ||
          normalizeNoSpaceForSearch(r?.original_title || '') === compactQ) &&
        Number(r?.vote_count || 0) >= 40
    );

    const otherLang = lang === 'es-ES' ? 'en-US' : 'es-ES';
    const [otherLangRes, multiRes] = await Promise.all([
      fetchTmdbJson<any>(
        '/search/movie',
        { language: otherLang, query, page: 1, include_adult: false },
        5 * 60 * 1000
      ).catch(() => null),
      fetchTmdbJson<any>(
        '/search/multi',
        { language: 'en-US', query, page: 1, include_adult: false },
        5 * 60 * 1000
      ).catch(() => null),
    ]);

    const extraRows: any[] = [
      ...(Array.isArray(otherLangRes?.results) ? otherLangRes.results : []),
      ...(Array.isArray(multiRes?.results)
        ? multiRes.results.filter((x: any) => !x?.media_type || x.media_type === 'movie')
        : []),
    ];

    if (!hasStrongExactMatch) {
      const variants = buildSmartConcatQueryVariants(query);
      if (variants.length > 0) {
        const extraLists = await Promise.all(
          variants.map(async (vq) => {
            const ej = await fetchTmdbJson<any>(
              '/search/movie',
              { language: lang, query: vq, page: 1, include_adult: false },
              5 * 60 * 1000
            ).catch(() => null);
            return Array.isArray(ej?.results) ? ej.results : [];
          })
        );
        extraRows.push(...extraLists.flat());
      }
    }

    if (extraRows.length > 0) {
      const byId = new Map<number, any>();
      for (const r of [...results, ...extraRows]) {
        if (!r?.id) continue;
        if (!byId.has(r.id)) byId.set(r.id, r);
      }
      results = rankTmdbSearchResultsForQuery(Array.from(byId.values()), query, false);
    } else if (results.length > 0) {
      results = rankTmdbSearchResultsForQuery(results, query, false);
    }
  }

  // Fallback for Crunchyroll movie sub-genres if US watch_provider filter is sparse
  if (isAnime && provider === 'crunchyroll' && !query && results.length < 4) {
    const animeGenres = ANIME_MOVIE_GENRE_EXTRAS[category] || '16';
    const fbJson = await fetchTmdbJson<any>(
      '/discover/movie',
      {
        language: lang,
        with_genres: animeGenres,
        with_original_language: 'ja',
        sort_by: 'popularity.desc',
        'vote_count.gte': 30,
        'primary_release_date.lte': todayIso,
        page,
        include_adult: false,
      },
      5 * 60 * 1000
    ).catch(() => null);
    if (Array.isArray(fbJson?.results) && fbJson.results.length > results.length) {
      results = fbJson.results;
      totalPages = Number(fbJson?.total_pages || 1);
    }
  }

  const mergedRaw: any[] = [];
  const seenIds = new Set<number>();
  for (const item of [...curatedSeedItems, ...results]) {
    if (item?.id && !seenIds.has(item.id)) {
      seenIds.add(item.id);
      mergedRaw.push(item);
    }
  }

  const isEn = lang === 'en-US';
  const movies = mergedRaw
    .filter((m) => {
      if (!m || !m.id || (!m.poster_path && !m.backdrop_path)) return false;
      if (isAnime && query) {
        const gIds: number[] = Array.isArray(m.genre_ids) ? m.genre_ids : [];
        const isJa = String(m.original_language || '').toLowerCase() === 'ja';
        if (!gIds.includes(16) && !isJa) return false;
      }
      if (!query && !isAnime) {
        if (Number(m.vote_count || 0) < 35 || Number(m.vote_average || 0) <= 0) {
          return false;
        }
        if (m.release_date && String(m.release_date) > todayIso) {
          return false;
        }
      }
      return true;
    })
    .map((m) => {
      const is4k = category === '4k' || sort === '4k' || CURATED_4K_MOVIE_SET.has(Number(m.id));
      return {
        id: `${isEn ? 'bingetrix' : 'es'}-${provider}-movie-${m.id}`,
        tmdbId: m.id,
        mediaType: 'movie' as const,
        is4k,
        quality: is4k ? '4K UHD' : 'HD',
        title: m.title || m.original_title || 'Película',
        originalTitle: m.original_title || m.title || '',
      year: m.release_date ? String(m.release_date).split('-')[0] : 'HD',
      rating: m.vote_average ? Number(m.vote_average).toFixed(1) : '',
      overview:
        m.overview ||
        (isAnime
          ? 'Película de anime disponible en Español, Latino y VOSE (Japonés Sub Español) en 1080p.'
          : isEn
          ? 'Available in 1080p Original English ad-free streaming.'
          : 'Disponible en reproducción directa HD sin anuncios (Castellano, Latino y VO Inglés 1080p).'),
      poster: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : '',
      backdrop: m.backdrop_path ? `https://image.tmdb.org/t/p/w1280${m.backdrop_path}` : '',
      bingetrixUrl: `https://bingetrix.sc/watch/${m.id}`,
      languages: isAnime
        ? ['Español', 'Latino', 'VOSE', 'EN']
        : isEn
        ? ['English 1080p', 'VOSE', 'ES']
        : ['Castellano', 'Latino', 'VOSE', 'EN'],
      platform: provCfg?.label,
      providerId: provCfg ? provider : undefined,
      genres: mapTmdbGenreLabels(m, lang),
      popularity: Number(m.popularity || 0),
      voteCount: Number(m.vote_count || 0),
    };
  });

  const payload = {
    movies,
    hasMore: page < totalPages && movies.length > 0,
    ts: Date.now(),
  };
  movieCatalogCache.set(cacheKey, payload);
  return payload;
}

app.get('/api/catalog/movies', async (req, res) => {
  try {
    const rawQuery = String(req.query.query || '').trim();
    const rawProvider = String(req.query.provider || 'all').toLowerCase().trim();
    const { provider, query } = resolveEffectiveProviderAndQuery(rawProvider, rawQuery);
    const category = String(req.query.category || 'trending').toLowerCase();
    const sort = String(req.query.sort || '').toLowerCase();
    const page = Math.max(1, Math.min(100, parseInt(String(req.query.page || '1'), 10) || 1));

    const mergedCacheKey = `merged-es-v13|${provider}|${category}|${sort}|${page}|${query}`;
    const cachedMerged = movieCatalogCache.get(mergedCacheKey);
    if (cachedMerged && Date.now() - cachedMerged.ts < 5 * 60 * 1000) {
      return res.json({
        success: true,
        movies: cachedMerged.movies,
        hasMore: cachedMerged.hasMore,
        page,
      });
    }

    // When a specific streaming platform or anime portal is active, serve its TMDB catalog directly
    if ((STREAMING_PROVIDER_MAP[provider] && !query) || ANIME_PROVIDER_IDS.has(provider)) {
      const tmdbData = await fetchTmdbMovieCatalog({
        lang: 'es-ES',
        category,
        sort,
        page,
        query: '',
        provider,
      });
      movieCatalogCache.set(mergedCacheKey, {
        movies: tmdbData.movies,
        hasMore: tmdbData.hasMore,
        ts: Date.now(),
      });
      return res.json({
        success: true,
        movies: tmdbData.movies,
        hasMore: tmdbData.hasMore,
        page,
      });
    }

    const scrapeGnulaMoviesFast = () => {
      if (STREAMING_PROVIDER_MAP[provider]) {
        return Promise.resolve({ items: [] as any[], hasMore: false });
      }
      return Promise.race([
        scrapeGnulaCatalog({ category, page, query, mediaType: 'movie' }).catch(() => ({
          items: [],
          hasMore: false,
        })),
        new Promise<{ items: any[]; hasMore: boolean }>((resolve) =>
          setTimeout(() => resolve({ items: [], hasMore: false }), query ? 2400 : 3200)
        ),
      ]);
    };

    const searchQueryForScrapers = query ? correctCommonSearchTypos(query) || query : '';
    const [movidyData, gnulaData, tmdbData] = await Promise.all([
      scrapeMovidyCatalog({ category, page, query: searchQueryForScrapers }),
      scrapeGnulaMoviesFast(),
      fetchTmdbMovieCatalog({ lang: 'es-ES', category, sort, page, query: searchQueryForScrapers, provider }),
    ]);

    const tmdbTitleKeys = new Set<string>();
    for (const tm of tmdbData.movies) {
      const kTitle = normalizeTitleForMatch(tm.title);
      const kOrig = normalizeTitleForMatch(tm.originalTitle || '');
      if (kTitle) tmdbTitleKeys.add(kTitle);
      if (kOrig) tmdbTitleKeys.add(kOrig);
    }

    const seenNormTitles = new Set<string>();
    const seenTmdbIds = new Set<number>();
    const combinedMovies: any[] = [];

    // 1. Place verified TMDB movies with authentic posters/IDs
    for (const tm of tmdbData.movies) {
      const numTmdb = Number(tm.tmdbId || 0);
      if (numTmdb > 0) {
        if (seenTmdbIds.has(numTmdb)) continue;
        seenTmdbIds.add(numTmdb);
      }
      const kTitle = normalizeTitleForMatch(tm.title);
      const kOrig = normalizeTitleForMatch(tm.originalTitle || '');
      if (kTitle) seenNormTitles.add(kTitle);
      if (kOrig) seenNormTitles.add(kOrig);
      combinedMovies.push(tm);
    }

    // 2. Attach Movidy URLs onto matching TMDB items AND append exclusive Movidy movies
    const filteredMovidyMovies = searchQueryForScrapers
      ? movidyData.movies.filter(
          (mv) => scoreTitleRelevance(mv.title, mv.originalTitle, searchQueryForScrapers) >= 70
        )
      : movidyData.movies;

    for (const mv of filteredMovidyMovies) {
      const kFull = normalizeTitleForMatch(mv.title);
      const kOutside = normalizeTitleForMatch(String(mv.title || '').replace(/\s*\([^)]*\)/g, ''));
      const kInside = normalizeTitleForMatch(String(mv.title || '').match(/\(([^)]+)\)/)?.[1] || '');

      const matchedExisting = combinedMovies.find((m) =>
        areTitlesStrictlyEqual(mv.title, [m.title, m.originalTitle, m.altTitle || ''].filter(Boolean))
      );

      if (matchedExisting) {
        if (!matchedExisting.movidyUrl && mv.movidyUrl) {
          matchedExisting.movidyUrl = mv.movidyUrl;
        }
        matchedExisting.languages = ['Castellano', 'Latino', 'VOSE', 'EN'];
        continue;
      }

      if (
        (kFull && seenNormTitles.has(kFull)) ||
        (kOutside && seenNormTitles.has(kOutside))
      ) {
        continue;
      }
      if (kFull) seenNormTitles.add(kFull);
      if (kOutside) seenNormTitles.add(kOutside);
      if (kInside && !/^(?:19|20)\d{2}$/.test(kInside)) seenNormTitles.add(kInside);
      combinedMovies.push(mv);
    }

    // 2B. Expand & enrich with GnulaHD mirror catalog (ww3.gnulahd.nu / gnulahd.click / gnulahd.bid)
    const filteredGnulaMovies = searchQueryForScrapers
      ? gnulaData.items.filter(
          (gn: any) => scoreTitleRelevance(gn.title, gn.originalTitle, searchQueryForScrapers) >= 70
        )
      : gnulaData.items;

    for (const gn of filteredGnulaMovies) {
      const gnYear = /^\d{4}$/.test(String(gn.year || '')) ? Number(gn.year) : 0;
      const existingMatch = combinedMovies.find((m) => {
        if (!areTitlesStrictlyEqual(gn.title, [m.title, m.originalTitle].filter(Boolean))) {
          return false;
        }
        const mYear = /^\d{4}$/.test(String(m.year || '')) ? Number(m.year) : 0;
        return !gnYear || !mYear || Math.abs(gnYear - mYear) <= 1;
      });
      if (existingMatch) {
        if (!existingMatch.gnulaUrl && gn.gnulaUrl) {
          existingMatch.gnulaUrl = gn.gnulaUrl;
        }
        continue;
      }
      const kGn = normalizeTitleForMatch(gn.title);
      if (kGn && seenNormTitles.has(kGn)) continue;
      if (kGn) seenNormTitles.add(kGn);
      combinedMovies.push(gn);
    }

    // 3. Always enrich queries with Movidy-first on-demand search (including English -> Spanish TMDB alt-title translation)
    if (query) {
      const indexedHits = searchIndexedCatalog(searchQueryForScrapers, { mediaType: 'movie', limit: 16 });
      const topExistingScore = combinedMovies.reduce(
        (mx, m) => Math.max(mx, scoreTitleRelevance(m.title, m.originalTitle, searchQueryForScrapers)),
        0
      );
      const topMovieHasMovidy = Boolean(combinedMovies[0]?.movidyUrl);
      const fallbackHits =
        topExistingScore < 240 || !topMovieHasMovidy
          ? await liveOnDemandFallbackSearch(searchQueryForScrapers, 'movie')
          : [];

      for (const extra of [...indexedHits, ...fallbackHits]) {
        if (extra.tmdbId) {
          const existingById = combinedMovies.find((m) => Number(m.tmdbId) === Number(extra.tmdbId));
          if (existingById) {
            if (!existingById.movidyUrl && extra.movidyUrl) existingById.movidyUrl = extra.movidyUrl;
            if (!existingById.gnulaUrl && extra.gnulaUrl) existingById.gnulaUrl = extra.gnulaUrl;
            if (!existingById.altTitle && extra.altTitle) existingById.altTitle = extra.altTitle;
            if (existingById.movidyUrl) {
              existingById.languages = ['Castellano', 'Latino', 'VOSE', 'EN'];
            }
            continue;
          }
        }
        // Skip undated external-only hits whose title already matches an existing TMDB entry
        if (!extra.tmdbId) {
          const existingByTitle = combinedMovies.find((m) =>
            areTitlesStrictlyEqual(extra.title, [m.title, m.originalTitle, m.altTitle || ''].filter(Boolean))
          );
          if (existingByTitle) {
            if (!existingByTitle.movidyUrl && extra.movidyUrl) existingByTitle.movidyUrl = extra.movidyUrl;
            if (!existingByTitle.gnulaUrl && extra.gnulaUrl) existingByTitle.gnulaUrl = extra.gnulaUrl;
            if (existingByTitle.movidyUrl) {
              existingByTitle.languages = ['Castellano', 'Latino', 'VOSE', 'EN'];
            }
            continue;
          }
        }
        if (extra.movidyUrl && combinedMovies.some((m) => m.movidyUrl === extra.movidyUrl)) {
          continue;
        }
        const kEx = normalizeTitleForMatch(extra.title);
        const kExOrig = normalizeTitleForMatch(extra.originalTitle || '');
        if ((kEx && seenNormTitles.has(kEx)) || (kExOrig && seenNormTitles.has(kExOrig))) {
          continue;
        }
        if (kEx) seenNormTitles.add(kEx);
        if (kExOrig) seenNormTitles.add(kExOrig);
        combinedMovies.push(extra);
      }

      // Rank by relevance, prioritizing Movidy-backed matches first within equal relevance tiers
      combinedMovies.sort((a, b) => {
        const sA = scoreTitleRelevance(a.title, a.originalTitle, searchQueryForScrapers, {
          altTitle: a.altTitle,
          popularity: a.popularity,
          voteCount: a.voteCount,
        });
        const sB = scoreTitleRelevance(b.title, b.originalTitle, searchQueryForScrapers, {
          altTitle: b.altTitle,
          popularity: b.popularity,
          voteCount: b.voteCount,
        });
        const diff = sB - sA;
        if (Math.abs(diff) <= 35) {
          const aMov = a.movidyUrl ? 1 : 0;
          const bMov = b.movidyUrl ? 1 : 0;
          if (aMov !== bMov) return bMov - aMov;
        }
        return diff;
      });
    }

    // 4. Attach or append crawled mirror entries (321moviesfree, cuevana4br, flixlat, 123pelicula)
    if (page === 1 || query) {
      const vestEntries = listVestCatalogEntries({ mediaType: 'movie', query: searchQueryForScrapers || query });
      for (const ve of vestEntries) {
        const kVe = normalizeTitleForMatch(ve.title);
        if (ve.tmdbId) {
          const existing = combinedMovies.find((m) => Number(m.tmdbId) === Number(ve.tmdbId));
          if (existing) {
            if (!existing.vestUrl) existing.vestUrl = ve.vestUrl;
            continue;
          }
        }
        if (kVe && seenNormTitles.has(kVe)) continue;
        if (kVe) seenNormTitles.add(kVe);
        combinedMovies.push(ve);
      }
    }

    const hasMore = Boolean(movidyData.hasMore || gnulaData.hasMore || tmdbData.hasMore);
    movieCatalogCache.set(mergedCacheKey, {
      movies: combinedMovies,
      hasMore,
      ts: Date.now(),
    });

    res.json({ success: true, movies: combinedMovies, hasMore, page });
  } catch (err) {
    console.error('Spanish movies catalog error:', err);
    res.status(500).json({ success: false, movies: [], hasMore: false });
  }
});

app.get('/api/catalog/vest', async (req, res) => {
  try {
    const rawUrl = String(req.query.url || '').trim();
    const query = String(req.query.query || '').trim();
    const mediaType =
      req.query.mediaType === 'movie'
        ? 'movie'
        : req.query.mediaType === 'tv'
        ? 'tv'
        : 'all';

    if (rawUrl && isVestMirrorUrl(rawUrl)) {
      const detail = await fetchVestDetailPage(rawUrl);
      return res.json({
        success: Boolean(detail),
        detail,
        items: listVestCatalogEntries({ mediaType, query }),
      });
    }

    return res.json({
      success: true,
      items: listVestCatalogEntries({ mediaType, query }),
    });
  } catch {
    return res.status(500).json({ success: false, items: [] });
  }
});

app.get('/api/catalog/bingetrix', async (req, res) => {
  try {
    const query = String(req.query.query || '').trim();
    const provider = String(req.query.provider || 'all').toLowerCase().trim();
    const category = String(req.query.category || 'trending').toLowerCase();
    const sort = String(req.query.sort || '').toLowerCase();
    const page = Math.max(1, Math.min(100, parseInt(String(req.query.page || '1'), 10) || 1));

    const data = await fetchTmdbMovieCatalog({
      lang: 'en-US',
      category,
      sort,
      page,
      query,
      provider,
    });

    let movies = [...data.movies];

    if (query) {
      const cleanBingQuery = correctCommonSearchTypos(query) || query;
      const indexedHits = searchIndexedCatalog(cleanBingQuery, { mediaType: 'all', limit: 16 });
      const topScore = movies.reduce(
        (mx, m) => Math.max(mx, scoreTitleRelevance(m.title, m.originalTitle, cleanBingQuery)),
        0
      );
      const topHasMovidy = Boolean(movies[0]?.movidyUrl);
      const fallbackHits =
        topScore < 240 || !topHasMovidy
          ? await liveOnDemandFallbackSearch(cleanBingQuery, 'all')
          : [];

      const seenIds = new Set<string>(
        movies.map((m) => `${m.mediaType || 'movie'}:${m.tmdbId || m.id}`)
      );
      for (const extra of [...indexedHits, ...fallbackHits]) {
        const k = `${extra.mediaType}:${extra.tmdbId || extra.id}`;
        if (seenIds.has(k)) {
          const existing = movies.find((m) => `${m.mediaType || 'movie'}:${m.tmdbId || m.id}` === k);
          if (existing) {
            if (!existing.movidyUrl && extra.movidyUrl) existing.movidyUrl = extra.movidyUrl;
            if (!existing.gnulaUrl && extra.gnulaUrl) existing.gnulaUrl = extra.gnulaUrl;
            if (!existing.altTitle && extra.altTitle) existing.altTitle = extra.altTitle;
          }
          continue;
        }
        if (extra.movidyUrl && movies.some((m) => m.movidyUrl === extra.movidyUrl)) {
          continue;
        }
        seenIds.add(k);
        movies.push(extra);
      }

      movies.sort((a, b) => {
        const sA = scoreTitleRelevance(a.title, a.originalTitle, cleanBingQuery, { altTitle: a.altTitle });
        const sB = scoreTitleRelevance(b.title, b.originalTitle, cleanBingQuery, { altTitle: b.altTitle });
        const diff = sB - sA;
        if (Math.abs(diff) <= 35) {
          const aMov = a.movidyUrl ? 1 : 0;
          const bMov = b.movidyUrl ? 1 : 0;
          if (aMov !== bMov) return bMov - aMov;
        }
        return diff;
      });
    }

    res.json({ success: true, movies, hasMore: data.hasMore, page });
  } catch (err) {
    console.error('Bingetrix catalog error:', err);
    res.status(500).json({ success: false, movies: [], hasMore: false });
  }
});

app.get('/api/catalog/refresh-status', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ success: true, ...getCatalogRefreshStatus() });
});

app.post('/api/catalog/refresh', async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const summary = await runRefreshCycle();
  res.json({ success: true, summary, status: getCatalogRefreshStatus() });
});

app.post('/api/ai/request-movie', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const query = String(req.body?.query || '').trim();
  const mediaType =
    req.body?.mediaType === 'movie' || req.body?.mediaType === 'tv'
      ? req.body.mediaType
      : 'all';
  const lang = String(req.body?.lang || 'es').slice(0, 5);
  if (query.length < 2) {
    res.status(400).json({
      success: false,
      error: 'Escribe al menos 2 caracteres para buscar la película.',
    });
    return;
  }
  const job = startAiMovieRequest({ query, mediaType, lang });
  res.status(202).json({ success: true, job });
});

app.get('/api/ai/request-movie/:jobId', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const job = getAiMovieRequestJob(String(req.params.jobId || ''));
  if (!job) {
    res.status(404).json({ success: false, error: 'Solicitud no encontrada o expirada.' });
    return;
  }
  res.json({ success: true, job });
});

// ============================================================================
// REST API: TV SERIES CATALOG + SEASONS & EPISODES EXPLORER
// ============================================================================
const SERIES_GENRE_MAP: Record<string, number> = {
  action: 10759,
  scifi: 10765,
  drama: 18,
  crime: 80,
  comedy: 35,
  animation: 16,
  anime: 16,
  mystery: 9648,
};

const seriesCatalogCache = new LruTtlCache<string, { series: any[]; hasMore: boolean; ts: number }>(
  180,
  15 * 60 * 1000
);
const seriesCatalogStaleCache = new LruTtlCache<string, { series: any[]; hasMore: boolean; ts: number }>(
  180,
  24 * 60 * 60 * 1000
);
const movidyTvTmdbCache = new LruTtlCache<string, any | null>(350, 60 * 60 * 1000);

async function resolveMovidyShowToTmdbSeries(rawItem: {
  title: string;
  movidyUrl: string;
  poster: string;
  verifyShowOnMovidy?: boolean;
}): Promise<any | null> {
  const cacheKey = rawItem.movidyUrl || normalizeTitleForMatch(rawItem.title);
  if (movidyTvTmdbCache.has(cacheKey)) {
    return movidyTvTmdbCache.get(cacheKey) || null;
  }

  try {
    if (rawItem.verifyShowOnMovidy && rawItem.movidyUrl) {
      const checkUrl = normalizeMovidyUrl(rawItem.movidyUrl);
      const pageHtml = await fetchTextWithCurlFallback(
        checkUrl,
        { 'User-Agent': CHROME_UA, Referer: `${MOVIDY_ORIGIN}/` },
        3500
      );
      if (!pageHtml || !pageHtml.includes('id="eps"')) {
        movidyTvTmdbCache.set(cacheKey, null);
        return null;
      }
    }

    const cleanTitle = String(rawItem.title || '').replace(/\s*\([^)]*\)/g, '').trim();
    const parenTitle = (String(rawItem.title || '').match(/\(([^)]+)\)/)?.[1] || '').trim();
    const candidates = [cleanTitle, parenTitle].filter((c) => c.length >= 2);

    let bestMatch: any = null;
    for (const q of candidates) {
      const tJson = await fetchTmdbJson<any>(
        '/search/tv',
        { language: 'es-ES', query: q, page: 1, include_adult: false },
        15 * 60 * 1000
      ).catch(() => null);
      const results: any[] = Array.isArray(tJson?.results) ? tJson.results : [];
      if (results.length === 0) continue;

      bestMatch =
        results.find(
          (r) =>
            areTitlesStrictlyEqual(String(r.name || ''), [q]) ||
            areTitlesStrictlyEqual(String(r.original_name || ''), [q])
        ) || null;
      if (bestMatch) break;
    }

    if (!bestMatch?.id) {
      movidyTvTmdbCache.set(cacheKey, null);
      return null;
    }

    const resolved = {
      id: `tv-es-ES-${bestMatch.id}`,
      tmdbId: bestMatch.id,
      mediaType: 'tv',
      title: bestMatch.name || rawItem.title || bestMatch.original_name || 'Serie',
      originalTitle: bestMatch.original_name || bestMatch.name || rawItem.title || '',
      year: bestMatch.first_air_date
        ? String(bestMatch.first_air_date).split('-')[0]
        : 'TV',
      rating: bestMatch.vote_average ? Number(bestMatch.vote_average).toFixed(1) : '',
      overview:
        bestMatch.overview ||
        'Serie disponible en Castellano, Español Latino y VOSE por temporadas y episodios en HD.',
      poster: bestMatch.poster_path
        ? `https://image.tmdb.org/t/p/w500${bestMatch.poster_path}`
        : rawItem.poster,
      backdrop: bestMatch.backdrop_path
        ? `https://image.tmdb.org/t/p/w1280${bestMatch.backdrop_path}`
        : rawItem.poster,
      movidyUrl: rawItem.movidyUrl,
      languages: ['Español', 'VOSE'],
    };

    movidyTvTmdbCache.set(cacheKey, resolved);
    return resolved;
  } catch {
    movidyTvTmdbCache.set(cacheKey, null);
    return null;
  }
}

async function scrapeMovidySeriesCatalog(opts: {
  category: string;
  page: number;
  query: string;
}): Promise<{ series: any[]; hasMore: boolean }> {
  const { category, page, query } = opts;
  if (!query && category !== 'trending' && category !== 'popular') {
    return { series: [], hasMore: false };
  }

  try {
    const targetUrl = query
      ? page > 1
        ? `${MOVIDY_ORIGIN}/page/${page}/?s=${encodeURIComponent(query)}`
        : `${MOVIDY_ORIGIN}/?s=${encodeURIComponent(query)}`
      : page > 1
      ? `${MOVIDY_ORIGIN}/shows/page/${page}`
      : `${MOVIDY_ORIGIN}/shows/`;

    const html = await fetchTextWithCurlFallback(
      targetUrl,
      { 'User-Agent': CHROME_UA, Referer: `${MOVIDY_ORIGIN}/` },
      4800
    );

    if (!html) return { series: [], hasMore: false };

    const itemRe =
      /<li>\s*<a\s+href="((?:https?:\/\/movidy\.[a-z]+)?\/ver\/[^"]+)"[^>]*>\s*<h3\s+class="item-title">\s*<span>([^<]+)<\/span>\s*<\/h3>\s*<img[^>]+data-src="([^"]+)"/gi;
    const rawItems: {
      title: string;
      movidyUrl: string;
      poster: string;
      verifyShowOnMovidy: boolean;
    }[] = [];

    const maxItems = query ? 6 : 18;
    let m: RegExpExecArray | null;
    while ((m = itemRe.exec(html)) !== null && rawItems.length < maxItems) {
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

      rawItems.push({
        title: rawTitle,
        movidyUrl,
        poster: proxiedPoster,
        verifyShowOnMovidy: Boolean(query),
      });
    }

    const resolvedList = await Promise.all(
      rawItems.map((it) => resolveMovidyShowToTmdbSeries(it))
    );
    const series = resolvedList.filter(Boolean);
    const hasNextPage = html.includes(`/page/${page + 1}`);
    return { series, hasMore: hasNextPage && series.length > 0 };
  } catch (err) {
    console.warn('scrapeMovidySeriesCatalog error:', err);
    return { series: [], hasMore: false };
  }
}

app.get('/api/catalog/series', async (req, res) => {
  try {
    const rawQuery = String(req.query.query || '').trim();
    const rawProvider = String(req.query.provider || 'all').toLowerCase().trim();
    const { provider, query } = resolveEffectiveProviderAndQuery(rawProvider, rawQuery);
    const provCfg = STREAMING_PROVIDER_MAP[provider];
    const isAnime = ANIME_PROVIDER_IDS.has(provider);
    const category = String(req.query.category || 'trending').toLowerCase();
    const sort = String(req.query.sort || '').toLowerCase();
    const langParam = String(req.query.lang || 'es').toLowerCase() === 'en' ? 'en-US' : 'es-ES';
    const isSpanishCatalog = langParam === 'es-ES';
    const page = Math.max(1, Math.min(100, parseInt(String(req.query.page || '1'), 10) || 1));

    const cacheKey = `v9|${langParam}|${provider}|${category}|${sort}|${page}|${query}`;
    const cached = seriesCatalogCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < 5 * 60 * 1000) {
      return res.json({ success: true, series: cached.series, hasMore: cached.hasMore, page });
    }

    const todayIso = new Date().toISOString().slice(0, 10);
    const recentSimulcastIso = new Date(Date.now() - 75 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    let endpoint = '';
    let originalsBoostEndpoint = '';
    let curatedAnimeSeedPromise: Promise<any[]> = Promise.resolve([]);

    const ANIME_SERIES_GENRES: Record<string, string> = {
      shonen: '16,10759',
      action: '16,10759',
      fantasy: '16,10765',
      scifi: '16,10765',
      comedy: '16,35',
      drama: '16,18',
      mystery: '16,9648',
    };

    if (query) {
      const matchedMasterpieceIds = matchMasterpieceAnimeIds(query);
      if (matchedMasterpieceIds.length > 0) {
        curatedAnimeSeedPromise = fetchTmdbItemsByIds(matchedMasterpieceIds, 'tv', langParam);
      }
      endpoint = `https://api.themoviedb.org/3/search/tv?api_key=${TMDB_API_KEY}&language=${langParam}&query=${encodeURIComponent(query)}&page=${page}&include_adult=false`;
    } else if (isAnime) {
      if (page === 1 && (category === 'trending' || category === 'popular' || category === 'shonen')) {
        curatedAnimeSeedPromise = fetchTmdbItemsByIds(
          provider === 'animebox'
            ? [...USER_MASTERPIECE_ANIME_TV_IDS, ...ANIMEBOX_CURATED_TV_IDS]
            : USER_MASTERPIECE_ANIME_TV_IDS,
          'tv',
          langParam
        );
      }
      const animeGenreStr = ANIME_SERIES_GENRES[category] || '16';
      const isSimulcastMode =
        category === 'simulcast' || (provider === 'jkanime' && category === 'trending');
      const sortBy =
        category === 'top_rated'
          ? 'vote_average.desc'
          : provider === 'animeflv' && category === 'trending'
          ? 'vote_count.desc'
          : 'popularity.desc';
      const minVotes = category === 'top_rated' ? 200 : isSimulcastMode ? 8 : 30;
      const simulcastFilter = isSimulcastMode
        ? `&air_date.gte=${recentSimulcastIso}&air_date.lte=${todayIso}`
        : `&first_air_date.lte=${todayIso}`;

      if (provider === 'crunchyroll') {
        endpoint = `https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_API_KEY}&language=${langParam}&watch_region=US&with_watch_providers=${encodeURIComponent(
          '283|1968'
        )}&with_watch_monetization_types=${encodeURIComponent(
          'flatrate|ads|free'
        )}&with_genres=${animeGenreStr}&with_origin_country=JP&sort_by=${sortBy}&vote_count.gte=${minVotes}${simulcastFilter}&page=${page}&include_adult=false`;

        if (page === 1 && category === 'trending') {
          originalsBoostEndpoint = `https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_API_KEY}&language=${langParam}&watch_region=ES&with_watch_providers=${encodeURIComponent(
            '283|1968'
          )}&with_watch_monetization_types=${encodeURIComponent(
            'flatrate|ads|free'
          )}&with_genres=16&with_origin_country=JP&sort_by=popularity.desc&vote_count.gte=25&page=1&include_adult=false`;
        }
      } else if (provider === 'animebox') {
        // Check Spain AnimeBox provider 2735 on page 1 boost + Japanese Anime in Spain
        if (page === 1) {
          originalsBoostEndpoint = `https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_API_KEY}&language=${langParam}&watch_region=ES&with_watch_providers=2735&with_watch_monetization_types=${encodeURIComponent(
            'flatrate|ads|free'
          )}&sort_by=popularity.desc&page=1&include_adult=false`;
        }
        endpoint = `https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_API_KEY}&language=${langParam}&watch_region=ES&with_genres=${animeGenreStr}&with_origin_country=JP&sort_by=${sortBy}&vote_count.gte=${minVotes}${simulcastFilter}&page=${page}&include_adult=false`;
      } else if (provider === 'jkanime') {
        // JKAnime: En Emisión (Simulcasts) + Popular Japanese Anime Directory
        if (page === 1 && category === 'trending') {
          originalsBoostEndpoint = `https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_API_KEY}&language=${langParam}&with_genres=16&with_origin_country=JP&air_date.gte=${recentSimulcastIso}&air_date.lte=${todayIso}&sort_by=popularity.desc&vote_count.gte=10&page=1&include_adult=false`;
        }
        endpoint = `https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_API_KEY}&language=${langParam}&with_genres=${animeGenreStr}&with_origin_country=JP&sort_by=${sortBy}&vote_count.gte=${minVotes}${simulcastFilter}&page=${page}&include_adult=false`;
      } else if (provider === 'animeflv') {
        // AnimeFLV: Latest seasonal premieres + All-Time Most Watched AnimeFLV legends
        if (page === 1 && category === 'trending') {
          originalsBoostEndpoint = `https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_API_KEY}&language=${langParam}&with_genres=16&with_origin_country=JP&air_date.gte=${recentSimulcastIso}&air_date.lte=${todayIso}&sort_by=vote_count.desc&vote_count.gte=15&page=1&include_adult=false`;
        }
        endpoint = `https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_API_KEY}&language=${langParam}&with_genres=${animeGenreStr}&with_origin_country=JP&sort_by=${sortBy}&vote_count.gte=${minVotes}${simulcastFilter}&page=${page}&include_adult=false`;
      } else {
        // anime_all
        endpoint = `https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_API_KEY}&language=${langParam}&with_genres=${animeGenreStr}&with_origin_country=JP&sort_by=${sortBy}&vote_count.gte=${minVotes}${simulcastFilter}&page=${page}&include_adult=false`;
      }
    } else if (provCfg) {
      const sortBy = category === 'top_rated' ? 'vote_average.desc' : 'popularity.desc';
      const minVotes = category === 'top_rated' ? 250 : 80;
      const genreParam = SERIES_GENRE_MAP[category] ? `&with_genres=${SERIES_GENRE_MAP[category]}` : '';

      if (category === 'originals') {
        endpoint = `https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_API_KEY}&language=${langParam}&with_networks=${encodeURIComponent(
          provCfg.tvNetworks
        )}&sort_by=${sortBy}&vote_count.gte=${minVotes}&first_air_date.lte=${todayIso}&without_genres=10767,10763,10764${genreParam}&page=${page}&include_adult=false`;
      } else {
        endpoint = `https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_API_KEY}&language=${langParam}&watch_region=ES&with_watch_providers=${encodeURIComponent(
          provCfg.watchProviders
        )}&with_watch_monetization_types=${encodeURIComponent(
          'flatrate|ads|free'
        )}&sort_by=${sortBy}&vote_count.gte=${minVotes}&first_air_date.lte=${todayIso}&without_genres=10767,10763,10764${genreParam}&page=${page}&include_adult=false`;

        // On page 1 of Tendencias for a selected platform, lead with iconic flagship Originals
        if (page === 1 && category === 'trending') {
          originalsBoostEndpoint = `https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_API_KEY}&language=${langParam}&with_networks=${encodeURIComponent(
            provCfg.tvNetworks
          )}&sort_by=vote_count.desc&vote_count.gte=400&first_air_date.lte=${todayIso}&without_genres=10767,10763,10764&page=1&include_adult=false`;
        }
      }
    } else if (category === 'anime') {
      const discoverSort =
        sort === 'top_rated'
          ? 'vote_average.desc'
          : sort === 'now_playing'
          ? 'first_air_date.desc'
          : 'popularity.desc';
      const minVotes = sort === 'top_rated' ? 140 : 30;
      endpoint = `https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_API_KEY}&language=${langParam}&sort_by=${discoverSort}&vote_count.gte=${minVotes}&first_air_date.lte=${todayIso}&with_genres=16&with_origin_country=JP&page=${page}&include_adult=false`;
    } else if (SERIES_GENRE_MAP[category]) {
      const discoverSort =
        sort === 'top_rated'
          ? 'vote_average.desc'
          : sort === 'now_playing'
          ? 'first_air_date.desc'
          : 'popularity.desc';
      const minVotes = sort === 'top_rated' ? 180 : 40;
      endpoint = `https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_API_KEY}&language=${langParam}&sort_by=${discoverSort}&vote_count.gte=${minVotes}&without_genres=10767,10763&with_genres=${SERIES_GENRE_MAP[category]}&page=${page}`;
    } else if (category === '4k' || sort === '4k') {
      if (page === 1) {
        curatedAnimeSeedPromise = fetchTmdbItemsByIds(CURATED_4K_SERIES_IDS, 'tv', langParam);
      }
      endpoint = `https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_API_KEY}&language=${langParam}&sort_by=vote_count.desc&vote_count.gte=800&vote_average.gte=7.5&first_air_date.gte=2008-01-01&page=${page}&include_adult=false`;
    } else if (category === 'popular' || (!category && sort === 'popular')) {
      endpoint = `https://api.themoviedb.org/3/tv/popular?api_key=${TMDB_API_KEY}&language=${langParam}&page=${page}`;
    } else if (category === 'top_rated' || (!category && sort === 'top_rated')) {
      endpoint = `https://api.themoviedb.org/3/tv/top_rated?api_key=${TMDB_API_KEY}&language=${langParam}&page=${page}`;
    } else if (category === 'now_playing' || (!category && sort === 'now_playing')) {
      endpoint = `https://api.themoviedb.org/3/tv/on_the_air?api_key=${TMDB_API_KEY}&language=${langParam}&page=${page}`;
    } else {
      endpoint = `https://api.themoviedb.org/3/trending/tv/week?api_key=${TMDB_API_KEY}&language=${langParam}&page=${page}`;
    }

    const mapTmdbSeriesItem = (s: any) => {
      const is4k = category === '4k' || sort === '4k' || CURATED_4K_SERIES_SET.has(Number(s.id));
      return {
        id: `tv-${langParam}-${provider}-${s.id}`,
        tmdbId: s.id,
        mediaType: 'tv' as const,
        is4k,
        quality: is4k ? '4K UHD' : 'HD',
        title: s.name || s.original_name || 'Serie',
      originalTitle: s.original_name || s.name || '',
      year: s.first_air_date ? String(s.first_air_date).split('-')[0] : 'TV',
      rating: s.vote_average ? Number(s.vote_average).toFixed(1) : '',
      overview:
        s.overview ||
        (isAnime
          ? 'Anime disponible por temporadas y capítulos en Español, Latino y VOSE (Sub Español) 1080p.'
          : isSpanishCatalog
          ? 'Serie disponible en Español (Castellano / Latino) y VO Inglés 1080p.'
          : 'Full TV series available in Original English 1080p & Spanish.'),
      poster: s.poster_path ? `https://image.tmdb.org/t/p/w500${s.poster_path}` : '',
      backdrop: s.backdrop_path ? `https://image.tmdb.org/t/p/w1280${s.backdrop_path}` : '',
      languages: isAnime
        ? ['Español', 'VOSE · Sub', 'EN']
        : isSpanishCatalog
        ? ['Español', 'VOSE · EN']
        : ['English 1080p', 'Español'],
      platform: provCfg?.label,
      providerId: provCfg ? provider : undefined,
      genres: mapTmdbGenreLabels(s, langParam),
      seasonsCount: typeof s.number_of_seasons === 'number' ? s.number_of_seasons : undefined,
    };
  };

    const scrapeMovidySeriesFast = () => {
      if (!isSpanishCatalog || provCfg || isAnime) {
        return Promise.resolve({ series: [], hasMore: false });
      }
      const p = scrapeMovidySeriesCatalog({ category, page, query }).catch(() => ({
        series: [],
        hasMore: false,
      }));
      return Promise.race([
        p,
        new Promise<{ series: any[]; hasMore: boolean }>((resolve) =>
          setTimeout(() => resolve({ series: [], hasMore: false }), query ? 1600 : 2200)
        ),
      ]);
    };

    const scrapeGnulaSeriesFast = () => {
      if (!isSpanishCatalog || provCfg || isAnime) {
        return Promise.resolve({ items: [] as any[], hasMore: false });
      }
      const p = scrapeGnulaCatalog({ category, page, query, mediaType: 'tv' }).catch(() => ({
        items: [],
        hasMore: false,
      }));
      return Promise.race([
        p,
        new Promise<{ items: any[]; hasMore: boolean }>((resolve) =>
          setTimeout(() => resolve({ items: [], hasMore: false }), query ? 1800 : 2600)
        ),
      ]);
    };

    const [movidySeriesData, gnulaSeriesData, curatedAnimeRaw, oJson, json] = await Promise.all([
      scrapeMovidySeriesFast(),
      scrapeGnulaSeriesFast(),
      curatedAnimeSeedPromise.catch(() => []),
      originalsBoostEndpoint
        ? fetchTmdbUrlJson<any>(originalsBoostEndpoint, 5 * 60 * 1000).catch(() => null)
        : Promise.resolve(null),
      fetchTmdbUrlJson<any>(endpoint, 5 * 60 * 1000).catch(() => null),
    ]);

    const curatedLead = curatedAnimeRaw.map(mapTmdbSeriesItem);

    let originalsLead: any[] = [];
    if (oJson) {
      const oResults: any[] = Array.isArray(oJson?.results) ? oJson.results : [];
      originalsLead = oResults
        .filter((s) => s && s.id && (s.poster_path || s.backdrop_path))
        .slice(0, 12)
        .map(mapTmdbSeriesItem);
    }

    let tmdbSeries: any[] = [];
    let totalPages = 1;

    if (json) {
      let results: any[] = Array.isArray(json?.results) ? json.results : [];
      totalPages = Number(json?.total_pages || 1);

      if (query && page === 1) {
        const compactQ = normalizeNoSpaceForSearch(query);
        const hasStrongExactMatch = results.some(
          (s) =>
            (normalizeNoSpaceForSearch(s?.name || '') === compactQ ||
              normalizeNoSpaceForSearch(s?.original_name || '') === compactQ) &&
            Number(s?.vote_count || 0) >= 60
        );
        if (!hasStrongExactMatch) {
          const variants = buildSmartConcatQueryVariants(query);
          if (variants.length > 0) {
            const extraLists = await Promise.all(
              variants.map(async (vq) => {
                const ej = await fetchTmdbJson<any>(
                  '/search/tv',
                  { language: langParam, query: vq, page: 1, include_adult: false },
                  5 * 60 * 1000
                ).catch(() => null);
                return Array.isArray(ej?.results) ? ej.results : [];
              })
            );
            const flatExtra = extraLists.flat();
            if (flatExtra.length > 0) {
              const seenExtra = new Set<number>();
              const deduped: any[] = [];
              for (const item of [...results, ...flatExtra]) {
                if (item?.id && !seenExtra.has(item.id)) {
                  seenExtra.add(item.id);
                  deduped.push(item);
                }
              }
              results = rankTmdbSearchResultsForQuery(deduped, query, true);
            }
          }
        }
      }

      tmdbSeries = results
        .filter((s) => {
          if (!s || !s.id || (!s.poster_path && !s.backdrop_path)) return false;
          if (isAnime && query) {
            const gIds: number[] = Array.isArray(s.genre_ids) ? s.genre_ids : [];
            const origCountries: string[] = Array.isArray(s.origin_country)
              ? s.origin_country
              : [];
            const isJa =
              String(s.original_language || '').toLowerCase() === 'ja' ||
              origCountries.includes('JP');
            if (!gIds.includes(16) && !isJa) return false;
          }
          if (isSpanishCatalog && !query && !isAnime && Array.isArray(s.genre_ids)) {
            if (s.genre_ids.includes(10767) || s.genre_ids.includes(10763)) {
              return false;
            }
          }
          return true;
        })
        .map(mapTmdbSeriesItem);
    }

    const seenTmdbIds = new Set<number>();
    const combinedSeries: any[] = [];

    for (const cs of curatedLead) {
      if (cs?.tmdbId && !seenTmdbIds.has(cs.tmdbId)) {
        seenTmdbIds.add(cs.tmdbId);
        combinedSeries.push(cs);
      }
    }

    const filteredMovidySeries = query
      ? movidySeriesData.series.filter(
          (ms: any) => scoreTitleRelevance(ms.title, ms.originalTitle, query) >= 70
        )
      : movidySeriesData.series;

    for (const ms of filteredMovidySeries) {
      if (!ms?.tmdbId) continue;
      if (seenTmdbIds.has(ms.tmdbId)) {
        const existing = combinedSeries.find((s) => Number(s.tmdbId) === Number(ms.tmdbId));
        if (existing && !existing.movidyUrl && ms.movidyUrl) {
          existing.movidyUrl = ms.movidyUrl;
          existing.languages = ['Castellano', 'Latino', 'VOSE', 'EN'];
        }
        continue;
      }
      seenTmdbIds.add(ms.tmdbId);
      combinedSeries.push(ms);
    }

    for (const orig of originalsLead) {
      if (orig?.tmdbId && !seenTmdbIds.has(orig.tmdbId)) {
        seenTmdbIds.add(orig.tmdbId);
        combinedSeries.push(orig);
      }
    }

    for (const ts of tmdbSeries) {
      if (ts?.tmdbId && !seenTmdbIds.has(ts.tmdbId)) {
        seenTmdbIds.add(ts.tmdbId);
        combinedSeries.push(ts);
      }
    }

    // Attach or append GnulaHD series across mirrors (ww3.gnulahd.nu / gnulahd.click / gnulahd.bid)
    const filteredGnulaSeries = query
      ? gnulaSeriesData.items.filter(
          (gs: any) => scoreTitleRelevance(gs.title, gs.originalTitle, query) >= 70
        )
      : gnulaSeriesData.items;

    const seenGnulaSeriesUrls = new Set<string>();
    for (const gs of filteredGnulaSeries) {
      if (gs?.mediaType && gs.mediaType !== 'tv') continue;
      const normUrl = gs?.gnulaUrl ? normalizeGnulaUrl(gs.gnulaUrl) : '';
      if (normUrl && seenGnulaSeriesUrls.has(normUrl)) continue;
      if (normUrl) seenGnulaSeriesUrls.add(normUrl);
      const existing = combinedSeries.find((s) =>
        areTitlesStrictlyEqual(gs.title, [s.title, s.originalTitle].filter(Boolean))
      );
      if (existing) {
        if (!existing.gnulaUrl && gs.gnulaUrl) {
          existing.gnulaUrl = gs.gnulaUrl;
        }
        continue;
      }
      combinedSeries.push(gs);
    }

    // Merge indexed & live on-demand TV series fallback matches (Movidy first) when querying
    if (query) {
      const cleanSeriesQ = correctCommonSearchTypos(query) || query;
      const indexedTv = searchIndexedCatalog(cleanSeriesQ, { mediaType: 'tv', limit: 16 });
      const topScore = combinedSeries.reduce(
        (mx, s) => Math.max(mx, scoreTitleRelevance(s.title, s.originalTitle, cleanSeriesQ)),
        0
      );
      const topSeriesHasMovidy = Boolean(combinedSeries[0]?.movidyUrl);
      const fallbackTv =
        topScore < 240 || !topSeriesHasMovidy
          ? await liveOnDemandFallbackSearch(cleanSeriesQ, 'tv').catch(() => [])
          : [];

      for (const extra of [...indexedTv, ...fallbackTv]) {
        if (extra.tmdbId) {
          const existingById = combinedSeries.find((s) => Number(s.tmdbId) === Number(extra.tmdbId));
          if (existingById) {
            if (!existingById.movidyUrl && extra.movidyUrl) existingById.movidyUrl = extra.movidyUrl;
            if (!existingById.gnulaUrl && extra.gnulaUrl) existingById.gnulaUrl = extra.gnulaUrl;
            if (!existingById.altTitle && extra.altTitle) existingById.altTitle = extra.altTitle;
            continue;
          }
          seenTmdbIds.add(extra.tmdbId);
        }
        if (extra.movidyUrl && combinedSeries.some((s) => s.movidyUrl === extra.movidyUrl)) {
          continue;
        }
        combinedSeries.push(extra);
      }

      combinedSeries.sort((a, b) => {
        const sA = scoreTitleRelevance(a.title, a.originalTitle, cleanSeriesQ, { altTitle: a.altTitle });
        const sB = scoreTitleRelevance(b.title, b.originalTitle, cleanSeriesQ, { altTitle: b.altTitle });
        const diff = sB - sA;
        if (Math.abs(diff) <= 35) {
          const aMov = a.movidyUrl ? 1 : 0;
          const bMov = b.movidyUrl ? 1 : 0;
          if (aMov !== bMov) return bMov - aMov;
        }
        return diff;
      });
    }

    // Attach or append Vest mirror TV entries (321moviesfree, cuevana4br, flixlat, 123pelicula)
    if (page === 1 || query) {
      const vestSeries = listVestCatalogEntries({ mediaType: 'tv', query });
      for (const vs of vestSeries) {
        if (vs.tmdbId) {
          const existing = combinedSeries.find((s) => Number(s.tmdbId) === Number(vs.tmdbId));
          if (existing) {
            if (!existing.vestUrl) existing.vestUrl = vs.vestUrl;
            continue;
          }
          seenTmdbIds.add(vs.tmdbId);
        } else {
          const kVs = normalizeTitleForMatch(vs.title);
          if (combinedSeries.some((s) => normalizeTitleForMatch(s.title) === kVs)) continue;
        }
        combinedSeries.push(vs);
      }
    }

    if (combinedSeries.length === 0) {
      const stale = seriesCatalogStaleCache.get(cacheKey);
      if (stale && stale.series.length > 0) {
        return res.json({ success: true, series: stale.series, hasMore: stale.hasMore, page });
      }
      const indexedFallback = searchIndexedCatalog(query || 'serie', { mediaType: 'tv', limit: 24 });
      if (indexedFallback.length > 0) {
        return res.json({ success: true, series: indexedFallback, hasMore: false, page });
      }
    }

    const hasMore =
      Boolean(movidySeriesData.hasMore || gnulaSeriesData.hasMore) ||
      (page < totalPages && tmdbSeries.length > 0);
    if (combinedSeries.length > 0) {
      const entry = { series: combinedSeries, hasMore, ts: Date.now() };
      seriesCatalogCache.set(cacheKey, entry);
      seriesCatalogStaleCache.set(cacheKey, entry);
    }
    res.json({ success: true, series: combinedSeries, hasMore, page });
  } catch (err) {
    logger.warn({ err }, 'series_catalog_error_degraded');
    const rawQuery = String(req.query.query || '').trim();
    const vestFallback = listVestCatalogEntries({ mediaType: 'tv', query: rawQuery });
    res.json({ success: true, series: vestFallback, hasMore: false, page: 1 });
  }
});

const tvDetailsFastCache = new LruTtlCache<string, { details: any; ts: number }>(350, 20 * 60 * 1000);
const tvLangProbeCache = new LruTtlCache<
  string,
  { availableLanguages: ('ES' | 'LAT' | 'VOSE' | 'EN')[]; ts: number }
>(400, 30 * 60 * 1000);

app.get('/api/catalog/tv/:tmdbId', async (req, res) => {
  try {
    const cleanId = String(req.params.tmdbId || '').replace(/\D/g, '');
    if (!cleanId) return res.status(400).json({ success: false });

    const requestedSeason = Math.max(1, parseInt(String(req.query.season || '1'), 10) || 1);
    const isEn = String(req.query.lang || 'es').toLowerCase() === 'en';
    const force = String(req.query.force || req.query.forceSpanish || '') === '1';
    const langParam = isEn ? 'en-US' : 'es-ES';
    const cacheKey = `${cleanId}:${requestedSeason}:${langParam}`;

    const cached = !force ? tvDetailsFastCache.get(cacheKey) : undefined;
    if (cached && Date.now() - cached.ts < 15 * 60 * 1000) {
      const cachedLangs = tvLangProbeCache.get(`v2|${cleanId}:${cached.details.activeSeason}:1`);
      return res.json({
        success: true,
        details: {
          ...cached.details,
          ...(cachedLangs ? { availableLanguages: cachedLangs.availableLanguages } : {}),
        },
      });
    }

    const showJson = await fetchTmdbJson<any>(
      `/tv/${cleanId}`,
      { language: langParam },
      15 * 60 * 1000
    ).catch(() => null);

    if (!showJson) return res.status(404).json({ success: false });

    const baseSeasons = (Array.isArray(showJson?.seasons) ? showJson.seasons : [])
      .filter(
        (s: any) =>
          s &&
          typeof s.season_number === 'number' &&
          s.season_number >= 1 &&
          (Number(s.episode_count) > 0 || s.season_number === 1)
      )
      .sort((a: any, b: any) => a.season_number - b.season_number)
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

    // Special virtual season splitting for Jujutsu Kaisen (95479) where TMDB groups T1 + T2 + T3 into Season 1
    const isJjkSplit =
      cleanId === '95479' &&
      baseSeasons.length === 1 &&
      (baseSeasons[0]?.episodeCount || 0) >= 48;

    // Special Season 4 guarantee for From (124364) available on 321MoviesFree / DramasFree
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
    res.json({
      success: true,
      details: {
        ...detailsPayload,
        ...(cachedLangs ? { availableLanguages: cachedLangs.availableLanguages } : {}),
      },
    });
  } catch (err) {
    console.error('TV details error:', err);
    res.status(500).json({ success: false });
  }
});

app.get('/api/catalog/tv/:tmdbId/languages', async (req, res) => {
  try {
    const cleanId = String(req.params.tmdbId || '').replace(/\D/g, '');
    if (!cleanId) return res.status(400).json({ success: false, availableLanguages: [] });

    const seasonNum = Math.max(1, parseInt(String(req.query.season || '1'), 10) || 1);
    const episodeNum = Math.max(1, parseInt(String(req.query.episode || '1'), 10) || 1);
    const force = String(req.query.force || req.query.forceSpanish || '') === '1';
    const cacheKey = `v2|${cleanId}:${seasonNum}:${episodeNum}`;

    const cached = !force ? tvLangProbeCache.get(cacheKey) : undefined;
    if (cached && cached.availableLanguages.length > 0 && Date.now() - cached.ts < 15 * 60 * 1000) {
      return res.json({ success: true, availableLanguages: cached.availableLanguages });
    }

    const titleHint = String(req.query.title || '').trim();
    const origTitleHint = String(req.query.origTitle || '').trim();
    const gnulaUrlHint = String(req.query.gnulaUrl || '').trim();
    let hints = [titleHint, origTitleHint].filter(Boolean);
    let imdbId: string | null = null;
    let yearHint = '';
    let isReleasedShow = false;

    const showRes = await fetch(
      `https://api.themoviedb.org/3/tv/${cleanId}?api_key=${TMDB_API_KEY}&language=es-ES&append_to_response=external_ids,translations,alternative_titles`,
      { signal: AbortSignal.timeout(3500) }
    ).catch(() => null);
    if (showRes?.ok) {
      const showJson: any = await showRes.json();
      imdbId = showJson?.external_ids?.imdb_id || null;
      const firstAirDate = String(showJson?.first_air_date || '').trim();
      yearHint = firstAirDate.split('-')[0] || '';
      const todayIso = new Date().toISOString().slice(0, 10);
      const tvStatus = String(showJson?.status || '').trim();
      isReleasedShow =
        !/^(Planned|In Production|Rumored)$/i.test(tvStatus) &&
        (!firstAirDate || firstAirDate <= todayIso);

      hints = Array.from(
        new Set([...hints, ...extractLocalizedTmdbTitleHints(showJson)].filter(Boolean))
      );
    }

    const probedLanguages = await probeAvailableLanguages({
      tmdbId: cleanId,
      imdbId,
      mediaType: 'tv',
      season: seasonNum,
      episode: episodeNum,
      titleHints: hints,
      gnulaUrl: gnulaUrlHint || undefined,
      yearHint: yearHint || undefined,
      force,
    });

    const availableLanguages: ('ES' | 'LAT' | 'VOSE' | 'EN')[] =
      probedLanguages.length > 0 ? probedLanguages : isReleasedShow ? ['ES', 'EN'] : [];

    // Only cache positive probes that found authentic tracks (never lock cache onto temporary fallback)
    if (probedLanguages.length > 0) {
      tvLangProbeCache.set(cacheKey, { availableLanguages: probedLanguages, ts: Date.now() });
    }
    res.json({ success: true, availableLanguages });
  } catch {
    res.json({ success: false, availableLanguages: [] });
  }
});

// ============================================================================
// REST API: UNIVERSAL STREAM DECOMPILER (/api/extract/stream)
// ============================================================================

function extractLocalizedTmdbTitleHints(tmJson: any): string[] {
  if (!tmJson || typeof tmJson !== 'object') return [];
  const esRegions = new Set(['ES', 'MX', 'AR', 'CO', 'CL', 'PE', 'VE', 'UY', '419']);
  const enRegions = new Set(['US', 'GB', 'AU', 'CA']);

  const esTitles: string[] = [];
  const esAltTitles: string[] = [];
  const enTitles: string[] = [];
  const otherTitles: string[] = [];

  const primary = String(tmJson?.title || tmJson?.name || '').trim();
  const orig = String(tmJson?.original_title || tmJson?.original_name || '').trim();

  const translations: any[] = Array.isArray(tmJson?.translations?.translations)
    ? tmJson.translations.translations
    : [];
  for (const tr of translations) {
    const trName = String(tr?.data?.title || tr?.data?.name || '').trim();
    if (!trName) continue;
    const langCode = String(tr?.iso_639_1 || '').toLowerCase();
    const countryCode = String(tr?.iso_3166_1 || '').toUpperCase();
    if (langCode === 'es') {
      if (countryCode === 'ES') esTitles.unshift(trName);
      else esTitles.push(trName);
    } else if (langCode === 'en' || enRegions.has(countryCode)) {
      enTitles.push(trName);
    } else {
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
    } else if (enRegions.has(countryCode)) {
      enTitles.push(altTitle);
    } else {
      otherTitles.push(altTitle);
    }
  }

  const ordered =
    esTitles.length > 0 && primary && orig && normalizeTitleForMatch(primary) === normalizeTitleForMatch(orig)
      ? [...esTitles, primary, ...esAltTitles, orig, ...enTitles, ...otherTitles]
      : [primary, ...esTitles, ...esAltTitles, orig, ...enTitles, ...otherTitles];

  return Array.from(new Set(ordered.filter(Boolean)));
}

async function resolveTmdbIdByTitle(
  title: string,
  mediaType: 'movie' | 'tv',
  expectedYear?: string
): Promise<number | null> {
  try {
    const rawStr = String(title || '').trim();
    const clean = rawStr.replace(/\s*\([^)]*\)/g, '').trim();
    const parenYear = rawStr.match(/\(((?:19|20)\d{2})\)/)?.[1] || '';
    if (!clean || normalizeTitleForMatch(clean).length < 2) return null;

    const yearHint = expectedYear && /^(?:19|20)\d{2}$/.test(expectedYear.trim())
      ? expectedYear.trim()
      : parenYear;
    const yearNum = yearHint ? Number(yearHint) : 0;

    const matchesTitle = (r: any): boolean => {
      const rTitle = String(r?.title || r?.name || '').trim();
      const rOrig = String(r?.original_title || r?.original_name || '').trim();
      return (
        areTitlesStrictlyEqual(rawStr, [rTitle, rOrig].filter(Boolean)) ||
        areTitlesStrictlyEqual(clean, [rTitle, rOrig].filter(Boolean))
      );
    };

    const pickFromResults = (results: any[]): number | null => {
      if (results.length === 0) return null;
      if (yearNum > 0) {
        const exactYearHit = results.find(
          (r) =>
            matchesTitle(r) &&
            Number(String(r?.release_date || r?.first_air_date || '').split('-')[0]) === yearNum
        );
        if (exactYearHit?.id) return Number(exactYearHit.id);
        const adjacentYearHit = results.find((r) => {
          if (!matchesTitle(r)) return false;
          const ry = Number(String(r?.release_date || r?.first_air_date || '').split('-')[0]);
          return ry > 1900 && Math.abs(ry - yearNum) <= 1;
        });
        return adjacentYearHit?.id ? Number(adjacentYearHit.id) : null;
      }
      const exactTitleHit = results.find((r) => matchesTitle(r));
      return exactTitleHit?.id ? Number(exactTitleHit.id) : null;
    };

    for (const lang of ['es-ES', 'en-US'] as const) {
      const res = await fetch(
        `https://api.themoviedb.org/3/search/${mediaType}?api_key=${TMDB_API_KEY}&language=${lang}&query=${encodeURIComponent(clean)}&page=1&include_adult=false`,
        { signal: AbortSignal.timeout(3500) }
      ).catch(() => null);
      if (!res?.ok) continue;
      const json: any = await res.json().catch(() => null);
      const results: any[] = Array.isArray(json?.results) ? json.results : [];
      const foundId = pickFromResults(results);
      if (foundId) return foundId;
    }
    return null;
  } catch {
    return null;
  }
}


function formatExtractResponseForClient(
  req: express.Request,
  payload: ExtractedStreamResult
): ExtractedStreamResult & { requestId?: string } {
  const headerReqId = typeof req.headers['x-request-id'] === 'string' ? req.headers['x-request-id'] : '';
  const requestId =
    (payload as { requestId?: string }).requestId ||
    headerReqId ||
    `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  if (String(req.query.abs || '') !== '1') {
    return { ...payload, requestId };
  }
  const publicOrigin = getPublicOrigin(req);
  const absProxyUrl = (u?: string): string | undefined => {
    if (!u) return u;
    if (u.startsWith('/api/hls-proxy/') || u.startsWith('/api/vod-manifest/')) {
      const full = `${publicOrigin}${u}`;
      return full.includes('abs=1') ? full : `${full}${full.includes('?') ? '&' : '?'}abs=1`;
    }
    if (u.startsWith('/api/ts-proxy/') || u.startsWith('/api/embed-proxy')) {
      return `${publicOrigin}${u}`;
    }
    return u;
  };
  return {
    ...payload,
    requestId,
    streamUrl: absProxyUrl(payload.streamUrl) || payload.streamUrl,
    tracks: Array.isArray(payload.tracks)
      ? payload.tracks.map((tr) => ({
          ...tr,
          resolvedStreamUrl: absProxyUrl(tr.resolvedStreamUrl),
        }))
      : payload.tracks,
  };
}

app.get('/api/extract/stream', async (req, res) => {
  const rawInput = String(req.query.url || '').trim();
  const movidyUrlParam = String(req.query.movidyUrl || '').trim();
  const gnulaUrlParam = String(req.query.gnulaUrl || '').trim();
  const vestUrlParam = String(req.query.vestUrl || '').trim();
  const resolverType = String(req.query.resolverType || '').trim();
  const preferLang = String(req.query.preferLang || req.query.lang || 'ES').toUpperCase();
  const titleHint = String(req.query.title || '').trim();
  const origTitleHint = String(req.query.origTitle || '').trim();
  const rawYearParam = String(req.query.year || '').trim();
  const yearParam = /^(?:19|20)\d{2}$/.test(rawYearParam) ? rawYearParam : '';
  const mediaTypeParam = String(req.query.mediaType || req.query.type || '').toLowerCase();
  const tmdbIdParam = String(req.query.tmdbId || '').replace(/\D/g, '');
  const seasonParam = parseInt(String(req.query.season || '0'), 10) || undefined;
  const episodeParam = parseInt(String(req.query.episode || '0'), 10) || undefined;
  const episodeTitleHint = String(req.query.episodeTitle || '').trim();
  const isSandboxedFrame = String(req.query.sandboxed || '').trim() === '1';
  const forceExtract = String(req.query.force || req.query.forceSpanish || '') === '1';

  if (!rawInput && !movidyUrlParam && !gnulaUrlParam && !vestUrlParam && !titleHint && !tmdbIdParam) {
    return res.status(400).json({ success: false, error: 'Falta el enlace o título del contenido.' });
  }

  const cacheKey = `v3|${mediaTypeParam}|${tmdbIdParam}|${yearParam}|${seasonParam || ''}|${episodeParam || ''}|${resolverType}|${preferLang}|${isSandboxedFrame ? 'sb1' : 'sb0'}|${rawInput}|${movidyUrlParam}|${gnulaUrlParam}|${vestUrlParam}|${titleHint}`;
  const cached = !forceExtract ? extractionCache.get(cacheKey) : undefined;
  if (cached && cached.expiresAt > Date.now()) {
    return res.json(formatExtractResponseForClient(req, cached));
  }

  try {
    // CASE 0: Live Spanish TDT Channel (`tdt_hls`) -> Stateless per-segment Progressive H.264 IDR + AAC via /api/hls-proxy
    // (100% stateless across multi-instance Cloud Run deployments — never expires or drops across load-balanced containers!)
    if (resolverType === 'tdt_hls' && rawInput) {
      const strippedCheckUrl = rawInput.replace(/[?&]profile=(hd|fast)\b/gi, '');
      const cleanCheckUrl = await maybeSignEasyBroadcastUrl(strippedCheckUrl);
      const knownReferer = resolveKnownUpstreamReferer(cleanCheckUrl);
      const isCnStream = isChineseIptvStream(cleanCheckUrl);
      const checkHeaders: Record<string, string> = {
        'User-Agent': getPreferredUpstreamUa(cleanCheckUrl),
        Accept: '*/*',
      };
      if (knownReferer) {
        checkHeaders['Referer'] = knownReferer;
        try {
          checkHeaders['Origin'] = new URL(knownReferer).origin;
        } catch {
          // ignore
        }
      }
      let isAlive = false;
      try {
        const chk = await fetch(cleanCheckUrl, {
          headers: checkHeaders,
          signal: AbortSignal.timeout(4000),
        });
        if (chk.ok) {
          const txt = await chk.text();
          isAlive = txt.includes('#EXTM3U') && !/nosignal/i.test(txt);
        }
      } catch {
        // fallback to curl below
      }
      if (!isAlive) {
        const fb = await curlGetText(cleanCheckUrl, checkHeaders, isCnStream ? 6 : 5, isCnStream).catch(() => ({
          text: '',
        }));
        isAlive = Boolean(fb.text && fb.text.includes('#EXTM3U') && !/nosignal/i.test(fb.text));
      }
      if (!isAlive && isCnStream) {
        await new Promise((r) => setTimeout(r, 250));
        const fb2 = await curlGetText(cleanCheckUrl, checkHeaders, 6, true).catch(() => ({
          text: '',
        }));
        isAlive = Boolean(fb2.text && fb2.text.includes('#EXTM3U') && !/nosignal/i.test(fb2.text));
      }

      if (!isAlive) {
        return res.status(404).json({
          success: false,
          error: 'Esta señal TDT está temporalmente sin emisión. Prueba la señal alternativa.',
        });
      }

      const originRef = knownReferer || new URL(cleanCheckUrl).origin + '/';
      // Official Spanish public broadcaster HTTPS CDNs (`rtvelivestream.rtve.es`, `3catdirectes.cat`, `eitb.eus`)
      // send `Access-Control-Allow-Origin: *` for direct client playback in Spain, whereas proxying them through
      // a non-Spanish Cloud Run datacenter triggers HTTP 403 geo-blocks on `.ts` segments!
      const isDirectBrowserCorsPublicCdn =
        /^https:\/\/([^/]*\.)?(rtvelivestream\.rtve\.es|3catdirectes\.cat|eitb\.eus)\//i.test(
          cleanCheckUrl
        );
      const finalStreamUrl = isDirectBrowserCorsPublicCdn
        ? cleanCheckUrl
        : buildHlsProxyUrl(cleanCheckUrl, originRef, isDvbHeadendStream(cleanCheckUrl));

      const resolvedChLang = isCnStream ? 'ZH' : 'ES';
      const result: ExtractedStreamResult = {
        success: true,
        mode: 'hls',
        streamUrl: finalStreamUrl,
        rawStreamUrl: cleanCheckUrl,
        referer: originRef,
        title: titleHint || (isCnStream ? 'Fútbol China en Directo (中文)' : 'TV España en Directo'),
        requestedLang: resolvedChLang,
        resolvedLang: resolvedChLang,
        expiresAt: Date.now() + 4 * 60 * 1000,
      };
      extractionCache.set(cacheKey, result);
      return res.json(formatExtractResponseForClient(req, result));
    }

    // CASE 1A-0: Already resolved direct_hls track switch (e.g. GnulaHD / HLS proxy URL)
    if (resolverType === 'direct_hls' && rawInput) {
      const streamUrl =
        rawInput.startsWith('/api/') ? rawInput : buildHlsProxyUrl(rawInput, new URL(rawInput).origin + '/');
      const result: ExtractedStreamResult = {
        success: true,
        mode: 'hls',
        streamUrl,
        rawStreamUrl: rawInput,
        requestedLang: preferLang,
        resolvedLang: preferLang,
        expiresAt: Date.now() + 15 * 60 * 1000,
      };
      extractionCache.set(cacheKey, result);
      return res.json(formatExtractResponseForClient(req, result));
    }

    // CASE 1A: Direct Vidhide / Embed69 Spanish/Latino/VOSE track switch
    if (resolverType === 'vidhide_hls') {
      const unpacked = await unpackVidhideToHls(rawInput);
      if (!unpacked) {
        return res.status(404).json({ success: false, error: 'La pista seleccionada no está activa.' });
      }
      const result: ExtractedStreamResult = {
        success: true,
        mode: 'hls',
        streamUrl: unpacked.proxyUrl,
        rawStreamUrl: unpacked.rawM3u8,
        requestedLang: preferLang,
        resolvedLang: preferLang,
        expiresAt: Date.now() + 12 * 60 * 1000,
      };
      extractionCache.set(cacheKey, result);
      return res.json(formatExtractResponseForClient(req, result));
    }

    // CASE 1A-2: Moe / Embed Sniff track switch (VOE / Streamwish / Filelions fallback)
    if (resolverType === 'embed_sniff' && rawInput) {
      const sniffed = await sniffStreamWithHeadless(rawInput);
      if (!sniffed) {
        return res.status(404).json({ success: false, error: 'La pista alternativa no está activa.' });
      }
      const proxiedUrl = sniffed.isDirectMp4
        ? buildTsProxyUrl(sniffed.streamUrl, sniffed.referer)
        : buildHlsProxyUrl(sniffed.streamUrl, sniffed.referer);
      const result: ExtractedStreamResult = {
        success: true,
        mode: sniffed.isDirectMp4 ? 'direct' : 'hls',
        streamUrl: proxiedUrl,
        rawStreamUrl: sniffed.streamUrl,
        requestedLang: preferLang,
        resolvedLang: preferLang,
        expiresAt: Date.now() + 12 * 60 * 1000,
      };
      extractionCache.set(cacheKey, result);
      return res.json(formatExtractResponseForClient(req, result));
    }

    // CASE 1B: Direct Movidy base64/embed track (`nupload.my`)
    if (
      (resolverType === 'movidy_embed' || rawInput.includes('nupload.')) &&
      !isMovidyVerUrl(rawInput)
    ) {
      const resolvedMv = await resolveMovidyEmbedTrack(rawInput);
      if (resolvedMv?.mode === 'hls') {
        const result: ExtractedStreamResult = {
          success: true,
          mode: 'hls',
          streamUrl: resolvedMv.proxyUrl,
          rawStreamUrl: resolvedMv.rawM3u8,
          requestedLang: preferLang,
          resolvedLang: preferLang,
          expiresAt: Date.now() + 15 * 60 * 1000,
        };
        extractionCache.set(cacheKey, result);
        return res.json(formatExtractResponseForClient(req, result));
      }
      if (resolvedMv?.mode === 'embed') {
        const result: ExtractedStreamResult = {
          success: true,
          mode: 'embed',
          streamUrl: resolvedMv.embedUrl,
          rawStreamUrl: resolvedMv.embedUrl,
          requestedLang: preferLang,
          resolvedLang: preferLang,
          expiresAt: Date.now() + 20 * 60 * 1000,
        };
        extractionCache.set(cacheKey, result);
        return res.json(formatExtractResponseForClient(req, result));
      }
      return res.status(404).json({
        success: false,
        error: 'El servidor de esta pista Movidy no está activo ahora mismo.',
      });
    }

    // CASE 1B-VEST: Direct Vest/Groot track switch (`vest_hls` from 321moviesfree/cuevana4br/flixlat/123pelicula)
    if (resolverType === 'vest_hls' && rawInput) {
      try {
        const originRef = new URL(rawInput).origin + '/';
        const result: ExtractedStreamResult = {
          success: true,
          mode: 'hls',
          streamUrl: buildHlsProxyUrl(rawInput, originRef),
          rawStreamUrl: rawInput,
          referer: originRef,
          requestedLang: preferLang,
          resolvedLang: preferLang,
          expiresAt: Date.now() + 15 * 60 * 1000,
        };
        extractionCache.set(cacheKey, result);
        return res.json(formatExtractResponseForClient(req, result));
      } catch {
        return res.status(404).json({
          success: false,
          error: 'La pista seleccionada no está activa.',
        });
      }
    }

    // CASE 1C: Verified Web Embed Player track switch (`web_embed`) -> route HTML embeds via /api/embed-proxy to strip popups/sandbox checks
    if (resolverType === 'web_embed' && rawInput) {
      const fullEmbedUrl = /^https?:\/\//i.test(rawInput) ? rawInput : `https://${rawInput}`;
      const isCloudflareDirectEmbed =
        /(?:^|\.)(voe\.sx|voe\.bar|hglink\.to|streamwish\.[a-z]+|ok\.ru|byse\.[a-z]+|filelions\.[a-z]+)/i.test(
          fullEmbedUrl
        );
      const isHtmlProxyTarget =
        /(^|\.)(vidsrc\.buzz|videm\.buzz|2embed\.cc|www\.2embed\.cc|vidfast\.[a-z.]+)/i.test(
          fullEmbedUrl
        ) ||
        (isSandboxedFrame && !isCloudflareDirectEmbed);
      const safeEmbedUrl = isHtmlProxyTarget
        ? `/api/embed-proxy?url=${encodeURIComponent(fullEmbedUrl)}`
        : fullEmbedUrl;
      const result: ExtractedStreamResult = {
        success: true,
        mode: 'embed',
        streamUrl: safeEmbedUrl,
        rawStreamUrl: fullEmbedUrl,
        requestedLang: preferLang,
        resolvedLang: preferLang,
        expiresAt: Date.now() + 30 * 60 * 1000,
      };
      extractionCache.set(cacheKey, result);
      return res.json(formatExtractResponseForClient(req, result));
    }

    // CASE 2: YouTube URL
    const ytId = parseYouTubeVideoId(rawInput);
    if (ytId) {
      const result: ExtractedStreamResult = {
        success: true,
        mode: 'youtube',
        streamUrl: ytId,
        youtubeId: ytId,
        title: titleHint || 'YouTube Video',
        expiresAt: Date.now() + 60 * 60 * 1000,
      };
      extractionCache.set(cacheKey, result);
      return res.json(formatExtractResponseForClient(req, result));
    }

    // CASE 3: Direct .m3u8 or .mp4 URL
    if (/^\/api\/vod-manifest\//i.test(rawInput)) {
      const result: ExtractedStreamResult = {
        success: true,
        mode: 'hls',
        streamUrl: rawInput,
        rawStreamUrl: rawInput,
        expiresAt: Date.now() + 15 * 60 * 1000,
      };
      extractionCache.set(cacheKey, result);
      return res.json(formatExtractResponseForClient(req, result));
    }
    if (/\.m3u8(\?|$)/i.test(rawInput)) {
      const originRef = new URL(rawInput).origin + '/';
      const result: ExtractedStreamResult = {
        success: true,
        mode: 'hls',
        streamUrl: buildHlsProxyUrl(rawInput, originRef),
        rawStreamUrl: rawInput,
        expiresAt: Date.now() + 15 * 60 * 1000,
      };
      extractionCache.set(cacheKey, result);
      return res.json(formatExtractResponseForClient(req, result));
    }

    if (resolverType === 'direct_mp4' || /\.(mp4|webm|mkv)(\?|$)/i.test(rawInput)) {
      const isGlobalCorsCdn =
        resolverType === 'direct_mp4' ||
        /archive\.org\/download\/|3catvideos\.cat\//i.test(rawInput);
      const originRef = new URL(rawInput).origin + '/';
      const result: ExtractedStreamResult = {
        success: true,
        mode: 'direct',
        streamUrl: isGlobalCorsCdn ? rawInput : buildTsProxyUrl(rawInput, originRef),
        rawStreamUrl: rawInput,
        requestedLang: preferLang,
        resolvedLang: preferLang,
        expiresAt: Date.now() + 20 * 60 * 1000,
      };
      extractionCache.set(cacheKey, result);
      return res.json(formatExtractResponseForClient(req, result));
    }

    // CASE 4: UNIFIED MOVIE & TV SERIES MULTI-ENGINE
    // STRICT PRIORITY: 1. Movidy -> 2. GnulaHD -> 3. Bingetrix/EN HLS -> 4. Others (Embed69/SeriesKao/Vest)
    const bingetrixTvMatch = rawInput.match(/bingetrix\.[a-z]+\/(?:watch\/)?tv\/(\d+)\/(\d+)\/(\d+)/i);
    const bingetrixMovieMatch = rawInput.match(/bingetrix\.[a-z]+\/(?:watch|movie)\/(\d+)/i);
    const externalEmbedTvMatch =
      rawInput.match(/(?:vidfast|vidlink|vidsrc|videm|vidrock|vidnest|vsembed)\.[a-z.]+\/(?:v2\/)?(?:embed\/)?tv\/(tt\d+|\d+)\/(\d+)[/-](\d+)/i) ||
      rawInput.match(/2embed\.[a-z]+\/(?:embedtv|tv)\/(tt\d+|\d+)(?:&s=|\/)(\d+)(?:&e=|\/)(\d+)/i) ||
      rawInput.match(/[?&]tmdb=(\d+).*?[?&]season=(\d+).*?[?&]episode=(\d+)/i);
    const externalEmbedMovieMatch =
      !externalEmbedTvMatch
        ? rawInput.match(/(?:vidfast|vidlink|vidsrc|videm|vidrock|vidnest|vsembed|2embed)\.[a-z.]+\/(?:v2\/)?(?:embed\/)?(?:movie\/)?(tt\d+|\d+)/i) ||
          rawInput.match(/[?&]tmdb=(\d+)/i)
        : null;
    const isMovidyLink = isMovidyVerUrl(rawInput) || isMovidyVerUrl(movidyUrlParam);
    const isGnulaLink = isGnulaHdUrl(rawInput) || isGnulaHdUrl(gnulaUrlParam);
    const isVestLink = isVestMirrorUrl(rawInput) || isVestMirrorUrl(vestUrlParam);

    const isCatalogMediaRequest =
      mediaTypeParam === 'movie' ||
      mediaTypeParam === 'tv' ||
      Boolean(tmdbIdParam) ||
      Boolean(bingetrixTvMatch) ||
      Boolean(bingetrixMovieMatch) ||
      Boolean(externalEmbedTvMatch) ||
      Boolean(externalEmbedMovieMatch) ||
      isMovidyLink ||
      isGnulaLink ||
      isVestLink ||
      resolverType === 'bingetrix_en' ||
      (!rawInput && Boolean(titleHint));

    if (isCatalogMediaRequest && resolverType !== 'sports_channel') {
      let effectiveMediaType: 'movie' | 'tv' =
        mediaTypeParam === 'tv' || Boolean(bingetrixTvMatch) || Boolean(externalEmbedTvMatch)
          ? 'tv'
          : 'movie';

      let effectiveSeason = bingetrixTvMatch
        ? parseInt(bingetrixTvMatch[2], 10)
        : externalEmbedTvMatch
        ? parseInt(externalEmbedTvMatch[2], 10)
        : seasonParam || 1;
      let effectiveEpisode = bingetrixTvMatch
        ? parseInt(bingetrixTvMatch[3], 10)
        : externalEmbedTvMatch
        ? parseInt(externalEmbedTvMatch[3], 10)
        : episodeParam || 1;

      let resolvedTmdbId: string | number | null =
        tmdbIdParam ||
        (bingetrixTvMatch ? bingetrixTvMatch[1] : null) ||
        (bingetrixMovieMatch ? bingetrixMovieMatch[1] : null) ||
        (externalEmbedTvMatch ? externalEmbedTvMatch[1] : null) ||
        (externalEmbedMovieMatch ? externalEmbedMovieMatch[1] : null);

      if (resolvedTmdbId && /^tt\d+$/i.test(String(resolvedTmdbId))) {
        try {
          const findRes = await fetch(
            `https://api.themoviedb.org/3/find/${encodeURIComponent(
              String(resolvedTmdbId)
            )}?api_key=${TMDB_API_KEY}&external_source=imdb_id`,
            { signal: AbortSignal.timeout(3500) }
          );
          if (findRes.ok) {
            const findJson: any = await findRes.json();
            const hit =
              effectiveMediaType === 'tv'
                ? findJson?.tv_results?.[0] || findJson?.movie_results?.[0]
                : findJson?.movie_results?.[0] || findJson?.tv_results?.[0];
            if (hit?.id) {
              resolvedTmdbId = hit.id;
            }
          }
        } catch {
          // keep original id fallback
        }
      }

      let hasExplicitMovidyUrl =
        isMovidyVerUrl(movidyUrlParam) || isMovidyVerUrl(rawInput);
      let effectiveMovidyUrl = isMovidyVerUrl(movidyUrlParam)
        ? normalizeMovidyUrl(movidyUrlParam)
        : isMovidyVerUrl(rawInput)
        ? normalizeMovidyUrl(rawInput)
        : '';

      let hasExplicitGnulaUrl =
        isGnulaHdUrl(gnulaUrlParam) || isGnulaHdUrl(rawInput);
      let effectiveGnulaUrl = isGnulaHdUrl(gnulaUrlParam)
        ? normalizeGnulaUrl(gnulaUrlParam)
        : isGnulaHdUrl(rawInput)
        ? normalizeGnulaUrl(rawInput)
        : '';

      const effectiveVestUrl = isVestMirrorUrl(vestUrlParam)
        ? vestUrlParam
        : isVestMirrorUrl(rawInput)
        ? rawInput
        : '';

      let extractedMovidyMeta: MovidyPageMetadata | null = null;
      let extractedMovidyCleanTitle = '';
      let extractedMovidyYear = '';
      let extractedGnulaMeta: GnulaPageMetadata | null = null;
      let extractedGnulaCleanTitle = '';
      let extractedGnulaYear = '';
      let extractedVestDetail: VestParsedDetail | null = null;
      let tmdbVerifiedYear = '';
      let tmdbDirector = '';
      let tmdbRuntimeMin = 0;
      let tmdbImdbId: string | null = null;
      const tmdbAltTitles: string[] = [];

      // Inspect direct Movidy & GnulaHD links concurrently whenever provided
      await Promise.all([
        (async () => {
          if (!effectiveMovidyUrl) return;
          extractedMovidyMeta = await fetchMovidyPageMetadata(effectiveMovidyUrl);
          if (extractedMovidyMeta) {
            if (!mediaTypeParam && extractedMovidyMeta.isTvShow) {
              effectiveMediaType = 'tv';
            }
            extractedMovidyCleanTitle = extractedMovidyMeta.cleanTitle;
            extractedMovidyYear = extractedMovidyMeta.year;
          }
        })(),
        (async () => {
          if (!effectiveGnulaUrl) return;
          extractedGnulaMeta = await fetchGnulaPageMetadata(effectiveGnulaUrl);
          if (extractedGnulaMeta) {
            if (!mediaTypeParam && extractedGnulaMeta.isTvShow) {
              effectiveMediaType = 'tv';
            }
            extractedGnulaCleanTitle = extractedGnulaMeta.cleanTitle;
            extractedGnulaYear = extractedGnulaMeta.year;
          }
        })(),
      ]);

      // Inspect direct 321moviesfree / cuevana4br / flixlat / 123pelicula `/detail/...` link
      if (effectiveVestUrl) {
        extractedVestDetail = await fetchVestDetailPage(
          effectiveVestUrl,
          episodeParam && episodeParam > 0 ? episodeParam : undefined
        );
        if (extractedVestDetail) {
          if (!mediaTypeParam) {
            effectiveMediaType = extractedVestDetail.mediaType;
          }
          if (!episodeParam && extractedVestDetail.currentEpisodeNumber > 0) {
            effectiveEpisode = extractedVestDetail.currentEpisodeNumber;
          }
          if (!extractedMovidyCleanTitle) {
            extractedMovidyCleanTitle = extractedVestDetail.cleanTitle;
          }
          const vestSeed = findVestSeedForMedia({
            titleHints: [extractedVestDetail.cleanTitle],
          });
          if (!resolvedTmdbId && vestSeed?.tmdbId) {
            resolvedTmdbId = vestSeed.tmdbId;
          }
        }
      }

      if (!resolvedTmdbId && (titleHint || origTitleHint)) {
        for (const qTitle of [titleHint, origTitleHint].filter(Boolean)) {
          resolvedTmdbId = await resolveTmdbIdByTitle(
            qTitle,
            effectiveMediaType,
            extractedMovidyYear || extractedGnulaYear || yearParam || undefined
          );
          if (resolvedTmdbId) break;
        }
      }

      if (!resolvedTmdbId && (extractedMovidyCleanTitle || extractedGnulaCleanTitle)) {
        const pageTitle = extractedMovidyCleanTitle || extractedGnulaCleanTitle;
        const pageYear = extractedMovidyYear || extractedGnulaYear;
        if (pageYear) {
          resolvedTmdbId = await resolveTmdbIdByTitle(
            pageTitle,
            effectiveMediaType,
            pageYear
          );
        }
      }

      if (!resolvedTmdbId && effectiveMovidyUrl && extractedMovidyYear) {
        const slug =
          effectiveMovidyUrl
            .split('/ver/')[1]
            ?.replace(/\//g, '')
            .replace(/-\d+$/, '')
            .replace(/-/g, ' ') || '';
        if (slug) {
          resolvedTmdbId = await resolveTmdbIdByTitle(
            slug,
            effectiveMediaType,
            extractedMovidyYear
          );
        }
      }

      let tmdbResolvedTitle = '';
      if (resolvedTmdbId) {
        try {
          const tmJson = await fetchTmdbJson<any>(
            `/${effectiveMediaType}/${resolvedTmdbId}`,
            {
              language: 'es-ES',
              append_to_response: 'credits,translations,alternative_titles,external_ids',
            },
            15 * 60 * 1000
          ).catch(() => null);
          if (tmJson) {
            const esTitle = String(tmJson?.title || tmJson?.name || '').trim();
            const origTitle = String(tmJson?.original_title || tmJson?.original_name || '').trim();
            tmdbResolvedTitle = esTitle || origTitle;
            tmdbVerifiedYear = String(tmJson?.release_date || tmJson?.first_air_date || '').split('-')[0] || '';
            tmdbImdbId = tmJson?.imdb_id || tmJson?.external_ids?.imdb_id || null;
            if (effectiveMediaType === 'movie') {
              const crew: any[] = Array.isArray(tmJson?.credits?.crew) ? tmJson.credits.crew : [];
              tmdbDirector = String(crew.find((c) => c?.job === 'Director')?.name || '').trim();
              tmdbRuntimeMin = Number(tmJson?.runtime || 0) || 0;
            }
            for (const hint of extractLocalizedTmdbTitleHints(tmJson)) {
              if (hint && !tmdbAltTitles.includes(hint)) tmdbAltTitles.push(hint);
            }

            // Verify explicit Movidy / GnulaHD URLs against TMDB metadata (reject mismatched remakes/homonyms)
            if (effectiveMovidyUrl && extractedMovidyMeta) {
              const mvCheck = verifyMovidyMetaMatch(extractedMovidyMeta, {
                titleHints: [titleHint, ...tmdbAltTitles].filter(Boolean),
                expectedYear: tmdbVerifiedYear || undefined,
                expectedDirector: tmdbDirector || undefined,
                expectedRuntimeMin: tmdbRuntimeMin || undefined,
                expectedMediaType: effectiveMediaType,
              });
              if (!mvCheck.ok) {
                effectiveMovidyUrl = '';
                hasExplicitMovidyUrl = false;
              }
            }
            if (effectiveGnulaUrl && extractedGnulaMeta) {
              const gnCheck = verifyGnulaMetaMatch(extractedGnulaMeta, {
                titleHints: [titleHint, ...tmdbAltTitles].filter(Boolean),
                expectedYear: tmdbVerifiedYear || undefined,
                expectedDirector: tmdbDirector || undefined,
                expectedRuntimeMin: tmdbRuntimeMin || undefined,
                expectedMediaType: effectiveMediaType,
              });
              if (!gnCheck.ok) {
                effectiveGnulaUrl = '';
                hasExplicitGnulaUrl = false;
              }
            }
          }
        } catch {
          // ignore
        }
      }

      const rawHints = [
        titleHint,
        origTitleHint,
        ...tmdbAltTitles,
        extractedMovidyCleanTitle,
        extractedGnulaCleanTitle,
        tmdbResolvedTitle,
      ].filter(Boolean);
      const expandedHints: string[] = [];
      for (const h of rawHints) {
        expandedHints.push(h);
        for (const v of generateSpanishTitleHints(h)) {
          expandedHints.push(v);
        }
      }
      const combinedTitleHints = Array.from(new Set(expandedHints));
      const effectiveYearForExtract =
        tmdbVerifiedYear || extractedMovidyYear || extractedGnulaYear || yearParam || undefined;

      const shouldQueryVest =
        Boolean(effectiveVestUrl) ||
        Boolean(
          findVestSeedForMedia({
            tmdbId: resolvedTmdbId,
            mediaType: effectiveMediaType,
            yearHint: effectiveYearForExtract,
            titleHints: combinedTitleHints,
            preferLang,
            season: effectiveSeason,
            episode: effectiveEpisode,
          })
        );

      const resolveAndExtractMovidy = async (): Promise<TrackRecord[]> => {
        try {
          let mvUrl = effectiveMovidyUrl;
          if (!mvUrl && combinedTitleHints.length > 0) {
            mvUrl =
              (await findMovidyUrlByTitle(combinedTitleHints[0], effectiveYearForExtract, {
                expectedDirector: effectiveMediaType === 'movie' ? (tmdbDirector || undefined) : undefined,
                expectedRuntimeMin: effectiveMediaType === 'movie' ? (tmdbRuntimeMin || undefined) : undefined,
                titleHints: combinedTitleHints,
                expectedMediaType: effectiveMediaType,
              })) || '';
          }
          if (!mvUrl) return [];
          return await extractMovidyPageTracks(mvUrl, {
            expectedYear: effectiveYearForExtract,
            requireMovieOnly: effectiveMediaType === 'movie',
            expectedTitleHints:
              resolvedTmdbId || combinedTitleHints.length > 0 ? combinedTitleHints : undefined,
            expectedDirector: effectiveMediaType === 'movie' ? (tmdbDirector || undefined) : undefined,
            expectedRuntimeMin: effectiveMediaType === 'movie' ? (tmdbRuntimeMin || undefined) : undefined,
          });
        } catch {
          return [];
        }
      };

      const resolveAndExtractGnula = async (): Promise<TrackRecord[]> => {
        try {
          let gnUrl = effectiveGnulaUrl;
          if (!gnUrl && combinedTitleHints.length > 0) {
            gnUrl =
              (await findGnulaHdUrlByTitle(combinedTitleHints, effectiveYearForExtract, {
                expectedDirector: effectiveMediaType === 'movie' ? (tmdbDirector || undefined) : undefined,
                expectedRuntimeMin: effectiveMediaType === 'movie' ? (tmdbRuntimeMin || undefined) : undefined,
                titleHints: combinedTitleHints,
                expectedMediaType: effectiveMediaType,
              })) || '';
          }
          if (!gnUrl) return [];
          return await extractGnulaHdTracks(gnUrl, {
            expectedYear: effectiveYearForExtract,
            expectedTitleHints:
              resolvedTmdbId || combinedTitleHints.length > 0 ? combinedTitleHints : undefined,
            expectedDirector: effectiveMediaType === 'movie' ? (tmdbDirector || undefined) : undefined,
            expectedRuntimeMin: effectiveMediaType === 'movie' ? (tmdbRuntimeMin || undefined) : undefined,
            mediaType: effectiveMediaType,
            season: effectiveSeason,
            episode: effectiveEpisode,
          });
        } catch {
          return [];
        }
      };

      const withExtractTimeout = <T>(p: Promise<T>, ms: number, fallback: T): Promise<T> =>
        Promise.race([
          p.catch(() => fallback),
          new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
        ]);

      const [
        movidyTracks,
        gnulaTracks,
        esTracks,
        vidRockTracks,
        bingetrixEnTracks,
        twoEmbedEnTracks,
        vidBuzzHlsTracks,
        vestExtracted,
      ] = await Promise.all([
        withExtractTimeout(resolveAndExtractMovidy(), 6800, [] as TrackRecord[]),
        withExtractTimeout(resolveAndExtractGnula(), 7000, [] as TrackRecord[]),
        resolvedTmdbId || combinedTitleHints.length > 0
          ? withExtractTimeout(
              extractEmbed69SpanishTracks({
                tmdbId: resolvedTmdbId || undefined,
                imdbId: tmdbImdbId,
                mediaType: effectiveMediaType,
                season: effectiveSeason,
                episode: effectiveEpisode,
                titleHints: combinedTitleHints,
                yearHint: effectiveYearForExtract,
                directorHint: tmdbDirector || undefined,
                runtimeMinHint: tmdbRuntimeMin || undefined,
                force: forceExtract,
                skipGnula: true,
              }),
              6800,
              [] as TrackRecord[]
            )
          : Promise.resolve([]),
        resolvedTmdbId
          ? withExtractTimeout(
              extractVidRockHlsTracks({
                tmdbId: resolvedTmdbId,
                mediaType: effectiveMediaType,
                season: effectiveSeason,
                episode: effectiveEpisode,
              }),
              7200,
              [] as TrackRecord[]
            )
          : Promise.resolve([]),
        resolvedTmdbId
          ? withExtractTimeout(
              extractBingetrixEnglishTracks({
                tmdbId: resolvedTmdbId,
                mediaType: effectiveMediaType,
                season: effectiveSeason,
                episode: effectiveEpisode,
              }),
              4500,
              [] as TrackRecord[]
            )
          : Promise.resolve([]),
        resolvedTmdbId
          ? withExtractTimeout(
              extract2EmbedEnglishTracks({
                tmdbId: resolvedTmdbId,
                imdbId: tmdbImdbId,
                mediaType: effectiveMediaType,
                season: effectiveSeason,
                episode: effectiveEpisode,
              }),
              7200,
              [] as TrackRecord[]
            )
          : Promise.resolve([]),
        resolvedTmdbId || tmdbImdbId
          ? withExtractTimeout(
              extractVidsrcBuzzHlsTracks({
                tmdbId: resolvedTmdbId || undefined,
                imdbId: tmdbImdbId,
                mediaType: effectiveMediaType,
                season: effectiveSeason,
                episode: effectiveEpisode,
              }),
              7200,
              [] as TrackRecord[]
            )
          : Promise.resolve([]),
        shouldQueryVest
          ? withExtractTimeout(
              extractVestStreamsAndSubtitles({
                vestUrl: effectiveVestUrl || undefined,
                tmdbId: resolvedTmdbId,
                mediaType: effectiveMediaType,
                yearHint: effectiveYearForExtract,
                season: effectiveSeason,
                episode: effectiveEpisode,
                preferLang,
                titleHints: combinedTitleHints,
                tmdbApiKey: TMDB_API_KEY,
                buildHlsProxyUrl: (m3u8Url, referer) => buildHlsProxyUrl(m3u8Url, referer),
              }),
              6000,
              null
            )
          : Promise.resolve(null),
      ]);

      const enTracks: TrackRecord[] = [
        ...vidRockTracks,
        ...bingetrixEnTracks,
        ...twoEmbedEnTracks,
        ...vidBuzzHlsTracks,
      ];
      const vestTracks: TrackRecord[] = vestExtracted?.tracks || [];
      const vestSubtitles = vestExtracted?.subtitles || [];
      const vestDetailMeta = vestExtracted?.detail || extractedVestDetail;

      // Combine all discovered tracks in explicit preference baseline:
      // 1. Movidy -> 2. GnulaHD -> 3. Bingetrix/EN -> 4. Others (Embed69/SeriesKao/Vest)
      const allDiscovered: TrackRecord[] = isVestLink
        ? [...vestTracks, ...movidyTracks, ...gnulaTracks, ...enTracks, ...esTracks]
        : !hasExplicitMovidyUrl && hasExplicitGnulaUrl
        ? [...gnulaTracks, ...movidyTracks, ...enTracks, ...esTracks, ...vestTracks]
        : [...movidyTracks, ...gnulaTracks, ...enTracks, ...esTracks, ...vestTracks];

      const getLangScore = (trackLang: string): number => {
        const tl = String(trackLang || '').toUpperCase();
        if (preferLang === 'EN') {
          if (tl === 'EN') return 1;
          if (tl === 'VOSE') return 2;
          if (tl === 'ES') return 3;
          if (tl === 'LAT') return 4;
          return 5;
        }
        if (preferLang === 'LAT') {
          if (tl === 'LAT') return 1;
          if (tl === 'ES') return 2;
          if (tl === 'VOSE') return 3;
          if (tl === 'EN') return 4;
          return 5;
        }
        if (preferLang === 'VOSE') {
          if (tl === 'VOSE') return 1;
          if (tl === 'EN') return 2;
          if (tl === 'ES') return 3;
          if (tl === 'LAT') return 4;
          return 5;
        }
        // Default preferLang === 'ES' (Castellano first, then Latino, then VOSE, then EN)
        if (tl === 'ES') return 1;
        if (tl === 'LAT') return 2;
        if (tl === 'VOSE') return 3;
        if (tl === 'EN') return 4;
        return 5;
      };

      const resolverPriority = (rt: string): number => {
        if (isVestLink && rt === 'vest_hls') return 0;
        if (
          rt === 'vest_hls' ||
          rt === 'direct_hls' ||
          rt === 'direct_mp4' ||
          rt === 'vidhide_hls' ||
          rt === 'movidy_embed' ||
          rt === 'bingetrix_en'
        ) {
          return 1;
        }
        if (rt === 'embed_sniff') return 2;
        if (rt === 'web_embed') return 3;
        return 4;
      };

      // Strict source preference order:
      // 1 = Movidy, 2 = GnulaHD, 3 = Bingetrix / EN HLS, 4 = Others (Embed69, SeriesKao, Vest, AnimeAV1)
      const sourcePriority = (tr: TrackRecord): number => {
        if (isVestLink && tr.resolverType === 'vest_hls') return 0;
        if (!hasExplicitMovidyUrl && hasExplicitGnulaUrl && tr.id.startsWith('gnula-')) return 0;
        if (tr.id.startsWith('movidy-') || tr.resolverType === 'movidy_embed') return 1;
        if (tr.id.startsWith('gnula-')) return 2;
        if (
          tr.id.startsWith('bingetrix-') ||
          tr.id.startsWith('vidrock-') ||
          tr.id.startsWith('2embed-') ||
          tr.id.startsWith('vidbuzz-') ||
          tr.resolverType === 'bingetrix_en'
        ) {
          return 3;
        }
        return 4;
      };

      const healthMap = channelHealthMonitor.getAllTrackStatuses();
      const healthStatusRank = (status?: string): number => {
        if (status === 'up') return 0;
        if (status === 'unknown' || !status) return 1;
        if (status === 'degraded') return 2;
        return 3; // 'down'
      };
      const getEffectiveDownPenalty = (tr: TrackRecord): number => {
        const key = String(tr.resolvedStreamUrl || tr.sourceUrl || '').trim();
        const info = (key && healthMap[key]) || healthMap[String(tr.sourceUrl || '').trim()];
        if (!info) return 0;
        if (info.status === 'down') return 2;
        if ((info.qoeFailures || 0) >= 2) return 1;
        return 0;
      };
      const getTrackHealthScore = (tr: TrackRecord): number => {
        const key = String(tr.resolvedStreamUrl || tr.sourceUrl || '').trim();
        const info = (key && healthMap[key]) || healthMap[String(tr.sourceUrl || '').trim()];
        if (!info) return 100;
        const statusBase = healthStatusRank(info.status) * 1000;
        const qoePenalty = (info.qoeFailures || 0) * 80 + (info.qoeRebuffers || 0) * 15 + (info.failCount || 0) * 50;
        const latencyScore = Math.min(400, Math.round((info.latencyMs || 150) / 10));
        return statusBase + qoePenalty + latencyScore;
      };

      const orderedTracks: TrackRecord[] = [...allDiscovered].sort((a, b) => {
        const lDiff = getLangScore(a.lang) - getLangScore(b.lang);
        if (lDiff !== 0) return lDiff;
        const aIsWeb = a.resolverType === 'web_embed' || a.resolverType === 'embed_sniff';
        const bIsWeb = b.resolverType === 'web_embed' || b.resolverType === 'embed_sniff';
        if (aIsWeb !== bIsWeb) {
          return aIsWeb ? 1 : -1;
        }
        const dDiff = getEffectiveDownPenalty(a) - getEffectiveDownPenalty(b);
        if (dDiff !== 0) return dDiff;
        const rDiff = resolverPriority(a.resolverType) - resolverPriority(b.resolverType);
        if (rDiff !== 0) return rDiff;
        const sDiff = sourcePriority(a) - sourcePriority(b);
        if (sDiff !== 0) return sDiff;
        return getTrackHealthScore(a) - getTrackHealthScore(b);
      });

      // Resolve streams strictly tier-by-tier in language preference order (ES -> LAT -> VOSE -> EN).
      // Within each language tier, exhaust native HLS/MP4 extractors first (Movidy -> GnulaHD -> Bingetrix -> Others),
      // and if none resolve natively in that tier, fall back to a verified alive web_embed in that SAME language
      // before dropping down to a lower-priority language (e.g. never play EN when ES/LAT/VOSE exists).
      let primaryStreamUrl = '';
      let primaryMode: 'hls' | 'direct' | 'embed' = 'hls';
      let resolvedTrack: TrackRecord | null = null;
      const deadTrackIndices = new Set<number>();

      const toProxiedEmbedUrl = (url: string): string => {
        const isCloudflareDirectEmbed = /(?:^|\.)(voe\.sx|voe\.bar|hglink\.to|streamwish\.[a-z]+|ok\.ru|byse\.[a-z]+|filelions\.[a-z]+)/i.test(
          url
        );
        const shouldProxyHtml =
          /(^|\.)(vidsrc\.buzz|videm\.buzz|2embed\.cc|vidfast\.[a-z.]+)/i.test(url) ||
          (isSandboxedFrame && !isCloudflareDirectEmbed);
        return shouldProxyHtml ? `/api/embed-proxy?url=${encodeURIComponent(url)}` : url;
      };

      const verifyWebEmbedCandidateAlive = async (
        track: TrackRecord,
        url: string
      ): Promise<boolean> => {
        if (!url || !/^https?:\/\//i.test(url)) return false;
        // Skip GnulaHD player redirects that resolve to the fake "aviso.mp4" notice clip
        if (/player\.gnulahd\./i.test(url)) {
          try {
            const headRes = await fetch(url, {
              method: 'HEAD',
              redirect: 'manual',
              headers: { Referer: 'https://ww3.gnulahd.nu/', 'User-Agent': CHROME_UA },
              signal: AbortSignal.timeout(2200),
            });
            const loc = String(headRes.headers.get('location') || '').toLowerCase();
            if (loc.includes('aviso.mp4')) return false;
          } catch {
            // allow if HEAD check itself timed out
          }
        }
        // Movidy VOE embeds were already 404-checked inside resolveMovidyEmbedTrack
        if (/voe\.[a-z]+/i.test(url) && !track.id.startsWith('movidy-')) {
          try {
            const check = await curlGetText(
              url,
              { Referer: 'https://embed69.org/', 'User-Agent': CHROME_UA },
              3,
              true
            );
            if (
              check.text &&
              /<title>\s*404|not found<\/title>|file was deleted|no longer available/i.test(
                check.text.slice(0, 1200)
              )
            ) {
              return false;
            }
          } catch {
            // allow on network timeout
          }
        }
        return true;
      };

      const tierScores = Array.from(
        new Set(orderedTracks.map((t) => getLangScore(t.lang)))
      ).sort((a, b) => a - b);

      for (const tierScore of tierScores) {
        const tierWebEmbedCandidates: { idx: number; track: TrackRecord; url: string }[] = [];

        for (let i = 0; i < orderedTracks.length; i++) {
          if (getLangScore(orderedTracks[i].lang) !== tierScore) continue;
          const candidate = orderedTracks[i];

          if (candidate.resolverType === 'web_embed') {
            if (candidate.sourceUrl) {
              tierWebEmbedCandidates.push({ idx: i, track: candidate, url: candidate.sourceUrl });
            }
            continue;
          }

          if (candidate.resolvedStreamUrl) {
            primaryStreamUrl = candidate.resolvedStreamUrl;
            primaryMode = candidate.resolverType === 'direct_mp4' ? 'direct' : 'hls';
            resolvedTrack = candidate;
            break;
          }

          if (candidate.resolverType === 'movidy_embed') {
            const resolvedMv = await resolveMovidyEmbedTrack(candidate.sourceUrl);
            if (resolvedMv?.mode === 'hls') {
              orderedTracks[i] = { ...candidate, resolvedStreamUrl: resolvedMv.proxyUrl };
              primaryStreamUrl = resolvedMv.proxyUrl;
              primaryMode = 'hls';
              resolvedTrack = orderedTracks[i];
              break;
            } else if (resolvedMv?.mode === 'embed') {
              orderedTracks[i] = {
                ...candidate,
                resolverType: 'web_embed',
                sourceUrl: resolvedMv.embedUrl,
              };
              tierWebEmbedCandidates.push({
                idx: i,
                track: orderedTracks[i],
                url: resolvedMv.embedUrl,
              });
            } else {
              deadTrackIndices.add(i);
            }
          } else if (candidate.resolverType === 'vidhide_hls') {
            const unpacked = await withExtractTimeout(
              unpackVidhideToHls(candidate.sourceUrl),
              4200,
              null
            );
            if (unpacked) {
              orderedTracks[i] = { ...candidate, resolvedStreamUrl: unpacked.proxyUrl };
              primaryStreamUrl = unpacked.proxyUrl;
              primaryMode = 'hls';
              resolvedTrack = orderedTracks[i];
              break;
            } else {
              deadTrackIndices.add(i);
            }
          } else if (candidate.resolverType === 'embed_sniff') {
            const sniffed = await withExtractTimeout(
              sniffStreamWithHeadless(candidate.sourceUrl),
              5500,
              null
            );
            if (sniffed) {
              const proxiedUrl = sniffed.isDirectMp4
                ? buildTsProxyUrl(sniffed.streamUrl, sniffed.referer)
                : buildHlsProxyUrl(sniffed.streamUrl, sniffed.referer);
              orderedTracks[i] = { ...candidate, resolvedStreamUrl: proxiedUrl };
              primaryStreamUrl = proxiedUrl;
              primaryMode = sniffed.isDirectMp4 ? 'direct' : 'hls';
              resolvedTrack = orderedTracks[i];
              break;
            } else {
              deadTrackIndices.add(i);
            }
          }
        }

        if (primaryStreamUrl) break;

        if (tierWebEmbedCandidates.length > 0) {
          tierWebEmbedCandidates.sort(
            (a, b) =>
              sourcePriority(a.track) - sourcePriority(b.track) ||
              getTrackHealthScore(a.track) - getTrackHealthScore(b.track)
          );
          for (const cand of tierWebEmbedCandidates) {
            const alive = await verifyWebEmbedCandidateAlive(cand.track, cand.url);
            if (!alive) {
              deadTrackIndices.add(cand.idx);
              continue;
            }
            const proxiedWeb = toProxiedEmbedUrl(cand.url);
            orderedTracks[cand.idx] = {
              ...cand.track,
              resolvedStreamUrl: proxiedWeb,
            };
            primaryStreamUrl = proxiedWeb;
            primaryMode = 'embed';
            resolvedTrack = orderedTracks[cand.idx];
            break;
          }
        }

        if (primaryStreamUrl) break;
      }

      if (primaryStreamUrl) {
        const langsWithNativeTracks = new Set(
          orderedTracks
            .filter((tr, idx) => !deadTrackIndices.has(idx) && tr.resolverType !== 'web_embed')
            .map((tr) => String(tr.lang || '').toUpperCase())
        );
        const validTracks = orderedTracks.filter(
          (tr, idx) =>
            !deadTrackIndices.has(idx) &&
            (primaryMode === 'embed' ||
              tr.resolverType !== 'web_embed' ||
              !langsWithNativeTracks.has(String(tr.lang || '').toUpperCase()))
        );
        const resolvedLang = String(resolvedTrack?.lang || preferLang).toUpperCase();
        const resolvedLabel = resolvedTrack?.label || preferLang;
        const availableLanguages = Array.from(
          new Set(validTracks.map((t) => String(t.lang || '').toUpperCase()).filter(Boolean))
        );
        const languageFallbackUsed =
          (preferLang === 'ES' && resolvedLang !== 'ES') ||
          (preferLang === 'LAT' && resolvedLang !== 'LAT') ||
          (preferLang === 'VOSE' && resolvedLang !== 'VOSE') ||
          (preferLang === 'EN' && resolvedLang !== 'EN');

        const baseCleanTitle = extractedMovidyCleanTitle || extractedGnulaCleanTitle || tmdbResolvedTitle;
        const displayTitle =
          titleHint ||
          (baseCleanTitle
            ? effectiveMediaType === 'tv'
              ? `${baseCleanTitle} · ${
                  vestDetailMeta && vestDetailMeta.currentEpisodeNumber > 1 && effectiveSeason === 1
                    ? `Ep. ${vestDetailMeta.currentEpisodeNumber}`
                    : `${effectiveSeason}x${String(effectiveEpisode).padStart(2, '0')}`
                }`
              : baseCleanTitle
            : 'RiffanTV HD');

        let combinedSubtitles = vestSubtitles;
        if (combinedSubtitles.length === 0 && resolvedTmdbId) {
          combinedSubtitles = await fetchAndCacheSubtitles(
            String(resolvedTmdbId),
            effectiveMediaType === 'tv' ? effectiveSeason : 0,
            effectiveMediaType === 'tv' ? effectiveEpisode : 0,
            1800
          );
        }

        const cacheTtlMs =
          primaryMode === 'hls' && !languageFallbackUsed
            ? 8 * 60 * 1000
            : primaryMode === 'hls'
            ? 90 * 1000
            : 20 * 1000;
        const result: ExtractedStreamResult = {
          success: true,
          mode: primaryMode,
          streamUrl: primaryStreamUrl,
          title: displayTitle,
          poster: vestDetailMeta?.coverVerticalUrl
            ? `/api/img-proxy?url=${encodeURIComponent(vestDetailMeta.coverVerticalUrl)}`
            : undefined,
          backdrop: vestDetailMeta?.coverHorizontalUrl
            ? `/api/img-proxy?url=${encodeURIComponent(vestDetailMeta.coverHorizontalUrl)}`
            : undefined,
          tracks: validTracks,
          subtitles: combinedSubtitles.length > 0 ? combinedSubtitles : undefined,
          requestedLang: preferLang,
          resolvedLang,
          resolvedLabel,
          languageFallbackUsed,
          availableLanguages,
          expiresAt: Date.now() + cacheTtlMs,
        };
        extractionCache.set(cacheKey, result);
        return res.json(formatExtractResponseForClient(req, result));
      }

      // ======================================================================
      // UNIVERSAL ZERO-DEAD-END PLAYBACK FALLBACK (ONLY WHEN DIRECT HLS = 0)
      // Combines YouTube full-episode/movie search + verified multi-server web
      // players so every episode/movie plays immediately without 404 dead ends.
      // ======================================================================
      const fallbackBaseTitle =
        titleHint || extractedMovidyCleanTitle || extractedGnulaCleanTitle || tmdbResolvedTitle || '';
      const displayFallbackTitle =
        titleHint ||
        (fallbackBaseTitle
          ? effectiveMediaType === 'tv'
            ? `${fallbackBaseTitle} · ${effectiveSeason}x${String(
                effectiveEpisode
              ).padStart(2, '0')}`
            : fallbackBaseTitle
          : 'RiffanTV HD');

      const parseYtSec = (durText: string): number => {
        const clean = String(durText || '').trim();
        if (!clean || /live|directo/i.test(clean)) return 0;
        const parts = clean.split(':').map((p) => parseInt(p.replace(/\D/g, ''), 10));
        if (parts.some((n) => Number.isNaN(n))) return 0;
        if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
        if (parts.length === 2) return parts[0] * 60 + parts[1];
        return 0;
      };

      const searchYouTubeFullFallback = async (): Promise<{
        track: TrackRecord;
        exactEpisodeMatch: boolean;
      } | null> => {
        const cleanMain = fallbackBaseTitle
          .replace(/\s*\([^)]*\)/g, '')
          .replace(/[,:;!?]+/g, ' ')
          .trim();
        if (cleanMain.length < 2) return null;

        const shortMain = cleanMain.split(/\s+/).slice(0, 4).join(' ');
        const isGenericEpTitle =
          !episodeTitleHint ||
          /^(episodio|episode|cap[ií]tulo|cap\.?|ep\.?)\s*\d+$/i.test(episodeTitleHint.trim());

        const langKeywords =
          preferLang === 'LAT'
            ? 'español latino'
            : preferLang === 'VOSE'
            ? 'sub español'
            : preferLang === 'EN'
            ? 'english'
            : 'español castellano';

        const queries: string[] = [];
        if (effectiveMediaType === 'tv') {
          if (!isGenericEpTitle && episodeTitleHint.length >= 3) {
            queries.push(`${shortMain} ${episodeTitleHint} ${preferLang === 'EN' ? 'full episode' : 'español'}`);
          }
          queries.push(
            preferLang === 'EN'
              ? `${shortMain} season ${effectiveSeason} episode ${effectiveEpisode} full episode`
              : `${shortMain} capitulo ${effectiveEpisode} ${langKeywords} completo`
          );
        } else {
          queries.push(
            preferLang === 'EN'
              ? `${shortMain} full movie`
              : `${shortMain} pelicula completa ${langKeywords}`
          );
        }

        const normEpTitle = !isGenericEpTitle ? normalizeTitleForMatch(episodeTitleHint) : '';
        const epNumRegex = new RegExp(`\\b0*${effectiveEpisode}\\b`);

        for (const q of queries.slice(0, 2)) {
          try {
            const ytRes = await fetch(
              `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&hl=es`,
              {
                headers: {
                  'User-Agent': CHROME_UA,
                  'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
                },
                signal: AbortSignal.timeout(3800),
              }
            );
            if (!ytRes.ok) continue;
            const html = await ytRes.text();
            const initMatch = html.match(/var\s+ytInitialData\s*=\s*(\{[\s\S]+?\});<\/script>/);
            if (!initMatch) continue;
            const ytData = JSON.parse(initMatch[1]);
            const sections =
              ytData?.contents?.twoColumnSearchResultsRenderer?.primaryContents
                ?.sectionListRenderer?.contents || [];

            for (const sec of sections) {
              const items = sec?.itemSectionRenderer?.contents || [];
              for (const item of items) {
                const vr = item?.videoRenderer;
                if (!vr?.videoId) continue;
                const vTitle = vr.title?.runs?.map((r: any) => r.text).join('') || '';
                const durStr = vr.lengthText?.simpleText || '';
                const durSec = parseYtSec(durStr);

                if (effectiveMediaType === 'tv') {
                  if (durSec < 360 || durSec > 7200) continue;
                } else {
                  if (durSec < 2700 || durSec > 14400) continue;
                }

                if (
                  /\b(trailer|tráiler|teaser|reaction|reaccion|reacción|review|resumen|opening|ending|amv|ost|soundtrack|gameplay|parodia|parody|shorts|#shorts|podcast|entrevista|interview|documentary essay)\b/i.test(
                    vTitle
                  )
                ) {
                  continue;
                }

                // Require ALL meaningful non-stopword title tokens as whole words (prevents 1-word hits like "the" or "you" playing unrelated videos)
                if (!matchesYouTubeFallbackTitle(shortMain, vTitle)) {
                  continue;
                }

                const normVTitle = normalizeTitleForMatch(vTitle);
                const exactEpisodeMatch =
                  effectiveMediaType === 'movie' ||
                  epNumRegex.test(vTitle) ||
                  Boolean(normEpTitle && normEpTitle.length >= 4 && normVTitle.includes(normEpTitle));

                const ytLangCode =
                  preferLang === 'LAT'
                    ? 'LAT'
                    : preferLang === 'VOSE'
                    ? 'VOSE'
                    : preferLang === 'EN'
                    ? 'EN'
                    : 'ES';
                const ytLangName =
                  ytLangCode === 'LAT'
                    ? 'Latino'
                    : ytLangCode === 'VOSE'
                    ? 'VOSE'
                    : ytLangCode === 'EN'
                    ? 'Inglés'
                    : 'Español';

                return {
                  track: {
                    id: `yt-fallback-${vr.videoId}`,
                    label: `YouTube · ${ytLangName} (${durStr})`,
                    lang: ytLangCode,
                    quality: 'HD',
                    sourceUrl: `https://www.youtube.com/watch?v=${vr.videoId}`,
                    resolverType: 'youtube',
                    resolvedStreamUrl: vr.videoId,
                  },
                  exactEpisodeMatch,
                };
              }
            }
          } catch {
            // continue to next query or web embed
          }
        }
        return null;
      };

      const buildWebEmbedTracks = async (): Promise<TrackRecord[]> => {
        if (!resolvedTmdbId) return [];
        const idStr = String(resolvedTmdbId);
        const s = Math.max(1, effectiveSeason || 1);
        const e = Math.max(1, effectiveEpisode || 1);
        const isExplicitVidfastInput = /(^|\/|https?:\/\/)(?:www\.)?vidfast\.[a-z.]+/i.test(rawInput);

        // Fast probe: check if vidsrc.buzz / videm.buzz actually has content for this title
        const hasBuzzContent = await probeVidsrcBuzzHasContent({
          tmdbId: idStr,
          mediaType: effectiveMediaType,
          season: s,
          episode: e,
        });

        const vidfastEntry =
          effectiveMediaType === 'tv'
            ? {
                id: `embed-vidfast-${idStr}-${s}-${e}`,
                label: 'Servidor Web · VidFast HD',
                url: isExplicitVidfastInput && /vidfast\.[a-z.]+\/tv\//i.test(rawInput)
                  ? rawInput
                  : `https://vidfast.vc/tv/${idStr}/${s}/${e}?autoPlay=true&theme=9146FF`,
                proxyHtml: true,
                sandboxSafe: true,
              }
            : {
                id: `embed-vidfast-${idStr}`,
                label: 'Servidor Web · VidFast HD',
                url: isExplicitVidfastInput && /vidfast\.[a-z.]+\/movie\//i.test(rawInput)
                  ? rawInput
                  : `https://vidfast.vc/movie/${idStr}?autoPlay=true&theme=9146FF`,
                proxyHtml: true,
                sandboxSafe: true,
              };

        const vidrockEntry =
          effectiveMediaType === 'tv'
            ? {
                id: `embed-vidrock-${idStr}-${s}-${e}`,
                label: 'Servidor Web · VidRock HD',
                url: `https://vidrock.net/embed/tv/${idStr}/${s}/${e}`,
                proxyHtml: true,
                sandboxSafe: true,
              }
            : {
                id: `embed-vidrock-${idStr}`,
                label: 'Servidor Web · VidRock HD',
                url: `https://vidrock.net/embed/movie/${idStr}`,
                proxyHtml: true,
                sandboxSafe: true,
              };

        const vidnestEntry =
          effectiveMediaType === 'tv'
            ? {
                id: `embed-vidnest-${idStr}-${s}-${e}`,
                label: 'Servidor Web · VidNest HD',
                url: `https://vidnest.fun/tv/${idStr}/${s}/${e}`,
                proxyHtml: true,
                sandboxSafe: true,
              }
            : {
                id: `embed-vidnest-${idStr}`,
                label: 'Servidor Web · VidNest HD',
                url: `https://vidnest.fun/movie/${idStr}`,
                proxyHtml: true,
                sandboxSafe: true,
              };

        const vidsrcBuzzEntry =
          effectiveMediaType === 'tv'
            ? {
                id: `embed-vidsrcbuzz-${idStr}-${s}-${e}`,
                label: 'Servidor Web 1 · Cloud Limpio',
                url: `https://vidsrc.buzz/embed/tv/${idStr}/${s}/${e}`,
                proxyHtml: true,
                sandboxSafe: true,
              }
            : {
                id: `embed-vidsrcbuzz-${idStr}`,
                label: 'Servidor Web 1 · Cloud Limpio',
                url: `https://vidsrc.buzz/embed/movie/${idStr}`,
                proxyHtml: true,
                sandboxSafe: true,
              };

        const videmBuzzEntry =
          effectiveMediaType === 'tv'
            ? {
                id: `embed-vidembuzz-${idStr}-${s}-${e}`,
                label: 'Servidor Web 2 · VidEm Limpio',
                url: `https://videm.buzz/embed/tv/${idStr}/${s}/${e}`,
                proxyHtml: true,
                sandboxSafe: true,
              }
            : {
                id: `embed-vidembuzz-${idStr}`,
                label: 'Servidor Web 2 · VidEm Limpio',
                url: `https://videm.buzz/embed/movie/${idStr}`,
                proxyHtml: true,
                sandboxSafe: true,
              };

        const twoEmbedEntry =
          effectiveMediaType === 'tv'
            ? {
                id: `embed-2embed-${idStr}-${s}-${e}`,
                label: 'Servidor Web 3 · 2Embed Limpio',
                url: `https://www.2embed.cc/embedtv/${idStr}&s=${s}&e=${e}`,
                proxyHtml: true,
                sandboxSafe: true,
              }
            : {
                id: `embed-2embed-${idStr}`,
                label: 'Servidor Web 3 · 2Embed Limpio',
                url: `https://www.2embed.cc/embed/${idStr}`,
                proxyHtml: true,
                sandboxSafe: true,
              };

        const vidlinkEntry =
          effectiveMediaType === 'tv'
            ? {
                id: `embed-vidlink-${idStr}-${s}-${e}`,
                label: 'Servidor Web 4 · Multi-Audio',
                url: `https://vidlink.pro/tv/${idStr}/${s}/${e}?autoplay=true&primaryColor=9146FF`,
                proxyHtml: false,
                sandboxSafe: false,
              }
            : {
                id: `embed-vidlink-${idStr}`,
                label: 'Servidor Web 4 · Multi-Audio',
                url: `https://vidlink.pro/movie/${idStr}?autoplay=true&primaryColor=9146FF`,
                proxyHtml: false,
                sandboxSafe: false,
              };

        const vidsrcShEntry =
          effectiveMediaType === 'tv'
            ? {
                id: `embed-vidsrcsh-${idStr}-${s}-${e}`,
                label: 'Servidor Web 5 · VidSrc',
                url: `https://vidsrc.sh/embed/tv/${idStr}/${s}-${e}`,
                proxyHtml: false,
                sandboxSafe: false,
              }
            : {
                id: `embed-vidsrcsh-${idStr}`,
                label: 'Servidor Web 5 · VidSrc',
                url: `https://vidsrc.sh/embed/movie/${idStr}`,
                proxyHtml: false,
                sandboxSafe: false,
              };

        // When vidsrc.buzz lacks content, avoid serving dead placeholder screens
        let baseEntries: any[];
        if (isExplicitVidfastInput) {
          baseEntries = [vidfastEntry, vidrockEntry, vidnestEntry, twoEmbedEntry, vidlinkEntry];
        } else if (hasBuzzContent) {
          baseEntries = [
            vidsrcBuzzEntry,
            videmBuzzEntry,
            vidfastEntry,
            vidrockEntry,
            twoEmbedEntry,
            vidlinkEntry,
          ];
        } else {
          baseEntries = [
            vidfastEntry,
            vidrockEntry,
            vidnestEntry,
            twoEmbedEntry,
            vidlinkEntry,
            vidsrcShEntry,
          ];
        }

        // Inside sandboxed preview frames, exclude hosts that self-block and proxy HTML-sanitizable players (including VidFast) through /api/embed-proxy
        const orderedEntries = (isSandboxedFrame
          ? baseEntries.filter((entry) => entry.sandboxSafe)
          : baseEntries
        ).slice(0, 5);

        return orderedEntries.map((entry) => ({
          id: entry.id,
          label: entry.label,
          lang: 'EN',
          quality: '1080p',
          sourceUrl: entry.url,
          resolverType: 'web_embed' as const,
          resolvedStreamUrl: entry.proxyHtml
            ? `/api/embed-proxy?url=${encodeURIComponent(entry.url)}`
            : entry.url,
        }));
      };

      const [ytFallback, embedFallbackTracks] = await Promise.all([
        // Run YouTube search when preferLang is ES or when TMDB ID is absent so Spanish TV shows play in authentic Castellano
        preferLang === 'ES' || !resolvedTmdbId
          ? searchYouTubeFullFallback().catch(() => null)
          : Promise.resolve(null),
        buildWebEmbedTracks(),
      ]);

      const combinedFallbackTracks: TrackRecord[] =
        ytFallback && (preferLang === 'ES' || embedFallbackTracks.length === 0)
          ? [ytFallback.track, ...embedFallbackTracks]
          : embedFallbackTracks.length > 0
          ? [...embedFallbackTracks, ...(ytFallback ? [ytFallback.track] : [])]
          : ytFallback
          ? [ytFallback.track]
          : [];

      if (combinedFallbackTracks.length > 0) {
        const firstTrack = combinedFallbackTracks[0];
        const fallbackMode: ExtractedStreamResult['mode'] =
          firstTrack.resolverType === 'youtube' ? 'youtube' : 'embed';
        const resolvedLang = String(firstTrack.lang || 'EN').toUpperCase();
        const fallbackResult: ExtractedStreamResult = {
          success: true,
          mode: fallbackMode,
          streamUrl: firstTrack.resolvedStreamUrl || firstTrack.sourceUrl,
          rawStreamUrl: firstTrack.sourceUrl,
          youtubeId:
            firstTrack.resolverType === 'youtube' ? firstTrack.resolvedStreamUrl : undefined,
          title: displayFallbackTitle,
          tracks: combinedFallbackTracks,
          requestedLang: preferLang,
          resolvedLang,
          resolvedLabel: firstTrack.label,
          languageFallbackUsed: resolvedLang !== preferLang,
          availableLanguages: Array.from(
            new Set(combinedFallbackTracks.map((t) => String(t.lang || '').toUpperCase()))
          ),
          expiresAt: Date.now() + 30 * 1000,
        };
        extractionCache.set(cacheKey, fallbackResult);
        return res.json(formatExtractResponseForClient(req, fallbackResult));
      }
    }

    // CASE 5: Live Sports Channel / External Web URL -> Pure Crypto Direct (<350ms) + Green-Screen Guard + Safe Fallback
    if (rawInput) {
      const fullTargetUrl = /^https?:\/\//i.test(rawInput) ? rawInput : `https://${rawInput}`;
      const directSports = await extractLiveSportsHlsDirect(fullTargetUrl);

      if (directSports?.isBrokenGreenFeed) {
        return res.status(502).json({
          success: false,
          canUseCloudBrowser: false,
          error: 'Señal satélite en mantenimiento temporal; cambiando automáticamente a señal alternativa.',
        });
      }

      // For sports_channel tracks on known mirrors (footunder / tilinhd / streamxhd), skip slow headless Chrome if direct HTTP failed
      const isKnownDirectMirror = /footunder\.online|tilinhd\.|streamxhd\./i.test(fullTargetUrl);
      if (!directSports && resolverType === 'sports_channel' && isKnownDirectMirror) {
        return res.status(404).json({
          success: false,
          canUseCloudBrowser: false,
          error: 'Esta señal no está activa en este instante. Elige otra señal o canal.',
        });
      }

      const sniffed = directSports || (await sniffStreamWithHeadless(fullTargetUrl));

      if (sniffed && sniffed.streamUrl) {
        if (!sniffed.isDirectMp4 && resolverType === 'sports_channel') {
          const checkM3u = await fetchSportsHtmlHop(sniffed.streamUrl, sniffed.referer);
          if (checkM3u.includes('#EXTM3U')) {
            const clean = await verifyM3u8HasCleanVideoFrame(
              checkM3u,
              sniffed.streamUrl,
              sniffed.referer
            );
            if (!clean) {
              return res.status(502).json({
                success: false,
                canUseCloudBrowser: false,
                error: 'Señal con interferencias descartada automáticamente; saltando a respaldo HD.',
              });
            }
          }
        }

        const proxiedUrl = sniffed.isDirectMp4
          ? buildTsProxyUrl(sniffed.streamUrl, sniffed.referer)
          : buildHlsProxyUrl(sniffed.streamUrl, sniffed.referer);

        const result: ExtractedStreamResult = {
          success: true,
          mode: sniffed.isDirectMp4 ? 'direct' : 'hls',
          streamUrl: proxiedUrl,
          rawStreamUrl: sniffed.streamUrl,
          referer: sniffed.referer,
          expiresAt: Date.now() + 3 * 60 * 1000,
        };
        extractionCache.set(cacheKey, result);
        return res.json(formatExtractResponseForClient(req, result));
      }

      // Route external embed pages through /api/embed-proxy so they render inline without leaving the page or hitting sandbox blocks
      let canFrame = false;
      let canProxyInline = false;
      try {
        const probeController = new AbortController();
        const probeTimer = setTimeout(() => probeController.abort(), 3500);
        const probeRes = await fetch(fullTargetUrl, {
          headers: { 'User-Agent': CHROME_UA },
          signal: probeController.signal,
        });
        clearTimeout(probeTimer);
        const ct = String(probeRes.headers.get('content-type') || '').toLowerCase();
        const xfo = String(probeRes.headers.get('x-frame-options') || '').toLowerCase();
        const csp = String(probeRes.headers.get('content-security-policy') || '').toLowerCase();
        probeController.abort();
        const blockedByXfo = xfo.includes('deny') || xfo.includes('sameorigin');
        const blockedByCsp =
          csp.includes('frame-ancestors') &&
          !csp.includes('frame-ancestors *') &&
          !csp.includes('frame-ancestors https:');
        canFrame = probeRes.ok && !blockedByXfo && !blockedByCsp;
        canProxyInline = probeRes.ok && ct.includes('text/html');
      } catch {
        canFrame = false;
        canProxyInline = false;
      }

      const useInlineProxy =
        canProxyInline ||
        /(^|\.)(vidfast\.[a-z.]+|vidsrc\.[a-z.]+|videm\.buzz|2embed\.cc)/i.test(fullTargetUrl);
      const inlineEmbedUrl = useInlineProxy
        ? `/api/embed-proxy?url=${encodeURIComponent(fullTargetUrl)}`
        : fullTargetUrl;
      const playInline = canFrame || useInlineProxy;

      const extFallbackResult: ExtractedStreamResult = {
        success: true,
        mode: playInline ? 'embed' : 'cloud',
        streamUrl: playInline ? inlineEmbedUrl : fullTargetUrl,
        rawStreamUrl: fullTargetUrl,
        title: titleHint || 'Señal Web Directa',
        tracks: playInline
          ? [
              {
                id: 'ext-web-embed-1',
                label: 'Reproductor Web Integrado',
                lang: preferLang || 'ES',
                sourceUrl: fullTargetUrl,
                resolverType: 'web_embed',
                resolvedStreamUrl: inlineEmbedUrl,
              },
            ]
          : [],
        expiresAt: Date.now() + 2 * 60 * 1000,
      };
      return res.json(formatExtractResponseForClient(req, extFallbackResult));
    }

    return res.status(404).json({
      success: false,
      canUseCloudBrowser: true,
      error:
        'No se encontró ninguna señal activa para este enlace.',
    });
  } catch (err) {
    console.error('Extract stream error:', err);
    return res.status(500).json({
      success: false,
      canUseCloudBrowser: true,
      error: 'Error temporal al extraer el flujo de vídeo.',
    });
  }
});



registerDetailsAndSubtitlesRoutes(app, {
  resolveTmdbIdByTitle,
  extractLocalizedTmdbTitleHints,
});


// ============================================================================
// PWA SERVICE WORKER: SERVE PRODUCTION DIST SW.JS OR CLEAN NOOP IN DEV
// ============================================================================
app.get(['/sw.js', '/service-worker.js'], (_req, res) => {
  const distSw = path.resolve(__dirname, 'dist', 'sw.js');
  if (ENV.isProd && fs.existsSync(distSw)) {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    return res.sendFile(distSw);
  }
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.send(`self.addEventListener('message', (e) => { if (e.data?.type === 'SKIP_WAITING') self.skipWaiting(); });`);
});

// ============================================================================
// VITE + PRODUCTION STATIC MOUNTING (INSTANT PORT 3000 BINDING)
// ============================================================================
async function startServer() {
  const PORT = ENV.port;
  const isProd = ENV.isProd;

  // Mount global API error handler prior to Vite / SPA fallback
  app.use(expressErrorHandler);

  if (!isProd) {
    let viteMiddleware: express.RequestHandler | null = null;
    let viteInitError: unknown = null;
    const viteReady = (async () => {
      const { createServer: createViteServer } = await import('vite');
      const hmrEnabled = process.env.DISABLE_HMR !== 'true';
      const vite = await createViteServer({
        server: {
          middlewareMode: true,
          allowedHosts: true,
          hmr: hmrEnabled ? { server: httpServer } : false,
        },
        appType: 'spa',
      });
      viteMiddleware = vite.middlewares;
    })().catch((err) => {
      viteInitError = err;
      logger.error({ err }, 'vite_dev_server_init_failed');
    });

    app.use(async (req, res, next) => {
      if (!viteMiddleware && !viteInitError) {
        await viteReady;
      }
      if (viteInitError || !viteMiddleware) {
        res.status(503).json({
          ok: false,
          error: 'Dev frontend compiler unavailable',
        });
        return;
      }
      return viteMiddleware(req, res, next);
    });
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    const distIndex = path.join(distDir, 'index.html');
    if (fs.existsSync(distDir)) {
      app.use(
        express.static(distDir, {
          maxAge: '7d',
          setHeaders: (res, filePath) => {
            if (filePath.endsWith('.html') || filePath.endsWith('sw.js')) {
              res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
            }
          },
        })
      );
    } else {
      logger.warn({ distDir }, 'production_dist_directory_missing');
    }

    app.get('*', (req, res) => {
      if (req.path === '/tv' || req.path === '/tv/') {
        return sendSmartTvReceiverHtml(res);
      }
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
      if (fs.existsSync(distIndex)) {
        return res.sendFile(distIndex);
      }
      return res
        .status(503)
        .type('text/plain')
        .send('RiffanTV engine is running; frontend build (dist/index.html) not found.');
    });
  }

  httpServer.on('error', (err) => {
    logger.error({ err, port: PORT }, 'http_server_listen_error');
  });

  httpServer.listen(PORT, '0.0.0.0', () => {
    logger.info({ port: PORT, env: ENV.nodeEnv }, 'naim_cine_engine_started');
    if (ENV.nodeEnv !== 'test') {
      setImmediate(() => {
        try {
          void resolveActiveGnulaMirrors().catch(() => undefined);
          void refreshLiveIptvRegistry(false).catch(() => undefined);
          channelHealthMonitor.startScheduler(
            () => [
              ...applySyncedStreamsToChannels(SPANISH_TDT_CHANNELS),
              ...CATALA_LIVE_CHANNELS,
              ...getPermanent247SportsMatches(),
              ...getCachedSportsMatches(),
            ],
            3 * 60 * 1000,
            20_000
          );
          startCatalogRefreshScheduler(15 * 60 * 1000);
        } catch (err) {
          logger.error({ err }, 'background_scheduler_init_error');
        }
      });
    }
  });
}

startServer().catch((err) => {
  logger.error({ err }, 'fatal_start_server_error');
});

process.on('uncaughtException', (err) => {
  logger.error({ err }, 'uncaught_exception');
});
process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'unhandled_rejection');
});
process.on('SIGTERM', () => {
  logger.info('sigterm_graceful_shutdown');
  httpServer.close(() => process.exit(0));
});
process.on('SIGINT', () => {
  logger.info('sigint_graceful_shutdown');
  httpServer.close(() => process.exit(0));
});

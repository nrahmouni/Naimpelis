import dns from 'dns';
import crypto from 'crypto';
import fs from 'fs';
import zlib from 'zlib';
import express from 'express';
import compression from 'compression';
import { createServer } from 'http';
import { Readable } from 'stream';
import { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import { ENV } from './server/config/env.ts';
import { logger } from './server/utils/logger.ts';
import { LruTtlCache } from './server/utils/lruCache.ts';
import { assertSafeProxyUrl } from './server/utils/ssrfGuard.ts';
import { streamingFetch } from './server/utils/tlsFetch.ts';
import {
  applyPublicCacheHeaders,
  expressErrorHandler,
  securityHeadersMiddleware,
} from './server/middleware/errorHandler.ts';
import { serviceMeshGatewayMiddleware } from './server/gateway/serviceMesh.ts';
import { registerOperationalRoutes } from './server/routes/health.ts';
import { registerExpandedCatalogRoutes } from './server/routes/expandedCatalog.ts';
import { registerProxyRoutes } from './server/routes/proxies.ts';
import { createRoomHub } from './server/ws/roomHub.ts';
import {
  CHROME_UA,
  TDT_DVB_UA,
  buildHlsProxyUrl,
  buildTsProxyUrl,
  curlGetText,
  isDvbHeadendStream,
  markHostNeedsCurlFallback,
  normalizeTitleForMatch,
  resolveKnownUpstreamReferer,
  shouldBypassNodeFetch,
  type ExtractedStreamResult,
  type TrackRecord,
} from './server/extractors/httpHelpers.ts';
import {
  extractEmbed69SpanishTracks,
  unpackVidhideToHls,
} from './server/extractors/vidhideEmbed69.ts';
import {
  decodeNuploadToHls,
  extract2EmbedEnglishTracks,
  extractBingetrixEnglishTracks,
  extractMovidyPageTracks,
  fetchMovidyPageMetadata,
  findMovidyUrlByTitle,
  probeAvailableLanguages,
  type MovidyPageMetadata,
} from './server/extractors/bingetrixMovidy.ts';
import {
  extractLiveSportsHlsDirect,
  fetchSportsHtmlHop,
  sniffStreamWithHeadless,
  verifyM3u8HasCleanVideoFrame,
} from './server/extractors/sportsExtractor.ts';
import {
  fetchTmdbTitleLogo,
  resolveLocalizedTmdbTitle,
} from './server/services/tmdbService.ts';
import {
  doFootballTeamNamesMatch,
  fetchFotmobDayIndex,
  fetchRealFootballMatchDetails,
  getRegionLabelFromCcode,
} from './server/services/footballLiveService.ts';
import {
  curlPlainGetText,
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
  getCatalogRefreshStatus,
  liveOnDemandFallbackSearch,
  runRefreshCycle,
  scoreTitleRelevance,
  searchIndexedCatalog,
  startCatalogRefreshScheduler,
} from './server/services/catalogRefreshService.ts';

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
  if (ENV.publicDomain && /^ais-dev-/i.test(rawHost)) {
    return `https://${ENV.publicDomain}`;
  }
  const proto =
    rawHost.endsWith('.run.app') || rawHost.endsWith('.ai.studio') ? 'https' : rawProto;
  return `${proto}://${rawHost}`;
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

httpServer.on('upgrade', (req, socket, head) => {
  const pathname = (req.url || '').split('?')[0];
  if (pathname === '/ws') {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  }
});

app.use(compression());
app.use(securityHeadersMiddleware);
app.use(express.json({ limit: '1mb' }));
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
      ...(cachedSportsSchedule?.matches || []),
    ];
    await channelHealthMonitor.runSweep(channels, { force });
  },
});

registerExpandedCatalogRoutes(app);
registerProxyRoutes(app, { getPublicOrigin });

// Direct Ready-to-Install Signed Android APK Download (Mobile & Google TV / Chromecast)
app.get(['/NAIM-CINE-TV.apk', '/tv.apk', '/googletv.apk', '/api/download/apk-tv'], (req, res) => {
  const pubTvApk = path.resolve(__dirname, 'public', 'NAIM-CINE-TV.apk');
  const distTvApk = path.resolve(__dirname, 'dist', 'NAIM-CINE-TV.apk');
  const target = fs.existsSync(pubTvApk) ? pubTvApk : distTvApk;
  res.setHeader('Content-Type', 'application/vnd.android.package-archive');
  res.setHeader('Content-Disposition', 'attachment; filename="NAIM-CINE-TV.apk"');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  if (fs.existsSync(target)) {
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
});

app.get(['/NAIM-CINE.apk', '/naimcine.apk', '/movil.apk', '/api/download/apk'], (req, res) => {
  const pubApk = path.resolve(__dirname, 'public', 'NAIM-CINE.apk');
  const distApk = path.resolve(__dirname, 'dist', 'NAIM-CINE.apk');
  const target = fs.existsSync(pubApk) ? pubApk : distApk;
  res.setHeader('Content-Type', 'application/vnd.android.package-archive');
  res.setHeader('Content-Disposition', 'attachment; filename="NAIM-CINE.apk"');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  if (fs.existsSync(target)) {
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
});

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
const MOVIE_GENRE_MAP: Record<string, number> = {
  action: 28,
  scifi: 878,
  horror: 27,
  comedy: 35,
  animation: 16,
  thriller: 53,
  adventure: 12,
  drama: 18,
};

const movieCatalogCache = new LruTtlCache<string, { movies: any[]; hasMore: boolean; ts: number }>(
  180,
  15 * 60 * 1000
);

const MOVIDY_GENRE_SLUGS: Record<string, string> = {
  action: 'accion',
  scifi: 'ciencia-ficcion',
  horror: 'terror',
  comedy: 'comedia',
  animation: 'animacion',
  thriller: 'suspense',
  adventure: 'aventura',
  drama: 'drama',
};

async function scrapeMovidyCatalog(opts: {
  category: string;
  page: number;
  query: string;
}): Promise<{ movies: any[]; hasMore: boolean }> {
  try {
    const { category, page, query } = opts;
    let targetUrl = 'https://movidy.pw/pelis/';

    if (query) {
      targetUrl = `https://movidy.pw/?s=${encodeURIComponent(query)}`;
    } else if (MOVIDY_GENRE_SLUGS[category]) {
      const slug = MOVIDY_GENRE_SLUGS[category];
      targetUrl =
        page > 1
          ? `https://movidy.pw/genero/${slug}/page/${page}`
          : `https://movidy.pw/genero/${slug}/`;
    } else {
      targetUrl = page > 1 ? `https://movidy.pw/pelis/page/${page}` : 'https://movidy.pw/pelis/';
    }

    let html = '';
    try {
      const res = await fetch(targetUrl, {
        headers: { 'User-Agent': CHROME_UA, Referer: 'https://movidy.pw/' },
        signal: AbortSignal.timeout(4500),
      });
      if (res.ok) {
        html = await res.text();
      }
    } catch {
      const fb = await curlGetText(
        targetUrl,
        { 'User-Agent': CHROME_UA, Referer: 'https://movidy.pw/' },
        5
      ).catch(() => ({ text: '' }));
      html = fb.text;
    }

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
      const movidyUrl = rawHref.startsWith('http') ? rawHref : `https://movidy.pw${rawHref}`;

      const absPoster = rawPoster.startsWith('//')
        ? `https:${rawPoster}`
        : rawPoster.startsWith('http')
        ? rawPoster
        : `https://movidy.pw${rawPoster}`;
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
    console.warn('scrapeMovidyCatalog error:', err);
    return { movies: [], hasMore: false };
  }
}

const ANIME_PROVIDER_IDS = new Set([
  'anime_all',
  'crunchyroll',
  'animebox',
  'jkanime',
  'animeflv',
]);

// Top Legendary Masterpiece Anime Requested by User (always authentic & rich in Castellano / Latino / VOSE 1080p)
const USER_MASTERPIECE_ANIME_TV_IDS = [
  1429,   // Attack on Titan (Ataque a los Titanes / Shingeki no Kyojin)
  127532, // Solo Leveling
  95479,  // Jujutsu Kaisen
  85937,  // Demon Slayer (Kimetsu no Yaiba: Guardianes de la Noche)
  31911,  // Fullmetal Alchemist: Brotherhood
  46298,  // Hunter × Hunter (2011)
  13916,  // Death Note
  37854,  // One Piece
  42509,  // Steins;Gate
  88803,  // Vinland Saga
  35935,  // Berserk: La Historia de la Espada Feroz (1997)
  66053,  // Berserk (2016)
  62104,  // Los siete pecados capitales (The Seven Deadly Sins / Nanatsu no Taizai)
];

function matchMasterpieceAnimeIds(rawQuery: string): number[] {
  const norm = String(rawQuery || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  if (!norm) return [];

  if (
    /^(attack on titan|ataque a los titanes|shingeki|shingeki no kyojin|aot|titanes?)$/i.test(norm) ||
    /\b(attack on titan|ataque a los titanes|shingeki no kyojin)\b/i.test(norm)
  ) {
    return [1429];
  }
  if (
    /^(fullmetal|fullmetal alchemist|brotherhood|fma|alchemist|full metal)$/i.test(norm) ||
    /\b(fullmetal|full metal alchemist)\b/i.test(norm)
  ) {
    return [31911];
  }
  if (
    /^(hunter x hunter|hunter|hunterxhunter|hxh|cazador x)$/i.test(norm) ||
    /\b(hunter x hunter|hunterxhunter)\b/i.test(norm)
  ) {
    return [46298, 45952];
  }
  if (/^(death note|deathnote|shinigami|light yagami)$/i.test(norm) || /\b(death note)\b/i.test(norm)) {
    return [13916];
  }
  if (/^(one piece|onepiece|luffy|straw hat)$/i.test(norm) || /\b(one piece)\b/i.test(norm)) {
    return [37854];
  }
  if (/^(jujutsu|jujutsu kaisen|jjk|sukuna|gojo)$/i.test(norm) || /\b(jujutsu kaisen)\b/i.test(norm)) {
    return [95479];
  }
  if (
    /^(demon slayer|kimetsu|kimetsu no yaiba|guardianes de la noche|tanjiro)$/i.test(norm) ||
    /\b(demon slayer|kimetsu no yaiba|guardianes de la noche)\b/i.test(norm)
  ) {
    return [85937];
  }
  if (/^(steins gate|steinsgate|steins|okabe)$/i.test(norm) || /\b(steins gate|steinsgate)\b/i.test(norm)) {
    return [42509];
  }
  if (/^(vinland|vinland saga|thorfinn)$/i.test(norm) || /\b(vinland saga)\b/i.test(norm)) {
    return [88803];
  }
  if (/^(berserk|berserk 1997|berserk 2016|guts)$/i.test(norm) || /\b(berserk)\b/i.test(norm)) {
    return [35935, 66053];
  }
  if (
    /^(los 7 pecados capitales|7 pecados capitales|los 7 pecados|7 pecados|los siete pecados capitales|siete pecados capitales|los siete pecados|nanatsu no taizai|nanatsu|seven deadly sins|meliodas)$/i.test(norm) ||
    /\b(7 pecados|siete pecados|nanatsu no taizai|seven deadly sins)\b/i.test(norm)
  ) {
    return [62104];
  }
  if (/^(solo leveling|sololeveling|sung jinwoo|jinwoo)$/i.test(norm) || /\b(solo leveling)\b/i.test(norm)) {
    return [127532];
  }
  return [];
}

// Selecta Visión / AnimeBox Spain flagship TV & Movie TMDB IDs (always authentic & rich in Castellano/VOSE)
const ANIMEBOX_CURATED_TV_IDS = [
  ...USER_MASTERPIECE_ANIME_TV_IDS,
  12971, // Dragon Ball Z
  12609, // Dragon Ball
  62715, // Dragon Ball Super
  46260, // Naruto
  31910, // Naruto Shippuden
  203737, // Oshi no Ko
  46261, // Fairy Tail
  60863, // Haikyu!!
  42444, // Saint Seiya: Los Caballeros del Zodiaco
  30669, // Yu Yu Hakusho
  42445, // Slam Dunk
  35610, // Inuyasha
  61374, // Tokyo Ghoul
  61663, // Assassination Classroom
];

const ANIMEBOX_CURATED_MOVIE_IDS = [
  372058, // Your Name
  916224, // Suzume
  503314, // Dragon Ball Super: Broly
  149, // Akira
  378064, // A Silent Voice (La voz silenciosa)
  568160, // El tiempo contigo (Weathering with You)
  783675, // The First Slam Dunk
  635302, // Kimetsu no Yaiba: El tren infinito
];

const STREAMING_PROVIDER_MAP: Record<
  string,
  {
    id: string;
    label: string;
    watchProviders: string;
    tvNetworks: string;
    movieCompanies?: string;
    isAnimePortal?: boolean;
    watchRegion?: string;
  }
> = {
  netflix: {
    id: 'netflix',
    label: 'Netflix',
    watchProviders: '8|1796',
    tvNetworks: '213',
  },
  hbomax: {
    id: 'hbomax',
    label: 'HBO Max',
    watchProviders: '1899|1825|384',
    tvNetworks: '49|3186',
    movieCompanies: '174|49',
  },
  disney: {
    id: 'disney',
    label: 'Disney+',
    watchProviders: '337',
    tvNetworks: '2739|453|88',
    movieCompanies: '2|3|420|1',
  },
  prime: {
    id: 'prime',
    label: 'Prime Video',
    watchProviders: '119|2100',
    tvNetworks: '1024',
    movieCompanies: '1024|20580',
  },
  apple: {
    id: 'apple',
    label: 'Apple TV+',
    watchProviders: '350|2243',
    tvNetworks: '2552',
    movieCompanies: '194232',
  },
  movistar: {
    id: 'movistar',
    label: 'Movistar+',
    watchProviders: '2241|149',
    tvNetworks: '678',
  },
  skyshowtime: {
    id: 'skyshowtime',
    label: 'SkyShowtime',
    watchProviders: '1773|2801',
    tvNetworks: '4330|67',
  },
  anime_all: {
    id: 'anime_all',
    label: 'Anime',
    watchProviders: '',
    tvNetworks: '',
    isAnimePortal: true,
  },
  crunchyroll: {
    id: 'crunchyroll',
    label: 'Crunchyroll',
    watchProviders: '283|1968',
    tvNetworks: '1112',
    isAnimePortal: true,
    watchRegion: 'US',
  },
  animebox: {
    id: 'animebox',
    label: 'AnimeBox',
    watchProviders: '2735',
    tvNetworks: '',
    isAnimePortal: true,
    watchRegion: 'ES',
  },
  jkanime: {
    id: 'jkanime',
    label: 'JKAnime',
    watchProviders: '',
    tvNetworks: '',
    isAnimePortal: true,
  },
  animeflv: {
    id: 'animeflv',
    label: 'AnimeFLV',
    watchProviders: '',
    tvNetworks: '',
    isAnimePortal: true,
  },
};

function resolveEffectiveProviderAndQuery(
  rawProvider: string,
  rawQuery: string
): { provider: string; query: string } {
  const cleanProvider = String(rawProvider || 'all').toLowerCase().trim();
  const cleanQuery = String(rawQuery || '').trim();
  const normQ = cleanQuery.toLowerCase().replace(/\s+/g, ' ');

  if (normQ === 'netflix') return { provider: 'netflix', query: '' };
  if (normQ === 'hbo' || normQ === 'hbo max' || normQ === 'hbomax' || normQ === 'max') {
    return { provider: 'hbomax', query: '' };
  }
  if (normQ === 'disney' || normQ === 'disney+' || normQ === 'disney plus') {
    return { provider: 'disney', query: '' };
  }
  if (
    normQ === 'prime' ||
    normQ === 'prime video' ||
    normQ === 'amazon' ||
    normQ === 'amazon prime'
  ) {
    return { provider: 'prime', query: '' };
  }
  if (normQ === 'apple tv' || normQ === 'apple tv+' || normQ === 'apple') {
    return { provider: 'apple', query: '' };
  }
  if (normQ === 'movistar' || normQ === 'movistar+' || normQ === 'movistar plus') {
    return { provider: 'movistar', query: '' };
  }
  if (normQ === 'skyshowtime') {
    return { provider: 'skyshowtime', query: '' };
  }
  if (normQ === 'crunchyroll') {
    return { provider: 'crunchyroll', query: '' };
  }
  if (normQ === 'animebox' || normQ === 'anime box') {
    return { provider: 'animebox', query: '' };
  }
  if (normQ === 'jkanime' || normQ === 'jk anime') {
    return { provider: 'jkanime', query: '' };
  }
  if (normQ === 'animeflv' || normQ === 'anime flv') {
    return { provider: 'animeflv', query: '' };
  }
  if (normQ === 'anime') {
    return { provider: 'anime_all', query: '' };
  }

  return {
    provider: STREAMING_PROVIDER_MAP[cleanProvider] ? cleanProvider : 'all',
    query: cleanQuery,
  };
}

const ANIME_MOVIE_GENRE_EXTRAS: Record<string, string> = {
  shonen: '16,28',
  action: '16,28',
  fantasy: '16,14',
  scifi: '16,878',
  comedy: '16,35',
  drama: '16,18',
};

async function fetchTmdbItemsByIds(
  ids: number[],
  mediaType: 'movie' | 'tv',
  lang: 'es-ES' | 'en-US'
): Promise<any[]> {
  const results = await Promise.all(
    ids.map((id) =>
      fetch(
        `https://api.themoviedb.org/3/${mediaType}/${id}?api_key=${TMDB_API_KEY}&language=${lang}`,
        { signal: AbortSignal.timeout(3500) }
      )
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)
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

async function fetchTmdbMovieCatalog(opts: {
  lang: 'es-ES' | 'en-US';
  category: string;
  page: number;
  query: string;
  provider?: string;
}) {
  const { lang, category, page } = opts;
  const { provider, query } = resolveEffectiveProviderAndQuery(opts.provider || 'all', opts.query);
  const provCfg = STREAMING_PROVIDER_MAP[provider];
  const isAnime = ANIME_PROVIDER_IDS.has(provider);

  const cacheKey = `v6|${lang}|${provider}|${category}|${page}|${query}`;
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
  } else if (category === 'popular') {
    endpoint = `https://api.themoviedb.org/3/movie/popular?api_key=${TMDB_API_KEY}&language=${lang}&page=${page}`;
  } else if (category === 'top_rated') {
    endpoint = `https://api.themoviedb.org/3/movie/top_rated?api_key=${TMDB_API_KEY}&language=${lang}&page=${page}`;
  } else if (category === 'now_playing') {
    endpoint = `https://api.themoviedb.org/3/movie/now_playing?api_key=${TMDB_API_KEY}&language=${lang}&page=${page}`;
  } else if (MOVIE_GENRE_MAP[category]) {
    endpoint = `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_API_KEY}&language=${lang}&sort_by=popularity.desc&vote_count.gte=45&primary_release_date.lte=${todayIso}&with_genres=${MOVIE_GENRE_MAP[category]}&page=${page}&include_adult=false`;
  } else {
    endpoint = `https://api.themoviedb.org/3/trending/movie/week?api_key=${TMDB_API_KEY}&language=${lang}&page=${page}`;
  }

  let res = await fetch(endpoint, { signal: AbortSignal.timeout(5000) });
  let json: any = res.ok ? await res.json() : { results: [], total_pages: 1 };
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
      fetch(
        `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&language=${otherLang}&query=${encodeURIComponent(
          query
        )}&page=1&include_adult=false`,
        { signal: AbortSignal.timeout(3500) }
      )
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      fetch(
        `https://api.themoviedb.org/3/search/multi?api_key=${TMDB_API_KEY}&language=en-US&query=${encodeURIComponent(
          query
        )}&page=1&include_adult=false`,
        { signal: AbortSignal.timeout(3500) }
      )
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
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
            try {
              const er = await fetch(
                `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&language=${lang}&query=${encodeURIComponent(vq)}&page=1&include_adult=false`,
                { signal: AbortSignal.timeout(3000) }
              );
              if (!er.ok) return [];
              const ej: any = await er.json().catch(() => null);
              return Array.isArray(ej?.results) ? ej.results : [];
            } catch {
              return [];
            }
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
    const fbRes = await fetch(
      `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_API_KEY}&language=${lang}&with_genres=${animeGenres}&with_original_language=ja&sort_by=popularity.desc&vote_count.gte=30&primary_release_date.lte=${todayIso}&page=${page}&include_adult=false`,
      { signal: AbortSignal.timeout(4500) }
    ).catch(() => null);
    if (fbRes?.ok) {
      const fbJson: any = await fbRes.json();
      if (Array.isArray(fbJson?.results) && fbJson.results.length > results.length) {
        results = fbJson.results;
        totalPages = Number(fbJson?.total_pages || 1);
      }
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
    .map((m) => ({
      id: `${isEn ? 'bingetrix' : 'es'}-${provider}-movie-${m.id}`,
      tmdbId: m.id,
      mediaType: 'movie',
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
        ? ['Español', 'VOSE · Sub', 'EN']
        : isEn
        ? ['English 1080p', 'ES / LAT']
        : ['Castellano', 'Latino', 'EN'],
      platform: provCfg?.label,
      providerId: provCfg ? provider : undefined,
    }));

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
    const page = Math.max(1, Math.min(100, parseInt(String(req.query.page || '1'), 10) || 1));

    const mergedCacheKey = `merged-es-v7|${provider}|${category}|${page}|${query}`;
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

    const [movidyData, tmdbData] = await Promise.all([
      scrapeMovidyCatalog({ category, page, query }),
      fetchTmdbMovieCatalog({ lang: 'es-ES', category, page, query, provider }),
    ]);

    const tmdbByNormTitle = new Map<string, any>();
    for (const tm of tmdbData.movies) {
      const kTitle = normalizeTitleForMatch(tm.title);
      const kOrig = normalizeTitleForMatch(tm.originalTitle || '');
      if (kTitle && !tmdbByNormTitle.has(kTitle)) tmdbByNormTitle.set(kTitle, tm);
      if (kOrig && !tmdbByNormTitle.has(kOrig)) tmdbByNormTitle.set(kOrig, tm);
    }

    const seenNormTitles = new Set<string>();
    const combinedMovies: any[] = [];

    // 1. Place relevant Movidy Spanish catalog movies (when searching, drop irrelevant fuzzy WP hits)
    const filteredMovidyMovies = query
      ? movidyData.movies.filter(
          (mv) => scoreTitleRelevance(mv.title, mv.originalTitle, query) >= 70
        )
      : movidyData.movies;

    for (const mv of filteredMovidyMovies) {
      const kFull = normalizeTitleForMatch(mv.title);
      const kOutside = normalizeTitleForMatch(String(mv.title || '').replace(/\s*\([^)]*\)/g, ''));
      const kInside = normalizeTitleForMatch(String(mv.title || '').match(/\(([^)]+)\)/)?.[1] || '');

      if (
        (kFull && seenNormTitles.has(kFull)) ||
        (kOutside && seenNormTitles.has(kOutside))
      ) {
        continue;
      }
      if (kFull) seenNormTitles.add(kFull);
      if (kOutside) seenNormTitles.add(kOutside);
      if (kInside) seenNormTitles.add(kInside);

      const matchedTmdb =
        (kFull ? tmdbByNormTitle.get(kFull) : undefined) ||
        (kOutside ? tmdbByNormTitle.get(kOutside) : undefined) ||
        (kInside ? tmdbByNormTitle.get(kInside) : undefined);

      if (matchedTmdb) {
        const kTitle = normalizeTitleForMatch(matchedTmdb.title || '');
        const kOrig = normalizeTitleForMatch(matchedTmdb.originalTitle || '');
        if (kTitle) seenNormTitles.add(kTitle);
        if (kOrig) seenNormTitles.add(kOrig);
        combinedMovies.push({
          ...matchedTmdb,
          id: mv.id,
          title: mv.title,
          poster: mv.poster || matchedTmdb.poster,
          backdrop: matchedTmdb.backdrop || mv.poster,
          movidyUrl: mv.movidyUrl,
          bingetrixUrl: matchedTmdb.bingetrixUrl,
          languages: ['Castellano', 'Latino', 'VOSE', 'EN'],
        });
      } else {
        combinedMovies.push(mv);
      }
    }

    // 2. Append verified released TMDB Spanish movies (backed by Embed69 + Movidy search + Bingetrix)
    for (const tm of tmdbData.movies) {
      const kTitle = normalizeTitleForMatch(tm.title);
      const kOrig = normalizeTitleForMatch(tm.originalTitle || '');
      if ((kTitle && seenNormTitles.has(kTitle)) || (kOrig && seenNormTitles.has(kOrig))) {
        continue;
      }
      if (kTitle) seenNormTitles.add(kTitle);
      if (kOrig) seenNormTitles.add(kOrig);
      combinedMovies.push(tm);
    }

    // 3. Merge multi-source indexed titles & live on-demand fallback search when querying
    if (query) {
      const indexedHits = searchIndexedCatalog(query, { mediaType: 'movie', limit: 16 });
      const topExistingScore = combinedMovies.reduce(
        (mx, m) => Math.max(mx, scoreTitleRelevance(m.title, m.originalTitle, query)),
        0
      );
      const fallbackHits =
        topExistingScore < 240
          ? await liveOnDemandFallbackSearch(query, 'movie')
          : [];

      for (const extra of [...indexedHits, ...fallbackHits]) {
        if (extra.tmdbId && combinedMovies.some((m) => Number(m.tmdbId) === Number(extra.tmdbId))) {
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

      // Rank strictly by original/localized title relevance so exact matches always lead
      combinedMovies.sort(
        (a, b) =>
          scoreTitleRelevance(b.title, b.originalTitle, query, { altTitle: b.altTitle }) -
          scoreTitleRelevance(a.title, a.originalTitle, query, { altTitle: a.altTitle })
      );
    }

    // 4. Attach or append crawled mirror entries (321moviesfree, cuevana4br, flixlat, 123pelicula)
    if (page === 1 || query) {
      const vestEntries = listVestCatalogEntries({ mediaType: 'movie', query });
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

    const hasMore = Boolean(movidyData.hasMore || tmdbData.hasMore);
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
    const page = Math.max(1, Math.min(100, parseInt(String(req.query.page || '1'), 10) || 1));

    const data = await fetchTmdbMovieCatalog({
      lang: 'en-US',
      category,
      page,
      query,
      provider,
    });

    let movies = [...data.movies];

    if (query) {
      const indexedHits = searchIndexedCatalog(query, { mediaType: 'all', limit: 16 });
      const topScore = movies.reduce(
        (mx, m) => Math.max(mx, scoreTitleRelevance(m.title, m.originalTitle, query)),
        0
      );
      const fallbackHits =
        topScore < 240 ? await liveOnDemandFallbackSearch(query, 'all') : [];

      const seenIds = new Set<string>(
        movies.map((m) => `${m.mediaType || 'movie'}:${m.tmdbId || m.id}`)
      );
      for (const extra of [...indexedHits, ...fallbackHits]) {
        const k = `${extra.mediaType}:${extra.tmdbId || extra.id}`;
        if (seenIds.has(k)) continue;
        seenIds.add(k);
        movies.push(extra);
      }

      movies.sort(
        (a, b) =>
          scoreTitleRelevance(b.title, b.originalTitle, query, { altTitle: b.altTitle }) -
          scoreTitleRelevance(a.title, a.originalTitle, query, { altTitle: a.altTitle })
      );
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
  mystery: 9648,
};

const seriesCatalogCache = new LruTtlCache<string, { series: any[]; hasMore: boolean; ts: number }>(
  180,
  15 * 60 * 1000
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
      const pageRes = await fetch(rawItem.movidyUrl, {
        headers: { 'User-Agent': CHROME_UA, Referer: 'https://movidy.pw/' },
        signal: AbortSignal.timeout(3200),
      });
      if (!pageRes.ok) {
        movidyTvTmdbCache.set(cacheKey, null);
        return null;
      }
      const pageHtml = await pageRes.text();
      if (!pageHtml.includes('id="eps"')) {
        movidyTvTmdbCache.set(cacheKey, null);
        return null;
      }
    }

    const cleanTitle = String(rawItem.title || '').replace(/\s*\([^)]*\)/g, '').trim();
    const parenTitle = (String(rawItem.title || '').match(/\(([^)]+)\)/)?.[1] || '').trim();
    const candidates = [cleanTitle, parenTitle].filter((c) => c.length >= 2);

    let bestMatch: any = null;
    for (const q of candidates) {
      const tRes = await fetch(
        `https://api.themoviedb.org/3/search/tv?api_key=${TMDB_API_KEY}&language=es-ES&query=${encodeURIComponent(
          q
        )}&page=1&include_adult=false`,
        { signal: AbortSignal.timeout(3500) }
      );
      if (!tRes.ok) continue;
      const tJson: any = await tRes.json();
      const results: any[] = Array.isArray(tJson?.results) ? tJson.results : [];
      if (results.length === 0) continue;

      const normQ = normalizeTitleForMatch(q);
      bestMatch =
        results.find(
          (r) =>
            normalizeTitleForMatch(r.name || '') === normQ ||
            normalizeTitleForMatch(r.original_name || '') === normQ
        ) || results[0];
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
        ? `https://movidy.pw/page/${page}/?s=${encodeURIComponent(query)}`
        : `https://movidy.pw/?s=${encodeURIComponent(query)}`
      : page > 1
      ? `https://movidy.pw/shows/page/${page}`
      : 'https://movidy.pw/shows/';

    let html = '';
    try {
      const res = await fetch(targetUrl, {
        headers: { 'User-Agent': CHROME_UA, Referer: 'https://movidy.pw/' },
        signal: AbortSignal.timeout(4500),
      });
      if (res.ok) html = await res.text();
    } catch {
      const fb = await curlGetText(
        targetUrl,
        { 'User-Agent': CHROME_UA, Referer: 'https://movidy.pw/' },
        5
      ).catch(() => ({ text: '' }));
      html = fb.text;
    }

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

      const movidyUrl = rawHref.startsWith('http')
        ? rawHref
        : `https://movidy.pw${rawHref}`;
      const absPoster = rawPoster.startsWith('//')
        ? `https:${rawPoster}`
        : rawPoster.startsWith('http')
        ? rawPoster
        : `https://movidy.pw${rawPoster}`;
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
    const langParam = String(req.query.lang || 'es').toLowerCase() === 'en' ? 'en-US' : 'es-ES';
    const isSpanishCatalog = langParam === 'es-ES';
    const page = Math.max(1, Math.min(100, parseInt(String(req.query.page || '1'), 10) || 1));

    const cacheKey = `v6|${langParam}|${provider}|${category}|${page}|${query}`;
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
    } else if (category === 'popular') {
      endpoint = `https://api.themoviedb.org/3/tv/popular?api_key=${TMDB_API_KEY}&language=${langParam}&page=${page}`;
    } else if (category === 'top_rated') {
      endpoint = `https://api.themoviedb.org/3/tv/top_rated?api_key=${TMDB_API_KEY}&language=${langParam}&page=${page}`;
    } else if (SERIES_GENRE_MAP[category]) {
      endpoint = `https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_API_KEY}&language=${langParam}&sort_by=popularity.desc&without_genres=10767,10763&with_genres=${SERIES_GENRE_MAP[category]}&page=${page}`;
    } else {
      endpoint = `https://api.themoviedb.org/3/trending/tv/week?api_key=${TMDB_API_KEY}&language=${langParam}&page=${page}`;
    }

    const mapTmdbSeriesItem = (s: any) => ({
      id: `tv-${langParam}-${provider}-${s.id}`,
      tmdbId: s.id,
      mediaType: 'tv',
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
    });

    const scrapeMovidySeriesFast = () => {
      if (!isSpanishCatalog || provCfg || isAnime) {
        return Promise.resolve({ series: [], hasMore: false });
      }
      const p = scrapeMovidySeriesCatalog({ category, page, query });
      if (!query) return p;
      return Promise.race([
        p,
        new Promise<{ series: any[]; hasMore: boolean }>((resolve) =>
          setTimeout(() => resolve({ series: [], hasMore: false }), 1600)
        ),
      ]);
    };

    const [movidySeriesData, curatedAnimeRaw, originalsRes, tRes] = await Promise.all([
      scrapeMovidySeriesFast(),
      curatedAnimeSeedPromise,
      originalsBoostEndpoint
        ? fetch(originalsBoostEndpoint, { signal: AbortSignal.timeout(4500) }).catch(() => null)
        : Promise.resolve(null),
      fetch(endpoint, { signal: AbortSignal.timeout(5000) }),
    ]);

    const curatedLead = curatedAnimeRaw.map(mapTmdbSeriesItem);

    let originalsLead: any[] = [];
    if (originalsRes?.ok) {
      const oJson: any = await originalsRes.json().catch(() => null);
      const oResults: any[] = Array.isArray(oJson?.results) ? oJson.results : [];
      originalsLead = oResults
        .filter((s) => s && s.id && (s.poster_path || s.backdrop_path))
        .slice(0, 12)
        .map(mapTmdbSeriesItem);
    }

    let tmdbSeries: any[] = [];
    let totalPages = 1;

    if (tRes.ok) {
      const json: any = await tRes.json();
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
                try {
                  const er = await fetch(
                    `https://api.themoviedb.org/3/search/tv?api_key=${TMDB_API_KEY}&language=${langParam}&query=${encodeURIComponent(
                      vq
                    )}&page=1&include_adult=false`,
                    { signal: AbortSignal.timeout(2800) }
                  );
                  if (!er.ok) return [];
                  const ej: any = await er.json().catch(() => null);
                  return Array.isArray(ej?.results) ? ej.results : [];
                } catch {
                  return [];
                }
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
      if (ms?.tmdbId && !seenTmdbIds.has(ms.tmdbId)) {
        seenTmdbIds.add(ms.tmdbId);
        combinedSeries.push(ms);
      }
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

    // Merge indexed & live on-demand TV series fallback matches when querying
    if (query) {
      const indexedTv = searchIndexedCatalog(query, { mediaType: 'tv', limit: 16 });
      const topScore = combinedSeries.reduce(
        (mx, s) => Math.max(mx, scoreTitleRelevance(s.title, s.originalTitle, query)),
        0
      );
      const fallbackTv =
        topScore < 240 ? await liveOnDemandFallbackSearch(query, 'tv') : [];

      for (const extra of [...indexedTv, ...fallbackTv]) {
        if (extra.tmdbId && seenTmdbIds.has(extra.tmdbId)) continue;
        if (extra.tmdbId) seenTmdbIds.add(extra.tmdbId);
        combinedSeries.push(extra);
      }

      combinedSeries.sort(
        (a, b) =>
          scoreTitleRelevance(b.title, b.originalTitle, query, { altTitle: b.altTitle }) -
          scoreTitleRelevance(a.title, a.originalTitle, query, { altTitle: a.altTitle })
      );
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

    const hasMore =
      Boolean(movidySeriesData.hasMore) || (page < totalPages && tmdbSeries.length > 0);
    seriesCatalogCache.set(cacheKey, { series: combinedSeries, hasMore, ts: Date.now() });
    res.json({ success: true, series: combinedSeries, hasMore, page });
  } catch (err) {
    console.error('Series catalog error:', err);
    res.status(500).json({ success: false, series: [], hasMore: false });
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
    const langParam = isEn ? 'en-US' : 'es-ES';
    const cacheKey = `${cleanId}:${requestedSeason}:${langParam}`;

    const cached = tvDetailsFastCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < 15 * 60 * 1000) {
      const cachedLangs = tvLangProbeCache.get(`${cleanId}:${cached.details.activeSeason}:1`);
      return res.json({
        success: true,
        details: {
          ...cached.details,
          ...(cachedLangs ? { availableLanguages: cachedLangs.availableLanguages } : {}),
        },
      });
    }

    const showRes = await fetch(
      `https://api.themoviedb.org/3/tv/${cleanId}?api_key=${TMDB_API_KEY}&language=${langParam}`,
      { signal: AbortSignal.timeout(4500) }
    );

    if (!showRes.ok) return res.status(404).json({ success: false });
    const showJson: any = await showRes.json();

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

    const seasonRequests: Promise<Response>[] = [
      fetch(
        `https://api.themoviedb.org/3/tv/${cleanId}/season/${tmdbSeasonToFetch}?api_key=${TMDB_API_KEY}&language=${langParam}`,
        { signal: AbortSignal.timeout(4500) }
      ),
    ];
    if (!isEn) {
      seasonRequests.push(
        fetch(
          `https://api.themoviedb.org/3/tv/${cleanId}/season/${tmdbSeasonToFetch}?api_key=${TMDB_API_KEY}&language=en-US`,
          { signal: AbortSignal.timeout(4500) }
        )
      );
    }

    const [seasonRes, seasonEnRes] = await Promise.all(seasonRequests);
    const seasonJson: any = seasonRes?.ok ? await seasonRes.json() : { episodes: [] };
    const seasonEnJson: any = seasonEnRes?.ok ? await seasonEnRes.json() : { episodes: [] };

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

    const cachedLangs = tvLangProbeCache.get(`${cleanId}:${effectiveSeason}:1`);
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
    const cacheKey = `${cleanId}:${seasonNum}:${episodeNum}`;

    const cached = tvLangProbeCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < 15 * 60 * 1000) {
      return res.json({ success: true, availableLanguages: cached.availableLanguages });
    }

    const titleHint = String(req.query.title || '').trim();
    const origTitleHint = String(req.query.origTitle || '').trim();
    let hints = [titleHint, origTitleHint].filter(Boolean);

    if (hints.length === 0) {
      const showRes = await fetch(
        `https://api.themoviedb.org/3/tv/${cleanId}?api_key=${TMDB_API_KEY}&language=es-ES`,
        { signal: AbortSignal.timeout(3500) }
      ).catch(() => null);
      if (showRes?.ok) {
        const showJson: any = await showRes.json();
        hints = [showJson?.name, showJson?.original_name].filter(Boolean);
      }
    }

    const availableLanguages = await probeAvailableLanguages({
      tmdbId: cleanId,
      mediaType: 'tv',
      season: seasonNum,
      episode: episodeNum,
      titleHints: hints,
    });

    tvLangProbeCache.set(cacheKey, { availableLanguages, ts: Date.now() });
    res.json({ success: true, availableLanguages });
  } catch {
    res.json({ success: false, availableLanguages: [] });
  }
});

// ============================================================================
// REST API: INSTANT YOUTUBE SEARCH FOR SYNCHRONIZED WATCH PARTIES
// ============================================================================
const ytSearchCache = new LruTtlCache<string, { videos: any[]; ts: number }>(150, 5 * 60 * 1000);

app.get('/api/catalog/youtube', async (req, res) => {
  const q = String(req.query.q || '').trim() || 'trailers peliculas 2025 hd';
  const cached = ytSearchCache.get(q.toLowerCase());
  if (cached && Date.now() - cached.ts < 5 * 60 * 1000) {
    return res.json({ success: true, videos: cached.videos });
  }

  try {
    // Also support direct YouTube URL pasted into the YouTube search bar!
    const directId = parseYouTubeVideoId(q);
    if (directId) {
      return res.json({
        success: true,
        videos: [
          {
            id: `yt-${directId}`,
            videoId: directId,
            title: 'Vídeo de YouTube Directo',
            channel: 'YouTube',
            duration: 'HD',
            views: '',
            thumbnail: `https://i.ytimg.com/vi/${directId}/hqdefault.jpg`,
            url: `https://www.youtube.com/watch?v=${directId}`,
          },
        ],
      });
    }

    const ytRes = await fetch(
      `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&hl=es`,
      {
        headers: {
          'User-Agent': CHROME_UA,
          'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
        },
        signal: AbortSignal.timeout(5500),
      }
    );
    if (!ytRes.ok) return res.json({ success: true, videos: [] });

    const html = await ytRes.text();
    const initMatch = html.match(/var\s+ytInitialData\s*=\s*(\{[\s\S]+?\});<\/script>/);
    if (!initMatch) return res.json({ success: true, videos: [] });

    const data = JSON.parse(initMatch[1]);
    const sections =
      data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer
        ?.contents || [];

    const videos: any[] = [];
    for (const sec of sections) {
      const items = sec?.itemSectionRenderer?.contents || [];
      for (const item of items) {
        const vr = item?.videoRenderer;
        if (!vr?.videoId) continue;
        const title = vr.title?.runs?.map((r: any) => r.text).join('') || 'YouTube Video';
        const channel =
          vr.ownerText?.runs?.[0]?.text || vr.longBylineText?.runs?.[0]?.text || 'YouTube';
        const duration = vr.lengthText?.simpleText || 'LIVE';
        const views = vr.shortViewCountText?.simpleText || vr.viewCountText?.simpleText || '';
        videos.push({
          id: `yt-${vr.videoId}`,
          videoId: vr.videoId,
          title,
          channel,
          duration,
          views,
          thumbnail: `https://i.ytimg.com/vi/${vr.videoId}/hqdefault.jpg`,
          url: `https://www.youtube.com/watch?v=${vr.videoId}`,
        });
        if (videos.length >= 18) break;
      }
      if (videos.length >= 18) break;
    }

    ytSearchCache.set(q.toLowerCase(), { videos, ts: Date.now() });
    res.json({ success: true, videos });
  } catch (err) {
    console.warn('YouTube search error:', err);
    res.json({ success: true, videos: [] });
  }
});

// ============================================================================
// REST API: LIVE SPORTS AGENDA (REAL-TIME ROJADIRECTA SCRAPER + 24/7 MULTIPLEX)
// ============================================================================
let cachedSportsSchedule: { matches: any[]; ts: number } | null = null;

function getPermanent247SportsMatches() {
  return [
    {
      id: 'mux-laliga',
      title: 'LaLiga EA Sports & Hypermotion · Movistar + DAZN 24/7',
      competition: 'Fútbol Español en Directo',
      sport: 'soccer',
      time: 'EN DIRECTO',
      isLive: true,
      is247Channel: true,
      channels: [
        {
          id: 'ch-laliga-1',
          label: 'M+ LaLiga HD',
          lang: 'ES',
          quality: '1080p',
          sourceUrl: 'https://footunder.online/tvtodo/laliga.php',
          resolverType: 'sports_channel',
        },
        {
          id: 'ch-laliga-2',
          label: 'DAZN LaLiga HD',
          lang: 'ES',
          quality: '1080p',
          sourceUrl: 'https://pig.footunder.online/stream/538',
          resolverType: 'sports_channel',
        },
        {
          id: 'ch-laliga-3',
          label: 'LaLiga Hypermotion',
          lang: 'ES',
          quality: '1080p',
          sourceUrl: 'https://pig.footunder.online/stream/522',
          resolverType: 'sports_channel',
        },
        {
          id: 'ch-laliga-4',
          label: 'Señal Satélite LaLiga',
          lang: 'ES',
          quality: '1080p',
          sourceUrl: 'https://pig.footunder.online/stream/84',
          resolverType: 'sports_channel',
        },
      ],
    },
    {
      id: 'mux-f1-motor',
      title: 'DAZN F1, DSports Motor & Motorsport · Circuito 24/7',
      competition: 'Fórmula 1 · MotoGP · Automovilismo',
      sport: 'motor',
      time: 'EN DIRECTO',
      isLive: true,
      is247Channel: true,
      channels: [
        {
          id: 'ch-f1-1',
          label: 'DAZN F1 HD',
          lang: 'ES',
          quality: '1080p',
          sourceUrl: 'https://pig.footunder.online/stream/60',
          resolverType: 'sports_channel',
        },
        {
          id: 'ch-dsp-mot',
          label: 'DSports Motor HD',
          lang: 'ES',
          quality: '1080p',
          sourceUrl: 'https://pig.footunder.online/stream/96',
          resolverType: 'sports_channel',
        },
        {
          id: 'ch-f1-rb',
          label: 'Red Bull TV Motor 1080p',
          lang: 'ES',
          quality: '1080p',
          sourceUrl: 'https://rbmn-live.akamaized.net/hls/live/590964/BoRB-AT/master.m3u8',
          resolverType: 'tdt_hls',
        },
      ],
    },
    {
      id: 'mux-champions',
      title: 'Champions, Libertadores & Internacional · beIN · ESPN · DSports · TNT',
      competition: 'UEFA Champions · Libertadores · Ligas',
      sport: 'soccer',
      time: 'EN DIRECTO',
      isLive: true,
      is247Channel: true,
      channels: [
        {
          id: 'ch-ucl-1',
          label: 'M+ Liga de Campeones HD',
          lang: 'ES',
          quality: '1080p',
          sourceUrl: 'https://footunder.online/tvtodo/mligacampeones.php',
          resolverType: 'sports_channel',
        },
        {
          id: 'ch-bein-es',
          label: 'beIN SPORTS Ñ 1080p',
          lang: 'ES',
          quality: '1080p',
          sourceUrl: 'https://dc1644a9jazgj.cloudfront.net/beIN_Sports_Xtra_Espanol.m3u8',
          resolverType: 'tdt_hls',
        },
        {
          id: 'ch-espn-1',
          label: 'ESPN En Vivo 1080p',
          lang: 'ES',
          quality: '1080p',
          sourceUrl: 'https://streamxhd.sbs/live2.php?stream=espn',
          resolverType: 'sports_channel',
        },
        {
          id: 'ch-dsports-1',
          label: 'DSports En Vivo 1080p',
          lang: 'ES',
          quality: '1080p',
          sourceUrl: 'https://streamxhd.sbs/live2.php?stream=dsports',
          resolverType: 'sports_channel',
        },
        {
          id: 'ch-tntsp-1',
          label: 'TNT Sports HD',
          lang: 'ES',
          quality: '1080p',
          sourceUrl: 'https://streamxhd.sbs/live2.php?stream=tntsports',
          resolverType: 'sports_channel',
        },
      ],
    },
    {
      id: 'mux-nba-tennis',
      title: 'Baloncesto, Tenis & Combate · Movistar Deportes · ESPN 2 · DSports Fight',
      competition: 'NBA · ACB · ATP/WTA · Boxeo/UFC',
      sport: 'basketball',
      time: 'EN DIRECTO',
      isLive: true,
      is247Channel: true,
      channels: [
        {
          id: 'ch-mdep-1',
          label: 'Movistar Deportes HD',
          lang: 'ES',
          quality: '1080p',
          sourceUrl: 'https://pig.footunder.online/stream/438',
          resolverType: 'sports_channel',
        },
        {
          id: 'ch-espn-2',
          label: 'ESPN 2 HD',
          lang: 'ES',
          quality: '1080p',
          sourceUrl: 'https://streamxhd.sbs/live2.php?stream=espn2',
          resolverType: 'sports_channel',
        },
        {
          id: 'ch-dsp-fight',
          label: 'DSports Fight HD',
          lang: 'ES',
          quality: '1080p',
          sourceUrl: 'https://pig.footunder.online/stream/98',
          resolverType: 'sports_channel',
        },
        {
          id: 'ch-nba-euro1',
          label: 'Eurosport 1 HD',
          lang: 'ES',
          quality: '1080p',
          sourceUrl: 'https://pig.footunder.online/stream/231',
          resolverType: 'sports_channel',
        },
        {
          id: 'ch-nba-tdp',
          label: 'Teledeporte RTVE 1080p',
          lang: 'ES',
          quality: '1080p',
          sourceUrl: 'https://rtvelivestream.rtve.es/rtvesec/tdp/tdp_main.m3u8',
          resolverType: 'tdt_hls',
        },
      ],
    },
    {
      id: 'mux-uk-sports',
      title: 'Sky Sports Premier League · F1 · Eurosport · DAZN UK (English 24/7)',
      competition: 'UK Sports · Premier League · F1 · Boxing · Golf',
      sport: 'soccer',
      time: 'LIVE EN',
      isLive: true,
      is247Channel: true,
      channels: [
        {
          id: 'ch-uk-pl',
          label: 'Sky Sports Premier League (UK)',
          lang: 'EN',
          quality: '1080p',
          sourceUrl: 'https://cdn.stmify.com/out/v1/SKY_SPORTS_PREMIER_LEAGUE/index.m3u8',
          resolverType: 'tdt_hls',
        },
        {
          id: 'ch-uk-f1',
          label: 'Sky Sports F1 (UK)',
          lang: 'EN',
          quality: '720p',
          sourceUrl: 'https://cdn.stmify.com/out/v1/SKY_SPORTS_F1/index.m3u8',
          resolverType: 'tdt_hls',
        },
        {
          id: 'ch-uk-action',
          label: 'Sky Sports Action / NFL (UK)',
          lang: 'EN',
          quality: '720p',
          sourceUrl: 'https://cdn.stmify.com/out/v1/SKY_SPORTS_ACTION/index.m3u8',
          resolverType: 'tdt_hls',
        },
        {
          id: 'ch-uk-es1',
          label: 'Eurosport 1 UK 1080p',
          lang: 'EN',
          quality: '1080p',
          sourceUrl: 'http://85.117.37.43/eurosport1/index.m3u8',
          resolverType: 'tdt_hls',
        },
        {
          id: 'ch-uk-mutv',
          label: 'MUTV (Manchester Utd UK)',
          lang: 'EN',
          quality: '720p',
          sourceUrl:
            'https://fastly.live.brightcove.com/6374054671112/eu-west-1/6058004203001/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJob3N0IjoiYXplMnp5LmVncmVzcy55ODN1ZWIiLCJhY2NvdW50X2lkIjoiNjA1ODAwNDIwMzAwMSIsImVobiI6ImZhc3RseS5saXZlLmJyaWdodGNvdmUuY29tIiwiaXNzIjoiYmxpdmUtcGxheWJhY2stc291cmNlLWFwaSIsInN1YiI6InBhdGhtYXB0b2tlbiIsImF1ZCI6WyI2MDU4MDA0MjAzMDAxIl0sImp0aSI6IjYzNzQwNTQ2NzExMTIifQ.3FmuTna3DAmY7xlhK5fk6LMrosrtrR5VsU2QOgYO5y4/playlist-hls.m3u8',
          resolverType: 'tdt_hls',
        },
        {
          id: 'ch-uk-talk',
          label: 'talkSPORT UK 1080p',
          lang: 'EN',
          quality: '1080p',
          sourceUrl:
            'https://af7a8b4e.wurl.com/master/f36d25e7e52f1ba8d7e56eb859c636563214f541/TEctZ2JfdGFsa1NQT1JUX0hMUw/playlist.m3u8',
          resolverType: 'tdt_hls',
        },
      ],
    },
  ];
}

function detectSportKind(text: string): 'soccer' | 'motor' | 'basketball' | 'tennis' | 'other' {
  const lower = text.toLowerCase();
  if (/baloncesto|basket|nba|eurocup|euroliga|acb|ncaa/.test(lower)) return 'basketball';
  if (/tenis|tennis|atp|wta|roland|wimbledon/.test(lower)) return 'tennis';
  if (/f1|formula|fórmula|motogp|motor|nascar|rally|indy/.test(lower)) return 'motor';
  return 'soccer';
}

let cachedLiveAgendaFeeds: {
  rojaMatches: any[];
  streamXhdFootball: any[];
  ts: number;
} | null = null;

async function fetchLiveSportsAgendaFeeds(): Promise<{
  rojaMatches: any[];
  streamXhdFootball: any[];
}> {
  if (cachedLiveAgendaFeeds && Date.now() - cachedLiveAgendaFeeds.ts < 90 * 1000) {
    return cachedLiveAgendaFeeds;
  }

  const liveGrouped = new Map<string, any>();
  const streamXhdFootball: any[] = [];

  await Promise.all([
    // Feed A: StreamXHD structured live events (`eventos.json` — exact teams, logos, and live servers)
    (async () => {
      for (const domain of ['https://streamxhd.sbs', 'https://streamxhd.st']) {
        try {
          const evRes = await fetch(`${domain}/eventos.json`, {
            headers: { 'User-Agent': CHROME_UA },
            signal: AbortSignal.timeout(4000),
          });
          if (!evRes.ok) continue;
          const evJson: any = await evRes.json();
          for (const sp of evJson?.sports || []) {
            const sportId = String(sp?.id || '').toLowerCase();
            const mappedSport: 'soccer' | 'motor' | 'basketball' | 'tennis' | 'other' =
              sportId === 'football' || sportId === 'soccer'
                ? 'soccer'
                : sportId === 'basketball'
                ? 'basketball'
                : sportId === 'tennis'
                ? 'tennis'
                : sportId === 'motorsport' || sportId === 'f1'
                ? 'motor'
                : detectSportKind(String(sp?.name || ''));

            for (const lg of sp?.leagues || []) {
              const leagueName = String(lg?.name || 'En Directo').trim();
              for (const ev of lg?.events || []) {
                const servers: any[] = Array.isArray(ev?.servers) ? ev.servers : [];
                const validTracks: TrackRecord[] = [];
                for (const srv of servers) {
                  const srvUrl = String(srv?.url || '').trim();
                  if (!srvUrl.startsWith('http')) continue;
                  if (validTracks.some((t) => t.sourceUrl === srvUrl)) continue;
                  validTracks.push({
                    id: `sxhd-${validTracks.length + 1}`,
                    label: String(srv?.name || `Señal ${validTracks.length + 1}`).trim(),
                    lang: 'LIVE',
                    quality: '1080p',
                    sourceUrl: srvUrl,
                    resolverType: 'sports_channel',
                  });
                }
                if (validTracks.length === 0) continue;

                const homeTeam = String(ev?.homeTeam || '').trim();
                const awayTeam = String(ev?.awayTeam || '').trim();
                const matchTitle =
                  homeTeam && awayTeam
                    ? `${homeTeam} vs ${awayTeam}`
                    : String(ev?.title || 'Evento en Vivo').trim();
                const rawTime = String(ev?.time || '').trim();
                const timeMatch = rawTime.match(/(\d{1,2}:\d{2})/);
                const timeStr = timeMatch ? timeMatch[1] : 'EN VIVO';

                const key = `sxhd-${leagueName}-${timeStr}-${matchTitle}`;
                liveGrouped.set(key, {
                  id: `live-${crypto.createHash('sha1').update(key).digest('base64url').slice(0, 16)}`,
                  title: matchTitle,
                  homeTeam,
                  awayTeam,
                  competition: leagueName,
                  sport: mappedSport,
                  time: timeStr,
                  isLive: true,
                  is247Channel: false,
                  channels: validTracks,
                });

                if (mappedSport === 'soccer' && homeTeam && awayTeam) {
                  streamXhdFootball.push({
                    homeTeam,
                    awayTeam,
                    homeLogo: String(ev?.homeLogo || '').trim() || undefined,
                    awayLogo: String(ev?.awayLogo || '').trim() || undefined,
                    leagueName,
                    code: String(ev?.code || '').trim(),
                    rawTime,
                    timeStr,
                    channels: validTracks,
                  });
                }
              }
            }
          }
          break;
        } catch {
          // try backup domain
        }
      }
    })(),

    // Feed B: RojaDirecta real-time agenda
    (async () => {
      try {
        const agendaHtml = await fetch('https://www.rojadirectv.live/', {
          headers: { 'User-Agent': CHROME_UA },
          signal: AbortSignal.timeout(4500),
        }).then((r) => (r.ok ? r.text() : ''));

        const rowRegex =
          /<tr>\s*<td><span class="t">([^<]+)<\/span><\/td>[\s\S]*?<td align="left">([\s\S]*?)<\/td>\s*<\/tr>/gi;

        for (const rowMatch of agendaHtml.matchAll(rowRegex)) {
          const timeStr = rowMatch[1].trim();
          const cellHtml = rowMatch[2];

          const titleMatch = cellHtml.match(/<b>([^<]+)<\/b>/i);
          const compPrefix = cellHtml
            .split('<a')[0]
            .replace(/<[^>]+>/g, '')
            .replace(/:\s*$/, '')
            .trim();
          const b64Links = [
            ...cellHtml.matchAll(/\?r=([A-Za-z0-9+/=]+)"[^>]*class="btn-canal"[^>]*>([^<]+)</gi),
          ];

          if (!titleMatch || b64Links.length === 0) continue;
          const matchTitle = titleMatch[1].trim();
          const key = `${timeStr}-${matchTitle}`;

          if (!liveGrouped.has(key)) {
            liveGrouped.set(key, {
              id: `live-${crypto.createHash('sha1').update(key).digest('base64url').slice(0, 16)}`,
              title: matchTitle,
              competition: compPrefix || 'Agenda en Directo',
              sport: detectSportKind(`${compPrefix} ${matchTitle}`),
              time: timeStr,
              isLive: true,
              is247Channel: false,
              channels: [],
            });
          }

          const entry = liveGrouped.get(key);
          for (const link of b64Links) {
            try {
              const decodedChannelUrl = Buffer.from(link[1], 'base64').toString('utf8').trim();
              if (!decodedChannelUrl.startsWith('http')) continue;
              if (entry.channels.some((c: any) => c.sourceUrl === decodedChannelUrl)) continue;
              entry.channels.push({
                id: `live-ch-${entry.channels.length + 1}`,
                label: link[2].trim() || `Señal ${entry.channels.length + 1}`,
                lang: 'LIVE',
                quality: 'HD',
                sourceUrl: decodedChannelUrl,
                resolverType: 'sports_channel',
              });
            } catch {
              // skip malformed base64
            }
          }
        }
      } catch (err) {
        console.warn('RojaDirecta live scrape warning:', err);
      }
    })(),
  ]);

  const rojaMatches = Array.from(liveGrouped.values()).filter(
    (ev) => Array.isArray(ev.channels) && ev.channels.length > 0
  );
  cachedLiveAgendaFeeds = {
    rojaMatches,
    streamXhdFootball,
    ts: Date.now(),
  };
  return cachedLiveAgendaFeeds;
}

app.get('/api/catalog/sports', async (_req, res) => {
  if (cachedSportsSchedule && Date.now() - cachedSportsSchedule.ts < 90 * 1000) {
    return res.json({
      success: true,
      events: channelHealthMonitor.prioritizeChannels(cachedSportsSchedule.matches),
    });
  }

  const permanentChannels = getPermanent247SportsMatches();
  const { rojaMatches } = await fetchLiveSportsAgendaFeeds();

  // Keep ONLY authentic event-specific channels on each match — never append unrelated 24/7 channels!
  const combined = [...permanentChannels, ...rojaMatches.slice(0, 40)];
  cachedSportsSchedule = { matches: combined, ts: Date.now() };

  res.json({
    success: true,
    events: channelHealthMonitor.prioritizeChannels(combined),
  });
});

// ============================================================================
// REST API: TELEVISIÓN EN VIVO (TDT · MOVISTAR+ · DAZN · BEIN · ESPN · DSPORTS · TNT)
// ============================================================================
interface SpanishTdtChannelDef {
  id: string;
  dial: number;
  name: string;
  shortMark: string;
  brandTone: string;
  network: string;
  category:
    | 'movistar'
    | 'dazn'
    | 'uk_sports'
    | 'beinsports'
    | 'espn'
    | 'dsports'
    | 'tnt_space'
    | 'generalistas'
    | 'cine_series'
    | 'entretenimiento'
    | 'noticias_deportes'
    | 'infantil_autonomicas';
  quality: string;
  description: string;
  channels: TrackRecord[];
}

const SPANISH_TDT_CHANNELS: SpanishTdtChannelDef[] = [
  {
    id: 'tdt-la1',
    dial: 1,
    name: 'La 1',
    shortMark: '1',
    brandTone: '#2563EB',
    network: 'RTVE',
    category: 'generalistas',
    quality: '1080p HD',
    description: 'Telediario, cine, entretenimiento, selección española y grandes eventos en directo',
    channels: [
      {
        id: 'la1-rtve',
        label: 'Señal Oficial RTVE HD (La 1 España)',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://rtvelivestream.rtve.es/rtvesec/la1/la1_main.m3u8',
        resolverType: 'tdt_hls',
      },
      {
        id: 'la1-dvb',
        label: 'Señal Antena TDT 1080p (La 1)',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'http://90.163.85.113:8093/stream/45/index.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'tdt-la2',
    dial: 2,
    name: 'La 2',
    shortMark: '2',
    brandTone: '#0EA5E9',
    network: 'RTVE',
    category: 'generalistas',
    quality: '1080p HD',
    description: 'Documentales, cultura, cine clásico e independiente y Saber y Ganar',
    channels: [
      {
        id: 'la2-rtve',
        label: 'Señal Oficial RTVE HD (La 2 España)',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://rtvelivestream.rtve.es/rtvesec/la2/la2_main.m3u8',
        resolverType: 'tdt_hls',
      },
      {
        id: 'la2-rtve-dvr',
        label: 'Señal Oficial RTVE DVR (La 2)',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://rtvelivestream.rtve.es/rtvesec/la2/la2_main_dvr.m3u8',
        resolverType: 'tdt_hls',
      },
      {
        id: 'la2-dvb',
        label: 'Señal Antena TDT 1080p (La 2)',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'http://90.163.85.113:8093/stream/48/index.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'tdt-antena3',
    dial: 3,
    name: 'Antena 3',
    shortMark: 'A3',
    brandTone: '#F97316',
    network: 'Atresmedia',
    category: 'generalistas',
    quality: '1080p HD',
    description: 'El Hormiguero, Pasapalabra, Antena 3 Noticias y series estelares',
    channels: [
      {
        id: 'a3-dvb',
        label: 'Señal Directa HD',
        lang: 'ES',
        quality: '720p HD',
        sourceUrl: 'http://90.163.85.113:8093/stream/20/index.m3u8',
        resolverType: 'tdt_hls',
      },
      {
        id: 'a3-fast',
        label: 'Señal 2 · Estabilizada Rápida',
        lang: 'ES',
        quality: 'HD',
        sourceUrl: 'http://90.163.85.113:8093/stream/20/index.m3u8?profile=fast',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'tdt-cuatro',
    dial: 4,
    name: 'Cuatro',
    shortMark: '4',
    brandTone: '#EF4444',
    network: 'Mediaset',
    category: 'generalistas',
    quality: '1080p HD',
    description: 'First Dates, Horizonte, Cuarto Milenio, actualidad y cine de acción',
    channels: [
      {
        id: 'cuatro-dvb',
        label: 'Señal Directa HD',
        lang: 'ES',
        quality: '720p HD',
        sourceUrl: 'http://90.163.85.113:8093/stream/42/index.m3u8',
        resolverType: 'tdt_hls',
      },
      {
        id: 'cuatro-fast',
        label: 'Señal 2 · Estabilizada Rápida',
        lang: 'ES',
        quality: 'HD',
        sourceUrl: 'http://90.163.85.113:8093/stream/42/index.m3u8?profile=fast',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'tdt-telecinco',
    dial: 5,
    name: 'Telecinco',
    shortMark: '5',
    brandTone: '#0284C7',
    network: 'Mediaset',
    category: 'generalistas',
    quality: '1080p HD',
    description: 'Realities en directo, Informativos Telecinco, entretenimiento y cine',
    channels: [
      {
        id: 't5-dvb',
        label: 'Señal Directa HD',
        lang: 'ES',
        quality: '720p HD',
        sourceUrl: 'http://90.163.85.113:8093/stream/41/index.m3u8',
        resolverType: 'tdt_hls',
      },
      {
        id: 't5-fast',
        label: 'Señal 2 · Estabilizada Rápida',
        lang: 'ES',
        quality: 'HD',
        sourceUrl: 'http://90.163.85.113:8093/stream/41/index.m3u8?profile=fast',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'tdt-lasexta',
    dial: 6,
    name: 'laSexta',
    shortMark: '6',
    brandTone: '#16A34A',
    network: 'Atresmedia',
    category: 'generalistas',
    quality: '1080p HD',
    description: 'Al Rojo Vivo, El Intermedio, Zapeando, Equipo de Investigación y cine',
    channels: [
      {
        id: 'lasexta-dvb',
        label: 'Señal Directa HD',
        lang: 'ES',
        quality: '720p HD',
        sourceUrl: 'http://90.163.85.113:8093/stream/21/index.m3u8',
        resolverType: 'tdt_hls',
      },
      {
        id: 'lasexta-fast',
        label: 'Señal 2 · Estabilizada Rápida',
        lang: 'ES',
        quality: 'HD',
        sourceUrl: 'http://90.163.85.113:8093/stream/21/index.m3u8?profile=fast',
        resolverType: 'tdt_hls',
      },
    ],
  },
  // ==========================================================================
  // MOVISTAR PLUS+ EN VIVO (SEÑALES 100% DEDICADAS SIN SALTOS ENTRE CANALES)
  // ==========================================================================
  {
    id: 'mplus-canal',
    dial: 7,
    name: 'Movistar Plus+',
    shortMark: 'M+',
    brandTone: '#00A9E0',
    network: 'Movistar Plus+',
    category: 'movistar',
    quality: '1080p HD',
    description: 'Canal principal de Movistar Plus+ (#0): partido de la jornada, cine, series y programas propios',
    channels: [
      {
        id: 'mplus-sat',
        label: 'Señal Movistar Plus+ HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://pig.footunder.online/stream/531',
        resolverType: 'sports_channel',
      },
    ],
  },
  {
    id: 'mplus-vamos',
    dial: 8,
    name: 'Movistar Vamos',
    shortMark: 'VAMOS',
    brandTone: '#10B981',
    network: 'Movistar Plus+',
    category: 'movistar',
    quality: '1080p HD',
    description: 'El Día Después, El Tercer Tiempo, noticias deportivas 24h y grandes citas en directo',
    channels: [
      {
        id: 'mvamos-1',
        label: 'Señal Principal Vamos HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://pig.footunder.online/stream/529',
        resolverType: 'sports_channel',
      },
      {
        id: 'mvamos-2',
        label: 'Señal 2 Vamos HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://pig.footunder.online/stream/526',
        resolverType: 'sports_channel',
      },
    ],
  },
  {
    id: 'mplus-laliga',
    dial: 54,
    name: 'Movistar LaLiga TV',
    shortMark: 'M+LIGA',
    brandTone: '#00A9E0',
    network: 'Movistar Plus+',
    category: 'movistar',
    quality: '1080p HD',
    description: 'LaLiga EA Sports en directo, previas, postpartidos y resúmenes oficiales 24/7',
    channels: [
      {
        id: 'mlaliga-1',
        label: 'Señal Principal M+ LaLiga HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://footunder.online/tvtodo/laliga.php',
        resolverType: 'sports_channel',
      },
      {
        id: 'mlaliga-sat',
        label: 'Señal 2 M+ LaLiga HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://pig.footunder.online/stream/84',
        resolverType: 'sports_channel',
      },
    ],
  },
  {
    id: 'mplus-hypermotion',
    dial: 56,
    name: 'LaLiga TV Hypermotion',
    shortMark: 'LIGA2',
    brandTone: '#0284C7',
    network: 'Movistar Plus+',
    category: 'movistar',
    quality: '1080p HD',
    description: 'Toda LaLiga Hypermotion, Copa del Rey y fútbol español en directo 24/7',
    channels: [
      {
        id: 'mhyper-1',
        label: 'Señal Principal Hypermotion HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://pig.footunder.online/stream/522',
        resolverType: 'sports_channel',
      },
      {
        id: 'mhyper-ev',
        label: 'Señal 2 Hypermotion HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://footunder.online/tvtodo/laliga2.php',
        resolverType: 'sports_channel',
      },
    ],
  },
  {
    id: 'mplus-champions',
    dial: 60,
    name: 'M+ Liga de Campeones',
    shortMark: 'M+UCL',
    brandTone: '#16A34A',
    network: 'Movistar Plus+',
    category: 'movistar',
    quality: '1080p HD',
    description: 'UEFA Champions League, Europa League, Conference League y fútbol europeo en vivo',
    channels: [
      {
        id: 'mucl-1',
        label: 'Señal Principal M+ Campeones HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://footunder.online/tvtodo/mligacampeones.php',
        resolverType: 'sports_channel',
      },
      {
        id: 'mucl-2',
        label: 'Señal 2 M+ Liga de Campeones HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://pig.footunder.online/stream/435',
        resolverType: 'sports_channel',
      },
    ],
  },
  {
    id: 'mplus-deportes',
    dial: 63,
    name: 'Movistar Deportes',
    shortMark: 'M+DEP',
    brandTone: '#00A9E0',
    network: 'Movistar Plus+',
    category: 'movistar',
    quality: '1080p HD',
    description: 'Liga Endesa ACB, Euroliga, NBA, ATP Masters 1000, Wimbledon, Rugby y NFL en directo',
    channels: [
      {
        id: 'mdep1-sat',
        label: 'Señal Movistar Deportes HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://pig.footunder.online/stream/438',
        resolverType: 'sports_channel',
      },
    ],
  },
  {
    id: 'mplus-deportes2',
    dial: 64,
    name: 'Movistar Deportes 2',
    shortMark: 'M+DEP2',
    brandTone: '#0EA5E9',
    network: 'Movistar Plus+',
    category: 'movistar',
    quality: '1080p HD',
    description: 'Multideporte en directo: baloncesto ACB/Euroliga, tenis Grand Slam y atletismo',
    channels: [
      {
        id: 'mdep2-sat',
        label: 'Señal Movistar Deportes 2 HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://pig.footunder.online/stream/527',
        resolverType: 'sports_channel',
      },
    ],
  },
  {
    id: 'mplus-golf',
    dial: 67,
    name: 'Movistar Golf',
    shortMark: 'M+GOLF',
    brandTone: '#059669',
    network: 'Movistar Plus+',
    category: 'movistar',
    quality: '1080p HD',
    description: 'PGA Tour, DP World Tour, Ryder Cup, Masters de Augusta y LIV Golf 24 horas en vivo',
    channels: [
      {
        id: 'mgolf-1',
        label: 'Señal Movistar Golf HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://pig.footunder.online/stream/528',
        resolverType: 'sports_channel',
      },
    ],
  },
  {
    id: 'mplus-eurosport1',
    dial: 72,
    name: 'Eurosport 1',
    shortMark: 'EURO1',
    brandTone: '#2563EB',
    network: 'Movistar+ · DAZN',
    category: 'movistar',
    quality: '1080p HD',
    description: 'Roland Garros, Open de Australia, Tour de Francia, La Vuelta, UFC y JJ.OO.',
    channels: [
      {
        id: 'euro1-1',
        label: 'Señal Eurosport 1 HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://pig.footunder.online/stream/231',
        resolverType: 'sports_channel',
      },
    ],
  },
  {
    id: 'mplus-eurosport2',
    dial: 73,
    name: 'Eurosport 2',
    shortMark: 'EURO2',
    brandTone: '#E11D48',
    network: 'Movistar+ · DAZN',
    category: 'movistar',
    quality: '1080p HD',
    description: 'Ciclismo mundial, WEC 24h Le Mans, tenis, snooker y deportes de invierno en vivo',
    channels: [
      {
        id: 'euro2-1',
        label: 'Señal Eurosport 2 HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://pig.footunder.online/stream/232',
        resolverType: 'sports_channel',
      },
    ],
  },
  // ==========================================================================
  // DAZN ESPAÑA EN VIVO (DAZN LALIGA, DAZN F1, DAZN 1, DAZN 2, DAZN 3, DAZN 4)
  // ==========================================================================
  {
    id: 'dazn-laliga',
    dial: 55,
    name: 'DAZN LaLiga',
    shortMark: 'DAZN LL',
    brandTone: '#F59E0B',
    network: 'DAZN España',
    category: 'dazn',
    quality: '1080p HD',
    description: 'Partidos exclusivos de LaLiga EA Sports en directo, previas a pie de campo y El Post',
    channels: [
      {
        id: 'daznll-1',
        label: 'Señal DAZN LaLiga HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://pig.footunder.online/stream/538',
        resolverType: 'sports_channel',
      },
    ],
  },
  {
    id: 'dazn-f1',
    dial: 69,
    name: 'DAZN F1',
    shortMark: 'DAZN F1',
    brandTone: '#EF4444',
    network: 'DAZN España',
    category: 'dazn',
    quality: '1080p HD',
    description: 'Mundial de Fórmula 1 24/7: libres, clasificación, sprint, carreras y cámaras onboard',
    channels: [
      {
        id: 'daznf1-1',
        label: 'Señal DAZN F1 HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://pig.footunder.online/stream/60',
        resolverType: 'sports_channel',
      },
      {
        id: 'daznf1-2',
        label: 'Señal 2 DAZN F1 HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://pig.footunder.online/stream/525',
        resolverType: 'sports_channel',
      },
    ],
  },
  {
    id: 'dazn-1',
    dial: 70,
    name: 'DAZN 1',
    shortMark: 'DAZN 1',
    brandTone: '#F4F4F5',
    network: 'DAZN España',
    category: 'dazn',
    quality: '1080p HD',
    description: 'Premier League, MotoGP, Serie A, Bundesliga, Liga F y boxeo mundial en directo',
    channels: [
      {
        id: 'dazn1-sat',
        label: 'Señal DAZN 1 HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://pig.footunder.online/stream/445',
        resolverType: 'sports_channel',
      },
    ],
  },
  {
    id: 'dazn-2',
    dial: 71,
    name: 'DAZN 2',
    shortMark: 'DAZN 2',
    brandTone: '#E4E4E7',
    network: 'DAZN España',
    category: 'dazn',
    quality: '1080p HD',
    description: 'Segundo canal lineal DAZN España: Premier League, Moto2/Moto3, Serie A y ciclismo',
    channels: [
      {
        id: 'dazn2-sat',
        label: 'Señal DAZN 2 HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://pig.footunder.online/stream/446',
        resolverType: 'sports_channel',
      },
    ],
  },
  {
    id: 'dazn-3',
    dial: 196,
    name: 'DAZN 3',
    shortMark: 'DAZN 3',
    brandTone: '#D4D4D8',
    network: 'DAZN España',
    category: 'dazn',
    quality: '1080p HD',
    description: 'Canal multievento DAZN 3 para jornadas simultáneas de fútbol europeo y motor',
    channels: [
      {
        id: 'dazn3-1',
        label: 'Señal Principal DAZN 3 HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://footunder.online/tvtodo/dazn3.php',
        resolverType: 'sports_channel',
      },
      {
        id: 'dazn3-sat',
        label: 'Señal 2 DAZN 3 HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://pig.footunder.online/stream/447',
        resolverType: 'sports_channel',
      },
    ],
  },
  {
    id: 'dazn-4',
    dial: 197,
    name: 'DAZN 4',
    shortMark: 'DAZN 4',
    brandTone: '#A1A1AA',
    network: 'DAZN España',
    category: 'dazn',
    quality: '1080p HD',
    description: 'Cuarto canal lineal DAZN España para retransmisiones simultáneas en alta definición',
    channels: [
      {
        id: 'dazn4-sat',
        label: 'Señal DAZN 4 HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://pig.footunder.online/stream/448',
        resolverType: 'sports_channel',
      },
    ],
  },
  // ==========================================================================
  // BEIN SPORTS EN VIVO (TODOS LOS CANALES BEIN SPORTS)
  // ==========================================================================
  {
    id: 'bein-es-n',
    dial: 80,
    name: 'beIN SPORTS en Español (Ñ)',
    shortMark: 'beIN Ñ',
    brandTone: '#7C3AED',
    network: 'beIN SPORTS',
    category: 'beinsports',
    quality: '1080p HD',
    description: 'Ligue 1, Copa Libertadores, Copa Sudamericana, Copa Africana y fútbol internacional en español',
    channels: [
      {
        id: 'beines-1',
        label: 'Señal Principal beIN Español 1080p',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://dc1644a9jazgj.cloudfront.net/beIN_Sports_Xtra_Espanol.m3u8',
        resolverType: 'tdt_hls',
      },
      {
        id: 'beines-2',
        label: 'Señal 2 beIN SPORTS Ñ HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://footunder.online/tvtodo/bein-sports.php',
        resolverType: 'sports_channel',
      },
    ],
  },
  {
    id: 'bein-xtra-hd',
    dial: 81,
    name: 'beIN SPORTS XTRA',
    shortMark: 'beIN XTRA',
    brandTone: '#6D28D9',
    network: 'beIN SPORTS',
    category: 'beinsports',
    quality: '1080p HD',
    description: 'Partidos en vivo 24/7, Ligue 1, Süper Lig, resúmenes oficiales y fútbol europeo',
    channels: [
      {
        id: 'beinxtra-1',
        label: 'Señal Directa beIN XTRA 1080p',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://bein-xtra-bein.amagi.tv/playlist.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'bein-usa',
    dial: 82,
    name: 'beIN SPORTS USA',
    shortMark: 'beIN USA',
    brandTone: '#8B5CF6',
    network: 'beIN SPORTS',
    category: 'beinsports',
    quality: '1080p HD',
    description: 'Canal principal de beIN SPORTS USA con fútbol europeo, sudamericano y motor en vivo',
    channels: [
      {
        id: 'beinusa-1',
        label: 'Señal Directa beIN USA HD',
        lang: 'EN',
        quality: 'HD',
        sourceUrl: 'https://tvsen6.aynaott.com/beinsports/index.m3u8',
        resolverType: 'tdt_hls',
      },
      {
        id: 'beinusa-2',
        label: 'Señal 2 beIN SPORTS USA',
        lang: 'EN',
        quality: '1080p',
        sourceUrl: 'https://pig.footunder.online/stream/61',
        resolverType: 'sports_channel',
      },
    ],
  },
  {
    id: 'bein-1',
    dial: 83,
    name: 'beIN SPORTS 1',
    shortMark: 'beIN 1',
    brandTone: '#7C3AED',
    network: 'beIN SPORTS',
    category: 'beinsports',
    quality: '1080p HD',
    description: 'UEFA Champions League, LaLiga, Premier League y Ligue 1 en directo 24/7',
    channels: [
      {
        id: 'bein1-1',
        label: 'Señal Principal beIN SPORTS 1 HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://pig.footunder.online/stream/116',
        resolverType: 'sports_channel',
      },
      {
        id: 'bein1-2',
        label: 'Señal 2 beIN SPORTS 1',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://pig.footunder.online/stream/173',
        resolverType: 'sports_channel',
      },
    ],
  },
  {
    id: 'bein-2',
    dial: 84,
    name: 'beIN SPORTS 2',
    shortMark: 'beIN 2',
    brandTone: '#7C3AED',
    network: 'beIN SPORTS',
    category: 'beinsports',
    quality: '1080p HD',
    description: 'Segundo canal lineal beIN SPORTS: Champions League, LaLiga, Bundesliga y Serie A',
    channels: [
      {
        id: 'bein2-1',
        label: 'Señal beIN SPORTS 2 HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://pig.footunder.online/stream/117',
        resolverType: 'sports_channel',
      },
    ],
  },
  {
    id: 'bein-3',
    dial: 85,
    name: 'beIN SPORTS 3',
    shortMark: 'beIN 3',
    brandTone: '#7C3AED',
    network: 'beIN SPORTS',
    category: 'beinsports',
    quality: '1080p HD',
    description: 'Tercer canal beIN SPORTS: fútbol europeo simultáneo, NBA y tenis ATP/WTA',
    channels: [
      {
        id: 'bein3-1',
        label: 'Señal beIN SPORTS 3 HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://pig.footunder.online/stream/118',
        resolverType: 'sports_channel',
      },
    ],
  },
  {
    id: 'bein-4',
    dial: 86,
    name: 'beIN SPORTS 4',
    shortMark: 'beIN 4',
    brandTone: '#6D28D9',
    network: 'beIN SPORTS',
    category: 'beinsports',
    quality: '1080p HD',
    description: 'beIN SPORTS 4 / MAX 4: partidos simultáneos de ligas europeas y torneos UEFA',
    channels: [
      {
        id: 'bein4-1',
        label: 'Señal beIN SPORTS 4 HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://pig.footunder.online/stream/494',
        resolverType: 'sports_channel',
      },
    ],
  },
  {
    id: 'bein-5',
    dial: 87,
    name: 'beIN SPORTS 5',
    shortMark: 'beIN 5',
    brandTone: '#6D28D9',
    network: 'beIN SPORTS',
    category: 'beinsports',
    quality: '1080p HD',
    description: 'beIN SPORTS 5 / MAX 5: cobertura multievento de fútbol internacional en vivo',
    channels: [
      {
        id: 'bein5-1',
        label: 'Señal beIN SPORTS 5 HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://pig.footunder.online/stream/495',
        resolverType: 'sports_channel',
      },
    ],
  },
  {
    id: 'bein-6',
    dial: 88,
    name: 'beIN SPORTS 6',
    shortMark: 'beIN 6',
    brandTone: '#6D28D9',
    network: 'beIN SPORTS',
    category: 'beinsports',
    quality: '1080p HD',
    description: 'beIN SPORTS 6 / MAX 6: jornadas completas europeas y eliminatorias en directo',
    channels: [
      {
        id: 'bein6-1',
        label: 'Señal beIN SPORTS 6 HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://pig.footunder.online/stream/496',
        resolverType: 'sports_channel',
      },
    ],
  },
  {
    id: 'bein-7',
    dial: 89,
    name: 'beIN SPORTS 7',
    shortMark: 'beIN 7',
    brandTone: '#6D28D9',
    network: 'beIN SPORTS',
    category: 'beinsports',
    quality: '1080p HD',
    description: 'beIN SPORTS 7 / MAX 7: retransmisiones simultáneas en alta definición',
    channels: [
      {
        id: 'bein7-1',
        label: 'Señal beIN SPORTS 7 HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://pig.footunder.online/stream/498',
        resolverType: 'sports_channel',
      },
    ],
  },
  // ==========================================================================
  // UK & ENGLISH SPORTS HUB (SKY SPORTS · EUROSPORT UK · DAZN UK · MUTV)
  // ==========================================================================
  {
    id: 'uk-sky-premier',
    dial: 130,
    name: 'Sky Sports Premier League (UK)',
    shortMark: 'SKY PL',
    brandTone: '#0284C7',
    network: 'Sky Sports UK (EN)',
    category: 'uk_sports',
    quality: '1080p EN',
    description: 'Sky Sports Premier League UK live English broadcast · Premier League & News',
    channels: [
      {
        id: 'uk-sky-pl-1',
        label: 'Sky Sports Premier League UK HD',
        lang: 'EN',
        quality: '1080p',
        sourceUrl: 'https://cdn.stmify.com/out/v1/SKY_SPORTS_PREMIER_LEAGUE/index.m3u8',
        referer: 'https://stmify.com/',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'uk-sky-f1',
    dial: 131,
    name: 'Sky Sports F1 (UK)',
    shortMark: 'SKY F1',
    brandTone: '#DC2626',
    network: 'Sky Sports UK (EN)',
    category: 'uk_sports',
    quality: '720p EN',
    description: 'Sky Sports F1 UK live English coverage: Formula 1, F2, F3 and paddock analysis',
    channels: [
      {
        id: 'uk-sky-f1-1',
        label: 'Sky Sports F1 UK Direct',
        lang: 'EN',
        quality: '720p',
        sourceUrl: 'https://cdn.stmify.com/out/v1/SKY_SPORTS_F1/index.m3u8',
        referer: 'https://stmify.com/',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'uk-sky-action',
    dial: 132,
    name: 'Sky Sports Action (UK)',
    shortMark: 'SKY ACT',
    brandTone: '#1D4ED8',
    network: 'Sky Sports UK (EN)',
    category: 'uk_sports',
    quality: '720p EN',
    description: 'Sky Sports Action UK live English feed: NFL, Rugby Union, Tennis & Boxing',
    channels: [
      {
        id: 'uk-sky-act-1',
        label: 'Sky Sports Action UK Direct',
        lang: 'EN',
        quality: '720p',
        sourceUrl: 'https://cdn.stmify.com/out/v1/SKY_SPORTS_ACTION/index.m3u8',
        referer: 'https://stmify.com/',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'uk-sky-sports-1',
    dial: 133,
    name: 'Sky Sports Main / 1 (EN)',
    shortMark: 'SKY 1',
    brandTone: '#0369A1',
    network: 'Sky Sports UK (EN)',
    category: 'uk_sports',
    quality: '1080p EN',
    description: 'Sky Sports 1 HD live English sports feed: Football, Cricket & Championship',
    channels: [
      {
        id: 'uk-sky-1-main',
        label: 'Sky Sports 1 1080p',
        lang: 'EN',
        quality: '1080p',
        sourceUrl: 'http://45.228.234.9:8000/play/a06b/index.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'uk-sky-sports-2',
    dial: 134,
    name: 'Sky Sports Arena / 2 (EN)',
    shortMark: 'SKY 2',
    brandTone: '#075985',
    network: 'Sky Sports UK (EN)',
    category: 'uk_sports',
    quality: '1080p EN',
    description: 'Sky Sports 2 HD live English broadcast: Rugby, Darts, EFL & Golf',
    channels: [
      {
        id: 'uk-sky-2-main',
        label: 'Sky Sports 2 1080p',
        lang: 'EN',
        quality: '1080p',
        sourceUrl: 'http://200.115.120.1:8000/play/ca82266/index.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'uk-eurosport-1',
    dial: 135,
    name: 'Eurosport 1 UK',
    shortMark: 'EUR1 UK',
    brandTone: '#1E3A8A',
    network: 'Eurosport UK (EN)',
    category: 'uk_sports',
    quality: '1080p EN',
    description: 'Eurosport 1 UK in English: Grand Slam Tennis, Cycling, Snooker & Athletics',
    channels: [
      {
        id: 'uk-es1-1080',
        label: 'Eurosport 1 UK 1080p',
        lang: 'EN',
        quality: '1080p',
        sourceUrl: 'http://85.117.37.43/eurosport1/index.m3u8',
        resolverType: 'tdt_hls',
      },
      {
        id: 'uk-es1-eu',
        label: 'Eurosport 1 Europe Backup',
        lang: 'EN',
        quality: '720p',
        sourceUrl: 'https://r.eu.cdn-redge.media/livehls/oeu/mt/live/eurosport_1/live.livx/playlist.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'uk-eurosport-2',
    dial: 136,
    name: 'Eurosport 2 UK / Europe',
    shortMark: 'EUR2 EN',
    brandTone: '#1E40AF',
    network: 'Eurosport UK (EN)',
    category: 'uk_sports',
    quality: '1080p EN',
    description: 'Eurosport 2 live English feed: PGA Golf, Superbike, Motorsport & ATP Tennis',
    channels: [
      {
        id: 'uk-es2-main',
        label: 'Eurosport 2 HD',
        lang: 'EN',
        quality: '1080p',
        sourceUrl: 'https://r.eu.cdn-redge.media/livehls/oeu/mt/live/eurosport_2/live.livx/playlist.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'uk-mutv',
    dial: 137,
    name: 'MUTV (Manchester Utd UK)',
    shortMark: 'MUTV',
    brandTone: '#B91C1C',
    network: 'UK Club TV (EN)',
    category: 'uk_sports',
    quality: '720p EN',
    description: 'Official Manchester United TV in English: matchday build-up, replays & Academy live',
    channels: [
      {
        id: 'uk-mutv-live',
        label: 'MUTV Official UK Stream',
        lang: 'EN',
        quality: '720p',
        sourceUrl:
          'https://fastly.live.brightcove.com/6374054671112/eu-west-1/6058004203001/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJob3N0IjoiYXplMnp5LmVncmVzcy55ODN1ZWIiLCJhY2NvdW50X2lkIjoiNjA1ODAwNDIwMzAwMSIsImVobiI6ImZhc3RseS5saXZlLmJyaWdodGNvdmUuY29tIiwiaXNzIjoiYmxpdmUtcGxheWJhY2stc291cmNlLWFwaSIsInN1YiI6InBhdGhtYXB0b2tlbiIsImF1ZCI6WyI2MDU4MDA0MjAzMDAxIl0sImp0aSI6IjYzNzQwNTQ2NzExMTIifQ.3FmuTna3DAmY7xlhK5fk6LMrosrtrR5VsU2QOgYO5y4/playlist-hls.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'uk-talksport',
    dial: 138,
    name: 'talkSPORT TV (UK)',
    shortMark: 'talkSP',
    brandTone: '#F59E0B',
    network: 'talkSPORT UK (EN)',
    category: 'uk_sports',
    quality: '1080p EN',
    description: 'UK live Premier League & Football studio debate, breaking transfer news and match shows',
    channels: [
      {
        id: 'uk-talksport-1080',
        label: 'talkSPORT UK 1080p',
        lang: 'EN',
        quality: '1080p',
        sourceUrl:
          'https://af7a8b4e.wurl.com/master/f36d25e7e52f1ba8d7e56eb859c636563214f541/TEctZ2JfdGFsa1NQT1JUX0hMUw/playlist.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'uk-dazn-darts',
    dial: 139,
    name: 'DAZN Darts UK (EN)',
    shortMark: 'DAZN UK',
    brandTone: '#111827',
    network: 'DAZN UK (EN)',
    category: 'uk_sports',
    quality: '720p EN',
    description: 'DAZN UK PDC Darts tournaments, Premier League Darts & World Championship in English',
    channels: [
      {
        id: 'uk-dazn-darts-1',
        label: 'DAZN Darts UK HD',
        lang: 'EN',
        quality: '720p',
        sourceUrl: 'https://jmp2.uk/plu-64b67f0424ade50008a3be17.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'uk-dazn-combat',
    dial: 140,
    name: 'DAZN Combat (EN)',
    shortMark: 'DAZN CB',
    brandTone: '#18181B',
    network: 'DAZN UK (EN)',
    category: 'uk_sports',
    quality: '720p EN',
    description: 'DAZN Combat live English boxing cards, PFL MMA & Matchroom fight nights',
    channels: [
      {
        id: 'uk-dazn-combat-1',
        label: 'DAZN Combat English HD',
        lang: 'EN',
        quality: '720p',
        sourceUrl: 'https://jmp2.uk/plu-64d626ac9b414d000820e2fc.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'uk-redbull',
    dial: 141,
    name: 'Red Bull TV UK (EN)',
    shortMark: 'RB UK',
    brandTone: '#DC2626',
    network: 'Red Bull UK (EN)',
    category: 'uk_sports',
    quality: '1080p EN',
    description: 'Red Bull TV UK live English motorsport, WRC, MTB & extreme world events',
    channels: [
      {
        id: 'uk-redbull-1080',
        label: 'Red Bull TV UK 1080p',
        lang: 'EN',
        quality: '1080p',
        sourceUrl:
          'https://1a3566cb46914c5499fbc86fbc4ac87e.mediatailor.us-west-2.amazonaws.com/v1/master/ba62fe743df0fe93366eba3a257d792884136c7f/LINEAR-932-WORBUKENFAST-WHALETVPLUS/932/whaletvplus/hls/master/playlist.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'uk-fifa-plus',
    dial: 142,
    name: 'FIFA+ Football (EN)',
    shortMark: 'FIFA+',
    brandTone: '#0F172A',
    network: 'FIFA+ UK (EN)',
    category: 'uk_sports',
    quality: '1080p EN',
    description: 'FIFA+ English live football matches, World Cup classics & documentaries',
    channels: [
      {
        id: 'uk-fifaplus-1',
        label: 'FIFA+ English 1080p',
        lang: 'EN',
        quality: '1080p',
        sourceUrl:
          'https://d2w9q46ikgrcwx.cloudfront.net/v1/master/3722c60a815c199d9c0ef36c5b73da68a62b09d1/cc-of5cbk3sav3w5/v1/sysdata_s_p_a_fifa_7/samsungheadend_us/latest/main/hls/playlist.m3u8',
        resolverType: 'tdt_hls',
      },
      {
        id: 'uk-fifaplus-2',
        label: 'FIFA+ UK Alternate Feed',
        lang: 'EN',
        quality: '720p',
        sourceUrl: 'https://jmp2.uk/plu-660c29b5aec9680008f5b4a4.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'uk-fifa-women',
    dial: 143,
    name: 'FIFA+ Women UK (EN)',
    shortMark: 'FIFA W',
    brandTone: '#7C3AED',
    network: 'FIFA+ UK (EN)',
    category: 'uk_sports',
    quality: '720p EN',
    description: 'FIFA+ Women UK live English women football competitions and highlights',
    channels: [
      {
        id: 'uk-fifaw-1',
        label: 'FIFA+ Women UK HD',
        lang: 'EN',
        quality: '720p',
        sourceUrl:
          'https://cffda8ff.wurl.com/master/f36d25e7e52f1ba8d7e56eb859c636563214f541/U2Ftc3VuZy1nYl9GSUZBUGx1c3dvbWVuX0hMUw/playlist.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'uk-bellator-mma',
    dial: 144,
    name: 'Bellator MMA (EN)',
    shortMark: 'MMA EN',
    brandTone: '#991B1B',
    network: 'Combat Sports (EN)',
    category: 'uk_sports',
    quality: '720p EN',
    description: 'Bellator MMA championship bouts and main events in English 24/7',
    channels: [
      {
        id: 'uk-bellator-1',
        label: 'Bellator MMA HD',
        lang: 'EN',
        quality: '720p',
        sourceUrl: 'https://jmp2.uk/plu-5ebc8688f3697d00072f7cf8.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'uk-cbs-sports',
    dial: 145,
    name: 'CBS Sports HQ (EN)',
    shortMark: 'CBS HQ',
    brandTone: '#1D4ED8',
    network: 'Sports News (EN)',
    category: 'uk_sports',
    quality: '720p EN',
    description: 'CBS Sports HQ 24/7 English coverage: UEFA Champions League, NFL, NBA & scores',
    channels: [
      {
        id: 'uk-cbs-1',
        label: 'CBS Sports HQ English HD',
        lang: 'EN',
        quality: '720p',
        sourceUrl: 'https://jmp2.uk/plu-5e9f2c05172a0f0007db4786.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'uk-strongman',
    dial: 146,
    name: 'Strongman Champions UK (EN)',
    shortMark: 'STRONG',
    brandTone: '#B45309',
    network: 'UK Sports (EN)',
    category: 'uk_sports',
    quality: '720p EN',
    description: 'UK Strongman Champions League competitions and strength athletics in English',
    channels: [
      {
        id: 'uk-strong-1',
        label: 'Strongman UK HD',
        lang: 'EN',
        quality: '720p',
        sourceUrl: 'https://rightsboosterltd-scl-1-eu.rakuten.wurl.tv/playlist.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'uk-floracing',
    dial: 147,
    name: 'FloRacing Motorsport (EN)',
    shortMark: 'FLORA',
    brandTone: '#EA580C',
    network: 'Motorsport (EN)',
    category: 'uk_sports',
    quality: '1080p EN',
    description: 'FloRacing English 24/7 oval racing, dirt track, sprint cars & UK/US motorsport',
    channels: [
      {
        id: 'uk-flo-1',
        label: 'FloRacing 1080p',
        lang: 'EN',
        quality: '1080p',
        sourceUrl:
          'https://amg02278-amg02278c1-flosports-worldwide-7592.playouts.now.amagi.tv/playlist.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'uk-sky-racing',
    dial: 148,
    name: 'Sky Racing 1 (EN)',
    shortMark: 'SKYRAC',
    brandTone: '#047857',
    network: 'Racing (EN)',
    category: 'uk_sports',
    quality: '720p EN',
    description: 'Sky Racing 1 English live horse racing & thoroughbred coverage',
    channels: [
      {
        id: 'uk-skyrac-1',
        label: 'Sky Racing 1 HD',
        lang: 'EN',
        quality: '720p',
        sourceUrl: 'https://636ffd31f0e12.streamlock.net/RacingStream1/RacingStream1/playlist.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'uk-tsn-ocho',
    dial: 149,
    name: 'TSN The Ocho (EN)',
    shortMark: 'OCHO',
    brandTone: '#E11D48',
    network: 'Sports (EN)',
    category: 'uk_sports',
    quality: '1080p EN',
    description: 'TSN The Ocho English live alternative sports, championships & events 24/7',
    channels: [
      {
        id: 'uk-tsn-1',
        label: 'TSN The Ocho 1080p',
        lang: 'EN',
        quality: '1080p',
        sourceUrl:
          'https://d3pnbvng3bx2nj.cloudfront.net/v1/master/3722c60a815c199d9c0ef36c5b73da68a62b09d1/cc-rds8g35qfqrnv/TSN_The_Ocho.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
  // ==========================================================================
  // ESPN EN VIVO (ESPN, ESPN 2, ESPN 3, ESPN 4, ESPN 5, ESPN 6, ESPN 7, PREMIUM)
  // ==========================================================================
  {
    id: 'espn-1',
    dial: 101,
    name: 'ESPN',
    shortMark: 'ESPN',
    brandTone: '#DC2626',
    network: 'ESPN En Vivo',
    category: 'espn',
    quality: '1080p HD',
    description: 'UEFA Champions League, Premier League, Serie A, Copa Libertadores y SportsCenter en vivo',
    channels: [
      {
        id: 'espn1-sxhd',
        label: 'Señal Principal ESPN 1080p',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://streamxhd.sbs/live2.php?stream=espn',
        resolverType: 'sports_channel',
      },
      {
        id: 'espn1-hls',
        label: 'Señal 2 ESPN HD Directa',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://barinaslive1.boldmss.com/ESPN/ESPN.isml/ESPN.m3u8',
        resolverType: 'tdt_hls',
      },
      {
        id: 'espn1-ar',
        label: 'Señal 3 ESPN Sur HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://streamxhd.sbs/live1.php?stream=espnar',
        resolverType: 'sports_channel',
      },
      {
        id: 'espn1-tvtodo',
        label: 'Señal 4 ESPN Satélite',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://footunder.online/tvtodo/espn.php',
        resolverType: 'sports_channel',
      },
    ],
  },
  {
    id: 'espn-2',
    dial: 102,
    name: 'ESPN 2',
    shortMark: 'ESPN 2',
    brandTone: '#DC2626',
    network: 'ESPN En Vivo',
    category: 'espn',
    quality: '1080p HD',
    description: 'Fútbol europeo, LaLiga, Bundesliga, NBA, tenis Grand Slam y debate futbolero en directo',
    channels: [
      {
        id: 'espn2-sxhd',
        label: 'Señal Principal ESPN 2 1080p',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://streamxhd.sbs/live2.php?stream=espn2',
        resolverType: 'sports_channel',
      },
      {
        id: 'espn2-hls',
        label: 'Señal 2 ESPN 2 HD Directa',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://barinaslive1.boldmss.com/ESPN_2/ESPN_2.isml/ESPN_2.m3u8',
        resolverType: 'tdt_hls',
      },
      {
        id: 'espn2-tvtodo',
        label: 'Señal 3 ESPN 2 Satélite',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://footunder.online/tvtodo/espn-2.php',
        resolverType: 'sports_channel',
      },
    ],
  },
  {
    id: 'espn-3',
    dial: 103,
    name: 'ESPN 3',
    shortMark: 'ESPN 3',
    brandTone: '#B91C1C',
    network: 'ESPN En Vivo',
    category: 'espn',
    quality: '1080p HD',
    description: 'Europa League, Conference League, ciclismo, motor y fútbol internacional en vivo',
    channels: [
      {
        id: 'espn3-sxhd',
        label: 'Señal Principal ESPN 3 1080p',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://streamxhd.sbs/live2.php?stream=espn3',
        resolverType: 'sports_channel',
      },
      {
        id: 'espn3-hls',
        label: 'Señal 2 ESPN 3 HD Directa',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://barinaslive1.boldmss.com/ESPN_3/ESPN_3.isml/ESPN_3.m3u8',
        resolverType: 'tdt_hls',
      },
      {
        id: 'espn3-tvtodo',
        label: 'Señal 3 ESPN 3 Satélite',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://footunder.online/tvtodo/espn-3.php',
        resolverType: 'sports_channel',
      },
    ],
  },
  {
    id: 'espn-4',
    dial: 104,
    name: 'ESPN 4',
    shortMark: 'ESPN 4',
    brandTone: '#B91C1C',
    network: 'ESPN En Vivo',
    category: 'espn',
    quality: '1080p HD',
    description: 'Fórmula 1, MotoGP, Ligue 1, Eredivisie y grandes partidos europeos en directo',
    channels: [
      {
        id: 'espn4-sxhd',
        label: 'Señal Principal ESPN 4 1080p',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://streamxhd.sbs/live2.php?stream=espn4',
        resolverType: 'sports_channel',
      },
      {
        id: 'espn4-hls',
        label: 'Señal 2 ESPN 4 HD Directa',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://barinaslive1.boldmss.com/ESPN_4/ESPN_4.isml/ESPN_4.m3u8',
        resolverType: 'tdt_hls',
      },
      {
        id: 'espn4-tvtodo',
        label: 'Señal 3 ESPN 4 Satélite',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://footunder.online/tvtodo/espn-4.php',
        resolverType: 'sports_channel',
      },
    ],
  },
  {
    id: 'espn-5',
    dial: 105,
    name: 'ESPN 5',
    shortMark: 'ESPN 5',
    brandTone: '#991B1B',
    network: 'ESPN En Vivo',
    category: 'espn',
    quality: '1080p HD',
    description: 'Quinto canal ESPN en vivo: fútbol sudamericano, europeo, boxeo y UFC',
    channels: [
      {
        id: 'espn5-sxhd',
        label: 'Señal Principal ESPN 5 1080p',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://streamxhd.sbs/live2.php?stream=espn5',
        resolverType: 'sports_channel',
      },
      {
        id: 'espn5-hls',
        label: 'Señal 2 ESPN 5 HD Directa',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://barinaslive1.boldmss.com/ESPN_5/ESPN_5.isml/ESPN_5.m3u8',
        resolverType: 'tdt_hls',
      },
      {
        id: 'espn5-tvtodo',
        label: 'Señal 3 ESPN 5 Satélite',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://footunder.online/tvtodo/espn-5.php',
        resolverType: 'sports_channel',
      },
    ],
  },
  {
    id: 'espn-6',
    dial: 106,
    name: 'ESPN 6',
    shortMark: 'ESPN 6',
    brandTone: '#991B1B',
    network: 'ESPN En Vivo',
    category: 'espn',
    quality: '1080p HD',
    description: 'Sexto canal ESPN en vivo para jornadas simultáneas de Champions, Libertadores y ligas',
    channels: [
      {
        id: 'espn6-sxhd',
        label: 'Señal Principal ESPN 6 1080p',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://streamxhd.sbs/live2.php?stream=espn6',
        resolverType: 'sports_channel',
      },
      {
        id: 'espn6-hls',
        label: 'Señal 2 ESPN 6 HD Directa',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://barinaslive1.boldmss.com/ESPN_6/ESPN_6.isml/ESPN_6.m3u8',
        resolverType: 'tdt_hls',
      },
      {
        id: 'espn6-tvtodo',
        label: 'Señal 3 ESPN 6 Satélite',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://footunder.online/tvtodo/espn-6.php',
        resolverType: 'sports_channel',
      },
    ],
  },
  {
    id: 'espn-7',
    dial: 107,
    name: 'ESPN 7',
    shortMark: 'ESPN 7',
    brandTone: '#7F1D1D',
    network: 'ESPN En Vivo',
    category: 'espn',
    quality: '1080p HD',
    description: 'Séptimo canal ESPN en directo: multievento de fútbol internacional, tenis y rugby',
    channels: [
      {
        id: 'espn7-sxhd',
        label: 'Señal Principal ESPN 7 1080p',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://streamxhd.sbs/live2.php?stream=espn7',
        resolverType: 'sports_channel',
      },
      {
        id: 'espn7-hls',
        label: 'Señal 2 ESPN 7 HD Directa',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://barinaslive1.boldmss.com/ESPN_7/ESPN_7.isml/ESPN_7.m3u8',
        resolverType: 'tdt_hls',
      },
      {
        id: 'espn7-tvtodo',
        label: 'Señal 3 ESPN 7 Satélite',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://footunder.online/tvtodo/espn-7.php',
        resolverType: 'sports_channel',
      },
    ],
  },
  {
    id: 'espn-premium',
    dial: 108,
    name: 'ESPN Premium',
    shortMark: 'ESPN+',
    brandTone: '#F59E0B',
    network: 'ESPN En Vivo',
    category: 'espn',
    quality: '1080p HD',
    description: 'Liga Profesional Argentina, superclásicos y fútbol exclusivo en alta definición 24/7',
    channels: [
      {
        id: 'espnp-sxhd',
        label: 'Señal Principal ESPN Premium 1080p',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://streamxhd.sbs/live2.php?stream=espnpremium',
        resolverType: 'sports_channel',
      },
      {
        id: 'espnp-hls',
        label: 'Señal 2 ESPN Premium HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'http://158.172.155.130:8000/play/a0ao/index.m3u8',
        resolverType: 'tdt_hls',
      },
      {
        id: 'espnp-tvtodo',
        label: 'Señal 3 ESPN Premium Satélite',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://footunder.online/tvtodo/espnpremiun.php',
        resolverType: 'sports_channel',
      },
    ],
  },
  // ==========================================================================
  // DSPORTS EN VIVO (DSPORTS, DSPORTS 2, DSPORTS+, DSPORTS MOTOR, DSPORTS FIGHT)
  // ==========================================================================
  {
    id: 'dsports-1',
    dial: 110,
    name: 'DSports',
    shortMark: 'DSPORTS',
    brandTone: '#0284C7',
    network: 'DirecTV Sports',
    category: 'dsports',
    quality: '1080p HD',
    description: 'LaLiga EA Sports, Copa Sudamericana, Copa del Rey, Eliminatorias y Fútbol Total en vivo',
    channels: [
      {
        id: 'dsp1-sxhd',
        label: 'Señal Principal DSports 1080p',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://streamxhd.sbs/live2.php?stream=dsports',
        resolverType: 'sports_channel',
      },
      {
        id: 'dsp1-tvtodo',
        label: 'Señal 2 DSports HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://footunder.online/tvtodo/directv-sports.php',
        resolverType: 'sports_channel',
      },
    ],
  },
  {
    id: 'dsports-2',
    dial: 111,
    name: 'DSports 2',
    shortMark: 'DSP 2',
    brandTone: '#0369A1',
    network: 'DirecTV Sports',
    category: 'dsports',
    quality: '1080p HD',
    description: 'Segundo canal DSports en vivo: LaLiga, Copa Sudamericana, baloncesto FIBA y ciclismo',
    channels: [
      {
        id: 'dsp2-sxhd',
        label: 'Señal Principal DSports 2 1080p',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://streamxhd.sbs/live2.php?stream=dsports2',
        resolverType: 'sports_channel',
      },
      {
        id: 'dsp2-tvtodo',
        label: 'Señal 2 DSports 2 HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://footunder.online/tvtodo/directv-2.php',
        resolverType: 'sports_channel',
      },
    ],
  },
  {
    id: 'dsports-plus',
    dial: 112,
    name: 'DSports+',
    shortMark: 'DSP+',
    brandTone: '#0EA5E9',
    network: 'DirecTV Sports',
    category: 'dsports',
    quality: '1080p HD',
    description: 'DSports Plus en directo: partidos exclusivos simultáneos de fútbol europeo y sudamericano',
    channels: [
      {
        id: 'dspp-sxhd',
        label: 'Señal Principal DSports+ 1080p',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://streamxhd.sbs/live2.php?stream=dsportsplus',
        resolverType: 'sports_channel',
      },
      {
        id: 'dspp-tvtodo',
        label: 'Señal 2 DSports+ HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://footunder.online/tvtodo/directv-plus.php',
        resolverType: 'sports_channel',
      },
    ],
  },
  {
    id: 'dsports-motor',
    dial: 113,
    name: 'DSports Motor',
    shortMark: 'DSP MOT',
    brandTone: '#EA580C',
    network: 'DirecTV Sports',
    category: 'dsports',
    quality: '1080p HD',
    description: 'Automovilismo mundial 24/7: Fórmula E, IndyCar, Superbike, Rally y especiales de motor',
    channels: [
      {
        id: 'dspmot-1',
        label: 'Señal Principal DSports Motor HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://pig.footunder.online/stream/96',
        resolverType: 'sports_channel',
      },
      {
        id: 'dspmot-2',
        label: 'Señal 2 DSports Motor',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://streamxhd.sbs/live2.php?stream=dsportsmotor',
        resolverType: 'sports_channel',
      },
    ],
  },
  {
    id: 'dsports-fight',
    dial: 114,
    name: 'DSports Fight',
    shortMark: 'DSP FGT',
    brandTone: '#E11D48',
    network: 'DirecTV Sports',
    category: 'dsports',
    quality: '1080p HD',
    description: 'Boxeo internacional, MMA, PFL, kickboxing y deportes de combate las 24 horas',
    channels: [
      {
        id: 'dspfgt-1',
        label: 'Señal Principal DSports Fight HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://pig.footunder.online/stream/98',
        resolverType: 'sports_channel',
      },
      {
        id: 'dspfgt-2',
        label: 'Señal 2 DSports Fight',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://streamxhd.sbs/live2.php?stream=dsportsfight',
        resolverType: 'sports_channel',
      },
    ],
  },
  // ==========================================================================
  // TNT, TNT SPORTS & SPACE EN VIVO
  // ==========================================================================
  {
    id: 'tnt-sports',
    dial: 115,
    name: 'TNT Sports',
    shortMark: 'TNT SP',
    brandTone: '#EC4899',
    network: 'TNT Sports',
    category: 'tnt_space',
    quality: '1080p HD',
    description: 'UEFA Champions League, Liga Profesional, Primera División y grandes finales en directo',
    channels: [
      {
        id: 'tntsp-1',
        label: 'Señal Principal TNT Sports 1080p',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://streamxhd.sbs/live2.php?stream=tntsports',
        resolverType: 'sports_channel',
      },
      {
        id: 'tntsp-2',
        label: 'Señal 2 TNT Sports HD Directa',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'http://45.184.109.10/live/69393EAE6ADBC65A68F942022362A202/86.m3u8',
        resolverType: 'tdt_hls',
      },
      {
        id: 'tntsp-3',
        label: 'Señal 3 TNT Sports Satélite',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://footunder.online/tvtodo/tnt-sports.php',
        resolverType: 'sports_channel',
      },
    ],
  },
  {
    id: 'tnt-vivo',
    dial: 116,
    name: 'TNT',
    shortMark: 'TNT',
    brandTone: '#DB2777',
    network: 'Warner · TNT Sports',
    category: 'tnt_space',
    quality: '1080p HD',
    description: 'Champions League en vivo, eventos especiales, estrenos de Hollywood y gala de premios',
    channels: [
      {
        id: 'tnt-1',
        label: 'Señal Principal TNT 1080p',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'http://45.171.64.30:6060/play/a03i/index.m3u8',
        resolverType: 'tdt_hls',
      },
      {
        id: 'tnt-2',
        label: 'Señal 2 TNT HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'http://45.134.141.161:2200/ARG/TNT/index.m3u8',
        resolverType: 'tdt_hls',
      },
      {
        id: 'tnt-3',
        label: 'Señal 3 TNT Sur 1080p',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'http://181.78.211.244:8005/play/a09g/index.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'space-vivo',
    dial: 117,
    name: 'Space',
    shortMark: 'SPACE',
    brandTone: '#FACC15',
    network: 'Warner · Space',
    category: 'tnt_space',
    quality: '1080p HD',
    description: 'UEFA Champions League, Combate Space (boxeo en vivo), cine de acción y adrenalina 24/7',
    channels: [
      {
        id: 'space-1',
        label: 'Señal Principal Space 1080p',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'http://45.171.64.30:6060/play/a04n/index.m3u8',
        resolverType: 'tdt_hls',
      },
      {
        id: 'space-2',
        label: 'Señal 2 Space Sur HD',
        lang: 'ES',
        quality: '720p',
        sourceUrl: 'https://bantel-cdn1.iptvperu.tv:1936/btnscrtn/space.stream/playlist.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'tdt-neox',
    dial: 10,
    name: 'Neox',
    shortMark: 'NEOX',
    brandTone: '#F59E0B',
    network: 'Atresmedia',
    category: 'cine_series',
    quality: '1080p HD',
    description: 'Los Simpson, The Big Bang Theory, comedia juvenil y cine taquillero',
    channels: [
      {
        id: 'neox-dvb',
        label: 'Antena TDT 1080p',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'http://90.163.85.113:8093/stream/22/index.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'tdt-fdf',
    dial: 8,
    name: 'Factoría de Ficción',
    shortMark: 'FDF',
    brandTone: '#10B981',
    network: 'Mediaset',
    category: 'cine_series',
    quality: '1080p HD',
    description: 'La Que Se Avecina, Aída, comedia española y series 24 horas',
    channels: [
      {
        id: 'fdf-dvb',
        label: 'Antena TDT 1080p',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'http://90.163.85.113:8093/stream/39/index.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'tdt-nova',
    dial: 9,
    name: 'Nova',
    shortMark: 'NOVA',
    brandTone: '#EC4899',
    network: 'Atresmedia',
    category: 'cine_series',
    quality: '1080p HD',
    description: 'Series internacionales, grandes estrenos románticos y cine familiar',
    channels: [
      {
        id: 'nova-dvb',
        label: 'Antena TDT 1080p',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'http://90.163.85.113:8093/stream/23/index.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'tdt-energy',
    dial: 10,
    name: 'Energy',
    shortMark: 'E.',
    brandTone: '#6366F1',
    network: 'Mediaset',
    category: 'cine_series',
    quality: '1080p HD',
    description: 'CSI, FBI, Mentes Criminales y las mejores series procedimentales',
    channels: [
      {
        id: 'energy-dvb',
        label: 'Antena TDT 1080p',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'http://90.163.85.113:8093/stream/18/index.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'tdt-atreseries',
    dial: 11,
    name: 'Atreseries',
    shortMark: 'A3S',
    brandTone: '#E11D48',
    network: 'Atresmedia',
    category: 'cine_series',
    quality: '1080p HD',
    description: 'Series españolas e internacionales en alta definición',
    channels: [
      {
        id: 'a3s-dvb',
        label: 'Antena TDT 1080p',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'http://90.163.85.113:8093/stream/24/index.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'tdt-bemad',
    dial: 12,
    name: 'Be Mad',
    shortMark: 'BMAD',
    brandTone: '#D97706',
    network: 'Mediaset',
    category: 'cine_series',
    quality: '1080p HD',
    description: 'Canal 100% cine de Hollywood en alta definición',
    channels: [
      {
        id: 'bemad-dvb',
        label: 'Antena TDT 1080p',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'http://90.163.85.113:8093/stream/25/index.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'tdt-paramount',
    dial: 13,
    name: 'Paramount Network',
    shortMark: 'PAR',
    brandTone: '#3B82F6',
    network: 'Paramount · TDT Cine',
    category: 'cine_series',
    quality: '1080p HD',
    description: 'Cine de estudio, thriller, acción y series clásicas de misterio',
    channels: [
      {
        id: 'paramount-dvb',
        label: 'Antena TDT Cine 1080p',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'http://90.163.85.113:8093/stream/50/index.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'tdt-bomcine',
    dial: 14,
    name: 'BOM Cine',
    shortMark: 'BOM',
    brandTone: '#B91C1C',
    network: 'TDT Cine',
    category: 'cine_series',
    quality: '1080p HD',
    description: 'Películas ininterrumpidas de todos los géneros las 24 horas',
    channels: [
      {
        id: 'bom-dvb',
        label: 'Antena TDT 1080p',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'http://90.163.85.113:8093/stream/35/index.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'tdt-mega',
    dial: 15,
    name: 'Mega',
    shortMark: 'MEGA',
    brandTone: '#DC2626',
    network: 'Atresmedia',
    category: 'entretenimiento',
    quality: '1080p HD',
    description: 'El Chiringuito de Jugones, Forjado a Fuego y docu-realities',
    channels: [
      {
        id: 'mega-dvb',
        label: 'Antena TDT 1080p',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'http://90.163.85.113:8093/stream/11/index.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'tdt-dmax',
    dial: 16,
    name: 'DMAX',
    shortMark: 'DMAX',
    brandTone: '#EA580C',
    network: 'Warner Bros. Discovery',
    category: 'entretenimiento',
    quality: '1080p HD',
    description: 'Aventura, motor, ciencia, supervivencia, historia y cine',
    channels: [
      {
        id: 'dmax-dvb',
        label: 'Antena TDT 1080p',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'http://90.163.85.113:8093/stream/51/index.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'tdt-divinity',
    dial: 17,
    name: 'Divinity',
    shortMark: 'DIV',
    brandTone: '#DB2777',
    network: 'Mediaset',
    category: 'entretenimiento',
    quality: '1080p HD',
    description: 'Reformas, decoración, lifestyle y grandes series románticas',
    channels: [
      {
        id: 'divinity-dvb',
        label: 'Antena TDT 1080p',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'http://90.163.85.113:8093/stream/40/index.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'tdt-dkiss',
    dial: 18,
    name: 'DKISS',
    shortMark: 'DKISS',
    brandTone: '#C026D3',
    network: 'TDT Nacional',
    category: 'entretenimiento',
    quality: '1080p HD',
    description: 'True crime, reformas, salud y entretenimiento factual',
    channels: [
      {
        id: 'dkiss-dvb',
        label: 'Antena TDT 1080p',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'http://90.163.85.113:8093/stream/4/index.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'tdt-ten',
    dial: 19,
    name: 'TEN',
    shortMark: 'TEN',
    brandTone: '#14B8A6',
    network: 'Secuoya',
    category: 'entretenimiento',
    quality: '1080p HD',
    description: 'Ni que fuéramos, investigación criminal, magacines y realities',
    channels: [
      {
        id: 'ten-dvb',
        label: 'Antena TDT 1080p',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'http://90.163.85.113:8093/stream/27/index.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'tdt-trece',
    dial: 20,
    name: 'TRECE',
    shortMark: '13',
    brandTone: '#0D9488',
    network: 'TRECE TV',
    category: 'entretenimiento',
    quality: '1080p HD',
    description: 'Cine western, cine clásico español, actualidad y tertulia',
    channels: [
      {
        id: 'trece-oficial',
        label: 'Señal Oficial HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl:
          'https://play.cdn.enetres.net/091DB7AFBD77442B9BA2F141DCC182F5021/021/playlist.m3u8',
        resolverType: 'tdt_hls',
      },
      {
        id: 'trece-dvb',
        label: 'Señal Antena TDT HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'http://90.163.85.113:8093/stream/15/index.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'tdt-24h',
    dial: 21,
    name: '24 Horas',
    shortMark: '24h',
    brandTone: '#EF4444',
    network: 'RTVE Noticias',
    category: 'noticias_deportes',
    quality: '1080p HD',
    description: 'Información continua nacional e internacional en tiempo real',
    channels: [
      {
        id: '24h-rtve',
        label: 'Señal Oficial RTVE HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://rtvelivestream.rtve.es/rtvesec/24h/24h_main.m3u8',
        resolverType: 'tdt_hls',
      },
      {
        id: '24h-dvb',
        label: 'Señal Antena TDT HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'http://90.163.85.113:8093/stream/44/index.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'tdt-teledeporte',
    dial: 22,
    name: 'Teledeporte',
    shortMark: 'TDP',
    brandTone: '#F97316',
    network: 'RTVE Deportes',
    category: 'noticias_deportes',
    quality: '1080p HD',
    description: 'Tenis, ciclismo, fútbol, atletismo, motor y Estudio Estadio en vivo',
    channels: [
      {
        id: 'tdp-dvb',
        label: 'Señal Antena TDT 1080p',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'http://90.163.85.113:8093/stream/43/index.m3u8',
        resolverType: 'tdt_hls',
      },
      {
        id: 'tdp-rtve',
        label: 'Señal Oficial RTVE HD (España)',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://rtvelivestream.rtve.es/rtvesec/tdp/tdp_main.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'tdt-rmtv',
    dial: 23,
    name: 'Real Madrid TV',
    shortMark: 'RMTV',
    brandTone: '#4F46E5',
    network: 'Deportes TDT',
    category: 'noticias_deportes',
    quality: '1080p HD',
    description: 'Actualidad blanca, ruedas de prensa, cantera, tertulia y cine',
    channels: [
      {
        id: 'rmtv-oficial',
        label: 'Señal Oficial HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://rmtv.akamaized.net/hls/live/2043153/rmtv-es-web/master.m3u8',
        resolverType: 'tdt_hls',
      },
      {
        id: 'rmtv-dvb',
        label: 'Señal Antena TDT HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'http://90.163.85.113:8093/stream/26/index.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'tdt-clan',
    dial: 24,
    name: 'Clan RTVE',
    shortMark: 'CLAN',
    brandTone: '#8B5CF6',
    network: 'RTVE Infantil',
    category: 'infantil_autonomicas',
    quality: '1080p HD',
    description: 'Series infantiles, animación familiar y cine juvenil',
    channels: [
      {
        id: 'clan-dvb',
        label: 'Señal Antena TDT 1080p',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'http://90.163.85.113:8093/stream/52/index.m3u8',
        resolverType: 'tdt_hls',
      },
      {
        id: 'clan-rtve',
        label: 'Señal Oficial RTVE HD (España)',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://rtvelivestream.rtve.es/rtvesec/clan/clan_main.m3u8',
        resolverType: 'tdt_hls',
      },
      {
        id: 'clan-rtve-alt',
        label: 'Señal Oficial RTVE Respaldo HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://ztnr.rtve.es/ztnr/5466990.m3u8',
        resolverType: 'tdt_hls',
      },
      {
        id: 'clan-boing-bk',
        label: 'Señal Infantil Alternativa HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'http://90.163.85.113:8093/stream/19/index.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'tdt-boing',
    dial: 25,
    name: 'Boing',
    shortMark: 'BOING',
    brandTone: '#06B6D4',
    network: 'Mediaset Infantil',
    category: 'infantil_autonomicas',
    quality: '1080p HD',
    description: 'Doraemon, Gumball, Dragon Ball, Teen Titans y Cartoon Network',
    channels: [
      {
        id: 'boing-dvb',
        label: 'Antena TDT 1080p',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'http://90.163.85.113:8093/stream/19/index.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'tdt-canalsur',
    dial: 26,
    name: 'Canal Sur',
    shortMark: 'CSUR',
    brandTone: '#16A34A',
    network: 'RTVA Andalucía',
    category: 'infantil_autonomicas',
    quality: '1080p HD',
    description: 'Televisión pública de Andalucía: entretenimiento, cine e informativos',
    channels: [
      {
        id: 'canalsur-dvb',
        label: 'Antena TDT 1080p',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'http://90.163.85.113:8093/stream/34/index.m3u8',
        resolverType: 'tdt_hls',
      },
      {
        id: 'canalsur-oficial',
        label: 'Señal Oficial Canal Sur HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl:
          'https://dfk2a268yviz9.cloudfront.net/v1/master/3722c60a815c199d9c0ef36c5b73da68a62b09d1/cc-ddiii1m6jt6of/CanalSurAndaluciaES.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'tdt-3cat',
    dial: 27,
    name: '3Cat (TV3)',
    shortMark: '3CAT',
    brandTone: '#E11D48',
    network: 'CCMA Catalunya',
    category: 'infantil_autonomicas',
    quality: '1080p HD',
    description: 'Emisión en directo de TV3Cat · Informativos, series y entretenimiento',
    channels: [
      {
        id: '3cat-oficial',
        label: 'Señal Oficial 3Cat HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://directes3-tv-int.3catdirectes.cat/live-content/tvi-hls/master.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'tdt-etb1',
    dial: 28,
    name: 'ETB 1',
    shortMark: 'ETB1',
    brandTone: '#0284C7',
    network: 'EITB Euskadi',
    category: 'infantil_autonomicas',
    quality: '1080p HD',
    description: 'Primer canal autonómico vasco · Deporte, pelota y actualidad',
    channels: [
      {
        id: 'etb1-oficial',
        label: 'Señal Oficial EITB HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://multimedia.eitb.eus/live-content/etb1hd-hls/master.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'tdt-etb2',
    dial: 29,
    name: 'ETB 2',
    shortMark: 'ETB2',
    brandTone: '#2563EB',
    network: 'EITB Euskadi',
    category: 'infantil_autonomicas',
    quality: '1080p HD',
    description: 'ETB 2 en castellano · Teleberri, concursos, cine y actualidad',
    channels: [
      {
        id: 'etb2-oficial',
        label: 'Señal Oficial EITB HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://multimedia.eitb.eus/live-content/etb2hd-hls/master.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'tdt-tvcanaria',
    dial: 30,
    name: 'TV Canaria',
    shortMark: 'RTVC',
    brandTone: '#EAB308',
    network: 'RTVC Canarias',
    category: 'infantil_autonomicas',
    quality: '1080p HD',
    description: 'Televisión Pública de Canarias · Directos, cine e informativos',
    channels: [
      {
        id: 'tvcanaria-oficial',
        label: 'Señal Oficial RTVC HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl:
          'https://rtvclive.flumotion.cloud/rtvc1live/smil:channel1PRG.smil/playlist.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
];

app.get('/api/catalog/tdt', (_req, res) => {
  res.json({
    success: true,
    channels: channelHealthMonitor.prioritizeChannels(SPANISH_TDT_CHANNELS),
  });
});

// ============================================================================
// REAL-TIME SPANISH EPG ENGINE (TDT + MOVISTAR+ + DAZN + 3CAT)
// ============================================================================
interface RawEpgEvent {
  title: string;
  subtitle?: string;
  description?: string;
  category?: string;
  icon?: string;
  startMs: number;
  stopMs: number;
  isLiveSport?: boolean;
}

const EPG_CHANNEL_MAPPING: Record<string, { xmltv: string[]; tdtJson: string[] }> = {
  'tdt-la1': { xmltv: ['La 1 HD', 'La 1'], tdtJson: ['La1.TV'] },
  'tdt-la2': { xmltv: ['La 2', 'La 2 HD'], tdtJson: ['La2.TV'] },
  'tdt-antena3': { xmltv: ['Antena 3 HD', 'Antena 3'], tdtJson: ['Antena3.TV'] },
  'tdt-cuatro': { xmltv: ['Cuatro HD', 'Cuatro'], tdtJson: ['Cuatro.TV'] },
  'tdt-telecinco': { xmltv: ['Telecinco HD', 'Telecinco'], tdtJson: ['Telecinco.TV'] },
  'tdt-lasexta': { xmltv: ['La Sexta HD', 'La Sexta'], tdtJson: ['LaSexta.TV'] },
  'mplus-canal': { xmltv: ['Movistar Plus HD', 'M+ Cero'], tdtJson: [] },
  'mplus-vamos': { xmltv: ['M+ Vamos HD', 'M+ Vamos 2'], tdtJson: [] },
  'mplus-laliga': { xmltv: ['M+ LaLiga HD', 'M+ LaLiga HDR', 'M+ LaLiga 2 HD'], tdtJson: [] },
  'mplus-hypermotion': { xmltv: ['LaLiga TV Hypermotion HD', 'LaLiga TV Hypermotion 2'], tdtJson: [] },
  'mplus-champions': { xmltv: ['M+ Liga de Campeones HD', 'M+ Liga de Campeones 2 HD'], tdtJson: [] },
  'mplus-deportes': { xmltv: ['M+ Deportes HD', 'M+ Baloncesto'], tdtJson: [] },
  'mplus-deportes2': { xmltv: ['M+ Deportes 2 HD', 'M+ Deportes 3'], tdtJson: [] },
  'mplus-golf': { xmltv: ['M+ Golf HD', 'M+ Golf 2 HD'], tdtJson: [] },
  'mplus-eurosport1': { xmltv: ['Eurosport 1 HD'], tdtJson: [] },
  'mplus-eurosport2': { xmltv: ['Eurosport 2'], tdtJson: [] },
  'dazn-laliga': { xmltv: ['DAZN LaLiga HD', 'DAZN LaLiga 2 HD'], tdtJson: [] },
  'dazn-f1': { xmltv: ['DAZN F1 HD'], tdtJson: [] },
  'dazn-1': { xmltv: ['DAZN 1 HD', 'DAZN MotoGP'], tdtJson: [] },
  'dazn-2': { xmltv: ['DAZN 2 HD', 'DAZN Baloncesto'], tdtJson: [] },
  'dazn-3': { xmltv: ['DAZN 3 HD', 'DAZN Bundesliga'], tdtJson: [] },
  'dazn-4': { xmltv: ['DAZN 4 HD', 'Unbeaten (DAZN)', 'Red Bull TV (DAZN)'], tdtJson: [] },
  'tdt-neox': { xmltv: ['Neox'], tdtJson: ['Neox.TV'] },
  'tdt-fdf': { xmltv: ['Factoría de Ficción'], tdtJson: ['FDF.TV'] },
  'tdt-nova': { xmltv: ['Nova'], tdtJson: ['Nova.TV'] },
  'tdt-energy': { xmltv: ['Energy'], tdtJson: ['Energy.TV'] },
  'tdt-atreseries': { xmltv: ['Atreseries'], tdtJson: ['Atreseries.TV'] },
  'tdt-bemad': { xmltv: ['Be Mad'], tdtJson: ['Bemad.TV'] },
  'tdt-paramount': { xmltv: ['Paramount Network', 'Squirrel TV'], tdtJson: ['Paramount.TV'] },
  'tdt-bomcine': { xmltv: ['BOM Cine'], tdtJson: ['BOM.TV'] },
  'tdt-mega': { xmltv: ['Mega'], tdtJson: ['Mega.TV'] },
  'tdt-dmax': { xmltv: ['DMAX'], tdtJson: ['DMax.TV'] },
  'tdt-divinity': { xmltv: ['Divinity'], tdtJson: ['Divinity.TV'] },
  'tdt-dkiss': { xmltv: ['DKISS'], tdtJson: ['DKISS.TV'] },
  'tdt-ten': { xmltv: ['Ten'], tdtJson: ['TEN.TV'] },
  'tdt-trece': { xmltv: ['TRECE', 'TR3CE'], tdtJson: ['13.TV'] },
  'tdt-24h': { xmltv: ['24 Horas'], tdtJson: ['24Horas.TV'] },
  'tdt-teledeporte': { xmltv: ['Teledeporte'], tdtJson: ['TDP.TV'] },
  'tdt-rmtv': { xmltv: ['Real Madrid TV'], tdtJson: ['RMTV.TV'] },
  'tdt-clan': { xmltv: ['Clan'], tdtJson: ['Clan.TV'] },
  'tdt-boing': { xmltv: ['Boing'], tdtJson: ['Boing.TV'] },
  'tdt-canalsur': { xmltv: ['Canal Sur HD', 'Canal Sur Andalucía'], tdtJson: ['CanalSurA.TV'] },
  'tdt-3cat': { xmltv: ['TV3', 'TV3 Catalunya'], tdtJson: ['TV3.TV'] },
  'tdt-etb1': { xmltv: ['etb1'], tdtJson: ['ETB1.TV'] },
  'tdt-etb2': { xmltv: ['etb2'], tdtJson: ['ETB2.TV'] },
  'tdt-tvcanaria': { xmltv: ['TV Canaria', 'Atlántico TV'], tdtJson: ['TVCanaria.TV'] },
  'cat-sx3': { xmltv: ['SX3', 'SX3 Catalunya'], tdtJson: ['SX3.TV'] },
  'cat-tv3': { xmltv: ['TV3', 'TV3 Catalunya'], tdtJson: ['TV3.TV'] },
  'cat-324': { xmltv: ['3CatInfo', '3CatInfo Catalunya'], tdtJson: ['324.TV'] },
  'cat-c33': { xmltv: ['El 33 Catalunya'], tdtJson: ['C33.TV'] },
};

const madridTimeFormatter = new Intl.DateTimeFormat('es-ES', {
  timeZone: 'Europe/Madrid',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function formatMadridHHMM(ms: number): string {
  try {
    return madridTimeFormatter.format(new Date(ms));
  } catch {
    const d = new Date(ms);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
}

function decodeXmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

function parseXmltvTimeMs(raw: string): number {
  const m = raw.trim().match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\s*([+-])(\d{2})(\d{2}))?/);
  if (!m) return 0;
  const [, y, mo, d, h, mi, s, sign, offH, offM] = m;
  const utcBase = Date.UTC(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h),
    Number(mi),
    Number(s)
  );
  if (!sign) return utcBase;
  const offsetMs = (Number(offH) * 60 + Number(offM)) * 60_000 * (sign === '+' ? 1 : -1);
  return utcBase - offsetMs;
}

function isSportsProgramText(title: string, category: string): boolean {
  const txt = `${title} ${category}`.toLowerCase();
  return /fútbol|futbol|laliga|champions|premier|bundesliga|f1|fórmula 1|formula 1|motogp|baloncesto|nba|acb|euroliga|tenis|golf|ciclismo|boxeo|ufc|deporte|directo:\s| vs | - /i.test(
    txt
  );
}

let cachedEpgStore: { byChannel: Map<string, RawEpgEvent[]>; fetchedAt: number } | null = null;
let inflightEpgPromise: Promise<Map<string, RawEpgEvent[]>> | null = null;

async function loadSpanishEpgSchedule(): Promise<Map<string, RawEpgEvent[]>> {
  if (cachedEpgStore && Date.now() - cachedEpgStore.fetchedAt < 20 * 60 * 1000) {
    return cachedEpgStore.byChannel;
  }
  if (inflightEpgPromise) return inflightEpgPromise;

  inflightEpgPromise = (async () => {
    const result = new Map<string, RawEpgEvent[]>();
    const now = Date.now();
    const minWindow = now - 3 * 60 * 60 * 1000;
    const maxWindow = now + 18 * 60 * 60 * 1000;

    // Reverse lookup tables
    const xmltvToOurIds = new Map<string, { ourId: string; priority: number }[]>();
    const jsonToOurIds = new Map<string, string[]>();

    for (const [ourId, cfg] of Object.entries(EPG_CHANNEL_MAPPING)) {
      cfg.xmltv.forEach((xName, idx) => {
        const list = xmltvToOurIds.get(xName) || [];
        list.push({ ourId, priority: idx });
        xmltvToOurIds.set(xName, list);
      });
      cfg.tdtJson.forEach((jName) => {
        const list = jsonToOurIds.get(jName.toLowerCase()) || [];
        list.push(ourId);
        jsonToOurIds.set(jName.toLowerCase(), list);
      });
    }

    // 1. Stream-gunzip EPG_dobleM (Movistar+, DAZN, TDT & 3Cat complete XMLTV) with <5MB RAM
    try {
      const xmlByPriority = new Map<string, { priority: number; events: RawEpgEvent[] }>();
      const resp = await fetch(
        'https://raw.githubusercontent.com/davidmuma/EPG_dobleM/master/guiatv_sincolor.xml.gz',
        {
          headers: { 'User-Agent': CHROME_UA },
          signal: AbortSignal.timeout(14_000),
        }
      );

      if (resp.ok && resp.body) {
        const gunzip = zlib.createGunzip();
        gunzip.setEncoding('utf8');
        let leftover = '';

        await new Promise<void>((resolve) => {
          gunzip.on('data', (chunk: string) => {
            leftover += chunk;
            let endIdx = leftover.indexOf('</programme>');
            while (endIdx !== -1) {
              const block = leftover.slice(0, endIdx + 12);
              leftover = leftover.slice(endIdx + 12);
              endIdx = leftover.indexOf('</programme>');

              const pStart = block.indexOf('<programme ');
              if (pStart === -1) continue;
              const tagEnd = block.indexOf('>', pStart);
              if (tagEnd === -1) continue;
              const header = block.slice(pStart, tagEnd);

              const chMatch = header.match(/channel="([^"]+)"/);
              if (!chMatch) continue;
              const chName = decodeXmlEntities(chMatch[1]);
              const targets = xmltvToOurIds.get(chName);
              if (!targets) continue;

              const startMatch = header.match(/start="([^"]+)"/);
              const stopMatch = header.match(/stop="([^"]+)"/);
              if (!startMatch || !stopMatch) continue;

              const startMs = parseXmltvTimeMs(startMatch[1]);
              const stopMs = parseXmltvTimeMs(stopMatch[1]);
              if (!startMs || !stopMs || stopMs < minWindow || startMs > maxWindow) continue;

              const body = block.slice(tagEnd + 1);
              const titleM = body.match(/<title[^>]*>([\s\S]*?)<\/title>/);
              if (!titleM) continue;
              const title = decodeXmlEntities(titleM[1]);
              if (!title) continue;

              const subM = body.match(/<sub-title[^>]*>([\s\S]*?)<\/sub-title>/);
              const descM = body.match(/<desc[^>]*>([\s\S]*?)<\/desc>/);
              const catM = body.match(/<category[^>]*>([\s\S]*?)<\/category>/);
              const iconM = body.match(/<icon[^>]+src="([^"]+)"/);

              const category = catM ? decodeXmlEntities(catM[1]) : undefined;
              const ev: RawEpgEvent = {
                title,
                subtitle: subM ? decodeXmlEntities(subM[1]) : undefined,
                description: descM ? decodeXmlEntities(descM[1]) : undefined,
                category,
                icon: iconM ? iconM[1] : undefined,
                startMs,
                stopMs,
                isLiveSport: isSportsProgramText(title, category || ''),
              };

              for (const t of targets) {
                const cur = xmlByPriority.get(t.ourId);
                if (!cur || t.priority < cur.priority) {
                  xmlByPriority.set(t.ourId, { priority: t.priority, events: [ev] });
                } else if (t.priority === cur.priority) {
                  cur.events.push(ev);
                }
              }
            }
            if (leftover.length > 250_000) {
              leftover = leftover.slice(-60_000);
            }
          });
          gunzip.on('end', () => resolve());
          gunzip.on('error', () => resolve());
          Readable.fromWeb(resp.body as any)
            .on('error', () => resolve())
            .pipe(gunzip);
        });

        for (const [ourId, data] of xmlByPriority.entries()) {
          if (data.events.length > 0) {
            data.events.sort((a, b) => a.startMs - b.startMs);
            result.set(ourId, data.events);
          }
        }
      }
    } catch (err) {
      console.warn('EPG XMLTV stream warning:', err);
    }

    // 2. Fallback / complement from TDTChannels JSON EPG for any missing TDT channel
    try {
      const missingJsonTargets = Array.from(jsonToOurIds.values()).some((ids) =>
        ids.some((id) => !result.has(id))
      );
      if (missingJsonTargets) {
        const jResp = await fetch('https://www.tdtchannels.com/epg/TV.json', {
          headers: { 'User-Agent': CHROME_UA },
          signal: AbortSignal.timeout(8000),
        });
        if (jResp.ok) {
          const jList: any[] = await jResp.json();
          if (Array.isArray(jList)) {
            for (const entry of jList) {
              const nameKey = String(entry?.name || '').toLowerCase();
              const ourIds = jsonToOurIds.get(nameKey);
              if (!ourIds || !Array.isArray(entry?.events)) continue;
              const parsed: RawEpgEvent[] = [];
              for (const ev of entry.events) {
                const startMs = Number(ev.hi || 0) * 1000;
                const stopMs = Number(ev.hf || 0) * 1000;
                if (!startMs || !stopMs || stopMs < minWindow || startMs > maxWindow) continue;
                const title = String(ev.t || '').trim();
                if (!title) continue;
                const category = String(ev.g || '').trim() || undefined;
                parsed.push({
                  title,
                  description: String(ev.d || '').trim() || undefined,
                  category,
                  startMs,
                  stopMs,
                  isLiveSport: isSportsProgramText(title, category || ''),
                });
              }
              if (parsed.length > 0) {
                parsed.sort((a, b) => a.startMs - b.startMs);
                for (const oid of ourIds) {
                  if (!result.has(oid)) {
                    result.set(oid, parsed);
                  }
                }
              }
            }
          }
        }
      }
    } catch {
      // keep XMLTV results
    }

    if (result.size > 0) {
      cachedEpgStore = { byChannel: result, fetchedAt: Date.now() };
    }
    return result;
  })().finally(() => {
    inflightEpgPromise = null;
  });

  return inflightEpgPromise;
}

// Pre-warm Spanish EPG quietly in background (pure HTTP gunzip, <5MB RAM)
setTimeout(() => {
  loadSpanishEpgSchedule().catch(() => {});
}, 800);

app.get('/api/epg/live', async (_req, res) => {
  try {
    const store = await loadSpanishEpgSchedule();
    const now = Date.now();
    const epgMap: Record<string, any> = {};

    const allKnownChannelIds = Object.keys(EPG_CHANNEL_MAPPING);
    for (const chId of allKnownChannelIds) {
      const events = store.get(chId) || [];
      if (events.length === 0) continue;

      let nowIdx = events.findIndex((e) => e.startMs <= now && e.stopMs > now);
      if (nowIdx === -1) {
        nowIdx = events.findIndex((e) => e.startMs > now);
        if (nowIdx > 0) nowIdx = nowIdx - 1;
      }

      const activeEv =
        nowIdx >= 0 && events[nowIdx] && events[nowIdx].stopMs > now ? events[nowIdx] : null;
      const nextIdx = activeEv
        ? nowIdx + 1
        : events.findIndex((e) => e.startMs > now);
      const nextEv = nextIdx >= 0 && nextIdx < events.length ? events[nextIdx] : null;

      const upcomingSlice = events
        .filter((e) => e.stopMs > now)
        .slice(0, 8)
        .map((e) => ({
          title: e.title,
          subtitle: e.subtitle,
          description: e.description,
          category: e.category,
          icon: e.icon,
          startMs: e.startMs,
          stopMs: e.stopMs,
          startLabel: formatMadridHHMM(e.startMs),
          stopLabel: formatMadridHHMM(e.stopMs),
          isLiveSport: e.isLiveSport,
        }));

      let progressPct = 0;
      let remainingMin = 0;
      if (activeEv) {
        const dur = Math.max(1, activeEv.stopMs - activeEv.startMs);
        progressPct = Math.max(2, Math.min(99, Math.round(((now - activeEv.startMs) / dur) * 100)));
        remainingMin = Math.max(1, Math.ceil((activeEv.stopMs - now) / 60_000));
      }

      epgMap[chId] = {
        channelId: chId,
        now: activeEv
          ? {
              title: activeEv.title,
              subtitle: activeEv.subtitle,
              description: activeEv.description,
              category: activeEv.category,
              icon: activeEv.icon,
              startMs: activeEv.startMs,
              stopMs: activeEv.stopMs,
              startLabel: formatMadridHHMM(activeEv.startMs),
              stopLabel: formatMadridHHMM(activeEv.stopMs),
              isLiveSport: activeEv.isLiveSport,
            }
          : null,
        next: nextEv
          ? {
              title: nextEv.title,
              subtitle: nextEv.subtitle,
              description: nextEv.description,
              category: nextEv.category,
              icon: nextEv.icon,
              startMs: nextEv.startMs,
              stopMs: nextEv.stopMs,
              startLabel: formatMadridHHMM(nextEv.startMs),
              stopLabel: formatMadridHHMM(nextEv.stopMs),
              isLiveSport: nextEv.isLiveSport,
            }
          : null,
        upcoming: upcomingSlice,
        progressPct,
        remainingMin,
      };
    }

    res.setHeader('Cache-Control', 'public, max-age=45');
    res.json({
      success: true,
      serverTimeMs: now,
      madridTimeLabel: formatMadridHHMM(now),
      channelsCount: Object.keys(epgMap).length,
      epg: epgMap,
    });
  } catch (err) {
    console.warn('/api/epg/live error:', err);
    res.json({ success: true, serverTimeMs: Date.now(), epg: {} });
  }
});

// ============================================================================
// REST API: UNIVERSAL STREAM DECOMPILER (/api/extract/stream)
// ============================================================================
function parseYouTubeVideoId(url: string): string | null {
  const m = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|live\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/i
  );
  return m ? m[1] : null;
}

async function resolveTmdbIdByTitle(
  title: string,
  mediaType: 'movie' | 'tv',
  expectedYear?: string
): Promise<number | null> {
  try {
    const rawStr = String(title || '').trim();
    const clean = rawStr.replace(/\s*\([^)]*\)/g, '').trim();
    const parenPart = (rawStr.match(/\(([^)]+)\)/)?.[1] || '').trim();
    const normClean = normalizeTitleForMatch(clean || rawStr);
    const normParen = normalizeTitleForMatch(parenPart);
    if (!clean || normClean.length < 2) return null;

    const yearNum =
      expectedYear && /^\d{4}$/.test(expectedYear.trim()) ? Number(expectedYear.trim()) : 0;

    const res = await fetch(
      `https://api.themoviedb.org/3/search/${mediaType}?api_key=${TMDB_API_KEY}&language=es-ES&query=${encodeURIComponent(clean)}&page=1`,
      { signal: AbortSignal.timeout(3500) }
    );
    if (!res.ok) return null;
    const json: any = await res.json();
    const results: any[] = Array.isArray(json?.results) ? json.results : [];
    if (results.length === 0) return null;

    const matchesTitle = (r: any): boolean => {
      const rTitle = normalizeTitleForMatch(String(r?.title || r?.name || ''));
      const rOrig = normalizeTitleForMatch(String(r?.original_title || r?.original_name || ''));
      return (
        (rTitle.length >= 2 && (rTitle === normClean || (normParen.length >= 2 && rTitle === normParen))) ||
        (rOrig.length >= 2 && (rOrig === normClean || (normParen.length >= 2 && rOrig === normParen)))
      );
    };

    const matchesYear = (r: any): boolean => {
      if (!yearNum) return true;
      const rawDate = String(r?.release_date || r?.first_air_date || '').trim();
      const ry = rawDate.split('-')[0];
      if (!/^\d{4}$/.test(ry)) return false;
      return Math.abs(Number(ry) - yearNum) <= 1;
    };

    const exactYearAndTitle = results.find(
      (r) =>
        matchesTitle(r) &&
        yearNum > 0 &&
        Number(String(r?.release_date || r?.first_air_date || '').split('-')[0]) === yearNum
    );
    if (exactYearAndTitle?.id) return Number(exactYearAndTitle.id);

    const exactCompatible = results.find((r) => matchesTitle(r) && matchesYear(r));
    return exactCompatible?.id ? Number(exactCompatible.id) : null;
  } catch {
    return null;
  }
}

const subtitleSearchCache = new LruTtlCache<string, { tracks: any[]; ts: number }>(
  250,
  15 * 60 * 1000
);

async function fetchAndCacheSubtitles(
  tmdbId: string,
  season = 0,
  episode = 0,
  timeoutMs = 5000
): Promise<any[]> {
  const cleanId = String(tmdbId || '').replace(/\D/g, '');
  if (!cleanId) return [];
  const cacheKey = `${cleanId}|${season}|${episode}`;
  const cached = subtitleSearchCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < 15 * 60 * 1000) {
    return cached.tracks;
  }
  try {
    const qs = new URLSearchParams({ id: cleanId });
    if (season > 0 && episode > 0) {
      qs.set('season', String(season));
      qs.set('episode', String(episode));
    }
    const subRes = await fetch(`https://sub.wyzie.ru/search?${qs.toString()}`, {
      headers: { 'User-Agent': CHROME_UA },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!subRes.ok) return [];
    const rawList: any[] = await subRes.json();
    if (!Array.isArray(rawList)) return [];
    const prioritized = rawList
      .filter((s) => s?.url && /^(es|spa|en|eng)/i.test(String(s.language || '')))
      .slice(0, 10)
      .map((s, idx) => {
        const code = String(s.language || '').toLowerCase();
        const isEs = code.startsWith('es') || code.startsWith('spa');
        return {
          id: `sub-${cleanId}-${idx}-${code}`,
          label: `${isEs ? 'Español' : 'English'}${s.display ? ` · ${s.display}` : ''} #${idx + 1}`,
          lang: isEs ? 'ES' : 'EN',
          url: `/api/subtitles/proxy?url=${encodeURIComponent(s.url)}`,
        };
      });
    subtitleSearchCache.set(cacheKey, { tracks: prioritized, ts: Date.now() });
    return prioritized;
  } catch {
    return [];
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
    if (u.startsWith('/api/hls-proxy/')) {
      const full = `${publicOrigin}${u}`;
      return full.includes('abs=1') ? full : `${full}&abs=1`;
    }
    if (u.startsWith('/api/ts-proxy/')) {
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
  const vestUrlParam = String(req.query.vestUrl || '').trim();
  const resolverType = String(req.query.resolverType || '').trim();
  const preferLang = String(req.query.preferLang || req.query.lang || 'ES').toUpperCase();
  const titleHint = String(req.query.title || '').trim();
  const mediaTypeParam = String(req.query.mediaType || req.query.type || '').toLowerCase();
  const tmdbIdParam = String(req.query.tmdbId || '').replace(/\D/g, '');
  const seasonParam = parseInt(String(req.query.season || '0'), 10) || undefined;
  const episodeParam = parseInt(String(req.query.episode || '0'), 10) || undefined;
  const episodeTitleHint = String(req.query.episodeTitle || '').trim();
  const isSandboxedFrame = String(req.query.sandboxed || '').trim() === '1';

  if (!rawInput && !movidyUrlParam && !vestUrlParam && !titleHint && !tmdbIdParam) {
    return res.status(400).json({ success: false, error: 'Falta el enlace o título del contenido.' });
  }

  const cacheKey = `${mediaTypeParam}|${tmdbIdParam}|${seasonParam || ''}|${episodeParam || ''}|${resolverType}|${preferLang}|${isSandboxedFrame ? 'sb1' : 'sb0'}|${rawInput}|${movidyUrlParam}|${vestUrlParam}|${titleHint}`;
  const cached = extractionCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return res.json(formatExtractResponseForClient(req, cached));
  }

  try {
    // CASE 0: Live Spanish TDT Channel (`tdt_hls`) -> Stateless per-segment Progressive H.264 IDR + AAC via /api/hls-proxy
    // (100% stateless across multi-instance Cloud Run deployments — never expires or drops across load-balanced containers!)
    if (resolverType === 'tdt_hls' && rawInput) {

      const cleanCheckUrl = rawInput.replace(/[?&]profile=(hd|fast)\b/gi, '');
      const knownReferer = resolveKnownUpstreamReferer(cleanCheckUrl);
      const checkHeaders: Record<string, string> = {
        'User-Agent': isDvbHeadendStream(cleanCheckUrl) ? TDT_DVB_UA : CHROME_UA,
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
          isAlive = txt.includes('#EXTM3U');
        }
      } catch {
        const fb = await curlGetText(cleanCheckUrl, checkHeaders, 5);
        isAlive = Boolean(fb.text && fb.text.includes('#EXTM3U'));
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

      const result: ExtractedStreamResult = {
        success: true,
        mode: 'hls',
        streamUrl: finalStreamUrl,
        rawStreamUrl: cleanCheckUrl,
        referer: originRef,
        title: titleHint || 'TV España en Directo',
        requestedLang: 'ES',
        resolvedLang: 'ES',
        expiresAt: Date.now() + 4 * 60 * 1000,
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

    // CASE 1B: Direct Movidy base64 track (`nupload.my`)
    if (
      (resolverType === 'movidy_embed' || rawInput.includes('nupload.')) &&
      !rawInput.includes('movidy.pw/ver/')
    ) {
      const decoded = await decodeNuploadToHls(rawInput);
      if (decoded) {
        const result: ExtractedStreamResult = {
          success: true,
          mode: 'hls',
          streamUrl: decoded.proxyUrl,
          rawStreamUrl: decoded.rawM3u8,
          requestedLang: preferLang,
          resolvedLang: preferLang,
          expiresAt: Date.now() + 15 * 60 * 1000,
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

    // CASE 1C: Verified Web Embed Player track switch (`web_embed`)
    if (resolverType === 'web_embed' && rawInput) {
      const fullEmbedUrl = /^https?:\/\//i.test(rawInput) ? rawInput : `https://${rawInput}`;
      const result: ExtractedStreamResult = {
        success: true,
        mode: 'embed',
        streamUrl: fullEmbedUrl,
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

    // CASE 4: UNIFIED MOVIE & TV SERIES MULTI-ENGINE (MOVIDY ES/LAT/VOSE + EMBED69/SERIESKAO ES/LAT/VOSE + BINGETRIX/2EMBED EN 1080P)
    const bingetrixTvMatch = rawInput.match(/bingetrix\.[a-z]+\/watch\/tv\/(\d+)\/(\d+)\/(\d+)/i);
    const bingetrixMovieMatch = rawInput.match(/bingetrix\.[a-z]+\/(?:watch|movie)\/(\d+)/i);
    const externalEmbedTvMatch =
      rawInput.match(/(?:vidfast|vidlink|vidsrc)\.[a-z.]+\/(?:v2\/)?(?:embed\/)?tv\/(tt\d+|\d+)\/(\d+)\/(\d+)/i) ||
      rawInput.match(/2embed\.[a-z]+\/(?:embedtv|tv)\/(tt\d+|\d+)(?:&s=|\/)(\d+)(?:&e=|\/)(\d+)/i);
    const externalEmbedMovieMatch =
      !externalEmbedTvMatch
        ? rawInput.match(/(?:vidfast|vidlink|vidsrc|2embed)\.[a-z.]+\/(?:v2\/)?(?:embed\/)?(?:movie\/)?(tt\d+|\d+)/i)
        : null;
    const isMovidyLink =
      rawInput.includes('movidy.pw/ver/') || movidyUrlParam.includes('movidy.pw/ver/');
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

      const hasExplicitMovidyUrl =
        movidyUrlParam.includes('movidy.pw/ver/') || rawInput.includes('movidy.pw/ver/');
      let effectiveMovidyUrl = movidyUrlParam.includes('movidy.pw/ver/')
        ? movidyUrlParam
        : rawInput.includes('movidy.pw/ver/')
        ? rawInput
        : '';

      const effectiveVestUrl = isVestMirrorUrl(vestUrlParam)
        ? vestUrlParam
        : isVestMirrorUrl(rawInput)
        ? rawInput
        : '';

      let extractedMovidyCleanTitle = '';
      let extractedMovidyYear = '';
      let extractedVestDetail: VestParsedDetail | null = null;
      let tmdbVerifiedYear = '';

      // Inspect direct Movidy `/ver/...` link to detect TV Series (`id="eps"`), exact title, and exact release year
      if (effectiveMovidyUrl && (!mediaTypeParam || !resolvedTmdbId)) {
        const mvMeta = await fetchMovidyPageMetadata(effectiveMovidyUrl);
        if (mvMeta) {
          if (!mediaTypeParam && mvMeta.isTvShow) {
            effectiveMediaType = 'tv';
          }
          extractedMovidyCleanTitle = mvMeta.cleanTitle;
          extractedMovidyYear = mvMeta.year;
        }
      }

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

      if (!resolvedTmdbId && titleHint) {
        resolvedTmdbId = await resolveTmdbIdByTitle(
          titleHint,
          effectiveMediaType,
          extractedMovidyYear || undefined
        );
      }

      if (!resolvedTmdbId && extractedMovidyCleanTitle) {
        resolvedTmdbId = await resolveTmdbIdByTitle(
          extractedMovidyCleanTitle,
          effectiveMediaType,
          extractedMovidyYear || undefined
        );
      }

      if (!resolvedTmdbId && effectiveMovidyUrl) {
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
            extractedMovidyYear || undefined
          );
        }
      }

      let tmdbResolvedTitle = '';
      if (resolvedTmdbId && (!hasExplicitMovidyUrl || !titleHint)) {
        try {
          const tmEndpoint =
            effectiveMediaType === 'tv'
              ? `https://api.themoviedb.org/3/tv/${resolvedTmdbId}?api_key=${TMDB_API_KEY}&language=es-ES`
              : `https://api.themoviedb.org/3/movie/${resolvedTmdbId}?api_key=${TMDB_API_KEY}&language=es-ES`;
          const tmRes = await fetch(tmEndpoint, { signal: AbortSignal.timeout(3000) });
          if (tmRes.ok) {
            const tmJson: any = await tmRes.json();
            const esTitle = String(tmJson?.title || tmJson?.name || '').trim();
            const origTitle = String(tmJson?.original_title || tmJson?.original_name || '').trim();
            tmdbResolvedTitle = esTitle || origTitle;
            tmdbVerifiedYear = String(tmJson?.release_date || tmJson?.first_air_date || '').split('-')[0] || '';

            if (effectiveMediaType === 'movie' && !hasExplicitMovidyUrl) {
              if (!effectiveMovidyUrl && titleHint) {
                effectiveMovidyUrl =
                  (await findMovidyUrlByTitle(titleHint, tmdbVerifiedYear)) || '';
              }
              if (
                !effectiveMovidyUrl &&
                esTitle &&
                esTitle.toLowerCase() !== titleHint.toLowerCase()
              ) {
                effectiveMovidyUrl =
                  (await findMovidyUrlByTitle(esTitle, tmdbVerifiedYear)) || '';
              }
              if (
                !effectiveMovidyUrl &&
                origTitle &&
                origTitle.toLowerCase() !== esTitle.toLowerCase()
              ) {
                effectiveMovidyUrl =
                  (await findMovidyUrlByTitle(origTitle, tmdbVerifiedYear)) || '';
              }
            }
          }
        } catch {
          // ignore
        }
      } else if (effectiveMediaType === 'movie' && !effectiveMovidyUrl && titleHint) {
        effectiveMovidyUrl = (await findMovidyUrlByTitle(titleHint)) || '';
      }

      const combinedTitleHints = [titleHint, extractedMovidyCleanTitle, tmdbResolvedTitle].filter(Boolean);

      const shouldQueryVest =
        Boolean(effectiveVestUrl) ||
        Boolean(
          findVestSeedForMedia({
            tmdbId: resolvedTmdbId,
            titleHints: combinedTitleHints,
            preferLang,
            season: effectiveSeason,
            episode: effectiveEpisode,
          })
        );

      const [movidyTracks, esTracks, bingetrixEnTracks, twoEmbedEnTracks, vestExtracted] = await Promise.all([
        effectiveMediaType === 'movie' && effectiveMovidyUrl
          ? extractMovidyPageTracks(
              effectiveMovidyUrl,
              hasExplicitMovidyUrl
                ? undefined
                : { expectedYear: tmdbVerifiedYear || undefined, requireMovieOnly: true }
            )
          : Promise.resolve([]),
        resolvedTmdbId || combinedTitleHints.length > 0
          ? extractEmbed69SpanishTracks({
              tmdbId: resolvedTmdbId || undefined,
              mediaType: effectiveMediaType,
              season: effectiveSeason,
              episode: effectiveEpisode,
              titleHints: combinedTitleHints,
            })
          : Promise.resolve([]),
        resolvedTmdbId
          ? extractBingetrixEnglishTracks({
              tmdbId: resolvedTmdbId,
              mediaType: effectiveMediaType,
              season: effectiveSeason,
              episode: effectiveEpisode,
            })
          : Promise.resolve([]),
        resolvedTmdbId
          ? extract2EmbedEnglishTracks({
              tmdbId: resolvedTmdbId,
              mediaType: effectiveMediaType,
              season: effectiveSeason,
              episode: effectiveEpisode,
            })
          : Promise.resolve([]),
        shouldQueryVest
          ? extractVestStreamsAndSubtitles({
              vestUrl: effectiveVestUrl || undefined,
              tmdbId: resolvedTmdbId,
              mediaType: effectiveMediaType,
              season: effectiveSeason,
              episode: effectiveEpisode,
              preferLang,
              titleHints: combinedTitleHints,
              tmdbApiKey: TMDB_API_KEY,
              buildHlsProxyUrl: (m3u8Url, referer) => buildHlsProxyUrl(m3u8Url, referer),
            }).catch(() => null)
          : Promise.resolve(null),
      ]);

      const enTracks: TrackRecord[] = [...twoEmbedEnTracks, ...bingetrixEnTracks];
      const vestTracks: TrackRecord[] = vestExtracted?.tracks || [];
      const vestSubtitles = vestExtracted?.subtitles || [];
      const vestDetailMeta = vestExtracted?.detail || extractedVestDetail;

      // Combine all discovered tracks and sort by requested language priority
      const allDiscovered: TrackRecord[] = isVestLink
        ? [...vestTracks, ...movidyTracks, ...esTracks, ...enTracks]
        : hasExplicitMovidyUrl
        ? [...movidyTracks, ...vestTracks, ...esTracks, ...enTracks]
        : [...esTracks, ...vestTracks, ...movidyTracks, ...enTracks];

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
        if (rt === 'vest_hls' || rt === 'vidhide_hls' || rt === 'movidy_embed' || rt === 'bingetrix_en') {
          return 1;
        }
        if (rt === 'embed_sniff') return 2;
        if (rt === 'web_embed') return 3;
        return 4;
      };

      const healthMap = channelHealthMonitor.getAllTrackStatuses();
      const healthStatusRank = (status?: string): number => {
        if (status === 'up') return 0;
        if (status === 'unknown' || !status) return 1;
        if (status === 'degraded') return 2;
        return 3; // 'down'
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
        const hA = getTrackHealthScore(a);
        const hB = getTrackHealthScore(b);
        if (Math.abs(hA - hB) >= 250) return hA - hB;
        const rDiff = resolverPriority(a.resolverType) - resolverPriority(b.resolverType);
        if (rDiff !== 0) return rDiff;
        return hA - hB;
      });

      // Resolve the first available track that produces a valid proxied HLS stream,
      // and immediately prune any candidate that fails unpacking so dead tracks never reach the UI
      let primaryStreamUrl = '';
      let primaryMode: 'hls' | 'direct' | 'embed' = 'hls';
      let resolvedTrack: TrackRecord | null = null;
      const deadTrackIndices = new Set<number>();

      // Pass 1: Prefer native `<video>` HLS / MP4 tracks (`vidhide_hls`, `movidy_embed`, `bingetrix_en`, `embed_sniff`)
      for (let i = 0; i < orderedTracks.length; i++) {
        const candidate = orderedTracks[i];
        if (candidate.resolverType === 'web_embed') {
          continue;
        }
        if (candidate.resolvedStreamUrl) {
          primaryStreamUrl = candidate.resolvedStreamUrl;
          resolvedTrack = candidate;
          break;
        }
        if (candidate.resolverType === 'movidy_embed') {
          const decoded = await decodeNuploadToHls(candidate.sourceUrl);
          if (decoded) {
            orderedTracks[i] = { ...candidate, resolvedStreamUrl: decoded.proxyUrl };
            primaryStreamUrl = decoded.proxyUrl;
            resolvedTrack = orderedTracks[i];
            break;
          } else {
            deadTrackIndices.add(i);
          }
        } else if (candidate.resolverType === 'vidhide_hls') {
          const unpacked = await unpackVidhideToHls(candidate.sourceUrl);
          if (unpacked) {
            orderedTracks[i] = { ...candidate, resolvedStreamUrl: unpacked.proxyUrl };
            primaryStreamUrl = unpacked.proxyUrl;
            resolvedTrack = orderedTracks[i];
            break;
          } else {
            deadTrackIndices.add(i);
          }
        } else if (candidate.resolverType === 'embed_sniff') {
          const sniffed = await sniffStreamWithHeadless(candidate.sourceUrl);
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

      // Pass 2: If no native stream resolved yet, check any verified web_embed track (preferring requested language)
      if (!primaryStreamUrl) {
        const webIdx =
          orderedTracks.findIndex(
            (t, idx) =>
              !deadTrackIndices.has(idx) &&
              t.resolverType === 'web_embed' &&
              String(t.lang || '').toUpperCase() === preferLang
          ) !== -1
            ? orderedTracks.findIndex(
                (t, idx) =>
                  !deadTrackIndices.has(idx) &&
                  t.resolverType === 'web_embed' &&
                  String(t.lang || '').toUpperCase() === preferLang
              )
            : orderedTracks.findIndex(
                (t, idx) => !deadTrackIndices.has(idx) && t.resolverType === 'web_embed'
              );
        if (webIdx !== -1) {
          const webCand = orderedTracks[webIdx];
          orderedTracks[webIdx] = { ...webCand, resolvedStreamUrl: webCand.sourceUrl };
          primaryStreamUrl = webCand.sourceUrl;
          primaryMode = 'embed';
          resolvedTrack = orderedTracks[webIdx];
        }
      }

      if (primaryStreamUrl) {
        const validTracks = orderedTracks.filter(
          (tr, idx) =>
            !deadTrackIndices.has(idx) &&
            (primaryMode === 'embed' || tr.resolverType !== 'web_embed')
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

        const baseCleanTitle = extractedMovidyCleanTitle || tmdbResolvedTitle;
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
            : 'NAIMCINE HD');

        let combinedSubtitles = vestSubtitles;
        if (combinedSubtitles.length === 0 && resolvedTmdbId) {
          combinedSubtitles = await fetchAndCacheSubtitles(
            String(resolvedTmdbId),
            effectiveMediaType === 'tv' ? effectiveSeason : 0,
            effectiveMediaType === 'tv' ? effectiveEpisode : 0,
            1800
          );
        }

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
          expiresAt: Date.now() + 8 * 60 * 1000,
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
        titleHint || extractedMovidyCleanTitle || tmdbResolvedTitle || '';
      const displayFallbackTitle =
        titleHint ||
        (fallbackBaseTitle
          ? effectiveMediaType === 'tv'
            ? `${fallbackBaseTitle} · ${effectiveSeason}x${String(
                effectiveEpisode
              ).padStart(2, '0')}`
            : fallbackBaseTitle
          : 'NAIMCINE HD');

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

        const normMainTokens = normalizeTitleForMatch(shortMain)
          .split(/\s+/)
          .filter((w) => w.length >= 3);
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
                  /\b(trailer|tráiler|teaser|reaction|reaccion|reacción|review|resumen|opening|ending|amv|ost|soundtrack|gameplay|parodia|parody|shorts|#shorts)\b/i.test(
                    vTitle
                  )
                ) {
                  continue;
                }

                const normVTitle = normalizeTitleForMatch(vTitle);
                if (
                  normMainTokens.length > 0 &&
                  !normMainTokens.some((tok) => normVTitle.includes(tok))
                ) {
                  continue;
                }

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

      const buildWebEmbedTracks = (): TrackRecord[] => {
        if (!resolvedTmdbId) return [];
        const idStr = String(resolvedTmdbId);
        const s = Math.max(1, effectiveSeason || 1);
        const e = Math.max(1, effectiveEpisode || 1);
        const baseEntries =
          effectiveMediaType === 'tv'
            ? [
                {
                  id: `embed-vidsrcsh-${idStr}-${s}-${e}`,
                  label: 'Servidor Web 1 · VidSrc HD',
                  url: `https://vidsrc.sh/embed/tv/${idStr}/${s}/${e}`,
                  sandboxSafe: true,
                },
                {
                  id: `embed-vidlink-${idStr}-${s}-${e}`,
                  label: 'Servidor Web 2 · Multi-Audio',
                  url: `https://vidlink.pro/tv/${idStr}/${s}/${e}?autoplay=true&primaryColor=9146FF`,
                  sandboxSafe: true,
                },
                {
                  id: `embed-autoembed-${idStr}-${s}-${e}`,
                  label: 'Servidor Web 3 · AutoEmbed HD',
                  url: `https://autoembed.me/tv/tmdb/${idStr}-${s}-${e}`,
                  sandboxSafe: true,
                },
                {
                  id: `embed-2embed-${idStr}-${s}-${e}`,
                  label: 'Servidor Web 4 · 2Embed',
                  url: `https://www.2embed.cc/embedtv/${idStr}&s=${s}&e=${e}`,
                  sandboxSafe: true,
                },
                {
                  id: `embed-vidfast-${idStr}-${s}-${e}`,
                  label: 'Servidor Web 5 · VidFast HD',
                  url: `https://vidfast.vc/tv/${idStr}/${s}/${e}?autoPlay=true&theme=9146FF`,
                  sandboxSafe: false,
                },
              ]
            : [
                {
                  id: `embed-vidsrcsh-${idStr}`,
                  label: 'Servidor Web 1 · VidSrc HD',
                  url: `https://vidsrc.sh/embed/movie/${idStr}`,
                  sandboxSafe: true,
                },
                {
                  id: `embed-vidlink-${idStr}`,
                  label: 'Servidor Web 2 · Multi-Audio',
                  url: `https://vidlink.pro/movie/${idStr}?autoplay=true&primaryColor=9146FF`,
                  sandboxSafe: true,
                },
                {
                  id: `embed-autoembed-${idStr}`,
                  label: 'Servidor Web 3 · AutoEmbed HD',
                  url: `https://autoembed.me/movie/tmdb/${idStr}`,
                  sandboxSafe: true,
                },
                {
                  id: `embed-2embed-${idStr}`,
                  label: 'Servidor Web 4 · 2Embed',
                  url: `https://www.2embed.cc/embed/${idStr}`,
                  sandboxSafe: true,
                },
                {
                  id: `embed-vidfast-${idStr}`,
                  label: 'Servidor Web 5 · VidFast HD',
                  url: `https://vidfast.vc/movie/${idStr}?autoPlay=true&theme=9146FF`,
                  sandboxSafe: false,
                },
              ];

        // Put sandbox-friendly embeds first inside sandboxed iframes, limited to 2 cleanest backups
        const orderedEntries = (isSandboxedFrame
          ? [
              ...baseEntries.filter((entry) => entry.sandboxSafe),
              ...baseEntries.filter((entry) => !entry.sandboxSafe),
            ]
          : baseEntries
        ).slice(0, 2);

        return orderedEntries.map((entry) => ({
          id: entry.id,
          label: entry.label,
          lang: preferLang || 'EN',
          quality: '1080p',
          sourceUrl: entry.url,
          resolverType: 'web_embed' as const,
          resolvedStreamUrl: entry.url,
        }));
      };

      const [ytFallback, embedFallbackTracks] = await Promise.all([
        searchYouTubeFullFallback(),
        Promise.resolve(buildWebEmbedTracks()),
      ]);

      // When a full clean YouTube stream is found, avoid flooding the bar with ad-heavy web embeds
      const combinedFallbackTracks: TrackRecord[] = ytFallback
        ? [ytFallback.track]
        : embedFallbackTracks;

      if (combinedFallbackTracks.length > 0) {
        const firstTrack = combinedFallbackTracks[0];
        const fallbackMode: ExtractedStreamResult['mode'] =
          firstTrack.resolverType === 'youtube' ? 'youtube' : 'embed';
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
          resolvedLang: firstTrack.lang || preferLang,
          resolvedLabel: firstTrack.label,
          languageFallbackUsed: false,
          availableLanguages: Array.from(
            new Set(combinedFallbackTracks.map((t) => String(t.lang || '').toUpperCase()))
          ),
          expiresAt: Date.now() + 10 * 60 * 1000,
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

      // If no raw HLS/MP4 stream was sniffed, check if the external source allows clean iframe embedding;
      // otherwise automatically launch it in the ad-free Cloud Browser so playback never hits a 404 wall!
      let canFrame = false;
      const isSandboxHostileHost = (() => {
        try {
          return /(^|\.)vidfast\./i.test(new URL(fullTargetUrl).hostname);
        } catch {
          return false;
        }
      })();
      if (!(isSandboxedFrame && isSandboxHostileHost)) {
        try {
          const probeController = new AbortController();
          const probeTimer = setTimeout(() => probeController.abort(), 3000);
          const probeRes = await fetch(fullTargetUrl, {
            headers: { 'User-Agent': CHROME_UA },
            signal: probeController.signal,
          });
          clearTimeout(probeTimer);
          const xfo = String(probeRes.headers.get('x-frame-options') || '').toLowerCase();
          const csp = String(probeRes.headers.get('content-security-policy') || '').toLowerCase();
          probeController.abort();
          const blockedByXfo = xfo.includes('deny') || xfo.includes('sameorigin');
          const blockedByCsp =
            csp.includes('frame-ancestors') &&
            !csp.includes('frame-ancestors *') &&
            !csp.includes('frame-ancestors https:');
          canFrame = probeRes.ok && !blockedByXfo && !blockedByCsp;
        } catch {
          canFrame = false;
        }
      }

      const extFallbackResult: ExtractedStreamResult = {
        success: true,
        mode: canFrame ? 'embed' : 'cloud',
        streamUrl: fullTargetUrl,
        rawStreamUrl: fullTargetUrl,
        title: titleHint || 'Señal Web Directa',
        tracks: canFrame
          ? [
              {
                id: 'ext-web-embed-1',
                label: 'Reproductor Web Integrado',
                lang: preferLang || 'ES',
                sourceUrl: fullTargetUrl,
                resolverType: 'web_embed',
                resolvedStreamUrl: fullTargetUrl,
              },
            ]
          : [],
        expiresAt: Date.now() + 2 * 60 * 1000,
      };
      return res.json(extFallbackResult);
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

// ============================================================================
// REST API: RICH MEDIA DETAILS (4K TRAILER, CAST, RUNTIME, SIMILAR)
// ============================================================================
const richDetailsCache = new LruTtlCache<string, { details: any; ts: number }>(350, 30 * 60 * 1000);

app.get('/api/catalog/details/:mediaType/:tmdbId', async (req, res) => {
  try {
    const mediaType = req.params.mediaType === 'tv' ? 'tv' : 'movie';
    let cleanId = String(req.params.tmdbId || '').replace(/\D/g, '');
    const titleHint = String(req.query.title || '').trim();
    const movidyUrlHint = String(req.query.movidyUrl || '').trim();

    let movidyMeta: MovidyPageMetadata | null = null;
    if ((!cleanId || cleanId === '0') && movidyUrlHint) {
      movidyMeta = await fetchMovidyPageMetadata(movidyUrlHint);
    }

    if ((!cleanId || cleanId === '0') && (movidyMeta?.cleanTitle || titleHint)) {
      const resolved = await resolveTmdbIdByTitle(
        movidyMeta?.cleanTitle || titleHint,
        mediaType,
        movidyMeta?.year || undefined
      );
      if (resolved) cleanId = String(resolved);
    }

    // If a Movidy movie has no exact TMDB match (e.g. brand-new release or homonym from another year),
    // return Movidy's own verified metadata & languages so the modal NEVER jumps to an unrelated TMDB movie!
    if ((!cleanId || cleanId === '0') && movidyMeta) {
      const availableLanguages = await probeAvailableLanguages({
        tmdbId: '',
        mediaType,
        titleHints: [movidyMeta.cleanTitle || titleHint].filter(Boolean),
        movidyUrl: movidyUrlHint,
        yearHint: movidyMeta.year || undefined,
      });
      return res.json({
        success: true,
        details: {
          tmdbId: undefined,
          mediaType: movidyMeta.isTvShow ? 'tv' : mediaType,
          title: titleHint || movidyMeta.cleanTitle || 'Película',
          originalTitle: movidyMeta.cleanTitle || undefined,
          year: movidyMeta.year || 'HD',
          rating: '',
          runtimeText: movidyMeta.durationText || undefined,
          genres: [],
          overview: movidyMeta.overview || '',
          poster: '',
          backdrop: '',
          directorOrCreator: movidyMeta.director || undefined,
          watchProviders: [],
          availableLanguages,
          cast: movidyMeta.cast,
          similar: [],
        },
      });
    }

    if (!cleanId || cleanId === '0') return res.status(400).json({ success: false });

    const langParam = String(req.query.lang || 'es').toLowerCase() === 'en' ? 'en-US' : 'es-ES';
    const cacheKey = `v4|${mediaType}|${cleanId}|${langParam}|${movidyUrlHint}`;
    const cached = richDetailsCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < 10 * 60 * 1000) {
      return res.json({ success: true, details: cached.details });
    }

    const url = `https://api.themoviedb.org/3/${mediaType}/${cleanId}?api_key=${TMDB_API_KEY}&language=${langParam}&append_to_response=videos,credits,recommendations,watch/providers`;
    const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return res.status(404).json({ success: false });
    const data: any = await r.json();

    const esWp = data?.['watch/providers']?.results?.ES;
    const rawProviderEntries: any[] = [
      ...(Array.isArray(esWp?.flatrate) ? esWp.flatrate : []),
      ...(Array.isArray(esWp?.ads) ? esWp.ads : []),
      ...(Array.isArray(esWp?.free) ? esWp.free : []),
    ];
    const watchProviders = Array.from(
      new Set(
        rawProviderEntries
          .map((p) => {
            const n = String(p?.provider_name || '').trim();
            if (/netflix/i.test(n)) return 'Netflix';
            if (/hbo|max/i.test(n)) return 'HBO Max';
            if (/disney/i.test(n)) return 'Disney+';
            if (/prime video|amazon/i.test(n)) return 'Prime Video';
            if (/apple tv/i.test(n)) return 'Apple TV+';
            if (/movistar/i.test(n)) return 'Movistar+';
            if (/skyshowtime/i.test(n)) return 'SkyShowtime';
            if (/filmin/i.test(n)) return 'Filmin';
            if (/crunchyroll/i.test(n)) return 'Crunchyroll';
            if (/animebox/i.test(n)) return 'AnimeBox';
            return '';
          })
          .filter(Boolean)
      )
    );

    const localizedTitleData = await resolveLocalizedTmdbTitle({
      tmdbId: Number(cleanId),
      mediaType,
      currentTitle: data.title || data.name || '',
      originalTitle: data.original_title || data.original_name || '',
      lang: langParam,
    });
    const primaryTitle = localizedTitleData.title || titleHint || 'Título';
    const originalTitle = data.original_title || data.original_name || '';
    const tmdbYear = String(data.release_date || data.first_air_date || '').split('-')[0] || '';

    const [allVideosResolved, availableLanguages, titleLogoUrl] = await Promise.all([
      (async () => {
        let vids: any[] = Array.isArray(data?.videos?.results) ? data.videos.results : [];
        if (vids.length === 0 && langParam !== 'en-US') {
          const enVideosRes = await fetch(
            `https://api.themoviedb.org/3/${mediaType}/${cleanId}/videos?api_key=${TMDB_API_KEY}&language=en-US`,
            { signal: AbortSignal.timeout(3500) }
          ).catch(() => null);
          if (enVideosRes?.ok) {
            const enJson: any = await enVideosRes.json();
            vids = Array.isArray(enJson?.results) ? enJson.results : [];
          }
        }
        return vids;
      })(),
      probeAvailableLanguages({
        tmdbId: cleanId,
        mediaType,
        season: mediaType === 'tv' ? 1 : undefined,
        episode: mediaType === 'tv' ? 1 : undefined,
        titleHints: [primaryTitle, originalTitle, titleHint],
        movidyUrl: movidyUrlHint || undefined,
        vestUrl: String(req.query.vestUrl || '').trim() || undefined,
        yearHint: tmdbYear || undefined,
      }),
      fetchTmdbTitleLogo(Number(cleanId), mediaType, req.query.lang === 'en' ? 'en' : 'es'),
    ]);

    const ytVideos = allVideosResolved.filter((v) => v && v.site === 'YouTube' && v.key);
    const officialTrailer =
      ytVideos.find((v) => v.type === 'Trailer' && v.official) ||
      ytVideos.find((v) => v.type === 'Trailer') ||
      ytVideos.find((v) => v.type === 'Teaser') ||
      ytVideos[0];

    const rawCast: any[] = Array.isArray(data?.credits?.cast) ? data.credits.cast : [];
    const rawCrew: any[] = Array.isArray(data?.credits?.crew) ? data.credits.crew : [];
    const director =
      mediaType === 'movie'
        ? rawCrew.find((c) => c.job === 'Director')?.name
        : Array.isArray(data?.created_by) && data.created_by[0]?.name
        ? data.created_by[0].name
        : undefined;

    const runtimeMin =
      mediaType === 'movie'
        ? Number(data?.runtime || 0)
        : Number(data?.episode_run_time?.[0] || 0);
    const runtimeText =
      mediaType === 'tv'
        ? `${Number(data?.number_of_seasons || 1)} temp · ${Number(data?.number_of_episodes || 0)} eps`
        : runtimeMin > 0
        ? `${Math.floor(runtimeMin / 60)}h ${runtimeMin % 60}m`
        : undefined;

    const recs: any[] = Array.isArray(data?.recommendations?.results)
      ? data.recommendations.results
      : [];

    const details = {
      tmdbId: Number(cleanId),
      mediaType,
      title: primaryTitle,
      originalTitle,
      tagline: data.tagline || undefined,
      year: String(data.release_date || data.first_air_date || '').split('-')[0] || 'HD',
      rating: data.vote_average ? Number(data.vote_average).toFixed(1) : '',
      runtimeText,
      genres: (Array.isArray(data?.genres) ? data.genres : [])
        .map((g: any) => g?.name)
        .filter(Boolean)
        .slice(0, 4),
      overview: localizedTitleData.overview || data.overview || '',
      poster: data.poster_path ? `https://image.tmdb.org/t/p/w500${data.poster_path}` : '',
      backdrop: data.backdrop_path ? `https://image.tmdb.org/t/p/w1280${data.backdrop_path}` : '',
      logoUrl: titleLogoUrl || undefined,
      trailerKey: officialTrailer?.key || undefined,
      directorOrCreator: director,
      cast: rawCast.slice(0, 10).map((c) => ({
        id: c.id,
        name: c.name || '',
        character: c.character || '',
        photo: c.profile_path ? `https://image.tmdb.org/t/p/w185${c.profile_path}` : undefined,
      })),
      similar: recs
        .filter((item) => item && item.id && (item.poster_path || item.backdrop_path))
        .slice(0, 8)
        .map((item) => ({
          id: `${mediaType}-${item.id}`,
          tmdbId: item.id,
          mediaType,
          title: item.title || item.name || 'Título',
          originalTitle: item.original_title || item.original_name || '',
          year: String(item.release_date || item.first_air_date || '').split('-')[0] || 'HD',
          rating: item.vote_average ? Number(item.vote_average).toFixed(1) : '',
          overview: item.overview || '',
          poster: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : '',
          backdrop: item.backdrop_path ? `https://image.tmdb.org/t/p/w780${item.backdrop_path}` : '',
          bingetrixUrl: mediaType === 'movie' ? `https://bingetrix.sc/watch/${item.id}` : undefined,
          languages: ['Español', 'VOSE'],
        })),
      availableLanguages,
      watchProviders,
    };

    richDetailsCache.set(cacheKey, { details, ts: Date.now() });
    res.json({ success: true, details });
  } catch (err) {
    console.warn('Rich details error:', err);
    res.status(500).json({ success: false });
  }
});

// ============================================================================
// REST API: CLOUD SUBTITLES SEARCH & PROXY (SPANISH + ENGLISH .SRT/.VTT)
// ============================================================================
app.get('/api/subtitles/search', async (req, res) => {
  try {
    const tmdbId = String(req.query.tmdbId || '').replace(/\D/g, '');
    if (!tmdbId) return res.json({ success: true, tracks: [] });
    const season = parseInt(String(req.query.season || '0'), 10) || 0;
    const episode = parseInt(String(req.query.episode || '0'), 10) || 0;

    const prioritized = await fetchAndCacheSubtitles(tmdbId, season, episode, 5000);
    res.json({ success: true, tracks: prioritized });
  } catch {
    res.json({ success: true, tracks: [] });
  }
});

app.get('/api/subtitles/proxy', async (req, res) => {
  const rawUrl = String(req.query.url || '');
  if (!rawUrl || !/^https?:\/\//i.test(rawUrl)) return res.status(400).send('');
  try {
    await assertSafeProxyUrl(rawUrl);
  } catch {
    return res.status(403).send('');
  }
  try {
    let txt = '';
    try {
      const r = await streamingFetch(rawUrl, {
        headers: { 'User-Agent': CHROME_UA },
        timeoutMs: 5500,
      });
      if (r.ok) {
        txt = await r.text();
      }
    } catch {
      // fallback to plain curl below
    }
    if (!txt) {
      txt = await curlPlainGetText(rawUrl, 7).catch(() => '');
    }
    if (!txt) return res.status(404).send('');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(txt);
  } catch {
    res.status(502).send('');
  }
});

// ============================================================================
// REST API: REAL-TIME LIVE FOOTBALL & SPORTS SCOREBOARDS (ESPN PUBLIC JSON)
// ============================================================================
let liveScoresCache: { matches: any[]; ts: number } | null = null;

app.get('/api/sports/scores', async (_req, res) => {
  if (liveScoresCache && Date.now() - liveScoresCache.ts < 45 * 1000) {
    return res.json({ success: true, scores: liveScoresCache.matches });
  }

  const feeds: { url: string; league: string; sport: 'soccer' | 'basketball' }[] = [
    {
      url: 'https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1/scoreboard',
      league: 'LaLiga',
      sport: 'soccer',
    },
    {
      url: 'https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.champions/scoreboard',
      league: 'Champions',
      sport: 'soccer',
    },
    {
      url: 'https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard',
      league: 'Premier',
      sport: 'soccer',
    },
    {
      url: 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard',
      league: 'NBA',
      sport: 'basketball',
    },
  ];

  try {
    const responses = await Promise.all(
      feeds.map((f) =>
        fetch(f.url, { signal: AbortSignal.timeout(4000) })
          .then((r) => (r.ok ? r.json() : null))
          .then((json) => ({ feed: f, json }))
          .catch(() => ({ feed: f, json: null }))
      )
    );

    const parsed: any[] = [];
    for (const { feed, json } of responses) {
      const events: any[] = Array.isArray(json?.events) ? json.events : [];
      for (const ev of events.slice(0, 6)) {
        const comp = ev?.competitions?.[0];
        const competitors: any[] = Array.isArray(comp?.competitors) ? comp.competitors : [];
        const home = competitors.find((c) => c.homeAway === 'home') || competitors[0];
        const away = competitors.find((c) => c.homeAway === 'away') || competitors[1];
        if (!home || !away) continue;

        const stateStr = String(ev?.status?.type?.state || '');
        const isLive = stateStr === 'in';
        const shortDetail =
          ev?.status?.type?.shortDetail || ev?.status?.displayClock || (isLive ? 'EN JUEGO' : '');

        parsed.push({
          id: `${feed.league}-${ev.id}`,
          league: feed.league,
          sport: feed.sport,
          homeTeam: home.team?.shortDisplayName || home.team?.displayName || 'Local',
          awayTeam: away.team?.shortDisplayName || away.team?.displayName || 'Visitante',
          homeScore: stateStr === 'pre' ? '-' : String(home.score ?? '0'),
          awayScore: stateStr === 'pre' ? '-' : String(away.score ?? '0'),
          homeLogo: home.team?.logo || undefined,
          awayLogo: away.team?.logo || undefined,
          statusText: shortDetail,
          isLive,
        });
      }
    }

    parsed.sort((a, b) => Number(b.isLive) - Number(a.isLive));
    liveScoresCache = { matches: parsed.slice(0, 18), ts: Date.now() };
    res.json({ success: true, scores: liveScoresCache.matches });
  } catch {
    res.json({ success: true, scores: [] });
  }
});

// ============================================================================
// REST API: LIVE FOOTBALL MATCHBOARD (FLAGS, CLUB CRESTS, LIVE MINUTE, STREAMS & STATS)
// ============================================================================
interface SoccerLeagueFeedDef {
  slug: string;
  regionName: string;
  leagueName: string;
  regionFlagUrl: string;
  priority: number;
  broadcasterProfile: 'spain_nt' | 'laliga' | 'copa_rey' | 'uefa' | 'europe' | 'americas';
}

const SOCCER_BOARD_LEAGUES: SoccerLeagueFeedDef[] = [
  {
    slug: 'esp.1',
    regionName: 'España',
    leagueName: 'LaLiga EA Sports',
    regionFlagUrl: 'https://flagcdn.com/w40/es.png',
    priority: 1,
    broadcasterProfile: 'laliga',
  },
  {
    slug: 'uefa.champions',
    regionName: 'Europa',
    leagueName: 'Champions League',
    regionFlagUrl: 'https://flagcdn.com/w40/eu.png',
    priority: 2,
    broadcasterProfile: 'uefa',
  },
  {
    slug: 'uefa.nations',
    regionName: 'Europa',
    leagueName: 'Liga de Naciones UEFA',
    regionFlagUrl: 'https://flagcdn.com/w40/eu.png',
    priority: 3,
    broadcasterProfile: 'spain_nt',
  },
  {
    slug: 'esp.copa_del_rey',
    regionName: 'España',
    leagueName: 'Copa del Rey',
    regionFlagUrl: 'https://flagcdn.com/w40/es.png',
    priority: 4,
    broadcasterProfile: 'copa_rey',
  },
  {
    slug: 'esp.2',
    regionName: 'España',
    leagueName: 'LaLiga Hypermotion',
    regionFlagUrl: 'https://flagcdn.com/w40/es.png',
    priority: 5,
    broadcasterProfile: 'laliga',
  },
  {
    slug: 'uefa.europa',
    regionName: 'Europa',
    leagueName: 'Europa League',
    regionFlagUrl: 'https://flagcdn.com/w40/eu.png',
    priority: 6,
    broadcasterProfile: 'uefa',
  },
  {
    slug: 'uefa.europa.conf',
    regionName: 'Europa',
    leagueName: 'Conference League',
    regionFlagUrl: 'https://flagcdn.com/w40/eu.png',
    priority: 7,
    broadcasterProfile: 'uefa',
  },
  {
    slug: 'uefa.wchampions',
    regionName: 'Europa',
    leagueName: 'Champions League Femenina',
    regionFlagUrl: 'https://flagcdn.com/w40/eu.png',
    priority: 8,
    broadcasterProfile: 'uefa',
  },
  {
    slug: 'eng.1',
    regionName: 'Inglaterra',
    leagueName: 'Premier League',
    regionFlagUrl: 'https://flagcdn.com/w40/gb-eng.png',
    priority: 9,
    broadcasterProfile: 'europe',
  },
  {
    slug: 'eng.fa',
    regionName: 'Inglaterra',
    leagueName: 'FA Cup',
    regionFlagUrl: 'https://flagcdn.com/w40/gb-eng.png',
    priority: 10,
    broadcasterProfile: 'europe',
  },
  {
    slug: 'ita.1',
    regionName: 'Italia',
    leagueName: 'Serie A',
    regionFlagUrl: 'https://flagcdn.com/w40/it.png',
    priority: 11,
    broadcasterProfile: 'europe',
  },
  {
    slug: 'ger.1',
    regionName: 'Alemania',
    leagueName: 'Bundesliga',
    regionFlagUrl: 'https://flagcdn.com/w40/de.png',
    priority: 12,
    broadcasterProfile: 'europe',
  },
  {
    slug: 'fra.1',
    regionName: 'Francia',
    leagueName: 'Ligue 1',
    regionFlagUrl: 'https://flagcdn.com/w40/fr.png',
    priority: 13,
    broadcasterProfile: 'europe',
  },
  {
    slug: 'fra.coupe_de_france',
    regionName: 'Francia',
    leagueName: 'Coupe de France',
    regionFlagUrl: 'https://flagcdn.com/w40/fr.png',
    priority: 14,
    broadcasterProfile: 'europe',
  },
  {
    slug: 'por.1',
    regionName: 'Portugal',
    leagueName: 'Primeira Liga',
    regionFlagUrl: 'https://flagcdn.com/w40/pt.png',
    priority: 15,
    broadcasterProfile: 'europe',
  },
  {
    slug: 'ned.1',
    regionName: 'Países Bajos',
    leagueName: 'Eredivisie',
    regionFlagUrl: 'https://flagcdn.com/w40/nl.png',
    priority: 16,
    broadcasterProfile: 'europe',
  },
  {
    slug: 'fifa.worldq.uefa',
    regionName: 'Europa',
    leagueName: 'Clasificación Mundial UEFA',
    regionFlagUrl: 'https://flagcdn.com/w40/eu.png',
    priority: 17,
    broadcasterProfile: 'spain_nt',
  },
  {
    slug: 'fifa.worldq.conmebol',
    regionName: 'Sudamérica',
    leagueName: 'Eliminatorias CONMEBOL',
    regionFlagUrl: 'https://flagcdn.com/w40/ar.png',
    priority: 18,
    broadcasterProfile: 'americas',
  },
  {
    slug: 'fifa.worldq.caf',
    regionName: 'África',
    leagueName: 'Clasificación CAF',
    regionFlagUrl: 'https://flagcdn.com/w40/ma.png',
    priority: 19,
    broadcasterProfile: 'europe',
  },
  {
    slug: 'fifa.friendly',
    regionName: 'Internacional',
    leagueName: 'Amistosos Internacionales',
    regionFlagUrl: 'https://flagcdn.com/w40/un.png',
    priority: 20,
    broadcasterProfile: 'spain_nt',
  },
  {
    slug: 'conmebol.libertadores',
    regionName: 'Sudamérica',
    leagueName: 'Copa Libertadores',
    regionFlagUrl: 'https://flagcdn.com/w40/br.png',
    priority: 21,
    broadcasterProfile: 'americas',
  },
  {
    slug: 'bra.1',
    regionName: 'Brasil',
    leagueName: 'Brasileirao Serie A',
    regionFlagUrl: 'https://flagcdn.com/w40/br.png',
    priority: 22,
    broadcasterProfile: 'americas',
  },
  {
    slug: 'bra.2',
    regionName: 'Brasil',
    leagueName: 'Brasileirao Serie B',
    regionFlagUrl: 'https://flagcdn.com/w40/br.png',
    priority: 23,
    broadcasterProfile: 'americas',
  },
  {
    slug: 'arg.1',
    regionName: 'Argentina',
    leagueName: 'Liga Profesional',
    regionFlagUrl: 'https://flagcdn.com/w40/ar.png',
    priority: 24,
    broadcasterProfile: 'americas',
  },
  {
    slug: 'mex.1',
    regionName: 'México',
    leagueName: 'Liga MX',
    regionFlagUrl: 'https://flagcdn.com/w40/mx.png',
    priority: 25,
    broadcasterProfile: 'americas',
  },
  {
    slug: 'usa.1',
    regionName: 'EE. UU.',
    leagueName: 'MLS',
    regionFlagUrl: 'https://flagcdn.com/w40/us.png',
    priority: 26,
    broadcasterProfile: 'americas',
  },
];

const COUNTRY_NAME_TO_ISO2: Record<string, string> = {
  espana: 'es',
  spain: 'es',
  francia: 'fr',
  france: 'fr',
  italia: 'it',
  italy: 'it',
  alemania: 'de',
  germany: 'de',
  inglaterra: 'gb-eng',
  england: 'gb-eng',
  escocia: 'gb-sct',
  gales: 'gb-wls',
  portugal: 'pt',
  croacia: 'hr',
  croatia: 'hr',
  republica_checa: 'cz',
  chequia: 'cz',
  czechia: 'cz',
  montenegro: 'me',
  letonia: 'lv',
  latvia: 'lv',
  albania: 'al',
  finlandia: 'fi',
  finland: 'fi',
  san_marino: 'sm',
  bielorrusia: 'by',
  belarus: 'by',
  paises_bajos: 'nl',
  holanda: 'nl',
  belgica: 'be',
  suiza: 'ch',
  austria: 'at',
  dinamarca: 'dk',
  suecia: 'se',
  noruega: 'no',
  polonia: 'pl',
  turquia: 'tr',
  grecia: 'gr',
  serbia: 'rs',
  rumania: 'ro',
  ucrania: 'ua',
  hungria: 'hu',
  irlanda: 'ie',
  islandia: 'is',
  eslovaquia: 'sk',
  eslovenia: 'si',
  georgia: 'ge',
  armenia: 'am',
  chipre: 'cy',
  rusia: 'ru',
  brasil: 'br',
  argentina: 'ar',
  uruguay: 'uy',
  colombia: 'co',
  chile: 'cl',
  paraguay: 'py',
  peru: 'pe',
  ecuador: 'ec',
  venezuela: 've',
  bolivia: 'bo',
  mexico: 'mx',
  estados_unidos: 'us',
  canada: 'ca',
  japon: 'jp',
  marruecos: 'ma',
  nigeria: 'ng',
  senegal: 'sn',
  egipto: 'eg',
  camerun: 'cm',
  ghana: 'gh',
  argelia: 'dz',
  tunez: 'tn',
};

function normalizeTeamToken(raw: string): string {
  return String(raw || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function resolveTeamBadgeUrl(teamObj: any, isInternational: boolean): string | undefined {
  const directLogo = String(teamObj?.logo || teamObj?.logos?.[0]?.href || '').trim();
  if (directLogo.startsWith('http')) {
    return directLogo;
  }
  if (isInternational) {
    const slug = normalizeTeamToken(teamObj?.displayName || teamObj?.shortDisplayName || '');
    const iso = COUNTRY_NAME_TO_ISO2[slug];
    if (iso) return `https://flagcdn.com/w40/${iso}.png`;
  }
  return undefined;
}

const BILINGUAL_TEAM_ALIASES: Record<string, string[]> = {
  espana: ['espana', 'spain'],
  francia: ['francia', 'france'],
  italia: ['italia', 'italy'],
  inglaterra: ['inglaterra', 'england'],
  alemania: ['alemania', 'germany'],
  paises_bajos: ['paises bajos', 'holanda', 'netherlands'],
  escocia: ['escocia', 'scotland'],
  gales: ['gales', 'wales'],
  suiza: ['suiza', 'switzerland'],
  suecia: ['suecia', 'sweden'],
  dinamarca: ['dinamarca', 'denmark'],
  noruega: ['noruega', 'norway'],
  polonia: ['polonia', 'poland'],
  turquia: ['turquia', 'turkey', 'turkiye'],
  grecia: ['grecia', 'greece'],
  hungria: ['hungria', 'hungary'],
  belgica: ['belgica', 'belgium'],
  croacia: ['croacia', 'croatia'],
  republica_checa: ['republica checa', 'chequia', 'czech', 'czechia'],
  letonia: ['letonia', 'latvia'],
  finlandia: ['finlandia', 'finland'],
  bielorrusia: ['bielorrusia', 'belarus'],
  eslovaquia: ['eslovaquia', 'slovakia'],
  eslovenia: ['eslovenia', 'slovenia'],
  islandia: ['islandia', 'iceland'],
  irlanda: ['irlanda', 'ireland'],
  ucrania: ['ucrania', 'ukraine'],
  rumania: ['rumania', 'romania'],
  rusia: ['rusia', 'russia'],
  chipre: ['chipre', 'cyprus'],
  estados_unidos: ['estados unidos', 'usa', 'united states'],
  brasil: ['brasil', 'brazil'],
  marruecos: ['marruecos', 'morocco'],
  argelia: ['argelia', 'algeria'],
  egipto: ['egipto', 'egypt'],
  tunez: ['tunez', 'tunisia'],
  camerun: ['camerun', 'cameroon'],
  costa_de_marfil: ['costa de marfil', 'ivory coast', 'cote divoire'],
  sudafrica: ['sudafrica', 'south africa'],
  japon: ['japon', 'japan'],
  corea_del_sur: ['corea del sur', 'south korea', 'korea'],
};

const GENERIC_TEAM_STOPWORDS = new Set([
  'fc',
  'cf',
  'sc',
  'ac',
  'cd',
  'ud',
  'sd',
  'ca',
  'rc',
  'rcd',
  'club',
  'real',
  'united',
  'city',
  'sporting',
  'atletico',
  'deportivo',
  'nacional',
  'union',
  'america',
  'racing',
  'independiente',
  'republica',
  'san',
  'santa',
  'st',
  'al',
  'de',
  'del',
  'la',
  'el',
  'los',
  'las',
  'women',
  'femenino',
  'fem',
  'u21',
  'u20',
  'u19',
]);

function doesSingleTeamMatchCandidate(boardTeamRaw: string, candidateSideRaw: string): boolean {
  const boardSlug = normalizeTeamToken(boardTeamRaw);
  const candSpace = normalizeTeamToken(candidateSideRaw).replace(/_/g, ' ');
  const boardSpace = boardSlug.replace(/_/g, ' ');
  if (!boardSpace || !candSpace) return false;
  if (candSpace === boardSpace || candSpace.includes(boardSpace) || boardSpace.includes(candSpace)) {
    // Guard against matching a single generic stopword like "real" or "united"
    if (GENERIC_TEAM_STOPWORDS.has(candSpace) || GENERIC_TEAM_STOPWORDS.has(boardSpace)) {
      return candSpace === boardSpace;
    }
    return true;
  }

  const aliases = BILINGUAL_TEAM_ALIASES[boardSlug];
  if (aliases && aliases.some((al) => candSpace.includes(al) || al.includes(candSpace))) {
    return true;
  }

  const distinctiveTokens = boardSpace
    .split(' ')
    .filter((w) => w.length >= 4 && !GENERIC_TEAM_STOPWORDS.has(w));
  if (distinctiveTokens.length === 0) return false;
  return distinctiveTokens.some((tok) => {
    const aliasList = BILINGUAL_TEAM_ALIASES[tok] || [tok];
    return aliasList.some((al) => candSpace.includes(al));
  });
}

function doesScrapedEventMatchFixture(
  homeTeam: string,
  awayTeam: string,
  scrapedEvent: { title?: string; homeTeam?: string; awayTeam?: string }
): boolean {
  if (scrapedEvent.homeTeam && scrapedEvent.awayTeam) {
    return (
      (doesSingleTeamMatchCandidate(homeTeam, scrapedEvent.homeTeam) &&
        doesSingleTeamMatchCandidate(awayTeam, scrapedEvent.awayTeam)) ||
      (doesSingleTeamMatchCandidate(homeTeam, scrapedEvent.awayTeam) &&
        doesSingleTeamMatchCandidate(awayTeam, scrapedEvent.homeTeam))
    );
  }

  const rawTitle = String(scrapedEvent.title || '');
  const parts = rawTitle.split(/\s+(?:vs\.?|v\.?|-|contra)\s+/i);
  if (parts.length >= 2) {
    const sideA = parts[0].trim();
    const sideB = parts.slice(1).join(' ').trim();
    return (
      (doesSingleTeamMatchCandidate(homeTeam, sideA) &&
        doesSingleTeamMatchCandidate(awayTeam, sideB)) ||
      (doesSingleTeamMatchCandidate(homeTeam, sideB) &&
        doesSingleTeamMatchCandidate(awayTeam, sideA))
    );
  }
  return false;
}

function buildFootballMatchChannels(params: {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  statusState: 'live' | 'upcoming' | 'finished';
  league: SoccerLeagueFeedDef;
  scrapedMatches: any[];
}): TrackRecord[] {
  const { matchId, homeTeam, awayTeam, statusState, league, scrapedMatches } = params;
  if (statusState === 'finished') return [];

  const channels: TrackRecord[] = [];
  const seenUrls = new Set<string>();

  const pushTrack = (track: TrackRecord) => {
    if (!track.sourceUrl || seenUrls.has(track.sourceUrl)) return;
    seenUrls.add(track.sourceUrl);
    channels.push(track);
  };

  // 1. Strict BOTH-teams match against real-time live event feeds (StreamXHD + RojaDirecta)
  for (const sm of scrapedMatches) {
    if (sm.is247Channel) continue;
    if (doesScrapedEventMatchFixture(homeTeam, awayTeam, sm)) {
      for (const ch of sm.channels || []) {
        pushTrack({
          id: `${matchId}-live-${channels.length + 1}`,
          label: ch.label || `Señal Directo ${channels.length + 1}`,
          lang: ch.lang || 'ES',
          quality: ch.quality || 'HD',
          sourceUrl: ch.sourceUrl,
          resolverType: ch.resolverType || 'sports_channel',
        });
      }
    }
  }

  // 2. Official RTVE La 1 ONLY when España senior national team is playing
  const homeNorm = normalizeTeamToken(homeTeam);
  const awayNorm = normalizeTeamToken(awayTeam);
  const isSpainNationalMatch =
    (homeNorm === 'espana' || homeNorm === 'spain' || awayNorm === 'espana' || awayNorm === 'spain') &&
    (league.slug.startsWith('uefa.nations') ||
      league.slug.startsWith('uefa.euro') ||
      league.slug.startsWith('fifa.'));

  if (isSpainNationalMatch) {
    pushTrack({
      id: `${matchId}-la1`,
      label: 'La 1 RTVE HD',
      lang: 'ES',
      quality: '1080p',
      sourceUrl: 'https://rtvelivestream.rtve.es/rtvesec/la1/la1_main.m3u8',
      resolverType: 'tdt_hls',
    });
  }

  // Never pad unrelated 24/7 channels onto matches — clicking a match must ONLY play THAT match!
  return channels.slice(0, 8);
}

let cachedFootballBoard: { dateKey: string; matches: any[]; ts: number } | null = null;

app.get('/api/sports/football-board', async (req, res) => {
  const requestedDate = String(req.query.date || '')
    .replace(/\D/g, '')
    .slice(0, 8);
  const madridToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' })
    .format(new Date())
    .replace(/-/g, '');
  const dateKey = requestedDate.length === 8 ? requestedDate : madridToday;
  const isToday = dateKey === madridToday;
  const cacheTtlMs = isToday ? 18 * 1000 : 2 * 60 * 1000;

  if (
    cachedFootballBoard &&
    cachedFootballBoard.dateKey === dateKey &&
    Date.now() - cachedFootballBoard.ts < cacheTtlMs
  ) {
    return res.json({ success: true, dateKey, matches: cachedFootballBoard.matches });
  }

  try {
    const madridTimeFmt = new Intl.DateTimeFormat('es-ES', {
      timeZone: 'Europe/Madrid',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    const [liveFeeds, fotmobMatches, ...responses] = await Promise.all([
      isToday
        ? fetchLiveSportsAgendaFeeds()
        : Promise.resolve({ rojaMatches: [], streamXhdFootball: [] }),
      fetchFotmobDayIndex(dateKey).catch(() => []),
      ...SOCCER_BOARD_LEAGUES.map((league) =>
        fetch(
          `https://site.api.espn.com/apis/site/v2/sports/soccer/${league.slug}/scoreboard?dates=${dateKey}&lang=es&region=es`,
          { signal: AbortSignal.timeout(4500) }
        )
          .then((r) => (r.ok ? r.json() : null))
          .then((json) => ({ league, json }))
          .catch(() => ({ league, json: null }))
      ),
    ]);

    const scrapedMatches = liveFeeds.rojaMatches;
    const items: any[] = [];
    const seenEventIds = new Set<string>();
    const matchedFotmobIds = new Set<string>();

    const findFotmobMatch = (homeName: string, awayName: string) =>
      fotmobMatches.find(
        (fm) =>
          (doFootballTeamNamesMatch(homeName, fm.homeName) &&
            doFootballTeamNamesMatch(awayName, fm.awayName)) ||
          (doFootballTeamNamesMatch(homeName, fm.awayName) &&
            doFootballTeamNamesMatch(awayName, fm.homeName))
      );

    for (const { league, json } of responses) {
      const events: any[] = Array.isArray(json?.events) ? json.events : [];
      const espnLeagueLogo = String(json?.leagues?.[0]?.logos?.[0]?.href || '').trim() || undefined;
      const isInternational =
        league.slug.startsWith('uefa.nations') || league.slug.startsWith('fifa.');

      for (const ev of events) {
        const eventId = String(ev?.id || '').trim();
        if (!eventId || seenEventIds.has(eventId)) continue;
        seenEventIds.add(eventId);

        const comp = ev?.competitions?.[0];
        const competitors: any[] = Array.isArray(comp?.competitors) ? comp.competitors : [];
        const home = competitors.find((c) => c.homeAway === 'home') || competitors[0];
        const away = competitors.find((c) => c.homeAway === 'away') || competitors[1];
        if (!home || !away) continue;

        const kickoffDate = ev?.date ? new Date(ev.date) : new Date();
        const kickoffTime = Number.isNaN(kickoffDate.getTime())
          ? '20:45'
          : madridTimeFmt.format(kickoffDate);

        const rawState = String(ev?.status?.type?.state || '').toLowerCase();
        const statusName = String(ev?.status?.type?.name || '');
        let statusState: 'live' | 'upcoming' | 'finished' =
          rawState === 'in' ? 'live' : rawState === 'post' ? 'finished' : 'upcoming';

        let statusLabel = '';
        if (statusState === 'live') {
          if (statusName.includes('HALFTIME')) {
            statusLabel = 'HT';
          } else {
            const clk = String(
              ev?.status?.displayClock || ev?.status?.type?.shortDetail || ''
            ).trim();
            statusLabel = clk || 'EN VIVO';
          }
        } else if (statusState === 'finished') {
          statusLabel = statusName.includes('PEN') ? 'PEN' : statusName.includes('AET') ? 'PRÓ' : 'FT';
        }

        const homeTeam = String(
          home.team?.shortDisplayName || home.team?.displayName || 'Local'
        ).trim();
        const awayTeam = String(
          away.team?.shortDisplayName || away.team?.displayName || 'Visitante'
        ).trim();

        const fm = findFotmobMatch(homeTeam, awayTeam);
        if (fm) {
          matchedFotmobIds.add(fm.fotmobId);
          // Use freshest live status/minute/score if FotMob reports in-progress/finished ahead of ESPN
          if (fm.statusState === 'live') {
            statusState = 'live';
            if (fm.statusLabel) statusLabel = fm.statusLabel;
          } else if (fm.statusState === 'finished' && statusState !== 'finished') {
            statusState = 'finished';
            statusLabel = fm.statusLabel || 'FT';
          }
        }

        const resolvedHomeScore =
          fm && fm.statusState !== 'upcoming'
            ? fm.homeScore
            : statusState === 'upcoming'
            ? '-'
            : String(home.score ?? '0');
        const resolvedAwayScore =
          fm && fm.statusState !== 'upcoming'
            ? fm.awayScore
            : statusState === 'upcoming'
            ? '-'
            : String(away.score ?? '0');

        const channels = buildFootballMatchChannels({
          matchId: `fb-${eventId}`,
          homeTeam,
          awayTeam,
          statusState,
          league,
          scrapedMatches,
        });

        items.push({
          id: `fb-${eventId}`,
          eventId,
          fotmobMatchId: fm?.fotmobId,
          leagueSlug: league.slug,
          regionName: league.regionName,
          leagueName: league.leagueName,
          groupTitle: `${league.regionName}: ${league.leagueName}`,
          regionFlagUrl: league.regionFlagUrl,
          leagueLogoUrl: espnLeagueLogo,
          priority: league.priority,
          kickoffIso: kickoffDate.toISOString(),
          kickoffTime: fm?.kickoffTime || kickoffTime,
          kickoffMs: fm?.kickoffMs || kickoffDate.getTime() || 0,
          statusState,
          statusLabel,
          homeTeam,
          awayTeam,
          homeShort: String(home.team?.abbreviation || homeTeam.slice(0, 3)).toUpperCase(),
          awayShort: String(away.team?.abbreviation || awayTeam.slice(0, 3)).toUpperCase(),
          homeLogo: resolveTeamBadgeUrl(home.team, isInternational) || fm?.homeLogo,
          awayLogo: resolveTeamBadgeUrl(away.team, isInternational) || fm?.awayLogo,
          homeScore: resolvedHomeScore,
          awayScore: resolvedAwayScore,
          homeRedCards: fm?.homeRedCards || 0,
          awayRedCards: fm?.awayRedCards || 0,
          channels,
        });
      }
    }

    // Include live/today football matches from StreamXHD (`eventos.json`) not already in ESPN's feed, enriched with real FotMob live scores/IDs
    if (isToday && liveFeeds.streamXhdFootball.length > 0) {
      for (let idx = 0; idx < liveFeeds.streamXhdFootball.length; idx++) {
        const sx = liveFeeds.streamXhdFootball[idx];
        const alreadyInBoard = items.some((it) =>
          doesScrapedEventMatchFixture(it.homeTeam, it.awayTeam, sx)
        );
        if (alreadyInBoard) continue;

        const fm = findFotmobMatch(sx.homeTeam, sx.awayTeam);
        if (fm) matchedFotmobIds.add(fm.fotmobId);

        const sxId = `sxhd-${idx + 1}-${normalizeTeamToken(sx.homeTeam).slice(0, 8)}`;
        const codeUpper = String(sx.code || '').toUpperCase();
        const flagIso =
          codeUpper === 'COL'
            ? 'co'
            : codeUpper === 'ARG'
            ? 'ar'
            : codeUpper === 'MEX'
            ? 'mx'
            : codeUpper === 'CHL' || codeUpper === 'CHI'
            ? 'cl'
            : codeUpper === 'PER'
            ? 'pe'
            : codeUpper === 'BRA'
            ? 'br'
            : codeUpper === 'URU'
            ? 'uy'
            : codeUpper === 'ECU'
            ? 'ec'
            : 'un';

        items.push({
          id: `fb-${sxId}`,
          eventId: fm?.fotmobId || sxId,
          fotmobMatchId: fm?.fotmobId,
          leagueSlug: fm ? `fotmob.${fm.leagueId}` : `live.${normalizeTeamToken(sx.leagueName || 'directo')}`,
          regionName: fm ? getRegionLabelFromCcode(fm.ccode) : codeUpper || 'Internacional',
          leagueName: fm?.leagueName || sx.leagueName || 'Fútbol en Vivo',
          groupTitle: `${codeUpper || 'En Vivo'}: ${fm?.leagueName || sx.leagueName || 'Fútbol en Directo'}`,
          regionFlagUrl: fm?.regionFlagUrl || `https://flagcdn.com/w40/${flagIso}.png`,
          priority: 12,
          kickoffIso: fm?.utcTime || new Date().toISOString(),
          kickoffTime: fm?.kickoffTime || sx.timeStr || 'EN VIVO',
          kickoffMs: fm?.kickoffMs || Date.now(),
          statusState: fm?.statusState || 'live',
          statusLabel: fm?.statusLabel || 'EN VIVO',
          homeTeam: fm?.homeName || sx.homeTeam,
          awayTeam: fm?.awayName || sx.awayTeam,
          homeShort: (fm?.homeName || sx.homeTeam).slice(0, 3).toUpperCase(),
          awayShort: (fm?.awayName || sx.awayTeam).slice(0, 3).toUpperCase(),
          homeLogo: fm?.homeLogo || sx.homeLogo,
          awayLogo: fm?.awayLogo || sx.awayLogo,
          homeScore: fm ? fm.homeScore : '•',
          awayScore: fm ? fm.awayScore : '•',
          homeRedCards: fm?.homeRedCards || 0,
          awayRedCards: fm?.awayRedCards || 0,
          channels: sx.channels,
        });
      }
    }

    // Also include top FotMob live or notable international/club fixtures not covered by ESPN
    for (const fm of fotmobMatches) {
      if (matchedFotmobIds.has(fm.fotmobId)) continue;
      if (fm.statusState !== 'live' && fm.ccode !== 'INT' && fm.ccode !== 'ESP' && fm.ccode !== 'EUR') {
        continue;
      }
      // Also check if RojaDirecta / StreamXHD has any stream for this FotMob fixture
      const pseudoLeague: SoccerLeagueFeedDef = {
        slug: `fotmob.${fm.leagueId}`,
        regionName: getRegionLabelFromCcode(fm.ccode),
        leagueName: fm.leagueName,
        regionFlagUrl: fm.regionFlagUrl,
        priority: fm.statusState === 'live' ? 11 : 28,
        broadcasterProfile: fm.ccode === 'ESP' ? 'laliga' : fm.ccode === 'INT' ? 'spain_nt' : 'europe',
      };
      const channels = buildFootballMatchChannels({
        matchId: `fb-fm-${fm.fotmobId}`,
        homeTeam: fm.homeName,
        awayTeam: fm.awayName,
        statusState: fm.statusState,
        league: pseudoLeague,
        scrapedMatches,
      });

      items.push({
        id: `fb-fm-${fm.fotmobId}`,
        eventId: fm.fotmobId,
        fotmobMatchId: fm.fotmobId,
        leagueSlug: pseudoLeague.slug,
        regionName: pseudoLeague.regionName,
        leagueName: fm.leagueName,
        groupTitle: `${pseudoLeague.regionName}: ${fm.leagueName}`,
        regionFlagUrl: fm.regionFlagUrl,
        priority: pseudoLeague.priority,
        kickoffIso: fm.utcTime || new Date().toISOString(),
        kickoffTime: fm.kickoffTime,
        kickoffMs: fm.kickoffMs,
        statusState: fm.statusState,
        statusLabel: fm.statusLabel,
        homeTeam: fm.homeName,
        awayTeam: fm.awayName,
        homeShort: fm.homeName.slice(0, 3).toUpperCase(),
        awayShort: fm.awayName.slice(0, 3).toUpperCase(),
        homeLogo: fm.homeLogo,
        awayLogo: fm.awayLogo,
        homeScore: fm.homeScore,
        awayScore: fm.awayScore,
        homeRedCards: fm.homeRedCards,
        awayRedCards: fm.awayRedCards,
        channels,
      });
    }

    items.sort((a, b) => {
      const rank = (s: string) => (s === 'live' ? 0 : s === 'upcoming' ? 1 : 2);
      if (rank(a.statusState) !== rank(b.statusState)) {
        return rank(a.statusState) - rank(b.statusState);
      }
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.kickoffMs - b.kickoffMs;
    });

    cachedFootballBoard = { dateKey, matches: items, ts: Date.now() };
    const prioritizedItems = items.map((m) => ({
      ...m,
      channels: channelHealthMonitor.prioritizeTracks(m.channels || []),
    }));
    res.json({ success: true, dateKey, matches: prioritizedItems });
  } catch (err) {
    console.warn('Football matchboard fetch error:', err);
    const fallbackItems = (cachedFootballBoard?.matches || []).map((m: any) => ({
      ...m,
      channels: channelHealthMonitor.prioritizeTracks(m.channels || []),
    }));
    res.json({ success: true, dateKey, matches: fallbackItems });
  }
});

app.get('/api/sports/match-details', async (req, res) => {
  const eventId = String(req.query.eventId || '').trim();
  const fotmobMatchId = String(req.query.fotmobMatchId || '').trim();
  const leagueSlug = String(req.query.leagueSlug || 'all').replace(/[^a-z0-9._-]/gi, '') || 'all';
  const homeTeam = String(req.query.homeTeam || '').trim();
  const awayTeam = String(req.query.awayTeam || '').trim();
  const dateKey = String(req.query.date || '').replace(/\D/g, '').slice(0, 8);

  if (!eventId && !fotmobMatchId && !(homeTeam && awayTeam)) {
    return res.status(400).json({ success: false, error: 'Missing eventId or team info' });
  }

  try {
    const details = await fetchRealFootballMatchDetails({
      eventId,
      fotmobMatchId,
      leagueSlug,
      homeTeam,
      awayTeam,
      dateKey: dateKey || undefined,
    });
    res.json({ success: true, details });
  } catch (err) {
    console.warn('Match details error:', err);
    res.json({
      success: true,
      details: { eventId: eventId || fotmobMatchId, stats: [], events: [], commentary: [], shotsMap: [] },
    });
  }
});

// ============================================================================
// REST API: DEDICATED "TODO EN CASTELLANO (ESPAÑA)" HUB (/api/catalog/castellano)
// Curated + TMDB Spain (`watch_region=ES` & `with_origin_country=ES`) + GnulaHD/Movidy
// ============================================================================
const CURATED_CASTELLANO_SERIES_SEEDS: {
  tmdbId: number;
  providerId: string;
  platform: string;
}[] = [
  { tmdbId: 124364, providerId: 'hbomax', platform: 'HBO Max' }, // From (¡pedida explícitamente!)
  { tmdbId: 94997, providerId: 'hbomax', platform: 'HBO Max' }, // La Casa del Dragón
  { tmdbId: 100088, providerId: 'hbomax', platform: 'HBO Max' }, // The Last of Us
  { tmdbId: 205715, providerId: 'prime', platform: 'Prime Video' }, // Reina Roja
  { tmdbId: 106379, providerId: 'prime', platform: 'Prime Video' }, // Fallout
  { tmdbId: 71446, providerId: 'netflix', platform: 'Netflix' }, // La Casa de Papel
  { tmdbId: 196890, providerId: 'netflix', platform: 'Netflix' }, // Berlín
  { tmdbId: 40173, providerId: 'prime', platform: 'Prime Video' }, // La que se avecina
  { tmdbId: 2361, providerId: 'netflix', platform: 'Netflix' }, // Aquí no hay quien viva
  { tmdbId: 156933, providerId: 'netflix', platform: 'Netflix' }, // Entrevías
  { tmdbId: 215720, providerId: 'netflix', platform: 'Netflix' }, // Machos Alfa
  { tmdbId: 108296, providerId: 'movistar', platform: 'Movistar+' }, // Antidisturbios
  { tmdbId: 106392, providerId: 'hbomax', platform: 'HBO Max' }, // 30 Monedas
  { tmdbId: 259850, providerId: 'movistar', platform: 'Movistar+' }, // Querer
  { tmdbId: 259915, providerId: 'movistar', platform: 'Movistar+' }, // Celeste
  { tmdbId: 249980, providerId: 'netflix', platform: 'Netflix' }, // Clanes
  { tmdbId: 210945, providerId: 'netflix', platform: 'Netflix' }, // El cuerpo en llamas
  { tmdbId: 66732, providerId: 'netflix', platform: 'Netflix' }, // Stranger Things
  { tmdbId: 76479, providerId: 'prime', platform: 'Prime Video' }, // The Boys
  { tmdbId: 1399, providerId: 'hbomax', platform: 'HBO Max' }, // Juego de Tronos
  { tmdbId: 95396, providerId: 'apple', platform: 'Apple TV+' }, // Severance (Separación)
  { tmdbId: 125988, providerId: 'apple', platform: 'Apple TV+' }, // Silo
  { tmdbId: 62099, providerId: 'hbomax', platform: 'RTVE / HBO' }, // El Ministerio del Tiempo
  { tmdbId: 93405, providerId: 'netflix', platform: 'Netflix' }, // El juego del calamar
];

const CURATED_CASTELLANO_MOVIE_SEEDS: {
  tmdbId: number;
  providerId: string;
  platform: string;
}[] = [
  { tmdbId: 906126, providerId: 'netflix', platform: 'Netflix' }, // La sociedad de la nieve
  { tmdbId: 1154766, providerId: 'movistar', platform: 'Movistar+' }, // La infiltrada
  { tmdbId: 1125510, providerId: 'netflix', platform: 'Netflix' }, // El hoyo 2
  { tmdbId: 693134, providerId: 'hbomax', platform: 'HBO Max' }, // Dune: Parte Dos
  { tmdbId: 558449, providerId: 'movistar', platform: 'Movistar+' }, // Gladiator II
  { tmdbId: 533535, providerId: 'disney', platform: 'Disney+' }, // Deadpool y Lobezno
  { tmdbId: 1022789, providerId: 'disney', platform: 'Disney+' }, // Del revés 2 (Inside Out 2)
  { tmdbId: 762504, providerId: 'movistar', platform: 'Movistar+' }, // As bestas
  { tmdbId: 1059264, providerId: 'movistar', platform: 'Movistar+' }, // CampeoneX
  { tmdbId: 872585, providerId: 'skyshowtime', platform: 'SkyShowtime' }, // Oppenheimer
  { tmdbId: 1184918, providerId: 'movistar', platform: 'Movistar+' }, // Robot salvaje
  { tmdbId: 912649, providerId: 'movistar', platform: 'Movistar+' }, // Venom: El último baile
];

const castellanoSeedHydrationCache = new LruTtlCache<string, { item: any; ts: number }>(
  200,
  6 * 60 * 60 * 1000
);
const castellanoCatalogCache = new LruTtlCache<string, { items: any[]; hasMore: boolean; ts: number }>(
  120,
  15 * 60 * 1000
);

async function hydrateCastellanoSeed(
  tmdbId: number,
  mediaType: 'tv' | 'movie',
  providerId: string,
  platform: string
): Promise<any | null> {
  const key = `${mediaType}:${tmdbId}`;
  const cached = castellanoSeedHydrationCache.get(key);
  if (cached && Date.now() - cached.ts < 6 * 60 * 60 * 1000) {
    return cached.item;
  }
  try {
    const url =
      mediaType === 'tv'
        ? `https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${TMDB_API_KEY}&language=es-ES`
        : `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${TMDB_API_KEY}&language=es-ES`;
    const res = await fetch(url, { signal: AbortSignal.timeout(3500) });
    if (!res.ok) return null;
    const m: any = await res.json();
    if (!m?.id || (!m.poster_path && !m.backdrop_path)) return null;

    const item = {
      id: `castellano-${mediaType}-${m.id}`,
      tmdbId: m.id,
      mediaType,
      title: m.name || m.title || m.original_name || m.original_title || 'Título',
      originalTitle: m.original_name || m.original_title || m.name || m.title || '',
      year: String(m.first_air_date || m.release_date || '').split('-')[0] || 'HD',
      rating: m.vote_average ? Number(m.vote_average).toFixed(1) : '',
      overview:
        m.overview ||
        'Disponible en Castellano (Español de España) 1080p sin anuncios.',
      poster: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : '',
      backdrop: m.backdrop_path ? `https://image.tmdb.org/t/p/w1280${m.backdrop_path}` : '',
      bingetrixUrl:
        mediaType === 'movie' ? `https://bingetrix.sc/watch/${m.id}` : undefined,
      languages: ['Castellano', 'VOSE', 'EN'],
      platform,
      providerId,
    };
    castellanoSeedHydrationCache.set(key, { item, ts: Date.now() });
    return item;
  } catch {
    return null;
  }
}

app.get('/api/catalog/castellano', async (req, res) => {
  try {
    const kind = String(req.query.kind || 'all').toLowerCase(); // 'all' | 'series' | 'movies'
    const provider = String(req.query.provider || 'all').toLowerCase();
    const category = String(req.query.category || 'trending').toLowerCase();
    const query = String(req.query.query || '').trim();
    const page = Math.max(1, Math.min(50, parseInt(String(req.query.page || '1'), 10) || 1));

    const cacheKey = `${kind}|${provider}|${category}|${page}|${query.toLowerCase()}`;
    const cached = castellanoCatalogCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < 5 * 60 * 1000) {
      return res.json({
        success: true,
        items: cached.items,
        hasMore: cached.hasMore,
        page,
      });
    }

    const provCfg = STREAMING_PROVIDER_MAP[provider];
    const items: any[] = [];
    const seenKeys = new Set<string>();

    const pushUnique = (entry: any) => {
      if (!entry || (!entry.poster && !entry.backdrop)) return;
      const k = `${entry.mediaType || 'movie'}:${entry.tmdbId || normalizeTitleForMatch(entry.title || '')}`;
      if (seenKeys.has(k)) return;
      seenKeys.add(k);
      items.push({
        ...entry,
        languages: Array.from(new Set(['Castellano', ...(entry.languages || [])])),
      });
    };

    // 1. On Page 1 with no search query (or matching provider), inject curated Castellano flagship titles first
    if (page === 1 && !query && (category === 'trending' || category === 'popular')) {
      const wantSeries = kind === 'all' || kind === 'series';
      const wantMovies = kind === 'all' || kind === 'movies';

      const seriesSeeds = wantSeries
        ? CURATED_CASTELLANO_SERIES_SEEDS.filter(
            (s) => provider === 'all' || s.providerId === provider
          )
        : [];
      const movieSeeds = wantMovies
        ? CURATED_CASTELLANO_MOVIE_SEEDS.filter(
            (m) => provider === 'all' || m.providerId === provider
          )
        : [];

      const [hydratedSeries, hydratedMovies] = await Promise.all([
        Promise.all(
          seriesSeeds.map((s) =>
            hydrateCastellanoSeed(s.tmdbId, 'tv', s.providerId, s.platform)
          )
        ),
        Promise.all(
          movieSeeds.map((m) =>
            hydrateCastellanoSeed(m.tmdbId, 'movie', m.providerId, m.platform)
          )
        ),
      ]);

      if (kind === 'series') {
        hydratedSeries.forEach(pushUnique);
      } else if (kind === 'movies') {
        hydratedMovies.forEach(pushUnique);
      } else {
        const maxLen = Math.max(hydratedSeries.length, hydratedMovies.length);
        for (let i = 0; i < maxLen; i++) {
          if (hydratedSeries[i]) pushUnique(hydratedSeries[i]);
          if (hydratedMovies[i]) pushUnique(hydratedMovies[i]);
        }
      }
    }

    // 2. Discover / Search Spain-distributed & Spanish-origin Series & Movies from TMDB (`es-ES`, `watch_region=ES`)
    const todayIso = new Date().toISOString().split('T')[0];
    const buildTmdbDiscoverUrl = (mType: 'tv' | 'movie') => {
      if (query) {
        return `https://api.themoviedb.org/3/search/${mType}?api_key=${TMDB_API_KEY}&language=es-ES&query=${encodeURIComponent(
          query
        )}&page=${page}&include_adult=false`;
      }
      const params = new URLSearchParams({
        api_key: TMDB_API_KEY,
        language: 'es-ES',
        page: String(page),
        include_adult: 'false',
        watch_region: 'ES',
        with_watch_monetization_types: 'flatrate|free|ads|rent|buy',
      });
      if (mType === 'movie') {
        params.set('primary_release_date.lte', todayIso);
      } else {
        params.set('first_air_date.lte', todayIso);
      }
      if (provCfg) {
        params.set('with_watch_providers', provCfg.id);
      }
      if (category === 'spanish_originals') {
        params.set('with_origin_country', 'ES');
        params.set('sort_by', 'popularity.desc');
      } else if (category === 'top_rated') {
        params.set('sort_by', 'vote_average.desc');
        params.set('vote_count.gte', '200');
      } else {
        params.set('sort_by', 'popularity.desc');
        params.set('vote_count.gte', '40');
      }
      const movieGenreMap: Record<string, string> = {
        action: '28',
        drama: '18',
        thriller: '53',
        comedy: '35',
        scifi: '878',
        horror: '27',
      };
      const tvGenreMap: Record<string, string> = {
        action: '10759',
        drama: '18',
        thriller: '80,9648',
        comedy: '35',
        scifi: '10765',
        horror: '9648',
      };
      const gVal = mType === 'tv' ? tvGenreMap[category] : movieGenreMap[category];
      if (gVal) params.set('with_genres', gVal);

      return `https://api.themoviedb.org/3/discover/${mType}?${params.toString()}`;
    };

    const [tvRes, movRes, movidyData] = await Promise.all([
      kind === 'all' || kind === 'series'
        ? fetch(buildTmdbDiscoverUrl('tv'), { signal: AbortSignal.timeout(4500) })
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null)
        : Promise.resolve(null),
      kind === 'all' || kind === 'movies'
        ? fetch(buildTmdbDiscoverUrl('movie'), { signal: AbortSignal.timeout(4500) })
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null)
        : Promise.resolve(null),
      (kind === 'all' || kind === 'movies') && provider === 'all' && category !== 'spanish_originals'
        ? scrapeMovidyCatalog({ category: 'trending', page, query }).catch(() => ({
            movies: [],
            hasMore: false,
          }))
        : Promise.resolve({ movies: [], hasMore: false }),
    ]);

    const movidyCastellanoFiltered = query
      ? movidyData.movies.filter(
          (mv) => scoreTitleRelevance(mv.title, mv.originalTitle, query) >= 70
        )
      : movidyData.movies;

    for (const mv of movidyCastellanoFiltered.slice(0, 12)) {
      pushUnique({
        ...mv,
        mediaType: 'movie',
        languages: ['Castellano', 'Latino', 'VOSE'],
      });
    }

    if (page === 1 || query) {
      const vestEntries = listVestCatalogEntries({
        mediaType: kind === 'series' ? 'tv' : kind === 'movies' ? 'movie' : 'all',
        query,
      });
      for (const ve of vestEntries) {
        pushUnique(ve);
      }
    }

    const mapTmdbEntry = (raw: any, mType: 'tv' | 'movie') => {
      if (!raw?.id || (!raw.poster_path && !raw.backdrop_path)) return null;
      return {
        id: `castellano-${mType}-${raw.id}`,
        tmdbId: raw.id,
        mediaType: mType,
        title: raw.name || raw.title || raw.original_name || raw.original_title || 'Título',
        originalTitle: raw.original_name || raw.original_title || '',
        year: String(raw.first_air_date || raw.release_date || '').split('-')[0] || 'HD',
        rating: raw.vote_average ? Number(raw.vote_average).toFixed(1) : '',
        overview:
          raw.overview ||
          'Disponible en Castellano (Español de España) y VO Subtitulado en 1080p.',
        poster: raw.poster_path ? `https://image.tmdb.org/t/p/w500${raw.poster_path}` : '',
        backdrop: raw.backdrop_path
          ? `https://image.tmdb.org/t/p/w1280${raw.backdrop_path}`
          : '',
        bingetrixUrl: mType === 'movie' ? `https://bingetrix.sc/watch/${raw.id}` : undefined,
        languages: ['Castellano', 'VOSE', 'EN'],
        platform: provCfg?.label || (category === 'spanish_originals' ? 'España' : undefined),
        providerId: provCfg ? provider : undefined,
      };
    };

    const tvArr: any[] = Array.isArray(tvRes?.results) ? tvRes.results : [];
    const movArr: any[] = Array.isArray(movRes?.results) ? movRes.results : [];
    const maxDisc = Math.max(tvArr.length, movArr.length);
    for (let i = 0; i < maxDisc; i++) {
      if (tvArr[i]) pushUnique(mapTmdbEntry(tvArr[i], 'tv'));
      if (movArr[i]) pushUnique(mapTmdbEntry(movArr[i], 'movie'));
    }

    if (query) {
      const wantType = kind === 'series' ? 'tv' : kind === 'movies' ? 'movie' : 'all';
      const fallbackEntries = await liveOnDemandFallbackSearch(query, wantType);
      for (const fe of fallbackEntries) pushUnique(fe);
      items.sort(
        (a, b) =>
          scoreTitleRelevance(b.title, b.originalTitle, query, { altTitle: b.altTitle }) -
          scoreTitleRelevance(a.title, a.originalTitle, query, { altTitle: a.altTitle })
      );
    }

    const hasMore =
      page < Math.max(Number(tvRes?.total_pages || 1), Number(movRes?.total_pages || 1));

    castellanoCatalogCache.set(cacheKey, { items, hasMore, ts: Date.now() });
    res.json({ success: true, items, hasMore, page });
  } catch (err) {
    console.error('Castellano catalog error:', err);
    res.status(500).json({ success: false, items: [], hasMore: false });
  }
});

// ============================================================================
// REST API: "TOT L'ANIME EN CATALÀ EN UN SOL LLOC" (/api/catalog/catala)
// Unifies Archive.org Catalan Anime Packs + 3Cat/SX3 Live & On-Demand in one place
// ============================================================================
interface CatalaPackSeasonDef {
  seasonNumber: number;
  name: string;
  archiveId?: string;
  ccmaProgramId?: string;
  audioNote?: string;
  customEpisodes?: any[];
}

interface CatalaAnimeEntryDef {
  id: string;
  titleCat: string;
  originalTitle: string;
  aliases?: string;
  tmdbId?: number;
  tmdbType?: 'tv' | 'movie';
  category: 'classics' | 'shonen' | 'movies';
  eraTag: string;
  episodeHint: string;
  overviewCat: string;
  fallbackPoster?: string;
  seasons: CatalaPackSeasonDef[];
}

const CATALA_ANIME_REGISTRY: CatalaAnimeEntryDef[] = [
  {
    id: 'combat-xiaolin',
    titleCat: 'Combat Xiaolin (Combat Xaolín)',
    originalTitle: 'Xiaolin Showdown',
    aliases: 'combat xaolin combat xiaolin duelo xiaolin xiaolin showdown k3 3xl omi raimundo kimiko clay shen gong wu',
    tmdbId: 679,
    tmdbType: 'tv',
    category: 'shonen',
    eraTag: 'K3 / 3XL · Arxiu + Sèrie',
    episodeHint: 'Arxiu Català K3 + 52 capítols MP4',
    overviewCat:
      "L'Omi, en Raimundo, la Kimiko i en Clay entrenant al Temple Xiaolin per protegir els Shen Gong Wu contra en Jack Spicer i la Wuya. Inclou l'arxiu conservat en català del K3 i els 52 capítols complets en reproducció directa MP4.",
    seasons: [
      {
        seasonNumber: 1,
        name: 'Arxiu K3 en Català (Openings i Clips)',
        customEpisodes: [
          {
            id: 'xiaolin-cat-op1',
            episodeNumber: 1,
            detectedNumber: 1,
            seasonNumber: 1,
            title: 'Opening 1 Oficial en Català (Emissió K3 / TV3)',
            overview: 'Careta d’entrada original en català emesa pel canal K3 / Super3.',
            still: 'https://i.ytimg.com/vi/oRvYwMsGAZQ/hqdefault.jpg',
            runtime: 1,
            youtubeVideoId: 'oRvYwMsGAZQ',
            streamUrl: 'oRvYwMsGAZQ',
            audioNote: 'Doblatge Original Català (K3)',
            sourceType: 'youtube',
          },
          {
            id: 'xiaolin-cat-intro2',
            episodeNumber: 2,
            detectedNumber: 2,
            seasonNumber: 1,
            title: 'Intro Televisió de Catalunya · Combat Xiaolin',
            overview: 'Versió televisiva conservada de la sintonia en català del canal K3.',
            still: 'https://i.ytimg.com/vi/RO7SwnPHKAk/hqdefault.jpg',
            runtime: 1,
            youtubeVideoId: 'RO7SwnPHKAk',
            streamUrl: 'RO7SwnPHKAk',
            audioNote: 'Doblatge Original Català (K3)',
            sourceType: 'youtube',
          },
          {
            id: 'xiaolin-cat-k3promo',
            episodeNumber: 3,
            detectedNumber: 3,
            seasonNumber: 1,
            title: 'Especial K3 Arts Marcials · Combat Xiaolin & Jackie Chan',
            overview: 'Fragment nostàlgic d’emissió de les sèries d’arts marcials en català al K3.',
            still: 'https://i.ytimg.com/vi/J9fNCr05ij8/hqdefault.jpg',
            runtime: 2,
            youtubeVideoId: 'J9fNCr05ij8',
            streamUrl: 'J9fNCr05ij8',
            audioNote: 'Arxiu Històric K3 Català',
            sourceType: 'youtube',
          },
          {
            id: 'xiaolin-cat-op-alt',
            episodeNumber: 4,
            detectedNumber: 4,
            seasonNumber: 1,
            title: 'Sintonia Clàssica · Combat Xiaolin (Remaster)',
            overview: ' Versió neta de l’opening de Combat Xiaolin.',
            still: 'https://i.ytimg.com/vi/v9URlfv_JDI/hqdefault.jpg',
            runtime: 1,
            youtubeVideoId: 'v9URlfv_JDI',
            streamUrl: 'v9URlfv_JDI',
            audioNote: 'Arxiu Català (K3)',
            sourceType: 'youtube',
          },
        ],
      },
      {
        seasonNumber: 2,
        name: 'Sèrie Completa · 52 Capítols (MP4 Directe)',
        archiveId: 'Dueloxiaolinlat',
        audioNote: 'Sèrie Completa MP4 (Àudio alternatiu · Rip K3 només a eMule TotsRucs)',
      },
    ],
  },
  {
    id: 'bola-de-drac',
    titleCat: 'Bola de Drac',
    originalTitle: 'Dragon Ball',
    tmdbId: 12609,
    tmdbType: 'tv',
    category: 'classics',
    eraTag: 'TV3 · Clàssic Complet',
    episodeHint: '153 capítols en català',
    overviewCat:
      "Les aventures d'en Son Goku i la Bulma buscant les set Boles de Drac amb el doblatge històric en català de TV3.",
    seasons: [{ seasonNumber: 1, name: 'Sèrie Completa (1–153)', archiveId: 'boladedrac-cat' }],
  },
  {
    id: 'bola-de-drac-z',
    titleCat: 'Bola de Drac Z',
    originalTitle: 'Dragon Ball Z',
    tmdbId: 12971,
    tmdbType: 'tv',
    category: 'shonen',
    eraTag: 'TV3 / 3XL · HD Català',
    episodeHint: '291 capítols en català',
    overviewCat:
      'Totes les sagues dels Saiyans, Freezer, Cèl·lula i Majin Buu íntegres amb àudio en català i valencià.',
    seasons: [
      { seasonNumber: 1, name: 'Temporada 1 · Saiyans i Namek', archiveId: 'boladedracz-1' },
      { seasonNumber: 2, name: 'Temporada 2 · Freezer i Androides', archiveId: 'boladedracz-2' },
      {
        seasonNumber: 3,
        name: 'Temporada 3 · Cèl·lula i Majin Buu (1080p)',
        archiveId: 'anime-en-valencia-bola-de-drac-z-hd-1080p-multi-214',
      },
    ],
  },
  {
    id: 'bola-de-drac-gt',
    titleCat: 'Bola de Drac GT',
    originalTitle: 'Dragon Ball GT',
    tmdbId: 12697,
    tmdbType: 'tv',
    category: 'shonen',
    eraTag: 'K3 / 3XL · Català',
    episodeHint: '64 capítols en català',
    overviewCat:
      'El gran viatge espacial d’en Son Goku, la Pan i en Trunks contra Baby i els Dracs Malignes en català.',
    seasons: [{ seasonNumber: 1, name: 'Sèrie Completa (1–64)', archiveId: 'bola-de-drac-gt' }],
  },
  {
    id: 'bola-de-drac-super-sx3',
    titleCat: 'Bola de Drac Súper',
    originalTitle: 'Dragon Ball Super',
    tmdbId: 62715,
    tmdbType: 'tv',
    category: 'shonen',
    eraTag: 'SX3 / 3Cat · Català',
    episodeHint: '131 capítols en català',
    overviewCat:
      'La nova etapa oficial doblada en català pel SX3 (3Cat): el Torneig del Poder, Beerus, Goku Black i Ultra Instint.',
    seasons: [{ seasonNumber: 1, name: 'SX3 Català (Capítols Oficials)', ccmaProgramId: '73476' }],
  },
  {
    id: 'one-piece-sx3',
    titleCat: 'One Piece (Català)',
    originalTitle: 'One Piece',
    tmdbId: 37854,
    tmdbType: 'tv',
    category: 'shonen',
    eraTag: 'SX3 / K3 · Català',
    episodeHint: '+220 capítols en català',
    overviewCat:
      'En Monkey D. Ruffy i la tripulació del Barret de Palla en català (emissió oficial SX3 / 3Cat).',
    seasons: [
      { seasonNumber: 1, name: 'SX3 Català (Sagues en Emissió)', ccmaProgramId: '201374971' },
    ],
  },
  {
    id: 'dr-slump',
    titleCat: 'Dr. Slump',
    originalTitle: 'Dr. Slump Arale-chan',
    tmdbId: 30723,
    tmdbType: 'tv',
    category: 'classics',
    eraTag: 'TV3 · Mític Català',
    episodeHint: '243 capítols en català',
    overviewCat:
      "L'Arale Norimaki, en Senbei i tota la Vila del Pingüí amb el llegendari doblatge català de TV3.",
    seasons: [
      { seasonNumber: 1, name: 'Pack 1 (Capítols 1–50)', archiveId: 'drslump-1' },
      { seasonNumber: 2, name: 'Pack 2 (Capítols 51–100)', archiveId: 'drslump-2' },
      { seasonNumber: 3, name: 'Pack 3 (Capítols 101–150)', archiveId: 'drslump-3' },
      { seasonNumber: 4, name: 'Pack 4 (Capítols 151–200)', archiveId: 'dr-slump-4' },
      { seasonNumber: 5, name: 'Pack 5 (Capítols 201–243)', archiveId: 'drslump-cat-5' },
    ],
  },
  {
    id: 'detectiu-conan',
    titleCat: 'El Detectiu Conan',
    originalTitle: 'Meitantei Conan',
    tmdbId: 30983,
    tmdbType: 'tv',
    category: 'classics',
    eraTag: 'K3 / Super3 / SX3',
    episodeHint: '9 Temporades en català',
    overviewCat:
      'En Shinichi Kudo convertit en Conan Edogawa resolent els casos més complexos amb el mític doblatge català.',
    seasons: [
      {
        seasonNumber: 1,
        name: 'Temporada 1',
        archiveId: 'episodi-1-el-detectiu-mes-famos-daquest-segle_202607',
      },
      {
        seasonNumber: 2,
        name: 'Temporada 2',
        archiveId: 'episodi-1-el-segrest-den-conan-edogawa',
      },
      { seasonNumber: 3, name: 'Temporada 3', archiveId: 'episodi-1-el-cas-del-segrest' },
      {
        seasonNumber: 4,
        name: 'Temporada 9',
        archiveId: 'episodi-14-el-petit-client-primera-part',
      },
      {
        seasonNumber: 5,
        name: 'Temporada 10',
        archiveId: 'episodi-1-lobjectiu-es-en-kogoro-mouri',
      },
      {
        seasonNumber: 6,
        name: 'Temporada 11 · Impacte Negre',
        archiveId: 'episodis-1-2-3-4-5-impacte-negre-a-labast-dels-bracos-de-la-organitzacio',
      },
      {
        seasonNumber: 7,
        name: 'Temporada 12',
        archiveId: 'episodi-1-la-gran-operacio-de-1r-b',
      },
      {
        seasonNumber: 8,
        name: 'Temporada 13 · Vermell i Negre',
        archiveId: 'episodi-1-el-xoc-entre-el-vermell-i-el-negre-lorigen',
      },
      {
        seasonNumber: 9,
        name: 'Temporada 14',
        archiveId: 'episodi-1-shinichi-kudo-lassassi-primera-part',
      },
    ],
  },
  {
    id: 'sakura-cacadora-cartes',
    titleCat: 'Sakura, la caçadora de cartes',
    originalTitle: 'Cardcaptor Sakura',
    tmdbId: 46261,
    tmdbType: 'tv',
    category: 'classics',
    eraTag: 'K3 / SX3 · Sèrie Completa',
    episodeHint: '70 capítols en català',
    overviewCat:
      'La Sakura Kinomoto i en Keroberos reunint totes les cartes de Clow amb el doblatge íntegre en català.',
    seasons: [
      {
        seasonNumber: 1,
        name: 'Sèrie Completa (1–70)',
        archiveId: 'sakura-la-cacadora-de-cartes-episodi-1-sakura-i-el-misterios-llibre-magic',
      },
    ],
  },
  {
    id: 'guardians-de-la-nit',
    titleCat: 'Guardians de la Nit (Kimetsu no Yaiba)',
    originalTitle: 'Kimetsu no Yaiba',
    tmdbId: 85937,
    tmdbType: 'tv',
    category: 'shonen',
    eraTag: 'SX3 · Doblatge Català HD',
    episodeHint: 'Temporada 1 en català',
    overviewCat:
      'En Tanjiro Kamado i la Nezuko en la seva lluita contra els dimonis amb doblatge en català d’alta definició.',
    seasons: [{ seasonNumber: 1, name: 'Temporada 1 (Català HD)', archiveId: 'episodi-1-crueltat' }],
  },
  {
    id: 'death-note-cat',
    titleCat: 'Death Note',
    originalTitle: 'Death Note',
    tmdbId: 13916,
    tmdbType: 'tv',
    category: 'shonen',
    eraTag: 'Canal 3XL · Complet',
    episodeHint: '37 capítols en català',
    overviewCat:
      'El duel psicològic entre en Light Yagami (Kira) i L amb el doblatge oficial en català del mític Canal 3XL.',
    seasons: [{ seasonNumber: 1, name: 'Sèrie Completa (1–37)', archiveId: 'Death-Note-cat' }],
  },
  {
    id: 'evangelion-cat',
    titleCat: 'Neon Genesis Evangelion',
    originalTitle: 'Shinseiki Evangelion',
    tmdbId: 890,
    tmdbType: 'tv',
    category: 'shonen',
    eraTag: '3XL · Obra Mestra',
    episodeHint: '26 capítols en català',
    overviewCat:
      'En Shinji Ikari, la Rei Ayanami i l’Asuka pilotant els EVA a Tòquio-3 amb el doblatge clàssic en català.',
    seasons: [{ seasonNumber: 1, name: 'Sèrie Completa (1–26)', archiveId: 'ngecat-21' }],
  },
  {
    id: 'ranma-cat',
    titleCat: 'Ranma ½',
    originalTitle: 'Ranma ½',
    tmdbId: 42501,
    tmdbType: 'tv',
    category: 'classics',
    eraTag: 'TV3 / K3 · Complet',
    episodeHint: '161 capítols en català',
    overviewCat:
      'Arts marcials, humor i les fonts maleïdes de Jusenkyo amb en Ranma Saotome i l’Akane Tendo en català.',
    seasons: [{ seasonNumber: 1, name: 'Sèrie Completa (1–161)', archiveId: 'ranma161cat' }],
  },
  {
    id: 'shin-chan-cat',
    titleCat: 'Shin-chan',
    originalTitle: 'Crayon Shin-chan',
    tmdbId: 54041,
    tmdbType: 'tv',
    category: 'classics',
    eraTag: 'K3 / 3XL · Català',
    episodeHint: '458 capítols en català',
    overviewCat:
      'Les trapelleries d’en Shinnosuke Nohara, la Misae, l’Hiroshi i el Nevado amb el doblatge català més estimat.',
    seasons: [
      { seasonNumber: 1, name: 'Col·lecció Català (458 cap.)', archiveId: 'shin-chan-catala-japanese' },
    ],
  },
  {
    id: 'inuyasha-cat',
    titleCat: 'Musculman (Kinnikuman)',
    originalTitle: 'Kinnikuman',
    tmdbId: 44213,
    tmdbType: 'tv',
    category: 'classics',
    eraTag: 'TV3 / 33 · Clàssic',
    episodeHint: '136 capítols en català',
    overviewCat:
      'El superheroi més esbojarrat del ring i l’all amb arròs amb el doblatge llegendari en català.',
    seasons: [
      { seasonNumber: 1, name: 'Sèrie Completa (136 cap.)', archiveId: 'musculman-audio-catala' },
    ],
  },
  {
    id: 'yu-yu-hakusho-cat',
    titleCat: 'Yu Yu Hakusho · Els Defensors del Més Enllà',
    originalTitle: 'Yu Yu Hakusho',
    tmdbId: 30669,
    tmdbType: 'tv',
    category: 'shonen',
    eraTag: 'K3 / 3XL · Català',
    episodeHint: 'Sagues completes en català',
    overviewCat:
      'En Yusuke Urameshi, en Kuwabara, en Kurama i en Hiei al Torneig Fosc amb el doblatge mític en català.',
    seasons: [{ seasonNumber: 1, name: 'Episodis en Català', archiveId: 'yu-yu-hakusho-part-2' }],
  },
  {
    id: 'trigun-cat',
    titleCat: "Trigun '98",
    originalTitle: 'Trigun',
    tmdbId: 46896,
    tmdbType: 'tv',
    category: 'shonen',
    eraTag: '3XL · Sèrie Completa',
    episodeHint: '26 capítols en català',
    overviewCat:
      'En Vash l’Estampida travessant el desert de Gunsmoke amb l’emblemàtic doblatge en català del 3XL.',
    seasons: [{ seasonNumber: 1, name: 'Sèrie Completa (1–26)', archiveId: '05-el-puny-mortal' }],
  },
  {
    id: 'bobobo-cat',
    titleCat: 'Bo-Bobo',
    originalTitle: 'Bobobo-bo Bo-bobo',
    tmdbId: 34857,
    tmdbType: 'tv',
    category: 'classics',
    eraTag: 'K3 · Humor Absurd',
    episodeHint: 'Sèrie en català',
    overviewCat:
      'El combat pels cabells i l’humor més surrealista amb un dels doblatges catalans més recordats del K3.',
    seasons: [{ seasonNumber: 1, name: 'Capítols en Català', archiveId: 'Bo-Bobo-cat' }],
  },
  {
    id: 'flcl-cat',
    titleCat: 'FLCL (Furi Kuri)',
    originalTitle: 'FLCL',
    tmdbId: 21437,
    tmdbType: 'tv',
    category: 'shonen',
    eraTag: '3XL · Gainax OVAs',
    episodeHint: '6 OVAs completes en català',
    overviewCat:
      'La Haruko Haruhara, en Naota i la música de The Pillows en l’obra de culte de Gainax doblada al català.',
    seasons: [{ seasonNumber: 1, name: 'OVAs Completes (1–6)', archiveId: 'flcl-cat' }],
  },
  {
    id: 'conan-noi-del-futur',
    titleCat: 'Conan, el noi del futur',
    originalTitle: 'Mirai Shonen Conan',
    tmdbId: 2004,
    tmdbType: 'tv',
    category: 'classics',
    eraTag: 'Hayao Miyazaki · Català',
    episodeHint: '26 capítols en català',
    overviewCat:
      'La primera gran sèrie dirigida per Hayao Miyazaki, amb en Conan i la Lana en un món postapocalíptic en català.',
    seasons: [{ seasonNumber: 1, name: 'Sèrie Completa (1–26)', archiveId: 'conan-el-noi-del-futur' }],
  },
  {
    id: 'capita-harlock-cat',
    titleCat: 'El Capità Harlock',
    originalTitle: 'Uchuu Kaizoku Captain Harlock',
    tmdbId: 20420,
    tmdbType: 'tv',
    category: 'classics',
    eraTag: 'TV3 · Leiji Matsumoto',
    episodeHint: 'Sèrie clàssica en català',
    overviewCat:
      'El pirata espacial de l’Arcàdia lluitant per la llibertat de la Terra amb el doblatge clàssic català.',
    seasons: [{ seasonNumber: 1, name: 'Sèrie en Català', archiveId: 'el-capita-harlock-cat' }],
  },
  {
    id: 'lamu-urusei-yatsura',
    titleCat: 'Lamu (Urusei Yatsura)',
    originalTitle: 'Urusei Yatsura',
    tmdbId: 34005,
    tmdbType: 'tv',
    category: 'classics',
    eraTag: 'TV3 / 33 · Rumiko Takahashi',
    episodeHint: 'Capítols en català',
    overviewCat:
      "L'extraterrestre Lamu i el malaurat Ataru Moroboshi en la comèdia clàssica de Rumiko Takahashi en català.",
    seasons: [{ seasonNumber: 1, name: 'Episodis en Català', archiveId: 'urusei-yatsura-lamu' }],
  },
  {
    id: 'corrector-yui-cat',
    titleCat: 'Corrector Yui',
    originalTitle: 'Corrector Yui',
    tmdbId: 44903,
    tmdbType: 'tv',
    category: 'classics',
    eraTag: 'K3 · Sèrie Completa',
    episodeHint: '2 Temporades en català',
    overviewCat:
      'La Yui Kasuga viatjant per la xarxa ComNet per protegir el món digital amb el doblatge del K3.',
    seasons: [
      {
        seasonNumber: 1,
        name: 'Box 1 (Temporada 1)',
        archiveId: 'corrector-yui-16-box-1-dvd-4-01-c-cat-jap-by-el-millor-anime',
      },
      {
        seasonNumber: 2,
        name: 'Box 2 (Temporada 2)',
        archiveId: 'corrector-yui-33-box-2-dvd-2-02-c-cat-jap-by-el-millor-anime',
      },
    ],
  },
  {
    id: 'magica-doremi-cat',
    titleCat: 'La Màgica DoReMi (+ Naisho i Pel·lícula)',
    originalTitle: 'Ojamajo Doremi',
    aliases: 'doremi naisho totsrucs buscant la magica doremi',
    tmdbId: 42705,
    tmdbType: 'tv',
    category: 'classics',
    eraTag: 'K3 / TotsRucs · 1080p',
    episodeHint: 'Sèrie + 13 OVAs + Pel·lícula',
    overviewCat:
      'La Doremi, la Hazuki i l’Aiko convertides en aprenentes de bruixa en català, incloent les 13 OVAs de Naisho i la pel·lícula de TotsRucs.',
    seasons: [
      {
        seasonNumber: 1,
        name: 'Edició 1080p Català',
        archiveId: 'buscant-la-magica-doremi-bdmv-1080p-cat-jap-by-el-millor-anime',
      },
      {
        seasonNumber: 2,
        name: 'DoReMi Naisho · 13 OVAs en Català',
        archiveId: 'doreminaisho.cat',
      },
      {
        seasonNumber: 3,
        name: 'Pel·lícula · Buscant la Màgica DoReMi (TotsRucs)',
        archiveId: 'buscando-a-la-magica-doremi-adria-tots-rucs_202609',
      },
    ],
  },
  {
    id: 'fushigi-yuugi-cat',
    titleCat: 'Fushigi Yuugi · El Joc Misteriós',
    originalTitle: 'Fushigi Yuugi',
    tmdbId: 31687,
    tmdbType: 'tv',
    category: 'classics',
    eraTag: '3XL / K3 · 2 Temporades',
    episodeHint: '52 capítols en català',
    overviewCat:
      'La Miaka i la Yui transportades a l’interior del llibre dels Quatre Déus amb doblatge íntegre en català.',
    seasons: [
      {
        seasonNumber: 1,
        name: 'Temporada 1 (Català)',
        archiveId: 'fushigi-yuugi-o-el-joc-misterios-01-dvd-raw-480cat-jap-by-taketokun-el-millor-anime',
      },
      {
        seasonNumber: 2,
        name: 'Temporada 2 (Català)',
        archiveId: 'fushigi-yuugi-o-el-joc-misterios-02-dvd-raw-480cat-jap-by-taketokun-el-millor-anime',
      },
    ],
  },
  {
    id: 'cinturo-negre-yawara',
    titleCat: 'Cinturó Negre (Yawara!)',
    originalTitle: 'Yawara! A Fashionable Judo Girl',
    tmdbId: 42992,
    tmdbType: 'tv',
    category: 'classics',
    eraTag: 'TV3 / Canal 9 · Judo',
    episodeHint: '117 capítols',
    overviewCat:
      "L'obra de Naoki Urasawa sobre el talent prodigiós de la jove judoka Yawara Inokuma.",
    seasons: [
      {
        seasonNumber: 1,
        name: 'Sèrie Completa (117 cap.)',
        archiveId: 'cinturo-negre-ginger-yawara-117-val-dvd-vhs-by-angelus-oriol-per-a-ficcioenvalencia',
      },
    ],
  },
  {
    id: 'street-fighter-2-v',
    titleCat: 'Street Fighter II V',
    originalTitle: 'Street Fighter II V',
    tmdbId: 19611,
    tmdbType: 'tv',
    category: 'shonen',
    eraTag: '3XL · Sèrie Completa',
    episodeHint: '29 capítols en català',
    overviewCat:
      'En Ryu i en Ken recorrent el món per perfeccionar el seu estil de lluita contra Shadaloo i M. Bison en català.',
    seasons: [
      { seasonNumber: 1, name: 'Sèrie Completa', archiveId: 'street-fighter-2-audio-catala' },
    ],
  },
  {
    id: 'haikyu-sx3',
    titleCat: 'Haikyu!! (Català)',
    originalTitle: 'Haikyu!!',
    tmdbId: 60863,
    tmdbType: 'tv',
    category: 'shonen',
    eraTag: 'SX3 · Voleibol HD',
    episodeHint: 'Emissió SX3 en català',
    overviewCat:
      'En Shoyo Hinata i en Tobio Kageyama portant l’institut Karasuno al cim del voleibol japonès en català.',
    seasons: [{ seasonNumber: 1, name: 'SX3 Català Oficial', ccmaProgramId: '64916' }],
  },
  // --- PEL·LÍCULES I ESPECIALS D'ANIME EN CATALÀ ---
  {
    id: 'bola-de-drac-especials',
    titleCat: 'Bola de Drac · Pel·lícules i Especials',
    originalTitle: 'Dragon Ball Movies',
    tmdbId: 39100,
    tmdbType: 'movie',
    category: 'movies',
    eraTag: 'Col·lecció Cinema · Català',
    episodeHint: 'Pel·lícules i Especials TV',
    overviewCat:
      'Col·lecció de pel·lícules clàssiques i especials de televisió de Bola de Drac i Bola de Drac Z en català.',
    seasons: [
      { seasonNumber: 1, name: 'Pel·lícules i Especials', archiveId: 'bola-de-drac-especials' },
    ],
  },
  {
    id: 'conan-black-iron-submarine',
    titleCat: 'Detectiu Conan: Black Iron Submarine',
    originalTitle: 'Detective Conan: Black Iron Submarine',
    tmdbId: 1056360,
    tmdbType: 'movie',
    category: 'movies',
    eraTag: 'Cinema en Català · HD',
    episodeHint: 'Pel·lícula en català',
    overviewCat:
      "En Conan i l'Ai Haibara s'enfronten a l'Organització dels Homes de Negre a la instal·lació submarina d'Interpol.",
    seasons: [{ seasonNumber: 1, name: 'Pel·lícula Completa', archiveId: '1744246284468' }],
  },
  {
    id: 'conan-million-dollar-pentagram',
    titleCat: 'Detectiu Conan: The Million-dollar Pentagram',
    originalTitle: 'Detective Conan: The Million-dollar Pentagram',
    tmdbId: 1211483,
    tmdbType: 'movie',
    category: 'movies',
    eraTag: 'Estrena en Català · HD',
    episodeHint: 'Pel·lícula en català',
    overviewCat:
      'En Kaito Kid, en Heiji Hattori i en Conan Edogawa a Hakodate darrere el misteri de les espases japoneses.',
    seasons: [{ seasonNumber: 1, name: 'Pel·lícula Completa', archiveId: '1766885273493_202602' }],
  },
  {
    id: 'vull-menjar-me-el-teu-pancrees',
    titleCat: 'Vull menjar-me el teu pàncrees',
    originalTitle: 'Kimi no Suizou wo Tabetai',
    tmdbId: 504253,
    tmdbType: 'movie',
    category: 'movies',
    eraTag: 'Cinema Anime · Català',
    episodeHint: 'Pel·lícula completa',
    overviewCat:
      'Una de les pel·lícules d’animació japonesa més emotives dels últims anys, íntegra doblada en català.',
    seasons: [{ seasonNumber: 1, name: 'Pel·lícula Completa', archiveId: '20200427_20200427_1958' }],
  },
  {
    id: 'tomba-de-les-lluernes-cat',
    titleCat: 'La tomba de les lluernes (Studio Ghibli)',
    originalTitle: 'Hotaru no Haka',
    tmdbId: 12477,
    tmdbType: 'movie',
    category: 'movies',
    eraTag: 'Studio Ghibli · Català',
    episodeHint: 'Pel·lícula completa',
    overviewCat:
      "L'obra mestra d'Isao Takahata i Studio Ghibli amb doblatge en català.",
    seasons: [
      {
        seasonNumber: 1,
        name: 'Pel·lícula Completa',
        archiveId: 'LaTumbaDeLasLuciernagasDVDripAC3EspCatJapwwwlokotorrentscom',
      },
    ],
  },
  {
    id: 'ghost-in-the-shell-2-cat',
    titleCat: 'Ghost in the Shell 2: Innocence',
    originalTitle: 'Ghost in the Shell 2: Innocence',
    tmdbId: 12244,
    tmdbType: 'movie',
    category: 'movies',
    eraTag: 'Mamoru Oshii · Català',
    episodeHint: 'Pel·lícula completa',
    overviewCat:
      'En Batou i en Togusa de la Secció 9 investigant ginoides rebels en el clàssic ciberpunk en català.',
    seasons: [
      {
        seasonNumber: 1,
        name: 'Pel·lícula Completa',
        archiveId: 'ghost-in-the-shell-2-innocence-cat',
      },
    ],
  },
  {
    id: 'alita-angel-combat-cat',
    titleCat: 'Alita, Àngel de Combat (OVA 1993)',
    originalTitle: 'Gunnm',
    tmdbId: 37933,
    tmdbType: 'movie',
    category: 'movies',
    eraTag: '3XL · Cyberpunk Català',
    episodeHint: 'OVAs completes en català',
    overviewCat:
      'Les OVAs clàssiques de 1993 basades en el manga Gunnm amb el doblatge històric en català.',
    seasons: [
      { seasonNumber: 1, name: 'OVAs en Català', archiveId: 'alita-angel-de-combat-1993' },
    ],
  },
  {
    id: 'dr-slump-pelis-ovas',
    titleCat: 'Dr. Slump · Pel·lícules i OVAs',
    originalTitle: 'Dr. Slump Movies',
    tmdbId: 30723,
    tmdbType: 'tv',
    category: 'movies',
    eraTag: 'TV3 · Especials Català',
    episodeHint: 'Col·lecció Pel·lícules',
    overviewCat:
      "Totes les pel·lícules i OVAs clàssiques del Dr. Slump i l'Arale doblades al català.",
    seasons: [{ seasonNumber: 1, name: 'Pel·lícules i OVAs', archiveId: 'OVAS-PELIS-DR-SLUMP' }],
  },
  {
    id: 'wicked-city-cat',
    titleCat: 'La Ciutat Maldita (Wicked City · 1080p)',
    originalTitle: 'Youjuu Toshi',
    tmdbId: 20541,
    tmdbType: 'movie',
    category: 'movies',
    eraTag: 'Yoshiaki Kawajiri · 1080p',
    episodeHint: 'Blu-ray 1080p Català',
    overviewCat:
      'El clàssic fosc de Yoshiaki Kawajiri restaurat en Blu-ray 1080p amb àudio en català.',
    seasons: [
      {
        seasonNumber: 1,
        name: 'Blu-ray 1080p Català',
        archiveId: 'wicked-city-1987-blu-ray-1440x-1080-cat',
      },
    ],
  },
  {
    id: 'saint-seiya-santuari-cat',
    titleCat: 'Saint Seiya: La Llegenda del Santuari',
    originalTitle: 'Saint Seiya: Legend of Sanctuary',
    tmdbId: 227707,
    tmdbType: 'movie',
    category: 'movies',
    eraTag: 'Cavallers del Zodíac · Català',
    episodeHint: 'Pel·lícula en català',
    overviewCat:
      'La batalla de les Dotze Cases del Santuari amb en Seiya i els Cavallers de Bronze en català.',
    seasons: [
      {
        seasonNumber: 1,
        name: 'Pel·lícula Completa',
        archiveId: 'saint-seiya-la-llegenda-del-santuari',
      },
    ],
  },
  // --- COL·LECCIÓ TOTSRUCS / MECANOSCRIT / 3XL / K3 EN CATALÀ ---
  {
    id: 'serial-experiments-lain-cat',
    titleCat: 'Serial Experiments Lain',
    originalTitle: 'Serial Experiments Lain',
    aliases: 'lain 3xl ciberpunk totsrucs',
    tmdbId: 1087,
    tmdbType: 'tv',
    category: 'shonen',
    eraTag: 'Canal 3XL · Obra de Culte',
    episodeHint: '13 capítols HD en català',
    overviewCat:
      'La Lain Iwakura endinsant-se al Wired en una de les obres mestres més hipnòtiques i llegendàries emeses al Canal 3XL en català.',
    seasons: [
      {
        seasonNumber: 1,
        name: 'Sèrie Completa (1–13 HD Català)',
        archiveId: 'serial-experiments-lain-9-hd-catala-480p-24fps-h-264-128kbit-aac',
      },
    ],
  },
  {
    id: 'candy-candy-cat',
    titleCat: 'Candy Candy',
    originalTitle: 'Candy Candy',
    aliases: 'candy tv3 classic totsrucs',
    tmdbId: 9160,
    tmdbType: 'tv',
    category: 'classics',
    eraTag: 'TV3 · Clàssic Complet',
    episodeHint: '115 capítols en català',
    overviewCat:
      'La història clàssica i inoblidable de la Candy White amb els 115 capítols íntegres doblats en català.',
    seasons: [
      {
        seasonNumber: 1,
        name: 'Sèrie Completa (1–115 Català)',
        archiveId: 'CandyCandyCatalan',
      },
    ],
  },
  {
    id: 'reboot-cat',
    titleCat: 'ReBoot',
    originalTitle: 'ReBoot',
    aliases: 'reboot bob enzo mainframe k3 3xl totsrucs',
    tmdbId: 2121,
    tmdbType: 'tv',
    category: 'classics',
    eraTag: 'K3 / 3XL · Clàssic Digital',
    episodeHint: '39 capítols en català',
    overviewCat:
      'En Bob, la Dot i l’Enzo defensant el sistema Mainframe dels virus Megabyte i Hexadecimal amb el doblatge mític en català.',
    seasons: [
      {
        seasonNumber: 1,
        name: ' Temporades en Català (39 cap.)',
        archiveId: 'reboot_202601',
      },
    ],
  },
  {
    id: 'dome-beisbol-cat',
    titleCat: 'Dome, el petit geni del beisbol',
    originalTitle: 'Miracle Giants Dome-kun',
    aliases: 'dome beisbol tv3 k3 totsrucs',
    category: 'classics',
    eraTag: 'TV3 / K3 · Esports Clàssic',
    episodeHint: 'Sèrie completa en català',
    overviewCat:
      'En Dome新城 i els seus llançaments impossibles als Yomiuri Giants amb el doblatge clàssic en català de TV3.',
    seasons: [
      {
        seasonNumber: 1,
        name: 'Sèrie en Català',
        archiveId: 'dome-el-petit-geni-del-beisbol',
      },
    ],
  },
  {
    id: 'os-gran-casa-blava-cat',
    titleCat: "L'ós de la gran casa blava",
    originalTitle: 'Bear in the Big Blue House',
    aliases: 'os de la gran casa blava totsrucs super3 k3',
    tmdbId: 207,
    tmdbType: 'tv',
    category: 'classics',
    eraTag: 'Club Super3 · TotsRucs',
    episodeHint: '44 capítols en català',
    overviewCat:
      'El clàssic més estimat del Club Super3 rescatat per TotsRucs amb 44 episodis complets en català.',
    seasons: [
      {
        seasonNumber: 1,
        name: 'Col·lecció TotsRucs (44 cap. Català)',
        archiveId: 'los-de-la-gran-casa-blava',
      },
    ],
  },
  {
    id: 'sagwa-cat',
    titleCat: 'Sagwa, la gata siamesa',
    originalTitle: 'Sagwa, the Chinese Siamese Cat',
    aliases: 'sagwa k3 super3 totsrucs',
    tmdbId: 35104,
    tmdbType: 'tv',
    category: 'classics',
    eraTag: 'K3 / Super3 · Català',
    episodeHint: '17 episodis en català',
    overviewCat:
      'Les aventures cal·ligràfiques de la gata Sagwa amb l’emissió clàssica en català de TV3 / K3.',
    seasons: [
      {
        seasonNumber: 1,
        name: 'Episodis TV3Rip en Català',
        archiveId: 'sagwa-la-gata-siamesa-catala',
      },
    ],
  },
  {
    id: 'taro-alienigena-cat',
    titleCat: "Taro, l'alienígena",
    originalTitle: 'Uchuuujin Tanaka Tarou',
    aliases: 'taro alienigena k3 totsrucs',
    category: 'classics',
    eraTag: 'K3 · Humor Esbojarrat',
    episodeHint: 'Capítols en català',
    overviewCat:
      'Les bogeries surrealistes d’en Taro Tanaka a l’escola primària amb el doblatge en català del K3.',
    seasons: [
      {
        seasonNumber: 1,
        name: 'Capítols Conservats en Català',
        archiveId: 'taro-lalienigena-catala',
      },
    ],
  },
  {
    id: 'castell-al-cel-ghibli-cat',
    titleCat: 'El Castell al Cel (Studio Ghibli · 1080p)',
    originalTitle: 'Tenkuu no Shiro Laputa',
    aliases: 'laputa castell al cel ghibli miyazaki totsrucs hakyra',
    tmdbId: 10515,
    tmdbType: 'movie',
    category: 'movies',
    eraTag: 'Studio Ghibli · TotsRucs 1080p',
    episodeHint: 'Blu-ray 1080p Català',
    overviewCat:
      "L'aventura llegendària d'en Pazu i la Sheeta cap a Laputa dirigida per Hayao Miyazaki, edició TotsRucs Blu-ray 1080p en català.",
    seasons: [
      {
        seasonNumber: 1,
        name: 'Edició TotsRucs BD 1080p Català',
        archiveId: 'sg-01-el-castell-al-cel-1986-bd.-1080p.-cat-esp-jpn.-h-264.8bit.-25-fps-hakyra-t',
      },
    ],
  },
  {
    id: 'akira-totsrucs-cat',
    titleCat: 'Akira (1988 · Edició TotsRucs 1080p)',
    originalTitle: 'Akira',
    aliases: 'akira kaneda tetsuo neo tokyo 3xl totsrucs',
    tmdbId: 149,
    tmdbType: 'movie',
    category: 'movies',
    eraTag: '3XL / TotsRucs · BDRip 1080p',
    episodeHint: 'Pel·lícula 1080p Català',
    overviewCat:
      'Neo-Tokyo 2019: l’obra mestra ciberpunk de Katsuhiro Otomo en edició restaurada BDRip 1080p de TotsRucs amb àudio català.',
    seasons: [
      {
        seasonNumber: 1,
        name: 'BDRip 1080p TotsRucs',
        archiveId: 'akira-bdrip-1080p-h-264-ac-3-multiaudio-subs-kyaneros-shippuden-sanin-sondela-89-tots-rucs',
      },
    ],
  },
  {
    id: 'tortugues-ninja-1990-cat',
    titleCat: 'Les Tortugues Ninja (1990 · TotsRucs 1080p)',
    originalTitle: 'Teenage Mutant Ninja Turtles',
    aliases: 'tortugues ninja tmnt totsrucs 1990',
    tmdbId: 1498,
    tmdbType: 'movie',
    category: 'movies',
    eraTag: 'TotsRucs.cat · BDRip 1080p',
    episodeHint: 'Pel·lícula 1080p en català',
    overviewCat:
      'El clàssic de 1990 d’en Leonardo, Raphael, Michelangelo i Donatello en 1080p amb el mític doblatge en català (TotsRucs.cat).',
    seasons: [
      {
        seasonNumber: 1,
        name: 'Pel·lícula BDRip 1080p Català (TotsRucs)',
        archiveId: 'les-tortugues-ninja-1990-teenage-mutant-ninja-turtles-bdrip-1080p-x-264-ac-3-cat',
      },
    ],
  },
  {
    id: 'la-mascara-1994-cat',
    titleCat: 'La Màscara (1994 · Mecanoscrit / TotsRucs)',
    originalTitle: 'The Mask',
    aliases: 'la mascara jim carrey mecanoscrit totsrucs tv3',
    tmdbId: 854,
    tmdbType: 'movie',
    category: 'movies',
    eraTag: 'TV3 / Mecanoscrit · 720p',
    episodeHint: 'Pel·lícula HD en català',
    overviewCat:
      'Jim Carrey amb l’icònic doblatge català de TV3 preservat per Mecanoscrit.cat i TotsRucs en alta definició.',
    seasons: [
      {
        seasonNumber: 1,
        name: 'BRRip 720p Català (Mecanoscrit.cat)',
        archiveId: 'la-mascara-1994-brrip-720p-x-264-catala-english-per-hal-9000-mecanoscrit.cat',
      },
    ],
  },
];

const CATALA_LIVE_CHANNELS: any[] = [
  {
    id: 'cat-sx3-live',
    dial: 1,
    name: 'SX3 / 33 · Anime i Infantil 24h',
    shortMark: 'SX3',
    brandTone: '#EC4899',
    network: '3Cat Catalunya',
    category: 'infantil_autonomicas',
    quality: '1080p HD',
    description: 'Emissió oficial en directe amb anime en català (One Piece, Conan, Sakura, Haikyu)',
    channels: [
      {
        id: 'sx3-int-hls',
        label: 'Senyal Internacional 3Cat HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://directes-tv-int.3catdirectes.cat/live-content/c33-super3-hls/master.m3u8',
        resolverType: 'tdt_hls',
      },
      {
        id: 'sx3-24h-cat',
        label: 'Senyal SX3 24h Exclusiu (Espanya)',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://directes-tv-cat.3catdirectes.cat/live-content/super3-hls/master.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'cat-tv3-live',
    dial: 2,
    name: 'TV3 en Directe (3Cat)',
    shortMark: 'TV3',
    brandTone: '#E11D48',
    network: '3Cat Catalunya',
    category: 'infantil_autonomicas',
    quality: '1080p HD',
    description: 'Televisió de Catalunya en directe: sèries, cinema en català i TN',
    channels: [
      {
        id: 'tv3-int-hls',
        label: 'Senyal Internacional TV3 HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://directes3-tv-int.3catdirectes.cat/live-content/tvi-hls/master.m3u8',
        resolverType: 'tdt_hls',
      },
      {
        id: 'tv3-cat-hls',
        label: 'Senyal Catalunya TV3 HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://directes3-tv-cat.3catdirectes.cat/live-content/tv3-hls/master.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'cat-esport3-live',
    dial: 3,
    name: 'Esport3 en Directe',
    shortMark: 'E3',
    brandTone: '#F97316',
    network: '3Cat Esports',
    category: 'noticias_deportes',
    quality: '1080p HD',
    description: 'Esports i retransmissions en directe en català',
    channels: [
      {
        id: 'esport3-int-hls',
        label: 'Senyal Oficial Esport3 HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://directes-tv-int.3catdirectes.cat/live-origin/esport3-hls/master.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
  {
    id: 'cat-324-live',
    dial: 4,
    name: '324 Notícies 24h',
    shortMark: '324',
    brandTone: '#EF4444',
    network: '3Cat Informatius',
    category: 'noticias_deportes',
    quality: '1080p HD',
    description: 'Informació contínua 24 hores en català',
    channels: [
      {
        id: '324-int-hls',
        label: 'Senyal Oficial 324 HD',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://directes-tv-int.3catdirectes.cat/live-content/canal324-hls/master.m3u8',
        resolverType: 'tdt_hls',
      },
    ],
  },
];

const catalaArtHydrationCache = new LruTtlCache<
  string,
  { poster: string; backdrop: string; year: string; rating: string; ts: number }
>(150, 12 * 60 * 60 * 1000);
const archiveMetadataCache = new LruTtlCache<string, { episodes: any[]; ts: number }>(
  120,
  30 * 60 * 1000
);

async function hydrateCatalaArtwork(entry: CatalaAnimeEntryDef) {
  const cached = catalaArtHydrationCache.get(entry.id);
  if (cached && Date.now() - cached.ts < 12 * 60 * 60 * 1000) {
    return cached;
  }
  let poster = entry.fallbackPoster || '';
  let backdrop = '';
  let year = 'CAT';
  let rating = '';

  if (entry.tmdbId && entry.tmdbType) {
    try {
      const res = await fetch(
        `https://api.themoviedb.org/3/${entry.tmdbType}/${entry.tmdbId}?api_key=${TMDB_API_KEY}&language=es-ES`,
        { signal: AbortSignal.timeout(3200) }
      );
      if (res.ok) {
        const m: any = await res.json();
        if (m?.poster_path) poster = `https://image.tmdb.org/t/p/w500${m.poster_path}`;
        if (m?.backdrop_path) backdrop = `https://image.tmdb.org/t/p/w1280${m.backdrop_path}`;
        const d = String(m?.first_air_date || m?.release_date || '');
        if (d) year = d.split('-')[0] || year;
        if (m?.vote_average) rating = Number(m.vote_average).toFixed(1);
      }
    } catch {
      // fallback to archive thumbnail if needed
    }
  }

  if (!poster && entry.seasons[0]?.archiveId) {
    poster = `https://archive.org/services/img/${entry.seasons[0].archiveId}`;
  }

  const art = { poster, backdrop: backdrop || poster, year, rating, ts: Date.now() };
  catalaArtHydrationCache.set(entry.id, art);
  return art;
}

async function fetchArchivePackEpisodes(
  archiveId: string,
  seasonNumber: number,
  audioNote?: string
): Promise<any[]> {
  const cacheKey = `${archiveId}:${seasonNumber}:${audioNote || ''}`;
  const cached = archiveMetadataCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < 60 * 60 * 1000) {
    return cached.episodes;
  }

  try {
    const res = await fetch(`https://archive.org/metadata/${encodeURIComponent(archiveId)}`, {
      headers: { 'User-Agent': CHROME_UA, Accept: 'application/json' },
      signal: AbortSignal.timeout(6500),
    });
    if (!res.ok) return [];
    const meta: any = await res.json();
    const files: any[] = Array.isArray(meta?.files) ? meta.files : [];

    // Group `.ia.mp4` (H.264/AAC browser universal) and original `.mp4` by base stem
    const byStem = new Map<
      string,
      { iaMp4?: any; origMp4?: any; mkvFile?: any; rawTitle?: string; thumb?: string }
    >();

    const thumbsByStem = new Map<string, string>();
    for (const f of files) {
      const name = String(f?.name || '');
      if (/\.(jpg|jpeg|png)$/i.test(name) && !name.includes('__ia_thumb')) {
        const stem = name.replace(/\.(thumbs\/.*|jpg|jpeg|png)$/i, '').trim();
        if (stem) {
          thumbsByStem.set(
            stem,
            `https://archive.org/download/${encodeURIComponent(archiveId)}/${encodeURIComponent(
              name
            )}`
          );
        }
      }
    }

    for (const f of files) {
      const name = String(f?.name || '');
      if (!name || name.startsWith('__')) continue;
      if (/\.ia\.mp4$/i.test(name)) {
        const stem = name.replace(/\.ia\.mp4$/i, '');
        const cur = byStem.get(stem) || {};
        cur.iaMp4 = f;
        if (f.title) cur.rawTitle = String(f.title);
        byStem.set(stem, cur);
      } else if (/\.mp4$/i.test(name)) {
        const stem = name.replace(/\.mp4$/i, '');
        const cur = byStem.get(stem) || {};
        cur.origMp4 = f;
        if (f.title) cur.rawTitle = String(f.title);
        byStem.set(stem, cur);
      }
    }

    const rawEntries = Array.from(byStem.entries()).filter(
      ([, v]) => Boolean(v.iaMp4 || v.origMp4)
    );

    rawEntries.sort(([stemA], [stemB]) =>
      stemA.localeCompare(stemB, 'ca', { numeric: true, sensitivity: 'base' })
    );

    const defaultThumb = `https://archive.org/services/img/${encodeURIComponent(archiveId)}`;

    const episodes = rawEntries.map(([stem, val], idx) => {
      const cleanName = stem
        .replace(/^.*\//, '')
        .replace(/[_]+/g, ' ')
        .replace(/\b(BDMV|DVDrip|1080p|720p|480p|x264|h264|AC3|CAT-JAP|by\s+.*)\b/gi, '')
        .replace(/\s{2,}/g, ' ')
        .trim();

      const epNumMatch =
        cleanName.match(/(?:episodi|cap[ií]tol|ep\.?|cap\.?)\s*0*(\d{1,4})/i) ||
        cleanName.match(/(?:^|\s|-)0*(\d{1,3})(?:\s|-|\.)/);
      const epNumber = idx + 1;
      const displayTitle = val.rawTitle
        ? String(val.rawTitle).trim()
        : cleanName || `Capítol ${epNumber}`;

      const iaUrl = val.iaMp4
        ? `https://archive.org/download/${encodeURIComponent(archiveId)}/${nameToArchivePath(
            val.iaMp4.name
          )}`
        : '';
      const origUrl = val.origMp4
        ? `https://archive.org/download/${encodeURIComponent(archiveId)}/${nameToArchivePath(
            val.origMp4.name
          )}`
        : '';

      // Prefer `.ia.mp4` first when present because Archive.org transcodes `.ia.mp4` to universal browser H.264 + AAC stereo,
      // while keeping original `.mp4` as Track 2 ("Català Original Màxima Qualitat")!
      const primaryUrl = iaUrl || origUrl;
      const tracks: TrackRecord[] = [];
      if (iaUrl) {
        tracks.push({
          id: `cat-ia-${seasonNumber}-${epNumber}`,
          label: 'Català · Web HD (Compatible)',
          lang: 'ES',
          quality: 'HD',
          sourceUrl: iaUrl,
          resolverType: 'direct_mp4',
          resolvedStreamUrl: iaUrl,
        });
      }
      if (origUrl && origUrl !== iaUrl) {
        tracks.push({
          id: `cat-orig-${seasonNumber}-${epNumber}`,
          label: 'Català · Màxima Qualitat Original',
          lang: 'ES',
          quality: '1080p',
          sourceUrl: origUrl,
          resolverType: 'direct_mp4',
          resolvedStreamUrl: origUrl,
        });
      }

      const lenSec = Number(val.origMp4?.length || val.iaMp4?.length || 0);
      const runtimeMin = lenSec > 60 ? Math.round(lenSec / 60) : undefined;

      return {
        id: `cat-ep-${archiveId}-${epNumber}`,
        episodeNumber: epNumber,
        detectedNumber: epNumMatch?.[1] ? Number(epNumMatch[1]) : epNumber,
        seasonNumber,
        title: displayTitle,
        overview: audioNote || 'Àudio en català · Reproducció directa sense anuncis.',
        still: thumbsByStem.get(stem) || defaultThumb,
        runtime: runtimeMin,
        streamUrl: primaryUrl,
        audioNote,
        sourceType: 'archive_mp4',
        tracks,
      };
    });

    archiveMetadataCache.set(cacheKey, { episodes, ts: Date.now() });
    return episodes;
  } catch (err) {
    console.warn('Archive metadata error:', archiveId, err);
    return [];
  }
}

function nameToArchivePath(fileName: string): string {
  return String(fileName || '')
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
}

async function fetchCcmaProgramEpisodes(programId: string, seasonNumber: number): Promise<any[]> {
  const cacheKey = `ccma:${programId}:${seasonNumber}`;
  const cached = archiveMetadataCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < 20 * 60 * 1000) {
    return cached.episodes;
  }
  try {
    const apiUrl = `https://api.3cat.cat/videos?_format=json&origen=llistat&programatv_id=${encodeURIComponent(
      programId
    )}&tipus_contingut=PPD&items_pagina=100&pagina=1&ordre=capitol&perfil=pc`;
    const res = await fetch(apiUrl, {
      headers: { 'User-Agent': CHROME_UA, Accept: 'application/json' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const json: any = await res.json();
    const rawItems = json?.resposta?.items?.item;
    const list: any[] = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];

    const episodes = list.map((it, idx) => {
      const vidId = String(it?.id || '');
      const capNum = Number(it?.capitol || idx + 1);
      const title = String(it?.titol || `Capítol ${capNum}`).trim();
      const synopsis = String(it?.entradeta || 'Emissió oficial SX3 / 3Cat en català.').trim();
      const imgs: any[] = Array.isArray(it?.imatges?.imatge)
        ? it.imatges.imatge
        : it?.imatges?.imatge
        ? [it.imatges.imatge]
        : [];
      const still = String(imgs[0]?.text || '');

      return {
        id: `3cat-${programId}-${vidId || idx}`,
        episodeNumber: idx + 1,
        detectedNumber: capNum,
        seasonNumber,
        title: capNum ? `Cap. ${capNum} · ${title}` : title,
        overview: synopsis,
        still,
        ccmaVideoId: vidId,
        sourceType: 'ccma_3cat',
      };
    });

    archiveMetadataCache.set(cacheKey, { episodes, ts: Date.now() });
    return episodes;
  } catch {
    return [];
  }
}

app.get('/api/catalog/catala', async (req, res) => {
  try {
    const category = String(req.query.category || 'all').toLowerCase();
    const query = String(req.query.query || '').trim();
    const normalizeCatalaSearch = (s: string) =>
      normalizeTitleForMatch(s)
        .replace(/\bxaolin\b/g, 'xiaolin')
        .replace(/xao/g, 'xiao');
    const normQ = normalizeCatalaSearch(query);

    let baseEntries = CATALA_ANIME_REGISTRY;
    if (category === 'classics' || category === 'shonen' || category === 'movies') {
      baseEntries = baseEntries.filter((e) => e.category === category);
    }
    if (normQ) {
      baseEntries = baseEntries.filter((e) => {
        const hay = normalizeCatalaSearch(
          `${e.titleCat} ${e.originalTitle} ${e.aliases || ''} ${e.overviewCat} ${e.eraTag}`
        );
        return hay.includes(normQ);
      });
    }

    const hydratedItems = await Promise.all(
      baseEntries.map(async (entry) => {
        const art = await hydrateCatalaArtwork(entry);
        return {
          id: entry.id,
          title: entry.titleCat,
          originalTitle: entry.originalTitle,
          tmdbId: entry.tmdbId,
          mediaType: entry.tmdbType || 'tv',
          category: entry.category,
          eraTag: entry.eraTag,
          episodeHint: entry.episodeHint,
          year: art.year,
          rating: art.rating,
          overview: entry.overviewCat,
          poster: art.poster,
          backdrop: art.backdrop,
          seasonCount: entry.seasons.length,
        };
      })
    );

    // Dynamic Live Archive.org Search (including TotsRucs / Mecanoscrit / Trobanime uploads) when user types a custom title!
    let dynamicArchiveItems: any[] = [];
    if (query.length >= 2) {
      try {
        const cleanArchQ = query.replace(/xaol[ií]n/gi, 'xiaolin');
        const advQ = `(${cleanArchQ}) AND (catala OR català OR valencia OR 3xl OR super3 OR totsrucs OR "tots rucs" OR mecanoscrit OR trobanime) AND mediatype:(movies)`;
        const advUrl = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(
          advQ
        )}&fl[]=identifier,title,description&sort[]=downloads+desc&rows=12&page=1&output=json`;
        const advRes = await fetch(advUrl, { signal: AbortSignal.timeout(4200) });
        if (advRes.ok) {
          const advJson: any = await advRes.json();
          const docs: any[] = Array.isArray(advJson?.response?.docs)
            ? advJson.response.docs
            : [];
          const knownArchiveIds = new Set(
            CATALA_ANIME_REGISTRY.flatMap((e) => e.seasons.map((s) => s.archiveId).filter(Boolean))
          );
          dynamicArchiveItems = docs
            .filter((d) => d?.identifier && !knownArchiveIds.has(String(d.identifier)))
            .map((d) => {
              const ident = String(d.identifier);
              const img = `https://archive.org/services/img/${encodeURIComponent(ident)}`;
              return {
                id: `arch-${ident}`,
                title: String(d.title || ident),
                originalTitle: ident,
                mediaType: 'tv',
                category: 'all',
                eraTag: 'Arxiu Català / TotsRucs',
                episodeHint: 'Vídeo directe',
                year: 'CAT',
                rating: '',
                overview:
                  typeof d.description === 'string'
                    ? d.description.replace(/<[^>]+>/g, '').slice(0, 220)
                    : 'Contingut en català trobat a l’arxiu comunitari.',
                poster: img,
                backdrop: img,
                seasonCount: 1,
              };
            });
        }
      } catch {
        // ignore dynamic search timeout
      }
    }

    res.json({
      success: true,
      items: [...hydratedItems, ...dynamicArchiveItems],
      liveChannels: channelHealthMonitor.prioritizeChannels(CATALA_LIVE_CHANNELS),
      communityLinks: [
        {
          id: 'totsrucs-cat',
          label: 'TotsRucs.cat (Índex P2P Català)',
          url: 'https://web.totsrucs.cat/',
          desc: 'Arxiu històric eMule/ed2k de sèries i cinema en català (packs directes ja integrats aquí)',
        },
        {
          id: 'mecanoscrit-cat',
          label: 'Mecanoscrit.cat',
          url: 'https://mecanoscrit.cat/',
          desc: 'Preservació de cinema i ciència-ficció doblada o subtitulada en català',
        },
        {
          id: 'tg-animecatala',
          label: 'Telegram @animecatala',
          url: 'https://t.me/s/animecatala',
          desc: 'Canal comunitari amb avisos i novetats en català',
        },
        {
          id: 'fansubs-cat',
          label: 'Anime Fansubs.cat',
          url: 'https://anime.fansubs.cat/',
          desc: 'Enciclopèdia i índex del doblatge i fansub en català',
        },
        {
          id: 'sx3-portal',
          label: 'SX3 / 3Cat Anime Oficial',
          url: 'https://www.3cat.cat/tv3/sx3/',
          desc: 'Portal públic oficial amb estrenes d’anime en català',
        },
      ],
    });
  } catch (err) {
    console.error('Catala catalog error:', err);
    res.status(500).json({ success: false, items: [], liveChannels: [] });
  }
});

app.get('/api/catalog/catala/:itemId/episodes', async (req, res) => {
  try {
    const itemId = String(req.params.itemId || '').trim();
    const requestedSeason = Math.max(1, parseInt(String(req.query.season || '1'), 10) || 1);

    // Support dynamic `arch-<identifier>` items discovered via live search!
    if (itemId.startsWith('arch-')) {
      const archiveId = itemId.slice(5);
      const episodes = await fetchArchivePackEpisodes(archiveId, 1);
      const img = `https://archive.org/services/img/${encodeURIComponent(archiveId)}`;
      return res.json({
        success: true,
        details: {
          id: itemId,
          title: archiveId.replace(/[-_]+/g, ' '),
          eraTag: 'Arxiu Català',
          overview: ' Reproducció directa en català sense anuncis.',
          poster: img,
          backdrop: img,
          activeSeason: 1,
          seasons: [{ seasonNumber: 1, name: 'Capítols i Vídeos', episodeCount: episodes.length }],
          episodes,
        },
      });
    }

    const entry = CATALA_ANIME_REGISTRY.find((e) => e.id === itemId);
    if (!entry) {
      return res.status(404).json({ success: false, error: 'Anime en català no trobat.' });
    }

    const art = await hydrateCatalaArtwork(entry);
    const chosenSeason =
      entry.seasons.find((s) => s.seasonNumber === requestedSeason) || entry.seasons[0];

    const episodes = Array.isArray(chosenSeason.customEpisodes)
      ? chosenSeason.customEpisodes
      : chosenSeason.archiveId
      ? await fetchArchivePackEpisodes(
          chosenSeason.archiveId,
          chosenSeason.seasonNumber,
          chosenSeason.audioNote
        )
      : chosenSeason.ccmaProgramId
      ? await fetchCcmaProgramEpisodes(chosenSeason.ccmaProgramId, chosenSeason.seasonNumber)
      : [];

    return res.json({
      success: true,
      details: {
        id: entry.id,
        title: entry.titleCat,
        originalTitle: entry.originalTitle,
        eraTag: entry.eraTag,
        year: art.year,
        rating: art.rating,
        overview: entry.overviewCat,
        poster: art.poster,
        backdrop: art.backdrop,
        activeSeason: chosenSeason.seasonNumber,
        seasons: entry.seasons.map((s) => ({
          seasonNumber: s.seasonNumber,
          name: s.name,
          episodeCount:
            s.seasonNumber === chosenSeason.seasonNumber
              ? episodes.length
              : Array.isArray(s.customEpisodes)
              ? s.customEpisodes.length
              : 0,
        })),
        episodes,
      },
    });
  } catch (err) {
    console.error('Catala episodes error:', err);
    res.status(500).json({ success: false });
  }
});

app.get('/api/extract/catala-3cat', async (req, res) => {
  try {
    const vidId = String(req.query.vidId || '').replace(/\D/g, '');
    if (!vidId) return res.status(400).json({ success: false });

    const mediaApi = `https://dinamics.ccma.cat/pvideo/media.jsp?media=video&version=0s&idint=${vidId}&profile=pc`;
    const mRes = await fetch(mediaApi, {
      headers: { 'User-Agent': CHROME_UA, Accept: 'application/json' },
      signal: AbortSignal.timeout(4500),
    });
    const officialWebUrl = `https://www.3cat.cat/3cat/video/${vidId}/`;

    if (mRes.ok) {
      const mJson: any = await mRes.json();
      const urlsRaw = mJson?.media?.url;
      const urlList: any[] = Array.isArray(urlsRaw) ? urlsRaw : urlsRaw ? [urlsRaw] : [];
      const sorted = [...urlList].sort(
        (a, b) =>
          parseInt(String(b?.label || '0'), 10) - parseInt(String(a?.label || '0'), 10)
      );
      const bestUrl = String(sorted[0]?.file || '').trim();
      if (bestUrl) {
        const tracks: TrackRecord[] = sorted
          .filter((u) => u?.file)
          .map((u, idx) => ({
            id: `3cat-mp4-${vidId}-${idx}`,
            label: `Català Oficial 3Cat · ${u.label || 'HD'}`,
            lang: 'ES',
            quality: String(u.label || 'HD'),
            sourceUrl: String(u.file),
            resolverType: 'direct_mp4',
            resolvedStreamUrl: String(u.file),
          }));
        tracks.push({
          id: `3cat-cloud-${vidId}`,
          label: 'Obrir al Cloud Browser (3Cat Oficial)',
          lang: 'ES',
          quality: 'HD',
          sourceUrl: officialWebUrl,
          resolverType: 'cloud_browser',
        });
        return res.json({
          success: true,
          mode: 'direct',
          streamUrl: bestUrl,
          tracks,
          officialWebUrl,
        });
      }
    }

    return res.json({
      success: true,
      mode: 'cloud',
      streamUrl: officialWebUrl,
      tracks: [],
      officialWebUrl,
    });
  } catch {
    return res.status(500).json({ success: false });
  }
});

// ============================================================================
// SAMSUNG SMART TV IPTV SUITE (.M3U PLAYLIST + LIVE HLS RESOLVER + XMLTV EPG + PNG BADGES)
// Compatible with IPTV Smarters Pro, Smart IPTV (SIPTV), SS IPTV, IBO Player, OttPlayer & Flix IPTV
// ============================================================================
const IPTV_GROUP_TITLES: Record<string, string> = {
  generalistas: 'TDT Generalistas',
  movistar: 'Fútbol · Movistar+',
  dazn: 'Fútbol · DAZN',
  uk_sports: 'Deportes UK · Sky & Eurosport (EN)',
  beinsports: 'Fútbol · beIN SPORTS',
  espn: 'Fútbol · ESPN 1-7',
  dsports: 'Fútbol · DSports',
  tnt_space: 'Deportes · TNT y Space',
  cine_series: 'Cine y Series',
  entretenimiento: 'Entretenimiento',
  noticias_deportes: 'Noticias y Deporte',
  infantil_autonomicas: 'Infantil y Autonómicas',
};

const IPTV_EPG_ID_ALIASES: Record<string, string> = {
  'cat-sx3-live': 'cat-sx3',
  'cat-tv3-live': 'cat-tv3',
  'cat-324-live': 'cat-324',
  'bein-ar-1': 'beINSports1.qa@MENA',
  'bein-ar-2': 'beINSports2.qa@MENA',
  'bein-ar-3': 'beINSports3.qa@MENA',
  'bein-ar-4': 'beINSports4.qa@MENA',
  'bein-ar-5': 'beINSports5.qa@MENA',
  'bein-ar-6': 'beINSports6.qa@MENA',
  'bein-ar-7': 'beINSports7.qa@MENA',
  'bein-ar-8': 'beINSports8.qa@MENA',
  'bein-ar-9': 'beINSports9.qa@MENA',
  'bein-ar-xtra': 'beINSportsXTRA1.qa@MENA',
};

function getAllIptvChannels(): any[] {
  const seen = new Set<string>();
  const combined: any[] = [];
  for (const ch of [...SPANISH_TDT_CHANNELS, ...CATALA_LIVE_CHANNELS]) {
    if (!ch?.id || seen.has(ch.id)) continue;
    seen.add(ch.id);
    combined.push(ch);
  }
  return channelHealthMonitor.prioritizeChannels(combined);
}

function getIptvEpgId(channelId: string): string {
  return IPTV_EPG_ID_ALIASES[channelId] || channelId;
}

function escapeXmlText(val: string): string {
  return String(val || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatXmltvUtcTime(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(
    d.getUTCHours()
  )}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())} +0000`;
}

// Pure-Node 96x96 PNG Channel Badge Encoder (zero native deps, cached per channel)
const iptvPngLogoCache = new LruTtlCache<string, Buffer>(120, 24 * 60 * 60 * 1000);
const PNG_CRC32_TABLE = (() => {
  const tbl = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    tbl[n] = c >>> 0;
  }
  return tbl;
})();

function pngCrc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = PNG_CRC32_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makePngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  const combined = Buffer.concat([typeBuf, data]);
  crcBuf.writeUInt32BE(pngCrc32(combined), 0);
  return Buffer.concat([len, combined, crcBuf]);
}

const MINI_FONT_3X5: Record<string, string[]> = {
  A: ['010', '101', '111', '101', '101'],
  B: ['110', '101', '110', '101', '110'],
  C: ['011', '100', '100', '100', '011'],
  D: ['110', '101', '101', '101', '110'],
  E: ['111', '100', '110', '100', '111'],
  F: ['111', '100', '110', '100', '100'],
  G: ['011', '100', '101', '101', '011'],
  H: ['101', '101', '111', '101', '101'],
  I: ['111', '010', '010', '010', '111'],
  J: ['001', '001', '001', '101', '010'],
  K: ['101', '101', '110', '101', '101'],
  L: ['100', '100', '100', '100', '111'],
  M: ['101', '111', '111', '101', '101'],
  N: ['101', '111', '111', '111', '101'],
  O: ['010', '101', '101', '101', '010'],
  P: ['110', '101', '110', '100', '100'],
  Q: ['010', '101', '101', '111', '011'],
  R: ['110', '101', '110', '101', '101'],
  S: ['011', '100', '010', '001', '110'],
  T: ['111', '010', '010', '010', '010'],
  U: ['101', '101', '101', '101', '111'],
  V: ['101', '101', '101', '101', '010'],
  W: ['101', '101', '111', '111', '101'],
  X: ['101', '101', '010', '101', '101'],
  Y: ['101', '101', '010', '010', '010'],
  Z: ['111', '001', '010', '100', '111'],
  '0': ['111', '101', '101', '101', '111'],
  '1': ['010', '110', '010', '010', '111'],
  '2': ['110', '001', '010', '100', '111'],
  '3': ['110', '001', '010', '001', '110'],
  '4': ['101', '101', '111', '001', '001'],
  '5': ['111', '100', '110', '001', '110'],
  '6': ['011', '100', '111', '101', '111'],
  '7': ['111', '001', '010', '010', '010'],
  '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '110'],
  '+': ['000', '010', '111', '010', '000'],
  '-': ['000', '000', '111', '000', '000'],
};

function renderIptvChannelPng(shortMark: string, hexColor: string): Buffer {
  const cleanMark = (shortMark || 'TV').toUpperCase().replace(/[^A-Z0-9+-]/g, '').slice(0, 4) || 'TV';
  const cacheKey = `${cleanMark}|${hexColor}`;
  const existing = iptvPngLogoCache.get(cacheKey);
  if (existing) return existing;

  const cleanHex = /^#[0-9a-fA-F]{6}$/.test(hexColor) ? hexColor.slice(1) : 'E11D48';
  const r = parseInt(cleanHex.slice(0, 2), 16);
  const g = parseInt(cleanHex.slice(2, 4), 16);
  const b = parseInt(cleanHex.slice(4, 6), 16);

  const w = 96;
  const h = 96;
  const raw = Buffer.alloc(h * (1 + w * 4));

  for (let y = 0; y < h; y++) {
    const rowOff = y * (1 + w * 4);
    raw[rowOff] = 0; // filter none
    for (let x = 0; x < w; x++) {
      const pxOff = rowOff + 1 + x * 4;
      // Outer dark margin (8px) with rounded badge
      const inInner = x >= 6 && x < w - 6 && y >= 6 && y < h - 6;
      if (!inInner) {
        raw[pxOff] = 10;
        raw[pxOff + 1] = 12;
        raw[pxOff + 2] = 18;
        raw[pxOff + 3] = 255;
      } else {
        const shade = Math.max(0.55, 1 - (y / h) * 0.38);
        raw[pxOff] = Math.round(r * shade);
        raw[pxOff + 1] = Math.round(g * shade);
        raw[pxOff + 2] = Math.round(b * shade);
        raw[pxOff + 3] = 255;
      }
    }
  }

  // Draw crisp centered bitmap text
  const scale = cleanMark.length <= 2 ? 5 : cleanMark.length === 3 ? 4 : 3;
  const glyphW = 3 * scale;
  const gap = scale;
  const totalW = cleanMark.length * glyphW + (cleanMark.length - 1) * gap;
  const totalH = 5 * scale;
  const startX = Math.floor((w - totalW) / 2);
  const startY = Math.floor((h - totalH) / 2);

  for (let ci = 0; ci < cleanMark.length; ci++) {
    const glyph = MINI_FONT_3X5[cleanMark[ci]] || MINI_FONT_3X5['T'];
    const gx0 = startX + ci * (glyphW + gap);
    for (let gy = 0; gy < 5; gy++) {
      for (let gx = 0; gx < 3; gx++) {
        if (glyph[gy][gx] !== '1') continue;
        for (let sy = 0; sy < scale; sy++) {
          for (let sx = 0; sx < scale; sx++) {
            const px = gx0 + gx * scale + sx;
            const py = startY + gy * scale + sy;
            if (px >= 0 && px < w && py >= 0 && py < h) {
              const pxOff = py * (1 + w * 4) + 1 + px * 4;
              raw[pxOff] = 255;
              raw[pxOff + 1] = 255;
              raw[pxOff + 2] = 255;
              raw[pxOff + 3] = 255;
            }
          }
        }
      }
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const compressed = zlib.deflateSync(raw);
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const png = Buffer.concat([
    sig,
    makePngChunk('IHDR', ihdr),
    makePngChunk('IDAT', compressed),
    makePngChunk('IEND', Buffer.alloc(0)),
  ]);
  iptvPngLogoCache.set(cacheKey, png);
  return png;
}

const iptvChannelResolveCache = new LruTtlCache<
  string,
  {
    rawM3u8Url: string;
    referer: string;
    forceAac: boolean;
    isPublicCorsCdn: boolean;
    ts: number;
  }
>(150, 20 * 60 * 1000);

async function fetchUpstreamManifestText(
  targetUrl: string,
  referer: string,
  forceAac: boolean
): Promise<{ text: string; finalUrl: string } | null> {
  const headers: Record<string, string> = {
    'User-Agent': isDvbHeadendStream(targetUrl) || forceAac ? TDT_DVB_UA : CHROME_UA,
    Accept: '*/*',
  };
  if (referer) {
    headers['Referer'] = referer;
    try {
      headers['Origin'] = new URL(referer).origin;
    } catch {
      // ignore
    }
  }

  if (!shouldBypassNodeFetch(targetUrl)) {
    try {
      const resp = await fetch(targetUrl, {
        headers,
        signal: AbortSignal.timeout(3500),
      });
      if (resp.ok) {
        const text = await resp.text();
        if (text.includes('#EXTM3U')) {
          return { text, finalUrl: resp.url || targetUrl };
        }
      }
    } catch {
      markHostNeedsCurlFallback(targetUrl);
    }
  }

  const fb = await curlGetText(targetUrl, headers, 6).catch(() => ({
    text: '',
    effectiveUrl: targetUrl,
  }));
  if (fb.text && fb.text.includes('#EXTM3U')) {
    return { text: fb.text, finalUrl: fb.effectiveUrl || targetUrl };
  }
  return null;
}

async function unwrapMasterPlaylistForIptv(
  manifestObj: { text: string; finalUrl: string },
  referer: string,
  forceAac: boolean
): Promise<{ text: string; finalUrl: string }> {
  let current = manifestObj;

  for (let depth = 0; depth < 3; depth++) {
    const txt = current.text || '';
    if (!txt.includes('#EXT-X-STREAM-INF')) {
      return current;
    }

    // Preserve master playlist only when default audio is a separate demuxed track URI
    const lines = txt.split(/\r?\n/);
    let hasExternalOnlyDefaultAudio = false;
    let hasAnyAudioMedia = false;
    let hasMuxedDefaultAudio = false;
    for (const raw of lines) {
      const line = raw.trim();
      if (line.startsWith('#EXT-X-MEDIA') && line.includes('TYPE=AUDIO')) {
        hasAnyAudioMedia = true;
        const isDefault = /DEFAULT=YES/i.test(line);
        const hasUri = /URI="/i.test(line);
        if (isDefault && !hasUri) hasMuxedDefaultAudio = true;
        if (isDefault && hasUri) hasExternalOnlyDefaultAudio = true;
      }
    }
    if (hasAnyAudioMedia && hasExternalOnlyDefaultAudio && !hasMuxedDefaultAudio) {
      return current;
    }

    let bestUrl = '';
    let bestBw = -1;
    let pendingBw = 0;
    let expectingUrl = false;
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      if (line.startsWith('#EXT-X-STREAM-INF')) {
        const bwMatch = line.match(/BANDWIDTH=(\d+)/i);
        pendingBw = bwMatch ? parseInt(bwMatch[1], 10) || 0 : 0;
        expectingUrl = true;
        continue;
      }
      if (line.startsWith('#')) {
        continue;
      }
      if (expectingUrl) {
        expectingUrl = false;
        try {
          const absVariant = new URL(line, current.finalUrl).href;
          if (pendingBw >= bestBw) {
            bestBw = pendingBw;
            bestUrl = absVariant;
          }
        } catch {
          // ignore invalid variant URI
        }
      }
    }

    if (!bestUrl) return current;
    const sub = await fetchUpstreamManifestText(bestUrl, referer, forceAac);
    if (!sub) return current;
    current = sub;
  }

  return current;
}

function rewriteManifestForSamsungIptv(
  manifestText: string,
  baseUrl: string,
  referer: string,
  forceAac: boolean,
  isPublicCorsCdn: boolean,
  publicOrigin: string
): string {
  const effectiveReferer = resolveKnownUpstreamReferer(baseUrl, referer) || new URL(baseUrl).origin + '/';
  const lines = manifestText.split(/\r?\n/);
  let nextLineIsVariantPlaylist = false;

  return lines
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;

      if (trimmed.startsWith('#')) {
        if (trimmed.startsWith('#EXT-X-STREAM-INF')) {
          nextLineIsVariantPlaylist = true;
        }
        if (trimmed.includes('URI="')) {
          return line.replace(/URI="([^"]+)"/g, (_match, uriVal) => {
            try {
              const absUri = new URL(uriVal, baseUrl).href;
              if (isPublicCorsCdn) {
                return `URI="${absUri}"`;
              }
              if (trimmed.startsWith('#EXT-X-MEDIA') || absUri.includes('.m3u8')) {
                return `URI="${buildHlsProxyUrl(absUri, effectiveReferer, forceAac, publicOrigin)}"`;
              }
              return `URI="${buildTsProxyUrl(absUri, effectiveReferer, forceAac, publicOrigin)}"`;
            } catch {
              return _match;
            }
          });
        }
        return line;
      }

      try {
        const absUrl = new URL(trimmed, baseUrl).href;
        const isPlaylist =
          nextLineIsVariantPlaylist ||
          /\.m3u8(\?|$)/i.test(absUrl) ||
          absUrl.includes('stream_tv=');
        nextLineIsVariantPlaylist = false;

        if (isPublicCorsCdn) {
          return absUrl;
        }
        return isPlaylist
          ? buildHlsProxyUrl(absUrl, effectiveReferer, forceAac, publicOrigin)
          : buildTsProxyUrl(absUrl, effectiveReferer, forceAac, publicOrigin);
      } catch {
        nextLineIsVariantPlaylist = false;
        return line;
      }
    })
    .join('\n');
}

app.get(
  [
    '/naim-cine.m3u',
    '/NAIM-CINE-Samsung-TV.m3u',
    '/iptv.m3u',
    '/naim-cine.m3u8',
    '/api/iptv/playlist.m3u',
  ],
  (req, res) => {
    const publicOrigin = getPublicOrigin(req);
    const channels = getAllIptvChannels();
    const lines: string[] = [
      `#EXTM3U x-tvg-url="${publicOrigin}/epg.xml" url-tvg="${publicOrigin}/epg.xml"`,
    ];

    channels.forEach((ch, idx) => {
      const groupTitle = IPTV_GROUP_TITLES[ch.category] || 'TDT y Directo';
      const epgId = getIptvEpgId(ch.id);
      const chno = ch.dial ? String(ch.dial) : String(idx + 1);
      const logoUrl = `${publicOrigin}/api/iptv/logo/${encodeURIComponent(ch.id)}.png`;
      const streamUrl = `${publicOrigin}/api/iptv/live/${encodeURIComponent(ch.id)}.m3u8`;
      const safeName = String(ch.name || ch.id).replace(/[\r\n,]+/g, ' ').trim();

      lines.push(
        `#EXTINF:-1 tvg-id="${epgId}" tvg-name="${safeName}" tvg-chno="${chno}" tvg-logo="${logoUrl}" group-title="${groupTitle}",${safeName}`
      );
      lines.push(streamUrl);
    });

    const playlistBody = lines.join('\n') + '\n';
    const forceDownload = req.query.download === '1';

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Content-Type', 'audio/x-mpegurl; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    if (forceDownload) {
      res.setHeader('Content-Disposition', 'attachment; filename="NAIM-CINE-Samsung-TV.m3u"');
    }
    res.send(playlistBody);
  }
);

app.get('/api/iptv/logo/:channelId', (req, res) => {
  const rawId = String(req.params.channelId || '').replace(/\.png$/i, '');
  const ch = getAllIptvChannels().find((c) => c.id === rawId);
  const png = renderIptvChannelPng(ch?.shortMark || rawId.slice(0, 3), ch?.brandTone || '#E11D48');

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.setHeader('Content-Length', String(png.length));
  res.end(png);
});

app.get('/api/iptv/live/:channelId', async (req, res) => {
  const rawId = String(req.params.channelId || '').replace(/\.m3u8$/i, '');
  const channel = getAllIptvChannels().find((c) => c.id === rawId);
  if (!channel) {
    return res.status(404).send('Channel not found');
  }

  const publicOrigin = getPublicOrigin(req);
  const forceAacOverride = req.query.aac === '1';
  const cached = iptvChannelResolveCache.get(channel.id);
  if (cached && Date.now() - cached.ts < 45_000) {
    const manifestObj = await fetchUpstreamManifestText(
      cached.rawM3u8Url,
      cached.referer,
      forceAacOverride || cached.forceAac
    );
    if (manifestObj) {
      const unwrapped = await unwrapMasterPlaylistForIptv(
        manifestObj,
        cached.referer,
        forceAacOverride || cached.forceAac
      );
      const rewritten = rewriteManifestForSamsungIptv(
        unwrapped.text,
        unwrapped.finalUrl,
        cached.referer,
        forceAacOverride || cached.forceAac,
        false,
        publicOrigin
      );
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', '*');
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      return res.send(rewritten);
    }
    iptvChannelResolveCache.delete(channel.id);
  }

  const tracks: TrackRecord[] = Array.isArray(channel.channels) ? channel.channels : [];
  for (const track of tracks) {
    try {
      const sourceUrl = String(track?.sourceUrl || '').trim();
      if (!sourceUrl) continue;

      const isDirectHls =
        track.resolverType === 'tdt_hls' ||
        track.resolverType === 'direct_hls' ||
        /\.m3u8(\?|$)/i.test(sourceUrl);

      if (isDirectHls) {
        const cleanUrl = sourceUrl.replace(/[?&]profile=(hd|fast)\b/gi, '');
        const referer =
          resolveKnownUpstreamReferer(cleanUrl, track.referer) || new URL(cleanUrl).origin + '/';
        const forceAac = forceAacOverride;

        const manifestObj = await fetchUpstreamManifestText(cleanUrl, referer, forceAac);
        if (!manifestObj) continue;

        const unwrapped = await unwrapMasterPlaylistForIptv(manifestObj, referer, forceAac);

        iptvChannelResolveCache.set(channel.id, {
          rawM3u8Url: unwrapped.finalUrl,
          referer,
          forceAac,
          isPublicCorsCdn: false,
          ts: Date.now(),
        });

        const rewritten = rewriteManifestForSamsungIptv(
          unwrapped.text,
          unwrapped.finalUrl,
          referer,
          forceAac,
          false,
          publicOrigin
        );
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', '*');
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        return res.send(rewritten);
      }

      // Sports / Embed track -> fast crypto resolve + fallback sniff + master unwrapping
      const fullTarget = /^https?:\/\//i.test(sourceUrl) ? sourceUrl : `https://${sourceUrl}`;
      let directSports = await extractLiveSportsHlsDirect(fullTarget);
      if (directSports?.isBrokenGreenFeed) continue;

      const isKnownDirectMirror = /footunder\.online|tilinhd\.|streamxhd\./i.test(fullTarget);
      if (!directSports && !isKnownDirectMirror) {
        directSports = await sniffStreamWithHeadless(fullTarget);
      }
      if (!directSports || !directSports.streamUrl || directSports.isDirectMp4) continue;

      const manifestObj = await fetchUpstreamManifestText(
        directSports.streamUrl,
        directSports.referer,
        false
      );
      if (!manifestObj) continue;

      const unwrapped = await unwrapMasterPlaylistForIptv(manifestObj, directSports.referer, false);

      const clean = await verifyM3u8HasCleanVideoFrame(
        unwrapped.text,
        unwrapped.finalUrl,
        directSports.referer
      );
      if (!clean) continue;

      iptvChannelResolveCache.set(channel.id, {
        rawM3u8Url: unwrapped.finalUrl,
        referer: directSports.referer,
        forceAac: forceAacOverride,
        isPublicCorsCdn: false,
        ts: Date.now(),
      });

      const rewritten = rewriteManifestForSamsungIptv(
        unwrapped.text,
        unwrapped.finalUrl,
        directSports.referer,
        forceAacOverride,
        false,
        publicOrigin
      );
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', '*');
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      return res.send(rewritten);
    } catch {
      // try next backup track
    }
  }

  return res.status(503).send('Canal temporalmente sin señal disponible');
});

app.get(['/epg.xml', '/api/iptv/epg.xml'], async (req, res) => {
  try {
    const publicOrigin = getPublicOrigin(req);
    const store = await loadSpanishEpgSchedule();
    const channels = getAllIptvChannels();
    const xmlParts: string[] = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<tv generator-info-name="NAIMCINE IPTV EPG" generator-info-url="' +
        escapeXmlText(publicOrigin) +
        '">',
    ];

    const emittedChannelIds = new Set<string>();
    for (const ch of channels) {
      const epgId = getIptvEpgId(ch.id);
      if (emittedChannelIds.has(epgId)) continue;
      emittedChannelIds.add(epgId);
      const logoUrl = `${publicOrigin}/api/iptv/logo/${encodeURIComponent(ch.id)}.png`;
      xmlParts.push(`  <channel id="${escapeXmlText(epgId)}">`);
      xmlParts.push(`    <display-name lang="es">${escapeXmlText(ch.name)}</display-name>`);
      xmlParts.push(`    <icon src="${escapeXmlText(logoUrl)}" />`);
      xmlParts.push('  </channel>');
    }

    for (const epgId of emittedChannelIds) {
      const events = store.get(epgId) || [];
      for (const ev of events) {
        xmlParts.push(
          `  <programme start="${formatXmltvUtcTime(ev.startMs)}" stop="${formatXmltvUtcTime(
            ev.stopMs
          )}" channel="${escapeXmlText(epgId)}">`
        );
        xmlParts.push(`    <title lang="es">${escapeXmlText(ev.title)}</title>`);
        if (ev.subtitle) {
          xmlParts.push(`    <sub-title lang="es">${escapeXmlText(ev.subtitle)}</sub-title>`);
        }
        if (ev.description) {
          xmlParts.push(`    <desc lang="es">${escapeXmlText(ev.description)}</desc>`);
        }
        if (ev.category) {
          xmlParts.push(`    <category lang="es">${escapeXmlText(ev.category)}</category>`);
        }
        xmlParts.push('  </programme>');
      }
    }

    xmlParts.push('</tv>');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.send(xmlParts.join('\n'));
  } catch (err) {
    console.warn('/epg.xml error:', err);
    res.status(500).type('application/xml').send('<tv></tv>');
  }
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

  if (ENV.nodeEnv !== 'test') {
    channelHealthMonitor.startScheduler(
      () => [
        ...SPANISH_TDT_CHANNELS,
        ...CATALA_LIVE_CHANNELS,
        ...getPermanent247SportsMatches(),
        ...(cachedSportsSchedule?.matches || []),
      ],
      3 * 60 * 1000,
      8_000
    );
    startCatalogRefreshScheduler(15 * 60 * 1000);
  }

  // Mount global API error handler prior to Vite / SPA fallback
  app.use(expressErrorHandler);

  if (!isProd) {
    let viteMiddleware: express.RequestHandler | null = null;
    const viteReady = (async () => {
      const { createServer: createViteServer } = await import('vite');
      const hmrEnabled = process.env.DISABLE_HMR !== 'true';
      const vite = await createViteServer({
        server: {
          middlewareMode: true,
          allowedHosts: true,
          hmr: hmrEnabled,
          ws: { server: httpServer },
        },
        appType: 'spa',
      });
      viteMiddleware = vite.middlewares;
    })();

    app.use(async (req, res, next) => {
      if (!viteMiddleware) {
        await viteReady;
      }
      return viteMiddleware!(req, res, next);
    });

    httpServer.listen(PORT, '0.0.0.0', () => {
      logger.info({ port: PORT, env: ENV.nodeEnv }, 'naim_cine_engine_started');
    });
  } else {
    app.use(
      express.static(path.resolve(__dirname, 'dist'), {
        maxAge: '7d',
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('.html') || filePath.endsWith('sw.js')) {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
          }
        },
      })
    );
    app.get('*', (req, res) => {
      if (req.path === '/tv' || req.path === '/tv/') {
        return sendSmartTvReceiverHtml(res);
      }
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });

    httpServer.listen(PORT, '0.0.0.0', () => {
      logger.info({ port: PORT, env: ENV.nodeEnv }, 'naim_cine_engine_started');
    });
  }
}

startServer();

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

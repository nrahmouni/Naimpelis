import fs from 'fs';
import path from 'path';
import { CLIPBOX_EMBEDDED_RAW_TEXT } from './clipboxRawData.ts';

export type ClipboxCategoryId =
  | 'core'
  | 'decoding'
  | 'cinema_es'
  | 'cinema_intl'
  | 'anime'
  | 'extractors'
  | 'subtitles'
  | 'sdk';

export interface ClipboxDecodedToken {
  label: string;
  host: string;
  rawUrl: string;
  encoding: 'base64-json' | 'api-endpoint' | 'keys-repo' | 'proxy-router' | 'dns-resolver';
  decodedSummary: string;
  decodedPayload?: unknown;
}

export interface ClipboxHostEntry {
  host: string;
  urls: string[];
  category: ClipboxCategoryId;
  categoryLabel: string;
  language: string;
  role: string;
  isBoilerplate: boolean;
  probeAllowed: boolean;
  decodedNote?: string;
}

export type ClipboxRouteKind =
  | 'hls_mp4'
  | 'player_embed'
  | 'provider_smali'
  | 'extractor_smali'
  | 'app_internal';

export interface ClipboxRoutePattern {
  pattern: string;
  kind: ClipboxRouteKind;
  decodedName?: string;
  description?: string;
}

export interface ClipboxMediaRef {
  kind: 'hls' | 'mp4';
  url: string;
  sources: string[];
  note: string;
}

export interface ClipboxParsedInventory {
  sourceFile: string;
  declaredSummary: {
    literalUrls: number;
    hosts: number;
    routePatterns: number;
  };
  actualCounts: {
    literalUrls: number;
    hosts: number;
    routePatterns: number;
    streamingHosts: number;
    sdkHosts: number;
  };
  categoryCounts: Record<ClipboxCategoryId, number>;
  hosts: ClipboxHostEntry[];
  decodedTokens: ClipboxDecodedToken[];
  routePatterns: ClipboxRoutePattern[];
  decodedProviders: Array<{ name: string; rawPattern: string; region: string }>;
  decodedExtractors: Array<{ name: string; rawPattern: string; family: string }>;
  mediaRefs: ClipboxMediaRef[];
}

const CATEGORY_LABELS: Record<ClipboxCategoryId, string> = {
  core: 'ClipBox Core y Config',
  decoding: 'APIs de Descifrado, Keys y DNS',
  cinema_es: 'Cine y Series (ES / Latam)',
  cinema_intl: 'Cine y Series Multi-Idioma',
  anime: 'Anime, Catálogos y Skip APIs',
  extractors: 'Extractores y Hosts de Vídeo',
  subtitles: 'Subtítulos e Intros',
  sdk: 'SDK Android, Telemetría y Red',
};

const CORE_HOSTS = new Set([
  'clipbox.mov',
  'api.clipbox.mov',
  'superbox.mov',
  'raw.githubusercontent.com',
  'github.com',
  't.me',
]);

const DECODING_HOSTS = new Set([
  'enc-dec.app',
  'fkplayer.xyz',
  'proxy.afterdark.baby',
  'afterdark.best',
  'api.wing.st',
  'api.wecollege.net',
  'hdhub.thevolecitor.qzz.io',
  'cloudflare-dns.com',
  'dns.google',
  'ipv4.icanhazip.com',
  'api.themoviedb.org',
  'image.tmdb.org',
  'www.imdb.com',
  'api.imdbapi.dev',
  'sg.media-imdb.com',
  'm.media-amazon.com',
  'v3.sg.media-imdb.com',
  'webservice.fanart.tv',
  'www.google.com',
]);

const SUBTITLE_HOSTS = new Set([
  'api.subdl.com',
  'dl.subdl.com',
  'opensubtitles-v3.strem.io',
  'rest.opensubtitles.org',
  'subs5.strem.io',
  'subsource.net',
  'api.theintrodb.org',
]);

const ANIME_HOSTS = new Set([
  'allanime.day',
  'api.allanime.day',
  'aln.youtube-anime.com',
  'anikototv.to',
  'anime4low.sbs',
  'animeav1.com',
  'animeav1.uns.bio',
  'animefenix2.tv',
  'www3.animeflv.net',
  'animeflv.net',
  'jkanime.net',
  'latanime.org',
  'tioanime.com',
  'ww3.animeonline.ninja',
  'animeonline.ninja',
  'www.animesaturn.net',
  'animesaturn.net',
  'www.animeunity.so',
  'animeunity.so',
  'www.animeworld.ac',
  'animeworld.ac',
  'anibum.playerp2p.online',
  'api.aniskip.com',
  'kitsu.io',
  'mkissa.to',
  'french-anime.com',
  'w16.french-manga.net',
  'hianime.to',
  'aniwave.to',
  'gogoanime3.co',
  'zoro.to',
  'kisskh.co',
  'kisskh.do',
]);

const CINEMA_ES_HOSTS = new Set([
  'fanpelis.to',
  'pelisflixhd.win',
  'seriesflixhd.lol',
  'flixlatam.com',
  'cine24h.online',
  'www.cinecalidad.ec',
  'cinecalidad.ec',
  'sololatino.net',
  'www.sololatino.net',
  'pelisplus.rpmstream.live',
  'pelisplus.strp2p.com',
  'pelisplus.upns.pro',
  'doramasflix.in',
  'www.lacartoons.com',
  'www.kidraz.com',
  'verhdlink.cam',
  'cuevana.biz',
  'cuevana3.ch',
  'poseidonhd2.co',
  'gnula.nu',
  'pelispedia.is',
]);

const CINEMA_INTL_HOSTS = new Set([
  'vidlink.pro',
  'player.videasy.net',
  'player.vidzee.wtf',
  'core.vidzee.wtf',
  'vidrock.net',
  'vidnest.io',
  'vidflix.club',
  'vixsrc.to',
  'vixcloud.co',
  'vsembed.ru',
  'primesrc.me',
  'megaplay.buzz',
  'moviesapi.club',
  'www.2embed.cc',
  '2embed.cc',
  'sflix.to',
  'bflix.gs',
  'ridomovies.tv',
  'ridomovies.su',
  'cinehax.com',
  'frembed.casa',
  'flemmix.men',
  'onregardeou.site',
  'ww1.wiflix-adresses.fun',
  'altadefinizione-01.fun',
  'cb01official.uno',
  'filmpalast.to',
  'hdfilme.win',
  'einschalten.in',
  'megakino12.com',
  'cinemathek.online',
  'moflix-stream.click',
  'moflix-stream.fans',
  'moflix-stream.link',
  'moflix-stream.xyz',
  'zaluknij.cc',
  'tbg.seriesturcastv.to',
  'tuktukcinema.store',
  'cilootv.store',
  'afterdark.click',
  'streamingcommunity.prof',
  'hdrezka.ag',
  'darkiworld.com',
  'kinoger.com',
  'xprime.tv',
  'riveembed.su',
  'autoembed.co',
  'embed.su',
  'vidsrc.cc',
  'vidsrc.me',
  'vidsrc.xyz',
  'vidsrc.to',
  'vidsrc.in',
  'vidsrc.net',
  '111movies.com',
  '87d6a6ef6b58-webstreamrmbg.baby-beamup.club',
  'ab2024.ru',
]);

const SDK_HOST_PATTERNS = [
  /^127\.0\.0\.1/i,
  /^localhost/i,
  /^example\./i,
  /^\.\.\./,
  /^…/,
  /schemas\.android\.com/i,
  /developer\.android\.com/i,
  /android\.googlesource\.com/i,
  /googlesyndication\.com/i,
  /googleadservices\.com/i,
  /doubleclick\.net/i,
  /imasdk\.googleapis\.com/i,
  /app-measurement\.com/i,
  /firebase/i,
  /crashlytics/i,
  /admob/i,
  /gstatic\.com/i,
  /googleapis\.com/i,
  /w3\.org/i,
  /xml\.org/i,
  /purl\.org/i,
  /dashif\.org/i,
  /aomedia\.org/i,
  /mozilla\.org/i,
  /apache\.org/i,
  /creativecommons\.org/i,
  /itunes\.apple\.com/i,
  /play\.google\.com/i,
  /apple\.com/i,
  /microsoft\.com/i,
  /github\.com$/i,
  /wikipedia\.org/i,
  /youtu\.be/i,
  /youtube\.googleapis\.com/i,
  /azte\.co/i,
  /jsdelivr\.net/i,
  /cdnjs\.cloudflare\.com/i,
  /unpkg\.com/i,
];

const EXTRACTOR_REGEX =
  /(wish|vidhide|filelions|dhtpre|dhcplay|dood|d000d|do7go|dsvplay|myvidplay|mixdrop|m1xdrop|miixdrop|mxdrop|voe\.|filemoon|dropload|dr0pstream|streamtape|vidmoly|bigwarp|luluvid|videostr|megacloud|rabbitstream|ok\.ru|sibnet|uqload|mp4upload|pcloud|pixeldrain|dailymotion|yourupload|streamlare|streamruby|streamsb|streamhub|streamix|streamup|upns\.|strp2p|rpmstream|rpmvid|rpmplay|nupload|vidloft|vidoza|guccihide|ahvsh|sfastwish|flaswish|obeywish|cdnwish|asnwish|wishembed|strwish|embedwish|swiftplayers|hlswish|playerwish|vidcloud|fembed|hexupload|krakenfiles|send\.cm|mediafire|mega\.nz|goodstream|vembed|playerp2p|vidrift|zilla-networks|jeansaispasplus|\.sbs$)/i;

function resolveClipboxTextFile(): string {
  const candidates = [
    path.resolve(process.cwd(), 'public/assets/aistudio/rutas_clipbox_e2495d5e.txt'),
    path.resolve(process.cwd(), 'rutas_clipbox_e2495d5e.txt'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return candidates[0];
}

function tryDecodeBase64Json(url: string): { raw: string; decoded: unknown } | null {
  const candidates = new Set<string>();
  try {
    const parsed = new URL(url);
    for (const seg of parsed.pathname.split('/')) {
      if (seg.length >= 16) candidates.add(seg);
    }
    parsed.searchParams.forEach((val) => {
      if (val.length >= 16) candidates.add(val);
    });
  } catch {
    // fallback if not a full URL
  }
  const b64Matches = url.match(/([A-Za-z0-9+_-]{20,}={0,2})/g);
  if (b64Matches) {
    for (const m of b64Matches) candidates.add(m);
  }
  for (const token of candidates) {
    const normalized = token.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
    try {
      const pad = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
      const str = Buffer.from(normalized + pad, 'base64').toString('utf8').trim();
      if ((str.startsWith('{') && str.endsWith('}')) || (str.startsWith('[') && str.endsWith(']'))) {
        const parsed = JSON.parse(str);
        return { raw: token, decoded: parsed };
      }
    } catch {
      // not base64 json
    }
  }
  return null;
}

function inferLanguage(host: string, category: ClipboxCategoryId, urls: string[]): string {
  const h = host.toLowerCase();
  const joined = urls.join(' ').toLowerCase();
  if (category === 'sdk') return 'TECH';
  if (category === 'decoding' || category === 'subtitles' || category === 'extractors') return 'MULTI';
  if (category === 'cinema_es') {
    if (/latino|latam|cuevana|sololatino|flixlatam/i.test(h + joined)) return 'ES / LAT';
    return 'ES';
  }
  if (category === 'anime') {
    if (/animeflv|jkanime|latanime|tioanime|animefenix|animeonline\.ninja|animeav1/i.test(h)) return 'ES / SUB';
    if (/french-anime|french-manga/i.test(h)) return 'FR';
    if (/animesaturn|animeunity|animeworld/i.test(h)) return 'IT';
    return 'JP / EN';
  }
  if (/frembed|flemmix|onregardeou|wiflix|darkiworld/i.test(h)) return 'FR';
  if (/altadefinizione|cb01|streamingcommunity/i.test(h)) return 'IT';
  if (/filmpalast|hdfilme|einschalten|megakino|cinemathek|moflix|kinoger/i.test(h)) return 'DE';
  if (/zaluknij/i.test(h)) return 'PL';
  if (/seriesturcas/i.test(h)) return 'TR / ES';
  if (/tuktukcinema|cilootv/i.test(h)) return 'AR';
  if (/afterdark/i.test(h)) return 'FR / EN';
  if (/vsembed\.ru|hdrezka|ab2024\.ru/i.test(h)) return 'RU / MULTI';
  if (/clipbox|superbox/i.test(h)) return 'MULTI';
  return 'EN / MULTI';
}

function classifyHost(host: string, urls: string[]): {
  category: ClipboxCategoryId;
  role: string;
  isBoilerplate: boolean;
  probeAllowed: boolean;
  decodedNote?: string;
} {
  const h = host.toLowerCase().replace(/:$/, '');
  const joined = urls.join(' ').toLowerCase();

  // Check exact literal URL signals first
  if (h === 'github.com' && joined.includes('clipboxstreaming/clipbox')) {
    return {
      category: 'core',
      role: 'Repositorio oficial ClipBox',
      isBoilerplate: false,
      probeAllowed: true,
    };
  }
  if (h === 'raw.githubusercontent.com' && (joined.includes('vidsrc-keys') || joined.includes('multi-keys'))) {
    return {
      category: 'decoding',
      role: 'Repositorio remoto de claves de descifrado (vidsrc-keys / multi-keys)',
      isBoilerplate: false,
      probeAllowed: true,
      decodedNote: 'Claves dinámicas para desofuscar embeds VidSrc / Multi-Server.',
    };
  }
  if (h === 'raw.githubusercontent.com' && joined.includes('sin-se%c3%b1al.mp4')) {
    return {
      category: 'core',
      role: 'MP4 de respaldo (CineCityProvider fallback)',
      isBoilerplate: false,
      probeAllowed: true,
    };
  }
  if (h === 'www.youtube.com' || h === 'youtube.com') {
    return {
      category: 'extractors',
      role: 'Extractor de tráilers y vídeos YouTube',
      isBoilerplate: false,
      probeAllowed: true,
    };
  }

  if (CORE_HOSTS.has(h) && (h.includes('clipbox') || h.includes('superbox') || h === 't.me')) {
    return {
      category: 'core',
      role: h.includes('api.')
        ? 'API principal de configuración y catálogo ClipBox'
        : h === 't.me'
        ? 'Canal oficial Telegram ClipBox'
        : 'Portal central y ajustes remotos (Zoog / App-Settings)',
      isBoilerplate: false,
      probeAllowed: true,
    };
  }

  if (SUBTITLE_HOSTS.has(h) || /subdl|opensubtitles|introdb|subsource/i.test(h)) {
    return {
      category: 'subtitles',
      role: h.includes('introdb')
        ? 'API de tiempos de intro/recap por TMDB ID'
        : 'Motor externo de subtítulos (SubDL / OpenSubtitles / Stremio)',
      isBoilerplate: false,
      probeAllowed: true,
    };
  }

  if (DECODING_HOSTS.has(h) || /enc-dec|fkplayer|afterdark\.baby|wing\.st|wecollege|volecitor/i.test(h)) {
    let decodedNote: string | undefined;
    for (const u of urls) {
      const b64 = tryDecodeBase64Json(u);
      if (b64) {
        decodedNote = `Payload Base64 descifrado: ${JSON.stringify(b64.decoded)}`;
        break;
      }
    }
    if (h === 'enc-dec.app') {
      decodedNote = 'Endpoints: dec/enc-cinejoy, kisskh, megaplay, meowtv, nexa, videasy';
    } else if (h === 'fkplayer.xyz') {
      decodedNote = 'Endpoint /api/decoding para tokens de reproductor';
    } else if (h === 'proxy.afterdark.baby') {
      decodedNote = 'Rutas proxy codificadas (?url=): /alejandro, /boom-clap, /elizabeth-taylor, /rolly';
    }
    return {
      category: 'decoding',
      role:
        h.includes('tmdb') || h.includes('imdb') || h.includes('fanart')
          ? 'API de metadatos e imágenes (TMDB / IMDb / Fanart)'
          : h.includes('dns') || h.includes('icanhazip')
          ? 'Resolución DoH (DNS over HTTPS) y detección IP'
          : 'Servicio de descifrado, tokens y proxy de streams',
      isBoilerplate: false,
      probeAllowed: true,
      decodedNote,
    };
  }

  if (ANIME_HOSTS.has(h) || /anime|kitsu|aniskip|manga|cartoon/i.test(h)) {
    return {
      category: 'anime',
      role: h.includes('aniskip')
        ? 'API AniSkip v2 (tiempos de Opening/Ending)'
        : h.includes('kitsu')
        ? 'API gráfica Kitsu Anime Database'
        : h.includes('allanime')
        ? 'Motor AllAnime (GraphQL + player.html)'
        : 'Portal / Scraper de Anime',
      isBoilerplate: false,
      probeAllowed: true,
    };
  }

  if (CINEMA_ES_HOSTS.has(h) || /pelis|seriesflix|flixlatam|cinecalidad|sololatino|doramasflix|cuevana|cine24h|lacartoons|kidraz|verhdlink/i.test(h)) {
    return {
      category: 'cinema_es',
      role: 'Proveedor de Cine y Series en Español / Latino',
      isBoilerplate: false,
      probeAllowed: true,
    };
  }

  if (CINEMA_INTL_HOSTS.has(h) || /vidlink|videasy|vidzee|vidrock|vidnest|vidflix|vixsrc|vsembed|primesrc|megaplay|moviesapi|2embed|sflix|bflix|ridomovies|cinehax|frembed|flemmix|wiflix|altadefinizione|cb01|filmpalast|hdfilme|einschalten|megakino|cinemathek|moflix|zaluknij|seriesturcas|tuktuk|cilootv/i.test(h)) {
    return {
      category: 'cinema_intl',
      role: /vidlink|videasy|vidzee|vidrock|vidnest|vixsrc|moviesapi|2embed|megaplay/i.test(h)
        ? 'Player Multi-Servidor por TMDB/IMDb ID'
        : 'Portal de Cine y Series Internacional',
      isBoilerplate: false,
      probeAllowed: true,
    };
  }

  if (SDK_HOST_PATTERNS.some((re) => re.test(h))) {
    const isPrivate = /^127\.0\.0\.1|^localhost|^\.\.\.|^…/i.test(h);
    return {
      category: 'sdk',
      role: isPrivate ? 'Referencia local / placeholder del escaneo' : 'SDK Android, AdMob, Firebase o estándar XML/W3C',
      isBoilerplate: true,
      probeAllowed: false,
    };
  }

  if (EXTRACTOR_REGEX.test(h)) {
    return {
      category: 'extractors',
      role: /\.sbs$/i.test(h)
        ? 'Mirror rotativo de host StreamWish / VidHide (.sbs)'
        : 'Extractor / Servidor de vídeo directo o embed',
      isBoilerplate: false,
      probeAllowed: true,
    };
  }

  // Fallback heuristic for remaining hosts in clipbox inventory
  if (/player|stream|vid|embed|cdn|watch|flix|cine|pelis|tv|hd|mov/i.test(h)) {
    return {
      category: 'extractors',
      role: 'Host de reproducción o mirror detectado en el APK',
      isBoilerplate: false,
      probeAllowed: true,
    };
  }

  return {
    category: 'sdk',
    role: 'Dominio auxiliar o librería embebida',
    isBoilerplate: true,
    probeAllowed: !/^(\d+\.\d+\.\d+\.\d+|localhost|…)/.test(h),
  };
}

function classifyRoutePattern(pattern: string): ClipboxRoutePattern {
  const p = pattern.trim();
  if (/\.m3u8|\.mp4/i.test(p)) {
    return {
      pattern: p,
      kind: 'hls_mp4',
      decodedName: p.replace(/^\/+/, ''),
      description: 'Ruta directa de manifiesto HLS (.m3u8) o vídeo MP4',
    };
  }
  const provMatch = p.match(/providers?\/([A-Za-z0-9_$-]+)/i) || p.match(/\/([A-Za-z0-9]+Provider)(?:[$;]|$)/);
  if (provMatch) {
    return {
      pattern: p,
      kind: 'provider_smali',
      decodedName: provMatch[1].replace(/\$.*$/, ''),
      description: 'Proveedor de catálogo reconstruido desde Smali',
    };
  }
  const extMatch = p.match(/extractors?\/([A-Za-z0-9_$-]+)/i) || p.match(/\/([A-Za-z0-9]+Extractor)(?:[$;]|$)/);
  if (extMatch) {
    return {
      pattern: p,
      kind: 'extractor_smali',
      decodedName: extMatch[1].replace(/\$.*$/, ''),
      description: 'Extractor de vídeo reconstruido desde Smali',
    };
  }
  if (/embed|player\.|source|variant|subtitle|video/i.test(p) && !/PlayerActivity;|player_/i.test(p)) {
    return {
      pattern: p,
      kind: 'player_embed',
      decodedName: p.replace(/^\/+/, ''),
      description: 'Endpoint de reproductor, embed o selector de fuentes',
    };
  }
  return {
    pattern: p,
    kind: 'app_internal',
  };
}

let cachedInventory: ClipboxParsedInventory | null = null;

export function parseClipboxInventory(forceReload = false): ClipboxParsedInventory {
  if (cachedInventory && !forceReload) return cachedInventory;

  const filePath = resolveClipboxTextFile();
  const raw = fs.existsSync(filePath)
    ? fs.readFileSync(filePath, 'utf8')
    : CLIPBOX_EMBEDDED_RAW_TEXT;
  const lines = raw.split(/\r?\n/);

  let declaredSummary = { literalUrls: 574, hosts: 440, routePatterns: 954 };
  const hostGroups: Array<{ host: string; urls: string[] }> = [];
  const rawPatterns: string[] = [];
  const mediaRefs: ClipboxMediaRef[] = [];

  let mode: 'header' | 'urls' | 'patterns' | 'media' | 'origins' = 'header';
  let currentHost: { host: string; urls: string[] } | null = null;
  let currentMediaSub: 'hls' | 'mp4' = 'hls';

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const summaryMatch = trimmed.match(/RESUMEN:\s*(\d+)\s+URLs.*?(\d+)\s+hosts.*?(\d+)\s+patrones/i);
    if (summaryMatch) {
      declaredSummary = {
        literalUrls: Number(summaryMatch[1]),
        hosts: Number(summaryMatch[2]),
        routePatterns: Number(summaryMatch[3]),
      };
      continue;
    }

    if (trimmed.startsWith('1) URLS LITERALES')) {
      mode = 'urls';
      continue;
    }
    if (trimmed.startsWith('2) RUTAS Y ENDPOINTS')) {
      if (currentHost) {
        hostGroups.push(currentHost);
        currentHost = null;
      }
      mode = 'patterns';
      continue;
    }
    if (trimmed.startsWith('3) REFERENCIAS A HLS Y VIDEO')) {
      mode = 'media';
      continue;
    }
    if (trimmed.startsWith('4) ORIGENES / ARCHIVOS')) {
      mode = 'origins';
      continue;
    }

    if (mode === 'urls') {
      const hostBracket = trimmed.match(/^\[(.+)\]$/);
      if (hostBracket) {
        if (currentHost) hostGroups.push(currentHost);
        currentHost = { host: hostBracket[1].trim(), urls: [] };
      } else if (currentHost && /^https?:\/\//i.test(trimmed)) {
        currentHost.urls.push(trimmed);
      }
    } else if (mode === 'patterns') {
      rawPatterns.push(trimmed);
    } else if (mode === 'media') {
      if (/^HLS\s*\(/i.test(trimmed)) {
        currentMediaSub = 'hls';
        continue;
      }
      if (/^MP4\s*\(/i.test(trimmed)) {
        currentMediaSub = 'mp4';
        continue;
      }
      const m = trimmed.match(/^(https?:\/\/\S+)(?:\s+\[archivos:\s*(.+?)\])?$/i);
      if (m) {
        const refUrl = m[1];
        const sources = m[2] ? m[2].split(',').map((s) => s.trim()).filter(Boolean) : [];
        let note = 'Referencia estática en recursos del APK';
        if (refUrl.includes('SIN-SE%C3%91AL.mp4')) {
          note = 'Vídeo fallback "Sin señal" integrado en CineCityProvider';
        } else if (refUrl.includes('mp4upload.com')) {
          note = 'Extractor directo MP4Upload (Mp4UploadExtractor)';
        }
        mediaRefs.push({
          kind: currentMediaSub,
          url: refUrl,
          sources,
          note,
        });
      }
    }
  }

  const hosts: ClipboxHostEntry[] = [];
  const decodedTokens: ClipboxDecodedToken[] = [];
  const categoryCounts: Record<ClipboxCategoryId, number> = {
    core: 0,
    decoding: 0,
    cinema_es: 0,
    cinema_intl: 0,
    anime: 0,
    extractors: 0,
    subtitles: 0,
    sdk: 0,
  };

  let literalUrlCount = 0;

  for (const grp of hostGroups) {
    literalUrlCount += grp.urls.length;
    const cls = classifyHost(grp.host, grp.urls);
    categoryCounts[cls.category] += 1;

    const entry: ClipboxHostEntry = {
      host: grp.host,
      urls: grp.urls,
      category: cls.category,
      categoryLabel: CATEGORY_LABELS[cls.category],
      language: inferLanguage(grp.host, cls.category, grp.urls),
      role: cls.role,
      isBoilerplate: cls.isBoilerplate,
      probeAllowed: cls.probeAllowed,
      decodedNote: cls.decodedNote,
    };
    hosts.push(entry);

    for (const u of grp.urls) {
      const b64 = tryDecodeBase64Json(u);
      if (b64) {
        decodedTokens.push({
          label: `Config Base64 (${grp.host})`,
          host: grp.host,
          rawUrl: u,
          encoding: 'base64-json',
          decodedSummary: 'Configuración JSON incrustada en URL (calidades y orden)',
          decodedPayload: b64.decoded,
        });
      } else if (grp.host === 'enc-dec.app') {
        decodedTokens.push({
          label: `Decrypt API · ${u.split('/').pop() || grp.host}`,
          host: grp.host,
          rawUrl: u,
          encoding: 'api-endpoint',
          decodedSummary: `Endpoint externo de cifrado/descifrado para provider "${u.split('/').pop()?.replace(/^(dec|enc)-/, '') || 'stream'}"`,
        });
      } else if (grp.host === 'fkplayer.xyz' || grp.host === 'api.wing.st' || grp.host === 'api.wecollege.net') {
        decodedTokens.push({
          label: `Token/Server API · ${grp.host}`,
          host: grp.host,
          rawUrl: u,
          encoding: 'api-endpoint',
          decodedSummary: 'API de decodificación de tokens o resolución de servidores',
        });
      } else if (u.includes('vidsrc-keys') || u.includes('multi-keys')) {
        decodedTokens.push({
          label: u.includes('vidsrc-keys') ? 'VidSrc Keys JSON (Ciarands)' : 'Multi-Keys Index (Rowdy-Avocado)',
          host: grp.host,
          rawUrl: u,
          encoding: 'keys-repo',
          decodedSummary: 'Diccionario vivo de claves para desofuscar fuentes VidSrc / embeds',
        });
      } else if (grp.host === 'proxy.afterdark.baby') {
        decodedTokens.push({
          label: `Proxy Router · ${u.split('/').pop()}`,
          host: grp.host,
          rawUrl: u,
          encoding: 'proxy-router',
          decodedSummary: 'Enrutador proxy cifrado/nombrado para saltar bloqueos CORS/Referer',
        });
      }
    }
  }

  const routePatterns = rawPatterns.map(classifyRoutePattern);

  // Extract unique decoded providers & extractors from section 2 + known section 1 providers
  const providerMap = new Map<string, { name: string; rawPattern: string; region: string }>();
  const extractorMap = new Map<string, { name: string; rawPattern: string; family: string }>();

  for (const rp of routePatterns) {
    if (rp.kind === 'provider_smali' && rp.decodedName) {
      if (!providerMap.has(rp.decodedName)) {
        providerMap.set(rp.decodedName, {
          name: rp.decodedName,
          rawPattern: rp.pattern,
          region: /cinecity|pelis|latam|animeflv|jk/i.test(rp.decodedName)
            ? 'ES / LAT'
            : /streamingcommunity|altadefinizione/i.test(rp.decodedName)
            ? 'IT / MULTI'
            : 'GLOBAL',
        });
      }
    } else if (rp.kind === 'extractor_smali' && rp.decodedName) {
      if (!extractorMap.has(rp.decodedName)) {
        extractorMap.set(rp.decodedName, {
          name: rp.decodedName,
          rawPattern: rp.pattern,
          family: /wish/i.test(rp.decodedName)
            ? 'StreamWish Family'
            : /sibnet/i.test(rp.decodedName)
            ? 'Sibnet Video'
            : /mp4/i.test(rp.decodedName)
            ? 'MP4Upload'
            : /stream/i.test(rp.decodedName)
            ? 'Stream Host Extractor'
            : 'Video Extractor',
        });
      }
    }
  }

  // Also include section 3 explicit provider/extractor names
  for (const mr of mediaRefs) {
    for (const s of mr.sources) {
      const pm = s.match(/providers\/([A-Za-z0-9_]+)\./);
      if (pm && !providerMap.has(pm[1])) {
        providerMap.set(pm[1], { name: pm[1], rawPattern: s, region: 'ES / LAT' });
      }
      const em = s.match(/extractors\/([A-Za-z0-9_]+)\./);
      if (em && !extractorMap.has(em[1])) {
        extractorMap.set(em[1], { name: em[1], rawPattern: s, family: 'MP4Upload' });
      }
    }
  }

  const streamingHosts = hosts.filter((h) => !h.isBoilerplate).length;
  const sdkHosts = hosts.filter((h) => h.isBoilerplate).length;

  cachedInventory = {
    sourceFile: 'rutas_clipbox_e2495d5e.txt',
    declaredSummary,
    actualCounts: {
      literalUrls: literalUrlCount,
      hosts: hosts.length,
      routePatterns: routePatterns.length,
      streamingHosts,
      sdkHosts,
    },
    categoryCounts,
    hosts,
    decodedTokens,
    routePatterns,
    decodedProviders: Array.from(providerMap.values()),
    decodedExtractors: Array.from(extractorMap.values()),
    mediaRefs,
  };

  return cachedInventory;
}

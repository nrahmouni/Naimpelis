import fs from 'fs';
import path from 'path';
import { BELIX_EMBEDDED_RAW_TEXT } from './belixRawData.ts';

export type BelixHostCategoryId = 'app_players' | 'community' | 'streaming_specs' | 'sdk_docs';

export interface BelixApiEndpoint {
  id: string;
  label: string;
  path: string;
  action: string;
  requiresCategoryId: boolean;
  requiresStreamOrVodOrSeriesId?: 'stream_id' | 'vod_id' | 'series_id';
  group: 'auth_epg' | 'live' | 'vod' | 'series';
}

export interface BelixDynamicRoute {
  id: string;
  label: string;
  template: string;
  kind: 'live' | 'movie' | 'series' | 'playlist';
  notes: string;
}

export interface BelixAppExternalUrl {
  url: string;
  host: string;
  role: string;
  origins: string[];
}

export interface BelixHostEntry {
  host: string;
  urls: string[];
  category: BelixHostCategoryId;
  categoryLabel: string;
  role: string;
  decodedNote?: string;
  origins: string[];
  isAppCodeHost: boolean;
  probeAllowed: boolean;
}

export interface BelixCodeFileNode {
  file: string;
  component: string;
  role: string;
  mechanism: string;
}

export interface BelixParsedInventory {
  sourceFile: string;
  archiveName: string;
  packageName: string;
  declaredSummary: {
    literalUrls: number;
    uniqueHosts: number;
    appPackageUrls: number;
  };
  actualCounts: {
    literalUrls: number;
    hosts: number;
    appExternalUrls: number;
    apiEndpoints: number;
    apiParams: number;
    dynamicRoutes: number;
    relevantCodeFiles: number;
  };
  categoryCounts: Record<BelixHostCategoryId, number>;
  apiEndpoints: BelixApiEndpoint[];
  apiParams: string[];
  dynamicRoutes: BelixDynamicRoute[];
  streamingNotes: string[];
  appExternalUrls: BelixAppExternalUrl[];
  hosts: BelixHostEntry[];
  codeFiles: BelixCodeFileNode[];
  limitations: string[];
}

const CATEGORY_LABELS: Record<BelixHostCategoryId, string> = {
  app_players: 'App com.ibopro.ultra (Tráilers / Reproductores)',
  community: 'Canal Telegram & Enlaces Externos',
  streaming_specs: 'Motor ExoPlayer / DASH / DRM / Local',
  sdk_docs: 'SDK Android / Google / Realm / GitHub',
};

const STREAMING_SPEC_HOSTS = new Set([
  '0.0.0.0',
  'localhost',
  'aomedia.org',
  'dashif.org',
  'default.url',
  'developer.apple.com',
  'schemas.microsoft.com',
  'www.w3.org',
  'x',
]);

const APP_CODE_HOSTS = new Set(['www.youtube.com', 'play.google.com']);

function resolveBelixTextFile(): string {
  const candidates = [
    path.resolve(process.cwd(), 'public/assets/aistudio/rutas_Belix_TV_6fb3f038.txt'),
    path.resolve(process.cwd(), 'rutas_Belix_TV_6fb3f038.txt'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return candidates[0];
}

function classifyEndpointGroup(pathStr: string): BelixApiEndpoint['group'] {
  if (pathStr.includes('live_')) return 'live';
  if (pathStr.includes('vod_')) return 'vod';
  if (pathStr.includes('series')) return 'series';
  return 'auth_epg';
}

function extractAction(pathStr: string): string {
  const m = pathStr.match(/action=([a-z0-9_]+)/i);
  if (m) return m[1];
  if (pathStr.includes('xmltv.php')) return 'xmltv';
  return 'auth_account_info';
}

function detectRequiredEntityParam(
  action: string
): 'stream_id' | 'vod_id' | 'series_id' | undefined {
  if (action === 'get_vod_info') return 'vod_id';
  if (action === 'get_series_info') return 'series_id';
  if (action === 'get_short_epg' || action === 'get_simple_data_table') return 'stream_id';
  return undefined;
}

function classifyHost(
  host: string,
  urls: string[],
  origins: string[]
): {
  category: BelixHostCategoryId;
  role: string;
  decodedNote?: string;
  isAppCodeHost: boolean;
  probeAllowed: boolean;
} {
  const h = host.toLowerCase();

  if (h === 'www.youtube.com') {
    return {
      category: 'app_players',
      role: 'Tráilers VOD y Series en Activities de com.ibopro.ultra',
      decodedNote:
        'Concatena el ID de tráiler TMDB tras /watch?v= desde MovieInfoActivity, SeriesInfoActivity y MovieCreditActivity.',
      isAppCodeHost: true,
      probeAllowed: true,
    };
  }

  if (h === 'play.google.com') {
    return {
      category: 'app_players',
      role: 'Derivación a reproductores externos (MX Player & VLC)',
      decodedNote:
        'Si el usuario elige reproductor externo en Live/VOD/Series, redirige a Google Play para com.mxtech.videoplayer.ad u org.videolan.vlc.',
      isAppCodeHost: true,
      probeAllowed: true,
    };
  }

  if (h === 't.me') {
    return {
      category: 'community',
      role: 'Canal o contacto comunitario embebido (t.me/shadeedtv)',
      decodedNote:
        'Enlace Telegram literal hallado en recursos/código del APK compilado.',
      isAppCodeHost: false,
      probeAllowed: true,
    };
  }

  if (STREAMING_SPEC_HOSTS.has(h)) {
    const isLocalOrPlaceholder =
      h === '0.0.0.0' || h === 'localhost' || h === 'default.url' || h === 'x';
    return {
      category: 'streaming_specs',
      role:
        h === '0.0.0.0' || h === 'localhost'
          ? 'Bind HTTP / Socket loopback local del dispositivo'
          : isLocalOrPlaceholder
          ? 'Placeholder URI interno de ExoPlayer / DRM'
          : 'Estándar ExoPlayer2 (MPEG-DASH IF / ID3 EMSG / PlayReady DRM / TTML)',
      decodedNote:
        h === '0.0.0.0'
          ? 'http://0.0.0.0:1234 — Dirección de escucha local embebida (bloqueada en sondas remotas).'
          : undefined,
      isAppCodeHost: false,
      probeAllowed: false,
    };
  }

  let role = 'Documentación SDK / Framework Android / Google';
  let decodedNote: string | undefined;
  if (h === 'docs.mongodb.com' || h === 'realm.io') {
    role = 'Base de datos local Realm Java / RxJava en el APK';
    decodedNote = 'Belix TV usa Realm para persistir listas Xtream, canales favoritos y caché local.';
  } else if (h === 'github.com') {
    role = 'Librerías Open Source (Kotlin Coroutines, Realm, RoundedImageView)';
  } else if (h === 'www.googleapis.com' || h === 'plus.google.com') {
    role = 'Scopes Google Sign-In / Drive / Games heredados de SDK';
  }

  return {
    category: 'sdk_docs',
    role,
    decodedNote,
    isAppCodeHost: false,
    probeAllowed:
      h === 'github.com' || h === 'developer.android.com' || h === 'docs.mongodb.com' || h === 'realm.io',
  };
}

let cachedBelixInventory: BelixParsedInventory | null = null;

export function parseBelixInventory(forceReload = false): BelixParsedInventory {
  if (cachedBelixInventory && !forceReload) return cachedBelixInventory;

  const filePath = resolveBelixTextFile();
  const raw = fs.existsSync(filePath)
    ? fs.readFileSync(filePath, 'utf8')
    : BELIX_EMBEDDED_RAW_TEXT;
  const normalizedRaw =
    raw.split(/\r?\n/).length <= 3 && raw.includes('\\n')
      ? raw.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n')
      : raw;
  const lines = normalizedRaw.split(/\r?\n/);

  let archiveName = 'Belix TV (1).apk_Decompiler.com.zip';
  const declaredSummary = {
    literalUrls: 48,
    uniqueHosts: 21,
    appPackageUrls: 3,
  };

  let section: 'header' | 's1' | 's2' | 's3' | 's4' | 's5' | 's6' | 's7' | 's8' = 'header';
  let inParamsBlock = false;
  let inDynamicNotesBlock = false;

  const apiEndpoints: BelixApiEndpoint[] = [];
  const apiParams: string[] = [];
  const dynamicRoutes: BelixDynamicRoute[] = [];
  const streamingNotes: string[] = [];
  const appExternalUrls: BelixAppExternalUrl[] = [];
  const projectLiteralUrls: string[] = [];
  const listedDomains: string[] = [];
  const codeFiles: BelixCodeFileNode[] = [];
  const limitations: string[] = [];

  let currentAppUrl: BelixAppExternalUrl | null = null;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed || /^[-=]+$/.test(trimmed)) continue;

    if (trimmed.startsWith('Fuente:')) {
      archiveName = trimmed.replace('Fuente:', '').trim();
      continue;
    }

    const literalMatch = trimmed.match(/^- URLs literales únicas detectadas[^:]*:\s*(\d+)/i);
    if (literalMatch) {
      declaredSummary.literalUrls = Number(literalMatch[1]);
      continue;
    }
    const hostsMatch = trimmed.match(/^- Hosts\/dominios extraídos[^:]*:\s*(\d+)/i);
    if (hostsMatch) {
      declaredSummary.uniqueHosts = Number(hostsMatch[1]);
      continue;
    }
    const pkgMatch = trimmed.match(/^- URLs literales halladas dentro del paquete[^:]*:\s*(\d+)/i);
    if (pkgMatch) {
      declaredSummary.appPackageUrls = Number(pkgMatch[1]);
      continue;
    }

    if (trimmed.startsWith('1) ENDPOINTS API')) {
      section = 's1';
      inParamsBlock = false;
      continue;
    }
    if (trimmed.startsWith('2) RUTAS DE REPRODUCCIÓN')) {
      section = 's2';
      inDynamicNotesBlock = false;
      continue;
    }
    if (trimmed.startsWith('3) FORMATOS Y REFERENCIAS')) {
      section = 's3';
      continue;
    }
    if (trimmed.startsWith('4) URLS EXTERNAS LITERALES')) {
      section = 's4';
      continue;
    }
    if (trimmed.startsWith('5) OTRAS URLS LITERALES')) {
      if (currentAppUrl) {
        appExternalUrls.push(currentAppUrl);
        currentAppUrl = null;
      }
      section = 's5';
      continue;
    }
    if (trimmed.startsWith('6) DOMINIOS DE LAS URLS')) {
      section = 's6';
      continue;
    }
    if (trimmed.startsWith('7) ARCHIVOS DE CÓDIGO')) {
      section = 's7';
      continue;
    }
    if (trimmed.startsWith('8) LIMITACIONES DEL ANÁLISIS')) {
      section = 's8';
      continue;
    }
    if (trimmed.startsWith('FIN DEL INVENTARIO')) {
      break;
    }

    if (section === 's1') {
      if (/^Parámetros que aparecen/i.test(trimmed)) {
        inParamsBlock = true;
        continue;
      }
      if (inParamsBlock && trimmed.startsWith('- ')) {
        apiParams.push(trimmed.slice(2).trim());
        continue;
      }
      if (trimmed.startsWith('- ')) {
        const body = trimmed.slice(2);
        const colonIdx = body.lastIndexOf(': /');
        if (colonIdx > 0) {
          const label = body.slice(0, colonIdx).trim();
          const epPath = body.slice(colonIdx + 2).trim();
          const action = extractAction(epPath);
          apiEndpoints.push({
            id: `ep-${apiEndpoints.length + 1}-${action}`,
            label,
            path: epPath,
            action,
            requiresCategoryId: epPath.includes('category_id='),
            requiresStreamOrVodOrSeriesId: detectRequiredEntityParam(action),
            group: classifyEndpointGroup(epPath),
          });
        }
      }
    } else if (section === 's2') {
      if (/^Notas:/i.test(trimmed)) {
        inDynamicNotesBlock = true;
        continue;
      }
      if (!inDynamicNotesBlock && trimmed.startsWith('- ')) {
        const body = trimmed.slice(2);
        const colonIdx = body.lastIndexOf(': /');
        if (colonIdx > 0) {
          const label = body.slice(0, colonIdx).trim();
          const template = body.slice(colonIdx + 2).trim();
          const kind: BelixDynamicRoute['kind'] = template.startsWith('/live/')
            ? 'live'
            : template.startsWith('/movie/')
            ? 'movie'
            : template.startsWith('/series/')
            ? 'series'
            : 'playlist';
          dynamicRoutes.push({
            id: `dyn-${kind}`,
            label,
            template,
            kind,
            notes:
              kind === 'playlist'
                ? 'Descarga completa de lista M3U Plus solicitando transporte MPEG-TS.'
                : 'Construida dinámicamente con host, usuario, contraseña, ID de contenido y extensión.',
          });
        }
      }
    } else if (section === 's3') {
      if (trimmed.startsWith('- ')) {
        streamingNotes.push(trimmed.slice(2).trim());
      }
    } else if (section === 's4') {
      if (trimmed.startsWith('- http')) {
        if (currentAppUrl) appExternalUrls.push(currentAppUrl);
        const u = trimmed.slice(2).trim();
        let host = '';
        try {
          host = new URL(u).hostname.toLowerCase();
        } catch {
          host = u;
        }
        const role =
          host === 'www.youtube.com'
            ? 'Reproducción de tráilers de películas y series en YouTube'
            : u.includes('mxtech')
            ? 'Instalación/enlace externo a MX Player'
            : 'Instalación/enlace externo a VLC Media Player';
        currentAppUrl = { url: u, host, role, origins: [] };
      } else if (currentAppUrl && trimmed.startsWith('origen:')) {
        currentAppUrl.origins.push(trimmed.replace(/^origen:\s*/i, '').trim());
      }
    } else if (section === 's5') {
      if (trimmed.startsWith('- http')) {
        projectLiteralUrls.push(trimmed.slice(2).trim());
      }
    } else if (section === 's6') {
      if (trimmed.startsWith('- ')) {
        listedDomains.push(trimmed.slice(2).trim().toLowerCase());
      }
    } else if (section === 's7') {
      if (trimmed.startsWith('- ')) {
        const body = trimmed.slice(2).trim();
        const [filePart, rolePart] = body.split('—').map((p) => p.trim());
        const fileName = path.basename(filePart || body).replace(/\.smali$/i, '');
        const mechanismMap: Record<string, string> = {
          APIService: 'Interfaces Retrofit que mapean /player_api.php y /xmltv.php con parámetros Query.',
          GetSharedInfo: 'Helper central que concatena baseHost + credenciales para /live/, /movie/, /series/ y /get.php.',
          LiveChannelActivity: 'Lee las preferencias de extensión live y arranca ExoPlayer o reproductor externo.',
          MoviePlayerActivity: 'Inyecta getExtension() dinámico sobre /movie/{user}/{pass}/{id}.{ext}.',
          MovieModel: 'Modelo Realm/POJO VOD que almacena container_extension y stream_id.',
        };
        codeFiles.push({
          file: filePart || body,
          component: fileName,
          role: rolePart || 'Clase clave de Belix TV',
          mechanism: mechanismMap[fileName] || rolePart || 'Componente Smali del paquete com.ibopro.ultra.',
        });
      }
    } else if (section === 's8') {
      if (trimmed.startsWith('- ')) {
        limitations.push(trimmed.slice(2).trim());
      }
    }
  }

  if (currentAppUrl) {
    appExternalUrls.push(currentAppUrl);
    currentAppUrl = null;
  }

  // Group all 48 literal URLs by extracted domain preserving all origins
  const allUrls = [...appExternalUrls.map((a) => a.url), ...projectLiteralUrls];
  const hostUrlMap = new Map<string, string[]>();
  const hostOriginMap = new Map<string, string[]>();

  for (const dom of listedDomains) {
    hostUrlMap.set(dom, []);
    hostOriginMap.set(dom, []);
  }

  for (const appEntry of appExternalUrls) {
    const existingOrigins = hostOriginMap.get(appEntry.host) || [];
    for (const org of appEntry.origins) {
      if (!existingOrigins.includes(org)) existingOrigins.push(org);
    }
    hostOriginMap.set(appEntry.host, existingOrigins);
  }

  for (const rawUrl of allUrls) {
    try {
      const parsed = new URL(rawUrl);
      const h = parsed.hostname.toLowerCase();
      if (!hostUrlMap.has(h)) hostUrlMap.set(h, []);
      const arr = hostUrlMap.get(h)!;
      if (!arr.includes(rawUrl)) arr.push(rawUrl);
    } catch {
      // ignore malformed
    }
  }

  const categoryCounts: Record<BelixHostCategoryId, number> = {
    app_players: 0,
    community: 0,
    streaming_specs: 0,
    sdk_docs: 0,
  };

  const hosts: BelixHostEntry[] = Array.from(hostUrlMap.entries()).map(([host, urls]) => {
    const origins = hostOriginMap.get(host) || [];
    const cls = classifyHost(host, urls, origins);
    categoryCounts[cls.category] += 1;
    return {
      host,
      urls,
      category: cls.category,
      categoryLabel: CATEGORY_LABELS[cls.category],
      role: cls.role,
      decodedNote: cls.decodedNote,
      origins,
      isAppCodeHost: cls.isAppCodeHost || APP_CODE_HOSTS.has(host),
      probeAllowed: cls.probeAllowed,
    };
  });

  cachedBelixInventory = {
    sourceFile: 'rutas_Belix_TV_6fb3f038.txt',
    archiveName,
    packageName: 'com.ibopro.ultra',
    declaredSummary,
    actualCounts: {
      literalUrls: allUrls.length,
      hosts: hosts.length,
      appExternalUrls: appExternalUrls.length,
      apiEndpoints: apiEndpoints.length,
      apiParams: apiParams.length,
      dynamicRoutes: dynamicRoutes.length,
      relevantCodeFiles: codeFiles.length,
    },
    categoryCounts,
    apiEndpoints,
    apiParams,
    dynamicRoutes,
    streamingNotes,
    appExternalUrls,
    hosts,
    codeFiles,
    limitations,
  };

  return cachedBelixInventory;
}

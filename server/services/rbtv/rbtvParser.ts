import fs from 'fs';
import path from 'path';
import { RBTV_EMBEDDED_RAW_TEXT } from './rbtvRawData.ts';

export type RbtvCategoryId = 'core' | 'doh' | 'streaming_specs' | 'sdk';

export interface RbtvUrlItem {
  url: string;
  references: string[];
  pathSpec?: string;
}

export interface RbtvHostEntry {
  host: string;
  declaredUrlCount: number;
  urls: string[];
  urlItems: RbtvUrlItem[];
  paths: string[];
  category: RbtvCategoryId;
  categoryLabel: string;
  role: string;
  decodedNote?: string;
  isCoreAppDomain: boolean;
  probeAllowed: boolean;
}

export interface RbtvMediaFormat {
  ext: string;
  kind: 'manifest' | 'segment' | 'video' | 'audio' | 'subtitle';
  description: string;
}

export interface RbtvArchitectureNode {
  component: string;
  javaRef: string;
  role: string;
  endpoints: string[];
  mechanism: string;
}

export interface RbtvParsedInventory {
  sourceFile: string;
  archiveName: string;
  declaredSummary: {
    inspectedFiles: number;
    absoluteUrls: number;
    uniqueHosts: number;
    explicitHlsDashUrls: number;
    explicitVideoUrls: number;
  };
  actualCounts: {
    absoluteUrls: number;
    hosts: number;
    coreDomains: number;
    dohResolvers: number;
    paths: number;
    mediaFormats: number;
  };
  categoryCounts: Record<RbtvCategoryId, number>;
  hosts: RbtvHostEntry[];
  pathsByHost: Array<{ host: string; paths: string[] }>;
  mediaFormats: RbtvMediaFormat[];
  primaryDomains: string[];
  architectureNodes: RbtvArchitectureNode[];
}

const CATEGORY_LABELS: Record<RbtvCategoryId, string> = {
  core: 'RBTV+ Core APIs y Dominios',
  doh: 'Resolvers DoH (DNS-over-HTTPS)',
  streaming_specs: 'Motor P2P / ExoPlayer / DRM',
  sdk: 'SDK, Firebase, Ads y Enlaces',
};

const CORE_DOMAIN_NOTES: Record<string, { role: string; note: string }> = {
  'www.rbtv77.com': {
    role: 'Dominio marca RBTV77+ e interceptor de red HTTP',
    note: 'Inyectado en NetworkInterceptor (Referer/Origin/User-Agent de peticiones API y vídeo).',
  },
  'apis-data10.tcrbg61levl.cfd': {
    role: 'API principal de datos, ligas y metadatos',
    note: 'Inicializado al arranque en com/rblive/launcher/App como endpoint base de catálogo.',
  },
  'apis-live.ta2mnt200stayr2.cfd': {
    role: 'API de eventos y señales en directo',
    note: 'Inicializado al arranque en com/rblive/launcher/App para feeds live.',
  },
  'logos1.tcrbg61levl.cfd': {
    role: 'CDN de escudos, ligas y logos de canales',
    note: 'Almacenado en App para resolver iconos de equipos y emisoras.',
  },
  'wv11.hkkmwtotalwypubook.cfd': {
    role: 'Host de reproductor WebView / embeds',
    note: 'Carga vistas HTML/player embebidas configuradas desde App.',
  },
  'may.2f17ubowlsjn46easier.cfd': {
    role: 'Gestor dinámico de parámetros y bootstrap',
    note: 'Usado por ParamsManager para descargar configuración remota de servidores.',
  },
  'vip1.openaicommunities.bond': {
    role: 'Nodo API /v1 de parámetros y configuración',
    note: 'Endpoint redundante v1 consultado por ParamsManager.',
  },
  'vip1.openaicommunities.click': {
    role: 'Nodo espejo API /v1 de parámetros',
    note: 'Mirror de respaldo v1 en ParamsManager ante bloqueo del primario.',
  },
  'vip1.openaicommunities.shop': {
    role: 'Nodo API /v1 de anuncios y avisos (PPManager)',
    note: 'Usado por PPManager$currAnnounces$2 para avisos y rotación de estado.',
  },
  'vip1.openalcommunities.sbs': {
    role: 'Nodo espejo alternativo API /v1 (typo/backup)',
    note: 'Dominio de contingencia adicional configurado en ParamsManager.',
  },
};

const DOH_HOSTS = new Set([
  '1.1.1.1',
  '8.8.8.8',
  '9.9.9.9',
  '94.140.14.14',
  '119.29.29.29',
  '223.5.5.5',
  'cloudflare-dns.com',
  'dns.google',
  'dns.adguard-dns.com',
  'dns.alidns.com',
  'dns.nextdns.io',
  'dns.quad9.net',
  'doh.opendns.com',
]);

const STREAMING_SPEC_HOSTS = new Set([
  '%s',
  'aomedia.org',
  'dashif.org',
  'default.url',
  'developer.apple.com',
  'exoplayer.dev',
  'schemas.microsoft.com',
  'www.w3.org',
  'x',
]);

const MEDIA_FORMAT_DESCRIPTIONS: Record<
  string,
  { kind: RbtvMediaFormat['kind']; description: string }
> = {
  '.m3u8': { kind: 'manifest', description: 'Playlist HTTP Live Streaming (HLS) adaptativa en directo/VOD' },
  '.mpd': { kind: 'manifest', description: 'Manifiesto MPEG-DASH (Xml MPD) con soporte DRM/trickmode' },
  '.ts': { kind: 'segment', description: 'Segmentos MPEG Transport Stream de HLS en vivo' },
  '.m4s': { kind: 'segment', description: 'Segmentos fMP4 / DASH inicializados y por fragmentos' },
  '.mp4': { kind: 'video', description: 'Contenedor ISO BMFF / H.264-HEVC directo' },
  '.m4v': { kind: 'video', description: 'Variante MP4 orientada a flujos de vídeo MPEG-4' },
  '.mkv': { kind: 'video', description: 'Matroska multi-pista (vídeo, múltiples audios y subtítulos)' },
  '.webm': { kind: 'video', description: 'Contenedor abierto VP8/VP9/AV1 para web y ExoPlayer' },
  '.mov': { kind: 'video', description: 'QuickTime Movie container soportado por extractores locales' },
  '.avi': { kind: 'video', description: 'Audio Video Interleave clásico para streams heredados' },
  '.mp3': { kind: 'audio', description: 'Pista de audio MPEG-1 Layer III' },
  '.aac': { kind: 'audio', description: 'Audio AAC/ADTS habitual en transmisiones deportivas HLS' },
  '.vtt': { kind: 'subtitle', description: 'Subtítulos WebVTT estándar HTML5 / HLS' },
  '.srt': { kind: 'subtitle', description: 'Subtítulos SubRip sin estilos complejos' },
};

const ARCHITECTURE_NODES: RbtvArchitectureNode[] = [
  {
    component: 'Launcher App Bootstrap',
    javaRef: 'com.rblive.launcher.App',
    role: 'Inicializa las URLs raíz de datos, directos, logos y WebView player.',
    endpoints: [
      'https://apis-data10.tcrbg61levl.cfd',
      'https://apis-live.ta2mnt200stayr2.cfd',
      'https://logos1.tcrbg61levl.cfd',
      'https://wv11.hkkmwtotalwypubook.cfd',
    ],
    mechanism: 'Separa el tráfico de catálogo, señales en vivo, logos CDN y reproductor web.',
  },
  {
    component: 'ParamsManager & Cluster /v1',
    javaRef: 'com.rblive.common.manager.ParamsManager',
    role: 'Descarga parámetros remotos y rotación de servidores si un dominio cae.',
    endpoints: [
      'https://may.2f17ubowlsjn46easier.cfd',
      'https://vip1.openaicommunities.bond/v1',
      'https://vip1.openaicommunities.click/v1',
      'https://vip1.openalcommunities.sbs/v1',
    ],
    mechanism: 'Realiza failover entre 4 hosts /v1 en distintos TLD (.cfd, .bond, .click, .sbs).',
  },
  {
    component: 'PPManager Announcements',
    javaRef: 'com.rblive.common.manager.PPManager$currAnnounces$2',
    role: 'Gestiona avisos activos, versiones y estado remoto de la aplicación.',
    endpoints: ['https://vip1.openaicommunities.shop/v1'],
    mechanism: 'Consulta el nodo .shop/v1 al arrancar para avisos y flags operativos.',
  },
  {
    component: 'NetworkInterceptor',
    javaRef: 'com.rblive.common.http.interceptor.NetworkInterceptor',
    role: 'Adjunta cabeceras de origen/identidad en las llamadas de red.',
    endpoints: ['https://www.rbtv77.com'],
    mechanism: 'Inyecta referencia oficial rbtv77.com para superar validaciones de servidor.',
  },
  {
    component: 'CachingFallbackDns & DoH',
    javaRef: 'com.rblive.common.http.dns.CachingFallbackDns / FallbackDns',
    role: 'Evita bloqueos DNS de operadoras mediante 13 resolvers DoH.',
    endpoints: [
      'https://cloudflare-dns.com/dns-query',
      'https://1.1.1.1/dns-query',
      'https://dns.google/resolve',
      'https://dns.adguard-dns.com/dns-query',
      'https://dns.quad9.net:5053/dns-query',
    ],
    mechanism: 'Si el DNS del sistema falla o censura un .cfd, consulta /dns-query o /resolve en JSON/Wire.',
  },
  {
    component: 'P2P Engine AbsProxy',
    javaRef: 'com.p2pengine.sdk.AbsProxy',
    role: 'Proxy HTTP local embebido para acelerar segmentos HLS/DASH en ExoPlayer.',
    endpoints: ['http://%s:%d%s'],
    mechanism: 'Levanta un servidor loopback en el móvil y sirve manifiestos .m3u8/.mpd localmente.',
  },
  {
    component: 'Constants & Partner Link',
    javaRef: 'com.rblive.common.constants.Constants',
    role: 'Constantes globales (1.1.1.1) y enlace promocional de VPN integrada.',
    endpoints: ['https://1.1.1.1/', 'https://go.nordvpn.net/aff_c?offer_id=15&aff_id=85448'],
    mechanism: 'Incluye botón patrocinado con offer_id=15 y aff_id=85448.',
  },
];

function resolveRbtvTextFile(): string {
  const candidates = [
    path.resolve(process.cwd(), 'public/assets/aistudio/rutas_RBTV_c34416da.txt'),
    path.resolve(process.cwd(), 'rutas_RBTV_c34416da.txt'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return candidates[0];
}

function classifyRbtvHost(
  host: string,
  urls: string[],
  primaryDomainSet: Set<string>
): {
  category: RbtvCategoryId;
  role: string;
  decodedNote?: string;
  isCoreAppDomain: boolean;
  probeAllowed: boolean;
} {
  const h = host.toLowerCase();
  const coreMeta = CORE_DOMAIN_NOTES[h];
  if (coreMeta || primaryDomainSet.has(h)) {
    return {
      category: 'core',
      role: coreMeta?.role || 'Dominio principal detectado en RBTV+',
      decodedNote: coreMeta?.note,
      isCoreAppDomain: true,
      probeAllowed: true,
    };
  }

  if (DOH_HOSTS.has(h)) {
    const isCdnProvider =
      h === 'cloudflare-dns.com' ||
      h === '1.1.1.1' ||
      h === 'dns.google' ||
      h === '8.8.8.8' ||
      h === '9.9.9.9' ||
      h === 'dns.adguard-dns.com' ||
      h === 'dns.nextdns.io' ||
      h === 'doh.opendns.com' ||
      h === '94.140.14.14';
    return {
      category: 'doh',
      role: 'Resolver DNS-over-HTTPS (FallbackDns / CachingFallbackDns)',
      decodedNote: `Soporta consultas cifradas DoH (${urls.map((u) => new URL(u).pathname).join(', ')}) para eludir bloqueos DNS.`,
      isCoreAppDomain: false,
      probeAllowed: isCdnProvider || h === 'dns.quad9.net' || h === 'dns.alidns.com' || h === '119.29.29.29' || h === '223.5.5.5',
    };
  }

  if (STREAMING_SPEC_HOSTS.has(h)) {
    const isTemplateOrPlaceholder = h === '%s' || h === 'default.url' || h === 'x';
    return {
      category: 'streaming_specs',
      role:
        h === '%s'
          ? 'Plantilla loopback P2P Engine (AbsProxy)'
          : isTemplateOrPlaceholder
          ? 'Placeholder DRM / FrameworkMediaDrm'
          : 'Especificación ExoPlayer2 (DASH / EMSG ID3 / DRM / TTML)',
      decodedNote:
        h === '%s'
          ? 'Formato http://%s:%d%s usado por el proxy P2P local del dispositivo.'
          : undefined,
      isCoreAppDomain: false,
      probeAllowed: false,
    };
  }

  // SDK / Analytics / Sponsor / Docs
  let decodedNote: string | undefined;
  let role = 'SDK Android / Google / Firebase / Bibliotecas';
  if (h === 'go.nordvpn.net') {
    role = 'Enlace patrocinado VPN en Constants.java';
    decodedNote = 'Parámetros decodificados: offer_id=15, aff_id=85448.';
  } else if (h.includes('firebase') || h === 'app-measurement.com') {
    role = 'Telemetría Firebase Analytics / Crashlytics';
  } else if (h.includes('googlesyndication') || h.includes('googleadservices')) {
    role = 'SDK de publicidad Google AdMob / DeepLink tracking';
  }

  return {
    category: 'sdk',
    role,
    decodedNote,
    isCoreAppDomain: false,
    probeAllowed: h === 'www.google.com' || h === 'go.nordvpn.net',
  };
}

let cachedRbtvInventory: RbtvParsedInventory | null = null;

export function parseRbtvInventory(forceReload = false): RbtvParsedInventory {
  if (cachedRbtvInventory && !forceReload) return cachedRbtvInventory;

  const filePath = resolveRbtvTextFile();
  const raw = fs.existsSync(filePath)
    ? fs.readFileSync(filePath, 'utf8')
    : RBTV_EMBEDDED_RAW_TEXT;
  const normalizedRaw =
    raw.split(/\r?\n/).length <= 3 && raw.includes('\\n')
      ? raw.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n')
      : raw;
  const lines = normalizedRaw.split(/\r?\n/);

  let archiveName = 'RBTV+ (1).apk_Decompiler.com.zip';
  const declaredSummary = {
    inspectedFiles: 16832,
    absoluteUrls: 61,
    uniqueHosts: 47,
    explicitHlsDashUrls: 0,
    explicitVideoUrls: 0,
  };

  let section: 'header' | 's1' | 's2' | 's3' | 's4' | 's5' = 'header';
  const s1Hosts: Array<{
    host: string;
    declaredUrlCount: number;
    urlItems: RbtvUrlItem[];
  }> = [];
  let currentS1Host: {
    host: string;
    declaredUrlCount: number;
    urlItems: RbtvUrlItem[];
  } | null = null;
  let currentUrlItem: RbtvUrlItem | null = null;

  const s2Map = new Map<string, string[]>();
  let currentS2Host: string | null = null;

  const rawFormats: string[] = [];
  const primaryDomains: string[] = [];

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed || /^[-=]+$/.test(trimmed)) continue;

    if (trimmed.startsWith('Archivo analizado:')) {
      archiveName = trimmed.replace('Archivo analizado:', '').trim();
      continue;
    }
    const inspectedMatch = trimmed.match(/^Archivos de código\/texto inspeccionados:\s*(\d+)/i);
    if (inspectedMatch) {
      declaredSummary.inspectedFiles = Number(inspectedMatch[1]);
      continue;
    }
    const absMatch = trimmed.match(/^URLs absolutas únicas detectadas:\s*(\d+)/i);
    if (absMatch) {
      declaredSummary.absoluteUrls = Number(absMatch[1]);
      continue;
    }
    const hostsMatch = trimmed.match(/^Hosts únicos detectados:\s*(\d+)/i);
    if (hostsMatch) {
      declaredSummary.uniqueHosts = Number(hostsMatch[1]);
      continue;
    }

    if (trimmed.startsWith('1) URLS ABSOLUTAS')) {
      section = 's1';
      continue;
    }
    if (trimmed.startsWith('2) RUTAS / PATHS')) {
      if (currentS1Host) {
        s1Hosts.push(currentS1Host);
        currentS1Host = null;
      }
      section = 's2';
      continue;
    }
    if (trimmed.startsWith('3) FORMATOS Y EXTENSIONES')) {
      section = 's3';
      continue;
    }
    if (trimmed.startsWith('4) REFERENCIAS HLS')) {
      section = 's4';
      continue;
    }
    if (trimmed.startsWith('5) DOMINIOS PRINCIPALES')) {
      section = 's5';
      continue;
    }
    if (trimmed.startsWith('FIN DEL INVENTARIO')) {
      break;
    }

    if (section === 's1') {
      const hostHeader = trimmed.match(/^\[(.+?)\]\s*(?:—|-)?\s*(\d+)?\s*URL/i);
      if (hostHeader) {
        if (currentS1Host) s1Hosts.push(currentS1Host);
        currentS1Host = {
          host: hostHeader[1].trim(),
          declaredUrlCount: Number(hostHeader[2] || 1),
          urlItems: [],
        };
        currentUrlItem = null;
        continue;
      }
      if (currentS1Host && /^https?:\/\//i.test(trimmed)) {
        currentUrlItem = { url: trimmed, references: [] };
        currentS1Host.urlItems.push(currentUrlItem);
        continue;
      }
      if (currentUrlItem && trimmed.startsWith('Referencia:')) {
        const refsText = trimmed.replace(/^Referencia:\s*/i, '');
        const refs = refsText
          .split(',')
          .map((r) => r.trim())
          .filter(Boolean);
        currentUrlItem.references.push(...refs);
      }
    } else if (section === 's2') {
      const hostBracket = trimmed.match(/^\[(.+?)\]$/);
      if (hostBracket) {
        currentS2Host = hostBracket[1].trim();
        if (!s2Map.has(currentS2Host)) s2Map.set(currentS2Host, []);
      } else if (currentS2Host && trimmed.startsWith('/')) {
        s2Map.get(currentS2Host)!.push(trimmed);
      }
    } else if (section === 's3') {
      if (trimmed.startsWith('.')) {
        rawFormats.push(trimmed);
      }
    } else if (section === 's5') {
      if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(trimmed)) {
        primaryDomains.push(trimmed);
      }
    }
  }

  const primaryDomainSet = new Set(primaryDomains.map((d) => d.toLowerCase()));
  const categoryCounts: Record<RbtvCategoryId, number> = {
    core: 0,
    doh: 0,
    streaming_specs: 0,
    sdk: 0,
  };

  let absoluteUrls = 0;
  let totalPaths = 0;

  const hosts: RbtvHostEntry[] = s1Hosts.map((h) => {
    const urls = h.urlItems.map((u) => u.url);
    absoluteUrls += urls.length;
    const paths = s2Map.get(h.host) || [];
    totalPaths += paths.length;
    const cls = classifyRbtvHost(h.host, urls, primaryDomainSet);
    categoryCounts[cls.category] += 1;
    return {
      host: h.host,
      declaredUrlCount: h.declaredUrlCount,
      urls,
      urlItems: h.urlItems,
      paths,
      category: cls.category,
      categoryLabel: CATEGORY_LABELS[cls.category],
      role: cls.role,
      decodedNote: cls.decodedNote,
      isCoreAppDomain: cls.isCoreAppDomain,
      probeAllowed: cls.probeAllowed,
    };
  });

  const pathsByHost = Array.from(s2Map.entries()).map(([host, paths]) => ({
    host,
    paths,
  }));

  const mediaFormats: RbtvMediaFormat[] = rawFormats.map((ext) => {
    const meta = MEDIA_FORMAT_DESCRIPTIONS[ext.toLowerCase()] || {
      kind: 'video' as const,
      description: 'Extensión multimedia detectada en el código',
    };
    return {
      ext,
      kind: meta.kind,
      description: meta.description,
    };
  });

  cachedRbtvInventory = {
    sourceFile: 'rutas_RBTV_c34416da.txt',
    archiveName,
    declaredSummary,
    actualCounts: {
      absoluteUrls,
      hosts: hosts.length,
      coreDomains: primaryDomains.length,
      dohResolvers: categoryCounts.doh,
      paths: totalPaths,
      mediaFormats: mediaFormats.length,
    },
    categoryCounts,
    hosts,
    pathsByHost,
    mediaFormats,
    primaryDomains,
    architectureNodes: ARCHITECTURE_NODES,
  };

  return cachedRbtvInventory;
}

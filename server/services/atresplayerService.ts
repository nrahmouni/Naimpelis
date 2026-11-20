/**
 * @module server/services/atresplayerService
 * @description SSRF-safe host prober, Atresplayer Retrofit/URL/MIME/DRM decoder,
 * and Atresmedia open-TDT live overview service.
 */

import { LruTtlCache } from '../utils/lruCache.ts';
import { assertSafeProxyUrl } from '../utils/ssrfGuard.ts';
import { streamingFetch } from '../utils/tlsFetch.ts';
import { CHROME_UA } from '../extractors/httpHelpers.ts';
import { SPANISH_TDT_CHANNELS } from '../data/tdtChannels.ts';
import { parseAtresplayerInventory } from './atresplayer/atresplayerParser.ts';
import type {
  AtresplayerRawHostRow,
  AtresplayerRawServiceDef,
} from './atresplayer/atresplayerRawData.ts';

export interface AtresplayerProbeResult {
  host: string;
  url: string;
  ok: boolean;
  status: number;
  latencyMs: number;
  finalUrl: string;
  contentType: string;
  error?: string;
}

export interface AtresplayerDecodeResult {
  input: string;
  detectedType: string;
  matchedHost?: AtresplayerRawHostRow;
  matchedService?: AtresplayerRawServiceDef;
  breakdown?: {
    host: string;
    port: string;
    protocol: string;
    path: string;
    queryParams: Record<string, string>;
    routeKind:
      | 'client_v1_page'
      | 'properties_find'
      | 'playback_chain'
      | 'concurrent_play'
      | 'account_address'
      | 'static_assets'
      | 'drm_mime_spec'
      | 'external_partner'
      | 'retrofit_service';
  };
  notes: string[];
}

const probeCache = new LruTtlCache<string, AtresplayerProbeResult>(120, 2 * 60 * 1000);

function getAllowedAtresplayerHosts(): Set<string> {
  const inv = parseAtresplayerInventory();
  const allowed = new Set<string>();
  for (const h of inv.hosts) {
    if (h.probeAllowed) {
      allowed.add(h.host.toLowerCase());
    }
  }
  return allowed;
}

export async function probeAtresplayerUrl(targetInput: {
  host?: string;
  url?: string;
}): Promise<AtresplayerProbeResult> {
  const inv = parseAtresplayerInventory();
  const allowedHosts = getAllowedAtresplayerHosts();

  let targetUrl = String(targetInput.url || '').trim();
  const requestedHost = String(targetInput.host || '').trim().toLowerCase();

  if (!targetUrl && requestedHost) {
    const matched = inv.hosts.find((h) => h.host.toLowerCase() === requestedHost);
    if (!matched) {
      return {
        host: requestedHost,
        url: '',
        ok: false,
        status: 400,
        latencyMs: 0,
        finalUrl: '',
        contentType: '',
        error: 'Host no pertenece al inventario Atresplayer',
      };
    }
    if (!matched.probeAllowed) {
      return {
        host: matched.host,
        url: matched.sampleUrls[0] || '',
        ok: false,
        status: 403,
        latencyMs: 0,
        finalUrl: '',
        contentType: '',
        error:
          matched.host === 'localhost'
            ? 'Placeholder local de Retrofit bloqueado para peticiones remotas'
            : 'Sentinel WebView interno (www.native.atresplayer.com) excluido de sondeo remoto',
      };
    }
    targetUrl =
      matched.sampleUrls.find((u) => /^https?:\/\/[a-z0-9]/i.test(u)) ||
      `${matched.protocol.toLowerCase()}://${matched.host}/`;
  }

  if (!targetUrl) {
    return {
      host: requestedHost,
      url: '',
      ok: false,
      status: 400,
      latencyMs: 0,
      finalUrl: '',
      contentType: '',
      error: 'URL o host requerido',
    };
  }

  let parsed: URL;
  try {
    parsed = await assertSafeProxyUrl(targetUrl);
  } catch (err) {
    return {
      host: requestedHost || targetUrl,
      url: targetUrl,
      ok: false,
      status: 403,
      latencyMs: 0,
      finalUrl: '',
      contentType: '',
      error: err instanceof Error ? err.message : 'Destino bloqueado por seguridad',
    };
  }

  const hostLower = parsed.hostname.toLowerCase();
  if (!allowedHosts.has(hostLower) && !allowedHosts.has(`www.${hostLower}`)) {
    return {
      host: hostLower,
      url: parsed.toString(),
      ok: false,
      status: 403,
      latencyMs: 0,
      finalUrl: '',
      contentType: '',
      error: 'Host fuera de la lista permitida de Atresplayer',
    };
  }

  const cacheKey = parsed.toString();
  const cached = probeCache.get(cacheKey);
  if (cached) return cached;

  const t0 = Date.now();
  try {
    let res = await streamingFetch(cacheKey, {
      method: 'HEAD',
      timeoutMs: 6500,
      headers: {
        'User-Agent': CHROME_UA,
        Accept: '*/*',
      },
    });
    if (res.status === 405 || res.status === 403) {
      res = await streamingFetch(cacheKey, {
        method: 'GET',
        timeoutMs: 6500,
        headers: {
          'User-Agent': CHROME_UA,
          Accept: 'application/json,text/html,*/*',
        },
      });
    }
    const result: AtresplayerProbeResult = {
      host: hostLower,
      url: cacheKey,
      ok: res.status >= 200 && res.status < 405,
      status: res.status,
      latencyMs: Date.now() - t0,
      finalUrl: res.url || cacheKey,
      contentType: String(res.headers.get('content-type') || '').split(';')[0].trim(),
    };
    probeCache.set(cacheKey, result);
    return result;
  } catch (err) {
    const fail: AtresplayerProbeResult = {
      host: hostLower,
      url: cacheKey,
      ok: false,
      status: 502,
      latencyMs: Date.now() - t0,
      finalUrl: '',
      contentType: '',
      error: err instanceof Error ? err.message : 'Error de red',
    };
    probeCache.set(cacheKey, fail);
    return fail;
  }
}

export function decodeAtresplayerInput(rawInput: string): AtresplayerDecodeResult {
  const input = String(rawInput || '').trim();
  const lower = input.toLowerCase();
  const inv = parseAtresplayerInventory();

  if (!input) {
    return {
      input,
      detectedType: 'Entrada vacía',
      notes: ['Introduce una URL, ruta //client/v1/..., servicio Retrofit, clave DRM o tipo MIME.'],
    };
  }

  // 1. Check double-slash client routes (//client/v1/...)
  if (lower.startsWith('//client/v1/')) {
    const normalizedUrl = `https://api.atresplayer.com${input.replace(/^\/+/, '/')}`;
    const matchedHost = inv.hosts.find((h) => h.host === 'api.atresplayer.com');
    const isTime = lower.includes('/time');
    const matchedService = inv.retrofitServices.find((s) =>
      s.service === (isTime ? 'TimeService' : lower.includes('/search') ? 'SearchService' : 'AtresplayerService')
    );
    return {
      input,
      detectedType: 'Ruta literal con doble barra (//client/v1/...)',
      matchedHost,
      matchedService,
      breakdown: {
        host: 'api.atresplayer.com',
        port: '443 (HTTPS implícito)',
        protocol: 'HTTPS',
        path: input,
        queryParams: {},
        routeKind: 'client_v1_page',
      },
      notes: [
        `Resolución sobre host principal: ${normalizedUrl}`,
        'Patrón literal extraído de los servicios de páginas/tiempo en com.atresmedia.',
        matchedService
          ? `Gestionado por ${matchedService.service} (${matchedService.declarationCount} declaraciones).`
          : 'Endpoint perteneciente a la API /client/v1/.',
      ],
    };
  }

  // 2. Check MIME types or Widevine DRM / SourceBO keys
  const matchedMime = inv.mimeTypes.find((m) => lower === m.mime.toLowerCase() || lower.includes(m.mime.toLowerCase()));
  if (matchedMime) {
    return {
      input,
      detectedType: `Tipo MIME de reproducción (${matchedMime.family})`,
      breakdown: {
        host: 'api.atresplayer.com (campo SourceBO.type)',
        port: '443 (HTTPS)',
        protocol: matchedMime.family,
        path: matchedMime.mime,
        queryParams: {},
        routeKind: 'drm_mime_spec',
      },
      notes: [
        matchedMime.notes,
        'Recibido en el campo "type" de SourceBO devuelto por PlayerService / VideoService.',
        'La URL de stream real llega en "src" y, si aplica, licencia en "drm.widevine" / "licenseUrl".',
      ],
    };
  }

  if (
    lower.includes('widevine') ||
    lower.includes('nodrm') ||
    lower.includes('drm.android.') ||
    lower === 'licenseurl' ||
    lower === 'drm.java' ||
    lower === 'drmdto.java'
  ) {
    const propsHost = inv.hosts.find((h) => h.host === 'properties.atresplayer.com');
    return {
      input,
      detectedType: 'Especificación DRM Widevine / Propiedad Remota',
      matchedHost: propsHost,
      matchedService: inv.retrofitServices.find((s) => s.service === 'PropertiesService'),
      breakdown: {
        host: 'properties.atresplayer.com',
        port: '443 (HTTPS)',
        protocol: 'Widevine + Properties v1',
        path: '/properties/v1/find/properties',
        queryParams: lower.includes('drm.android') ? { key: input } : { drm: 'widevine' },
        routeKind: 'drm_mime_spec',
      },
      notes: [
        'Clases Java implicadas: Drm.java, DrmDTO.java y VideoUtils.java (líneas 111–258).',
        'Claves remotas: drm.android.mobile, drm.android.tv y NODRM.',
        'SourceBO expone: src, type, token, drm, drm.widevine y licenseUrl.',
      ],
    };
  }

  // 3. Check exact PropertiesService {PROPS} keys (e.g. checkVersion)
  const matchedPropKey = inv.propertiesKeys.find(
    (k) => k.toLowerCase() === lower || lower.includes(`key=${k.toLowerCase()}`)
  );
  if (matchedPropKey && !/^https?:\/\//i.test(input)) {
    const propsHost = inv.hosts.find((h) => h.host === 'properties.atresplayer.com');
    return {
      input,
      detectedType: `Clave de configuración remota {PROPS}: ${matchedPropKey}`,
      matchedHost: propsHost,
      matchedService: inv.retrofitServices.find((s) => s.service === 'PropertiesService'),
      breakdown: {
        host: 'properties.atresplayer.com',
        port: '443 (HTTPS)',
        protocol: 'HTTPS',
        path: '/properties/v1/find/properties',
        queryParams: { key: matchedPropKey },
        routeKind: 'properties_find',
      },
      notes: [
        `URL construida: https://properties.atresplayer.com/properties/v1/find/properties?key=${matchedPropKey}`,
        'PropertiesService declara 36 métodos parametrizados con {PROPS}.',
      ],
    };
  }

  // 4. Check Retrofit Service names, methods, or concurrent playback paths
  const matchedService = inv.retrofitServices.find(
    (s) =>
      s.service.toLowerCase() === lower ||
      s.service.toLowerCase().includes(lower) ||
      s.highlightMethods.some((m) => m.toLowerCase() === lower) ||
      s.routePatterns.some((rp) => rp.toLowerCase().includes(lower))
  );
  if (matchedService && !/^https?:\/\//i.test(input)) {
    const matchedHost = inv.hosts.find((h) => h.host === matchedService.host);
    const isConcurrent = matchedService.service === 'ConcurrentPlaybackService' || lower.includes('closewithuser') || lower.includes('pc/v1/play');
    return {
      input,
      detectedType: isConcurrent
        ? 'Ruta de Control de Concurrencia (ConcurrentPlaybackService)'
        : `Servicio Retrofit (${matchedService.packageScope}) · ${matchedService.service}`,
      matchedHost,
      matchedService,
      breakdown: {
        host: matchedService.host,
        port: matchedHost?.port || '443*',
        protocol: matchedHost?.protocol || 'HTTPS',
        path: matchedService.routePatterns[0] || '/',
        queryParams: {},
        routeKind: isConcurrent ? 'concurrent_play' : 'retrofit_service',
      },
      notes: [
        matchedService.summary,
        `Declaraciones Retrofit en APK: ${matchedService.declarationCount}.`,
        `Métodos destacados: ${matchedService.highlightMethods.join(', ')}.`,
      ],
    };
  }

  // 5. Parse as full HTTP/HTTPS URL or host
  let normalized = input;
  if (!/^https?:\/\//i.test(normalized) && normalized.includes('.')) {
    normalized = normalized.startsWith('localhost')
      ? `http://${normalized}`
      : `https://${normalized}`;
  }

  try {
    const parsed = new URL(normalized);
    const hostLower = parsed.hostname.toLowerCase();
    const matchedHost = inv.hosts.find((h) => h.host.toLowerCase() === hostLower);
    const queryParams: Record<string, string> = {};
    parsed.searchParams.forEach((v, k) => {
      queryParams[k] = v;
    });

    const pLower = parsed.pathname.toLowerCase();
    let routeKind: NonNullable<AtresplayerDecodeResult['breakdown']>['routeKind'] = 'client_v1_page';
    if (hostLower === 'properties.atresplayer.com') routeKind = 'properties_find';
    else if (pLower.includes('pc/v1/play')) routeKind = 'concurrent_play';
    else if (hostLower === 'account.atresplayer.com') routeKind = 'account_address';
    else if (hostLower === 'statics.atresmedia.com') routeKind = 'static_assets';
    else if (pLower.includes('player') || pLower.includes('video')) routeKind = 'playback_chain';
    else if (matchedHost && !matchedHost.category.startsWith('atres_core') && !matchedHost.category.startsWith('atres_portal')) {
      routeKind = 'external_partner';
    }

    const matchedSvcByHost = inv.retrofitServices.find(
      (s) =>
        s.host.toLowerCase() === hostLower ||
        s.routePatterns.some((rp) => rp !== '@Url dinámico' && pLower.includes(rp.toLowerCase().replace(/^\/+/, '/')))
    );

    const isLocalPlaceholder = hostLower === 'localhost';
    const isSentinel = hostLower === 'www.native.atresplayer.com';

    return {
      input,
      detectedType: isLocalPlaceholder
        ? 'Placeholder baseUrl Retrofit (http://localhost/)'
        : isSentinel
          ? 'Sentinel WebView Nativo de Checkout'
          : matchedHost
            ? `${matchedHost.categoryLabel} (${matchedHost.host})`
            : `URL analizada (${hostLower})`,
      matchedHost,
      matchedService: matchedSvcByHost,
      breakdown: {
        host: hostLower,
        port: parsed.port || (parsed.protocol === 'http:' ? '80 (implícito)' : '443 (implícito)'),
        protocol: parsed.protocol.replace(':', '').toUpperCase(),
        path: parsed.pathname || '/',
        queryParams,
        routeKind,
      },
      notes: [
        isLocalPlaceholder
          ? 'Retrofit requiere un baseUrl sintáctico aunque las llamadas usen @Url dinámico; NO representa un servidor real.'
          : isSentinel
            ? 'Interceptado localmente dentro del WebView de checkout/pagos; no responde como API pública.'
            : matchedHost?.role || 'Dominio fuera del inventario principal de Atresplayer.',
        'El APK no declara puertos explícitos: https:// equivale a 443 y http:// a 80.',
      ],
    };
  } catch {
    return {
      input,
      detectedType: 'Identificador / cadena Atresplayer',
      notes: [
        'No coincide exactamente con una URL o servicio Retrofit conocido.',
        'Prueba con //client/v1/page/live, getPlayerVideo, checkVersion, closewithuser, application/dash+xml o properties.atresplayer.com.',
      ],
    };
  }
}

export function getAtresplayerOverview() {
  const inv = parseAtresplayerInventory();
  const atresmediaTdtChannels = SPANISH_TDT_CHANNELS.filter((ch) => {
    const net = String(ch.network || '').toLowerCase();
    const id = String(ch.id || '').toLowerCase();
    return (
      net.includes('atresmedia') ||
      id === 'tdt-antena3' ||
      id === 'tdt-lasexta' ||
      id === 'tdt-neox' ||
      id === 'tdt-nova' ||
      id === 'tdt-mega' ||
      id === 'tdt-atreseries'
    );
  }).map((ch) => ({
    ...ch,
    category: 'tdt_es' as const,
  }));

  return {
    checkedAt: Date.now(),
    sourceFile: inv.sourceFile,
    archiveName: inv.archiveName,
    documentDate: inv.documentDate,
    packageNames: inv.packageNames,
    declaredSummary: inv.declaredSummary,
    actualCounts: inv.actualCounts,
    playbackChain: inv.playbackChain,
    sourceFields: inv.sourceFields,
    mimeTypes: inv.mimeTypes,
    atresmediaTdtChannels,
    portNotes: inv.portNotes,
    videoNotes: inv.videoNotes,
    limitations: inv.limitations,
  };
}

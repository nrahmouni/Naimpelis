import { LruTtlCache } from '../utils/lruCache.ts';
import { assertSafeProxyUrl } from '../utils/ssrfGuard.ts';
import { streamingFetch } from '../utils/tlsFetch.ts';
import { CHROME_UA } from '../extractors/httpHelpers.ts';
import { SPANISH_TDT_CHANNELS } from '../data/tdtChannels.ts';
import {
  getCachedFootballBoardSnapshot,
  getCachedSportsMatches,
} from '../routes/sports.ts';
import { getPermanent247SportsMatches } from '../routes/sportsHelpers/sportsChannels247.ts';
import { parseBelixInventory, type BelixHostEntry } from './belix/belixParser.ts';

export interface BelixProbeResult {
  host: string;
  url: string;
  ok: boolean;
  status: number;
  latencyMs: number;
  finalUrl: string;
  contentType: string;
  error?: string;
}

export interface BelixDecodeResult {
  input: string;
  detectedType: string;
  matchedHost?: BelixHostEntry;
  smaliOriginRef?: string;
  xtreamBreakdown?: {
    baseHost: string;
    routeKind: 'live' | 'movie' | 'series' | 'player_api' | 'xmltv' | 'm3u_plus' | 'external';
    maskedUrl: string;
    action?: string;
    streamId?: string;
    extension?: string;
    hasCredentials: boolean;
    params: Record<string, string>;
  };
  notes: string[];
}

export interface BelixXtreamInspectResult {
  ok: boolean;
  status: number;
  latencyMs: number;
  serverOrigin: string;
  maskedPlaylistUrl: string;
  userStatus?: string;
  activeConnections?: string;
  maxConnections?: string;
  expDate?: string;
  serverTimezone?: string;
  liveCategoriesCount?: number;
  vodCategoriesCount?: number;
  seriesCategoriesCount?: number;
  sampleLiveStreams?: Array<{
    streamId: number;
    name: string;
    icon?: string;
    maskedPlayUrl: string;
  }>;
  error?: string;
}

const probeCache = new LruTtlCache<string, BelixProbeResult>(160, 2 * 60 * 1000);

function getAllowedBelixHosts(): Set<string> {
  const inv = parseBelixInventory();
  const allowed = new Set<string>();
  for (const h of inv.hosts) {
    if (h.probeAllowed) {
      allowed.add(h.host.toLowerCase());
      for (const u of h.urls) {
        try {
          allowed.add(new URL(u).hostname.toLowerCase());
        } catch {
          // ignore
        }
      }
    }
  }
  return allowed;
}

export async function probeBelixUrl(targetInput: {
  host?: string;
  url?: string;
}): Promise<BelixProbeResult> {
  const inv = parseBelixInventory();
  const allowedHosts = getAllowedBelixHosts();

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
        error: 'Host no pertenece al inventario Belix TV',
      };
    }
    if (!matched.probeAllowed) {
      return {
        host: matched.host,
        url: matched.urls[0] || '',
        ok: false,
        status: 403,
        latencyMs: 0,
        finalUrl: '',
        contentType: '',
        error: 'Referencia local, placeholder o enlace de documentación excluido de comprobación remota',
      };
    }
    targetUrl =
      matched.urls.find((u) => /^https?:\/\/[a-z0-9]/i.test(u)) || `https://${matched.host}`;
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
      url: targetUrl,
      ok: false,
      status: 403,
      latencyMs: 0,
      finalUrl: '',
      contentType: '',
      error: 'Solo se permite comprobar hosts permitidos del inventario Belix TV',
    };
  }

  const cached = probeCache.get(targetUrl);
  if (cached) return cached;

  const t0 = Date.now();
  try {
    let res = await streamingFetch(targetUrl, {
      method: 'HEAD',
      headers: { 'User-Agent': CHROME_UA },
      timeoutMs: 6500,
    });
    if (res.status === 405 || res.status === 403 || res.status === 501) {
      res = await streamingFetch(targetUrl, {
        method: 'GET',
        headers: { 'User-Agent': CHROME_UA },
        timeoutMs: 6500,
      });
    }
    const result: BelixProbeResult = {
      host: hostLower,
      url: targetUrl,
      ok: res.status >= 200 && res.status < 400,
      status: res.status,
      latencyMs: Date.now() - t0,
      finalUrl: res.url || targetUrl,
      contentType: res.headers.get('content-type') || '',
    };
    probeCache.set(targetUrl, result);
    return result;
  } catch (err) {
    return {
      host: hostLower,
      url: targetUrl,
      ok: false,
      status: 502,
      latencyMs: Date.now() - t0,
      finalUrl: '',
      contentType: '',
      error: err instanceof Error ? err.message : 'Error de red',
    };
  }
}

function maskUrlCredentials(parsed: URL): { masked: string; hasCredentials: boolean } {
  let hasCreds = false;
  const clone = new URL(parsed.toString());
  if (clone.searchParams.has('password')) {
    clone.searchParams.set('password', '***');
    hasCreds = true;
  }
  if (clone.searchParams.has('username')) {
    clone.searchParams.set('username', '***');
    hasCreds = true;
  }
  const parts = clone.pathname.split('/');
  // Match /live/{user}/{pass}/{id}.{ext} or /movie/ or /series/
  if (parts.length >= 5 && ['live', 'movie', 'series'].includes(parts[1].toLowerCase())) {
    if (parts[2] && !parts[2].startsWith('{')) {
      parts[2] = '***';
      hasCreds = true;
    }
    if (parts[3] && !parts[3].startsWith('{')) {
      parts[3] = '***';
      hasCreds = true;
    }
    clone.pathname = parts.join('/');
  }
  return { masked: clone.toString(), hasCredentials: hasCreds };
}

export function decodeBelixInput(rawInput: string): BelixDecodeResult {
  const input = String(rawInput || '').trim();
  const inv = parseBelixInventory();
  const notes: string[] = [];

  if (!input) {
    return {
      input,
      detectedType: 'empty',
      notes: ['Introduce una URL Xtream Codes (/player_api.php, /live/, /movie/, /series/, /get.php) o un host/clase Belix TV.'],
    };
  }

  // Try resolving relative Xtream paths directly
  const normalizedUrlCandidate = input.startsWith('/')
    ? `https://xtream-server.example${input}`
    : /^https?:\/\//i.test(input)
    ? input
    : `https://${input}`;

  let parsedUrl: URL | null = null;
  try {
    parsedUrl = new URL(normalizedUrlCandidate);
  } catch {
    parsedUrl = null;
  }

  if (parsedUrl) {
    const hostLower = parsedUrl.hostname.toLowerCase();
    const matchedHost = inv.hosts.find(
      (h) => h.host.toLowerCase() === hostLower || h.host.toLowerCase() === hostLower.replace(/^www\./, '')
    );

    const params: Record<string, string> = {};
    parsedUrl.searchParams.forEach((v, k) => {
      params[k] = k === 'password' ? '***' : v;
    });

    const pathname = parsedUrl.pathname;
    const { masked, hasCredentials } = maskUrlCredentials(parsedUrl);

    if (/\/player_api\.php$/i.test(pathname) || input.includes('player_api.php')) {
      const action = params.action || 'auth_account_info';
      const matchedEp = inv.apiEndpoints.find((e) => e.action === action);
      notes.push(
        matchedEp
          ? `Endpoint Xtream Codes identificado: "${matchedEp.label}".`
          : 'Llamada a la API REST Xtream Codes (player_api.php).'
      );
      notes.push('Declarado mediante Retrofit en smali/com/ibopro/ultra/remote/APIService.smali.');
      if (params.category_id) notes.push(`Filtro por categoría activa: category_id=${params.category_id}.`);
      if (params.vod_id) notes.push(`Consulta de ficha VOD: vod_id=${params.vod_id}.`);
      if (params.series_id) notes.push(`Consulta de temporadas/episodios: series_id=${params.series_id}.`);
      if (params.stream_id) notes.push(`Consulta EPG para canal: stream_id=${params.stream_id}.`);

      return {
        input,
        detectedType: 'Xtream Codes API (APIService)',
        matchedHost,
        smaliOriginRef: 'smali/com/ibopro/ultra/remote/APIService.smali',
        xtreamBreakdown: {
          baseHost: hostLower === 'xtream-server.example' ? '{server_host}' : parsedUrl.origin,
          routeKind: 'player_api',
          maskedUrl: masked,
          action,
          streamId: params.vod_id || params.series_id || params.stream_id,
          hasCredentials,
          params,
        },
        notes,
      };
    }

    if (/\/xmltv\.php$/i.test(pathname)) {
      return {
        input,
        detectedType: 'EPG XMLTV Feed',
        matchedHost,
        smaliOriginRef: 'smali/com/ibopro/ultra/remote/APIService.smali',
        xtreamBreakdown: {
          baseHost: hostLower === 'xtream-server.example' ? '{server_host}' : parsedUrl.origin,
          routeKind: 'xmltv',
          maskedUrl: masked,
          hasCredentials,
          params,
        },
        notes: [
          'Descarga la guía electrónica de programación (EPG) completa en formato XMLTV estándar.',
          'Invocada en paralelo con get_short_epg para mostrar parrilla en LiveChannelActivity.',
        ],
      };
    }

    if (/\/get\.php$/i.test(pathname)) {
      return {
        input,
        detectedType: 'Playlist M3U Plus (GetSharedInfo)',
        matchedHost,
        smaliOriginRef: 'smali/com/ibopro/ultra/helper/GetSharedInfo.smali',
        xtreamBreakdown: {
          baseHost: hostLower === 'xtream-server.example' ? '{server_host}' : parsedUrl.origin,
          routeKind: 'm3u_plus',
          maskedUrl: masked,
          extension: params.output || 'ts',
          hasCredentials,
          params,
        },
        notes: [
          'Construida por GetSharedInfo.smali para exportar la lista completa M3U Plus.',
          `Belix TV solicita explícitamente transporte ${params.output || 'ts'} (type=${params.type || 'm3u_plus'}).`,
        ],
      };
    }

    const mediaMatch = pathname.match(/^\/(live|movie|series)\/([^/]+)\/([^/]+)\/([^/?#]+)$/i);
    if (mediaMatch) {
      const routeKind = mediaMatch[1].toLowerCase() as 'live' | 'movie' | 'series';
      const idWithExt = mediaMatch[4];
      const dotIdx = idWithExt.lastIndexOf('.');
      const streamId = dotIdx > 0 ? idWithExt.slice(0, dotIdx) : idWithExt;
      const extension = dotIdx > 0 ? idWithExt.slice(dotIdx + 1) : 'ts';

      const smaliOriginRef =
        routeKind === 'live'
          ? 'smali/com/ibopro/ultra/activities/LiveChannelActivity.smali'
          : routeKind === 'movie'
          ? 'smali/com/ibopro/ultra/activities/MoviePlayerActivity.smali'
          : 'smali/com/ibopro/ultra/helper/GetSharedInfo.smali';

      notes.push(
        `Flujo dinámico de ${routeKind === 'live' ? 'TV en Directo' : routeKind === 'movie' ? 'Película VOD' : 'Episodio de Serie'} construido por GetSharedInfo.smali.`
      );
      notes.push(`ID de stream: ${streamId} · Extensión/Contenedor: .${extension} (MovieModel.getExtension()).`);

      return {
        input,
        detectedType: `Stream Dinámico /${routeKind}/`,
        matchedHost,
        smaliOriginRef,
        xtreamBreakdown: {
          baseHost: hostLower === 'xtream-server.example' ? '{server_host}' : parsedUrl.origin,
          routeKind,
          maskedUrl: masked,
          streamId,
          extension,
          hasCredentials,
          params,
        },
        notes,
      };
    }

    if (matchedHost) {
      notes.push(matchedHost.role);
      if (matchedHost.decodedNote) notes.push(matchedHost.decodedNote);
      return {
        input,
        detectedType: matchedHost.categoryLabel,
        matchedHost,
        smaliOriginRef: matchedHost.origins[0],
        xtreamBreakdown: {
          baseHost: parsedUrl.origin,
          routeKind: 'external',
          maskedUrl: masked,
          hasCredentials,
          params,
        },
        notes,
      };
    }
  }

  // Smali / Java class query fallback
  const matchedCode = inv.codeFiles.find(
    (c) =>
      c.file.toLowerCase().includes(input.toLowerCase()) ||
      c.component.toLowerCase().includes(input.toLowerCase())
  );
  if (matchedCode) {
    return {
      input,
      detectedType: 'Clase Smali com.ibopro.ultra',
      smaliOriginRef: matchedCode.file,
      notes: [matchedCode.role, matchedCode.mechanism],
    };
  }

  return {
    input,
    detectedType: 'Entrada genérica',
    notes: [
      'No coincide con un host del inventario estático de Belix TV ni con un patrón Xtream estándar.',
      'Prueba con /player_api.php?action=get_live_streams, /live/usuario/clave/101.ts, o t.me/shadeedtv.',
    ],
  };
}

/**
 * Queries a user-provided public Xtream Codes portal server-side via APIService player_api.php.
 * Never persists or caches user credentials. Passwords are excluded from returned sample URLs.
 */
export async function inspectXtreamServer(params: {
  serverUrl: string;
  username: string;
  password: string;
}): Promise<BelixXtreamInspectResult> {
  const rawServer = String(params.serverUrl || '').trim().replace(/\/+$/, '');
  const username = String(params.username || '').trim();
  const password = String(params.password || '').trim();

  if (!rawServer || !username || !password) {
    return {
      ok: false,
      status: 400,
      latencyMs: 0,
      serverOrigin: '',
      maskedPlaylistUrl: '',
      error: 'Servidor, usuario y contraseña requeridos.',
    };
  }

  let parsed: URL;
  try {
    parsed = await assertSafeProxyUrl(rawServer);
  } catch (err) {
    return {
      ok: false,
      status: 403,
      latencyMs: 0,
      serverOrigin: rawServer,
      maskedPlaylistUrl: '',
      error: err instanceof Error ? err.message : 'Servidor bloqueado por validación de seguridad.',
    };
  }

  const origin = parsed.origin;
  const maskedPlaylistUrl = `${origin}/get.php?username=***&password=***&output=ts&type=m3u_plus`;
  const authUrl = `${origin}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;

  const t0 = Date.now();
  try {
    const authRes = await streamingFetch(authUrl, {
      method: 'GET',
      headers: { 'User-Agent': CHROME_UA, Accept: 'application/json' },
      timeoutMs: 8000,
    });

    if (!authRes.ok) {
      return {
        ok: false,
        status: authRes.status,
        latencyMs: Date.now() - t0,
        serverOrigin: origin,
        maskedPlaylistUrl,
        error: `El servidor respondió HTTP ${authRes.status}.`,
      };
    }

    const authJson = (await authRes.json().catch(() => null)) as any;
    const userInfo = authJson?.user_info;
    const serverInfo = authJson?.server_info;

    if (!userInfo && !serverInfo) {
      return {
        ok: false,
        status: 422,
        latencyMs: Date.now() - t0,
        serverOrigin: origin,
        maskedPlaylistUrl,
        error: 'La respuesta no tiene el formato Xtream Codes JSON esperado.',
      };
    }

    const [liveCatRes, vodCatRes, seriesCatRes, liveStreamsRes] = await Promise.all([
      streamingFetch(
        `${origin}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&action=get_live_categories`,
        { method: 'GET', headers: { 'User-Agent': CHROME_UA }, timeoutMs: 6000 }
      ).catch(() => null),
      streamingFetch(
        `${origin}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&action=get_vod_categories`,
        { method: 'GET', headers: { 'User-Agent': CHROME_UA }, timeoutMs: 6000 }
      ).catch(() => null),
      streamingFetch(
        `${origin}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&action=get_series_categories`,
        { method: 'GET', headers: { 'User-Agent': CHROME_UA }, timeoutMs: 6000 }
      ).catch(() => null),
      streamingFetch(
        `${origin}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&action=get_live_streams`,
        { method: 'GET', headers: { 'User-Agent': CHROME_UA }, timeoutMs: 7000 }
      ).catch(() => null),
    ]);

    const liveCats = liveCatRes?.ok ? await liveCatRes.json().catch(() => []) : [];
    const vodCats = vodCatRes?.ok ? await vodCatRes.json().catch(() => []) : [];
    const seriesCats = seriesCatRes?.ok ? await seriesCatRes.json().catch(() => []) : [];
    const liveStreams = liveStreamsRes?.ok ? await liveStreamsRes.json().catch(() => []) : [];

    const sampleLiveStreams = Array.isArray(liveStreams)
      ? liveStreams.slice(0, 12).map((s: any) => ({
          streamId: Number(s.stream_id || 0),
          name: String(s.name || `Canal ${s.stream_id || ''}`).trim(),
          icon: typeof s.stream_icon === 'string' && /^https?:\/\//i.test(s.stream_icon) ? s.stream_icon : undefined,
          maskedPlayUrl: `${origin}/live/***/***/${s.stream_id || 0}.ts`,
        }))
      : [];

    return {
      ok: true,
      status: authRes.status,
      latencyMs: Date.now() - t0,
      serverOrigin: origin,
      maskedPlaylistUrl,
      userStatus: String(userInfo?.status || 'Unknown'),
      activeConnections: String(userInfo?.active_cons ?? '0'),
      maxConnections: String(userInfo?.max_connections ?? '1'),
      expDate: userInfo?.exp_date ? String(userInfo.exp_date) : undefined,
      serverTimezone: serverInfo?.timezone ? String(serverInfo.timezone) : undefined,
      liveCategoriesCount: Array.isArray(liveCats) ? liveCats.length : 0,
      vodCategoriesCount: Array.isArray(vodCats) ? vodCats.length : 0,
      seriesCategoriesCount: Array.isArray(seriesCats) ? seriesCats.length : 0,
      sampleLiveStreams,
    };
  } catch (err) {
    return {
      ok: false,
      status: 502,
      latencyMs: Date.now() - t0,
      serverOrigin: origin,
      maskedPlaylistUrl,
      error: err instanceof Error ? err.message : 'Error conectando al servidor Xtream.',
    };
  }
}

export function getBelixLiveOverview() {
  const inv = parseBelixInventory();
  const boardSnapshot = getCachedFootballBoardSnapshot();
  const liveMatches = (
    boardSnapshot && boardSnapshot.matches.length > 0
      ? boardSnapshot.matches
      : getCachedSportsMatches()
  ).slice(0, 12);
  const sports247Channels = getPermanent247SportsMatches().slice(0, 12);
  const featuredTdt = SPANISH_TDT_CHANNELS.filter((c) => c.channels && c.channels.length > 0).slice(
    0,
    12
  );

  return {
    checkedAt: Date.now(),
    packageName: inv.packageName,
    apiEndpoints: inv.apiEndpoints,
    dynamicRoutes: inv.dynamicRoutes,
    liveMatches,
    sports247Channels,
    featuredTdt,
  };
}

/**
 * @module server/services/belix/belixXtreamClient
 * @description Server-side RAM-only Xtream Codes client & credential-masking HLS proxy for Belix TV.
 * Never persists credentials to disk, never logs them, and never exposes upstream auth URLs to clients.
 */
import { ENV } from '../../config/env.ts';
import { assertSafeProxyUrl } from '../../utils/ssrfGuard.ts';
import { streamingFetch } from '../../utils/tlsFetch.ts';
import { CHROME_UA, curlGetText } from '../../extractors/httpHelpers.ts';
import {
  clearBelixOpaqueCaches,
  fetchBelixOpaqueSegment,
  resolveBelixManifestForSession,
  resolveBelixSubPlaylist,
} from './belixProxyHelpers.ts';

export interface BelixXtreamCategory {
  id: string;
  name: string;
  count: number;
}

export interface BelixLiveChannel {
  id: string;
  streamId: string;
  dial: number;
  name: string;
  shortMark: string;
  brandTone: string;
  network: string;
  category: 'belix_live';
  sourceHub: 'belix';
  belixCategoryId: string;
  belixCategoryName: string;
  quality: string;
  logoUrl?: string;
  countryCode?: string;
  description: string;
  epgChannelId?: string;
  probeOk: boolean;
  probeLatencyMs?: number;
  channels: Array<{
    id: string;
    label: string;
    lang: string;
    quality: string;
    sourceUrl: string;
    resolverType: 'direct_hls';
  }>;
}

export interface BelixConnectionStatus {
  connected: boolean;
  serverOrigin: string;
  maskedUsername: string;
  userStatus?: string;
  activeConnections?: string;
  maxConnections?: string;
  expDate?: string;
  serverTimezone?: string;
  totalRawStreams: number;
  stableCount: number;
  probing: boolean;
  lastSyncedAt?: number;
  categories: BelixXtreamCategory[];
  error?: string;
}

interface BelixRamSession {
  origin: string;
  username: string;
  password: string;
  userStatus: string;
  activeConnections: string;
  maxConnections: string;
  expDate?: string;
  serverTimezone?: string;
  categories: BelixXtreamCategory[];
  rawCandidates: Array<{
    streamId: string;
    name: string;
    categoryId: string;
    categoryName: string;
    logoUrl?: string;
    epgChannelId?: string;
  }>;
  stableChannels: BelixLiveChannel[];
  probing: boolean;
  lastSyncedAt: number;
  lastError?: string;
}

let activeSession: BelixRamSession | null = null;
let backgroundProbeSeq = 0;

function maskUsername(username: string): string {
  const clean = String(username || '').trim();
  if (!clean) return '';
  if (clean.length <= 4) return '****';
  return `${clean.slice(0, 2)}***${clean.slice(-2)}`;
}

function makeShortMark(name: string): string {
  const ascii = String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase();
  return ascii.slice(0, 4) || 'BLX';
}

function pickBrandTone(categoryName: string, streamName: string): string {
  const text = `${categoryName} ${streamName}`.toLowerCase();
  if (/sport|deport|fut|f1|moto|dazn|movistar|bein|espn|liga|champions/i.test(text)) return '#10B981';
  if (/cine|movie|pelic|series|hbo|netflix|canal/i.test(text)) return '#8B5CF6';
  if (/news|notic|24h|cnn|bbc|rtve/i.test(text)) return '#3B82F6';
  if (/kids|infantil|disney|nick|clan|boing/i.test(text)) return '#F59E0B';
  if (/doc|nat|discov|histo/i.test(text)) return '#0EA5E9';
  return '#06B6D4';
}

function inferStreamLang(categoryName: string, streamName: string): string {
  const text = `${categoryName} ${streamName}`.toLowerCase();
  if (/\b(es|esp|spain|espana|castellano|tdt)\b/i.test(text)) return 'ES';
  if (/\b(lat|latam|mx|ar|co|cl)\b/i.test(text)) return 'LAT';
  if (/\b(uk|us|usa|en|eng)\b/i.test(text)) return 'EN';
  if (/\b(fr|fra|france)\b/i.test(text)) return 'FR';
  if (/\b(ar|arab|bein|mbc|ssc)\b/i.test(text)) return 'AR';
  if (/\b(cat|tv3|324|esport3)\b/i.test(text)) return 'CAT';
  return 'ES';
}

function isDisallowedStreamName(categoryName: string, streamName: string): boolean {
  const text = `${categoryName} ${streamName}`.toLowerCase();
  return /\b(xxx|adult|adults|porn|18\+|for\s*adults|erotic)\b/i.test(text);
}

function sanitizeHttpImageUrl(raw: unknown): string | undefined {
  const val = String(raw || '').trim();
  if (!val || !/^https?:\/\/[a-z0-9]/i.test(val)) return undefined;
  try {
    const u = new URL(val);
    if (u.username || u.password) return undefined;
    return u.toString();
  } catch {
    return undefined;
  }
}

function normalizeServerInput(rawServer: string): string {
  const trimmed = String(rawServer || '').trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
}

async function probeXtreamLiveM3u8(
  session: BelixRamSession,
  streamId: string,
  timeoutMs = 2400
): Promise<{ ok: boolean; latencyMs: number }> {
  const t0 = Date.now();
  const targetUrl = `${session.origin}/live/${encodeURIComponent(session.username)}/${encodeURIComponent(
    session.password
  )}/${encodeURIComponent(streamId)}.m3u8`;
  const headers: Record<string, string> = {
    'User-Agent': CHROME_UA,
    Accept: '*/*',
    Referer: `${session.origin}/`,
  };

  try {
    const res = await streamingFetch(targetUrl, {
      method: 'GET',
      headers,
      timeoutMs,
    });
    if (res.ok) {
      const ct = String(res.headers.get('content-type') || '').toLowerCase();
      if (ct.includes('text/html')) return { ok: false, latencyMs: Date.now() - t0 };
      const txt = await res.text();
      if (txt.includes('#EXTM3U') && !/nosignal|<!doctype|<html/i.test(txt)) {
        return { ok: true, latencyMs: Date.now() - t0 };
      }
      return { ok: false, latencyMs: Date.now() - t0 };
    }
  } catch {
    // try lightweight curl fallback once for strict TLS portals
  }

  try {
    const fb = await curlGetText(targetUrl, headers, 3, false, true);
    const ok = Boolean(
      fb.text && fb.text.includes('#EXTM3U') && !/nosignal|<!doctype|<html/i.test(fb.text)
    );
    return { ok, latencyMs: Date.now() - t0 };
  } catch {
    return { ok: false, latencyMs: Date.now() - t0 };
  }
}

function toBelixChannel(
  item: BelixRamSession['rawCandidates'][number],
  idx: number,
  latencyMs?: number
): BelixLiveChannel {
  const lang = inferStreamLang(item.categoryName, item.name);
  return {
    id: `belix-${item.streamId}`,
    streamId: item.streamId,
    dial: 800 + idx,
    name: item.name,
    shortMark: makeShortMark(item.name),
    brandTone: pickBrandTone(item.categoryName, item.name),
    network: item.categoryName || 'Belix TV',
    category: 'belix_live',
    sourceHub: 'belix',
    belixCategoryId: item.categoryId,
    belixCategoryName: item.categoryName,
    quality: 'HD Live',
    logoUrl: item.logoUrl,
    description: `Belix TV · ${item.categoryName || 'Directo estable'}`,
    epgChannelId: item.epgChannelId,
    probeOk: true,
    probeLatencyMs: latencyMs,
    channels: [
      {
        id: `belix-trk-${item.streamId}`,
        label: `${item.name} · Belix HD`,
        lang,
        quality: 'HD',
        sourceUrl: `/api/belix/stream/${encodeURIComponent(item.streamId)}.m3u8`,
        resolverType: 'direct_hls',
      },
    ],
  };
}

function rebuildCategoryCounts(session: BelixRamSession): void {
  const counts = new Map<string, number>();
  for (const ch of session.stableChannels) {
    counts.set(ch.belixCategoryId, (counts.get(ch.belixCategoryId) || 0) + 1);
  }
  session.categories = session.categories.map((cat) => ({
    ...cat,
    count: counts.get(cat.id) || 0,
  }));
}

async function probeCandidatesIntoSession(
  session: BelixRamSession,
  candidates: BelixRamSession['rawCandidates'],
  seq: number,
  concurrency = 12
): Promise<void> {
  const stableIds = new Set(session.stableChannels.map((c) => c.streamId));
  let cursor = 0;

  const workers = Array.from({ length: Math.min(concurrency, candidates.length) }, async () => {
    while (cursor < candidates.length) {
      if (activeSession !== session || backgroundProbeSeq !== seq) return;
      const item = candidates[cursor++];
      if (!item || stableIds.has(item.streamId)) continue;
      const res = await probeXtreamLiveM3u8(session, item.streamId, 2400);
      if (activeSession !== session || backgroundProbeSeq !== seq) return;
      if (res.ok) {
        stableIds.add(item.streamId);
        session.stableChannels.push(
          toBelixChannel(item, session.stableChannels.length, res.latencyMs)
        );
      }
    }
  });

  await Promise.all(workers);
  if (activeSession === session && backgroundProbeSeq === seq) {
    rebuildCategoryCounts(session);
  }
}

export async function connectBelixSession(params: {
  serverUrl: string;
  username: string;
  password: string;
}): Promise<BelixConnectionStatus> {
  const normalizedServer = normalizeServerInput(params.serverUrl);
  const username = String(params.username || '').trim();
  const password = String(params.password || '').trim();

  if (!normalizedServer || !username || !password) {
    return {
      connected: false,
      serverOrigin: '',
      maskedUsername: maskUsername(username),
      totalRawStreams: 0,
      stableCount: 0,
      probing: false,
      categories: [],
      error: 'Servidor Xtream, usuario y contraseña requeridos.',
    };
  }

  let parsedServer: URL;
  try {
    parsedServer = await assertSafeProxyUrl(normalizedServer);
  } catch (err) {
    return {
      connected: false,
      serverOrigin: '',
      maskedUsername: maskUsername(username),
      totalRawStreams: 0,
      stableCount: 0,
      probing: false,
      categories: [],
      error: err instanceof Error ? err.message : 'Servidor no permitido.',
    };
  }

  const origin = parsedServer.origin;
  const authUrl = `${origin}/player_api.php?username=${encodeURIComponent(
    username
  )}&password=${encodeURIComponent(password)}`;

  try {
    const authRes = await streamingFetch(authUrl, {
      method: 'GET',
      headers: { 'User-Agent': CHROME_UA, Accept: 'application/json' },
      timeoutMs: 8500,
    });
    if (!authRes.ok) {
      return {
        connected: false,
        serverOrigin: origin,
        maskedUsername: maskUsername(username),
        totalRawStreams: 0,
        stableCount: 0,
        probing: false,
        categories: [],
        error: `El portal respondió HTTP ${authRes.status}.`,
      };
    }

    const authJson = (await authRes.json().catch(() => null)) as any;
    const userInfo = authJson?.user_info;
    const serverInfo = authJson?.server_info;
    if (!userInfo || Number(userInfo.auth) === 0) {
      return {
        connected: false,
        serverOrigin: origin,
        maskedUsername: maskUsername(username),
        userStatus: String(userInfo?.status || 'Auth failed'),
        totalRawStreams: 0,
        stableCount: 0,
        probing: false,
        categories: [],
        error: 'Credenciales rechazadas por el servidor Xtream.',
      };
    }

    const statusLower = String(userInfo.status || 'Active').toLowerCase();
    if (statusLower === 'expired' || statusLower === 'disabled' || statusLower === 'banned') {
      return {
        connected: false,
        serverOrigin: origin,
        maskedUsername: maskUsername(username),
        userStatus: String(userInfo.status),
        totalRawStreams: 0,
        stableCount: 0,
        probing: false,
        categories: [],
        error: `Cuenta Xtream en estado "${String(userInfo.status)}".`,
      };
    }

    const [catRes, liveRes] = await Promise.all([
      streamingFetch(`${authUrl}&action=get_live_categories`, {
        headers: { 'User-Agent': CHROME_UA, Accept: 'application/json' },
        timeoutMs: 8000,
      }).catch(() => null),
      streamingFetch(`${authUrl}&action=get_live_streams`, {
        headers: { 'User-Agent': CHROME_UA, Accept: 'application/json' },
        timeoutMs: 12000,
      }).catch(() => null),
    ]);

    const rawCats = catRes?.ok ? ((await catRes.json().catch(() => [])) as any[]) : [];
    const rawStreams = liveRes?.ok ? ((await liveRes.json().catch(() => [])) as any[]) : [];

    const catMap = new Map<string, string>();
    const categories: BelixXtreamCategory[] = [];
    if (Array.isArray(rawCats)) {
      for (const c of rawCats) {
        const id = String(c?.category_id || '').trim();
        const name = String(c?.category_name || '').trim();
        if (!id || !name || isDisallowedStreamName(name, '')) continue;
        catMap.set(id, name);
        categories.push({ id, name, count: 0 });
      }
    }

    const rawCandidates: BelixRamSession['rawCandidates'] = [];
    const seenIds = new Set<string>();
    if (Array.isArray(rawStreams)) {
      for (const s of rawStreams) {
        const streamId = String(s?.stream_id || '').trim();
        const name = String(s?.name || '').trim();
        if (!streamId || !/^[a-zA-Z0-9_-]{1,24}$/.test(streamId) || seenIds.has(streamId)) continue;
        const categoryId = String(s?.category_id || '0').trim() || '0';
        const categoryName = catMap.get(categoryId) || 'General';
        if (!name || isDisallowedStreamName(categoryName, name)) continue;
        seenIds.add(streamId);
        rawCandidates.push({
          streamId,
          name,
          categoryId,
          categoryName,
          logoUrl: sanitizeHttpImageUrl(s?.stream_icon),
          epgChannelId: String(s?.epg_channel_id || '').trim() || undefined,
        });
      }
    }

    const seq = ++backgroundProbeSeq;
    const nextSession: BelixRamSession = {
      origin,
      username,
      password,
      userStatus: String(userInfo.status || 'Active'),
      activeConnections: String(userInfo.active_cons ?? '0'),
      maxConnections: String(userInfo.max_connections ?? '1'),
      expDate: userInfo.exp_date ? String(userInfo.exp_date) : undefined,
      serverTimezone: serverInfo?.timezone ? String(serverInfo.timezone) : undefined,
      categories,
      rawCandidates,
      stableChannels: [],
      probing: rawCandidates.length > 0,
      lastSyncedAt: Date.now(),
    };
    activeSession = nextSession;

    // Immediate foreground probe on first balanced slice (up to 48 streams across categories)
    const initialBatch = rawCandidates.slice(0, 48);
    await probeCandidatesIntoSession(nextSession, initialBatch, seq, 12);

    const remaining = rawCandidates.slice(48);
    if (remaining.length > 0 && activeSession === nextSession && backgroundProbeSeq === seq) {
      void probeCandidatesIntoSession(nextSession, remaining, seq, 10).finally(() => {
        if (activeSession === nextSession && backgroundProbeSeq === seq) {
          nextSession.probing = false;
        }
      });
    } else {
      nextSession.probing = false;
    }

    return getBelixStatus();
  } catch (err) {
    return {
      connected: false,
      serverOrigin: origin,
      maskedUsername: maskUsername(username),
      totalRawStreams: 0,
      stableCount: 0,
      probing: false,
      categories: [],
      error: err instanceof Error ? err.message : 'Error conectando al servidor Belix TV.',
    };
  }
}

export function disconnectBelixSession(): void {
  backgroundProbeSeq += 1;
  activeSession = null;
  clearBelixOpaqueCaches();
}

export async function refreshBelixChannels(): Promise<BelixConnectionStatus> {
  if (!activeSession) return getBelixStatus();
  return connectBelixSession({
    serverUrl: activeSession.origin,
    username: activeSession.username,
    password: activeSession.password,
  });
}

export function getBelixStatus(): BelixConnectionStatus {
  if (!activeSession) {
    return {
      connected: false,
      serverOrigin: '',
      maskedUsername: '',
      totalRawStreams: 0,
      stableCount: 0,
      probing: false,
      categories: [],
    };
  }
  return {
    connected: true,
    serverOrigin: activeSession.origin,
    maskedUsername: maskUsername(activeSession.username),
    userStatus: activeSession.userStatus,
    activeConnections: activeSession.activeConnections,
    maxConnections: activeSession.maxConnections,
    expDate: activeSession.expDate,
    serverTimezone: activeSession.serverTimezone,
    totalRawStreams: activeSession.rawCandidates.length,
    stableCount: activeSession.stableChannels.length,
    probing: activeSession.probing,
    lastSyncedAt: activeSession.lastSyncedAt,
    categories: activeSession.categories,
    error: activeSession.lastError,
  };
}

export function getBelixLiveChannels(opts?: {
  categoryId?: string;
  query?: string;
}): BelixLiveChannel[] {
  if (!activeSession) return [];
  let list = [...activeSession.stableChannels];
  const catFilter = String(opts?.categoryId || '').trim();
  const q = String(opts?.query || '').trim().toLowerCase();
  if (catFilter && catFilter !== 'all') {
    list = list.filter((ch) => ch.belixCategoryId === catFilter);
  }
  if (q) {
    list = list.filter(
      (ch) =>
        ch.name.toLowerCase().includes(q) ||
        ch.belixCategoryName.toLowerCase().includes(q)
    );
  }
  return list;
}

export async function initBelixFromEnv(): Promise<void> {
  const srv = String(ENV.belixXtreamServer || '').trim();
  const usr = String(ENV.belixXtreamUser || '').trim();
  const pwd = String(ENV.belixXtreamPass || '').trim();
  if (!srv || !usr || !pwd) return;
  await connectBelixSession({ serverUrl: srv, username: usr, password: pwd }).catch(() => undefined);
}

export async function resolveBelixManifest(
  streamId: string,
  originPrefix = ''
): Promise<string | null> {
  return resolveBelixManifestForSession(activeSession, streamId, originPrefix);
}

export { resolveBelixSubPlaylist, fetchBelixOpaqueSegment };

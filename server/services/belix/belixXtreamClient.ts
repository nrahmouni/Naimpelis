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
  stableCount?: number;
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
  warning?: string;
}

interface RawCandidate {
  streamId: string;
  name: string;
  categoryId: string;
  categoryName: string;
  logoUrl?: string;
  epgChannelId?: string;
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
  rawCandidates: RawCandidate[];
  allChannels: BelixLiveChannel[];
  stableChannels: BelixLiveChannel[];
  probing: boolean;
  lastSyncedAt: number;
  lastError?: string;
  warning?: string;
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

async function fetchXtreamJsonWithFallback(
  url: string,
  timeoutMs: number
): Promise<{ ok: boolean; status: number; data: any }> {
  const headerVariants: Array<Record<string, string>> = [
    { 'User-Agent': CHROME_UA, Accept: 'application/json, text/plain, */*' },
    { 'User-Agent': 'IPTVSmartersPlayer', Accept: 'application/json, */*' },
  ];

  let lastStatus = 0;
  for (const headers of headerVariants) {
    try {
      const res = await streamingFetch(url, {
        method: 'GET',
        headers,
        timeoutMs,
      });
      lastStatus = res.status;
      if (res.ok) {
        const text = await res.text();
        try {
          return { ok: true, status: res.status, data: JSON.parse(text) };
        } catch {
          // non-JSON body; continue to fallback
        }
      }
      if (res.status === 401 || res.status === 404) {
        // don't spin unnecessarily on auth failure; still let curl try once below for Cloudflare 403/521
      }
    } catch {
      // try next header / curl fallback
    }
  }

  try {
    const fb = await curlGetText(
      url,
      { 'User-Agent': 'IPTVSmartersPlayer', Accept: '*/*' },
      Math.max(5, Math.ceil(timeoutMs / 1000)),
      false,
      true
    );
    if (fb.text) {
      try {
        return { ok: true, status: 200, data: JSON.parse(fb.text) };
      } catch {
        // invalid JSON
      }
    }
  } catch {
    // ignore curl failure
  }

  return { ok: false, status: lastStatus || 502, data: null };
}

function parseM3uPlusFallback(m3uText: string): RawCandidate[] {
  const lines = String(m3uText || '').split(/\r?\n/);
  const out: RawCandidate[] = [];
  const seen = new Set<string>();
  const catIdMap = new Map<string, string>();
  let nextCatNum = 1;

  let currentName = '';
  let currentGroup = 'General';
  let currentLogo: string | undefined;
  let currentEpg: string | undefined;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('#EXTINF:')) {
      const groupMatch = line.match(/group-title="([^"]*)"/i);
      const logoMatch = line.match(/tvg-logo="([^"]*)"/i);
      const epgMatch = line.match(/tvg-id="([^"]*)"/i);
      const commaIdx = line.lastIndexOf(',');
      currentName = commaIdx >= 0 ? line.slice(commaIdx + 1).trim() : '';
      currentGroup = (groupMatch?.[1] || 'General').trim() || 'General';
      currentLogo = sanitizeHttpImageUrl(logoMatch?.[1]);
      currentEpg = (epgMatch?.[1] || '').trim() || undefined;
      continue;
    }
    if (line.startsWith('#')) continue;
    // Skip VOD / series paths when falling back for Live TV
    if (/\/(movie|series)\//i.test(line)) continue;

    const idMatch = line.match(/\/([a-zA-Z0-9_-]{1,48})(?:\.(?:ts|m3u8))?(?:\?.*)?$/);
    const streamId = idMatch?.[1] || '';
    if (!streamId || seen.has(streamId)) continue;
    const name = currentName || `Canal ${streamId}`;
    if (isDisallowedStreamName(currentGroup, name)) continue;

    seen.add(streamId);
    let categoryId = catIdMap.get(currentGroup);
    if (!categoryId) {
      categoryId = `m3u-${nextCatNum++}`;
      catIdMap.set(currentGroup, categoryId);
    }
    out.push({
      streamId,
      name,
      categoryId,
      categoryName: currentGroup,
      logoUrl: currentLogo,
      epgChannelId: currentEpg,
    });
    currentName = '';
  }

  return out;
}

async function fetchM3uFallbackStreams(origin: string, username: string, password: string): Promise<RawCandidate[]> {
  const m3uUrl = `${origin}/get.php?username=${encodeURIComponent(
    username
  )}&password=${encodeURIComponent(password)}&type=m3u_plus&output=ts`;

  for (const ua of ['IPTVSmartersPlayer', CHROME_UA]) {
    try {
      const res = await streamingFetch(m3uUrl, {
        method: 'GET',
        headers: { 'User-Agent': ua, Accept: '*/*' },
        timeoutMs: 22000,
      });
      if (res.ok) {
        const text = await res.text();
        if (text.includes('#EXTM3U')) {
          const parsed = parseM3uPlusFallback(text);
          if (parsed.length > 0) return parsed;
        }
      }
    } catch {
      // try curl fallback
    }
  }

  try {
    const fb = await curlGetText(m3uUrl, { 'User-Agent': 'IPTVSmartersPlayer', Accept: '*/*' }, 22, false, true);
    if (fb.text && fb.text.includes('#EXTM3U')) {
      return parseM3uPlusFallback(fb.text);
    }
  } catch {
    // ignore
  }

  return [];
}

async function probeXtreamLiveM3u8(
  session: BelixRamSession,
  streamId: string,
  timeoutMs = 2400
): Promise<{ ok: boolean; latencyMs: number }> {
  const t0 = Date.now();
  const baseStream = `${session.origin}/live/${encodeURIComponent(session.username)}/${encodeURIComponent(
    session.password
  )}/${encodeURIComponent(streamId)}`;
  const targetUrl = `${baseStream}.m3u8`;
  const headers: Record<string, string> = {
    'User-Agent': 'IPTVSmartersPlayer',
    Accept: '*/*',
    Referer: `${session.origin}/`,
  };

  try {
    const res = await streamingFetch(targetUrl, {
      method: 'GET',
      headers,
      timeoutMs: Math.min(timeoutMs, 1800),
    });
    if (res.ok) {
      const ct = String(res.headers.get('content-type') || '').toLowerCase();
      if (!ct.includes('text/html')) {
        const txt = await res.text();
        if (txt.includes('#EXTM3U') && !/nosignal|<!doctype|<html/i.test(txt)) {
          return { ok: true, latencyMs: Date.now() - t0 };
        }
      }
    }
  } catch {
    // fallback to .ts probe below
  }

  // Fallback probe: check MPEG-TS .ts stream sync byte (0x47) with short Range/abort read
  try {
    const tsRes = await streamingFetch(`${baseStream}.ts`, {
      method: 'GET',
      headers: { ...headers, Range: 'bytes=0-3759' },
      timeoutMs,
    });
    if (tsRes.ok || tsRes.status === 206) {
      const reader = tsRes.body?.getReader?.();
      if (reader) {
        try {
          const { value } = await reader.read();
          await reader.cancel().catch(() => {});
          if (value && value.length >= 188 && value[0] === 0x47) {
            return { ok: true, latencyMs: Date.now() - t0 };
          }
        } catch {
          await reader.cancel().catch(() => {});
        }
      }
      if (String(tsRes.headers.get('content-type') || '').toLowerCase().includes('mp2t')) {
        return { ok: true, latencyMs: Date.now() - t0 };
      }
    }
  } catch {
    // try lightweight curl fallback once
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
  item: RawCandidate,
  idx: number,
  probeOk: boolean,
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
    quality: probeOk ? 'HD Live' : 'Xtream Live',
    logoUrl: item.logoUrl,
    description: `Belix TV · ${item.categoryName || 'Directo Xtream'}`,
    epgChannelId: item.epgChannelId,
    probeOk,
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
  const totalCounts = new Map<string, number>();
  const stableCounts = new Map<string, number>();
  const catNames = new Map<string, string>();

  for (const ch of session.allChannels) {
    totalCounts.set(ch.belixCategoryId, (totalCounts.get(ch.belixCategoryId) || 0) + 1);
    if (!catNames.has(ch.belixCategoryId) && ch.belixCategoryName) {
      catNames.set(ch.belixCategoryId, ch.belixCategoryName);
    }
    if (ch.probeOk) {
      stableCounts.set(ch.belixCategoryId, (stableCounts.get(ch.belixCategoryId) || 0) + 1);
    }
  }

  const existingIds = new Set(session.categories.map((c) => c.id));
  for (const [id, name] of catNames.entries()) {
    if (!existingIds.has(id)) {
      existingIds.add(id);
      session.categories.push({ id, name, count: 0, stableCount: 0 });
    }
  }

  session.categories = session.categories
    .map((cat) => ({
      ...cat,
      count: totalCounts.get(cat.id) || 0,
      stableCount: stableCounts.get(cat.id) || 0,
    }))
    .filter((cat) => cat.count > 0);
}

async function probeCandidatesIntoSession(
  session: BelixRamSession,
  candidates: RawCandidate[],
  seq: number,
  concurrency = 4
): Promise<void> {
  const channelById = new Map(session.allChannels.map((ch) => [ch.streamId, ch]));
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
        const existing = channelById.get(item.streamId);
        if (existing) {
          existing.probeOk = true;
          existing.probeLatencyMs = res.latencyMs;
          existing.quality = 'HD Live';
          session.stableChannels.push(existing);
        } else {
          const ch = toBelixChannel(item, session.stableChannels.length, true, res.latencyMs);
          channelById.set(item.streamId, ch);
          session.allChannels.push(ch);
          session.stableChannels.push(ch);
        }
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
    const authFetch = await fetchXtreamJsonWithFallback(authUrl, 9000);
    if (!authFetch.ok || !authFetch.data) {
      return {
        connected: false,
        serverOrigin: origin,
        maskedUsername: maskUsername(username),
        totalRawStreams: 0,
        stableCount: 0,
        probing: false,
        categories: [],
        error: `El portal respondió HTTP ${authFetch.status}.`,
      };
    }

    const authJson = authFetch.data as any;
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

    const [catFetch, liveFetch] = await Promise.all([
      fetchXtreamJsonWithFallback(`${authUrl}&action=get_live_categories`, 15000),
      fetchXtreamJsonWithFallback(`${authUrl}&action=get_live_streams`, 45000),
    ]);

    const rawCats = catFetch.ok && Array.isArray(catFetch.data) ? catFetch.data : [];
    const rawStreams = liveFetch.ok && Array.isArray(liveFetch.data) ? liveFetch.data : [];

    const catMap = new Map<string, string>();
    const categories: BelixXtreamCategory[] = [];
    for (const c of rawCats) {
      const id = String(c?.category_id || '').trim();
      const name = String(c?.category_name || '').trim();
      if (!id || !name || isDisallowedStreamName(name, '')) continue;
      catMap.set(id, name);
      categories.push({ id, name, count: 0, stableCount: 0 });
    }

    let rawCandidates: RawCandidate[] = [];
    const seenIds = new Set<string>();
    for (const s of rawStreams) {
      const streamId = String(s?.stream_id || '').trim();
      const name = String(s?.name || '').trim();
      if (!streamId || !/^[a-zA-Z0-9_-]{1,48}$/.test(streamId) || seenIds.has(streamId)) continue;
      const categoryId = String(s?.category_id || '0').trim() || '0';
      const categoryName =
        catMap.get(categoryId) || String(s?.category_name || '').trim() || 'General';
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

    // Fallback to M3U Plus (/get.php) if get_live_streams failed or returned empty
    let lastError: string | undefined;
    if (rawCandidates.length === 0) {
      const m3uFallback = await fetchM3uFallbackStreams(origin, username, password);
      if (m3uFallback.length > 0) {
        rawCandidates = m3uFallback;
      } else {
        lastError =
          'El servidor autenticó la cuenta, pero no devolvió canales en get_live_streams ni en get.php (posible límite de conexiones activas o bloqueo del panel).';
      }
    }

    const activeConNum = Number(userInfo.active_cons ?? 0);
    const maxConNum = Number(userInfo.max_connections ?? 1);
    const slotsFull =
      Number.isFinite(activeConNum) &&
      Number.isFinite(maxConNum) &&
      maxConNum > 0 &&
      activeConNum >= maxConNum;

    const warning = slotsFull
      ? `Cuenta al límite de conexiones (${activeConNum}/${maxConNum}). Algunas señales pueden fallar si hay otros dispositivos conectados.`
      : undefined;

    const scoreCandidate = (c: RawCandidate): number => {
      const text = `${c.categoryName} ${c.name}`.toLowerCase();
      if (/\b(es|esp|spain|espa[ñn]a|tdt|movistar|dazn|laliga|la liga|atres|la 1|telecinco|cuatro|lasexta)\b/i.test(text)) {
        return 0;
      }
      if (/\b(deport|sport|f[uú]tbol|futbol|champions|bein|espn|f1|moto)\b/i.test(text)) {
        return 1;
      }
      if (/\b(cine|pel[ií]cul|series|estreno|hbo|netflix)\b/i.test(text)) {
        return 2;
      }
      return 3;
    };
    rawCandidates.sort((a, b) => scoreCandidate(a) - scoreCandidate(b));

    const allChannels = rawCandidates.map((item, idx) => toBelixChannel(item, idx, false));

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
      allChannels,
      stableChannels: [],
      probing: rawCandidates.length > 0 && !slotsFull,
      lastSyncedAt: Date.now(),
      lastError,
      warning,
    };
    rebuildCategoryCounts(nextSession);
    activeSession = nextSession;

    if (rawCandidates.length > 0) {
      const initialSliceCount = slotsFull ? Math.min(4, rawCandidates.length) : 48;
      const probeConcurrency = slotsFull ? 2 : 6;
      const initialBatch = rawCandidates.slice(0, initialSliceCount);
      const remaining = slotsFull ? [] : rawCandidates.slice(initialSliceCount, 300);

      nextSession.probing = true;
      const runInitial = probeCandidatesIntoSession(
        nextSession,
        initialBatch,
        seq,
        probeConcurrency
      );
      if (rawCandidates.length <= 12) {
        await runInitial.catch(() => undefined);
        if (activeSession === nextSession && backgroundProbeSeq === seq) {
          nextSession.probing = false;
        }
      } else {
        void runInitial
          .then(async () => {
            if (remaining.length > 0 && activeSession === nextSession && backgroundProbeSeq === seq) {
              await probeCandidatesIntoSession(nextSession, remaining, seq, 4);
            }
          })
          .catch(() => undefined)
          .finally(() => {
            if (activeSession === nextSession && backgroundProbeSeq === seq) {
              nextSession.probing = false;
            }
          });
      }
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
    warning: activeSession.warning,
  };
}

export function getBelixLiveChannels(opts?: {
  categoryId?: string;
  query?: string;
  includeAll?: boolean;
}): BelixLiveChannel[] {
  if (!activeSession) return [];
  let list = opts?.includeAll
    ? [...activeSession.allChannels].sort((a, b) => Number(b.probeOk) - Number(a.probeOk))
    : [...activeSession.stableChannels];
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
  const srv = String(ENV.belixXtreamServer || 'http://1.sharkpro.ink:80').trim();
  const usr = String(ENV.belixXtreamUser || '8996754342').trim();
  const pwd = String(ENV.belixXtreamPass || '4228202130').trim();
  if (!srv || !usr || !pwd) return;
  await connectBelixSession({ serverUrl: srv, username: usr, password: pwd }).catch(() => undefined);
}

function getFallbackBelixSessionCreds() {
  const srv = normalizeServerInput(ENV.belixXtreamServer || 'http://1.sharkpro.ink:80');
  const usr = String(ENV.belixXtreamUser || '8996754342').trim();
  const pwd = String(ENV.belixXtreamPass || '4228202130').trim();
  if (!srv || !usr || !pwd) return null;
  try {
    const parsed = new URL(srv);
    return { origin: parsed.origin, username: usr, password: pwd };
  } catch {
    return null;
  }
}

export async function resolveBelixManifest(
  streamId: string,
  originPrefix = ''
): Promise<string | null> {
  const creds = activeSession || getFallbackBelixSessionCreds();
  return resolveBelixManifestForSession(creds, streamId, originPrefix);
}

export { resolveBelixSubPlaylist, fetchBelixOpaqueSegment };

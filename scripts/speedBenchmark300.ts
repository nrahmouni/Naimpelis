import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

interface CliConfig {
  baseUrl: string;
  moviesCount: number;
  seriesCount: number;
  channelsCount: number;
  concurrency: number;
  vodTimeoutMs: number;
  channelTimeoutMs: number;
  force: boolean;
  seed: number;
}

type MediaCategory = 'movie' | 'series' | 'channel';

interface MovieSeed {
  id: string;
  tmdbId?: string;
  title: string;
  origTitle?: string;
  year?: string;
  movidyUrl?: string;
  gnulaUrl?: string;
  vestUrl?: string;
  bingetrixUrl?: string;
  catalogOrigin: string;
  preferLang: string;
}

interface SeriesSeed {
  id: string;
  tmdbId?: string;
  title: string;
  origTitle?: string;
  year?: string;
  movidyUrl?: string;
  gnulaUrl?: string;
  vestUrl?: string;
  season: number;
  episode: number;
  catalogOrigin: string;
  preferLang: string;
}

interface ChannelTrackSeed {
  id?: string;
  label?: string;
  lang?: string;
  quality?: string;
  providerId?: string;
  providerName?: string;
  sourceUrl: string;
  referer?: string;
  resolverType?: string;
}

interface ChannelSeed {
  id: string;
  name: string;
  network?: string;
  category?: string;
  countryCode?: string;
  sourceHub?: string;
  preferLang: string;
  tracks: ChannelTrackSeed[];
}

interface BenchmarkItemResult {
  category: MediaCategory;
  title: string;
  requestedLang: string;
  actualLang: string;
  catalogOrigin: string;
  resolvedSource: string;
  resolvedLabel: string;
  mode: string;
  ok: boolean;
  httpStatus: number;
  elapsedMs: number;
  serverLatencyMs?: number;
  fromCache?: boolean;
  trackCount: number;
  error?: string;
}

interface StatsSummary {
  total: number;
  ok: number;
  failed: number;
  successRatePct: number;
  wallDurationMs: number;
  minMs: number;
  avgMs: number;
  p50Ms: number;
  p90Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
  okAvgMs: number;
  okP50Ms: number;
  okP90Ms: number;
}

interface StoredBaseline {
  generatedAt: string;
  seed: number;
  config: CliConfig;
  overall: StatsSummary;
  categories: Record<MediaCategory, StatsSummary>;
}

function parseCliArgs(argv: string[]): CliConfig {
  const map = new Map<string, string>();
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;
    const eqIdx = arg.indexOf('=');
    if (eqIdx === -1) {
      map.set(arg.slice(2), 'true');
    } else {
      map.set(arg.slice(2, eqIdx), arg.slice(eqIdx + 1));
    }
  }
  const intOpt = (key: string, fallback: number): number => {
    const raw = map.get(key);
    if (!raw) return fallback;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  };
  return {
    baseUrl: (map.get('base-url') || 'http://127.0.0.1:3000').replace(/\/+$/, ''),
    moviesCount: intOpt('movies', 100),
    seriesCount: intOpt('series', 100),
    channelsCount: intOpt('channels', 100),
    concurrency: Math.min(12, Math.max(1, intOpt('concurrency', 4))),
    vodTimeoutMs: intOpt('timeout-ms', 25000),
    channelTimeoutMs: intOpt('channel-timeout-ms', 10000),
    force: map.get('force') === 'true' || map.get('force') === '1',
    seed: intOpt('seed', Date.now() % 1_000_000_000),
  };
}

function createPrng(seed: number): () => number {
  let state = seed >>> 0 || 123456789;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function shuffleWithSeed<T>(items: T[], rand: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function normalizeText(value: unknown): string {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return Math.round(sorted[idx]);
}

function computeStats(items: BenchmarkItemResult[], wallDurationMs = 0): StatsSummary {
  const total = items.length;
  const okItems = items.filter((i) => i.ok);
  const failed = total - okItems.length;
  const allSorted = items.map((i) => i.elapsedMs).sort((a, b) => a - b);
  const okSorted = okItems.map((i) => i.elapsedMs).sort((a, b) => a - b);
  const sum = allSorted.reduce((acc, v) => acc + v, 0);
  const okSum = okSorted.reduce((acc, v) => acc + v, 0);

  return {
    total,
    ok: okItems.length,
    failed,
    successRatePct: total > 0 ? Number(((okItems.length / total) * 100).toFixed(1)) : 0,
    wallDurationMs: Math.round(wallDurationMs),
    minMs: allSorted[0] ? Math.round(allSorted[0]) : 0,
    avgMs: total > 0 ? Math.round(sum / total) : 0,
    p50Ms: percentile(allSorted, 50),
    p90Ms: percentile(allSorted, 90),
    p95Ms: percentile(allSorted, 95),
    p99Ms: percentile(allSorted, 99),
    maxMs: allSorted.length > 0 ? Math.round(allSorted[allSorted.length - 1]) : 0,
    okAvgMs: okSorted.length > 0 ? Math.round(okSum / okSorted.length) : 0,
    okP50Ms: percentile(okSorted, 50),
    okP90Ms: percentile(okSorted, 90),
  };
}

function classifyVodSource(label: string, streamUrl: string, catalogOrigin: string): string {
  const combined = `${label} ${streamUrl}`.toLowerCase();
  if (/xtream|belix|vod[\s-]*4k|ultra[\s-]*vip|shark[\s-]*pro|24tv|dana|adtupac|sult/.test(combined)) return 'Xtream/IPTV';
  if (/movidy/.test(combined)) return 'Movidy';
  if (/gnula/.test(combined)) return 'GnulaHD';
  if (/ghostflix|vidbolt/.test(combined)) return 'Ghostflix';
  if (/clipbox/.test(combined)) return 'Clipbox';
  if (/bingetrix/.test(combined)) return 'Bingetrix';
  if (/2embed/.test(combined)) return '2Embed';
  if (/vest|cinenet/.test(combined)) return 'Vest';
  if (/embed69|vidhide|streamwish|filemoon|dood|voe|mixdrop/.test(combined)) return 'Mirror/Embed69';
  if (/dailymotion|archive\.org/.test(combined)) return 'Archive/DM';
  if (/youtube/.test(combined)) return 'YouTube';
  return catalogOrigin ? `Fallback(${catalogOrigin})` : 'Other';
}

function classifyLiveSource(label: string, sourceHub: string, mode: string): string {
  const combined = `${label} ${sourceHub} ${mode}`.toLowerCase();
  if (/belix|xtream|vod-?4k|shark|24tv|dana|adtupac|ultra|sult/.test(combined)) return 'Xtream/IPTV';
  if (/rbtv/.test(combined)) return 'RBTV';
  if (/elahmad/.test(combined)) return 'Elahmad';
  if (/famelack|free-tv|iptv-org|adrar/.test(combined)) return 'WorldIPTV';
  if (/tdt|rtve|atresmedia|mediaset|telemadrid|eitb|ccma|tvg|canal sur|dvb/.test(combined)) return 'TDT-Direct';
  if (/embed/.test(mode.toLowerCase())) return 'WebEmbed';
  return sourceHub || 'OtherLive';
}

function detectActualLang(label: string, fallbackLang: string): string {
  const up = String(label || '').toUpperCase();
  if (/\bCASTELLANO\b|\bESPANOL\b|\bESPAÑOL\b|\bES\b/.test(up)) return 'ES';
  if (/\bLATINO\b|\bLAT\b/.test(up)) return 'LAT';
  if (/\bVOSE\b|\bSUBTITUL/.test(up)) return 'VOSE';
  if (/\bENGLISH\b|\bINGLES\b|\bEN\b/.test(up)) return 'EN';
  if (/\bARAB|\bAR\b/.test(up)) return 'AR';
  if (/\bFRAN|\bFR\b/.test(up)) return 'FR';
  return fallbackLang || 'OTHER';
}

function inferChannelLang(ch: Record<string, any>): string {
  const trackLang = String(ch?.channels?.[0]?.lang || '').trim().toUpperCase();
  if (trackLang && trackLang !== 'MULTI') return trackLang;
  const cc = String(ch?.countryCode || '').trim().toUpperCase();
  if (cc === 'ES' || cc === 'MX' || cc === 'AR' || cc === 'CO' || cc === 'CL' || cc === 'PE') return 'ES';
  if (cc === 'US' || cc === 'GB' || cc === 'UK' || cc === 'CA' || cc === 'AU') return 'EN';
  if (cc === 'MA' || cc === 'SA' || cc === 'EG' || cc === 'AE' || cc === 'QA') return 'AR';
  if (cc === 'FR') return 'FR';
  if (cc === 'DE') return 'DE';
  if (cc === 'PT' || cc === 'BR') return 'PT';
  if (cc === 'IT') return 'IT';
  if (cc === 'CN') return 'ZH';
  return trackLang || (cc ? cc : 'ES');
}

async function fetchJsonSafe<T>(url: string, init?: RequestInit, timeoutMs = 15000): Promise<{ status: number; data: T | null; error?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { ...init, signal: controller.signal });
    const status = resp.status;
    let data: T | null = null;
    try {
      data = (await resp.json()) as T;
    } catch {
      data = null;
    }
    return { status, data };
  } catch (err: any) {
    const isAbort = err?.name === 'AbortError';
    return {
      status: isAbort ? 408 : 0,
      data: null,
      error: isAbort ? `timeout_${timeoutMs}ms` : String(err?.message || err || 'fetch_error'),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function gatherMovieSeeds(baseUrl: string, count: number, rand: () => number): Promise<MovieSeed[]> {
  const categories = ['trending', 'popular', 'top_rated', 'action', 'comedy', 'scifi'];
  const urls: string[] = [
    `${baseUrl}/api/catalog/latest-releases`,
    `${baseUrl}/api/catalog/bingetrix`,
  ];
  for (const cat of categories) {
    for (const page of [1, 2, 3, 4]) {
      urls.push(`${baseUrl}/api/catalog/movies?provider=all&category=${cat}&page=${page}`);
    }
  }

  const responses = await Promise.all(urls.map((u) => fetchJsonSafe<any>(u, undefined, 14000)));
  const seen = new Set<string>();
  const pool: Omit<MovieSeed, 'preferLang'>[] = [];

  for (let idx = 0; idx < responses.length; idx++) {
    const payload = responses[idx].data;
    if (!payload) continue;
    const rawList: any[] = Array.isArray(payload.movies)
      ? payload.movies
      : Array.isArray(payload.items)
        ? payload.items
        : Array.isArray(payload.latestMovies)
          ? payload.latestMovies
          : [];

    for (const m of rawList) {
      const title = String(m?.title || m?.name || '').trim();
      if (!title) continue;
      const tmdbId = String(m?.tmdbId || m?.id || '').replace(/\D/g, '') || undefined;
      const dedupeKey = tmdbId ? `tmdb:${tmdbId}` : `title:${normalizeText(title)}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      const movidyUrl = m?.movidyUrl ? String(m.movidyUrl) : undefined;
      const gnulaUrl = m?.gnulaUrl ? String(m.gnulaUrl) : undefined;
      const vestUrl = m?.vestUrl ? String(m.vestUrl) : undefined;
      const bingetrixUrl = m?.bingetrixUrl ? String(m.bingetrixUrl) : undefined;
      const catalogOrigin = movidyUrl
        ? 'movidy'
        : gnulaUrl
          ? 'gnula'
          : vestUrl
            ? 'vest'
            : bingetrixUrl
              ? 'bingetrix'
              : 'tmdb';

      pool.push({
        id: String(m?.id || tmdbId || dedupeKey),
        tmdbId,
        title,
        origTitle: m?.originalTitle ? String(m.originalTitle) : undefined,
        year: String(m?.year || m?.releaseDate || '').slice(0, 4) || undefined,
        movidyUrl,
        gnulaUrl,
        vestUrl,
        bingetrixUrl,
        catalogOrigin,
      });
    }
  }

  const langs = ['ES', 'LAT', 'VOSE', 'EN'];
  const picked = shuffleWithSeed(pool, rand).slice(0, count);
  return picked.map((item, i) => ({
    ...item,
    preferLang: langs[i % langs.length],
  }));
}

async function gatherSeriesSeeds(baseUrl: string, count: number, rand: () => number): Promise<SeriesSeed[]> {
  const categories = ['trending', 'popular', 'top_rated', 'action', 'animation'];
  const urls: string[] = [`${baseUrl}/api/catalog/latest-releases`];
  for (const cat of categories) {
    for (const page of [1, 2, 3, 4]) {
      urls.push(`${baseUrl}/api/catalog/series?provider=all&category=${cat}&page=${page}`);
    }
  }
  for (const page of [1, 2]) {
    urls.push(`${baseUrl}/api/catalog/series?provider=crunchyroll&category=popular&page=${page}`);
  }

  const responses = await Promise.all(urls.map((u) => fetchJsonSafe<any>(u, undefined, 14000)));
  const seen = new Set<string>();
  const pool: Omit<SeriesSeed, 'preferLang'>[] = [];

  for (const r of responses) {
    const payload = r.data;
    if (!payload) continue;
    const rawList: any[] = Array.isArray(payload.series)
      ? payload.series
      : Array.isArray(payload.newSeasons)
        ? payload.newSeasons
        : Array.isArray(payload.items)
          ? payload.items
          : [];

    for (const s of rawList) {
      const title = String(s?.title || s?.name || '').trim();
      if (!title) continue;
      const tmdbId = String(s?.tmdbId || s?.id || '').replace(/\D/g, '') || undefined;
      const dedupeKey = tmdbId ? `tmdb:${tmdbId}` : `title:${normalizeText(title)}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      const movidyUrl = s?.movidyUrl ? String(s.movidyUrl) : undefined;
      const gnulaUrl = s?.gnulaUrl ? String(s.gnulaUrl) : undefined;
      const vestUrl = s?.vestUrl ? String(s.vestUrl) : undefined;
      const catalogOrigin = movidyUrl ? 'movidy' : gnulaUrl ? 'gnula' : vestUrl ? 'vest' : 'tmdb';

      const seasonRaw = Number(s?.seasonNumber || 1);
      const episodeRaw = Number(s?.episodeNumber || 1);

      pool.push({
        id: String(s?.id || tmdbId || dedupeKey),
        tmdbId,
        title,
        origTitle: s?.originalTitle ? String(s.originalTitle) : undefined,
        year: String(s?.year || s?.firstAirDate || '').slice(0, 4) || undefined,
        movidyUrl,
        gnulaUrl,
        vestUrl,
        season: Number.isFinite(seasonRaw) && seasonRaw > 0 ? seasonRaw : 1,
        episode: Number.isFinite(episodeRaw) && episodeRaw > 0 ? episodeRaw : 1,
        catalogOrigin,
      });
    }
  }

  const langs = ['ES', 'LAT', 'VOSE', 'EN'];
  const picked = shuffleWithSeed(pool, rand).slice(0, count);
  return picked.map((item, i) => ({
    ...item,
    preferLang: langs[i % langs.length],
  }));
}

async function gatherChannelSeeds(baseUrl: string, count: number, rand: () => number): Promise<ChannelSeed[]> {
  const [tdtResp, worldResp] = await Promise.all([
    fetchJsonSafe<any>(`${baseUrl}/api/catalog/tdt`, undefined, 16000),
    fetchJsonSafe<any>(`${baseUrl}/api/catalog/world-tv`, undefined, 16000),
  ]);

  const seen = new Set<string>();
  const pool: ChannelSeed[] = [];

  const pushChannel = (ch: any, fallbackHub: string) => {
    const id = String(ch?.id || '').trim();
    const name = String(ch?.name || '').trim();
    if (!id || !name) return;
    const dedupeKey = `${id}|${normalizeText(name)}`;
    if (seen.has(dedupeKey)) return;
    const tracks: ChannelTrackSeed[] = Array.isArray(ch?.channels)
      ? ch.channels
          .filter((t: any) => Boolean(t?.sourceUrl))
          .map((t: any) => ({
            id: t.id ? String(t.id) : undefined,
            label: t.label ? String(t.label) : undefined,
            lang: t.lang ? String(t.lang) : undefined,
            quality: t.quality ? String(t.quality) : undefined,
            providerId: t.providerId ? String(t.providerId) : undefined,
            providerName: t.providerName ? String(t.providerName) : undefined,
            sourceUrl: String(t.sourceUrl),
            referer: t.referer ? String(t.referer) : undefined,
            resolverType: t.resolverType ? String(t.resolverType) : undefined,
          }))
      : [];
    if (tracks.length === 0) return;
    seen.add(dedupeKey);
    pool.push({
      id,
      name,
      network: ch?.network ? String(ch.network) : undefined,
      category: ch?.category ? String(ch.category) : undefined,
      countryCode: ch?.countryCode ? String(ch.countryCode) : undefined,
      sourceHub: String(ch?.sourceHub || fallbackHub),
      preferLang: inferChannelLang(ch),
      tracks,
    });
  };

  for (const ch of Array.isArray(tdtResp.data?.channels) ? tdtResp.data.channels : []) {
    pushChannel(ch, 'tdt');
  }
  for (const ch of Array.isArray(worldResp.data?.channels) ? worldResp.data.channels : []) {
    pushChannel(ch, 'world-tv');
  }

  return shuffleWithSeed(pool, rand).slice(0, count);
}

async function runPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, idx: number) => Promise<R>,
  onProgress?: (done: number, total: number) => void
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  let done = 0;

  const runners = Array.from({ length: Math.min(concurrency, Math.max(1, items.length)) }, async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= items.length) break;
      results[idx] = await worker(items[idx], idx);
      done++;
      if (onProgress && (done % 25 === 0 || done === items.length)) {
        onProgress(done, items.length);
      }
    }
  });

  await Promise.all(runners);
  return results;
}

async function benchmarkMovie(seed: MovieSeed, cfg: CliConfig): Promise<BenchmarkItemResult> {
  const qs = new URLSearchParams({
    mediaType: 'movie',
    title: seed.title,
    preferLang: seed.preferLang,
  });
  if (seed.tmdbId) qs.set('tmdbId', seed.tmdbId);
  if (seed.origTitle) qs.set('origTitle', seed.origTitle);
  if (seed.year) qs.set('year', seed.year);
  if (seed.movidyUrl) qs.set('movidyUrl', seed.movidyUrl);
  if (seed.gnulaUrl) qs.set('gnulaUrl', seed.gnulaUrl);
  if (seed.vestUrl) qs.set('vestUrl', seed.vestUrl);
  if (cfg.force) qs.set('force', '1');

  const t0 = performance.now();
  const resp = await fetchJsonSafe<any>(`${cfg.baseUrl}/api/extract/stream?${qs.toString()}`, undefined, cfg.vodTimeoutMs);
  const elapsedMs = performance.now() - t0;

  const ok = Boolean(resp.data?.success && resp.data?.streamUrl);
  const label = String(resp.data?.resolvedLabel || resp.data?.tracks?.[0]?.label || '');
  const streamUrl = String(resp.data?.streamUrl || '');

  return {
    category: 'movie',
    title: seed.title,
    requestedLang: seed.preferLang,
    actualLang: ok ? detectActualLang(label, seed.preferLang) : seed.preferLang,
    catalogOrigin: seed.catalogOrigin,
    resolvedSource: ok ? classifyVodSource(label, streamUrl, seed.catalogOrigin) : 'Failed',
    resolvedLabel: label,
    mode: ok ? String(resp.data?.mode || 'hls') : 'error',
    ok,
    httpStatus: resp.status,
    elapsedMs,
    trackCount: Array.isArray(resp.data?.tracks) ? resp.data.tracks.length : 0,
    error: ok ? undefined : String(resp.error || resp.data?.error || `http_${resp.status}`),
  };
}

async function benchmarkSeries(seed: SeriesSeed, cfg: CliConfig): Promise<BenchmarkItemResult> {
  const qs = new URLSearchParams({
    mediaType: 'tv',
    title: seed.title,
    season: String(seed.season),
    episode: String(seed.episode),
    preferLang: seed.preferLang,
  });
  if (seed.tmdbId) qs.set('tmdbId', seed.tmdbId);
  if (seed.origTitle) qs.set('origTitle', seed.origTitle);
  if (seed.year) qs.set('year', seed.year);
  if (seed.movidyUrl) qs.set('movidyUrl', seed.movidyUrl);
  if (seed.gnulaUrl) qs.set('gnulaUrl', seed.gnulaUrl);
  if (seed.vestUrl) qs.set('vestUrl', seed.vestUrl);
  if (cfg.force) qs.set('force', '1');

  const t0 = performance.now();
  const resp = await fetchJsonSafe<any>(`${cfg.baseUrl}/api/extract/stream?${qs.toString()}`, undefined, cfg.vodTimeoutMs);
  const elapsedMs = performance.now() - t0;

  const ok = Boolean(resp.data?.success && resp.data?.streamUrl);
  const label = String(resp.data?.resolvedLabel || resp.data?.tracks?.[0]?.label || '');
  const streamUrl = String(resp.data?.streamUrl || '');

  return {
    category: 'series',
    title: `${seed.title} (S${String(seed.season).padStart(2, '0')}E${String(seed.episode).padStart(2, '0')})`,
    requestedLang: seed.preferLang,
    actualLang: ok ? detectActualLang(label, seed.preferLang) : seed.preferLang,
    catalogOrigin: seed.catalogOrigin,
    resolvedSource: ok ? classifyVodSource(label, streamUrl, seed.catalogOrigin) : 'Failed',
    resolvedLabel: label,
    mode: ok ? String(resp.data?.mode || 'hls') : 'error',
    ok,
    httpStatus: resp.status,
    elapsedMs,
    trackCount: Array.isArray(resp.data?.tracks) ? resp.data.tracks.length : 0,
    error: ok ? undefined : String(resp.error || resp.data?.error || `http_${resp.status}`),
  };
}

async function benchmarkChannel(seed: ChannelSeed, cfg: CliConfig): Promise<BenchmarkItemResult> {
  const t0 = performance.now();
  const resp = await fetchJsonSafe<any>(
    `${cfg.baseUrl}/api/live/fast-resolve`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channelId: seed.id,
        title: seed.name,
        preferLang: seed.preferLang,
        preferQualityFirst: true,
        tracks: seed.tracks,
      }),
    },
    cfg.channelTimeoutMs
  );
  const elapsedMs = performance.now() - t0;

  const ok = Boolean((resp.data?.ok || resp.data?.success) && resp.data?.streamUrl);
  const winningLabel = String(resp.data?.winningTrack?.label || resp.data?.winningTrack?.providerName || '');
  const mode = ok ? String(resp.data?.mode || 'hls') : 'error';

  return {
    category: 'channel',
    title: `${seed.name}${seed.countryCode ? ` [${seed.countryCode.toUpperCase()}]` : ''}`,
    requestedLang: seed.preferLang,
    actualLang: ok ? detectActualLang(resp.data?.winningTrack?.lang || winningLabel, seed.preferLang) : seed.preferLang,
    catalogOrigin: seed.sourceHub || 'tdt',
    resolvedSource: ok ? classifyLiveSource(winningLabel, seed.sourceHub || '', mode) : 'Failed',
    resolvedLabel: winningLabel,
    mode,
    ok,
    httpStatus: resp.status,
    elapsedMs,
    serverLatencyMs: typeof resp.data?.latencyMs === 'number' ? Math.round(resp.data.latencyMs) : undefined,
    fromCache: Boolean(resp.data?.fromCache),
    trackCount: seed.tracks.length,
    error: ok ? undefined : String(resp.error || (resp.status === 200 ? 'no_live_track_alive' : `http_${resp.status}`)),
  };
}

function padRight(s: string, len: number): string {
  return s.length >= len ? s.slice(0, len) : s + ' '.repeat(len - s.length);
}

function formatGroupTable(
  title: string,
  groups: Map<string, BenchmarkItemResult[]>
): string[] {
  const lines: string[] = [`  ${title}`];
  lines.push(
    `  ${padRight('Grupo', 20)} | ${padRight('OK/Tot', 9)} | ${padRight('Exito', 7)} | ${padRight('p50(ok)', 8)} | ${padRight('Avg(ok)', 8)} | ${padRight('p90(all)', 8)} | Max(all)`
  );
  lines.push(`  ${'-'.repeat(86)}`);

  const entries = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
  for (const [key, list] of entries) {
    const st = computeStats(list);
    lines.push(
      `  ${padRight(key, 20)} | ${padRight(`${st.ok}/${st.total}`, 9)} | ${padRight(`${st.successRatePct}%`, 7)} | ${padRight(`${st.okP50Ms}ms`, 8)} | ${padRight(`${st.okAvgMs}ms`, 8)} | ${padRight(`${st.p90Ms}ms`, 8)} | ${st.maxMs}ms`
    );
  }
  return lines;
}

function groupBy(items: BenchmarkItemResult[], keyFn: (item: BenchmarkItemResult) => string): Map<string, BenchmarkItemResult[]> {
  const map = new Map<string, BenchmarkItemResult[]>();
  for (const item of items) {
    const k = keyFn(item) || 'OTHER';
    const arr = map.get(k);
    if (arr) arr.push(item);
    else map.set(k, [item]);
  }
  return map;
}

function formatCategoryReport(
  label: string,
  items: BenchmarkItemResult[],
  stats: StatsSummary
): string[] {
  const lines: string[] = [];
  lines.push(`==========================================================================================`);
  lines.push(`${label} (${stats.total} aleatorios)`);
  lines.push(
    `Exito: ${stats.ok}/${stats.total} (${stats.successRatePct}%) | Fallos: ${stats.failed} | Tiempo muro: ${(stats.wallDurationMs / 1000).toFixed(2)}s`
  );
  lines.push(
    `Latencia OK  -> min=${stats.minMs}ms | p50=${stats.okP50Ms}ms | avg=${stats.okAvgMs}ms | p90=${stats.okP90Ms}ms`
  );
  lines.push(
    `Latencia ALL -> p50=${stats.p50Ms}ms | avg=${stats.avgMs}ms | p90=${stats.p90Ms}ms | p95=${stats.p95Ms}ms | p99=${stats.p99Ms}ms | max=${stats.maxMs}ms`
  );
  lines.push('');
  lines.push(...formatGroupTable('Por Idioma Solicitado:', groupBy(items, (i) => i.requestedLang)));
  lines.push('');
  lines.push(...formatGroupTable('Por Fuente Resuelta:', groupBy(items, (i) => i.resolvedSource)));
  lines.push('');
  lines.push(...formatGroupTable('Por Origen de Catalogo:', groupBy(items, (i) => i.catalogOrigin)));
  lines.push('');
  lines.push(...formatGroupTable('Por Modo de Senal:', groupBy(items, (i) => i.mode)));

  const slowestOk = items
    .filter((i) => i.ok)
    .sort((a, b) => b.elapsedMs - a.elapsedMs)
    .slice(0, 5);
  if (slowestOk.length > 0) {
    lines.push('');
    lines.push('  Top 5 mas lentos (OK):');
    for (const item of slowestOk) {
      lines.push(
        `    - ${Math.round(item.elapsedMs)}ms | ${item.title} [${item.requestedLang}] -> ${item.resolvedSource} (${item.mode})`
      );
    }
  }

  const failures = items.filter((i) => !i.ok);
  if (failures.length > 0) {
    const errCounts = new Map<string, number>();
    for (const f of failures) {
      const k = f.error || 'unknown';
      errCounts.set(k, (errCounts.get(k) || 0) + 1);
    }
    lines.push('');
    lines.push(
      `  Resumen fallos (${failures.length}): ${[...errCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([k, n]) => `${k}=${n}`)
        .join(', ')}`
    );
    for (const f of failures.slice(0, 8)) {
      lines.push(`    x ${Math.round(f.elapsedMs)}ms | ${f.title} [${f.requestedLang}] (${f.catalogOrigin}) -> ${f.error}`);
    }
  }
  lines.push('');
  return lines;
}

async function main() {
  const cfg = parseCliArgs(process.argv.slice(2));
  const rand = createPrng(cfg.seed);
  const startedIso = new Date().toISOString();

  console.log(`[bench:300] Recopilando catalogos desde ${cfg.baseUrl} (seed=${cfg.seed})...`);

  const [movieSeeds, seriesSeeds, channelSeeds] = await Promise.all([
    gatherMovieSeeds(cfg.baseUrl, cfg.moviesCount, rand),
    gatherSeriesSeeds(cfg.baseUrl, cfg.seriesCount, rand),
    gatherChannelSeeds(cfg.baseUrl, cfg.channelsCount, rand),
  ]);

  console.log(
    `[bench:300] Muestras listas -> Peliculas=${movieSeeds.length}, Series=${seriesSeeds.length}, Canales=${channelSeeds.length} (concurrency=${cfg.concurrency}, force=${cfg.force ? 1 : 0})`
  );

  const ensureServerAlive = async (phase: string) => {
    for (let attempt = 1; attempt <= 6; attempt++) {
      const check = await fetchJsonSafe<any>(`${cfg.baseUrl}/api/health`, undefined, 3000);
      if (check.status >= 200 && check.status < 500) return;
      console.log(`[bench:300] Esperando servidor antes de ${phase} (intento ${attempt}/6)...`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  };

  await ensureServerAlive('Canales');
  const tChannelsStart = performance.now();
  const channelResults = await runPool(
    channelSeeds,
    Math.max(cfg.concurrency, 6),
    (seed) => benchmarkChannel(seed, cfg),
    (done, tot) => console.log(`[bench:300] Canales: ${done}/${tot}`)
  );
  const channelsWallMs = performance.now() - tChannelsStart;

  await ensureServerAlive('Series');
  const tSeriesStart = performance.now();
  const seriesResults = await runPool(
    seriesSeeds,
    cfg.concurrency,
    (seed) => benchmarkSeries(seed, cfg),
    (done, tot) => console.log(`[bench:300] Series: ${done}/${tot}`)
  );
  const seriesWallMs = performance.now() - tSeriesStart;

  await ensureServerAlive('Peliculas');
  const tMoviesStart = performance.now();
  const movieResults = await runPool(
    movieSeeds,
    cfg.concurrency,
    (seed) => benchmarkMovie(seed, cfg),
    (done, tot) => console.log(`[bench:300] Peliculas: ${done}/${tot}`)
  );
  const moviesWallMs = performance.now() - tMoviesStart;

  const allResults = [...movieResults, ...seriesResults, ...channelResults];
  const movieStats = computeStats(movieResults, moviesWallMs);
  const seriesStats = computeStats(seriesResults, seriesWallMs);
  const channelStats = computeStats(channelResults, channelsWallMs);
  const overallStats = computeStats(allResults, moviesWallMs + seriesWallMs + channelsWallMs);

  const logsDir = path.resolve(process.cwd(), 'logs');
  fs.mkdirSync(logsDir, { recursive: true });
  const latestJsonPath = path.join(logsDir, 'speed-benchmark-latest.json');

  let prevBaseline: StoredBaseline | null = null;
  if (fs.existsSync(latestJsonPath)) {
    try {
      prevBaseline = JSON.parse(fs.readFileSync(latestJsonPath, 'utf8')) as StoredBaseline;
    } catch {
      prevBaseline = null;
    }
  }

  const lines: string[] = [];
  lines.push(`==========================================================================================`);
  lines.push(`NAIM CINE - SPEED & EFFICIENCY BENCHMARK LOG (100 PELICULAS + 100 SERIES + 100 CANALES)`);
  lines.push(`==========================================================================================`);
  lines.push(`Fecha UTC       : ${startedIso}`);
  lines.push(`Target Base URL : ${cfg.baseUrl}`);
  lines.push(`Seed Aleatorio  : ${cfg.seed}`);
  lines.push(`Modo            : ${cfg.force ? 'Cold Force (force=1)' : 'First-Play Natural (sin force=1, items unicos)'}`);
  lines.push(`Concurrencia    : ${cfg.concurrency} workers | Timeout VOD=${cfg.vodTimeoutMs}ms | Timeout Live=${cfg.channelTimeoutMs}ms`);
  lines.push('');
  lines.push(
    `RESUMEN GLOBAL (${overallStats.total} tests): OK=${overallStats.ok}/${overallStats.total} (${overallStats.successRatePct}%) | Tiempo Total=${(overallStats.wallDurationMs / 1000).toFixed(2)}s`
  );
  lines.push(
    `Global OK -> p50=${overallStats.okP50Ms}ms | avg=${overallStats.okAvgMs}ms | p90=${overallStats.okP90Ms}ms | ALL p95=${overallStats.p95Ms}ms | max=${overallStats.maxMs}ms`
  );

  if (prevBaseline) {
    const dRate = (overallStats.successRatePct - prevBaseline.overall.successRatePct).toFixed(1);
    const dP50 = overallStats.okP50Ms - prevBaseline.overall.okP50Ms;
    const dAvg = overallStats.okAvgMs - prevBaseline.overall.okAvgMs;
    lines.push(
      `Delta vs anterior (${prevBaseline.generatedAt}): Exito ${Number(dRate) >= 0 ? '+' : ''}${dRate}pp | p50(ok) ${dP50 >= 0 ? '+' : ''}${dP50}ms | avg(ok) ${dAvg >= 0 ? '+' : ''}${dAvg}ms`
    );
  }
  lines.push('');
  lines.push(...formatCategoryReport('1. PELICULAS', movieResults, movieStats));
  lines.push(...formatCategoryReport('2. SERIES', seriesResults, seriesStats));
  lines.push(...formatCategoryReport('3. CANALES EN DIRECTO (TDT + WORLD TV)', channelResults, channelStats));

  const reportText = lines.join('\n');
  const safeStamp = startedIso.replace(/[:.]/g, '-');
  const latestLogPath = path.join(logsDir, 'speed-benchmark-latest.log');
  const datedLogPath = path.join(logsDir, `speed-benchmark-${safeStamp}.log`);

  const baselinePayload: StoredBaseline & { items: BenchmarkItemResult[] } = {
    generatedAt: startedIso,
    seed: cfg.seed,
    config: cfg,
    overall: overallStats,
    categories: {
      movie: movieStats,
      series: seriesStats,
      channel: channelStats,
    },
    items: allResults,
  };

  fs.writeFileSync(latestLogPath, `${reportText}\n`, 'utf8');
  fs.writeFileSync(datedLogPath, `${reportText}\n`, 'utf8');
  fs.writeFileSync(latestJsonPath, `${JSON.stringify(baselinePayload, null, 2)}\n`, 'utf8');

  console.log('\n' + reportText);
  console.log(`\n[bench:300] Logs guardados en:\n - ${latestLogPath}\n - ${datedLogPath}\n - ${latestJsonPath}`);
}

main().catch((err) => {
  console.error('[bench:300] Error fatal:', err);
  process.exit(1);
});

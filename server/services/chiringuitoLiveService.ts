/**
 * @module server/services/chiringuitoLiveService
 * @description Real-time live stream resolver for El Chiringuito de Jugones & Chiringuito Inside.
 * Searches live YouTube streams globally (including alternate/community Chiringuito Inside
 * broadcasts and official feeds) with strict relevance scoring + MEGA Atresmedia TDT fallback.
 */
import { LruTtlCache } from '../utils/lruCache.ts';

const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export const MEGA_CHIRINGUITO_TV_URL = 'http://90.163.85.113:8093/stream/11/index.m3u8';
export const MEGA_CHIRINGUITO_FAST_URL = 'http://90.163.85.113:8093/stream/11/index.m3u8?profile=fast';

export interface ChiringuitoStreamCandidate {
  videoId: string;
  title: string;
  url: string;
  thumbnail: string;
  isLive: boolean;
  isInside: boolean;
  isUpcoming: boolean;
  channelName?: string;
  channelHandle?: string;
  viewerText?: string;
  viewerCount?: number;
  relevanceScore?: number;
}

export interface ChiringuitoLiveResolution {
  success: boolean;
  preferredMode: 'inside' | 'live';
  isLiveNow: boolean;
  sourceKind: 'youtube_live' | 'youtube_recent' | 'mega_tdt';
  activeStream: ChiringuitoStreamCandidate | null;
  insideStream: ChiringuitoStreamCandidate | null;
  mainStream: ChiringuitoStreamCandidate | null;
  candidates: ChiringuitoStreamCandidate[];
  megaTdtUrl: string;
  megaFastUrl: string;
  checkedAt: number;
}

const resolutionCache = new LruTtlCache<string, ChiringuitoLiveResolution>(12, 45 * 1000);

function normalizePlain(text?: string | null): string {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function joinRunsText(obj: any): string {
  if (!obj) return '';
  if (typeof obj.simpleText === 'string') return obj.simpleText.trim();
  if (Array.isArray(obj.runs)) {
    return obj.runs.map((r: any) => String(r?.text || '')).join('').trim();
  }
  return '';
}

function parseViewerCount(text?: string): number {
  if (!text) return 0;
  const clean = normalizePlain(text);
  const compactMatch = clean.match(/(\d+(?:[.,]\d+)?)\s*([km])\b/);
  if (compactMatch) {
    const num = parseFloat(compactMatch[1].replace(',', '.'));
    const mult = compactMatch[2] === 'm' ? 1_000_000 : 1_000;
    return Number.isFinite(num) ? Math.round(num * mult) : 0;
  }
  // Spanish thousands format: "15.325 usuarios"
  const grouped = clean.match(/\b(\d{1,3}(?:[.,]\d{3})+|\d+)\b/);
  if (!grouped) return 0;
  const digits = grouped[1].replace(/[.,]/g, '');
  const parsed = parseInt(digits, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function walkYoutubeRenderers(node: unknown, out: any[], depth = 0): void {
  if (!node || typeof node !== 'object' || depth > 14) return;
  if (Array.isArray(node)) {
    for (const item of node) walkYoutubeRenderers(item, out, depth + 1);
    return;
  }
  const rec = node as Record<string, any>;
  if (rec.videoRenderer?.videoId) out.push(rec.videoRenderer);
  if (rec.gridVideoRenderer?.videoId) out.push(rec.gridVideoRenderer);
  if (rec.videoWithContextRenderer?.videoId) out.push(rec.videoWithContextRenderer);
  for (const val of Object.values(rec)) {
    if (val && typeof val === 'object') walkYoutubeRenderers(val, out, depth + 1);
  }
}

export function isRelevantChiringuitoCandidate(cand: ChiringuitoStreamCandidate): boolean {
  const combined = normalizePlain(`${cand.title} ${cand.channelName || ''} ${cand.channelHandle || ''}`);
  if (!combined) return false;
  if (/\b(camara|webcam|trafico|traffic|plaza de armas|beach bar|music|lo-fi|lofi)\b/.test(combined)) {
    return false;
  }
  if (/chiringuito/.test(combined)) return true;
  if (
    /\binside\b/.test(combined) &&
    /\b(madrid|barca|barcelona|laliga|la liga|champions|jugones|pedrerol|partido|directo|live)\b/.test(
      combined
    )
  ) {
    return true;
  }
  if (/\bjugones\b/.test(combined) && /\b(directo|live|en vivo|madrid|barca|barcelona)\b/.test(combined)) {
    return true;
  }
  return false;
}

export function scoreChiringuitoCandidate(
  cand: ChiringuitoStreamCandidate,
  opts?: { prefer?: 'inside' | 'live'; matchHint?: string }
): number {
  if (cand.isUpcoming || !isRelevantChiringuitoCandidate(cand)) return -1000;

  const titleNorm = normalizePlain(cand.title);
  const chanNorm = normalizePlain(`${cand.channelName || ''} ${cand.channelHandle || ''}`);
  const combined = `${titleNorm} ${chanNorm}`;

  let score = 0;
  if (cand.isLive) score += 250;
  if (/chiringuito/.test(chanNorm)) score += 140;
  else if (/chiringuito/.test(titleNorm)) score += 110;

  const hasInsideSignal = /\binside\b/.test(combined) || /chiringuitotvinside/.test(chanNorm);
  if (opts?.prefer === 'inside') {
    if (hasInsideSignal) score += 90;
    if (/\blive\b/.test(titleNorm)) score += 25;
  } else {
    if (hasInsideSignal) score += 35;
    if (/jugones|el chiringuito/.test(combined)) score += 55;
  }

  // Filter out fake gameplay / PES / EA FC / FIFA simulations pretending to be live reactions
  if (/\b(simulacion|simulation|eafc|ea fc|fifa|pes|efootball|fc ?2[456])\b/.test(combined)) {
    score -= 220;
  }

  // Optional match team affinity bonus (e.g. "Real Madrid", "Barcelona", "Celta")
  if (opts?.matchHint) {
    const tokens = normalizePlain(opts.matchHint)
      .split(/\s+/)
      .filter((t) => t.length >= 4 && !/^(fc|real|club|laliga|directo|live)$/.test(t));
    for (const tok of tokens) {
      if (titleNorm.includes(tok)) {
        score += 35;
        break;
      }
    }
  }

  const viewers = cand.viewerCount ?? parseViewerCount(cand.viewerText);
  if (viewers > 0) {
    score += Math.min(60, Math.round(Math.log10(viewers + 1) * 14));
  }

  return score;
}

function parseCandidateFromRenderer(vr: any): ChiringuitoStreamCandidate | null {
  const videoId = String(vr?.videoId || '').trim();
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) return null;

  const title = joinRunsText(vr.title) || 'El Chiringuito de Jugones';
  const channelName =
    joinRunsText(vr.ownerText) || joinRunsText(vr.shortBylineText) || joinRunsText(vr.longBylineText) || undefined;
  const channelHandle =
    vr.ownerText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.canonicalBaseUrl ||
    vr.shortBylineText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.canonicalBaseUrl ||
    undefined;

  const badges: any[] = Array.isArray(vr.badges) ? vr.badges : [];
  const overlays: any[] = Array.isArray(vr.thumbnailOverlays) ? vr.thumbnailOverlays : [];
  const badgeLive = badges.some(
    (b) =>
      b?.metadataBadgeRenderer?.style === 'BADGE_STYLE_TYPE_LIVE_NOW' ||
      /\b(en vivo|en directo|live)\b/i.test(String(b?.metadataBadgeRenderer?.label || ''))
  );
  const overlayLive = overlays.some(
    (o) => o?.thumbnailOverlayTimeStatusRenderer?.style === 'LIVE'
  );
  const upcoming =
    Boolean(vr.upcomingEventData) ||
    overlays.some((o) => o?.thumbnailOverlayTimeStatusRenderer?.style === 'UPCOMING');
  const viewerText =
    joinRunsText(vr.viewCountText) || joinRunsText(vr.shortViewCountText) || undefined;
  const viewerCount = parseViewerCount(viewerText);
  const isLive =
    (badgeLive || overlayLive || /viendo ahora|watching|usuarios/i.test(viewerText || '')) &&
    !upcoming;
  const combinedNorm = normalizePlain(`${title} ${channelName || ''} ${channelHandle || ''}`);
  const isInside = /\binside\b|chiringuito\s*live/.test(combinedNorm);

  return {
    videoId,
    title,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    isLive,
    isInside,
    isUpcoming: upcoming,
    channelName,
    channelHandle,
    viewerText,
    viewerCount: viewerCount || undefined,
  };
}

async function fetchYoutubeHtml(targetUrl: string): Promise<string> {
  const res = await fetch(targetUrl, {
    headers: {
      'User-Agent': CHROME_UA,
      'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
      Accept: 'text/html,application/xhtml+xml',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(5500),
  });
  if (!res.ok) return '';
  return res.text();
}

function extractLiveEndpointCandidate(html: string): ChiringuitoStreamCandidate | null {
  const playerMatch = html.match(/var\s+ytInitialPlayerResponse\s*=\s*(\{[\s\S]+?\});<\/script>/);
  if (playerMatch) {
    try {
      const pr = JSON.parse(playerMatch[1]);
      const vd = pr?.videoDetails;
      const vid = String(vd?.videoId || '').trim();
      if (/^[A-Za-z0-9_-]{11}$/.test(vid)) {
        const title = String(vd?.title || 'El Chiringuito de Jugones');
        const channelName = String(vd?.author || '').trim() || undefined;
        const isLive = Boolean(vd?.isLive || vd?.isLiveContent);
        const combinedNorm = normalizePlain(`${title} ${channelName || ''}`);
        return {
          videoId: vid,
          title,
          url: `https://www.youtube.com/watch?v=${vid}`,
          thumbnail: `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`,
          isLive,
          isInside: /\binside\b|chiringuito\s*live/.test(combinedNorm),
          isUpcoming: Boolean(vd?.isUpcoming),
          channelName,
        };
      }
    } catch {
      // ignore malformed JSON
    }
  }
  const canonMatch = html.match(
    /<link\s+rel="canonical"\s+href="https:\/\/www\.youtube\.com\/watch\?v=([A-Za-z0-9_-]{11})"/i
  );
  if (!canonMatch) return null;
  const titleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i);
  const title = titleMatch ? titleMatch[1] : 'El Chiringuito de Jugones en Directo';
  const isLive = /"isLive"\s*:\s*true/i.test(html);
  return {
    videoId: canonMatch[1],
    title,
    url: `https://www.youtube.com/watch?v=${canonMatch[1]}`,
    thumbnail: `https://i.ytimg.com/vi/${canonMatch[1]}/hqdefault.jpg`,
    isLive,
    isInside: /\binside\b|chiringuito\s*live/i.test(title),
    isUpcoming: false,
  };
}

function extractCandidatesFromHtml(html: string): ChiringuitoStreamCandidate[] {
  const initMatch = html.match(/var\s+ytInitialData\s*=\s*(\{[\s\S]+?\});<\/script>/);
  if (!initMatch) return [];
  try {
    const data = JSON.parse(initMatch[1]);
    const renderers: any[] = [];
    walkYoutubeRenderers(data, renderers);
    const out: ChiringuitoStreamCandidate[] = [];
    const seen = new Set<string>();
    for (const r of renderers) {
      const c = parseCandidateFromRenderer(r);
      if (!c || seen.has(c.videoId)) continue;
      seen.add(c.videoId);
      out.push(c);
      if (out.length >= 24) break;
    }
    return out;
  } catch {
    return [];
  }
}

export async function resolveChiringuitoLiveStream(opts?: {
  prefer?: 'inside' | 'live';
  matchHint?: string;
  forceRefresh?: boolean;
}): Promise<ChiringuitoLiveResolution> {
  const prefer: 'inside' | 'live' = opts?.prefer === 'inside' ? 'inside' : 'live';
  const matchHint = String(opts?.matchHint || '').trim();
  const cacheKey = `${prefer}:${normalizePlain(matchHint).slice(0, 48)}`;

  if (!opts?.forceRefresh) {
    const cached = resolutionCache.get(cacheKey);
    if (cached) return cached;
  }

  // YouTube Live filter parameter sp=EgJAAQ%3D%3D discovers random/alternate live streams immediately
  const searchQueries = [
    'chiringuito inside',
    'chiringuito live',
    prefer === 'inside' ? 'el chiringuito directo' : 'el chiringuito de jugones directo',
  ];
  if (matchHint) {
    const cleanHint = matchHint.replace(/\s+vs\s+/gi, ' ').trim();
    if (cleanHint) searchQueries.push(`chiringuito ${cleanHint}`);
  }

  const urlsToFetch = [
    ...searchQueries.map(
      (q) =>
        `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&sp=EgJAAQ%3D%3D&hl=es&gl=ES`
    ),
    'https://www.youtube.com/@ChiringuitoTvInside/live',
    'https://www.youtube.com/@ChiringuitoTvInside/streams',
    'https://www.youtube.com/@elchiringuitotv/live',
  ];

  const settled = await Promise.allSettled(urlsToFetch.map((u) => fetchYoutubeHtml(u)));
  const dedup = new Map<string, ChiringuitoStreamCandidate>();

  settled.forEach((res, idx) => {
    if (res.status !== 'fulfilled' || !res.value) return;
    const html = res.value;
    if (urlsToFetch[idx].endsWith('/live')) {
      const liveCand = extractLiveEndpointCandidate(html);
      if (liveCand) dedup.set(liveCand.videoId, liveCand);
    }
    for (const cand of extractCandidatesFromHtml(html)) {
      const existing = dedup.get(cand.videoId);
      if (!existing || (!existing.isLive && cand.isLive) || (cand.viewerCount || 0) > (existing.viewerCount || 0)) {
        dedup.set(cand.videoId, cand);
      }
    }
  });

  const scoredCandidates = Array.from(dedup.values())
    .map((c) => ({
      ...c,
      relevanceScore: scoreChiringuitoCandidate(c, { prefer, matchHint }),
    }))
    .filter((c) => (c.relevanceScore ?? -1000) > 0)
    .sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));

  const liveCandidates = scoredCandidates.filter((c) => c.isLive);
  const insideLive = liveCandidates.find((c) => c.isInside) || liveCandidates[0] || null;
  const mainLive = liveCandidates.find((c) => !c.isInside) || liveCandidates[0] || null;
  const insideFallback = insideLive || scoredCandidates.find((c) => c.isInside) || scoredCandidates[0] || null;
  const mainFallback = mainLive || scoredCandidates.find((c) => !c.isInside) || scoredCandidates[0] || null;

  const activeStream =
    prefer === 'inside'
      ? insideLive || mainLive || insideFallback || mainFallback
      : mainLive || insideLive || mainFallback || insideFallback;

  const isLiveNow = Boolean(activeStream?.isLive);
  const sourceKind: ChiringuitoLiveResolution['sourceKind'] = isLiveNow
    ? 'youtube_live'
    : activeStream
      ? 'youtube_recent'
      : 'mega_tdt';

  const result: ChiringuitoLiveResolution = {
    success: true,
    preferredMode: prefer,
    isLiveNow,
    sourceKind,
    activeStream,
    insideStream: insideFallback,
    mainStream: mainFallback,
    candidates: scoredCandidates.slice(0, 8),
    megaTdtUrl: MEGA_CHIRINGUITO_TV_URL,
    megaFastUrl: MEGA_CHIRINGUITO_FAST_URL,
    checkedAt: Date.now(),
  };

  resolutionCache.set(cacheKey, result);
  return result;
}

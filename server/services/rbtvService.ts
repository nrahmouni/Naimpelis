import { LruTtlCache } from '../utils/lruCache.ts';
import { assertSafeProxyUrl } from '../utils/ssrfGuard.ts';
import { streamingFetch } from '../utils/tlsFetch.ts';
import { CHROME_UA } from '../extractors/httpHelpers.ts';
import { getCuratedRbtvOverviewData } from './rbtv/rbtvLiveCurator.ts';
import { parseRbtvInventory, type RbtvHostEntry } from './rbtv/rbtvParser.ts';

export interface RbtvProbeResult {
  host: string;
  url: string;
  ok: boolean;
  status: number;
  latencyMs: number;
  finalUrl: string;
  contentType: string;
  error?: string;
}

export interface RbtvDohResolveResult {
  domain: string;
  provider: string;
  ok: boolean;
  status: number;
  latencyMs: number;
  answers: Array<{ name: string; type: number; ttl: number; data: string }>;
  error?: string;
}

export interface RbtvDecodeResult {
  input: string;
  detectedType: string;
  matchedHost?: RbtvHostEntry;
  componentRef?: string;
  urlBreakdown?: {
    protocol: string;
    host: string;
    pathname: string;
    queryParams: Record<string, string>;
  };
  notes: string[];
  dohLookup?: RbtvDohResolveResult;
  livePayloadPreview?: unknown;
}

const probeCache = new LruTtlCache<string, RbtvProbeResult>(200, 2 * 60 * 1000);
const dohCache = new LruTtlCache<string, RbtvDohResolveResult>(120, 3 * 60 * 1000);

function getAllowedRbtvHosts(): Set<string> {
  const inv = parseRbtvInventory();
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

export async function probeRbtvUrl(targetInput: {
  host?: string;
  url?: string;
}): Promise<RbtvProbeResult> {
  const inv = parseRbtvInventory();
  const allowedHosts = getAllowedRbtvHosts();

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
        error: 'Host no pertenece al inventario RBTV+',
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
        error: 'Referencia interna, plantilla o SDK excluida de comprobación remota',
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
      error: 'Solo se permite comprobar hosts presentes en RBTV+',
    };
  }

  const cached = probeCache.get(targetUrl);
  if (cached) return cached;

  const t0 = Date.now();
  try {
    let res = await streamingFetch(targetUrl, {
      method: 'HEAD',
      headers: {
        'User-Agent': CHROME_UA,
        Origin: 'https://www.rbtv77.com',
        Referer: 'https://www.rbtv77.com/',
        Accept: 'application/json,text/html,*/*;q=0.8',
      },
      timeoutMs: 4200,
    });
    if (res.status === 405 || res.status === 501) {
      res = await streamingFetch(targetUrl, {
        method: 'GET',
        headers: {
          'User-Agent': CHROME_UA,
          Origin: 'https://www.rbtv77.com',
          Referer: 'https://www.rbtv77.com/',
          Accept: 'application/json,text/html,*/*;q=0.8',
        },
        timeoutMs: 4200,
      });
    }
    const result: RbtvProbeResult = {
      host: hostLower,
      url: targetUrl,
      ok: res.status >= 200 && res.status < 400,
      status: res.status,
      latencyMs: Date.now() - t0,
      finalUrl: res.url || targetUrl,
      contentType: String(res.headers.get('content-type') || '').split(';')[0],
    };
    probeCache.set(targetUrl, result);
    return result;
  } catch (err) {
    const result: RbtvProbeResult = {
      host: hostLower,
      url: targetUrl,
      ok: false,
      status: 0,
      latencyMs: Date.now() - t0,
      finalUrl: targetUrl,
      contentType: '',
      error: err instanceof Error ? err.message : 'Timeout o error de red',
    };
    probeCache.set(targetUrl, result);
    return result;
  }
}

export async function resolveDomainViaDoh(
  rawDomain: string,
  provider: 'cloudflare' | 'google' = 'cloudflare'
): Promise<RbtvDohResolveResult> {
  const domain = rawDomain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .split('/')[0]
    .split(':')[0];

  const inv = parseRbtvInventory();
  const allowedDomains = new Set<string>(
    inv.hosts.filter((h) => h.probeAllowed).map((h) => h.host.toLowerCase())
  );

  if (!domain || !allowedDomains.has(domain)) {
    return {
      domain,
      provider,
      ok: false,
      status: 403,
      latencyMs: 0,
      answers: [],
      error: 'Solo se permite consultar DNS DoH para dominios autorizados del inventario RBTV+',
    };
  }

  const cacheKey = `${provider}:${domain}`;
  const cached = dohCache.get(cacheKey);
  if (cached) return cached;

  const dohUrl =
    provider === 'google'
      ? `https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=A`
      : `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=A`;

  const t0 = Date.now();
  try {
    await assertSafeProxyUrl(dohUrl);
    const res = await streamingFetch(dohUrl, {
      headers: {
        Accept: 'application/dns-json',
        'User-Agent': CHROME_UA,
      },
      timeoutMs: 3800,
    });
    const json = (await res.json().catch(() => null)) as {
      Status?: number;
      Answer?: Array<{ name?: string; type?: number; TTL?: number; data?: string }>;
    } | null;

    const answers = Array.isArray(json?.Answer)
      ? json.Answer.map((a) => ({
          name: String(a.name || domain),
          type: Number(a.type || 1),
          ttl: Number(a.TTL || 0),
          data: String(a.data || ''),
        }))
      : [];

    const result: RbtvDohResolveResult = {
      domain,
      provider: provider === 'google' ? 'dns.google/resolve' : 'cloudflare-dns.com/dns-query',
      ok: res.ok && json?.Status === 0 && answers.length > 0,
      status: res.status,
      latencyMs: Date.now() - t0,
      answers,
      error:
        json?.Status !== undefined && json.Status !== 0
          ? `Código DNS DoH ${json.Status}`
          : undefined,
    };
    dohCache.set(cacheKey, result);
    return result;
  } catch (err) {
    return {
      domain,
      provider,
      ok: false,
      status: 0,
      latencyMs: Date.now() - t0,
      answers: [],
      error: err instanceof Error ? err.message : 'Error DoH',
    };
  }
}

export async function decodeRbtvInput(
  rawInput: string,
  opts: { fetchLiveSample?: boolean; runDoh?: boolean } = {}
): Promise<RbtvDecodeResult> {
  const input = rawInput.trim();
  const inv = parseRbtvInventory();
  const notes: string[] = [];

  let urlBreakdown: RbtvDecodeResult['urlBreakdown'];
  let matchedHost: RbtvHostEntry | undefined;

  if (/^https?:\/\//i.test(input) && !input.includes('%s')) {
    try {
      const u = new URL(input);
      const qp: Record<string, string> = {};
      u.searchParams.forEach((v, k) => {
        qp[k] = v;
      });
      urlBreakdown = {
        protocol: u.protocol,
        host: u.hostname,
        pathname: u.pathname,
        queryParams: qp,
      };
      matchedHost = inv.hosts.find(
        (h) =>
          h.host.toLowerCase() === u.hostname.toLowerCase() ||
          `www.${h.host.toLowerCase()}` === u.hostname.toLowerCase()
      );
    } catch {
      // ignore invalid URL syntax
    }
  } else {
    const hostToken = input.replace(/^https?:\/\//, '').split('/')[0].toLowerCase();
    matchedHost = inv.hosts.find((h) => h.host.toLowerCase() === hostToken);
  }

  let componentRef: string | undefined;
  if (/apis-data10|apis-live|logos1|hkkmwtotalwypubook/i.test(input)) {
    componentRef = 'com.rblive.launcher.App (Bootstrap de APIs y WebView)';
  } else if (/openaicommunities|openalcommunities|2f17ubowlsjn46easier/i.test(input)) {
    componentRef = 'com.rblive.common.manager.ParamsManager / PPManager$currAnnounces$2';
  } else if (/rbtv77/i.test(input)) {
    componentRef = 'com.rblive.common.http.interceptor.NetworkInterceptor';
  } else if (/dns-query|\/resolve|1\.1\.1\.1|8\.8\.8\.8|9\.9\.9\.9|adguard|alidns|quad9|nextdns|opendns/i.test(input)) {
    componentRef = 'com.rblive.common.http.dns.CachingFallbackDns / FallbackDns (DoH)';
  } else if (/p2pengine|absproxy|%s:%d/i.test(input)) {
    componentRef = 'com.p2pengine.sdk.AbsProxy (Proxy local HLS/DASH P2P)';
  } else if (/nordvpn/i.test(input)) {
    componentRef = 'com.rblive.common.constants.Constants (Affiliate VPN Offer)';
  } else if (/dashif|aomedia|exoplayer|microsoft\.com\/DRM|w3\.org\/ns\/ttml/i.test(input)) {
    componentRef = 'com.google.android.exoplayer2 (DASH / DRM / ID3 / Subtítulos TTML)';
  }

  if (matchedHost) {
    notes.push(`Clasificación en RBTV+: ${matchedHost.categoryLabel} — ${matchedHost.role}.`);
    if (matchedHost.decodedNote) notes.push(matchedHost.decodedNote);
    const allRefs = Array.from(new Set(matchedHost.urlItems.flatMap((i) => i.references))).slice(0, 6);
    if (allRefs.length > 0) {
      notes.push(`Referencias de código: ${allRefs.join(', ')}`);
    }
  }

  let dohLookup: RbtvDohResolveResult | undefined;
  if (opts.runDoh && matchedHost?.probeAllowed && !matchedHost.host.match(/^\d+\./)) {
    dohLookup = await resolveDomainViaDoh(matchedHost.host, 'cloudflare');
  }

  let livePayloadPreview: unknown;
  if (opts.fetchLiveSample && matchedHost?.probeAllowed) {
    const targetUrl =
      /^https?:\/\//i.test(input)
        ? input
        : matchedHost.urls.find((u) => /^https?:\/\//i.test(u)) || `https://${matchedHost.host}`;
    try {
      const parsedSafe = await assertSafeProxyUrl(targetUrl);
      if (parsedSafe.hostname.toLowerCase().includes(matchedHost.host.toLowerCase())) {
        const res = await streamingFetch(targetUrl, {
          headers: {
            'User-Agent': CHROME_UA,
            Origin: 'https://www.rbtv77.com',
            Referer: 'https://www.rbtv77.com/',
            Accept: 'application/json,text/html,*/*;q=0.8',
          },
          timeoutMs: 3800,
        });
        const text = await res.text();
        try {
          livePayloadPreview = JSON.parse(text);
        } catch {
          livePayloadPreview = {
            httpStatus: res.status,
            contentType: res.headers.get('content-type'),
            snippet: text.slice(0, 500),
          };
        }
      }
    } catch {
      // fail gracefully
    }
  }

  return {
    input,
    detectedType: matchedHost?.isCoreAppDomain
      ? 'RBTV+ Core Endpoint / App Domain'
      : matchedHost?.category === 'doh'
      ? 'Resolver DNS-over-HTTPS (DoH)'
      : componentRef
      ? 'Componente Arquitectónico RBTV+'
      : urlBreakdown
      ? 'URL Estructurada'
      : 'Patrón / Host Técnico',
    matchedHost,
    componentRef,
    urlBreakdown,
    notes,
    dohLookup,
    livePayloadPreview,
  };
}

export async function getRbtvLiveOverview() {
  const inv = parseRbtvInventory();
  const coreHosts = inv.hosts.filter((h) => h.isCoreAppDomain);

  // Probe the core RBTV+ domains safely in parallel (cached 2 min)
  const coreStatuses = await Promise.all(
    coreHosts.map((h) => probeRbtvUrl({ host: h.host }))
  );

  const curated = getCuratedRbtvOverviewData();

  return {
    coreStatuses,
    liveMatches: curated.liveMatches,
    sports247Channels: curated.sports247Channels,
    curatedChannels: curated.curatedChannels,
  };
}

import { isDvbHeadendStream } from '../extractors/httpHelpers.ts';
import { getActiveDvbSessionCount } from '../routes/proxies/dvbTranscoder.ts';
import { runtimeMetrics } from './runtimeMetricsCollector.ts';

export interface DirectPlayEvaluation {
  directPlayEligible: boolean;
  reason: string;
  recommendedOrigin: string | null;
}

const KNOWN_DIRECT_PLAY_CORS_HOSTS = [
  /(\.|^)rtve\.es$/i,
  /(\.|^)atresmedia\.com$/i,
  /(\.|^)mediaset\.es$/i,
  /(\.|^)ccma\.cat$/i,
  /(\.|^)akamaized\.net$/i,
  /(\.|^)cloudfront\.net$/i,
  /(\.|^)fastly\.net$/i,
  /(\.|^)twitch\.tv$/i,
  /(\.|^)youtube\.com$/i,
  /(\.|^)googlevideo\.com$/i,
];

const REQUIRES_HEADER_PROXY_HOSTS = [
  /(\.|^)stmify\.com$/i,
  /(\.|^)footunder\.online$/i,
  /(\.|^)7odxv0l067ka\.net$/i,
  /(\.|^)futlivehd\.com$/i,
  /(\.|^)streamxhd\.(sbs|st)$/i,
  /(\.|^)rojadirectv\.live$/i,
  /(\.|^)tilinhd\.lol$/i,
  /(\.|^)ok\.ru$/i,
  /(\.|^)vk\.com$/i,
];

export function getMediaPlaneOrigin(): string | null {
  const raw = String(process.env.MEDIA_PROXY_ORIGIN || '').trim().replace(/\/+$/, '');
  return /^https?:\/\//i.test(raw) ? raw : null;
}

/**
 * Direct-Play First evaluator: decides whether a stream can play directly from
 * client -> CDN without saturating backend proxy sockets.
 */
export function evaluateDirectPlayEligibility(
  targetUrl: string,
  opts?: { referer?: string; forceAac?: boolean }
): DirectPlayEvaluation {
  const clean = String(targetUrl || '').trim();
  const externalOrigin = getMediaPlaneOrigin();

  if (!clean || !/^https?:\/\//i.test(clean)) {
    runtimeMetrics.recordDirectPlayDecision(false);
    return { directPlayEligible: false, reason: 'invalid_scheme', recommendedOrigin: externalOrigin };
  }

  if (opts?.forceAac || isDvbHeadendStream(clean)) {
    runtimeMetrics.recordDirectPlayDecision(false);
    return { directPlayEligible: false, reason: 'dvb_aac_remux_required', recommendedOrigin: externalOrigin };
  }

  if (clean.startsWith('http://')) {
    runtimeMetrics.recordDirectPlayDecision(false);
    return { directPlayEligible: false, reason: 'mixed_content_http_upgrade', recommendedOrigin: externalOrigin };
  }

  let hostname = '';
  try {
    hostname = new URL(clean).hostname.toLowerCase();
  } catch {
    runtimeMetrics.recordDirectPlayDecision(false);
    return { directPlayEligible: false, reason: 'malformed_url', recommendedOrigin: externalOrigin };
  }

  if (opts?.referer || REQUIRES_HEADER_PROXY_HOSTS.some((rx) => rx.test(hostname))) {
    runtimeMetrics.recordDirectPlayDecision(false);
    return { directPlayEligible: false, reason: 'upstream_referer_or_tls_required', recommendedOrigin: externalOrigin };
  }

  const eligible = KNOWN_DIRECT_PLAY_CORS_HOSTS.some((rx) => rx.test(hostname));
  runtimeMetrics.recordDirectPlayDecision(eligible);
  return {
    directPlayEligible: eligible,
    reason: eligible ? 'direct_https_cors_cdn' : 'standard_proxy_fallback',
    recommendedOrigin: eligible ? null : externalOrigin,
  };
}

export function getMediaPlaneSnapshot() {
  const snap = runtimeMetrics.getSnapshot();
  const externalOrigin = getMediaPlaneOrigin();
  const totalTransport = snap.media.nativeFetchSuccess + snap.media.curlFallbackCount;
  const nativeRatioPct =
    totalTransport > 0 ? Math.round((snap.media.nativeFetchSuccess / totalTransport) * 100) : 100;
  const directPlayPct =
    snap.media.directPlayEvaluated > 0
      ? Math.round((snap.media.directPlayEligible / snap.media.directPlayEvaluated) * 100)
      : 0;

  return {
    deploymentMode: externalOrigin ? 'split-media-origin' : 'co-located-isolated',
    mediaProxyOrigin: externalOrigin,
    activeDvbFfmpegSessions: getActiveDvbSessionCount(),
    nativeTransportPct: nativeRatioPct,
    directPlayEligiblePct: directPlayPct,
    metrics: snap.media,
  };
}

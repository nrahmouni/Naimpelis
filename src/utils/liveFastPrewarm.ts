/**
 * @module src/utils/liveFastPrewarm
 * @description Non-blocking Live TV prewarm client helper that warms upstream manifests
 * in server RAM on hover/D-pad focus so playback binds in sub-second latency.
 */
import type { SpanishTdtChannel, SportsMatch, StreamTrack } from '../types';

const PREWARM_TTL_MS = 25_000;
const prewarmCache = new Map<string, number>();

export function buildFastResolveTracksPayload(tracks: StreamTrack[], limit = 6) {
  return (tracks || [])
    .filter((tr) => Boolean(tr?.sourceUrl))
    .slice(0, limit)
    .map((tr) => ({
      id: tr.id,
      label: tr.label,
      lang: tr.lang,
      quality: tr.quality,
      providerId: tr.providerId,
      providerName: tr.providerName,
      sourceUrl: tr.sourceUrl,
      resolverType: tr.resolverType,
      health: tr.health
        ? {
            status: tr.health.status,
            latencyMs: tr.health.latencyMs,
          }
        : undefined,
    }));
}

export function prewarmLiveChannel(
  target: Pick<SpanishTdtChannel, 'id' | 'name' | 'channels'> | Pick<SportsMatch, 'id' | 'title' | 'channels'>,
  preferLang = 'ES'
): void {
  if (!target || !Array.isArray(target.channels) || target.channels.length === 0) return;

  const title = 'name' in target ? target.name : target.title;
  const key = `${target.id}|${preferLang}`;
  const now = Date.now();
  const prev = prewarmCache.get(key);
  if (prev && now - prev < PREWARM_TTL_MS) {
    return;
  }

  if (prewarmCache.size > 160) {
    const oldest = prewarmCache.keys().next().value;
    if (oldest) prewarmCache.delete(oldest);
  }
  prewarmCache.set(key, now);

  const payloadTracks = buildFastResolveTracksPayload(target.channels, 4);
  if (payloadTracks.length === 0) return;

  fetch('/api/live/prewarm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    keepalive: true,
    body: JSON.stringify({
      channelId: target.id,
      title,
      preferLang,
      tracks: payloadTracks,
    }),
  }).catch(() => {});
}

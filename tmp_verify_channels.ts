import dns from 'dns';
dns.setDefaultResultOrder('ipv4first');

import fs from 'fs';
import { refreshLiveIptvRegistry } from './server/services/iptvPlaylistService.ts';
import { refreshFamelackAndWorldCatalog, getCachedFamelackWorldChannels } from './server/services/famelackIptvService.ts';
import { getAllIptvChannels } from './server/routes/iptvHelpers/iptvChannelRegistry.ts';
import { SPANISH_TDT_CHANNELS } from './server/data/tdtChannels.ts';
import { CATALA_LIVE_CHANNELS } from './server/data/catalaRegistry.ts';
import { INTERNATIONAL_TV_CHANNELS } from './server/data/internationalChannels.ts';
import { FAST_THEMATIC_CHANNELS } from './server/services/catalogDiscoveryService.ts';
import { getCuratedRbtvChannels } from './server/services/rbtv/rbtvLiveCurator.ts';
import {
  isDvbHeadendStream,
  maybeSignEasyBroadcastUrl,
  resolveKnownUpstreamReferer,
  getPreferredUpstreamUa,
  curlGetText,
  curlGetBufferWithStatus,
} from './server/extractors/httpHelpers.ts';
import { curlPlainGetText } from './server/services/vestMirrorService.ts';
import { isElahmadUrl, resolveElahmadChannelToHls } from './server/extractors/elahmadExtractor.ts';
import { extractLiveSportsHlsDirect } from './server/extractors/sportsExtractor.ts';
import {
  fetchUpstreamManifestText,
  unwrapMasterPlaylistForIptv,
  verifyIptvMediaManifestSegments,
} from './server/routes/iptvHelpers/iptvMediaHelpers.ts';

interface TrackAuditResult {
  key: string;
  sourceUrl: string;
  resolverType: string;
  ok: boolean;
  recoverableWithPlainOrCurl?: boolean;
  reason: string;
  resolvedUrl?: string;
  latencyMs: number;
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(fallback), ms);
    promise
      .then((v) => {
        clearTimeout(t);
        resolve(v);
      })
      .catch(() => {
        clearTimeout(t);
        resolve(fallback);
      });
  });
}

async function verifySegWithCurlFallback(manifestText: string, manifestUrl: string, referer: string): Promise<boolean> {
  const lines = manifestText.split(/\r?\n/);
  let lastSeg = '';
  for (let i = lines.length - 1; i >= 0; i--) {
    const tr = lines[i].trim();
    if (!tr || tr.startsWith('#')) continue;
    try {
      lastSeg = new URL(tr, manifestUrl).href;
      break;
    } catch {
      // skip
    }
  }
  if (!lastSeg) return false;
  const hdrs: Record<string, string> = {
    'User-Agent': getPreferredUpstreamUa(lastSeg),
    Accept: '*/*',
    Range: 'bytes=0-16383',
  };
  if (referer) hdrs['Referer'] = referer;
  const res = await curlGetBufferWithStatus(lastSeg, hdrs, 4).catch(() => ({ buf: Buffer.alloc(0), status: 0 }));
  if (res.status < 200 || res.status >= 400 || res.buf.length < 64) return false;
  const head = res.buf.subarray(0, 64).toString('utf8').trimStart().toLowerCase();
  return !head.startsWith('<!doctype') && !head.startsWith('<html') && !head.startsWith('<error');
}

async function testTrack(track: {
  sourceUrl: string;
  resolverType: string;
  referer?: string;
}): Promise<TrackAuditResult> {
  const started = Date.now();
  const sourceUrl = String(track.sourceUrl || '').trim();
  const resolverType = String(track.resolverType || 'tdt_hls');
  const key = `${resolverType}::${sourceUrl}`;

  if (!sourceUrl) {
    return { key, sourceUrl, resolverType, ok: false, reason: 'empty_url', latencyMs: 0 };
  }

  if (/youtube\.com|youtu\.be/i.test(sourceUrl)) {
    return { key, sourceUrl, resolverType, ok: false, reason: 'youtube_url_not_hls', latencyMs: Date.now() - started };
  }

  if (resolverType === 'elahmad_live' || isElahmadUrl(sourceUrl)) {
    try {
      const resolved = await withTimeout(resolveElahmadChannelToHls(sourceUrl), 5500, null);
      if (!resolved) {
        return { key, sourceUrl, resolverType, ok: false, reason: 'elahmad_unreachable', latencyMs: Date.now() - started };
      }
      if (resolved.isYoutube) {
        return { key, sourceUrl, resolverType, ok: true, reason: 'ok_elahmad_youtube', resolvedUrl: resolved.streamUrl, latencyMs: Date.now() - started };
      }
      const signed = await maybeSignEasyBroadcastUrl(resolved.streamUrl);
      const manifest = await fetchUpstreamManifestText(signed, resolved.referer, false);
      if (!manifest) {
        return { key, sourceUrl, resolverType, ok: false, reason: 'elahmad_manifest_fail', resolvedUrl: signed, latencyMs: Date.now() - started };
      }
      const unwrapped = await unwrapMasterPlaylistForIptv(manifest, resolved.referer, false);
      if (!unwrapped) {
        return { key, sourceUrl, resolverType, ok: false, reason: 'elahmad_unwrap_fail', resolvedUrl: signed, latencyMs: Date.now() - started };
      }
      const segOk = await verifyIptvMediaManifestSegments(unwrapped.text, unwrapped.finalUrl, resolved.referer);
      return {
        key,
        sourceUrl,
        resolverType,
        ok: segOk,
        reason: segOk ? 'ok_elahmad' : 'elahmad_segment_fail',
        resolvedUrl: unwrapped.finalUrl,
        latencyMs: Date.now() - started,
      };
    } catch (e: any) {
      return { key, sourceUrl, resolverType, ok: false, reason: `elahmad_err:${e?.message || e}`, latencyMs: Date.now() - started };
    }
  }

  if (resolverType === 'sports_channel' || resolverType === 'web_embed') {
    try {
      const fullTarget = /^https?:\/\//i.test(sourceUrl) ? sourceUrl : `https://${sourceUrl}`;
      const direct = await withTimeout(extractLiveSportsHlsDirect(fullTarget), 6500, null);
      if (!direct || !direct.streamUrl) {
        return {
          key,
          sourceUrl,
          resolverType,
          ok: false,
          reason: direct?.isBrokenGreenFeed ? 'sports_green_feed' : 'sports_extract_null',
          latencyMs: Date.now() - started,
        };
      }
      const manifest = await fetchUpstreamManifestText(direct.streamUrl, direct.referer, false);
      if (!manifest) {
        return { key, sourceUrl, resolverType, ok: false, reason: 'sports_manifest_fail', resolvedUrl: direct.streamUrl, latencyMs: Date.now() - started };
      }
      const unwrapped = await unwrapMasterPlaylistForIptv(manifest, direct.referer, false);
      if (!unwrapped) {
        return { key, sourceUrl, resolverType, ok: false, reason: 'sports_unwrap_fail', resolvedUrl: direct.streamUrl, latencyMs: Date.now() - started };
      }
      const segOk = await verifyIptvMediaManifestSegments(unwrapped.text, unwrapped.finalUrl, direct.referer);
      return {
        key,
        sourceUrl,
        resolverType,
        ok: segOk,
        reason: segOk ? 'ok_sports' : 'sports_segment_fail',
        resolvedUrl: unwrapped.finalUrl,
        latencyMs: Date.now() - started,
      };
    } catch (e: any) {
      return { key, sourceUrl, resolverType, ok: false, reason: `sports_err:${e?.message || e}`, latencyMs: Date.now() - started };
    }
  }

  // Direct HLS
  try {
    const cleanUrl = await maybeSignEasyBroadcastUrl(
      sourceUrl.replace(/[?&]profile=(hd|fast)\b/gi, '')
    );
    let referer = '';
    try {
      referer = resolveKnownUpstreamReferer(cleanUrl, track.referer) || new URL(cleanUrl).origin + '/';
    } catch {
      referer = '';
    }

    if (isDvbHeadendStream(cleanUrl)) {
      const r = await curlGetText(cleanUrl, { 'User-Agent': getPreferredUpstreamUa(cleanUrl) }, 3, true, true).catch(() => ({ text: '' }));
      const ok = r.text.includes('#EXTM3U');
      return {
        key,
        sourceUrl,
        resolverType,
        ok,
        reason: ok ? 'ok_dvb' : 'dvb_headend_unreachable',
        latencyMs: Date.now() - started,
      };
    }

    const manifest = await fetchUpstreamManifestText(cleanUrl, referer, false);
    if (!manifest) {
      const plainTxt = await curlPlainGetText(cleanUrl, 4).catch(() => '');
      if (plainTxt && plainTxt.includes('#EXTM3U') && !/nosignal/i.test(plainTxt)) {
        const unwrappedPlain = await unwrapMasterPlaylistForIptv({ text: plainTxt, finalUrl: cleanUrl }, '', false);
        if (unwrappedPlain) {
          const segOkPlain = await verifySegWithCurlFallback(unwrappedPlain.text, unwrappedPlain.finalUrl, '');
          if (segOkPlain) {
            return {
              key,
              sourceUrl,
              resolverType,
              ok: false,
              recoverableWithPlainOrCurl: true,
              reason: 'recoverable_plain_curl_no_referer',
              resolvedUrl: unwrappedPlain.finalUrl,
              latencyMs: Date.now() - started,
            };
          }
        }
      }
      return { key, sourceUrl, resolverType, ok: false, reason: 'manifest_fetch_failed', latencyMs: Date.now() - started };
    }

    const unwrapped = await unwrapMasterPlaylistForIptv(manifest, referer, false);
    if (!unwrapped) {
      return { key, sourceUrl, resolverType, ok: false, reason: 'unwrap_variant_failed', latencyMs: Date.now() - started };
    }
    if (/METHOD=(SAMPLE-AES|SAMPLE-AES-CTR|SAMPLE-AES-CENC)|com\.apple\.streamingkeydelivery/i.test(unwrapped.text)) {
      return { key, sourceUrl, resolverType, ok: false, reason: 'drm_sample_aes', latencyMs: Date.now() - started };
    }
    const segOk = await verifyIptvMediaManifestSegments(unwrapped.text, unwrapped.finalUrl, referer);
    if (!segOk) {
      const curlSegOk = await verifySegWithCurlFallback(unwrapped.text, unwrapped.finalUrl, referer);
      if (curlSegOk) {
        return {
          key,
          sourceUrl,
          resolverType,
          ok: false,
          recoverableWithPlainOrCurl: true,
          reason: 'recoverable_segment_curl_fallback',
          resolvedUrl: unwrapped.finalUrl,
          latencyMs: Date.now() - started,
        };
      }
      return { key, sourceUrl, resolverType, ok: false, reason: 'segment_probe_failed', resolvedUrl: unwrapped.finalUrl, latencyMs: Date.now() - started };
    }
    return { key, sourceUrl, resolverType, ok: true, reason: 'ok_hls', resolvedUrl: unwrapped.finalUrl, latencyMs: Date.now() - started };
  } catch (e: any) {
    return { key, sourceUrl, resolverType, ok: false, reason: `hls_err:${e?.message || e}`, latencyMs: Date.now() - started };
  }
}

async function runPool<T, R>(items: T[], concurrency: number, fn: (item: T, idx: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      results[idx] = await fn(items[idx], idx);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

async function main() {
  console.log('Refreshing IPTV registry...');
  const iptvRes = await refreshLiveIptvRegistry(true);
  console.log('IPTV synced:', iptvRes);
  console.log('Refreshing Famelack/World catalog...');
  const famRes = await refreshFamelackAndWorldCatalog(true);
  console.log('World synced:', famRes.length);

  const allChannels = getAllIptvChannels();
  console.log(`Total unified IPTV channels: ${allChannels.length}`);
  console.log(`  SPANISH_TDT: ${SPANISH_TDT_CHANNELS.length}, CATALA: ${CATALA_LIVE_CHANNELS.length}, INTL: ${INTERNATIONAL_TV_CHANNELS.length}, FAST: ${FAST_THEMATIC_CHANNELS.length}, WORLD: ${getCachedFamelackWorldChannels().length}, RBTV: ${getCuratedRbtvChannels().length}`);

  const staticIds = new Set<string>([
    ...SPANISH_TDT_CHANNELS.map((c) => c.id),
    ...CATALA_LIVE_CHANNELS.map((c) => c.id),
    ...INTERNATIONAL_TV_CHANNELS.map((c) => c.id),
    ...FAST_THEMATIC_CHANNELS.map((c) => `fast-${c.id}`),
  ]);

  const trackMap = new Map<string, { sourceUrl: string; resolverType: string; referer?: string }>();
  for (const ch of allChannels) {
    for (const tr of ch.channels || []) {
      const url = String(tr?.sourceUrl || '').trim();
      const rt = String(tr?.resolverType || 'tdt_hls');
      const k = `${rt}::${url}`;
      if (!trackMap.has(k)) {
        trackMap.set(k, { sourceUrl: url, resolverType: rt, referer: tr.referer });
      }
    }
  }

  const uniqueTracks = Array.from(trackMap.values());
  const dvbTracks = uniqueTracks.filter((t) => isDvbHeadendStream(t.sourceUrl));
  const elahmadTracks = uniqueTracks.filter((t) => t.resolverType === 'elahmad_live' || isElahmadUrl(t.sourceUrl));
  const sportsTracks = uniqueTracks.filter((t) => t.resolverType === 'sports_channel' || t.resolverType === 'web_embed');
  const hlsTracks = uniqueTracks.filter(
    (t) =>
      !isDvbHeadendStream(t.sourceUrl) &&
      t.resolverType !== 'elahmad_live' &&
      !isElahmadUrl(t.sourceUrl) &&
      t.resolverType !== 'sports_channel' &&
      t.resolverType !== 'web_embed'
  );

  console.log(`Unique tracks: ${uniqueTracks.length} (HLS=${hlsTracks.length}, DVB=${dvbTracks.length}, Elahmad=${elahmadTracks.length}, Sports=${sportsTracks.length})`);

  const resultMap = new Map<string, TrackAuditResult>();

  console.log('Probing HLS tracks (concurrency=32)...');
  let hlsDone = 0;
  const hlsResults = await runPool(hlsTracks, 32, async (tr) => {
    const r = await withTimeout(testTrack(tr), 7000, {
      key: `${tr.resolverType}::${tr.sourceUrl}`,
      sourceUrl: tr.sourceUrl,
      resolverType: tr.resolverType,
      ok: false,
      reason: 'hard_timeout_7s',
      latencyMs: 7000,
    });
    hlsDone++;
    if (hlsDone % 100 === 0 || hlsDone === hlsTracks.length) console.log(`  HLS: ${hlsDone}/${hlsTracks.length}`);
    return r;
  });
  for (const r of hlsResults) resultMap.set(r.key, r);

  console.log('Probing DVB headend...');
  const firstDvbOk = dvbTracks.length > 0 ? (await withTimeout(testTrack(dvbTracks[0]), 5000, { key: '', sourceUrl: '', resolverType: 'tdt_hls', ok: false, reason: 'dvb_timeout', latencyMs: 5000 })).ok : false;
  if (!firstDvbOk) {
    console.log(`  DVB headend 90.163.85.113:8093 unreachable, marking ${dvbTracks.length} DVB tracks unreachable.`);
    for (const tr of dvbTracks) {
      resultMap.set(`${tr.resolverType}::${tr.sourceUrl}`, {
        key: `${tr.resolverType}::${tr.sourceUrl}`,
        sourceUrl: tr.sourceUrl,
        resolverType: tr.resolverType,
        ok: false,
        reason: 'dvb_headend_unreachable',
        latencyMs: 3000,
      });
    }
  } else {
    const dvbResults = await runPool(dvbTracks, 2, testTrack);
    for (const r of dvbResults) resultMap.set(r.key, r);
  }

  console.log('Probing Elahmad & Sports tracks (concurrency=12)...');
  const elahmadResults = await runPool(elahmadTracks, 8, (tr) =>
    withTimeout(testTrack(tr), 6500, {
      key: `${tr.resolverType}::${tr.sourceUrl}`,
      sourceUrl: tr.sourceUrl,
      resolverType: tr.resolverType,
      ok: false,
      reason: 'elahmad_timeout',
      latencyMs: 6500,
    })
  );
  const sportsResults = await runPool(sportsTracks, 12, (tr) =>
    withTimeout(testTrack(tr), 7500, {
      key: `${tr.resolverType}::${tr.sourceUrl}`,
      sourceUrl: tr.sourceUrl,
      resolverType: tr.resolverType,
      ok: false,
      reason: 'sports_timeout',
      latencyMs: 7500,
    })
  );
  for (const r of [...elahmadResults, ...sportsResults]) resultMap.set(r.key, r);

  let channelsOk = 0;
  let channelsRecoverable = 0;
  let channelsDead = 0;
  const deadStaticChannels: any[] = [];
  const deadDynamicChannels: any[] = [];
  const partialStaticChannels: any[] = [];
  const recoverableChannels: any[] = [];
  const failureReasonCounts: Record<string, number> = {};

  for (const ch of allChannels) {
    const tracks = ch.channels || [];
    const audited = tracks.map((tr: any) => {
      const k = `${String(tr?.resolverType || 'tdt_hls')}::${String(tr?.sourceUrl || '').trim()}`;
      return { track: tr, audit: resultMap.get(k) };
    });
    const okCount = audited.filter((a: any) => a.audit?.ok).length;
    const recCount = audited.filter((a: any) => a.audit?.recoverableWithPlainOrCurl).length;
    const isStatic =
      staticIds.has(ch.id) ||
      String(ch.id).startsWith('ch-sport-') ||
      String(ch.id).startsWith('live-sports-') ||
      String(ch.id).startsWith('rbtv-');

    for (const a of audited) {
      if (!a.audit?.ok) {
        const r = a.audit?.reason || 'unknown';
        failureReasonCounts[r] = (failureReasonCounts[r] || 0) + 1;
      }
    }

    if (okCount > 0) {
      channelsOk++;
      if (isStatic && okCount < audited.length) {
        partialStaticChannels.push({
          id: ch.id,
          name: ch.name,
          category: ch.category,
          okCount,
          totalTracks: audited.length,
          deadTracks: audited
            .filter((a: any) => !a.audit?.ok)
            .map((a: any) => ({ url: a.track.sourceUrl, rt: a.track.resolverType, reason: a.audit?.reason })),
        });
      }
    } else if (recCount > 0) {
      channelsRecoverable++;
      recoverableChannels.push({
        id: ch.id,
        name: ch.name,
        category: ch.category,
        isStatic,
        tracks: audited.map((a: any) => ({ url: a.track.sourceUrl, reason: a.audit?.reason })),
      });
    } else {
      channelsDead++;
      const entry = {
        id: ch.id,
        name: ch.name,
        category: ch.category,
        sourceHub: ch.sourceHub,
        isLiveSynced: ch.isLiveSynced,
        tracks: audited.map((a: any) => ({
          id: a.track.id,
          url: a.track.sourceUrl,
          rt: a.track.resolverType,
          reason: a.audit?.reason,
        })),
      };
      if (isStatic) deadStaticChannels.push(entry);
      else deadDynamicChannels.push(entry);
    }
  }

  const report = {
    timestamp: new Date().toISOString(),
    totalChannels: allChannels.length,
    channelsOk,
    channelsRecoverable,
    channelsDead,
    totalUniqueTracks: uniqueTracks.length,
    tracksOk: Array.from(resultMap.values()).filter((r) => r.ok).length,
    tracksRecoverable: Array.from(resultMap.values()).filter((r) => r.recoverableWithPlainOrCurl).length,
    tracksDead: Array.from(resultMap.values()).filter((r) => !r.ok && !r.recoverableWithPlainOrCurl).length,
    failureReasonCounts,
    deadStaticCount: deadStaticChannels.length,
    deadDynamicCount: deadDynamicChannels.length,
    partialStaticCount: partialStaticChannels.length,
    recoverableChannels,
    deadStaticChannels,
    deadDynamicChannels,
    partialStaticChannels,
  };

  fs.writeFileSync('/tmp/channel_audit_report.json', JSON.stringify(report, null, 2));
  console.log('\n=== CHANNEL AUDIT SUMMARY ===');
  console.log(`Total Channels: ${report.totalChannels}`);
  console.log(`Working Channels (>=1 live stream): ${report.channelsOk}`);
  console.log(`Recoverable Channels (via plain-curl/curl-segment fix): ${report.channelsRecoverable}`);
  console.log(`Completely Dead Channels: ${report.channelsDead}`);
  console.log(`  - Dead Static/Curated Channels: ${report.deadStaticCount}`);
  console.log(`  - Dead Dynamic Channels: ${report.deadDynamicCount}`);
  console.log(`Partial Static (working backup exists, some dead tracks): ${report.partialStaticCount}`);
  console.log('Failure Reasons:', failureReasonCounts);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

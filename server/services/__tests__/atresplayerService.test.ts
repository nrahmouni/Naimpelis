import { describe, expect, it } from 'vitest';
import { parseAtresplayerInventory } from '../atresplayer/atresplayerParser';
import {
  decodeAtresplayerInput,
  getAtresplayerOverview,
  probeAtresplayerUrl,
} from '../atresplayerService';

describe('Atresplayer APK inventory parser, decoder, SSRF guard & overview', () => {
  it('parses all 55 literal URLs, 177 Retrofit declarations across 36 services, 13 hosts & 36 properties keys', () => {
    const inv = parseAtresplayerInventory();

    expect(inv.sourceFile).toBe('rutas_atresplayer_completo-1.txt');
    expect(inv.packageNames).toEqual(['com.a3', 'com.atresmedia']);
    expect(inv.zipEntries).toBe(36867);
    expect(inv.javaFiles).toBe(2943);

    expect(inv.actualCounts.literalUrls).toBe(55);
    expect(inv.actualCounts.ownLiteralUrls).toBe(45);
    expect(inv.actualCounts.externalLiteralUrls).toBe(10);
    expect(inv.actualCounts.retrofitServices).toBe(36);
    expect(inv.actualCounts.retrofitDeclarations).toBe(177);
    expect(inv.actualCounts.propertiesKeys).toBe(36);
    expect(inv.actualCounts.hosts).toBe(13);
    expect(inv.actualCounts.playbackSteps).toBe(4);
    expect(inv.actualCounts.limitations).toBe(5);

    const propsSvc = inv.retrofitServices.find((s) => s.service === 'PropertiesService');
    expect(propsSvc?.declarationCount).toBe(36);

    const hostNames = inv.hosts.map((h) => h.host);
    expect(hostNames).toContain('api.atresplayer.com');
    expect(hostNames).toContain('properties.atresplayer.com');
    expect(hostNames).toContain('account.atresplayer.com');
    expect(hostNames).toContain('statics.atresmedia.com');
    expect(hostNames).toContain('www.atresplayer.com');
    expect(hostNames).toContain('www.native.atresplayer.com');
    expect(hostNames).toContain('api.rlcdn.com');
    expect(hostNames).toContain('lwadm.com');
    expect(hostNames).toContain('localhost');
  });

  it('decodes //client/v1 routes, Retrofit methods, Properties keys, Widevine specs, and MIME types', () => {
    const liveSlash = decodeAtresplayerInput('//client/v1/page/live');
    expect(liveSlash.breakdown?.host).toBe('api.atresplayer.com');
    expect(liveSlash.breakdown?.routeKind).toBe('client_v1_page');

    const playerVideo = decodeAtresplayerInput('getPlayerVideo');
    expect(playerVideo.matchedService?.service).toBe('PlayerService');

    const checkVer = decodeAtresplayerInput('checkVersion');
    expect(checkVer.matchedService?.service).toBe('PropertiesService');
    expect(checkVer.breakdown?.queryParams.key).toBe('checkVersion');

    const closeUser = decodeAtresplayerInput('pc/v1/play/closewithuser');
    expect(closeUser.matchedService?.service).toBe('ConcurrentPlaybackService');
    expect(closeUser.breakdown?.routeKind).toBe('concurrent_play');

    const drmSpec = decodeAtresplayerInput('Widevine');
    expect(drmSpec.breakdown?.routeKind).toBe('drm_mime_spec');

    const dashMime = decodeAtresplayerInput('application/dash4K+xml');
    expect(dashMime.detectedType).toContain('DASH');
  });

  it('blocks SSRF targets, localhost placeholder, WebView sentinel, and non-inventory hosts', async () => {
    const localHostProbe = await probeAtresplayerUrl({ host: 'localhost' });
    expect(localHostProbe.ok).toBe(false);
    expect(localHostProbe.status).toBe(403);

    const sentinelProbe = await probeAtresplayerUrl({ host: 'www.native.atresplayer.com' });
    expect(sentinelProbe.ok).toBe(false);
    expect(sentinelProbe.status).toBe(403);

    const metaProbe = await probeAtresplayerUrl({ url: 'http://169.254.169.254/latest/meta-data' });
    expect(metaProbe.ok).toBe(false);
    expect(metaProbe.status).toBe(403);

    const loopbackProbe = await probeAtresplayerUrl({ url: 'http://127.0.0.1:8080/test' });
    expect(loopbackProbe.ok).toBe(false);
    expect(loopbackProbe.status).toBe(403);

    const unrelatedProbe = await probeAtresplayerUrl({ url: 'https://example.org/' });
    expect(unrelatedProbe.ok).toBe(false);
    expect(unrelatedProbe.status).toBe(403);
  });

  it('includes authorized open Atresmedia Spanish TDT channels in overview', () => {
    const overview = getAtresplayerOverview();
    expect(overview.atresmediaTdtChannels.length).toBeGreaterThanOrEqual(4);
    const ids = overview.atresmediaTdtChannels.map((c) => c.id);
    expect(ids).toContain('tdt-antena3');
    expect(ids).toContain('tdt-lasexta');
  });
});

import { describe, expect, it } from 'vitest';
import { parseBelixInventory } from '../belix/belixParser';
import {
  decodeBelixInput,
  inspectXtreamServer,
  probeBelixUrl,
} from '../belixService';

describe('Belix TV inventory parser, Xtream decoder & security guards', () => {
  it('parses all 48 URLs, 21 hosts, 15 API endpoints, 4 dynamic routes, 3 app URLs and 5 Smali files', () => {
    const inv = parseBelixInventory(true);

    expect(inv.packageName).toBe('com.ibopro.ultra');
    expect(inv.declaredSummary.literalUrls).toBe(48);
    expect(inv.declaredSummary.uniqueHosts).toBe(21);
    expect(inv.actualCounts.literalUrls).toBe(48);
    expect(inv.actualCounts.hosts).toBe(21);
    expect(inv.actualCounts.appExternalUrls).toBe(3);
    expect(inv.actualCounts.apiEndpoints).toBe(15);
    expect(inv.actualCounts.apiParams).toBe(6);
    expect(inv.actualCounts.dynamicRoutes).toBe(4);
    expect(inv.actualCounts.relevantCodeFiles).toBe(5);
  });

  it('decodes dynamic /live/, /player_api.php, /get.php routes and masks credentials', () => {
    const liveDecoded = decodeBelixInput('https://tv.provider.example/live/alice/secretpass/9012.ts');
    expect(liveDecoded.detectedType).toContain('/live/');
    expect(liveDecoded.smaliOriginRef).toContain('LiveChannelActivity');
    expect(liveDecoded.xtreamBreakdown?.streamId).toBe('9012');
    expect(liveDecoded.xtreamBreakdown?.extension).toBe('ts');
    expect(liveDecoded.xtreamBreakdown?.maskedUrl).not.toContain('secretpass');

    const apiDecoded = decodeBelixInput('/player_api.php?action=get_live_streams&category_id=14');
    expect(apiDecoded.xtreamBreakdown?.action).toBe('get_live_streams');
    expect(apiDecoded.smaliOriginRef).toContain('APIService');

    const m3uDecoded = decodeBelixInput(
      'https://tv.provider.example/get.php?username=alice&password=secretpass&output=ts&type=m3u_plus'
    );
    expect(m3uDecoded.xtreamBreakdown?.routeKind).toBe('m3u_plus');
    expect(m3uDecoded.xtreamBreakdown?.maskedUrl).not.toContain('secretpass');
  });

  it('blocks loopback, local bind 0.0.0.0, metadata IPs and non-Belix hosts in probe & xtream inspect', async () => {
    const bind0Res = await probeBelixUrl({ host: '0.0.0.0' });
    expect(bind0Res.ok).toBe(false);
    expect(bind0Res.status).toBe(403);

    const localhostRes = await probeBelixUrl({ host: 'localhost' });
    expect(localhostRes.ok).toBe(false);
    expect(localhostRes.status).toBe(403);

    const metadataRes = await probeBelixUrl({ url: 'http://169.254.169.254/latest/meta-data/' });
    expect(metadataRes.ok).toBe(false);
    expect(metadataRes.status).toBe(403);

    const nonBelixRes = await probeBelixUrl({ url: 'https://example.org/stream' });
    expect(nonBelixRes.ok).toBe(false);
    expect(nonBelixRes.status).toBe(403);

    const ssrfXtream = await inspectXtreamServer({
      serverUrl: 'http://127.0.0.1:8080',
      username: 'u',
      password: 'p',
    });
    expect(ssrfXtream.ok).toBe(false);
    expect(ssrfXtream.status).toBe(403);
  });
});

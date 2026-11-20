import { describe, expect, it } from 'vitest';
import { parseBelixInventory } from '../belix/belixParser';
import {
  decodeBelixInput,
  inspectXtreamServer,
  probeBelixUrl,
} from '../belixService';

describe('Belix TV inventory parser, Shark Pro / IBO decoder & security guards', () => {
  it('parses updated 54 URLs, 25 hosts, 15 API endpoints, 4 dynamic routes, 3 app URLs and 8 code/.so nodes in order', () => {
    const inv = parseBelixInventory(true);

    expect(inv.packageName).toBe('com.shadeed.belixtv');
    expect(inv.originalPackages).toEqual(['com.rtx.niceibo', 'com.ibopro.ultra']);
    expect(inv.reverseEngineeringUpdate.injectedEndpoint).toBe('http://1.sharkpro.ink:80');
    expect(inv.reverseEngineeringUpdate.activationDomains).toEqual([
      'activation.iboplayer.com',
      'iboproapp.com',
      'iboplayer.pro',
    ]);

    expect(inv.actualCounts.literalUrls).toBe(54);
    expect(inv.actualCounts.hosts).toBe(25);
    expect(inv.actualCounts.appExternalUrls).toBe(3);
    expect(inv.actualCounts.apiEndpoints).toBe(15);
    expect(inv.actualCounts.apiParams).toBe(6);
    expect(inv.actualCounts.dynamicRoutes).toBe(4);
    expect(inv.actualCounts.relevantCodeFiles).toBe(8);

    // Ordered hosts: Shark Pro Xtream panel first, IBO licensing next
    expect(inv.hosts[0].host).toBe('1.sharkpro.ink');
    expect(inv.hosts[0].category).toBe('xtream_panel');
    expect(inv.hosts[0].probeAllowed).toBe(true);

    const licHosts = inv.hosts.filter((h) => h.category === 'licensing_activation');
    expect(licHosts.map((h) => h.host).sort()).toEqual([
      'activation.iboplayer.com',
      'iboplayer.pro',
      'iboproapp.com',
    ]);

    // Ordered code layers: auth_native -> api_builder -> playback_model
    expect(inv.codeFiles[0].layer).toBe('auth_native');
    expect(inv.codeFiles[inv.codeFiles.length - 1].layer).toBe('playback_model');
  });

  it('decodes Shark Pro URLs, Dalvik IBO RTX descriptors, /live/, /player_api.php and masks credentials', () => {
    const sharkM3u = decodeBelixInput(
      'http://1.sharkpro.ink:80/get.php?username=alice_user&password=secret_pw_99&type=m3u_plus'
    );
    expect(sharkM3u.detectedType).toContain('Shark Pro');
    expect(sharkM3u.xtreamBreakdown?.routeKind).toBe('m3u_plus');
    expect(sharkM3u.xtreamBreakdown?.maskedUrl).not.toContain('alice_user');
    expect(sharkM3u.xtreamBreakdown?.maskedUrl).not.toContain('secret_pw_99');
    expect(sharkM3u.xtreamBreakdown?.params.username).toBe('***');
    expect(sharkM3u.xtreamBreakdown?.params.password).toBe('***');

    const dalvikHook = decodeBelixInput('Lcom/rtx/niceibo/mURL;->weblink');
    expect(dalvikHook.detectedType).toContain('IBO RTX');
    expect(dalvikHook.smaliOriginRef).toContain('mURL');

    const reskinPkg = decodeBelixInput('com.shadeed.belixtv');
    expect(reskinPkg.detectedType).toContain('com.shadeed.belixtv');

    const liveDecoded = decodeBelixInput('https://tv.provider.example/live/alice/secretpass/9012.ts');
    expect(liveDecoded.detectedType).toContain('/live/');
    expect(liveDecoded.smaliOriginRef).toContain('LiveChannelActivity');
    expect(liveDecoded.xtreamBreakdown?.streamId).toBe('9012');
    expect(liveDecoded.xtreamBreakdown?.extension).toBe('ts');
    expect(liveDecoded.xtreamBreakdown?.maskedUrl).not.toContain('secretpass');

    const apiDecoded = decodeBelixInput('/player_api.php?action=get_live_streams&category_id=14');
    expect(apiDecoded.xtreamBreakdown?.action).toBe('get_live_streams');
    expect(apiDecoded.smaliOriginRef).toContain('APIService');
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

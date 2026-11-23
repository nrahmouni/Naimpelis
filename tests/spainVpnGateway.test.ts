import { afterEach, describe, expect, it } from 'vitest';
import {
  clearRuntimeSpainProxyConfig,
  getSpainFfmpegHttpProxyArgs,
  getSpainGatewayPublicConfig,
  getSpainProxyUrlForTarget,
  maskProxyUrl,
  setRuntimeSpainProxyConfig,
  shouldRouteThroughSpainProxy,
  validateSpainProxyUrl,
} from '../server/services/spainVpnGatewayService.ts';
import {
  getUrbanVpnAuditSummary,
  getUrbanVpnOvpnProfile,
  listUrbanVpnGateways,
  probeUrbanVpnGateway,
} from '../server/services/urbanVpnService.ts';

describe('Urban VPN 1.0.97 Audit & Cross-Device Spain VPN Gateway', () => {
  afterEach(() => {
    clearRuntimeSpainProxyConfig();
  });

  it('indexes all Urban VPN gateways including 8 active Spain nodes and legacy p-es4 Madrid', () => {
    const audit = getUrbanVpnAuditSummary();
    expect(audit.totalGateways).toBeGreaterThanOrEqual(100);
    expect(audit.spainGateways.map((g) => g.hostname)).toEqual([
      'p-es7.urban-vpn.com',
      'p-es8.urban-vpn.com',
      'p-es9.urban-vpn.com',
      'p-es10.urban-vpn.com',
      'p-es3.urban-vpn.com',
      'p-es6.urban-vpn.com',
      'p-es1.urban-vpn.com',
      'p-es11.urban-vpn.com',
    ]);
    expect(audit.tunnelProtocol.port).toBe(443);
    expect(audit.tunnelProtocol.cipher).toBe('AES-256-CBC');

    const madrid = listUrbanVpnGateways({ query: 'Madrid' });
    expect(madrid).toHaveLength(1);
    expect(madrid[0]?.hostname).toBe('p-es4.urban-vpn.com');

    const allSpain = listUrbanVpnGateways({ spainOnly: true, includeZeroWeight: true });
    expect(allSpain.some((g) => g.hostname === 'p-es4.urban-vpn.com')).toBe(true);
  });

  it('generates valid allowlisted .ovpn profiles and blocks path traversal or unknown nodes', () => {
    const valid = getUrbanVpnOvpnProfile('p-es1');
    expect(valid.ok).toBe(true);
    if (valid.ok) {
      expect(valid.filename).toBe('p-es1.ovpn');
      expect(valid.ovpnContent).toContain('remote p-es1.urban-vpn.com 443');
      expect(valid.ovpnContent).toContain('cipher AES-256-CBC');
    }

    const traversal = getUrbanVpnOvpnProfile('../etc/passwd');
    expect(traversal.ok).toBe(false);

    const unknown = getUrbanVpnOvpnProfile('p-xx999');
    expect(unknown.ok).toBe(false);
  });

  it('blocks non-allowlisted hosts in probeUrbanVpnGateway', async () => {
    const res = await probeUrbanVpnGateway('127.0.0.1');
    expect(res.ok).toBe(false);
    expect(res.error).toContain('fuera de la lista');
  });

  it('enforces SSRF protection on proxy URLs and masks credentials cleanly', async () => {
    const loopbackReject = await validateSpainProxyUrl('socks5h://127.0.0.1:1080');
    expect(loopbackReject.ok).toBe(false);

    const privateIpReject = await validateSpainProxyUrl('http://192.168.1.10:3128');
    expect(privateIpReject.ok).toBe(false);

    const badScheme = await validateSpainProxyUrl('ftp://8.8.8.8:21');
    expect(badScheme.ok).toBe(false);

    const validSocks = await validateSpainProxyUrl('socks5h://esUser1:superSecret@8.8.8.8:1080');
    expect(validSocks.ok).toBe(true);
    expect(maskProxyUrl('socks5h://esUser1:superSecret@8.8.8.8:1080')).toBe(
      'socks5h://es***@8.8.8.8:1080'
    );
  });

  it('routes Spanish broadcasters and TDT through Spain proxy in auto_spanish scope while keeping TMDB direct', async () => {
    const updated = await setRuntimeSpainProxyConfig({
      proxyUrl: 'http://proxyUser:pass123@8.8.8.8:3128',
      scope: 'auto_spanish',
      enabled: true,
    });
    expect(updated.ok).toBe(true);

    const pub = getSpainGatewayPublicConfig();
    expect(pub.enabled).toBe(true);
    expect(pub.maskedProxyUrl).toBe('http://pr***@8.8.8.8:3128');
    expect(pub.maskedProxyUrl).not.toContain('pass123');

    expect(shouldRouteThroughSpainProxy('https://api.atresplayer.com/client/v1/row/live')).toBe(true);
    expect(shouldRouteThroughSpainProxy('http://90.163.85.113:8093/stream/20/index.m3u8')).toBe(true);
    expect(shouldRouteThroughSpainProxy('https://api.themoviedb.org/3/movie/popular')).toBe(false);
    expect(getSpainProxyUrlForTarget('https://www.atresplayer.com/directos/lasexta/')).toBe(
      'http://proxyUser:pass123@8.8.8.8:3128/'
    );
    expect(getSpainFfmpegHttpProxyArgs('http://90.163.85.113:8093/stream/20/index.m3u8')).toEqual([
      '-http_proxy',
      'http://proxyUser:pass123@8.8.8.8:3128/',
    ]);

    const cleared = clearRuntimeSpainProxyConfig();
    expect(cleared.enabled).toBe(false);
    expect(shouldRouteThroughSpainProxy('https://api.atresplayer.com/client/v1/row/live')).toBe(false);
  });
});

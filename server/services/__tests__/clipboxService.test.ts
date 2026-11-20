import { describe, expect, it } from 'vitest';
import { parseClipboxInventory } from '../clipbox/clipboxParser';
import { decodeClipboxInput, probeClipboxUrl } from '../clipboxService';

describe('ClipBox inventory parser & decoder', () => {
  it('parses all literal URLs, 440 hosts, and 954 route patterns from rutas_clipbox', () => {
    const inventory = parseClipboxInventory();

    expect(inventory.declaredSummary.literalUrls).toBe(574);
    expect(inventory.actualCounts.literalUrls).toBe(570);
    expect(inventory.mediaRefs.length).toBe(4);
    expect(inventory.actualCounts.hosts).toBe(440);
    expect(inventory.actualCounts.routePatterns).toBe(954);
    expect(inventory.hosts.length).toBe(440);
    expect(inventory.routePatterns.length).toBe(954);
    expect(inventory.actualCounts.streamingHosts).toBeGreaterThan(100);
  });

  it('decodes Base64 JSON configs (hdhub.thevolecitor.qzz.io) and detects Smali providers & extractors', () => {
    const inventory = parseClipboxInventory();

    const hdhubToken = inventory.decodedTokens.find((t) =>
      t.host.includes('hdhub.thevolecitor.qzz.io')
    );
    expect(hdhubToken).toBeDefined();
    expect(hdhubToken?.encoding).toBe('base64-json');
    expect(hdhubToken?.decodedPayload).toMatchObject({
      torbox: 'unset',
      qualities: '2160p,1080p,720p,480p',
    });

    expect(inventory.decodedProviders.map((p) => p.name)).toEqual(
      expect.arrayContaining(['StreamingCommunityProvider', 'CineCityProvider'])
    );
    expect(inventory.decodedExtractors.length).toBeGreaterThanOrEqual(10);
    expect(inventory.decodedExtractors.map((e) => e.name)).toEqual(
      expect.arrayContaining(['StreamWishExtractor', 'Mp4UploadExtractor'])
    );
    expect(inventory.mediaRefs.some((m) => m.kind === 'hls' && m.url.includes('.m3u8'))).toBe(
      true
    );
    expect(inventory.mediaRefs.some((m) => m.kind === 'mp4' && m.url.includes('.mp4'))).toBe(
      true
    );
  });

  it('decodes arbitrary ClipBox Base64 payloads and identifies extractor families', async () => {
    const result = await decodeClipboxInput(
      'https://hdhub.thevolecitor.qzz.io/eyJ0b3Jib3giOiJ1bnNldCIsInF1YWxpdGllcyI6IjIxNjBwLDEwODBwLDcyMHAsNDgwcCIsInNvcnQiOiJkZXNjIn0=',
      false
    );

    expect(result.base64Decoded?.length).toBeGreaterThan(0);
    expect(result.base64Decoded?.[0].json).toMatchObject({
      torbox: 'unset',
      qualities: '2160p,1080p,720p,480p',
    });
    expect(result.urlBreakdown?.host).toBe('hdhub.thevolecitor.qzz.io');
  });

  it('blocks loopback, metadata, private IPs, and non-ClipBox hosts in probeClipboxUrl', async () => {
    const localhostRes = await probeClipboxUrl({ url: 'http://127.0.0.1:8080/secret' });
    expect(localhostRes.ok).toBe(false);
    expect(localhostRes.status).toBe(403);

    const metadataRes = await probeClipboxUrl({
      url: 'http://169.254.169.254/latest/meta-data/',
    });
    expect(metadataRes.ok).toBe(false);
    expect(metadataRes.status).toBe(403);

    const unknownHostRes = await probeClipboxUrl({ url: 'https://example.org/test' });
    expect(unknownHostRes.ok).toBe(false);
    expect(unknownHostRes.status).toBe(403);
  });
});

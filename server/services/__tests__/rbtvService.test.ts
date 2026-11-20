import { describe, expect, it } from 'vitest';
import { parseRbtvInventory } from '../rbtv/rbtvParser';
import {
  decodeRbtvInput,
  probeRbtvUrl,
  resolveDomainViaDoh,
} from '../rbtvService';

describe('RBTV+ inventory parser, architecture decoder & security guards', () => {
  it('parses all 61 absolute URLs, 47 hosts, 10 primary domains, and 14 media formats from rutas_RBTV', () => {
    const inv = parseRbtvInventory();

    expect(inv.declaredSummary.inspectedFiles).toBe(16832);
    expect(inv.actualCounts.absoluteUrls).toBe(61);
    expect(inv.actualCounts.hosts).toBe(47);
    expect(inv.actualCounts.coreDomains).toBe(10);
    expect(inv.actualCounts.dohResolvers).toBe(13);
    expect(inv.actualCounts.mediaFormats).toBe(14);
    expect(inv.architectureNodes.length).toBeGreaterThanOrEqual(6);
  });

  it('captures Java/Smali provenance references and reconstructs component roles', async () => {
    const inv = parseRbtvInventory();
    const absProxy = inv.hosts.find((h) => h.host === '%s');
    expect(absProxy).toBeDefined();
    expect(absProxy?.probeAllowed).toBe(false);
    expect(absProxy?.urlItems[0]?.references.join(' ')).toContain('AbsProxy');

    const decoded = await decodeRbtvInput('https://vip1.openaicommunities.bond/v1', {
      runDoh: false,
      fetchLiveSample: false,
    });
    expect(decoded.componentRef).toContain('ParamsManager');
    expect(decoded.matchedHost?.isCoreAppDomain).toBe(true);
    expect(decoded.urlBreakdown?.pathname).toBe('/v1');
  });

  it('blocks loopback, metadata, internal templates, and non-RBTV hosts in probe & DoH endpoints', async () => {
    const localhostRes = await probeRbtvUrl({ url: 'http://127.0.0.1:9000/admin' });
    expect(localhostRes.ok).toBe(false);
    expect(localhostRes.status).toBe(403);

    const metadataRes = await probeRbtvUrl({
      url: 'http://169.254.169.254/latest/meta-data/',
    });
    expect(metadataRes.ok).toBe(false);
    expect(metadataRes.status).toBe(403);

    const templateRes = await probeRbtvUrl({ host: '%s' });
    expect(templateRes.ok).toBe(false);
    expect(templateRes.status).toBe(403);

    const unknownHostRes = await probeRbtvUrl({ url: 'https://example.org/test' });
    expect(unknownHostRes.ok).toBe(false);
    expect(unknownHostRes.status).toBe(403);

    const blockedDoh = await resolveDomainViaDoh('localhost.localdomain', 'cloudflare');
    expect(blockedDoh.ok).toBe(false);
    expect(blockedDoh.status).toBe(403);
  });
});

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseAppRoute, SYSTEM_RESERVED_SLUGS } from '../src/shared/dedicatedRoutes.ts';
import { evaluateDirectPlayEligibility } from '../server/services/mediaPlaneRouter.ts';
import { runtimeMetrics } from '../server/services/runtimeMetricsCollector.ts';
import {
  signAdminSessionToken,
  verifyAdminSessionToken,
  verifyFirebaseAdminIdToken,
} from '../server/services/adminAuthService.ts';
import { DEFAULT_ADMIN_EMAILS, isDefaultAdminEmail } from '../src/shared/adminAccess.ts';
import {
  filterCatalogItemsSync,
  parseM3uTextSync,
} from '../src/workers/catalogWorker.ts';

const ROOT = process.cwd();

describe('RiffanTV Architecture Phases 1-3 & /admin Console Verification', () => {
  it('reserves /admin as a system route and never collides with room IDs', () => {
    expect(SYSTEM_RESERVED_SLUGS.has('admin')).toBe(true);
    const parsed = parseAppRoute('/admin');
    expect(parsed).toEqual({
      kind: 'system',
      systemType: 'admin',
      roomId: undefined,
    });
    const parsedWithRoom = parseAppRoute('/admin', '?room=abc9');
    expect(parsedWithRoom).toEqual({
      kind: 'system',
      systemType: 'admin',
      roomId: 'abc9',
    });
  });

  it('evaluates Direct-Play First eligibility accurately across CORS CDNs, referer hosts, and DVB streams', () => {
    const corsStream = evaluateDirectPlayEligibility(
      'https://ztnr.rtve.es/ztnr/1688877.m3u8'
    );
    expect(corsStream.directPlayEligible).toBe(true);
    expect(corsStream.reason).toBe('direct_https_cors_cdn');

    const refererProtected = evaluateDirectPlayEligibility(
      'https://cdn.streamxhd.sbs/live/ch1.m3u8',
      { referer: 'https://streamxhd.sbs/' }
    );
    expect(refererProtected.directPlayEligible).toBe(false);
    expect(refererProtected.reason).toBe('upstream_referer_or_tls_required');

    const dvbStream = evaluateDirectPlayEligibility(
      'https://cdn.example.com/channel.m3u8',
      { forceAac: true }
    );
    expect(dvbStream.directPlayEligible).toBe(false);
    expect(dvbStream.reason).toBe('dvb_aac_remux_required');

    const mixedHttp = evaluateDirectPlayEligibility('http://cdn.rtve.es/stream.m3u8');
    expect(mixedHttp.directPlayEligible).toBe(false);
    expect(mixedHttp.reason).toBe('mixed_content_http_upgrade');
  });

  it('records HTTP, Media Plane, AI, and client Web Vitals metrics accurately in runtimeMetricsCollector', () => {
    runtimeMetrics.recordHttpRequest(200, 18);
    runtimeMetrics.recordHttpRequest(502, 120);
    runtimeMetrics.recordMediaRequest('hls', 2048);
    runtimeMetrics.recordVodManifestHit();
    runtimeMetrics.recordAiOutcome('ok');
    runtimeMetrics.recordClientVitals({
      platform: 'pwa',
      vertical: 'futbol',
      ttfbMs: 32,
      fcpMs: 280,
      domInteractiveMs: 390,
      swActive: true,
      standalonePwa: true,
    });

    const snap = runtimeMetrics.getSnapshot();
    expect(snap.http.totalRequests).toBeGreaterThanOrEqual(2);
    expect(snap.http.errors5xx).toBeGreaterThanOrEqual(1);
    expect(snap.media.hlsRequests).toBeGreaterThanOrEqual(1);
    expect(snap.media.vodManifestCacheHits).toBeGreaterThanOrEqual(1);
    expect(snap.ai.totalRequests).toBeGreaterThanOrEqual(1);
    expect(snap.clientVitals.totalSamples).toBeGreaterThanOrEqual(1);
    expect(snap.clientVitals.byPlatform.pwa.count).toBeGreaterThanOrEqual(1);
  });

  it('signs and verifies HMAC-SHA256 admin session tokens and rejects tampered or expired tokens', async () => {
    const validToken = signAdminSessionToken({
      sub: 'uid-owner',
      email: 'felipeallouch@gmail.com',
      method: 'firebase-google',
      iat: Date.now(),
      exp: Date.now() + 60_000,
    });
    const verified = verifyAdminSessionToken(validToken);
    expect(verified?.email).toBe('felipeallouch@gmail.com');
    expect(verified?.method).toBe('firebase-google');

    const [payload, sig] = validToken.split('.');
    const tamperedSig = `${payload}.${sig.slice(0, -1)}${sig.endsWith('a') ? 'b' : 'a'}`;
    expect(verifyAdminSessionToken(tamperedSig)).toBeNull();

    const expiredToken = signAdminSessionToken({
      sub: 'uid-owner',
      email: 'felipeallouch@gmail.com',
      method: 'firebase-google',
      iat: Date.now() - 120_000,
      exp: Date.now() - 1_000,
    });
    expect(verifyAdminSessionToken(expiredToken)).toBeNull();

    const emptyFirebase = await verifyFirebaseAdminIdToken('');
    expect(emptyFirebase.ok).toBe(false);
    if (!emptyFirebase.ok) {
      expect(emptyFirebase.status).toBe(401);
    }
  });

  it('filters catalog items and parses M3U playlists cleanly in catalogWorker', () => {
    const channels = [
      { id: '1', name: 'La 1 HD', category: 'generalistas' },
      { id: '2', name: 'Teledeporte', category: 'deportes' },
      { id: '3', name: 'TV3 Catalunya', category: 'autonomicos' },
    ];
    const filtered = filterCatalogItemsSync(channels, 'tele', 'deportes');
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe('2');

    const parsedM3u = parseM3uTextSync(
      [
        '#EXTM3U',
        '#EXTINF:-1 group-title="Deportes" tvg-logo="https://img.test/tdp.png",Teledeporte HD',
        'https://stream.test/tdp.m3u8',
      ].join('\n')
    );
    expect(parsedM3u).toEqual([
      {
        name: 'Teledeporte HD',
        url: 'https://stream.test/tdp.m3u8',
        group: 'Deportes',
        logo: 'https://img.test/tdp.png',
      },
    ]);
  });

  it('verifies traceability document, server.ts line budget, and feature-admin chunk isolation', () => {
    expect(fs.existsSync(path.join(ROOT, 'ARCHITECTURE_TRACEABILITY.md'))).toBe(true);
    expect(fs.existsSync(path.join(ROOT, 'server/mediaServer.ts'))).toBe(true);
    expect(fs.existsSync(path.join(ROOT, 'src/db/schema.ts'))).toBe(true);

    const serverLines = fs
      .readFileSync(path.join(ROOT, 'server.ts'), 'utf8')
      .split(/\r?\n/).length;
    expect(serverLines).toBeLessThanOrEqual(700);

    const viteCfg = fs.readFileSync(path.join(ROOT, 'vite.config.ts'), 'utf8');
    expect(viteCfg).toContain("'feature-admin'");

    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    expect(pkg.scripts.start).toBe('node server.ts');
    expect(pkg.scripts['build:server']).toContain('esbuild');
    expect(pkg.scripts['start:compiled']).toContain('dist-server/server.mjs');
    expect(pkg.scripts['start:media']).toContain('dist-server/mediaServer.mjs');
  });

  it('authorizes both primary admin emails and wires /admin SPA navigation & popstate cleanly', () => {
    expect(DEFAULT_ADMIN_EMAILS).toContain('felipeallouch@gmail.com');
    expect(DEFAULT_ADMIN_EMAILS).toContain('naimrahmouni1998@gmail.com');
    expect(isDefaultAdminEmail('NaimRahmouni1998@gmail.com')).toBe(true);
    expect(isDefaultAdminEmail('felipeallouch@gmail.com')).toBe(true);
    expect(isDefaultAdminEmail('guest@example.com')).toBe(false);

    const deepLinkSrc = fs.readFileSync(path.join(ROOT, 'src/hooks/useDeepLinkRouter.ts'), 'utf8');
    expect(deepLinkSrc).toContain("target.systemType === 'admin'");
    expect(deepLinkSrc).toContain('setIsAdminPageRef.current?.(true)');
    expect(deepLinkSrc).toContain('setIsAdminPageRef.current?.(false)');
  });
});

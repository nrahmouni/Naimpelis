import { describe, expect, it, vi } from 'vitest';
import type express from 'express';
import {
  mapPathToServiceId,
  serviceMesh,
  serviceMeshGatewayMiddleware,
} from '../server/gateway/serviceMesh.ts';
import {
  isAllowedPublicOriginHostname,
  resolveSafePublicOrigin,
} from '../server/utils/ssrfGuard.ts';
import { pruneOldTelemetryRecords } from '../server/services/telemetryStore.ts';

function createMockReqRes(pathname: string) {
  const headers: Record<string, string> = {};
  let finishCb: (() => void) | undefined;
  let jsonPayload: unknown = null;
  let statusCode = 200;

  const req = {
    originalUrl: pathname,
    path: pathname,
    headers: {},
  } as unknown as express.Request;

  const res = {
    statusCode: 200,
    setHeader(name: string, value: string) {
      headers[name.toLowerCase()] = value;
      return res;
    },
    status(code: number) {
      statusCode = code;
      (res as unknown as { statusCode: number }).statusCode = code;
      return res;
    },
    json(payload: unknown) {
      jsonPayload = payload;
      return res;
    },
    on(event: string, cb: () => void) {
      if (event === 'finish') finishCb = cb;
      return res;
    },
  } as unknown as express.Response;

  return {
    req,
    res,
    headers,
    getStatus: () => statusCode,
    getJson: () => jsonPayload,
    triggerFinish: () => finishCb?.(),
  };
}

describe('Service Mesh Circuit Breaker & Middleware Enforcement', () => {
  it('opens circuit after 5 consecutive errors, rejects with 503 + Retry-After, bypasses health/metrics, and resets cleanly', () => {
    serviceMesh.resetCircuit('catalog-discovery');
    expect(mapPathToServiceId('/api/catalog/movies')).toBe('catalog-discovery');
    expect(serviceMesh.isCircuitOpen('catalog-discovery')).toBe(false);

    for (let i = 0; i < 5; i++) {
      serviceMesh.recordError('catalog-discovery', `Upstream timeout #${i + 1}`);
    }

    expect(serviceMesh.isCircuitOpen('catalog-discovery')).toBe(true);
    expect(serviceMesh.getCircuitRetryAfterSec('catalog-discovery')).toBeGreaterThanOrEqual(1);

    // Normal catalog route should short-circuit with 503 + Retry-After
    const blocked = createMockReqRes('/api/catalog/movies?page=1');
    const nextBlocked = vi.fn();
    serviceMeshGatewayMiddleware(blocked.req, blocked.res, nextBlocked);

    expect(nextBlocked).not.toHaveBeenCalled();
    expect(blocked.getStatus()).toBe(503);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThanOrEqual(1);
    expect(blocked.getJson()).toMatchObject({
      ok: false,
      serviceId: 'catalog-discovery',
    });

    // Observability bypass paths remain accessible even if api-gateway/qoe had errors
    serviceMesh.resetCircuit('qoe-telemetry');
    for (let i = 0; i < 5; i++) {
      serviceMesh.recordError('qoe-telemetry', 'metric sink failure');
    }
    const metricsCall = createMockReqRes('/api/metrics');
    const nextMetrics = vi.fn();
    serviceMeshGatewayMiddleware(metricsCall.req, metricsCall.res, nextMetrics);
    expect(nextMetrics).toHaveBeenCalledTimes(1);

    // Resetting circuit restores healthy traffic
    serviceMesh.resetCircuit();
    expect(serviceMesh.isCircuitOpen('catalog-discovery')).toBe(false);
    const recovered = createMockReqRes('/api/catalog/movies');
    const nextRecovered = vi.fn();
    serviceMeshGatewayMiddleware(recovered.req, recovered.res, nextRecovered);
    expect(nextRecovered).toHaveBeenCalledTimes(1);
  });
});

describe('Public Origin Allowlist & Telemetry TTL Pruning', () => {
  it('validates allowed public domains and blocks untrusted query origin overrides', () => {
    expect(isAllowedPublicOriginHostname('riffantv.ai.studio')).toBe(true);
    expect(isAllowedPublicOriginHostname('riffan.ai.studio')).toBe(true);
    expect(isAllowedPublicOriginHostname('svc-123.us-central1.run.app')).toBe(true);
    expect(isAllowedPublicOriginHostname('evil.example.com')).toBe(false);

    const safeFromQuery = resolveSafePublicOrigin({
      queryOrigin: 'https://riffantv.ai.studio',
      hostHeader: 'localhost:3000',
    });
    expect(safeFromQuery).toBe('https://riffantv.ai.studio');

    const rejectedUntrustedQuery = resolveSafePublicOrigin(
      {
        queryOrigin: 'https://evil.example.com',
        forwardedProto: 'https',
        forwardedHost: 'attacker.invalid',
      },
      'riffantv.ai.studio'
    );
    expect(rejectedUntrustedQuery).toBe('https://riffantv.ai.studio');
  });

  it('executes pruneOldTelemetryRecords safely without throwing', async () => {
    const res = await pruneOldTelemetryRecords(14);
    expect(typeof res.removedMemory).toBe('number');
    expect(res.removedMemory).toBeGreaterThanOrEqual(0);
  });
});

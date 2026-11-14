import crypto from 'crypto';
import type express from 'express';
import { logger } from '../utils/logger.ts';

export type MicroserviceId =
  | 'api-gateway'
  | 'catalog-discovery'
  | 'stream-extractor'
  | 'live-media-epg'
  | 'football-matchboard'
  | 'watch-party-ws'
  | 'smart-tv-pairing'
  | 'qoe-telemetry';

export interface MicroserviceStatus {
  id: MicroserviceId;
  name: string;
  version: string;
  status: 'healthy' | 'degraded' | 'open-circuit';
  requestsTotal: number;
  errorsTotal: number;
  avgLatencyMs: number;
  lastErrorAt: number | null;
  lastErrorMsg: string | null;
  circuitOpenUntil: number;
}

class ServiceMeshRegistry {
  private services = new Map<MicroserviceId, MicroserviceStatus>();
  private latencySamples = new Map<MicroserviceId, number[]>();

  constructor() {
    const initialDefs: Array<{ id: MicroserviceId; name: string; version: string }> = [
      { id: 'api-gateway', name: 'API Gateway & Edge Router', version: '3.0.0' },
      { id: 'catalog-discovery', name: 'Catalog & Genre Discovery Service', version: '3.0.0' },
      { id: 'stream-extractor', name: 'Stream Extraction & HLS/TS Proxy Service', version: '3.0.0' },
      { id: 'live-media-epg', name: 'Live TDT, FAST & XMLTV EPG Service', version: '3.0.0' },
      { id: 'football-matchboard', name: 'Football Live Matchboard & Scores Service', version: '3.0.0' },
      { id: 'watch-party-ws', name: 'Real-Time Watch Party WebSocket Hub', version: '3.0.0' },
      { id: 'smart-tv-pairing', name: 'Smart TV / Google TV 10-Foot Pairing Service', version: '3.0.0' },
      { id: 'qoe-telemetry', name: 'Playback QoE & Analytics Service', version: '3.0.0' },
    ];
    for (const def of initialDefs) {
      this.services.set(def.id, {
        ...def,
        status: 'healthy',
        requestsTotal: 0,
        errorsTotal: 0,
        avgLatencyMs: 0,
        lastErrorAt: null,
        lastErrorMsg: null,
        circuitOpenUntil: 0,
      });
      this.latencySamples.set(def.id, []);
    }
  }

  recordSuccess(id: MicroserviceId, latencyMs: number): void {
    const svc = this.services.get(id);
    if (!svc) return;
    svc.requestsTotal += 1;
    if (svc.circuitOpenUntil > 0 && Date.now() > svc.circuitOpenUntil) {
      svc.circuitOpenUntil = 0;
    }
    svc.status = 'healthy';
    const samples = this.latencySamples.get(id) || [];
    samples.push(Math.max(0, Math.round(latencyMs)));
    if (samples.length > 50) samples.shift();
    this.latencySamples.set(id, samples);
    const sum = samples.reduce((acc, v) => acc + v, 0);
    svc.avgLatencyMs = Math.round(sum / Math.max(1, samples.length));
  }

  recordError(id: MicroserviceId, errMsg: string): void {
    const svc = this.services.get(id);
    if (!svc) return;
    svc.requestsTotal += 1;
    svc.errorsTotal += 1;
    svc.lastErrorAt = Date.now();
    svc.lastErrorMsg = errMsg.slice(0, 180);
    const errorRate = svc.errorsTotal / Math.max(1, svc.requestsTotal);
    svc.status = svc.requestsTotal >= 10 && errorRate > 0.5 ? 'degraded' : 'healthy';
  }

  getAllStatuses(): MicroserviceStatus[] {
    return Array.from(this.services.values());
  }
}

export const serviceMesh = new ServiceMeshRegistry();

export function mapPathToServiceId(pathname: string): MicroserviceId {
  if (pathname.startsWith('/api/catalog')) return 'catalog-discovery';
  if (
    pathname.startsWith('/api/extract') ||
    pathname.startsWith('/api/hls-proxy') ||
    pathname.startsWith('/api/ts-proxy') ||
    pathname.startsWith('/api/subtitles') ||
    pathname.startsWith('/api/img-proxy')
  ) {
    return 'stream-extractor';
  }
  if (
    pathname.startsWith('/api/epg') ||
    pathname.startsWith('/api/iptv') ||
    pathname === '/epg.xml' ||
    pathname === '/naim-cine.m3u'
  ) {
    return 'live-media-epg';
  }
  if (pathname.startsWith('/api/sports')) return 'football-matchboard';
  if (pathname.startsWith('/api/tv')) return 'smart-tv-pairing';
  if (pathname.startsWith('/api/metrics')) return 'qoe-telemetry';
  return 'api-gateway';
}

export function serviceMeshGatewayMiddleware(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): void {
  const start = Date.now();
  const correlationId = String(req.headers['x-correlation-id'] || crypto.randomUUID().slice(0, 12));
  const fullPath = String(req.originalUrl || req.path || '').split('?')[0];
  const serviceId = mapPathToServiceId(fullPath);

  res.setHeader('X-Correlation-Id', correlationId);
  res.setHeader('X-Service-Node', serviceId);

  res.on('finish', () => {
    const elapsed = Date.now() - start;
    if (res.statusCode >= 500) {
      serviceMesh.recordError(serviceId, `HTTP ${res.statusCode} on ${fullPath}`);
      logger.warn({ correlationId, serviceId, path: fullPath, status: res.statusCode, elapsed }, 'microservice_error_response');
    } else {
      serviceMesh.recordSuccess(serviceId, elapsed);
    }
  });

  next();
}

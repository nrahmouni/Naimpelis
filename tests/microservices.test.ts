import { describe, expect, it } from 'vitest';
import { mapPathToServiceId, serviceMesh } from '../server/gateway/serviceMesh';
import {
  EXPANDED_GENRES,
  FAST_THEMATIC_CHANNELS,
} from '../server/services/catalogDiscoveryService';
import { sniffStreamViaHttp } from '../server/services/streamSnifferService';

describe('Microservice Gateway & Service Mesh', () => {
  it('routes API paths to dedicated microservice nodes', () => {
    expect(mapPathToServiceId('/api/catalog/collections')).toBe('catalog-discovery');
    expect(mapPathToServiceId('/api/catalog/discover')).toBe('catalog-discovery');
    expect(mapPathToServiceId('/api/extract/stream')).toBe('stream-extractor');
    expect(mapPathToServiceId('/api/hls-proxy')).toBe('stream-extractor');
    expect(mapPathToServiceId('/api/epg/now')).toBe('live-media-epg');
    expect(mapPathToServiceId('/api/sports/live')).toBe('football-matchboard');
    expect(mapPathToServiceId('/api/tv/pair/create')).toBe('smart-tv-pairing');
    expect(mapPathToServiceId('/api/metrics/qoe')).toBe('qoe-telemetry');
    expect(mapPathToServiceId('/api/health')).toBe('api-gateway');
  });

  it('tracks microservice health and latency metrics', () => {
    serviceMesh.recordSuccess('catalog-discovery', 24);
    serviceMesh.recordSuccess('catalog-discovery', 36);
    const statuses = serviceMesh.getAllStatuses();
    expect(statuses.length).toBe(8);
    const catalogNode = statuses.find((s) => s.id === 'catalog-discovery');
    expect(catalogNode).toBeDefined();
    expect(catalogNode?.status).toBe('healthy');
    expect(catalogNode?.requestsTotal).toBeGreaterThanOrEqual(2);
    expect(catalogNode?.avgLatencyMs).toBeGreaterThan(0);
  });
});

describe('Expanded Catalog & FAST Channels Microservice', () => {
  it('provides 14 localized genres with valid TMDB IDs', () => {
    expect(EXPANDED_GENRES.length).toBe(14);
    const ids = new Set(EXPANDED_GENRES.map((g) => g.id));
    expect(ids.size).toBe(14);
    for (const genre of EXPANDED_GENRES) {
      expect(genre.es.length).toBeGreaterThan(0);
      expect(genre.ca.length).toBeGreaterThan(0);
      expect(genre.en.length).toBeGreaterThan(0);
    }
  });

  it('provides verified 24/7 thematic FAST channels with unique IDs', () => {
    expect(FAST_THEMATIC_CHANNELS.length).toBeGreaterThanOrEqual(8);
    const ids = new Set(FAST_THEMATIC_CHANNELS.map((c) => c.id));
    expect(ids.size).toBe(FAST_THEMATIC_CHANNELS.length);
    for (const ch of FAST_THEMATIC_CHANNELS) {
      expect(ch.streamUrl.startsWith('https://')).toBe(true);
      expect(['hls', 'youtube']).toContain(ch.mode);
    }
  });
});

describe('Puppeteer-free HTTP Stream Sniffer', () => {
  it('recognizes direct HLS & MP4 streams without spawning headless browsers', async () => {
    const hls = await sniffStreamViaHttp('https://cdn.example.com/live/master.m3u8');
    expect(hls).toEqual({
      streamUrl: 'https://cdn.example.com/live/master.m3u8',
      referer: 'https://cdn.example.com/live/master.m3u8',
      isDirectMp4: false,
    });

    const mp4 = await sniffStreamViaHttp('https://cdn.example.com/vod/movie.mp4?token=123');
    expect(mp4).toEqual({
      streamUrl: 'https://cdn.example.com/vod/movie.mp4?token=123',
      referer: 'https://cdn.example.com/vod/movie.mp4?token=123',
      isDirectMp4: true,
    });
  });

  it('blocks known ad-network domains immediately', async () => {
    const blocked = await sniffStreamViaHttp('https://ads.doubleclick.net/pixel.m3u8');
    expect(blocked).toBeNull();
  });
});

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { XTREAM_PROVIDER_UI_SPECS } from '../../../src/config/defaultProviders';
import { getAllXtreamProviders } from '../providersConfig';
import { getProvidersStatusSummary } from '../providers/xtreamProvidersService';
import {
  detectProviderItemLangAndQuality,
  sortCatalogItemsForDisplay,
} from '../providers/xtreamProvidersHelpers';
import { ChannelHealthMonitor } from '../channelHealthMonitor';
import { orderCandidatesForFastResolve, raceFastLiveTracks } from '../liveFastResolver';
import { buildDvbLiveFfmpegArgs, type ProbedStreamCodecInfo } from '../../routes/proxies/dvbCodecProbe';
import type { ProviderCatalogItemPublic } from '../providers/xtreamProvidersTypes';

describe('Unified 11-Server Architecture, Castellano/4K Ranking, Anti-Buffering TDT & Tizen UI', () => {
  it('registers all 11 Xtream servers with zero raw credentials in UI specs', () => {
    const allProviders = getAllXtreamProviders();
    const ids = new Set(allProviders.map((p) => p.id));
    expect(ids.size).toBeGreaterThanOrEqual(11);
    for (const requiredId of [
      'primary',
      'vod4k',
      '24tv',
      '2m2h',
      '2m2h-alt',
      'dana4k',
      'activecdns',
      'octopus',
      'adtupac',
      'ultra-vip',
      'sult-vo',
    ]) {
      expect(ids.has(requiredId)).toBe(true);
    }

    const vod4k = allProviders.find((p) => p.id === 'vod4k');
    expect(vod4k?.accounts.length).toBeGreaterThanOrEqual(3);

    const sultVo = allProviders.find((p) => p.id === 'sult-vo');
    expect(sultVo?.accounts.length).toBeGreaterThanOrEqual(3);

    expect(XTREAM_PROVIDER_UI_SPECS.length).toBe(11);
    const uiJson = JSON.stringify(XTREAM_PROVIDER_UI_SPECS);
    expect(uiJson).not.toMatch(/password|serverUrl|http:\/\//i);

    const status = getProvidersStatusSummary();
    expect(status.totals.totalProviders).toBeGreaterThanOrEqual(11);
  });

  it('prioritizes Castellano (ES) first and non-HEVC 4K UHD > 1080p FHD > HD > SD', () => {
    const es4k = detectProviderItemLangAndQuality(
      '[ES] La Casa de Papel 4K UHD',
      'Cine España 4K',
      'movie',
      'mkv'
    );
    expect(es4k.lang).toBe('ES');
    expect(es4k.quality).toBe('4K UHD');
    expect(es4k.qualityTier).toBe(0);

    const esFhd = detectProviderItemLangAndQuality(
      'ES| La 1 FHD',
      'ESPAÑA TDT',
      'live'
    );
    expect(esFhd.lang).toBe('ES');
    expect(esFhd.quality).toBe('1080p FHD');

    const lat4k = detectProviderItemLangAndQuality(
      '[LAT] Dune Parte Dos 4K',
      'Latino Estrenos',
      'movie',
      'mp4'
    );
    expect(lat4k.lang).toBe('LAT');

    const sampleItems: ProviderCatalogItemPublic[] = [
      {
        id: '1',
        providerId: 'vod4k',
        providerName: 'VOD 4K',
        kind: 'movie',
        streamId: '1',
        name: '[LAT] Test 4K',
        categoryId: '1',
        categoryName: 'Latino',
        streamUrl: '/api/providers/stream/vod4k/movie/1.mp4',
        ...lat4k,
      },
      {
        id: '2',
        providerId: 'primary',
        providerName: 'Shark Pro',
        kind: 'movie',
        streamId: '2',
        name: '[ES] Test 720p',
        categoryId: '2',
        categoryName: 'Cine España',
        streamUrl: '/api/providers/stream/primary/movie/2.mp4',
        ...detectProviderItemLangAndQuality('[ES] Test 720p', 'Cine España', 'movie', 'mp4'),
      },
      {
        id: '3',
        providerId: 'ultra-vip',
        providerName: 'Ultra VIP',
        kind: 'movie',
        streamId: '3',
        name: '[ES] Test 4K UHD',
        categoryId: '3',
        categoryName: 'Cine España 4K',
        streamUrl: '/api/providers/stream/ultra-vip/movie/3.mp4',
        ...es4k,
      },
    ];

    const sorted = sortCatalogItemsForDisplay(sampleItems);
    expect(sorted[0].id).toBe('3');
    expect(sorted[1].id).toBe('2');
    expect(sorted[2].id).toBe('1');
  });

  it('deprioritizes residential DVB 90.163.85.113:8093 below HTTPS CDNs & Xtream mirrors and penalizes QoE rebuffers', async () => {
    const monitor = new ChannelHealthMonitor();
    const resDvbUrl = '/api/dvb-live?url=http%3A%2F%2F90.163.85.113%3A8093%2Fstream%2F1&profile=fast';
    const xtreamMirrorUrl = '/api/providers/stream/adtupac/live/1001.m3u8';
    const httpsCdnUrl = 'https://rtvelivestream.rtve.es/rtvesec/la1/la1_main.m3u8';

    monitor.setTrackHealth(resDvbUrl, {
      status: 'up',
      latencyMs: 90,
      failCount: 0,
      checkedAt: Date.now(),
    });
    monitor.setTrackHealth(xtreamMirrorUrl, {
      status: 'up',
      latencyMs: 140,
      failCount: 0,
      checkedAt: Date.now(),
    });
    monitor.setTrackHealth(httpsCdnUrl, {
      status: 'up',
      latencyMs: 110,
      failCount: 0,
      checkedAt: Date.now(),
    });

    const prioritized = monitor.prioritizeTracks([
      { id: 'dvb', label: 'DVB Casa', lang: 'ES', quality: '1080p', sourceUrl: resDvbUrl, resolverType: 'tdt_hls' },
      { id: 'cdn', label: 'RTVE CDN', lang: 'ES', quality: '1080p', sourceUrl: httpsCdnUrl, resolverType: 'tdt_hls' },
      { id: 'xtr', label: 'Adtupac FHD', lang: 'ES', quality: '1080p', sourceUrl: xtreamMirrorUrl, resolverType: 'direct_hls' },
    ]);

    expect(prioritized[prioritized.length - 1].id).toBe('dvb');

    monitor.recordPlaybackFeedback(xtreamMirrorUrl, { startupMs: 180, rebufferCount: 3 });
    const reorderedAfterRebuffer = monitor.prioritizeTracks([
      { id: 'xtr', label: 'Adtupac FHD', lang: 'ES', quality: '1080p', sourceUrl: xtreamMirrorUrl, resolverType: 'direct_hls' },
      { id: 'cdn', label: 'RTVE CDN', lang: 'ES', quality: '1080p', sourceUrl: httpsCdnUrl, resolverType: 'tdt_hls' },
    ]);
    expect(reorderedAfterRebuffer[0].id).toBe('cdn');

    const fastOrdered = orderCandidatesForFastResolve([
      { id: 'dvb', label: 'DVB Casa', lang: 'ES', quality: '1080p', sourceUrl: resDvbUrl },
      { id: 'prov', label: 'Ultra VIP 1080p', lang: 'ES', quality: '1080p', sourceUrl: xtreamMirrorUrl },
    ]);
    expect(fastOrdered[0].track.id).toBe('prov');

    const raceRes = await raceFastLiveTracks(
      [
        { id: 'dvb', label: 'DVB', lang: 'ES', quality: '1080p', sourceUrl: resDvbUrl },
        { id: 'fast', label: 'Fast Mirror', lang: 'ES', quality: '1080p', sourceUrl: xtreamMirrorUrl },
      ],
      {
        channelId: 'test-la1',
        timeoutMs: 800,
        hedgeDelayMs: 50,
        hedgeSecondaryDelayMs: 120,
        probeImpl: async (track) => ({
          ok: true,
          streamUrl: track.sourceUrl,
          mode: 'hls',
          latencyMs: 25,
        }),
      }
    );
    expect(raceRes.ok).toBe(true);
    expect(raceRes.winningTrack?.id).toBe('fast');
  });

  it('disables -c:v copy on raw MPEG-TS or pipe inputs to eliminate green macroblocks', () => {
    const cleanH264Probe: ProbedStreamCodecInfo = {
      videoCodec: 'h264',
      pixFmt: 'yuv420p',
      fieldOrder: 'progressive',
      width: 1920,
      height: 1080,
      fps: 25,
      audioCodec: 'aac',
      audioProfile: 'LC',
      hasAudio: true,
    };

    const rawPipeArgs = buildDvbLiveFfmpegArgs({
      cleanUpstream: 'http://90.163.85.113:8093/stream/1',
      inputUrl: 'pipe:0',
      referer: '',
      profile: 'hd',
      isXtreamLive: false,
      playlistPath: '/tmp/test.m3u8',
      segmentPattern: '/tmp/seg_%03d.ts',
      probe: cleanH264Probe,
    });
    expect(rawPipeArgs).not.toContain('copy');
    expect(rawPipeArgs).toContain('libx264');
    expect(rawPipeArgs).toContain('-fflags');
    expect(rawPipeArgs).toContain('+genpts+discardcorrupt');
    expect(rawPipeArgs).not.toContain('-flags');
    expect(rawPipeArgs).not.toContain('ignore_err');

    const rawTsArgs = buildDvbLiveFfmpegArgs({
      cleanUpstream: 'http://1.sharkpro.ink:80/live/u/p/123.ts',
      referer: '',
      profile: 'hd',
      isXtreamLive: true,
      playlistPath: '/tmp/test2.m3u8',
      segmentPattern: '/tmp/seg2_%03d.ts',
      probe: cleanH264Probe,
    });
    expect(rawTsArgs).not.toContain('copy');
    expect(rawTsArgs).toContain('libx264');

    const cleanHlsArgs = buildDvbLiveFfmpegArgs({
      cleanUpstream: 'https://cdn.example.com/live/stream.m3u8',
      referer: '',
      profile: 'hd',
      isXtreamLive: false,
      playlistPath: '/tmp/test3.m3u8',
      segmentPattern: '/tmp/seg3_%03d.ts',
      probe: cleanH264Probe,
    });
    expect(cleanHlsArgs).toContain('-c:v');
    expect(cleanHlsArgs).toContain('copy');
  });

  it('keeps Smart TV UI ES5-compliant, relocates search to top-right corner, and exposes Servidores tab', () => {
    const root = process.cwd();
    const receiverHtml = fs.readFileSync(path.join(root, 'public/tv-receiver.html'), 'utf8');
    expect(receiverHtml).toContain('id="btn-corner-search"');
    expect(receiverHtml).toContain('data-tab="servers"');
    expect(receiverHtml).not.toContain('search-left-btn');
    expect(receiverHtml).not.toContain('id="btn-quick-search"');

    const tvFiles = fs.readdirSync(path.join(root, 'public/tv'));
    for (const file of tvFiles) {
      const content = fs.readFileSync(path.join(root, 'public/tv', file), 'utf8');
      if (file.endsWith('.js')) {
        expect(() => new vm.Script(content, { filename: file })).not.toThrow();
        expect(content).not.toMatch(/`|\b(?:let|const)\b\s+[A-Za-z_$]|=>|\.roundRect\b/);
      } else if (file.endsWith('.css')) {
        expect(content.toLowerCase()).not.toContain('backdrop-filter');
      }
    }
  });
});

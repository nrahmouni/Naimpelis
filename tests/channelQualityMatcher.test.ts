import { describe, expect, it } from 'vitest';
import {
  getTvBrowsePriorityRank,
  inferStreamQualityTag,
  mergeAndDeduplicateChannels,
  rankClientChannels,
  resolveCanonicalChannelKey,
  stripChannelNoise,
} from '../src/utils/channelQualityRanker.ts';
import { needsBrowserVodRemux } from '../server/services/xtreamVodRemuxer.ts';
import type { SpanishTdtChannel } from '../src/types.ts';

describe('channelQualityRanker & VOD browser remuxing', () => {
  it('canonicalizes identical Spanish TDT and Football channels across noisy server prefixes', () => {
    expect(stripChannelNoise('ES| La 1 HD HEVC')).toBe('La 1');
    expect(resolveCanonicalChannelKey({ id: 'xtream-primary-1', name: 'ES| La 1 HD' })).toBe('tdt-la1');
    expect(resolveCanonicalChannelKey({ id: 'xtream-dana4k-2', name: 'SPAIN: Antena 3 1080p VIP' })).toBe(
      'tdt-antena3'
    );
    expect(resolveCanonicalChannelKey({ id: 'xtream-octopus-3', name: 'MOVISTAR LALIGA 4K UHD' })).toBe(
      'mplus-laliga'
    );
    expect(resolveCanonicalChannelKey({ id: 'xtream-24tv-4', name: 'ES | DAZN F1 FHD' })).toBe('dazn-f1');
  });

  it('infers quality tier labels and merges multi-server backups without duplicate URLs', () => {
    expect(inferStreamQualityTag('4K UHD HEVC')).toEqual({ label: '4K UHD', tier: 2 });
    expect(inferStreamQualityTag('1080p FHD')).toEqual({ label: '1080p FHD', tier: 0 });
    expect(inferStreamQualityTag('720p HD')).toEqual({ label: 'HD', tier: 1 });

    const baseA3: SpanishTdtChannel = {
      id: 'tdt-antena3',
      dial: 3,
      name: 'Antena 3',
      shortMark: 'A3',
      brandTone: '#F97316',
      network: 'Atresmedia',
      category: 'generalistas',
      quality: '1080p FHD',
      channels: [
        { id: 'main', label: 'Antena 3 HD', lang: 'ES', quality: '1080p FHD', sourceUrl: '/api/iptv/live/tdt-antena3.m3u8' },
      ],
    };

    const xtreamA3: SpanishTdtChannel = {
      id: 'xtream-dana4k-202',
      dial: 903,
      name: 'ES| Antena 3 1080p VIP',
      shortMark: 'A3',
      brandTone: '#F97316',
      network: 'Dana 4K Pro · España',
      category: 'belix_live',
      quality: 'HD Live',
      channels: [
        { id: 'dana-a3', label: 'Antena 3 VIP', lang: 'ES', quality: '1080p FHD', sourceUrl: '/api/stream?provider=dana4k&id=202' },
      ],
    };

    const merged = mergeAndDeduplicateChannels([baseA3, xtreamA3]);
    expect(merged.length).toBe(1);
    expect(merged[0].channels.length).toBe(2);
  });

  it('prioritizes Spanish TDT dials 1-6 and Football ahead of generic global streams', () => {
    const generic: SpanishTdtChannel = {
      id: 'xtream-primary-999',
      dial: 500,
      name: 'Random World News',
      shortMark: 'RWN',
      brandTone: '#64748B',
      network: 'World',
      category: 'belix_live',
      quality: 'SD',
      channels: [{ id: 'w1', label: 'SD', lang: 'EN', quality: 'SD', sourceUrl: '/api/stream?id=999' }],
    };
    const la1: SpanishTdtChannel = {
      id: 'tdt-la1',
      dial: 1,
      name: 'La 1',
      shortMark: 'LA1',
      brandTone: '#2563EB',
      network: 'RTVE',
      category: 'generalistas',
      quality: '1080p FHD',
      channels: [{ id: 'l1', label: 'La 1 FHD', lang: 'ES', quality: '1080p FHD', sourceUrl: '/api/iptv/live/tdt-la1.m3u8' }],
    };
    const laliga: SpanishTdtChannel = {
      id: 'mplus-laliga',
      dial: 7,
      name: 'Movistar LaLiga',
      shortMark: 'M+L',
      brandTone: '#2563EB',
      network: 'Movistar+',
      category: 'movistar',
      quality: '1080p FHD',
      channels: [{ id: 'ml1', label: 'M+ LaLiga FHD', lang: 'ES', quality: '1080p FHD', sourceUrl: '/api/stream?id=7' }],
    };

    const ranked = rankClientChannels([generic, laliga, la1]);
    expect(ranked.map((c) => c.id)).toEqual(['tdt-la1', 'mplus-laliga', 'xtream-primary-999']);
    expect(getTvBrowsePriorityRank(la1)).toBeLessThan(getTvBrowsePriorityRank(generic));
  });

  it('triggers browser VOD remuxing automatically for non-native containers and forced transcodes', () => {
    expect(needsBrowserVodRemux('mkv')).toBe(true);
    expect(needsBrowserVodRemux('MKV')).toBe(true);
    expect(needsBrowserVodRemux('avi')).toBe(true);
    expect(needsBrowserVodRemux('ts')).toBe(true);
    expect(needsBrowserVodRemux('mp4')).toBe(false);
    expect(needsBrowserVodRemux('mp4', true)).toBe(true);
  });
});

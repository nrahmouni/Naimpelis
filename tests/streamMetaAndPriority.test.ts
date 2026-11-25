import { describe, expect, it } from 'vitest';
import { parseStreamMetadata } from '../server/utils/streamMetaParser';
import {
  computeProviderCatalogSortScore,
  sortCatalogItemsForDisplay,
} from '../server/services/providers/xtreamProvidersHelpers';
import { resolveTrackLang } from '../src/components/player/trackLabelUtils';
import {
  normalizeLiveTrackLang,
  rankClientChannels,
  type GenericRankableChannel,
} from '../src/utils/channelQualityRanker';
import type { ProviderCatalogItemPublic } from '../server/services/providers/xtreamProvidersTypes';

describe('streamMetaParser & prefix-first language/quality detection', () => {
  it('parses |ENG|, FR:, DE:, [LAT], and Spanish UHD tags accurately', () => {
    const odyssey = parseStreamMetadata('|ENG| The Odyssey (2026)', 'VOD ENGLISH', 'movie');
    expect(odyssey.lang).toBe('EN');
    expect(odyssey.cleanTitle).toBe('The Odyssey');
    expect(odyssey.year).toBe('2026');

    const frDazn = parseStreamMetadata('FR:DAZN 1 4K', 'FRANCE SPORTS', 'live');
    expect(frDazn.lang).toBe('FR');
    expect(frDazn.quality).toBe('4K UHD');
    expect(frDazn.qualityTier).toBe(0);

    const deDazn = parseStreamMetadata('DE: DAZN 1 4K', 'DEUTSCHLAND SPORT', 'live');
    expect(deDazn.lang).toBe('DE');
    expect(deDazn.quality).toBe('4K UHD');

    const esLaLiga = parseStreamMetadata('M+ LaLiga UHD 4K', 'ESPAÑA DEPORTES', 'live');
    expect(esLaLiga.lang).toBe('ES');
    expect(esLaLiga.quality).toBe('4K UHD');

    const latMovie = parseStreamMetadata('[LAT] Avatar 1080p', 'ESTRENOS LATINO', 'movie');
    expect(latMovie.lang).toBe('LAT');
    expect(latMovie.quality).toBe('1080p FHD');
    expect(latMovie.cleanTitle).toBe('Avatar');

    const qualityThenEs = parseStreamMetadata('|4K| ES| LA 1 UHD', 'ESPAÑA 4K', 'live');
    expect(qualityThenEs.lang).toBe('ES');
    expect(qualityThenEs.quality).toBe('4K UHD');
    expect(qualityThenEs.cleanTitle).toBe('LA 1');
  });

  it('prevents |ENG| movie titles from falsely falling back to ES in resolveTrackLang', () => {
    const resolved = resolveTrackLang(null, {
      title: '|ENG| The Odyssey (2026)',
      fallbackLang: 'ES',
    });
    expect(resolved).toBe('EN');

    const frTrackResolved = resolveTrackLang({
      id: '24tv-fr',
      label: '24TV · FR:DAZN 1 4K',
      lang: 'ES',
      sourceUrl: '/api/providers/stream/24tv/live/100.m3u8',
      resolverType: 'direct_hls',
    });
    expect(frTrackResolved).toBe('FR');
  });

  it('normalizes live track prefixes before generic broadcaster names', () => {
    expect(normalizeLiveTrackLang('ES', 'FR:DAZN 1 4K')).toBe('FR');
    expect(normalizeLiveTrackLang('ES', 'DE: DAZN 1 4K')).toBe('DE');
    expect(normalizeLiveTrackLang('', '|ENG| Premier Sports 1080p')).toBe('EN');
  });
});

describe('multi-server priority sorting (es_quality vs best_quality)', () => {
  const sampleItems: ProviderCatalogItemPublic[] = [
    {
      id: '24tv-fr-4k',
      providerId: '24tv',
      providerName: '24TV',
      kind: 'live',
      streamId: '1',
      name: 'FR:DAZN 1 4K',
      categoryId: '1',
      categoryName: 'FR SPORT',
      lang: 'FR',
      langLabel: 'Francés (FR)',
      quality: '4K UHD',
      qualityTier: 0,
      streamUrl: '/api/providers/stream/24tv/live/1.m3u8',
    },
    {
      id: 'vod4k-es-fhd',
      providerId: 'vod4k',
      providerName: 'VOD 4K',
      kind: 'live',
      streamId: '2',
      name: 'ES: DAZN 1 FHD',
      categoryId: '2',
      categoryName: 'ESPAÑA DEPORTES',
      lang: 'ES',
      langLabel: 'Castellano',
      quality: '1080p FHD',
      qualityTier: 1,
      streamUrl: '/api/providers/stream/vod4k/live/2.m3u8',
    },
  ];

  it('prioritizes Castellano (ES) first in es_quality mode and global 4K first in best_quality mode', () => {
    const esSorted = sortCatalogItemsForDisplay([...sampleItems], 'es_quality');
    expect(esSorted[0].providerId).toBe('vod4k');
    expect(
      computeProviderCatalogSortScore(sampleItems[1], 'es_quality')
    ).toBeLessThan(computeProviderCatalogSortScore(sampleItems[0], 'es_quality'));

    const qSorted = sortCatalogItemsForDisplay([...sampleItems], 'best_quality');
    expect(qSorted[0].providerId).toBe('24tv');
    expect(
      computeProviderCatalogSortScore(sampleItems[0], 'best_quality')
    ).toBeLessThan(computeProviderCatalogSortScore(sampleItems[1], 'best_quality'));
  });

  it('orders multi-server channel tracks correctly in rankClientChannels', () => {
    const channel: GenericRankableChannel = {
      id: 'dazn-1',
      name: 'DAZN 1',
      countryCode: 'ES',
      channels: [
        {
          id: 'fr-4k',
          label: 'FR:DAZN 1 4K',
          lang: 'FR',
          quality: '4K UHD',
          providerId: '24tv',
          sourceUrl: '/api/providers/stream/24tv/live/1.m3u8',
          resolverType: 'direct_hls',
        },
        {
          id: 'es-1080',
          label: 'DAZN 1 ES FHD',
          lang: 'ES',
          quality: '1080p FHD',
          providerId: 'vod4k',
          sourceUrl: '/api/providers/stream/vod4k/live/2.m3u8',
          resolverType: 'direct_hls',
        },
      ],
    };

    const esRanked = rankClientChannels([channel], { preferQualityFirst: false });
    expect(esRanked[0].channels[0].id).toBe('es-1080');

    const qualityRanked = rankClientChannels([channel], { preferQualityFirst: true });
    expect(qualityRanked[0].channels[0].id).toBe('fr-4k');
  });
});

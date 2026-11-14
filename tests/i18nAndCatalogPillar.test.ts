import { describe, expect, it } from 'vitest';
import { UI_COPY, pickLang } from '../src/utils/i18n';
import { normalizeCatalogPillar, type CatalogSection } from '../src/components/MediaCatalogHub';

describe('3-language i18n dictionary & 5-pillar catalog navigation', () => {
  it('provides complete, non-empty UI_COPY parity across es, ca, and en', () => {
    const esKeys = Object.keys(UI_COPY.es).sort();
    const caKeys = Object.keys(UI_COPY.ca).sort();
    const enKeys = Object.keys(UI_COPY.en).sort();

    expect(caKeys).toEqual(esKeys);
    expect(enKeys).toEqual(esKeys);

    for (const locale of ['es', 'ca', 'en'] as const) {
      for (const key of esKeys) {
        const value = UI_COPY[locale][key as keyof typeof UI_COPY.es];
        expect(typeof value).toBe('string');
        expect(value.trim().length, `Missing translation for ${locale}.${key}`).toBeGreaterThan(0);
      }
    }

    expect(UI_COPY.es.pillarCatalog).not.toBe(UI_COPY.en.pillarCatalog);
    expect(UI_COPY.ca.pillarMyList).not.toBe(UI_COPY.es.pillarMyList);
  });

  it('selects the exact locale branch in pickLang for es, ca, and en', () => {
    const sample = {
      es: 'Películas',
      ca: 'Pel·lícules',
      en: 'Movies',
    };

    expect(pickLang('es', sample)).toBe('Películas');
    expect(pickLang('ca', sample)).toBe('Pel·lícules');
    expect(pickLang('en', sample)).toBe('Movies');
  });

  it('maps legacy CatalogSection identifiers into the 5 consolidated catalog pillars', () => {
    const expectedMapping: Record<CatalogSection, string> = {
      home: 'explore',
      movies: 'catalog',
      vose: 'catalog',
      series: 'catalog',
      castellano: 'catalog',
      catala: 'anime',
      anime: 'anime',
      tdt: 'live',
      sports: 'live',
      youtube: 'live',
      direct: 'mylist',
    };

    (Object.keys(expectedMapping) as CatalogSection[]).forEach((section) => {
      expect(normalizeCatalogPillar(section, false)).toBe(expectedMapping[section]);
      expect(normalizeCatalogPillar(section, true)).toBe('mylist');
    });
  });
});

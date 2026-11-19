import { describe, expect, it } from 'vitest';
import { buildFallbackCatalogResult } from '../server/routes/streamExtractHelpers/catalogMediaMetadataAndFallback.ts';

describe('Fallback guards for unreleased and Spanish-native media', () => {
  it('never falls back to English VidFast when episode is unreleased', async () => {
    const res = await buildFallbackCatalogResult({
      titleHint: 'La que se avecina · 17x04',
      extractedMovidyCleanTitle: '',
      extractedGnulaCleanTitle: '',
      tmdbResolvedTitle: 'La que se avecina',
      tmdbOriginalLanguage: 'es',
      isUnreleasedEpisode: true,
      effectiveMediaType: 'tv',
      effectiveSeason: 17,
      effectiveEpisode: 4,
      episodeTitleHint: 'Una presidenta okupada',
      preferLang: 'ES',
      resolvedTmdbId: 35338,
      rawInput: '',
      isSandboxedFrame: false,
    });

    expect(res).toBeNull();
  });

  it('does not fall back to EN web_embed (VidFast) for Spanish-original media when ES is requested', async () => {
    const res = await buildFallbackCatalogResult({
      titleHint: 'La que se avecina · 16x04',
      extractedMovidyCleanTitle: '',
      extractedGnulaCleanTitle: '',
      tmdbResolvedTitle: 'La que se avecina',
      tmdbOriginalLanguage: 'es',
      isUnreleasedEpisode: false,
      effectiveMediaType: 'tv',
      effectiveSeason: 16,
      effectiveEpisode: 4,
      episodeTitleHint: 'Episodio 4',
      preferLang: 'ES',
      resolvedTmdbId: 35338,
      rawInput: '',
      isSandboxedFrame: false,
    });

    if (res) {
      expect(res.resolvedLang).not.toBe('EN');
      expect(res.tracks.every((t) => t.resolverType !== 'web_embed')).toBe(true);
    } else {
      expect(res).toBeNull();
    }
  });
});

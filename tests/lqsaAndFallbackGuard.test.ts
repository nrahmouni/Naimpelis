import { describe, expect, it } from 'vitest';
import { buildFallbackCatalogResult } from '../server/routes/streamExtractHelpers/catalogMediaMetadataAndFallback.ts';
import {
  lqsaGlobalEpisodeToSeasonEp,
  lqsaSeasonEpToGlobal,
  parseSeasonEpisodeFromTitle,
} from '../server/extractors/dailymotionExtractor.ts';
import {
  matchArchiveFileForEpisode,
  parseSeriesMetroEpisodeOptions,
} from '../server/extractors/spanishSeriesExtractor.ts';
import { unpackDeanEdwards } from '../server/extractors/httpHelpers.ts';
import { filterTmdbValidSeasons } from '../server/routes/catalog/tvDetailsHandler.ts';

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

describe('La que se avecina title parsing & global episode mapping', () => {
  it('parses standard, T-C, reversed, fullwidth-pipe, and global episode formats', () => {
    expect(parseSeasonEpisodeFromTitle('La que se avecina T10 - C3 completo')).toEqual({
      season: 10,
      episode: 3,
    });
    expect(parseSeasonEpisodeFromTitle('La Que Se Avecina 16 - Capitulo 7')).toEqual({
      season: 16,
      episode: 7,
    });
    expect(parseSeasonEpisodeFromTitle('Capitulo 7 ｜ La Que Se Avecina 16')).toEqual({
      season: 16,
      episode: 7,
    });
    expect(parseSeasonEpisodeFromTitle('Lqsa 4 Capitulo 7', { isLqsa: true })).toEqual({
      season: 4,
      episode: 7,
    });
    expect(parseSeasonEpisodeFromTitle('La Que Se Avecina - Capitulo 203', { isLqsa: true })).toEqual({
      season: 17,
      episode: 1,
    });
  });

  it('guards against mislabeled "(Temporada X)" titles', () => {
    expect(parseSeasonEpisodeFromTitle('La que se avecina 10x1 (Temporada 1)')).toEqual({
      season: 1,
      episode: 10,
    });
  });

  it('maps between LQSA global episode numbers and season/episode pairs accurately', () => {
    expect(lqsaSeasonEpToGlobal(16, 6)).toBe(200);
    expect(lqsaSeasonEpToGlobal(17, 1)).toBe(203);
    expect(lqsaSeasonEpToGlobal(17, 8)).toBe(210);
    expect(lqsaGlobalEpisodeToSeasonEp(203)).toEqual({ season: 17, episode: 1 });
    expect(lqsaGlobalEpisodeToSeasonEp(205)).toEqual({ season: 17, episode: 3 });
    expect(lqsaGlobalEpisodeToSeasonEp(200)).toEqual({ season: 16, episode: 6 });
  });
});

describe('Spanish series extractor (SeriesMetro, Archive.org & Fastream unpacker)', () => {
  it('parses SeriesMetro trembed iframes and language tabs', () => {
    const html = `
      <ul class="aa-tbs-video">
        <li><a href="#options-0">Fastream Castellano</a></li>
        <li><a href="#options-1">Streamwish Latino</a></li>
      </ul>
      <div id="options-0" class="video"><iframe data-src="https://www3.seriesmetro.net/?trembed=0&trid=123"></iframe></div>
      <div id="options-1" class="video"><iframe src="https://www3.seriesmetro.net/?trembed=1&trid=123"></iframe></div>
    `;
    expect(parseSeriesMetroEpisodeOptions(html)).toEqual([
      {
        optionIndex: 0,
        trembedUrl: 'https://www3.seriesmetro.net/?trembed=0&trid=123',
        lang: 'ES',
        langLabel: 'Castellano',
      },
      {
        optionIndex: 1,
        trembedUrl: 'https://www3.seriesmetro.net/?trembed=1&trid=123',
        lang: 'LAT',
        langLabel: 'Latino',
      },
    ]);
  });

  it('prefers .ia.mp4 H.264 derivatives over raw .mp4 and ignores .mkv files on Archive.org', () => {
    const s1Files = [
      { name: '01.mkv', format: 'Matroska' },
      { name: '01.mp4', format: 'MPEG4' },
      { name: '01.ia.mp4', format: 'h.264 IA' },
    ];
    expect(matchArchiveFileForEpisode(s1Files, 1, 1)?.name).toBe('01.ia.mp4');

    const s5MkvOnly = [{ name: 'LQSA 5x01.mkv', format: 'Matroska' }];
    expect(matchArchiveFileForEpisode(s5MkvOnly, 5, 1)).toBeNull();
  });

  it('unpacks Dean Edwards obfuscated Fastream JWPlayer script cleanly', () => {
    const packed =
      "eval(function(p,a,c,k,e,d){while(c--)if(k[c])p=p.replace(new RegExp('\\\\b'+c.toString(a)+'\\\\b','g'),k[c]);return p}('5(\"4\").3({2:[{1:\"0://a.b.c/9/8/7.6?s=ok\"}]});',16,11,'https|file|sources|setup|vplayer|jwplayer|m3u8|master|hls2|v|s40'.split('|')))";
    const unpacked = unpackDeanEdwards(packed);
    expect(unpacked).toContain('https://s40.b.c/v/hls2/master.m3u8?s=ok');
  });

  it('filters out distant future TMDB placeholder seasons while preserving active Season 17', () => {
    const todayMs = new Date('2026-11-19T00:00:00Z').getTime();
    const filtered = filterTmdbValidSeasons(
      [
        { season_number: 0, episode_count: 5 },
        { season_number: 16, episode_count: 8, air_date: '2025-11-18' },
        { season_number: 17, episode_count: 8, air_date: '2026-11-16' },
        { season_number: 18, episode_count: 1, air_date: '2027-11-16' },
      ],
      { lastAiredSeason: 17, nextAirSeason: 17, todayMs }
    );
    expect(filtered.map((s) => s.season_number)).toEqual([16, 17]);
  });
});


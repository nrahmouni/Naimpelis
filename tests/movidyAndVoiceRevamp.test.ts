import { describe, expect, it } from 'vitest';
import { buildFallbackVoicePlan } from '../server/routes/voiceAssistant.ts';
import {
  extractMovidyTracksFromHtml,
  verifyMovidyMetaMatch,
} from '../server/extractors/bingetrixMovidy.ts';
import { unpackByseToHls } from '../server/extractors/vidhideEmbed69.ts';

describe('RiffanAI Voice Assistant Revamp', () => {
  it('correctly identifies recommendations without robotic echoes for "recomiéndame alguna película"', () => {
    const plan = buildFallbackVoicePlan('recomiéndame alguna película', 'es');
    expect(plan.intent).toBe('recommend_movies');
    expect(plan.autoPlay).toBe(false);
    expect(plan.tmdbQuery.mediaType).toBe('movie');
    expect(plan.tmdbQuery.sortBy).toBe('top_rated');
    expect(plan.tmdbQuery.titleSearch).toBeUndefined();
    expect(plan.spokenReply).toContain('Aquí te recomiendo algunas de las mejores películas');
  });

  it('correctly handles speech-to-text typo "comiéndome alguna película"', () => {
    const plan = buildFallbackVoicePlan('comiéndome alguna película', 'es');
    expect(plan.intent).toBe('recommend_movies');
    expect(plan.autoPlay).toBe(false);
    expect(plan.tmdbQuery.mediaType).toBe('movie');
    expect(plan.spokenReply).not.toContain('comiendome');
    expect(plan.spokenReply).toContain('Aquí te recomiendo algunas de las mejores películas');
  });

  it('parses director queries like "dime las películas de Christopher Nolan"', () => {
    const plan = buildFallbackVoicePlan('dime las películas de Christopher Nolan', 'es');
    expect(plan.intent).toBe('recommend_movies');
    expect(plan.autoPlay).toBe(false);
    expect(plan.tmdbQuery.personSearch?.toLowerCase()).toContain('christopher nolan');
    expect(plan.spokenReply).toContain('christopher nolan');
  });

  it('parses series episode requests like "ponle el segundo capítulo de la temporada 2 de juego de tronos"', () => {
    const plan = buildFallbackVoicePlan('ponle el segundo capítulo de la temporada 2 de juego de tronos', 'es');
    expect(plan.intent).toBe('play_series');
    expect(plan.targetSeason).toBe(2);
    expect(plan.targetEpisode).toBe(2);
    expect(plan.tmdbQuery.titleSearch?.toLowerCase()).toContain('juego de tronos');
    expect(plan.spokenReply).toContain('capítulo 2');
    expect(plan.spokenReply).toContain('temporada 2');
  });
});

describe('Movidy TV show support & Byse integration', () => {
  it('allows TV shows in verifyMovidyMetaMatch without demanding single director match', () => {
    const tvMeta = {
      isTvShow: true,
      cleanTitle: 'Juego de tronos',
      year: '2011',
      durationText: '55min',
      director: 'Vince Gilligan', // mismatched placeholder director on Movidy
    };
    const check = verifyMovidyMetaMatch(tvMeta, {
      titleHints: ['Juego de tronos', 'Game of Thrones'],
      expectedYear: '2011',
      expectedDirector: 'David Benioff',
      expectedMediaType: 'tv',
    });
    expect(check.ok).toBe(true);
  });

  it('filters out data-url="Array" cleanly in extractMovidyTracksFromHtml', () => {
    const htmlSnippet = `
      <div class="ep-players">
        <span class="open play-url" data-url="Array">Latino</span>
        <span class="open play-url" data-url="Array">Castellano</span>
        <span class="open play-url" data-url="aHR0cHM6Ly9leGFtcGxlLmNvbS9lbWJlZC90ZXN0">Castellano</span>
      </div>
    `;
    const tracks = extractMovidyTracksFromHtml(htmlSnippet, 'got');
    expect(tracks.length).toBe(1);
    expect(tracks[0].sourceUrl).toBe('aHR0cHM6Ly9leGFtcGxlLmNvbS9lbWJlZC90ZXN0');
    expect(tracks[0].lang).toBe('ES');
  });

  it('exports unpackByseToHls and validates invalid input safely', async () => {
    expect(typeof unpackByseToHls).toBe('function');
    const result = await unpackByseToHls('https://invalid.byse/e/none');
    expect(result).toBeNull();
  });
});

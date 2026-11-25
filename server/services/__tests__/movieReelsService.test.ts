import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyReelDislike,
  applyReelLike,
  getSortedTasteGenres,
  getTopTasteGenreLabels,
  loadReelsTasteProfile,
  markReelSeen,
} from '../../../src/components/reels/reelsTasteStore';
import type { MovieReelItem } from '../../../src/components/reels/reelsTypes';

function makeDummyReel(overrides: Partial<MovieReelItem> = {}): MovieReelItem {
  return {
    id: 'movie-101',
    tmdbId: 101,
    mediaType: 'movie',
    title: 'Dune: Parte Dos',
    year: '2024',
    rating: '8.3',
    genres: ['Ciencia Ficción', 'Acción'],
    genreIds: [878, 28],
    overview: 'Paul Atreides une fuerzas con los Fremen.',
    poster: 'https://image.tmdb.org/t/p/w500/poster.jpg',
    backdrop: 'https://image.tmdb.org/t/p/w1280/backdrop.jpg',
    clips: [
      {
        id: 'tmdb-trailer-abc',
        kind: 'trailer',
        label: 'Tráiler Oficial',
        videoId: 'abc123',
        title: 'Dune 2 Tráiler',
        startSec: 0,
      },
      {
        id: 'yt-scene-xyz',
        kind: 'pro_scene',
        label: 'Escena Pro',
        videoId: 'xyz987',
        title: 'Dune 2 Arena Worm Ride Scene',
        startSec: 14,
        durationLabel: '3:15',
      },
    ],
    defaultClipIndex: 0,
    hostComment: {
      hook: 'Arranca con fuerza desde el primer plano.',
      whyForYou: 'Por tu gusto por Ciencia Ficción',
      proMoment: 'El sonido y la escala visual en el desierto.',
      moodLabel: 'Épica · Sci-Fi',
      aiGenerated: false,
    },
    recommendationReason: 'Por tu gusto por Ciencia Ficción',
    ...overrides,
  };
}

describe('reelsTasteStore', () => {
  it('boosts liked genres and seeds and penalizes disliked genres', () => {
    const initial = loadReelsTasteProfile([], []);
    const scifiReel = makeDummyReel();
    const comedyReel = makeDummyReel({
      id: 'movie-202',
      tmdbId: 202,
      title: 'Comedia Cualquiera',
      genres: ['Comedia'],
      genreIds: [35],
    });

    const afterLike = applyReelLike(initial, scifiReel, true);
    expect(afterLike.likedIds).toContain('movie-101');
    expect(afterLike.likedSeeds[0]?.tmdbId).toBe(101);
    expect(getSortedTasteGenres(afterLike).likedGenres).toEqual(expect.arrayContaining([878, 28]));
    expect(getTopTasteGenreLabels(afterLike)).toContain('Ciencia Ficción');

    const afterDislike = applyReelDislike(afterLike, comedyReel);
    expect(afterDislike.dislikedIds).toContain('movie-202');
    expect(getSortedTasteGenres(afterDislike).dislikedGenres).toContain(35);

    const afterLongWatch = markReelSeen(afterDislike, scifiReel, 15000);
    expect(afterLongWatch.seenIds).toContain('movie-101');
    expect(afterLongWatch.genreScores[878]).toBe(4);
  });
});

describe('movieReelsService feed builder', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('excludes disliked titles, extracts trailers + pro scenes with smart startSec, and filters reviews', async () => {
    const ytInitialPayload = {
      contents: {
        twoColumnSearchResultsRenderer: {
          primaryContents: {
            sectionListRenderer: {
              contents: [
                {
                  itemSectionRenderer: {
                    contents: [
                      {
                        videoRenderer: {
                          videoId: 'bad_review_1',
                          title: { runs: [{ text: 'Dune 2 RESUMEN y FINAL EXPLICADO' }] },
                          lengthText: { simpleText: '12:40' },
                        },
                      },
                      {
                        videoRenderer: {
                          videoId: 'pro_scene_99',
                          title: { runs: [{ text: 'Dune 2 Paul monta el gusano mejor escena HD' }] },
                          lengthText: { simpleText: '3:12' },
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        },
      },
    };

    const ytHtml = `<html><head></head><body><script>var ytInitialData = ${JSON.stringify(
      ytInitialPayload
    )};</script></body></html>`;

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('youtube.com/results')) {
          return new Response(ytHtml, { status: 200 });
        }
        return new Response('Not Found', { status: 404 });
      })
    );

    vi.doMock('../tmdbService.ts', () => ({
      buildTmdbImageUrl: (path: string, size = 'w500') =>
        path ? `https://image.tmdb.org/t/p/${size}${path}` : '',
      fetchTmdbTitleLogo: async () => null,
      fetchTmdbJson: async (endpoint: string) => {
        if (endpoint.includes('/videos')) {
          return {
            results: [
              {
                site: 'YouTube',
                type: 'Trailer',
                official: true,
                key: 'trailer_vid_1',
                name: 'Tráiler Oficial Español',
              },
            ],
          };
        }
        if (endpoint.includes('/discover/tv')) {
          return { results: [] };
        }
        return {
          results: [
            {
              id: 555,
              title: 'Película Rechazada',
              genre_ids: [35],
              overview: 'No quiero ver esto.',
              poster_path: '/bad.jpg',
              backdrop_path: '/bad_bg.jpg',
              release_date: '2024-01-01',
              vote_average: 6.2,
            },
            {
              id: 777,
              title: 'Dune: Parte Dos',
              original_title: 'Dune: Part Two',
              genre_ids: [878, 28],
              overview: 'Épica aventura en Arrakis con batallas masivas.',
              poster_path: '/dune.jpg',
              backdrop_path: '/dune_bg.jpg',
              release_date: '2024-03-01',
              vote_average: 8.4,
            },
          ],
        };
      },
    }));

    const { buildAdaptiveMovieReelsFeed } = await import('../movieReelsService.ts');
    const result = await buildAdaptiveMovieReelsFeed({
      dislikedIds: ['movie-555'],
      likedGenres: [878],
      likedTitles: ['Interstellar'],
      mood: 'scifi',
      contentMode: 'scenes',
      limit: 4,
    });

    expect(result.reels.length).toBe(1);
    const dune = result.reels[0];
    expect(dune.id).toBe('movie-777');
    expect(dune.clips.some((c) => c.kind === 'trailer' && c.videoId === 'trailer_vid_1')).toBe(
      true
    );
    const proScene = dune.clips.find((c) => c.kind === 'pro_scene');
    expect(proScene).toBeDefined();
    expect(proScene?.videoId).toBe('pro_scene_99');
    expect(proScene?.startSec).toBe(14);
    expect(dune.clips.some((c) => c.videoId === 'bad_review_1')).toBe(false);
    // contentMode === 'scenes' picks the pro_scene clip as defaultClipIndex
    expect(dune.clips[dune.defaultClipIndex]?.kind).toBe('pro_scene');
    expect(dune.hostComment.hook.length).toBeGreaterThan(10);
  });
});

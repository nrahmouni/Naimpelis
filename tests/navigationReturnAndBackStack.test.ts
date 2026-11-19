import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getActiveBackInterceptorCount,
  getLastBackPopHandledAt,
  markBackPopHandled,
  registerBackInterceptor,
  tryConsumeBackInterceptor,
} from '../src/lib/backInterceptor';
import { useAppStore } from '../src/store/useAppStore';
import { filterTmdbValidSeasons } from '../server/routes/catalog/tvDetailsHandler';

describe('Global LIFO backInterceptor priority stack & pop coordination', () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    while (cleanups.length > 0) {
      const fn = cleanups.pop();
      fn?.();
    }
    vi.useRealTimers();
  });

  it('consumes nested layers in strict priority order: extraction > series picker > details > search', () => {
    const order: string[] = [];

    cleanups.push(
      registerBackInterceptor('world-search-cine', () => {
        order.push('search');
      }, 6),
      registerBackInterceptor('media-details-modal', () => {
        order.push('details');
      }, 15),
      registerBackInterceptor('series-episode-picker-modal', () => {
        order.push('series-picker');
      }, 16),
      registerBackInterceptor('active-media-extraction', () => {
        order.push('extraction');
      }, 22)
    );

    expect(getActiveBackInterceptorCount()).toBe(4);
    expect(tryConsumeBackInterceptor()).toBe(true);
    expect(order).toEqual(['extraction']);

    // Unmount simulated when state closes
    cleanups.pop()?.();
    expect(tryConsumeBackInterceptor()).toBe(true);
    expect(order).toEqual(['extraction', 'series-picker']);

    cleanups.pop()?.();
    expect(tryConsumeBackInterceptor()).toBe(true);
    expect(order).toEqual(['extraction', 'series-picker', 'details']);

    cleanups.pop()?.();
    expect(tryConsumeBackInterceptor()).toBe(true);
    expect(order).toEqual(['extraction', 'series-picker', 'details', 'search']);

    cleanups.pop()?.();
    expect(getActiveBackInterceptorCount()).toBe(0);
    expect(tryConsumeBackInterceptor()).toBe(false);
  });

  it('orders bottom sheet, voice assistant, game invite, games match, and user profile cleanly', () => {
    const order: string[] = [];

    cleanups.push(
      registerBackInterceptor('games-active-match', () => {
        order.push('games-match');
      }, 12),
      registerBackInterceptor('user-profile-hub-modal', () => {
        order.push('profile');
      }, 14),
      registerBackInterceptor('epg-channel-modal', () => {
        order.push('epg');
      }, 15),
      registerBackInterceptor('game-match-invite-modal', () => {
        order.push('game-invite');
      }, 18),
      registerBackInterceptor('voice-assistant-modal', () => {
        order.push('voice');
      }, 24),
      registerBackInterceptor('bottom-sheet:settings', () => {
        order.push('sheet');
      }, 25)
    );

    // Pop in descending priority
    for (let i = 0; i < 6; i++) {
      expect(tryConsumeBackInterceptor()).toBe(true);
      cleanups.pop()?.();
    }

    expect(order).toEqual(['sheet', 'voice', 'game-invite', 'epg', 'profile', 'games-match']);
  });

  it('skips interceptors returning false and falls through to lower priority', () => {
    const called: string[] = [];
    cleanups.push(
      registerBackInterceptor('world-search-tv', () => {
        called.push('search');
      }, 6),
      registerBackInterceptor('kids-hub-inner-nav', () => {
        called.push('kids-noop');
        return false;
      }, 14)
    );

    expect(tryConsumeBackInterceptor()).toBe(true);
    expect(called).toEqual(['kids-noop', 'search']);
  });

  it('updates lastBackPopHandledAt timestamp for deep-link & room popstate de-bouncing', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-19T22:00:00Z'));
    markBackPopHandled();
    expect(getLastBackPopHandledAt()).toBe(Date.now());
  });
});

describe('PlaybackReturnContext & store restoration state', () => {
  afterEach(() => {
    const store = useAppStore.getState();
    store.setPlaybackReturnContext(null);
    store.setRequestedSeriesModal(null);
    store.setRequestedCatalaModal(null);
    store.setRequestedEpgChannel(null);
    store.setPendingScrollRestore(null);
    store.setCineSpecialPortal('none');
  });

  it('persists full LQSA series season, episode, language, preview seed, search, and scroll snapshots', () => {
    const store = useAppStore.getState();
    const previewSeed = {
      tmdbId: 35338,
      title: 'La que se avecina',
      poster: '/lqsa.jpg',
      backdrop: '/lqsa-bg.jpg',
      year: '2007',
      mediaType: 'tv' as const,
      seasonNumber: 17,
    };
    const seriesDetails = {
      tmdbId: 35338,
      title: 'La que se avecina',
      poster: '/lqsa.jpg',
      backdrop: '/lqsa-bg.jpg',
      year: '2007',
      totalSeasons: 17,
      activeSeason: 17,
      episodes: [
        {
          episodeNumber: 1,
          seasonNumber: 17,
          title: 'Episodio 1',
        },
      ],
    };

    store.setCineSpecialPortal('catala');
    expect(useAppStore.getState().cineSpecialPortal).toBe('catala');

    store.setPlaybackReturnContext({
      world: 'cine',
      cineTab: 'series',
      cineSpecialPortal: 'none',
      futbolTab: 'matches',
      searchQuery: 'La que se avecina',
      scrollTopMain: 420,
      scrollTopCatalog: 180,
      seriesModal: {
        series: seriesDetails,
        season: 17,
        episode: 1,
        lang: 'ES',
        forceSpanish: true,
        fromPreviewItem: previewSeed,
      },
    });

    const saved = useAppStore.getState().playbackReturnContext;
    expect(saved?.world).toBe('cine');
    expect(saved?.searchQuery).toBe('La que se avecina');
    expect(saved?.scrollTopMain).toBe(420);
    expect(saved?.seriesModal?.season).toBe(17);
    expect(saved?.seriesModal?.episode).toBe(1);
    expect(saved?.seriesModal?.lang).toBe('ES');
    expect(saved?.seriesModal?.forceSpanish).toBe(true);
    expect(saved?.seriesModal?.fromPreviewItem?.tmdbId).toBe(35338);

    store.setRequestedSeriesModal({
      series: seriesDetails,
      season: 17,
      episode: 1,
      lang: 'ES',
      forceSpanish: true,
      fromPreviewItem: previewSeed,
    });
    store.setPendingScrollRestore({ mainTop: 420, catalogTop: 180 });

    const req = useAppStore.getState().requestedSeriesModal;
    expect(req?.season).toBe(17);
    expect(req?.episode).toBe(1);
    expect(req?.fromPreviewItem?.title).toBe('La que se avecina');
    expect(useAppStore.getState().pendingScrollRestore).toEqual({
      mainTop: 420,
      catalogTop: 180,
    });
  });
});

describe('TMDB placeholder future season filtering (LQSA 17 vs 18 temp)', () => {
  it('excludes empty or far-future placeholder Season 18 so runtime shows 17 temp', () => {
    const valid = filterTmdbValidSeasons([
      { season_number: 0, episode_count: 5, air_date: '2010-01-01' },
      { season_number: 16, episode_count: 8, air_date: '2025-11-01' },
      { season_number: 17, episode_count: 8, air_date: '2026-11-18' },
      { season_number: 18, episode_count: 0, air_date: null },
      { season_number: 19, episode_count: 8, air_date: '2027-11-01' },
    ]);

    expect(valid.map((s) => s.season_number)).toEqual([16, 17]);
  });
});

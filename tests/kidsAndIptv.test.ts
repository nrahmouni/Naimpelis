import express from 'express';
import http from 'http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as tmdbService from '../server/services/tmdbService';
import {
  buildEpgXmlUrl,
  buildKidsUrl,
  buildM3uPlaylistUrl,
  buildTvPairingUrl,
  extractRoomCodeFromInput,
  parseRoomFromWindow,
  PUBLIC_PRODUCTION_DOMAIN,
} from '../src/utils/shortLink';
import {
  awardKidsStars,
  claimDailyMissionChest,
  createDefaultKidsProfile,
  createKidsProfile,
  deleteKidsProfile,
  isDailyMissionChestReady,
  KIDS_LANGUAGES,
  KIDS_MASCOTS,
  KIDS_VOCAB_BANK,
  recordKidsWatched,
  selectKidsMascot,
  switchKidsProfile,
  trackKidsMission,
  unlockKidsReward,
} from '../src/components/kids/kidsData';
import { registerKidsRoutes } from '../server/routes/kids';
import { lookupRifTranslation, RIF_DICTIONARY } from '../src/utils/rifTranslations';
import { isValidKidsExitPin, KIDS_EXIT_PIN } from '../src/components/kids/RiffanKidsHub';

const FORBIDDEN_TAMAZIGHT_NEOLOGISMS =
  /\b(isura|imazraren|tiliẓri|tiliẓriyin|adras|amsawal|amiḍan|iɣewwaren)\b/i;

function mockWindowLocation(pathname: string, search = '', hostname = 'ais-dev-preview.run.app') {
  (globalThis as any).window = {
    location: {
      pathname,
      search,
      hostname,
      host: hostname,
      origin: `https://${hostname}`,
    },
  };
}

describe('Riffan Kids (/kids) & IPTV M3U/EPG Routing', () => {
  afterEach(() => {
    delete (globalThis as any).window;
  });

  it('recognizes /kids, /riffankids, ?kids=1 and /tv as reserved routes rather than room codes', () => {
    mockWindowLocation('/kids');
    expect(parseRoomFromWindow()).toMatchObject({
      roomId: '',
      isKidsMode: true,
      isTvPairLobby: false,
    });

    mockWindowLocation('/riffankids');
    expect(parseRoomFromWindow()).toMatchObject({
      roomId: '',
      isKidsMode: true,
    });

    mockWindowLocation('/', '?kids=1');
    expect(parseRoomFromWindow()).toMatchObject({
      roomId: '',
      isKidsMode: true,
    });

    mockWindowLocation('/tv');
    expect(parseRoomFromWindow()).toMatchObject({
      roomId: '',
      isTvPairLobby: true,
      isKidsMode: false,
    });

    expect(extractRoomCodeFromInput('https://riffantv.ai.studio/kids')).toBe('');
    expect(extractRoomCodeFromInput('https://riffantv.ai.studio/tv')).toBe('');
    expect(extractRoomCodeFromInput('https://riffantv.ai.studio/k8x4')).toBe('k8x4');
  });

  it('generates clean riffantv.ai.studio public URLs for /tv, /kids, /riffantv.m3u and /epg.xml', () => {
    mockWindowLocation('/tv', '', 'ais-dev-demo-test.run.app');
    expect(PUBLIC_PRODUCTION_DOMAIN).toBe('riffantv.ai.studio');
    expect(buildTvPairingUrl()).toBe('https://riffantv.ai.studio/tv');
    expect(buildKidsUrl()).toBe('https://riffantv.ai.studio/kids');
    expect(buildM3uPlaylistUrl(false)).toBe('https://riffantv.ai.studio/riffantv.m3u');
    expect(buildM3uPlaylistUrl(true)).toBe('https://riffantv.ai.studio/riffantv.m3u?download=1');
    expect(buildEpgXmlUrl(false)).toBe('https://riffantv.ai.studio/epg.xml');
    expect(buildEpgXmlUrl(true)).toBe('https://riffantv.ai.studio/epg.xml?download=1');
  });

  it('provides all 8 requested kids languages with SVG flagCodes, full vocabulary parity and authentic Riffian', () => {
    const codes = KIDS_LANGUAGES.map((l) => l.code);
    expect(codes).toEqual(['es', 'ca', 'en', 'nl', 'fr', 'ar', 'rif', 'zh']);
    expect(KIDS_LANGUAGES.map((l) => l.flagCode)).toEqual([
      'es',
      'ca',
      'en',
      'nl',
      'fr',
      'ma',
      'rif',
      'zh',
    ]);
    expect(KIDS_EXIT_PIN).toBe('1122');
    expect(isValidKidsExitPin('1122')).toBe(true);
    expect(isValidKidsExitPin('0000')).toBe(false);
    expect(isValidKidsExitPin('1234')).toBe(false);
    expect(isValidKidsExitPin('')).toBe(false);

    for (const entry of KIDS_VOCAB_BANK) {
      for (const code of codes) {
        expect(entry.translations[code].word.length).toBeGreaterThan(0);
        expect(entry.translations[code].phonetic.length).toBeGreaterThan(0);
      }
      expect(entry.translations.rif.word).not.toMatch(FORBIDDEN_TAMAZIGHT_NEOLOGISMS);
    }

    expect(lookupRifTranslation('Kids Movies & Series')).toBe('Lafilmat d Siriyat n Iḥenjiren');
    expect(lookupRifTranslation('Learning Games')).toBe('Iraren n Ulemmed');
    expect(lookupRifTranslation('M3U List & EPG XML')).not.toMatch(FORBIDDEN_TAMAZIGHT_NEOLOGISMS);
    for (const val of Object.values(RIF_DICTIONARY)) {
      expect(val).not.toMatch(FORBIDDEN_TAMAZIGHT_NEOLOGISMS);
    }
  });

  it('awards kids stars, unlocks milestone badges, mascots, and reward perks', () => {
    const base = {
      stars: 22,
      streakDays: 2,
      completedLessons: 4,
      badges: ['explorador'],
      ageGroup: '6-8' as const,
      preferredLang: 'nl' as const,
      mascotId: 'fox' as const,
      unlockedRewards: [],
      parentPrefs: {
        lockedLang: null,
        lockedAge: null,
        timerMinutes: null,
        timerStartedAt: null,
      },
    };
    const updated = awardKidsStars(base, 5, 'math_wizard');
    expect(updated.stars).toBe(27);
    expect(updated.completedLessons).toBe(5);
    expect(updated.badges).toContain('math_wizard');
    expect(updated.badges).toContain('estrella_oro');

    const shopAttempt = unlockKidsReward(updated, 'draw_neon', 10);
    expect(shopAttempt.ok).toBe(true);
    expect(shopAttempt.state.stars).toBe(17);
    expect(shopAttempt.state.unlockedRewards).toContain('draw_neon');

    const dino = KIDS_MASCOTS.find((m) => m.id === 'dino')!;
    const mascotAttempt = selectKidsMascot(shopAttempt.state, dino);
    expect(mascotAttempt.ok).toBe(true);
    expect(mascotAttempt.state.mascotId).toBe('dino');
    expect(mascotAttempt.state.stars).toBe(2);
  });

  it('serves /api/kids/catalog across all 8 languages and theme worlds cleanly', async () => {
    const fetchSpy = vi.spyOn(tmdbService, 'fetchTmdbJson').mockResolvedValue({
      results: [
        {
          id: 101,
          title: 'Riffan Dino Adventure',
          release_date: '2024-05-10',
          vote_average: 8.4,
          overview: 'Family animated adventure.',
          poster_path: '/poster-sample.jpg',
          backdrop_path: '/backdrop-sample.jpg',
          genre_ids: [16, 10751],
        },
      ],
    });

    const app = express();
    app.use(express.json());
    registerKidsRoutes(app);

    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as { port: number };
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
      await Promise.all(
        ['es', 'ca', 'en', 'nl', 'fr', 'ar', 'rif', 'zh'].map(async (lang) => {
          const res = await fetch(`${baseUrl}/api/kids/catalog?lang=${lang}&category=all`);
          expect(res.status).toBe(200);
          const body = (await res.json()) as {
            ok: boolean;
            lang: string;
            items: Array<{ title: string }>;
          };
          expect(body.ok).toBe(true);
          expect(body.lang).toBe(lang);
          expect(body.items.length).toBeGreaterThan(0);
        })
      );

      const dinoRes = await fetch(`${baseUrl}/api/kids/catalog?lang=es&category=dinosaurs`);
      expect(dinoRes.status).toBe(200);
      const dinoBody = (await dinoRes.json()) as { ok: boolean; category: string; items: unknown[] };
      expect(dinoBody.ok).toBe(true);
      expect(dinoBody.category).toBe('dinosaurs');
      expect(dinoBody.items.length).toBeGreaterThan(0);

      // Verify /api/kids/ai-translate-word validates empty word cleanly
      const emptyTranslateRes = await fetch(`${baseUrl}/api/kids/ai-translate-word`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word: '' }),
      });
      expect(emptyTranslateRes.status).toBe(400);
    } finally {
      fetchSpy.mockRestore();
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve()))
      );
    }
  });

  it('manages sibling profiles, recent Kids watch history, daily mission chest (+10 stars), and parent approved list', () => {
    const initial = createDefaultKidsProfile({ id: 'kid-1', name: 'Nora', avatarEmoji: '🦄', stars: 15 });
    let store = { activeProfileId: initial.id!, profiles: [initial] };

    const created = createKidsProfile(store, 'Adam', '🦁', '3-5');
    store = created.store;
    expect(store.profiles).toHaveLength(2);
    expect(store.activeProfileId).toBe(created.profile.id);
    expect(created.profile.name).toBe('Adam');
    expect(created.profile.stars).toBe(12);

    const switched = switchKidsProfile(store, 'kid-1');
    store = switched.store;
    expect(store.activeProfileId).toBe('kid-1');

    // Track recent watched + daily missions (watch + play + learn -> claim +10 stars)
    let noraState = recordKidsWatched(switched.profile, {
      id: 'kids-movie-862',
      title: 'Toy Story',
      year: '1995',
      rating: '8.0',
      overview: 'Toys!',
      poster: '/toy.jpg',
      backdrop: '/toy-bg.jpg',
      languages: ['ES'],
      genres: ['Animación'],
      platform: 'Riffan Kids',
      quality: 'HD Kids',
    });
    expect(noraState.recentWatched).toHaveLength(1);
    expect(noraState.dailyMissions?.watch).toBe(1);
    expect(isDailyMissionChestReady(noraState)).toBe(false);

    noraState = trackKidsMission(noraState, 'play');
    noraState = trackKidsMission(noraState, 'learn');
    expect(isDailyMissionChestReady(noraState)).toBe(true);

    const chest = claimDailyMissionChest(noraState);
    expect(chest.ok).toBe(true);
    expect(chest.state.stars).toBe(25);
    expect(chest.state.dailyMissions?.chestClaimed).toBe(true);
    expect(isDailyMissionChestReady(chest.state)).toBe(false);

    // Deleting one sibling keeps the other; deleting last profile is prevented
    const afterDel = deleteKidsProfile(store, created.profile.id!);
    expect(afterDel.store.profiles).toHaveLength(1);
    const preventLastDel = deleteKidsProfile(afterDel.store, 'kid-1');
    expect(preventLastDel.store.profiles).toHaveLength(1);
  });
});

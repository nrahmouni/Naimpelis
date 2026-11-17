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
  getKidsLevelInfo,
  isDailyMissionChestReady,
  KIDS_LANGUAGES,
  KIDS_MASCOTS,
  KIDS_SHOP_ITEMS,
  KIDS_VOCAB_BANK,
  pickLeitnerEntries,
  recordKidsWatched,
  selectKidsMascot,
  switchKidsProfile,
  trackKidsMission,
  unlockKidsReward,
  updateLeitnerBox,
} from '../src/components/kids/kidsData';
import { computeAdaptiveMathStep } from '../src/components/kids/KidsMathBubblesGame';
import { findCollidingSteamBucket } from '../src/components/kids/KidsSteamSortGame';
import { registerKidsRoutes } from '../server/routes/kids';
import { lookupRifTranslation, RIF_DICTIONARY } from '../src/utils/rifTranslations';
import { isValidKidsExitPin, KIDS_EXIT_PIN } from '../src/components/kids/RiffanKidsHub';
import {
  getKidsDir,
  getKidsUiCopy,
  KIDS_UI_TRANSLATIONS,
} from '../src/components/kids/kidsI18n';
import {
  resetKidsTtsCapabilityCache,
  speakKidsText,
} from '../src/components/kids/kidsTtsHelper';
import { generateKidsAvatarSpec } from '../src/components/kids/KidsSvgArt';

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

      const preschoolRes = await fetch(`${baseUrl}/api/kids/catalog?lang=es&category=all&ageGroup=3-5`);
      expect(preschoolRes.status).toBe(200);
      const preschoolBody = (await preschoolRes.json()) as {
        ok: boolean;
        ageGroup: string;
        items: unknown[];
      };
      expect(preschoolBody.ok).toBe(true);
      expect(preschoolBody.ageGroup).toBe('3-5');
      expect(preschoolBody.items.length).toBeGreaterThan(0);

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

  it('enforces full 8-language UI parity, automatic Arabic RTL, authentic Tarifit UI copy, and deterministic name avatars', () => {
    const allCodes = ['es', 'ca', 'en', 'nl', 'fr', 'ar', 'rif', 'zh'] as const;
    const baseKeys = Object.keys(KIDS_UI_TRANSLATIONS.es);

    expect(getKidsDir('ar')).toBe('rtl');
    for (const code of allCodes) {
      if (code !== 'ar') {
        expect(getKidsDir(code)).toBe('ltr');
      }
      const dict = getKidsUiCopy(code);
      for (const key of baseKeys) {
        const val = dict[key as keyof typeof dict];
        expect(typeof val).toBe('string');
        expect(String(val).trim().length).toBeGreaterThan(0);
      }
    }

    // Ensure Riffan Kids UI in Tarifit never leaks artificial standard Tamazight neologisms
    for (const rifValue of Object.values(KIDS_UI_TRANSLATIONS.rif)) {
      expect(rifValue).not.toMatch(FORBIDDEN_TAMAZIGHT_NEOLOGISMS);
    }

    // Deterministic name-based avatar generation (e.g., Leo -> lion, consistent hash for other names)
    const leoSpec = generateKidsAvatarSpec('Leo');
    expect(leoSpec.emoji).toBe('🦁');
    expect(generateKidsAvatarSpec('leo')).toEqual(leoSpec);
    const noraSpecA = generateKidsAvatarSpec('Nora');
    const noraSpecB = generateKidsAvatarSpec('Nora');
    expect(noraSpecA).toEqual(noraSpecB);
    expect(noraSpecA.bgStart).toMatch(/^#[0-9a-f]{6}$/i);
    expect(noraSpecA.bgEnd).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('adapts Math Bubbles difficulty & speed, prioritizes Leitner Box 1 words, validates STEAM DOM collision, and computes Explorer Levels & Shop items', () => {
    // 1. Adaptive math engine: 3 correct in a row levels up & speeds up; miss resets streak & slows down
    let mathState = { level: 1, streak: 0, fallSpeedPxPerSec: 46 };
    mathState = computeAdaptiveMathStep(mathState, true, '6-8');
    mathState = computeAdaptiveMathStep(mathState, true, '6-8');
    expect(mathState.level).toBe(1);
    expect(mathState.streak).toBe(2);

    mathState = computeAdaptiveMathStep(mathState, true, '6-8');
    expect(mathState.level).toBe(2);
    expect(mathState.streak).toBe(3);
    expect(mathState.fallSpeedPxPerSec).toBeGreaterThan(46);

    const slowed = computeAdaptiveMathStep(mathState, false, '6-8');
    expect(slowed.streak).toBe(0);
    expect(slowed.fallSpeedPxPerSec).toBeLessThan(mathState.fallSpeedPxPerSec);

    // 2. Leitner spaced-repetition boxes: 1 -> 2 -> 3 on success, back to 1 on miss
    let boxes = updateLeitnerBox({}, 'cat', true, 'test-kid');
    expect(boxes.cat).toBe(2);
    boxes = updateLeitnerBox(boxes, 'cat', true, 'test-kid');
    expect(boxes.cat).toBe(3);
    boxes = updateLeitnerBox(boxes, 'cat', false, 'test-kid');
    expect(boxes.cat).toBe(1);

    const withMastered = { cat: 3 as const, dog: 1 as const, sun: 2 as const };
    const picked = pickLeitnerEntries(KIDS_VOCAB_BANK, withMastered, 3);
    expect(picked.map((p) => p.id)).toContain('dog');
    expect(picked.map((p) => p.id)).not.toContain('cat');

    // 3. STEAM Drag & Drop DOM Rect collision bounds
    const rects = {
      forest: { left: 0, right: 100, top: 300, bottom: 420 },
      ocean: { left: 110, right: 210, top: 300, bottom: 420 },
      space: { left: 220, right: 320, top: 300, bottom: 420 },
    };
    expect(findCollidingSteamBucket(50, 350, rects)).toBe('forest');
    expect(findCollidingSteamBucket(160, 380, rects)).toBe('ocean');
    expect(findCollidingSteamBucket(280, 320, rects)).toBe('space');
    expect(findCollidingSteamBucket(150, 120, rects)).toBeNull();

    // 4. Explorer Level progression & expanded reward shop
    expect(getKidsLevelInfo(0)).toMatchObject({ level: 1, rankKey: 'explorer' });
    expect(getKidsLevelInfo(25)).toMatchObject({ level: 2, rankKey: 'adventurer' });
    expect(getKidsLevelInfo(65)).toMatchObject({ level: 3, rankKey: 'starMaster' });
    expect(getKidsLevelInfo(115)).toMatchObject({ level: 4, rankKey: 'superGenius' });

    const shopIds = KIDS_SHOP_ITEMS.map((item) => item.id);
    expect(shopIds).toContain('math_galaxy_theme');
    expect(shopIds).toContain('confetti_rainbow');
  });

  it('serves /api/kids/capabilities (200) & /api/kids/youtube (live HLS + YouTube Kids), and skips /api/kids/tts when ttsAvailable is false', async () => {
    const prevGeminiKey = process.env.GEMINI_API_KEY;
    const prevGoogleKey = process.env.GOOGLE_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_API_KEY;

    const fakeYtHtml = `<html><script>var ytInitialData = ${JSON.stringify({
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
                          videoId: 'dQw4w9WgXaa',
                          title: { runs: [{ text: 'Pocoyo Full Episode Kids' }] },
                          ownerText: { runs: [{ text: 'Pocoyo Official' }] },
                          lengthText: { simpleText: '12:34' },
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
    })};</script></html>`;

    const realFetch = globalThis.fetch;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.startsWith('https://www.youtube.com/results')) {
        return new Response(fakeYtHtml, {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        });
      }
      return realFetch(input as RequestInfo, init);
    });

    const app = express();
    app.use(express.json());
    registerKidsRoutes(app);

    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as { port: number };
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
      // 1. Capabilities endpoint returns 200 without 503 spam
      const capRes = await realFetch(`${baseUrl}/api/kids/capabilities`);
      expect(capRes.status).toBe(200);
      const capBody = (await capRes.json()) as {
        ok: boolean;
        aiAvailable: boolean;
        ttsAvailable: boolean;
      };
      expect(capBody).toEqual({
        ok: true,
        aiAvailable: false,
        ttsAvailable: false,
      });

      // 2. Direct /api/kids/tts validation & explicit 503 when key unset
      const emptyTtsRes = await realFetch(`${baseUrl}/api/kids/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: '', lang: 'es' }),
      });
      expect(emptyTtsRes.status).toBe(400);

      const unsetKeyTtsRes = await realFetch(`${baseUrl}/api/kids/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'Hola', lang: 'es' }),
      });
      expect(unsetKeyTtsRes.status).toBe(503);

      // 3. /api/kids/youtube live channels route keeps HLS proxy intact
      const liveRes = await realFetch(`${baseUrl}/api/kids/youtube?lang=es&category=live`);
      expect(liveRes.status).toBe(200);
      const liveBody = (await liveRes.json()) as {
        ok: boolean;
        category: string;
        items: Array<{ id: string; bingetrixUrl?: string; platform?: string }>;
      };
      expect(liveBody.ok).toBe(true);
      expect(liveBody.category).toBe('live');
      expect(liveBody.items.length).toBeGreaterThan(0);
      expect(liveBody.items[0].platform).toBe('Riffan Kids Live');
      expect(liveBody.items[0].bingetrixUrl).toContain('/api/hls-proxy/stream.m3u8');

      // 4. /api/kids/youtube standard YouTube Kids search route
      const ytRes = await realFetch(`${baseUrl}/api/kids/youtube?lang=es&category=all`);
      expect(ytRes.status).toBe(200);
      const ytBody = (await ytRes.json()) as {
        ok: boolean;
        items: Array<{ id: string; bingetrixUrl?: string; platform?: string; title: string }>;
      };
      expect(ytBody.ok).toBe(true);
      expect(ytBody.items.length).toBe(1);
      expect(ytBody.items[0]).toMatchObject({
        id: 'yt-dQw4w9WgXaa',
        bingetrixUrl: 'dQw4w9WgXaa',
        platform: 'YouTube Kids',
        title: 'Pocoyo Full Episode Kids',
      });

      // 5. Client speakKidsText checks /api/kids/capabilities and NEVER calls POST /api/kids/tts when unavailable
      resetKidsTtsCapabilityCache();
      const calledUrls: string[] = [];
      fetchSpy.mockImplementation(async (input) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        calledUrls.push(url);
        if (url === '/api/kids/capabilities') {
          return new Response(
            JSON.stringify({ ok: true, aiAvailable: false, ttsAvailable: false }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response('unexpected', { status: 500 });
      });

      const speakResult = await speakKidsText('Hola peque', 'es', { ageGroup: '6-8' });
      expect(speakResult).toBe('browser');
      expect(calledUrls).toEqual(['/api/kids/capabilities']);
      expect(calledUrls).not.toContain('/api/kids/tts');
    } finally {
      resetKidsTtsCapabilityCache();
      fetchSpy.mockRestore();
      if (prevGeminiKey !== undefined) process.env.GEMINI_API_KEY = prevGeminiKey;
      if (prevGoogleKey !== undefined) process.env.GOOGLE_API_KEY = prevGoogleKey;
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve()))
      );
    }
  });
});


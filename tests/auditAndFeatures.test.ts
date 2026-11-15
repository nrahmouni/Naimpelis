import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '../src/store/useAppStore';
import {
  applyBoardMove,
  createInitialBoardGameState,
  getConnect4DropRow,
} from '../src/shared/boardGames';
import {
  chooseBotParchisAction,
  chooseBotUnoMove,
  createInitialParchisState,
  createInitialUnoState,
  rollParchisDice,
} from '../src/shared/partyGames';
import {
  importUserDataFromJson,
  purgeLocalAndCloudHistory,
} from '../src/utils/gdprExport';
import { checkRemoteAppVersion } from '../src/utils/versionSync';
import {
  CHAPAS_ARENA_H,
  CHAPAS_ARENA_W,
  isChapasFlippedForTeam,
  orientChapasArenaPoint,
} from '../src/shared/futbolChapas';
import { sanitizeEmbedHtml, sanitizeEmbedScript } from '../server/extractors/httpHelpers';
import { unwrapEmbedUrl } from '../src/components/player/embedWindowUtils';

function createMemoryStorage() {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    key(index: number) {
      return Array.from(map.keys())[index] ?? null;
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    setItem(key: string, value: string) {
      map.set(key, String(value));
    },
    removeItem(key: string) {
      map.delete(key);
    },
    clear() {
      map.clear();
    },
  };
}

describe('Audit & Feature Verification Suite', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('auto-expires typingUsers entries after 4.5s inactivity', () => {
    const store = useAppStore.getState();
    store.setTypingUser('u-friend-1', 'Elena', false);
    store.setTypingUser('u-friend-1', 'Elena', true);
    expect(useAppStore.getState().typingUsers).toHaveLength(1);
    expect(useAppStore.getState().typingUsers[0].userName).toBe('Elena');

    vi.advanceTimersByTime(4600);
    expect(useAppStore.getState().typingUsers).toHaveLength(0);
  });

  it('supports Connect 4 creation, drop-row physics, vertical win, and matchHistory', () => {
    const p1 = { id: 'p1', name: 'Naim', avatar: '🎮', color: '#9146FF', isHost: true, joinedAt: 1 };
    const p2 = { id: 'p2', name: 'Sara', avatar: '🔥', color: '#E11D48', isHost: false, joinedAt: 2 };
    let state = createInitialBoardGameState('connect4', p1, [p1, p2], false, 5);
    expect(state.gameType).toBe('connect4');
    expect(state.clockMinutes).toBe(5);
    expect(state.clocksMs).toEqual({ w: 300000, b: 300000 });

    // Alternate moves: w drops col 0 (4 times), b drops col 1 (3 times)
    for (let turn = 0; turn < 3; turn += 1) {
      const wRow = getConnect4DropRow(state.board, 0);
      const wRes = applyBoardMove(state, 'p1', { r: 0, c: 0 }, { r: wRow, c: 0 });
      expect(wRes.ok).toBe(true);
      if (wRes.ok) state = wRes.state;

      const bRow = getConnect4DropRow(state.board, 1);
      const bRes = applyBoardMove(state, 'p2', { r: 0, c: 1 }, { r: bRow, c: 1 });
      expect(bRes.ok).toBe(true);
      if (bRes.ok) state = bRes.state;
    }

    const winRow = getConnect4DropRow(state.board, 0);
    const winRes = applyBoardMove(state, 'p1', { r: 0, c: 0 }, { r: winRow, c: 0 });
    expect(winRes.ok).toBe(true);
    if (winRes.ok) {
      expect(winRes.state.status).toBe('finished');
      expect(winRes.state.winner).toBe('w');
      expect(winRes.state.matchHistory?.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('supports 4-player Parchis & UNO initialization with bot filling and AI moves', () => {
    const parchis = createInitialParchisState([{ id: 'u1', name: 'Alex', avatar: '🎲' }]);
    expect(parchis.players).toHaveLength(4);
    expect(parchis.players[0].isBot).toBe(false);
    expect(parchis.players[1].isBot).toBe(true);

    const rolled = rollParchisDice(parchis, 'u1');
    expect(rolled.ok).toBe(true);
    if (rolled.ok) {
      const botPlan = chooseBotParchisAction(rolled.state);
      expect(['roll_dice', 'move_piece']).toContain(botPlan.action);
    }

    const uno = createInitialUnoState([{ id: 'u1', name: 'Alex', avatar: '🃏' }]);
    expect(uno.players).toHaveLength(4);
    expect(uno.hands[0]).toHaveLength(7);
    const botPlan = chooseBotUnoMove(uno);
    expect(['play_card', 'draw_card']).toContain(botPlan.action);
  });

  it('restores JSON backup and purges local storage keys cleanly in gdprExport', async () => {
    const memLocal = createMemoryStorage();
    const memSession = createMemoryStorage();
    vi.stubGlobal('localStorage', memLocal);
    vi.stubGlobal('sessionStorage', memSession);

    const sampleBackup = JSON.stringify({
      app: 'NAIM CINE',
      profile: { id: 'usr-9', name: 'Naim Backup', avatar: '🎬', color: '#9146FF' },
      watchlist: [{ id: 'movie-100', tmdbId: 100, title: 'Dune', poster: '', year: '2024', rating: '8.5', overview: '', languages: ['ES'] }],
      recentRooms: [{ id: 'cine1', name: 'Sala 1', lastVisited: Date.now() }],
    });

    const imported = importUserDataFromJson(sampleBackup);
    expect(imported.ok).toBe(true);
    expect(imported.restored.profile).toBe(true);
    expect(imported.restored.watchlistCount).toBe(1);
    expect(imported.restored.roomsCount).toBe(1);

    memSession.setItem('naim_session_flag', '1');
    await purgeLocalAndCloudHistory();
    expect(memSession.getItem('naim_session_flag')).toBeNull();
  });

  it('defers automatic reload during active playback in checkRemoteAppVersion', async () => {
    const memLocal = createMemoryStorage();
    const reloadSpy = vi.fn();
    vi.stubGlobal('localStorage', memLocal);
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0' });
    vi.stubGlobal('window', {
      location: { search: '', pathname: '/', reload: reloadSpy },
      setTimeout: globalThis.setTimeout,
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          versionName: '99.99.99',
          web: { version: '99.99.99' },
        }),
      })
    );

    const onDeferredUpdate = vi.fn();
    await checkRemoteAppVersion({
      shouldDeferReload: () => true,
      onDeferredUpdate,
    });

    expect(onDeferredUpdate).toHaveBeenCalledWith('99.99.99');
    expect(reloadSpy).not.toHaveBeenCalled();
  });

  it('includes LG webOS remote keys, low-overhead HLS config, and AirPlay 2 in tv-receiver.html', () => {
    const html = readFileSync(join(process.cwd(), 'public/tv-receiver.html'), 'utf8');
    expect(html).toContain('x-webkit-airplay="allow"');
    expect(html).toContain('isLgWebOsUa');
    expect(html).toContain('abs=1');
    expect(html).toContain('461');
    expect(html).toContain('413');
    expect(html).toContain('enableWorker: !isSmartTvUa');
  });

  it('orients Fútbol Chapas bottom-to-top per player team symmetrically', () => {
    expect(isChapasFlippedForTeam('A')).toBe(true);
    expect(isChapasFlippedForTeam('B')).toBe(false);
    expect(isChapasFlippedForTeam(undefined)).toBe(false);

    // For Team A (flipped), top goal (y=20) maps to bottom side (CHAPAS_ARENA_H - 20) in screen space and vice versa
    const flipped = orientChapasArenaPoint(120, 45, true);
    expect(flipped.x).toBe(CHAPAS_ARENA_W - 120);
    expect(flipped.y).toBe(CHAPAS_ARENA_H - 45);
    const roundTrip = orientChapasArenaPoint(flipped.x, flipped.y, true);
    expect(roundTrip.x).toBe(120);
    expect(roundTrip.y).toBe(45);

    const canonical = orientChapasArenaPoint(120, 45, false);
    expect(canonical).toEqual({ x: 120, y: 45 });
  });

  it('neutralizes VidFast sandbox detectors and rewrites Next.js chunks through /api/embed-script', () => {
    const rawChunk =
      '(0,a.useEffect)(()=>{if(!eQ.current&&(eQ.current=!0,window.self!==window.top)){let e=()=>{document.body.innerHTML=\'<div style="display:flex"><h1>Please Disable Sandbox</h1></div>\'};}},[])';
    const sanitizedChunk = sanitizeEmbedScript(rawChunk, 'https://vidfast.vc/_next/static/chunks/304.js');
    expect(sanitizedChunk).not.toContain('Please Disable Sandbox');
    expect(sanitizedChunk).toContain('if(false)');

    const sampleVidfastHtml = `<html><head><script src="/_next/static/chunks/304.df0b3d32fd5ef888.js" integrity="sha384-abc" crossorigin=""></script></head><body></body></html>`;
    const cleanHtml = sanitizeEmbedHtml(
      sampleVidfastHtml,
      'https://vidfast.vc/tv/62104/1/1?autoPlay=true&theme=9146FF'
    );
    expect(cleanHtml).toContain('/api/embed-script?url=');
    expect(cleanHtml).not.toContain('integrity="sha384-abc"');
    expect(cleanHtml).toContain("Object.defineProperty(document,'domain'");
    expect(cleanHtml).toContain('data:application/pdf');
    expect(cleanHtml).toContain('/api/embed-fetch?url=');

    expect(
      unwrapEmbedUrl('/api/embed-proxy?url=https%3A%2F%2Fvidfast.vc%2Ftv%2F62104%2F1%2F1')
    ).toBe('https://vidfast.vc/tv/62104/1/1');
  });
});

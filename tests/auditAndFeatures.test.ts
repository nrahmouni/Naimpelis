import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import crypto from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { decryptVidRockToken } from '../server/extractors/bingetrixMovidy';
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
    const tvScripts = ['tv-i18n.js', 'tv-state.js', 'tv-player-core.js', 'tv-player-modes.js', 'tv-hub.js', 'tv-nav-voice.js']
      .map((name) => readFileSync(join(process.cwd(), 'public/tv', name), 'utf8'))
      .join('\n');
    const combined = `${html}\n${tvScripts}`;
    expect(combined).toContain('x-webkit-airplay="allow"');
    expect(combined).toContain('isLgWebOsUa');
    expect(combined).toContain('abs=1');
    expect(combined).toContain('461');
    expect(combined).toContain('413');
    expect(combined).toContain('enableWorker: !isSmartTvUa');
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

  it('uses the RiffanTV (RTV) brand identity, pure-path icon, and synchronized PWA manifest', () => {
    const iconSvg = readFileSync(join(process.cwd(), 'public/icon.svg'), 'utf8');
    expect(iconSvg).toContain('<svg');
    expect(iconSvg).not.toContain('<text');
    expect(iconSvg).toContain('#8B5CF6');

    const indexHtml = readFileSync(join(process.cwd(), 'index.html'), 'utf8');
    expect(indexHtml).toContain('RiffanTV');
    expect(indexHtml).toContain('#000000');

    const viteConfig = readFileSync(join(process.cwd(), 'vite.config.ts'), 'utf8');
    expect(viteConfig).toContain("short_name: 'Riffan TV'");
    expect(viteConfig).toContain("cacheId: 'riffantv-studio-v1'");

    const logoSrc = readFileSync(join(process.cwd(), 'src/components/NaimBrandLogo.tsx'), 'utf8');
    expect(logoSrc).toContain('export const RiffanBrandLogo');
    expect(logoSrc).toContain('export const NaimBrandLogo = RiffanBrandLogo');

    const introSrc = readFileSync(join(process.cwd(), 'src/components/NaimcineIntro.tsx'), 'utf8');
    expect(introSrc).toContain('RiffanTV Studio Intro');
    expect(introSrc).toContain('playRiffanIntroSound');

    // Multi-variant PNG logo suite presence
    const requiredPngs = [
      'public/pwa-512x512.png',
      'public/pwa-192x192.png',
      'public/pwa-maskable-512x512.png',
      'public/apple-touch-icon.png',
      'public/logo-mark.png',
      'public/logo-mark-light.png',
      'public/logo-monochrome.png',
      'public/favicon-32x32.png',
      'public/favicon-16x16.png',
    ];
    for (const relPath of requiredPngs) {
      expect(existsSync(join(process.cwd(), relPath))).toBe(true);
    }
  });

  it('correctly decrypts VidRock AES-256-GCM tokens to direct HLS master playlists', () => {
    const rawMasterUrl = 'https://plasticprophecy.live/file2/master.m3u8?t=12345';
    const key = Buffer.from(
      '7f3e9c2a8b5d1f4e6a9c3b7d2e5f8a1c4b6d9e2f5a8c1b4d7e9f2a5c8b1d4e7f',
      'hex'
    );
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(Buffer.from(rawMasterUrl, 'utf8')),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    const token = Buffer.concat([iv, ciphertext, authTag]).toString('base64url');

    const decrypted = decryptVidRockToken(token);
    expect(decrypted).toBe(rawMasterUrl);
  });

  it('accurately parses external embed TV URLs like Dragon Ball Z 12971/1/2 and hyphen formats', () => {
    const tvEmbedRe =
      /(?:vidfast|vidlink|vidsrc|videm|vidrock|vidnest|vsembed)\.[a-z.]+\/(?:v2\/)?(?:embed\/)?tv\/(tt\d+|\d+)\/(\d+)[/-](\d+)/i;

    const match1 = 'https://vidsrc.buzz/embed/tv/12971/1/2'.match(tvEmbedRe);
    expect(match1).not.toBeNull();
    expect(match1?.[1]).toBe('12971');
    expect(match1?.[2]).toBe('1');
    expect(match1?.[3]).toBe('2');

    const match2 = 'https://vidsrc.sh/embed/tv/12971/1-2'.match(tvEmbedRe);
    expect(match2).not.toBeNull();
    expect(match2?.[1]).toBe('12971');
    expect(match2?.[2]).toBe('1');
    expect(match2?.[3]).toBe('2');

    const match3 = 'https://vidrock.net/embed/tv/62104/1/1'.match(tvEmbedRe);
    expect(match3).not.toBeNull();
    expect(match3?.[1]).toBe('62104');
    expect(match3?.[2]).toBe('1');
    expect(match3?.[3]).toBe('1');
  });

  it('extracts direct mp4 video source from MP4Upload player HTML', () => {
    const sampleHtml = `<div id="player"></div><script>player.src({ type: "video/mp4", src: "https://a4.mp4upload.com:183/d/abc123xyz/video.mp4" });</script>`;
    const srcMatch = sampleHtml.match(/src:\s*["'](https?:\/\/[^"']+\.mp4(?:\?[^"']*)?)["']/i);
    expect(srcMatch?.[1]).toBe('https://a4.mp4upload.com:183/d/abc123xyz/video.mp4');
  });
});


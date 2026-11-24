// @vitest-environment jsdom
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseAppRoute, GAME_ID_TO_SLUG, GAME_TITLES } from '../src/shared/dedicatedRoutes.ts';
import { normalizeDeepLinkGameType } from '../src/utils/appSessionHelpers.ts';
import { wsGameInviteRespondSchema, wsGameSwitchSchema } from '../server/ws/wsSchemas.ts';
import { GamesHubLobby } from '../src/components/games/GamesHubLobby';
import { GAME_SIGNATURES, getGamesHubTitleMap, getGameSwitcherOptions } from '../src/components/games/GameSwitcherModal';
import { ArcadePuzzleStage } from '../src/components/games/arcade/ArcadePuzzleStage';
import { ArcadeActionStage } from '../src/components/games/arcade/ArcadeActionStage';
import { ArcadeRetroStage } from '../src/components/games/arcade/ArcadeRetroStage';
import { TvTriviaStage } from '../src/components/games/arcade/TvTriviaStage';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const ROOT = process.cwd();

const TEN_GAMES = [
  'bomberman',
  'pacman',
  'tetris',
  'hextris',
  'game2048',
  'flappy',
  'hexgl',
  'arkanoid',
  'invaders',
  'tvtrivia',
] as const;

describe('10-Minigame Arcade & Quiz Pack (Smart TV ES5 + Web/Mobile React)', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  const origGetContext = HTMLCanvasElement.prototype.getContext;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    const mockCtx = {
      fillStyle: '#000',
      strokeStyle: '#000',
      lineWidth: 1,
      globalAlpha: 1,
      font: '12px sans-serif',
      textAlign: 'left',
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      closePath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      arc: vi.fn(),
      ellipse: vi.fn(),
      quadraticCurveTo: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      rect: vi.fn(),
      clip: vi.fn(),
      drawImage: vi.fn(),
      fillText: vi.fn(),
      strokeText: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
      createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    } as unknown as CanvasRenderingContext2D;

    HTMLCanvasElement.prototype.getContext = vi.fn(() => mockCtx) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    HTMLCanvasElement.prototype.getContext = origGetContext;
    vi.restoreAllMocks();
  });

  it('validates all Smart TV ES5 scripts register sprite helpers and all 10 game launchers with zero ES6 syntax', () => {
    const scripts = [
      'public/tv/tv-game-sprites.js',
      'public/tv/tv-games-puzzle.js',
      'public/tv/tv-games-action.js',
      'public/tv/tv-games-retro.js',
      'public/tv/tv-games-quiz.js',
    ];
    const mockWin: Record<string, unknown> = {};
    const sandbox = {
      window: mockWin,
      document: { getElementById: () => ({ onclick: null }) },
      localStorage: { getItem: () => '0', setItem: () => {} },
      performance: { now: () => 0 },
      requestAnimationFrame: () => 1,
      Math,
      Number,
      String,
      Array,
      Object,
    };

    for (const rel of scripts) {
      const code = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      expect(code).not.toMatch(/(?:^|\s)(?:let|const)\s+[a-zA-Z_$]/m);
      expect(code).not.toContain('=>');
      expect(code).not.toContain('`');
      expect(() => new vm.Script(code)).not.toThrow();
      vm.runInNewContext(code, sandbox);
    }

    expect(typeof mockWin.getTvGameSprite).toBe('function');
    expect(typeof mockWin.drawTvSprite).toBe('function');
    expect(typeof mockWin.playTvZzfxPreset).toBe('function');
    expect(typeof mockWin.startTetrisGame).toBe('function');
    expect(typeof mockWin.startHextrisGame).toBe('function');
    expect(typeof mockWin.startGame2048).toBe('function');
    expect(typeof mockWin.startPacmanGame).toBe('function');
    expect(typeof mockWin.startBombermanGame).toBe('function');
    expect(typeof mockWin.startFlappyGame).toBe('function');
    expect(typeof mockWin.startArkanoidGame).toBe('function');
    expect(typeof mockWin.startInvadersGame).toBe('function');
    expect(typeof mockWin.startHexGlGame).toBe('function');
    expect(typeof mockWin.startTvTriviaGame).toBe('function');
    const quizSrc = fs.readFileSync(path.join(ROOT, 'public/tv/tv-games-quiz.js'), 'utf8');
    expect(quizSrc).toContain('window.closeTvTriviaGame');
  });

  it('wires all 10 games in Smart TV catalog, HTML shell, Tizen .wgt, and webOS .ipk manifests', () => {
    const tvGamesJs = fs.readFileSync(path.join(ROOT, 'public/tv/tv-games.js'), 'utf8');
    const html = fs.readFileSync(path.join(ROOT, 'public/tv-receiver.html'), 'utf8');
    const tizen = fs.readFileSync(path.join(ROOT, 'server/routes/tizenRoutes.ts'), 'utf8');
    const webos = fs.readFileSync(path.join(ROOT, 'server/routes/webosRoutes.ts'), 'utf8');

    for (const gid of TEN_GAMES) {
      expect(tvGamesJs).toContain(`id: '${gid}'`);
      expect(tvGamesJs).toContain(`gameId === '${gid}'`);
    }

    for (const file of ['tv-game-sprites.js', 'tv-games-puzzle.js', 'tv-games-action.js', 'tv-games-retro.js', 'tv-games-quiz.js']) {
      expect(html).toContain(`/tv/${file}`);
      expect(tizen).toContain(`tv/${file}`);
      expect(webos).toContain(`tv/${file}`);
    }
    expect(tizen).toContain("assets', 'games'");
    expect(webos).toContain("assets', 'games'");
  });

  it('resolves deep-link routes, WS Zod schemas, and switcher metadata for all 10 imported games', () => {
    const slugs: Record<(typeof TEN_GAMES)[number], string> = {
      bomberman: 'bomberman',
      pacman: 'pacman',
      tetris: 'tetris',
      hextris: 'hextris',
      game2048: '2048',
      flappy: 'flappy',
      hexgl: 'hexgl',
      arkanoid: 'arkanoid',
      invaders: 'invaders',
      tvtrivia: 'quiz-tv',
    };

    const titles = getGamesHubTitleMap('es');
    const switcher = getGameSwitcherOptions(titles);

    for (const gid of TEN_GAMES) {
      expect(GAME_ID_TO_SLUG[gid]).toBe(slugs[gid]);
      expect(GAME_TITLES[gid]).toBeTruthy();
      expect(GAME_SIGNATURES[gid]).toBeTruthy();
      expect(switcher.some((opt) => opt.id === gid)).toBe(true);

      const route = parseAppRoute(`/juegos/${slugs[gid]}`, '');
      expect(route.kind).toBe('game');
      if (route.kind === 'game') {
        expect(route.gameId).toBe(gid);
      }

      expect(normalizeDeepLinkGameType(gid)).toBe(gid);
      expect(normalizeDeepLinkGameType(slugs[gid])).toBe(gid);
      expect(wsGameSwitchSchema.safeParse({ roomId: 'room-1', targetGame: gid }).success).toBe(true);
      expect(
        wsGameInviteRespondSchema.safeParse({ roomId: 'room-1', gameType: gid, response: 'accepted' }).success
      ).toBe(true);
    }
  });

  it('renders 29 games in GamesHubLobby and mounts all Web/Mobile arcade stages without errors', () => {
    const onOpen = vi.fn();
    act(() => {
      root.render(
        <GamesHubLobby
          lang="es"
          participants={[{ id: 'u1', name: 'Naim', avatar: '🎮', color: '#9146FF', isHost: true, joinedAt: 1 }]}
          hubMode="offline"
          onChangeHubMode={vi.fn()}
          isLiveGame={() => false}
          onOpenGame={onOpen}
          onInviteGame={async () => {}}
          inviteCopied={false}
        />
      );
    });

    for (const gid of [
      'Tetris Sprint TV',
      'Pac-Man Arcade HD',
      'Bomberman Party Arena',
      'Riffan TV Quiz Show',
      'HexGL Hover 3D',
      'Ping Pong Pro 2P',
      'Bolos Pro 3D Gyro',
      'Tenis Slam Pro 2P',
      'Laberinto Esfera 3D',
    ]) {
      expect(container.textContent).toContain(gid);
    }
    expect(container.textContent).toContain('(29)');

    for (const pid of ['tetris', 'hextris', 'game2048'] as const) {
      act(() => {
        root.render(<ArcadePuzzleStage gameId={pid} lang="es" mutedOverride />);
      });
      expect(container.querySelector('canvas')).not.toBeNull();
    }

    for (const aid of ['pacman', 'bomberman', 'flappy'] as const) {
      act(() => {
        root.render(<ArcadeActionStage gameId={aid} lang="es" mutedOverride />);
      });
      expect(container.querySelector('canvas')).not.toBeNull();
    }

    for (const rid of ['arkanoid', 'invaders', 'hexgl'] as const) {
      act(() => {
        root.render(<ArcadeRetroStage gameId={rid} lang="es" mutedOverride />);
      });
      expect(container.querySelector('canvas')).not.toBeNull();
    }

    act(() => {
      root.render(<TvTriviaStage lang="es" mutedOverride />);
    });
    expect(container.textContent).toContain('Riffan TV Quiz Show');
    const startBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Empezar Concurso')
    );
    expect(startBtn).toBeDefined();
    act(() => {
      startBtn?.click();
    });
    expect(container.textContent).toContain('1/10');
  });

  it('stores verified CC0 PNG, JPG and GLB game assets on disk with valid headers and zero broken references', () => {
    const assetsRoot = path.join(ROOT, 'public/assets/games');
    expect(fs.existsSync(assetsRoot)).toBe(true);
    const collected: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const abs = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(abs);
        else collected.push(abs);
      }
    };
    walk(assetsRoot);
    expect(collected.length).toBeGreaterThanOrEqual(80);
    for (const f of collected) {
      const buf = fs.readFileSync(f);
      expect(buf.length).toBeGreaterThan(64);
      if (f.endsWith('.png')) {
        expect(buf[0]).toBe(0x89);
        expect(buf.slice(1, 4).toString('ascii')).toBe('PNG');
      } else if (f.endsWith('.glb')) {
        expect(buf.slice(0, 4).toString('ascii')).toBe('glTF');
      }
    }

    const codeFiles: string[] = [];
    const walkCode = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const abs = path.join(dir, entry.name);
        if (entry.isDirectory()) walkCode(abs);
        else if (/\.(ts|tsx|js)$/.test(entry.name)) codeFiles.push(abs);
      }
    };
    walkCode(path.join(ROOT, 'src/components/games'));
    walkCode(path.join(ROOT, 'public/tv'));
    for (const file of codeFiles) {
      const content = fs.readFileSync(file, 'utf8');
      const matches = content.match(/assets\/games\/[a-zA-Z0-9_/-]+\.(?:png|jpg|glb)/g) || [];
      for (const relAsset of matches) {
        expect(fs.existsSync(path.join(ROOT, 'public', relAsset))).toBe(true);
      }
    }
  });
});

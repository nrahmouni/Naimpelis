import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { WebSocket } from 'ws';
import { describe, expect, it, vi } from 'vitest';
import { parseAppRoute } from '../src/shared/dedicatedRoutes.ts';
import {
  wsGyroInputSchema,
  wsGyroJoinSchema,
  wsRacingTelemetrySchema,
} from '../server/ws/wsSchemas.ts';
import { handleRacingGyroMessage, getLatestActiveGyroRoom } from '../server/ws/handlers/racingGyroHandlers.ts';
import {
  CURATED_SPANISH_KIDS_MOVIE_IDS,
  CURATED_SPANISH_KIDS_TV_IDS,
  MOVIE_GENRE_MAP,
} from '../server/data/vodConstants.ts';
import {
  HS_ARENA_W,
  HS_GOAL_W,
  HS_GROUND_Y,
  createHeadSoccerSimulation,
  stepHeadSoccerFrame,
} from '../src/shared/headSoccer.ts';
import { PENALTY_COUNTRIES } from '../src/shared/penaltyCountries.ts';
import { resolveGameAssetUrl } from '../src/shared/gameAssetsCdn.ts';

const ROOT = process.cwd();

describe('Smart TV Games, Mobile Gyro 3D Racing & Spanish Kids Hub', () => {
  it('validates WS gyro join, input, and telemetry schemas with strict bounds', () => {
    expect(
      wsGyroJoinSchema.safeParse({ roomId: 'race-1234', role: 'controller', deviceName: 'iPhone' }).success
    ).toBe(true);
    expect(
      wsGyroJoinSchema.safeParse({ roomId: 'race-1234', role: 'spectator' }).success
    ).toBe(false);

    expect(
      wsGyroInputSchema.safeParse({
        roomId: 'race-1234',
        steer: -0.65,
        throttle: 0.9,
        brake: 0,
        nitro: true,
        handbrake: false,
        seq: 42,
        ts: Date.now(),
      }).success
    ).toBe(true);

    expect(
      wsGyroInputSchema.safeParse({
        roomId: 'race-1234',
        steer: 3.5, // out of bounds [-1, 1]
        throttle: 1,
        brake: 0,
        seq: 1,
        ts: Date.now(),
      }).success
    ).toBe(false);

    expect(
      wsRacingTelemetrySchema.safeParse({
        roomId: 'race-1234',
        speedKmh: 286,
        rpmPct: 88,
        gear: 6,
        lap: 2,
        totalLaps: 3,
        position: 1,
        totalCars: 4,
        nitroPct: 62,
        offroad: false,
        raceState: 'racing',
      }).success
    ).toBe(true);
  });

  it('enforces room membership on gyro relays and broadcasts only to target room', () => {
    const tvWs = { readyState: WebSocket.OPEN } as unknown as WebSocket;
    const phoneWs = { readyState: WebSocket.OPEN } as unknown as WebSocket;
    const intruderWs = { readyState: WebSocket.OPEN } as unknown as WebSocket;

    const broadcastToRoom = vi.fn();
    const ctx = {
      rooms: new Map([['race-7777', {} as any]]),
      clients: new Map<WebSocket, any>([
        [tvWs, { roomId: 'race-7777', userId: 'tv-1' }],
        [phoneWs, { roomId: 'race-7777', userId: 'phone-1' }],
        [intruderWs, { roomId: 'other-room', userId: 'evil-1' }],
      ]),
      broadcastToRoom,
    } as any;

    // Cross-room spoof attempt must be silently ignored (returns true = handled, zero broadcast)
    const spoofHandled = handleRacingGyroMessage(
      'GYRO_INPUT_UPDATE',
      {
        roomId: 'race-7777',
        steer: 0.8,
        throttle: 1,
        brake: 0,
        seq: 1,
        ts: Date.now(),
      },
      intruderWs,
      ctx
    );
    expect(spoofHandled).toBe(true);
    expect(broadcastToRoom).not.toHaveBeenCalled();

    // Legitimate join & input relay
    handleRacingGyroMessage(
      'GYRO_CONTROLLER_JOIN',
      { roomId: 'race-7777', role: 'controller', deviceName: 'Galaxy S24' },
      phoneWs,
      ctx
    );
    expect(broadcastToRoom).toHaveBeenCalledWith(
      'race-7777',
      expect.objectContaining({
        type: 'GYRO_PEER_STATUS',
        payload: expect.objectContaining({
          roomId: 'race-7777',
          hasController: true,
        }),
      })
    );

    broadcastToRoom.mockClear();
    handleRacingGyroMessage(
      'GYRO_INPUT_UPDATE',
      {
        roomId: 'race-7777',
        steer: -0.42,
        throttle: 0.85,
        brake: 0,
        nitro: true,
        seq: 9,
        ts: Date.now(),
      },
      phoneWs,
      ctx
    );
    expect(broadcastToRoom).toHaveBeenCalledWith(
      'race-7777',
      expect.objectContaining({
        type: 'GYRO_INPUT_RELAY',
        payload: expect.objectContaining({
          roomId: 'race-7777',
          senderId: 'phone-1',
          steer: -0.42,
          nitro: true,
        }),
      }),
      phoneWs
    );
  });

  it('resolves /volante controller routes and football / racing game routes', () => {
    const ctrlRoute = parseAppRoute('/volante', '?room=race-4321');
    expect(ctrlRoute.kind).toBe('system');
    if (ctrlRoute.kind === 'system') {
      expect(ctrlRoute.systemType).toBe('controller');
    }
    expect(ctrlRoute.roomId).toBe('race-4321');

    const penaltyRoute = parseAppRoute('/penaltis', '');
    expect(penaltyRoute.kind).toBe('game');
    if (penaltyRoute.kind === 'game') {
      expect(penaltyRoute.gameId).toBe('penalty');
    }

    const racingRoute = parseAppRoute('/coches-3d', '?room=k8x4');
    expect(racingRoute.kind).toBe('game');
    if (racingRoute.kind === 'game') {
      expect(racingRoute.gameId).toBe('racing3d');
      expect(racingRoute.roomId).toBe('k8x4');
    }

    const hockeyRoute = parseAppRoute('/juegos/air-hockey', '?room=k8x4');
    expect(hockeyRoute.kind).toBe('game');
    if (hockeyRoute.kind === 'game') {
      expect(hockeyRoute.gameId).toBe('gyrohockey');
    }

    const spaceRoute = parseAppRoute('/juegos/galaxia-gyro', '?room=k8x4');
    expect(spaceRoute.kind).toBe('game');
    if (spaceRoute.kind === 'game') {
      expect(spaceRoute.gameId).toBe('gyrospace');
    }

    const pingPongRoute = parseAppRoute('/juegos/ping-pong', '?room=k8x4');
    expect(pingPongRoute.kind).toBe('game');
    if (pingPongRoute.kind === 'game') {
      expect(pingPongRoute.gameId).toBe('pingpong');
      expect(pingPongRoute.roomId).toBe('k8x4');
    }

    const bowlingRoute = parseAppRoute('/juegos/bolos-gyro', '?room=g912');
    expect(bowlingRoute.kind).toBe('game');
    if (bowlingRoute.kind === 'game') {
      expect(bowlingRoute.gameId).toBe('gyrobowling');
      expect(bowlingRoute.roomId).toBe('g912');
    }

    const tennisRoute = parseAppRoute('/juegos/tenis-gyro', '');
    expect(tennisRoute.kind).toBe('game');
    if (tennisRoute.kind === 'game') {
      expect(tennisRoute.gameId).toBe('gyrotennis');
    }

    const labRoute = parseAppRoute('/juegos/laberinto-gyro', '');
    expect(labRoute.kind).toBe('game');
    if (labRoute.kind === 'game') {
      expect(labRoute.gameId).toBe('gyrolab');
    }

    const slot2Route = parseAppRoute('/volante', '?slot=2');
    expect(slot2Route.kind).toBe('system');
    if (slot2Route.kind === 'system') {
      expect(slot2Route.systemType).toBe('controller');
    }

    expect(PENALTY_COUNTRIES).toHaveLength(10);
    expect(PENALTY_COUNTRIES.map((c) => c.code)).toContain('ESP');
    expect(PENALTY_COUNTRIES.map((c) => c.code)).toContain('ARG');
    expect(PENALTY_COUNTRIES.map((c) => c.code)).toContain('MAR');
  });

  it('assigns simultaneous 2-player controller slots and relays playerSlot + eventTag', () => {
    const p1Ws = { readyState: WebSocket.OPEN } as unknown as WebSocket;
    const p2Ws = { readyState: WebSocket.OPEN } as unknown as WebSocket;
    const broadcastToRoom = vi.fn();
    const ctx = {
      rooms: new Map([['arena-2p', {} as any]]),
      clients: new Map<WebSocket, any>([
        [p1Ws, { roomId: 'arena-2p', userId: 'phone-p1' }],
        [p2Ws, { roomId: 'arena-2p', userId: 'phone-p2' }],
      ]),
      broadcastToRoom,
    } as any;

    handleRacingGyroMessage(
      'GYRO_CONTROLLER_JOIN',
      { roomId: 'arena-2p', role: 'controller', deviceName: 'Móvil 1' },
      p1Ws,
      ctx
    );
    handleRacingGyroMessage(
      'GYRO_CONTROLLER_JOIN',
      { roomId: 'arena-2p', role: 'controller', deviceName: 'Móvil 2' },
      p2Ws,
      ctx
    );

    expect(broadcastToRoom).toHaveBeenLastCalledWith(
      'arena-2p',
      expect.objectContaining({
        type: 'GYRO_PEER_STATUS',
        payload: expect.objectContaining({
          roomId: 'arena-2p',
          hasController: true,
          controllers: expect.arrayContaining([
            expect.objectContaining({ userId: 'phone-p1', slot: 1 }),
            expect.objectContaining({ userId: 'phone-p2', slot: 2 }),
          ]),
        }),
      })
    );

    broadcastToRoom.mockClear();
    handleRacingGyroMessage(
      'GYRO_INPUT_UPDATE',
      {
        roomId: 'arena-2p',
        steer: 0.45,
        throttle: 1,
        brake: 0,
        roll: -0.6,
        pitch: -0.3,
        swing: 0.92,
        seq: 11,
        ts: Date.now(),
      },
      p2Ws,
      ctx
    );

    expect(broadcastToRoom).toHaveBeenCalledWith(
      'arena-2p',
      expect.objectContaining({
        type: 'GYRO_INPUT_RELAY',
        payload: expect.objectContaining({
          roomId: 'arena-2p',
          senderId: 'phone-p2',
          playerSlot: 2,
          roll: -0.6,
          pitch: -0.3,
          swing: 0.92,
        }),
      }),
      p2Ws
    );
    expect(getLatestActiveGyroRoom(new Set(['arena-2p']))).toBeNull();

    const hostTvWs = { readyState: WebSocket.OPEN } as unknown as WebSocket;
    const tvCtx = {
      rooms: new Map([['tv-auto-room', {} as any]]),
      clients: new Map<WebSocket, any>([[hostTvWs, { roomId: 'tv-auto-room', userId: 'tv-host' }]]),
      broadcastToRoom,
    } as any;
    handleRacingGyroMessage(
      'GYRO_CONTROLLER_JOIN',
      { roomId: 'tv-auto-room', role: 'display', deviceName: 'Smart TV', gameId: 'gyrobowling' },
      hostTvWs,
      tvCtx
    );
    expect(getLatestActiveGyroRoom(new Set(['tv-auto-room']))).toMatchObject({
      roomId: 'tv-auto-room',
      gameId: 'gyrobowling',
    });
  });

  it('compiles all Smart TV ES5 scripts via vm.Script, verifies force update controls, zero backdrop-filter, and <=700 LOC', () => {
    const html = fs.readFileSync(path.join(ROOT, 'public/tv-receiver.html'), 'utf8');
    expect(html).toContain('data-tab="kids"');
    expect(html).toContain('data-tab="games"');
    expect(html).toContain('id="tv-games-screen"');
    expect(html).toContain('id="btn-tv-force-update"');
    expect(html).toContain('id="btn-hub-force-update"');
    expect(html).toContain('/vendor/riffan-racing-3d.iife.js');
    expect(html).toContain('/tv/tv-games-gyroplus.js');

    const tvState = fs.readFileSync(path.join(ROOT, 'public/tv/tv-state.js'), 'utf8');
    expect(tvState).toContain('forceHardTvAppUpdate');

    const bundlePath = path.join(ROOT, 'public/vendor/riffan-racing-3d.iife.js');
    expect(fs.existsSync(bundlePath)).toBe(true);
    expect(fs.statSync(bundlePath).size).toBeGreaterThan(50_000);

    expect(resolveGameAssetUrl('assets/games/models/race-future.glb')).toMatch(/^https:\/\//);
    expect(resolveGameAssetUrl('assets/games/models/grandStandCovered.glb')).toMatch(/^https:\/\//);
    expect(resolveGameAssetUrl('assets/games/penalty/stadium_backdrop.jpg')).toMatch(/^https:\/\//);
    for (const arena of ['bowling_alley.jpg', 'tennis_court.jpg', 'labyrinth_board.jpg', 'soccer_stadium.jpg']) {
      expect(resolveGameAssetUrl(`assets/games/arenas/${arena}`)).toMatch(/^https:\/\//);
    }

    const tvGamesCss = fs.readFileSync(path.join(ROOT, 'public/tv/tv-games.css'), 'utf8');
    expect(tvGamesCss).not.toMatch(/backdrop-filter/i);

    const tvScripts = [
      'public/tv/tv-i18n.js',
      'public/tv/tv-state.js',
      'public/tv/tv-player-core.js',
      'public/tv/tv-player-modes.js',
      'public/tv/tv-hub.js',
      'public/tv/tv-game-sprites.js',
      'public/tv/tv-games.js',
      'public/tv/tv-games-soccer.js',
      'public/tv/tv-games-penalty.js',
      'public/tv/tv-games-pingpong.js',
      'public/tv/tv-games-racing.js',
      'public/tv/tv-games-gyro.js',
      'public/tv/tv-games-gyroplus.js',
      'public/tv/tv-games-puzzle.js',
      'public/tv/tv-games-action.js',
      'public/tv/tv-games-retro.js',
      'public/tv/tv-games-quiz.js',
      'public/tv/tv-nav-voice.js',
    ];
    for (const rel of tvScripts) {
      const code = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      expect(() => new vm.Script(code)).not.toThrow();
    }

    const lineCapFiles = [
      'public/tv/tv-game-sprites.js',
      'public/tv/tv-games.js',
      'public/tv/tv-games-soccer.js',
      'public/tv/tv-games-penalty.js',
      'public/tv/tv-games-pingpong.js',
      'public/tv/tv-games-racing.js',
      'public/tv/tv-games-gyro.js',
      'public/tv/tv-games-gyroplus.js',
      'public/tv/tv-games-puzzle.js',
      'public/tv/tv-games-action.js',
      'public/tv/tv-games-retro.js',
      'public/tv/tv-games-quiz.js',
    ];
    for (const rel of lineCapFiles) {
      const lines = fs.readFileSync(path.join(ROOT, rel), 'utf8').split('\n').length;
      expect(lines).toBeLessThanOrEqual(700);
    }

    for (const strictEs5File of [
      'public/tv/tv-game-sprites.js',
      'public/tv/tv-games-gyroplus.js',
      'public/tv/tv-games-retro.js',
      'public/tv/tv-games-action.js',
    ]) {
      const src = fs.readFileSync(path.join(ROOT, strictEs5File), 'utf8');
      expect(src).not.toMatch(/(?:^|\s)(?:let|const)\s+[a-zA-Z_$]/m);
      expect(src).not.toContain('=>');
      expect(src).not.toContain('`');
      expect(src).not.toContain('roundRect');
    }

    const indexCss = fs.readFileSync(path.join(ROOT, 'src/index.css'), 'utf8');
    expect(indexCss).toContain('.game-touch-surface');
    expect(indexCss).toContain('-webkit-touch-callout: none');

    const gyroControllerSrc = fs.readFileSync(
      path.join(ROOT, 'src/components/games/racing/PhoneGyroController.tsx'),
      'utf8'
    );
    for (const newGyroGame of ['hexgl', 'arkanoid', 'invaders', 'pacman', 'bomberman', 'flappy']) {
      expect(gyroControllerSrc).toContain(`'${newGyroGame}'`);
    }

    const mockWin: Record<string, unknown> = {};
    const tvSandbox = {
      window: mockWin,
      document: {
        getElementById: () => null,
        createElement: () => ({ style: {}, className: '', innerHTML: '', onclick: null, querySelector: () => null, appendChild: () => {} }),
      },
      localStorage: { getItem: () => '0', setItem: () => {} },
      location: { origin: 'http://localhost:3000', protocol: 'http:', host: 'localhost:3000' },
      performance: { now: () => 0 },
      requestAnimationFrame: () => 1,
      setTimeout,
      clearTimeout,
      Math,
      Number,
      String,
      Array,
      Object,
      encodeURIComponent,
    };
    vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'public/tv/tv-game-sprites.js'), 'utf8'), tvSandbox);
    vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'public/tv/tv-games-gyroplus.js'), 'utf8'), tvSandbox);
    vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'public/tv/tv-games-retro.js'), 'utf8'), tvSandbox);
    vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'public/tv/tv-games-action.js'), 'utf8'), tvSandbox);
    expect(typeof mockWin.createTvDualQrLobby).toBe('function');
    expect(typeof mockWin.connectTvGyroBridge).toBe('function');
    expect(typeof mockWin.closeTvGyroBridge).toBe('function');
    expect(typeof mockWin.buildTvVolanteUrl).toBe('function');
    expect(typeof mockWin.startGyroBowlingGame).toBe('function');
    expect(typeof mockWin.startGyroTennisGame).toBe('function');
    expect(typeof mockWin.startGyroLabGame).toBe('function');
    expect(typeof mockWin.startArkanoidGame).toBe('function');
    expect(typeof mockWin.startPacmanGame).toBe('function');
    expect(typeof mockWin.startFlappyGame).toBe('function');
  });

  it('scores goals cleanly on both left & right goals in Head Soccer physics & TV script', () => {
    const empty = { left: false, right: false, jump: false, kick: false };

    // Right goal test
    const simR = createHeadSoccerSimulation();
    simR.ball.x = HS_ARENA_W - HS_GOAL_W - 12;
    simR.ball.y = HS_GROUND_Y - 50;
    simR.ball.vx = 680;
    simR.ball.vy = -40;
    let rightEvents: any = {};
    for (let i = 0; i < 8; i += 1) {
      rightEvents = stepHeadSoccerFrame(simR, [empty, empty], 1 / 60);
      if (rightEvents.goalScoredBy === 0) break;
    }
    expect(simR.scores[0]).toBe(1);
    expect(rightEvents.goalScoredBy).toBe(0);

    // Left goal test
    const simL = createHeadSoccerSimulation();
    simL.ball.x = HS_GOAL_W + 12;
    simL.ball.y = HS_GROUND_Y - 50;
    simL.ball.vx = -680;
    simL.ball.vy = -40;
    let leftEvents: any = {};
    for (let i = 0; i < 8; i += 1) {
      leftEvents = stepHeadSoccerFrame(simL, [empty, empty], 1 / 60);
      if (leftEvents.goalScoredBy === 1) break;
    }
    expect(simL.scores[1]).toBe(1);
    expect(leftEvents.goalScoredBy).toBe(1);

    // Confirm TV script removed the GW + BR blocking wall
    const tvSoccer = fs.readFileSync(path.join(ROOT, 'public/tv/tv-games-soccer.js'), 'utf8');
    expect(tvSoccer).not.toContain('GW + BR');
    expect(tvSoccer).toContain('b.x < GW - 4');
    expect(tvSoccer).toContain('b.x > W - GW + 4');
  });

  it('configures 100% Spanish Kids live TV & VOD catalog and Tizen auto-launch persistence', () => {
    expect(MOVIE_GENRE_MAP.kids).toBe(10751);
    expect(CURATED_SPANISH_KIDS_MOVIE_IDS.length).toBeGreaterThanOrEqual(10);
    expect(CURATED_SPANISH_KIDS_TV_IDS.length).toBeGreaterThanOrEqual(10);

    const tvHub = fs.readFileSync(path.join(ROOT, 'public/tv/tv-hub.js'), 'utf8');
    expect(tvHub).toContain('isSpanishKidsChannel');
    expect(tvHub).toContain("id === 'tdt-clan' || id === 'tdt-boing'");
    expect(tvHub).toContain('/api/catalog/movies?category=kids&page=1&lang=es');
    expect(tvHub).toContain('/api/catalog/series?category=kids&page=1&lang=es');
    expect(tvHub).toContain('renderSpanishKidsHubInto');

    const tvI18n = fs.readFileSync(path.join(ROOT, 'public/tv/tv-i18n.js'), 'utf8');
    expect(tvI18n).toContain('naim_is_tizen_tv');
  });
});

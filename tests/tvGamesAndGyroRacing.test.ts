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
import { handleRacingGyroMessage } from '../server/ws/handlers/racingGyroHandlers.ts';
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
  });

  it('compiles all Smart TV ES5 scripts via vm.Script, verifies force update controls, zero backdrop-filter, and <=700 LOC', () => {
    const html = fs.readFileSync(path.join(ROOT, 'public/tv-receiver.html'), 'utf8');
    expect(html).toContain('data-tab="kids"');
    expect(html).toContain('data-tab="games"');
    expect(html).toContain('id="tv-games-screen"');
    expect(html).toContain('id="btn-tv-force-update"');
    expect(html).toContain('id="btn-hub-force-update"');
    expect(html).toContain('/vendor/riffan-racing-3d.iife.js');

    const tvState = fs.readFileSync(path.join(ROOT, 'public/tv/tv-state.js'), 'utf8');
    expect(tvState).toContain('forceHardTvAppUpdate');

    const bundlePath = path.join(ROOT, 'public/vendor/riffan-racing-3d.iife.js');
    expect(fs.existsSync(bundlePath)).toBe(true);
    expect(fs.statSync(bundlePath).size).toBeGreaterThan(50_000);

    const tvGamesCss = fs.readFileSync(path.join(ROOT, 'public/tv/tv-games.css'), 'utf8');
    expect(tvGamesCss).not.toMatch(/backdrop-filter/i);

    const tvScripts = [
      'public/tv/tv-i18n.js',
      'public/tv/tv-state.js',
      'public/tv/tv-player-core.js',
      'public/tv/tv-player-modes.js',
      'public/tv/tv-hub.js',
      'public/tv/tv-games.js',
      'public/tv/tv-games-soccer.js',
      'public/tv/tv-games-racing.js',
      'public/tv/tv-games-gyro.js',
      'public/tv/tv-nav-voice.js',
    ];
    for (const rel of tvScripts) {
      const code = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      expect(() => new vm.Script(code)).not.toThrow();
    }

    const lineCapFiles = [
      'public/tv/tv-games.js',
      'public/tv/tv-games-soccer.js',
      'public/tv/tv-games-racing.js',
      'public/tv/tv-games-gyro.js',
    ];
    for (const rel of lineCapFiles) {
      const lines = fs.readFileSync(path.join(ROOT, rel), 'utf8').split('\n').length;
      expect(lines).toBeLessThanOrEqual(700);
    }
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

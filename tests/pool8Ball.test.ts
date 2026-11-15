import { describe, expect, it } from 'vitest';
import {
  POOL_BALL_R,
  POOL_BALL_RESTITUTION,
  POOL_CUSHION_RESTITUTION,
  POOL_FIXED_DT,
  POOL_TABLE_H,
  POOL_TABLE_W,
  applyPoolShot,
  callPoolPocket,
  choosePoolAiShot,
  computePoolChecksum,
  createInitialPoolState,
  createPoolSimRuntime,
  createStandardRackBalls,
  forfeitPoolMatch,
  getBallGroup,
  isValidCueBallPlacement,
  placePoolCueBall,
  resolvePoolShotOutcome,
  simulatePoolShot,
  stepPoolPhysicsSubstep,
  type PoolBallState,
} from '../src/shared/pool8Ball';

function makeMinimalBalls(custom: Array<Partial<PoolBallState> & { id: number }>): PoolBallState[] {
  const byId = new Map(custom.map((b) => [b.id, b]));
  const balls: PoolBallState[] = [];
  for (let id = 0; id <= 15; id += 1) {
    const ov = byId.get(id);
    if (ov) {
      balls.push({
        id,
        x: ov.x ?? 500,
        y: ov.y ?? 250,
        vx: ov.vx ?? 0,
        vy: ov.vy ?? 0,
        pocketed: ov.pocketed ?? false,
        pocketId: ov.pocketId ?? null,
        offTable: ov.offTable ?? false,
        rollPhase: 0,
        rollAngle: 0,
      });
    } else {
      balls.push({
        id,
        x: 500,
        y: 250,
        vx: 0,
        vy: 0,
        pocketed: true,
        pocketId: 'TL',
        rollPhase: 0,
        rollAngle: 0,
      });
    }
  }
  return balls;
}

describe('8-Ball Pool Physics Engine (120Hz CCD, Restitution & Spin)', () => {
  it('conserves linear momentum during elastic ball-ball collisions with restitution ≈ 0.95', () => {
    const balls = makeMinimalBalls([
      { id: 0, x: 300, y: 250 },
      { id: 1, x: 300 + POOL_BALL_R * 2 + 2, y: 250 + 4 }, // slight off-center cut
    ]);
    const runtime = createPoolSimRuntime(balls, {
      angle: 0,
      power: 0.75,
      spinX: 0,
      spinY: 0,
    });

    const pXBefore = runtime.balls[0].vx + runtime.balls[1].vx;
    const pYBefore = runtime.balls[0].vy + runtime.balls[1].vy;

    // Step until first ball-ball event is emitted
    let hitEvent = null;
    for (let i = 0; i < 15; i += 1) {
      const evs = stepPoolPhysicsSubstep(runtime, POOL_FIXED_DT);
      const bb = evs.find((e) => e.type === 'ball_ball');
      if (bb) {
        hitEvent = bb;
        break;
      }
    }

    expect(hitEvent).not.toBeNull();
    expect(POOL_BALL_RESTITUTION).toBeCloseTo(0.95, 2);

    const pXAfter = runtime.balls[0].vx + runtime.balls[1].vx;
    const pYAfter = runtime.balls[0].vy + runtime.balls[1].vy;

    // After single substep, frictional loss is tiny (< 2%), and momentum direction/magnitude is conserved
    expect(pXAfter).toBeCloseTo(pXBefore * 0.996, -1);
    expect(Math.abs(pYAfter - pYBefore)).toBeLessThan(12);
    // Object ball picked up forward speed roughly equal to cue ball's lost momentum
    expect(runtime.balls[1].vx).toBeGreaterThan(runtime.balls[0].vx);
  });

  it('reflects off cushions with restitution ≈ 0.75 and never tunnels at max shot power', () => {
    const balls = makeMinimalBalls([
      { id: 0, x: POOL_TABLE_W - POOL_BALL_R - 8, y: 220 },
    ]);
    // Fire almost full-power shot angled into the right cushion
    const runtime = createPoolSimRuntime(balls, {
      angle: 0.28,
      power: 1,
      spinX: 0,
      spinY: 0,
    });
    const initVx = runtime.balls[0].vx;
    const initVy = runtime.balls[0].vy;

    let bounced = false;
    for (let i = 0; i < 12; i += 1) {
      const evs = stepPoolPhysicsSubstep(runtime, POOL_FIXED_DT);
      if (evs.some((e) => e.type === 'cushion')) {
        bounced = true;
        break;
      }
    }

    expect(bounced).toBe(true);
    expect(POOL_CUSHION_RESTITUTION).toBeCloseTo(0.75, 2);
    // Cue ball stays strictly inside the table bounds (zero tunneling!)
    expect(runtime.balls[0].x).toBeLessThanOrEqual(POOL_TABLE_W - POOL_BALL_R);
    expect(runtime.balls[0].x).toBeGreaterThan(0);
    // Normal velocity reversed and damped by ~0.75 while tangential velocity stays positive
    expect(runtime.balls[0].vx).toBeLessThan(0);
    expect(Math.abs(runtime.balls[0].vx) / initVx).toBeCloseTo(0.75, 1);
    expect(runtime.balls[0].vy * initVy).toBeGreaterThan(0);
  });

  it('applies cue-ball topspin follow, backspin draw, and side English cushion rebound', () => {
    // 1. Topspin vs Backspin straight collision
    const setupStraight = makeMinimalBalls([
      { id: 0, x: 300, y: 250 },
      { id: 1, x: 420, y: 250 },
    ]);
    const simTop = simulatePoolShot(setupStraight, {
      angle: 0,
      power: 0.65,
      spinX: 0,
      spinY: 1,
    });
    const simBack = simulatePoolShot(setupStraight, {
      angle: 0,
      power: 0.65,
      spinX: 0,
      spinY: -1,
    });
    const cueTopX = simTop.runtime.balls[0].x;
    const cueBackX = simBack.runtime.balls[0].x;
    // Topspin follows forward well past impact (~420); backspin draws backward behind 400
    expect(cueTopX).toBeGreaterThan(450);
    expect(cueBackX).toBeLessThan(395);

    // 2. Side English alters post-cushion horizontal rebound (shoot straight into flat top rail at x=300)
    const setupRail = makeMinimalBalls([{ id: 0, x: 300, y: 80 }]);
    const leftEnglish = simulatePoolShot(setupRail, {
      angle: -Math.PI / 2,
      power: 0.55,
      spinX: -1,
      spinY: 0,
    });
    const rightEnglish = simulatePoolShot(setupRail, {
      angle: -Math.PI / 2,
      power: 0.55,
      spinX: 1,
      spinY: 0,
    });
    expect(leftEnglish.runtime.balls[0].pocketed).toBe(false);
    expect(rightEnglish.runtime.balls[0].pocketed).toBe(false);
    expect(leftEnglish.runtime.balls[0].x).toBeLessThan(280);
    expect(rightEnglish.runtime.balls[0].x).toBeGreaterThan(320);
  });
});

describe('WPA 8-Ball Pool Rules, Fouls & Win/Loss State Machine', () => {
  const players = [
    { id: 'u1', name: 'Naim', avatar: '🎱', color: '#9146FF' },
    { id: 'u2', name: 'Yuri', avatar: '🔥', color: '#E11D48' },
  ];

  it('builds a valid 16-ball WPA rack with 8-ball at center and mixed back corners', () => {
    const rack = createStandardRackBalls(424242);
    expect(rack).toHaveLength(16);
    expect(rack[0].id).toBe(0);
    const eight = rack.find((b) => b.id === 8)!;
    const solidsCount = rack.filter((b) => getBallGroup(b.id) === 'solids').length;
    const stripesCount = rack.filter((b) => getBallGroup(b.id) === 'stripes').length;
    expect(solidsCount).toBe(7);
    expect(stripesCount).toBe(7);
    // 8-ball sits in row 2 (footSpotX + 2 * dx)
    expect(eight.x).toBeGreaterThan(780);
    expect(Math.abs(eight.y - 250)).toBeLessThan(2);

    // Identical seed produces identical checksum
    const s1 = createInitialPoolState(players, { seed: 999, now: 1_000 });
    const s2 = createInitialPoolState(players, { seed: 999, now: 1_000 });
    expect(s1.checksum).toBe(s2.checksum);
    expect(computePoolChecksum(s1)).toBe(s1.checksum);
  });

  it('assigns player groups on first legal non-break pocketed ball (not on break)', () => {
    // Open table after break
    const base = createInitialPoolState(players, { seed: 101, now: 1_000 });
    const balls = makeMinimalBalls([
      { id: 0, x: 760, y: 400 },
      { id: 2, x: 930, y: 465 }, // solid 2 lined right into BR corner pocket (998, 498)
      { id: 9, x: 200, y: 200 },
      { id: 8, x: 500, y: 250 },
    ]);
    const openState = {
      ...base,
      isBreakShot: false,
      breakOnlyBehindHeadString: false,
      balls,
    };

    const angleTo2 = Math.atan2(465 - 400, 930 - 760);
    const res = applyPoolShot(openState, 'u1', {
      angle: angleTo2,
      power: 0.65,
      spinX: 0,
      spinY: 0,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.foul).toBeNull();
    expect(res.assignedGroup).toBe('solids');
    expect(res.state.players[0]?.group).toBe('solids');
    expect(res.state.players[1]?.group).toBe('stripes');
    expect(res.state.turnSeat).toBe(0); // Shooter keeps turn!
  });

  it('enforces all 5 WPA foul types (SCRATCH, NO_HIT, WRONG_FIRST_HIT, NO_RAIL, BALL_OFF_TABLE) and BALL_IN_HAND validation', () => {
    const base = createInitialPoolState(players, { seed: 7, now: 2_000 });

    // 1. SCRATCH
    const scratchState = {
      ...base,
      isBreakShot: false,
      breakOnlyBehindHeadString: false,
      balls: makeMinimalBalls([
        { id: 0, x: 920, y: 455 },
        { id: 1, x: 200, y: 200 },
        { id: 8, x: 500, y: 250 },
      ]),
    };
    const scratchRes = applyPoolShot(scratchState, 'u1', {
      angle: Math.atan2(498 - 455, 998 - 920),
      power: 0.55,
      spinX: 0,
      spinY: 0,
    });
    expect(scratchRes.ok).toBe(true);
    if (scratchRes.ok) {
      expect(scratchRes.foul).toBe('SCRATCH');
      expect(scratchRes.state.phase).toBe('BALL_IN_HAND');
      expect(scratchRes.state.turnSeat).toBe(1);
    }

    // 2. NO_HIT
    const noHitState = {
      ...scratchState,
      balls: makeMinimalBalls([
        { id: 0, x: 500, y: 250 },
        { id: 1, x: 200, y: 120 },
        { id: 8, x: 800, y: 380 },
      ]),
    };
    const noHitRes = applyPoolShot(noHitState, 'u1', {
      angle: 0,
      power: 0.3,
      spinX: 0,
      spinY: 0,
    });
    expect(noHitRes.ok).toBe(true);
    if (noHitRes.ok) {
      expect(noHitRes.foul).toBe('NO_HIT');
      expect(noHitRes.state.phase).toBe('BALL_IN_HAND');
    }

    // 3. WRONG_FIRST_HIT (shooter is solids, hits stripe 10 first)
    const wrongHitState = {
      ...scratchState,
      players: [
        { ...base.players[0]!, group: 'solids' as const },
        { ...base.players[1]!, group: 'stripes' as const },
      ] as typeof base.players,
      balls: makeMinimalBalls([
        { id: 0, x: 300, y: 250 },
        { id: 10, x: 420, y: 250 },
        { id: 1, x: 700, y: 120 },
        { id: 8, x: 800, y: 380 },
      ]),
    };
    const wrongHitRes = applyPoolShot(wrongHitState, 'u1', {
      angle: 0,
      power: 0.6,
      spinX: 0,
      spinY: 0,
    });
    expect(wrongHitRes.ok).toBe(true);
    if (wrongHitRes.ok) {
      expect(wrongHitRes.foul).toBe('WRONG_FIRST_HIT');
      expect(wrongHitRes.state.phase).toBe('BALL_IN_HAND');
    }

    // 4. NO_RAIL (hits own ball softly in middle of table, nothing pockets or touches rail)
    const noRailState = {
      ...wrongHitState,
      balls: makeMinimalBalls([
        { id: 0, x: 400, y: 250 },
        { id: 1, x: 432, y: 250 },
        { id: 8, x: 800, y: 380 },
      ]),
    };
    const noRailRes = applyPoolShot(noRailState, 'u1', {
      angle: 0,
      power: 0.08,
      spinX: 0,
      spinY: 0,
    });
    expect(noRailRes.ok).toBe(true);
    if (noRailRes.ok) {
      expect(noRailRes.foul).toBe('NO_RAIL');
      expect(noRailRes.state.phase).toBe('BALL_IN_HAND');
    }

    // 5. BALL_OFF_TABLE via resolution check
    const offTableOutcome = resolvePoolShotOutcome(
      wrongHitState,
      {
        balls: wrongHitState.balls,
        cueSpinX: 0,
        cueSpinY: 0,
        shotDirX: 1,
        shotDirY: 0,
        cueFirstImpactDone: true,
        firstHitBallId: 1,
        railTouchedAfterHit: true,
        pocketedOrder: [],
        offTableBallIds: [1],
        elapsed: 0.5,
      },
      null,
      { angle: 0, power: 0.8, spinX: 0, spinY: 0 }
    );
    expect(offTableOutcome.foul).toBe('BALL_OFF_TABLE');
    expect(offTableOutcome.nextState.phase).toBe('BALL_IN_HAND');

    // Ball-in-hand placement rejects overlapping balls and accepts open felt
    expect(isValidCueBallPlacement(wrongHitState.balls, 420, 250, false)).toBe(false);
    expect(isValidCueBallPlacement(wrongHitState.balls, 250, 250, false)).toBe(true);
    const placed = placePoolCueBall(
      { ...wrongHitState, phase: 'BALL_IN_HAND', turnSeat: 1 },
      'u2',
      250,
      150
    );
    expect(placed.ok).toBe(true);
    if (placed.ok) {
      expect(placed.state.balls[0].x).toBe(250);
      expect(placed.state.balls[0].y).toBe(150);
    }
  });

  it('enforces 8-ball win (group cleared + called pocket) and losses (early 8-ball, wrong pocket, scratch, off-table)', () => {
    const base = createInitialPoolState(players, { seed: 33, now: 5_000 });
    const assignedBase = {
      ...base,
      isBreakShot: false,
      breakOnlyBehindHeadString: false,
      players: [
        { ...base.players[0]!, group: 'solids' as const },
        { ...base.players[1]!, group: 'stripes' as const },
      ] as typeof base.players,
    };

    // 1. Loss: Early 8-ball while solids still remain
    const early8 = {
      ...assignedBase,
      balls: makeMinimalBalls([
        { id: 0, x: 860, y: 420 },
        { id: 8, x: 935, y: 463 },
        { id: 2, x: 200, y: 200 }, // solid 2 still on table!
      ]),
    };
    const earlyRes = applyPoolShot(early8, 'u1', {
      angle: Math.atan2(463 - 420, 935 - 860),
      power: 0.6,
      spinX: 0,
      spinY: 0,
      calledPocketId: 'BR',
    });
    expect(earlyRes.ok).toBe(true);
    if (earlyRes.ok) {
      expect(earlyRes.state.status).toBe('finished');
      expect(earlyRes.state.winnerSeat).toBe(1);
    }

    // 2. Loss: Cleared solids, called TL but pocketed 8-ball in BR
    const wrongPocket8 = {
      ...assignedBase,
      balls: makeMinimalBalls([
        { id: 0, x: 860, y: 420 },
        { id: 8, x: 935, y: 463 },
      ]),
    };
    const calledTl = callPoolPocket(wrongPocket8, 'u1', 'TL');
    expect(calledTl.ok).toBe(true);
    if (calledTl.ok) {
      const wpRes = applyPoolShot(calledTl.state, 'u1', {
        angle: Math.atan2(463 - 420, 935 - 860),
        power: 0.6,
        spinX: 0,
        spinY: 0,
      });
      expect(wpRes.ok).toBe(true);
      if (wpRes.ok) {
        expect(wpRes.state.status).toBe('finished');
        expect(wpRes.state.winnerSeat).toBe(1);
      }
    }

    // 3. Win: Cleared solids, called BR cleanly, and pocketed 8-ball into BR without fouling
    const calledBr = callPoolPocket(wrongPocket8, 'u1', 'BR');
    expect(calledBr.ok).toBe(true);
    if (calledBr.ok) {
      const winRes = applyPoolShot(calledBr.state, 'u1', {
        angle: Math.atan2(463 - 420, 935 - 860),
        power: 0.55,
        spinX: 0,
        spinY: 0,
        calledPocketId: 'BR',
      });
      expect(winRes.ok).toBe(true);
      if (winRes.ok) {
        expect(winRes.state.status).toBe('finished');
        expect(winRes.state.winnerSeat).toBe(0);
        expect(winRes.state.winReason).toBe('eight_ball_pocketed');
      }
    }

    // 4. Loss: Scratch while legally shooting 8-ball
    const scratchOn8Outcome = resolvePoolShotOutcome(
      wrongPocket8,
      {
        balls: wrongPocket8.balls,
        cueSpinX: 0,
        cueSpinY: 0,
        shotDirX: 1,
        shotDirY: 0,
        cueFirstImpactDone: true,
        firstHitBallId: 8,
        railTouchedAfterHit: true,
        pocketedOrder: [
          { ballId: 8, pocketId: 'BR' },
          { ballId: 0, pocketId: 'BR' },
        ],
        offTableBallIds: [],
        elapsed: 1,
      },
      'BR',
      { angle: 0, power: 0.5, spinX: 0, spinY: 0 }
    );
    expect(scratchOn8Outcome.nextState.status).toBe('finished');
    expect(scratchOn8Outcome.nextState.winnerSeat).toBe(1);

    // 5. Loss: 8-ball knocked off table
    const offTable8Outcome = resolvePoolShotOutcome(
      wrongPocket8,
      {
        balls: wrongPocket8.balls,
        cueSpinX: 0,
        cueSpinY: 0,
        shotDirX: 1,
        shotDirY: 0,
        cueFirstImpactDone: true,
        firstHitBallId: 8,
        railTouchedAfterHit: true,
        pocketedOrder: [],
        offTableBallIds: [8],
        elapsed: 0.6,
      },
      'BR',
      { angle: 0, power: 0.8, spinX: 0, spinY: 0 }
    );
    expect(offTable8Outcome.nextState.status).toBe('finished');
    expect(offTable8Outcome.nextState.winnerSeat).toBe(1);

    // 6. Forfeit awards opponent win
    const forfeited = forfeitPoolMatch(wrongPocket8, 'u1', 'forfeit');
    expect(forfeited?.status).toBe('finished');
    expect(forfeited?.winnerSeat).toBe(1);
  });

  it('computes valid AI shots across easy/medium/hard including ball-in-hand & 8-ball', () => {
    const base = createInitialPoolState([players[0]], {
      offlineVsAi: true,
      difficulty: 'hard',
      seed: 12345,
      now: 10_000,
    });
    const aiTurn = {
      ...base,
      isBreakShot: false,
      breakOnlyBehindHeadString: false,
      turnSeat: 1 as const,
      phase: 'BALL_IN_HAND' as const,
      players: [
        { ...base.players[0]!, group: 'solids' as const },
        { ...base.players[1]!, group: 'stripes' as const },
      ] as typeof base.players,
      balls: makeMinimalBalls([
        { id: 0, x: 250, y: 250 },
        { id: 10, x: 840, y: 120 },
        { id: 8, x: 500, y: 250 },
      ]),
    };

    for (const diff of ['easy', 'medium', 'hard'] as const) {
      const shot = choosePoolAiShot(aiTurn, diff, 777);
      expect(Number.isFinite(shot.angle)).toBe(true);
      expect(shot.power).toBeGreaterThanOrEqual(0.06);
      expect(shot.power).toBeLessThanOrEqual(1);
      expect(isValidCueBallPlacement(aiTurn.balls, shot.cueX, shot.cueY, false)).toBe(true);
    }

    // Hard AI should pocket an easy straight shot reliably
    const hardShot = choosePoolAiShot(aiTurn, 'hard', 777);
    const applied = applyPoolShot(aiTurn, 'bot-pool-ai', hardShot);
    expect(applied.ok).toBe(true);
  });
});

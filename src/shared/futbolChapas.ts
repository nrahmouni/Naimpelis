/**
 * NAIM CINE — Fútbol Chapas (Flick Table Soccer · 1v1 / 2v2 + AI Bots)
 * Deterministic 180Hz 2D rigid-disc physics engine shared by Client & Authoritative Server:
 * - 6 caps (chapas) per team (#1 Goalkeeper + #2..#6 Field formation)
 * - Up to 3 consecutive passes per turn when touching the ball (Pases: 0/3 -> 3/3)
 * - First team to 3 goals wins (Goles para ganar: 3)
 * - 1v1 or 2v2 teams with toggleable AI bots and selectable national team emblems
 */

export const CHAPAS_ARENA_W = 540;
export const CHAPAS_ARENA_H = 780;
export const CHAPAS_PITCH_LEFT = 62;
export const CHAPAS_PITCH_RIGHT = 478;
export const CHAPAS_PITCH_TOP = 64;
export const CHAPAS_PITCH_BOTTOM = 716;
export const CHAPAS_PITCH_W = CHAPAS_PITCH_RIGHT - CHAPAS_PITCH_LEFT; // 416
export const CHAPAS_PITCH_H = CHAPAS_PITCH_BOTTOM - CHAPAS_PITCH_TOP; // 652
export const CHAPAS_GOAL_LEFT = 202;
export const CHAPAS_GOAL_RIGHT = 338;
export const CHAPAS_GOAL_WIDTH = CHAPAS_GOAL_RIGHT - CHAPAS_GOAL_LEFT; // 136
export const CHAPAS_GOAL_DEPTH = 36;
export const CHAPAS_GOALPOST_RADIUS = 6;

export const CHAPAS_CAP_RADIUS = 21.5;
export const CHAPAS_BALL_RADIUS = 10.5;
export const CHAPAS_MAX_SHOT_SPEED = 24.5;
export const CHAPAS_MIN_POWER = 0.08;
export const CHAPAS_GOALS_TO_WIN = 3;
export const CHAPAS_MAX_PASSES = 3;
export const CHAPAS_TURN_TIMEOUT_MS = 15_000;

export const CHAPAS_SUBSTEPS = 3;
export const CHAPAS_MAX_SIM_FRAMES = 240;

export type ChapasTeamId = 'A' | 'B';

export type ChapasFlagId = 'ar' | 'es' | 'br' | 'fr' | 'ma' | 'pt' | 'it' | 'de';

export interface ChapasFlagPreset {
  id: ChapasFlagId;
  name: string;
  short: string;
  primary: string;
  secondary: string;
  accent: string;
}

export const CHAPAS_TEAM_PRESETS: ChapasFlagPreset[] = [
  { id: 'ar', name: 'Argentina', short: 'ARG', primary: '#75AADB', secondary: '#FFFFFF', accent: '#F6B40E' },
  { id: 'es', name: 'España', short: 'ESP', primary: '#C60B1E', secondary: '#FFC400', accent: '#AD1519' },
  { id: 'br', name: 'Brasil', short: 'BRA', primary: '#009C3B', secondary: '#FFDF00', accent: '#002776' },
  { id: 'fr', name: 'Francia', short: 'FRA', primary: '#002395', secondary: '#FFFFFF', accent: '#ED2939' },
  { id: 'ma', name: 'Marruecos', short: 'MAR', primary: '#C1272D', secondary: '#006233', accent: '#F59E0B' },
  { id: 'pt', name: 'Portugal', short: 'POR', primary: '#046A38', secondary: '#DA291C', accent: '#FFE900' },
  { id: 'it', name: 'Italia', short: 'ITA', primary: '#009246', secondary: '#FFFFFF', accent: '#CE2B37' },
  { id: 'de', name: 'Alemania', short: 'ALE', primary: '#111111', secondary: '#DD0000', accent: '#FFCE00' },
];

export interface ChapasPlayerSeat {
  seatIndex: 0 | 1 | 2 | 3; // 0,1 = Team A (Top); 2,3 = Team B (Bottom)
  team: ChapasTeamId;
  userId: string;
  name: string;
  avatar: string;
  color: string;
  isBot: boolean;
  connected: boolean;
}

export interface ChapasCap {
  id: string; // e.g. 'A-1'..'A-6', 'B-1'..'B-6'
  team: ChapasTeamId;
  number: 1 | 2 | 3 | 4 | 5 | 6;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface ChapasBall {
  x: number;
  y: number;
  vx: number;
  vy: number;
  spinAngle: number;
}

export interface ChapasShotInput {
  capId: string;
  angle: number;
  power: number; // 0..1
}

export interface ChapasShotSummary {
  capId: string;
  angle: number;
  power: number;
  shooterUserId: string;
  turnNumber: number;
  goalScoredBy: ChapasTeamId | null;
  ballTouched: boolean;
}

export interface FutbolChapasState {
  id: string;
  gameType: 'chapas';
  status: 'waiting' | 'playing' | 'finished';
  players: [
    ChapasPlayerSeat | null,
    ChapasPlayerSeat | null,
    ChapasPlayerSeat | null,
    ChapasPlayerSeat | null,
  ];
  teamFlags: Record<ChapasTeamId, ChapasFlagId>;
  scores: Record<ChapasTeamId, number>;
  goalsToWin: number;
  activeTeam: ChapasTeamId;
  activeSeatIndex: 0 | 1 | 2 | 3;
  turnNumber: number;
  passesUsed: number;
  maxPasses: number;
  botsEnabled: boolean;
  awaitingHostStart: boolean;
  caps: ChapasCap[];
  ball: ChapasBall;
  winnerTeam: ChapasTeamId | null;
  statusMessage: string;
  lastGoalTeam: ChapasTeamId | null;
  lastGoalByName: string | null;
  lastGoalAt: number;
  lastShot: ChapasShotSummary | null;
  turnDeadlineAt: number;
  updatedAt: number;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function createInitialChapasCaps(): ChapasCap[] {
  const cx = CHAPAS_ARENA_W / 2; // 270
  return [
    // Team A (Top half, defends TOP goal, attacks BOTTOM goal)
    { id: 'A-1', team: 'A', number: 1, x: cx, y: CHAPAS_PITCH_TOP + 22, vx: 0, vy: 0 },
    { id: 'A-2', team: 'A', number: 2, x: CHAPAS_PITCH_LEFT + 68, y: CHAPAS_PITCH_TOP + 118, vx: 0, vy: 0 },
    { id: 'A-3', team: 'A', number: 3, x: CHAPAS_PITCH_RIGHT - 68, y: CHAPAS_PITCH_TOP + 118, vx: 0, vy: 0 },
    { id: 'A-4', team: 'A', number: 4, x: cx - 86, y: CHAPAS_PITCH_TOP + 224, vx: 0, vy: 0 },
    { id: 'A-5', team: 'A', number: 5, x: cx + 86, y: CHAPAS_PITCH_TOP + 224, vx: 0, vy: 0 },
    { id: 'A-6', team: 'A', number: 6, x: cx, y: CHAPAS_PITCH_TOP + 278, vx: 0, vy: 0 },

    // Team B (Bottom half, defends BOTTOM goal, attacks TOP goal)
    { id: 'B-1', team: 'B', number: 1, x: cx, y: CHAPAS_PITCH_BOTTOM - 22, vx: 0, vy: 0 },
    { id: 'B-2', team: 'B', number: 2, x: CHAPAS_PITCH_RIGHT - 68, y: CHAPAS_PITCH_BOTTOM - 118, vx: 0, vy: 0 },
    { id: 'B-3', team: 'B', number: 3, x: CHAPAS_PITCH_LEFT + 68, y: CHAPAS_PITCH_BOTTOM - 118, vx: 0, vy: 0 },
    { id: 'B-4', team: 'B', number: 4, x: cx + 86, y: CHAPAS_PITCH_BOTTOM - 224, vx: 0, vy: 0 },
    { id: 'B-5', team: 'B', number: 5, x: cx - 86, y: CHAPAS_PITCH_BOTTOM - 224, vx: 0, vy: 0 },
    { id: 'B-6', team: 'B', number: 6, x: cx, y: CHAPAS_PITCH_BOTTOM - 278, vx: 0, vy: 0 },
  ];
}

export function createInitialChapasBall(): ChapasBall {
  return {
    x: CHAPAS_ARENA_W / 2,
    y: (CHAPAS_PITCH_TOP + CHAPAS_PITCH_BOTTOM) / 2,
    vx: 0,
    vy: 0,
    spinAngle: 0,
  };
}

export function getChapasTeamSeats(team: ChapasTeamId): [0 | 1 | 2 | 3, 0 | 1 | 2 | 3] {
  return team === 'A' ? [0, 1] : [2, 3];
}

function findNextSeatInTeam(
  players: FutbolChapasState['players'],
  team: ChapasTeamId,
  currentSeatIndex: number
): 0 | 1 | 2 | 3 {
  const [s0, s1] = getChapasTeamSeats(team);
  const p0 = players[s0];
  const p1 = players[s1];
  if (currentSeatIndex === s0 && p1) return s1;
  if (currentSeatIndex === s1 && p0) return s0;
  if (p0) return s0;
  if (p1) return s1;
  return s0;
}

function makeChapasBot(seatIndex: 0 | 1 | 2 | 3): ChapasPlayerSeat {
  const team: ChapasTeamId = seatIndex <= 1 ? 'A' : 'B';
  const botNames = ['Bot Leo', 'Bot Pedri', 'Bot Nico', 'Bot Lamine'];
  return {
    seatIndex,
    team,
    userId: `bot-chapas-${seatIndex}`,
    name: botNames[seatIndex] || 'Bot IA',
    avatar: '🤖',
    color: team === 'A' ? '#38BDF8' : '#F43F5E',
    isBot: true,
    connected: true,
  };
}

export function createInitialChapasState(
  humans: Array<{ id: string; name: string; avatar?: string; color?: string }>,
  opts?: {
    waitForHost?: boolean;
    botsEnabled?: boolean;
    teamFlags?: Record<ChapasTeamId, ChapasFlagId>;
  }
): FutbolChapasState {
  const now = Date.now();
  const waitForHost = opts?.waitForHost ?? true;
  const botsEnabled = opts?.botsEnabled ?? true;

  const cleanHumans: Array<{ id: string; name: string; avatar?: string; color?: string }> = [];
  const seen = new Set<string>();
  for (const h of humans) {
    if (!h?.id || seen.has(h.id)) continue;
    seen.add(h.id);
    cleanHumans.push(h);
    if (cleanHumans.length >= 4) break;
  }

  const players: FutbolChapasState['players'] = [null, null, null, null];

  if (waitForHost) {
    // Only pre-seat the initiator (host) in Team A slot 0 so invited companions choose Team A/B when joining
    if (cleanHumans[0]) {
      players[0] = {
        seatIndex: 0,
        team: 'A',
        userId: cleanHumans[0].id,
        name: cleanHumans[0].name,
        avatar: cleanHumans[0].avatar || '⚽',
        color: cleanHumans[0].color || '#38BDF8',
        isBot: false,
        connected: true,
      };
    }
    if (botsEnabled) {
      // Fill slot 2 (Team B lead) as default rival bot preview while waiting
      players[2] = makeChapasBot(2);
    }
  } else {
    // Direct start (offline vs IA or rematch): assign humans alternating teams B/A, bots where needed
    const seatOrder: Array<0 | 1 | 2 | 3> = [0, 2, 1, 3];
    cleanHumans.forEach((h, i) => {
      const idx = seatOrder[i];
      const team: ChapasTeamId = idx <= 1 ? 'A' : 'B';
      players[idx] = {
        seatIndex: idx,
        team,
        userId: h.id,
        name: h.name,
        avatar: h.avatar || '⚽',
        color: h.color || (team === 'A' ? '#38BDF8' : '#F43F5E'),
        isBot: false,
        connected: true,
      };
    });
    if (!players[2] && botsEnabled) {
      players[2] = makeChapasBot(2);
    }
    if (!players[0] && botsEnabled) {
      players[0] = makeChapasBot(0);
    }
  }

  const activeSeatIndex = findNextSeatInTeam(players, 'A', 1);
  const status: FutbolChapasState['status'] = waitForHost ? 'waiting' : 'playing';

  return {
    id: `chapas-${now}`,
    gameType: 'chapas',
    status,
    players,
    teamFlags: opts?.teamFlags || { A: 'ar', B: 'es' },
    scores: { A: 0, B: 0 },
    goalsToWin: CHAPAS_GOALS_TO_WIN,
    activeTeam: 'A',
    activeSeatIndex,
    turnNumber: 1,
    passesUsed: 0,
    maxPasses: CHAPAS_MAX_PASSES,
    botsEnabled,
    awaitingHostStart: waitForHost,
    caps: createInitialChapasCaps(),
    ball: createInitialChapasBall(),
    winnerTeam: null,
    statusMessage: waitForHost
      ? 'Elige equipo y pulsa Play para sacar'
      : `Saque inicial · Turno de ${players[activeSeatIndex]?.name || 'Equipo A'}`,
    lastGoalTeam: null,
    lastGoalByName: null,
    lastGoalAt: 0,
    lastShot: null,
    turnDeadlineAt: status === 'playing' ? now + CHAPAS_TURN_TIMEOUT_MS : 0,
    updatedAt: now,
  };
}

export function joinChapasSeat(
  state: FutbolChapasState,
  user: { id: string; name: string; avatar?: string; color?: string },
  requestedSeat?: 0 | 1 | 2 | 3 | 'spectate',
  now = Date.now()
): { ok: true; state: FutbolChapasState } | { ok: false; error: string } {
  if (state.status === 'finished') {
    return { ok: false, error: 'La partida ya terminó.' };
  }

  const nextPlayers: FutbolChapasState['players'] = [
    state.players[0] ? { ...state.players[0] } : null,
    state.players[1] ? { ...state.players[1] } : null,
    state.players[2] ? { ...state.players[2] } : null,
    state.players[3] ? { ...state.players[3] } : null,
  ];

  // If user wants to leave seat
  if (requestedSeat === 'spectate') {
    if (state.status === 'playing') {
      return { ok: false, error: 'No puedes bajar a espectador con el partido iniciado.' };
    }
    for (let i = 0; i < 4; i += 1) {
      if (nextPlayers[i]?.userId === user.id) {
        nextPlayers[i] = null;
      }
    }
  } else {
    let targetIdx: 0 | 1 | 2 | 3 | null =
      typeof requestedSeat === 'number' ? requestedSeat : null;

    if (targetIdx === null) {
      // Auto-pick best balanced seat: prefer Team B first if A has humans, else A
      const countA = [0, 1].filter((i) => nextPlayers[i] && !nextPlayers[i]!.isBot).length;
      const countB = [2, 3].filter((i) => nextPlayers[i] && !nextPlayers[i]!.isBot).length;
      const preferredOrder: Array<0 | 1 | 2 | 3> =
        countB <= countA ? [2, 3, 0, 1] : [0, 1, 2, 3];
      for (const idx of preferredOrder) {
        if (!nextPlayers[idx] || nextPlayers[idx]!.isBot || nextPlayers[idx]!.userId === user.id) {
          targetIdx = idx;
          break;
        }
      }
    }

    if (targetIdx === null) {
      return { ok: false, error: 'Todos los puestos están ocupados por jugadores.' };
    }

    const occupiedByHuman =
      nextPlayers[targetIdx] &&
      !nextPlayers[targetIdx]!.isBot &&
      nextPlayers[targetIdx]!.userId !== user.id;
    if (occupiedByHuman) {
      return { ok: false, error: 'Ese puesto ya está ocupado.' };
    }

    // Remove user from any old seat
    for (let i = 0; i < 4; i += 1) {
      if (i !== targetIdx && nextPlayers[i]?.userId === user.id) {
        nextPlayers[i] = null;
      }
    }

    const team: ChapasTeamId = targetIdx <= 1 ? 'A' : 'B';
    nextPlayers[targetIdx] = {
      seatIndex: targetIdx,
      team,
      userId: user.id,
      name: user.name,
      avatar: user.avatar || '⚽',
      color: user.color || (team === 'A' ? '#38BDF8' : '#F43F5E'),
      isBot: false,
      connected: true,
    };
  }

  return {
    ok: true,
    state: {
      ...state,
      players: nextPlayers,
      updatedAt: now,
    },
  };
}

export function toggleChapasBots(
  state: FutbolChapasState,
  botsEnabled: boolean,
  now = Date.now()
): FutbolChapasState {
  if (state.status !== 'waiting') return state;
  const nextPlayers: FutbolChapasState['players'] = [
    state.players[0] ? { ...state.players[0] } : null,
    state.players[1] ? { ...state.players[1] } : null,
    state.players[2] ? { ...state.players[2] } : null,
    state.players[3] ? { ...state.players[3] } : null,
  ];

  if (!botsEnabled) {
    for (let i = 0; i < 4; i += 1) {
      if (nextPlayers[i]?.isBot) {
        nextPlayers[i] = null;
      }
    }
  } else {
    // Ensure at least one opponent exists on Team B (slot 2) or Team A (slot 0)
    const hasA = Boolean(nextPlayers[0] || nextPlayers[1]);
    const hasB = Boolean(nextPlayers[2] || nextPlayers[3]);
    if (!hasA) nextPlayers[0] = makeChapasBot(0);
    if (!hasB) nextPlayers[2] = makeChapasBot(2);
  }

  return {
    ...state,
    botsEnabled,
    players: nextPlayers,
    updatedAt: now,
  };
}

export function updateChapasTeamFlag(
  state: FutbolChapasState,
  team: ChapasTeamId,
  flag: ChapasFlagId,
  now = Date.now()
): FutbolChapasState {
  if (state.status === 'finished') return state;
  return {
    ...state,
    teamFlags: {
      ...state.teamFlags,
      [team]: flag,
    },
    updatedAt: now,
  };
}

export function startChapasMatch(
  state: FutbolChapasState,
  now = Date.now()
): { ok: true; state: FutbolChapasState } | { ok: false; error: string } {
  if (state.status === 'playing') return { ok: true, state };
  const nextPlayers: FutbolChapasState['players'] = [
    state.players[0] ? { ...state.players[0] } : null,
    state.players[1] ? { ...state.players[1] } : null,
    state.players[2] ? { ...state.players[2] } : null,
    state.players[3] ? { ...state.players[3] } : null,
  ];

  const hasA = Boolean(nextPlayers[0] || nextPlayers[1]);
  const hasB = Boolean(nextPlayers[2] || nextPlayers[3]);
  if (!hasA) {
    if (!state.botsEnabled) {
      return { ok: false, error: 'Falta un jugador en el Equipo 1 (o activa Bots).' };
    }
    nextPlayers[0] = makeChapasBot(0);
  }
  if (!hasB) {
    if (!state.botsEnabled) {
      return { ok: false, error: 'Falta un jugador en el Equipo 2 (o activa Bots).' };
    }
    nextPlayers[2] = makeChapasBot(2);
  }

  const activeSeatIndex = findNextSeatInTeam(nextPlayers, 'A', 1);
  return {
    ok: true,
    state: {
      ...state,
      players: nextPlayers,
      status: 'playing',
      awaitingHostStart: false,
      activeTeam: 'A',
      activeSeatIndex,
      turnNumber: 1,
      passesUsed: 0,
      statusMessage: `¡Pitido inicial! Turno de ${nextPlayers[activeSeatIndex]?.name || 'Equipo A'}`,
      turnDeadlineAt: now + CHAPAS_TURN_TIMEOUT_MS,
      updatedAt: now,
    },
  };
}

// ============================================================================
// DETERMINISTIC 2D RIGID DISC PHYSICS STEPPER
// ============================================================================
export interface ChapasPhysicsStepResult {
  anyMoving: boolean;
  ballTouched: boolean;
  goalScoredBy: ChapasTeamId | null;
  capHitCount: number;
  ballHitCount: number;
  postHitCount: number;
}

const GOALPOSTS = [
  { x: CHAPAS_GOAL_LEFT, y: CHAPAS_PITCH_TOP },
  { x: CHAPAS_GOAL_RIGHT, y: CHAPAS_PITCH_TOP },
  { x: CHAPAS_GOAL_LEFT, y: CHAPAS_PITCH_BOTTOM },
  { x: CHAPAS_GOAL_RIGHT, y: CHAPAS_PITCH_BOTTOM },
];

export function stepChapasPhysicsFrame(
  caps: ChapasCap[],
  ball: ChapasBall
): ChapasPhysicsStepResult {
  let ballTouched = false;
  let goalScoredBy: ChapasTeamId | null = null;
  let capHitCount = 0;
  let ballHitCount = 0;
  let postHitCount = 0;

  const capMass = 2.6;
  const ballMass = 1.0;

  for (let sub = 0; sub < CHAPAS_SUBSTEPS; sub += 1) {
    const dt = 1 / CHAPAS_SUBSTEPS;

    // 1. Integrate positions
    for (const c of caps) {
      c.x += c.vx * dt;
      c.y += c.vy * dt;
    }
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    ball.spinAngle += Math.hypot(ball.vx, ball.vy) * dt * 0.08;

    // 2. Cap-Wall collisions (keep caps inside pitch rails)
    for (const c of caps) {
      if (c.x < CHAPAS_PITCH_LEFT + CHAPAS_CAP_RADIUS) {
        c.x = CHAPAS_PITCH_LEFT + CHAPAS_CAP_RADIUS;
        c.vx = Math.abs(c.vx) * 0.78;
      } else if (c.x > CHAPAS_PITCH_RIGHT - CHAPAS_CAP_RADIUS) {
        c.x = CHAPAS_PITCH_RIGHT - CHAPAS_CAP_RADIUS;
        c.vx = -Math.abs(c.vx) * 0.78;
      }

      if (c.y < CHAPAS_PITCH_TOP + CHAPAS_CAP_RADIUS) {
        c.y = CHAPAS_PITCH_TOP + CHAPAS_CAP_RADIUS;
        c.vy = Math.abs(c.vy) * 0.78;
      } else if (c.y > CHAPAS_PITCH_BOTTOM - CHAPAS_CAP_RADIUS) {
        c.y = CHAPAS_PITCH_BOTTOM - CHAPAS_CAP_RADIUS;
        c.vy = -Math.abs(c.vy) * 0.78;
      }
    }

    // 3. Ball-Wall & Goal Mouth / Net collisions
    const inGoalMouthX =
      ball.x > CHAPAS_GOAL_LEFT + CHAPAS_BALL_RADIUS * 0.35 &&
      ball.x < CHAPAS_GOAL_RIGHT - CHAPAS_BALL_RADIUS * 0.35;

    if (ball.x < CHAPAS_PITCH_LEFT + CHAPAS_BALL_RADIUS) {
      ball.x = CHAPAS_PITCH_LEFT + CHAPAS_BALL_RADIUS;
      ball.vx = Math.abs(ball.vx) * 0.82;
    } else if (ball.x > CHAPAS_PITCH_RIGHT - CHAPAS_BALL_RADIUS) {
      ball.x = CHAPAS_PITCH_RIGHT - CHAPAS_BALL_RADIUS;
      ball.vx = -Math.abs(ball.vx) * 0.82;
    }

    // Top wall or inside Top Goal
    if (ball.y < CHAPAS_PITCH_TOP + CHAPAS_BALL_RADIUS) {
      if (inGoalMouthX) {
        // Ball can enter the net; keep inside goal net side/back walls
        if (ball.x < CHAPAS_GOAL_LEFT + CHAPAS_BALL_RADIUS) {
          ball.x = CHAPAS_GOAL_LEFT + CHAPAS_BALL_RADIUS;
          ball.vx = Math.abs(ball.vx) * 0.55;
        } else if (ball.x > CHAPAS_GOAL_RIGHT - CHAPAS_BALL_RADIUS) {
          ball.x = CHAPAS_GOAL_RIGHT - CHAPAS_BALL_RADIUS;
          ball.vx = -Math.abs(ball.vx) * 0.55;
        }
        if (ball.y < CHAPAS_PITCH_TOP - CHAPAS_GOAL_DEPTH + CHAPAS_BALL_RADIUS) {
          ball.y = CHAPAS_PITCH_TOP - CHAPAS_GOAL_DEPTH + CHAPAS_BALL_RADIUS;
          ball.vy = Math.abs(ball.vy) * 0.35;
        }
        if (ball.y < CHAPAS_PITCH_TOP - CHAPAS_BALL_RADIUS * 0.4 && !goalScoredBy) {
          goalScoredBy = 'B';
        }
      } else {
        ball.y = CHAPAS_PITCH_TOP + CHAPAS_BALL_RADIUS;
        ball.vy = Math.abs(ball.vy) * 0.82;
      }
    }

    // Bottom wall or inside Bottom Goal
    if (ball.y > CHAPAS_PITCH_BOTTOM - CHAPAS_BALL_RADIUS) {
      if (inGoalMouthX) {
        if (ball.x < CHAPAS_GOAL_LEFT + CHAPAS_BALL_RADIUS) {
          ball.x = CHAPAS_GOAL_LEFT + CHAPAS_BALL_RADIUS;
          ball.vx = Math.abs(ball.vx) * 0.55;
        } else if (ball.x > CHAPAS_GOAL_RIGHT - CHAPAS_BALL_RADIUS) {
          ball.x = CHAPAS_GOAL_RIGHT - CHAPAS_BALL_RADIUS;
          ball.vx = -Math.abs(ball.vx) * 0.55;
        }
        if (ball.y > CHAPAS_PITCH_BOTTOM + CHAPAS_GOAL_DEPTH - CHAPAS_BALL_RADIUS) {
          ball.y = CHAPAS_PITCH_BOTTOM + CHAPAS_GOAL_DEPTH - CHAPAS_BALL_RADIUS;
          ball.vy = -Math.abs(ball.vy) * 0.35;
        }
        if (ball.y > CHAPAS_PITCH_BOTTOM + CHAPAS_BALL_RADIUS * 0.4 && !goalScoredBy) {
          goalScoredBy = 'A';
        }
      } else {
        ball.y = CHAPAS_PITCH_BOTTOM - CHAPAS_BALL_RADIUS;
        ball.vy = -Math.abs(ball.vy) * 0.82;
      }
    }

    // 4. Ball vs Goalposts (cylindrical posts)
    const minPostDist = CHAPAS_BALL_RADIUS + CHAPAS_GOALPOST_RADIUS;
    for (const post of GOALPOSTS) {
      const dx = ball.x - post.x;
      const dy = ball.y - post.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 0.0001 && dist < minPostDist) {
        const nx = dx / dist;
        const ny = dy / dist;
        const overlap = minPostDist - dist;
        ball.x += nx * overlap;
        ball.y += ny * overlap;
        const vn = ball.vx * nx + ball.vy * ny;
        if (vn < 0) {
          const j = -(1 + 0.8) * vn;
          ball.vx += j * nx;
          ball.vy += j * ny;
          postHitCount += 1;
        }
      }
    }

    // 5. Cap-Cap collisions
    const minCapDist = CHAPAS_CAP_RADIUS * 2;
    for (let i = 0; i < caps.length; i += 1) {
      for (let j = i + 1; j < caps.length; j += 1) {
        const a = caps[i];
        const b = caps[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 0.0001 && dist < minCapDist) {
          const nx = dx / dist;
          const ny = dy / dist;
          const overlap = (minCapDist - dist) * 0.5;
          a.x -= nx * overlap;
          a.y -= ny * overlap;
          b.x += nx * overlap;
          b.y += ny * overlap;

          const rvx = b.vx - a.vx;
          const rvy = b.vy - a.vy;
          const velAlongNormal = rvx * nx + rvy * ny;
          if (velAlongNormal < 0) {
            const restitution = 0.86;
            const impulse = (-(1 + restitution) * velAlongNormal) / (1 / capMass + 1 / capMass);
            const ix = impulse * nx;
            const iy = impulse * ny;
            a.vx -= ix / capMass;
            a.vy -= iy / capMass;
            b.vx += ix / capMass;
            b.vy += iy / capMass;
            if (Math.abs(velAlongNormal) > 0.6) capHitCount += 1;
          }
        }
      }
    }

    // 6. Cap-Ball collisions
    const minCapBallDist = CHAPAS_CAP_RADIUS + CHAPAS_BALL_RADIUS;
    for (const c of caps) {
      const dx = ball.x - c.x;
      const dy = ball.y - c.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 0.0001 && dist < minCapBallDist) {
        const nx = dx / dist;
        const ny = dy / dist;
        const overlap = minCapBallDist - dist;
        c.x -= nx * overlap * 0.25;
        c.y -= ny * overlap * 0.25;
        ball.x += nx * overlap * 0.75;
        ball.y += ny * overlap * 0.75;

        const rvx = ball.vx - c.vx;
        const rvy = ball.vy - c.vy;
        const velAlongNormal = rvx * nx + rvy * ny;
        if (velAlongNormal < 0) {
          const restitution = 0.88;
          const impulse = (-(1 + restitution) * velAlongNormal) / (1 / capMass + 1 / ballMass);
          const ix = impulse * nx;
          const iy = impulse * ny;
          c.vx -= ix / capMass;
          c.vy -= iy / capMass;
          ball.vx += ix / ballMass;
          ball.vy += iy / ballMass;
          ballTouched = true;
          if (Math.abs(velAlongNormal) > 0.5) ballHitCount += 1;
        }
      }
    }
  }

  // 7. Apply smooth turf friction per 60Hz frame
  let anyMoving = false;
  for (const c of caps) {
    c.vx *= 0.962;
    c.vy *= 0.962;
    if (Math.hypot(c.vx, c.vy) < 0.065) {
      c.vx = 0;
      c.vy = 0;
    } else {
      anyMoving = true;
    }
  }

  ball.vx *= 0.976;
  ball.vy *= 0.976;
  if (Math.hypot(ball.vx, ball.vy) < 0.065) {
    ball.vx = 0;
    ball.vy = 0;
  } else {
    anyMoving = true;
  }

  return {
    anyMoving,
    ballTouched,
    goalScoredBy,
    capHitCount,
    ballHitCount,
    postHitCount,
  };
}

export function shootChapasCap(
  state: FutbolChapasState,
  actorUserId: string,
  shot: ChapasShotInput,
  now = Date.now()
): { ok: true; state: FutbolChapasState; preShotState: FutbolChapasState } | { ok: false; error: string } {
  if (state.status !== 'playing') {
    return { ok: false, error: 'El partido no está en juego.' };
  }
  const activeSeat = state.players[state.activeSeatIndex];
  if (!activeSeat || (!activeSeat.isBot && activeSeat.userId !== actorUserId)) {
    return { ok: false, error: 'No es tu turno.' };
  }

  const targetCapIdx = state.caps.findIndex((c) => c.id === shot.capId);
  if (targetCapIdx === -1) {
    return { ok: false, error: 'Chapa no encontrada.' };
  }
  const targetCap = state.caps[targetCapIdx];
  if (targetCap.team !== state.activeTeam) {
    return { ok: false, error: 'Solo puedes mover tus propias chapas.' };
  }

  const power = clamp(Number(shot.power) || 0, CHAPAS_MIN_POWER, 1);
  const angle = Number.isFinite(shot.angle) ? shot.angle : 0;
  const speed = power * CHAPAS_MAX_SHOT_SPEED;

  const preShotState: FutbolChapasState = {
    ...state,
    caps: state.caps.map((c) => ({ ...c })),
    ball: { ...state.ball },
  };

  const simCaps = state.caps.map((c) => ({ ...c, vx: 0, vy: 0 }));
  simCaps[targetCapIdx].vx = Math.cos(angle) * speed;
  simCaps[targetCapIdx].vy = Math.sin(angle) * speed;

  const simBall: ChapasBall = { ...state.ball, vx: 0, vy: 0 };

  let ballTouched = false;
  let goalScoredBy: ChapasTeamId | null = null;

  for (let frame = 0; frame < CHAPAS_MAX_SIM_FRAMES; frame += 1) {
    const step = stepChapasPhysicsFrame(simCaps, simBall);
    if (step.ballTouched) ballTouched = true;
    if (step.goalScoredBy && !goalScoredBy) {
      goalScoredBy = step.goalScoredBy;
    }
    if (!step.anyMoving) break;
  }

  // Zero out residual velocities
  for (const c of simCaps) {
    c.vx = 0;
    c.vy = 0;
  }
  simBall.vx = 0;
  simBall.vy = 0;

  const nextScores = { ...state.scores };
  const nextTurnNumber = state.turnNumber + 1;
  let nextCaps = simCaps;
  let nextBall = simBall;
  let nextStatus: FutbolChapasState['status'] = 'playing';
  let winnerTeam: ChapasTeamId | null = null;
  let nextActiveTeam: ChapasTeamId = state.activeTeam;
  let nextActiveSeatIndex = state.activeSeatIndex;
  let nextPassesUsed = state.passesUsed;
  let statusMessage = '';
  let lastGoalTeam = state.lastGoalTeam;
  let lastGoalByName = state.lastGoalByName;
  let lastGoalAt = state.lastGoalAt;

  if (goalScoredBy) {
    nextScores[goalScoredBy] += 1;
    lastGoalTeam = goalScoredBy;
    lastGoalByName = activeSeat.name;
    lastGoalAt = now;

    if (nextScores[goalScoredBy] >= state.goalsToWin) {
      nextStatus = 'finished';
      winnerTeam = goalScoredBy;
      const flagName =
        CHAPAS_TEAM_PRESETS.find((f) => f.id === state.teamFlags[goalScoredBy!])?.name ||
        `Equipo ${goalScoredBy}`;
      statusMessage = `🏆 ¡${flagName} gana ${nextScores.A} - ${nextScores.B}!`;
    } else {
      // Kickoff reset: conceded team gets next kickoff
      nextCaps = createInitialChapasCaps();
      nextBall = createInitialChapasBall();
      nextActiveTeam = goalScoredBy === 'A' ? 'B' : 'A';
      nextPassesUsed = 0;
      nextActiveSeatIndex = findNextSeatInTeam(state.players, nextActiveTeam, -1);
      const flagName =
        CHAPAS_TEAM_PRESETS.find((f) => f.id === state.teamFlags[goalScoredBy!])?.name ||
        `Equipo ${goalScoredBy}`;
      statusMessage = `⚽ ¡GOL de ${flagName}! Saca ${state.players[nextActiveSeatIndex]?.name || 'rival'}`;
    }
  } else if (ballTouched && state.passesUsed + 1 < state.maxPasses) {
    // Kept possession: stays on activeTeam, advances pass count, alternates teammate in 2v2
    nextPassesUsed = state.passesUsed + 1;
    nextActiveTeam = state.activeTeam;
    nextActiveSeatIndex = findNextSeatInTeam(state.players, nextActiveTeam, state.activeSeatIndex);
    statusMessage = `Pase ${nextPassesUsed}/${state.maxPasses} · Turno de ${
      state.players[nextActiveSeatIndex]?.name || nextActiveTeam
    }`;
  } else {
    // Turn changes to opposing team
    nextActiveTeam = state.activeTeam === 'A' ? 'B' : 'A';
    nextPassesUsed = 0;
    nextActiveSeatIndex = findNextSeatInTeam(state.players, nextActiveTeam, -1);
    statusMessage = `Turno de ${state.players[nextActiveSeatIndex]?.name || nextActiveTeam}`;
  }

  return {
    ok: true,
    preShotState,
    state: {
      ...state,
      status: nextStatus,
      scores: nextScores,
      activeTeam: nextActiveTeam,
      activeSeatIndex: nextActiveSeatIndex,
      turnNumber: nextTurnNumber,
      passesUsed: nextPassesUsed,
      caps: nextCaps,
      ball: nextBall,
      winnerTeam,
      statusMessage,
      lastGoalTeam,
      lastGoalByName,
      lastGoalAt,
      lastShot: {
        capId: shot.capId,
        angle,
        power,
        shooterUserId: activeSeat.userId,
        turnNumber: state.turnNumber,
        goalScoredBy,
        ballTouched,
      },
      turnDeadlineAt: nextStatus === 'playing' ? now + CHAPAS_TURN_TIMEOUT_MS : 0,
      updatedAt: now,
    },
  };
}

export function forfeitChapasMatch(
  state: FutbolChapasState,
  actorUserId: string,
  now = Date.now()
): FutbolChapasState | null {
  if (state.status !== 'playing') return null;
  const leaver = state.players.find((p) => p?.userId === actorUserId);
  if (!leaver) return null;
  const winnerTeam: ChapasTeamId = leaver.team === 'A' ? 'B' : 'A';
  const nextScores = { ...state.scores };
  if (nextScores[winnerTeam] < state.goalsToWin) {
    nextScores[winnerTeam] = state.goalsToWin;
  }
  return {
    ...state,
    status: 'finished',
    winnerTeam,
    scores: nextScores,
    statusMessage: `🏳️ ${leaver.name} abandonó el partido`,
    turnDeadlineAt: 0,
    updatedAt: now,
  };
}

export function chooseChapasAiShot(state: FutbolChapasState): ChapasShotInput | null {
  if (state.status !== 'playing') return null;
  const teamCaps = state.caps.filter((c) => c.team === state.activeTeam);
  if (teamCaps.length === 0) return null;

  const ball = state.ball;
  const targetGoalY = state.activeTeam === 'A' ? CHAPAS_PITCH_BOTTOM : CHAPAS_PITCH_TOP;
  const targetGoalX = CHAPAS_ARENA_W / 2;

  // Ideal ghost-ball contact spot behind the ball pointing toward the opponent's goal
  const goalDx = targetGoalX - ball.x;
  const goalDy = targetGoalY - ball.y;
  const goalDist = Math.max(1, Math.hypot(goalDx, goalDy));
  const goalNx = goalDx / goalDist;
  const goalNy = goalDy / goalDist;

  const ghostX = clamp(
    ball.x - goalNx * (CHAPAS_CAP_RADIUS + CHAPAS_BALL_RADIUS * 0.85),
    CHAPAS_PITCH_LEFT + CHAPAS_CAP_RADIUS,
    CHAPAS_PITCH_RIGHT - CHAPAS_CAP_RADIUS
  );
  const ghostY = clamp(
    ball.y - goalNy * (CHAPAS_CAP_RADIUS + CHAPAS_BALL_RADIUS * 0.85),
    CHAPAS_PITCH_TOP + CHAPAS_CAP_RADIUS,
    CHAPAS_PITCH_BOTTOM - CHAPAS_CAP_RADIUS
  );

  let bestCap = teamCaps[0];
  let bestScore = -Infinity;
  let bestAngle = 0;
  let bestPower = 0.72;

  for (const cap of teamCaps) {
    const dx = ghostX - cap.x;
    const dy = ghostY - cap.y;
    const dist = Math.max(1, Math.hypot(dx, dy));
    const shootNx = dx / dist;
    const shootNy = dy / dist;

    // Alignment between shot vector and ball-to-goal vector
    const alignment = shootNx * goalNx + shootNy * goalNy;
    // Prefer closer caps with strong positive alignment; keep keeper (1) protected unless close to ball
    const keeperPenalty = cap.number === 1 && dist > 140 ? 220 : 0;
    const score = alignment * 260 - dist * 0.85 - keeperPenalty;
    if (score > bestScore) {
      bestScore = score;
      bestCap = cap;
      bestAngle = Math.atan2(dy, dx);
      bestPower = clamp(0.42 + dist / 460, 0.45, 0.94);
    }
  }

  return {
    capId: bestCap.id,
    angle: bestAngle,
    power: bestPower,
  };
}

/**
 * NAIM CINE — Turbo Kart (Arcade Kart Racing · 2–6 Players + AI Bots)
 * Server-authoritative & offline-capable 2D arcade kart physics engine with:
 * - 3 distinct circuits (Circuito Neon Sol, Lago Esmeralda, Volcán Turbo)
 * - Kart-to-kart bumping & ramming sparks
 * - 6 throwable/usable items (Caparazón Rojo teledirigido, Caparazón Verde rebote,
 *   Plátano trampa, Turbo Nitro, Estrella Arcoíris, Onda Choque)
 * - Track Turbo Pads, Drift Mini-Turbo, and 3-lap podium race resolution
 */

export const KART_MAX_PLAYERS = 6;
export const KART_WORLD_W = 1100;
export const KART_WORLD_H = 720;
export const KART_TOTAL_LAPS = 3;
export const KART_COUNTDOWN_MS = 3200;

export type KartTrackId = 'neon_sun' | 'emerald_lake' | 'volcano_turbo';

export type KartItemType =
  | 'turbo'
  | 'red_shell'
  | 'green_shell'
  | 'banana'
  | 'star'
  | 'shock';

export interface KartPoint {
  x: number;
  y: number;
}

export interface KartTrackDefinition {
  id: KartTrackId;
  nameEs: string;
  nameCa: string;
  nameEn: string;
  subtitleEs: string;
  subtitleEn: string;
  themeBg: string;
  themeAccent: string;
  roadColor: string;
  curbColorA: string;
  curbColorB: string;
  roadWidth: number;
  waypoints: KartPoint[];
  boostPadIndices: number[];
  itemBoxIndices: number[];
}

export interface KartInputState {
  steer: number; // -1..1
  throttle: number; // -0.5..1
  drift: boolean;
}

export interface KartRacer {
  seatIndex: number;
  userId: string;
  name: string;
  avatar: string;
  color: string;
  isBot: boolean;
  x: number;
  y: number;
  angle: number;
  speed: number;
  vx: number;
  vy: number;
  steer: number;
  driftCharge: number; // 0..100
  driftDir: number; // -1 | 0 | 1
  lap: number; // 1..KART_TOTAL_LAPS
  waypointIdx: number;
  checkpointSector: number; // 0..3 monotonic progress tracker
  totalProgress: number; // monotonic race score for ranking
  rank: number; // 1..N
  item: KartItemType | null;
  boostUntil: number;
  starUntil: number;
  spinUntil: number;
  hitsLanded: number;
  finishedAt: number | null;
  finishPlace: number | null;
}

export interface KartProjectile {
  id: string;
  kind: 'red_shell' | 'green_shell';
  ownerSeat: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  targetSeat: number | null;
  bouncesLeft: number;
  expiresAt: number;
  spawnedAt: number;
}

export interface KartHazard {
  id: string;
  kind: 'banana';
  ownerSeat: number;
  x: number;
  y: number;
  expiresAt: number;
  spawnedAt: number;
}

export interface KartItemBoxState {
  id: string;
  x: number;
  y: number;
  respawnAt: number; // 0 if active
}

export interface KartRaceEvent {
  id: string;
  kind: 'hit' | 'bump' | 'turbo' | 'lap' | 'item' | 'shock' | 'finish';
  text: string;
  x?: number;
  y?: number;
  color?: string;
  timestamp: number;
}

export interface TurboKartState {
  id: string;
  gameType: 'kart';
  trackId: KartTrackId;
  status: 'waiting' | 'countdown' | 'racing' | 'finished';
  totalLaps: number;
  racers: KartRacer[];
  projectiles: KartProjectile[];
  hazards: KartHazard[];
  itemBoxes: KartItemBoxState[];
  events: KartRaceEvent[];
  countdownEndsAt: number;
  raceStartedAt: number;
  raceFinishDeadlineAt: number | null;
  winnerSeat: number | null;
  updatedAt: number;
}

export const KART_BOT_PROFILES: Array<{ name: string; avatar: string; color: string }> = [
  { name: 'Turbo Rex', avatar: '🦖', color: '#22C55E' },
  { name: 'Stella Flash', avatar: '⭐', color: '#FACC15' },
  { name: 'Red Comet', avatar: '🦊', color: '#EF4444' },
  { name: 'Aqua Drift', avatar: '🐬', color: '#06B6D4' },
  { name: 'Pink Nitro', avatar: '⚡', color: '#EC4899' },
  { name: 'Violet Boss', avatar: '👾', color: '#9146FF' },
];

export const KART_ITEM_META: Record<
  KartItemType,
  { emoji: string; labelEs: string; labelEn: string; color: string }
> = {
  turbo: { emoji: '⚡', labelEs: 'Turbo Nitro', labelEn: 'Nitro Boost', color: '#F59E0B' },
  red_shell: { emoji: '🐢', labelEs: 'Caparazón Rojo', labelEn: 'Red Shell', color: '#EF4444' },
  green_shell: { emoji: '🟢', labelEs: 'Caparazón Verde', labelEn: 'Green Shell', color: '#22C55E' },
  banana: { emoji: '🍌', labelEs: 'Plátano Trampa', labelEn: 'Banana Peel', color: '#FACC15' },
  star: { emoji: '⭐', labelEs: 'Estrella Turbo', labelEn: 'Rainbow Star', color: '#A855F7' },
  shock: { emoji: '💥', labelEs: 'Onda Choque', labelEn: 'Shockwave', color: '#38BDF8' },
};

function catmullRomPoint(p0: KartPoint, p1: KartPoint, p2: KartPoint, p3: KartPoint, t: number): KartPoint {
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x:
      0.5 *
      (2 * p1.x +
        (-p0.x + p2.x) * t +
        (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
        (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    y:
      0.5 *
      (2 * p1.y +
        (-p0.y + p2.y) * t +
        (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
        (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
  };
}

function buildClosedSpline(controls: KartPoint[], samplesPerSeg = 8): KartPoint[] {
  const out: KartPoint[] = [];
  const n = controls.length;
  for (let i = 0; i < n; i += 1) {
    const p0 = controls[(i - 1 + n) % n];
    const p1 = controls[i];
    const p2 = controls[(i + 1) % n];
    const p3 = controls[(i + 2) % n];
    for (let s = 0; s < samplesPerSeg; s += 1) {
      const pt = catmullRomPoint(p0, p1, p2, p3, s / samplesPerSeg);
      out.push({ x: Math.round(pt.x * 10) / 10, y: Math.round(pt.y * 10) / 10 });
    }
  }
  return out;
}

const TRACK_NEON_SUN: KartTrackDefinition = {
  id: 'neon_sun',
  nameEs: 'Circuito Neon Sol',
  nameCa: 'Circuit Neon Sol',
  nameEn: 'Neon Sun Circuit',
  subtitleEs: 'Curvas rápidas · Doble turbo recto',
  subtitleEn: 'Fast sweepers · Dual turbo straights',
  themeBg: '#100c1f',
  themeAccent: '#9146FF',
  roadColor: '#252938',
  curbColorA: '#EF4444',
  curbColorB: '#F8FAFC',
  roadWidth: 102,
  waypoints: buildClosedSpline(
    [
      { x: 260, y: 150 },
      { x: 560, y: 120 },
      { x: 860, y: 165 },
      { x: 960, y: 350 },
      { x: 860, y: 550 },
      { x: 640, y: 585 },
      { x: 500, y: 475 },
      { x: 350, y: 580 },
      { x: 165, y: 510 },
      { x: 145, y: 290 },
    ],
    10
  ), // 100 waypoints
  boostPadIndices: [14, 48, 76],
  itemBoxIndices: [24, 62, 88],
};

const TRACK_EMERALD_LAKE: KartTrackDefinition = {
  id: 'emerald_lake',
  nameEs: 'Lago Esmeralda',
  nameCa: 'Llac Esmeralda',
  nameEn: 'Emerald Lake',
  subtitleEs: 'Chicane sobre el agua · 4 Turbos',
  subtitleEn: 'Lakeside chicane · 4 Boost pads',
  themeBg: '#071b24',
  themeAccent: '#10B981',
  roadColor: '#222b36',
  curbColorA: '#10B981',
  curbColorB: '#FEF08A',
  roadWidth: 96,
  waypoints: buildClosedSpline(
    [
      { x: 220, y: 165 },
      { x: 510, y: 135 },
      { x: 760, y: 230 },
      { x: 930, y: 155 },
      { x: 965, y: 375 },
      { x: 835, y: 575 },
      { x: 565, y: 525 },
      { x: 390, y: 605 },
      { x: 165, y: 545 },
      { x: 185, y: 355 },
    ],
    10
  ),
  boostPadIndices: [10, 34, 66, 86],
  itemBoxIndices: [22, 52, 78],
};

const TRACK_VOLCANO_TURBO: KartTrackDefinition = {
  id: 'volcano_turbo',
  nameEs: 'Volcán Turbo',
  nameCa: 'Volcà Turbo',
  nameEn: 'Volcano Turbo',
  subtitleEs: 'Curvas técnicas de magma · 5 Turbos',
  subtitleEn: 'Magma hairpins · 5 Boost pads',
  themeBg: '#1c0c0a',
  themeAccent: '#F97316',
  roadColor: '#242024',
  curbColorA: '#F97316',
  curbColorB: '#18181B',
  roadWidth: 92,
  waypoints: buildClosedSpline(
    [
      { x: 240, y: 145 },
      { x: 550, y: 145 },
      { x: 740, y: 270 },
      { x: 935, y: 185 },
      { x: 965, y: 420 },
      { x: 765, y: 585 },
      { x: 615, y: 430 },
      { x: 430, y: 585 },
      { x: 165, y: 545 },
      { x: 280, y: 355 },
      { x: 145, y: 245 },
    ],
    9
  ), // 99 waypoints
  boostPadIndices: [12, 33, 52, 72, 88],
  itemBoxIndices: [20, 46, 80],
};

export const KART_TRACKS: Record<KartTrackId, KartTrackDefinition> = {
  neon_sun: TRACK_NEON_SUN,
  emerald_lake: TRACK_EMERALD_LAKE,
  volcano_turbo: TRACK_VOLCANO_TURBO,
};

export const KART_TRACK_LIST: KartTrackDefinition[] = [
  TRACK_NEON_SUN,
  TRACK_EMERALD_LAKE,
  TRACK_VOLCANO_TURBO,
];

function wrapAngle(a: number): number {
  let out = a;
  while (out > Math.PI) out -= Math.PI * 2;
  while (out < -Math.PI) out += Math.PI * 2;
  return out;
}

export function getClosestWaypointInfo(
  track: KartTrackDefinition,
  x: number,
  y: number
): { idx: number; dist: number; point: KartPoint; tangentAngle: number } {
  const pts = track.waypoints;
  let bestIdx = 0;
  let bestDistSq = Infinity;
  for (let i = 0; i < pts.length; i += 1) {
    const dx = x - pts[i].x;
    const dy = y - pts[i].y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestDistSq) {
      bestDistSq = d2;
      bestIdx = i;
    }
  }
  const next = pts[(bestIdx + 1) % pts.length];
  const prev = pts[(bestIdx - 1 + pts.length) % pts.length];
  return {
    idx: bestIdx,
    dist: Math.sqrt(bestDistSq),
    point: pts[bestIdx],
    tangentAngle: Math.atan2(next.y - prev.y, next.x - prev.x),
  };
}

function buildItemBoxesForTrack(track: KartTrackDefinition): KartItemBoxState[] {
  const boxes: KartItemBoxState[] = [];
  const pts = track.waypoints;
  for (const idx of track.itemBoxIndices) {
    const p = pts[idx % pts.length];
    const next = pts[(idx + 1) % pts.length];
    const tangent = Math.atan2(next.y - p.y, next.x - p.x);
    const nx = -Math.sin(tangent);
    const ny = Math.cos(tangent);
    for (const offset of [-24, 0, 24]) {
      boxes.push({
        id: `box-${idx}-${offset}`,
        x: Math.round((p.x + nx * offset) * 10) / 10,
        y: Math.round((p.y + ny * offset) * 10) / 10,
        respawnAt: 0,
      });
    }
  }
  return boxes;
}

function buildStartingGridRacers(
  track: KartTrackDefinition,
  humans: Array<{ id: string; name: string; avatar?: string; color?: string }>
): KartRacer[] {
  const cleanHumans: Array<{ id: string; name: string; avatar?: string; color?: string }> = [];
  const seen = new Set<string>();
  for (const h of humans) {
    if (!h?.id || seen.has(h.id)) continue;
    seen.add(h.id);
    cleanHumans.push(h);
    if (cleanHumans.length >= KART_MAX_PLAYERS) break;
  }

  const count = Math.max(6, cleanHumans.length);
  const pts = track.waypoints;
  const startAngle = Math.atan2(pts[2].y - pts[0].y, pts[2].x - pts[0].x);
  const nx = -Math.sin(startAngle);
  const ny = Math.cos(startAngle);
  const bx = Math.cos(startAngle);
  const by = Math.sin(startAngle);

  const racers: KartRacer[] = [];
  for (let i = 0; i < count; i += 1) {
    const h = cleanHumans[i];
    const bot = KART_BOT_PROFILES[i % KART_BOT_PROFILES.length];
    const rowBack = Math.floor(i / 2) * 32 + 18;
    const laneOffset = i % 2 === 0 ? -18 : 18;
    const startX = pts[0].x - bx * rowBack + nx * laneOffset;
    const startY = pts[0].y - by * rowBack + ny * laneOffset;

    racers.push({
      seatIndex: i,
      userId: h ? h.id : `bot-kart-${i}`,
      name: h ? h.name : bot.name,
      avatar: h ? h.avatar || '🏎️' : bot.avatar,
      color: h ? h.color || bot.color : bot.color,
      isBot: !h,
      x: Math.round(startX * 10) / 10,
      y: Math.round(startY * 10) / 10,
      angle: startAngle,
      speed: 0,
      vx: 0,
      vy: 0,
      steer: 0,
      driftCharge: 0,
      driftDir: 0,
      lap: 1,
      waypointIdx: pts.length - 1,
      checkpointSector: 0,
      totalProgress: -i * 0.1,
      rank: i + 1,
      item: null,
      boostUntil: 0,
      starUntil: 0,
      spinUntil: 0,
      hitsLanded: 0,
      finishedAt: null,
      finishPlace: null,
    });
  }
  return racers;
}

export function createInitialTurboKartState(
  humans: Array<{ id: string; name: string; avatar?: string; color?: string }>,
  opts?: { trackId?: KartTrackId; waitForHost?: boolean }
): TurboKartState {
  const trackId: KartTrackId = opts?.trackId && KART_TRACKS[opts.trackId] ? opts.trackId : 'neon_sun';
  const track = KART_TRACKS[trackId];
  const now = Date.now();
  const wait = opts?.waitForHost ?? true;

  return {
    id: `kart-${now}`,
    gameType: 'kart',
    trackId,
    status: wait ? 'waiting' : 'countdown',
    totalLaps: KART_TOTAL_LAPS,
    racers: buildStartingGridRacers(track, humans),
    projectiles: [],
    hazards: [],
    itemBoxes: buildItemBoxesForTrack(track),
    events: [],
    countdownEndsAt: wait ? 0 : now + KART_COUNTDOWN_MS,
    raceStartedAt: wait ? 0 : now + KART_COUNTDOWN_MS,
    raceFinishDeadlineAt: null,
    winnerSeat: null,
    updatedAt: now,
  };
}

export function setTurboKartTrack(
  state: TurboKartState,
  trackId: KartTrackId
): TurboKartState {
  if (!KART_TRACKS[trackId]) return state;
  const humans = state.racers
    .filter((r) => !r.isBot)
    .map((r) => ({ id: r.userId, name: r.name, avatar: r.avatar, color: r.color }));
  const track = KART_TRACKS[trackId];
  const now = Date.now();
  return {
    ...state,
    trackId,
    status: 'waiting',
    racers: buildStartingGridRacers(track, humans),
    projectiles: [],
    hazards: [],
    itemBoxes: buildItemBoxesForTrack(track),
    events: [],
    winnerSeat: null,
    updatedAt: now,
  };
}

export function startTurboKartRace(state: TurboKartState, now = Date.now()): TurboKartState {
  const track = KART_TRACKS[state.trackId] || TRACK_NEON_SUN;
  const humans = state.racers
    .filter((r) => !r.isBot)
    .map((r) => ({ id: r.userId, name: r.name, avatar: r.avatar, color: r.color }));
  return {
    ...state,
    status: 'countdown',
    racers: buildStartingGridRacers(track, humans),
    projectiles: [],
    hazards: [],
    itemBoxes: buildItemBoxesForTrack(track),
    events: [
      {
        id: `ev-cd-${now}`,
        kind: 'turbo',
        text: `🏁 ¡Preparen motores en ${track.nameEs}!`,
        timestamp: now,
      },
    ],
    countdownEndsAt: now + KART_COUNTDOWN_MS,
    raceStartedAt: now + KART_COUNTDOWN_MS,
    raceFinishDeadlineAt: null,
    winnerSeat: null,
    updatedAt: now,
  };
}

export function pickWeightedKartItem(rank: number, totalRacers: number): KartItemType {
  const ratio = rank / Math.max(1, totalRacers);
  const r = Math.random();
  if (rank === 1) {
    if (r < 0.36) return 'banana';
    if (r < 0.68) return 'green_shell';
    if (r < 0.88) return 'shock';
    return 'turbo';
  }
  if (ratio >= 0.65) {
    if (r < 0.28) return 'star';
    if (r < 0.58) return 'turbo';
    if (r < 0.84) return 'red_shell';
    return 'shock';
  }
  if (r < 0.28) return 'red_shell';
  if (r < 0.5) return 'turbo';
  if (r < 0.72) return 'green_shell';
  if (r < 0.86) return 'shock';
  return 'banana';
}

export function useTurboKartItem(
  state: TurboKartState,
  actorUserId: string,
  now = Date.now()
): { ok: true; state: TurboKartState; usedItem: KartItemType } | { ok: false; error: string } {
  if (state.status !== 'racing') {
    return { ok: false, error: 'La carrera aún no ha empezado.' };
  }
  const idx = state.racers.findIndex((r) => r.userId === actorUserId);
  if (idx === -1) return { ok: false, error: 'No estás en la carrera.' };
  const shooter = state.racers[idx];
  if (!shooter.item) return { ok: false, error: 'No tienes objeto.' };

  const item = shooter.item;
  const nextRacers = state.racers.map((r) => ({ ...r }));
  nextRacers[idx].item = null;
  const nextProjectiles = [...state.projectiles];
  const nextHazards = [...state.hazards];
  const nextEvents = [...state.events];

  const pushEvent = (kind: KartRaceEvent['kind'], text: string, x?: number, y?: number, color?: string) => {
    nextEvents.push({
      id: `ev-${now}-${Math.random().toString(36).slice(2, 6)}`,
      kind,
      text,
      x,
      y,
      color,
      timestamp: now,
    });
  };

  if (item === 'turbo') {
    nextRacers[idx].boostUntil = Math.max(nextRacers[idx].boostUntil, now + 1850);
    nextRacers[idx].speed = Math.max(nextRacers[idx].speed, 295);
    pushEvent('turbo', `⚡ ${shooter.name} activó Turbo Nitro`, shooter.x, shooter.y, '#F59E0B');
  } else if (item === 'star') {
    nextRacers[idx].starUntil = Math.max(nextRacers[idx].starUntil, now + 4200);
    nextRacers[idx].boostUntil = Math.max(nextRacers[idx].boostUntil, now + 4200);
    nextRacers[idx].spinUntil = 0;
    pushEvent('turbo', `⭐ ¡${shooter.name} es INVENCIBLE!`, shooter.x, shooter.y, '#A855F7');
  } else if (item === 'banana') {
    const bx = shooter.x - Math.cos(shooter.angle) * 26;
    const by = shooter.y - Math.sin(shooter.angle) * 26;
    nextHazards.push({
      id: `ban-${now}-${idx}-${Math.random().toString(36).slice(2, 5)}`,
      kind: 'banana',
      ownerSeat: idx,
      x: bx,
      y: by,
      spawnedAt: now,
      expiresAt: now + 24_000,
    });
    pushEvent('item', `🍌 ${shooter.name} soltó un plátano`, bx, by, '#FACC15');
  } else if (item === 'green_shell') {
    const speed = 420;
    const sx = shooter.x + Math.cos(shooter.angle) * 24;
    const sy = shooter.y + Math.sin(shooter.angle) * 24;
    nextProjectiles.push({
      id: `gs-${now}-${idx}-${Math.random().toString(36).slice(2, 5)}`,
      kind: 'green_shell',
      ownerSeat: idx,
      x: sx,
      y: sy,
      vx: Math.cos(shooter.angle) * speed,
      vy: Math.sin(shooter.angle) * speed,
      targetSeat: null,
      bouncesLeft: 3,
      spawnedAt: now,
      expiresAt: now + 4200,
    });
    pushEvent('item', `🟢 ${shooter.name} disparó Caparazón Verde`, sx, sy, '#22C55E');
  } else if (item === 'red_shell') {
    // Target kart one rank ahead (or leader if we're 1st)
    const targetRank = shooter.rank > 1 ? shooter.rank - 1 : 2;
    const target =
      nextRacers.find((r) => r.rank === targetRank && r.seatIndex !== idx && !r.finishedAt) ||
      nextRacers.find((r) => r.seatIndex !== idx && !r.finishedAt) ||
      null;
    const speed = 365;
    const sx = shooter.x + Math.cos(shooter.angle) * 24;
    const sy = shooter.y + Math.sin(shooter.angle) * 24;
    nextProjectiles.push({
      id: `rs-${now}-${idx}-${Math.random().toString(36).slice(2, 5)}`,
      kind: 'red_shell',
      ownerSeat: idx,
      x: sx,
      y: sy,
      vx: Math.cos(shooter.angle) * speed,
      vy: Math.sin(shooter.angle) * speed,
      targetSeat: target ? target.seatIndex : null,
      bouncesLeft: 1,
      spawnedAt: now,
      expiresAt: now + 5600,
    });
    pushEvent(
      'item',
      target ? `🐢 ${shooter.name} lanzó Caparazón Rojo a ${target.name}!` : `🐢 ${shooter.name} lanzó Caparazón Rojo`,
      sx,
      sy,
      '#EF4444'
    );
  } else if (item === 'shock') {
    let hitCount = 0;
    for (let j = 0; j < nextRacers.length; j += 1) {
      if (j === idx || nextRacers[j].finishedAt) continue;
      const other = nextRacers[j];
      const dx = other.x - shooter.x;
      const dy = other.y - shooter.y;
      const d = Math.hypot(dx, dy);
      if (d <= 125) {
        if (other.starUntil > now) continue;
        other.spinUntil = now + 1200;
        other.speed *= 0.35;
        const pushAngle = Math.atan2(dy || 0.1, dx || 0.1);
        other.vx += Math.cos(pushAngle) * 190;
        other.vy += Math.sin(pushAngle) * 190;
        nextRacers[idx].hitsLanded += 1;
        hitCount += 1;
      }
    }
    pushEvent(
      'shock',
      hitCount > 0
        ? `💥 ${shooter.name} golpeó a ${hitCount} rival(es) con Onda Choque!`
        : `💥 ${shooter.name} lanzó Onda Choque`,
      shooter.x,
      shooter.y,
      '#38BDF8'
    );
  }

  return {
    ok: true,
    usedItem: item,
    state: {
      ...state,
      racers: nextRacers,
      projectiles: nextProjectiles.slice(-18),
      hazards: nextHazards.slice(-24),
      events: nextEvents.slice(-14),
      updatedAt: now,
    },
  };
}

function computeBotKartInput(
  track: KartTrackDefinition,
  racer: KartRacer,
  state: TurboKartState,
  now: number
): { input: KartInputState; useItem: boolean } {
  const pts = track.waypoints;
  const lookAheadIdx = (racer.waypointIdx + 4 + (racer.seatIndex % 2)) % pts.length;
  const laneOffset = ((racer.seatIndex % 3) - 1) * 14;
  const targetPt = pts[lookAheadIdx];
  const nextPt = pts[(lookAheadIdx + 1) % pts.length];
  const tang = Math.atan2(nextPt.y - targetPt.y, nextPt.x - targetPt.x);
  const tx = targetPt.x - Math.sin(tang) * laneOffset;
  const ty = targetPt.y + Math.cos(tang) * laneOffset;

  const desiredAngle = Math.atan2(ty - racer.y, tx - racer.x);
  const diff = wrapAngle(desiredAngle - racer.angle);
  const steer = Math.max(-1, Math.min(1, diff * 1.9));
  const drift = Math.abs(diff) > 0.55;

  let useItem = false;
  if (racer.item && state.status === 'racing') {
    if (racer.item === 'turbo' || racer.item === 'star') {
      useItem = Math.abs(diff) < 0.35 && racer.boostUntil <= now;
    } else if (racer.item === 'banana') {
      useItem = racer.rank <= 3 && Math.random() < 0.06;
    } else if (racer.item === 'shock') {
      const nearby = state.racers.some(
        (o) => o.seatIndex !== racer.seatIndex && Math.hypot(o.x - racer.x, o.y - racer.y) < 105
      );
      useItem = nearby;
    } else if (racer.item === 'red_shell') {
      useItem = Math.random() < 0.08;
    } else if (racer.item === 'green_shell') {
      useItem = Math.abs(diff) < 0.25 && Math.random() < 0.07;
    }
  }

  return {
    input: {
      steer,
      throttle: 0.94 + (racer.seatIndex % 3) * 0.02,
      drift,
    },
    useItem,
  };
}

export function stepTurboKartSimulation(
  state: TurboKartState,
  humanInputs: Record<string, KartInputState>,
  dtSec: number,
  now = Date.now()
): TurboKartState {
  if (state.status === 'waiting' || state.status === 'finished') {
    return state;
  }

  const track = KART_TRACKS[state.trackId] || TRACK_NEON_SUN;
  const dt = Math.max(0.012, Math.min(0.075, dtSec));

  if (state.status === 'countdown') {
    if (now >= state.countdownEndsAt) {
      return {
        ...state,
        status: 'racing',
        raceStartedAt: now,
        events: [
          ...state.events.slice(-10),
          { id: `ev-go-${now}`, kind: 'turbo', text: '🚦 ¡YA! ¡A toda velocidad!', timestamp: now },
        ],
        updatedAt: now,
      };
    }
    return state;
  }

  let workingState = state;
  // Let AI bots fire their items cleanly through the shared item function
  for (const r of workingState.racers) {
    if (r.isBot && !r.finishedAt && r.item && r.spinUntil <= now) {
      const botDecision = computeBotKartInput(track, r, workingState, now);
      if (botDecision.useItem) {
        const used = useTurboKartItem(workingState, r.userId, now);
        if (used.ok) workingState = used.state;
      }
    }
  }

  const nextRacers = workingState.racers.map((r) => ({ ...r }));
  const nextEvents = [...workingState.events];
  const nextItemBoxes = workingState.itemBoxes.map((b) =>
    b.respawnAt > 0 && now >= b.respawnAt ? { ...b, respawnAt: 0 } : { ...b }
  );
  const nextHazards = workingState.hazards.filter((h) => h.expiresAt > now);
  const nextProjectiles: KartProjectile[] = [];
  const totalWaypoints = track.waypoints.length;

  const pushEv = (kind: KartRaceEvent['kind'], text: string, x?: number, y?: number, color?: string) => {
    nextEvents.push({
      id: `ev-${now}-${Math.random().toString(36).slice(2, 6)}`,
      kind,
      text,
      x,
      y,
      color,
      timestamp: now,
    });
  };

  // 1) Move each kart
  for (let i = 0; i < nextRacers.length; i += 1) {
    const r = nextRacers[i];
    if (r.finishedAt) {
      r.speed *= 0.92;
      r.x += Math.cos(r.angle) * r.speed * dt;
      r.y += Math.sin(r.angle) * r.speed * dt;
      continue;
    }

    const input: KartInputState = r.isBot
      ? computeBotKartInput(track, r, workingState, now).input
      : humanInputs[r.userId] || { steer: 0, throttle: 1, drift: false };

    const isSpun = r.spinUntil > now;
    const isStar = r.starUntil > now;
    const isBoosting = r.boostUntil > now;

    if (isSpun) {
      r.angle = wrapAngle(r.angle + 11.5 * dt);
      r.speed *= Math.pow(0.28, dt);
    } else {
      const steerFactor = Math.max(-1, Math.min(1, Number(input.steer) || 0));
      const turnRate = input.drift && Math.abs(steerFactor) > 0.2 ? 3.55 : 2.85;
      const speedTurnScale = 0.45 + 0.55 * Math.min(1, Math.abs(r.speed) / 140);
      r.steer = steerFactor;
      r.angle = wrapAngle(r.angle + steerFactor * turnRate * speedTurnScale * dt);

      // Drift mini-turbo buildup
      if (input.drift && Math.abs(steerFactor) > 0.25 && r.speed > 130) {
        r.driftDir = steerFactor > 0 ? 1 : -1;
        r.driftCharge = Math.min(100, r.driftCharge + dt * 78);
      } else {
        if (r.driftCharge >= 68) {
          r.boostUntil = Math.max(r.boostUntil, now + 950);
          pushEv('turbo', `🔥 ${r.name} soltó Mini-Turbo!`, r.x, r.y, '#38BDF8');
        }
        r.driftCharge = 0;
        r.driftDir = 0;
      }
    }

    const closest = getClosestWaypointInfo(track, r.x, r.y);
    const halfRoad = track.roadWidth * 0.5;
    const offRoad = closest.dist > halfRoad - 6;

    let maxSpeed = r.isBot ? 236 : 244;
    if (isStar) maxSpeed *= 1.32;
    else if (isBoosting) maxSpeed *= 1.44;
    if (offRoad && !isStar && !isBoosting) maxSpeed *= 0.62;

    const throttle = isSpun ? 0 : Math.max(-0.4, Math.min(1, Number(input.throttle) ?? 1));
    const accel = isBoosting || isStar ? 420 : 255;

    if (throttle >= 0) {
      const targetSpeed = maxSpeed * throttle;
      if (r.speed < targetSpeed) {
        r.speed = Math.min(targetSpeed, r.speed + accel * dt);
      } else {
        r.speed = Math.max(targetSpeed, r.speed - 210 * dt);
      }
    } else {
      r.speed = Math.max(-95, r.speed - 320 * dt);
    }

    r.x += (Math.cos(r.angle) * r.speed + r.vx) * dt;
    r.y += (Math.sin(r.angle) * r.speed + r.vy) * dt;
    r.vx *= Math.pow(0.05, dt);
    r.vy *= Math.pow(0.05, dt);

    // Keep kart softly inside outer arena & softly nudge back if far off-track
    r.x = Math.max(24, Math.min(KART_WORLD_W - 24, r.x));
    r.y = Math.max(24, Math.min(KART_WORLD_H - 24, r.y));
    const afterClosest = getClosestWaypointInfo(track, r.x, r.y);
    if (afterClosest.dist > halfRoad + 28) {
      const pull = Math.atan2(afterClosest.point.y - r.y, afterClosest.point.x - r.x);
      r.x += Math.cos(pull) * (afterClosest.dist - (halfRoad + 28)) * 0.55;
      r.y += Math.sin(pull) * (afterClosest.dist - (halfRoad + 28)) * 0.55;
      r.speed *= 0.88;
    }

    // Check Boost Pads
    for (const padIdx of track.boostPadIndices) {
      const padPt = track.waypoints[padIdx % totalWaypoints];
      if (Math.hypot(r.x - padPt.x, r.y - padPt.y) < 28 && r.boostUntil < now + 900) {
        r.boostUntil = Math.max(r.boostUntil, now + 1350);
        r.speed = Math.max(r.speed, 325);
        pushEv('turbo', `⚡ ${r.name} pisó panel Turbo!`, padPt.x, padPt.y, '#06B6D4');
      }
    }

    // Check Item Boxes
    for (const box of nextItemBoxes) {
      if (box.respawnAt === 0 && Math.hypot(r.x - box.x, r.y - box.y) < 22) {
        box.respawnAt = now + 3500;
        if (!r.item) {
          r.item = pickWeightedKartItem(r.rank, nextRacers.length);
          const meta = KART_ITEM_META[r.item];
          pushEv('item', `${meta.emoji} ${r.name} recogió ${meta.labelEs}`, box.x, box.y, meta.color);
        }
      }
    }

    // Update monotonic lap & waypoint progress (4 sectors around ring)
    const wp = afterClosest.idx;
    const sector = Math.min(3, Math.floor((wp / totalWaypoints) * 4));
    if (sector === 1 && r.checkpointSector === 0) r.checkpointSector = 1;
    else if (sector === 2 && r.checkpointSector === 1) r.checkpointSector = 2;
    else if (sector === 3 && r.checkpointSector === 2) r.checkpointSector = 3;
    else if (sector === 0 && r.checkpointSector === 3) {
      r.checkpointSector = 0;
      if (r.lap >= workingState.totalLaps) {
        r.finishedAt = now;
        const finishedSoFar = nextRacers.filter((x) => x.finishedAt !== null).length;
        r.finishPlace = finishedSoFar;
        pushEv('finish', `🏁 ¡${r.name} cruzó la meta en ${r.finishPlace}º lugar!`, r.x, r.y, '#FACC15');
      } else {
        r.lap += 1;
        pushEv('lap', `🚩 ${r.name} · Vuelta ${r.lap}/${workingState.totalLaps}`, r.x, r.y, '#22C55E');
      }
    }

    r.waypointIdx = wp;
    const sectorProgress =
      r.checkpointSector === 0 && wp > totalWaypoints * 0.75
        ? -((totalWaypoints - wp) / totalWaypoints)
        : wp / totalWaypoints;
    r.totalProgress = (r.finishedAt ? workingState.totalLaps + 2 - (r.finishPlace || 6) * 0.01 : r.lap - 1) + sectorProgress;
  }

  // 2) Kart-to-Kart Bumping / Ramming ("que se puedan ir pegando uno a otro")
  for (let i = 0; i < nextRacers.length; i += 1) {
    for (let j = i + 1; j < nextRacers.length; j += 1) {
      const a = nextRacers[i];
      const b = nextRacers[j];
      if (a.finishedAt || b.finishedAt) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy);
      const minDist = 28;
      if (dist > 0.01 && dist < minDist) {
        const nx = dx / dist;
        const ny = dy / dist;
        const overlap = (minDist - dist) * 0.55;
        a.x -= nx * overlap;
        a.y -= ny * overlap;
        b.x += nx * overlap;
        b.y += ny * overlap;

        const aPower = (a.starUntil > now ? 3 : a.boostUntil > now ? 2 : 1) + a.speed / 280;
        const bPower = (b.starUntil > now ? 3 : b.boostUntil > now ? 2 : 1) + b.speed / 280;

        a.vx -= nx * 105 * (bPower / Math.max(0.7, aPower));
        a.vy -= ny * 105 * (bPower / Math.max(0.7, aPower));
        b.vx += nx * 105 * (aPower / Math.max(0.7, bPower));
        b.vy += ny * 105 * (aPower / Math.max(0.7, bPower));

        if (a.starUntil > now && b.starUntil <= now && b.spinUntil <= now) {
          b.spinUntil = now + 950;
          b.speed *= 0.45;
          a.hitsLanded += 1;
          pushEv('hit', `⭐ ¡${a.name} arrolló a ${b.name}!`, (a.x + b.x) / 2, (a.y + b.y) / 2, '#A855F7');
        } else if (b.starUntil > now && a.starUntil <= now && a.spinUntil <= now) {
          a.spinUntil = now + 950;
          a.speed *= 0.45;
          b.hitsLanded += 1;
          pushEv('hit', `⭐ ¡${b.name} arrolló a ${a.name}!`, (a.x + b.x) / 2, (a.y + b.y) / 2, '#A855F7');
        } else {
          // Fun tactile bump sparks
          if (Math.abs(a.speed - b.speed) > 45 || a.boostUntil > now || b.boostUntil > now) {
            if (a.boostUntil > now && b.boostUntil <= now && b.spinUntil <= now) {
              b.vx += nx * 95;
              b.vy += ny * 95;
              b.speed *= 0.72;
              a.hitsLanded += 1;
            } else if (b.boostUntil > now && a.boostUntil <= now && a.spinUntil <= now) {
              a.vx -= nx * 95;
              a.vy -= ny * 95;
              a.speed *= 0.72;
              b.hitsLanded += 1;
            }
            pushEv('bump', `💥 Choque entre ${a.name} y ${b.name}`, (a.x + b.x) / 2, (a.y + b.y) / 2, '#FB923C');
          }
        }
      }
    }
  }

  // 3) Hazard collisions (Bananas)
  const survivingHazards: KartHazard[] = [];
  for (const h of nextHazards) {
    let triggered = false;
    for (const r of nextRacers) {
      if (r.finishedAt) continue;
      if (r.seatIndex === h.ownerSeat && now - h.spawnedAt < 650) continue;
      if (Math.hypot(r.x - h.x, r.y - h.y) < 20) {
        triggered = true;
        if (r.starUntil <= now) {
          r.spinUntil = now + 1150;
          r.speed *= 0.3;
          const owner = nextRacers[h.ownerSeat];
          if (owner) owner.hitsLanded += 1;
          pushEv('hit', `🍌 ¡${r.name} resbaló con un plátano!`, h.x, h.y, '#FACC15');
        }
        break;
      }
    }
    if (!triggered) survivingHazards.push(h);
  }

  // 4) Projectile movement & collisions (Red / Green Shells)
  for (const proj of workingState.projectiles) {
    if (now >= proj.expiresAt) continue;
    const p = { ...proj };

    if (p.kind === 'red_shell' && p.targetSeat !== null) {
      const target = nextRacers[p.targetSeat];
      if (target && !target.finishedAt) {
        const desired = Math.atan2(target.y - p.y, target.x - p.x);
        const curAng = Math.atan2(p.vy, p.vx);
        const spd = Math.hypot(p.vx, p.vy) || 365;
        const turn = wrapAngle(desired - curAng);
        const nextAng = curAng + Math.max(-5.2 * dt, Math.min(5.2 * dt, turn));
        p.vx = Math.cos(nextAng) * spd;
        p.vy = Math.sin(nextAng) * spd;
      }
    }

    p.x += p.vx * dt;
    p.y += p.vy * dt;

    // Wall ricochet for green shell
    const pClosest = getClosestWaypointInfo(track, p.x, p.y);
    if (pClosest.dist > track.roadWidth * 0.56) {
      if (p.bouncesLeft > 0) {
        const nx = (pClosest.point.x - p.x) / (pClosest.dist || 1);
        const ny = (pClosest.point.y - p.y) / (pClosest.dist || 1);
        const dot = p.vx * nx + p.vy * ny;
        if (dot < 0) {
          p.vx -= 2 * dot * nx;
          p.vy -= 2 * dot * ny;
          p.bouncesLeft -= 1;
        }
      } else {
        continue;
      }
    }

    let hitRacer = false;
    for (const r of nextRacers) {
      if (r.finishedAt) continue;
      if (r.seatIndex === p.ownerSeat && now - p.spawnedAt < 350) continue;
      if (Math.hypot(r.x - p.x, r.y - p.y) < 22) {
        hitRacer = true;
        if (r.starUntil <= now) {
          r.spinUntil = now + 1300;
          r.speed *= 0.24;
          r.vx += p.vx * 0.35;
          r.vy += p.vy * 0.35;
          const shooter = nextRacers[p.ownerSeat];
          if (shooter) shooter.hitsLanded += 1;
          pushEv(
            'hit',
            `${p.kind === 'red_shell' ? '🐢' : '🟢'} ¡${shooter?.name || 'Rival'} derribó a ${r.name}!`,
            r.x,
            r.y,
            p.kind === 'red_shell' ? '#EF4444' : '#22C55E'
          );
        }
        break;
      }
    }
    if (!hitRacer) nextProjectiles.push(p);
  }

  // 5) Recompute live ranks
  const sorted = [...nextRacers].sort((a, b) => {
    if (a.finishPlace !== null && b.finishPlace !== null) return a.finishPlace - b.finishPlace;
    if (a.finishPlace !== null) return -1;
    if (b.finishPlace !== null) return 1;
    return b.totalProgress - a.totalProgress;
  });
  sorted.forEach((r, idx) => {
    const target = nextRacers[r.seatIndex];
    target.rank = idx + 1;
  });

  // 6) Check Race Completion
  const firstFinisher = nextRacers.find((r) => r.finishPlace === 1);
  let finishDeadline = workingState.raceFinishDeadlineAt;
  if (firstFinisher && !finishDeadline) {
    finishDeadline = now + 10_000;
  }

  const allHumansDone = nextRacers.filter((r) => !r.isBot).every((r) => r.finishedAt !== null);
  const allRacersDone = nextRacers.every((r) => r.finishedAt !== null);
  const deadlineExpired = finishDeadline !== null && now >= finishDeadline;

  let nextStatus: TurboKartState['status'] = workingState.status;
  let winnerSeat: number | null = workingState.winnerSeat;

  if (allRacersDone || (firstFinisher && (allHumansDone || deadlineExpired))) {
    nextStatus = 'finished';
    // Assign remaining finish places cleanly by current rank
    const byRank = [...nextRacers].sort((a, b) => a.rank - b.rank);
    byRank.forEach((r, idx) => {
      if (nextRacers[r.seatIndex].finishPlace === null) {
        nextRacers[r.seatIndex].finishPlace = idx + 1;
      }
    });
    winnerSeat = byRank[0]?.seatIndex ?? 0;
  }

  return {
    ...workingState,
    status: nextStatus,
    racers: nextRacers,
    projectiles: nextProjectiles.slice(-18),
    hazards: survivingHazards.slice(-24),
    itemBoxes: nextItemBoxes,
    events: nextEvents.slice(-14),
    raceFinishDeadlineAt: finishDeadline,
    winnerSeat,
    updatedAt: now,
  };
}

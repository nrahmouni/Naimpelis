/**
 * NAIM CINE — 4-Player Party Games Engine (Parchís / Ludo + UNO)
 * Up to 4 human players with automatic AI Bot seat filling when <4 humans join.
 */

export type PartyColor = 'red' | 'blue' | 'yellow' | 'green';
export type PartyGameType = 'parchis' | 'uno';

export const PARTY_COLORS: PartyColor[] = ['red', 'blue', 'yellow', 'green'];

export interface PartySeatPlayer {
  seatIndex: number;
  userId: string;
  name: string;
  avatar: string;
  color: PartyColor;
  isBot: boolean;
  score: number;
}

// ============================================================================
// PARCHÍS (LUDO 4 PLAYERS)
// ============================================================================
export interface ParchisPiece {
  id: number; // 0..3
  color: PartyColor;
  /** -1 = base/home yard, 0..51 = shared ring index (relative steps 0..50 from start), 51..56 = home column, 57 = finished */
  progress: number;
}

export interface ParchisGameState {
  id: string;
  gameType: 'parchis';
  status: 'playing' | 'finished';
  players: PartySeatPlayer[];
  turnSeat: number;
  dice: number | null;
  phase: 'roll' | 'move';
  consecutiveSixes: number;
  bonusSteps: number; // +20 on capture, +10 on reaching goal
  pieces: Record<PartyColor, ParchisPiece[]>;
  winnerSeat: number | null;
  log: string[];
  updatedAt: number;
}

const PARCHIS_START_OFFSETS: Record<PartyColor, number> = {
  red: 0,
  blue: 13,
  yellow: 26,
  green: 39,
};

// Standard safe squares around 52-tile ring (start squares + stars)
const PARCHIS_SAFE_SQUARES = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

export function parchisGlobalSquare(color: PartyColor, progress: number): number | null {
  if (progress < 0 || progress > 50) return null;
  return (PARCHIS_START_OFFSETS[color] + progress) % 52;
}

const BOT_PROFILES: Array<{ name: string; avatar: string }> = [
  { name: 'Bot Nova', avatar: '🤖' },
  { name: 'Bot Vega', avatar: '🦾' },
  { name: 'Bot Orion', avatar: '👾' },
  { name: 'Bot Lyra', avatar: '🎯' },
];

export function buildFourSeats(
  humanParticipants: Array<{ id: string; name: string; avatar?: string }>
): PartySeatPlayer[] {
  const uniqueHumans: Array<{ id: string; name: string; avatar?: string }> = [];
  const seen = new Set<string>();
  for (const h of humanParticipants) {
    if (!h?.id || seen.has(h.id)) continue;
    seen.add(h.id);
    uniqueHumans.push(h);
    if (uniqueHumans.length >= 4) break;
  }

  const seats: PartySeatPlayer[] = [];
  for (let i = 0; i < 4; i += 1) {
    const color = PARTY_COLORS[i];
    const h = uniqueHumans[i];
    if (h) {
      seats.push({
        seatIndex: i,
        userId: h.id,
        name: h.name,
        avatar: h.avatar || '🎮',
        color,
        isBot: false,
        score: 0,
      });
    } else {
      const bot = BOT_PROFILES[i % BOT_PROFILES.length];
      seats.push({
        seatIndex: i,
        userId: `bot-seat-${i}-${color}`,
        name: bot.name,
        avatar: bot.avatar,
        color,
        isBot: true,
        score: 0,
      });
    }
  }
  return seats;
}

export function createInitialParchisState(
  humans: Array<{ id: string; name: string; avatar?: string }>
): ParchisGameState {
  const players = buildFourSeats(humans);
  const pieces: Record<PartyColor, ParchisPiece[]> = {
    red: [0, 1, 2, 3].map((id) => ({ id, color: 'red', progress: -1 })),
    blue: [0, 1, 2, 3].map((id) => ({ id, color: 'blue', progress: -1 })),
    yellow: [0, 1, 2, 3].map((id) => ({ id, color: 'yellow', progress: -1 })),
    green: [0, 1, 2, 3].map((id) => ({ id, color: 'green', progress: -1 })),
  };
  return {
    id: `parchis-${Date.now()}`,
    gameType: 'parchis',
    status: 'playing',
    players,
    turnSeat: 0,
    dice: null,
    phase: 'roll',
    consecutiveSixes: 0,
    bonusSteps: 0,
    pieces,
    winnerSeat: null,
    log: ['Partida de Parchís iniciada (4 jugadores · IA en huecos libres).'],
    updatedAt: Date.now(),
  };
}

export function getLegalParchisPieceIds(state: ParchisGameState, steps: number): number[] {
  const seat = state.players[state.turnSeat];
  if (!seat || state.status === 'finished') return [];
  const own = state.pieces[seat.color];
  const legal: number[] = [];

  for (const p of own) {
    if (p.progress === 57) continue;
    if (p.progress === -1) {
      if (steps === 5 || steps === 6) {
        legal.push(p.id);
      }
    } else {
      const nextProg = p.progress + steps;
      if (nextProg <= 57) {
        legal.push(p.id);
      }
    }
  }
  return legal;
}

export function rollParchisDice(
  state: ParchisGameState,
  actorUserId: string,
  forcedRoll?: number
): { ok: true; state: ParchisGameState } | { ok: false; error: string } {
  if (state.status === 'finished') return { ok: false, error: 'Partida terminada.' };
  if (state.phase !== 'roll') return { ok: false, error: 'Mueve una ficha antes de tirar.' };
  const activeSeat = state.players[state.turnSeat];
  if (!activeSeat.isBot && activeSeat.userId !== actorUserId) {
    return { ok: false, error: 'No es tu turno.' };
  }

  const roll =
    typeof forcedRoll === 'number' && forcedRoll >= 1 && forcedRoll <= 6
      ? Math.floor(forcedRoll)
      : 1 + Math.floor(Math.random() * 6);
  const nextSixes = roll === 6 ? state.consecutiveSixes + 1 : 0;

  if (nextSixes >= 3) {
    const nextSeat = (state.turnSeat + 1) % 4;
    return {
      ok: true,
      state: {
        ...state,
        dice: roll,
        phase: 'roll',
        consecutiveSixes: 0,
        turnSeat: nextSeat,
        log: [...state.log.slice(-14), `${activeSeat.name} sacó 3 seises seguidos · pierde turno.`],
        updatedAt: Date.now(),
      },
    };
  }

  const legal = getLegalParchisPieceIds(state, roll);
  if (legal.length === 0) {
    const nextSeat = roll === 6 ? state.turnSeat : (state.turnSeat + 1) % 4;
    return {
      ok: true,
      state: {
        ...state,
        dice: roll,
        phase: 'roll',
        consecutiveSixes: roll === 6 ? nextSixes : 0,
        turnSeat: nextSeat,
        log: [
          ...state.log.slice(-14),
          `${activeSeat.name} sacó ${roll} (sin movimiento${roll === 6 ? ', repite' : ''}).`,
        ],
        updatedAt: Date.now(),
      },
    };
  }

  return {
    ok: true,
    state: {
      ...state,
      dice: roll,
      phase: 'move',
      consecutiveSixes: nextSixes,
      log: [...state.log.slice(-14), `${activeSeat.name} sacó un ${roll}.`],
      updatedAt: Date.now(),
    },
  };
}

export function moveParchisPiece(
  state: ParchisGameState,
  actorUserId: string,
  pieceId: number
): { ok: true; state: ParchisGameState; finishedNow: boolean } | { ok: false; error: string } {
  if (state.status === 'finished') return { ok: false, error: 'Partida terminada.' };
  if (state.phase !== 'move') return { ok: false, error: 'Primero tira el dado.' };
  const activeSeat = state.players[state.turnSeat];
  if (!activeSeat.isBot && activeSeat.userId !== actorUserId) {
    return { ok: false, error: 'No es tu turno.' };
  }

  const steps = state.bonusSteps > 0 ? state.bonusSteps : state.dice || 0;
  if (steps <= 0) return { ok: false, error: 'Dado inválido.' };
  const legal = getLegalParchisPieceIds(state, steps);
  if (!legal.includes(pieceId)) {
    return { ok: false, error: 'Esa ficha no puede moverse.' };
  }

  const nextPieces: Record<PartyColor, ParchisPiece[]> = {
    red: state.pieces.red.map((p) => ({ ...p })),
    blue: state.pieces.blue.map((p) => ({ ...p })),
    yellow: state.pieces.yellow.map((p) => ({ ...p })),
    green: state.pieces.green.map((p) => ({ ...p })),
  };

  const targetPiece = nextPieces[activeSeat.color].find((p) => p.id === pieceId)!;
  const wasInBase = targetPiece.progress === -1;
  targetPiece.progress = wasInBase ? 0 : targetPiece.progress + steps;

  const logs = [...state.log.slice(-13)];
  let nextBonus = 0;

  // Check capture on shared ring if not safe square
  const landingSquare = parchisGlobalSquare(activeSeat.color, targetPiece.progress);
  if (landingSquare !== null && !PARCHIS_SAFE_SQUARES.has(landingSquare)) {
    for (const c of PARTY_COLORS) {
      if (c === activeSeat.color) continue;
      for (const oppPiece of nextPieces[c]) {
        if (parchisGlobalSquare(c, oppPiece.progress) === landingSquare) {
          oppPiece.progress = -1;
          nextBonus = 20;
          logs.push(`${activeSeat.name} comió una ficha ${c} (+20 pasos extra).`);
        }
      }
    }
  }

  if (targetPiece.progress === 57) {
    nextBonus = Math.max(nextBonus, 10);
    logs.push(`${activeSeat.name} metió una ficha en meta (+10 pasos).`);
  }

  const wonNow = nextPieces[activeSeat.color].every((p) => p.progress === 57);
  if (wonNow) {
    const nextPlayers = state.players.map((pl, idx) =>
      idx === state.turnSeat ? { ...pl, score: pl.score + 1 } : pl
    );
    return {
      ok: true,
      finishedNow: true,
      state: {
        ...state,
        status: 'finished',
        players: nextPlayers,
        pieces: nextPieces,
        winnerSeat: state.turnSeat,
        phase: 'roll',
        bonusSteps: 0,
        log: [...logs, `🏆 ${activeSeat.name} ha ganado el Parchís!`],
        updatedAt: Date.now(),
      },
    };
  }

  // If bonus earned and at least one piece can move bonus steps, keep phase='move'
  const tempState: ParchisGameState = {
    ...state,
    pieces: nextPieces,
    bonusSteps: nextBonus,
  };
  if (nextBonus > 0 && getLegalParchisPieceIds(tempState, nextBonus).length > 0) {
    return {
      ok: true,
      finishedNow: false,
      state: {
        ...tempState,
        phase: 'move',
        log: logs,
        updatedAt: Date.now(),
      },
    };
  }

  const extraTurn = state.dice === 6;
  const nextSeat = extraTurn ? state.turnSeat : (state.turnSeat + 1) % 4;

  return {
    ok: true,
    finishedNow: false,
    state: {
      ...state,
      pieces: nextPieces,
      turnSeat: nextSeat,
      phase: 'roll',
      bonusSteps: 0,
      consecutiveSixes: extraTurn ? state.consecutiveSixes : 0,
      log: logs,
      updatedAt: Date.now(),
    },
  };
}

export function chooseBotParchisAction(state: ParchisGameState): {
  action: 'roll_dice' | 'move_piece';
  pieceId?: number;
} {
  if (state.phase === 'roll') return { action: 'roll_dice' };
  const steps = state.bonusSteps > 0 ? state.bonusSteps : state.dice || 0;
  const legal = getLegalParchisPieceIds(state, steps);
  if (legal.length === 0) return { action: 'roll_dice' };

  const activeColor = state.players[state.turnSeat].color;
  const own = state.pieces[activeColor];

  // Heuristic: prioritize capturing > reaching goal 57 > exiting base > furthest advanced
  let bestId = legal[0];
  let bestScore = -999;

  for (const id of legal) {
    const p = own.find((x) => x.id === id)!;
    const nextProg = p.progress === -1 ? 0 : p.progress + steps;
    let score = nextProg;
    if (p.progress === -1) score += 80;
    if (nextProg === 57) score += 120;
    const sq = parchisGlobalSquare(activeColor, nextProg);
    if (sq !== null && !PARCHIS_SAFE_SQUARES.has(sq)) {
      const canCapture = PARTY_COLORS.some(
        (c) => c !== activeColor && state.pieces[c].some((op) => parchisGlobalSquare(c, op.progress) === sq)
      );
      if (canCapture) score += 160;
    }
    if (sq !== null && PARCHIS_SAFE_SQUARES.has(sq)) score += 35;
    if (score > bestScore) {
      bestScore = score;
      bestId = id;
    }
  }
  return { action: 'move_piece', pieceId: bestId };
}

// ============================================================================
// UNO (4 PLAYERS)
// ============================================================================
export type UnoCardColor = PartyColor | 'wild';
export type UnoCardValue =
  | '0'
  | '1'
  | '2'
  | '3'
  | '4'
  | '5'
  | '6'
  | '7'
  | '8'
  | '9'
  | 'skip'
  | 'reverse'
  | 'draw2'
  | 'wild'
  | 'wild4';

export interface UnoCard {
  id: string;
  color: UnoCardColor;
  value: UnoCardValue;
}

export interface UnoGameState {
  id: string;
  gameType: 'uno';
  status: 'playing' | 'finished';
  players: PartySeatPlayer[];
  hands: Record<number, UnoCard[]>; // keyed by seatIndex 0..3
  deck: UnoCard[];
  discardPile: UnoCard[];
  activeColor: PartyColor;
  turnSeat: number;
  direction: 1 | -1;
  pendingDraw: number;
  winnerSeat: number | null;
  unoCalledSeats: number[];
  log: string[];
  updatedAt: number;
}

function buildUnoDeck(): UnoCard[] {
  const cards: UnoCard[] = [];
  let seq = 1;
  const push = (color: UnoCardColor, value: UnoCardValue) => {
    cards.push({ id: `u-${seq++}`, color, value });
  };
  for (const c of PARTY_COLORS) {
    push(c, '0');
    const vals: UnoCardValue[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'skip', 'reverse', 'draw2'];
    for (const v of vals) {
      push(c, v);
      push(c, v);
    }
  }
  for (let i = 0; i < 4; i += 1) {
    push('wild', 'wild');
    push('wild', 'wild4');
  }
  for (let i = cards.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

export function createInitialUnoState(
  humans: Array<{ id: string; name: string; avatar?: string }>
): UnoGameState {
  const players = buildFourSeats(humans);
  const deck = buildUnoDeck();
  const hands: Record<number, UnoCard[]> = { 0: [], 1: [], 2: [], 3: [] };
  for (let r = 0; r < 7; r += 1) {
    for (let s = 0; s < 4; s += 1) {
      hands[s].push(deck.pop()!);
    }
  }
  let topCard = deck.pop()!;
  while (topCard.color === 'wild') {
    deck.unshift(topCard);
    topCard = deck.pop()!;
  }
  return {
    id: `uno-${Date.now()}`,
    gameType: 'uno',
    status: 'playing',
    players,
    hands,
    deck,
    discardPile: [topCard],
    activeColor: topCard.color,
    turnSeat: 0,
    direction: 1,
    pendingDraw: 0,
    winnerSeat: null,
    unoCalledSeats: [],
    log: ['Partida UNO de 4 jugadores iniciada (IA en asientos libres).'],
    updatedAt: Date.now(),
  };
}

export function isUnoCardPlayable(state: UnoGameState, card: UnoCard): boolean {
  const top = state.discardPile[state.discardPile.length - 1];
  if (!top) return true;
  if (state.pendingDraw > 0) {
    // Allow stacking +2 on +2 or +4 on +4
    return card.value === top.value || card.value === 'wild4';
  }
  if (card.color === 'wild') return true;
  return card.color === state.activeColor || card.value === top.value;
}

function drawFromDeck(
  deck: UnoCard[],
  discardPile: UnoCard[],
  count: number
): { drawn: UnoCard[]; deck: UnoCard[]; discardPile: UnoCard[] } {
  const nextDeck = [...deck];
  let nextDiscard = [...discardPile];
  const drawn: UnoCard[] = [];
  for (let i = 0; i < count; i += 1) {
    if (nextDeck.length === 0 && nextDiscard.length > 1) {
      const top = nextDiscard.pop()!;
      for (let k = nextDiscard.length - 1; k > 0; k -= 1) {
        const j = Math.floor(Math.random() * (k + 1));
        [nextDiscard[k], nextDiscard[j]] = [nextDiscard[j], nextDiscard[k]];
      }
      nextDeck.push(...nextDiscard);
      nextDiscard = [top];
    }
    if (nextDeck.length > 0) {
      drawn.push(nextDeck.pop()!);
    }
  }
  return { drawn, deck: nextDeck, discardPile: nextDiscard };
}

export function playUnoCard(
  state: UnoGameState,
  actorUserId: string,
  cardId: string,
  chosenColor?: PartyColor
): { ok: true; state: UnoGameState; finishedNow: boolean } | { ok: false; error: string } {
  if (state.status === 'finished') return { ok: false, error: 'Partida finalizada.' };
  const seat = state.players[state.turnSeat];
  if (!seat.isBot && seat.userId !== actorUserId) {
    return { ok: false, error: 'No es tu turno.' };
  }

  const hand = state.hands[state.turnSeat] || [];
  const cardIdx = hand.findIndex((c) => c.id === cardId);
  if (cardIdx === -1) return { ok: false, error: 'Carta no encontrada.' };
  const card = hand[cardIdx];
  if (!isUnoCardPlayable(state, card)) {
    return { ok: false, error: 'Esa carta no coincide con el color o valor activo.' };
  }

  const nextHand = hand.filter((c) => c.id !== cardId);
  const nextHands = { ...state.hands, [state.turnSeat]: nextHand };
  const nextDiscard = [...state.discardPile, card];
  const nextColor: PartyColor =
    card.color === 'wild' ? chosenColor || 'red' : card.color;

  let nextDir = state.direction;
  let stepCount = 1;
  let nextPending = state.pendingDraw;

  if (card.value === 'reverse') {
    nextDir = (state.direction * -1) as 1 | -1;
  } else if (card.value === 'skip') {
    stepCount = 2;
  } else if (card.value === 'draw2') {
    nextPending += 2;
  } else if (card.value === 'wild4') {
    nextPending += 4;
  }

  if (nextHand.length === 0) {
    const nextPlayers = state.players.map((pl, idx) =>
      idx === state.turnSeat ? { ...pl, score: pl.score + 1 } : pl
    );
    return {
      ok: true,
      finishedNow: true,
      state: {
        ...state,
        status: 'finished',
        players: nextPlayers,
        hands: nextHands,
        discardPile: nextDiscard,
        activeColor: nextColor,
        winnerSeat: state.turnSeat,
        pendingDraw: 0,
        log: [...state.log.slice(-14), `🏆 ${seat.name} ganó la partida de UNO!`],
        updatedAt: Date.now(),
      },
    };
  }

  const nextSeat = ((state.turnSeat + nextDir * stepCount) % 4 + 4) % 4;
  const unoLabel = nextHand.length === 1 ? ' · ¡UNO!' : '';
  return {
    ok: true,
    finishedNow: false,
    state: {
      ...state,
      hands: nextHands,
      discardPile: nextDiscard,
      activeColor: nextColor,
      direction: nextDir,
      turnSeat: nextSeat,
      pendingDraw: nextPending,
      unoCalledSeats:
        nextHand.length === 1
          ? Array.from(new Set([...state.unoCalledSeats, state.turnSeat]))
          : state.unoCalledSeats.filter((s) => s !== state.turnSeat),
      log: [
        ...state.log.slice(-14),
        `${seat.name} jugó ${card.value.toUpperCase()} (${nextColor})${unoLabel}`,
      ],
      updatedAt: Date.now(),
    },
  };
}

export function drawUnoCardsAndAdvance(
  state: UnoGameState,
  actorUserId: string
): { ok: true; state: UnoGameState } | { ok: false; error: string } {
  if (state.status === 'finished') return { ok: false, error: 'Partida finalizada.' };
  const seat = state.players[state.turnSeat];
  if (!seat.isBot && seat.userId !== actorUserId) {
    return { ok: false, error: 'No es tu turno.' };
  }

  const count = state.pendingDraw > 0 ? state.pendingDraw : 1;
  const { drawn, deck, discardPile } = drawFromDeck(state.deck, state.discardPile, count);
  const nextHands = {
    ...state.hands,
    [state.turnSeat]: [...(state.hands[state.turnSeat] || []), ...drawn],
  };
  const nextSeat = ((state.turnSeat + state.direction) % 4 + 4) % 4;

  return {
    ok: true,
    state: {
      ...state,
      hands: nextHands,
      deck,
      discardPile,
      pendingDraw: 0,
      turnSeat: nextSeat,
      unoCalledSeats: state.unoCalledSeats.filter((s) => s !== state.turnSeat),
      log: [...state.log.slice(-14), `${seat.name} robó ${drawn.length} carta${drawn.length === 1 ? '' : 's'}.`],
      updatedAt: Date.now(),
    },
  };
}

export function chooseBotUnoMove(state: UnoGameState): {
  action: 'play_card' | 'draw_card';
  cardId?: string;
  chosenColor?: PartyColor;
} {
  const hand = state.hands[state.turnSeat] || [];
  const playable = hand.filter((c) => isUnoCardPlayable(state, c));
  if (playable.length === 0) {
    return { action: 'draw_card' };
  }
  // Prefer colored action/number cards before wilds
  const sorted = [...playable].sort((a, b) => {
    const score = (c: UnoCard) =>
      c.color === 'wild' ? (c.value === 'wild4' ? 1 : 2) : c.value === 'draw2' || c.value === 'skip' || c.value === 'reverse' ? 10 : 6;
    return score(b) - score(a);
  });
  const pick = sorted[0];
  let chosenColor: PartyColor = 'red';
  if (pick.color === 'wild') {
    const counts: Record<PartyColor, number> = { red: 0, blue: 0, yellow: 0, green: 0 };
    for (const c of hand) {
      if (c.color !== 'wild') counts[c.color] += 1;
    }
    chosenColor = PARTY_COLORS.reduce((best, col) => (counts[col] > counts[best] ? col : best), 'red' as PartyColor);
  }
  return { action: 'play_card', cardId: pick.id, chosenColor };
}

export type PartyGameState = ParchisGameState | UnoGameState;

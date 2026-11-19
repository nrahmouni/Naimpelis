export type PartyColor = 'red' | 'blue' | 'yellow' | 'green';
export type PartyGameType = 'parchis' | 'uno';

export const PARTY_COLORS: PartyColor[] = ['red', 'blue', 'yellow', 'green'];
export const PARTY_TURN_DECISION_MS = 15_000;

export interface PartySeatPlayer {
  seatIndex: number;
  userId: string;
  name: string;
  avatar: string;
  color: PartyColor;
  isBot: boolean;
  score: number;
}

export interface ParchisPiece {
  id: number; // 0..3
  color: PartyColor;
  progress: number;
}

export interface ParchisGameState {
  id: string;
  gameType: 'parchis';
  status: 'waiting' | 'playing' | 'finished';
  players: PartySeatPlayer[];
  turnSeat: number;
  dice: number | null;
  phase: 'roll' | 'move';
  consecutiveSixes: number;
  lastMovedPieceId?: number | null;
  bonusSteps: number; // +20 al comer, +10 al llegar a meta
  pieces: Record<PartyColor, ParchisPiece[]>;
  winnerSeat: number | null;
  log: string[];
  turnDeadlineAt?: number;
  updatedAt: number;
}

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
  status: 'waiting' | 'playing' | 'finished';
  players: PartySeatPlayer[];
  hands: Record<number, UnoCard[]>;
  deck: UnoCard[];
  discardPile: UnoCard[];
  activeColor: PartyColor;
  turnSeat: number;
  direction: 1 | -1;
  pendingDraw: number;
  pendingWild4Challenge?: {
    offenderSeat: number;
    victimSeat: number;
    wasIllegal: boolean;
    chosenColor: PartyColor;
  } | null;
  drawnPlayableCardId?: string | null;
  vulnerableUnoSeat?: number | null;
  roundPointsWon?: number;
  winnerSeat: number | null;
  unoCalledSeats: number[];
  log: string[];
  turnDeadlineAt?: number;
  updatedAt: number;
}

export type PartyGameState = ParchisGameState | UnoGameState;

const BOT_PROFILES: Array<{ name: string; avatar: string }> = [
  { name: 'Machupichu', avatar: '🦙' },
  { name: 'Pocasoltes', avatar: '🤪' },
  { name: 'Capgròs', avatar: '🗿' },
  { name: 'Tros d’Ase', avatar: '🫏' },
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

export function preserveSeatsForRematch(
  prevPlayers: PartySeatPlayer[],
  humans: Array<{ id: string; name: string; avatar?: string }>
): PartySeatPlayer[] {
  const humanMap = new Map(humans.filter((h) => h?.id).map((h) => [h.id, h]));
  const alreadySeated = new Set<string>();
  const seats: PartySeatPlayer[] = prevPlayers.map((pl, idx) => {
    const color = pl.color || PARTY_COLORS[idx % PARTY_COLORS.length];
    if (!pl.isBot && humanMap.has(pl.userId)) {
      const h = humanMap.get(pl.userId)!;
      alreadySeated.add(h.id);
      return {
        ...pl,
        seatIndex: idx,
        userId: h.id,
        name: h.name || pl.name,
        avatar: h.avatar || pl.avatar || '🎮',
        color,
        isBot: false,
      };
    }
    const bot = BOT_PROFILES[idx % BOT_PROFILES.length];
    return {
      seatIndex: idx,
      userId: `bot-seat-${idx}-${color}`,
      name: bot.name,
      avatar: bot.avatar,
      color,
      isBot: true,
      score: pl.isBot ? pl.score : 0,
    };
  });

  for (const h of humans) {
    if (!h?.id || alreadySeated.has(h.id)) continue;
    const botIdx = seats.findIndex((s) => s.isBot);
    if (botIdx === -1) break;
    alreadySeated.add(h.id);
    seats[botIdx] = {
      ...seats[botIdx],
      userId: h.id,
      name: h.name || 'Jugador',
      avatar: h.avatar || '🎮',
      isBot: false,
      score: 0,
    };
  }
  return seats;
}

export function claimPartyBotSeat(
  state: PartyGameState,
  human: { id: string; name: string; avatar?: string },
  preferredSeatIndex?: number
): { ok: true; state: PartyGameState; claimedSeat: number } | { ok: false; error: string } {
  const existingIdx = state.players.findIndex((p) => !p.isBot && p.userId === human.id);
  if (existingIdx !== -1) {
    if (
      state.status === 'waiting' &&
      typeof preferredSeatIndex === 'number' &&
      preferredSeatIndex >= 0 &&
      preferredSeatIndex < state.players.length &&
      preferredSeatIndex !== existingIdx &&
      state.players[preferredSeatIndex]?.isBot
    ) {
      const oldSeat = state.players[existingIdx];
      const oldBot = BOT_PROFILES[existingIdx % BOT_PROFILES.length];
      const nextPlayers = state.players.map((pl, idx) => {
        if (idx === existingIdx) {
          return {
            ...pl,
            userId: `bot-seat-${existingIdx}-${oldSeat.color}`,
            name: oldBot.name,
            avatar: oldBot.avatar,
            isBot: true,
          };
        }
        if (idx === preferredSeatIndex) {
          return {
            ...pl,
            userId: human.id,
            name: human.name || pl.name,
            avatar: human.avatar || '🎮',
            isBot: false,
          };
        }
        return pl;
      });
      return {
        ok: true,
        claimedSeat: preferredSeatIndex,
        state: {
          ...state,
          players: nextPlayers,
          log: [
            ...state.log.slice(-14),
            `🎨 ${human.name || 'Jugador'} eligió el color ${state.players[preferredSeatIndex].color.toUpperCase()}.`,
          ],
          updatedAt: Date.now(),
        },
      };
    }
    return { ok: true, state, claimedSeat: existingIdx };
  }

  let targetIdx = -1;
  if (
    typeof preferredSeatIndex === 'number' &&
    preferredSeatIndex >= 0 &&
    preferredSeatIndex < state.players.length &&
    state.players[preferredSeatIndex]?.isBot
  ) {
    targetIdx = preferredSeatIndex;
  } else {
    targetIdx = state.players.findIndex((p) => p.isBot);
  }

  if (targetIdx === -1) {
    return { ok: false, error: 'La mesa está completa (4/4 jugadores).' };
  }

  const nextPlayers = state.players.map((pl, idx) =>
    idx === targetIdx
      ? {
          ...pl,
          userId: human.id,
          name: human.name || pl.name,
          avatar: human.avatar || '🎮',
          isBot: false,
        }
      : pl
  );

  return {
    ok: true,
    claimedSeat: targetIdx,
    state: {
      ...state,
      players: nextPlayers,
      log: [
        ...state.log.slice(-14),
        `🪑 ${human.name || 'Jugador'} ocupó el asiento #${targetIdx + 1}.`,
      ],
      updatedAt: Date.now(),
    },
  };
}

export function startPartyMatch(state: PartyGameState): PartyGameState {
  if (state.status === 'playing') return state;
  const now = Date.now();
  return {
    ...state,
    status: 'playing',
    turnDeadlineAt: now + PARTY_TURN_DECISION_MS,
    log: [...state.log.slice(-14), '🚀 ¡El anfitrión inició la partida! Turnos de 15 segundos.'],
    updatedAt: now,
  };
}

export function vacatePartySeatToBot(
  state: PartyGameState,
  userId: string
): { state: PartyGameState; changed: boolean } {
  const idx = state.players.findIndex((p) => !p.isBot && p.userId === userId);
  if (idx === -1) {
    return { state, changed: false };
  }

  const prevSeat = state.players[idx];
  const bot = BOT_PROFILES[idx % BOT_PROFILES.length];
  const nextPlayers = state.players.map((pl, i) =>
    i === idx
      ? {
          ...pl,
          userId: `bot-seat-${idx}-${prevSeat.color}`,
          name: bot.name,
          avatar: bot.avatar,
          isBot: true,
        }
      : pl
  );

  return {
    changed: true,
    state: {
      ...state,
      players: nextPlayers,
      log: [
        ...state.log.slice(-14),
        `🤖 ${bot.name} tomó el relevo de ${prevSeat.name}.`,
      ],
      updatedAt: Date.now(),
    },
  };
}

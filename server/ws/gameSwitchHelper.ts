import {
  createInitialBoardGameState,
  joinGameSeat,
  type BoardGameState,
} from '../../src/shared/boardGames.ts';
import {
  createInitialParchisState,
  createInitialUnoState,
  type PartyGameState,
} from '../../src/shared/partyGames.ts';
import {
  createInitialPinturilloState,
  type PinturilloGameState,
} from '../../src/shared/pinturillo.ts';
import {
  createInitialPoolState,
  type Pool8BallState,
} from '../../src/shared/pool8Ball.ts';
import {
  createInitialChapasState,
  type FutbolChapasState,
} from '../../src/shared/futbolChapas.ts';
import {
  createInitialHeadSoccerOnlineState,
  joinHeadSoccerSeat,
  type HeadSoccerOnlineState,
} from '../../src/shared/headSoccer.ts';
import {
  createInitialPokerState,
  type PokerGameState,
} from '../../src/shared/texasHoldem.ts';
import {
  createInitialBlackjackState,
  joinBlackjackSeat,
  type BlackjackGameState,
} from '../../src/shared/blackjack.ts';
import type { RoomGameInviteType } from '../../src/shared/protocol.ts';

export interface PreservedHumanPlayer {
  id: string;
  name: string;
  avatar: string;
  color: string;
}

export interface RoomGamesSnapshot {
  participants: Array<{
    id: string;
    name: string;
    avatar?: string;
    color?: string;
  }>;
  gameState?: BoardGameState | null;
  partyGameState?: PartyGameState | null;
  pinturilloState?: PinturilloGameState | null;
  poolGameState?: Pool8BallState | null;
  chapasState?: FutbolChapasState | null;
  headSoccerState?: HeadSoccerOnlineState | null;
  pokerGameState?: PokerGameState | null;
  blackjackState?: BlackjackGameState | null;
}

export interface SwitchedRoomGameStates {
  gameState: BoardGameState | null;
  partyGameState: PartyGameState | null;
  pinturilloState: PinturilloGameState | null;
  poolGameState: Pool8BallState | null;
  chapasState: FutbolChapasState | null;
  headSoccerState: HeadSoccerOnlineState | null;
  pokerGameState: PokerGameState | null;
  blackjackState: BlackjackGameState | null;
}

export function collectSeatedHumansFromRoom(
  room: RoomGamesSnapshot,
  fallbackActor?: PreservedHumanPlayer | null
): PreservedHumanPlayer[] {
  const byParticipantId = new Map(room.participants.map((p) => [p.id, p]));
  const collected: PreservedHumanPlayer[] = [];
  const seen = new Set<string>();

  const pushPlayer = (
    userId?: string | null,
    name?: string,
    avatar?: string,
    color?: string,
    isBot?: boolean
  ) => {
    if (!userId || isBot || seen.has(userId)) return;
    if (userId.startsWith('bot-')) return;
    seen.add(userId);
    const liveP = byParticipantId.get(userId);
    collected.push({
      id: userId,
      name: liveP?.name || name || 'Jugador',
      avatar: liveP?.avatar || avatar || '🎮',
      color: liveP?.color || color || '#9146FF',
    });
  };

  if (room.poolGameState) {
    for (const p of room.poolGameState.players) {
      if (p) pushPlayer(p.userId, p.name, p.avatar, p.color, p.isBot);
    }
  }
  if (room.chapasState) {
    for (const p of room.chapasState.players) {
      if (p) pushPlayer(p.userId, p.name, p.avatar, p.color, p.isBot);
    }
  }
  if (room.headSoccerState) {
    for (const p of room.headSoccerState.players) {
      if (p) pushPlayer(p.userId, p.name, p.avatar, p.color, p.isBot);
    }
  }
  if (room.pokerGameState) {
    for (const s of room.pokerGameState.seats) {
      if (s) pushPlayer(s.userId, s.name, s.avatar, s.color, s.isBot);
    }
  }
  if (room.blackjackState) {
    for (const s of room.blackjackState.seats) {
      if (s) pushPlayer(s.userId, s.name, s.avatar, s.color, false);
    }
  }
  if (room.pinturilloState) {
    for (const p of room.pinturilloState.players) {
      if (p) pushPlayer(p.userId, p.name, p.avatar, p.color, p.isBot);
    }
  }
  if (room.partyGameState) {
    for (const p of room.partyGameState.players) {
      if (p) pushPlayer(p.userId, p.name, p.avatar, undefined, p.isBot);
    }
  }
  if (room.gameState) {
    const seats = [room.gameState.players.w, room.gameState.players.b];
    for (const p of seats) {
      if (p) pushPlayer(p.userId, p.name, p.avatar, p.color, p.isBot);
    }
  }

  if (collected.length === 0 && fallbackActor?.id) {
    pushPlayer(fallbackActor.id, fallbackActor.name, fallbackActor.avatar, fallbackActor.color, false);
  }

  return collected;
}

export function buildSwitchedRoomGameStates(
  targetGame: RoomGameInviteType,
  humans: PreservedHumanPlayer[]
): SwitchedRoomGameStates {
  const result: SwitchedRoomGameStates = {
    gameState: null,
    partyGameState: null,
    pinturilloState: null,
    poolGameState: null,
    chapasState: null,
    headSoccerState: null,
    pokerGameState: null,
    blackjackState: null,
  };

  if (targetGame === 'chess' || targetGame === 'checkers' || targetGame === 'connect4') {
    let st = createInitialBoardGameState(targetGame, humans[0], false, undefined, 0, [], false);
    if (humans[1]) {
      st = joinGameSeat(st, humans[1], 'b');
    }
    result.gameState = st;
    return result;
  }

  if (targetGame === 'parchis') {
    result.partyGameState = createInitialParchisState(humans.slice(0, 4), {
      waitForHost: humans.length < 2,
    });
    return result;
  }

  if (targetGame === 'uno') {
    result.partyGameState = createInitialUnoState(humans.slice(0, 4), {
      waitForHost: humans.length < 2,
    });
    return result;
  }

  if (targetGame === 'pinturillo') {
    result.pinturilloState = createInitialPinturilloState(humans.slice(0, 6), undefined, {
      waitForHost: humans.length < 2,
    });
    return result;
  }

  if (targetGame === 'pool') {
    result.poolGameState = createInitialPoolState(humans.slice(0, 2), {
      waitForHost: false,
    });
    return result;
  }

  if (targetGame === 'chapas') {
    result.chapasState = createInitialChapasState(humans.slice(0, 4), {
      waitForHost: humans.length < 2,
      botsEnabled: true,
    });
    return result;
  }

  if (targetGame === 'headsoccer') {
    let st = createInitialHeadSoccerOnlineState(humans[0]);
    if (humans[1]) {
      const joined = joinHeadSoccerSeat(st, humans[1], 1);
      if (joined.ok) st = joined.state;
    }
    result.headSoccerState = st;
    return result;
  }

  if (targetGame === 'poker') {
    result.pokerGameState = createInitialPokerState(humans.slice(0, 6), {
      fillWithBots: true,
      autoStart: false,
    });
    return result;
  }

  if (targetGame === 'blackjack') {
    let st = createInitialBlackjackState(humans[0]);
    for (const h of humans.slice(1, 4)) {
      const joined = joinBlackjackSeat(st, h);
      if (joined.ok) st = joined.state;
    }
    result.blackjackState = st;
    return result;
  }

  return result;
}

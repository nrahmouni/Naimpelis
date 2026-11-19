import type {
  HeadSoccerSeat,
  HeadSoccerOnlineState,
  HeadSoccerSkinId,
} from './headSoccer';
import { HS_MATCH_DURATION_SEC } from './headSoccerConstants';

export type { HeadSoccerSeat, HeadSoccerOnlineState };

export function createInitialHeadSoccerOnlineState(
  hostUser?: { id: string; name: string; avatar: string; color: string }
): HeadSoccerOnlineState {
  const players: [HeadSoccerSeat | null, HeadSoccerSeat | null] = [
    hostUser
      ? {
          seatIndex: 0,
          userId: hostUser.id,
          name: hostUser.name,
          avatar: hostUser.avatar || '⚽',
          color: hostUser.color || '#9146FF',
          skinId: 'striker',
          connected: true,
        }
      : null,
    null,
  ];
  return {
    status: 'waiting',
    players,
    scores: [0, 0],
    timeLeftSec: HS_MATCH_DURATION_SEC,
    isGoldenGoal: false,
    winnerSeat: null,
    updatedAt: Date.now(),
    startedAt: null,
  };
}

export function joinHeadSoccerSeat(
  state: HeadSoccerOnlineState,
  user: { id: string; name: string; avatar: string; color: string },
  requestedSeat?: 0 | 1 | 'spectate'
): { ok: boolean; state: HeadSoccerOnlineState } {
  const nextPlayers: [HeadSoccerSeat | null, HeadSoccerSeat | null] = [
    state.players[0] ? { ...state.players[0] } : null,
    state.players[1] ? { ...state.players[1] } : null,
  ];

  const existingIdx = nextPlayers.findIndex((p) => p?.userId === user.id);

  if (requestedSeat === 'spectate') {
    if (state.status !== 'waiting' || existingIdx === -1) return { ok: false, state };
    nextPlayers[existingIdx] = null;
    return {
      ok: true,
      state: { ...state, players: nextPlayers, updatedAt: Date.now() },
    };
  }

  const targetIdx: 0 | 1 | null =
    requestedSeat === 0 || requestedSeat === 1
      ? requestedSeat
      : nextPlayers[0] === null
      ? 0
      : nextPlayers[1] === null
      ? 1
      : null;

  if (targetIdx === null) return { ok: false, state };
  if (
    nextPlayers[targetIdx] &&
    nextPlayers[targetIdx]!.userId !== user.id &&
    !nextPlayers[targetIdx]!.isBot
  ) {
    return { ok: false, state };
  }

  const prevSkin =
    existingIdx !== -1 && nextPlayers[existingIdx]
      ? nextPlayers[existingIdx]!.skinId
      : targetIdx === 0
      ? 'striker'
      : 'furia';
  if (existingIdx !== -1 && existingIdx !== targetIdx) {
    nextPlayers[existingIdx] = null;
  }

  nextPlayers[targetIdx] = {
    seatIndex: targetIdx,
    userId: user.id,
    name: user.name,
    avatar: user.avatar || '⚽',
    color: user.color || (targetIdx === 0 ? '#9146FF' : '#EF4444'),
    skinId: prevSkin,
    connected: true,
  };

  return {
    ok: true,
    state: { ...state, players: nextPlayers, updatedAt: Date.now() },
  };
}

export function selectHeadSoccerSkin(
  state: HeadSoccerOnlineState,
  userId: string,
  skinId: HeadSoccerSkinId
): HeadSoccerOnlineState {
  const nextPlayers: [HeadSoccerSeat | null, HeadSoccerSeat | null] = [
    state.players[0] ? { ...state.players[0] } : null,
    state.players[1] ? { ...state.players[1] } : null,
  ];
  const idx = nextPlayers.findIndex((p) => p?.userId === userId);
  if (idx === -1 || !nextPlayers[idx]) return state;
  nextPlayers[idx]!.skinId = skinId;
  return { ...state, players: nextPlayers, updatedAt: Date.now() };
}

export function startHeadSoccerMatch(
  state: HeadSoccerOnlineState
): { ok: boolean; error?: string; state: HeadSoccerOnlineState } {
  if (!state.players[0]) {
    return { ok: false, error: 'Falta jugador 1 en la portería izquierda.', state };
  }
  const players: [HeadSoccerSeat | null, HeadSoccerSeat | null] = [
    { ...state.players[0] },
    state.players[1]
      ? { ...state.players[1] }
      : {
          seatIndex: 1,
          userId: 'bot-headsoccer-ia',
          name: 'Bot Cabezón',
          avatar: '🤖',
          color: '#EF4444',
          skinId: state.players[0].skinId === 'furia' ? 'maestro' : 'furia',
          isBot: true,
          connected: true,
        },
  ];
  return {
    ok: true,
    state: {
      status: 'playing',
      players,
      scores: [0, 0],
      timeLeftSec: HS_MATCH_DURATION_SEC,
      isGoldenGoal: false,
      winnerSeat: null,
      updatedAt: Date.now(),
      startedAt: Date.now(),
    },
  };
}

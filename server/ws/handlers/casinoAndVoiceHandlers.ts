import { WebSocket } from 'ws';
import {
  buildSwitchedRoomGameStates,
  collectSeatedHumansFromRoom,
} from '../gameSwitchHelper.ts';
import {
  joinPinturilloPlayer,
  redactPinturilloForUser,
  startPinturilloMatch,
} from '../../../src/shared/pinturillo.ts';
import { joinPoolSeat, startPoolMatch } from '../../../src/shared/pool8Ball.ts';
import { joinChapasSeat } from '../../../src/shared/futbolChapas.ts';
import { joinHeadSoccerSeat } from '../../../src/shared/headSoccer.ts';
import { joinPokerSeat, redactPokerStateForUser } from '../../../src/shared/texasHoldem.ts';
import { joinBlackjackSeat, redactBlackjackState } from '../../../src/shared/blackjack.ts';
import type { RoomGameInviteType } from '../../../src/shared/protocol.ts';
import type { RoomChatMessageRecord } from '../roomHubHelpers.ts';
import {
  wsGameInviteRespondSchema,
  wsGameSwitchSchema,
  wsVoiceRoomSchema,
  wsVoiceSignalSchema,
  wsVoiceStateSchema,
} from '../wsSchemas.ts';
import { handlePokerAndBlackjackMessage } from './pokerAndBlackjackHandlers.ts';
import type { WsMessageHandler } from './types.ts';

export const handleCasinoAndVoiceMessage: WsMessageHandler = (
  type,
  payload,
  ws,
  ctx
) => {
  if (handlePokerAndBlackjackMessage(type, payload, ws, ctx)) {
    return true;
  }

  const {
    rooms,
    headSoccerSeqByRoom,
    roomVoicePeers,
    clients,
    schedulePersistRoom,
    getVoicePeersForRoom,
    removeVoicePeer,
    broadcastToRoom,
    broadcastPokerState,
    broadcastBlackjackState,
    broadcastPinturilloState,
    clearMatchResponses,
    stopPokerBotTimer,
    schedulePokerBotTimer,
    stopPinturilloTimer,
    schedulePinturilloLifecycle,
    stopPoolTurnTimer,
    schedulePoolTurnTimer,
    stopChapasTimer,
    scheduleChapasTurnTimer,
    stopBoardTurnTimer,
    scheduleBoardTurnTimer,
    stopPartyBotTimer,
    schedulePartyBotTurnIfNeeded,
  } = ctx;

  // Seamless In-Game Switcher preserving seated human players
  if (type === 'GAME_SWITCH') {
    const valid = wsGameSwitchSchema.safeParse(payload);
    if (!valid.success) return true;
    const room = rooms.get(valid.data.roomId.toLowerCase());
    const senderMeta = clients.get(ws);
    if (!room || !senderMeta?.userId) return true;

    const fallbackActor = {
      id: senderMeta.userId,
      name: senderMeta.userName || 'Jugador',
      avatar: senderMeta.userAvatar || '🎮',
      color: senderMeta.userColor || '#9146FF',
    };

    const preservedHumans = collectSeatedHumansFromRoom(room, fallbackActor);
    const seatedUserIds = preservedHumans.map((h) => h.id);
    const isHostOrCreator =
      room.hostId === senderMeta.userId || room.creatorId === senderMeta.userId;
    const isSeatedPlayer = seatedUserIds.includes(senderMeta.userId);
    if (!isHostOrCreator && !isSeatedPlayer) return true;

    stopBoardTurnTimer(room.id);
    stopPartyBotTimer(room.id);
    stopPinturilloTimer(room.id);
    stopPoolTurnTimer(room.id);
    stopChapasTimer(room.id);
    stopPokerBotTimer(room.id);
    headSoccerSeqByRoom.delete(room.id);
    clearMatchResponses(room);

    const nextStates = buildSwitchedRoomGameStates(valid.data.targetGame, preservedHumans);
    room.gameState = nextStates.gameState;
    room.partyGameState = nextStates.partyGameState;
    room.pinturilloState = nextStates.pinturilloState;
    room.poolGameState = nextStates.poolGameState;
    room.chapasState = nextStates.chapasState;
    room.headSoccerState = nextStates.headSoccerState;
    room.pokerGameState = nextStates.pokerGameState;
    room.blackjackState = nextStates.blackjackState;

    const gameTitleMap: Record<RoomGameInviteType, string> = {
      pool: 'Billar Bola 8',
      chapas: 'Fútbol Chapas',
      headsoccer: 'Fútbol Cabezones',
      poker: 'Póker Hold’em',
      blackjack: 'Blackjack 21',
      parchis: 'Parchís',
      uno: 'UNO',
      pinturillo: 'Pinturillo',
      chess: 'Ajedrez',
      checkers: 'Damas',
      connect4: 'Conecta 4',
      penalty: 'Penaltis Mundial',
      racing3d: 'Nitro GP 3D',
      gyrohockey: 'Neon Air Hockey Gyro',
      gyrospace: 'Galaxia Interceptor Gyro',
      bomberman: 'Bomberman Party Arena',
      pacman: 'Pac-Man Arcade HD',
      tetris: 'Tetris Sprint TV',
      hextris: 'Hextris Neon TV',
      game2048: '2048 TV Edition',
      flappy: 'Clumsy Bird TV',
      hexgl: 'HexGL Hover 3D',
      arkanoid: 'BrickIt Arkanoid',
      invaders: 'Space Invaders Retro',
      tvtrivia: 'Riffan TV Quiz Show',
    };

    const sysMsg: RoomChatMessageRecord = {
      id: `game-switch-${Date.now()}`,
      senderId: 'system',
      senderName: 'RiffanTV',
      senderAvatar: '🎮',
      senderColor: '#9146FF',
      text: `${senderMeta.userName || 'Un jugador'} cambió el juego a ${gameTitleMap[valid.data.targetGame]} (${preservedHumans.length} ${preservedHumans.length === 1 ? 'jugador' : 'jugadores'}).`,
      timestamp: Date.now(),
      isSystem: true,
    };
    room.messages.push(sysMsg);
    if (room.messages.length > 150) room.messages = room.messages.slice(-150);
    schedulePersistRoom(room.id);

    clients.forEach((meta, clientWs) => {
      if (meta.roomId === room.id && clientWs.readyState === WebSocket.OPEN) {
        const viewerId = meta.userId || '';
        clientWs.send(
          JSON.stringify({
            type: 'GAME_SWITCHED',
            payload: {
              targetGame: valid.data.targetGame,
              switchedByUserId: senderMeta.userId,
              switchedByName: senderMeta.userName || 'Jugador',
              seatedUserIds,
              roomState: {
                gameState: room.gameState,
                partyGameState: room.partyGameState,
                pinturilloState: redactPinturilloForUser(room.pinturilloState ?? null, viewerId),
                poolGameState: room.poolGameState,
                chapasState: room.chapasState,
                headSoccerState: room.headSoccerState,
                pokerGameState: redactPokerStateForUser(room.pokerGameState ?? null, viewerId),
                blackjackState: redactBlackjackState(room.blackjackState ?? null),
                matchResponses: room.matchResponses ?? null,
              },
              message: sysMsg,
            },
          })
        );
      }
    });

    if (room.gameState?.status === 'playing') scheduleBoardTurnTimer(room);
    if (room.partyGameState?.status === 'playing') schedulePartyBotTurnIfNeeded(room);
    if (room.pinturilloState && room.pinturilloState.status !== 'waiting') {
      schedulePinturilloLifecycle(room);
    }
    if (room.poolGameState?.status === 'playing') schedulePoolTurnTimer(room);
    if (room.chapasState?.status === 'playing') scheduleChapasTurnTimer(room);
    if (room.pokerGameState?.status === 'playing') schedulePokerBotTimer(room);
    return true;
  }

  // Unified Invite Response (Accepted / Declined) & Auto-Ready Handling Across All Games
  if (type === 'GAME_INVITE_RESPOND') {
    const valid = wsGameInviteRespondSchema.safeParse(payload);
    if (!valid.success) return true;
    const room = rooms.get(valid.data.roomId.toLowerCase());
    const senderMeta = clients.get(ws);
    if (!room || !senderMeta?.userId || !room.matchResponses) return true;
    if (room.matchResponses.gameType !== valid.data.gameType) return true;
    if (valid.data.inviteId && room.matchResponses.inviteId !== valid.data.inviteId) return true;

    const now = Date.now();
    let updated = false;
    const nextResponses = room.matchResponses.responses.map((entry) => {
      if (entry.userId !== senderMeta.userId) return entry;
      updated = true;
      return { ...entry, status: valid.data.response, updatedAt: now };
    });
    if (!updated) {
      nextResponses.push({
        userId: senderMeta.userId,
        userName: senderMeta.userName || 'Invitado',
        avatar: senderMeta.userAvatar || '🍿',
        status: valid.data.response,
        updatedAt: now,
      });
    }

    room.matchResponses = {
      ...room.matchResponses,
      responses: nextResponses,
    };

    if (valid.data.response === 'accepted') {
      if (valid.data.gameType === 'pool' && room.poolGameState?.status === 'waiting') {
        const joined = joinPoolSeat(
          room.poolGameState,
          {
            id: senderMeta.userId,
            name: senderMeta.userName || 'Jugador',
            avatar: senderMeta.userAvatar || '🎱',
            color: senderMeta.userColor || '#9146FF',
          },
          1,
          now,
          { keepWaiting: true }
        );
        if (joined.ok) {
          room.poolGameState = joined.state;
          broadcastToRoom(room.id, {
            type: 'POOL_STATE_UPDATED',
            payload: { poolGameState: room.poolGameState },
          });
        }
      } else if (
        valid.data.gameType === 'pinturillo' &&
        room.pinturilloState?.status === 'waiting'
      ) {
        room.pinturilloState = joinPinturilloPlayer(room.pinturilloState, {
          id: senderMeta.userId,
          name: senderMeta.userName || 'Jugador',
          avatar: senderMeta.userAvatar || '🎨',
          color: senderMeta.userColor || '#9146FF',
        });
        broadcastPinturilloState(room);
      } else if (
        valid.data.gameType === 'chapas' &&
        room.chapasState?.status === 'waiting'
      ) {
        const joined = joinChapasSeat(room.chapasState, {
          id: senderMeta.userId,
          name: senderMeta.userName || 'Jugador',
          avatar: senderMeta.userAvatar || '⚽',
          color: senderMeta.userColor || '#38BDF8',
        });
        if (joined.ok) {
          room.chapasState = joined.state;
          broadcastToRoom(room.id, {
            type: 'CHAPAS_STATE_UPDATED',
            payload: { chapasState: room.chapasState },
          });
        }
      } else if (
        valid.data.gameType === 'headsoccer' &&
        room.headSoccerState?.status === 'waiting'
      ) {
        const joined = joinHeadSoccerSeat(
          room.headSoccerState,
          {
            id: senderMeta.userId,
            name: senderMeta.userName || 'Jugador',
            avatar: senderMeta.userAvatar || '⚽',
            color: senderMeta.userColor || '#38BDF8',
          },
          1
        );
        if (joined.ok) {
          room.headSoccerState = joined.state;
          broadcastToRoom(room.id, {
            type: 'HEADSOCCER_STATE_UPDATED',
            payload: { headSoccerState: room.headSoccerState },
          });
        }
      } else if (
        valid.data.gameType === 'poker' &&
        room.pokerGameState &&
        room.pokerGameState.status !== 'playing'
      ) {
        const joined = joinPokerSeat(room.pokerGameState, {
          id: senderMeta.userId,
          name: senderMeta.userName || 'Jugador',
          avatar: senderMeta.userAvatar || '🃏',
          color: senderMeta.userColor || '#9146FF',
        });
        if (joined.ok) {
          room.pokerGameState = joined.state;
          broadcastPokerState(room);
        }
      } else if (
        valid.data.gameType === 'blackjack' &&
        room.blackjackState &&
        room.blackjackState.phase === 'betting'
      ) {
        const joined = joinBlackjackSeat(room.blackjackState, {
          id: senderMeta.userId,
          name: senderMeta.userName || 'Jugador',
          avatar: senderMeta.userAvatar || '🎰',
          color: senderMeta.userColor || '#10B981',
        });
        if (joined.ok) {
          room.blackjackState = joined.state;
          broadcastBlackjackState(room);
        }
      }
    }

    broadcastToRoom(room.id, {
      type: 'GAME_INVITE_STATUS_UPDATED',
      payload: { matchResponses: room.matchResponses },
    });

    const pendingCount = room.matchResponses.responses.filter(
      (r) => r.status === 'pending'
    ).length;
    const acceptedCount = room.matchResponses.responses.filter(
      (r) => r.status === 'accepted'
    ).length;

    if (pendingCount === 0 && acceptedCount > 0) {
      if (
        valid.data.gameType === 'pool' &&
        room.poolGameState?.status === 'waiting' &&
        room.poolGameState.players[0] &&
        room.poolGameState.players[1]
      ) {
        room.poolGameState = startPoolMatch(room.poolGameState, now);
        clearMatchResponses(room, 'pool');
        schedulePersistRoom(room.id);
        broadcastToRoom(room.id, {
          type: 'POOL_STATE_UPDATED',
          payload: { poolGameState: room.poolGameState },
        });
        schedulePoolTurnTimer(room);
      } else if (
        valid.data.gameType === 'pinturillo' &&
        room.pinturilloState?.status === 'waiting'
      ) {
        room.pinturilloState = startPinturilloMatch(room.pinturilloState);
        clearMatchResponses(room, 'pinturillo');
        schedulePersistRoom(room.id);
        broadcastPinturilloState(room);
        schedulePinturilloLifecycle(room);
      }
    }
    return true;
  }

  // WebRTC Live Voice Chat Signaling for Multiplayer Games
  if (type === 'VOICE_JOIN') {
    const valid = wsVoiceRoomSchema.safeParse(payload);
    if (!valid.success) return true;
    const senderMeta = clients.get(ws);
    const roomId = valid.data.roomId.toLowerCase();
    if (!senderMeta?.userId || senderMeta.roomId !== roomId) return true;

    let peersMap = roomVoicePeers.get(roomId);
    if (!peersMap) {
      peersMap = new Map();
      roomVoicePeers.set(roomId, peersMap);
    }
    peersMap.set(senderMeta.userId, {
      userId: senderMeta.userId,
      userName: senderMeta.userName || 'Jugador',
      avatar: senderMeta.userAvatar || '🎮',
      color: senderMeta.userColor || '#9146FF',
      isMuted: false,
      joinedAt: Date.now(),
    });

    broadcastToRoom(roomId, {
      type: 'VOICE_PARTICIPANTS_UPDATED',
      payload: {
        roomId,
        peers: getVoicePeersForRoom(roomId),
      },
    });
    return true;
  }

  if (type === 'VOICE_LEAVE') {
    const valid = wsVoiceRoomSchema.safeParse(payload);
    if (!valid.success) return true;
    const senderMeta = clients.get(ws);
    const roomId = valid.data.roomId.toLowerCase();
    if (!senderMeta?.userId || senderMeta.roomId !== roomId) return true;
    removeVoicePeer(roomId, senderMeta.userId);
    return true;
  }

  if (type === 'VOICE_STATE_UPDATE') {
    const valid = wsVoiceStateSchema.safeParse(payload);
    if (!valid.success) return true;
    const senderMeta = clients.get(ws);
    const roomId = valid.data.roomId.toLowerCase();
    if (!senderMeta?.userId || senderMeta.roomId !== roomId) return true;
    const peersMap = roomVoicePeers.get(roomId);
    const existing = peersMap?.get(senderMeta.userId);
    if (!existing) return true;
    peersMap!.set(senderMeta.userId, {
      ...existing,
      isMuted: valid.data.isMuted,
    });
    broadcastToRoom(roomId, {
      type: 'VOICE_PARTICIPANTS_UPDATED',
      payload: {
        roomId,
        peers: getVoicePeersForRoom(roomId),
      },
    });
    return true;
  }

  if (type === 'VOICE_SIGNAL') {
    const valid = wsVoiceSignalSchema.safeParse(payload);
    if (!valid.success) return true;
    const senderMeta = clients.get(ws);
    const roomId = valid.data.roomId.toLowerCase();
    if (!senderMeta?.userId || senderMeta.roomId !== roomId) return true;
    const { targetUserId, signalType, sdp, candidate } = valid.data;
    if (!targetUserId || targetUserId === senderMeta.userId) return true;

    const packet = JSON.stringify({
      type: 'VOICE_SIGNAL',
      payload: {
        roomId,
        fromUserId: senderMeta.userId,
        targetUserId,
        signalType,
        sdp,
        candidate,
      },
    });
    clients.forEach((meta, clientWs) => {
      if (
        meta.roomId === roomId &&
        meta.userId === targetUserId &&
        clientWs.readyState === WebSocket.OPEN
      ) {
        clientWs.send(packet);
      }
    });
    return true;
  }

  return false;
};

/**
 * NAIM CINE — Unified Shared Protocol & Message Contracts
 * Single source of truth for Client <-> Server WebSocket messages and Real-time Payloads.
 */

import type {
  BlackjackGameState,
  BoardGameState,
  ChapasShotInput,
  FutbolChapasState,
  HeadSoccerInput,
  HeadSoccerOnlineState,
  HeadSoccerSimulation,
  PartyGameState,
  PinturilloGameState,
  PinturilloStroke,
  PokerGameState,
  Pool8BallState,
  PoolBallState,
  PoolShotInput,
} from './protocolGameTypes';
import type {
  AuthoritativeVideoState,
  FloatingReactionEvent,
  RoomChatMessage,
  RoomGameInvite,
  RoomGameInviteType,
  RoomMatchResponsesState,
  RoomParticipant,
  RoomStatePayload,
  VideoSyncAction,
  VoicePeerState,
  VoiceSignalPayload,
} from './protocolPayloads';

export * from './protocolGameTypes';
export * from './protocolPayloads';
export type { ClientWsMessage } from './protocolClientMessages';

export type ServerWsMessage =
  | { type: 'PONG'; payload: { clientTs: number; serverTs: number } }
  | { type: 'ROOM_STATE'; payload: RoomStatePayload }
  | {
      type: 'PARTICIPANTS_UPDATED';
      payload: {
        participants: RoomParticipant[];
        hostId: string;
        message?: RoomChatMessage | null;
      };
    }
  | {
      type: 'VIDEO_STATE_UPDATED';
      payload: {
        videoState: AuthoritativeVideoState;
        action: VideoSyncAction;
        message?: RoomChatMessage | null;
      };
    }
  | { type: 'NEW_CHAT_MESSAGE'; payload: RoomChatMessage }
  | {
      type: 'PINNED_MESSAGE_UPDATED';
      payload: { pinnedMessage: RoomChatMessage | null };
    }
  | { type: 'TYPING_UPDATED'; payload: { typingUsers: Array<{ userId: string; userName: string }> } }
  | { type: 'FLOATING_REACTION'; payload: FloatingReactionEvent }
  | {
      type: 'GAME_STATE_UPDATED';
      payload: {
        gameState: BoardGameState | null;
        message?: RoomChatMessage | null;
      };
    }
  | {
      type: 'PARTY_GAME_STATE_UPDATED';
      payload: {
        partyGameState: PartyGameState | null;
        message?: RoomChatMessage | null;
      };
    }
  | {
      type: 'GAME_MOVE_REJECTED';
      payload: {
        error: string;
        gameState?: BoardGameState | null;
      };
    }
  | {
      type: 'ONLINE_USERS_UPDATED';
      payload: {
        users: Array<{
          id: string;
          name: string;
          avatar: string;
          color: string;
          friendCode?: string;
          currentRoomId?: string;
          currentRoomName?: string;
        }>;
      };
    }
  | {
      type: 'VOICE_PARTICIPANTS_UPDATED';
      payload: {
        roomId: string;
        peers: VoicePeerState[];
      };
    }
  | {
      type: 'VOICE_SIGNAL';
      payload: VoiceSignalPayload & {
        fromUserId: string;
      };
    }
  | {
      type: 'PINTURILLO_STATE_UPDATED';
      payload: {
        pinturilloState: PinturilloGameState | null;
        message?: RoomChatMessage | null;
      };
    }
  | {
      type: 'PINTURILLO_STROKE_ADDED';
      payload: {
        stroke: PinturilloStroke;
      };
    }
  | {
      type: 'POOL_STATE_UPDATED';
      payload: {
        poolGameState: Pool8BallState | null;
        message?: RoomChatMessage | null;
      };
    }
  | {
      type: 'POOL_SHOT_BROADCAST';
      payload: {
        shot: PoolShotInput & {
          shooterUserId: string;
          turnNumber: number;
          cueStartX: number;
          cueStartY: number;
        };
        preShotBalls: PoolBallState[];
        authoritativeState: Pool8BallState;
        checksum: number;
        message?: RoomChatMessage | null;
      };
    }
  | {
      type: 'GAME_MATCH_INVITE';
      payload: RoomGameInvite;
    }
  | {
      type: 'GAME_INVITE_STATUS_UPDATED';
      payload: {
        matchResponses: RoomMatchResponsesState | null;
      };
    }
  | {
      type: 'CHAPAS_STATE_UPDATED';
      payload: {
        chapasState: FutbolChapasState | null;
        message?: RoomChatMessage | null;
      };
    }
  | {
      type: 'CHAPAS_SHOT_BROADCAST';
      payload: {
        shot: ChapasShotInput & {
          shooterUserId: string;
          turnNumber: number;
        };
        preShotState: FutbolChapasState;
        authoritativeState: FutbolChapasState;
        message?: RoomChatMessage | null;
      };
    }
  | {
      type: 'HEADSOCCER_STATE_UPDATED';
      payload: {
        headSoccerState: HeadSoccerOnlineState | null;
        message?: RoomChatMessage | null;
      };
    }
  | {
      type: 'HEADSOCCER_INPUT_RELAY';
      payload: {
        side: 0 | 1;
        input: HeadSoccerInput;
        seq: number;
      };
    }
  | {
      type: 'HEADSOCCER_SYNC_BROADCAST';
      payload: {
        seq: number;
        sim: HeadSoccerSimulation;
      };
    }
  | {
      type: 'POKER_STATE_UPDATED';
      payload: {
        pokerGameState: PokerGameState | null;
        message?: RoomChatMessage | null;
      };
    }
  | {
      type: 'BLACKJACK_STATE_UPDATED';
      payload: {
        blackjackState: BlackjackGameState | null;
        message?: RoomChatMessage | null;
      };
    }
  | {
      type: 'GAME_SWITCHED';
      payload: {
        targetGame: RoomGameInviteType;
        switchedByUserId: string;
        switchedByName: string;
        seatedUserIds: string[];
        roomState: Pick<
          RoomStatePayload,
          | 'gameState'
          | 'partyGameState'
          | 'pinturilloState'
          | 'poolGameState'
          | 'chapasState'
          | 'headSoccerState'
          | 'pokerGameState'
          | 'blackjackState'
          | 'matchResponses'
        >;
        message?: RoomChatMessage | null;
      };
    };

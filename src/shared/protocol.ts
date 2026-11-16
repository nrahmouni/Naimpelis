/**
 * NAIM CINE — Unified Shared Protocol & Message Contracts
 * Single source of truth for Client <-> Server WebSocket messages and Real-time Payloads.
 */

import type {
  BoardClockMinutes,
  BoardCoord,
  BoardGameState,
  BoardGameType,
  BoardSide,
  ChessPromotionPiece,
} from './boardGames';
import type {
  ParchisGameState,
  PartyColor,
  PartyGameState,
  PartyGameType,
  UnoGameState,
} from './partyGames';
import type {
  PinturilloGameState,
  PinturilloStroke,
} from './pinturillo';
import type {
  Pool8BallState,
  PoolBallGroup,
  PoolBallState,
  PoolDifficulty,
  PoolFoulType,
  PoolPocketId,
  PoolShotInput,
} from './pool8Ball';
import type {
  ChapasCap,
  ChapasFlagId,
  ChapasPlayerSeat,
  ChapasShotInput,
  ChapasTeamId,
  FutbolChapasState,
} from './futbolChapas';
import type {
  HeadSoccerInput,
  HeadSoccerOnlineState,
  HeadSoccerSeat,
  HeadSoccerSimulation,
  HeadSoccerSkinId,
} from './headSoccer';
import type {
  PokerActionType,
  PokerCard,
  PokerGameState,
  PokerSeat,
} from './texasHoldem';
import type {
  BjCard,
  BlackjackGameState,
  BlackjackSeat,
} from './blackjack';

export type {
  BjCard,
  BlackjackGameState,
  BlackjackSeat,
  BoardClockMinutes,
  BoardCoord,
  BoardGameState,
  BoardGameType,
  BoardSide,
  ChapasCap,
  ChapasFlagId,
  ChapasPlayerSeat,
  ChapasShotInput,
  ChapasTeamId,
  ChessPromotionPiece,
  FutbolChapasState,
  HeadSoccerInput,
  HeadSoccerOnlineState,
  HeadSoccerSeat,
  HeadSoccerSimulation,
  HeadSoccerSkinId,
  ParchisGameState,
  PartyColor,
  PartyGameState,
  PartyGameType,
  PinturilloGameState,
  PinturilloStroke,
  PokerActionType,
  PokerCard,
  PokerGameState,
  PokerSeat,
  Pool8BallState,
  PoolBallGroup,
  PoolBallState,
  PoolDifficulty,
  PoolFoulType,
  PoolPocketId,
  PoolShotInput,
  UnoGameState,
};

export type MediaType = 'movie' | 'tv' | 'youtube' | 'direct' | 'stream' | 'cloud';

export type VideoSyncAction = 'play' | 'pause' | 'seek' | 'change_url' | 'sync_request';

export type RoomRole = 'host' | 'mod' | 'viewer';

export interface AuthoritativeVideoState {
  url: string;
  playing: boolean;
  currentTime: number;
  lastUpdated: number;
  updatedBy: string;
  playbackRate?: number;
  mediaType?: MediaType;
  title?: string;
  poster?: string;
  backdrop?: string;
  mode?: 'hls' | 'direct' | 'cloud' | 'youtube';
  tmdbId?: string;
  season?: number;
  episode?: number;
  preferLang?: string;
}

export interface RoomParticipant {
  id: string;
  name: string;
  avatar: string;
  color: string;
  isHost: boolean;
  role?: RoomRole;
  joinedAt: number;
  isOnline?: boolean;
}

export interface RoomChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderAvatar: string;
  senderColor: string;
  text: string;
  timestamp: number;
  isSystem?: boolean;
  systemUserId?: string;
  systemType?: 'join' | 'leave' | 'video_change' | 'host_transfer' | 'host_change' | 'poll' | 'lock';
}

export interface FloatingReactionEvent {
  id: string;
  emoji: string;
  senderName: string;
  senderColor: string;
  xOffset: number;
  timestamp: number;
}

export interface VoicePeerState {
  userId: string;
  userName: string;
  avatar: string;
  color: string;
  isMuted: boolean;
  joinedAt: number;
}

export interface VoiceSignalPayload {
  roomId: string;
  targetUserId: string;
  signalType: 'offer' | 'answer' | 'ice';
  sdp?: { type: string; sdp?: string };
  candidate?: {
    candidate: string;
    sdpMid?: string | null;
    sdpMLineIndex?: number | null;
    usernameFragment?: string | null;
  };
}

export type RoomGameInviteType =
  | 'pool'
  | 'chapas'
  | 'headsoccer'
  | 'poker'
  | 'blackjack'
  | 'parchis'
  | 'uno'
  | 'pinturillo'
  | 'chess'
  | 'checkers'
  | 'connect4';

export interface RoomGameInvite {
  id: string;
  roomId: string;
  gameType: RoomGameInviteType;
  inviterId: string;
  inviterName: string;
  inviterAvatar: string;
  roomName: string;
  createdAt: number;
}

export type RoomMatchInviteResponseStatus = 'pending' | 'accepted' | 'declined';

export interface RoomMatchInviteResponseEntry {
  userId: string;
  userName: string;
  avatar: string;
  status: RoomMatchInviteResponseStatus;
  updatedAt: number;
}

export interface RoomMatchResponsesState {
  inviteId: string;
  gameType: RoomGameInviteType;
  hostId: string;
  hostName: string;
  createdAt: number;
  responses: RoomMatchInviteResponseEntry[];
}

export interface RoomStatePayload {
  id: string;
  name: string;
  hostId: string;
  creatorId?: string;
  coHostIds?: string[];
  participants: RoomParticipant[];
  voicePeers?: VoicePeerState[];
  videoState: AuthoritativeVideoState;
  messages: RoomChatMessage[];
  pinnedMessage?: RoomChatMessage | null;
  hasPin: boolean;
  hostOnlyControl?: boolean;
  gameState?: BoardGameState | null;
  partyGameState?: PartyGameState | null;
  pinturilloState?: PinturilloGameState | null;
  poolGameState?: Pool8BallState | null;
  chapasState?: FutbolChapasState | null;
  headSoccerState?: HeadSoccerOnlineState | null;
  pokerGameState?: PokerGameState | null;
  blackjackState?: BlackjackGameState | null;
  matchResponses?: RoomMatchResponsesState | null;
  createdAt: number;
  serverTime?: number;
}

export interface TypingUserPayload {
  roomId: string;
  userId: string;
  userName: string;
  isTyping: boolean;
}

export type ClientWsMessage =
  | { type: 'PING'; payload?: { clientTs: number } }
  | {
      type: 'JOIN_ROOM';
      payload: {
        roomId: string;
        roomName?: string;
        user: Omit<RoomParticipant, 'joinedAt' | 'isHost'>;
        pin?: string;
        tvAuthToken?: string;
        firebaseIdToken?: string;
        sessionId?: string;
      };
    }
  | {
      type: 'SYNC_VIDEO_STATE';
      payload: {
        roomId: string;
        action: VideoSyncAction;
        videoState: Partial<AuthoritativeVideoState>;
        updatedBy: string;
      };
    }
  | {
      type: 'SEND_CHAT';
      payload: {
        roomId: string;
        text: string;
        user: Omit<RoomParticipant, 'joinedAt' | 'isHost'>;
      };
    }
  | {
      type: 'PIN_CHAT_MESSAGE';
      payload: {
        roomId: string;
        messageId: string;
      };
    }
  | {
      type: 'UNPIN_CHAT_MESSAGE';
      payload: {
        roomId: string;
      };
    }
  | {
      type: 'TYPING_STATE';
      payload: TypingUserPayload;
    }
  | {
      type: 'SEND_REACTION';
      payload: {
        roomId: string;
        emoji: string;
        user: Omit<RoomParticipant, 'joinedAt' | 'isHost'>;
      };
    }
  | {
      type: 'QUEUE_VOTE';
      payload: {
        roomId: string;
        itemId: string;
        userId: string;
      };
    }
  | {
      type: 'QUEUE_REORDER';
      payload: {
        roomId: string;
        itemId: string;
        direction?: 'up' | 'down';
        targetIndex?: number;
      };
    }
  | {
      type: 'SET_PARTICIPANT_ROLE';
      payload: {
        roomId: string;
        targetUserId: string;
        role: RoomRole;
      };
    }
  | {
      type: 'TRANSFER_HOST';
      payload: {
        roomId: string;
        newHostId: string;
      };
    }
  | {
      type: 'REGISTER_PRESENCE';
      payload: {
        user: Omit<RoomParticipant, 'joinedAt' | 'isHost'>;
        roomId?: string;
        roomName?: string;
        firebaseIdToken?: string;
      };
    }
  | {
      type: 'GAME_START';
      payload: {
        roomId: string;
        gameType: BoardGameType;
        soloLocal?: boolean;
        clockMinutes?: BoardClockMinutes;
      };
    }
  | {
      type: 'GAME_JOIN_SEAT';
      payload: {
        roomId: string;
        side: 'w' | 'b' | 'spectate';
      };
    }
  | {
      type: 'GAME_START_MATCH';
      payload: {
        roomId: string;
      };
    }
  | {
      type: 'GAME_MOVE';
      payload: {
        roomId: string;
        from: BoardCoord;
        to: BoardCoord;
        promotionPiece?: ChessPromotionPiece;
      };
    }
  | {
      type: 'GAME_RESIGN';
      payload: {
        roomId: string;
      };
    }
  | {
      type: 'GAME_RESET';
      payload: {
        roomId: string;
        gameType?: BoardGameType;
        swapColors?: boolean;
        clockMinutes?: BoardClockMinutes;
      };
    }
  | {
      type: 'GAME_CLOSE';
      payload: {
        roomId: string;
      };
    }
  | {
      type: 'PARTY_GAME_START';
      payload: {
        roomId: string;
        gameType: PartyGameType;
      };
    }
  | {
      type: 'PARTY_GAME_ACTION';
      payload: {
        roomId: string;
        action:
          | 'roll_dice'
          | 'move_piece'
          | 'play_card'
          | 'draw_card'
          | 'pass_turn'
          | 'call_uno'
          | 'catch_uno'
          | 'accept_wild4'
          | 'challenge_wild4'
          | 'join_seat'
          | 'start_match'
          | 'rematch';
        pieceId?: number;
        cardId?: string;
        chosenColor?: PartyColor;
        seatIndex?: number;
      };
    }
  | {
      type: 'PARTY_GAME_CLOSE';
      payload: {
        roomId: string;
      };
    }
  | {
      type: 'VOICE_JOIN';
      payload: {
        roomId: string;
      };
    }
  | {
      type: 'VOICE_LEAVE';
      payload: {
        roomId: string;
      };
    }
  | {
      type: 'VOICE_STATE_UPDATE';
      payload: {
        roomId: string;
        isMuted: boolean;
      };
    }
  | {
      type: 'VOICE_SIGNAL';
      payload: VoiceSignalPayload;
    }
  | {
      type: 'PINTURILLO_START';
      payload: { roomId: string };
    }
  | {
      type: 'PINTURILLO_START_MATCH';
      payload: { roomId: string };
    }
  | {
      type: 'PINTURILLO_PICK_WORD';
      payload: { roomId: string; wordId: string };
    }
  | {
      type: 'PINTURILLO_STROKE';
      payload: { roomId: string; stroke: PinturilloStroke };
    }
  | {
      type: 'PINTURILLO_UNDO';
      payload: { roomId: string };
    }
  | {
      type: 'PINTURILLO_CLEAR';
      payload: { roomId: string };
    }
  | {
      type: 'PINTURILLO_GUESS';
      payload: { roomId: string; text: string };
    }
  | {
      type: 'PINTURILLO_REMATCH';
      payload: { roomId: string };
    }
  | {
      type: 'PINTURILLO_CLOSE';
      payload: { roomId: string };
    }
  | {
      type: 'POOL_START';
      payload: { roomId: string; difficulty?: PoolDifficulty };
    }
  | {
      type: 'POOL_START_MATCH';
      payload: { roomId: string };
    }
  | {
      type: 'POOL_JOIN_SEAT';
      payload: { roomId: string; seatIndex: 0 | 1 | 'spectate' };
    }
  | {
      type: 'POOL_CALL_POCKET';
      payload: { roomId: string; pocketId: PoolPocketId };
    }
  | {
      type: 'POOL_PLACE_CUE';
      payload: { roomId: string; x: number; y: number };
    }
  | {
      type: 'POOL_TAKE_SHOT';
      payload: { roomId: string; shot: PoolShotInput };
    }
  | {
      type: 'POOL_SYNC_CHECKSUM';
      payload: { roomId: string; turnNumber: number; checksum: number };
    }
  | {
      type: 'POOL_FORFEIT';
      payload: { roomId: string };
    }
  | {
      type: 'POOL_REMATCH';
      payload: { roomId: string };
    }
  | {
      type: 'POOL_CLOSE';
      payload: { roomId: string };
    }
  | {
      type: 'CHAPAS_START';
      payload: { roomId: string };
    }
  | {
      type: 'CHAPAS_JOIN_SEAT';
      payload: { roomId: string; seatIndex: 0 | 1 | 2 | 3 | 'spectate' };
    }
  | {
      type: 'CHAPAS_UPDATE_TEAM';
      payload: { roomId: string; team: ChapasTeamId; flag: ChapasFlagId };
    }
  | {
      type: 'CHAPAS_TOGGLE_BOTS';
      payload: { roomId: string; botsEnabled: boolean };
    }
  | {
      type: 'CHAPAS_START_MATCH';
      payload: { roomId: string };
    }
  | {
      type: 'CHAPAS_SHOOT';
      payload: { roomId: string; shot: ChapasShotInput };
    }
  | {
      type: 'CHAPAS_FORFEIT';
      payload: { roomId: string };
    }
  | {
      type: 'CHAPAS_REMATCH';
      payload: { roomId: string };
    }
  | {
      type: 'CHAPAS_CLOSE';
      payload: { roomId: string };
    }
  | {
      type: 'HEADSOCCER_START';
      payload: { roomId: string };
    }
  | {
      type: 'HEADSOCCER_JOIN_SEAT';
      payload: { roomId: string; seatIndex: 0 | 1 | 'spectate' };
    }
  | {
      type: 'HEADSOCCER_SELECT_SKIN';
      payload: { roomId: string; skinId: HeadSoccerSkinId };
    }
  | {
      type: 'HEADSOCCER_START_MATCH';
      payload: { roomId: string };
    }
  | {
      type: 'HEADSOCCER_INPUT';
      payload: { roomId: string; side: 0 | 1; input: HeadSoccerInput };
    }
  | {
      type: 'HEADSOCCER_SYNC_STATE';
      payload: { roomId: string; sim: HeadSoccerSimulation };
    }
  | {
      type: 'HEADSOCCER_REMATCH';
      payload: { roomId: string };
    }
  | {
      type: 'HEADSOCCER_CLOSE';
      payload: { roomId: string };
    }
  | {
      type: 'POKER_START';
      payload: { roomId: string; botsEnabled?: boolean };
    }
  | {
      type: 'POKER_JOIN_SEAT';
      payload: { roomId: string; seatIndex?: number | 'spectate' };
    }
  | {
      type: 'POKER_TOGGLE_BOTS';
      payload: { roomId: string; botsEnabled: boolean };
    }
  | {
      type: 'POKER_START_MATCH';
      payload: { roomId: string };
    }
  | {
      type: 'POKER_ACTION';
      payload: { roomId: string; action: PokerActionType; raiseTo?: number };
    }
  | {
      type: 'POKER_REBUY';
      payload: { roomId: string };
    }
  | {
      type: 'POKER_CLOSE';
      payload: { roomId: string };
    }
  | {
      type: 'BLACKJACK_START';
      payload: { roomId: string };
    }
  | {
      type: 'BLACKJACK_JOIN_SEAT';
      payload: { roomId: string; seatIndex?: number | 'spectate' };
    }
  | {
      type: 'BLACKJACK_BET';
      payload: {
        roomId: string;
        op: { kind: 'add'; amount: number } | { kind: 'clear' } | { kind: 'rebet' } | { kind: 'rebuy' };
      };
    }
  | {
      type: 'BLACKJACK_DEAL';
      payload: { roomId: string };
    }
  | {
      type: 'BLACKJACK_ACTION';
      payload: { roomId: string; action: 'hit' | 'stand' | 'double' | 'split' };
    }
  | {
      type: 'BLACKJACK_NEW_ROUND';
      payload: { roomId: string };
    }
  | {
      type: 'BLACKJACK_CLOSE';
      payload: { roomId: string };
    }
  | {
      type: 'GAME_INVITE_RESPOND';
      payload: {
        roomId: string;
        gameType: RoomGameInviteType;
        inviteId?: string;
        response: 'accepted' | 'declined';
      };
    }
  | {
      type: 'GAME_SWITCH';
      payload: {
        roomId: string;
        targetGame: RoomGameInviteType;
      };
    };

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

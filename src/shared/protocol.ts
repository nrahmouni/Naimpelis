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

export type {
  BoardClockMinutes,
  BoardCoord,
  BoardGameState,
  BoardGameType,
  BoardSide,
  ChessPromotionPiece,
  ParchisGameState,
  PartyColor,
  PartyGameState,
  PartyGameType,
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

export interface RoomStatePayload {
  id: string;
  name: string;
  hostId: string;
  creatorId?: string;
  coHostIds?: string[];
  participants: RoomParticipant[];
  videoState: AuthoritativeVideoState;
  messages: RoomChatMessage[];
  pinnedMessage?: RoomChatMessage | null;
  hasPin: boolean;
  hostOnlyControl?: boolean;
  gameState?: BoardGameState | null;
  partyGameState?: PartyGameState | null;
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
        action: 'roll_dice' | 'move_piece' | 'play_card' | 'draw_card' | 'pass_turn' | 'rematch';
        pieceId?: number;
        cardId?: string;
        chosenColor?: PartyColor;
      };
    }
  | {
      type: 'PARTY_GAME_CLOSE';
      payload: {
        roomId: string;
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
    };

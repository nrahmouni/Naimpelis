import type {
  BoardClockMinutes,
  BoardCoord,
  BoardGameType,
  ChessPromotionPiece,
  ChapasFlagId,
  ChapasShotInput,
  ChapasTeamId,
  HeadSoccerInput,
  HeadSoccerSimulation,
  HeadSoccerSkinId,
  PartyColor,
  PartyGameType,
  PinturilloStroke,
  PokerActionType,
  PoolDifficulty,
  PoolPocketId,
  PoolShotInput,
} from './protocolGameTypes';
import type {
  AuthoritativeVideoState,
  RoomGameInviteType,
  RoomParticipant,
  RoomRole,
  TypingUserPayload,
  VideoSyncAction,
  VoiceSignalPayload,
} from './protocolPayloads';

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

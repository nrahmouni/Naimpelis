import { z } from 'zod';

const safeIdSchema = z.string().trim().min(1).max(128);
const roomIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-zA-Z0-9_-]+$/);

export const wsParticipantSchema = z.object({
  id: safeIdSchema,
  name: z.string().trim().min(1).max(40),
  avatar: z.string().trim().min(1).max(16).optional().default('🍿'),
  color: z.string().trim().min(3).max(24).optional().default('#9147FF'),
  isHost: z.boolean().optional(),
  role: z.enum(['host', 'mod', 'viewer']).optional(),
  joinedAt: z.number().optional(),
});

export const wsJoinRoomSchema = z.object({
  roomId: roomIdSchema,
  roomName: z.string().trim().max(64).optional(),
  user: wsParticipantSchema,
  pin: z.string().max(12).optional(),
  tvAuthToken: z.string().max(256).optional(),
  firebaseIdToken: z.string().max(4096).optional(),
  restoredBlueprint: z
    .object({
      roomName: z.string().max(64).optional(),
      hostOnlyControl: z.boolean().optional(),
      pinCode: z.string().max(8).optional(),
      queueItems: z.array(z.any()).max(25).optional(),
    })
    .optional(),
});

export const wsRegisterPresenceSchema = z.object({
  user: wsParticipantSchema,
  roomId: z.string().max(64).optional(),
  roomName: z.string().max(64).optional(),
  mediaTitle: z.string().max(200).optional(),
  firebaseIdToken: z.string().max(4096).optional(),
});

export const wsSendChatSchema = z.object({
  roomId: roomIdSchema,
  text: z.string().trim().min(1).max(600),
  user: wsParticipantSchema.optional(),
  replyTo: z
    .object({
      id: z.string().trim().min(1).max(120),
      senderName: z.string().trim().min(1).max(40),
      text: z.string().trim().min(1).max(200),
    })
    .optional(),
});

export const wsPinChatSchema = z.object({
  roomId: roomIdSchema,
  messageId: z.string().trim().min(1).max(120).optional(),
});

export const wsPollStartSchema = z.object({
  roomId: roomIdSchema,
  question: z.string().trim().min(1).max(140),
  options: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(180),
        subtitle: z.string().max(180).optional(),
        kind: z.enum(['movie', 'tv', 'youtube', 'direct']).optional(),
        poster: z.string().max(600).optional(),
        tmdbId: z.number().optional(),
        youtubeId: z.string().max(64).optional(),
        url: z.string().max(1000).optional(),
        preferLang: z.enum(['ES', 'LAT', 'VOSE', 'EN']).optional(),
      })
    )
    .min(2)
    .max(6),
  durationSec: z.number().min(10).max(120).optional(),
});

export const wsGameMoveSchema = z.object({
  roomId: roomIdSchema,
  from: z.object({
    r: z.number().int().min(0).max(15),
    c: z.number().int().min(0).max(15),
  }),
  to: z.object({
    r: z.number().int().min(0).max(15),
    c: z.number().int().min(0).max(15),
  }),
  promotionPiece: z.enum(['q', 'r', 'b', 'n']).optional(),
});

export const wsPartyGameStartSchema = z.object({
  roomId: roomIdSchema,
  gameType: z.enum(['parchis', 'uno']),
  humanCount: z.number().int().min(1).max(4).optional(),
});

export const wsPartyGameActionSchema = z.object({
  roomId: roomIdSchema,
  action: z.enum([
    'roll_dice',
    'move_piece',
    'play_card',
    'draw_card',
    'pass_turn',
    'call_uno',
    'catch_uno',
    'accept_wild4',
    'challenge_wild4',
    'join_seat',
    'start_match',
    'rematch',
  ]),
  pieceId: z.number().int().min(0).max(3).optional(),
  cardId: z.string().max(64).optional(),
  chosenColor: z.enum(['red', 'blue', 'yellow', 'green']).optional(),
  seatIndex: z.number().int().min(0).max(3).optional(),
});

export const wsTypingStateSchema = z.object({
  roomId: roomIdSchema,
  userId: safeIdSchema.optional(),
  userName: z.string().max(40).optional(),
  isTyping: z.boolean(),
});

export const wsQueueReorderSchema = z.object({
  roomId: roomIdSchema,
  itemId: z.string().trim().min(1).max(120),
  direction: z.enum(['up', 'down']).optional(),
  targetIndex: z.number().int().min(0).max(40).optional(),
});

export const wsVoiceRoomSchema = z.object({
  roomId: roomIdSchema,
});

export const wsVoiceStateSchema = z.object({
  roomId: roomIdSchema,
  isMuted: z.boolean(),
});

export const wsVoiceSignalSchema = z.object({
  roomId: roomIdSchema,
  targetUserId: safeIdSchema,
  signalType: z.enum(['offer', 'answer', 'ice']),
  sdp: z
    .object({
      type: z.string().min(1).max(32),
      sdp: z.string().max(24_000).optional(),
    })
    .optional(),
  candidate: z
    .object({
      candidate: z.string().max(4096),
      sdpMid: z.string().max(64).nullable().optional(),
      sdpMLineIndex: z.number().int().min(0).max(64).nullable().optional(),
      usernameFragment: z.string().max(256).nullable().optional(),
    })
    .optional(),
});

export const wsPinturilloRoomSchema = z.object({
  roomId: roomIdSchema,
});

export const wsPinturilloPickWordSchema = z.object({
  roomId: roomIdSchema,
  wordId: safeIdSchema,
});

export const wsPinturilloStrokeSchema = z.object({
  roomId: roomIdSchema,
  stroke: z.object({
    id: safeIdSchema,
    color: z.string().trim().min(3).max(24),
    size: z.number().min(2).max(28),
    isEraser: z.boolean().optional(),
    points: z
      .array(
        z.object({
          x: z.number().min(0).max(1),
          y: z.number().min(0).max(1),
        })
      )
      .min(1)
      .max(400),
  }),
});

export const wsPinturilloGuessSchema = z.object({
  roomId: roomIdSchema,
  text: z.string().trim().min(1).max(60),
});

export const wsPoolRoomSchema = z.object({
  roomId: roomIdSchema,
});

export const wsPoolStartSchema = z.object({
  roomId: roomIdSchema,
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
});

export const wsPoolJoinSeatSchema = z.object({
  roomId: roomIdSchema,
  seatIndex: z.union([z.literal(0), z.literal(1), z.literal('spectate')]),
});

export const wsPoolCallPocketSchema = z.object({
  roomId: roomIdSchema,
  pocketId: z.enum(['TL', 'TM', 'TR', 'BL', 'BM', 'BR']),
});

export const wsPoolPlaceCueSchema = z.object({
  roomId: roomIdSchema,
  x: z.number().min(0).max(1000),
  y: z.number().min(0).max(500),
});

export const wsPoolTakeShotSchema = z.object({
  roomId: roomIdSchema,
  shot: z.object({
    angle: z.number().min(-Math.PI * 4).max(Math.PI * 4),
    power: z.number().min(0).max(1),
    spinX: z.number().min(-1).max(1),
    spinY: z.number().min(-1).max(1),
    calledPocketId: z.enum(['TL', 'TM', 'TR', 'BL', 'BM', 'BR']).nullable().optional(),
    cueX: z.number().min(0).max(1000).optional(),
    cueY: z.number().min(0).max(500).optional(),
  }),
});

export const wsPoolSyncChecksumSchema = z.object({
  roomId: roomIdSchema,
  turnNumber: z.number().int().min(0).max(10_000),
  checksum: z.number().int().min(0),
});

export const wsGameInviteRespondSchema = z.object({
  roomId: roomIdSchema,
  gameType: z.enum([
    'pool',
    'chapas',
    'headsoccer',
    'penalty',
    'racing3d',
    'gyrohockey',
    'gyrospace',
    'gyrobowling',
    'gyrotennis',
    'gyrolab',
    'pingpong',
    'bomberman',
    'pacman',
    'tetris',
    'hextris',
    'game2048',
    'flappy',
    'hexgl',
    'arkanoid',
    'invaders',
    'tvtrivia',
    'poker',
    'blackjack',
    'parchis',
    'uno',
    'pinturillo',
    'chess',
    'checkers',
    'connect4',
  ]),
  inviteId: z.string().max(128).optional(),
  response: z.enum(['accepted', 'declined']),
});

export const wsGameSwitchSchema = z.object({
  roomId: roomIdSchema,
  targetGame: z.enum([
    'pool',
    'chapas',
    'headsoccer',
    'penalty',
    'racing3d',
    'gyrohockey',
    'gyrospace',
    'gyrobowling',
    'gyrotennis',
    'gyrolab',
    'pingpong',
    'bomberman',
    'pacman',
    'tetris',
    'hextris',
    'game2048',
    'flappy',
    'hexgl',
    'arkanoid',
    'invaders',
    'tvtrivia',
    'poker',
    'blackjack',
    'parchis',
    'uno',
    'pinturillo',
    'chess',
    'checkers',
    'connect4',
  ]),
});

export const wsChapasRoomSchema = z.object({
  roomId: roomIdSchema,
});

export const wsChapasJoinSeatSchema = z.object({
  roomId: roomIdSchema,
  seatIndex: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal('spectate')]),
});

export const wsChapasUpdateTeamSchema = z.object({
  roomId: roomIdSchema,
  team: z.enum(['A', 'B']),
  flag: z.enum(['ar', 'es', 'br', 'fr', 'ma', 'pt', 'it', 'de']),
});

export const wsChapasToggleBotsSchema = z.object({
  roomId: roomIdSchema,
  botsEnabled: z.boolean(),
});

const chapasShotDetailsSchema = z.object({
  capId: z.string().trim().min(2).max(12),
  angle: z.number().min(-Math.PI * 4).max(Math.PI * 4),
  power: z.number().min(0).max(1),
});

export const wsChapasShootSchema = z.union([
  z.object({
    roomId: roomIdSchema,
    shot: chapasShotDetailsSchema,
  }),
  z.object({
    roomId: roomIdSchema,
    capId: z.string().trim().min(2).max(12),
    angle: z.number().min(-Math.PI * 4).max(Math.PI * 4),
    power: z.number().min(0).max(1),
  }),
]);

export const wsHeadSoccerRoomSchema = z.object({
  roomId: roomIdSchema,
});

export const wsHeadSoccerJoinSeatSchema = z.object({
  roomId: roomIdSchema,
  seatIndex: z.union([z.literal(0), z.literal(1), z.literal('spectate')]),
});

export const wsHeadSoccerSelectSkinSchema = z.object({
  roomId: roomIdSchema,
  skinId: z.enum(['striker', 'maestro', 'furia', 'astro', 'titan', 'ninja']),
});

export const wsHeadSoccerInputSchema = z.object({
  roomId: roomIdSchema,
  side: z.union([z.literal(0), z.literal(1)]),
  input: z.object({
    left: z.boolean(),
    right: z.boolean(),
    jump: z.boolean(),
    kick: z.boolean(),
  }),
});

export const wsHeadSoccerSyncStateSchema = z.object({
  roomId: roomIdSchema,
  sim: z.object({
    tick: z.number(),
    phase: z.enum(['playing', 'goal', 'finished']),
    timeLeftSec: z.number(),
    isGoldenGoal: z.boolean(),
    goalPauseTimer: z.number(),
    goalBannerSide: z.union([z.literal(0), z.literal(1), z.null()]),
    winnerSide: z.union([z.literal(0), z.literal(1), z.null()]),
    scores: z.tuple([z.number(), z.number()]),
    players: z.array(z.any()).length(2),
    ball: z.any(),
  }),
});

export const wsPokerStartSchema = z.object({
  roomId: roomIdSchema,
  botsEnabled: z.boolean().optional(),
});

export const wsPokerJoinSeatSchema = z.object({
  roomId: roomIdSchema,
  seatIndex: z.union([z.number().int().min(0).max(5), z.literal('spectate')]).optional(),
});

export const wsPokerToggleBotsSchema = z.object({
  roomId: roomIdSchema,
  botsEnabled: z.boolean(),
});

export const wsPokerActionSchema = z.object({
  roomId: roomIdSchema,
  action: z.enum(['fold', 'check', 'call', 'raise', 'all_in']),
  raiseTo: z.number().min(0).max(1_000_000).optional(),
});

export const wsBlackjackJoinSeatSchema = z.object({
  roomId: roomIdSchema,
  seatIndex: z.union([z.number().int().min(0).max(3), z.literal('spectate')]).optional(),
});

export const wsBlackjackBetSchema = z.object({
  roomId: roomIdSchema,
  op: z.union([
    z.object({ kind: z.literal('add'), amount: z.number().int().min(1).max(100_000) }),
    z.object({ kind: z.literal('clear') }),
    z.object({ kind: z.literal('rebet') }),
    z.object({ kind: z.literal('rebuy') }),
  ]),
});

export const wsBlackjackActionSchema = z.object({
  roomId: roomIdSchema,
  action: z.enum(['hit', 'stand', 'double', 'split']),
});

export const wsCinema3dEnterMoveSchema = z.object({
  roomId: roomIdSchema,
  x: z.number().min(-8).max(8).optional(),
  y: z.number().min(0).max(6).optional(),
  z: z.number().min(-6).max(10).optional(),
  yaw: z.number().min(-Math.PI * 4).max(Math.PI * 4).optional(),
  seatId: z.string().trim().max(24).nullable().optional(),
  hasPopcorn: z.boolean().optional(),
});

export const wsCinema3dActionSchema = z.object({
  roomId: roomIdSchema,
  action: z.enum(['idle', 'eat_popcorn', 'throw_popcorn', 'wave', 'clap', 'cheer', 'say']),
  text: z.string().trim().max(90).optional(),
  hasPopcorn: z.boolean().optional(),
});

export const wsCinema3dInteractSchema = z.object({
  roomId: roomIdSchema,
  targetUserId: safeIdSchema,
  kind: z.enum(['pass_popcorn', 'highfive', 'wave_at']),
});

export const wsGyroJoinSchema = z.object({
  roomId: roomIdSchema,
  deviceName: z.string().trim().max(40).optional(),
  role: z.enum(['controller', 'display']),
  preferredSlot: z.union([z.literal(1), z.literal(2)]).optional(),
  gameId: z.string().trim().max(32).optional(),
});

export const wsGyroInputSchema = z.object({
  roomId: roomIdSchema,
  playerSlot: z.union([z.literal(1), z.literal(2)]).optional(),
  steer: z.number().min(-1).max(1),
  throttle: z.number().min(0).max(1),
  brake: z.number().min(0).max(1),
  pitch: z.number().min(-1).max(1).optional(),
  swing: z.number().min(0).max(3).optional(),
  roll: z.number().min(-1).max(1).optional(),
  gameMode: z.string().trim().max(32).optional(),
  nitro: z.boolean().optional(),
  handbrake: z.boolean().optional(),
  cameraCycle: z.boolean().optional(),
  horn: z.boolean().optional(),
  seq: z.number().int().min(0).max(1_000_000_000),
  ts: z.number().min(0),
});

export const wsRacingTelemetrySchema = z.object({
  roomId: roomIdSchema,
  speedKmh: z.number().min(0).max(600),
  rpmPct: z.number().min(0).max(100),
  gear: z.number().int().min(0).max(8),
  lap: z.number().int().min(1).max(99),
  totalLaps: z.number().int().min(1).max(99),
  position: z.number().int().min(1).max(16),
  totalCars: z.number().int().min(1).max(16),
  nitroPct: z.number().min(0).max(100),
  collisionImpact: z.number().min(0).max(1).optional(),
  offroad: z.boolean().optional(),
  raceState: z.enum(['countdown', 'racing', 'finished']),
  lapTimeMs: z.number().min(0).max(3_600_000).optional(),
  bestLapMs: z.number().min(0).max(3_600_000).optional(),
  targetSlot: z.union([z.literal(1), z.literal(2)]).optional(),
  hapticPulseMs: z.number().int().min(0).max(500).optional(),
  scoreP1: z.number().int().min(0).max(999).optional(),
  scoreP2: z.number().int().min(0).max(999).optional(),
  eventTag: z.string().trim().max(32).optional(),
});

export const wsEnvelopeSchema = z.object({
  type: z.string().trim().min(1).max(48),
  payload: z.record(z.string(), z.any()).optional().default({}),
});

interface RateBucket {
  count: number;
  resetAt: number;
}

const WS_EVENT_LIMITS: Record<string, { max: number; windowMs: number }> = {
  JOIN_ROOM: { max: 10, windowMs: 10_000 },
  SEND_CHAT: { max: 8, windowMs: 5_000 },
  SEND_REACTION: { max: 14, windowMs: 5_000 },
  POLL_START: { max: 3, windowMs: 25_000 },
  GAME_MOVE: { max: 30, windowMs: 5_000 },
  PARTY_GAME_ACTION: { max: 30, windowMs: 5_000 },
  GAME_INVITE_RESPOND: { max: 20, windowMs: 5_000 },
  GAME_SWITCH: { max: 15, windowMs: 5_000 },
  TYPING_STATE: { max: 20, windowMs: 5_000 },
  VOICE_JOIN: { max: 12, windowMs: 10_000 },
  VOICE_LEAVE: { max: 12, windowMs: 10_000 },
  VOICE_STATE_UPDATE: { max: 30, windowMs: 10_000 },
  VOICE_SIGNAL: { max: 120, windowMs: 10_000 },
  PINTURILLO_STROKE: { max: 90, windowMs: 5_000 },
  PINTURILLO_GUESS: { max: 15, windowMs: 5_000 },
  POOL_TAKE_SHOT: { max: 10, windowMs: 5_000 },
  POOL_PLACE_CUE: { max: 30, windowMs: 5_000 },
  POOL_CALL_POCKET: { max: 20, windowMs: 5_000 },
  POOL_SYNC_CHECKSUM: { max: 20, windowMs: 5_000 },
  CHAPAS_SHOOT: { max: 15, windowMs: 5_000 },
  HEADSOCCER_INPUT: { max: 180, windowMs: 5_000 },
  HEADSOCCER_SYNC_STATE: { max: 180, windowMs: 5_000 },
  POKER_ACTION: { max: 25, windowMs: 5_000 },
  BLACKJACK_BET: { max: 40, windowMs: 5_000 },
  BLACKJACK_ACTION: { max: 25, windowMs: 5_000 },
  CINEMA3D_ENTER: { max: 15, windowMs: 10_000 },
  CINEMA3D_MOVE: { max: 160, windowMs: 10_000 },
  CINEMA3D_ACTION: { max: 35, windowMs: 5_000 },
  CINEMA3D_INTERACT: { max: 25, windowMs: 5_000 },
  CINEMA3D_LEAVE: { max: 15, windowMs: 10_000 },
  GYRO_CONTROLLER_JOIN: { max: 20, windowMs: 10_000 },
  GYRO_INPUT_UPDATE: { max: 450, windowMs: 5_000 },
  RACING_TV_TELEMETRY: { max: 200, windowMs: 5_000 },
  __GLOBAL__: { max: 1200, windowMs: 10_000 },
};

export class WsRateLimiter {
  private readonly buckets = new WeakMap<object, Map<string, RateBucket>>();

  allow(clientKey: object, eventType: string): boolean {
    let clientMap = this.buckets.get(clientKey);
    if (!clientMap) {
      clientMap = new Map();
      this.buckets.set(clientKey, clientMap);
    }

    const now = Date.now();
    const checkBucket = (key: string, max: number, windowMs: number): boolean => {
      const existing = clientMap!.get(key);
      if (!existing || now > existing.resetAt) {
        clientMap!.set(key, { count: 1, resetAt: now + windowMs });
        return true;
      }
      if (existing.count >= max) {
        return false;
      }
      existing.count += 1;
      return true;
    };

    const globalLimit = WS_EVENT_LIMITS.__GLOBAL__;
    if (!checkBucket('__GLOBAL__', globalLimit.max, globalLimit.windowMs)) {
      return false;
    }

    const specific = WS_EVENT_LIMITS[eventType];
    if (specific && !checkBucket(eventType, specific.max, specific.windowMs)) {
      return false;
    }

    return true;
  }
}

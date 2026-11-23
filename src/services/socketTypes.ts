import {
  BlackjackGameState,
  BoardGameState,
  CatalogMovie,
  ChapasShotInput,
  ChatMessage,
  FutbolChapasState,
  HeadSoccerInput,
  HeadSoccerOnlineState,
  HeadSoccerSimulation,
  OnlineAppUser,
  Participant,
  PartyGameState,
  PinturilloGameState,
  PinturilloStroke,
  PokerGameState,
  PollProposalItem,
  Pool8BallState,
  PoolBallState,
  PoolShotInput,
  RestoredRoomBlueprint,
  RoomPollState,
  RoomQueueItem,
  TvRemoteCommandType,
  VideoState,
} from '../types';
import type {
  RoomGameInviteType,
  RoomMatchResponsesState,
  VoicePeerState,
} from '../shared/protocol';

export interface SocketPayload {
  id?: string;
  senderId?: string;
  senderName?: string;
  senderAvatar?: string;
  senderColor?: string;
  text?: string;
  timestamp?: number;
  emoji?: string;
  isSystem?: boolean;
  name?: string;
  creatorId?: string;
  hostId?: string;
  hostName?: string;
  reason?: string;
  hostOnlyControl?: boolean;
  hasPin?: boolean;
  activePoll?: RoomPollState | null;
  poll?: RoomPollState | null;
  gameState?: BoardGameState | null;
  partyGameState?: PartyGameState | null;
  pinturilloState?: PinturilloGameState | null;
  stroke?: PinturilloStroke;
  poolGameState?: Pool8BallState | null;
  chapasState?: FutbolChapasState | null;
  headSoccerState?: HeadSoccerOnlineState | null;
  pokerGameState?: PokerGameState | null;
  blackjackState?: BlackjackGameState | null;
  side?: 0 | 1;
  input?: HeadSoccerInput;
  sim?: HeadSoccerSimulation;
  seq?: number;
  preShotState?: FutbolChapasState | null;
  matchResponses?: RoomMatchResponsesState | null;
  authoritativeState?: Pool8BallState | FutbolChapasState | null;
  shot?: (PoolShotInput | ChapasShotInput) & {
    shooterUserId: string;
    turnNumber: number;
    cueStartX?: number;
    cueStartY?: number;
  };
  preShotBalls?: PoolBallState[];
  checksum?: number;
  pinnedMessage?: ChatMessage | null;
  participants?: Participant[];
  messages?: ChatMessage[];
  message?: ChatMessage;
  queue?: RoomQueueItem[];
  videoState?: VideoState;
  roomId?: string;
  roomName?: string;
  invalidAttempt?: boolean;
  success?: boolean;
  error?: string;
  users?: OnlineAppUser[];
  fromUserId?: string;
  fromUserName?: string;
  fromUserAvatar?: string;
  fromUserColor?: string;
  fromFriendCode?: string;
  inviteAuthToken?: string;
  activeMediaTitle?: string;
  targetName?: string;
  deliveredLive?: boolean;
  justFinished?: boolean;
  winnerItem?: PollProposalItem;
  image?: string;
  url?: string;
  title?: string;
  isLoading?: boolean;
  detectedStreamUrl?: string | null;
  userId?: string;
  userName?: string;
  isTyping?: boolean;
  command?: TvRemoteCommandType;
  commandId?: string;
  movie?: CatalogMovie;
  voicePeers?: VoicePeerState[];
  peers?: VoicePeerState[];
  targetUserId?: string;
  signalType?: 'offer' | 'answer' | 'ice';
  sdp?: { type: string; sdp?: string };
  candidate?: {
    candidate: string;
    sdpMid?: string | null;
    sdpMLineIndex?: number | null;
    usernameFragment?: string | null;
  };
  targetGame?: RoomGameInviteType;
  switchedByUserId?: string;
  switchedByName?: string;
  seatedUserIds?: string[];
  roomState?: {
    gameState?: BoardGameState | null;
    partyGameState?: PartyGameState | null;
    pinturilloState?: PinturilloGameState | null;
    poolGameState?: Pool8BallState | null;
    chapasState?: FutbolChapasState | null;
    headSoccerState?: HeadSoccerOnlineState | null;
    pokerGameState?: PokerGameState | null;
    blackjackState?: BlackjackGameState | null;
    matchResponses?: RoomMatchResponsesState | null;
  };
  controllers?: Array<{ userId: string; deviceName: string; slot?: 1 | 2 }>;
  displays?: number;
  hasController?: boolean;
  playerSlot?: 1 | 2;
  targetSlot?: 1 | 2;
  steer?: number;
  pitch?: number;
  roll?: number;
  swing?: number;
  throttle?: number;
  brake?: number;
  nitro?: boolean;
  handbrake?: boolean;
  cameraCycle?: boolean;
  horn?: boolean;
  ts?: number;
  speedKmh?: number;
  rpmPct?: number;
  gear?: number;
  lap?: number;
  totalLaps?: number;
  position?: number;
  totalCars?: number;
  nitroPct?: number;
  collisionImpact?: number;
  offroad?: boolean;
  raceState?: 'countdown' | 'racing' | 'finished';
  lapTimeMs?: number;
  bestLapMs?: number;
  hapticPulseMs?: number;
  eventTag?: string;
  scoreP1?: number;
  scoreP2?: number;
  [key: string]: unknown;
}

export interface SocketEvent {
  type: string;
  payload: SocketPayload;
}

export interface ConnectRoomOptions {
  pin?: string;
  tvAuthToken?: string;
  restoredBlueprint?: RestoredRoomBlueprint;
}

export type Listener = (event: SocketEvent) => void;

export const NON_QUEUEABLE_TYPES = new Set([
  'PING',
  'TYPING_STATE',
  'JOIN_ROOM',
  'REGISTER_PRESENCE',
  'CLOUD_BROWSER_INPUT',
  'VOICE_JOIN',
  'VOICE_LEAVE',
  'VOICE_STATE_UPDATE',
  'VOICE_SIGNAL',
  'POOL_SYNC_CHECKSUM',
  'GYRO_CONTROLLER_JOIN',
  'GYRO_INPUT_UPDATE',
  'RACING_TV_TELEMETRY',
]);

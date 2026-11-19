import type {
  AppLanguage,
  BlackjackGameState,
  BoardClockMinutes,
  BoardCoord,
  BoardGameState,
  BoardGameType,
  ChapasFlagId,
  ChapasShotInput,
  ChapasTeamId,
  ChessPromotionPiece,
  FutbolChapasState,
  HeadSoccerInput,
  HeadSoccerOnlineState,
  HeadSoccerSimulation,
  HeadSoccerSkinId,
  Participant,
  PinturilloGameState,
  PinturilloStroke,
  PokerActionType,
  PokerGameState,
  Pool8BallState,
  PoolDifficulty,
  PoolPocketId,
  PoolShotInput,
} from '../../types';
import type { RoomMatchResponsesState } from '../../shared/protocol';
import type { PartyColor, PartyGameState, PartyGameType } from '../../shared/partyGames';
import type { GameVoiceChatState } from '../../hooks/useGameVoiceChat';
import type { PartyOnlineAction } from '../PartyGamesStage';
import type { UnifiedGameId } from './GameLogos';

export interface GamesHubSectionProps {
  lang: AppLanguage;
  roomId?: string;
  currentUser: Participant;
  participants: Participant[];
  roomBoardGame: BoardGameState | null;
  roomPartyGame: PartyGameState | null;
  roomPinturilloGame?: PinturilloGameState | null;
  roomPoolGame?: Pool8BallState | null;
  roomChapasGame?: FutbolChapasState | null;
  roomHeadSoccerGame?: HeadSoccerOnlineState | null;
  headSoccerSyncSnapshot?: { seq: number; sim: HeadSoccerSimulation } | null;
  headSoccerPeerInput?: { side: 0 | 1; input: HeadSoccerInput; seq: number } | null;
  roomPokerGame?: PokerGameState | null;
  roomBlackjackGame?: BlackjackGameState | null;
  matchResponses?: RoomMatchResponsesState | null;
  gameMoveError?: string | null;
  isHost?: boolean;
  voiceChat?: GameVoiceChatState;
  requestedGameOpen?: { gameType: UnifiedGameId; seq: number } | null;
  onSelectedGameChange?: (game: UnifiedGameId | null) => void;
  onSwitchRoomGame?: (game: UnifiedGameId) => void;
  onStartRoomBoardGame?: (
    gt: BoardGameType,
    soloLocal?: boolean,
    clockMinutes?: BoardClockMinutes
  ) => void;
  onJoinBoardSeat?: (side: 'w' | 'b' | 'spectate') => void;
  onStartBoardMatch?: () => void;
  onMoveBoardGame?: (from: BoardCoord, to: BoardCoord, promo?: ChessPromotionPiece) => void;
  onResignBoardGame?: () => void;
  onResetBoardGame?: (opts?: {
    gameType?: BoardGameType;
    swapColors?: boolean;
    clockMinutes?: BoardClockMinutes;
  }) => void;
  onCloseBoardGame?: () => void;
  onStartRoomPartyGame?: (gt: PartyGameType) => void;
  onRoomPartyAction?: (
    action: PartyOnlineAction,
    opts?: { pieceId?: number; cardId?: string; chosenColor?: PartyColor; seatIndex?: number }
  ) => void;
  onCloseRoomPartyGame?: () => void;
  onStartRoomPinturillo?: () => void;
  onStartPinturilloMatch?: () => void;
  onPinturilloPickWord?: (wordId: string) => void;
  onPinturilloStroke?: (stroke: PinturilloStroke) => void;
  onPinturilloUndo?: () => void;
  onPinturilloClear?: () => void;
  onPinturilloGuess?: (text: string) => void;
  onPinturilloRematch?: () => void;
  onCloseRoomPinturillo?: () => void;
  onStartRoomPool?: (difficulty?: PoolDifficulty) => void;
  onStartPoolMatch?: () => void;
  onPoolJoinSeat?: (seatIndex: 0 | 1 | 'spectate') => void;
  onPoolCallPocket?: (pocketId: PoolPocketId) => void;
  onPoolPlaceCue?: (x: number, y: number) => void;
  onPoolTakeShot?: (shot: PoolShotInput) => void;
  onPoolSyncChecksum?: (turnNumber: number, checksum: number) => void;
  onPoolForfeit?: () => void;
  onPoolRematch?: () => void;
  onCloseRoomPool?: () => void;
  onStartRoomChapas?: (opts?: { botsEnabled?: boolean }) => void;
  onChapasJoinSeat?: (seatIndex: 0 | 1 | 2 | 3 | 'spectate') => void;
  onChapasUpdateTeam?: (team: ChapasTeamId, flag: ChapasFlagId) => void;
  onChapasToggleBots?: (botsEnabled: boolean) => void;
  onChapasStartMatch?: () => void;
  onChapasShoot?: (shot: ChapasShotInput) => void;
  onChapasForfeit?: () => void;
  onChapasRematch?: () => void;
  onCloseRoomChapas?: () => void;
  onStartRoomHeadSoccer?: () => void;
  onHeadSoccerJoinSeat?: (seatIndex: 0 | 1 | 'spectate') => void;
  onHeadSoccerSelectSkin?: (skinId: HeadSoccerSkinId) => void;
  onHeadSoccerStartMatch?: () => void;
  onHeadSoccerInput?: (side: 0 | 1, input: HeadSoccerInput) => void;
  onHeadSoccerSyncState?: (sim: HeadSoccerSimulation) => void;
  onHeadSoccerRematch?: () => void;
  onCloseRoomHeadSoccer?: () => void;
  onStartRoomPoker?: (botsEnabled?: boolean) => void;
  onPokerJoinSeat?: (seatIndex?: number | 'spectate') => void;
  onPokerToggleBots?: (botsEnabled: boolean) => void;
  onPokerStartMatch?: () => void;
  onPokerAction?: (action: PokerActionType, raiseTo?: number) => void;
  onPokerRebuy?: () => void;
  onCloseRoomPoker?: () => void;
  onStartRoomBlackjack?: () => void;
  onBlackjackJoinSeat?: (seatIndex?: number | 'spectate') => void;
  onBlackjackBet?: (
    op: { kind: 'add'; amount: number } | { kind: 'clear' } | { kind: 'rebet' } | { kind: 'rebuy' }
  ) => void;
  onBlackjackDeal?: () => void;
  onBlackjackAction?: (action: 'hit' | 'stand' | 'double' | 'split') => void;
  onBlackjackNewRound?: () => void;
  onCloseRoomBlackjack?: () => void;
}

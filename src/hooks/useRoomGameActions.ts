import { useMemo } from 'react';
import { socketService } from '../services/socket';
import type {
  BoardClockMinutes,
  BoardCoord,
  BoardGameType,
  BoardSide,
  ChapasFlagId,
  ChapasShotInput,
  ChapasTeamId,
  ChessPromotionPiece,
  HeadSoccerInput,
  HeadSoccerSimulation,
  HeadSoccerSkinId,
  PinturilloStroke,
  PokerActionType,
  PoolDifficulty,
  PoolPocketId,
  PoolShotInput,
} from '../types';
import type { UnifiedGameId } from '../components/games/GameLogos';
import type { PartyGameType } from '../shared/partyGames';
import type { PartyOnlineAction } from '../components/PartyGamesStage';

export function useRoomGameActions() {
  return useMemo(
    () => ({
      onSwitchRoomGame: (targetGame: UnifiedGameId) => socketService.switchRoomGame(targetGame),
      onStartRoomBoardGame: (gt: BoardGameType, solo?: boolean, clockMin?: BoardClockMinutes) =>
        socketService.startBoardGame(gt, solo, clockMin),
      onJoinBoardSeat: (side: BoardSide | 'spectate') => socketService.joinGameSeat(side),
      onStartBoardMatch: () => socketService.startBoardMatch(),
      onMoveBoardGame: (from: BoardCoord, to: BoardCoord, promo?: ChessPromotionPiece) =>
        socketService.sendGameMove(from, to, promo),
      onResignBoardGame: () => socketService.resignBoardGame(),
      onResetBoardGame: (opts?: { gameType?: BoardGameType; waitForHost?: boolean }) =>
        socketService.resetBoardGame(opts),
      onCloseBoardGame: () => socketService.closeBoardGame(),
      onStartRoomPartyGame: (gt: PartyGameType) => socketService.startPartyGame(gt),
      onRoomPartyAction: (act: PartyOnlineAction, opts?: any) =>
        socketService.sendPartyGameAction(act, opts),
      onCloseRoomPartyGame: () => socketService.closePartyGame(),
      onStartRoomPinturillo: () => socketService.startPinturillo(),
      onStartPinturilloMatch: () => socketService.startPinturilloMatch(),
      onPinturilloPickWord: (wordId: string) => socketService.pickPinturilloWord(wordId),
      onPinturilloStroke: (stroke: PinturilloStroke) => socketService.sendPinturilloStroke(stroke),
      onPinturilloUndo: () => socketService.undoPinturilloStroke(),
      onPinturilloClear: () => socketService.clearPinturilloCanvas(),
      onPinturilloGuess: (text: string) => socketService.sendPinturilloGuess(text),
      onPinturilloRematch: () => socketService.rematchPinturillo(),
      onCloseRoomPinturillo: () => socketService.closePinturillo(),
      onStartRoomPool: (difficulty?: PoolDifficulty) => socketService.startPoolGame(difficulty),
      onStartPoolMatch: () => socketService.startPoolMatch(),
      onPoolJoinSeat: (seat: 0 | 1 | 'spectate') => socketService.joinPoolSeat(seat),
      onPoolCallPocket: (pocketId: PoolPocketId) => socketService.callPoolPocket(pocketId),
      onPoolPlaceCue: (x: number, y: number) => socketService.placePoolCueBall(x, y),
      onPoolTakeShot: (shot: PoolShotInput) => socketService.takePoolShot(shot),
      onPoolSyncChecksum: (turnNumber: number, checksum: number) =>
        socketService.syncPoolChecksum(turnNumber, checksum),
      onPoolForfeit: () => socketService.forfeitPoolGame(),
      onPoolRematch: () => socketService.rematchPoolGame(),
      onCloseRoomPool: () => socketService.closePoolGame(),
      onStartRoomChapas: () => socketService.startChapasGame(),
      onChapasJoinSeat: (seat: 0 | 1 | 2 | 3 | 'spectate') => socketService.joinChapasSeat(seat),
      onChapasUpdateTeam: (team: ChapasTeamId, flag: ChapasFlagId) =>
        socketService.updateChapasTeam(team, flag),
      onChapasToggleBots: (botsEnabled: boolean) => socketService.toggleChapasBots(botsEnabled),
      onChapasStartMatch: () => socketService.startChapasMatch(),
      onChapasShoot: (shot: ChapasShotInput) => socketService.shootChapasCap(shot),
      onChapasForfeit: () => socketService.forfeitChapasGame(),
      onChapasRematch: () => socketService.rematchChapasGame(),
      onCloseRoomChapas: () => socketService.closeChapasGame(),
      onStartRoomHeadSoccer: () => socketService.startHeadSoccerGame(),
      onHeadSoccerJoinSeat: (seat: 0 | 1 | 'spectate') => socketService.joinHeadSoccerSeat(seat),
      onHeadSoccerSelectSkin: (skinId: HeadSoccerSkinId) =>
        socketService.selectHeadSoccerSkin(skinId),
      onHeadSoccerStartMatch: () => socketService.startHeadSoccerMatch(),
      onHeadSoccerInput: (side: 0 | 1, input: HeadSoccerInput) =>
        socketService.sendHeadSoccerInput(side, input),
      onHeadSoccerSyncState: (sim: HeadSoccerSimulation) =>
        socketService.sendHeadSoccerSyncState(sim),
      onHeadSoccerRematch: () => socketService.rematchHeadSoccerGame(),
      onCloseRoomHeadSoccer: () => socketService.closeHeadSoccerGame(),
      onStartRoomPoker: (botsEnabled?: boolean) => socketService.startPokerGame(botsEnabled),
      onPokerJoinSeat: (seatIndex?: number | 'spectate') =>
        socketService.joinPokerSeat(seatIndex ?? 0),
      onPokerToggleBots: (botsEnabled: boolean) => socketService.togglePokerBots(botsEnabled),
      onPokerStartMatch: () => socketService.startPokerMatch(),
      onPokerAction: (action: PokerActionType, raiseTo?: number) =>
        socketService.sendPokerAction(action, raiseTo),
      onPokerRebuy: () => socketService.rebuyPokerChips(),
      onCloseRoomPoker: () => socketService.closePokerGame(),
      onStartRoomBlackjack: () => socketService.startBlackjackGame(),
      onBlackjackJoinSeat: (seatIndex?: number | 'spectate') =>
        socketService.joinBlackjackSeat(seatIndex ?? 0),
      onBlackjackBet: (
        op: { kind: 'add'; amount: number } | { kind: 'clear' } | { kind: 'rebet' } | { kind: 'rebuy' }
      ) => socketService.placeBlackjackBet(op),
      onBlackjackDeal: () => socketService.dealBlackjack(),
      onBlackjackAction: (action: 'hit' | 'stand' | 'double' | 'split') =>
        socketService.sendBlackjackAction(action),
      onBlackjackNewRound: () => socketService.newBlackjackRound(),
      onCloseRoomBlackjack: () => socketService.closeBlackjackGame(),
    }),
    []
  );
}

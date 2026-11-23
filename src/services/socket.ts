import {
  BoardClockMinutes,
  BoardCoord,
  BoardGameType,
  ChapasFlagId,
  ChapasShotInput,
  ChapasTeamId,
  ChessPromotionPiece,
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
} from '../types';
import type {
  GyroInputPayload,
  RacingTelemetryPayload,
  RoomGameInviteType,
} from '../shared/protocol';
import { SocketTransport } from './socketTransport';

export type { SocketPayload, SocketEvent, ConnectRoomOptions } from './socketTypes';

class SocketService extends SocketTransport {
  startBoardGame(
    gameType: BoardGameType,
    soloLocal = false,
    clockMinutes: BoardClockMinutes = 0
  ) {
    if (!this.roomId) return;
    this.send('GAME_START', {
      roomId: this.roomId,
      gameType,
      soloLocal,
      clockMinutes,
    });
  }

  joinGameSeat(side: 'w' | 'b' | 'spectate') {
    if (!this.roomId) return;
    this.send('GAME_JOIN_SEAT', {
      roomId: this.roomId,
      side,
    });
  }

  startBoardMatch() {
    if (!this.roomId) return;
    this.send('GAME_START_MATCH', {
      roomId: this.roomId,
    });
  }

  sendGameMove(from: BoardCoord, to: BoardCoord, promotionPiece?: ChessPromotionPiece) {
    if (!this.roomId) return;
    this.send('GAME_MOVE', {
      roomId: this.roomId,
      from,
      to,
      promotionPiece,
    });
  }

  resignBoardGame() {
    if (!this.roomId) return;
    this.send('GAME_RESIGN', {
      roomId: this.roomId,
    });
  }

  resetBoardGame(opts?: {
    gameType?: BoardGameType;
    swapColors?: boolean;
    clockMinutes?: BoardClockMinutes;
  }) {
    if (!this.roomId) return;
    this.send('GAME_RESET', {
      roomId: this.roomId,
      gameType: opts?.gameType,
      swapColors: opts?.swapColors,
      clockMinutes: opts?.clockMinutes,
    });
  }

  closeBoardGame() {
    if (!this.roomId) return;
    this.send('GAME_CLOSE', {
      roomId: this.roomId,
    });
  }

  startPartyGame(gameType: PartyGameType) {
    if (!this.roomId) return;
    this.send('PARTY_GAME_START', {
      roomId: this.roomId,
      gameType,
    });
  }

  sendPartyGameAction(
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
      | 'rematch',
    opts?: { pieceId?: number; cardId?: string; chosenColor?: PartyColor; seatIndex?: number }
  ) {
    if (!this.roomId) return;
    this.send('PARTY_GAME_ACTION', {
      roomId: this.roomId,
      action,
      pieceId: opts?.pieceId,
      cardId: opts?.cardId,
      chosenColor: opts?.chosenColor,
      seatIndex: opts?.seatIndex,
    });
  }

  closePartyGame() {
    if (!this.roomId) return;
    this.send('PARTY_GAME_CLOSE', {
      roomId: this.roomId,
    });
  }

  startPinturillo() {
    if (!this.roomId) return;
    this.send('PINTURILLO_START', { roomId: this.roomId });
  }

  pickPinturilloWord(wordId: string) {
    if (!this.roomId) return;
    this.send('PINTURILLO_PICK_WORD', { roomId: this.roomId, wordId });
  }

  sendPinturilloStroke(stroke: PinturilloStroke) {
    if (!this.roomId) return;
    this.send('PINTURILLO_STROKE', { roomId: this.roomId, stroke });
  }

  undoPinturilloStroke() {
    if (!this.roomId) return;
    this.send('PINTURILLO_UNDO', { roomId: this.roomId });
  }

  clearPinturilloCanvas() {
    if (!this.roomId) return;
    this.send('PINTURILLO_CLEAR', { roomId: this.roomId });
  }

  sendPinturilloGuess(text: string) {
    if (!this.roomId) return;
    this.send('PINTURILLO_GUESS', { roomId: this.roomId, text });
  }

  rematchPinturillo() {
    if (!this.roomId) return;
    this.send('PINTURILLO_REMATCH', { roomId: this.roomId });
  }

  closePinturillo() {
    if (!this.roomId) return;
    this.send('PINTURILLO_CLOSE', { roomId: this.roomId });
  }

  startPoolGame(difficulty?: PoolDifficulty) {
    if (!this.roomId) return;
    this.send('POOL_START', { roomId: this.roomId, difficulty });
  }

  joinPoolSeat(seatIndex: 0 | 1 | 'spectate') {
    if (!this.roomId) return;
    this.send('POOL_JOIN_SEAT', { roomId: this.roomId, seatIndex });
  }

  callPoolPocket(pocketId: PoolPocketId) {
    if (!this.roomId) return;
    this.send('POOL_CALL_POCKET', { roomId: this.roomId, pocketId });
  }

  placePoolCueBall(x: number, y: number) {
    if (!this.roomId) return;
    this.send('POOL_PLACE_CUE', { roomId: this.roomId, x, y });
  }

  takePoolShot(shot: PoolShotInput) {
    if (!this.roomId) return;
    this.send('POOL_TAKE_SHOT', { roomId: this.roomId, shot });
  }

  syncPoolChecksum(turnNumber: number, checksum: number) {
    if (!this.roomId) return;
    this.sendRaw('POOL_SYNC_CHECKSUM', { roomId: this.roomId, turnNumber, checksum });
  }

  forfeitPoolGame() {
    if (!this.roomId) return;
    this.send('POOL_FORFEIT', { roomId: this.roomId });
  }

  rematchPoolGame() {
    if (!this.roomId) return;
    this.send('POOL_REMATCH', { roomId: this.roomId });
  }

  closePoolGame() {
    if (!this.roomId) return;
    this.send('POOL_CLOSE', { roomId: this.roomId });
  }

  startPoolMatch() {
    if (!this.roomId) return;
    this.send('POOL_START_MATCH', { roomId: this.roomId });
  }

  startPinturilloMatch() {
    if (!this.roomId) return;
    this.send('PINTURILLO_START_MATCH', { roomId: this.roomId });
  }

  respondToGameInvite(
    gameType: RoomGameInviteType,
    response: 'accepted' | 'declined',
    inviteId?: string
  ) {
    if (!this.roomId) return;
    this.send('GAME_INVITE_RESPOND', {
      roomId: this.roomId,
      gameType,
      inviteId,
      response,
    });
  }

  startChapasGame(opts?: { botsEnabled?: boolean }) {
    if (!this.roomId) return;
    this.send('CHAPAS_START', { roomId: this.roomId, ...opts });
  }

  joinChapasSeat(seatIndex: 0 | 1 | 2 | 3 | 'spectate') {
    if (!this.roomId) return;
    this.send('CHAPAS_JOIN_SEAT', { roomId: this.roomId, seatIndex });
  }

  updateChapasTeam(team: ChapasTeamId, flag: ChapasFlagId) {
    if (!this.roomId) return;
    this.send('CHAPAS_UPDATE_TEAM', { roomId: this.roomId, team, flag });
  }

  toggleChapasBots(botsEnabled: boolean) {
    if (!this.roomId) return;
    this.send('CHAPAS_TOGGLE_BOTS', { roomId: this.roomId, botsEnabled });
  }

  startChapasMatch() {
    if (!this.roomId) return;
    this.send('CHAPAS_START_MATCH', { roomId: this.roomId });
  }

  shootChapasCap(shot: ChapasShotInput) {
    if (!this.roomId) return;
    this.send('CHAPAS_SHOOT', { roomId: this.roomId, shot });
  }

  forfeitChapasGame() {
    if (!this.roomId) return;
    this.send('CHAPAS_FORFEIT', { roomId: this.roomId });
  }

  rematchChapasGame() {
    if (!this.roomId) return;
    this.send('CHAPAS_REMATCH', { roomId: this.roomId });
  }

  closeChapasGame() {
    if (!this.roomId) return;
    this.send('CHAPAS_CLOSE', { roomId: this.roomId });
  }

  startHeadSoccerGame() {
    if (!this.roomId) return;
    this.send('HEADSOCCER_START', { roomId: this.roomId });
  }

  joinHeadSoccerSeat(seatIndex: 0 | 1 | 'spectate') {
    if (!this.roomId) return;
    this.send('HEADSOCCER_JOIN_SEAT', { roomId: this.roomId, seatIndex });
  }

  selectHeadSoccerSkin(skinId: HeadSoccerSkinId) {
    if (!this.roomId) return;
    this.send('HEADSOCCER_SELECT_SKIN', { roomId: this.roomId, skinId });
  }

  startHeadSoccerMatch() {
    if (!this.roomId) return;
    this.send('HEADSOCCER_START_MATCH', { roomId: this.roomId });
  }

  sendHeadSoccerInput(side: 0 | 1, input: HeadSoccerInput) {
    if (!this.roomId) return;
    this.sendRaw('HEADSOCCER_INPUT', { roomId: this.roomId, side, input });
  }

  sendHeadSoccerSyncState(sim: HeadSoccerSimulation) {
    if (!this.roomId) return;
    this.sendRaw('HEADSOCCER_SYNC_STATE', { roomId: this.roomId, sim });
  }

  rematchHeadSoccerGame() {
    if (!this.roomId) return;
    this.send('HEADSOCCER_REMATCH', { roomId: this.roomId });
  }

  closeHeadSoccerGame() {
    if (!this.roomId) return;
    this.send('HEADSOCCER_CLOSE', { roomId: this.roomId });
  }

  startPokerGame(botsEnabled = true) {
    if (!this.roomId) return;
    this.send('POKER_START', { roomId: this.roomId, botsEnabled });
  }

  joinPokerSeat(seatIndex?: number | 'spectate') {
    if (!this.roomId) return;
    this.send('POKER_JOIN_SEAT', { roomId: this.roomId, seatIndex });
  }

  togglePokerBots(botsEnabled: boolean) {
    if (!this.roomId) return;
    this.send('POKER_TOGGLE_BOTS', { roomId: this.roomId, botsEnabled });
  }

  startPokerMatch() {
    if (!this.roomId) return;
    this.send('POKER_START_MATCH', { roomId: this.roomId });
  }

  sendPokerAction(action: PokerActionType, raiseTo?: number) {
    if (!this.roomId) return;
    this.send('POKER_ACTION', { roomId: this.roomId, action, raiseTo });
  }

  rebuyPokerChips() {
    if (!this.roomId) return;
    this.send('POKER_REBUY', { roomId: this.roomId });
  }

  closePokerGame() {
    if (!this.roomId) return;
    this.send('POKER_CLOSE', { roomId: this.roomId });
  }

  startBlackjackGame() {
    if (!this.roomId) return;
    this.send('BLACKJACK_START', { roomId: this.roomId });
  }

  joinBlackjackSeat(seatIndex?: number | 'spectate') {
    if (!this.roomId) return;
    this.send('BLACKJACK_JOIN_SEAT', { roomId: this.roomId, seatIndex });
  }

  placeBlackjackBet(op: { kind: 'add'; amount: number } | { kind: 'clear' } | { kind: 'rebet' } | { kind: 'rebuy' }) {
    if (!this.roomId) return;
    this.send('BLACKJACK_BET', { roomId: this.roomId, op });
  }

  dealBlackjack() {
    if (!this.roomId) return;
    this.send('BLACKJACK_DEAL', { roomId: this.roomId });
  }

  sendBlackjackAction(action: 'hit' | 'stand' | 'double' | 'split') {
    if (!this.roomId) return;
    this.send('BLACKJACK_ACTION', { roomId: this.roomId, action });
  }

  newBlackjackRound() {
    if (!this.roomId) return;
    this.send('BLACKJACK_NEW_ROUND', { roomId: this.roomId });
  }

  closeBlackjackGame() {
    if (!this.roomId) return;
    this.send('BLACKJACK_CLOSE', { roomId: this.roomId });
  }

  switchRoomGame(targetGame: RoomGameInviteType) {
    if (!this.roomId) return;
    this.send('GAME_SWITCH', { roomId: this.roomId, targetGame });
  }

  getActiveRoomId(): string {
    return this.roomId;
  }

  joinGyroChannel(
    role: 'controller' | 'display',
    deviceName?: string,
    targetRoomId?: string,
    opts?: { preferredSlot?: 1 | 2; gameId?: string }
  ) {
    const rid = (targetRoomId || this.roomId || '').trim().toLowerCase();
    if (!rid) return;
    this.sendRaw('GYRO_CONTROLLER_JOIN', {
      roomId: rid,
      role,
      deviceName,
      preferredSlot: opts?.preferredSlot,
      gameId: opts?.gameId,
    });
  }

  sendGyroInput(input: Omit<GyroInputPayload, 'roomId'> & { roomId?: string }, targetRoomId?: string) {
    const rid = (targetRoomId || this.roomId || '').trim().toLowerCase();
    if (!rid) return;
    this.sendRaw('GYRO_INPUT_UPDATE', {
      ...input,
      roomId: rid,
    });
  }

  sendRacingTelemetry(telemetry: Omit<RacingTelemetryPayload, 'roomId'> & { roomId?: string }, targetRoomId?: string) {
    const rid = (targetRoomId || this.roomId || '').trim().toLowerCase();
    if (!rid) return;
    this.sendRaw('RACING_TV_TELEMETRY', {
      ...telemetry,
      roomId: rid,
    });
  }
}

export const socketService = new SocketService();

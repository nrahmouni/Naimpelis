/**
 * NAIM CINE — Server-Authoritative Multiplayer Board Game Engine
 * Barrel entry point re-exporting Checkers, Chess, and Connect 4 state machines.
 */
export {
  BOARD_TURN_DECISION_MS,
  getPieceSide,
  createInitialCheckersBoard,
  createInitialChessBoard,
  createInitialConnect4Board,
  createInitialBoardGameState,
  joinGameSeat,
  resignBoardGame,
  resetBoardGame,
  startBoardMatch,
  type BoardGameType,
  type BoardSide,
  type ChessPromotionPiece,
  type BoardClockMinutes,
  type BoardCoord,
  type LegalBoardMove,
  type BoardPlayerSeat,
  type BoardGameState,
  type BoardParticipantInput,
} from './boardGames/types.ts';

export {
  getConnect4DropRow,
  findConnect4WinningLine,
} from './boardGames/checkersAndConnect4.ts';

export {
  isChessKingInCheck,
  getLegalMovesForSquare,
  getAllLegalMovesForSide,
  applyBoardMove,
  chooseAutoBoardMove,
} from './boardGames/chessAndMoveEngine.ts';

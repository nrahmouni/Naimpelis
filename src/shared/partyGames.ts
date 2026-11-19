/**
 * NAIM CINE — 4-Player Party Games Engine
 * Barrel entry point re-exporting Parchís Español and UNO Oficial engines.
 */
export {
  PARTY_COLORS,
  PARTY_TURN_DECISION_MS,
  buildFourSeats,
  preserveSeatsForRematch,
  claimPartyBotSeat,
  startPartyMatch,
  vacatePartySeatToBot,
  type PartyColor,
  type PartyGameType,
  type PartySeatPlayer,
  type ParchisPiece,
  type ParchisGameState,
  type UnoCardColor,
  type UnoCardValue,
  type UnoCard,
  type UnoGameState,
  type PartyGameState,
} from './partyGames/typesAndSeats.ts';

export {
  PARCHIS_START_OFFSETS,
  PARCHIS_SAFE_SQUARES,
  parchisGlobalSquare,
  createInitialParchisState,
  getLegalParchisPieceIds,
  rollParchisDice,
  moveParchisPiece,
  chooseBotParchisAction,
} from './partyGames/parchisEngine.ts';

export {
  UNO_TARGET_SCORE,
  buildUnoDeck,
  calculateUnoRoundScore,
  createInitialUnoState,
  isUnoCardPlayable,
  playUnoCard,
  resolveUnoWild4Challenge,
  drawUnoCardsAndAdvance,
  callUnoAction,
  catchUnoFailureAction,
  chooseBotUnoMove,
} from './partyGames/unoEngine.ts';

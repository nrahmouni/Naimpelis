/**
 * NAIM CINE — Pinturillo (Draw & Guess · 2–6 Players + AI Bots)
 * Barrel entry point re-exporting all Pinturillo types, word lists, bot sketches, and game state transitions.
 */
export {
  PINTURILLO_MAX_PLAYERS,
  PINTURILLO_CHOOSE_MS,
  PINTURILLO_ROUND_MS,
  PINTURILLO_ROUND_END_MS,
  PINTURILLO_SWATCHES,
  PINTURILLO_WORDS,
  normalizePinturilloGuess,
  pickRandomWordChoices,
  formatMaskedWord,
  type PinturilloStrokePoint,
  type PinturilloStroke,
  type PinturilloWordEntry,
  type PinturilloPlayer,
  type PinturilloGuessEntry,
  type PinturilloGameState,
} from './pinturillo/typesAndWords.ts';

export { buildBotSketchStrokes } from './pinturillo/botSketches.ts';

export {
  buildPinturilloSeats,
  createInitialPinturilloState,
  joinPinturilloPlayer,
  startPinturilloMatch,
  selectPinturilloWord,
  addPinturilloStroke,
  undoPinturilloStroke,
  clearPinturilloCanvas,
  revealPinturilloHintIfDue,
  submitPinturilloGuess,
  endPinturilloRound,
  advancePinturilloRound,
  pickBotPinturilloGuess,
  redactPinturilloForUser,
} from './pinturillo/engine.ts';

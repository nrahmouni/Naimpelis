/**
 * Blackjack 21 — Authoritative Casino Engine (Solo vs Dealer OR Online Multi-Seat Table)
 * Features: 6-deck shoe, soft/hard Ace scoring, Hit, Stand, Double Down, Split pairs, 3:2 natural Blackjack, Dealer H17/S17.
 */

export type BjSuit = 'spades' | 'hearts' | 'diamonds' | 'clubs';
export type BjRank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13; // 1=A, 11=J, 12=Q, 13=K

export interface BjCard {
  id: string;
  rank: BjRank;
  suit: BjSuit;
}

export type BjHandOutcome = 'pending' | 'blackjack' | 'win' | 'lose' | 'push' | 'bust';

export interface BlackjackPlayerHand {
  id: string;
  cards: BjCard[];
  bet: number;
  doubled: boolean;
  stood: boolean;
  isSplitHand: boolean;
  outcome: BjHandOutcome;
  payout: number;
}

export interface BlackjackSeat {
  seatIndex: number;
  userId: string;
  name: string;
  avatar: string;
  color: string;
  bankroll: number;
  pendingBet: number;
  lastBet: number;
  hands: BlackjackPlayerHand[];
  activeHandIndex: number;
  readyToDeal: boolean;
  donePlaying: boolean;
}

export interface BlackjackHandScore {
  total: number;
  isSoft: boolean;
  isBust: boolean;
  isNaturalBlackjack: boolean;
  displayLabel: string;
}

export type BlackjackPhase = 'betting' | 'playing' | 'dealer_turn' | 'settled';

export interface BlackjackGameState {
  phase: BlackjackPhase;
  roundNumber: number;
  seats: Array<BlackjackSeat | null>; // up to 4 seats
  activeSeatIndex: number;
  dealerCards: BjCard[];
  dealerHoleRevealed: boolean;
  shoe: BjCard[];
  statusMessage: string;
  updatedAt: number;
}

const SUITS: BjSuit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
const SUIT_CODE: Record<BjSuit, string> = {
  spades: 'S',
  hearts: 'H',
  diamonds: 'D',
  clubs: 'C',
};

export function formatBjRank(rank: BjRank): string {
  if (rank === 1) return 'A';
  if (rank === 11) return 'J';
  if (rank === 12) return 'Q';
  if (rank === 13) return 'K';
  return String(rank);
}

export function getBjCardNumericValue(rank: BjRank): number {
  if (rank === 1) return 11;
  if (rank >= 10) return 10;
  return rank;
}

export function createBlackjackShoe(numDecks = 6): BjCard[] {
  const shoe: BjCard[] = [];
  for (let d = 0; d < numDecks; d += 1) {
    for (const suit of SUITS) {
      for (let r = 1; r <= 13; r += 1) {
        const rank = r as BjRank;
        shoe.push({
          id: `${d}-${formatBjRank(rank)}${SUIT_CODE[suit]}`,
          rank,
          suit,
        });
      }
    }
  }
  for (let i = shoe.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = shoe[i];
    shoe[i] = shoe[j];
    shoe[j] = tmp;
  }
  return shoe;
}

export function getBlackjackHandValue(
  cards: BjCard[],
  opts?: { isSplitHand?: boolean }
): BlackjackHandScore {
  let sum = 0;
  let aces = 0;
  for (const c of cards) {
    if (c.rank === 1) {
      aces += 1;
      sum += 11;
    } else if (c.rank >= 10) {
      sum += 10;
    } else {
      sum += c.rank;
    }
  }
  while (sum > 21 && aces > 0) {
    sum -= 10;
    aces -= 1;
  }
  const isSoft = aces > 0 && sum <= 21;
  const isBust = sum > 21;
  const isNaturalBlackjack =
    cards.length === 2 && sum === 21 && !opts?.isSplitHand;
  const displayLabel = isNaturalBlackjack
    ? 'BJ 21'
    : isBust
    ? `${sum} (Bust)`
    : isSoft && sum < 21
    ? `${sum - 10}/${sum}`
    : `${sum}`;

  return {
    total: sum,
    isSoft,
    isBust,
    isNaturalBlackjack,
    displayLabel,
  };
}

export function canSplitBlackjackHand(
  hand: BlackjackPlayerHand | undefined,
  seat: BlackjackSeat | null
): boolean {
  if (!hand || !seat) return false;
  if (hand.cards.length !== 2) return false;
  if (seat.hands.length >= 4) return false;
  if (seat.bankroll < hand.bet) return false;
  return getBjCardNumericValue(hand.cards[0].rank) === getBjCardNumericValue(hand.cards[1].rank);
}

export function canDoubleBlackjackHand(
  hand: BlackjackPlayerHand | undefined,
  seat: BlackjackSeat | null
): boolean {
  if (!hand || !seat) return false;
  return hand.cards.length === 2 && !hand.doubled && !hand.stood && seat.bankroll >= hand.bet;
}

export function createInitialBlackjackState(
  hostUser?: { id: string; name: string; avatar: string; color: string }
): BlackjackGameState {
  const seats: Array<BlackjackSeat | null> = [null, null, null, null];
  if (hostUser) {
    seats[0] = {
      seatIndex: 0,
      userId: hostUser.id,
      name: hostUser.name,
      avatar: hostUser.avatar || '🎰',
      color: hostUser.color || '#10B981',
      bankroll: 1000,
      pendingBet: 25,
      lastBet: 25,
      hands: [],
      activeHandIndex: 0,
      readyToDeal: false,
      donePlaying: false,
    };
    seats[0].bankroll = 975;
  }

  return {
    phase: 'betting',
    roundNumber: 0,
    seats,
    activeSeatIndex: -1,
    dealerCards: [],
    dealerHoleRevealed: false,
    shoe: createBlackjackShoe(6),
    statusMessage: 'Elige tus fichas y pulsa Repartir.',
    updatedAt: Date.now(),
  };
}

export function joinBlackjackSeat(
  state: BlackjackGameState,
  user: { id: string; name: string; avatar: string; color: string },
  seatIndex?: number | 'spectate'
): { ok: boolean; state: BlackjackGameState } {
  const nextSeats = state.seats.map((s) => (s ? { ...s } : null));
  const curIdx = nextSeats.findIndex((s) => s?.userId === user.id);

  if (seatIndex === 'spectate') {
    if (curIdx === -1 || state.phase !== 'betting') return { ok: false, state };
    nextSeats[curIdx] = null;
    return { ok: true, state: { ...state, seats: nextSeats, updatedAt: Date.now() } };
  }

  const target =
    typeof seatIndex === 'number' && seatIndex >= 0 && seatIndex < 4
      ? seatIndex
      : nextSeats.findIndex((s) => s === null);

  if (target < 0 || target >= 4) return { ok: false, state };
  if (nextSeats[target] && nextSeats[target]!.userId !== user.id) return { ok: false, state };

  const preservedBankroll = curIdx !== -1 ? nextSeats[curIdx]!.bankroll + nextSeats[curIdx]!.pendingBet : 1000;
  if (curIdx !== -1 && curIdx !== target) {
    nextSeats[curIdx] = null;
  }

  nextSeats[target] = {
    seatIndex: target,
    userId: user.id,
    name: user.name,
    avatar: user.avatar || '🎰',
    color: user.color || '#10B981',
    bankroll: preservedBankroll,
    pendingBet: 0,
    lastBet: 25,
    hands: [],
    activeHandIndex: 0,
    readyToDeal: false,
    donePlaying: false,
  };

  return { ok: true, state: { ...state, seats: nextSeats, updatedAt: Date.now() } };
}

export function placeBlackjackBet(
  state: BlackjackGameState,
  userId: string,
  op: { kind: 'add'; amount: number } | { kind: 'clear' } | { kind: 'rebet' } | { kind: 'rebuy' }
): { ok: boolean; state: BlackjackGameState } {
  if (state.phase !== 'betting' && state.phase !== 'settled') {
    return { ok: false, state };
  }
  const baseState = state.phase === 'settled' ? prepareNewBlackjackBettingRound(state) : state;
  const nextSeats = baseState.seats.map((s) => (s ? { ...s } : null));
  const seat = nextSeats.find((s) => s?.userId === userId);
  if (!seat) return { ok: false, state };

  if (op.kind === 'rebuy') {
    if (seat.bankroll < 50 && seat.pendingBet === 0) {
      seat.bankroll = 1000;
    }
    return { ok: true, state: { ...baseState, seats: nextSeats, updatedAt: Date.now() } };
  }
  if (op.kind === 'clear') {
    seat.bankroll += seat.pendingBet;
    seat.pendingBet = 0;
    return { ok: true, state: { ...baseState, seats: nextSeats, updatedAt: Date.now() } };
  }
  if (op.kind === 'rebet') {
    const desired = Math.max(5, seat.lastBet || 25);
    seat.bankroll += seat.pendingBet;
    const bet = Math.min(seat.bankroll, desired);
    seat.bankroll -= bet;
    seat.pendingBet = bet;
    return { ok: true, state: { ...baseState, seats: nextSeats, updatedAt: Date.now() } };
  }
  const addAmt = Math.max(1, Math.floor(op.amount));
  if (seat.bankroll < addAmt) return { ok: false, state };
  seat.bankroll -= addAmt;
  seat.pendingBet += addAmt;
  return { ok: true, state: { ...baseState, seats: nextSeats, updatedAt: Date.now() } };
}

export function prepareNewBlackjackBettingRound(state: BlackjackGameState): BlackjackGameState {
  const nextSeats = state.seats.map((s) => {
    if (!s) return null;
    const autoBankroll = s.bankroll <= 0 && s.pendingBet <= 0 ? 1000 : s.bankroll;
    return {
      ...s,
      bankroll: autoBankroll,
      hands: [],
      activeHandIndex: 0,
      readyToDeal: false,
      donePlaying: false,
    };
  });
  return {
    ...state,
    phase: 'betting',
    activeSeatIndex: -1,
    dealerCards: [],
    dealerHoleRevealed: false,
    seats: nextSeats,
    statusMessage: 'Coloca tu apuesta y pulsa Repartir.',
    updatedAt: Date.now(),
  };
}

function drawShoeCard(shoe: BjCard[]): BjCard {
  if (shoe.length === 0) {
    shoe.push(...createBlackjackShoe(6));
  }
  return shoe.pop()!;
}

function settleDealerAndPayouts(state: BlackjackGameState): BlackjackGameState {
  const shoe = state.shoe.length < 52 ? createBlackjackShoe(6) : [...state.shoe];
  const dealerCards = [...state.dealerCards];
  const nextSeats = state.seats.map((s) =>
    s ? { ...s, hands: s.hands.map((h) => ({ ...h })) } : null
  );

  // Check if at least one player hand is still live (not busted and not already settled as natural BJ loss/push)
  const anyNonBustNonBj = nextSeats.some((s) =>
    s?.hands.some((h) => {
      const val = getBlackjackHandValue(h.cards, { isSplitHand: h.isSplitHand });
      return !val.isBust && !val.isNaturalBlackjack;
    })
  );

  if (anyNonBustNonBj) {
    while (true) {
      const dScore = getBlackjackHandValue(dealerCards);
      if (dScore.total >= 17) break;
      dealerCards.push(drawShoeCard(shoe));
    }
  }

  const dealerFinal = getBlackjackHandValue(dealerCards);
  let totalWins = 0;

  for (const seat of nextSeats) {
    if (!seat || seat.hands.length === 0) continue;
    for (const hand of seat.hands) {
      const pScore = getBlackjackHandValue(hand.cards, { isSplitHand: hand.isSplitHand });
      if (pScore.isBust) {
        hand.outcome = 'bust';
        hand.payout = 0;
      } else if (pScore.isNaturalBlackjack && dealerFinal.isNaturalBlackjack) {
        hand.outcome = 'push';
        hand.payout = hand.bet;
        seat.bankroll += hand.payout;
      } else if (pScore.isNaturalBlackjack) {
        hand.outcome = 'blackjack';
        // 3:2 payout -> bet returned + 1.5x bet profit
        hand.payout = Math.floor(hand.bet * 2.5);
        seat.bankroll += hand.payout;
        totalWins += 1;
      } else if (dealerFinal.isNaturalBlackjack) {
        hand.outcome = 'lose';
        hand.payout = 0;
      } else if (dealerFinal.isBust || pScore.total > dealerFinal.total) {
        hand.outcome = 'win';
        hand.payout = hand.bet * 2;
        seat.bankroll += hand.payout;
        totalWins += 1;
      } else if (pScore.total === dealerFinal.total) {
        hand.outcome = 'push';
        hand.payout = hand.bet;
        seat.bankroll += hand.payout;
      } else {
        hand.outcome = 'lose';
        hand.payout = 0;
      }
    }
  }

  return {
    ...state,
    phase: 'settled',
    activeSeatIndex: -1,
    dealerCards,
    dealerHoleRevealed: true,
    shoe,
    seats: nextSeats,
    statusMessage: dealerFinal.isBust
      ? '¡Crupier se pasa! Ronda liquidada.'
      : dealerFinal.isNaturalBlackjack
      ? 'El crupier tiene Blackjack.'
      : totalWins > 0
      ? `¡Crupier ${dealerFinal.total} · Mesa premiada!`
      : `Crupier cierra con ${dealerFinal.total}.`,
    updatedAt: Date.now(),
  };
}

function advanceActiveTurn(state: BlackjackGameState): BlackjackGameState {
  const nextSeats = state.seats;
  for (let sIdx = Math.max(0, state.activeSeatIndex); sIdx < nextSeats.length; sIdx += 1) {
    const seat = nextSeats[sIdx];
    if (!seat || seat.hands.length === 0 || seat.donePlaying) continue;
    for (let hIdx = seat.activeHandIndex; hIdx < seat.hands.length; hIdx += 1) {
      const hand = seat.hands[hIdx];
      const val = getBlackjackHandValue(hand.cards, { isSplitHand: hand.isSplitHand });
      if (!hand.stood && !val.isBust && val.total < 21 && !val.isNaturalBlackjack) {
        seat.activeHandIndex = hIdx;
        return {
          ...state,
          phase: 'playing',
          activeSeatIndex: sIdx,
          statusMessage: `Turno de ${seat.name}`,
          updatedAt: Date.now(),
        };
      }
      hand.stood = true;
    }
    seat.donePlaying = true;
  }

  return settleDealerAndPayouts(state);
}

export function dealBlackjackRound(state: BlackjackGameState): {
  ok: boolean;
  error?: string;
  state: BlackjackGameState;
} {
  const shoe = state.shoe.length < 52 ? createBlackjackShoe(6) : [...state.shoe];
  const nextSeats = state.seats.map((s) => (s ? { ...s } : null));

  let activeCount = 0;
  for (const seat of nextSeats) {
    if (!seat) continue;
    let bet = seat.pendingBet;
    if (bet <= 0 && seat.bankroll >= 5) {
      bet = Math.min(seat.bankroll, seat.lastBet || 25);
      seat.bankroll -= bet;
    }
    if (bet > 0) {
      activeCount += 1;
      seat.lastBet = bet;
      seat.pendingBet = 0;
      seat.hands = [
        {
          id: `h-${seat.seatIndex}-0-${Date.now()}`,
          cards: [drawShoeCard(shoe), drawShoeCard(shoe)],
          bet,
          doubled: false,
          stood: false,
          isSplitHand: false,
          outcome: 'pending',
          payout: 0,
        },
      ];
      seat.activeHandIndex = 0;
      seat.donePlaying = false;
    } else {
      seat.hands = [];
      seat.donePlaying = true;
    }
  }

  if (activeCount === 0) {
    return { ok: false, error: 'Apuesta al menos $5 antes de repartir.', state };
  }

  const dealerCards = [drawShoeCard(shoe), drawShoeCard(shoe)];
  const dealerScore = getBlackjackHandValue(dealerCards);

  const dealtState: BlackjackGameState = {
    phase: 'playing',
    roundNumber: state.roundNumber + 1,
    seats: nextSeats,
    activeSeatIndex: 0,
    dealerCards,
    dealerHoleRevealed: false,
    shoe,
    statusMessage: 'Ronda en juego',
    updatedAt: Date.now(),
  };

  // Immediate natural Blackjack check from dealer
  if (dealerScore.isNaturalBlackjack) {
    return { ok: true, state: settleDealerAndPayouts(dealtState) };
  }

  return { ok: true, state: advanceActiveTurn(dealtState) };
}

export function applyBlackjackAction(
  state: BlackjackGameState,
  userId: string,
  action: 'hit' | 'stand' | 'double' | 'split'
): { ok: boolean; error?: string; state: BlackjackGameState } {
  if (state.phase !== 'playing') {
    return { ok: false, error: 'No hay turno de jugador activo.', state };
  }
  const seat = state.seats[state.activeSeatIndex];
  if (!seat || seat.userId !== userId) {
    return { ok: false, error: 'No es tu turno.', state };
  }

  const shoe = [...state.shoe];
  const nextSeats = state.seats.map((s) =>
    s ? { ...s, hands: s.hands.map((h) => ({ ...h, cards: [...h.cards] })) } : null
  );
  const actor = nextSeats[state.activeSeatIndex]!;
  const hand = actor.hands[actor.activeHandIndex];
  if (!hand) return { ok: false, error: 'Mano inválida.', state };

  if (action === 'stand') {
    hand.stood = true;
  } else if (action === 'hit') {
    hand.cards.push(drawShoeCard(shoe));
    const val = getBlackjackHandValue(hand.cards, { isSplitHand: hand.isSplitHand });
    if (val.isBust || val.total === 21) {
      hand.stood = true;
    }
  } else if (action === 'double') {
    if (!canDoubleBlackjackHand(hand, actor)) {
      return { ok: false, error: 'No puedes doblar esta mano.', state };
    }
    actor.bankroll -= hand.bet;
    hand.bet *= 2;
    hand.doubled = true;
    hand.cards.push(drawShoeCard(shoe));
    hand.stood = true;
  } else if (action === 'split') {
    if (!canSplitBlackjackHand(hand, actor)) {
      return { ok: false, error: 'Solo puedes dividir parejas con saldo suficiente.', state };
    }
    actor.bankroll -= hand.bet;
    const secondCard = hand.cards.pop()!;
    hand.isSplitHand = true;
    hand.cards.push(drawShoeCard(shoe));

    const splitHand: BlackjackPlayerHand = {
      id: `h-${actor.seatIndex}-${actor.hands.length}-${Date.now()}`,
      cards: [secondCard, drawShoeCard(shoe)],
      bet: hand.bet,
      doubled: false,
      stood: false,
      isSplitHand: true,
      outcome: 'pending',
      payout: 0,
    };
    actor.hands.splice(actor.activeHandIndex + 1, 0, splitHand);
  }

  const nextState = advanceActiveTurn({
    ...state,
    shoe,
    seats: nextSeats,
  });
  return { ok: true, state: nextState };
}

export function redactBlackjackState(state: BlackjackGameState | null): BlackjackGameState | null {
  if (!state) return null;
  return {
    ...state,
    shoe: [],
    dealerCards: state.dealerHoleRevealed
      ? state.dealerCards
      : state.dealerCards.length > 0
      ? [state.dealerCards[0]]
      : [],
  };
}

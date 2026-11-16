/**
 * Texas Hold'em No-Limit Poker Engine + Exact 7-Card Hand Evaluator
 * Deterministic, pure TypeScript ruleset supporting 2-6 seats (humans + bots), side pots & WS redaction.
 */

export type CardSuit = 'spades' | 'hearts' | 'diamonds' | 'clubs';
export type CardRank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14; // 11=J, 12=Q, 13=K, 14=A

export interface PokerCard {
  id: string;
  rank: CardRank;
  suit: CardSuit;
}

export type PokerHandCategory =
  | 0 // High Card
  | 1 // One Pair
  | 2 // Two Pair
  | 3 // Three of a Kind
  | 4 // Straight
  | 5 // Flush
  | 6 // Full House
  | 7 // Four of a Kind
  | 8 // Straight Flush
  | 9; // Royal Flush

export interface EvaluatedPokerHand {
  category: PokerHandCategory;
  categoryLabelEs: string;
  categoryLabelEn: string;
  scoreTuple: number[]; // Lexicographic descending comparison
  best5Ids: string[];
}

export type PokerStreet = 'waiting' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';

export type PokerActionType = 'fold' | 'check' | 'call' | 'raise' | 'all_in';

export interface PokerSeat {
  seatIndex: number;
  userId: string;
  name: string;
  avatar: string;
  color: string;
  chips: number;
  holeCards: PokerCard[];
  currentBet: number;
  totalCommitted: number;
  folded: boolean;
  allIn: boolean;
  actedThisRound: boolean;
  isBot?: boolean;
  lastActionLabel?: string;
  revealedHand?: EvaluatedPokerHand | null;
}

export interface PokerWinnerSummary {
  seatIndex: number;
  userId: string;
  name: string;
  amount: number;
  hand: EvaluatedPokerHand | null;
}

export interface PokerGameState {
  status: 'waiting' | 'playing' | 'finished';
  street: PokerStreet;
  handNumber: number;
  smallBlind: number;
  bigBlind: number;
  dealerSeat: number;
  sbSeat: number;
  bbSeat: number;
  turnSeat: number;
  pot: number;
  currentBet: number;
  minRaiseIncrement: number;
  communityCards: PokerCard[];
  deck: PokerCard[];
  seats: Array<PokerSeat | null>; // length 6
  winners: PokerWinnerSummary[];
  statusMessage: string;
  updatedAt: number;
}

const SUITS: CardSuit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
const SUIT_CODE: Record<CardSuit, string> = {
  spades: 'S',
  hearts: 'H',
  diamonds: 'D',
  clubs: 'C',
};

const RANK_LABELS: Record<number, string> = {
  2: '2',
  3: '3',
  4: '4',
  5: '5',
  6: '6',
  7: '7',
  8: '8',
  9: '9',
  10: '10',
  11: 'J',
  12: 'Q',
  13: 'K',
  14: 'A',
};

export function formatPokerRank(rank: number): string {
  return RANK_LABELS[rank] || String(rank);
}

export function createShuffledDeck(): PokerCard[] {
  const deck: PokerCard[] = [];
  for (const suit of SUITS) {
    for (let r = 2; r <= 14; r += 1) {
      const rank = r as CardRank;
      deck.push({
        id: `${formatPokerRank(rank)}${SUIT_CODE[suit]}`,
        rank,
        suit,
      });
    }
  }
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = deck[i];
    deck[i] = deck[j];
    deck[j] = tmp;
  }
  return deck;
}

// ============================================================================
// EXACT 5-CARD & 7-CARD POKER HAND EVALUATOR
// ============================================================================

export function compareHandTuples(a: number[], b: number[]): number {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av !== bv) return av > bv ? 1 : -1;
  }
  return 0;
}

export function evaluateExact5(cards: PokerCard[]): EvaluatedPokerHand {
  const sorted = [...cards].sort((a, b) => b.rank - a.rank);
  const ranks = sorted.map((c) => c.rank);
  const isFlush = sorted.every((c) => c.suit === sorted[0].suit);

  // Check Straight (including A-5-4-3-2 wheel)
  const uniqueRanks = Array.from(new Set(ranks));
  let straightHigh = 0;
  if (uniqueRanks.length === 5) {
    if (uniqueRanks[0] - uniqueRanks[4] === 4) {
      straightHigh = uniqueRanks[0];
    } else if (
      uniqueRanks[0] === 14 &&
      uniqueRanks[1] === 5 &&
      uniqueRanks[2] === 4 &&
      uniqueRanks[3] === 3 &&
      uniqueRanks[4] === 2
    ) {
      straightHigh = 5;
    }
  }

  const freqMap = new Map<number, number>();
  for (const r of ranks) {
    freqMap.set(r, (freqMap.get(r) || 0) + 1);
  }
  const groups = Array.from(freqMap.entries()).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return b[0] - a[0];
  });

  const best5Ids = sorted.map((c) => c.id);

  if (isFlush && straightHigh === 14) {
    return {
      category: 9,
      categoryLabelEs: 'Escalera Real',
      categoryLabelEn: 'Royal Flush',
      scoreTuple: [9, 14],
      best5Ids,
    };
  }
  if (isFlush && straightHigh > 0) {
    return {
      category: 8,
      categoryLabelEs: 'Escalera de Color',
      categoryLabelEn: 'Straight Flush',
      scoreTuple: [8, straightHigh],
      best5Ids,
    };
  }
  if (groups[0][1] === 4) {
    return {
      category: 7,
      categoryLabelEs: 'Póker',
      categoryLabelEn: 'Four of a Kind',
      scoreTuple: [7, groups[0][0], groups[1][0]],
      best5Ids,
    };
  }
  if (groups[0][1] === 3 && groups[1][1] === 2) {
    return {
      category: 6,
      categoryLabelEs: 'Full House',
      categoryLabelEn: 'Full House',
      scoreTuple: [6, groups[0][0], groups[1][0]],
      best5Ids,
    };
  }
  if (isFlush) {
    return {
      category: 5,
      categoryLabelEs: 'Color',
      categoryLabelEn: 'Flush',
      scoreTuple: [5, ...ranks],
      best5Ids,
    };
  }
  if (straightHigh > 0) {
    return {
      category: 4,
      categoryLabelEs: 'Escalera',
      categoryLabelEn: 'Straight',
      scoreTuple: [4, straightHigh],
      best5Ids,
    };
  }
  if (groups[0][1] === 3) {
    const kickers = groups.slice(1).map((g) => g[0]);
    return {
      category: 3,
      categoryLabelEs: 'Trío',
      categoryLabelEn: 'Three of a Kind',
      scoreTuple: [3, groups[0][0], ...kickers],
      best5Ids,
    };
  }
  if (groups[0][1] === 2 && groups[1][1] === 2) {
    return {
      category: 2,
      categoryLabelEs: 'Doble Pareja',
      categoryLabelEn: 'Two Pair',
      scoreTuple: [2, groups[0][0], groups[1][0], groups[2][0]],
      best5Ids,
    };
  }
  if (groups[0][1] === 2) {
    const kickers = groups.slice(1).map((g) => g[0]);
    return {
      category: 1,
      categoryLabelEs: 'Pareja',
      categoryLabelEn: 'One Pair',
      scoreTuple: [1, groups[0][0], ...kickers],
      best5Ids,
    };
  }

  return {
    category: 0,
    categoryLabelEs: 'Carta Alta',
    categoryLabelEn: 'High Card',
    scoreTuple: [0, ...ranks],
    best5Ids,
  };
}

export function evaluateBest5Of7(cards: PokerCard[]): EvaluatedPokerHand {
  if (cards.length < 5) {
    const padded = [...cards];
    while (padded.length < 5) {
      padded.push({ id: `pad-${padded.length}`, rank: 2, suit: 'clubs' });
    }
    const res = evaluateExact5(padded);
    return {
      ...res,
      best5Ids: cards.map((c) => c.id),
    };
  }
  if (cards.length === 5) return evaluateExact5(cards);

  let best: EvaluatedPokerHand | null = null;
  const n = cards.length;
  for (let a = 0; a < n - 4; a += 1) {
    for (let b = a + 1; b < n - 3; b += 1) {
      for (let c = b + 1; c < n - 2; c += 1) {
        for (let d = c + 1; d < n - 1; d += 1) {
          for (let e = d + 1; e < n; e += 1) {
            const ev = evaluateExact5([cards[a], cards[b], cards[c], cards[d], cards[e]]);
            if (!best || compareHandTuples(ev.scoreTuple, best.scoreTuple) > 0) {
              best = ev;
            }
          }
        }
      }
    }
  }
  return best!;
}

// ============================================================================
// POKER TABLE LIFECYCLE & BETTING ROUNDS
// ============================================================================

const STARTING_CHIPS = 1000;
const SMALL_BLIND = 10;
const BIG_BLIND = 20;

const POKER_BOT_PRESETS = [
  { name: 'Bot Victoria', avatar: '🦊', color: '#F59E0B' },
  { name: 'Bot Maverick', avatar: '🦁', color: '#38BDF8' },
  { name: 'Bot Sofía', avatar: '🐱', color: '#EC4899' },
  { name: 'Bot Viper', avatar: '🦅', color: '#10B981' },
];

export function createInitialPokerState(
  humans: Array<{ id: string; name: string; avatar: string; color: string }>,
  opts?: { fillWithBots?: boolean; autoStart?: boolean }
): PokerGameState {
  const seats: Array<PokerSeat | null> = [null, null, null, null, null, null];
  humans.slice(0, 6).forEach((h, idx) => {
    seats[idx] = {
      seatIndex: idx,
      userId: h.id,
      name: h.name,
      avatar: h.avatar || '🃏',
      color: h.color || '#9146FF',
      chips: STARTING_CHIPS,
      holeCards: [],
      currentBet: 0,
      totalCommitted: 0,
      folded: false,
      allIn: false,
      actedThisRound: false,
    };
  });

  if (opts?.fillWithBots) {
    const botSlots = [2, 4, 1, 5];
    let botIdx = 0;
    for (const sIdx of botSlots) {
      if (seats[sIdx] === null && botIdx < 3) {
        const preset = POKER_BOT_PRESETS[botIdx];
        seats[sIdx] = {
          seatIndex: sIdx,
          userId: `bot-poker-${sIdx}`,
          name: preset.name,
          avatar: preset.avatar,
          color: preset.color,
          chips: STARTING_CHIPS,
          holeCards: [],
          currentBet: 0,
          totalCommitted: 0,
          folded: false,
          allIn: false,
          actedThisRound: false,
          isBot: true,
        };
        botIdx += 1;
      }
    }
  }

  const base: PokerGameState = {
    status: 'waiting',
    street: 'waiting',
    handNumber: 0,
    smallBlind: SMALL_BLIND,
    bigBlind: BIG_BLIND,
    dealerSeat: 0,
    sbSeat: 0,
    bbSeat: 0,
    turnSeat: -1,
    pot: 0,
    currentBet: 0,
    minRaiseIncrement: BIG_BLIND,
    communityCards: [],
    deck: [],
    seats,
    winners: [],
    statusMessage: 'Mesa lista · Toma asiento y pulsa Repartir.',
    updatedAt: Date.now(),
  };

  if (opts?.autoStart) {
    return startNextPokerHand(base).state;
  }
  return base;
}

export function joinPokerSeat(
  state: PokerGameState,
  user: { id: string; name: string; avatar: string; color: string },
  seatIndex?: number | 'spectate'
): { ok: boolean; state: PokerGameState } {
  const nextSeats = state.seats.map((s) => (s ? { ...s } : null));
  const curIdx = nextSeats.findIndex((s) => s && !s.isBot && s.userId === user.id);

  if (seatIndex === 'spectate') {
    if (curIdx === -1) return { ok: false, state };
    if (state.status === 'playing' && !nextSeats[curIdx]!.folded) return { ok: false, state };
    nextSeats[curIdx] = null;
    return { ok: true, state: { ...state, seats: nextSeats, updatedAt: Date.now() } };
  }

  const target =
    typeof seatIndex === 'number' && seatIndex >= 0 && seatIndex < 6
      ? seatIndex
      : nextSeats.findIndex((s) => s === null || s.isBot);

  if (target < 0 || target >= 6) return { ok: false, state };
  const occupant = nextSeats[target];
  if (occupant && !occupant.isBot && occupant.userId !== user.id) return { ok: false, state };

  const preservedChips = curIdx !== -1 && nextSeats[curIdx] ? nextSeats[curIdx]!.chips : STARTING_CHIPS;
  if (curIdx !== -1 && curIdx !== target) {
    nextSeats[curIdx] = null;
  }

  nextSeats[target] = {
    seatIndex: target,
    userId: user.id,
    name: user.name,
    avatar: user.avatar || '🃏',
    color: user.color || '#9146FF',
    chips: Math.max(preservedChips, 0) || STARTING_CHIPS,
    holeCards: [],
    currentBet: 0,
    totalCommitted: 0,
    folded: state.status === 'playing',
    allIn: false,
    actedThisRound: state.status === 'playing',
  };

  return { ok: true, state: { ...state, seats: nextSeats, updatedAt: Date.now() } };
}

function findNextOccupiedSeat(seats: Array<PokerSeat | null>, fromSeat: number, predicate: (s: PokerSeat) => boolean): number {
  for (let offset = 1; offset <= 6; offset += 1) {
    const idx = (fromSeat + offset) % 6;
    const s = seats[idx];
    if (s && predicate(s)) return idx;
  }
  return -1;
}

export function startNextPokerHand(state: PokerGameState): {
  ok: boolean;
  error?: string;
  state: PokerGameState;
} {
  const nextSeats: Array<PokerSeat | null> = state.seats.map((s) => {
    if (!s) return null;
    // Auto-rebuy busted bots or seats with 0 chips so matches never stall
    const chips = s.chips > 0 ? s.chips : s.isBot ? STARTING_CHIPS : STARTING_CHIPS;
    return {
      ...s,
      chips,
      holeCards: [] as PokerCard[],
      currentBet: 0,
      totalCommitted: 0,
      folded: false,
      allIn: false,
      actedThisRound: false,
      lastActionLabel: undefined,
      revealedHand: null,
    };
  });

  const activeSeatIndices = nextSeats
    .map((s, i) => (s && s.chips > 0 ? i : -1))
    .filter((i) => i !== -1);

  if (activeSeatIndices.length < 2) {
    return { ok: false, error: 'Se necesitan al menos 2 jugadores en la mesa.', state };
  }

  const deck = createShuffledDeck();
  const handNumber = state.handNumber + 1;
  const dealerSeat =
    handNumber === 1
      ? activeSeatIndices[0]
      : findNextOccupiedSeat(nextSeats, state.dealerSeat, (s) => s.chips > 0);

  const isHeadsUp = activeSeatIndices.length === 2;
  const sbSeat = isHeadsUp
    ? dealerSeat
    : findNextOccupiedSeat(nextSeats, dealerSeat, (s) => s.chips > 0);
  const bbSeat = findNextOccupiedSeat(nextSeats, sbSeat, (s) => s.chips > 0);

  // Deal 2 hole cards to each active seat
  for (const idx of activeSeatIndices) {
    nextSeats[idx]!.holeCards = [deck.pop()!, deck.pop()!];
  }

  // Post blinds
  let pot = 0;
  const postBlind = (idx: number, amount: number, label: string) => {
    const seat = nextSeats[idx]!;
    const actual = Math.min(seat.chips, amount);
    seat.chips -= actual;
    seat.currentBet = actual;
    seat.totalCommitted = actual;
    if (seat.chips === 0) seat.allIn = true;
    seat.lastActionLabel = `${label} $${actual}`;
    pot += actual;
  };
  postBlind(sbSeat, state.smallBlind, 'SB');
  postBlind(bbSeat, state.bigBlind, 'BB');

  const firstTurn = findNextOccupiedSeat(nextSeats, bbSeat, (s) => !s.folded && !s.allIn);

  return {
    ok: true,
    state: {
      ...state,
      status: 'playing',
      street: 'preflop',
      handNumber,
      dealerSeat,
      sbSeat,
      bbSeat,
      turnSeat: firstTurn,
      pot,
      currentBet: Math.max(nextSeats[sbSeat]!.currentBet, nextSeats[bbSeat]!.currentBet),
      minRaiseIncrement: state.bigBlind,
      communityCards: [],
      deck,
      seats: nextSeats,
      winners: [],
      statusMessage: `Mano #${handNumber} · Pre-Flop`,
      updatedAt: Date.now(),
    },
  };
}

function resolveShowdownOrLastStanding(state: PokerGameState): PokerGameState {
  const nextSeats = state.seats.map((s) => (s ? { ...s } : null));
  const deck = [...state.deck];
  const board = [...state.communityCards];

  const contenders = nextSeats.filter((s): s is PokerSeat => Boolean(s && !s.folded));

  // If everyone else folded -> last player standing wins entire pot cleanly without revealing cards
  if (contenders.length === 1) {
    const sole = contenders[0];
    sole.chips += state.pot;
    return {
      ...state,
      status: 'finished',
      street: 'showdown',
      turnSeat: -1,
      seats: nextSeats,
      winners: [
        {
          seatIndex: sole.seatIndex,
          userId: sole.userId,
          name: sole.name,
          amount: state.pot,
          hand: null,
        },
      ],
      statusMessage: `${sole.name} gana $${state.pot} (todos se retiraron)`,
      updatedAt: Date.now(),
    };
  }

  // Run out remaining community cards for all-in showdowns
  while (board.length < 5 && deck.length > 0) {
    board.push(deck.pop()!);
  }

  // Evaluate each contender's 7-card best hand
  const evalMap = new Map<number, EvaluatedPokerHand>();
  for (const c of contenders) {
    const ev = evaluateBest5Of7([...c.holeCards, ...board]);
    c.revealedHand = ev;
    evalMap.set(c.seatIndex, ev);
  }

  // Side-pot calculation based on totalCommitted tiers
  const levels = Array.from(
    new Set(
      nextSeats
        .filter((s): s is PokerSeat => Boolean(s && s.totalCommitted > 0))
        .map((s) => s.totalCommitted)
    )
  ).sort((a, b) => a - b);

  const payoutBySeat = new Map<number, number>();
  let prevLevel = 0;

  for (const level of levels) {
    const slice = level - prevLevel;
    if (slice <= 0) continue;
    let slicePot = 0;
    for (const s of nextSeats) {
      if (s && s.totalCommitted > prevLevel) {
        slicePot += Math.min(slice, s.totalCommitted - prevLevel);
      }
    }
    const eligible = contenders.filter((c) => c.totalCommitted >= level);
    if (eligible.length > 0 && slicePot > 0) {
      let bestGroup: PokerSeat[] = [eligible[0]];
      for (let i = 1; i < eligible.length; i += 1) {
        const cmp = compareHandTuples(
          evalMap.get(eligible[i].seatIndex)!.scoreTuple,
          evalMap.get(bestGroup[0].seatIndex)!.scoreTuple
        );
        if (cmp > 0) bestGroup = [eligible[i]];
        else if (cmp === 0) bestGroup.push(eligible[i]);
      }
      const share = Math.floor(slicePot / bestGroup.length);
      let rem = slicePot - share * bestGroup.length;
      for (const w of bestGroup) {
        const extra = rem > 0 ? 1 : 0;
        if (rem > 0) rem -= 1;
        payoutBySeat.set(w.seatIndex, (payoutBySeat.get(w.seatIndex) || 0) + share + extra);
      }
    }
    prevLevel = level;
  }

  const winners: PokerWinnerSummary[] = [];
  for (const [seatIdx, amount] of payoutBySeat.entries()) {
    const s = nextSeats[seatIdx]!;
    s.chips += amount;
    winners.push({
      seatIndex: seatIdx,
      userId: s.userId,
      name: s.name,
      amount,
      hand: evalMap.get(seatIdx) || null,
    });
  }
  winners.sort((a, b) => b.amount - a.amount);

  const topWinner = winners[0];
  const label = topWinner?.hand?.categoryLabelEs ? ` (${topWinner.hand.categoryLabelEs})` : '';
  return {
    ...state,
    status: 'finished',
    street: 'showdown',
    turnSeat: -1,
    communityCards: board,
    deck,
    seats: nextSeats,
    winners,
    statusMessage: topWinner
      ? `${topWinner.name} gana $${topWinner.amount}${label}`
      : 'Showdown completado',
    updatedAt: Date.now(),
  };
}

function advanceStreetOrNextTurn(state: PokerGameState): PokerGameState {
  const activeNotFolded = state.seats.filter((s): s is PokerSeat => Boolean(s && !s.folded));
  if (activeNotFolded.length <= 1) {
    return resolveShowdownOrLastStanding(state);
  }

  const canAct = activeNotFolded.filter((s) => !s.allIn);
  const everyoneMatched = canAct.every(
    (s) => s.actedThisRound && s.currentBet === state.currentBet
  );

  // If fewer than 2 players can still make betting decisions AND bets are settled -> run out board
  if (everyoneMatched) {
    const nextSeats = state.seats.map((s) =>
      s
        ? {
            ...s,
            currentBet: 0,
            actedThisRound: false,
            lastActionLabel: s.folded ? 'Retirado' : s.allIn ? 'All-In' : undefined,
          }
        : null
    );
    const deck = [...state.deck];
    const board = [...state.communityCards];

    let nextStreet: PokerStreet = state.street;
    if (state.street === 'preflop') {
      nextStreet = 'flop';
      board.push(deck.pop()!, deck.pop()!, deck.pop()!);
    } else if (state.street === 'flop') {
      nextStreet = 'turn';
      board.push(deck.pop()!);
    } else if (state.street === 'turn') {
      nextStreet = 'river';
      board.push(deck.pop()!);
    } else {
      return resolveShowdownOrLastStanding(state);
    }

    if (canAct.length <= 1) {
      return resolveShowdownOrLastStanding({
        ...state,
        street: nextStreet,
        communityCards: board,
        deck,
        seats: nextSeats,
        currentBet: 0,
      });
    }

    const firstTurn = findNextOccupiedSeat(
      nextSeats,
      state.dealerSeat,
      (s) => !s.folded && !s.allIn
    );
    const streetNames: Record<PokerStreet, string> = {
      waiting: 'Esperando',
      preflop: 'Pre-Flop',
      flop: 'Flop',
      turn: 'Turn',
      river: 'River',
      showdown: 'Showdown',
    };
    return {
      ...state,
      street: nextStreet,
      communityCards: board,
      deck,
      seats: nextSeats,
      currentBet: 0,
      minRaiseIncrement: state.bigBlind,
      turnSeat: firstTurn,
      statusMessage: `Mano #${state.handNumber} · ${streetNames[nextStreet]}`,
      updatedAt: Date.now(),
    };
  }

  const nextTurn = findNextOccupiedSeat(
    state.seats,
    state.turnSeat,
    (s) => !s.folded && !s.allIn
  );
  if (nextTurn === -1) {
    return resolveShowdownOrLastStanding(state);
  }
  return {
    ...state,
    turnSeat: nextTurn,
    updatedAt: Date.now(),
  };
}

export function applyPokerAction(
  state: PokerGameState,
  userId: string,
  action: PokerActionType,
  raiseToAmount?: number
): { ok: boolean; error?: string; state: PokerGameState } {
  if (state.status !== 'playing') {
    return { ok: false, error: 'La mano no está activa.', state };
  }
  const seat = state.seats[state.turnSeat];
  if (!seat || seat.userId !== userId) {
    return { ok: false, error: 'No es tu turno.', state };
  }

  const nextSeats = state.seats.map((s) => (s ? { ...s } : null));
  const actor = nextSeats[state.turnSeat]!;
  let nextPot = state.pot;
  let nextCurrentBet = state.currentBet;
  let nextMinRaise = state.minRaiseIncrement;

  const toCall = Math.max(0, state.currentBet - actor.currentBet);

  if (action === 'fold') {
    actor.folded = true;
    actor.actedThisRound = true;
    actor.lastActionLabel = 'Fold';
  } else if (action === 'check') {
    if (toCall > 0) {
      return { ok: false, error: 'Debes igualar la apuesta o retirarte.', state };
    }
    actor.actedThisRound = true;
    actor.lastActionLabel = 'Pasar';
  } else if (action === 'call') {
    const pay = Math.min(actor.chips, toCall);
    actor.chips -= pay;
    actor.currentBet += pay;
    actor.totalCommitted += pay;
    nextPot += pay;
    if (actor.chips === 0) actor.allIn = true;
    actor.actedThisRound = true;
    actor.lastActionLabel = actor.allIn ? 'All-In' : toCall === 0 ? 'Pasar' : `Igualar $${pay}`;
  } else if (action === 'all_in') {
    const pay = actor.chips;
    const prevBet = actor.currentBet;
    actor.chips = 0;
    actor.currentBet += pay;
    actor.totalCommitted += pay;
    nextPot += pay;
    actor.allIn = true;
    actor.actedThisRound = true;
    if (actor.currentBet > nextCurrentBet) {
      const raiseDiff = actor.currentBet - nextCurrentBet;
      if (raiseDiff >= nextMinRaise) nextMinRaise = raiseDiff;
      nextCurrentBet = actor.currentBet;
      // Other non-allin players must respond to the raise
      for (const s of nextSeats) {
        if (s && s.seatIndex !== actor.seatIndex && !s.folded && !s.allIn) {
          s.actedThisRound = false;
        }
      }
    }
    actor.lastActionLabel = prevBet > 0 ? `All-In $${actor.currentBet}` : `All-In $${pay}`;
  } else if (action === 'raise') {
    const minRaiseTo = state.currentBet + state.minRaiseIncrement;
    const targetTotalBet = Math.max(minRaiseTo, Math.floor(raiseToAmount || minRaiseTo));
    const maxPossible = actor.currentBet + actor.chips;
    const clampedTarget = Math.min(targetTotalBet, maxPossible);
    const delta = Math.max(0, clampedTarget - actor.currentBet);
    if (delta <= 0) {
      return { ok: false, error: 'Cantidad de subida inválida.', state };
    }
    actor.chips -= delta;
    actor.currentBet += delta;
    actor.totalCommitted += delta;
    nextPot += delta;
    if (actor.chips === 0) actor.allIn = true;
    if (actor.currentBet > nextCurrentBet) {
      const raiseDiff = actor.currentBet - nextCurrentBet;
      if (raiseDiff >= nextMinRaise) nextMinRaise = raiseDiff;
      nextCurrentBet = actor.currentBet;
      for (const s of nextSeats) {
        if (s && s.seatIndex !== actor.seatIndex && !s.folded && !s.allIn) {
          s.actedThisRound = false;
        }
      }
    }
    actor.actedThisRound = true;
    actor.lastActionLabel = actor.allIn ? 'All-In' : `Subir $${actor.currentBet}`;
  }

  const nextState = advanceStreetOrNextTurn({
    ...state,
    pot: nextPot,
    currentBet: nextCurrentBet,
    minRaiseIncrement: nextMinRaise,
    seats: nextSeats,
  });
  return { ok: true, state: nextState };
}

export function choosePokerBotAction(state: PokerGameState): {
  action: PokerActionType;
  raiseTo?: number;
} {
  const actor = state.seats[state.turnSeat];
  if (!actor) return { action: 'check' };

  const toCall = Math.max(0, state.currentBet - actor.currentBet);
  const r1 = actor.holeCards[0]?.rank || 7;
  const r2 = actor.holeCards[1]?.rank || 5;
  const suited = actor.holeCards[0]?.suit === actor.holeCards[1]?.suit;
  const paired = r1 === r2;

  let strength = 0.25;
  if (state.communityCards.length >= 3) {
    const ev = evaluateBest5Of7([...actor.holeCards, ...state.communityCards]);
    strength = Math.min(1, 0.22 + ev.category * 0.14 + (ev.scoreTuple[1] || 7) * 0.01);
  } else {
    strength = (Math.max(r1, r2) + Math.min(r1, r2) * 0.5) / 22 + (paired ? 0.28 : 0) + (suited ? 0.07 : 0);
  }

  const roll = Math.random();
  if (toCall === 0) {
    if (strength > 0.72 && actor.chips > state.bigBlind * 2 && roll < 0.65) {
      const target = Math.min(actor.chips, Math.max(state.bigBlind * 2, Math.round(state.pot * 0.55)));
      return { action: 'raise', raiseTo: target };
    }
    return { action: 'check' };
  }

  if (toCall > actor.chips * 0.45 && strength < 0.52) {
    return { action: 'fold' };
  }
  if (toCall > state.bigBlind * 4 && strength < 0.44 && roll < 0.75) {
    return { action: 'fold' };
  }
  if (strength > 0.8 && actor.chips > toCall + state.minRaiseIncrement && roll < 0.45) {
    const raiseTo = state.currentBet + Math.max(state.minRaiseIncrement, state.bigBlind * 2);
    return { action: 'raise', raiseTo };
  }
  return { action: 'call' };
}

export function redactPokerStateForUser(
  state: PokerGameState | null,
  viewerUserId: string
): PokerGameState | null {
  if (!state) return null;
  const revealAll = state.street === 'showdown' || state.status === 'finished';
  return {
    ...state,
    deck: [],
    seats: state.seats.map((s) => {
      if (!s) return null;
      const shouldHide = !revealAll && !s.folded && s.userId !== viewerUserId;
      return {
        ...s,
        holeCards: shouldHide ? [] : s.holeCards,
      };
    }),
  };
}

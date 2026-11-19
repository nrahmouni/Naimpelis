import type {
  CardRank,
  CardSuit,
  EvaluatedPokerHand,
  PokerActionType,
  PokerCard,
  PokerGameState,
} from './texasHoldem.ts';

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

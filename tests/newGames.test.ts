import { describe, it, expect } from 'vitest';
import {
  HS_ARENA_W,
  HS_BALL_RADIUS,
  HS_CROSSBAR_Y,
  HS_GOAL_W,
  HS_GROUND_Y,
  HS_HEAD_RADIUS,
  chooseHeadSoccerAiInput,
  createHeadSoccerSimulation,
  createInitialHeadSoccerOnlineState,
  joinHeadSoccerSeat,
  selectHeadSoccerSkin,
  startHeadSoccerMatch,
  stepHeadSoccerFrame,
} from '../src/shared/headSoccer';
import {
  applyPokerAction,
  createInitialPokerState,
  evaluateBest5Of7,
  joinPokerSeat,
  redactPokerStateForUser,
  startNextPokerHand,
  type PokerCard,
} from '../src/shared/texasHoldem';
import {
  applyBlackjackAction,
  canDoubleBlackjackHand,
  canSplitBlackjackHand,
  createInitialBlackjackState,
  dealBlackjackRound,
  getBlackjackHandValue,
  placeBlackjackBet,
  redactBlackjackState,
} from '../src/shared/blackjack';

const alice = { id: 'u-alice', name: 'Alice', avatar: '👩', color: '#9146FF' };
const bob = { id: 'u-bob', name: 'Bob', avatar: '🧑', color: '#10b981' };

describe('Head Soccer Engine', () => {
  it('simulates ball gravity, player movement, jumping, and kicking', () => {
    const sim = createHeadSoccerSimulation('striker', 'furia');
    const startBallY = sim.ball.y;

    const events = stepHeadSoccerFrame(
      sim,
      [
        { left: false, right: true, jump: true, kick: true },
        { left: false, right: false, jump: false, kick: false },
      ],
      1 / 60
    );

    expect(events).toBeDefined();
    expect(sim.players[0].x).toBeGreaterThan(210);
    expect(sim.players[0].y).toBeLessThan(HS_GROUND_Y - HS_HEAD_RADIUS);
    expect(sim.players[0].kickTimer).toBeGreaterThan(0);
    // Ball drops with gravity
    stepHeadSoccerFrame(
      sim,
      [
        { left: false, right: false, jump: false, kick: false },
        { left: false, right: false, jump: false, kick: false },
      ],
      1 / 60
    );
    expect(sim.ball.y).toBeGreaterThan(startBallY);
  });

  it('detects goals inside the right goal and generates AI defense/attack inputs', () => {
    const sim = createHeadSoccerSimulation('striker', 'furia');
    // Place ball entering right goal below crossbar
    sim.ball.x = HS_ARENA_W - HS_GOAL_W + HS_BALL_RADIUS;
    sim.ball.y = HS_CROSSBAR_Y + 45;
    sim.ball.vx = 250;
    sim.ball.vy = 0;

    const events = stepHeadSoccerFrame(
      sim,
      [
        { left: false, right: false, jump: false, kick: false },
        { left: false, right: false, jump: false, kick: false },
      ],
      1 / 60
    );

    expect(events.goalScoredBy).toBe(0);
    expect(sim.scores[0]).toBe(1);
    expect(sim.phase).toBe('goal');

    const aiInput = chooseHeadSoccerAiInput(sim, 1);
    expect(typeof aiInput.left).toBe('boolean');
    expect(typeof aiInput.kick).toBe('boolean');
  });

  it('manages online 2-player seats, skins, and bot fallback start', () => {
    let lobby = createInitialHeadSoccerOnlineState(alice);
    expect(lobby.status).toBe('waiting');
    lobby = selectHeadSoccerSkin(lobby, alice.id, 'ninja');
    expect(lobby.players[0]?.skinId).toBe('ninja');

    const startedSolo = startHeadSoccerMatch(lobby);
    expect(startedSolo.ok).toBe(true);
    expect(startedSolo.state.status).toBe('playing');
    expect(startedSolo.state.players[1]?.isBot).toBe(true);

    const joined = joinHeadSoccerSeat(lobby, bob, 1);
    expect(joined.ok).toBe(true);
    const started1v1 = startHeadSoccerMatch(joined.state);
    expect(started1v1.ok).toBe(true);
    expect(started1v1.state.players[1]?.userId).toBe(bob.id);
  });
});

describe('Texas Hold’em Poker Engine', () => {
  const c = (rank: PokerCard['rank'], suit: PokerCard['suit']): PokerCard => ({
    id: `${rank}-${suit}`,
    rank,
    suit,
  });

  it('evaluates 7-card hands accurately across categories including wheel straight & royal flush', () => {
    const royal = evaluateBest5Of7([
      c(14, 'spades'),
      c(13, 'spades'),
      c(12, 'spades'),
      c(11, 'spades'),
      c(10, 'spades'),
      c(2, 'hearts'),
      c(3, 'clubs'),
    ]);
    expect(royal.category).toBe(9);
    expect(royal.best5Ids).toHaveLength(5);

    const fullHouse = evaluateBest5Of7([
      c(14, 'spades'),
      c(14, 'hearts'),
      c(14, 'clubs'),
      c(9, 'diamonds'),
      c(9, 'spades'),
      c(4, 'hearts'),
      c(2, 'clubs'),
    ]);
    expect(fullHouse.category).toBe(6);

    const wheel = evaluateBest5Of7([
      c(14, 'spades'),
      c(2, 'hearts'),
      c(3, 'diamonds'),
      c(4, 'clubs'),
      c(5, 'spades'),
      c(13, 'hearts'),
      c(9, 'clubs'),
    ]);
    expect(wheel.category).toBe(4);
    expect(wheel.scoreTuple[1]).toBe(5);
  });

  it('posts blinds, redacts opponent hole cards pre-showdown, and resolves fold win', () => {
    const base = createInitialPokerState([alice], { fillWithBots: false, autoStart: false });
    const joined = joinPokerSeat(base, bob, 1);
    expect(joined.ok).toBe(true);
    const dealt = startNextPokerHand(joined.state);
    expect(dealt.ok).toBe(true);
    expect(dealt.state.status).toBe('playing');
    expect(dealt.state.pot).toBe(30); // SB 10 + BB 20

    // Redaction hides Bob's hole cards when viewed by Alice before showdown
    const redactedForAlice = redactPokerStateForUser(dealt.state, alice.id)!;
    expect(redactedForAlice.deck).toHaveLength(0);
    expect(redactedForAlice.seats[0]?.holeCards).toHaveLength(2);
    expect(redactedForAlice.seats[1]?.holeCards).toHaveLength(0);

    const actorSeat = dealt.state.seats[dealt.state.turnSeat]!;
    const folded = applyPokerAction(dealt.state, actorSeat.userId, 'fold');
    expect(folded.ok).toBe(true);
    expect(folded.state.status).toBe('finished');
    expect(folded.state.winners).toHaveLength(1);
    expect(folded.state.winners[0].amount).toBe(30);
  });
});

describe('Blackjack 21 Engine', () => {
  it('computes soft/hard Aces and natural Blackjack accurately', () => {
    const soft17 = getBlackjackHandValue([
      { id: '1', rank: 1, suit: 'spades' },
      { id: '2', rank: 6, suit: 'hearts' },
    ]);
    expect(soft17.total).toBe(17);
    expect(soft17.isSoft).toBe(true);

    const hard17 = getBlackjackHandValue([
      { id: '1', rank: 1, suit: 'spades' },
      { id: '2', rank: 6, suit: 'hearts' },
      { id: '3', rank: 10, suit: 'clubs' },
    ]);
    expect(hard17.total).toBe(17);
    expect(hard17.isSoft).toBe(false);

    const natural = getBlackjackHandValue([
      { id: '1', rank: 1, suit: 'spades' },
      { id: '2', rank: 13, suit: 'diamonds' },
    ]);
    expect(natural.total).toBe(21);
    expect(natural.isNaturalBlackjack).toBe(true);

    const split21 = getBlackjackHandValue(
      [
        { id: '1', rank: 1, suit: 'spades' },
        { id: '2', rank: 13, suit: 'diamonds' },
      ],
      { isSplitHand: true }
    );
    expect(split21.isNaturalBlackjack).toBe(false);
  });

  it('pays 3:2 on natural Blackjack, allows double/split checks, and redacts shoe/dealer hole card', () => {
    let state = createInitialBlackjackState(alice);
    state = placeBlackjackBet(state, alice.id, { kind: 'clear' }).state;
    state = placeBlackjackBet(state, alice.id, { kind: 'add', amount: 100 }).state;
    expect(state.seats[0]?.bankroll).toBe(900);
    expect(state.seats[0]?.pendingBet).toBe(100);

    // Craft deterministic shoe (>= 52 cards so it won't reshuffle) so Alice gets natural Blackjack (A + K) and Dealer gets 18 (10 + 8)
    const filler = Array.from({ length: 52 }, (_, i) => ({
      id: `fill-${i}`,
      rank: 5 as const,
      suit: 'clubs' as const,
    }));
    state.shoe = [
      ...filler,
      { id: 'd2', rank: 8, suit: 'clubs' },
      { id: 'd1', rank: 10, suit: 'spades' },
      { id: 'p2', rank: 13, suit: 'hearts' },
      { id: 'p1', rank: 1, suit: 'diamonds' },
    ];

    const dealt = dealBlackjackRound(state);
    expect(dealt.ok).toBe(true);
    expect(dealt.state.phase).toBe('settled');
    expect(dealt.state.seats[0]?.hands[0].outcome).toBe('blackjack');
    expect(dealt.state.seats[0]?.hands[0].payout).toBe(250); // 100 bet + 150 profit
    expect(dealt.state.seats[0]?.bankroll).toBe(1150);

    // Split + Double availability check on pair of 8s
    const pairSeat = {
      ...dealt.state.seats[0]!,
      bankroll: 500,
    };
    const pairHand = {
      id: 'h-pair',
      cards: [
        { id: '8s', rank: 8 as const, suit: 'spades' as const },
        { id: '8h', rank: 8 as const, suit: 'hearts' as const },
      ],
      bet: 100,
      doubled: false,
      stood: false,
      isSplitHand: false,
      outcome: 'pending' as const,
      payout: 0,
    };
    expect(canSplitBlackjackHand(pairHand, pairSeat)).toBe(true);
    expect(canDoubleBlackjackHand(pairHand, pairSeat)).toBe(true);

    // Split + Stand actions during playing phase
    let liveState = createInitialBlackjackState(alice);
    liveState = {
      ...liveState,
      phase: 'playing',
      activeSeatIndex: 0,
      dealerCards: [
        { id: 'd-up', rank: 6, suit: 'spades' },
        { id: 'd-hole', rank: 10, suit: 'hearts' },
      ],
      dealerHoleRevealed: false,
      shoe: [
        { id: 'd-hit', rank: 10, suit: 'diamonds' }, // dealer busts with 26
        { id: 's2', rank: 3, suit: 'clubs' },
        { id: 's1', rank: 2, suit: 'clubs' },
      ],
      seats: [
        {
          ...liveState.seats[0]!,
          bankroll: 500,
          pendingBet: 0,
          hands: [pairHand],
        },
        null,
        null,
        null,
      ],
    };

    const redacted = redactBlackjackState(liveState)!;
    expect(redacted.shoe).toHaveLength(0);
    expect(redacted.dealerCards).toHaveLength(1);

    const afterSplit = applyBlackjackAction(liveState, alice.id, 'split');
    expect(afterSplit.ok).toBe(true);
    expect(afterSplit.state.seats[0]?.hands).toHaveLength(2);
    expect(afterSplit.state.seats[0]?.bankroll).toBe(400);
  });
});

import { describe, expect, it } from 'vitest';
import {
  addPinturilloStroke,
  advancePinturilloRound,
  buildBotSketchStrokes,
  clearPinturilloCanvas,
  createInitialPinturilloState,
  redactPinturilloForUser,
  revealPinturilloHintIfDue,
  selectPinturilloWord,
  submitPinturilloGuess,
  undoPinturilloStroke,
} from '../src/shared/pinturillo';
import {
  KART_TRACK_LIST,
  createInitialTurboKartState,
  setTurboKartTrack,
  startTurboKartRace,
  stepTurboKartSimulation,
  useTurboKartItem,
} from '../src/shared/turboKart';
import {
  callUnoAction,
  createInitialUnoState,
  playUnoCard,
} from '../src/shared/partyGames';

describe('Pinturillo Draw & Guess Engine', () => {
  const players = [
    { id: 'u1', name: 'Naim', avatar: '🎨', color: '#9146FF' },
    { id: 'u2', name: 'Yuri', avatar: '⭐', color: '#E11D48' },
  ];

  it('chooses secret words, draws strokes, supports undo/clear, and redacts secret from guessers', () => {
    const initial = createInitialPinturilloState(players);
    expect(initial.status).toBe('choosing');
    expect(initial.players.length).toBeGreaterThanOrEqual(3); // fills with bot(s)
    expect(initial.wordChoices).toHaveLength(3);

    const chosenWord = initial.wordChoices[0];
    const picked = selectPinturilloWord(initial, 'u1', chosenWord.id);
    expect(picked.ok).toBe(true);
    if (!picked.ok) return;

    // Secret word visible to drawer, redacted for guesser u2
    const drawerView = redactPinturilloForUser(picked.state, 'u1');
    const guesserView = redactPinturilloForUser(picked.state, 'u2');
    expect(drawerView?.secretWord?.id).toBe(chosenWord.id);
    expect(guesserView?.secretWord).toBeNull();
    expect(guesserView?.wordChoices).toEqual([]);
    expect(guesserView?.maskedWord.includes('_')).toBe(true);

    // Add stroke, undo, clear
    const stroked = addPinturilloStroke(picked.state, 'u1', {
      id: 'st-1',
      color: '#E11D48',
      size: 6,
      points: [
        { x: 0.2, y: 0.2 },
        { x: 0.6, y: 0.6 },
      ],
    });
    expect(stroked.ok).toBe(true);
    if (!stroked.ok) return;
    expect(stroked.state.strokes).toHaveLength(1);

    const undone = undoPinturilloStroke(stroked.state, 'u1');
    expect(undone.ok).toBe(true);
    if (!undone.ok) return;
    expect(undone.state.strokes).toHaveLength(0);

    const stroked2 = addPinturilloStroke(undone.state, 'u1', {
      id: 'st-2',
      color: '#2563EB',
      size: 8,
      points: [{ x: 0.5, y: 0.5 }],
    });
    expect(stroked2.ok).toBe(true);
    if (!stroked2.ok) return;

    const cleared = clearPinturilloCanvas(stroked2.state, 'u1');
    expect(cleared.ok).toBe(true);
    if (!cleared.ok) return;
    expect(cleared.state.strokes).toHaveLength(0);

    // Bot sketch helper returns non-empty normalized strokes
    expect(buildBotSketchStrokes(chosenWord.id).length).toBeGreaterThan(0);
  });

  it('scores fast exact ES/EN guesses, detects close guesses, reveals progressive hints, and advances rounds', () => {
    const initial = createInitialPinturilloState([players[0], players[1]]);
    const chosen = initial.wordChoices[0];
    const picked = selectPinturilloWord(initial, 'u1', chosen.id);
    expect(picked.ok).toBe(true);
    if (!picked.ok) return;

    // Reveal hint when < 18s remaining
    const hinted = revealPinturilloHintIfDue(picked.state, picked.state.phaseDeadlineAt - 10_000);
    expect(hinted.hintIndices.length).toBeGreaterThan(0);

    // Close guess (missing last char)
    const almostWord = chosen.es.length >= 4 ? chosen.es.slice(0, -1) : chosen.en.slice(0, -1);
    const closeRes = submitPinturilloGuess(hinted, 'u2', almostWord);
    expect(closeRes.ok).toBe(true);
    if (closeRes.ok && almostWord.length >= 3) {
      expect(closeRes.outcome).toBe('close');
    }

    // Exact English match also scores points for guesser and drawer
    const exactRes = submitPinturilloGuess(picked.state, 'u2', chosen.en);
    expect(exactRes.ok).toBe(true);
    if (!exactRes.ok) return;
    expect(exactRes.outcome).toBe('correct');
    expect(exactRes.state.players[1].score).toBeGreaterThan(100);
    expect(exactRes.state.players[0].score).toBeGreaterThan(0);

    const nextRound = advancePinturilloRound(exactRes.state);
    expect(nextRound.round).toBe(2);
    expect(nextRound.drawerSeat).toBe(1);
    expect(nextRound.status).toBe('choosing');
  });
});

describe('Turbo Kart Racing Engine', () => {
  const host = { id: 'p1', name: 'Naim', avatar: '🏎️', color: '#E11D48' };
  const p2 = { id: 'p2', name: 'Yuri', avatar: '⚡', color: '#3B82F6' };

  it('supports 3 distinct tracks and transitions cleanly from countdown into live racing physics', () => {
    expect(KART_TRACK_LIST).toHaveLength(3);
    const lobby = createInitialTurboKartState([host, p2], { trackId: 'neon_sun', waitForHost: true });
    expect(lobby.status).toBe('waiting');
    expect(lobby.racers).toHaveLength(6); // 2 humans + 4 bots

    const switched = setTurboKartTrack(lobby, 'volcano_turbo');
    expect(switched.trackId).toBe('volcano_turbo');
    expect(switched.itemBoxes.length).toBeGreaterThan(0);

    const countdown = startTurboKartRace(switched, 1_000_000);
    expect(countdown.status).toBe('countdown');

    // Step past countdown
    const racing = stepTurboKartSimulation(
      countdown,
      { p1: { throttle: 1, steer: 0, drift: false } },
      100,
      1_005_000
    );
    expect(racing.status).toBe('racing');

    // Drive forward for several steps
    let curr = racing;
    for (let i = 0; i < 15; i += 1) {
      curr = stepTurboKartSimulation(
        curr,
        { p1: { throttle: 1, steer: 0.25, drift: true } },
        55,
        1_005_000 + (i + 1) * 55
      );
    }
    expect(curr.racers[0].speed).toBeGreaterThan(50);
  });

  it('activates all throwable and boost kart items cleanly', () => {
    const base = startTurboKartRace(
      createInitialTurboKartState([host, p2], { trackId: 'emerald_lake', waitForHost: true }),
      10_000
    );
    let racing = stepTurboKartSimulation(base, {}, 55, 15_000);

    const items = ['turbo', 'star', 'banana', 'green_shell', 'red_shell', 'shock'] as const;
    for (const item of items) {
      const prepared = {
        ...racing,
        racers: racing.racers.map((r, idx) =>
          idx === 0 ? { ...r, item, boostUntil: 0, starUntil: 0 } : r
        ),
      };
      const used = useTurboKartItem(prepared, 'p1', 16_000);
      expect(used.ok).toBe(true);
      if (!used.ok) continue;
      expect(used.usedItem).toBe(item);
      expect(used.state.racers[0].item).toBeNull();
      if (item === 'turbo') expect(used.state.racers[0].boostUntil).toBeGreaterThan(16_000);
      if (item === 'star') expect(used.state.racers[0].starUntil).toBeGreaterThan(16_000);
      if (item === 'banana') expect(used.state.hazards.length).toBeGreaterThan(0);
      if (item === 'green_shell' || item === 'red_shell') {
        expect(used.state.projectiles.length).toBeGreaterThan(0);
      }
      if (item === 'shock') {
        expect(used.state.racers[1].spinUntil).toBeGreaterThan(16_000);
      }
      racing = used.state;
    }
  });
});

describe('UNO 2-Card Pre-Call Rule', () => {
  it('allows calling ¡UNO! with 2 cards left and keeps player protected after playing second-to-last card', () => {
    const initial = createInitialUnoState([{ id: 'u1', name: 'Naim', avatar: '🎮', color: '#9146FF' }]);
    const customState = {
      ...initial,
      status: 'playing' as const,
      turnSeat: 0,
      activeColor: 'red' as const,
      discardPile: [{ id: 'top', color: 'red' as const, value: '3' as const }],
      hands: {
        ...initial.hands,
        0: [
          { id: 'c1', color: 'red' as const, value: '7' as const },
          { id: 'c2', color: 'red' as const, value: '9' as const },
        ],
      },
    };

    const called = callUnoAction(customState, 'u1');
    expect(called.ok).toBe(true);
    if (!called.ok) return;
    expect(called.state.unoCalledSeats).toContain(0);

    const played = playUnoCard(called.state, 'u1', 'c1');
    expect(played.ok).toBe(true);
    if (!played.ok) return;
    expect(played.state.hands[0]).toHaveLength(1);
    expect(played.state.vulnerableUnoSeat).toBeNull();
  });
});

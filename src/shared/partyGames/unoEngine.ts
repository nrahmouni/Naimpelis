import {
  buildFourSeats,
  PARTY_COLORS,
  PARTY_TURN_DECISION_MS,
  preserveSeatsForRematch,
  type PartyColor,
  type PartySeatPlayer,
  type UnoCard,
  type UnoCardColor,
  type UnoCardValue,
  type UnoGameState,
} from './typesAndSeats.ts';

export const UNO_TARGET_SCORE = 500;

export function buildUnoDeck(): UnoCard[] {
  const cards: UnoCard[] = [];
  let seq = 1;
  const push = (color: UnoCardColor, value: UnoCardValue) => {
    cards.push({ id: `u-${seq++}`, color, value });
  };
  for (const c of PARTY_COLORS) {
    push(c, '0');
    const vals: UnoCardValue[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'skip', 'reverse', 'draw2'];
    for (const v of vals) {
      push(c, v);
      push(c, v);
    }
  }
  for (let i = 0; i < 4; i += 1) {
    push('wild', 'wild');
    push('wild', 'wild4');
  }
  for (let i = cards.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

function getUnoCardPoints(card: UnoCard): number {
  if (card.value === 'wild' || card.value === 'wild4') return 50;
  if (card.value === 'skip' || card.value === 'reverse' || card.value === 'draw2') return 20;
  return Number.parseInt(card.value, 10) || 0;
}

export function calculateUnoRoundScore(hands: Record<number, UnoCard[]>, winnerSeat: number): number {
  let total = 0;
  for (const [seatStr, hand] of Object.entries(hands)) {
    if (Number(seatStr) === winnerSeat) continue;
    for (const c of hand) total += getUnoCardPoints(c);
  }
  return total;
}

export function createInitialUnoState(
  humans: Array<{ id: string; name: string; avatar?: string }>,
  opts?: { waitForHost?: boolean; existingScores?: number[]; preservedSeats?: PartySeatPlayer[] }
): UnoGameState {
  const basePlayers = opts?.preservedSeats
    ? preserveSeatsForRematch(opts.preservedSeats, humans)
    : buildFourSeats(humans);
  const players = basePlayers.map((pl, idx) => ({
    ...pl,
    score: opts?.existingScores?.[idx] ?? pl.score,
  }));
  const waitForHost = Boolean(opts?.waitForHost);
  const now = Date.now();
  const deck = buildUnoDeck();
  const hands: Record<number, UnoCard[]> = { 0: [], 1: [], 2: [], 3: [] };
  for (let r = 0; r < 7; r += 1) {
    for (let s = 0; s < 4; s += 1) {
      hands[s].push(deck.pop()!);
    }
  }

  let topCard = deck.pop()!;
  while (topCard.value === 'wild4') {
    deck.unshift(topCard);
    for (let i = deck.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    topCard = deck.pop()!;
  }

  let initialDirection: 1 | -1 = 1;
  let initialTurnSeat = 0;
  const setupLogs: string[] = [];

  if (topCard.value === 'reverse') {
    initialDirection = -1;
    initialTurnSeat = 3;
    setupLogs.push('Carta inicial Cambio de Sentido: empieza en sentido antihorario.');
  } else if (topCard.value === 'skip') {
    initialTurnSeat = 1;
    setupLogs.push(`Carta inicial Salto: ${players[0].name} pierde primer turno.`);
  } else if (topCard.value === 'draw2') {
    const drawn = [deck.pop()!, deck.pop()!].filter(Boolean);
    hands[1].push(...drawn);
    initialTurnSeat = 2;
    setupLogs.push(`Carta inicial +2: ${players[1].name} roba 2 cartas y pierde turno.`);
  }

  const initialColor: PartyColor =
    topCard.color === 'wild' ? 'red' : topCard.color;

  return {
    id: `uno-${now}`,
    gameType: 'uno',
    status: waitForHost ? 'waiting' : 'playing',
    players,
    hands,
    deck,
    discardPile: [topCard],
    activeColor: initialColor,
    turnSeat: initialTurnSeat,
    direction: initialDirection,
    pendingDraw: 0,
    pendingWild4Challenge: null,
    drawnPlayableCardId: null,
    vulnerableUnoSeat: null,
    roundPointsWon: 0,
    winnerSeat: null,
    unoCalledSeats: [],
    log: [
      ...setupLogs,
      waitForHost
        ? 'Mesa UNO Oficial (108 cartas) · Elige color y espera al anfitrión.'
        : 'UNO Oficial (Mattel 1971) iniciado · Sin acumular +2/+4 · Desafío +4 activo.',
    ],
    turnDeadlineAt: waitForHost ? undefined : now + PARTY_TURN_DECISION_MS,
    updatedAt: now,
  };
}

export function isUnoCardPlayable(state: UnoGameState, card: UnoCard): boolean {
  if (state.pendingWild4Challenge) return false;
  if (state.drawnPlayableCardId) {
    return card.id === state.drawnPlayableCardId;
  }
  const top = state.discardPile[state.discardPile.length - 1];
  if (!top) return true;
  if (card.color === 'wild') return true;
  return card.color === state.activeColor || card.value === top.value;
}

function drawFromDeck(
  deck: UnoCard[],
  discardPile: UnoCard[],
  count: number
): { drawn: UnoCard[]; deck: UnoCard[]; discardPile: UnoCard[] } {
  const nextDeck = [...deck];
  let nextDiscard = [...discardPile];
  const drawn: UnoCard[] = [];
  for (let i = 0; i < count; i += 1) {
    if (nextDeck.length === 0 && nextDiscard.length > 1) {
      const top = nextDiscard.pop()!;
      for (let k = nextDiscard.length - 1; k > 0; k -= 1) {
        const j = Math.floor(Math.random() * (k + 1));
        [nextDiscard[k], nextDiscard[j]] = [nextDiscard[j], nextDiscard[k]];
      }
      nextDeck.push(...nextDiscard);
      nextDiscard = [top];
    }
    if (nextDeck.length > 0) {
      drawn.push(nextDeck.pop()!);
    }
  }
  return { drawn, deck: nextDeck, discardPile: nextDiscard };
}

export function playUnoCard(
  state: UnoGameState,
  actorUserId: string,
  cardId: string,
  chosenColor?: PartyColor
): { ok: true; state: UnoGameState; finishedNow: boolean } | { ok: false; error: string } {
  if (state.status !== 'playing') {
    return {
      ok: false,
      error: state.status === 'waiting' ? 'Esperando a que el anfitrión inicie la partida.' : 'Partida finalizada.',
    };
  }
  if (state.pendingWild4Challenge) {
    return { ok: false, error: 'Primero hay que aceptar o desafiar el +4 activo.' };
  }
  const seat = state.players[state.turnSeat];
  if (!seat.isBot && seat.userId !== actorUserId) {
    return { ok: false, error: 'No es tu turno.' };
  }

  const hand = state.hands[state.turnSeat] || [];
  const cardIdx = hand.findIndex((c) => c.id === cardId);
  if (cardIdx === -1) return { ok: false, error: 'Carta no encontrada.' };
  const card = hand[cardIdx];
  if (!isUnoCardPlayable(state, card)) {
    return { ok: false, error: 'Esa carta no coincide con el color, número o símbolo activo.' };
  }

  const nextHand = hand.filter((c) => c.id !== cardId);
  let nextHands: Record<number, UnoCard[]> = { ...state.hands, [state.turnSeat]: nextHand };
  let nextDeck = state.deck;
  let nextDiscard = [...state.discardPile, card];
  const prevColor = state.activeColor;
  const nextColor: PartyColor =
    card.color === 'wild' ? chosenColor || 'red' : card.color;

  if (nextHand.length === 0) {
    const pts = calculateUnoRoundScore(nextHands, state.turnSeat);
    const nextPlayers = state.players.map((pl, idx) =>
      idx === state.turnSeat ? { ...pl, score: pl.score + pts } : pl
    );
    const totalScore = nextPlayers[state.turnSeat].score;
    return {
      ok: true,
      finishedNow: true,
      state: {
        ...state,
        status: 'finished',
        players: nextPlayers,
        hands: nextHands,
        discardPile: nextDiscard,
        activeColor: nextColor,
        winnerSeat: state.turnSeat,
        pendingDraw: 0,
        pendingWild4Challenge: null,
        drawnPlayableCardId: null,
        vulnerableUnoSeat: null,
        roundPointsWon: pts,
        log: [
          ...state.log.slice(-14),
          `🏆 ¡${seat.name} se quedó sin cartas (+${pts} pts · Total ${totalScore}/${UNO_TARGET_SCORE})!`,
        ],
        updatedAt: Date.now(),
      },
    };
  }

  const now = Date.now();
  const nextUnoCalled = state.unoCalledSeats.includes(state.turnSeat);
  const nextVulnerable =
    nextHand.length === 1 && !nextUnoCalled ? state.turnSeat : null;
  const logs = [...state.log.slice(-13)];

  if (card.value === 'wild4') {
    const wasIllegal = nextHand.some((c) => c.color === prevColor);
    const victimSeat = ((state.turnSeat + state.direction) % 4 + 4) % 4;
    logs.push(`${seat.name} lanzó +4 (${nextColor.toUpperCase()}) · ${state.players[victimSeat].name} decide si acepta o desafía.`);
    return {
      ok: true,
      finishedNow: false,
      state: {
        ...state,
        hands: nextHands,
        discardPile: nextDiscard,
        activeColor: nextColor,
        turnSeat: victimSeat,
        pendingWild4Challenge: {
          offenderSeat: state.turnSeat,
          victimSeat,
          wasIllegal,
          chosenColor: nextColor,
        },
        drawnPlayableCardId: null,
        vulnerableUnoSeat: nextVulnerable,
        unoCalledSeats: nextHand.length === 1 ? state.unoCalledSeats : state.unoCalledSeats.filter((s) => s !== state.turnSeat),
        log: logs,
        turnDeadlineAt: now + PARTY_TURN_DECISION_MS,
        updatedAt: now,
      },
    };
  }

  let nextDir = state.direction;
  let stepCount = 1;

  if (card.value === 'reverse') {
    nextDir = (state.direction * -1) as 1 | -1;
    logs.push(`${seat.name} jugó Cambio de Sentido (${nextColor}).`);
  } else if (card.value === 'skip') {
    stepCount = 2;
    const skippedSeat = ((state.turnSeat + nextDir) % 4 + 4) % 4;
    logs.push(`${seat.name} saltó a ${state.players[skippedSeat].name}.`);
  } else if (card.value === 'draw2') {
    const victimSeat = ((state.turnSeat + nextDir) % 4 + 4) % 4;
    const drawRes = drawFromDeck(nextDeck, nextDiscard, 2);
    nextDeck = drawRes.deck;
    nextDiscard = drawRes.discardPile;
    nextHands = {
      ...nextHands,
      [victimSeat]: [...(nextHands[victimSeat] || []), ...drawRes.drawn],
    };
    stepCount = 2;
    logs.push(`${seat.name} tiró +2 · ${state.players[victimSeat].name} roba 2 y pierde turno.`);
  } else {
    logs.push(`${seat.name} jugó ${card.value.toUpperCase()} (${nextColor}).`);
  }

  const nextSeat = ((state.turnSeat + nextDir * stepCount) % 4 + 4) % 4;
  return {
    ok: true,
    finishedNow: false,
    state: {
      ...state,
      hands: nextHands,
      deck: nextDeck,
      discardPile: nextDiscard,
      activeColor: nextColor,
      direction: nextDir,
      turnSeat: nextSeat,
      pendingDraw: 0,
      pendingWild4Challenge: null,
      drawnPlayableCardId: null,
      vulnerableUnoSeat: nextVulnerable,
      unoCalledSeats: nextHand.length === 1 ? state.unoCalledSeats : state.unoCalledSeats.filter((s) => s !== state.turnSeat),
      log: logs,
      turnDeadlineAt: now + PARTY_TURN_DECISION_MS,
      updatedAt: now,
    },
  };
}

export function resolveUnoWild4Challenge(
  state: UnoGameState,
  actorUserId: string,
  decision: 'accept' | 'challenge'
): { ok: true; state: UnoGameState } | { ok: false; error: string } {
  if (state.status !== 'playing' || !state.pendingWild4Challenge) {
    return { ok: false, error: 'No hay ningún +4 pendiente de respuesta.' };
  }
  const { offenderSeat, victimSeat, wasIllegal } = state.pendingWild4Challenge;
  const victim = state.players[victimSeat];
  if (!victim.isBot && victim.userId !== actorUserId) {
    return { ok: false, error: 'Solo el jugador afectado puede responder al +4.' };
  }

  const now = Date.now();
  let nextDeck = state.deck;
  let nextDiscard = state.discardPile;
  const nextHands = { ...state.hands };
  let nextTurnSeat = victimSeat;
  const logs = [...state.log.slice(-13)];

  if (decision === 'accept') {
    const drawRes = drawFromDeck(nextDeck, nextDiscard, 4);
    nextDeck = drawRes.deck;
    nextDiscard = drawRes.discardPile;
    nextHands[victimSeat] = [...(nextHands[victimSeat] || []), ...drawRes.drawn];
    nextTurnSeat = ((victimSeat + state.direction) % 4 + 4) % 4;
    logs.push(`${victim.name} aceptó el +4, robó 4 cartas y perdió turno.`);
  } else if (wasIllegal) {
    const drawRes = drawFromDeck(nextDeck, nextDiscard, 4);
    nextDeck = drawRes.deck;
    nextDiscard = drawRes.discardPile;
    nextHands[offenderSeat] = [...(nextHands[offenderSeat] || []), ...drawRes.drawn];
    nextTurnSeat = victimSeat;
    logs.push(
      `⚖️ ¡Desafío ganado! ${state.players[offenderSeat].name} tenía carta del color y roba 4 cartas.`
    );
  } else {
    const drawRes = drawFromDeck(nextDeck, nextDiscard, 6);
    nextDeck = drawRes.deck;
    nextDiscard = drawRes.discardPile;
    nextHands[victimSeat] = [...(nextHands[victimSeat] || []), ...drawRes.drawn];
    nextTurnSeat = ((victimSeat + state.direction) % 4 + 4) % 4;
    logs.push(`❌ Desafío fallido · ${victim.name} roba 6 cartas (4+2) y pierde turno.`);
  }

  return {
    ok: true,
    state: {
      ...state,
      hands: nextHands,
      deck: nextDeck,
      discardPile: nextDiscard,
      turnSeat: nextTurnSeat,
      pendingWild4Challenge: null,
      unoCalledSeats: state.unoCalledSeats.filter((s) => s !== victimSeat && s !== offenderSeat),
      log: logs,
      turnDeadlineAt: now + PARTY_TURN_DECISION_MS,
      updatedAt: now,
    },
  };
}

export function drawUnoCardsAndAdvance(
  state: UnoGameState,
  actorUserId: string
): { ok: true; state: UnoGameState } | { ok: false; error: string } {
  if (state.status !== 'playing') {
    return {
      ok: false,
      error: state.status === 'waiting' ? 'Esperando a que el anfitrión inicie la partida.' : 'Partida finalizada.',
    };
  }
  if (state.pendingWild4Challenge) {
    return resolveUnoWild4Challenge(state, actorUserId, 'accept');
  }
  const seat = state.players[state.turnSeat];
  if (!seat.isBot && seat.userId !== actorUserId) {
    return { ok: false, error: 'No es tu turno.' };
  }

  const now = Date.now();

  if (state.drawnPlayableCardId) {
    const nextSeat = ((state.turnSeat + state.direction) % 4 + 4) % 4;
    return {
      ok: true,
      state: {
        ...state,
        turnSeat: nextSeat,
        drawnPlayableCardId: null,
        vulnerableUnoSeat: null,
        log: [...state.log.slice(-14), `${seat.name} decidió guardar la carta robada y pasó.`],
        turnDeadlineAt: now + PARTY_TURN_DECISION_MS,
        updatedAt: now,
      },
    };
  }

  const { drawn, deck, discardPile } = drawFromDeck(state.deck, state.discardPile, 1);
  const drawnCard = drawn[0];
  const nextHands = {
    ...state.hands,
    [state.turnSeat]: [...(state.hands[state.turnSeat] || []), ...drawn],
  };

  if (drawnCard && isUnoCardPlayable(state, drawnCard)) {
    return {
      ok: true,
      state: {
        ...state,
        hands: nextHands,
        deck,
        discardPile,
        drawnPlayableCardId: drawnCard.id,
        vulnerableUnoSeat: null,
        unoCalledSeats: state.unoCalledSeats.filter((s) => s !== state.turnSeat),
        log: [...state.log.slice(-14), `${seat.name} robó 1 carta jugable (puede jugarla o pasar).`],
        turnDeadlineAt: now + PARTY_TURN_DECISION_MS,
        updatedAt: now,
      },
    };
  }

  const nextSeat = ((state.turnSeat + state.direction) % 4 + 4) % 4;
  return {
    ok: true,
    state: {
      ...state,
      hands: nextHands,
      deck,
      discardPile,
      pendingDraw: 0,
      drawnPlayableCardId: null,
      vulnerableUnoSeat: null,
      turnSeat: nextSeat,
      unoCalledSeats: state.unoCalledSeats.filter((s) => s !== state.turnSeat),
      log: [...state.log.slice(-14), `${seat.name} robó 1 carta.`],
      turnDeadlineAt: now + PARTY_TURN_DECISION_MS,
      updatedAt: now,
    },
  };
}

export function callUnoAction(
  state: UnoGameState,
  actorUserId: string
): { ok: true; state: UnoGameState } | { ok: false; error: string } {
  if (state.status === 'finished') return { ok: false, error: 'Partida finalizada.' };
  const seatIdx = state.players.findIndex((p) => !p.isBot && p.userId === actorUserId);
  if (seatIdx === -1) return { ok: false, error: 'No estás sentado en la mesa.' };
  const hand = state.hands[seatIdx] || [];
  if (hand.length > 2) return { ok: false, error: 'Solo puedes cantar ¡UNO! con 1 o 2 cartas.' };
  const seat = state.players[seatIdx];
  return {
    ok: true,
    state: {
      ...state,
      unoCalledSeats: Array.from(new Set([...state.unoCalledSeats, seatIdx])),
      vulnerableUnoSeat: state.vulnerableUnoSeat === seatIdx ? null : state.vulnerableUnoSeat,
      log: [...state.log.slice(-14), `📣 ¡${seat.name} gritó ¡UNO!!`],
      updatedAt: Date.now(),
    },
  };
}

export function catchUnoFailureAction(
  state: UnoGameState,
  catcherUserId: string
): { ok: true; state: UnoGameState } | { ok: false; error: string } {
  if (state.status !== 'playing') return { ok: false, error: 'Partida inactiva.' };
  const targetSeat = state.vulnerableUnoSeat;
  if (targetSeat === null || targetSeat === undefined) {
    return { ok: false, error: 'Nadie olvidó decir ¡UNO! ahora mismo.' };
  }
  const victim = state.players[targetSeat];
  if (!victim || victim.userId === catcherUserId) {
    return { ok: false, error: 'No puedes pillarte a ti mismo.' };
  }
  const catcher = state.players.find((p) => p.userId === catcherUserId)?.name || 'Un jugador';
  const { drawn, deck, discardPile } = drawFromDeck(state.deck, state.discardPile, 2);
  const nextHands = {
    ...state.hands,
    [targetSeat]: [...(state.hands[targetSeat] || []), ...drawn],
  };
  return {
    ok: true,
    state: {
      ...state,
      hands: nextHands,
      deck,
      discardPile,
      vulnerableUnoSeat: null,
      log: [
        ...state.log.slice(-14),
        `🚨 ¡${catcher} pilló a ${victim.name} sin gritar UNO! (+2 cartas de penalización).`,
      ],
      updatedAt: Date.now(),
    },
  };
}

export function chooseBotUnoMove(state: UnoGameState): {
  action: 'play_card' | 'draw_card' | 'pass_turn' | 'accept_wild4' | 'challenge_wild4';
  cardId?: string;
  chosenColor?: PartyColor;
} {
  if (state.pendingWild4Challenge) {
    return { action: Math.random() < 0.3 ? 'challenge_wild4' : 'accept_wild4' };
  }
  if (state.drawnPlayableCardId) {
    const hand = state.hands[state.turnSeat] || [];
    const card = hand.find((c) => c.id === state.drawnPlayableCardId);
    if (card) {
      let chosenColor: PartyColor = 'red';
      if (card.color === 'wild') {
        const counts: Record<PartyColor, number> = { red: 0, blue: 0, yellow: 0, green: 0 };
        for (const c of hand) if (c.color !== 'wild') counts[c.color] += 1;
        chosenColor = PARTY_COLORS.reduce((best, col) => (counts[col] > counts[best] ? col : best), 'red' as PartyColor);
      }
      return { action: 'play_card', cardId: card.id, chosenColor };
    }
    return { action: 'pass_turn' };
  }

  const hand = state.hands[state.turnSeat] || [];
  const playable = hand.filter((c) => isUnoCardPlayable(state, c));
  if (playable.length === 0) {
    return { action: 'draw_card' };
  }
  const hasMatchingColor = hand.some((c) => c.color === state.activeColor);
  const sorted = [...playable].sort((a, b) => {
    const score = (c: UnoCard) => {
      if (c.value === 'wild4') return hasMatchingColor ? -10 : 1;
      if (c.color === 'wild') return 2;
      if (c.value === 'draw2' || c.value === 'skip' || c.value === 'reverse') return 10;
      return 6;
    };
    return score(b) - score(a);
  });
  const pick = sorted[0];
  let chosenColor: PartyColor = 'red';
  if (pick.color === 'wild') {
    const counts: Record<PartyColor, number> = { red: 0, blue: 0, yellow: 0, green: 0 };
    for (const c of hand) {
      if (c.color !== 'wild') counts[c.color] += 1;
    }
    chosenColor = PARTY_COLORS.reduce((best, col) => (counts[col] > counts[best] ? col : best), 'red' as PartyColor);
  }
  return { action: 'play_card', cardId: pick.id, chosenColor };
}

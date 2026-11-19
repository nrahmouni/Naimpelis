import {
  formatMaskedWord,
  normalizePinturilloGuess,
  pickRandomWordChoices,
  PINTURILLO_BOT_FILLER_GUESSES,
  PINTURILLO_BOT_PROFILES,
  PINTURILLO_CHOOSE_MS,
  PINTURILLO_MAX_PLAYERS,
  PINTURILLO_ROUND_END_MS,
  PINTURILLO_ROUND_MS,
  PINTURILLO_WORDS,
  pinturilloLevenshtein,
  type PinturilloGameState,
  type PinturilloGuessEntry,
  type PinturilloPlayer,
  type PinturilloStroke,
} from './typesAndWords.ts';

export function buildPinturilloSeats(
  humans: Array<{ id: string; name: string; avatar?: string; color?: string }>,
  preserved?: PinturilloPlayer[]
): PinturilloPlayer[] {
  const cleanHumans: Array<{ id: string; name: string; avatar?: string; color?: string }> = [];
  const seen = new Set<string>();
  for (const h of humans) {
    if (!h?.id || seen.has(h.id)) continue;
    seen.add(h.id);
    cleanHumans.push(h);
    if (cleanHumans.length >= PINTURILLO_MAX_PLAYERS) break;
  }

  const targetCount = Math.max(4, Math.min(PINTURILLO_MAX_PLAYERS, cleanHumans.length));
  const seats: PinturilloPlayer[] = [];
  for (let i = 0; i < targetCount; i += 1) {
    const h = cleanHumans[i];
    const prev = Array.isArray(preserved)
      ? preserved.find((p) => (h ? p.userId === h.id : p.seatIndex === i && p.isBot))
      : undefined;
    if (h) {
      seats.push({
        seatIndex: i,
        userId: h.id,
        name: h.name,
        avatar: h.avatar || '🎨',
        color: h.color || '#9146FF',
        isBot: false,
        score: prev?.score || 0,
        streak: prev?.streak || 0,
        hasGuessedThisRound: false,
        roundPoints: 0,
      });
    } else {
      const bot = PINTURILLO_BOT_PROFILES[i % PINTURILLO_BOT_PROFILES.length];
      seats.push({
        seatIndex: i,
        userId: `bot-pinturillo-${i}`,
        name: bot.name,
        avatar: bot.avatar,
        color: bot.color,
        isBot: true,
        score: prev?.score || 0,
        streak: prev?.streak || 0,
        hasGuessedThisRound: false,
        roundPoints: 0,
      });
    }
  }
  return seats;
}

export function createInitialPinturilloState(
  humans: Array<{ id: string; name: string; avatar?: string; color?: string }>,
  preservedOrOpts?: PinturilloPlayer[] | { waitForHost?: boolean },
  opts?: { waitForHost?: boolean }
): PinturilloGameState {
  const preserved = Array.isArray(preservedOrOpts) ? preservedOrOpts : undefined;
  const resolvedOpts = Array.isArray(preservedOrOpts) ? opts : preservedOrOpts ?? opts;
  const players = buildPinturilloSeats(humans, preserved);
  const now = Date.now();
  const drawerSeat = 0;
  const wordChoices = pickRandomWordChoices();
  const waitForHost = Boolean(resolvedOpts?.waitForHost);

  return {
    id: `pinturillo-${now}`,
    gameType: 'pinturillo',
    status: waitForHost ? 'waiting' : 'choosing',
    players,
    round: 1,
    totalRounds: Math.min(6, Math.max(4, players.length)),
    drawerSeat,
    wordChoices,
    secretWord: null,
    maskedWord: '',
    wordLength: 0,
    hintIndices: [],
    strokes: [],
    guesses: [
      {
        id: `sys-start-${now}`,
        userId: 'system',
        userName: 'Pinturillo',
        text: waitForHost
          ? 'Esperando a que los jugadores de la sala acepten la invitación…'
          : `${players[drawerSeat].name} está eligiendo una palabra…`,
        kind: 'system',
        timestamp: now,
      },
    ],
    phaseDeadlineAt: waitForHost ? 0 : now + PINTURILLO_CHOOSE_MS,
    winnerSeat: null,
    updatedAt: now,
  };
}

export function joinPinturilloPlayer(
  state: PinturilloGameState,
  user: { id: string; name: string; avatar?: string; color?: string }
): PinturilloGameState {
  if (state.players.some((p) => !p.isBot && p.userId === user.id)) {
    return state;
  }
  const now = Date.now();
  const nextPlayers = state.players.map((p) => ({ ...p }));
  const botIdx = nextPlayers.findIndex((p) => p.isBot);
  if (botIdx !== -1) {
    nextPlayers[botIdx] = {
      seatIndex: botIdx,
      userId: user.id,
      name: user.name,
      avatar: user.avatar || '🎨',
      color: user.color || '#9146FF',
      isBot: false,
      score: 0,
      streak: 0,
      hasGuessedThisRound: false,
      roundPoints: 0,
    };
  } else if (nextPlayers.length < PINTURILLO_MAX_PLAYERS) {
    nextPlayers.push({
      seatIndex: nextPlayers.length,
      userId: user.id,
      name: user.name,
      avatar: user.avatar || '🎨',
      color: user.color || '#9146FF',
      isBot: false,
      score: 0,
      streak: 0,
      hasGuessedThisRound: false,
      roundPoints: 0,
    });
  } else {
    return state;
  }

  return {
    ...state,
    players: nextPlayers,
    totalRounds: Math.min(6, Math.max(4, nextPlayers.length)),
    guesses: [
      ...state.guesses.slice(-18),
      {
        id: `sys-join-${now}-${user.id}`,
        userId: 'system',
        userName: 'Pinturillo',
        text: `👋 ${user.name} se unió a Pinturillo`,
        kind: 'system',
        timestamp: now,
      },
    ],
    updatedAt: now,
  };
}

export function startPinturilloMatch(state: PinturilloGameState): PinturilloGameState {
  if (state.status !== 'waiting') return state;
  const now = Date.now();
  const drawer = state.players[state.drawerSeat] || state.players[0];
  return {
    ...state,
    status: 'choosing',
    phaseDeadlineAt: now + PINTURILLO_CHOOSE_MS,
    guesses: [
      ...state.guesses.slice(-18),
      {
        id: `sys-go-${now}`,
        userId: 'system',
        userName: 'Pinturillo',
        text: `🎨 ¡Comienza la partida! ${drawer?.name || 'Jugador'} elige palabra…`,
        kind: 'system',
        timestamp: now,
      },
    ],
    updatedAt: now,
  };
}

export function selectPinturilloWord(
  state: PinturilloGameState,
  actorUserId: string,
  wordId?: string
): { ok: true; state: PinturilloGameState } | { ok: false; error: string } {
  if (state.status !== 'choosing') {
    return { ok: false, error: 'Ya se eligió la palabra.' };
  }
  const drawer = state.players[state.drawerSeat];
  if (!drawer || (!drawer.isBot && drawer.userId !== actorUserId)) {
    return { ok: false, error: 'Solo quien dibuja elige la palabra.' };
  }

  const chosen =
    (wordId && state.wordChoices.find((w) => w.id === wordId)) ||
    state.wordChoices[0] ||
    PINTURILLO_WORDS[0];
  const now = Date.now();

  return {
    ok: true,
    state: {
      ...state,
      status: 'drawing',
      secretWord: chosen,
      maskedWord: formatMaskedWord(chosen.es, []),
      wordLength: chosen.es.replace(/\s+/g, '').length,
      hintIndices: [],
      strokes: [],
      guesses: [
        ...state.guesses.slice(-18),
        {
          id: `sys-draw-${now}`,
          userId: 'system',
          userName: 'Pinturillo',
          text: `🎨 ¡${drawer.name} empezó a dibujar! (${chosen.es.replace(/\s+/g, '').length} letras)`,
          kind: 'system',
          timestamp: now,
        },
      ],
      phaseDeadlineAt: now + PINTURILLO_ROUND_MS,
      updatedAt: now,
    },
  };
}

export function addPinturilloStroke(
  state: PinturilloGameState,
  actorUserId: string,
  stroke: PinturilloStroke
): { ok: true; state: PinturilloGameState } | { ok: false; error: string } {
  if (state.status !== 'drawing') {
    return { ok: false, error: 'La ronda de dibujo no está activa.' };
  }
  const drawer = state.players[state.drawerSeat];
  if (!drawer || (!drawer.isBot && drawer.userId !== actorUserId)) {
    return { ok: false, error: 'Solo quien dibuja puede pintar en el lienzo.' };
  }
  const cleanPoints = (stroke.points || []).slice(0, 400).map((p) => ({
    x: Math.max(0, Math.min(1, Number(p.x) || 0)),
    y: Math.max(0, Math.min(1, Number(p.y) || 0)),
  }));
  if (cleanPoints.length === 0) {
    return { ok: false, error: 'Trazo vacío.' };
  }

  const nextStroke: PinturilloStroke = {
    id: stroke.id || `st-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    color: stroke.color || '#18181B',
    size: Math.max(2, Math.min(28, Number(stroke.size) || 5)),
    isEraser: Boolean(stroke.isEraser),
    points: cleanPoints,
  };

  return {
    ok: true,
    state: {
      ...state,
      strokes: [...state.strokes.slice(-140), nextStroke],
      updatedAt: Date.now(),
    },
  };
}

export function undoPinturilloStroke(
  state: PinturilloGameState,
  actorUserId: string
): { ok: true; state: PinturilloGameState } | { ok: false; error: string } {
  if (state.status !== 'drawing') return { ok: false, error: 'No se puede deshacer ahora.' };
  const drawer = state.players[state.drawerSeat];
  if (!drawer || (!drawer.isBot && drawer.userId !== actorUserId)) {
    return { ok: false, error: 'Solo quien dibuja puede deshacer.' };
  }
  if (state.strokes.length === 0) return { ok: true, state };
  return {
    ok: true,
    state: {
      ...state,
      strokes: state.strokes.slice(0, -1),
      updatedAt: Date.now(),
    },
  };
}

export function clearPinturilloCanvas(
  state: PinturilloGameState,
  actorUserId: string
): { ok: true; state: PinturilloGameState } | { ok: false; error: string } {
  if (state.status !== 'drawing') return { ok: false, error: 'No se puede limpiar ahora.' };
  const drawer = state.players[state.drawerSeat];
  if (!drawer || (!drawer.isBot && drawer.userId !== actorUserId)) {
    return { ok: false, error: 'Solo quien dibuja puede limpiar.' };
  }
  return {
    ok: true,
    state: {
      ...state,
      strokes: [],
      updatedAt: Date.now(),
    },
  };
}

export function revealPinturilloHintIfDue(state: PinturilloGameState, now = Date.now()): PinturilloGameState {
  if (state.status !== 'drawing' || !state.secretWord) return state;
  const remainingMs = state.phaseDeadlineAt - now;
  const word = state.secretWord.es;
  const letterIndices = Array.from(word)
    .map((ch, i) => (ch === ' ' ? -1 : i))
    .filter((i) => i >= 0);
  if (letterIndices.length <= 2) return state;

  const targetHintCount = remainingMs <= 18_000 ? 2 : remainingMs <= 36_000 ? 1 : 0;
  if (state.hintIndices.length >= targetHintCount) return state;

  const nextHints = [...state.hintIndices];
  while (nextHints.length < targetHintCount) {
    const candidates = letterIndices.filter((i) => !nextHints.includes(i));
    if (candidates.length === 0) break;
    const pick = candidates[Math.floor((candidates.length - 1) / 2)];
    nextHints.push(pick);
  }

  return {
    ...state,
    hintIndices: nextHints,
    maskedWord: formatMaskedWord(word, nextHints),
    updatedAt: now,
  };
}

export function endPinturilloRound(state: PinturilloGameState, now = Date.now()): PinturilloGameState {
  if (state.status !== 'drawing' && state.status !== 'choosing') return state;
  const wordLabel = state.secretWord
    ? `${state.secretWord.es} (${state.secretWord.en})`
    : '—';

  const nextPlayers = state.players.map((pl, idx) =>
    idx !== state.drawerSeat && !pl.hasGuessedThisRound ? { ...pl, streak: 0 } : pl
  );

  return {
    ...state,
    status: 'round_end',
    players: nextPlayers,
    maskedWord: state.secretWord ? state.secretWord.es.toUpperCase() : state.maskedWord,
    guesses: [
      ...state.guesses.slice(-20),
      {
        id: `sys-end-${now}`,
        userId: 'system',
        userName: 'Pinturillo',
        text: `⏰ Fin de ronda · La palabra era: ${wordLabel}`,
        kind: 'system',
        timestamp: now,
      },
    ],
    phaseDeadlineAt: now + PINTURILLO_ROUND_END_MS,
    updatedAt: now,
  };
}

export function submitPinturilloGuess(
  state: PinturilloGameState,
  actorUserId: string,
  rawText: string
): {
  ok: true;
  outcome: 'correct' | 'close' | 'guess';
  roundCompleted: boolean;
  state: PinturilloGameState;
} | { ok: false; error: string } {
  if (state.status !== 'drawing' || !state.secretWord) {
    return { ok: false, error: 'Ahora no se puede adivinar.' };
  }
  const seatIdx = state.players.findIndex((p) => p.userId === actorUserId);
  if (seatIdx === -1) return { ok: false, error: 'No estás en la partida.' };
  if (seatIdx === state.drawerSeat) return { ok: false, error: 'El dibujante no puede adivinar.' };
  const player = state.players[seatIdx];
  if (player.hasGuessedThisRound) {
    return { ok: false, error: 'Ya adivinaste esta ronda.' };
  }

  const trimmed = rawText.trim().slice(0, 60);
  if (!trimmed) return { ok: false, error: 'Escribe una palabra.' };

  const normGuess = normalizePinturilloGuess(trimmed);
  const normEs = normalizePinturilloGuess(state.secretWord.es);
  const normEn = normalizePinturilloGuess(state.secretWord.en);
  const now = Date.now();

  const isExact = normGuess === normEs || normGuess === normEn;
  if (isExact) {
    const remainingRatio = Math.max(
      0,
      Math.min(1, (state.phaseDeadlineAt - now) / PINTURILLO_ROUND_MS)
    );
    const nextStreak = player.streak + 1;
    const streakBonus = nextStreak >= 2 ? Math.min(80, (nextStreak - 1) * 25) : 0;
    const guesserPts = 110 + Math.round(remainingRatio * 180) + streakBonus;
    const drawerPts = 55;

    const nextPlayers = state.players.map((pl, idx) => {
      if (idx === seatIdx) {
        return {
          ...pl,
          score: pl.score + guesserPts,
          streak: nextStreak,
          hasGuessedThisRound: true,
          roundPoints: pl.roundPoints + guesserPts,
        };
      }
      if (idx === state.drawerSeat) {
        return {
          ...pl,
          score: pl.score + drawerPts,
          roundPoints: pl.roundPoints + drawerPts,
        };
      }
      return pl;
    });

    const allGuessersDone = nextPlayers.every(
      (pl, idx) => idx === state.drawerSeat || pl.hasGuessedThisRound
    );

    const entry: PinturilloGuessEntry = {
      id: `g-${now}-${seatIdx}`,
      userId: player.userId,
      userName: player.name,
      text: `¡Acertó! (+${guesserPts} pts${nextStreak >= 2 ? ` · 🔥x${nextStreak}` : ''})`,
      kind: 'correct',
      pointsAwarded: guesserPts,
      timestamp: now,
    };

    const nextState: PinturilloGameState = {
      ...state,
      players: nextPlayers,
      guesses: [...state.guesses.slice(-24), entry],
      updatedAt: now,
    };

    if (allGuessersDone) {
      return {
        ok: true,
        outcome: 'correct',
        roundCompleted: true,
        state: endPinturilloRound(nextState, now),
      };
    }

    return {
      ok: true,
      outcome: 'correct',
      roundCompleted: false,
      state: nextState,
    };
  }

  const distEs = pinturilloLevenshtein(normGuess, normEs);
  const distEn = pinturilloLevenshtein(normGuess, normEn);
  const minDist = Math.min(distEs, distEn);
  const isClose =
    normGuess.length >= 3 &&
    (minDist <= 2 ||
      (normEs.length >= 4 && normEs.includes(normGuess)) ||
      (normEn.length >= 4 && normEn.includes(normGuess)));

  const entry: PinturilloGuessEntry = {
    id: `g-${now}-${seatIdx}-${Math.random().toString(36).slice(2, 5)}`,
    userId: player.userId,
    userName: player.name,
    text: isClose ? `${trimmed} · ¡Casi!` : trimmed,
    kind: isClose ? 'close' : 'guess',
    timestamp: now,
  };

  return {
    ok: true,
    outcome: isClose ? 'close' : 'guess',
    roundCompleted: false,
    state: {
      ...state,
      guesses: [...state.guesses.slice(-24), entry],
      updatedAt: now,
    },
  };
}

export function advancePinturilloRound(state: PinturilloGameState): PinturilloGameState {
  const now = Date.now();
  if (state.round >= state.totalRounds) {
    let bestIdx = 0;
    for (let i = 1; i < state.players.length; i += 1) {
      if (state.players[i].score > state.players[bestIdx].score) bestIdx = i;
    }
    return {
      ...state,
      status: 'finished',
      winnerSeat: bestIdx,
      updatedAt: now,
    };
  }

  const nextRound = state.round + 1;
  const nextDrawerSeat = (state.drawerSeat + 1) % state.players.length;
  const usedIds = state.secretWord ? [state.secretWord.id] : [];
  const wordChoices = pickRandomWordChoices(usedIds);

  return {
    ...state,
    status: 'choosing',
    round: nextRound,
    drawerSeat: nextDrawerSeat,
    wordChoices,
    secretWord: null,
    maskedWord: '',
    wordLength: 0,
    hintIndices: [],
    strokes: [],
    players: state.players.map((pl) => ({
      ...pl,
      hasGuessedThisRound: false,
      roundPoints: 0,
    })),
    guesses: [
      {
        id: `sys-r-${nextRound}-${now}`,
        userId: 'system',
        userName: 'Pinturillo',
        text: `Ronda ${nextRound}/${state.totalRounds} · ${state.players[nextDrawerSeat].name} elige palabra…`,
        kind: 'system',
        timestamp: now,
      },
    ],
    phaseDeadlineAt: now + PINTURILLO_CHOOSE_MS,
    updatedAt: now,
  };
}

export function pickBotPinturilloGuess(state: PinturilloGameState): {
  botUserId: string;
  guessText: string;
} | null {
  if (state.status !== 'drawing' || !state.secretWord) return null;
  const eligibleBots = state.players.filter(
    (pl, idx) => pl.isBot && idx !== state.drawerSeat && !pl.hasGuessedThisRound
  );
  if (eligibleBots.length === 0) return null;
  const bot = eligibleBots[Math.floor(Math.random() * eligibleBots.length)];

  const remainingMs = Math.max(0, state.phaseDeadlineAt - Date.now());
  const elapsedFraction = 1 - remainingMs / PINTURILLO_ROUND_MS;
  const solveChance = state.strokes.length >= 2 ? 0.14 + elapsedFraction * 0.45 : 0.05;
  if (Math.random() < solveChance) {
    return { botUserId: bot.userId, guessText: state.secretWord.es };
  }
  const wrong = PINTURILLO_BOT_FILLER_GUESSES[Math.floor(Math.random() * PINTURILLO_BOT_FILLER_GUESSES.length)];
  return { botUserId: bot.userId, guessText: wrong };
}

/**
 * Redacts the secret word from non-drawer guessers over the wire during active rounds
 * while keeping the masked word and strokes intact.
 */
export function redactPinturilloForUser(
  state: PinturilloGameState | null,
  viewerUserId: string
): PinturilloGameState | null {
  if (!state) return null;
  if (state.status === 'round_end' || state.status === 'finished') return state;
  const drawer = state.players[state.drawerSeat];
  if (drawer && !drawer.isBot && drawer.userId === viewerUserId) {
    return state;
  }
  return {
    ...state,
    wordChoices: [],
    secretWord: null,
  };
}

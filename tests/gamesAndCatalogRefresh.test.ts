import { describe, it, expect, beforeEach } from 'vitest';
import {
  applyBoardMove,
  BOARD_TURN_DECISION_MS,
  createInitialBoardGameState,
  findConnect4WinningLine,
  getConnect4DropRow,
} from '../src/shared/boardGames';
import {
  buildFourSeats,
  createInitialParchisState,
  createInitialUnoState,
  PARTY_TURN_DECISION_MS,
  preserveSeatsForRematch,
} from '../src/shared/partyGames';
import { getUnoCardSvgSrc, UNO_CARD_BACK_SRC } from '../src/assets/uno';
import {
  getCatalogRefreshStatus,
  indexedCatalogCache,
  normalizeCatalogQuery,
  scoreTitleRelevance,
  searchIndexedCatalog,
  startCatalogRefreshScheduler,
  upsertIndexedEntry,
} from '../server/services/catalogRefreshService';

describe('Games Upgrades & Extraction Catalog Refresh', () => {
  it('enforces 15-second turn decision timers across party and board games', () => {
    expect(PARTY_TURN_DECISION_MS).toBe(15_000);
    expect(BOARD_TURN_DECISION_MS).toBe(15_000);
  });

  it('preserves active human seats across Parchís and UNO rematches without bot replacement', () => {
    const alice = { id: 'u-alice', name: 'Alice', avatar: '👩' };
    const bob = { id: 'u-bob', name: 'Bob', avatar: '🧑' };
    const initialSeats = buildFourSeats([alice, bob]);

    expect(initialSeats[0].isBot).toBe(false);
    expect(initialSeats[0].userId).toBe('u-alice');
    expect(initialSeats[1].isBot).toBe(false);
    expect(initialSeats[1].userId).toBe('u-bob');
    expect(initialSeats[2].isBot).toBe(true);
    expect(initialSeats[3].isBot).toBe(true);

    const preserved = preserveSeatsForRematch(initialSeats, [alice, bob]);
    expect(preserved[0].isBot).toBe(false);
    expect(preserved[0].userId).toBe('u-alice');
    expect(preserved[1].isBot).toBe(false);
    expect(preserved[1].userId).toBe('u-bob');

    const parchisRematch = createInitialParchisState([alice, bob], preserved);
    expect(parchisRematch.players[0].userId).toBe('u-alice');
    expect(parchisRematch.players[1].userId).toBe('u-bob');
    expect(parchisRematch.players[0].isBot).toBe(false);

    const unoRematch = createInitialUnoState([alice, bob], preserved);
    expect(unoRematch.players[0].userId).toBe('u-alice');
    expect(unoRematch.players[1].userId).toBe('u-bob');
    expect(unoRematch.players[0].isBot).toBe(false);
  });

  it('computes Connect 4 winningLine coordinates and flags Checkers promotion in lastMove', () => {
    const p1 = { id: 'p1', name: 'Naim', avatar: '🎮', color: '#9146FF', isHost: true };
    const p2 = { id: 'p2', name: 'Sara', avatar: '🔥', color: '#E11D48', isHost: false };
    let c4 = createInitialBoardGameState('connect4', p1, [p1, p2], false, 0);

    for (let step = 0; step < 3; step += 1) {
      const rW = getConnect4DropRow(c4.board, step);
      const resW = applyBoardMove(c4, 'p1', { r: 0, c: step }, { r: rW, c: step });
      expect(resW.ok).toBe(true);
      if (resW.ok) c4 = resW.state;

      const rB = getConnect4DropRow(c4.board, 6);
      const resB = applyBoardMove(c4, 'p2', { r: 0, c: 6 }, { r: rB, c: 6 });
      expect(resB.ok).toBe(true);
      if (resB.ok) c4 = resB.state;
    }

    const rWin = getConnect4DropRow(c4.board, 3);
    const winRes = applyBoardMove(c4, 'p1', { r: 0, c: 3 }, { r: rWin, c: 3 });
    expect(winRes.ok).toBe(true);
    if (winRes.ok) {
      expect(winRes.state.status).toBe('finished');
      expect(winRes.state.winner).toBe('w');
      expect(winRes.state.winningLine).toHaveLength(4);
      expect(findConnect4WinningLine(winRes.state.board, 'w')).toHaveLength(4);
    }

    const emptyBoard = Array.from({ length: 8 }, () => Array<string | null>(8).fill(null));
    emptyBoard[1][2] = 'w';
    emptyBoard[5][4] = 'b';
    const checkers = {
      ...createInitialBoardGameState('checkers', p1, true),
      board: emptyBoard,
      turn: 'w' as const,
    };
    const promo = applyBoardMove(checkers, 'p1', { r: 1, c: 2 }, { r: 0, c: 3 });
    expect(promo.ok).toBe(true);
    if (promo.ok) {
      expect(promo.state.board[0][3]).toBe('W');
      expect(promo.state.lastMove?.promoted).toBe(true);
    }
  });

  it('resolves official UNO vector SVG assets for every card variant', () => {
    expect(UNO_CARD_BACK_SRC).toBeTruthy();
    expect(getUnoCardSvgSrc('red', '7')).toBeTruthy();
    expect(getUnoCardSvgSrc('blue', 'skip')).toBeTruthy();
    expect(getUnoCardSvgSrc('yellow', 'reverse')).toBeTruthy();
    expect(getUnoCardSvgSrc('green', 'draw2')).toBeTruthy();
    expect(getUnoCardSvgSrc('wild', 'wild')).toBeTruthy();
    expect(getUnoCardSvgSrc('wild', 'wild4')).toBeTruthy();
  });

  describe('Catalog Refresh & Title Resolution', () => {
    beforeEach(() => {
      indexedCatalogCache.clear();
    });

    it('scores exact originalTitle and localized title far higher than unrelated fuzzy hits', () => {
      expect(normalizeCatalogQuery('  You Can See Everything! (2026)  ')).toBe(
        'you can see everything'
      );

      const exactScore = scoreTitleRelevance(
        'Puedes verlo todo',
        'You Can See Everything',
        'You Can See Everything',
        { popularity: 58.5 }
      );
      const unrelatedScore = scoreTitleRelevance(
        'Amanece, que no es poco',
        'Amanece, que no es poco',
        'You Can See Everything',
        { popularity: 120 }
      );

      expect(exactScore).toBeGreaterThan(600);
      expect(unrelatedScore).toBe(0);
    });

    it('indexes and retrieves titles across localized and original names', () => {
      upsertIndexedEntry({
        id: 'bingetrix-1765072',
        tmdbId: 1765072,
        mediaType: 'movie',
        title: 'Puedes verlo todo',
        originalTitle: 'You Can See Everything',
        altTitle: 'You Can See Everything',
        year: '2026',
        rating: '7.4',
        overview: 'Feature film indexed from extraction providers.',
        poster: 'https://image.tmdb.org/t/p/w500/example.jpg',
        backdrop: 'https://image.tmdb.org/t/p/w1280/example-bg.jpg',
        bingetrixUrl: 'https://bingetrix.sc/movie/1765072',
        languages: ['VOSE', 'Latino'],
        sources: ['bingetrix', 'tmdb'],
        popularity: 58.5,
        indexedAt: Date.now(),
      });

      const byEnglish = searchIndexedCatalog('You Can See Everything', { mediaType: 'movie' });
      expect(byEnglish).toHaveLength(1);
      expect(byEnglish[0].tmdbId).toBe(1765072);
      expect(byEnglish[0].sources).toContain('bingetrix');

      const bySpanish = searchIndexedCatalog('Puedes verlo todo', { mediaType: 'movie' });
      expect(bySpanish).toHaveLength(1);
      expect(bySpanish[0].tmdbId).toBe(1765072);
    });

    it('keeps background scheduler disabled when NODE_ENV === test', () => {
      startCatalogRefreshScheduler(60_000);
      const status = getCatalogRefreshStatus();
      expect(status.schedulerRunning).toBe(false);
    });
  });
});

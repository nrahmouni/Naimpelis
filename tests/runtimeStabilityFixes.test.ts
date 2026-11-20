import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runWithViewTransition } from '../src/lib/viewTransition';
import { isChunkOrModuleLoadError } from '../src/utils/lazyWithRetry';
import {
  deriveAppControllerLayoutFlags,
  shouldShowSeriesEpisodesDock,
} from '../src/hooks/appControllerHelpers';
import { getColumnCount } from '../src/components/VirtualizedPosterGrid';
import type { VideoState } from '../src/types';

function makeVideoState(overrides: Partial<VideoState> = {}): VideoState {
  return {
    mode: 'idle',
    url: '',
    rawSourceUrl: '',
    title: '',
    subtitle: '',
    currentTime: 0,
    isPlaying: false,
    isLive: false,
    tracks: [],
    activeTrackIndex: 0,
    lastUpdated: 0,
    updatedBy: 'tester',
    ...overrides,
  };
}

describe('runtime stability fixes', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete (globalThis as Record<string, unknown>).document;
    delete (globalThis as Record<string, unknown>).window;
  });

  it('skips startViewTransition when document is hidden and runs update synchronously', () => {
    const startViewTransition = vi.fn();
    (globalThis as Record<string, unknown>).document = {
      hidden: true,
      visibilityState: 'hidden',
      documentElement: { dataset: {} },
      startViewTransition,
    };
    const update = vi.fn();
    runWithViewTransition(update);
    expect(update).toHaveBeenCalledTimes(1);
    expect(startViewTransition).not.toHaveBeenCalled();
  });

  it('attaches catch handlers to ViewTransition promises to prevent unhandled rejections', async () => {
    const readyReject = Promise.reject(
      new DOMException('Transition was aborted because of invalid state. Viewport size changed', 'InvalidStateError')
    );
    const finishedReject = Promise.reject(
      new DOMException('Transition was skipped. New ViewTransition started', 'AbortError')
    );
    const updateReject = Promise.reject(new Error('aborted'));

    const startViewTransition = vi.fn((cb: () => void) => {
      cb();
      return {
        ready: readyReject,
        finished: finishedReject,
        updateCallbackDone: updateReject,
        skipTransition: vi.fn(),
      };
    });

    (globalThis as Record<string, unknown>).document = {
      hidden: false,
      visibilityState: 'visible',
      documentElement: { dataset: {} },
      startViewTransition,
    };

    const update = vi.fn();
    runWithViewTransition(update);
    expect(update).toHaveBeenCalledTimes(1);
    expect(startViewTransition).toHaveBeenCalledTimes(1);

    await Promise.allSettled([readyReject, finishedReject, updateReject]);
  });

  it('recognizes dynamic module fetch failures as chunk/module load errors', () => {
    expect(
      isChunkOrModuleLoadError(
        new TypeError('Failed to fetch dynamically imported module: https://example.com/LiveTvWorldView.tsx')
      )
    ).toBe(true);
  });

  it('keeps browse hidden and SeriesEpisodesDock mounted while extracting next series episode', () => {
    const extractingSeriesVideo = makeVideoState({
      mode: 'hls',
      url: '',
      title: 'Serie · 1x02',
      seriesMeta: {
        tmdbId: 1396,
        seriesTitle: 'Serie',
        season: 1,
        episode: 2,
      },
    });

    const layoutFlags = deriveAppControllerLayoutFlags({
      activeWorld: 'cine',
      videoState: extractingSeriesVideo,
      isExtracting: true,
      isPlayerClosedLocally: false,
      isPlayerMinimized: false,
      isAutoMiniByScroll: false,
      pinFullPlayerOnChat: true,
      isCinemaMode: false,
      participants: [],
      isDesktopLayout: true,
      isMobileKeyboardOpen: false,
      isMobileLandscape: false,
      mobileTab: 'home',
      floatingChatOpen: false,
      isFloatingRoomOpen: false,
      activeSportsMatch: null,
      activeMovieContext: null,
      isInActiveGame: false,
    });

    expect(layoutFlags.isPlayerActive).toBe(true);
    expect(layoutFlags.hideBrowseBelowPlayer).toBe(true);

    expect(
      shouldShowSeriesEpisodesDock({
        videoState: extractingSeriesVideo,
        isExtracting: true,
        isPlayerClosedLocally: false,
        isPlayerMinimized: false,
        isAutoImmersiveLandscape: false,
      })
    ).toBe(true);
  });

  it('keeps SeriesEpisodesDock mounted even when starting series extraction from idle and hides browse once cancelled', () => {
    const idleStartingSeries = makeVideoState({
      mode: 'idle',
      url: '',
      seriesMeta: {
        tmdbId: 1396,
        seriesTitle: 'Serie',
        season: 1,
        episode: 1,
      },
    });

    expect(
      shouldShowSeriesEpisodesDock({
        videoState: idleStartingSeries,
        isExtracting: true,
        isPlayerClosedLocally: false,
        isPlayerMinimized: false,
        isAutoImmersiveLandscape: false,
      })
    ).toBe(true);

    const cancelledIdle = makeVideoState({ mode: 'idle', url: '' });
    const cancelledFlags = deriveAppControllerLayoutFlags({
      activeWorld: 'cine',
      videoState: cancelledIdle,
      isExtracting: false,
      isPlayerClosedLocally: false,
      isPlayerMinimized: false,
      isAutoMiniByScroll: false,
      pinFullPlayerOnChat: true,
      isCinemaMode: false,
      participants: [],
      isDesktopLayout: true,
      isMobileKeyboardOpen: false,
      isMobileLandscape: false,
      mobileTab: 'home',
      floatingChatOpen: false,
      isFloatingRoomOpen: false,
      activeSportsMatch: null,
      activeMovieContext: null,
      isInActiveGame: false,
    });

    expect(cancelledFlags.isPlayerActive).toBe(false);
    expect(cancelledFlags.hideBrowseBelowPlayer).toBe(false);
    expect(
      shouldShowSeriesEpisodesDock({
        videoState: cancelledIdle,
        isExtracting: false,
        isPlayerClosedLocally: false,
        isPlayerMinimized: false,
        isAutoImmersiveLandscape: false,
      })
    ).toBe(false);
  });

  it('computes deterministic column counts for virtualized poster grids', () => {
    expect(getColumnCount(390, 'poster')).toBe(2);
    expect(getColumnCount(520, 'poster')).toBe(3);
    expect(getColumnCount(768, 'poster')).toBe(4);
    expect(getColumnCount(1024, 'poster')).toBe(5);
    expect(getColumnCount(1400, 'poster')).toBe(6);
    expect(getColumnCount(1200, 'wide')).toBe(3);
    expect(getColumnCount(1200, 'list')).toBe(1);
  });

  it('ensures every useEffect and useLayoutEffect in src/ specifies a dependency array', () => {
    const srcRoot = path.resolve(process.cwd(), 'src');
    const walk = (dir: string): string[] => {
      const out: string[] = [];
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...walk(fullPath));
        else if (/\.(ts|tsx)$/.test(entry.name)) out.push(fullPath);
      }
      return out;
    };

    const missingDeps: string[] = [];
    for (const file of walk(srcRoot)) {
      const src = fs.readFileSync(file, 'utf8');
      const re = /(?:React\.)?(useEffect|useLayoutEffect)\s*\(/g;
      let match: RegExpExecArray | null;
      while ((match = re.exec(src))) {
        let i = re.lastIndex - 1;
        let depth = 0;
        let inStr: string | null = null;
        let inComment: 'line' | 'block' | null = null;
        for (; i < src.length; i++) {
          const c = src[i];
          const n = src[i + 1];
          if (inComment === 'line') {
            if (c === '\n') inComment = null;
            continue;
          }
          if (inComment === 'block') {
            if (c === '*' && n === '/') {
              inComment = null;
              i++;
            }
            continue;
          }
          if (inStr) {
            if (c === '\\') {
              i++;
              continue;
            }
            if (c === inStr) inStr = null;
            continue;
          }
          if (c === '/' && n === '/') {
            inComment = 'line';
            i++;
            continue;
          }
          if (c === '/' && n === '*') {
            inComment = 'block';
            i++;
            continue;
          }
          if (c === '"' || c === "'" || c === '`') {
            inStr = c;
            continue;
          }
          if (c === '(') depth++;
          else if (c === ')') {
            depth--;
            if (depth === 0) break;
          }
        }

        const callBody = src.slice(match.index, i + 1);
        let innerDepth = 0;
        let hasDepsArg = false;
        inStr = null;
        inComment = null;
        for (let j = callBody.indexOf('('); j < callBody.length; j++) {
          const c = callBody[j];
          const n = callBody[j + 1];
          if (inComment === 'line') {
            if (c === '\n') inComment = null;
            continue;
          }
          if (inComment === 'block') {
            if (c === '*' && n === '/') {
              inComment = null;
              j++;
            }
            continue;
          }
          if (inStr) {
            if (c === '\\') {
              j++;
              continue;
            }
            if (c === inStr) inStr = null;
            continue;
          }
          if (c === '/' && n === '/') {
            inComment = 'line';
            j++;
            continue;
          }
          if (c === '/' && n === '*') {
            inComment = 'block';
            j++;
            continue;
          }
          if (c === '"' || c === "'" || c === '`') {
            inStr = c;
            continue;
          }
          if (c === '(' || c === '[' || c === '{') innerDepth++;
          else if (c === ')' || c === ']' || c === '}') innerDepth--;
          else if (c === ',' && innerDepth === 1) {
            hasDepsArg = true;
            break;
          }
        }

        if (!hasDepsArg) {
          const line = src.slice(0, match.index).split('\n').length;
          missingDeps.push(`${path.relative(srcRoot, file)}:${line}`);
        }
      }
    }

    expect(missingDeps).toEqual([]);
  });

  it('prevents setState and unstable callback loops in invite banner, discovery section, and games hub', () => {
    const readSrc = (rel: string) => fs.readFileSync(path.resolve(process.cwd(), rel), 'utf8');

    const bannerSrc = readSrc('src/components/friends/GlobalIncomingInviteBanner.tsx');
    expect(bannerSrc).toContain('onDismissFriendNoticeRef');
    expect(bannerSrc).toContain('setSavingBack((prev) => (prev ? false : prev))');
    expect(bannerSrc).not.toMatch(/\[\s*friendAddedNotice\s*,\s*onDismissFriendNotice\s*\]/);

    const discoverySrc = readSrc('src/components/ExpandedDiscoverySection.tsx');
    expect(discoverySrc).toContain('onGenresLoadedRef');
    expect(discoverySrc).toContain('setDiscoverItems((prev) => (prev.length === 0 ? prev : []))');

    const gamesSrc = readSrc('src/components/games/useGamesHubController.ts');
    expect(gamesSrc).toContain('onSelectedGameChangeRef');
    expect(gamesSrc).not.toMatch(/\[\s*selectedGame\s*,\s*onSelectedGameChange\s*\]/);

    const partyGamesSrc = readSrc('src/components/PartyGamesStage.tsx');
    expect(partyGamesSrc).toContain('onActiveStateChangeRef');
    expect(partyGamesSrc).not.toMatch(/\[\s*activeState\s*,\s*onActiveStateChange\s*\]/);
  });
});

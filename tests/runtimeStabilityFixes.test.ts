import { afterEach, describe, expect, it, vi } from 'vitest';
import { runWithViewTransition } from '../src/lib/viewTransition';
import { isChunkOrModuleLoadError } from '../src/utils/lazyWithRetry';

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
});

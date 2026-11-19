import type React from 'react';

export function getPlayerSectionClass(opts: {
  isTvMode: boolean;
  isMinimized: boolean;
  isCinemaMode: boolean;
}): string {
  if (opts.isTvMode) return 'w-full h-screen h-full overflow-hidden bg-black';
  if (opts.isMinimized) {
    return 'w-full overflow-hidden bg-black rounded-2xl border border-white/20 shadow-[0_24px_70px_rgba(0,0,0,0.9)]';
  }
  if (opts.isCinemaMode) return 'w-full bg-transparent';
  return 'w-full overflow-hidden bg-black lg:rounded-2xl lg:border lg:border-white/[0.08] lg:shadow-2xl lg:shadow-black/60';
}

export function getStageWrapperStyle(isStageFullscreen: boolean): React.CSSProperties | undefined {
  if (!isStageFullscreen) return undefined;
  return {
    position: 'fixed',
    inset: 0,
    width: '100vw',
    height: '100vh',
    zIndex: 250,
    borderRadius: 0,
  };
}

export function getStageWrapperClass(opts: {
  isTvMode: boolean;
  isStageFullscreen: boolean;
  compactVideoForMobileKeyboard: boolean;
  isCompressed: boolean;
  isMinimized: boolean;
  isCinemaMode: boolean;
}): string {
  const heightCls =
    opts.isTvMode || opts.isStageFullscreen
      ? 'h-full'
      : opts.compactVideoForMobileKeyboard
      ? 'h-[122px] sm:aspect-video'
      : opts.isCompressed && !opts.isMinimized
      ? 'h-[136px] sm:h-[210px] lg:h-[238px]'
      : 'aspect-video';

  const cinemaRingCls =
    opts.isCinemaMode &&
    !opts.isMinimized &&
    !opts.isCompressed &&
    !opts.isTvMode &&
    !opts.isStageFullscreen
      ? 'z-50 lg:rounded-2xl ring-1 ring-white/15 shadow-[0_24px_90px_rgba(0,0,0,0.96)]'
      : '';

  return `relative w-full bg-black overflow-hidden select-none transition-[height] duration-200 ${heightCls} ${cinemaRingCls}`;
}

export function createStagePointerHandlers(opts: {
  isMinimized: boolean;
  lastManualHideAtRef: React.MutableRefObject<number>;
  lastMousePosRef: React.MutableRefObject<{ x: number; y: number } | null>;
  showControlsRef: React.MutableRefObject<boolean>;
  revealControls: () => void;
  scheduleHideControls: () => void;
}) {
  return {
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
      if (opts.isMinimized) return;
      if (e.pointerType === 'mouse') {
        if (Date.now() - opts.lastManualHideAtRef.current < 350) return;
        const prev = opts.lastMousePosRef.current;
        if (
          prev &&
          Math.hypot(e.clientX - prev.x, e.clientY - prev.y) < 6 &&
          !opts.showControlsRef.current
        ) {
          return;
        }
        opts.lastMousePosRef.current = { x: e.clientX, y: e.clientY };
        opts.revealControls();
      }
    },
    onPointerDownCapture: () => {
      if (opts.showControlsRef.current) opts.scheduleHideControls();
    },
    onPointerMoveCapture: (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerType !== 'mouse' && opts.showControlsRef.current) opts.scheduleHideControls();
    },
  };
}

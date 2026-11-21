import React, { useCallback, useMemo, useRef, useState } from 'react';
import { triggerHaptic } from '../utils/haptics';
import type { VideoState } from '../types';

export type MiniCorner = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';

interface UseMiniPlayerDragOptions {
  isDockedMini: boolean;
  isExtracting: boolean;
  isPlayerClosedLocally: boolean;
  videoMode: VideoState['mode'];
  isMobileKeyboardOpen: boolean;
}

export function useMiniPlayerDrag({
  isDockedMini,
  isExtracting,
  isPlayerClosedLocally,
  videoMode,
  isMobileKeyboardOpen,
}: UseMiniPlayerDragOptions) {
  const [isAutoMiniByScroll, setIsAutoMiniByScroll] = useState<boolean>(false);
  const [miniCorner, setMiniCorner] = useState<MiniCorner>('bottom-right');
  const [miniDragOffset, setMiniDragOffset] = useState<{ x: number; y: number } | null>(null);
  const miniDragStartRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    rectLeft: number;
    rectTop: number;
    rectWidth: number;
    rectHeight: number;
  } | null>(null);

  const handleCatalogOrWorkspaceScroll = useCallback(
    (_e: React.UIEvent<HTMLDivElement>) => {
      if (isAutoMiniByScroll) {
        setIsAutoMiniByScroll(false);
      }
    },
    [isAutoMiniByScroll]
  );

  const handleMiniPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDockedMini) return;
      const targetEl = e.target as HTMLElement | null;
      if (targetEl?.closest('button, input, a')) return;
      const rect = e.currentTarget.getBoundingClientRect();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      miniDragStartRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        rectLeft: rect.left,
        rectTop: rect.top,
        rectWidth: rect.width,
        rectHeight: rect.height,
      };
    },
    [isDockedMini]
  );

  const handleMiniPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = miniDragStartRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    setMiniDragOffset({ x: dx, y: dy });
  }, []);

  const handleMiniPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = miniDragStartRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // ignore
    }
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    const centerX = drag.rectLeft + dx + drag.rectWidth / 2;
    const centerY = drag.rectTop + dy + drag.rectHeight / 2;
    const isRight = centerX >= window.innerWidth / 2;
    const isBottom = centerY >= window.innerHeight / 2;
    const nextCorner: MiniCorner = isBottom
      ? isRight
        ? 'bottom-right'
        : 'bottom-left'
      : isRight
      ? 'top-right'
      : 'top-left';
    if (Math.hypot(dx, dy) > 8) {
      triggerHaptic('light');
    }
    setMiniCorner(nextCorner);
    setMiniDragOffset(null);
    miniDragStartRef.current = null;
  }, []);

  const miniCornerPositionClasses = useMemo(() => {
    switch (miniCorner) {
      case 'top-left':
        return 'top-[68px] left-3 sm:top-20 sm:left-5';
      case 'top-right':
        return 'top-[68px] right-3 sm:top-20 sm:right-5';
      case 'bottom-left':
        return isMobileKeyboardOpen
          ? 'bottom-16 left-3'
          : 'bottom-[86px] left-3 sm:bottom-6 sm:left-5';
      case 'bottom-right':
      default:
        return isMobileKeyboardOpen
          ? 'bottom-16 right-3'
          : 'bottom-[86px] right-3 sm:bottom-6 sm:right-5';
    }
  }, [miniCorner, isMobileKeyboardOpen]);

  return useMemo(
    () => ({
      isAutoMiniByScroll,
      setIsAutoMiniByScroll,
      miniDragOffset,
      miniCornerPositionClasses,
      handleCatalogOrWorkspaceScroll,
      handleMiniPointerDown,
      handleMiniPointerMove,
      handleMiniPointerUp,
    }),
    [
      isAutoMiniByScroll,
      miniDragOffset,
      miniCornerPositionClasses,
      handleCatalogOrWorkspaceScroll,
      handleMiniPointerDown,
      handleMiniPointerMove,
      handleMiniPointerUp,
    ]
  );
}

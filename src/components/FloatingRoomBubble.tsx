import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowUpRight,
  GripHorizontal,
  Maximize2,
  MessageSquare,
  Mic,
  Minimize2,
  X,
} from 'lucide-react';
import type { AppLanguage } from '../types';
import { pickLang } from '../utils/i18n';
import { triggerHaptic } from '../utils/haptics';

interface FloatingRoomBubbleProps {
  lang: AppLanguage;
  visible: boolean;
  participantsCount: number;
  voiceActive: boolean;
  unreadCount?: number;
  isSheetOpen: boolean;
  onOpenSheet: () => void;
  onCloseSheet: () => void;
  onOpenFullSala: () => void;
  dockedInMiniPlayer?: boolean;
  dockedBelowPlayer?: boolean;
  children: React.ReactNode;
}

const ORB_SIZE = 52;
const MARGIN = 10;

function getDefaultOrbPos(): { x: number; y: number } {
  if (typeof window === 'undefined') return { x: 280, y: 520 };
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  return {
    x: Math.max(MARGIN, vw - ORB_SIZE - 16),
    y: Math.max(MARGIN, vh - ORB_SIZE - (vw < 768 ? 22 : 24)),
  };
}

function getDefaultWindowBounds(): { x: number; y: number; w: number; h: number } {
  if (typeof window === 'undefined') return { x: 16, y: 260, w: 340, h: 330 };
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = Math.min(370, vw - MARGIN * 2);
  const h = Math.min(340, Math.round(vh * 0.46));
  const x = vw < 640 ? Math.round((vw - w) / 2) : vw - w - 20;
  const y = Math.max(MARGIN, vh - h - (vw < 768 ? 78 : 20));
  return { x, y, w, h };
}

export const FloatingRoomBubble: React.FC<FloatingRoomBubbleProps> = ({
  lang,
  visible,
  participantsCount,
  voiceActive,
  unreadCount = 0,
  isSheetOpen,
  onOpenSheet,
  onCloseSheet,
  onOpenFullSala,
  dockedBelowPlayer = false,
  children,
}) => {
  const [orbPos, setOrbPos] = useState<{ x: number; y: number }>(() => getDefaultOrbPos());
  const [winBounds, setWinBounds] = useState<{ x: number; y: number; w: number; h: number }>(() =>
    getDefaultWindowBounds()
  );

  // Keep positions safely inside viewport on window resize / keyboard / orientation changes
  useEffect(() => {
    const clampAll = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      setOrbPos((prev) => ({
        x: Math.min(Math.max(MARGIN, prev.x), Math.max(MARGIN, vw - ORB_SIZE - MARGIN)),
        y: Math.min(Math.max(MARGIN, prev.y), Math.max(MARGIN, vh - ORB_SIZE - MARGIN)),
      }));
      setWinBounds((prev) => {
        const w = Math.min(prev.w, Math.max(260, vw - MARGIN * 2));
        const h = Math.min(prev.h, Math.max(220, vh - MARGIN * 2));
        return {
          w,
          h,
          x: Math.min(Math.max(MARGIN, prev.x), Math.max(MARGIN, vw - w - MARGIN)),
          y: Math.min(Math.max(MARGIN, prev.y), Math.max(MARGIN, vh - h - MARGIN)),
        };
      });
    };
    window.addEventListener('resize', clampAll);
    return () => window.removeEventListener('resize', clampAll);
  }, []);

  // Re-anchor window at bottom nicely if viewport changed significantly when opening
  const prevOpenRef = useRef(isSheetOpen);
  useEffect(() => {
    if (isSheetOpen && !prevOpenRef.current && typeof window !== 'undefined') {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      setWinBounds((prev) => {
        const w = Math.min(prev.w, Math.max(260, vw - MARGIN * 2));
        const h = Math.min(prev.h, Math.max(220, vh - MARGIN * 2));
        return {
          w,
          h,
          x: Math.min(Math.max(MARGIN, prev.x), Math.max(MARGIN, vw - w - MARGIN)),
          y: Math.min(Math.max(MARGIN, prev.y), Math.max(MARGIN, vh - h - MARGIN)),
        };
      });
    }
    prevOpenRef.current = isSheetOpen;
  }, [isSheetOpen]);

  // ---------------------------------------------------------------------------
  // Draggable Orb Gesture
  // ---------------------------------------------------------------------------
  const orbDragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    moved: boolean;
  } | null>(null);

  const handleOrbPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    orbDragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origX: orbPos.x,
      origY: orbPos.y,
      moved: false,
    };
  };

  const handleOrbPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const drag = orbDragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (Math.hypot(dx, dy) > 6) drag.moved = true;
    if (!drag.moved) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    setOrbPos({
      x: Math.min(Math.max(MARGIN, drag.origX + dx), Math.max(MARGIN, vw - ORB_SIZE - MARGIN)),
      y: Math.min(Math.max(MARGIN, drag.origY + dy), Math.max(MARGIN, vh - ORB_SIZE - MARGIN)),
    });
  };

  const handleOrbPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const drag = orbDragRef.current;
    orbDragRef.current = null;
    if (!drag) return;
    if (!drag.moved) {
      triggerHaptic('light');
      onOpenSheet();
    } else {
      triggerHaptic('light');
      // Softly release pointer capture if needed
      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch {}
    }
  };

  // ---------------------------------------------------------------------------
  // Draggable Floating Chat Window Header Gesture
  // ---------------------------------------------------------------------------
  const winDragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);

  const handleWinDragDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    winDragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origX: winBounds.x,
      origY: winBounds.y,
    };
  };

  const handleWinDragMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = winDragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    setWinBounds((prev) => ({
      ...prev,
      x: Math.min(Math.max(MARGIN, drag.origX + dx), Math.max(MARGIN, vw - prev.w - MARGIN)),
      y: Math.min(Math.max(MARGIN, drag.origY + dy), Math.max(MARGIN, vh - prev.h - MARGIN)),
    }));
  };

  const handleWinDragUp = () => {
    winDragRef.current = null;
  };

  // ---------------------------------------------------------------------------
  // Resizable Corner Handle Gesture (Top-Left or Bottom-Right)
  // ---------------------------------------------------------------------------
  const resizeRef = useRef<{
    pointerId: number;
    corner: 'tl' | 'br';
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    origW: number;
    origH: number;
  } | null>(null);

  const handleResizeDown = (corner: 'tl' | 'br', e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    resizeRef.current = {
      pointerId: e.pointerId,
      corner,
      startX: e.clientX,
      startY: e.clientY,
      origX: winBounds.x,
      origY: winBounds.y,
      origW: winBounds.w,
      origH: winBounds.h,
    };
  };

  const handleResizeMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = resizeRef.current;
    if (!r || r.pointerId !== e.pointerId) return;
    const dx = e.clientX - r.startX;
    const dy = e.clientY - r.startY;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const minW = 260;
    const maxW = Math.min(560, vw - MARGIN * 2);
    const minH = 220;
    const maxH = Math.min(680, Math.round(vh * 0.84));

    if (r.corner === 'br') {
      const nextW = Math.min(maxW, Math.max(minW, r.origW + dx));
      const nextH = Math.min(maxH, Math.max(minH, r.origH + dy));
      setWinBounds((prev) => ({
        ...prev,
        w: Math.min(nextW, vw - prev.x - MARGIN),
        h: Math.min(nextH, vh - prev.y - MARGIN),
      }));
    } else {
      const rawW = r.origW - dx;
      const rawH = r.origH - dy;
      const nextW = Math.min(maxW, Math.max(minW, rawW));
      const nextH = Math.min(maxH, Math.max(minH, rawH));
      const nextX = Math.max(MARGIN, r.origX + (r.origW - nextW));
      const nextY = Math.max(MARGIN, r.origY + (r.origH - nextH));
      setWinBounds({
        x: nextX,
        y: nextY,
        w: Math.min(nextW, vw - nextX - MARGIN),
        h: Math.min(nextH, vh - nextY - MARGIN),
      });
    }
  };

  const handleResizeUp = () => {
    resizeRef.current = null;
  };

  const toggleExpandPreset = useCallback(() => {
    if (typeof window === 'undefined') return;
    triggerHaptic('light');
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    setWinBounds((prev) => {
      const isExpanded = prev.h > vh * 0.56 || prev.w > 410;
      const nextW = isExpanded
        ? Math.min(340, vw - MARGIN * 2)
        : Math.min(460, vw - MARGIN * 2);
      const nextH = isExpanded
        ? Math.min(310, Math.round(vh * 0.42))
        : Math.min(540, Math.round(vh * 0.7));
      const nextX = Math.min(Math.max(MARGIN, prev.x), Math.max(MARGIN, vw - nextW - MARGIN));
      const nextY = Math.min(
        Math.max(MARGIN, prev.y + (prev.h - nextH)),
        Math.max(MARGIN, vh - nextH - MARGIN)
      );
      return { x: nextX, y: nextY, w: nextW, h: nextH };
    });
  }, []);

  if (!visible || typeof document === 'undefined') return null;
  // When docked below active player, the chat opens directly under the player in the page flow
  if (dockedBelowPlayer && isSheetOpen) return null;

  const isExpanded =
    typeof window !== 'undefined' &&
    (winBounds.h > window.innerHeight * 0.56 || winBounds.w > 410);

  return createPortal(
    <>
      {/* 1. SEMI-TRANSPARENT DRAGGABLE FLOATING ORB AT BOTTOM (WHEN CLOSED) */}
      {!isSheetOpen && (
        <button
          type="button"
          onPointerDown={handleOrbPointerDown}
          onPointerMove={handleOrbPointerMove}
          onPointerUp={handleOrbPointerUp}
          onPointerCancel={handleOrbPointerUp}
          style={{
            left: `${orbPos.x}px`,
            top: `${orbPos.y}px`,
            width: `${ORB_SIZE}px`,
            height: `${ORB_SIZE}px`,
          }}
          aria-label={pickLang(lang, {
            es: 'Abrir chat flotante',
            ca: 'Obrir xat flotant',
            en: 'Open floating chat',
          })}
          title={pickLang(lang, {
            es: 'Toca para abrir · Arrastra para mover',
            ca: 'Toca per obrir · Arrossega per moure',
            en: 'Tap to open · Drag to move',
          })}
          className="fixed z-[75] rounded-full bg-[#12131C]/50 hover:bg-[#12131C]/75 backdrop-blur-md border border-[#9146FF]/55 text-white shadow-[0_8px_28px_rgba(0,0,0,0.5)] flex items-center justify-center touch-none select-none cursor-grab active:cursor-grabbing active:scale-95 transition-colors"
        >
          {voiceActive ? (
            <Mic className="w-5 h-5 text-[#00F593]" />
          ) : (
            <MessageSquare className="w-5 h-5 text-[#D8B4FE]" />
          )}

          {/* Unread counter OR live participant count dot */}
          {unreadCount > 0 ? (
            <span className="absolute -top-1 -right-1 min-w-[20px] h-[20px] px-1 rounded-full bg-[#9146FF] border-2 border-[#0B0B0E] text-[10px] font-black text-white flex items-center justify-center tabular-nums shadow">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          ) : participantsCount > 1 ? (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#9146FF]/90 border border-white/25 text-[9px] font-bold text-white flex items-center justify-center tabular-nums">
              {participantsCount}
            </span>
          ) : null}
        </button>
      )}

      {/* 2. MOVABLE & RESIZABLE FLOATING CHAT WINDOW (WHEN OPEN) */}
      {isSheetOpen && (
        <div
          style={{
            left: `${winBounds.x}px`,
            top: `${winBounds.y}px`,
            width: `${winBounds.w}px`,
            height: `${winBounds.h}px`,
          }}
          className="fixed z-[75] rounded-2xl bg-[#0D0E14]/88 backdrop-blur-xl border border-white/[0.16] shadow-[0_24px_70px_rgba(0,0,0,0.85)] flex flex-col overflow-hidden"
          role="dialog"
          aria-label={pickLang(lang, {
            es: 'Chat flotante de sala',
            ca: 'Xat flotant de sala',
            en: 'Floating room chat',
          })}
        >
          {/* Top-Left Corner Resize Handle */}
          <div
            onPointerDown={(e) => handleResizeDown('tl', e)}
            onPointerMove={handleResizeMove}
            onPointerUp={handleResizeUp}
            onPointerCancel={handleResizeUp}
            title={pickLang(lang, {
              es: 'Arrastra para cambiar tamaño',
              ca: 'Arrossega per canviar mida',
              en: 'Drag to resize',
            })}
            className="absolute top-0 left-0 w-5 h-5 z-20 touch-none cursor-nwse-resize flex items-start justify-start p-1 opacity-60 hover:opacity-100"
          >
            <span className="w-2 h-2 border-t-2 border-l-2 border-[#BF94FF] rounded-tl-xs" />
          </div>

          {/* Draggable Window Header */}
          <div
            onPointerDown={handleWinDragDown}
            onPointerMove={handleWinDragMove}
            onPointerUp={handleWinDragUp}
            onPointerCancel={handleWinDragUp}
            className="shrink-0 h-10 px-3 pl-5 bg-[#151622]/90 border-b border-white/[0.08] flex items-center justify-between gap-2 touch-none select-none cursor-grab active:cursor-grabbing"
          >
            <div className="flex items-center gap-2 min-w-0">
              <GripHorizontal className="w-4 h-4 text-zinc-400 shrink-0" />
              <span className="text-xs font-bold text-white truncate tabular-nums">
                {pickLang(lang, {
                  es: `Sala · ${participantsCount}`,
                  ca: `Sala · ${participantsCount}`,
                  en: `Room · ${participantsCount}`,
                })}
              </span>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={toggleExpandPreset}
                title={
                  isExpanded
                    ? pickLang(lang, { es: 'Hacer más pequeño', ca: 'Fer més petit', en: 'Smaller' })
                    : pickLang(lang, { es: 'Hacer más grande', ca: 'Fer més gran', en: 'Larger' })
                }
                aria-label={
                  isExpanded
                    ? pickLang(lang, { es: 'Hacer más pequeño', ca: 'Fer més petit', en: 'Smaller' })
                    : pickLang(lang, { es: 'Hacer más grande', ca: 'Fer més gran', en: 'Larger' })
                }
                className="w-7 h-7 rounded-lg bg-white/[0.07] hover:bg-[#9146FF]/35 text-zinc-200 hover:text-white flex items-center justify-center cursor-pointer transition-colors"
              >
                {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              </button>

              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  onCloseSheet();
                  onOpenFullSala();
                }}
                title={pickLang(lang, {
                  es: 'Abrir Sala completa',
                  ca: 'Obrir Sala completa',
                  en: 'Open full Room',
                })}
                aria-label={pickLang(lang, {
                  es: 'Abrir Sala completa',
                  ca: 'Obrir Sala completa',
                  en: 'Open full Room',
                })}
                className="w-7 h-7 rounded-lg bg-[#9146FF]/25 hover:bg-[#9146FF] text-[#D8B4FE] hover:text-white flex items-center justify-center cursor-pointer transition-colors"
              >
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  onCloseSheet();
                }}
                title={pickLang(lang, {
                  es: 'Minimizar a bolita',
                  ca: 'Minimitzar a boleta',
                  en: 'Minimize to bubble',
                })}
                aria-label={pickLang(lang, {
                  es: 'Minimizar a bolita',
                  ca: 'Minimitzar a boleta',
                  en: 'Minimize to bubble',
                })}
                className="w-7 h-7 rounded-lg bg-white/[0.07] hover:bg-rose-500/35 text-zinc-200 hover:text-white flex items-center justify-center cursor-pointer transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Embedded PartySidebar Content */}
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            {children}
          </div>

          {/* Bottom-Right Corner Resize Handle */}
          <div
            onPointerDown={(e) => handleResizeDown('br', e)}
            onPointerMove={handleResizeMove}
            onPointerUp={handleResizeUp}
            onPointerCancel={handleResizeUp}
            title={pickLang(lang, {
              es: 'Arrastra para cambiar tamaño',
              ca: 'Arrossega per canviar mida',
              en: 'Drag to resize',
            })}
            className="absolute bottom-0 right-0 w-5 h-5 z-20 touch-none cursor-nwse-resize flex items-end justify-end p-1 opacity-65 hover:opacity-100"
          >
            <span className="w-2 h-2 border-b-2 border-r-2 border-[#BF94FF] rounded-br-xs" />
          </div>
        </div>
      )}
    </>,
    document.body
  );
};

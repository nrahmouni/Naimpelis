import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowUpRight,
  MessageSquare,
  Mic,
  Users,
  X,
} from 'lucide-react';
import type { AppLanguage } from '../types';
import { pickLang } from '../utils/i18n';
import { triggerHaptic } from '../utils/haptics';
import { useBackInterceptor } from '../lib/backInterceptor';
import { useAppStore } from '../store/useAppStore';

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

const ORB_SIZE = 54;
const MARGIN = 12;

function getDefaultOrbPos(): { x: number; y: number } {
  if (typeof window === 'undefined') return { x: 280, y: 540 };
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  return {
    x: Math.max(MARGIN, vw - ORB_SIZE - 14),
    y: Math.max(MARGIN, vh - ORB_SIZE - 88),
  };
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
  children,
}) => {
  const [orbPos, setOrbPos] = useState<{ x: number; y: number }>(() => getDefaultOrbPos());
  const bubbleSuppressCount = useAppStore((s) => s.floatingBubbleSuppressCount);
  const bubbleBackId = useId();
  useBackInterceptor(visible && isSheetOpen, `floating-room-${bubbleBackId}`, onCloseSheet, {
    priority: 28,
    lockScroll: true,
  });

  // Keep orb safely inside viewport on resize / rotation
  useEffect(() => {
    const clampOrb = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      setOrbPos((prev) => ({
        x: Math.min(Math.max(MARGIN, prev.x), Math.max(MARGIN, vw - ORB_SIZE - MARGIN)),
        y: Math.min(Math.max(MARGIN, prev.y), Math.max(MARGIN, vh - ORB_SIZE - MARGIN)),
      }));
    };
    window.addEventListener('resize', clampOrb);
    return () => window.removeEventListener('resize', clampOrb);
  }, []);

  // ---------------------------------------------------------------------------
  // Draggable Orb Gesture (14px threshold so mobile thumb taps never lock up)
  // ---------------------------------------------------------------------------
  const DRAG_THRESHOLD_PX = 14;
  const orbDragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    moved: boolean;
    captured: boolean;
  } | null>(null);
  const justDraggedRef = useRef<boolean>(false);

  const releaseOrbCapture = (el: HTMLButtonElement, pointerId: number) => {
    try {
      if (el.hasPointerCapture(pointerId)) {
        el.releasePointerCapture(pointerId);
      }
    } catch {
      // ignore pointer capture cleanup errors
    }
  };

  const handleOrbPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    orbDragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origX: orbPos.x,
      origY: orbPos.y,
      moved: false,
      captured: false,
    };
  };

  const handleOrbPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const drag = orbDragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
      drag.moved = true;
      justDraggedRef.current = true;
      if (!drag.captured) {
        drag.captured = true;
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // ignore
        }
      }
    }
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
    if (drag?.captured) {
      releaseOrbCapture(e.currentTarget, e.pointerId);
    }
    if (drag?.moved) {
      triggerHaptic('light');
      window.setTimeout(() => {
        justDraggedRef.current = false;
      }, 120);
    }
  };

  const handleOrbPointerCancel = (e: React.PointerEvent<HTMLButtonElement>) => {
    const drag = orbDragRef.current;
    orbDragRef.current = null;
    justDraggedRef.current = false;
    if (drag?.captured) {
      releaseOrbCapture(e.currentTarget, e.pointerId);
    }
  };

  const handleOrbClick = () => {
    if (justDraggedRef.current) {
      justDraggedRef.current = false;
      return;
    }
    orbDragRef.current = null;
    triggerHaptic('light');
    onOpenSheet();
  };

  if (!visible || typeof document === 'undefined') return null;

  return createPortal(
    <>
      {/* 1. ALWAYS-AVAILABLE DRAGGABLE CHAT ORB (WHEN CURTAIN IS CLOSED & NO MODAL IS OPEN) */}
      {!isSheetOpen && bubbleSuppressCount === 0 && (
        <button
          type="button"
          onPointerDown={handleOrbPointerDown}
          onPointerMove={handleOrbPointerMove}
          onPointerUp={handleOrbPointerUp}
          onPointerCancel={handleOrbPointerCancel}
          onClick={handleOrbClick}
          style={{
            left: `${orbPos.x}px`,
            top: `${orbPos.y}px`,
            width: `${ORB_SIZE}px`,
            height: `${ORB_SIZE}px`,
          }}
          aria-label={pickLang(lang, {
            es: 'Abrir chat lateral de sala',
            ca: 'Obrir xat lateral de sala',
            en: 'Open side room chat',
            zh: '打开侧边房间聊天',
          })}
          title={pickLang(lang, {
            es: 'Toca para abrir · Arrastra para mover',
            ca: 'Toca per obrir · Arrossega per moure',
            en: 'Tap to open · Drag to move',
            zh: '点击打开 · 拖动移动',
          })}
          className="fixed z-[210] rounded-full bg-[#0B0B0F]/82 hover:bg-[#17122B]/90 backdrop-blur-xl border border-[#9146FF]/70 text-white shadow-[0_10px_30px_rgba(0,0,0,0.65),0_0_20px_rgba(145,70,255,0.32)] flex items-center justify-center touch-none select-none cursor-pointer active:scale-95 transition-colors"
        >
          {voiceActive ? (
            <Mic className="w-5 h-5 text-[#00F593]" />
          ) : (
            <MessageSquare className="w-5 h-5 text-[#D8B4FE]" />
          )}

          {/* Unread counter OR live participant badge */}
          {unreadCount > 0 ? (
            <span className="absolute -top-1 -right-1 min-w-[20px] h-[20px] px-1 rounded-full bg-[#9146FF] border-2 border-[#0B0B0F] text-[10px] font-black text-white flex items-center justify-center tabular-nums shadow">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          ) : participantsCount > 0 ? (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#9146FF] border border-[#0B0B0F] text-[9px] font-bold text-white flex items-center justify-center tabular-nums">
              {participantsCount}
            </span>
          ) : null}
        </button>
      )}

      {/* 2. RIGHT-SIDE TRANSLUCENT SLIDE-OUT CURTAIN ("PERSIANA") */}
      <AnimatePresence>
        {isSheetOpen && (
          <div className="fixed inset-0 z-[215] flex justify-end pointer-events-none">
            {/* Dark blurred backdrop so underlying home text does not create visual noise */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => {
                triggerHaptic('light');
                onCloseSheet();
              }}
              className="pointer-events-auto absolute inset-0 bg-black/75 backdrop-blur-md cursor-pointer"
              aria-hidden="true"
            />

            {/* Right Curtain Panel */}
            <motion.aside
              initial={{ x: '100%', opacity: 0.7 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: '100%', opacity: 0.7 }}
              transition={{ type: 'spring', stiffness: 360, damping: 34 }}
              role="dialog"
              aria-label={pickLang(lang, {
                es: 'Sala y chat en vivo',
                ca: 'Sala i xat en directe',
                en: 'Live room & chat',
                zh: '房间与实时聊天',
              })}
              className="pointer-events-auto relative z-10 h-full w-[96vw] sm:w-[88vw] max-w-[430px] bg-[#0B0D14]/96 backdrop-blur-2xl border-l border-[#9146FF]/35 shadow-[-24px_0_64px_rgba(0,0,0,0.88)] flex flex-col overflow-hidden"
            >
              {/* Curtain Top Header */}
              <div className="shrink-0 h-12 px-3.5 bg-[#0B0B0F]/80 border-b border-white/[0.1] flex items-center justify-between gap-2 select-none">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="w-7 h-7 rounded-lg bg-[#9146FF]/22 border border-[#9146FF]/45 flex items-center justify-center text-[#D8B4FE] shrink-0">
                    <Users className="w-3.5 h-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="block text-xs font-display font-bold text-white truncate tabular-nums">
                      {pickLang(lang, {
                        es: `Sala · ${participantsCount}`,
                        ca: `Sala · ${participantsCount}`,
                        en: `Room · ${participantsCount}`,
                        zh: `房间 · ${participantsCount}`,
                      })}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      onCloseSheet();
                      onOpenFullSala();
                    }}
                    className="h-8 px-2.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.12] border border-white/[0.14] text-zinc-200 hover:text-white text-[11px] font-semibold flex items-center gap-1 cursor-pointer transition-colors whitespace-nowrap shrink-0"
                    title={pickLang(lang, {
                      es: 'Abrir Sala completa',
                      ca: 'Obrir Sala completa',
                      en: 'Open full Room',
                      zh: '打开完整房间',
                    })}
                  >
                    <ArrowUpRight className="w-3.5 h-3.5 text-zinc-400" />
                    <span>
                      {pickLang(lang, {
                        es: 'Sala completa',
                        ca: 'Sala completa',
                        en: 'Full room',
                        zh: '完整房间',
                      })}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      onCloseSheet();
                    }}
                    title={pickLang(lang, {
                      es: 'Cerrar a bolita',
                      ca: 'Tancar a boleta',
                      en: 'Minimize to bubble',
                      zh: '收起为悬浮球',
                    })}
                    aria-label={pickLang(lang, {
                      es: 'Cerrar a bolita',
                      ca: 'Tancar a boleta',
                      en: 'Minimize to bubble',
                      zh: '收起为悬浮球',
                    })}
                    className="w-8 h-8 rounded-xl bg-white/[0.08] hover:bg-rose-500/35 text-zinc-200 hover:text-white flex items-center justify-center cursor-pointer transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Translucent PartySidebar Content (Chat, Reactions, Amigos, Invites) */}
              <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                {children}
              </div>
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
    </>,
    document.body
  );
};

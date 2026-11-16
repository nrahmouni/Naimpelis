import React, { useEffect, useRef, useState } from 'react';
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
  if (typeof window === 'undefined') return { x: 280, y: 520 };
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  return {
    x: Math.max(MARGIN, vw - ORB_SIZE - 14),
    y: Math.max(MARGIN, Math.round(vh * 0.62)),
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
      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch {
        // ignore pointer capture cleanup errors
      }
    }
  };

  if (!visible || typeof document === 'undefined') return null;

  return createPortal(
    <>
      {/* 1. ALWAYS-AVAILABLE DRAGGABLE CHAT ORB (WHEN CURTAIN IS CLOSED) */}
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
          className="fixed z-[75] rounded-full bg-[#0B0B0F]/72 hover:bg-[#17122B]/85 backdrop-blur-xl border border-[#9146FF]/65 text-white shadow-[0_10px_30px_rgba(0,0,0,0.6),0_0_20px_rgba(145,70,255,0.28)] flex items-center justify-center touch-none select-none cursor-grab active:cursor-grabbing active:scale-95 transition-colors"
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
          <div className="fixed inset-0 z-[76] flex justify-end">
            {/* Soft non-intrusive backdrop so video remains clearly visible underneath */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => {
                triggerHaptic('light');
                onCloseSheet();
              }}
              className="absolute inset-0 bg-black/25 cursor-pointer"
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
              className="relative z-10 h-full w-[88vw] max-w-[390px] bg-[#0B0B0F]/72 backdrop-blur-xl border-l border-[#9146FF]/35 shadow-[-24px_0_64px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden"
            >
              {/* Curtain Top Header */}
              <div className="shrink-0 h-12 px-3.5 bg-[#0B0B0F]/65 border-b border-white/[0.1] flex items-center justify-between gap-2 select-none">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-7 h-7 rounded-lg bg-[#9146FF]/22 border border-[#9146FF]/45 flex items-center justify-center text-[#D8B4FE] shrink-0">
                    <Users className="w-3.5 h-3.5" />
                  </span>
                  <div className="min-w-0">
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
                    className="h-8 px-2.5 rounded-xl bg-[#9146FF] hover:bg-[#7C2AE8] text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors shadow-[0_4px_14px_rgba(145,70,255,0.4)]"
                    title={pickLang(lang, {
                      es: 'Abrir Sala completa',
                      ca: 'Obrir Sala completa',
                      en: 'Open full Room',
                      zh: '打开完整房间',
                    })}
                  >
                    <ArrowUpRight className="w-3.5 h-3.5" />
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

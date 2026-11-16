import React, { useEffect, useState } from 'react';
import { MessageSquare, Mic, ArrowUpRight } from 'lucide-react';
import type { AppLanguage } from '../types';
import { pickLang } from '../utils/i18n';
import { triggerHaptic } from '../utils/haptics';
import { BottomSheet } from './ui/DesignSystem';

interface FloatingRoomBubbleProps {
  lang: AppLanguage;
  visible: boolean;
  participantsCount: number;
  voiceActive: boolean;
  isSheetOpen: boolean;
  onOpenSheet: () => void;
  onCloseSheet: () => void;
  onOpenFullSala: () => void;
  dockedInMiniPlayer?: boolean;
  children: React.ReactNode;
}

export const FloatingRoomBubble: React.FC<FloatingRoomBubbleProps> = ({
  lang,
  visible,
  participantsCount,
  voiceActive,
  isSheetOpen,
  onOpenSheet,
  onCloseSheet,
  onOpenFullSala,
  dockedInMiniPlayer = false,
  children,
}) => {
  const [scrollHidden, setScrollHidden] = useState(false);

  useEffect(() => {
    let lastY = typeof window !== 'undefined' ? window.scrollY : 0;
    const onScroll = () => {
      const currentY = window.scrollY;
      const diff = currentY - lastY;
      if (diff > 8 && currentY > 60) {
        setScrollHidden(true);
      } else if (diff < -8 || currentY <= 30) {
        setScrollHidden(false);
      }
      lastY = currentY;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (!isSheetOpen) return null;

  return (
    <>

      <BottomSheet
        isOpen={isSheetOpen}
        onClose={onCloseSheet}
        lang={lang}
        title={pickLang(lang, {
          es: `Sala en vivo (${participantsCount})`,
          ca: `Sala en directe (${participantsCount})`,
          en: `Live room (${participantsCount})`,
        })}
        maxWidth="sm:max-w-md"
      >
        <div className="space-y-2.5">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                onCloseSheet();
                onOpenFullSala();
              }}
              className="min-h-10 px-3 rounded-xl bg-[#9146FF]/20 hover:bg-[#9146FF]/35 border border-[#9146FF]/45 text-xs font-bold text-[#D8B4FE] inline-flex items-center gap-1.5 cursor-pointer"
            >
              <span>
                {pickLang(lang, {
                  es: 'Abrir Sala completa',
                  ca: 'Obrir Sala completa',
                  en: 'Open full Room',
                })}
              </span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="h-[62dvh] min-h-[340px] rounded-2xl overflow-hidden border border-white/[0.08]">
            {children}
          </div>
        </div>
      </BottomSheet>
    </>
  );
};

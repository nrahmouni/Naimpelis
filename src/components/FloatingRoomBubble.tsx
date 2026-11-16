import React from 'react';
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
  children,
}) => {
  if (!visible) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          triggerHaptic('light');
          onOpenSheet();
        }}
        className="fixed bottom-5 right-4 mb-safe z-40 min-h-12 px-4 rounded-full bg-[#18181F]/95 backdrop-blur-xl border border-[#9146FF]/55 hover:border-[#9146FF] shadow-[0_12px_32px_rgba(0,0,0,0.75)] flex items-center gap-2 text-xs font-bold text-white cursor-pointer active:scale-95 transition-all"
        aria-label={pickLang(lang, {
          es: `Abrir chat de sala (${participantsCount})`,
          ca: `Obrir xat de sala (${participantsCount})`,
          en: `Open room chat (${participantsCount})`,
        })}
      >
        <MessageSquare className="w-4 h-4 text-[#BF94FF] shrink-0" />
        <span className="tabular-nums">
          {pickLang(lang, { es: 'Sala', ca: 'Sala', en: 'Room' })} · {participantsCount}
        </span>
        {voiceActive && (
          <span className="relative flex items-center justify-center w-4 h-4">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00F593] opacity-60" />
            <Mic className="relative w-3.5 h-3.5 text-[#00F593]" />
          </span>
        )}
      </button>

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

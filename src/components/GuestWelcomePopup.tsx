import React, { useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import { AppLanguage } from '../types';
import { triggerHaptic } from '../utils/haptics';
import { getMonogramInitials } from './MobileViewportGuard';

interface GuestWelcomePopupProps {
  currentName: string;
  currentAvatar: string;
  currentColor: string;
  roomName: string;
  lang: AppLanguage;
  onSaveIdentity: (name: string, avatar: string, color: string) => void;
  onDismissKeepRandom: () => void;
}

export const GuestWelcomePopup: React.FC<GuestWelcomePopupProps> = ({
  currentName,
  currentAvatar,
  currentColor,
  roomName,
  lang,
  onSaveIdentity,
  onDismissKeepRandom,
}) => {
  const [draftName, setDraftName] = useState('');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onDismissKeepRandom();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    const autoDismissTimer = setTimeout(() => {
      onDismissKeepRandom();
    }, 12000);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      clearTimeout(autoDismissTimer);
    };
  }, [onDismissKeepRandom]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalName = draftName.trim() || currentName;
    triggerHaptic('success');
    onSaveIdentity(finalName.slice(0, 24), currentAvatar || '🎬', currentColor || '#E11D48');
  };

  const previewName = draftName.trim() || currentName;

  return (
    <aside
      aria-label={lang === 'es' ? 'Personalizar tu nombre en la sala' : 'Set your display name'}
      className="fixed bottom-[68px] inset-x-3 sm:inset-x-auto sm:right-5 sm:bottom-5 sm:w-[360px] z-30 rounded-2xl bg-[#0E0F16]/95 backdrop-blur-xl border border-white/[0.1] shadow-[0_24px_60px_rgba(0,0,0,0.9)] p-4 animate-room-warp"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-[#E11D48]/15 border border-[#E11D48]/35 flex items-center justify-center font-display font-bold text-xs text-white shrink-0">
            {getMonogramInitials(previewName)}
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-medium text-zinc-400 truncate">
              {roomName}
            </div>
            <h3 className="font-display font-semibold text-sm text-white leading-snug">
              {lang === 'es' ? '¿Cómo te llamas?' : 'What’s your name?'}
            </h3>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            triggerHaptic('light');
            onDismissKeepRandom();
          }}
          title={lang === 'es' ? `Seguir como ${currentName}` : `Keep ${currentName}`}
          aria-label="Cerrar"
          className="w-8 h-8 rounded-lg bg-white/[0.06] hover:bg-white/12 flex items-center justify-center text-zinc-400 hover:text-white shrink-0 cursor-pointer transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="mt-3 flex items-center gap-2">
        <input
          type="text"
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          placeholder={
            lang === 'es' ? `Tu nombre (o ${currentName})` : `Your name (or ${currentName})`
          }
          maxLength={24}
          className="flex-1 min-w-0 h-11 px-3.5 rounded-xl bg-[#090A0F] border border-white/12 focus:border-[#E11D48] text-base sm:text-xs text-white placeholder:text-zinc-500 outline-none transition-colors"
        />
        <button
          type="submit"
          className="h-11 px-4 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] active:scale-95 text-xs font-semibold text-white flex items-center gap-1.5 shrink-0 cursor-pointer transition-all"
        >
          <Check className="w-3.5 h-3.5" />
          <span>{lang === 'es' ? 'Guardar' : 'Save'}</span>
        </button>
      </form>

      <p className="text-[11px] text-zinc-500 mt-2">
        {lang === 'es'
          ? `Cierra si prefieres quedarte como "${currentName}".`
          : `Close anytime to stay as "${currentName}".`}
      </p>
    </aside>
  );
};

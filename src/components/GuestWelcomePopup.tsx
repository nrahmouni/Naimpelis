import React, { useEffect, useState } from 'react';
import { Check, Sparkles, X } from 'lucide-react';
import { AppLanguage } from '../types';
import { triggerHaptic } from '../utils/haptics';

const QUICK_AVATARS = ['🍿', '🎬', '⚽', '🏎️', '🚀', '⚡'];

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
  const [selectedAvatar, setSelectedAvatar] = useState(currentAvatar || '🍿');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onDismissKeepRandom();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onDismissKeepRandom]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalName = draftName.trim() || currentName;
    triggerHaptic('success');
    onSaveIdentity(finalName.slice(0, 24), selectedAvatar, currentColor);
  };

  return (
    <aside
      aria-label={lang === 'es' ? 'Personalizar tu nombre en la sala' : 'Set your display name'}
      className="fixed bottom-[68px] inset-x-3 sm:inset-x-auto sm:right-5 sm:bottom-5 sm:w-[365px] z-40 rounded-3xl futuristic-panel border border-white/15 shadow-[0_20px_60px_rgba(0,0,0,0.75),0_0_30px_rgba(225,29,72,0.18)] p-4 animate-room-warp"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#FB7185]">
            <Sparkles className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">
              {lang === 'es' ? `Ya estás dentro de ${roomName}` : `You’re inside ${roomName}`}
            </span>
          </div>
          <h3 className="font-display font-bold text-sm sm:text-base text-white mt-0.5">
            {lang === 'es' ? '¿Cómo quieres que te vean?' : 'Pick your name & avatar'}
          </h3>
          <p className="text-[11px] text-zinc-400 mt-0.5">
            {lang === 'es'
              ? `Si cierras esto, te quedas como "${currentName}".`
              : `Close anytime to stay as "${currentName}".`}
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            triggerHaptic('light');
            onDismissKeepRandom();
          }}
          title={lang === 'es' ? `Seguir como ${currentName}` : `Keep ${currentName}`}
          aria-label="Cerrar"
          className="w-9 h-9 rounded-xl bg-white/[0.06] hover:bg-white/12 border border-white/10 flex items-center justify-center text-zinc-300 shrink-0 cursor-pointer transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="mt-3 space-y-2.5">
        {/* Quick Avatar Row */}
        <div className="grid grid-cols-6 gap-1.5">
          {QUICK_AVATARS.map((av) => {
            const active = selectedAvatar === av;
            return (
              <button
                key={av}
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setSelectedAvatar(av);
                }}
                className={`h-10 rounded-xl flex items-center justify-center text-lg transition-all cursor-pointer ${
                  active
                    ? 'bg-[#E11D48]/25 border border-[#E11D48] scale-105'
                    : 'bg-[#090A0F]/90 border border-white/[0.08] hover:bg-white/[0.06]'
                }`}
              >
                {av}
              </button>
            );
          })}
        </div>

        {/* Name Input + Save Button */}
        <div className="flex items-center gap-2">
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
            <span>{lang === 'es' ? 'Listo' : 'Save'}</span>
          </button>
        </div>
      </form>
    </aside>
  );
};

import React, { useEffect, useRef, useState } from 'react';
import { Check, X } from 'lucide-react';
import { AppLanguage } from '../types';
import { triggerHaptic } from '../utils/haptics';
import { pickLang } from '../utils/i18n';
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
  const onDismissKeepRandomRef = useRef(onDismissKeepRandom);
  onDismissKeepRandomRef.current = onDismissKeepRandom;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onDismissKeepRandomRef.current();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    const autoDismissTimer = setTimeout(() => {
      onDismissKeepRandomRef.current();
    }, 12000);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      clearTimeout(autoDismissTimer);
    };
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalName = draftName.trim() || currentName;
    triggerHaptic('success');
    onSaveIdentity(finalName.slice(0, 24), currentAvatar || '🎬', currentColor || '#9146FF');
  };

  const previewName = draftName.trim() || currentName;

  return (
    <aside
      aria-label={pickLang(lang, {
        es: 'Personalizar tu nombre en la sala',
        ca: 'Personalitza el teu nom a la sala',
        en: 'Set your display name',
      })}
      className="fixed bottom-[78px] inset-x-3 sm:inset-x-auto sm:right-5 sm:bottom-5 sm:w-[360px] z-30 rounded-2xl bg-[#141418]/96 backdrop-blur-2xl nc-specular-surface border border-white/[0.12] shadow-[0_24px_60px_rgba(0,0,0,0.9)] p-4 animate-room-warp"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-[#9146FF]/20 border border-[#9146FF]/45 flex items-center justify-center font-display font-bold text-xs text-white shrink-0">
            {getMonogramInitials(previewName)}
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-medium text-zinc-400 truncate">
              {roomName}
            </div>
            <h3 className="font-display font-semibold text-sm text-white leading-snug">
              {pickLang(lang, {
                es: '¿Cómo te llamas?',
                ca: 'Com et dius?',
                en: 'What’s your name?',
              })}
            </h3>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            triggerHaptic('light');
            onDismissKeepRandom();
          }}
          title={pickLang(lang, {
            es: `Seguir como ${currentName}`,
            ca: `Continuar com a ${currentName}`,
            en: `Keep ${currentName}`,
          })}
          aria-label={pickLang(lang, {
            es: 'Cerrar',
            ca: 'Tancar',
            en: 'Close',
          })}
          className="w-9 h-9 rounded-xl bg-white/[0.06] hover:bg-white/12 flex items-center justify-center text-zinc-400 hover:text-white shrink-0 cursor-pointer transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="mt-3 flex items-center gap-2">
        <input
          type="text"
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          placeholder={pickLang(lang, {
            es: `Tu nombre (o ${currentName})`,
            ca: `El teu nom (o ${currentName})`,
            en: `Your name (or ${currentName})`,
          })}
          maxLength={24}
          className="flex-1 min-w-0 h-11 px-3.5 rounded-xl bg-white/[0.05] focus:bg-white/[0.08] border border-white/12 focus:border-[#9146FF] text-base sm:text-xs text-white placeholder:text-[#ADADB8] outline-none transition-all"
        />
        <button
          type="submit"
          className="h-11 px-4 rounded-xl bg-gradient-to-b from-[#9E5CFF] to-[#772CE8] hover:brightness-110 active:scale-95 text-xs font-bold text-white flex items-center gap-1.5 shrink-0 cursor-pointer transition-all shadow-[0_6px_18px_rgba(145,70,255,0.35)]"
        >
          <Check className="w-3.5 h-3.5" />
          <span>
            {pickLang(lang, {
              es: 'Guardar',
              ca: 'Desar',
              en: 'Save',
            })}
          </span>
        </button>
      </form>

      <p className="text-[11px] text-zinc-500 mt-2">
        {pickLang(lang, {
          es: `Cierra si prefieres quedarte como "${currentName}".`,
          ca: `Tanca si prefereixes quedar-te com a "${currentName}".`,
          en: `Close anytime to stay as "${currentName}".`,
        })}
      </p>
    </aside>
  );
};

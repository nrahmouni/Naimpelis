import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Sparkles, Check } from 'lucide-react';
import type { AppLanguage, KidsAgeGroup, KidsLanguageCode } from '../../types';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import { FlagBadgeSvg } from '../ui/LanguageBadge';
import {
  KIDS_AVATAR_CHOICES,
  KIDS_LANGUAGES,
  KIDS_MASCOTS,
  type KidsProgressState,
} from './kidsData';
import { speakKidsText } from './kidsTtsHelper';
import { KidsAnimatedMascotSvg } from './KidsSvgArt';

interface KidsStepWizardProps {
  shellLang: AppLanguage;
  currentProgress: KidsProgressState;
  onCompleteWizard: (updated: Partial<KidsProgressState>) => void;
  onClose: () => void;
}

export const KidsStepWizard: React.FC<KidsStepWizardProps> = ({
  shellLang,
  currentProgress,
  onCompleteWizard,
  onClose,
}) => {
  const [step, setStep] = useState<number>(1);
  const [name, setName] = useState<string>(currentProgress.name || 'Peque');
  const [avatarEmoji, setAvatarEmoji] = useState<string>(currentProgress.avatarEmoji || '🦊');
  const [langCode, setLangCode] = useState<KidsLanguageCode>(currentProgress.preferredLang || 'es');
  const [ageGroup, setAgeGroup] = useState<KidsAgeGroup>(currentProgress.ageGroup || '6-8');
  const [mascotId, setMascotId] = useState<string>(currentProgress.mascotId || 'fox');

  const activeLangMeta = KIDS_LANGUAGES.find((l) => l.code === langCode) || KIDS_LANGUAGES[0];

  const handleNext = () => {
    triggerHaptic('medium');
    if (step < 4) {
      setStep((s) => s + 1);
    } else {
      onCompleteWizard({
        name: name.trim() || 'Peque',
        avatarEmoji,
        preferredLang: langCode,
        ageGroup,
        mascotId,
      });
      onClose();
    }
  };

  const handleBack = () => {
    triggerHaptic('light');
    if (step > 1) {
      setStep((s) => s - 1);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[280] bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 select-none"
    >
      <div className="w-full max-w-lg rounded-3xl bg-[#141B3B] border-4 border-amber-400 p-5 sm:p-7 shadow-[0_0_40px_rgba(245,158,11,0.35)] flex flex-col gap-4 text-white">
        {/* Step Header */}
        <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            {step > 1 ? (
              <button
                type="button"
                onClick={handleBack}
                className="h-9 px-3 rounded-2xl bg-white/10 hover:bg-white/20 text-white text-xs font-black flex items-center gap-1 cursor-pointer active:scale-95"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Atrás</span>
              </button>
            ) : (
              <span className="text-2xl">✨</span>
            )}
            <div>
              <h2 className="font-display font-black text-base sm:text-lg text-amber-300">
                {step === 1 && 'Paso 1: ¿Cómo te llamas y cuál es tu icono?'}
                {step === 2 && 'Paso 2: ¿En qué idioma quieres tus dibujos?'}
                {step === 3 && 'Paso 3: ¿Cuántos años tienes?'}
                {step === 4 && 'Paso 4: Elige tu mascota mágica'}
              </h2>
              <p className="text-[11px] text-sky-200/80">Paso {step} de 4 · ¡Diseña tu espacio mágico!</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-2xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer text-sm font-bold"
          >
            ✕
          </button>
        </div>

        {/* Step Content */}
        <div className="min-h-[260px] flex flex-col justify-center">
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-sky-200 mb-1.5">Tu Nombre:</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej. Lucas, Martina..."
                  className="w-full h-12 px-4 rounded-2xl bg-[#0B1024] border-2 border-amber-400/50 text-base font-bold text-white outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-sky-200 mb-1.5">Elige tu Avatar:</label>
                <div className="grid grid-cols-4 gap-2">
                  {KIDS_AVATAR_CHOICES.map((av) => (
                    <button
                      key={av}
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        setAvatarEmoji(av);
                      }}
                      className={`h-14 rounded-2xl text-2xl flex items-center justify-center cursor-pointer border-2 transition-all ${
                        avatarEmoji === av
                          ? 'bg-amber-400 text-black border-amber-200 scale-105 shadow-md'
                          : 'bg-[#1C254D] hover:bg-[#253265] border-[#2E3C73] text-white'
                      }`}
                    >
                      {av}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <p className="text-xs text-sky-200 font-bold">
                ¡Escuchas el saludo instantáneo al tocar tu idioma favorito!
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-h-[220px] overflow-y-auto no-scrollbar">
                {KIDS_LANGUAGES.map((item) => {
                  const selected = item.code === langCode;
                  return (
                    <button
                      key={item.code}
                      type="button"
                      onClick={() => {
                        triggerHaptic('medium');
                        setLangCode(item.code);
                        void speakKidsText(item.greeting, item.code);
                      }}
                      className={`p-3 rounded-2xl border-2 text-left flex flex-col gap-2 cursor-pointer transition-all active:scale-95 ${
                        selected
                          ? 'bg-gradient-to-br from-amber-300 to-amber-500 text-zinc-950 border-amber-200 scale-105 shadow-lg'
                          : 'bg-[#1C254D] hover:bg-[#253265] border-[#2E3C73] text-white'
                      }`}
                    >
                      <FlagBadgeSvg code={item.flagCode} className="w-6 h-4 shadow-sm" />
                      <div>
                        <div className="text-xs font-black truncate">{item.nativeLabel}</div>
                        <div className="text-[10px] opacity-80 truncate">{item.esLabel}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
              <p className="text-xs text-sky-200 font-bold">
                Esto adapta los juegos y dibujos recomendados para ti:
              </p>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { id: '3-5' as KidsAgeGroup, label: '3 – 5 años', emoji: '🧸', desc: 'Preescolar y cantos' },
                  { id: '6-8' as KidsAgeGroup, label: '6 – 8 años', emoji: '🚀', desc: 'Aventuras y juegos' },
                  { id: '9-12' as KidsAgeGroup, label: '9 – 12 años', emoji: '⭐', desc: 'Series y retos pro' },
                ].map((g) => {
                  const selected = ageGroup === g.id;
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => {
                        triggerHaptic('medium');
                        setAgeGroup(g.id);
                      }}
                      className={`p-4 rounded-3xl border-2 text-center flex flex-col items-center gap-2 cursor-pointer transition-all ${
                        selected
                          ? 'bg-gradient-to-br from-sky-300 to-sky-500 text-zinc-950 border-sky-200 scale-105 shadow-lg'
                          : 'bg-[#1C254D] hover:bg-[#253265] border-[#2E3C73] text-white'
                      }`}
                    >
                      <span className="text-3xl">{g.emoji}</span>
                      <div className="text-sm font-black">{g.label}</div>
                      <div className="text-[10px] opacity-80">{g.desc}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-3">
              <p className="text-xs text-sky-200 font-bold">
                Tu compañero animado te acompañará en cada pantalla:
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {KIDS_MASCOTS.map((m) => {
                  const selected = mascotId === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        triggerHaptic('medium');
                        setMascotId(m.id);
                      }}
                      className={`p-3 rounded-3xl border-2 text-center flex flex-col items-center gap-1.5 cursor-pointer transition-all ${
                        selected
                          ? 'bg-gradient-to-br from-amber-300 to-amber-500 text-zinc-950 border-amber-200 scale-105 shadow-lg'
                          : 'bg-[#1C254D] hover:bg-[#253265] border-[#2E3C73] text-white'
                      }`}
                    >
                      <div className="w-12 h-12 flex items-center justify-center">
                        <KidsAnimatedMascotSvg id={m.id} size={44} />
                      </div>
                      <div className="text-xs font-black">{m.name}</div>
                      <div className="text-[10px] opacity-80">{m.cheerEs}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Wizard Footer Controls */}
        <div className="flex items-center justify-between gap-3 pt-3 border-t border-white/10">
          <button
            type="button"
            onClick={handleBack}
            disabled={step === 1}
            className="h-11 px-5 rounded-2xl bg-white/10 hover:bg-white/20 disabled:opacity-30 text-white font-black text-xs flex items-center gap-2 cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Atrás</span>
          </button>

          <button
            type="button"
            onClick={handleNext}
            className="h-11 px-6 rounded-2xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-zinc-950 font-display font-black text-sm flex items-center gap-2 cursor-pointer shadow-lg active:scale-95"
          >
            <span>{step === 4 ? '¡Empezar a Divertirse!' : 'Siguiente'}</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

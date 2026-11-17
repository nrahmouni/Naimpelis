import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Rocket, Sparkles, Star, X } from 'lucide-react';
import type { AppLanguage, KidsAgeGroup, KidsLanguageCode } from '../../types';
import { triggerHaptic } from '../../utils/haptics';
import { FlagBadgeSvg } from '../ui/LanguageBadge';
import {
  KIDS_AVATAR_CHOICES,
  KIDS_LANGUAGES,
  KIDS_MASCOTS,
  type KidsMascotId,
  type KidsProgressState,
} from './kidsData';
import { getKidsDir, getKidsUiCopy } from './kidsI18n';
import { speakKidsText } from './kidsTtsHelper';
import { KidsSpeakButton, KidsSquishButton } from './KidsPrimitives';
import {
  KidsAnimatedMascotSvg,
  KidsAvatarArtworkSvg,
  KidsUniqueNameAvatarSvg,
} from './KidsSvgArt';

interface KidsStepWizardProps {
  shellLang: AppLanguage;
  currentProgress: KidsProgressState;
  onCompleteWizard: (updated: Partial<KidsProgressState>) => void;
  onClose: () => void;
}

export const KidsStepWizard: React.FC<KidsStepWizardProps> = ({
  shellLang: _shellLang,
  currentProgress,
  onCompleteWizard,
  onClose,
}) => {
  const [step, setStep] = useState<number>(1);
  const [name, setName] = useState<string>(currentProgress.name || 'Peque');
  const [avatarId, setAvatarId] = useState<string>(
    KIDS_AVATAR_CHOICES.includes(currentProgress.avatarEmoji as (typeof KIDS_AVATAR_CHOICES)[number])
      ? (currentProgress.avatarEmoji as string)
      : KIDS_AVATAR_CHOICES[0]
  );
  const [langCode, setLangCode] = useState<KidsLanguageCode>(currentProgress.preferredLang || 'es');
  const [ageGroup, setAgeGroup] = useState<KidsAgeGroup>(currentProgress.ageGroup || '6-8');
  const [mascotId, setMascotId] = useState<KidsMascotId>(currentProgress.mascotId || 'fox');

  const t = getKidsUiCopy(langCode);
  const dir = getKidsDir(langCode);

  const currentStepTitle =
    step === 1 ? t.wizStep1 : step === 2 ? t.wizStep2 : step === 3 ? t.wizStep3 : t.wizStep4;

  const handleNext = () => {
    triggerHaptic('medium');
    if (step < 4) {
      setStep((s) => s + 1);
    } else {
      onCompleteWizard({
        name: name.trim() || 'Peque',
        avatarEmoji: avatarId,
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
      dir={dir}
      lang={langCode}
      className="fixed inset-0 z-[280] bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 select-none"
    >
      <div className="w-full max-w-xl rounded-3xl bg-[#141B3B] border-4 border-amber-400 p-4 sm:p-6 shadow-[0_0_40px_rgba(245,158,11,0.35)] flex flex-col gap-3 sm:gap-4 text-white max-h-[94dvh] overflow-hidden">
        {/* Step Header */}
        <div className="shrink-0 flex items-center justify-between gap-2 border-b border-white/10 pb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <KidsSpeakButton text={currentStepTitle} lang={langCode} />
            <div className="min-w-0">
              <h2 className="font-display font-black text-base sm:text-lg text-amber-300 leading-snug">
                {currentStepTitle}
              </h2>
              <p className="text-xs text-sky-200/80 truncate tabular-nums">
                {step} / 4 · {t.wizStepSubtitle}
              </p>
            </div>
          </div>
          <KidsSquishButton
            onClick={onClose}
            ariaLabel={t.keepPlaying}
            className="w-12 sm:w-14 rounded-2xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center shrink-0"
          >
            <X className="w-5 h-5" />
          </KidsSquishButton>
        </div>

        {/* Step Content */}
        <div className="flex-1 min-h-[210px] overflow-y-auto flex flex-col justify-center pe-1">
          {step === 1 && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <KidsUniqueNameAvatarSvg name={name} fallbackAvatarId={avatarId} size={68} className="shrink-0" />
                <div className="flex-1 min-w-0">
                  <label className="block text-sm font-bold text-sky-200 mb-1.5">{t.wizNameLabel}</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t.wizNamePlaceholder}
                    className="w-full h-12 sm:h-14 px-4 rounded-2xl bg-[#0B1024] border-2 border-amber-400/50 text-base sm:text-lg font-bold text-white outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-sky-200 mb-2">{t.wizAvatarLabel}</label>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5">
                  {KIDS_AVATAR_CHOICES.map((av) => (
                    <KidsSquishButton
                      key={av}
                      onClick={() => setAvatarId(av)}
                      className={`p-2 rounded-2xl flex items-center justify-center border-2 ${
                        avatarId === av
                          ? 'bg-amber-400 text-black border-amber-200 shadow-md'
                          : 'bg-[#1C254D] hover:bg-[#253265] border-[#2E3C73] text-white'
                      }`}
                    >
                      <KidsAvatarArtworkSvg avatarId={av} size={38} />
                    </KidsSquishButton>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <p className="text-sm text-sky-200 font-bold">{t.wizLangHint}</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {KIDS_LANGUAGES.map((item) => {
                  const selected = item.code === langCode;
                  return (
                    <KidsSquishButton
                      key={item.code}
                      onClick={() => {
                        setLangCode(item.code);
                        void speakKidsText(item.greeting, item.code, { ageGroup });
                      }}
                      className={`p-3 rounded-2xl border-2 text-start flex flex-col items-start justify-center gap-1.5 ${
                        selected
                          ? 'bg-gradient-to-br from-amber-300 to-amber-500 text-zinc-950 border-amber-200 shadow-lg'
                          : 'bg-[#1C254D] hover:bg-[#253265] border-[#2E3C73] text-white'
                      }`}
                    >
                      <FlagBadgeSvg code={item.flagCode} className="w-7 h-4 shadow-sm" />
                      <div className="text-sm font-black truncate w-full">{item.nativeLabel}</div>
                    </KidsSquishButton>
                  );
                })}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
              <p className="text-sm text-sky-200 font-bold">{t.wizAgeHint}</p>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { id: '3-5' as KidsAgeGroup, label: `3–5 ${t.yearsLabel}`, icon: <Sparkles className="w-8 h-8" /> },
                  { id: '6-8' as KidsAgeGroup, label: `6–8 ${t.yearsLabel}`, icon: <Rocket className="w-8 h-8" /> },
                  { id: '9-12' as KidsAgeGroup, label: `9–12 ${t.yearsLabel}`, icon: <Star className="w-8 h-8 fill-current" /> },
                ].map((g) => {
                  const selected = ageGroup === g.id;
                  return (
                    <KidsSquishButton
                      key={g.id}
                      onClick={() => setAgeGroup(g.id)}
                      className={`p-4 rounded-3xl border-2 text-center flex flex-col items-center justify-center gap-2 ${
                        selected
                          ? 'bg-gradient-to-br from-sky-300 to-sky-500 text-zinc-950 border-sky-200 shadow-lg'
                          : 'bg-[#1C254D] hover:bg-[#253265] border-[#2E3C73] text-white'
                      }`}
                    >
                      <span>{g.icon}</span>
                      <span className="text-sm sm:text-base font-black">{g.label}</span>
                    </KidsSquishButton>
                  );
                })}
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-3">
              <p className="text-sm text-sky-200 font-bold">{t.wizMascotHint}</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {KIDS_MASCOTS.map((m) => {
                  const selected = mascotId === m.id;
                  return (
                    <KidsSquishButton
                      key={m.id}
                      onClick={() => setMascotId(m.id)}
                      className={`p-3 rounded-3xl border-2 text-center flex flex-col items-center justify-center gap-1.5 ${
                        selected
                          ? 'bg-gradient-to-br from-amber-300 to-amber-500 text-zinc-950 border-amber-200 shadow-lg'
                          : 'bg-[#1C254D] hover:bg-[#253265] border-[#2E3C73] text-white'
                      }`}
                    >
                      <div className="w-12 h-12 flex items-center justify-center">
                        <KidsAnimatedMascotSvg id={m.id} size={46} />
                      </div>
                      <span className="text-sm font-black">{m.name}</span>
                    </KidsSquishButton>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer Controls */}
        <div className="shrink-0 flex items-center justify-between gap-3 pt-3 border-t border-white/10">
          <KidsSquishButton
            onClick={handleBack}
            disabled={step === 1}
            className="px-5 rounded-2xl bg-white/10 hover:bg-white/20 text-white font-black text-sm flex items-center justify-center gap-2"
          >
            <ChevronLeft className="w-5 h-5 rtl:rotate-180" />
            <span>{t.wizBack}</span>
          </KidsSquishButton>

          <KidsSquishButton
            onClick={handleNext}
            sound={step === 4 ? 'success' : 'tap'}
            className="px-6 rounded-2xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-zinc-950 font-display font-black text-base flex items-center justify-center gap-2 shadow-lg"
          >
            <span>{step === 4 ? t.wizFinish : t.wizNext}</span>
            <ChevronRight className="w-5 h-5 rtl:rotate-180" />
          </KidsSquishButton>
        </div>
      </div>
    </div>
  );
};

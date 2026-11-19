import React from 'react';
import { Cast, Delete, Lock, Settings2 } from 'lucide-react';
import type { CatalogMovie, KidsLanguageCode } from '../../types';
import type { KidsUiCopy } from './kidsI18n';
import { KidsSpeakButton, KidsSquishButton } from './KidsPrimitives';

export type PinActionIntent = 'exit' | 'parent_settings' | 'cast_tv';

interface KidsPinGateModalProps {
  open: boolean;
  onClose: () => void;
  dir: 'ltr' | 'rtl';
  preferredLang: KidsLanguageCode;
  pinIntent: PinActionIntent;
  setPinIntent: (intent: PinActionIntent) => void;
  pendingCastMovie: CatalogMovie | null;
  pinDigits: string;
  setPinDigits: React.Dispatch<React.SetStateAction<string>>;
  pinError: boolean;
  handleDigitPress: (digit: string) => void;
  t: KidsUiCopy;
}

export const KidsPinGateModal: React.FC<KidsPinGateModalProps> = ({
  open,
  onClose,
  dir,
  preferredLang,
  pinIntent,
  setPinIntent,
  pendingCastMovie,
  pinDigits,
  setPinDigits,
  pinError,
  handleDigitPress,
  t,
}) => {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      dir={dir}
      className="fixed inset-0 z-[260] bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
    >
      <div className="w-full max-w-xs rounded-3xl bg-[#141B38] border-2 border-amber-400/40 p-5 shadow-2xl space-y-3.5 text-center">
        <div className="space-y-1">
          <div className="w-10 h-10 mx-auto rounded-2xl bg-amber-400/15 border border-amber-400/40 flex items-center justify-center text-amber-300">
            {pinIntent === 'parent_settings' ? (
              <Settings2 className="w-5 h-5" />
            ) : pinIntent === 'cast_tv' ? (
              <Cast className="w-5 h-5" />
            ) : (
              <Lock className="w-5 h-5" />
            )}
          </div>
          <h2 className="font-display font-extrabold text-lg text-white">
            {pinIntent === 'parent_settings'
              ? t.pinParentTitle
              : pinIntent === 'cast_tv'
              ? t.pinCastTitle
              : t.pinExitTitle}
          </h2>
          <p className="text-xs text-sky-200/75">
            {pinIntent === 'cast_tv' && pendingCastMovie
              ? pendingCastMovie.title
              : t.pinSubDefault}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#0B1024] border border-white/10">
          <button
            type="button"
            onClick={() => setPinIntent('exit')}
            className={`h-8 rounded-lg text-[11px] font-bold cursor-pointer ${
              pinIntent === 'exit' ? 'bg-amber-400 text-black' : 'text-zinc-300'
            }`}
          >
            {t.pinModeExit}
          </button>
          <button
            type="button"
            onClick={() => setPinIntent('parent_settings')}
            className={`h-8 rounded-lg text-[11px] font-bold cursor-pointer ${
              pinIntent === 'parent_settings' ? 'bg-sky-400 text-black' : 'text-zinc-300'
            }`}
          >
            {t.pinModeParent}
          </button>
        </div>

        <div className="flex items-center justify-center gap-3 py-1">
          {[0, 1, 2, 3].map((idx) => {
            const filled = idx < pinDigits.length;
            return (
              <span
                key={idx}
                className={`w-4 h-4 rounded-full border-2 transition-all ${
                  pinError
                    ? 'bg-rose-500 border-rose-300 scale-110'
                    : filled
                    ? 'bg-amber-400 border-amber-200 scale-110'
                    : 'bg-transparent border-white/30'
                }`}
              />
            );
          })}
        </div>

        {pinError && <p className="text-xs font-bold text-rose-400">{t.pinWrong}</p>}

        <div dir="ltr" className="grid grid-cols-3 gap-2.5">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
            <KidsSquishButton
              key={d}
              onClick={() => handleDigitPress(d)}
              className="rounded-2xl bg-[#1D264D] hover:bg-amber-400 hover:text-black border-b-4 border-[#0A0E1E] text-2xl font-display font-black text-white flex items-center justify-center"
            >
              {d}
            </KidsSquishButton>
          ))}
          <KidsSquishButton
            onClick={() => setPinDigits('')}
            className="rounded-2xl bg-white/[0.08] text-lg font-bold text-zinc-200 border-b-4 border-black/30 flex items-center justify-center"
          >
            C
          </KidsSquishButton>
          <KidsSquishButton
            onClick={() => handleDigitPress('0')}
            className="rounded-2xl bg-[#1D264D] hover:bg-amber-400 hover:text-black border-b-4 border-[#0A0E1E] text-2xl font-display font-black text-white flex items-center justify-center"
          >
            0
          </KidsSquishButton>
          <KidsSquishButton
            onClick={() => setPinDigits((p) => p.slice(0, -1))}
            ariaLabel="Delete"
            className="rounded-2xl bg-white/[0.08] text-zinc-200 border-b-4 border-black/30 flex items-center justify-center"
          >
            <Delete className="w-6 h-6" />
          </KidsSquishButton>
        </div>

        <div className="flex items-center gap-3 pt-1">
          <KidsSpeakButton text={t.pinSubDefault} lang={preferredLang} />
          <KidsSquishButton
            onClick={onClose}
            className="flex-1 rounded-2xl bg-amber-400 hover:bg-amber-300 border-b-4 border-amber-600 text-black font-display font-extrabold text-base flex items-center justify-center"
          >
            {t.keepPlaying}
          </KidsSquishButton>
        </div>
      </div>
    </div>
  );
};

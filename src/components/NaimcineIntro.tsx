import React, { useEffect } from 'react';
import { playNaimcineIntroSound, triggerHaptic } from '../utils/haptics';
import { NaimBrandLogo } from './NaimBrandLogo';

interface NaimcineIntroProps {
  onComplete: () => void;
  withSound?: boolean;
  subtitle?: string;
}

export const NaimcineIntro: React.FC<NaimcineIntroProps> = ({
  onComplete,
  withSound = false,
  subtitle,
}) => {
  useEffect(() => {
    if (withSound) {
      playNaimcineIntroSound();
      triggerHaptic('medium');
    }
    const timer = setTimeout(() => {
      onComplete();
    }, 2400);

    return () => clearTimeout(timer);
  }, [onComplete, withSound]);

  return (
    <div
      onClick={() => {
        playNaimcineIntroSound();
      }}
      className="fixed inset-0 z-50 bg-[#07080C] flex flex-col items-center justify-center overflow-hidden select-none"
      role="dialog"
      aria-label="NAIM CINE Intro"
    >
      {/* Clean Flat Precision Cinema Spectrum Lines */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none animate-naim-spectrum">
        <div className="w-[1px] h-[56vh] bg-gradient-to-b from-transparent via-white/25 to-transparent mx-6" />
        <div className="w-[2px] h-[78vh] bg-gradient-to-b from-transparent via-[#E11D48] to-transparent mx-4 opacity-85" />
        <div className="w-[260px] h-[260px] sm:w-[360px] sm:h-[360px] rounded-full bg-radial from-[#E11D48]/25 via-transparent to-transparent blur-3xl absolute" />
        <div className="w-[2px] h-[78vh] bg-gradient-to-b from-transparent via-[#E11D48] to-transparent mx-4 opacity-85" />
        <div className="w-[1px] h-[56vh] bg-gradient-to-b from-transparent via-white/25 to-transparent mx-6" />
      </div>

      {/* Animated Flat Architectural Brand Logo */}
      <div className="relative z-10 flex flex-col items-center gap-5 px-6 animate-naim-emblem">
        <NaimBrandLogo
          size={132}
          animated
          className="shadow-[0_0_70px_rgba(225,29,72,0.35)] rounded-[28px]"
        />
      </div>

      {/* Crisp Spaced Wordmark: NAIM CINE */}
      <div className="relative z-10 mt-6 text-center px-4 animate-naim-wordmark">
        <div className="font-display font-bold text-3xl sm:text-5xl text-white tracking-[0.22em]">
          NAIM <span className="text-[#E11D48]">CINE</span>
        </div>
        <p className="mt-2.5 text-[11px] sm:text-xs uppercase tracking-[0.24em] text-zinc-400 font-medium">
          {subtitle || 'Películas · Series · Fútbol · YouTube con tus Amigos'}
        </p>
      </div>

      {/* Skip Intro Button */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onComplete();
        }}
        className="absolute bottom-7 right-6 z-20 min-h-[42px] px-4 rounded-xl bg-white/[0.06] hover:bg-white/12 border border-white/12 text-xs font-medium text-zinc-200 transition-colors cursor-pointer"
      >
        Saltar intro
      </button>
    </div>
  );
};

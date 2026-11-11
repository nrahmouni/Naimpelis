import React, { useEffect, useState } from 'react';
import { playNaimcineIntroSound, triggerHaptic } from '../utils/haptics';
import naimLogo from '../assets/images/naimcine_brand_logo_1794356559353.jpg';

interface NaimcineIntroProps {
  onComplete: () => void;
  withSound?: boolean;
}

export const NaimcineIntro: React.FC<NaimcineIntroProps> = ({
  onComplete,
  withSound = false,
}) => {
  const [imgFailed, setImgFailed] = useState(false);

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
      className="fixed inset-0 z-50 bg-[#050508] flex flex-col items-center justify-center overflow-hidden select-none"
      role="dialog"
      aria-label="NAIMCINE Intro"
    >
      {/* Vertical Optical Light-Spectrum Refraction Bars (Netflix Prism Inspiration) */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none animate-naim-spectrum">
        <div className="w-[3px] h-[65vh] bg-gradient-to-b from-transparent via-[#E11D48] to-transparent blur-[1px] mx-2 opacity-80" />
        <div className="w-[8px] h-[85vh] bg-gradient-to-b from-transparent via-[#FB7185] to-transparent blur-[6px] mx-3 opacity-70" />
        <div className="w-[2px] h-[95vh] bg-gradient-to-b from-transparent via-fuchsia-500 to-transparent mx-1.5 opacity-90" />
        <div className="w-[260px] h-[260px] sm:w-[360px] sm:h-[360px] rounded-full bg-radial from-[#E11D48]/35 via-fuchsia-600/10 to-transparent blur-3xl absolute" />
        <div className="w-[2px] h-[95vh] bg-gradient-to-b from-transparent via-amber-400/80 to-transparent mx-1.5 opacity-75" />
        <div className="w-[8px] h-[85vh] bg-gradient-to-b from-transparent via-[#E11D48] to-transparent blur-[6px] mx-3 opacity-70" />
        <div className="w-[3px] h-[65vh] bg-gradient-to-b from-transparent via-rose-500 to-transparent blur-[1px] mx-2 opacity-80" />
      </div>

      {/* Center Volumetric NAIMCINE Prism-N Emblem */}
      <div className="relative z-10 flex flex-col items-center gap-5 px-6 animate-naim-emblem">
        <div className="w-28 h-28 sm:w-36 sm:h-36 rounded-3xl overflow-hidden border border-white/15 shadow-[0_0_80px_rgba(225,29,72,0.55)] bg-[#090A0F] flex items-center justify-center">
          {!imgFailed ? (
            <img
              src={naimLogo}
              alt="NAIMCINE"
              onError={() => setImgFailed(true)}
              className="w-full h-full object-cover scale-110"
            />
          ) : (
            <span className="font-display font-bold text-6xl text-[#E11D48]">N</span>
          )}
        </div>
      </div>

      {/* Kinematic Letter-Tracked Wordmark */}
      <div className="relative z-10 mt-6 text-center px-4 animate-naim-wordmark">
        <div className="font-display font-bold text-3xl sm:text-5xl text-white tracking-[0.22em]">
          NAIM<span className="text-[#E11D48]">CINE</span>
        </div>
        <p className="mt-2.5 text-[11px] sm:text-xs uppercase tracking-[0.24em] text-zinc-400 font-medium">
          Películas · Series · Fútbol · YouTube con tus Amigos
        </p>
      </div>

      {/* Skip Button */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onComplete();
        }}
        className="absolute bottom-7 right-6 z-20 min-h-[40px] px-4 rounded-xl bg-white/[0.07] hover:bg-white/15 border border-white/10 text-xs font-medium text-zinc-300 transition-colors cursor-pointer"
      >
        Saltar intro
      </button>
    </div>
  );
};

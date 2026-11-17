import React from 'react';
import { motion } from 'motion/react';
import { Volume2 } from 'lucide-react';
import type { KidsLanguageCode } from '../../types';
import { useKidsStore } from '../../store/useKidsStore';
import { playKidsSound, type KidsSoundEffect } from './kidsAudioEngine';
import { speakKidsText } from './kidsTtsHelper';

interface KidsSquishButtonProps {
  children: React.ReactNode;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  className?: string;
  ariaLabel?: string;
  title?: string;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
  sound?: KidsSoundEffect;
  speakOnPress?: string;
  speakLang?: KidsLanguageCode;
  'data-tv-focusable'?: string;
  autoFocus?: boolean;
}

/**
 * Tactile child-friendly button with TV D-Pad focus ring, mobile portrait/landscape
 * safe sizing (>= 48px touch target), squish motion, and synced sound + haptics.
 */
export const KidsSquishButton: React.FC<KidsSquishButtonProps> = ({
  children,
  onClick,
  className = '',
  ariaLabel,
  title,
  disabled = false,
  type = 'button',
  sound = 'tap',
  speakOnPress,
  speakLang,
  'data-tv-focusable': dataTvFocusable = 'true',
  autoFocus = false,
}) => {
  const soundEnabled = useKidsStore((s) => s.ux.soundEnabled);
  const lowStimulation = useKidsStore((s) => s.ux.lowStimulation);
  const activeLang = useKidsStore((s) => s.getActiveProfile().preferredLang);

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled) return;
    playKidsSound(sound, soundEnabled, true);
    if (speakOnPress) {
      void speakKidsText(speakOnPress, speakLang || activeLang);
    }
    onClick?.(e);
  };

  return (
    <motion.button
      type={type}
      disabled={disabled}
      aria-label={ariaLabel}
      title={title}
      autoFocus={autoFocus}
      data-tv-focusable={dataTvFocusable}
      onClick={handleClick}
      whileHover={disabled || lowStimulation ? undefined : { scale: 1.03 }}
      whileTap={disabled ? undefined : lowStimulation ? { scale: 0.97 } : { scale: 0.94, y: 2 }}
      transition={{ type: 'spring', stiffness: 460, damping: 22 }}
      className={`kids-touch-target min-w-[48px] min-h-[48px] sm:min-h-[54px] landscape:min-h-[44px] select-none cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-300 ${className}`}
    >
      {children}
    </motion.button>
  );
};

interface KidsSpeakButtonProps {
  text: string;
  lang?: KidsLanguageCode;
  ariaLabel?: string;
  className?: string;
  size?: 'md' | 'lg';
}

/**
 * Dedicated speech synthesis button for pre-readers and Tarifit pronunciation.
 */
export const KidsSpeakButton: React.FC<KidsSpeakButtonProps> = ({
  text,
  lang,
  ariaLabel = 'Escuchar pronunciación',
  className = '',
  size = 'md',
}) => {
  const soundEnabled = useKidsStore((s) => s.ux.soundEnabled);
  const lowStimulation = useKidsStore((s) => s.ux.lowStimulation);
  const activeLang = useKidsStore((s) => s.getActiveProfile().preferredLang);

  const dim = size === 'lg' ? 'w-14 h-14 sm:w-16 sm:h-16' : 'w-12 h-12 sm:w-14 sm:h-14';

  return (
    <motion.button
      type="button"
      data-tv-focusable="true"
      aria-label={ariaLabel}
      title={ariaLabel}
      onClick={(e) => {
        e.stopPropagation();
        playKidsSound('tap', soundEnabled, true);
        void speakKidsText(text, lang || activeLang);
      }}
      whileHover={lowStimulation ? undefined : { scale: 1.06 }}
      whileTap={{ scale: 0.92 }}
      transition={{ type: 'spring', stiffness: 440, damping: 18 }}
      className={`kids-touch-target ${dim} rounded-full bg-amber-300 hover:bg-amber-400 text-slate-950 border-b-4 border-amber-500 shadow-md flex items-center justify-center shrink-0 cursor-pointer focus:outline-none focus-visible:ring-4 focus-visible:ring-sky-400 ${className}`}
    >
      <Volume2 className={size === 'lg' ? 'w-6 h-6 sm:w-7 sm:h-7' : 'w-5 h-5 sm:w-6 sm:h-6'} />
    </motion.button>
  );
};

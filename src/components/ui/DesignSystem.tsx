import React, { useId, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  X,
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  Maximize2,
  Sparkles,
  Unlink,
  Tv,
  Hand,
  Subtitles,
} from 'lucide-react';
import type { AppLanguage } from '../../types';
import { pickLang } from '../../utils/i18n';
import { useFocusTrap } from '../../utils/useFocusTrap';

// ============================================================================
// 1. SINGLE SOURCE OF TRUTH: BUTTONS & INPUTS (Min 44x44px Touch Target)
// ============================================================================

export interface PrimaryButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  fullWidth?: boolean;
  size?: 'md' | 'lg';
}

export const PrimaryButton: React.FC<PrimaryButtonProps> = ({
  children,
  fullWidth = false,
  size = 'md',
  className = '',
  ...props
}) => {
  const sizeClass =
    size === 'lg'
      ? 'min-h-12 px-6 py-3 text-sm rounded-2xl'
      : 'min-h-11 px-4 py-2.5 text-xs rounded-2xl';
  return (
    <button
      {...props}
      className={`group relative overflow-hidden inline-flex items-center justify-center gap-2 font-bold text-white bg-gradient-to-b from-[#9E5CFF] to-[#7C2AE8] hover:from-[#A96EFF] hover:to-[#8738F5] active:scale-[0.97] transition-all duration-150 shadow-[0_8px_24px_rgba(145,70,255,0.34),inset_0_1px_0_rgba(255,255,255,0.28)] disabled:opacity-45 disabled:pointer-events-none select-none cursor-pointer ${
        fullWidth ? 'w-full' : ''
      } ${sizeClass} ${className}`}
    >
      {children}
    </button>
  );
};

export interface SecondaryButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  fullWidth?: boolean;
  active?: boolean;
  size?: 'md' | 'lg';
}

export const SecondaryButton: React.FC<SecondaryButtonProps> = ({
  children,
  fullWidth = false,
  active = false,
  size = 'md',
  className = '',
  ...props
}) => {
  const sizeClass =
    size === 'lg'
      ? 'min-h-12 px-6 py-3 text-sm rounded-2xl'
      : 'min-h-11 px-4 py-2.5 text-xs rounded-2xl';
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 font-semibold backdrop-blur-xl active:scale-[0.97] transition-all duration-150 disabled:opacity-45 disabled:pointer-events-none select-none cursor-pointer border shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] ${
        active
          ? 'bg-[#9146FF]/22 border-[#9146FF]/60 text-white shadow-[0_0_22px_rgba(145,70,255,0.26),inset_0_1px_0_rgba(255,255,255,0.16)]'
          : 'bg-white/[0.055] hover:bg-white/[0.11] border-white/[0.09] hover:border-white/[0.18] text-zinc-100 hover:text-white'
      } ${fullWidth ? 'w-full' : ''} ${sizeClass} ${className}`}
    >
      {children}
    </button>
  );
};

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  active?: boolean;
  variant?: 'glass' | 'ghost' | 'crimson';
}

export const IconButton: React.FC<IconButtonProps> = ({
  children,
  active = false,
  variant = 'glass',
  className = '',
  ...props
}) => {
  const variantClasses =
    variant === 'crimson'
      ? 'bg-gradient-to-b from-[#9E5CFF] to-[#7C2AE8] hover:from-[#A96EFF] hover:to-[#8738F5] text-white border border-white/20 shadow-[0_8px_20px_rgba(145,70,255,0.34)]'
      : variant === 'ghost'
      ? active
        ? 'bg-white/15 text-white'
        : 'bg-transparent hover:bg-white/[0.09] text-zinc-300 hover:text-white'
      : active
      ? 'bg-[#9146FF]/24 border border-[#9146FF]/60 text-white shadow-[0_0_18px_rgba(145,70,255,0.3)]'
      : 'bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.09] hover:border-white/[0.18] text-zinc-200 hover:text-white backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]';

  return (
    <button
      {...props}
      className={`min-h-11 min-w-11 rounded-2xl inline-flex items-center justify-center active:scale-90 transition-all duration-150 select-none cursor-pointer shrink-0 ${variantClasses} ${className}`}
    >
      {children}
    </button>
  );
};

export interface StandardInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode;
  rightElement?: React.ReactNode;
}

export const StandardInput = React.forwardRef<HTMLInputElement, StandardInputProps>(
  ({ icon, rightElement, className = '', ...props }, ref) => {
    return (
      <div className="relative flex items-center w-full group">
        {icon && (
          <div className="absolute left-3.5 text-zinc-400 group-focus-within:text-[#BF94FF] transition-colors pointer-events-none flex items-center justify-center">
            {icon}
          </div>
        )}
        <input
          ref={ref}
          {...props}
          className={`w-full min-h-11 ${icon ? 'pl-10' : 'pl-4'} ${
            rightElement ? 'pr-12' : 'pr-4'
          } py-2.5 rounded-2xl bg-white/[0.045] hover:bg-white/[0.07] focus:bg-white/[0.085] border border-white/[0.09] focus:border-[#9146FF] focus:shadow-[0_0_0_3px_rgba(145,70,255,0.18)] text-sm text-white placeholder:text-zinc-500 focus:outline-none transition-all ${className}`}
        />
        {rightElement && (
          <div className="absolute right-1.5 flex items-center justify-center">
            {rightElement}
          </div>
        )}
      </div>
    );
  }
);
StandardInput.displayName = 'StandardInput';

// ============================================================================
// 2. PROGRESSIVE DISCLOSURE: SPRING-ANIMATED UNIVERSAL BOTTOM SHEET
// ============================================================================

export interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  maxWidth?: string;
  lang?: AppLanguage;
}

export const BottomSheet: React.FC<BottomSheetProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  icon,
  children,
  maxWidth = 'sm:max-w-lg',
  lang = 'es',
}) => {
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  useFocusTrap(isOpen, onClose, sheetRef);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="fixed inset-0 z-[190] bg-black/75 backdrop-blur-md flex items-end sm:items-center justify-center sm:p-4 overflow-x-hidden"
          onClick={onClose}
        >
          <motion.div
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            initial={{ opacity: 0, y: 28, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 420, damping: 34, mass: 0.9 }}
            className={`w-full min-w-0 max-w-full ${maxWidth} rounded-t-3xl sm:rounded-3xl bg-[#141418]/96 backdrop-blur-2xl border-t sm:border border-white/[0.12] shadow-[0_-24px_80px_rgba(0,0,0,0.92),inset_0_1px_0_rgba(255,255,255,0.12)] overflow-hidden flex flex-col max-h-[88dvh] outline-none`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag handle for mobile feel */}
            <div className="pt-2.5 pb-1 flex justify-center sm:hidden">
              <div className="w-10 h-1.5 rounded-full bg-white/25" />
            </div>

            {/* Header */}
            <div className="px-4 sm:px-5 py-3.5 border-b border-white/[0.07] flex items-center justify-between gap-3 bg-gradient-to-b from-white/[0.03] to-transparent min-w-0">
              <div className="flex items-center gap-3 min-w-0">
                {icon && (
                  <div className="w-10 h-10 rounded-2xl bg-[#9146FF]/18 border border-[#9146FF]/35 flex items-center justify-center text-[#BF94FF] shrink-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]">
                    {icon}
                  </div>
                )}
                <div className="min-w-0">
                  <h3 id={titleId} className="font-display text-base font-bold text-white tracking-tight truncate">
                    {title}
                  </h3>
                  {subtitle && (
                    <p className="text-xs text-zinc-400 truncate mt-0.5">{subtitle}</p>
                  )}
                </div>
              </div>
              <IconButton
                onClick={onClose}
                variant="ghost"
                aria-label={pickLang(lang, { es: 'Cerrar menú', ca: 'Tancar menú', en: 'Close menu' })}
              >
                <X className="w-5 h-5" />
              </IconButton>
            </div>

            {/* Body */}
            <div className="p-4 sm:p-5 overflow-y-auto overflow-x-hidden min-w-0 w-full custom-scrollbar space-y-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
              {children}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// ============================================================================
// 3. FLOATING SPRING-SLIDING SEGMENTED CONTROL
// ============================================================================

export interface SegmentedOption<T extends string> {
  id: T;
  label: string;
  icon?: React.ReactNode;
  badge?: string | number;
}

export interface SegmentedControlProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  layoutId?: string;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className = '',
  layoutId,
}: SegmentedControlProps<T>) {
  const autoId = useId();
  const pillId = layoutId || `seg-pill-${autoId}`;

  return (
    <div
      className={`w-full min-w-0 p-1 rounded-2xl bg-white/[0.04] backdrop-blur-xl border border-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] flex items-center gap-1 overflow-hidden ${className}`}
    >
      {options.map((option) => {
        const isActive = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            className={`relative flex-1 min-w-0 min-h-11 px-1.5 sm:px-3 py-2 rounded-xl text-[11px] sm:text-xs font-bold transition-colors duration-150 flex items-center justify-center gap-1 sm:gap-1.5 select-none cursor-pointer active:scale-[0.98] ${
              isActive ? 'text-white' : 'text-zinc-400 hover:text-zinc-100'
            }`}
          >
            {isActive && (
              <motion.span
                layoutId={pillId}
                transition={{ type: 'spring', stiffness: 480, damping: 36 }}
                className="absolute inset-0 rounded-xl bg-gradient-to-b from-[#9E5CFF] to-[#7C2AE8] shadow-[0_4px_16px_rgba(145,70,255,0.42),inset_0_1px_0_rgba(255,255,255,0.26)]"
                aria-hidden="true"
              />
            )}
            <span className="relative z-10 flex items-center justify-center gap-1 sm:gap-1.5 min-w-0 max-w-full">
              {option.icon && <span className="shrink-0">{option.icon}</span>}
              <span className="truncate">{option.label}</span>
              {option.badge !== undefined && option.badge !== 0 && option.badge !== '0' && (
                <span
                  className={`px-1.5 py-0.5 rounded-full text-[0.65rem] font-mono font-bold leading-none tabular-nums shrink-0 ${
                    isActive ? 'bg-black/30 text-white' : 'bg-white/10 text-zinc-200'
                  }`}
                >
                  {option.badge}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ============================================================================
// 4. VISUAL STATES: SKELETON LOADERS & FRIENDLY EMPTY STATES
// ============================================================================

export const SkeletonPosterGrid: React.FC<{ count?: number; aspect?: 'poster' | 'video' }> = ({
  count = 10,
  aspect = 'poster',
}) => {
  return (
    <div
      className={
        aspect === 'poster'
          ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5 sm:gap-4'
          : 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4'
      }
    >
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={idx}
          className={`relative overflow-hidden rounded-2xl bg-white/[0.04] border border-white/[0.06] skeleton-shimmer ${
            aspect === 'poster' ? 'aspect-[2/3]' : 'aspect-video'
          }`}
        >
          <div className="absolute inset-x-0 bottom-0 p-3.5 space-y-2 bg-gradient-to-t from-black/80 to-transparent">
            <div className="h-3.5 w-3/4 rounded-full bg-white/10" />
            <div className="h-2.5 w-1/2 rounded-full bg-white/10" />
          </div>
        </div>
      ))}
    </div>
  );
};

export interface EmptyStateCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export const EmptyStateCard: React.FC<EmptyStateCardProps> = ({
  icon,
  title,
  description,
  actionLabel,
  onAction,
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="py-12 px-6 rounded-3xl bg-white/[0.025] border border-white/[0.07] text-center max-w-md mx-auto my-4 flex flex-col items-center shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
    >
      <div className="w-14 h-14 rounded-2xl bg-[#9146FF]/15 border border-[#9146FF]/30 flex items-center justify-center text-[#BF94FF] mb-3.5 shadow-inner">
        {icon}
      </div>
      <h4 className="font-display text-base font-bold text-white tracking-tight">{title}</h4>
      <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">{description}</p>
      {actionLabel && onAction && (
        <div className="mt-4">
          <SecondaryButton onClick={onAction}>{actionLabel}</SecondaryButton>
        </div>
      )}
    </motion.div>
  );
};

// ============================================================================
// 5. HAPTIC TOUCH SMART TV REMOTE (Eyes-Free Trackpad + Volume Slider)
// ============================================================================

export interface HapticTvRemoteProps {
  pairedTvCode: string;
  isPlaying?: boolean;
  lang?: AppLanguage;
  onCommand: (
    action:
      | 'toggle_play'
      | 'seek_delta'
      | 'toggle_mute'
      | 'volume_delta'
      | 'set_volume'
      | 'force_sync'
      | 'toggle_fullscreen'
      | 'cycle_aspect'
      | 'toggle_ambilight'
      | 'cycle_subtitles'
      | 'cycle_audio',
    value?: number
  ) => void;
  onDisconnect: () => void;
}

export const HapticTvRemote: React.FC<HapticTvRemoteProps> = ({
  pairedTvCode,
  isPlaying = false,
  lang = 'es',
  onCommand,
  onDisconnect,
}) => {
  const [volume, setVolume] = useState<number>(85);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [touchFeedback, setTouchFeedback] = useState<string | null>(null);
  const [showAdvancedTvTools, setShowAdvancedTvTools] = useState(false);

  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const lastTapRef = useRef<number>(0);

  const triggerHaptic = (label: string, ms = 18) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(ms);
      }
    } catch {
      // ignore
    }
    setTouchFeedback(label);
    window.setTimeout(() => {
      setTouchFeedback((prev) => (prev === label ? null : prev));
    }, 900);
  };

  const handleTrackpadPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    touchStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      time: Date.now(),
    };
  };

  const handleTrackpadPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start) return;

    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);

    if (absX > 36 && absX > absY) {
      if (dx < 0) {
        onCommand('seek_delta', -15);
        triggerHaptic(pickLang(lang, { es: '⏪ -15 seg en TV', ca: '⏪ -15 s a la TV', en: '⏪ -15s on TV' }), 22);
      } else {
        onCommand('seek_delta', 15);
        triggerHaptic(pickLang(lang, { es: '⏩ +15 seg en TV', ca: '⏩ +15 s a la TV', en: '⏩ +15s on TV' }), 22);
      }
      return;
    }

    if (absY > 36 && absY > absX) {
      if (dy < 0) {
        const nextVol = Math.min(100, volume + 10);
        setVolume(nextVol);
        onCommand('volume_delta', 0.1);
        triggerHaptic(pickLang(lang, { es: `🔊 Volumen ${nextVol}%`, ca: `🔊 Volum ${nextVol}%`, en: `🔊 Volume ${nextVol}%` }), 16);
      } else {
        const nextVol = Math.max(0, volume - 10);
        setVolume(nextVol);
        onCommand('volume_delta', -0.1);
        triggerHaptic(pickLang(lang, { es: `🔉 Volumen ${nextVol}%`, ca: `🔉 Volum ${nextVol}%`, en: `🔉 Volume ${nextVol}%` }), 16);
      }
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width;
    const now = Date.now();

    if (now - lastTapRef.current < 280) {
      lastTapRef.current = 0;
      onCommand('toggle_fullscreen');
      triggerHaptic(pickLang(lang, { es: '⛶ Pantalla Completa TV', ca: '⛶ Pantalla Completa TV', en: '⛶ TV Fullscreen' }), 30);
      return;
    }
    lastTapRef.current = now;

    if (relX < 0.28) {
      onCommand('seek_delta', -15);
      triggerHaptic('⏪ -15s', 18);
    } else if (relX > 0.72) {
      onCommand('seek_delta', 15);
      triggerHaptic('⏩ +15s', 18);
    } else {
      onCommand('toggle_play');
      triggerHaptic(pickLang(lang, { es: '⏯ Play / Pausa TV', ca: '⏯ Reproduir / Pausa TV', en: '⏯ TV Play / Pause' }), 24);
    }
  };

  const handleVolumeSlider = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = Number(e.target.value);
    const delta = (next - volume) / 100;
    setVolume(next);
    setIsMuted(next === 0);
    if (Math.abs(delta) >= 0.02) {
      onCommand('volume_delta', delta);
    }
  };

  return (
    <div className="space-y-4 select-none">
      {/* Status Row */}
      <div className="flex items-center justify-between px-4 py-2.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/25">
        <div className="flex items-center gap-2.5">
          <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0 shadow-[0_0_8px_#34d399]" />
          <span className="text-xs font-bold text-emerald-300 tabular-nums">
            {pickLang(lang, {
              es: `TV Conectada · #${pairedTvCode}`,
              ca: `TV Connectada · #${pairedTvCode}`,
              en: `TV Connected · #${pairedTvCode}`,
            })}
          </span>
        </div>
        <button
          type="button"
          onClick={onDisconnect}
          className="min-h-[36px] px-2.5 rounded-xl text-[11px] font-semibold text-zinc-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors flex items-center gap-1 cursor-pointer"
        >
          <Unlink className="w-3.5 h-3.5" />
          {pickLang(lang, { es: 'Desconectar', ca: 'Desconnectar', en: 'Disconnect' })}
        </button>
      </div>

      {/* Central Haptic Touchpad */}
      <div
        onPointerDown={handleTrackpadPointerDown}
        onPointerUp={handleTrackpadPointerUp}
        className="relative h-44 sm:h-48 rounded-3xl bg-[radial-gradient(ellipse_at_50%_0%,rgba(145,70,255,0.18),rgba(255,255,255,0.02)_70%)] border border-white/[0.12] shadow-[inset_0_1px_1px_rgba(255,255,255,0.18),0_16px_40px_rgba(0,0,0,0.6)] flex flex-col items-center justify-center overflow-hidden touch-none cursor-pointer active:scale-[0.99] transition-transform"
      >
        <div className="absolute inset-y-6 left-1/4 w-px bg-white/[0.06] pointer-events-none" />
        <div className="absolute inset-y-6 right-1/4 w-px bg-white/[0.06] pointer-events-none" />

        <div className="w-full px-6 flex items-center justify-between text-zinc-500 pointer-events-none">
          <div className="flex flex-col items-center gap-1">
            <RotateCcw className="w-5 h-5 text-zinc-400" />
            <span className="text-[10px] font-mono uppercase tracking-wider">-15s</span>
          </div>

          <div className="flex flex-col items-center gap-1.5">
            <div className="w-12 h-12 rounded-2xl bg-[#9146FF]/15 border border-[#9146FF]/35 flex items-center justify-center text-zinc-200 shadow-[0_0_24px_rgba(145,70,255,0.2)]">
              <Hand className="w-5 h-5 text-[#BF94FF]" />
            </div>
            <span className="font-display text-xs font-bold text-zinc-100 tracking-tight">
              {pickLang(lang, { es: 'Trackpad Táctil', ca: 'Trackpad Tàctil', en: 'Touch Trackpad' })}
            </span>
            <span className="text-[10px] text-zinc-400 text-center max-w-[11rem]">
              {pickLang(lang, {
                es: 'Toca para Pausa · Desliza para avanzar o volumen',
                ca: 'Toca per Pausa · Llisca per avançar o volum',
                en: 'Tap to Pause · Swipe to seek or adjust volume',
              })}
            </span>
          </div>

          <div className="flex flex-col items-center gap-1">
            <RotateCw className="w-5 h-5 text-zinc-400" />
            <span className="text-[10px] font-mono uppercase tracking-wider">+15s</span>
          </div>
        </div>

        <AnimatePresence>
          {touchFeedback && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.95 }}
              transition={{ duration: 0.16 }}
              className="absolute inset-x-8 bottom-3 py-1.5 px-3 rounded-full bg-[#9146FF] text-white text-xs font-bold text-center shadow-lg"
            >
              {touchFeedback}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Hero Play / Pause + Quick Seek Row */}
      <div className="grid grid-cols-3 gap-2.5">
        <SecondaryButton
          onClick={() => {
            onCommand('seek_delta', -15);
            triggerHaptic('⏪ -15s');
          }}
          className="min-h-[54px]"
        >
          <RotateCcw className="w-5 h-5" />
          <span>-15s</span>
        </SecondaryButton>

        <PrimaryButton
          onClick={() => {
            onCommand('toggle_play');
            triggerHaptic(pickLang(lang, { es: '⏯ Play / Pausa', ca: '⏯ Reproduir / Pausa', en: '⏯ Play / Pause' }));
          }}
          className="min-h-[54px] text-sm"
        >
          {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current" />}
          <span>{pickLang(lang, { es: 'Play / Pausa', ca: 'Reproduir / Pausa', en: 'Play / Pause' })}</span>
        </PrimaryButton>

        <SecondaryButton
          onClick={() => {
            onCommand('seek_delta', 15);
            triggerHaptic('⏩ +15s');
          }}
          className="min-h-[54px]"
        >
          <RotateCw className="w-5 h-5" />
          <span>+15s</span>
        </SecondaryButton>
      </div>

      {/* Fluid Volume Slider + Mute */}
      <div className="p-3.5 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center gap-3">
        <IconButton
          onClick={() => {
            setIsMuted((prev) => !prev);
            onCommand('toggle_mute');
            triggerHaptic(
              isMuted
                ? pickLang(lang, { es: '🔊 Sonido activo', ca: '🔊 So activat', en: '🔊 Sound on' })
                : pickLang(lang, { es: '🔇 Silenciado', ca: '🔇 Silenciat', en: '🔇 Muted' })
            );
          }}
          active={isMuted}
          aria-label={pickLang(lang, { es: 'Silenciar TV', ca: 'Silenciar TV', en: 'Mute TV' })}
        >
          {isMuted || volume === 0 ? (
            <VolumeX className="w-5 h-5 text-rose-400" />
          ) : (
            <Volume2 className="w-5 h-5 text-zinc-200" />
          )}
        </IconButton>

        <div className="flex-1 flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-300">
            <span>{pickLang(lang, { es: 'Volumen TV', ca: 'Volum TV', en: 'TV Volume' })}</span>
            <span className="font-mono text-zinc-400 tabular-nums">{isMuted ? 'MUTE' : `${volume}%`}</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={isMuted ? 0 : volume}
            onChange={handleVolumeSlider}
            aria-label={pickLang(lang, { es: 'Control de volumen TV', ca: 'Control de volum TV', en: 'TV volume slider' })}
            className="cinema-range w-full h-2 rounded-full accent-[#9146FF] bg-white/15 cursor-pointer"
          />
        </div>
      </div>

      {/* Progressive Disclosure: Secondary TV Actions */}
      <div className="flex items-center gap-2">
        <SecondaryButton
          onClick={() => {
            onCommand('toggle_fullscreen');
            triggerHaptic(pickLang(lang, { es: '⛶ Pantalla Completa TV', ca: '⛶ Pantalla Completa TV', en: '⛶ TV Fullscreen' }));
          }}
          fullWidth
        >
          <Maximize2 className="w-4 h-4 text-[#BF94FF]" />
          <span>{pickLang(lang, { es: 'Pantalla Completa TV', ca: 'Pantalla Completa TV', en: 'TV Fullscreen' })}</span>
        </SecondaryButton>

        <SecondaryButton
          onClick={() => setShowAdvancedTvTools((prev) => !prev)}
          active={showAdvancedTvTools}
          aria-label={pickLang(lang, { es: 'Ajustes de imagen TV', ca: 'Ajustos d’imatge TV', en: 'TV picture settings' })}
        >
          <Tv className="w-4 h-4" />
          <span>{pickLang(lang, { es: 'Ajustes TV', ca: 'Ajustos TV', en: 'TV Settings' })}</span>
        </SecondaryButton>
      </div>

      <AnimatePresence>
        {showAdvancedTvTools && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
              <SecondaryButton
                onClick={() => {
                  onCommand('cycle_subtitles');
                  triggerHaptic(pickLang(lang, { es: '💬 Subtítulos TV', ca: '💬 Subtítols TV', en: '💬 TV Subtitles' }));
                }}
                className="text-[11px] px-2"
              >
                <Subtitles className="w-3.5 h-3.5 text-zinc-300" />
                <span>{pickLang(lang, { es: 'Subtítulos', ca: 'Subtítols', en: 'Subtitles' })}</span>
              </SecondaryButton>
              <SecondaryButton
                onClick={() => {
                  onCommand('cycle_audio');
                  triggerHaptic(pickLang(lang, { es: '🔊 Audio TV', ca: '🔊 Àudio TV', en: '🔊 TV Audio' }));
                }}
                className="text-[11px] px-2"
              >
                <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>{pickLang(lang, { es: 'Audio TV', ca: 'Àudio TV', en: 'TV Audio' })}</span>
              </SecondaryButton>
              <SecondaryButton
                onClick={() => {
                  onCommand('cycle_aspect');
                  triggerHaptic(pickLang(lang, { es: '📐 Formato', ca: '📐 Format', en: '📐 Aspect' }));
                }}
                className="text-[11px] px-2"
              >
                <span>{pickLang(lang, { es: 'Rellenar', ca: 'Omplir', en: 'Fill' })}</span>
              </SecondaryButton>
              <SecondaryButton
                onClick={() => {
                  onCommand('toggle_ambilight');
                  triggerHaptic('✨ Ambilight TV');
                }}
                className="text-[11px] px-2"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Ambilight</span>
              </SecondaryButton>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

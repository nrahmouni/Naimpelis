import React, { useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  Maximize2,
  Unlink,
  Subtitles,
} from 'lucide-react';
import type { AppLanguage } from '../../types';
import { pickLang } from '../../utils/i18n';
import { useFocusTrap } from '../../utils/useFocusTrap';
import { PosterImage } from './PosterImage';
import {
  RiffanCloseIcon,
  RiffanRetryIcon,
  RiffanSpinner,
  RiffanWarningIcon,
} from './RiffanIcons';

// ============================================================================
// 1. SINGLE SOURCE OF TRUTH: BUTTONS & INPUTS (Min 48px Touch Target)
// ============================================================================

export interface PrimaryButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  fullWidth?: boolean;
  size?: 'md' | 'lg';
  loading?: boolean;
}

export const PrimaryButton: React.FC<PrimaryButtonProps> = ({
  children,
  fullWidth = false,
  size = 'md',
  loading = false,
  disabled,
  className = '',
  ...props
}) => {
  const sizeClass =
    size === 'lg'
      ? 'min-h-12 px-6 py-3 text-sm rounded-2xl'
      : 'min-h-12 px-4 py-2.5 text-xs rounded-2xl';
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={`group relative overflow-hidden inline-flex items-center justify-center gap-2 font-bold text-white bg-[#9146FF] hover:bg-[#7C2AE8] active:scale-[0.97] transition-all duration-150 shadow-[0_6px_18px_rgba(145,70,255,0.28)] disabled:opacity-45 disabled:pointer-events-none select-none cursor-pointer ${
        fullWidth ? 'w-full' : ''
      } ${sizeClass} ${className}`}
    >
      {loading ? <RiffanSpinner size={16} tone="current" className="shrink-0" /> : null}
      {children}
    </button>
  );
};

export interface SecondaryButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  fullWidth?: boolean;
  active?: boolean;
  size?: 'md' | 'lg';
  loading?: boolean;
}

export const SecondaryButton: React.FC<SecondaryButtonProps> = ({
  children,
  fullWidth = false,
  active = false,
  size = 'md',
  loading = false,
  disabled,
  className = '',
  ...props
}) => {
  const sizeClass =
    size === 'lg'
      ? 'min-h-12 px-6 py-3 text-sm rounded-2xl'
      : 'min-h-12 px-4 py-2.5 text-xs rounded-2xl';
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 font-semibold active:scale-[0.97] transition-all duration-150 disabled:opacity-45 disabled:pointer-events-none select-none cursor-pointer border ${
        active
          ? 'bg-[#9146FF]/22 border-[#9146FF]/60 text-white'
          : 'bg-white/[0.06] hover:bg-white/[0.11] border-white/[0.1] hover:border-white/[0.18] text-zinc-100 hover:text-white'
      } ${fullWidth ? 'w-full' : ''} ${sizeClass} ${className}`}
    >
      {loading ? <RiffanSpinner size={16} className="shrink-0" /> : null}
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
      ? 'bg-[#9146FF] hover:bg-[#7C2AE8] text-white border border-white/15'
      : variant === 'ghost'
      ? active
        ? 'bg-white/15 text-white'
        : 'bg-transparent hover:bg-white/[0.09] text-zinc-300 hover:text-white'
      : active
      ? 'bg-[#9146FF]/24 border border-[#9146FF]/60 text-white'
      : 'bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-zinc-200 hover:text-white';

  return (
    <button
      {...props}
      className={`min-h-12 min-w-12 rounded-2xl inline-flex items-center justify-center active:scale-95 transition-all duration-150 select-none cursor-pointer shrink-0 ${variantClasses} ${className}`}
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
          className={`w-full min-h-12 ${icon ? 'pl-10' : 'pl-4'} ${
            rightElement ? 'pr-12' : 'pr-4'
          } py-2.5 rounded-2xl bg-white/[0.05] hover:bg-white/[0.07] focus:bg-white/[0.085] border border-white/[0.1] focus:border-[#9146FF] focus:ring-2 focus:ring-[#9146FF]/50 text-sm text-white placeholder:text-zinc-500 focus:outline-none transition-all duration-150 ${className}`}
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

  const content = (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
          className="fixed inset-0 z-[235] bg-black/85 backdrop-blur-xl flex items-end sm:items-center justify-center sm:p-4 overflow-x-clip"
          onClick={onClose}
        >
          <motion.div
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.45 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 90 || info.velocity.y > 480) {
                onClose();
              }
            }}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className={`w-full min-w-0 max-w-full ${maxWidth} rounded-t-3xl sm:rounded-3xl bg-[#141418] border-t sm:border border-white/[0.1] shadow-[0_-24px_80px_rgba(0,0,0,0.92)] overflow-hidden flex flex-col max-h-[88dvh] outline-none`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag handle for mobile swipe-to-dismiss feel */}
            <div className="pt-2.5 pb-1 flex justify-center sm:hidden touch-none">
              <div className="w-10 h-1 rounded-full bg-white/25" />
            </div>

            {/* Header */}
            <div className="px-4 sm:px-5 py-3 border-b border-white/[0.07] flex items-center justify-between gap-3 min-w-0">
              <div className="flex items-center gap-3 min-w-0">
                {icon && (
                  <div className="w-10 h-10 rounded-2xl bg-[#9146FF]/18 border border-[#9146FF]/35 flex items-center justify-center text-[#BF94FF] shrink-0">
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
                aria-label={pickLang(lang, { es: 'Cerrar', ca: 'Tancar', en: 'Close' })}
              >
                <RiffanCloseIcon size={20} animate="hover" />
              </IconButton>
            </div>

            {/* Body */}
            <div className="p-4 sm:p-5 overflow-y-auto overflow-x-clip min-w-0 w-full custom-scrollbar space-y-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
              {children}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  if (typeof document !== 'undefined') {
    return createPortal(content, document.body);
  }
  return content;
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
  compact?: boolean;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className = '',
  layoutId,
  compact = false,
}: SegmentedControlProps<T>) {
  const autoId = useId();
  const pillId = layoutId || `seg-pill-${autoId}`;

  return (
    <div
      className={`${
        compact
          ? 'w-auto inline-flex p-0.5 rounded-xl gap-0.5'
          : 'w-full min-w-0 p-1 rounded-2xl flex items-center gap-1'
      } bg-white/[0.04] border border-white/[0.08] items-center overflow-hidden ${className}`}
    >
      {options.map((option) => {
        const isActive = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            className={`relative flex items-center justify-center select-none cursor-pointer active:scale-[0.98] transition-colors duration-150 ${
              compact
                ? 'flex-none min-h-10 px-2.5 py-1 rounded-lg text-xs font-semibold gap-1'
                : 'flex-1 min-w-0 min-h-12 px-2 sm:px-3 py-2 rounded-xl text-xs font-bold gap-1 sm:gap-1.5'
            } ${isActive ? 'text-white' : 'text-zinc-400 hover:text-zinc-100'}`}
          >
            {isActive && (
              <motion.span
                layoutId={pillId}
                transition={{ duration: 0.16, ease: 'easeOut' }}
                className={`absolute inset-0 ${
                  compact ? 'rounded-lg' : 'rounded-xl'
                } bg-[#9146FF]`}
                aria-hidden="true"
              />
            )}
            <span className="relative z-10 flex items-center justify-center gap-1 min-w-0 max-w-full">
              {option.icon && <span className="shrink-0">{option.icon}</span>}
              <span className="truncate">{option.label}</span>
              {option.badge !== undefined && option.badge !== 0 && option.badge !== '0' && (
                <span
                  className={`${
                    compact ? 'px-1 py-0.5 text-[9px]' : 'px-1.5 py-0.5 text-[0.65rem]'
                  } rounded-full font-mono font-bold leading-none tabular-nums shrink-0 ${
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
// 5. SIMPLE COMPACT SMART TV REMOTE (Zero Trackpad, Fits Single Screen)
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
    <div className="space-y-2.5 select-none">
      {/* Compact Connected Status + Live Feedback */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/25">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0 shadow-[0_0_8px_#34d399]" />
          <span className="text-xs font-bold text-emerald-300 tabular-nums truncate">
            {touchFeedback ||
              pickLang(lang, {
                es: `TV Conectada · #${pairedTvCode}`,
                ca: `TV Connectada · #${pairedTvCode}`,
                en: `TV Connected · #${pairedTvCode}`,
              })}
          </span>
        </div>
        <button
          type="button"
          onClick={onDisconnect}
          className="min-h-[32px] px-2 rounded-lg text-[11px] font-semibold text-zinc-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors flex items-center gap-1 shrink-0 cursor-pointer"
        >
          <Unlink className="w-3.5 h-3.5" />
          {pickLang(lang, { es: 'Desconectar', ca: 'Desconnectar', en: 'Disconnect' })}
        </button>
      </div>

      {/* Primary Playback Row */}
      <div className="grid grid-cols-3 gap-2">
        <SecondaryButton
          onClick={() => {
            onCommand('seek_delta', -15);
            triggerHaptic('⏪ -15s');
          }}
          className="min-h-[50px]"
        >
          <RotateCcw className="w-4 h-4" />
          <span>-15s</span>
        </SecondaryButton>

        <PrimaryButton
          onClick={() => {
            onCommand('toggle_play');
            triggerHaptic(
              pickLang(lang, {
                es: '⏯ Play / Pausa',
                ca: '⏯ Reproduir / Pausa',
                en: '⏯ Play / Pause',
              })
            );
          }}
          className="min-h-[50px] text-xs sm:text-sm"
        >
          {isPlaying ? (
            <Pause className="w-4 h-4 fill-current" />
          ) : (
            <Play className="w-4 h-4 fill-current" />
          )}
          <span>{pickLang(lang, { es: 'Play / Pausa', ca: 'Play / Pausa', en: 'Play / Pause' })}</span>
        </PrimaryButton>

        <SecondaryButton
          onClick={() => {
            onCommand('seek_delta', 15);
            triggerHaptic('⏩ +15s');
          }}
          className="min-h-[50px]"
        >
          <RotateCw className="w-4 h-4" />
          <span>+15s</span>
        </SecondaryButton>
      </div>

      {/* Compact Volume Bar + Mute */}
      <div className="px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center gap-2.5">
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
          className="!min-h-9 !min-w-9"
        >
          {isMuted || volume === 0 ? (
            <VolumeX className="w-4 h-4 text-rose-400" />
          ) : (
            <Volume2 className="w-4 h-4 text-zinc-200" />
          )}
        </IconButton>

        <div className="flex-1 flex flex-col gap-1">
          <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-300">
            <span>{pickLang(lang, { es: 'Volumen', ca: 'Volum', en: 'Volume' })}</span>
            <span className="font-mono text-zinc-400 tabular-nums">
              {isMuted ? 'MUTE' : `${volume}%`}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={isMuted ? 0 : volume}
            onChange={handleVolumeSlider}
            aria-label={pickLang(lang, {
              es: 'Control de volumen TV',
              ca: 'Control de volum TV',
              en: 'TV volume slider',
            })}
            className="cinema-range w-full h-2 cursor-pointer"
          />
        </div>
      </div>

      {/* Single-Row Essential TV Actions (No scrolling or nested drawers) */}
      <div className="grid grid-cols-4 gap-1.5">
        <SecondaryButton
          onClick={() => {
            onCommand('toggle_fullscreen');
            triggerHaptic(
              pickLang(lang, {
                es: '⛶ Pantalla Completa',
                ca: '⛶ Pantalla Completa',
                en: '⛶ Fullscreen',
              })
            );
          }}
          className="!min-h-[42px] !px-1.5 text-[11px]"
        >
          <Maximize2 className="w-3.5 h-3.5 text-[#BF94FF] shrink-0" />
          <span className="truncate">{pickLang(lang, { es: 'Pantalla', ca: 'Pantalla', en: 'Full' })}</span>
        </SecondaryButton>

        <SecondaryButton
          onClick={() => {
            onCommand('cycle_subtitles');
            triggerHaptic(
              pickLang(lang, { es: '💬 Subtítulos', ca: '💬 Subtítols', en: '💬 Subtitles' })
            );
          }}
          className="!min-h-[42px] !px-1.5 text-[11px]"
        >
          <Subtitles className="w-3.5 h-3.5 text-zinc-300 shrink-0" />
          <span className="truncate">{pickLang(lang, { es: 'Subs', ca: 'Subs', en: 'Subs' })}</span>
        </SecondaryButton>

        <SecondaryButton
          onClick={() => {
            onCommand('cycle_audio');
            triggerHaptic(pickLang(lang, { es: '🔊 Audio TV', ca: '🔊 Àudio TV', en: '🔊 TV Audio' }));
          }}
          className="!min-h-[42px] !px-1.5 text-[11px]"
        >
          <Volume2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span className="truncate">Audio</span>
        </SecondaryButton>

        <SecondaryButton
          onClick={() => {
            onCommand('cycle_aspect');
            triggerHaptic(pickLang(lang, { es: '📐 Formato', ca: '📐 Format', en: '📐 Aspect' }));
          }}
          className="!min-h-[42px] !px-1.5 text-[11px]"
        >
          <span className="truncate">{pickLang(lang, { es: 'Zoom', ca: 'Zoom', en: 'Fill' })}</span>
        </SecondaryButton>
      </div>
    </div>
  );
};

// ============================================================================
// 6. REUSABLE UI PRIMITIVES: Button, Chip, Card, Poster, Skeleton, Error
// ============================================================================

export const Button = PrimaryButton;

export interface ChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  children: React.ReactNode;
}

export const Chip: React.FC<ChipProps> = ({
  active = false,
  children,
  className = '',
  ...props
}) => (
  <button
    type="button"
    {...props}
    className={`min-h-12 px-4 rounded-2xl text-xs font-bold inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer active:scale-[0.97] transition-all duration-150 border disabled:opacity-45 disabled:pointer-events-none ${
      active
        ? 'bg-[#9146FF] border-[#9146FF] text-white'
        : 'bg-white/[0.05] hover:bg-white/[0.1] border-white/[0.09] text-zinc-200'
    } ${className}`}
  >
    {children}
  </button>
);

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  elevated?: boolean;
  children: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({
  elevated = false,
  children,
  className = '',
  ...props
}) => (
  <div
    {...props}
    className={`rounded-3xl border border-white/[0.09] ${
      elevated ? 'bg-[#181B26] shadow-[0_14px_36px_rgba(0,0,0,0.65)]' : 'bg-[#11131B]'
    } ${className}`}
  >
    {children}
  </div>
);

export interface PosterProps {
  src?: string | null;
  title: string;
  subtitle?: string;
  onClick?: () => void;
  topRight?: React.ReactNode;
  aspect?: 'poster' | 'video';
  className?: string;
}

export const Poster: React.FC<PosterProps> = ({
  src,
  title,
  subtitle,
  onClick,
  topRight,
  aspect = 'poster',
  className = '',
}) => (
  <div
    className={`group relative overflow-hidden rounded-2xl bg-[#0E0F16] border border-white/[0.08] hover:border-[#9146FF]/50 transition-colors ${
      aspect === 'poster' ? 'aspect-[2/3]' : 'aspect-video'
    } ${className}`}
  >
    <button
      type="button"
      onClick={onClick}
      aria-label={title}
      className="absolute inset-0 z-0 cursor-pointer rounded-2xl"
    />
    <div className="absolute inset-0 z-[1] pointer-events-none">
      <PosterImage
        src={src}
        alt={title}
        aspect={aspect}
        imgClassName="sm:group-hover:scale-105 transition-transform duration-300"
        fallbackTitle={title}
      />
    </div>
    {topRight && <div className="absolute top-2 right-2 z-10">{topRight}</div>}
    <div className="absolute inset-x-0 bottom-0 z-[2] pt-14 pb-3 px-3 bg-gradient-to-t from-black/95 via-black/75 to-transparent pointer-events-none">
      <div className="font-display font-bold text-xs sm:text-sm text-white line-clamp-2 leading-snug">
        {title}
      </div>
      {subtitle && (
        <div className="text-[11px] text-zinc-300 mt-0.5 truncate tabular-nums">{subtitle}</div>
      )}
    </div>
  </div>
);

export const Skeleton = SkeletonPosterGrid;
export const EmptyState = EmptyStateCard;

export const SkeletonList: React.FC<{ rows?: number; heightClass?: string }> = ({
  rows = 5,
  heightClass = 'h-20',
}) => (
  <div className="space-y-2.5">
    {Array.from({ length: rows }).map((_, i) => (
      <div
        key={i}
        className={`${heightClass} rounded-2xl bg-white/[0.04] border border-white/[0.06] skeleton-shimmer`}
      />
    ))}
  </div>
);

export const ErrorRetryBanner: React.FC<{
  message: string;
  onRetry?: () => void;
  lang?: AppLanguage;
}> = ({ message, onRetry, lang = 'es' }) => (
  <div className="p-4 rounded-2xl bg-[#141418] border border-white/[0.1] flex flex-wrap items-center justify-between gap-3">
    <div className="flex items-center gap-2.5 min-w-0">
      <RiffanWarningIcon size={20} animate="always" className="shrink-0" />
      <p className="text-xs sm:text-sm text-zinc-200 line-clamp-2">{message}</p>
    </div>
    {onRetry && (
      <SecondaryButton onClick={onRetry}>
        <RiffanRetryIcon size={16} animate="hover" />
        <span>{pickLang(lang, { es: 'Reintentar', ca: 'Reintentar', en: 'Retry' })}</span>
      </SecondaryButton>
    )}
  </div>
);


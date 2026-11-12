import React, { useRef, useState } from 'react';
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
  RefreshCw,
  Unlink,
  Tv,
  Hand,
} from 'lucide-react';

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
      className={`inline-flex items-center justify-center gap-2 font-bold text-white bg-[#E11D48] hover:bg-[#BE123C] active:scale-[0.97] transition-all duration-150 shadow-[0_8px_24px_rgba(225,29,72,0.28)] disabled:opacity-45 disabled:pointer-events-none select-none cursor-pointer ${
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
      className={`inline-flex items-center justify-center gap-2 font-semibold backdrop-blur-xl active:scale-[0.97] transition-all duration-150 disabled:opacity-45 disabled:pointer-events-none select-none cursor-pointer border ${
        active
          ? 'bg-[#E11D48]/18 border-[#E11D48]/50 text-white shadow-[0_0_20px_rgba(225,29,72,0.2)]'
          : 'bg-white/[0.06] hover:bg-white/[0.11] border-white/[0.09] text-zinc-100 hover:text-white'
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
      ? 'bg-[#E11D48] hover:bg-[#BE123C] text-white border border-[#E11D48]/50 shadow-[0_8px_20px_rgba(225,29,72,0.3)]'
      : variant === 'ghost'
      ? active
        ? 'bg-white/15 text-white'
        : 'bg-transparent hover:bg-white/[0.08] text-zinc-300 hover:text-white'
      : active
      ? 'bg-[#E11D48]/20 border border-[#E11D48]/50 text-white shadow-[0_0_16px_rgba(225,29,72,0.25)]'
      : 'bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.09] text-zinc-200 hover:text-white backdrop-blur-xl';

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

export const StandardInput: React.FC<StandardInputProps> = ({
  icon,
  rightElement,
  className = '',
  ...props
}) => {
  return (
    <div className="relative flex items-center w-full">
      {icon && (
        <div className="absolute left-3.5 text-zinc-400 pointer-events-none flex items-center justify-center">
          {icon}
        </div>
      )}
      <input
        {...props}
        className={`w-full min-h-11 ${icon ? 'pl-10' : 'pl-4'} ${
          rightElement ? 'pr-12' : 'pr-4'
        } py-2.5 rounded-2xl bg-white/[0.05] hover:bg-white/[0.07] focus:bg-white/[0.08] border border-white/[0.09] focus:border-[#E11D48] text-sm text-white placeholder:text-zinc-500 focus:outline-none transition-all ${className}`}
      />
      {rightElement && (
        <div className="absolute right-1.5 flex items-center justify-center">
          {rightElement}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// 2. PROGRESSIVE DISCLOSURE: UNIVERSAL BOTTOM SHEET
// ============================================================================

export interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  maxWidth?: string;
}

export const BottomSheet: React.FC<BottomSheetProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  icon,
  children,
  maxWidth = 'sm:max-w-lg',
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[190] bg-black/75 backdrop-blur-md flex items-end sm:items-center justify-center sm:p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className={`w-full ${maxWidth} rounded-t-3xl sm:rounded-3xl bg-[#0B0B11]/95 backdrop-blur-2xl border-t sm:border border-white/[0.11] shadow-[0_-20px_70px_rgba(0,0,0,0.9)] overflow-hidden flex flex-col max-h-[88dvh] animate-sheet-up`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle for mobile feel */}
        <div className="pt-2.5 pb-1 flex justify-center sm:hidden">
          <div className="w-10 h-1.5 rounded-full bg-white/20" />
        </div>

        {/* Header */}
        <div className="px-5 py-3.5 border-b border-white/[0.07] flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {icon && (
              <div className="w-10 h-10 rounded-2xl bg-[#E11D48]/15 border border-[#E11D48]/30 flex items-center justify-center text-[#E11D48] shrink-0">
                {icon}
              </div>
            )}
            <div className="min-w-0">
              <h3 className="text-base font-bold text-white tracking-tight truncate">
                {title}
              </h3>
              {subtitle && (
                <p className="text-xs text-zinc-400 truncate mt-0.5">{subtitle}</p>
              )}
            </div>
          </div>
          <IconButton onClick={onClose} variant="ghost" aria-label="Cerrar menú">
            <X className="w-5 h-5" />
          </IconButton>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto custom-scrollbar space-y-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          {children}
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 3. FLOATING MINIMAL SEGMENTED CONTROL
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
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className = '',
}: SegmentedControlProps<T>) {
  return (
    <div
      className={`p-1 rounded-2xl bg-white/[0.04] backdrop-blur-xl border border-white/[0.08] flex items-center gap-1 ${className}`}
    >
      {options.map((option) => {
        const isActive = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            className={`flex-1 min-h-11 px-3 py-2 rounded-xl text-xs font-bold transition-all duration-150 flex items-center justify-center gap-1.5 select-none cursor-pointer active:scale-[0.98] ${
              isActive
                ? 'bg-[#E11D48] text-white shadow-[0_4px_16px_rgba(225,29,72,0.35)]'
                : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.04]'
            }`}
          >
            {option.icon}
            <span className="truncate">{option.label}</span>
            {option.badge !== undefined && option.badge !== 0 && option.badge !== '0' && (
              <span
                className={`px-2 py-0.5 rounded-full text-[0.7rem] font-mono font-bold leading-none ${
                  isActive ? 'bg-black/30 text-white' : 'bg-white/10 text-zinc-200'
                }`}
              >
                {option.badge}
              </span>
            )}
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
    <div className="py-12 px-6 rounded-3xl bg-white/[0.02] border border-white/[0.06] text-center max-w-md mx-auto my-4 flex flex-col items-center">
      <div className="w-14 h-14 rounded-2xl bg-[#E11D48]/12 border border-[#E11D48]/25 flex items-center justify-center text-[#E11D48] mb-3.5 shadow-inner">
        {icon}
      </div>
      <h4 className="text-base font-bold text-white tracking-tight">{title}</h4>
      <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">{description}</p>
      {actionLabel && onAction && (
        <div className="mt-4">
          <SecondaryButton onClick={onAction}>{actionLabel}</SecondaryButton>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// 5. HAPTIC TOUCH SMART TV REMOTE (Eyes-Free Trackpad + Volume Slider)
// ============================================================================

export interface HapticTvRemoteProps {
  pairedTvCode: string;
  isPlaying?: boolean;
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
      | 'toggle_ambilight',
    value?: number
  ) => void;
  onDisconnect: () => void;
}

export const HapticTvRemote: React.FC<HapticTvRemoteProps> = ({
  pairedTvCode,
  isPlaying = false,
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

    // Horizontal swipe -> Seek -15s / +15s
    if (absX > 36 && absX > absY) {
      if (dx < 0) {
        onCommand('seek_delta', -15);
        triggerHaptic('⏪ -15 seg en TV', 22);
      } else {
        onCommand('seek_delta', 15);
        triggerHaptic('⏩ +15 seg en TV', 22);
      }
      return;
    }

    // Vertical swipe -> Volume Up / Down
    if (absY > 36 && absY > absX) {
      if (dy < 0) {
        const nextVol = Math.min(100, volume + 10);
        setVolume(nextVol);
        onCommand('volume_delta', 0.1);
        triggerHaptic(`🔊 Volumen ${nextVol}%`, 16);
      } else {
        const nextVol = Math.max(0, volume - 10);
        setVolume(nextVol);
        onCommand('volume_delta', -0.1);
        triggerHaptic(`🔉 Volumen ${nextVol}%`, 16);
      }
      return;
    }

    // Tap / Double tap on Trackpad zones
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width;
    const now = Date.now();

    if (now - lastTapRef.current < 280) {
      lastTapRef.current = 0;
      onCommand('toggle_fullscreen');
      triggerHaptic('⛶ Pantalla Completa TV', 30);
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
      triggerHaptic('⏯ Play / Pausa TV', 24);
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
      {/* Status Pill */}
      <div className="flex items-center justify-between px-4 py-2.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/25">
        <div className="flex items-center gap-2.5">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs font-bold text-emerald-300">
            TV Conectada · #{pairedTvCode}
          </span>
        </div>
        <button
          type="button"
          onClick={onDisconnect}
          className="min-h-[36px] px-2.5 rounded-xl text-[11px] font-semibold text-zinc-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors flex items-center gap-1 cursor-pointer"
        >
          <Unlink className="w-3.5 h-3.5" />
          Desconectar
        </button>
      </div>

      {/* Central Haptic Touchpad (Eyes-Free Surface) */}
      <div
        onPointerDown={handleTrackpadPointerDown}
        onPointerUp={handleTrackpadPointerUp}
        className="relative h-44 sm:h-48 rounded-3xl bg-gradient-to-b from-white/[0.07] to-white/[0.02] border border-white/[0.12] shadow-[inset_0_1px_1px_rgba(255,255,255,0.15),0_16px_40px_rgba(0,0,0,0.6)] flex flex-col items-center justify-center overflow-hidden touch-none cursor-pointer active:scale-[0.99] transition-transform"
      >
        {/* Subtle tactile zone guides */}
        <div className="absolute inset-y-6 left-1/4 w-px bg-white/[0.05] pointer-events-none" />
        <div className="absolute inset-y-6 right-1/4 w-px bg-white/[0.05] pointer-events-none" />

        <div className="w-full px-6 flex items-center justify-between text-zinc-500 pointer-events-none">
          <div className="flex flex-col items-center gap-1">
            <RotateCcw className="w-5 h-5 text-zinc-400" />
            <span className="text-[10px] font-mono uppercase tracking-wider">-15s</span>
          </div>

          <div className="flex flex-col items-center gap-1.5">
            <div className="w-12 h-12 rounded-2xl bg-white/[0.06] border border-white/10 flex items-center justify-center text-zinc-200">
              <Hand className="w-5 h-5 text-[#E11D48]" />
            </div>
            <span className="text-xs font-bold text-zinc-200 tracking-tight">
              Trackpad Táctil
            </span>
            <span className="text-[10px] text-zinc-500 text-center">
              Toca para Pausa · Desliza para avanzar o volumen
            </span>
          </div>

          <div className="flex flex-col items-center gap-1">
            <RotateCw className="w-5 h-5 text-zinc-400" />
            <span className="text-[10px] font-mono uppercase tracking-wider">+15s</span>
          </div>
        </div>

        {/* Live Haptic Feedback Toast inside Trackpad */}
        {touchFeedback && (
          <div className="absolute inset-x-8 bottom-3 py-1.5 px-3 rounded-full bg-[#E11D48] text-white text-xs font-bold text-center shadow-lg animate-fade-in">
            {touchFeedback}
          </div>
        )}
      </div>

      {/* Hero Play / Pause + Quick Fullscreen Row */}
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
            triggerHaptic('⏯ Play / Pausa');
          }}
          className="min-h-[54px] text-sm"
        >
          {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current" />}
          <span>Play / Pausa</span>
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
            triggerHaptic(isMuted ? '🔊 Sonido activo' : '🔇 Silenciado');
          }}
          active={isMuted}
          aria-label="Silenciar TV"
        >
          {isMuted || volume === 0 ? (
            <VolumeX className="w-5 h-5 text-rose-400" />
          ) : (
            <Volume2 className="w-5 h-5 text-zinc-200" />
          )}
        </IconButton>

        <div className="flex-1 flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-300">
            <span>Volumen TV</span>
            <span className="font-mono text-zinc-400">{isMuted ? 'MUTE' : `${volume}%`}</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={isMuted ? 0 : volume}
            onChange={handleVolumeSlider}
            className="w-full h-2 rounded-full accent-[#E11D48] bg-white/15 cursor-pointer"
          />
        </div>
      </div>

      {/* Progressive Disclosure: Secondary TV Actions */}
      <div className="flex items-center gap-2">
        <SecondaryButton
          onClick={() => {
            onCommand('toggle_fullscreen');
            triggerHaptic('⛶ Pantalla Completa TV');
          }}
          fullWidth
        >
          <Maximize2 className="w-4 h-4 text-[#E11D48]" />
          <span>Pantalla Completa TV</span>
        </SecondaryButton>

        <SecondaryButton
          onClick={() => setShowAdvancedTvTools((prev) => !prev)}
          active={showAdvancedTvTools}
          aria-label="Ajustes de imagen TV"
        >
          <Tv className="w-4 h-4" />
          <span>Ajustes TV</span>
        </SecondaryButton>
      </div>

      {showAdvancedTvTools && (
        <div className="grid grid-cols-3 gap-2 pt-1 animate-fade-in">
          <SecondaryButton
            onClick={() => {
              onCommand('cycle_aspect');
              triggerHaptic('📐 Formato cambiado');
            }}
            className="text-[11px] px-2"
          >
            <span>Rellenar</span>
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
          <SecondaryButton
            onClick={() => {
              onCommand('force_sync');
              triggerHaptic('🔄 Sincronizado');
            }}
            className="text-[11px] px-2"
          >
            <RefreshCw className="w-3.5 h-3.5 text-sky-400" />
            <span>Sincronizar</span>
          </SecondaryButton>
        </div>
      )}
    </div>
  );
};

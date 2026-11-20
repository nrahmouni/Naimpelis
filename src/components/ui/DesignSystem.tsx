import React, { useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import type { AppLanguage } from '../../types';
export { HapticTvRemote, type HapticTvRemoteProps } from './HapticTvRemote';
import { pickLang } from '../../utils/i18n';
import { useFocusTrap } from '../../utils/useFocusTrap';
import { useBackInterceptor } from '../../lib/backInterceptor';
import { useSuppressFloatingBubble } from '../../utils/useSuppressFloatingBubble';
import { PosterImage } from './PosterImage';
import {
  RiffanCloseIcon,
  RiffanSpinner,
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
      className={`group relative overflow-hidden inline-flex items-center justify-center gap-2 font-bold text-white bg-[#7C3AED] hover:bg-[#8B5CF6] active:scale-95 transition-all duration-150 shadow-[0_6px_18px_rgba(124,58,237,0.3)] disabled:opacity-45 disabled:pointer-events-none select-none cursor-pointer ${
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
      className={`inline-flex items-center justify-center gap-2 font-semibold active:scale-95 transition-all duration-150 disabled:opacity-45 disabled:pointer-events-none select-none cursor-pointer border ${
        active
          ? 'bg-[#7C3AED]/22 border-[#7C3AED]/60 text-white'
          : 'bg-white/[0.06] hover:bg-white/[0.11] border-white/[0.08] hover:border-white/[0.16] text-zinc-100 hover:text-white'
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
      ? 'bg-[#7C3AED] hover:bg-[#8B5CF6] text-white border border-white/15'
      : variant === 'ghost'
      ? active
        ? 'bg-white/15 text-white'
        : 'bg-transparent hover:bg-white/[0.09] text-zinc-300 hover:text-white'
      : active
      ? 'bg-[#7C3AED]/24 border border-[#7C3AED]/60 text-white'
      : 'bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-zinc-200 hover:text-white';

  return (
    <button
      {...props}
      className={`min-h-11 min-w-11 rounded-2xl inline-flex items-center justify-center active:scale-95 transition-all duration-150 select-none cursor-pointer shrink-0 ${variantClasses} ${className}`}
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
          <div className="absolute left-3.5 text-zinc-400 group-focus-within:text-[#A78BFA] transition-colors pointer-events-none flex items-center justify-center">
            {icon}
          </div>
        )}
        <input
          ref={ref}
          {...props}
          className={`w-full min-h-12 ${icon ? 'pl-10' : 'pl-4'} ${
            rightElement ? 'pr-12' : 'pr-4'
          } py-2.5 rounded-2xl bg-white/[0.05] hover:bg-white/[0.07] focus:bg-white/[0.085] border border-white/[0.08] focus:border-[#7C3AED] focus:ring-2 focus:ring-[#7C3AED]/45 text-sm text-white placeholder:text-zinc-500 focus:outline-none transition-all duration-150 ${className}`}
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
  footer?: React.ReactNode;
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
  footer,
  maxWidth = 'sm:max-w-lg',
  lang = 'es',
}) => {
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  useFocusTrap(isOpen, onClose, sheetRef);
  useSuppressFloatingBubble(isOpen);
  useBackInterceptor(isOpen, `bottom-sheet-${titleId}`, onClose, {
    priority: 25,
    lockScroll: true,
  });

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
            className={`w-full min-w-0 max-w-full ${maxWidth} rounded-t-3xl sm:rounded-3xl bg-[#0D0D12] border-t sm:border border-white/[0.08] shadow-[0_-24px_80px_rgba(0,0,0,0.94)] overflow-hidden flex flex-col max-h-[88dvh] outline-none`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag handle for mobile swipe-to-dismiss feel */}
            <div className="pt-2.5 pb-1 flex justify-center sm:hidden touch-none shrink-0">
              <div className="w-10 h-1 rounded-full bg-white/25" />
            </div>

            {/* Sticky Header */}
            <div className="shrink-0 px-4 sm:px-5 py-3 border-b border-white/[0.08] flex items-center justify-between gap-3 min-w-0 bg-[#0D0D12]">
              <div className="flex items-center gap-3 min-w-0">
                {icon && (
                  <div className="w-10 h-10 rounded-2xl bg-[#7C3AED]/18 border border-[#7C3AED]/35 flex items-center justify-center text-[#A78BFA] shrink-0">
                    {icon}
                  </div>
                )}
                <div className="min-w-0">
                  <h3 id={titleId} className="font-display text-base font-bold text-white tracking-tight leading-snug">
                    {title}
                  </h3>
                  {subtitle && (
                    <p className="text-xs text-zinc-400 leading-snug mt-0.5">{subtitle}</p>
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
            <div
              className={`p-4 sm:p-5 overflow-y-auto overflow-x-clip min-w-0 w-full custom-scrollbar space-y-4 ${
                footer ? 'pb-4' : 'pb-[max(1.25rem,env(safe-area-inset-bottom))]'
              }`}
            >
              {children}
            </div>

            {/* Optional Sticky Bottom Footer */}
            {footer && (
              <div className="shrink-0 px-4 sm:px-5 py-3.5 border-t border-white/[0.08] bg-[#0D0D12] pb-[max(0.875rem,env(safe-area-inset-bottom))]">
                {footer}
              </div>
            )}
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
      } bg-[#0D0D12] border border-white/[0.08] items-center overflow-hidden ${className}`}
    >
      {options.map((option) => {
        const isActive = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            className={`relative flex items-center justify-center select-none cursor-pointer active:scale-95 transition-colors duration-150 ${
              compact
                ? 'flex-none min-h-10 px-3 py-1 rounded-lg text-xs font-semibold gap-1.5'
                : 'flex-1 min-w-0 min-h-11 px-2.5 sm:px-3.5 py-2 rounded-xl text-xs font-bold gap-1.5'
            } ${isActive ? 'text-white' : 'text-zinc-400 hover:text-zinc-100'}`}
          >
            {isActive && (
              <motion.span
                layoutId={pillId}
                transition={{ duration: 0.16, ease: 'easeOut' }}
                className={`absolute inset-0 ${
                  compact ? 'rounded-lg' : 'rounded-xl'
                } bg-[#7C3AED] shadow-[0_4px_14px_rgba(124,58,237,0.35)]`}
                aria-hidden="true"
              />
            )}
            <span className="relative z-10 flex items-center justify-center gap-1.5 min-w-0 max-w-full">
              {option.icon && <span className="shrink-0">{option.icon}</span>}
              <span className="whitespace-nowrap">{option.label}</span>
              {option.badge !== undefined && option.badge !== 0 && option.badge !== '0' && (
                <span
                  className={`${
                    compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-1.5 py-0.5 text-[0.65rem]'
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
      className="py-12 px-6 rounded-3xl bg-[#0D0D12] border border-white/[0.08] text-center max-w-md mx-auto my-4 flex flex-col items-center shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
    >
      <div className="w-14 h-14 rounded-2xl bg-[#7C3AED]/15 border border-[#7C3AED]/35 flex items-center justify-center text-[#A78BFA] mb-3.5 shadow-inner">
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

// HapticTvRemote extracted to ./HapticTvRemote.tsx and re-exported above.

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
    className={`min-h-11 px-4 rounded-2xl text-xs font-bold inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer active:scale-95 transition-all duration-150 border disabled:opacity-45 disabled:pointer-events-none ${
      active
        ? 'bg-[#7C3AED] border-[#8B5CF6] text-white shadow-[0_4px_14px_rgba(124,58,237,0.3)]'
        : 'bg-[#0D0D12] hover:bg-white/[0.08] border-white/[0.08] text-zinc-200'
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
    className={`rounded-3xl border border-white/[0.08] ${
      elevated ? 'bg-[#14141C] shadow-[0_14px_36px_rgba(0,0,0,0.75)]' : 'bg-[#0D0D12]'
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
    className={`group relative overflow-hidden rounded-2xl bg-[#0D0D12] border border-white/[0.08] hover:border-[#7C3AED]/60 transition-colors ${
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
      <div className="font-display font-bold text-xs sm:text-sm text-white leading-snug">
        {title}
      </div>
      {subtitle && (
        <div className="text-[11px] text-zinc-300 mt-0.5 tabular-nums">{subtitle}</div>
      )}
    </div>
  </div>
);

export const Skeleton = SkeletonPosterGrid;
export const EmptyState = EmptyStateCard;


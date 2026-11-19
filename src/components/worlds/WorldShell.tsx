import React, { useEffect, useRef, useState } from 'react';
import { Mic, Share2, Users } from 'lucide-react';
import type { AppLanguage } from '../../types';
import type { WorldId } from '../../store/useAppStore';
import { pickLang } from '../../utils/i18n';
import { useSwipeBack } from '../../lib/viewTransition';
import {
  getActiveBackInterceptorCount,
  tryConsumeBackInterceptor,
  useBackInterceptor,
} from '../../lib/backInterceptor';
import { NaimBrandLogo } from '../NaimBrandLogo';
import { AppErrorBoundary } from '../AppErrorBoundary';
import { SkeletonPosterGrid } from '../ui/DesignSystem';
import { RiffanBackIcon, RiffanCloseIcon, RiffanSearchIcon } from '../ui/RiffanIcons';

interface WorldShellProps {
  world: Exclude<WorldId, 'entry'>;
  title: string;
  lang: AppLanguage;
  onBack: () => void;
  onGoHome: () => void;
  searchValue?: string;
  onSearchChange?: (val: string) => void;
  searchPlaceholder?: string;
  headerActions?: React.ReactNode;
  onOpenVoiceAssistant?: () => void;
  sessionMode?: 'solo' | 'party';
  onUpgradeSoloToParty?: () => void;
  onShareWorld?: () => void;
  fullHeight?: boolean;
  className?: string;
  children: React.ReactNode;
}

export const WorldShell: React.FC<WorldShellProps> = ({
  world,
  title,
  lang,
  onBack,
  onGoHome,
  searchValue = '',
  onSearchChange,
  searchPlaceholder,
  headerActions,
  onOpenVoiceAssistant,
  sessionMode,
  onUpgradeSoloToParty,
  onShareWorld,
  fullHeight = false,
  className = '',
  children,
}) => {
  const [searchOpen, setSearchOpen] = useState(Boolean(searchValue));
  const searchInputRef = useRef<HTMLInputElement>(null);
  const swipeHandlers = useSwipeBack(onBack, true);

  useEffect(() => {
    if (searchValue) {
      setSearchOpen(true);
    }
  }, [searchValue]);

  useEffect(() => {
    if (searchOpen) {
      const t = window.setTimeout(() => searchInputRef.current?.focus(), 60);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [searchOpen]);

  const handleCloseSearch = () => {
    setSearchOpen(false);
    onSearchChange?.('');
  };

  useBackInterceptor(
    Boolean(onSearchChange && (searchOpen || searchValue.trim().length > 0)),
    `world-search-${world}`,
    handleCloseSearch,
    { priority: 6 }
  );

  const handleHeaderBack = () => {
    if (getActiveBackInterceptorCount() > 0 && tryConsumeBackInterceptor()) {
      return;
    }
    onBack();
  };

  return (
    <div
      {...swipeHandlers}
      className={`w-full flex flex-col world-tint-${world} ${
        fullHeight ? 'flex-1 min-h-0 h-full overflow-hidden' : 'min-h-[calc(100dvh-4rem)] pb-24'
      } ${className}`}
    >
      {/* LIGHTWEIGHT WORLD TOP HEADER */}
      <header className="sticky top-0 z-30 shrink-0 bg-[#07080C]/92 backdrop-blur-2xl border-b border-white/[0.07] shadow-[0_8px_32px_rgba(0,0,0,0.45)] px-2.5 sm:px-4">
        <div className="max-w-6xl mx-auto h-14 flex items-center justify-between gap-2">
          {searchOpen && onSearchChange ? (
            <div className="flex-1 flex items-center gap-2 min-w-0">
              <div className="relative flex-1 min-w-0">
                <RiffanSearchIcon size={16} animate="always" className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  ref={searchInputRef}
                  type="search"
                  value={searchValue}
                  onChange={(e) => onSearchChange(e.target.value)}
                  placeholder={
                    searchPlaceholder ||
                    pickLang(lang, {
                      es: 'Buscar aquí...',
                      ca: 'Cercar aquí...',
                      en: 'Search here...',
                    })
                  }
                  className="w-full min-h-11 pl-10 pr-4 rounded-2xl bg-[#10121C] border border-[#9146FF]/60 text-sm text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#9146FF]/30"
                />
              </div>
              <button
                type="button"
                onClick={handleCloseSearch}
                aria-label={pickLang(lang, { es: 'Cerrar búsqueda', ca: 'Tancar cerca', en: 'Close search' })}
                className="min-w-11 min-h-11 rounded-2xl bg-[#10121C] hover:bg-white/[0.1] border border-white/[0.08] flex items-center justify-center text-zinc-200 cursor-pointer shrink-0 transition-colors"
              >
                <RiffanCloseIcon size={20} animate="hover" />
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-1.5 min-w-0">
                <button
                  type="button"
                  onClick={handleHeaderBack}
                  aria-label={pickLang(lang, { es: 'Volver', ca: 'Tornar', en: 'Back' })}
                  className="min-w-11 min-h-11 rounded-2xl hover:bg-white/[0.08] active:scale-95 flex items-center justify-center text-white cursor-pointer transition-all shrink-0"
                >
                  <RiffanBackIcon size={20} animate="hover" />
                </button>

                <button
                  type="button"
                  onClick={onGoHome}
                  aria-label="RiffanTV"
                  className="flex items-center gap-2 min-w-0 py-1 pr-1 cursor-pointer active:scale-95 transition-transform group"
                >
                  <NaimBrandLogo variant="mark" size={28} />
                  <h2 className="font-display font-extrabold text-base sm:text-lg text-white tracking-tight truncate">
                    {title}
                  </h2>
                </button>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {headerActions}
                {sessionMode === 'solo' && onUpgradeSoloToParty && world !== 'sala' && (
                  <button
                    type="button"
                    onClick={onUpgradeSoloToParty}
                    title={pickLang(lang, {
                      es: 'Crear sala con amigos',
                      ca: 'Crear sala amb amics',
                      en: 'Watch with friends',
                    })}
                    className="min-h-11 px-3 rounded-2xl bg-[#9146FF]/22 hover:bg-[#9146FF]/35 border border-[#BF94FF]/45 text-xs font-bold text-[#E9D5FF] hover:text-white flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all whitespace-nowrap"
                  >
                    <Users className="w-4 h-4 shrink-0" />
                    <span className="hidden sm:inline">
                      {pickLang(lang, {
                        es: 'Ver con amigos',
                        ca: 'Veure amb amics',
                        en: 'Watch party',
                      })}
                    </span>
                  </button>
                )}
                {onShareWorld && (
                  <button
                    type="button"
                    onClick={onShareWorld}
                    aria-label={pickLang(lang, {
                      es: 'Compartir enlace',
                      ca: 'Compartir enllaç',
                      en: 'Share link',
                    })}
                    title={pickLang(lang, {
                      es: 'Compartir enlace',
                      ca: 'Compartir enllaç',
                      en: 'Share link',
                    })}
                    className="min-w-11 min-h-11 rounded-2xl bg-[#10121C] hover:bg-white/[0.09] border border-white/[0.09] flex items-center justify-center text-zinc-200 hover:text-white cursor-pointer active:scale-95 transition-all"
                  >
                    <Share2 className="w-4 h-4" />
                  </button>
                )}
                {onOpenVoiceAssistant && (
                  <button
                    type="button"
                    onClick={onOpenVoiceAssistant}
                    aria-label={pickLang(lang, {
                      es: 'Asistente por Voz',
                      ca: 'Assistent per Veu',
                      en: 'Voice Assistant',
                    })}
                    className="min-w-11 min-h-11 rounded-2xl bg-[#9146FF]/20 hover:bg-[#9146FF]/35 border border-[#9146FF]/45 flex items-center justify-center text-[#D4BBFF] hover:text-white cursor-pointer active:scale-95 transition-all"
                  >
                    <Mic className="w-4.5 h-4.5" />
                  </button>
                )}
                {onSearchChange && (
                  <button
                    type="button"
                    onClick={() => setSearchOpen(true)}
                    aria-label={pickLang(lang, { es: 'Buscar', ca: 'Cercar', en: 'Search' })}
                    className="min-w-11 min-h-11 rounded-2xl bg-[#10121C] hover:bg-white/[0.09] border border-white/[0.09] flex items-center justify-center text-zinc-100 cursor-pointer active:scale-95 transition-all"
                  >
                    <RiffanSearchIcon size={18} animate="hover" />
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </header>

      {/* WORLD CONTENT */}
      <div
        className={`w-full max-w-6xl mx-auto ${
          fullHeight
            ? 'flex-1 min-h-0 flex flex-col overflow-hidden'
            : 'px-3 sm:px-5 pt-3 pb-4'
        }`}
      >
        <AppErrorBoundary>
          <React.Suspense
            fallback={
              <div className="py-4">
                <SkeletonPosterGrid count={6} aspect={world === 'futbol' || world === 'tv' ? 'video' : 'poster'} />
              </div>
            }
          >
            {children}
          </React.Suspense>
        </AppErrorBoundary>
      </div>
    </div>
  );
};

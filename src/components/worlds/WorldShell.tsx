import React, { useEffect, useRef, useState } from 'react';
import { Mic, MoreHorizontal, Share2, Users } from 'lucide-react';
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
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    if (!moreMenuOpen) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setMoreMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMoreMenuOpen(false);
    };
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [moreMenuOpen]);

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

  const showWatchPartyAction = Boolean(
    sessionMode === 'solo' && onUpgradeSoloToParty && world !== 'sala'
  );
  const hasSecondaryActions = Boolean(
    headerActions || showWatchPartyAction || onShareWorld || onOpenVoiceAssistant
  );

  return (
    <div
      {...swipeHandlers}
      className={`w-full flex flex-col world-tint-${world} ${
        fullHeight ? 'flex-1 min-h-0 h-full overflow-hidden' : 'min-h-[calc(100dvh-4rem)] pb-14'
      } ${className}`}
    >
      {/* CALM 3-ZONE WORLD HEADER (LOBBY-STYLE SIMPLICITY) */}
      <header className="sticky top-0 z-30 shrink-0 bg-[#07080C]/88 backdrop-blur-2xl border-b border-white/[0.06] px-3 sm:px-5">
        <div className="max-w-6xl mx-auto h-14 flex items-center justify-between gap-2">
          {searchOpen && onSearchChange ? (
            <div className="flex-1 flex items-center gap-2 min-w-0">
              <div className="relative flex-1 min-w-0">
                <RiffanSearchIcon
                  size={16}
                  animate="always"
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                />
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
                  className="w-full min-h-11 pl-10 pr-4 rounded-2xl bg-white/[0.05] border border-[#9146FF]/55 text-sm text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#9146FF]/30"
                />
              </div>
              <button
                type="button"
                onClick={handleCloseSearch}
                aria-label={pickLang(lang, { es: 'Cerrar búsqueda', ca: 'Tancar cerca', en: 'Close search' })}
                className="min-w-11 min-h-11 rounded-2xl bg-white/[0.045] hover:bg-white/[0.1] border border-white/[0.08] flex items-center justify-center text-zinc-200 cursor-pointer shrink-0 transition-colors"
              >
                <RiffanCloseIcon size={18} animate="hover" />
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-1.5 min-w-0">
                <button
                  type="button"
                  onClick={handleHeaderBack}
                  aria-label={pickLang(lang, { es: 'Volver', ca: 'Tornar', en: 'Back' })}
                  className="min-w-11 min-h-11 rounded-2xl hover:bg-white/[0.06] active:scale-95 flex items-center justify-center text-zinc-200 hover:text-white cursor-pointer transition-all shrink-0"
                >
                  <RiffanBackIcon size={20} animate="hover" />
                </button>

                <button
                  type="button"
                  onClick={onGoHome}
                  aria-label="RiffanTV"
                  className="flex items-center gap-2.5 min-w-0 py-1 pr-2 cursor-pointer active:scale-95 transition-transform"
                >
                  <NaimBrandLogo variant="mark" size={26} />
                  <h2 className="font-display font-bold text-base sm:text-lg text-white tracking-tight truncate">
                    {title}
                  </h2>
                </button>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {onSearchChange && (
                  <button
                    type="button"
                    onClick={() => setSearchOpen(true)}
                    aria-label={pickLang(lang, { es: 'Buscar', ca: 'Cercar', en: 'Search' })}
                    className="min-w-11 min-h-11 rounded-2xl bg-white/[0.045] hover:bg-white/[0.1] border border-white/[0.08] flex items-center justify-center text-zinc-200 hover:text-white cursor-pointer active:scale-95 transition-all"
                  >
                    <RiffanSearchIcon size={17} animate="hover" />
                  </button>
                )}

                {hasSecondaryActions && (
                  <div ref={moreMenuRef} className="relative">
                    <button
                      type="button"
                      onClick={() => setMoreMenuOpen((v) => !v)}
                      aria-expanded={moreMenuOpen}
                      aria-haspopup="menu"
                      aria-label={pickLang(lang, { es: 'Más opciones', ca: 'Més opcions', en: 'More options' })}
                      className={`min-w-11 min-h-11 rounded-2xl border flex items-center justify-center cursor-pointer active:scale-95 transition-all ${
                        moreMenuOpen
                          ? 'bg-white/[0.12] border-white/20 text-white'
                          : 'bg-white/[0.045] hover:bg-white/[0.1] border-white/[0.08] text-zinc-200 hover:text-white'
                      }`}
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </button>

                    {moreMenuOpen && (
                      <div
                        role="menu"
                        className="absolute right-0 mt-2 w-56 rounded-2xl bg-[#0E1019]/96 backdrop-blur-2xl border border-white/[0.1] shadow-[0_18px_48px_rgba(0,0,0,0.72)] p-1.5 space-y-1 z-50 animate-fade-in"
                      >
                        {headerActions && (
                          <div className="px-1 py-0.5 flex flex-wrap gap-1">{headerActions}</div>
                        )}
                        {showWatchPartyAction && onUpgradeSoloToParty && (
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setMoreMenuOpen(false);
                              onUpgradeSoloToParty();
                            }}
                            className="w-full min-h-11 px-3 rounded-xl hover:bg-[#9146FF]/15 text-left text-xs font-semibold text-white flex items-center gap-2.5 cursor-pointer transition-colors"
                          >
                            <Users className="w-4 h-4 text-[#BF94FF] shrink-0" />
                            <span>
                              {pickLang(lang, {
                                es: 'Ver con amigos',
                                ca: 'Veure amb amics',
                                en: 'Watch with friends',
                              })}
                            </span>
                          </button>
                        )}
                        {onShareWorld && (
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setMoreMenuOpen(false);
                              onShareWorld();
                            }}
                            className="w-full min-h-11 px-3 rounded-xl hover:bg-white/[0.07] text-left text-xs font-semibold text-zinc-100 flex items-center gap-2.5 cursor-pointer transition-colors"
                          >
                            <Share2 className="w-4 h-4 text-zinc-300 shrink-0" />
                            <span>
                              {pickLang(lang, {
                                es: 'Compartir enlace',
                                ca: 'Compartir enllaç',
                                en: 'Share link',
                              })}
                            </span>
                          </button>
                        )}
                        {onOpenVoiceAssistant && (
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setMoreMenuOpen(false);
                              onOpenVoiceAssistant();
                            }}
                            className="w-full min-h-11 px-3 rounded-xl hover:bg-white/[0.07] text-left text-xs font-semibold text-zinc-100 flex items-center gap-2.5 cursor-pointer transition-colors"
                          >
                            <Mic className="w-4 h-4 text-[#BF94FF] shrink-0" />
                            <span>
                              {pickLang(lang, {
                                es: 'Asistente por voz',
                                ca: 'Assistent per veu',
                                en: 'Voice assistant',
                              })}
                            </span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
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

import React, { useEffect, useRef, useState } from 'react';
import { Download, Mic, MoreHorizontal, Share2, Users } from 'lucide-react';
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
import { RiffanMusicLogo } from '../music/RiffanMusicLogo';
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
  quickActions?: React.ReactNode;
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
  quickActions,
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
      setSearchOpen((prev) => (prev ? prev : true));
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

  const isMusicWorld = world === 'music';

  return (
    <div
      {...swipeHandlers}
      className={`w-full flex flex-col world-tint-${world} ${
        fullHeight
          ? 'flex-1 min-h-0 h-full overflow-hidden'
          : isMusicWorld
          ? 'min-h-[100dvh]'
          : 'min-h-[calc(100dvh-4rem)] pb-14'
      } ${className}`}
    >
      {/* CALM STICKY WORLD HEADER */}
      <header
        className={
          isMusicWorld
            ? 'sticky top-0 z-30 shrink-0 bg-[#05080D]/94 backdrop-blur-2xl border-b border-white/[0.07] px-3 sm:px-5'
            : 'sticky top-0 z-30 shrink-0 bg-[#000000]/92 backdrop-blur-2xl border-b border-white/[0.08] px-4 sm:px-5'
        }
      >
        <div
          className={
            isMusicWorld
              ? 'w-full max-w-none min-h-12 sm:min-h-13 py-1 flex items-center justify-between gap-2'
              : 'max-w-6xl mx-auto min-h-14 py-1.5 flex items-center justify-between gap-2.5'
          }
        >
          {searchOpen && onSearchChange ? (
            <div
              className={
                isMusicWorld
                  ? 'w-full max-w-md ml-auto flex items-center gap-1.5 h-9 px-2.5 rounded-xl bg-[#0B121D] border border-[#10B981]/45 shadow-[0_8px_24px_rgba(0,0,0,0.5)] min-w-0'
                  : 'flex-1 flex items-center gap-2 min-w-0'
              }
            >
              <div className="relative flex-1 min-w-0">
                <RiffanSearchIcon
                  size={isMusicWorld ? 14 : 15}
                  animate="always"
                  className={`absolute top-1/2 -translate-y-1/2 pointer-events-none ${
                    isMusicWorld ? 'left-2' : 'left-3.5'
                  }`}
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
                  className={
                    isMusicWorld
                      ? 'w-full h-8 pl-7 pr-2 bg-transparent text-xs text-white placeholder:text-zinc-400 focus:outline-none'
                      : 'w-full min-h-11 pl-10 pr-4 rounded-2xl bg-[#0D0D12] border border-[#7C3AED]/60 text-sm text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#7C3AED]/35'
                  }
                />
              </div>
              <button
                type="button"
                onClick={handleCloseSearch}
                aria-label={pickLang(lang, { es: 'Cerrar búsqueda', ca: 'Tancar cerca', en: 'Close search' })}
                className={
                  isMusicWorld
                    ? 'w-7 h-7 rounded-lg hover:bg-[#10B981]/20 flex items-center justify-center text-zinc-200 cursor-pointer shrink-0 active:scale-95 transition-all'
                    : 'min-w-11 min-h-11 rounded-2xl bg-[#0D0D12] hover:bg-white/[0.08] border border-white/[0.08] flex items-center justify-center text-zinc-200 cursor-pointer shrink-0 active:scale-95 transition-all'
                }
              >
                <RiffanCloseIcon size={isMusicWorld ? 14 : 17} animate="hover" />
              </button>
            </div>
          ) : (
            <>
              <div
                className={
                  isMusicWorld
                    ? 'inline-flex items-center gap-1 min-w-0'
                    : 'flex items-center gap-1.5 min-w-0'
                }
              >
                <button
                  type="button"
                  onClick={handleHeaderBack}
                  aria-label={pickLang(lang, { es: 'Volver', ca: 'Tornar', en: 'Back' })}
                  className={
                    isMusicWorld
                      ? 'w-9 h-9 rounded-xl hover:bg-white/[0.08] active:scale-95 flex items-center justify-center text-zinc-200 hover:text-white cursor-pointer transition-all shrink-0'
                      : 'min-w-11 min-h-11 rounded-2xl hover:bg-white/[0.06] active:scale-95 flex items-center justify-center text-zinc-200 hover:text-white cursor-pointer transition-all shrink-0'
                  }
                >
                  <RiffanBackIcon size={isMusicWorld ? 17 : 20} animate="hover" />
                </button>

                <button
                  type="button"
                  onClick={onGoHome}
                  aria-label={isMusicWorld ? 'Riffan Music' : 'RiffanTV'}
                  className={
                    isMusicWorld
                      ? 'flex items-center gap-1.5 min-w-0 py-0.5 pr-1 cursor-pointer active:scale-95 transition-transform'
                      : 'flex items-center gap-2 min-w-0 py-0.5 pr-2 cursor-pointer active:scale-95 transition-transform'
                  }
                >
                  {isMusicWorld ? (
                    <RiffanMusicLogo variant="full" size={18} withFrame={false} animated />
                  ) : (
                    <>
                      <NaimBrandLogo variant="mark" size={26} />
                      <h2 className="font-display font-bold text-base sm:text-lg text-white tracking-tight leading-tight">
                        {title}
                      </h2>
                    </>
                  )}
                </button>
              </div>

              <div
                className={
                  isMusicWorld
                    ? 'inline-flex items-center gap-1 shrink-0'
                    : 'flex items-center gap-1.5 shrink-0'
                }
              >
                {quickActions}
                {onSearchChange && (
                  <button
                    type="button"
                    onClick={() => setSearchOpen(true)}
                    aria-label={pickLang(lang, { es: 'Buscar', ca: 'Cercar', en: 'Search' })}
                    className={
                      isMusicWorld
                        ? 'w-9 h-9 rounded-xl hover:bg-white/[0.08] flex items-center justify-center text-slate-200 hover:text-[#6EE7B7] cursor-pointer active:scale-95 transition-all'
                        : 'min-w-11 min-h-11 rounded-2xl bg-[#0D0D12] hover:bg-white/[0.08] border border-white/[0.08] flex items-center justify-center text-zinc-200 hover:text-white cursor-pointer active:scale-95 transition-all'
                    }
                  >
                    <RiffanSearchIcon size={isMusicWorld ? 15 : 16} animate="hover" />
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
                      className={
                        isMusicWorld
                          ? `w-9 h-9 rounded-xl flex items-center justify-center cursor-pointer active:scale-95 transition-all ${
                              moreMenuOpen
                                ? 'bg-[#10B981]/22 text-[#6EE7B7]'
                                : 'hover:bg-white/[0.08] text-slate-200 hover:text-[#6EE7B7]'
                            }`
                          : `min-w-11 min-h-11 rounded-2xl border flex items-center justify-center cursor-pointer active:scale-95 transition-all ${
                              moreMenuOpen
                                ? 'bg-white/[0.12] border-white/20 text-white'
                                : 'bg-[#0D0D12] hover:bg-white/[0.08] border-white/[0.08] text-zinc-200 hover:text-white'
                            }`
                      }
                    >
                      <MoreHorizontal className={isMusicWorld ? 'w-4 h-4' : 'w-4 h-4'} />
                    </button>

                    {moreMenuOpen && (
                      <div
                        role="menu"
                        className="absolute right-0 mt-2 w-60 rounded-2xl bg-[#0D0D12]/96 backdrop-blur-2xl border border-white/[0.08] shadow-[0_18px_48px_rgba(0,0,0,0.85)] p-1.5 space-y-1 z-50 animate-fade-in"
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
                            className="w-full min-h-11 px-3 rounded-xl hover:bg-[#7C3AED]/18 text-left text-xs font-semibold text-white flex items-center gap-2.5 cursor-pointer transition-colors"
                          >
                            <Users className="w-4 h-4 text-[#A78BFA] shrink-0" />
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
                            <Mic className={`w-4 h-4 shrink-0 ${isMusicWorld ? 'text-[#22D3EE]' : 'text-[#A78BFA]'}`} />
                            <span>
                              {pickLang(lang, {
                                es: 'Asistente por voz',
                                ca: 'Assistent per veu',
                                en: 'Voice assistant',
                              })}
                            </span>
                          </button>
                        )}
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setMoreMenuOpen(false);
                            window.dispatchEvent(
                              new CustomEvent(
                                isMusicWorld ? 'riffan:open-music-install' : 'riffan:open-install'
                              )
                            );
                          }}
                          className={`w-full min-h-11 px-3 rounded-xl text-left text-xs font-semibold text-zinc-100 flex items-center gap-2.5 cursor-pointer transition-colors ${
                            isMusicWorld ? 'hover:bg-[#10B981]/15' : 'hover:bg-[#7C3AED]/15'
                          }`}
                        >
                          <Download className={`w-4 h-4 shrink-0 ${isMusicWorld ? 'text-[#34D399]' : 'text-[#38BDF8]'}`} />
                          <span>
                            {isMusicWorld
                              ? pickLang(lang, {
                                  es: 'Instalar Riffan Music (APK · iPhone · Chrome)',
                                  ca: 'Instal·lar Riffan Music (APK · iPhone · Chrome)',
                                  en: 'Install Riffan Music (APK · iPhone · Chrome)',
                                })
                              : pickLang(lang, {
                                  es: 'Instalar App (APK · iPhone · Chrome)',
                                  ca: 'Instal·lar App (APK · iPhone · Chrome)',
                                  en: 'Install App (APK · iPhone · Chrome)',
                                })}
                          </span>
                        </button>
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
        className={
          isMusicWorld
            ? 'w-full max-w-none flex-1 min-w-0 px-0 pt-0 pb-0'
            : `w-full max-w-6xl mx-auto ${
                fullHeight
                  ? 'flex-1 min-h-0 flex flex-col overflow-hidden'
                  : 'px-3 sm:px-5 pt-3 pb-4'
              }`
        }
      >
        <AppErrorBoundary resetKey={world}>
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

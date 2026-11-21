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
  const [searchOpen, setSearchOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  const handleHeaderBack = () => {
    if (getActiveBackInterceptorCount() > 0 && tryConsumeBackInterceptor()) {
      return;
    }
    onBack();
  };

  const swipeHandlers = useSwipeBack(handleHeaderBack, true);

  useEffect(() => {
    if (!onSearchChange) {
      setSearchOpen(false);
    }
  }, [world, onSearchChange]);

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

  const handleCollapseSearchBar = () => {
    setSearchOpen(false);
  };

  const handleClearSearchAndClose = () => {
    setSearchOpen(false);
    onSearchChange?.('');
  };

  useBackInterceptor(
    Boolean(onSearchChange && searchOpen),
    `world-search-${world}`,
    handleCollapseSearchBar,
    { priority: 6 }
  );

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
      {/* CALM WORLD HEADER (non-sticky in Music world so scroll reveals full stage) */}
      <header
        className={
          isMusicWorld
            ? 'relative z-30 shrink-0 px-2.5 sm:px-5 pt-1.5 pb-1 pointer-events-none'
            : 'sticky top-0 z-30 shrink-0 bg-[#000000]/92 backdrop-blur-2xl border-b border-white/[0.08] px-4 sm:px-5'
        }
      >
        <div
          className={
            isMusicWorld
              ? 'w-full max-w-none flex items-center justify-between gap-2'
              : 'max-w-6xl mx-auto min-h-14 py-1.5 flex items-center justify-between gap-2.5'
          }
        >
          {searchOpen && onSearchChange ? (
            <div
              className={
                isMusicWorld
                  ? 'pointer-events-auto w-full max-w-md ml-auto flex items-center gap-1 h-9 px-1.5 rounded-full bg-[#0C0C0F]/94 backdrop-blur-2xl border border-[#3B82F6]/45 shadow-[0_8px_26px_rgba(0,0,0,0.72)] min-w-0'
                  : 'flex-1 flex items-center gap-2 min-w-0'
              }
            >
              <div className="relative flex-1 min-w-0">
                <RiffanSearchIcon
                  size={isMusicWorld ? 14 : 15}
                  animate="always"
                  className={`absolute top-1/2 -translate-y-1/2 pointer-events-none ${
                    isMusicWorld ? 'left-3' : 'left-3.5'
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
                      ? 'w-full h-7 pl-8 pr-2 bg-transparent text-xs text-white placeholder:text-zinc-400 focus:outline-none'
                      : 'w-full min-h-11 pl-10 pr-4 rounded-2xl bg-[#0D0D12] border border-[#7C3AED]/60 text-sm text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#7C3AED]/35'
                  }
                />
              </div>
              <button
                type="button"
                onClick={searchValue.trim() ? handleClearSearchAndClose : handleCollapseSearchBar}
                aria-label={pickLang(lang, { es: 'Limpiar o cerrar búsqueda', ca: 'Netejar o tancar cerca', en: 'Clear or close search' })}
                className={
                  isMusicWorld
                    ? 'w-7 h-7 rounded-full hover:bg-[#3B82F6]/20 flex items-center justify-center text-zinc-200 cursor-pointer shrink-0 active:scale-95 transition-all'
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
                    ? 'pointer-events-auto inline-flex items-center gap-0.5 h-8 sm:h-9 pl-0.5 pr-2 rounded-full bg-[#0C0C0F]/88 backdrop-blur-2xl border border-[#3B82F6]/28 shadow-[0_6px_18px_rgba(0,0,0,0.58)] min-w-0'
                    : 'flex items-center gap-1.5 min-w-0'
                }
              >
                <button
                  type="button"
                  onClick={handleHeaderBack}
                  aria-label={pickLang(lang, { es: 'Volver', ca: 'Tornar', en: 'Back' })}
                  className={
                    isMusicWorld
                      ? 'w-7 h-7 sm:w-8 sm:h-8 rounded-full hover:bg-[#3B82F6]/18 active:scale-95 flex items-center justify-center text-zinc-200 hover:text-white cursor-pointer transition-all shrink-0'
                      : 'min-w-11 min-h-11 rounded-2xl hover:bg-white/[0.06] active:scale-95 flex items-center justify-center text-zinc-200 hover:text-white cursor-pointer transition-all shrink-0'
                  }
                >
                  <RiffanBackIcon size={isMusicWorld ? 14 : 20} animate="hover" />
                </button>

                <button
                  type="button"
                  onClick={onGoHome}
                  aria-label={isMusicWorld ? 'Riffan Music' : 'RiffanTV'}
                  className={
                    isMusicWorld
                      ? 'flex items-center gap-1 min-w-0 py-0.5 pr-0.5 cursor-pointer active:scale-95 transition-transform'
                      : 'flex items-center gap-2 min-w-0 py-0.5 pr-2 cursor-pointer active:scale-95 transition-transform'
                  }
                >
                  {isMusicWorld ? (
                    <RiffanMusicLogo variant="full" size={15} withFrame={false} animated />
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
                    ? 'pointer-events-auto inline-flex items-center gap-0.5 h-8 sm:h-9 px-0.5 rounded-full bg-[#0C0C0F]/88 backdrop-blur-2xl border border-white/12 shadow-[0_6px_18px_rgba(0,0,0,0.58)] shrink-0'
                    : 'flex items-center gap-1.5 shrink-0'
                }
              >
                {quickActions}
                {onSearchChange && (
                  <div className="flex items-center gap-1">
                    {searchValue.trim().length > 0 && !isMusicWorld && (
                      <div className="inline-flex items-center max-w-[130px] sm:max-w-[180px] h-9 sm:h-10 pl-2.5 pr-1 rounded-2xl bg-[#7C3AED]/18 border border-[#7C3AED]/45 text-xs text-white gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setSearchOpen(true);
                            window.setTimeout(() => searchInputRef.current?.focus(), 60);
                          }}
                          className="truncate font-semibold cursor-pointer text-left"
                        >
                          {searchValue}
                        </button>
                        <button
                          type="button"
                          onClick={handleClearSearchAndClose}
                          aria-label={pickLang(lang, { es: 'Limpiar filtro', ca: 'Netejar filtre', en: 'Clear filter' })}
                          className="w-6 h-6 rounded-xl hover:bg-white/15 flex items-center justify-center text-zinc-200 cursor-pointer shrink-0"
                        >
                          <RiffanCloseIcon size={12} animate="hover" />
                        </button>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setSearchOpen(true);
                        window.setTimeout(() => searchInputRef.current?.focus(), 60);
                      }}
                      aria-label={pickLang(lang, { es: 'Buscar', ca: 'Cercar', en: 'Search' })}
                      className={
                        isMusicWorld
                          ? 'w-7 h-7 sm:w-8 sm:h-8 rounded-full hover:bg-[#3B82F6]/18 flex items-center justify-center text-slate-200 hover:text-[#93C5FD] cursor-pointer active:scale-95 transition-all'
                          : `min-w-11 min-h-11 rounded-2xl border flex items-center justify-center cursor-pointer active:scale-95 transition-all ${
                              searchValue.trim().length > 0
                                ? 'bg-[#7C3AED]/20 border-[#7C3AED]/50 text-[#C4A7FF]'
                                : 'bg-[#0D0D12] hover:bg-white/[0.08] border-white/[0.08] text-zinc-200 hover:text-white'
                            }`
                      }
                    >
                      <RiffanSearchIcon size={isMusicWorld ? 14 : 16} animate="hover" />
                    </button>
                  </div>
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
                          ? `w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center cursor-pointer active:scale-95 transition-all ${
                              moreMenuOpen
                                ? 'bg-[#3B82F6]/25 text-[#93C5FD]'
                                : 'hover:bg-[#3B82F6]/18 text-slate-200 hover:text-[#93C5FD]'
                            }`
                          : `min-w-11 min-h-11 rounded-2xl border flex items-center justify-center cursor-pointer active:scale-95 transition-all ${
                              moreMenuOpen
                                ? 'bg-white/[0.12] border-white/20 text-white'
                                : 'bg-[#0D0D12] hover:bg-white/[0.08] border-white/[0.08] text-zinc-200 hover:text-white'
                            }`
                      }
                    >
                      <MoreHorizontal className={isMusicWorld ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
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
                            <Mic className={`w-4 h-4 shrink-0 ${isMusicWorld ? 'text-[#60A5FA]' : 'text-[#A78BFA]'}`} />
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
                            window.dispatchEvent(new CustomEvent('riffan:open-install'));
                          }}
                          className={`w-full min-h-11 px-3 rounded-xl text-left text-xs font-semibold text-zinc-100 flex items-center gap-2.5 cursor-pointer transition-colors ${
                            isMusicWorld ? 'hover:bg-[#3B82F6]/15' : 'hover:bg-[#7C3AED]/15'
                          }`}
                        >
                          <Download className={`w-4 h-4 shrink-0 ${isMusicWorld ? 'text-[#60A5FA]' : 'text-[#38BDF8]'}`} />
                          <span>
                            {pickLang(lang, {
                              es: 'Instalar App (APK · iPhone · Chrome)',
                              ca: 'Instal·lar App (APK · iPhone · Chrome)',
                              en: 'Install App (APK · iPhone · Chrome)',
                            })}
                          </span>
                        </button>
                        <a
                          href="/api/audit/100-points"
                          download="auditoria-riffantv-100-puntos.md"
                          role="menuitem"
                          onClick={() => setMoreMenuOpen(false)}
                          className="w-full min-h-11 px-3 rounded-xl text-left text-xs font-semibold text-zinc-300 hover:text-white hover:bg-white/[0.07] flex items-center gap-2.5 cursor-pointer transition-colors"
                        >
                          <Download className="w-4 h-4 shrink-0 text-emerald-400" />
                          <span>
                            {pickLang(lang, {
                              es: 'Auditoría 100 puntos (.md)',
                              ca: 'Auditoria 100 punts (.md)',
                              en: '100-Point Audit (.md)',
                            })}
                          </span>
                        </a>
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

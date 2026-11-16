import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Search, X } from 'lucide-react';
import type { AppLanguage } from '../../types';
import type { WorldId } from '../../store/useAppStore';
import { pickLang } from '../../utils/i18n';
import { useSwipeBack } from '../../lib/viewTransition';
import { NaimBrandLogo } from '../NaimBrandLogo';
import { AppErrorBoundary } from '../AppErrorBoundary';
import { SkeletonPosterGrid } from '../ui/DesignSystem';

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
  fullHeight?: boolean;
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
  fullHeight = false,
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

  return (
    <div
      {...swipeHandlers}
      className={`w-full flex flex-col world-tint-${world} ${
        fullHeight ? 'flex-1 min-h-0 h-full overflow-hidden' : 'min-h-[calc(100dvh-4rem)] pb-24'
      }`}
    >
      {/* LIGHTWEIGHT WORLD TOP HEADER */}
      <header className="sticky top-0 z-30 shrink-0 bg-[#0B0B0E]/90 backdrop-blur-xl border-b border-white/[0.06] px-2.5 sm:px-4">
        <div className="max-w-6xl mx-auto h-14 flex items-center justify-between gap-2">
          {searchOpen && onSearchChange ? (
            <div className="flex-1 flex items-center gap-2 min-w-0">
              <div className="relative flex-1 min-w-0">
                <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
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
                  className="w-full min-h-11 pl-10 pr-4 rounded-2xl bg-white/[0.07] border border-[#9146FF]/60 text-sm text-white placeholder:text-zinc-400 focus:outline-none"
                />
              </div>
              <button
                type="button"
                onClick={handleCloseSearch}
                aria-label={pickLang(lang, { es: 'Cerrar búsqueda', ca: 'Tancar cerca', en: 'Close search' })}
                className="min-w-12 min-h-12 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center text-zinc-200 cursor-pointer shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-1.5 min-w-0">
                <button
                  type="button"
                  onClick={onBack}
                  aria-label={pickLang(lang, { es: 'Volver', ca: 'Tornar', en: 'Back' })}
                  className="min-w-12 min-h-12 rounded-2xl hover:bg-white/[0.08] active:scale-95 flex items-center justify-center text-white cursor-pointer transition-all shrink-0"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>

                <h2 className="font-display font-extrabold text-base sm:text-lg text-white tracking-tight truncate pl-1">
                  {title}
                </h2>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {headerActions}
                {onSearchChange && (
                  <button
                    type="button"
                    onClick={() => setSearchOpen(true)}
                    aria-label={pickLang(lang, { es: 'Buscar', ca: 'Cercar', en: 'Search' })}
                    className="min-w-12 min-h-12 rounded-2xl bg-white/[0.05] hover:bg-white/[0.11] border border-white/[0.08] flex items-center justify-center text-zinc-100 cursor-pointer active:scale-95 transition-all"
                  >
                    <Search className="w-5 h-5" />
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

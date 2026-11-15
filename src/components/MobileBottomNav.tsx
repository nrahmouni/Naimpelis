import React from 'react';
import { motion } from 'motion/react';
import { Film, Gamepad2, LayoutGrid, MessageSquare, Radio } from 'lucide-react';
import type { AppLanguage } from '../types';
import type { CatalogSection } from './MediaCatalogHub';
import { pickLang } from '../utils/i18n';
import { triggerHaptic } from '../utils/haptics';

interface MobileBottomNavProps {
  lang: AppLanguage;
  mobileTab: string;
  catalogSection: CatalogSection;
  showWatchlistOnly: boolean;
  unreadChatCount: number;
  roomQueueCount: number;
  isChromeHidden: boolean;
  onSelectHome: () => void;
  onSelectMovies: () => void;
  onSelectLive: () => void;
  onSelectGames: () => void;
  onSelectChat: () => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  lang,
  mobileTab,
  catalogSection,
  showWatchlistOnly,
  unreadChatCount,
  roomQueueCount,
  isChromeHidden,
  onSelectHome,
  onSelectMovies,
  onSelectLive,
  onSelectGames,
  onSelectChat,
}) => {
  const isSocialTab = mobileTab === 'chat' || mobileTab === 'room';
  const navItems = [
    {
      id: 'home',
      label: pickLang(lang, { es: 'Explorar', ca: 'Explorar', en: 'Explore' }),
      icon: LayoutGrid,
      isActive: !isSocialTab && !showWatchlistOnly && catalogSection === 'home',
      onSelect: onSelectHome,
    },
    {
      id: 'movies',
      label: pickLang(lang, { es: 'Catálogo', ca: 'Catàleg', en: 'Browse' }),
      icon: Film,
      isActive:
        !isSocialTab &&
        !showWatchlistOnly &&
        (catalogSection === 'movies' ||
          catalogSection === 'vose' ||
          catalogSection === 'series' ||
          catalogSection === 'anime' ||
          catalogSection === 'castellano' ||
          catalogSection === 'catala'),
      onSelect: onSelectMovies,
    },
    {
      id: 'live',
      label: pickLang(lang, { es: 'Directo', ca: 'Directe', en: 'Live' }),
      icon: Radio,
      isActive:
        !isSocialTab &&
        !showWatchlistOnly &&
        (catalogSection === 'tdt' ||
          catalogSection === 'sports' ||
          catalogSection === 'youtube'),
      onSelect: onSelectLive,
    },
    {
      id: 'games',
      label: pickLang(lang, { es: 'Juegos', ca: 'Jocs', en: 'Games' }),
      icon: Gamepad2,
      isActive: !isSocialTab && !showWatchlistOnly && catalogSection === 'games',
      onSelect: onSelectGames,
    },
    {
      id: 'chat',
      label: pickLang(lang, { es: 'Sala', ca: 'Sala', en: 'Room' }),
      icon: MessageSquare,
      isActive: isSocialTab,
      badge: unreadChatCount + roomQueueCount || undefined,
      onSelect: onSelectChat,
    },
  ] as const;

  return (
    <div
      className={`grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] shrink-0 z-30 ${
        isChromeHidden
          ? 'grid-rows-[0fr] opacity-0 pointer-events-none'
          : 'grid-rows-[1fr] opacity-100'
      }`}
    >
      <div className="overflow-hidden">
        <div
          className={`px-2.5 pt-1 pb-[max(0.35rem,env(safe-area-inset-bottom))] bg-gradient-to-t from-[#0B0B0E] via-[#0B0B0E]/92 to-transparent transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            isChromeHidden ? 'translate-y-full' : 'translate-y-0'
          }`}
        >
          <nav
            className="bg-[#141418]/92 backdrop-blur-2xl border border-white/[0.11] rounded-2xl p-1 grid grid-cols-5 gap-0.5 shadow-[0_14px_38px_rgba(0,0,0,0.78),inset_0_1px_0_rgba(255,255,255,0.1)]"
            aria-label={pickLang(lang, {
              es: 'Navegación móvil NAIM CINE',
              ca: 'Navegació mòbil NAIM CINE',
              en: 'NAIM CINE mobile navigation',
            })}
          >
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = item.isActive;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    item.onSelect();
                  }}
                  className={`min-h-[44px] py-1.5 rounded-xl flex flex-col items-center justify-center gap-0.5 relative active:scale-95 transition-colors cursor-pointer ${
                    active ? 'text-white' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="mobile-bottom-nav-pill"
                      transition={{ type: 'spring', stiffness: 460, damping: 34 }}
                      className="absolute inset-0 rounded-xl bg-gradient-to-b from-[#9E5CFF] to-[#7C2AE8] shadow-[0_6px_18px_rgba(145,70,255,0.42),inset_0_1px_0_rgba(255,255,255,0.26)]"
                      aria-hidden="true"
                    />
                  )}
                  <div className="relative z-10 flex items-center justify-center">
                    <Icon
                      className={`w-4 h-4 shrink-0 ${
                        active ? 'text-white' : 'text-zinc-400'
                      }`}
                      strokeWidth={2.2}
                    />
                    {'badge' in item && item.badge ? (
                      <span
                        className={`absolute -top-1.5 -right-2.5 min-w-4 h-4 px-1 rounded-full text-[0.6rem] font-bold flex items-center justify-center tabular-nums shadow-sm ${
                          active
                            ? 'bg-[#0B0B0E] text-white'
                            : 'bg-[#9146FF] text-white'
                        }`}
                      >
                        {item.badge > 9 ? '9+' : item.badge}
                      </span>
                    ) : null}
                  </div>
                  <span
                    className={`relative z-10 text-[0.65rem] leading-none tracking-tight whitespace-nowrap shrink-0 ${
                      active ? 'font-bold text-white' : 'font-medium text-zinc-400'
                    }`}
                  >
                    {item.label}
                  </span>
                </button>
              );
            })}
          </nav>
        </div>
      </div>
    </div>
  );
};
